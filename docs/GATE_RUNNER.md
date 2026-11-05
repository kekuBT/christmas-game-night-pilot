# Regression gate runner — single-run lock

## Why this exists

On 2026-11-05 two full regression batches ran concurrently against the
same dev server (port 3461) and the same fixed log file
(`~/workspace/gates-math-batch.log`). The interactive session's batch
and the 10:45 scheduled run both picked up "run the Math gate" from
`docs/PROGRESS.md` — the scheduled run's conflict rule covers only a
dirty git tree, not a running batch — and wrote to one log with
independent file offsets. Result: 157 null-byte lines, lost verdicts
(check-mchezo's verdict line was destroyed), and two results that
could not be trusted because they ran under doubled load
(check-multiplayer 4/9 failed in one batch, check-tv-lifecycle
exit 1 in the other). The authoritative batch was then killed mid-F5
by the scheduled run's 1800-second timeout, so the gate had to be
resumed.

## The mechanism (v3, 2026-11-05)

`scripts/run-gate.sh` is the only supported way to run a regression
gate (full or partial). v3 hardens it against the two failures that
killed the 2026-11-05 Math gate (owner-directed):

- **Immutable per-run copy.** The script copies itself to a
  read-only per-run file under `~/workspace/.mchezo-gate-runs/`
  (`run-gate-<runid>.sh`, mode 444) and execs the copy. Editing the
  source script can never corrupt an active run — bash reads
  scripts lazily, and the 11:38:51 resume-gate death was exactly a
  mid-run overwrite hitting the running instance. If the copy
  cannot be made, the gate REFUSES to start (exit 4) rather than
  running from the mutable source. The copy is deleted on exit
  (any exit path); on SIGKILL it lingers, inert, under its unique
  name.
- **Exclusive flock** on `~/workspace/.mchezo-gate.lock`, taken by
  the copy before running anything. A second invocation exits 3
  immediately with "GATE ALREADY RUNNING" instead of starting a
  second batch. The lock releases automatically when the holder
  exits or is killed, so a timed-out run never leaves a stale lock
  behind. The holder's PID is recorded in
  `~/workspace/.mchezo-gate.pid` for humans (best-effort; the lock
  itself is the authority, not the pid file).
- **Server check.** It refuses to run if the server at
  `http://localhost:3461` is not responding (exit 2).
- **Unique log + run ID.** Each run writes its own timestamped
  log, `~/workspace/gates-batch-YYYY-MM-DD-HHMM.log` — never a
  shared fixed path — with the run ID in the header. Full driver
  output plus an `exit=$? <name>` line per driver, then the E2E
  run, then a `FAIL` count. If the log itself cannot be written
  (filesystem degraded), the gate refuses to run (exit 5) — a gate
  with no log is not a verdict.
- **Header records the exact verification state:** run ID, git HEAD
  (or "unavailable"), the full dirty-tree file list (first 50
  lines), the sha256 of every driver script, and the built bundle
  identity (`dist/assets/` names + hashes). A verdict is traceable
  to the exact code + bundle it ran on; a gate must never combine
  results from different revisions and call them one clean gate.
- **Process-group orphan cleanup.** Each driver runs in its own
  session (`setsid`), and if the runner is killed (timeout, crash,
  SIGTERM) a trap kills that driver's whole process group — the
  driver and its Chromium children. The cleanup never touches the
  dev server (a separate process, never a child of this script) or
  another run's browsers (separate process groups). No global
  pkill of chromium or drivers.
- **Timeout budget.** `--timeout-minutes N` aborts the gate once N
  minutes have elapsed (exit 124). A full gate is ~60–70 min; a
  30-minute scheduled slot must never start one.
- `scripts/run-gate.sh` with no arguments runs the full 28-driver
  gate (math first) plus E2E. With driver names it runs only those,
  in order; `--e2e` appends the E2E run. `--self-test` acquires the
  lock for 5 seconds and exits — use it to verify contention
  behaviour.

## Rules for every future gate run (interactive or scheduled)

1. Never start a gate except through `scripts/run-gate.sh`.
2. Before starting, check `ps` for a running gate and the lock file;
   if the runner says "already running", do not retry, do not start
   a raw `node scripts/check-*.mjs` loop, and do not write to another
   run's log. Wait for the holder to finish, or ask the owner which
   run to keep.
3. A gate that must finish inside a scheduled run's timeout should
   be split (or the timeout raised by the owner) — a 28-driver gate
   takes ~60–70 minutes and does not fit in the 30-minute scheduled
   slot. Do not let a timeout kill a gate mid-run and call the
   partial log a result.
4. Record the run's log path in `docs/PROGRESS.md` before starting,
   so any other worker reading the task board sees the gate is
   claimed.
5. **The runner and the drivers are frozen while a gate holds the
   lock.** Never edit `scripts/run-gate.sh`, any `scripts/check-*.mjs`,
   or `scripts/e2e-browser.mjs` while a gate is running — bash reads
   scripts lazily, and the driver hashes in the header are the
   record of what actually ran. Edit them only when no gate holds
   the lock.

## Controlled tests (scripts/test-run-gate.sh)

`scripts/test-run-gate.sh [--quick]` verifies the runner's
mechanics with no real drivers and no Chromium (a stub driver that
spawns a child sleep and sleeps). Tests: (1) contention — two
simultaneous `--self-test` invocations, exactly one exits 0 and
the other exits 3; (2) lock release — a third `--self-test` exits
0 after both finish; (3) cancellation + orphan cleanup — TERM the
runner mid-stub-driver, the stub and its child must die, the lock
must free, and the dev server must still respond; (4) timeout
budget — `--timeout-minutes 1` aborts before the second stub
(exit 124; skipped by `--quick`, ~65s). Verdicts distinguish
PASS / FAIL (a runner defect) from INCONCLUSIVE (the environment
blocked the test, e.g. exit 4/5 while EPERM is active). Exit 0 =
all passed, 1 = any FAIL, 2 = inconclusive-only.
Status 2026-11-05 ~11:56 EST: the tests ran but are INCONCLUSIVE —
the runner's copy step failed on EPERM (five 0-byte run copies),
so no contention/trap/lock test could execute; the fail-safe
(refuse to run) itself worked. Re-run them once shell content
writes recover.

## Scheduled automation

The scheduled run (`local-dev-christmas-30m`) was corrected
2026-11-05 ~11:30 EST (owner-approved) to require every driver run
to go through this runner with bounded verification only. It is
currently on a **temporary no-drivers hold** (owner-directed
2026-11-05 ~11:48 EST, Chromium SIGTRAP + git EPERM): scheduled
runs do no browser drivers at all (at most one minimal Chromium
launch probe per run to test recovery) until the owner lifts the
hold. The pre-hold body is preserved at
`workspace/goals/christmas-game-night-github-coordination/hidden_files/cron-local-dev-pre-hold-body-2026-11-05.md`;
restore it verbatim via `cron.update` to lift the hold (owner
direction only), and record the restoration here. Until then, the
lock protects only runs that use the runner, and the PROGRESS.md
claim (rule 4) is the signal a scheduled worker reads.

## Scheduling changes (documented per owner instruction)

- **2026-11-05 ~11:30 EST (owner-approved):** the scheduled job
  `local-dev-christmas-30m` was corrected after two collisions in
  one morning. What changed (body only; schedule, title, delivery,
  and timeout unchanged — still every 30 min, 1800 s): a new
  "Regression gates" section requires every driver run to go through
  `scripts/run-gate.sh` (exclusive flock, unique timestamped log),
  forbids launching a full 60–70-minute gate inside the 30-minute
  run (bounded verification only: at most one named driver, or unit
  tests / typecheck / lint), requires checking for a running gate
  first, requires recording the source revision with every
  verification run, and requires cleaning up stray test processes
  after an interrupted run without touching the dev server or
  another run's processes. Why: the 10:45 run's gate was killed
  mid-F5 by its timeout, and its successor (`/tmp/math-batch.sh`,
  started 11:18:54) collided with the locked resume gate two seconds
  later; the owner then authorized stopping that duplicate and the
  workflow correction. Next run after the change: 11:45:46 EST.
- **2026-11-05 ~11:48 EST (owner-directed TEMPORARY HOLD):** the
  scheduled job `local-dev-christmas-30m` was tightened from
  "bounded verification (at most one named driver)" to "no browser
  drivers at all" until the environment is demonstrably healthy
  (Chromium SIGTRAP, Incident 4, still failing ~11:47 EST; git
  writes flap EPERM). At most one minimal Chromium launch probe
  per run, only to test recovery; if it succeeds, record the fact
  and still do not start a gate — the owner lifts the hold. The
  pre-hold body is preserved at
  `workspace/goals/christmas-game-night-github-coordination/hidden_files/cron-local-dev-pre-hold-body-2026-11-05.md`;
  restore it verbatim via `cron.update` to lift the hold (owner
  direction only). Schedule, title, delivery, and timeout
  unchanged; next run after the hold: 12:15:46 EST.
- **2026-11-05 ~11:5x EST (owner-directed hardening, runner v3):**
  `scripts/run-gate.sh` was rewritten to execute an immutable
  per-run copy (read-only, outside the repo; refuses to run with
  exit 4 if the copy cannot be made), run each driver in its own
  session (`setsid`) with process-group orphan cleanup (never the
  dev server, never another run's browsers, no global pkill),
  record driver sha256 hashes + the built bundle identity + the
  full dirty-tree file list in the run header, and accept
  `--timeout-minutes N` (abort with exit 124). A fail-safe aborts
  the gate if the run log itself cannot be written (exit 5).
  Controlled tests in `scripts/test-run-gate.sh` (stub driver, no
  Chromium): contention, lock release, TERM-mid-driver orphan
  cleanup + server-alive, timeout budget. Status ~11:56 EST:
  INCONCLUSIVE — the copy step failed on EPERM (five 0-byte run
  copies), so no mechanics test could execute; re-run them once
  shell content writes recover. The runner's syntax and its
  dependencies (setsid, flock, sha256sum) are verified; a v2
  `--self-test` passed earlier (lock acquire/release, exit 0).
