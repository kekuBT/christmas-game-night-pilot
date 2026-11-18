#!/bin/bash
# Beta R4 W7, B-W7-01 (handoff 6966073894): the self-test of scripts/beta/w7-pins-pair.sh and of the proposed pair in
# docs/beta/pins-72e9d8b/, on an ISOLATED CLEAN COPY of the recorded base (#50 at 71d0200), never on this checkout.
# The selected identity is fixed here, as the handoff selects it: 72e9d8b, archive aac13a8a..., inventory 4f58b323...
#   S0  static: bash -n on the helper and this script
#   S1  the isolated copy: a fresh clone, detached at the base, clean
#   S2  make, from the copy, reproduces the committed patch folder byte for byte (README.md aside)
#   S3  verify on the copy's deploy/render: PINS_PAIR_VERIFIED
#   S4  the repository layout (git apply --directory=deploy/render in the copy): forward changes exactly the six
#       allowlisted paths, the guards and their pins are untouched; the revert leaves the copy clean at the base, with
#       every deploy/render file byte for byte as before
#   F1  a base changed inside a hunk's context: git apply refuses; verify refuses; the dependent step doesn't run
#   F2  a base changed outside every hunk (a guard script): git apply alone would apply; verify refuses
#   F3  the forward applied twice (an already-forwarded base): git apply refuses; verify refuses
#   F4  a mismatched substitution (make on a base whose reviewed text moved: one count 0, one count 4): refused, no output
#   F5  an unexpected changed file (a guard script; a guard pin), even with SHA256SUMS made to match: refused
#   F6  a non-identity change inside an allowlisted file (an image digest in the Dockerfile): refused
#   F7  another build's identity (the developer archive f3bd00ea... as the selected pin): refused
#   F8  a revert that doesn't restore the baseline: refused
#   F9  the output folder already exists: refused, and it is left as it was
#   I1  interrupted (SIGTERM while the helper holds its private folder): exit 143, the folder is gone, no output, and
#       no process names a w7pins folder
#   I2  isolation: after every case the private temporary root is empty; a sentinel and this checkout are unchanged
#   bash scripts/beta/w7-pins-selftest.sh [--work <new dir>]
# Exit: 0 "W7 PINS SELFTEST PASSED", 1 "W7 PINS SELFTEST FAILED", 2 bad usage.
set -uo pipefail
WORK=""
while [ $# -gt 0 ]; do case "$1" in --work) WORK=${2:?}; shift 2 ;; *) echo "usage: bash scripts/beta/w7-pins-selftest.sh [--work <new dir>]" >&2; exit 2 ;; esac; done
[ -n "$WORK" ] || WORK=$(mktemp -d)
[ ! -e "$WORK" ] || [ -z "$(ls -A "$WORK")" ] || { echo "$WORK is not empty" >&2; exit 2; }
mkdir -p "$WORK"; WORK=$(cd "$WORK" && pwd)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
H="$ROOT/scripts/beta/w7-pins-pair.sh"
PD="$ROOT/docs/beta/pins-72e9d8b"
BASE=71d02009a1b7ed537824b20a0c23d62b157046db
REV=72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d
ARC=aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6
INV=4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef
DEV_ARC=f3bd00ea2f2c17e1f84e0b413822f5cd181247774f9872923860c1120f4d72ca
INVREL=docs/evidence/beta-r4-w7/release-72e9d8b/package/cgn-72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d.inventory.sha256
FWD=forward-7097ac2-to-72e9d8b.patch; RVT=revert-72e9d8b-to-7097ac2.patch
export TMPDIR="$WORK/tmp"; mkdir -p "$TMPDIR"
passn=0; failn=0
chk() { if [ "$2" = 0 ]; then echo "PASS $1"; passn=$((passn + 1)); else echo "FAIL $1${3:+ — $3}"; failn=$((failn + 1)); fi; }
tmp_empty() { [ -z "$(ls -A "$TMPDIR")" ]; }
repo_state() { git -C "$ROOT" rev-parse HEAD; git -C "$ROOT" status --porcelain --untracked-files=all; git -C "$ROOT" worktree list --porcelain | grep -c '^worktree '; git -C "$ROOT" for-each-ref --format='%(refname) %(objectname)' refs/heads refs/tags; git -C "$ROOT" stash list; }
pair() { bash "$H" "$@"; }   # the helper, as an operator runs it
C="$WORK/clone"; D="$C/deploy/render"
echo "== w7-pins-selftest $(date -u +%FT%TZ): helper $(sha256sum "$H" | cut -c1-16), patch folder $PD, base $BASE"
repo_state > "$WORK/repo-before"
echo "sentinel $(date +%s%N)" > "$WORK/sentinel"; cp "$WORK/sentinel" "$WORK/sentinel.expected"

echo "-- S0: static"
bash -n "$H" && bash -n "$0"; chk "S0 bash -n on the helper and this script" $?

echo "-- S1: an isolated clean copy of the base"
git clone -q --no-local --no-checkout "$ROOT" "$C" 2>"$WORK/clone.err" && git -C "$C" -c advice.detachedHead=false checkout -q --detach "$BASE" 2>>"$WORK/clone.err"
chk "S1 a fresh clone, detached at $BASE, clean" "$([ "$(git -C "$C" rev-parse HEAD)" = "$BASE" ] && [ -z "$(git -C "$C" status --porcelain --untracked-files=all)" ] && echo 0 || echo 1)" "$(head -2 "$WORK/clone.err")"
snap() { (cd "$D" && LC_ALL=C find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum; LC_ALL=C find . -printf '%m %y %p\n' | LC_ALL=C sort); }
snap > "$WORK/deploy-before"

echo "-- S2: make reproduces the committed pair"
pair make "$D" "$REV" "$ARC" "$C/$INVREL" "$INV" "$WORK/made" > "$WORK/S2.log" 2>&1; s=$?
grep -E '^PINS_PAIR' "$WORK/S2.log"
diff -r -x README.md "$WORK/made" "$PD" > "$WORK/S2.diff" 2>&1; d=$?
chk "S2 make exits 0 and its output is byte for byte the committed docs/beta/pins-72e9d8b (README.md aside)" "$([ "$s" = 0 ] && [ "$d" = 0 ] && echo 0 || echo 1)" "make $s, diff $d: $(head -3 "$WORK/S2.diff" | tr '\n' ' ')"
chk "S2 the private temporary root is empty" "$(tmp_empty && echo 0 || echo 1)"

echo "-- S3: verify"
pair verify "$D" "$PD" "$REV" "$ARC" "$INV" > "$WORK/S3.log" 2>&1; s=$?
cat "$WORK/S3.log"
chk "S3 PINS_PAIR_VERIFIED (exit 0)" "$([ "$s" = 0 ] && grep -q '^PINS_PAIR_VERIFIED .* guards=unchanged reverted=byte-identical' "$WORK/S3.log" && echo 0 || echo 1)" "exit $s"
chk "S3 the private temporary root is empty, and the copy is untouched" "$(tmp_empty && snap | cmp -s - "$WORK/deploy-before" && echo 0 || echo 1)"

echo "-- S4: the repository layout"
git -C "$C" apply --check --directory=deploy/render "$PD/$FWD" && git -C "$C" apply --directory=deploy/render "$PD/$FWD"; a=$?
git -C "$C" status --porcelain --untracked-files=all > "$WORK/S4-forward.status"; sed 's/^/   /' "$WORK/S4-forward.status"
printf '%s\n' ' M deploy/render/.dockerignore' ' M deploy/render/Dockerfile' ' M deploy/render/cgn-artifact-gate.sh' ' M deploy/render/pins/archive.sha256' \
  ' D deploy/render/pins/release-7097ac2.inventory.sha256' '?? deploy/render/pins/release-72e9d8b.inventory.sha256' > "$WORK/S4-expected.status"
chk "S4 forward applies to the clean copy and changes exactly the six allowlisted paths" "$([ "$a" = 0 ] && cmp -s "$WORK/S4-forward.status" "$WORK/S4-expected.status" && echo 0 || echo 1)" "apply $a"
git -C "$C" diff --quiet -- deploy/render/cgn-entrypoint.sh deploy/render/cgn-backup.sh deploy/render/cgn-authorize.sh deploy/render/pins/scripts.sha256 deploy/render/pins/age.sha256 deploy/render/render.yaml deploy/render/README.md deploy/render/operator
chk "S4 the guards, their pins, render.yaml, README.md and operator/ are untouched" $?
git -C "$C" apply --check --directory=deploy/render "$PD/$RVT" && git -C "$C" apply --directory=deploy/render "$PD/$RVT"; a=$?
chk "S4 the revert applies and the copy is clean at the base again, every deploy/render file and mode as before" "$([ "$a" = 0 ] && [ -z "$(git -C "$C" status --porcelain --untracked-files=all)" ] && [ "$(git -C "$C" rev-parse HEAD)" = "$BASE" ] && snap | cmp -s - "$WORK/deploy-before" && echo 0 || echo 1)" "apply $a"

# A changed copy of the base: copy <name> <file> <perl expression>
variant() { rm -rf "$WORK/$1"; git clone -q --no-local "$C" "$WORK/$1" 2>/dev/null && git -C "$WORK/$1" -c advice.detachedHead=false checkout -q --detach "$BASE" && perl -0pi -e "$3" "$WORK/$1/deploy/render/$2"; }
refused() { # <case> <log> <expected message part>: exit 1, the message, no dependent step, temp root empty
  [ "$(sed -n 's/^exit //p' "$2")" = 1 ] && grep -qF -- "$3" "$2" && ! grep -q DEPENDENT_STEP_RAN "$2" && tmp_empty
}
run_chain() { # <log> <helper args...>: the helper, then a dependent step, as ONE && chain
  local log=$1; shift
  { pair "$@" && echo DEPENDENT_STEP_RAN; echo "exit $?"; } > "$log" 2>&1
  sed -n '/PINS_PAIR_FAILED\|DEPENDENT_STEP_RAN/p' "$log" | sed 's/^/   /'
}
# The dependent chain prints "exit 1" when the helper failed (the && stopped it).

echo "-- F1: a base changed inside a hunk's context (NODE_VERSION, next to REVISION)"
variant F1 cgn-artifact-gate.sh 's/^NODE_VERSION=v22\.16\.0$/NODE_VERSION=v22.16.1/m'
git -C "$WORK/F1" apply --check --directory=deploy/render "$PD/$FWD" 2> "$WORK/F1-apply.log"; a=$?; sed 's/^/   /' "$WORK/F1-apply.log" | head -2
run_chain "$WORK/F1.log" verify "$WORK/F1/deploy/render" "$PD" "$REV" "$ARC" "$INV"
chk "F1 git apply refuses the changed base" "$([ "$a" != 0 ] && echo 0 || echo 1)"
chk "F1 verify refuses it (not the recorded baseline), and the dependent step didn't run" "$(refused F1 "$WORK/F1.log" 'the context is not the recorded baseline' && echo 0 || echo 1)"

echo "-- F2: a base changed outside every hunk (one byte of cgn-backup.sh)"
variant F2 cgn-backup.sh 's/BACKUP_OK/BACKUP_0K/'
git -C "$WORK/F2" apply --check --directory=deploy/render "$PD/$FWD" 2>/dev/null; a=$?
run_chain "$WORK/F2.log" verify "$WORK/F2/deploy/render" "$PD" "$REV" "$ARC" "$INV"
chk "F2 git apply alone would apply (exit $a), so the baseline check is what refuses" "$([ "$a" = 0 ] && echo 0 || echo 1)"
chk "F2 verify refuses it, naming cgn-backup.sh, and the dependent step didn't run" "$(refused F2 "$WORK/F2.log" 'cgn-backup.sh: FAILED' && echo 0 || echo 1)"

echo "-- F3: an already-forwarded base"
rm -rf "$WORK/F3"; git clone -q --no-local "$C" "$WORK/F3" 2>/dev/null && git -C "$WORK/F3" -c advice.detachedHead=false checkout -q --detach "$BASE" && git -C "$WORK/F3" apply --directory=deploy/render "$PD/$FWD"
git -C "$WORK/F3" apply --check --directory=deploy/render "$PD/$FWD" 2>/dev/null; a=$?
run_chain "$WORK/F3.log" verify "$WORK/F3/deploy/render" "$PD" "$REV" "$ARC" "$INV"
chk "F3 git apply refuses the forward twice" "$([ "$a" != 0 ] && echo 0 || echo 1)"
chk "F3 verify refuses an already-forwarded context" "$(refused F3 "$WORK/F3.log" 'has no regular file pins/release-7097ac2.inventory.sha256' && echo 0 || echo 1)"

echo "-- F4: a mismatched substitution"
variant F4a cgn-artifact-gate.sh 's/^REVISION=7097ac2bb062925bb296a129f4771f1e68fd522d$/REVISION=7097ac2bb062925bb296a129f4771f1e68fd522e/m'
run_chain "$WORK/F4a.log" make "$WORK/F4a/deploy/render" "$REV" "$ARC" "$C/$INVREL" "$INV" "$WORK/F4a-out"
chk "F4 the revision line moved: refused (expected 1 occurrence, found 0), no output, no dependent step" "$(refused F4a "$WORK/F4a.log" "expected 1 occurrence(s) of 'REVISION=7097ac2bb062925bb296a129f4771f1e68fd522d', found 0" && [ ! -e "$WORK/F4a-out" ] && echo 0 || echo 1)"
variant F4b cgn-artifact-gate.sh 's/^set -eu$/set -eu\n# see pins\/release-7097ac2.inventory.sha256/m'
run_chain "$WORK/F4b.log" make "$WORK/F4b/deploy/render" "$REV" "$ARC" "$C/$INVREL" "$INV" "$WORK/F4b-out"
chk "F4 a fourth mention of the inventory pin: refused (expected 3, found 4), no output" "$(refused F4b "$WORK/F4b.log" "expected 3 occurrence(s) of 'release-7097ac2.inventory.sha256', found 4" && [ ! -e "$WORK/F4b-out" ] && echo 0 || echo 1)"

# A tampered copy of the patch folder whose SHA256SUMS is made to match (a consistent but wrong proposal).
tampered() { rm -rf "$WORK/$1"; cp -a "$PD" "$WORK/$1"; }
resum() { (cd "$WORK/$1" && LC_ALL=C sha256sum "$FWD" "$RVT" IDENTITY baseline.sha256 forward.sha256 > SHA256SUMS); }
extra_hunk() { # <folder> <patch> <path>: append a real one-line change of <path> to <patch>
  local x="$WORK/x-$1"; rm -rf "$x"; mkdir -p "$x/a/$(dirname "$3")" "$x/b/$(dirname "$3")"
  cp "$D/$3" "$x/a/$3"; cp "$D/$3" "$x/b/$3"; echo "# changed" >> "$x/b/$3"
  (cd "$x" && git diff --no-index --full-index "a/$3" "b/$3" | sed -e "s#a/a/#a/#g" -e "s#b/b/#b/#g") >> "$WORK/$1/$2"; rm -rf "$x"
}
echo "-- F5: an unexpected changed file"
tampered F5a; extra_hunk F5a "$FWD" cgn-entrypoint.sh; resum F5a
run_chain "$WORK/F5a.log" verify "$D" "$WORK/F5a" "$REV" "$ARC" "$INV"
chk "F5 forward also changing cgn-entrypoint.sh (SHA256SUMS matching): refused by the allowlist" "$(refused F5a "$WORK/F5a.log" 'not exactly the allowlist' && echo 0 || echo 1)"
tampered F5b; extra_hunk F5b "$FWD" pins/scripts.sha256; resum F5b
run_chain "$WORK/F5b.log" verify "$D" "$WORK/F5b" "$REV" "$ARC" "$INV"
chk "F5 forward also changing the guard pin pins/scripts.sha256: refused by the allowlist" "$(refused F5b "$WORK/F5b.log" 'not exactly the allowlist' && echo 0 || echo 1)"
tampered F5c; extra_hunk F5c "$RVT" render.yaml; resum F5c
run_chain "$WORK/F5c.log" verify "$D" "$WORK/F5c" "$REV" "$ARC" "$INV"
chk "F5 the revert also changing render.yaml (provider configuration): refused by the allowlist" "$(refused F5c "$WORK/F5c.log" 'not exactly the allowlist' && echo 0 || echo 1)"

echo "-- F6: a non-identity change inside an allowlisted file"
tampered F6
perl -0pi -e 's/^ (# Every base image is pinned by digest; there is )no( ARG .*)$/-${1}no$2\n+${1}an$2/m' "$WORK/F6/$FWD"
resum F6
run_chain "$WORK/F6.log" verify "$D" "$WORK/F6" "$REV" "$ARC" "$INV"
chk "F6 forward also rewording the Dockerfile's no-ARG line (applies cleanly): refused, beyond the identity tokens" "$(refused F6 "$WORK/F6.log" 'Dockerfile differs from the baseline beyond the identity tokens' && echo 0 || echo 1)"

echo "-- F7: another build's identity"
run_chain "$WORK/F7.log" verify "$D" "$PD" "$REV" "$DEV_ARC" "$INV"
chk "F7 the developer archive f3bd00ea... as the selected pin: refused (the folder pins aac13a8a...)" "$(refused F7 "$WORK/F7.log" "the patch folder pins archive_sha256=$ARC, not the selected $DEV_ARC" && echo 0 || echo 1)"

echo "-- F8: a revert that doesn't restore the baseline"
tampered F8
perl -0pi -e 's/^\+ARCHIVE=mchezo-7097ac2\.tgz$/+ARCHIVE=mchezo-7097ac3.tgz/m' "$WORK/F8/$RVT"; resum F8
run_chain "$WORK/F8.log" verify "$D" "$WORK/F8" "$REV" "$ARC" "$INV"
chk "F8 a revert that writes ARCHIVE=mchezo-7097ac3.tgz: refused (the baseline is not restored)" "$(refused F8 "$WORK/F8.log" 'the revert did not restore the baseline' && echo 0 || echo 1)"

echo "-- F9: the output folder already exists"
mkdir -p "$WORK/F9-out"; echo keep > "$WORK/F9-out/keep"
run_chain "$WORK/F9.log" make "$D" "$REV" "$ARC" "$C/$INVREL" "$INV" "$WORK/F9-out"
chk "F9 refused, and the existing folder is left as it was" "$(refused F9 "$WORK/F9.log" 'already exists' && [ "$(ls -A "$WORK/F9-out")" = keep ] && [ "$(cat "$WORK/F9-out/keep")" = keep ] && echo 0 || echo 1)"

echo "-- I1: interrupted"
W7PINS_TEST_HOLD="$WORK/I1-hold" bash "$H" make "$D" "$REV" "$ARC" "$C/$INVREL" "$INV" "$WORK/I1-out" > "$WORK/I1.log" 2>&1 &
hp=$!
for _ in $(seq 1 100); do [ -s "$WORK/I1-hold" ] && break; sleep 0.1; done
held=$(cat "$WORK/I1-hold" 2>/dev/null); [ -n "$held" ] && [ -d "$held" ]; h=$?
kill -TERM "$hp"; wait "$hp"; e=$?
sleep 0.3
echo "   held $held (present: $([ "$h" = 0 ] && echo yes || echo no)); exit $e; after: $([ -e "$held" ] && echo present || echo gone)"
chk "I1 SIGTERM: exit 143, the private folder is gone, no output, no process names a w7pins folder" "$([ "$h" = 0 ] && [ "$e" = 143 ] && [ ! -e "$held" ] && [ ! -e "$WORK/I1-out" ] && tmp_empty && ! pgrep -f "w7pins\." >/dev/null && echo 0 || echo 1)" "exit $e"

echo "-- I2: isolation"
chk "I2 the private temporary root is empty after every case" "$(tmp_empty && echo 0 || echo 1)" "$(ls -A "$TMPDIR" | head -3 | tr '\n' ' ')"
chk "I2 the sentinel is unchanged" "$(cmp -s "$WORK/sentinel" "$WORK/sentinel.expected" && echo 0 || echo 1)"
repo_state > "$WORK/repo-after"
chk "I2 this checkout is unchanged (HEAD, status, worktrees, branches and tags, stash)" "$(cmp -s "$WORK/repo-before" "$WORK/repo-after" && echo 0 || echo 1)" "$(diff "$WORK/repo-before" "$WORK/repo-after" | head -3 | tr '\n' ' ')"
chk "I2 the isolated copy is clean at the base" "$([ -z "$(git -C "$C" status --porcelain --untracked-files=all)" ] && [ "$(git -C "$C" rev-parse HEAD)" = "$BASE" ] && echo 0 || echo 1)"

echo "== $passn passed, $failn failed (work folder $WORK)"
if [ "$failn" = 0 ]; then echo "W7 PINS SELFTEST PASSED"; exit 0; fi
echo "W7 PINS SELFTEST FAILED"; exit 1
