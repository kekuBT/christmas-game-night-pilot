// Stage 5.1 (O-02): a typed answer belongs to ONE question, round, phase and
// game. Four players in independent contexts play, through the real UI:
//   1. Category Sprint, three rounds: round 1's answers never appear in
//      round 2; a send that fails keeps the words IN THE SAME round (and a
//      retry doesn't count twice); words typed but never sent in round 3 are
//      not carried into the next game.
//   2. Impostor: the clue box starts empty (not the last Sprint words); the
//      impostor's final-guess box starts empty (not their own clue).
//   3. Closest Wins: a number typed but not sent on question 1 is not
//      carried into question 2; a blank number can't be sent (no "0").
// Starts ITS OWN server (time scale 0.4). Usage: node scripts/check-input-isolation.mjs
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
const DATA = mkdtempSync(join(tmpdir(), "mz-iso-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, MCHEZO_LIFECYCLE_SCALE: "0.4" };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function call(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function api(path, opts) { const r = await call(path, opts); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; }
const NAMES = ["Keku", "Amina", "Baraka", "Wanjiru"];
const room = await api("/rooms", { body: { name: "Input isolation" } });
const seats = [];
{
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  seats.push({ name: NAMES[0], playerId: h.playerId, token: h.recoveryToken });
  for (const n of NAMES.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
}
const send = (i, gid, action, payload) => api(`/rooms/${room.roomId}/intents`, { token: seats[i].token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
const mine = async (i) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seats[i].token })).myGames.at(-1);
async function practice(gameId) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: seats[0].token, body: { gameId, official: false } });
  for (const [i] of seats.entries()) await send(i, gid, "briefing-ready", { ready: true });
  return gid;
}
const browser = await launchChromium();
async function phone(seat) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return p;
}
const backToLobby = async (pages) => { for (const p of pages) { const b = p.getByTestId("show-back-to-lobby").or(p.getByRole("button", { name: "Back to lobby" })); if (await b.first().isVisible().catch(() => false)) await b.first().click().catch(() => {}); } };

try {
  const pages = [];
  for (const s of seats) pages.push(await phone(s));
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  const amina = pages[1];
  const sprintBox = amina.getByPlaceholder("e.g. Paris, Rome, Madrid");
  const roundOf = async (i) => (await mine(i)).state?.roundIndex ?? -1;

  // ---- 1. Category Sprint.
  const sg = await practice("category-sprint");
  await sprintBox.waitFor({ timeout: 20000 });
  await sprintBox.fill("school, desk, chalk");
  await amina.getByRole("button", { name: "Submit answers" }).click();
  await soon("Sprint round 1: Amina's answers reach the server, and her phone shows them as in (from the server)", async () => JSON.stringify((await mine(1)).state?.mySubmission) === JSON.stringify(["school", "desk", "chalk"]) && /Your answers are in: school, desk, chalk/.test(await amina.getByTestId("sprint-mine").innerText()));
  check("Sprint: other players' answers are never in Amina's view", !JSON.stringify(await mine(1)).includes("apple"));
  for (const i of [0, 2, 3]) await send(i, sg, "sprint-answers", { answers: ["apple"] }).catch(() => {});
  await soon("Sprint: round 2 opens", async () => (await roundOf(1)) === 1, 20000);
  await soon("Sprint round 2: the answer box is empty (round 1's words are not carried over)", async () => (await sprintBox.inputValue()) === "", 6000);
  await amina.screenshot({ path: screenshotPath("docs/stage5-qa/after/iso-sprint-round2-390.png") });
  // A failed send keeps the words in the same round; the retry counts once.
  await sprintBox.fill("wheels, cart");
  await amina.route("**/intents", (r) => r.abort("internetdisconnected"));
  await amina.getByRole("button", { name: "Submit answers" }).click();
  await soon("Sprint round 2: a send that fails says so", async () => /couldn’t confirm/.test(await amina.getByTestId("mz-send-error").innerText()), 10000);
  check("Sprint round 2: the words stay in the box after the failed send", (await sprintBox.inputValue()) === "wheels, cart");
  check("Sprint round 2: after the failed send nothing shows as in", (await amina.getByTestId("sprint-mine").count()) === 0 && (await mine(1)).state?.mySubmission === undefined);
  await amina.unroute("**/intents");
  await amina.getByRole("button", { name: "Submit answers" }).click();
  await soon("Sprint round 2: the retry is in, once", async () => JSON.stringify((await mine(1)).state?.mySubmission) === JSON.stringify(["wheels", "cart"]));
  const again = await send(1, sg, "sprint-answers", { answers: ["wheels", "cart"] }).catch((e) => ({ accepted: false, reason: String(e) }));
  check("Sprint round 2: a second send for the same round is refused (it can't count twice)", again.accepted === false, JSON.stringify(again));
  for (const i of [0, 2, 3]) await send(i, sg, "sprint-answers", { answers: ["apple"] }).catch(() => {});
  await soon("Sprint: round 3 opens", async () => (await roundOf(1)) === 2, 20000);
  await soon("Sprint round 3: the answer box is empty", async () => (await sprintBox.inputValue()) === "", 6000);
  // Round 3: typed but never sent; the round ends at its deadline.
  await sprintBox.fill("unsent words");
  for (const i of [0, 2, 3]) await send(i, sg, "sprint-answers", { answers: ["apple"] }).catch(() => {});
  await soon("Sprint: the game ends (round 3 closes at its deadline)", async () => (await mine(1)).status === "finished", 30000);
  const sprintScores = (await mine(1)).rawScores ?? {};
  check("Sprint: the retried send counted once (no duplicate answers scored)", Object.values(sprintScores).every((v) => Number.isFinite(v)), JSON.stringify(sprintScores));
  await sleep(800);
  await backToLobby(pages);

  // ---- 2. Impostor.
  const ig = await practice("impostor");
  const clueBox = (p) => p.getByPlaceholder("Your clue (max 140 chars)");
  await clueBox(amina).waitFor({ timeout: 20000 });
  check("Impostor: the clue box starts empty (not the last Sprint words)", (await clueBox(amina).inputValue()) === "", await clueBox(amina).inputValue());
  await amina.screenshot({ path: screenshotPath("docs/stage5-qa/after/iso-impostor-clue-390.png") });
  for (const [i, p] of pages.entries()) { await clueBox(p).waitFor({ timeout: 20000 }); await clueBox(p).fill(`clue from ${NAMES[i]}`); await p.getByRole("button", { name: "Submit clue" }).click(); }
  await soon("Impostor: the vote opens", async () => (await mine(0)).state?.phase === "vote", 30000);
  const roles = await Promise.all(seats.map(async (_, i) => (await mine(i)).state?.role));
  const imp = roles.indexOf("impostor");
  check("Impostor: one impostor found", imp >= 0, JSON.stringify(roles));
  for (const [i] of seats.entries()) {
    const target = i === imp ? seats[(imp + 1) % 4].playerId : seats[imp].playerId;
    await send(i, ig, "impostor-vote", { suspectId: target }).catch(() => {});
  }
  await soon("Impostor: caught, the final guess opens", async () => (await mine(imp)).state?.phase === "guess", 20000);
  const guessBox = pages[imp].getByPlaceholder("Guess the word");
  await guessBox.waitFor({ timeout: 15000 });
  check("Impostor: the final-guess box starts empty (not the impostor's own clue)", (await guessBox.inputValue()) === "", await guessBox.inputValue());
  await pages[imp].screenshot({ path: screenshotPath("docs/stage5-qa/after/iso-impostor-guess-390.png") });
  await send(imp, ig, "impostor-guess", { guess: "nothing" }).catch(() => {});
  await soon("Impostor: the game ends", async () => (await mine(0)).status === "finished", 20000);
  await sleep(800);
  await backToLobby(pages);

  // ---- 3. Closest Wins (its own screen).
  await practice("closest-wins");
  const num = amina.getByTestId("mz-num-input");
  await num.waitFor({ timeout: 20000 });
  await num.fill("");
  check("Closest: a blank number can't be sent (no silent 0)", await amina.getByTestId("mz-num-submit").isDisabled());
  await num.fill("77");
  const q1 = (await mine(1)).state?.prompt;
  for (const i of [0, 2, 3]) await send(i, (await mine(0)).id, "closest-guess", { value: 10 }).catch(() => {});
  await soon("Closest: question 2 opens (Amina never sent question 1)", async () => (await mine(1)).state?.prompt !== q1, 30000);
  await soon("Closest question 2: the number box is back to its start value (77 is not carried over)", async () => (await num.inputValue()) !== "77", 6000);
  await amina.screenshot({ path: screenshotPath("docs/stage5-qa/after/iso-closest-q2-390.png") });
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "INPUT ISOLATION ALL PASSED" : `INPUT ISOLATION FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
