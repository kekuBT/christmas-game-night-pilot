// F5 browser check: a full day's playlist through the browser, via Playwright.
//
// Usage:
//   npm run build:web
//   PORT=3457 npm run serve &        # in one shell; stop it and `rm -rf data` after
//   node scripts/check-f5.mjs [baseUrl]
//
// Defaults: base http://localhost:3457, Chromium only (multi-browser coverage
// lives in scripts/e2e-browser.mjs; this script proves the F5 day-playlist
// behaviours, not a second full multi-browser sweep). Fictional test players
// only; local server only.
//
// What it proves, through the real UI (plus the public TV projection and
// ledger endpoints for the leak/ledger assertions):
//   1. A full day playlist: host + 3 players play every game in /games
//      registry order to "Status: finished" in ONE room, with no stuck game
//      (each game gets a 180s deadline; a failure is recorded and the run
//      continues to the next game, so one stuck game cannot hide the rest).
//   2. No secret leak: while each game is PLAYING (before any answer is
//      driven for it), the TV projection contains no answer keys, secret
//      words, recovery tokens, or per-player private state. Answer keys in
//      FINISHED games are legitimate by design and are not flagged.
//   3. The full day settles: the ledger holds one game-finished event per
//      game played (counted by event type, since ledger events carry
//      gameInstanceIds and Math Mayhem scores per-question reasons), the
//      TV projection marks every playlist game finished, the championship
//      view lists all 4 players with a per-game breakdown, the TV
//      Dashboard shows the 5 most recent finished games (its designed
//      cap, not the whole day), and a Memory Book entry from the last
//      finished game approves and appears in the export.
// The 7-day seeded API half of F5 is already covered by the passing unit
// tests (tests/championship.test.ts, tests/scoring.test.ts); this script is
// the browser half that was still open. A failed check is recorded and the
// process exits non-zero.

import { STAGE5_PRACTICE_ONLY, stage5Act, stage5Finished, stage5Screen } from "./lib/stage5-games.mjs";
import { connectionsGroups } from "./lib/content-oracle.mjs";
import { roomGo } from "./lib/room-nav.mjs";
import { diagnoseAll } from "./lib/diagnose.mjs";
import { launchChromium } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3457";
// Stage 5.1 (O-14): the older panel names a game by its title ("Now playing: Category Sprint"), never its id.
const TITLES = Object.fromEntries((await (await fetch(`${BASE}/games`)).json()).map((g) => [g.id, g.title]));
const nowPlaying = (gameId) => `Now playing: ${TITLES[gameId] ?? gameId}`;
const NAMES = ["Alex", "Sam", "Jo", "Kim"];
const QUIZ_GAMES = ["math-mayhem", "trivia", "who-said-that", "geography"];
// Secrets that must never appear anywhere in a TV projection; answer keys
// are forbidden only while a game is still PLAYING (see check-multiplayer).
const FORBIDDEN_TV_GLOBAL_KEYS = ["recoveryToken", "secretWord", "impostorWord", "myAnswers", "myScore"];
const FORBIDDEN_PLAYING_KEYS = ["correctAnswer", "correctIndex", "answerKey", "correctYear"];
const results = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  results.push({ label, ok });
};
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
  // Geography's results are the old ShowResults screen (Work Package E),
  // which carries the same "Back to lobby" button as Trivia's results —
  // and Geography has no game-panel, so the panelText lookup below would
  // burn its full 2s timeout on every check. Without this fast path the
  // loop costs ~2.5s per page per iteration and the 8-question × 2-action
  // geography game cannot finish inside the 180s budget (it needs ~16
  // iterations); with it each check costs 0.5s and the game finishes in
  // ~90s. The button appears only on the results screen, never in play.
  // Math Mayhem (§11) is the same shape — kit panel, old ShowResults,
  // no game-panel — and needs it even more (10 questions × 2 actions).
  if (gameId === "trivia" || gameId === "geography" || gameId === "math-mayhem" || gameId === "word-connections" || gameId === "caption-clash") {
    try { return await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }); } catch { return false; }
  }
  // M6 Show Mode: a finished game shows the results screen instead of the
  // finished panel (same pattern as check-f4.mjs).
  try { if (await page.getByTestId("show-results").isVisible({ timeout: 500 })) return true; } catch { /* not on results */ }
  // Stage 5.2: Closest Wins and Guess the Year are kit screens with no
  // game-panel; the panelText lookup below only waited out its 2s for them.
  if (gameId === "closest-wins" || gameId === "guess-the-year") return false;
  const t = await panelText(page);
  // Heading must match the game: right after a previous game finishes, the
  // panel still shows that finished game until the new game's projection
  // arrives, and a bare "Status: finished" check would false-positive.
  return t.includes(nowPlaying(gameId)) && t.includes("Status: finished");
}

// Mchezo Closest play (J.3): kit panel with NumericGuess — no game-panel.
// Fill the number field and submit; if this player already guessed this
// question, the waiting view ("Your guess: N") is showing instead.
// (Same helper as scripts/e2e-browser.mjs; the two drivers are separate
// scripts with no shared module.)
async function actClosest(page) {
  const input = page.getByTestId("mz-num-input");
  // Stage 5.2: checks, not waits; the polling loop asks again next pass.
  if (await input.isVisible()) {
    await input.fill("100");
    await page.getByTestId("mz-num-submit").click();
    await sleep(400);
    return true;
  }
  if (await page.getByText(/^Your guess: /).first().isVisible()) return true;
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
  // Stage 5.2: checks, not waits; the polling loop asks again next pass.
  if (await input.isVisible()) {
    await input.fill("2000");
    await page.getByTestId("mz-num-submit").click();
    await sleep(400);
  } else if (!(await page.getByTestId("mz-year-guessed").isVisible())) {
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
// Mirrors the driver in scripts/e2e-browser.mjs; returns true if it did
// anything (or the panel is already finished).
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
  // Geography renders in the Mchezo kit too (Work Package E) — same play
  // shape as Trivia (QuestionScreen slabs + locked view + Next question).
  // Math Mayhem (§11) is the same shape again.
  if (gameId === "trivia" || gameId === "geography" || gameId === "math-mayhem") {
    // Stage 5.2: still one action per pass, so players stay interleaved
    // question by question, but each probe is a check, not a wait. A player
    // already done used to cost 2.5s of waiting per pass.
    if (await page.getByRole("button", { name: "Back to lobby" }).isVisible()) return true;
    const slab = page.locator(".mz-slab:not([disabled])").first();
    if (await slab.isVisible()) { await slab.click(); await sleep(300); return true; }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible()) { await next.click(); await sleep(300); return true; }
    return false;
  }
  if (gameId === "closest-wins") return await actClosest(page);
  if (gameId === "guess-the-year") return await actYear(page);
  const panel = page.locator('[data-testid="game-panel"]');
  if (!(await isVisible(panel, 3000))) return false;
  if ((await panelText(page)).includes("Status: finished")) return true;

  if (QUIZ_GAMES.includes(gameId)) {
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

async function tvLeakCheck(gameId, roomId) {
  const proj = await (await fetch(`${BASE}/rooms/${roomId}/projection?audience=tv`)).json();
  const raw = JSON.stringify(proj);
  const playing = proj.games?.find((g) => g.status === "playing" || g.id === gameId);
  const playingRaw = playing ? JSON.stringify(playing) : "";
  const leakedGlobal = FORBIDDEN_TV_GLOBAL_KEYS.filter((k) => raw.includes(`"${k}"`));
  const leakedPlaying = FORBIDDEN_PLAYING_KEYS.filter((k) => playingRaw.includes(`"${k}"`));
  const leaked = [...leakedGlobal, ...leakedPlaying.map((k) => `${k} (playing game)`)];
  check(`TV projection leak-free while ${gameId} playing`, leaked.length === 0,
    leaked.length ? `leaked keys: ${leaked.join(", ")}` : "no forbidden keys");
}

const browser = await launchChromium({ headless: true });
try {
  const pages = [];
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  pages.push({ page: host, name: NAMES[0] });
  await host.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("e.g. Auntie June").fill(NAMES[0]);
  await host.getByTestId("host-kind-cup").click(); await host.getByRole("button", { name: "Host a game" }).click();
  const shareChip = host.getByRole("button", { name: /^Share room code / });
  await shareChip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
  }
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`unexpected room code: ${code}`);
  const roomId = await host.evaluate(() => sessionStorage.getItem("cgn_roomId"));
  if (!roomId) throw new Error("host sessionStorage has no cgn_roomId");

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
  await host.getByRole("heading", { name: `You’re in, ${NAMES[0]}.` }).waitFor({ timeout: 15000 });
  for (const n of NAMES.slice(1)) await host.getByText(n, { exact: true }).first().waitFor({ timeout: 15000 });
  check("lobby roster: 4 players joined", true);

  const registry = await (await fetch(`${BASE}/games`)).json();
  // Stage 9.1: this day is a Family Cup; casual-only games (Jebena Rush) can't start in a Cup and
  // are played end to end by their own driver (check-jebena-rush).
  const casualOnly = registry.filter((g) => g.casualOnly).map((g) => g.id);
  const gameIds = registry.filter((g) => !g.casualOnly).map((g) => g.id);
  console.log(`day playlist: ${gameIds.join(", ")} (${gameIds.length} games; casual-only, not in a Cup: ${casualOnly.join(", ") || "none"})`);

  const finishedGames = [];
  for (const gameId of gameIds) {
    try {
            await host.getByTestId("choose-game").click();
      await host.getByTestId(`select-game-${gameId}`).click();
      // Practice-only games (Impostor, Charades, and Stage 5's new games) start as Practice.
      await host.locator(`[data-testid="start-${["impostor", "charades", ...STAGE5_PRACTICE_ONLY].includes(gameId) ? "practice" : "official"}-${gameId}"]`).click();
      await passBriefing(pages.map((p) => p.page)); // D3: every player taps I'm ready
      for (const { page } of pages) {
        // Geography is a kit panel too (Work Package E) — the same
        // QuestionScreen renders .mz-question, so the trivia wait covers it.
        // Math Mayhem (§11) is the same shape again.
        if (STAGE5_PRACTICE_ONLY.includes(gameId)) await stage5Screen(page, gameId);
        else if (gameId === "trivia" || gameId === "geography" || gameId === "math-mayhem") await page.locator(".mz-question").waitFor({ timeout: 30000 });
        // J.3: Closest renders in the Mchezo kit, not the old GamePanel, so
        // there is no "Now playing:" heading — the guess dial is the signal
        // (the 8s intro auto-advances inside the 20s wait).
        else if (gameId === "closest-wins") await page.getByTestId("mz-num-dial").waitFor({ timeout: 20000 });
        // Guess the Year is a kit panel too (Work Package D) — there is
        // no "Now playing:" heading; the progress line is the signal.
        else if (gameId === "guess-the-year") await page.getByTestId("mz-year-progress").waitFor({ timeout: 20000 });
        else await (gameId === "word-connections" ? page.getByTestId("mz-cx").waitFor({ timeout: 25000 }) : gameId === "caption-clash" ? page.getByTestId("mz-cap-write").waitFor({ timeout: 25000 }) : page.getByRole("heading", { name: nowPlaying(gameId) }).waitFor({ timeout: 20000 }));
      }
      // Leak scan BEFORE driving any answers, while the game is playing.
      await tvLeakCheck(gameId, roomId);
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
      try { await host.getByRole("button", { name: "Back to lobby" }).click({ timeout: 3000 }); } catch { /* not Mchezo results */ }
      try { await host.getByTestId("show-back-to-lobby").click({ timeout: 3000 }); } catch { /* already in lobby */ }
      finishedGames.push(gameId);
      console.log(`OK ${gameId}: finished`);
      check(`day playlist: ${gameId} finished without sticking`, true);
    } catch (e) {
      console.log(`FAIL ${gameId}: ${e.message}`);
      // Sprint 3: where was every player, on the server and on screen?
      for (const line of await diagnoseAll(pages)) console.log(`  ${line}`);
      check(`day playlist: ${gameId} finished without sticking`, false, e.message);
      // A stuck game must not end the day: the concurrent-game guard
      // (decision L08) blocks starting the next game while one is playing,
      // so a genuinely stuck game fails the remaining games too and the
      // final ledger count will show it — do not force-start past it.
      break;
    }
  }
  check("day playlist: all games finished in one room",
    finishedGames.length === gameIds.length,
    `${finishedGames.length}/${gameIds.length} finished`);

  // --- The full day settles: ledger, championship, TV, Memory Book. ---
  // The ledger records game-finished events by gameInstanceId (game-1…
  // game-11), not by registry game id, and Math Mayhem's score reasons are
  // per-question (math:math-1…), so a substring scan for "math-mayhem"
  // misses it even though its finish event exists. Count finish events
  // and cross-check finished game ids through the TV projection instead.
  // Ledger is room-member-only since the PR #3 auth fix: fetch it through
  // the host page so the session token from sessionStorage is sent.
  const ledger = await host.evaluate(async (rid) => {
    const token = sessionStorage.getItem("cgn_token");
    const r = await fetch(`/rooms/${rid}/ledger`, { headers: token ? { "x-session-token": token } : {} });
    return r.json();
  }, roomId);
  const finishedCount = (Array.isArray(ledger) ? ledger : [])
    .filter((e) => e.type === "game-finished").length;
  check("ledger holds one game-finished event per playlist game",
    finishedCount === gameIds.length, `${finishedCount}/${gameIds.length} finish events`);
  const tvProj = await (await fetch(`${BASE}/rooms/${roomId}/projection?audience=tv`)).json();
  const finishedIds = (tvProj.games ?? []).filter((g) => g.status === "finished").map((g) => g.gameId);
  check("TV projection marks every playlist game finished",
    gameIds.every((id) => finishedIds.includes(id)),
    gameIds.filter((id) => !finishedIds.includes(id)).join(", ") || "all finished");

  await roomGo(host, "cup");
  await host.getByText("Championship standings").waitFor({ timeout: 15000 });
  await sleep(1500);
  // Stage 4 (S3-CUP-01): standings in their own section; the games played below them.
  const standingsText = await host.getByTestId("cup-standings").innerText();
  check("championship standings list all 4 players after full day",
    NAMES.every((n) => standingsText.includes(n)));
  check("championship per-game breakdown present after full day",
    /Official games so far/.test(await host.getByTestId("cup-games").innerText()));

  // TV subject is the LATEST game overall (Phase 2.1 lifecycle fix): the
  // playlist ends on Math Mayhem, so the TV view is the old dashboard
  // with Now playing + Recent games — not the stale Trivia stage. The
  // stage itself is covered by the dedicated TV lifecycle driver.
  // Stage 5: the live show opens on the last game's final standings; its
  // Lobby view lists tonight's games, the last 5 by design (slice(-5)).
  await roomGo(host, "tv");
  await host.getByTestId("tv-show").waitFor({ timeout: 15000 });
  await host.getByTestId("tv-dir-lobby").click();
  await host.getByTestId("tv-recent").waitFor({ timeout: 15000 });
  await sleep(1000);
  const recentText = await host.getByTestId("tv-recent").innerText();
  const recentFive = gameIds.slice(-5).map((id) => registry.find((g) => g.id === id).title);
  check("TV shows the 5 most recent finished games",
    recentFive.every((t) => recentText.includes(t)) && (await host.getByTestId("tv-recent").locator("li").count()) === 5,
    recentFive.filter((t) => !recentText.includes(t)).join(", ") || "all 5 listed");

  // The TV's "Back to phone view" returns to the lobby, where the extra
  // carries Memory Book.
  await host.getByTestId("tv-back").click();
  await host.getByRole("heading", { name: `You’re in, ${NAMES[0]}.` }).waitFor({ timeout: 15000 });
  const HIGHLIGHT = "F5 day highlight: full playlist finished";
  await roomGo(host, "memory");
  await host.getByText("Christmas Memory Book").waitFor({ timeout: 15000 });
  await host.getByPlaceholder(/Ada won Math Mayhem/).fill(HIGHLIGHT);
  await host.getByRole("button", { name: "Add from last finished game" }).click();
  await host.getByText(HIGHLIGHT).waitFor({ timeout: 15000 });
  const entryCard = host.locator('[data-testid="memory-entry"]', { hasText: HIGHLIGHT }).last();
  await entryCard.getByRole("button", { name: "Approve", exact: true }).click();
  await host.getByText(/Day 1 · approved/).waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Export approved" }).click();
  await host.locator("pre").waitFor({ timeout: 15000 });
  await sleep(500);
  const exportText = await host.locator("pre").textContent();
  check("Memory Book export contains the full-day entry", exportText.includes(HIGHLIGHT));
} catch (e) {
  console.log(`FATAL: ${e.message}`);
  results.push({ label: "script completed without fatal error", ok: false });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0
  ? `F5 ALL PASSED (${results.length}/${results.length})`
  : `F5 FAILED: ${failed}/${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
