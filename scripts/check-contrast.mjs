// F6 contrast audit for Christmas Game Night, via Playwright + computed styles.
//
// Usage:
//   npm run build:web
//   PORT=3457 npm run serve &        # in one shell; stop it and `rm -rf data` after
//   node scripts/check-contrast.mjs [baseUrl]
//   npm run check-contrast           # same, defaults base http://localhost:3457
//
// For each main view (home, lobby, a live Math Mayhem panel, a finished
// game panel, championship, TV Dashboard, Memory Book), this samples every
// visible text element's computed foreground colour against its effective
// background colour (first non-transparent ancestor background) and checks
// the WCAG 2.1 contrast ratio: >= 4.5:1 for normal text, >= 3:1 for large
// text (>= 24px, or >= 18.66px bold). Disabled controls are reported as
// informational only — WCAG exempts inactive UI components from the
// contrast requirement, and the app dims them to 50% opacity by design.
// Exits non-zero if any active text pair fails. Fictional test players
// only; local server only.
// NOTE: this is Chromium computed-style emulation, NOT real-device
// confirmation — the manual real-device checklist stays open.

import { launchChromium } from "./lib/driver-env.mjs";
import { roomGo } from "./lib/room-nav.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3457";

function luminance(r, g, b) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(fg, bg) {
  const l1 = luminance(...fg);
  const l2 = luminance(...bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
const parseRgb = (s) => {
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  // CSS Color 4 `color(srgb r g b [/ a])` — used by Mchezo for the seat
  // name overlay. Values are 0-1; alpha is ignored because the overlay
  // sits over the dark ground, so the unblended dark value is the
  // conservative side for a light foreground.
  const c = s.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);
  return c ? [Math.round(Number(c[1]) * 255), Math.round(Number(c[2]) * 255), Math.round(Number(c[3]) * 255)] : null;
};

async function sampleView(page, view) {
  return page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      // Effective background: first non-transparent ancestor colour.
      let bg = null;
      let cur = el;
      while (cur && cur !== document.documentElement) {
        const c = getComputedStyle(cur).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") { bg = c; break; }
        cur = cur.parentElement;
      }
      if (!bg) bg = getComputedStyle(document.body).backgroundColor;
      const fg = cs.color;
      const disabled = el.closest("button:disabled, input:disabled, select:disabled, textarea:disabled") !== null
        || el.closest("[disabled]") !== null;
      out.push({
        text: text.slice(0, 60),
        fg, bg,
        size: parseFloat(cs.fontSize),
        weight: parseInt(cs.fontWeight, 10) || 400,
        disabled,
      });
    }
    return out;
  }).then((rows) => rows.map((r) => {
    const fg = parseRgb(r.fg);
    const bg = parseRgb(r.bg);
    const large = r.size >= 24 || (r.size >= 18.66 && r.weight >= 700);
    const need = large ? 3.0 : 4.5;
    const ratioVal = fg && bg ? ratio(fg, bg) : null;
    return { view, ...r, large, need, ratio: ratioVal, pass: ratioVal === null ? null : ratioVal >= need };
  }));
}

const failures = [];
const passes = [];
const info = [];
function report(view, samples) {
  const byPair = new Map();
  for (const s of samples) {
    const key = `${s.fg}|${s.bg}|${s.large ? "large" : "normal"}`;
    if (!byPair.has(key)) byPair.set(key, s);
  }
  for (const s of byPair.values()) {
    const label = `${view}: ${s.fg} on ${s.bg} (${s.large ? "large" : "normal"}, need ${s.need}:1)`;
    const detail = `ratio ${s.ratio === null ? "?" : s.ratio.toFixed(2)}:1 e.g. "${s.text}"`;
    if (s.disabled) { info.push(label); console.log(`  INFO (disabled, exempt) ${label} (${detail})`); }
    else if (s.pass) { passes.push(label); console.log(`  PASS ${label} (${detail})`); }
    else { failures.push(label); console.log(`  FAIL ${label} (${detail})`); }
  }
  console.log(`  (${view}: ${samples.length} text elements, ${byPair.size} unique colour pairs)`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Kit answer loop (same as e2e's actTrivia): slabs + Next question,
// then the "Waiting for the game to finish" keycap clears the last
// lock into the counts-only waiting ring. Answers every question.
async function answerQuiz(page) {
  for (let i = 0; i < 60; i++) {
    if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }).catch(() => false)) return;
    const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
    if (await doneBtn.isVisible({ timeout: 500 }).catch(() => false)) { await doneBtn.click(); await sleep(400); return; }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 500 }).catch(() => false)) { await next.click(); await sleep(400); continue; }
    const slabs = page.locator(".mz-slab:not([disabled])");
    if ((await slabs.count()) > 0) { await slabs.first().click(); await sleep(500); continue; }
    await sleep(500);
  }
}

const browser = await launchChromium({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await ctx.newPage();
  await host.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("e.g. Auntie June").waitFor({ timeout: 15000 });
  console.log("\n== home ==");
  report("home", await sampleView(host, "home"));

  await host.getByPlaceholder("e.g. Auntie June").fill("Alex");
  await host.getByTestId("host-kind-cup").click(); await host.getByRole("button", { name: "Host a game" }).click();
  const shareChip = host.getByRole("button", { name: /^Share room code / });
  await shareChip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
  }
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const joiner = await ctx2.newPage();
  await joiner.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await joiner.getByPlaceholder("e.g. Auntie June").fill("Sam");
  await joiner.locator(".mz-code__input").fill(code);
  await joiner.getByRole("button", { name: "Join the game" }).click();
  await joiner.getByRole("heading", { name: "You’re in, Sam." }).waitFor({ timeout: 15000 });
  console.log("\n== lobby ==");
  report("lobby", await sampleView(host, "lobby"));

    await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-math-mayhem").click();
  await host.locator('[data-testid="start-official-math-mayhem"]').click();
  // D3: the rules briefing is a new screen; sample it too, then both tap I'm ready.
  await host.getByTestId("briefing").waitFor({ timeout: 20000 });
  console.log("\n== briefing ==");
  report("briefing", await sampleView(host, "briefing"));
  await passBriefing([host, joiner]);
  // Kit panel since §11: the QuestionScreen's .mz-question is the gameplay signal.
  await host.locator(".mz-question").waitFor({ timeout: 20000 });
  console.log("\n== game playing ==");
  report("game-playing", await sampleView(host, "game-playing"));

  // Every player must answer each question before the game advances, so
  // drive both pages until the results screen appears (same pattern as
  // check-f4.mjs, which loops all players).
  // Math renders in the kit since §11, so there is no game-panel to
  // read "Status: finished" from — show-results is the finish signal.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await host.getByTestId("show-results").isVisible({ timeout: 500 }).catch(() => false)) break;
    await answerQuiz(host);
    await answerQuiz(joiner);
    await sleep(700);
  }
  await Promise.race([
    host.getByText("Status: finished").waitFor({ timeout: 20000 }).catch(() => {}),
    host.getByTestId("show-results").waitFor({ timeout: 20000 }).catch(() => {}),
  ]);
  console.log("\n== game finished ==");
  report("game-finished", await sampleView(host, "game-finished"));

  await roomGo(host, "cup");
  await host.getByText("Championship standings").waitFor({ timeout: 15000 });
  console.log("\n== championship ==");
  report("championship", await sampleView(host, "championship"));

  await roomGo(host, "tv");
  await host.getByTestId("tv-show").waitFor({ timeout: 15000 }); // Stage 5: the live show
  console.log("\n== TV (live show) ==");
  report("tv", await sampleView(host, "tv"));

  await roomGo(host, "memory");
  // Stage 10.3 (D-S103-06): the title follows the device's look (a Cup room shows Everyday: "Mchezo Memory Book").
  await host.getByTestId("memory-title").waitFor({ timeout: 15000 });
  // The Add button stays disabled until highlight text is entered.
  await host.getByPlaceholder("e.g. Ada won Math Mayhem in a tie-break").fill("Contrast test highlight: a close Math Mayhem finish");
  await host.getByRole("button", { name: "Add from last finished game" }).click();
  await host.getByText("Math Mayhem").first().waitFor({ timeout: 15000 });
  console.log("\n== memory book ==");
  report("memory-book", await sampleView(host, "memory-book"));

  await ctx.close();
  await ctx2.close();
} finally {
  await browser.close();
}

console.log(`\n${passes.length} unique pairs passed, ${failures.length} failed, ${info.length} disabled-info`);
if (failures.length > 0) { console.log("Failures:", failures.join("; ")); process.exit(1); }
console.log("CONTRAST CHECK OK");
