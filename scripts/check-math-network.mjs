// Stage 5.1 (S3-MTH-01, revalidated): does a phone lose speed-bonus time it
// could not use? Seven delivery conditions, each in its own room (two phones
// in independent contexts), measured, not assumed:
//   1. the page is hidden when play begins (shown 4 s later);
//   2. visible, but the question-open request is delayed 3 s on the way;
//   3. the server accepts the open but its reply stalls 15 s;
//   4. the socket delivers nothing while HTTP polling continues (and the
//      open's reply also stalls 15 s, so only polling can bring the prompt);
//   5. the first two opens are lost and the phone retries;
//   6. the page is reloaded mid-question (the clock must not restart);
//   7. normal fast delivery, with the +20 / +10 / +0 brackets checked.
// Recorded for each: the server's open time (from the open reply), when the
// phone could first tap an answer (same machine clock), when it tapped, the
// server's measured time and the points awarded. "Lost" = time the server
// clock ran before the phone could answer. No client time is ever sent.
// Starts ITS OWN server. Usage: node scripts/check-math-network.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
const DATA = mkdtempSync(join(tmpdir(), "mz-mathnet-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function api(path, { token, body, protocol } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  if (protocol) headers["x-mchezo-protocol"] = String(protocol);
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom() {
  const room = await api("/rooms", { body: { name: "Math network" } });
  const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: "Ada", asHost: true, hostClaimToken: room.hostClaimToken } });
  const bea = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: "Bea" } });
  return { roomId: room.roomId, seats: [{ playerId: host.playerId, token: host.recoveryToken }, { playerId: bea.playerId, token: bea.recoveryToken }] };
}
const mathGame = async (room, seat) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token, protocol: 5 })).myGames.filter((g) => g.gameId === "math-mayhem").at(-1);
const solve = (prompt) => {
  const pct = /^(\d+)% of (\d+)/.exec(String(prompt));
  const [a, op, b] = String(prompt).replace(/[=?]/g, " ").trim().split(/\s+/);
  const x = Number(a), y = Number(b);
  return pct ? (Number(pct[1]) * Number(pct[2])) / 100 : op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
};

const browser = await launchChromium();
/** A phone with controllable delivery: `net` decides what happens to opens and socket frames. */
async function phone(room, seat, net) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__mzHidden ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !!window.__mzHidden });
  });
  const page = await ctx.newPage();
  if (net) {
    net.opened = {}; net.opens = 0;
    await page.routeWebSocket(/.*/, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => server.send(m));
      server.onMessage((m) => { if (!net.wsDrop) ws.send(m); });
    });
    await page.route("**/intents", async (route) => {
      const body = route.request().postData() ?? "";
      if (!body.includes('"math-open"')) return route.continue();
      net.opens += 1;
      if (net.abortFirst && net.opens <= net.abortFirst) return route.abort("connectionfailed");
      try {
        if (net.openDelayMs) await sleep(net.openDelayMs);
        const resp = await route.fetch();
        const text = await resp.text();
        try { const j = JSON.parse(text); if (j.result?.questionId && j.result?.openedAt) net.opened[j.result.questionId] ??= j.result.openedAt; } catch { /* not JSON */ }
        if (net.stallReplyMs) await sleep(net.stallReplyMs);
        await route.fulfill({ response: resp, body: text });
      } catch { /* the page closed while this open was held */ }
    });
  }
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return page;
}
async function start(room, phones, { hiddenAtStart = null } = {}) {
  await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "math-mayhem", official: false } });
  for (const p of phones) { const b = p.getByRole("button", { name: /I.?m ready/i }); await b.waitFor({ timeout: 20000 }); }
  if (hiddenAtStart) await hiddenAtStart.evaluate(() => { window.__mzHidden = true; document.dispatchEvent(new Event("visibilitychange")); });
  for (const p of phones) await p.getByRole("button", { name: /I.?m ready/i }).click();
}
/** When could this phone first tap an answer for question `qi`? (same clock as the server: one machine) */
async function answerableAt(page, room, seat, qi, timeout = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const g = await mathGame(room, seat).catch(() => null);
    const q = g?.questions?.[qi];
    if (q?.prompt && await page.locator("h1.mz-question").count() && (await page.locator("h1.mz-question").innerText()).includes(String(q.prompt).slice(0, 6)) && await page.locator(".mz-slab:not([disabled])").count() >= 2) return { at: Date.now(), q };
    await sleep(40);
  }
  throw new Error(`question ${qi + 1} never became answerable`);
}
async function answer(page, room, seat, q) {
  const v = solve(q.prompt);
  const idx = q.options.findIndex((o) => Number(o) === v);
  const before = (await mathGame(room, seat)).myScore ?? 0;
  const clickAt = Date.now();
  await page.locator(".mz-slab:not([disabled])").nth(idx).click();
  for (let i = 0; i < 100; i++) {
    const g = await mathGame(room, seat);
    const ms = g.myAnswerTimes?.[q.id];
    if (ms !== undefined) return { clickAt, serverMs: ms, points: (g.myScore ?? 0) - before };
    await sleep(80);
  }
  throw new Error("answer not recorded");
}
const rows = [];
async function scenario(label, { net = {}, hidden = false, think = 1000, reload = false, extra } = {}) {
  const room = await makeRoom();
  const pA = await phone(room, room.seats[0], net);
  const pB = await phone(room, room.seats[1]);
  await start(room, [pA, pB], { hiddenAtStart: hidden ? pA : null });
  if (hidden) {
    await sleep(4000);
    check(`${label}: nothing is opened while the page is hidden`, (await mathGame(room, room.seats[0])).questions?.[0]?.prompt === undefined && net.opens === 0, `opens ${net.opens}`);
    await pA.evaluate(() => { window.__mzHidden = false; document.dispatchEvent(new Event("visibilitychange")); });
  }
  const { at, q } = await answerableAt(pA, room, room.seats[0], 0);
  let openedAt = net.opened?.[q.id];
  if (reload) {
    await sleep(1500);
    await pA.reload({ waitUntil: "domcontentloaded" });
    await answerableAt(pA, room, room.seats[0], 0);
    check(`${label}: a reload never restarts the server's clock (one open time)`, net.opened[q.id] === openedAt, `${net.opened[q.id]} vs ${openedAt}`);
  }
  await sleep(think);
  const r = await answer(pA, room, room.seats[0], q);
  openedAt ??= r.clickAt - r.serverMs; // if the open reply was never seen, derive it from the server's own measure
  const row = { label, openedAt, answerableMs: at - openedAt, clickMs: r.clickAt - openedAt, serverMs: r.serverMs, points: r.points };
  rows.push(row);
  if (extra) await extra({ room, pA, row });
  await pA.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await pA.context().close(); await pB.context().close();
  return row;
}

try {
  const s1 = await scenario("1 hidden at start", { hidden: true });
  check("1 hidden at start: the phone can answer within 1.5 s of the server opening it", s1.answerableMs <= 1500, `${s1.answerableMs} ms`);
  check("1 hidden at start: a 1 s answer earns 120 (+20)", s1.points === 120, `${s1.points}`);
  const s2 = await scenario("2 open request delayed 3 s", { net: { openDelayMs: 3000 } });
  check("2 delayed open: the clock starts when the server opens it, not when the phone asked", s2.answerableMs <= 1500, `${s2.answerableMs} ms`);
  check("2 delayed open: +20 still reachable", s2.points === 120, `${s2.points}`);
  const s3 = await scenario("3 open accepted, reply stalls 15 s", { net: { stallReplyMs: 15000 } });
  check("3 stalled reply: the prompt still arrives (pushed) within 1.5 s of the open", s3.answerableMs <= 1500, `${s3.answerableMs} ms`);
  check("3 stalled reply: +20 still reachable", s3.points === 120, `${s3.points}`);
  const s4 = await scenario("4 socket silent + reply stalls 15 s (polling only)", { net: { wsDrop: true, stallReplyMs: 15000 } });
  check("4 polling only: the prompt arrives within one poll (≤ 3 s)", s4.answerableMs <= 3000, `${s4.answerableMs} ms`);
  check("4 polling only: a 1 s answer still earns +20 (the poll's delay is within the 5 s bracket)", s4.points === 120, `${s4.points}`);
  const s5 = await scenario("5 first two opens lost, phone retries", { net: { abortFirst: 2 } });
  check("5 retries: the open lands and the clock starts then (≤ 1.5 s to answerable)", s5.answerableMs <= 1500, `${s5.answerableMs} ms`);
  check("5 retries: +20 still reachable", s5.points === 120, `${s5.points}`);
  const s6 = await scenario("6 reload mid-question", { reload: true });
  check("6 reload: the time before the reload still counts (the clock is not reset)", s6.serverMs >= 1500 + 1000, `${s6.serverMs} ms`);
  // 7. Normal delivery and the brackets: +20 within 5 s, +10 within 10 s, +0 after.
  await scenario("7 normal, answered at ~1 s", {
    extra: async ({ room, pA }) => {
      const seat = room.seats[0];
      for (const [qi, think, want] of [[1, 6000, 110], [2, 11000, 100]]) {
        await pA.getByRole("button", { name: "Next question" }).click();
        const { q } = await answerableAt(pA, room, seat, qi);
        await sleep(think);
        const r = await answer(pA, room, seat, q);
        rows.push({ label: `7 normal, answered at ~${think / 1000} s`, openedAt: null, answerableMs: null, clickMs: null, serverMs: r.serverMs, points: r.points });
        check(`7 brackets: an answer at ${r.serverMs} ms earns ${want}`, r.points === want, `${r.points}`);
      }
    },
  });
  check("7 normal: a 1 s answer earns 120 (+20)", rows.find((x) => x.label === "7 normal, answered at ~1 s")?.points === 120);
  console.log("MATH TIMING TABLE");
  console.log("| condition | answerable after open (ms) | tapped after open (ms) | server measured (ms) | points |");
  for (const r of rows) console.log(`| ${r.label} | ${r.answerableMs ?? "—"} | ${r.clickMs ?? "—"} | ${r.serverMs} | ${r.points} |`);
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "MATH NETWORK ALL PASSED" : `MATH NETWORK FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
