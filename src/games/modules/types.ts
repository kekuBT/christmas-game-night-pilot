/**
 * Stage 5: the common contract for new game modules (AGENTS.md: "Each game
 * module implements common contract and pure tests").
 *
 * The eleven existing games live as branches inside src/server/room.ts and
 * are untouched. A module is pure game logic: plain JSON-serialisable state
 * (persisted as the game's `extra`), validated actions, phases, scores,
 * participation, and two views: the player's own (private) and the public
 * one (what the TV, spectators and everyone may see). RoomEngine owns
 * everything else: who may act, deadlines and clocks, the briefing,
 * finishing exactly once, the ledger, persistence and broadcast.
 */
import type { SessionSeason } from "../../shared/season.js";
import type { Participation, PhaseKind } from "../../server/lifecycle.js";
import type { GameSettings } from "../settings.js";
import type { TeamResult } from "../../shared/teamResult.js";
import type { FamilyGameQuestion } from "./family.js";
import type { HuddleQuestion } from "./teamHuddle.js";
import type { RelayQuestion } from "./relay.js";
import type { GameTeams } from "../../shared/teams.js";
import type { ItemSeason } from "../../shared/season.js";


/**
 * Stage 12.16 (D-S1216-01): a Split Clues puzzle as the game plays it. Declared here, not in splitClues.ts, so this
 * file (which the web app's code reaches) never imports a module that leads to a content bank. The puzzles live in the
 * content library (content/packs/split-clues-*.json), chosen by the room's content selection and handed to init.
 */
export interface SplitPuzzle {
  id: string;
  kind: string;
  answer: string;
  alts?: string[];
  clues: readonly [string, string, string, string, string, string];
  season?: ItemSeason;
}

export interface ModuleContext {
  /** Server time of this event (a deadline instant when a deadline is processed). */
  now: number;
  /** Stage 12.5: the acting player is the host or a cohost (for a module's director actions, e.g. skipping a question). */
  canDirect?: boolean;
  /** The game's roster. */
  players: readonly string[];
  /** Roster players still expected to act (everyone today). */
  active: readonly string[];
  /** Test time scale (1 in real play); multiply any module-owned durations by it. */
  scale: number;
  /**
   * Stage 9.1: the game's overall deadline (server ms), if it has one. A
   * phase that runs out at the same instant may yield to it (Jebena Rush:
   * the match limit wins, nobody loses a heart for the turn it cut).
   */
  gameDeadlineAt?: number;
}

export type ModuleResult = { ok: true; result?: unknown; wholeGameAbstain?: boolean } | { ok: false; reason: string };

export interface GameModule<S = unknown> {
  id: string;
  /** Intent actions this module handles (unique across all games). */
  actions: readonly string[];
  /** Actions that open something rather than play it: they don't count toward "have started". */
  nonPlayingActions?: readonly string[];
  /**
   * `season` (Stage 8.2): the content a solo or casual session plays, bound
   * at its start; absent in a Cup, whose games keep their full content.
   * Modules without seasonal content ignore it.
   */
  init(args: { players: readonly string[]; seed: number; season?: SessionSeason; settings?: GameSettings; /** Stage 12.5: Family Questions' questions, picked by the room at start. */ family?: readonly FamilyGameQuestion[];
    /** Stage 12.8: a game built for teams gets its teams (the night's, or two dealt for it) and, for Team Huddle, its questions. */ teams?: GameTeams; huddle?: readonly HuddleQuestion[];
    /** Stage 12.12: Territory's questions (from the Trivia pool, like Team Huddle's). */ quiz?: readonly HuddleQuestion[];
    /** Stage 12.9: Relay's sums (the same for every team). */ relay?: readonly RelayQuestion[];
    /** Stage 12.16: Split Clues' puzzles, chosen by the room's content selection (approval, season, usage). */ split?: readonly SplitPuzzle[];
    /**
     * Stage 12.10 (D-S1210-01): content ids this room has already played in this game, oldest first (from contentIds()
     * of its earlier games), so a module can deal unplayed content first. Absent: nothing played yet.
     */
    avoid?: readonly string[] }): S;
  intent(s: S, actorId: string, action: string, payload: Record<string, unknown>, ctx: ModuleContext): ModuleResult;
  /** "Sit this one out": a round, or (wholeGameAbstain) the rest of the game. */
  abstain(s: S, actorId: string, ctx: ModuleContext): ModuleResult;
  /** Lock-step games: the current phase (its clock comes from the policy table's phaseMs[kind]). */
  phase(s: S): { key: string; kind: PhaseKind } | null;
  /** The current phase's time ran out: close it with the input received, never inventing any. */
  expirePhase(s: S, ctx: ModuleContext): void;
  /**
   * Self-paced games: the earliest server instant at which a player's own
   * window closes (e.g. an answer window), if any. RoomEngine's tick calls
   * advance() at that instant, so a window closes even if nobody acts.
   */
  dueAt?(s: S): number | undefined;
  /** Close every player window that ended at or before ctx.now (missed: no points). */
  advance?(s: S, ctx: ModuleContext): void;
  finished(s: S, ctx: ModuleContext): boolean;
  /**
   * Stage 9.2 (review 6811101479): the room has finished this game, for any
   * reason (the module's own end, a match limit, a backstop). Drop private
   * state that no longer serves anyone (e.g. a player's last rejected try).
   * Called once, before the result is recorded; never changes scores.
   */
  onFinish?(s: S, ctx: ModuleContext): void;
  /**
   * Stage 12.9: play has begun (after the briefing, or at once without one). A module whose clocks run from the start
   * of play (Relay's turns) starts them here, from the server clock; init() never knows when play begins.
   */
  onPlayStart?(s: S, ctx: ModuleContext): void;
  /** Stage 12.10 (D-S1210-01): the content ids this game deals (puzzles, words), so the room's later games can avoid them. */
  contentIds?(s: S): string[];
  /**
   * Review 7058937812: the rules version frozen in this match's state when it was created. The briefing projects it
   * (the number only), so a match recovered from an older save is briefed with the rules it will play. Absent: the
   * game has one rules version.
   */
  rulesVersion?(s: S): number;
  /**
   * Stage 12.11 (D-S1211-01): games that deal from the same pack share one no-repeat history (Draw & Guess and Team
   * Draw: "draw-prompts"). Absent: the game's own id.
   */
  contentPool?: string;
  /**
   * Stage 9.3: a cooperative game's one shared result (registry
   * `cooperative: true`). The room records it as `outcome.team` at finalize
   * and projects it instead of per-player scores; `scores()` then stays an
   * internal compatibility copy. Required for a cooperative game.
   */
  teamResult?(s: S): TeamResult;
  /**
   * Stage 12.15-R (D-S1215R-03): a game built for teams whose own rules place its teams other than by points (Relay:
   * legs, then who completed their last leg first). Team id -> place (1-based, shared on a tie). The room records it
   * at the finish (outcome.teamPlaces); team results, medals and the Cup's team placement then follow it. Absent:
   * teams are placed by their scores.
   */
  teamPlaces?(s: S): Record<string, number>;
  /** Totals from everything completed so far (the final scores once finished). */
  scores(s: S, players: readonly string[]): Record<string, number>;
  participation(s: S, players: readonly string[]): { participation: Record<string, Participation>; completedUnits?: number; totalUnits?: number };
  /** Did anyone take a scoring action? */
  anyAction(s: S): boolean;
  playerView(s: S, actorId: string, ctx: { now: number; scale: number }): Record<string, unknown>;
  publicView(s: S, ctx: { now: number; scale: number }): Record<string, unknown>;
}

/** A seeded RNG for modules (mulberry32): the same seed always gives the same game. */
export function moduleRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/**
 * No repeats in a night (Stage 12.10, D-S1210-01; moved here in 12.11 so draw.ts can use it): `avoid` lists the ids
 * this room has played, oldest first. Items not in it come first (shuffled), then the played ones in the order they
 * were played, so the longest-ago come back first.
 */
export function dealAvoiding<T extends { id: string }>(items: readonly T[], rng: () => number, avoid: readonly string[] = []): T[] {
  const lastUse = new Map<string, number>();
  avoid.forEach((id, i) => lastUse.set(id, i));
  const fresh = seededShuffle(items.filter((x) => !lastUse.has(x.id)), rng);
  const played = items.filter((x) => lastUse.has(x.id)).sort((a, b) => lastUse.get(a.id)! - lastUse.get(b.id)!);
  return [...fresh, ...played];
}
