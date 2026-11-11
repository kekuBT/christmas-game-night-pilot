/**
 * Every script in scripts/ is either run by the gate or explicitly classified
 * as not a check (docs/TESTING.md, "Scripts that are not checks"), so a script
 * outside the gate can never be mistaken for a passing check (owner direction
 * 2026-11-07, after scripts/clickthrough-api.mjs went stale unnoticed).
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const scripts = readdirSync(join(root, "scripts")).filter((f) => f.endsWith(".mjs")).sort();
const IN_GATE = (f: string) => /^check-.+\.mjs$/.test(f) || f === "e2e-browser.mjs";
const NOT_CHECKS: Record<string, string> = {
  "gate.mjs": "the gate",
  "gate-selftest.mjs": "the gate's self-test",
  "clickthrough-api.mjs": "retired tombstone",
  "measure-persistence.mjs": "a measurement tool (Stage 5.1, Phase 4)",
  "make-icons.mjs": "an asset generator (Stage 8.3: the install icons)",
};
const isTool = (f: string) => /^screenshot-.+\.mjs$/.test(f);

describe("script inventory", () => {
  it("every top-level script is in the gate, a screenshot tool, or listed as not a check", () => {
    const unclassified = scripts.filter((f) => !IN_GATE(f) && !isTool(f) && !Object.hasOwn(NOT_CHECKS, f));
    expect(unclassified).toEqual([]);
  });

  it("docs/TESTING.md lists every script that is not a check", () => {
    const doc = readFileSync(join(root, "docs", "TESTING.md"), "utf8");
    for (const f of Object.keys(NOT_CHECKS)) expect(doc).toContain(`\`${f}\``);
    expect(doc).toContain("`screenshot-*.mjs`");
  });

  it("the gate really discovers every check-* driver (its own filter, not a list)", () => {
    const gate = readFileSync(join(root, "scripts", "gate.mjs"), "utf8");
    expect(gate).toMatch(/\^check-\.\+\\\.mjs\$/);
    expect(gate).toContain("e2e-browser.mjs");
  });

  it("the retired click-through can never report success", () => {
    const r = spawnSync(process.execPath, [join(root, "scripts", "clickthrough-api.mjs"), "http://localhost:1"], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/RETIRED/);
  });
});
