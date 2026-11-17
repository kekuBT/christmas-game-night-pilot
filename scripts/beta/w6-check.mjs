// Beta R4 W6 (handoff 6938602366): the checks of the local W6 restore rehearsal (scripts/beta/w6-rehearsal.sh).
// It reads the private fixture that scripts/beta/w5-seed.mjs wrote (seed.json, after.json: ids, session tokens and the
// submitted answer values, all private); stdout carries ids and verdicts, never a token or an answer value.
//   node w6-check.mjs fingerprint <dir>                       one line per file: "<sha256>  <relative path>", sorted;
//                                                              server.lock (the lock record, not data) is left out
//   node w6-check.mjs restored <private dir> <restored dir> <B1 copy dir>
//        the RESTORED folder against B1's verified copy: the same data files (manifest aside), the same score ledger
//        (deep-equal), each pre-backup answer in the pinned shape (extra.answers, integer) equal to its submitted value,
//        the post-backup answer ABSENT (the restore is B1's point in time), and the approved "W5 seed" entry, linked
//   node w6-check.mjs live <base> <private dir> selected|restored|fallback
//        over the API, through the access gate: the original host and guest seats work with no rejoin; the approved
//        entry is there. selected (READ-ONLY, on the private side before reopening): the data being served is the
//        restored copy (each pre-backup answer with its value, the post-backup answer absent). restored: a repeated
//        answer is refused (ALREADY_ANSWERED) and keeps its value; a new answer is acknowledged once, and a replay of
//        the same event id doesn't record it twice; then the round is FINISHED (every remaining question answered by
//        both seats), a replay of an event id after the finish is not recorded again, and a new answer to the finished
//        game is not accepted. fallback (read-only): the retained folder's later state is back (the post-backup answer
//        present, with its value).
//   node w6-check.mjs scores <private dir> <data dir> [extra-score|changed-points|second-finish]
//        the AUTHORITATIVE persisted state after the restored round finished (review 6939462697 item 2): the second
//        game is finished with exactly one game-finished event, exactly one score-awarded event per player, and each
//        player's awarded points equal both the game's recorded score and the score recomputed from the persisted
//        questions and answers (scoreTrivia at 7097ac2: 100 + 20 for a correct answer at the fixed 3000 ms reference,
//        0 otherwise); every question answered once per player. The optional mutation is the checker's OWN negative
//        control, applied in memory to what was read: a synthetic extra score event, changed points, or a second finish
//        event; the check must then FAIL. Scores and answer values are never printed.
// Exit 0 only when every check passed.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const [mode, a1, a2, a3] = process.argv.slice(2);
let failures = 0;
const check = (ok, what, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; };
const NOTE = "W5 seed";

function files(dir) {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p)); } };
  walk(dir);
  return out.filter((f) => f !== "server.lock").sort();
}
function fingerprint(dir) {
  for (const f of files(dir)) console.log(`${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}  ${f}`);
}
const unwrap = (j) => (j && typeof j === "object" && j.room ? j.room : j && typeof j === "object" && j.snapshot ? j.snapshot : j);
const readRoom = (dir, id) => unwrap(JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")));
const readBook = (dir, id) => { const w = JSON.parse(readFileSync(join(dir, `${id}.book.json`), "utf8")); return Array.isArray(w) ? w : w.entries ?? w.book?.entries ?? []; };

function restored(priv, dir, b1) {
  const s = JSON.parse(readFileSync(join(priv, "seed.json"), "utf8"));
  const after = JSON.parse(readFileSync(join(priv, "after.json"), "utf8"));
  const want = files(b1).filter((f) => f !== "manifest.json"), got = files(dir);
  check(JSON.stringify(want) === JSON.stringify(got), "the restored folder holds exactly B1's data files (the manifest aside)", `${got.length} file(s)`);
  if (!existsSync(join(dir, `${s.roomId}.json`))) { check(false, "the seeded room is in the restored folder"); return; }
  const r = readRoom(dir, s.roomId), o = readRoom(b1, s.roomId);
  check(JSON.stringify(r.ledger ?? null) === JSON.stringify(o.ledger ?? null), "the score ledger is identical to B1's", `${(r.ledger ?? []).length} event(s)`);
  const g2 = (r.games ?? []).find((g) => g.id === s.secondGameId);
  const pinned = g2?.extra?.answers;
  check(!!pinned, "the second game keeps its answers where the pinned runtime stores them (extra.answers)");
  for (const a of s.acked) {
    const v = (s.secret?.submittedValues ?? []).find((x) => x.playerId === a.playerId && x.questionId === a.questionId);
    const x = pinned?.[a.playerId]?.[a.questionId];
    check(!!v && Number.isInteger(x) && x === v.value, `the ${a.who}'s pre-backup answer to ${a.questionId} is restored with its submitted value`);
  }
  check(pinned?.[after.postBackup.playerId]?.[after.postBackup.questionId] === undefined, "the post-backup answer is ABSENT (the restore is B1's point in time)");
  const e = readBook(dir, s.roomId).find((x) => x.id === s.entryId);
  const finish = (r.ledger ?? []).find((x) => x.type === "game-finished" && x.gameInstanceId === s.warmGameId);
  check(e?.approved === true && e?.text === NOTE && !!finish && e?.sourceEventIds?.[0] === finish.eventId, "the approved \"W5 seed\" entry is restored, linked to the warm-up game's finish");
  console.log(`RESTORED ${failures === 0 ? "OK" : "FAILED"} (${failures} failed)`);
}

function scores(priv, dir, mutation) {
  const s = JSON.parse(readFileSync(join(priv, "seed.json"), "utf8"));
  const r = readRoom(dir, s.roomId);
  const g = (r.games ?? []).find((x) => x.id === s.secondGameId);
  const ledger = (r.ledger ?? []).map((e) => ({ ...e }));
  if (mutation === "extra-score") { const e = ledger.find((x) => x.type === "score-awarded" && x.gameInstanceId === s.secondGameId); if (e) ledger.push({ ...e, eventId: "evt-synthetic", seq: 1e9 }); }
  if (mutation === "changed-points") { const e = ledger.find((x) => x.type === "score-awarded" && x.gameInstanceId === s.secondGameId); if (e) e.points = (e.points ?? 0) + 120; }
  if (mutation === "second-finish") { const e = ledger.find((x) => x.type === "game-finished" && x.gameInstanceId === s.secondGameId); if (e) ledger.push({ ...e, eventId: "evt-synthetic", seq: 1e9 }); }
  check(g?.status === "finished" && !!g?.rawScores, "the restored round is FINISHED in the persisted state, with its recorded scores");
  const fin = ledger.filter((x) => x.type === "game-finished" && x.gameInstanceId === s.secondGameId);
  check(fin.length === 1, "exactly one game-finished event for it", `${fin.length}`);
  const qs = g?.extra?.questions ?? [], ans = g?.extra?.answers ?? {}, players = g?.players ?? [];
  const awarded = ledger.filter((x) => x.type === "score-awarded" && x.gameInstanceId === s.secondGameId);
  check(players.length === 2 && players.every((p) => awarded.filter((x) => x.playerId === p).length === 1) && awarded.length === players.length,
    "exactly one score-awarded event per player (no duplicate scoring after the replays)", `${awarded.length} event(s), ${players.length} player(s)`);
  check(players.every((p) => qs.length > 0 && qs.every((q) => Number.isInteger(ans[p]?.[q.id])) && Object.keys(ans[p] ?? {}).length === qs.length),
    "every question answered exactly once per player", `${qs.length} question(s)`);
  const expected = (p) => qs.reduce((t, q) => t + (ans[p]?.[q.id] === q.correctIndex ? 120 : 0), 0);
  check(players.every((p) => { const a = awarded.filter((x) => x.playerId === p); return a.length === 1 && a[0].points === g.rawScores[p] && a[0].points === expected(p); }),
    "each player's awarded points equal the game's recorded score AND the score recomputed from the persisted questions and answers (values not printed)");
  console.log(`SCORES ${mutation ? `(negative control: ${mutation}) ` : ""}${failures === 0 ? "OK" : "FAILED"} (${failures} failed)`);
}

async function live(base, priv, phase) {
  const s = JSON.parse(readFileSync(join(priv, "seed.json"), "utf8"));
  const after = JSON.parse(readFileSync(join(priv, "after.json"), "utf8"));
  const code = readFileSync(join(priv, "code"), "utf8").trim();
  const g = await fetch(base + "/beta/enter", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, next: "/" }) });
  const cookie = (g.headers.get("set-cookie") ?? "").split(";")[0];
  check(g.status === 303 && cookie.startsWith("cgn_beta="), "the access gate admits the throwaway code");
  const call = async (method, path, body, token) => {
    const r = await fetch(base + path, { method, signal: AbortSignal.timeout(10_000), headers: { cookie, "content-type": "application/json", "x-session-token": token }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const myAnswers = async (token) => {
    const p = await call("GET", `/rooms/${s.roomId}/projection?audience=player`, undefined, token);
    const game = (p.body.myGames ?? []).find((x) => x.id === s.secondGameId || x.instanceId === s.secondGameId) ?? (p.body.myGames ?? []).find((x) => x.status === "playing");
    return { status: p.status, answers: game?.state?.myAnswers ?? {} };
  };
  const host = await myAnswers(s.secret.hostToken), guest = await myAnswers(s.secret.guestToken);
  check(host.status === 200, "the original HOST seat works, with no rejoin", `HTTP ${host.status}`);
  check(guest.status === 200, "the original GUEST seat works, with no rejoin", `HTTP ${guest.status}`);
  const book = await call("GET", `/rooms/${s.roomId}/memory`, undefined, s.secret.hostToken);
  const e = (Array.isArray(book.body) ? book.body : book.body?.entries ?? []).find((x) => x.id === s.entryId);
  check(e?.approved === true, "the approved \"W5 seed\" entry is there");
  const val = (pid, q) => (s.secret.submittedValues ?? []).find((x) => x.playerId === pid && x.questionId === q)?.value;
  const intent = (q, v, id) => ({ intent: { kind: "intent", schemaVersion: 1, clientEventId: id, roomId: s.roomId, gameInstanceId: s.secondGameId, action: "trivia-answer", payload: { questionId: q, chosenIndex: v } } });
  if (phase === "selected") {
    const h = await myAnswers(s.secret.hostToken), gu = await myAnswers(s.secret.guestToken);
    const mine = (who) => (who === "host" ? h : gu).answers;
    check(s.acked.every((a) => mine(a.who)[a.questionId] === val(a.playerId, a.questionId)), "the data being served is the RESTORED copy: each pre-backup answer is there with its submitted value");
    check(h.answers[after.postBackup.questionId] === undefined, "…and the post-backup answer is absent (not the original folder's later state)");
  } else if (phase === "restored") {
    const g0 = s.acked[0];
    const dup = await call("POST", `/rooms/${s.roomId}/intents`, intent(g0.questionId, (val(g0.playerId, g0.questionId) + 1) % 4, randomUUID()), s.secret.guestToken);
    check(dup.status === 200 && dup.body.accepted === false && dup.body.reason === "ALREADY_ANSWERED", "a repeated answer to an already-restored answer is refused (ALREADY_ANSWERED)", `HTTP ${dup.status} ${dup.body.reason ?? ""}`);
    const g2 = await myAnswers(s.secret.guestToken);
    check(g2.answers[g0.questionId] === val(g0.playerId, g0.questionId), "…and the restored answer keeps its submitted value");
    const q = after.postBackup.questionId, id = randomUUID();
    const n1 = await call("POST", `/rooms/${s.roomId}/intents`, intent(q, 0, id), s.secret.hostToken);
    const n2 = await call("POST", `/rooms/${s.roomId}/intents`, intent(q, 0, id), s.secret.hostToken);
    const h2 = await myAnswers(s.secret.hostToken);
    check(n1.status === 200 && n1.body.accepted === true, "a NEW answer on the restored data is acknowledged", `HTTP ${n1.status}`);
    check(n2.status === 200 && Object.keys(h2.answers).filter((k) => k === q).length === 1 && h2.answers[q] === 0, "a replay of the same event id records nothing twice (one answer, its value)", `HTTP ${n2.status} accepted=${n2.body.accepted} reason=${n2.body.reason ?? ""}`);
    check(Object.keys(h2.answers).length === 2, "the host has exactly its pre-backup answer and the new one", `${Object.keys(h2.answers).length}`);
    // Finish the round: every remaining question, both seats (values vary; they stay private).
    let last = null, sent = 0, bad = 0;
    for (const [tok, pid] of [[s.secret.hostToken, s.hostPlayerId], [s.secret.guestToken, s.guestPlayerId]]) {
      const have = (await myAnswers(tok)).answers;
      for (const [i, qid] of s.questions.entries()) {
        if (have[qid] !== undefined) continue;
        const id = randomUUID(), v = (i + (pid === s.hostPlayerId ? 1 : 2)) % 4;
        const rr = await call("POST", `/rooms/${s.roomId}/intents`, intent(qid, v, id), tok);
        sent++; if (!(rr.status === 200 && rr.body.accepted === true)) bad++;
        last = { tok, qid, v, id };
      }
    }
    check(sent > 0 && bad === 0, "the round is played to its end: every remaining answer acknowledged", `${sent} sent, ${bad} not accepted`);
    let done = false;
    for (let i = 0; i < 40 && !done; i++) {
      const p = await call("GET", `/rooms/${s.roomId}/projection?audience=player`, undefined, s.secret.hostToken);
      const gm = (p.body.myGames ?? []).find((x) => x.id === s.secondGameId || x.instanceId === s.secondGameId);
      done = gm?.status === "finished" || !(p.body.myGames ?? []).some((x) => (x.id === s.secondGameId || x.instanceId === s.secondGameId) && x.status === "playing");
      if (!done) await new Promise((res) => setTimeout(res, 250));
    }
    check(done, "the restored round finished");
    const rp = last ? await call("POST", `/rooms/${s.roomId}/intents`, intent(last.qid, last.v, last.id), last.tok) : { status: 0, body: {} };
    check(rp.status === 200, "a replay of the last event id after the finish is answered (it must not be recorded again: see the persisted check)", `HTTP ${rp.status} accepted=${rp.body.accepted} reason=${rp.body.reason ?? ""}`);
    const late = await call("POST", `/rooms/${s.roomId}/intents`, intent(s.questions[0], 1, randomUUID()), s.secret.hostToken);
    check(late.body.accepted !== true, "a NEW answer to the finished game is not accepted", `HTTP ${late.status} reason=${late.body.reason ?? ""}`);
  } else if (phase === "fallback") {
    const h = await myAnswers(s.secret.hostToken);
    check(h.answers[after.postBackup.questionId] === 2, "the retained folder's later state is back: the post-backup answer, with its value");
    check(h.answers[s.acked[2].questionId] === val(s.acked[2].playerId, s.acked[2].questionId), "the host's pre-backup answer keeps its submitted value");
  }
  console.log(`LIVE ${phase} ${failures === 0 ? "OK" : "FAILED"} (${failures} failed)`);
}

try {
  if (mode === "fingerprint") fingerprint(a1);
  else if (mode === "restored") restored(a1, a2, a3);
  else if (mode === "live") await live(a1, a2, a3);
  else if (mode === "scores") scores(a1, a2, a3);
  else { console.error("usage: node w6-check.mjs fingerprint <dir> | restored <priv> <restored> <b1copy> | live <base> <priv> selected|restored|fallback | scores <priv> <dir> [mutation]"); process.exit(2); }
} catch (e) {
  console.log(`FAIL ${mode}: ${String(e?.message ?? e).replace(/[A-Za-z0-9_-]{24,}/g, "<redacted>")}`);
  process.exit(1);
}
process.exit(failures ? 1 : 0);
