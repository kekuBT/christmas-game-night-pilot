#!/usr/bin/env python3
"""Review 6958719378: the copyable operator sequences must stop at the first failure.
It reads the documents themselves: every fenced bash block, and every inline code span in a table row that holds `&&`.
- Rule A, the chains: every logical line that runs more than one command is run in bash against a STUB operator. The
  `bash` and `git` commands are shell functions that record each step and fail (exit 9) on the chosen step.
  - With no failure: every step runs in order, and the exit is 0.
  - Failing each step in turn: exactly the steps up to and including the failed one run (so no later step, no
    bstart/start), and the exit is 9 (non-zero).
- Rule B, pasted blocks: a whole fenced block is pasted as one unit, and its lines run one after another even when an
  earlier line failed. So a block may hold AT MOST ONE state-changing line. Read-only inspection lines (`inspect`,
  `status`, `pgrep`, variable assignments) don't count.
Usage: python3 -I snippet-check.py <markdown file>...   Exits non-zero if any check fails."""
import re, subprocess, sys

PRELUDE = r'''
step() { printf '%s\n' "$*" >> "$LOG"; if [ -n "${FAIL_AT:-}" ] && [ "$*" = "$FAIL_AT" ]; then return 9; fi; return 0; }
bash() { local n; n=$(basename "$1"); shift; step "$n${*:+ $*}"; }
git() { step "git $1"; }
W=/work; T="bash $W/src/scripts/beta/w7-owner-preview.sh"
'''
STATE = re.compile(r'\$T (?!inspect\b|status\b)\w|git clone|git -C|w7-owner-selftest')
bad = 0
def check(ok, name, got=""):
    global bad
    bad += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'} {name}{(' -> ' + got) if got else ''}")

def logical_lines(block):
    out, cur = [], ""
    for raw in block.splitlines():
        line = re.sub(r'\s+#.*$', '', raw.rstrip())
        if line.endswith('\\'): cur += line[:-1] + ' '; continue
        cur += line
        if cur.strip(): out.append(cur.strip())
        cur = ""
    return out

def run(chain, fail_at=None):
    import os, tempfile
    with tempfile.NamedTemporaryFile('r', suffix='.log') as log:
        env = dict(os.environ, LOG=log.name, FAIL_AT=fail_at or '')
        cmd = re.sub(r'<[^>]*>', 'COMMIT', chain)   # the documents' placeholders, e.g. <the tested commit ...>
        rc = subprocess.run(['bash', '--norc', '--noprofile', '-c', PRELUDE + cmd], env=env).returncode
        return rc, [l for l in open(log.name).read().splitlines() if l]

for path in sys.argv[1:]:
    text = open(path).read()
    blocks = [m.group(2) for m in re.finditer(r'^([ \t]*)```bash\n(.*?)^\1```', text, re.S | re.M)]
    blocks = ['\n'.join(l[len(re.match(r'[ \t]*', l).group(0)):] for l in b.splitlines()) for b in blocks]
    spans = [m.group(1) for row in text.splitlines() if row.startswith('|') for m in re.finditer(r'`([^`]*&&[^`]*)`', row)]
    print(f"== {path}: {len(blocks)} bash blocks, {len(spans)} table chains")
    chains = []
    for i, b in enumerate(blocks, 1):
        lines = logical_lines(b)
        changing = [l for l in lines if STATE.search(l)]
        check(len(changing) <= 1, f"block {i}: at most one state-changing line ({len(changing)}: {' | '.join(c[:60] for c in changing)})")
        chains += [l for l in lines if re.search(r'&&|;', l) and STATE.search(l)]
    chains += spans
    for c in chains:
        print(f"-- chain: {c}")
        rc, steps = run(c)
        check(rc == 0 and len(steps) >= 2, f"  all succeed: {len(steps)} steps in order, exit {rc}", ' -> '.join(steps))
        for k, key in enumerate(steps):
            rc2, ran = run(c, key)
            check(rc2 != 0 and ran == steps[:k + 1], f"  step {k + 1} ({key}) fails: exit {rc2} (must be non-zero); {len(ran)} of {len(steps)} steps ran (must be {k + 1})",
                  '' if ran == steps[:k + 1] else 'also ran: ' + ' | '.join(ran[k + 1:]))
print(f"== snippet check: {'every check passed' if bad == 0 else f'{bad} FAILED'}")
sys.exit(1 if bad else 0)
