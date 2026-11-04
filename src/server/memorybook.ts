import type { LedgerEvent } from "./room.js";

export interface MemoryBookEntry {
  id: string;
  day: number;
  type: "game-result" | "highlight";
  text: string;
  sourceEventIds: string[];
  approved: boolean;
  approvedBy?: string;
}

/** Memory Book is event-grounded only: every entry must cite ledger events that exist. */
export class MemoryBook {
  entries: MemoryBookEntry[] = [];
  private next = 1;

  addFromLedger(day: number, text: string, sourceEventIds: string[], ledger: LedgerEvent[]): MemoryBookEntry {
    const existing = new Set(ledger.map((e) => e.eventId));
    for (const id of sourceEventIds) {
      if (!existing.has(id)) throw new Error(`Source event does not exist: ${id}`);
    }
    const entry: MemoryBookEntry = {
      id: `book-${this.next++}`,
      day,
      type: "game-result",
      text,
      sourceEventIds,
      approved: false,
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
      lines.push(e.text);
      lines.push(`Sources: ${e.sourceEventIds.join(", ")}`);
      lines.push("");
    }
    return lines.join("\n");
  }
}
