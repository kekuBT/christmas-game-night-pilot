/**
 * Turns selected, validated content items into each engine's game state
 * (Sprint 4). The state is a snapshot: once a game starts it carries its own
 * questions/board/categories, so editing a pack later can never change a
 * game in progress or a finished result.
 */
import { seededRng } from "../shared/rng.js";
import type { LoadedItem } from "./registry.js";
import type { ContentGameId, ItemOf } from "./schema.js";
import type { TriviaQuestion } from "../games/trivia.js";
import type { WhoSaidQuestion } from "../games/whosaid.js";
import type { GeographyQuestion } from "../games/geography.js";
import type { YearEvent } from "../games/year.js";
import type { ClosestQuestion, ClosestState } from "../games/closest.js";
import type { CaptionState } from "../games/caption.js";
import type { SprintCategory, SprintMatcherVersion } from "../games/sprint.js";
import type { ConnectionsBoard } from "../games/connections.js";
import { initImpostor } from "../games/impostor.js";
import { initCharades } from "../games/charades.js";

/** How many items one game uses. Charades uses one prompt per player turn (plus passes). */
export const ITEMS_PER_GAME: Record<ContentGameId, number> = {
  "trivia": 10,
  "who-said-that": 8,
  "geography": 8,
  "guess-the-year": 8,
  "closest-wins": 8,
  "caption-clash": 3,
  "category-sprint": 3,
  "word-connections": 1,
  "impostor": 1,
  "charades": 12,
};

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
const as = <G extends ContentGameId>(li: LoadedItem) => li.item as ItemOf<G>;

/** Multiple-choice: shuffle options per game, keep the answer by text. */
function mc(options: string[], answer: string, rng: () => number): { options: string[]; correctIndex: number } {
  const o = shuffle(options, rng);
  return { options: o, correctIndex: o.indexOf(answer) };
}

export interface SprintRulesSnapshot {
  /** Matcher the game is scored with, for its whole life. */
  matcherVersion: SprintMatcherVersion;
  /** Official games only: the size policy and room size the categories were chosen for. */
  eligibility?: { sizePolicy: number; players: number };
}

export function materialize(gameId: ContentGameId, items: LoadedItem[], ctx: { seed: number; playerIds: string[]; sprint?: SprintRulesSnapshot }): unknown {
  const rng = seededRng(ctx.seed);
  switch (gameId) {
    case "trivia":
      return {
        questions: items.map((li): TriviaQuestion => { const it = as<"trivia">(li); return { id: it.id, prompt: it.prompt, ...mc(it.options, it.answer, rng), explanation: it.explanation, source: it.source.ref ?? it.source.kind }; }),
        answers: {}, times: {},
      };
    case "who-said-that":
      return { questions: items.map((li): WhoSaidQuestion => { const it = as<"who-said-that">(li); const m = mc(it.speakers, it.answer, rng); return { id: it.id, quote: it.quote, speakers: m.options, correctIndex: m.correctIndex, ...(it.explanation ? { explanation: it.explanation } : {}) }; }), answers: {} };
    case "geography":
      return { questions: items.map((li): GeographyQuestion => { const it = as<"geography">(li); const mode = it.mode === "landmark" ? "region" : it.mode; return { id: it.id, mode, prompt: it.prompt, ...mc(it.options, it.answer, rng), explanation: it.explanation }; }), answers: {} };
    case "guess-the-year":
      return { events: items.map((li): YearEvent => { const it = as<"guess-the-year">(li); return { id: it.id, event: it.event, year: it.year, context: it.context, source: it.source.ref ?? it.source.kind }; }), guesses: {} };
    case "closest-wins": {
      const questions = items.map((li): ClosestQuestion => { const it = as<"closest-wins">(li); return { id: it.id, prompt: it.prompt, unit: it.unit, answer: it.answer, source: it.explanation }; });
      const st: ClosestState = { questions, questionIndex: 0, guesses: {}, abstained: {}, phase: "playing" };
      return st;
    }
    case "caption-clash": {
      const st: CaptionState = { rounds: items.map((li) => ({ prompt: as<"caption-clash">(li).prompt, captions: {}, votes: {}, abstainedSubmissions: [], abstainedVotes: [] })), roundIndex: 0, phase: "caption" };
      return st;
    }
    case "category-sprint": {
      const categories = items.map((li): SprintCategory => {
        const it = as<"category-sprint">(li);
        // A full copy: later pack edits (aliases, near-misses) never change this game.
        return {
          name: it.name,
          answers: [...it.answers],
          ...(it.definition ? { definition: it.definition } : {}),
          ...(it.aliases ? { aliases: structuredClone(it.aliases) } : {}),
          ...(it.knownNotAccepted ? { knownNotAccepted: { ...it.knownNotAccepted } } : {}),
          ...(it.typoTolerance !== undefined ? { typoTolerance: it.typoTolerance } : {}),
        };
      });
      // No `matcherVersion` (games from Cups before E2 v3) means v1.
      return { roundIndex: 0, submissions: {}, categories, ...(ctx.sprint && ctx.sprint.matcherVersion !== 1 ? { matcherVersion: ctx.sprint.matcherVersion } : {}), ...(ctx.sprint?.eligibility ? { eligibility: ctx.sprint.eligibility } : {}) };
    }
    case "word-connections": {
      const it = as<"word-connections">(items[0]!);
      const board: ConnectionsBoard = {
        categories: it.groups.map((g) => ({ name: g.name, tiles: [...g.words] })),
        tiles: it.groups.flatMap((g) => g.words.map((text) => ({ id: `tile-${text.toLowerCase().replace(/[^a-z0-9]/g, "-")}`, text, category: g.name }))),
      };
      return {
        board,
        boardId: it.id,
        levels: Object.fromEntries(it.groups.map((g) => [g.name, g.level])),
        // Tiles are shown in this seeded order: never grouped by answer.
        tileOrder: shuffle(board.tiles.map((t) => t.id), rng),
        playerStates: Object.fromEntries(ctx.playerIds.map((p) => [p, { solved: [], mistakes: 0, guessed: [] }])),
      };
    }
    case "impostor": {
      const it = as<"impostor">(items[0]!);
      return initImpostor(ctx.playerIds, ctx.seed, { word: it.word, category: it.hintCategory });
    }
    case "charades":
      return initCharades(ctx.playerIds, items.map((li) => as<"charades">(li).prompt));
  }
}
