#!/bin/bash
# Beta R4 W4 (handoff 6933392621; review 6935165862): the W4 restart rehearsal and its controls, in one bounded run.
# LOCAL ONLY.
#   bash scripts/beta/w4-selftest.sh <image tag> [--work <dir>]
# K0 the fault-injection tests of the restart and probe actions (scripts/beta/w4-control-selftest.sh: the very
#    w4-control.sh the harness sources, against a mock docker): every injected failure fails closed, no replacement
#    after a failure, the sentinels kept.
# K0M the meta-control: the same tests pointed at a copy of w4-control.sh with the reviewed defects put back must FAIL,
#    on those cases: a stop judged by the CLI's exit alone, and a fresh branch that ignores the removal's outcome and
#    does not check the volume's users (the original had neither check; either one alone catches an ignored removal).
# K1 the W3 harness self-test's mock cases M1-M5 (scripts/beta/w3-harness-selftest.sh --mock-only), pointed at the W4
#    harness: a failed docker run, a missing image, a container exiting early, a wrong revision and a failed
#    authorization each fail without touching a pre-existing w3-svc, without authorizing after a failure, without
#    starting the proxy or the driver, and remove only what the run created.
# Real Docker, with SENTINELS that must survive every case: a container named w4-svc, a volume named w4-data-sentinel
# (both created here unless they exist, then left untouched) and a process whose command line looks like the harness's.
# K2 the rehearsal: W4 REHEARSAL HARNESS PASSED.
# K3 the negative control (--control empty-data): the run FAILS; exactly the six R2 continuity and durability checks
#    fail (sockets back, same room and seats, answers kept, screens on a live connection, play continues, the Memory
#    Book note); every R1 check passes.
# K4 an unrelated listener on 18443: fails at the port preflight; no container started; the listener got 0 connections.
# K5 a wrong expected revision (W4_EXPECTED_REVISION): fails at readiness, before authorization or any browser work.
# K6 a guard that never answers (W4_GUARD_MODE=hang, deadline 20 s): G fails at its deadline; the probe's container
#    and fixture volume are torn down; the data volume's only user stays the container under test; the run stops there.
# K7 a guard that lets a server start (W4_GUARD_MODE=serve: the server without cgn-entrypoint): G fails (a server
#    STARTED); the same teardown and data-volume checks; the run stops there.
# K8 a forced stop (W4_STOP_SECONDS=0: SIGKILL at once, exit 137, although `docker stop` itself exits 0): R1 fails as
#    not graceful; nothing is started or replaced after it; the run stops there.
# Every case: none of its containers, volumes, processes or private files left.
# Exit: 0 "W4 SELFTEST PASSED", 1 "W4 SELFTEST FAILED", 2 bad usage.
set -uo pipefail
IMG=${1:-}; [ -n "$IMG" ] || { echo "usage: bash scripts/beta/w4-selftest.sh <image tag> [--work <dir>]" >&2; exit 2; }
shift; WORK=""
while [ $# -gt 0 ]; do case "$1" in --work) WORK=${2:?}; shift 2 ;; *) echo "unknown option: $1" >&2; exit 2 ;; esac; done
[ -n "$WORK" ] || WORK=$(mktemp -d)
mkdir -p "$WORK"; WORK=$(cd "$WORK" && pwd)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
H="$ROOT/scripts/beta/w4-rehearsal.sh"
TAG=$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')
passn=0; failn=0
chk() { if [ "$2" = 0 ]; then echo "PASS $1"; passn=$((passn + 1)); else echo "FAIL $1${3:+ — $3}"; failn=$((failn + 1)); fi; }
yes0() { "$@" >/dev/null 2>&1 && echo 0 || echo 1; }
no0() { "$@" >/dev/null 2>&1 && echo 1 || echo 0; }
echo "== w4-selftest $(date -u +%FT%TZ), tag $TAG, harness $(sha256sum "$H" | cut -c1-16), driver $(sha256sum "$ROOT/scripts/beta/w4-rehearsal.mjs" | cut -c1-16), image $IMG"

echo "-- K0: the fault-injection tests of the restart and probe actions (mock docker)"
timeout 300 bash "$ROOT/scripts/beta/w4-control-selftest.sh" > "$WORK/K0-$TAG.log" 2>&1
k0=$?
grep -E "^(PASS|FAIL|-- [0-9])" "$WORK/K0-$TAG.log" | sed 's/^/     | /'
chk "K0 every injected failure fails closed (W4 CONTROL SELFTEST PASSED)" "$([ "$k0" = 0 ] && grep -q '^W4 CONTROL SELFTEST PASSED' "$WORK/K0-$TAG.log" && echo 0 || echo 1)" "exit $k0"

echo "-- K0M: the meta-control: the fault tests against a copy of w4-control.sh with the reviewed defects put back"
weak="$WORK/K0M-$TAG-w4-control-weakened.sh"
sed -e 's/^  \[ "\$code" = 0 \] && \[ "\$status" = exited \] && \[ "\$running" = false \] && \[ "\$exitc" = 0 \] && \[ "\$oom" = false \]$/  [ "$code" = 0 ]   # WEAKENED: the CLI exit alone/' \
    -e 's/^  rmo=\$(remove_container "\$old") || { fail_answer .*$/  rmo=$(remove_container "$old")   # WEAKENED: the removal outcome ignored/' \
    -e 's/^    \[ -z "\$users" \] || { fail_answer .*$/    true   # WEAKENED: the volume'"'"'s users not checked/' \
    "$ROOT/scripts/beta/w4-control.sh" > "$weak"
nweak=$(grep -c '# WEAKENED' "$weak")
chk "K0M the defects were put back in the copy (3 weakened lines)" "$([ "$nweak" = 3 ] && echo 0 || echo 1)" "$nweak"
W4_CONTROL_FILE="$weak" timeout 300 bash "$ROOT/scripts/beta/w4-control-selftest.sh" > "$WORK/K0M-$TAG.log" 2>&1
k0m=$?
grep -E "^(FAIL|-- [0-9])" "$WORK/K0M-$TAG.log" | sed 's/^/     | /'
chk "K0M the fault tests FAIL against the weakened copy" "$([ "$k0m" != 0 ] && grep -q '^W4 CONTROL SELFTEST FAILED' "$WORK/K0M-$TAG.log" && echo 0 || echo 1)" "exit $k0m"
chk "K0M a forced exit (137) is caught: stop-forced and fresh-forced fail" "$(grep -q '^FAIL stop-forced fails closed' "$WORK/K0M-$TAG.log" && grep -q '^FAIL fresh-forced starts no replacement' "$WORK/K0M-$TAG.log" && echo 0 || echo 1)"
chk "K0M an ignored removal is caught: fresh-removal-fails, fresh-removal-unconfirmed, fresh-not-ours and fresh-volume-in-use start a replacement and fail" "$(grep -q '^FAIL fresh-removal-fails starts no replacement' "$WORK/K0M-$TAG.log" && grep -q '^FAIL fresh-removal-unconfirmed starts no replacement' "$WORK/K0M-$TAG.log" && grep -q '^FAIL fresh-not-ours starts no replacement' "$WORK/K0M-$TAG.log" && grep -q '^FAIL fresh-volume-in-use starts no replacement' "$WORK/K0M-$TAG.log" && echo 0 || echo 1)"

echo "-- K1: the W3 mock cases against the W4 harness"
timeout 600 bash "$ROOT/scripts/beta/w3-harness-selftest.sh" "$IMG" --mock-only --harness "$H" --work "$WORK/K1-$TAG" > "$WORK/K1-$TAG.log" 2>&1
k1=$?
grep -E "^(PASS|FAIL|-- mock-only)" "$WORK/K1-$TAG.log" | sed 's/^/     | /'
chk "K1 the mock cases M1-M5 pass against the W4 harness" "$([ "$k1" = 0 ] && echo 0 || echo 1)" "exit $k1"

# ---------------------------------------------------------------- sentinels
sc=""; made_c=0; sv=""; made_v=0; sp=""; lp=""
end_selftest() {
  [ -n "$lp" ] && kill "$lp" 2>/dev/null
  [ -n "$sp" ] && kill "$sp" 2>/dev/null
  [ "$made_c" = 1 ] && [ -n "$sc" ] && docker rm -f -v "$sc" >/dev/null 2>&1 && echo "   removed this self-test's sentinel container ${sc:0:12}"
  [ "$made_v" = 1 ] && [ -n "$sv" ] && docker volume rm "$sv" >/dev/null 2>&1 && echo "   removed this self-test's sentinel volume $sv"
  made_c=0; made_v=0; lp=""; sp=""
}
trap end_selftest EXIT
trap 'echo "self-test interrupted"; exit 130' INT TERM
if e=$(docker ps -aq --no-trunc --filter "name=^w4-svc$") && [ -n "$e" ]; then sc=$e; echo "   w4-svc exists: used as the sentinel, left untouched"
else sc=$(docker create --name w4-svc --label "w4.selftest=$TAG" "$IMG") && made_c=1; fi
if docker volume inspect w4-data-sentinel >/dev/null 2>&1; then sv=w4-data-sentinel; echo "   w4-data-sentinel exists: used as the sentinel, left untouched"
else docker volume create --label "w4.selftest=$TAG" w4-data-sentinel >/dev/null && sv=w4-data-sentinel && made_v=1; fi
bash -c 'exec -a "node scripts/beta/render-like-proxy.mjs --https-port 18443 w4-rehearsal.mjs (w4 selftest sentinel)" sleep 1800' &
sp=$!
echo "   sentinels: container w4-svc ${sc:0:12}, volume $sv, process $sp"
sentinels_ok() {
  chk "$1 the sentinel container w4-svc survives" "$(yes0 docker inspect "$sc")"
  chk "$1 the sentinel volume survives" "$(yes0 docker volume inspect "$sv")"
  chk "$1 the sentinel process survives" "$(yes0 kill -0 "$sp")"
}
run_case() {   # <id> <title> [env assignments...] -- [harness driver options...]
  local id=$1 title=$2; shift 2
  local envs=() ; while [ $# -gt 0 ] && [ "$1" != "--" ]; do envs+=("$1"); shift; done; [ "${1:-}" = "--" ] && shift
  CASE_DIR="$WORK/$id-$TAG"; mkdir -p "$CASE_DIR"
  env "${envs[@]}" timeout 1200 bash "$H" "${CASE_IMG:-$IMG}" "$CASE_DIR/run" "$@" > "$CASE_DIR/out.log" 2>&1
  CASE_RC=$?
  CASE_RUN=$(sed -n 's/^== w4-rehearsal .* run \([0-9TZ]*-[0-9a-f]*\),.*/\1/p' "$CASE_DIR/out.log" | head -1)
  echo "-- $id: $title (exit $CASE_RC, run ${CASE_RUN:-?})"
  sed 's/^/     | /' "$CASE_DIR/out.log"
}
after_run() {
  local id=$1
  chk "$id leaves none of its containers or volumes" "$([ -n "$CASE_RUN" ] && [ -z "$(docker ps -aq --filter "label=w4.owner=$CASE_RUN")" ] && [ -z "$(docker volume ls -q --filter "label=w4.owner=$CASE_RUN")" ] && echo 0 || echo 1)"
  chk "$id leaves no processes, listeners or private files" "$(yes0 grep -qE "processes left: 0; listeners left on [0-9/]*: (0|not checked [^;]*); private files left: no" "$CASE_DIR/out.log")"
  chk "$id cleanup ran again as a no-op" "$(yes0 grep -q 'cleanup #[0-9]*: nothing owned left to remove' "$CASE_DIR/out.log")"
  sentinels_ok "$id"
}

run_case K2 "the rehearsal" --
chk "K2 the rehearsal PASSED" "$([ "$CASE_RC" = 0 ] && grep -q '^W4 REHEARSAL HARNESS PASSED' "$CASE_DIR/out.log" && echo 0 || echo 1)" "exit $CASE_RC"
chk "K2 R1's stop was a verified graceful stop (exited, exit code 0, not OOM-killed)" "$(yes0 grep -q '\[restart\] stop: docker stop exit 0; state exited, exit code 0, OOM-killed false: a verified graceful stop' "$CASE_DIR/out.log")"
chk "K2 R2's old container stopped gracefully and was removed, confirmed gone, before the replacement started" "$(grep -q '\[restart\] fresh: the old container .* stopped gracefully (docker stop exit 0; state exited, exit code 0, OOM-killed false)' "$CASE_DIR/out.log" && grep -q '\[restart\] fresh: removed container .*, confirmed gone' "$CASE_DIR/out.log" && grep -q '\[restart\] fresh: no container uses the data volume; starting the replacement' "$CASE_DIR/out.log" && echo 0 || echo 1)"
chk "K2 the guard refused in its own container on its own fixture volume; the data volume's only user before and after was the container under test" "$(grep -q 'guard-probe (entrypoint): its own container on the fixture volume .* exit 78; server started: false; REFUSED as required' "$CASE_DIR/out.log" && grep -q "guard-probe: teardown in [0-9]* ms: container .*; volume .*; the data volume's only user before and after: the container under test" "$CASE_DIR/out.log" && echo 0 || echo 1)"
after_run K2

run_case K3 "the negative control: a fresh container on EMPTY data" -- --control empty-data
fails=$(grep -c '^   FAIL ' "$CASE_DIR/out.log"); r1fails=$(grep -c '^   FAIL R1 ' "$CASE_DIR/out.log")
expect_fail() { yes0 grep -q "^   FAIL R2 $1" "$CASE_DIR/out.log"; }
chk "K3 the run reports FAILED" "$([ "$CASE_RC" != 0 ] && grep -q '^W4 REHEARSAL HARNESS FAILED' "$CASE_DIR/out.log" && echo 0 || echo 1)"
chk "K3 exactly six checks failed, all after R2, none in R1" "$([ "$fails" = 6 ] && [ "$r1fails" = 0 ] && echo 0 || echo 1)" "$fails failed, $r1fails in R1"
chk "K3 failed: sockets back" "$(expect_fail "each page (host, guest, TV) opened a new live socket")"
chk "K3 failed: the same room and seats" "$(expect_fail "the same room, the same two seats")"
chk "K3 failed: the acknowledged answers kept" "$(expect_fail "the acknowledged answers are kept")"
chk "K3 failed: the screens on a live connection" "$(expect_fail "each screen shows the playing round on a new live connection")"
chk "K3 failed: play continues" "$(expect_fail "play continues")"
chk "K3 failed: the Memory Book note reads back" "$(expect_fail "the seeded Memory Book note still reads back")"
after_run K3

timeout 600 node -e 'const fs=require("fs");let n=0;const f=process.argv[1];require("net").createServer((s)=>{n++;fs.writeFileSync(f,String(n));s.destroy();}).listen(18443,"127.0.0.1",()=>fs.writeFileSync(f,"0"));' "$WORK/K4-hits-$TAG" &
lp=$!
for _ in $(seq 1 40); do [ -s "$WORK/K4-hits-$TAG" ] && break; sleep 0.25; done
before=$(docker ps -aq --filter label=w4.owner | sort | tr '\n' ' ')
run_case K4 "an unrelated listener already on 18443" --
after=$(docker ps -aq --filter label=w4.owner | sort | tr '\n' ' ')
chk "K4 fails at the port preflight, starting no container" "$([ "$CASE_RC" != 0 ] && grep -q 'FAILED at port preflight' "$CASE_DIR/out.log" && [ "$before" = "$after" ] && echo 0 || echo 1)"
chk "K4 never authorizes and never starts the browser work" "$(no0 grep -qE 'AUTHORIZED|-- the rehearsal' "$CASE_DIR/out.log")"
chk "K4 the unrelated listener got no connection and still runs" "$([ "$(cat "$WORK/K4-hits-$TAG")" = 0 ] && kill -0 "$lp" 2>/dev/null && echo 0 || echo 1)"
kill "$lp" 2>/dev/null; wait "$lp" 2>/dev/null; lp=""
after_run K4

run_case K5 "an unexpected revision" W4_EXPECTED_REVISION=0000000000000000000000000000000000000000 --
chk "K5 fails at readiness on the revision" "$([ "$CASE_RC" != 0 ] && grep -q "FAILED at readiness: revision '7097ac2bb062925bb296a129f4771f1e68fd522d', not the expected 0000" "$CASE_DIR/out.log" && echo 0 || echo 1)"
chk "K5 never authorizes and never starts the browser work" "$(no0 grep -qE 'AUTHORIZED|-- the rehearsal' "$CASE_DIR/out.log")"
after_run K5

# The guard and forced-stop negative controls: each must fail at its step, stop the run there, and leave nothing.
stops_there() {   # <id> <the one failed check's start>
  chk "$1 the run reports FAILED with exactly one failed check: $2" "$([ "$CASE_RC" != 0 ] && grep -q '^W4 REHEARSAL HARNESS FAILED' "$CASE_DIR/out.log" && [ "$(grep -c '^   FAIL ' "$CASE_DIR/out.log")" = 1 ] && grep -q "^   FAIL $2" "$CASE_DIR/out.log" && echo 0 || echo 1)" "$(grep -c '^   FAIL ' "$CASE_DIR/out.log") failed"
  chk "$1 the rehearsal stopped there (ABORTED; the round was not played on)" "$(grep -q '^   ABORTED the harness reported a failed' "$CASE_DIR/out.log" && ! grep -q '^   PASS F ' "$CASE_DIR/out.log" && echo 0 || echo 1)"
}
guard_teardown() {   # <id>
  local ms
  ms=$(sed -n 's/.*guard-probe: teardown in \([0-9]*\) ms: container .*; volume .*/\1/p' "$CASE_DIR/out.log" | head -1)
  chk "$1 the probe's container and fixture volume were torn down, bounded (teardown ${ms:-?} ms < 30000)" "$([ -n "$ms" ] && [ "$ms" -lt 30000 ] && echo 0 || echo 1)"
  chk "$1 no simultaneous writer: the data volume's only user before and after the probe was the container under test" "$(yes0 grep -q "guard-probe: teardown .*the data volume's only user before and after: the container under test" "$CASE_DIR/out.log")"
}
run_case K6 "a guard that never answers (deadline 20 s)" W4_GUARD_MODE=hang W4_GUARD_SECONDS=20 --
stops_there K6 "G the rollback guard"
chk "K6 G failed at its deadline: no exit within 20 s, no server started" "$(yes0 grep -q 'guard-probe (hang): its own container on the fixture volume .* exit null; server started: false; FAILED: the guard did not exit within 20 s' "$CASE_DIR/out.log")"
guard_teardown K6
after_run K6
run_case K7 "a guard that lets a server start (the server without cgn-entrypoint; deadline 20 s)" W4_GUARD_MODE=serve W4_GUARD_SECONDS=20 --
stops_there K7 "G the rollback guard"
chk "K7 G failed: a server STARTED in the probe's container (on its fixture volume, not the data volume)" "$(yes0 grep -q 'guard-probe (serve): its own container on the fixture volume .* server started: true; FAILED: .*a server STARTED: the guard did not refuse' "$CASE_DIR/out.log")"
guard_teardown K7
after_run K7
run_case K8 "a forced stop (SIGKILL at once)" W4_STOP_SECONDS=0 --
stops_there K8 "R1 the container stopped gracefully"
chk "K8 the stop is refused although docker stop exited 0: exit code 137" "$(yes0 grep -q '\[restart\] stop: docker stop exit 0; state exited, exit code 137, OOM-killed false: FAILED: not a verified graceful stop' "$CASE_DIR/out.log")"
chk "K8 nothing was started or replaced after the failed stop (no start, no fresh)" "$(grep -qE '\[restart\] (start|fresh)' "$CASE_DIR/out.log" && echo 1 || echo 0)"
after_run K8

end_selftest
echo "-- $passn passed, $failn failed"
[ "$failn" = 0 ] && { echo "W4 SELFTEST PASSED"; exit 0; }
echo "W4 SELFTEST FAILED"; exit 1
