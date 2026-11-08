// M6 Show Mode browser check (Chromium, 390x844): first-time-user journey
// through the Mchezo UI. Usage: build:web, serve on a port, then:
//   node scripts/check-m6.mjs <baseUrl>
// Checks: Mchezo landing -> host creates -> second player joins -> Circle
// lobby -> host starts Math Mayhem (kit panel since §11) -> intro ->
// start playing -> answer all -> waiting state with counts -> results
// screen -> back to lobby -> reaction.
// (The Trivia version of this journey is covered by scripts/check-mchezo.mjs.)
import { launchChromium } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3457";
const results = [];
function pass(name) { results.push([name, true]); console.log("PASS", name); }
function fail(name, detail) { results.push([name, false]); console.log("FAIL", name, detail ?? ""); }

const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
try {
  const host = await ctx.newPage();
  await host.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  // Mchezo landing: wordmark + host button.
  const landing = await host.locator("body").textContent();
  if (landing.toLowerCase().includes("mchezo") && landing.includes("Host a game")) pass("landing shows Mchezo wordmark");
  else fail("landing shows Mchezo wordmark");
  await host.getByPlaceholder("e.g. Auntie June").fill("Ada");
  await host.getByRole("button", { name: "Host a game" }).click();
  const shareChip = host.getByRole("button", { name: /^Share room code / });
  await shareChip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
  }
  pass("host created room, code " + code);

  const guest = await ctx.newPage();
  await guest.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await guest.getByPlaceholder("e.g. Auntie June").fill("Bea");
  await guest.locator(".mz-code__input").fill(code);
  await guest.getByRole("button", { name: "Join the game" }).click();
  await guest.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });
  pass("Circle lobby visible after join");
  await host.locator(".mz-circle__seats").getByText("Bea", { exact: true }).waitFor({ timeout: 15000 });
  pass("host sees guest seat in Circle lobby");

  // Host starts Math Mayhem (official) — game card is in the lobby extra.
    await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-math-mayhem").click();
  await host.getByTestId("start-official-math-mayhem").click();
  // D3 replaced the per-phone 8 s intro (which ran while the clock did) with
  // a shared briefing: rules on every phone, no clock until all are ready.
  await host.getByTestId("briefing").waitFor({ timeout: 15000 });
  await guest.getByTestId("briefing").waitFor({ timeout: 15000 });
  pass("the rules briefing appears on both phones at game start");
  if ((await host.locator(".mz-question").count()) === 0 && (await guest.locator(".mz-question").count()) === 0) pass("no question is on any phone during the briefing");
  else fail("no question is on any phone during the briefing");
  await passBriefing([host, guest]);
  // Math Mayhem renders in the Mchezo kit since §11 (no game-panel):
  // the QuestionScreen's .mz-question is the gameplay signal.
  await host.locator(".mz-question").waitFor({ timeout: 20000 });
  pass("everyone ready reaches gameplay");
  await guest.locator(".mz-question").waitFor({ timeout: 20000 });
  if ((await host.getByTestId("show-intro").count()) === 0 && (await guest.getByTestId("show-intro").count()) === 0) pass("no second intro races the clock after the briefing");
  else fail("no second intro races the clock after the briefing");
  // Answer every Math Mayhem question on the host first, and check the
  // waiting state BEFORE the guest finishes — once the guest finishes,
  // the game ends and the host moves to results, so waiting is transient.
  // Kit loop (same as e2e's actTrivia): slabs + Next question, then the
  // "Waiting for the game to finish" keycap clears the last lock into
  // the counts-only waiting ring.
  async function answerAll(page) {
    for (let i = 0; i < 60; i++) {
      if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }).catch(() => false)) return;
      const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
      if (await doneBtn.isVisible({ timeout: 500 }).catch(() => false)) { await doneBtn.click(); await page.waitForTimeout(400); return; }
      const next = page.getByRole("button", { name: "Next question" });
      if (await next.isVisible({ timeout: 500 }).catch(() => false)) { await next.click(); await page.waitForTimeout(400); continue; }
      const slabs = page.locator(".mz-slab:not([disabled])");
      if ((await slabs.count()) > 0) { await slabs.first().click(); await page.waitForTimeout(500); continue; }
      await page.waitForTimeout(500);
    }
  }
  await answerAll(host);
  await host.locator(".mz-wait").waitFor({ timeout: 15000 });
  const waitingText = await host.locator(".mz-wait").textContent();
  if (waitingText.includes("have started")) pass("waiting state with counts"); // S3-TRV-01: "started", not "played"
  else fail("waiting state with counts", waitingText);
  // Guest finishes — then results.
  await answerAll(guest);
  await host.getByTestId("show-results").waitFor({ timeout: 30000 });
  pass("results screen after finish");
  await host.getByTestId("show-back-to-lobby").click();
  await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  pass("back to lobby from results");

  // Reactions in the Mchezo lobby (ReactionBar, aria-label "Send Love").
  await host.getByRole("button", { name: "Send Love" }).click();
  await host.waitForTimeout(500);
  pass("reaction sent from Mchezo lobby");
} catch (e) {
  fail("m6 journey crashed", String(e).slice(0, 300));
} finally {
  await browser.close();
}
const failed = results.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? "M6 ALL PASSED" : `M6 FAILED: ${failed.length}/${results.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
