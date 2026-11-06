// Test oracle (Sprint 4): drivers find the right answer for whatever the
// server chose by reading the content packs on disk, exactly as an editor
// would. The server never sends answers to the browser; this is test-side
// knowledge only. Answers are matched by the prompt/words on screen.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "content", "packs");
const items = readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => {
  const pack = JSON.parse(readFileSync(join(dir, f), "utf8"));
  return pack.items.map((it) => ({ gameId: pack.gameId, ...it }));
});
const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();

/** The accepted answer text for a multiple-choice prompt shown on screen (trivia, geography, who-said-that). */
export function answerFor(gameId, shownPrompt) {
  const p = norm(shownPrompt);
  const hits = items.filter((it) => it.gameId === gameId && norm(it.prompt ?? it.quote ?? "") !== "" && p.includes(norm(it.prompt ?? it.quote)));
  if (hits.length === 0) throw new Error(`oracle: no ${gameId} item matches "${shownPrompt.slice(0, 80)}"`);
  hits.sort((a, b) => norm(b.prompt ?? b.quote).length - norm(a.prompt ?? a.quote).length);
  return hits[0].answer;
}

/** Index of the right (or a wrong) option among the option texts shown. */
export function optionIndex(gameId, shownPrompt, optionTexts, { wrong = false } = {}) {
  const ans = norm(answerFor(gameId, shownPrompt));
  const idx = optionTexts.findIndex((o) => norm(o) === ans);
  if (idx < 0) throw new Error(`oracle: answer "${ans}" not among options ${JSON.stringify(optionTexts)}`);
  return wrong ? (idx + 1) % optionTexts.length : idx;
}

/** The year of a Guess-the-Year event shown on screen. */
export function yearFor(shownEvent) {
  const e = norm(shownEvent);
  const hit = items.find((it) => it.gameId === "guess-the-year" && e.includes(norm(it.event)));
  if (!hit) throw new Error(`oracle: no event matches "${shownEvent.slice(0, 80)}"`);
  return hit.year;
}

/**
 * The four groups (as word lists) of the Connections board that contains
 * every word on screen (solved groups may already be gone from the screen).
 */
export function connectionsGroups(shownWords) {
  const shown = shownWords.map(norm);
  const boards = items.filter((x) => x.gameId === "word-connections").filter((it) => {
    const words = new Set(it.groups.flatMap((g) => g.words.map(norm)));
    return shown.every((w) => words.has(w));
  });
  if (boards.length === 1) return boards[0].groups.map((g) => g.words);
  if (boards.length > 1) throw new Error(`oracle: ${boards.length} boards contain these words; show more of the board`);
  throw new Error(`oracle: no board has exactly these words: ${[...shown].join(", ")}`);
}

/** Like connectionsGroups, with each group's name (an answer: never shown before the end). */
export function connectionsBoard(shownWords) {
  const words = connectionsGroups(shownWords);
  const it = items.find((x) => x.gameId === "word-connections" && x.groups.every((g, i) => g.words === words[i]));
  return it.groups.map((g) => ({ name: g.name, words: g.words }));
}
