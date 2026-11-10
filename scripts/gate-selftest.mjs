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
// Stage 5.2: every gate run gets a fresh, empty timing history (unless a case
// passes its own), so the parallel queue order (longest first, by history)
// never depends on what earlier cases ran. Record files written by fixtures
// live outside the sandbox: a new file inside it is, correctly, a run that
// modified the working tree.
const SCRATCH = mkdtempSync(join(tmpdir(), "mchezo-gate-selftest-scratch-"));
let historyN = 0;
const freshHistory = () => join(SCRATCH, `history-${++historyN}.jsonl`);
function startGate(args, env = {}) {
  const child = spawn(process.execPath, [join("scripts", "gate.mjs"), ...args], {
    cwd: SANDBOX,
    env: { ...process.env, MCHEZO_GATE_HISTORY: freshHistory(), ...env },
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
  const reportPath = runId ? join(SANDBOX, "test-results", runId, "report.json") : null;
  const report = reportPath && existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null; // --plan writes none
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

  // 3b. Worst case: a detached grandchild (like Playwright's browser) that
  // ignores SIGTERM and holds the step's stdout open. Process-group kill
  // cannot reach it; the gate's ownership-tag sweep must.
  if (!IS_WINDOWS) {
    const pidFile = join(SANDBOX, "hang-detached.pid");
    const t0 = Date.now();
    const r = await runGate(["targeted", fx("hang-detached"), "--driver-timeout=3"], { FIXTURE_PID_FILE: pidFile });
    const pids = JSON.parse(readFileSync(pidFile, "utf8"));
    check("detached SIGTERM-ignoring driver → TIMEOUT, gate does not hang", r.code === 1 && step(r.report, "fixture-hang-detached")?.status === "TIMEOUT" && Date.now() - t0 < 60_000, `exit ${r.code}`);
    check("detached grandchild outside the process group is still cleaned up", await allGone([pids.pid, pids.child]), JSON.stringify(pids));
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
  //    (One worker, so "pass" can only start after the edit; case 13 is the parallel version.)
  {
    const r = await runGate(["targeted", "--workers=1", fx("mutate"), fx("pass")]);
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

  // ---------- Stage 5.2: the parallel scheduler ----------
  const records = (file) => (existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const overlaps = (a, b) => a.t0 < b.t1 && b.t0 < a.t1;

  // 9. Parallel steps really overlap, each on its own worker, server, data directory and screenshot folder.
  {
    const rec = join(SCRATCH, "rec9.jsonl");
    const r = await runGate(["targeted", "--workers=3", fx("pass"), fx("pass-2"), fx("pass-3")], { FIXTURE_SLEEP_MS: "3000", FIXTURE_RECORD_FILE: rec });
    const rs = records(rec);
    check("parallel: three passing steps → exit 0", r.code === 0 && r.report?.verdict === "PASSED", `exit ${r.code}`);
    check("parallel: the steps ran at the same time", rs.length === 3 && overlaps(rs[0], rs[1]) && overlaps(rs[1], rs[2]) && overlaps(rs[0], rs[2]), JSON.stringify(rs.map((x) => [x.script, x.t0, x.t1])));
    check("parallel: each step had its own worker and its own server", new Set(rs.map((x) => x.worker)).size === 3 && new Set(rs.map((x) => x.base)).size === 3);
    check("parallel: one data directory per server", new Set((r.report?.servers ?? []).map((x) => x.dataDir)).size === 3 && (r.report?.servers ?? []).length === 3);
    check("parallel: each step has its own screenshot folder", new Set(rs.map((x) => x.screenshots)).size === 3);
    check("parallel: the report records each step's worker and times", r.report?.steps.filter((x) => x.name.startsWith("fixture-")).every((x) => x.worker && x.startOffsetSec != null && x.endOffsetSec != null));
  }

  // 10. A failure is attributed to the right step and worker while others pass.
  {
    const r = await runGate(["targeted", "--workers=3", fx("fail"), fx("pass"), fx("pass-2")], { FIXTURE_SLEEP_MS: "1500" });
    const f = step(r.report, "fixture-fail");
    check("parallel failure → exit 1", r.code === 1, `exit ${r.code}`);
    check("parallel failure → the failing step is named with its assertion and worker", f?.status === "FAIL" && /deliberately failing/.test(f?.detail ?? "") && !!f?.worker, JSON.stringify(f));
    check("parallel failure → the other steps still pass", step(r.report, "fixture-pass")?.status === "PASS" && step(r.report, "fixture-pass-2")?.status === "PASS");
    check("parallel failure → classified as a functional failure, with no false machine-pressure flag", f?.failureKind === "functional" && !f?.resourcePressure, JSON.stringify({ kind: f?.failureKind, machine: f?.machine }));
    check("parallel failure → each step has its own log", new Set(r.report?.steps.filter((x) => x.log).map((x) => x.log)).size === r.report?.steps.filter((x) => x.log).length);
  }

  // 11. A timeout kills only that step's processes; a step running beside it is untouched and passes.
  {
    const dir = mkdtempSync(join(tmpdir(), "gate-pids-"));
    const rec = join(SCRATCH, "rec11.jsonl");
    const r = await runGate(["targeted", "--workers=2", fx("hang"), fx("pass"), "--step-timeout=fixture-hang=3"], { FIXTURE_PID_DIR: dir, FIXTURE_SLEEP_MS: "7000", FIXTURE_RECORD_FILE: rec });
    const pids = JSON.parse(readFileSync(join(dir, "hang.json"), "utf8"));
    const hang = step(r.report, "fixture-hang"), pass = step(r.report, "fixture-pass");
    check("parallel timeout → TIMEOUT for the hanging step, exit 1", r.code === 1 && hang?.status === "TIMEOUT" && hang?.failureKind === "timeout", `exit ${r.code}, kind ${hang?.failureKind}`);
    check("parallel timeout → the hanging step and its child are gone", await allGone([pids.pid, pids.child]), JSON.stringify(pids));
    check("parallel timeout → the step running beside it was alive during the kill and passed", pass?.status === "PASS" && pass.startOffsetSec < hang.endOffsetSec && hang.endOffsetSec < pass.endOffsetSec, JSON.stringify({ pass, hang }));
    rmSync(dir, { recursive: true, force: true });
  }

  // 12. A dead worker server stops scheduling; every step that never started is listed as not run.
  if (process.platform === "linux") {
    const r = await runGate(["targeted", "--workers=1", fx("kill-server"), fx("pass"), fx("pass-2")]);
    const names = (r.report?.notRun ?? []).map((n) => n.name);
    check("dead server → not PASSED (infrastructure, exit 2)", r.code === 2 && r.report?.verdict === "INFRASTRUCTURE ERROR", `exit ${r.code}`);
    check("dead server → the steps that never started are listed as not run, with the reason", names.includes("fixture-pass") && names.includes("fixture-pass-2") && r.report.notRun.every((n) => /died/.test(n.reason)), JSON.stringify(r.report?.notRun));
    check("dead server → summary names them", /NOT RUN\s+fixture-pass/.test(r.output));
  }

  // 13. Parallel invalidation: once the tree changes, nothing new starts, running steps are stopped, the run is INVALID.
  {
    const r = await runGate(["targeted", "--workers=2", fx("mutate"), fx("pass"), fx("pass-2")], { FIXTURE_SLEEP_MS: "15000", FIXTURE_MUTATE_DELAY_MS: "1500" });
    const names = (r.report?.notRun ?? []).map((n) => n.name);
    const p = step(r.report, "fixture-pass");
    check("parallel stale tree → exit 1 with INVALID", r.code === 1 && r.report?.steps.some((x) => x.status === "INVALID"), `exit ${r.code}`);
    check("parallel stale tree → the step running beside it is stopped, not counted as a pass", p?.status === "CANCELLED" && /invalid/.test(p?.detail ?? ""), JSON.stringify(p));
    check("parallel stale tree → queued steps never start and are listed as not run", names.includes("fixture-pass-2") && !step(r.report, "fixture-pass-2"));
    resetSandbox();
  }

  // 14. Sequential reference mode keeps the given order on one worker and one server.
  {
    const r = await runGate(["targeted", "--sequential", fx("pass-2"), fx("pass")]);
    const order = r.report?.steps.filter((x) => x.name.startsWith("fixture-")).map((x) => x.name);
    check("--sequential → one worker, one server, the given order", r.code === 0 && r.report?.workers === 1 && r.report?.servers.length === 1 && JSON.stringify(order) === JSON.stringify(["fixture-pass-2", "fixture-pass"]), JSON.stringify(order));
  }

  // 15. Estimates: --plan runs nothing; a run prints progress and predicted vs actual, and records its timing.
  {
    const plan = await runGate(["targeted", "--plan", "--workers=2", fx("pass")]);
    check("--plan → prints an estimate and runs nothing", plan.code === 0 && /estimate this run:/.test(plan.output) && /nothing was run/.test(plan.output) && !plan.report, plan.output.slice(-300));
    const hist = join(SCRATCH, "history-case15.jsonl");
    const r = await runGate(["targeted", "--workers=2", "--progress=1", fx("pass"), fx("pass-2")], { FIXTURE_SLEEP_MS: "2500", MCHEZO_GATE_HISTORY: hist });
    check("progress lines show done/total, running steps and time remaining", /── progress\s+\d+\/\d+ done/.test(r.output) && /running\s+fixture-/.test(r.output) && /remaining .* total .* done around/.test(r.output), r.output.slice(0, 600));
    check("summary compares predicted with actual time", /predicted .* → actual/.test(r.output) && r.report?.timing?.predicted && r.report.timing.wallSec > 0);
    check("the run's timing is appended to the history", existsSync(hist) && readFileSync(hist, "utf8").includes(r.report.runId));
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

  // 16. Cancelling a parallel run stops every worker's steps, children and servers, and nothing else.
  if (!IS_WINDOWS) {
    const sentinel = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", detached: true });
    const dir = mkdtempSync(join(tmpdir(), "gate-pids-"));
    const g = startGate(["targeted", "--workers=3", fx("hang"), fx("hang-2"), fx("hang-detached")], { FIXTURE_PID_DIR: dir });
    for (let i = 0; i < 160 && !["hang", "hang-2", "hang-detached"].every((n) => existsSync(join(dir, `${n}.json`))); i++) await sleep(250);
    const pids = ["hang", "hang-2", "hang-detached"].flatMap((n) => { const p = JSON.parse(readFileSync(join(dir, `${n}.json`), "utf8")); return [p.pid, p.child]; });
    const runId = /\| run (\S+)/.exec(g.output())?.[1];
    g.child.kill("SIGTERM");
    const code = await g.done;
    const report = JSON.parse(readFileSync(join(SANDBOX, "test-results", runId, "report.json"), "utf8"));
    check("parallel cancel → exit 130", code === 130, `exit ${code}`);
    check("parallel cancel → all three workers' drivers and children are gone (detached one included)", await allGone(pids, 8000), JSON.stringify(pids));
    check("parallel cancel → every worker server stopped", await allGone(report.servers.map((x) => x.pid)), JSON.stringify(report.servers.map((x) => x.pid)));
    check("parallel cancel → unrelated process untouched", alive(sentinel.pid));
    check("parallel cancel → steps reported CANCELLED, none as passes", report.steps.filter((x) => x.name.startsWith("fixture-")).every((x) => x.status === "CANCELLED"));
    process.kill(sentinel.pid, "SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
} finally {
  rmSync(SANDBOX, { recursive: true, force: true });
  rmSync(SCRATCH, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "GATE SELF-TEST PASSED" : "GATE SELF-TEST FAILED"}: ${results.length - failed}/${results.length} checks`);
process.exit(failed === 0 ? 0 : 1);
