/**
 * Stage 3 live QA: results lines and standings.
 *
 * S3-RES-04: "You came 2nd of 2 — Solid middle of the pack" (a two-player
 * game has no middle). Every line is audited here against the condition it
 * claims: ranks, player count, ties, zero scores, sit-outs and margins,
 * over every score combination of a small grid and seeded larger rooms.
 *
 * S3-RES-01: a player who sat out (or scored 0) was missing from the other
 * phones' standings. The standings view lists a small field in full and
 * lets a larger one expand to every player.
 */
import { describe, expect, it } from "vitest";
import { QUIPS, closeMargin, competitionRanks, resultsStory } from "../apps/web/src/ui/mchezo/lib/celebrate.js";
import { FULL_STANDINGS_MAX, rankStandings, standingsView } from "../apps/web/src/ui/mchezo/lib/standings.js";
import type { Player } from "../apps/web/src/ui/mchezo/types.js";

type Pool = keyof typeof QUIPS;
const ID = "abcdefghij".split("");
const nameOf = (id: string) => `P-${id}`;
const lineRe = (t: string) => new RegExp(`^${t.replace(/[.*+?^()|[\]\\]/g, "\\$&").replace(/\{w\}|\{gap\}|\{n\}/g, ".+")}$`);
const ALL: { pool: Pool; text: string; re: RegExp }[] = (Object.keys(QUIPS) as Pool[]).flatMap((pool) => QUIPS[pool].map((text) => ({ pool, text, re: lineRe(text) })));
const poolOf = (line: string): Pool[] => ALL.filter((x) => x.re.test(line)).map((x) => x.pool);

describe("S3-RES-04: 2nd of 2", () => {
  it("is never 'middle of the pack' or 'not first, not last'", () => {
    for (let g = 0; g < 200; g++) {
      const s = resultsStory({ gameInstanceId: `game-${g}`, title: "Trivia Showdown", official: g % 2 === 0, nameOf, scores: { a: 1200, b: 600 }, youId: "b" });
      expect(s.you?.label).toBe("You came 2nd of 2");
      expect(QUIPS.youRunnerUp).toContain(s.you?.line);
      expect(s.you?.line).not.toMatch(/middle|not first, not last/i);
    }
  });
  it("2nd of 3 can still be 'middle of the pack'; 2nd of 10 and 9th of 10 cannot", () => {
    const ten = Object.fromEntries(ID.map((id, i) => [id, 1000 - i * 50]));
    for (let g = 0; g < 100; g++) {
      const k = { gameInstanceId: `g${g}`, title: "T", official: true, nameOf };
      expect([...QUIPS.youMidPack, ...QUIPS.youBetween]).toContain(resultsStory({ ...k, scores: { a: 300, b: 200, c: 100 }, youId: "b" }).you?.line);
      expect(resultsStory({ ...k, scores: ten, youId: "b" }).you?.line).toBe(QUIPS.youBetween[0]);
      expect(resultsStory({ ...k, scores: ten, youId: "i" }).you?.line).toBe(QUIPS.youBetween[0]);
      expect([...QUIPS.youMidPack, ...QUIPS.youBetween]).toContain(resultsStory({ ...k, scores: ten, youId: "e" }).you?.line);
    }
  });
});

/** Check one story's lines against the facts they claim. */
function audit(scores: Record<string, number>, official: boolean, gid: string, youId: string, extra: { satOut?: boolean; done?: number } = {}): void {
  const s = resultsStory({ gameInstanceId: gid, title: "T", official, nameOf, scores, youId, youSatOut: extra.satOut, yourParticipation: extra.done === undefined ? undefined : { done: extra.done, of: 10 } });
  const { order, ranks } = competitionRanks(scores, nameOf);
  const n = order.length;
  const top = scores[order[0]!]!;
  const winners = order.filter((id) => ranks[id] === 1);
  const second = order.find((id) => ranks[id]! > 1);
  const s2 = second ? scores[second]! : 0;
  const gap = top - s2;
  const allZero = order.every((id) => scores[id] === 0);
  const allSame = order.every((id) => scores[id] === top);
  const ctx = JSON.stringify({ scores, official, youId, extra, quip: s.quip, line: s.you?.line });
  // Whole-result line.
  if (n > 1) {
    const pools = poolOf(s.quip);
    expect(pools.length, ctx).toBeGreaterThan(0);
    const ok = pools.some((p) => {
      switch (p) {
        case "practice": return !official;
        case "noScore": return official && allZero;
        case "everyoneTied": return official && allSame && !allZero;
        case "tieTwo": return official && winners.length === 2 && !allSame;
        case "tie": return official && winners.length >= 2 && !allSame;
        case "shutout": return official && winners.length === 1 && s2 === 0;
        case "close": return official && winners.length === 1 && s2 > 0 && gap <= closeMargin(top);
        case "runaway": return official && winners.length === 1 && s2 > 0 && gap > closeMargin(top) && top >= 2 * s2;
        case "headToHead": return official && n === 2 && s2 > 0 && gap > closeMargin(top) && top < 2 * s2 && gap <= top / 4;
        case "bigRoom": return official && n >= 8 && winners.length === 1 && s2 > 0;
        case "win": return official && winners.length === 1 && s2 > 0;
        default: return false;
      }
    });
    expect(ok, `whole-result line out of place: ${ctx}`).toBe(true);
  }
  // Your line.
  const line = s.you?.line ?? "";
  if (n <= 1) { expect(line === "" || extra.satOut || extra.done === 0, ctx).toBeTruthy(); return; }
  const rank = ranks[youId]!;
  const tied = order.filter((id) => ranks[id] === rank).length > 1;
  const score = scores[youId]!;
  const lastRank = Math.max(...Object.values(ranks));
  const frac = (rank - 1) / (n - 1);
  const pools = poolOf(line);
  expect(pools.length, ctx).toBeGreaterThan(0);
  const ok = pools.some((p) => {
    switch (p) {
      case "youSatOut": return !!extra.satOut;
      // Stage 10.1 (D-S101-06): never beside "You won this one" (first place in a game somebody won).
      case "youMissed": return extra.done === 0 && !extra.satOut && !(rank === 1 && score > 0);
      case "youZero": return score === 0;
      case "youWon": return rank === 1 && !tied && score > 0;
      case "youTiedFirst": return rank === 1 && tied && score > 0;
      case "youRunnerUp": return n === 2 && rank === 2 && !tied && score > 0;
      case "youLast": return n >= 3 && rank === lastRank && rank > 1 && score > 0;
      case "youMidPack": return n >= 3 && rank > 1 && rank < lastRank && frac >= 0.25 && frac <= 0.75 && score > 0;
      case "youBetween": return n >= 3 && rank > 1 && rank < lastRank && score > 0;
      default: return false;
    }
  });
  expect(ok, `your line out of place: ${ctx}`).toBe(true);
}

describe("every line only where its condition holds", () => {
  const VALUES = [0, 50, 100, 105, 200, 400];
  it("all score combinations for 1 to 5 players, official and practice, every seat", () => {
    let stories = 0;
    for (let n = 1; n <= 5; n++) {
      const total = VALUES.length ** n;
      for (let c = 0; c < total; c++) {
        const scores: Record<string, number> = {};
        let x = c;
        for (let i = 0; i < n; i++) { scores[ID[i]!] = VALUES[x % VALUES.length]!; x = Math.floor(x / VALUES.length); }
        for (const official of [true, false]) {
          for (const you of Object.keys(scores)) { audit(scores, official, `game-${c}`, you); stories++; }
        }
      }
    }
    expect(stories).toBeGreaterThan(80_000);
  });
  it("seeded rooms of 6 to 10 players with ties", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let t = 0; t < 3000; t++) {
      const n = 6 + Math.floor(rnd() * 5);
      const scores = Object.fromEntries(ID.slice(0, n).map((id) => [id, Math.floor(rnd() * 6) * 100]));
      for (const you of Object.keys(scores)) audit(scores, rnd() < 0.7, `room-${t}`, you);
    }
  });
  it("sitting out and missing every question take precedence, whatever the score", () => {
    for (const g of ["g1", "g2", "g3"]) {
      audit({ a: 300, b: 0, c: 100 }, true, g, "b", { satOut: true });
      audit({ a: 300, b: 0, c: 100 }, true, g, "b", { done: 0 });
      audit({ a: 0, b: 0 }, true, g, "b", { done: 0 });
      // Stage 10.1: a first place with nothing completed (a Jebena Rush survivor) is a win, never "missed".
      audit({ a: 300, b: 0 }, true, g, "a", { done: 0 });
      audit({ a: 300, b: 300, c: 0 }, false, g, "b", { done: 0 });
    }
  });
  it("nobody scored: your line says no points, not 'you share the top spot'", () => {
    for (let g = 0; g < 50; g++) {
      const s = resultsStory({ gameInstanceId: `z${g}`, title: "T", official: true, nameOf, scores: { a: 0, b: 0, c: 0 }, youId: "a" });
      expect(QUIPS.youZero).toContain(s.you?.line);
      expect(s.celebrate).toBe(false);
    }
  });
  it("'twice the bragging' only for a two-way tie", () => {
    for (let g = 0; g < 200; g++) {
      const three = resultsStory({ gameInstanceId: `t${g}`, title: "T", official: true, nameOf, scores: { a: 200, b: 200, c: 200, d: 100 } });
      expect(three.quip).not.toMatch(/twice/i);
    }
  });
  it("every one of the lines can appear", () => {
    const seen = new Set<string>();
    const cases: { scores: Record<string, number>; official: boolean; casual?: boolean; you: string; satOut?: boolean; done?: number }[] = [
      { scores: { a: 300, b: 200, c: 100 }, official: true, you: "a" },
      { scores: { a: 300, b: 200, c: 100 }, official: false, casual: true, you: "a" }, // Stage 7.2
      { scores: { a: 300, b: 200, c: 100 }, official: true, you: "b" },
      { scores: { a: 300, b: 200, c: 100 }, official: true, you: "c" },
      { scores: { a: 300, b: 200, c: 100 }, official: false, you: "a" },
      { scores: { a: 1000, b: 800 }, official: true, you: "b" },
      { scores: { a: 1000, b: 950 }, official: true, you: "a" },
      { scores: { a: 1000, b: 300 }, official: true, you: "a" },
      { scores: { a: 1000, b: 0 }, official: true, you: "b" },
      { scores: { a: 200, b: 200 }, official: true, you: "a" },
      { scores: { a: 200, b: 200, c: 100 }, official: true, you: "c" },
      { scores: { a: 200, b: 200, c: 200, d: 100 }, official: true, you: "a" },
      { scores: { a: 200, b: 200, c: 200 }, official: true, you: "a" },
      { scores: { a: 0, b: 0 }, official: true, you: "a" },
      { scores: { a: 300, b: 0, c: 100 }, official: true, you: "b", satOut: true },
      { scores: { a: 300, b: 0, c: 100 }, official: true, you: "b", done: 0 },
      { scores: Object.fromEntries(ID.map((id, i) => [id, 1000 - i * 60])), official: true, you: "e" },
      { scores: Object.fromEntries(ID.map((id, i) => [id, 1000 - i * 90 - (i ? 60 : 0)])), official: true, you: "e" },
    ];
    for (let g = 0; g < 400; g++) {
      for (const c of cases) {
        const s = resultsStory({ gameInstanceId: `r${g}`, title: "T", official: c.official, casual: c.casual, nameOf, scores: c.scores, youId: c.you, youSatOut: c.satOut, yourParticipation: c.done === undefined ? undefined : { done: c.done, of: 10 } });
        for (const x of ALL) { if (x.re.test(s.quip) || x.re.test(s.you?.line ?? "")) seen.add(x.text); }
      }
    }
    expect(ALL.length).toBe(30); // Stage 7.2 added the casual line (the limit is 30)
    expect(ALL.filter((x) => !seen.has(x.text)).map((x) => x.text)).toEqual([]);
  });
  it("no line claims a streak, a comeback or a record nobody recorded", () => {
    for (const x of ALL) expect(x.text, x.text).not.toMatch(/\bagain\b|streak|comeback|record|best ever|every time|always/i);
  });
});

describe("S3-RES-01: one complete standings list", () => {
  const people = (n: number, long = false): Player[] => ID.slice(0, n).map((id, i) => ({ id, name: long ? `Bartholomew-Christabel ${id.toUpperCase()} Wanjiku-Otieno` : `P${i}`, connection: i === 2 ? "disconnected" : "connected" }) as Player);
  const rank = (scores: Record<string, number>, ps: Player[]) => rankStandings(Object.entries(scores).map(([playerId, score]) => ({ playerId, score })), ps);

  it("2 players: both listed on both phones", () => {
    const r = rank({ a: 1200, b: 600 }, people(2));
    for (const you of ["a", "b"]) expect(standingsView(r, you, 2, false)).toMatchObject({ collapsible: false, hidden: 0 });
    expect(standingsView(r, "a", 2, false).rows.map((x) => x.playerId)).toEqual(["a", "b"]);
  });
  it("3 players, one sat out (0): every phone lists all three, in the same order", () => {
    const r = rank({ a: 1200, b: 720, c: 0 }, people(3));
    const lists = ["a", "b", "c"].map((you) => standingsView(r, you, 2, false).rows.map((x) => `${x.rank}:${x.playerId}:${x.score}`));
    expect(lists[0]).toEqual(["1:a:1200", "2:b:720", "3:c:0"]);
    expect(lists[1]).toEqual(lists[0]);
    expect(lists[2]).toEqual(lists[0]);
  });
  it("3-way tie: all three share 1st on every phone", () => {
    const r = rank({ a: 1200, b: 1200, c: 1200 }, people(3));
    expect(standingsView(r, "b", 2, false).rows.map((x) => x.rank)).toEqual([1, 1, 1]);
  });
  it("6 players with several shared ranks: the preview never splits a rank, and Show all lists everyone", () => {
    const r = rank({ a: 500, b: 400, c: 400, d: 400, e: 100, f: 100 }, people(6));
    const preview = standingsView(r, "f", 2, false);
    expect(preview.collapsible).toBe(true);
    expect(preview.rows.map((x) => x.playerId)).toEqual(["a", "b", "c", "d", "f"]);
    expect(preview.hidden).toBe(1);
    const all = standingsView(r, "f", 2, true);
    expect(all.rows.map((x) => `${x.rank}${x.playerId}`)).toEqual(["1a", "2b", "2c", "2d", "5e", "5f"]);
  });
  it("10 players with long names and one away: a preview, then all 10 in rank order", () => {
    const ps = people(10, true);
    const r = rank(Object.fromEntries(ID.map((id, i) => [id, 1000 - i * 100])), ps);
    const preview = standingsView(r, "g", 2, false);
    expect(preview.rows.map((x) => x.playerId)).toEqual(["a", "b", "g"]);
    expect(preview.hidden).toBe(7);
    const all = standingsView(r, "g", 2, true);
    expect(all.rows).toHaveLength(10);
    expect(all.rows.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(all.rows.find((x) => x.playerId === "c")?.player.connection).toBe("disconnected");
  });
  it(`a field of up to ${FULL_STANDINGS_MAX} is always listed in full`, () => {
    for (let n = 1; n <= FULL_STANDINGS_MAX; n++) {
      const r = rank(Object.fromEntries(ID.slice(0, n).map((id, i) => [id, 100 * (n - i)])), people(n));
      for (const you of ID.slice(0, n)) expect(standingsView(r, you, 2, false).rows).toHaveLength(n);
    }
  });
});

describe("S3-WCN-01: the Word Connections breakdown matches the server's scorer", () => {
  it("for every possible result (0–4 groups, 0–4 mistakes)", async () => {
    const { connectionsScore } = await import("../src/games/connections.js");
    const { connectionsBreakdown } = await import("../apps/web/src/ui/mchezo/lib/connectionsScore.js");
    for (let solved = 0; solved <= 4; solved++) {
      for (let mistakes = 0; mistakes <= 4; mistakes++) {
        const server = connectionsScore({ solved: ["a", "b", "c", "d"].slice(0, solved), mistakes, guessed: [] } as never);
        const b = connectionsBreakdown(solved, mistakes);
        expect(b.total, `${solved} groups, ${mistakes} mistakes`).toBe(server);
        expect(b.line.endsWith(`= ${server}`)).toBe(true);
      }
    }
    // The audit's two observed results.
    expect(connectionsBreakdown(4, 1).line).toBe("4 groups × 100 = 400, +20 for one mistake = 420");
    expect(connectionsBreakdown(4, 3).line).toBe("4 groups × 100 = 400, no bonus (3 mistakes) = 400");
  });
});
