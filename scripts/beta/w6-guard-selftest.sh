#!/bin/bash
# Beta R4 W6 repair (review 6939462697): the focused self-test of the data-folder switch protocol in the guard pair
# (deploy/render/cgn-authorize.sh + cgn-entrypoint.sh) inside the image under test, on run-owned volumes, with the real
# game server. No published port, no proxy: health is read from inside each container. Disposable data only.
#   G0  static: the image's two scripts are byte-identical to deploy/render, and the record reader is the same block
#       in both
#   G1  an existing single-configuration record (written by the PREVIOUS cgn-authorize, from #48's head) still starts,
#       reads back with --status, and can be prepared from
#   G2  --prepare refusals (relative, trailing '/', the approved folder, nested either way, missing, not owned): the
#       record is unchanged by each
#   G3  --prepare: exactly one pending folder; a second prepare and a whole re-authorization are refused while pending
#   G4  while pending: the APPROVED folder still starts (restart), an unrelated folder is refused (78), and a pending
#       start with another origin, proxy count or code is refused (78)
#   G5  the pending start (logged PENDING, --status serving=it); a restart before commit is still pending; --abort is
#       refused from the instance serving it
#   G6  abort: an ordinary redeploy with the original environment starts the approved folder; --abort from there; the
#       aborted folder is then refused (78), and --commit has nothing to commit
#   G7  a FAILED pending start (the folder made unwritable after its preparation): it exits non-zero; an ordinary
#       redeploy with the original environment starts the approved folder, with the record untouched since --prepare
#       (no special container, no edit to the record after the failure); then --abort
#   G8  commit: from the instance serving the pending folder only (refused from elsewhere); after it, the prior folder
#       is refused (78) and the committed one starts as APPROVED
#   G9  interrupted record changes: a leftover partial file is ignored by the entrypoint and removed by the next
#       change; a change killed while waiting for the lock leaves the record as it was; a holder killed mid-change
#       releases the lock (flock), so the next change completes; a lock held past 10 s refuses the change
#   M1-M10 unusable records on a separate fixture volume (truncated, unknown key, repeated key, a line without '=',
#       STALE pending, pending without its pair, empty, a symbolic link, a folder, a non-hex salt): each start exits
#       78 with the reason, --status says UNUSABLE, --prepare is refused
# Sentinels of another owner (a container and a volume, label w6g.sentinel) must survive; only this run's own
# containers and volumes (label w6g.owner=<run id>) are removed, after their label reads back.
#   bash scripts/beta/w6-guard-selftest.sh <image tag> [base revision for G1, default d2e7edf]
# Exit 0 "W6 GUARD SELFTEST PASSED", 1 "W6 GUARD SELFTEST FAILED", 2 bad usage.
set -uo pipefail
IMG=${1:-}; [ -n "$IMG" ] || { echo "usage: bash scripts/beta/w6-guard-selftest.sh <image tag> [base revision]" >&2; exit 2; }
OLDREV=${2:-d2e7edfe31ef86dd4943424e2ae3384c5ab334ae}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
RUNID=$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
ORIGIN=https://cgn-w6g.test; CONF=/var/data/cgn-authorized.conf
A=/var/data/w6g-a; B=/var/data/w6g-b; C=/var/data/w6g-c; D=/var/data/w6g-d
VOL="w6g-data-$RUNID"; VOL2="w6g-fixture-$RUNID"; SVOL="w6g-sentinel-$RUNID"; SCON="w6g-sentinel-$RUNID"
PRIV=$(mktemp -d); chmod 700 "$PRIV"
pass=0; failn=0; seq=0; cur=""
chk() { if [ "$2" = 0 ]; then echo "PASS $1"; pass=$((pass + 1)); else echo "FAIL $1${3:+ — $3}"; failn=$((failn + 1)); fi; }
dk() { timeout 60 docker "$@"; }
note() { echo "   $*"; }

# ---------------------------------------------------------------- cleanup (owned only, label read back first)
cleanup() {
  local id v l
  for id in $(dk ps -aq --filter "label=w6g.owner=$RUNID" 2>/dev/null); do
    l=$(dk inspect -f '{{index .Config.Labels "w6g.owner"}}' "$id" 2>/dev/null)
    [ "$l" = "$RUNID" ] && dk rm -f -v "$id" >/dev/null 2>&1
  done
  for v in $(dk volume ls -q --filter "label=w6g.owner=$RUNID" 2>/dev/null); do
    l=$(dk volume inspect -f '{{index .Labels "w6g.owner"}}' "$v" 2>/dev/null)
    [ "$l" = "$RUNID" ] && dk volume rm "$v" >/dev/null 2>&1
  done
  rm -rf -- "$PRIV"
}
finish() {
  local code=$? lc lv s1 s2
  trap - EXIT INT TERM
  echo "-- cleanup (run $RUNID)"
  cleanup
  lc=$(dk ps -aq --filter "label=w6g.owner=$RUNID" 2>/dev/null | wc -l) || lc="UNVERIFIED"
  lv=$(dk volume ls -q --filter "label=w6g.owner=$RUNID" 2>/dev/null | wc -l) || lv="UNVERIFIED"
  s1=$(dk inspect -f '{{.State.Running}} {{index .Config.Labels "w6g.sentinel"}}' "$SCON" 2>/dev/null)
  s2=$(dk run --rm -v "$SVOL:/s:ro" --entrypoint cat "$IMG" /s/keep 2>/dev/null)
  chk "only this run's own containers and volumes were removed: containers left $lc, volumes left $lv; the sentinels are intact" "$([ "$lc" = 0 ] && [ "$lv" = 0 ] && [ "$s1" = "true $RUNID" ] && [ "$s2" = keep ] && echo 0 || echo 1)" "sentinel: '$s1' '$s2'"
  if [ "$(dk inspect -f '{{index .Config.Labels "w6g.sentinel"}}' "$SCON" 2>/dev/null)" = "$RUNID" ]; then dk rm -f "$SCON" >/dev/null 2>&1; fi
  if [ "$(dk volume inspect -f '{{index .Labels "w6g.sentinel"}}' "$SVOL" 2>/dev/null)" = "$RUNID" ]; then dk volume rm "$SVOL" >/dev/null 2>&1; fi
  echo "== $pass passed, $failn failed"
  if [ "$code" = 0 ] && [ "$failn" = 0 ] && [ "$pass" -gt 0 ]; then echo "W6 GUARD SELFTEST PASSED"; exit 0; fi
  echo "W6 GUARD SELFTEST FAILED"; exit 1
}
trap finish EXIT
trap 'echo "   interrupted"; exit 130' INT TERM

# ---------------------------------------------------------------- helpers
# start <name> <data dir> [origin] [proxy] [code env file] [volume]: a service container of this run; prints its id
start() {
  seq=$((seq + 1))
  dk run -d --name "w6g-$RUNID-$seq-$1" --label "w6g.owner=$RUNID" -v "${6:-$VOL}:/var/data" \
    -e "MCHEZO_DATA_DIR=$2" -e "MCHEZO_PUBLIC_ORIGIN=${3:-$ORIGIN}" -e "MCHEZO_TRUST_PROXY=${4:-1}" \
    --env-file "${5:-$PRIV/code.env}" "$IMG" 2>/dev/null
}
# outcome <cid>: "up <revision>" once /health answers inside it, or "exited <code>", within 40 s
outcome() {
  local st rev
  for _ in $(seq 1 160); do
    st=$(dk inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$1" 2>/dev/null) || { echo "unreadable"; return; }
    if [ "${st%% *}" = exited ]; then echo "exited ${st##* }"; return; fi
    rev=$(dk exec "$1" node -e 'fetch("http://127.0.0.1:10000/health").then(r=>r.json()).then(j=>console.log(j.revision??"none")).catch(()=>process.exit(1))' 2>/dev/null) && { echo "up $rev"; return; }
    sleep 0.25
  done
  echo "timeout ($st)"
}
logs() { dk logs "$1" 2>&1 | grep '^cgn-entrypoint' | tail -3 | tr '\n' ' '; }
stop() { timeout 50 docker stop -t 30 "$1" >/dev/null 2>&1; dk rm -v "$1" >/dev/null 2>&1; }   # graceful, then removed
SSH() { dk exec "$cur" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn "$@" 2>&1; }   # an SSH-like session
recsum() { dk exec "$cur" sha256sum "$CONF" 2>/dev/null | cut -d' ' -f1; }
PIN=7097ac2bb062925bb296a129f4771f1e68fd522d

echo "== w6-guard-selftest $(date -u +%FT%TZ), run $RUNID, image $IMG ($(dk image inspect -f '{{.Id}}' "$IMG" 2>/dev/null | cut -c1-19))"
echo "   scripts: cgn-authorize.sh $(sha256sum "$ROOT/deploy/render/cgn-authorize.sh" | cut -c1-16), cgn-entrypoint.sh $(sha256sum "$ROOT/deploy/render/cgn-entrypoint.sh" | cut -c1-16), this file $(sha256sum "$0" | cut -c1-16)"
code="w6g-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"; printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$code" > "$PRIV/code.env"
printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "w6g-other-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')" > "$PRIV/other.env"
dk volume create --label "w6g.owner=$RUNID" "$VOL" >/dev/null && dk volume create --label "w6g.owner=$RUNID" "$VOL2" >/dev/null || { echo "could not create the volumes"; exit 1; }
dk volume create --label "w6g.sentinel=$RUNID" "$SVOL" >/dev/null && dk run --rm -v "$SVOL:/s" --user root --entrypoint sh "$IMG" -c 'echo keep > /s/keep' \
  && dk run -d --name "$SCON" --label "w6g.sentinel=$RUNID" --entrypoint sleep "$IMG" 600 >/dev/null || { echo "could not create the sentinels"; exit 1; }

echo "-- G0: static"
s0=0; for f in cgn-authorize cgn-entrypoint; do
  [ "$(dk run --rm --entrypoint cat "$IMG" "/usr/local/bin/$f" | sha256sum | cut -d' ' -f1)" = "$(sha256sum "$ROOT/deploy/render/$f.sh" | cut -d' ' -f1)" ] || s0=1
done
rr() { sed -n '/^# --- record reader/,/^# --- end record reader ---$/p' "$1"; }
chk "G0 the image's cgn-authorize and cgn-entrypoint are byte-identical to deploy/render, and the record reader block is identical in both ($(rr "$ROOT/deploy/render/cgn-authorize.sh" | wc -l) lines)" \
  "$([ $s0 = 0 ] && [ -n "$(rr "$ROOT/deploy/render/cgn-authorize.sh")" ] && [ "$(rr "$ROOT/deploy/render/cgn-authorize.sh")" = "$(rr "$ROOT/deploy/render/cgn-entrypoint.sh")" ] && echo 0 || echo 1)"

echo "-- G1: an existing single-configuration record (the previous cgn-authorize, ${OLDREV:0:7})"
git -C "$ROOT" show "$OLDREV:deploy/render/cgn-authorize.sh" > "$PRIV/old-authorize.sh" 2>/dev/null || { echo "could not read the previous cgn-authorize"; exit 1; }
cur=$(start first "$A"); o=$(outcome "$cur")
note "first install: $o; $(logs "$cur")"
dk exec "$cur" mkdir -m 700 "$B" "$C" "$D" >/dev/null 2>&1
dk exec -i "$cur" sh -c 'cat > /tmp/old-authorize.sh' < "$PRIV/old-authorize.sh"
old=$(printf '%s' "$code" | dk exec -i "$cur" env -i PATH=/usr/local/bin:/usr/bin:/bin sh /tmp/old-authorize.sh "$A" "$ORIGIN" 1 2>&1)
note "the previous cgn-authorize: $old"
stop "$cur"; cur=$(start v1 "$A"); o=$(outcome "$cur"); st=$(SSH cgn-authorize --status)
chk "G1 a record written by the previous cgn-authorize ($(dk exec "$cur" sh -c "wc -l < $CONF") lines) starts the approved folder, and --status reads it" \
  "$([ "${o%% *}" = up ] && logs "$cur" | grep -q "the environment matches the authorized configuration: the APPROVED data folder $A" && printf '%s' "$st" | grep -q "^STATUS data_dir=$A public_origin=$ORIGIN trust_proxy=1 pending_data_dir=none serving=$A\$" && echo 0 || echo 1)" "$o; $st"
chk "G1 --status never prints the code, its salt or its hash" "$(dk exec "$cur" cat "$CONF" | sed -n 's/^code_s[a-z0-9]*=//p' | { bad=0; while read -r v; do printf '%s' "$st" | grep -qF "$v" && bad=1; done; printf '%s' "$st" | grep -qF "$code" && bad=1; echo $bad; })"

echo "-- G2: --prepare refusals leave the record unchanged"
r0=$(recsum); g2=0
dk exec "$cur" mkdir -m 700 "$A/nested" >/dev/null 2>&1   # (removed below)
dk exec -u root "$cur" sh -c "mkdir -m 700 /var/data/w6g-root" >/dev/null 2>&1
for bad in "w6g-b|absolute path" "$B/|absolute path" "$A|already the approved folder" "$A/nested|inside the approved folder" "/var/data|the approved folder is inside" "/var/data/w6g-missing|is not a folder" "/var/data/w6g-root|does not belong to this user"; do
  arg=${bad%%|*}; want=${bad#*|}
  out=$(SSH cgn-authorize --prepare "$arg"); rc=$?
  if [ "$rc" = 1 ] && printf '%s' "$out" | grep -q "^AUTHORIZE_FAILED: .*$want" && [ "$(recsum)" = "$r0" ]; then :; else g2=1; note "unexpected for '$arg': rc $rc: $out"; fi
done
dk exec "$cur" rmdir "$A/nested" >/dev/null 2>&1
chk "G2 --prepare refuses a relative path, a trailing '/', the approved folder, a nested folder either way, a missing folder and a folder of another user; the record is unchanged" "$g2"

echo "-- G3: one pending folder"
p=$(SSH cgn-authorize --prepare "$B"); rp=$(recsum)
note "$p"
p2=$(SSH cgn-authorize --prepare "$C"); r2=$?
full=$(printf '%s' "$code" | dk exec -i "$cur" env -i PATH=/usr/local/bin:/usr/bin:/bin cgn-authorize "$A" "$ORIGIN" 1 2>&1); r3=$?
chk "G3 --prepare records one pending folder (the approved one unchanged)" "$(printf '%s' "$p" | grep -q "^PREPARED pending_data_dir=$B approved_data_dir=$A " && printf '%s' "$(SSH cgn-authorize --status)" | grep -q "data_dir=$A .* pending_data_dir=$B " && echo 0 || echo 1)" "$p"
chk "G3 while pending, a second --prepare and a whole re-authorization are refused, and the record is unchanged" "$([ $r2 = 1 ] && [ $r3 = 1 ] && printf '%s\n%s' "$p2" "$full" | grep -c "already pending\|is pending: commit or abort" | grep -qx 2 && [ "$(recsum)" = "$rp" ] && echo 0 || echo 1)" "$p2 | $full"

echo "-- G4: while pending"
stop "$cur"; cur=$(start approved-while-pending "$A"); o=$(outcome "$cur")
chk "G4 the APPROVED folder still starts while a switch is pending (an ordinary restart)" "$([ "$o" = "up $PIN" ] && logs "$cur" | grep -q "the APPROVED data folder $A" && echo 0 || echo 1)" "$o"
stop "$cur"
for v in "unrelated|$C|$ORIGIN|1|$PRIV/code.env|MCHEZO_DATA_DIR is not the authorized data folder, nor the pending one" \
         "pending-origin|$B|https://other.test|1|$PRIV/code.env|MCHEZO_PUBLIC_ORIGIN is not the authorized origin" \
         "pending-proxy|$B|$ORIGIN|2|$PRIV/code.env|MCHEZO_TRUST_PROXY is not the authorized proxy count" \
         "pending-code|$B|$ORIGIN|1|$PRIV/other.env|the access code is not the authorized one"; do
  IFS='|' read -r n d og px ce want <<< "$v"
  x=$(start "$n" "$d" "$og" "$px" "$ce"); o=$(outcome "$x"); l=$(logs "$x")
  chk "G4 $n: refused (exit 78) and no server started" "$([ "$o" = "exited 78" ] && printf '%s' "$l" | grep -q "REFUSED: $want" && ! dk logs "$x" 2>&1 | grep -q 'listening' && echo 0 || echo 1)" "$o; $l"
  dk rm -f -v "$x" >/dev/null 2>&1
done

echo "-- G5: the pending start, and a restart before commit"
cur=$(start pending "$B"); o=$(outcome "$cur")
chk "G5 the pending folder starts, logged PENDING; --status names it as served" "$([ "$o" = "up $PIN" ] && logs "$cur" | grep -q "the PENDING data folder $B (not committed" && SSH cgn-authorize --status | grep -q "pending_data_dir=$B serving=$B\$" && echo 0 || echo 1)" "$o; $(logs "$cur")"
dk restart -t 30 "$cur" >/dev/null 2>&1; o=$(outcome "$cur")
chk "G5 a restart before commit: still the PENDING folder" "$([ "$o" = "up $PIN" ] && dk logs "$cur" 2>&1 | grep -c "the PENDING data folder $B" | grep -qx 2 && echo 0 || echo 1)" "$o"
ab=$(SSH cgn-authorize --abort "$B"); r=$?
chk "G5 --abort is refused from the instance serving the pending folder" "$([ $r = 1 ] && printf '%s' "$ab" | grep -q 'is running on' && echo 0 || echo 1)" "$ab"

echo "-- G6: abort"
stop "$cur"; cur=$(start back-to-approved "$A"); o=$(outcome "$cur")
ab=$(SSH cgn-authorize --abort "$B"); r=$?
chk "G6 an ordinary redeploy with the original environment starts the approved folder; --abort from it" "$([ "$o" = "up $PIN" ] && [ $r = 0 ] && printf '%s' "$ab" | grep -q "^ABORTED pending_data_dir=$B " && SSH cgn-authorize --status | grep -q "data_dir=$A .* pending_data_dir=none" && echo 0 || echo 1)" "$o; $ab"
cm=$(SSH cgn-authorize --commit "$B"); r=$?
x=$(start aborted "$B"); o=$(outcome "$x"); l=$(logs "$x"); dk rm -f -v "$x" >/dev/null 2>&1
chk "G6 after the abort: the aborted folder is refused (78), and --commit has nothing to commit" "$([ "$o" = "exited 78" ] && printf '%s' "$l" | grep -q 'REFUSED: MCHEZO_DATA_DIR is not the authorized data folder' && [ $r = 1 ] && printf '%s' "$cm" | grep -q 'no folder switch is pending' && echo 0 || echo 1)" "$o; $cm"

echo "-- G7: a failed pending start, undone by an ordinary redeploy"
p=$(SSH cgn-authorize --prepare "$D"); note "$p"
dk exec -u root "$cur" chmod 0500 "$D" >/dev/null 2>&1   # LOCAL fault: the prepared folder breaks after its preparation
rp=$(recsum)
stop "$cur"; x=$(start broken-pending "$D"); o=$(outcome "$x"); l=$(dk logs "$x" 2>&1 | grep -v '^ *at ' | tail -2 | tr '\n' ' ' | cut -c1-240)
chk "G7 the broken pending folder fails to start (the server exits non-zero)" "$([ "${o%% *}" = exited ] && [ "${o##* }" != 0 ] && [ "${o##* }" != 78 ] && echo 0 || echo 1)" "$o; $l"
dk rm -f -v "$x" >/dev/null 2>&1
cur=$(start recovered "$A"); o=$(outcome "$cur")
chk "G7 recovery is an ORDINARY redeploy with the original environment: the approved folder starts, and the record is byte-identical to the one --prepare wrote (no edit after the failure, no special container)" "$([ "$o" = "up $PIN" ] && [ "$(recsum)" = "$rp" ] && logs "$cur" | grep -q "the APPROVED data folder $A" && echo 0 || echo 1)" "$o"
ab=$(SSH cgn-authorize --abort "$D"); note "$ab"
dk exec -u root "$cur" chmod 0700 "$D" >/dev/null 2>&1

echo "-- G8: commit"
p=$(SSH cgn-authorize --prepare "$B")
cm0=$(SSH cgn-authorize --commit "$B"); r0c=$?
stop "$cur"; cur=$(start pending-to-commit "$B"); o=$(outcome "$cur")
cw=$(SSH cgn-authorize --commit "$C"); rw=$?
cm=$(SSH cgn-authorize --commit "$B"); r=$?
chk "G8 --commit is refused from an instance not serving the pending folder, and for another folder" "$([ $r0c = 1 ] && printf '%s' "$cm0" | grep -q 'is not running on' && [ $rw = 1 ] && printf '%s' "$cw" | grep -q 'is not the pending folder' && echo 0 || echo 1)" "$cm0 | $cw"
chk "G8 --commit from the instance serving it: the record now approves it, with no pending entry and the original five lines" "$([ "$o" = "up $PIN" ] && [ $r = 0 ] && printf '%s' "$cm" | grep -q "^COMMITTED data_dir=$B (the previous folder $A is no longer authorized)" && SSH cgn-authorize --status | grep -q "^STATUS data_dir=$B .* pending_data_dir=none serving=$B\$" && [ "$(dk exec "$cur" sh -c "wc -l < $CONF")" = 5 ] && echo 0 || echo 1)" "$cm"
stop "$cur"; x=$(start prior-after-commit "$A"); o=$(outcome "$x"); l=$(logs "$x"); dk rm -f -v "$x" >/dev/null 2>&1
chk "G8 after the commit, booting the PRIOR folder is refused (78)" "$([ "$o" = "exited 78" ] && printf '%s' "$l" | grep -q 'REFUSED: MCHEZO_DATA_DIR is not the authorized data folder' && echo 0 || echo 1)" "$o; $l"
cur=$(start committed "$B"); o=$(outcome "$cur")
chk "G8 the committed folder starts as APPROVED" "$([ "$o" = "up $PIN" ] && logs "$cur" | grep -q "the APPROVED data folder $B" && echo 0 || echo 1)" "$o"

echo "-- G9: interrupted record changes"
dk exec "$cur" sh -c "printf 'data_dir=/var/data/half\npublic_or' > $CONF.part.99999" >/dev/null 2>&1
r0=$(recsum); dk restart -t 30 "$cur" >/dev/null 2>&1; o=$(outcome "$cur")
p=$(SSH cgn-authorize --prepare "$C"); r=$?
chk "G9 a leftover partial file (an interrupted change) is ignored by the entrypoint and removed by the next change" "$([ "$o" = "up $PIN" ] && [ $r = 0 ] && ! dk exec "$cur" test -e "$CONF.part.99999" && echo 0 || echo 1)" "$o; $p"
SSH cgn-authorize --abort "$C" >/dev/null
r0=$(recsum)
dk exec -d "$cur" sh -c "exec flock -o $CONF.lock sleep 60" >/dev/null 2>&1; sleep 0.5
dk exec -d "$cur" sh -c "echo \$\$ > /tmp/w6g-waiter.pid; exec cgn-authorize --prepare $C" >/dev/null 2>&1; sleep 1
wp=$(dk exec "$cur" cat /tmp/w6g-waiter.pid 2>/dev/null)
kill_in() { dk exec "$cur" sh -c "kill -9 $1 && sleep 0.3 && ! kill -0 $1 2>/dev/null" >/dev/null 2>&1; }   # (the image has no kill binary)
kill_in "$wp"; kw=$?
chk "G9 a change killed (SIGKILL, confirmed gone) while it waited for the lock leaves the record exactly as it was" "$([ -n "$wp" ] && [ $kw = 0 ] && [ "$(recsum)" = "$r0" ] && SSH cgn-authorize --status | grep -q 'pending_data_dir=none' && echo 0 || echo 1)" "waiter pid ${wp:-none}, kill $kw"
t0=$(date +%s); to=$(SSH cgn-authorize --prepare "$C"); rto=$?; t1=$(date +%s)
chk "G9 a lock held past 10 s refuses the change, and the record is unchanged" "$([ $rto = 1 ] && printf '%s' "$to" | grep -q 'another change of the record is in progress' && [ $((t1 - t0)) -ge 9 ] && [ "$(recsum)" = "$r0" ] && echo 0 || echo 1)" "$((t1 - t0)) s: $to"
dk exec -d "$cur" sh -c "echo \$\$ > /tmp/w6g-waiter2.pid; exec cgn-authorize --prepare $C > /tmp/w6g-waiter2.out 2>&1" >/dev/null 2>&1; sleep 1
hp=$(dk exec "$cur" sh -c "for p in /proc/[0-9]*; do tr '\\0' ' ' < \$p/cmdline 2>/dev/null | grep -q '^flock -o .*sleep 60' && basename \$p; done" | head -1)
kill_in "$hp"; kh=$?; sleep 1.5
w2=$(dk exec "$cur" cat /tmp/w6g-waiter2.out 2>/dev/null)
chk "G9 the lock holder killed (SIGKILL, confirmed gone) mid-change: the lock is released, and the waiting change completes" "$([ -n "$hp" ] && [ $kh = 0 ] && printf '%s' "$w2" | grep -q "^PREPARED pending_data_dir=$C " && echo 0 || echo 1)" "holder ${hp:-none}, kill $kh: $w2"
SSH cgn-authorize --abort "$C" >/dev/null

echo "-- M1-M10: unusable records (a separate fixture volume; nothing in it is data)"
good=$(dk exec "$cur" cat "$CONF")
stop "$cur"; cur=""
put() { dk run --rm -i --label "w6g.owner=$RUNID" -v "$VOL2:/var/data" --entrypoint sh "$IMG" -c "rm -rf $CONF; $1" >/dev/null 2>&1; }
salt=$(printf '%s\n' "$good" | sed -n 's/^code_salt=//p')
for v in "M1 truncated (no code_sha256)|printf '%s\n' \"\$(head -n 4)\" > $CONF|code_sha256 is missing" \
         "M2 an unknown key|{ cat; echo 'admin=1'; } > $CONF|an unknown key" \
         "M3 a repeated key|{ cat; echo 'data_dir=$C'; } > $CONF|the key data_dir appears twice" \
         "M4 a line without '='|{ cat; echo 'garbage'; } > $CONF|a line without" \
         "M5 a STALE pending entry|{ cat; printf 'pending_data_dir=$C\npending_base=/var/data/w6g-elsewhere\n'; } > $CONF|STALE" \
         "M6 a pending entry without its pair|{ cat; echo 'pending_data_dir=$C'; } > $CONF|a pending entry without its pair" \
         "M7 an empty file|: > $CONF|data_dir is missing" \
         "M8 a symbolic link|cat > /var/data/real.conf; ln -s /var/data/real.conf $CONF|not a regular file" \
         "M9 a folder|mkdir -p $CONF|not a regular file" \
         "M10 a non-hex salt|sed 's/^code_salt=.*/code_salt=${salt%????}zzzz/' > $CONF|code_salt is missing or not hex"; do
  IFS='|' read -r name how want <<< "$v"
  printf '%s\n' "$good" | put "$how"
  x=$(start "m" "$B" "" "" "" "$VOL2"); o=$(outcome "$x"); l=$(logs "$x"); dk rm -f -v "$x" >/dev/null 2>&1
  s=$(dk run --rm --label "w6g.owner=$RUNID" -v "$VOL2:/var/data" --entrypoint cgn-authorize "$IMG" --status 2>&1); sr=$?
  pp=$(dk run --rm --label "w6g.owner=$RUNID" -v "$VOL2:/var/data" --entrypoint cgn-authorize "$IMG" --prepare "$C" 2>&1); pr=$?
  chk "$name: the start exits 78 with the reason; --status says UNUSABLE (exit 1); --prepare is refused" "$([ "$o" = "exited 78" ] && printf '%s' "$l" | grep -q "REFUSED: the authorized configuration at $CONF is unusable (.*$want" && [ $sr = 1 ] && printf '%s' "$s" | grep -q "^STATUS UNUSABLE: .*$want" && [ $pr = 1 ] && printf '%s' "$pp" | grep -q 'is unusable' && echo 0 || echo 1)" "$o; $l; $s"
done
