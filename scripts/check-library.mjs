// Game Library (Milestone G): browse/search/filter the manifest catalog
// from the lobby, select as up-next (host only), and never start a game
// from the library. Browsing is open to guests; selection stays host-only.
// Usage: build:web, serve on a port, then:
//   node scripts/check-library.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";
import { roomGo, upNextTitle, hostFamilyCup } from "./lib/room-nav.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
// Stage 5: the catalog grows (practice-only new games); read its size from the server, never assume it.
const GAMES = await (await fetch(`${BASE}/games`)).json();
const TOTAL = GAMES.length;
// Stage 9.3: the Team filter lists team games and cooperative ones (everyone on one team), counted from the catalogue.
const TEAM = GAMES.filter((g) => (g.modes ?? []).includes("team") || g.cooperative === true).map((g) => g.id);
// Expected filter results come from the catalogue itself (Stage 5 adds games).
const SHORT = GAMES.filter((g) => g.defaultDurationMinutes <= 5).map((g) => g.id);
const FOR_TWO = GAMES.filter((g) => g.minPlayers <= 2 && g.maxPlayers >= 2).length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function createRoom(page, name) {
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await hostFamilyCup(page);
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
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
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
  await roomGo(host, "library");
  await host.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
  check("library opens with the full catalog",
    (await waitForCount(host, `Showing ${TOTAL} of ${TOTAL} games`)) && (await cardCount(host)) === TOTAL);

  // Search narrows to one game, then clears back to all.
  await host.getByTestId("mz-lib-search").fill("trivia");
  check("search narrows to the matching game",
    (await waitForCount(host, `Showing 1 of ${TOTAL} games`)) && (await cardCount(host)) === 1
    && await host.getByTestId("mz-lib-card-trivia").isVisible());
  await host.getByTestId("mz-lib-search").fill("");
  check("clearing search restores the catalog",
    (await waitForCount(host, `Showing ${TOTAL} of ${TOTAL} games`)) && (await cardCount(host)) === TOTAL);

  // Stage 2: the rarer filters are folded away; search stays on screen.
  check("advanced filters start folded away, search is on screen",
    (await host.getByTestId("mz-lib-style-team").count()) === 0 && await host.getByTestId("mz-lib-search").isVisible());
  await host.getByTestId("mz-lib-filters-toggle").click();

  // Team filter: the team games (Charades) and the cooperative ones (Spectrum), nothing individual.
  await host.getByTestId("mz-lib-style-team").click();
  check(`team filter shows only the ${TEAM.length} team and co-op games`,
    (await waitForCount(host, `Showing ${TEAM.length} of ${TOTAL} games`))
    && (await Promise.all(TEAM.map((id) => host.getByTestId(`mz-lib-card-${id}`).isVisible()))).every(Boolean)
    && TEAM.includes("charades") && TEAM.includes("spectrum"), TEAM.join(", "));
  await host.getByTestId("mz-lib-reset").click();
  check("reset restores the catalog",
    (await waitForCount(host, `Showing ${TOTAL} of ${TOTAL} games`)) && (await cardCount(host)) === TOTAL);
  check("with no filters left, there is nothing to clear", (await host.getByTestId("mz-lib-active").count()) === 0);

  // Duration filter: 5 minutes or less (Math Mayhem, and since Stage 5 Pattern Pulse).
  await host.getByTestId("mz-lib-duration-5").click();
  check(`duration filter shows only short games (${SHORT.join(", ")})`,
    SHORT.includes("math-mayhem") && (await waitForCount(host, `Showing ${SHORT.length} of ${TOTAL} games`))
    && (await Promise.all(SHORT.map((id) => host.getByTestId(`mz-lib-card-${id}`).isVisible()))).every(Boolean));
  await host.getByTestId("mz-lib-reset").click();

  // Player-count filter: the games 2 players can play (counted from the catalogue).
  await host.getByTestId("mz-lib-players-2").click();
  check(`player-count filter shows only compatible games (${FOR_TWO})`,
    (await waitForCount(host, `Showing ${FOR_TWO} of ${TOTAL} games`)) && (await cardCount(host)) === FOR_TWO);
  await host.getByTestId("mz-lib-reset").click();
  check("reset after player filter restores the catalog",
    (await waitForCount(host, `Showing ${TOTAL} of ${TOTAL} games`)) && (await cardCount(host)) === TOTAL);

  // Empty state: no match, with a way out inside it.
  await host.getByTestId("mz-lib-search").fill("zzz-no-match");
  check("empty state on no match",
    (await waitForCount(host, `Showing 0 of ${TOTAL} games`))
    && await host.getByTestId("mz-lib-empty").isVisible());
  check("the active search is shown as a removable filter", /zzz-no-match/.test((await host.getByTestId("mz-lib-active").textContent()) ?? ""));
  await host.getByTestId("mz-lib-empty-clear").click();
  check("Clear filters in the empty state restores the catalog",
    (await waitForCount(host, `Showing ${TOTAL} of ${TOTAL} games`)) && (await cardCount(host)) === TOTAL
    && (await host.getByTestId("mz-lib-search").inputValue()) === "");
  await host.getByTestId("mz-lib-search").fill("zzz-no-match");
  await host.getByTestId("mz-lib-reset").click();
  check("Clear filters next to the active filters restores the catalog",
    (await waitForCount(host, `Showing ${TOTAL} of ${TOTAL} games`)) && (await cardCount(host)) === TOTAL);

  // The library never starts a game: no start button exists in this view.
  check("library has no start button (browsing never starts)",
    (await host.locator('[data-testid^="start-"]').count()) === 0);

  // Host selects Charades: back to lobby, Charades up next, nothing started.
  await host.getByTestId("mz-lib-select-charades").click();
  await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  check("host selection returns to the lobby with the game up next",
    (await upNextTitle(host)) === "Charades"
    && await host.getByTestId("start-practice-charades").isVisible());
  check("the library entry left no extra Back step (lobby is at /room)", new URL(host.url()).pathname === "/room");
  check("selection started no game",
    (await host.locator(".mz-question").count()) === 0);

  // Guest browsing: library opens, no select buttons, guest note shown.
  await roomGo(bea, "library");
  await bea.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
  check("guest can browse the library",
    (await waitForCount(bea, `Showing ${TOTAL} of ${TOTAL} games`)) && (await cardCount(bea)) === TOTAL);
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
