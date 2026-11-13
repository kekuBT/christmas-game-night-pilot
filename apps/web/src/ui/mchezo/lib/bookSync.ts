// Stage 10.5 (docs/stage10/stage105.md §4–5; D-S105-03, D-S105-04): keeping one page's Memory Book current.
//
// The server's book has a revision that only a committed change moves. A page hears revisions (from projections and
// "book" frames; neither carries any note) and fetches the authoritative snapshot. These rules decide what a page does
// with what it hears and what it gets back, so stale, out-of-order and other-room replies can never replace a newer
// book, and an export is never built from a snapshot the page already knows is out of date.
import type { MemoryEntry } from "../../../types.js";

/** The authoritative snapshot: GET /rooms/:id/memory?revision=1. */
export interface BookSnapshot { revision: number; entries: MemoryEntry[] }

/** One page's book sync for one room. `heard`: the highest revision heard of; `applied`: the revision on screen. */
export interface BookSync {
  roomId: string;
  heard: number;
  applied: number;
  inFlight: boolean;
  /** A newer revision was heard while a fetch was running: fetch once more when it ends. */
  again: boolean;
  /**
   * Stage 10.5 repair (review 6845502314; D-S105-06): failed refreshes in a row, and the pending retry. A poll that
   * reports the same revision doesn't refetch by itself, so a failed refresh must schedule its own retry.
   */
  failures: number;
  retry: ReturnType<typeof setTimeout> | null;
}

export const NOTHING = -1;

export function freshSync(roomId: string): BookSync {
  return { roomId, heard: NOTHING, applied: NOTHING, inFlight: false, again: false, failures: 0, retry: null };
}

/** The wait before retrying after `failures` failed refreshes in a row: 1, 2, 4, then 8 s at most (no storm). */
export const RETRY_MAX_MS = 8000;
export function retryDelay(failures: number): number {
  return Math.min(RETRY_MAX_MS, 1000 * 2 ** Math.max(0, failures - 1));
}

/** Retry only a failed refresh, only while the page is still behind what it has heard of. */
export function shouldRetry(s: Pick<BookSync, "heard" | "applied">, failed: boolean): boolean {
  return failed && s.heard > s.applied;
}

export function isBookSnapshot(x: unknown): x is BookSnapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return typeof s["revision"] === "number" && Number.isSafeInteger(s["revision"]) && (s["revision"] as number) >= 0 && Array.isArray(s["entries"]);
}

/**
 * Something told this page the book is at `revision` (a frame, or a projection's memoryRevision). The heard revision
 * only rises, so a late or repeated notice can't lower it. Returns whether the page is now behind what it shows.
 */
export function hear(s: BookSync, revision: unknown): boolean {
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return false;
  if (revision > s.heard) {
    s.heard = revision;
    if (s.inFlight) s.again = true;
  }
  return s.heard > s.applied;
}

/**
 * A snapshot came back. It replaces what is shown only if it is for this page's room and newer than what is shown;
 * anything else (a reply for a room the page has left, an older or equal revision, a reply overtaken by a newer one)
 * is dropped. Applying it also counts as hearing its revision.
 */
export function accept(s: BookSync, roomId: string, reply: BookSnapshot): boolean {
  if (roomId !== s.roomId) return false;
  if (reply.revision > s.heard) s.heard = reply.revision;
  if (reply.revision <= s.applied) return false;
  s.applied = reply.revision;
  return true;
}

/** Export (D-S105-04): build from this snapshot, fetch a fresh one, or give up because the book keeps moving. */
export type ExportStep = "use" | "retry" | "cancel";
export const EXPORT_ATTEMPTS = 3;

export function exportStep(snapshotRevision: number, heardRevision: number, attempt: number, attempts = EXPORT_ATTEMPTS): ExportStep {
  if (snapshotRevision >= heardRevision) return "use";
  return attempt < attempts ? "retry" : "cancel";
}

/** The Markdown on screen was made at `exportRevision`; it's stale once the page knows of a newer book. */
export function exportIsStale(exportRevision: number, s: Pick<BookSync, "heard" | "applied">): boolean {
  return Math.max(s.heard, s.applied) > exportRevision;
}
