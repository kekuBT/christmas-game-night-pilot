// Tournament Studio preview (Milestone I): host-only schedule preview.
// Nothing here starts, scores, or saves. Guests see no Studio button.
// Team Clash at 2 players must surface the infeasible state, not crash.
// Usage: build:web, serve on a port, then:
//   node scripts/check-studio.mjs <baseUrl>
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function createRoom(page, name) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
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
async function roundCount(page) {
  return page.locator('[data-testid^="studio-round-"]').count();
}
async function waitForRounds(page, expected) {
  for (let i = 0; i < 20; i++) {
    if ((await roundCount(page)) === expected) return true;
    await sleep(250);
  }
  return false;
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const bea = await ctx.newPage();
  await joinRoom(bea, "Bea", code);

  // Guests never see the Studio: configuring an event is a host action.
  check("guest sees no Studio button",
    (await bea.locator('[data-testid="studio-button"]').count()) === 0);

  await host.getByTestId("studio-button").click();
  await host.getByTestId("studio-preview-note").waitFor({ timeout: 15000 });
  check("studio opens with its preview-only note",
    await host.getByText(/not scored, not saved/).isVisible());
  check("studio states the player count the schedule assumes",
    (await host.getByTestId("studio-player-count").textContent()) === "Scheduled for 2 players.");

  // Default format (Points League, 5 rounds) previews 5 rounds.
  check("default format previews its rounds",
    (await host.getByTestId("studio-preview").isVisible()) && (await waitForRounds(host, 5)));

  // Round count follows the input.
  await host.getByTestId("studio-rounds").fill("3");
  check("round input changes the preview",
    await waitForRounds(host, 3));

  // Team Clash at 2 players: no team game fits — infeasible, not a crash.
  await host.getByTestId("studio-format-team-clash").click();
  await host.getByTestId("studio-infeasible").waitFor({ timeout: 15000 });
  check("infeasible format shows the no-games message",
    await host.getByText(/No games fit this format/).isVisible());

  // Back to a feasible format: preview returns with the preset's rounds.
  await host.getByTestId("studio-format-points-league").click();
  await host.getByTestId("studio-preview").waitFor({ timeout: 15000 });
  check("returning to a feasible format restores the preview",
    await waitForRounds(host, 5));

  // The Studio never starts a game: no start button exists in this view.
  check("studio has no start button (preview never starts)",
    (await host.locator('[data-testid^="start-"]').count()) === 0);

  await host.getByTestId("mz-studio-back").click();
  await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  check("studio back button returns to the lobby", true);
} finally {
  await browser.close();
}
console.log(failures === 0 ? "STUDIO ALL PASSED" : `STUDIO FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
