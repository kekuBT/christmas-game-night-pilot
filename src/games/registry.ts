export type GameMode = "solo" | "team";

export interface GameDescriptor {
  id: string;
  title: string;
  /** Hard minimum: the server refuses to start the game with fewer connected players. */
  minPlayers: number;
  maxPlayers: number;
  /** Stage 6.1: a recommendation only (better with this many), never enforced. */
  recommendedPlayers?: number;
  modes: GameMode[];
  status: "implemented" | "not-implemented";
  defaultDurationMinutes: number;
  tutorial: string;
}

export const GAME_REGISTRY: GameDescriptor[] = [
  { id: "impostor", title: "Impostor", minPlayers: 4, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 10, tutorial: "Find the impostor from clues, without revealing your word." },
  { id: "caption-clash", title: "Caption Clash", minPlayers: 4, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 10, tutorial: "Write a caption, then vote for your favourite — not your own." },
  { id: "trivia", title: "Trivia Showdown", minPlayers: 2, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 10, tutorial: "Answer multiple-choice questions before the timer ends." },
  { id: "word-connections", title: "Word Connections", minPlayers: 1, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 8, tutorial: "Sort 16 words into 4 groups of 4." },
  { id: "who-said-that", title: "Who Said That?", minPlayers: 4, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 10, tutorial: "Match the quote to the speaker. Generic pack only in local builds." },
  { id: "guess-the-year", title: "Guess the Year", minPlayers: 2, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 8, tutorial: "Estimate the year. Closer is better." },
  { id: "closest-wins", title: "Closest Wins", minPlayers: 2, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 8, tutorial: "Estimate the number. Closest wins." },
  { id: "category-sprint", title: "Category Sprint", minPlayers: 4, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 5, tutorial: "Name unique examples in a category, fast." },
  { id: "charades", title: "Charades", minPlayers: 4, maxPlayers: 10, modes: ["team"], status: "implemented", defaultDurationMinutes: 15, tutorial: "Act it out. No camera or microphone needed." },
  { id: "geography", title: "Geography Challenge", minPlayers: 2, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 7, tutorial: "Flags, capitals, outlines, maps, and distance — six modes, provisional." },
  // Stage 6.1: one player can play it (solo); it is better with 2 or more.
  { id: "math-mayhem", title: "Math Mayhem", minPlayers: 1, recommendedPlayers: 2, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 5, tutorial: "10 quick arithmetic questions. Correct = 100 points, plus a capped speed bonus." },
  // Stage 5 (Practice-only until the owner approves their Cup scoring).
  { id: "majority-rules", title: "Majority Rules", minPlayers: 3, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 6, tutorial: "Predict which way the room will vote, then cast your own vote." },
  { id: "pattern-pulse", title: "Pattern Pulse", minPlayers: 1, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 5, tutorial: "Watch a sequence of shapes, then tap it back in order. It grows each round." },
  { id: "draw-guess", title: "Draw & Guess", minPlayers: 3, maxPlayers: 10, modes: ["solo"], status: "implemented", defaultDurationMinutes: 10, tutorial: "One player draws a secret word; everyone else races to guess it." },
];

export function getGame(id: string): GameDescriptor {
  const g = GAME_REGISTRY.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown game: ${id}`);
  return g;
}
