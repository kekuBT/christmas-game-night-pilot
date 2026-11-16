// Beta R4 W2 repair (review 6922818863): focused tests of the W2 verdict (scripts/beta/w2-verdict.mjs), LOCAL only.
// Each case starts from a healthy synthetic run and changes one thing; it must fail on exactly the expected check (or,
// for the probe and acknowledgement classifiers, be classified as not a refusal / not an acknowledgement).
//   node scripts/beta/w2-verdict-selftest.mjs        (node:test; exit 0 only if every case passes)
// Named *-selftest.mjs, not *.test.mjs, so the repository's vitest suite doesn't collect it.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_DENIAL, ROOM_LABELS, W2_SHAPE, batchOf, classifyProbe, expectedPerRoom, intentAck, matchStrokes, noteAck, strokePieces, verdictChecks,
} from "./w2-verdict.mjs";

const denied = () => ({ status: 401, body: { error: APP_DENIAL } });
const closed = () => ({ kind: "closed", code: 1008, reason: APP_DENIAL, messages: 0 });
function healthy() {
  const per = expectedPerRoom();
  const rooms = ROOM_LABELS.map((L) => ({
    label: L, roomId: `room-${L}`, players: Array.from({ length: 10 }, (_, i) => ({ name: `${L}${i}`, playerId: `player-${i + 1}` })),
    tv: 1, trivia: { finished: true, questions: 10 }, draw: { finished: true, turns: 6 },
  }));
  const actions = [];
  for (const L of ROOM_LABELS) for (const [cat, n] of Object.entries(per)) for (let i = 0; i < n; i++) actions.push({ category: cat, room: L, label: `${L} ${cat} ${i}`, accepted: true, persisted: cat === "ready" ? null : true });
  const sockets = ROOM_LABELS.flatMap((L) => Array.from({ length: 11 }, (_, i) => ({ room: L, label: `${L}-${i}`, projections: 4, openAtEnd: true })));
  const probes = [{ from: "B", to: "A", projection: denied(), memory: denied(), socket: closed() }, { from: "A", to: "B", projection: denied(), memory: denied(), socket: closed() }];
  return { rooms, actions, sockets, isolation: { passiveHits: [], probes }, strokeExtras: [] };
}
const failing = (ev) => verdictChecks(ev).filter((c) => !c.ok).map((c) => c.name);
const only = (ev, prefix) => { const f = failing(ev); assert.equal(f.length, 1, `expected exactly one failing check, got: ${JSON.stringify(f)}`); assert.ok(f[0].startsWith(prefix), `failing check was "${f[0]}", expected "${prefix}…"`); };
const ACTIVE = "rooms isolated: one room's host token is refused by the app";

test("a healthy, complete W2 run passes every check", () => {
  const checks = verdictChecks(healthy());
  assert.deepEqual(checks.filter((c) => !c.ok), []);
  assert.equal(checks.length, 16);
});

// ---- finding 1: only the app's own denial counts as a refusal ----
const legCases = [
  ["503 / 502 / socket timeout", { status: 503, body: {} }, { status: 502, body: {} }, { kind: "timeout" }],
  ["500 / 503 / socket error", { status: 500, body: { error: "boom" } }, { status: 503, body: {} }, { kind: "error" }],
  ["transport errors on both reads", { error: "ECONNREFUSED" }, { error: "TimeoutError" }, closed()],
  ["404 room not found (wrong resource)", { status: 404, body: { error: "Room not found" } }, denied(), closed()],
  ["the beta gate's 401, not the room's", { status: 401, body: { error: "This is a private beta", code: "BETA_ACCESS_REQUIRED" } }, denied(), closed()],
  ["a 401 without the app's body (an edge or proxy)", { status: 401, body: {} }, denied(), closed()],
  ["403 instead of the session denial", { status: 403, body: { error: "Host projection requires host role" } }, denied(), closed()],
  ["socket refused at the handshake (503)", denied(), denied(), { kind: "handshake", status: 503 }],
  ["socket handshake 401 from the gate", denied(), denied(), { kind: "handshake", status: 401 }],
  ["socket closed 1006 (abnormal)", denied(), denied(), { kind: "closed", code: 1006, reason: "", messages: 0 }],
  ["socket closed 1008 for a missing room (wrong resource)", denied(), denied(), { kind: "closed", code: 1008, reason: "Room not found", messages: 0 }],
  ["socket closed 1008 only after a message", denied(), denied(), { kind: "closed", code: 1008, reason: APP_DENIAL, messages: 1 }],
  ["a non-projection socket message", denied(), denied(), { kind: "message", projectionOfTarget: false }],
];
for (const [name, projection, memory, socket] of legCases) {
  test(`probe: ${name} is not a refusal, and fails the active isolation check alone`, () => {
    assert.notEqual(classifyProbe({ projection, memory, socket }).outcome, "refused");
    const ev = healthy();
    ev.isolation.probes[0] = { from: "B", to: "A", projection, memory, socket };
    only(ev, ACTIVE);
  });
}
test("probe: a 200 on any leg is classified as access, and fails the active isolation check", () => {
  assert.equal(classifyProbe({ projection: { status: 200, body: {} }, memory: denied(), socket: closed() }).outcome, "accessed");
  assert.equal(classifyProbe({ projection: denied(), memory: denied(), socket: { kind: "message", projectionOfTarget: true } }).outcome, "accessed");
  const ev = healthy(); ev.isolation.probes[1].memory = { status: 200, body: [] };
  only(ev, ACTIVE);
});
test("probe: the healthy app denial (401 + body, close 1008 + reason) is a refusal", () => {
  assert.equal(classifyProbe({ projection: denied(), memory: denied(), socket: closed() }).outcome, "refused");
});
test("probe: one direction missing, or a direction probed twice, fails the active isolation check alone", () => {
  const a = healthy(); a.isolation.probes.pop(); only(a, ACTIVE);
  const b = healthy(); b.isolation.probes[1] = { ...b.isolation.probes[0] }; only(b, ACTIVE);
  const c = healthy(); c.isolation.probes = []; only(c, ACTIVE);
});

// ---- finding 2: the acceptance verdict enforces the specified workload ----
test("workload: a one-room run (the --rooms 1 reproduction) cannot pass", () => {
  const ev = healthy();
  ev.rooms = ev.rooms.slice(0, 1);
  ev.actions = ev.actions.filter((a) => a.room === "A");
  ev.sockets = ev.sockets.filter((s) => s.room === "A");
  ev.isolation.probes = [];
  const f = failing(ev);
  assert.ok(f.some((n) => n.startsWith("workload: 2 rooms")), JSON.stringify(f));
  assert.ok(f.some((n) => n.startsWith(ACTIVE)), JSON.stringify(f));
  assert.ok(f.length >= 5, JSON.stringify(f));
});
test("workload: 9 players in one room fails the shape check", () => {
  const ev = healthy(); ev.rooms[0].players.pop(); ev.sockets.splice(0, 1);
  assert.ok(failing(ev).some((n) => n.startsWith("workload: 2 rooms")));
});
test("workload: no TV in a room fails the shape check", () => {
  const ev = healthy(); ev.rooms[1].tv = 0;
  only(ev, "workload: 2 rooms");
});
test("workload: Trivia with 9 questions, or not finished, fails the Trivia check alone", () => {
  const a = healthy(); a.rooms[0].trivia.questions = 9; only(a, "workload: Trivia");
  const b = healthy(); b.rooms[1].trivia.finished = false; only(b, "workload: Trivia");
});
test("workload: Draw & Guess with 5 turns fails the drawing check alone", () => {
  const ev = healthy(); ev.rooms[1].draw.turns = 5; only(ev, "workload: Draw & Guess");
});
test("workload: one answer never sent (99 of 100 in a room) fails the answer acknowledgement check alone", () => {
  const ev = healthy(); ev.actions.splice(ev.actions.findIndex((a) => a.category === "answer" && a.room === "B"), 1);
  only(ev, "answer: every action acknowledged");
});
test("workload: fewer notes or Ready taps than specified fail their own checks", () => {
  const a = healthy(); a.actions.splice(a.actions.findIndex((x) => x.category === "note"), 1); only(a, "note: every action acknowledged");
  const b = healthy(); b.actions.splice(b.actions.findIndex((x) => x.category === "ready"), 1); only(b, "ready: every expected Ready");
});
test("workload: a socket that never received a projection for its own room fails that check alone", () => {
  const ev = healthy(); ev.sockets[13].projections = 0; only(ev, "every socket received a projection");
});
test("sockets: one socket closed at the end fails that check alone", () => {
  const ev = healthy(); ev.sockets[3].openAtEnd = false; only(ev, "every socket open at the end");
});
test("acknowledgement: malformed success responses are not acknowledgements", () => {
  for (const [s, b] of [[200, {}], [200, null], [200, { accepted: "yes" }], [200, { accepted: 1 }], [201, { accepted: true }], [204, undefined], [200, [true]]]) {
    assert.equal(intentAck(s, b).kind, "malformed", JSON.stringify([s, b]));
  }
  assert.equal(intentAck(200, { accepted: true }).kind, "accepted");
  assert.equal(intentAck(200, { accepted: false, reason: "LOCKED" }).kind, "rejected");
  assert.equal(noteAck(201, { id: "entry-1", text: "hello" }, "hello").kind, "accepted");
  for (const [s, b] of [[201, { id: "entry-1", text: "other" }], [201, {}], [201, { id: "", text: "hello" }], [200, { accepted: true }], [500, { id: "e", text: "hello" }]]) {
    assert.equal(noteAck(s, b, "hello").kind, "malformed", JSON.stringify([s, b]));
  }
  const ev = healthy(); const a = ev.actions.find((x) => x.category === "guess"); a.accepted = null; // what a malformed answer leaves
  only(ev, "guess: every action acknowledged");
});

// ---- finding 3: the drawing is matched batch by batch, not by total count ----
function turn(r = 0, t = 0) {
  const sent = Array.from({ length: 8 }, (_, m) => strokePieces(r, t, m));
  const batches = sent.map((pieces, m) => ({ id: `m${m}`, accepted: true, ...batchOf(pieces) }));
  return { sent, batches, stored: sent.flat().map((x) => ({ ...x, p: [...x.p] })) };
}
const notPersisted = (res) => [...res.result.entries()].filter(([, v]) => !v.persisted).map(([k]) => k);
test("drawing: the healthy turn reads back every batch", () => {
  const { batches, stored } = turn();
  const res = matchStrokes(batches, stored);
  assert.deepEqual(notPersisted(res), []); assert.equal(res.unexpected, 0);
});
test("drawing: the right count with one coordinate changed fails that batch (the old total-only check passed it)", () => {
  const { batches, stored } = turn();
  stored[10].p[3] = (stored[10].p[3] + 1) % 1000;
  assert.equal(stored.length, 8 * 3); // the old comparison: stored count === acknowledged count → "read back"
  assert.deepEqual(notPersisted(matchStrokes(batches, stored)), ["m3"]);
});
test("drawing: the right count with a substituted piece (another stroke id) fails, and the stranger is counted", () => {
  const { batches, stored } = turn();
  stored[5] = { ...stored[5], s: 999 };
  const res = matchStrokes(batches, stored);
  assert.equal(stored.length, 24); assert.deepEqual(notPersisted(res), ["m1"]); assert.equal(res.unexpected, 1);
});
test("drawing: the right count with a repeated piece in place of another fails that batch", () => {
  const { batches, stored } = turn();
  stored[7] = { ...stored[6], p: [...stored[6].p] };
  const res = matchStrokes(batches, stored);
  assert.equal(stored.length, 24); assert.deepEqual(notPersisted(res), ["m2"]);
});
test("drawing: pieces from another turn or another room do not match", () => {
  const { batches } = turn(0, 2);
  assert.equal(notPersisted(matchStrokes(batches, turn(0, 3).stored)).length, 8);
  assert.equal(notPersisted(matchStrokes(batches, turn(1, 2).stored)).length, 8);
});
test("drawing: two batches stored in swapped order fail", () => {
  const { batches, stored } = turn();
  const swapped = [...stored.slice(0, 3), ...stored.slice(6, 9), ...stored.slice(3, 6), ...stored.slice(9)];
  assert.ok(notPersisted(matchStrokes(batches, swapped)).length >= 1);
});
test("drawing: an acknowledged batch the server never stored (a fake acknowledgement) fails that batch alone", () => {
  const { batches, stored } = turn();
  assert.deepEqual(notPersisted(matchStrokes(batches, [...stored.slice(0, 12), ...stored.slice(15)])), ["m4"]);
});
test("drawing: stored pieces nobody sent fail the stroke read-back check alone", () => {
  const ev = healthy(); ev.strokeExtras = [{ room: "A", turn: 2, unexpected: 1 }];
  only(ev, "stroke: every acknowledged action read back");
});
test("drawing: one acknowledged stroke batch not read back fails the stroke read-back check alone", () => {
  const ev = healthy(); ev.actions.find((a) => a.category === "stroke" && a.room === "B").persisted = false;
  only(ev, "stroke: every acknowledged action read back");
});
test("the shape constants are the ones W2 specifies for 7097ac2", () => {
  assert.deepEqual({ ...W2_SHAPE }, { rooms: 2, playersPerRoom: 10, tvPerRoom: 1, triviaQuestions: 10, drawTurns: 6, strokeMessagesPerTurn: 8, piecesPerMessage: 3, notesPerRoom: 5 });
  assert.deepEqual(expectedPerRoom(), { ready: 20, answer: 100, stroke: 48, guess: 54, note: 5 });
});
