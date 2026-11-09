// Stage 5.1 (O-07, S5-AUD-01): progress indicators say what the server
// recorded, in the right words. Counts only, never who.
//   A. Closest Wins: when a new question opens, the TV says how many have
//      answered THIS question (0 of 3), not how many have played at all.
//   B. Who Said That: a player who has finished, while others still have
//      questions left, is told how many have FINISHED, not "N of N have
//      played so far".
//   C. Majority Rules: an older poll reply that lands after a newer push
//      never rolls the screen back to the earlier step (the source of
//      "older round scores shown for a moment").
// Practice games, real timings, isolated server.
// Starts ITS OWN server. Usage: node scripts/check-progress.mjs
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-progress-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "Progress check" } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: h.playerId, token: h.recoveryToken }];
  for (const n of names.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, joinCode: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
async function practice(room, gameId) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  return gid;
}
const mine = async (room, seat, gid) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid);
const browser = await launchChromium();
async function seatPage(room, seat, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return p;
}

try {
  // ---------- A. Closest Wins: the TV count is for THIS question ----------
  {
    const room = await makeRoom(["Keku", "Amina", "Bartholomew"]);
    const tctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const tv = await tctx.newPage();
    await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await tv.locator(".mz-code__input").fill(room.joinCode);
    await tv.getByTestId("watch-spectator").click();
    await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
    const gid = await practice(room, "closest-wins");
    const ring = () => tv.getByTestId("tv-live-progress").innerText();
    await soon("Closest: the TV shows the live question", async () => (await tv.getByTestId("tv-live-closest-wins").count()) === 1, 15000);
    await soon("Closest question 1: nobody has answered yet → 0 of 3", async () => /\b0 of 3\b/.test(await ring()));
    await intent(room, room.seats[0], gid, "closest-guess", { value: 100 });
    await soon("Closest question 1: one answer in → 1 of 3", async () => /\b1 of 3\b/.test(await ring()));
    for (const s of room.seats.slice(1)) await intent(room, s, gid, "closest-guess", { value: 200 });
    await soon("Closest: everyone answered, question 2 opens", async () => ((await mine(room, room.seats[0], gid)).state?.questionIndex ?? 0) === 1);
    await soon("Closest question 2: the TV says 0 of 3 have answered THIS question (not 3 of 3)", async () => /\b0 of 3\b/.test(await ring()) && /question/i.test(await ring()), 8000);
    console.log(`  TV ring on question 2: "${(await ring()).replace(/\s+/g, " ")}"`);
    await tv.screenshot({ path: screenshotPath("docs/stage5-qa/after/progress-closest-tv-q2-1440.png") });
    await tctx.close();
  }

  // ---------- B. Who Said That: "finished", not "played so far" ----------
  {
    const room = await makeRoom(["Keku", "Amina", "Bartholomew", "Wanjiru"]);
    const gid = await practice(room, "who-said-that");
    const [keku, amina, bart] = room.seats;
    const qs = (await mine(room, keku, gid)).state?.questions ?? [];
    check("Who Said That: the game has questions", qs.length > 1, `${qs.length}`);
    for (const q of qs) await intent(room, keku, gid, "whosaid-answer", { questionId: q.id, chosenIndex: 0 });
    await intent(room, bart, gid, "whosaid-answer", { questionId: qs[0].id, chosenIndex: 0 });
    const p = await seatPage(room, amina);
    const startBtn = p.getByTestId("show-start-playing");
    await Promise.race([startBtn.waitFor({ timeout: 15000 }).then(() => startBtn.click()).catch(() => {}), p.locator(".answer-tile").first().waitFor({ timeout: 15000 }).catch(() => {})]);
    for (let i = 0; i < qs.length; i++) {
      const tile = p.locator(".answer-tile").first();
      await tile.waitFor({ timeout: 10000 });
      const before = await p.locator(".answer-tile").count();
      await tile.click();
      await soon(`Who Said That: Amina's answer ${i + 1} is in`, async () => (await p.locator(".answer-tile").count()) < before || (await p.getByTestId("show-waiting").count()) === 1, 10000);
    }
    await p.getByTestId("show-waiting").waitFor({ timeout: 15000 });
    const text = (await p.getByTestId("show-waiting").innerText()).replace(/\s+/g, " ");
    console.log(`  waiting card: "${text}"`);
    check("Who Said That: the waiting card says 2 of 4 have finished (Keku and Amina; Bartholomew and Wanjiru still have questions)", /\b2 of 4\b[^.]*finished/i.test(text), text);
    check("Who Said That: it doesn't present the started count as if everyone were done", !/\b3 of 4 players\b[^.]*played so far/i.test(text), text);
    check("Who Said That: no names on the waiting card", !/Keku|Bartholomew|Wanjiru/.test(text));
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/progress-whosaid-waiting-390.png") });
    await p.context().close();
  }

  // ---------- C. Majority Rules: an overtaken poll never rolls the screen back ----------
  {
    const room = await makeRoom(["Keku", "Amina", "Bartholomew"]);
    const gid = await practice(room, "majority-rules");
    const [keku, amina, bart] = room.seats;
    const p = await seatPage(room, amina);
    await p.getByTestId("mz-mr-predict-a").click({ timeout: 20000 });
    await p.getByTestId("mz-mr-vote-b").click({ timeout: 10000 });
    await p.getByTestId("mz-mr-wait").waitFor({ timeout: 10000 });
    await intent(room, keku, gid, "majority-predict", { choice: "a" });
    await intent(room, keku, gid, "majority-vote", { choice: "a" });
    await intent(room, bart, gid, "majority-predict", { choice: "b" });
    // Hold the next poll: its reply is fetched now (Bartholomew hasn't voted)
    // and delivered only after the newer state has been pushed and shown.
    let held = null, release;
    const gate = new Promise((r) => { release = r; });
    await p.route(/\/projection\?audience=player/, async (route) => {
      if (held) return route.continue();
      const resp = await route.fetch();
      held = { body: await resp.text(), at: Date.now() };
      await gate;
      await route.fulfill({ response: resp, body: held.body }).catch(() => {});
    });
    await soon("Majority: a poll is in flight and holding the older state", async () => held !== null, 10000);
    check("Majority: the held reply is the older state (still voting)", JSON.parse(held.body).myGames.find((g) => g.id === gid).state.phase !== "reveal");
    await intent(room, bart, gid, "majority-vote", { choice: "a" });
    await soon("Majority: the push shows the reveal", async () => (await p.getByTestId("mz-mr-reveal").count()) === 1, 10000);
    release();
    let rolledBack = false;
    const end = Date.now() + 2500;
    while (Date.now() < end) { if ((await p.getByTestId("mz-mr-wait").count()) > 0 || (await p.getByTestId("mz-mr-reveal").count()) === 0) { rolledBack = true; break; } await sleep(40); }
    check("Majority: after the older reply lands, the screen stays on the reveal (no roll-back to the earlier step)", !rolledBack);
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/progress-majority-no-rollback-390.png") });
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await p.context().close();
  }
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "PROGRESS ALL PASSED" : `PROGRESS FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
