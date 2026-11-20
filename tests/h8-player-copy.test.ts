/**
 * H8 (handoff 7027768922; the November 19 QA audit, pages 7 and 29): no internal build, test or status note in a
 * game's player-facing copy. Two texts reach players for every game:
 * - the registry's `tutorial`: the "How to play" line of the briefing (and the older intro screen);
 * - the manifest's `description`: the game's card and details sheet on Home, in the Library and in the host's picker.
 * Who Said That? said "Generic pack only in local builds", and Geography Challenge "six modes, provisional". Both now
 * describe what a player actually does and where it is played. Gameplay, modes, scoring and content are unchanged.
 * The browser check through the normal entry points is scripts/check-player-copy.mjs.
 */
import { describe, expect, it } from "vitest";
import { GAME_REGISTRY } from "../src/games/registry.js";
import { GAME_MANIFESTS } from "../src/games/manifest.js";
import { briefingRules } from "../apps/web/src/ui/mchezo/lib/briefing.js";
import { loadContent } from "../src/content/registry.js";
import { GEOGRAPHY_PACK } from "../src/games/geography.js";
import { WHO_SAID_PACK } from "../src/games/whosaid.js";

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
 * The questions and their revealed answers are content, not copy: H8 keeps them as they are (the handoff: "preserve
 * ... content"; an item edit goes through docs/content-quality-2/WORKFLOW.md). Two Geography explanations end with a
 * team note; they are listed for the backlog. This pins that list, so a new note in either game's questions, options
 * or explanations fails here instead of reaching a results screen.
 */
describe("H8: the two games' questions and revealed answers (content) carry no other internal note", () => {
  const KNOWN: Record<string, string> = {
    "geo-legacy-5": "Italy is famously boot-shaped. Text hint fallback, not SVG geometry.",
    "geo-legacy-6": "Egypt is in North Africa. Accessible region fallback, not map tap.",
    "geo-outline-1": "Italy is famously boot-shaped. Text hint fallback, not SVG geometry.",
    "geo-region-1": "Egypt is in North Africa. Accessible region fallback, not map tap.",
  };
  const PLAYER_FIELDS = ["prompt", "options", "answer", "explanation", "quote", "speakers"];
  const flagged = (items: Record<string, unknown>[]) => {
    const out: Record<string, string> = {};
    for (const it of items) for (const f of PLAYER_FIELDS) {
      const v = it[f];
      for (const s of Array.isArray(v) ? v : [v]) if (typeof s === "string" && INTERNAL_NOTE.test(s)) out[String(it.id)] = s;
    }
    return out;
  };

  it("the content packs: only the two listed Geography explanations", () => {
    const lib = loadContent();
    const items = [...lib.items.values()].filter((li) => li.gameId === "who-said-that" || li.gameId === "geography").map((li) => li.item as unknown as Record<string, unknown>);
    expect(items.length).toBeGreaterThan(16);
    expect(flagged(items)).toEqual({ "geo-legacy-5": KNOWN["geo-legacy-5"], "geo-legacy-6": KNOWN["geo-legacy-6"] });
  });

  it("the built-in packs (used when no content is selected): only the same two explanations", () => {
    expect(flagged(WHO_SAID_PACK as unknown as Record<string, unknown>[])).toEqual({});
    expect(flagged(GEOGRAPHY_PACK as unknown as Record<string, unknown>[])).toEqual({ "geo-outline-1": KNOWN["geo-outline-1"], "geo-region-1": KNOWN["geo-region-1"] });
  });
});
