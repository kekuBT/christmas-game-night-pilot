import { describe, expect, it } from "vitest";
import { resolveReducedMotion } from "../apps/web/src/ui/mchezo/lib/motion.js";

describe("resolveReducedMotion (J.1: OS preference is a floor)", () => {
  it("full setting + no OS preference → animate", () => {
    expect(resolveReducedMotion("full", false)).toBe(false);
  });
  it("full setting + OS preference → reduce (the floor)", () => {
    expect(resolveReducedMotion("full", true)).toBe(true);
  });
  it("reduced setting → reduce regardless of OS", () => {
    expect(resolveReducedMotion("reduced", false)).toBe(true);
    expect(resolveReducedMotion("reduced", true)).toBe(true);
  });
  it("off setting → reduce regardless of OS", () => {
    expect(resolveReducedMotion("off", false)).toBe(true);
    expect(resolveReducedMotion("off", true)).toBe(true);
  });
});
