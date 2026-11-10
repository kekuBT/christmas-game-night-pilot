// Screenshot the spectator dashboard (Milestone B): a seat-free viewer
// sees the public TV dashboard, the watching note, and Stop watching —
// never a lobby seat or game controls.
// Usage: build:web, serve on a port, then:
//   node scripts/screenshot-spectator.mjs <baseUrl>
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "mchezo-screenshots");

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await ctx.newPage();
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("e.g. Auntie June").fill("Ada");
  await host.getByTestId("host-kind-cup").click(); await host.getByRole("button", { name: "Host a game" }).click();
  const chip = host.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(500);
  }
  for (const name of ["Bea", "Cal"]) {
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: "domcontentloaded" });
    await p.getByPlaceholder("e.g. Auntie June").fill(name);
    await p.locator(".mz-code__input").fill(code);
    await p.getByRole("button", { name: "Join the game" }).click();
    await p.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
  }
  const spec = await ctx.newPage();
  await spec.goto(BASE, { waitUntil: "domcontentloaded" });
  await spec.locator(".mz-code__input").fill(code);
  await spec.getByTestId("watch-spectator").click();
  await spec.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
  await sleep(2000);
  await spec.screenshot({ path: join(outDir, "09-spectator-dashboard.png") });
  console.log("screenshot written to", outDir);
} finally {
  await browser.close();
}
