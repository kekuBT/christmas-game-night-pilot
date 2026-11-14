#!/usr/bin/env bash
# compare-run.sh <worktree> <prefix>: own server on the worktree's build, then compare-shots.mjs.
SP=$SP
WT=$1; P=$2
cd $WT
DATA=$(mktemp -d $SP/s121/data-XXXX); PORT=$(( 5100 + RANDOM % 800 ))
PORT=$PORT MCHEZO_DATA_DIR=$DATA node --import tsx src/server/serve.ts > $SP/s121/server-cmp-$P.log 2>&1 &
SRV=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:$PORT/ && break; sleep 0.5; done
cd $SP/wt121 && MCHEZO_CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell timeout 300 node $SP/s121/compare-shots.mjs http://localhost:$PORT $SP/s121/compare $P
kill $SRV; wait $SRV 2>/dev/null; rm -rf $DATA
