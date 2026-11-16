// Beta R4 (handoff 6921505856): the W2 family-scale workload against an operator-supplied HTTPS target, with
// redacted evidence. Not a gate driver (it lives under scripts/beta/). Run from a checkout of this repository after
// `npm ci` (it uses the repository's `ws` package), on Node 22. It only ever talks to the one --origin given, and only
// through the app's public API, as a phone would.
//
//   node scripts/beta/w2-load.mjs --origin https://<service>.onrender.com --code-file <throwaway code> [options]
//
// What it does (R rooms, default 2; P players each, default 10; plus a TV each):
//   0. Preflight: GET /health must answer 200 with the expected revision (default 7097ac2…); the gate must admit the
//      throwaway code. A failure here stops the run (FAILED) before anything is created.
//   1. Setup: creates R casual rooms named "W2 <run id> <A|B…>", joins a host and P-1 players, and a TV (spectator);
//      opens every socket over wss:// with the gate cookie (a dropped socket reconnects, and is counted).
//   2. Trivia (Practice): everyone taps Ready; every player answers every question (about one a second, retrying a
//      failed attempt with the SAME clientEventId, which the server deduplicates). The game must finish.
//   3. Draw & Guess (Practice), while each host saves --notes Memory Book notes (default 5) citing the finished Trivia:
//      every turn, the drawer sends strokes (paced under the server's limit), then every guesser guesses. The game
//      must finish.
//   4. Persisted = read back from the authoritative state with a fresh request after the acknowledgement:
//      answers in each player's own projection (myAnswers), each turn's strokes in the projection (pieces) and its
//      correct guessers, notes in GET /rooms/:id/memory. (Durability on disk can't be seen from outside; the local
//      fixture checks it separately, and a restart is W4.)
//   5. Room isolation: each room carries a canary (in its notes) and its own player names; every WebSocket message and
//      every HTTP body read for one room is scanned for any other room's canary, room id and names. Actively: room
//      B's host token is tried on room A's projection, Memory Book and socket (all must be refused), and the reverse.
//
// The run FAILS on: a target failure (preflight, gate, setup, a game that doesn't finish, the time limit); any action
// not acknowledged within --ack-timeout-s (default 30) or rejected (accepted: false); anything acknowledged but not
// read back (persisted); any cross-room content or access; a socket not open at the end. Disconnects and reconnects are
// counted and reported.
//
// Cleanup: the app (7097ac2) has no supported way to delete a room, so the run deletes nothing. Its rooms stay in the
// THROWAWAY data folder of the validation install; nothing else on the target is touched.
//
// Options:
//   --origin URL            the target's public origin (https only)          --code-file FILE   the throwaway access code
//   --evidence DIR          default ./w2-evidence                            --expect-revision SHA  default 7097ac2…
//   --rooms N  --players N  --notes N                                        --max-minutes N    default 20
//   --ack-timeout-s N       default 30                                       --label key=value  operator identifiers to
//                                                                            record (deploy id, artifact SHA-256, …);
//                                                                            repeatable; never a secret
//   --plant-leak            SELF-TEST ONLY: room B's host saves a note carrying room A's canary, so the isolation
//                           check must fail. Never use it on a real run.
// For a local self-signed target, start Node with NODE_EXTRA_CA_CERTS=<that certificate>.
// Output: progress lines, a summary, "W2 PASSED" or "W2 FAILED" (exit 0 / 1), and the evidence JSON. Never printed or
// recorded: the code, the cookie, session/recovery/spectator tokens, host claim tokens, join codes.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const labels = Object.fromEntries(argv.flatMap((a, i) => (a === "--label" && argv[i + 1]?.includes("=") ? [argv[i + 1].split(/=(.*)/s).slice(0, 2)] : [])));
if (!opt("origin") || !opt("code-file")) { console.error("usage: node scripts/beta/w2-load.mjs --origin https://<service>.onrender.com --code-file <file> [options] (see the header)"); process.exit(2); }
const ORIGIN = new URL(opt("origin")).origin;
if (!ORIGIN.startsWith("https://")) { console.error("--origin must be https://"); process.exit(2); }
const WSS = ORIGIN.replace(/^https:/, "wss:");
const CODE = readFileSync(opt("code-file"), "utf8").trim();
const ROOMS = Number(opt("rooms", "2")), PLAYERS = Number(opt("players", "10")), NOTES = Number(opt("notes", "5"));
const MAX_MS = Number(opt("max-minutes", "20")) * 60_000, ACK_MS = Number(opt("ack-timeout-s", "30")) * 1000;
const EXPECT_REVISION = opt("expect-revision", "7097ac2bb062925bb296a129f4771f1e68fd522d");
const PLANT_LEAK = argv.includes("--plant-leak");
const RUN = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomBytes(3).toString("hex")}`;
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
const toolHash = createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");

const ev = {
  tool: "scripts/beta/w2-load.mjs", toolSha256: toolHash, node: process.version, runId: RUN, origin: ORIGIN,
  startedAt: new Date(T0).toISOString(), params: { rooms: ROOMS, players: PLAYERS, notes: NOTES, maxMinutes: MAX_MS / 60_000, ackTimeoutS: ACK_MS / 1000, plantLeak: PLANT_LEAK },
  operatorLabels: labels, target: {}, rooms: [], actions: [], sockets: [], isolation: { passiveHits: [], probes: [] }, checks: [], failures: [], notes: [],
  cleanup: "No supported room-deletion path exists in the app (7097ac2): this run deleted nothing. Its rooms stay in the target's throwaway data folder; nothing else was touched.",
};
const secrets = new Set([CODE]);
const redact = (s) => { let t = String(s); for (const x of secrets) if (x && x.length >= 6) t = t.split(x).join("<redacted>"); return t.replace(/cgn_beta=[^;,\s"]+/g, "cgn_beta=<redacted>"); };
const fail = (what) => { ev.failures.push(redact(what)); say(`FAIL ${redact(what)}`); };
const check = (name, ok, detail = "") => { ev.checks.push({ name, ok, detail: redact(detail) }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${redact(detail)}` : ""}`); if (!ok) ev.failures.push(redact(`${name}${detail ? `: ${detail}` : ""}`)); };
const overTime = () => Date.now() - T0 > MAX_MS;

// ---------- HTTP ----------
let cookie = "";
const roomOfPath = (p) => (/^\/rooms\/([^/?]+)/.exec(p) ?? [])[1];
async function call(method, path, body, token) {
  const r = await fetch(ORIGIN + path, {
    method, redirect: "manual", signal: AbortSignal.timeout(15_000),
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}), ...(token ? { "x-session-token": token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  scanText(text, roomOfPath(path), `HTTP ${method} ${path.replace(/\?.*$/, "")}`);
  let json = {}; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: json };
}
async function must(method, path, body, token) {
  const r = await call(method, path, body, token);
  if (r.status >= 300) throw new Error(`${method} ${path.replace(/\?.*$/, "")} answered ${r.status} ${redact(JSON.stringify(r.body)).slice(0, 160)}`);
  return r.body;
}

// ---------- isolation: what belongs to which room ----------
const markers = new Map(); // roomId -> { label, canary, names[] }
function scanText(text, roomId, where) {
  if (!roomId || !markers.has(roomId) || !text) return;
  for (const [other, m] of markers) {
    if (other === roomId) continue;
    const found = [m.canary, other, ...m.names].filter((x) => text.includes(x));
    if (found.length) ev.isolation.passiveHits.push({ inRoom: markers.get(roomId).label, where, foreignRoom: m.label, matched: found.map((x) => (x === m.canary ? "canary" : x === other ? "room id" : "player name")) });
  }
}

// ---------- actions with acknowledgement, idempotent retries and latency ----------
async function act(category, room, label, send) {
  const rec = { category, room: room.label, label, firstAt: Date.now() - T0, attempts: 0, ackMs: null, accepted: null, reason: null, persisted: null, lastError: null };
  ev.actions.push(rec);
  const t = Date.now();
  for (;;) {
    rec.attempts++;
    try {
      const r = await send();
      if (r.status === 200 || r.status === 201) {
        const accepted = r.body?.accepted ?? true;
        rec.accepted = !!accepted; rec.reason = accepted ? null : String(r.body?.reason ?? r.body?.code ?? "rejected");
        rec.ackMs = Date.now() - t; rec.result = r.body?.result;
        return rec;
      }
      rec.lastError = `HTTP ${r.status}`;
    } catch (e) { rec.lastError = String(e?.cause?.code ?? e?.name ?? e?.message ?? e).slice(0, 80); }
    if (Date.now() - t > ACK_MS || overTime()) return rec;
    await sleep(300);
  }
}
const intentBody = (room, gid, action, payload, id) => ({ intent: { kind: "intent", schemaVersion: 1, clientEventId: id, roomId: room.id, gameInstanceId: gid, action, payload } });
const sendIntent = (category, room, seat, gid, action, payload, label) => {
  const id = randomUUID();
  return act(category, room, label ?? `${seat.name} ${action}`, () => call("POST", `/rooms/${room.id}/intents`, intentBody(room, gid, action, payload, id), seat.token));
};

// ---------- sockets ----------
const sockets = [];
function openSocket(room, label, audience, protocol) {
  const rec = { room: room.label, label, opens: 0, unexpectedCloses: 0, reconnects: 0, messages: 0, open: false, errors: 0 };
  ev.sockets.push(rec);
  let stopped = false; let ws;
  const connect = () => {
    ws = new WebSocket(`${WSS}/?roomId=${room.id}&audience=${audience}`, protocol ? [protocol] : [], { headers: { cookie }, handshakeTimeout: 15_000 });
    ws.on("open", () => { rec.opens++; if (rec.opens > 1) rec.reconnects++; rec.open = true; });
    ws.on("message", (d) => { rec.messages++; scanText(String(d), room.id, `socket ${label}`); });
    ws.on("error", () => { rec.errors++; });
    ws.on("close", () => { rec.open = false; if (!stopped) { rec.unexpectedCloses++; setTimeout(() => { if (!stopped) connect(); }, 1000); } });
  };
  connect();
  const s = { rec, stop: () => { stopped = true; try { ws.terminate(); } catch { /* closed */ } } };
  sockets.push(s);
  return s;
}

// ---------- helpers ----------
const proj = (room, seat) => must("GET", `/rooms/${room.id}/projection?audience=player`, undefined, seat.token);
const gameOf = (p, gid) => (p.myGames ?? []).find((g) => g.id === gid);
async function startGame(room, gameId) {
  const g = await must("POST", `/rooms/${room.id}/games`, { gameId, official: false }, room.host.token);
  const readies = await Promise.all(room.seats.map((s) => sendIntent("ready", room, s, g.gameId, "briefing-ready", { ready: true }, `${s.name} ready (${gameId})`)));
  if (readies.some((r) => !r.accepted)) throw new Error(`${room.label}: not every player could tap Ready for ${gameId}`);
  for (let i = 0; i < 40; i++) { const st = gameOf(await proj(room, room.host), g.gameId)?.status; if (st === "playing") return g.gameId; await sleep(250); }
  throw new Error(`${room.label}: ${gameId} never started playing`);
}
async function waitFinished(room, gid, what, limitMs) {
  const until = Date.now() + limitMs;
  while (Date.now() < until && !overTime()) { if (gameOf(await proj(room, room.host), gid)?.status === "finished") return true; await sleep(1000); }
  return false;
}
const pct = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };

// =====================================================================================================================
const rooms = [];
try {
  // ---- 0. preflight ----
  const h = await fetch(ORIGIN + "/health", { signal: AbortSignal.timeout(15_000) }).then(async (r) => ({ status: r.status, body: await r.text() }));
  ev.target.health = { status: h.status, body: h.body.slice(0, 200) };
  let revision; try { revision = JSON.parse(h.body).revision; } catch { /* not JSON */ }
  ev.target.revision = revision ?? null;
  if (h.status !== 200 || revision !== EXPECT_REVISION) throw new Error(`preflight: /health answered ${h.status} with revision ${revision}, not ${EXPECT_REVISION}`);
  const g = await fetch(ORIGIN + "/beta/enter", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: CODE, next: "/" }) });
  const sc = g.headers.get("set-cookie") ?? "";
  if (g.status !== 303 || !sc.startsWith("cgn_beta=")) throw new Error(`preflight: the gate answered ${g.status} without a cookie`);
  cookie = sc.split(";")[0]; secrets.add(cookie.slice("cgn_beta=".length));
  say(`preflight: /health 200, revision ${revision}; the gate admitted the throwaway code (run ${RUN})`);

  // ---- 1. setup ----
  for (let r = 0; r < ROOMS; r++) {
    const L = String.fromCharCode(65 + r);
    const room = { label: L, canary: `W2CANARY-${RUN}-${L}-${randomBytes(4).toString("hex")}`, seats: [] };
    const created = await must("POST", "/rooms", { name: `W2 ${RUN} ${L}`, kind: "casual" });
    room.id = created.roomId; secrets.add(created.joinCode); secrets.add(created.hostClaimToken);
    const names = Array.from({ length: PLAYERS }, (_, i) => `W2-${L}-P${String(i + 1).padStart(2, "0")}-${RUN.slice(-6)}`);
    markers.set(room.id, { label: L, canary: room.canary, names });
    const host = await must("POST", `/rooms/${room.id}/join`, { displayName: names[0], asHost: true, hostClaimToken: created.hostClaimToken });
    room.seats.push({ name: names[0], token: host.sessionToken, playerId: host.playerId });
    for (let p = 1; p < PLAYERS; p++) {
      const pl = await must("POST", "/rooms/join-by-code", { joinCode: created.joinCode, displayName: names[p] });
      room.seats.push({ name: names[p], token: pl.sessionToken, playerId: pl.playerId });
    }
    for (const s of room.seats) { secrets.add(s.token); }
    room.host = room.seats[0];
    const tv = await must("POST", "/rooms/spectate-by-code", { joinCode: created.joinCode });
    const tvToken = tv.spectatorToken ?? tv.token; secrets.add(tvToken);
    for (const s of room.seats) openSocket(room, s.name, s === room.host ? "host" : "player", `cgn-session-${s.token}`);
    openSocket(room, `TV-${L}`, "spectator", `cgn-spectator-${tvToken}`);
    rooms.push(room);
    ev.rooms.push({ label: L, roomId: room.id, players: room.seats.map((s) => ({ name: s.name, playerId: s.playerId })) });
  }
  for (let i = 0; i < 80 && sockets.some((s) => !s.rec.open); i++) await sleep(250);
  const openNow = sockets.filter((s) => s.rec.open).length;
  if (openNow !== sockets.length) throw new Error(`setup: only ${openNow} of ${sockets.length} sockets opened`);
  say(`setup: ${ROOMS} rooms × ${PLAYERS} players + a TV each; ${sockets.length} sockets open over wss://`);

  // ---- 2. Trivia ----
  await Promise.all(rooms.map(async (room) => {
    room.triviaId = await startGame(room, "trivia");
    const p = await proj(room, room.host);
    room.questions = gameOf(p, room.triviaId).state.questions.map((q) => q.id);
  }));
  say(`trivia: playing in every room (${rooms[0].questions.length} questions each); answering`);
  await Promise.all(rooms.flatMap((room) => room.seats.map(async (s, i) => {
    await sleep(i * 53);
    for (const [k, qid] of room.questions.entries()) {
      const choice = (i + k) % 4;
      const rec = await sendIntent("answer", room, s, room.triviaId, "trivia-answer", { questionId: qid, chosenIndex: choice }, `${s.name} ${qid}`);
      rec.expect = { player: s.playerId, questionId: qid, choice };
      await sleep(700 + ((i * 131 + k * 17) % 500));
    }
  })));
  for (const room of rooms) {
    const done = await waitFinished(room, room.triviaId, "trivia", 7 * 60_000);
    check(`room ${room.label}: Trivia finished`, done);
  }
  // Persisted: each player's own answers, read back.
  for (const room of rooms) for (const s of room.seats) {
    // Trivia keeps a player's answers in its own state (questionId -> chosen index); the generic myAnswers is for other games.
    const g = gameOf(await proj(room, s), room.triviaId);
    const mine = g?.state?.myAnswers ?? g?.myAnswers ?? {};
    // Player ids are per room (player-1, player-2, …), so the room is part of the match.
    for (const rec of ev.actions.filter((a) => a.category === "answer" && a.room === room.label && a.expect?.player === s.playerId)) {
      rec.persisted = rec.accepted === true && mine[rec.expect.questionId] === rec.expect.choice;
    }
  }
  say("trivia: finished in every room; answers read back");

  // ---- 3. Draw & Guess, with Memory Book notes alongside ----
  const notesDone = Promise.all(rooms.map(async (room, r) => {
    for (let n = 0; n < NOTES; n++) {
      const text = `W2 note ${n + 1} from room ${room.label} ${room.canary}`;
      const requestId = randomUUID();
      const rec = await act("note", room, `${room.label} note ${n + 1}`, () => call("POST", `/rooms/${room.id}/memory`, { text, day: 1, requestId, fromGame: room.triviaId }, room.host.token));
      rec.expect = { text };
      await sleep(1500 + r * 200);
    }
    if (PLANT_LEAK && room.label === "B") {
      const other = rooms.find((x) => x.label === "A");
      const rec = await act("note", room, "B planted note (SELF-TEST: carries room A's canary)", () => call("POST", `/rooms/${room.id}/memory`, { text: `planted ${other.canary}`, day: 1, requestId: randomUUID(), fromGame: room.triviaId }, room.host.token));
      rec.expect = { text: `planted ${other.canary}` };
      ev.notes.push("SELF-TEST --plant-leak: room B saved a note carrying room A's canary; the isolation check must fail.");
    }
  }));
  await Promise.all(rooms.map(async (room) => {
    room.drawId = await startGame(room, "draw-guess");
    const byId = new Map(room.seats.map((s) => [s.playerId, s]));
    let lastTurn = -1;
    while (!overTime()) {
      const st = gameOf(await proj(room, room.host), room.drawId);
      if (!st || st.status === "finished") break;
      const v = st.state;
      if (v.phase !== "draw" || v.turn === lastTurn) { await sleep(400); continue; }
      lastTurn = v.turn;
      const drawer = byId.get(v.drawerId);
      const word = gameOf(await proj(room, drawer), room.drawId)?.state?.myWord;
      if (!drawer || !word) { fail(`room ${room.label} turn ${v.turn + 1}: the drawer or the word was not found`); break; }
      // Strokes: 8 messages of 3 pieces (6 points each), one every 250 ms (8 per 2 s, under the server's 16).
      let ackedPieces = 0;
      for (let m = 0; m < 8; m++) {
        const pieces = [0, 1, 2].map((j) => ({ s: m * 3 + j, c: (m + j) % 8, w: j % 3, p: Array.from({ length: 12 }, (_, k) => (100 + m * 90 + j * 30 + k * 7) % 1000) }));
        const rec = await sendIntent("stroke", room, drawer, room.drawId, "draw-strokes", { pieces }, `${room.label} turn ${v.turn + 1} strokes ${m + 1}`);
        rec.expect = { turn: v.turn, pieces: 3 };
        if (rec.accepted) ackedPieces += 3;
        await sleep(250);
      }
      // Persisted: the turn's drawing, read back.
      const after = gameOf(await proj(room, room.host), room.drawId)?.state;
      const seen = after && after.turn === v.turn ? (after.pieces ?? []).length : -1;
      for (const rec of ev.actions.filter((a) => a.category === "stroke" && a.room === room.label && a.expect?.turn === v.turn)) rec.persisted = rec.accepted === true && seen === ackedPieces;
      // Guesses: every guesser, at once.
      const guessers = room.seats.filter((s) => s !== drawer);
      const recs = await Promise.all(guessers.map((s) => sendIntent("guess", room, s, room.drawId, "draw-guess", { text: word }, `${room.label} turn ${v.turn + 1} ${s.name} guess`)));
      const now = gameOf(await proj(room, room.host), room.drawId)?.state;
      const correct = now && now.turn === v.turn ? new Set((now.correct ?? []).map((c) => c.playerId)) : new Set();
      recs.forEach((rec, i) => { rec.expect = { turn: v.turn }; rec.persisted = rec.accepted === true && rec.result?.correct === true && correct.has(guessers[i].playerId); });
    }
    const done = await waitFinished(room, room.drawId, "draw", 3 * 60_000);
    check(`room ${room.label}: Draw & Guess finished (${lastTurn + 1} turns)`, done);
  }));
  await notesDone;
  for (const room of rooms) {
    const book = await must("GET", `/rooms/${room.id}/memory`, undefined, room.host.token);
    const texts = new Set((Array.isArray(book) ? book : book.entries ?? []).map((e) => e.text));
    for (const rec of ev.actions.filter((a) => a.category === "note" && a.room === room.label)) rec.persisted = rec.accepted === true && texts.has(rec.expect.text);
  }
  say("draw & guess and Memory Book: done; strokes, guesses and notes read back");

  // ---- 5. active isolation probes ----
  for (const a of rooms) for (const b of rooms) {
    if (a === b) continue;
    const p1 = await call("GET", `/rooms/${a.id}/projection?audience=player`, undefined, b.host.token);
    const p2 = await call("GET", `/rooms/${a.id}/memory`, undefined, b.host.token);
    const w = await new Promise((resolve) => {
      const ws = new WebSocket(`${WSS}/?roomId=${a.id}&audience=player`, [`cgn-session-${b.host.token}`], { headers: { cookie }, handshakeTimeout: 15_000 });
      let first = null;
      ws.on("message", (d) => { first = String(d).slice(0, 40); ws.terminate(); resolve(`message: ${first.includes("projection") ? "projection" : "other"}`); });
      ws.on("close", (code) => resolve(`closed ${code}`));
      ws.on("unexpected-response", (_q, res) => resolve(`refused ${res.statusCode}`));
      ws.on("error", () => resolve("error"));
      setTimeout(() => { ws.terminate(); resolve("timeout"); }, 15_000);
    });
    const refused = p1.status !== 200 && p2.status !== 200 && !/projection/.test(w);
    ev.isolation.probes.push({ token: `room ${b.label} host`, target: `room ${a.label}`, projection: p1.status, memory: p2.status, socket: w, refused });
  }

  // ---- 6. settle and stop sockets ----
  await sleep(1500);
} catch (e) {
  fail(`run aborted: ${e?.message ?? e}`);
} finally {
  const openAtEnd = sockets.filter((s) => s.rec.open).length;
  for (const s of sockets) s.stop();
  ev.finishedAt = new Date().toISOString(); ev.durationS = Math.round((Date.now() - T0) / 1000);
  if (overTime()) fail(`the run exceeded --max-minutes ${MAX_MS / 60_000}`);

  // ---- summary ----
  const cats = ["ready", "answer", "stroke", "guess", "note"];
  ev.summary = {};
  for (const c of cats) {
    const xs = ev.actions.filter((a) => a.category === c);
    const acked = xs.filter((a) => a.accepted === true);
    const lat = acked.map((a) => a.ackMs);
    ev.summary[c] = {
      sent: xs.length, acknowledged: acked.length, rejected: xs.filter((a) => a.accepted === false).length,
      unacknowledged: xs.filter((a) => a.accepted === null).length, retried: xs.filter((a) => a.attempts > 1).length,
      persisted: c === "ready" ? null : xs.filter((a) => a.persisted === true).length,
      ackMedianMs: pct(lat, 0.5), ackP95Ms: pct(lat, 0.95), ackMaxMs: lat.length ? Math.max(...lat) : null,
    };
  }
  ev.summary.sockets = { total: ev.sockets.length, openAtEnd, unexpectedCloses: ev.sockets.reduce((n, s) => n + s.unexpectedCloses, 0), reconnects: ev.sockets.reduce((n, s) => n + s.reconnects, 0), errors: ev.sockets.reduce((n, s) => n + s.errors, 0), messages: ev.sockets.reduce((n, s) => n + s.messages, 0) };
  console.log("\n--- summary ---");
  for (const c of cats) { const s = ev.summary[c]; console.log(`${c.padEnd(6)} sent ${s.sent}, acknowledged ${s.acknowledged}, rejected ${s.rejected}, unacknowledged ${s.unacknowledged}, retried ${s.retried}${s.persisted === null ? "" : `, persisted ${s.persisted}`}; ack median ${s.ackMedianMs ?? "—"} ms, p95 ${s.ackP95Ms ?? "—"} ms, max ${s.ackMaxMs ?? "—"} ms`); }
  const so = ev.summary.sockets;
  console.log(`sockets ${so.total}: open at the end ${so.openAtEnd}, unexpected closes ${so.unexpectedCloses}, reconnects ${so.reconnects}, errors ${so.errors}, messages received ${so.messages}`);

  // ---- verdict ----
  if (ev.rooms.length === ROOMS) {
    for (const c of ["answer", "stroke", "guess", "note"]) {
      const s = ev.summary[c];
      check(`${c}: every action acknowledged and accepted`, s.sent > 0 && s.acknowledged === s.sent, `${s.acknowledged}/${s.sent}; rejected ${s.rejected}, unacknowledged ${s.unacknowledged}`);
      check(`${c}: every acknowledged action read back from the authoritative state`, s.sent > 0 && s.persisted === s.acknowledged, `${s.persisted}/${s.acknowledged}`);
    }
    const ready = ev.summary.ready;
    check("ready: every Ready acknowledged", ready.sent > 0 && ready.acknowledged === ready.sent, `${ready.acknowledged}/${ready.sent}`);
    check("rooms isolated: no other room's canary, room id or player name in any socket message or HTTP body", ev.isolation.passiveHits.length === 0, ev.isolation.passiveHits.length ? `${ev.isolation.passiveHits.length} hit(s), first: ${JSON.stringify(ev.isolation.passiveHits[0])}` : "0 hits");
    check("rooms isolated: one room's host token is refused on the other room's projection, Memory Book and socket", ev.isolation.probes.length === ROOMS * (ROOMS - 1) && ev.isolation.probes.every((p) => p.refused), ev.isolation.probes.map((p) => `${p.token} → ${p.target}: ${p.projection}/${p.memory}/${p.socket}`).join("; "));
    check("every socket open at the end", openAtEnd === ev.sockets.length, `${openAtEnd}/${ev.sockets.length}`);
  }
  for (const a of ev.actions) delete a.result;
  const unacked = ev.actions.filter((a) => a.accepted !== true).slice(0, 20);
  if (unacked.length) ev.notes.push(`first actions without an accepted acknowledgement: ${unacked.map((a) => `${a.label} (${a.reason ?? a.lastError})`).join("; ")}`);
  const notPersisted = ev.actions.filter((a) => a.accepted === true && a.persisted === false).slice(0, 20);
  if (notPersisted.length) ev.notes.push(`first acknowledged actions NOT read back: ${notPersisted.map((a) => a.label).join("; ")}`);
  ev.verdict = ev.failures.length ? "FAILED" : "PASSED";
  const dir = opt("evidence", "w2-evidence");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `w2-${RUN}.json`);
  const out = redact(JSON.stringify(ev, null, 1));
  writeFileSync(file, out + "\n");
  console.log(`evidence: ${file}`);
  console.log(`W2 ${ev.verdict}${ev.failures.length ? ` (${ev.failures.length} failure(s))` : ""}`);
  process.exit(ev.failures.length ? 1 : 0);
}
