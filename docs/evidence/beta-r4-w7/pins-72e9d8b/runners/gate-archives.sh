#!/bin/bash
# B-W7-01 (handoff 6966073894): the proposed forward context and the reverted context through the UNCHANGED artifact
# gate, with the archives this session holds. LOCAL, developer-run.
# - The gate is each context's own cgn-artifact-gate.sh, run directly (no docker) as the Dockerfile's gate stage runs
#   it: `sh cgn-artifact-gate.sh gate <inputs> <out>` under the official Node v22.16.0, where sh is dash, on an inputs
#   folder laid out like the stage's /gate: the scripts, pins/ and artifact/, each file only if the context's
#   .dockerignore admits it.
# - The audited archives aac13a8a... (72e9d8b) and a693c543... (7097ac2) are NOT here. Their positive checks are
#   ChatGPT's, on the retained bytes.
#   G1  forward (aac13a8a... pin) + the developer archive f3bd00ea... as mchezo-72e9d8b.tgz: REFUSED (archive SHA-256)
#   G2  forward + f3bd00ea... under the old name mchezo-7097ac2.tgz: REFUSED (.dockerignore doesn't admit it; artifact/
#       must hold mchezo-72e9d8b.tgz)
#   G3  forward + a local 7097ac2 rebuild as mchezo-72e9d8b.tgz, with the archive pin re-pointed to it: REFUSED
#       (the inventory is not the pinned one): the identity check doesn't rest on the archive pin alone
#   G4  reverted (byte for byte the canonical 7097ac2 context) + the local 7097ac2 rebuild: REFUSED (only a693c543...)
#   G5  reverted + f3bd00ea... as mchezo-7097ac2.tgz: REFUSED (archive SHA-256)
#   L1  LOCAL SURROGATE: a pair made with the TEST pin f3bd00ea... (same revision and inventory). Its forward context
#       differs from the proposal's only in pins/archive.sha256 and the gate's archive comment; f3bd00ea... passes the
#       gate (ARTIFACT_GATE_OK) and `installed` (INSTALLED_OK). Protocol evidence only: it is NOT the proposed pin.
#   bash gate-archives.sh <src checkout> <work dir (new)> <f3bd00ea... archive> <local 7097ac2 rebuild> <node v22.16.0 bin dir>
# Exit 0 "W7 PINS GATE CHECK PASSED (...)"; otherwise "W7 PINS GATE CHECK FAILED", 1.
set -uo pipefail
SRC=$(cd "${1:?src checkout}" && pwd); W=${2:?work dir}; DEV=${3:?f3bd archive}; OLD=${4:?7097ac2 rebuild}; NODEBIN=${5:?node bin dir}
[ ! -e "$W" ] || { echo "$W exists" >&2; exit 2; }
mkdir -p "$W"; W=$(cd "$W" && pwd)
H="$SRC/scripts/beta/w7-pins-pair.sh"; PD="$SRC/docs/beta/pins-72e9d8b"
BASE=71d02009a1b7ed537824b20a0c23d62b157046db
REV=72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d
ARC=aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6
INV=4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef
DEV_ARC=f3bd00ea2f2c17e1f84e0b413822f5cd181247774f9872923860c1120f4d72ca
INVREL=docs/evidence/beta-r4-w7/release-72e9d8b/package/cgn-72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d.inventory.sha256
FWD=forward-7097ac2-to-72e9d8b.patch; RVT=revert-72e9d8b-to-7097ac2.patch
export TMPDIR="$W/tmp"; mkdir -p "$TMPDIR"
npass=0; nfail=0
chk() { if [ "$2" = 0 ]; then echo "PASS $1"; npass=$((npass + 1)); else echo "FAIL $1${3:+ — $3}"; nfail=$((nfail + 1)); fi; }
echo "== gate-archives $(date -u +%FT%TZ): node $("$NODEBIN/node" -v), sh -> $(readlink -f /bin/sh), helper $(sha256sum "$H" | cut -c1-16), patch folder SHA256SUMS $(sha256sum "$PD/SHA256SUMS" | cut -c1-16)"
echo "   developer archive $(sha256sum "$DEV" | cut -d' ' -f1)"
echo "   local 7097ac2 rebuild $(sha256sum "$OLD" | cut -d' ' -f1) (one of the three R2 rebuilds, NOT the audited a693c543...)"
[ "$(sha256sum "$DEV" | cut -d' ' -f1)" = "$DEV_ARC" ] || { echo "the developer archive is not f3bd00ea..."; exit 1; }

echo "-- the contexts, on an isolated clean copy of the base $BASE"
git clone -q --no-local --no-checkout "$SRC" "$W/base" && git -C "$W/base" -c advice.detachedHead=false checkout -q --detach "$BASE"
chk "the copy is clean at the base" "$([ "$(git -C "$W/base" rev-parse HEAD)" = "$BASE" ] && [ -z "$(git -C "$W/base" status --porcelain --untracked-files=all)" ] && echo 0 || echo 1)"
bash "$H" verify "$W/base/deploy/render" "$PD" "$REV" "$ARC" "$INV" --forward-context "$W/ctx-forward" > "$W/verify.log" 2>&1; v=$?
cat "$W/verify.log"
chk "the proposed pair verifies, and its forward context is written" "$([ "$v" = 0 ] && [ -f "$W/ctx-forward/cgn-artifact-gate.sh" ] && echo 0 || echo 1)" "exit $v"
mkdir "$W/ctx-reverted" && (cd "$W/base/deploy/render" && tar -cf - .dockerignore Dockerfile cgn-artifact-gate.sh cgn-authorize.sh cgn-backup.sh cgn-entrypoint.sh pins render.yaml) | tar -xf - -C "$W/ctx-reverted"
(cd "$W/ctx-reverted" && git apply "$PD/$FWD" && git apply "$PD/$RVT"); r=$?
d=0; for f in .dockerignore Dockerfile cgn-artifact-gate.sh cgn-authorize.sh cgn-backup.sh cgn-entrypoint.sh pins/age.sha256 pins/archive.sha256 pins/release-7097ac2.inventory.sha256 pins/scripts.sha256 render.yaml; do cmp -s "$W/base/deploy/render/$f" "$W/ctx-reverted/$f" || d=1; done
[ "$(cd "$W/ctx-reverted" && find . -type f | wc -l | tr -d ' ')" = 11 ] || d=1
chk "the reverted context (forward, then revert, by plain git apply outside a repository) is byte for byte the canonical one" "$([ "$r" = 0 ] && [ "$d" = 0 ] && echo 0 || echo 1)"
echo "   forward gate $(sha256sum "$W/ctx-forward/cgn-artifact-gate.sh" | cut -c1-16)..., reverted gate $(sha256sum "$W/ctx-reverted/cgn-artifact-gate.sh" | cut -c1-16)... (canonical $(sha256sum "$W/base/deploy/render/cgn-artifact-gate.sh" | cut -c1-16)...)"

inputs() { # <name> <context> <archive file> <archive name in artifact/>: the gate stage's /gate, filtered by .dockerignore
  local in="$W/in-$1" x; mkdir -p "$in/pins" "$in/artifact"
  while read -r x; do
    case "$x" in
      '!Dockerfile') ;;
      '!artifact/'*) [ "${x#!}" != "artifact/$4" ] || cp "$3" "$in/artifact/$4" ;;
      '!'*) cp "$2/${x#!}" "$in/${x#!}" ;;
    esac
  done < <(grep '^!' "$2/.dockerignore")
  echo "$in"
}
gate() { # <name> <inputs>: the gate stage's RUN, logged; exit status out
  mkdir -p "$TMPDIR/$1"
  ( export PATH="$NODEBIN:$PATH" TMPDIR="$TMPDIR/$1" npm_config_cache="$W/npm-cache" npm_config_update_notifier=false
    sh "$2/cgn-artifact-gate.sh" gate "$2" "$W/out-$1" ) > "$W/$1.log" 2>&1
}
refused() { # <name> <inputs> <expected message part> <label>
  gate "$1" "$2"; local g=$?
  local m; m=$(grep -o 'ARTIFACT_GATE_FAILED: .*' "$W/$1.log" | head -1 | cut -c1-220)
  echo "   [$1] gate exit $g; ${m:-no ARTIFACT_GATE_FAILED line}"
  chk "$4" "$([ "$g" != 0 ] && printf '%s' "$m" | grep -qF -- "$3" && [ ! -e "$W/out-$1" ] && [ -z "$(ls -A "$TMPDIR/$1")" ] && echo 0 || echo 1)" "exit $g"
}

echo "-- G1-G3: the proposed forward context"
refused G1 "$(inputs G1 "$W/ctx-forward" "$DEV" mchezo-72e9d8b.tgz)" "the archive is not the audited one" \
  "G1 the developer archive f3bd00ea... under the proposed aac13a8a... pin is REFUSED (archive SHA-256), no output"
refused G2 "$(inputs G2 "$W/ctx-forward" "$DEV" mchezo-7097ac2.tgz)" "artifact/ must hold exactly mchezo-72e9d8b.tgz" \
  "G2 an archive under the old name is not admitted, and the gate refuses an artifact/ without mchezo-72e9d8b.tgz"
in3=$(inputs G3 "$W/ctx-forward" "$OLD" mchezo-72e9d8b.tgz); (cd "$in3/artifact" && sha256sum mchezo-72e9d8b.tgz) > "$in3/pins/archive.sha256"
refused G3 "$in3" "the inventory differs from the pinned one" \
  "G3 a 7097ac2 rebuild with the archive pin re-pointed to it is REFUSED by the inventory (not the 72e9d8b files)"

echo "-- G4-G5: the reverted (canonical) context"
refused G4 "$(inputs G4 "$W/ctx-reverted" "$OLD" mchezo-7097ac2.tgz)" "the archive is not the audited one" \
  "G4 the reverted context refuses a local 7097ac2 rebuild: only the audited a693c543... passes"
refused G5 "$(inputs G5 "$W/ctx-reverted" "$DEV" mchezo-7097ac2.tgz)" "the archive is not the audited one" \
  "G5 the reverted context refuses the 72e9d8b developer archive"

echo "-- L1: LOCAL SURROGATE (the TEST pin f3bd00ea..., never the proposal)"
bash "$H" make "$W/base/deploy/render" "$REV" "$DEV_ARC" "$W/base/$INVREL" "$INV" "$W/pair-surrogate" > "$W/L1-make.log" 2>&1 && \
  bash "$H" verify "$W/base/deploy/render" "$W/pair-surrogate" "$REV" "$DEV_ARC" "$INV" --forward-context "$W/ctx-surrogate" > "$W/L1-verify.log" 2>&1; s=$?
grep -h '^PINS_PAIR' "$W/L1-make.log" "$W/L1-verify.log" | sed 's/^/   /'
diff -r "$W/ctx-forward" "$W/ctx-surrogate" > "$W/L1-context.diff"; sed 's/^/   | /' "$W/L1-context.diff"
chk "L1 the surrogate pair is made and verified, and its context differs from the proposal's only in the archive pin and the gate's archive comment" \
  "$([ "$s" = 0 ] && [ "$(grep -c '^diff -r' "$W/L1-context.diff")" = 2 ] && grep -q '^diff -r .*/cgn-artifact-gate.sh ' "$W/L1-context.diff" && grep -q '^diff -r .*/pins/archive.sha256 ' "$W/L1-context.diff" \
     && [ "$(grep -c '^[<>]' "$W/L1-context.diff")" = 4 ] && echo 0 || echo 1)" "exit $s"
inl=$(inputs L1 "$W/ctx-surrogate" "$DEV" mchezo-72e9d8b.tgz)
gate L1 "$inl"; g=$?
grep -E '^artifact-gate:|ARTIFACT_GATE_(OK|FAILED)' "$W/L1.log" | sed 's/^/   /'
chk "L1 LOCAL SURROGATE: f3bd00ea... passes the gate under its own test pin: ARTIFACT_GATE_OK for 72e9d8b, inventory 4f58b323..." \
  "$([ "$g" = 0 ] && grep -q "^ARTIFACT_GATE_OK archive=$DEV_ARC revision=$REV inventory=$INV deps=\"ws@8.22.1 zod@3.25.76\"" "$W/L1.log" && echo 0 || echo 1)" "exit $g"
( export PATH="$NODEBIN:$PATH" TMPDIR="$TMPDIR/L1"; sh "$inl/cgn-artifact-gate.sh" installed "$W/out-L1" ) > "$W/L1-installed.log" 2>&1; i=$?
grep -E 'INSTALLED_OK|ARTIFACT_GATE_FAILED' "$W/L1-installed.log" | sed 's/^/   /'
chk "L1 LOCAL SURROGATE: \`installed\` on the result: INSTALLED_OK for 72e9d8b" "$([ "$i" = 0 ] && grep -q "^INSTALLED_OK revision=$REV inventory=$INV " "$W/L1-installed.log" && echo 0 || echo 1)" "exit $i"
chk "L1 the gate's own temporary folders are removed (npm keeps its compile cache, node-compile-cache, under TMPDIR: npm's, not the gate's; removed below)" "$([ -z "$(find "$TMPDIR/L1" -mindepth 1 -maxdepth 1 ! -name node-compile-cache)" ] && echo 0 || echo 1)" "$(ls -A "$TMPDIR/L1" | tr '\n' ' ')"

echo "-- cleanup"
rm -rf "$W/out-L1" "$W/npm-cache" "$W"/in-* "$W/base" "$TMPDIR"/*/node-compile-cache
chk "the installed package, the npm caches, the inputs folders and the copy are removed; the temporary root holds only empty folders" \
  "$([ -z "$(find "$TMPDIR" -mindepth 1 ! -type d | head -1)" ] && [ ! -e "$W/out-L1" ] && [ ! -e "$W/base" ] && echo 0 || echo 1)"
echo "== $npass passed, $nfail failed"
if [ "$nfail" = 0 ]; then echo "W7 PINS GATE CHECK PASSED (developer-run; L1 is a LOCAL SURROGATE under the f3bd00ea... TEST pin; the positive checks of the audited aac13a8a... and a693c543... archives are ChatGPT's)"; exit 0; fi
echo "W7 PINS GATE CHECK FAILED"; exit 1
