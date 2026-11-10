#!/usr/bin/env node
// Mchezo verification gate. See docs/TESTING.md and docs/test-optimization/README.md.
//
//   node scripts/gate.mjs fast                      typecheck, lint, unit tests, production build
//   node scripts/gate.mjs targeted math mobile ...  build + only the named browser drivers
//   node scripts/gate.mjs full                      fast + every browser driver + E2E
//   node scripts/gate.mjs timings                   step timing history and full-gate estimates
//
//   --workers=<n|auto>  browser drivers in parallel (default auto: from CPUs and memory)
//   --sequential        one worker, the old fixed order (the reference mode)
//   --plan              print the plan and its time estimate, run nothing
//   --progress=<sec>    progress and estimate every <sec> seconds (default 60; 0 = off)
//   --history=<file>    timing history file (default <results-dir>/timing-history.jsonl)
//   --step-timeout=<step>=<sec>  one step's time limit (repeatable); --driver-timeout=<sec> sets all
//
// Guarantees:
// - Exit code: 0 all passed; 1 a check failed, timed out, or its result is
//   invalid, or a planned step did not run; 2 infrastructure error (no
//   browser, server could not start, tool missing) with no check failure;
//   130 cancelled.
// - Every run is isolated: its own results directory, its own build of the
//   current tree, its own servers (one per worker) on OS-assigned ports with
//   their own data directories. Concurrent runs cannot share state, so no lock.
// - Within a run, no two steps ever share a server at the same time: each
//   worker has its own, and a worker runs one step at a time.
// - The tree is fingerprinted when it is built and re-checked before each
//   later step starts and at the end; any change invalidates the run.
// - Each step runs in its own process group with a hard timeout; the gate
//   only ever kills process groups and tagged processes it started.
// - Every planned step either reports a status or is listed as not run, with
//   the reason; a run with an unexplained missing step cannot pass.
// - Drivers write screenshots into the run directory; a run that modifies
//   tracked files fails. The gate never retries a step.
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism, cpus as osCpus, freemem, loadavg } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gitInfo, sourceFingerprint } from "./lib/fingerprint.mjs";
import { autoWorkers, clock, confidenceOf, contentionFor, estimateMakespan, estimateStep, fmtDur, fmtRange, orderSteps } from "./lib/gate-plan.mjs";
import { createSampler } from "./lib/gate-sampler.mjs";
import { appendHistory, buildBaseline, contentionRatio, historyRecord, loadTimings, readHistory, writeBaseline } from "./lib/gate-timings.mjs";

const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
const NODE = process.execPath;
const BIN = {
  tsc: join(REPO, "node_modules", "typescript", "bin", "tsc"),
  eslint: join(REPO, "node_modules", "eslint", "bin", "eslint.js"),
  vitest: join(REPO, "node_modules", "vitest", "vitest.mjs"),
  vite: join(REPO, "node_modules", "vite", "bin", "vite.js"),
};
const IS_WINDOWS = process.platform === "win32";
const INFRA_EXIT_CODE = 3; // see scripts/lib/driver-env.mjs
const INFRA_MARKER = "MCHEZO_INFRA_ERROR";
const BASELINE_PATH = join(REPO, "scripts", "lib", "gate-timings.json");

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opts = { level: "fast", drivers: [], driverFiles: [], driverTimeoutSec: null, totalTimeoutMin: null, resultsDir: join(REPO, "test-results"), e2e: null, workers: "auto", stepTimeouts: {}, sequential: false, plan: false, progressSec: 60, history: process.env.MCHEZO_GATE_HISTORY || null, updateBaseline: false };
for (const a of argv) {
  if (a === "fast" || a === "targeted" || a === "full" || a === "timings") opts.level = a;
  else if (a.startsWith("--driver-timeout=")) opts.driverTimeoutSec = Number(a.split("=")[1]);
  else if (a.startsWith("--timeout=")) opts.totalTimeoutMin = Number(a.split("=")[1]);
  else if (a.startsWith("--results-dir=")) opts.resultsDir = resolve(a.split("=")[1]);
  else if (a.startsWith("--driver-file=")) opts.driverFiles.push(resolve(a.split("=").slice(1).join("=")));
  else if (a.startsWith("--workers=")) opts.workers = a.split("=")[1];
  else if (a.startsWith("--step-timeout=")) { const [, n, sec] = /^--step-timeout=([^=]+)=(.+)$/.exec(a) ?? []; if (!n || !(Number(sec) > 0)) { console.error("--step-timeout takes <step>=<seconds>"); process.exit(2); } opts.stepTimeouts[n] = Number(sec); }
  else if (a.startsWith("--progress=")) opts.progressSec = Number(a.split("=")[1]);
  else if (a.startsWith("--history=")) opts.history = resolve(a.split("=").slice(1).join("="));
  else if (a === "--sequential") opts.sequential = true;
  else if (a === "--plan") opts.plan = true;
  else if (a === "--update-baseline") opts.updateBaseline = true;
  else if (a === "--e2e") opts.e2e = true;
  else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
  else if (a.startsWith("-")) { console.error(`unknown option ${a}`); process.exit(2); }
  else opts.drivers.push(a.replace(/^check-/, "").replace(/\.mjs$/, ""));
}
for (const n of [opts.driverTimeoutSec, opts.totalTimeoutMin]) {
  if (n !== null && !(Number.isFinite(n) && n > 0)) { console.error("timeouts must be positive numbers"); process.exit(2); }
}
if (!(Number.isFinite(opts.progressSec) && opts.progressSec >= 0)) { console.error("--progress must be a number of seconds (0 = off)"); process.exit(2); }
if (opts.workers !== "auto" && !(Number.isInteger(Number(opts.workers)) && Number(opts.workers) >= 1 && Number(opts.workers) <= 8)) { console.error("--workers must be auto or a whole number from 1 to 8"); process.exit(2); }
function printHelp() {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).join("\n"));
}

const ALL_DRIVERS = readdirSync(join(REPO, "scripts"))
  .filter((f) => /^check-.+\.mjs$/.test(f))
  .map((f) => f.slice("check-".length, -".mjs".length))
  .sort();
if (opts.level === "targeted" && opts.drivers.length === 0 && opts.driverFiles.length === 0 && !opts.e2e) {
  console.error(`targeted needs driver names. Available: ${ALL_DRIVERS.join(", ")}, or --e2e`);
  process.exit(2);
}
for (const d of opts.drivers) {
  if (!ALL_DRIVERS.includes(d)) { console.error(`unknown driver "${d}". Available: ${ALL_DRIVERS.join(", ")}`); process.exit(2); }
}

// ---------- machine and workers ----------
const CPUS = typeof availableParallelism === "function" ? availableParallelism() : osCpus().length;
function memAvailMB() {
  try { const m = /MemAvailable:\s+(\d+) kB/.exec(readFileSync("/proc/meminfo", "utf8")); if (m) return Math.round(Number(m[1]) / 1024); } catch { /* not Linux */ }
  return Math.round(freemem() / 1048576);
}
const MEM0 = memAvailMB();
const WORKERS = opts.sequential ? 1 : opts.workers === "auto" ? autoWorkers({ cpus: CPUS, memAvailMB: MEM0 }) : Number(opts.workers);
const PARALLEL = WORKERS > 1;
const workersWhy = opts.sequential ? "--sequential" : opts.workers === "auto" ? `auto: ${CPUS} CPUs, ${(MEM0 / 1024).toFixed(1)} GB available` : "--workers";

// ---------- step plan (names, commands, budgets, scheduling attributes) ----------
// Per-driver time budgets, about 2x the duration measured on
// chrome-headless-shell in a cloud container (2026-11-06, commit 08348bf):
// leaderboard 928s, e2e 830s, f5 732s, mchezo 376s, tv-lifecycle 350s,
// game-night 270s; every other driver finished in under 160s. A budget is
// a hang detector, not a performance assertion.
const DEFAULT_DRIVER_TIMEOUT_SEC = 600;
const DRIVER_TIMEOUT_SEC = { "check-leaderboard": 1800, "e2e-chromium": 1800, "check-f5": 1500, "check-mchezo": 900, "check-tv-lifecycle": 900, "check-game-night": 900 };
// Scheduling attributes, from measurements (docs/test-optimization/README.md §5):
// weight = worker slots a step occupies; exclusive = it runs with nothing else.
const STEP_ATTRS = {};
const attrs = (name) => STEP_ATTRS[name] ?? {};

// ---------- timing history ----------
const HISTORY_PATH = opts.history ?? join(opts.resultsDir, "timing-history.jsonl");
const TIMINGS = loadTimings({ baselinePath: BASELINE_PATH, historyPath: HISTORY_PATH });
const FALLBACK_SEC = 60;
const estOf = (name) => estimateStep(TIMINGS.base[name], FALLBACK_SEC);


// ---------- run directory ----------
const startedAt = new Date();
const T0 = Date.now();
const git = gitInfo(REPO);
const stamp = startedAt.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const RUN_ID = `${stamp}-${(git.head ?? "nogit").slice(0, 8)}-${process.pid}`;
const RUN_DIR = join(opts.resultsDir, RUN_ID);
const LOG_DIR = join(RUN_DIR, "logs");
const DIST_DIR = join(RUN_DIR, "web-dist");
const DATA_DIR = join(RUN_DIR, "server-data");
const SHOT_DIR = join(RUN_DIR, "screenshots");

if (!opts.plan && opts.level !== "timings") mkdirSync(LOG_DIR, { recursive: true });

const report = {
  runId: RUN_ID,
  level: opts.level,
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  exitCode: null,
  verdict: null,
  repo: REPO,
  git,
  fingerprint: null,
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  machine: { cpus: CPUS, memAvailMB: MEM0 },
  workers: WORKERS,
  workersWhy,
  browser: null,
  steps: [],
  notRun: [],
  notes: [],
  servers: [],
  timing: null,
};
const fp0 = sourceFingerprint(REPO);
report.fingerprint = fp0;

// ---------- process control ----------
const running = new Map(); // index -> { child, name, worker, t0, est }
const servers = new Map(); // worker -> { child, port, log, dataDir }
let cancelled = false;
let stopReason = null; // set when scheduling must stop: "invalid" | "infra" | "deadline"
const deadline = opts.totalTimeoutMin ? T0 + opts.totalTimeoutMin * 60_000 : null;
const sampler = createSampler(RUN_ID);

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((done) => {
    const finish = () => { clearTimeout(hard); done(); };
    child.once("exit", finish);
    const hard = setTimeout(() => {
      try { if (IS_WINDOWS) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]); else process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ }
      setTimeout(done, 1000);
    }, 3000);
    try {
      if (IS_WINDOWS) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      else process.kill(-child.pid, "SIGTERM"); // the step's own process group, never anything else
    } catch { finish(); }
  });
}

// Ownership tags. Every process a step starts inherits MCHEZO_GATE_STEP;
// everything the run starts (steps and servers) inherits MCHEZO_GATE_RUN.
// Process groups are not enough: Playwright launches Chromium detached, in
// its own group, so a driver killed with SIGKILL can orphan its browser.
// After each step, and at the end, the gate kills any process still
// carrying that step's (or this run's) tag, and nothing else. In parallel
// mode a step's sweep can only match that step's tag, so a timeout on one
// worker never touches another worker's processes.
const RUN_TAG = `MCHEZO_GATE_RUN=${RUN_ID}`;
const stepTag = (index) => `MCHEZO_GATE_STEP=${RUN_ID}:${index}`;

/** PIDs of live processes whose environment contains `tag` (Linux /proc, macOS ps -E). */
function taggedPids(tag) {
  const pids = [];
  if (process.platform === "linux") {
    let entries;
    try { entries = readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch { return pids; }
    for (const d of entries) {
      const pid = Number(d);
      if (pid === process.pid) continue;
      try {
        if (readFileSync(`/proc/${d}/environ`, "utf8").split("\0").includes(tag)) pids.push(pid);
      } catch { /* exited or not ours to read */ }
    }
  } else if (process.platform === "darwin") {
    try {
      for (const line of execFileSync("ps", ["-E", "-ww", "-o", "pid=,command="], { encoding: "utf8" }).split("\n")) {
        const m = /^\s*(\d+)\s/.exec(line);
        if (m && Number(m[1]) !== process.pid && line.includes(` ${tag}`)) pids.push(Number(m[1]));
      }
    } catch { /* ps unavailable */ }
  }
  return pids; // Windows: taskkill /T on the step's pid already covers its tree
}

/** Kill every live process carrying `tag`. Returns how many were killed. */
function sweep(tag) {
  let killed = 0;
  for (const pid of taggedPids(tag)) {
    try { process.kill(pid, "SIGKILL"); killed++; } catch { /* already gone */ }
  }
  return killed;
}

function onSignal(sig) {
  if (cancelled) return;
  cancelled = true;
  console.log(`\n${sig} received: stopping run ${RUN_ID} and cleaning up its own processes`);
  void Promise.all([...[...running.values()].map((r) => killTree(r.child)), ...[...servers.values()].map((s) => killTree(s.child))]).then(() => finish());
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));

const pad2 = (n) => String(n).padStart(2, "0");
let doneCount = 0;
let plannedCount = 0;

/**
 * Run one step as its own process group. Resolves to a step record with
 * status PASS | FAIL | TIMEOUT | INFRA | CANCELLED.
 */
function runStep(spec, worker) {
  const { name, command, args, timeoutSec, env = {}, kind = "check", index } = spec;
  const logPath = join(LOG_DIR, `${pad2(index)}-${name}.log`);
  const step = { name, kind, command: [basename(command), ...args.map((a) => a.replace(REPO, "."))].join(" "), status: null, exitCode: null, durationSec: null, log: logPath.replace(RUN_DIR, "."), detail: "", worker, estSec: Math.round(spec.est.mid) };
  report.steps.push(step);
  if (cancelled) { step.status = "CANCELLED"; return Promise.resolve(step); }
  let limit = timeoutSec;
  if (deadline !== null) limit = Math.min(limit, Math.max(1, Math.floor((deadline - Date.now()) / 1000)));
  if (deadline !== null && Date.now() >= deadline) {
    step.status = "TIMEOUT";
    step.detail = "total --timeout budget spent before this step started";
    return Promise.resolve(step);
  }
  const t0 = Date.now();
  step.startOffsetSec = Math.round((t0 - T0) / 100) / 10;
  console.log(`        start ${name}${PARALLEL ? ` on w${worker}` : ""}${spec.est.source === "none" ? " (no timing history)" : ` (usually ${fmtDur(spec.est.mid)})`}`);
  const log = createWriteStream(logPath);
  log.write(`$ ${step.command}\n# timeout ${limit}s | worker w${worker}${spec.server ? ` | server ${spec.server.base} (data ${spec.server.dataDir})` : ""}\n\n`);
  const roomsBefore = spec.server ? countRooms(spec.server.dataDir) : null;
  return new Promise((done) => {
    let output = "";
    const child = spawn(command, args, {
      cwd: REPO,
      env: { ...process.env, ...env, FORCE_COLOR: "0", MCHEZO_GATE_RUN: RUN_ID, MCHEZO_GATE_STEP: `${RUN_ID}:${index}`, MCHEZO_GATE_WORKER: String(worker) },
      detached: !IS_WINDOWS, // own process group on POSIX, so cleanup is exact
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    running.set(index, { child, name, worker, t0, est: spec.est, weight: spec.weight });
    // Log lines carry the time since the step started ("[+123.4s] ..."), so
    // a slow or stuck driver shows where its time went. The in-memory copy
    // used to find FAIL lines stays raw.
    let partial = "";
    const stampLines = (text) => {
      const lines = (partial + text).split("\n");
      partial = lines.pop() ?? "";
      const at = `[+${((Date.now() - t0) / 1000).toFixed(1)}s] `;
      if (lines.length) log.write(lines.map((l) => at + l).join("\n") + "\n");
    };
    const capture = (d) => { stampLines(d.toString()); output = (output + d.toString()).slice(-20000); };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; void killTree(child); }, limit * 1000);
    // `close` waits for stdout/stderr to close; an orphaned grandchild that
    // inherited them would hold it open forever. Once the step's main
    // process has exited, give its tree 2s, then sweep its tagged leftovers.
    child.on("exit", () => { setTimeout(() => sweep(stepTag(index)), 2000).unref(); });
    child.on("error", (err) => {
      clearTimeout(timer);
      step.status = "INFRA";
      step.detail = `could not start: ${err.message}`;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      sampler.sampleNow();
      running.delete(index);
      const leftovers = sweep(stepTag(index));
      if (leftovers) log.write(`\n# killed ${leftovers} leftover process(es) started by this step\n`);
      step.exitCode = code;
      step.durationSec = Math.round((Date.now() - t0) / 100) / 10;
      step.endOffsetSec = Math.round((Date.now() - T0) / 100) / 10;
      const use = sampler.usage(`step:${index}`);
      if (use) { step.cpuSec = use.cpuSec; step.peakRssMB = use.peakRssMB; }
      if (roomsBefore !== null) step.roomsOnGateServer = countRooms(spec.server.dataDir) - roomsBefore;
      // Diagnosis next to the verdict: the drivers' DIAG lines (server state
      // vs screen, scripts/lib/diagnose.mjs), and whether the machine was
      // short of memory or CPU while this step ran.
      const diag = output.split("\n").filter((l) => /\bDIAG\b/.test(l)).slice(0, 6).map((l) => l.trim().slice(0, 300));
      if (diag.length) step.diag = diag;
      const pres = sampler.pressureBetween(t0, Date.now());
      if (pres) step.machine = pres;
      const stats = /MCHEZO_DRIVER_STATS (\{.*\})/.exec(output);
      if (stats) { try { step.browserUse = JSON.parse(stats[1]); } catch { /* informational only */ } }
      if (step.status === "INFRA") { /* spawn error already recorded */ }
      else if (cancelled || spec.abortReason) { step.status = "CANCELLED"; if (spec.abortReason) step.detail = spec.abortReason; }
      else if (timedOut) { step.status = "TIMEOUT"; step.detail = `exceeded ${limit}s; process group killed`; }
      else if (code === INFRA_EXIT_CODE || output.includes(INFRA_MARKER)) {
        step.status = "INFRA";
        step.detail = (output.split("\n").find((l) => l.includes(INFRA_MARKER)) ?? `exit ${code}`).trim();
      } else if (code === 0) step.status = "PASS";
      else {
        step.status = "FAIL";
        // Driver FAIL lines, Vitest failure lines, tsc errors, ESLint totals.
        const fails = output.split("\n").filter((l) => /^\s*(FAIL|✗|×)\b|FAIL |error TS\d+|✖ \d+ problems?|Tests? .*failed/.test(l)).slice(0, 8);
        step.detail = fails.length ? fails.map((l) => l.trim()).join(" | ") : `exit ${code ?? signal}`;
      }
      if (partial) log.write(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${partial}\n`);
      // What kind of failure this is, for the summary and the report.
      step.failureKind = { PASS: null, FAIL: "functional", TIMEOUT: "timeout", INFRA: "infrastructure", CANCELLED: "cancelled" }[step.status] ?? null;
      const underPressure = pres && ((pres.memAvailMinMB !== null && pres.memAvailMinMB < LOW_MEM_MB) || pres.cpuSaturatedSec >= 10);
      if (step.failureKind && step.failureKind !== "cancelled" && underPressure) {
        step.resourcePressure = true;
        step.detail = `${step.detail ? `${step.detail} ` : ""}[machine under pressure during this step: memory available fell to ${pres.memAvailMinMB} MB, CPU saturated ${pres.cpuSaturatedSec}s]`;
      }
      log.end(`\n# ${step.status} (exit ${code ?? signal}) in ${step.durationSec}s${step.cpuSec != null ? ` | cpu ${step.cpuSec}s, peak memory ${step.peakRssMB} MB` : ""}\n`);
      doneCount++;
      const res = `${step.status.padEnd(9)} ${String(step.durationSec).padStart(6)}s`;
      const detail = step.detail ? `  ${step.detail.slice(0, 160)}` : "";
      console.log(`[${String(doneCount).padStart(2)}/${plannedCount}] ${res}  ${name}${PARALLEL ? `  w${worker}` : ""}${detail}`);
      if (step.status === "FAIL" || step.status === "INFRA") {
        const tail = output.trimEnd().split("\n").slice(-15).map((l) => `      | ${l}`).join("\n");
        if (tail) console.log(tail);
      }
      done(step);
    });
  });
}

function countRooms(dir) {
  try { return readdirSync(dir).filter((f) => /^room-.+\.json$/.test(f)).length; } catch { return 0; }
}

/** Re-check the tree: any change since the build invalidates the run. */
function verifyUnchanged(where) {
  const now = sourceFingerprint(REPO);
  if (now.hash === fp0.hash) return true;
  if (!report.steps.some((s) => s.status === "INVALID")) {
    const step = { name: `source-check (${where})`, kind: "integrity", status: "INVALID", detail: "the source tree changed after it was fingerprinted/built; results no longer describe the tree on disk", durationSec: 0 };
    report.steps.push(step);
    console.log(`[--] ${step.name.padEnd(28)} INVALID   ${step.detail}`);
  }
  return false;
}

async function startServer(worker) {
  const logPath = join(LOG_DIR, `server-w${worker}.log`);
  const log = createWriteStream(logPath);
  const dataDir = join(DATA_DIR, `w${worker}`);
  mkdirSync(dataDir, { recursive: true });
  const child = spawn(NODE, ["--import", "tsx", "src/server/serve.ts"], {
    cwd: REPO,
    // Test content mode: provisional content counts as approved, so drivers can
    // play many official games in one Cup (the real approval state is checked
    // by tests/content.test.ts without this mode).
    env: { ...process.env, PORT: "0", MCHEZO_DATA_DIR: dataDir, MCHEZO_WEB_DIST: DIST_DIR, MCHEZO_GATE_RUN: RUN_ID, MCHEZO_GATE_SERVER: `w${worker}`, MCHEZO_CONTENT_TEST_MODE: "approve-provisional" },
    detached: !IS_WINDOWS,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "";
  child.stdout.on("data", (d) => { log.write(d); out += d.toString(); });
  child.stderr.on("data", (d) => { log.write(d); out += d.toString(); });
  for (let i = 0; i < 120 && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) return { child, port: Number(m[1]), base: `http://localhost:${m[1]}`, log: logPath, dataDir, worker };
    await new Promise((r) => setTimeout(r, 250));
  }
  await killTree(child);
  return { child: null, port: null, log: logPath, dataDir, worker, error: out.slice(-500) || "no startup line within 30s" };
}

// ---------- the pool ----------
// Resource-aware backpressure: with something already running, a new step
// waits while the 1-minute load average exceeds the CPU count or available
// memory is under LOW_MEM_MB. With nothing running it always starts, so
// the pool can never stall. Waits are recorded in the report.
const LOW_MEM_MB = 1024;
const backpressure = { waits: 0, seconds: 0 };
function pressure() {
  const load = loadavg()[0];
  if (process.platform !== "win32" && load > CPUS) return `load ${load.toFixed(1)} > ${CPUS} CPUs`;
  const mem = memAvailMB();
  if (mem < LOW_MEM_MB) return `only ${mem} MB memory available`;
  return null;
}

/**
 * Run `queue` with `capacity` worker slots. Steps start strictly in queue
 * order (no skipping ahead, the policy scripts/lib/gate-plan.mjs simulates).
 * `before(spec)` may veto a start (returns false: scheduling stops).
 */
async function runPool(queue, capacity, { before = () => true, after = () => {} } = {}) {
  const free = new Set(Array.from({ length: capacity }, (_, i) => i + 1));
  const inflight = new Set();
  let qi = 0;
  let waitingSince = null;
  const tick = () => new Promise((r) => setTimeout(r, 2000));
  while (qi < queue.length || inflight.size) {
    if (cancelled || stopReason) {
      if (!inflight.size) break;
      await Promise.race(inflight);
      continue;
    }
    if (qi < queue.length) {
      const spec = queue[qi];
      const need = Math.min(spec.weight ?? 1, capacity);
      if (free.size >= need) {
        const why = inflight.size ? pressure() : null;
        if (why) {
          if (waitingSince === null) { waitingSince = Date.now(); backpressure.waits++; console.log(`        wait  ${spec.name}: ${why}`); }
          await Promise.race([...inflight, tick()]);
          continue;
        }
        if (waitingSince !== null) { backpressure.seconds += (Date.now() - waitingSince) / 1000; waitingSince = null; }
        if (!(await before(spec))) continue; // before() set stopReason
        const slots = [...free].sort((a, b) => a - b).slice(0, need);
        for (const s of slots) free.delete(s);
        const worker = slots[0];
        if (spec.needsServer && !servers.has(worker)) {
          // A slot no server was started for (weighted steps can reach it): start one now.
          const s = await startServer(worker);
          report.servers.push({ worker: `w${worker}`, port: s.port, pid: s.child?.pid ?? null, dataDir: s.dataDir, log: s.log.replace(RUN_DIR, ".") });
          if (!s.port) {
            report.steps.push({ name: `server-start (w${worker})`, kind: "infra", status: "INFRA", detail: s.error, log: s.log.replace(RUN_DIR, ".") });
            stopReason = "a gate server could not start";
            for (const sl of slots) free.add(sl);
            continue;
          }
          servers.set(worker, s);
        }
        spec.server = spec.needsServer ? servers.get(worker) : null;
        if (spec.needsServer && spec.server) spec.args = spec.args.map((a) => (a === "<base>" ? spec.server.base : a));
        const p = runStep(spec, worker).then((step) => after(spec, step, worker)).finally(() => { for (const s of slots) free.add(s); inflight.delete(p); });
        inflight.add(p);
        qi++;
        continue;
      }
    }
    await Promise.race(inflight);
  }
  // Anything never started is listed, with the reason.
  for (const spec of queue.slice(qi)) report.notRun.push({ name: spec.name, reason: cancelled ? "run cancelled" : stopReason ?? "not started" });
}

// ---------- progress and estimates ----------
let pending = []; // queued specs not yet started, in order
let lastShownTotal = null;
const CONT = contentionFor(WORKERS, TIMINGS.contention, CPUS);

function estimateRemaining() {
  const now = Date.now();
  const run = [...running.values()].map((r) => ({ name: r.name, est: r.est, weight: r.weight ?? 1, elapsed: (now - r.t0) / 1000 }));
  return estimateMakespan(pending, WORKERS, CONT, run);
}

function showProgress(force = false) {
  if (!force && !running.size) return;
  const now = Date.now();
  const elapsed = (now - T0) / 1000;
  const st = report.steps.filter((s) => s.durationSec != null);
  const count = (s) => st.filter((x) => x.status === s).length;
  const rem = estimateRemaining();
  const total = { low: elapsed + rem.low, mid: elapsed + rem.mid, high: elapsed + rem.high };
  const conf = estimateConfidence;
  console.log(`── progress  ${doneCount}/${plannedCount} done · ${count("PASS")} passed, ${count("FAIL")} failed, ${count("TIMEOUT")} timed out, ${count("CANCELLED")} cancelled · elapsed ${fmtDur(elapsed)}`);
  if (running.size) console.log(`   running   ${[...running.values()].map((r) => `${r.name} ${fmtDur((now - r.t0) / 1000)} (w${r.worker})`).join(", ")}`);
  console.log(`   remaining ${fmtRange(rem.low, rem.high)} · total ${fmtRange(total.low, total.high)} · done around ${clock(now + rem.low * 1000)}–${clock(now + rem.high * 1000)} UTC (${conf})`);
  for (const r of running.values()) {
    const used = (now - r.t0) / 1000;
    if (r.est.source !== "none" && used > 60 && used > r.est.high * CONT.high * 1.25) console.log(`   slow      ${r.name} has run ${fmtDur(used)}; it usually takes ${fmtDur(r.est.mid)} (${(used / r.est.mid).toFixed(1)}×)`);
  }
  if (lastShownTotal !== null && Math.abs(total.mid - lastShownTotal) > Math.max(120, 0.2 * lastShownTotal)) {
    console.log(`   revised   the total estimate moved from about ${fmtDur(lastShownTotal)} to about ${fmtDur(total.mid)}`);
  }
  lastShownTotal = total.mid;
}
let estimateConfidence = "low-confidence";

function describePlan(specs, label) {
  const est = estimateMakespan(orderSteps(specs, { parallel: PARALLEL }), WORKERS, CONT);
  const seq = specs.reduce((s, x) => s + x.est.mid, 0);
  const longest = [...specs].sort((a, b) => b.est.mid - a.est.mid)[0];
  const conf = confidenceOf(specs, CONT);
  estimateConfidence = conf.label;
  const fast = specs.filter((s) => s.phase !== "browser").length;
  const drivers = specs.filter((s) => s.phase === "browser" && s.name.startsWith("check-")).length;
  const others = specs.length - fast - drivers;
  console.log(`  plan     ${specs.length} steps: ${fast} fast/build, ${drivers} browser drivers${others ? `, ${others} other (E2E, fixtures, preflight)` : ""} · ${WORKERS} worker${WORKERS > 1 ? "s" : ""} (${workersWhy})`);
  console.log(`  history  ${TIMINGS.sources.historyRuns} local run(s) in ${HISTORY_PATH.replace(REPO, ".")}${TIMINGS.sources.baselineGenerated ? ` + committed baseline (${TIMINGS.sources.baselineGenerated.slice(0, 10)})` : ""} · contention ×${CONT.mid.toFixed(2)} for ${WORKERS} worker(s) (${CONT.source}${CONT.n ? `, ${CONT.n} run(s)` : ""})`);
  console.log(`  estimate ${label}: ${fmtRange(est.low, est.high)} (${conf.label}) · the same steps one after another: about ${fmtDur(seq)} · longest step ${longest ? `${longest.name} ~${fmtDur(longest.est.mid)}` : "-"}`);
  console.log(`  method   each step's median (p10–p90 for the range) over up to 10 earlier sequential runs, ×${CONT.mid.toFixed(2)} contention, replayed through the scheduler${PARALLEL ? " (exclusive steps first, then longest first)" : " (fixed order)"}`);
  if (conf.none.length) console.log(`  unknown  no timing history for ${conf.none.length} step(s), assumed ~${FALLBACK_SEC}s each: ${conf.none.slice(0, 8).join(", ")}${conf.none.length > 8 ? ", …" : ""}`);
  if (conf.few.length) console.log(`  thin     only 1–2 samples for: ${conf.few.slice(0, 8).join(", ")}${conf.few.length > 8 ? ", …" : ""}`);
  return { ...est, sequentialSec: seq, confidence: conf.label, contention: CONT.mid, contentionSource: CONT.source };
}

// ---------- plan ----------
const fastSteps = [
  ["typecheck-server", NODE, [BIN.tsc, "--noEmit"], 300],
  ["typecheck-web", NODE, [BIN.tsc, "-p", "apps/web/tsconfig.json", "--noEmit"], 300],
  ["lint", NODE, [BIN.eslint, "."], 300],
  ["unit-tests", NODE, [BIN.vitest, "run"], 900],
];
const buildStep = ["build-web", NODE, [BIN.vite, "build", "--config", "apps/web/vite.config.ts", "--outDir", DIST_DIR, "--emptyOutDir", "--logLevel", "warn"], 300];
const drivers = opts.level === "full" ? ALL_DRIVERS : opts.level === "targeted" ? opts.drivers : [];
const runE2E = opts.e2e ?? opts.level === "full";
const needsServer = drivers.length > 0 || runE2E || opts.driverFiles.length > 0;
const needsBrowser = drivers.length > 0 || runE2E; // fixture drivers (self-test) need no browser

const mk = (name, command, args, timeoutSec, extra = {}) => ({ name, command, args, timeoutSec, est: estOf(name), weight: 1, ...attrs(name), ...extra });
const fastSpecs = [
  ...(opts.level === "fast" || opts.level === "full" ? fastSteps.map(([n, c, a, t]) => mk(n, c, a, t, { phase: "fast" })) : []),
  mk(...buildStep, { phase: "build" }),
];
const preflightSpec = mk("browser-preflight", NODE, [
  "--input-type=module",
  "-e",
  "const m = await import('./scripts/lib/driver-env.mjs'); const exe = m.chromiumExecutable(); const b = await m.launchChromium(); console.log(JSON.stringify({ version: b.version(), executable: exe.path, source: exe.source })); await b.close();",
], 120, { phase: "browser", kind: "infra" });
const driverTimeout = (name) => opts.stepTimeouts[name] ?? opts.driverTimeoutSec ?? DRIVER_TIMEOUT_SEC[name] ?? DEFAULT_DRIVER_TIMEOUT_SEC;
const browserSpecsInOrder = [
  ...drivers.map((d) => mk(`check-${d}`, NODE, [join("scripts", `check-${d}.mjs`), "<base>"], driverTimeout(`check-${d}`))),
  ...opts.driverFiles.map((f) => mk(`fixture-${basename(f, ".mjs")}`, NODE, [f, "<base>"], driverTimeout(`fixture-${basename(f, ".mjs")}`))),
  ...(runE2E ? [mk("e2e-chromium", NODE, [join("scripts", "e2e-browser.mjs"), "<base>", "--browser=chromium", "--games=all"], driverTimeout("e2e-chromium"))] : []),
].map((s) => ({ ...s, phase: "browser", kind: "browser", needsServer: true }));
const browserQueue = orderSteps(browserSpecsInOrder, { parallel: PARALLEL });
const allSpecs = [...fastSpecs, ...(needsServer ? [...(needsBrowser ? [preflightSpec] : []), ...browserQueue] : [])];
allSpecs.forEach((s, i) => { s.index = i + 1; });
plannedCount = allSpecs.length;

if (opts.level === "timings") { showTimings(); process.exit(0); }

async function main() {
  console.log(`Mchezo gate ${opts.level} | run ${RUN_ID}`);
  console.log(`  revision ${git.head ?? "unknown"}${git.dirty?.length ? ` + ${git.dirty.length} uncommitted change(s)` : " (clean tree)"} | fingerprint ${fp0.hash.slice(0, 12)} (${fp0.files} files)`);
  const predicted = describePlan(allSpecs, "this run");
  report.plan = { steps: allSpecs.map((s) => ({ index: s.index, name: s.name, phase: s.phase, estSec: Math.round(s.est.mid), estSource: s.est.source, weight: s.weight, exclusive: !!s.exclusive })), predicted };
  if (opts.plan) { console.log("  (--plan: nothing was run)"); process.exit(0); }
  console.log(`  results  ${RUN_DIR}`);
  sampler.start();
  pending = [...allSpecs];
  const progressTimer = opts.progressSec > 0 ? setInterval(() => showProgress(), opts.progressSec * 1000) : null;
  progressTimer?.unref();
  const started = (spec) => { pending = pending.filter((p) => p !== spec); return true; };

  // Phase 1: fast checks and the build, in parallel when there are workers to spare.
  await runPool(fastSpecs, WORKERS, { before: started });
  const build = report.steps.find((s) => s.name === "build-web");
  if (build?.status === "PASS") {
    writeFileSync(join(DIST_DIR, ".mchezo-build.json"), JSON.stringify({ runId: RUN_ID, fingerprint: fp0.hash, head: git.head, builtAt: new Date().toISOString() }, null, 2));
  }
  const browserSpecs = allSpecs.filter((s) => s.phase === "browser");
  const skipBrowser = (reason) => { for (const s of pending.filter((p) => p.phase === "browser")) report.notRun.push({ name: s.name, reason }); pending = pending.filter((p) => p.phase !== "browser"); };
  if (!browserSpecs.length || cancelled) { if (cancelled) skipBrowser("run cancelled"); return; }
  if (build?.status !== "PASS") { report.notes.push("browser checks not run: the production build did not pass"); skipBrowser("the production build did not pass"); return; }
  if (!verifyUnchanged("before browser checks")) { stopReason = "the source tree changed (run invalid)"; skipBrowser(stopReason); return; }

  // Phase 2: is there a browser at all? An absent browser is an
  // environment problem; report it once instead of as N driver failures.
  if (needsBrowser) {
    pending = pending.filter((p) => p !== preflightSpec);
    const pre = await runStep(preflightSpec, 1);
    if (pre.status === "PASS") {
      try { report.browser = JSON.parse(readFileSync(join(RUN_DIR, pre.log), "utf8").split("\n").map((l) => l.replace(/^\[\+[\d.]+s\] /, "")).find((l) => l.startsWith("{"))); } catch { /* informational only */ }
      if (report.browser) {
        report.browser.build = /headless[-_]shell/.test(report.browser.executable) ? "chrome-headless-shell" : "full-chrome"; // managed runs report "chrome-headless-shell (playwright-managed)"
        console.log(`  browser  ${report.browser.build} ${report.browser.version} (${report.browser.source})`);
        if (report.browser.build === "full-chrome") {
          const note = "browser is a full Chrome build, not chrome-headless-shell: it renders more slowly, and several drivers have timing assumptions calibrated on the headless shell (see docs/TESTING.md)";
          report.notes.push(note);
          console.log(`  WARNING  ${note}`);
        }
      }
    } else {
      if (pre.status === "FAIL" || pre.status === "TIMEOUT") pre.status = "INFRA";
      report.notes.push("browser checks not run: browser preflight failed");
      skipBrowser("browser preflight failed");
      return;
    }
  }

  // Phase 3: one gate server per worker, started together.
  const nServers = Math.min(WORKERS, browserQueue.length);
  const started2 = await Promise.all(Array.from({ length: nServers }, (_, i) => startServer(i + 1)));
  for (const s of started2) {
    report.servers.push({ worker: `w${s.worker}`, port: s.port, pid: s.child?.pid ?? null, dataDir: s.dataDir, log: s.log.replace(RUN_DIR, ".") });
    if (s.port) servers.set(s.worker, s);
  }
  const failedServers = started2.filter((s) => !s.port);
  if (failedServers.length) {
    for (const s of failedServers) {
      report.steps.push({ name: `server-start (w${s.worker})`, kind: "infra", status: "INFRA", detail: s.error, log: s.log.replace(RUN_DIR, ".") });
      console.log(`[--] server-start (w${s.worker})            INFRA     ${s.error}`);
    }
    skipBrowser("a gate server could not start");
    return;
  }
  // Compatibility: report.server is worker 1's server (older tooling reads it).
  const s1 = servers.get(1);
  report.server = { port: s1.port, pid: s1.child.pid, dataDir: s1.dataDir, webDist: DIST_DIR };
  for (const s of servers.values()) console.log(`  server   w${s.worker} ${s.base} (pid ${s.child.pid}, data ${s.dataDir})`);

  // MCHEZO_WEB_DIST: drivers that start their own server (check-lifecycle)
  // serve the exact build under test, not whatever apps/web/dist holds.
  for (const spec of browserQueue) spec.env = { MCHEZO_SCREENSHOT_DIR: PARALLEL ? join(SHOT_DIR, spec.name) : SHOT_DIR, MCHEZO_WEB_DIST: DIST_DIR };
  await runPool(browserQueue, WORKERS, {
    before: (spec) => {
      if (!verifyUnchanged(`before ${spec.name}`)) {
        stopReason = "the source tree changed (run invalid)";
        for (const r of running.values()) { const sp = browserQueue.find((b) => b.name === r.name); if (sp) sp.abortReason = "stopped: the run became invalid"; void killTree(r.child); }
        return false;
      }
      return started(spec);
    },
    after: (spec, step, worker) => {
      if (cancelled) return;
      const srv = servers.get(worker);
      // A server killed by a signal has exitCode null and signalCode set, so check both.
      if (srv && (srv.child.exitCode !== null || srv.child.signalCode !== null) && !stopReason) {
        report.steps.push({ name: `server-alive (w${worker})`, kind: "infra", status: "INFRA", detail: `gate server w${worker} exited (${srv.child.signalCode ?? `code ${srv.child.exitCode}`}) during ${spec.name}` });
        report.notes.push(`remaining browser checks not started: server w${worker} died`);
        stopReason = `server w${worker} died`;
      }
    },
  });
  if (progressTimer) clearInterval(progressTimer);
  return predicted;
}

function timingSummary(predicted) {
  const wallSec = (Date.now() - T0) / 1000;
  const ran = report.steps.filter((s) => s.durationSec != null && s.durationSec > 0);
  const sumSec = ran.reduce((s, x) => s + x.durationSec, 0);
  const byWorker = {};
  for (const s of ran) if (s.worker) byWorker[`w${s.worker}`] = (byWorker[`w${s.worker}`] ?? 0) + s.durationSec;
  const utilisation = wallSec > 0 ? sumSec / (wallSec * WORKERS) : 0;
  const longest = [...ran].sort((a, b) => b.durationSec - a.durationSec).slice(0, 5).map((s) => ({ name: s.name, sec: s.durationSec }));
  const ratio = WORKERS > 1 ? contentionRatio(ran, TIMINGS.base) : null;
  const sys = sampler.system();
  const serverUse = [...servers.keys()].map((w) => ({ worker: `w${w}`, ...(sampler.usage(`server:w${w}`) ?? {}) }));
  return { wallSec: Math.round(wallSec), sumSec: Math.round(sumSec), utilisation: Math.round(utilisation * 100) / 100, perWorkerBusySec: Object.fromEntries(Object.entries(byWorker).map(([k, v]) => [k, Math.round(v)])), predicted: predicted ? { low: Math.round(predicted.low), mid: Math.round(predicted.mid), high: Math.round(predicted.high), confidence: predicted.confidence } : null, contentionRatio: ratio, longest, backpressure: { waits: backpressure.waits, seconds: Math.round(backpressure.seconds) }, system: sys, serverUse, historicalSequentialWallSec: TIMINGS.sequentialWallSec.length ? Math.round(TIMINGS.sequentialWallSec.reduce((a, b) => a + b, 0) / TIMINGS.sequentialWallSec.length) : null };
}

let predictedForSummary = null;
async function finish() {
  await Promise.all([...running.values()].map((r) => killTree(r.child)));
  await Promise.all([...servers.values()].map((s) => killTree(s.child)));
  const stray = sweep(RUN_TAG);
  if (stray) report.notes.push(`killed ${stray} leftover process(es) started by this run`);
  sampler.stop();
  // A step whose process was killed by cancellation may not have reached its
  // close handler yet; it did not pass, so record it as cancelled.
  for (const s of report.steps) if (s.status == null) { s.status = cancelled ? "CANCELLED" : "INFRA"; s.detail ||= cancelled ? "stopped by cancellation" : "no result recorded"; }
  if (!cancelled) verifyUnchanged("end of run");
  const after = gitInfo(REPO);
  const before = new Set(git.dirty ?? []);
  const touched = (after.dirty ?? []).filter((l) => !before.has(l));
  if (touched.length) {
    report.steps.push({ name: "tracked-files-check", kind: "integrity", status: "FAIL", detail: `the run modified the working tree: ${touched.join(", ")}` });
    console.log(`[--] tracked-files-check          FAIL      the run modified the working tree: ${touched.join(", ")}`);
  }
  // Completeness: every planned step has a status or a not-run reason.
  const seen = new Set([...report.steps.map((s) => s.name), ...report.notRun.map((n) => n.name)]);
  for (const s of allSpecs) if (!seen.has(s.name)) report.notRun.push({ name: s.name, reason: cancelled ? "run cancelled" : "never scheduled (gate bug)" });
  const statuses = report.steps.map((s) => s.status);
  const unexplained = report.notRun.filter((n) => /gate bug|not started/.test(n.reason));
  let exitCode = cancelled ? 130
    : statuses.some((s) => s === "FAIL" || s === "TIMEOUT" || s === "INVALID") ? 1
    : statuses.some((s) => s === "INFRA") ? 2
    : 0;
  if (exitCode === 0 && report.notRun.length) exitCode = unexplained.length || !statuses.includes("INFRA") ? 1 : 2;
  report.exitCode = exitCode;
  report.verdict = { 0: "PASSED", 1: "FAILED", 2: "INFRASTRUCTURE ERROR", 130: "CANCELLED" }[exitCode];
  report.finishedAt = new Date().toISOString();
  report.timing = timingSummary(predictedForSummary);
  for (const s of report.steps) if (s.estSec === undefined) s.estSec = null;
  writeFileSync(join(RUN_DIR, "report.json"), JSON.stringify(report, null, 2));
  try { appendHistory(HISTORY_PATH, historyRecord(report)); } catch (err) { report.notes.push(`timing history not written: ${err.message}`); }
  const count = (s) => statuses.filter((x) => x === s).length;
  const t = report.timing;
  const timingLines = [
    `  timing   wall ${fmtDur(t.wallSec)} · step time ${fmtDur(t.sumSec)} (sum) · ${WORKERS} worker${WORKERS > 1 ? "s" : ""}, ${Math.round(t.utilisation * 100)}% busy · ${t.wallSec > 0 ? (t.sumSec / t.wallSec).toFixed(2) : "?"}× the same steps run one after another`,
    ...(t.predicted ? [`           predicted ${fmtRange(t.predicted.low, t.predicted.high)} (about ${fmtDur(t.predicted.mid)}, ${t.predicted.confidence}) → actual ${fmtDur(t.wallSec)} (${t.predicted.mid ? `${t.wallSec >= t.predicted.mid ? "+" : ""}${Math.round((100 * (t.wallSec - t.predicted.mid)) / t.predicted.mid)}%` : "?"})`] : []),
    ...(t.longest.length ? [`           longest  ${t.longest.slice(0, 3).map((l) => `${l.name} ${fmtDur(l.sec)}`).join(", ")}${t.longest[0] && t.wallSec ? ` · the longest step is ${Math.round((100 * t.longest[0].sec) / t.wallSec)}% of the wall time` : ""}`] : []),
    ...(t.system ? [`           machine  CPU mean ${t.system.cpuPctMean}%, peak ${t.system.cpuPctPeak}% · memory available ≥ ${t.system.memAvailMinMB} MB · load peak ${t.system.load1Peak}${t.backpressure.waits ? ` · backpressure ${t.backpressure.waits} wait(s), ${t.backpressure.seconds}s` : ""}`] : []),
    ...(t.contentionRatio ? [`           contention ×${t.contentionRatio} (median step time vs its sequential median)`] : []),
    ...(t.historicalSequentialWallSec && opts.level === "full" ? [`           baseline sequential full gate: about ${fmtDur(t.historicalSequentialWallSec)} (mean of recorded sequential passes)`] : []),
    "           retries  none (the gate never retries a step)",
  ];
  const summary = [
    "",
    `${report.verdict} (exit ${exitCode}) | ${opts.level} | run ${RUN_ID}`,
    `  ${count("PASS")} passed, ${count("FAIL")} failed, ${count("TIMEOUT")} timed out, ${count("INFRA")} infrastructure, ${count("INVALID")} invalid, ${count("CANCELLED")} cancelled, ${report.notRun.length} not run`,
    ...report.steps.filter((s) => s.status !== "PASS").map((s) => `  ${s.status.padEnd(9)} ${s.name}${s.worker ? ` (w${s.worker})` : ""}${s.failureKind ? ` [${s.failureKind}${s.resourcePressure ? ", machine under pressure" : ""}]` : ""}${s.detail ? `: ${s.detail.slice(0, 200)}` : ""}${s.diag?.length ? `\n            ${s.diag[0].slice(0, 200)}` : ""}`),
    ...report.notRun.map((n) => `  NOT RUN   ${n.name}: ${n.reason}`),
    ...report.notes.map((n) => `  note: ${n}`),
    ...timingLines,
    `  report ${join(RUN_DIR, "report.json")}`,
  ].join("\n");
  writeFileSync(join(RUN_DIR, "summary.txt"), summary + "\n");
  console.log(summary);
  process.exit(exitCode);
}

// ---------- `timings`: history and estimates without running anything ----------
function showTimings() {
  const names = [...new Set([...fastSteps.map((s) => s[0]), "build-web", "browser-preflight", ...ALL_DRIVERS.map((d) => `check-${d}`), "e2e-chromium"])];
  const rows = names.map((n) => ({ n, e: estOf(n) })).sort((a, b) => b.e.mid - a.e.mid);
  console.log(`Gate step timings (seconds; median and p10–p90 of up to 10 sequential runs)`);
  console.log(`  sources: ${TIMINGS.sources.historyRuns} local run(s) in ${HISTORY_PATH.replace(REPO, ".")}${TIMINGS.sources.baselineGenerated ? `, committed baseline of ${TIMINGS.sources.baselineGenerated.slice(0, 10)}` : ""}`);
  for (const { n, e } of rows) console.log(`  ${n.padEnd(28)} ${e.source === "none" ? "   no history" : `${String(Math.round(e.mid)).padStart(5)}  (${Math.round(e.low)}–${Math.round(e.high)}, n=${e.n})`}`);
  const specs = names.map((n) => ({ name: n, est: estOf(n), weight: attrs(n).weight ?? 1, exclusive: !!attrs(n).exclusive }));
  console.log(`\nFull gate estimates (${specs.length} steps; sum of medians ${fmtDur(specs.reduce((s, x) => s + x.est.mid, 0))}):`);
  for (const w of [1, 2, 3, 4]) {
    const c = contentionFor(w, TIMINGS.contention, CPUS);
    const est = estimateMakespan(orderSteps(specs, { parallel: w > 1 }), w, c);
    console.log(`  ${w} worker${w > 1 ? "s" : " "}  ${fmtRange(est.low, est.high).padEnd(8)} about ${fmtDur(est.mid).padEnd(8)} contention ×${c.mid.toFixed(2)} (${c.source}${c.n ? `, ${c.n} run(s)` : ""})`);
  }
  console.log(`  this machine: ${CPUS} CPUs, ${(MEM0 / 1024).toFixed(1)} GB available → auto picks ${autoWorkers({ cpus: CPUS, memAvailMB: MEM0 })} worker(s)`);
  if (opts.updateBaseline) {
    const merged = { generated: new Date().toISOString(), note: "Sequential step samples (newest first) and measured contention ratios. Regenerate with: node scripts/gate.mjs timings --update-baseline", steps: {}, contention: TIMINGS.contention, sequentialWallSec: TIMINGS.sequentialWallSec.slice(0, 10) };
    const recent = buildBaseline(readHistory(HISTORY_PATH));
    for (const [n, samples] of Object.entries(TIMINGS.base).sort(([a], [b]) => a.localeCompare(b))) merged.steps[n] = { samples: samples.map((x) => Math.round(x * 10) / 10), ...(recent.steps[n]?.cpuSec != null ? { cpuSec: recent.steps[n].cpuSec } : {}), ...(recent.steps[n]?.peakRssMB != null ? { peakRssMB: recent.steps[n].peakRssMB } : {}) };
    writeBaseline(BASELINE_PATH, merged);
    console.log(`\nwrote ${BASELINE_PATH.replace(REPO, ".")} (commit it on purpose)`);
  }
}

if (!existsSync(BIN.vite)) {
  mkdirSync(LOG_DIR, { recursive: true });
  console.error(`${INFRA_MARKER}: dependencies are not installed (missing ${BIN.vite}). Run "npm ci".`);
  report.steps.push({ name: "dependencies", kind: "infra", status: "INFRA", detail: "node_modules missing; run npm ci" });
  for (const s of allSpecs) report.notRun.push({ name: s.name, reason: "dependencies missing" });
  await finish();
}
await main().then((p) => { predictedForSummary = p ?? report.plan?.predicted ?? null; }).catch((err) => {
  report.steps.push({ name: "gate-internal", kind: "infra", status: "INFRA", detail: String(err?.stack ?? err) });
});
predictedForSummary ??= report.plan?.predicted ?? null;
if (!cancelled) await finish();
