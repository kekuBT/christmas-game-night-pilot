// Answering kit question screens (Trivia, Geography, Math) from a driver,
// driven by OBSERVABLE app states instead of fixed sleeps.
//
// Why: the old per-driver helpers tapped an answer, slept ~250ms, and
// returned silently if "Next question" was not visible yet. On a slower
// browser a player could quietly stop answering, and the run failed much
// later at an unrelated wait ("reveal never appeared"), pointing at the
// wrong place. This helper never gives up silently: every step waits for
// a state change with a bounded timeout and otherwise throws an error that
// names the player, the question, and the state the page was stuck in.
//
// States (from the app's own accessible labels/text):
//   question  <main aria-label="Question N of M"> with enabled answer slabs
//   locked    <main aria-label="Answer locked in"> ("Next question" /
//             "Waiting for the game to finish")
//   waiting   "All your answers are in" / "You sat this one out" ring
//   finished  results ("Back to lobby") or the staged reveal
export class AnswerStuckError extends Error {}

async function stateOf(page) {
  return await page.evaluate(() => {
    const main = document.querySelector("main.mz-screen");
    const label = main?.getAttribute("aria-label") ?? "";
    const text = document.body.innerText;
    const q = /^Question (\d+) of (\d+)$/.exec(label);
    const enabledSlabs = document.querySelectorAll(".mz-slab:not([disabled])").length;
    if (q && enabledSlabs > 0) return { kind: "question", n: Number(q[1]), of: Number(q[2]) };
    if (label === "Answer locked in") return { kind: "locked", next: /Next question/.test(text) };
    if (document.querySelector('[data-testid="mz-reveal-step"], [data-testid="mz-reveal-standings"]') || /Back to lobby/.test(text)) return { kind: "finished" };
    if (/All your answers are in|You sat this one out/.test(text)) return { kind: "waiting" };
    return { kind: "other", label, snippet: text.replace(/\s+/g, " ").slice(0, 120) };
  });
}

async function waitForState(page, accept, { timeout, player, context }) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await stateOf(page);
    if (accept(last)) return last;
    await page.waitForTimeout(150);
  }
  throw new AnswerStuckError(`${player}: ${context} — still ${JSON.stringify(last)} after ${timeout}ms`);
}

/**
 * Answer every remaining question on a kit question screen.
 * `choose(questionNumber) -> slab index` picks the option. `limit` stops
 * after that many answers (e.g. "answer 3, then the phone dies").
 * Returns how many questions this call answered. Throws AnswerStuckError
 * (with player/question/state) instead of ever returning early silently.
 */
export async function answerKitQuestions(page, { player, choose, timeout = 20000, maxQuestions = 15, limit = Infinity }) {
  let answered = 0;
  for (let guard = 0; guard < maxQuestions * 3; guard++) {
    const st = await waitForState(page, (s) => s.kind !== "other", { timeout, player, context: "waiting for a question, the locked view, the waiting ring or results" });
    if (st.kind === "finished" || st.kind === "waiting") return answered;
    if (st.kind === "locked") {
      if (!st.next) {
        await page.getByRole("button", { name: "Waiting for the game to finish" }).click();
        await waitForState(page, (s) => s.kind === "waiting" || s.kind === "finished", { timeout, player, context: "after 'Waiting for the game to finish'" });
        return answered;
      }
      await page.getByRole("button", { name: "Next question" }).click();
      await waitForState(page, (s) => s.kind !== "locked" && s.kind !== "other", { timeout, player, context: "after 'Next question'" });
      continue;
    }
    // A question: tap the chosen option and require the app to move on.
    const index = choose(st.n);
    await page.locator(".mz-slab:not([disabled])").nth(index).click();
    await waitForState(page, (s) => !(s.kind === "question" && s.n === st.n), { timeout, player, context: `after answering question ${st.n} of ${st.of} (option ${index}); the answer was not confirmed` });
    answered++;
    if (answered >= limit) return answered;
    if (answered > maxQuestions) throw new AnswerStuckError(`${player}: answered more than ${maxQuestions} questions; the game never finished`);
  }
  throw new AnswerStuckError(`${player}: no progress after ${maxQuestions * 3} steps`);
}
