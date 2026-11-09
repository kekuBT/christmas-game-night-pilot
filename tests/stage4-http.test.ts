/**
 * Stage 4 (S3-LOB-03): a reply that isn't the game's JSON (a proxy's HTML
 * page, a stopped preview) must never replace the room on screen. Before,
 * `get` turned any non-JSON 200 into `{}`, which became the projection and
 * blanked the app.
 */
import { describe, expect, it } from "vitest";
import { isProjection, readJson } from "../apps/web/src/http.js";

const res = (body: string, init: { status?: number; type?: string } = {}) =>
  new Response(body, { status: init.status ?? 200, headers: { "content-type": init.type ?? "application/json" } });

describe("readJson", () => {
  it("returns the JSON body of a successful reply", async () => {
    expect(await readJson(res('{"a":1}'))).toEqual({ a: 1 });
  });
  it("refuses an HTML page served with 200 (a stopped preview or a proxy page)", async () => {
    await expect(readJson(res("<html>Codespace stopped</html>", { type: "text/html" }))).rejects.toThrow(/unexpected reply/i);
  });
  it("refuses a body that isn't JSON even when labelled as JSON", async () => {
    await expect(readJson(res("<html>oops</html>"))).rejects.toThrow(/unexpected reply/i);
  });
  it("uses the server's own error message on an error status", async () => {
    await expect(readJson(res('{"error":"Room not found"}', { status: 404 }))).rejects.toThrow("Room not found");
  });
  it("says the status when an error reply carries no JSON", async () => {
    await expect(readJson(res("Bad gateway", { status: 502, type: "text/plain" }))).rejects.toThrow(/502/);
  });
});

describe("isProjection", () => {
  it("accepts a room projection", () => {
    expect(isProjection({ roomId: "r1", joinCode: "ABC123", players: [], games: [] })).toBe(true);
  });
  it("rejects an empty object, arrays, and objects without players or games", () => {
    for (const x of [{}, [], null, "x", { roomId: "r1" }, { roomId: "r1", players: [] }, { players: [], games: [] }]) expect(isProjection(x)).toBe(false);
  });
});
