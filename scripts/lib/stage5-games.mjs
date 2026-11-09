// Stage 5: how the whole-registry drivers (check-f5, e2e-browser) play the
// new games through their real UI, one step at a time. Each new game is
// practice-only, so those drivers start it as Practice. The dedicated
// drivers (check-majority-rules, check-pattern-pulse, ...) test each game in
// depth; this only lets the full-day drivers include every registered game.

/** New games that can only start as Practice (src/server/lifecycle.ts). */
export const STAGE5_PRACTICE_ONLY = ["majority-rules", "pattern-pulse", "draw-guess"];

const visible = async (loc, ms = 800) => { try { return await loc.isVisible({ timeout: ms }); } catch { return false; } };

/** Pattern Pulse: the pattern each phone read while memorising (the screen hides it). */
const pulseSeen = new WeakMap();
/**
 * Draw & Guess: the driver plays every phone, so the drawer's phone tells the
 * guessers' phones the word for that turn (a real guesser never sees it).
 */
let drawTurn = { label: "", word: "" };
const drewOn = new WeakMap();
const turnLabel = async (page) => ((await page.locator(".mz-mr-round").first().textContent().catch(() => "")) ?? "").replace(/·.*$/, "").trim();

/** The game's first play screen (after the briefing). */
export async function stage5Screen(page, gameId, timeout = 25000) {
  if (gameId === "majority-rules") return page.locator('[data-testid="mz-mr-predict"], [data-testid="mz-mr-vote"], [data-testid="mz-mr-wait"], [data-testid="mz-mr-reveal"]').first().waitFor({ timeout });
  if (gameId === "pattern-pulse") return page.locator('[data-testid="mz-pp-ready"], [data-testid="mz-pp-memorise"], [data-testid="mz-pp-input"], [data-testid="mz-pp-done"]').first().waitFor({ timeout });
  if (gameId === "draw-guess") return page.locator('[data-testid="mz-dg-draw"], [data-testid="mz-dg-guess"], [data-testid="mz-dg-reveal"]').first().waitFor({ timeout });
  throw new Error(`stage5Screen: unknown game ${gameId}`);
}

/** One step of play on this phone. Returns true if it did something. */
export async function stage5Act(page, gameId) {
  if (gameId === "majority-rules") {
    if (await visible(page.getByTestId("mz-mr-predict-a"), 500)) { await page.getByTestId("mz-mr-predict-a").click(); return true; }
    if (await visible(page.getByTestId("mz-mr-vote-a"), 500)) { await page.getByTestId("mz-mr-vote-a").click(); return true; }
    return false; // waiting for the room or the reveal
  }
  if (gameId === "pattern-pulse") {
    if (await visible(page.getByTestId("mz-pp-open"), 300) && await page.getByTestId("mz-pp-open").isEnabled()) {
      await page.getByTestId("mz-pp-open").click();
      // Read the pattern while it's on screen (it hides on the server's clock).
      try {
        await page.getByTestId("mz-pp-memorise").waitFor({ timeout: 5000 });
        pulseSeen.set(page, await page.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol))));
      } catch { pulseSeen.delete(page); }
      return true;
    }
    if (await visible(page.getByTestId("mz-pp-submit"), 300)) {
      const len = await page.locator(".mz-pp-slot").count();
      if (len === 0 || await page.getByTestId("mz-pp-key-0").isDisabled()) return false;
      const seq = pulseSeen.get(page) ?? [];
      const entry = seq.length === len ? seq : Array.from({ length: len }, (_, i) => i % 6); // a fair guess if the pattern was missed
      for (const s of entry) await page.getByTestId(`mz-pp-key-${s}`).click();
      await page.getByTestId("mz-pp-submit").click();
      pulseSeen.delete(page);
      return true;
    }
    return false; // memorising, or finished and waiting for the others
  }
  if (gameId === "draw-guess") {
    if (await visible(page.getByTestId("mz-dg-draw"), 300)) {
      const label = await turnLabel(page);
      const word = ((await page.getByTestId("mz-dg-word").textContent()) ?? "").replace(/^Draw:\s*/i, "").trim();
      drawTurn = { label, word };
      if (drewOn.get(page) === label) return false;
      const box = await page.getByTestId("mz-dg-board").boundingBox();
      if (!box) return false;
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 8 });
      await page.mouse.up();
      drewOn.set(page, label);
      return true;
    }
    if (await visible(page.getByTestId("mz-dg-input"), 300) && await page.getByTestId("mz-dg-input").isEnabled()) {
      const label = await turnLabel(page);
      if (!drawTurn.word || drawTurn.label !== label) return false; // the drawer's phone hasn't been seen this turn yet
      await page.getByTestId("mz-dg-input").fill(drawTurn.word);
      await page.getByTestId("mz-dg-send").click();
      return true;
    }
    return false; // got it already, or the reveal
  }
  throw new Error(`stage5Act: unknown game ${gameId}`);
}

/** Is this phone on the game's results? */
export async function stage5Finished(page, gameId) {
  if (gameId === "majority-rules") return visible(page.getByTestId("mz-mr-results"), 500);
  if (gameId === "pattern-pulse") return visible(page.getByTestId("mz-pp-results"), 500);
  if (gameId === "draw-guess") return visible(page.getByTestId("mz-dg-results"), 500);
  return false;
}
