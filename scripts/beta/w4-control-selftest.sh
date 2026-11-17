#!/bin/bash
# Beta R4 W4 (review 6935165862): fault-injection tests of the W4 restart and probe actions. They SOURCE
# scripts/beta/w4-control.sh, the very file the harness sources, and run its serve_request against a MOCK docker (and a
# mock curl) on PATH: no container, volume or network is touched. Each case starts from fresh mock state holding the
# run's container (old-1, label w4.owner=mockrun, on the run's data volume) and a SENTINEL container and volume of
# another owner, which must survive every case untouched.
#   bash scripts/beta/w4-control-selftest.sh
# The failures the review named, each of which must FAIL CLOSED:
#   stop    the CLI fails; a forced exit (137); an OOM kill; the state cannot be read back; still running after stop
#   start   a container that is not stopped (never started); no new StartedAt
#   fresh   each of those stop failures, a failed removal, an unconfirmed removal (still present), an old container that
#           is not this run's, another container still on the data volume: NO replacement is ever started (no
#           `docker run`), and no removal happens after a failed stop
#   guard   a guard that never exits (bounded by its deadline), a server that starts, an exit other than 78, a 78 without
#           a REFUSED line, a failed teardown: each fails; the probe never mounts the data volume; its own container
#           and fixture volume are removed (label read back first)
# Review 6935889459:
#   start   the start time cannot be read, or reads empty, BEFORE the start (docker start is then never called) or
#           AFTER it: each fails closed
#   finish  the harness's exit verdict: the containers' or the volumes' inventory cannot be listed (docker exits 124
#           with no output): each makes that inventory UNVERIFIED and the run FAIL (exit nonzero); a container of the run
#           left behind fails it; an empty inventory (the control) passes
# plus the passing cases (a graceful stop, a recorded start, a clean fresh replacement, a refusing guard).
# W4_CONTROL_FILE (default scripts/beta/w4-control.sh) exists only for w4-selftest.sh's meta-control, which points these
# tests at a deliberately weakened copy (the two defects review 6935165862 reproduced) and requires them to FAIL.
# Exit: 0 "W4 CONTROL SELFTEST PASSED", 1 "W4 CONTROL SELFTEST FAILED".
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
CONTROL=${W4_CONTROL_FILE:-$ROOT/scripts/beta/w4-control.sh}
passn=0; failn=0
chk() { if [ "$2" = 0 ]; then echo "PASS $1"; passn=$((passn + 1)); else echo "FAIL $1${3:+ — $3}"; failn=$((failn + 1)); fi; }

# ---------------------------------------------------------------- the mock docker and curl
mkdir -p "$WORK/bin"
cat > "$WORK/bin/docker" <<'MOCK'
#!/bin/bash
# Mock docker: containers are files in $MOCK_DIR/c/<id> (lines: label, volume, state, exit code, oom, startedAt, name),
# volumes are files in $MOCK_DIR/v/<name> (the label). Every call is appended to $MOCK_DIR/calls.log.
M=$MOCK_DIR; echo "$*" >> "$M/calls.log"
get() { sed -n "$2p" "$M/c/$1"; }
set_line() { sed -i "$2s|.*|$3|" "$M/c/$1"; }
newid() { local n; n=$(( $(cat "$M/seq" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$M/seq"; echo "$1-$n"; }
make_c() {   # <id> <args...>: parse --label, -v and --name
  local id=$1 label="" vol="" name=""; shift
  while [ $# -gt 0 ]; do case "$1" in --label) label=${2#*=}; shift 2 ;; -v) vol=${2%%:*}; shift 2 ;; --name) name=$2; shift 2 ;; *) shift ;; esac; done
  printf '%s\n%s\nrunning\n0\nfalse\nT0\n%s\n' "$label" "$vol" "$name" > "$M/c/$id"
}
case "$1" in
  inspect) shift; fmt=""; [ "$1" = -f ] && { fmt=$2; shift 2; }; id=$1
    [ -f "$M/c/$id" ] || { echo "Error: No such object: $id" >&2; exit 1; }
    case "$fmt" in
      *w4.owner*) get "$id" 1 ;;
      *'.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled'*)
        [ "$(get "$id" 3)" = stopped ] && [ -n "${MOCK_INSPECT_FAIL_AFTER_STOP:-}" ] && exit 1
        if [ "$(get "$id" 3)" = stopped ]; then echo "${MOCK_STOP_STATE:-exited 0 false false}"; else echo "running 0 false true"; fi ;;
      *'.State.Status}} {{.State.Running'*) if [ "$(get "$id" 3)" = stopped ]; then echo "${MOCK_BEFORE_START:-exited false}"; else echo "running true"; fi ;;
      *StartedAt*) if [ "$(get "$id" 3)" = stopped ]; then k=${MOCK_SA_BEFORE:-}; else k=${MOCK_SA_AFTER:-}; fi
        case "$k" in fail) exit 1 ;; empty) echo ""; exit 0 ;; esac; get "$id" 6 ;;
      *'.State.Running'*) [ "$(get "$id" 3)" = running ] && echo true || echo false ;;
      *Mounts*) echo "$(get "$id" 2) " ;;
      *) echo "{}" ;;
    esac ;;
  stop) id=${*: -1}; [ "${MOCK_STOP_RC:-0}" = 0 ] && set_line "$id" 3 stopped; exit "${MOCK_STOP_RC:-0}" ;;
  start) id=$2; set_line "$id" 3 running; [ -n "${MOCK_START_SAME:-}" ] || set_line "$id" 6 "T$(date +%s%N)"; exit 0 ;;
  rm) id=${*: -1}
    case "$id" in ${MOCK_RM_FAIL:-__none__}*) exit 1 ;; esac
    case "$id" in ${MOCK_RM_KEEP:-__none__}*) exit 0 ;; esac
    rm -f "$M/c/$id"; exit 0 ;;
  ps) [ -n "${MOCK_PS_RC:-}" ] && exit "$MOCK_PS_RC"
    shift; f=""; while [ $# -gt 0 ]; do [ "$1" = --filter ] && f=$2; shift; done
    for c in "$M"/c/*; do [ -f "$c" ] || continue; id=${c##*/}
      case "$f" in
        id=*) [ "$id" = "${f#id=}" ] && echo "$id" ;;
        volume=*) [ "$(get "$id" 2)" = "${f#volume=}" ] && echo "$id" ;;
        label=*) [ "w4.owner=$(get "$id" 1)" = "${f#label=}" ] && echo "$id" ;;
        name=*) n=${f#name=^}; n=${n%\$}; [ "$(get "$id" 7)" = "$n" ] && echo "$id" ;;
      esac
    done
    case "$f" in volume=*) [ -n "${MOCK_VOL_EXTRA:-}" ] && echo "$MOCK_VOL_EXTRA" ;; esac
    exit 0 ;;
  run) shift; id=$(newid new); make_c "$id" "$@"; echo "$id" ;;
  create) shift; id=$(newid guard); make_c "$id" "$@"; set_line "$id" 3 created; echo "$id" ;;
  cp) if [ "${*: -1}" = - ]; then echo "mock-tar-of-the-record"; else cat > /dev/null; fi; exit 0 ;;
  wait) case "${MOCK_WAIT:-78}" in hang) sleep 3600 ;; *) echo "${MOCK_WAIT:-78}" ;; esac ;;
  logs) [ -n "${MOCK_LISTEN:-}" ] && echo "Listening on every interface; public origin https://other.invalid."
    echo "${MOCK_LOGS-cgn-entrypoint: REFUSED: MCHEZO_PUBLIC_ORIGIN is not the authorized origin}" ;;
  exec) echo "Another server (pid 23) is using this data directory (/var/data/cgn-w1)."; exit 2 ;;
  volume) case "$2" in
      create) v=${*: -1}; l=""; [ "$3" = --label ] && l=${4#*=}; echo "$l" > "$M/v/$v"; echo "$v" ;;
      inspect) v=${*: -1}; [ -f "$M/v/$v" ] && cat "$M/v/$v" || exit 1 ;;
      rm) v=${*: -1}; rm -f "$M/v/$v" ;;
      ls) [ -n "${MOCK_VOLLS_RC:-}" ] && exit "$MOCK_VOLLS_RC"
        f=${*: -1}
        case "$f" in
          name=*) n=${f#name=^}; n=${n%\$}; [ -f "$M/v/$n" ] && echo "$n" ;;
          label=*) for v in "$M"/v/*; do [ -f "$v" ] || continue; [ "w4.owner=$(cat "$v")" = "$f" ] && echo "${v##*/}"; done ;;
        esac; exit 0 ;;
    esac ;;
  *) exit 0 ;;
esac
MOCK
cat > "$WORK/bin/curl" <<MOCK
#!/bin/bash
# Mock curl: the pinned /health answer, written where -o says (as curl does), else to stdout.
out=/dev/stdout; while [ \$# -gt 0 ]; do [ "\$1" = -o ] && { out=\$2; shift; }; shift; done
echo '{"ok":true,"revision":"$PIN"}' > "\$out"
MOCK
chmod +x "$WORK/bin/docker" "$WORK/bin/curl"

# ---------------------------------------------------------------- one case
# case <name> <action> [VAR=value ...]: fresh mock state, then one request through the sourced serve_request.
run_case() {
  local name=$1 action=$2; shift 2
  CASE="$WORK/$name"; mkdir -p "$CASE/c" "$CASE/v" "$CASE/priv/ctl"; : > "$CASE/calls.log"
  printf 'mockrun\nw4-data-mockrun-a\nrunning\n0\nfalse\nT0\nw4-svc-mockrun-1\n' > "$CASE/c/old-1"
  printf 'someone-else\nsentinel-vol\nrunning\n0\nfalse\nT0\nw4-svc\n' > "$CASE/c/sentinel-1"
  echo mockrun > "$CASE/v/w4-data-mockrun-a"; echo someone-else > "$CASE/v/sentinel-vol"
  echo "MCHEZO_BETA_ACCESS_CODE=mock" > "$CASE/priv/code.env"
  [ "$name" = "fresh-not-ours" ] && sed -i '1s/.*/someone-else/' "$CASE/c/old-1"
  [ "${PRESET:-}" = stopped ] && sed -i '3s/.*/stopped/' "$CASE/c/old-1"
  echo "1 $action" > "$CASE/priv/ctl/req"
  local t0; t0=$(date +%s%3N)
  env "$@" PATH="$WORK/bin:$PATH" MOCK_DIR="$CASE" bash -c '
    RUNID=mockrun IMG=mock-image BACK=1 ORIGIN=https://localhost:18443 VOL=w4-data-mockrun-a PRIV="$1" EXPECT='"$PIN"'
    cid=old-1 nseq=1 volumes=" w4-data-mockrun-a"
    W4_GUARD_SECONDS=${W4_GUARD_SECONDS:-2}
    . "$2"
    serve_request' _ "$CASE/priv" "$CONTROL" > "$CASE/out.log" 2>&1
  CASE_MS=$(( $(date +%s%3N) - t0 ))
  ANS=$(cat "$CASE/priv/ctl/done-1" 2>/dev/null || echo '{}')
  echo "-- $name ($action; ${*:-no faults}) ${CASE_MS} ms"
  sed 's/^/     | /' "$CASE/out.log"
  echo "     | answer: $(printf '%s' "$ANS" | cut -c1-260)"
}
field() { printf '%s' "$ANS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s)'"$1"';process.stdout.write(String(v))})' 2>/dev/null; }
calls() { grep -cE "$1" "$CASE/calls.log"; }
sentinel_ok() {
  chk "$1 the sentinel container and volume survive, untouched" "$([ -f "$CASE/c/sentinel-1" ] && [ -f "$CASE/v/sentinel-vol" ] && [ "$(grep -cE 'sentinel' "$CASE/calls.log")" = 0 ] && echo 0 || echo 1)"
}
fails_closed() {   # <name>: ok false, no replacement started
  chk "$1 fails closed (ok false: $(field .why | cut -c1-90))" "$([ "$(field .ok)" = false ] && echo 0 || echo 1)"
  chk "$1 starts no replacement (no docker run)" "$([ "$(calls '^run ')" = 0 ] && echo 0 || echo 1)"
  sentinel_ok "$1"
}

echo "== w4-control-selftest $(date -u +%FT%TZ), control file ${CONTROL#"$ROOT"/} $(sha256sum "$CONTROL" | cut -c1-16)"
# ---- stop
run_case stop-ok stop
chk "stop-ok a graceful stop is reported (ok, graceful)" "$([ "$(field .ok)" = true ] && [ "$(field .graceful)" = true ] && echo 0 || echo 1)"; sentinel_ok stop-ok
run_case stop-cli-fails stop MOCK_STOP_RC=1;                              fails_closed stop-cli-fails
run_case stop-forced stop "MOCK_STOP_STATE=exited 137 false false";       fails_closed stop-forced
run_case stop-oom stop "MOCK_STOP_STATE=exited 0 true false";             fails_closed stop-oom
run_case stop-inspect-fails stop MOCK_INSPECT_FAIL_AFTER_STOP=1;          fails_closed stop-inspect-fails
run_case stop-still-running stop "MOCK_STOP_STATE=running 0 false true";  fails_closed stop-still-running
# ---- start (the run's container already stopped, unless the case says otherwise)
PRESET=stopped run_case start-ok start
chk "start-ok a stopped container starts with a new StartedAt (ok, restarted)" "$([ "$(field .ok)" = true ] && [ "$(field .restarted)" = true ] && [ "$(calls '^start ')" = 1 ] && echo 0 || echo 1)"; sentinel_ok start-ok
run_case start-not-stopped start
chk "start-not-stopped fails closed, and never calls docker start" "$([ "$(field .ok)" = false ] && [ "$(calls '^start ')" = 0 ] && echo 0 || echo 1)"; sentinel_ok start-not-stopped
PRESET=stopped run_case start-same-startedat start MOCK_START_SAME=1
chk "start-same-startedat fails closed: no new start recorded" "$([ "$(field .ok)" = false ] && echo 0 || echo 1)"; sentinel_ok start-same-startedat
for b in unreadable:fail empty:empty; do
  PRESET=stopped run_case "start-before-${b%%:*}" start "MOCK_SA_BEFORE=${b#*:}"
  chk "start-before-${b%%:*} fails closed, and never calls docker start (no readable baseline)" "$([ "$(field .ok)" = false ] && [ "$(calls '^start ')" = 0 ] && echo 0 || echo 1)" "$(field .why | cut -c1-80)"; sentinel_ok "start-before-${b%%:*}"
  PRESET=stopped run_case "start-after-${b%%:*}" start "MOCK_SA_AFTER=${b#*:}"
  chk "start-after-${b%%:*} fails closed (the start time after the start is not readable)" "$([ "$(field .ok)" = false ] && echo 0 || echo 1)" "$(field .why | cut -c1-80)"; sentinel_ok "start-after-${b%%:*}"
done
# ---- fresh
run_case fresh-ok fresh
chk "fresh-ok replaces the container: graceful, removed, volume free, exactly one docker run after the removal" "$([ "$(field .ok)" = true ] && [ "$(field .graceful)" = true ] && [ "$(field .oldRemoved)" = true ] && [ "$(field .volumeFree)" = true ] && [ "$(calls '^run ')" = 1 ] && [ "$(grep -nE '^(rm|run) ' "$CASE/calls.log" | cut -d: -f2 | cut -c1-3 | tr '\n' ' ')" = "rm  run " ] && echo 0 || echo 1)"; sentinel_ok fresh-ok
no_rm() { chk "$1 removes nothing after the failed stop (no docker rm; the old container left to the run's cleanup)" "$([ "$(calls '^rm ')" = 0 ] && [ -f "$CASE/c/old-1" ] && echo 0 || echo 1)"; }
run_case fresh-stop-cli-fails fresh MOCK_STOP_RC=1;                       fails_closed fresh-stop-cli-fails; no_rm fresh-stop-cli-fails
run_case fresh-forced fresh "MOCK_STOP_STATE=exited 137 false false";     fails_closed fresh-forced; no_rm fresh-forced
run_case fresh-inspect-fails fresh MOCK_INSPECT_FAIL_AFTER_STOP=1;        fails_closed fresh-inspect-fails; no_rm fresh-inspect-fails
run_case fresh-removal-fails fresh MOCK_RM_FAIL=old;            fails_closed fresh-removal-fails
run_case fresh-removal-unconfirmed fresh MOCK_RM_KEEP=old;      fails_closed fresh-removal-unconfirmed
run_case fresh-not-ours fresh;                                  fails_closed fresh-not-ours
chk "fresh-not-ours never removes a container whose label is not this run's" "$([ "$(calls '^rm ')" = 0 ] && [ -f "$CASE/c/old-1" ] && echo 0 || echo 1)"
run_case fresh-volume-in-use fresh MOCK_VOL_EXTRA=zombie-writer; fails_closed fresh-volume-in-use
# ---- guard
guard_common() {   # <name>
  chk "$1 the probe never mounts the data volume (create mounts only its fixture volume)" "$(grep -E '^create ' "$CASE/calls.log" | grep -q 'w4-data-mockrun-a:' && echo 1 || echo 0)"
  chk "$1 its container and fixture volume are removed (labels read back first) and confirmed gone" "$([ -z "$(ls "$CASE/c" | grep guard)" ] && [ -z "$(ls "$CASE/v" | grep guard)" ] && [ "$(field .dataVolume.onlyTheWriterBefore)" = true ] && [ "$(field .dataVolume.onlyTheWriterAfter)" = true ] && echo 0 || echo 1)"
  sentinel_ok "$1"
}
run_case guard-refuses guard-probe
chk "guard-refuses ok: exit 78 with REFUSED, no server started" "$([ "$(field .ok)" = true ] && [ "$(field .exit)" = 78 ] && [ "$(field .serverStarted)" = false ] && echo 0 || echo 1)"; guard_common guard-refuses
run_case guard-hangs guard-probe MOCK_WAIT=hang W4_GUARD_SECONDS=2
chk "guard-hangs fails at its deadline (ok false, exit null) and the request ends within 2 s + 3 s" "$([ "$(field .ok)" = false ] && [ "$(field .exit)" = null ] && [ "$CASE_MS" -lt 5000 ] && echo 0 || echo 1)" "${CASE_MS} ms"; guard_common guard-hangs
run_case guard-serves guard-probe MOCK_WAIT=hang MOCK_LISTEN=1 W4_GUARD_SECONDS=2
chk "guard-serves fails: a server started (serverStarted true)" "$([ "$(field .ok)" = false ] && [ "$(field .serverStarted)" = true ] && echo 0 || echo 1)"; guard_common guard-serves
run_case guard-exit-0 guard-probe MOCK_WAIT=0
chk "guard-exit-0 fails: exit 0 is not 78" "$([ "$(field .ok)" = false ] && echo 0 || echo 1)"; guard_common guard-exit-0
run_case guard-78-no-refused guard-probe MOCK_LOGS=
chk "guard-78-no-refused fails: exit 78 without a REFUSED line" "$([ "$(field .ok)" = false ] && echo 0 || echo 1)"; guard_common guard-78-no-refused
run_case guard-teardown-fails guard-probe MOCK_RM_FAIL=guard
chk "guard-teardown-fails fails: the probe's container could not be removed" "$([ "$(field .ok)" = false ] && echo 0 || echo 1)"; sentinel_ok guard-teardown-fails

# ---- finish: the harness's exit verdict (the very finish and cleanup the harness traps on EXIT)
run_finish() {   # <name> [VAR=value ...]
  local name=$1; shift
  CASE="$WORK/$name"; mkdir -p "$CASE/c" "$CASE/v" "$CASE/wk/evidence"; : > "$CASE/calls.log"
  printf 'mockrun\nw4-data-mockrun-a\nstopped\n0\nfalse\nT0\nw4-svc-mockrun-1\n' > "$CASE/c/old-1"
  printf 'someone-else\nsentinel-vol\nrunning\n0\nfalse\nT0\nw4-svc\n' > "$CASE/c/sentinel-1"
  echo mockrun > "$CASE/v/w4-data-mockrun-a"; echo someone-else > "$CASE/v/sentinel-vol"
  : > "$CASE/wk/run.log"; : > "$CASE/wk/proxy.log"
  env "$@" PATH="$WORK/bin:$PATH" MOCK_DIR="$CASE" bash -c '
    RUNID=mockrun HTTPS=1 HTTPP=2 BACK=3 cid=old-1 volumes=" w4-data-mockrun-a" driver_pid="" proxy_pid="" PRIV="" privpath="" CODE="" started=1 rc=0 cleanups=0 finished=0
    LOG="$1/run.log" PLOG="$1/proxy.log" EVD="$1/evidence"
    . "$2"
    true; finish' _ "$CASE/wk" "$CONTROL" > "$CASE/out.log" 2>&1
  CASE_RC=$?
  echo "-- $name (finish; ${*:-no faults}) exit $CASE_RC"
  sed 's/^/     | /' "$CASE/out.log"
}
inv() { grep -o "this run's containers left: [^;]*; volumes left: [^;]*" "$CASE/out.log"; }
run_finish finish-empty
chk "finish-empty (the control) PASSES, exit 0, with an inventory of 0 and 0" "$([ "$CASE_RC" = 0 ] && grep -q '^W4 REHEARSAL HARNESS PASSED' "$CASE/out.log" && [ "$(inv)" = "this run's containers left: 0; volumes left: 0" ] && echo 0 || echo 1)" "$(inv)"; sentinel_ok finish-empty
run_finish finish-containers-unlistable MOCK_PS_RC=124
chk "finish-containers-unlistable reports the containers as UNVERIFIED (never 0) and FAILS, exit nonzero" "$([ "$CASE_RC" != 0 ] && grep -q '^W4 REHEARSAL HARNESS FAILED' "$CASE/out.log" && inv | grep -q "containers left: UNVERIFIED" && echo 0 || echo 1)" "exit $CASE_RC; $(inv)"; sentinel_ok finish-containers-unlistable
run_finish finish-volumes-unlistable MOCK_VOLLS_RC=124
chk "finish-volumes-unlistable reports the volumes as UNVERIFIED (never 0) and FAILS, exit nonzero" "$([ "$CASE_RC" != 0 ] && grep -q '^W4 REHEARSAL HARNESS FAILED' "$CASE/out.log" && inv | grep -q "volumes left: UNVERIFIED" && inv | grep -q "containers left: 0;" && echo 0 || echo 1)" "exit $CASE_RC; $(inv)"; sentinel_ok finish-volumes-unlistable
run_finish finish-container-left MOCK_RM_FAIL=old
chk "finish-container-left: a container of the run that could not be removed is counted (1) and FAILS the run" "$([ "$CASE_RC" != 0 ] && inv | grep -q "containers left: 1;" && echo 0 || echo 1)" "exit $CASE_RC; $(inv)"; sentinel_ok finish-container-left

echo "-- $passn passed, $failn failed"
[ "$failn" = 0 ] && { echo "W4 CONTROL SELFTEST PASSED"; exit 0; }
echo "W4 CONTROL SELFTEST FAILED"; exit 1
