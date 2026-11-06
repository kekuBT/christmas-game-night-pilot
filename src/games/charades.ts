export interface CharadesState {
  teams: string[][]; // player ids per team
  prompts: string[];
  turnIndex: number;
  promptIndex: number; // prompt within the current turn; passes advance this, not the turn
  passesThisTurn: number;
  teamScores: number[];
  phase: "playing" | "finished";
}

export const CHARADES_PROMPTS = [
  "Building a snowman",
  "Wrapping a present",
  "Ice skating",
  "Drinking hot chocolate",
  "Decorating a tree",
  "Sledging down a hill",
];

export function initCharades(playerIds: string[], prompts: string[] = CHARADES_PROMPTS): CharadesState {
  // Split as evenly as possible into 2 teams, alternating assignment
  const teams: string[][] = [[], []];
  playerIds.forEach((pid, i) => teams[i % 2]!.push(pid));
  return { teams, prompts: prompts.length > 0 ? prompts : CHARADES_PROMPTS, turnIndex: 0, promptIndex: 0, passesThisTurn: 0, teamScores: [0, 0], phase: "playing" };
}

export function currentActor(state: CharadesState): string {
  // Actor rotates through all players in order, regardless of team
  const all = [...state.teams[0]!, ...state.teams[1]!];
  return all[state.turnIndex % all.length]!;
}

export function actorTeam(state: CharadesState, actorId: string): number {
  return state.teams[0]!.includes(actorId) ? 0 : 1;
}

/** Actor presses Correct (team +100, turn ends) or Pass (0, max 3 passes per turn, turn continues with the next prompt). The game lasts one acting turn per player, so total turns scale with the roster instead of stopping at 4. */
export function charadesTurn(state: CharadesState, actorId: string, outcome: "correct" | "pass"): void {
  if (state.phase !== "playing") throw new Error("PHASE_CLOSED");
  if (currentActor(state) !== actorId) throw new Error("NOT_ACTOR");
  // Backwards compatibility for states created before promptIndex existed.
  state.promptIndex ??= state.turnIndex;
  if (outcome === "correct") {
    const team = actorTeam(state, actorId);
    state.teamScores[team] = (state.teamScores[team] ?? 0) + 100;
    state.turnIndex += 1;
    state.passesThisTurn = 0;
    state.promptIndex += 1;
  } else {
    if (state.passesThisTurn >= 3) throw new Error("PASS_LIMIT");
    state.passesThisTurn += 1;
    // A pass stays in the same turn: same actor, next prompt, pass count kept.
    state.promptIndex += 1;
  }
  const totalPlayers = state.teams[0]!.length + state.teams[1]!.length;
  if (state.turnIndex >= totalPlayers) state.phase = "finished";
}

export function charadesPlayerScores(state: CharadesState): Record<string, number> {
  const scores: Record<string, number> = {};
  state.teams.forEach((team, i) => {
    for (const pid of team) scores[pid] = state.teamScores[i] ?? 0;
  });
  return scores;
}

export function projectCharades(state: CharadesState, actorId: string, isTv: boolean): Record<string, unknown> {
  const actor = currentActor(state);
  const prompt = state.prompts[(state.promptIndex ?? state.turnIndex) % state.prompts.length]!;
  return {
    phase: state.phase,
    turnIndex: state.turnIndex,
    passesThisTurn: state.passesThisTurn,
    actor,
    // Prompt is private to the actor only, never to TV or other players
    prompt: !isTv && actorId === actor ? prompt : undefined,
    teamScores: state.teamScores,
  };
}
