// Sprint 3 (Workstream H): the driver failure classifier.
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs driver helper, no type declarations
import { classify } from "../scripts/lib/diagnose.mjs";

const now = 1_000_000;
const playing = (extra: Record<string, unknown> = {}) => ({ ok: true, serverNow: now, game: { status: "playing", deadlineAt: now + 60_000, ...extra } });
const screen = (extra: Record<string, unknown> = {}) => ({ label: "Question 2 of 10", clock: "", outcome: "", results: false, snippet: "Question 2", ...extra });

describe("driver failure types", () => {
  it("names each situation", () => {
    expect(classify({ ok: false, why: "x" }, screen())).toBe("server-unreachable");
    expect(classify({ ok: true, serverNow: now, game: null }, screen())).toBe("no-game");
    expect(classify({ ok: true, serverNow: now, game: { status: "finished" } }, screen())).toBe("server-ended-client-behind");
    expect(classify({ ok: true, serverNow: now, game: { status: "finished" } }, screen({ results: true }))).toBe("finished-and-shown");
    expect(classify(playing({ deadlineAt: now - 6_000 }), screen())).toBe("deadline-overdue");
    expect(classify(playing({ phaseDeadlineAt: now - 6_000 }), screen())).toBe("deadline-overdue");
    expect(classify(playing({ deadlineAt: now - 2_000 }), screen())).toBe("waiting-on-players"); // within the sweep's grace
    expect(classify(playing(), screen({ snippet: "You’re in, Bea." }))).toBe("client-not-on-game");
    expect(classify(playing(), screen())).toBe("waiting-on-players");
  });
});
