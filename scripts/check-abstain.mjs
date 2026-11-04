// Abstain browser check (Chromium, 2 fictional players).
// Usage: build:web, serve on a port, then: node scripts/check-abstain.mjs <baseUrl>
// What it proves, through the real UI only:
//   1. A playing Trivia game shows a "Sit out (abstain)" button to a player.
//   2. Clicking it shows the "sat this one out" note and hides the button.
//   3. The other player can still finish the game alone (no stall).
//   4. The finished panel scores the abstainer at 0.
// Checks: 5. Fictional test players only; run against a local server only.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3457";
const results = [];
function pass(name) { results.push([name, true]); console.log("PASS", name); }
function fail(name, detail) { results.push([name, false]); console.log("FAIL", name, detail ?? ""); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = false;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return true;
    await sleep(500);
  }
  return last;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
try {
  const host = await ctx.newPage();
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
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

  await host.getByTestId("start-official-trivia").click();
  for (const page of [host, guest]) {
    try {
      const intro = page.getByTestId("show-start-playing");
      await intro.waitFor({ state: "visible", timeout: 15000 });
      await intro.click();
    } catch { /* intro already auto-advanced */ }
    await page.getByRole("heading", { name: "Now playing: trivia" }).waitFor({ timeout: 20000 });
  }

  // 1. Abstain button is offered to a playing player.
  const abstainBtn = guest.getByRole("button", { name: "Sit out (abstain)" });
  try {
    await abstainBtn.waitFor({ state: "visible", timeout: 15000 });
    pass("abstain button offered during a playing game");
  } catch (e) {
    fail("abstain button offered during a playing game", String(e).slice(0, 200));
  }

  // 2. Clicking it shows the sat-out note and hides the button.
  await abstainBtn.click();
  if (await waitFor(async () => (await guest.locator('[data-testid="game-panel"]').textContent())?.includes("You sat this one out"), 15000)) {
    pass("guest sees sat-out note after abstaining");
  } else fail("guest sees sat-out note after abstaining");
  if ((await guest.getByRole("button", { name: "Sit out (abstain)" }).count()) === 0) {
    pass("abstain button hidden after abstaining");
  } else fail("abstain button hidden after abstaining");

  // 3. The host answers every question; the game must finish without Bea.
  // M6 Show Mode: a finished game shows the results screen INSTEAD of the
  // panel, so finish is panel "Status: finished" OR a visible show-results.
  const hostFinished = async () => {
    const panel = await host.locator('[data-testid="game-panel"]').textContent({ timeout: 2000 }).catch(() => "");
    if (panel?.includes("Status: finished")) return true;
    try { return await host.getByTestId("show-results").isVisible({ timeout: 500 }); } catch { return false; }
  };
  let finished = false;
  for (let i = 0; i < 20 && !finished; i++) {
    if (await hostFinished()) { finished = true; break; }
    const tile = host.locator(".answer-tile").first();
    try { await tile.click({ timeout: 3000 }); } catch { /* no tiles left; re-check */ }
    await sleep(300);
  }
  if (finished) pass("game finishes on the host's answers alone after an abstention");
  else fail("game finishes on the host's answers alone after an abstention");

  // 4. The finished view scores the abstainer at 0 (results screen or panel).
  let finishedText = "";
  try { finishedText = (await host.getByTestId("show-results").textContent({ timeout: 3000 })) ?? ""; } catch { /* fall back to panel */ }
  if (!finishedText) finishedText = (await host.locator('[data-testid="game-panel"]').textContent().catch(() => "")) ?? "";
  if (finishedText.includes("Bea: 0")) pass("abstainer scores 0 in the finished view");
  else fail("abstainer scores 0 in the finished view", finishedText.slice(0, 200));
} catch (e) {
  fail("abstain journey crashed", String(e).slice(0, 300));
} finally {
  await browser.close();
}
const failed = results.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? "ABSTAIN ALL PASSED" : `ABSTAIN FAILED: ${failed.length}/${results.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
