/**
 * GitHub Codespaces phone preview (docs/CODESPACES_PREVIEW.md). Guards the
 * owner's limits: the port stays private, no paid or larger machine is asked
 * for, no prebuilds, secrets or extra permissions, and the server is the
 * test-mode device-test server, never production.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const raw = readFileSync(join(ROOT, ".devcontainer", "devcontainer.json"), "utf8");
const cfg = JSON.parse(raw) as Record<string, unknown>;
const script = readFileSync(join(ROOT, ".devcontainer", "start-preview.sh"), "utf8");

describe("Codespaces preview config", () => {
  it("forwards only port 3000, and never makes it public", () => {
    expect(cfg["forwardPorts"]).toEqual([3000]);
    expect(raw).not.toMatch(/"visibility"|public/i);
    expect(script).not.toMatch(/visibility|--public|gh codespace ports/);
  });

  it("asks for the smallest machine and nothing billable beyond the codespace itself", () => {
    expect(cfg["hostRequirements"]).toEqual({ cpus: 2 });
    expect(raw).not.toMatch(/prebuild|secrets|"features"|runArgs|privileged|capAdd/i);
    expect(Object.keys(cfg).sort()).toEqual(["customizations", "forwardPorts", "hostRequirements", "image", "name", "portsAttributes", "postCreateCommand", "postStartCommand"]);
  });

  it("runs Node 22 and starts the test-mode device-test server, not production", () => {
    expect(cfg["image"]).toMatch(/javascript-node:.*22/);
    expect(cfg["postCreateCommand"]).toBe("npm ci && npm run build:web");
    expect(cfg["postStartCommand"]).toBe("bash .devcontainer/start-preview.sh");
    expect(script).toMatch(/npm run serve:device-test/);
    expect(script).not.toMatch(/NODE_ENV=production/);
    // Starting twice never runs two servers.
    expect(script).toMatch(/already running/);
  });

  it("opens the phone instructions when the codespace starts", () => {
    expect((cfg["customizations"] as { codespaces: { openFiles: string[] } }).codespaces.openFiles).toEqual(["docs/CODESPACES_PREVIEW.md"]);
    expect(readFileSync(join(ROOT, "docs", "CODESPACES_PREVIEW.md"), "utf8")).toMatch(/Delete/);
  });
});
