/**
 * Stage 4 (S3-LOB-03): a reply that isn't the game's JSON (a proxy's HTML
 * page, a stopped preview) must never replace the room on screen. Before,
 * `get` turned any non-JSON 200 into `{}`, which became the projection and
 * blanked the app.
 */
import { describe, expect, it } from "vitest";
import { isOvertakenReply, isProjection, readJson } from "../apps/web/src/http.js";

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

describe("isOvertakenReply (Stage 4: a poll overtaken by a newer push)", () => {
  const shown = { roomId: "r1", seq: 40 };
  it("drops an older reply for the same room when a newer state was shown while it was in flight", () => {
    expect(isOvertakenReply({ roomId: "r1", seq: 37 }, shown, true)).toBe(true);
  });
  it("keeps it when nothing newer arrived in flight, even with a lower seq (a restored server never freezes the screen)", () => {
    expect(isOvertakenReply({ roomId: "r1", seq: 3 }, shown, false)).toBe(false);
  });
  it("keeps an equal or newer reply, another room's reply, and replies without a seq", () => {
    expect(isOvertakenReply({ roomId: "r1", seq: 40 }, shown, true)).toBe(false);
    expect(isOvertakenReply({ roomId: "r1", seq: 41 }, shown, true)).toBe(false);
    expect(isOvertakenReply({ roomId: "r2", seq: 1 }, shown, true)).toBe(false);
    expect(isOvertakenReply({ roomId: "r1" }, shown, true)).toBe(false);
    expect(isOvertakenReply({ roomId: "r1", seq: 1 }, null, true)).toBe(false);
  });
});
