#!/bin/bash
# Beta R4 W7 (handoff 6941129590): the LOCAL rehearsal of a rollback, bounded and self-cleaning. Preparation only:
# nothing here is Render, SSH, cloud storage, production data or the owner's keys.
#
#   CURRENT     the reviewed image (runtime 7097ac2) in production mode on a THROWAWAY Docker volume owned by this run
#               (the "Render disk"), data folder /var/data/cgn-w1, authorized by cgn-authorize, behind a Render-like
#               proxy (a LOCAL stand-in for the public side). Synthetic state from scripts/beta/w5-seed.mjs: a completed
#               warm-up game (the score ledger), an approved Memory Book entry, a second game with acknowledged answers.
#   PREVIOUS    the predecessor image, built through the SAME artifact gate (scripts/beta/w7-artifact-check.sh). There is
#               NO audited predecessor artifact: here it is the LOCAL SURROGATE f93e9cb, which tests the protocol only.
#   B0          an earlier backup with its receipt (as from a nightly run): used only to show it can't stand in for B1.
#   WINDOW 1    the rollback (the supported revert-commit path): maintenance on; D6 a pending switch refuses the
#               preflight; B1, the window's backup (cgn-backup, BACKUP_OK) and its independent RECEIPT_OK (the W5 chain:
#               transport and storage as LOCAL SURROGATES, fetch back, cgn-receive); D1 a missing and D2 a mismatched
#               receipt refuse the preflight; COMPAT: the previous release's datatool and server on a DISPOSABLE copy
#               (B1's verified copy, on its own throwaway volume): verify, restore, check, start, the seats, entry,
#               answers and ledger, a new acknowledged action, then the CURRENT release's datatool accepts what the
#               previous one wrote; the preflight (maintenance, a receipt for exactly B1, the compatibility evidence,
#               the record approving the folder being served, nothing pending); D5 a second writer: refused by the
#               start gate, and by the data lock inside the instance; graceful stop, B1 equals the data at the stop, one
#               writer; the previous release started with the CURRENT environment (same folder, origin, proxy count
#               and code); D4 the reopen gate refuses a wrong served revision; the reopen gate (the expected previous
#               revision, the approved folder served, nothing pending); then, through the reopened ingress, the original
#               seats, the completed score ledger, the approved entry, a new acknowledged action; an old code refused.
#   WINDOW 2    the return to the reviewed release: B2 with its receipt, the preflight, graceful stop, the persisted state
#               (the ledger kept, the action persisted; the check's own negative controls), one writer, the current
#               release on the same environment, the reopen gate on 7097ac2, and the previous release's data served.
#   WINDOW 3    the provider one-click rollback, modelled: B3 with its receipt; the previous image with STALE
#               environment values (an old data folder, a rotated code, an old origin, an old proxy count, all of them)
#               against the preserved disk record: each start refused (78), the record and the data unchanged,
#               maintenance kept closed. Then F, a FAILED start of the previous release (killed during start), and the
#               safe recovery: an ordinary start of the reviewed release with the current environment.
# Isolation follows the W4-W6 rules (label w7.owner=<run id>, removal only after the label reads back and confirmed
# gone, one writer on the volume, private material in a mode-700 folder removed on exit, cleanup twice, an unlistable
# inventory UNVERIFIED and FAILING the run). Ports 18780 (the service), 18781 (the disposable copy), 18743/18744 (proxy).
#   bash scripts/beta/w7-rehearsal.sh <current image> <previous image> [work dir]
# Exit: 0 "W7 REHEARSAL PASSED"; otherwise "W7 REHEARSAL FAILED" with 1, or 130/143 when interrupted.
set -uo pipefail
CUR=${1:-}; PRED=${2:-}
[ -n "$CUR" ] && [ -n "$PRED" ] || { echo "usage: bash scripts/beta/w7-rehearsal.sh <current image> <previous image> [work dir]" >&2; exit 2; }
WK_ARG=${3:-}
CUR_REV=${W7_CURRENT_REVISION:-7097ac2bb062925bb296a129f4771f1e68fd522d}
PREV_REV=${W7_PREVIOUS_REVISION:-f93e9cba8613859be9891706ead1c60157c73de2}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BACK=18780; COMPAT=18781; PUBS=18743; PUBH=18744; ORIGIN="https://localhost:$PUBS"
ORIG=/var/data/cgn-w1
RUNID=$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
if [ -n "$WK_ARG" ]; then mkdir -p "$WK_ARG" || exit 1; WK=$(cd "$WK_ARG" && pwd); else WK=$(mktemp -d); fi
RUN="$WK/w7-$RUNID"; EVD="$RUN/evidence"
RECEIVE_SH="$ROOT/deploy/render/operator/cgn-receive.sh"
SEED="$ROOT/scripts/beta/w5-seed.mjs"; CHK="$ROOT/scripts/beta/w7-check.mjs"; FPC="$ROOT/scripts/beta/w6-check.mjs"
DK_S=${W7_DOCKER_SECONDS:-30}
cid=""; VOL=""; CVOL=""; PRIV=""; privpath=""; CODE=""; LEAKS=""; proxy_pid=""; started=0; rc=1; finished=0; cleanups=0; stage="setup"
npass=0; nfail=0; STOP_STATE=""; COMPAT_OK=no; PREFLIGHT=""

chk() { if [ "$2" = 0 ]; then echo "PASS $1"; npass=$((npass + 1)); else echo "FAIL $1${3:+ — $3}"; nfail=$((nfail + 1)); fi; }
fail() { echo "   FAILED at $stage: $*"; nfail=$((nfail + 1)); rc=1; exit 1; }
dk() { timeout "$DK_S" docker "$@"; }
label_of() { dk inspect -f '{{index .Config.Labels "w7.owner"}}' "$1" 2>/dev/null; }
vol_label_of() { dk volume inspect -f '{{index .Labels "w7.owner"}}' "$1" 2>/dev/null; }
volume_users() { local out; out=$(dk ps -aq --no-trunc --filter "volume=$1") || return 1; printf '%s\n' "$out" | sed '/^$/d' | sort; }
container_gone() { local out; out=$(dk ps -aq --no-trunc --filter "id=$1") || return 2; [ -z "$out" ]; }
redact() { sed -e "s#$WK#<work>#g" -e "s#${PRIV:-/nonexistent-private}#<private>#g"; }
EXSH() { dk exec "$cid" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn "$@"; }   # an SSH-like session

# ---------------------------------------------------------------- lifecycle (the W4-W6 rules, label w7.owner)
remove_container() {
  local id=$1 l g
  l=$(label_of "$id")
  [ "$l" = "$RUNID" ] || { echo "container ${id:0:12} not removed (label '${l:-unreadable}')"; return 1; }
  dk rm -f -v "$id" >/dev/null 2>&1 || { echo "container ${id:0:12} (REMOVAL FAILED)"; return 1; }
  container_gone "$id"; g=$?
  [ "$g" = 0 ] || { echo "container ${id:0:12} (REMOVAL NOT CONFIRMED)"; return 1; }
  echo "container ${id:0:12}"
}
remove_volume() {
  local v=$1
  dk volume inspect "$v" >/dev/null 2>&1 || return 0
  [ "$(vol_label_of "$v")" = "$RUNID" ] || { echo "volume $v not removed (label)"; return 1; }
  dk volume rm "$v" >/dev/null 2>&1 && echo "volume $v" || { echo "volume $v (REMOVAL FAILED)"; return 1; }
}
count_owned() {
  local out
  case "$1" in
    containers) out=$(dk ps -aq --no-trunc --filter "label=w7.owner=$RUNID" 2>/dev/null) || return 1 ;;
    volumes) out=$(dk volume ls -q --filter "label=w7.owner=$RUNID" 2>/dev/null) || return 1 ;;
    *) return 1 ;;
  esac
  printf '%s\n' "$out" | sed '/^$/d' | wc -l | tr -d ' '
}
listeners() {
  awk -v want=" $BACK $COMPAT $PUBS $PUBH " 'FNR > 1 && $4 == "0A" { n = split($2, a, ":"); p = 0; h = toupper(a[n]);
    for (i = 1; i <= length(h); i++) p = p * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1;
    if (index(want, " " p " ")) c++ } END { print c + 0 }' $(ls /proc/net/tcp /proc/net/tcp6 2>/dev/null)
}
owned_pids() {
  local f p
  for f in /proc/[0-9]*/environ; do
    p=${f#/proc/}; p=${p%/environ}
    [ "$p" = "$$" ] && continue
    grep -qsaF "W7_OWNER=$RUNID" "$f" 2>/dev/null && echo "$p"
  done
}
stop_pid() {
  local p=$1
  kill -0 "$p" 2>/dev/null || return 0
  kill -TERM "$p" 2>/dev/null
  for _ in $(seq 1 25); do kill -0 "$p" 2>/dev/null || return 0; sleep 0.2; done
  kill -KILL "$p" 2>/dev/null
}
cleanup() {
  cleanups=$((cleanups + 1))
  local did="" left p id v listed
  if [ -n "$proxy_pid" ]; then stop_pid "$proxy_pid"; wait "$proxy_pid" 2>/dev/null; proxy_pid=""; did="$did proxy"; fi
  left=$(owned_pids)
  if [ -n "$left" ]; then for p in $left; do stop_pid "$p"; done; did="$did $(echo $left | wc -w)-more-owned-process(es)"; fi
  listed=$(dk ps -aq --no-trunc --filter "label=w7.owner=$RUNID" 2>/dev/null) || { listed=""; did="$did (docker could not list this run's containers)"; }
  for id in $cid $listed; do
    case " $did " in *" ${id:0:12}"*) continue ;; esac
    dk inspect "$id" >/dev/null 2>&1 || continue
    did="$did $(remove_container "$id")"
  done
  cid=""
  listed=$(dk volume ls -q --filter "label=w7.owner=$RUNID" 2>/dev/null) || { listed=""; did="$did (docker could not list this run's volumes)"; }
  for v in $VOL $CVOL $listed; do
    case " $did " in *" volume $v"*) continue ;; esac
    dk volume inspect "$v" >/dev/null 2>&1 || continue
    did="$did $(remove_volume "$v")"
  done
  VOL=""; CVOL=""
  if [ -n "$PRIV" ] && [ -d "$PRIV" ]; then rm -rf -- "$PRIV"; did="$did private-files(codes,keys,sessions,decrypted-copies)"; fi
  PRIV=""
  echo "   cleanup #$cleanups:${did:- nothing owned left to remove}"
}
finish() {
  local code=$? left_c left_v left_p left_l leak=0 privleft out1 scan=() where="the kept run folder"
  [ "$finished" = 1 ] && return
  finished=1
  trap - INT TERM
  echo "-- cleanup (run $RUNID)"
  cleanup
  cleanup
  left_c=$(count_owned containers) || left_c="UNVERIFIED (docker could not list this run's containers)"
  left_v=$(count_owned volumes) || left_v="UNVERIFIED (docker could not list this run's volumes)"
  left_p=$(owned_pids | wc -w)
  if [ "$started" = 1 ]; then left_l=$(listeners); else left_l="not checked (this run started no listener)"; fi
  privleft=no; [ -n "$privpath" ] && [ -e "$privpath" ] && privleft=yes
  echo "   this run's containers left: $left_c; volumes left: $left_v; processes left: $left_p; listeners left on $BACK/$COMPAT/$PUBS/$PUBH: $left_l; private files left: $privleft"
  [ -d "$RUN" ] && scan+=("$RUN")
  out1=$(readlink -f "/proc/$$/fd/1" 2>/dev/null); if [ -n "$out1" ] && [ -f "$out1" ]; then scan+=("$out1"); where="$where and this run's own log"; fi
  if [ ${#scan[@]} -gt 0 ]; then
    leak=$( { [ -n "$LEAKS" ] && grep -rlaF -f <(printf '%s\n' "$LEAKS" | sed '/^$/d') "${scan[@]}" 2>/dev/null; grep -rlaE 'AGE-SECRET-KEY-|cgn_beta=[A-Za-z0-9_-]{8}' "${scan[@]}" 2>/dev/null; } | sort -u | wc -l)
  fi
  echo "   files ($where) holding an access code (current or old), a session token, a gate cookie or an age secret key: $leak"
  echo "   checks: $npass passed, $nfail failed"
  if [ "$code" = 0 ] && [ "$rc" = 0 ] && [ "$nfail" = 0 ] && [ "$npass" -gt 0 ] && [ "$left_c" = 0 ] && [ "$left_v" = 0 ] && [ "$left_p" = 0 ] && [ "$left_l" = 0 ] && [ "$privleft" = no ] && [ "$leak" = 0 ]; then
    echo "W7 REHEARSAL PASSED"; exit 0
  fi
  echo "W7 REHEARSAL FAILED"
  if [ "$code" -gt 1 ]; then exit "$code"; fi
  exit 1
}
trap finish EXIT
trap 'echo "   interrupted (SIGINT)"; rc=130; exit 130' INT
trap 'echo "   interrupted (SIGTERM)"; rc=143; exit 143' TERM

# ---------------------------------------------------------------- service, proxy, probe
# start <tag> <image> <volume> <data dir> [port|none|net:<cid>] [origin] [proxy count] [code env file]: one container of
# this run; prints its id. Defaults: the service port, the CURRENT authorized environment.
start() {
  local tag=$1 img=$2 vol=$3 data=$4 net=${5:-$BACK} origin=${6:-$ORIGIN} hops=${7:-1} env=${8:-$PRIV/code.env} p=()
  case "$net" in none) ;; net:*) p=(--network "container:${net#net:}") ;; *) p=(-p "127.0.0.1:$net:10000") ;; esac
  timeout 60 docker run -d --name "w7-$RUNID-$tag" --label "w7.owner=$RUNID" "${p[@]}" -v "$vol:/var/data" \
    -e "MCHEZO_DATA_DIR=$data" -e "MCHEZO_PUBLIC_ORIGIN=$origin" -e "MCHEZO_TRUST_PROXY=$hops" -e "CGN_BACKUP_RECIPIENT=$RECIP" \
    --env-file "$env" "$img" 2>"$PRIV/docker-run.err"
}
ready() {   # ready <cid> [port]: prints "ok <revision>" or a reason
  local ok="" rev port=${2:-$BACK}
  for _ in $(seq 1 120); do
    [ "$(dk inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ] || break
    curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:$port/health" && { ok=1; break; }
    sleep 0.25
  done
  [ -n "$ok" ] || { echo "never ready (state: $(dk inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' "$1" 2>/dev/null))"; return 1; }
  rev=$(curl -sf --max-time 5 "http://127.0.0.1:$port/health" | grep -o '"revision":"[0-9a-f]*"' | head -1 | cut -d'"' -f4)
  echo "ok ${rev:-none}"
}
wait_exit() {   # wait_exit <cid> [tries]: prints "<status> <exit code>"
  local s=""; for _ in $(seq 1 "${2:-60}"); do s=$(dk inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$1" 2>/dev/null); [ "${s%% *}" = exited ] && break; sleep 0.25; done; echo "$s"
}
graceful_stop() {   # the W4 rule: docker stop succeeded AND the container reads back exited, code 0, not OOM-killed
  local id=$1 code st status exitc oom running
  timeout 50 docker stop -t 30 "$id" >/dev/null 2>&1; code=$?
  st=$(dk inspect -f '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}} {{.State.Running}}' "$id" 2>/dev/null) || { STOP_STATE="state unreadable"; return 1; }
  read -r status exitc oom running <<< "$st"
  STOP_STATE="docker stop exit $code; state $status, exit code $exitc, OOM-killed $oom"
  [ "$code" = 0 ] && [ "$status" = exited ] && [ "$running" = false ] && [ "$exitc" = 0 ] && [ "$oom" = false ]
}
proxy() {   # proxy maintenance|open: (re)start the Render-like proxy in front
  if [ -n "$proxy_pid" ]; then stop_pid "$proxy_pid"; wait "$proxy_pid" 2>/dev/null; proxy_pid=""; fi
  local m=""; [ "$1" = maintenance ] && m=--maintenance
  : > "$PRIV/proxy.log"
  env W7_OWNER="$RUNID" node "$ROOT/scripts/beta/render-like-proxy.mjs" --https-port $PUBS --http-port $PUBH --backend "127.0.0.1:$BACK" --cert "$PRIV/cert.pem" --key "$PRIV/key.pem" --hops 1 $m > "$PRIV/proxy.log" 2>&1 &
  proxy_pid=$!
  for _ in $(seq 1 40); do grep -q LISTENING "$PRIV/proxy.log" && return 0; kill -0 "$proxy_pid" 2>/dev/null || break; sleep 0.25; done
  return 1
}
public_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 --cacert "$PRIV/cert.pem" "https://localhost:$PUBS/health"; }
probe_in() {   # the runbook's private probe inside container $1 (placed there first)
  timeout 30 docker exec -i "$1" sh -c 'cat > /tmp/cgn-probe.mjs' < "$PRIV/cgn-probe.mjs" || return 1
  timeout 30 docker exec "$1" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn node /tmp/cgn-probe.mjs check 2>&1
}
# The reopen gate (W6, used here unchanged): the private probe UP on the EXPECTED revision, AND the record approving the
# expected folder with NOTHING pending, served by this instance; only then does the ingress leave maintenance.
reopen_gate() {   # reopen_gate <cid> <expected revision> <expected folder>: 0 reopened; 1 refused (stays in maintenance)
  local p st; p=$(probe_in "$1") || true
  st=$(dk exec "$1" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn cgn-authorize --status 2>&1) || true
  echo "   [reopen gate] private probe: $p; expected $2"
  echo "   [reopen gate] record: $st; expected data_dir=$3, nothing pending, served $3"
  printf '%s\n' "$p" | grep -q "^PROBE .* UP $2\$" || return 1
  printf '%s\n' "$st" | grep -q "^STATUS data_dir=$3 .* pending_data_dir=none serving=$3\$" || return 1
  proxy open
}
rec_state() {   # rec_state <label>: the record's state (never the code or its hash) into the evidence
  EXSH cgn-authorize --status > "$PRIV/last-status" 2>&1
  printf '%s: %s\n' "$1" "$(cat "$PRIV/last-status")" >> "$PRIV/record-states.txt"
}
fingerprint() {   # fingerprint <cid> <dir> <out>: every file of a data folder, copied out (works on stopped containers too)
  local t="$PRIV/fp-$RANDOM$RANDOM"
  mkdir -p "$t" && timeout 60 docker cp "$1:$2" "$t/" >/dev/null 2>&1 || return 1
  node "$FPC" fingerprint "$t/$(basename "$2")" > "$3"; local r=$?
  rm -rf -- "$t"; return $r
}
copy_out() {   # copy_out <cid> <dir> <local parent>: a private copy of a data folder
  rm -rf "$3"; mkdir -p "$3" && timeout 60 docker cp "$1:$2" "$3/" >/dev/null 2>&1
}
disk_state() {   # disk_state <out prefix>: the record's SHA-256 and the folder's fingerprint, from a helper that never starts
  local h r
  h=$(dk create --label "w7.owner=$RUNID" -v "$VOL:/var/data" "$CUR" 2>/dev/null) || return 1
  r=0; fingerprint "$h" "$ORIG" "$1.fp" || r=1
  rm -rf "$PRIV/rec-out"; mkdir -p "$PRIV/rec-out"
  timeout 30 docker cp "$h:/var/data/cgn-authorized.conf" "$PRIV/rec-out/" >/dev/null 2>&1 && sha256sum < "$PRIV/rec-out/cgn-authorized.conf" | cut -d' ' -f1 > "$1.rec" || r=1
  remove_container "$h" >/dev/null || r=1
  return $r
}
lines_of() { dk logs "$1" 2>&1 | tail -c 6000; }
dt_in() {   # dt_in <image> <volume> <datatool args...>: the release's own datatool, as the service user, in a one-off container
  local img=$1 v=$2; shift 2
  timeout 120 docker run --rm --label "w7.owner=$RUNID" -v "$v:/var/data" --entrypoint sh "$img" -c "cd /app && node dist/server/datatool.js $*" 2>&1
}

# ---------------------------------------------------------------- the W5 chain (receive one backup) and the gates
receive() {   # receive <name> <container archive path> <expected hash> [flip]: sets RCPT_OK and RCPT_COPY
  local name=$1 src=$2 hash=$3 mutate=${4:-} f base dev sto fet work out r
  f=$(basename "$src"); base="$RUN/chain-$name"; dev="$base/surrogate-device"; sto="$base/surrogate-storage"; fet="$base/fetched"; work="$PRIV/receive-$name"
  mkdir -p "$dev" "$sto" "$fet" "$work" "$RUN/receipts" || fail "could not create the chain folders"
  RCPT_OK=no; RCPT_COPY=""
  timeout 60 docker cp "$cid:$src" "$dev/$f" >/dev/null 2>&1 && [ -s "$dev/$f" ] || { echo "   [chain $name] transport FAILED"; return 1; }
  [ ! -e "$sto/$f" ] && cp -- "$dev/$f" "$sto/$f" && [ ! -e "$fet/$f" ] && cp -- "$sto/$f" "$fet/$f" || { echo "   [chain $name] storage/fetch FAILED"; return 1; }
  [ "$mutate" = flip ] && printf 'X' | dd of="$fet/$f" bs=1 seek=$(( $(stat -c %s "$fet/$f") / 2 )) conv=notrunc status=none
  out=$(timeout 120 sh "$RECEIVE_SH" "$fet/$f" "$hash" "$PRIV/test-identity.txt" "$work" 2>&1); r=$?
  printf '%s\n' "$out" | redact | sed "s/^/   [chain $name] /"
  if [ "$r" = 0 ] && printf '%s\n' "$out" | grep -q "^RECEIPT_OK $fet/$f sha256=$hash "; then
    RCPT_OK=yes; RCPT_COPY=$(printf '%s\n' "$out" | sed -n 's/^RECEIPT_OK .* copy=//p')
    printf 'backup_sha256=%s\n%s\n' "$hash" "$(printf '%s\n' "$out" | grep '^RECEIPT_OK ' | redact)" > "$RUN/receipts/$name.receipt"
  fi
}
receipt_gate() { [ -f "$RUN/receipts/$1.receipt" ] && grep -qx "backup_sha256=$2" "$RUN/receipts/$1.receipt" && grep -q "^RECEIPT_OK .* sha256=$2 " "$RUN/receipts/$1.receipt"; }
backup() {   # backup <name>: cgn-backup in an SSH-like session; sets BK_SHA and BK_ARCH, prints the session
  local out r
  out=$(timeout 180 docker exec "$cid" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn cgn-backup 2>&1); r=$?
  printf '%s\n' "$out" | sed "s/^/   [$1] /"; printf '%s\n' "$out" > "$EVD/$1-backup-session.txt"
  BK_ARCH=$(printf '%s\n' "$out" | grep '^BACKUP_OK ' | awk '{print $2}')
  BK_SHA=$(printf '%s\n' "$out" | grep '^BACKUP_OK ' | sed -n 's/.* sha256=\([0-9a-f]\{64\}\) .*/\1/p')
  [ "$r" = 0 ] && [ "$(printf '%s\n' "$out" | grep -c '^BACKUP_OK ')" = 1 ] && [ -n "$BK_SHA" ]
}
# The rollback preflight, in maintenance, before the writer stops: maintenance on; a receipt for EXACTLY this window's
# backup; (for the previous release) the compatibility evidence; the record approving the folder being served, nothing
# pending. Sets PREFLIGHT to the reasons; 0 passes.
preflight() {   # preflight <receipt name> <backup sha> <compat required: yes|no>
  local why="" st
  [ "$(public_code)" = 503 ] || why="$why; maintenance is off"
  receipt_gate "$1" "$2" || why="$why; no receipt for this window's backup (${2:0:12}...)"
  [ "$3" = no ] || [ "$COMPAT_OK" = yes ] || why="$why; no compatibility evidence for the previous release"
  st=$(EXSH cgn-authorize --status 2>&1)
  printf '%s\n' "$st" | grep -q "^STATUS data_dir=$ORIG .* pending_data_dir=none serving=$ORIG\$" || why="$why; the record or the writer is not as required ($st)"
  PREFLIGHT=${why#; }
  echo "   [preflight] ${PREFLIGHT:-maintenance on; a receipt for exactly this backup; $([ "$3" = yes ] && echo 'compatibility evidence; ')the record approves $ORIG, nothing pending, served: PASS}"
  [ -z "$why" ]
}
start_gate() {   # one writer: no container of any kind on the volume before a start
  local u; u=$(volume_users "$VOL") || { echo "   [start gate] the volume's users can't be listed"; return 1; }
  echo "   [start gate] containers on the volume: $(printf '%s\n' "$u" | sed '/^$/d' | wc -l | tr -d ' ')"
  [ -z "$u" ]
}
switch_to() {   # switch_to <tag> <image> <expected revision>: start on the CURRENT environment; checks the start lines
  cid=$(start "$1" "$2" "$VOL" "$ORIG") || fail "docker run failed: $(head -c 300 "$PRIV/docker-run.err" | tr '\n' ' ')"
  local r; r=$(ready "$cid") || fail "the $1 start never became ready: $r"
  local l; l=$(lines_of "$cid")
  printf '%s\n' "$l" | grep -E '^cgn-entrypoint|\[restore\]|NOT LOADED|quarantin' | sed "s/^/   [$1 start] /"
  chk "the $1 start: the guard accepts the CURRENT environment (the APPROVED folder $ORIG), the server restores the room with nothing unloaded, and /health names $(echo "$3" | cut -c1-7)" \
    "$([ "$r" = "ok $3" ] && printf '%s' "$l" | grep -q "cgn-entrypoint: the environment matches the authorized configuration: the APPROVED data folder $ORIG\$" && printf '%s' "$l" | grep -q "\[restore\] 1 room(s) restored, 0 not loaded (data: $ORIG)" && ! printf '%s' "$l" | grep -qE 'NOT LOADED|quarantin' && echo 0 || echo 1)" "$r"
}

# ---------------------------------------------------------------- setup
echo "== w7-rehearsal $(date -u +%FT%TZ), run $RUNID, current $CUR, previous $PRED (expected revisions $(echo "$CUR_REV" | cut -c1-7) and $(echo "$PREV_REV" | cut -c1-7))"
echo "   scripts: w7-rehearsal.sh $(sha256sum "$0" | cut -c1-16), w7-check.mjs $(sha256sum "$CHK" | cut -c1-16), w5-seed.mjs $(sha256sum "$SEED" | cut -c1-16)"
stage="preflight"
for c in docker node age age-keygen curl sha256sum openssl tar; do command -v "$c" >/dev/null 2>&1 || fail "$c is not installed"; done
curid=$(dk image inspect --format '{{.Id}}' "$CUR" 2>/dev/null) || fail "the image '$CUR' is not available locally"
predid=$(dk image inspect --format '{{.Id}}' "$PRED" 2>/dev/null) || fail "the image '$PRED' is not available locally"
busy=$(listeners); [ "$busy" = 0 ] || fail "$busy listener(s) already on $BACK/$COMPAT/$PUBS/$PUBH; nothing was started"
mkdir -p "$EVD" || fail "could not create the run folder"
stage="private files"
PRIV=$(mktemp -d "${TMPDIR:-/tmp}/w7-private.XXXXXXXX") || fail "no private directory"; privpath=$PRIV; chmod 700 "$PRIV"
( umask 077; od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$PRIV/code" && printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$(cat "$PRIV/code")" > "$PRIV/code.env" ) || fail "no throwaway code"
( umask 077; od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$PRIV/old-code" && printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$(cat "$PRIV/old-code")" > "$PRIV/old-code.env" ) || fail "no old code"
CODE=$(cat "$PRIV/code"); LEAKS=$(printf '%s\n%s\n' "$CODE" "$(cat "$PRIV/old-code")")
( umask 077; age-keygen -o "$PRIV/test-identity.txt" 2>/dev/null ) || fail "no disposable test key"
RECIP=$(age-keygen -y "$PRIV/test-identity.txt") || fail "no test recipient"
( umask 077; openssl req -x509 -newkey rsa:2048 -nodes -keyout "$PRIV/key.pem" -out "$PRIV/cert.pem" -days 1 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" >/dev/null 2>&1 ) || fail "no TLS certificate"
sed -n "/^cat > \/tmp\/cgn-probe.mjs <<'PROBE'\$/,/^PROBE\$/p" "$ROOT/docs/beta/render-w5.md" | sed '1d;$d' > "$PRIV/cgn-probe.mjs"
[ -s "$PRIV/cgn-probe.mjs" ] || fail "could not take the probe text from docs/beta/render-w5.md"
echo "   throwaway codes (current and an OLD rotated one), a DISPOSABLE test identity (receiving side), TLS key and the runbook's probe in a private folder (mode 700), removed on exit"
stage="volume"
VOL="w7-data-$RUNID"; dk volume create --label "w7.owner=$RUNID" "$VOL" >/dev/null 2>&1 || { VOL=""; fail "no data volume"; }
stage="current service"
cid=$(start a "$CUR" "$VOL" "$ORIG") || { cid=$(dk ps -aq --no-trunc --filter "label=w7.owner=$RUNID" | head -1); fail "docker run failed: $(head -c 300 "$PRIV/docker-run.err" | tr '\n' ' ')"; }
started=1
r=$(ready "$cid") || fail "$r"
chk "the current service is ready on $ORIG, /health on the reviewed revision" "$([ "$r" = "ok $CUR_REV" ] && echo 0 || echo 1)" "$r"
auth=$(timeout 60 docker exec -i "$cid" cgn-authorize "$ORIG" "$ORIGIN" 1 < "$PRIV/code" 2>&1) || fail "cgn-authorize failed"
echo "   $(printf '%s\n' "$auth" | grep '^AUTHORIZED ')"
rec_state "the authorized current service"
proxy open || fail "the proxy did not start"
chk "the service is live: the PUBLIC /health answers 200" "$([ "$(public_code)" = 200 ] && echo 0 || echo 1)"
stage="provenance"
g=0; for f in cgn-backup cgn-entrypoint cgn-authorize; do
  a=$(sha256sum "$ROOT/deploy/render/$f.sh" | cut -d' ' -f1)
  for img in "$CUR" "$PRED"; do [ "$(timeout 30 docker run --rm --label "w7.owner=$RUNID" --entrypoint sha256sum "$img" "/usr/local/bin/$f" | cut -d' ' -f1)" = "$a" ] || g=1; done
done
chk "both images carry the reviewed cgn-backup, cgn-entrypoint and cgn-authorize, byte for byte" "$g"
relc=$(timeout 30 docker run --rm --label "w7.owner=$RUNID" --entrypoint cat "$CUR" /app/release.json); relp=$(timeout 30 docker run --rm --label "w7.owner=$RUNID" --entrypoint cat "$PRED" /app/release.json)
chk "the images' release.json: the current names $(echo "$CUR_REV" | cut -c1-7), the previous names $(echo "$PREV_REV" | cut -c1-7)" "$(printf '%s' "$relc" | grep -q "\"$CUR_REV\"" && printf '%s' "$relp" | grep -q "\"$PREV_REV\"" && echo 0 || echo 1)"
printf '{"current":{"image":"%s","id":"%s","release":%s},"previous":{"image":"%s","id":"%s","release":%s,"note":"LOCAL SURROGATE: no audited predecessor artifact exists"},"cgnReceiveSha256":"%s"}\n' \
  "$CUR" "$curid" "$relc" "$PRED" "$predid" "$relp" "$(sha256sum "$RECEIVE_SH" | cut -d' ' -f1)" > "$EVD/provenance.json"

# ---------------------------------------------------------------- seed; B0 (an earlier backup)
stage="seed"
so=$(env W7_OWNER="$RUNID" timeout 180 node "$SEED" seed "http://127.0.0.1:$BACK" "$PRIV" 2>&1) || { printf '%s\n' "$so"; fail "seeding failed"; }
printf '%s\n' "$so" | sed 's/^/   /'; printf '%s\n' "$so" | grep '^SEED ' | sed 's/^SEED //' > "$EVD/seed.json"
LEAKS=$(printf '%s\n%s\n' "$LEAKS" "$(node -e 'const s=require(process.argv[1]);console.log(s.secret.hostToken+"\n"+s.secret.guestToken)' "$PRIV/seed.json")")
stage="B0"
backup B0 || fail "B0 failed"
B0_SHA=$BK_SHA; r=$(ready "$cid") || fail "not back after B0: $r"
receive b0 "$BK_ARCH" "$B0_SHA"
chk "B0 (an earlier backup, as from a nightly run): BACKUP_OK and its RECEIPT_OK" "$([ "$RCPT_OK" = yes ] && echo 0 || echo 1)"

# ================================================================ WINDOW 1: the rollback (revert-commit path)
stage="window 1"
echo "-- WINDOW 1: roll back to the previous release by the supported revert-commit path"
proxy maintenance || fail "maintenance did not start"
chk "maintenance on: the PUBLIC /health answers 503" "$([ "$(public_code)" = 503 ] && echo 0 || echo 1)"
echo "-- D6: a pending switch refuses the preflight"
EXSH mkdir -m 700 /var/data/cgn-w7-other || fail "could not make the D6 folder"
po=$(EXSH cgn-authorize --prepare /var/data/cgn-w7-other 2>&1) || fail "could not prepare D6: $po"
rec_state "D6: a switch pending"
backup B1 || fail "B1 failed"
B1_SHA=$BK_SHA; B1_ARCH=$BK_ARCH; r=$(ready "$cid") || fail "not back after B1: $r"
receive b1 "$B1_ARCH" "$B1_SHA"; [ "$RCPT_OK" = yes ] || fail "no RECEIPT_OK for B1"
B1_COPY=$RCPT_COPY
preflight b1 "$B1_SHA" no; d6=$?
chk "D6 with a switch pending (even with B1's receipt), the preflight refuses" "$([ "$d6" = 1 ] && printf '%s' "$PREFLIGHT" | grep -q 'pending_data_dir=/var/data/cgn-w7-other' && echo 0 || echo 1)" "$PREFLIGHT"
ab=$(EXSH cgn-authorize --abort /var/data/cgn-w7-other 2>&1); abrc=$?; EXSH rmdir /var/data/cgn-w7-other
rec_state "D6 aborted"
chk "D6 the switch aborted from the instance serving the approved folder; nothing pending" "$([ "$abrc" = 0 ] && grep -q "pending_data_dir=none serving=$ORIG\$" "$PRIV/last-status" && echo 0 || echo 1)" "$ab"
echo "-- the window's backup W, now that the record is as required (B1, taken while the switch was pending, is kept only as a mismatched receipt)"
backup W || fail "W failed"
W_SHA=$BK_SHA; W_ARCH=$BK_ARCH; r=$(ready "$cid") || fail "not back after W: $r"
echo "-- D1/D2: a missing or mismatched receipt refuses the preflight"
preflight w "$W_SHA" no; d1=$?
chk "D1 with no receipt yet for the window's backup, the preflight refuses" "$([ "$d1" = 1 ] && printf '%s' "$PREFLIGHT" | grep -q 'no receipt for this window' && echo 0 || echo 1)" "$PREFLIGHT"
receive w-changed "$W_ARCH" "$W_SHA" flip
preflight w-changed "$W_SHA" no; d2a=$?
chk "D2a a changed fetched copy: RECEIPT_FAILED, no receipt record, the preflight refuses" "$([ "$RCPT_OK" = no ] && [ "$d2a" = 1 ] && echo 0 || echo 1)" "$PREFLIGHT"
preflight b0 "$W_SHA" no; d2b=$?
chk "D2b B0's receipt (an earlier backup) offered for this window's backup: the preflight refuses" "$([ "$d2b" = 1 ] && printf '%s' "$PREFLIGHT" | grep -q 'no receipt for this window' && echo 0 || echo 1)" "$PREFLIGHT"
preflight b1 "$W_SHA" no; d2c=$?
chk "D2c B1's receipt (taken earlier in this window, before the abort) offered for the window's backup: the preflight refuses" "$([ "$d2c" = 1 ] && echo 0 || echo 1)" "$PREFLIGHT"
receive w "$W_ARCH" "$W_SHA"
chk "the window's backup: BACKUP_OK, then the independent RECEIPT_OK on its fetched-back copy" "$([ "$RCPT_OK" = yes ] && echo 0 || echo 1)"
W_COPY=$RCPT_COPY

# ---------------------------------------------------------------- COMPAT: the previous release on a disposable copy
stage="compat"
echo "-- COMPAT: the previous release reads (and writes) a DISPOSABLE copy of the current state: the window's verified copy, on its own throwaway volume"
preflight w "$W_SHA" yes; d0=$?
chk "before the compatibility evidence exists, the preflight refuses" "$([ "$d0" = 1 ] && printf '%s' "$PREFLIGHT" | grep -q 'no compatibility evidence' && echo 0 || echo 1)" "$PREFLIGHT"
CVOL="w7-compat-$RUNID"; dk volume create --label "w7.owner=$RUNID" "$CVOL" >/dev/null 2>&1 || { CVOL=""; fail "no compat volume"; }
tar -C "$(dirname "$W_COPY")" -cf - "$(basename "$W_COPY")" | timeout 60 docker run --rm -i --label "w7.owner=$RUNID" -v "$CVOL:/var/data" --entrypoint sh "$PRED" -c "mkdir -p /var/data/staging && tar -C /var/data/staging -xf - --strip-components=1" || fail "could not upload the disposable copy"
cv=$(dt_in "$PRED" "$CVOL" verify --backup /var/data/staging); cvr=$?
cr=$(dt_in "$PRED" "$CVOL" restore --backup /var/data/staging --into /var/data/cgn-compat); crr=$?
cc=$(dt_in "$PRED" "$CVOL" check --data /var/data/cgn-compat); ccr=$?
printf '%s\n%s\n%s\n' "$(printf '%s' "$cv" | tail -1)" "$(printf '%s' "$cr" | tail -1)" "$(printf '%s' "$cc" | tail -1)" | sed 's/^/   [previous datatool] /'
chk "COMPAT the previous release's datatool: verify, restore into a new folder, check (as the service user), each exit 0" "$([ "$cvr" = 0 ] && [ "$crr" = 0 ] && [ "$ccr" = 0 ] && echo 0 || echo 1)" "$cvr/$crr/$ccr"
timeout 60 docker run --rm -i --label "w7.owner=$RUNID" -v "$CVOL:/var/data" --entrypoint cgn-authorize "$PRED" /var/data/cgn-compat "$ORIGIN" 1 < "$PRIV/code" >/dev/null 2>&1 || fail "could not authorize the disposable copy"
xc=$(start compat "$PRED" "$CVOL" /var/data/cgn-compat "$COMPAT") || fail "could not start the previous release on the disposable copy"
r=$(ready "$xc" "$COMPAT") || fail "the previous release never became ready on the disposable copy: $r"
xl=$(lines_of "$xc"); printf '%s\n' "$xl" | grep -E '^cgn-entrypoint|\[restore\]|NOT LOADED|quarantin' | sed 's/^/   [previous on the copy] /'
chk "COMPAT the previous release starts on the copy: /health on $(echo "$PREV_REV" | cut -c1-7), the room restored, nothing unloaded or quarantined" "$([ "$r" = "ok $PREV_REV" ] && printf '%s' "$xl" | grep -q '\[restore\] 1 room(s) restored, 0 not loaded (data: /var/data/cgn-compat)' && ! printf '%s' "$xl" | grep -qE 'NOT LOADED|quarantin' && echo 0 || echo 1)" "$r"
node "$CHK" ledger "$PRIV" "$W_COPY" "$PRIV/ledger-window.json" | sed 's/^/   /'
co=$(env W7_OWNER="$RUNID" timeout 120 node "$CHK" live "http://127.0.0.1:$COMPAT" "$PRIV" "$PRIV/ledger-window.json" compat 2>&1); corc=$?
printf '%s\n' "$co" | sed 's/^/   [previous on the copy] /'
chk "COMPAT on the copy, the previous release serves the seats, the approved entry, each answer's value and the completed ledger, and acknowledges a new action" "$corc"
graceful_stop "$xc"; gs=$?
copy_out "$xc" /var/data/cgn-compat "$PRIV/compat-out" || fail "could not copy the disposable folder out"
po=$(node "$CHK" persisted "$PRIV" "$PRIV/compat-out/cgn-compat" "$PRIV/ledger-window.json" compat 2>&1); porc=$?
printf '%s\n' "$po" | sed 's/^/   [persisted by the previous release] /'
rmo=$(remove_container "$xc") || fail "the compat container not removed: $rmo"
cn=$(dt_in "$CUR" "$CVOL" check --data /var/data/cgn-compat); cnr=$?
printf '%s\n' "$(printf '%s' "$cn" | tail -1)" | sed 's/^/   [current datatool on the folder the previous release wrote] /'
chk "COMPAT what the previous release wrote: stopped gracefully, persisted (ledger kept, action persisted), and the CURRENT release's datatool check accepts it" "$([ "$gs" = 0 ] && [ "$porc" = 0 ] && [ "$cnr" = 0 ] && echo 0 || echo 1)" "stop $gs, persisted $porc, check $cnr"
rv=$(remove_volume "$CVOL") && CVOL="" || fail "the compat volume not removed: $rv"
COMPAT_OK=$([ "$cvr$crr$ccr$corc$gs$porc$cnr" = 0000000 ] && echo yes || echo no)
chk "COMPAT_OK: the previous release can safely read the current format, and the current release reads what it writes (the disposable volume removed)" "$([ "$COMPAT_OK" = yes ] && echo 0 || echo 1)"
[ "$COMPAT_OK" = yes ] || fail "BLOCKER: the previous release can't safely read the current format; no rollback"

# ---------------------------------------------------------------- the switch to the previous release
stage="rollback"
preflight w "$W_SHA" yes; pf=$?
chk "the rollback preflight PASSES: maintenance on, the receipt for exactly the window's backup, compatibility evidence, the record approving $ORIG with nothing pending, served" "$pf" "$PREFLIGHT"
[ "$pf" = 0 ] || fail "the preflight refused"
echo "-- D5: an incorrect writer"
start_gate; d5a=$?
chk "D5a the start gate refuses while the current writer is still on the volume" "$([ "$d5a" = 1 ] && echo 0 || echo 1)"
x=$(start d5 "$PRED" "$VOL" "$ORIG" "net:$cid") || fail "could not create the D5 container"
xs=$(wait_exit "$x" 80); xl=$(lines_of "$x")
printf '%s\n' "$xl" | grep -E '^cgn-entrypoint|is using this data directory' | head -3 | sed 's/^/   [D5] /'
r=$(ready "$cid")
chk "D5b a second writer on the same instance (the previous release, in the instance's network namespace, same folder): the data lock refuses it (no server), and the current writer keeps serving" \
  "$([ "${xs%% *}" = exited ] && [ "${xs##* }" != 0 ] && printf '%s' "$xl" | grep -q 'is using this data directory' && ! printf '%s' "$xl" | grep -q 'Listening on' && [ "$r" = "ok $CUR_REV" ] && echo 0 || echo 1)" "$xs; $r"
rmo=$(remove_container "$x") || fail "the D5 container not removed: $rmo"
graceful_stop "$cid"; gs=$?; echo "   stop: $STOP_STATE"
chk "the current writer stopped gracefully (exit 0)" "$gs"
fingerprint "$cid" "$ORIG" "$PRIV/fp-stop1" || fail "no fingerprint"
node "$FPC" fingerprint "$W_COPY" | grep -v '  manifest.json$' > "$PRIV/fp-window-copy"
chk "the window's backup is exactly the data at the stop (every file, the manifest aside)" "$(cmp -s "$PRIV/fp-stop1" "$PRIV/fp-window-copy" && echo 0 || echo 1)" "$(wc -l < "$PRIV/fp-stop1") file(s)"
copy_out "$cid" "$ORIG" "$PRIV/stop1" || fail "could not copy the folder out"
node "$CHK" ledger "$PRIV" "$PRIV/stop1/$(basename "$ORIG")" "$PRIV/ledger-stop1.json" | sed 's/^/   /'
rmo=$(remove_container "$cid") || fail "the current container not removed: $rmo"; cid=""
start_gate; sg=$?
chk "one writer: the old container removed and confirmed gone; no container on the volume before the start" "$sg"
switch_to previous "$PRED" "$PREV_REV"
rec_state "the previous release started"
echo "-- D4: the reopen gate refuses a wrong served revision"
reopen_gate "$cid" "$CUR_REV" "$ORIG"; d4=$?
chk "D4 expecting the reviewed revision while the previous one serves: the reopen gate refuses, the PUBLIC side stays 503" "$([ "$d4" = 1 ] && [ "$(public_code)" = 503 ] && echo 0 || echo 1)"
reopen_gate "$cid" "$PREV_REV" "$ORIG"; rg=$?
chk "the reopen gate: the private probe UP on the expected PREVIOUS revision, the approved folder served, nothing pending; the ingress reopens (PUBLIC 200)" "$([ "$rg" = 0 ] && [ "$(public_code)" = 200 ] && echo 0 || echo 1)"
lo=$(env W7_OWNER="$RUNID" NODE_EXTRA_CA_CERTS="$PRIV/cert.pem" timeout 120 node "$CHK" live "https://localhost:$PUBS" "$PRIV" "$PRIV/ledger-stop1.json" rolled 2>&1); lrc=$?
printf '%s\n' "$lo" | sed 's/^/   [through the reopened ingress] /'
chk "after the rollback, through the ingress: the original host and guest seats, the completed score ledger, the approved entry, each answer's value, a NEW action acknowledged once" "$lrc"
oc=$(curl -s -o /dev/null -D - --max-time 5 --cacert "$PRIV/cert.pem" -X POST --data-urlencode "code@$PRIV/old-code" --data next=/ "https://localhost:$PUBS/beta/enter" | tr -d '\r')
chk "an OLD (rotated) code does not open the gate (401, no gate cookie)" "$(printf '%s' "$oc" | head -1 | grep -q ' 401' && ! printf '%s' "$oc" | grep -qi '^set-cookie: cgn_beta=' && echo 0 || echo 1)" "$(printf '%s' "$oc" | head -1)"

# ================================================================ WINDOW 2: the return to the reviewed release
stage="window 2"
echo "-- WINDOW 2: return to the reviewed release"
proxy maintenance || fail "maintenance did not come back"
backup B2 || fail "B2 failed"
B2_SHA=$BK_SHA; r=$(ready "$cid") || fail "not back after B2: $r"
receive b2 "$BK_ARCH" "$B2_SHA"
preflight b2 "$B2_SHA" no; pf=$?
chk "B2 (on the previous release, of the CURRENT data): BACKUP_OK, RECEIPT_OK, and the preflight passes" "$([ "$RCPT_OK" = yes ] && [ "$pf" = 0 ] && echo 0 || echo 1)" "$PREFLIGHT"
graceful_stop "$cid"; gs=$?
copy_out "$cid" "$ORIG" "$PRIV/stop2" || fail "could not copy the folder out"
po=$(node "$CHK" persisted "$PRIV" "$PRIV/stop2/$(basename "$ORIG")" "$PRIV/ledger-stop1.json" rolled 2>&1); porc=$?
printf '%s\n' "$po" | sed 's/^/   /'
chk "the previous release stopped gracefully; the AUTHORITATIVE persisted state: the completed ledger kept, no score or finish added, the new action persisted with its value, the approved entry" "$([ "$gs" = 0 ] && [ "$porc" = 0 ] && echo 0 || echo 1)"
nc=0; for m in drop-action changed-ledger lost-event; do
  o=$(node "$CHK" persisted "$PRIV" "$PRIV/stop2/$(basename "$ORIG")" "$PRIV/ledger-stop1.json" rolled "$m" 2>&1); orc=$?
  echo "   [negative control $m] exit $orc: $(printf '%s\n' "$o" | grep '^FAIL ' | head -1 | cut -c1-140)"
  [ "$orc" = 1 ] || nc=1
done
chk "the persisted check's OWN negative controls: a dropped action, changed points and a lost score event each make it FAIL" "$nc"
rmo=$(remove_container "$cid") || fail "not removed: $rmo"; cid=""
start_gate || fail "a container is still on the volume"
switch_to current "$CUR" "$CUR_REV"
rec_state "the return to the reviewed release"
reopen_gate "$cid" "$CUR_REV" "$ORIG"; rg=$?
lo=$(env W7_OWNER="$RUNID" NODE_EXTRA_CA_CERTS="$PRIV/cert.pem" timeout 120 node "$CHK" live "https://localhost:$PUBS" "$PRIV" "$PRIV/ledger-stop1.json" returned 2>&1); lrc=$?
printf '%s\n' "$lo" | sed 's/^/   [through the reopened ingress] /'
chk "the return: the reopen gate passes on the reviewed revision; the seats, the completed ledger, the entry, and the action written by the previous release are served" "$([ "$rg" = 0 ] && [ "$lrc" = 0 ] && echo 0 || echo 1)"

# ================================================================ WINDOW 3: the one-click rollback, modelled; a failed start
stage="window 3"
echo "-- WINDOW 3: the provider one-click rollback, modelled as the previous image with STALE environment values against the preserved disk record"
proxy maintenance || fail "maintenance did not come back"
backup B3 || fail "B3 failed"
B3_SHA=$BK_SHA; r=$(ready "$cid") || fail "not back after B3: $r"
receive b3 "$BK_ARCH" "$B3_SHA"
preflight b3 "$B3_SHA" no; pf=$?
chk "B3: BACKUP_OK, RECEIPT_OK, and the preflight passes" "$([ "$RCPT_OK" = yes ] && [ "$pf" = 0 ] && echo 0 || echo 1)" "$PREFLIGHT"
graceful_stop "$cid" || fail "the current writer did not stop gracefully: $STOP_STATE"
rmo=$(remove_container "$cid") || fail "not removed: $rmo"; cid=""
disk_state "$PRIV/disk3" || fail "could not read the disk state"
cp "$PRIV/disk3.fp" "$EVD/fingerprint-before-one-click.txt"
s_case() {   # s_case <name> <expected REFUSED text> <data> <origin> <hops> <code env>
  local x xs xl
  x=$(start "$1" "$PRED" "$VOL" "$3" "$BACK" "$4" "$5" "$6") || { echo "   [$1] docker run failed"; return 1; }
  xs=$(wait_exit "$x" 60); xl=$(lines_of "$x")
  echo "   [$1] $xs: $(printf '%s' "$xl" | grep 'REFUSED' | head -1)"
  remove_container "$x" >/dev/null || return 1
  [ "$xs" = "exited 78" ] && printf '%s' "$xl" | grep -qF "cgn-entrypoint: REFUSED: $2" && ! printf '%s' "$xl" | grep -qE 'Listening on|\[restore\]'
}
s_case s1-old-folder "MCHEZO_DATA_DIR is not the authorized data folder" /var/data/cgn-validation "$ORIGIN" 1 "$PRIV/code.env"
chk "S1 an OLD data folder (the validation folder): refused (78) before any server" $?
s_case s2-old-code "the access code is not the authorized one" "$ORIG" "$ORIGIN" 1 "$PRIV/old-code.env"
chk "S2 an OLD (rotated) access code: refused (78)" $?
s_case s3-old-origin "MCHEZO_PUBLIC_ORIGIN is not the authorized origin" "$ORIG" "https://old-name.example.invalid" 1 "$PRIV/code.env"
chk "S3 an OLD public origin: refused (78)" $?
s_case s4-old-hops "MCHEZO_TRUST_PROXY is not the authorized proxy count" "$ORIG" "$ORIGIN" 2 "$PRIV/code.env"
chk "S4 an OLD proxy count: refused (78)" $?
s_case s5-all-old "MCHEZO_DATA_DIR is not the authorized data folder" /var/data/cgn-validation "https://old-name.example.invalid" 2 "$PRIV/old-code.env"
chk "S5 every old value at once (a one-click rollback across a configuration change): refused (78)" $?
disk_state "$PRIV/disk3b" || fail "could not read the disk state"
chk "after S1-S5: the disk record byte-identical, the data folder's files unchanged, maintenance kept closed (PUBLIC 503)" "$(cmp -s "$PRIV/disk3.rec" "$PRIV/disk3b.rec" && cmp -s "$PRIV/disk3.fp" "$PRIV/disk3b.fp" && [ "$(public_code)" = 503 ] && echo 0 || echo 1)"
echo "-- F: a FAILED start of the previous release (killed during start), then the safe recovery"
start_gate || fail "a container is still on the volume"
x=$(start f-killed "$PRED" "$VOL" "$ORIG") || fail "could not create the F container"
for _ in $(seq 1 80); do dk logs "$x" 2>&1 | grep -q 'cgn-entrypoint: the environment matches' && break; sleep 0.1; done
dk kill -s KILL "$x" >/dev/null 2>&1
xs=$(wait_exit "$x" 40)
echo "   [F] $xs; what it reached before the kill: $(lines_of "$x" | grep -E '^cgn-entrypoint|\[restore\]|Listening on' | tr '\n' ' ' | cut -c1-300)"
rmo=$(remove_container "$x") || fail "the F container not removed: $rmo"
disk_state "$PRIV/disk3c" || fail "could not read the disk state"
chk "F the killed start: exited 137; the record byte-identical, the folder's files unchanged, maintenance kept closed" "$([ "$xs" = "exited 137" ] && cmp -s "$PRIV/disk3.rec" "$PRIV/disk3c.rec" && cmp -s "$PRIV/disk3.fp" "$PRIV/disk3c.fp" && [ "$(public_code)" = 503 ] && echo 0 || echo 1)" "$xs"
start_gate || fail "a container is still on the volume"
switch_to recovery "$CUR" "$CUR_REV"
rec_state "the recovery (an ordinary start of the reviewed release)"
reopen_gate "$cid" "$CUR_REV" "$ORIG"; rg=$?
lo=$(env W7_OWNER="$RUNID" NODE_EXTRA_CA_CERTS="$PRIV/cert.pem" timeout 120 node "$CHK" live "https://localhost:$PUBS" "$PRIV" "$PRIV/ledger-stop1.json" recovered 2>&1); lrc=$?
printf '%s\n' "$lo" | sed 's/^/   [through the reopened ingress] /'
chk "the recovery is an ORDINARY start of the reviewed release with the current environment: the reopen gate passes, and the seats, ledger, entry and action are served" "$([ "$rg" = 0 ] && [ "$lrc" = 0 ] && echo 0 || echo 1)"
cp "$PRIV/record-states.txt" "$EVD/record-states.txt"

stage="end"
u=$(volume_users "$VOL") || u="unreadable"
chk "at the end: exactly one container on the volume (no competing writer)" "$([ "$u" = "$cid" ] && echo 0 || echo 1)"
printf '{"run":"%s","current":{"image":"%s","revision":"%s"},"previous":{"image":"%s","revision":"%s","surrogate":true},"window_backup":"%s","b2":"%s","b3":"%s","passed":%s,"failed":%s}\n' \
  "$RUNID" "$CUR" "$CUR_REV" "$PRED" "$PREV_REV" "$W_SHA" "$B2_SHA" "$B3_SHA" "$npass" "$nfail" > "$EVD/summary.json"
[ "$nfail" = 0 ] && rc=0
[ "$rc" = 0 ] || exit 1
exit 0
