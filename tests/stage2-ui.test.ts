/**
 * Stage 2 (Night Circle: Home B, Lobby A, visual Library, navigation), pure
 * parts. The rendered screens are covered by scripts/check-stage2.mjs.
 */
import { describe, expect, it } from "vitest";
import { parseRoute, routeUrl, sameRoute, type Route, type Sheet } from "../apps/web/src/ui/mchezo/lib/routes.js";
import { isClientPath } from "../src/shared/clientRoutes.js";
import { COVERS, coverSvg, sessionEstimate, timeLimitLabel } from "../apps/web/src/ui/mchezo/lib/covers.js";
import { GAME_REGISTRY } from "../src/games/registry.js";
import { GAME_MANIFESTS } from "../src/games/manifest.js";

describe("routes", () => {
  const cases: [Route, Sheet | null][] = [
    [{ name: "home" }, null],
    [{ name: "home" }, "settings"],
    [{ name: "join" }, null],
    [{ name: "join", code: "ABC123" }, null],
    [{ name: "host" }, null],
    [{ name: "library" }, null],
    [{ name: "library", gameId: "trivia" }, null],
    [{ name: "watch", code: "XYZ789" }, null],
    [{ name: "room", sub: "lobby" }, null],
    [{ name: "room", sub: "lobby" }, "invite"],
    [{ name: "room", sub: "lobby" }, "choose"],
    [{ name: "room", sub: "lobby" }, "menu"],
    [{ name: "room", sub: "cup" }, null],
    [{ name: "room", sub: "tv" }, null],
    [{ name: "room", sub: "memories" }, null],
    [{ name: "room", sub: "library" }, null],
    [{ name: "room", sub: "library", gameId: "charades" }, null],
    [{ name: "room", sub: "studio" }, null],
  ];
  it.each(cases)("round-trips %j (sheet %s)", (route, sheet) => {
    const url = routeUrl(route, sheet);
    const u = new URL(url, "http://x");
    const back = parseRoute(u.pathname, u.search);
    expect(back.sheet).toBe(sheet);
    expect(sameRoute(back.route, route)).toBe(true);
  });

  it("old QR links (/?code=) open Join with the code; bad codes are ignored", () => {
    expect(parseRoute("/", "?code=abc123").route).toEqual({ name: "join", code: "ABC123" });
    expect(parseRoute("/", "?joinCode=ABC123").route).toEqual({ name: "join", code: "ABC123" });
    expect(parseRoute("/join", "?code=nope").route).toEqual({ name: "join" });
    expect(parseRoute("/", "?sheet=hack").sheet).toBeNull();
  });

  it("unknown paths fall back to Home; URLs never carry a token", () => {
    expect(parseRoute("/what/ever").route).toEqual({ name: "home" });
    expect(routeUrl({ name: "room", sub: "lobby" })).toBe("/room");
    for (const [r, s] of cases) expect(routeUrl(r, s)).not.toMatch(/token|session|recovery/i);
  });

  it("the server serves the app for client paths only, never for API paths", () => {
    for (const p of ["/join", "/host", "/watch", "/library", "/library/trivia", "/room", "/room/cup", "/room/tv", "/room/memories", "/room/studio", "/room/library", "/room/library/trivia", "/room/"]) expect(isClientPath(p), p).toBe(true);
    for (const p of ["/rooms", "/rooms/abc/projection", "/games", "/games/trivia", "/assets/x.js", "/roomz", "/room/secret", "/"]) expect(isClientPath(p), p).toBe(false);
  });
});

describe("covers", () => {
  it("every game in the registry has a cover, and every cover belongs to a game", () => {
    const ids = GAME_REGISTRY.map((g) => g.id).sort();
    expect(Object.keys(COVERS).sort()).toEqual(ids);
  });

  it("covers are self-contained SVG with unique gradient ids and no external resources", () => {
    const a = coverSvg("trivia", 156, 156, "a1");
    const b = coverSvg("trivia", 156, 156, "b2");
    expect(a).toContain('id="mzcov-a1"');
    expect(b).toContain('id="mzcov-b2"');
    for (const id of Object.keys(COVERS)) {
      const svg = coverSvg(id, 320, 180, "x");
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/https?:|href=|<script|<image|on[a-z]+=/i);
    }
  });

  it("estimated session length and the real time limit are labelled differently", () => {
    expect(sessionEstimate(10)).toBe("about 10 min");
    expect(timeLimitLabel(6 * 60_000)).toBe("6-min limit");
    expect(timeLimitLabel(undefined)).toBeNull();
  });

  it("game names come from one source: manifests agree with the registry", () => {
    for (const m of GAME_MANIFESTS) expect(m.title).toBe(GAME_REGISTRY.find((g) => g.id === m.id)?.title);
  });
});
