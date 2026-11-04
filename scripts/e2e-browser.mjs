// Real-browser E2E for Christmas Game Night, via Playwright (no test runner:
// plain node + playwright library, so it runs with `node scripts/e2e-browser.mjs`).
//
// Usage:
//   npm run build:web
//   PORT=3457 npm run serve &        # in one shell; stop it and `rm -rf data` after
//   node scripts/e2e-browser.mjs [baseUrl] [--browser chromium|firefox|webkit|all] [--games all|smoke]
//
// Defaults: base http://localhost:3457, browser chromium, games all.
// Fictional test players only; run against a local server only.
// WebKit is included as an option but is currently BLOCKED on this VM by
// missing host libraries (libgstreamer, libgtk-4, ...); chromium/firefox launch.
//
// What it covers, through the real UI only (no direct game API calls):
//   create room (host) + 3 joins by code, 4-player lobby roster,
//   every game in /games order played to "Status: finished" via clicks/typing,
//   championship + TV dashboard views, Memory Book add/approve/export,
//   reconnect. A failed game is recorded and the run continues to the next
//   game; the process exits non-zero if anything failed.

import { chromium, firefox, webkit } from "playwright";

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3457";
const browserArg = (args.find((a) => a.startsWith("--browser=")) ?? "--browser=chromium").split("=")[1];
const gamesArg = (args.find((a) => a.startsWith("--games=")) ?? "--games=all").split("=")[1];
const BROWSERS = { chromium, firefox, webkit };
const NAMES = ["Alex", "Sam", "Jo", "Kim"];
const CONNECTIONS_GROUPS = [
  ["Gingerbread", "Candy cane", "Mince pie", "Roast turkey"],
  ["Snowfall", "Frost", "Blizzard", "Icicle"],
  ["Tinsel", "Bauble", "Wreath", "Stocking"],
  ["Dasher", "Dancer", "Prancer", "Vixen"],
];
const QUIZ_GAMES = ["math-mayhem", "trivia", "who-said-that", "geography"];
const SMOKE_GAMES = ["math-mayhem", "closest-wins"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function isVisible(loc, timeout = 1500) {
  try { await loc.first().waitFor({ state: "visible", timeout }); return true; }
  catch { return false; }
}
async function panelText(page) {
  try { return await page.locator('[data-testid="game-panel"]').textContent({ timeout: 2000 }); }
  catch { return ""; }
}
async function panelFinished(page, gameId) {
  const t = await panelText(page);
  // Heading must match the game: right after a previous game finishes, the
  // panel still shows that finished game until the new game's projection
  // arrives, and a bare "Status: finished" check would false-positive.
  if (t.includes(`Now playing: ${gameId}`) && t.includes("Status: finished")) return true;
  // M6 Show Mode: a finished game shows the results screen instead of the
  // finished panel. The results screen only ever shows the latest finished
  // game, so its presence means the game just played is finished.
  return await isVisible(page.getByTestId("show-results"), 500);
}

// One action pass for a single player page, for the game currently playing.
// Returns true if it did anything (or the panel is already finished).
async function act(page, gameId, name) {
  const panel = page.locator('[data-testid="game-panel"]');
  if (!(await isVisible(panel, 3000))) return false;
  if ((await panelText(page)).includes("Status: finished")) return true;

  if (QUIZ_GAMES.includes(gameId)) {
    // Click option buttons until every question shows "Answered."
    let guard = 40;
    while (guard-- > 0) {
      const opts = panel.locator(".grid button");
      if ((await opts.count()) === 0) break;
      await opts.first().click();
      await sleep(300);
    }
    return true;
  }
  if (gameId === "guess-the-year") {
    const inputs = panel.locator('input[placeholder="Year"]');
    if ((await inputs.count()) === 0) return false;
    await inputs.first().fill("2000");
    await panel.getByRole("button", { name: "Submit year" }).first().click();
    await sleep(400);
    return true;
  }
  if (gameId === "closest-wins") {
    const input = panel.locator('input[placeholder="Your guess"]');
    if (!(await isVisible(input, 1000))) return false;
    await input.fill("100");
    await panel.getByRole("button", { name: "Submit guess" }).click();
    await sleep(400);
    return true;
  }
  if (gameId === "impostor") {
    const clue = panel.locator('input[placeholder="Your clue (max 140 chars)"]');
    if (await isVisible(clue, 800)) {
      await clue.fill(`clue from ${name}`);
      await panel.getByRole("button", { name: "Submit clue" }).click();
      await sleep(400);
      return true;
    }
    const votes = panel.getByRole("button", { name: /^Vote: / });
    if ((await votes.count()) > 0) {
      await votes.first().click();
      await sleep(400);
      return true;
    }
    const guess = panel.locator('input[placeholder="Guess the word"]');
    if (await isVisible(guess, 800)) {
      await guess.fill("snowman");
      await panel.getByRole("button", { name: "Guess word" }).click();
      await sleep(400);
      return true;
    }
    return false;
  }
  if (gameId === "caption-clash") {
    const caption = panel.locator('input[placeholder="Your caption (max 140 chars)"]');
    if (await isVisible(caption, 800)) {
      await caption.fill(`caption by ${name}`);
      await panel.getByRole("button", { name: "Submit caption" }).click();
      await sleep(400);
      return true;
    }
    // Vote phase: try caption buttons until "Voted." appears (own caption
    // may be rejected, so fall through to the next button).
    const btns = panel.locator(".grid button");
    const n = await btns.count();
    for (let i = 0; i < n; i++) {
      await btns.nth(i).click();
      await sleep(500);
      if ((await panelText(page)).includes("Voted.")) return true;
      if ((await panel.locator(".grid button").count()) === 0) return true;
    }
    return n > 0;
  }
  if (gameId === "word-connections") {
    const tiles = panel.locator(".tile");
    if ((await tiles.count()) === 0) return false;
    for (const group of CONNECTIONS_GROUPS) {
      // Skip groups already solved (their tiles are gone from the board).
      let missing = false;
      for (const word of group) {
        if (!(await isVisible(panel.getByRole("button", { name: word, exact: true }), 500))) { missing = true; break; }
      }
      if (missing) continue;
      for (const word of group) await panel.getByRole("button", { name: word, exact: true }).click();
      await panel.getByRole("button", { name: "Submit group of 4" }).click();
      await sleep(600);
    }
    return true;
  }
  if (gameId === "category-sprint") {
    const input = panel.locator('input[placeholder="e.g. Paris, Rome, Madrid"]');
    if (!(await isVisible(input, 800))) return false;
    await input.fill(`${name}Alpha, ${name}Bravo, ${name}Charlie`);
    await panel.getByRole("button", { name: "Submit answers" }).click();
    await sleep(400);
    return true;
  }
  if (gameId === "charades") {
    const correct = panel.getByRole("button", { name: "Correct (+100 team)" });
    if (await isVisible(correct, 800)) {
      await correct.click();
      await sleep(400);
      return true;
    }
    return false; // watcher this turn; the actor page will act
  }
  throw new Error(`no UI driver for ${gameId}`);
}

async function runBrowser(browserName, games) {
  const results = [];
  const browser = await BROWSERS[browserName].launch({ headless: true });
  try {
    const pages = [];
    // Host creates a room.
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const host = await hostCtx.newPage();
    pages.push({ page: host, name: NAMES[0] });
    await host.goto(BASE, { waitUntil: "domcontentloaded" });
    await host.getByPlaceholder("e.g. Ada").fill(NAMES[0]);
    await host.getByRole("button", { name: "Create a room (host)" }).click();
    // Wait for the real code, not just the pill element: before the first
    // projection poll lands the pill reads "Code: …", which used to race
    // this read and fail the run with "unexpected room code: …".
    await host.locator("header .pill", { hasText: /Code: [A-Z0-9]{6}/ }).waitFor({ timeout: 15000 });
    const code = (await host.locator("header .pill").textContent()).replace("Code:", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`unexpected room code: ${code}`);
    console.log(`[${browserName}] room code ${code}`);
    // Three more players join by code.
    for (let i = 1; i < NAMES.length; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p = await ctx.newPage();
      pages.push({ page: p, name: NAMES[i] });
      await p.goto(BASE, { waitUntil: "domcontentloaded" });
      await p.getByPlaceholder("e.g. Ada").fill(NAMES[i]);
      await p.getByPlaceholder("e.g. K7M2Q9").fill(code);
      await p.getByRole("button", { name: "Join room" }).click();
      await p.getByText(`Playing as ${NAMES[i]}`).waitFor({ timeout: 15000 });
    }
    // Roster check on the host page.
    for (const n of NAMES) await host.getByText(n, { exact: true }).first().waitFor({ timeout: 15000 });
    console.log(`[${browserName}] lobby roster: 4 players joined`);

    for (const gameId of games) {
      const label = `${gameId}`;
      try {
        await host.locator(`[data-testid="start-official-${gameId}"]`).click();
        // M6 Show Mode: every player sees an intro screen first. Dismiss it
        // on every page (or wait for its auto-advance) before waiting for
        // the gameplay panel; otherwise the heading wait below times out.
        for (const { page } of pages) {
          const intro = page.getByTestId("show-start-playing");
          try { await intro.waitFor({ state: "visible", timeout: 15000 }); await intro.click(); }
          catch { /* intro already auto-advanced; panel wait below covers it */ }
          await page.getByRole("heading", { name: `Now playing: ${gameId}` }).waitFor({ timeout: 20000 });
        }
        const deadline = Date.now() + 180_000;
        let finished = false;
        while (Date.now() < deadline) {
          if (await panelFinished(host, gameId)) { finished = true; break; }
          for (const { page, name } of pages) {
            if (await panelFinished(page, gameId)) continue;
            await act(page, gameId, name);
          }
          await sleep(700);
        }
        if (!finished && !(await panelFinished(host, gameId))) throw new Error("did not reach Status: finished in 180s");
        // M6: dismiss the results screen so the lobby (and the next game's
        // start button) is visible again.
        try { await host.getByTestId("show-back-to-lobby").click({ timeout: 3000 }); } catch { /* already in lobby */ }
        console.log(`[${browserName}] OK ${label}: finished`);
        results.push({ gameId, status: "finished" });
      } catch (e) {
        console.log(`[${browserName}] FAIL ${label}: ${e.message}`);
        results.push({ gameId, status: "failed", error: e.message });
      }
    }

    // Championship + TV + Memory Book + reconnect, on the host page.
    try {
      await host.getByRole("button", { name: "Championship" }).click();
      await host.getByText("Championship standings").waitFor({ timeout: 15000 });
      await host.getByRole("button", { name: "TV Dashboard" }).click();
      await host.getByText("TV Dashboard — public only").waitFor({ timeout: 15000 });
      await host.getByRole("button", { name: "Memory Book" }).click();
      await host.getByPlaceholder("e.g. Ada won Math Mayhem in a tie-break").fill("E2E highlight: Alex won Math Mayhem");
      await host.getByRole("button", { name: "Add from last finished game" }).click();
      await host.getByText("E2E highlight: Alex won Math Mayhem").waitFor({ timeout: 15000 });
      // Scoped + exact: unscoped substring "Approve" also matches the
      // "Export approved" button, which comes first in DOM order, so the
      // old .first() click never actually approved (see F4 check notes).
      await host.locator(".card", { hasText: "E2E highlight: Alex won Math Mayhem" }).last()
        .getByRole("button", { name: "Approve", exact: true }).click();
      await host.getByText(/Day 1 · approved/).waitFor({ timeout: 15000 });
      await host.getByRole("button", { name: "Export approved" }).click();
      await host.getByText(/E2E highlight: Alex won Math Mayhem/).last().waitFor({ timeout: 15000 });
      await host.getByRole("button", { name: "Reconnect" }).click();
      await host.getByText("Reconnected to your player slot.").waitFor({ timeout: 15000 });
      console.log(`[${browserName}] OK views: championship, TV, memory book, reconnect`);
      results.push({ gameId: "(views)", status: "finished" });
    } catch (e) {
      console.log(`[${browserName}] FAIL views: ${e.message}`);
      results.push({ gameId: "(views)", status: "failed", error: e.message });
    }
  } finally {
    await browser.close();
  }
  return results;
}

const registry = await (await fetch(`${BASE}/games`)).json();
const allIds = registry.map((g) => g.id);
const wanted = gamesArg === "smoke" ? allIds.filter((id) => SMOKE_GAMES.includes(id)) : allIds;
console.log(`games: ${wanted.join(", ")} (registry order, ${allIds.length} total)`);
const browserNames = browserArg === "all" ? ["chromium", "firefox"] : [browserArg];
let failed = 0;
for (const b of browserNames) {
  try {
    const res = await runBrowser(b, wanted);
    const bad = res.filter((r) => r.status !== "finished");
    failed += bad.length;
    console.log(`[${b}] ${res.filter((r) => r.status === "finished").length}/${res.length} passed`);
  } catch (e) {
    console.log(`[${b}] BROWSER RUN FAILED: ${e.message}`);
    failed += 1;
  }
}
console.log(failed === 0 ? "E2E ALL PASSED" : `E2E FAILED: ${failed} item(s)`);
process.exit(failed === 0 ? 0 : 1);
