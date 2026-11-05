#!/usr/bin/env bash
# Single-run regression gate for Mchezo (see docs/GATE_RUNNER.md).
#
# v3 (2026-11-05, owner-directed hardening). The runner executes an
# IMMUTABLE PER-RUN COPY of itself, so editing the source script can
# never corrupt an active run. (The 2026-11-05 resume gate died on
# exactly that: a mid-run overwrite of run-gate.sh hit bash's lazy
# script reads and killed the runner with a syntax error at its
# final line, exit 2.)
#
# Usage:
#   scripts/run-gate.sh [--e2e] [--timeout-minutes N] [check-name ...]
# With no driver names: the full 28-driver gate (math first), then E2E.
# With names: only those drivers, in the given order; --e2e appends the
# E2E browser run at the end. Example (resume a partial gate):
#   scripts/run-gate.sh check-mchezo check-tv-lifecycle check-f5 --e2e
# --timeout-minutes N aborts the gate once N minutes have elapsed
# (a full gate is ~60-70 min; a 30-minute scheduled slot must never
# start one — the scheduled job is on a temporary no-drivers hold).
#
# The gate takes an exclusive flock on ~/workspace/.mchezo-gate.lock
# before running anything. A second invocation exits 3 immediately
# ("already running") instead of piling a second batch onto the same
# server and the same log — the failure mode that mangled the Math
# gate log on 2026-11-05 (two batches, one fixed log path, 157
# null-byte lines, lost verdicts). The lock releases automatically
# when the holder exits or is killed, so a timed-out run never leaves
# a stale lock behind. The holder's PID is recorded in
# ~/workspace/.mchezo-gate.pid for humans (best-effort; the lock
# itself is the authority, not the pid file).
#
# Each run writes its own timestamped log under ~/workspace/ (never
# the shared gates-math-batch.log) and records its run ID, the exact
# source revision (git HEAD + dirty-tree file list), the sha256 of
# every driver script, and the built bundle identity in the header,
# so any verdict can be traced to the exact code + bundle it ran on.
#
# Orphan cleanup: each driver runs in its own session (setsid), and
# if the runner is killed (timeout, crash, SIGTERM) a trap kills
# that driver's whole process group — the driver and its Chromium
# children. The cleanup never touches the dev server (a separate
# process, never a child of this script) or another run's browsers
# (separate process groups). No global pkill of chromium or drivers.
#
# --self-test acquires the lock, holds it 5s, and exits 0. Run it in
# the background and invoke the script again to verify contention
# behaviour (the second call must exit 3).
set -u

# ---------- wrapper: immutable per-run copy ----------
# The copy lives outside the repo (~/workspace/.mchezo-gate-runs/)
# so repo edits can't reach it. The copy is made read-only (444).
# If the copy cannot be made, the gate REFUSES to run from the
# mutable source — fail safe, never run unprotected.
if [ "${GATE_RUN_COPY:-}" != "1" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)" || { echo "cannot resolve the runner's directory" >&2; exit 4; }
  SRC="$SCRIPT_DIR/$(basename "$0")"
  REPO="$(cd "$SCRIPT_DIR/.." && pwd)" || { echo "cannot resolve the repo root" >&2; exit 4; }
  RUN_ID="$(date +%Y%m%d-%H%M)-$$"
  RUN_DIR="$HOME/workspace/.mchezo-gate-runs"
  mkdir -p "$RUN_DIR" || { echo "cannot create run dir $RUN_DIR" >&2; exit 4; }
  COPY="$RUN_DIR/run-gate-$RUN_ID.sh"
  cp "$SRC" "$COPY" || { echo "cannot copy the runner to $COPY — refusing to run from the mutable source" >&2; exit 4; }
  chmod 444 "$COPY" || { echo "cannot make the run copy read-only" >&2; exit 4; }
  export GATE_RUN_COPY=1 GATE_RUN_ID="$RUN_ID" GATE_RUN_COPY_PATH="$COPY" GATE_REPO="$REPO"
  exec bash "$COPY" "$@"
fi

# ---------- worker (running as the immutable copy) ----------
RUN_ID="${GATE_RUN_ID:?missing GATE_RUN_ID}"
COPY_PATH="${GATE_RUN_COPY_PATH:-$0}"
REPO="${GATE_REPO:-$PWD}"
cd "$REPO" || { echo "cannot cd to repo $REPO" >&2; exit 1; }
[ -f "$REPO/package.json" ] && [ -d "$REPO/scripts" ] || { echo "not a Mchezo repo root: $REPO" >&2; exit 1; }
# The copy is deleted when this process exits (any exit path). On
# SIGKILL it lingers, inert, under its unique name — harmless.
trap 'rm -f "$COPY_PATH"' EXIT

BASE="http://localhost:3461"
LOCK_FILE="$HOME/workspace/.mchezo-gate.lock"
PID_FILE="$HOME/workspace/.mchezo-gate.pid"
LOG="$HOME/workspace/gates-batch-$(date +%Y-%m-%d-%H%M).log"

E2E=0
SELF_TEST=0
TIMEOUT_MINUTES=0
DRIVERS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --e2e) E2E=1; shift ;;
    --self-test) SELF_TEST=1; shift ;;
    --timeout-minutes) TIMEOUT_MINUTES="$2"; shift 2 ;;
    *) DRIVERS+=("$1"); shift ;;
  esac
done
case "$TIMEOUT_MINUTES" in ''|*[!0-9]*) echo "--timeout-minutes needs a non-negative integer" >&2; exit 4;; esac

command -v setsid >/dev/null 2>&1 || { echo "setsid is required (process-group cleanup) and was not found" >&2; exit 4; }

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  HOLDER="$(cat "$PID_FILE" 2>/dev/null || echo unknown)"
  echo "GATE ALREADY RUNNING — lock $LOCK_FILE is held (pid $HOLDER). Refusing to start a second batch. See docs/GATE_RUNNER.md." >&2
  exit 3
fi
echo "$$" > "$PID_FILE"

if [ "$SELF_TEST" = 1 ]; then
  echo "lock acquired by $$ (run $RUN_ID, copy $COPY_PATH); holding 5s (self-test)"
  sleep 5
  echo "self-test OK — lock released on exit"
  exit 0
fi

if [ "${#DRIVERS[@]}" -eq 0 ]; then
  DRIVERS=(check-math check-mchezo check-spectator check-tv-spectator check-tv-lifecycle check-leaderboard check-tv-entry check-m6 check-ws-reconnect check-abstain check-f4 check-f5 check-mobile check-contrast check-multiplayer check-reveal check-library check-shuffle check-studio check-reduced-motion check-closest check-restart check-viewports check-double-start check-game-night check-year check-geography check-errors)
  E2E=1
fi

if ! curl -fs -o /dev/null "$BASE/"; then
  echo "server at $BASE is not responding; refusing to run drivers against a dead server." >&2
  exit 2
fi

# Source revision + working-tree state for this run (rule: every
# verdict traces to the exact code + bundle it ran on). Git may be
# degraded (EPERM); record "unavailable" rather than failing.
REV="$(git rev-parse HEAD 2>/dev/null || echo unavailable)"
if DIRTY_RAW="$(git status --porcelain 2>/dev/null)"; then
  DIRTY_LIST="$(printf '%s' "$DIRTY_RAW" | head -50)"
  DIRTY_COUNT="$(printf '%s' "$DIRTY_LIST" | grep -c . || true)"
else
  DIRTY_LIST="(git unavailable — working-tree state could not be read)"
  DIRTY_COUNT="unknown"
fi
if HASH_RAW="$(sha256sum scripts/check-*.mjs scripts/e2e-browser.mjs 2>/dev/null)"; then
  DRIVER_HASHES="$(printf '%s' "$HASH_RAW" | sed 's|  */| |')"
else
  DRIVER_HASHES="(sha256sum unavailable)"
fi
if [ -d apps/web/dist/assets ]; then
  BUILD_ID="$(ls apps/web/dist/assets/ | tr '\n' ' '; sha256sum apps/web/dist/assets/* 2>/dev/null | awk '{print $1}' | head -4 | tr '\n' ' ')"
else
  BUILD_ID="(no dist/ — build not present)"
fi

# say() mirrors a line to stdout and to the run log.
say() { echo "$@" | tee -a "$LOG"; }

say "=== gate started $(date) (run $RUN_ID, pid $$, copy $COPY_PATH, revision $REV, dirty files: $DIRTY_COUNT, log $LOG) ==="
say "--- working tree (git status --porcelain, first 50 lines) ---"
printf '%s\n' "$DIRTY_LIST" | tee -a "$LOG"
say "--- driver hashes (sha256) ---"
printf '%s\n' "$DRIVER_HASHES" | tee -a "$LOG"
say "--- built bundle (dist/assets) ---"
printf '%s\n' "$BUILD_ID" | tee -a "$LOG"
# Fail safe: if the log itself cannot be written (filesystem
# degraded), refuse to run — a gate with no log is not a verdict.
if [ ! -s "$LOG" ]; then
  echo "cannot write the run log $LOG — filesystem degraded, refusing to run" >&2
  exit 5
fi

START_EPOCH="$(date +%s)"
check_budget() {
  if [ "$TIMEOUT_MINUTES" -gt 0 ]; then
    local elapsed=$(( $(date +%s) - START_EPOCH ))
    if [ "$elapsed" -ge $((TIMEOUT_MINUTES * 60)) ]; then
      say "TIMEOUT: budget ${TIMEOUT_MINUTES}m spent after ${elapsed}s — stopping the gate (run $RUN_ID)"
      exit 124
    fi
  fi
}

# Orphan cleanup: if this script is killed mid-driver, take that
# driver's whole process group down with it (the driver + its
# Chromium children, all in the setsid group). The dev server and
# other runs' drivers are in different groups and are never touched.
# No global pkill. The lock releases on exit automatically (flock),
# and the EXIT trap removes the run copy.
DRIVER_PID=""
DRIVER_GROUP=""
cleanup_driver() {
  if [ -n "$DRIVER_GROUP" ] && kill -0 -"$DRIVER_GROUP" 2>/dev/null; then
    kill -TERM -"$DRIVER_GROUP" 2>/dev/null || true
    sleep 2
    kill -KILL -"$DRIVER_GROUP" 2>/dev/null || true
  fi
}
trap 'cleanup_driver; say "gate interrupted by signal; driver group cleaned up, lock released on exit"; exit 130' TERM INT HUP

run_one() {
  # $1 = label, $2.. = command (run in its own session/group).
  local label="$1"; shift
  check_budget
  say "--- $label $(date +%H:%M:%S) ---"
  setsid "$@" >> "$LOG" 2>&1 &
  DRIVER_PID=$!
  DRIVER_GROUP=$!
  wait "$DRIVER_PID"
  local rc=$?
  DRIVER_PID=""
  DRIVER_GROUP=""
  say "exit=$rc $label"
  return "$rc"
}

for d in "${DRIVERS[@]}"; do
  run_one "$d" node "scripts/$d.mjs" "$BASE" || true
done
if [ "$E2E" = 1 ]; then
  run_one "e2e-chromium" node scripts/e2e-browser.mjs "$BASE" --browser=chromium --games=all || true
fi
say "=== gate done $(date) (run $RUN_ID) ==="
say "FAIL lines in $LOG: $(grep -c '^FAIL' "$LOG" || true)"
