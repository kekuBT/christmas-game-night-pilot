#!/bin/bash
# Beta R4 W3 (review 6930033578): negative controls for scripts/beta/w3-rehearsal.sh, the local W3 rehearsal harness.
# LOCAL ONLY: local Docker, local ports, no hosting account, no forwarding. Every resource it creates is its own and is
# removed by its ID at the end; a pre-existing container named w3-svc is used as a sentinel and left untouched.
#
#   bash scripts/beta/w3-harness-selftest.sh <image tag> [--harness <path>] [--mock-only] [--work <dir>]
#
# M1-M5 run the harness against a MOCK docker/curl/node on PATH (nothing real is started; every call is recorded), with
# a pre-existing container named w3-svc in the mock's state:
#   M1 `docker run` fails            M2 the image is missing        M3 the container exits before it is ready
#   M4 /health reports another revision                              M5 cgn-authorize fails
# Each must: exit non-zero; leave the pre-existing w3-svc alone; remove only a container ID its own `docker run`
# returned; never authorize after a failed step; never start the proxy or the driver (no `node` call).
# D1-D5 use real local Docker with the given image, a sentinel container named w3-svc (created here unless one exists)
# and a sentinel process whose command line looks like the harness's own:
#   D1 a full passing run: PASSED, and both sentinels survive; repeated cleanup is a no-op
#   D2 an unrelated listener on 18443: the run fails before `docker run`, authorization or any browser work, and the
#      listener receives no connection
#   D3 a container that never becomes ready (an image that exits at once): fails before authorization, removes its own
#      container only
#   D4 the service reports an unexpected revision (W3_EXPECTED_REVISION set to a wrong value): fails before
#      authorization, removes its own container only
#   D5 an interrupted run (SIGTERM during the browser work): exit 143, and its own container, processes and private
#      files are gone; the sentinels survive
#   D6 the driver's stale-host control (--control stale-host): the host's page is frozen before R5 while its API calls
#      keep working; exactly one check must fail, the host's rendered R5 check, while the TV's and the guest's rendered
#      checks and the server-record checks pass
# --mock-only runs M1-M5 only (used to reproduce the defect on the old harness without touching real Docker).
# Exit: 0 "W3 HARNESS SELFTEST PASSED", 1 "... FAILED", 2 bad usage.
set -uo pipefail
IMG=${1:-}; [ -n "$IMG" ] || { echo "usage: bash scripts/beta/w3-harness-selftest.sh <image tag> [--harness <path>] [--mock-only] [--work <dir>]" >&2; exit 2; }
shift
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HARNESS="$ROOT/scripts/beta/w3-rehearsal.sh"; MOCK_ONLY=0; WORK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --harness) HARNESS=${2:?}; shift 2 ;;
    --mock-only) MOCK_ONLY=1; shift ;;
    --work) WORK=${2:?}; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$WORK" ] || WORK=$(mktemp -d)
mkdir -p "$WORK"; WORK=$(cd "$WORK" && pwd)
TAG=$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')
PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
NODE_IMG=public.ecr.aws/docker/library/node@sha256:71bcbb3b215b3fa84b5b167585675072f4c270855e37a599803f1a58141a0716
passn=0; failn=0
ok() { echo "PASS $*"; passn=$((passn + 1)); }
bad() { echo "FAIL $*"; failn=$((failn + 1)); }
chk() { if [ "$2" = 0 ]; then ok "$1"; else bad "$1${3:+ — $3}"; fi; }   # chk <name> <0|1> [detail]
yes0() { "$@" >/dev/null 2>&1 && echo 0 || echo 1; }                     # 0 when the command succeeds
no0() { "$@" >/dev/null 2>&1 && echo 1 || echo 0; }                      # 0 when the command fails
echo "== w3-harness-selftest $(date -u +%FT%TZ), tag $TAG, harness $HARNESS ($(sha256sum "$HARNESS" | cut -c1-16)), image $IMG"

# ---------------------------------------------------------------- the mock docker, curl and node
MB="$WORK/mockbin-$TAG"; mkdir -p "$MB"
cat > "$MB/docker" <<'EOF'
#!/bin/bash
# Mock docker: records each call in $MOCK_LOG; containers are files in $MOCK_STATE (line 1 id, 2 name, 3 label).
printf 'docker %s\n' "$*" >> "$MOCK_LOG"
S=$MOCK_STATE
find_c() { local c; for c in "$S"/c.*; do [ -e "$c" ] || continue; if [ "$1" = "$(sed -n 2p "$c")" ] || [ "$1" = "$(sed -n 1p "$c")" ]; then echo "$c"; return 0; fi; done; return 1; }
case "$1" in
  image) [ "${MOCK_IMAGE:-ok}" = missing ] && { echo "Error: No such image" >&2; exit 1; }; echo "sha256:0000mock"; exit 0 ;;
  run)
    [ "${MOCK_RUN:-ok}" = fail ] && { echo "docker: Error response from daemon: mock run failure" >&2; exit 125; }
    name=""; label=""; prev=""; for a in "$@"; do [ "$prev" = --name ] && name=$a; [ "$prev" = --label ] && label=$a; prev=$a; done
    if [ -n "$name" ] && find_c "$name" >/dev/null; then echo "docker: Conflict. The container name \"/$name\" is already in use" >&2; exit 125; fi
    id=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n'); printf '%s\n%s\n%s\n' "$id" "$name" "$label" > "$S/c.$id"
    printf 'created %s\n' "$id" >> "$MOCK_LOG"; echo "$id"; exit 0 ;;
  rm) shift; while [ $# -gt 0 ] && [ "${1#-}" != "$1" ]; do shift; done
    rc=0; for t in "$@"; do if c=$(find_c "$t"); then cid=$(sed -n 1p "$c"); rm -f "$c"; printf 'removed %s\n' "$cid" >> "$MOCK_LOG"; echo "$t"; else echo "Error: No such container: $t" >&2; rc=1; fi; done; exit $rc ;;
  inspect) shift; fmt=""; [ "${1:-}" = -f ] && { fmt=$2; shift 2; }
    c=$(find_c "${1:-}") || { echo "Error: No such object: ${1:-}" >&2; exit 1; }
    case "$fmt" in *.owner*) l=$(sed -n 3p "$c"); echo "${l#*=}" ;; *State.Running*) echo "${MOCK_RUNNING:-true}" ;; *State.Status*) echo "exited exit=0" ;; *) echo "{}" ;; esac; exit 0 ;;
  port) echo "127.0.0.1:18080"; exit 0 ;;
  exec) cat > /dev/null; [ "${MOCK_EXEC:-ok}" = fail ] && { echo "mock: cgn-authorize failed"; exit 1; }; echo "AUTHORIZED data_dir=/var/data/cgn-w1 (mock)"; exit 0 ;;
  ps) want=""; prev=""; for a in "$@"; do [ "$prev" = --filter ] && want=$a; prev=$a; done
    for c in "$S"/c.*; do [ -e "$c" ] || continue
      case "$want" in
        label=*) [ "$(sed -n 3p "$c")" = "${want#label=}" ] && sed -n 1p "$c" ;;
        name=*) n=${want#name=}; n=${n#^}; n=${n%\$}; [ "$(sed -n 2p "$c")" = "$n" ] && sed -n 1p "$c" ;;
        *) sed -n 1p "$c" ;;
      esac
    done; exit 0 ;;
  *) exit 0 ;;
esac
EOF
cat > "$MB/curl" <<'EOF'
#!/bin/bash
printf 'curl %s\n' "$*" >> "$MOCK_LOG"
case "${MOCK_HEALTH:-none}" in
  none) exit 7 ;;
  ok) body='{"ok":true,"revision":"7097ac2bb062925bb296a129f4771f1e68fd522d"}' ;;
  wrong) body='{"ok":true,"revision":"0000000000000000000000000000000000000000"}' ;;
esac
case " $* " in *" -o "*) ;; *) printf '%s' "$body" ;; esac
exit 0
EOF
cat > "$MB/node" <<'EOF'
#!/bin/bash
printf 'node %s\n' "$*" >> "$MOCK_LOG"; exit 1
EOF
chmod +x "$MB/docker" "$MB/curl" "$MB/node"

# One mock case: a pre-existing container named w3-svc in the mock state, then the harness with the given MOCK_* env.
mock_case() {
  local id=$1 title=$2; shift 2
  local d="$WORK/$id-$TAG"; mkdir -p "$d/state"
  printf 'sentinel0000\nw3-svc\nw3.selftest=sentinel\n' > "$d/state/c.sentinel0000"
  : > "$d/calls.log"
  env "$@" PATH="$MB:$PATH" MOCK_LOG="$d/calls.log" MOCK_STATE="$d/state" timeout 180 bash "$HARNESS" mock-image "$d/run" > "$d/out.log" 2>&1
  local rc=$?
  echo "-- $id: $title (exit $rc)"
  sed 's/^/     | /' "$d/out.log"
  echo "     calls:"; sed 's/^/     > /' "$d/calls.log"
  chk "$id exits non-zero" "$([ "$rc" != 0 ] && echo 0 || echo 1)" "exit $rc"
  chk "$id the pre-existing w3-svc container survives" "$([ -e "$d/state/c.sentinel0000" ] && echo 0 || echo 1)"
  local created removed foreign=0 r
  created=$(sed -n 's/^created //p' "$d/calls.log")
  removed=$(sed -n 's/^removed //p' "$d/calls.log")
  for r in $removed; do printf '%s\n' "$created" | grep -qx "$r" || foreign=$((foreign + 1)); done
  chk "$id removes only a container its own docker run created" "$([ "$foreign" = 0 ] && echo 0 || echo 1)" "$foreign foreign removal(s)"
  chk "$id never deletes by the shared name w3-svc" "$(no0 grep -qE '^docker rm .* w3-svc( |$)' "$d/calls.log")"
  local own_left=0
  for r in $created; do [ -e "$d/state/c.$r" ] && own_left=$((own_left + 1)); done
  chk "$id leaves none of its own containers behind" "$([ "$own_left" = 0 ] && echo 0 || echo 1)" "$own_left left"
  MOCK_LAST="$d"
}
no_auth_no_node() {
  local id=$1 d=$MOCK_LAST
  chk "$id never authorizes (no docker exec)" "$(no0 grep -q '^docker exec' "$d/calls.log")"
  chk "$id never starts the proxy or the driver (no node call)" "$(no0 grep -q '^node ' "$d/calls.log")"
}

mock_case M1 "docker run fails" MOCK_RUN=fail
no_auth_no_node M1
chk "M1 does not try the service after the failed start (no health probe)" "$(no0 grep -q '^curl ' "$MOCK_LAST/calls.log")"
mock_case M2 "the image is missing" MOCK_IMAGE=missing
no_auth_no_node M2
chk "M2 never runs a container" "$(no0 grep -q '^docker run' "$MOCK_LAST/calls.log")"
mock_case M3 "the container exits before it is ready" MOCK_RUNNING=false
no_auth_no_node M3
mock_case M4 "/health reports another revision" MOCK_HEALTH=wrong
no_auth_no_node M4
mock_case M5 "cgn-authorize fails" MOCK_HEALTH=ok MOCK_EXEC=fail
chk "M5 never starts the proxy or the driver (no node call)" "$(no0 grep -q '^node ' "$MOCK_LAST/calls.log")"

if [ "$MOCK_ONLY" = 1 ]; then
  echo "-- mock-only: $passn passed, $failn failed"
  [ "$failn" = 0 ] && { echo "W3 HARNESS SELFTEST PASSED (mock only)"; exit 0; }
  echo "W3 HARNESS SELFTEST FAILED (mock only)"; exit 1
fi

# ---------------------------------------------------------------- real Docker
sentinel_c=""; made_sentinel=0; sentinel_p=""; listener_p=""
end_selftest() {
  [ -n "$listener_p" ] && kill "$listener_p" 2>/dev/null
  [ -n "$sentinel_p" ] && kill "$sentinel_p" 2>/dev/null
  if [ "$made_sentinel" = 1 ] && [ -n "$sentinel_c" ]; then docker rm -f -v "$sentinel_c" >/dev/null 2>&1 && echo "   removed this self-test's own sentinel container ${sentinel_c:0:12}"; fi
  made_sentinel=0; listener_p=""; sentinel_p=""
}
trap end_selftest EXIT
trap 'echo "self-test interrupted"; exit 130' INT TERM
if existing=$(docker ps -aq --no-trunc --filter "name=^w3-svc$") && [ -n "$existing" ]; then
  sentinel_c=$existing; echo "   a container named w3-svc already exists (${sentinel_c:0:12}): used as the sentinel and left untouched"
else
  sentinel_c=$(docker create --name w3-svc --label "w3.selftest=$TAG" "$IMG") || { echo "could not create the sentinel container"; exit 1; }
  made_sentinel=1; echo "   sentinel container w3-svc ${sentinel_c:0:12} (label w3.selftest=$TAG)"
fi
bash -c 'exec -a "node scripts/beta/render-like-proxy.mjs --https-port 18443 w3-rehearsal.mjs (w3 selftest sentinel)" sleep 1200' &
sentinel_p=$!
sleep 0.3
echo "   sentinel process $sentinel_p: $(tr '\0' ' ' < /proc/$sentinel_p/cmdline)"
sentinels_ok() {
  local id=$1
  chk "$id the sentinel container w3-svc survives" "$(yes0 docker inspect "$sentinel_c")"
  chk "$id the sentinel process survives" "$(yes0 kill -0 "$sentinel_p")"
}
owned_left() { local f n=0; for f in /proc/[0-9]*/environ; do grep -qsaF "W3_OWNER=$1" "$f" 2>/dev/null && n=$((n + 1)); done; echo "$n"; }
run_id_of() { sed -n 's/^== w3-rehearsal .* run \([0-9TZ]*-[0-9a-f]*\),.*/\1/p' "$1" | head -1; }
real_case() {   # <id> <title> [env assignments...] : runs the harness in the foreground
  local id=$1 title=$2; shift 2
  local d="$WORK/$id-$TAG"; mkdir -p "$d"
  # shellcheck disable=SC2086
  env "$@" timeout 900 bash "$HARNESS" "${CASE_IMG:-$IMG}" "$d/run" ${CASE_ARGS:-} > "$d/out.log" 2>&1
  CASE_RC=$?; CASE_DIR=$d; CASE_RUN=$(run_id_of "$d/out.log")
  echo "-- $id: $title (exit $CASE_RC, run ${CASE_RUN:-?})"
  sed 's/^/     | /' "$d/out.log"
}
after_run() {   # common checks: the run's own container and processes are gone
  local id=$1
  chk "$id leaves none of its own containers" "$([ -n "$CASE_RUN" ] && [ -z "$(docker ps -aq --filter "label=w3.owner=$CASE_RUN")" ] && echo 0 || echo 1)"
  chk "$id leaves none of its own processes" "$([ -n "$CASE_RUN" ] && [ "$(owned_left "$CASE_RUN")" = 0 ] && echo 0 || echo 1)"
  chk "$id removed its private files" "$(yes0 grep -q 'private files left: no' "$CASE_DIR/out.log")"
  chk "$id cleanup ran again as a no-op" "$(yes0 grep -q 'cleanup #[0-9]*: nothing owned left to remove' "$CASE_DIR/out.log")"
  sentinels_ok "$id"
}

real_case D1 "a full passing run, with both sentinels present"
chk "D1 the run PASSED (exit 0)" "$([ "$CASE_RC" = 0 ] && grep -q '^W3 REHEARSAL HARNESS PASSED' "$CASE_DIR/out.log" && echo 0 || echo 1)"
after_run D1

d2="$WORK/D2-$TAG"; mkdir -p "$d2"
timeout 600 node -e 'const fs=require("fs");let n=0;const f=process.argv[1];require("net").createServer((s)=>{n++;fs.writeFileSync(f,String(n));s.destroy();}).listen(18443,"127.0.0.1",()=>fs.writeFileSync(f,"0"));' "$d2/hits" &
listener_p=$!
for _ in $(seq 1 40); do [ -s "$d2/hits" ] && break; sleep 0.25; done
echo "   unrelated listener on 127.0.0.1:18443 (pid $listener_p), connections so far: $(cat "$d2/hits" 2>/dev/null)"
before_c=$(docker ps -aq --filter label=w3.owner | sort | tr '\n' ' ')
real_case D2 "an unrelated listener already on 18443"
after_c=$(docker ps -aq --filter label=w3.owner | sort | tr '\n' ' ')
chk "D2 fails" "$([ "$CASE_RC" != 0 ] && echo 0 || echo 1)" "exit $CASE_RC"
chk "D2 fails at the port preflight" "$(yes0 grep -q 'FAILED at port preflight' "$CASE_DIR/out.log")"
chk "D2 starts no container" "$([ "$before_c" = "$after_c" ] && echo 0 || echo 1)"
chk "D2 never authorizes and never starts the browser work" "$(no0 grep -qE 'AUTHORIZED|-- the rehearsal' "$CASE_DIR/out.log")"
chk "D2 the unrelated listener received no connection" "$([ "$(cat "$d2/hits")" = 0 ] && echo 0 || echo 1)" "$(cat "$d2/hits") connection(s)"
chk "D2 the unrelated listener is still running" "$(yes0 kill -0 "$listener_p")"
kill "$listener_p" 2>/dev/null; wait "$listener_p" 2>/dev/null; listener_p=""
after_run D2

CASE_IMG=$NODE_IMG real_case D3 "a container that never becomes ready (an image that exits at once)"
chk "D3 fails at readiness" "$([ "$CASE_RC" != 0 ] && grep -q 'FAILED at readiness' "$CASE_DIR/out.log" && echo 0 || echo 1)"
chk "D3 never authorizes and never starts the browser work" "$(no0 grep -qE 'AUTHORIZED|-- the rehearsal' "$CASE_DIR/out.log")"
after_run D3

real_case D4 "the service reports an unexpected revision" W3_EXPECTED_REVISION=0000000000000000000000000000000000000000
chk "D4 fails at the revision check" "$([ "$CASE_RC" != 0 ] && grep -q 'FAILED at revision' "$CASE_DIR/out.log" && echo 0 || echo 1)"
chk "D4 never authorizes and never starts the browser work" "$(no0 grep -qE 'AUTHORIZED|-- the rehearsal' "$CASE_DIR/out.log")"
after_run D4

d5="$WORK/D5-$TAG"; mkdir -p "$d5"
bash "$HARNESS" "$IMG" "$d5/run" > "$d5/out.log" 2>&1 &
hp=$!
for _ in $(seq 1 240); do grep -q -- '-- the rehearsal' "$d5/out.log" && break; kill -0 "$hp" 2>/dev/null || break; sleep 0.5; done
sleep 6
r5=$(run_id_of "$d5/out.log"); owned_mid=$(owned_left "$r5")
kill -TERM "$hp" 2>/dev/null
wait "$hp"; CASE_RC=$?; CASE_DIR=$d5; CASE_RUN=$r5
echo "-- D5: SIGTERM during the browser work (exit $CASE_RC, run ${CASE_RUN:-?}; owned processes just before: $owned_mid)"
sed 's/^/     | /' "$d5/out.log"
chk "D5 was interrupted during the browser work (owned processes were running)" "$([ "$owned_mid" -gt 0 ] && echo 0 || echo 1)" "$owned_mid"
chk "D5 exits 143 and reports the interruption" "$([ "$CASE_RC" = 143 ] && grep -q 'interrupted (SIGTERM)' "$d5/out.log" && echo 0 || echo 1)" "exit $CASE_RC"
chk "D5 keeps the work directory and its logs" "$([ -d "$d5/run" ] && ls "$d5/run"/w3-*.log >/dev/null 2>&1 && echo 0 || echo 1)"
after_run D5

CASE_ARGS="--control stale-host" real_case D6 "the stale-host control: the host's page frozen before R5"
fails6=$(grep -c '^   FAIL ' "$CASE_DIR/out.log")
chk "D6 the run reports FAILED" "$([ "$CASE_RC" != 0 ] && grep -q '^W3 REHEARSAL HARNESS FAILED' "$CASE_DIR/out.log" && echo 0 || echo 1)" "exit $CASE_RC"
chk "D6 exactly one check failed" "$([ "$fails6" = 1 ] && echo 0 || echo 1)" "$fails6 failed"
chk "D6 the failed check is the host's rendered R5 check" "$(yes0 grep -q "^   FAIL R5 the host's screen (rendered)" "$CASE_DIR/out.log")"
chk "D6 the TV's rendered R5 check passed" "$(yes0 grep -q "^   PASS R5 the TV's screen (rendered)" "$CASE_DIR/out.log")"
chk "D6 the guest's rendered R5 check passed" "$(yes0 grep -q "^   PASS R5 the guest's screen (rendered)" "$CASE_DIR/out.log")"
chk "D6 the server-record checks passed (the frozen host's API answers still arrived)" "$([ "$(grep -c '^   PASS R5 .*(server record, API)' "$CASE_DIR/out.log")" = 2 ] && echo 0 || echo 1)"
chk "D6 the driver names the control's failed check" "$(yes0 grep -q "CONTROL stale-host: failed checks: R5 the host's screen (rendered)" "$CASE_DIR/out.log")"
after_run D6

end_selftest
echo "-- $passn passed, $failn failed"
[ "$failn" = 0 ] && { echo "W3 HARNESS SELFTEST PASSED"; exit 0; }
echo "W3 HARNESS SELFTEST FAILED"; exit 1
