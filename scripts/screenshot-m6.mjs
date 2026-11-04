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
await host.getByPlaceholder("e.g. Ada").fill("Ada");
await host.getByRole("button", { name: "Create a room (host)" }).click();
await host.locator("header .pill", { hasText: /Code: [A-Z0-9]{6}/ }).waitFor({ timeout: 15000 });
const code = (await host.locator("header .pill").textContent()).replace("Code:", "").trim();
const guest = await ctx.newPage();
await guest.goto(BASE, { waitUntil: "domcontentloaded" });
await guest.getByPlaceholder("e.g. Ada").fill("Bea");
await guest.getByPlaceholder("e.g. K7M2Q9").fill(code);
await guest.getByRole("button", { name: "Join room" }).click();
await guest.getByTestId("living-lobby").waitFor({ timeout: 15000 });
await host.screenshot({ path: "docs/m6-screenshots/02-living-lobby.png" });
// Impostor needs 3+ players; add a third before the Impostor shot.
const third = await ctx.newPage();
await third.goto(BASE, { waitUntil: "domcontentloaded" });
await third.getByPlaceholder("e.g. Ada").fill("Cal");
await third.getByPlaceholder("e.g. K7M2Q9").fill(code);
await third.getByRole("button", { name: "Join room" }).click();
await third.getByTestId("living-lobby").waitFor({ timeout: 15000 });
const fourth = await ctx.newPage();
await fourth.goto(BASE, { waitUntil: "domcontentloaded" });
await fourth.getByPlaceholder("e.g. Ada").fill("Dee");
await fourth.getByPlaceholder("e.g. K7M2Q9").fill(code);
await fourth.getByRole("button", { name: "Join room" }).click();
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
await host.getByTestId("start-official-impostor").click();
try { await host.getByTestId("show-start-playing").waitFor({ timeout: 15000 }); await host.getByTestId("show-start-playing").click(); }
catch { /* intro already auto-advanced */ }
await host.getByTestId("game-panel").waitFor({ timeout: 15000 });
await host.getByTestId("role-card").click();
await host.waitForTimeout(500);
await host.screenshot({ path: "docs/m6-screenshots/08-impostor-role.png" });
await browser.close();
console.log("M6 screenshots done");
