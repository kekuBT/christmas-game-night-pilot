// S3-MTH-01 (Stage 3 live QA): Math's speed clock must not run while the
// player can't see the question. Real phones, the D3 briefing, Ready taps,
// and fault injection; the server's own measurements are the evidence.
//
//   1. Three phones at the start of play: everyone sees Q1 at once and a
//      1-second answer earns the +20 bracket.
//   2. A phone whose page is hidden when play begins (a background tab or
//      window): Q1 is NOT opened while hidden (its prompt stays unrevealed),
//      opens when the page is shown, and a quick answer still earns +20.
//   3. Lost opens: the first opens never reach the server. The phone asks
//      again instead of sitting on "Getting question 1 of 10…" for good.
//   4. A slow reply: the server got the open but its reply is held 20 s.
//      The question still appears at once (pushed), and +20 is reachable.
//   5. No socket and a slow reply: polling still brings Q1 within seconds.
//
// The server stays the only clock (no client time is sent or trusted); a
// re-sent open never restarts it (tests/math-timing.test.ts).
// Starts ITS OWN server (free port, temp data dir, the gate's build when
// MCHEZO_WEB_DIST is set). Usage: node scripts/check-math-timing.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-math-timing-"));
async function startServer() {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR };
  delete env.NODE_ENV;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  for (let i = 0; i < 120 && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) return { child, port: Number(m[1]) };
    await sleep(250);
  }
  child.kill("SIGKILL");
  throw new Error(`server did not start: ${out.slice(-400)}`);
}
const server = await startServer();
const BASE = `http://localhost:${server.port}`;
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function api(path, { token, body, protocol } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  if (protocol) headers["x-mchezo-protocol"] = String(protocol);
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "Math timing" } });
  const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: host.playerId, token: host.recoveryToken }];
  for (const n of names.slice(1)) {
    const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { roomId: room.roomId, seats };
}
// The current app's protocol (5): a projection read without it is an
// outdated tab, which the server shows every prompt and marks untimed.
const mathGame = async (room, seat) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token, protocol: 5 })).myGames.filter((g) => g.gameId === "math-mayhem").at(-1);

/** A phone on a seat. `hidden()`/`shown()` switch what the page reports as its visibility. */
async function phone(browser, room, seat, setup) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__mzHidden ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !!window.__mzHidden });
  });
  const page = await ctx.newPage();
  if (setup) await setup(page);
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  page.hide = () => page.evaluate(() => { window.__mzHidden = true; document.dispatchEvent(new Event("visibilitychange")); });
  page.show = () => page.evaluate(() => { window.__mzHidden = false; document.dispatchEvent(new Event("visibilitychange")); });
  return page;
}
/** Host starts Math (practice); every phone taps I'm ready, as people do. */
async function startAndReady(room, phones) {
  await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "math-mayhem", official: false } });
  for (const p of phones) {
    const b = p.getByRole("button", { name: /I.?m ready/i });
    await b.waitFor({ timeout: 20000 });
    await b.click();
  }
}
/** Milliseconds until Q1's prompt is on screen (or -1). */
async function q1ShownWithin(page, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.locator("h1.mz-question").count()) return Date.now() - t0;
    await sleep(50);
  }
  return -1;
}
/** Tap Q1's right answer (from the player's own projection); return the server's measured time and points. */
async function answerQ1Right(page, room, seat) {
  const g = await mathGame(room, seat);
  const q = g.questions[0];
  const pct = /^(\d+)% of (\d+)/.exec(String(q.prompt));
  const [a, op, b] = String(q.prompt).replace(/[=?]/g, " ").trim().split(/\s+/);
  const x = Number(a), y = Number(b);
  const v = pct ? (Number(pct[1]) * Number(pct[2])) / 100 : op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
  const idx = q.options.findIndex((o) => Number(o) === v);
  if (idx < 0) throw new Error(`can't solve "${q.prompt}"`);
  await page.locator(".mz-slab:not([disabled])").nth(idx).click();
  for (let i = 0; i < 60; i++) {
    const after = await mathGame(room, seat);
    const ms = after.myAnswerTimes?.[q.id];
    if (ms !== undefined) return { ms, score: after.myScore };
    await sleep(100);
  }
  throw new Error("answer not recorded");
}
const unrevealed = async (room, seat) => (await mathGame(room, seat)).questions?.[0]?.prompt === undefined;

const browser = await launchChromium();
try {
  // 1. Three visible phones at the start of play.
  {
    const room = await makeRoom(["Ada", "Bea", "Cal"]);
    const phones = [];
    for (const s of room.seats) phones.push(await phone(browser, room, s));
    await startAndReady(room, phones);
    const shown = await Promise.all(phones.map((p) => q1ShownWithin(p, 5000)));
    check("start of play: Q1 is on every phone within 1.5 s", shown.every((t) => t >= 0 && t <= 1500), shown.join(", "));
    await sleep(1000);
    const r = await answerQ1Right(phones[0], room, room.seats[0]);
    check("start of play: a 1-second answer is timed under 5 s and earns 120", r.ms < 5000 && r.score === 120, `${r.ms} ms, ${r.score} points`);
    await phones[0].screenshot({ path: screenshotPath("docs/stage3-qa/mth01-q1-locked.png") });
    for (const p of phones) await p.context().close();
  }
  // 2. A hidden page when play begins.
  {
    const room = await makeRoom(["Ada", "Bea"]);
    const ada = await phone(browser, room, room.seats[0]);
    const bea = await phone(browser, room, room.seats[1]);
    // Ada taps Ready, then puts the page away; Bea's Ready starts play.
    await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "math-mayhem", official: false } });
    await ada.getByRole("button", { name: /I.?m ready/i }).click();
    await ada.hide();
    await bea.getByRole("button", { name: /I.?m ready/i }).click();
    await sleep(6000);
    check("hidden page: Q1 is not opened while nobody can see it", await unrevealed(room, room.seats[0]));
    check("hidden page: the other phone is unaffected", (await q1ShownWithin(bea, 2000)) >= 0);
    await ada.show();
    const t = await q1ShownWithin(ada, 5000);
    check("hidden page: Q1 appears as soon as the page is shown", t >= 0 && t <= 1500, `${t} ms`);
    await sleep(1000);
    const r = await answerQ1Right(ada, room, room.seats[0]);
    check("hidden page: the hidden seconds don't count (timed under 5 s, 120 points)", r.ms < 5000 && r.score === 120, `${r.ms} ms, ${r.score} points`);
    await ada.context().close(); await bea.context().close();
  }
  // 3. Lost opens: the first opens never arrive.
  {
    const room = await makeRoom(["Ada", "Bea"]);
    let dropped = 0;
    const ada = await phone(browser, room, room.seats[0], (page) => page.route("**/intents", async (route) => {
      if ((route.request().postData() ?? "").includes('"math-open"') && dropped < 3) { dropped++; await route.abort("connectionreset"); } else await route.continue();
    }));
    const bea = await phone(browser, room, room.seats[1]);
    await startAndReady(room, [ada, bea]);
    const t = await q1ShownWithin(ada, 10000);
    check("lost opens: the phone asks again and Q1 appears (no endless 'Getting question')", t >= 0, `${dropped} opens dropped; shown after ${t} ms`);
    if (t < 0) await ada.screenshot({ path: screenshotPath("docs/stage3-qa/mth01-stuck.png") });
    else {
      await sleep(1000);
      const r = await answerQ1Right(ada, room, room.seats[0]);
      check("lost opens: timed from the open that arrived (under 5 s, 120 points)", r.ms < 5000 && r.score === 120, `${r.ms} ms, ${r.score} points`);
    }
    await ada.context().close(); await bea.context().close();
  }
  // 4. The open arrives but its reply is held for 20 s.
  {
    const room = await makeRoom(["Ada", "Bea"]);
    const ada = await phone(browser, room, room.seats[0], (page) => page.route("**/intents", async (route) => {
      if ((route.request().postData() ?? "").includes('"math-open"')) { const resp = await route.fetch(); await sleep(20000); await route.fulfill({ response: resp }).catch(() => {}); } else await route.continue();
    }));
    const bea = await phone(browser, room, room.seats[1]);
    await startAndReady(room, [ada, bea]);
    const t = await q1ShownWithin(ada, 5000);
    check("slow reply: Q1 still appears at once (it's pushed, not waited for)", t >= 0 && t <= 1500, `${t} ms`);
    await sleep(1000);
    const r = await answerQ1Right(ada, room, room.seats[0]);
    check("slow reply: +20 stays reachable", r.ms < 5000 && r.score === 120, `${r.ms} ms, ${r.score} points`);
    await ada.context().close(); await bea.context().close();
  }
  // 5. No socket at all, and the slow reply.
  {
    const room = await makeRoom(["Ada", "Bea"]);
    const ada = await phone(browser, room, room.seats[0], async (page) => {
      await page.routeWebSocket(/.*/, (ws) => ws.close());
      await page.route("**/intents", async (route) => {
        if ((route.request().postData() ?? "").includes('"math-open"')) { const resp = await route.fetch(); await sleep(20000); await route.fulfill({ response: resp }).catch(() => {}); } else await route.continue();
      });
    });
    const bea = await phone(browser, room, room.seats[1]);
    await startAndReady(room, [ada, bea]);
    const t = await q1ShownWithin(ada, 8000);
    check("no socket + slow reply: polling brings Q1 within 4.5 s of play starting", t >= 0 && t <= 4500, `${t} ms`);
    await sleep(1000);
    const r = await answerQ1Right(ada, room, room.seats[0]);
    check("no socket + slow reply: +20 stays reachable", r.ms < 5000 && r.score === 120, `${r.ms} ms, ${r.score} points`);
    await ada.context().close(); await bea.context().close();
  }
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
}
console.log(failures === 0 ? "ALL MATH TIMING CHECKS PASSED" : `${failures} MATH TIMING CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
