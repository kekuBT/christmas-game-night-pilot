// F6 mobile/accessibility check for Christmas Game Night, via Playwright.
// Usage:
//   npm run build:web
//   PORT=3457 npm run serve &        # in one shell; stop it and `rm -rf data` after
//   node scripts/check-mobile.mjs [baseUrl] [--out dir]
//   npm run check-mobile               # same, defaults base http://localhost:3457
//
// For each portrait phone viewport (320, 375, 390px wide) this checks,
// through the real UI only:
//   - no horizontal overflow (scrollWidth <= innerWidth) on home, lobby,
//     and a live Math Mayhem game panel
//   - every visible button/input/textarea is >= 44px tall (touch target)
//   - keyboard Tab moves focus to interactive elements with a visible
//     :focus-visible outline
//   - prefers-reduced-motion: reduce is honoured (animations/transitions off)
// Screenshots land in docs/mobile-screenshots/<width>-<view>.png.
// Exits non-zero if any check fails. Fictional test players only.
// NOTE: this is Chromium viewport emulation, NOT real iPhone Safari —
// the real-device checklist stays open (see docs/PROGRESS.md).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3457";
const OUT = (args.find((a) => a.startsWith("--out=")) ?? "--out=docs/mobile-screenshots").split("=")[1];
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];

const failures = [];
const passes = [];
function check(label, ok, detail = "") {
  if (ok) { passes.push(label); console.log(`  PASS ${label}${detail ? ` (${detail})` : ""}`); }
  else { failures.push(label); console.log(`  FAIL ${label}${detail ? ` (${detail})` : ""}`); }
}

async function overflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}
async function smallTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll("button, input, textarea, select")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // hidden
      if (r.height < 44) bad.push(`${el.tagName.toLowerCase()}${el.textContent ? ` "${el.textContent.trim().slice(0, 24)}"` : ""} ${Math.round(r.height)}px`);
    }
    return bad;
  });
}
async function tabFocus(page, label) {
  // Tab through the page; every stop on a real control must be interactive
  // with a visible :focus-visible outline. BODY stops are Chromium's
  // end-of-tab-order wrap (past the last control focus returns via BODY)
  // and are not controls, so they are reported, not failed.
  const stops = [];
  await page.keyboard.press("Tab");
  for (let i = 0; i < 10; i++) {
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        outline: cs.outlineWidth,
        outlineStyle: cs.outlineStyle,
      };
    });
    if (!info) break;
    stops.push(info);
    await page.keyboard.press("Tab");
  }
  const controls = stops.filter((s) => s.tag !== "body");
  const interactive = controls.filter((s) => ["button", "input", "textarea", "select", "a"].includes(s.tag));
  const outlined = controls.filter((s) => s.outlineStyle !== "none" && parseFloat(s.outline) > 0);
  check(`${label}: Tab lands on interactive controls`, controls.length > 0 && interactive.length === controls.length, `${controls.length} control stops, ${interactive.length} interactive, ${stops.length - controls.length} body wrap stops`);
  check(`${label}: focused controls show a visible outline`, controls.length > 0 && outlined.length === controls.length, `${outlined.length}/${controls.length} outlined`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    console.log(`\n== viewport ${vp.width}x${vp.height} ==`);
    const ctx = await browser.newContext({
      viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    });
    const host = await ctx.newPage();
    await host.goto(BASE, { waitUntil: "domcontentloaded" });
    await host.getByPlaceholder("e.g. Ada").waitFor({ timeout: 15000 });
    await host.screenshot({ path: join(OUT, `${vp.width}-home.png`) });

    let o = await overflow(host);
    check(`${vp.width}px home: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `scrollWidth=${o.scrollWidth} innerWidth=${o.innerWidth}`);
    let bad = await smallTargets(host);
    check(`${vp.width}px home: all targets >= 44px`, bad.length === 0, bad.slice(0, 5).join("; "));
    // Enable the host button so keyboard order covers a button too (Join
    // stays disabled without a code, which correctly excludes it).
    await host.getByPlaceholder("e.g. Ada").fill("Alex");
    await tabFocus(host, `${vp.width}px home`);

    // Lobby: host creates, one joiner joins by code.
    await host.getByPlaceholder("e.g. Ada").fill("Alex");
    await host.getByRole("button", { name: "Create a room (host)" }).click();
    await host.locator("header .pill").waitFor({ timeout: 15000 });
    const code = (await host.locator("header .pill").textContent()).replace("Code:", "").trim();
    const ctx2 = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const joiner = await ctx2.newPage();
    await joiner.goto(BASE, { waitUntil: "domcontentloaded" });
    await joiner.getByPlaceholder("e.g. Ada").fill("Sam");
    await joiner.getByPlaceholder("e.g. K7M2Q9").fill(code);
    await joiner.getByRole("button", { name: "Join room" }).click();
    await joiner.getByText("Playing as Sam").waitFor({ timeout: 15000 });
    await host.screenshot({ path: join(OUT, `${vp.width}-lobby.png`) });
    o = await overflow(host);
    check(`${vp.width}px lobby: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `scrollWidth=${o.scrollWidth} innerWidth=${o.innerWidth}`);
    bad = await smallTargets(host);
    check(`${vp.width}px lobby: all targets >= 44px`, bad.length === 0, bad.slice(0, 5).join("; "));

    // Live game panel: host starts Math Mayhem (2 players), both answer one question.
    await host.locator('[data-testid="start-official-math-mayhem"]').click();
    await host.getByRole("heading", { name: "Now playing: math-mayhem" }).waitFor({ timeout: 20000 });
    await host.screenshot({ path: join(OUT, `${vp.width}-game.png`) });
    o = await overflow(host);
    check(`${vp.width}px game panel: no horizontal overflow`, o.scrollWidth <= o.innerWidth, `scrollWidth=${o.scrollWidth} innerWidth=${o.innerWidth}`);
    bad = await smallTargets(host);
    check(`${vp.width}px game panel: all targets >= 44px`, bad.length === 0, bad.slice(0, 5).join("; "));
    await tabFocus(host, `${vp.width}px game panel`);
    await ctx.close();
    await ctx2.close();
  }

  // Reduced motion: separate context with the preference emulated.
  console.log(`\n== reduced motion ==`);
  const rmCtx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 375, height: 667 } });
  const rm = await rmCtx.newPage();
  await rm.goto(BASE, { waitUntil: "domcontentloaded" });
  const rmOk = await rm.evaluate(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const btn = document.querySelector("button");
    const cs = btn ? getComputedStyle(btn) : null;
    return { m, transition: cs?.transitionDuration, animation: cs?.animationName };
  });
  check("reduced-motion media query matches", rmOk.m === true);
  check("reduced-motion disables transitions/animations", rmOk.transition === "0s" && (rmOk.animation === "none" || rmOk.animation === ""),
    `transition=${rmOk.transition} animation=${rmOk.animation}`);
  await rmCtx.close();
} finally {
  await browser.close();
}

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length > 0) { console.log("Failures:", failures.join("; ")); process.exit(1); }
console.log("MOBILE CHECK OK");
