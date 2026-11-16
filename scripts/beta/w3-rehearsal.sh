#!/bin/bash
# Beta R4 W3 (handoff 6929226094): the LOCAL W3 reconnect rehearsal, bounded and self-cleaning. It runs the packaged
# pinned image (from deploy/render) in production mode with a THROWAWAY data folder and a throwaway access code, behind
# scripts/beta/render-like-proxy.mjs (TLS for localhost, appended X-Forwarded-For), then scripts/beta/w3-rehearsal.mjs
# (Chromium pages: a host, one guest and a TV in one Casual Trivia round; the guest's network interrupted by the test).
# Afterwards it removes the container and its data, stops the proxy, confirms nothing is left listening, and checks that
# no log or evidence file holds the access code or a beta cookie. No hosting account, no public forwarding.
#   bash scripts/beta/w3-rehearsal.sh <image tag> [work dir] [extra w3-rehearsal.mjs options]
# Needs: docker, node 22 with this repository's node_modules (playwright, ws), openssl, curl. Ports 18080, 18443, 18480.
set -uo pipefail
IMG=$1; WK=${2:-$(mktemp -d)}; shift; [ $# -gt 0 ] && shift
mkdir -p "$WK"; WK=$(cd "$WK" && pwd)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HTTPS=18443; HTTPP=18480; BACK=18080; ORIGIN="https://localhost:$HTTPS"; NAME=w3-svc
proxy_pid=""
# Listening sockets on the harness's ports, read from /proc (no ss/netstat dependency: either may be missing).
listeners() {
  awk -v want=" $HTTPS $HTTPP $BACK " 'FNR > 1 && $4 == "0A" { n = split($2, a, ":"); p = 0; h = toupper(a[n]);
    for (i = 1; i <= length(h); i++) p = p * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1;
    if (index(want, " " p " ")) c++ } END { print c + 0 }' $(ls /proc/net/tcp /proc/net/tcp6 2>/dev/null)
}
cleanup() {
  [ -n "$proxy_pid" ] && { kill "$proxy_pid" 2>/dev/null; wait "$proxy_pid" 2>/dev/null; }
  proxy_pid=""
  docker rm -f -v "$NAME" >/dev/null 2>&1
}
trap cleanup EXIT
echo "== w3-rehearsal $(date -u +%FT%TZ), image $IMG ($(docker image inspect --format '{{.Id}}' "$IMG" | cut -c1-19)), driver $(sha256sum "$ROOT/scripts/beta/w3-rehearsal.mjs" | cut -c1-16), proxy $(sha256sum "$ROOT/scripts/beta/render-like-proxy.mjs" | cut -c1-16)"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$WK/key.pem" -out "$WK/cert.pem" -days 1 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" >/dev/null 2>&1
( umask 077; od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$WK/code"; printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$(cat "$WK/code")" > "$WK/code.env" )
docker rm -f -v "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -p "127.0.0.1:$BACK:10000" -e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e "MCHEZO_PUBLIC_ORIGIN=$ORIGIN" -e MCHEZO_TRUST_PROXY=1 --env-file "$WK/code.env" "$IMG" >/dev/null
for _ in $(seq 1 80); do curl -sf -o /dev/null "http://127.0.0.1:$BACK/health" && break; sleep 0.25; done
echo "   /health: $(curl -s "http://127.0.0.1:$BACK/health" | head -c 160)"
docker exec -i "$NAME" cgn-authorize /var/data/cgn-w1 "$ORIGIN" 1 < "$WK/code" | sed 's/^/   /'
node "$ROOT/scripts/beta/render-like-proxy.mjs" --https-port $HTTPS --http-port $HTTPP --backend "127.0.0.1:$BACK" --cert "$WK/cert.pem" --key "$WK/key.pem" --hops 1 > "$WK/proxy.log" 2>&1 &
proxy_pid=$!
for _ in $(seq 1 40); do grep -q LISTENING "$WK/proxy.log" && break; sleep 0.25; done
echo "   listeners on $HTTPS/$HTTPP/$BACK while running (positive control for the cleanup check; expect 3 or more): $(listeners)"
echo "-- the rehearsal (bounded: timeout 600 s, and the driver's own --max-minutes)"
timeout 600 node "$ROOT/scripts/beta/w3-rehearsal.mjs" --origin "$ORIGIN" --code-file "$WK/code" --evidence "$WK/evidence" "$@" > "$WK/w3.log" 2>&1
rc=$?
sed 's/^/   /' "$WK/w3.log"
echo "   driver exit: $rc"
cleanup
echo "-- cleanup"
left_c=$(docker ps -aq --filter "name=^${NAME}$" | wc -l)
left_l=$(listeners)
left_p=$(pgrep -fc "w3-rehearsal.mjs|render-like-proxy.mjs --https-port $HTTPS" || true)
echo "   container left: $left_c; listeners left on $HTTPS/$HTTPP/$BACK: $left_l; processes left: $left_p (the throwaway data folder lived in the removed container)"
CODE=$(cat "$WK/code")
leak=$(grep -rl -e "$CODE" "$WK"/w3.log "$WK"/proxy.log "$WK"/evidence 2>/dev/null | wc -l)
cookie=$(grep -rlE 'cgn_beta=[A-Za-z0-9_-]{8}' "$WK"/w3.log "$WK"/evidence 2>/dev/null | wc -l)
echo "   files holding the access code: $leak; files holding a beta cookie value: $cookie"
if [ "$rc" = 0 ] && [ "$left_c" = 0 ] && [ "$left_l" = 0 ] && [ "$left_p" = 0 ] && [ "$leak" = 0 ] && [ "$cookie" = 0 ]; then echo "W3 REHEARSAL HARNESS PASSED"; exit 0; fi
echo "W3 REHEARSAL HARNESS FAILED"; exit 1
