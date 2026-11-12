// Stage 10.2 (docs/stage10/stage102.md; D-S102-01..05): one line for a genuine moment in a finished Jebena Rush or
// Spectrum result. Every trigger and its guards, priority, missing and partial data, the zero-answer winner,
// Spectrum's team-only rule, determinism; and the real modules' finished views (scores unchanged) fed to the selector.
import { describe, expect, it } from "vitest";
import { JEBENA_LINES, jebenaMoment, SPECTRUM_LINES, spectrumMoment, type JebenaFinished, type SpectrumFinished } from "../apps/web/src/ui/mchezo/lib/moments.js";
import { JEBENA_CATEGORIES } from "../src/games/modules/packs/jebena-banks.js";
import { jebenaModule, jebenaPoints, jebenaStandings, type JebenaState } from "../src/games/modules/jebena.js";
import { spectrumModule, spectrumTeamResult, SPECTRUM_ROUNDS, SPECTRUM_PHASE_MS, type SpectrumState } from "../src/games/modules/spectrum.js";

type Row = NonNullable<JebenaFinished["standings"]>[number];
const row = (id: string, place: number, hearts: number, out = false, satOut = false): Row => ({ id, place, hearts, out, satOut });
const jr = (end: string | null, startHearts: number, standings: Row[]): JebenaFinished => ({ end, startHearts, standings });

describe("Jebena Rush: a line for a sole winner (D-S102-02)", () => {
  it("J1: one cup left, with an opponent knocked out", () => {
    expect(jebenaMoment(jr("last-standing", 3, [row("w", 1, 1), row("o", 2, 0, true)]))).toBe(JEBENA_LINES.lastCup);
    expect(JEBENA_LINES.lastCup).toBe("One cup left. Still enough for the win.");
  });
  it("J2: every starting cup still whole, at 3, 5 and 7 cups", () => {
    for (const n of [3, 5, 7]) {
      expect(jebenaMoment(jr("last-standing", n, [row("w", 1, n), row("o", 2, 0, true)]))).toBe(`All ${n} cups still whole. Not a single crack.`);
    }
  });
  it("an ordinary win (cups lost, more than one left) gets no line", () => {
    expect(jebenaMoment(jr("last-standing", 3, [row("w", 1, 2), row("o", 2, 0, true)]))).toBeNull();
    expect(jebenaMoment(jr("last-standing", 7, [row("w", 1, 4), row("o", 2, 0, true)]))).toBeNull();
  });
  it("a shared first place gets no line", () => {
    expect(jebenaMoment(jr("banks-exhausted", 3, [row("a", 1, 1), row("b", 1, 1), row("c", 3, 0, true)]))).toBeNull();
    expect(jebenaMoment(jr("banks-exhausted", 3, [row("a", 1, 3), row("b", 1, 3), row("c", 3, 0, true)]))).toBeNull();
  });
  it("a game the room ended (match limit, abort: end null) gets no line, even with the facts", () => {
    expect(jebenaMoment(jr(null, 3, [row("w", 1, 1), row("o", 2, 0, true)]))).toBeNull();
    expect(jebenaMoment(jr(null, 3, [row("w", 1, 3), row("o", 2, 0, true)]))).toBeNull();
  });
  it("a win only by others leaving gets no line (never a comment on absence)", () => {
    expect(jebenaMoment(jr("last-standing", 3, [row("w", 1, 3), row("o", 2, 0, true, true)]))).toBeNull();
    expect(jebenaMoment(jr("last-standing", 3, [row("w", 1, 1), row("o", 2, 0, true, true), row("p", 2, 0, true, true)]))).toBeNull();
    // One left, one knocked out: the line is about the knockout, and stands.
    expect(jebenaMoment(jr("last-standing", 3, [row("w", 1, 1), row("o", 2, 0, true), row("p", 3, 0, true, true)]))).toBe(JEBENA_LINES.lastCup);
  });
  it("cups ran out of categories (banks-exhausted): a sole winner still gets a line only with a knockout", () => {
    expect(jebenaMoment(jr("banks-exhausted", 3, [row("w", 1, 3), row("o", 2, 2), row("p", 3, 0, true)]))).toBe(JEBENA_LINES.allCups(3));
    expect(jebenaMoment(jr("banks-exhausted", 3, [row("w", 1, 3), row("o", 2, 2)]))).toBeNull(); // nobody knocked out
  });
  it("missing or broken data gets no line", () => {
    expect(jebenaMoment(undefined)).toBeNull();
    expect(jebenaMoment(null)).toBeNull();
    expect(jebenaMoment({})).toBeNull();
    expect(jebenaMoment({ end: "last-standing", standings: [row("w", 1, 1), row("o", 2, 0, true)] })).toBeNull(); // no startHearts
    expect(jebenaMoment(jr("last-standing", 3, []))).toBeNull();
    expect(jebenaMoment(jr("last-standing", 3, [row("w", 1, 1)]))).toBeNull(); // one row: nobody to outlast
    expect(jebenaMoment(jr("last-standing", 3, [row("w", 1, 0, true), row("o", 2, 0, true)]))).toBeNull(); // the "winner" is out
    expect(jebenaMoment(jr("last-standing", 3, [row("w", 1, 4), row("o", 2, 0, true)]))).toBeNull(); // more cups than it started with
    expect(jebenaMoment(jr("finished", 3, [row("w", 1, 1), row("o", 2, 0, true)]))).toBeNull(); // an unknown ending
  });
  it("is deterministic: the order of the rows and repeated calls don't change it; nobody is named", () => {
    const rows = [row("w", 1, 1), row("o", 2, 0, true), row("p", 3, 0, true)];
    const a = jebenaMoment(jr("last-standing", 3, rows));
    expect(jebenaMoment(jr("last-standing", 3, [...rows].reverse()))).toBe(a);
    expect(jebenaMoment(jr("last-standing", 3, rows))).toBe(a);
    for (const line of [JEBENA_LINES.lastCup, JEBENA_LINES.allCups(5)]) expect(line).not.toMatch(/\b(w|o|p)\b|you|answer|fast|streak|record/i);
  });
});

type Rd = NonNullable<SpectrumFinished["rounds"]>[number];
const rd = (roundNo: number, distance: number | null, points: number, reason = "scored"): Rd => ({ roundNo, reason, distance, points });
const sp = (rounds: Rd[], over: Partial<SpectrumFinished> = {}): SpectrumFinished => ({ end: "completed", roundsPlanned: 4, rounds, total: rounds.reduce((t, r) => t + r.points, 0), max: 40, ...over });
const TEAM_ONLY = /\bp\d\b|winner|\bwon\b|\bwin\b|place|first|cup|you|your|guess by|'s guess/i;

describe("Spectrum: team lines for a completed match (D-S102-03)", () => {
  it("S1: 40 out of 40 (every round scored)", () => {
    expect(spectrumMoment(sp([rd(1, 3, 10), rd(2, 0, 10), rd(3, 5, 10), rd(4, 1, 10)]))).toBe(SPECTRUM_LINES.perfect(40));
    expect(SPECTRUM_LINES.perfect(40)).toBe("40 out of 40. The whole team was on one wavelength.");
  });
  it("S1 comes before S2: four exact rounds read as the perfect match", () => {
    expect(spectrumMoment(sp([rd(1, 0, 10), rd(2, 0, 10), rd(3, 0, 10), rd(4, 0, 10)]))).toBe(SPECTRUM_LINES.perfect(40));
  });
  it("S2: one, two and three exact rounds, named by round", () => {
    expect(spectrumMoment(sp([rd(1, 8, 7), rd(2, 30, 0), rd(3, 0, 10), rd(4, 12, 4)]))).toBe("Round 3 landed exactly on the target.");
    expect(spectrumMoment(sp([rd(1, 0, 10), rd(2, 30, 0), rd(3, 0, 10), rd(4, 12, 4)]))).toBe("Rounds 1 and 3 both landed exactly on the target.");
    expect(spectrumMoment(sp([rd(1, 0, 10), rd(2, 0, 10), rd(3, null, 0, "no-clue"), rd(4, 0, 10)]))).toBe("Rounds 1, 2 and 4 all landed exactly on the target.");
  });
  it("rounds out of order still read in order (deterministic)", () => {
    expect(spectrumMoment(sp([rd(4, 0, 10), rd(2, 9, 7), rd(1, 0, 10), rd(3, 40, 0)]))).toBe("Rounds 1 and 4 both landed exactly on the target.");
  });
  it("an ordinary team score gets no line", () => {
    expect(spectrumMoment(sp([rd(1, 3, 10), rd(2, 9, 7), rd(3, 18, 4), rd(4, 30, 0)]))).toBeNull();
  });
  it("an early ending (too few players) gets no line, even with an exact round", () => {
    expect(spectrumMoment(sp([rd(1, 0, 10)], { end: "too-few-players" }))).toBeNull();
    expect(spectrumMoment(sp([rd(1, 0, 10), rd(2, 0, 10), rd(3, 0, 10), rd(4, 0, 10)], { end: "too-few-players" }))).toBeNull();
  });
  it("a room ending, fewer revealed rounds than planned, no clue or no guesses: no line", () => {
    expect(spectrumMoment(sp([rd(1, 0, 10), rd(2, 0, 10), rd(3, 0, 10), rd(4, 0, 10)], { end: null }))).toBeNull();
    expect(spectrumMoment(sp([rd(1, 0, 10), rd(2, 0, 10), rd(3, 0, 10)]))).toBeNull(); // 3 of 4 revealed
    expect(spectrumMoment(sp([rd(1, null, 0, "no-clue"), rd(2, null, 0, "no-guesses"), rd(3, null, 0, "giver-left"), rd(4, 20, 4)]))).toBeNull();
    expect(spectrumMoment(sp([rd(1, 0, 0, "no-guesses"), rd(2, 9, 7), rd(3, 9, 7), rd(4, 9, 7)]))).toBeNull(); // distance 0 counts only for a scored round
  });
  it("missing data gets no line", () => {
    expect(spectrumMoment(undefined)).toBeNull();
    expect(spectrumMoment(null)).toBeNull();
    expect(spectrumMoment({})).toBeNull();
    expect(spectrumMoment({ end: "completed" })).toBeNull();
    expect(spectrumMoment({ end: "completed", roundsPlanned: 0, rounds: [] })).toBeNull();
  });
  it("team words only: no name, winner, place, Cup or anyone's own guess", () => {
    for (const line of [SPECTRUM_LINES.perfect(40), SPECTRUM_LINES.exact([2]), SPECTRUM_LINES.exact([1, 3]), SPECTRUM_LINES.exact([1, 2, 4])]) {
      expect(line).not.toMatch(TEAM_ONLY);
    }
  });
});

describe("the real modules' finished views (scores unchanged)", () => {
  // Jebena Rush, as tests/stage91-jebena-endings.test.ts drives it.
  const jctx = (s: JebenaState, now = 1) => ({ now, players: s.order, active: s.order, scale: 1 });
  const timeout = (s: JebenaState) => jebenaModule.expirePhase(s, jctx(s));
  const fresh = (s: JebenaState) => JEBENA_CATEGORIES.find((c) => c.id === s.category)!.answers.find((a) => !(s.used[s.category] ?? []).includes(a.id))!.name;
  const answer = (s: JebenaState) => jebenaModule.intent(s, s.turn!.player, "jebena-answer", { turn: s.turn!.n, text: fresh(s) }, jctx(s));
  const viewOf = (s: JebenaState, who: string) => jebenaModule.playerView!(s, who, jctx(s)) as JebenaFinished;

  it("Jebena, timeouts only: the second holder survives on one cup with no answer: J1, the zero-answer winner, on every view", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 4, settings: { hearts: 3 } });
    for (let i = 0; i < 20 && s.end === null; i++) timeout(s);
    const st = jebenaStandings(s);
    const w = st.find((r) => r.place === 1)!;
    expect([s.end, w.hearts, w.answers]).toEqual(["last-standing", 1, 0]);
    expect(jebenaPoints(s)[w.id]).toBe(100 + 10); // unchanged: 100 per player outlasted, 10 per whole cup
    for (const who of ["a", "b"]) expect(jebenaMoment(viewOf(s, who))).toBe(JEBENA_LINES.lastCup);
    expect(jebenaMoment(jebenaModule.publicView(s, jctx(s)) as JebenaFinished)).toBe(JEBENA_LINES.lastCup); // the TV's view
  });

  it("Jebena, the first holder answers every turn and keeps all 3 cups: J2", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 9, settings: { hearts: 3 } });
    const keeper = s.turn!.player;
    for (let i = 0; i < 20 && s.end === null; i++) {
      if (s.turn!.player === keeper) expect(answer(s)).toMatchObject({ ok: true, result: { verdict: "accepted" } });
      else timeout(s);
    }
    expect(s.end).toBe("last-standing");
    expect(jebenaPoints(s)[keeper]).toBe(100 + 3 * 10);
    expect(jebenaMoment(viewOf(s, keeper))).toBe(JEBENA_LINES.allCups(3));
  });

  it("Jebena, the only other player leaves: the keeper won by absence, so no line", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 9, settings: { hearts: 3 } });
    const leaver = s.order.find((p) => p !== s.turn!.player)!;
    jebenaModule.abstain!(s, leaver, jctx(s));
    expect(s.end).toBe("last-standing");
    expect(jebenaMoment(jebenaModule.publicView(s, jctx(s)) as JebenaFinished)).toBeNull();
  });

  // Spectrum, as tests/stage92-spectrum.test.ts drives it.
  const T0 = 1_800_000_000_000;
  const sctx = (s: SpectrumState, now: number) => ({ now, players: s.order, active: s.order.filter((p) => s.satOut[p] === undefined), scale: 1 });
  const cur = (s: SpectrumState) => s.rounds[s.round]!;
  const dueAt = (s: SpectrumState) => (s.phaseStartedAt ?? T0) + SPECTRUM_PHASE_MS[s.phase as "clue" | "guess" | "reveal"];
  function playRound(s: SpectrumState, t: number, off: number): number {
    spectrumModule.intent(s, cur(s).giver!, "spectrum-clue", { round: s.round + 1, text: "a warm bath" }, sctx(s, t));
    const target = cur(s).target;
    for (const g of [...cur(s).required]) spectrumModule.intent(s, g, "spectrum-guess", { round: s.round + 1, value: Math.min(100, target + off) }, sctx(s, t + 1));
    if (s.phase === "guess") spectrumModule.expirePhase(s, sctx(s, dueAt(s)));
    const end = dueAt(s);
    spectrumModule.expirePhase(s, sctx(s, end));
    return end;
  }

  it("Spectrum, every guess on the target: 40 of 40, S1 on every view", () => {
    const s = spectrumModule.init({ players: ["p0", "p1", "p2"], seed: 21 });
    let t = T0 + 1000;
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) t = playRound(s, t + 1000, 0);
    const team = spectrumTeamResult(s);
    expect([team.end, team.total, team.max]).toEqual(["completed", 40, 40]);
    expect(spectrumMoment(team)).toBe(SPECTRUM_LINES.perfect(40));
  });

  it("Spectrum, round 2 exactly on target, the rest 30 off: S2 names round 2", () => {
    const s = spectrumModule.init({ players: ["p0", "p1", "p2"], seed: 22 });
    let t = T0 + 1000;
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) t = playRound(s, t + 1000, r === 1 ? 0 : 30);
    const team = spectrumTeamResult(s);
    expect([team.end, team.total]).toEqual(["completed", 10]); // 30 off scores nothing: unchanged scoring
    expect(spectrumMoment(team)).toBe("Round 2 landed exactly on the target.");
  });

  it("Spectrum, round 1 exactly on target, then two players leave: an early ending, no line", () => {
    const s = spectrumModule.init({ players: ["p0", "p1", "p2"], seed: 23 });
    const t = playRound(s, T0 + 1000, 0);
    const leaving = s.order.filter((p) => p !== cur(s).giver);
    spectrumModule.abstain!(s, leaving[0]!, sctx(s, t + 1));
    spectrumModule.abstain!(s, leaving[1]!, sctx(s, t + 2));
    const team = spectrumTeamResult(s);
    expect([team.end, team.total]).toEqual(["too-few-players", 10]);
    expect(spectrumMoment(team)).toBeNull();
  });
});
