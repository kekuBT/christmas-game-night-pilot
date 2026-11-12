/** Stage 4 (S3-MEM-01): Memory Book export file names and readable ledger facts. */
import { describe, expect, it } from "vitest";
import { exportFilename, readableFact } from "../apps/web/src/components/exportLayout.js";

describe("Memory Book exports", () => {
  it("file names carry the room code and the local date", () => {
    const d = new Date(2026, 10, 9, 21, 5);
    expect(exportFilename("pdf", "abc123", d)).toBe("christmas-memory-book-ABC123-2026-11-09.pdf");
    expect(exportFilename("png", "ABC123", d)).toBe("christmas-memory-book-ABC123-2026-11-09.png");
    expect(exportFilename("pdf", undefined, d)).toBe("christmas-memory-book-2026-11-09.pdf");
    expect(exportFilename("pdf", "../x?", d)).toBe("christmas-memory-book-X-2026-11-09.pdf");
    // Stage 10.3 (D-S103-06): named for the device's look, like the title inside it.
    expect(exportFilename("pdf", "abc123", d, "everyday")).toBe("mchezo-memory-book-ABC123-2026-11-09.pdf");
    expect(exportFilename("png", "abc123", d, "christmas")).toBe("christmas-memory-book-ABC123-2026-11-09.png");
  });
  it("ledger facts read with names inside the room; unknown ids and other text stay as they are", () => {
    const names: Record<string, string> = { "player-1": "Keku" };
    expect(readableFact("player-1: 120 points", (id) => names[id])).toBe("Keku: 120 points");
    expect(readableFact("player-9: 0 points", (id) => names[id])).toBe("player-9: 0 points");
    expect(readableFact("no colon here", (id) => names[id])).toBe("no colon here");
  });
});
