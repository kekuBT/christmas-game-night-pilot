// Beta R4 (handoff 6921505856; repaired for reviews 6922818863 and 6924352924): the W2 family-scale workload against an
// operator-supplied HTTPS target, with redacted evidence. Not a gate driver (it lives under scripts/beta/). Run from a
// checkout of this repository after `npm ci` (it uses the repository's `ws` package), on Node 22.
// ONE ORIGIN ONLY: every request, HTTP and WebSocket, authenticated or not, goes to the --origin given, through the
// app's public API, as a phone would. Redirects are never followed (fetch redirect "manual", ws followRedirects false):
// a 3xx is an answer, not a hop. The runner has NO fault-injection options; deliberate faults for its self-test live in
// the disposable local harness (scripts/beta/render-like-proxy.mjs). Options are checked before the code file is read
// and before any network activity: an unknown or reduced option exits 2 having touched nothing.
//
//   node scripts/beta/w2-load.mjs --origin https://<service>.onrender.com --code-file <throwaway code> [options]
//
// The workload is FIXED (scripts/beta/w2-verdict.mjs W2_SHAPE, for the pinned release 7097ac2): 2 rooms x 10 players
// plus a TV each; there is no smaller or "smoke" mode, and --rooms/--players/--notes are refused.
//   0. Preflight: GET /health must answer 200 with revision 7097ac2…; the gate must admit the throwaway code. A failure
//      here stops the run (FAILED) before anything is created.
//   1. Setup: creates rooms A and B ("W2 <run id> <A|B>"), joins a host and 9 players, and a TV (spectator) in each;
//      opens all 22 sockets over wss:// with the gate cookie (a dropped socket reconnects, and is counted).
//   2. Trivia (Practice, 10 questions): everyone taps Ready; every player answers every question (about one a second,
//      retrying a failed attempt with the SAME clientEventId, which the server deduplicates). The game must finish.
//   3. Draw & Guess (Practice, 6 turns), while each host saves 5 Memory Book notes citing the finished Trivia: every
//      turn, the drawer sends 8 stroke messages of 3 pieces (paced under the server's limit; the pieces are distinct
//      per room, turn and message), then every guesser guesses. The game must finish.
//   4. Persisted = read back from the authoritative state with a fresh request after the acknowledgement: each
//      player's own Trivia answers; each turn's drawing, batch by batch (each acknowledged message's stroke ids, in
//      order, with a digest of its normalized pieces; nothing duplicated, nothing nobody sent); each turn's correct
//      guessers; the notes in GET /rooms/:id/memory. (Durability on disk can't be seen from outside; the local fixture
//      checks it separately with scripts/beta/w2-disk-check.mjs, and a restart is W4.)
//   5. Room isolation: each room carries a canary (in its notes) and its own player names; every WebSocket message and
//      every HTTP body read for one room is scanned for the other room's canary, room id and names, and every socket
//      must receive at least one projection of its own room. Actively, in BOTH directions: one room's host token is
//      tried on the other room's projection, Memory Book and socket. Only the app's own denial counts as refused:
//      HTTP 401 {"error":"Session token required"} on both reads, and the socket closed 1008 with that reason before
//      any message. A 5xx, a 404, a gate or proxy answer, a timeout, a transport error or any socket message makes the
//      probe inconclusive, and the run FAILS.
// An acknowledgement must be well formed: HTTP 200 with a boolean `accepted` for an intent, 200/201 with the saved entry
// (its id and exactly our text) for a note. Anything else is retried with the same id until --ack-timeout-s, then counts
// as unacknowledged.
//
// The run FAILS on (scripts/beta/w2-verdict.mjs verdictChecks): a target failure (preflight, gate, setup, the time
// limit); a workload that isn't exactly the specified one (rooms, seats, TVs, sockets, 10 questions, 6 turns, and every
// expected action per room: 20 Ready, 100 answers, 48 stroke messages, 54 guesses, 5 notes); any action not acknowledged
// and accepted; anything acknowledged but not read back; any cross-room content; a socket without its own projection;
// any probe leg not refused by the app; a socket not open at the end. Disconnects and reconnects are counted.
//
// Cleanup: the app (7097ac2) has no supported way to delete a room, so the run deletes nothing. Its rooms stay in the
// THROWAWAY data folder of the validation install; nothing else on the target is touched.
//
// Options:
//   --origin URL            the target's public origin (https only)          --code-file FILE   the throwaway access code
//   --evidence DIR          default ./w2-evidence                            --max-minutes N    default 20
//   --ack-timeout-s N       default 30                                       --label key=value  operator identifiers to
//                                                                            record (deploy id, artifact SHA-256, …);
//                                                                            repeatable; never a secret
// For a local self-signed target, start Node with NODE_EXTRA_CA_CERTS=<that certificate>.
// Output: progress lines, a summary, the checks, then "W2 PASSED" (exit 0) or "W2 FAILED" (exit 1); bad options exit 2
// before anything else happens. Never printed or recorded: the code, the cookie, session/recovery/spectator tokens, host
// claim tokens, join codes.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";
import {
  APP_DENIAL, PINNED_REVISION, ROOM_LABELS, W2_SHAPE, batchOf, intentAck, matchStrokes, noteAck, strokePieces, verdictChecks,
} from "./w2-verdict.mjs";

const argv = process.argv.slice(2);
// The whole option check happens here, before the code file is read and before any network activity (review 6924352924).
const VALUED = new Set(["origin", "code-file", "evidence", "max-minutes", "ack-timeout-s", "label"]);
for (let i = 0; i < argv.length; i++) {
  const m = /^--([a-z-]+)$/.exec(argv[i]);
  if (!m) { console.error(`w2-load: unexpected argument ${JSON.stringify(argv[i].slice(0, 40))}`); process.exit(2); }
  if (["rooms", "players", "notes"].includes(m[1])) { console.error(`w2-load: --${m[1]} is not accepted: W2's workload is fixed (${W2_SHAPE.rooms} rooms × ${W2_SHAPE.playersPerRoom} players + a TV each, ${W2_SHAPE.notesPerRoom} notes per room), so a reduced run can't be taken for acceptance`); process.exit(2); }
  if (!VALUED.has(m[1]) || argv[i + 1] === undefined || argv[i + 1].startsWith("--")) { console.error(`w2-load: unknown option or missing value: --${m[1]} (see the header)`); process.exit(2); }
  i++;
}
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const labels = Object.fromEntries(argv.flatMap((a, i) => (a === "--label" && argv[i + 1]?.includes("=") ? [argv[i + 1].split(/=(.*)/s).slice(0, 2)] : [])));
if (!opt("origin") || !opt("code-file")) { console.error("usage: node scripts/beta/w2-load.mjs --origin https://<service>.onrender.com --code-file <file> [options] (see the header)"); process.exit(2); }
let ORIGIN; try { ORIGIN = new URL(opt("origin")).origin; } catch { console.error("w2-load: --origin is not a URL"); process.exit(2); }
if (!ORIGIN.startsWith("https://")) { console.error("w2-load: --origin must be https://"); process.exit(2); }
for (const k of ["max-minutes", "ack-timeout-s"]) if (opt(k) !== undefined && !(Number(opt(k)) > 0)) { console.error(`w2-load: --${k} must be a positive number`); process.exit(2); }
const WSS = ORIGIN.replace(/^https:/, "wss:");
const CODE = readFileSync(opt("code-file"), "utf8").trim();
const ROOMS = W2_SHAPE.rooms, PLAYERS = W2_SHAPE.playersPerRoom, NOTES = W2_SHAPE.notesPerRoom;
const MAX_MS = Number(opt("max-minutes", "20")) * 60_000, ACK_MS = Number(opt("ack-timeout-s", "30")) * 1000;
const RUN = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomBytes(3).toString("hex")}`;
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
const sha = (u) => createHash("sha256").update(readFileSync(new URL(u, import.meta.url))).digest("hex");

const ev = {
  tool: "scripts/beta/w2-load.mjs", toolSha256: sha(import.meta.url), verdictSha256: sha("./w2-verdict.mjs"), node: process.version, runId: RUN, origin: ORIGIN,
  startedAt: new Date(T0).toISOString(), shape: W2_SHAPE, params: { maxMinutes: MAX_MS / 60_000, ackTimeoutS: ACK_MS / 1000 },
  operatorLabels: labels, target: {}, rooms: [], actions: [], sockets: [], strokeExtras: [], isolation: { passiveHits: [], probes: [] }, checks: [], failures: [], notes: [],
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
  let json; try { json = JSON.parse(text); } catch { json = undefined; /* not JSON */ }
  return { status: r.status, body: json };
}
async function must(method, path, body, token) {
  const r = await call(method, path, body, token);
  if (r.status >= 300 || !r.body || typeof r.body !== "object") throw new Error(`${method} ${path.replace(/\?.*$/, "")} answered ${r.status} ${redact(JSON.stringify(r.body ?? null)).slice(0, 160)}`);
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

// ---------- actions with well-formed acknowledgement, idempotent retries and latency ----------
// `judge(status, body)` returns { kind: "accepted" | "rejected" | "malformed" } (scripts/beta/w2-verdict.mjs).
async function act(category, room, label, send, judge) {
  const rec = { category, room: room.label, label, firstAt: Date.now() - T0, attempts: 0, malformed: 0, ackMs: null, accepted: null, reason: null, persisted: null, lastError: null };
  ev.actions.push(rec);
  const t = Date.now();
  for (;;) {
    rec.attempts++;
    try {
      const r = await send();
      const j = judge(r.status, r.body);
      if (j.kind !== "malformed") {
        rec.accepted = j.kind === "accepted"; rec.reason = j.kind === "rejected" ? j.reason : null;
        rec.ackMs = Date.now() - t; rec.result = r.body?.result;
        return rec;
      }
      // "Malformed" counts only a SUCCESS status whose body isn't a well-formed acknowledgement; a 502 is just a failure.
      if (r.status === 200 || r.status === 201) { rec.malformed++; rec.lastError = `HTTP ${r.status} without a well-formed acknowledgement`; } else rec.lastError = `HTTP ${r.status}`;
    } catch (e) { rec.lastError = String(e?.cause?.code ?? e?.name ?? e?.message ?? e).slice(0, 80); }
    if (Date.now() - t > ACK_MS || overTime()) return rec;
    await sleep(300);
  }
}
const intentBody = (room, gid, action, payload, id) => ({ intent: { kind: "intent", schemaVersion: 1, clientEventId: id, roomId: room.id, gameInstanceId: gid, action, payload } });
const sendIntent = (category, room, seat, gid, action, payload, label) => {
  const id = randomUUID();
  return act(category, room, label ?? `${seat.name} ${action}`, () => call("POST", `/rooms/${room.id}/intents`, intentBody(room, gid, action, payload, id), seat.token), intentAck);
};

// ---------- sockets ----------
const sockets = [];
function openSocket(room, label, audience, protocol) {
  const rec = { room: room.label, label, kind: audience === "spectator" ? "tv" : "player", opens: 0, unexpectedCloses: 0, reconnects: 0, messages: 0, projections: 0, open: false, errors: 0 };
  ev.sockets.push(rec);
  let stopped = false; let ws;
  const connect = () => {
    ws = new WebSocket(`${WSS}/?roomId=${room.id}&audience=${audience}`, protocol ? [protocol] : [], { headers: { cookie }, handshakeTimeout: 15_000, followRedirects: false });
    ws.on("open", () => { rec.opens++; if (rec.opens > 1) rec.reconnects++; rec.open = true; });
    ws.on("message", (d) => {
      const text = String(d);
      rec.messages++; scanText(text, room.id, `socket ${label}`);
      try { const m = JSON.parse(text); if (m?.kind === "projection" && m.state?.roomId === room.id) rec.projections++; } catch { /* not JSON */ }
    });
    ws.on("error", () => { rec.errors++; });
    ws.on("close", () => { rec.open = false; if (!stopped) { rec.unexpectedCloses++; setTimeout(() => { if (!stopped) connect(); }, 1000); } });
  };
  connect();
  const s = { rec, stop: () => { stopped = true; try { ws.terminate(); } catch { /* closed */ } } };
  sockets.push(s);
  return s;
}

// ---------- the isolation probes: never throw; record exactly what came back ----------
async function probeRead(path, token) {
  try { const r = await call("GET", path, undefined, token); return { status: r.status, body: r.body && typeof r.body === "object" && !Array.isArray(r.body) ? { error: r.body.error, code: r.body.code } : r.body === undefined ? undefined : { shape: Array.isArray(r.body) ? "array" : typeof r.body } }; }
  catch (e) { return { error: String(e?.cause?.code ?? e?.name ?? e?.message ?? e).slice(0, 60) }; }
}
function probeSocket(target, token) {
  return new Promise((resolve) => {
    let messages = 0; let done = false;
    const finish = (x) => { if (done) return; done = true; clearTimeout(timer); try { ws.terminate(); } catch { /* closed */ } resolve(x); };
    const ws = new WebSocket(`${WSS}/?roomId=${target.id}&audience=player`, [`cgn-session-${token}`], { headers: { cookie }, handshakeTimeout: 15_000, followRedirects: false });
    ws.on("message", (d) => {
      messages++;
      let projectionOfTarget = false; try { const m = JSON.parse(String(d)); projectionOfTarget = m?.kind === "projection" && m.state?.roomId === target.id; } catch { /* not JSON */ }
      finish({ kind: "message", projectionOfTarget });
    });
    ws.on("close", (code, reason) => finish({ kind: "closed", code, reason: String(reason ?? ""), messages }));
    ws.on("unexpected-response", (_q, res) => finish({ kind: "handshake", status: res.statusCode }));
    ws.on("error", (e) => finish({ kind: "error", error: String(e?.code ?? e?.message ?? e).slice(0, 60) }));
    const timer = setTimeout(() => finish({ kind: "timeout" }), 15_000);
  });
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
async function waitFinished(room, gid, limitMs) {
  const until = Date.now() + limitMs;
  while (Date.now() < until && !overTime()) { if (gameOf(await proj(room, room.host), gid)?.status === "finished") return true; await sleep(1000); }
  return false;
}
const pct = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };

// =====================================================================================================================
const rooms = [];
try {
  // ---- 0. preflight ----
  const h = await fetch(ORIGIN + "/health", { redirect: "manual", signal: AbortSignal.timeout(15_000) }).then(async (r) => ({ status: r.status, body: await r.text() }));
  ev.target.health = { status: h.status, body: h.body.slice(0, 200) };
  let revision; try { revision = JSON.parse(h.body).revision; } catch { /* not JSON */ }
  ev.target.revision = revision ?? null;
  if (h.status !== 200 || revision !== PINNED_REVISION) throw new Error(`preflight: /health answered ${h.status} with revision ${revision}, not ${PINNED_REVISION}`);
  const g = await fetch(ORIGIN + "/beta/enter", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: CODE, next: "/" }) });
  const sc = g.headers.get("set-cookie") ?? "";
  if (g.status !== 303 || !sc.startsWith("cgn_beta=")) throw new Error(`preflight: the gate answered ${g.status} without a cookie`);
  cookie = sc.split(";")[0]; secrets.add(cookie.slice("cgn_beta=".length));
  say(`preflight: /health 200, revision ${revision}; the gate admitted the throwaway code (run ${RUN})`);

  // ---- 1. setup ----
  for (let r = 0; r < ROOMS; r++) {
    const L = ROOM_LABELS[r];
    const room = { label: L, index: r, canary: `W2CANARY-${RUN}-${L}-${randomBytes(4).toString("hex")}`, seats: [] };
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
    room.ev = { label: L, roomId: room.id, players: room.seats.map((s) => ({ name: s.name, playerId: s.playerId })), tv: tvToken ? 1 : 0, trivia: { finished: false, questions: 0 }, draw: { finished: false, turns: 0 } };
    ev.rooms.push(room.ev);
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
    room.ev.trivia.questions = room.questions.length;
  }));
  say(`trivia: playing in every room (${rooms.map((r) => r.questions.length).join(" and ")} questions); answering`);
  await Promise.all(rooms.flatMap((room) => room.seats.map(async (s, i) => {
    await sleep(i * 53);
    for (const [k, qid] of room.questions.entries()) {
      const choice = (i + k) % 4;
      const rec = await sendIntent("answer", room, s, room.triviaId, "trivia-answer", { questionId: qid, chosenIndex: choice }, `${s.name} ${qid}`);
      rec.expect = { player: s.playerId, questionId: qid, choice };
      await sleep(700 + ((i * 131 + k * 17) % 500));
    }
  })));
  for (const room of rooms) room.ev.trivia.finished = await waitFinished(room, room.triviaId, 7 * 60_000);
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
  say(`trivia: ${rooms.map((r) => `${r.label} ${r.ev.trivia.finished ? "finished" : "NOT finished"}`).join(", ")}; answers read back`);

  // ---- 3. Draw & Guess, with Memory Book notes alongside ----
  const notesDone = Promise.all(rooms.map(async (room, r) => {
    for (let n = 0; n < NOTES; n++) {
      const text = `W2 note ${n + 1} from room ${room.label} ${room.canary}`;
      const requestId = randomUUID();
      const rec = await act("note", room, `${room.label} note ${n + 1}`, () => call("POST", `/rooms/${room.id}/memory`, { text, day: 1, requestId, fromGame: room.triviaId }, room.host.token), (st, b) => noteAck(st, b, text));
      rec.expect = { text };
      await sleep(1500 + r * 200);
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
      lastTurn = v.turn; room.ev.draw.turns = Math.max(room.ev.draw.turns, v.turn + 1);
      const drawer = byId.get(v.drawerId);
      const word = gameOf(await proj(room, drawer), room.drawId)?.state?.myWord;
      if (!drawer || !word) { fail(`room ${room.label} turn ${v.turn + 1}: the drawer or the word was not found`); break; }
      // Strokes: 8 messages of 3 pieces (6 points each), one every 250 ms (8 per 2 s, under the server's 16). Each
      // message's pieces are distinct per room, turn and message (strokePieces), and recorded as stroke ids + digest.
      const batches = [];
      for (let m = 0; m < W2_SHAPE.strokeMessagesPerTurn; m++) {
        const pieces = strokePieces(room.index, v.turn, m);
        const rec = await sendIntent("stroke", room, drawer, room.drawId, "draw-strokes", { pieces }, `${room.label} turn ${v.turn + 1} strokes ${m + 1}`);
        rec.expect = { turn: v.turn, message: m, ...batchOf(pieces) };
        batches.push(rec);
        await sleep(250);
      }
      // Persisted: the turn's drawing, read back batch by batch, in this room and this turn only.
      const after = gameOf(await proj(room, room.host), room.drawId)?.state;
      const stored = after && after.turn === v.turn && Array.isArray(after.pieces) ? after.pieces : [];
      const match = matchStrokes(batches.map((b) => ({ id: b, accepted: b.accepted, strokes: b.expect.strokes, digest: b.expect.digest })), stored);
      for (const b of batches) { const x = match.result.get(b); b.persisted = x.persisted; if (!x.persisted && b.accepted === true) b.readBack = x.why; }
      if (match.unexpected) ev.strokeExtras.push({ room: room.label, turn: v.turn, unexpected: match.unexpected });
      // Guesses: every guesser, at once.
      const guessers = room.seats.filter((s) => s !== drawer);
      const recs = await Promise.all(guessers.map((s) => sendIntent("guess", room, s, room.drawId, "draw-guess", { text: word }, `${room.label} turn ${v.turn + 1} ${s.name} guess`)));
      const now = gameOf(await proj(room, room.host), room.drawId)?.state;
      const correct = now && now.turn === v.turn ? new Set((now.correct ?? []).map((c) => c.playerId)) : new Set();
      recs.forEach((rec, i) => { rec.expect = { turn: v.turn, player: guessers[i].playerId }; rec.persisted = rec.accepted === true && rec.result?.correct === true && correct.has(guessers[i].playerId); });
    }
    room.ev.draw.finished = await waitFinished(room, room.drawId, 3 * 60_000);
  }));
  await notesDone;
  for (const room of rooms) {
    const book = await must("GET", `/rooms/${room.id}/memory`, undefined, room.host.token);
    const texts = new Set((Array.isArray(book) ? book : book.entries ?? []).map((e) => e.text));
    for (const rec of ev.actions.filter((a) => a.category === "note" && a.room === room.label)) rec.persisted = rec.accepted === true && texts.has(rec.expect.text);
  }
  say(`draw & guess: ${rooms.map((r) => `${r.label} ${r.ev.draw.finished ? "finished" : "NOT finished"} (${r.ev.draw.turns} turns)`).join(", ")}; strokes, guesses and notes read back`);

  // ---- 5. active isolation probes, both directions; nothing here can abort the run ----
  for (const target of rooms) for (const from of rooms) {
    if (target === from) continue;
    const token = from.host.token;
    const projection = await probeRead(`/rooms/${target.id}/projection?audience=player`, token);
    const memory = await probeRead(`/rooms/${target.id}/memory`, token);
    const socket = await probeSocket(target, token);
    ev.isolation.probes.push({ from: from.label, to: target.label, projection, memory, socket });
  }
  ev.isolation.expectedDenial = { http: { status: 401, error: APP_DENIAL }, socket: { close: 1008, reason: APP_DENIAL } };

  // ---- 6. settle and stop sockets ----
  await sleep(1500);
} catch (e) {
  fail(`run aborted: ${e?.message ?? e}`);
} finally {
  for (const s of sockets) s.rec.openAtEnd = s.rec.open === true; // observed now, before the run stops its own sockets
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
      unacknowledged: xs.filter((a) => a.accepted === null).length, retried: xs.filter((a) => a.attempts > 1).length, malformedReplies: xs.reduce((n, a) => n + a.malformed, 0),
      persisted: c === "ready" ? null : xs.filter((a) => a.persisted === true).length,
      ackMedianMs: pct(lat, 0.5), ackP95Ms: pct(lat, 0.95), ackMaxMs: lat.length ? Math.max(...lat) : null,
    };
  }
  ev.summary.sockets = { total: ev.sockets.length, openAtEnd: ev.sockets.filter((s) => s.openAtEnd === true).length, withOwnProjection: ev.sockets.filter((s) => s.projections > 0).length, unexpectedCloses: ev.sockets.reduce((n, s) => n + s.unexpectedCloses, 0), reconnects: ev.sockets.reduce((n, s) => n + s.reconnects, 0), errors: ev.sockets.reduce((n, s) => n + s.errors, 0), messages: ev.sockets.reduce((n, s) => n + s.messages, 0) };
  console.log("\n--- summary ---");
  for (const c of cats) { const s = ev.summary[c]; console.log(`${c.padEnd(6)} sent ${s.sent}, acknowledged ${s.acknowledged}, rejected ${s.rejected}, unacknowledged ${s.unacknowledged}, retried ${s.retried}, malformed replies ${s.malformedReplies}${s.persisted === null ? "" : `, persisted ${s.persisted}`}; ack median ${s.ackMedianMs ?? "—"} ms, p95 ${s.ackP95Ms ?? "—"} ms, max ${s.ackMaxMs ?? "—"} ms`); }
  const so = ev.summary.sockets;
  console.log(`sockets ${so.total}: open at the end ${so.openAtEnd}, with a projection of their own room ${so.withOwnProjection}, unexpected closes ${so.unexpectedCloses}, reconnects ${so.reconnects}, errors ${so.errors}, messages received ${so.messages}`);

  // ---- verdict: every check always runs (scripts/beta/w2-verdict.mjs) ----
  for (const c of verdictChecks(ev)) check(c.name, c.ok, c.detail);
  for (const a of ev.actions) delete a.result;
  const unacked = ev.actions.filter((a) => a.accepted !== true).slice(0, 20);
  if (unacked.length) ev.notes.push(`first actions without an accepted acknowledgement: ${unacked.map((a) => `${a.label} (${a.reason ?? a.lastError})`).join("; ")}`);
  const notPersisted = ev.actions.filter((a) => a.accepted === true && a.persisted === false).slice(0, 20);
  if (notPersisted.length) ev.notes.push(`first acknowledged actions NOT read back: ${notPersisted.map((a) => `${a.label}${a.readBack ? ` (${a.readBack})` : ""}`).join("; ")}`);
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
