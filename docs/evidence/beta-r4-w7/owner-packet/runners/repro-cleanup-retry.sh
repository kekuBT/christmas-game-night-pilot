#!/bin/bash
# Review 6955682854: does a cleanup RETRY delete replacement directories that someone else created after the first
# cleanup? Format-agnostic: a real `prepare` (W7OP_LOCAL_TEST=1, outside a Codespace), one cleanup, then every directory
# the cleanup removed is recreated by "another task" with a sentinel, then cleanup again. Pass = every sentinel survives.
#   bash repro-cleanup-retry.sh <tool: w7-owner-preview.sh> <repository with the needed commits> [Node bin dir]
set -uo pipefail
TOOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1"); REPO=$(cd "$2" && pwd); [ -n "${3:-}" ] && export PATH=$3:$PATH
B=$(mktemp -d "${TMPDIR:-/tmp}/w7op-repro.XXXXXX"); trap 'rm -rf "$B"' EXIT; W=$B/w; mkdir -p "$W"
git clone -q --no-hardlinks "$REPO" "$W/src" && git -C "$W/src" checkout -q --detach "$(git -C "$REPO" rev-parse HEAD)"
T() { env -u CODESPACES -u CODESPACE_NAME -u GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN W7OP_LOCAL_TEST=1 bash "$TOOL" "$@"; }
echo "# repro: tool $TOOL (sha256 $(sha256sum "$TOOL" | cut -c1-16)), $(date -u +%FT%TZ)"
T prepare "$W" > "$B/prepare.out" 2>&1; echo "prepare: exit $?"
list() { (cd "$W" && find . -mindepth 1 -maxdepth 2 -type d ! -path './src' ! -path './src/*' ! -path './evidence' ! -path './evidence/*' | sort); }
before=$(list); echo "directories the run created (depth <= 2): $(echo "$before" | wc -l)"
T cleanup "$W" > "$B/c1.out" 2>&1; echo "first cleanup: exit $? ($(tail -1 "$B/c1.out" | cut -c1-110))"
n=0; while IFS= read -r d; do [ -z "$d" ] && continue; [ -e "$W/$d" ] && continue; mkdir -p "$W/$d" && echo "foreign $d" > "$W/$d/replacement-sentinel" && n=$((n + 1)); done <<< "$before"
echo "replacement directories created by another task, each with a sentinel: $n"
T cleanup "$W" > "$B/c2.out" 2>&1; rc=$?; echo "second cleanup (retry): exit $rc ($(tail -1 "$B/c2.out" | cut -c1-110))"
alive=$(find "$W" -name replacement-sentinel | wc -l)
echo "replacement sentinels surviving: $alive of $n"
if [ "$n" -gt 0 ] && [ "$alive" = "$n" ]; then echo "REPRO PASSED: the retry touched no replacement"; exit 0; else echo "REPRO FAILED: the retry deleted $((n - alive)) replacement(s)"; exit 1; fi
