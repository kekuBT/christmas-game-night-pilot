// Stage 5.1 (Phase 4): measure what live drawing costs the server's storage,
// and check recovery. Linux only (reads /proc/<pid>/io, stat, status).
//   - A busy Draw & Guess turn at real pace: 120 stroke batches of 40 points
//     at 3 per second (4,800 of the 5,000-point cap), guessers guessing
//     wrong every 3 s, every player on its own WebSocket.
//   - For 4, 6 and 10 players: saves (write syscalls), bytes written, room
//     file size, server CPU time and memory, bytes each socket received.
//   - Restart: stop the server cleanly mid-turn, start it again on the same
//     data directory: the drawing is all there.
//   - Interrupted writes: SIGKILL the server at random moments while it is
//     saving stroke batches (5 times): the room always loads, as valid JSON,
//     with every acknowledged batch, and no stray temp file is mistaken for
//     a room.
// Usage: node scripts/measure-persistence.mjs [--out <file.json>]
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null;

function startServer(dataDir) {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: dataDir };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
  const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = setInterval(() => {
      const m = /on http:\/\/localhost:(\d+)/.exec(out);
      if (m) { clearInterval(poll); resolve({ srv, port: Number(m[1]), log: () => out }); }
      else if (Date.now() - t0 > 30000) { clearInterval(poll); reject(new Error(`server did not start: ${out.slice(-300)}`)); }
    }, 100);
  });
}
// The server is `node --import tsx …`; its /proc entry is that pid.
const proc = (pid) => {
  const io = Object.fromEntries(readFileSync(`/proc/${pid}/io`, "utf8").trim().split("\n").map((l) => { const [k, v] = l.split(":"); return [k.trim(), Number(v)]; }));
  const st = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
  const ticks = 100; // USER_HZ on Linux
  const cpuMs = ((Number(st[11]) + Number(st[12])) / ticks) * 1000;
  const rssKb = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1] ?? 0);
  return { syscw: io.syscw, wchar: io.wchar, writeBytes: io.write_bytes, cpuMs, rssKb };
};

function client(base) {
  return async function api(path, { token, body } = {}) {
    const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
    if (token) headers["x-session-token"] = token;
    const r = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
}
async function setup(api, n) {
  const room = await api("/rooms", { body: { name: "Persistence" } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: "P1", asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ playerId: h.playerId, token: h.recoveryToken }];
  for (let i = 2; i <= n; i++) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: `P${i}` } }); seats.push({ playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, seats };
}
const send = (api, room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
let strokeNo = 0;
function batch(points = 40) {
  // Two pieces of one finger stroke, as a phone sends them (flat x,y in 0..1000).
  const s = strokeNo++;
  const piece = (k) => ({ s, c: 1, w: 1, p: Array.from({ length: points }, (_, i) => [100 + ((i * 7 + k) % 800), 100 + ((i * 13 + k) % 800)]).flat() });
  return [piece(0)].map((x) => ({ ...x, p: x.p.slice(0, points * 2) }));
}
async function drawGame(api, room) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "draw-guess", official: false } });
  for (const s of room.seats) await send(api, room, s, gid, "briefing-ready", { ready: true });
  let drawer = null;
  for (const s of room.seats) { const g = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((x) => x.id === gid); if (g.state?.amDrawing) drawer = s; }
  return { gid, drawer };
}
const roomFile = (dir, roomId) => join(dir, readdirSync(dir).find((f) => f.startsWith(roomId) && f.endsWith(".json") && !f.includes(".book") && !f.includes(".tmp-")) ?? `${roomId}.json`);
const piecesNow = async (api, room, gid) => ((await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.find((g) => g.id === gid)?.state?.pieces ?? []).length;

const results = [];
try {
  // ---------------- busy turn, 4 / 6 / 10 players ----------------
  for (const n of [4, 6, 10]) {
    const dir = mkdtempSync(join(tmpdir(), "mz-persist-"));
    const { srv, port } = await startServer(dir);
    const base = `http://localhost:${port}`;
    const api = client(base);
    const room = await setup(api, n);
    const sockets = room.seats.map((s) => {
      const ws = new WebSocket(`ws://localhost:${port}/?roomId=${room.roomId}&audience=player`, [`cgn-session-${s.token}`]);
      const meta = { ws, bytes: 0, frames: 0 };
      ws.on("message", (d) => { meta.bytes += d.length; meta.frames += 1; });
      return meta;
    });
    await Promise.all(sockets.map((m) => new Promise((r) => m.ws.once("open", r))));
    const { gid, drawer } = await drawGame(api, room);
    const guessers = room.seats.filter((s) => s !== drawer);
    await sleep(500);
    for (const m of sockets) { m.bytes = 0; m.frames = 0; }
    // Each save renames a complete temp file over <room>.json: count those.
    let saves = 0;
    const watcher = watch(dir, (ev, f) => { if (ev === "rename" && f === `${room.roomId}.json`) saves++; });
    const before = proc(srv.pid);
    const t0 = Date.now();
    let acked = 0, guesses = 0;
    const BATCHES = 120;
    const guessTimer = setInterval(() => { for (const g of guessers) { send(api, room, g, gid, "draw-guess", { text: `wrong ${guesses++}` }).catch(() => {}); } }, 3000);
    for (let i = 0; i < BATCHES; i++) {
      const tick = Date.now();
      const r = await send(api, room, drawer, gid, "draw-strokes", { pieces: batch(40) });
      if (r.accepted) acked++;
      const wait = 333 - (Date.now() - tick);
      if (wait > 0) await sleep(wait);
    }
    clearInterval(guessTimer);
    await sleep(300);
    const after = proc(srv.pid);
    watcher.close();
    const secs = (Date.now() - t0) / 1000;
    const file = roomFile(dir, room.roomId);
    const size = statSync(file).size;
    const prevSize = (() => { try { return statSync(`${file}.prev`).size; } catch { return 0; } })();
    const compact = JSON.stringify(JSON.parse(readFileSync(file, "utf8"))).length;
    const pieces = await piecesNow(api, room, gid);
    const row = {
      players: n, seconds: Number(secs.toFixed(1)), batchesAcked: acked, guessesSent: guesses, piecesStored: pieces,
      roomSaves: saves,
      writeSyscalls: after.syscw - before.syscw,
      mbWriteAndSend: Number(((after.wchar - before.wchar) / 1e6).toFixed(1)),
      mbToDisk: Number(((after.writeBytes - before.writeBytes) / 1e6).toFixed(1)),
      roomFileKb: Math.round(size / 1024), prevFileKb: Math.round(prevSize / 1024), roomFileCompactKb: Math.round(compact / 1024),
      cpuMsPerSec: Math.round((after.cpuMs - before.cpuMs) / secs), cpuPct: Number((((after.cpuMs - before.cpuMs) / (secs * 1000)) * 100).toFixed(1)),
      rssMb: Math.round(after.rssKb / 1024),
      wsKbPerClient: Math.round(sockets.reduce((a, m) => a + m.bytes, 0) / sockets.length / 1024),
      wsFramesPerClient: Math.round(sockets.reduce((a, m) => a + m.frames, 0) / sockets.length),
    };
    results.push(row);
    check(`${n} players: every stroke batch was accepted and stored`, acked === BATCHES && pieces === BATCHES, JSON.stringify({ acked, pieces }));
    for (const m of sockets) m.ws.close();
    srv.kill("SIGTERM");
    await new Promise((r) => srv.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("\nPERSISTENCE TABLE (one busy drawing turn: 120 batches × 40 points at 3/s)");
  console.log("| players | seconds | batches | room saves (file replaced) | MB to disk (block writes) | MB through write/send syscalls (disk + network) | room file KB (as compact JSON) | .prev KB | server CPU % | RSS MB | WS KB per phone | WS frames per phone |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) console.log(`| ${r.players} | ${r.seconds} | ${r.batchesAcked} | ${r.roomSaves} | ${r.mbToDisk} | ${r.mbWriteAndSend} | ${r.roomFileKb} (${r.roomFileCompactKb}) | ${r.prevFileKb} | ${r.cpuPct} | ${r.rssMb} | ${r.wsKbPerClient} | ${r.wsFramesPerClient} |`);

  // ---------------- clean restart mid-turn ----------------
  {
    const dir = mkdtempSync(join(tmpdir(), "mz-persist-r-"));
    let s = await startServer(dir);
    let api = client(`http://localhost:${s.port}`);
    const room = await setup(api, 4);
    const { gid, drawer } = await drawGame(api, room);
    // Paced like a phone (the server allows 16 drawing messages per 2 s).
    for (let i = 0; i < 30; i++) { await send(api, room, drawer, gid, "draw-strokes", { pieces: batch(40) }); await sleep(150); }
    await sleep(2100);
    const beforeStop = await piecesNow(api, room, gid);
    s.srv.kill("SIGTERM"); await new Promise((r) => s.srv.once("exit", r));
    s = await startServer(dir);
    api = client(`http://localhost:${s.port}`);
    const afterStart = await piecesNow(api, room, gid);
    check("restart mid-turn: the whole drawing is back", afterStart === beforeStop && beforeStop === 30, JSON.stringify({ beforeStop, afterStart }));
    const more = await send(api, room, drawer, gid, "draw-strokes", { pieces: batch(40) });
    check("restart mid-turn: the drawer can keep drawing", more.accepted === true, JSON.stringify(more));
    s.srv.kill("SIGTERM"); await new Promise((r) => s.srv.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }

  // ---------------- SIGKILL while saving, 5 times ----------------
  {
    const dir = mkdtempSync(join(tmpdir(), "mz-persist-k-"));
    let s = await startServer(dir);
    let api = client(`http://localhost:${s.port}`);
    const room = await setup(api, 4);
    const { gid, drawer } = await drawGame(api, room);
    let acked = 0;
    for (let k = 0; k < 5; k++) {
      await sleep(2100); // the drawing rate limit (16 per 2 s) is part of the saved room
      // Fire batches without waiting, then kill at a random moment while they are being saved.
      const inflight = [];
      for (let i = 0; i < 6; i++) inflight.push(send(api, room, drawer, gid, "draw-strokes", { pieces: batch(10) }).then((r) => { if (r.accepted) acked++; }).catch(() => {}));
      await sleep(5 + Math.floor(Math.random() * 40));
      s.srv.kill("SIGKILL");
      await new Promise((r) => s.srv.once("exit", r));
      await Promise.allSettled(inflight);
      const file = roomFile(dir, room.roomId);
      let valid = false; try { JSON.parse(readFileSync(file, "utf8")); valid = true; } catch { valid = false; }
      s = await startServer(dir);
      api = client(`http://localhost:${s.port}`);
      const stored = await piecesNow(api, room, gid).catch(() => -1);
      check(`kill ${k + 1}: the room file is complete JSON and the room loads`, valid && stored >= 0, JSON.stringify({ valid, stored }));
      check(`kill ${k + 1}: every acknowledged batch survived (${acked} acknowledged, ${stored} stored)`, stored >= acked, JSON.stringify({ acked, stored }));
      acked = stored; // what the server has is the new baseline (unacknowledged ones may or may not have landed)
    }
    const tmps = readdirSync(dir).filter((f) => f.includes(".tmp-"));
    console.log(`  temp files left behind by the kills: ${tmps.length} (ignored on load, never read as a room)`);
    s.srv.kill("SIGTERM"); await new Promise((r) => s.srv.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }
} catch (e) {
  check("measurement ran to the end", false, String(e.message ?? e).split("\n")[0]);
}
if (OUT) writeFileSync(OUT, JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, results }, null, 2));
console.log(failures === 0 ? "PERSISTENCE MEASUREMENT ALL PASSED" : `PERSISTENCE MEASUREMENT FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
