#!/bin/bash
# W5 static checks for handoff 6937786587, run inside a clean checkout of the candidate.
#   bash w5-static.sh <checkout dir>
set -uo pipefail
cd "$1" || exit 2
C=$(git rev-parse HEAD); BASE=a4bfdf925aebe3fd9801a9ad32aeb8452ec1e623; PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
bad=0
empty() { local out; out=$("${@:2}" 2>&1); local rc=$?; if [ $rc = 0 ] && [ -z "$out" ]; then echo "PASS $1 (empty)"; else echo "FAIL $1 (rc $rc)"; printf '%s\n' "$out" | sed 's/^/     /'; bad=1; fi; }
ok() { if [ "$2" = 0 ]; then echo "PASS $1"; else echo "FAIL $1"; bad=1; fi; }
echo "# W5 static checks on the clean checkout of $C (status $(git status --porcelain | wc -l) lines), $(date -u +%FT%TZ)"
echo "## 1. everything changed since #47's head $BASE"
git diff --stat "$BASE" "$C" | tail -20
empty "nothing outside docs/ and scripts/beta/w5-*" git diff --name-only "$BASE" "$C" -- . ':!docs' ':!scripts/beta/w5-*'
empty "the runtime (apps/, src/), tests, manifests and other scripts unchanged" git diff --name-only "$BASE" "$C" -- apps src tests package.json package-lock.json 'tsconfig*.json' scripts ':!scripts/beta/w5-*'
empty "deploy/ unchanged from $BASE" git diff --name-only "$BASE" "$C" -- deploy
empty "deploy/ unchanged from 2e2257c (the accepted deployment scripts)" git diff --name-only 2e2257c "$C" -- deploy
ok "the artifact gate's REVISION is still the pin" "$(grep -qx "REVISION=$PIN" deploy/render/cgn-artifact-gate.sh && echo 0 || echo 1)"
echo "## 2. the reviewed deploy-side scripts (hashes, unchanged)"
sha256sum deploy/render/cgn-backup.sh deploy/render/cgn-entrypoint.sh deploy/render/operator/cgn-receive.sh
grep -E 'cgn-backup|cgn-entrypoint' deploy/render/pins/scripts.sha256 2>/dev/null
ok "cgn-backup.sh matches its pin in deploy/render/pins/scripts.sha256" "$(cd deploy/render && grep ' cgn-backup.sh$' pins/scripts.sha256 | sha256sum -c --status - 2>/dev/null && echo 0 || echo 1)"
echo "## 3. lint and syntax"
npx eslint scripts/beta > /tmp/w5-eslint.$$ 2>&1; e=$?; cat /tmp/w5-eslint.$$; rm -f /tmp/w5-eslint.$$
ok "eslint scripts/beta (exit $e)" "$e"
s=0; for f in scripts/beta/*.sh; do bash -n "$f" || { echo "syntax error: $f"; s=1; }; done
node --check scripts/beta/w5-seed.mjs || s=1
ok "bash -n scripts/beta/*.sh ($(ls scripts/beta/*.sh | wc -l) files) and node --check w5-seed.mjs" "$s"
echo "## 4. relative links in the changed documents"
n=0; miss=0
for d in docs/beta/render-w5.md docs/beta/render-w4.md docs/evidence/beta-r4-w5/README.md docs/evidence/beta-r4-w5/repair/repro/README.md docs/evidence/beta-r4-w4/README.md; do
  dir=$(dirname "$d")
  while IFS= read -r l; do t=${l%%#*}; [ -z "$t" ] && continue; n=$((n + 1)); [ -e "$dir/$t" ] || { echo "missing: $d -> $l"; miss=$((miss + 1)); }; done < <(grep -oE '\]\([^)#: ]+(#[^) ]*)?\)' "$d" | sed -E 's/^\]\(//; s/\)$//' | grep -v '^https\?:')
done
echo "links: $n missing: $miss"; ok "no missing relative link" "$([ $miss = 0 ] && echo 0 || echo 1)"
echo "## 5. secret scan of the changes since $BASE"
# The scanner's own committed copy (its pattern definitions) is excluded by exact path; nothing else is.
hits=$(git diff "$BASE" "$C" -- . ':!docs/evidence/beta-r4-w5/runners/w5-static.sh' | grep '^+' | grep -nE 'AGE-SECRET-KEY-1[0-9A-Z]{50,}|BEGIN [A-Z ]*PRIVATE KEY|MCHEZO_BETA_ACCESS_CODE=[0-9a-f]{8,}|cgn_beta=[A-Za-z0-9_-]{8}|ghp_[A-Za-z0-9]{20,}|github_pat_|rnd_[A-Za-z0-9]{16,}|/tmp/claude')
printf '%s\n' "$hits" | sed '/^$/d' | head
ok "no secret-shaped value (a real age secret key, a private key, an access code, a gate cookie, a token) or local scratch path in the added lines" "$([ -z "$hits" ] && echo 0 || echo 1)"
echo "## verdict"
if [ $bad = 0 ]; then echo "W5 STATIC CHECKS PASSED"; exit 0; else echo "W5 STATIC CHECKS FAILED"; exit 1; fi
