// Stage 4, Phase 5A: a complete four-player Caption Clash, in real browsers,
// each player on their own phone (separate browser contexts), plus a TV.
//   Briefing, writing (with the character limit, server-side too), the
//   "N of 4" counts on every phone and on the TV after every action, voting,
//   every round transition (everyone in, a skip, and the vote deadline),
//   the finished state, final results checked against the server's scores,
//   ties, the TV, a reload, a dropped connection, and a phone reopened from
//   scratch.
//   The audit (Stage 3, Game 7) saw "Your vote ✓" on all four phones while
//   every screen said "2 of 4 have voted", during a server outage. Here a
//   vote and a caption that never reach the server must not look counted.
// Official game, isolated server and data, NO content test mode: Caption
// Clash's legacy scenes are already official-eligible, so nothing
// provisional is treated as approved.
// Starts ITS OWN server. Usage: node scripts/check-caption-4p.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return true; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}

const DATA = mkdtempSync(join(tmpdir(), "mz-cap4-"));
// Time scale 0.5: writing 45 s, voting 22 s (the briefing shows the real 90/45).
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, MCHEZO_LIFECYCLE_SCALE: "0.5" };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
check("the server runs without the content test mode (nothing provisional treated as approved)", !/provisional content treated as approved/.test(out));
const BASE = `http://localhost:${port}`;

async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const NAMES = ["Keku", "Amina", "Baraka", "Wanjiru"];
const room = await api("/rooms", { body: { name: "Caption Clash, four phones" } });
const seats = [];
{
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  seats.push({ name: NAMES[0], playerId: h.playerId, token: h.recoveryToken });
  for (const n of NAMES.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
}
const idOf = Object.fromEntries(seats.map((s) => [s.name, s.playerId]));
/** The server's own view of the game, for one seat. */
const serverGame = async (seat) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token })).myGames?.find((g) => g.gameId === "caption-clash");
const serverState = async () => (await serverGame(seats[0]))?.state ?? {};

const browser = await launchChromium();
async function phone(seat, width, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return page;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const noSideways = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);
/** "N of 4" wherever this page shows the count right now. */
async function shownCount(p) {
  const m = /(\d+) of 4 (?:have written|have voted|done)/.exec(await text(p));
  return m ? Number(m[1]) : null;
}
const WIDTHS = [390, 375, 430, 320];

try {
  const pages = [];
  for (const [i, s] of seats.entries()) pages.push(await phone(s, WIDTHS[i]));
  const [keku, amina, baraka, wanjiru] = pages;
  const byName = { Keku: keku, Amina: amina, Baraka: baraka, Wanjiru: wanjiru };
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  // The TV: a spectator on a laptop-sized screen, no seat.
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tv = await tvCtx.newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.joinCode);
  await tv.getByTestId("watch-spectator").click();
  await sleep(1000);

  // ---- Start: Official, from the host's lobby.
  await keku.getByTestId("choose-game").click();
  await keku.getByTestId("select-game-caption-clash").click();
  await keku.getByTestId("start-official-caption-clash").click();
  await soon("briefing: every phone explains the game before any clock runs", async () => (await Promise.all(pages.map(async (p) => (await p.getByTestId("briefing").count()) === 1 && /Write the funniest caption/.test(await text(p))))).every(Boolean));
  const brief = await text(amina);
  check("briefing: says it is Official", /official/i.test(brief) && !/Practice, no Cup points/.test(brief), brief.replace(/\s+/g, " ").slice(0, 200));
  await amina.screenshot({ path: screenshotPath("docs/stage4/after/caption-01-briefing-375.png") });
  await passBriefing(pages);
  for (const p of pages) await p.getByTestId("mz-cap-write").waitFor({ timeout: 15000 });
  const g0 = await serverGame(seats[0]);
  check("the game is official on the server", g0?.official === true);

  // ---- Round 1, writing.
  const prompt1 = await keku.getByTestId("mz-cap-prompt").innerText();
  check("round 1: all four phones show the same scene", (await Promise.all(pages.map((p) => p.getByTestId("mz-cap-prompt").innerText()))).every((t) => t === prompt1), prompt1);
  await soon("round 1: the TV shows the scene and 0 of 4", async () => (await tv.getByTestId("mz-cap-tv-prompt").innerText()) === prompt1 && (await shownCount(tv)) === 0);
  // Character limit in the box: 160 characters typed, 140 kept, 0 left.
  const long = "A".repeat(150) + "BCDEFGHIJK";
  await keku.getByTestId("mz-cap-input").fill(long);
  check("character limit: the box keeps 140 characters", (await keku.getByTestId("mz-cap-input").inputValue()).length === 140);
  check("character limit: the counter says 0 left", /^0 left$/.test((await keku.locator(".mz-cap-count").innerText()).trim()));
  await keku.keyboard.type("XYZ");
  check("character limit: typing more adds nothing", (await keku.getByTestId("mz-cap-input").inputValue()).length === 140);
  await keku.getByTestId("mz-cap-input").fill("The snowman's two left feet are both carrots");
  check("character limit: the counter counts down", /^\d+ left$/.test((await keku.locator(".mz-cap-count").innerText()).trim()) && Number((await keku.locator(".mz-cap-count").innerText()).match(/\d+/)[0]) === 140 - 44);
  await keku.screenshot({ path: screenshotPath("docs/stage4/after/caption-02-write-390.png") });
  await keku.getByTestId("mz-cap-submit").click();
  await soon("Keku: caption is in, shown back", async () => /two left feet/.test(await keku.getByTestId("mz-cap-mine").innerText()));
  await soon("count 1 of 4 on Keku's phone and the TV", async () => (await shownCount(keku)) === 1 && (await shownCount(tv)) === 1);
  // Server-side limit: a 300-character caption sent past the box is cut to 140.
  const amRes = await amina.evaluate(async (s) => (await fetch(`/rooms/${s.roomId}/intents`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") }, body: JSON.stringify({ intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: s.roomId, gameInstanceId: s.gid, action: "caption-submit", payload: { caption: "Dancing ".repeat(37) + "snowman" } } }) })).json(), { roomId: room.roomId, gid: g0.id });
  check("character limit: the server accepts a long caption only cut to 140", amRes.accepted === true);
  const aminaMine = (await serverGame(seats[1])).state.myCaption ?? "";
  check("character limit: the server stored 140 characters", aminaMine.length === 140, String(aminaMine.length));
  await soon("count 2 of 4 everywhere a count is shown", async () => (await shownCount(keku)) === 2 && (await shownCount(amina)) === 2 && (await shownCount(tv)) === 2);
  // A caption that never reaches the server: the words stay, nothing claims success.
  await baraka.route("**/intents", (r) => r.abort("internetdisconnected"));
  await baraka.getByTestId("mz-cap-input").fill("He melts on the dance floor, literally");
  await baraka.getByTestId("mz-cap-submit").click();
  await soon("a failed caption: the phone says it didn't get through", async () => /didn’t reach the game|didn't reach the game|Check your connection/i.test(await text(baraka)), 12000);
  check("a failed caption: the words are still in the box", (await baraka.getByTestId("mz-cap-input").inputValue()) === "He melts on the dance floor, literally");
  check("a failed caption: no 'caption is in' screen", (await baraka.getByTestId("mz-cap-mine").count()) === 0);
  check("a failed caption: the server has 2 of 4", (await serverState()).submitted === 2);
  check("a failed caption: the TV still says 2 of 4", (await shownCount(tv)) === 2);
  await baraka.screenshot({ path: screenshotPath("docs/stage4/after/caption-03-send-failed-375.png") });
  await baraka.unroute("**/intents");
  // (On a build that loses the words, type them again so the run can go on.)
  if (!(await baraka.getByTestId("mz-cap-input").inputValue())) await baraka.getByTestId("mz-cap-input").fill("He melts on the dance floor, literally");
  await baraka.getByTestId("mz-cap-submit").click();
  await soon("tapping Submit again sends it: 3 of 4", async () => (await baraka.getByTestId("mz-cap-mine").count()) === 1 && (await shownCount(tv)) === 3);
  // The fourth caption ends writing at once: no waiting for the clock.
  await wanjiru.getByTestId("mz-cap-input").fill("Frosty finally found his groove");
  const t4 = Date.now();
  await wanjiru.getByTestId("mz-cap-submit").click();
  await soon("round 1: the fourth caption opens voting on every phone at once", async () => (await Promise.all(pages.map((p) => p.getByTestId("mz-cap-vote").count()))).every((n) => n === 1), 8000);
  check("round 1: voting began well before the writing deadline", Date.now() - t4 < 8000, `${Date.now() - t4}ms`);

  // ---- Round 1, voting.
  for (const [i, p] of pages.entries()) {
    check(`${NAMES[i]}: three captions to vote for, their own marked and disabled`, (await p.locator('[data-testid="mz-cap-option"]').count()) === 3 && (await p.getByTestId("mz-cap-yours").count()) === 1 && await p.getByTestId("mz-cap-yours").isDisabled());
  }
  const voteArea = await amina.locator(".mz-cap-votes").innerText();
  check("voting is anonymous: no names on the cards", !NAMES.some((n) => voteArea.includes(n)));
  await soon("TV: the four captions, anonymous, 0 of 4 done", async () => { const t = await text(tv); return /Vote on your phones/.test(t) && (await shownCount(tv)) === 0 && /two left feet/.test(t) && !NAMES.some((n) => t.includes(`by ${n}`)); });
  await sleep(700); // cards animate in
  await amina.screenshot({ path: screenshotPath("docs/stage4/after/caption-04-vote-375.png") });
  await tv.screenshot({ path: screenshotPath("docs/stage4/after/caption-05-tv-vote-1280.png") });
  const pick = (p, needle) => p.locator('[data-testid="mz-cap-option"]').filter({ hasText: needle });
  // A vote that never reaches the server must not show "Your vote ✓".
  await keku.route("**/intents", (r) => r.abort("internetdisconnected"));
  await pick(keku, "Dancing Dancing").click();
  await soon("a failed vote: the phone says it didn't get through", async () => /didn’t reach the game|didn't reach the game|Check your connection/i.test(await text(keku)), 12000);
  const kekuCards = await keku.locator(".mz-cap-votes").innerText();
  check("a failed vote: no card says 'Your vote ✓'", !/Your vote ✓/i.test(kekuCards), kekuCards.replace(/\n/g, " | ").slice(0, 200));
  check("a failed vote: the cards can still be tapped", await pick(keku, "Dancing Dancing").isEnabled());
  check("a failed vote: the server has no vote from Keku", (await serverGame(seats[0])).state.myVote === undefined && (await serverState()).submitted === 0);
  check("a failed vote: the TV still says 0 of 4", (await shownCount(tv)) === 0);
  await keku.screenshot({ path: screenshotPath("docs/stage4/after/caption-06-vote-failed-390.png") });
  await keku.unroute("**/intents");
  // Plan: round 1 — Keku→Amina, Amina→Baraka, Baraka→Amina, Wanjiru→Amina.
  await pick(keku, "Dancing Dancing").click();
  await soon("Keku's vote is confirmed by the server: ✓ and 1 of 4", async () => /Your vote ✓/i.test(await keku.locator(".mz-cap-votes").innerText()) && (await serverState()).submitted === 1);
  await soon("1 of 4 voted on every phone and the TV", async () => (await Promise.all([...pages, tv].map(shownCount))).every((n) => n === 1));
  await pick(amina, "melts on the dance floor").click();
  await soon("2 of 4 voted on every phone and the TV", async () => (await Promise.all([...pages, tv].map(shownCount))).every((n) => n === 2));
  // Reload mid-vote: Baraka's phone comes back to the same ballot, unvoted.
  await baraka.reload({ waitUntil: "domcontentloaded" });
  await soon("after a reload Baraka is back on the ballot, with no vote shown", async () => (await baraka.getByTestId("mz-cap-vote").count()) === 1 && !/Your vote ✓/i.test(await baraka.locator(".mz-cap-votes").innerText()) && (await shownCount(baraka)) === 2, 20000);
  await pick(baraka, "Dancing Dancing").click();
  await soon("3 of 4 voted on every phone and the TV", async () => (await Promise.all([...pages, tv].map(shownCount))).every((n) => n === 3));
  // A dropped connection: Wanjiru goes offline, sees the banner, comes back.
  await wanjiru.context().setOffline(true);
  await soon("offline: Wanjiru's phone says the connection is lost", async () => /Connection lost/i.test(await text(wanjiru)), 20000);
  await wanjiru.context().setOffline(false);
  await soon("back online: the banner clears or says reconnected", async () => !/Connection lost/i.test(await text(wanjiru)), 30000);
  check("back online: Wanjiru still sees 3 of 4", (await shownCount(wanjiru)) === 3);
  await pick(wanjiru, "Dancing Dancing").click();
  await soon("round 1: the fourth vote moves everyone to round 2", async () => (await Promise.all(pages.map(async (p) => (await p.getByTestId("mz-cap-write").count()) === 1 && /Round 2 of 3/.test(await p.getByTestId("mz-cap-prompt").evaluate((e) => e.closest("section")?.getAttribute("aria-label") ?? ""))))).every(Boolean), 8000);

  // ---- Round 2: last round's favourite (no names); a skip; a reload after writing.
  await soon("round 2: last round's favourite with 3 votes, no author", async () => { const t = await keku.getByTestId("mz-cap-last").innerText(); return /Dancing Dancing/.test(t) && /3 votes/.test(t) && !NAMES.some((n) => t.includes(n)); });
  const prompt2 = await keku.getByTestId("mz-cap-prompt").innerText();
  check("round 2: a new scene", prompt2 !== prompt1, prompt2);
  await keku.screenshot({ path: screenshotPath("docs/stage4/after/caption-07-round2-390.png") });
  await keku.getByTestId("mz-cap-input").fill("Keku round two");
  await keku.getByTestId("mz-cap-submit").click();
  await amina.getByTestId("mz-cap-input").fill("Amina round two");
  await amina.getByTestId("mz-cap-submit").click();
  await soon("round 2: 2 of 4 written", async () => (await shownCount(tv)) === 2 && (await shownCount(keku)) === 2);
  await amina.reload({ waitUntil: "domcontentloaded" });
  await soon("round 2: after a reload Amina still sees her caption", async () => /Amina round two/.test(await amina.getByTestId("mz-cap-mine").innerText()), 20000);
  await baraka.getByRole("button", { name: "Skip this round" }).click();
  await soon("round 2: a skip counts toward the total (3 of 4)", async () => (await shownCount(tv)) === 3 && (await shownCount(baraka)) === 3);
  check("round 2: Baraka's phone says he's sitting this round out", /Sitting this round out/.test(await text(baraka)));
  await wanjiru.getByTestId("mz-cap-input").fill("Wanjiru round two");
  await wanjiru.getByTestId("mz-cap-submit").click();
  await soon("round 2: voting opens with three captions", async () => (await Promise.all(pages.map((p) => p.getByTestId("mz-cap-vote").count()))).every((n) => n === 1), 8000);
  check("round 2: Baraka (no caption) can vote for all three", (await baraka.locator('[data-testid="mz-cap-option"]').count()) === 3 && (await baraka.getByTestId("mz-cap-yours").count()) === 0);
  // Plan: Keku→Wanjiru, Amina→Wanjiru, Baraka→Keku, Wanjiru skips the vote.
  await pick(keku, "Wanjiru round two").click();
  await pick(amina, "Wanjiru round two").click();
  await pick(baraka, "Keku round two").click();
  await soon("round 2: 3 of 4 voted", async () => (await Promise.all([...pages, tv].map(shownCount))).every((n) => n === 3));
  await wanjiru.getByRole("button", { name: "Skip this vote" }).click();
  await soon("round 2: a skipped vote completes the round: round 3 starts", async () => /Round 3 of 3/.test(await keku.getByTestId("mz-cap-prompt").evaluate((e) => e.closest("section")?.getAttribute("aria-label") ?? "")), 8000);

  // ---- Round 3: everyone writes; one player never votes, so the deadline ends it.
  for (const n of NAMES) { await byName[n].getByTestId("mz-cap-input").fill(`${n} round three`); await byName[n].getByTestId("mz-cap-submit").click(); }
  await soon("round 3: voting opens", async () => (await Promise.all(pages.map((p) => p.getByTestId("mz-cap-vote").count()))).every((n) => n === 1), 8000);
  // Plan: Keku→Baraka, Amina→Baraka, Baraka→Wanjiru; Wanjiru doesn't vote.
  await pick(keku, "Baraka round three").click();
  await pick(amina, "Baraka round three").click();
  await pick(baraka, "Wanjiru round three").click();
  await soon("round 3: 3 of 4 voted", async () => (await Promise.all([...pages, tv].map(shownCount))).every((n) => n === 3));
  const vote3At = Date.now();
  await soon("round 3: the vote deadline finishes the game (no freeze at 3 of 4)", async () => (await Promise.all(pages.map((p) => p.getByTestId("mz-cap-results").count()))).every((n) => n === 1), 40000);
  console.log(`  (results ${Math.round((Date.now() - vote3At) / 1000)}s after the third vote; the vote phase is 22 s at this time scale)`);

  // ---- Results, against the server.
  // Expected (25 per caption written, 100 per vote received):
  //   R1 all wrote; Amina 3 votes, Baraka 1.  R2 Keku, Amina, Wanjiru wrote; Wanjiru 2, Keku 1.
  //   R3 all wrote; Baraka 2, Wanjiru 1.
  const expected = { Keku: 25 + 125 + 25, Amina: 325 + 25 + 25, Baraka: 125 + 0 + 225, Wanjiru: 25 + 225 + 125 };
  const fin = await serverGame(seats[0]);
  const raw = fin.rawScores ?? {};
  check("results: the server's scores are 25 per caption + 100 per vote", NAMES.every((n) => raw[idOf[n]] === expected[n]), JSON.stringify(Object.fromEntries(NAMES.map((n) => [n, raw[idOf[n]]]))));
  for (const [i, p] of pages.entries()) {
    const t = await text(p);
    check(`results on ${NAMES[i]}'s phone: every player with the server's score`, NAMES.every((n) => new RegExp(`${n === NAMES[i] ? `(${n}|You)` : n}[\\s\\S]{0,80}?${expected[n].toLocaleString("en-US")}`).test(t)), t.replace(/\s+/g, " ").slice(0, 400));
    check(`results at ${WIDTHS[i]}px: no sideways scrolling`, await noSideways(p));
  }
  const kres = await text(keku);
  check("results: round 1's favourite is credited to its author", /Dancing Dancing[\s\S]{0,40}by Amina/.test(kres));
  check("results: round 2's favourite is credited to its author", /Wanjiru round two[\s\S]{0,40}by Wanjiru/.test(kres));
  check("results: round 3's favourite is credited to its author", /Baraka round three[\s\S]{0,40}by Baraka/.test(kres));
  check("results: how points work is explained", /25 points for writing a caption, 100 for every vote/.test(kres));
  check("results: the game counts officially", fin.outcome?.countsOfficially === true, JSON.stringify(fin.outcome?.note ?? ""));
  await keku.screenshot({ path: screenshotPath("docs/stage4/after/caption-08-results-390.png"), fullPage: true });
  await wanjiru.screenshot({ path: screenshotPath("docs/stage4/after/caption-09-results-320.png"), fullPage: true });
  await soon("TV: the finished favourites, never the authors", async () => { const t = await text(tv); return /Dancing Dancing/.test(t) && !NAMES.some((n) => t.includes(`by ${n}`)); }, 15000);
  await tv.screenshot({ path: screenshotPath("docs/stage4/after/caption-10-tv-final-1280.png"), fullPage: true });

  // ---- Official: the Family Cup records the game; the server's standings.
  const tvProj = await api(`/rooms/${room.roomId}/projection?audience=tv`);
  const cup = tvProj.championship ?? [];
  check("official: the Cup has standings for all four players", NAMES.every((n) => cup.some((r) => r.playerId === idOf[n])), JSON.stringify(cup).slice(0, 300));
  const os = tvProj.officialStandings ?? {};
  check("official: a tie in the game (Amina and Wanjiru, 375 each) is a tie in the standings", os[idOf.Amina] !== undefined && os[idOf.Amina] === os[idOf.Wanjiru], JSON.stringify(Object.fromEntries(NAMES.map((n) => [n, os[idOf[n]]]))));
  check("official: the standings follow the game's order", os[idOf.Amina] > os[idOf.Baraka] && os[idOf.Baraka] > os[idOf.Keku]);
  // Reload on results: the results come back (the game is over; nothing replays).
  await amina.reload({ waitUntil: "domcontentloaded" });
  await soon("reload on results: Amina's results come back", async () => (await amina.getByTestId("mz-cap-results").count()) === 1, 20000);
  // Reopen from scratch: Baraka's phone closes; a new phone opens the seat.
  await baraka.context().close();
  const baraka2 = await phone(seats[2], 375);
  await soon("a phone reopened from scratch returns to the seat (results or lobby)", async () => (await baraka2.getByTestId("mz-cap-results").count()) === 1 || /You’re in, Baraka\./.test(await text(baraka2)), 20000);
  for (const p of [keku, amina, wanjiru]) await p.getByTestId("show-back-to-lobby").click();
  await soon("Back to lobby: Keku is in the lobby", async () => (await keku.getByRole("heading", { name: "You’re in, Keku." }).count()) === 1);
  await keku.getByTestId("room-menu").click().catch(() => {});
  await keku.goto(`${BASE}/room/cup`, { waitUntil: "domcontentloaded" });
  await soon("the Family Cup lists Caption Clash among the official games", async () => /Caption Clash/.test(await keku.getByTestId("cup-games").innerText()), 15000);
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "CAPTION 4P ALL PASSED" : `CAPTION 4P FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
