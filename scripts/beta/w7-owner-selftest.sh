#!/bin/bash
# W7 owner packet (review 6955337359): focused negative tests of scripts/beta/w7-owner-preview.sh. No release builds,
# except S7, which starts one real `prepare` and interrupts it. Everything happens under a private temporary base; the
# sentinels of "another owner" must survive every case.
#   bash w7-owner-selftest.sh [path to w7-owner-preview.sh]
# S1 an unprepared root (a real git repo at src/, foreign data): every command refuses; nothing deleted (P1)
# S2 a valid record copied to another root: refused (root mismatch)
# S3 a tampered record: a symlinked record, a foreign marker, a loose mode: refused
# S4 unexpected inventory paths (.., absolute, nested, src, the record, evidence): refused; outside and src survive
# S5 symlink escapes: recorded entries that are symlinks to outside folders are refused; the owned secret is still removed
# S6 the happy path: only recorded entries are removed; foreign files, src and evidence survive; a second cleanup is a no-op
# S7 an interrupted prepare (killed mid-build): cleanup removes the recorded secret and checkout; foreign files survive
# S8 the local-test flag inside a Codespace (all, or any one, of the Codespaces variables): refused before any change (P2)
# S9 the probe-report gate, on SYNTHETIC report fixtures (not a browser result): none, UNSUITABLE, INCOMPLETE, UNSAFE, a
#    non-https origin refused; a passing https report passes the gate (and then stops at the missing release)
set -uo pipefail
TOOL=$(cd "$(dirname "${1:-$(dirname "$0")/w7-owner-preview.sh}")" && pwd)/$(basename "${1:-w7-owner-preview.sh}")
[ -f "$TOOL" ] || { echo "no tool at $TOOL"; exit 2; }
REPO=$(git -C "$(dirname "$TOOL")" rev-parse --show-toplevel)
B=$(mktemp -d "${TMPDIR:-/tmp}/w7op-selftest.XXXXXX"); pg=; trap '[ -n "$pg" ] && kill -KILL -- "-$pg" 2>/dev/null; rm -rf "$B"' EXIT
OUT="$B/outside"; mkdir -p "$OUT"; echo "another owner's data" > "$OUT/sentinel"
bad=0; n=0
ok() { n=$((n + 1)); if [ "$1" = 0 ]; then echo "PASS $2"; else echo "FAIL $2"; bad=1; fi; }
clean_env() { env -u CODESPACES -u CODESPACE_NAME -u GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN -u W7OP_LOCAL_TEST "$@"; }
tool_local() { clean_env W7OP_LOCAL_TEST=1 bash "$TOOL" "$@"; }
tool_cs() { clean_env CODESPACES=true CODESPACE_NAME=selftest-cs GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev bash "$TOOL" "$@"; }
outside_ok() { [ "$(cat "$OUT/sentinel" 2>/dev/null)" = "another owner's data" ]; }
mkroot() { local r=$B/$1; mkdir -p "$r"; git init -q "$r/src"; echo "$r"; }
seed_foreign() { local r=$1 d; for d in data backups secret probe run compat-x; do mkdir -p "$r/$d"; echo "foreign $d" > "$r/$d/unrelated-sentinel"; done; }
foreign_ok() { local r=$1 d; for d in data backups secret probe run compat-x; do [ "$(cat "$r/$d/unrelated-sentinel" 2>/dev/null)" = "foreign $d" ] || return 1; done; }
record() { # record <root> <entries...>: a valid ownership record, written the way the tool writes it
  local r; r=$(cd "$1" && pwd -P); shift
  { echo "w7op-owner 2"; echo "root $r"; echo "token $(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"; echo "created $(date -u +%FT%TZ)"; for e in "$@"; do echo "own $e"; done; } > "$r/.w7op-owner"
  chmod 600 "$r/.w7op-owner"
}
echo "# W7 owner tool self-test: $TOOL (sha256 $(sha256sum "$TOOL" | cut -c1-16)), $(date -u +%FT%TZ)"

echo "-- S1 an unprepared root (P1)"
R=$(mkroot s1); seed_foreign "$R"
for c in "cleanup" "start current" "stop" "backup b1" "compat b1" "check current" "status"; do
  # shellcheck disable=SC2086
  tool_local $c "$R" > "$B/s1.out" 2>&1; rc=$?; [ $rc != 0 ] && foreign_ok "$R"; ok $? "S1 '$c' on an unprepared root is refused (exit $rc) and the foreign files survive"
done
timeout 5 env -u CODESPACES -u CODESPACE_NAME -u GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN W7OP_LOCAL_TEST=1 bash "$TOOL" probe "$R" > "$B/s1.out" 2>&1; rc=$?; [ $rc != 0 ] && [ $rc != 124 ] && foreign_ok "$R"; ok $? "S1 'probe' on an unprepared root is refused (exit $rc)"

echo "-- S2 a valid record copied to another root"
R1=$(mkroot s2a); R2=$(mkroot s2b); record "$R1" secret data; cp -p "$R1/.w7op-owner" "$R2/.w7op-owner"; seed_foreign "$R2"
tool_local cleanup "$R2" > "$B/s2.out" 2>&1; rc=$?; [ $rc != 0 ] && foreign_ok "$R2" && grep -q "root" "$B/s2.out"; ok $? "S2 cleanup with another root's record is refused (exit $rc: $(tail -1 "$B/s2.out" | cut -c1-90))"

echo "-- S3 a tampered record"
R=$(mkroot s3a); seed_foreign "$R"; record "$B/s2a" secret; ln -s "$B/s2a/.w7op-owner" "$R/.w7op-owner"
tool_local cleanup "$R" > "$B/s3.out" 2>&1; rc=$?; [ $rc != 0 ] && foreign_ok "$R"; ok $? "S3 a symlinked record is refused (exit $rc)"
R=$(mkroot s3b); seed_foreign "$R"; record "$R" secret data; sed -i '1s/.*/someone-else 1/' "$R/.w7op-owner"
tool_local cleanup "$R" > "$B/s3.out" 2>&1; rc=$?; [ $rc != 0 ] && foreign_ok "$R"; ok $? "S3 a foreign marker is refused (exit $rc)"
R=$(mkroot s3c); seed_foreign "$R"; record "$R" secret data; chmod 644 "$R/.w7op-owner"
tool_local cleanup "$R" > "$B/s3.out" 2>&1; rc=$?; [ $rc != 0 ] && foreign_ok "$R"; ok $? "S3 a record readable by others (mode 644) is refused (exit $rc)"

echo "-- S4 unexpected inventory paths"
R=$(mkroot s4); mkdir -p "$R/evidence"; echo keep > "$R/evidence/keep"; echo src-file > "$R/src/keep"; mkdir -p "$R/secret"; echo s > "$R/secret/code"
record "$R" secret "../outside" "$OUT" "data/../../outside" "src" ".w7op-owner" "evidence" "secret/code" "rel-notasha"
tool_local cleanup "$R" > "$B/s4.out" 2>&1; rc=$?
[ $rc != 0 ] && outside_ok && [ -f "$R/src/keep" ] && [ -f "$R/evidence/keep" ] && [ -f "$R/.w7op-owner" ] && [ ! -e "$R/secret" ]; ok $? "S4 cleanup refuses ../, absolute, nested, src, the record, evidence and malformed names (exit $rc); outside, src, evidence and the record survive; the recorded secret is removed"
[ "$(grep -c REFUSED "$B/s4.out")" = 8 ]; ok $? "S4 each of the 8 unexpected entries is reported as REFUSED ($(grep -c REFUSED "$B/s4.out"))"

echo "-- S5 symlink escapes"
R=$(mkroot s5); mkdir -p "$R/secret"; echo s > "$R/secret/code"; ln -s "$OUT" "$R/backups"; ln -s "$OUT" "$R/compat-a"
record "$R" secret backups compat-a
tool_local cleanup "$R" > "$B/s5.out" 2>&1; rc=$?
[ $rc != 0 ] && outside_ok && [ ! -e "$R/secret" ] && [ -L "$R/backups" ]; ok $? "S5 symlinked entries are refused, nothing outside is touched, the owned secret is still removed (exit $rc)"

echo "-- S6 the happy path"
R=$(mkroot s6); for d in secret data backups probe run compat-a; do mkdir -p "$R/$d"; echo x > "$R/$d/f"; done; mkdir -p "$R/evidence"; echo keep > "$R/evidence/keep"; echo mine-not > "$R/notes.txt"
record "$R" secret data backups probe run compat-a compat-never-made
tool_local cleanup "$R" > "$B/s6.out" 2>&1; rc=$?
gone=1; for d in secret data backups probe run compat-a; do [ -e "$R/$d" ] && gone=0; done
[ $rc = 0 ] && [ $gone = 1 ] && [ -f "$R/notes.txt" ] && [ -f "$R/evidence/keep" ] && [ -d "$R/src/.git" ]; ok $? "S6 only the recorded entries are removed; an unrecorded file, src and evidence survive; a recorded entry never made is 'not present' (exit $rc)"
tool_local cleanup "$R" > "$B/s6b.out" 2>&1; ok $? "S6 a second cleanup is a no-op (exit 0)"

echo "-- S7 an interrupted prepare"
R="$B/s7"; mkdir -p "$R"; git clone -q --no-hardlinks "$REPO" "$R/src" && git -C "$R/src" checkout -q --detach "$(git -C "$REPO" rev-parse HEAD)"
# started directly (no subshell or function), so $! is the env process that setsid turns into the new group's leader
env -u CODESPACES -u CODESPACE_NAME -u GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN W7OP_LOCAL_TEST=1 setsid bash "$TOOL" prepare "$R" > "$B/s7-prepare.out" 2>&1 &
pg=$!
for _ in $(seq 1 240); do ls -d "$R"/co-* > /dev/null 2>&1 && [ -s "$R/secret/code" ] && break; sleep 0.25; done
[ -s "$R/secret/code" ] && ls -d "$R"/co-* > /dev/null 2>&1; ok $? "S7 prepare created the secret and a build checkout before the interruption"
kill -KILL -- "-$pg"; kr=$?; for _ in $(seq 1 40); do pgrep -g "$pg" > /dev/null || break; sleep 0.25; done
[ $kr = 0 ] && ! pgrep -g "$pg" > /dev/null; ok $? "S7 the whole prepare process group was killed (kill exit $kr; none left)"
echo "foreign" > "$R/notes.txt"
tool_local cleanup "$R" > "$B/s7.out" 2>&1; rc=$?
[ $rc = 0 ] && [ ! -e "$R/secret" ] && ! ls -d "$R"/co-* > /dev/null 2>&1 && [ -f "$R/notes.txt" ] && [ -z "$(git -C "$R/src" worktree list --porcelain | grep -c '^worktree' | grep -vx 1)" ]; ok $? "S7 cleanup after the interruption removes the recorded secret and checkout, prunes the worktree, keeps foreign files (exit $rc)"
sed 's/^/     /' "$B/s7.out"

echo "-- S8 the local-test flag inside a Codespace (P2)"
R=$(mkroot s8); seed_foreign "$R"; before=$(cd "$R" && find . | sort | sha256sum)
for vars in "CODESPACES=true CODESPACE_NAME=cs GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev" "CODESPACES=true" "CODESPACE_NAME=cs" "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev"; do
  for c in inspect "prepare $R" "start $R current" "cleanup $R"; do
    # shellcheck disable=SC2086
    clean_env $vars W7OP_LOCAL_TEST=1 bash "$TOOL" $c > "$B/s8.out" 2>&1; rc=$?
    [ $rc != 0 ] && grep -q "W7OP_LOCAL_TEST is not allowed in a Codespace" "$B/s8.out"; ok $? "S8 [$vars] '$(echo $c | cut -d' ' -f1)' with W7OP_LOCAL_TEST=1 is refused before anything (exit $rc)"
  done
done
[ "$(cd "$R" && find . | sort | sha256sum)" = "$before" ] && foreign_ok "$R"; ok $? "S8 the root is byte-for-byte unchanged"

echo "-- S9 the probe-report gate (SYNTHETIC report fixtures, not a browser result)"
R=$(mkroot s9); mkdir -p "$R/evidence" "$R/run" "$R/data"; record "$R" run data
gate() { # gate <label> <fixture json or ''> <expected text>
  rm -f "$R/evidence/probe-report.json"; [ -n "$2" ] && printf '%s\n' "$2" > "$R/evidence/probe-report.json"
  tool_cs start "$R" current > "$B/s9.out" 2>&1; local rc=$?
  [ $rc != 0 ] && grep -q -- "$3" "$B/s9.out"; ok $? "S9 SYNTHETIC $1: start refused with '$3' (exit $rc)"
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
