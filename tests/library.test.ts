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
    // "word" hits Word Connections (title) and Category Sprint (category).
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, query: "word" }))).toEqual([
      "Category Sprint",
      "Word Connections",
    ]);
  });

  it("empty query matches everything, sorted by name", () => {
    const got = filterGames(GAME_MANIFESTS, DEFAULT_FILTERS);
    expect(got).toHaveLength(11);
    expect(titles(got)[0]).toBe("Caption Clash");
    expect(titles(got)[10]).toBe("Word Connections");
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
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playerCount: 1 }))).toEqual(["Word Connections"]);
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playerCount: 2 }))).toEqual([
      "Closest Wins",
      "Geography Challenge",
      "Guess the Year",
      "Math Mayhem",
      "Trivia Showdown",
      "Word Connections",
    ]);
    expect(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playerCount: 4 })).toHaveLength(11);
  });

  it("player count excludes games whose max is below it (custom catalog)", () => {
    const small: GameManifest = { ...GAME_MANIFESTS[0]!, maxPlayers: 4 };
    expect(filterGames([small], { ...DEFAULT_FILTERS, playerCount: 6 })).toEqual([]);
    expect(filterGames([small], { ...DEFAULT_FILTERS, playerCount: 4 })).toHaveLength(1);
  });

  it("max duration is inclusive", () => {
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, maxDuration: 5 }))).toEqual(["Math Mayhem"]);
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, maxDuration: 8 }))).toEqual([
      "Closest Wins",
      "Guess the Year",
      "Math Mayhem",
      "Word Connections",
    ]);
  });

  it("play style filters solo vs team", () => {
    expect(titles(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playStyle: "team" }))).toEqual(["Charades"]);
    expect(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playStyle: "solo" })).toHaveLength(10);
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
    expect(titles(got).slice(0, 4)).toEqual(["Math Mayhem", "Closest Wins", "Guess the Year", "Word Connections"]);
    expect(titles(got)[10]).toBe("Charades");
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
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "duration" })).toBe(true);
  });

  it("filtering never mutates the input array", () => {
    const before = [...GAME_MANIFESTS];
    filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, sort: "duration" });
    expect(GAME_MANIFESTS).toEqual(before);
  });
});
