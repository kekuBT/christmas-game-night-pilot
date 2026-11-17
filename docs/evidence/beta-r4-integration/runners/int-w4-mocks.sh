#!/bin/bash
# The W4 control mocks (K0 and K0M) for handoff 6936988676, without the real-Docker cases K1-K8.
# It runs the candidate's OWN committed K0/K0M lines (scripts/beta/w4-selftest.sh lines 41-44 and 47-72, printed
# below before they run), so the cases and the six weakening edits are exactly the reviewed ones.
#   bash int-w4-mocks.sh <checkout dir> <work dir>
# Exit 0 "W4 CONTROL MOCKS PASSED", 1 "W4 CONTROL MOCKS FAILED".
set -uo pipefail
ROOT=$(cd "$1" && pwd) || exit 2
WORK=$2; mkdir -p "$WORK"; WORK=$(cd "$WORK" && pwd)
S="$ROOT/scripts/beta/w4-selftest.sh"
TAG=$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')
echo "== int-w4-mocks $(date -u +%FT%TZ), checkout $(git -C "$ROOT" rev-parse HEAD) (status $(git -C "$ROOT" status --porcelain | wc -l) lines), tag $TAG"
echo "   w4-selftest.sh $(sha256sum "$S" | cut -c1-16), w4-control.sh $(sha256sum "$ROOT/scripts/beta/w4-control.sh" | cut -c1-16), w4-control-selftest.sh $(sha256sum "$ROOT/scripts/beta/w4-control-selftest.sh" | cut -c1-16)"
body=$(sed -n '41,44p;47,72p' "$S")
echo "-- the committed lines that run (w4-selftest.sh 41-44, 47-72):"; printf '%s\n' "$body" | sed 's/^/   > /'
eval "$body"
echo "== K0 log: $(grep -c '^PASS' "$WORK/K0-$TAG.log") PASS, $(grep -c '^FAIL' "$WORK/K0-$TAG.log") FAIL; $(tail -1 "$WORK/K0-$TAG.log")"
echo "== K0M log: $(grep -c '^PASS' "$WORK/K0M-$TAG.log") PASS, $(grep -c '^FAIL' "$WORK/K0M-$TAG.log") FAIL (required to fail); $(tail -1 "$WORK/K0M-$TAG.log")"
echo "== $passn passed, $failn failed"
if [ "$failn" = 0 ] && [ "$passn" = 7 ]; then echo "W4 CONTROL MOCKS PASSED"; exit 0; else echo "W4 CONTROL MOCKS FAILED"; exit 1; fi
