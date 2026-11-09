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
import type { Participation, PhaseKind } from "../../server/lifecycle.js";

export interface ModuleContext {
  /** Server time of this event (a deadline instant when a deadline is processed). */
  now: number;
  /** The game's roster. */
  players: readonly string[];
  /** Roster players still expected to act (everyone today). */
  active: readonly string[];
  /** Test time scale (1 in real play); multiply any module-owned durations by it. */
  scale: number;
}

export type ModuleResult = { ok: true; result?: unknown; wholeGameAbstain?: boolean } | { ok: false; reason: string };

export interface GameModule<S = unknown> {
  id: string;
  /** Intent actions this module handles (unique across all games). */
  actions: readonly string[];
  /** Actions that open something rather than play it: they don't count toward "have started". */
  nonPlayingActions?: readonly string[];
  init(args: { players: readonly string[]; seed: number }): S;
  intent(s: S, actorId: string, action: string, payload: Record<string, unknown>, ctx: ModuleContext): ModuleResult;
  /** "Sit this one out": a round, or (wholeGameAbstain) the rest of the game. */
  abstain(s: S, actorId: string, ctx: ModuleContext): ModuleResult;
  /** Lock-step games: the current phase (its clock comes from the policy table's phaseMs[kind]). */
  phase(s: S): { key: string; kind: PhaseKind } | null;
  /** The current phase's time ran out: close it with the input received, never inventing any. */
  expirePhase(s: S, ctx: ModuleContext): void;
  finished(s: S, ctx: ModuleContext): boolean;
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
