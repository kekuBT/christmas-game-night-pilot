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
  categories: z.array(z.string().min(1)).min(1).readonly(),
  /** Hard minimum (the server enforces it). */
  minPlayers: z.number().int().min(1),
  maxPlayers: z.number().int().min(1),
  /** Stage 6.1: better with this many; a recommendation, never enforced. */
  recommendedPlayers: z.number().int().min(1).optional(),
  /** Stage 6.1: offered under Play solo (a complete one-player loop exists). */
  soloPlay: z.boolean().optional(),
  playStyle: PlayStyleSchema,
  // Stage 9.3: "cooperative" = one shared team result (Spectrum); everything else competes per player.
  competition: z.enum(["competitive", "cooperative"]),
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
    type: z.enum(["per-player-points", "shared-team-total"]),
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
    soloPlay: true,
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
    details: "One shared board; each player solves it independently. Playable alone from Play solo.",
  },
  {
    id: "who-said-that",
    title: "Who Said That?",
    description: "Match each quote to the made-up character who said it. Played in a room, each player on their own phone.",
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
    details: "Quote-to-speaker matching from a fixed pack of made-up characters (no real people's quotes).",
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
    duration: { minutes: 5, source: "design-default", measured: false }, // Stage 5.1: 3 rounds of 60 s, 4-min limit, plus the briefing
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
    description: "Four-choice geography questions, mixed in every game: flags, capitals, regions, distances and more.",
    categories: ["knowledge", "geography"],
    minPlayers: 2,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 7, source: "design-default", measured: false }, // Stage 5.1: 8 questions, 6-min limit, plus the briefing
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: true, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Question types from a fixed pack, mixed in each game: flags, capitals, regions, landmarks, higher-or-lower and distance (outlines in the older pack). Outlines and maps are text/region fallbacks, not licensed geometry or tiles.",
  },
  {
    id: "math-mayhem",
    title: "Math Mayhem",
    description: "Ten quick arithmetic questions. Correct answers score points plus a capped speed bonus.",
    categories: ["math", "speed"],
    minPlayers: 1,
    recommendedPlayers: 2,
    soloPlay: true,
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
  {
    id: "majority-rules",
    title: "Majority Rules",
    description: "Predict which way the room will vote on a fun either/or question, then cast your own vote. Right predictions score.",
    categories: ["social", "party"],
    minPlayers: 3,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 6, source: "design-default", measured: false },
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: false, abstention: "per-round" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Five rounds. Predict the majority first, then vote; votes stay anonymous, only totals are shown. 100 for a right prediction; a tied room gives every prediction 50. Practice-only (Stage 5).",
  },
  {
    id: "pattern-pulse",
    title: "Pattern Pulse",
    description: "Watch a sequence of coloured shapes, then tap it back in order. Six rounds, three shapes up to eight.",
    categories: ["memory", "puzzle"],
    minPlayers: 1,
    soloPlay: true,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 5, source: "design-default", measured: false },
    inputs: ["tile-selection"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: false, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Six self-paced rounds; everyone gets the same lengths and timing but their own sequence. 20 points per shape right from the start, plus 50 for the whole sequence. Practice-only (Stage 5).",
  },
  {
    id: "draw-guess",
    title: "Draw & Guess",
    description: "One player draws a secret word on their phone; everyone else races to guess it. Up to six turns: in bigger rooms, six players chosen at random draw.",
    categories: ["creativity", "party"],
    minPlayers: 3,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 10, source: "design-default", measured: false },
    inputs: ["performance", "text"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: false, abstention: "per-round" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Up to six turns of 75 seconds; the server picks who draws and the word. Guessers score 100, 80, 60, then 50 in the order they get it; the drawer 50 for each. Wrong guesses are never shown. Practice-only (Stage 5).",
  },
  {
    id: "jebena-rush",
    title: "Jebena Rush",
    description: "Name it. Pass it. Beat the steam. Name something in the category before your 10 seconds run out, then pass the jebena on. Time out and one of your cups breaks.",
    categories: ["word", "speed"],
    minPlayers: 2,
    recommendedPlayers: 3,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 8, source: "design-default", measured: false },
    inputs: ["text"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: false, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Turns of 10 seconds in a seeded order; an answer the bank accepts passes the jebena, a timeout breaks one of your cups (5 by default; 3, 5 or 7). The category changes after a seeded run of 5 to 8 accepted answers, after every timeout, and when its answers run out. The last player with a whole cup keeps the jebena; the match ends by 12 minutes. 100 points for each player you outlast, 10 for each cup still whole. Casual rooms only; practice-only (Stage 9.1).",
  },
  {
    id: "spectrum",
    title: "Spectrum",
    description: "One team, one secret spot on a scale. Take turns giving a clue; everyone else places a guess. The closer the team gets, the more points you share.",
    categories: ["party", "guessing"],
    minPlayers: 2,
    recommendedPlayers: 4,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "cooperative",
    duration: { minutes: 8, source: "design-default", measured: false },
    inputs: ["text", "numeric"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "shared-team-total", teamDerived: false },
    features: { practice: true, official: false, abstention: "whole-game" },
    tournament: { usesPerPlayerScores: false, supportsTeams: false },
    details: "Four rounds. Each round, one player sees a secret target on a scale (for example Cold to Hot) and gives a clue; everyone else places a guess from 0 to 100. The team's guess is the middle of the guesses: within 5 of the target scores 10, within 10 scores 7, within 20 scores 4. One shared team score out of 40. Casual rooms only; practice-only (Stage 9.3).",
  },
  {
    id: "family-questions",
    title: "Family Questions",
    description: "Questions the family wrote about itself, like \"Who was born in Nairobi?\". Everyone writes a few in the lobby; nobody sees them until the game.",
    categories: ["knowledge", "quiz", "party"],
    minPlayers: 2,
    recommendedPlayers: 4,
    maxPlayers: 10,
    playStyle: "solo",
    competition: "competitive",
    duration: { minutes: 8, source: "design-default", measured: false },
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: false },
    features: { practice: true, official: false, abstention: "per-question" },
    tournament: { usesPerPlayerScores: true, supportsTeams: false },
    details: "Up to ten questions the players wrote (at least three). 100 for a right answer. Nobody answers their own question; when some but not all of the others get it right, its writer earns 50 for a great question. Casual rooms only; practice-only (Stage 12.5).",
  },
  {
    id: "team-huddle",
    title: "Team Huddle",
    description: "A quiz you answer as a team. Teammates see each other's picks; the team's answer is what most of you pick.",
    categories: ["knowledge", "quiz", "team"],
    minPlayers: 4,
    recommendedPlayers: 6,
    maxPlayers: 10,
    playStyle: "team",
    competition: "competitive",
    duration: { minutes: 6, source: "design-default", measured: false },
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: true },
    features: { practice: true, official: true, abstention: "per-question" },
    tournament: { usesPerPlayerScores: true, supportsTeams: true },
    details: "Eight questions from the Trivia pool. Teammates see each other's picks live; other teams and the TV never see a team's option before the reveal. A team's answer is its members' most-picked option (a tie goes to the option picked first). 100 for a right answer, 25 more when the whole team picked it. A question closes early once every team agrees. Uses the night's teams, or deals two for the game. Casual rooms and Family Cups; in a Cup it can be Official, and it counts as a team game: the teams are ranked, and everyone gets their team's place (Stages 12.8 and 12.15).",
  },
  {
    id: "relay",
    title: "Relay",
    description: "A team race of 12 quick sums. Only the runner can answer; a right answer passes the baton. First team home wins.",
    categories: ["math", "speed", "team"],
    minPlayers: 4,
    recommendedPlayers: 6,
    maxPlayers: 10,
    playStyle: "team",
    competition: "competitive",
    duration: { minutes: 4, source: "design-default", measured: false },
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: true },
    features: { practice: true, official: true, abstention: "none" },
    tournament: { usesPerPlayerScores: true, supportsTeams: true },
    details: "Every team runs the same 12 sums in the same order; a team only sees its own current sum. Runners take turns within a team. A wrong answer freezes the runner for 3 s; 20 s without an answer passes the baton to the next teammate on the same sum. 10 per leg, plus 30/20/10 for the first three teams home. Uses the night's teams, or deals two. Casual rooms and Family Cups; in a Cup it can be Official, and it counts as a team game: the teams are ranked, and everyone gets their team's place (Stages 12.9 and 12.15).",
  },
  {
    id: "split-clues",
    title: "Split Clues",
    description: "Each teammate's phone shows different clues to the same answer. Put them together and type it: the faster team scores more.",
    categories: ["word", "puzzle", "team"],
    minPlayers: 4,
    recommendedPlayers: 6,
    maxPlayers: 10,
    playStyle: "team",
    competition: "competitive",
    duration: { minutes: 8, source: "design-default", measured: false },
    inputs: ["text"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: true },
    features: { practice: true, official: true, abstention: "none" },
    tournament: { usesPerPlayerScores: true, supportsTeams: true },
    details: "Six puzzles, one answer and six clues each; every teammate holds different clues, so the team has to talk. Help for every team at 30 s (the answer's shape), 45 s (all clues pooled) and 60 s (the first letter); a round ends at 75 s or when every team has solved it. A wrong try locks the team's answer box for 4 s. 100/75/55/40 by solve order, +25 catch-up for a team alone in last place and 100+ behind. Uses the night's teams (a team needs at least 2), or deals two. Casual rooms and Family Cups; in a Cup it can be Official, and it counts as a team game: the teams are ranked, and everyone gets their team's place (Stages 12.10 and 12.15).",
  },
  {
    id: "team-draw",
    title: "Team Draw",
    description: "Every team draws the same word at once: one teammate draws, the rest guess from their own team's drawing. The faster team scores more.",
    categories: ["creativity", "party", "team"],
    minPlayers: 4,
    recommendedPlayers: 6,
    maxPlayers: 10,
    playStyle: "team",
    competition: "competitive",
    duration: { minutes: 7, source: "design-default", measured: false },
    inputs: ["performance", "text"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: true },
    features: { practice: true, official: true, abstention: "none" },
    tournament: { usesPerPlayerScores: true, supportsTeams: true },
    details: "3 to 5 rounds (the biggest team's size), 75 seconds each; every team draws the same word, one drawer per team in turn. Teammates guess from their own team's drawing only; wrong guesses stay in the team, at most 15 a round, and each pauses the team's guessing for 2 s. A drawer can pass the pen once before drawing; after 20 s without drawing a teammate may take it. 100/75/55/40 by solve order, +25 catch-up for a team alone in last place and 100+ behind. The reveal shows every team's drawing. Uses the night's teams (a team needs at least 2), or deals two. Casual rooms and Family Cups; in a Cup it can be Official, and it counts as a team game: the teams are ranked, and everyone gets their team's place (Stages 12.11 and 12.15).",
  },
  {
    id: "territory",
    title: "Territory",
    description: "A team quiz on a board of 19 cells. Get the answer right and claim a cell next to your land, or steal one from another team. The biggest joined land wins.",
    categories: ["knowledge", "quiz", "team"],
    minPlayers: 4,
    recommendedPlayers: 6,
    maxPlayers: 10,
    playStyle: "team",
    competition: "competitive",
    duration: { minutes: 6, source: "design-default", measured: false },
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: true },
    features: { practice: true, official: true, abstention: "none" },
    tournament: { usesPerPlayerScores: true, supportsTeams: true },
    details: "8 Trivia-pool questions of 20 seconds; one tap answers for the whole team, and other teams only see that you answered. Teams that got it right claim a cell next to their land (an empty one, or a steal; homes can't be taken) during a 10-second claim; contested cells go to the team that answered first, and the slower team gets the nearest free cell. A team alone in last place and 30+ behind gets an extra cell when right. Score: 10 per cell plus 5 per cell in your biggest joined region. Uses the night's teams (a team needs at least 2), or deals two. Casual rooms and Family Cups; in a Cup it can be Official, and it counts as a team game: the teams are ranked, and everyone gets their team's place (Stages 12.12 and 12.15).",
  },
  {
    id: "tug-of-war",
    title: "Tug of War",
    description: "Everyone answers quick sums at once, and every right answer pulls the rope for your team. Your team's pull is per player, so a bigger team doesn't win by being bigger.",
    categories: ["math", "speed", "team"],
    minPlayers: 4,
    recommendedPlayers: 6,
    maxPlayers: 10,
    playStyle: "team",
    competition: "competitive",
    duration: { minutes: 4, source: "design-default", measured: false },
    inputs: ["choice"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: true },
    features: { practice: true, official: true, abstention: "none" },
    tournament: { usesPerPlayerScores: true, supportsTeams: true },
    details: "Three bouts of 40 seconds. Every player answers quick sums on their own phone (everyone gets the same sums in the same order); a right answer is one pull, a wrong one freezes you for 2 s. A team's pull is its right answers per player. Two teams pull a rope; three or four pull a knot in a star. Each bout: 100/75/55/40 by pull; a team alone in last place and 40+ behind pulls ×1.2 in the next bout. Uses the night's teams (a team needs at least 2), or deals two. Casual rooms and Family Cups; in a Cup it can be Official, and it counts as a team game: the teams are ranked, and everyone gets their team's place (Stages 12.13 and 12.15).",
  },
  {
    id: "know-your-rivals",
    title: "Know Your Rivals",
    description: "Answer \"this or that\" questions about yourself, privately; then your team guesses how the other teams answered. Only each team's totals are ever shown.",
    categories: ["social", "party", "team"],
    minPlayers: 4,
    recommendedPlayers: 6,
    maxPlayers: 10,
    playStyle: "team",
    competition: "competitive",
    duration: { minutes: 6, source: "design-default", measured: false },
    inputs: ["choice", "numeric"],
    devices: ["phone"],
    tv: "dashboard",
    intensity: "unknown",
    intensityNote: UNKNOWN_INTENSITY,
    scoring: { type: "per-player-points", teamDerived: true },
    features: { practice: true, official: true, abstention: "none" },
    tournament: { usesPerPlayerScores: true, supportsTeams: true },
    details: "Six questions (\"Tea or coffee?\"). Everyone answers privately for 20 seconds (or says \"Rather not say\"); then for 25 seconds each team guesses, for every other team, how many of its players picked the first option. The reveal shows each team's totals, never who picked what. Up to 30 points per rival guessed (exact), less the further off. A team alone in last place and 60+ behind gets +15 in a round it scores. Uses the night's teams (a team needs at least 2), or deals two. Casual rooms and Family Cups; in a Cup it can be Official, and it counts as a team game: the teams are ranked, and everyone gets their team's place (Stages 12.14 and 12.15).",
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
  if (m.recommendedPlayers !== reg.recommendedPlayers) errors.push(`recommendedPlayers: ${m.recommendedPlayers} does not match registry ${reg.recommendedPlayers}`);
  if (m.recommendedPlayers !== undefined && (m.recommendedPlayers < m.minPlayers || m.recommendedPlayers > m.maxPlayers)) errors.push(`recommendedPlayers: ${m.recommendedPlayers} is outside ${m.minPlayers}–${m.maxPlayers}`);
  // Stage 6.2: the client's solo shelf and the server's solo allowlist must agree.
  if ((m.soloPlay === true) !== (reg.soloPlay === true)) errors.push(`soloPlay: ${m.soloPlay ?? false} does not match registry ${reg.soloPlay ?? false}`);
  if (m.soloPlay === true && m.minPlayers > 1) errors.push(`soloPlay: a solo game needs a 1-player minimum (has ${m.minPlayers})`);
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
  // Stage 9.3: a cooperative game has one shared total and nothing per player: never official, never per-player
  // for a tournament, and its registry entry says so too (the room's result branch keys on the registry).
  const coop = m.competition === "cooperative";
  if (coop !== (reg.cooperative === true)) errors.push(`competition: "${m.competition}" does not match registry cooperative ${reg.cooperative ?? false}`);
  if (coop !== (m.scoring.type === "shared-team-total")) errors.push(`scoring.type: "${m.scoring.type}" contradicts competition "${m.competition}"`);
  if (coop && (m.features.official || m.tournament.usesPerPlayerScores || m.playStyle === "team" || reg.casualOnly !== true)) {
    errors.push("competition: a cooperative game is casual-only and practice-only, with no per-player or team-split scores");
  }
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
