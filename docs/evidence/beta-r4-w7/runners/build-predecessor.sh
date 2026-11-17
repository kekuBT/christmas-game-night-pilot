#!/bin/bash
# W7 (handoff on #49, review 6941129590): build the LOCAL SURROGATE predecessor package. There is no audited predecessor
# artifact (7097ac2 / a693c543... is the first audited archive of this route), so this rebuild of the revision before the
# R5 changes stands in for one ONLY to test the rollback protocol. It is never an audited artifact: it cannot pass the
# actual predecessor-artifact check. Same procedure as the R2 rebuild (docs/evidence/beta-r2-preflight/build.sh.txt):
# a fresh clone, a detached checkout, npm ci, pack.mjs, tar, sha256sum, under Node v22.16.0.
#   bash build-predecessor.sh <node v22.16.0 bin dir> <source repo> <work dir> [revision, default f93e9cb]
set -euo pipefail
NODEBIN=$1; SRC=$2; W=$3; SHA=${4:-f93e9cba8613859be9891706ead1c60157c73de2}
export PATH=$NODEBIN:$PATH
rm -rf "$W"; mkdir -p "$W"; cd "$W"
echo "node $(node -v), npm $(npm -v)"
git clone -q "$SRC" cgn-release
cd cgn-release
git checkout -q --detach "$SHA"
echo "HEAD $(git rev-parse HEAD)"; echo "uncommitted: $(git status --porcelain | wc -l)"
npm ci --no-audit --no-fund 2>&1 | tail -3
node scripts/release/pack.mjs --out "../cgn-$SHA"
cat "../cgn-$SHA/release.json"; echo
tar -czf "../mchezo-pred.tgz" -C "../cgn-$SHA" .
sha256sum "../mchezo-pred.tgz"
(cd "../cgn-$SHA" && LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > ../inventory.sha256
echo "inventory: $(wc -l < ../inventory.sha256) files, SHA-256 $(sha256sum ../inventory.sha256 | cut -d' ' -f1)"
