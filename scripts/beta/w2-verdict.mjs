// Beta R4 W2 repair (review 6922818863): the W2 verdict as pure functions, so that scripts/beta/w2-load.mjs (the run),
// scripts/beta/w2-disk-check.mjs (the local disk) and scripts/beta/w2-verdict-selftest.mjs (focused tests) all judge
// the same way. Nothing here does I/O.
//
// What a W2 PASS now requires (each is one check, so a negative fails on its own check alone):
//   - the workload exactly as specified for the pinned release 7097ac2: 2 rooms x 10 players + a TV each, Trivia with
//     10 questions and Draw & Guess with 6 turns in each room, and every expected action, counted per room, sent and
//     acknowledged with a well-formed "accepted" answer (a smaller or partial run can never qualify);
//   - every acknowledged action read back from the authoritative state; for the drawing, each acknowledged batch's own
//     pieces (stroke ids and a digest of the normalized payload) in the right room and turn, nothing extra, no
//     duplicates, in order;
//   - every one of the 22 sockets received at least one projection for its own room, and every socket open at the end;
//   - no cross-room content in any socket message or HTTP body;
//   - both isolation directions probed, and every probe leg refused by the APP itself: HTTP 401 with the app's own
//     body {"error":"Session token required"}, and the socket closed 1008 with that same reason before any message.
//     A 5xx, a 404 or other wrong resource, a proxy or gate answer, a timeout, a transport error or any socket message
//     is NOT a refusal: the leg is inconclusive and the check fails.
import { createHash } from "node:crypto";

export const PINNED_REVISION = "7097ac2bb062925bb296a129f4771f1e68fd522d";
// The W2 shape (proposal W2) with the counts the pinned release produces for it: Trivia (Practice) asks 10 questions;
// Draw & Guess plays min(players, DRAW_MAX_TURNS = 6) turns; the tool sends 8 stroke messages of 3 pieces per turn and
// one guess from every other player; each host saves 5 notes; everyone taps Ready once per game (2 games).
export const W2_SHAPE = Object.freeze({
  rooms: 2, playersPerRoom: 10, tvPerRoom: 1, triviaQuestions: 10, drawTurns: 6, strokeMessagesPerTurn: 8, piecesPerMessage: 3, notesPerRoom: 5,
});
export const ROOM_LABELS = ["A", "B"];
export function expectedPerRoom(shape = W2_SHAPE) {
  return {
    ready: shape.playersPerRoom * 2,
    answer: shape.playersPerRoom * shape.triviaQuestions,
    stroke: shape.drawTurns * shape.strokeMessagesPerTurn,
    guess: shape.drawTurns * (shape.playersPerRoom - 1),
    note: shape.notesPerRoom,
  };
}
export const socketsPerRoom = (shape = W2_SHAPE) => shape.playersPerRoom + shape.tvPerRoom;

// ---------- acknowledgements ----------
// An intent's acknowledgement is well formed only as HTTP 200 with a boolean `accepted`. Anything else (another status,
// a body that isn't an object, a missing or non-boolean `accepted`) is not an acknowledgement at all.
export function intentAck(status, body) {
  if (status !== 200 || !body || typeof body !== "object" || Array.isArray(body) || typeof body.accepted !== "boolean") return { kind: "malformed" };
  return body.accepted ? { kind: "accepted" } : { kind: "rejected", reason: String(body.reason ?? "rejected") };
}
// A Memory Book save is acknowledged only as 200/201 with the saved entry: a non-empty string id and exactly our text.
export function noteAck(status, body, text) {
  if ((status !== 200 && status !== 201) || !body || typeof body !== "object" || typeof body.id !== "string" || !body.id || body.text !== text) return { kind: "malformed" };
  return { kind: "accepted" };
}

// ---------- the drawing ----------
// A piece normalized exactly as the server stores it ({ s, c, w, p }: draw.ts copies those four fields), so a digest
// of the expected pieces and of the stored ones agree only if every field of every piece does.
export const canonPiece = (x) => JSON.stringify([x?.s ?? null, x?.c ?? null, x?.w ?? null, Array.isArray(x?.p) ? x.p : null]);
export const digestPieces = (pieces) => createHash("sha256").update(pieces.map(canonPiece).join("\n")).digest("hex").slice(0, 32);
// What the evidence records for one stroke message: its stroke ids, in order, and the digest of its pieces.
export const batchOf = (pieces) => ({ strokes: pieces.map((x) => x.s), digest: digestPieces(pieces) });
// The tool's deterministic pieces for room r, turn t, message m: 3 pieces of 6 points, distinct per room, turn and
// message, so a piece replayed from another batch, turn or room cannot match.
export function strokePieces(r, t, m) {
  return [0, 1, 2].map((j) => ({ s: m * 3 + j, c: (m + j + r) % 8, w: (j + t) % 3, p: Array.from({ length: 12 }, (_, k) => (100 + m * 90 + j * 30 + k * 7 + t * 13 + r * 5) % 1000) }));
}
/**
 * Match the stroke messages sent in ONE room's ONE turn (in send order: { id, accepted, strokes, digest }) against
 * that turn's authoritative pieces. A batch is read back only if it was accepted, each of its stroke ids occurs
 * exactly once in the stored drawing, the stored pieces for those ids digest to the batch's own digest, and they come
 * after the previous read-back batch's pieces. Returns per-batch results and the stored pieces nobody sent.
 */
export function matchStrokes(batches, stored) {
  const pieces = Array.isArray(stored) ? stored : [];
  const at = new Map();
  pieces.forEach((x, i) => { const k = x?.s; at.set(k, [...(at.get(k) ?? []), i]); });
  const sent = new Set(batches.flatMap((b) => b.strokes ?? []));
  const result = new Map();
  let last = -1;
  const problems = [];
  for (const b of batches) {
    const idx = (b.strokes ?? []).map((s) => at.get(s) ?? []);
    let ok = b.accepted === true && idx.length > 0 && idx.every((l) => l.length === 1);
    let why = b.accepted === true ? "" : "not acknowledged";
    if (b.accepted === true && !ok) why = idx.some((l) => l.length === 0) ? "missing from the stored drawing" : idx.some((l) => l.length > 1) ? "duplicated in the stored drawing" : "no strokes";
    if (ok) {
      const mine = idx.map((l) => l[0]);
      if (digestPieces(mine.map((i) => pieces[i])) !== b.digest) { ok = false; why = "stored pieces differ from what was sent"; }
      else if (mine.some((i, k) => i <= (k === 0 ? last : mine[k - 1]))) { ok = false; why = "stored out of order"; }
      else last = mine[mine.length - 1];
    }
    result.set(b.id, { persisted: ok, why });
    if (b.accepted === true && !ok) problems.push(why);
  }
  const unexpected = pieces.filter((x) => !sent.has(x?.s)).length;
  return { result, unexpected, problems };
}

// ---------- the isolation probes ----------
export const APP_DENIAL = "Session token required";
// One HTTP leg: { status, body } as received, or { error } for a transport failure or timeout.
export function classifyHttpLeg(leg) {
  if (!leg || leg.error !== undefined || typeof leg.status !== "number") return "inconclusive";
  if (leg.status === 200) return "accessed";
  if (leg.status === 401 && leg.body && typeof leg.body === "object" && leg.body.error === APP_DENIAL) return "refused";
  return "inconclusive";
}
// The socket leg: { kind: "closed", code, reason, messages } | { kind: "message", projectionOfTarget } |
// { kind: "handshake", status } | { kind: "error" } | { kind: "timeout" }.
export function classifySocketLeg(leg) {
  if (!leg) return "inconclusive";
  if (leg.kind === "closed" && leg.code === 1008 && leg.reason === APP_DENIAL && !leg.messages) return "refused";
  if (leg.kind === "message" && leg.projectionOfTarget) return "accessed";
  return "inconclusive";
}
export function classifyProbe(p) {
  const legs = { projection: classifyHttpLeg(p.projection), memory: classifyHttpLeg(p.memory), socket: classifySocketLeg(p.socket) };
  const all = Object.values(legs);
  return { legs, outcome: all.includes("accessed") ? "accessed" : all.every((x) => x === "refused") ? "refused" : "inconclusive" };
}
export const describeLeg = (leg) => {
  if (!leg) return "none";
  if (leg.kind === "handshake") return `handshake ${leg.status}`;
  if (leg.error !== undefined) return `transport ${leg.error}`;
  if (typeof leg.status === "number") return `${leg.status}${leg.body?.error ? ` "${String(leg.body.error).slice(0, 40)}"` : ""}`;
  if (leg.kind === "closed") return `closed ${leg.code}${leg.reason ? ` "${leg.reason}"` : ""}${leg.messages ? ` after ${leg.messages} message(s)` : ""}`;
  if (leg.kind === "message") return `message (${leg.projectionOfTarget ? "the target room's projection" : "other"})`;
  return leg.kind;
};

// ---------- the verdict ----------
/**
 * The checks for one run's evidence. `ev` holds rooms (label, roomId, players, tv, trivia { finished, questions },
 * draw { finished, turns }), actions (category, room, accepted, persisted, ...), sockets (room, kind, projections, openAtEnd)
 * and isolation (passiveHits, probes { from, to, projection, memory, socket }), plus strokeExtras (stored pieces nobody
 * sent, per room and turn). Returns [{ name, ok, detail }].
 */
export function verdictChecks(ev, shape = W2_SHAPE) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const per = expectedPerRoom(shape);
  const rooms = ev.rooms ?? [];
  const labels = ROOM_LABELS.slice(0, shape.rooms);
  const sockets = ev.sockets ?? [];
  const shapeOk = rooms.length === shape.rooms && rooms.every((r, i) => r.label === labels[i] && (r.players ?? []).length === shape.playersPerRoom && r.tv === shape.tvPerRoom)
    && labels.every((L) => sockets.filter((s) => s.room === L).length === socketsPerRoom(shape));
  add(`workload: ${shape.rooms} rooms × ${shape.playersPerRoom} players + a TV each (${shape.rooms * socketsPerRoom(shape)} sockets)`, shapeOk,
    `${rooms.length} room(s): ${rooms.map((r) => `${r.label} ${(r.players ?? []).length} players, ${r.tv ?? 0} TV, ${sockets.filter((s) => s.room === r.label).length} sockets`).join("; ") || "none"}`);
  const roomOf = (L) => rooms.find((r) => r.label === L) ?? {};
  add(`workload: Trivia finished with ${shape.triviaQuestions} questions in every room`, labels.every((L) => roomOf(L).trivia?.finished === true && roomOf(L).trivia?.questions === shape.triviaQuestions),
    labels.map((L) => `${L}: ${roomOf(L).trivia?.finished ? "finished" : "NOT finished"}, ${roomOf(L).trivia?.questions ?? 0} questions`).join("; "));
  add(`workload: Draw & Guess finished with ${shape.drawTurns} turns in every room`, labels.every((L) => roomOf(L).draw?.finished === true && roomOf(L).draw?.turns === shape.drawTurns),
    labels.map((L) => `${L}: ${roomOf(L).draw?.finished ? "finished" : "NOT finished"}, ${roomOf(L).draw?.turns ?? 0} turns`).join("; "));

  const acts = ev.actions ?? [];
  const count = (L, cat, f) => acts.filter((a) => a.room === L && a.category === cat && f(a)).length;
  const ackLine = (cat) => labels.map((L) => `${L}: ${count(L, cat, (a) => a.accepted === true)}/${per[cat]} acknowledged, ${count(L, cat, () => true)} sent, ${count(L, cat, (a) => a.accepted === false)} rejected, ${count(L, cat, (a) => a.accepted == null)} unacknowledged`).join("; ");
  const fullyAcked = (cat) => labels.every((L) => count(L, cat, () => true) === per[cat] && count(L, cat, (a) => a.accepted === true) === per[cat]);
  add(`ready: every expected Ready acknowledged (${per.ready} per room)`, fullyAcked("ready"), ackLine("ready"));
  for (const cat of ["answer", "stroke", "guess", "note"]) {
    add(`${cat}: every action acknowledged and accepted (${per[cat]} per room)`, fullyAcked(cat), ackLine(cat));
    const extras = cat === "stroke" ? (ev.strokeExtras ?? []).reduce((n, x) => n + (x.unexpected ?? 0), 0) : 0;
    const readBack = labels.every((L) => count(L, cat, (a) => a.accepted === true && a.persisted === true) === count(L, cat, (a) => a.accepted === true)) && extras === 0;
    add(`${cat}: every acknowledged action read back from the authoritative state`, readBack,
      labels.map((L) => `${L}: ${count(L, cat, (a) => a.accepted === true && a.persisted === true)}/${count(L, cat, (a) => a.accepted === true)}`).join("; ") + (cat === "stroke" ? `; stored pieces nobody sent: ${extras}` : ""));
  }

  const hits = ev.isolation?.passiveHits ?? [];
  add("rooms isolated: no other room's canary, room id or player name in any socket message or HTTP body", hits.length === 0, hits.length ? `${hits.length} hit(s), first: ${JSON.stringify(hits[0])}` : "0 hits");
  const live = sockets.filter((s) => (s.projections ?? 0) > 0).length;
  add(`every socket received a projection for its own room (${shape.rooms * socketsPerRoom(shape)})`, live === shape.rooms * socketsPerRoom(shape) && live === sockets.length,
    `${live}/${shape.rooms * socketsPerRoom(shape)}${sockets.filter((s) => !(s.projections > 0)).map((s) => `; none on ${s.label}`).slice(0, 3).join("")}`);
  const probes = ev.isolation?.probes ?? [];
  const wantPairs = labels.flatMap((a) => labels.filter((b) => b !== a).map((b) => `${b}->${a}`));
  const havePairs = probes.map((p) => `${p.from}->${p.to}`);
  const classified = probes.map((p) => ({ p, c: classifyProbe(p) }));
  add("rooms isolated: one room's host token is refused by the app on the other room's projection, Memory Book and socket (both directions)",
    wantPairs.length > 0 && wantPairs.every((x) => havePairs.filter((y) => y === x).length === 1) && havePairs.length === wantPairs.length && classified.every(({ c }) => c.outcome === "refused"),
    classified.length ? classified.map(({ p, c }) => `room ${p.from} host → room ${p.to}: ${c.outcome} (projection ${describeLeg(p.projection)}; memory ${describeLeg(p.memory)}; socket ${describeLeg(p.socket)})`).join("; ") : "no probes");
  const open = sockets.filter((s) => s.openAtEnd === true).length;
  add(`every socket open at the end (${shape.rooms * socketsPerRoom(shape)})`, open === shape.rooms * socketsPerRoom(shape) && open === sockets.length, `${open}/${shape.rooms * socketsPerRoom(shape)}`);
  return checks;
}
