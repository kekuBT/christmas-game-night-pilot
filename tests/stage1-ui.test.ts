/**
 * Stage 1 UI fixes (owner-approved 2026-11-07), pure parts. The browser driver
 * scripts/check-lobby-fixes.mjs covers the rendered behaviour.
 */
import { describe, expect, it } from "vitest";
import { linkReach } from "../apps/web/src/ui/mchezo/lib/share.js";
import { resolveReducedMotion } from "../apps/web/src/ui/mchezo/lib/motion.js";
import { outcomeLines } from "../apps/web/src/ui/mchezo/lib/lifecycle.js";

describe("invite links say who can open them", () => {
  it.each([
    ["localhost", "this-device"], ["127.0.0.1", "this-device"], ["[::1]", "this-device"],
    ["keku-mchezo-abc123-3000.app.github.dev", "private-preview"], ["X-3000.APP.GITHUB.DEV", "private-preview"],
    ["192.168.1.23", "public"], ["mchezo.example", "public"],
  ])("%s -> %s", (host, reach) => expect(linkReach(host)).toBe(reach));
});

describe("motion preference", () => {
  it("the OS reduced-motion setting is a floor; the in-app setting only reduces further", () => {
    expect(resolveReducedMotion("full", false)).toBe(false);
    expect(resolveReducedMotion("full", true)).toBe(true);
    expect(resolveReducedMotion("reduced", false)).toBe(true);
    expect(resolveReducedMotion("off", false)).toBe(true);
  });
});

describe("D1 results copy", () => {
  it("a game the server reports as not counting never says it counts", () => {
    const lines = outcomeLines({ reason: "completed", endedAt: 1, countsOfficially: false, participation: {}, note: "Only one player took part, so this game doesn’t count toward the Cup." } as never, true);
    expect(lines?.counts).toBe("Does not count toward the Family Cup.");
    expect(lines?.note).toMatch(/only one player/i);
  });
});
