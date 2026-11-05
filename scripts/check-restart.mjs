// Server-restart survival (Milestone K): a room, its game, and its
// players' state must survive a server restart, because a restart
// during a family night must not lose the room. HTTP-only: the
// restart path is server-side (snapshot persistence + restore), so no
// browser is needed here — the browser reconnect path is already
// covered by check-ws-reconnect (reload) and check-closest.
// Spawns its own server on a free port (3462–3464) with the shared
// data dir, so the test room is a real snapshot file; the driver
// deletes only its own room files afterwards.
// Usage: node scripts/check-restart.mjs
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
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
async function pickPort() {
  for (const port of [3462, 3463, 3464]) {
    try {
      const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) continue; // something already answers here
    } catch { return port; } // connection refused = free
  }
  return null;
}
function startServer(port) {
  const child = spawn("./node_modules/.bin/tsx", ["src/server/serve.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  return { child, getOutput: () => out };
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
  const headers = { "Content-Type": "application/json" };
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

const port = await pickPort();
if (!port) {
  console.log("FAIL no free port in 3462-3464 for the restart test server");
  process.exitCode = 1;
  process.exit(1);
}
let roomId = "";
let server = startServer(port);
try {
  check("test server starts", await waitUp(port));
  // Create a room and join two players.
  const created = await post(port, "/rooms", { name: "Restart Test" });
  check("room created", created.status === 201 && !!created.data.roomId && !!created.data.joinCode);
  roomId = created.data.roomId;
  const joinCode = created.data.joinCode;
  const host = await post(port, "/rooms/join-by-code", { joinCode, displayName: "Ada", asHost: true, hostClaimToken: created.data.hostClaimToken });
  check("host joined", host.status === 201 && host.data.isHost === true);
  const guest = await post(port, "/rooms/join-by-code", { joinCode, displayName: "Bea" });
  check("guest joined", guest.status === 201 && !!guest.data.playerId);
  // Start a practice Closest game and have the guest guess (state worth keeping).
  const started = await post(port, `/rooms/${roomId}/games`, { gameId: "closest-wins", official: false }, host.data.sessionToken);
  check("game started", started.status === 201 && started.data.status === "playing");
  const gameId = started.data.gameId;
  const guess = await post(port, `/rooms/${roomId}/intents`, {
    intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action: "closest-guess", payload: { value: 42 } },
  }, guest.data.sessionToken);
  check("guest guess accepted before restart", guess.status === 200 && guess.data.accepted === true);

  // Kill and respawn the server (the restart under test).
  check("server stopped", await stopServer(server));
  server = startServer(port);
  check("server restarted", await waitUp(port));

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

  // Reconnect with the original token restores the session.
  const recon = await post(port, `/rooms/${roomId}/reconnect`, { playerId: guest.data.playerId, recoveryToken: guest.data.recoveryToken });
  check("guest reconnects with the original token", recon.status === 200 && recon.data.connected === true);
  const proj2 = await getProj(port, roomId, guest.data.sessionToken);
  check("guest shows connected after reconnect",
    (proj2.data.players ?? []).find((p) => p.id === guest.data.playerId)?.connected === true);

  // A bad token must not take over the slot.
  const bad = await post(port, `/rooms/${roomId}/reconnect`, { playerId: guest.data.playerId, recoveryToken: "00".repeat(32) });
  check("bad recovery token is rejected", bad.status === 400);
} finally {
  await stopServer(server);
  // Test hygiene: delete only this room's snapshot files.
  for (const suffix of ["", ".book.json", ".claim.json"]) {
    const f = suffix === "" ? `data/${roomId}.json` : `data/${roomId}${suffix}`;
    if (roomId && existsSync(f)) unlinkSync(f);
  }
}
console.log(failures === 0 ? "RESTART ALL PASSED" : `RESTART FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
