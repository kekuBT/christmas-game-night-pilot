// Owner-approved (Sprint 3): the test-only lifecycle time scale is isolated
// from production and cannot be reached through any client request.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Harness } from "./helpers/harness.js";
import { GAME_POLICIES } from "../src/server/lifecycle.js";
import { LocalServer } from "../src/server/http.js";

function runServe(env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], {
      env: { ...process.env, PORT: "0", MCHEZO_DATA_DIR: mkdtempSync(join(tmpdir(), "mz-scale-")), ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d.toString(); if (/on http:\/\/localhost/.test(out)) child.kill("SIGTERM"); });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.on("exit", (code) => resolve({ code, out }));
  });
}

describe("test-only lifecycle scale", () => {
  it("is refused when NODE_ENV=production (the server does not start)", async () => {
    const r = await runServe({ NODE_ENV: "production", MCHEZO_LIFECYCLE_SCALE: "0.1" });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/tests only and is not allowed in production/);
  }, 30_000);

  it("rejects nonsense values", async () => {
    const r = await runServe({ MCHEZO_LIFECYCLE_SCALE: "-3" });
    expect(r.code).toBe(2);
  }, 30_000);

  let h: Harness | undefined;
  afterEach(async () => { await h?.dispose(); h = undefined; });

  it("cannot be set through any request: a body/query/header asking for it changes nothing", async () => {
    h = await new Harness().start();
    await h.createRoom();
    const ada = await h.join("Ada", { host: true });
    await h.join("Bea");
    const r = await h.post(`/rooms/${h.roomId}/games?lifecycleScale=0.01&scale=0.01`, { gameId: "trivia", official: false, seed: 1, lifecycleScale: 0.01, scale: 0.01 }, ada.token);
    expect(r.status).toBe(201);
    const g = h.game(r.body["gameId"] as string);
    expect(g.deadlineAt! - g.startedAt!).toBe(GAME_POLICIES["trivia"]!.gameWindowMs);
    const catalog = (await h.get("/games")).body as unknown as { id: string; lifecycle?: { gameWindowMs: number } }[];
    expect(catalog.find((x) => x.id === "trivia")!.lifecycle!.gameWindowMs).toBe(GAME_POLICIES["trivia"]!.gameWindowMs);
  });

  it("defaults to real durations and ignores invalid programmatic values", () => {
    for (const lifecycleScale of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-scale-")), heartbeatMs: null, lifecycleSweepMs: null, lifecycleScale });
      expect((s as unknown as { lifecycleScale: number }).lifecycleScale).toBe(1);
      void s.close();
    }
  });
});
