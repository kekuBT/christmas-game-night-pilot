// Stage 7.4 (docs/stage7/stage74.md §4.6, §5): a small, controlled content
// pool for tests and the check-content-variety driver. It copies real shipped
// boards and questions (so their words and answers are valid content) under
// new ids, with chosen eligibility and review status:
//   Word Connections: one practice-only board, two approved official boards
//     (review status "legacy", an official status), one rejected board.
//   Trivia: 10 practice-only questions, 14 approved official ones, 1 rejected.
// Written to a directory that a server loads with MCHEZO_CONTENT_DIR (testing
// only) or a test loads with loadContent(dir). Never part of the shipped library.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHIPPED = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "content", "packs");
const read = (file) => JSON.parse(readFileSync(join(SHIPPED, file), "utf8"));
const header = (pack, packId, title) => ({ schemaVersion: 1, packId, gameId: pack.gameId, version: "1.0.0", title, language: "en" });

export const SMALL_CONNECTIONS = [
  { id: "con-t-practice", eligibility: "practice", status: "provisional", from: 0 },
  { id: "con-t-official-a", eligibility: "official", status: "legacy", from: 1 },
  { id: "con-t-official-b", eligibility: "official", status: "legacy", from: 2 },
  { id: "con-t-rejected", eligibility: "official", status: "rejected", from: 3 },
];
/** The boards that may be dealt (practice-usable): everything but the rejected one. */
export const SMALL_CONNECTIONS_USABLE = SMALL_CONNECTIONS.filter((b) => b.status !== "rejected").map((b) => b.id);

/** Write the pool into `dir` (creating `dir/packs`). Returns each board's id and its 16 words. */
export function writeSmallPool(dir) {
  mkdirSync(join(dir, "packs"), { recursive: true });
  const cx = read("word-connections-s4.json");
  const boards = SMALL_CONNECTIONS.map((b) => ({ ...cx.items[b.from], id: b.id, eligibility: b.eligibility, review: { status: b.status, notes: "Stage 7.4 test pool (a copy of a shipped board)." } }));
  writeFileSync(join(dir, "packs", "word-connections-small.json"), JSON.stringify({ ...header(cx, "word-connections-small", "Stage 7.4 test pool: Word Connections"), items: boards }, null, 2));
  const tv = read("trivia-s4-general.json");
  const questions = tv.items.slice(0, 25).map((q, i) => ({
    ...q,
    id: `trv-t-${String(i + 1).padStart(2, "0")}`,
    eligibility: i < 10 ? "practice" : "official",
    review: { status: i === 24 ? "rejected" : i < 10 ? "provisional" : "legacy", notes: "Stage 7.4 test pool (a copy of a shipped question)." },
  }));
  writeFileSync(join(dir, "packs", "trivia-small.json"), JSON.stringify({ ...header(tv, "trivia-small", "Stage 7.4 test pool: Trivia"), items: questions }, null, 2));
  return {
    boards: boards.map((b) => ({ id: b.id, status: b.review.status, eligibility: b.eligibility, words: b.groups.flatMap((g) => g.words) })),
    questions: questions.map((q) => ({ id: q.id, status: q.review.status, eligibility: q.eligibility, prompt: q.prompt })),
  };
}

/** Which pool board shows exactly these words (case-insensitive), or null. */
export function boardIdFor(pool, shownWords) {
  const shown = new Set(shownWords.map((w) => String(w).trim().toLowerCase()));
  const hit = pool.boards.find((b) => b.words.length === shown.size && b.words.every((w) => shown.has(w.toLowerCase())));
  return hit ? hit.id : null;
}
