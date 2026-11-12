/**
 * Stage 9.3: Spectrum's display helpers and the cooperative branches of the
 * shared result surfaces (docs/stage9/stage93.md §3, §5–§7). Pure: no React.
 * The rendered screens are covered by scripts/check-spectrum.mjs.
 */
import { describe, expect, it } from "vitest";
import {
  clampGuess, clueDraft, closenessWord, guessesLine, revealLine, scaleName, secondsLeft, stepGuess, teamEndLine, teamSummaryLine, teamTotalLine, valueText, CLUE_MAX,
} from "../apps/web/src/ui/mchezo/lib/spectrum.js";
import { resultLine, winnerLine } from "../apps/web/src/ui/mchezo/lib/tvfeed.js";
import { briefingRules } from "../apps/web/src/ui/mchezo/lib/briefing.js";
import { participationLine } from "../apps/web/src/ui/mchezo/lib/lifecycle.js";
import { TV_HINT } from "../apps/web/src/ui/mchezo/lib/tvHints.js";
import { humanError } from "../apps/web/src/ui/mchezo/lib/errors.js";
import { COVERS } from "../apps/web/src/ui/mchezo/lib/covers.js";
import { DEFAULT_FILTERS, filterGames } from "../apps/web/src/ui/mchezo/lib/library.js";
import { GAME_MANIFESTS } from "../src/games/manifest.js";

const pair = { left: "Cold", right: "Hot", meaning: "How hot something is." };

describe("the scale's keyboard (9.2 §10): arrows ±1, Page Up/Down ±10, Home/End; clamped 0–100", () => {
  it("each key, at the middle and at both ends", () => {
    expect(stepGuess(50, "ArrowRight")).toBe(51);
    expect(stepGuess(50, "ArrowUp")).toBe(51);
    expect(stepGuess(50, "ArrowLeft")).toBe(49);
    expect(stepGuess(50, "ArrowDown")).toBe(49);
    expect(stepGuess(50, "PageUp")).toBe(60);
    expect(stepGuess(50, "PageDown")).toBe(40);
    expect(stepGuess(50, "Home")).toBe(0);
    expect(stepGuess(50, "End")).toBe(100);
    expect(stepGuess(95, "PageUp")).toBe(100);
    expect(stepGuess(4, "PageDown")).toBe(0);
    expect(stepGuess(100, "ArrowRight")).toBe(100);
    expect(stepGuess(0, "ArrowLeft")).toBe(0);
  });
  it("any other key does nothing (only Enter sends, and that is the form's job)", () => {
    for (const k of ["Enter", " ", "a", "Tab", "Escape"]) expect(stepGuess(50, k)).toBeNull();
  });
  it("values are whole numbers in range; nonsense becomes the middle", () => {
    expect(clampGuess(-5)).toBe(0);
    expect(clampGuess(140)).toBe(100);
    expect(clampGuess(41.6)).toBe(42);
    expect(clampGuess(Number.NaN)).toBe(50);
  });
  it("the scale's name and a value in words name both ends", () => {
    expect(scaleName(pair)).toBe("From Cold (0) to Hot (100)");
    expect(valueText(12, pair)).toBe("12, toward Cold");
    expect(valueText(88, pair)).toBe("88, toward Hot");
    expect(valueText(50, pair)).toBe("50, the middle");
  });
});

describe("the clue draft mirrors the server: cleaned, 1–80 code points, any language, digits allowed", () => {
  it("cleaning and the bound", () => {
    expect(clueDraft("  a   cup\tof tea ")).toEqual({ cleaned: "a cup of tea", length: 12, ok: true });
    expect(clueDraft("   ").ok).toBe(false);
    expect(clueDraft("x".repeat(CLUE_MAX)).ok).toBe(true);
    expect(clueDraft("x".repeat(CLUE_MAX + 1)).ok).toBe(false);
    expect(clueDraft("ቡ".repeat(CLUE_MAX)).ok).toBe(true); // code points, not bytes or UTF-16 units
    expect(clueDraft("a 10-minute walk").ok).toBe(true);
  });
});

describe("the reveal and the team result in words (never a person's result)", () => {
  it("a scored round, and every way a round scores 0", () => {
    expect(revealLine({ reason: "scored", target: 72, aggregate: 68, distance: 4, points: 10 })).toBe("Target 72 · team guess 68 · 4 away · +10 points for the team");
    expect(revealLine({ reason: "scored", target: 30, aggregate: 60, distance: 30, points: 0 })).toBe("Target 30 · team guess 60 · 30 away · +0 points for the team");
    expect(revealLine({ reason: "no-clue", target: 41, aggregate: null, distance: null, points: 0 })).toBe("No clue in time · target 41 · 0 points");
    expect(revealLine({ reason: "giver-left", target: 41, aggregate: null, distance: null, points: 0 })).toBe("The clue-giver left before the clue · target 41 · 0 points");
    expect(revealLine({ reason: "no-guesses", target: 41, aggregate: null, distance: null, points: 0 })).toBe("No guesses in time · target 41 · 0 points");
  });
  it("the reveal's heading is about the team's closeness", () => {
    expect(closenessWord({ reason: "scored", points: 10 })).toBe("Bullseye!");
    expect(closenessWord({ reason: "scored", points: 7 })).toBe("Close!");
    expect(closenessWord({ reason: "scored", points: 4 })).toBe("Not bad");
    expect(closenessWord({ reason: "scored", points: 0 })).toBe("Missed it");
    expect(closenessWord({ reason: "no-clue", points: 0 })).toBe("Round skipped");
  });
  it("the one total; an early ending says why and keeps the points", () => {
    expect(teamTotalLine({ total: 31, max: 40 })).toBe("Team result: 31 out of 40");
    expect(teamSummaryLine({ total: 31, max: 40 })).toBe("Team result: 31 out of 40 · one shared team score");
    const rounds = [{}, {}] as never[];
    expect(teamEndLine({ end: "completed", rounds: [{}, {}, {}, {}] as never[], roundsPlanned: 4 })).toBeNull();
    expect(teamEndLine({ end: "too-few-players", rounds, roundsPlanned: 4 })).toMatch(/^Fewer than two players were left, so the match ended after 2 of 4 rounds\. The points the team earned stand\.$/);
    expect(teamEndLine({ end: null, rounds, roundsPlanned: 4 }, "backstop-partial")).toMatch(/time limit after 2 of 4 rounds/);
  });
  it("counts and the countdown", () => {
    expect(guessesLine({ guessesIn: 1, guessesNeeded: 1 })).toBe("1 of 1 guess in");
    expect(guessesLine({ guessesIn: 2, guessesNeeded: 5 })).toBe("2 of 5 guesses in");
    expect(secondsLeft(10_000, 4_100)).toBe(6);
    expect(secondsLeft(10_000, 12_000)).toBe(0);
    expect(secondsLeft(undefined, 0)).toBeNull();
    expect(secondsLeft(200_000, 0, 60_000)).toBe(60); // never more than the phase's length
  });
});

describe("the shared surfaces' cooperative branch (§3): a team result, never a winner", () => {
  it("a finished cooperative game's headline is its team result; a competitive one keeps its winner line", () => {
    const nameOf = (id: string) => ({ a: "Amina", b: "Baraka" })[id] ?? id;
    expect(resultLine({ outcome: { team: { total: 24, max: 40 } } }, nameOf)).toBe("Team result: 24 out of 40");
    // Even if per-player copies ever arrived, the team result wins: no "Everyone tied".
    expect(resultLine({ rawScores: { a: 24, b: 24 }, outcome: { team: { total: 24, max: 40 } } }, nameOf)).toBe("Team result: 24 out of 40");
    expect(winnerLine({ a: 24, b: 24 }, nameOf)).toBe("Everyone tied");
    expect(resultLine({ rawScores: { a: 30, b: 10 } }, nameOf)).toBe("Amina wins");
  });
  it("the briefing, the participation line, the TV hint and the refusals speak of the team", () => {
    const b = briefingRules("spectrum", "");
    expect(b.objective).toMatch(/One team, one score/);
    expect(b.steps.join(" ")).toContain("Give a clue, not the target number");
    expect(b.steps.join(" ")).toMatch(/can't be changed/);
    expect(b.steps.join(" ")).toMatch(/out of 40/);
    expect(participationLine("spectrum", { done: 3, of: 4 }, { you: true })).toMatch(/3 of 4 rounds/);
    expect(TV_HINT["spectrum"]).toMatch(/One team/);
    for (const code of ["INVALID_CLUE", "NOT_CLUE_GIVER", "GIVER_CANNOT_GUESS", "NOT_A_GUESSER", "INVALID_GUESS", "STALE_ROUND", "WRONG_PHASE", "SAT_OUT"]) {
      expect(humanError(code)).not.toBe(code);
    }
    expect(humanError("INVALID_CLUE")).toContain("Give a clue, not the target number");
  });
  it("the library: an original cover, a co-op tag, and a team game (never an individual one)", () => {
    expect(COVERS["spectrum"]).toEqual({ accent: "mint", glyph: "dial" });
    const m = GAME_MANIFESTS.find((x) => x.id === "spectrum")!;
    expect(m.competition).toBe("cooperative");
    expect(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playStyle: "team" }).map((x) => x.id)).toContain("spectrum");
    expect(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playStyle: "solo" }).map((x) => x.id)).not.toContain("spectrum");
  });
});
