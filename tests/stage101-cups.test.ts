/**
 * Stage 10.1 (docs/stage10/stage101.md): Jebena Rush's cini cups and truthful
 * result feedback. Pure: no React. The rendered cups and their breaks in real
 * browsers are covered by scripts/check-jebena-rush.mjs.
 */
import { describe, expect, it } from "vitest";
import { CupMemory, cupSlots, cupsCount, cupsLabel, isLiveBreak, lastLossAt, LIVE_BREAK_MS } from "../apps/web/src/ui/mchezo/lib/cups.js";
import { lastPlayLine } from "../apps/web/src/ui/mchezo/lib/jebena.js";
import { briefingRules } from "../apps/web/src/ui/mchezo/lib/briefing.js";
import { humanError } from "../apps/web/src/ui/mchezo/lib/errors.js";
import { QUIPS, resultsStory } from "../apps/web/src/ui/mchezo/lib/celebrate.js";
import { jebenaModule, jebenaPoints, jebenaStandings, type JebenaState } from "../src/games/modules/jebena.js";
import { validateGameSettings } from "../src/games/settings.js";
import { GAME_MANIFESTS } from "../src/games/manifest.js";
import { getGame } from "../src/games/registry.js";

describe("cups: whole ones first, broken ones after, each in its slot; the number in words", () => {
  it("3, 5 and 7 cups, from full to none", () => {
    for (const of of [3, 5, 7]) {
      for (let n = of; n >= 0; n--) {
        const slots = cupSlots(n, of);
        expect(slots).toHaveLength(of);
        expect(slots.filter((s) => s === "whole")).toHaveLength(n);
        // Broken cups stay in the slots they broke in: the right-hand end.
        expect(slots.indexOf("broken") === -1 || slots.slice(slots.indexOf("broken")).every((s) => s === "broken")).toBe(true);
      }
    }
  });
  it("never more cups than started, never fewer than none", () => {
    expect(cupSlots(9, 5).filter((s) => s === "whole")).toHaveLength(5);
    expect(cupSlots(-2, 3).every((s) => s === "broken")).toBe(true);
  });
  it("accessible words: remaining, and a clear zero", () => {
    expect(cupsLabel(3, 5)).toBe("3 of 5 cups remaining");
    expect(cupsLabel(1, 7)).toBe("1 of 7 cups remaining");
    expect(cupsLabel(0, 3)).toBe("0 of 3 cups: out");
    expect(cupsCount(1)).toBe("1 cup");
    expect(cupsCount(5)).toBe("5 cups");
  });
});

describe("a cup breaks only on an authoritative decrement, once (D-S101-03)", () => {
  const key = "game-1:amina:hud";
  it("a first view (a reload) breaks nothing; the same count again breaks nothing", () => {
    const m = new CupMemory();
    expect(m.breaks(key, 3)).toBeNull(); // first view: nothing to compare with
    m.record(key, 3);
    expect(m.breaks(key, 3)).toBeNull(); // a repeated snapshot
    m.record(key, 3);
    expect(m.breaks(key, 3)).toBeNull();
  });
  it("one lost life breaks exactly the newly lost slot, and only once", () => {
    const m = new CupMemory();
    m.record(key, 5);
    expect(m.breaks(key, 4)).toEqual({ from: 4, to: 5 });
    m.record(key, 4);
    expect(m.breaks(key, 4)).toBeNull(); // the next view of the same count
    expect(m.breaks(key, 3)).toEqual({ from: 3, to: 4 });
  });
  it("the last cup: 1 → 0 breaks slot 0", () => {
    const m = new CupMemory();
    m.record(key, 1);
    expect(m.breaks(key, 0)).toEqual({ from: 0, to: 1 });
  });
  it("Play again is a new game id: fresh whole cups, nothing breaks", () => {
    const m = new CupMemory();
    m.record("game-1:amina:hud", 0);
    expect(m.breaks("game-2:amina:hud", 3)).toBeNull();
  });
  it("each place cups are drawn keeps its own memory (the HUD and the seat list both break)", () => {
    const m = new CupMemory();
    m.record("g:amina:hud", 3);
    m.record("g:amina:seat", 3);
    expect(m.breaks("g:amina:hud", 2)).toEqual({ from: 2, to: 3 });
    m.record("g:amina:hud", 2);
    expect(m.breaks("g:amina:seat", 2)).toEqual({ from: 2, to: 3 });
  });
  it("only a live loss animates: a resync after a gap, or no recorded loss, shows the broken cup still", () => {
    const brk = { from: 2, to: 3 };
    expect(isLiveBreak(brk, 10_000, 10_400)).toBe(true);
    expect(isLiveBreak(brk, 10_000, 10_000 + LIVE_BREAK_MS)).toBe(true);
    expect(isLiveBreak(brk, 10_000, 10_000 + LIVE_BREAK_MS + 1)).toBe(false); // came back later: no replay
    expect(isLiveBreak(brk, undefined, 10_000)).toBe(false); // no timeout in the log (leaving, say)
    expect(isLiveBreak(null, 10_000, 10_100)).toBe(false);
  });
  it("the seat's latest loss comes from its latest timeout in the public log; leaving is not a loss", () => {
    const log = [
      { kind: "timeout", player: "a", at: 100 },
      { kind: "accepted", player: "b", at: 150 },
      { kind: "timeout", player: "a", at: 200 },
      { kind: "sat-out", player: "b", at: 300 },
    ];
    expect(lastLossAt(log, "a")).toBe(200);
    expect(lastLossAt(log, "b")).toBeUndefined();
    expect(lastLossAt(undefined, "a")).toBeUndefined();
  });
});

describe("the rules, and what costs a cup, are unchanged (D-S101-01)", () => {
  const ctx = (s: JebenaState, now = 1) => ({ now, players: s.order, active: s.order, scale: 1 });
  const timeout = (s: JebenaState, now = 1) => jebenaModule.expirePhase(s, ctx(s, now));
  it("3/5/7, default 5; a timeout breaks exactly one cup; a wrong try breaks none", () => {
    expect(validateGameSettings("jebena-rush", { hearts: 4 })).toMatchObject({ ok: false, reason: "Cups must be 3, 5 or 7." });
    for (const hearts of [3, 5, 7]) expect(jebenaModule.init({ players: ["a", "b"], seed: 1, settings: { hearts } }).startHearts).toBe(hearts);
    expect(jebenaModule.init({ players: ["a", "b"], seed: 1 }).startHearts).toBe(5);
    const s = jebenaModule.init({ players: ["a", "b"], seed: 3, settings: { hearts: 3 } });
    const holder = s.turn!.player;
    jebenaModule.intent(s, holder, "jebena-answer", { turn: s.turn!.n, text: "zzqx not an answer" }, ctx(s));
    expect(s.per[holder]!.hearts).toBe(3); // a wrong try costs nothing
    expect(s.turn!.player).toBe(holder); // and the turn stays
    timeout(s);
    expect(s.per[holder]!.hearts).toBe(2); // one timeout, one cup
  });
  it("scoring is as before: 100 per player outlasted, 10 per whole cup", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 5, settings: { hearts: 3 } });
    for (let i = 0; i < 40 && s.end === null; i++) timeout(s, i + 1);
    const st = jebenaStandings(s);
    const pts = jebenaPoints(s);
    expect(pts[st[0]!.id]).toBe(2 * 100 + st[0]!.hearts * 10);
  });
});

describe("the words: cups everywhere hearts were", () => {
  const nameOf = (id?: string) => ({ a: "Amina", b: "Baraka" })[id ?? ""] ?? "Someone";
  it("the last play: a cup broke, the last cup broke, out", () => {
    expect(lastPlayLine([{ seq: 1, turn: 1, kind: "timeout", player: "a", hearts: 3 }], nameOf)).toBe("Amina ran out of time: a cup broke (3 left).");
    expect(lastPlayLine([{ seq: 1, turn: 1, kind: "timeout", player: "a", hearts: 0 }], nameOf)).toBe("Amina ran out of time: the last cup broke.");
    expect(lastPlayLine([{ seq: 2, turn: 1, kind: "out", player: "a" }], nameOf, "a")).toBe("You are out: every cup is broken.");
    expect(lastPlayLine([{ seq: 2, turn: 1, kind: "out", player: "b" }], nameOf)).toBe("Baraka is out: every cup is broken.");
  });
  it("the briefing, the refusal when out, the library and the registry tutorial", () => {
    const steps = briefingRules("jebena-rush", "").steps.join(" ");
    expect(steps).toMatch(/one of your cups breaks/);
    expect(steps).toMatch(/last player with a whole cup keeps the jebena/);
    expect(humanError("OUT")).toBe("All your cups are broken. Watch the rest!");
    const m = GAME_MANIFESTS.find((x) => x.id === "jebena-rush")!;
    const g = getGame("jebena-rush");
    for (const text of [steps, humanError("OUT"), m.description, m.details ?? "", g.tutorial ?? ""]) expect(text).not.toMatch(/heart|♥/i);
  });
});

describe("truthful results: 'You missed this one' needs evidence of absence (D-S101-06)", () => {
  const nameOf = (id: string) => id;
  const base = { gameInstanceId: "jr-1", title: "Jebena Rush", official: false, casual: true, nameOf };
  // Jebena Rush: done = accepted answers, of = turns held, actions = tries (right or wrong).
  it("a survival winner with no accepted answer but some tries is a winner, never 'missed'", () => {
    const s = resultsStory({ ...base, scores: { a: 130, b: 0 }, youId: "a", yourParticipation: { done: 0, of: 2, actions: 3 } });
    expect(s.you?.rank).toBe(1);
    expect(s.you?.line).not.toBe(QUIPS.youMissed[0]);
    expect(QUIPS.youWon as readonly string[]).toContain(s.you?.line);
  });
  it("a survival winner who never typed at all (the others' clocks ran out first) is still not 'missed'", () => {
    const s = resultsStory({ ...base, scores: { a: 110, b: 0 }, youId: "a", yourParticipation: { done: 0, of: 2, actions: 0 } });
    expect(s.you?.line).not.toBe(QUIPS.youMissed[0]);
    expect(s.celebrate).toBe(true);
  });
  it("a shared first place is not 'missed' either", () => {
    const s = resultsStory({ ...base, scores: { a: 120, b: 120, c: 0 }, youId: "b", yourParticipation: { done: 0, of: 1, actions: 0 } });
    expect(s.you?.line).toBe(QUIPS.youTiedFirst[0]);
  });
  it("someone who tried but placed lower is told their place or their zero, not 'missed'", () => {
    const s = resultsStory({ ...base, scores: { a: 230, b: 100, c: 0 }, youId: "c", yourParticipation: { done: 0, of: 3, actions: 4 } });
    expect(s.you?.line).not.toBe(QUIPS.youMissed[0]);
    expect(s.you?.line).toBe(QUIPS.youZero[0]);
  });
  it("someone truly absent (no action at all, not first) is still 'missed'", () => {
    const s = resultsStory({ ...base, scores: { a: 230, b: 100, c: 0 }, youId: "c", yourParticipation: { done: 0, of: 3, actions: 0 } });
    expect(s.you?.line).toBe(QUIPS.youMissed[0]);
  });
  it("a game that doesn't report actions keeps the old rule (nothing completed and nothing else known)", () => {
    const s = resultsStory({ ...base, official: true, casual: false, title: "Trivia", scores: { a: 300, b: 0, c: 100 }, youId: "b", yourParticipation: { done: 0, of: 10 } });
    expect(s.you?.line).toBe(QUIPS.youMissed[0]);
  });
  it("sitting out is unchanged: whole game, or part of it", () => {
    const whole = resultsStory({ ...base, scores: { a: 130, b: 0 }, youId: "b", youSatOut: true, yourParticipation: { done: 0, of: 1, actions: 0 } });
    expect(whole.you?.line).toBe(QUIPS.youSatOut[0]);
    const part = resultsStory({ ...base, scores: { a: 130, b: 100, c: 0 }, youId: "b", youSatOut: true, yourParticipation: { done: 2, of: 3, actions: 2 } });
    expect(part.you?.line).toMatch(/^You played 2 of 3, then sat out the rest\./);
  });
  it("ranking and scores are untouched", () => {
    const s = resultsStory({ ...base, scores: { a: 130, b: 0 }, youId: "a", yourParticipation: { done: 0, of: 2, actions: 3 } });
    expect(s.ranks).toEqual({ a: 1, b: 2 });
    expect(s.headline).toBe("a wins Jebena Rush");
  });
});
