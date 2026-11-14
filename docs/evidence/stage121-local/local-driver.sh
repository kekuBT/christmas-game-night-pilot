#!/usr/bin/env bash
# local-driver.sh <worktree> <driver> <label>: run one driver against its own fresh server (like the gate does).
set -u
SP=$SP
WT=$1; D=$2; L=$3
cd $WT
DATA=$(mktemp -d $SP/s121/data-XXXX)
PORT=$(( 4100 + RANDOM % 800 ))
PORT=$PORT MCHEZO_DATA_DIR=$DATA MCHEZO_CONTENT_TEST_MODE=approve-provisional node --import tsx src/server/serve.ts > $SP/s121/server-$L.log 2>&1 &
SRV=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:$PORT/ && break; sleep 0.5; done
MCHEZO_SCREENSHOT_DIR=$SP/s121/shots MCHEZO_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell timeout 900 node scripts/$D.mjs http://localhost:$PORT > $SP/s121/$D-$L.log 2>&1
CODE=$?
kill $SRV 2>/dev/null; wait $SRV 2>/dev/null
rm -rf $DATA
echo "$D [$L] exit=$CODE pass=$(grep -ac '^PASS' $SP/s121/$D-$L.log) fail=$(grep -ac '^FAIL' $SP/s121/$D-$L.log)"
grep -aE "^FAIL|FATAL|Error:" $SP/s121/$D-$L.log | head -6 | cut -c1-260
