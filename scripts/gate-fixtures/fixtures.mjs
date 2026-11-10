// Deliberate-behaviour "drivers" used only by scripts/gate-selftest.mjs to
// prove the gate reports failures as failures. Never part of a real gate:
// the gate only auto-discovers scripts/check-*.mjs.
//
//   node <mode>.mjs <baseUrl>   (each mode file sets FIXTURE_MODE and imports this module):
//     pass          check the gate's own server answers, then exit 0
//     fail          print a FAIL line and exit 1 (an assertion failure)
//     hang          start a child process, record both pids, never exit
//     hang-detached like hang, but the child is in its own process group,
//                   both ignore SIGTERM, and the child holds our stdout
//     mutate        edit a source file (makes the built bundle stale), exit 0
//     touch-tracked edit a tracked non-source file, exit 0
//     kill-server   kill this worker's gate server (Linux /proc), exit 0
//
// Stage 5.2 (parallel gate): `pass` appends a line to FIXTURE_RECORD_FILE
// (worker, server, start and end) when it is set, and the hang modes write
// FIXTURE_PID_DIR/<script>.json when that is set (several hangs at once).
import { spawn } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const base = process.argv[2];
const mode = process.env.FIXTURE_MODE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const script = basename(process.argv[1], ".mjs");
const pidFile = () => (process.env.FIXTURE_PID_DIR ? join(process.env.FIXTURE_PID_DIR, `${script}.json`) : process.env.FIXTURE_PID_FILE);

if (mode === "pass") {
  const t0 = Date.now();
  const r = await fetch(`${base}/games`);
  console.log(`fixture server ${base} answered ${r.status}`);
  await sleep(Number(process.env.FIXTURE_SLEEP_MS ?? 0));
  if (process.env.FIXTURE_RECORD_FILE) appendFileSync(process.env.FIXTURE_RECORD_FILE, JSON.stringify({ script, base, worker: process.env.MCHEZO_GATE_WORKER, screenshots: process.env.MCHEZO_SCREENSHOT_DIR, t0, t1: Date.now() }) + "\n");
  console.log(r.ok ? "PASS gate server reachable" : "FAIL gate server not reachable");
  process.exit(r.ok ? 0 : 1);
} else if (mode === "fail") {
  console.log("PASS a check that holds");
  console.log("FAIL fixture assertion: deliberately failing check");
  process.exit(1);
} else if (mode === "hang") {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  writeFileSync(pidFile(), JSON.stringify({ pid: process.pid, child: child.pid }));
  console.log(`hanging (pid ${process.pid}, child ${child.pid})`);
  setInterval(() => {}, 1000);
} else if (mode === "hang-detached") {
  // Worst case for cleanup, like Playwright's browser: the child is in its
  // own process group (detached), ignores SIGTERM, and holds our stdout.
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: ["ignore", "inherit", "inherit"], detached: true });
  process.on("SIGTERM", () => {}); // the driver itself ignores SIGTERM too
  writeFileSync(pidFile(), JSON.stringify({ pid: process.pid, child: child.pid }));
  console.log(`hanging detached (pid ${process.pid}, child ${child.pid})`);
  setInterval(() => {}, 1000);
} else if (mode === "mutate") {
  await sleep(Number(process.env.FIXTURE_MUTATE_DELAY_MS ?? 0)); // lets a parallel self-test start a step beside it first
  appendFileSync("src/server/serve.ts", "\n// gate self-test: source edited mid-run\n");
  console.log("PASS edited a source file mid-run");
} else if (mode === "touch-tracked") {
  appendFileSync("docs/DEVELOPMENT.md", "\n<!-- gate self-test -->\n");
  console.log("PASS edited a tracked docs file");
} else if (mode === "kill-server") {
  // Find this run's server for this worker by its ownership tags, and kill it.
  const want = [`MCHEZO_GATE_RUN=${process.env.MCHEZO_GATE_RUN}`, `MCHEZO_GATE_SERVER=w${process.env.MCHEZO_GATE_WORKER}`];
  let killed = 0;
  for (const d of readdirSync("/proc").filter((x) => /^\d+$/.test(x))) {
    try { const env = readFileSync(`/proc/${d}/environ`, "utf8").split("\0"); if (want.every((w) => env.includes(w))) { process.kill(Number(d), "SIGKILL"); killed++; } } catch { /* not ours */ }
  }
  await sleep(500);
  console.log(`PASS killed ${killed} server process(es) of worker w${process.env.MCHEZO_GATE_WORKER}`);
} else {
  console.log(`FAIL unknown FIXTURE_MODE ${mode}`);
  process.exit(1);
}
