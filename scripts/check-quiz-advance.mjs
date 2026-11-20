// Quiz auto-advance (handoff 7037561069, D-AA-01). In Trivia and Math Mayhem, a player's locked NONFINAL answer
// used to wait for a routine "Next question" tap. Now the locked view moves on by itself after a reading time
// (a countdown), Next question still works at once, and "Stay on this screen" keeps it for the rest of that game.
// Every player still goes at their own pace: moving on opens only that player's next question, and the server
// alone decides when the room reaches its results (everyone answered, or its deadline).
//
// This driver tells the old manual flow from the new one: on the old flow every "moves on by itself" check fails.
// Each screen change is timed in the page (a MutationObserver on the screen's accessible name), and the server's own
// projection is read for what it recorded (answers, Math's question opens). Synthetic local data only.
//
// S. Solo Math Mayhem, 320×568 phone (touch):
//   S1 the countdown appears after the lock the server confirmed; the screen-reader status says it once, in words
//      ("opens by itself in 4 seconds"), and the ticking number is hidden from assistive tech; Stay on this screen
//      is a real button; with no tap the next question opens by itself after the reading time, and Math's next
//      question is opened (its speed clock starts) only then, never during the countdown
//   S2 a hidden page pauses the countdown: nothing opens while hidden; it carries on after the page is shown
//   S3 Next tapped twice just as the countdown runs out: one step only (no question skipped), and the extra tap
//      does not answer the next question (the carry-over guard: for a moment after moving on, the answers ignore taps)
//   S4 Next question still moves on at once (the old action works)
//   S5 keyboard: Tab reaches Next question, then Stay on this screen; Enter on Stay keeps the screen (a status line
//      says so); Tab and Enter on Next question move on
//   S6 after Stay, later answers in this game don't count down; the screen stays until Next question
//   S7 the last answer reaches the results with no countdown; all ten questions were shown in order, once each
//   S8 Play again: a new round counts down again (Stay was for that game only)
// R. Room Trivia, host 390×844 + guest 320×568, on this driver's own server with MCHEZO_LIFECYCLE_SCALE=0.2
//    (a test-only setting: Trivia's 6-minute deadline becomes 72 s; still the server's own deadline):
//   R1 the host's answer counts down and moves the host on; the guest, who has not answered, is not moved: their
//      question stays open; the locked view shows no correctness while the game plays
//   R2 the host plays to the end by countdown and by Next; the final answer has no countdown and no continuation;
//      the room is not finished while the guest still has questions (the server keeps the game playing)
//   R3 reconnect during feedback: the guest reloads while the countdown runs and resumes at the next unanswered
//      question, the seat and the answer kept, nothing recorded twice
//   R4 the guest taps Next twice as the countdown runs out: one step, the next question unanswered. Before the
//      carry-over guard the second tap landed on an answer of question 3 and locked it (this run found it; the old
//      manual flow had the same double-tap hazard)
//   R5 a missing answer: the guest stops; only the server's deadline ends the game; both phones reach the results
// M. Room Math Mayhem, host 390×844 + guest 320×568 (unscaled server):
//   M1 the host's next question is opened only after the countdown, and timed from that open
//   M2 both players finish (countdown and Next); the server ends the game when everyone has answered and both
//      phones reach the results
// Usage: node scripts/check-quiz-advance.mjs   (starts its own servers; MCHEZO_WEB_DIST passes through)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotDir } from "./lib/driver-env.mjs";
import { slabNumber, solveMath } from "./lib/math-solve.mjs";

const SHOTS = screenshotDir("test-results/screenshots/quiz-advance");
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; return ok; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
/** The reading time the product uses (D-AA-01). A step that comes earlier than READ_MIN, or not by READ_MAX, fails. */
const READ_MIN = 3500, READ_MAX = 6500;
/** QA_ONLY=S, R or M runs one section (for local iteration); the gate runs all three. */
const ONLY = process.env.QA_ONLY ?? "SRM";

async function startServer(scale) {
  const dataDir = mkdtempSync(join(tmpdir(), "quiz-advance-"));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: dataDir, MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
  delete env.NODE_ENV;
  if (scale < 1) env.MCHEZO_LIFECYCLE_SCALE = String(scale); else delete env.MCHEZO_LIFECYCLE_SCALE;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 120 && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) return { child, dataDir, base: `http://localhost:${m[1]}` };
    await sleep(250);
  }
  child.kill("SIGKILL");
  throw new Error(`server did not start: ${out.slice(-400)}`);
}
async function stopServer(s) {
  if (!s) return;
  s.child.kill("SIGTERM");
  for (let i = 0; i < 20 && s.child.exitCode === null && s.child.signalCode === null; i++) await sleep(250);
  if (s.child.exitCode === null && s.child.signalCode === null) s.child.kill("SIGKILL");
  rmSync(s.dataDir, { recursive: true, force: true });
}
async function api(base, path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(base, names) {
  const room = await api(base, "/rooms", { body: { name: "Quiz advance", kind: "casual" } });
  const host = await api(base, `/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: host.playerId, token: host.recoveryToken }];
  for (const n of names.slice(1)) {
    const j = await api(base, "/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { base, roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) => api(room.base, `/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
async function startGame(room, gameId) {
  const seen = await api(room.base, `/rooms/${room.roomId}/projection?audience=player`, { token: room.seats[0].token });
  const { gameId: gid } = await api(room.base, `/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false, roster: seen.readiness?.wouldPlay, attempt: { id: `qa-${gameId}-${Date.now()}`, sessionRevision: seen.session?.revision } } });
  return gid;
}
/** What the server holds for this seat's game: answers, Math's opened questions and timings, status, outcome. */
async function mine(base, roomId, token, gid) {
  const p = await api(base, `/rooms/${roomId}/projection?audience=player`, { token });
  const g = (p.myGames ?? []).filter((x) => (gid ? x.id === gid : true) && (x.gameId === "math-mayhem" || x.gameId === "trivia")).at(-1) ?? null;
  const pub = (p.games ?? []).find((x) => x.id === g?.id) ?? null;
  // Trivia keeps its answers in its state; Math in myAnswers.
  const answers = (g?.state?.myAnswers && Object.keys(g.state.myAnswers).length ? g.state.myAnswers : null) ?? g?.myAnswers ?? {};
  const qs = g?.questions ?? g?.state?.questions ?? [];
  return {
    id: g?.id, status: pub?.status ?? g?.status, outcome: pub?.outcome, rawScores: pub?.rawScores,
    answered: Object.entries(answers).filter(([, v]) => v !== undefined && v !== null).map(([k]) => k),
    answers, qIds: qs.map((q) => q.id), opened: qs.map((q) => q.prompt !== undefined), times: g?.myAnswerTimes ?? {},
  };
}

// ---- The phone: the screen's accessible name, timed in the page, and a page that can report itself hidden. ----
async function phone(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (window.__mzHidden ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !!window.__mzHidden });
    window.__mzLog = [];
    let last = null;
    const tick = () => {
      const m = document.querySelector("main.mz-screen");
      const l = m?.getAttribute("aria-label") ?? "";
      if (l !== last) { last = l; window.__mzLog.push({ t: Date.now(), l }); }
    };
    new MutationObserver(tick).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-label"] });
  });
  return { ctx, page: await ctx.newPage() };
}
async function seatPage(browser, room, seat, width, height) {
  const { ctx, page } = await phone(browser, width, height);
  await page.goto(`${room.base}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); sessionStorage.setItem("cgn_name", s.name); }, { ...seat, roomId: room.roomId });
  await page.goto(`${room.base}/room`, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}
const screenLog = (page) => page.evaluate(() => window.__mzLog.map((e, i) => ({ ...e, i })));
const logLen = async (page) => (await screenLog(page)).length;
/** The first screen change at or after index `from` whose name matches `re`, or null by `timeout`. */
async function waitScreen(page, re, from, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const e = (await screenLog(page)).find((x) => x.i >= from && re.test(x.l));
    if (e) return e;
    await sleep(50);
  }
  return null;
}
const LOCKED = /^Answer locked in$/, FINAL = /^All your answers are in$/, QUESTION = /^Question (\d+) of (\d+)$/;
const qNum = (l) => Number((QUESTION.exec(l) ?? [])[1] ?? NaN);
/** The questions this page showed, in order (each screen change to "Question N of M"). */
const shownQuestions = async (page) => (await screenLog(page)).filter((e) => QUESTION.test(e.l)).map((e) => qNum(e.l));
const atResults = async (p) => (await p.locator('[data-testid="solo-results"], [data-testid="results-hero"], [data-testid="mz-outcome"], [data-testid="casual-results"]').count()) > 0;

/** Answer the question on screen (Math: the right sum; Trivia: option `index`), and return the lock's screen change. */
async function answer(page, { math = false, index = 0, timeout = 20000 } = {}) {
  const from = await logLen(page);
  const slabs = page.locator(".mz-slab:not([disabled])");
  await slabs.first().waitFor({ timeout });
  let i = index;
  if (math) {
    for (let k = 0; k < 100 && (await slabs.count()) !== 4; k++) await sleep(50);
    const labels = (await slabs.allInnerTexts()).map(slabNumber);
    i = Math.max(0, labels.indexOf(solveMath(await page.locator("h1.mz-question").innerText())));
  }
  await slabs.nth(i).click();
  // The lock (or, after the last answer, "All your answers are in" or the results).
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const e = (await screenLog(page)).find((x) => x.i >= from && (LOCKED.test(x.l) || FINAL.test(x.l)));
    if (e) return e;
    if (await atResults(page)) return { i: (await logLen(page)) - 1, t: Date.now(), l: "results" };
    await sleep(50);
  }
  return null;
}
/** Wait for the next "Question N" after a lock, with no tap; returns { e, ms } or null. */
async function nextQuestionAfter(page, lock, timeout = READ_MAX + 1500) {
  const e = await waitScreen(page, QUESTION, lock.i + 1, timeout);
  return e ? { e, ms: e.t - lock.t } : null;
}
/** Tap Next question at once (the manual action). */
async function tapNext(page) {
  await page.getByRole("button", { name: "Next question" }).click({ timeout: 3000 }).catch(() => {});
}
const focusedId = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("data-testid") ?? (a.classList.contains("mz-slab") ? "slab" : a.tagName.toLowerCase())) : ""; });
async function tabTo(page, want, max = 30) {
  for (let i = 0; i < max; i++) { await page.keyboard.press("Tab"); if (want(await focusedId(page))) return true; }
  return false;
}
/** What a screen reader is given on the locked view, and what the eye sees. */
const lockedA11y = (page) => page.evaluate(() => {
  const lead = document.querySelector('[data-testid="mz-locked-lead"]');
  const count = document.querySelector('[data-testid="mz-advance-count"]');
  const live = [...document.querySelectorAll('[role="status"], [role="alert"], [role="timer"], [aria-live]')];
  return {
    lead: lead?.textContent ?? null, leadRole: lead?.getAttribute("role") ?? null,
    count: count?.textContent ?? null, countHidden: count?.closest('[aria-hidden="true"]') !== null && !!count,
    tickInLive: live.some((el) => /Next question in \d/.test(el.textContent ?? "")),
    stayIsButton: document.querySelector('[data-testid="mz-advance-stay"]')?.tagName === "BUTTON",
    correctness: /\b(correct|wrong|the answer is)\b/i.test(document.querySelector("main.mz-screen")?.innerText ?? ""),
  };
});

const browser = await launchChromium();
let s1 = null, s2 = null;
try {
  s1 = await startServer(1);

  // ======================= S. Solo Math Mayhem =======================
  if (ONLY.includes("S")) {
    const { ctx, page } = await phone(browser, 320, 568);
    const seat = async () => JSON.parse((await page.evaluate(() => localStorage.getItem("mchezo.solo.v1"))) ?? "null");
    const server = async () => { const s = await seat(); return s ? mine(s1.base, s.roomId, s.token) : null; };
    await page.goto(`${s1.base}/solo/math-mayhem`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("solo-round-start").click({ timeout: 15000 });
    await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
    try {
      // S1: the countdown, what assistive tech is told, and moving on with no tap.
      let lock = await answer(page, { math: true });
      check("S1 the first answer locks (the server confirmed it)", !!lock && LOCKED.test(lock.l), lock?.l);
      const a1 = await lockedA11y(page);
      await page.screenshot({ path: join(SHOTS, "solo-math-countdown-320x568.png") });
      check("S1 the locked view shows a countdown to the next question", /^Next question in [1-4] s$/.test(a1.count ?? ""), String(a1.count));
      check("S1 the status line says it once, in words: the next question opens by itself in 4 seconds", a1.leadRole === "status" && /The next question opens by itself in 4 seconds\.$/.test(a1.lead ?? ""), String(a1.lead));
      check("S1 the ticking number is hidden from assistive tech and sits in no live region", a1.countHidden && !a1.tickInLive, JSON.stringify(a1));
      check("S1 Stay on this screen is a button with that name, next to Next question", a1.stayIsButton && (await page.getByRole("button", { name: "Stay on this screen" }).count()) === 1 && (await page.getByRole("button", { name: "Next question" }).count()) === 1);
      const snap = await page.locator("main.mz-screen").ariaSnapshot();
      check("S1 the accessibility tree has the status sentence and both buttons, and no ticking number", /opens by itself in 4 seconds/.test(snap) && /button "Next question"/.test(snap) && /button "Stay on this screen"/.test(snap) && !/Next question in \d/.test(snap), snap.replace(/\s+/g, " ").slice(0, 300));
      // During the countdown the server has not opened question 2 (Math's speed clock has not started).
      const polls = [];
      let step = null, mid = null;
      for (let k = 0; k < 60 && !step; k++) {
        const s = await server();
        polls.push({ at: Date.now() - lock.t, opened: !!s?.opened?.[1] });
        if (!mid && Date.now() - lock.t >= 1500) mid = await lockedA11y(page).catch(() => null);
        const L = await screenLog(page);
        const e = L.find((x) => x.i > lock.i && QUESTION.test(x.l));
        if (e) step = { e, ms: e.t - lock.t };
        else await sleep(150);
      }
      check("S1 mid-countdown the number has ticked down, and the status sentence has not changed", !!mid && mid.count !== a1.count && /^Next question in [1-3] s$/.test(mid.count ?? "") && mid.lead === a1.lead, JSON.stringify({ first: a1.count, mid: mid?.count, same: mid?.lead === a1.lead }));
      check(`S1 with no tap, question 2 opens by itself after the reading time (${READ_MIN}–${READ_MAX} ms after the lock)`, !!step && qNum(step.e.l) === 2 && step.ms >= READ_MIN && step.ms <= READ_MAX, step ? `${step.ms} ms → ${step.e.l}` : "it never moved on");
      const early = polls.filter((p) => p.opened && p.at < READ_MIN);
      check("S1 the server did not open question 2 during the countdown (its clock starts only after)", polls.length > 3 && early.length === 0, JSON.stringify(polls.filter((p) => p.opened).slice(0, 2)));
      if (!step) await tapNext(page);
      await soon("S1 question 2 is opened on the server once it shows", async () => (await server())?.opened?.[1], 8000);

      // S2: a hidden page pauses the countdown.
      lock = await answer(page, { math: true });
      await sleep(800);
      await page.evaluate(() => { window.__mzHidden = true; document.dispatchEvent(new Event("visibilitychange")); });
      await sleep(6000);
      const hiddenStill = LOCKED.test((await screenLog(page)).at(-1)?.l ?? "");
      check("S2 while the page is hidden the locked view stays (6 s, longer than the countdown)", hiddenStill, (await screenLog(page)).at(-1)?.l);
      check("S2 and question 3 is not opened on the server", !(await server())?.opened?.[2]);
      const shownAt = Date.now();
      await page.evaluate(() => { window.__mzHidden = false; document.dispatchEvent(new Event("visibilitychange")); });
      const s2step = await waitScreen(page, QUESTION, lock.i + 1, READ_MAX + 1500);
      const afterShow = s2step ? s2step.t - shownAt : null;
      check("S2 once shown, the countdown carries on (not from zero, not at once) and question 3 opens", !!s2step && qNum(s2step.l) === 3 && afterShow >= 1500 && afterShow <= READ_MAX, `${afterShow} ms after the page was shown`);
      if (!s2step) await tapNext(page);

      // S3: Next tapped twice just as the countdown runs out.
      lock = await answer(page, { math: true });
      await soon("S3 the countdown reaches its last second", async () => (await page.getByTestId("mz-advance-count").textContent().catch(() => "")) === "Next question in 1 s", 6000);
      const nb = await page.getByRole("button", { name: "Next question" }).boundingBox().catch(() => null);
      if (nb) { await page.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2); await sleep(60); await page.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2).catch(() => {}); }
      await sleep(1500);
      const s3 = await server();
      const shown3 = await shownQuestions(page);
      check("S3 one step only: question 4 is on screen, none skipped", shown3.at(-1) === 4 && QUESTION.test((await screenLog(page)).at(-1)?.l ?? ""), JSON.stringify(shown3));
      check("S3 the extra tap did not answer question 4", s3?.answered?.length === 3 && !s3?.answered?.includes(s3?.qIds?.[3]), JSON.stringify(s3?.answered?.length));

      // S4: Next question still moves on at once.
      lock = await answer(page, { math: true });
      await page.getByRole("button", { name: "Next question" }).click({ timeout: 3000 });
      const s4 = await nextQuestionAfter(page, lock, 3000);
      check("S4 Next question moves on at once (the old action still works)", !!s4 && qNum(s4.e.l) === 5 && s4.ms < 2000, s4 ? `${s4.ms} ms` : "no step");

      // S5: keyboard — Tab reaches Next question then Stay on this screen; Enter on Stay keeps the screen.
      lock = await answer(page, { math: true });
      check("S5 Tab reaches Next question", await tabTo(page, (f) => f === "mz-math-next"));
      await page.keyboard.press("Tab");
      check("S5 the next Tab is Stay on this screen", (await focusedId(page)) === "mz-advance-stay", await focusedId(page));
      await page.keyboard.press("Enter");
      const paused = page.getByTestId("mz-advance-paused");
      await paused.waitFor({ timeout: 3000 }).catch(() => {});
      check("S5 Enter on Stay keeps the screen: a status line says so and the countdown is gone", (await paused.getAttribute("role").catch(() => null)) === "status" && /won’t move on by themselves for the rest of this game/.test(await paused.textContent().catch(() => "")) && (await page.getByTestId("mz-advance").count()) === 0);
      await page.screenshot({ path: join(SHOTS, "solo-math-stayed-320x568.png") });
      await sleep(READ_MAX - 1000);
      check("S5 it stays well past the reading time", LOCKED.test((await screenLog(page)).at(-1)?.l ?? ""));
      check("S5 Tab and Enter on Next question move on", await tabTo(page, (f) => f === "mz-math-next"));
      await page.keyboard.press("Enter");
      check("S5 question 6 is shown", (await waitScreen(page, QUESTION, lock.i + 1, 4000))?.l === "Question 6 of 10");

      // S6: Stay holds for the rest of this game.
      lock = await answer(page, { math: true });
      await sleep(READ_MAX);
      check("S6 a later answer in this game shows no countdown and stays until Next question", LOCKED.test((await screenLog(page)).at(-1)?.l ?? "") && (await page.getByTestId("mz-advance").count()) === 0 && (await page.getByTestId("mz-advance-paused").count()) === 1);
      await tapNext(page);
      for (let q = 7; q <= 9; q++) { await answer(page, { math: true }); await tapNext(page); }

      // S7: the last answer reaches the results with no countdown; every question shown once, in order.
      const from = await logLen(page);
      await answer(page, { math: true });
      const res = await soon("S7 the last answer reaches the results", () => atResults(page), 15000);
      const after = (await screenLog(page)).filter((e) => e.i >= from).map((e) => e.l);
      check("S7 no countdown after the last answer", (await page.getByTestId("mz-advance").count()) === 0 && !after.some((l) => LOCKED.test(l)), JSON.stringify(after));
      const order = await shownQuestions(page);
      check("S7 all ten questions were shown in order, once each", JSON.stringify(order) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), JSON.stringify(order));
      const fin = await server();
      check("S7 the server recorded ten answers", fin?.answered?.length === 10, String(fin?.answered?.length));
      if (res) await page.screenshot({ path: join(SHOTS, "solo-math-results-320x568.png") });

      // S8: Play again counts down again.
      await page.getByTestId("solo-play-again").click({ timeout: 10000 });
      await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
      await answer(page, { math: true });
      check("S8 Play again: the new round's locked answer counts down again", (await page.getByTestId("mz-advance").count()) === 1);
    } catch (e) {
      check("S solo section ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
    }
    await ctx.close();
  }

  // ======================= R. Room Trivia (scaled server: the deadline is the server's own) =======================
  if (ONLY.includes("R")) s2 = await startServer(0.2);
  if (ONLY.includes("R")) {
    const room = await makeRoom(s2.base, ["Keku", "Amina"]);
    const [hs, gs] = room.seats;
    const H = await seatPage(browser, room, hs, 390, 844);
    const G = await seatPage(browser, room, gs, 320, 568);
    const h = H.page, g = G.page;
    try {
      const gid = await startGame(room, "trivia");
      for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
      await h.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
      await g.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
      const srvH = () => mine(room.base, room.roomId, hs.token, gid);
      const srvG = () => mine(room.base, room.roomId, gs.token, gid);

      // R1: the host's answer counts down and moves the host on; the guest is not moved.
      let lock = await answer(h);
      const a = await lockedA11y(h);
      await h.screenshot({ path: join(SHOTS, "room-trivia-host-countdown-390x844.png") });
      check("R1 the host's locked answer counts down", /^Next question in [1-4] s$/.test(a.count ?? ""), String(a.count));
      check("R1 the locked view shows no correctness while the game plays", !a.correctness);
      const r1 = await nextQuestionAfter(h, lock);
      check(`R1 with no tap, the host moves on to question 2 after the reading time`, !!r1 && qNum(r1.e.l) === 2 && r1.ms >= READ_MIN && r1.ms <= READ_MAX, r1 ? `${r1.ms} ms` : "never moved on");
      if (!r1) await tapNext(h);
      check("R1 the guest, who has not answered, still has question 1 open", (await g.locator('main[aria-label^="Question 1 of"]').count()) === 1 && (await g.locator(".mz-slab:not([disabled])").count()) > 0);

      // R2: the host plays to the end (countdown for 2–3, Next after); the final answer has no countdown.
      const total = Number((QUESTION.exec((await screenLog(h)).find((e) => QUESTION.test(e.l))?.l ?? "") ?? [])[2] ?? 10);
      for (let q = 2; q <= total - 1; q++) {
        lock = await answer(h, { index: q % 4 });
        if (q <= 3) {
          const st = await nextQuestionAfter(h, lock);
          check(`R2 question ${q}: moves on by itself`, !!st && qNum(st.e.l) === q + 1 && st.ms >= READ_MIN, st ? `${st.ms} ms` : "no step");
          if (!st) await tapNext(h);
        } else await tapNext(h);
      }
      lock = await answer(h, { index: 0 });
      check("R2 the host's last answer: all their answers are in", !!lock && FINAL.test(lock.l), lock?.l);
      await sleep(READ_MAX);
      const enabled = await h.locator("main.mz-screen button:not([disabled])").allInnerTexts();
      check("R2 the final screen has no countdown and no continuation", (await h.getByTestId("mz-advance").count()) === 0 && !enabled.some((t) => /Next question|Stay on this screen/i.test(t)), JSON.stringify(enabled));
      await h.screenshot({ path: join(SHOTS, "room-trivia-host-final-390x844.png") });
      const hostOrder = await shownQuestions(h);
      check("R2 the host saw every question once, in order", JSON.stringify(hostOrder) === JSON.stringify(Array.from({ length: total }, (_, i) => i + 1)), JSON.stringify(hostOrder));
      check("R2 the room is not finished while the guest still has questions (the server keeps it playing)", (await srvH()).status === "playing" && !(await atResults(h)));
      check("R2 the host's pace never moved the guest: still on question 1, nothing recorded", (await g.locator('main[aria-label^="Question 1 of"]').count()) === 1 && (await srvG()).answered.length === 0);

      // R3: reconnect during feedback.
      lock = await answer(g, { index: 2 });
      await sleep(900);
      check("R3 the guest reloads while the countdown runs", (await g.getByTestId("mz-advance").count()) === 1);
      await g.screenshot({ path: join(SHOTS, "room-trivia-guest-countdown-320x568.png") });
      const seatBefore = await g.evaluate(() => sessionStorage.getItem("cgn_playerId"));
      await g.reload({ waitUntil: "domcontentloaded" });
      await soon("R3 after the reload the guest resumes at question 2 (the next unanswered)", async () => (await g.locator('main[aria-label^="Question 2 of"]').count()) === 1 && (await g.locator(".mz-slab:not([disabled])").count()) > 0, 20000);
      const g3 = await srvG();
      check("R3 the seat and the answer are kept, recorded once", (await g.evaluate(() => sessionStorage.getItem("cgn_playerId"))) === seatBefore && g3.answered.length === 1 && g3.answers[g3.qIds[0]] === 2, JSON.stringify({ answered: g3.answered.length, a: g3.answers[g3.qIds[0]] }));

      // R4: two taps on Next as the countdown runs out.
      lock = await answer(g, { index: 1 });
      await soon("R4 the guest's countdown reaches its last second", async () => (await g.getByTestId("mz-advance-count").textContent().catch(() => "")) === "Next question in 1 s", 6000);
      const nb = await g.getByRole("button", { name: "Next question" }).boundingBox().catch(() => null);
      if (nb) { await g.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2); await sleep(60); await g.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2).catch(() => {}); }
      await sleep(1500);
      const g4 = await srvG();
      check("R4 one step only: question 3 is on screen", (await g.locator('main[aria-label^="Question 3 of"]').count()) === 1, JSON.stringify((await screenLog(g)).slice(-4).map((e) => [e.l, e.t - lock.t])));
      check("R4 the extra tap did not answer question 3", g4.answered.length === 2 && !g4.answered.includes(g4.qIds[2]), String(g4.answered.length));

      // R5: the guest stops answering; only the server's deadline ends the game.
      const p0 = await api(room.base, `/rooms/${room.roomId}/projection?audience=tv`);
      const g0 = (p0.games ?? []).find((x) => x.id === gid);
      const leftMs = Math.max(0, (g0?.deadlineAt ?? 0) - (p0.serverNow ?? 0));
      console.log(`     (the game's server deadline is ${Math.round(leftMs / 1000)} s away, at scale 0.2: test-only)`);
      await sleep(Math.min(leftMs, 3000));
      check("R5 before its deadline, the game is still playing on the server", leftMs < 3000 || (await srvH()).status === "playing");
      await soon("R5 the host's phone reaches the results with no host action", () => atResults(h), leftMs + 25000);
      await soon("R5 the guest's phone reaches the results too", () => atResults(g), 20000);
      const fin = await srvH();
      check("R5 the server ended it at its deadline", fin.status === "finished" && fin.outcome?.reason === "deadline", JSON.stringify({ status: fin.status, outcome: fin.outcome }));
      await g.screenshot({ path: join(SHOTS, "room-trivia-guest-results-320x568.png") });
    } catch (e) {
      check("R room Trivia section ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
    }
    await H.ctx.close(); await G.ctx.close();
  }

  // ======================= M. Room Math Mayhem (unscaled server) =======================
  if (ONLY.includes("M")) {
    const room = await makeRoom(s1.base, ["Keku", "Amina"]);
    const [hs, gs] = room.seats;
    const H = await seatPage(browser, room, hs, 390, 844);
    const G = await seatPage(browser, room, gs, 320, 568);
    const h = H.page, g = G.page;
    try {
      const gid = await startGame(room, "math-mayhem");
      for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
      await h.locator("h1.mz-question").waitFor({ timeout: 20000 });
      const srvH = () => mine(room.base, room.roomId, hs.token, gid);

      // M1: the host's question 2 is opened only after the countdown, and timed from that open.
      let lock = await answer(h, { math: true });
      await sleep(2000);
      check("M1 two seconds into the countdown, question 2 is not opened on the server", !(await srvH()).opened[1]);
      const m1 = await nextQuestionAfter(h, lock);
      check("M1 with no tap, the host moves on to question 2 after the reading time", !!m1 && qNum(m1.e.l) === 2 && m1.ms >= READ_MIN && m1.ms <= READ_MAX, m1 ? `${m1.ms} ms` : "never moved on");
      if (!m1) await tapNext(h);
      const shownAt = Date.now();
      await answer(h, { math: true });
      const t2 = await srvH();
      const ms2 = t2.times?.[t2.qIds[1]];
      check("M1 question 2's time runs from its open after the countdown, not from the lock", typeof ms2 === "number" && ms2 <= Date.now() - shownAt + 1500, `${ms2} ms timed`);
      await tapNext(h);
      for (let q = 3; q <= 10; q++) { const l = await answer(h, { math: true }); if (l && LOCKED.test(l.l)) await tapNext(h); }
      check("M2 the host's last answer: all their answers are in, no countdown", (await h.locator('main[aria-label="All your answers are in"]').count()) === 1 && (await h.getByTestId("mz-advance").count()) === 0);
      check("M2 the room is still playing while the guest has questions", (await srvH()).status === "playing");

      // M2: the guest finishes by countdown (questions 1–2) and Next (the rest); the server ends the game.
      for (let q = 1; q <= 10; q++) {
        lock = await answer(g, { math: true });
        if (!lock || !LOCKED.test(lock.l)) break;
        if (q <= 2) { const st = await nextQuestionAfter(g, lock); check(`M2 guest question ${q}: moves on by itself`, !!st && qNum(st.e.l) === q + 1, st ? `${st.ms} ms` : "no step"); if (!st) await tapNext(g); }
        else await tapNext(g);
      }
      await soon("M2 once everyone has answered, the host's phone reaches the results", () => atResults(h), 20000);
      await soon("M2 and the guest's", () => atResults(g), 20000);
      const fin = await srvH();
      check("M2 the server ended it because everyone answered (not the deadline)", fin.status === "finished" && fin.outcome?.reason !== "deadline", JSON.stringify(fin.outcome));
      const gOrder = await shownQuestions(g);
      check("M2 the guest saw every question once, in order", JSON.stringify(gOrder) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), JSON.stringify(gOrder));
    } catch (e) {
      check("M room Math section ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
    }
    await H.ctx.close(); await G.ctx.close();
  }
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).slice(0, 600));
} finally {
  await browser.close();
  await stopServer(s1); await stopServer(s2);
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL QUIZ ADVANCE CHECKS PASSED");
process.exit(failures ? 1 : 0);
