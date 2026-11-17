#!/bin/bash
# W7 owner-run browser test (handoff 6954764073; safeguards per review 6955337359): the OPERATOR's tool for the existing,
# authorized Codespace. The packet that uses it is docs/beta/w7-owner-test-packet.md. The owner only uses a browser.
#
#   bash w7-owner-preview.sh inspect                     read-only: node, Codespace, ports 3157/3158, servers, disk
#   bash w7-owner-preview.sh prepare <work>              build both releases into <work> (it must hold only src/)
#   bash w7-owner-preview.sh probe <work>                the route-A probe on 3157/3158 (foreground; Ctrl-C to stop)
#   bash w7-owner-preview.sh start <work> current|previous
#   bash w7-owner-preview.sh stop <work>
#   bash w7-owner-preview.sh backup <work> <label>       server stopped: datatool backup + verify (both releases)
#   bash w7-owner-preview.sh compat <work> <label>       the PREVIOUS release reads that backup: verify, restore, check
#   bash w7-owner-preview.sh check <work> current|previous   that release's datatool check on the live folder (stopped)
#   bash w7-owner-preview.sh status <work>
#   bash w7-owner-preview.sh cleanup <work>              stop; remove ONLY the recorded, owned resources
#
# Phases (fixed here, never chosen on the command line):
#   current   988c53558bbbcc1545fe0ca32882f30c1970794b  the runtime review candidate; a local, UNAUDITED pack
#   previous  7097ac2bb062925bb296a129f4771f1e68fd522d  the audited rollback target's revision, rebuilt locally; its
#             files must match the audited inventory fe6d74f8... (docs/beta/release-7097ac2.md)
# Together they are a LOCAL SURROGATE release pair: the current side is unaudited, so this cannot clear B-W7-01.
#
# Ownership (review 6955337359 P1): `prepare` first writes <work>/.w7op-owner (mode 600: a marker, the canonical root, a
# token) and then registers every resource in it BEFORE creating it, so even an interrupted prepare can be cleaned up.
# Every command but inspect and prepare requires that record, written by this user, for this exact root. `cleanup`
# removes only recorded entries whose names are on a fixed list (secret, data, backups, probe, run, compat-<label>,
# co-<sha>, rel-<sha>), never a symlink, never src/, evidence/ or the record; anything else is REFUSED and reported, the
# rest still removed (so the code is never stranded), and the exit is non-zero.
# The local-test flag (W7OP_LOCAL_TEST=1, a developer's test outside a Codespace, with http://127.0.0.1 allowed) is
# refused before anything else whenever any Codespaces variable is set (P2). In a Codespace the app starts only with the
# exact https origin of a passing probe report (REWRITTEN_SAME_ORIGIN_ONLY or PRESERVED). It listens on 127.0.0.1 only,
# never changes a port's visibility, never touches another checkout, process or folder, and never prints the code.
set -uo pipefail
APP_PORT=3157; OTHER_PORT=3158
CUR=988c53558bbbcc1545fe0ca32882f30c1970794b
PREV=7097ac2bb062925bb296a129f4771f1e68fd522d
CUR_INV=4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef
PREV_INV=fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c
MARK="w7op-owner 2"; REC=.w7op-owner
OWNABLE='^(secret|data|backups|probe|run|compat-[a-z0-9-]+|co-[0-9a-f]{40}|rel-[0-9a-f]{40})$'
die() { echo "w7op: STOP: $*" >&2; exit 1; }
say() { echo "w7op: $*"; }
if [ -n "${W7OP_LOCAL_TEST:-}" ] && { [ -n "${CODESPACES:-}" ] || [ -n "${CODESPACE_NAME:-}" ] || [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; }; then
  die "W7OP_LOCAL_TEST is not allowed in a Codespace (a Codespaces variable is set). Unset it: in a Codespace the probe gate always applies."
fi
local_test() { [ "${W7OP_LOCAL_TEST:-}" = 1 ]; }
in_codespace() { [ "${CODESPACES:-}" = true ] && [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; }
where() { if in_codespace; then echo "Codespace"; elif local_test; then echo "LOCAL TEST (not a Codespace)"; else die "not in a Codespace (W7OP_LOCAL_TEST=1 is only for a developer's local test outside one)"; fi; }
listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
rev_of() { case $1 in current) echo "$CUR";; previous) echo "$PREV";; *) die "phase must be current or previous";; esac; }
root_of() { [ -n "${1:-}" ] || die "give the work folder"; W=$(cd "$1" 2>/dev/null && pwd -P) || die "no folder $1"; [ -d "$W/src/.git" ] || [ -f "$W/src/.git" ] || die "$W/src is not a checkout"; }
owned() { # the record must exist, be ours, and name this exact root
  root_of "${1:-}"; local f="$W/$REC"
  [ -e "$f" ] || [ -L "$f" ] || die "$W was not prepared by this tool (no $REC): refusing to touch it"
  [ -L "$f" ] && die "$f is a symlink: refusing"
  [ -f "$f" ] || die "$f is not a regular file: refusing"
  [ "$(stat -c %u "$f")" = "$(id -u)" ] || die "$f belongs to another user: refusing"
  [ "$(stat -c %a "$f")" = 600 ] || die "$f is not mode 600: refusing"
  [ "$(sed -n 1p "$f")" = "$MARK" ] || die "$f is not this tool's record: refusing"
  [ "$(sed -n 2p "$f")" = "root $W" ] || die "$f names another root ($(sed -n 2p "$f" | cut -c6-)), not $W: refusing"
  sed -n 3p "$f" | grep -Eq '^token [0-9a-f]{32}$' || die "$f has no valid token: refusing"
}
register() { # register <name>: recorded BEFORE it is created
  [[ $1 =~ $OWNABLE ]] || die "internal: $1 is not an ownable name"
  grep -qxF "own $1" "$W/$REC" || echo "own $1" >> "$W/$REC"
}
safe() { [[ $1 =~ $OWNABLE ]] && [ ! -L "$W/$1" ]; }
node_of() { echo "$W/rel-$(rev_of "$1")"; }
pid_alive() { [ -f "$W/run/server.pid" ] && kill -0 "$(cat "$W/run/server.pid")" 2>/dev/null; }
owned_pid() { local p; p=$(cat "$W/run/server.pid"); tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q -- "$W/rel-" ; }
health() { curl -s --max-time 2 "http://127.0.0.1:$APP_PORT/health"; }

cmd=${1:-}; shift || true
case $cmd in
inspect)
  say "where: $(in_codespace && echo Codespace || echo 'not a Codespace')"; say "node: $(node -v 2>/dev/null || echo none) (the audited builds used v22.16.0)"
  for p in $APP_PORT $OTHER_PORT; do if listening "$p"; then say "port $p: IN USE (stop that owner's process yourself only if it is yours; otherwise pick another time)"; else say "port $p: free"; fi; done
  say "node servers running (pid, command), read-only:"; pgrep -af 'dist/server/serve.js|probe-forwarded-origin' || echo "  none"
  say "disk: $(df -h --output=avail "${HOME:-/}" 2>/dev/null | tail -1 | tr -d ' ') free"
  if in_codespace; then say "the forwarded address of $APP_PORT will be https://$CODESPACE_NAME-$APP_PORT.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN (give it to the owner only after start shows the expected revision)"; fi
  say "inspect changes nothing." ;;
prepare)
  where >/dev/null; root_of "${1:-}"
  extra=$(ls -A "$W" | grep -vx src || true); [ -z "$extra" ] || die "$W must hold only src/ (found: $(echo $extra)); use a new folder, never another test's"
  [ -z "$(git -C "$W/src" status --porcelain)" ] || die "$W/src has uncommitted changes"
  for s in $CUR $PREV; do git -C "$W/src" cat-file -e "$s^{commit}" 2>/dev/null || die "commit $s is not in $W/src (clone the branch claude/beta-r4-w7-rollback)"; done
  t=$(mktemp "$W/$REC.XXXXXX") && chmod 600 "$t" && { echo "$MARK"; echo "root $W"; echo "token $(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"; echo "created $(date -u +%FT%TZ)"; } > "$t" && mv -T "$t" "$W/$REC" || die "could not write the ownership record"
  owned "$W"
  register secret; mkdir -m 700 "$W/secret" && (umask 077 && head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20 > "$W/secret/code")
  [ "$(wc -c < "$W/secret/code")" -ge 16 ] || die "could not make a synthetic code"
  register run; mkdir "$W/run"; mkdir "$W/evidence"
  { echo "# W7 owner test: release identities ($(where)), $(date -u +%FT%TZ)"; echo "node $(node -v), npm $(npm -v)"; echo "packet checkout $(git -C "$W/src" rev-parse HEAD)"; } > "$W/evidence/identity.txt"
  for phase in previous current; do
    s=$(rev_of $phase); exp=$([ $phase = current ] && echo "$CUR_INV" || echo "$PREV_INV")
    say "building $phase ($s); this takes a few minutes"
    register "co-$s"; git -C "$W/src" worktree add -q --detach "$W/co-$s" "$s" || die "worktree for $s"
    register "rel-$s"
    (cd "$W/co-$s" && npm ci --no-audit --no-fund > "$W/evidence/build-$phase.log" 2>&1 && node scripts/release/pack.mjs --out "$W/rel-$s" >> "$W/evidence/build-$phase.log" 2>&1) || die "the build of $phase failed (see $W/evidence/build-$phase.log)"
    (cd "$W/rel-$s" && LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > "$W/evidence/inventory-$phase.sha256"
    inv=$(sha256sum "$W/evidence/inventory-$phase.sha256" | cut -d' ' -f1); n=$(wc -l < "$W/evidence/inventory-$phase.sha256")
    rj=$(cat "$W/rel-$s/release.json")
    echo "$phase: revision $s; release.json $rj; inventory $n files, SHA-256 $inv (expected $exp)" >> "$W/evidence/identity.txt"
    grep -q "\"$s\"" <<< "$rj" || die "$phase: release.json doesn't name $s"
    [ "$inv" = "$exp" ] || die "$phase: the inventory $inv is not the expected $exp. Don't serve it; report it with $W/evidence/identity.txt"
    (cd "$W/rel-$s" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >> "$W/evidence/build-$phase.log" 2>&1) || die "the runtime install of $phase failed"
    say "$phase: inventory matches ($n files, $inv)"
  done
  register data; mkdir -m 700 "$W/data"
  say "prepared. Identities: $W/evidence/identity.txt. The code is in $W/secret/code (mode 600): give it to the owner privately, never on GitHub." ;;
probe)
  where >/dev/null; owned "${1:-}"; pid_alive && die "the app is running; stop it first"
  for p in $APP_PORT $OTHER_PORT; do listening "$p" && die "port $p is in use"; done
  safe probe || die "$W/probe is a symlink: refusing"
  register probe; mkdir -p "$W/probe"; cp "$W/src/scripts/preview/probe-forwarded-origin.mjs" "$W/probe/probe.mjs"; ln -sfn "$(node_of current)/node_modules" "$W/probe/node_modules"
  rm -f "$W/evidence/probe-report.json"
  say "probe on $APP_PORT (target) and $OTHER_PORT (other). In the Ports panel both must show Private. Owner: open the OTHER page, press its control button once, then open the TARGET page. Ctrl-C when the target shows its verdict."
  if local_test; then (cd "$W/probe" && exec node probe.mjs --target-port $APP_PORT --other-port $OTHER_PORT --target-url "http://127.0.0.1:$APP_PORT" --other-url "http://127.0.0.1:$OTHER_PORT" --out "$W/evidence/probe-report.json")
  else (cd "$W/probe" && exec node probe.mjs --target-port $APP_PORT --other-port $OTHER_PORT --out "$W/evidence/probe-report.json"); fi ;;
start)
  where >/dev/null; owned "${1:-}"; phase=${2:-}; s=$(rev_of "$phase"); R=$(node_of "$phase")
  pid_alive && die "a server from this folder is already running (stop it first: one writer)"
  if [ -f "$W/evidence/probe-report.json" ]; then
    v=$(node -e 'const r=require(process.argv[1]);process.stdout.write(String(r.verdict))' "$W/evidence/probe-report.json" 2>/dev/null)
    o=$(node -e 'const r=require(process.argv[1]);process.stdout.write(String(r.ownOrigin??""))' "$W/evidence/probe-report.json" 2>/dev/null)
  else v=none; o=; fi
  if local_test && [ "$v" = none ]; then o="http://127.0.0.1:$APP_PORT"; say "LOCAL TEST: origin $o (no probe; refused in a Codespace)"
  else
    case $v in REWRITTEN_SAME_ORIGIN_ONLY|PRESERVED) ;; *) die "the probe report's verdict is $v: route A can't be used (no HTTP allowance, no workaround). Report it.";; esac
    case $o in https://*) ;; *) die "the probe's own origin '$o' isn't https";; esac
  fi
  [ -f "$R/dist/server/serve.js" ] || die "$phase isn't prepared"
  safe data && safe run && [ -d "$W/data" ] || die "the data or run folder isn't this tool's"
  listening $APP_PORT && die "port $APP_PORT is in use by something else"
  ts=$(date -u +%Y%m%dT%H%M%SZ); log="$W/run/server-$phase-$ts.log"
  ( cd "$R" && export NODE_ENV=production PORT=$APP_PORT MCHEZO_LISTEN_HOST=127.0.0.1 MCHEZO_PUBLIC_ORIGIN="$o" \
      MCHEZO_DATA_DIR="$W/data" MCHEZO_BETA_ACCESS_CODE="$(cat "$W/secret/code")" && \
      exec nohup node "$R/dist/server/serve.js" > "$log" 2>&1 < /dev/null ) &
  echo $! > "$W/run/server.pid"
  got=; for _ in $(seq 1 40); do got=$(health | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).revision)}catch{}})'); [ -n "$got" ] && break; sleep 0.5; done
  if [ "$got" != "$s" ]; then kill "$(cat "$W/run/server.pid")" 2>/dev/null; die "local /health says '${got:-nothing}', expected $s; stopped it (log: $log)"; fi
  { echo "== start $phase at $(date -u +%FT%TZ): /health revision $got; origin $o; data $W/data; pid $(cat "$W/run/server.pid")"; grep -E '^\[restore\]|Listening on' "$log"; } | tee -a "$W/evidence/phases.log"
  owned_pid || die "the recorded pid isn't the server just started"
  echo "$phase" > "$W/run/phase"
  if in_codespace; then say "READY for the owner: https://$CODESPACE_NAME-$APP_PORT.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN/ (port $APP_PORT must show Private)"; else say "READY (local test): http://127.0.0.1:$APP_PORT/"; fi ;;
stop)
  owned "${1:-}"; pid_alive || { say "no server from this folder is running"; exit 0; }
  owned_pid || die "pid $(cat "$W/run/server.pid") isn't this folder's server; not touching it"
  p=$(cat "$W/run/server.pid"); kill -TERM "$p"; for _ in $(seq 1 40); do kill -0 "$p" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$p" 2>/dev/null && die "pid $p didn't stop after SIGTERM in 20 s"
  listening $APP_PORT && die "port $APP_PORT is still in use after the stop"
  echo "== stop $(cat "$W/run/phase" 2>/dev/null) at $(date -u +%FT%TZ): pid $p exited; port $APP_PORT free" | tee -a "$W/evidence/phases.log"; rm -f "$W/run/server.pid" "$W/run/phase" ;;
backup)
  owned "${1:-}"; label=${2:-}; [[ $label =~ ^[a-z0-9-]+$ ]] || die "give a label (a-z, 0-9, -)"
  pid_alive && die "stop the server first: the backup is taken with the writer stopped"
  safe backups || die "$W/backups is a symlink: refusing"
  b="$W/backups/$label"; [ -e "$b" ] && die "backup $label exists"; register backups; mkdir -p "$W/backups"
  { echo "== backup $label at $(date -u +%FT%TZ)"
    node "$(node_of current)/dist/server/datatool.js" backup --data "$W/data" --out "$b" || exit 1
    node "$(node_of current)/dist/server/datatool.js" verify --backup "$b" || exit 1
    node "$(node_of previous)/dist/server/datatool.js" verify --backup "$b" || exit 1
    echo "receipt (local surrogate: no off-host transfer): manifest SHA-256 $(sha256sum "$b/manifest.json" | cut -d' ' -f1)"
  } 2>&1 | tee -a "$W/evidence/phases.log"; [ "${PIPESTATUS[0]}" = 0 ] || die "backup $label failed" ;;
compat)
  owned "${1:-}"; label=${2:-}; [[ $label =~ ^[a-z0-9-]+$ ]] || die "give a label (a-z, 0-9, -)"
  b="$W/backups/$label"; [ -d "$b" ] || die "no backup $label"
  c="compat-$label"; [ -e "$W/$c" ] || [ -L "$W/$c" ] && die "$W/$c exists"; register "$c"
  { echo "== compat $label at $(date -u +%FT%TZ): the PREVIOUS release ($PREV) reads the backup"
    node "$(node_of previous)/dist/server/datatool.js" verify --backup "$b" || exit 1
    node "$(node_of previous)/dist/server/datatool.js" restore --backup "$b" --into "$W/$c" || exit 1
    node "$(node_of previous)/dist/server/datatool.js" check --data "$W/$c" || exit 1
  } 2>&1 | tee -a "$W/evidence/phases.log"; [ "${PIPESTATUS[0]}" = 0 ] || die "compat $label failed: the previous release can't read it. STOP the rollback." ;;
check)
  owned "${1:-}"; phase=${2:-}; rev_of "$phase" >/dev/null; pid_alive && die "stop the server first"
  { echo "== check by $phase at $(date -u +%FT%TZ)"; node "$(node_of "$phase")/dist/server/datatool.js" check --data "$W/data"; } 2>&1 | tee -a "$W/evidence/phases.log"; [ "${PIPESTATUS[0]}" = 0 ] || die "check by $phase failed" ;;
status)
  owned "${1:-}"
  if pid_alive; then say "running: $(cat "$W/run/phase") (pid $(cat "$W/run/server.pid")); /health: $(health)"; else say "no server from this folder is running"; fi
  if listening $APP_PORT && ! pid_alive; then say "port $APP_PORT is in use by something else"; fi ;;
cleanup)
  owned "${1:-}"
  if pid_alive; then bash "$0" stop "$W" || die "the server didn't stop; nothing removed"; fi
  mapfile -t entries < <(sed -n 's/^own //p' "$W/$REC")
  ordered=(); for e in "${entries[@]}"; do [ "$e" = secret ] && ordered=(secret "${ordered[@]}") || ordered+=("$e"); done
  refused=0; removed=0
  for e in "${ordered[@]}"; do
    if ! [[ $e =~ $OWNABLE ]]; then echo "w7op: REFUSED: '$e' isn't a name this tool creates (no path, no src/, evidence/ or record)"; refused=$((refused + 1)); continue; fi
    p="$W/$e"
    if [ -L "$p" ]; then echo "w7op: REFUSED: $p is a symlink; not following it"; refused=$((refused + 1)); continue; fi
    if [ ! -e "$p" ]; then echo "w7op: not present: $e"; continue; fi
    if [[ $e == co-* ]]; then git -C "$W/src" worktree remove --force --force "$p" 2>/dev/null || rm -rf --one-file-system -- "$p"; git -C "$W/src" worktree prune
    else rm -rf --one-file-system -- "$p"; fi
    if [ -e "$p" ] || [ -L "$p" ]; then echo "w7op: FAILED to remove $p"; refused=$((refused + 1)); else echo "w7op: removed $e"; removed=$((removed + 1)); fi
  done
  if [ $refused -gt 0 ]; then echo "w7op: CLEANUP INCOMPLETE: removed $removed, refused or failed $refused (above). Nothing else was touched." >&2; exit 1; fi
  say "removed $removed recorded entr$([ $removed = 1 ] && echo y || echo ies); kept $W/evidence, src/ and the record; nothing unrecorded was touched" ;;
*) sed -n 2,15p "$0"; exit 2 ;;
esac
