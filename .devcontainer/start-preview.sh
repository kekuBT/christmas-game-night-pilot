#!/usr/bin/env bash
# Starts the Mchezo test server inside a GitHub Codespace (docs/CODESPACES_PREVIEW.md).
# Runs on every codespace start. Safe to run again by hand: it never starts a second copy.
# The forwarded port stays PRIVATE (Codespaces' default): only your signed-in GitHub
# account can open it. Never make it public without the owner's approval.
set -euo pipefail
cd "$(dirname "$0")/.."
LOG=/tmp/mchezo-preview.log
if curl -s -o /dev/null --max-time 2 http://localhost:3000/; then
  echo "Mchezo is already running."
else
  [ -f apps/web/dist/index.html ] || npm run build:web
  PORT=3000 setsid nohup npm run serve:device-test >"$LOG" 2>&1 < /dev/null &
  for _ in $(seq 1 30); do curl -s -o /dev/null --max-time 2 http://localhost:3000/ && break; sleep 1; done
fi
grep -E "Codespaces preview|TEST MODE" "$LOG" 2>/dev/null || true
echo "Server log: $LOG"
