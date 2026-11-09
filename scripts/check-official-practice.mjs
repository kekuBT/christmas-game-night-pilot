// Stage 4, Phase 5C: Official vs Practice. The Family Cup's official
// standings change only when the server permits it, and every screen agrees.
//   - The lobby defaults to Official for an eligible game; a practice-only
//     game offers Practice only and says why.
//   - Refused, standings untouched: an official start of a practice-only
//     game, an official start by a guest, an official start with no
//     approved content left (Category Sprint has no official items), an
//     official start with one player; a guest's score override; an override
//     without a reason.
//   - A practice game finishes, says Practice, and moves nothing; an official
//     game moves the standings exactly as the server computes them (the Cup
//     screen shows the server's order); a second practice game and a host's
//     override of a practice score move nothing.
// Isolated server and data, NO content test mode: nothing provisional is
// treated as approved and nothing is approved. Math Mayhem's questions are
// generated, so it is official-eligible on its own.
// Starts ITS OWN server. Usage: node scripts/check-official-practice.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(250); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-offprac-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
check("the server runs without the content test mode", !/provisional content treated as approved/.test(out));
const BASE = `http://localhost:${port}`;
/** Raw call: { status, body } (never throws on an HTTP error). */
async function call(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function api(path, opts) { const r = await call(path, opts); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; }
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "Official or practice" } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: h.playerId, token: h.recoveryToken }];
  for (const n of names.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
const solve = (prompt) => {
  const pct = /^(\d+)% of (\d+)/.exec(prompt);
  if (pct) return (Number(pct[1]) * Number(pct[2])) / 100;
  const [a, op, b] = prompt.replace(/[=?]/g, " ").trim().split(/\s+/);
  const x = Number(a), y = Number(b);
  return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
};
/** Wait until every seat is connected (a page that just reloaded is briefly "reconnecting"). */
async function allConnected(room) {
  for (let i = 0; i < 80; i++) {
    const p = await api(`/rooms/${room.roomId}/projection?audience=player`, { token: room.seats[0].token });
    if (p.readiness?.connected === room.seats.length) return;
    await sleep(250);
  }
  throw new Error("players did not all reconnect");
}
/** A Math Mayhem game where seat i gets right[i] answers right, answered question by question. */
async function playMath(room, right, official) {
  await allConnected(room);
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "math-mayhem", official } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  const qs = [];
  for (const s of room.seats) qs.push((await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((x) => x.id === gid).questions);
  for (let k = 0; k < qs[0].length; k++) {
    for (const [i, s] of room.seats.entries()) {
      const q = qs[i][k];
      const o = await intent(room, s, gid, "math-open", { questionId: q.id });
      const idx = o.result.options.findIndex((x) => (k < right[i] ? Number(x) === solve(o.result.prompt) : Number(x) !== solve(o.result.prompt)));
      await intent(room, s, gid, "submit-math-answer", { questionId: q.id, chosenIndex: idx });
    }
  }
  return gid;
}
/** What the Cup is, by the server: official standings and championship rows. */
const cupState = async (room) => { const p = await api(`/rooms/${room.roomId}/projection?audience=tv`); return { standings: p.officialStandings ?? {}, championship: (p.championship ?? []).map((r) => [r.playerId, r.total]), games: (p.games ?? []).length }; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function seatPage(browser, room, seat, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);

const browser = await launchChromium();
try {
  const room = await makeRoom(["Keku", "Amina", "Baraka", "Dee"]);
  const [keku, amina, baraka, dee] = room.seats;
  const pages = [];
  for (const [i, s] of room.seats.entries()) pages.push(await seatPage(browser, room, s, [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 430, height: 932 }, { width: 1440, height: 900 }][i]));
  const [hostP, aminaP] = pages;
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${room.seats[i].name}.` }).waitFor({ timeout: 15000 });
  const s0 = await cupState(room);
  check("start: the Cup is empty on the server", Object.keys(s0.standings).length === 0 && s0.championship.length === 0);

  // ---- The lobby's default and a practice-only game.
  await hostP.getByTestId("mode-choice").waitFor({ timeout: 15000 });
  check("default: the host's lobby starts an eligible game as Official", (await hostP.locator('[data-testid^="start-official-"]').count()) === 1, await hostP.locator('[data-testid^="start-"]').first().getAttribute("data-testid"));
  await hostP.getByTestId("choose-game").click();
  await hostP.getByTestId("select-game-charades").click();
  await soon("practice-only: Charades offers Practice only, and says why", async () => (await hostP.getByTestId("mode-official").isDisabled()) && /Practice only/.test(await hostP.getByTestId("practice-only-note").innerText()) && (await hostP.locator('[data-testid="start-practice-charades"]').count()) === 1);
  await hostP.screenshot({ path: screenshotPath("docs/stage4/after/op-practice-only-390.png") });

  // ---- Refusals: the server says no and nothing moves.
  const refused = async (label, r, re) => {
    const after = await cupState(room);
    check(`refused: ${label}`, r.status >= 400 && re.test(`${r.body.error ?? ""} ${r.body.code ?? ""}`), `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    check(`refused: ${label} — standings and games unchanged`, same(after, s0), JSON.stringify(after).slice(0, 160));
  };
  await refused("an official start of a practice-only game (Charades)", await call(`/rooms/${room.roomId}/games`, { token: keku.token, body: { gameId: "charades", official: true } }), /practice-only/i);
  await refused("an official start by a guest", await call(`/rooms/${room.roomId}/games`, { token: amina.token, body: { gameId: "math-mayhem", official: true } }), /Only host\/cohost/);
  await refused("an official Category Sprint with no approved content", await call(`/rooms/${room.roomId}/games`, { token: keku.token, body: { gameId: "category-sprint", official: true } }), /CONTENT_EXHAUSTED|NO_SUITABLE_CATEGORY/);

  // ---- A practice game: says Practice, moves nothing.
  const p1 = await playMath(room, [10, 6, 3, 0], false);
  const pub1 = (await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.find((g) => g.id === p1);
  check("practice: the game finished as practice and does not count", pub1.status === "finished" && pub1.official === false && pub1.outcome?.countsOfficially === false);
  check("practice: the official standings did not move", same(await cupState(room), { ...s0, games: s0.games + 1 }));
  await aminaP.getByTestId("show-results").waitFor({ timeout: 20000 });
  await soon("practice: Amina's results say it doesn't count", async () => (await aminaP.getByTestId("mz-outcome").getAttribute("data-counts")) === "false" && /practice/i.test(await text(aminaP)));
  await aminaP.screenshot({ path: screenshotPath("docs/stage4/after/op-practice-results-375.png"), fullPage: true });
  for (const p of pages) await p.getByTestId("show-back-to-lobby").click();
  await aminaP.goto(`${BASE}/room/cup`, { waitUntil: "domcontentloaded" });
  await soon("practice: the Cup screen is still empty", async () => (await aminaP.getByTestId("cup-empty").count()) === 1);
  await aminaP.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });

  // ---- An official game: the standings move, exactly as the server says.
  const o1 = await playMath(room, [10, 6, 3, 0], true);
  const s1 = await cupState(room);
  check("official: the official standings now have all four players", room.seats.every((s) => typeof s1.standings[s.playerId] === "number") && s1.championship.length === 4, JSON.stringify(s1.standings));
  check("official: the order follows the game (Keku > Amina > Baraka > Dee)", s1.standings[keku.playerId] > s1.standings[amina.playerId] && s1.standings[amina.playerId] > s1.standings[baraka.playerId] && s1.standings[baraka.playerId] > s1.standings[dee.playerId]);
  await aminaP.getByTestId("show-results").waitFor({ timeout: 20000 });
  check("official: Amina's results say it counts", (await aminaP.getByTestId("mz-outcome").getAttribute("data-counts")) === "true");
  await aminaP.screenshot({ path: screenshotPath("docs/stage4/after/op-official-results-375.png"), fullPage: true });
  for (const p of pages) await p.getByTestId("show-back-to-lobby").click();
  await aminaP.goto(`${BASE}/room/cup`, { waitUntil: "domcontentloaded" });
  await aminaP.getByTestId("cup-standings").waitFor({ timeout: 15000 });
  await soon("official: the Cup screen shows the server's order", async () => (await aminaP.locator('[data-testid^="cup-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("cup-row-", "")))).join(",") === s1.championship.map(([id]) => id).join(","));
  check("official: the Cup lists the official game, not the practice one", (await aminaP.getByTestId("cup-games").innerText()).match(/Math Mayhem/g)?.length === 1, (await aminaP.getByTestId("cup-games").innerText()).replace(/\s+/g, " "));
  await aminaP.screenshot({ path: screenshotPath("docs/stage4/after/op-cup-after-official-375.png"), fullPage: true });
  const cupRowsBefore = await aminaP.getByTestId("cup-standings").innerText();

  // ---- More practice, and overrides: nothing official moves unless permitted.
  const p2 = await playMath(room, [0, 3, 6, 10], false);
  check("practice again (reversed scores): the official standings did not move", same((await cupState(room)).standings, s1.standings) && same((await cupState(room)).championship, s1.championship));
  const ov = (token, gid, body) => call(`/rooms/${room.roomId}/games/${gid}/override`, { token, body });
  let r = await ov(amina.token, o1, { playerId: amina.playerId, points: 10000, reason: "I deserve it" });
  check("override: a guest is refused", r.status >= 400 && /Only host\/cohost/.test(r.body.error ?? ""), `${r.status} ${r.body.error}`);
  r = await ov(keku.token, o1, { playerId: dee.playerId, points: 5000, reason: "  " });
  check("override: the host without a reason is refused", r.status >= 400 && /reason is required/.test(r.body.error ?? ""), `${r.status} ${r.body.error}`);
  check("override: after both refusals the standings did not move", same((await cupState(room)).standings, s1.standings));
  r = await ov(keku.token, p2, { playerId: dee.playerId, points: 10000, reason: "Practice correction (test)" });
  check("override: the host may correct a practice score…", r.status === 200, `${r.status} ${JSON.stringify(r.body)}`);
  check("override: …and the official standings still did not move", same((await cupState(room)).standings, s1.standings) && same((await cupState(room)).championship, s1.championship));
  for (const p of pages) { const b = p.getByTestId("show-back-to-lobby"); if (await b.count()) await b.click(); }
  await aminaP.goto(`${BASE}/room/cup`, { waitUntil: "domcontentloaded" });
  await aminaP.getByTestId("cup-standings").waitFor({ timeout: 15000 });
  await soon("the Cup screen reads exactly as before the practice game and the overrides", async () => (await aminaP.getByTestId("cup-standings").innerText()) === cupRowsBefore);

  // ---- One player: Official is refused; the lobby says so and offers Practice.
  const solo = await makeRoom(["Wanjiru"]);
  const soloP = await seatPage(browser, solo, solo.seats[0], { width: 375, height: 667 });
  await soloP.getByRole("heading", { name: "You’re in, Wanjiru." }).waitFor({ timeout: 15000 });
  await soon("one player: the lobby explains Official needs 2 and offers Practice", async () => (await soloP.getByTestId("official-needs-two").count()) === 1 && (await soloP.getByTestId("switch-to-practice").count()) === 1);
  await soloP.screenshot({ path: screenshotPath("docs/stage4/after/op-solo-official-375.png") });
  // Word Connections can be played alone (minimum 1), so the refusal is the Cup's rule, not the game's.
  const rs = await call(`/rooms/${solo.roomId}/games`, { token: solo.seats[0].token, body: { gameId: "word-connections", official: true } });
  check("one player: the server refuses an official Word Connections (OFFICIAL_NEEDS_TWO)", rs.status === 409 && rs.body.code === "OFFICIAL_NEEDS_TWO", `${rs.status} ${rs.body.code}`);
  const soloCup = await cupState(solo);
  check("one player: nothing was created and the Cup is empty", soloCup.games === 0 && Object.keys(soloCup.standings).length === 0);
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "OFFICIAL VS PRACTICE ALL PASSED" : `OFFICIAL VS PRACTICE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
