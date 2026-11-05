// Viewport hardening (Milestone K): no horizontal overflow at phone
// widths (320/360/390), tablet/desktop widths (768/1024), or TV sizes
// (1280x720, 1920x1080). The kit is phone-first (480px max), so the
// larger widths check that it centers instead of overflowing, and the
// TV sizes check that the big-screen stage and dashboard fit.
// Usage: build:web, serve on a port, then:
//   node scripts/check-viewports.mjs <baseUrl>
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function noOverflow(page, label) {
  await sleep(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(`no horizontal overflow at ${label}`, !overflow);
}
async function createRoom(page, name) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(500);
  }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function startGame(host, gameId) {
  await host.getByTestId("choose-game").click();
  await host.getByTestId(`select-game-${gameId}`).click();
  await host.getByTestId(`start-official-${gameId}`).click();
  try {
    await host.getByTestId("show-start-playing").click({ timeout: 3000 });
  } catch {
    await sleep(8500);
  }
}

const browser = await chromium.launch();
try {
  // Room 1: lobby + Trivia play + TV stage.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const bea = await ctx.newPage();
  await joinRoom(bea, "Bea", code);

  for (const w of [320, 360, 390, 768, 1024]) {
    await host.setViewportSize({ width: w, height: 844 });
    await noOverflow(host, `lobby ${w}px`);
  }
  await host.setViewportSize({ width: 390, height: 844 });
  await startGame(host, "trivia");
  await host.locator(".mz-question").waitFor({ timeout: 15000 });
  for (const w of [320, 390, 768, 1024]) {
    await host.setViewportSize({ width: w, height: 844 });
    await noOverflow(host, `trivia play ${w}px`);
  }

  // TV stage at TV sizes (spectator tab, so the phone view is untouched).
  const tv = await ctx.newPage();
  await tv.goto(BASE, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(code);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
  for (const [w, h] of [[1280, 720], [1920, 1080]]) {
    await tv.setViewportSize({ width: w, height: h });
    await noOverflow(tv, `TV stage ${w}x${h}`);
  }
  await ctx.close();

  // Room 2: Closest play at phone + larger widths.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host2 = await ctx2.newPage();
  const code2 = await createRoom(host2, "Ada");
  const bea2 = await ctx2.newPage();
  await joinRoom(bea2, "Bea", code2);
  await startGame(host2, "closest-wins");
  await host2.getByTestId("mz-num-dial").waitFor({ timeout: 15000 });
  for (const w of [320, 390, 768, 1024]) {
    await host2.setViewportSize({ width: w, height: 844 });
    await noOverflow(host2, `closest play ${w}px`);
  }
  // TV dashboard at 1920x1080 (Closest has no dedicated stage, so the
  // TV view falls through to the dashboard).
  const tv2 = await ctx2.newPage();
  await tv2.setViewportSize({ width: 1920, height: 1080 });
  await tv2.goto(BASE, { waitUntil: "domcontentloaded" });
  await tv2.locator(".mz-code__input").fill(code2);
  await tv2.getByTestId("watch-spectator").click();
  await tv2.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
  await noOverflow(tv2, "TV dashboard 1920x1080");
  await ctx2.close();
} finally {
  await browser.close();
}
console.log(failures === 0 ? "VIEWPORTS ALL PASSED" : `VIEWPORTS FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
