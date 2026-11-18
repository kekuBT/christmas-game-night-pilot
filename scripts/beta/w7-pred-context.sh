#!/bin/bash
# Beta R4 W7 (handoff 6941129590): the build context of a PREVIOUS release, as a revert commit of the deploy repository
# would produce it: the reviewed deploy/render unchanged EXCEPT its artifact pins (the gate's revision, archive name and
# inventory hash, pins/archive.sha256, the inventory pin file, and the two file names in .dockerignore and the
# Dockerfile). The guard scripts (cgn-entrypoint, cgn-backup, cgn-authorize) and their pins stay the reviewed ones, so
# the previous release runs under the same guard and through the same artifact gate.
#
# There is NO audited predecessor artifact: 7097ac2 (a693c543...) is the first audited archive of this route. This
# script is used with the LOCAL SURROGATE built by docs/evidence/beta-r4-w7/runners/build-predecessor.sh (f93e9cb), to
# test the protocol only; it cannot pass the actual predecessor-artifact check. The canonical deploy/render pins are
# never changed: the context is written to a new folder.
#   bash scripts/beta/w7-pred-context.sh <deploy/render> <archive> <inventory file> <revision (40 hex)> <new context dir>
# Prints the diff against deploy/render (pins only) and "PRED_CONTEXT_OK ..."; exits non-zero on any surprise.
set -euo pipefail
SRC=${1:?deploy/render}; ARC=${2:?archive}; INV=${3:?inventory}; REV=${4:?revision}; OUT=${5:?new context dir}
CUR_REV=7097ac2bb062925bb296a129f4771f1e68fd522d
fail() { echo "PRED_CONTEXT_FAILED: $*" >&2; exit 1; }
[[ "$REV" =~ ^[0-9a-f]{40}$ ]] || fail "the revision must be 40 hex digits"
[ "$REV" != "$CUR_REV" ] || fail "the revision is the current release, not a previous one"
[ -f "$ARC" ] && [ -f "$INV" ] || fail "the archive or the inventory is missing"
[ ! -e "$OUT" ] || fail "$OUT already exists"
SHORT=${REV:0:7}
NAME="mchezo-$SHORT.tgz"; PINF="release-$SHORT.inventory.sha256"
INV_SHA=$(sha256sum "$INV" | cut -d' ' -f1); INV_N=$(wc -l < "$INV" | tr -d ' ')
mkdir -p "$OUT/artifact"
(cd "$SRC" && cp -a Dockerfile .dockerignore cgn-artifact-gate.sh cgn-entrypoint.sh cgn-backup.sh cgn-authorize.sh pins "$OUT/")
# replace <file> <old> <new> <expected count>: an exact, counted substitution (fails if the reviewed text moved)
replace() {
  local n; n=$( { grep -oF -- "$2" "$OUT/$1" || true; } | wc -l | tr -d ' ')
  [ "$n" = "$4" ] || fail "$1: expected $4 occurrence(s) of '$2', found $n"
  OLD=$2 NEW=$3 perl -0pi -e 's/\Q$ENV{OLD}\E/$ENV{NEW}/g' "$OUT/$1"
  ! grep -qF -- "$2" "$OUT/$1" || fail "$1: '$2' is still there"
}
replace cgn-artifact-gate.sh "REVISION=$CUR_REV" "REVISION=$REV" 1
replace cgn-artifact-gate.sh "ARCHIVE=mchezo-7097ac2.tgz" "ARCHIVE=$NAME" 1
replace cgn-artifact-gate.sh "INVENTORY_SHA256=fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c" "INVENTORY_SHA256=$INV_SHA" 1
replace cgn-artifact-gate.sh "release-7097ac2.inventory.sha256" "$PINF" 3
grep -qx "INVENTORY_FILES=$INV_N" "$OUT/cgn-artifact-gate.sh" || fail "the predecessor's inventory has $INV_N files; the gate expects $(grep '^INVENTORY_FILES=' "$OUT/cgn-artifact-gate.sh")"
replace .dockerignore "!artifact/mchezo-7097ac2.tgz" "!artifact/$NAME" 1
replace .dockerignore "!pins/release-7097ac2.inventory.sha256" "!pins/$PINF" 1
replace Dockerfile "artifact/mchezo-7097ac2.tgz" "artifact/$NAME" 1
rm -f "$OUT/pins/release-7097ac2.inventory.sha256"
cp "$INV" "$OUT/pins/$PINF"
cp "$ARC" "$OUT/artifact/$NAME"
(cd "$OUT/artifact" && sha256sum "$NAME") > "$OUT/pins/archive.sha256"
# The guard scripts and their pins are the reviewed ones, byte for byte.
for f in cgn-entrypoint.sh cgn-backup.sh cgn-authorize.sh pins/scripts.sha256 pins/age.sha256; do cmp -s "$SRC/$f" "$OUT/$f" || fail "$f differs from the reviewed one"; done
echo "-- the predecessor context against deploy/render (only the artifact pins may differ):"
diff -r "$SRC" "$OUT" -x artifact -x README.md -x render.yaml -x operator | sed 's/^/   /' || true
echo "PRED_CONTEXT_OK revision=$REV archive=$(cut -d' ' -f1 "$OUT/pins/archive.sha256") inventory=$INV_SHA files=$INV_N guard-scripts=reviewed"
