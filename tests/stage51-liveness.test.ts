/**
 * Stage 5.1 (S5-AUD-04, S5-AUD-07): a screen knows when what it shows may be
 * stale. Polls can't hang forever; any frame from the server proves the link
 * is live (including a quiet room's "alive" frame); the watchdog reports a
 * stale episode once and its end once; API replies are never cached.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { fetchFresh, isStale, livenessStep, STALE_AFTER_MS } from "../apps/web/src/liveness.js";
import { ALIVE_MS, LocalServer } from "../src/server/http.js";

describe("liveness (client)", () => {
  it("stale only after the allowance; the watchdog reports each episode once, and its end once", () => {
    expect(isStale(1000, 1000 + STALE_AFTER_MS)).toBe(false);
    expect(isStale(1000, 1001 + STALE_AFTER_MS)).toBe(true);
    const st = { staleMarked: false };
    expect(livenessStep(st, 0, 1000)).toBeNull();
    expect(livenessStep(st, 0, STALE_AFTER_MS + 1)).toBe("went-stale");
    expect(livenessStep(st, 0, STALE_AFTER_MS + 5000)).toBeNull(); // still stale: said once
    expect(livenessStep(st, STALE_AFTER_MS + 6000, STALE_AFTER_MS + 6100)).toBe("back");
    expect(livenessStep(st, STALE_AFTER_MS + 6000, STALE_AFTER_MS + 6200)).toBeNull();
  });

  it("a poll that never answers fails after its timeout instead of hanging (and asks for no caching)", async () => {
    const seen: RequestInit[] = [];
    const hang = vi.fn((_: string, init: RequestInit) => {
      seen.push(init);
      return new Promise<Response>((_res, rej) => init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    });
    vi.stubGlobal("fetch", hang);
    try {
      const t0 = Date.now();
      await expect(fetchFresh("/rooms/x/projection?audience=player", {}, 50)).rejects.toThrow(/abort/i);
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(seen[0]!.cache).toBe("no-store");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("liveness (server)", () => {
  let server: LocalServer;
  let port = 0;
  beforeAll(async () => {
    server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-live-")) });
    port = await server.listen(0);
  });
  afterAll(async () => { await server.close(); });

  it("every open socket hears 'alive' (no room data in it), so a quiet room isn't mistaken for a dead link", async () => {
    expect(ALIVE_MS).toBeLessThan(STALE_AFTER_MS / 1.5);
    const room = await (await fetch(`http://127.0.0.1:${port}/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Alive" }) })).json() as { roomId: string; joinCode: string; hostClaimToken: string };
    const host = await (await fetch(`http://127.0.0.1:${port}/rooms/${room.roomId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: "Keku", asHost: true, hostClaimToken: room.hostClaimToken }) })).json() as { recoveryToken: string };
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${room.roomId}&audience=player`, [`cgn-session-${host.recoveryToken}`]);
    const frames: Record<string, unknown>[] = [];
    ws.on("message", (d) => frames.push(JSON.parse(String(d))));
    await new Promise<void>((r) => ws.once("open", () => r()));
    await vi.waitFor(() => expect(frames.some((f) => f["kind"] === "projection")).toBe(true));
    (server as unknown as { aliveTick: () => void }).aliveTick();
    await vi.waitFor(() => expect(frames.some((f) => f["kind"] === "alive")).toBe(true));
    const alive = frames.find((f) => f["kind"] === "alive")!;
    expect(Object.keys(alive).sort()).toEqual(["at", "kind"]);
    ws.close();
  });

  it("API replies say no-store: a projection is never served from a cache", async () => {
    const r = await fetch(`http://127.0.0.1:${port}/games`);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});
