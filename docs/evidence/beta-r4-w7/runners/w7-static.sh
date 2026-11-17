#!/bin/bash
# W7 static checks (handoff 6941129590), run inside a clean checkout of the candidate.
#   bash w7-static.sh <checkout dir> [base: #49's head d2b1242, the PR's base]
set -uo pipefail
cd "$1" || exit 2
C=$(git rev-parse HEAD); BASE=${2:-d2b1242e89fc2d38c4b9471ec88176db1b3ee690}; PIN=7097ac2bb062925bb296a129f4771f1e68fd522d
bad=0
empty() { local out; out=$("${@:2}" 2>&1); local rc=$?; if [ $rc = 0 ] && [ -z "$out" ]; then echo "PASS $1 (empty)"; else echo "FAIL $1 (rc $rc)"; printf '%s\n' "$out" | sed 's/^/     /'; bad=1; fi; }
ok() { if [ "$2" = 0 ]; then echo "PASS $1"; else echo "FAIL $1"; bad=1; fi; }
echo "# W7 static checks on the clean checkout of $C (status $(git status --porcelain | wc -l) lines), $(date -u +%FT%TZ)"
echo "## 1. everything changed since the base $BASE"
git diff --stat "$BASE" "$C" | tail -40
empty "nothing outside docs/ and scripts/beta/w7-*" git diff --name-only "$BASE" "$C" -- . ':!docs' ':!scripts/beta/w7-*'
empty "deploy/ unchanged: the guard scripts, the Dockerfile, the artifact gate, render.yaml and every pin (the canonical release pins stay 7097ac2)" git diff --name-only "$BASE" "$C" -- deploy
empty "the runtime (apps/, src/), tests, manifests and the other scripts (the W5 seed, W6 tools) unchanged" git diff --name-only "$BASE" "$C" -- apps src tests package.json package-lock.json 'tsconfig*.json' scripts ':!scripts/beta/w7-*'
ok "the artifact gate's REVISION is still the pin $PIN" "$(grep -qx "REVISION=$PIN" deploy/render/cgn-artifact-gate.sh && echo 0 || echo 1)"
ok "pins/archive.sha256 still names the audited archive a693c543..." "$(grep -qx 'a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131  mchezo-7097ac2.tgz' deploy/render/pins/archive.sha256 && echo 0 || echo 1)"
ok "the guard scripts match their pins (pins/scripts.sha256)" "$(cd deploy/render && sha256sum -c --status pins/scripts.sha256 2>/dev/null && echo 0 || echo 1)"
echo "## 2. lint and syntax"
npx eslint scripts/beta > "${TMPDIR:-/tmp}/w7-eslint.$$" 2>&1; e=$?; cat "${TMPDIR:-/tmp}/w7-eslint.$$"; rm -f "${TMPDIR:-/tmp}/w7-eslint.$$"
ok "eslint scripts/beta (exit $e)" "$e"
s=0; for f in scripts/beta/*.sh docs/evidence/beta-r4-w7/runners/*.sh; do bash -n "$f" || { echo "syntax error: $f"; s=1; }; done
for f in w5-seed.mjs w6-check.mjs w7-check.mjs; do node --check "scripts/beta/$f" || s=1; done
ok "bash -n on scripts/beta and the W7 runners; node --check w5-seed.mjs, w6-check.mjs and w7-check.mjs" "$s"
echo "## 3. relative links in the changed documents"
n=0; miss=0
for d in docs/beta/render-w7.md docs/evidence/beta-r4-w7/README.md; do
  dir=$(dirname "$d")
  while IFS= read -r l; do t=${l%%#*}; [ -z "$t" ] && continue; n=$((n + 1)); [ -e "$dir/$t" ] || { echo "missing: $d -> $l"; miss=$((miss + 1)); }; done < <(grep -oE '\]\([^)#: ]+(#[^) ]*)?\)' "$d" | sed -E 's/^\]\(//; s/\)$//' | grep -v '^https\?:')
done
echo "links: $n missing: $miss"; ok "no missing relative link" "$([ $miss = 0 ] && echo 0 || echo 1)"
echo "## 4. secret scan of the changes since $BASE"
# The scanner's own committed copy (its pattern definitions) is excluded by exact path; nothing else is.
hits=$(git diff "$BASE" "$C" -- . ':!docs/evidence/beta-r4-w7/runners/w7-static.sh' | grep '^+' | grep -nE 'AGE-SECRET-KEY-1[0-9A-Z]{50,}|BEGIN [A-Z ]*PRIVATE KEY|MCHEZO_BETA_ACCESS_CODE=[0-9a-f]{8,}|cgn_beta=[A-Za-z0-9_-]{8}|ghp_[A-Za-z0-9]{20,}|github_pat_|rnd_[A-Za-z0-9]{16,}|/tmp/claude')
printf '%s\n' "$hits" | sed '/^$/d' | head
ok "no secret-shaped value (a real age secret key, a private key, an access code, a gate cookie, a token) or local scratch path in the added lines" "$([ -z "$hits" ] && echo 0 || echo 1)"
echo "## verdict"
if [ $bad = 0 ]; then echo "W7 STATIC CHECKS PASSED"; exit 0; else echo "W7 STATIC CHECKS FAILED"; exit 1; fi
