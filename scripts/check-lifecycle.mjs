// Sprint 3: game deadlines in real browsers, end to end.
//
// Starts ITS OWN server (free port, temp data dir, the gate's build when
// MCHEZO_WEB_DIST is set) with MCHEZO_LIFECYCLE_SCALE=0.1, a test-only
// setting that makes every time limit 10x shorter (Trivia 6 min -> 36 s,
// Closest 40 s/question -> 4 s), so deadlines pass in seconds. Nothing else
// differs from a real server. The base URL argument is ignored.
//
// Checks:
//  A. Trivia ends at its deadline with NO host action: a player who
//     answered everything, one who answered 3 and lost connection, one who
//     never answered. Every phone lands on results that say time ran out,
//     count toward the Cup, and say "Answered 3 of 10" / "Did not answer".
//     No Skip button anywhere. A phone whose clock is 10 minutes wrong
//     still shows the right time left (server-time countdown).
//  B. Closest Wins: a question whose 4 s run out moves on for everyone
//     without waiting for silent players.
//  C. Lobby: Impostor is labelled practice-only, the Official mode is
//     disabled, and Start starts practice. The Cup is the Individual Family Cup.
//  D. A tab that sends no protocol version (as one loaded before Sprint 3)
//     shows "refresh", can still play Math, and is marked untimed.
// Usage: node scripts/check-lifecycle.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { lifecycleDiagnosis } from "./lib/diagnose.mjs";

const SCALE = 0.1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function expectSoon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; }
    await sleep(250);
  }
  check(label, false, `not observed within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`);
  return false;
}
const text = async (loc) => ((await loc.textContent({ timeout: 2000 })) ?? "").replace(/\s+/g, " ").trim();

const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-lifecycle-"));
async function startServer() {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR, MCHEZO_LIFECYCLE_SCALE: String(SCALE), MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
  delete env.NODE_ENV;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  let port = null;
  for (let i = 0; i < 120 && port === null && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) port = Number(m[1]); else await sleep(250);
  }
  if (!port) throw new Error(`lifecycle server did not start: ${out.slice(-400)}`);
  return { child, port };
}
async function stopServer(proc) {
  proc.child.kill("SIGTERM");
  for (let i = 0; i < 20; i++) { if (proc.child.exitCode !== null || proc.child.signalCode !== null) return; await sleep(250); }
  proc.child.kill("SIGKILL");
}

let BASE = "";
async function createRoom(page, name) {
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300);
  }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function startViaApi(host, gameId, official, seed = 1) {
  return await host.evaluate(async ({ gameId, official, seed }) => {
    const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/games`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") }, body: JSON.stringify({ gameId, official, seed }) });
    const body = await r.json();
    if (!r.ok) throw new Error(`start ${gameId} failed ${r.status}: ${JSON.stringify(body)}`);
    return body.gameId;
  }, { gameId, official, seed });
}
async function serverGame(page, gid) {
  return await page.evaluate(async (gid) => {
    const p = await (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=tv`)).json();
    return { serverNow: p.serverNow, game: (p.games ?? []).find((g) => g.id === gid) };
  }, gid);
}
const parseClock = (s) => { const m = /(\d+):(\d\d)/.exec(s ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

const server = await startServer();
BASE = `http://localhost:${server.port}`;
const browser = await launchChromium();
try {
  const vp = { viewport: { width: 390, height: 844 } };
  // A phone whose own clock is 10 minutes fast: countdowns must still be right.
  const adaCtx = await browser.newContext(vp);
  await adaCtx.addInitScript(() => { const real = Date.now.bind(Date); Date.now = () => real() + 10 * 60_000; });
  const ada = await adaCtx.newPage();
  const code = await createRoom(ada, "Ada");
  const beaCtx = await browser.newContext(vp);
  const bea = await beaCtx.newPage();
  await joinRoom(bea, "Bea", code);
  const calCtx = await browser.newContext(vp);
  const cal = await calCtx.newPage();
  await joinRoom(cal, "Cal", code);

  // ---- C. Lobby labels (before any game) ----
  await expectSoon("C. the lobby names the Individual Family Cup", async () => /Individual Family Cup/.test(await ada.evaluate(() => document.body.innerText)));
  await ada.getByTestId("choose-game").click();
  const impostorItem = ada.getByTestId("select-game-impostor");
  check("C. the game list marks Impostor practice only", /Practice only/.test(await text(impostorItem)));
  await impostorItem.click();
  await expectSoon("C. the practice-only reason is shown", async () => /practice-only/i.test(await text(ada.getByTestId("practice-only-note"))));
  check("C. the Official mode is disabled for Impostor", await ada.getByTestId("mode-official").isDisabled());
  check("C. Start starts practice", (await ada.getByTestId("start-practice-impostor").count()) === 1 && (await ada.getByTestId("start-official-impostor").count()) === 0);
  await ada.getByTestId("practice-only-note").scrollIntoViewIfNeeded();
  await ada.screenshot({ path: screenshotPath("docs/sprint-3-screenshots/01-lobby-practice-only.png") });
  await ada.getByTestId("choose-game").click();
  await ada.getByTestId("select-game-trivia").click();

  // ---- A. Trivia ends at its deadline ----
  const gid = await startViaApi(ada, "trivia", true, 3);
  await passBriefing([ada, bea, cal]); // D3: everyone taps I'm ready; the clock starts then
  for (const p of [ada, bea, cal]) await p.locator(".mz-question").waitFor({ timeout: 20000 });
  await answerKitQuestions(ada, { player: "Ada", choose: () => 0 });
  const answered = await answerKitQuestions(bea, { player: "Bea", choose: () => 1, limit: 3 });
  check("A. Bea answered 3", answered === 3);
  await beaCtx.setOffline(true);
  // Ada waits: the countdown is visible and right even though her phone's clock is 10 min fast.
  const clock = ada.getByTestId("mz-game-clock");
  await expectSoon("A. the waiting screen shows a countdown", async () => (await clock.count()) === 1 && /\d:\d\d/.test(await text(clock)));
  const { serverNow, game } = await serverGame(cal, gid);
  const shown = parseClock(await text(clock));
  const truth = Math.round((game.deadlineAt - serverNow) / 1000);
  check("A. the countdown uses server time, not the phone's wrong clock", shown !== null && Math.abs(shown - truth) <= 3, `shown ${shown}s, server says ${truth}s`);
  check("A. no Skip button for the host", (await ada.getByRole("button", { name: /skip/i }).count()) === 0);
  // Workstream H: the failure diagnosis reads both sides correctly.
  const diagAda = await lifecycleDiagnosis(ada, "Ada");
  check("H. diagnosis while waiting: server playing, deadline ahead, type waiting-on-players", /game=trivia\(.*\) server=playing .*deadlineIn=\d+s .*submitted=2\/3 .*type=waiting-on-players/.test(diagAda), diagAda);
  const diagBea = await lifecycleDiagnosis(bea, "Bea");
  check("H. diagnosis for an offline phone says the server is unreachable", /type=server-unreachable/.test(diagBea), diagBea);
  check("A. the waiting screen says the game ends by itself", (await ada.getByTestId("mz-ends-by-itself").count()) === 1);
  await ada.screenshot({ path: screenshotPath("docs/sprint-3-screenshots/02-waiting-countdown.png") });

  // Nobody does anything more. The deadline (about 36 s after the start) ends the game.
  const waitMs = Math.max(0, game.deadlineAt - serverNow) + 15_000;
  await expectSoon("A. Ada's phone reaches the results with no host action", async () => (await ada.getByTestId("mz-outcome").count()) === 1, waitMs);
  await expectSoon("A. Cal's phone reaches the results too", async () => (await cal.getByTestId("mz-outcome").count()) === 1, 15000);
  const outcome = ada.getByTestId("mz-outcome");
  check("A. results say time ran out", (await outcome.getAttribute("data-reason")) === "deadline" && /Time’s up/.test(await text(ada.getByTestId("mz-outcome-headline"))));
  check("A. results say it counts toward the Family Cup", (await outcome.getAttribute("data-counts")) === "true" && /Counts toward/.test(await text(ada.getByTestId("mz-outcome-counts"))));
  check("A. Ada: Answered 10 of 10", /You: Answered 10 of 10 questions/.test(await text(ada.getByTestId("mz-outcome-mine"))));
  const everyone = await text(ada.getByTestId("mz-outcome-everyone"));
  check("A. Ada sees Bea: Answered 3 of 10", /Bea: Answered 3 of 10 questions/.test(everyone), everyone);
  check("A. Ada sees Cal: Did not answer (never 'abstained')", /Cal: Did not answer/.test(everyone) && !/abstain|sat out/i.test(everyone), everyone);
  check("A. Cal's own line: Did not answer", /You: Did not answer/.test(await text(cal.getByTestId("mz-outcome-mine"))));
  const diagEnd = await lifecycleDiagnosis(cal, "Cal");
  check("H. diagnosis after the end: server finished with outcome deadline, Cal 0/10", /server=finished .*outcome=deadline mine=0\/10 .*shownOutcome=deadline \| type=finished-and-shown/.test(diagEnd), diagEnd);
  await ada.getByTestId("mz-outcome").scrollIntoViewIfNeeded();
  await ada.screenshot({ path: screenshotPath("docs/sprint-3-screenshots/03-results-deadline.png") });
  // Bea's connection comes back: she sees the same results with her partial count.
  await beaCtx.setOffline(false);
  await expectSoon("A. Bea, back online, sees the results", async () => (await bea.getByTestId("mz-outcome").count()) === 1, 30000);
  check("A. Bea: Answered 3 of 10", /You: Answered 3 of 10 questions/.test(await text(bea.getByTestId("mz-outcome-mine"))));
  const final = await serverGame(cal, gid);
  const ids = await cal.evaluate(async () => Object.fromEntries(((await (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=tv`)).json()).players ?? []).map((p) => [p.displayName, p.id])));
  const beaScore = final.game.rawScores[ids.Bea];
  check("A. server: Bea scored only her 3 answers (0-360, a multiple of 120)", [0, 120, 240, 360].includes(beaScore), String(beaScore));
  check("A. server: Cal scored 0 and is still ranked (not dropped)", final.game.rawScores[ids.Cal] === 0, JSON.stringify(final.game.rawScores));
  check("A. server: outcome is deadline and counts", final.game.outcome?.reason === "deadline" && final.game.countsOfficially === true);

  // Back to the lobby on all phones.
  for (const p of [ada, bea, cal]) {
    const back = p.getByRole("button", { name: "Back to lobby" });
    if (await back.count()) await back.first().click().catch(() => {});
  }
  await sleep(500);

  // ---- B. Closest Wins: a question's 4 s run out ----
  const cgid = await startViaApi(ada, "closest-wins", false);
  await passBriefing([ada, bea, cal]); // D3
  await ada.getByTestId("mz-num-input").waitFor({ timeout: 20000 });
  const roundClock = ada.getByTestId("mz-game-clock");
  await expectSoon("B. a per-question countdown is shown", async () => /Time left for this round/.test(await text(roundClock)) || /Time’s up/.test(await text(roundClock)), 5000);
  await ada.getByTestId("mz-num-input").fill("330");
  await ada.getByRole("button", { name: /Lock in|Submit/i }).first().click().catch(() => {});
  await expectSoon("B. the question moves on for everyone without waiting for silent players", async () => {
    const g = (await serverGame(cal, cgid)).game;
    return g?.lifecycle?.phaseKey !== undefined && g.lifecycle.phaseKey !== "q:0";
  }, 15000);
  await expectSoon("B. Cal's screen shows the next question", async () => (await cal.getByTestId("mz-num-input").count()) === 1, 10000);
  check("no horizontal overflow on results/countdown screens", await ada.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // ---- D. An outdated tab is detected and told to refresh (owner decision) ----
  // Dee's tab behaves like one loaded before Sprint 3: it sends no protocol
  // version (stripped under the app), so the server can't time her Math.
  for (const p of [ada, bea, cal]) { const back = p.getByRole("button", { name: "Back to lobby" }); if (await back.count()) await back.first().click().catch(() => {}); }
  await expectSoon("D. Closest has ended (its questions time out)", async () => (await serverGame(cal, cgid)).game?.status === "finished", 60000);
  const deeCtx = await browser.newContext(vp);
  await deeCtx.addInitScript(() => {
    const nf = window.fetch.bind(window);
    window.fetch = (input, init) => { const h = new Headers(init?.headers ?? {}); h.delete("x-mchezo-protocol"); return nf(input, { ...init, headers: h }); };
    const NativeWS = window.WebSocket;
    window.WebSocket = function (url, protocols) { return new NativeWS(String(url).replace(/&protocol=\d+/, ""), protocols); };
    window.WebSocket.prototype = NativeWS.prototype;
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });
  const dee = await deeCtx.newPage();
  const deeErrors = [];
  dee.on("pageerror", (e) => deeErrors.push(String(e.message)));
  try {
    await dee.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await dee.getByPlaceholder("e.g. Auntie June").fill("Dee");
    await dee.locator(".mz-code__input").fill(code);
    await dee.getByRole("button", { name: "Join the game" }).click();
    // Joining right after a game ended shows that game's results first (existing behaviour).
    const back = dee.getByTestId("show-back-to-lobby");
    if (await back.waitFor({ timeout: 5000 }).then(() => true, () => false)) await back.click();
    await dee.getByRole("heading", { name: "You’re in, Dee." }).waitFor({ timeout: 15000 });
  } catch (e) {
    throw new Error(`Dee could not join: ${e.message.split("\n")[0]} | errors: ${deeErrors.join(" ; ")} | screen: ${(await dee.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 200)}`, { cause: e });
  }
  for (const p of [ada, bea, cal]) await p.getByRole("heading", { name: /You’re in/ }).waitFor({ timeout: 15000 }).catch(() => {});
  const mgid = await startViaApi(ada, "math-mayhem", false, 2);
  await passBriefing([ada, bea, cal, dee]); // D3: Dee's outdated tab can tap I'm ready too
  await dee.locator(".mz-question").waitFor({ timeout: 30000 });
  await expectSoon("D. the outdated tab shows the refresh banner", async () => (await dee.getByTestId("mz-refresh-banner").count()) === 1, 10000);
  check("D. the outdated tab can still play (the question is shown, not blank)", /= \?/.test(await text(dee.locator(".mz-question"))));
  await ada.locator(".mz-question").waitFor({ timeout: 30000 });
  check("D. an up-to-date phone shows no refresh banner", (await ada.getByTestId("mz-refresh-banner").count()) === 0);
  const ids2 = await cal.evaluate(async () => Object.fromEntries(((await (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=tv`)).json()).players ?? []).map((p) => [p.displayName, p.id])));
  const marked = await ada.evaluate(async (gid) => {
    const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/ledger`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } });
    return (await r.json()).filter((e) => e.type === "math-untimed-client" && e.gameInstanceId === gid).map((e) => e.playerId);
  }, mgid);
  check("D. the server marked only Dee as untimed for this game", JSON.stringify(marked) === JSON.stringify([ids2.Dee]), JSON.stringify(marked));
  await dee.screenshot({ path: screenshotPath("docs/sprint-3-screenshots/04-outdated-tab-refresh.png") });
  await dee.getByTestId("mz-refresh-later").click();
  check("D. 'Later' hides the banner so it never blocks answering", (await dee.getByTestId("mz-refresh-banner").count()) === 0);
  await dee.locator(".mz-slab:not([disabled])").nth(3).click({ timeout: 5000 });
  await expectSoon("D. the outdated tab can answer (even the bottom option)", async () => (await dee.locator('main[aria-label="Answer locked in"]').count()) === 1, 10000);
  await deeCtx.close();
} finally {
  await browser.close();
  await stopServer(server);
  rmSync(DATA_DIR, { recursive: true, force: true });
}
console.log(failures === 0 ? "LIFECYCLE ALL PASSED" : `LIFECYCLE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
