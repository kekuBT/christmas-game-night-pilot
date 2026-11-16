#!/bin/bash
# Beta R4 (handoff 6919813048): the W1 checker's own test, LOCAL only. It runs the packaged image (built from
# deploy/render) behind scripts/beta/render-like-proxy.mjs and shows each W1 mode passing on a correct setup and
# FAILING on a wrong one. It proves the checker, not Render.
#   bash scripts/beta/w1-selftest.sh <image tag> [work dir]
# Needs: docker, node 22 with this repository's node_modules (ws), openssl, curl. Ports 18080, 18443 and 18480 on
# 127.0.0.1. Throwaway data and a throwaway access code generated per run (never printed).
set -uo pipefail
IMG=$1; WK=${2:-$(mktemp -d)}; mkdir -p "$WK"; WK=$(cd "$WK" && pwd)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HOSTNAME_=cgn-w1.test; HTTPS=18443; HTTPP=18480; BACK=18080
ORIGIN="https://$HOSTNAME_:$HTTPS"
CHECK=(node "$ROOT/scripts/beta/w1-check.mjs")
COMMON=(--origin "$ORIGIN" --connect "127.0.0.1:$HTTPS" --connect-http "127.0.0.1:$HTTPP" --ca "$WK/cert.pem" --evidence "$WK/evidence")
PASS=0; FAILN=0; FAILED=()
expect() { # <id> <expected verdict> <description> <checker args...>
  local id=$1 want=$2 desc=$3; shift 3
  "${CHECK[@]}" "$@" "${COMMON[@]}" > "$WK/$id.log" 2>&1; local rc=$?
  local got; got=$(grep -o 'W1 [A-Z]* \(PASSED\|FAILED\|INCONCLUSIVE\)' "$WK/$id.log" | tail -1 | awk '{print $3}')
  sed 's/^/      /' "$WK/$id.log" | grep -v '^      evidence:'
  local rc_ok=1; case "$want:$rc" in PASSED:0|FAILED:1|INCONCLUSIVE:3) rc_ok=0;; esac
  if [ "$got" = "$want" ] && [ $rc_ok = 0 ]; then
    PASS=$((PASS + 1)); echo "PASS $id $desc: the checker said $got, as it must"
  else
    FAILN=$((FAILN + 1)); FAILED+=("$id"); echo "FAIL $id $desc: the checker said ${got:-nothing} (exit $rc), expected $want"
  fi
}
proxy_pid=""
stop_all() { [ -n "$proxy_pid" ] && kill "$proxy_pid" 2>/dev/null; wait "$proxy_pid" 2>/dev/null; proxy_pid=""; docker rm -f w1-svc >/dev/null 2>&1; }
trap stop_all EXIT
service() { # <trust proxy value, or "unset">
  docker rm -f w1-svc >/dev/null 2>&1
  local t=(); [ "$1" != unset ] && t=(-e "MCHEZO_TRUST_PROXY=$1")
  docker run -d --name w1-svc -p "127.0.0.1:$BACK:10000" -e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e "MCHEZO_PUBLIC_ORIGIN=$ORIGIN" "${t[@]}" --env-file "$WK/code.env" "$IMG" >/dev/null
  local up=1; for _ in $(seq 1 80); do curl -sf -o /dev/null "http://127.0.0.1:$BACK/health" && { up=0; break; }; sleep 0.25; done
  [ $up = 0 ] || { echo "the service did not start"; docker logs w1-svc 2>&1 | tail -5; return 1; }
  # As in W1: authorize the throwaway configuration over SSH (here: exec as the same user) before any restart. Without
  # it the rollback guard refuses to restart once data exists (exit 78), as it must.
  docker exec -i w1-svc cgn-authorize /var/data/cgn-w1 "$ORIGIN" "$1" < "$WK/code" | sed 's/^/      /'
}
proxy() { # [--hops N] [--maintenance]
  [ -n "$proxy_pid" ] && { kill "$proxy_pid" 2>/dev/null; wait "$proxy_pid" 2>/dev/null; }
  node "$ROOT/scripts/beta/render-like-proxy.mjs" --https-port $HTTPS --http-port $HTTPP --backend "127.0.0.1:$BACK" --cert "$WK/cert.pem" --key "$WK/key.pem" "$@" > "$WK/proxy.log" 2>&1 &
  proxy_pid=$!
  for _ in $(seq 1 40); do grep -q LISTENING "$WK/proxy.log" && return 0; sleep 0.25; done
  echo "the proxy did not start"; cat "$WK/proxy.log"; return 1
}

echo "== w1-selftest $(date -u +%FT%TZ), image $IMG ($(docker image inspect --format '{{.Id}}' "$IMG" | cut -c1-19)), checker $(sha256sum "$ROOT/scripts/beta/w1-check.mjs" | cut -c1-16), proxy $(sha256sum "$ROOT/scripts/beta/render-like-proxy.mjs" | cut -c1-16)"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$WK/key.pem" -out "$WK/cert.pem" -days 1 -subj "/CN=$HOSTNAME_" -addext "subjectAltName=DNS:$HOSTNAME_" >/dev/null 2>&1
( umask 077; od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$WK/code"; printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$(cat "$WK/code")" > "$WK/code.env" )
CODEF=(--code-file "$WK/code")

echo "-- S1: the right setup (one proxy hop, MCHEZO_TRUST_PROXY=1)"
service 1 && proxy --hops 1
expect S1-closed FAILED "closed, while the service is open" closed
expect S1-boundary PASSED "boundary" boundary "${CODEF[@]}"
( sleep 12; docker restart -t 30 w1-svc >/dev/null ) &
expect S1-reconnect PASSED "reconnect across a restart (docker restart: SIGTERM, then start)" reconnect "${CODEF[@]}" --wait-seconds 90
expect S1-forgery PASSED "forgery" forgery --trust-proxy 1
expect S1-separation PASSED "separation from another address (127.0.0.2)" separation "${CODEF[@]}" --local-address 127.0.0.2 --trust-proxy 1
expect S1-forgery-again INCONCLUSIVE "forgery again at once (this address is still limited)" forgery --trust-proxy 1

echo "-- S2: the count too HIGH (one hop, MCHEZO_TRUST_PROXY=2): a client's forged entry is trusted"
service 2 && proxy --hops 1
expect S2-forgery FAILED "forgery" forgery --trust-proxy 2

echo "-- S3: the count too LOW (MCHEZO_TRUST_PROXY unset): everyone shares the proxy's address"
service unset && proxy --hops 1
expect S3-forgery PASSED "forgery (passes: it can't see this fault)" forgery --trust-proxy unset
expect S3-separation FAILED "separation" separation "${CODEF[@]}" --local-address 127.0.0.2 --trust-proxy unset

echo "-- S4: a two-hop chain with MCHEZO_TRUST_PROXY=1: the inner proxy's address is shared"
service 1 && proxy --hops 2
expect S4-forgery PASSED "forgery (passes: it can't see this fault)" forgery --trust-proxy 1
expect S4-separation FAILED "separation" separation "${CODEF[@]}" --local-address 127.0.0.2 --trust-proxy 1

echo "-- S5: the same two-hop chain with MCHEZO_TRUST_PROXY=2: right again"
service 2 && proxy --hops 2
expect S5-forgery PASSED "forgery" forgery --trust-proxy 2
expect S5-separation PASSED "separation" separation "${CODEF[@]}" --local-address 127.0.0.2 --trust-proxy 2

echo "-- S6: maintenance mode on"
service 1 && proxy --hops 1 --maintenance
expect S6-closed PASSED "closed" closed
expect S6-boundary FAILED "boundary" boundary "${CODEF[@]}"

echo "-- S7: no http->https redirect (the http check pointed at the server itself)"
service 1 && proxy --hops 1
"${CHECK[@]}" boundary "${CODEF[@]}" --origin "$ORIGIN" --connect "127.0.0.1:$HTTPS" --connect-http "127.0.0.1:$BACK" --ca "$WK/cert.pem" --evidence "$WK/evidence" > "$WK/S7-boundary.log" 2>&1; rc=$?
sed 's/^/      /' "$WK/S7-boundary.log" | grep -v '^      evidence:'
if [ $rc = 1 ] && grep -q '^FAIL 2 http:// redirects' "$WK/S7-boundary.log" && [ "$(grep -c '^FAIL' "$WK/S7-boundary.log")" = 1 ]; then PASS=$((PASS + 1)); echo "PASS S7 boundary without a redirect: FAILED on that check alone"; else FAILN=$((FAILN + 1)); FAILED+=(S7); echo "FAIL S7 expected exactly the redirect check to fail (exit $rc)"; fi

echo "-- S8: the service stopped and never restarted"
service 1 && proxy --hops 1
( sleep 12; docker stop -t 30 w1-svc >/dev/null ) &
expect S8-reconnect FAILED "reconnect" reconnect "${CODEF[@]}" --wait-seconds 25

leak=$(grep -rl "$(cat "$WK/code")" "$WK"/*.log "$WK/evidence" 2>/dev/null | wc -l)
if [ "$leak" = 0 ]; then PASS=$((PASS + 1)); echo "PASS the access code appears in no log and no evidence file"; else FAILN=$((FAILN + 1)); FAILED+=(code-leak); echo "FAIL the access code appears in $leak file(s)"; fi
echo
echo "passed $PASS, failed $FAILN${FAILED:+: ${FAILED[*]}}"
if [ "$FAILN" = 0 ]; then echo "W1 SELFTEST PASSED"; exit 0; else echo "W1 SELFTEST FAILED"; exit 1; fi
