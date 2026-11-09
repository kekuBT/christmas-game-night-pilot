// Pure layout helpers for Memory Book exports, so long-content behaviour
// is unit-testable without a browser (review 5769121221 #5).


/** Share-image selection: at most `limit` entries, with the overflow count
 *  surfaced to the user instead of silently clipped. */
export function selectShareEntries<T>(approved: T[], limit = 8): { shown: T[]; overflow: number } {
  return { shown: approved.slice(0, limit), overflow: Math.max(0, approved.length - limit) };
}

/**
 * Split individual lines across pages (review 5769441799 P2):
 * a single oversized entry is split at line boundaries,
 * so no line ever lands past the page bottom. A line taller than a page
 * still gets its own page (it cannot be split further).
 */
export function paginateLines(lineHeights: number[], pageHeight: number, startY: number): number[][] {
  const pages: number[][] = [[]];
  let y = startY;
  for (let i = 0; i < lineHeights.length; i++) {
    const h = lineHeights[i]!;
    if (y + h > pageHeight && pages[pages.length - 1]!.length > 0) {
      pages.push([]);
      y = startY;
    }
    pages[pages.length - 1]!.push(i);
    y += h;
  }
  return pages;
}

/** Clamp a canvas note baseline inside the 1080px share image. */
export function canvasNoteY(y: number, maxY = 1040): number {
  return Math.min(y, maxY);
}

/**
 * Stage 4 (S3-MEM-01): a file name that says what and when: the room's public
 * code and the local date, e.g. christmas-memory-book-ABC123-2026-11-09.pdf.
 */
export function exportFilename(ext: "pdf" | "png", roomCode: string | undefined, now: Date): string {
  const code = (roomCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `christmas-memory-book${code ? `-${code}` : ""}-${date}.${ext}`;
}

/**
 * A ledger fact ("player-2: 120 points") with the player's room name in
 * place of the internal id, for screens inside the room. Unknown ids are
 * left as they are; nothing else in the text changes.
 */
export function readableFact(fact: string, nameOf: (id: string) => string | undefined): string {
  const m = /^([^:]+): (.*)$/.exec(fact);
  if (!m) return fact;
  const name = nameOf(m[1]!);
  return name ? `${name}: ${m[2]}` : fact;
}
