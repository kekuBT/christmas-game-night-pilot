#!/bin/bash
# W6 REPAIR static checks (review 6939462697), run inside a clean checkout of the candidate.
#   bash w6r-static.sh <checkout dir> [base: the reviewed head; d3f74de for repair 1, 47aa9af for repair 2]
set -uo pipefail
cd "$1" || exit 2
C=$(git rev-parse HEAD); BASE=${2:-d3f74de4e5f8e78f04f8aa2fed14fc4cac1ccf0f}; PIN=7097ac2bb062925bb296a129f4771f1e68fd522d   # base: the reviewed head
bad=0
empty() { local out; out=$("${@:2}" 2>&1); local rc=$?; if [ $rc = 0 ] && [ -z "$out" ]; then echo "PASS $1 (empty)"; else echo "FAIL $1 (rc $rc)"; printf '%s\n' "$out" | sed 's/^/     /'; bad=1; fi; }
ok() { if [ "$2" = 0 ]; then echo "PASS $1"; else echo "FAIL $1"; bad=1; fi; }
echo "# W6 repair static checks on the clean checkout of $C (status $(git status --porcelain | wc -l) lines), $(date -u +%FT%TZ)"
echo "## 1. everything changed since the reviewed head $BASE"
git diff --stat "$BASE" "$C" | tail -30
empty "nothing outside docs/, scripts/beta/w6-*, and deploy/render's two guard scripts, their pins and README" git diff --name-only "$BASE" "$C" -- . ':!docs' ':!scripts/beta/w6-*' ':!deploy/render/cgn-authorize.sh' ':!deploy/render/cgn-entrypoint.sh' ':!deploy/render/pins/scripts.sha256' ':!deploy/render/README.md'
empty "the runtime (apps/, src/), tests, manifests and other scripts unchanged" git diff --name-only "$BASE" "$C" -- apps src tests package.json package-lock.json 'tsconfig*.json' scripts ':!scripts/beta/w6-*'
empty "the reused W5 seed (scripts/beta/w5-seed.mjs) unchanged" git diff --name-only "$BASE" "$C" -- scripts/beta/w5-seed.mjs
empty "cgn-backup.sh, operator/cgn-receive.sh, the Dockerfile, .dockerignore, the artifact gate, render.yaml and the other pins unchanged" git diff --name-only "$BASE" "$C" -- deploy/render/cgn-backup.sh deploy/render/operator deploy/render/Dockerfile deploy/render/.dockerignore deploy/render/cgn-artifact-gate.sh deploy/render/render.yaml deploy/render/pins/age.sha256 deploy/render/pins/archive.sha256 deploy/render/pins/release-7097ac2.inventory.sha256
ok "the artifact gate's REVISION is still the pin" "$(grep -qx "REVISION=$PIN" deploy/render/cgn-artifact-gate.sh && echo 0 || echo 1)"
echo "## 2. the deploy-side scripts and their pins"
sha256sum deploy/render/cgn-backup.sh deploy/render/cgn-entrypoint.sh deploy/render/cgn-authorize.sh deploy/render/operator/cgn-receive.sh
cat deploy/render/pins/scripts.sha256
ok "cgn-backup.sh, cgn-entrypoint.sh and cgn-authorize.sh match their pins in deploy/render/pins/scripts.sha256" "$(cd deploy/render && sha256sum -c --status pins/scripts.sha256 2>/dev/null && echo 0 || echo 1)"
ok "the record reader block is identical in cgn-authorize.sh and cgn-entrypoint.sh" "$(a=$(sed -n '/^# --- record reader/,/^# --- end record reader ---$/p' deploy/render/cgn-authorize.sh); b=$(sed -n '/^# --- record reader/,/^# --- end record reader ---$/p' deploy/render/cgn-entrypoint.sh); [ -n "$a" ] && [ "$a" = "$b" ] && echo 0 || echo 1)"
echo "## 3. lint and syntax"
npx eslint scripts/beta > /tmp/w6r-eslint.$$ 2>&1; e=$?; cat /tmp/w6r-eslint.$$; rm -f /tmp/w6r-eslint.$$
ok "eslint scripts/beta (exit $e)" "$e"
s=0; for f in scripts/beta/*.sh docs/evidence/beta-r4-w6/runners/*.sh; do bash -n "$f" || { echo "syntax error: $f"; s=1; }; done
for f in deploy/render/cgn-authorize.sh deploy/render/cgn-entrypoint.sh deploy/render/cgn-backup.sh; do sh -n "$f" || { echo "syntax error: $f"; s=1; }; done
if command -v dash >/dev/null 2>&1; then for f in deploy/render/cgn-authorize.sh deploy/render/cgn-entrypoint.sh; do dash -n "$f" || { echo "dash syntax error: $f"; s=1; }; done; fi
node --check scripts/beta/w5-seed.mjs || s=1; node --check scripts/beta/w6-check.mjs || s=1
ok "bash -n on scripts/beta and the runners, sh -n on the deploy scripts, node --check w5-seed.mjs and w6-check.mjs" "$s"
echo "## 4. relative links in the changed documents"
n=0; miss=0
for d in docs/beta/render-w6.md docs/evidence/beta-r4-w6/README.md docs/beta/beta-r4-hosting-proposal.md deploy/render/README.md; do
  dir=$(dirname "$d")
  while IFS= read -r l; do t=${l%%#*}; [ -z "$t" ] && continue; n=$((n + 1)); [ -e "$dir/$t" ] || { echo "missing: $d -> $l"; miss=$((miss + 1)); }; done < <(grep -oE '\]\([^)#: ]+(#[^) ]*)?\)' "$d" | sed -E 's/^\]\(//; s/\)$//' | grep -v '^https\?:')
done
echo "links: $n missing: $miss"; ok "no missing relative link" "$([ $miss = 0 ] && echo 0 || echo 1)"
echo "## 5. secret scan of the changes since $BASE"
# The scanners' own committed copies (their pattern definitions) are excluded by exact path; nothing else is.
hits=$(git diff "$BASE" "$C" -- . ':!docs/evidence/beta-r4-w6/runners/w6-static.sh' ':!docs/evidence/beta-r4-w6/runners/w6r-static.sh' | grep '^+' | grep -nE 'AGE-SECRET-KEY-1[0-9A-Z]{50,}|BEGIN [A-Z ]*PRIVATE KEY|MCHEZO_BETA_ACCESS_CODE=[0-9a-f]{8,}|cgn_beta=[A-Za-z0-9_-]{8}|ghp_[A-Za-z0-9]{20,}|github_pat_|rnd_[A-Za-z0-9]{16,}|/tmp/claude')
printf '%s\n' "$hits" | sed '/^$/d' | head
ok "no secret-shaped value (a real age secret key, a private key, an access code, a gate cookie, a token) or local scratch path in the added lines" "$([ -z "$hits" ] && echo 0 || echo 1)"
echo "## verdict"
if [ $bad = 0 ]; then echo "W6 REPAIR STATIC CHECKS PASSED"; exit 0; else echo "W6 REPAIR STATIC CHECKS FAILED"; exit 1; fi
