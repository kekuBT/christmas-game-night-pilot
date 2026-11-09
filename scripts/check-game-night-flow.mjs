// Stage 5 (S5-B): from one game to the next, with the host in control.
//   - Before the first game: guests get one line on how the night works.
//   - Everyone sees whether the host's pick fits the people here; a guest
//     whose game needs more players is told so (and the code to share).
//   - After a game: everyone's lobby says the last game ended, who won and
//     their own place, from the recorded scores; the TV says what's next.
//   - Nothing starts by itself; the host's next start brings everyone to the
//     briefing; a reload keeps it all.
// Practice games, isolated server, no content test mode.
// Starts ITS OWN server. Usage: node scripts/check-game-night-flow.mjs
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
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-flow-"));
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
const NAMES = ["Keku", "Amina", "Baraka"];
const room = await api("/rooms", { body: { name: "Game night flow" } });
const seats = [];
{
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  seats.push({ name: NAMES[0], playerId: h.playerId, token: h.recoveryToken });
  for (const n of NAMES.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
}
const intent = (seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
const solve = (prompt) => { const pct = /^(\d+)% of (\d+)/.exec(prompt); if (pct) return (Number(pct[1]) * Number(pct[2])) / 100; const [a, op, b] = prompt.replace(/[=?]/g, " ").trim().split(/\s+/); const x = Number(a), y = Number(b); return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y; };
const browser = await launchChromium();
async function phone(seat, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await p.getByRole("heading", { name: `You’re in, ${seat.name}.` }).waitFor({ timeout: 15000 });
  return p;
}
const games = () => api(`/rooms/${room.roomId}/projection?audience=tv`).then((p) => p.games);

try {
  const host = await phone(seats[0], 390);
  const amina = await phone(seats[1], 375);
  const baraka = await phone(seats[2], 430);
  // ---- Before the first game.
  check("first time: a guest gets one line on how the night works", /picks a game[\s\S]*I’m ready[\s\S]*starts together/.test(await amina.getByTestId("first-time-help").innerText()));
  check("first time: the host doesn't (they're the one picking)", (await host.getByTestId("first-time-help").count()) === 0);
  // ---- The host's pick needs more players than are here.
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-caption-clash").click();
  await soon("fit: everyone sees that Caption Clash needs 1 more player", async () => (await Promise.all([host, amina, baraka].map((p) => p.getByTestId("up-next-fit").innerText()))).every((t) => /Needs 1 more player · 3 here/.test(t)));
  await soon("guest dock: says the game needs 1 more player before Keku can start it, with the code", async () => { const t = await amina.getByTestId("dock-guest-note").innerText(); return /needs 1 more player before Keku can start it/.test(t) && t.includes(room.joinCode); });
  await amina.screenshot({ path: screenshotPath("docs/stage5/after/flow-needs-more-375.png") });
  // ---- A pick that fits; Practice.
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-math-mayhem").click();
  await host.getByTestId("mode-practice").click();
  await soon("fit: Math Mayhem fits the 3 here, on a guest's phone", async () => /Fits the 3 here/.test(await baraka.getByTestId("up-next-fit").innerText()));
  await soon("guest dock: waiting for Keku to start Math Mayhem, Practice", async () => /Waiting for Keku to start Math Mayhem · Practice, no Cup points/.test(await baraka.getByTestId("dock-guest-note").innerText()));
  // ---- Play it (answers through each seat's session), then everyone back to the lobby.
  await host.getByTestId("start-practice-math-mayhem").click();
  for (const p of [host, amina, baraka]) await p.getByTestId("briefing").waitFor({ timeout: 15000 });
  const gid = (await games()).at(-1).id;
  for (const s of seats) await intent(s, gid, "briefing-ready", { ready: true });
  const right = [10, 6, 3];
  const qs = [];
  for (const s of seats) qs.push((await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((g) => g.id === gid).questions);
  for (let k = 0; k < 10; k++) for (const [i, s] of seats.entries()) {
    const o = await intent(s, gid, "math-open", { questionId: qs[i][k].id });
    await intent(s, gid, "submit-math-answer", { questionId: qs[i][k].id, chosenIndex: o.result.options.findIndex((x) => (k < right[i] ? Number(x) === solve(o.result.prompt) : Number(x) !== solve(o.result.prompt))) });
  }
  for (const p of [host, amina, baraka]) await p.getByTestId("show-results").waitFor({ timeout: 20000 });
  const before = (await games()).length;
  for (const p of [host, amina, baraka]) await p.getByTestId("show-back-to-lobby").click();
  // ---- After the game: everyone's lobby says how it went.
  await soon("after: the last game's card, with the winner, on every phone", async () => (await Promise.all([host, amina, baraka].map((p) => p.getByTestId("last-game-card").innerText()))).every((t) => /Last game · Math Mayhem · Practice/i.test(t) && /Keku wins/.test(t)));
  check("after: Amina's own place and points, from the recorded scores", /You came 2nd of 3 · \d+ points/.test(await amina.getByTestId("last-game-you").innerText()), await amina.getByTestId("last-game-you").innerText());
  check("after: Baraka's own place", /You came 3rd of 3/.test(await baraka.getByTestId("last-game-you").innerText()));
  check("after: the first-time line is gone once a game has finished", (await amina.getByTestId("first-time-help").count()) === 0);
  await amina.screenshot({ path: screenshotPath("docs/stage5/after/flow-last-game-375.png") });
  // ---- The host picks the next game; nothing starts by itself.
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-trivia").click();
  await soon("next: guests see the host's next pick", async () => /Trivia/.test(await amina.getByTestId("up-next-card").innerText()));
  await sleep(4000);
  check("next: no game starts by itself", (await games()).length === before, `${(await games()).length} games`);
  // ---- A reload keeps the lobby's story.
  await amina.reload({ waitUntil: "domcontentloaded" });
  await soon("reload: Amina's lobby still has the last game and the next pick", async () => /Math Mayhem/i.test(await amina.getByTestId("last-game-card").innerText()) && /Trivia/.test(await amina.getByTestId("up-next-card").innerText()), 20000);
  // ---- The host starts it: everyone goes to the briefing.
  await host.getByTestId("mode-practice").click();
  await host.getByTestId("start-practice-trivia").click();
  await soon("start: every phone moves to the next briefing", async () => (await Promise.all([host, amina, baraka].map((p) => p.getByTestId("briefing").count()))).every((n) => n === 1));
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "GAME NIGHT FLOW ALL PASSED" : `GAME NIGHT FLOW FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
