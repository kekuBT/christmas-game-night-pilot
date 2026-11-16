#!/bin/bash
# Beta R4 (handoff 6921505856): the W2 tool's own test, LOCAL only. It runs the packaged image (from deploy/render) in
# production mode behind scripts/beta/render-like-proxy.mjs (TLS, appended X-Forwarded-For), and shows:
#   V1  the full workload PASSES (2 rooms x 10 players + a TV each; Trivia, Draw & Guess, Memory Book), and what it
#       acknowledged is in the data folder on disk (scripts/beta/w2-disk-check.mjs);
#   V2  a DROPPED acknowledgement is caught: the proxy answers 502 to every 10th stroke message and all its retries;
#   V3  a FAKE acknowledgement is caught: the proxy answers {"accepted":true} to every 10th stroke message without
#       forwarding it, so the read-back must find the drawing short;
#   V4  a cross-room leak is caught: --plant-leak makes room B save a note carrying room A's canary;
#   and that no log or evidence file holds the access code or the beta cookie.
# Each negative must fail on exactly its own check. It proves the tool, not Render.
#   bash scripts/beta/w2-selftest.sh <image tag> [work dir]
# Needs: docker, node 22 with this repository's node_modules (ws), openssl, curl. Ports 18080, 18443, 18480.
set -uo pipefail
IMG=$1; WK=${2:-$(mktemp -d)}; mkdir -p "$WK"; WK=$(cd "$WK" && pwd)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HTTPS=18443; HTTPP=18480; BACK=18080; ORIGIN="https://localhost:$HTTPS"
PASS=0; FAILN=0; FAILED=()
ok() { PASS=$((PASS + 1)); echo "PASS $*"; }
bad() { FAILN=$((FAILN + 1)); FAILED+=("$1"); echo "FAIL $*"; }
proxy_pid=""
stop_proxy() { [ -n "$proxy_pid" ] && { kill "$proxy_pid" 2>/dev/null; wait "$proxy_pid" 2>/dev/null; }; proxy_pid=""; }
trap 'stop_proxy; docker rm -f w2-svc >/dev/null 2>&1' EXIT
proxy() {
  stop_proxy
  node "$ROOT/scripts/beta/render-like-proxy.mjs" --https-port $HTTPS --http-port $HTTPP --backend "127.0.0.1:$BACK" --cert "$WK/cert.pem" --key "$WK/key.pem" "$@" > "$WK/proxy-$RUNID.log" 2>&1 &
  proxy_pid=$!
  for _ in $(seq 1 40); do grep -q LISTENING "$WK/proxy-$RUNID.log" && return 0; sleep 0.25; done
  echo "the proxy did not start"; cat "$WK/proxy-$RUNID.log"; return 1
}
load() { # <id> [w2-load options]
  local id=$1; shift
  NODE_EXTRA_CA_CERTS="$WK/cert.pem" timeout 900 node "$ROOT/scripts/beta/w2-load.mjs" --origin "$ORIGIN" --code-file "$WK/code" --evidence "$WK/evidence-$id" --label "fixture=local-$id" --label "image=$IMG" "$@" > "$WK/$id.log" 2>&1
  local rc=$?
  sed 's/^/      /' "$WK/$id.log" | grep -v '^      evidence:'
  return $rc
}
has() { grep -q -- "$2" "$WK/$1.log"; }
fails() { grep -c '^FAIL' "$WK/$1.log"; }

echo "== w2-selftest $(date -u +%FT%TZ), image $IMG ($(docker image inspect --format '{{.Id}}' "$IMG" | cut -c1-19)), w2-load $(sha256sum "$ROOT/scripts/beta/w2-load.mjs" | cut -c1-16), proxy $(sha256sum "$ROOT/scripts/beta/render-like-proxy.mjs" | cut -c1-16)"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$WK/key.pem" -out "$WK/cert.pem" -days 1 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" >/dev/null 2>&1
( umask 077; od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$WK/code"; printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$(cat "$WK/code")" > "$WK/code.env" )
docker rm -f w2-svc >/dev/null 2>&1
docker run -d --name w2-svc -p "127.0.0.1:$BACK:10000" -e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e "MCHEZO_PUBLIC_ORIGIN=$ORIGIN" -e MCHEZO_TRUST_PROXY=1 --env-file "$WK/code.env" "$IMG" >/dev/null
for _ in $(seq 1 80); do curl -sf -o /dev/null "http://127.0.0.1:$BACK/health" && break; sleep 0.25; done
docker exec -i w2-svc cgn-authorize /var/data/cgn-w1 "$ORIGIN" 1 < "$WK/code" | sed 's/^/      /'

echo "-- V1: the full workload, then the disk"
RUNID=V1; proxy --hops 1
if load V1; then ok "V1 the workload PASSED"; else bad V1 "the workload did not pass"; fi
EV=$(ls "$WK"/evidence-V1/*.json | head -1)
rm -rf "$WK/data-V1"; docker cp w2-svc:/var/data/cgn-w1 "$WK/data-V1" >/dev/null
node "$ROOT/scripts/beta/w2-disk-check.mjs" "$EV" "$WK/data-V1" > "$WK/V1-disk.log" 2>&1; rc=$?
sed 's/^/      /' "$WK/V1-disk.log"
if [ $rc = 0 ]; then ok "V1 what was acknowledged is on disk"; else bad V1-disk "the disk check failed"; fi

echo "-- V2: a dropped acknowledgement (every 10th stroke message, and its retries, get 502)"
RUNID=V2; proxy --hops 1 --fault-action draw-strokes --fail-intent-every 10
load V2 --ack-timeout-s 6; rc=$?
if [ $rc = 1 ] && has V2 '^FAIL stroke: every action acknowledged and accepted' && [ "$(fails V2)" = 1 ]; then ok "V2 FAILED on the unacknowledged strokes alone"; else bad V2 "expected exactly the stroke acknowledgement check to fail (exit $rc, $(fails V2) FAIL lines)"; fi

echo "-- V3: a fake acknowledgement (every 10th stroke message is answered accepted without reaching the server)"
RUNID=V3; proxy --hops 1 --fault-action draw-strokes --fake-ack-every 10
load V3; rc=$?
if [ $rc = 1 ] && has V3 '^FAIL stroke: every acknowledged action read back' && [ "$(fails V3)" = 1 ]; then ok "V3 FAILED on the read-back of the strokes alone"; else bad V3 "expected exactly the stroke read-back check to fail (exit $rc, $(fails V3) FAIL lines)"; fi

echo "-- V4: a planted cross-room leak (room B saves a note with room A's canary)"
RUNID=V4; proxy --hops 1
load V4 --plant-leak; rc=$?
if [ $rc = 1 ] && has V4 "^FAIL rooms isolated: no other room's canary" && [ "$(fails V4)" = 1 ]; then ok "V4 FAILED on room isolation alone"; else bad V4 "expected exactly the isolation check to fail (exit $rc, $(fails V4) FAIL lines)"; fi
stop_proxy

CODE=$(cat "$WK/code")
leak=$(grep -rl -e "$CODE" "$WK"/*.log "$WK"/evidence-* 2>/dev/null | wc -l)
cookie=$(grep -rlE 'cgn_beta=[A-Za-z0-9_-]{8}' "$WK"/*.log "$WK"/evidence-* 2>/dev/null | wc -l)
if [ "$leak" = 0 ] && [ "$cookie" = 0 ]; then ok "no log or evidence file holds the access code or a beta cookie"; else bad secrets "the code is in $leak file(s), a cookie in $cookie"; fi
echo
echo "passed $PASS, failed $FAILN${FAILED:+: ${FAILED[*]}}"
if [ "$FAILN" = 0 ]; then echo "W2 SELFTEST PASSED"; exit 0; else echo "W2 SELFTEST FAILED"; exit 1; fi
