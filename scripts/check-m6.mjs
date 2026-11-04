// M6 Show Mode browser check (Chromium, 390x844): first-time-user journey
// through the Mchezo UI. Usage: build:web, serve on a port, then:
//   node scripts/check-m6.mjs <baseUrl>
// Checks: Mchezo landing -> host creates -> second player joins -> Circle
// lobby -> host starts Math Mayhem (old Show Mode flow, untouched by the
// Mchezo integration) -> intro -> start playing -> answer all -> waiting
// state with counts -> results screen -> back to lobby -> reaction.
// (The Trivia version of this journey is covered by scripts/check-mchezo.mjs.)
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
  await guest.goto(BASE, { waitUntil: "domcontentloaded" });
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
  await host.getByTestId("show-intro").waitFor({ timeout: 15000 });
  pass("show intro appears on game start");
  await host.getByTestId("show-start-playing").click();
  await host.getByTestId("game-panel").waitFor({ timeout: 15000 });
  pass("start playing reaches gameplay");

  // Guest must dismiss its own intro too (each player's intro is per-player).
  await guest.getByTestId("show-intro").waitFor({ timeout: 15000 });
  await guest.getByTestId("show-start-playing").click();
  await guest.getByTestId("game-panel").waitFor({ timeout: 15000 });
  // Answer every Math Mayhem question on the host first, and check the
  // waiting state BEFORE the guest finishes — once the guest finishes,
  // the game ends and the host moves to results, so waiting is transient.
  async function answerAll(page) {
    for (let i = 0; i < 40; i++) {
      const tiles = page.locator(".grid button");
      if (await tiles.count() === 0) break;
      await tiles.first().click();
      await page.waitForTimeout(300);
    }
  }
  await answerAll(host);
  await host.getByTestId("show-waiting").waitFor({ timeout: 15000 });
  const waitingText = await host.getByTestId("show-waiting").textContent();
  if (waitingText.includes("have played so far")) pass("waiting state with counts");
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
