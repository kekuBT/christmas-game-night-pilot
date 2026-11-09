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

import { STAGE5_PRACTICE_ONLY, stage5Act, stage5Finished, stage5Screen } from "./lib/stage5-games.mjs";
import { connectionsGroups } from "./lib/content-oracle.mjs";
import { roomGo } from "./lib/room-nav.mjs";
import { diagnoseAll } from "./lib/diagnose.mjs";
import { launchBrowser } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3457";
// Stage 5.1 (O-14): the older panel names a game by its title ("Now playing: Category Sprint"), never its id.
const TITLES = Object.fromEntries((await (await fetch(`${BASE}/games`)).json()).map((g) => [g.id, g.title]));
const nowPlaying = (gameId) => `Now playing: ${TITLES[gameId] ?? gameId}`;
const browserArg = (args.find((a) => a.startsWith("--browser=")) ?? "--browser=chromium").split("=")[1];
const gamesArg = (args.find((a) => a.startsWith("--games=")) ?? "--games=all").split("=")[1];
const NAMES = ["Alex", "Sam", "Jo", "Kim"];
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
  if (STAGE5_PRACTICE_ONLY.includes(gameId)) return stage5Finished(page, gameId);
  // Kit games (Trivia, Geography, Math Mayhem) render no game-panel, so
  // the panelText lookup below would burn its full 2s timeout on every
  // check — and Math needs ~20 loop iterations (10 questions x 2
  // actions), which cannot fit the 180s budget at ~2.5s per check.
  // The "Back to lobby" button appears only on the results screen,
  // never in play, so check it first (same fast path as check-f5).
  if (gameId === "trivia" || gameId === "geography" || gameId === "math-mayhem" || gameId === "word-connections" || gameId === "caption-clash") {
    // Stage 5.2: a check, not a wait (as in check-f5): the polling loop
    // asks again, so waiting 0.5s here per page per pass only cost time.
    return await page.getByRole("button", { name: "Back to lobby" }).isVisible();
  }
  const t = await panelText(page);
  // Heading must match the game: right after a previous game finishes, the
  // panel still shows that finished game until the new game's projection
  // arrives, and a bare "Status: finished" check would false-positive.
  if (t.includes(nowPlaying(gameId)) && t.includes("Status: finished")) return true;
  // M6 Show Mode: a finished game shows the results screen instead of the
  // finished panel. The results screen only ever shows the latest finished
  // game, so its presence means the game just played is finished.
  if (await isVisible(page.getByTestId("show-results"), 500)) return true;
  return false;
}

// Mchezo Trivia play: AnswerGrid slabs, then "Next question", until the
// results screen's "Back to lobby" button appears.
async function actTrivia(page) {
  // Stage 5.2: answer this player's remaining questions through the shared
  // observable-state helper (scripts/lib/answer.mjs): option 0 each time,
  // as before, then "Waiting for the game to finish". The old loop probed
  // for absent buttons with 0.5s waits and slept between taps (~3.5s a
  // question); the helper polls the screen's own state and throws, with a
  // DIAG line, if an answer is not confirmed, where the old loop could
  // give up silently after its guard.
  if (await page.getByRole("button", { name: "Back to lobby" }).isVisible()) return true;
  const player = (await page.evaluate(() => sessionStorage.getItem("cgn_name"))) || "player";
  await answerKitQuestions(page, { player, choose: () => 0 });
  return true;
}

// Mchezo Closest play (J.3): kit panel with NumericGuess — no game-panel.
// Fill the number field and submit; if this player already guessed this
// question, the waiting view ("Your guess: N") is showing instead.
async function actClosest(page) {
  const input = page.getByTestId("mz-num-input");
  if (await isVisible(input, 1000)) {
    await input.fill("100");
    await page.getByTestId("mz-num-submit").click();
    await sleep(400);
    return true;
  }
  if (await isVisible(page.getByText(/^Your guess: /), 500)) return true;
  return false;
}
// Guess the Year in the kit (Work Package D): one event at a time.
// Each act() pass guesses the current event (or navigates to the
// next unguessed one). The old panel's "Submit year" button no longer
// exists — the App routes Year to MchezoYear first, so the old
// GamePanel year branch is dead. (Same helper in both drivers; the
// two scripts share no module.)
async function actYear(page) {
  const input = page.getByTestId("mz-num-input");
  if (await isVisible(input, 1000)) {
    await input.fill("2000");
    await page.getByTestId("mz-num-submit").click();
    await sleep(400);
  } else if (!(await isVisible(page.getByTestId("mz-year-guessed"), 500))) {
    return false;
  }
  // After a guess the kit shows that event's confirmation until the
  // player navigates — move to the next unguessed event, if one
  // remains; if all chips carry a check mark the player is done
  // (the waiting ring is showing).
  const chips = page.locator("[data-testid^='mz-year-q']");
  const n = await chips.count();
  for (let i = 0; i < n; i++) {
    if ((await chips.nth(i).innerText()) !== "\u2713") {
      await chips.nth(i).click();
      await sleep(200);
      break;
    }
  }
  return true;
}


// One action pass for a single player page, for the game currently playing.
// Returns true if it did anything (or the panel is already finished).
// Sprint 4: Word Connections has its own screen (mz-cx); the test oracle
// knows the board's groups from the words on screen.
async function actConnections(page) {
  if (await isVisible(page.getByRole("button", { name: "Back to lobby" }), 300)) return true;
  if (!(await isVisible(page.getByTestId("mz-cx"), 1000))) return false;
  const tiles = page.getByTestId("mz-cx-tile");
  const shown = (await tiles.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  if (shown.length === 0) return true; // puzzle over for this player
  const group = connectionsGroups(shown).find((g) => g.every((w) => shown.some((s) => s.toLowerCase() === w.toLowerCase())));
  if (!group) return false;
  for (const w of group) await tiles.filter({ hasText: new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).first().click();
  await page.getByTestId("mz-cx-submit").click();
  await sleep(600);
  return true;
}

// Sprint 4: Caption Clash has its own screens (write / vote / results).
async function actCaption(page, name) {
  if (await isVisible(page.getByRole("button", { name: "Back to lobby" }), 300)) return true;
  const input = page.getByTestId("mz-cap-input");
  if (await isVisible(input, 500)) {
    await input.fill(`caption by ${name}`);
    await page.getByTestId("mz-cap-submit").click();
    await sleep(400);
    return true;
  }
  const option = page.locator('[data-testid="mz-cap-option"]:not([disabled])').first();
  if (await isVisible(option, 500)) { await option.click(); await sleep(500); return true; }
  return (await page.getByTestId("mz-cap-wait").count()) > 0 || (await page.getByTestId("mz-cap-vote").count()) > 0;
}

async function act(page, gameId, name) {
  if (STAGE5_PRACTICE_ONLY.includes(gameId)) return stage5Act(page, gameId);
  if (gameId === "word-connections") return await actConnections(page);
  if (gameId === "caption-clash") return await actCaption(page, name);
  // Geography is a kit panel too (Work Package E) — same play shape as
  // Trivia, so the shared kit-question helper covers it. Math Mayhem
  // (§11) is the same shape again.
  if (gameId === "trivia" || gameId === "geography" || gameId === "math-mayhem") return await actTrivia(page);
  if (gameId === "closest-wins") return await actClosest(page);
  if (gameId === "guess-the-year") return await actYear(page);
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
    // Sprint 4: each game has its own board; the oracle finds its groups.
    const shownWords = (await tiles.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    for (const group of connectionsGroups(shownWords)) {
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
    // Stage 5.1 (O-06): the button names the acting team.
    const correct = panel.getByRole("button", { name: /^Correct \(\+100 to Team [AB]\)$/ });
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
  const browser = await launchBrowser(browserName, { headless: true });
  try {
    const pages = [];
    // Host creates a room.
    const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const host = await hostCtx.newPage();
    pages.push({ page: host, name: NAMES[0] });
    await host.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
    await host.getByPlaceholder("e.g. Auntie June").fill(NAMES[0]);
    await host.getByRole("button", { name: "Host a game" }).click();
    // Mchezo lobby: the room code lives on the share chip's aria-label.
    const shareChip = host.getByRole("button", { name: /^Share room code / });
    await shareChip.waitFor({ timeout: 15000 });
    let code = "";
    for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
      code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
      if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
    }
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`unexpected room code: ${code}`);
    console.log(`[${browserName}] room code ${code}`);
    // Three more players join by code.
    for (let i = 1; i < NAMES.length; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const p = await ctx.newPage();
      pages.push({ page: p, name: NAMES[i] });
      await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
      await p.getByPlaceholder("e.g. Auntie June").fill(NAMES[i]);
      await p.locator(".mz-code__input").fill(code);
      await p.getByRole("button", { name: "Join the game" }).click();
      await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
    }
    // Roster check on the host page. Mchezo seats show "You" for yourself,
    // so the host's own name is checked via the lobby heading instead.
    await host.getByRole("heading", { name: `You’re in, ${NAMES[0]}.` }).waitFor({ timeout: 15000 });
    for (const n of NAMES.slice(1)) await host.getByText(n, { exact: true }).first().waitFor({ timeout: 15000 });
    console.log(`[${browserName}] lobby roster: 4 players joined`);

    for (const gameId of games) {
      const label = `${gameId}`;
      try {
                await host.getByTestId("choose-game").click();
        await host.getByTestId(`select-game-${gameId}`).click();
        // Practice-only games (Impostor, Charades, and Stage 5's new games) start as Practice.
        await host.locator(`[data-testid="start-${["impostor", "charades", ...STAGE5_PRACTICE_ONLY].includes(gameId) ? "practice" : "official"}-${gameId}"]`).click();
        // D3: every player reads the rules briefing and taps I'm ready; play
        // starts for everyone at once and no per-phone intro follows.
        await passBriefing(pages.map((p) => p.page));
        for (const { page } of pages) {
          if (STAGE5_PRACTICE_ONLY.includes(gameId)) { await stage5Screen(page, gameId); continue; }
          if (gameId === "trivia" || gameId === "geography" || gameId === "math-mayhem") {
            // Mchezo Trivia intro is an 8s countdown with no dismiss button;
            // Geography is a kit panel too (Work Package E) — the same
            // QuestionScreen renders .mz-question, so this wait covers it.
            // the question screen appears when it ends.
            await page.locator(".mz-question").first().waitFor({ timeout: 30000 });
            continue;
          }
          if (gameId === "closest-wins") {
            // J.3: Closest renders in the Mchezo kit, not the old GamePanel,
            // so there is no "Now playing:" heading — the guess dial is the
            // gameplay signal.
            await page.getByTestId("mz-num-dial").waitFor({ timeout: 20000 });
          } else if (gameId === "guess-the-year") {
            // Work Package D: Year renders in the Mchezo kit too, so
            // there is no "Now playing:" heading — the progress line
            // is the gameplay signal.
            await page.getByTestId("mz-year-progress").waitFor({ timeout: 20000 });
          } else {
            await (gameId === "word-connections" ? page.getByTestId("mz-cx").waitFor({ timeout: 25000 }) : gameId === "caption-clash" ? page.getByTestId("mz-cap-write").waitFor({ timeout: 25000 }) : page.getByRole("heading", { name: nowPlaying(gameId) }).waitFor({ timeout: 20000 }));
          }
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
        // Dismiss the results screen so the lobby (and the next game's
        // start button) is visible again: M6 results use the testid, Mchezo
        // Trivia results use the "Back to lobby" button.
        try { await host.getByTestId("show-back-to-lobby").click({ timeout: 3000 }); }
        catch { try { await host.getByRole("button", { name: "Back to lobby" }).click({ timeout: 3000 }); } catch { /* already in lobby */ } }
        console.log(`[${browserName}] OK ${label}: finished`);
        results.push({ gameId, status: "finished" });
      } catch (e) {
        console.log(`[${browserName}] FAIL ${label}: ${e.message}`);
        for (const line of await diagnoseAll(pages)) console.log(`[${browserName}]   ${line}`);
        results.push({ gameId, status: "failed", error: e.message });
      }
    }

    // Championship + TV + Memory Book + reconnect, on the host page.
    // Note: after the games we are in the Mchezo lobby, so navigation uses
    // the lobby-extra buttons; TV shows the Mchezo stage when a Trivia
    // game is the latest subject, and the old dashboard otherwise (smoke).
    try {
      await roomGo(host, "cup");
      await host.getByText("Championship standings").waitFor({ timeout: 15000 });
      await host.getByTestId("cup-back").click(); // Stage 4: the Cup is a Night Circle screen with Back
      await roomGo(host, "tv");
      // TV subject is the LATEST game overall (Phase 2.1 lifecycle fix):
      // full runs end on Math Mayhem, so the TV view is the old dashboard;
      // a run ending on Trivia would show the Mchezo stage. Accept either.
      try {
        await host.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
        await host.getByRole("button", { name: "Back to phone view" }).click();
      } catch {
        await host.getByTestId("tv-show").waitFor({ timeout: 15000 }); // Stage 5: the live show
        await host.getByTestId("tv-back").click();
      }
      await roomGo(host, "memory");
      await host.getByPlaceholder("e.g. Ada won Math Mayhem in a tie-break").fill("E2E highlight: Alex won Math Mayhem");
      await host.getByRole("button", { name: "Add from last finished game" }).click();
      await host.getByText("E2E highlight: Alex won Math Mayhem").waitFor({ timeout: 15000 });
      // Scoped + exact: unscoped substring "Approve" also matches the
      // "Export approved" button, which comes first in DOM order, so the
      // old .first() click never actually approved (see F4 check notes).
      await host.locator('[data-testid="memory-entry"]', { hasText: "E2E highlight: Alex won Math Mayhem" }).last()
        .getByRole("button", { name: "Approve", exact: true }).click();
      await host.getByText(/Day 1 · approved/).waitFor({ timeout: 15000 });
      await host.getByRole("button", { name: "Export approved" }).click();
      await host.getByText(/E2E highlight: Alex won Math Mayhem/).last().waitFor({ timeout: 15000 });
      await roomGo(host, "reconnect");
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
