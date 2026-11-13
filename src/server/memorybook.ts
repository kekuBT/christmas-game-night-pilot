import { createHash } from "node:crypto";
import { z } from "zod";
import type { LedgerEvent } from "./room.js";
import { TeamResultSchema } from "./persistence.js";
import { memoryTeamLine, type MemoryTeamFacts } from "../shared/memoryTeam.js";
import { entryFactLines, entryLabel, mdEscape, type BookContext, type BookMode, type MemorySource } from "../shared/memoryPresent.js";

export interface MemoryBookEntry {
  id: string;
  day: number;
  type: "game-result" | "highlight";
  text: string;
  sourceEventIds: string[];
  approved: boolean;
  approvedBy?: string;
  /** Facts derived from the ledger for the cited events — separate from the human-written text. */
  derivedFacts: string[];
  /**
   * Stage 10.3 (D-S103-01): a team game's result, derived and frozen by the
   * server from the cited game's finalized `outcome.team`. Absent on every
   * competitive entry (and on every entry saved before Stage 10.3).
   */
  team?: MemoryTeamFacts;
  /** Stage 10.4: the member who added it (set by the server; absent on older entries). */
  addedBy?: string;
  /**
   * Stage 11.2 (D-S112-01, D-S112-02): what the server recorded about the source when the entry was made: the room's
   * mode, the cited games' own days (Cup) and titles, and each competitive fact's player name. Absent on older entries.
   */
  source?: MemorySource;
}

/**
 * Stage 11.2: what the server knows about a cited game when an entry is made (from its own room, never the request).
 * `nameOf` is the room's players by id (undefined: not a player).
 */
export interface SourceContext {
  mode: BookMode;
  gameOf: (gameInstanceId: string) => { title: string; day?: number } | undefined;
  nameOf: (playerId: string) => string | undefined;
}

/** Stage 11.2 (D-S112-03): a recorded source, checked on restore; an invalid one is dropped (presentation only). */
export const MemorySourceSchema = z.object({
  mode: z.enum(["cup", "casual"]),
  days: z.array(z.number().int().min(1)).max(50).optional(),
  titles: z.array(z.string().max(120)).max(50),
  scores: z.array(z.object({ playerId: z.string().min(1).max(64), name: z.string().max(64).nullable(), points: z.number().int() }).strict()).max(500).optional(),
}).strict();

/**
 * Stage 10.4 (D-S104-02): one save attempt, by a member's own key. The fingerprint is of the request (the cited
 * finish, the note, the day), so a repeat of the same request returns the same entry and a different one is refused.
 */
export interface MemoryAttempt { entryId: string; fingerprint: string }

/** Stage 10.4: a fingerprint of what a save asks for (never stored as text). */
export function attemptFingerprint(sourceEventIds: string[], text: string, day: number): string {
  return createHash("sha256").update(JSON.stringify([sourceEventIds, text, day])).digest("hex").slice(0, 32);
}

/** Stage 10.3: a refusal with its own status and code (the HTTP layer sends both). */
export class MemoryRefused extends Error {
  constructor(readonly status: 400 | 409, readonly code: string, message: string) {
    super(message);
  }
}

const whole = z.number().int().min(0);
/** A saved team record, checked again on every restore (strict: no extra fields). */
export const MemoryTeamFactsSchema = z.object({
  kind: z.literal("spectrum"),
  gameInstanceId: z.string().min(1),
  finishedEventId: z.string().min(1),
  total: whole,
  max: whole.min(1),
  roundsRevealed: whole,
  roundsPlanned: whole.min(1),
  end: z.enum(["completed", "too-few-players"]),
}).strict().superRefine((t, ctx) => {
  if (t.total > t.max) ctx.addIssue({ code: "custom", message: "team total exceeds the maximum" });
  if (t.roundsRevealed > t.roundsPlanned) ctx.addIssue({ code: "custom", message: "more revealed rounds than planned" });
  if (t.end === "completed" && t.roundsRevealed !== t.roundsPlanned) ctx.addIssue({ code: "custom", message: "a completed match revealed every planned round" });
  if (t.end === "too-few-players" && t.roundsRevealed >= t.roundsPlanned) ctx.addIssue({ code: "custom", message: "an early ending revealed fewer rounds than planned" });
});

/** The parts of a game the team derivation reads (RoomEngine's GameInstance has them). */
export interface FinishedGameView {
  id: string;
  gameId: string;
  status: string;
  outcome?: { reason?: string; team?: unknown };
}

const NOT_SAVEABLE = "This team game's result can't be saved: it didn't finish with a final team result.";

/**
 * Stage 10.3 (D-S103-01, D-S103-03): the team facts for a cited finish, from
 * the room's own finalized game. Fails closed: an unfinished or voided game,
 * a missing or invalid team result, an ending the room imposed (`end: null`,
 * its time limit cutting a round), or a round count that doesn't fit the
 * ending is refused. Nothing here reads the request.
 */
export function teamFactsFor(game: FinishedGameView, finished: LedgerEvent): MemoryTeamFacts {
  if (finished.type !== "game-finished" || finished.gameInstanceId !== game.id) {
    throw new MemoryRefused(400, "NOT_A_FINISH", `Source event is not a finished game: ${finished.eventId}`);
  }
  if (game.status !== "finished" || !game.outcome || game.outcome.reason === "void" || game.outcome.team === undefined) {
    throw new MemoryRefused(409, "RESULT_NOT_SAVEABLE", NOT_SAVEABLE);
  }
  const parsed = TeamResultSchema.safeParse(game.outcome.team);
  if (!parsed.success || parsed.data.kind !== game.gameId) throw new MemoryRefused(409, "RESULT_NOT_SAVEABLE", NOT_SAVEABLE);
  const t = parsed.data;
  if (t.end === null) {
    throw new MemoryRefused(409, "RESULT_NOT_SAVEABLE", "This team game was stopped by the room's time limit in the middle of a round, so its result can't be saved.");
  }
  const facts: MemoryTeamFacts = {
    kind: t.kind,
    gameInstanceId: game.id,
    finishedEventId: finished.eventId,
    total: t.total,
    max: t.max,
    roundsRevealed: t.rounds.length,
    roundsPlanned: t.roundsPlanned,
    end: t.end,
  };
  if (!MemoryTeamFactsSchema.safeParse(facts).success) throw new MemoryRefused(409, "RESULT_NOT_SAVEABLE", NOT_SAVEABLE);
  return facts;
}

/**
 * Memory Book is event-grounded only: every entry must cite at least one
 * real game-finished ledger event. Human text is stored as a note; factual
 * result fields are derived from score-awarded events for the same game, or,
 * for a team game (Stage 10.3), from its frozen team result.
 */
export class MemoryBook {
  entries: MemoryBookEntry[] = [];
  private next = 1;
  /** Stage 10.4: save attempts by `${memberId}|${requestId}` (room-scoped: one book per room). */
  private attempts = new Map<string, MemoryAttempt>();
  /**
   * Stage 10.5 (D-S105-01): this book's revision, kept with it on disk and separate from the ledger's seq. Only a
   * committed change moves it (LocalServer.commitBook raises it on the staged copy before writing). Old books: 0.
   */
  private rev = 0;

  get revision(): number { return this.rev; }

  /** Stage 10.5: the next revision, on a staged copy that is about to be written (D-S105-01). */
  bumpRevision(): void { this.rev += 1; }

  /**
   * Stage 10.4 repair (D-S104-06): an independent copy (entries, the id counter and the save keys), so a change can be
   * made and written to disk before anyone sees it. Nothing in the copy is shared with this book.
   */
  clone(): MemoryBook {
    const copy = new MemoryBook();
    copy.entries = structuredClone(this.entries);
    copy.next = this.next;
    copy.attempts = new Map([...this.attempts].map(([k, v]) => [k, { ...v }]));
    copy.rev = this.rev;
    return copy;
  }

  /** Stage 10.4: an earlier attempt by this member with this key, and its entry, if any. */
  attemptFor(memberId: string, requestId: string): { attempt: MemoryAttempt; entry: MemoryBookEntry | undefined } | null {
    const attempt = this.attempts.get(`${memberId}|${requestId}`);
    return attempt ? { attempt, entry: this.entries.find((e) => e.id === attempt.entryId) } : null;
  }

  /** Stage 10.4: remember that this member's key made this entry. */
  recordAttempt(memberId: string, requestId: string, entryId: string, fingerprint: string): void {
    this.attempts.set(`${memberId}|${requestId}`, { entryId, fingerprint });
  }

  addFromLedger(day: number, text: string, sourceEventIds: string[], ledger: LedgerEvent[], ctx?: SourceContext): MemoryBookEntry {
    if (!Array.isArray(sourceEventIds) || sourceEventIds.length === 0) {
      throw new Error("At least one source event is required");
    }
    const byId = new Map(ledger.map((e) => [e.eventId, e]));
    for (const id of sourceEventIds) {
      const ev = byId.get(id);
      if (!ev) throw new Error(`Source event does not exist: ${id}`);
      if (ev.type !== "game-finished") throw new Error(`Source event is not a finished game: ${id}`);
    }
    const derivedFacts: string[] = [];
    // Stage 11.2: each fact's readable twin, from the same score events and the room's own players (D-S112-02).
    const scores: NonNullable<MemorySource["scores"]> = [];
    for (const id of sourceEventIds) {
      const ev = byId.get(id)!;
      const events = ledger.filter((e) => e.type === "score-awarded" && e.gameInstanceId === ev.gameInstanceId);
      for (const s of events) {
        const playerId = s.playerId ?? "unknown";
        derivedFacts.push(`${playerId}: ${s.points ?? 0} points`);
        scores.push({ playerId, name: (s.playerId && ctx?.nameOf(s.playerId)) || null, points: s.points ?? 0 });
      }
    }
    const games = sourceEventIds.map((id) => byId.get(id)!.gameInstanceId).map((gid) => (gid ? ctx?.gameOf(gid) : undefined));
    const source = ctx ? sourceFor(ctx, games, scores) : undefined;
    const entry: MemoryBookEntry = {
      id: `book-${this.next++}`,
      day: gameDay(games[0], day),
      type: "game-result",
      text,
      sourceEventIds,
      approved: false,
      derivedFacts,
      ...(source ? { source } : {}),
    };
    this.entries.push(entry);
    return entry;
  }

  /**
   * Stage 10.3: a pending entry for one team game's finish, with the facts
   * the server derived (`teamFactsFor`). It cites exactly that finish.
   */
  addTeamResult(day: number, text: string, facts: MemoryTeamFacts, gameTitle: string, ctx?: SourceContext): MemoryBookEntry {
    const checked = MemoryTeamFactsSchema.parse(facts);
    const game = ctx?.gameOf(checked.gameInstanceId);
    const source = ctx ? sourceFor(ctx, [game ?? { title: gameTitle }]) : undefined;
    const entry: MemoryBookEntry = {
      id: `book-${this.next++}`,
      day: gameDay(game, day),
      type: "game-result",
      text,
      sourceEventIds: [checked.finishedEventId],
      approved: false,
      derivedFacts: [memoryTeamLine(checked, gameTitle)],
      team: checked,
      ...(source ? { source } : {}),
    };
    this.entries.push(entry);
    return entry;
  }

  approve(entryId: string, approverId: string): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) throw new Error("Unknown entry");
    entry.approved = true;
    entry.approvedBy = approverId;
  }

  revoke(entryId: string): void {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) throw new Error("Unknown entry");
    entry.approved = false;
    entry.approvedBy = undefined;
  }

  /**
   * Export includes approved entries only. Revoked entries never appear in exports.
   * Stage 10.3 (D-S103-06): a neutral title (the server has no device look); a team
   * entry's facts come from its frozen team record, under "From the game".
   */
  exportMarkdown(roomName: string, ctx: BookContext = { roomKind: "cup", nameOf: () => undefined }): string {
    const approved = this.entries.filter((e) => e.approved);
    // Stage 11.2 (D-S112-01..03): the shared presentation rule, and everything typed escaped.
    const lines = [`# Mchezo Memory Book — ${mdEscape(roomName)}`, ""];
    if (approved.length === 0) lines.push("No approved highlights yet.");
    for (const e of approved) {
      lines.push(`## ${mdEscape(entryLabel(e, ctx))}`);
      lines.push(`Note: ${mdEscape(e.text)}`);
      if (e.derivedFacts.length > 0) {
        lines.push(e.team ? "From the game:" : "From the ledger:");
        for (const f of entryFactLines(e, ctx)) lines.push(`- ${mdEscape(f)}`);
      }
      lines.push(`Sources: ${e.sourceEventIds.join(", ")}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  toJSON(): Record<string, unknown> {
    return { entries: this.entries, next: this.next, attempts: Object.fromEntries(this.attempts), revision: this.rev };
  }

  /**
   * Restores a saved book. Stage 10.3: a team record is checked again, and must cite its own finish; an
   * invalid one refuses the book, under the existing restore rule (the room loads without it, the server
   * warns, and the file is left in place).
   */
  static fromJSON(data: Record<string, unknown>): MemoryBook {
    const book = new MemoryBook();
    book.entries = (data["entries"] as MemoryBookEntry[]).map((e) => {
      const { source, ...rest } = e;
      const restored: MemoryBookEntry = { ...rest, derivedFacts: e.derivedFacts ?? [] };
      // Stage 11.2 (D-S112-03): a recorded source only changes how the entry is shown, so an invalid one is dropped
      // (the entry falls back to the older-entry rule) rather than refusing the book.
      if (source !== undefined) { const s = MemorySourceSchema.safeParse(source); if (s.success) restored.source = s.data; }
      if (e.team !== undefined) {
        const t = MemoryTeamFactsSchema.safeParse(e.team);
        if (!t.success) throw new Error(`entry ${e.id} has an invalid team result`);
        if (e.sourceEventIds?.length !== 1 || e.sourceEventIds[0] !== t.data.finishedEventId) throw new Error(`entry ${e.id} cites something other than its team result's finish`);
        restored.team = t.data;
      }
      return restored;
    });
    book.next = typeof data["next"] === "number" ? data["next"] : book.entries.length + 1;
    // Stage 10.5 (D-S105-01): a book from before this stage has no revision and starts at 0; so does a malformed one.
    const rev = data["revision"];
    book.rev = typeof rev === "number" && Number.isSafeInteger(rev) && rev >= 0 ? rev : 0;
    // Stage 10.4: save attempts (absent in older books). A malformed one is dropped: losing it can only let a
    // retry create a second pending entry, never change or approve one.
    const attempts = data["attempts"];
    if (attempts && typeof attempts === "object") {
      for (const [k, v] of Object.entries(attempts as Record<string, unknown>)) {
        const a = v as Partial<MemoryAttempt> | null;
        if (a && typeof a.entryId === "string" && typeof a.fingerprint === "string" && book.entries.some((e) => e.id === a.entryId)) book.attempts.set(k, { entryId: a.entryId, fingerprint: a.fingerprint });
      }
    }
    return book;
  }
}

/** Stage 11.2: the entry's day is its first cited game's own day when the room knows it, else what was asked. */
function gameDay(game: { day?: number } | undefined, fallback: number): number {
  return game?.day !== undefined && Number.isSafeInteger(game.day) && game.day >= 1 ? game.day : fallback;
}

/** Stage 11.2 (D-S112-01): the recorded source, from the room's own state. */
function sourceFor(ctx: SourceContext, games: ({ title: string; day?: number } | undefined)[], scores?: NonNullable<MemorySource["scores"]>): MemorySource {
  const days = [...new Set(games.map((g) => g?.day).filter((d): d is number => d !== undefined && Number.isSafeInteger(d) && d >= 1))].sort((a, b) => a - b);
  return {
    mode: ctx.mode,
    ...(ctx.mode === "cup" && days.length ? { days } : {}),
    titles: games.map((g) => g?.title ?? ""),
    ...(scores ? { scores } : {}),
  };
}
