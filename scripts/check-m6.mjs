// M6 Show Mode browser check (Chromium, 390x844): first-time-user journey.
// Usage: build:web, serve on a port, then: node scripts/check-m6.mjs <baseUrl>
// Checks: landing steps → create → second player joins → living lobby
// ornaments → host starts Trivia → intro → start playing → answer all →
// waiting state with counts → results screen → back to lobby → reactions.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3457";
const results = [];
function pass(name) { results.push([name, true]); console.log("PASS", name); }
function fail(name, detail) { results.push([name, false]); console.log("FAIL", name, detail ?? ""); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
try {
  const host = await ctx.newPage();
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  // Landing steps copy
  const landing = await host.locator("body").textContent();
  if (landing.includes("Step 1") && landing.includes("Step 2")) pass("landing shows steps"); else fail("landing shows steps");
  await host.getByPlaceholder("e.g. Ada").fill("Ada");
  await host.getByRole("button", { name: "Create a room (host)" }).click();
  await host.locator("header .pill", { hasText: /Code: [A-Z0-9]{6}/ }).waitFor({ timeout: 15000 });
  const code = (await host.locator("header .pill").textContent()).replace("Code:", "").trim();
  pass("host created room, code " + code);

  const guest = await ctx.newPage();
  await guest.goto(BASE, { waitUntil: "domcontentloaded" });
  await guest.getByPlaceholder("e.g. Ada").fill("Bea");
  await guest.getByPlaceholder("e.g. K7M2Q9").fill(code);
  await guest.getByRole("button", { name: "Join room" }).click();
  await guest.getByTestId("living-lobby").waitFor({ timeout: 15000 });
  pass("living lobby ornaments visible");

  // Host starts Trivia (official) — game card is in the lobby phase.
  await host.getByTestId("start-official-trivia").click();
  await host.getByTestId("show-intro").waitFor({ timeout: 15000 });
  pass("show intro appears on game start");
  await host.getByTestId("show-start-playing").click();
  await host.getByTestId("game-panel").waitFor({ timeout: 15000 });
  pass("start playing reaches gameplay");

  // Guest must dismiss its own intro too (each player's intro is per-player).
  await guest.getByTestId("show-intro").waitFor({ timeout: 15000 });
  await guest.getByTestId("show-start-playing").click();
  await guest.getByTestId("game-panel").waitFor({ timeout: 15000 });
  // Answer every Trivia question on the host first, and check the waiting
  // state BEFORE the guest finishes — once the guest finishes, the game
  // ends and the host moves to results, so waiting is transient by design.
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
  const waitingText = await host.getByTestId("show-waiting").textContent();
  if (waitingText.includes("have played so far")) pass("waiting state with counts"); else fail("waiting state with counts", waitingText);
  // Guest finishes — then results.
  await answerAll(guest);
  // Trivia finishes when all players answered all questions; poll for results.
  await host.getByTestId("show-results").waitFor({ timeout: 30000 });
  pass("results screen after finish");
  await host.getByTestId("show-back-to-lobby").click();
  await host.getByTestId("living-lobby").waitFor({ timeout: 15000 });
  pass("back to lobby from results");

  // Reactions in the lobby.
  await host.getByTestId("reactions").waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "React 🎉" }).click();
  await host.getByTestId("recent-reactions").waitFor({ timeout: 15000 });
  pass("reaction sent and shown");
} catch (e) {
  fail("m6 journey crashed", String(e).slice(0, 300));
} finally {
  await browser.close();
}
const failed = results.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? "M6 ALL PASSED" : `M6 FAILED: ${failed.length}/${results.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
