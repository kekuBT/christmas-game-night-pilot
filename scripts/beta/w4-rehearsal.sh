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
#   guard-probe  a second container on the same volume with a different public origin: cgn-entrypoint's rollback guard
#                must refuse it before any server starts (exit 78)
# After every (re)start: readiness, the pinned /health revision, the container still carrying this run's label.
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
# W4_EXPECTED_REVISION (default: the release pin 7097ac2…) exists for a revision-mismatch control.
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
cid=""; volumes=""; proxy_pid=""; driver_pid=""; PRIV=""; privpath=""; CODE=""; started=0; rc=1; stage="setup"; cleanups=0; finished=0; nseq=0

listeners() {
  awk -v want=" $HTTPS $HTTPP $BACK " 'FNR > 1 && $4 == "0A" { n = split($2, a, ":"); p = 0; h = toupper(a[n]);
    for (i = 1; i <= length(h); i++) p = p * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1;
    if (index(want, " " p " ")) c++ } END { print c + 0 }' $(ls /proc/net/tcp /proc/net/tcp6 2>/dev/null)
}
owned_pids() {
  local f p
  for f in /proc/[0-9]*/environ; do
    p=${f#/proc/}; p=${p%/environ}
    [ "$p" = "$$" ] && continue
    grep -qsaF "W4_OWNER=$RUNID" "$f" 2>/dev/null && echo "$p"
  done
}
stop_pid() {
  local p=$1
  kill -0 "$p" 2>/dev/null || return 0
  kill -TERM "$p" 2>/dev/null
  for _ in $(seq 1 25); do kill -0 "$p" 2>/dev/null || return 0; sleep 0.2; done
  kill -KILL "$p" 2>/dev/null
}
fail() { echo "   FAILED at $stage: $*"; rc=1; exit 1; }
label_of() { docker inspect -f '{{index .Config.Labels "w4.owner"}}' "$1" 2>/dev/null; }
vol_label_of() { docker volume inspect -f '{{index .Labels "w4.owner"}}' "$1" 2>/dev/null; }
# Remove one container of this run (only after its label reads back as this run's).
remove_container() {
  local id=$1 l
  l=$(label_of "$id")
  if [ "$l" = "$RUNID" ]; then docker rm -f -v "$id" >/dev/null 2>&1 && echo "container ${id:0:12}" || echo "container ${id:0:12} (REMOVAL FAILED)"
  else echo "container ${id:0:12} not removed (label '${l:-unreadable}')"; fi
}
cleanup() {
  cleanups=$((cleanups + 1))
  local did="" left p id v
  if [ -n "$driver_pid" ]; then stop_pid "$driver_pid"; wait "$driver_pid" 2>/dev/null; driver_pid=""; did="$did driver"; fi
  if [ -n "$proxy_pid" ]; then stop_pid "$proxy_pid"; wait "$proxy_pid" 2>/dev/null; proxy_pid=""; did="$did proxy"; fi
  left=$(owned_pids)
  if [ -n "$left" ]; then for p in $left; do stop_pid "$p"; done; did="$did $(echo $left | wc -w)-more-owned-process(es)"; fi
  # Every container of this run: the current one, and any other carrying this run's label (probes, a failed run).
  for id in $cid $(docker ps -aq --no-trunc --filter "label=w4.owner=$RUNID" 2>/dev/null); do
    case " $did " in *" ${id:0:12}"*) continue ;; esac
    docker inspect "$id" >/dev/null 2>&1 || continue
    did="$did $(remove_container "$id")"
  done
  cid=""
  for v in $volumes $(docker volume ls -q --filter "label=w4.owner=$RUNID" 2>/dev/null); do
    case " $did " in *" volume $v"*) continue ;; esac
    docker volume inspect "$v" >/dev/null 2>&1 || continue
    if [ "$(vol_label_of "$v")" = "$RUNID" ]; then docker volume rm "$v" >/dev/null 2>&1 && did="$did volume $v" || did="$did volume $v (REMOVAL FAILED)"; fi
  done
  volumes=""
  if [ -n "$PRIV" ] && [ -d "$PRIV" ]; then rm -rf -- "$PRIV"; did="$did private-files"; fi
  PRIV=""
  echo "   cleanup #$cleanups:${did:- nothing owned left to remove}"
}
finish() {
  local code=$? left_c left_v left_p left_l leak=0 cookie=0 privleft
  [ "$finished" = 1 ] && return
  finished=1
  trap - INT TERM
  echo "-- cleanup (run $RUNID)"
  cleanup
  cleanup
  left_c=$(docker ps -aq --filter "label=w4.owner=$RUNID" 2>/dev/null | wc -l)
  left_v=$(docker volume ls -q --filter "label=w4.owner=$RUNID" 2>/dev/null | wc -l)
  left_p=$(owned_pids | wc -w)
  if [ "$started" = 1 ]; then left_l=$(listeners); else left_l="not checked (this run started no listener)"; fi
  privleft=no; [ -n "$privpath" ] && [ -e "$privpath" ] && privleft=yes
  echo "   this run's containers left: $left_c; volumes left: $left_v; processes left: $left_p; listeners left on $HTTPS/$HTTPP/$BACK: $left_l; private files left: $privleft"
  if [ -n "$CODE" ]; then leak=$(grep -rlF -f <(printf '%s\n' "$CODE") "$LOG" "$PLOG" "$EVD" 2>/dev/null | wc -l); fi
  cookie=$(grep -rlE 'cgn_beta=[A-Za-z0-9_-]{8}' "$LOG" "$EVD" 2>/dev/null | wc -l)
  echo "   files holding the access code: $leak; files holding a beta cookie value: $cookie"
  if [ "$code" = 0 ] && [ "$rc" = 0 ] && [ "$left_c" = 0 ] && [ "$left_v" = 0 ] && [ "$left_p" = 0 ] && [ "$left_l" = 0 ] && [ "$privleft" = no ] && [ "$leak" = 0 ] && [ "$cookie" = 0 ]; then
    echo "W4 REHEARSAL HARNESS PASSED"; exit 0
  fi
  echo "W4 REHEARSAL HARNESS FAILED"
  if [ "$code" -gt 1 ]; then exit "$code"; fi
  exit 1
}
trap finish EXIT
trap 'echo "   interrupted (SIGINT)"; rc=130; exit 130' INT
trap 'echo "   interrupted (SIGTERM)"; rc=143; exit 143' TERM

# One container of this run on the given volume and public origin; prints its ID or nothing.
run_container() {
  local vol=$1 origin=$2 tag=$3
  docker run -d --name "w4-svc-$RUNID-$tag" --label "w4.owner=$RUNID" -p "127.0.0.1:$BACK:10000" -v "$vol:/var/data" \
    -e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e "MCHEZO_PUBLIC_ORIGIN=$origin" -e MCHEZO_TRUST_PROXY=1 --env-file "$PRIV/code.env" "$IMG" 2>"$PRIV/docker-run.err"
}
new_volume() {
  local v="w4-data-$RUNID-$1"
  docker volume create --label "w4.owner=$RUNID" "$v" >/dev/null 2>&1 || return 1
  volumes="$volumes $v"; echo "$v"
}
# Readiness and the pinned revision of the current container; prints "ok <revision>" or a reason.
ready_check() {
  local ok="" health rev
  for _ in $(seq 1 80); do
    [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" = true ] || break
    curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:$BACK/health" && { ok=1; break; }
    sleep 0.25
  done
  [ -n "$ok" ] || { echo "never ready (state: $(docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' "$cid" 2>/dev/null))"; return 1; }
  health=$(curl -sf --max-time 5 "http://127.0.0.1:$BACK/health") || { echo "/health stopped answering"; return 1; }
  rev=$(printf '%s' "$health" | grep -o '"revision":"[0-9a-f]*"' | head -1 | cut -d'"' -f4)
  [ "$rev" = "$EXPECT" ] || { echo "revision '${rev:-none}', not the expected $EXPECT"; return 1; }
  [ "$(label_of "$cid")" = "$RUNID" ] || { echo "the container does not carry this run's label"; return 1; }
  echo "ok $rev"
}

echo "== w4-rehearsal $(date -u +%FT%TZ), run $RUNID, image $IMG, driver $(sha256sum "$ROOT/scripts/beta/w4-rehearsal.mjs" | cut -c1-16), proxy $(sha256sum "$ROOT/scripts/beta/render-like-proxy.mjs" | cut -c1-16)"
stage="image"
imgid=$(docker image inspect --format '{{.Id}}' "$IMG" 2>/dev/null) || fail "the image '$IMG' is not available locally"
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
  cid=$(docker ps -aq --no-trunc --filter "label=w4.owner=$RUNID" 2>/dev/null | head -1)
  fail "docker run failed: $(head -c 300 "$PRIV/docker-run.err" | tr '\n' ' ')"
fi
started=1
echo "   container ${cid:0:12} (name w4-svc-$RUNID-1, label w4.owner=$RUNID)"
stage="readiness"
r=$(ready_check) || fail "$r"
echo "   /health revision ${r#ok } is the expected one"
stage="authorization"
auth=$(docker exec -i "$cid" cgn-authorize /var/data/cgn-w1 "$ORIGIN" 1 < "$PRIV/code" 2>&1) || fail "cgn-authorize failed: $(printf '%s' "$auth" | head -c 300 | tr '\n' ' ')"
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

# One restart request from the driver: "<seq> <action>" in ctl/req; the answer (one JSON line) goes to ctl/done-<seq>.
serve_request() {
  local seq action out code t0 old r v probe
  read -r seq action < "$PRIV/ctl/req" || return 0
  rm -f "$PRIV/ctl/req"
  t0=$(date +%s%3N)
  case "$action" in
    stop)
      docker stop -t 30 "$cid" >/dev/null 2>&1; code=$?
      r=$(docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' "$cid" 2>/dev/null)
      printf '{"ok":%s,"action":"stop","container":"%s","state":"%s","ms":%s}\n' "$([ "$code" = 0 ] && echo true || echo false)" "${cid:0:12}" "$r" "$(( $(date +%s%3N) - t0 ))" > "$PRIV/ctl/done-$seq"
      echo "   [restart] stop: docker stop exit $code (graceful SIGTERM to cgn-entrypoint); container ${cid:0:12} $r" ;;
    start)
      docker start "$cid" >/dev/null 2>&1 || { printf '{"ok":false,"why":"docker start failed"}\n' > "$PRIV/ctl/done-$seq"; return; }
      if r=$(ready_check); then printf '{"ok":true,"action":"start","container":"%s","revision":"%s","ms":%s}\n' "${cid:0:12}" "${r#ok }" "$(( $(date +%s%3N) - t0 ))" > "$PRIV/ctl/done-$seq"
      else printf '{"ok":false,"why":"%s"}\n' "$r" > "$PRIV/ctl/done-$seq"; fi
      echo "   [restart] start (the same container): $(cat "$PRIV/ctl/done-$seq")" ;;
    fresh|fresh-empty)
      old=$cid
      docker stop -t 30 "$old" >/dev/null 2>&1; code=$?
      echo "   [restart] $action: docker stop exit $code (graceful SIGTERM); removing $(remove_container "$old")"
      v=$VOL
      if [ "$action" = fresh-empty ]; then v=$(new_volume empty) || { printf '{"ok":false,"why":"no volume"}\n' > "$PRIV/ctl/done-$seq"; return; }; echo "   [restart] NEGATIVE CONTROL: the new container gets a NEW, EMPTY volume $v (data lost)"; fi
      nseq=$((nseq + 1))
      if ! cid=$(run_container "$v" "$ORIGIN" "fresh$nseq"); then cid=""; printf '{"ok":false,"why":"docker run failed"}\n' > "$PRIV/ctl/done-$seq"; return; fi
      if r=$(ready_check); then printf '{"ok":true,"action":"%s","container":"%s","oldContainer":"%s","volume":"%s","revision":"%s","ms":%s}\n' "$action" "${cid:0:12}" "${old:0:12}" "$v" "${r#ok }" "$(( $(date +%s%3N) - t0 ))" > "$PRIV/ctl/done-$seq"
      else printf '{"ok":false,"why":"%s"}\n' "$r" > "$PRIV/ctl/done-$seq"; fi
      echo "   [restart] $action: $(cat "$PRIV/ctl/done-$seq")" ;;
    lock-probe)
      out=$(docker exec -e PORT=10001 "$cid" sh -c 'cd /app && exec timeout 20 node dist/server/serve.js' 2>&1); code=$?
      probe=$(printf '%s' "$out" | tr '\n' ' ' | sed 's/"/'"'"'/g' | head -c 300)
      printf '{"ok":true,"action":"lock-probe","exit":%s,"output":"%s"}\n' "$code" "$probe" > "$PRIV/ctl/done-$seq"
      echo "   [probe] lock-probe: a second server in the running container exited $code: $probe" ;;
    guard-probe)
      nseq=$((nseq + 1))
      docker run --name "w4-svc-$RUNID-guard$nseq" --label "w4.owner=$RUNID" -v "$VOL:/var/data" \
        -e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e "MCHEZO_PUBLIC_ORIGIN=https://other.invalid" -e MCHEZO_TRUST_PROXY=1 --env-file "$PRIV/code.env" "$IMG" > "$PRIV/guard.out" 2>&1; code=$?
      probe=$(tr '\n' ' ' < "$PRIV/guard.out" | sed 's/"/'"'"'/g' | head -c 300)
      echo "   [probe] guard-probe: a second container on the same volume with a different public origin exited $code: $probe; removing $(remove_container "$(docker ps -aq --no-trunc --filter "name=^w4-svc-$RUNID-guard$nseq$" | head -1)")"
      printf '{"ok":true,"action":"guard-probe","exit":%s,"output":"%s"}\n' "$code" "$probe" > "$PRIV/ctl/done-$seq" ;;
    *) printf '{"ok":false,"why":"unknown action"}\n' > "$PRIV/ctl/done-$seq" ;;
  esac
}

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
