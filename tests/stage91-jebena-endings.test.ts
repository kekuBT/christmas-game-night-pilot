/**
 * Stage 9.1 (review 6808081378, answers to §11): each way a Jebena Rush match
 * ends, on its own: normal elimination, the match limit (with a shared first
 * place, and with one leader), every answer used up, and players leaving.
 * "Outlasted" means players who went out earlier: survivors never outlast
 * each other. Survivors on equal hearts share a place and equal points;
 * players out rank by when they went out; seat order never breaks a tie.
 * The results words say "kept the jebena" only when one player is left.
 */
import { describe, expect, it } from "vitest";
import { JEBENA_CATEGORIES } from "../src/games/modules/packs/jebena-banks.js";
import { jebenaModule, jebenaPoints, jebenaStandings, type JebenaState } from "../src/games/modules/jebena.js";
import { jebenaEndLine, keptTheJebena, lastPlayLine, shownSeconds, turnLeftMs, urgencyFor, verdictLine } from "../apps/web/src/ui/mchezo/lib/jebena.js";

const ctx = (s: JebenaState, now = 1) => ({ now, players: s.order, active: s.order, scale: 1 });
const names: Record<string, string> = { a: "Amina", b: "Baraka", c: "Chausiku", d: "Daudi" };
const nameOf = (id?: string) => names[id ?? ""] ?? "Someone";
const timeout = (s: JebenaState) => jebenaModule.expirePhase(s, ctx(s));
const fresh = (s: JebenaState) => JEBENA_CATEGORIES.find((c) => c.id === s.category)!.answers.find((a) => !(s.used[s.category] ?? []).includes(a.id))!.name;
const answer = (s: JebenaState) => jebenaModule.intent(s, s.turn!.player, "jebena-answer", { turn: s.turn!.n, text: fresh(s) }, ctx(s));
const words = (s: JebenaState, me?: string) => jebenaEndLine(s.end, jebenaStandings(s), nameOf, me);

describe("Jebena Rush endings, each on its own", () => {
  it("normal elimination: the last one with hearts keeps the jebena; places follow the order of going out", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 5, settings: { hearts: 3 } });
    const survivor = s.order[0]!;
    while (!s.end) { if (s.turn!.player === survivor) answer(s); else timeout(s); }
    expect(s.end).toBe("last-standing");
    const st = jebenaStandings(s);
    expect(st.map((r) => r.place)).toEqual([1, 2, 3]);
    expect(st[0]).toMatchObject({ id: survivor, out: false, hearts: 3, points: 2 * 100 + 3 * 10 });
    expect(st[1]!.points).toBe(100); // outlasted the first one out
    expect(st[2]!.points).toBe(0);
    expect(st.filter((r) => keptTheJebena(s.end, st, r.id)).map((r) => r.id)).toEqual([survivor]);
    expect(words(s)).toBe(`${nameOf(survivor)} kept the jebena!`);
    expect(words(s, survivor)).toBe("You kept the jebena!");
  });

  it("the match limit with survivors tied on hearts: one shared first place, equal points, nobody 'kept the jebena', seat order breaks nothing", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c", "d"], seed: 9, settings: { hearts: 3 } });
    // Seat order puts someone first; make the LAST seat go out, then stop (the room's limit ends it; the module's end stays null).
    const [p0, p1, p2, p3] = s.order as [string, string, string, string];
    s.per[p3]!.hearts = 0; s.per[p3]!.outOrder = 1; s.outCount = 1;
    s.per[p0]!.hearts = 2; s.per[p1]!.hearts = 2; s.per[p2]!.hearts = 1;
    expect(s.end).toBeNull();
    const st = jebenaStandings(s);
    const place = Object.fromEntries(st.map((r) => [r.id, r.place]));
    expect(place[p0]).toBe(1);
    expect(place[p1]).toBe(1); // shared, whatever their seats
    expect(place[p2]).toBe(3);
    expect(place[p3]).toBe(4);
    const pts = jebenaPoints(s);
    // Outlasted = those out earlier (one player); survivors never outlast each other.
    expect(pts[p0]).toBe(100 + 20);
    expect(pts[p1]).toBe(pts[p0]);
    expect(pts[p2]).toBe(100 + 10);
    expect(pts[p3]).toBe(0);
    expect(st.some((r) => keptTheJebena(s.end, st, r.id))).toBe(false);
    const line = words(s);
    expect(line).toMatch(/^Time's up: a shared first place \(/);
    for (const id of [p0, p1]) expect(line).toContain(nameOf(id));
    for (const id of [p2, p3]) expect(line).not.toContain(nameOf(id));
    expect(words(s)).not.toMatch(/kept the jebena/);
    // Swapping the two tied players' seats changes neither their places nor their points.
    const t = JSON.parse(JSON.stringify(s)) as JebenaState;
    t.order = [p1, p0, p2, p3];
    const pt = jebenaPoints(t);
    expect(pt[p0]).toBe(pts[p0]);
    expect(Object.fromEntries(jebenaStandings(t).map((r) => [r.id, r.place]))).toEqual(place);
  });

  it("the match limit with one leader: 'came first', never 'kept the jebena'", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 2, settings: { hearts: 5 } });
    const [p0, p1, p2] = s.order as [string, string, string];
    s.per[p0]!.hearts = 4; s.per[p1]!.hearts = 2; s.per[p2]!.hearts = 2;
    const st = jebenaStandings(s);
    expect(st[0]).toMatchObject({ id: p0, place: 1 });
    expect(st.slice(1).map((r) => r.place)).toEqual([2, 2]);
    expect(st.some((r) => keptTheJebena(s.end, st, r.id))).toBe(false);
    expect(words(s)).toBe(`Time's up: ${nameOf(p0)} came first`);
    expect(words(s, p0)).toBe("Time's up: you came first");
  });

  it("every answer used up: the match ends; nobody 'kept the jebena'", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 4, settings: { hearts: 3 } });
    let guard = 0;
    while (!s.end && guard++ < 1000) answer(s);
    expect(s.end).toBe("banks-exhausted");
    expect(s.turn).toBeNull();
    expect(jebenaModule.phase(s)).toBeNull();
    const st = jebenaStandings(s);
    expect(st.map((r) => r.place)).toEqual([1, 1]); // nobody lost a heart
    expect(new Set(Object.values(jebenaPoints(s)))).toEqual(new Set([30]));
    expect(st.some((r) => keptTheJebena(s.end, st, r.id))).toBe(false);
    expect(words(s)).toMatch(/^Every answer was named! A shared first place/);
  });

  it("voluntary exit: a leaver is out from that moment, with no heart points; the last one left keeps the jebena", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 7, settings: { hearts: 5 } });
    const [p0, p1, p2] = s.order as [string, string, string];
    timeout(s); // p0 loses a heart
    expect(jebenaModule.abstain(s, p2, ctx(s))).toMatchObject({ ok: true, wholeGameAbstain: true }); // not their turn
    expect(s.end).toBeNull();
    expect(jebenaModule.abstain(s, p1, ctx(s))).toMatchObject({ ok: true }); // their turn: the jebena passes, one left
    expect(s.end).toBe("last-standing");
    const st = jebenaStandings(s);
    expect(st.map((r) => r.id)).toEqual([p0, p1, p2]); // the later leaver above the earlier
    const pts = jebenaPoints(s);
    expect(pts[p0]).toBe(200 + 4 * 10);
    expect(pts[p1]).toBe(100); // outlasted p2, no heart points once out
    expect(pts[p2]).toBe(0);
    expect(words(s)).toBe(`${nameOf(p0)} kept the jebena!`);
    expect(lastPlayLine(s.log as never, nameOf)).toBe(`${nameOf(p1)} left the game.`); // no reason, ever
  });
});

describe("Jebena Rush words", () => {
  it("verdicts are plain and never name a hidden answer", () => {
    expect(verdictLine({ turn: 1, text: "monkee", verdict: "ambiguous" }, "Animals").text).toBe("“monkee” is close, but we can't be sure which answer you mean. Check the spelling.");
    expect(verdictLine({ turn: 1, text: "zz", verdict: "not-in-bank" }, "Animals").text).toBe("“zz” isn't on our Animals list. Try another!");
    expect(verdictLine({ turn: 1, text: "LION", verdict: "used", answer: "Lion" }, "Animals").text).toBe("“Lion” was already named in Animals. Try another!");
    expect(verdictLine({ turn: 1, text: "Congo", verdict: "near-miss", reason: "Say which one." }, "Countries in Africa").text).toBe("“Congo”: Say which one.");
  });
  it("the countdown: the deadline less the grace, whole seconds rounded up, never more than the turn; urgency by share", () => {
    expect(turnLeftMs(20_500, 500, 10_000)).toBe(10_000);
    expect(turnLeftMs(20_500, 500, 21_000)).toBe(0);
    expect(turnLeftMs(undefined, 500, 0)).toBeNull();
    expect(shownSeconds(10_000, 10_000)).toBe(10);
    expect(shownSeconds(10_300, 10_000)).toBe(10); // a clock a little behind never shows 11
    expect(shownSeconds(1, 10_000)).toBe(1);
    expect([urgencyFor(9000, 10_000), urgencyFor(5000, 10_000), urgencyFor(1000, 10_000)]).toEqual(["warm", "steaming", "boiling"]);
  });
});
