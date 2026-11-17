#!/bin/bash
# Beta R4 W4 (handoff 6933392621): the LOCAL W4 restart rehearsal, bounded and self-cleaning. It runs the packaged pinned
# image (from deploy/render) in production mode on a THROWAWAY Docker volume owned by this run, with a throwaway access
# code, behind scripts/beta/render-like-proxy.mjs, then scripts/beta/w4-rehearsal.mjs (Chromium pages: a host, one
# guest and a TV). Mid-round the driver asks this harness to restart the service, and the harness does it:
#   stop, start  `docker stop` (SIGTERM, which cgn-entrypoint passes to the server: sockets close, the data lock is
#                released), then later `docker start` of the SAME container: two requests, so that the driver can tap
#                while the service is certainly down
#   fresh        stop and remove the container, then a NEW container of the same image on the SAME owned volume, with
#                the same environment (a local analogue of a redeploy; it is NOT a Render deploy)
#   fresh-empty  the negative control: a new container on a NEW, EMPTY owned volume (data lost); the driver's
#                continuity and durability checks must then fail
#   lock-probe   a second server process INSIDE the running container, on the same data folder: the one-writer lock
#                must refuse it (exit 2, "is using this data directory")
#   guard-probe  the probe's OWN container, on a fixture volume owned by this run holding only a copy of the
#                authorization record, with a different public origin: cgn-entrypoint's rollback guard must refuse it
#                (exit 78) before its deadline. The data volume is never mounted by a second container.
# The actions live in scripts/beta/w4-control.sh (sourced here and by the fault tests), and they FAIL CLOSED (review
# 6935165862): a stop counts only when the container reads back as exited with code 0 (not forced, not OOM-killed); a
# replacement starts only after the old container stopped gracefully, was removed and confirmed gone, and no container
# uses the data volume; every docker call is bounded. After every (re)start: readiness, the pinned /health revision,
# the container still carrying this run's label.
#
# Isolation is the W3 harness's (review 6930033578): a run id; containers and volumes named for it and labelled
# w4.owner=<run id>; only what this run created is removed, after its label is read back; nothing deleted in advance; a
# port preflight; every startup step checked before authorization or browser work; processes it starts carry
# W4_OWNER=<run id>; the code, env file and TLS key in a private mode-700 directory removed on exit; cleanup on exit,
# INT and TERM, run twice (the second pass must find nothing). The work directory, its per-run logs and the evidence
# are kept. No hosting account, no public forwarding, never called a Render deploy.
#
#   bash scripts/beta/w4-rehearsal.sh <image tag> [work dir] [extra w4-rehearsal.mjs options, e.g. --control empty-data]
#
# Needs: docker, node 22 with this repository's node_modules, openssl, curl. Ports 18080, 18443, 18480.
# W4_EXPECTED_REVISION (default: the release pin 7097ac2…) exists for a revision-mismatch control; W4_STOP_SECONDS,
# W4_GUARD_SECONDS and W4_GUARD_MODE (see w4-control.sh) for the forced-stop and guard negative controls.
# Exit: 0 "W4 REHEARSAL HARNESS PASSED"; otherwise "W4 REHEARSAL HARNESS FAILED" with 1, or 130/143 when interrupted.
set -uo pipefail
IMG=${1:-}
[ -n "$IMG" ] || { echo "usage: bash scripts/beta/w4-rehearsal.sh <image tag> [work dir] [driver options]" >&2; exit 2; }
shift; WK_ARG=${1:-}; [ $# -gt 0 ] && shift
PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
EXPECT=${W4_EXPECTED_REVISION:-$PIN}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HTTPS=18443; HTTPP=18480; BACK=18080; ORIGIN="https://localhost:$HTTPS"
RUNID=$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
if [ -n "$WK_ARG" ]; then mkdir -p "$WK_ARG" || exit 1; WK=$(cd "$WK_ARG" && pwd); else WK=$(mktemp -d); fi
LOG="$WK/w4-$RUNID.log"; PLOG="$WK/proxy-$RUNID.log"; EVD="$WK/evidence"
cid=""; volumes=""; proxy_pid=""; driver_pid=""; PRIV=""; privpath=""; CODE=""; started=0; rc=1; stage="setup"; cleanups=0; finished=0; nseq=0; VOL=""
# shellcheck source=scripts/beta/w4-control.sh
. "$ROOT/scripts/beta/w4-control.sh" || { echo "cannot load scripts/beta/w4-control.sh" >&2; exit 2; }

fail() { echo "   FAILED at $stage: $*"; rc=1; exit 1; }
trap finish EXIT
trap 'echo "   interrupted (SIGINT)"; rc=130; exit 130' INT
trap 'echo "   interrupted (SIGTERM)"; rc=143; exit 143' TERM

echo "== w4-rehearsal $(date -u +%FT%TZ), run $RUNID, image $IMG, driver $(sha256sum "$ROOT/scripts/beta/w4-rehearsal.mjs" | cut -c1-16), proxy $(sha256sum "$ROOT/scripts/beta/render-like-proxy.mjs" | cut -c1-16)"
stage="image"
imgid=$(dk image inspect --format '{{.Id}}' "$IMG" 2>/dev/null) || fail "the image '$IMG' is not available locally"
echo "   image id: ${imgid:0:19}"
stage="port preflight"
busy=$(listeners)
[ "$busy" = 0 ] || fail "$busy listener(s) already on $HTTPS/$HTTPP/$BACK (another run or an unrelated service); nothing was started"
echo "   ports $HTTPS/$HTTPP/$BACK free"
stage="private files"
PRIV=$(mktemp -d "${TMPDIR:-/tmp}/w4-private.XXXXXXXX") || fail "could not create a private directory"
privpath=$PRIV; chmod 700 "$PRIV" || fail "could not protect the private directory"
( umask 077; od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$PRIV/code" && printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$(cat "$PRIV/code")" > "$PRIV/code.env" ) || fail "could not write the throwaway code"
CODE=$(cat "$PRIV/code")
( umask 077; openssl req -x509 -newkey rsa:2048 -nodes -keyout "$PRIV/key.pem" -out "$PRIV/cert.pem" -days 1 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" >/dev/null 2>&1 ) || fail "could not make the local TLS certificate"
mkdir -p "$PRIV/ctl"
echo "   throwaway code, env file and TLS key in a private directory (mode 700), removed on exit"
stage="volume"
VOL=$(new_volume a) || fail "could not create this run's data volume"
echo "   data volume $VOL (label w4.owner=$RUNID): throwaway data, removed on exit"
stage="container"
if ! cid=$(run_container "$VOL" "$ORIGIN" 1); then
  cid=$(dk ps -aq --no-trunc --filter "label=w4.owner=$RUNID" 2>/dev/null | head -1)
  fail "docker run failed: $(head -c 300 "$PRIV/docker-run.err" | tr '\n' ' ')"
fi
started=1
echo "   container ${cid:0:12} (name w4-svc-$RUNID-1, label w4.owner=$RUNID)"
stage="readiness"
r=$(ready_check) || fail "$r"
echo "   /health revision ${r#ok } is the expected one"
stage="authorization"
auth=$(timeout 60 docker exec -i "$cid" cgn-authorize /var/data/cgn-w1 "$ORIGIN" 1 < "$PRIV/code" 2>&1) || fail "cgn-authorize failed: $(printf '%s' "$auth" | head -c 300 | tr '\n' ' ')"
printf '%s\n' "$auth" | sed 's/^/   /'
printf '%s\n' "$auth" | grep -q '^AUTHORIZED ' || fail "cgn-authorize did not confirm"
stage="proxy"
env W4_OWNER="$RUNID" node "$ROOT/scripts/beta/render-like-proxy.mjs" --https-port $HTTPS --http-port $HTTPP --backend "127.0.0.1:$BACK" --cert "$PRIV/cert.pem" --key "$PRIV/key.pem" --hops 1 > "$PLOG" 2>&1 &
proxy_pid=$!
up=""
for _ in $(seq 1 40); do grep -q LISTENING "$PLOG" && { up=1; break; }; kill -0 "$proxy_pid" 2>/dev/null || break; sleep 0.25; done
[ -n "$up" ] && kill -0 "$proxy_pid" 2>/dev/null || fail "the proxy did not start: $(tail -c 300 "$PLOG" | tr '\n' ' ')"
n=$(listeners)
echo "   listeners on $HTTPS/$HTTPP/$BACK while running (positive control; expect 3): $n"
[ "$n" -ge 3 ] || fail "expected 3 listeners, found $n"

stage="rehearsal"
echo "-- the rehearsal (bounded: timeout 900 s, and the driver's own --max-minutes)"
env W4_OWNER="$RUNID" timeout 900 node "$ROOT/scripts/beta/w4-rehearsal.mjs" --origin "$ORIGIN" --code-file "$PRIV/code" --evidence "$EVD" --control-dir "$PRIV/ctl" "$@" > "$LOG" 2>&1 &
driver_pid=$!
while kill -0 "$driver_pid" 2>/dev/null; do
  [ -f "$PRIV/ctl/req" ] && serve_request
  sleep 0.2
done
wait "$driver_pid"; drc=$?; driver_pid=""
sed 's/^/   /' "$LOG"
echo "   driver exit: $drc"
rc=$drc
stage="cleanup"
[ "$rc" = 0 ] || exit 1
exit 0
