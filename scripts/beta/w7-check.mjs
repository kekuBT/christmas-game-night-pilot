// Beta R4 W7 (handoff 6941129590): the checks of the local rollback rehearsal (scripts/beta/w7-rehearsal.sh).
// It reads the private fixture of scripts/beta/w5-seed.mjs (seed.json: ids, session tokens, submitted answer values) and
// writes its own private files (ledger-at-stop.json, action.json); stdout carries ids, counts and verdicts, never a
// token, a score or an answer value.
//   node w7-check.mjs ledger <private dir> <data dir> <out file>
//        the seeded room's whole persisted score ledger at a stop (the window's reference), into a PRIVATE file
//   node w7-check.mjs live <base> <private dir> <ledger file> compat|rolled|returned|recovered
//        over the API, through the access gate, as the players would: the original HOST and GUEST seats work with no
//        rejoin; the approved "W5 seed" entry is there, linked to the warm-up game's finish; each acknowledged answer
//        of the seed is there with its submitted value; the completed warm-up game's ledger events (one game-finished,
//        one score-awarded per player) are exactly those in the reference ledger.
//        compat and rolled ALSO make the new action: a NEW answer (the host's answer to the second question),
//        acknowledged once, and a replay of its event id not recorded twice; it is written to
//        <private>/action-<phase>.json. returned and recovered check that the rolled action is there with its value
//        (read-only), and that the second game is still in play.
//   node w7-check.mjs persisted <private dir> <data dir> <ledger file> compat|rolled [drop-action|changed-ledger|lost-event]
//        the AUTHORITATIVE persisted state at a later stop: every event of the reference ledger is still there,
//        unchanged and in order (the completed score ledger kept), and no score or finish event was added; the new
//        action is persisted with its value; each acknowledged answer of the seed keeps its value; the approved entry
//        is linked. The optional mutation is the check's OWN negative control (applied in memory): the check must FAIL.
// Exit 0 only when every check passed.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [mode, a1, a2, a3, a4] = process.argv.slice(2);
let failures = 0;
const check = (ok, what, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; };
const NOTE = "W5 seed";
const ACTION_VALUE = 2;
const unwrap = (j) => (j && typeof j === "object" && j.room ? j.room : j && typeof j === "object" && j.snapshot ? j.snapshot : j);
const readRoom = (dir, id) => unwrap(JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")));
const readBook = (dir, id) => { const w = JSON.parse(readFileSync(join(dir, `${id}.book.json`), "utf8")); return Array.isArray(w) ? w : w.entries ?? w.book?.entries ?? []; };
const seedOf = (priv) => JSON.parse(readFileSync(join(priv, "seed.json"), "utf8"));
const val = (s, pid, q) => (s.secret.submittedValues ?? []).find((x) => x.playerId === pid && x.questionId === q)?.value;
const warmEvents = (ledger, s) => ledger.filter((e) => e.gameInstanceId === s.warmGameId && (e.type === "game-finished" || e.type === "score-awarded"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function ledger(priv, dir, out) {
  const s = seedOf(priv);
  const r = readRoom(dir, s.roomId);
  const l = r.ledger ?? [];
  const w = warmEvents(l, s);
  check(w.filter((e) => e.type === "game-finished").length === 1 && w.filter((e) => e.type === "score-awarded").length === 2, "the reference ledger holds the COMPLETED warm-up game: one game-finished and one score-awarded per player", `${l.length} event(s) in all`);
  writeFileSync(out, JSON.stringify(l), { mode: 0o600 });
  console.log(`LEDGER ${failures === 0 ? "OK" : "FAILED"}: ${l.length} event(s) recorded privately`);
}

async function live(base, priv, ledgerFile, phase) {
  const s = seedOf(priv);
  const ref = JSON.parse(readFileSync(ledgerFile, "utf8"));
  const code = readFileSync(join(priv, "code"), "utf8").trim();
  const g = await fetch(base + "/beta/enter", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, next: "/" }) });
  const cookie = (g.headers.get("set-cookie") ?? "").split(";")[0];
  check(g.status === 303 && cookie.startsWith("cgn_beta="), "the access gate admits the authorized code");
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, signal: AbortSignal.timeout(10_000), headers: { cookie, "content-type": "application/json", "x-session-token": token }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const myAnswers = async (token) => {
    const p = await call("GET", `/rooms/${s.roomId}/projection?audience=player`, undefined, token);
    const game = (p.body.myGames ?? []).find((x) => x.id === s.secondGameId || x.instanceId === s.secondGameId);
    return { status: p.status, answers: game?.state?.myAnswers ?? {}, gameStatus: game?.status };
  };
  const host = await myAnswers(s.secret.hostToken), guest = await myAnswers(s.secret.guestToken);
  check(host.status === 200, "the original HOST seat works, with no rejoin", `HTTP ${host.status}`);
  check(guest.status === 200, "the original GUEST seat works, with no rejoin", `HTTP ${guest.status}`);
  const book = await call("GET", `/rooms/${s.roomId}/memory`, undefined, s.secret.hostToken);
  const e = (Array.isArray(book.body) ? book.body : book.body?.entries ?? []).find((x) => x.id === s.entryId);
  const fin = ref.find((x) => x.type === "game-finished" && x.gameInstanceId === s.warmGameId);
  check(e?.approved === true && e?.text === NOTE && !!fin && e?.sourceEventIds?.[0] === fin.eventId, "the approved \"W5 seed\" entry is there, linked to the warm-up game's finish");
  const mine = (who) => (who === "host" ? host : guest).answers;
  check(s.acked.every((a) => mine(a.who)[a.questionId] === val(s, a.playerId, a.questionId)), `each of the ${s.acked.length} acknowledged seed answers is there with its submitted value`);
  const led = await call("GET", `/rooms/${s.roomId}/ledger`, undefined, s.secret.hostToken);
  const apiWarm = warmEvents(Array.isArray(led.body) ? led.body : [], s), refWarm = warmEvents(ref, s);
  check(led.status === 200 && refWarm.length === 3 && same(apiWarm, refWarm), "the COMPLETED score ledger: the warm-up game's finish and its two score events are exactly the reference ones (values not printed)", `HTTP ${led.status}, ${apiWarm.length} event(s)`);
  const q = s.questions[1];
  if (phase === "compat" || phase === "rolled") {
    check(host.answers[q] === undefined, "before the new action, the host has no answer to the second question");
    const id = randomUUID();
    const intent = { intent: { kind: "intent", schemaVersion: 1, clientEventId: id, roomId: s.roomId, gameInstanceId: s.secondGameId, action: "trivia-answer", payload: { questionId: q, chosenIndex: ACTION_VALUE } } };
    const n1 = await call("POST", `/rooms/${s.roomId}/intents`, intent, s.secret.hostToken);
    const n2 = await call("POST", `/rooms/${s.roomId}/intents`, intent, s.secret.hostToken);
    const h2 = await myAnswers(s.secret.hostToken);
    check(n1.status === 200 && n1.body.accepted === true, "a NEW action (the host's answer to the second question) is acknowledged", `HTTP ${n1.status}`);
    check(n2.status === 200 && h2.answers[q] === ACTION_VALUE && Object.keys(h2.answers).length === s.acked.filter((a) => a.who === "host").length + 1, "a replay of its event id records nothing twice (one answer, its value)", `HTTP ${n2.status} accepted=${n2.body.accepted} reason=${n2.body.reason ?? ""}`);
    writeFileSync(join(priv, `action-${phase}.json`), JSON.stringify({ playerId: s.hostPlayerId, questionId: q, value: ACTION_VALUE, clientEventId: id, ackAt: new Date().toISOString() }), { mode: 0o600 });
  } else {
    const act = JSON.parse(readFileSync(join(priv, "action-rolled.json"), "utf8"));
    check(host.answers[act.questionId] === act.value, "the action acknowledged on the previous release is there, with its value (read by this release)");
    check(host.gameStatus === "playing", "the second game is still in play (the rollback neither finished nor reset it)", `${host.gameStatus}`);
  }
  console.log(`LIVE ${phase} ${failures === 0 ? "OK" : "FAILED"} (${failures} failed)`);
}

function persisted(priv, dir, ledgerFile, actionOf, mutation) {
  const s = seedOf(priv);
  const ref = JSON.parse(readFileSync(ledgerFile, "utf8"));
  const act = JSON.parse(readFileSync(join(priv, `action-${actionOf}.json`), "utf8"));
  const r = readRoom(dir, s.roomId);
  const l = (r.ledger ?? []).map((e) => ({ ...e }));
  const g2 = (r.games ?? []).find((x) => x.id === s.secondGameId);
  const answers = JSON.parse(JSON.stringify(g2?.extra?.answers ?? {}));
  if (mutation === "drop-action") delete answers[act.playerId]?.[act.questionId];
  if (mutation === "changed-ledger") { const e = l.find((x) => x.type === "score-awarded" && x.gameInstanceId === s.warmGameId); if (e) e.points = (e.points ?? 0) + 120; }
  if (mutation === "lost-event") { const i = l.findIndex((x) => x.type === "score-awarded" && x.gameInstanceId === s.warmGameId); if (i >= 0) l.splice(i, 1); }
  check(ref.length > 0 && l.length >= ref.length && ref.every((e, i) => same(e, l[i])), "the completed score ledger is kept: every event of the reference, unchanged and in order", `${ref.length} reference event(s), ${l.length} now`);
  const added = l.slice(ref.length);
  check(!added.some((e) => e.type === "score-awarded" || e.type === "game-finished"), "no score or finish event was added by the rollback", `${added.length} later event(s)`);
  check(answers[act.playerId]?.[act.questionId] === act.value, "the new action is PERSISTED with its value (where the runtime keeps it: extra.answers)");
  check(s.acked.every((a) => answers[a.playerId]?.[a.questionId] === val(s, a.playerId, a.questionId)), "each acknowledged seed answer keeps its submitted value in the persisted state");
  const e = readBook(dir, s.roomId).find((x) => x.id === s.entryId);
  const fin = l.find((x) => x.type === "game-finished" && x.gameInstanceId === s.warmGameId);
  check(e?.approved === true && e?.text === NOTE && !!fin && e?.sourceEventIds?.[0] === fin.eventId, "the approved entry is persisted, linked to the warm-up game's finish");
  console.log(`PERSISTED ${mutation ? `(negative control: ${mutation}) ` : ""}${failures === 0 ? "OK" : "FAILED"} (${failures} failed)`);
}

try {
  if (mode === "ledger") ledger(a1, a2, a3);
  else if (mode === "live") await live(a1, a2, a3, a4);
  else if (mode === "persisted") persisted(a1, a2, a3, a4, process.argv[7]);
  else { console.error("usage: node w7-check.mjs ledger <priv> <dir> <out> | live <base> <priv> <ledger> compat|rolled|returned|recovered | persisted <priv> <dir> <ledger> compat|rolled [mutation]"); process.exit(2); }
} catch (e) {
  console.log(`FAIL ${mode}: ${String(e?.message ?? e).replace(/[A-Za-z0-9_-]{24,}/g, "<redacted>")}`);
  process.exit(1);
}
process.exit(failures ? 1 : 0);
