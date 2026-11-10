// Checkpoint screenshots of the integrated Mchezo application (real UI,
// fictional players only). Usage: build:web, serve on a port, then:
//   node scripts/screenshot-mchezo.mjs <baseUrl>
// Writes docs/mchezo-screenshots/*.png: landing, Circle lobby, Trivia
// question / locked / waiting / results (390px phone), TV stage while
// playing and leaderboard after finish (1280px).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:3457";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "mchezo-screenshots");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createRoom(page, name) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByTestId("host-kind-cup").click(); await page.getByRole("button", { name: "Host a game" }).click();
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
async function answerAllTrivia(page) {
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }).catch(() => false)) return;
    const slab = page.locator(".mz-slab:not([disabled])").first();
    if (await slab.isVisible({ timeout: 1500 }).catch(() => false)) { await slab.click(); await sleep(300); }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 1500 }).catch(() => false)) { await next.click(); await sleep(300); }
    const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
    if (await doneBtn.isVisible({ timeout: 1500 }).catch(() => false)) { await doneBtn.click(); await sleep(300); }
  }
}

const browser = await chromium.launch();
try {
  // Landing (phone).
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const landing = await phoneCtx.newPage();
  await landing.goto(BASE, { waitUntil: "domcontentloaded" });
  await landing.waitForTimeout(1200);
  await landing.screenshot({ path: join(OUT, "01-landing.png") });

  // Lobby with 4 players + a TV viewer.
  const host = await phoneCtx.newPage();
  const code = await createRoom(host, "Ada");
  const guests = [];
  for (const name of ["Bea", "Cal", "Dee"]) {
    const p = await phoneCtx.newPage();
    await joinRoom(p, name, code);
    guests.push(p);
  }
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tv = await tvCtx.newPage();
  await joinRoom(tv, "TV", code);
  await tv.getByRole("button", { name: "TV stage" }).click();
  await tv.getByText("TV Dashboard — public only").waitFor({ timeout: 15000 });
  await host.waitForTimeout(1500);
  await host.screenshot({ path: join(OUT, "02-lobby.png") });

  // Trivia: question, locked, waiting.
  await host.getByTestId("start-official-trivia").click();
  await host.locator(".mz-question").waitFor({ timeout: 30000 });
  await host.screenshot({ path: join(OUT, "03-trivia-question.png") });
  await tv.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
  await tv.screenshot({ path: join(OUT, "07-tv-question.png") });
  await host.locator(".mz-slab:not([disabled])").first().click();
  await host.locator('main[aria-label="Answer locked in"]').waitFor({ timeout: 15000 });
  await host.screenshot({ path: join(OUT, "04-trivia-locked.png") });
  await host.getByRole("button", { name: "Next question" }).click();
  await host.locator(".mz-question").waitFor({ timeout: 15000 });
  await answerAllTrivia(host);
  await host.getByText("All your answers are in").waitFor({ timeout: 15000 });
  await host.screenshot({ path: join(OUT, "05-trivia-waiting.png") });

  // Everyone finishes: results + TV leaderboard.
  for (const g of guests) await answerAllTrivia(g);
  await tv.getByRole("button", { name: "Back to phone view" }).click();
  await tv.locator(".mz-question").waitFor({ timeout: 30000 });
  await answerAllTrivia(tv);
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  await host.screenshot({ path: join(OUT, "06-trivia-results.png") });
  await tv.getByRole("button", { name: "Back to lobby" }).click({ timeout: 30000 });
  await tv.getByRole("button", { name: "TV stage" }).click();
  await tv.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
  await tv.waitForTimeout(3000); // leaderboard phase timing settles
  await tv.screenshot({ path: join(OUT, "08-tv-leaderboard.png") });
  console.log("screenshots written to", OUT);
} finally {
  await browser.close();
}
