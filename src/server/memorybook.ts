import type { LedgerEvent } from "./room.js";

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
}

/**
 * Memory Book is event-grounded only: every entry must cite at least one
 * real game-finished ledger event. Human text is stored as a note; factual
 * result fields are derived from score-awarded events for the same game.
 */
export class MemoryBook {
  entries: MemoryBookEntry[] = [];
  private next = 1;

  addFromLedger(day: number, text: string, sourceEventIds: string[], ledger: LedgerEvent[]): MemoryBookEntry {
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
    for (const id of sourceEventIds) {
      const ev = byId.get(id)!;
      const scores = ledger.filter((e) => e.type === "score-awarded" && e.gameInstanceId === ev.gameInstanceId);
      for (const s of scores) derivedFacts.push(`${s.playerId ?? "unknown"}: ${s.points ?? 0} points`);
    }
    const entry: MemoryBookEntry = {
      id: `book-${this.next++}`,
      day,
      type: "game-result",
      text,
      sourceEventIds,
      approved: false,
      derivedFacts,
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

  /** Export includes approved entries only. Revoked entries never appear in exports. */
  exportMarkdown(roomName: string): string {
    const approved = this.entries.filter((e) => e.approved);
    const lines = [`# Christmas Memory Book — ${roomName}`, ""];
    if (approved.length === 0) lines.push("No approved highlights yet.");
    for (const e of approved) {
      lines.push(`## Day ${e.day}`);
      lines.push(`Note: ${e.text}`);
      if (e.derivedFacts.length > 0) {
        lines.push("From the ledger:");
        for (const f of e.derivedFacts) lines.push(`- ${f}`);
      }
      lines.push(`Sources: ${e.sourceEventIds.join(", ")}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  toJSON(): Record<string, unknown> {
    return { entries: this.entries, next: this.next };
  }

  static fromJSON(data: Record<string, unknown>): MemoryBook {
    const book = new MemoryBook();
    book.entries = (data["entries"] as MemoryBookEntry[]).map((e) => ({ ...e, derivedFacts: e.derivedFacts ?? [] }));
    book.next = typeof data["next"] === "number" ? data["next"] : book.entries.length + 1;
    return book;
  }
}
