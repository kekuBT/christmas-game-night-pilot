#!/bin/bash
# Beta R4 W4 (handoff 6933392621): the W4 restart rehearsal and its controls, in one bounded run. LOCAL ONLY.
#   bash scripts/beta/w4-selftest.sh <image tag> [--work <dir>]
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

end_selftest
echo "-- $passn passed, $failn failed"
[ "$failn" = 0 ] && { echo "W4 SELFTEST PASSED"; exit 0; }
echo "W4 SELFTEST FAILED"; exit 1
