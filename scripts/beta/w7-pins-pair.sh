#!/bin/bash
# Beta R4 W7, B-W7-01 (handoff 6966073894): the PINS-ONLY forward change of the deploy context, from the audited
# 7097ac2 to a newer audited release, and its inverse (the revert), as two named patches against an exact baseline.
#
# The deploy context is what README.md's "Assembling the deploy repository" copies from deploy/render: every file but
# operator/ and README.md. artifact/ is not part of it here: the archive bytes are private and never in a patch.
# The forward patch changes ONLY the artifact pins, with the exact, counted substitutions of
# scripts/beta/w7-pred-context.sh, plus the two comment lines of the gate that name the pinned digests:
#   cgn-artifact-gate.sh  REVISION=, ARCHIVE=, INVENTORY_SHA256=, the inventory pin file's name (3 times), and the
#                         comment lines "(pins/archive.sha256): a693c543..., recorded in docs/beta/release-7097ac2.md"
#                         and "whose own SHA-256 is fe6d74f8...;"
#   pins/archive.sha256   "<archive sha256>  mchezo-<short>.tgz"
#   pins/release-7097ac2.inventory.sha256 is deleted; pins/release-<short>.inventory.sha256 is added (the new inventory)
#   .dockerignore         the two admitted names (the archive, the inventory pin)
#   Dockerfile            the archive name in its header comment
# INVENTORY_FILES is not substituted: the new inventory must have the same count. The guard scripts, their pins, the
# image and age pins, the environment and render.yaml stay byte for byte, and verify proves it.
#
#   bash scripts/beta/w7-pins-pair.sh make <deploy/render> <revision> <archive sha256> <inventory file> <inventory sha256> <new out dir>
#       writes: forward-7097ac2-to-<short>.patch, revert-<short>-to-7097ac2.patch, IDENTITY, baseline.sha256,
#       forward.sha256 and SHA256SUMS. Prints PINS_PAIR_MADE.
#   bash scripts/beta/w7-pins-pair.sh verify <deploy context> <patch dir> <revision> <archive sha256> <inventory sha256> [--forward-context <new dir>]
#       The selected identity is given on the command line and must be the one the patch folder pins. In a private
#       copy: the context is the recorded baseline; both patches touch exactly the allowlist; forward applies; the
#       guards and their pins are unchanged; the changed files differ from the baseline by the identity tokens only;
#       the pins agree with each other; the forward tree is the recorded one; the revert applies and restores the
#       baseline byte for byte. Prints PINS_PAIR_VERIFIED. --forward-context writes the verified forward context.
# Exit 0 on success; 1 with PINS_PAIR_FAILED on any surprise; 2 bad usage. Every temporary file is in one private
# folder under $TMPDIR, removed on success, failure, SIGINT and SIGTERM. Nothing else is written but the named output.
set -euo pipefail
CUR_REV=7097ac2bb062925bb296a129f4771f1e68fd522d
CUR_SHORT=7097ac2
CUR_ARC=a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131
CUR_INV=fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c
CUR_NAME=mchezo-$CUR_SHORT.tgz
CUR_PINF=release-$CUR_SHORT.inventory.sha256
CONTEXT=(.dockerignore Dockerfile cgn-artifact-gate.sh cgn-authorize.sh cgn-backup.sh cgn-entrypoint.sh
         pins/age.sha256 pins/archive.sha256 "pins/$CUR_PINF" pins/scripts.sha256 render.yaml)
UNCHANGED=(cgn-entrypoint.sh cgn-backup.sh cgn-authorize.sh pins/scripts.sha256 pins/age.sha256 render.yaml)
fail() { echo "PINS_PAIR_FAILED: $*" >&2; exit 1; }
usage() { sed -n '/^#   bash/,/^#       baseline byte/p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

T=""; HOLD_PID=""
cleanup() { [ -z "$HOLD_PID" ] || kill "$HOLD_PID" 2>/dev/null || true; [ -z "$T" ] || rm -rf "$T"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
newtmp() {
  T=$(mktemp -d "${TMPDIR:-/tmp}/w7pins.XXXXXXXX") || fail "no temporary folder"
  # Test hook (scripts/beta/w7-pins-selftest.sh only): name the private folder, then wait to be interrupted.
  if [ -n "${W7PINS_TEST_HOLD:-}" ]; then echo "$T" > "$W7PINS_TEST_HOLD"; sleep 60 & HOLD_PID=$!; wait "$HOLD_PID" || true; HOLD_PID=""; fi
}
# git in the private copy only: no user or system configuration, fixed identity and dates, no renames, no colour.
G() {
  GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_DATE='2026-01-01T00:00:00Z' GIT_COMMITTER_DATE='2026-01-01T00:00:00Z' \
    git -C "$T/r" -c core.autocrlf=false -c core.fileMode=true -c user.name=w7-pins -c user.email=w7-pins@localhost "$@"
}
gdiff() { G diff --no-renames --full-index --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ "$@"; }
hex() { [[ "$1" =~ ^[0-9a-f]{$2}$ ]]; }
sha() { sha256sum "$1" | cut -d' ' -f1; }

identity_args() { # <revision> <archive sha256> <inventory sha256>
  hex "$1" 40 || fail "the revision must be 40 hex digits"
  [ "$1" != "$CUR_REV" ] || fail "the revision is the current release ($CUR_SHORT), not a newer one"
  hex "$2" 64 || fail "the archive SHA-256 must be 64 hex digits"
  [ "$2" != "$CUR_ARC" ] || fail "the archive SHA-256 is the current release's"
  hex "$3" 64 || fail "the inventory SHA-256 must be 64 hex digits"
  [ "$3" != "$CUR_INV" ] || fail "the inventory SHA-256 is the current release's"
  REV=$1; ARC=$2; INV=$3; SHORT=${REV:0:7}; NAME=mchezo-$SHORT.tgz; PINF=release-$SHORT.inventory.sha256
  FWD=forward-$CUR_SHORT-to-$SHORT.patch; RVT=revert-$SHORT-to-$CUR_SHORT.patch
  ALLOW=(.dockerignore Dockerfile cgn-artifact-gate.sh pins/archive.sha256 "pins/$CUR_PINF" "pins/$PINF")
}
copy_context() { # <from> <to>: exactly the context files, modes kept
  local f
  for f in "${CONTEXT[@]}"; do
    [ -f "$1/$f" ] && [ ! -L "$1/$f" ] || fail "the context at $1 has no regular file $f"
    mkdir -p "$2/$(dirname "$f")"; cp -p "$1/$f" "$2/$f"
  done
}
check_inventory_file() { # <file>: the inventory format of docs/beta/release-7097ac2.md
  local f=$1 n
  n=$(wc -l < "$f" | tr -d ' ')
  [ "$n" -gt 0 ] && [ -z "$(tail -c1 "$f")" ] || fail "the inventory is empty or doesn't end with a newline"
  [ "$(grep -cvE '^[0-9a-f]{64}  \./[^[:cntrl:]]+$' "$f" || true)" = 0 ] || fail "the inventory has a line that isn't '<sha256>  ./<path>'"
  cut -c67- "$f" | LC_ALL=C sort -c 2>/dev/null || fail "the inventory isn't sorted by path"
  [ -z "$(cut -c67- "$f" | LC_ALL=C uniq -d | head -1)" ] || fail "the inventory names a path twice"
  ! grep -qE '  \./(release\.json|node_modules/.*)$' "$f" || fail "the inventory lists release.json or node_modules"
  INV_N=$n
}
pins_agree() { # <forward context>: the pins agree with each other and with the selected identity
  local c=$1 g=$1/cgn-artifact-gate.sh
  cmp -s <(printf '%s  %s\n' "$ARC" "$NAME") "$c/pins/archive.sha256" || fail "pins/archive.sha256 is not exactly '$ARC  $NAME'"
  [ "$(sha "$c/pins/$PINF")" = "$INV" ] || fail "pins/$PINF has the SHA-256 $(sha "$c/pins/$PINF"), not $INV"
  check_inventory_file "$c/pins/$PINF"
  [ "$(grep -cx "REVISION=$REV" "$g")" = 1 ] || fail "the gate doesn't pin REVISION=$REV exactly once"
  [ "$(grep -cx "ARCHIVE=$NAME" "$g")" = 1 ] || fail "the gate doesn't pin ARCHIVE=$NAME exactly once"
  [ "$(grep -cx "INVENTORY_SHA256=$INV" "$g")" = 1 ] || fail "the gate doesn't pin INVENTORY_SHA256=$INV exactly once"
  [ "$(grep -cx "INVENTORY_FILES=$INV_N" "$g")" = 1 ] || fail "the gate's INVENTORY_FILES isn't the inventory's $INV_N lines"
  [ "$(grep -cF "\$PINS/$PINF" "$g")" = 1 ] || fail "the gate doesn't compare against \$PINS/$PINF"
  [ "$(grep -cx "!artifact/$NAME" "$c/.dockerignore")" = 1 ] && [ "$(grep -cx "!pins/$PINF" "$c/.dockerignore")" = 1 ] \
    || fail ".dockerignore doesn't admit exactly artifact/$NAME and pins/$PINF"
  [ "$(grep -c '^!artifact/' "$c/.dockerignore")" = 1 ] || fail ".dockerignore admits another archive"
  local f; for f in Dockerfile .dockerignore cgn-artifact-gate.sh pins/archive.sha256; do
    ! grep -qE "$CUR_NAME|$CUR_PINF|$CUR_REV|$CUR_ARC|$CUR_INV" "$c/$f" || fail "$f still names the $CUR_SHORT release"
  done
  [ ! -e "$c/pins/$CUR_PINF" ] || fail "pins/$CUR_PINF is still there"
  sh -n "$g" && bash -n "$g" || fail "the gate isn't valid shell"
}
# The changed text files differ from the baseline by the identity tokens only: map every new token back to the old
# one, and the result must be the baseline file byte for byte.
tokens_only() { # <file> <forward copy> <baseline copy>
  OLD_COMMENT_A="(pins/archive.sha256): ${CUR_ARC:0:8}..., recorded in docs/beta/release-$CUR_SHORT.md" \
  NEW_COMMENT_A="(pins/archive.sha256): ${ARC:0:8}..., recorded in docs/beta/release-$SHORT.md" \
  OLD_COMMENT_I="whose own SHA-256 is ${CUR_INV:0:8}...;" NEW_COMMENT_I="whose own SHA-256 is ${INV:0:8}...;" \
  REV="$REV" CUR_REV="$CUR_REV" NAME="$NAME" CUR_NAME="$CUR_NAME" PINF="$PINF" CUR_PINF="$CUR_PINF" INV="$INV" CUR_INV="$CUR_INV" \
  perl -0pe 's/\Q$ENV{NEW_COMMENT_A}\E/$ENV{OLD_COMMENT_A}/g; s/\Q$ENV{NEW_COMMENT_I}\E/$ENV{OLD_COMMENT_I}/g;
             s/\Q$ENV{REV}\E/$ENV{CUR_REV}/g; s/\Q$ENV{NAME}\E/$ENV{CUR_NAME}/g; s/\Q$ENV{PINF}\E/$ENV{CUR_PINF}/g;
             s/\Q$ENV{INV}\E/$ENV{CUR_INV}/g' "$2" > "$T/normalized"
  cmp -s "$T/normalized" "$3" || fail "$1 differs from the baseline beyond the identity tokens: $(diff "$3" "$T/normalized" | grep '^[<>]' | head -4 | tr '\n' ' ')"
}
allowlist() { # <patch file>: the paths it touches are exactly the allowlist (git's own parser, and the headers)
  local p=$1 got want
  got=$(G apply --numstat "$p" 2>/dev/null | cut -f3 | LC_ALL=C sort | tr '\n' ' ') || fail "$(basename "$p") is not a patch git can read"
  want=$(printf '%s\n' "${ALLOW[@]}" | LC_ALL=C sort | tr '\n' ' ')
  [ "$got" = "$want" ] || fail "$(basename "$p") touches [${got% }], not exactly the allowlist [${want% }]"
  got=$(grep -E '^diff --git ' "$p" | sed -E 's#^diff --git a/(.*) b/(.*)$#\1|\2#' | LC_ALL=C sort | tr '\n' ' ')
  [ "$got" = "$(printf '%s\n' "${ALLOW[@]}" | sed 's#.*#&|&#' | LC_ALL=C sort | tr '\n' ' ')" ] || fail "$(basename "$p")'s file headers name [${got% }]"
  ! grep -qE '^(old mode|new mode|similarity index|dissimilarity index|rename from|rename to|copy from|copy to|Binary files|GIT binary patch)' "$p" \
    || fail "$(basename "$p") changes a mode, renames, copies or holds binary data"
  [ "$(grep -cE '^(deleted file mode|new file mode) ' "$p")" = 2 ] && [ -z "$(grep -E '^(deleted file mode|new file mode) ' "$p" | grep -v ' 100644$')" ] \
    || fail "$(basename "$p") must delete one and create one inventory pin, mode 100644"
}

MODE=${1:-}; [ $# -gt 0 ] && shift
case "$MODE" in
make)
  [ $# -eq 6 ] || usage
  SRC=$1; INVF=$4; OUT=$6
  identity_args "$2" "$3" "$5"
  [ ! -e "$OUT" ] || fail "$OUT already exists"
  [ -f "$INVF" ] || fail "no inventory file at $INVF"
  [ "$(sha "$INVF")" = "$INV" ] || fail "the inventory file's SHA-256 is $(sha "$INVF"), not the selected $INV"
  check_inventory_file "$INVF"
  newtmp; mkdir -p "$T/r" "$T/out"
  copy_context "$SRC" "$T/r"
  # The baseline: the audited 7097ac2 pins, exactly.
  cmp -s <(printf '%s  %s\n' "$CUR_ARC" "$CUR_NAME") "$T/r/pins/archive.sha256" || fail "the baseline's pins/archive.sha256 is not '$CUR_ARC  $CUR_NAME'"
  [ "$(sha "$T/r/pins/$CUR_PINF")" = "$CUR_INV" ] || fail "the baseline's pins/$CUR_PINF is not the audited inventory"
  G init -q -b work; G add -A; G commit -q -m "baseline: the reviewed deploy context, $CUR_SHORT pins"; G tag baseline
  (cd "$T/r" && LC_ALL=C sha256sum "${CONTEXT[@]}") > "$T/out/baseline.sha256"
  replace() { # <file> <old> <new> <expected count>: exact and counted (fails if the reviewed text moved)
    local n; n=$( { grep -oF -- "$2" "$T/r/$1" || true; } | wc -l | tr -d ' ')
    [ "$n" = "$4" ] || fail "$1: expected $4 occurrence(s) of '$2', found $n"
    OLD=$2 NEW=$3 perl -0pi -e 's/\Q$ENV{OLD}\E/$ENV{NEW}/g' "$T/r/$1"
    ! grep -qF -- "$2" "$T/r/$1" || fail "$1: '$2' is still there"
  }
  replace cgn-artifact-gate.sh "REVISION=$CUR_REV" "REVISION=$REV" 1
  replace cgn-artifact-gate.sh "ARCHIVE=$CUR_NAME" "ARCHIVE=$NAME" 1
  replace cgn-artifact-gate.sh "INVENTORY_SHA256=$CUR_INV" "INVENTORY_SHA256=$INV" 1
  replace cgn-artifact-gate.sh "$CUR_PINF" "$PINF" 3
  replace cgn-artifact-gate.sh "(pins/archive.sha256): ${CUR_ARC:0:8}..., recorded in docs/beta/release-$CUR_SHORT.md" "(pins/archive.sha256): ${ARC:0:8}..., recorded in docs/beta/release-$SHORT.md" 1
  replace cgn-artifact-gate.sh "whose own SHA-256 is ${CUR_INV:0:8}...;" "whose own SHA-256 is ${INV:0:8}...;" 1
  replace .dockerignore "!artifact/$CUR_NAME" "!artifact/$NAME" 1
  replace .dockerignore "!pins/$CUR_PINF" "!pins/$PINF" 1
  replace Dockerfile "artifact/$CUR_NAME" "artifact/$NAME" 1
  G rm -q "pins/$CUR_PINF"
  cp "$INVF" "$T/r/pins/$PINF"; chmod 0644 "$T/r/pins/$PINF"
  printf '%s  %s\n' "$ARC" "$NAME" > "$T/r/pins/archive.sha256"
  pins_agree "$T/r"
  for f in "${UNCHANGED[@]}"; do G diff --quiet baseline -- "$f" || fail "$f changed"; done
  G add -A
  gdiff --cached > "$T/out/$FWD"
  G commit -q -m "forward: pins for $SHORT"
  gdiff HEAD baseline > "$T/out/$RVT"
  (cd "$T/r" && LC_ALL=C sha256sum $(printf '%s\n' "${CONTEXT[@]}" | sed "s#^pins/$CUR_PINF\$#pins/$PINF#" | LC_ALL=C sort)) > "$T/out/forward.sha256"
  cat > "$T/out/IDENTITY" <<EOF
base_revision=$CUR_REV
base_archive=$CUR_NAME
base_archive_sha256=$CUR_ARC
base_inventory_sha256=$CUR_INV
base_context_tree=$(G rev-parse 'baseline^{tree}')
revision=$REV
archive=$NAME
archive_sha256=$ARC
inventory_pin=pins/$PINF
inventory_sha256=$INV
inventory_files=$INV_N
forward_context_tree=$(G rev-parse 'HEAD^{tree}')
forward_patch=$FWD
revert_patch=$RVT
EOF
  (cd "$T/out" && LC_ALL=C sha256sum "$FWD" "$RVT" IDENTITY baseline.sha256 forward.sha256) > "$T/out/SHA256SUMS"
  mkdir "$OUT" || fail "could not create $OUT"
  cp -p "$T/out/"* "$OUT/"
  echo "-- the forward change ($FWD):"; G diff --stat --no-renames baseline HEAD | sed 's/^/   /'
  echo "PINS_PAIR_MADE revision=$REV archive=$ARC inventory=$INV files=$INV_N forward=$(sha "$OUT/$FWD") revert=$(sha "$OUT/$RVT") base-tree=$(G rev-parse 'baseline^{tree}') forward-tree=$(G rev-parse 'HEAD^{tree}')"
  ;;
verify)
  [ $# -eq 5 ] || [ $# -eq 7 ] || usage
  CTX=$1; PD=$2; EMIT=""
  if [ $# -eq 7 ]; then [ "$6" = --forward-context ] || usage; EMIT=$7; [ ! -e "$EMIT" ] || fail "$EMIT already exists"; fi
  identity_args "$3" "$4" "$5"
  for f in "$FWD" "$RVT" IDENTITY baseline.sha256 forward.sha256 SHA256SUMS; do [ -f "$PD/$f" ] || fail "the patch folder has no $f"; done
  PD=$(cd "$PD" && pwd)
  (cd "$PD" && sha256sum -c --strict --quiet SHA256SUMS) || fail "the patch folder's files don't match its SHA256SUMS"
  idv() { sed -n "s/^$1=//p" "$PD/IDENTITY"; }
  for k in revision:$REV archive_sha256:$ARC inventory_sha256:$INV archive:$NAME inventory_pin:pins/$PINF base_revision:$CUR_REV base_archive_sha256:$CUR_ARC base_inventory_sha256:$CUR_INV; do
    [ "$(idv "${k%%:*}")" = "${k#*:}" ] || fail "the patch folder pins ${k%%:*}=$(idv "${k%%:*}"), not the selected ${k#*:}"
  done
  newtmp; mkdir -p "$T/r"
  copy_context "$CTX" "$T/r"
  [ "$(cut -c67- "$PD/baseline.sha256" | tr '\n' ' ')" = "$(printf '%s\n' "${CONTEXT[@]}" | tr '\n' ' ')" ] || fail "baseline.sha256 doesn't list exactly the context files"
  (cd "$T/r" && sha256sum -c --strict --quiet "$PD/baseline.sha256") >/dev/null 2>&1 || fail "the context is not the recorded baseline: $(cd "$T/r" && sha256sum -c --strict "$PD/baseline.sha256" 2>/dev/null | grep -v ': OK$' | tr '\n' ' ')"
  G init -q -b work; G add -A; G commit -q -m baseline; G tag baseline
  [ "$(G rev-parse 'baseline^{tree}')" = "$(idv base_context_tree)" ] || fail "the baseline tree is not the recorded one"
  allowlist "$PD/$FWD"; allowlist "$PD/$RVT"
  G apply --check "$PD/$FWD" || fail "the forward patch doesn't apply to the baseline"
  G apply --index "$PD/$FWD"
  for f in "${UNCHANGED[@]}"; do G diff --cached --quiet baseline -- "$f" && cmp -s "$CTX/$f" "$T/r/$f" || fail "$f is not byte for byte the baseline"; done
  for f in Dockerfile .dockerignore cgn-artifact-gate.sh; do G show "baseline:$f" > "$T/base-file"; tokens_only "$f" "$T/r/$f" "$T/base-file"; done
  pins_agree "$T/r"
  [ "$(G write-tree)" = "$(idv forward_context_tree)" ] || fail "the forward tree is not the recorded one"
  (cd "$T/r" && sha256sum -c --strict --quiet "$PD/forward.sha256") >/dev/null 2>&1 || fail "the forward context doesn't match forward.sha256"
  [ "$(find "$T/r" -path "$T/r/.git" -prune -o -type f -print | wc -l | tr -d ' ')" = "${#CONTEXT[@]}" ] || fail "the forward context holds another file"
  if [ -n "$EMIT" ]; then mkdir "$EMIT" && (cd "$T/r" && tar -cf - --exclude=./.git .) | tar -xf - -C "$EMIT" || fail "could not write $EMIT"; fi
  G apply --check "$PD/$RVT" || fail "the revert patch doesn't apply to the forward context"
  G apply --index "$PD/$RVT"
  [ "$(G write-tree)" = "$(idv base_context_tree)" ] && G diff --quiet baseline && G diff --cached --quiet baseline \
    && [ -z "$(G status --porcelain --untracked-files=all)" ] || fail "the revert did not restore the baseline: $(G status --porcelain --untracked-files=all | tr '\n' ' ')"
  (cd "$T/r" && sha256sum -c --strict --quiet "$PD/baseline.sha256") >/dev/null 2>&1 || fail "the reverted context doesn't match baseline.sha256 byte for byte"
  for f in "${CONTEXT[@]}"; do cmp -s "$CTX/$f" "$T/r/$f" || fail "the reverted $f differs from the given context"; done
  G apply --check "$PD/$FWD" || fail "the forward patch doesn't apply again after the revert"
  echo "PINS_PAIR_VERIFIED revision=$REV archive=$ARC inventory=$INV files=$INV_N forward=$(sha "$PD/$FWD") revert=$(sha "$PD/$RVT") base-tree=$(idv base_context_tree) forward-tree=$(idv forward_context_tree) changed=${#ALLOW[@]} guards=unchanged reverted=byte-identical${EMIT:+ forward-context=$EMIT}"
  ;;
*) usage ;;
esac
