#!/bin/bash
# Beta R4 W5 (handoff 6937786587): the LOCAL rehearsal of the W5 backup-and-independent-receipt chain, bounded and
# self-cleaning. It is preparation only: nothing here is Render, SSH, cloud storage, or the owner's keys.
#
#   SOURCE     the packaged pinned image (deploy/render, runtime 7097ac2) in production mode on a THROWAWAY Docker volume
#              owned by this run, with a throwaway access code and a DISPOSABLE test age key pair; synthetic state seeded
#              by scripts/beta/w5-seed.mjs (a room, a finished game, an APPROVED Memory Book entry "W5 seed", acknowledged
#              answers); then the reviewed cgn-backup, UNCHANGED, run inside the container as from an SSH session with no
#              service environment (`docker exec ... env -i ... cgn-backup`). Its BACKUP_OK line is captured from that
#              session's output: the expected SHA-256 comes ONLY from it (the control channel), never from a downloaded
#              archive. A monitor polls /health throughout, to measure the stop from outside.
#   RESUME     the original service comes back by itself (a new server pid, the pinned revision), the same seats work
#              without rejoining, the approved entry is there, and a NEW answer is acknowledged.
#   CHAIN      transport -> upload -> fetch back -> receipt -> promotion, every stage only after the previous succeeded
#              (otherwise "not run"); nothing ever overwrites an existing file (a refusal instead):
#                transport  LOCAL SURROGATE for `scp -s` to the owner's receiving device: `docker cp` out of the run's
#                           container into a run-owned "surrogate-device" folder. It does NOT prove SSH transport.
#                upload     LOCAL SURROGATE for the owner's private off-provider storage: a copy into a run-owned
#                           "surrogate-storage" folder. It does NOT prove a cloud upload.
#                fetch      the copy fetched BACK from that storage into a separate run-owned "fetched" folder.
#                receipt    deploy/render/operator/cgn-receive.sh, UNCHANGED, on the FETCHED-BACK archive (never the
#                           source or device copy), with the BACKUP_OK hash and the test identity, into an empty private
#                           work folder. RECEIPT_OK required.
#                promotion  a receipt record written ONLY after RECEIPT_OK (a stand-in for "this copy may be relied on").
#              Then the received copy is checked (w5-seed.mjs check-copy): stopped-server manifest, the room, the approved
#              entry linked to its game, the three pre-backup acknowledged answers, and NOT the post-backup one.
#   NEGATIVES  the same chain with one fault each: a wrong expected hash; changed bytes and truncated bytes in the
#              fetched copy; the wrong key; a missing transfer (no such archive on the source); a missing download (the
#              stored object gone); a non-empty receiving work folder; an occupied fetch destination. Each must stop
#              non-zero at the expected stage with no RECEIPT_OK, no receipt record, no later stage, every pre-existing
#              file unchanged, and the source archive unchanged.
#
# Isolation follows the reviewed W4 rules (scripts/beta/w4-control.sh, reviews 6935165862 and 6935889459): a run id;
# containers and volumes named for it and labelled w5.owner=<run id>; only what this run created is removed, after its
# label reads back, and confirmed gone; a port preflight; every startup step checked; processes it starts carry
# W5_OWNER=<run id>; the code, keys, session material and every decrypted copy live in a private mode-700 directory
# removed on exit; cleanup on exit, INT and TERM, twice; an inventory docker cannot give is UNVERIFIED and FAILS the run.
# The data volume is only ever mounted by the one service container (no second writer). The run folder (surrogates
# holding only ENCRYPTED archives, and the evidence) is kept.
#
#   bash scripts/beta/w5-rehearsal.sh <image tag> [work dir]
#
# Needs: docker, node 22, age and age-keygen (the receiving side), curl, sha256sum. Port 18580.
# Exit: 0 "W5 REHEARSAL PASSED"; otherwise "W5 REHEARSAL FAILED" with 1, or 130/143 when interrupted.
set -uo pipefail
IMG=${1:-}
[ -n "$IMG" ] || { echo "usage: bash scripts/beta/w5-rehearsal.sh <image tag> [work dir]" >&2; exit 2; }
WK_ARG=${2:-}
PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
EXPECT=${W5_EXPECTED_REVISION:-$PIN}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BACK=18580; ORIGIN="https://localhost:18543"
RUNID=$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
if [ -n "$WK_ARG" ]; then mkdir -p "$WK_ARG" || exit 1; WK=$(cd "$WK_ARG" && pwd); else WK=$(mktemp -d); fi
RUN="$WK/w5-$RUNID"; EVD="$RUN/evidence"
RECEIVE_SH="$ROOT/deploy/render/operator/cgn-receive.sh"
W5_DOCKER_SECONDS=${W5_DOCKER_SECONDS:-30}
cid=""; VOL=""; PRIV=""; privpath=""; CODE=""; LEAKS=""; mon_pid=""; started=0; rc=1; finished=0; cleanups=0; stage="setup"
npass=0; nfail=0; ARCHIVE=""; EXPECTED_SHA=""; BACKUP_LINE=""; SRC_SHA=""

chk() { if [ "$2" = 0 ]; then echo "PASS $1"; npass=$((npass + 1)); else echo "FAIL $1${3:+ — $3}"; nfail=$((nfail + 1)); fi; }
fail() { echo "   FAILED at $stage: $*"; nfail=$((nfail + 1)); rc=1; exit 1; }
dk() { timeout "$W5_DOCKER_SECONDS" docker "$@"; }
label_of() { dk inspect -f '{{index .Config.Labels "w5.owner"}}' "$1" 2>/dev/null; }
vol_label_of() { dk volume inspect -f '{{index .Labels "w5.owner"}}' "$1" 2>/dev/null; }
volume_users() { local out; out=$(dk ps -aq --no-trunc --filter "volume=$1") || return 1; printf '%s\n' "$out" | sed '/^$/d' | sort; }
container_gone() { local out; out=$(dk ps -aq --no-trunc --filter "id=$1") || return 2; [ -z "$out" ]; }
redact() { sed -e "s#$WK#<work>#g" -e "s#${PRIV:-/nonexistent-private}#<private>#g"; }

# ---------------------------------------------------------------- lifecycle (the W4 rules, with this run's label)
remove_container() {
  local id=$1 l g
  l=$(label_of "$id")
  [ "$l" = "$RUNID" ] || { echo "container ${id:0:12} not removed (label '${l:-unreadable}')"; return 1; }
  dk rm -f -v "$id" >/dev/null 2>&1 || { echo "container ${id:0:12} (REMOVAL FAILED)"; return 1; }
  container_gone "$id"; g=$?
  [ "$g" = 0 ] || { echo "container ${id:0:12} (REMOVAL NOT CONFIRMED)"; return 1; }
  echo "container ${id:0:12}"
}
count_owned() {
  local out
  case "$1" in
    containers) out=$(dk ps -aq --no-trunc --filter "label=w5.owner=$RUNID" 2>/dev/null) || return 1 ;;
    volumes) out=$(dk volume ls -q --filter "label=w5.owner=$RUNID" 2>/dev/null) || return 1 ;;
    *) return 1 ;;
  esac
  printf '%s\n' "$out" | sed '/^$/d' | wc -l | tr -d ' '
}
listeners() {
  awk -v want=" $BACK " 'FNR > 1 && $4 == "0A" { n = split($2, a, ":"); p = 0; h = toupper(a[n]);
    for (i = 1; i <= length(h); i++) p = p * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1;
    if (index(want, " " p " ")) c++ } END { print c + 0 }' $(ls /proc/net/tcp /proc/net/tcp6 2>/dev/null)
}
owned_pids() {
  local f p
  for f in /proc/[0-9]*/environ; do
    p=${f#/proc/}; p=${p%/environ}
    [ "$p" = "$$" ] && continue
    grep -qsaF "W5_OWNER=$RUNID" "$f" 2>/dev/null && echo "$p"
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
  if [ -n "$mon_pid" ]; then stop_pid "$mon_pid"; wait "$mon_pid" 2>/dev/null; mon_pid=""; did="$did monitor"; fi
  left=$(owned_pids)
  if [ -n "$left" ]; then for p in $left; do stop_pid "$p"; done; did="$did $(echo $left | wc -w)-more-owned-process(es)"; fi
  listed=$(dk ps -aq --no-trunc --filter "label=w5.owner=$RUNID" 2>/dev/null) || { listed=""; did="$did (docker could not list this run's containers)"; }
  for id in $cid $listed; do
    case " $did " in *" ${id:0:12}"*) continue ;; esac
    dk inspect "$id" >/dev/null 2>&1 || continue
    did="$did $(remove_container "$id")"
  done
  cid=""
  listed=$(dk volume ls -q --filter "label=w5.owner=$RUNID" 2>/dev/null) || { listed=""; did="$did (docker could not list this run's volumes)"; }
  for v in $VOL $listed; do
    case " $did " in *" volume $v"*) continue ;; esac
    dk volume inspect "$v" >/dev/null 2>&1 || continue
    if [ "$(vol_label_of "$v")" = "$RUNID" ]; then dk volume rm "$v" >/dev/null 2>&1 && did="$did volume $v" || did="$did volume $v (REMOVAL FAILED)"; fi
  done
  VOL=""
  if [ -n "$PRIV" ] && [ -d "$PRIV" ]; then rm -rf -- "$PRIV"; did="$did private-files(code,keys,sessions,decrypted-copies)"; fi
  PRIV=""
  echo "   cleanup #$cleanups:${did:- nothing owned left to remove}"
}
finish() {
  local code=$? left_c left_v left_p left_l leak=0 privleft
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
  echo "   this run's containers left: $left_c; volumes left: $left_v; processes left: $left_p; listeners left on $BACK: $left_l; private files left: $privleft"
  # Nothing private may be in the kept run folder: the access code, a session token, a gate cookie, an age secret key.
  if [ -d "$RUN" ]; then
    leak=$( { [ -n "$LEAKS" ] && grep -rlaF -f <(printf '%s\n' "$LEAKS" | sed '/^$/d') "$RUN" 2>/dev/null; grep -rlaE 'AGE-SECRET-KEY-|cgn_beta=[A-Za-z0-9_-]{8}' "$RUN" 2>/dev/null; } | sort -u | wc -l)
  fi
  echo "   files in the kept run folder holding the access code, a session token, a gate cookie or an age secret key: $leak"
  echo "   checks: $npass passed, $nfail failed"
  if [ "$code" = 0 ] && [ "$rc" = 0 ] && [ "$nfail" = 0 ] && [ "$npass" -gt 0 ] && [ "$left_c" = 0 ] && [ "$left_v" = 0 ] && [ "$left_p" = 0 ] && [ "$left_l" = 0 ] && [ "$privleft" = no ] && [ "$leak" = 0 ]; then
    echo "W5 REHEARSAL PASSED"; exit 0
  fi
  echo "W5 REHEARSAL FAILED"
  if [ "$code" -gt 1 ]; then exit "$code"; fi
  exit 1
}
trap finish EXIT
trap 'echo "   interrupted (SIGINT)"; rc=130; exit 130' INT
trap 'echo "   interrupted (SIGTERM)"; rc=143; exit 143' TERM

ready_check() {
  local ok="" health rev
  for _ in $(seq 1 120); do
    [ "$(dk inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" = true ] || break
    curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:$BACK/health" && { ok=1; break; }
    sleep 0.25
  done
  [ -n "$ok" ] || { echo "never ready (state: $(dk inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' "$cid" 2>/dev/null))"; return 1; }
  health=$(curl -sf --max-time 5 "http://127.0.0.1:$BACK/health") || { echo "/health stopped answering"; return 1; }
  rev=$(printf '%s' "$health" | grep -o '"revision":"[0-9a-f]*"' | head -1 | cut -d'"' -f4)
  [ "$rev" = "$EXPECT" ] || { echo "revision '${rev:-none}', not the expected $EXPECT"; return 1; }
  [ "$(label_of "$cid")" = "$RUNID" ] || { echo "the container does not carry this run's label"; return 1; }
  echo "ok $rev"
}
server_pid() { dk exec "$cid" cat /tmp/cgn/server.pid 2>/dev/null; }
src_sha() { dk exec "$cid" sha256sum -- "$1" 2>/dev/null | cut -d' ' -f1; }
# A file copy that never overwrites: refuses an existing destination, copies to a temporary name, then renames without
# clobbering. 0 copied (and identical); 1 no source; 2 the destination exists (refused); 3 the copy failed.
put_new() {
  local src=$1 dst=$2 part="$2.part-$RUNID"
  [ -f "$src" ] || return 1
  [ -e "$dst" ] && return 2
  cp -- "$src" "$part" 2>/dev/null || { rm -f -- "$part"; return 3; }
  mv -n -- "$part" "$dst" 2>/dev/null
  [ -e "$part" ] && { rm -f -- "$part"; return 2; }
  cmp -s -- "$src" "$dst" || return 3
}
sums_of() { (cd "$1" && find . -type f -name '*.keep' -exec sha256sum {} + 2>/dev/null | sort); }

# ---------------------------------------------------------------- the chain (positive and every negative)
# chain <case> [fault ...]   faults: src=<container path> hash=<hex> identity=<file> drop=storage mutate=flip|truncate
#                            occupy=fetched|work
# Sets CHAIN_STAGES (each stage: ok, FAILED(...), REFUSED(...), not-run), CHAIN_RECEIPT (yes|no), CHAIN_OUT (the
# receipt's own output), CHAIN_COPY (the verified copy, on RECEIPT_OK), CHAIN_KEEP_OK (pre-existing files unchanged).
chain() {
  local name=$1; shift
  local src=$ARCHIVE hash=$EXPECTED_SHA idf="$PRIV/test-identity.txt" drop="" mutate="" occupy="" kv f st r line
  for kv in "$@"; do case "$kv" in src=*) src=${kv#src=} ;; hash=*) hash=${kv#hash=} ;; identity=*) idf=${kv#identity=} ;; drop=*) drop=${kv#drop=} ;; mutate=*) mutate=${kv#mutate=} ;; occupy=*) occupy=${kv#occupy=} ;; esac; done
  local base="$RUN/chain-$name" work="$PRIV/receive-$name"
  local dev="$base/surrogate-device" sto="$base/surrogate-storage" fet="$base/fetched" rcpts="$base/receipts"
  mkdir -p "$dev" "$sto" "$fet" "$rcpts" "$work" || fail "could not create the chain folders for $name"
  f=$(basename "$src")
  for d in "$dev" "$sto" "$fet" "$rcpts"; do printf 'sentinel of %s, must survive unchanged\n' "$name" > "$d/SENTINEL.keep"; done
  [ "$occupy" = fetched ] && printf 'pre-existing file at the fetch destination; must not be overwritten\n' > "$fet/$f"
  [ "$occupy" = work ] && printf 'pre-existing file in the receiving work folder; must not be overwritten\n' > "$work/PRE-EXISTING.keep"
  local before_base before_work fetched_pre=""
  before_base=$(sums_of "$base"); before_work=$(sums_of "$work")
  [ "$occupy" = fetched ] && fetched_pre=$(sha256sum < "$fet/$f")
  CHAIN_STAGES=""; CHAIN_RECEIPT=no; CHAIN_OUT=""; CHAIN_COPY=""
  local go=1
  # 1. transport (LOCAL SURROGATE for scp -s): docker cp out of the run's container, to a temporary name, then renamed.
  if [ -e "$dev/$f" ]; then CHAIN_STAGES="transport=REFUSED(exists)"; go=0
  elif timeout 60 docker cp "$cid:$src" "$dev/.$f.part-$RUNID" >/dev/null 2>&1 && [ -s "$dev/.$f.part-$RUNID" ]; then
    mv -n -- "$dev/.$f.part-$RUNID" "$dev/$f"
    if [ -e "$dev/.$f.part-$RUNID" ]; then rm -f -- "$dev/.$f.part-$RUNID"; CHAIN_STAGES="transport=REFUSED(exists)"; go=0; else CHAIN_STAGES="transport=ok"; fi
  else rm -f -- "$dev/.$f.part-$RUNID"; CHAIN_STAGES="transport=FAILED(no such archive on the source, or the copy failed)"; go=0; fi
  # 2. upload (LOCAL SURROGATE for the owner's private storage).
  if [ "$go" = 1 ]; then
    put_new "$dev/$f" "$sto/$f"; r=$?
    case "$r" in 0) CHAIN_STAGES="$CHAIN_STAGES upload=ok" ;; 2) CHAIN_STAGES="$CHAIN_STAGES upload=REFUSED(exists)"; go=0 ;; *) CHAIN_STAGES="$CHAIN_STAGES upload=FAILED($r)"; go=0 ;; esac
    [ "$go" = 1 ] && [ "$drop" = storage ] && rm -f -- "$sto/$f"   # negative control: the stored object is gone
  else CHAIN_STAGES="$CHAIN_STAGES upload=not-run"; fi
  # 3. fetch back, into a separate folder.
  if [ "$go" = 1 ]; then
    put_new "$sto/$f" "$fet/$f"; r=$?
    case "$r" in 0) CHAIN_STAGES="$CHAIN_STAGES fetch=ok" ;; 1) CHAIN_STAGES="$CHAIN_STAGES fetch=FAILED(not in storage)"; go=0 ;; 2) CHAIN_STAGES="$CHAIN_STAGES fetch=REFUSED(destination exists)"; go=0 ;; *) CHAIN_STAGES="$CHAIN_STAGES fetch=FAILED($r)"; go=0 ;; esac
    if [ "$go" = 1 ] && [ "$mutate" = flip ]; then   # negative control: one byte changed in the fetched copy
      local sz off b; sz=$(stat -c %s "$fet/$f"); off=$((sz / 2)); b=$(od -An -tu1 -j "$off" -N1 "$fet/$f" | tr -d ' ')
      printf "$(printf '\\%03o' $(( (b + 1) % 256 )))" | dd of="$fet/$f" bs=1 seek="$off" conv=notrunc status=none
    fi
    [ "$go" = 1 ] && [ "$mutate" = truncate ] && truncate -s -16 "$fet/$f"   # negative control: the copy cut short
  else CHAIN_STAGES="$CHAIN_STAGES fetch=not-run"; fi
  # 4. the receipt, on the FETCHED-BACK archive only.
  if [ "$go" = 1 ]; then
    CHAIN_OUT=$(timeout 120 sh "$RECEIVE_SH" "$fet/$f" "$hash" "$idf" "$work" 2>&1); r=$?
    line=$(printf '%s\n' "$CHAIN_OUT" | grep -c '^RECEIPT_OK ')
    if [ "$r" = 0 ] && [ "$line" = 1 ] && printf '%s\n' "$CHAIN_OUT" | grep -q "^RECEIPT_OK $fet/$f "; then
      CHAIN_STAGES="$CHAIN_STAGES receipt=ok"; CHAIN_COPY=$(printf '%s\n' "$CHAIN_OUT" | sed -n 's/^RECEIPT_OK .* copy=//p')
    else CHAIN_STAGES="$CHAIN_STAGES receipt=FAILED(exit $r)"; go=0; fi
  else CHAIN_STAGES="$CHAIN_STAGES receipt=not-run"; fi
  # 5. promotion: a receipt record, written only after RECEIPT_OK, never over an existing one.
  if [ "$go" = 1 ]; then
    if [ -e "$rcpts/$f.receipt" ]; then CHAIN_STAGES="$CHAIN_STAGES promotion=REFUSED(exists)"
    else { printf '%s\n' "$BACKUP_LINE"; printf '%s\n' "$CHAIN_OUT" | grep '^RECEIPT_OK '; } | redact > "$rcpts/$f.receipt" && CHAIN_STAGES="$CHAIN_STAGES promotion=ok" && CHAIN_RECEIPT=yes; fi
  else CHAIN_STAGES="$CHAIN_STAGES promotion=not-run"; fi
  # Every pre-existing file is unchanged: the sentinels, and the occupied destination or work-folder file.
  CHAIN_KEEP_OK=1
  [ "$(sums_of "$base")" = "$before_base" ] || CHAIN_KEEP_OK=0
  [ "$(sums_of "$work")" = "$before_work" ] || [ "$occupy" != work ] || CHAIN_KEEP_OK=0
  [ -z "$fetched_pre" ] || [ "$(sha256sum < "$fet/$f")" = "$fetched_pre" ] || CHAIN_KEEP_OK=0
  echo "   [chain $name] $CHAIN_STAGES; receipt record written: $CHAIN_RECEIPT"
  [ -n "$CHAIN_OUT" ] && printf '%s\n' "$CHAIN_OUT" | redact | sed 's/^/      | /'
}

# ---------------------------------------------------------------- setup
echo "== w5-rehearsal $(date -u +%FT%TZ), run $RUNID, image $IMG"
echo "   scripts: w5-rehearsal.sh $(sha256sum "$0" | cut -c1-16), w5-seed.mjs $(sha256sum "$ROOT/scripts/beta/w5-seed.mjs" | cut -c1-16)"
stage="preflight"
for c in docker node age age-keygen curl sha256sum cmp truncate dd od; do command -v "$c" >/dev/null 2>&1 || fail "$c is not installed"; done
imgid=$(dk image inspect --format '{{.Id}}' "$IMG" 2>/dev/null) || fail "the image '$IMG' is not available locally"
echo "   image id: ${imgid:0:19}"
busy=$(listeners)
[ "$busy" = 0 ] || fail "$busy listener(s) already on $BACK; nothing was started"
mkdir -p "$EVD" || fail "could not create the run folder"
stage="private files"
PRIV=$(mktemp -d "${TMPDIR:-/tmp}/w5-private.XXXXXXXX") || fail "could not create a private directory"
privpath=$PRIV; chmod 700 "$PRIV" || fail "could not protect the private directory"
( umask 077; od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$PRIV/code" && printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$(cat "$PRIV/code")" > "$PRIV/code.env" ) || fail "could not write the throwaway code"
CODE=$(cat "$PRIV/code"); LEAKS=$CODE
( umask 077; age-keygen -o "$PRIV/test-identity.txt" 2>/dev/null && age-keygen -o "$PRIV/wrong-identity.txt" 2>/dev/null ) || fail "could not make the disposable test keys"
RECIP=$(age-keygen -y "$PRIV/test-identity.txt") || fail "could not read the test public key"
case "$RECIP" in age1*) ;; *) fail "the test public key is not an age1 key" ;; esac
echo "   throwaway access code and two DISPOSABLE test age identities (the receiving side's, and a wrong one) in a private directory (mode 700), removed on exit"
echo "   the test recipient (public, disposable): $RECIP"
stage="volume"
VOL="w5-data-$RUNID"
dk volume create --label "w5.owner=$RUNID" "$VOL" >/dev/null 2>&1 || { VOL=""; fail "could not create this run's data volume"; }
echo "   data volume $VOL (label w5.owner=$RUNID): throwaway data, removed on exit"
stage="container"
cid=$(timeout 60 docker run -d --name "w5-svc-$RUNID" --label "w5.owner=$RUNID" -p "127.0.0.1:$BACK:10000" -v "$VOL:/var/data" \
  -e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e "MCHEZO_PUBLIC_ORIGIN=$ORIGIN" -e MCHEZO_TRUST_PROXY=1 -e "CGN_BACKUP_RECIPIENT=$RECIP" \
  --env-file "$PRIV/code.env" "$IMG" 2>"$PRIV/docker-run.err") || { cid=$(dk ps -aq --no-trunc --filter "label=w5.owner=$RUNID" | head -1); fail "docker run failed: $(head -c 300 "$PRIV/docker-run.err" | tr '\n' ' ')"; }
started=1
echo "   container ${cid:0:12} (name w5-svc-$RUNID, label w5.owner=$RUNID)"
stage="readiness"
r=$(ready_check) || fail "$r"
chk "the service is ready and /health reports the pinned revision ${r#ok }" 0
stage="authorization"
auth=$(timeout 60 docker exec -i "$cid" cgn-authorize /var/data/cgn-w1 "$ORIGIN" 1 < "$PRIV/code" 2>&1) || fail "cgn-authorize failed: $(printf '%s' "$auth" | head -c 300 | tr '\n' ' ')"
printf '%s\n' "$auth" | grep -q '^AUTHORIZED ' || fail "cgn-authorize did not confirm"
echo "   authorized: $(printf '%s\n' "$auth" | grep '^AUTHORIZED ' | head -1 | cut -c1-120)"

stage="provenance"
repo_backup=$(sha256sum "$ROOT/deploy/render/cgn-backup.sh" | cut -d' ' -f1)
img_backup=$(dk exec "$cid" sha256sum /usr/local/bin/cgn-backup | cut -d' ' -f1)
repo_entry=$(sha256sum "$ROOT/deploy/render/cgn-entrypoint.sh" | cut -d' ' -f1)
img_entry=$(dk exec "$cid" sha256sum /usr/local/bin/cgn-entrypoint | cut -d' ' -f1)
repo_receive=$(sha256sum "$RECEIVE_SH" | cut -d' ' -f1)
img_age=$(dk exec "$cid" age --version 2>&1); host_age=$(age --version 2>&1)
echo "   cgn-backup: repository $repo_backup, in the image $img_backup"
echo "   cgn-entrypoint: repository $repo_entry, in the image $img_entry"
echo "   cgn-receive (run from the repository, unchanged): $repo_receive"
echo "   age: in the image $img_age (encrypts); on the receiving side $host_age (decrypts)"
chk "the image's cgn-backup is byte-identical to the reviewed deploy/render/cgn-backup.sh" "$([ "$repo_backup" = "$img_backup" ] && echo 0 || echo 1)"
chk "the image's cgn-entrypoint is byte-identical to the reviewed deploy/render/cgn-entrypoint.sh" "$([ "$repo_entry" = "$img_entry" ] && echo 0 || echo 1)"
printf '{"image":"%s","imageId":"%s","revision":"%s","cgnBackupSha256":"%s","cgnEntrypointSha256":"%s","cgnReceiveSha256":"%s","ageImage":"%s","ageReceiver":"%s"}\n' \
  "$IMG" "$imgid" "${r#ok }" "$img_backup" "$img_entry" "$repo_receive" "$img_age" "$host_age" > "$EVD/provenance.json"

# ---------------------------------------------------------------- seed
stage="seed"
echo "-- seed: synthetic room, a finished game, an APPROVED Memory Book entry, acknowledged answers (w5-seed.mjs)"
seed_out=$(env W5_OWNER="$RUNID" timeout 180 node "$ROOT/scripts/beta/w5-seed.mjs" seed "http://127.0.0.1:$BACK" "$PRIV" 2>&1); seedrc=$?
printf '%s\n' "$seed_out" | sed 's/^/   /'
[ "$seedrc" = 0 ] || fail "seeding failed (exit $seedrc)"
LEAKS=$(printf '%s\n%s\n%s\n' "$CODE" "$(node -e 'const s=require(process.argv[1]);console.log(s.secret.hostToken+"\n"+s.secret.guestToken)' "$PRIV/seed.json")")
printf '%s\n' "$seed_out" | grep '^SEED ' | sed 's/^SEED //' > "$EVD/seed.json"
chk "the synthetic state was seeded and every seeded write acknowledged" 0

# ---------------------------------------------------------------- source: the backup, as from an SSH session
stage="backup"
echo "-- SOURCE: the reviewed cgn-backup, unchanged, inside the container, with no service environment (as an SSH session)"
pid_before=$(server_pid) || fail "could not read the server pid"
users_before=$(volume_users "$VOL") || fail "docker could not list the data volume's users"
env W5_OWNER="$RUNID" bash -c 'while :; do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 0.5 "http://127.0.0.1:'"$BACK"'/health"); echo "$(date +%s%3N) $c"; sleep 0.1; done' > "$PRIV/monitor.txt" 2>/dev/null &
mon_pid=$!
sleep 0.5
t_b0=$(date +%s%3N)
bk=$(timeout 180 docker exec "$cid" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn cgn-backup 2>&1); brc=$?
t_b1=$(date +%s%3N)
printf '%s\n' "$bk" > "$EVD/backup-session.txt"
printf '%s\n' "$bk" | sed 's/^/   | /'
echo "   cgn-backup exit $brc after $((t_b1 - t_b0)) ms"
BACKUP_LINE=$(printf '%s\n' "$bk" | grep '^BACKUP_OK ')
nok=$(printf '%s\n' "$bk" | grep -c '^BACKUP_OK ')
chk "cgn-backup exited 0 with exactly one BACKUP_OK line" "$([ "$brc" = 0 ] && [ "$nok" = 1 ] && echo 0 || echo 1)" "exit $brc, $nok line(s)"
[ "$brc" = 0 ] && [ "$nok" = 1 ] || fail "no usable BACKUP_OK; nothing downstream runs"
ARCHIVE=$(printf '%s\n' "$BACKUP_LINE" | awk '{print $2}')
EXPECTED_SHA=$(printf '%s\n' "$BACKUP_LINE" | sed -n 's/.* sha256=\([0-9a-f]\{64\}\) .*/\1/p')
stopped_s=$(printf '%s\n' "$BACKUP_LINE" | sed -n 's/.* server_stopped_s=\([0-9]*\).*/\1/p')
[ -n "$ARCHIVE" ] && [ -n "$EXPECTED_SHA" ] || fail "the BACKUP_OK line could not be parsed"
printf '%s\n' "$EXPECTED_SHA" > "$EVD/expected-from-BACKUP_OK.sha256"
echo "   expected SHA-256, taken ONLY from the session's BACKUP_OK line (the control channel): $EXPECTED_SHA"
chk "the hold stopped the writer: cgn-backup stopped the server, copied under the data lock, and released the hold" \
  "$(printf '%s\n' "$bk" | grep -q '^cgn-backup: stopping the server (pid ' && printf '%s\n' "$bk" | grep -q '^cgn-backup: server stopped' && printf '%s\n' "$bk" | grep -q '^cgn-backup: hold released' && echo 0 || echo 1)"

# ---------------------------------------------------------------- resume: the original service comes back
stage="resume"
r=$(ready_check) || fail "the service did not come back after the backup: $r"
pid_after=$(server_pid) || fail "could not read the server pid after the backup"
sleep 1.5
stop_pid "$mon_pid"; wait "$mon_pid" 2>/dev/null; mon_pid=""
# From the start of the backup: the first refused /health, the last refused one, the samples; then the first 200 after
# the last refusal (the service back).
mon=$(awk -v t0="$t_b0" '$1 >= t0 { if ($2 != "200" && first == "") first = $1; if ($2 != "200") last = $1; n++ } END { printf "%s %s %d", (first == "" ? "-" : first), (last == "" ? "-" : last), n }' "$PRIV/monitor.txt")
read -r m_first m_last m_n <<< "$mon"
[ "$m_first" = - ] && m_first=""; [ "$m_last" = - ] && m_last=""
m_back=""; [ -n "$m_last" ] && m_back=$(awk -v l="$m_last" '$1 > l && $2 == "200" { print $1; exit }' "$PRIV/monitor.txt")
down_ms=""; [ -n "$m_first" ] && [ -n "$m_back" ] && down_ms=$((m_back - m_first))
echo "   server pid before $pid_before, after $pid_after; /health polled $m_n times from the start of the backup: unavailable from +$(( ${m_first:-$t_b0} - t_b0 )) ms to +$(( ${m_back:-$t_b0} - t_b0 )) ms (${down_ms:-?} ms); BACKUP_OK says server_stopped_s=$stopped_s"
chk "the writer was excluded during the copy: /health was refused while the server was stopped, and a NEW server process came back" \
  "$([ -n "$m_first" ] && [ -n "$down_ms" ] && [ -n "$pid_after" ] && [ "$pid_before" != "$pid_after" ] && echo 0 || echo 1)" "first failure ${m_first:-none}, back ${m_back:-never}, pids $pid_before -> $pid_after"
chk "the original service resumed on its own: ready, pinned revision ${r#ok }" 0
users_after=$(volume_users "$VOL") || users_after="unreadable"
chk "no second writer: the data volume's only user before and after is the one service container" "$([ "$users_before" = "$cid" ] && [ "$users_after" = "$cid" ] && echo 0 || echo 1)"
res_out=$(env W5_OWNER="$RUNID" timeout 120 node "$ROOT/scripts/beta/w5-seed.mjs" resume "http://127.0.0.1:$BACK" "$PRIV" 2>&1); rrc=$?
printf '%s\n' "$res_out" | sed 's/^/   /'
chk "after the backup: the same seats, the approved entry, and a new acknowledged answer (w5-seed.mjs resume)" "$rrc"
SRC_SHA=$(src_sha "$ARCHIVE")
chk "the source archive on the volume (the 'Render disk') hashes to the BACKUP_OK value" "$([ "$SRC_SHA" = "$EXPECTED_SHA" ] && echo 0 || echo 1)"
printf '{"backupExit":%s,"backupMs":%s,"serverStoppedS":%s,"healthUnavailableMs":%s,"healthSamples":%s,"pidChanged":%s}\n' "$brc" "$((t_b1 - t_b0))" "${stopped_s:-null}" "${down_ms:-null}" "${m_n:-0}" "$([ "$pid_before" != "$pid_after" ] && echo true || echo false)" > "$EVD/stop-timing.json"

# ---------------------------------------------------------------- the chain, positive
stage="chain"
echo "-- CHAIN (positive): transport [LOCAL SURROGATE for scp -s] -> upload [LOCAL SURROGATE storage] -> fetch back -> cgn-receive on the fetched copy -> promotion"
chain positive
chk "positive: every stage ran and passed, RECEIPT_OK on the FETCHED-BACK archive, and the receipt record was written" \
  "$([ "$CHAIN_STAGES" = "transport=ok upload=ok fetch=ok receipt=ok promotion=ok" ] && [ "$CHAIN_RECEIPT" = yes ] && echo 0 || echo 1)" "$CHAIN_STAGES"
chk "positive: every pre-existing file (the sentinels) is unchanged" "$([ "$CHAIN_KEEP_OK" = 1 ] && echo 0 || echo 1)"
pos_copy=$CHAIN_COPY
if [ -n "$pos_copy" ] && [ -d "$pos_copy" ]; then
  echo "-- the RECEIVED copy (decrypted from the fetched-back archive, in the private folder): w5-seed.mjs check-copy"
  cc_out=$(timeout 60 node "$ROOT/scripts/beta/w5-seed.mjs" check-copy "$PRIV" "$pos_copy" 2>&1); ccrc=$?
  printf '%s\n' "$cc_out" | sed 's/^/   /'
  chk "the received copy holds the acknowledged pre-backup state (room, approved entry linked to its game, three answers) and not the post-backup answer" "$ccrc"
  echo "-- the checker's own negatives: each on a damaged COPY of the received copy; check-copy must FAIL every time"
  for m in add-post-answer drop-pre-answer unapprove-entry; do
    rm -rf -- "$PRIV/cc-$m"; cp -r -- "$pos_copy" "$PRIV/cc-$m" || fail "could not copy the received copy for $m"
    mo=$(timeout 60 node "$ROOT/scripts/beta/w5-seed.mjs" mutate "$PRIV" "$PRIV/cc-$m" "$m" 2>&1); mrc=$?
    co=$(timeout 60 node "$ROOT/scripts/beta/w5-seed.mjs" check-copy "$PRIV" "$PRIV/cc-$m" 2>&1); crc=$?
    chk "checker negative $m: the damage was applied, and check-copy FAILS on it" "$([ "$mrc" = 0 ] && [ "$crc" != 0 ] && echo 0 || echo 1)" "$(printf '%s\n' "$mo" | tail -1); $(printf '%s\n' "$co" | grep '^FAIL' | head -2 | tr '\n' ';')"
  done
else
  chk "the received copy exists" 1 "no copy (the positive chain failed)"
fi
positive_stages=$CHAIN_STAGES

# ---------------------------------------------------------------- negatives: one fault each, same chain
echo "-- NEGATIVES: the same chain, one fault each; each must stop non-zero at the expected stage, with no RECEIPT_OK, no receipt record, no later stage, and every pre-existing file unchanged"
neg() {   # neg <case> <expected stages> <expected message (grep -E) or -> <fault...>
  local name=$1 want=$2 msg=$3; shift 3
  chain "$name" "$@"
  local okmsg=0
  [ "$msg" = - ] || printf '%s\n' "$CHAIN_OUT" | grep -qE "$msg" || okmsg=1
  chk "negative $name: stops as '$want', no RECEIPT_OK, no receipt record, pre-existing files unchanged" \
    "$([ "$CHAIN_STAGES" = "$want" ] && [ "$CHAIN_RECEIPT" = no ] && ! printf '%s\n' "$CHAIN_OUT" | grep -q '^RECEIPT_OK' && [ "$(find "$RUN/chain-$name/receipts" -type f ! -name '*.keep' | wc -l)" = 0 ] && [ "$CHAIN_KEEP_OK" = 1 ] && [ "$okmsg" = 0 ] && echo 0 || echo 1)" "$CHAIN_STAGES"
  printf '{"case":"%s","stages":"%s","receiptRecord":"%s","keptUnchanged":%s}\n' "$name" "$CHAIN_STAGES" "$CHAIN_RECEIPT" "$CHAIN_KEEP_OK" >> "$EVD/negatives.jsonl"
}
wrong=$(printf 'not the backup' | sha256sum | cut -d' ' -f1)
neg wrong-hash "transport=ok upload=ok fetch=ok receipt=FAILED(exit 1) promotion=not-run" "^RECEIPT_FAILED: the archive's SHA-256 is [0-9a-f]{64}, not the expected" "hash=$wrong"
neg changed-bytes "transport=ok upload=ok fetch=ok receipt=FAILED(exit 1) promotion=not-run" "^RECEIPT_FAILED: the archive's SHA-256 is" mutate=flip
neg truncated "transport=ok upload=ok fetch=ok receipt=FAILED(exit 1) promotion=not-run" "^RECEIPT_FAILED: the archive's SHA-256 is" mutate=truncate
neg wrong-key "transport=ok upload=ok fetch=ok receipt=FAILED(exit 1) promotion=not-run" "^RECEIPT_FAILED: decryption failed" "identity=$PRIV/wrong-identity.txt"
neg missing-transfer "transport=FAILED(no such archive on the source, or the copy failed) upload=not-run fetch=not-run receipt=not-run promotion=not-run" - "src=$ARCHIVE.missing"
neg missing-download "transport=ok upload=ok fetch=FAILED(not in storage) receipt=not-run promotion=not-run" - drop=storage
neg nonempty-work "transport=ok upload=ok fetch=ok receipt=FAILED(exit 1) promotion=not-run" "^RECEIPT_FAILED: the work folder .* is not empty" occupy=work
neg occupied-fetch "transport=ok upload=ok fetch=REFUSED(destination exists) receipt=not-run promotion=not-run" - occupy=fetched
SRC_SHA2=$(src_sha "$ARCHIVE")
chk "the source archive is unchanged after every chain (still the BACKUP_OK hash)" "$([ "$SRC_SHA2" = "$EXPECTED_SHA" ] && echo 0 || echo 1)"
r=$(ready_check) || r="FAILED: $r"
chk "the original service is still serving the pinned revision at the end" "$([ "${r%% *}" = ok ] && echo 0 || echo 1)" "$r"

printf '{"run":"%s","image":"%s","revision":"%s","archive":"%s","expectedSha256FromBackupOk":"%s","sourceArchiveSha256":"%s","positive":"%s","passed":%s,"failed":%s}\n' \
  "$RUNID" "$IMG" "$EXPECT" "$ARCHIVE" "$EXPECTED_SHA" "$SRC_SHA2" "$positive_stages" "$npass" "$nfail" > "$EVD/summary.json"
stage="cleanup"
[ "$nfail" = 0 ] && rc=0
[ "$rc" = 0 ] || exit 1
exit 0
