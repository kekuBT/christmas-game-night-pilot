// M6 screenshot capture (Chromium, 390x844) into docs/m6-screenshots/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3461";
mkdirSync("docs/m6-screenshots", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const host = await ctx.newPage();
await host.goto(BASE, { waitUntil: "domcontentloaded" });
await host.screenshot({ path: "docs/m6-screenshots/01-landing.png" });
await host.getByPlaceholder("e.g. Auntie June").fill("Ada");
await host.getByTestId("host-kind-cup").click(); await host.getByRole("button", { name: "Host a game" }).click();
const shareChip = host.getByRole("button", { name: /^Share room code / });
await shareChip.waitFor({ timeout: 15000 });
let code = "";
for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
  code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
  if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
}
const guest = await ctx.newPage();
await guest.goto(BASE, { waitUntil: "domcontentloaded" });
await guest.getByPlaceholder("e.g. Auntie June").fill("Bea");
await guest.locator(".mz-code__input").fill(code);
await guest.getByRole("button", { name: "Join the game" }).click();
await guest.getByTestId("living-lobby").waitFor({ timeout: 15000 });
await host.screenshot({ path: "docs/m6-screenshots/02-living-lobby.png" });
// Impostor needs 3+ players; add a third before the Impostor shot.
const third = await ctx.newPage();
await third.goto(BASE, { waitUntil: "domcontentloaded" });
await third.getByPlaceholder("e.g. Auntie June").fill("Cal");
await third.locator(".mz-code__input").fill(code);
await third.getByRole("button", { name: "Join the game" }).click();
await third.getByTestId("living-lobby").waitFor({ timeout: 15000 });
const fourth = await ctx.newPage();
await fourth.goto(BASE, { waitUntil: "domcontentloaded" });
await fourth.getByPlaceholder("e.g. Auntie June").fill("Dee");
await fourth.locator(".mz-code__input").fill(code);
await fourth.getByRole("button", { name: "Join the game" }).click();
await fourth.getByTestId("living-lobby").waitFor({ timeout: 15000 });
await host.getByTestId("start-official-trivia").click();
await host.getByTestId("show-intro").waitFor({ timeout: 15000 });
await host.screenshot({ path: "docs/m6-screenshots/03-show-intro.png" });
await host.getByTestId("show-start-playing").click();
await host.getByTestId("game-panel").waitFor({ timeout: 15000 });
await host.screenshot({ path: "docs/m6-screenshots/04-trivia-tiles.png" });
async function answerAll(page) {
  for (let i = 0; i < 10; i++) {
    const tiles = page.locator(".answer-tile");
    if (await tiles.count() === 0) break;
    await tiles.first().click();
    await page.waitForTimeout(300);
  }
}
await answerAll(host);
await host.getByTestId("show-waiting").waitFor({ timeout: 15000 });
await host.screenshot({ path: "docs/m6-screenshots/05-waiting.png" });
for (const p of [guest, third, fourth]) {
  try { await p.getByTestId("show-start-playing").waitFor({ timeout: 15000 }); await p.getByTestId("show-start-playing").click(); }
  catch { /* intro already auto-advanced */ }
  await p.getByTestId("game-panel").waitFor({ timeout: 15000 });
  await answerAll(p);
}
await host.getByTestId("show-results").waitFor({ timeout: 30000 });
await host.screenshot({ path: "docs/m6-screenshots/06-results.png" });
await host.getByTestId("show-back-to-lobby").click();
await host.getByTestId("reactions").waitFor({ timeout: 15000 });
await host.getByRole("button", { name: "React 🎉" }).click();
await host.getByTestId("recent-reactions").waitFor({ timeout: 15000 });
await host.screenshot({ path: "docs/m6-screenshots/07-reactions.png" });
// Impostor role card (flipped).
await host.getByTestId("choose-game").click();
await host.getByTestId("select-game-impostor").click();
await host.getByTestId("start-practice-impostor").click();
try { await host.getByTestId("show-start-playing").waitFor({ timeout: 15000 }); await host.getByTestId("show-start-playing").click(); }
catch { /* intro already auto-advanced */ }
await host.getByTestId("game-panel").waitFor({ timeout: 15000 });
await host.getByTestId("role-card").click();
await host.waitForTimeout(500);
await host.screenshot({ path: "docs/m6-screenshots/08-impostor-role.png" });
await browser.close();
console.log("M6 screenshots done");
