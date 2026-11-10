// Stage 6.1: Play solo (Math Mayhem), end to end in the browser.
//   - A fresh visitor: Home → Play solo → Start (two taps). No code, no name, no lobby.
//   - Only real solo games are offered (Math Mayhem in this slice).
//   - Three consecutive rounds with Play again: a mixed round, an all-wrong
//     round (the personal best stays), an all-right round (a new best). Each
//     result is its own; the server holds exactly those three rounds.
//   - Polling stops on the results screen and after leaving.
//   - Leaving mid-round (asks first), browser Back mid-round, and a reload
//     mid-round: defined outcomes, no trapped screen, no phantom Rejoin.
//   - A double tap on an answer counts once.
//   - Storage blocked, malformed, or holding another rules version's best:
//     play still works and the screens say what they can't do.
//   - A phone on the home Wi-Fi (plain http, an insecure context with no
//     crypto.randomUUID): a whole round plays and every answer counts.
//   - Keyboard only: a whole round with Tab and Enter; the results focus the
//     score; the leave question focuses Keep playing.
//   - A late answer, after the round's time is up, is refused by the server
//     (own server with a short test clock, MCHEZO_LIFECYCLE_SCALE).
// The round is answered from the prompt itself (the driver computes the sum),
// so it can choose right or wrong answers on purpose.
// Usage: node scripts/check-solo.mjs <baseUrl>   (the gate passes its server)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { launchChromium } from "./lib/driver-env.mjs";
import { plainHttpContext } from "./lib/lan.mjs";
import { slabNumber, solveMath } from "./lib/math-solve.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000, quiet = false) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { if (!quiet) check(label, true); return true; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}

const solve = solveMath;
const numOf = slabNumber;

/** Answer all ten questions; rightFor(i) picks right or wrong. Returns the results screen's numbers. */
async function playRound(page, rightFor, { doubleTapFirst = false } = {}) {
  for (let i = 0; i < 10; i++) {
    const slabs = page.locator(".mz-slab:not([disabled])");
    await soon(`question ${i + 1} shows`, async () => (await page.locator("h1.mz-question").count()) > 0 && (await slabs.count()) === 4, 20000, true);
    const answer = solve(await page.locator("h1.mz-question").innerText());
    const labels = (await slabs.allInnerTexts()).map(numOf);
    const idx = rightFor(i) ? labels.indexOf(answer) : labels.findIndex((v) => v !== answer);
    if (idx < 0) throw new Error(`no ${rightFor(i) ? "right" : "wrong"} option among ${labels} for ${answer}`);
    if (doubleTapFirst && i === 0) await slabs.nth(idx).dblclick();
    else await slabs.nth(idx).click();
    if (i < 9) {
      await page.getByTestId("mz-math-next").waitFor({ timeout: 20000 });
      await page.getByTestId("mz-math-next").click();
    }
  }
  await page.getByTestId("solo-results").waitFor({ timeout: 20000 });
  return {
    score: numOf((await page.getByTestId("solo-score").innerText()).replace(/,/g, "")),
    correct: Number(/^(\d+) of/.exec(await page.getByTestId("solo-correct").innerText())?.[1]),
    pb: await page.getByTestId("solo-pb").innerText().catch(() => ""),
  };
}

const seatOf = async (page) => JSON.parse((await page.evaluate(() => localStorage.getItem("mchezo.solo.v1"))) ?? "null");
async function serverRoom(seat, base = BASE) {
  const r = await fetch(`${base}/rooms/${seat.roomId}/projection?audience=player`, { headers: { "x-session-token": seat.token } });
  return r.json();
}
function countPolls(page) {
  const box = { n: 0 };
  page.on("request", (r) => { if (r.url().includes("/projection")) box.n++; });
  return box;
}
/** Rooms this page creates (POST /rooms). */
function countRooms(page) {
  const box = { n: 0 };
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/rooms") box.n++; });
  return box;
}

const browser = await launchChromium();
try {
  // ---- A. A fresh visitor: Home → Play solo → Start ----
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const polls = countPolls(page);
  const rooms = countRooms(page);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home").waitFor({ timeout: 15000 });
  check("Home offers Play solo, Host a game and Join a room", (await page.getByTestId("home-solo").isVisible()) && (await page.getByTestId("home-host").innerText()).includes("Host a game") && (await page.getByTestId("home-join").innerText()).includes("Join a room"));
  await page.getByTestId("home-solo").click(); // tap 1
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });
  const offered = await page.locator('[data-testid^="solo-game-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  check("Play solo offers only real solo games (Math Mayhem in this slice)", offered.length === 1 && offered[0] === "solo-game-math-mayhem", offered.join(", "));
  check("the solo list is honest about requirements: 1–10 players, best with 2+", /1–10 players · best with 2\+/.test(await page.getByTestId("solo-game-math-mayhem").innerText()));
  check("the other games are explained (they need at least 2 players)", /need at least 2 players/.test(await page.getByTestId("solo-others").innerText()));
  check("a fresh device has no personal best yet", /No personal best on this device yet/.test(await page.getByTestId("solo-best-math-mayhem").innerText()));
  await page.getByTestId("solo-start-math-mayhem").click(); // tap 2
  await soon("tap 2 is the round itself: no room code, no name, no lobby", async () => (await page.getByTestId("solo-round").isVisible()) && new URL(page.url()).pathname === "/solo/math-mayhem" && (await page.getByPlaceholder("e.g. Auntie June").count()) === 0, 15000);

  // ---- B. Three consecutive rounds with Play again ----
  const r1 = await playRound(page, (i) => i < 5);
  check("round 1 (5 right): results show 5 of 10 and a score in range", r1.correct === 5 && r1.score >= 500 && r1.score <= 600, JSON.stringify(r1));
  check("round 1: the first personal best on this device", /first personal best on this device/.test(r1.pb), r1.pb);
  polls.n = 0; await sleep(3000);
  check("on the results screen polling has stopped", polls.n === 0, `${polls.n} projection requests in 3 s`);
  await page.getByTestId("solo-play-again").click();
  const r2 = await playRound(page, () => false);
  check("round 2 (all wrong): a fresh round, 0 of 10, 0 points (nothing carried over)", r2.correct === 0 && r2.score === 0, JSON.stringify(r2));
  check("round 2: a lower score keeps the personal best", r2.pb.includes(`still ${r1.score.toLocaleString("en-US")}`), r2.pb);
  await page.getByTestId("solo-play-again").click();
  const r3 = await playRound(page, () => true, { doubleTapFirst: true });
  check("round 3 (all right, first answer double-tapped): 10 of 10, at least 1,000", r3.correct === 10 && r3.score >= 1000 && r3.score <= 1200, JSON.stringify(r3));
  check("round 3: a higher score is a new personal best, naming the old one", /New personal best/.test(r3.pb) && r3.pb.includes(r1.score.toLocaleString("en-US")), r3.pb);
  const seat = await seatOf(page);
  const room = await serverRoom(seat);
  const finished = (room.games ?? []).filter((g) => g.gameId === "math-mayhem" && g.status === "finished");
  check("the server holds exactly the three rounds, each with its own score", room.roomKind === "solo" && finished.length === 3 && finished.map((g) => g.rawScores?.[seat.playerId]).join(",") === [r1.score, r2.score, r3.score].join(","), finished.map((g) => g.rawScores?.[seat.playerId]).join(","));
  const myR3 = (room.myGames ?? []).find((g) => g.id === finished[2]?.id);
  check("the double tap counted once: 10 answers in round 3", Object.keys(myR3?.myAnswers ?? {}).length === 10);
  check("no round is left playing", !(room.games ?? []).some((g) => g.status === "playing" || g.status === "briefing"));
  check("solo rounds are never official", (room.games ?? []).every((g) => g.official !== true));
  await page.getByTestId("solo-back").click();
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });
  check("Back to solo: the list shows the new personal best", (await page.getByTestId("solo-best-math-mayhem").innerText()).includes(r3.score.toLocaleString("en-US")));
  await page.goBack();
  await soon("browser Back from the solo list (after three rounds) is Home, not an old round", async () => page.getByTestId("home").isVisible(), 10000);
  await page.goForward();
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });

  // ---- C. Leaving mid-round ----
  await page.getByTestId("solo-start-math-mayhem").click();
  await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
  await page.getByTestId("solo-leave").click();
  check("Leave round asks first", await page.getByTestId("solo-leave-confirm").isVisible());
  await page.getByTestId("solo-leave-no").click();
  check("Keep playing keeps the round", (await page.getByTestId("solo-round").isVisible()) && (await page.getByTestId("solo-leave-confirm").count()) === 0);
  await page.getByTestId("solo-leave").click();
  await page.getByTestId("solo-leave-yes").click();
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });
  await soon("after leaving, the round is removed on the server (nothing left playing)", async () => !((await serverRoom(seat)).games ?? []).some((g) => g.status === "playing"), 10000);
  check("leaving left the personal best as it was", (await page.getByTestId("solo-best-math-mayhem").innerText()).includes(r3.score.toLocaleString("en-US")));
  polls.n = 0; await sleep(3000);
  check("after leaving, nothing polls any more", polls.n === 0, `${polls.n} projection requests in 3 s`);
  await page.getByTestId("nav-back").click();
  await page.getByTestId("home").waitFor({ timeout: 10000 });
  check("back home: no phantom Rejoin for the solo room", (await page.getByTestId("home-rejoin").count()) === 0);

  // ---- D. Browser Back mid-round ----
  await page.getByTestId("home-solo").click();
  await page.getByTestId("solo-start-math-mayhem").click();
  await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
  await page.goBack();
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });
  await soon("browser Back mid-round: the round is removed too", async () => !((await serverRoom(seat)).games ?? []).some((g) => g.status === "playing"), 10000);

  // ---- E. Reload mid-round ----
  await page.getByTestId("solo-start-math-mayhem").click();
  await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
  const before = ((await serverRoom(seat)).games ?? []).find((g) => g.status === "playing")?.id;
  await page.reload({ waitUntil: "domcontentloaded" });
  await soon("reload mid-round: the round's start screen, not a trapped loading screen", async () => page.getByTestId("solo-ready").isVisible(), 10000);
  check("after the reload nothing polls until Start", await (async () => { polls.n = 0; await sleep(2500); return polls.n === 0; })());
  await page.getByTestId("solo-round-start").click();
  await page.getByTestId("solo-round").waitFor({ timeout: 15000 });
  check("Start after a reload says the interrupted round was replaced", await page.getByTestId("solo-replaced").isVisible());
  const games = (await serverRoom(seat)).games ?? [];
  check("the interrupted round is gone; exactly one round plays", !games.some((g) => g.id === before) && games.filter((g) => g.status === "playing").length === 1);
  await page.getByTestId("solo-leave").click(); await page.getByTestId("solo-leave-yes").click();
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });

  // ---- E2. Two tabs on one device: the later Start replaces the round ----
  const tabB = await ctx.newPage();
  const roomsB = countRooms(tabB);
  await page.getByTestId("solo-start-math-mayhem").click();
  await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
  const gA = ((await serverRoom(seat)).games ?? []).find((g) => g.status === "playing")?.id;
  await tabB.goto(`${BASE}/solo/math-mayhem`, { waitUntil: "domcontentloaded" });
  await tabB.getByTestId("solo-round-start").click();
  await tabB.getByTestId("solo-round").waitFor({ timeout: 15000 });
  check("a second tab's Start says the open round was replaced", await tabB.getByTestId("solo-replaced").isVisible());
  // Tab A still shows its old question for up to a poll: a tap there goes to the replaced round.
  await page.locator(".mz-slab:not([disabled])").first().click({ timeout: 1500 }).catch(() => {});
  await soon("tab A, whose round was replaced, goes back to its Start screen (not stuck)", async () => page.getByTestId("solo-ready").isVisible(), 10000);
  await page.getByTestId("nav-back").click(); // tab A leaves the screen: no cancel of anything
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });
  let now2 = (await serverRoom(seat)).games ?? [];
  const gB = now2.find((g) => g.status === "playing")?.id;
  check("the earlier tab's round is gone; the replacement plays", !!gB && gB !== gA && !now2.some((g) => g.id === gA));
  const mineB = ((await serverRoom(seat)).myGames ?? []).find((g) => g.id === gB);
  check("the earlier tab's tap and leaving scored nothing in the replacement", Object.keys(mineB?.myAnswers ?? {}).length === 0, JSON.stringify(mineB?.myAnswers));
  const rB = await playRound(tabB, () => true);
  check("the replacement round plays to its own result (10 of 10)", rB.correct === 10, JSON.stringify(rB));
  check("the second tab reused the device's solo room (no new room)", roomsB.n === 0, `${roomsB.n} rooms created`);
  await tabB.getByTestId("solo-home").click();
  await tabB.getByTestId("home").waitFor({ timeout: 10000 });
  check("Mchezo home from the results: Home, with no phantom Rejoin", (await tabB.getByTestId("home-rejoin").count()) === 0);
  check("one solo room for this device across every round, leave, Back, reload and tab", rooms.n === 1, `${rooms.n} rooms created`);
  await ctx.close();

  // ---- F. Storage that can't be used ----
  const blocked = await browser.newContext({ viewport: { width: 320, height: 640 } });
  await blocked.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } }); });
  const bp = await blocked.newPage();
  const bRooms = countRooms(bp);
  await bp.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
  await bp.getByTestId("solo-home").waitFor({ timeout: 15000 });
  check("blocked storage: the list says bests can't be kept, and still offers Start", /can’t be kept on this device/.test(await bp.getByTestId("solo-best-math-mayhem").innerText()) && await bp.getByTestId("solo-start-math-mayhem").isEnabled());
  await bp.getByTestId("solo-start-math-mayhem").click();
  const rb = await playRound(bp, (i) => i < 3);
  check("blocked storage: the round plays to its results", rb.correct === 3, JSON.stringify(rb));
  check("blocked storage: the results say the best couldn't be saved", /couldn’t be saved/.test(rb.pb), rb.pb);
  await bp.getByTestId("solo-play-again").click();
  await bp.locator("h1.mz-question").waitFor({ timeout: 20000 });
  check("blocked storage: Play again still works", true);
  await bp.getByTestId("solo-leave").click(); await bp.getByTestId("solo-leave-yes").click();
  await bp.getByTestId("solo-start-math-mayhem").click();
  await bp.locator("h1.mz-question").waitFor({ timeout: 20000 });
  check("blocked storage: the seat is kept for the page, one room across replays and a new Start", bRooms.n === 1, `${bRooms.n} rooms created`);
  await blocked.close();

  const odd = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const op = await odd.newPage();
  await op.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await op.evaluate(() => localStorage.setItem("mchezo.pb.v1", "{not json"));
  await op.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
  await op.getByTestId("solo-home").waitFor({ timeout: 15000 });
  check("malformed stored data reads as no best (no crash)", /No personal best on this device yet/.test(await op.getByTestId("solo-best-math-mayhem").innerText()));
  await op.evaluate(() => localStorage.setItem("mchezo.pb.v1", JSON.stringify({ "math-mayhem@0": { score: 99999, at: 1, rulesVersion: 0 } })));
  await op.reload({ waitUntil: "domcontentloaded" });
  await op.getByTestId("solo-home").waitFor({ timeout: 15000 });
  check("a best under other rules (version 0) is not shown as this game's best", /No personal best on this device yet/.test(await op.getByTestId("solo-best-math-mayhem").innerText()));
  await op.getByTestId("solo-start-math-mayhem").click();
  const ro = await playRound(op, (i) => i < 2);
  check("a round under the current rules is its own first best (not compared with version 0)", /first personal best/.test(ro.pb), ro.pb);
  const stored = JSON.parse(await op.evaluate(() => localStorage.getItem("mchezo.pb.v1")));
  check("the other version's entry is kept untouched beside the new one", stored["math-mayhem@0"]?.score === 99999 && stored["math-mayhem@1"]?.score === ro.score, JSON.stringify(stored));
  await odd.close();

  // ---- F2. A phone on the home Wi-Fi: plain http, an insecure context ----
  const lan = await plainHttpContext(browser, BASE, { viewport: { width: 390, height: 844 } });
  const lp = await lan.ctx.newPage();
  await lp.goto(`${lan.base}/solo`, { waitUntil: "domcontentloaded" });
  const ctxInfo = await lp.evaluate(() => ({ secure: isSecureContext, randomUUID: typeof crypto.randomUUID }));
  check(`plain http (${lan.real ? `real insecure context at ${new URL(lan.base).hostname}` : "simulated: no network address, randomUUID removed"}): no crypto.randomUUID`, ctxInfo.randomUUID === "undefined" && (!lan.real || ctxInfo.secure === false), JSON.stringify(ctxInfo));
  await lp.getByTestId("solo-start-math-mayhem").click();
  const rl = await playRound(lp, (i) => i < 7);
  check("plain http: the whole round plays and every answer counts (7 of 10)", rl.correct === 7, JSON.stringify(rl));
  await lan.ctx.close();

  // ---- H. Keyboard only: a whole round, focus where it should be ----
  const kctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const kp = await kctx.newPage();
  const focused = () => kp.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("data-testid") ?? (a.classList.contains("mz-slab") ? "slab" : a.tagName.toLowerCase())) : ""; });
  /** Tab forward until `want(focused)` holds (at most 25 presses); returns whether it did. */
  async function tabTo(want) {
    for (let i = 0; i < 25; i++) { await kp.keyboard.press("Tab"); if (want(await focused())) return true; }
    return false;
  }
  await kp.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
  await kp.getByTestId("solo-home").waitFor({ timeout: 15000 });
  check("keyboard: Tab reaches Start on the solo list", await tabTo((f) => f === "solo-start-math-mayhem"));
  await kp.keyboard.press("Enter");
  await kp.locator("h1.mz-question").waitFor({ timeout: 20000 });
  check("keyboard: Enter on Start begins the round", true);
  let byKeyboard = 0;
  for (let i = 0; i < 10; i++) {
    await kp.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
    if (!(await tabTo((f) => f === "slab"))) break;
    await kp.keyboard.press("Enter");
    byKeyboard++;
    if (i < 9) {
      await kp.getByTestId("mz-math-next").waitFor({ timeout: 20000 });
      if (!(await tabTo((f) => f === "mz-math-next"))) break;
      await kp.keyboard.press("Enter");
    }
  }
  check("keyboard: all ten questions answered with Tab and Enter", byKeyboard === 10, `${byKeyboard} answered`);
  await kp.getByTestId("solo-results").waitFor({ timeout: 20000 });
  await soon("keyboard: the results move focus to the score heading", async () => (await focused()) === "solo-score", 5000);
  check("keyboard: Tab from the score reaches Play again", await tabTo((f) => f === "solo-play-again"));
  await kp.keyboard.press("Enter");
  await kp.locator("h1.mz-question").waitFor({ timeout: 20000 });
  check("keyboard: Tab reaches Leave round", await tabTo((f) => f === "solo-leave"));
  await kp.keyboard.press("Enter");
  await kp.getByTestId("solo-leave-confirm").waitFor({ timeout: 5000 });
  check("keyboard: the leave question focuses Keep playing (the safe choice)", (await focused()) === "solo-leave-no");
  await kp.keyboard.press("Enter");
  check("keyboard: Enter on Keep playing keeps the round", (await kp.getByTestId("solo-leave-confirm").count()) === 0 && (await kp.getByTestId("solo-round").isVisible()));
  await kctx.close();
} finally {
  await browser.close();
}

// ---- G. A late answer (own server, short test clock) ----
const DATA = mkdtempSync(join(tmpdir(), "mz-solo-late-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, MCHEZO_LIFECYCLE_SCALE: "0.05" };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = 0;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
try {
  if (!port) throw new Error(`late-input server did not start: ${out.slice(-300)}`);
  const LB = `http://localhost:${port}`;
  const post = async (path, body, token) => {
    const r = await fetch(`${LB}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const room = (await post("/rooms", { kind: "solo" })).body;
  const me = (await post(`/rooms/${room.roomId}/join`, { displayName: "You", asHost: true, hostClaimToken: room.hostClaimToken })).body;
  const g = (await post(`/rooms/${room.roomId}/games`, { gameId: "math-mayhem", official: false }, me.recoveryToken)).body;
  const seatL = { roomId: room.roomId, token: me.recoveryToken };
  let proj = await serverRoom(seatL, LB);
  const deadline = (proj.games ?? []).find((x) => x.id === g.gameId)?.deadlineAt;
  check("short test clock: the solo round's window is about 12 s", typeof deadline === "number" && deadline - proj.serverNow <= 13000, `${deadline - proj.serverNow} ms`);
  const qs = ((proj.myGames ?? []).find((x) => x.id === g.gameId)?.questions ?? []).map((q) => q.id);
  const answerOf = (questionId) => ({ intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: g.gameId, action: "submit-math-answer", payload: { questionId, chosenIndex: 0 } } });
  const onTime = await post(`/rooms/${room.roomId}/intents`, answerOf(qs[0]), me.recoveryToken);
  check("control: the same answer, in time, is accepted", qs.length === 10 && onTime.body.accepted === true, JSON.stringify(onTime.body));
  await sleep(Math.max(0, deadline - proj.serverNow) + 1500);
  const late = await post(`/rooms/${room.roomId}/intents`, answerOf(qs[1]), me.recoveryToken);
  check("a late answer after the round's time is up is refused", late.body.accepted === false, JSON.stringify(late.body));
  proj = await serverRoom(seatL, LB);
  const done = (proj.games ?? []).find((x) => x.id === g.gameId);
  const counted = Object.keys((proj.myGames ?? []).find((x) => x.id === g.gameId)?.myAnswers ?? {});
  check("the round finished on its deadline with only the in-time answer counted", done?.status === "finished" && counted.length === 1 && counted[0] === qs[0], `${done?.status} answers ${JSON.stringify(counted)}`);
} finally {
  srv.kill("SIGTERM");
  await new Promise((r) => srv.once("exit", r));
  rmSync(DATA, { recursive: true, force: true });
}

console.log(failures === 0 ? "SOLO ALL PASSED" : `SOLO FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
