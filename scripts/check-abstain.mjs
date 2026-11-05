// Abstain browser check (Chromium, 2 fictional players).
// Usage: build:web, serve on a port, then: node scripts/check-abstain.mjs <baseUrl>
// What it proves, through the real UI only (Mchezo Trivia screens):
//   1. A playing Trivia game shows a "Sit this game out" button to a player.
//   2. Clicking it shows the "sat this one out" waiting note and hides it.
//   3. The other player can still finish the game alone (no stall).
//   4. The finished results screen scores the abstainer at 0.
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
  await host.getByPlaceholder("e.g. Auntie June").fill("Ada");
  await host.getByRole("button", { name: "Host a game" }).click();
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
  await guest.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });

  await host.getByTestId("start-official-trivia").click();
  // Mchezo Trivia intro auto-advances in 8s; wait for the question screen.
  for (const page of [host, guest]) {
    await page.locator(".mz-question").waitFor({ timeout: 30000 });
  }

  // 1. Abstain button is offered to a playing player.
  const abstainBtn = guest.getByRole("button", { name: "Sit this game out" });
  try {
    await abstainBtn.waitFor({ state: "visible", timeout: 15000 });
    pass("abstain button offered during a playing game");
  } catch (e) {
    fail("abstain button offered during a playing game", String(e).slice(0, 200));
  }

  // 2. Clicking it shows the sat-out note and hides the button.
  await abstainBtn.click();
  if (await waitFor(async () => (await guest.locator("body").textContent())?.includes("You sat this one out"), 15000)) {
    pass("guest sees sat-out note after abstaining");
  } else fail("guest sees sat-out note after abstaining");
  if ((await guest.getByRole("button", { name: "Sit this game out" }).count()) === 0) {
    pass("abstain button hidden after abstaining");
  } else fail("abstain button hidden after abstaining");

  // 3. The host answers every question; the game must finish without Bea.
  // Mchezo Trivia finishes when all non-abstained players answered all
  // questions; the host's results screen shows a "Back to lobby" button.
  const hostFinished = async () => {
    try { return await host.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }); } catch { return false; }
  };
  let finished = false;
  for (let i = 0; i < 60 && !finished; i++) {
    if (await hostFinished()) { finished = true; break; }
    const slab = host.locator(".mz-slab:not([disabled])").first();
    try { await slab.click({ timeout: 3000 }); } catch { /* no slab; try Next */ }
    const next = host.getByRole("button", { name: "Next question" });
    try { await next.click({ timeout: 1500 }); } catch { /* not on locked view yet */ }
    await sleep(300);
  }
  if (finished) pass("game finishes on the host's answers alone after an abstention");
  else fail("game finishes on the host's answers alone after an abstention");

  // 4. The finished results screen scores the abstainer at 0: Bea's
  // standings row (host view) shows score 0.
  // D: phone results open on the reveal sequence; jump to standings.
  await host.getByTestId("mz-reveal-standings").click();
  await host.locator(".mz-standings").waitFor({ timeout: 15000 });
  let beaRow = "";
  try { beaRow = (await host.locator(".mz-standings li", { hasText: "Bea" }).first().textContent({ timeout: 3000 })) ?? ""; } catch { /* no row */ }
  if (beaRow && /0/.test(beaRow)) pass("abstainer scores 0 in the finished view");
  else fail("abstainer scores 0 in the finished view", beaRow.slice(0, 200));
} catch (e) {
  fail("abstain journey crashed", String(e).slice(0, 300));
} finally {
  await browser.close();
}
const failed = results.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? "ABSTAIN ALL PASSED" : `ABSTAIN FAILED: ${failed.length}/${results.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
