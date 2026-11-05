// Game Manifest system (Milestone F) — the single typed source for what
// each game IS, for discovery (Milestone G), Smart Shuffle (Milestone H),
// and tournament scheduling (Milestone I). Gameplay is unchanged: this
// module describes games, it does not run them.
//
// Honesty rules, enforced by validateManifest and documented in
// docs/GAME_MANIFEST.md:
// - Titles, player counts, and durations are cross-checked against the
//   registry (src/games/registry.ts). A manifest that disagrees with the
//   registry is invalid, not a second opinion.
// - Durations are registry design defaults, NOT measured play times:
//   every manifest carries source "design-default" and measured false.
// - Intensity is "unknown" for every game: it has never been measured,
//   and duration must not be read as a difficulty signal.
// - TV support is "dedicated" only for Trivia (MchezoTvStage exists);
//   every other game is "dashboard" (the old TV dashboard's Now playing
//   + Recent games, no dedicated stage).
// - Tournament format verdicts are NOT in this module: no tournament
//   engine exists yet (Milestone I). The tournament section carries
//   only structural facts (per-player scores, team support) that I can
//   compute verdicts from.
import { z } from "zod";
import { GAME_REGISTRY } from "./registry.js";

export const TvSupportSchema = z.enum(["dedicated", "dashboard"]);
export const AbstentionSchema = z.enum(["none", "per-phase", "per-round", "per-question", "whole-game"]);
export const PlayStyleSchema = z.enum(["solo", "team"]);
export const IntensitySchema = z.enum(["unknown", "low", "medium", "high"]);
export const InputSchema = z.enum(["choice", "numeric", "text", "tile-selection", "performance"]);

export const GameManifestSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  categories: z.array(z.string().min(1)).min(1),
  minPlayers: z.number().int().min(1),
  maxPlayers: z.number().int().min(1),
  playStyle: PlayStyleSchema,
  competition: z.literal("competitive"),
  duration: z.object({
    minutes: z.number().int().positive(),
    source: z.literal("design-default"),
    measured: z.literal(false),
  }),
  // What the player provides. Phones are the only controllers; TV is a
  // display, not an input device (see the tv field).
  inputs: z.array(InputSchema).min(1),
  devices: z.array(z.literal("phone")).min(1),
  tv: TvSupportSchema,
  intensity: IntensitySchema,
  intensityNote: z.string(),
  scoring: z.object({
    type: z.literal("per-player-points"),
    teamDerived: z.boolean(),
  }),
  features: z.object({
    practice: z.boolean(),
    official: z.boolean(),
    abstention: AbstentionSchema,
  }),
  tournament: z.object({
    usesPerPlayerScores: z.boolean(),
    supportsTeams: z.boolean(),
  }),
  details: z.string(),
});

export type GameManifest = z.infer<typeof GameManifestSchema>;

const UNKNOWN_INTENSITY = "Not measured; duration is a design default, not a difficulty signal.";

export const GAME_MANIFESTS: GameManifest[] = [
  {
    id: "impostor",
    title: "Impostor",
    description: "One player is secretly the impostor. Everyone gives clues, the room votes on who it is, and a convicted impostor gets one guess.",
    categories: ["social-deduction", "party"],
    minPlayers: 4,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 10, source: "design-default", measured: false },
    inputs: ["text", "choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "per-phase" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Hidden-role clue, vote, and guess phases. Abstention is per-phase: a player may skip the clue and still vote; a convicted impostor who abstains from the guess forfeits it.",
  },
  {
    id: "caption-clash",
    title: "Caption Clash",
    description: "Write captions for three rounds, then vote for your favourite — never your own.",
    categories: ["creativity", "party"],
    minPlayers: 4,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 10, source: "design-default", measured: false },
    inputs: ["text", "choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "per-round" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Three rounds of caption submission and voting. Abstention is per-round, for submits and votes separately; a submit abstainer earns no participation credit.",
  },
  {
    id: "trivia",
    title: "Trivia Showdown",
    description: "Ten multiple-choice questions, answered in any order; each correct answer scores points.",
    categories: ["knowledge", "quiz"],
    minPlayers: 2,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 10, source: "design-default", measured: false },
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dedicated",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Ten questions generated at start; answers accepted in any order until the game finishes. Post-completion staged reveal only (decision L42); no live per-question reveals.",
  },
  {
    id: "word-connections",
    title: "Word Connections",
    description: "Sort 16 words into 4 groups of 4. Playable solo.",
    categories: ["word", "puzzle"],
    minPlayers: 1,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 8, source: "design-default", measured: false },
    inputs: ["tile-selection"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "One shared board; each player solves it independently. The only game with a 1-player minimum.",
  },
  {
    id: "who-said-that",
    title: "Who Said That?",
    description: "Match quotes to their speakers. Generic pack only in local builds.",
    categories: ["knowledge", "social"],
    minPlayers: 4,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 10, source: "design-default", measured: false },
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Quote-to-speaker matching from a fixed pack. The registry notes the pack is generic in local builds.",
  },
  {
    id: "guess-the-year",
    title: "Guess the Year",
    description: "Estimate the year of each event. Closer is better.",
    categories: ["knowledge", "estimation"],
    minPlayers: 2,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 8, source: "design-default", measured: false },
    inputs: ["numeric"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Numeric year guesses scored by closeness to the event year.",
  },
  {
    id: "closest-wins",
    title: "Closest Wins",
    description: "Estimate the number. Closest wins.",
    categories: ["estimation", "party"],
    minPlayers: 2,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 8, source: "design-default", measured: false },
    inputs: ["numeric"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "per-question" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Numeric estimates scored per question; abstention is per-question (0 for that question, later questions still playable).",
  },
  {
    id: "category-sprint",
    title: "Category Sprint",
    description: "Name unique examples in a category, fast, across rounds.",
    categories: ["word", "speed"],
    minPlayers: 4,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 10, source: "design-default", measured: false },
    inputs: ["text"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Text answers per round; uniqueness across the room matters.",
  },
  {
    id: "charades",
    title: "Charades",
    description: "Teams act out prompts — no camera or microphone needed. One full rotation per game.",
    categories: ["acting", "team"],
    minPlayers: 4,
    maxPlayers: 10,
    playStyle: "team",
    competition: "competitive",
    duration: { minutes: 15, source: "design-default", measured: false },
    inputs: ["performance", "choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: true },
    features: { practice: true, official: true, abstention: "none" },
    tournament: { usesPerPlayerScores: true, supportsTeams: true },
    details: "The only team game. Teams compete; per-player scores are derived from team outcomes. One full rotation, not a fixed turn count (decision L15). No abstention: turns are actor-driven and Pass already exists.",
  },
  {
    id: "geography",
    title: "Geography Challenge",
    description: "Flags, capitals, outlines, maps, and distance. Six modes, provisional.",
    categories: ["knowledge", "geography"],
    minPlayers: 2,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 12, source: "design-default", measured: false },
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Six question modes from a fixed pack; the registry marks the modes provisional. Outlines and maps are text/region fallbacks, not licensed geometry or tiles.",
  },
  {
    id: "math-mayhem",
    title: "Math Mayhem",
    description: "Ten quick arithmetic questions. Correct answers score points plus a capped speed bonus.",
    categories: ["math", "speed"],
    minPlayers: 2,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 5, source: "design-default", measured: false },
    inputs: ["numeric"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Ten generated arithmetic questions per game; correct answers earn 100 points plus a capped speed bonus.",
  },
];

/**
 * Validate one manifest. Returns the list of problems; empty means valid.
 * Shape problems (Zod) short-circuit: cross-checks need a well-formed
 * object, so they only run when the shape passes.
 */
export function validateManifest(manifest: unknown): string[] {
  const parsed = GameManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }
  const m = parsed.data;
  const errors: string[] = [];
  const reg = GAME_REGISTRY.find((g) => g.id === m.id);
  if (!reg) {
    return [`id: no registry game with id "${m.id}"`];
  }
  if (m.title !== reg.title) errors.push(`title: "${m.title}" does not match registry "${reg.title}"`);
  if (m.minPlayers !== reg.minPlayers) errors.push(`minPlayers: ${m.minPlayers} does not match registry ${reg.minPlayers}`);
  if (m.maxPlayers !== reg.maxPlayers) errors.push(`maxPlayers: ${m.maxPlayers} does not match registry ${reg.maxPlayers}`);
  if (m.duration.minutes !== reg.defaultDurationMinutes) errors.push(`duration.minutes: ${m.duration.minutes} does not match registry ${reg.defaultDurationMinutes}`);
  const regPlayStyle = reg.modes.includes("team") ? "team" : "solo";
  if (m.playStyle !== regPlayStyle) errors.push(`playStyle: "${m.playStyle}" contradicts registry modes [${reg.modes.join(", ")}]`);
  if (reg.status !== "implemented") errors.push(`status: registry marks "${m.id}" as ${reg.status}`);
  if (m.minPlayers > m.maxPlayers) errors.push(`minPlayers: ${m.minPlayers} exceeds maxPlayers ${m.maxPlayers}`);
  if (m.maxPlayers > 10) errors.push(`maxPlayers: ${m.maxPlayers} exceeds the room cap of 10`);
  // Known architecture facts, not claims: only Trivia has a dedicated TV
  // stage (MchezoTvStage); Charades has no abstention (NOT_APPLICABLE).
  if (m.id === "trivia" && m.tv !== "dedicated") errors.push('tv: trivia must be "dedicated" (MchezoTvStage exists)');
  if (m.id !== "trivia" && m.tv !== "dashboard") errors.push('tv: only trivia has a dedicated stage; others are "dashboard"');
  if (m.id === "charades" && m.features.abstention !== "none") errors.push('features.abstention: charades has no abstention (NOT_APPLICABLE)');
  // Internal consistency: team support and team-derived scores must track
  // the play style, or a consumer would schedule a solo game as a team game.
  if (m.tournament.supportsTeams !== (m.playStyle === "team")) errors.push(`tournament.supportsTeams: ${m.tournament.supportsTeams} contradicts playStyle "${m.playStyle}"`);
  if (m.scoring.teamDerived !== (m.playStyle === "team")) errors.push(`scoring.teamDerived: ${m.scoring.teamDerived} contradicts playStyle "${m.playStyle}"`);
  return errors;
}

/** The manifest for one game id. Throws on unknown ids and on invalid data — a bad manifest must fail loudly, never serve silently. */
export function getManifest(id: string): GameManifest {
  const m = GAME_MANIFESTS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown game manifest: ${id}`);
  const errors = validateManifest(m);
  if (errors.length > 0) throw new Error(`Invalid manifest for ${id}: ${errors.join("; ")}`);
  return m;
}

/**
 * Validate the whole set: every registry game needs exactly one manifest,
 * every manifest needs a registry game, and every manifest must be valid.
 * Returns one entry per problem game; empty means the set is consistent.
 */
export function validateAllManifests(): { id: string; errors: string[] }[] {
  const problems: { id: string; errors: string[] }[] = [];
  const seen = new Set<string>();
  for (const m of GAME_MANIFESTS) {
    if (seen.has(m.id)) {
      problems.push({ id: m.id, errors: [`duplicate manifest for "${m.id}"`] });
      continue;
    }
    seen.add(m.id);
    const errors = validateManifest(m);
    if (errors.length > 0) problems.push({ id: m.id, errors });
  }
  for (const g of GAME_REGISTRY) {
    if (!seen.has(g.id)) problems.push({ id: g.id, errors: [`no manifest for registry game "${g.id}"`] });
  }
  return problems;
}
