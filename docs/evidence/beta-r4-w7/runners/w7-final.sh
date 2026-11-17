#!/bin/bash
# W7 (handoff 6941129590): every final check, in order, on ONE clean checkout of the candidate. Each run's log goes to
# <out dir>; the verdict of each is its own last line and exit code, never combined with another revision's runs.
#   bash w7-final.sh <clean checkout> <local rebuild archive of 7097ac2> <predecessor archive> <predecessor inventory> <out dir>
# 1 static        docs/evidence/beta-r4-w7/runners/w7-static.sh, against W7_BASE (default d2b1242, the PR's base)
# 2 image checks  the W6 repair harness (docs/evidence/beta-r4-w6/runners/image-checks-w6r.sh with the committed helpers),
#                 building cgn-render:check (the CURRENT image) from THIS checkout's deploy/render (test pin)
# 3 artifact      scripts/beta/w7-artifact-check.sh: the predecessor (LOCAL SURROGATE f93e9cb) through the same gate,
#                 building cgn-render:w7-pred, and the gate's refusals of a wrong artifact (A2-A4)
# 4 W7            scripts/beta/w7-selftest.sh cgn-render:check cgn-render:w7-pred (the rollback rehearsal is its T2)
# 5 guard         scripts/beta/w6-guard-selftest.sh cgn-render:check     (the W6 guard regressions)
# 6 hold          scripts/beta/w6-hold-selftest.sh cgn-render:check      (the W6 hold regressions)
# 7 W6            scripts/beta/w6-selftest.sh cgn-render:check           (the W6 switch, with its receipts)
# 8 W5            scripts/beta/w5-selftest.sh cgn-render:check           (the receipt chain, backup hold and cleanup controls)
set -uo pipefail
CO=$(cd "$1" && pwd); ARC=$2; PARC=$3; PINV=$4; OUT=$5
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
cd "$CO" || exit 2
C=$(git rev-parse HEAD)
echo "== w7-final on $C (status $(git status --porcelain | wc -l) lines), $(date -u +%FT%TZ)" | tee "$OUT/summary.txt"
step() { # step <name> <command...>
  local n=$1 s rc; shift; s=$(date +%s)
  "$@" > "$OUT/$n.log" 2>&1; rc=$?
  echo "$n: exit $rc in $(( $(date +%s) - s )) s; last line: $(tail -1 "$OUT/$n.log")" | tee -a "$OUT/summary.txt"
}
H="$OUT/harness"; rm -rf "$H"; mkdir -p "$H"
cp docs/evidence/beta-r4-w6/runners/image-checks-w6r.sh "$H/image-checks.sh"
for f in build.sh assemble.sh api.mjs; do cp "docs/evidence/beta-r4-render-package/harness/$f.txt" "$H/$f"; done
step 1-static bash docs/evidence/beta-r4-w7/runners/w7-static.sh "$CO" "${W7_BASE:-d2b1242e89fc2d38c4b9471ec88176db1b3ee690}"
step 2-image-checks bash "$H/image-checks.sh" "$CO/deploy/render" "$ARC" "$OUT/image-checks-work"
step 3-artifact-check bash scripts/beta/w7-artifact-check.sh "$CO/deploy/render" "$PARC" "$PINV" f93e9cba8613859be9891706ead1c60157c73de2 "$ARC" "$H/build.sh" "$OUT/artifact-work" cgn-render:w7-pred
step 4-w7-selftest bash scripts/beta/w7-selftest.sh cgn-render:check cgn-render:w7-pred --work "$OUT/w7-work"
step 5-guard-selftest bash scripts/beta/w6-guard-selftest.sh cgn-render:check
step 6-hold-selftest bash scripts/beta/w6-hold-selftest.sh cgn-render:check
step 7-w6-selftest bash scripts/beta/w6-selftest.sh cgn-render:check --work "$OUT/w6-work"
step 8-w5-selftest bash scripts/beta/w5-selftest.sh cgn-render:check --work "$OUT/w5-work"
echo "== images under test: current $(docker image inspect -f '{{.Id}}' cgn-render:check), previous $(docker image inspect -f '{{.Id}}' cgn-render:w7-pred); checkout still clean: $(git status --porcelain | wc -l) lines; $(date -u +%FT%TZ)" | tee -a "$OUT/summary.txt"
