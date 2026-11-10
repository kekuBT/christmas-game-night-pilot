// Screenshots for Milestone C (test-fixture data, not production data):
// a TV leaderboard with distinct scores, real rank movement, and an Away
// row, plus the matching phone results view.
// Usage: build:web, serve on a port, then:
//   node scripts/screenshot-tv-quality.mjs <baseUrl>
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3461";
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
async function roomIdOf(page) {
  return page.evaluate(() => sessionStorage.getItem("cgn_roomId"));
}
async function answerOption(page, optionIndex) {
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }).catch(() => false)) return;
    const slab = page.locator(".mz-slab:not([disabled])").nth(optionIndex);
    if (await slab.isVisible({ timeout: 1500 }).catch(() => false)) { await slab.click(); await sleep(200); }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 1000 }).catch(() => false)) { await next.click(); await sleep(200); }
    const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
    if (await doneBtn.isVisible({ timeout: 1000 }).catch(() => false)) { await doneBtn.click(); await sleep(200); }
  }
}
async function answerFirstN(page, n, optionIndex = 0) {
  for (let i = 0; i < n; i++) {
    const slab = page.locator(".mz-slab:not([disabled])").nth(optionIndex);
    if (await slab.isVisible({ timeout: 15000 }).catch(() => false)) { await slab.click(); await sleep(200); }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 1000 }).catch(() => false)) { await next.click(); await sleep(200); }
  }
}
async function startSeeded(host, roomId, seed) {
  await host.evaluate(async ({ roomId, seed }) => {
    const token = sessionStorage.getItem("cgn_token");
    const r = await fetch(`/rooms/${roomId}/games`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": token }, body: JSON.stringify({ gameId: "trivia", official: true, seed }) });
    if (!r.ok) throw new Error(`seeded start failed: ${r.status}`);
  }, { roomId, seed });
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const roomId = await roomIdOf(host);
  const P = {};
  for (const name of ["Bea", "Cal", "Dee"]) {
    const p = await ctx.newPage();
    await joinRoom(p, name, code);
    P[name] = p;
  }
  // Game 1 (seed 1): Ada 600, Bea 360, Cal 0, Dee 240 — distinct ranks.
  await startSeeded(host, roomId, 1);
  await host.locator(".mz-question").waitFor({ timeout: 30000 });
  await answerOption(host, 0);
  await answerOption(P.Bea, 1);
  await answerOption(P.Cal, 2);
  await answerOption(P.Dee, 3);
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  await host.getByRole("button", { name: "Back to lobby" }).click();
  await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  // Game 2 (seed 1): Bea 600 (climbs), Ada 360 (drops), Cal 240 then
  // disconnects (Away row), Dee abstains (0).
  await startSeeded(host, roomId, 1);
  await host.locator(".mz-question").waitFor({ timeout: 30000 });
  await answerFirstN(P.Cal, 10, 3);
  await P.Cal.close();
  await answerOption(host, 1);
  await answerOption(P.Bea, 0);
  await P.Dee.getByRole("button", { name: "Sit this game out" }).click();
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  // TV leaderboard from the host's own TV stage (no extra seat).
  await host.setViewportSize({ width: 1280, height: 800 });
  await host.getByTestId("mz-tv-stage").click();
  await host.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
  await host.waitForTimeout(3000);
  await host.screenshot({ path: "docs/mchezo-screenshots/10-tv-quality.png" });
  console.log("saved docs/mchezo-screenshots/10-tv-quality.png");
  await host.getByRole("button", { name: "Back to phone view" }).click();
  await host.getByText(/Your game total:/).waitFor({ timeout: 15000 });
  await host.setViewportSize({ width: 390, height: 844 });
  await host.screenshot({ path: "docs/mchezo-screenshots/11-phone-results.png", fullPage: true });
  console.log("saved docs/mchezo-screenshots/11-phone-results.png");
} finally {
  await browser.close();
}
