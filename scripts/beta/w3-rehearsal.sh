#!/bin/bash
# Beta R4 W3 (handoff 6929226094; isolation repair, review 6930033578): the LOCAL W3 reconnect rehearsal, bounded and
# self-cleaning. It runs the packaged pinned image (from deploy/render) in production mode with a THROWAWAY data folder
# and a throwaway access code, behind scripts/beta/render-like-proxy.mjs (TLS for localhost, appended X-Forwarded-For),
# then scripts/beta/w3-rehearsal.mjs (Chromium pages: a host, one guest and a TV in one Casual Trivia round; the guest's
# network interrupted by the test). No hosting account, no public forwarding.
#
# Isolation (review 6930033578):
# - Every run has its own id. Its one container gets a unique name (w3-svc-<run id>) and the label w3.owner=<run id>;
#   cleanup removes only the container ID this run's own `docker run` returned (or, after a failed `docker run`, one
#   carrying this run's label), and only after reading that label back. Nothing is deleted in advance.
# - Before anything starts, ports 18443/18480/18080 must be free; otherwise the run fails without starting anything.
# - Each startup step must succeed before the next: the image, `docker run`, readiness (/health, the container still
#   running), the pinned revision reported by /health, cgn-authorize, the proxy listening, the expected listeners. A
#   failure stops the run before authorization or any browser work.
# - The processes it starts (the proxy, the driver and the driver's browsers) carry W3_OWNER=<run id> in their
#   environment; cleanup stops only those, and counts only those as left over.
# - The throwaway code, its env file and the TLS key live in a private mktemp directory (mode 700), removed on exit. The
#   work directory, its per-run logs (w3-<run id>.log, proxy-<run id>.log) and the redacted evidence are kept.
# - Cleanup runs on success, failure and interruption (INT, TERM), and is idempotent: after it, a second pass finds
#   nothing owned left to remove. Then it checks that nothing of this run is left, and that no log or evidence file
#   holds the access code or a beta cookie.
#
#   bash scripts/beta/w3-rehearsal.sh <image tag> [work dir] [extra w3-rehearsal.mjs options]
#
# Needs: docker, node 22 with this repository's node_modules (playwright, ws), openssl, curl. Ports 18080, 18443, 18480.
# W3_EXPECTED_REVISION (default: the release pin 7097ac2…) exists for scripts/beta/w3-harness-selftest.sh's
# revision-mismatch control; any other value makes a correct image fail before authorization.
# Exit: 0 "W3 REHEARSAL HARNESS PASSED"; otherwise "W3 REHEARSAL HARNESS FAILED" with 1, or 130/143 when interrupted.
set -uo pipefail
IMG=${1:-}
[ -n "$IMG" ] || { echo "usage: bash scripts/beta/w3-rehearsal.sh <image tag> [work dir] [driver options]" >&2; exit 2; }
shift; WK_ARG=${1:-}; [ $# -gt 0 ] && shift
PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
EXPECT=${W3_EXPECTED_REVISION:-$PIN}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HTTPS=18443; HTTPP=18480; BACK=18080; ORIGIN="https://localhost:$HTTPS"
RUNID=$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
NAME="w3-svc-$RUNID"
if [ -n "$WK_ARG" ]; then mkdir -p "$WK_ARG" || exit 1; WK=$(cd "$WK_ARG" && pwd); else WK=$(mktemp -d); fi
LOG="$WK/w3-$RUNID.log"; PLOG="$WK/proxy-$RUNID.log"; EVD="$WK/evidence"
cid=""; proxy_pid=""; driver_pid=""; PRIV=""; privpath=""; CODE=""; started=0; rc=1; stage="setup"; cleanups=0; finished=0

# Listening sockets on the harness's ports, read from /proc (no ss/netstat dependency: either may be missing).
listeners() {
  awk -v want=" $HTTPS $HTTPP $BACK " 'FNR > 1 && $4 == "0A" { n = split($2, a, ":"); p = 0; h = toupper(a[n]);
    for (i = 1; i <= length(h); i++) p = p * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1;
    if (index(want, " " p " ")) c++ } END { print c + 0 }' $(ls /proc/net/tcp /proc/net/tcp6 2>/dev/null)
}
# Processes this run started (and their children): they carry W3_OWNER=<run id> in their environment.
owned_pids() {
  local f p
  for f in /proc/[0-9]*/environ; do
    p=${f#/proc/}; p=${p%/environ}
    [ "$p" = "$$" ] && continue
    grep -qsaF "W3_OWNER=$RUNID" "$f" 2>/dev/null && echo "$p"
  done
}
stop_pid() {   # TERM, up to 5 s, then KILL; only the given pid
  local p=$1
  kill -0 "$p" 2>/dev/null || return 0
  kill -TERM "$p" 2>/dev/null
  for _ in $(seq 1 25); do kill -0 "$p" 2>/dev/null || return 0; sleep 0.2; done
  kill -KILL "$p" 2>/dev/null
}
fail() { echo "   FAILED at $stage: $*"; rc=1; exit 1; }

cleanup() {
  cleanups=$((cleanups + 1))
  local did="" left p label
  if [ -n "$driver_pid" ]; then stop_pid "$driver_pid"; wait "$driver_pid" 2>/dev/null; driver_pid=""; did="$did driver"; fi
  if [ -n "$proxy_pid" ]; then stop_pid "$proxy_pid"; wait "$proxy_pid" 2>/dev/null; proxy_pid=""; did="$did proxy"; fi
  left=$(owned_pids)
  if [ -n "$left" ]; then for p in $left; do stop_pid "$p"; done; did="$did $(echo $left | wc -w)-more-owned-process(es)"; fi
  if [ -n "$cid" ]; then
    label=$(docker inspect -f '{{index .Config.Labels "w3.owner"}}' "$cid" 2>/dev/null)
    if [ "$label" = "$RUNID" ]; then
      docker rm -f -v "$cid" >/dev/null 2>&1 && did="$did container ${cid:0:12}" || did="$did container ${cid:0:12} (REMOVAL FAILED)"
    else
      did="$did container ${cid:0:12} not removed (its label is '${label:-unreadable}', not this run's)"
    fi
    cid=""
  fi
  if [ -n "$PRIV" ] && [ -d "$PRIV" ]; then rm -rf -- "$PRIV"; did="$did private-files"; fi
  PRIV=""
  echo "   cleanup #$cleanups:${did:- nothing owned left to remove}"
}
finish() {
  local code=$? left_c left_p left_l leak=0 cookie=0 privleft
  [ "$finished" = 1 ] && return
  finished=1
  trap - INT TERM
  echo "-- cleanup (run $RUNID)"
  cleanup
  cleanup   # a second pass must find nothing: repeated cleanup is safe
  left_c=$(docker ps -aq --filter "label=w3.owner=$RUNID" 2>/dev/null | wc -l)
  left_p=$(owned_pids | wc -w)
  if [ "$started" = 1 ]; then left_l=$(listeners); else left_l="not checked (this run started no listener)"; fi
  privleft=no; [ -n "$privpath" ] && [ -e "$privpath" ] && privleft=yes
  echo "   this run's containers left: $left_c; this run's processes left: $left_p; listeners left on $HTTPS/$HTTPP/$BACK: $left_l; private files left: $privleft"
  if [ -n "$CODE" ]; then leak=$(grep -rlF -f <(printf '%s\n' "$CODE") "$LOG" "$PLOG" "$EVD" 2>/dev/null | wc -l); fi
  cookie=$(grep -rlE 'cgn_beta=[A-Za-z0-9_-]{8}' "$LOG" "$EVD" 2>/dev/null | wc -l)
  echo "   files holding the access code: $leak; files holding a beta cookie value: $cookie"
  if [ "$code" = 0 ] && [ "$rc" = 0 ] && [ "$left_c" = 0 ] && [ "$left_p" = 0 ] && [ "$left_l" = 0 ] && [ "$privleft" = no ] && [ "$leak" = 0 ] && [ "$cookie" = 0 ]; then
    echo "W3 REHEARSAL HARNESS PASSED"; exit 0
  fi
  echo "W3 REHEARSAL HARNESS FAILED"
  if [ "$code" -gt 1 ]; then exit "$code"; fi
  exit 1
}
trap finish EXIT
trap 'echo "   interrupted (SIGINT)"; rc=130; exit 130' INT
trap 'echo "   interrupted (SIGTERM)"; rc=143; exit 143' TERM

echo "== w3-rehearsal $(date -u +%FT%TZ), run $RUNID, container name $NAME, image $IMG, driver $(sha256sum "$ROOT/scripts/beta/w3-rehearsal.mjs" | cut -c1-16), proxy $(sha256sum "$ROOT/scripts/beta/render-like-proxy.mjs" | cut -c1-16)"
stage="image"
imgid=$(docker image inspect --format '{{.Id}}' "$IMG" 2>/dev/null) || fail "the image '$IMG' is not available locally"
echo "   image id: ${imgid:0:19}"

stage="port preflight"
busy=$(listeners)
[ "$busy" = 0 ] || fail "$busy listener(s) already on $HTTPS/$HTTPP/$BACK (another run or an unrelated service); nothing was started"
echo "   ports $HTTPS/$HTTPP/$BACK free"

stage="private files"
PRIV=$(mktemp -d "${TMPDIR:-/tmp}/w3-private.XXXXXXXX") || fail "could not create a private directory"
privpath=$PRIV; chmod 700 "$PRIV" || fail "could not protect the private directory"
( umask 077; od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$PRIV/code" && printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$(cat "$PRIV/code")" > "$PRIV/code.env" ) || fail "could not write the throwaway code"
CODE=$(cat "$PRIV/code")
( umask 077; openssl req -x509 -newkey rsa:2048 -nodes -keyout "$PRIV/key.pem" -out "$PRIV/cert.pem" -days 1 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" >/dev/null 2>&1 ) || fail "could not make the local TLS certificate"
echo "   throwaway code, env file and TLS key in a private directory (mode 700), removed on exit"

stage="container"
if ! cid=$(docker run -d --name "$NAME" --label "w3.owner=$RUNID" -p "127.0.0.1:$BACK:10000" -e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e "MCHEZO_PUBLIC_ORIGIN=$ORIGIN" -e MCHEZO_TRUST_PROXY=1 --env-file "$PRIV/code.env" "$IMG" 2>"$PRIV/docker-run.err"); then
  cid=$(docker ps -aq --no-trunc --filter "label=w3.owner=$RUNID" 2>/dev/null | head -1)   # a container created before the failure is still this run's
  fail "docker run failed: $(head -c 300 "$PRIV/docker-run.err" | tr '\n' ' ')"
fi
started=1
echo "   container ${cid:0:12} (name $NAME, label w3.owner=$RUNID)"
[ "$(docker inspect -f '{{index .Config.Labels "w3.owner"}}' "$cid" 2>/dev/null)" = "$RUNID" ] || fail "the new container does not carry this run's label"

stage="readiness"
ready=""
for _ in $(seq 1 80); do
  [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" = true ] || break
  curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:$BACK/health" && { ready=1; break; }
  sleep 0.25
done
[ -n "$ready" ] || fail "the container never became ready on /health (state: $(docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' "$cid" 2>/dev/null))"
health=$(curl -sf --max-time 5 "http://127.0.0.1:$BACK/health") || fail "/health stopped answering"
echo "   /health: $(printf '%s' "$health" | head -c 160)"

stage="revision"
rev=$(printf '%s' "$health" | grep -o '"revision":"[0-9a-f]*"' | head -1 | cut -d'"' -f4)
[ "$rev" = "$EXPECT" ] || fail "the service reports revision '${rev:-none}', not the expected $EXPECT"
echo "   revision $rev is the expected one"

stage="authorization"
auth=$(docker exec -i "$cid" cgn-authorize /var/data/cgn-w1 "$ORIGIN" 1 < "$PRIV/code" 2>&1) || fail "cgn-authorize failed: $(printf '%s' "$auth" | head -c 300 | tr '\n' ' ')"
printf '%s\n' "$auth" | sed 's/^/   /'
printf '%s\n' "$auth" | grep -q '^AUTHORIZED ' || fail "cgn-authorize did not confirm"

stage="proxy"
env W3_OWNER="$RUNID" node "$ROOT/scripts/beta/render-like-proxy.mjs" --https-port $HTTPS --http-port $HTTPP --backend "127.0.0.1:$BACK" --cert "$PRIV/cert.pem" --key "$PRIV/key.pem" --hops 1 > "$PLOG" 2>&1 &
proxy_pid=$!
up=""
for _ in $(seq 1 40); do grep -q LISTENING "$PLOG" && { up=1; break; }; kill -0 "$proxy_pid" 2>/dev/null || break; sleep 0.25; done
[ -n "$up" ] && kill -0 "$proxy_pid" 2>/dev/null || fail "the proxy did not start: $(tail -c 300 "$PLOG" | tr '\n' ' ')"
n=$(listeners)
echo "   listeners on $HTTPS/$HTTPP/$BACK while running (positive control for the cleanup check; expect 3): $n"
[ "$n" -ge 3 ] || fail "expected 3 listeners (the proxy's two and the container's), found $n"

stage="rehearsal"
echo "-- the rehearsal (bounded: timeout 600 s, and the driver's own --max-minutes)"
env W3_OWNER="$RUNID" timeout 600 node "$ROOT/scripts/beta/w3-rehearsal.mjs" --origin "$ORIGIN" --code-file "$PRIV/code" --evidence "$EVD" "$@" > "$LOG" 2>&1 &
driver_pid=$!
wait "$driver_pid"; drc=$?; driver_pid=""
sed 's/^/   /' "$LOG"
echo "   driver exit: $drc"
rc=$drc
stage="cleanup"
[ "$rc" = 0 ] || exit 1
exit 0
