/**
 * H8 (handoff 7027768922; the November 19 QA audit, pages 7 and 29): no internal build, test or status note in a
 * game's player-facing copy. Two texts reach players for every game:
 * - the registry's `tutorial`: the "How to play" line of the briefing (and the older intro screen);
 * - the manifest's `description`: the game's card and details sheet on Home, in the Library and in the host's picker.
 * Who Said That? said "Generic pack only in local builds", and Geography Challenge "six modes, provisional". Both now
 * describe what a player actually does and where it is played. Gameplay, modes and scoring are unchanged; the only content
 * change is two Geography explanations that ended with a team note (D-H8-02, handoff 7028695889).
 * The browser check through the normal entry points is scripts/check-player-copy.mjs.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GAME_REGISTRY } from "../src/games/registry.js";
import { GAME_MANIFESTS } from "../src/games/manifest.js";
import { briefingRules } from "../apps/web/src/ui/mchezo/lib/briefing.js";
import { itemHash, loadContent, officialEligible } from "../src/content/registry.js";
import { GEOGRAPHY_PACK, scoreGeography } from "../src/games/geography.js";
import { WHO_SAID_PACK } from "../src/games/whosaid.js";
import { RoomEngine } from "../src/server/room.js";

/** Notes meant for the team, not for players. */
export const INTERNAL_NOTE = /\b(local builds?|provisional|in tests?|test mode|registry|generic pack|placeholder|stub|debug|owner review|review pending|not licensed|fallbacks?|sprint \d|stage \d)\b/i;

describe("H8: player-facing game copy has no internal build, test or status notes", () => {
  it("the guard catches the copy the audit reported (negative control)", () => {
    for (const old of [
      "Match the quote to the speaker. Generic pack only in local builds.",
      "Match quotes to their speakers. Generic pack only in local builds.",
      "Flags, capitals, outlines, maps, and distance — six modes, provisional.",
      "Flags, capitals, outlines, maps, and distance. Six modes, provisional.",
      "It is easy to get all answers right in tests.",
    ]) expect(INTERNAL_NOTE.test(old), old).toBe(true);
  });

  it("every game's How to play line (the registry tutorial) is clean", () => {
    for (const g of GAME_REGISTRY) expect(INTERNAL_NOTE.test(g.tutorial ?? ""), `${g.id}: ${g.tutorial}`).toBe(false);
  });

  it("every game's card and details description (the manifest) is clean", () => {
    for (const m of GAME_MANIFESTS) expect(INTERNAL_NOTE.test(m.description), `${m.id}: ${m.description}`).toBe(false);
  });

  it("every game's briefing rules (the objective and steps players read) are clean", () => {
    for (const g of GAME_REGISTRY) {
      const r = briefingRules(g.id, g.tutorial ?? "");
      for (const line of [r.objective, ...r.steps]) expect(INTERNAL_NOTE.test(line), `${g.id}: ${line}`).toBe(false);
    }
  });
});

describe("H8: Who Said That? and Geography Challenge tell players what they actually do", () => {
  const reg = (id: string) => GAME_REGISTRY.find((g) => g.id === id)!;
  const man = (id: string) => GAME_MANIFESTS.find((m) => m.id === id)!;

  it("Who Said That?: matching a quote to a made-up character, in a room, on your own phone; answers at the end", () => {
    expect(briefingRules("who-said-that", reg("who-said-that").tutorial ?? "").objective).toBe("Match each quote to the character who said it. Everyone answers on their own phone, and the answers are shown when the game ends.");
    expect(man("who-said-that").description).toBe("Match each quote to the made-up character who said it. Played in a room, each player on their own phone.");
    // Not offered on the solo shelf: the copy says where it is played (a room), as the registry says.
    expect(man("who-said-that").soloPlay ?? false).toBe(false);
  });

  it("Geography Challenge: the question types it mixes, four answers each; no mode to pick", () => {
    expect(briefingRules("geography", reg("geography").tutorial ?? "").objective).toBe("Geography questions, mixed in every game: flags, capitals, regions, distances and more. Pick one of four answers on your phone.");
    expect(man("geography").description).toBe("Four-choice geography questions, mixed in every game: flags, capitals, regions, distances and more.");
    expect(man("geography").soloPlay ?? false).toBe(false);
  });

  it("nothing else about either game changes: players, duration, play style, status", () => {
    expect(reg("who-said-that")).toMatchObject({ minPlayers: 4, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 10 });
    expect(reg("geography")).toMatchObject({ minPlayers: 2, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 7 });
  });
});

/**
 * The questions and their revealed answers. Handoff 7028695889 (D-H8-02) authorised one content edit inside H8: the
 * two Geography explanations that ended with a team note now keep only their first sentence, in the content pack
 * (geography-legacy 1.0.1) and in the built-in pack. Nothing else about either item changed, and no approval or
 * review record was touched: this is a wording edit, not an editorial approval.
 */
describe("H8: the two games' questions and revealed answers carry no internal note", () => {
  const PLAYER_FIELDS = ["prompt", "options", "answer", "explanation", "quote", "speakers"];
  const flagged = (items: Record<string, unknown>[]) => {
    const out: Record<string, string> = {};
    for (const it of items) for (const f of PLAYER_FIELDS) {
      const v = it[f];
      for (const s of Array.isArray(v) ? v : [v]) if (typeof s === "string" && INTERNAL_NOTE.test(s)) out[String(it.id)] = s;
    }
    return out;
  };
  const lib = loadContent();
  const shipped = (id: string) => lib.items.get(id)!;

  it("the content packs: no note in any question, option, answer or explanation", () => {
    const items = [...lib.items.values()].filter((li) => li.gameId === "who-said-that" || li.gameId === "geography").map((li) => li.item as unknown as Record<string, unknown>);
    expect(items.length).toBeGreaterThan(16);
    expect(flagged(items)).toEqual({});
  });

  it("the built-in packs (used when no content is selected): no note either", () => {
    expect(flagged(WHO_SAID_PACK as unknown as Record<string, unknown>[])).toEqual({});
    expect(flagged(GEOGRAPHY_PACK as unknown as Record<string, unknown>[])).toEqual({});
  });

  it("the two explanations keep their first sentence, in both packs; every other field is unchanged", () => {
    const pack5 = shipped("geo-legacy-5"), pack6 = shipped("geo-legacy-6");
    expect(pack5.item).toMatchObject({ id: "geo-legacy-5", difficulty: 1, category: "World", eligibility: "official", mode: "outline", prompt: "Which boot-shaped country is this outline hint describing?", options: ["Greece", "Italy", "Spain", "Portugal"], answer: "Italy", explanation: "Italy is famously boot-shaped.", mechanic: "recognition" });
    expect(pack6.item).toMatchObject({ id: "geo-legacy-6", difficulty: 1, category: "World", eligibility: "official", mode: "region", prompt: "In which region is Egypt located?", options: ["South America", "North Africa", "Southeast Asia", "Northern Europe"], answer: "North Africa", explanation: "Egypt is in North Africa.", mechanic: "recall" });
    const built = (id: string) => GEOGRAPHY_PACK.find((q) => q.id === id)!;
    expect(built("geo-outline-1")).toEqual({ id: "geo-outline-1", mode: "outline", prompt: "Which boot-shaped country is this outline hint describing?", options: ["Greece", "Italy", "Spain", "Portugal"], correctIndex: 1, explanation: "Italy is famously boot-shaped." });
    expect(built("geo-region-1")).toEqual({ id: "geo-region-1", mode: "region", prompt: "In which region is Egypt located?", options: ["South America", "North Africa", "Southeast Asia", "Northern Europe"], correctIndex: 1, explanation: "Egypt is in North Africa." });
    // Scoring is the module's, unchanged: 100 for the right answer, 0 otherwise.
    expect([scoreGeography(built("geo-outline-1"), 1), scoreGeography(built("geo-outline-1"), 0), scoreGeography(built("geo-region-1"), null)]).toEqual([100, 0, 0]);
  });

  it("the pack is version 1.0.1, loads with no problem, and both items keep their status and Official eligibility", () => {
    for (const li of [shipped("geo-legacy-5"), shipped("geo-legacy-6")]) {
      expect(li).toMatchObject({ gameId: "geography", packId: "geography-legacy", packVersion: "1.0.1", status: "legacy" });
      expect(li.approval).toBeUndefined(); // no approval record exists or was made
      expect(li.item.review).toEqual({ status: "legacy", notes: "In official play before Sprint 4 (authored by Muse). Grandfathered; awaiting human editorial review." });
      expect(officialEligible(li, "2026-11-20")).toBe(true);
    }
    expect(lib.problems.filter((p) => p.file.includes("geography"))).toEqual([]);
  });

  it("the content hash follows the wording, so a briefing frozen on the old text is cancelled after a restart (never played)", () => {
    // pendingItems() compares a frozen briefing's pack version and item hash with the library loaded now and ends the
    // briefing as "content-changed" on a mismatch (tests/d3-briefing.test.ts); the version and the hash both moved.
    const before: Record<string, string> = {
      "geo-legacy-5": "Italy is famously boot-shaped. Text hint fallback, not SVG geometry.",
      "geo-legacy-6": "Egypt is in North Africa. Accessible region fallback, not map tap.",
    };
    for (const [id, old] of Object.entries(before)) {
      const li = shipped(id);
      expect(li.hash).toBe(itemHash("geography", li.item));
      expect(itemHash("geography", { ...li.item, explanation: old })).not.toBe(li.hash);
      expect(INTERNAL_NOTE.test(old)).toBe(true); // the old text is what the guard catches
    }
  });
});

/**
 * The same two explanations as players get them: a whole Official Geography game, every answer through the engine,
 * then the revealed questions in each player's own projection. A Cup created now deals from the content pack
 * (geo-legacy-*); a Cup restored from before Sprint 4 keeps the built-in pack (geo-outline-1, geo-region-1).
 */
describe("H8: Geography results reveal the cleaned explanations on both content paths", () => {
  type Revealed = { id: string; explanation?: string };
  const play = (legacyCup: boolean): { questions: Revealed[]; contentUsage: unknown } => {
    const lib = loadContent();
    let engine = new RoomEngine("H8 copy");
    engine.content = lib;
    const host = engine.join("Ada", { asHost: true }).player.id;
    const bea = engine.join("Bea").player.id;
    if (legacyCup) {
      const snap = JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>;
      delete snap["cup"]; // as written before Sprint 4
      engine = RoomEngine.fromJSON(snap as never);
      engine.content = lib;
      expect(engine.cup.origin).toBe("legacy-restored");
    }
    const g = engine.startGame(host, "geography", { official: true, seed: 3 });
    const qs = (g.extra as { questions: { id: string; correctIndex: number }[] }).questions;
    for (const pid of [host, bea]) for (const q of qs) {
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: g.id, action: "geography-answer", payload: { questionId: q.id, chosenIndex: q.correctIndex } }, pid);
    }
    expect(g.status).toBe("finished");
    expect(g.rawScores).toEqual({ [host]: qs.length * 100, [bea]: qs.length * 100 }); // scoring unchanged: 100 a right answer
    const mine = (engine.project("player", bea) as { myGames: { id: string; state: { questions: Revealed[] } }[] }).myGames.find((x) => x.id === g.id)!;
    return { questions: mine.state.questions, contentUsage: engine.contentUsage };
  };
  const explanationOf = (qs: Revealed[], id: string) => qs.find((q) => q.id === id)?.explanation;

  it("a Cup created now (content pack): both explanations revealed as their first sentence, no note anywhere", () => {
    const { questions, contentUsage } = play(false);
    expect(questions.map((q) => q.id)).toEqual(expect.arrayContaining(["geo-legacy-5", "geo-legacy-6"]));
    expect(explanationOf(questions, "geo-legacy-5")).toBe("Italy is famously boot-shaped.");
    expect(explanationOf(questions, "geo-legacy-6")).toBe("Egypt is in North Africa.");
    for (const q of questions) expect(INTERNAL_NOTE.test(q.explanation ?? ""), `${q.id}: ${q.explanation}`).toBe(false);
    expect(contentUsage).not.toEqual({}); // dealt by the selection service
  });

  it("a Cup restored from before Sprint 4 (built-in pack): the same, with the built-in ids", () => {
    const { questions, contentUsage } = play(true);
    expect(questions.map((q) => q.id)).toEqual(GEOGRAPHY_PACK.map((q) => q.id));
    expect(explanationOf(questions, "geo-outline-1")).toBe("Italy is famously boot-shaped.");
    expect(explanationOf(questions, "geo-region-1")).toBe("Egypt is in North Africa.");
    for (const q of questions) expect(INTERNAL_NOTE.test(q.explanation ?? ""), `${q.id}: ${q.explanation}`).toBe(false);
    expect(contentUsage).toEqual({}); // not the selection service
  });
});
