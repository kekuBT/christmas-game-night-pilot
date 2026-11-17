#!/bin/bash
# W7 owner packet (reviews 6955337359, 6955682854): focused negative tests of scripts/beta/w7-owner-preview.sh. No release
# builds, except S7, which starts one real `prepare` and interrupts it. Everything happens under a private temporary
# base; the sentinels of "another owner" must survive every case.
#   bash w7-owner-selftest.sh [path to w7-owner-preview.sh]
# S1  an unprepared root (a real git repo at src/, foreign data): every command refuses; nothing deleted
# S2  a valid record copied to another root: refused (root mismatch)
# S3  a tampered record: a symlinked record, a foreign marker, a loose mode: refused
# S4  a REPLACED run folder (same name, recreated by another task; also with a copied token file): every command refuses
# S5  a symlinked run folder: refused; the target outside survives
# S6  the happy path: the run folder goes, the record is retired; pre-existing folders outside it, src and evidence stay
# S6b a cleanup RETRY after success, with a replacement run folder and sentinels: a no-op; other commands refuse
# S7  an interrupted prepare (killed mid-build): cleanup removes the run folder (code, checkout), prunes the worktree;
#     then a retry with a replacement is a no-op
# S8  a PARTIAL cleanup (interrupted right after the code, local-test hook) then a retry: the retry finishes; then a
#     replacement is untouched
# S9  pre-existing unowned directories with the shared names (data, backups, probe, secret, run, compat-x) in a prepared
#     root: backup, probe and cleanup never use, adopt or remove them
# S10 the local-test flag inside a Codespace (all, or any one, of the Codespaces variables): refused before any change
# S11 the probe-report gate, on SYNTHETIC report fixtures (not a browser result)
set -uo pipefail
TOOL=$(cd "$(dirname "${1:-$(dirname "$0")/w7-owner-preview.sh}")" && pwd)/$(basename "${1:-w7-owner-preview.sh}")
[ -f "$TOOL" ] || { echo "no tool at $TOOL"; exit 2; }
REPO=$(git -C "$(dirname "$TOOL")" rev-parse --show-toplevel)
B=$(mktemp -d "${TMPDIR:-/tmp}/w7op-selftest.XXXXXX"); pg=; trap '[ -n "$pg" ] && kill -KILL -- "-$pg" 2>/dev/null; rm -rf "$B"' EXIT
OUT="$B/outside"; mkdir -p "$OUT"; echo "another owner's data" > "$OUT/sentinel"
bad=0; n=0
ok() { n=$((n + 1)); if [ "$1" = 0 ]; then echo "PASS $2"; else echo "FAIL $2"; bad=1; fi; }
clean_env() { env -u CODESPACES -u CODESPACE_NAME -u GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN -u W7OP_LOCAL_TEST -u W7OP_TEST_INTERRUPT_CLEANUP "$@"; }
tool_local() { clean_env W7OP_LOCAL_TEST=1 bash "$TOOL" "$@"; }
tool_cs() { clean_env CODESPACES=true CODESPACE_NAME=selftest-cs GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev bash "$TOOL" "$@"; }
outside_ok() { [ "$(cat "$OUT/sentinel" 2>/dev/null)" = "another owner's data" ]; }
mkroot() { local r=$B/$1; mkdir -p "$r"; git init -q "$r/src"; echo "$r"; }
SHARED="data backups secret probe run compat-x"
seed_foreign() { local r=$1 d; for d in $SHARED; do mkdir -p "$r/$d"; echo "foreign $d" > "$r/$d/unrelated-sentinel"; done; }
foreign_ok() { local r=$1 d; for d in $SHARED; do [ "$(cat "$r/$d/unrelated-sentinel" 2>/dev/null)" = "foreign $d" ] || return 1; done; }
prepared() { # prepared <root> [entries in the run folder...]: what `prepare` leaves, written the way the tool writes it
  local r; r=$(cd "$1" && pwd -P); shift; local t; t=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  { echo "w7op-owner 3"; echo "root $r"; echo "token $t"; echo "created $(date -u +%FT%TZ)"; echo "ns w7op-$t"; } > "$r/.w7op-owner"; chmod 600 "$r/.w7op-owner"
  mkdir -m 700 "$r/w7op-$t"; echo "$t" > "$r/w7op-$t/.w7op-ns"; echo "ns-id $(stat -c %d:%i:%.9W "$r/w7op-$t")" >> "$r/.w7op-owner"
  local e; for e in "$@"; do mkdir -p "$r/w7op-$t/$e"; echo x > "$r/w7op-$t/$e/f"; done
  mkdir -p "$r/evidence"; echo keep > "$r/evidence/keep"; echo "$r/w7op-$t"
}
retired() { grep -q '^retired ' "$1/.w7op-owner"; }
echo "# W7 owner tool self-test: $TOOL (sha256 $(sha256sum "$TOOL" | cut -c1-16)), $(date -u +%FT%TZ)"

echo "-- S1 an unprepared root"
R=$(mkroot s1); seed_foreign "$R"
for c in "cleanup" "start current" "stop" "backup b1" "compat b1" "check current" "status"; do
  set -- $c; tool_local "$1" "$R" "${@:2}" > "$B/s1.out" 2>&1; rc=$?
  [ $rc != 0 ] && foreign_ok "$R" && grep -q "was not prepared by this tool" "$B/s1.out"; ok $? "S1 '$c' on an unprepared root is refused as unprepared (exit $rc) and the foreign files survive"
done
timeout 5 env -u CODESPACES -u CODESPACE_NAME -u GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN W7OP_LOCAL_TEST=1 bash "$TOOL" probe "$R" > "$B/s1.out" 2>&1; rc=$?; [ $rc != 0 ] && [ $rc != 124 ] && foreign_ok "$R"; ok $? "S1 'probe' on an unprepared root is refused (exit $rc)"

echo "-- S2 a valid record copied to another root"
R1=$(mkroot s2a); NS1=$(prepared "$R1" secret data); R2=$(mkroot s2b); cp -p "$R1/.w7op-owner" "$R2/.w7op-owner"; seed_foreign "$R2"
tool_local cleanup "$R2" > "$B/s2.out" 2>&1; rc=$?; [ $rc != 0 ] && foreign_ok "$R2" && [ -d "$NS1/secret" ] && grep -q "another root" "$B/s2.out"; ok $? "S2 cleanup with another root's record is refused (exit $rc), and touches neither root"

echo "-- S3 a tampered record"
R=$(mkroot s3a); seed_foreign "$R"; ln -s "$R1/.w7op-owner" "$R/.w7op-owner"
tool_local cleanup "$R" > "$B/s3.out" 2>&1; rc=$?; [ $rc != 0 ] && foreign_ok "$R"; ok $? "S3 a symlinked record is refused (exit $rc)"
R=$(mkroot s3b); NS=$(prepared "$R" secret data); sed -i '1s/.*/someone-else 1/' "$R/.w7op-owner"
tool_local cleanup "$R" > "$B/s3.out" 2>&1; rc=$?; [ $rc != 0 ] && [ -d "$NS/secret" ]; ok $? "S3 a foreign marker is refused (exit $rc)"
R=$(mkroot s3c); NS=$(prepared "$R" secret data); chmod 644 "$R/.w7op-owner"
tool_local cleanup "$R" > "$B/s3.out" 2>&1; rc=$?; [ $rc != 0 ] && [ -d "$NS/secret" ]; ok $? "S3 a record readable by others (mode 644) is refused (exit $rc)"

echo "-- S4 a replaced run folder"
R=$(mkroot s4a); NS=$(prepared "$R" secret data run); rm -rf "$NS"; mkdir -p "$NS/data"; echo "foreign replacement" > "$NS/data/replacement-sentinel"
for c in "cleanup" "start current" "stop" "backup b1" "compat b1" "check current" "status"; do
  set -- $c; tool_local "$1" "$R" "${@:2}" > "$B/s4.out" 2>&1; rc=$?
  [ $rc != 0 ] && [ -f "$NS/data/replacement-sentinel" ] && grep -q "no matching token file" "$B/s4.out"; ok $? "S4 '$c' with a replaced run folder (no token file) is refused on the token file (exit $rc); the replacement survives"
done
R=$(mkroot s4b); NS=$(prepared "$R" secret data); cp "$NS/.w7op-ns" "$B/tok"; rm -rf "$NS"; mkdir -p "$NS/data"; cp "$B/tok" "$NS/.w7op-ns"; echo "foreign replacement" > "$NS/data/replacement-sentinel"
tool_local cleanup "$R" > "$B/s4.out" 2>&1; rc=$?; [ $rc != 0 ] && [ -f "$NS/data/replacement-sentinel" ] && grep -q "not the folder this run created" "$B/s4.out"; ok $? "S4 a replacement carrying a copied token file is refused on its identity, even if its inode number is reused (exit $rc); the replacement survives"

echo "-- S5 a symlinked run folder"
R=$(mkroot s5); NS=$(prepared "$R" secret data); rm -rf "$NS"; ln -s "$OUT" "$NS"
tool_local cleanup "$R" > "$B/s5.out" 2>&1; rc=$?; [ $rc != 0 ] && outside_ok && [ -L "$NS" ]; ok $? "S5 a symlinked run folder is refused (exit $rc); nothing outside is touched"

echo "-- S6 the happy path, then S6b a retry with a replacement"
R=$(mkroot s6); seed_foreign "$R"; NS=$(prepared "$R" secret data backups probe run compat-a); echo mine-not > "$R/notes.txt"
tool_local cleanup "$R" > "$B/s6.out" 2>&1; rc=$?
[ $rc = 0 ] && [ ! -e "$NS" ] && retired "$R" && foreign_ok "$R" && [ -f "$R/notes.txt" ] && [ -f "$R/evidence/keep" ] && [ -d "$R/src/.git" ]; ok $? "S6 cleanup removes the run folder and retires the record; the pre-existing shared-name folders, an unrelated file, src and evidence survive (exit $rc)"
mkdir -p "$NS/data" "$NS/secret"; echo "foreign replacement" > "$NS/data/replacement-sentinel"; cp "$OUT/sentinel" "$NS/secret/replacement-sentinel"
tool_local cleanup "$R" > "$B/s6b.out" 2>&1; rc=$?
[ $rc = 0 ] && [ -f "$NS/data/replacement-sentinel" ] && [ -f "$NS/secret/replacement-sentinel" ] && foreign_ok "$R" && grep -q "already cleaned up" "$B/s6b.out"; ok $? "S6b a cleanup RETRY after success is a no-op: the replacement run folder and its sentinels survive (exit $rc)"
for c in "start current" "backup b2" "status"; do
  set -- $c; tool_local "$1" "$R" "${@:2}" > "$B/s6c.out" 2>&1; rc=$?
  [ $rc != 0 ] && grep -q "this run was cleaned up" "$B/s6c.out" && [ -f "$NS/data/replacement-sentinel" ]; ok $? "S6b '$c' on a retired run is refused as retired (exit $rc)"
done

echo "-- S7 an interrupted prepare"
R="$B/s7"; mkdir -p "$R"; git clone -q --no-hardlinks "$REPO" "$R/src" && git -C "$R/src" checkout -q --detach "$(git -C "$REPO" rev-parse HEAD)"
# started directly (no subshell or function), so $! is the env process that setsid turns into the new group's leader
env -u CODESPACES -u CODESPACE_NAME -u GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN W7OP_LOCAL_TEST=1 setsid bash "$TOOL" prepare "$R" > "$B/s7-prepare.out" 2>&1 &
pg=$!
for _ in $(seq 1 240); do ls -d "$R"/w7op-*/co-* > /dev/null 2>&1 && [ -s "$(ls -d "$R"/w7op-* | head -1)/secret/code" ] && break; sleep 0.25; done
NS=$(ls -d "$R"/w7op-* 2>/dev/null | head -1)
[ -n "$NS" ] && [ -s "$NS/secret/code" ] && ls -d "$NS"/co-* > /dev/null 2>&1; ok $? "S7 prepare created the run folder, the code and a build checkout before the interruption"
kill -KILL -- "-$pg"; kr=$?; for _ in $(seq 1 40); do pgrep -g "$pg" > /dev/null || break; sleep 0.25; done
[ $kr = 0 ] && ! pgrep -g "$pg" > /dev/null; ok $? "S7 the whole prepare process group was killed (kill exit $kr; none left)"
seed_foreign "$R"
tool_local cleanup "$R" > "$B/s7.out" 2>&1; rc=$?
[ $rc = 0 ] && [ ! -e "$NS" ] && retired "$R" && foreign_ok "$R" && [ "$(git -C "$R/src" worktree list --porcelain | grep -c '^worktree')" = 1 ]; ok $? "S7 cleanup after the interruption removes the run folder (code and checkout), prunes the worktree, keeps foreign files (exit $rc)"
sed 's/^/     /' "$B/s7.out"
mkdir -p "$NS/secret"; echo "foreign replacement" > "$NS/secret/replacement-sentinel"
tool_local cleanup "$R" > "$B/s7b.out" 2>&1; rc=$?; [ $rc = 0 ] && [ -f "$NS/secret/replacement-sentinel" ]; ok $? "S7 then a retry with a replacement is a no-op (exit $rc)"

echo "-- S8 a partial cleanup, then a retry"
R=$(mkroot s8); NS=$(prepared "$R" secret data backups run); seed_foreign "$R"
clean_env W7OP_LOCAL_TEST=1 W7OP_TEST_INTERRUPT_CLEANUP=after-secret bash "$TOOL" cleanup "$R" > "$B/s8.out" 2>&1; rc=$?
[ $rc = 3 ] && [ ! -e "$NS/secret" ] && [ -d "$NS/data" ] && ! retired "$R"; ok $? "S8 the interrupted cleanup removed the code first and stopped (exit $rc); the rest is still there and the record isn't retired"
tool_local cleanup "$R" > "$B/s8b.out" 2>&1; rc=$?
[ $rc = 0 ] && [ ! -e "$NS" ] && retired "$R" && foreign_ok "$R"; ok $? "S8 the retry finishes the removal and retires the record; the foreign folders survive (exit $rc)"
mkdir -p "$NS/data"; echo "foreign replacement" > "$NS/data/replacement-sentinel"
tool_local cleanup "$R" > "$B/s8c.out" 2>&1; rc=$?; [ $rc = 0 ] && [ -f "$NS/data/replacement-sentinel" ]; ok $? "S8 then another retry with a replacement is a no-op (exit $rc)"

echo "-- S9 pre-existing unowned directories with the shared names"
R=$(mkroot s9); NS=$(prepared "$R" run data); seed_foreign "$R"; mkdir -p "$R/src/scripts/preview"; cp "$REPO/scripts/preview/probe-forwarded-origin.mjs" "$R/src/scripts/preview/"
tool_local backup "$R" b1 > "$B/s9.out" 2>&1; rc=$?
foreign_ok "$R" && [ -d "$NS/backups" ] && [ ! -e "$R/backups/b1" ]; ok $? "S9 backup works inside the run folder only; the pre-existing shared backups folder is not adopted (exit $rc: no release here)"
timeout 5 env -u CODESPACES -u CODESPACE_NAME -u GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN W7OP_LOCAL_TEST=1 bash "$TOOL" probe "$R" > "$B/s9p.out" 2>&1; rc=$?
foreign_ok "$R" && [ -f "$NS/probe/probe.mjs" ] && [ ! -e "$R/probe/probe.mjs" ]; ok $? "S9 probe works inside the run folder only; the pre-existing shared probe folder is not adopted (exit $rc)"
tool_local cleanup "$R" > "$B/s9c.out" 2>&1; rc=$?; [ $rc = 0 ] && foreign_ok "$R" && [ ! -e "$NS" ]; ok $? "S9 cleanup removes the run folder and none of the pre-existing shared-name folders (exit $rc)"

echo "-- S10 the local-test flag inside a Codespace"
R=$(mkroot s10); seed_foreign "$R"; before=$(cd "$R" && find . | sort | sha256sum)
for vars in "CODESPACES=true CODESPACE_NAME=cs GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev" "CODESPACES=true" "CODESPACE_NAME=cs" "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev"; do
  for c in inspect "prepare $R" "start $R current" "cleanup $R"; do
    # shellcheck disable=SC2086
    clean_env $vars W7OP_LOCAL_TEST=1 bash "$TOOL" $c > "$B/s10.out" 2>&1; rc=$?
    [ $rc != 0 ] && grep -q "W7OP_LOCAL_TEST is not allowed in a Codespace" "$B/s10.out"; ok $? "S10 [$vars] '$(echo $c | cut -d' ' -f1)' with W7OP_LOCAL_TEST=1 is refused before anything (exit $rc)"
  done
done
[ "$(cd "$R" && find . | sort | sha256sum)" = "$before" ] && foreign_ok "$R"; ok $? "S10 the root is byte-for-byte unchanged"

echo "-- S11 the probe-report gate (SYNTHETIC report fixtures, not a browser result)"
R=$(mkroot s11); NS=$(prepared "$R" run data)
gate() { # gate <label> <fixture json or ''> <expected text>
  rm -f "$R/evidence/probe-report.json"; [ -n "$2" ] && printf '%s\n' "$2" > "$R/evidence/probe-report.json"
  tool_cs start "$R" current > "$B/s11.out" 2>&1; local rc=$?
  [ $rc != 0 ] && grep -q -- "$3" "$B/s11.out"; ok $? "S11 SYNTHETIC $1: start refused with '$3' (exit $rc)"
}
gate "no report" "" "verdict is none"
gate "UNSUITABLE" '{"verdict":"UNSUITABLE","why":"synthetic"}' "verdict is UNSUITABLE"
gate "INCOMPLETE" '{"verdict":"INCOMPLETE","why":"synthetic"}' "verdict is INCOMPLETE"
gate "UNSAFE" '{"verdict":"UNSAFE","why":"synthetic"}' "verdict is UNSAFE"
gate "PRESERVED with an http origin" '{"verdict":"PRESERVED","ownOrigin":"http://localhost:3157"}' "isn't https"
gate "REWRITTEN_SAME_ORIGIN_ONLY with no origin" '{"verdict":"REWRITTEN_SAME_ORIGIN_ONLY"}' "isn't https"
gate "a passing https report (the gate passes; no release is prepared here)" '{"verdict":"REWRITTEN_SAME_ORIGIN_ONLY","ownOrigin":"https://localhost:3157"}' "current isn't prepared"
outside_ok; ok $? "the outside sentinel survived every case"

echo "== W7 OWNER TOOL SELFTEST $([ $bad = 0 ] && echo PASSED || echo FAILED), $n checks, $(date -u +%FT%TZ)"; exit $bad
