// Beta R4 (handoff 6921505856): LOCAL fixture only. After scripts/beta/w2-load.mjs ran against a local server, check that
// what the run had acknowledged is in the data folder on disk: each room's file (Trivia answers, Draw & Guess pieces and
// correct guessers) and its Memory Book file (the notes). On Render the disk isn't readable from outside; there, the
// read-back in w2-load.mjs and W4's restart are what show it.
//   node scripts/beta/w2-disk-check.mjs <w2 evidence JSON> <a copy of the data folder>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [evFile, dir] = process.argv.slice(2);
if (!evFile || !dir) { console.error("usage: node scripts/beta/w2-disk-check.mjs <evidence.json> <data folder copy>"); process.exit(2); }
const ev = JSON.parse(readFileSync(evFile, "utf8"));
let failures = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`); if (!ok) failures++; };
for (const room of ev.rooms) {
  const saved = JSON.parse(readFileSync(join(dir, `${room.roomId}.json`), "utf8")).room;
  const games = (saved.games ?? []).map((g) => (Array.isArray(g) ? g[1] : g));
  const mine = (cat) => ev.actions.filter((a) => a.category === cat && a.room === room.label && a.accepted === true);
  const trivia = games.find((g) => g.gameId === "trivia" && g.status === "finished");
  const answers = trivia ? Object.values(trivia.extra.answers ?? {}).reduce((n, a) => n + Object.keys(a).length, 0) : -1;
  check(`room ${room.label}: the Trivia answers on disk`, answers === mine("answer").length, `${answers} on disk, ${mine("answer").length} acknowledged`);
  const draw = games.find((g) => g.gameId === "draw-guess" && g.status === "finished");
  const pieces = draw ? draw.extra.turns.reduce((n, t) => n + t.pieces.length, 0) : -1;
  const correct = draw ? draw.extra.turns.reduce((n, t) => n + t.correct.length, 0) : -1;
  check(`room ${room.label}: the drawing on disk`, pieces === mine("stroke").length * 3, `${pieces} pieces on disk, ${mine("stroke").length} stroke messages of 3 acknowledged`);
  check(`room ${room.label}: the correct guesses on disk`, correct === mine("guess").length, `${correct} on disk, ${mine("guess").length} acknowledged`);
  const book = JSON.parse(readFileSync(join(dir, `${room.roomId}.book.json`), "utf8"));
  const texts = new Set(book.entries.map((e) => e.text));
  const notes = mine("note");
  check(`room ${room.label}: the Memory Book notes on disk`, notes.every((n) => texts.has(n.expect.text)) && notes.length > 0, `${notes.filter((n) => texts.has(n.expect.text)).length}/${notes.length} acknowledged notes in the book file`);
}
console.log(failures ? `W2 DISK CHECK FAILED (${failures})` : "W2 DISK CHECK PASSED");
process.exit(failures ? 1 : 0);
