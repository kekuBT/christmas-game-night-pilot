// Handoff 7060711859: render the two compact UI options and check them. Static mockups only; the app is untouched.
//   node docs/design/compact-options/render.mjs [outDir] [--only=a|b] [--content=<capture metrics.json>]   (from the repository root)
//   [MCHEZO_CHROMIUM_PATH=<chrome-headless-shell>]
// For each option, screen, width and look (and the long-name and help variants) it checks:
//   - no sideways scroll on phones (320 and 390 px);
//   - every touch control (button, link, input) is at least 44 x 44 px; primary ones are marked data-primary;
//   - text contrast against its real background: 4.5:1, or 3:1 for large text (WCAG 2.2 AA);
//   - keyboard: Tab visits the controls in the intended order (data-tab) and each shows a visible focus ring.
// Writes <outDir>/option-{a,b}/<screen>-<width>-<look>[-<variant>].jpg and <outDir>/checks.json. Exit 1 on a failure.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join as joinPath, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium } from "../../../scripts/lib/driver-env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? joinPath(HERE, "shots"));
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7);
const OPTIONS = ["a", "b"].filter((o) => !only || o === only);
// --content=<metrics.json from capture-before.mjs>: render with the room code and places that match produced.
const contentArg = (process.argv.find((a) => a.startsWith("--content=")) ?? "").slice(10);
let CONTENT = "";
if (contentArg) {
  const m = JSON.parse(readFileSync(resolve(contentArg), "utf8"));
  const byPlace = Object.fromEntries(m.standings.map((r) => [r.place, r]));
  CONTENT = `&code=${m.roomCode}&p2=${byPlace[2].name}&p3=${byPlace[3].name}&ka=${byPlace[1].answers}`;
}
const PHONE_SCREENS = ["home", "lobby", "picker", "results"];
const PHONES = [{ w: 320, h: 568 }, { w: 390, h: 844 }];
const LOOKS = ["everyday", "christmas"];
const VARIANTS = ["", "long", "help"];
const BIG = [
  { screen: "desktop-lobby", w: 1280, h: 800, looks: ["everyday", "christmas"] },
  { screen: "tv-lobby", w: 1920, h: 1080, looks: ["everyday"] },
  { screen: "tv-results", w: 1920, h: 1080, looks: ["everyday", "christmas"] },
];
/** Screenshots kept for the proposal: every base screen; each variant once, at 320 px (long names in Everyday, help in Christmas). */
const keepShot = (variant, look, w) => !variant || (w === 320 && ((variant === "long" && look === "everyday") || (variant === "help" && look === "christmas")));

/** Runs in the page: the four checks for the screen on show. */
function pageChecks({ phone }) {
  const out = { overflow: null, targets: [], contrast: [], checkedText: 0 };
  const screen = document.querySelector("[data-screen]:not([hidden])");
  out.overflow = phone ? document.documentElement.scrollWidth > window.innerWidth + 1 : false;
  const hiddenUp = (el) => !!el.closest("[aria-hidden='true'],[hidden]");
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  // Touch targets (phones only).
  if (phone) {
    for (const el of screen.querySelectorAll("button, a[href], input, [role=button]")) {
      if (hiddenUp(el) || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.targets.push({ text: (el.getAttribute("aria-label") || el.textContent || el.placeholder || "").trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  // Contrast: each element with its own text, against the composited background behind it.
  const parse = (c) => {
    let m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
    m = /color\(srgb ([^)]+)\)/.exec(c);
    if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
    return null;
  };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== "none") return null; // text on art or a gradient: not measured
      const c = parse(s.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let col = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) col = over(layers[i], col);
    return col;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  for (const el of screen.querySelectorAll("*")) {
    if (hiddenUp(el) || !visible(el) || el.closest(".art,svg,[aria-disabled='true']")) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const s = getComputedStyle(el);
    const bg = bgOf(el);
    if (!bg) continue;
    let fg = parse(s.color); if (!fg) continue;
    let opacity = 1; for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    fg = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(s.fontSize); const bold = Number(s.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    out.checkedText++;
    if (ratio < need) out.contrast.push({ text: el.textContent.trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100, need });
  }
  return out;
}

const browser = await launchChromium();
const results = [];
let failures = 0;
const fileUrl = (option, screen, look, variant) => `${pathToFileURL(joinPath(HERE, "mockups", `option-${option}.html`)).href}?screen=${screen}&look=${look}${variant ? `&variant=${variant}` : ""}${CONTENT}`;
async function visit(option, screen, look, variant, w, h, { phone }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url().split("/").slice(-2).join("/")}`));
  await page.goto(fileUrl(option, screen, look, variant));
  await page.evaluate(() => document.fonts.ready);
  const fontsOk = await page.evaluate(() => document.fonts.check("700 16px Unbounded") && document.fonts.check("500 16px Figtree"));
  const c = await page.evaluate(pageChecks, { phone });
  // The same measures capture-before.mjs takes of the current app (CSS px, first screen, nothing scrolled),
  // read before the screenshot and the keyboard walk, which moves focus and can scroll the page.
  const measures = phone && !variant ? await page.evaluate(() => {
    const box = (k) => document.querySelector(`[data-screen]:not([hidden]) [data-measure="${k}"]`)?.getBoundingClientRect();
    const out = { scrollY: Math.round(window.scrollY) };
    const a = box("entry-start"), b = box("entry-end");
    if (a && b) out.entryHeight = Math.round(b.bottom - a.top);
    for (const k of ["featured", "dock"]) { const r = box(k); if (r) out[`${k}Height`] = Math.round(r.height); }
    for (const k of ["setting", "explained"]) { const r = box(k); if (r) out[`${k}Top`] = Math.round(r.top); }
    const games = [...document.querySelectorAll("[data-screen]:not([hidden]) [data-game]")];
    if (games.length) out.gamesFullyVisible = games.filter((g) => { const r = g.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }).length;
    return out;
  }) : undefined;
  // The screenshot first: the keyboard walk below moves focus and scrolls.
  const name = `${screen}-${w}-${look}${variant ? `-${variant}` : ""}`;
  if (keepShot(variant, look, w)) {
    mkdirSync(joinPath(OUT, `option-${option}`), { recursive: true });
    await page.screenshot({ path: joinPath(OUT, `option-${option}`, `${name}.jpg`), type: "jpeg", quality: 82 });
  }
  // Keyboard order and focus rings (phones, base variant): Tab through and read what is focused.
  let keyboard = null;
  if (phone && !variant) {
    const want = await page.evaluate(() => [...document.querySelectorAll("[data-screen]:not([hidden]) [data-tab]")].filter((e) => !e.closest("[hidden],[aria-hidden='true']") && e.getBoundingClientRect().width > 0).map((e) => Number(e.dataset.tab)).sort((a, b) => a - b));
    const got = []; const noRing = [];
    for (let i = 0; i < want.length; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); return { tab: Number(e.dataset.tab ?? NaN), ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 }; });
      if (!f) break;
      got.push(f.tab); if (!f.ring) noRing.push(f.tab);
    }
    keyboard = { want, got, inOrder: JSON.stringify(want) === JSON.stringify(got), noRing };
  }
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await ctx.close();
  const ok = !c.overflow && c.targets.length === 0 && c.contrast.length === 0 && errors.length === 0 && fontsOk && (!keyboard || (keyboard.inOrder && keyboard.noRing.length === 0));
  if (!ok) failures++;
  results.push({ option, screen, width: w, look, variant: variant || "base", ok, measures, sideScroll: c.overflow, smallTargets: c.targets, lowContrast: c.contrast, textChecked: c.checkedText, keyboard, fontsOk, errors, scrollHeight });
  console.log(`${ok ? "PASS" : "FAIL"} option-${option} ${name}${ok ? "" : ` ${JSON.stringify({ sideScroll: c.overflow, smallTargets: c.targets, lowContrast: c.contrast, keyboard, fontsOk, errors }).slice(0, 400)}`}`);
}

try {
  for (const option of OPTIONS) {
    for (const screen of PHONE_SCREENS) for (const v of PHONES) for (const look of LOOKS) for (const variant of VARIANTS) await visit(option, screen, look, variant, v.w, v.h, { phone: true });
    for (const b of BIG) for (const look of b.looks) await visit(option, b.screen, look, "", b.w, b.h, { phone: false });
  }
} finally {
  await browser.close();
}
mkdirSync(OUT, { recursive: true });
writeFileSync(joinPath(OUT, `checks${only ? `-${only}` : ""}.json`), JSON.stringify({ checked: results.length, failed: failures, results }, null, 1));
console.log(failures === 0 ? `ALL ${results.length} PASS` : `${failures} of ${results.length} FAILED`);
process.exit(failures === 0 ? 0 : 1);
