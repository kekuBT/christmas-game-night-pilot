/**
 * Stage 2 navigation model (approved: docs/ux-redesign/PROPOSAL.md §2). Pure:
 * no React, no history. URLs hold screens only, never credentials, seats or
 * scores; the room code in a URL is the public 6-character code.
 *
 *   /                     Home (discover)
 *   /join?code=ABC123     Join a room (QR links point here)
 *   /host                 Host a party
 *   /library[/<gameId>]   Game library (outside a room)
 *   /watch?code=ABC123    Spectator entry
 *   /room                 Lobby, or the live game
 *   /room/cup             Family Cup
 *   /room/tv              TV view
 *   /room/memories        Memory Book
 *   /room/library         Game library inside a room (host keeps the room)
 *   /room/studio          Studio (preview)
 *
 * A sheet rides in `?sheet=` (invite, choose, menu, settings, details), so
 * browser and iOS swipe Back close it before leaving the screen. The details
 * sheet names its game in `?game=`.
 *
 * Note: `/games` and `/rooms/...` are server API paths, which is why the
 * library lives at `/library`.
 */

export type RoomSub = "lobby" | "cup" | "tv" | "memories" | "library" | "studio";
export type Sheet = "invite" | "choose" | "menu" | "settings" | "details";
export type Route =
  | { name: "home" }
  | { name: "join"; code?: string }
  | { name: "host" }
  | { name: "library"; gameId?: string }
  | { name: "watch"; code?: string }
  | { name: "room"; sub: RoomSub; gameId?: string };

const SHEETS: readonly Sheet[] = ["invite", "choose", "menu", "settings", "details"];
const GAME_ID = /^[a-z0-9-]{1,40}$/;
const SUBS: Readonly<Record<string, RoomSub>> = { "": "lobby", cup: "cup", tv: "tv", memories: "memories", library: "library", studio: "studio" };
const CODE = /^[A-Z0-9]{6}$/;

function cleanCode(raw: string | null): string | undefined {
  const c = (raw ?? "").trim().toUpperCase();
  return CODE.test(c) ? c : undefined;
}

/** Parse a location (pathname + search). Unknown paths read as Home. */
export function parseRoute(pathname: string, search = ""): { route: Route; sheet: Sheet | null; game: string | null } {
  const params = new URLSearchParams(search);
  const s = params.get("sheet");
  let sheet = (SHEETS as readonly string[]).includes(s ?? "") ? (s as Sheet) : null;
  const g = params.get("game");
  const game = sheet === "details" && g && GAME_ID.test(g) ? g : null;
  if (sheet === "details" && !game) sheet = null;
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const code = cleanCode(params.get("code") ?? params.get("joinCode"));
  let route: Route;
  if (parts.length === 0) route = code ? { name: "join", code } : { name: "home" };
  else if (parts[0] === "join") route = code ? { name: "join", code } : { name: "join" };
  else if (parts[0] === "host" && parts.length === 1) route = { name: "host" };
  else if (parts[0] === "watch" && parts.length === 1) route = code ? { name: "watch", code } : { name: "watch" };
  else if (parts[0] === "library") route = parts[1] ? { name: "library", gameId: decodeURIComponent(parts[1]) } : { name: "library" };
  else if (parts[0] === "room") {
    const sub = SUBS[parts[1] ?? ""];
    if (!sub) route = { name: "room", sub: "lobby" };
    else route = sub === "library" && parts[2] ? { name: "room", sub, gameId: decodeURIComponent(parts[2]) } : { name: "room", sub };
  } else route = { name: "home" };
  return { route, sheet, game };
}

/** The URL for a route (and optional sheet). */
export function routeUrl(route: Route, sheet: Sheet | null = null, game: string | null = null): string {
  let path: string;
  const q = new URLSearchParams();
  switch (route.name) {
    case "home": path = "/"; break;
    case "join": path = "/join"; if (route.code) q.set("code", route.code); break;
    case "host": path = "/host"; break;
    case "library": path = route.gameId ? `/library/${encodeURIComponent(route.gameId)}` : "/library"; break;
    case "watch": path = "/watch"; if (route.code) q.set("code", route.code); break;
    case "room": {
      const seg = route.sub === "lobby" ? "" : `/${route.sub}`;
      path = `/room${seg}${route.sub === "library" && route.gameId ? `/${encodeURIComponent(route.gameId)}` : ""}`;
      break;
    }
  }
  if (sheet) q.set("sheet", sheet);
  if (sheet === "details" && game) q.set("game", game);
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeUrl(a) === routeUrl(b);
}

export { isClientPath } from "../../../../../../src/shared/clientRoutes.js";
