// Checkpoint screenshots for the PR-ready packet (local only, fictional players).
// Usage:
//   npm run build:web
//   PORT=3457 npm run serve &        # stop it and `rm -rf data` after
//   node scripts/screenshot-checkpoint.mjs [baseUrl] [outDir]
// Captures: lobby, a game in play, finished scores, championship, TV dashboard,
// Memory Book. Exits non-zero if any capture step fails.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3457";
const OUT = process.argv[3] ?? "docs/checkpoint-screenshots";
const NAMES = ["Alex", "Sam", "Jo", "Kim"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  await host.screenshot({ path: `${OUT}/01-home.png` });
  await host.getByPlaceholder("e.g. Auntie June").fill(NAMES[0]);
  await host.getByRole("button", { name: "Host a game" }).click();
  const shareChip = host.getByRole("button", { name: /^Share room code / });
    await shareChip.waitFor({ timeout: 15000 });
    let code = "";
    for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
      code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
      if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
    }
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`unexpected room code: ${code}`);
  const pages = [{ page: host, name: NAMES[0] }];
  for (let i = 1; i < NAMES.length; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    pages.push({ page: p, name: NAMES[i] });
    await p.goto(BASE, { waitUntil: "domcontentloaded" });
    await p.getByPlaceholder("e.g. Auntie June").fill(NAMES[i]);
    await p.locator(".mz-code__input").fill(code);
    await p.getByRole("button", { name: "Join the game" }).click();
    await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  }
  for (const n of NAMES) await host.getByText(n, { exact: true }).first().waitFor({ timeout: 15000 });
  await host.screenshot({ path: `${OUT}/02-lobby-4-players.png`, fullPage: true });

    await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-math-mayhem").click();
  await host.locator('[data-testid="start-official-math-mayhem"]').click();
  for (const { page } of pages) {
    await page.getByRole("heading", { name: "Now playing: math-mayhem" }).waitFor({ timeout: 20000 });
  }
  await sleep(800);
  await host.screenshot({ path: `${OUT}/03-math-mayhem-playing.png`, fullPage: true });

  // Play math-mayhem to finished via real UI clicks (first option each question).
  const panel = host.locator('[data-testid="game-panel"]');
  const deadline = Date.now() + 120_000;
  let finished = false;
  while (Date.now() < deadline) {
    const t = (await panel.textContent()) ?? "";
    if (t.includes("Now playing: math-mayhem") && t.includes("Status: finished")) { finished = true; break; }
    for (const { page } of pages) {
      const p = page.locator('[data-testid="game-panel"]');
      const pt = (await p.textContent({ timeout: 2000 }).catch(() => "")) ?? "";
      if (pt.includes("Status: finished")) continue;
      const opts = p.locator(".grid button");
      if ((await opts.count()) > 0) { await opts.first().click(); await sleep(300); }
    }
    await sleep(700);
  }
  if (!finished) throw new Error("math-mayhem did not finish in 120s");
  await host.screenshot({ path: `${OUT}/04-math-mayhem-finished.png`, fullPage: true });

  await host.getByRole("button", { name: "Championship" }).click();
  await host.getByText("Championship standings").waitFor({ timeout: 15000 });
  await host.screenshot({ path: `${OUT}/05-championship.png`, fullPage: true });

  await host.getByRole("button", { name: "TV Dashboard" }).click();
  await host.getByText("TV Dashboard — public only").waitFor({ timeout: 15000 });
  await host.screenshot({ path: `${OUT}/06-tv-dashboard.png`, fullPage: true });

  await host.getByRole("button", { name: "Memory Book" }).click();
  await host.getByPlaceholder("e.g. Ada won Math Mayhem in a tie-break").fill("Checkpoint highlight: Alex won Math Mayhem");
  await host.getByRole("button", { name: "Add from last finished game" }).click();
  await host.getByText("Checkpoint highlight: Alex won Math Mayhem").waitFor({ timeout:15000 });
  await host.getByRole("button", { name: "Approve" }).first().click();
  await host.getByRole("button", { name: "Export approved" }).click();
  await host.getByText(/Checkpoint highlight: Alex won Math Mayhem/).last().waitFor({ timeout: 15000 });
  await host.screenshot({ path: `${OUT}/07-memory-book.png`, fullPage: true });

  console.log(`OK screenshots: ${fs.readdirSync(OUT).length} files in ${OUT}`);
} finally {
  await browser.close();
}
