// Beta R4 (handoff 6921505856; repaired for review 6922818863): LOCAL fixture only. After scripts/beta/w2-load.mjs ran
// against a local server, check item by item that what the run acknowledged is in the data folder on disk:
//   - answers: every acknowledged Trivia answer is stored for that player and question with that choice, and nothing
//     more is stored;
//   - drawing: every acknowledged stroke message's own pieces are stored in that room's that turn, matched batch by
//     batch (stroke ids in order and the digest of the normalized pieces, scripts/beta/w2-verdict.mjs matchStrokes),
//     with nothing duplicated and no stored piece that the run didn't send;
//   - guesses: every acknowledged guesser is among that turn's stored correct guessers, and nobody else is;
//   - notes: every acknowledged note's exact text is in the room's Memory Book file.
// On Render the disk isn't readable from outside; there, the read-back in w2-load.mjs and W4's restart are what show it.
//   node scripts/beta/w2-disk-check.mjs <w2 evidence JSON> <a copy of the data folder>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchStrokes } from "./w2-verdict.mjs";

const [evFile, dir] = process.argv.slice(2);
if (!evFile || !dir) { console.error("usage: node scripts/beta/w2-disk-check.mjs <evidence.json> <data folder copy>"); process.exit(2); }
const ev = JSON.parse(readFileSync(evFile, "utf8"));
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`); if (!ok) failures++; };
if (!Array.isArray(ev.rooms) || ev.rooms.length === 0) check("the evidence names rooms", false, "none");
for (const room of ev.rooms ?? []) {
  const saved = JSON.parse(readFileSync(join(dir, `${room.roomId}.json`), "utf8")).room;
  const games = (saved.games ?? []).map((g) => (Array.isArray(g) ? g[1] : g));
  const mine = (cat) => ev.actions.filter((a) => a.category === cat && a.room === room.label && a.accepted === true);

  const trivia = games.find((g) => g.gameId === "trivia" && g.status === "finished");
  const stored = trivia?.extra?.answers ?? {};
  const answers = mine("answer");
  const storedCount = Object.values(stored).reduce((n, a) => n + Object.keys(a ?? {}).length, 0);
  const matched = answers.filter((a) => stored[a.expect.player]?.[a.expect.questionId] === a.expect.choice).length;
  check(`room ${room.label}: each acknowledged Trivia answer on disk, for its player and question, with its choice`, !!trivia && answers.length > 0 && matched === answers.length && storedCount === answers.length,
    `${matched}/${answers.length} matched; ${storedCount} stored`);

  const draw = games.find((g) => g.gameId === "draw-guess" && g.status === "finished");
  const turns = draw?.extra?.turns ?? [];
  const strokes = ev.actions.filter((a) => a.category === "stroke" && a.room === room.label);
  let readBack = 0; let extra = 0; const why = [];
  for (const [t, turn] of turns.entries()) {
    const batches = strokes.filter((a) => a.expect?.turn === t).map((a, i) => ({ id: i, accepted: a.accepted, strokes: a.expect.strokes, digest: a.expect.digest }));
    const m = matchStrokes(batches, turn.pieces);
    readBack += [...m.result.values()].filter((x) => x.persisted).length;
    extra += m.unexpected; why.push(...m.problems);
  }
  const ackedStrokes = strokes.filter((a) => a.accepted === true).length;
  check(`room ${room.label}: each acknowledged stroke message's own pieces on disk, batch by batch, in its turn`, !!draw && ackedStrokes > 0 && readBack === ackedStrokes && extra === 0,
    `${readBack}/${ackedStrokes} batches matched; stored pieces nobody sent: ${extra}${why.length ? `; first problem: ${why[0]}` : ""}`);

  const guesses = mine("guess");
  const correctStored = turns.reduce((n, t) => n + (t.correct ?? []).length, 0);
  const guessed = guesses.filter((a) => (turns[a.expect.turn]?.correct ?? []).includes(a.expect.player)).length;
  check(`room ${room.label}: each acknowledged guesser among its turn's correct guessers on disk`, !!draw && guesses.length > 0 && guessed === guesses.length && correctStored === guesses.length,
    `${guessed}/${guesses.length} matched; ${correctStored} stored`);

  const book = JSON.parse(readFileSync(join(dir, `${room.roomId}.book.json`), "utf8"));
  const texts = new Set(book.entries.map((e) => e.text));
  const notes = mine("note");
  check(`room ${room.label}: each acknowledged Memory Book note's exact text in the book file`, notes.length > 0 && notes.every((n) => texts.has(n.expect.text)),
    `${notes.filter((n) => texts.has(n.expect.text)).length}/${notes.length} acknowledged notes in the book file`);
}
console.log(failures ? `W2 DISK CHECK FAILED (${failures})` : "W2 DISK CHECK PASSED");
process.exit(failures ? 1 : 0);
