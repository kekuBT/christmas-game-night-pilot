/**
 * Stage 4: the Library's view in its address (S3-NAV-01), room fit
 * (S3-LIB-01) and the group-size filter (S3-LIB-03).
 */
import { describe, expect, it } from "vitest";
import { GAME_MANIFESTS } from "../src/games/manifest.js";
import { clearFilters, DEFAULT_FILTERS, filterGames, filtersFromQuery, filtersToQuery, roomFit, type LibraryFilters } from "../apps/web/src/ui/mchezo/lib/library.js";
import { parseRoute, routeUrl } from "../apps/web/src/ui/mchezo/lib/routes.js";

describe("the library's view as an address", () => {
  const views: LibraryFilters[] = [
    DEFAULT_FILTERS,
    { ...DEFAULT_FILTERS, query: "trivia" },
    { ...DEFAULT_FILTERS, query: "two words & more", categories: ["word", "party"], playerCount: 4, maxDuration: 10, playStyle: "team", sort: "duration" },
    { ...DEFAULT_FILTERS, fitsRoom: true },
  ];
  it("round-trips every view, with categories in a canonical order", () => {
    for (const f of views) expect(filtersFromQuery(filtersToQuery(f))).toEqual({ ...f, categories: [...f.categories].sort((a, b) => a.localeCompare(b)) });
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe("");
  });
  it("ignores junk in a hand-edited address", () => {
    expect(filtersFromQuery("players=-3&len=abc&type=chaos&sort=random")).toEqual(DEFAULT_FILTERS);
  });
  it("routes keep the view for the public and the in-room library, with a details sheet on top", () => {
    const lib = filtersToQuery({ ...DEFAULT_FILTERS, query: "trivia", playStyle: "solo" });
    for (const route of [{ name: "library" as const, lib }, { name: "room" as const, sub: "library" as const, lib }]) {
      const url = routeUrl(route, "details", "trivia");
      const back = parseRoute(url.split("?")[0]!, `?${url.split("?")[1]}`);
      expect(back.route).toEqual(route);
      expect(back.sheet).toBe("details");
      expect(back.game).toBe("trivia");
    }
    // Other screens never carry it.
    expect(parseRoute("/room", "?q=trivia").route).toEqual({ name: "room", sub: "lobby" });
  });
});

describe("room fit and the group-size filter", () => {
  const caption = GAME_MANIFESTS.find((m) => m.id === "caption-clash")!;
  it("a 4–10 player game needs more players in a room of 2, fits 4, and is too small for 12", () => {
    expect(roomFit(caption, 2)).toBe("needs-more");
    expect(roomFit(caption, 4)).toBe("fits");
    expect(roomFit(caption, 12)).toBe("too-many");
  });
  it("'Fits your room' follows the room's live count", () => {
    const f = { ...DEFAULT_FILTERS, fitsRoom: true };
    const two = filterGames(GAME_MANIFESTS, f, 2).map((m) => m.id);
    const four = filterGames(GAME_MANIFESTS, f, 4).map((m) => m.id);
    expect(two).not.toContain("caption-clash");
    expect(four).toContain("caption-clash");
    expect(two).toEqual(filterGames(GAME_MANIFESTS, { ...DEFAULT_FILTERS, playerCount: 2 }).map((m) => m.id));
  });
  it("Clear filters keeps the sort", () => {
    expect(clearFilters({ ...DEFAULT_FILTERS, query: "x", fitsRoom: true, sort: "duration" })).toEqual({ ...DEFAULT_FILTERS, sort: "duration" });
  });
});
