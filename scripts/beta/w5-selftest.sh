#!/bin/bash
# Beta R4 W5 (handoff 6937786587): the self-test of the local W5 rehearsal (scripts/beta/w5-rehearsal.sh): the rehearsal
# itself, and the isolation rules around it, with SENTINELS of another owner that must survive every case.
#   T0  static: bash -n on the W5 shell scripts, node --check on w5-seed.mjs
#   T1  a port already in use: the rehearsal must FAIL at its preflight and start nothing
#   T2  the rehearsal (the positive chain, its content checks, the checker's own negatives and the eight chain
#       negatives): W5 REHEARSAL PASSED
#   T3  an inventory docker cannot give (a docker shim on PATH answers exit 124, no output, to every listing filtered by
#       this run's label): the run must report UNVERIFIED and FAIL, never read it as 0; real docker then confirms the
#       run's container and volume were removed all the same (they were tracked by id)
#   T4  an interrupted run (SIGTERM as soon as seeding is done, as the backup stage starts; bash runs the trap when the
#       current command returns, possibly after the in-container backup): exit 143, its cleanup runs, nothing is left
# The sentinels (a running container and a volume holding a file, labelled w5.sentinel=<tag>, never w5.owner) are made
# here, checked after every case, and removed at the end by this script only after their label reads back.
#   bash scripts/beta/w5-selftest.sh <image tag> [--work <dir>]
# Exit: 0 "W5 SELFTEST PASSED", 1 "W5 SELFTEST FAILED", 2 bad usage.
set -uo pipefail
IMG=${1:-}; [ -n "$IMG" ] || { echo "usage: bash scripts/beta/w5-selftest.sh <image tag> [--work <dir>]" >&2; exit 2; }
shift; WORK=""
while [ $# -gt 0 ]; do case "$1" in --work) WORK=${2:?}; shift 2 ;; *) echo "unknown option: $1" >&2; exit 2 ;; esac; done
[ -n "$WORK" ] || WORK=$(mktemp -d)
mkdir -p "$WORK"; WORK=$(cd "$WORK" && pwd)
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
H="$ROOT/scripts/beta/w5-rehearsal.sh"
TAG=$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')
REAL_DOCKER=$(command -v docker) || { echo "docker is not installed"; exit 1; }
passn=0; failn=0
chk() { if [ "$2" = 0 ]; then echo "PASS $1"; passn=$((passn + 1)); else echo "FAIL $1${3:+ — $3}"; failn=$((failn + 1)); fi; }
dk() { timeout 30 "$REAL_DOCKER" "$@"; }
owned_left() {   # the run id named in a rehearsal log -> "containers volumes" of that run still present (real docker)
  local id; id=$(sed -n 's/^== w5-rehearsal .*, run \([0-9A-Za-z-]*\), image .*/\1/p' "$1" | head -1)
  [ -n "$id" ] || { echo "no-run-id"; return; }
  echo "$(dk ps -aq --filter "label=w5.owner=$id" | wc -l) $(dk volume ls -q --filter "label=w5.owner=$id" | wc -l)"
}
SC="w5-sentinel-$TAG"; SV="w5-sentinel-$TAG"
sentinels_ok() {
  [ "$(dk inspect -f '{{.State.Running}} {{index .Config.Labels "w5.sentinel"}}' "$SC" 2>/dev/null)" = "true $TAG" ] || return 1
  [ "$(dk run --rm -v "$SV:/s:ro" --entrypoint cat "$IMG" /s/keep 2>/dev/null)" = "sentinel $TAG" ]
}
echo "== w5-selftest $(date -u +%FT%TZ), tag $TAG, harness $(sha256sum "$H" | cut -c1-16), seed $(sha256sum "$ROOT/scripts/beta/w5-seed.mjs" | cut -c1-16), image $IMG"
echo "   before: containers $(dk ps -aq | wc -l), volumes $(dk volume ls -q | wc -l)"

echo "-- T0: static"
s=0; for f in "$ROOT"/scripts/beta/w5-*.sh; do bash -n "$f" || s=1; done
node --check "$ROOT/scripts/beta/w5-seed.mjs" || s=1
chk "T0 bash -n on the W5 shell scripts and node --check on w5-seed.mjs" "$s"

echo "-- sentinels of another owner (label w5.sentinel=$TAG, never w5.owner)"
dk volume create --label "w5.sentinel=$TAG" "$SV" >/dev/null && \
  dk run --rm --user root -v "$SV:/s" --entrypoint sh "$IMG" -c "echo 'sentinel $TAG' > /s/keep && chmod 644 /s/keep" && \
  dk run -d --name "$SC" --label "w5.sentinel=$TAG" --entrypoint sh "$IMG" -c 'sleep 3600' >/dev/null
chk "sentinels created: a running container and a volume holding a file" "$(sentinels_ok && echo 0 || echo 1)"

echo "-- T1: a port already in use"
node -e 'require("net").createServer().listen(18580, "127.0.0.1", () => console.log("held"))' > "$WORK/T1-holder-$TAG.log" 2>&1 &
holder=$!
for _ in $(seq 1 40); do grep -q held "$WORK/T1-holder-$TAG.log" && break; sleep 0.1; done
timeout 300 bash "$H" "$IMG" "$WORK/T1" > "$WORK/T1-$TAG.log" 2>&1; t1=$?
kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null
sed 's/^/     | /' "$WORK/T1-$TAG.log" | grep -E 'FAILED at|W5 REHEARSAL|left:'
chk "T1 the rehearsal FAILED at its preflight, started nothing, and left nothing" "$([ "$t1" = 1 ] && grep -q 'FAILED at preflight: .* listener(s) already on 18580; nothing was started' "$WORK/T1-$TAG.log" && grep -q '^W5 REHEARSAL FAILED' "$WORK/T1-$TAG.log" && [ "$(owned_left "$WORK/T1-$TAG.log")" = "0 0" ] && echo 0 || echo 1)" "exit $t1"
chk "T1 sentinels intact" "$(sentinels_ok && echo 0 || echo 1)"

echo "-- T2: the rehearsal"
timeout 900 bash "$H" "$IMG" "$WORK/T2" > "$WORK/T2-$TAG.log" 2>&1; t2=$?
grep -E '^(PASS|FAIL)|W5 REHEARSAL|left:|holding|checks:' "$WORK/T2-$TAG.log" | sed 's/^/     | /'
chk "T2 W5 REHEARSAL PASSED (exit 0), nothing of the run left" "$([ "$t2" = 0 ] && grep -q '^W5 REHEARSAL PASSED' "$WORK/T2-$TAG.log" && [ "$(owned_left "$WORK/T2-$TAG.log")" = "0 0" ] && echo 0 || echo 1)" "exit $t2"
chk "T2 sentinels intact" "$(sentinels_ok && echo 0 || echo 1)"

echo "-- T3: an inventory docker cannot give (a shim answers exit 124 to every listing filtered by the run's label)"
mkdir -p "$WORK/T3-shim"
cat > "$WORK/T3-shim/docker" <<EOF
#!/bin/bash
case "\$*" in *"label=w5.owner="*) case "\$1" in ps|volume) exit 124 ;; esac ;; esac
exec "$REAL_DOCKER" "\$@"
EOF
chmod +x "$WORK/T3-shim/docker"
PATH="$WORK/T3-shim:$PATH" timeout 900 bash "$H" "$IMG" "$WORK/T3" > "$WORK/T3-$TAG.log" 2>&1; t3=$?
grep -E 'left:|W5 REHEARSAL|cleanup #' "$WORK/T3-$TAG.log" | sed 's/^/     | /'
chk "T3 the run reports the inventory UNVERIFIED and FAILS (exit nonzero), never 0" "$([ "$t3" != 0 ] && grep -q "containers left: UNVERIFIED (docker could not list this run's containers); volumes left: UNVERIFIED (docker could not list this run's volumes)" "$WORK/T3-$TAG.log" && grep -q '^W5 REHEARSAL FAILED' "$WORK/T3-$TAG.log" && echo 0 || echo 1)" "exit $t3"
chk "T3 real docker: the run's container and volume were removed all the same (tracked by id)" "$([ "$(owned_left "$WORK/T3-$TAG.log")" = "0 0" ] && echo 0 || echo 1)" "$(owned_left "$WORK/T3-$TAG.log")"
chk "T3 sentinels intact" "$(sentinels_ok && echo 0 || echo 1)"

echo "-- T4: an interrupted run (SIGTERM as soon as seeding is done, as the backup stage starts)"
timeout 900 bash "$H" "$IMG" "$WORK/T4" > "$WORK/T4-$TAG.log" 2>&1 &
hp=$!
for _ in $(seq 1 600); do grep -q '^-- SOURCE' "$WORK/T4-$TAG.log" 2>/dev/null && break; grep -q '^PASS the synthetic state was seeded' "$WORK/T4-$TAG.log" 2>/dev/null && break; kill -0 "$hp" 2>/dev/null || break; sleep 0.1; done
kill -TERM "$hp" 2>/dev/null; wait "$hp"; t4=$?
grep -E 'interrupted|left:|W5 REHEARSAL' "$WORK/T4-$TAG.log" | sed 's/^/     | /'
chk "T4 interrupted: exit 143, cleanup ran, nothing of the run left, no private files left" "$([ "$t4" = 143 ] && grep -q 'interrupted (SIGTERM)' "$WORK/T4-$TAG.log" && grep -q 'private files left: no' "$WORK/T4-$TAG.log" && [ "$(owned_left "$WORK/T4-$TAG.log")" = "0 0" ] && echo 0 || echo 1)" "exit $t4"
chk "T4 sentinels intact" "$(sentinels_ok && echo 0 || echo 1)"

echo "-- removing this self-test's own sentinels (label read back first)"
rmok=0
[ "$(dk inspect -f '{{index .Config.Labels "w5.sentinel"}}' "$SC" 2>/dev/null)" = "$TAG" ] && dk rm -f "$SC" >/dev/null || rmok=1
[ "$(dk volume inspect -f '{{index .Labels "w5.sentinel"}}' "$SV" 2>/dev/null)" = "$TAG" ] && dk volume rm "$SV" >/dev/null || rmok=1
chk "the sentinels removed (they were this self-test's own)" "$rmok"
echo "   after: containers $(dk ps -aq | wc -l), volumes $(dk volume ls -q | wc -l)"
echo "== $passn passed, $failn failed"
if [ "$failn" = 0 ]; then echo "W5 SELFTEST PASSED"; exit 0; fi
echo "W5 SELFTEST FAILED"; exit 1
