#!/bin/bash
# Integration static checks for handoff 6936988676, run inside a clean checkout of the candidate.
#   bash int-checks.sh <checkout dir>
# Prints raw git output; exits non-zero if any expected-empty diff is non-empty or any check fails.
set -uo pipefail
cd "$1" || exit 2
C=$(git rev-parse HEAD)
H47=e577579cae3003bfbce93dea607190e901f0a9fb; T47=72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d
H46=e6cbe110af673b32d5dbbc245988b3f7a853a251; T46=3eb05bc00c282455fb365857024424b7b7e986ee
BASE=8101c5cb8a493aefc93f1edbf6cdb9d8bc1c2dfe; MERGE=d811ed9bf9a8036fb35a64def8765f24888afaa4
PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
bad=0
empty() { # <label> <cmd...>: the command's output must be empty
  local out; out=$("${@:2}" 2>&1); local rc=$?
  if [ $rc = 0 ] && [ -z "$out" ]; then echo "PASS $1 (empty)"; else echo "FAIL $1 (rc $rc)"; printf '%s\n' "$out" | sed 's/^/     /'; bad=1; fi
}
ok() { if [ "$2" = 0 ]; then echo "PASS $1"; else echo "FAIL $1"; bad=1; fi; }
echo "# integration checks on the clean checkout of $C (status $(git status --porcelain | wc -l) lines), $(date -u +%FT%TZ)"

echo "## 1. ancestry"
git log -2 --format='%H parents: %P  %s' "$C"
ok "the candidate's parent is the merge $MERGE" "$([ "$(git rev-parse "$C^")" = "$MERGE" ] && echo 0 || echo 1)"
ok "the merge's parents are #47 $H47 and #46 $H46, in that order" "$([ "$(git log -1 --format=%P $MERGE)" = "$H47 $H46" ] && echo 0 || echo 1)"
ok "merge base of the two heads is $BASE" "$([ "$(git merge-base $H47 $H46)" = "$BASE" ] && echo 0 || echo 1)"
for a in $T47 $H47 $T46 $H46 $BASE; do ok "$a is an ancestor of the candidate" "$(git merge-base --is-ancestor $a "$C" && echo 0 || echo 1)"; done

echo "## 2. reviewed tested -> head deltas (names; docs/evidence only expected)"
echo "-- $T47..$H47"; git diff --name-only $T47 $H47
empty "#47 tested->head touches nothing outside docs/" git diff --name-only $T47 $H47 -- . ':!docs'
echo "-- $T46..$H46"; git diff --name-only $T46 $H46
empty "#46 tested->head touches nothing outside docs/" git diff --name-only $T46 $H46 -- . ':!docs'

echo "## 3. runtime, tests, manifests, gate and drivers vs the reviewed 72e9d8b (acceptance 1)"
empty "apps/ and src/ identical to $T47" git diff --name-only $T47 "$C" -- apps src
empty "tests/, package*.json, tsconfig*, scripts/ outside scripts/beta identical to $T47" git diff --name-only $T47 "$C" -- tests 'package.json' 'package-lock.json' 'tsconfig*.json' scripts ':!scripts/beta'

echo "## 4. W4 tooling vs the reviewed e6cbe11 / tested 3eb05bc (acceptance 1)"
empty "scripts/beta/ identical to $H46" git diff --name-only $H46 "$C" -- scripts/beta
empty "scripts/beta/ identical to $T46" git diff --name-only $T46 "$C" -- scripts/beta

echo "## 5. deploy/ and the pin (acceptance 2)"
empty "deploy/ identical to $H47" git diff --name-only $H47 "$C" -- deploy
empty "deploy/ identical to $H46" git diff --name-only $H46 "$C" -- deploy
empty "deploy/ identical to 2e2257c (the accepted deployment scripts)" git diff --name-only 2e2257c "$C" -- deploy
grep -n "^REVISION=" deploy/render/cgn-artifact-gate.sh; grep -n "^PIN=" scripts/beta/w4-rehearsal.sh scripts/beta/w4-control-selftest.sh
ok "the artifact gate's REVISION is the pin" "$(grep -qx "REVISION=$PIN" deploy/render/cgn-artifact-gate.sh && echo 0 || echo 1)"
ok "the W4 harness's PIN is the pin" "$(grep -qx "PIN=$PIN" scripts/beta/w4-rehearsal.sh && echo 0 || echo 1)"
cat deploy/render/pins/archive.sha256

echo "## 6. the whole candidate vs each reviewed side"
echo "-- vs $T47 (expect docs/ and scripts/beta/w4-* only)"; git diff --name-status $T47 "$C"
empty "vs $T47: nothing outside docs/ and scripts/beta/w4-*" git diff --name-only $T47 "$C" -- . ':!docs' ':!scripts/beta/w4-*'
echo "-- vs $H46 (expect #47's client fix, tests, driver and docs)"; git diff --name-status $H46 "$C"
empty "vs $H46: nothing outside docs/, the 3 client files, the 2 test files and the driver" git diff --name-only $H46 "$C" -- . ':!docs' ':!apps/web/src/components/intentRetry.ts' ':!apps/web/src/ui/mchezo/lib/errors.ts' ':!apps/web/src/App.tsx' ':!tests/correctness.test.ts' ':!tests/errors.test.ts' ':!scripts/check-uncertain-delivery.mjs'

echo "## 7. lint and shell syntax of the W4 tooling"
npx eslint scripts/beta > /tmp/int-eslint.$$ 2>&1; e=$?; cat /tmp/int-eslint.$$; rm -f /tmp/int-eslint.$$
ok "eslint scripts/beta (exit $e)" "$e"
s=0; for f in scripts/beta/*.sh; do bash -n "$f" || { echo "syntax error: $f"; s=1; }; done
ok "bash -n scripts/beta/*.sh ($(ls scripts/beta/*.sh | wc -l) files)" "$s"

echo "## 8. relative links in the documents this integration changed"
n=0; miss=0
for d in docs/evidence/beta-r4-integration/README.md docs/beta/render-w4.md docs/evidence/beta-r4-w4/README.md docs/evidence/beta-r4-c502/README.md; do
  dir=$(dirname "$d")
  while IFS= read -r l; do
    t=${l%%#*}; [ -z "$t" ] && continue
    n=$((n + 1)); [ -e "$dir/$t" ] || { echo "missing: $d -> $l"; miss=$((miss + 1)); }
  done < <(grep -oE '\]\([^)#: ]+(#[^) ]*)?\)' "$d" | sed -E 's/^\]\(//; s/\)$//' | grep -v '^https\?:')
done
echo "links: $n missing: $miss"; ok "no missing relative link" "$([ $miss = 0 ] && echo 0 || echo 1)"

echo "## 9. secret scan of the changes since each reviewed head"
hits=$( { git diff $H47 "$C"; git diff $H46 "$C"; } | grep '^+' | grep -nEi 'BEGIN [A-Z ]*PRIVATE KEY|MCHEZO_BETA_ACCESS_CODE=[0-9a-f]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_|rnd_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|xox[bp]-|age-secret-key|Authorization: Bearer [A-Za-z0-9]' )
printf '%s\n' "$hits" | sed '/^$/d' | head -20
ok "no secret-shaped string in the added lines" "$([ -z "$hits" ] && echo 0 || echo 1)"

echo "## verdict"
if [ $bad = 0 ]; then echo "INTEGRATION CHECKS PASSED"; exit 0; else echo "INTEGRATION CHECKS FAILED"; exit 1; fi
