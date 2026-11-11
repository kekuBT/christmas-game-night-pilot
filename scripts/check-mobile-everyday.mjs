// Stage 8.1: mobile usability and solo presentation, end to end in the
// browser (docs/stage8/stage81.md §5). Chromium emulation only: no WebKit,
// no real phones.
//
//   A  the solo shelf at 320×640, 390×844, 844×390 (a phone held sideways)
//      and 1440×900: no sideways overflow, no control under 44 px, every
//      card keeps its words, best and note; compact phone cards (two Start
//      buttons on a 390×844 screen) and a grid wider up (all three on desktop).
//   B  solo Pattern Pulse on a phone whose clock is 10 minutes fast: the game
//      time between patterns is the server's (deadline − server time), one
//      clock per screen, and it says it keeps running; then a complete solo
//      Math Mayhem journey with Play again.
//   C  ITS OWN server with a short game window (MCHEZO_LIFECYCLE_SCALE, tests
//      only): time runs out while the ready screen is open. The clock turns
//      low, three announcements only (under a minute, under 20 s, time up),
//      Show me the pattern gives way to a status, then the results.
//   D  a phone held sideways (844×390): Pattern Pulse's ready and tap-back
//      screens and Math Mayhem's answers fit without scrolling, and the solo
//      bar stays on screen.
//   E  a casual room with the longest names (24 characters), host at 390×844
//      and guest at 320×640: lobby, briefing, Pattern Pulse in a room (one
//      clock per screen), results with What's next, Play again, results again;
//      no overflow, names wrap, controls in view.
// Usage: node scripts/check-mobile-everyday.mjs <baseUrl>   (the gate passes its server)
import { execSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { slabNumber, solveMath } from "./lib/math-solve.mjs";

const GATE_BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
const text = async (loc) => ((await loc.innerText({ timeout: 5000 })) ?? "").replace(/\s+/g, " ").trim();
const shots = [];
async function shot(page, name, screen) {
  const vp = page.viewportSize();
  const path = screenshotPath(`docs/stage8/screenshots-81/driver/${name}-${vp.width}x${vp.height}.png`);
  await sleep(300);
  await page.screenshot({ path });
  shots.push({ path, file: basename(path), screen, viewport: `${vp.width}×${vp.height}` });
}
function writeManifest() {
  if (!shots.length) return;
  let revision = "unknown", clean = false;
  try { revision = execSync("git rev-parse HEAD").toString().trim(); clean = execSync("git status --porcelain --untracked-files=no").toString().trim() === ""; } catch { /* not a checkout */ }
  writeFileSync(join(dirname(shots[0].path), "manifest.json"), JSON.stringify({ revision, workingTreeClean: clean, capturedAt: new Date().toISOString(), by: "scripts/check-mobile-everyday.mjs", note: "Chromium headless (Playwright) emulation only; not a real iPhone or Android device, not WebKit.", shots: shots.map(({ file, screen, viewport }) => ({ file, screen, viewport })) }, null, 2) + "\n");
}

/**
 * The page as laid out now: sideways overflow of the page itself, elements
 * past the screen's edges (outside any container that scrolls sideways on
 * purpose), visible controls under 44 px, and text clipped inside its box.
 */
async function layout(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest(".mz-sr"); };
    const inSidewaysScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if ((s.overflowX === "auto" || s.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    const label = (el) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 24)}"`;
    const offscreen = [...document.querySelectorAll("body *")].filter((el) => visible(el) && !inSidewaysScroller(el) && (() => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; })()).slice(0, 5).map(label);
    const small = [...document.querySelectorAll("button, input, select, textarea, a[href]")].filter((el) => visible(el) && !el.disabled && (() => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44; })()).map((el) => `${label(el)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
    const clipped = [...document.querySelectorAll("body *")].filter((el) => { if (!visible(el) || el.children.length > 0) return false; const s = getComputedStyle(el); return (s.overflowX === "hidden" || s.overflow === "hidden" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1 && (el.textContent ?? "").trim().length > 0; }).slice(0, 5).map(label);
    return { pageOverflow: document.documentElement.scrollWidth - vw, offscreen, small, clipped };
  });
}
/** Let entrance animations finish (a control mid-entrance is scaled to .99: 43.6 px for a 44 px floor). */
async function settled(page) {
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming?.().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 2000)),
  ]));
}
async function checkLayout(page, where, { allowSmall = [] } = {}) {
  await settled(page);
  const l = await layout(page);
  const small = l.small.filter((s) => !allowSmall.some((a) => s.includes(a)));
  check(`${where}: no sideways overflow, nothing past the screen's edges`, l.pageOverflow <= 1 && l.offscreen.length === 0, JSON.stringify({ pageOverflow: l.pageOverflow, offscreen: l.offscreen }));
  check(`${where}: no control smaller than 44 px`, small.length === 0, small.join("; "));
  check(`${where}: no text clipped inside its box`, l.clipped.length === 0, l.clipped.join("; "));
  return l;
}
/**
 * Which of these font families are installed on this machine. A font is
 * installed when text set in it (with a generic fallback) measures differently
 * from the generic fallback alone, checked against two generics.
 * (document.fonts.check can't tell: it says true for any font not loaded as a web font.)
 */
async function installedFonts(browser, families) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const found = await p.evaluate((fams) => {
    const c = document.createElement("canvas").getContext("2d");
    const w = (font) => { c.font = font; return c.measureText("mmmmmmmmmmlliWWWQQ1234567890 abc").width; };
    return fams.filter((f) => ["monospace", "serif"].some((g) => w(`32px "${f}", ${g}`) !== w(`32px ${g}`)));
  }, families);
  await ctx.close();
  return found;
}
/** The element is entirely on screen as things stand (no scrolling). */
async function inView(loc) {
  const box = await loc.boundingBox();
  if (!box) return false;
  const vp = await loc.page().evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  return box.x >= -1 && box.y >= -1 && box.x + box.width <= vp.w + 1 && box.y + box.height <= vp.h + 1;
}
const parseClock = (s) => { const m = /(\d+):(\d\d)/.exec(s ?? ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** The solo round's truth from the server, read with this page's own solo seat. */
async function soloTruth(page) {
  return page.evaluate(async () => {
    const seat = JSON.parse(localStorage.getItem("mchezo.solo.v1") ?? sessionStorage.getItem("mchezo.solo.v1") ?? "null");
    if (!seat) return null;
    const r = await fetch(`/rooms/${seat.roomId}/projection?audience=player`, { headers: { "x-session-token": seat.token } });
    const p = await r.json();
    const g = (p.myGames ?? []).find((x) => x.status === "playing") ?? (p.myGames ?? []).at(-1);
    return { serverNow: p.serverNow, deadlineAt: g?.deadlineAt, status: g?.status, gameId: g?.gameId, results: g?.state?.results?.length ?? 0 };
  });
}
async function playMath(page) {
  for (let i = 0; i < 10; i++) {
    const slabs = page.locator(".mz-slab:not([disabled])");
    await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
    for (let k = 0; k < 50 && (await slabs.count()) !== 4; k++) await sleep(100);
    const answer = solveMath(await page.locator("h1.mz-question").innerText());
    const labels = (await slabs.allInnerTexts()).map(slabNumber);
    await slabs.nth(Math.max(0, labels.indexOf(answer))).click();
    if (i < 9) { await page.getByTestId("mz-math-next").waitFor({ timeout: 20000 }); await page.getByTestId("mz-math-next").click(); }
  }
  await page.getByTestId("solo-results").waitFor({ timeout: 20000 });
}

// ---- The own server (C): the gate's build, game time limits scaled down ----
const SCALE = 0.1; // Pattern Pulse's 5-minute window becomes 30 s
async function startServer() {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: mkdtempSync(join(tmpdir(), "mz-mobile81-")), MCHEZO_LIFECYCLE_SCALE: String(SCALE) };
  delete env.NODE_ENV;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  let port = null;
  for (let i = 0; i < 160 && port === null && child.exitCode === null; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
  if (!port) throw new Error(`short-window server did not start: ${out.slice(-400)}`);
  return { child, base: `http://localhost:${port}` };
}

const browser = await launchChromium();
let own = null;
try {
  // ---- A. The solo shelf ----
  const VIEWS = [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }];
  for (const vp of VIEWS) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/solo`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
    await sleep(300);
    const where = `A ${vp.width}×${vp.height} shelf`;
    await checkLayout(p, where);
    const cards = p.locator(".mz-solo__card");
    const boxes = [];
    for (let i = 0; i < 3; i++) boxes.push(await cards.nth(i).boundingBox());
    let wordsKept = true;
    for (const id of ["math-mayhem", "pattern-pulse", "word-connections"]) {
      const card = p.getByTestId(`solo-game-${id}`);
      wordsKept &&= (await card.locator(".mz-solo__desc").innerText()).length > 20 && /players/.test(await card.locator(".mz-solo__meta").innerText()) && /personal best/i.test(await card.getByTestId(`solo-best-${id}`).innerText());
    }
    check(`${where}: every card keeps its description, players and time, and its personal best line`, wordsKept);
    check(`${where}: Word Connections keeps its note that the best spans boards`, /across boards/.test(await text(p.getByTestId("solo-note-word-connections"))));
    const startH = (await p.getByTestId("solo-start-math-mayhem").boundingBox())?.height ?? 0;
    check(`${where}: Start is a full-size target (at least 52 px tall)`, startH >= 52, `${Math.round(startH)} px`);
    if (vp.width < 600) {
      check(`${where}: the cover is a small square beside the title, not a banner`, ((await p.locator(".mz-solo__cover").first().boundingBox())?.width ?? 999) <= 90);
      // R81-01: the cards must stay compact whatever font the phone renders.
      // The app names Figtree and Inter but loads no web font, so most phones
      // and machines fall back to their own (DejaVu Sans on many Linux
      // machines, the widest common one). Measured with the page's own font
      // and with every fallback installed here, each forced in turn.
      const cap = vp.width === 320 ? 320 : 300;
      const fonts = [null, ...(await installedFonts(browser, ["DejaVu Sans", "Liberation Sans", "FreeSans"]))];
      const results = [];
      for (const fam of fonts) {
        const fctx = await browser.newContext({ viewport: vp });
        const fp = await fctx.newPage();
        await fp.goto(`${GATE_BASE}/solo`, { waitUntil: "domcontentloaded" });
        await fp.getByTestId("solo-home").waitFor({ timeout: 15000 });
        if (fam) await fp.addStyleTag({ content: `:root, :root * { --mz-font-body: "${fam}" !important; --mz-font-display: "${fam}" !important; }` });
        await settled(fp);
        const m = await fp.evaluate(() => ({
          heights: [...document.querySelectorAll(".mz-solo__card")].map((el) => Math.round(el.getBoundingClientRect().height)),
          family: getComputedStyle(document.querySelector(".mz-solo__desc")).fontFamily.split(",")[0].replace(/"/g, "").trim(),
        }));
        const firsts = vp.width === 320
          ? (await inView(fp.getByTestId("solo-start-math-mayhem"))) && (await fp.locator(".mz-solo__title").nth(1).evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight))
          : (await inView(fp.getByTestId("solo-start-math-mayhem"))) && (await inView(fp.getByTestId("solo-start-pattern-pulse")));
        results.push({ font: fam ?? `the page's own font stack (${m.family} first; whichever is installed renders)`, tallest: Math.max(...m.heights), heights: m.heights, firsts });
        await fctx.close();
      }
      const worst = results.reduce((a, b) => (b.tallest > a.tallest ? b : a));
      check(`${where}: compact cards with every font measured: each at most ${cap} px tall (before: 421–481)`, results.every((r) => r.tallest <= cap), results.map((r) => `${r.font}: ${r.heights.join("/")}`).join("; "));
      check(`${where}: ${vp.width === 320 ? "the first Start and the second game's title" : "two games' Start buttons"} on the first screen with every font measured`, results.every((r) => r.firsts), `worst ${worst.font} ${worst.tallest} px`);
      check(`${where}: fonts measured`, results.length >= 1, results.map((r) => r.font).join(", ") + (results.length === 1 ? " (no fallback font installed on this machine)" : ""));
    } else {
      check(`${where}: a grid: the first two games side by side`, Math.abs(boxes[0].y - boxes[1].y) < 2 && boxes[1].x > boxes[0].x + boxes[0].width - 1, JSON.stringify(boxes.map((b) => [Math.round(b.x), Math.round(b.y)])));
    }
    if (vp.width === 390) check(`${where}: two games' Start buttons on the first screen, no scrolling`, (await inView(p.getByTestId("solo-start-math-mayhem"))) && (await inView(p.getByTestId("solo-start-pattern-pulse"))));
    if (vp.width === 1440) {
      check(`${where}: all three games side by side, every Start on the first screen`, (await inView(p.getByTestId("solo-start-math-mayhem"))) && (await inView(p.getByTestId("solo-start-pattern-pulse"))) && (await inView(p.getByTestId("solo-start-word-connections"))) && Math.abs(boxes[0].y - boxes[2].y) < 2);
    }
    await shot(p, "01-solo-shelf", `The solo shelf (${vp.width}×${vp.height})`);
    await ctx.close();
  }

  // ---- B. Solo Pattern Pulse on a phone whose clock is 10 minutes fast; then a Math journey with Play again ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { const real = Date.now.bind(Date); Date.now = () => real() + 10 * 60_000; });
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("home-solo").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
    await p.getByTestId("solo-start-pattern-pulse").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
    const panel = p.getByTestId("mz-pp-gameclock");
    await soon("B the ready screen shows the game's time left", async () => (await panel.count()) === 1 && /\d:\d\d/.test(await text(p.getByTestId("mz-pp-gameclock-left"))));
    const t1 = await soonTruth(p);
    const shown1 = parseClock(await text(p.getByTestId("mz-pp-gameclock-left")));
    const truth1 = t1 ? Math.round((t1.deadlineAt - t1.serverNow) / 1000) : null;
    check("B the time left is the server's (deadline − server time), not this phone's clock (10 min fast)", shown1 !== null && truth1 !== null && Math.abs(shown1 - truth1) <= 3, `shown ${shown1}s, server ${truth1}s`);
    check("B it says plainly that the clock keeps running between patterns", /keeps running between patterns, even now/.test(await text(p.getByTestId("mz-pp-gameclock-note"))));
    check("B the number is a timer read on demand, not announced every second", (await p.getByTestId("mz-pp-gameclock-left").getAttribute("role")) === "timer" && (await p.getByTestId("mz-pp-gameclock-left").getAttribute("aria-live")) === "off");
    check("B with minutes left, nothing is announced", (await p.getByTestId("mz-pp-clock-say").innerText()) === "");
    check("B one clock on the ready screen (no second clock line above it)", (await p.getByTestId("mz-game-clock").count()) === 0);
    check("B no Sit the rest out in a solo round", (await p.getByTestId("mz-pp-sitout").count()) === 0);
    await checkLayout(p, "B 390×844 Pulse ready");
    await shot(p, "02-pulse-ready", "Pattern Pulse between patterns: the game time left, and that it keeps running");
    await p.getByTestId("mz-pp-open").click();
    await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
    check("B memorising: one game clock line", (await p.getByTestId("mz-game-clock").count()) === 1 && (await p.getByTestId("mz-pp-gameclock").count()) === 0);
    const memClock = parseClock(await text(p.getByTestId("mz-game-clock")));
    const t2 = await soonTruth(p);
    check("B …and it too is on the server's clock", memClock !== null && t2 && Math.abs(memClock - Math.round((t2.deadlineAt - t2.serverNow) / 1000)) <= 3, `shown ${memClock}s`);
    const pattern = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
    await p.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
    check("B tapping back: one game clock line", (await p.getByTestId("mz-game-clock").count()) === 1);
    for (const s of pattern) await p.getByTestId(`mz-pp-key-${s}`).click();
    await p.getByTestId("mz-pp-submit").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 15000 });
    await soon("B round 2's ready screen: the game time has kept running", async () => { const s = parseClock(await text(p.getByTestId("mz-pp-gameclock-left"))); return s !== null && s < shown1; });
    await p.getByTestId("solo-leave").click();
    await p.getByTestId("solo-leave-yes").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 10000 });

    // A complete solo journey with replay: Math Mayhem, results, Play again, results.
    await p.getByTestId("solo-start-math-mayhem").click();
    await playMath(p);
    check("B Math results: the score, and Play again on the first screen", (await p.getByTestId("solo-score").isVisible()) && (await inView(p.getByTestId("solo-play-again"))));
    await checkLayout(p, "B 390×844 solo results");
    await shot(p, "03-solo-results", "Solo Math Mayhem results with Play again");
    await p.getByTestId("solo-play-again").click();
    await playMath(p);
    check("B Play again: a second round played to its results", /\d/.test(await text(p.getByTestId("solo-score"))));
    await p.getByTestId("solo-back").click();
    await soon("B back on the shelf, with the personal best on its card", async () => /Your personal best on this device: \d/.test(await text(p.getByTestId("solo-best-math-mayhem"))));
    await ctx.close();
  }

  // ---- C. Time runs out with the ready screen open (own server, a 30 s game) ----
  own = await startServer();
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${own.base}/solo/pattern-pulse`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-round-start").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
    // Every change on screen is recorded: what the live status said, and, at
    // each moment, whether Show me the pattern, the time-up status and the
    // results were there, and the clock's band.
    await p.evaluate(() => {
      window.__said = []; window.__moments = [];
      const q = (id) => document.querySelector(`[data-testid="${id}"]`);
      const seen = () => {
        const t = q("mz-pp-clock-say")?.textContent ?? "";
        if (t && window.__said.at(-1) !== t) window.__said.push(t);
        const m = { open: !!q("mz-pp-open"), up: !!q("mz-pp-timeup"), band: q("mz-pp-gameclock")?.getAttribute("data-band") ?? null, results: !!q("solo-results") };
        const last = window.__moments.at(-1);
        if (!last || JSON.stringify(last) !== JSON.stringify(m)) window.__moments.push(m);
      };
      seen();
      new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    await soon("C with under a minute left, the panel shows the warning tone, in words too", async () => ["low", "urgent"].includes(await p.getByTestId("mz-pp-gameclock").getAttribute("data-band")) && /Running low/.test(await text(p.getByTestId("mz-pp-gameclock-note"))));
    await shot(p, "04-pulse-ready-low", "Pattern Pulse between patterns with under a minute of game time left");
    // The server ends the game at its deadline and the next reply shows the
    // results, so on a fast connection the time-up status may last under a
    // second. Hold the room's replies from the last seconds (a slow
    // connection) so the screen's own clock reaches 0:00 first.
    await soon("C under 20 seconds: the clock turns urgent", async () => (await p.getByTestId("mz-pp-gameclock").getAttribute("data-band")) === "urgent", 30000);
    // Three seconds before the deadline the server stops answering (its
    // replies are held): first the plain time-up status, then, once nothing
    // has come back for a while, the honest version with a way on.
    await soon("C three seconds before the deadline", async () => (parseClock(await text(p.getByTestId("mz-pp-gameclock-left"))) ?? 99) <= 3, 25000);
    let hold = true;
    await p.route("**/projection**", async (route) => { while (hold) await sleep(200); await route.continue().catch(() => {}); });
    await soon("C time up on the ready screen: Show me the pattern gives way to a status", async () => (await p.getByTestId("mz-pp-timeup").count()) === 1 && (await p.getByTestId("mz-pp-open").count()) === 0, 15000);
    check("C …which says what happens next", /The game’s time is up\. Your results are on their way\./.test(await text(p.getByTestId("mz-pp-timeup"))));
    check("C …and nothing else on the screen can start a round (no Sit out, no Show me)", (await p.locator('[data-testid="mz-pp-ready"] button.mz-key').count()) === 0);
    await shot(p, "05-pulse-time-up", "Pattern Pulse: the game's time ran out on the ready screen");
    await soon("C the server still isn't answering: the status says so instead of promising results, and offers Check again", async () => (await p.getByTestId("mz-pp-timeup").getAttribute("data-stale")) === "true" && (await p.getByTestId("mz-pp-checkagain").isVisible()), 20000);
    check("C …in plain words", /isn’t answering right now/.test(await text(p.getByTestId("mz-pp-timeup"))) && !/on their way/.test(await text(p.getByTestId("mz-pp-timeup"))));
    check("C …with the reconnecting note and Leave round still there (never stuck)", (await p.getByTestId("solo-stale").isVisible()) && (await p.getByTestId("solo-leave").isVisible()));
    await shot(p, "05b-pulse-time-up-offline", "Pattern Pulse: time up while the game server isn't answering: Check again and Leave round");
    hold = false;
    await p.unrouteAll({ behavior: "ignoreErrors" });
    await p.getByTestId("mz-pp-checkagain").click();
    await soon("C the server answers again: Check again brings the results", async () => (await p.getByTestId("solo-results").count()) === 1, 10000);
    const truth = await soonTruth(p);
    const said = await p.evaluate(() => window.__said);
    const moments = await p.evaluate(() => window.__moments);
    check("C announcements: under a minute, under 20 seconds, time up, each once and nothing else", JSON.stringify(said) === JSON.stringify(["Under a minute of game time left.", "Under 20 seconds of game time left.", "The game’s time is up."]), JSON.stringify(said));
    check("C at no moment were Show me the pattern and time up on screen together", !moments.some((m) => m.open && (m.up || m.band === "up")), JSON.stringify(moments));
    check("C the screens went: ready (low) → time up → results (through the offline status)", (() => { const iUp = moments.findIndex((m) => m.up); const iRes = moments.findIndex((m) => m.results); return iUp > 0 && iRes > iUp && moments.slice(0, iUp).some((m) => m.open && (m.band === "low" || m.band === "urgent")); })(), JSON.stringify(moments.map((m) => `${m.open ? "open" : ""}${m.up ? "up" : ""}${m.results ? "results" : ""}:${m.band}`)));
    check("C the server ended the game at its deadline; no round was played", truth !== null && truth.status === "finished" && truth.results === 0, JSON.stringify(truth));
    await ctx.close();
  }

  // ---- C2. The same in a casual room: the guest's phone goes offline just before time runs out ----
  {
    const hctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const gctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const h = await hctx.newPage();
    const g = await gctx.newPage();
    await h.goto(`${own.base}/`, { waitUntil: "domcontentloaded" });
    await h.getByTestId("home-host").click();
    await h.getByPlaceholder("e.g. Auntie June").fill("Ada");
    await h.getByRole("button", { name: "Host a game" }).click();
    const chip = h.getByRole("button", { name: /^Share room code / });
    await chip.waitFor({ timeout: 15000 });
    let code = "";
    for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
    await g.goto(`${own.base}/join`, { waitUntil: "domcontentloaded" });
    await g.getByPlaceholder("e.g. Auntie June").fill("Bea");
    await g.locator(".mz-code__input").fill(code);
    await g.getByRole("button", { name: "Join the game" }).click();
    await g.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });
    await h.getByTestId("choose-game").click();
    await h.getByTestId("select-game-pattern-pulse").click();
    await h.locator('[data-testid="lobby-dock"] button.mz-key--block').first().click();
    await passBriefing([h, g]);
    await g.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
    await soon("C2 room: three seconds before the deadline on the guest's ready screen", async () => (parseClock(await text(g.getByTestId("mz-pp-gameclock-left"))) ?? 99) <= 3, 40000);
    await gctx.setOffline(true);
    await soon("C2 room: time up while the guest is offline: the status says the server isn't answering and offers Check again", async () => (await g.getByTestId("mz-pp-timeup").getAttribute("data-stale")) === "true" && (await g.getByTestId("mz-pp-checkagain").isVisible()), 40000);
    check("C2 …next to the room's own reconnecting banner", await g.getByTestId("mz-conn").isVisible());
    check("C2 …and no Show me the pattern or Sit the rest out", (await g.getByTestId("mz-pp-open").count()) === 0 && (await g.getByTestId("mz-pp-sitout").count()) === 0);
    await shot(g, "05c-room-pulse-time-up-offline", "Pattern Pulse in a room: time up while this phone is offline: Check again, beside the reconnecting banner");
    await gctx.setOffline(false);
    await g.getByTestId("mz-pp-checkagain").click().catch(() => {});
    await soon("C2 room: back online, Check again reconnects and the results show", async () => (await g.getByTestId("whats-next").count()) === 1 || (await g.getByTestId("mz-pp-results").count()) === 1, 30000);
    await hctx.close();
    await gctx.close();
  }

  // ---- D. A phone held sideways: nothing timed below the fold ----
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/solo`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-start-pattern-pulse").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
    await sleep(300);
    check("D 844×390 Pulse ready: the game clock and Show me the pattern on screen, no scrolling", (await inView(p.getByTestId("mz-pp-gameclock"))) && (await inView(p.getByTestId("mz-pp-open"))));
    check("D …and the solo bar's Leave round stays on screen", await inView(p.getByTestId("solo-leave")));
    await checkLayout(p, "D 844×390 Pulse ready");
    await shot(p, "06-pulse-ready-landscape", "Pattern Pulse between patterns, phone held sideways: two columns");
    await p.getByTestId("mz-pp-open").click();
    await p.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
    let allKeys = true;
    for (let s = 0; s < 6; s++) allKeys &&= await inView(p.getByTestId(`mz-pp-key-${s}`));
    check("D 844×390 tapping back: all six shapes and the Lock it in button on screen, no scrolling (before: below the fold)", allKeys && (await inView(p.getByTestId("mz-pp-submit"))) && (await inView(p.getByTestId("mz-pp-undo"))) && (await inView(p.getByTestId("mz-pp-slots"))));
    await checkLayout(p, "D 844×390 Pulse tap-back");
    await shot(p, "07-pulse-input-landscape", "Pattern Pulse tapping back, phone held sideways: shapes and Lock it in on screen");
    await p.getByTestId("solo-leave").click();
    await p.getByTestId("solo-leave-yes").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 10000 });
    await p.getByTestId("solo-start-math-mayhem").click();
    await p.locator("h1.mz-question").waitFor({ timeout: 20000 });
    for (let k = 0; k < 50 && (await p.locator(".mz-slab").count()) !== 4; k++) await sleep(100);
    let allSlabs = true;
    for (let i = 0; i < 4; i++) allSlabs &&= await inView(p.locator(".mz-slab").nth(i));
    check("D 844×390 Math Mayhem: all four answers on screen, no scrolling (before: the second row below the fold)", allSlabs);
    check("D …each still a full-size target", (await p.locator(".mz-slab").nth(3).boundingBox()).height >= 56);
    await shot(p, "08-math-landscape", "Math Mayhem, phone held sideways: all four answers on screen");
    await ctx.close();
  }

  // ---- D2. Sideways with larger text (130 % zoom: 650×300 CSS px on an 844×390 phone) ----
  // The screens may scroll then; they must never clip a control or shrink it under 44 px.
  {
    const ctx = await browser.newContext({ viewport: { width: 650, height: 300 } });
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/solo`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-start-pattern-pulse").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
    await p.getByTestId("mz-pp-open").click();
    await p.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
    await checkLayout(p, "D2 650×300 (130 %) Pulse tap-back");
    const keyIssues = await p.evaluate(() => [...document.querySelectorAll(".mz-pp-key")].map((k) => { const r = k.getBoundingClientRect(); const name = k.querySelector(".mz-pp-key__name"); return { h: r.height, clipped: !!name && name.scrollWidth > name.clientWidth + 1, font: name ? parseFloat(getComputedStyle(name).fontSize) : 0 }; }).filter((k) => k.h < 44 || k.clipped || k.font < 12));
    check("D2 every shape key at least 44 px, its name readable (12 px or more) and not clipped", keyIssues.length === 0, JSON.stringify(keyIssues));
    let reach = true;
    for (const id of ["mz-pp-key-0", "mz-pp-key-5", "mz-pp-undo", "mz-pp-submit"]) { await p.getByTestId(id).scrollIntoViewIfNeeded(); reach &&= await inView(p.getByTestId(id)); }
    check("D2 the screen scrolls rather than clipping: every shape, Undo and Lock it in can be scrolled to and shown whole", reach);
    await shot(p, "08b-pulse-input-landscape-130", "Pattern Pulse tapping back, sideways at 130 %: the screen scrolls, nothing clipped");
    await p.getByTestId("solo-leave").click();
    await p.getByTestId("solo-leave-yes").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 10000 });
    await p.getByTestId("solo-start-math-mayhem").click();
    await p.locator("h1.mz-question").waitFor({ timeout: 20000 });
    for (let k = 0; k < 50 && (await p.locator(".mz-slab").count()) !== 4; k++) await sleep(100);
    await checkLayout(p, "D2 650×300 (130 %) Math");
    const slabIssues = await p.evaluate(() => [...document.querySelectorAll(".mz-slab")].map((b) => { const r = b.getBoundingClientRect(); const l = b.querySelector(".mz-slab__label"); return { h: r.height, clipped: !!l && (l.scrollWidth > l.clientWidth + 1 || l.scrollHeight > b.clientHeight) }; }).filter((x) => x.h < 44 || x.clipped));
    check("D2 Math: every answer at least 44 px tall, its number not clipped", slabIssues.length === 0, JSON.stringify(slabIssues));
    let slabsReach = true;
    for (let i = 0; i < 4; i++) { await p.locator(".mz-slab").nth(i).scrollIntoViewIfNeeded(); slabsReach &&= await inView(p.locator(".mz-slab").nth(i)); }
    check("D2 Math: every answer can be scrolled to and shown whole", slabsReach);
    await ctx.close();
  }

  // ---- E. A casual room with the longest names ----
  {
    const HOST = "Bartholomew Featherstone"; // 24 characters, the most a name may have
    const GUEST = "Wolfeschlegelsteinhausen"; // 24 characters with no space to break at
    const hctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const gctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
    const h = await hctx.newPage();
    const g = await gctx.newPage();
    await h.goto(`${GATE_BASE}/`, { waitUntil: "domcontentloaded" });
    await h.getByTestId("home-host").click();
    await h.getByPlaceholder("e.g. Auntie June").fill(HOST);
    await h.getByRole("button", { name: "Host a game" }).click();
    const chip = h.getByRole("button", { name: /^Share room code / });
    await chip.waitFor({ timeout: 15000 });
    let code = "";
    for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
    await g.goto(`${GATE_BASE}/join`, { waitUntil: "domcontentloaded" });
    await g.getByPlaceholder("e.g. Auntie June").fill(GUEST);
    await g.locator(".mz-code__input").fill(code);
    await g.getByRole("button", { name: "Join the game" }).click();
    await g.getByRole("heading", { name: `You’re in, ${GUEST}.` }).waitFor({ timeout: 15000 });
    await soon("E the host's lobby shows both long names", async () => (await h.getByText(GUEST, { exact: false }).count()) > 0);
    await checkLayout(h, "E 390×844 host lobby");
    await checkLayout(g, "E 320×640 guest lobby");
    await shot(h, "09-casual-lobby-host", "Casual lobby, host, the longest names");
    await shot(g, "10-casual-lobby-guest", "Casual lobby, guest at 320 px, the longest names");
    await h.getByTestId("choose-game").click();
    await h.getByTestId("select-game-pattern-pulse").click();
    const start = h.locator('[data-testid="lobby-dock"] button.mz-key--block').first();
    await soon("E the host's Start is on the first screen", async () => inView(start));
    await start.click();
    await h.getByTestId("briefing").waitFor({ timeout: 20000 });
    await g.getByTestId("briefing").waitFor({ timeout: 20000 });
    await settled(g); await settled(h);
    check("E briefing: the guest's I'm ready is on the first screen, under the rules (320×640; before: below the fold)", await inView(g.getByTestId("briefing-ready")));
    check("E briefing: the host's I'm ready is on the first screen too (390×844)", await inView(h.getByTestId("briefing-ready")));
    // The host's other controls follow I'm ready: scrolled to, they are on
    // screen and not covered by it (the topmost element at their centre is them).
    await h.getByTestId("briefing-cancel").scrollIntoViewIfNeeded();
    await settled(h);
    const uncovered = async (loc) => { const b = await loc.boundingBox(); return !!b && (await loc.evaluate((el, pt) => { const top = document.elementFromPoint(pt.x, pt.y); return top === el || el.contains(top); }, { x: b.x + b.width / 2, y: b.y + b.height / 2 })); };
    check("E briefing: the host's Start now and Cancel game, scrolled to, are on screen and not covered", (await inView(h.getByTestId("briefing-cancel"))) && (await uncovered(h.getByTestId("briefing-cancel"))) && (await uncovered(h.getByTestId("briefing-start-now"))));
    await checkLayout(h, "E 390×844 host briefing");
    await checkLayout(g, "E 320×640 guest briefing");
    await shot(g, "11-casual-briefing-guest", "Casual briefing, guest at 320 px");
    async function playAndSitOut(label) {
      await passBriefing([h, g]);
      for (const [pg, who] of [[h, "host"], [g, "guest"]]) {
        await pg.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
        check(`${label} ${who}: Pattern Pulse in a room shows one game clock (the panel), not two`, (await pg.getByTestId("mz-pp-gameclock").count()) === 1 && (await pg.getByTestId("mz-game-clock").count()) === 0);
      }
      await checkLayout(g, `${label} 320×640 guest Pulse ready (room)`);
      await h.getByTestId("mz-pp-sitout").click();
      await g.getByTestId("mz-pp-sitout").click();
      await soon(`${label}: the results, with What's next, on both phones`, async () => (await h.getByTestId("whats-next").count()) === 1 && (await g.getByTestId("whats-next").count()) === 1, 30000);
    }
    await playAndSitOut("E game 1");
    check("E results: What's next and Play again on the host's first screen", (await inView(h.getByTestId("whats-next"))) && (await inView(h.getByTestId("next-play-again"))));
    check("E results: What's next on the guest's first screen (320×640)", await inView(g.getByTestId("whats-next")));
    await checkLayout(h, "E 390×844 host results");
    await checkLayout(g, "E 320×640 guest results");
    await shot(h, "12-casual-results-host", "Casual results with What's next, host");
    await shot(g, "13-casual-results-guest", "Casual results with What's next, guest at 320 px");
    await h.getByTestId("next-play-again").click();
    await playAndSitOut("E game 2 (Play again)");
    const proj = await h.evaluate(async () => { const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=player`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } }); return r.json(); });
    const finished = (proj.games ?? []).filter((x) => x.gameId === "pattern-pulse" && x.status === "finished").length;
    check("E Play again played a second game: two finished, nothing left open", finished === 2 && !(proj.games ?? []).some((x) => x.status === "playing" || x.status === "briefing"), `finished ${finished}`);
    await hctx.close();
    await gctx.close();
  }
} catch (e) {
  check("the run itself", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  writeManifest();
  await browser.close();
  if (own) own.child.kill("SIGTERM");
}

async function soonTruth(page) {
  for (let i = 0; i < 20; i++) { const t = await soloTruth(page).catch(() => null); if (t && typeof t.deadlineAt === "number") return t; await sleep(250); }
  return null;
}

console.log(failures ? `\n${failures} mobile check(s) FAILED` : "\nAll mobile everyday checks passed");
process.exit(failures ? 1 : 0);
