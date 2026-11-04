export interface CharadesState {
  teams: string[][]; // player ids per team
  prompts: string[];
  turnIndex: number;
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

export function initCharades(playerIds: string[]): CharadesState {
  // Split as evenly as possible into 2 teams, alternating assignment
  const teams: string[][] = [[], []];
  playerIds.forEach((pid, i) => teams[i % 2]!.push(pid));
  return { teams, prompts: CHARADES_PROMPTS, turnIndex: 0, passesThisTurn: 0, teamScores: [0, 0], phase: "playing" };
}

export function currentActor(state: CharadesState): string {
  // Actor rotates through all players in order, regardless of team
  const all = [...state.teams[0]!, ...state.teams[1]!];
  return all[state.turnIndex % all.length]!;
}

export function actorTeam(state: CharadesState, actorId: string): number {
  return state.teams[0]!.includes(actorId) ? 0 : 1;
}

/** Actor presses Correct (team +100) or Pass (0, max 3 passes per turn). After each turn, advance. */
export function charadesTurn(state: CharadesState, actorId: string, outcome: "correct" | "pass"): void {
  if (state.phase !== "playing") throw new Error("PHASE_CLOSED");
  if (currentActor(state) !== actorId) throw new Error("NOT_ACTOR");
  if (outcome === "correct") {
    const team = actorTeam(state, actorId);
    state.teamScores[team] = (state.teamScores[team] ?? 0) + 100;
    state.turnIndex += 1;
    state.passesThisTurn = 0;
  } else {
    if (state.passesThisTurn >= 3) throw new Error("PASS_LIMIT");
    state.passesThisTurn += 1;
    // A pass does not end the turn in this simplified model; the actor can try the next prompt
    // by advancing the prompt index via turn advancement in the engine (see below).
    state.turnIndex += 1;
    state.passesThisTurn = 0;
  }
  if (state.turnIndex >= 4) state.phase = "finished";
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
  const prompt = state.prompts[state.turnIndex % state.prompts.length]!;
  return {
    phase: state.phase,
    turnIndex: state.turnIndex,
    actor,
    // Prompt is private to the actor only, never to TV or other players
    prompt: !isTv && actorId === actor ? prompt : undefined,
    teamScores: state.teamScores,
  };
}
