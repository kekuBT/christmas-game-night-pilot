// Stage 10.4 (D-S104-05): the server shuts down in bounded time whatever its clients do. The full gate on c634500
// failed check-tv-outage's "the driver's server exits within 20 s of SIGTERM" (an earlier gate, 20261112-064509, hung
// at the same step). close() sent each tracked socket a close frame and then waited for the WebSocket server and the
// HTTP server to close, which waits for every client to finish its close handshake. A client that never answers is only
// destroyed by ws's own 30-second close timeout, and a socket refused at the door was never tracked at all.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { LocalServer } from "../src/server/http.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A client that connects and then never reads again: it never answers the server's close frame. */
async function deafClient(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => { ws.once("open", () => resolve()); ws.once("error", reject); });
  (ws as unknown as { _socket: { pause(): void } })._socket.pause();
  return ws;
}

describe("LocalServer.close(): bounded, whatever the clients do", () => {
  let dir = "";
  const clients: WebSocket[] = [];
  afterEach(() => { for (const c of clients.splice(0)) c.terminate(); if (dir) rmSync(dir, { recursive: true, force: true }); });

  async function server() {
    dir = mkdtempSync(join(tmpdir(), "mz-shutdown-"));
    const s = new LocalServer({ dataDir: dir, heartbeatMs: null, lifecycleSweepMs: null });
    const port = await s.listen(0);
    const r = await fetch(`http://localhost:${port}/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Shutdown night", kind: "casual" }) });
    const room = (await r.json()) as { roomId: string };
    return { s, port, roomId: room.roomId };
  }
  const closesWithin = async (s: LocalServer, ms: number) => Promise.race([s.close().then(() => "closed"), sleep(ms).then(() => "still waiting")]);

  it("a TV socket that never answers the close frame doesn't hold the server open", async () => {
    const { s, port, roomId } = await server();
    clients.push(await deafClient(`ws://localhost:${port}/?roomId=${roomId}&audience=tv`));
    const t0 = Date.now();
    expect(await closesWithin(s, 5000)).toBe("closed");
    expect(Date.now() - t0).toBeLessThan(4000);
  }, 15000);

  it("a socket refused at the door (no such room), still closing, doesn't hold it open either", async () => {
    const { s, port } = await server();
    const refused = new WebSocket(`ws://localhost:${port}/?roomId=no-such-room&audience=tv`);
    clients.push(refused);
    await new Promise<void>((resolve) => refused.once("upgrade", (res) => { res.socket.pause(); resolve(); }));
    await sleep(100);
    expect(await closesWithin(s, 5000)).toBe("closed");
  }, 15000);

  it("well-behaved clients still get a close frame first (a polite goodbye, not a cut)", async () => {
    const { s, port, roomId } = await server();
    const tv = new WebSocket(`ws://localhost:${port}/?roomId=${roomId}&audience=tv`);
    clients.push(tv);
    await new Promise<void>((resolve) => tv.once("open", () => resolve()));
    const code = new Promise<number>((resolve) => tv.once("close", (c) => resolve(c)));
    expect(await closesWithin(s, 5000)).toBe("closed");
    expect(await code).not.toBe(1006); // 1006 = the connection was cut without a close frame
  }, 15000);
});
