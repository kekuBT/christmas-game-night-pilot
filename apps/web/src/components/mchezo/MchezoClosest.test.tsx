/**
 * Fair starts (handoff 7004097156, H7): when a Closest Wins question closes, the next one's 40 s clock starts at once.
 * The phone must show the new question and its controls first; the previous answer comes after them, so it never
 * pushes Submit below the fold of a small phone while the clock runs (scripts/check-fair-starts.mjs measures the real
 * layout at 320x568; this pins the order).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MchezoClosest } from "./MchezoClosest.js";
import type { PlayerGame, PublicPlayer } from "../../types.js";

const PLAYERS: PublicPlayer[] = [
  { id: "p1", displayName: "Keku", avatar: "🙂", isHost: true, isCohost: false, connected: true },
  { id: "p2", displayName: "Amina", avatar: "🙂", isHost: false, isCohost: false, connected: true },
];
const revealed = [{ id: "q1", prompt: "How many arms does a starfish usually have?", unit: "arms", answer: 5, explanation: "Most species have five.", myGuess: 42 }];

function render(state: Record<string, unknown>) {
  const game = { id: "g1", gameId: "closest-wins", status: "playing", players: ["p1", "p2"], lifecycle: { model: "phased", officialEligible: true, unit: "questions", phaseKey: "q:1" }, state } as unknown as PlayerGame;
  return renderToStaticMarkup(<MchezoClosest game={game} players={PLAYERS} playerId="p1" intent={() => {}} post={async () => ({}) as never} roomId="r1" isHostOrCohost={false} title="Closest Wins" />);
}

describe("MchezoClosest: the next question comes before the last answer (H7)", () => {
  it("guessing: the prompt and Submit come before the last question's card", () => {
    const html = render({ prompt: "How tall is the Statue of Liberty, in metres?", unit: "m", revealed });
    const prompt = html.indexOf("How tall is the Statue of Liberty");
    const submit = html.indexOf('data-testid="mz-num-submit"');
    const last = html.indexOf('data-testid="mz-closest-last"');
    expect(prompt).toBeGreaterThan(0);
    expect(submit).toBeGreaterThan(prompt);
    expect(last).toBeGreaterThan(submit);
    // The last answer is still there, with its explanation.
    expect(html).toContain("Most species have five.");
  });

  it("the first question has no last-answer card", () => {
    const html = render({ prompt: "How many arms does a starfish usually have?", unit: "arms", revealed: [] });
    expect(html).toContain('data-testid="mz-num-submit"');
    expect(html).not.toContain('data-testid="mz-closest-last"');
  });

  it("waiting (guess in): nothing to do, so the last answer may lead", () => {
    const html = render({ prompt: "How tall is the Statue of Liberty, in metres?", unit: "m", myGuess: 90, revealed });
    expect(html).not.toContain('data-testid="mz-num-submit"');
    expect(html).toContain('data-testid="mz-closest-last"');
  });
});
