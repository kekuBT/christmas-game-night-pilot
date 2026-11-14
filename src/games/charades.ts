import type { GameTeams } from "../shared/teams.js";

export interface CharadesState {
  teams: string[][]; // player ids per team
  prompts: string[];
  turnIndex: number;
  promptIndex: number; // prompt within the current turn; passes advance this, not the turn
  passesThisTurn: number;
  teamScores: number[];
  phase: "playing" | "finished";
  /**
   * Stage 12.8 (D-S128-03): the teams' names (the night's teams, or two dealt for the game), in `teams` order, and the
   * turn order: "alternate" takes turns between teams (each team acts as often as the largest team has players).
   * Absent on games started before 12.8 (and in tests that pass no teams): Team A/B, one turn per player in order.
   */
  teamNames?: string[];
  teamIds?: string[];
  rotation?: "alternate";
}

export const CHARADES_PROMPTS = [
  "Building a snowman",
  "Wrapping a present",
  "Ice skating",
  "Drinking hot chocolate",
  "Decorating a tree",
  "Sledging down a hill",
];

export function initCharades(playerIds: string[], prompts: string[] = CHARADES_PROMPTS, gameTeams?: GameTeams): CharadesState {
  const usePrompts = prompts.length > 0 ? prompts : CHARADES_PROMPTS;
  // Stage 12.8: the game's teams (2–4), in their list order, each with the game's players on it.
  if (gameTeams) {
    const used = gameTeams.list.filter((t) => playerIds.some((p) => gameTeams.members[p] === t.id));
    if (used.length >= 2) {
      const teams = used.map((t) => playerIds.filter((p) => gameTeams.members[p] === t.id));
      return { teams, prompts: usePrompts, turnIndex: 0, promptIndex: 0, passesThisTurn: 0, teamScores: teams.map(() => 0), phase: "playing", teamNames: used.map((t) => t.name), teamIds: used.map((t) => t.id), rotation: "alternate" };
    }
  }
  // Split as evenly as possible into 2 teams, alternating assignment
  const teams: string[][] = [[], []];
  playerIds.forEach((pid, i) => teams[i % 2]!.push(pid));
  return { teams, prompts: usePrompts, turnIndex: 0, promptIndex: 0, passesThisTurn: 0, teamScores: [0, 0], phase: "playing" };
}

/** How many acting turns the game has: equal turns per team ("alternate"), or one per player (older games). */
export function charadesTotalTurns(state: CharadesState): number {
  if (state.rotation === "alternate") return state.teams.length * Math.max(...state.teams.map((t) => t.length));
  return state.teams.reduce((n, t) => n + t.length, 0);
}

export function currentActor(state: CharadesState): string {
  if (state.rotation === "alternate") {
    // Teams take turns; within a team, its players take turns (a smaller team's players act more than once).
    const team = state.teams[state.turnIndex % state.teams.length]!;
    return team[Math.floor(state.turnIndex / state.teams.length) % team.length]!;
  }
  // Actor rotates through all players in order, regardless of team
  const all = state.teams.flat();
  return all[state.turnIndex % all.length]!;
}

export function actorTeam(state: CharadesState, actorId: string): number {
  return Math.max(0, state.teams.findIndex((t) => t.includes(actorId)));
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
  if (state.turnIndex >= charadesTotalTurns(state)) state.phase = "finished";
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
    // Stage 5.1 (O-06): who is on which team is public (it's announced at the
    // table), so every screen can name the teams and the acting team.
    teams: state.teams.map((t) => [...t]),
    actorTeam: actorTeam(state, actor),
    // Stage 12.8: the teams' names and how many turns the game has (public, like the teams).
    ...(state.teamNames ? { teamNames: [...state.teamNames] } : {}),
    ...(state.teamIds ? { teamIds: [...state.teamIds] } : {}),
    totalTurns: charadesTotalTurns(state),
  };
}
