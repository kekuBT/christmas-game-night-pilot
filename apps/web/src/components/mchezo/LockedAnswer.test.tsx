/**
 * Beta R1-R, R5 (review 6904986723): the screen after a locked answer in the self-paced quiz games, rendered to
 * markup. The browser check (scripts/check-locked-answer.mjs) measures the real layout; this pins the structure.
 *
 * - A nonfinal answer: Next question comes before the room's progress, the wording says nobody needs to wait, and
 *   nothing says "Waiting for everyone".
 * - The final answer: "All your answers are in", with no continuation control (only the TV view switch remains).
 * - A solo round has no room to show.
 * - The room's progress stays counts only.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LockedAnswer, type LockedAnswerProps } from "./LockedAnswer.js";
import type { PublicGame, PublicPlayer } from "../../types.js";

const player = (id: string, displayName: string): PublicPlayer => ({ id, displayName, avatar: "🙂", isHost: id === "p1", isCohost: false, connected: true });
const PLAYERS = [player("p1", "Keku"), player("p2", "Bartholomew Featherstone")];
const GAME = { id: "g1", gameId: "trivia", official: false, status: "playing", timedOut: false, players: ["p1", "p2"], deadlineAt: Date.now() + 300_000, progress: { total: 2, started: 2, finished: 0 } } as unknown as PublicGame;

function render(over: Partial<LockedAnswerProps> = {}) {
  const props: LockedAnswerProps = { answer: "John Glenn", answerIndex: 1, questionNumber: 1, questionCount: 10, remaining: 9, onNext: () => {}, players: PLAYERS, playerId: "p1", publicGame: GAME, onTv: () => {}, ...over };
  const html = renderToStaticMarkup(<LockedAnswer {...props} />);
  const text = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").trim());
  return { html, text, buttons };
}

describe("LockedAnswer (R5)", () => {
  it("a nonfinal answer leads with carrying on: Next question before the room's progress", () => {
    const { html, text, buttons } = render();
    expect(html).toContain('aria-label="Answer locked in"');
    expect(buttons).toContain("Next question");
    const next = html.indexOf(">Next question<");
    const ring = html.indexOf('class="mz-wait"');
    expect(next).toBeGreaterThan(0);
    expect(ring).toBeGreaterThan(next);
    expect(text).toContain("you don’t need to wait for anyone. 9 questions left.");
    expect(text).toContain("Question 1 of 10 · your answer");
    expect(text).not.toMatch(/waiting for everyone/i);
    expect(text).not.toMatch(/Waiting for the game to finish/);
  });

  it("counts the questions left in the singular too", () => {
    expect(render({ questionNumber: 9, remaining: 1 }).text).toContain("1 question left.");
  });

  it("the final answer: all your answers are in, and no continuation control", () => {
    const { html, text, buttons } = render({ questionNumber: 10, remaining: 0 });
    expect(html).toContain('aria-label="All your answers are in"');
    expect(text).toContain("Question 10 of 10 · your last answer");
    expect(text).toMatch(/All your answers are in/);
    expect(buttons).toEqual(["TV stage"]);
  });

  it("a solo round shows no room, nonfinal or final", () => {
    const nonfinal = render({ solo: true, onTv: undefined });
    expect(nonfinal.html).not.toContain('class="mz-wait"');
    expect(nonfinal.buttons).toEqual(["Next question"]);
    const final = render({ solo: true, onTv: undefined, remaining: 0, questionNumber: 10 });
    expect(final.html).not.toContain('class="mz-wait"');
    expect(final.buttons).toEqual([]);
    expect(final.text).toContain("All your answers are in.");
  });

  it("the room's progress stays counts only (no per-player answered marks)", () => {
    const { html, text } = render();
    expect(text).toMatch(/0\s*\/2/);
    expect(html).not.toMatch(/answered-mark|data-answered/);
  });

  it("a game's own note sits under the card (Math Mayhem's answer time)", () => {
    const { html } = render({ note: <p data-testid="mz-math-elapsed">Answered in 0.9 s</p>, nextTestId: "mz-math-next" });
    expect(html.indexOf("mz-math-elapsed")).toBeLessThan(html.indexOf("mz-math-next"));
  });
});
