// Solo rules first (handoff 7029967180, D-SR-01): every way into a solo game lands on its instructions, and only
// their one Start makes a round. Live playtests found the shelf opened a round before the rules could be read.
// For Math Mayhem, Pattern Pulse and Word Connections, on a small phone (320×568, mobile, touch), with every
// request the page makes to the game server counted (rooms made, rounds started, projection polls):
//   A. the shelf's How to play opens the instructions (one Start, the how-to text); waiting there makes no room,
//      starts no round and polls nothing;
//   B. browser Back to the shelf and Forward again, and C. re-entry from the shelf, still start nothing;
//   D. a rapid double tap on Start makes exactly one round (Pattern Pulse: its first pattern still waits for its
//      own in-round open action);
//   E. the round plays to its results, and F. Play again explicitly starts exactly one new round;
//   G. browser Back mid-round removes that round (the existing rule); re-entry lands on the instructions again;
//   H. a fresh device opening /solo/<game> directly, and a reload there, start nothing; one Start makes one round.
// Plus I: the same first entry at 375×667. Synthetic local data only. Starts ITS OWN server (port 0, temp data).
// Usage: node scripts/check-solo-rules.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { connectionsGroups } from "./lib/content-oracle.mjs";
import { slabNumber, solveMath } from "./lib/math-solve.mjs";
import { readPulsePattern } from "./lib/pulse-pattern.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; return ok; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}

const DATA = mkdtempSync(join(tmpdir(), "mz-solo-rules-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;

const GAMES = {
  "math-mayhem": { title: "Math Mayhem", howto: /^10 quick sums, four answers each\./ },
  "pattern-pulse": { title: "Pattern Pulse", howto: /^Watch a pattern of shapes, then tap it back in order\..*you open each round when you’re ready\.$/ },
  "word-connections": { title: "Word Connections", howto: /^Sort 16 words into four groups of four\./ },
};
const PHONE = (width, height) => ({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

/** Every request a context makes to the game server: rooms made, rounds started, projection polls. */
function traffic(ctx) {
  const t = { rooms: 0, starts: 0, polls: 0 };
  ctx.on("request", (r) => {
    const u = new URL(r.url());
    if (r.method() === "POST" && u.pathname === "/rooms") t.rooms++;
    else if (r.method() === "POST" && /^\/rooms\/[^/]+\/games$/.test(u.pathname)) t.starts++;
    else if (u.pathname.endsWith("/projection")) t.polls++;
  });
  return t;
}
const snap = (t) => ({ ...t });
const delta = (t, s) => ({ rooms: t.rooms - s.rooms, starts: t.starts - s.starts, polls: t.polls - s.polls });
const quiet = (d) => d.rooms === 0 && d.starts === 0 && d.polls === 0;
const seatOf = async (page) => JSON.parse((await page.evaluate(() => localStorage.getItem("mchezo.solo.v1"))) ?? "null");
async function serverGames(page) {
  const seat = await seatOf(page);
  if (!seat) return [];
  const r = await fetch(`${BASE}/rooms/${seat.roomId}/projection?audience=player`, { headers: { "x-session-token": seat.token } });
  return (await r.json()).games ?? [];
}
const openGames = async (page, gameId) => (await serverGames(page)).filter((g) => g.gameId === gameId && (g.status === "playing" || g.status === "briefing"));

/** The instructions screen: the game's how-to text and exactly one Start, and no round. */
async function onInstructions(page, gameId) {
  return (await page.getByTestId("solo-ready").isVisible()) && new URL(page.url()).pathname === `/solo/${gameId}`
    && GAMES[gameId].howto.test((await page.getByTestId("solo-howto").innerText()).trim())
    && (await page.getByTestId("solo-round-start").count()) === 1 && (await page.getByTestId("solo-round-start").innerText()).trim() === "Start"
    && (await page.getByTestId("solo-round").count()) === 0;
}

// ---- Playing each game to its results, through the screens (the server scores). ----
async function playMath(page) {
  for (let i = 0; i < 10; i++) {
    const slabs = page.locator(".mz-slab:not([disabled])");
    for (let k = 0; k < 200 && !((await page.locator("h1.mz-question").count()) > 0 && (await slabs.count()) === 4); k++) await sleep(100);
    const answer = solveMath(await page.locator("h1.mz-question").innerText());
    const labels = (await slabs.allInnerTexts()).map(slabNumber);
    await slabs.nth(Math.max(0, labels.indexOf(answer))).click();
    if (i < 9) { await page.getByTestId("mz-math-next").waitFor({ timeout: 20000 }); await page.getByTestId("mz-math-next").click(); }
  }
}
async function playPulse(page) {
  for (let i = 0; i < 6; i++) {
    await page.getByTestId("mz-pp-open").waitFor({ timeout: 30000 });
    await page.getByTestId("mz-pp-open").click();
    await page.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
    const pattern = await readPulsePattern(page);
    await page.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
    for (const s of pattern) await page.getByTestId(`mz-pp-key-${s}`).click();
    await page.getByTestId("mz-pp-submit").click();
    if (i < 5) await page.getByTestId("mz-pp-ready").waitFor({ timeout: 15000 });
  }
}
const tileFor = (p, w) => p.getByTestId("mz-cx-tile").filter({ hasText: new RegExp(`^\\s*${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") });
async function playConnections(page) {
  // Four wrong fours (two words from each of two groups, a different pair each time): the puzzle ends.
  await page.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  const groups = connectionsGroups((await page.getByTestId("mz-cx-tile").allInnerTexts()).map((w) => w.trim().toLowerCase()));
  for (let n = 0; n < 4; n++) {
    const [ga, gb] = [groups.at(-1), groups.at(-2)];
    for (const w of [ga[0], ga[1], gb[n % 4], gb[(n + 1) % 4]]) await tileFor(page, w).click();
    await page.getByTestId("mz-cx-submit").click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="mz-cx-tile"][aria-pressed="true"]').length === 0 || !document.querySelector('[data-testid="mz-cx-tile"]'), null, { timeout: 15000 });
  }
}
const PLAY = { "math-mayhem": playMath, "pattern-pulse": playPulse, "word-connections": playConnections };
/** The round is on screen and waiting for the player, not running ahead of them. */
async function roundShown(page, gameId) {
  if (!(await page.getByTestId("solo-round").isVisible())) return false;
  if (gameId === "pattern-pulse") return (await page.getByTestId("mz-pp-open").isVisible()) && (await page.getByTestId("mz-pp-memorise").count()) === 0;
  if (gameId === "word-connections") return (await page.getByTestId("mz-cx").count()) === 1;
  return (await page.locator("h1.mz-question").count()) === 1;
}

const browser = await launchChromium();
try {
  for (const [gameId, g] of Object.entries(GAMES)) {
    const W = `${g.title} (320 px)`;
    const ctx = await browser.newContext(PHONE(320, 568));
    try {
    const t = traffic(ctx);
    const page = await ctx.newPage();

    // ---- A. The shelf's How to play opens the instructions; waiting there starts nothing. ----
    await page.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("solo-home").waitFor({ timeout: 15000 });
    const card = page.getByTestId(`solo-start-${gameId}`);
    check(`A ${W}: the shelf's action says How to play, not Start`, (await card.innerText()).trim() === "How to play" && (await card.getAttribute("aria-label")) === `${g.title}: how to play`, (await card.innerText()).trim());
    let s = snap(t);
    await card.click();
    await soon(`A ${W}: How to play lands on the game's instructions, with one Start`, () => onInstructions(page, gameId), 10000);
    await sleep(3000); // a player reading the rules
    check(`A ${W}: waiting on the instructions made no room, started no round and polled nothing`, quiet(delta(t, s)), JSON.stringify(delta(t, s)));
    check(`A ${W}: still the instructions after waiting, no round on screen`, await onInstructions(page, gameId));
    check(`A ${W}: the server has no open round`, (await openGames(page, gameId)).length === 0);
    await page.screenshot({ path: screenshotPath(`docs/evidence/solo-rules/instructions-${gameId}-320.png`) });

    // ---- B. Back to the shelf and Forward again; C. re-entry from the shelf. ----
    await page.goBack();
    await soon(`B ${W}: browser Back from the instructions is the shelf`, async () => page.getByTestId("solo-home").isVisible(), 10000);
    await page.goForward();
    await soon(`B ${W}: browser Forward is the instructions again`, () => onInstructions(page, gameId), 10000);
    await page.getByTestId("nav-back").click();
    await page.getByTestId("solo-home").waitFor({ timeout: 10000 });
    await page.getByTestId(`solo-start-${gameId}`).click();
    await soon(`C ${W}: re-entry from the shelf is the instructions`, () => onInstructions(page, gameId), 10000);
    await sleep(1000);
    check(`B/C ${W}: Back, Forward and re-entry started nothing`, quiet(delta(t, s)), JSON.stringify(delta(t, s)));

    // ---- D. A rapid double tap on Start makes exactly one round. ----
    s = snap(t);
    await page.getByTestId("solo-round-start").dblclick();
    await soon(`D ${W}: Start begins the round`, () => roundShown(page, gameId), 20000);
    await sleep(1000);
    check(`D ${W}: a double tap on Start sent one start, not two`, delta(t, s).starts === 1, JSON.stringify(delta(t, s)));
    check(`D ${W}: the server has exactly one open round`, (await openGames(page, gameId)).length === 1);
    if (gameId === "pattern-pulse") check(`D ${W}: the first pattern still waits for its own open action`, (await page.getByTestId("mz-pp-open").isVisible()) && (await page.getByTestId("mz-pp-memorise").count()) === 0);

    // ---- E. Play to the results; F. Play again starts exactly one new round. ----
    await PLAY[gameId](page);
    await page.getByTestId("solo-results").waitFor({ timeout: 30000 });
    check(`E ${W}: the round plays to its results`, await page.getByTestId("solo-score").isVisible());
    const finished = (await serverGames(page)).filter((x) => x.gameId === gameId && x.status === "finished").length;
    s = snap(t);
    await page.getByTestId("solo-play-again").click();
    await soon(`F ${W}: Play again explicitly starts a new round`, () => roundShown(page, gameId), 20000);
    await sleep(500);
    check(`F ${W}: Play again sent exactly one start`, delta(t, s).starts === 1, JSON.stringify(delta(t, s)));
    const after = await serverGames(page);
    check(`F ${W}: the server has one open round and keeps the finished one`, after.filter((x) => x.gameId === gameId && (x.status === "playing" || x.status === "briefing")).length === 1 && after.filter((x) => x.gameId === gameId && x.status === "finished").length === finished);

    // ---- G. Browser Back mid-round removes the round; re-entry is the instructions. ----
    await page.goBack();
    await soon(`G ${W}: browser Back mid-round is the shelf`, async () => page.getByTestId("solo-home").isVisible(), 10000);
    await soon(`G ${W}: and the round is removed (the existing rule)`, async () => (await openGames(page, gameId)).length === 0, 10000);
    s = snap(t);
    await page.getByTestId(`solo-start-${gameId}`).click();
    await soon(`G ${W}: re-entry after a round is the instructions again`, () => onInstructions(page, gameId), 10000);
    await sleep(2000);
    check(`G ${W}: re-entry started nothing`, delta(t, s).starts === 0 && delta(t, s).rooms === 0, JSON.stringify(delta(t, s)));
    } catch (e) {
      check(`A–G ${W}: the rest of these steps could not run`, false, String(e.message ?? e).split("\n")[0]);
    } finally { await ctx.close(); }

    // ---- H. A fresh device opens /solo/<game> directly, then reloads; one Start makes one round. ----
    const dctx = await browser.newContext(PHONE(320, 568));
    try {
    const dt = traffic(dctx);
    const dp = await dctx.newPage();
    await dp.goto(`${BASE}/solo/${gameId}`, { waitUntil: "domcontentloaded" });
    await soon(`H ${W}: a direct URL on a fresh device lands on the instructions`, () => onInstructions(dp, gameId), 15000);
    await sleep(3000);
    check(`H ${W}: a direct URL made no room, started no round and polled nothing`, quiet(dt), JSON.stringify(dt));
    await dp.reload({ waitUntil: "domcontentloaded" });
    await soon(`H ${W}: after a reload, still the instructions`, () => onInstructions(dp, gameId), 15000);
    await sleep(2000);
    check(`H ${W}: the reload started nothing either`, quiet(dt), JSON.stringify(dt));
    await dp.getByTestId("solo-round-start").click();
    await soon(`H ${W}: one Start begins the round`, () => roundShown(dp, gameId), 20000);
    await sleep(500);
    check(`H ${W}: one Start sent one start`, dt.starts === 1, JSON.stringify(dt));
    check(`H ${W}: the server has exactly one open round`, (await openGames(dp, gameId)).length === 1);
    } catch (e) {
      check(`H ${W}: the rest of these steps could not run`, false, String(e.message ?? e).split("\n")[0]);
    } finally { await dctx.close(); }
  }

  // ---- I. The same first entry at 375×667. ----
  for (const [gameId, g] of Object.entries(GAMES)) {
    const ctx = await browser.newContext(PHONE(375, 667));
    const t = traffic(ctx);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
    await page.getByTestId(`solo-start-${gameId}`).click({ timeout: 15000 });
    await soon(`I ${g.title} (375 px): How to play lands on the instructions`, () => onInstructions(page, gameId), 10000);
    await sleep(2000);
    check(`I ${g.title} (375 px): nothing started`, quiet(t), JSON.stringify(t));
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "SOLO RULES ALL PASSED" : `SOLO RULES FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
