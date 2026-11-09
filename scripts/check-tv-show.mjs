// Stage 5 (S5-A): the live show on a TV (a spectator, no seat).
//   - One unmistakable label: Lobby / Live / Final standings / Post-game review.
//   - Privacy: Impostor's words and clue texts, and Closest Wins guesses,
//     never appear on the TV while they matter; Math shows counts, not answers.
//   - Director controls are presentation only: pausing animations leaves the
//     server's deadline untouched and the clock still counting; a new game
//     always takes over the screen whatever the operator chose.
//   - Lobby view: join code, everyone's names, up next, tonight so far.
//   - 1920×1080, 1440×900, 1280×720 and 768×1024 without sideways scrolling.
// Practice games, isolated server, no content test mode.
// Starts ITS OWN server. Usage: node scripts/check-tv-show.mjs
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
const DATA = mkdtempSync(join(tmpdir(), "mz-tvshow-"));
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
  const room = await api("/rooms", { body: { name: "TV check" } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: h.playerId, token: h.recoveryToken }];
  for (const n of names.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
async function practice(room, gameId) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  return gid;
}
const mine = async (room, seat, gid) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid);
const pub = async (room, gid) => (await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.find((g) => g.id === gid);
const solve = (prompt) => { const pct = /^(\d+)% of (\d+)/.exec(prompt); if (pct) return (Number(pct[1]) * Number(pct[2])) / 100; const [a, op, b] = prompt.replace(/[=?]/g, " ").trim().split(/\s+/); const x = Number(a), y = Number(b); return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y; };

const browser = await launchChromium();
async function tvFor(code, viewport = { width: 1920, height: 1080 }) {
  const ctx = await browser.newContext({ viewport });
  const tv = await ctx.newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(code);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
  return tv;
}
const mode = (tv) => tv.getByTestId("tv-mode").getAttribute("data-mode");
const text = (tv) => tv.evaluate(() => document.body.innerText);
const noSideways = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);

try {
  // ---- Lobby and viewports.
  const NAMES = ["Keku", "Amina", "Baraka Otieno-Wanjiku", "Wanjiru"];
  const room = await makeRoom(NAMES);
  await api(`/rooms/${room.roomId}/plan`, { token: room.seats[0].token, body: { gameId: "impostor", official: false } });
  const tv = await tvFor(room.code);
  await soon("lobby: the TV says LOBBY", async () => (await mode(tv)) === "lobby" && (await tv.locator('[data-testid="tv-mode"]').count()) === 1);
  const lobbyText = await text(tv);
  check("lobby: the join code, big", (await tv.getByTestId("tv-join-code").innerText()) === room.code);
  check("lobby: everyone's name", NAMES.every((n) => lobbyText.includes(n)));
  await soon("lobby: up next is the host's pick, with its mode", async () => /Impostor/.test(await tv.getByTestId("tv-up-next").innerText()) && /Practice/.test(await tv.getByTestId("tv-up-next").innerText()));
  await sleep(600);
  await tv.screenshot({ path: screenshotPath("docs/stage5/after/tv-lobby-1920.png") });
  for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 768, height: 1024 }]) {
    const t2 = await tvFor(room.code, vp);
    check(`lobby at ${vp.width}×${vp.height}: no sideways scrolling`, await noSideways(t2));
    if (vp.width === 1280) await t2.screenshot({ path: screenshotPath("docs/stage5/after/tv-lobby-1280.png") });
    await t2.context().close();
  }

  // ---- Impostor: secret words and clue texts never on the TV.
  const imp = await practice(room, "impostor");
  await soon("Impostor: the TV goes LIVE", async () => (await mode(tv)) === "live" && (await tv.getByTestId("tv-live-impostor").count()) === 1);
  const words = new Set();
  for (const s of room.seats) { const g = await mine(room, s, imp); if (g?.state?.word) words.add(g.state.word); }
  check("Impostor: the honest players have a secret word (the test has something to look for)", words.size >= 1, [...words].join(","));
  const noWords = async () => { const t = await text(tv); return [...words].every((w) => !t.toLowerCase().includes(String(w).toLowerCase())); };
  check("Impostor live: no secret word on the TV", await noWords());
  await tv.screenshot({ path: screenshotPath("docs/stage5/after/tv-impostor-live-1920.png") });
  const clueText = (i) => `zz-clue-${i}-shiny`;
  for (const [i, s] of room.seats.entries()) await intent(room, s, imp, "impostor-clue", { clue: clueText(i) });
  await soon("Impostor: the TV follows the game to the vote", async () => /Vote/.test(await tv.getByTestId("tv-impostor-phase").innerText()));
  check("Impostor vote: no clue text on the TV (read them on your phones)", !/zz-clue-/.test(await text(tv)) && await noWords());
  for (const s of room.seats) await intent(room, s, imp, "impostor-vote", { suspectId: room.seats.find((x) => x !== s).playerId }).catch(() => {});
  for (const s of room.seats) await intent(room, s, imp, "impostor-guess", { guess: "nothing" }).catch(() => {});
  await soon("Impostor: when it ends the TV shows FINAL STANDINGS", async () => (await mode(tv)) === "final", 20000);
  check("Impostor final: still no secret word on the TV", await noWords());

  // ---- Math Mayhem: live counts only; director controls never touch the clock.
  const room2 = await makeRoom(["Ada", "Bea"]);
  const tv2 = await tvFor(room2.code, { width: 1440, height: 900 });
  const mm = await practice(room2, "math-mayhem");
  await soon("Math: LIVE with how many have started", async () => (await mode(tv2)) === "live" && /0 of 2/.test(await tv2.getByTestId("tv-live-progress").innerText()));
  const before = (await pub(room2, mm)).deadlineAt;
  const clock0 = await tv2.locator(".mz-tvshow-clock").innerText();
  await tv2.getByTestId("tv-dir-pause").click();
  check("director: Pause animations pauses this screen's animations", (await tv2.getByTestId("tv-show").getAttribute("class")).includes("mz-tvshow--paused"));
  await sleep(2600);
  check("director: pausing leaves the server's deadline exactly where it was", (await pub(room2, mm)).deadlineAt === before, `${before}`);
  check("director: the game clock keeps counting while animations are paused", (await tv2.locator(".mz-tvshow-clock").innerText()) !== clock0, clock0);
  await tv2.getByTestId("tv-dir-replay").click();
  check("director: Replay redraws the screen and unpauses it, still LIVE", (await mode(tv2)) === "live" && !(await tv2.getByTestId("tv-show").getAttribute("class")).includes("paused"));
  // Ada answers one question with an unusual right answer; the TV must not show it.
  const g = await mine(room2, room2.seats[0], mm);
  const o = await intent(room2, room2.seats[0], mm, "math-open", { questionId: g.questions[0].id });
  const answer = solve(o.result.prompt);
  await intent(room2, room2.seats[0], mm, "submit-math-answer", { questionId: g.questions[0].id, chosenIndex: o.result.options.findIndex((x) => Number(x) === answer) });
  await soon("Math: the count moves (1 of 2 have started)", async () => /1 of 2/.test(await tv2.getByTestId("tv-live-progress").innerText()));
  check("Math live: no question or answer text on the TV", !(await text(tv2)).includes(o.result.prompt));
  await tv2.screenshot({ path: screenshotPath("docs/stage5/after/tv-math-live-1440.png") });
  for (const [i, s] of room2.seats.entries()) {
    const mg = await mine(room2, s, mm);
    for (const q of mg.questions) {
      if (i === 0 && q.id === g.questions[0].id) continue;
      const oo = await intent(room2, s, mm, "math-open", { questionId: q.id });
      await intent(room2, s, mm, "submit-math-answer", { questionId: q.id, chosenIndex: oo.result.options.findIndex((x) => Number(x) === solve(oo.result.prompt)) * (i === 0 ? 1 : 0) });
    }
  }
  await soon("Math: when it ends the TV shows FINAL STANDINGS with a winner line", async () => (await mode(tv2)) === "final" && (await tv2.getByTestId("tv-winner").count()) === 1);
  check("final: ranked standings for both players", (await tv2.getByTestId("tv-last-standings").locator("li").count()) === 2);
  await sleep(1200);
  await tv2.screenshot({ path: screenshotPath("docs/stage5/after/tv-final-1440.png") });
  if (await tv2.getByTestId("tv-dir-review").count()) {
    await tv2.getByTestId("tv-dir-review").click();
    check("review: labelled POST-GAME REVIEW and says the game is over", (await mode(tv2)) === "review" && /This game is over/.test(await tv2.getByTestId("tv-review").innerText()));
    await tv2.screenshot({ path: screenshotPath("docs/stage5/after/tv-review-1440.png") });
  }
  await tv2.getByTestId("tv-dir-lobby").click();
  await soon("director: Lobby view shows tonight so far, with Math Mayhem", async () => (await mode(tv2)) === "lobby" && /Math Mayhem/.test(await tv2.getByTestId("tv-recent").innerText()));
  // A new game takes over whatever the operator chose.
  await api(`/rooms/${room2.roomId}/games`, { token: room2.seats[0].token, body: { gameId: "math-mayhem", official: false } });
  await soon("a new game's briefing takes over the TV from the lobby view", async () => (await tv2.getByTestId("tv-briefing").count()) === 1, 15000);

  // ---- Closest Wins: the question is public, guesses are not.
  const room3 = await makeRoom(["Ada", "Bea"]);
  const tv3 = await tvFor(room3.code);
  const cw = await practice(room3, "closest-wins");
  await soon("Closest Wins: LIVE with the question everyone is answering", async () => (await mode(tv3)) === "live" && (await tv3.getByTestId("tv-closest-prompt").innerText()).length > 5);
  await intent(room3, room3.seats[0], cw, "closest-guess", { value: 987654 });
  await soon("Closest Wins: the count moves (1 of 2 have guessed)", async () => /1 of 2/.test(await tv3.getByTestId("tv-live-progress").innerText()));
  check("Closest Wins: nobody's guess is on the TV", !/987,?654/.test(await text(tv3)));
  await tv3.screenshot({ path: screenshotPath("docs/stage5/after/tv-closest-live-1920.png") });
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "TV SHOW ALL PASSED" : `TV SHOW FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
