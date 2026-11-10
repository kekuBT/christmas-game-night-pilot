import { describe, expect, it } from "vitest";
import { GAME_MANIFESTS, type GameManifest } from "../src/games/manifest.js";
import {
  allCategories,
  DEFAULT_FILTERS,
  filterGames,
  hasActiveFilters,
  type LibraryFilters,
} from "../apps/web/src/ui/mchezo/lib/library.js";

const titles = (ms: readonly GameManifest[]) => ms.map((m) => m.title);

describe("filterGames search", () => {
  it("matches titles case-insensitively", () => {
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, query: "TRIVIA" }))).toEqual(["Trivia Showdown"]);
  });

  it("matches descriptions and categories, not just titles", () => {
    // "word" hits Word Connections (title), Category Sprint (category) and,
    // since Stage 5, Draw & Guess ("draws a secret word", description).
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, query: "word" }))).toEqual([
      "Category Sprint",
      "Draw & Guess",
      "Word Connections",
    ]);
  });

  it("empty query matches everything, sorted by name", () => {
    const got = filterGames(GAME_MANIFESTS, DEFAULT_FILTERS);
    expect(got).toHaveLength(14);
    expect(titles(got)[0]).toBe("Caption Clash");
    expect(titles(got)[13]).toBe("Word Connections");
  });

  it("a query with no match gives an empty list", () => {
    expect(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, query: "xyz-no-match" })).toEqual([]);
  });
});

describe("filterGames facets", () => {
  it("category filter is OR: any selected category matches", () => {
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, categories: ["knowledge"] }))).toEqual([
      "Geography Challenge",
      "Guess the Year",
      "Trivia Showdown",
      "Who Said That?",
    ]);
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, categories: ["knowledge", "math"] }))).toEqual([
      "Geography Challenge",
      "Guess the Year",
      "Math Mayhem",
      "Trivia Showdown",
      "Who Said That?",
    ]);
  });

  it("player count is an inclusive range check", () => {
    // Pattern Pulse (Stage 5) is the second game one player can practise;
    // Math Mayhem (Stage 6.1: hard minimum 1, best with 2+) the third.
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playerCount: 1 }))).toEqual(["Math Mayhem", "Pattern Pulse", "Word Connections"]);
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playerCount: 2 }))).toEqual([
      "Closest Wins",
      "Geography Challenge",
      "Guess the Year",
      "Math Mayhem",
      "Pattern Pulse",
      "Trivia Showdown",
      "Word Connections",
    ]);
    expect(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playerCount: 4 })).toHaveLength(14);
    // Majority Rules (Stage 5) starts at 3: in at 3, out at 2.
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playerCount: 3 }))).toContain("Majority Rules");
  });

  it("player count excludes games whose max is below it (custom catalog)", () => {
    const small: GameManifest = { ...GAME_MANIFESTS[0]!, maxPlayers: 4 };
    expect(filterGames([small], { ...DEFAULT_FILTERS, playerCount: 6 })).toEqual([]);
    expect(filterGames([small], { ...DEFAULT_FILTERS, playerCount: 4 })).toHaveLength(1);
  });

  it("max duration is inclusive", () => {
    // Stage 5.1 (3D): Category Sprint (about 5 min, 4-min limit) and Geography
    // (about 7 min, 6-min limit) no longer claim more time than they can run.
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, maxDuration: 5 }))).toEqual(["Category Sprint", "Math Mayhem", "Pattern Pulse"]);
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, maxDuration: 8 }))).toEqual([
      "Category Sprint",
      "Closest Wins",
      "Geography Challenge",
      "Guess the Year",
      "Majority Rules",
      "Math Mayhem",
      "Pattern Pulse",
      "Word Connections",
    ]);
  });

  it("play style filters solo vs team", () => {
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playStyle: "team" }))).toEqual(["Charades"]);
    expect(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playStyle: "solo" })).toHaveLength(13);
  });

  it("filters combine (AND across facets)", () => {
    const filters: LibraryFilters = { ...DEFAULT_FILTERS, categories: ["knowledge"], playerCount: 2 };
    // Who Said That? needs 4 players, so it drops out.
    expect(titles(filterGames(GAME_MANIFESTS, filters))).toEqual([
      "Geography Challenge",
      "Guess the Year",
      "Trivia Showdown",
    ]);
  });
});

describe("filterGames sorting", () => {
  it("duration sort is minutes ascending with title tie-break", () => {
    const got = filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, sort: "duration" });
    // 5 min (Category Sprint, Math Mayhem, Pattern Pulse), 6, 7 (Geography), then 8.
    expect(titles(got).slice(0, 6)).toEqual(["Category Sprint", "Math Mayhem", "Pattern Pulse", "Majority Rules", "Geography Challenge", "Closest Wins"]);
    expect(titles(got)[13]).toBe("Charades");
  });
});

describe("library helpers", () => {
  it("allCategories returns the sorted unique set", () => {
    const cats = allCategories(GAME_MANIFESTS);
    expect(cats).toContain("party");
    expect(cats).toContain("team");
    expect(new Set(cats).size).toBe(cats.length);
    expect([...cats].sort((a, b) => a.localeCompare(b))).toEqual(cats);
  });

  it("hasActiveFilters is false only for the defaults", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, query: "x" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, categories: ["party"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, playerCount: 4 })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, maxDuration: 10 })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, playStyle: "team" })).toBe(true);
    // Stage 4 (S3-LIB-04): sorting orders the list; it is not a filter.
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "duration" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, fitsRoom: true })).toBe(true);
  });

  it("filtering never mutates the input array", () => {
    const before = [...GAME_MANIFESTS];
    filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, sort: "duration" });
    expect(GAME_MANIFESTS).toEqual(before);
  });
});
