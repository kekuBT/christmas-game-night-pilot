// Server-restart survival (Milestone K): a room, its game, and its
// players' state must survive a server restart, because a restart
// during a family night must not lose the room. HTTP-only: the
// restart path is server-side (snapshot persistence + restore), so no
// browser is needed here — the browser reconnect path is already
// covered by check-ws-reconnect (reload) and check-closest.
// Spawns its own server (OS-assigned free port) on its own temporary
// data dir, so the test room is a real snapshot file that no other run
// or developer room can collide with; the temp dir is removed afterwards.
// Usage: node scripts/check-restart.mjs
import { PROTOCOL_HEADERS } from "./lib/protocol.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function waitUp(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-restart-"));
// Start the real server on PORT=0 and read the port it actually bound
// from its startup line. `node --import tsx` works on every platform
// (the old ./node_modules/.bin/tsx path did not exist on Windows).
async function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  let port = null;
  for (let i = 0; i < 120 && port === null && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) port = Number(m[1]); else await sleep(250);
  }
  return { child, port, getOutput: () => out };
}
async function stopServer(proc) {
  proc.child.kill("SIGTERM");
  for (let i = 0; i < 20; i++) {
    if (proc.child.exitCode !== null || proc.child.signalCode !== null) return true;
    await sleep(250);
  }
  proc.child.kill("SIGKILL");
  return false;
}
async function post(port, path, body, token) {
  const headers = { "Content-Type": "application/json", ...PROTOCOL_HEADERS };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`http://localhost:${port}${path}`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
async function getProj(port, roomId, token) {
  const r = await fetch(`http://localhost:${port}/rooms/${roomId}/projection?audience=player`, {
    headers: { "x-session-token": token },
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

let server = await startServer();
let port = server.port;
try {
  check("test server starts", port !== null && await waitUp(port), port === null ? server.getOutput().slice(0, 300) : "");
  // Create a room and join two players.
  const created = await post(port, "/rooms", { name: "Restart Test" });
  check("room created", created.status === 201 && !!created.data.roomId && !!created.data.joinCode);
  const roomId = created.data.roomId;
  const joinCode = created.data.joinCode;
  const host = await post(port, "/rooms/join-by-code", { joinCode, displayName: "Ada", asHost: true, hostClaimToken: created.data.hostClaimToken });
  check("host joined", host.status === 201 && host.data.isHost === true);
  const guest = await post(port, "/rooms/join-by-code", { joinCode, displayName: "Bea" });
  check("guest joined", guest.status === 201 && !!guest.data.playerId);
  // Start a practice Closest game and have the guest guess (state worth keeping).
  const started = await post(port, `/rooms/${roomId}/games`, { gameId: "closest-wins", official: false }, host.data.sessionToken);
  // D3: a new room opens the game with its rules briefing; both players tap
  // I'm ready (their own intents) and the last Ready starts play.
  check("game started (its briefing opens first)", started.status === 201 && started.data.status === "briefing");
  const gameId = started.data.gameId;
  for (const p of [host, guest]) {
    const r = await post(port, `/rooms/${roomId}/intents`, {
      intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action: "briefing-ready", payload: { ready: true } },
    }, p.data.sessionToken);
    check(`${p === host ? "host" : "guest"} taps I'm ready`, r.status === 200 && r.data.accepted === true);
  }
  const playing = await getProj(port, roomId, host.data.sessionToken);
  check("everyone ready: the game is playing", (playing.data.games ?? []).find((g) => g.id === gameId)?.status === "playing");
  const guess = await post(port, `/rooms/${roomId}/intents`, {
    intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action: "closest-guess", payload: { value: 42 } },
  }, guest.data.sessionToken);
  check("guest guess accepted before restart", guess.status === 200 && guess.data.accepted === true);

  // Kill and respawn the server (the restart under test).
  check("server stopped", await stopServer(server));
  server = await startServer();
  port = server.port;
  check("server restarted", port !== null && await waitUp(port));

  // The room, the game, and the guess must all survive; everyone is
  // disconnected after a restart (snapshot restore marks them so).
  const proj = await getProj(port, roomId, host.data.sessionToken);
  check("projection answers after restart (token still valid)", proj.status === 200);
  const game = (proj.data.games ?? []).find((g) => g.id === gameId);
  check("game still playing after restart", game?.status === "playing");
  const players = proj.data.players ?? [];
  check("players marked disconnected after restart",
    players.length === 2 && players.every((p) => p.connected === false));
  const guestProj = await getProj(port, roomId, guest.data.sessionToken);
  const myGame = (guestProj.data.myGames ?? []).find((g) => g.id === gameId);
  check("guest guess survived the restart", myGame?.state?.myGuess === 42);

  // Reconnect with the original token restores the session. Sprint 2:
  // the credential check alone is not presence (no phantom "connected"
  // player without a device); the app's live socket is.
  const recon = await post(port, `/rooms/${roomId}/reconnect`, { playerId: guest.data.playerId, recoveryToken: guest.data.recoveryToken });
  check("guest reconnects with the original token", recon.status === 200 && recon.data.playerId === guest.data.playerId);
  const projNoSocket = await getProj(port, roomId, guest.data.sessionToken);
  check("credential check alone does not fake presence",
    (projNoSocket.data.players ?? []).find((p) => p.id === guest.data.playerId)?.connected === false);
  const ws = new WebSocket(`ws://localhost:${port}/?roomId=${roomId}&audience=player`, [`cgn-session-${guest.data.sessionToken}`]);
  await new Promise((resolve, reject) => { ws.onmessage = resolve; ws.onclose = (e) => reject(new Error(`socket closed ${e.code}`)); });
  const proj2 = await getProj(port, roomId, guest.data.sessionToken);
  check("guest shows connected once their device reconnects",
    (proj2.data.players ?? []).find((p) => p.id === guest.data.playerId)?.connected === true);
  ws.close();

  // A bad token must not take over the slot.
  const bad = await post(port, `/rooms/${roomId}/reconnect`, { playerId: guest.data.playerId, recoveryToken: "00".repeat(32) });
  check("bad recovery token is rejected", bad.status === 400);
} finally {
  await stopServer(server);
  rmSync(DATA_DIR, { recursive: true, force: true });
}
console.log(failures === 0 ? "RESTART ALL PASSED" : `RESTART FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
