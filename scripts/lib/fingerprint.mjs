// Source fingerprint: a hash of every file that can change what the gate
// builds or runs (tracked and untracked-but-not-ignored files under the
// paths below). The gate records it when it builds, and re-checks it
// before every later step and at the end, so a result can never be
// reported for a tree different from the one that was built.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const FINGERPRINT_PATHS = [
  "apps",
  "src",
  "scripts",
  "tests",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.mjs",
];

export function listSourceFiles(repoRoot) {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...FINGERPRINT_PATHS], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean).sort();
}

export function sourceFingerprint(repoRoot) {
  const hash = createHash("sha256");
  let count = 0;
  for (const rel of listSourceFiles(repoRoot)) {
    let content;
    try {
      content = readFileSync(join(repoRoot, rel));
    } catch {
      content = Buffer.from("<deleted>"); // tracked but deleted in the working tree
    }
    hash.update(rel).update("\0").update(content).update("\0");
    count++;
  }
  return { hash: hash.digest("hex"), files: count };
}

export function gitInfo(repoRoot) {
  const run = (...args) => {
    try {
      return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  const status = run("status", "--porcelain");
  return {
    head: run("rev-parse", "HEAD"),
    branch: run("rev-parse", "--abbrev-ref", "HEAD"),
    dirty: status === null ? null : status.split("\n").filter(Boolean),
  };
}
