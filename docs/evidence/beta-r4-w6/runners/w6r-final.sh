#!/bin/bash
# W6 repair (review 6939462697): every final check, in order, on ONE clean checkout of the candidate. Each run's log goes
# to <out dir>; the verdict of each is its own last line and exit code, never combined with another revision's runs.
#   bash w6r-final.sh <clean checkout> <local rebuild archive of 7097ac2> <a built tree for the native drill> <out dir>
# 1 static        docs/evidence/beta-r4-w6/runners/w6r-static.sh, against W6R_BASE (default 47aa9af, the reviewed head)
# 2 image checks  runners/image-checks-w6r.sh with the committed helpers (docs/evidence/beta-r4-render-package/harness),
#                 building cgn-render:check from THIS checkout's deploy/render (test pin for the local archive)
# 3 guard         scripts/beta/w6-guard-selftest.sh cgn-render:check
# 3b hold         scripts/beta/w6-hold-selftest.sh cgn-render:check (review 6940435060: the guard across backup holds)
# 4 W6            scripts/beta/w6-selftest.sh cgn-render:check
# 5 W5            scripts/beta/w5-selftest.sh cgn-render:check      (receipt chain, backup hold and cleanup controls)
# 6 W4            scripts/beta/w4-selftest.sh cgn-render:check      (restart, guard probe, signal handling; browser via
#                 MCHEZO_CHROMIUM_PATH when the pinned Playwright's own build isn't installed)
# 7 backup drill  the round-5 focused negatives (docs/evidence/beta-r4-hosting/backup-drill/round5/focused.sh.txt) on THIS
#                 checkout's deploy scripts, natively (hold, signals, killed runs, reconciliation)
set -uo pipefail
CO=$(cd "$1" && pwd); ARC=$2; APP=$3; OUT=$4
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
cd "$CO" || exit 2
C=$(git rev-parse HEAD)
echo "== w6r-final on $C (status $(git status --porcelain | wc -l) lines), $(date -u +%FT%TZ)" | tee "$OUT/summary.txt"
step() { # step <name> <command...>
  local n=$1 s rc; shift; s=$(date +%s)
  "$@" > "$OUT/$n.log" 2>&1; rc=$?
  echo "$n: exit $rc in $(( $(date +%s) - s )) s; last line: $(tail -1 "$OUT/$n.log")" | tee -a "$OUT/summary.txt"
}
H="$OUT/harness"; rm -rf "$H"; mkdir -p "$H"
cp docs/evidence/beta-r4-w6/runners/image-checks-w6r.sh "$H/image-checks.sh"
for f in build.sh assemble.sh api.mjs; do cp "docs/evidence/beta-r4-render-package/harness/$f.txt" "$H/$f"; done
D="$OUT/drill-scripts"; rm -rf "$D"; mkdir -p "$D/deploy"
cp deploy/render/cgn-entrypoint.sh deploy/render/cgn-backup.sh deploy/render/cgn-authorize.sh deploy/render/operator/cgn-receive.sh "$D/deploy/"
cp docs/evidence/beta-r4-hosting/backup-drill/round5/focused.sh.txt "$OUT/focused.sh"
step 1-static bash docs/evidence/beta-r4-w6/runners/w6r-static.sh "$CO" "${W6R_BASE:-47aa9aff25e4489e4c75a0799de50fc895ef15ab}"
step 2-image-checks bash "$H/image-checks.sh" "$CO/deploy/render" "$ARC" "$OUT/image-checks-work"
step 3-guard-selftest bash scripts/beta/w6-guard-selftest.sh cgn-render:check
step 3b-hold-selftest bash scripts/beta/w6-hold-selftest.sh cgn-render:check
step 4-w6-selftest bash scripts/beta/w6-selftest.sh cgn-render:check --work "$OUT/w6-work"
step 5-w5-selftest bash scripts/beta/w5-selftest.sh cgn-render:check --work "$OUT/w5-work"
step 6-w4-selftest env MCHEZO_CHROMIUM_PATH="${MCHEZO_CHROMIUM_PATH:-}" bash scripts/beta/w4-selftest.sh cgn-render:check --work "$OUT/w4-work"
step 7-backup-drill bash "$OUT/focused.sh" "$APP" "$D"
echo "== image under test: $(docker image inspect -f '{{.Id}}' cgn-render:check); checkout still clean: $(git status --porcelain | wc -l) lines; $(date -u +%FT%TZ)" | tee -a "$OUT/summary.txt"
