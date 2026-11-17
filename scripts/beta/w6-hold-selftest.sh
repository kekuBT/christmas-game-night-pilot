#!/bin/bash
# Beta R4 W6 repair 2 (review 6940435060, F-W6-02): the focused self-test of the guard across a backup HOLD, in the image
# under test, with the real game server, on run-owned volumes. A hold here is the one cgn-backup takes (a folder in
# /tmp/cgn/hold with its owner's pid and a token, then SIGTERM to the server), made by a test process that stays alive
# until the test releases it; the real cgn-backup is used where the backup itself matters (H0).
#   S   static: the image's cgn-authorize and cgn-entrypoint are byte-identical to deploy/render (recorded; a run on an
#       older image reports FAIL here and still runs every case, to reproduce)
#   H0  a valid APPROVED backup and resume: the real cgn-backup gives BACKUP_OK; the server is back on the approved
#       folder, and the entrypoint validated the record again before the relaunch
#   H1  F-W6-02: the PENDING writer paused by a hold (serving=none): --abort and --commit are REFUSED, the record
#       byte-identical
#   H2  the hold released while the switch is still pending: the pending writer resumes, validated again (PENDING)
#   H3  a legitimate abort: an ordinary restart on the approved original, then --abort (serving = the approved folder);
#       the aborted folder is refused afterwards (78)
#   H4  the APPROVED folder becomes unauthorized while its writer is stopped (cgn-authorize names another folder during
#       the hold): the hold is released, and the supervisor REFUSES to resume (78, no writer started)
#   H5  a PENDING folder revoked while its writer is stopped (a controlled edit of the record that drops the pending
#       entry, as an abort by any other path would): the supervisor REFUSES to resume (78, no writer started)
#   H6  the record removed while an authorized writer is stopped: the supervisor REFUSES to resume (78)
#   H7  a first install (no record, no data) paused and resumed: it resumes while there is still no record
#   H8  a first install that gets a record naming ANOTHER folder while stopped: the supervisor REFUSES to resume (78)
# Sentinels of another owner (a container and a volume, label w6h.sentinel) must survive; only this run's own
# containers and volumes (label w6h.owner=<run id>) are removed, after their label reads back.
#   bash scripts/beta/w6-hold-selftest.sh <image tag>
# Exit 0 "W6 HOLD SELFTEST PASSED", 1 "W6 HOLD SELFTEST FAILED", 2 bad usage.
set -uo pipefail
IMG=${1:-}; [ -n "$IMG" ] || { echo "usage: bash scripts/beta/w6-hold-selftest.sh <image tag>" >&2; exit 2; }
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
RUNID=$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
ORIGIN=https://cgn-w6h.test; CONF=/var/data/cgn-authorized.conf
A=/var/data/w6h-a; B=/var/data/w6h-b; C=/var/data/w6h-c; F=/var/data/w6h-first
VOL="w6h-data-$RUNID"; VOL2="w6h-first-$RUNID"; SVOL="w6h-sentinel-$RUNID"; SCON="w6h-sentinel-$RUNID"
PRIV=$(mktemp -d); chmod 700 "$PRIV"
pass=0; failn=0; seq=0; cur=""
PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
chk() { if [ "$2" = 0 ]; then echo "PASS $1"; pass=$((pass + 1)); else echo "FAIL $1${3:+ — $3}"; failn=$((failn + 1)); fi; }
dk() { timeout 60 docker "$@"; }
note() { echo "   $*"; }

cleanup() {
  local id v l
  for id in $(dk ps -aq --filter "label=w6h.owner=$RUNID" 2>/dev/null); do
    l=$(dk inspect -f '{{index .Config.Labels "w6h.owner"}}' "$id" 2>/dev/null)
    [ "$l" = "$RUNID" ] && dk rm -f -v "$id" >/dev/null 2>&1
  done
  for v in $(dk volume ls -q --filter "label=w6h.owner=$RUNID" 2>/dev/null); do
    l=$(dk volume inspect -f '{{index .Labels "w6h.owner"}}' "$v" 2>/dev/null)
    [ "$l" = "$RUNID" ] && dk volume rm "$v" >/dev/null 2>&1
  done
  rm -rf -- "$PRIV"
}
finish() {
  local code=$? lc lv s1 s2
  trap - EXIT INT TERM
  echo "-- cleanup (run $RUNID)"
  cleanup
  lc=$(dk ps -aq --filter "label=w6h.owner=$RUNID" 2>/dev/null | wc -l) || lc="UNVERIFIED"
  lv=$(dk volume ls -q --filter "label=w6h.owner=$RUNID" 2>/dev/null | wc -l) || lv="UNVERIFIED"
  s1=$(dk inspect -f '{{.State.Running}} {{index .Config.Labels "w6h.sentinel"}}' "$SCON" 2>/dev/null)
  s2=$(dk run --rm -v "$SVOL:/s:ro" --entrypoint cat "$IMG" /s/keep 2>/dev/null)
  chk "only this run's own containers and volumes were removed: containers left $lc, volumes left $lv; the sentinels are intact" "$([ "$lc" = 0 ] && [ "$lv" = 0 ] && [ "$s1" = "true $RUNID" ] && [ "$s2" = keep ] && echo 0 || echo 1)" "sentinel: '$s1' '$s2'"
  if [ "$(dk inspect -f '{{index .Config.Labels "w6h.sentinel"}}' "$SCON" 2>/dev/null)" = "$RUNID" ]; then dk rm -f "$SCON" >/dev/null 2>&1; fi
  if [ "$(dk volume inspect -f '{{index .Labels "w6h.sentinel"}}' "$SVOL" 2>/dev/null)" = "$RUNID" ]; then dk volume rm "$SVOL" >/dev/null 2>&1; fi
  echo "== $pass passed, $failn failed"
  if [ "$code" = 0 ] && [ "$failn" = 0 ] && [ "$pass" -gt 0 ]; then echo "W6 HOLD SELFTEST PASSED"; exit 0; fi
  echo "W6 HOLD SELFTEST FAILED"; exit 1
}
trap finish EXIT
trap 'echo "   interrupted"; exit 130' INT TERM

# start <name> <data dir> [volume]: a service container of this run (code and backup recipient from private env files)
start() {
  seq=$((seq + 1))
  dk run -d --name "w6h-$RUNID-$seq-$1" --label "w6h.owner=$RUNID" -v "${3:-$VOL}:/var/data" \
    -e "MCHEZO_DATA_DIR=$2" -e "MCHEZO_PUBLIC_ORIGIN=$ORIGIN" -e MCHEZO_TRUST_PROXY=1 \
    --env-file "$PRIV/code.env" --env-file "$PRIV/recipient.env" "$IMG" 2>/dev/null
}
# health <cid>: "up <revision>" or "down"
health() { local h; h=$(dk exec "$1" node -e 'fetch("http://127.0.0.1:10000/health").then(r=>r.json()).then(j=>console.log("up "+(j.revision??"none"))).catch(()=>console.log("down"))' 2>/dev/null); echo "${h:-down}"; }
# room <cid>: one synthetic room through the access gate, from inside the container (cgn-backup needs some data)
room() { dk exec "$1" node -e 'const b="http://127.0.0.1:10000";(async()=>{const g=await fetch(b+"/beta/enter",{method:"POST",redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code:process.env.MCHEZO_BETA_ACCESS_CODE,next:"/"})});const c=(g.headers.get("set-cookie")||"").split(";")[0];const r=await fetch(b+"/rooms",{method:"POST",headers:{cookie:c,"content-type":"application/json"},body:JSON.stringify({name:"W6 hold room",kind:"casual"})});console.log("room "+r.status)})().catch(e=>console.log("room failed"))' 2>&1; }
# outcome <cid>: "up <revision>" once /health answers, or "exited <code>", within 40 s
outcome() {
  local st h
  for _ in $(seq 1 160); do
    st=$(dk inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$1" 2>/dev/null) || { echo "unreadable"; return; }
    if [ "${st%% *}" = exited ]; then echo "exited ${st##* }"; return; fi
    h=$(health "$1"); [ "${h%% *}" = up ] && { echo "$h"; return; }
    sleep 0.25
  done
  echo "timeout ($st)"
}
# wait_exit <cid>: "exited <code>" within 40 s, or the state
wait_exit() { local st; for _ in $(seq 1 160); do st=$(dk inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$1" 2>/dev/null); [ "${st%% *}" = exited ] && { echo "exited ${st##* }"; return; }; sleep 0.25; done; echo "still $st"; }
logs() { dk logs "$1" 2>&1 | grep '^cgn-entrypoint' | tail -4 | tr '\n' ' '; }
nlines() { dk logs "$1" 2>&1 | grep -c -- "$2"; }
stop() { timeout 50 docker stop -t 30 "$1" >/dev/null 2>&1; dk rm -v "$1" >/dev/null 2>&1; }
SSH() { dk exec "$cur" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn "$@" 2>&1; }
recsum() { dk exec "$1" sha256sum "$CONF" 2>/dev/null | cut -d' ' -f1; }
# hold_on <cid>: take a hold the way cgn-backup does (mkdir, owner pid + token, SIGTERM to the server); its owner stays
# alive until hold_off. Waits until the server is down and its pid file is gone. Prints "held" or a reason.
hold_on() {
  dk exec -d "$1" sh -c 'mkdir /tmp/cgn/hold && echo $$ > /tmp/cgn/hold/pid && echo w6h-hold > /tmp/cgn/hold/owner && kill -TERM "$(cat /tmp/cgn/server.pid)"; exec sleep 600' >/dev/null 2>&1 || { echo "exec failed"; return 1; }
  for _ in $(seq 1 120); do
    if ! dk exec "$1" test -e /tmp/cgn/server.pid 2>/dev/null && [ "$(health "$1")" = down ] && dk exec "$1" test -d /tmp/cgn/hold 2>/dev/null; then echo held; return 0; fi
    sleep 0.25
  done
  echo "not held"; return 1
}
# hold_off <cid>: release the test's hold (remove it, end its owner)
hold_off() { dk exec "$1" sh -c 'p=$(cat /tmp/cgn/hold/pid 2>/dev/null); rm -f /tmp/cgn/hold/pid /tmp/cgn/hold/owner; rmdir /tmp/cgn/hold; [ -n "$p" ] && kill "$p"; true' >/dev/null 2>&1; }

echo "== w6-hold-selftest $(date -u +%FT%TZ), run $RUNID, image $IMG ($(dk image inspect -f '{{.Id}}' "$IMG" 2>/dev/null | cut -c1-19))"
echo "   scripts: cgn-authorize.sh $(sha256sum "$ROOT/deploy/render/cgn-authorize.sh" | cut -c1-16), cgn-entrypoint.sh $(sha256sum "$ROOT/deploy/render/cgn-entrypoint.sh" | cut -c1-16), this file $(sha256sum "$0" | cut -c1-16)"
code="w6h-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"; printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$code" > "$PRIV/code.env"
age-keygen -o "$PRIV/id.txt" 2>/dev/null && printf 'CGN_BACKUP_RECIPIENT=%s\n' "$(age-keygen -y "$PRIV/id.txt")" > "$PRIV/recipient.env" || { echo "age-keygen is needed"; exit 1; }
dk volume create --label "w6h.owner=$RUNID" "$VOL" >/dev/null && dk volume create --label "w6h.owner=$RUNID" "$VOL2" >/dev/null || { echo "could not create the volumes"; exit 1; }
dk volume create --label "w6h.sentinel=$RUNID" "$SVOL" >/dev/null && dk run --rm -v "$SVOL:/s" --user root --entrypoint sh "$IMG" -c 'echo keep > /s/keep' \
  && dk run -d --name "$SCON" --label "w6h.sentinel=$RUNID" --entrypoint sleep "$IMG" 600 >/dev/null || { echo "could not create the sentinels"; exit 1; }

echo "-- S: static"
s0=0; for f in cgn-authorize cgn-entrypoint; do
  [ "$(dk run --rm --entrypoint cat "$IMG" "/usr/local/bin/$f" | sha256sum | cut -d' ' -f1)" = "$(sha256sum "$ROOT/deploy/render/$f.sh" | cut -d' ' -f1)" ] || s0=1
done
chk "S the image's cgn-authorize and cgn-entrypoint are byte-identical to deploy/render" "$s0"

echo "-- setup: the approved folder A, authorized"
cur=$(start a "$A"); o=$(outcome "$cur"); note "first start: $o"
dk exec "$cur" mkdir -m 700 "$B" "$C" >/dev/null 2>&1
au=$(printf '%s' "$code" | dk exec -i "$cur" env -i PATH=/usr/local/bin:/usr/bin:/bin cgn-authorize "$A" "$ORIGIN" 1 2>&1); note "$au"
note "$(room "$cur")"

echo "-- H0: a valid approved backup and resume (the real cgn-backup)"
n0=$(nlines "$cur" "the APPROVED data folder $A")
bk=$(timeout 180 docker exec "$cur" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn cgn-backup 2>&1); brc=$?
printf '%s\n' "$bk" | grep -E '^(BACKUP_OK|BACKUP_FAILED)|hold released' | sed 's/^/   [H0] /'
o=""; for _ in $(seq 1 80); do o=$(health "$cur"); [ "${o%% *}" = up ] && break; sleep 0.25; done
n1=$(nlines "$cur" "the APPROVED data folder $A")
chk "H0 cgn-backup gives BACKUP_OK, the approved writer resumes, and the entrypoint validated the record again before relaunching it" "$([ "$brc" = 0 ] && printf '%s' "$bk" | grep -q '^BACKUP_OK ' && [ "$o" = "up $PIN" ] && [ "$n1" -gt "$n0" ] && echo 0 || echo 1)" "exit $brc; $o; approved-validation lines $n0 -> $n1"

echo "-- H1: F-W6-02, the PENDING writer paused by a hold"
p=$(SSH cgn-authorize --prepare "$B"); note "$p"
stop "$cur"; cur=$(start pending "$B"); o=$(outcome "$cur"); note "pending start: $o; $(logs "$cur")"
h=$(hold_on "$cur"); st=$(SSH cgn-authorize --status); note "hold: $h; $st"
r0=$(recsum "$cur")
ab=$(SSH cgn-authorize --abort "$B"); abrc=$?
cm=$(SSH cgn-authorize --commit "$B"); cmrc=$?
r1=$(recsum "$cur")
note "abort: rc $abrc: $ab"
note "commit: rc $cmrc: $cm"
chk "H1 while the pending writer is paused (serving=none), --abort is REFUSED and the record is byte-identical" "$([ "$h" = held ] && printf '%s' "$st" | grep -q "pending_data_dir=$B serving=none\$" && [ "$abrc" = 1 ] && printf '%s' "$ab" | grep -q '^AUTHORIZE_FAILED: ' && [ -n "$r0" ] && [ "$r0" = "$r1" ] && echo 0 || echo 1)" "rc $abrc: $ab"
chk "H1 while it is paused, --commit is REFUSED too, and the record is byte-identical" "$([ "$cmrc" = 1 ] && printf '%s' "$cm" | grep -q '^AUTHORIZE_FAILED: ' && [ "$r0" = "$r1" ] && echo 0 || echo 1)" "rc $cmrc: $cm"

echo "-- H2: the hold released while the switch is still pending"
n0=$(nlines "$cur" "the PENDING data folder $B")
hold_off "$cur"; o=""; for _ in $(seq 1 120); do o=$(health "$cur"); [ "${o%% *}" = up ] && break; sleep 0.25; done
n1=$(nlines "$cur" "the PENDING data folder $B")
chk "H2 the pending writer resumes, validated again as PENDING before its relaunch" "$([ "$o" = "up $PIN" ] && [ "$n1" -gt "$n0" ] && SSH cgn-authorize --status | grep -q "pending_data_dir=$B serving=$B\$" && echo 0 || echo 1)" "$o; pending-validation lines $n0 -> $n1"

echo "-- H3: a legitimate abort, from the approved original after an ordinary restart"
stop "$cur"; cur=$(start back "$A"); o=$(outcome "$cur")
ab=$(SSH cgn-authorize --abort "$B"); abrc=$?; note "$ab"
x=$(start aborted "$B"); xo=$(wait_exit "$x"); xl=$(logs "$x"); dk rm -f -v "$x" >/dev/null 2>&1
chk "H3 an ordinary restart serves the approved original; --abort from it succeeds; the aborted folder is refused (78)" "$([ "$o" = "up $PIN" ] && [ "$abrc" = 0 ] && printf '%s' "$ab" | grep -q "^ABORTED pending_data_dir=$B " && [ "$xo" = "exited 78" ] && printf '%s' "$xl" | grep -q 'REFUSED: MCHEZO_DATA_DIR is not the authorized data folder' && echo 0 || echo 1)" "$o; $xo"

echo "-- H4: the approved folder becomes unauthorized while its writer is stopped"
nl0=$(nlines "$cur" "Listening")
h=$(hold_on "$cur")
au=$(printf '%s' "$code" | dk exec -i "$cur" env -i PATH=/usr/local/bin:/usr/bin:/bin cgn-authorize "$C" "$ORIGIN" 1 2>&1); note "during the hold: $au"
hold_off "$cur"; xo=$(wait_exit "$cur"); nl1=$(nlines "$cur" "Listening"); l=$(logs "$cur")
note "after the release: $xo; $l"
chk "H4 the supervisor REFUSES to resume the writer on a folder no longer authorized: exit 78, a REFUSED line, no new server" "$([ "$h" = held ] && printf '%s' "$au" | grep -q "^AUTHORIZED data_dir=$C " && [ "$xo" = "exited 78" ] && printf '%s' "$l" | grep -q 'REFUSED: MCHEZO_DATA_DIR is not the authorized data folder' && [ "$nl1" = "$nl0" ] && echo 0 || echo 1)" "$xo; Listening $nl0 -> $nl1"
dk rm -f -v "$cur" >/dev/null 2>&1

echo "-- H5: a PENDING folder revoked while its writer is stopped (a controlled edit of the record)"
cur=$(start c "$C"); o=$(outcome "$cur")
p=$(SSH cgn-authorize --prepare "$B"); note "$p"
stop "$cur"; cur=$(start pending2 "$B"); o=$(outcome "$cur"); note "pending start: $o"
nl0=$(nlines "$cur" "Listening")
h=$(hold_on "$cur")
dk exec "$cur" sh -c "grep -v '^pending_' $CONF > $CONF.edit && mv $CONF.edit $CONF" >/dev/null 2>&1   # the controlled revocation
st=$(SSH cgn-authorize --status); note "record during the hold: $st"
hold_off "$cur"; xo=$(wait_exit "$cur"); nl1=$(nlines "$cur" "Listening"); l=$(logs "$cur")
note "after the release: $xo; $l"
chk "H5 the supervisor REFUSES to resume the revoked pending writer: exit 78, a REFUSED line, no new server" "$([ "$h" = held ] && printf '%s' "$st" | grep -q "data_dir=$C .* pending_data_dir=none" && [ "$xo" = "exited 78" ] && printf '%s' "$l" | grep -q 'REFUSED: MCHEZO_DATA_DIR is not the authorized data folder' && [ "$nl1" = "$nl0" ] && echo 0 || echo 1)" "$xo; Listening $nl0 -> $nl1"
dk rm -f -v "$cur" >/dev/null 2>&1

echo "-- H6: the record removed while an authorized writer is stopped"
cur=$(start c2 "$C"); o=$(outcome "$cur")
nl0=$(nlines "$cur" "Listening")
h=$(hold_on "$cur")
dk exec "$cur" rm -f "$CONF" >/dev/null 2>&1
hold_off "$cur"; xo=$(wait_exit "$cur"); nl1=$(nlines "$cur" "Listening"); l=$(logs "$cur")
note "after the release: $xo; $l"
chk "H6 the supervisor REFUSES to resume once the record it started with is gone: exit 78, a REFUSED line, no new server" "$([ "$o" = "up $PIN" ] && [ "$h" = held ] && [ "$xo" = "exited 78" ] && printf '%s' "$l" | grep -q 'REFUSED: ' && [ "$nl1" = "$nl0" ] && echo 0 || echo 1)" "$xo; Listening $nl0 -> $nl1"
dk rm -f -v "$cur" >/dev/null 2>&1

echo "-- H7: a first install (no record, no data) paused and resumed"
cur=$(start first "$F" "$VOL2"); o=$(outcome "$cur"); note "first install: $o; $(logs "$cur")"
nl0=$(nlines "$cur" "Listening")
h=$(hold_on "$cur"); hold_off "$cur"; o2=""; for _ in $(seq 1 120); do o2=$(health "$cur"); [ "${o2%% *}" = up ] && break; sleep 0.25; done
nl1=$(nlines "$cur" "Listening")
chk "H7 a first install resumes after a hold while there is still no record" "$([ "$o" = "up $PIN" ] && [ "$h" = held ] && [ "$o2" = "up $PIN" ] && [ "$nl1" -gt "$nl0" ] && echo 0 || echo 1)" "$o -> $o2; Listening $nl0 -> $nl1"

echo "-- H8: a first install given a record for ANOTHER folder while stopped"
h=$(hold_on "$cur")
au=$(printf '%s' "$code" | dk exec -i "$cur" env -i PATH=/usr/local/bin:/usr/bin:/bin cgn-authorize "/var/data/w6h-elsewhere" "$ORIGIN" 1 2>&1); note "during the hold: $au"
nl0=$(nlines "$cur" "Listening")
hold_off "$cur"; xo=$(wait_exit "$cur"); nl1=$(nlines "$cur" "Listening"); l=$(logs "$cur")
note "after the release: $xo; $l"
chk "H8 the supervisor REFUSES to resume a first install whose new record names another folder: exit 78, no new server" "$([ "$h" = held ] && [ "$xo" = "exited 78" ] && printf '%s' "$l" | grep -q 'REFUSED: MCHEZO_DATA_DIR is not the authorized data folder' && [ "$nl1" = "$nl0" ] && echo 0 || echo 1)" "$xo; Listening $nl0 -> $nl1"
