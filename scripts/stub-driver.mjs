// TEST STUB for scripts/test-run-gate.sh — NOT a gate driver.
//
// A driver-shaped script that does no browser work: it spawns one
// child process (`sleep 120`) and then sleeps itself, so the
// runner's cancellation test can prove the trap kills the driver's
// whole process group (the stub AND its child) and nothing else.
// It never touches the dev server, never launches Chromium, and is
// never in the gate's default driver list. Keep it; delete it only
// if test-run-gate.sh is removed too.
import { spawn } from "node:child_process";

// Sleep seconds, configurable for the timeout test
// (STUB_SLEEP_SECS=65 + --timeout-minutes 1 aborts before driver 2).
const secs = Number(process.env.STUB_SLEEP_SECS ?? 120);
const child = spawn("sleep", [String(secs)], { stdio: "ignore" });
console.log(`stub-driver: pid ${process.pid}, child sleep pid ${child.pid}, sleeping ${secs}s`);
child.unref();
await new Promise((r) => setTimeout(r, secs * 1000));
console.log("stub-driver: finished (should not print if the runner killed the group)");
