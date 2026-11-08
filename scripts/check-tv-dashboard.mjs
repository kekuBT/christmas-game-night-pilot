// Stage 3 live QA, P2: what the TV and the results say.
//   S3-TV-06  Math Mayhem has a live TV view (clock, who's in, how many have
//             started; no scores or answers while it plays) and ends on its
//             own ranked standings.
//   S3-TV-02  Word Connections' TV ends on the game's standings, not only
//             the solution.
//   S3-WCN-01 Word Connections results explain the score; your breakdown
//             adds up to your recorded score (the audit's 420 and 400).
//   S3-WCN-02 "1 mistake left", not "1 mistakes left".
// Starts ITS OWN server (test content mode). Usage: node scripts/check-tv-dashboard.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { connectionsBoard } from "./lib/content-oracle.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-tv-dash-"));
async function startServer() {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR, MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
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
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "TV dashboard" } });
  const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: host.playerId, token: host.recoveryToken }];
  for (const n of names.slice(1)) {
    const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
const myGame = async (room, seat, gid) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid);
async function startPlaying(room, gameId) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  for (let i = 0; i < 40; i++) { if ((await myGame(room, room.seats[0], gid))?.status === "playing") return gid; await sleep(200); }
  throw new Error("play did not begin");
}
async function spectate(browser, code) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
  return page;
}
async function phoneFor(browser, room, seat) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return page;
}
const solve = (prompt) => {
  const pct = /^(\d+)% of (\d+)/.exec(prompt);
  if (pct) return (Number(pct[1]) * Number(pct[2])) / 100;
  const [a, op, b] = prompt.replace(/[=?]/g, " ").trim().split(/\s+/);
  const x = Number(a), y = Number(b);
  return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
};

const browser = await launchChromium();
try {
  // ---- S3-TV-06: Math Mayhem on the TV
  {
    const room = await makeRoom(["Ada", "Bea"]);
    const tv = await spectate(browser, room.code);
    const gid = await startPlaying(room, "math-mayhem");
    const live = tv.getByTestId("tv-live-math-mayhem");
    await live.waitFor({ timeout: 20000 });
    let text = await live.innerText();
    check("Math TV live: the game, its mode and who's in it", /Math Mayhem/.test(text) && /Practice/.test(text) && /Ada/.test(text) && /Bea/.test(text), text.replace(/\n/g, " | "));
    check("Math TV live: how many have started, and how it's timed", /0 of 2 have started/.test(text) && /timed from when the game sends it/.test(text), text.replace(/\n/g, " | "));
    // Ada answers everything right; Bea answers three, then the game waits on her.
    for (const [si, n] of [[0, 10], [1, 3]]) {
      const s = room.seats[si];
      const g = await myGame(room, s, gid);
      for (const q of g.questions.slice(0, n)) {
        const o = await intent(room, s, gid, "math-open", { questionId: q.id });
        const idx = o.result.options.findIndex((x) => Number(x) === solve(o.result.prompt));
        await intent(room, s, gid, "submit-math-answer", { questionId: q.id, chosenIndex: idx });
      }
    }
    // The TV updates by push or its 2 s poll; give it up to 10 s under load.
    for (let i = 0; i < 50 && !/2 of 2 have started/.test(text); i++) { await sleep(200); text = await live.innerText(); }
    const shown = await tv.evaluate(() => document.body.innerText);
    check("Math TV live: counts update (2 of 2 have started)", /2 of 2 have started/.test(text), text.replace(/\n/g, " | "));
    check("Math TV live: no scores while it plays", !/\b1,?[0-9]{3}\b|points/.test(text) && !(shown.includes("Ada: ") && shown.includes("Bea: ")));
    await tv.screenshot({ path: screenshotPath("docs/stage3-qa/tv06-math-live.png") });
    // Bea finishes; the TV ends on Math's own standings.
    const g = await myGame(room, room.seats[1], gid);
    for (const q of g.questions.slice(3)) {
      const o = await intent(room, room.seats[1], gid, "math-open", { questionId: q.id });
      await intent(room, room.seats[1], gid, "submit-math-answer", { questionId: q.id, chosenIndex: o.result.options.findIndex((x) => Number(x) !== solve(o.result.prompt)) });
    }
    const st = tv.getByTestId("tv-last-standings");
    await st.waitFor({ timeout: 20000 });
    const rows = await st.locator("li").allInnerTexts();
    check("Math TV after the finish: ranked standings for both players", rows.length === 2 && /^1\s*\n?.*Ada/s.test(rows[0]) && /^2/.test(rows[1].trim()), JSON.stringify(rows));
    await tv.screenshot({ path: screenshotPath("docs/stage3-qa/tv06-math-standings.png") });
    await tv.context().close();
  }
  // ---- Word Connections: S3-WCN-02, S3-WCN-01, S3-TV-02
  {
    const room = await makeRoom(["Ada", "Bea"]);
    const tv = await spectate(browser, room.code);
    const gid = await startPlaying(room, "word-connections");
    const g = await myGame(room, room.seats[0], gid);
    const tiles = g.state.tiles;
    const groups = connectionsBoard(tiles.map((t) => t.text));
    const idsOf = (words) => words.map((w) => tiles.find((t) => t.text === w).id);
    const wrong = (k) => idsOf([groups[0].words[0], groups[1].words[k], groups[2].words[k], groups[3].words[k]]);
    // Bea: three mistakes first, then her phone must say "1 mistake left".
    for (const k of [0, 1, 2]) await intent(room, room.seats[1], gid, "connections-guess", { tileIds: wrong(k + 1 > 3 ? 1 : k + 1) });
    const bea = await phoneFor(browser, room, room.seats[1]);
    await bea.locator(".mz-cx-status").waitFor({ timeout: 20000 });
    const aria = await bea.locator(".mz-cx-status").getAttribute("aria-label");
    check("S3-WCN-02: one left reads '1 mistake left'", aria === "1 mistake left", aria);
    await bea.context().close();
    for (const grp of groups) await intent(room, room.seats[1], gid, "connections-guess", { tileIds: idsOf(grp.words) });
    // Ada: one mistake, then all four.
    await intent(room, room.seats[0], gid, "connections-guess", { tileIds: wrong(1) });
    for (const grp of groups) await intent(room, room.seats[0], gid, "connections-guess", { tileIds: idsOf(grp.words) });
    for (let i = 0; i < 30 && (await myGame(room, room.seats[0], gid)).status !== "finished"; i++) await sleep(200);
    const done = await myGame(room, room.seats[0], gid);
    check("Word Connections: recorded scores are the audit's 420 and 400", done.rawScores[room.seats[0].playerId] === 420 && done.rawScores[room.seats[1].playerId] === 400, JSON.stringify(done.rawScores));
    // S3-WCN-01 on each phone.
    for (const [si, want] of [[0, "4 groups × 100 = 400, +20 for one mistake = 420"], [1, "4 groups × 100 = 400, no bonus (3 mistakes) = 400"]]) {
      const p = await phoneFor(browser, room, room.seats[si]);
      await p.getByTestId("mz-cx-howscore").waitFor({ timeout: 20000 });
      const how = await p.getByTestId("mz-cx-howscore").innerText();
      check(`S3-WCN-01: ${room.seats[si].name}'s results explain the score and add up (${want.split("= ").at(-1)})`, /100 points for each group/.test(how) && how.includes(`You: ${want}.`), how.replace(/\n/g, " | "));
      if (si === 0) await p.screenshot({ path: screenshotPath("docs/stage3-qa/wcn01-results.png"), fullPage: true });
      await p.context().close();
    }
    // S3-TV-02 on the TV.
    const tvSt = tv.getByTestId("mz-cx-tv-standings");
    await tvSt.waitFor({ timeout: 20000 });
    const rows = await tvSt.locator("li").allInnerTexts();
    check("S3-TV-02: the TV ends on the standings (420 above 400) as well as the solution", rows.length === 2 && /420/.test(rows[0]) && /400/.test(rows[1]) && (await tv.locator(".mz-cx-bands").count()) === 1, JSON.stringify(rows));
    await tv.screenshot({ path: screenshotPath("docs/stage3-qa/tv02-connections-standings.png"), fullPage: true });
    await tv.context().close();
  }
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
}
console.log(failures === 0 ? "ALL TV DASHBOARD CHECKS PASSED" : `${failures} TV DASHBOARD CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
