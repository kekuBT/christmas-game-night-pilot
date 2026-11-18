#!/bin/bash
# Beta R4 W7 (handoff 6941129590): the PREVIOUS release through the SAME artifact gate, and the gate's refusals of a
# wrong artifact. LOCAL only.
#
# There is NO audited predecessor artifact (7097ac2 / a693c543... is the first audited archive of this route), so the
# predecessor here is the LOCAL SURROGATE f93e9cb (docs/evidence/beta-r4-w7/runners/build-predecessor.sh). It tests
# the protocol; it cannot pass the actual predecessor-artifact check, and this script says so in its verdict line.
#
#   A1  the predecessor context (scripts/beta/w7-pred-context.sh: the reviewed deploy/render with only its artifact
#       pins changed) builds through the unchanged gate: ARTIFACT_GATE_OK and INSTALLED_OK name the predecessor's
#       revision, archive and inventory; the image's /app/release.json and guard scripts are checked
#   A2  wrong artifact: the CURRENT release's archive under the predecessor's archive name: the gate refuses (its
#       SHA-256 is not the pinned one)
#   A3  wrong artifact pinned: the predecessor context whose archive pin names the CURRENT release's archive: the gate
#       still refuses (the inventory and release.json are not the predecessor's)
#   A4  the reverse: the canonical deploy/render context given the predecessor's archive: the gate refuses
# The gate-stage builds of A2-A4 stop at the gate (docker buildx --target gate) and must FAIL with ARTIFACT_GATE_FAILED.
#   bash scripts/beta/w7-artifact-check.sh <deploy/render> <predecessor archive> <predecessor inventory>
#        <predecessor revision> <current-release archive (the local rebuild of 7097ac2)> <build.sh> <work dir> <tag>
# Exit 0 with "W7 ARTIFACT CHECK PASSED (LOCAL SURROGATE ...)"; otherwise "W7 ARTIFACT CHECK FAILED", 1.
set -uo pipefail
SRC=$(cd "${1:?deploy/render}" && pwd); PARC=${2:?}; PINV=${3:?}; PREV=${4:?}; CARC=${5:?}; BUILD=${6:?}; W=${7:?}; TAG=${8:?}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
npass=0; nfail=0
chk() { if [ "$2" = 0 ]; then echo "PASS $1"; npass=$((npass + 1)); else echo "FAIL $1${3:+ — $3}"; nfail=$((nfail + 1)); fi; }
rm -rf "$W"; mkdir -p "$W"; W=$(cd "$W" && pwd)
S7=${PREV:0:7}
echo "== w7-artifact-check $(date -u +%FT%TZ): predecessor $PREV (LOCAL SURROGATE), archive $(sha256sum "$PARC" | cut -c1-16)..., current-release archive $(sha256sum "$CARC" | cut -c1-16)..."

echo "-- A1: the predecessor through the same gate"
bash "$ROOT/scripts/beta/w7-pred-context.sh" "$SRC" "$PARC" "$PINV" "$PREV" "$W/ctx-pred" > "$W/ctx-pred.log" 2>&1; c=$?
grep -E '^PRED_CONTEXT' "$W/ctx-pred.log"
chk "A1 the predecessor context: only the artifact pins differ from deploy/render; the guard scripts are the reviewed ones" "$([ "$c" = 0 ] && grep -q "^PRED_CONTEXT_OK revision=$PREV " "$W/ctx-pred.log" && echo 0 || echo 1)"
bash "$BUILD" "$W/ctx-pred" "$TAG" --no-cache-filter gate,runtime > "$W/build-pred.log" 2>&1; b=$?
grep -E 'ARTIFACT_GATE_OK|INSTALLED_OK|ARTIFACT_GATE_FAILED' "$W/build-pred.log" | sed 's/^#[0-9]* [0-9.]* /   /'
chk "A1 the build ran the gate and passed it: ARTIFACT_GATE_OK and INSTALLED_OK for revision $S7 (not cached)" "$([ "$b" = 0 ] && grep -q "ARTIFACT_GATE_OK archive=$(sha256sum "$PARC" | cut -d' ' -f1) revision=$PREV inventory=$(sha256sum "$PINV" | cut -d' ' -f1) " "$W/build-pred.log" && grep -q "INSTALLED_OK revision=$PREV " "$W/build-pred.log" && echo 0 || echo 1)" "build exit $b"
rj=$(timeout 30 docker run --rm --entrypoint cat "$TAG" /app/release.json 2>/dev/null)
chk "A1 the image's /app/release.json names the predecessor revision and Node v22.16.0" "$(printf '%s' "$rj" | grep -q "\"revision\": *\"$PREV\"" && printf '%s' "$rj" | grep -q '"node": *"v22.16.0"' && echo 0 || echo 1)" "$rj"
g=0; for f in cgn-entrypoint cgn-backup cgn-authorize; do
  [ "$(timeout 30 docker run --rm --entrypoint sha256sum "$TAG" "/usr/local/bin/$f" | cut -d' ' -f1)" = "$(sha256sum "$SRC/$f.sh" | cut -d' ' -f1)" ] || g=1
done
chk "A1 the image's guard scripts are byte-identical to the reviewed deploy/render ones" "$g"
echo "   image $TAG: $(docker image inspect -f '{{.Id}}' "$TAG" 2>/dev/null)"

gate_refuses() { # <name> <ctx> <expected message part>
  bash "$BUILD" "$2" "w7-neg-$1:none" --target gate --no-cache-filter gate > "$W/$1.log" 2>&1; local r=$?
  local m; m=$(grep -o 'ARTIFACT_GATE_FAILED: .*' "$W/$1.log" | head -1 | cut -c1-200)
  echo "   [$1] build exit $r; $m"
  docker image rm "w7-neg-$1:none" >/dev/null 2>&1
  [ "$r" != 0 ] && printf '%s' "$m" | grep -qF -- "$3"
}
echo "-- A2: the current release's archive under the predecessor's name"
cp -a "$W/ctx-pred" "$W/ctx-a2"; cp "$CARC" "$W/ctx-a2/artifact/mchezo-$S7.tgz"
gate_refuses a2 "$W/ctx-a2" "the archive is not the audited one"; chk "A2 the gate refuses a wrong archive (SHA-256 differs from the pin)" $?
echo "-- A3: the predecessor context with its archive pin pointed at the current release's archive"
cp -a "$W/ctx-pred" "$W/ctx-a3"; cp "$CARC" "$W/ctx-a3/artifact/mchezo-$S7.tgz"
(cd "$W/ctx-a3/artifact" && sha256sum "mchezo-$S7.tgz") > "$W/ctx-a3/pins/archive.sha256"
gate_refuses a3 "$W/ctx-a3" "the inventory differs from the pinned one"; chk "A3 the gate refuses a wrong archive even when the archive pin was changed to match it (inventory and revision are the predecessor's)" $?
echo "-- A4: the canonical (current) context given the predecessor's archive"
bash "$ROOT/docs/evidence/beta-r4-render-package/harness/assemble.sh.txt" "$SRC" "$PARC" "$W/ctx-a4" > "$W/ctx-a4.log" 2>&1 || true
gate_refuses a4 "$W/ctx-a4" "the archive is not the audited one"; chk "A4 the canonical context refuses the predecessor's archive" $?
echo "== $npass passed, $nfail failed"
if [ "$nfail" = 0 ]; then echo "W7 ARTIFACT CHECK PASSED (LOCAL SURROGATE $S7: the protocol only; the actual predecessor-artifact check is NOT passed: no audited predecessor exists)"; exit 0; fi
echo "W7 ARTIFACT CHECK FAILED"; exit 1
