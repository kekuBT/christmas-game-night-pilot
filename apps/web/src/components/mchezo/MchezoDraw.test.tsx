/**
 * H3 (handoff 7020760499): Draw & Guess's play screens never depend on an entry animation to be seen.
 * Every screen fades in from opacity 0; held at its first frame (a suspended or throttled web view), a fading
 * screen stays invisible while the game clock above it (outside the screen) still shows, which is the reported
 * "nearly black drawer screen with the timer visible". The drawing, guessing and reveal screens carry
 * mz-dg-screen, which turns the entry animation off in every motion setting (D-H3-01). The browser check is
 * scripts/check-draw-board.mjs (the screen at opacity 1 and the board paper-bright with the animation held).
 * The drawer-only word and the guesser's board are unchanged.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MchezoDraw, type DrawView } from "./MchezoDraw.js";
import type { PlayerGame, PublicPlayer } from "../../types.js";

const PLAYERS: PublicPlayer[] = [
  { id: "p1", displayName: "Keku", avatar: "🙂", isHost: true, isCohost: false, connected: true },
  { id: "p2", displayName: "Amina", avatar: "🙂", isHost: false, isCohost: false, connected: true },
  { id: "p3", displayName: "Baraka", avatar: "🙂", isHost: false, isCohost: false, connected: true },
];
const STROKE = { s: 0, c: 0, w: 1, p: [100, 100, 900, 900] };
function render(playerId: string, st: DrawView): string {
  const game = { id: "g1", gameId: "draw-guess", status: "playing", players: PLAYERS.map((p) => p.id), deadlineAt: Date.now() + 60_000, state: st } as unknown as PlayerGame;
  return renderToStaticMarkup(<MchezoDraw game={game} players={PLAYERS} playerId={playerId} title="Draw & Guess" intent={() => true} />);
}
const base: DrawView = { turn: 1, turnCount: 3, phase: "draw", drawerId: "p2", pieces: [STROKE], letters: [4], guessers: 2, correct: [] };

describe("H3: the Draw & Guess play screens are visible from their first frame", () => {
  const screens: [string, string, string][] = [
    ["the drawer", "mz-dg-draw", render("p2", { ...base, amDrawing: true, myWord: "kite", canSwap: true })],
    ["a guesser", "mz-dg-guess", render("p1", { ...base, myGuesses: 0 })],
    ["the reveal", "mz-dg-reveal", render("p1", { ...base, phase: "reveal", result: { drawerId: "p2", word: "kite", correct: 1, points: { p1: 100, p2: 50 } } })],
  ];
  for (const [who, testId, html] of screens) {
    it(`${who}: the screen carries mz-dg-screen, and its board is drawn with the paper fill and the drawing`, () => {
      expect(html).toContain(`<main class="mz-screen mz-dg-screen"`);
      expect(html).toContain(`data-testid="${testId}"`);
      expect(html).toMatch(/<svg class="mz-dg-board[^"]*" viewBox="0 0 1000 1000"/);
      expect(html).toContain('fill="#FFFDF7"');
      expect(html).toContain('data-sig="1:2"');
    });
  }
  it("only the drawer's screen shows the word; the guesser's shows its shape", () => {
    const [, , drawer] = screens[0]!;
    const [, , guesser] = screens[1]!;
    expect(drawer).toContain("kite");
    expect(guesser).not.toContain("kite");
    expect(guesser).toContain('data-testid="mz-dg-letters"');
  });
  it("the stylesheet turns the entry animation off for these screens in every motion setting", () => {
    const css = readFileSync(new URL("../../ui/mchezo/styles/stage5.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.mz-screen\.mz-dg-screen, \[data-mz-motion="reduced"\] \.mz-screen\.mz-dg-screen \{ animation: none; \}/);
    // The general rule this overrides: every other screen still fades in from opacity 0.
    const base = readFileSync(new URL("../../ui/mchezo/styles/mchezo.css", import.meta.url), "utf8");
    expect(base).toMatch(/\.mz-screen \{[^}]*animation: mz-enter/);
  });
});
