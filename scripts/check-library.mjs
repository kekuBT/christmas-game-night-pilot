// Game Library (Milestone G): browse/search/filter the manifest catalog
// from the lobby, select as up-next (host only), and never start a game
// from the library. Browsing is open to guests; selection stays host-only.
// Usage: build:web, serve on a port, then:
//   node scripts/check-library.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";

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
async function waitForCount(page, expected) {
  for (let i = 0; i < 20; i++) {
    const text = ((await page.getByTestId("mz-lib-count").textContent()) ?? "").trim();
    if (text === expected) return true;
    await sleep(250);
  }
  return false;
}
async function cardCount(page) {
  return page.locator('[data-testid^="mz-lib-card-"]').count();
}

const browser = await launchChromium();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const bea = await ctx.newPage();
  await joinRoom(bea, "Bea", code);

  // Host opens the library: full catalog, 11 cards.
  await host.getByTestId("browse-games").click();
  await host.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
  check("library opens with the full catalog",
    (await waitForCount(host, "Showing 11 of 11 games")) && (await cardCount(host)) === 11);

  // Search narrows to one game, then clears back to all.
  await host.getByTestId("mz-lib-search").fill("trivia");
  check("search narrows to the matching game",
    (await waitForCount(host, "Showing 1 of 11 games")) && (await cardCount(host)) === 1
    && await host.getByTestId("mz-lib-card-trivia").isVisible());
  await host.getByTestId("mz-lib-search").fill("");
  check("clearing search restores the catalog",
    (await waitForCount(host, "Showing 11 of 11 games")) && (await cardCount(host)) === 11);

  // Team filter: only Charades.
  await host.getByTestId("mz-lib-style-team").click();
  check("team filter shows only the team game",
    (await waitForCount(host, "Showing 1 of 11 games"))
    && await host.getByTestId("mz-lib-card-charades").isVisible());
  await host.getByTestId("mz-lib-reset").click();
  check("reset restores the catalog",
    (await waitForCount(host, "Showing 11 of 11 games")) && (await cardCount(host)) === 11);

  // Duration filter: 5 minutes or less is Math Mayhem alone.
  await host.getByTestId("mz-lib-duration-5").click();
  check("duration filter shows only short games",
    (await waitForCount(host, "Showing 1 of 11 games"))
    && await host.getByTestId("mz-lib-card-math-mayhem").isVisible());
  await host.getByTestId("mz-lib-reset").click();

  // Player-count filter: 2 players can play 6 of the 11 games.
  await host.getByTestId("mz-lib-players-2").click();
  check("player-count filter shows only compatible games",
    (await waitForCount(host, "Showing 6 of 11 games")) && (await cardCount(host)) === 6);
  await host.getByTestId("mz-lib-reset").click();
  check("reset after player filter restores the catalog",
    (await waitForCount(host, "Showing 11 of 11 games")) && (await cardCount(host)) === 11);

  // Empty state: no match, with a reset path (no second reset button).
  await host.getByTestId("mz-lib-search").fill("zzz-no-match");
  check("empty state on no match",
    (await waitForCount(host, "Showing 0 of 11 games"))
    && await host.getByTestId("mz-lib-empty").isVisible());
  await host.getByTestId("mz-lib-reset").click();
  check("reset from empty state restores the catalog",
    (await waitForCount(host, "Showing 11 of 11 games")) && (await cardCount(host)) === 11);

  // The library never starts a game: no start button exists in this view.
  check("library has no start button (browsing never starts)",
    (await host.locator('[data-testid^="start-"]').count()) === 0);

  // Host selects Charades: back to lobby, Charades up next, nothing started.
  await host.getByTestId("mz-lib-select-charades").click();
  await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  check("host selection returns to the lobby with the game up next",
    await host.getByText(/Up next is Charades/).isVisible()
    && await host.getByTestId("start-official-charades").isVisible());
  check("selection started no game",
    (await host.locator(".mz-question").count()) === 0);

  // Guest browsing: library opens, no select buttons, guest note shown.
  await bea.getByTestId("browse-games").click();
  await bea.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
  check("guest can browse the library",
    (await waitForCount(bea, "Showing 11 of 11 games")) && (await cardCount(bea)) === 11);
  check("guest sees no select buttons",
    (await bea.locator('[data-testid^="mz-lib-select-"]').count()) === 0);
  check("guest sees the host-only note",
    await bea.getByText(/Only the host or cohost can choose/).isVisible());
  await bea.getByTestId("mz-lib-back").click();
  await bea.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });
  check("guest back button returns to the lobby", true);
} finally {
  await browser.close();
}
console.log(failures === 0 ? "LIBRARY ALL PASSED" : `LIBRARY FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
