import { seededRng } from "../shared/protocol.js";

export interface CaptionRound {
  prompt: string;
  captions: Record<string, string>; // playerId -> caption
  votes: Record<string, string>; // voterId -> captionId (playerId of author, anonymised in projection)
  /** Players who explicitly abstained from submitting a caption this round. */
  abstainedSubmissions: string[];
  /** Players who explicitly abstained from voting this round. */
  abstainedVotes: string[];
}

export interface CaptionState {
  rounds: CaptionRound[];
  roundIndex: number;
  phase: "caption" | "vote" | "finished";
}

const PROMPTS = [
  "A snowman learns to dance",
  "A reindeer tries to bake cookies",
  "A cat opens a Christmas present",
  "A snowflake gets lost in July",
  "A fireplace tells a secret",
];

export function initCaption(seed: number, rounds = 3): CaptionState {
  const rng = seededRng(seed);
  const prompts = [...PROMPTS];
  // Seeded shuffle, take first `rounds`
  for (let i = prompts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = prompts[i] as string;
    prompts[i] = prompts[j] as string;
    prompts[j] = tmp;
  }
  return {
    rounds: prompts.slice(0, rounds).map((prompt) => ({ prompt, captions: {}, votes: {}, abstainedSubmissions: [], abstainedVotes: [] })),
    roundIndex: 0,
    phase: "caption",
  };
}

export function currentRound(state: CaptionState): CaptionRound {
  return state.rounds[state.roundIndex]!;
}

export function submitCaption(state: CaptionState, playerId: string, caption: string): void {
  if (state.phase !== "caption") throw new Error("PHASE_CLOSED");
  const round = currentRound(state);
  if ((round.abstainedSubmissions ?? []).includes(playerId)) throw new Error("ALREADY_ABSTAINED");
  if (round.captions[playerId] !== undefined) throw new Error("ALREADY_SUBMITTED");
  round.captions[playerId] = caption;
}

/** Abstaining from a caption counts toward the submit threshold but earns no participation points. */
export function abstainCaption(state: CaptionState, playerId: string): void {
  if (state.phase !== "caption") throw new Error("PHASE_CLOSED");
  const round = currentRound(state);
  if (round.captions[playerId] !== undefined) throw new Error("ALREADY_SUBMITTED");
  round.abstainedSubmissions ??= [];
  if (round.abstainedSubmissions.includes(playerId)) throw new Error("ALREADY_ABSTAINED");
  round.abstainedSubmissions.push(playerId);
}

export function allCaptionsIn(state: CaptionState, playerIds: string[]): boolean {
  const round = currentRound(state);
  return playerIds.every((p) => round.captions[p] !== undefined || (round.abstainedSubmissions ?? []).includes(p));
}

export function abstainCaptionVote(state: CaptionState, playerId: string): void {
  if (state.phase !== "vote") throw new Error("PHASE_CLOSED");
  const round = currentRound(state);
  if (round.votes[playerId] !== undefined) throw new Error("ALREADY_VOTED");
  round.abstainedVotes ??= [];
  if (round.abstainedVotes.includes(playerId)) throw new Error("ALREADY_ABSTAINED");
  round.abstainedVotes.push(playerId);
}

export function allCaptionVotesIn(state: CaptionState, playerIds: string[]): boolean {
  const round = currentRound(state);
  return playerIds.every((p) => round.votes[p] !== undefined || (round.abstainedVotes ?? []).includes(p));
}

export function submitCaptionVote(state: CaptionState, playerId: string, captionAuthorId: string, _playerIds: string[]): void {
  if (state.phase !== "vote") throw new Error("PHASE_CLOSED");
  if (playerId === captionAuthorId) throw new Error("OWN_VOTE");
  const round = currentRound(state);
  if ((round.abstainedVotes ?? []).includes(playerId)) throw new Error("ALREADY_ABSTAINED");
  if (round.captions[captionAuthorId] === undefined) throw new Error("UNKNOWN_CAPTION");
  if (round.votes[playerId] !== undefined) throw new Error("ALREADY_VOTED");
  round.votes[playerId] = captionAuthorId;
}

/** Scores for one round: 100 per received vote + 25 participation for a valid caption. */
export function captionRoundScores(round: CaptionRound): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const author of Object.keys(round.captions)) scores[author] = 25;
  for (const voted of Object.values(round.votes)) {
    scores[voted] = (scores[voted] ?? 0) + 100;
  }
  return scores;
}

export function captionTotalScores(state: CaptionState): Record<string, number> {
  const total: Record<string, number> = {};
  for (const round of state.rounds) {
    for (const [pid, pts] of Object.entries(captionRoundScores(round))) {
      total[pid] = (total[pid] ?? 0) + pts;
    }
  }
  return total;
}

export function projectCaption(state: CaptionState, actorId: string, isTv: boolean): Record<string, unknown> {
  const round = currentRound(state);
  if (state.phase === "vote" || state.phase === "finished") {
    // Anonymised during vote: captions without author names. After finish, attribution is shown.
    const captions = Object.entries(round.captions).map(([author, text]) => ({
      id: author,
      text,
      author: state.phase === "finished" && !isTv ? author : undefined,
    }));
    return { phase: state.phase, roundIndex: state.roundIndex, prompt: round.prompt, captions, myVote: round.votes[actorId], myAbstained: state.phase === "vote" ? (round.abstainedVotes ?? []).includes(actorId) : false };
  }
  return { phase: state.phase, roundIndex: state.roundIndex, prompt: round.prompt, myCaption: round.captions[actorId], myAbstained: (round.abstainedSubmissions ?? []).includes(actorId) };
}
