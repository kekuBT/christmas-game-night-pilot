/**
 * `npm run serve:device-test` (docs/REAL_DEVICE_TESTING.md): the real-device
 * test server. It must start in content test mode with its own data folder,
 * print the address phones should use, keep the line the gate parses, and
 * refuse to run in production.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");
const ENTRY = join(ROOT, "src", "server", "serve-device-test.ts");
const cwd = mkdtempSync(join(tmpdir(), "mchezo-devtest-"));
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

function run(env: Record<string, string>, until: RegExp): Promise<{ out: string; code: number | null }> {
  return new Promise((done) => {
    const base = { ...process.env };
    delete base["MCHEZO_CONTENT_TEST_MODE"];
    delete base["MCHEZO_DATA_DIR"];
    delete base["NODE_ENV"];
    const p = spawn(TSX, [ENTRY], { cwd, env: { ...base, PORT: "0", ...env } });
    let out = "";
    const finish = (code: number | null) => { clearTimeout(timer); done({ out, code }); };
    const timer = setTimeout(() => { p.kill("SIGTERM"); }, 20_000);
    const onData = (d: Buffer) => { out += d.toString(); if (until.test(out)) p.kill("SIGTERM"); };
    p.stdout.on("data", onData);
    p.stderr.on("data", onData);
    p.on("exit", finish);
  });
}

describe("serve:device-test", () => {
  it("starts in test mode, uses ./data-device-test, prints the gate line and the Wi-Fi address", async () => {
    const { out } = await run({}, /Phones on the same Wi-Fi|No network address found/);
    expect(out).toMatch(/TEST MODE: provisional content treated as approved \(not a human review\)/);
    expect(out).toMatch(/Christmas Game Night server on http:\/\/localhost:\d+ /);
    expect(out).toMatch(/Phones on the same Wi-Fi: open http:\/\/\d+\.\d+\.\d+\.\d+:\d+|No network address found/);
    expect(existsSync(join(cwd, "data-device-test"))).toBe(true);
  }, 30_000);

  it("in a GitHub Codespace, prints the private forwarded HTTPS address instead of the Wi-Fi hint", async () => {
    const { out } = await run({ CODESPACE_NAME: "keku-mchezo-abc123", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" }, /Codespaces preview/);
    expect(out).toMatch(/Codespaces preview \(private: only your signed-in GitHub account can open it\): https:\/\/keku-mchezo-abc123-\d+\.app\.github\.dev\//);
    expect(out).not.toMatch(/Phones on the same Wi-Fi/);
  }, 30_000);

  it("is refused in production (test-mode content must never reach a real night)", async () => {
    const { out, code } = await run({ NODE_ENV: "production" }, /not allowed in production/);
    expect(out).toMatch(/MCHEZO_CONTENT_TEST_MODE is for tests only and is not allowed in production/);
    expect(code).toBe(2);
  }, 30_000);
});
