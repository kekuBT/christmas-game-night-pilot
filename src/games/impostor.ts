import { seededRng } from "../shared/protocol.js";

export interface ImpostorState {
  word: string;
  category: string;
  impostorId: string;
  phase: "clue" | "vote" | "guess" | "finished";
  clues: Record<string, string>;
  votes: Record<string, string>;
  guess?: string;
  guessCorrect?: boolean;
  convictedId?: string | null;
  winner?: "honest" | "impostor";
}

const PACK: { word: string; category: string }[] = [
  { word: "Snowman", category: "Christmas" },
  { word: "Reindeer", category: "Christmas" },
  { word: "Mistletoe", category: "Christmas" },
  { word: "Gingerbread", category: "Christmas" },
  { word: "Fireplace", category: "Christmas" },
  { word: "Snowflake", category: "Christmas" },
];

export function initImpostor(playerIds: string[], seed: number): ImpostorState {
  const rng = seededRng(seed);
  const pack = PACK[Math.floor(rng() * PACK.length)]!;
  const impostorId = playerIds[Math.floor(rng() * playerIds.length)]!;
  return { word: pack.word, category: pack.category, impostorId, phase: "clue", clues: {}, votes: {} };
}

export function submitClue(state: ImpostorState, playerId: string, clue: string): void {
  if (state.phase !== "clue") throw new Error("PHASE_CLOSED");
  if (state.clues[playerId] !== undefined) throw new Error("ALREADY_SUBMITTED");
  state.clues[playerId] = clue;
}

export function allCluesIn(state: ImpostorState, playerIds: string[]): boolean {
  return playerIds.every((p) => state.clues[p] !== undefined);
}

export function submitVote(state: ImpostorState, playerId: string, suspectId: string, playerIds: string[]): void {
  if (state.phase !== "vote") throw new Error("PHASE_CLOSED");
  if (playerId === suspectId) throw new Error("SELF_VOTE");
  if (!playerIds.includes(suspectId)) throw new Error("UNKNOWN_PLAYER");
  if (state.votes[playerId] !== undefined) throw new Error("ALREADY_VOTED");
  state.votes[playerId] = suspectId;
}

export function tallyVotes(state: ImpostorState): string | null {
  const counts = new Map<string, number>();
  for (const v of Object.values(state.votes)) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 0;
  let winners: string[] = [];
  for (const [id, c] of counts) {
    if (c > best) {
      best = c;
      winners = [id];
    } else if (c === best) {
      winners.push(id);
    }
  }
  return winners.length === 1 ? (winners[0] as string) : null; // Tie = no conviction
}

export function resolveVote(state: ImpostorState): void {
  const convicted = tallyVotes(state);
  state.convictedId = convicted;
  if (convicted === state.impostorId) {
    state.phase = "guess";
  } else {
    state.phase = "finished";
    state.winner = "impostor";
  }
}

export function submitGuess(state: ImpostorState, playerId: string, guess: string): void {
  if (state.phase !== "guess") throw new Error("PHASE_CLOSED");
  if (playerId !== state.impostorId) throw new Error("NOT_IMPOSTOR");
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z]/g, "");
  state.guess = guess;
  state.guessCorrect = norm(guess) === norm(state.word);
  state.phase = "finished";
  state.winner = state.guessCorrect ? "impostor" : "honest";
}

/** Raw scores: winning side 100, plus 20 for honest players who voted correctly for the impostor. */
export function impostorScores(state: ImpostorState, playerIds: string[]): Record<string, number> {
  const scores: Record<string, number> = Object.fromEntries(playerIds.map((p) => [p, 0]));
  if (!state.winner) return scores;
  for (const pid of playerIds) {
    const isImpostor = pid === state.impostorId;
    const won = (state.winner === "impostor" && isImpostor) || (state.winner === "honest" && !isImpostor);
    if (won) scores[pid] = 100;
    if (!isImpostor && state.winner === "honest" && state.votes[pid] === state.impostorId) {
      scores[pid] = (scores[pid] ?? 0) + 20;
    }
  }
  return scores;
}

export function projectImpostor(state: ImpostorState, actorId: string, isTv: boolean): Record<string, unknown> {
  if (isTv) {
    return { phase: state.phase, clues: state.phase === "clue" ? {} : state.clues, winner: state.phase === "finished" ? state.winner : undefined };
  }
  const isImpostor = actorId === state.impostorId;
  return {
    phase: state.phase,
    category: state.category,
    role: isImpostor ? "impostor" : "honest",
    word: !isImpostor ? state.word : undefined,
    clues: state.clues,
    myVote: state.votes[actorId],
    winner: state.phase === "finished" ? state.winner : undefined,
    revealedWord: state.phase === "finished" ? state.word : undefined,
  };
}
