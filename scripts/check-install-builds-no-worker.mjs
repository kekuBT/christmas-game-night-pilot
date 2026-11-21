// Regression for review 7057502077 (D-IB-01): check-install-builds must end with a named E1 failure, not hang, when
// the worker its E1 watch waits for never comes. It runs the driver as it is run outside the gate (its own process
// group, no gate timeout), once in each fault mode:
//   e1-no-new-worker   E1 deploys the build already in charge again: the driver's own update starts no attempt, so the
//                      second tab's watch has no first attempt to follow (the driver cancels it);
//   e1-watch-too-late  the second tab's watch starts only after the driver's attempt has ended, so it misses its events
//                      (only the watch's own deadline ends it).
// Checked, for each:
//   - the driver exits by itself with status 1 within BOUND_MS (not 0, not a signal, not killed by this check);
//   - E1 fails by name, with the watch's named outcome, never a pending promise;
//   - the run reaches its end and its cleanup: the final summary line is printed, nothing reached the driver's catch,
//     no process of its group is left, and its private temp directory is empty (builds, live folder, server data,
//     browser profile). tsx's own compile cache (tsx-<uid>), which the server's loader keeps there, is not the driver's.
// Usage: node scripts/check-install-builds-no-worker.mjs [gateBaseUrl]   (the gate passes one; it isn't needed)
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOUND_MS = 240_000; // one driver run is about 45 s; its E1 watch is bounded at 15 s
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const groupAlive = (pgid) => { try { process.kill(-pgid, 0); return true; } catch (e) { return e.code !== "ESRCH"; } };
/** Live processes whose command line names `dir` (the browser runs in a process group of its own, with its profile there). */
function processesUsing(dir) {
  const found = [];
  let pids;
  try { pids = readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch { return found; }
  for (const pid of pids) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ");
      if (cmd.includes(dir)) found.push(`${pid} ${cmd.split(" ")[0].split("/").pop()}`);
    } catch { /* gone */ }
  }
  return found;
}

/** Run the driver once in `fault`, in its own process group and private temp directory; return what it did. */
async function runFault(fault) {
  const tmp = mkdtempSync(join(tmpdir(), "mz-ib-noworker-"));
  const env = { ...process.env, MCHEZO_INSTALL_BUILDS_FAULT: fault, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
  delete env.MCHEZO_SCREENSHOT_DIR;
  const started = Date.now();
  const child = spawn(process.execPath, ["scripts/check-install-builds.mjs"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  let killedByBound = false;
  const exit = await new Promise((resolve) => {
    const timer = setTimeout(() => { killedByBound = true; try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ } }, BOUND_MS);
    child.on("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  let leftover = groupAlive(child.pid);
  for (let i = 0; i < 20 && leftover; i++) { await sleep(250); leftover = groupAlive(child.pid); }
  if (leftover) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ } }
  const using = processesUsing(tmp);
  let tmpLeft;
  try { tmpLeft = readdirSync(tmp).filter((n) => !/^tsx-\d+$/.test(n)); } catch { tmpLeft = ["<unreadable>"]; }
  rmSync(tmp, { recursive: true, force: true });
  return { out, exit, seconds, killedByBound, leftover, using, tmpLeft };
}

const CASES = [
  { fault: "e1-no-new-worker", own: /"own":"no new worker"/, second: /"second":"cancelled: the driver's own update gave \\"no new worker\\""/, why: "the driver's own update started no attempt, and it cancelled the watch" },
  { fault: "e1-watch-too-late", own: /"own":"redundant"/, second: /"second":"no first attempt appeared within 15 s"/, why: "the late watch ended at its own deadline" },
];
for (const c of CASES) {
  const r = await runFault(c.fault);
  const lines = r.out.split("\n");
  const line = (prefix) => lines.find((l) => l.startsWith(prefix)) ?? "";
  const ownLine = line("FAIL E1 W deployed with a listed file missing: W's install runs and fails") || line("PASS E1 W deployed with a listed file missing: W's install runs and fails");
  const secondLine = line("FAIL E1 another tab asks for an update the moment W's install ends");
  const t = `[${c.fault}]`;
  check(`${t} the driver ran in that fault mode`, r.out.includes(`FAULT MODE ${c.fault}`));
  check(`${t} the driver ended by itself within ${BOUND_MS / 1000} s`, !r.killedByBound, `${r.seconds} s`);
  check(`${t} it exited with status 1 (a failing run, not a pass and not a signal)`, r.exit.code === 1 && r.exit.signal === null, JSON.stringify(r.exit));
  check(`${t} E1's own attempt is reported as expected`, c.own.test(ownLine), ownLine.slice(0, 200));
  check(`${t} E1's second-attempt check FAILS by name: ${c.why}`, c.second.test(secondLine), secondLine.slice(0, 260));
  check(`${t} no unexpected error and no wait without an end (nothing reached the driver's catch)`, !r.out.includes("FAIL no unexpected error"), line("FAIL no unexpected error").slice(0, 220));
  check(`${t} the run reached its end (its summary line is printed)`, /build-update check\(s\) FAILED/.test(r.out));
  check(`${t} nothing of its process group is left (driver and server stopped)`, !r.leftover);
  check(`${t} no process still uses its private temp directory (the browser is closed)`, r.using.length === 0, JSON.stringify(r.using));
  check(`${t} its private temp directory is empty (builds, live folder, server data and browser profile removed)`, r.tmpLeft.length === 0, JSON.stringify(r.tmpLeft));
  if (failures) console.log(`\n--- the driver's output (${c.fault}) ---\n${r.out.slice(-4000)}\n`);
}
console.log(failures ? `\n${failures} no-worker check(s) FAILED` : "\nAll no-worker checks passed");
process.exit(failures ? 1 : 0);
