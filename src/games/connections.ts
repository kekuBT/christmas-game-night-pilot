export interface ConnectionCategory {
  name: string;
  tiles: string[]; // Exactly 4 tile texts
}

export interface ConnectionsBoard {
  categories: ConnectionCategory[];
  tiles: { id: string; text: string; category: string }[];
}

export const CONNECTIONS_BOARD: ConnectionsBoard = {
  categories: [
    { name: "Christmas foods", tiles: ["Gingerbread", "Candy cane", "Mince pie", "Roast turkey"] },
    { name: "Winter weather", tiles: ["Snowfall", "Frost", "Blizzard", "Icicle"] },
    { name: "Christmas decorations", tiles: ["Tinsel", "Bauble", "Wreath", "Stocking"] },
    { name: "Reindeer names", tiles: ["Dasher", "Dancer", "Prancer", "Vixen"] },
  ],
  tiles: [],
};
// Build tiles with stable ids, shuffled deterministically by index order (not random, for test stability)
CONNECTIONS_BOARD.tiles = CONNECTIONS_BOARD.categories.flatMap((cat) =>
  cat.tiles.map((text) => ({ id: `tile-${text.toLowerCase().replace(/[^a-z]/g, "-")}`, text, category: cat.name })),
);

export interface ConnectionsPlayerState {
  solved: string[]; // category names solved
  mistakes: number;
  guessed: string[][]; // groups already tried, by tile id
}

export function guessConnections(
  board: ConnectionsBoard,
  playerState: ConnectionsPlayerState,
  tileIds: string[],
): { correct: boolean; category?: string; finished: boolean } {
  if (tileIds.length !== 4) throw new Error("INVALID_GROUP");
  if (new Set(tileIds).size !== 4) throw new Error("DUPLICATE_TILE");
  if (playerState.solved.length >= 4 || playerState.mistakes >= 4) throw new Error("PUZZLE_OVER");
  const key = [...tileIds].sort().join(",");
  if (playerState.guessed.some((g) => [...g].sort().join(",") === key)) throw new Error("ALREADY_GUESSED");
  // Validate before recording: a rejected guess is not an attempt.
  const tiles = tileIds.map((id) => board.tiles.find((t) => t.id === id));
  if (tiles.some((t) => !t)) throw new Error("UNKNOWN_TILE");
  if (tiles.some((t) => playerState.solved.includes(t!.category))) throw new Error("TILE_ALREADY_SOLVED");
  playerState.guessed.push([...tileIds]);
  const categories = new Set(tiles.map((t) => t!.category));
  if (categories.size === 1) {
    const category = [...categories][0]!;
    if (!playerState.solved.includes(category)) playerState.solved.push(category);
    return { correct: true, category, finished: playerState.solved.length >= 4 };
  }
  playerState.mistakes += 1;
  return { correct: false, finished: playerState.mistakes >= 4 };
}

export function connectionsScore(playerState: ConnectionsPlayerState): number {
  const base = playerState.solved.length * 100;
  const bonus = playerState.mistakes === 0 && playerState.solved.length === 4 ? 50 : playerState.mistakes === 1 && playerState.solved.length === 4 ? 20 : 0;
  return base + bonus;
}
