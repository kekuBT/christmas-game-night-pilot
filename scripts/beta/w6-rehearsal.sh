#!/bin/bash
# Beta R4 W6 (handoff 6938602366): the LOCAL rehearsal of a W6 restore, bounded and self-cleaning. Preparation only:
# nothing here is Render, SSH, cloud storage, a Render disk snapshot, or the owner's keys.
#
#   SOURCE      the packaged pinned image (runtime 7097ac2) in production mode on a THROWAWAY Docker volume owned by
#               this run (the "Render disk"), data folder /var/data/cgn-w1, behind a Render-like proxy that starts in
#               --maintenance (a LOCAL stand-in for the public side). Synthetic state from scripts/beta/w5-seed.mjs.
#   B1          the backup to restore: the reviewed cgn-backup, unchanged, from an SSH-like session; then the W5 chain
#               (transport and storage as LOCAL SURROGATES, fetch back) and the reviewed cgn-receive, unchanged, on the
#               fetched-back copy, with the hash from B1's BACKUP_OK line. Only after RECEIPT_OK is its decrypted copy
#               used. The receiving identity stays in the run's private folder (the receiving side).
#   later state an answer acknowledged after B1 (so the current data differs from B1).
#   B2          a FRESH same-window backup of the CURRENT data, with its own RECEIPT_OK: required before any switch.
#   UPLOAD      LOCAL SURROGATE for `scp -s` of the verified copy: a tar stream into the container as the service user,
#               into a new staging folder. Then, on the instance: datatool verify, datatool restore into a NEW folder
#               (/var/data/cgn-w6), datatool check as the service user.
#   CUTOVER     single writer: maintenance on; cgn-authorize the target (reviewed, unchanged); graceful stop (exit 0),
#               the original folder fingerprinted, the container removed and confirmed gone, no container on the
#               volume; a new container on the target; the entrypoint's "matches the authorized configuration"; the
#               private probe (render-w5.md's text) UP on the pinned revision; only then the ingress reopens. Then the
#               original seats, answers (exact values), ledger and approved entry; duplicate scoring refused; the original
#               folder's fingerprint unchanged while the target serves.
#   FALLBACK    the same cutover back to the retained original folder; its later state is served again.
#   NEGATIVES   N1 a changed fetched copy (no receipt) and a receipt for another backup: nothing is uploaded.
#               N2 an incomplete and a changed staged copy: datatool verify refuses; no restore, no target.
#               N3 an occupied target: datatool restore refuses; the file there unchanged.
#               N4 an authorization mismatch after the stop: exit 78, no server; recovery onto the original.
#               N5 a revision mismatch at the reopen gate: the ingress stays in maintenance.
#               N6 a start failure AFTER the target was authorized (a target that breaks after its check): the original
#                  is then refused too (the record names the target). Recovery needs a fresh cgn-authorize of the
#                  original from a live instance; here it is done by a LOCAL-ONLY one-off container, which Render does
#                  not offer. This is reported as a finding, not hidden.
# Isolation follows the reviewed W4/W5 rules (labels w6.owner=<run id>, removal only after the label reads back and
# confirmed gone, one container on the volume at a time, private material in a mode-700 folder removed on exit, cleanup
# twice, an unlistable inventory UNVERIFIED and FAILING the run). Ports 18680 (the service), 18643/18644 (the proxy).
#   bash scripts/beta/w6-rehearsal.sh <image tag> [work dir]
# Exit: 0 "W6 REHEARSAL PASSED"; otherwise "W6 REHEARSAL FAILED" with 1, or 130/143 when interrupted.
set -uo pipefail
IMG=${1:-}
[ -n "$IMG" ] || { echo "usage: bash scripts/beta/w6-rehearsal.sh <image tag> [work dir]" >&2; exit 2; }
WK_ARG=${2:-}
PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
EXPECT=${W6_EXPECTED_REVISION:-$PIN}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BACK=18680; PUBS=18643; PUBH=18644; ORIGIN="https://localhost:$PUBS"
ORIG=/var/data/cgn-w1; TARGET=/var/data/cgn-w6
RUNID=$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
if [ -n "$WK_ARG" ]; then mkdir -p "$WK_ARG" || exit 1; WK=$(cd "$WK_ARG" && pwd); else WK=$(mktemp -d); fi
RUN="$WK/w6-$RUNID"; EVD="$RUN/evidence"
RECEIVE_SH="$ROOT/deploy/render/operator/cgn-receive.sh"
SEED="$ROOT/scripts/beta/w5-seed.mjs"; CHK="$ROOT/scripts/beta/w6-check.mjs"
DK_S=${W6_DOCKER_SECONDS:-30}
cid=""; VOL=""; PRIV=""; privpath=""; CODE=""; LEAKS=""; proxy_pid=""; started=0; rc=1; finished=0; cleanups=0; stage="setup"
npass=0; nfail=0; nseq=0; STOP_STATE=""

chk() { if [ "$2" = 0 ]; then echo "PASS $1"; npass=$((npass + 1)); else echo "FAIL $1${3:+ — $3}"; nfail=$((nfail + 1)); fi; }
fail() { echo "   FAILED at $stage: $*"; nfail=$((nfail + 1)); rc=1; exit 1; }
dk() { timeout "$DK_S" docker "$@"; }
label_of() { dk inspect -f '{{index .Config.Labels "w6.owner"}}' "$1" 2>/dev/null; }
vol_label_of() { dk volume inspect -f '{{index .Labels "w6.owner"}}' "$1" 2>/dev/null; }
volume_users() { local out; out=$(dk ps -aq --no-trunc --filter "volume=$1") || return 1; printf '%s\n' "$out" | sed '/^$/d' | sort; }
container_gone() { local out; out=$(dk ps -aq --no-trunc --filter "id=$1") || return 2; [ -z "$out" ]; }
redact() { sed -e "s#$WK#<work>#g" -e "s#${PRIV:-/nonexistent-private}#<private>#g"; }
EXSH() { dk exec "$cid" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn "$@"; }   # an SSH-like session

# ---------------------------------------------------------------- lifecycle (the W4/W5 rules, label w6.owner)
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
    containers) out=$(dk ps -aq --no-trunc --filter "label=w6.owner=$RUNID" 2>/dev/null) || return 1 ;;
    volumes) out=$(dk volume ls -q --filter "label=w6.owner=$RUNID" 2>/dev/null) || return 1 ;;
    *) return 1 ;;
  esac
  printf '%s\n' "$out" | sed '/^$/d' | wc -l | tr -d ' '
}
listeners() {
  awk -v want=" $BACK $PUBS $PUBH " 'FNR > 1 && $4 == "0A" { n = split($2, a, ":"); p = 0; h = toupper(a[n]);
    for (i = 1; i <= length(h); i++) p = p * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1;
    if (index(want, " " p " ")) c++ } END { print c + 0 }' $(ls /proc/net/tcp /proc/net/tcp6 2>/dev/null)
}
owned_pids() {
  local f p
  for f in /proc/[0-9]*/environ; do
    p=${f#/proc/}; p=${p%/environ}
    [ "$p" = "$$" ] && continue
    grep -qsaF "W6_OWNER=$RUNID" "$f" 2>/dev/null && echo "$p"
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
  listed=$(dk ps -aq --no-trunc --filter "label=w6.owner=$RUNID" 2>/dev/null) || { listed=""; did="$did (docker could not list this run's containers)"; }
  for id in $cid $listed; do
    case " $did " in *" ${id:0:12}"*) continue ;; esac
    dk inspect "$id" >/dev/null 2>&1 || continue
    did="$did $(remove_container "$id")"
  done
  cid=""
  listed=$(dk volume ls -q --filter "label=w6.owner=$RUNID" 2>/dev/null) || { listed=""; did="$did (docker could not list this run's volumes)"; }
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
  echo "   this run's containers left: $left_c; volumes left: $left_v; processes left: $left_p; listeners left on $BACK/$PUBS/$PUBH: $left_l; private files left: $privleft"
  # the kept run folder, and this run's own output when it goes to a file (the log that becomes evidence)
  [ -d "$RUN" ] && scan+=("$RUN")
  out1=$(readlink -f "/proc/$$/fd/1" 2>/dev/null); if [ -n "$out1" ] && [ -f "$out1" ]; then scan+=("$out1"); where="$where and this run's own log"; fi
  if [ ${#scan[@]} -gt 0 ]; then
    leak=$( { [ -n "$LEAKS" ] && grep -rlaF -f <(printf '%s\n' "$LEAKS" | sed '/^$/d') "${scan[@]}" 2>/dev/null; grep -rlaE 'AGE-SECRET-KEY-|cgn_beta=[A-Za-z0-9_-]{8}' "${scan[@]}" 2>/dev/null; } | sort -u | wc -l)
  fi
  echo "   files ($where) holding the access code, a session token, a gate cookie or an age secret key: $leak"
  echo "   checks: $npass passed, $nfail failed"
  if [ "$code" = 0 ] && [ "$rc" = 0 ] && [ "$nfail" = 0 ] && [ "$npass" -gt 0 ] && [ "$left_c" = 0 ] && [ "$left_v" = 0 ] && [ "$left_p" = 0 ] && [ "$left_l" = 0 ] && [ "$privleft" = no ] && [ "$leak" = 0 ]; then
    echo "W6 REHEARSAL PASSED"; exit 0
  fi
  echo "W6 REHEARSAL FAILED"
  if [ "$code" -gt 1 ]; then exit "$code"; fi
  exit 1
}
trap finish EXIT
trap 'echo "   interrupted (SIGINT)"; rc=130; exit 130' INT
trap 'echo "   interrupted (SIGTERM)"; rc=143; exit 143' TERM

# ---------------------------------------------------------------- service, proxy, probe
svc() {   # svc <tag> <data dir>: one container of this run on the volume; prints its id (or nothing)
  timeout 60 docker run -d --name "w6-svc-$RUNID-$1" --label "w6.owner=$RUNID" -p "127.0.0.1:$BACK:10000" -v "$VOL:/var/data" \
    -e "MCHEZO_DATA_DIR=$2" -e "MCHEZO_PUBLIC_ORIGIN=$ORIGIN" -e MCHEZO_TRUST_PROXY=1 -e "CGN_BACKUP_RECIPIENT=$RECIP" \
    --env-file "$PRIV/code.env" "$IMG" 2>"$PRIV/docker-run.err"
}
ready() {   # ready <cid>: prints "ok <revision>" or a reason
  local ok="" rev
  for _ in $(seq 1 120); do
    [ "$(dk inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ] || break
    curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:$BACK/health" && { ok=1; break; }
    sleep 0.25
  done
  [ -n "$ok" ] || { echo "never ready (state: $(dk inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' "$1" 2>/dev/null))"; return 1; }
  rev=$(curl -sf --max-time 5 "http://127.0.0.1:$BACK/health" | grep -o '"revision":"[0-9a-f]*"' | head -1 | cut -d'"' -f4)
  echo "ok ${rev:-none}"
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
  env W6_OWNER="$RUNID" node "$ROOT/scripts/beta/render-like-proxy.mjs" --https-port $PUBS --http-port $PUBH --backend "127.0.0.1:$BACK" --cert "$PRIV/cert.pem" --key "$PRIV/key.pem" --hops 1 $m > "$PRIV/proxy.log" 2>&1 &
  proxy_pid=$!
  for _ in $(seq 1 40); do grep -q LISTENING "$PRIV/proxy.log" && return 0; kill -0 "$proxy_pid" 2>/dev/null || break; sleep 0.25; done
  return 1
}
public_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 --cacert "$PRIV/cert.pem" "https://localhost:$PUBS/health"; }
probe_in() {   # the runbook's private probe inside container $1 (placed there first)
  timeout 30 docker exec -i "$1" sh -c 'cat > /tmp/cgn-probe.mjs' < "$PRIV/cgn-probe.mjs" || return 1
  timeout 30 docker exec "$1" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn node /tmp/cgn-probe.mjs check 2>&1
}
# The reopen gate: the private probe must say UP on the expected revision; only then does the ingress leave maintenance.
reopen_gate() {   # reopen_gate <cid> <expected revision>: 0 reopened; 1 refused (the ingress stays in maintenance)
  local p; p=$(probe_in "$1") || true
  echo "   [reopen gate] private probe: $p; expected $2"
  printf '%s\n' "$p" | grep -q "^PROBE .* UP $2\$" || return 1
  proxy open
}
fingerprint() {   # fingerprint <cid> <dir> <out>: every file of a data folder, copied out (works on stopped containers too)
  local t="$PRIV/fp-$RANDOM$RANDOM"
  mkdir -p "$t" && timeout 60 docker cp "$1:$2" "$t/" >/dev/null 2>&1 || return 1
  node "$CHK" fingerprint "$t/$(basename "$2")" > "$3"; local r=$?
  rm -rf -- "$t"; return $r
}

# ---------------------------------------------------------------- the W5 chain (receive one backup)
# receive <name> <container archive path> <expected hash> [mutate]: transport (LOCAL SURROGATE for scp -s) -> storage
# (LOCAL SURROGATE) -> fetch back -> cgn-receive (reviewed, unchanged) on the fetched copy. Sets RCPT_OK (yes|no),
# RCPT_COPY, and writes the receipt record <run>/receipts/<name>.receipt (BACKUP hash + RECEIPT_OK line) only on success.
receive() {
  local name=$1 src=$2 hash=$3 mutate=${4:-} f base dev sto fet work out r
  f=$(basename "$src"); base="$RUN/chain-$name"; dev="$base/surrogate-device"; sto="$base/surrogate-storage"; fet="$base/fetched"; work="$PRIV/receive-$name"
  mkdir -p "$dev" "$sto" "$fet" "$work" "$RUN/receipts" || fail "could not create the chain folders"
  RCPT_OK=no; RCPT_COPY=""
  timeout 60 docker cp "$cid:$src" "$dev/$f" >/dev/null 2>&1 && [ -s "$dev/$f" ] || { echo "   [chain $name] transport FAILED"; return 1; }
  # never overwrite (an existing storage or fetched copy means a reused folder: refuse)
  [ ! -e "$sto/$f" ] && cp -- "$dev/$f" "$sto/$f" && [ ! -e "$fet/$f" ] && cp -- "$sto/$f" "$fet/$f" || { echo "   [chain $name] storage/fetch FAILED"; return 1; }
  [ "$mutate" = flip ] && printf 'X' | dd of="$fet/$f" bs=1 seek=$(( $(stat -c %s "$fet/$f") / 2 )) conv=notrunc status=none
  out=$(timeout 120 sh "$RECEIVE_SH" "$fet/$f" "$hash" "$PRIV/test-identity.txt" "$work" 2>&1); r=$?
  printf '%s\n' "$out" | redact | sed "s/^/   [chain $name] /"
  if [ "$r" = 0 ] && printf '%s\n' "$out" | grep -q "^RECEIPT_OK $fet/$f sha256=$hash "; then
    RCPT_OK=yes; RCPT_COPY=$(printf '%s\n' "$out" | sed -n 's/^RECEIPT_OK .* copy=//p')
    printf 'backup_sha256=%s\n%s\n' "$hash" "$(printf '%s\n' "$out" | grep '^RECEIPT_OK ' | redact)" > "$RUN/receipts/$name.receipt"
  fi
}
# The upload gate: a receipt record for EXACTLY this backup's hash, from this window. 0 allowed; 1 refused.
upload_gate() { [ -f "$RUN/receipts/$1.receipt" ] && grep -qx "backup_sha256=$2" "$RUN/receipts/$1.receipt" && grep -q "^RECEIPT_OK .* sha256=$2 " "$RUN/receipts/$1.receipt"; }
# upload <local copy dir> <staging path>: LOCAL SURROGATE for `scp -s` of the verified copy, as the service user, into a
# NEW staging folder (refused if it exists).
upload() {
  dk exec "$cid" test -e "$2" && { echo "staging $2 already exists"; return 1; }
  tar -C "$(dirname "$1")" -cf - "$(basename "$1")" | timeout 60 docker exec -i "$cid" sh -c "mkdir -p '$2' && tar -C '$2' -xf - --strip-components=1"
}
dt() { EXSH sh -c "cd /app && node dist/server/datatool.js $*" 2>&1; }

# ---------------------------------------------------------------- setup
echo "== w6-rehearsal $(date -u +%FT%TZ), run $RUNID, image $IMG"
echo "   scripts: w6-rehearsal.sh $(sha256sum "$0" | cut -c1-16), w6-check.mjs $(sha256sum "$CHK" | cut -c1-16), w5-seed.mjs $(sha256sum "$SEED" | cut -c1-16)"
stage="preflight"
for c in docker node age age-keygen curl sha256sum openssl tar; do command -v "$c" >/dev/null 2>&1 || fail "$c is not installed"; done
imgid=$(dk image inspect --format '{{.Id}}' "$IMG" 2>/dev/null) || fail "the image '$IMG' is not available locally"
busy=$(listeners); [ "$busy" = 0 ] || fail "$busy listener(s) already on $BACK/$PUBS/$PUBH; nothing was started"
mkdir -p "$EVD" || fail "could not create the run folder"
stage="private files"
PRIV=$(mktemp -d "${TMPDIR:-/tmp}/w6-private.XXXXXXXX") || fail "no private directory"; privpath=$PRIV; chmod 700 "$PRIV"
( umask 077; od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$PRIV/code" && printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$(cat "$PRIV/code")" > "$PRIV/code.env" ) || fail "no throwaway code"
CODE=$(cat "$PRIV/code"); LEAKS=$CODE
( umask 077; age-keygen -o "$PRIV/test-identity.txt" 2>/dev/null ) || fail "no disposable test key"
RECIP=$(age-keygen -y "$PRIV/test-identity.txt") || fail "no test recipient"
( umask 077; openssl req -x509 -newkey rsa:2048 -nodes -keyout "$PRIV/key.pem" -out "$PRIV/cert.pem" -days 1 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" >/dev/null 2>&1 ) || fail "no TLS certificate"
sed -n "/^cat > \/tmp\/cgn-probe.mjs <<'PROBE'\$/,/^PROBE\$/p" "$ROOT/docs/beta/render-w5.md" | sed '1d;$d' > "$PRIV/cgn-probe.mjs"
[ -s "$PRIV/cgn-probe.mjs" ] || fail "could not take the probe text from docs/beta/render-w5.md"
echo "   throwaway code, a DISPOSABLE test identity (receiving side), TLS key and the runbook's probe in a private folder (mode 700), removed on exit"
stage="volume"
VOL="w6-data-$RUNID"; dk volume create --label "w6.owner=$RUNID" "$VOL" >/dev/null 2>&1 || { VOL=""; fail "no data volume"; }
stage="service A"
cid=$(svc a "$ORIG") || { cid=$(dk ps -aq --no-trunc --filter "label=w6.owner=$RUNID" | head -1); fail "docker run failed: $(head -c 300 "$PRIV/docker-run.err" | tr '\n' ' ')"; }
started=1
r=$(ready "$cid") || fail "$r"
chk "service A ready on $ORIG, /health on the pinned revision" "$([ "$r" = "ok $EXPECT" ] && echo 0 || echo 1)" "$r"
auth=$(timeout 60 docker exec -i "$cid" cgn-authorize "$ORIG" "$ORIGIN" 1 < "$PRIV/code" 2>&1) || fail "cgn-authorize failed"
echo "   $(printf '%s\n' "$auth" | grep '^AUTHORIZED ')"
stage="maintenance"
proxy maintenance || fail "the maintenance proxy did not start"
chk "maintenance on: the PUBLIC /health answers 503" "$([ "$(public_code)" = 503 ] && echo 0 || echo 1)"
stage="provenance"
for f in cgn-backup cgn-entrypoint cgn-authorize; do
  a=$(sha256sum "$ROOT/deploy/render/$f.sh" | cut -d' ' -f1); b=$(dk exec "$cid" sha256sum "/usr/local/bin/$f" | cut -d' ' -f1)
  chk "the image's $f is byte-identical to the reviewed deploy/render/$f.sh" "$([ "$a" = "$b" ] && echo 0 || echo 1)" "$b"
done
dts=$(dk exec "$cid" sha256sum /app/dist/server/datatool.js | cut -d' ' -f1)
printf '{"image":"%s","imageId":"%s","datatoolSha256":"%s","cgnReceiveSha256":"%s"}\n' "$IMG" "$imgid" "$dts" "$(sha256sum "$RECEIVE_SH" | cut -d' ' -f1)" > "$EVD/provenance.json"
echo "   datatool (in the pinned image): $dts"

# ---------------------------------------------------------------- seed, B1, later state, B2
stage="seed"
so=$(env W6_OWNER="$RUNID" timeout 180 node "$SEED" seed "http://127.0.0.1:$BACK" "$PRIV" 2>&1) || { printf '%s\n' "$so"; fail "seeding failed"; }
printf '%s\n' "$so" | sed 's/^/   /'; printf '%s\n' "$so" | grep '^SEED ' | sed 's/^SEED //' > "$EVD/seed.json"
LEAKS=$(printf '%s\n%s\n' "$CODE" "$(node -e 'const s=require(process.argv[1]);console.log(s.secret.hostToken+"\n"+s.secret.guestToken)' "$PRIV/seed.json")")
stage="B1"
bk=$(timeout 180 docker exec "$cid" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn cgn-backup 2>&1); brc=$?
printf '%s\n' "$bk" | sed 's/^/   [B1] /'; printf '%s\n' "$bk" > "$EVD/B1-backup-session.txt"
B1_LINE=$(printf '%s\n' "$bk" | grep '^BACKUP_OK '); B1_ARCH=$(printf '%s\n' "$B1_LINE" | awk '{print $2}'); B1_SHA=$(printf '%s\n' "$B1_LINE" | sed -n 's/.* sha256=\([0-9a-f]\{64\}\) .*/\1/p')
chk "B1 (the backup to restore): cgn-backup exit 0, exactly one BACKUP_OK" "$([ "$brc" = 0 ] && [ "$(printf '%s\n' "$bk" | grep -c '^BACKUP_OK ')" = 1 ] && [ -n "$B1_SHA" ] && echo 0 || echo 1)"
[ -n "$B1_SHA" ] || fail "no B1"
r=$(ready "$cid") || fail "A did not come back after B1: $r"
stage="later state"
ro=$(env W6_OWNER="$RUNID" timeout 120 node "$SEED" resume "http://127.0.0.1:$BACK" "$PRIV" 2>&1); rrc=$?
printf '%s\n' "$ro" | sed 's/^/   /'
chk "the original service moved on after B1 (a new acknowledged answer): the current data differs from B1" "$rrc"
stage="B2"
bk2=$(timeout 180 docker exec "$cid" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn cgn-backup 2>&1); b2rc=$?
printf '%s\n' "$bk2" | sed 's/^/   [B2] /'; printf '%s\n' "$bk2" > "$EVD/B2-backup-session.txt"
B2_ARCH=$(printf '%s\n' "$bk2" | grep '^BACKUP_OK ' | awk '{print $2}'); B2_SHA=$(printf '%s\n' "$bk2" | grep '^BACKUP_OK ' | sed -n 's/.* sha256=\([0-9a-f]\{64\}\) .*/\1/p')
r=$(ready "$cid") || fail "A did not come back after B2: $r"
receive b2 "$B2_ARCH" "$B2_SHA"
chk "B2 (a FRESH same-window backup of the CURRENT data): BACKUP_OK, then RECEIPT_OK on its fetched-back copy" "$([ "$b2rc" = 0 ] && [ -n "$B2_SHA" ] && [ "$RCPT_OK" = yes ] && echo 0 || echo 1)"

# ---------------------------------------------------------------- receive B1; N1
stage="receive B1"
echo "-- N1: a receipt must exist for EXACTLY the backup being restored, or nothing is uploaded"
receive b1-changed "$B1_ARCH" "$B1_SHA" flip
upload_gate b1-changed "$B1_SHA"; g1=$?
chk "N1a a changed fetched copy: RECEIPT_FAILED, no receipt record, the upload gate refuses" "$([ "$RCPT_OK" = no ] && [ "$g1" = 1 ] && echo 0 || echo 1)"
upload_gate b2 "$B1_SHA"; g2=$?
chk "N1b B2's receipt offered for B1: the upload gate refuses (another backup's hash)" "$([ "$g2" = 1 ] && echo 0 || echo 1)"
chk "N1 nothing was uploaded by the refused cases (no staging folder)" "$(EXSH sh -c 'ls -d /var/data/w6-staging* 2>/dev/null' | grep -q . && echo 1 || echo 0)"
receive b1 "$B1_ARCH" "$B1_SHA"
chk "B1 received: RECEIPT_OK on its fetched-back copy, with the hash from B1's BACKUP_OK line" "$([ "$RCPT_OK" = yes ] && echo 0 || echo 1)"
B1_COPY=$RCPT_COPY
upload_gate b1 "$B1_SHA" || fail "the upload gate refused B1's own receipt"

# ---------------------------------------------------------------- N2, upload, verify, restore, check; N3
stage="restore"
echo "-- N2: an invalid or incomplete staged copy is refused by datatool verify; nothing is restored"
for bad in incomplete changed; do
  t="$PRIV/bad-$bad"; rm -rf "$t"; mkdir -p "$t"; cp -r "$B1_COPY" "$t/"; d="$t/$(basename "$B1_COPY")"
  victim=$(ls "$d" | grep -v '^manifest.json$' | grep '\.json$' | head -1)
  if [ "$bad" = incomplete ]; then rm -f "$d/$victim"; else printf ' ' >> "$d/$victim"; fi
  upload "$d" "/var/data/w6-staging-$bad" >/dev/null 2>&1 || fail "could not stage the $bad copy"
  vo=$(dt verify --backup "/var/data/w6-staging-$bad"); vrc=$?
  chk "N2 a(n) $bad staged copy: datatool verify refuses (exit $vrc), and no restore target exists" "$([ "$vrc" != 0 ] && ! EXSH test -e "$TARGET" && echo 0 || echo 1)" "$(printf '%s' "$vo" | tail -1 | cut -c1-120)"
done
upload "$B1_COPY" /var/data/w6-staging || fail "could not upload B1's verified copy"
ownr=$(EXSH sh -c 'find /var/data/w6-staging -not -user cgn | wc -l')
chk "the verified copy uploaded as the service user (LOCAL SURROGATE for scp -s): every file owned by cgn" "$([ "$ownr" = 0 ] && echo 0 || echo 1)" "$ownr not cgn"
vo=$(dt verify --backup /var/data/w6-staging); vrc=$?; printf '%s\n' "$vo" | tail -2 | sed 's/^/   [verify] /'
chk "datatool verify on the instance accepts the uploaded copy" "$vrc"
ro=$(dt restore --backup /var/data/w6-staging --into "$TARGET"); rrc=$?; printf '%s\n' "$ro" | tail -2 | sed 's/^/   [restore] /'
chk "datatool restore into a NEW folder ($TARGET), as the service user" "$rrc"
co=$(dt check --data "$TARGET"); crc=$?; printf '%s\n' "$co" | tail -2 | sed 's/^/   [check] /'
chk "datatool check on $TARGET, as the service user" "$crc"
own=$(EXSH sh -c "find '$TARGET' -not -user cgn | wc -l; stat -c %a '$TARGET'")
chk "the restored folder is the service user's and private (every file cgn, folder 700)" "$([ "$own" = "0
700" ] && echo 0 || echo 1)" "$(printf '%s' "$own" | tr '\n' ' ')"
rm -rf "$PRIV/restored-pre"; mkdir -p "$PRIV/restored-pre"; timeout 60 docker cp "$cid:$TARGET" "$PRIV/restored-pre/" >/dev/null 2>&1
rco=$(node "$CHK" restored "$PRIV" "$PRIV/restored-pre/$(basename "$TARGET")" "$B1_COPY" 2>&1); rcrc=$?; printf '%s\n' "$rco" | sed 's/^/   /'
chk "the restored folder holds B1's state exactly (files, ledger, answer values, approved entry; not the later answer)" "$rcrc"
echo "-- N3: an occupied target is refused; what is there stays"
EXSH sh -c 'mkdir -p /var/data/w6-occupied && echo keep > /var/data/w6-occupied/KEEP' || fail "could not prepare N3"
oo=$(dt restore --backup /var/data/w6-staging --into /var/data/w6-occupied); orc=$?
chk "N3 datatool restore into an occupied folder refuses (exit $orc), and its file is unchanged" "$([ "$orc" != 0 ] && [ "$(EXSH cat /var/data/w6-occupied/KEEP)" = keep ] && [ "$(EXSH ls /var/data/w6-occupied)" = KEEP ] && echo 0 || echo 1)" "$(printf '%s' "$oo" | tail -1 | cut -c1-120)"

# ---------------------------------------------------------------- N4: authorization mismatch after the stop
stage="N4"
echo "-- N4: a start on the target WITHOUT authorizing it: refused (exit 78); recovery onto the original"
graceful_stop "$cid" || fail "A did not stop gracefully: $STOP_STATE"
fingerprint "$cid" "$ORIG" "$PRIV/fp-orig-0" || fail "could not fingerprint the original"
rmo=$(remove_container "$cid") || fail "A not removed: $rmo"; cid=""
u=$(volume_users "$VOL") || fail "volume users unreadable"; [ -z "$u" ] || fail "the volume is still used"
x=$(svc n4 "$TARGET") || fail "could not create the N4 container"
xs=""; for _ in $(seq 1 40); do xs=$(dk inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$x" 2>/dev/null); [ "${xs%% *}" = exited ] && break; sleep 0.25; done
xl=$(dk logs "$x" 2>&1 | tail -c 1500)
chk "N4 the guard refuses the unauthorized target: exit 78, a REFUSED line, and no server started" "$([ "$xs" = "exited 78" ] && printf '%s' "$xl" | grep -q 'cgn-entrypoint: REFUSED: MCHEZO_DATA_DIR is not the authorized data folder' && ! printf '%s' "$xl" | grep -q 'Listening' && echo 0 || echo 1)" "$xs"
rmo=$(remove_container "$x") || fail "the N4 container not removed: $rmo"
cid=$(svc a2 "$ORIG") || fail "could not restart on the original"
r=$(ready "$cid") || fail "the original did not come back after N4: $r"
fingerprint "$cid" "$ORIG" "$PRIV/fp-orig-1" || fail "no fingerprint"
chk "N4 recovery: the original comes back on the pinned revision, its files unchanged by the refused attempt" "$([ "$r" = "ok $EXPECT" ] && cmp -s "$PRIV/fp-orig-0" "$PRIV/fp-orig-1" && echo 0 || echo 1)"

# ---------------------------------------------------------------- the cutover (A2 -> B on the target), N5
stage="cutover"
echo "-- CUTOVER: maintenance on; preflight; authorize the target; graceful stop; one writer; start; private probe; reopen"
[ "$(public_code)" = 503 ] || fail "maintenance is not on"
pre="B2 receipt for this window: $(upload_gate b2 "$B2_SHA" && echo yes || echo NO); target checked: $([ "$crc" = 0 ] && echo yes || echo NO); target differs from the original: $([ "$TARGET" != "$ORIG" ] && echo yes || echo NO)"
echo "   preflight: $pre"
chk "preflight: a same-window B2 receipt, a checked target, a separate folder" "$(printf '%s' "$pre" | grep -q NO && echo 1 || echo 0)"
auth=$(timeout 60 docker exec -i "$cid" cgn-authorize "$TARGET" "$ORIGIN" 1 < "$PRIV/code" 2>&1); arc=$?
chk "cgn-authorize records the target (from the live instance, before the switch)" "$([ "$arc" = 0 ] && printf '%s' "$auth" | grep -q "^AUTHORIZED data_dir=$TARGET " && echo 0 || echo 1)"
graceful_stop "$cid"; gs=$?; echo "   stop: $STOP_STATE"
chk "the original writer stopped gracefully (exit 0)" "$gs"
fingerprint "$cid" "$ORIG" "$PRIV/fp-orig-2" || fail "no fingerprint"
rmo=$(remove_container "$cid") || fail "A2 not removed: $rmo"; cid=""
u=$(volume_users "$VOL") || fail "volume users unreadable"
chk "single writer: the old container removed and confirmed gone, no container on the volume before the start" "$([ -z "$u" ] && echo 0 || echo 1)"
cid=$(svc b "$TARGET") || fail "could not start on the target"
r=$(ready "$cid") || fail "the target never became ready: $r"
bl=$(dk logs "$cid" 2>&1 | head -c 4000)
chk "startup evidence: the entrypoint says the environment matches the authorized configuration" "$(printf '%s' "$bl" | grep -q 'cgn-entrypoint: the environment matches the authorized configuration' && echo 0 || echo 1)"
echo "-- N5: a revision mismatch at the reopen gate: the ingress stays in maintenance"
reopen_gate "$cid" 0000000000000000000000000000000000000000; n5=$?
chk "N5 the reopen gate refuses a revision that isn't the expected one, and the PUBLIC side stays 503" "$([ "$n5" = 1 ] && [ "$(public_code)" = 503 ] && echo 0 || echo 1)"
reopen_gate "$cid" "$EXPECT"; rg=$?
chk "the reopen gate: private probe UP on the pinned revision, then the ingress reopens (PUBLIC /health 200)" "$([ "$rg" = 0 ] && [ "$(public_code)" = 200 ] && echo 0 || echo 1)"
lo=$(env W6_OWNER="$RUNID" NODE_EXTRA_CA_CERTS="$PRIV/cert.pem" timeout 120 node "$CHK" live "https://localhost:$PUBS" "$PRIV" restored 2>&1); lrc=$?
printf '%s\n' "$lo" | sed 's/^/   /'
chk "through the reopened ingress: the original seats, the approved entry, a repeated answer refused, a replay not doubled" "$lrc"
fingerprint "$cid" "$ORIG" "$PRIV/fp-orig-3" || fail "no fingerprint"
chk "the original folder is preserved: its fingerprint after the switch equals the one taken at the stop" "$(cmp -s "$PRIV/fp-orig-2" "$PRIV/fp-orig-3" && echo 0 || echo 1)" "$(wc -l < "$PRIV/fp-orig-2") file(s)"
cp "$PRIV/fp-orig-2" "$EVD/original-fingerprint-at-stop.txt"; cp "$PRIV/fp-orig-3" "$EVD/original-fingerprint-after-switch.txt"

# ---------------------------------------------------------------- the fallback (B -> C on the original)
stage="fallback"
echo "-- FALLBACK: the same cutover back to the retained original folder"
proxy maintenance || fail "maintenance did not come back"
auth=$(timeout 60 docker exec -i "$cid" cgn-authorize "$ORIG" "$ORIGIN" 1 < "$PRIV/code" 2>&1); arc=$?
graceful_stop "$cid"; gs=$?
rmo=$(remove_container "$cid") || fail "B not removed: $rmo"; cid=""
u=$(volume_users "$VOL") || fail "volume users unreadable"
chk "fallback: authorize the original from the live instance, graceful stop, one writer" "$([ "$arc" = 0 ] && [ "$gs" = 0 ] && [ -z "$u" ] && echo 0 || echo 1)"
cid=$(svc c "$ORIG") || fail "could not start the fallback"
r=$(ready "$cid") || fail "the fallback never became ready: $r"
reopen_gate "$cid" "$EXPECT"; rg=$?
lo=$(env W6_OWNER="$RUNID" NODE_EXTRA_CA_CERTS="$PRIV/cert.pem" timeout 120 node "$CHK" live "https://localhost:$PUBS" "$PRIV" fallback 2>&1); lrc=$?
printf '%s\n' "$lo" | sed 's/^/   /'
chk "the fallback serves the retained folder's later state (the post-backup answer), the seats and the approved entry" "$([ "$rg" = 0 ] && [ "$lrc" = 0 ] && echo 0 || echo 1)"

# ---------------------------------------------------------------- N6: a start failure after the target was authorized
stage="N6"
echo "-- N6: the target fails to start AFTER it was authorized (a target that breaks after its check)"
proxy maintenance || fail "maintenance did not come back"
ro=$(dt restore --backup /var/data/w6-staging --into "$TARGET-n6"); [ $? = 0 ] || fail "could not restore the N6 target"
co=$(dt check --data "$TARGET-n6"); [ $? = 0 ] || fail "the N6 target did not pass its check"
timeout 30 docker exec -u root "$cid" chmod 0500 "$TARGET-n6" || fail "could not break the N6 target"   # LOCAL fault injection: the folder can't be written
auth=$(timeout 60 docker exec -i "$cid" cgn-authorize "$TARGET-n6" "$ORIGIN" 1 < "$PRIV/code" 2>&1) || fail "could not authorize the N6 target"
graceful_stop "$cid" || fail "C did not stop gracefully"
fingerprint "$cid" "$ORIG" "$PRIV/fp-orig-4" || fail "no fingerprint"
rmo=$(remove_container "$cid") || fail "C not removed: $rmo"; cid=""
d=$(svc d "$TARGET-n6") || fail "could not create the N6 container"
ds=""; for _ in $(seq 1 60); do ds=$(dk inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$d" 2>/dev/null); [ "${ds%% *}" = exited ] && break; sleep 0.25; done
dl=$(dk logs "$d" 2>&1 | tail -c 1500)
echo "   [N6 target] $ds; last log lines: $(printf "%s" "$dl" | grep -v "^ *at " | tail -3 | tr "\n" " " | cut -c1-300)"
chk "N6 the broken target fails to start (the server exits; the container ends, as a crash-looping instance would)" "$([ "${ds%% *}" = exited ] && [ "${ds##* }" != 0 ] && echo 0 || echo 1)" "$ds; $(printf "%s" "$dl" | grep -v "^ *at " | tail -2 | tr "\n" " " | cut -c1-200)"
rmo=$(remove_container "$d") || fail "the N6 container not removed: $rmo"
e=$(svc e "$ORIG") || fail "could not create the N6 fallback container"
es=""; for _ in $(seq 1 40); do es=$(dk inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$e" 2>/dev/null); [ "${es%% *}" = exited ] && break; sleep 0.25; done
el=$(dk logs "$e" 2>&1 | tail -c 1500)
chk "N6 FINDING reproduced: the original is now refused too (exit 78), because the record names the broken target" "$([ "$es" = "exited 78" ] && printf '%s' "$el" | grep -q 'REFUSED: MCHEZO_DATA_DIR is not the authorized data folder' && echo 0 || echo 1)" "$es"
fingerprint "$e" "$ORIG" "$PRIV/fp-orig-5" || fail "no fingerprint"
chk "N6 the original folder is untouched by the failed start and the refusal" "$(cmp -s "$PRIV/fp-orig-4" "$PRIV/fp-orig-5" && echo 0 || echo 1)"
rmo=$(remove_container "$e") || fail "the refused container not removed: $rmo"
echo "   N6 recovery here: a LOCAL-ONLY one-off container re-authorizes the original. Render offers no one-off job with the disk, and a refusing or crashing instance gives no SSH: this step has NO Render equivalent yet (reported as a finding)."
oo=$(timeout 60 docker run --rm --label "w6.owner=$RUNID" -i -v "$VOL:/var/data" --entrypoint cgn-authorize "$IMG" "$ORIG" "$ORIGIN" 1 < "$PRIV/code" 2>&1); orc=$?
cid=$(svc f "$ORIG") || fail "could not start after recovery"
r=$(ready "$cid") || fail "the original did not come back after recovery: $r"
reopen_gate "$cid" "$EXPECT"; rg=$?
chk "N6 local-only recovery: re-authorized, the original serves the pinned revision again, and the ingress reopens" "$([ "$orc" = 0 ] && [ "$r" = "ok $EXPECT" ] && [ "$rg" = 0 ] && echo 0 || echo 1)"

stage="end"
u=$(volume_users "$VOL") || u="unreadable"
chk "at the end: exactly one container on the volume (no competing writer)" "$([ "$u" = "$cid" ] && echo 0 || echo 1)"
printf '{"run":"%s","image":"%s","revision":"%s","b1":{"archive":"%s","sha256":"%s"},"b2":{"archive":"%s","sha256":"%s"},"target":"%s","passed":%s,"failed":%s}\n' \
  "$RUNID" "$IMG" "$EXPECT" "$B1_ARCH" "$B1_SHA" "$B2_ARCH" "$B2_SHA" "$TARGET" "$npass" "$nfail" > "$EVD/summary.json"
[ "$nfail" = 0 ] && rc=0
[ "$rc" = 0 ] || exit 1
exit 0
