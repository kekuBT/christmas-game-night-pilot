#!/usr/bin/env node
// Proves the gate is trustworthy by making it fail on purpose.
// Every case runs scripts/gate.mjs inside a disposable copy of the repo
// (its own git repo, node_modules linked read-only), so the real working
// tree is never edited. Usage: node scripts/gate-selftest.mjs
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
const IS_WINDOWS = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---------- sandbox: a throwaway copy of the current tree ----------
const SANDBOX = mkdtempSync(join(tmpdir(), "mchezo-gate-selftest-"));
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: REPO, encoding: "utf8" })
  .split("\0").filter(Boolean).filter((f) => existsSync(join(REPO, f)));
for (const f of files) {
  mkdirSync(dirname(join(SANDBOX, f)), { recursive: true });
  cpSync(join(REPO, f), join(SANDBOX, f));
}
symlinkSync(join(REPO, "node_modules"), join(SANDBOX, "node_modules"), IS_WINDOWS ? "junction" : "dir");
const git = (...args) => execFileSync("git", args, { cwd: SANDBOX, stdio: "pipe" });
git("init", "-q");
git("-c", "user.name=gate-selftest", "-c", "user.email=selftest@localhost", "add", "-A");
git("-c", "user.name=gate-selftest", "-c", "user.email=selftest@localhost", "commit", "-q", "-m", "sandbox");
const resetSandbox = () => { git("checkout", "-q", "--", "."); git("clean", "-qfd", "--", "src", "tests", "docs", "scripts"); };
console.log(`sandbox ${SANDBOX} (${files.length} files)\n`);

// ---------- helpers ----------
function startGate(args, env = {}) {
  const child = spawn(process.execPath, [join("scripts", "gate.mjs"), ...args], {
    cwd: SANDBOX,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  const done = new Promise((r) => child.on("close", (code) => r(code)));
  return { child, done, output: () => out };
}
async function runGate(args, env) {
  const g = startGate(args, env);
  const code = await g.done;
  const runId = /\| run (\S+)/.exec(g.output())?.[1];
  const report = runId ? JSON.parse(readFileSync(join(SANDBOX, "test-results", runId, "report.json"), "utf8")) : null;
  return { code, report, output: g.output() };
}
const step = (report, name) => report?.steps.find((s) => s.name === name);
// A terminated process can linger as a zombie until its parent (here often
// a container init that does not reap orphans) collects it; signal 0 still
// "succeeds" on a zombie, so on Linux read the real state from /proc.
const alive = (pid) => {
  try { process.kill(pid, 0); } catch { return false; }
  try {
    const state = /^State:\s+(\S)/m.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1];
    return state !== "Z" && state !== "X";
  } catch {
    return existsSync("/proc") ? false : true; // no /proc entry on Linux = gone
  }
};
async function allGone(pids, ms = 5000) {
  for (let t = 0; t < ms; t += 250) {
    if (pids.every((p) => !alive(p))) return true;
    await sleep(250);
  }
  return false;
}
const portOpen = (port) => new Promise((r) => {
  const s = net.connect(port, "127.0.0.1");
  s.once("connect", () => { s.destroy(); r(true); });
  s.once("error", () => r(false));
});
const fx = (name) => `--driver-file=scripts/gate-fixtures/${name}.mjs`;

try {
  // 0. Control: a passing run passes, so the failures below are meaningful.
  {
    const r = await runGate(["targeted", fx("pass")]);
    check("control: passing fixture run exits 0", r.code === 0 && r.report?.verdict === "PASSED", `exit ${r.code}`);
  }

  // 1. A failing unit test fails the gate.
  {
    writeFileSync(join(SANDBOX, "tests", "zz-gate-selftest.test.ts"),
      'import { expect, it } from "vitest";\nit("deliberately fails", () => { expect(1 + 1).toBe(3); });\n');
    const r = await runGate(["fast"]);
    check("failing unit test → exit 1", r.code === 1, `exit ${r.code}`);
    check("failing unit test → unit-tests step FAIL", step(r.report, "unit-tests")?.status === "FAIL");
    check("other fast steps still reported independently", step(r.report, "typecheck-server")?.status === "PASS" && step(r.report, "build-web")?.status === "PASS");
    resetSandbox();
  }

  // 2. A failing browser driver fails the gate and is named.
  {
    const r = await runGate(["targeted", fx("fail"), fx("pass")]);
    const s = step(r.report, "fixture-fail");
    check("failing driver → exit 1", r.code === 1, `exit ${r.code}`);
    check("failing driver → named, with its failing assertion", s?.status === "FAIL" && /deliberately failing/.test(s?.detail ?? ""), s?.detail);
    check("failing driver log preserved", !!s && existsSync(join(SANDBOX, "test-results", r.report.runId, s.log)));
    check("later drivers still run after a failure", step(r.report, "fixture-pass")?.status === "PASS");
  }

  // 3. A hanging driver times out, fails the gate, and is killed with its children.
  {
    const pidFile = join(SANDBOX, "hang.pid");
    const r = await runGate(["targeted", fx("hang"), "--driver-timeout=3"], { FIXTURE_PID_FILE: pidFile });
    const pids = JSON.parse(readFileSync(pidFile, "utf8"));
    check("hanging driver → exit 1", r.code === 1, `exit ${r.code}`);
    check("hanging driver → TIMEOUT status", step(r.report, "fixture-hang")?.status === "TIMEOUT");
    check("timed-out driver and its child process are gone", await allGone([pids.pid, pids.child]), JSON.stringify(pids));
    check("gate-owned server stopped after the run", !(await portOpen(r.report.server.port)));
    rmSync(pidFile, { force: true });
  }

  // 4. A missing browser is reported as an infrastructure error, not an app failure.
  {
    const r = await runGate(["targeted", "math"], { MCHEZO_CHROMIUM_PATH: join(SANDBOX, "no-such-chrome") });
    check("missing browser → exit 2 (infrastructure)", r.code === 2, `exit ${r.code}`);
    check("missing browser → preflight INFRA with the reason", step(r.report, "browser-preflight")?.status === "INFRA" && /does not exist/.test(step(r.report, "browser-preflight")?.detail ?? ""));
    check("missing browser → drivers not run (not counted as passes)", !step(r.report, "check-math"));
  }

  // 5. A stale bundle cannot be accepted: editing source mid-run invalidates the run.
  {
    const r = await runGate(["targeted", fx("mutate"), fx("pass")]);
    check("source edited after build → exit 1", r.code === 1, `exit ${r.code}`);
    check("source edited after build → INVALID reported", r.report?.steps.some((s) => s.status === "INVALID"));
    check("no check runs against the stale bundle", !step(r.report, "fixture-pass"));
    resetSandbox();
  }

  // 6. A run that modifies tracked files fails.
  {
    const r = await runGate(["targeted", fx("touch-tracked")]);
    check("tracked file modified by a check → exit 1", r.code === 1 && step(r.report, "tracked-files-check")?.status === "FAIL", `exit ${r.code}`);
    resetSandbox();
  }

  // 7. Simultaneous runs are isolated (own build, server, port, data, results).
  {
    const env = { FIXTURE_SLEEP_MS: "4000" };
    const [a, b] = await Promise.all([runGate(["targeted", fx("pass")], env), runGate(["targeted", fx("pass")], env)]);
    const overlap = a.report && b.report && a.report.startedAt < b.report.finishedAt && b.report.startedAt < a.report.finishedAt;
    check("two concurrent runs both pass", a.code === 0 && b.code === 0, `exits ${a.code}, ${b.code}`);
    check("concurrent runs overlapped in time", !!overlap);
    check("concurrent runs used different servers, data dirs and results",
      a.report.server.port !== b.report.server.port && a.report.server.dataDir !== b.report.server.dataDir && a.report.runId !== b.report.runId);
  }

  // 8. Cancellation cleans up only the run's own processes.
  if (IS_WINDOWS) {
    console.log("SKIP cancellation case: POSIX signals (covered on macOS/Linux; Windows uses taskkill /T on the step's own pid)");
  } else {
    const sentinel = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", detached: true });
    const pidFile = join(SANDBOX, "hang2.pid");
    const g = startGate(["targeted", fx("hang")], { FIXTURE_PID_FILE: pidFile });
    for (let i = 0; i < 120 && !existsSync(pidFile); i++) await sleep(250);
    const pids = JSON.parse(readFileSync(pidFile, "utf8"));
    const runId = /\| run (\S+)/.exec(g.output())?.[1];
    g.child.kill("SIGTERM");
    const code = await g.done;
    const report = JSON.parse(readFileSync(join(SANDBOX, "test-results", runId, "report.json"), "utf8"));
    check("cancelled run → exit 130", code === 130, `exit ${code}`);
    check("cancelled run killed its driver and the driver's child", await allGone([pids.pid, pids.child]), JSON.stringify(pids));
    check("cancelled run stopped its own server", await allGone([report.server.pid]));
    check("unrelated process left untouched", alive(sentinel.pid));
    check("cancellation is not misreported as an infrastructure failure", !report.steps.some((s) => s.status === "INFRA"));
    process.kill(sentinel.pid, "SIGKILL");
  }
} finally {
  rmSync(SANDBOX, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "GATE SELF-TEST PASSED" : "GATE SELF-TEST FAILED"}: ${results.length - failed}/${results.length} checks`);
process.exit(failed === 0 ? 0 : 1);
