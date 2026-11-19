/**
 * H2 (handoff 7008903623): the rendering contract. Only the clue-giver's phone draws the target before the
 * reveal; the reveal draws it for everyone. Synthetic local fixtures for every role: the clue-giver, a guesser,
 * the host in a guessing seat, a player who sat out, a late joiner who only watches, and the TV/spectator view;
 * the roles rotating to the next round; and a defensive case where a stale or forged projection hands a
 * guesser a target (the phone must not draw it). The accessible instructions and the keyboard-operable scale
 * stay. The projection contract (who receives the target at all) is tests/h2-spectrum-target.test.ts.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MchezoSpectrum, SpectrumTv } from "./MchezoSpectrum.js";
import type { SpectrumView } from "../../ui/mchezo/lib/spectrum.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

const PLAYERS: PublicPlayer[] = [
  { id: "p1", displayName: "Keku", avatar: "🙂", isHost: true, isCohost: false, connected: true },
  { id: "p2", displayName: "Amina", avatar: "🙂", isHost: false, isCohost: false, connected: true },
  { id: "p3", displayName: "Baraka", avatar: "🙂", isHost: false, isCohost: false, connected: true },
  { id: "p4", displayName: "Juma", avatar: "🙂", isHost: false, isCohost: false, connected: true },
];
const PAIR = { id: "temp", left: "Freezing", right: "Boiling", meaning: "How hot something is" };
const R1 = 68, R2 = 83, R3 = 77; // each round's canary target
const shows = (html: string, n: number) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(html);

/** Round `roundNo` in `phase`, given by `giver`; earlier rounds already revealed. */
function state(roundNo: number, phase: "clue" | "guess" | "reveal", giver: string, me?: SpectrumView["me"]): SpectrumView {
  const targets = [R1, R2, R3];
  const revealed = targets.slice(0, phase === "reveal" ? roundNo : roundNo - 1).map((t, i) => ({ roundNo: i + 1, pair: PAIR, giver: i + 1 === roundNo ? giver : "p1", clue: "a warm bath", reason: "scored" as const, target: t, aggregate: t - 4, distance: 4, points: 10, guesses: 3 }));
  return {
    rulesVersion: 1, rounds: 4, roundNo, phase, total: 10 * (roundNo - 1), maxPoints: 40,
    order: PLAYERS.map((p) => ({ id: p.id, satOut: false })),
    current: phase === "reveal" ? null : { roundNo, pair: PAIR, giver, clue: phase === "guess" ? "a warm bath" : null, guessesIn: 1, guessesNeeded: 3 },
    revealed, end: null, ...(me ? { me } : {}),
  } as SpectrumView;
}
function phone(playerId: string, st: SpectrumView): string {
  const game = { id: "g1", gameId: "spectrum", status: "playing", players: PLAYERS.map((p) => p.id), phaseDeadlineAt: Date.now() + 30_000, abstained: false, state: st } as unknown as PlayerGame;
  return renderToStaticMarkup(<MchezoSpectrum game={game} players={PLAYERS} playerId={playerId} title="Spectrum" intent={() => true} />);
}
function tv(st: SpectrumView): string {
  const game = { id: "g1", gameId: "spectrum", status: "playing", players: PLAYERS.map((p) => p.id), phaseDeadlineAt: Date.now() + 30_000, state: st } as unknown as PublicGame;
  return renderToStaticMarkup(<SpectrumTv game={game} title="Spectrum" nameOf={(id) => PLAYERS.find((p) => p.id === id)?.displayName ?? "A player"} />);
}

describe("H2 rendering: round 2, Amina (p2) gives the clue; the target 83 is drawn on her phone only until the reveal", () => {
  for (const phase of ["clue", "guess"] as const) {
    it(`${phase} phase: the clue-giver sees the target; nobody else's screen draws it`, () => {
      const giver = phone("p2", state(2, phase, "p2", { role: "giver", satOut: false, target: R2 }));
      expect(shows(giver, R2), "giver").toBe(true);
      if (phase === "clue") expect(giver).toContain("Only you can see the target");
      const others: [string, string][] = [
        ["the host in a guessing seat", phone("p1", state(2, phase, "p2", { role: "guesser", satOut: false }))],
        ["a guesser", phone("p3", state(2, phase, "p2", { role: "guesser", satOut: false }))],
        ["a guesser whose guess is in", phone("p3", state(2, phase, "p2", { role: "guesser", satOut: false, ...(phase === "guess" ? { myGuess: 40 } : {}) }))],
        ["a player who sat out", phone("p4", state(2, phase, "p2", { role: "watching", satOut: true }))],
        ["a late joiner who only watches (no private view)", phone("p9", state(2, phase, "p2"))],
        ["the TV and spectators", tv(state(2, phase, "p2"))],
        // Defensive: a stale or forged projection handing a non-giver a target must not be drawn.
        ["a guesser handed a target by a stale projection", phone("p1", state(2, phase, "p2", { role: "guesser", satOut: false, target: R2 }))],
        ["a watcher handed a target by a stale projection", phone("p4", state(2, phase, "p2", { role: "watching", satOut: true, target: R2 }))],
      ];
      for (const [who, html] of others) {
        expect(shows(html, R2), who).toBe(false);
        expect(html, who).not.toContain("sp-target");
        // Round 1 was revealed: its target may be known, but the phone's play screens don't draw past rounds.
      }
    });
  }

  it("the guesser's screen keeps its accessible instructions and keyboard-operable scale", () => {
    const html = phone("p1", state(2, "guess", "p2", { role: "guesser", satOut: false }));
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-describedby="sp-guess-help"');
    expect(html).toContain('aria-valuetext="');
    expect(html).toMatch(/aria-label="Your guess\. [^"]*Freezing[^"]*Boiling/);
    expect(html).toContain('id="sp-guess-help"');
  });

  it("the reveal draws the target for everyone: each phone and the TV", () => {
    const reveal = state(2, "reveal", "p2");
    for (const [who, html] of [
      ["the clue-giver", phone("p2", { ...reveal, me: { role: "giver", satOut: false } })],
      ["the host", phone("p1", { ...reveal, me: { role: "guesser", satOut: false, myGuess: 40 } })],
      ["a player who sat out", phone("p4", { ...reveal, me: { role: "watching", satOut: true } })],
      ["the TV and spectators", tv(reveal)],
    ] as [string, string][]) {
      expect(shows(html, R2), who).toBe(true);
      expect(html, who).toContain(`Target ${R2}`);
    }
  });

  it("the roles rotate: in round 3 Baraka (p3) gives the clue; Amina, the last giver, now guesses and sees no new target", () => {
    const r3 = (who: string, me: SpectrumView["me"]) => phone(who, state(3, "guess", "p3", me));
    expect(shows(r3("p3", { role: "giver", satOut: false, target: R3 }), R3)).toBe(true);
    for (const [who, html] of [
      ["Amina, last round's giver", r3("p2", { role: "guesser", satOut: false })],
      ["the host", r3("p1", { role: "guesser", satOut: false })],
      ["the TV", tv(state(3, "guess", "p3"))],
    ] as [string, string][]) expect(shows(html, R3), who).toBe(false);
  });
});
