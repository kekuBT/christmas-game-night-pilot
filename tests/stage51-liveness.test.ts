/**
 * Stage 5.1 (S5-AUD-04, S5-AUD-07): a screen knows when what it shows may be
 * stale. Polls can't hang forever; any frame from the server proves the link
 * is live (including a quiet room's "alive" frame); the watchdog reports a
 * stale episode once and its end once; API replies are never cached.
 */
import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { readJson, readSpectatorReply } from "../apps/web/src/http.js";
import { isStale, livenessStep, oneAtATime, pollFresh, STALE_AFTER_MS } from "../apps/web/src/liveness.js";
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
      await expect(pollFresh("/rooms/x/projection?audience=player", {}, (r) => readJson(r), 50)).rejects.toThrow(/did not answer|abort/i);
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(seen[0]!.cache).toBe("no-store");
      expect(seen[0]!.signal?.aborted).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("the one-at-a-time guard skips a call while one runs, and is released however the run ends", async () => {
    let calls = 0;
    let release!: () => void;
    const tick = oneAtATime(async () => { calls++; if (calls === 1) await new Promise<void>((r) => { release = r; }); else throw new Error("a failed poll"); });
    const first = tick();
    await tick(); // skipped: the first is still running
    expect(calls).toBe(1);
    release(); await first;
    await tick(); // runs, and throws inside
    expect(calls).toBe(2);
    await tick(); // the throw released the guard
    expect(calls).toBe(3);
  });
});

// Review of PR #4 (P2): fetch() resolves on the headers, so a timeout cleared
// there missed a reply whose body stalls part-way. A real loopback server
// sends the headers and "{", then nothing; every poll path must give up
// within its timeout, cancel the request, and let the next poll through.
describe("liveness: a reply whose body stalls part-way", () => {
  let server: Server;
  let base = "";
  let mode: "stall" | "ok" | "401" | "500" = "ok";
  const hits: string[] = [];
  const cancelled: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url ?? "";
      hits.push(`${mode} ${url}`);
      if (mode === "stall") {
        res.writeHead(200, { "content-type": "application/json" });
        res.flushHeaders();
        res.write("{");
        res.on("close", () => cancelled.push(url)); // the client gave up and closed it
        return;
      }
      if (mode === "401") { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "Spectator token required" })); return; }
      if (mode === "500") { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "boom" })); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ roomId: "r1", players: [], games: [] }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); });

  const phonePoll = (timeoutMs = 150) => pollFresh(`${base}/rooms/r1/projection?audience=player`, {}, (r) => readJson<unknown>(r), timeoutMs);
  const tvPoll = (timeoutMs = 150) => pollFresh(`${base}/rooms/r1/projection?audience=spectator`, {}, readSpectatorReply, timeoutMs);

  for (const [who, poll, audience] of [["phone", phonePoll, "player"], ["TV (spectator)", tvPoll, "spectator"]] as const) {
    it(`${who}: the poll fails within its timeout and the request is cancelled`, async () => {
      mode = "stall";
      const t0 = Date.now();
      await expect(poll()).rejects.toThrow(/did not answer|abort/i);
      expect(Date.now() - t0).toBeLessThan(2000);
      await vi.waitFor(() => expect(cancelled.some((u) => u.includes(`audience=${audience}`))).toBe(true));
    });

    it(`${who}: after a stalled poll times out, the guard lets the next poll through, and it succeeds`, async () => {
      const results: unknown[] = [];
      const tick = oneAtATime(async () => { try { results.push(await poll()); } catch (e) { results.push(`failed: ${(e as Error).message}`); } });
      mode = "stall";
      hits.length = 0;
      const first = tick();
      await tick(); // while the first is stuck: skipped, no second request
      await vi.waitFor(() => expect(hits.length).toBe(1));
      await first; // the stalled poll gives up at its timeout
      expect(String(results[0])).toMatch(/^failed: /);
      mode = "ok";
      await tick();
      expect(hits).toHaveLength(2);
      const ok = results[1] as { roomId?: string; kind?: string; body?: { roomId?: string } };
      expect(ok.roomId ?? ok.body?.roomId).toBe("r1");
    });
  }

  it("TV: a 401 still means the spectator session is gone, another error is skipped, JSON is the body", async () => {
    mode = "401"; expect(await tvPoll(1000)).toEqual({ kind: "expired" });
    mode = "500"; expect(await tvPoll(1000)).toEqual({ kind: "skip" });
    mode = "ok"; expect(await tvPoll(1000)).toEqual({ kind: "body", body: { roomId: "r1", players: [], games: [] } });
  });

  it("phone: an error status still reads as the server's error message", async () => {
    mode = "500";
    await expect(phonePoll(1000)).rejects.toThrow("boom");
    mode = "ok";
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
