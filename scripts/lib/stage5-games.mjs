// Stage 5: how the whole-registry drivers (check-f5, e2e-browser) play the
// new games through their real UI, one step at a time. Each new game is
// practice-only, so those drivers start it as Practice. The dedicated
// drivers (check-majority-rules, ...) test each game in depth; this only
// lets the full-day drivers include every registered game.

/** New games that can only start as Practice (src/server/lifecycle.ts). */
export const STAGE5_PRACTICE_ONLY = ["majority-rules"];

const visible = async (loc, ms = 800) => { try { return await loc.isVisible({ timeout: ms }); } catch { return false; } };

/** The game's first play screen (after the briefing). */
export async function stage5Screen(page, gameId, timeout = 25000) {
  if (gameId === "majority-rules") return page.locator('[data-testid="mz-mr-predict"], [data-testid="mz-mr-vote"], [data-testid="mz-mr-wait"], [data-testid="mz-mr-reveal"]').first().waitFor({ timeout });
  throw new Error(`stage5Screen: unknown game ${gameId}`);
}

/** One step of play on this phone. Returns true if it did something. */
export async function stage5Act(page, gameId) {
  if (gameId === "majority-rules") {
    if (await visible(page.getByTestId("mz-mr-predict-a"), 500)) { await page.getByTestId("mz-mr-predict-a").click(); return true; }
    if (await visible(page.getByTestId("mz-mr-vote-a"), 500)) { await page.getByTestId("mz-mr-vote-a").click(); return true; }
    return false; // waiting for the room or the reveal
  }
  throw new Error(`stage5Act: unknown game ${gameId}`);
}

/** Is this phone on the game's results? */
export async function stage5Finished(page, gameId) {
  if (gameId === "majority-rules") return visible(page.getByTestId("mz-mr-results"), 500);
  return false;
}
