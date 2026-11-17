#!/bin/bash
# Local validation of scripts/beta/w7-owner-preview.sh (W7OP_LOCAL_TEST=1; NOT a Codespace; no GitHub forwarder).
# Review 6955337359: the browser step must launch and reach a verdict, and the verdict must be exactly UNSUITABLE.
# Usage: bash local-run.sh <scratch dir holding r2/node (Node v22.16.0) and r4p5/> <clean checkout of the packet commit>
set -uo pipefail
SP=$1; REPO=$(cd "$2" && pwd); W=$SP/r4p5/work; T="bash $REPO/scripts/beta/w7-owner-preview.sh"
export PATH=$SP/r2/node/node-v22.16.0-linux-x64/bin:$PATH W7OP_LOCAL_TEST=1
ok() { if [ "$1" = 0 ]; then echo "PASS $2"; else echo "FAIL $2"; BAD=1; fi; }
BAD=0; rm -rf "$W" "$SP/r4p5/priv"; mkdir -p "$W"; git clone -q --no-hardlinks "$REPO" "$W/src" && git -C "$W/src" checkout -q --detach "$(git -C "$REPO" rev-parse HEAD)"
echo "== local run, $(date -u +%FT%TZ); packet checkout $(git -C "$W/src" rev-parse HEAD); script sha256 $(sha256sum "$REPO/scripts/beta/w7-owner-preview.sh" | cut -c1-16)"
echo "-- 1 inspect"; $T inspect; ok $? "inspect (read-only)"
echo "-- 2 outside a Codespace without the test flag"; W7OP_LOCAL_TEST= $T prepare "$W" 2>&1 | tail -1; [ "${PIPESTATUS[0]}" != 0 ]; ok $? "refused outside a Codespace"
echo "-- 3 prepare (both releases)"; $T prepare "$W" 2>&1 | grep -v '^npm warn'; ok "${PIPESTATUS[0]}" "prepare: both inventories match"
cat "$W/evidence/identity.txt"
echo "-- 4 prepare again"; $T prepare "$W" 2>&1 | tail -1; [ "${PIPESTATUS[0]}" != 0 ]; ok $? "a second prepare into the same folder is refused"
echo "-- 5 the probe, driven by headless Chromium on plain http loopback (expected verdict: UNSUITABLE; not GitHub's forwarder)"
( $T probe "$W" > "$SP/r4p5/probe.out" 2>&1 & ); sleep 2
node "$REPO/docs/evidence/beta-r4-w7/owner-packet/runners/probe-drive.cjs" "http://127.0.0.1:3158/" "http://127.0.0.1:3157/"; ok $? "the browser launched and drove both probe pages to a verdict"
pkill -INT -f "probe.mjs --target-port 3157"
for _ in $(seq 1 20); do (exec 3<>/dev/tcp/127.0.0.1/3157) 2>/dev/null || break; sleep 0.5; done; (exec 3<>/dev/tcp/127.0.0.1/3157) 2>/dev/null; [ $? != 0 ]; ok $? "the probe stopped on SIGINT and freed 3157"
v=$(node -e 'process.stdout.write(require(process.argv[1]).verdict)' "$W/evidence/probe-report.json"); echo "probe report verdict: $v"
[ "$v" = UNSUITABLE ]; ok $? "the browser-driven plain-http probe's verdict is exactly UNSUITABLE (got $v)"
out=$($T start "$W" current 2>&1); rc=$?; echo "$out" | tail -1; [ $rc != 0 ] && grep -q "verdict is UNSUITABLE" <<< "$out"; ok $? "start refused because of that UNSUITABLE verdict (no HTTP allowance)"
mv "$W/evidence/probe-report.json" "$W/evidence/probe-report-local-http.json"
echo "-- 6 phase A: current"; $T start "$W" current; ok $? "start current: /health = 988c535"
out=$($T start "$W" previous 2>&1); rc=$?; echo "$out" | tail -1; [ $rc != 0 ] && grep -q "already running" <<< "$out"; ok $? "a second writer is refused (one writer)"
NS=$(ls -d "$W"/w7op-* | head -1); echo "run folder: ${NS##*/}"; mkdir -m 700 "$SP/r4p5/priv"; cp "$NS/secret/code" "$SP/r4p5/priv/code"
W5_OWNER=w7op node "$REPO/scripts/beta/w5-seed.mjs" seed http://127.0.0.1:3157 "$SP/r4p5/priv"; ok $? "synthetic room seeded on current (finished game, approved entry, 3 acknowledged answers)"
echo "-- 7 pause P1 -> rollback"; $T stop "$W"; ok $? "stop current"
$T backup "$W" before-rollback; ok $? "backup + verify by both releases"
$T compat "$W" before-rollback; ok $? "the previous release verifies, restores and checks the copy"
$T start "$W" previous; ok $? "start previous: /health = 7097ac2"
W5_OWNER=w7op node "$REPO/scripts/beta/w5-seed.mjs" resume http://127.0.0.1:3157 "$SP/r4p5/priv"; ok $? "on previous: same seats, approved entry, answers kept; ONE new answer acknowledged"
echo "-- 8 return"; $T stop "$W"; ok $? "stop previous"
$T backup "$W" before-return; ok $? "backup before the return"
$T check "$W" current; ok $? "the current release's datatool check accepts what the previous one wrote"
$T start "$W" current; ok $? "start current again: /health = 988c535"
W5_OWNER=w7op node "$REPO/scripts/beta/w6-check.mjs" live http://127.0.0.1:3157 "$SP/r4p5/priv" fallback; ok $? "after the return (read-only): seats work, the approved entry is there, and the action made on the previous release is present with its value"
$T status "$W"; $T stop "$W"; ok $? "stop"
echo "-- 9 cleanup, a retry with a replacement, and the leak scan"; code=$(cat "$NS/secret/code"); $T cleanup "$W"; ok $? "cleanup"
[ ! -e "$NS" ] && grep -q "^retired " "$W/.w7op-owner"; ok $? "the run folder (data, code, backups, builds) is gone and the record is retired"
mkdir -p "$NS/data"; echo "another task" > "$NS/data/replacement-sentinel"; $T cleanup "$W"; rc=$?
[ $rc = 0 ] && [ -f "$NS/data/replacement-sentinel" ]; ok $? "a cleanup retry leaves a replacement folder with the same name untouched (exit $rc)"; rm -rf "$NS"
hits=$(grep -rlF -- "$code" "$W" "$SP/r4p5/probe.out" 2>/dev/null | grep -v "/priv/" || true); [ -z "$hits" ]; ok $? "the code appears in no evidence, log or release file ($([ -z "$hits" ] && echo 0 || echo "$hits") files)"
rm -rf "$SP/r4p5/priv"
echo "== verdict: $([ $BAD = 0 ] && echo 'LOCAL RUN PASSED' || echo 'LOCAL RUN FAILED') ($(date -u +%FT%TZ))"; exit $BAD
