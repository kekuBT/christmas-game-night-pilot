#!/usr/bin/env bash
# Controlled tests for scripts/run-gate.sh (v3) — runner mechanics
# only, no real drivers, no Chromium. Run when the filesystem allows
# shell content writes (the runner copies itself and writes a log;
# while EPERM is active it correctly refuses with exit 4/5).
#
# Usage: scripts/test-run-gate.sh [--quick]
#   --quick skips the ~65s timeout-budget test.
# Tests:
#   1. Contention: two simultaneous --self-test invocations — exactly
#      one acquires the lock (exit 0), the other exits 3.
#   2. Lock release: after both finish, a third --self-test exits 0.
#   3. Cancellation + orphan cleanup: start a gate on the stub driver
#      (scripts/stub-driver.mjs, spawns a child sleep and sleeps),
#      TERM the runner after 3s, then verify the stub and its child
#      are gone, the lock is free, and the dev server is still
#      responding. The stub never launches Chromium.
#   4. Timeout budget (skipped by --quick): a gate with two stubs —
#      the first sleeps 65s, the second is instant — with
#      --timeout-minutes 1 must abort before the second driver with
#      exit 124.
# Verdicts: PASS / FAIL (a runner defect) / INCONCLUSIVE (the
# environment blocked the test — e.g. exit 4/5 while EPERM is active,
# or the runner never started the stub). Exit 0 = all passed,
# 1 = any FAIL, 2 = inconclusive-only (no FAIL).
set -u
cd "$(dirname "$0")/.." || exit 1
RUNNER="scripts/run-gate.sh"
BASE="http://localhost:3461"
FAIL=0
INCONCLUSIVE=0
say() { echo "[test] $*"; }
pass() { say "  PASS $1"; }
fail() { say "  FAIL $1"; FAIL=1; }
inconclusive() { say "  INCONCLUSIVE $1"; INCONCLUSIVE=1; }

# --- 1. Contention ---
say "test 1: two simultaneous --self-test (one must exit 0, one exit 3)"
"$RUNNER" --self-test > /tmp/gate-test-a.log 2>&1 &
A_PID=$!
"$RUNNER" --self-test > /tmp/gate-test-b.log 2>&1 &
B_PID=$!
wait "$A_PID"; A_RC=$?
wait "$B_PID"; B_RC=$?
say "  self-test A exit=$A_RC, B exit=$B_RC"
if { [ "$A_RC" = 0 ] && [ "$B_RC" = 3 ]; } || { [ "$A_RC" = 3 ] && [ "$B_RC" = 0 ]; }; then
  pass "contention"
elif [ "$A_RC" = 4 ] || [ "$B_RC" = 4 ] || [ "$A_RC" = 5 ] || [ "$B_RC" = 5 ]; then
  inconclusive "contention — runner refused to start (exit 4/5, filesystem degraded?)"
else
  fail "contention (expected one 0 and one 3)"
fi

# --- 2. Lock release ---
say "test 2: lock free after both self-tests"
"$RUNNER" --self-test > /tmp/gate-test-c.log 2>&1
C_RC=$?
say "  third self-test exit=$C_RC"
if [ "$C_RC" = 0 ]; then pass "lock release";
elif [ "$C_RC" = 4 ] || [ "$C_RC" = 5 ]; then inconclusive "lock release — runner refused to start (exit $C_RC)";
else fail "lock release (exit $C_RC)"; fi

# --- 3. Cancellation + orphan cleanup ---
say "test 3: TERM the runner mid-stub-driver; stub + child must die, server must live"
"$RUNNER" stub-driver > /tmp/gate-test-cancel.log 2>&1 &
GATE_PID=$!
sleep 3
STUB_PID="$(pgrep -f 'stub-driver.mjs' | head -1 || true)"
CHILD_PID="$(pgrep -f 'sleep 120' | head -1 || true)"
say "  runner pid=$GATE_PID stub pid=${STUB_PID:-none} child sleep pid=${CHILD_PID:-none}"
if [ -z "$STUB_PID" ]; then
  inconclusive "orphan cleanup — runner never started the stub (see /tmp/gate-test-cancel.log)"
else
  kill -TERM "$GATE_PID" 2>/dev/null || true
  sleep 4
  if pgrep -f 'stub-driver.mjs' >/dev/null 2>&1; then fail "orphan: stub-driver still alive"; else pass "stub-driver gone"; fi
  if pgrep -f 'sleep 120' >/dev/null 2>&1; then fail "orphan: child sleep still alive"; else pass "child sleep gone"; fi
fi
if [ -n "$STUB_PID" ]; then
  if kill -0 "$GATE_PID" 2>/dev/null; then kill -TERM "$GATE_PID" 2>/dev/null || true; fi
fi
if curl -fs -o /dev/null "$BASE/"; then pass "dev server still responding"; else fail "dev server not responding"; fi
"$RUNNER" --self-test > /tmp/gate-test-d.log 2>&1
D_RC=$?
say "  post-cancel self-test exit=$D_RC"
if [ "$D_RC" = 0 ]; then pass "lock free after cancel";
elif [ "$D_RC" = 4 ] || [ "$D_RC" = 5 ]; then inconclusive "lock free after cancel — runner refused to start (exit $D_RC)";
else fail "lock not free after cancel (exit $D_RC)"; fi

# --- 4. Timeout budget (slow; --quick skips) ---
if [ "${1:-}" != "--quick" ]; then
  say "test 4: --timeout-minutes 1 must abort before the second stub (~65s)"
  STUB_SLEEP_SECS=65 "$RUNNER" --timeout-minutes 1 stub-driver stub-driver > /tmp/gate-test-timeout.log 2>&1
  T_RC=$?
  say "  timeout gate exit=$T_RC"
  if [ "$T_RC" = 124 ]; then pass "timeout budget";
  elif [ "$T_RC" = 4 ] || [ "$T_RC" = 5 ]; then inconclusive "timeout budget — runner refused to start (exit $T_RC)";
  else fail "timeout budget (expected 124, got $T_RC)"; fi
else
  say "test 4: skipped (--quick)"
fi

say "stray run copies (inert, unique names): $(ls "$HOME/workspace/.mchezo-gate-runs" 2>/dev/null | wc -l)"
if [ "$FAIL" = 1 ]; then say "RUNNER TESTS FAILED"; exit 1;
elif [ "$INCONCLUSIVE" = 1 ]; then say "RUNNER TESTS INCONCLUSIVE (environment-blocked)"; exit 2;
else say "ALL RUNNER TESTS PASSED"; exit 0; fi
