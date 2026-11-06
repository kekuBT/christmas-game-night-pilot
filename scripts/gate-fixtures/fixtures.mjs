// Deliberate-behaviour "drivers" used only by scripts/gate-selftest.mjs to
// prove the gate reports failures as failures. Never part of a real gate:
// the gate only auto-discovers scripts/check-*.mjs.
//
//   node <mode>.mjs <baseUrl>   (each mode file sets FIXTURE_MODE and imports this module):
//     pass          check the gate's own server answers, then exit 0
//     fail          print a FAIL line and exit 1 (an assertion failure)
//     hang          start a child process, record both pids, never exit
//     mutate        edit a source file (makes the built bundle stale), exit 0
//     touch-tracked edit a tracked non-source file, exit 0
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const base = process.argv[2];
const mode = process.env.FIXTURE_MODE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (mode === "pass") {
  const r = await fetch(`${base}/games`);
  console.log(`fixture server ${base} answered ${r.status}`);
  await sleep(Number(process.env.FIXTURE_SLEEP_MS ?? 0));
  console.log(r.ok ? "PASS gate server reachable" : "FAIL gate server not reachable");
  process.exit(r.ok ? 0 : 1);
} else if (mode === "fail") {
  console.log("PASS a check that holds");
  console.log("FAIL fixture assertion: deliberately failing check");
  process.exit(1);
} else if (mode === "hang") {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  writeFileSync(process.env.FIXTURE_PID_FILE, JSON.stringify({ pid: process.pid, child: child.pid }));
  console.log(`hanging (pid ${process.pid}, child ${child.pid})`);
  setInterval(() => {}, 1000);
} else if (mode === "mutate") {
  appendFileSync("src/server/serve.ts", "\n// gate self-test: source edited mid-run\n");
  console.log("PASS edited a source file mid-run");
} else if (mode === "touch-tracked") {
  appendFileSync("docs/DEVELOPMENT.md", "\n<!-- gate self-test -->\n");
  console.log("PASS edited a tracked docs file");
} else {
  console.log(`FAIL unknown FIXTURE_MODE ${mode}`);
  process.exit(1);
}
