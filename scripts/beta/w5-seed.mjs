// Beta R4 W5 (handoff 6937786587): the synthetic state for the local W5 rehearsal, and the checks on what comes back.
// Driven by scripts/beta/w5-rehearsal.sh against the pinned server in production mode (the access gate on), straight
// over HTTP on loopback with no Origin header (as the R4 backup drill's play.mjs did). Throwaway data only.
//   node w5-seed.mjs seed   <base> <private dir>   a casual room "W5 seed room": host + guest; a warm-up Trivia game
//                                                  played to its end; a Memory Book entry "W5 seed" saved from that
//                                                  finished game and APPROVED by the host; then a second Trivia game in
//                                                  which the guest answers two questions and the host one, each
//                                                  acknowledged (HTTP 200, accepted). Writes <private dir>/seed.json.
//   node w5-seed.mjs resume <base> <private dir>   after the backup: the same room answers with the same seats (no
//                                                  rejoin), the approved entry is still there, the second game still
//                                                  holds the three acknowledged answers, and ONE new answer (the host's
//                                                  second) is acknowledged: the service resumed. Writes after.json.
//   node w5-seed.mjs check-copy <private dir> <unpacked copy folder>
//                                                  the RECEIVED copy (decrypted from the fetched-back archive): the
//                                                  manifest says the server was stopped; the room, both games, the
//                                                  approved entry linked to the warm-up game's finish; exactly the three
//                                                  pre-backup acknowledged answers in the second game, each stored where
//                                                  the pinned runtime keeps it (extra.answers[player][question], an
//                                                  integer option index) and holding EXACTLY the value that was
//                                                  submitted and acknowledged (review 6938403611 item 3), and NOT the
//                                                  post-backup one (the copy is the stop point, not later state).
//   node w5-seed.mjs mutate <private dir> <copy folder> <kind>   the checker's own negatives (see mutate below).
// The submitted values live only in the private fixture (seed.json's `secret`), never on stdout or in published evidence.
// Session tokens, the gate cookie and the access code live only in the private dir (removed by the harness on exit);
// stdout carries ids and counts, never a secret. Exit 0 only when every check passed.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [mode, a1, a2] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; };
const NOTE = "W5 seed";

function client(base, priv) {
  const code = readFileSync(join(priv, "code"), "utf8").trim();
  let cookie = "";
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, signal: AbortSignal.timeout(10_000), headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j };
  };
  return {
    async enter() {
      const r = await fetch(base + "/beta/enter", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, next: "/" }) });
      const sc = r.headers.get("set-cookie") ?? "";
      if (r.status !== 303 || !sc.startsWith("cgn_beta=")) throw new Error(`the access gate answered ${r.status}`);
      cookie = sc.split(";")[0];
    },
    call,
    async must(method, path, body, token) {
      const r = await call(method, path, body, token);
      if (r.status >= 300) throw new Error(`${method} ${path.replace(/room-[a-z0-9-]+/, "<room>")} answered ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
      return r.body;
    },
  };
}
const intent = (roomId, gid, action, payload) => ({ intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action, payload } });
async function playingQuestions(c, roomId, gid, token) {
  for (let i = 0; i < 40; i++) {
    const p = await c.must("GET", `/rooms/${roomId}/projection?audience=player`, undefined, token);
    const g = (p.myGames ?? []).find((x) => x.gameId === gid || x.id === gid || x.instanceId === gid) ?? (p.myGames ?? []).find((x) => x.status === "playing");
    if (g?.status === "playing" && g.state?.questions?.length) return g.state.questions.map((q) => q.id);
    await sleep(250);
  }
  throw new Error("the game never reached play");
}
async function answerAcked(c, roomId, gid, token, questionId, chosenIndex) {
  const r = await c.call("POST", `/rooms/${roomId}/intents`, intent(roomId, gid, "trivia-answer", { questionId, chosenIndex }), token);
  return { status: r.status, accepted: r.body?.accepted === true, reason: r.body?.reason };
}

async function seed(base, priv) {
  const c = client(base, priv);
  await c.enter();
  const room = await c.must("POST", "/rooms", { name: "W5 seed room", kind: "casual" });
  const host = await c.must("POST", `/rooms/${room.roomId}/join`, { displayName: "W5 Host", asHost: true, hostClaimToken: room.hostClaimToken });
  const guest = await c.must("POST", "/rooms/join-by-code", { joinCode: room.joinCode, displayName: "W5 Guest" });
  const seats = [host, guest];
  // The warm-up game, played to its end: the Memory Book entry cites its finish.
  const warm = await c.must("POST", `/rooms/${room.roomId}/games`, { gameId: "trivia", official: false }, host.sessionToken);
  for (const s of seats) await c.must("POST", `/rooms/${room.roomId}/intents`, intent(room.roomId, warm.gameId, "briefing-ready", { ready: true }), s.sessionToken);
  const wq = await playingQuestions(c, room.roomId, warm.gameId, host.sessionToken);
  for (const s of seats) for (const q of wq) await c.must("POST", `/rooms/${room.roomId}/intents`, intent(room.roomId, warm.gameId, "trivia-answer", { questionId: q, chosenIndex: 0 }), s.sessionToken);
  // The entry, saved from the finished game (retried while the finish lands), then approved by the host.
  const requestId = randomUUID();
  let entry;
  for (let i = 0; i < 80 && !entry; i++) {
    const r = await c.call("POST", `/rooms/${room.roomId}/memory`, { text: NOTE, day: 1, requestId, fromGame: warm.gameId }, host.sessionToken);
    if (r.status === 200 || r.status === 201) entry = r.body;
    else if (r.body?.code === "NOT_FINISHED") await sleep(250);
    else throw new Error(`the Memory Book save answered ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  if (!entry) throw new Error("the warm-up game never finished, so nothing could be saved");
  await c.must("POST", `/rooms/${room.roomId}/memory/${entry.id}/approve`, {}, host.sessionToken);
  const book = await c.must("GET", `/rooms/${room.roomId}/memory`, undefined, host.sessionToken);
  const seen = (Array.isArray(book) ? book : book.entries ?? []).find((e) => e.id === entry.id);
  if (!seen?.approved) throw new Error("the entry does not read back as approved");
  // The second game: acknowledged answers before the backup.
  const g2 = await c.must("POST", `/rooms/${room.roomId}/games`, { gameId: "trivia", official: false }, host.sessionToken);
  for (const s of seats) await c.must("POST", `/rooms/${room.roomId}/intents`, intent(room.roomId, g2.gameId, "briefing-ready", { ready: true }), s.sessionToken);
  const q2 = await playingQuestions(c, room.roomId, g2.gameId, host.sessionToken);
  if (q2.length < 3) throw new Error(`the second game has only ${q2.length} questions`);
  const acked = [], values = [];
  // Different values per answer, so a swapped or reset value can't match by accident.
  for (const [who, s, q, v] of [["guest", guest, q2[0], 1], ["guest", guest, q2[1], 3], ["host", host, q2[0], 2]]) {
    const r = await answerAcked(c, room.roomId, g2.gameId, s.sessionToken, q, v);
    if (r.status !== 200 || !r.accepted) throw new Error(`the ${who}'s answer was not acknowledged (${r.status} ${r.reason ?? ""})`);
    acked.push({ who, playerId: s.playerId, questionId: q, ackAt: new Date().toISOString() });
    values.push({ playerId: s.playerId, questionId: q, value: v });
  }
  const out = { roomId: room.roomId, warmGameId: warm.gameId, secondGameId: g2.gameId, entryId: entry.id, entrySources: entry.sourceEventIds ?? [], hostPlayerId: host.playerId, guestPlayerId: guest.playerId, questions: q2, acked,
    secret: { hostToken: host.sessionToken, guestToken: guest.sessionToken, submittedValues: values } };
  writeFileSync(join(priv, "seed.json"), JSON.stringify(out, null, 1), { mode: 0o600 });
  const { secret: _secret, ...pub } = out;
  console.log(`SEED ${JSON.stringify(pub)}`);
}

async function resume(base, priv) {
  const s = JSON.parse(readFileSync(join(priv, "seed.json"), "utf8"));
  const c = client(base, priv);
  await c.enter();
  const proj = await c.call("GET", `/rooms/${s.roomId}/projection?audience=player`, undefined, s.secret.hostToken);
  check(proj.status === 200, "the room answers after the backup, with the host's existing seat (no rejoin)", `HTTP ${proj.status}`);
  const gproj = await c.call("GET", `/rooms/${s.roomId}/projection?audience=player`, undefined, s.secret.guestToken);
  check(gproj.status === 200, "the guest's existing seat still works (no rejoin)", `HTTP ${gproj.status}`);
  const book = await c.call("GET", `/rooms/${s.roomId}/memory`, undefined, s.secret.hostToken);
  const e = (Array.isArray(book.body) ? book.body : book.body?.entries ?? []).find((x) => x.id === s.entryId);
  check(book.status === 200 && e?.approved === true && e?.text === NOTE, "the approved \"W5 seed\" entry is still there and approved", `HTTP ${book.status}`);
  // The host's second answer, after the backup: acknowledged, so the original service resumed writing.
  let r;
  for (let i = 0; i < 40; i++) {
    r = await answerAcked(c, s.roomId, s.secondGameId, s.secret.hostToken, s.questions[1], 2);
    if (r.status === 200) break;
    await sleep(250);
  }
  check(r?.status === 200 && r.accepted, "a NEW answer after the backup is acknowledged (the original service resumed)", `HTTP ${r?.status} accepted=${r?.accepted}`);
  writeFileSync(join(priv, "after.json"), JSON.stringify({ postBackup: { who: "host", playerId: s.hostPlayerId, questionId: s.questions[1], ackAt: new Date().toISOString(), accepted: r?.accepted === true } }, null, 1), { mode: 0o600 });
  console.log(`RESUME ${failures === 0 ? "OK" : "FAILED"} (${failures} failed)`);
}

function checkCopy(priv, dir) {
  const s = JSON.parse(readFileSync(join(priv, "seed.json"), "utf8"));
  const after = JSON.parse(readFileSync(join(priv, "after.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  check(manifest.serverWasRunning === false, "the received copy's manifest records a stopped server (serverWasRunning: false)");
  const roomFile = join(dir, `${s.roomId}.json`), bookFile = join(dir, `${s.roomId}.book.json`);
  check(existsSync(roomFile), "the received copy holds the seeded room's file");
  check(existsSync(bookFile), "the received copy holds the seeded room's Memory Book file");
  if (!existsSync(roomFile) || !existsSync(bookFile)) return;
  const unwrap = (j) => (j && typeof j === "object" && j.room ? j.room : j && typeof j === "object" && j.snapshot ? j.snapshot : j);
  const room = unwrap(JSON.parse(readFileSync(roomFile, "utf8")));
  const games = Array.isArray(room.games) ? room.games : [];
  const warm = games.find((g) => g.id === s.warmGameId), g2 = games.find((g) => g.id === s.secondGameId);
  check(warm?.status === "finished", "the warm-up game is in the copy, finished");
  check(!!g2, "the second game is in the copy");
  const finish = (room.ledger ?? []).find((e) => e.type === "game-finished" && e.gameInstanceId === s.warmGameId);
  check(!!finish, "the copy's ledger holds the warm-up game's finish event");
  // Every `answers` map inside the second game's own record (a game keeps them at its top level or in its module state,
  // e.g. extra.answers): player id -> question id -> choice. Only this game's record is searched, never the warm-up's.
  const maps = [];
  const walk = (o) => { if (!o || typeof o !== "object") return; if (o.answers && typeof o.answers === "object" && !Array.isArray(o.answers)) maps.push(o.answers); for (const v of Object.values(o)) walk(v); };
  walk(g2);
  const has = (pid, q) => maps.some((m) => m?.[pid] && typeof m[pid] === "object" && Object.prototype.hasOwnProperty.call(m[pid], q));
  const counted = maps.reduce((n, m) => n + Object.values(m).reduce((k, per) => k + (per && typeof per === "object" ? Object.keys(per).length : 0), 0), 0);
  // A positive control on the reader itself: the absence check below means something only if it finds answers at all.
  check(counted === s.acked.length, `the second game's record in the copy holds exactly the ${s.acked.length} pre-backup answers`, `found ${counted} in ${maps.length} answer map(s)`);
  for (const a of s.acked) check(has(a.playerId, a.questionId), `the ${a.who}'s acknowledged pre-backup answer to ${a.questionId} is in the received copy`);
  // The pinned runtime (7097ac2, room.ts: perPlayer[qid] = chosen) keeps a Trivia answer as an integer option index in
  // the game's module state: extra.answers[player][question]. Each must be there, and be EXACTLY the submitted value.
  const pinned = g2?.extra?.answers && typeof g2.extra.answers === "object" ? g2.extra.answers : undefined;
  check(!!pinned, "the second game keeps its answers where the pinned runtime stores them (extra.answers)");
  for (const a of s.acked) {
    const want = (s.secret?.submittedValues ?? []).find((x) => x.playerId === a.playerId && x.questionId === a.questionId);
    const got = pinned?.[a.playerId]?.[a.questionId];
    check(!!want && Number.isInteger(got) && got === want.value, `the ${a.who}'s answer to ${a.questionId} holds the acknowledged value (an integer option index, the one submitted)`);
  }
  check(!has(after.postBackup.playerId, after.postBackup.questionId), `the ${after.postBackup.who}'s POST-backup answer to ${after.postBackup.questionId} is NOT in the copy (the copy is the stop point)`);
  const bookJson = JSON.parse(readFileSync(bookFile, "utf8"));
  const entries = Array.isArray(bookJson) ? bookJson : bookJson.entries ?? bookJson.book?.entries ?? [];
  const e = entries.find((x) => x.id === s.entryId);
  check(!!e, "the \"W5 seed\" Memory Book entry is in the received copy");
  check(e?.approved === true, "the entry is APPROVED in the received copy");
  check(e?.text === NOTE, "the entry's note reads \"W5 seed\"");
  check(!!finish && Array.isArray(e?.sourceEventIds) && e.sourceEventIds.length === 1 && e.sourceEventIds[0] === finish.eventId, "the entry is linked to the warm-up game's finish event");
  const files = readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "manifest.json").length;
  console.log(`COPY ${failures === 0 ? "OK" : "FAILED"}: ${files} data file(s); ${s.acked.length} pre-backup answers checked; ${failures} failed`);
}

// The checker's own negatives: damage a COPY of the received copy one way; check-copy must then fail.
//   add-post-answer   put the post-backup answer into the second game (as if the copy were later state)
//   drop-pre-answer   remove one acknowledged pre-backup answer (as if it were lost)
//   unapprove-entry   mark the "W5 seed" entry unapproved
//   change-pre-value  same keys, a DIFFERENT value for one acknowledged pre-backup answer (review 6938403611 item 3)
function mutate(priv, dir, kind) {
  const s = JSON.parse(readFileSync(join(priv, "seed.json"), "utf8"));
  const after = JSON.parse(readFileSync(join(priv, "after.json"), "utf8"));
  const roomFile = join(dir, `${s.roomId}.json`), bookFile = join(dir, `${s.roomId}.book.json`);
  if (kind === "unapprove-entry") {
    const whole = JSON.parse(readFileSync(bookFile, "utf8"));
    const entries = Array.isArray(whole) ? whole : whole.entries ?? whole.book?.entries ?? [];
    const e = entries.find((x) => x.id === s.entryId);
    if (!e) throw new Error("no entry to change");
    e.approved = false;
    writeFileSync(bookFile, JSON.stringify(whole));
  } else {
    const whole = JSON.parse(readFileSync(roomFile, "utf8"));
    const room = whole.room ?? whole.snapshot ?? whole;
    const g2 = (room.games ?? []).find((g) => g.id === s.secondGameId);
    const maps = [];
    const walk = (o) => { if (!o || typeof o !== "object") return; if (o.answers && typeof o.answers === "object" && !Array.isArray(o.answers)) maps.push(o.answers); for (const v of Object.values(o)) walk(v); };
    walk(g2);
    const holder = maps.find((m) => m?.[s.acked[0].playerId]?.[s.acked[0].questionId] !== undefined);
    if (!holder) throw new Error("no answer map to change");
    if (kind === "add-post-answer") (holder[after.postBackup.playerId] ??= {})[after.postBackup.questionId] = 2;
    else if (kind === "drop-pre-answer") delete holder[s.acked[0].playerId][s.acked[0].questionId];
    else if (kind === "change-pre-value") { const per = holder[s.acked[0].playerId]; per[s.acked[0].questionId] = (per[s.acked[0].questionId] + 1) % 4; }
    else throw new Error(`unknown damage ${kind}`);
    writeFileSync(roomFile, JSON.stringify(whole));
  }
  console.log(`MUTATED ${kind}`);
}

try {
  if (mode === "seed") await seed(a1, a2);
  else if (mode === "resume") await resume(a1, a2);
  else if (mode === "check-copy") checkCopy(a1, a2);
  else if (mode === "mutate") mutate(a1, a2, process.argv[5]);
  else { console.error("usage: node w5-seed.mjs seed|resume <base> <private dir> | check-copy <private dir> <copy folder> | mutate <private dir> <copy folder> <kind>"); process.exit(2); }
} catch (e) {
  console.log(`FAIL ${mode}: ${String(e?.message ?? e).replace(/[A-Za-z0-9_-]{24,}/g, "<redacted>")}`);
  process.exit(1);
}
process.exit(failures ? 1 : 0);
