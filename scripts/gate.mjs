#!/usr/bin/env node
// Mchezo verification gate. See docs/TESTING.md.
//
//   node scripts/gate.mjs fast                      typecheck, lint, unit tests, production build
//   node scripts/gate.mjs targeted math mobile ...  build + only the named browser drivers
//   node scripts/gate.mjs full                      fast + every browser driver + E2E
//
// Guarantees:
// - Exit code: 0 all passed; 1 a check failed, timed out, or its result is
//   invalid; 2 infrastructure error (no browser, server could not start,
//   tool missing) with no check failure; 130 cancelled.
// - Every run is isolated: its own results directory, its own build of the
//   current tree, its own server process on an OS-assigned port with its
//   own data directory. Concurrent runs cannot share state, so no lock.
// - The tree is fingerprinted when it is built and re-checked before each
//   later step and at the end; any change invalidates the run.
// - Each step runs in its own process group with a hard timeout; the gate
//   only ever kills process groups it started.
// - Drivers write screenshots into the run directory; a run that modifies
//   tracked files fails.
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gitInfo, sourceFingerprint } from "./lib/fingerprint.mjs";

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

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opts = { level: "fast", drivers: [], driverFiles: [], driverTimeoutSec: null, totalTimeoutMin: null, resultsDir: join(REPO, "test-results"), e2e: null };
for (const a of argv) {
  if (a === "fast" || a === "targeted" || a === "full") opts.level = a;
  else if (a.startsWith("--driver-timeout=")) opts.driverTimeoutSec = Number(a.split("=")[1]);
  else if (a.startsWith("--timeout=")) opts.totalTimeoutMin = Number(a.split("=")[1]);
  else if (a.startsWith("--results-dir=")) opts.resultsDir = resolve(a.split("=")[1]);
  else if (a.startsWith("--driver-file=")) opts.driverFiles.push(resolve(a.split("=").slice(1).join("=")));
  else if (a === "--e2e") opts.e2e = true;
  else if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }
  else if (a.startsWith("-")) { console.error(`unknown option ${a}`); process.exit(2); }
  else opts.drivers.push(a.replace(/^check-/, "").replace(/\.mjs$/, ""));
}
for (const n of [opts.driverTimeoutSec, opts.totalTimeoutMin]) {
  if (n !== null && !(Number.isFinite(n) && n > 0)) { console.error("timeouts must be positive numbers"); process.exit(2); }
}
function printHelp() {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 6).join("\n"));
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

// ---------- run directory ----------
const startedAt = new Date();
const git = gitInfo(REPO);
const stamp = startedAt.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const RUN_ID = `${stamp}-${(git.head ?? "nogit").slice(0, 8)}-${process.pid}`;
const RUN_DIR = join(opts.resultsDir, RUN_ID);
const LOG_DIR = join(RUN_DIR, "logs");
mkdirSync(LOG_DIR, { recursive: true });
const DIST_DIR = join(RUN_DIR, "web-dist");
const DATA_DIR = join(RUN_DIR, "server-data");
const SHOT_DIR = join(RUN_DIR, "screenshots");

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
  browser: null,
  steps: [],
  notes: [],
};
const fp0 = sourceFingerprint(REPO);
report.fingerprint = fp0;

// ---------- process control ----------
let current = null; // { child, name }
let server = null; // { child, port }
let cancelled = false;
const deadline = opts.totalTimeoutMin ? Date.now() + opts.totalTimeoutMin * 60_000 : null;

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
// everything the run starts (steps and server) inherits MCHEZO_GATE_RUN.
// Process groups are not enough: Playwright launches Chromium detached, in
// its own group, so a driver killed with SIGKILL can orphan its browser.
// After each step, and at the end, the gate kills any process still
// carrying this run's tag, and nothing else.
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
  void Promise.all([killTree(current?.child), killTree(server?.child)]).then(() => finish());
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));

/**
 * Run one step as its own process group. Resolves to a step record with
 * status PASS | FAIL | TIMEOUT | INFRA | CANCELLED.
 */
function runStep(name, command, args, { timeoutSec, env = {}, kind = "check" } = {}) {
  const index = report.steps.length + 1;
  const logPath = join(LOG_DIR, `${String(index).padStart(2, "0")}-${name}.log`);
  const step = { name, kind, command: [basename(command), ...args.map((a) => a.replace(REPO, "."))].join(" "), status: null, exitCode: null, durationSec: null, log: logPath.replace(RUN_DIR, "."), detail: "" };
  report.steps.push(step);
  if (cancelled) { step.status = "CANCELLED"; return Promise.resolve(step); }
  let limit = timeoutSec;
  if (deadline !== null) limit = Math.min(limit, Math.max(1, Math.floor((deadline - Date.now()) / 1000)));
  if (deadline !== null && Date.now() >= deadline) {
    step.status = "TIMEOUT";
    step.detail = "total --timeout budget spent before this step started";
    return Promise.resolve(step);
  }
  process.stdout.write(`[${String(index).padStart(2, " ")}] ${name.padEnd(28)} `);
  const t0 = Date.now();
  const log = createWriteStream(logPath);
  log.write(`$ ${step.command}\n# timeout ${limit}s\n\n`);
  return new Promise((done) => {
    let output = "";
    const child = spawn(command, args, {
      cwd: REPO,
      env: { ...process.env, ...env, FORCE_COLOR: "0", MCHEZO_GATE_RUN: RUN_ID, MCHEZO_GATE_STEP: `${RUN_ID}:${index}` },
      detached: !IS_WINDOWS, // own process group on POSIX, so cleanup is exact
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    current = { child, name };
    const capture = (d) => { log.write(d); output = (output + d.toString()).slice(-20000); };
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
      current = null;
      const leftovers = sweep(stepTag(index));
      if (leftovers) log.write(`\n# killed ${leftovers} leftover process(es) started by this step\n`);
      step.exitCode = code;
      step.durationSec = Math.round((Date.now() - t0) / 100) / 10;
      if (step.status === "INFRA") { /* spawn error already recorded */ }
      else if (cancelled) step.status = "CANCELLED";
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
      log.end(`\n# ${step.status} (exit ${code ?? signal}) in ${step.durationSec}s\n`);
      console.log(`${step.status.padEnd(9)} ${String(step.durationSec).padStart(6)}s${step.detail ? `  ${step.detail.slice(0, 160)}` : ""}`);
      if (step.status === "FAIL" || step.status === "INFRA") {
        const tail = output.trimEnd().split("\n").slice(-15).map((l) => `      | ${l}`).join("\n");
        if (tail) console.log(tail);
      }
      done(step);
    });
  });
}

/** Re-check the tree: any change since the build invalidates the run. */
function verifyUnchanged(where) {
  const now = sourceFingerprint(REPO);
  if (now.hash === fp0.hash) return true;
  const step = { name: `source-check (${where})`, kind: "integrity", status: "INVALID", detail: "the source tree changed after it was fingerprinted/built; results no longer describe the tree on disk", durationSec: 0 };
  report.steps.push(step);
  console.log(`[--] ${step.name.padEnd(28)} INVALID   ${step.detail}`);
  return false;
}

async function startServer() {
  const logPath = join(LOG_DIR, "server.log");
  const log = createWriteStream(logPath);
  mkdirSync(DATA_DIR, { recursive: true });
  const child = spawn(NODE, ["--import", "tsx", "src/server/serve.ts"], {
    cwd: REPO,
    env: { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR, MCHEZO_WEB_DIST: DIST_DIR, MCHEZO_GATE_RUN: RUN_ID },
    detached: !IS_WINDOWS,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "";
  child.stdout.on("data", (d) => { log.write(d); out += d.toString(); });
  child.stderr.on("data", (d) => { log.write(d); out += d.toString(); });
  for (let i = 0; i < 120 && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) return { child, port: Number(m[1]), log: logPath };
    await new Promise((r) => setTimeout(r, 250));
  }
  await killTree(child);
  return { child: null, port: null, log: logPath, error: out.slice(-500) || "no startup line within 30s" };
}

// ---------- plan ----------
// Per-driver time budgets, about 2x the duration measured on
// chrome-headless-shell in a cloud container (2026-11-06, commit 08348bf):
// leaderboard 928s, e2e 830s, f5 732s, mchezo 376s, tv-lifecycle 350s,
// game-night 270s; every other driver finished in under 160s. A budget is
// a hang detector, not a performance assertion.
const DEFAULT_DRIVER_TIMEOUT_SEC = 600;
const DRIVER_TIMEOUT_SEC = { "check-leaderboard": 1800, "e2e-chromium": 1800, "check-f5": 1500, "check-mchezo": 900, "check-tv-lifecycle": 900, "check-game-night": 900 };
const fastSteps = [
  ["typecheck-server", NODE, [BIN.tsc, "--noEmit"], 300],
  ["typecheck-web", NODE, [BIN.tsc, "-p", "apps/web/tsconfig.json", "--noEmit"], 300],
  ["lint", NODE, [BIN.eslint, "."], 300],
  ["unit-tests", NODE, [BIN.vitest, "run"], 900],
];
const buildStep = ["build-web", NODE, [BIN.vite, "build", "--config", "apps/web/vite.config.ts", "--outDir", DIST_DIR, "--emptyOutDir", "--logLevel", "warn"], 300];
const drivers =
  opts.level === "full" ? ALL_DRIVERS : opts.level === "targeted" ? opts.drivers : [];
const runE2E = opts.e2e ?? opts.level === "full";
const needsServer = drivers.length > 0 || runE2E || opts.driverFiles.length > 0;
const needsBrowser = drivers.length > 0 || runE2E; // fixture drivers (self-test) need no browser

async function main() {
  console.log(`Mchezo gate ${opts.level} | run ${RUN_ID}`);
  console.log(`  revision ${git.head ?? "unknown"}${git.dirty?.length ? ` + ${git.dirty.length} uncommitted change(s)` : " (clean tree)"} | fingerprint ${fp0.hash.slice(0, 12)} (${fp0.files} files)`);
  console.log(`  results  ${RUN_DIR}`);

  if (opts.level === "fast" || opts.level === "full") {
    for (const [name, cmd, args, sec] of fastSteps) await runStep(name, cmd, args, { timeoutSec: sec });
  }
  const build = await runStep(...buildStep.slice(0, 3), { timeoutSec: buildStep[3] });
  if (build.status === "PASS") {
    writeFileSync(join(DIST_DIR, ".mchezo-build.json"), JSON.stringify({ runId: RUN_ID, fingerprint: fp0.hash, head: git.head, builtAt: new Date().toISOString() }, null, 2));
  }

  if (needsServer && build.status !== "PASS") report.notes.push("browser checks not run: the production build did not pass");
  if (needsServer && build.status === "PASS" && !cancelled) {
    if (!verifyUnchanged("before browser checks")) return;
    if (needsBrowser) {
    // Preflight: is there a browser at all? An absent browser is an
    // environment problem; report it once instead of as N driver failures.
    const pre = await runStep("browser-preflight", NODE, [
      "--input-type=module",
      "-e",
      "const m = await import('./scripts/lib/driver-env.mjs'); const exe = m.chromiumExecutable(); const b = await m.launchChromium(); console.log(JSON.stringify({ version: b.version(), executable: exe.path, source: exe.source })); await b.close();",
    ], { timeoutSec: 120, kind: "infra" });
    if (pre.status === "PASS") {
      try { report.browser = JSON.parse(readFileSync(join(RUN_DIR, pre.log), "utf8").split("\n").find((l) => l.startsWith("{"))); } catch { /* informational only */ }
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
      return;
    }
    }
    server = await startServer();
    if (!server.port) {
      report.steps.push({ name: "server-start", kind: "infra", status: "INFRA", detail: server.error, log: server.log.replace(RUN_DIR, ".") });
      console.log(`[--] server-start                 INFRA     ${server.error}`);
      return;
    }
    const base = `http://localhost:${server.port}`;
    report.server = { port: server.port, pid: server.child.pid, dataDir: DATA_DIR, webDist: DIST_DIR };
    console.log(`  server   ${base} (pid ${server.child.pid}, data ${DATA_DIR})`);
    const driverEnv = { MCHEZO_SCREENSHOT_DIR: SHOT_DIR };
    const list = [
      ...drivers.map((d) => [`check-${d}`, [join("scripts", `check-${d}.mjs`), base]]),
      ...opts.driverFiles.map((f) => [`fixture-${basename(f, ".mjs")}`, [f, base]]),
      ...(runE2E ? [["e2e-chromium", [join("scripts", "e2e-browser.mjs"), base, "--browser=chromium", "--games=all"]]] : []),
    ];
    for (const [name, args] of list) {
      if (cancelled) break;
      if (!verifyUnchanged(`before ${name}`)) return;
      await runStep(name, NODE, args, { timeoutSec: opts.driverTimeoutSec ?? DRIVER_TIMEOUT_SEC[name] ?? DEFAULT_DRIVER_TIMEOUT_SEC, env: driverEnv, kind: "browser" });
      if (cancelled) break; // the run stopped its own server; not a server failure
      if (server.child.exitCode !== null) {
        report.steps.push({ name: "server-alive", kind: "infra", status: "INFRA", detail: `gate server exited (code ${server.child.exitCode}) during ${name}` });
        report.notes.push("remaining browser checks not run: server died");
        return;
      }
    }
  }
}

async function finish() {
  await killTree(current?.child);
  await killTree(server?.child);
  const stray = sweep(RUN_TAG);
  if (stray) report.notes.push(`killed ${stray} leftover process(es) started by this run`);
  if (!cancelled) verifyUnchanged("end of run");
  const after = gitInfo(REPO);
  const before = new Set(git.dirty ?? []);
  const touched = (after.dirty ?? []).filter((l) => !before.has(l));
  if (touched.length) {
    report.steps.push({ name: "tracked-files-check", kind: "integrity", status: "FAIL", detail: `the run modified the working tree: ${touched.join(", ")}` });
    console.log(`[--] tracked-files-check          FAIL      the run modified the working tree: ${touched.join(", ")}`);
  }
  const statuses = report.steps.map((s) => s.status);
  const exitCode = cancelled ? 130
    : statuses.some((s) => s === "FAIL" || s === "TIMEOUT" || s === "INVALID") ? 1
    : statuses.some((s) => s === "INFRA") ? 2
    : 0;
  report.exitCode = exitCode;
  report.verdict = { 0: "PASSED", 1: "FAILED", 2: "INFRASTRUCTURE ERROR", 130: "CANCELLED" }[exitCode];
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(RUN_DIR, "report.json"), JSON.stringify(report, null, 2));
  const count = (s) => statuses.filter((x) => x === s).length;
  const summary = [
    "",
    `${report.verdict} (exit ${exitCode}) | ${opts.level} | run ${RUN_ID}`,
    `  ${count("PASS")} passed, ${count("FAIL")} failed, ${count("TIMEOUT")} timed out, ${count("INFRA")} infrastructure, ${count("INVALID")} invalid, ${count("CANCELLED")} cancelled`,
    ...report.steps.filter((s) => s.status !== "PASS").map((s) => `  ${s.status.padEnd(9)} ${s.name}${s.detail ? `: ${s.detail.slice(0, 200)}` : ""}`),
    ...report.notes.map((n) => `  note: ${n}`),
    `  report ${join(RUN_DIR, "report.json")}`,
  ].join("\n");
  writeFileSync(join(RUN_DIR, "summary.txt"), summary + "\n");
  console.log(summary);
  process.exit(exitCode);
}

if (!existsSync(BIN.vite)) {
  console.error(`${INFRA_MARKER}: dependencies are not installed (missing ${BIN.vite}). Run "npm ci".`);
  report.steps.push({ name: "dependencies", kind: "infra", status: "INFRA", detail: "node_modules missing; run npm ci" });
  await finish();
}
await main().catch((err) => {
  report.steps.push({ name: "gate-internal", kind: "infra", status: "INFRA", detail: String(err?.stack ?? err) });
});
if (!cancelled) await finish();
