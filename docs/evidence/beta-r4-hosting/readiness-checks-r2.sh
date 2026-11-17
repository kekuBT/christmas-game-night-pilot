#!/bin/bash
# The scanner's own copy (its patterns) is excluded from the secret scan by exact path.
# Documentation checks for review 6954485280 (readiness revision 2), on the working tree of #50's branch.
set -uo pipefail
cd "$1" || exit 2
BASE=2b265208d60a10425b1f0dae9379c5dc2352bdf9
echo "== checks on the working tree (base ${BASE:0:7}), $(date -u +%FT%TZ)"
bad=0
D="docs/beta/beta-r4-readiness.md docs/beta/render-w7.md"
echo "-- relative links, with anchors"
python3 - $D <<'PY' || bad=1
import re, sys, os
def slug(h):
    h = h.strip().lower()
    h = re.sub(r'[^\w\- ]', '', h)
    return h.replace(' ', '-')
def anchors(p):
    return {slug(re.sub(r'[`*]', '', l.lstrip('#'))) for l in open(p) if l.startswith('#')}
n = miss = 0
for d in sys.argv[1:]:
    base = os.path.dirname(d)
    for m in re.finditer(r'\]\(([^)\s]+)\)', open(d).read()):
        t = m.group(1)
        if t.startswith(('http://', 'https://')): continue
        n += 1
        f, _, a = t.partition('#')
        p = os.path.normpath(os.path.join(base, f)) if f else d
        if not os.path.exists(p): print('missing file:', d, '->', t); miss += 1; continue
        if a and p.endswith('.md') and a not in anchors(p): print('missing anchor:', d, '->', t); miss += 1
print(f'links: {n}, missing: {miss}')
sys.exit(1 if miss else 0)
PY
echo "-- tables: every row has its header's column count"
python3 - $D <<'PY' || bad=1
import sys
badrows = 0
for d in sys.argv[1:]:
    cols = None
    for i, l in enumerate(open(d), 1):
        if l.startswith('|'):
            c = l.rstrip('\n').strip().strip('|').count('|') + 1 - l.count('\\|')
            if cols is None: cols = c
            elif c != cols: print(f'{d}:{i}: {c} columns, header has {cols}'); badrows += 1
        else: cols = None
print(f'table rows with a wrong column count: {badrows}')
sys.exit(1 if badrows else 0)
PY
echo "-- commands and paths named in the changes"
for f in deploy/render/cgn-authorize.sh deploy/render/cgn-entrypoint.sh deploy/render/cgn-artifact-gate.sh scripts/beta/w7-rehearsal.sh; do
  [ -e "$f" ] && echo "present: $f" || { echo "MISSING: $f"; bad=1; }; done
grep -q -- '--status' deploy/render/cgn-authorize.sh && echo "present: cgn-authorize --status" || { echo "MISSING: --status"; bad=1; }
grep -rqE 'datatool.*check|"check"' src/ scripts/ deploy/render 2>/dev/null && echo "present: datatool check" || { echo "MISSING: datatool check"; bad=1; }
grep -q '/var/data/cgn-w1' deploy/render/README.md && grep -q '/var/data/cgn' deploy/render/README.md && echo "present: /var/data/cgn-w1 and /var/data/cgn in deploy/render/README.md" || { echo "MISSING: data folders in README"; bad=1; }
grep -q 'W7_CURRENT_REVISION' scripts/beta/w7-rehearsal.sh && grep -q 'W7_PREVIOUS_REVISION' scripts/beta/w7-rehearsal.sh && echo "present: W7_CURRENT_REVISION / W7_PREVIOUS_REVISION" || { echo "MISSING: W7 revision vars"; bad=1; }
echo "src diff 7097ac2..72e9d8b: $(git diff --name-only 7097ac2 72e9d8b -- src | wc -l) file(s)"
echo "-- the review's five points: stale wording gone"
chk() { if grep -nE "$2" $D; then echo "FAIL: $1"; bad=1; else echo "PASS: $1"; fi; }
chk "no 'up to 17.25' total" '17\.25'
chk "no automatic move of the audit to a hosted window" 'moves to the (first )?hosted|browser journey then moves'
chk "no unconditional new-navigation step" 'Make \*\*one new navigation|That is an allowed protocol'
chk "no 'stop at the spend limit instead of being billed'" 'instead of being billed'
chk "no 'throwaway service ... never the family' rule left as a requirement" '^\*\*The provider-specific steps for a future authorized throwaway window'
chk "no unqualified '\$0 is possible only by dropping persistence'" '^- \*\*So \$0 is possible only'
grep -q 'synthetic-phase exception' docs/beta/beta-r4-readiness.md && grep -q 'synthetic-phase exception' docs/beta/render-w7.md && echo "PASS: the exception is stated in both documents" || { echo "FAIL: exception not in both"; bad=1; }
echo "-- secret scan of the changes since ${BASE:0:7}"
hits=$(git diff "$BASE" -- . ':!docs/evidence/beta-r4-hosting/readiness-checks-r2.sh' | grep '^+' | grep -nE 'AGE-SECRET-KEY-1[0-9A-Z]{50,}|BEGIN [A-Z ]*PRIVATE KEY|MCHEZO_BETA_ACCESS_CODE=[0-9a-f]{8,}|cgn_beta=[A-Za-z0-9_-]{8}|ghp_[A-Za-z0-9]{20,}|github_pat_|rnd_[A-Za-z0-9]{16,}|/tmp/claude')
[ -z "$hits" ] && echo "no secret-shaped value or scratch path in the added lines" || { printf '%s\n' "$hits"; bad=1; }
echo "-- scope"
git status --porcelain
outside=$(git status --porcelain | awk '{print $2}' | grep -v '^docs/' || true)
[ -z "$outside" ] && echo "only docs/ changed" || { echo "FAIL: outside docs: $outside"; bad=1; }
echo "-- verdict"
[ $bad = 0 ] && echo "DOC CHECKS PASSED" || echo "DOC CHECKS FAILED"
exit $bad
