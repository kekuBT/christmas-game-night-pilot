#!/bin/bash
# W7 owner-run browser test (handoff 6954764073; safeguards per reviews 6955337359 and 6955682854): the OPERATOR's tool
# for the existing, authorized Codespace. The packet that uses it is docs/beta/w7-owner-test-packet.md.
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
#   bash w7-owner-preview.sh cleanup <work>              stop; remove this run's folder; retire the record
# Route B (handoff 6957990858: Firefox ESR in the private noVNC desktop; the app's own HTTPS origin end to end):
#   bash w7-owner-preview.sh routeb <work>               a session CA and the beta.localhost certificate, and the host,
#                                                        guest and TV Firefox profiles trusting only that CA
#   bash w7-owner-preview.sh bstart <work> current|previous   the app on 127.0.0.1:3171 behind the TLS proxy on
#                                                        127.0.0.1:3173, origin https://beta.localhost:3173 (both releases)
#   bash w7-owner-preview.sh firefox <work> host|guest|tv     that profile's Firefox, in the desktop (needs DISPLAY)
#   stop, backup, compat, check, status and cleanup work for both routes.
#
# Phases (fixed here, never chosen on the command line):
#   current   988c53558bbbcc1545fe0ca32882f30c1970794b  the runtime review candidate; a local, UNAUDITED pack
#   previous  7097ac2bb062925bb296a129f4771f1e68fd522d  the audited rollback target's revision, rebuilt locally; its
#             files must match the audited inventory fe6d74f8... (docs/beta/release-7097ac2.md)
# Together they are a LOCAL SURROGATE release pair: the current side is unaudited, so this cannot clear B-W7-01.
#
# Ownership (D-R4W7-02, D-R4W7-03):
# - The record <work>/.w7op-owner (mode 600) holds a marker, the canonical root and a random token. `prepare` writes it
#   first, then creates ONE run folder, <work>/w7op-<token>, with a plain mkdir (it fails if anything is there), puts
#   a token file in it, and records the folder's identity (device:inode:birth time). Everything the run creates lives inside it:
#   secret/, data/, backups/, probe/, run/, compat-<label>/, co-<sha>/, rel-<sha>/. Nothing outside it is ever created
#   or adopted (no `mkdir -p` of a shared name), except evidence/, which is kept.
# - Every command but inspect and prepare checks the record AND the run folder's identity (not a symlink, ours, the
#   token file, the recorded device:inode:birth time). A missing, replaced or foreign run folder is refused; a
#   folder recreated under the same name is caught even when the filesystem reuses the inode number.
# - `cleanup` removes the code first, then everything else in the run folder, the token file last, then the folder,
#   and only then RETIRES the record. A retired record removes nothing (a retry is a no-op), and a retired or
#   mismatched run is never touched again. An interrupted or failed cleanup can be retried: until the token file goes,
#   the token and the identity prove the folder; after it, the recorded identity (with a known birth time) does, and
#   only an rmdir of the then-empty folder is allowed (review 6956209006). With no recorded identity (prepare stopped
#   right after its mkdir), nothing is removed or retired: the message says how to recover by hand.
# The local-test flag (W7OP_LOCAL_TEST=1, a developer's test outside a Codespace, with http://127.0.0.1 allowed) is
# refused before anything else whenever any Codespaces variable is set. In a Codespace the app starts only with the
# exact https origin of a passing probe report (REWRITTEN_SAME_ORIGIN_ONLY or PRESERVED). It listens on 127.0.0.1 only,
# never changes a port's visibility, never touches another checkout, process or folder, and never prints the code.
# Route B never uses the probe or a forwarded app port: the browser runs inside the Codespace (only the noVNC display is
# forwarded), the app's public origin is the browser's real one, and the session CA's key is deleted as soon as it has
# issued the one server certificate, so nothing else can ever be issued under it. Its files live in the run folder
# (tls/, profiles/), so cleanup removes them; cleanup stops only processes whose command line names this run folder.
set -uo pipefail
APP_PORT=3157; OTHER_PORT=3158
B_HOST=beta.localhost; B_APP=3171; B_TLS=3173; B_HTTP=3174; B_ORIGIN="https://$B_HOST:$B_TLS"
CUR=988c53558bbbcc1545fe0ca32882f30c1970794b
PREV=7097ac2bb062925bb296a129f4771f1e68fd522d
CUR_INV=4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef
PREV_INV=fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c
MARK="w7op-owner 3"; REC=.w7op-owner; TOKF=.w7op-ns
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
field() { sed -n "s/^$1 //p" "$W/$REC" | tail -1; }
idof() { stat -c %d:%i:%.9W "$1"; } # device:inode:birth time (ns); a recreated folder can reuse an inode, not its birth time
record_ok() { # the record must exist, be ours, and name this exact root; sets TOKEN and NS
  root_of "${1:-}"; local f="$W/$REC"
  [ -e "$f" ] || [ -L "$f" ] || die "$W was not prepared by this tool (no $REC): refusing to touch it"
  [ -L "$f" ] && die "$f is a symlink: refusing"
  [ -f "$f" ] || die "$f is not a regular file: refusing"
  [ "$(stat -c %u "$f")" = "$(id -u)" ] || die "$f belongs to another user: refusing"
  [ "$(stat -c %a "$f")" = 600 ] || die "$f is not mode 600: refusing"
  [ "$(sed -n 1p "$f")" = "$MARK" ] || die "$f is not this tool's record (marker): refusing"
  [ "$(sed -n 2p "$f")" = "root $W" ] || die "$f names another root ($(sed -n 2p "$f" | cut -c6-)), not $W: refusing"
  TOKEN=$(sed -n 3p "$f" | sed -n 's/^token \([0-9a-f]\{32\}\)$/\1/p'); [ -n "$TOKEN" ] || die "$f has no valid token: refusing"
  [ "$(field ns)" = "w7op-$TOKEN" ] || die "$f names no run folder for its token: refusing"
  NS="$W/w7op-$TOKEN"
}
ns_ok() { # the run folder must be the one this record created
  [ -L "$NS" ] && die "$NS is a symlink: refusing"
  [ -d "$NS" ] || die "the run folder $NS is missing: refusing (prepare a new work folder)"
  [ "$(stat -c %u "$NS")" = "$(id -u)" ] || die "$NS belongs to another user: refusing"
  [ -f "$NS/$TOKF" ] && [ ! -L "$NS/$TOKF" ] && [ "$(cat "$NS/$TOKF")" = "$TOKEN" ] || die "$NS has no matching token file: it isn't this run's folder (replaced?): refusing"
  local id; id=$(field ns-id); [ -n "$id" ] || die "the record has no identity for $NS: refusing"
  [ "$(idof "$NS")" = "$id" ] || die "$NS is not the folder this run created (identity $(idof "$NS"), recorded $id): refusing"
}
owned() { record_ok "${1:-}"; [ -z "$(field retired)" ] || die "this run was cleaned up at $(field retired); prepare a new work folder"; ns_ok; }
node_of() { echo "$NS/rel-$(rev_of "$1")"; }
pid_alive() { [ -f "$NS/run/server.pid" ] && kill -0 "$(cat "$NS/run/server.pid")" 2>/dev/null; }
owned_pid() { local p; p=$(cat "$NS/run/server.pid"); tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q -- "$NS/rel-" ; }
routeb_on() { [ "$(cat "$NS/run/route" 2>/dev/null)" = b ]; }
health() { if routeb_on; then curl -s --max-time 2 --cacert "$NS/tls/ca.pem" --resolve "$B_HOST:$B_TLS:127.0.0.1" "$B_ORIGIN/health"; else curl -s --max-time 2 "http://127.0.0.1:$APP_PORT/health"; fi; }
cmd_has() { tr '\0' ' ' < "/proc/$1/cmdline" 2>/dev/null | grep -qF -- "$2"; }   # does pid $1's command line contain $2
stop_pidfile() { # stop the process in run/<file> only if its command line names <must>; the file goes when it's gone
  local f="$NS/run/$1" p; [ -f "$f" ] || return 0; p=$(cat "$f")
  if kill -0 "$p" 2>/dev/null; then cmd_has "$p" "$2" || die "pid $p (run/$1) isn't this run's process; not touching it"
    kill -TERM "$p"; for _ in $(seq 1 40); do kill -0 "$p" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$p" 2>/dev/null && { kill -KILL "$p"; sleep 0.5; }; kill -0 "$p" 2>/dev/null && die "pid $p (run/$1) didn't stop"; fi
  rm -f "$f"; }
revision_of() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).revision)}catch{}})'; }
mk() { mkdir -m "${2:-755}" "$NS/$1" || die "could not create $NS/$1 (it must not exist yet)"; }

cmd=${1:-}; shift || true
case $cmd in
inspect)
  say "where: $(in_codespace && echo Codespace || echo 'not a Codespace')"; say "node: $(node -v 2>/dev/null || echo none) (the audited builds used v22.16.0)"
  for p in $APP_PORT $OTHER_PORT; do if listening "$p"; then say "port $p: IN USE (stop that owner's process yourself only if it is yours; otherwise pick another time)"; else say "port $p: free"; fi; done
  say "node servers running (pid, command), read-only:"; pgrep -af 'dist/server/serve.js|probe-forwarded-origin' || echo "  none"
  say "disk: $(df -h --output=avail "${HOME:-/}" 2>/dev/null | tail -1 | tr -d ' ') free"
  if in_codespace; then say "the forwarded address of $APP_PORT will be https://$CODESPACE_NAME-$APP_PORT.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN (give it to the owner only after start shows the expected revision)"; fi
  say "route B prerequisites (read-only):"
  for t in openssl certutil; do if command -v "$t" >/dev/null; then say "  $t: $(command -v "$t")"; else say "  $t: MISSING (certutil is in Debian/Ubuntu libnss3-tools)"; fi; done
  ff=$(command -v firefox-esr || command -v firefox || true); say "  Firefox: ${ff:-MISSING} $([ -n "$ff" ] && "$ff" --version 2>/dev/null | head -1)"
  if [ -n "${DISPLAY:-}" ]; then say "  DISPLAY: $DISPLAY"; else say "  DISPLAY: not set in this shell (set it to the display of the noVNC desktop, e.g. :1)"; fi
  say "  desktop/VNC processes: $(pgrep -af 'novnc|websockify|Xvnc|Xtigervnc|x11vnc|fluxbox' | cut -c1-60 | tr '\n' ';' | head -c 300)"
  for p in $B_APP $B_TLS $B_HTTP; do if listening "$p"; then say "  port $p: IN USE"; else say "  port $p: free"; fi; done
  say "inspect changes nothing." ;;
prepare)
  where >/dev/null; root_of "${1:-}"
  extra=$(ls -A "$W" | grep -vx src || true); [ -z "$extra" ] || die "$W must hold only src/ (found: $(echo $extra)); use a new folder, never another test's"
  [ -z "$(git -C "$W/src" status --porcelain)" ] || die "$W/src has uncommitted changes"
  for s in $CUR $PREV; do git -C "$W/src" cat-file -e "$s^{commit}" 2>/dev/null || die "commit $s is not in $W/src (clone the branch claude/beta-r4-w7-rollback)"; done
  TOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'); NS="$W/w7op-$TOKEN"
  t=$(mktemp "$W/$REC.XXXXXX") && chmod 600 "$t" && { echo "$MARK"; echo "root $W"; echo "token $TOKEN"; echo "created $(date -u +%FT%TZ)"; echo "ns w7op-$TOKEN"; } > "$t" && mv -T "$t" "$W/$REC" || die "could not write the ownership record"
  mkdir -m 700 "$NS" || die "could not create the run folder $NS"
  echo "ns-id $(idof "$NS")" >> "$W/$REC" || die "could not record the run folder's identity"   # identity first: it proves the folder
  (umask 077 && echo "$TOKEN" > "$NS/$TOKF") || die "could not mark the run folder"
  owned "$W"
  mk secret 700 && (umask 077 && head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20 > "$NS/secret/code")
  [ "$(wc -c < "$NS/secret/code")" -ge 16 ] || die "could not make a synthetic code"
  mk run; mkdir "$W/evidence"
  { echo "# W7 owner test: release identities ($(where)), $(date -u +%FT%TZ)"; echo "node $(node -v), npm $(npm -v)"; echo "packet checkout $(git -C "$W/src" rev-parse HEAD)"; echo "run folder w7op-$TOKEN"; } > "$W/evidence/identity.txt"
  for phase in previous current; do
    s=$(rev_of $phase); exp=$([ $phase = current ] && echo "$CUR_INV" || echo "$PREV_INV")
    say "building $phase ($s); this takes a few minutes"
    echo "wt co-$s" >> "$W/$REC"; git -C "$W/src" worktree add -q --detach "$NS/co-$s" "$s" || die "worktree for $s"
    (cd "$NS/co-$s" && npm ci --no-audit --no-fund > "$W/evidence/build-$phase.log" 2>&1 && node scripts/release/pack.mjs --out "$NS/rel-$s" >> "$W/evidence/build-$phase.log" 2>&1) || die "the build of $phase failed (see $W/evidence/build-$phase.log)"
    (cd "$NS/rel-$s" && LC_ALL=C find . -type f ! -path ./release.json ! -path './node_modules/*' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) > "$W/evidence/inventory-$phase.sha256"
    inv=$(sha256sum "$W/evidence/inventory-$phase.sha256" | cut -d' ' -f1); n=$(wc -l < "$W/evidence/inventory-$phase.sha256")
    rj=$(cat "$NS/rel-$s/release.json")
    echo "$phase: revision $s; release.json $rj; inventory $n files, SHA-256 $inv (expected $exp)" >> "$W/evidence/identity.txt"
    grep -q "\"$s\"" <<< "$rj" || die "$phase: release.json doesn't name $s"
    [ "$inv" = "$exp" ] || die "$phase: the inventory $inv is not the expected $exp. Don't serve it; report it with $W/evidence/identity.txt"
    (cd "$NS/rel-$s" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >> "$W/evidence/build-$phase.log" 2>&1) || die "the runtime install of $phase failed"
    say "$phase: inventory matches ($n files, $inv)"
  done
  mk data 700
  say "prepared. Run folder: $NS. Identities: $W/evidence/identity.txt. The code is in $NS/secret/code (mode 600): give it to the owner privately, never on GitHub." ;;
probe)
  where >/dev/null; owned "${1:-}"; pid_alive && die "the app is running; stop it first"
  for p in $APP_PORT $OTHER_PORT; do listening "$p" && die "port $p is in use"; done
  rm -rf --one-file-system -- "$NS/probe"; mk probe; cp "$W/src/scripts/preview/probe-forwarded-origin.mjs" "$NS/probe/probe.mjs" || die "no probe script in $W/src"; ln -s "$(node_of current)/node_modules" "$NS/probe/node_modules"
  rm -f "$W/evidence/probe-report.json"
  say "probe on $APP_PORT (target) and $OTHER_PORT (other). In the Ports panel both must show Private. Owner: open the OTHER page, press its control button once, then open the TARGET page. Ctrl-C when the target shows its verdict."
  if local_test; then (cd "$NS/probe" && exec node probe.mjs --target-port $APP_PORT --other-port $OTHER_PORT --target-url "http://127.0.0.1:$APP_PORT" --other-url "http://127.0.0.1:$OTHER_PORT" --out "$W/evidence/probe-report.json")
  else (cd "$NS/probe" && exec node probe.mjs --target-port $APP_PORT --other-port $OTHER_PORT --out "$W/evidence/probe-report.json"); fi ;;
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
  [ -d "$NS/data" ] && [ ! -L "$NS/data" ] && [ -d "$NS/run" ] && [ ! -L "$NS/run" ] || die "the run folder has no data or run folder"
  listening $APP_PORT && die "port $APP_PORT is in use by something else"
  ts=$(date -u +%Y%m%dT%H%M%SZ); log="$NS/run/server-$phase-$ts.log"
  ( cd "$R" && export NODE_ENV=production PORT=$APP_PORT MCHEZO_LISTEN_HOST=127.0.0.1 MCHEZO_PUBLIC_ORIGIN="$o" \
      MCHEZO_DATA_DIR="$NS/data" MCHEZO_BETA_ACCESS_CODE="$(cat "$NS/secret/code")" && \
      exec nohup node "$R/dist/server/serve.js" > "$log" 2>&1 < /dev/null ) &
  echo $! > "$NS/run/server.pid"
  got=; for _ in $(seq 1 40); do got=$(health | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).revision)}catch{}})'); [ -n "$got" ] && break; sleep 0.5; done
  if [ "$got" != "$s" ]; then kill "$(cat "$NS/run/server.pid")" 2>/dev/null; die "local /health says '${got:-nothing}', expected $s; stopped it (log: $log)"; fi
  { echo "== start $phase at $(date -u +%FT%TZ): /health revision $got; origin $o; data $NS/data; pid $(cat "$NS/run/server.pid")"; grep -E '^\[restore\]|Listening on' "$log"; } | tee -a "$W/evidence/phases.log"
  owned_pid || die "the recorded pid isn't the server just started"
  echo "$phase" > "$NS/run/phase"
  if in_codespace; then say "READY for the owner: https://$CODESPACE_NAME-$APP_PORT.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN/ (port $APP_PORT must show Private)"; else say "READY (local test): http://127.0.0.1:$APP_PORT/"; fi ;;
stop)
  owned "${1:-}"; stop_pidfile proxy.pid "$NS/tls/srv.pem"
  pid_alive || { rm -f "$NS/run/server.pid" "$NS/run/phase" "$NS/run/route"; say "no server from this folder is running"; exit 0; }
  owned_pid || die "pid $(cat "$NS/run/server.pid") isn't this folder's server; not touching it"
  port=$APP_PORT; routeb_on && port=$B_APP
  p=$(cat "$NS/run/server.pid"); kill -TERM "$p"; for _ in $(seq 1 40); do kill -0 "$p" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$p" 2>/dev/null && die "pid $p didn't stop after SIGTERM in 20 s"
  listening $port && die "port $port is still in use after the stop"
  echo "== stop $(cat "$NS/run/phase" 2>/dev/null) at $(date -u +%FT%TZ): pid $p exited; port $port free$(routeb_on && echo "; TLS proxy stopped")" | tee -a "$W/evidence/phases.log"; rm -f "$NS/run/server.pid" "$NS/run/phase" "$NS/run/route" ;;
backup)
  owned "${1:-}"; label=${2:-}; [[ $label =~ ^[a-z0-9-]+$ ]] || die "give a label (a-z, 0-9, -)"
  pid_alive && die "stop the server first: the backup is taken with the writer stopped"
  [ -d "$NS/backups" ] || mk backups; [ -L "$NS/backups" ] && die "$NS/backups is a symlink: refusing"
  b="$NS/backups/$label"; [ -e "$b" ] && die "backup $label exists"
  { echo "== backup $label at $(date -u +%FT%TZ)"
    node "$(node_of current)/dist/server/datatool.js" backup --data "$NS/data" --out "$b" || exit 1
    node "$(node_of current)/dist/server/datatool.js" verify --backup "$b" || exit 1
    node "$(node_of previous)/dist/server/datatool.js" verify --backup "$b" || exit 1
    echo "receipt (local surrogate: no off-host transfer): manifest SHA-256 $(sha256sum "$b/manifest.json" | cut -d' ' -f1)"
  } 2>&1 | tee -a "$W/evidence/phases.log"; [ "${PIPESTATUS[0]}" = 0 ] || die "backup $label failed" ;;
compat)
  owned "${1:-}"; label=${2:-}; [[ $label =~ ^[a-z0-9-]+$ ]] || die "give a label (a-z, 0-9, -)"
  b="$NS/backups/$label"; [ -d "$b" ] && [ ! -L "$NS/backups" ] || die "no backup $label"
  c="$NS/compat-$label"; [ -e "$c" ] || [ -L "$c" ] && die "$c exists"
  { echo "== compat $label at $(date -u +%FT%TZ): the PREVIOUS release ($PREV) reads the backup"
    node "$(node_of previous)/dist/server/datatool.js" verify --backup "$b" || exit 1
    node "$(node_of previous)/dist/server/datatool.js" restore --backup "$b" --into "$c" || exit 1
    node "$(node_of previous)/dist/server/datatool.js" check --data "$c" || exit 1
  } 2>&1 | tee -a "$W/evidence/phases.log"; [ "${PIPESTATUS[0]}" = 0 ] || die "compat $label failed: the previous release can't read it. STOP the rollback." ;;
check)
  owned "${1:-}"; phase=${2:-}; rev_of "$phase" >/dev/null; pid_alive && die "stop the server first"
  { echo "== check by $phase at $(date -u +%FT%TZ)"; node "$(node_of "$phase")/dist/server/datatool.js" check --data "$NS/data"; } 2>&1 | tee -a "$W/evidence/phases.log"; [ "${PIPESTATUS[0]}" = 0 ] || die "check by $phase failed" ;;
status)
  owned "${1:-}"
  if pid_alive; then say "running: $(cat "$NS/run/phase")$(routeb_on && echo " (route B, $B_ORIGIN)") (pid $(cat "$NS/run/server.pid")); /health: $(health)"; else say "no server from this folder is running"; fi
  for f in "$NS"/run/firefox-*.pid; do [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null && say "Firefox $(basename "$f" .pid | cut -c9-): pid $(cat "$f")"; done
  if listening $APP_PORT && ! pid_alive; then say "port $APP_PORT is in use by something else"; fi ;;
routeb)
  where >/dev/null; owned "${1:-}"
  miss=; for t in openssl certutil; do command -v "$t" >/dev/null || miss="$miss $t"; done
  [ -z "$miss" ] || die "route B needs:$miss (report it; this tool installs nothing)"
  [ -e "$NS/tls" ] || [ -e "$NS/profiles" ] && die "route B is already set up in this run folder"
  mk tls 700; mk profiles 700; T="$NS/tls"
  { openssl req -x509 -newkey rsa:2048 -nodes -keyout "$T/ca.key" -out "$T/ca.pem" -days 2 -subj "/CN=w7op session CA ${TOKEN:0:8}" \
      -addext basicConstraints=critical,CA:TRUE,pathlen:0 -addext keyUsage=critical,keyCertSign,cRLSign \
    && openssl req -newkey rsa:2048 -nodes -keyout "$T/srv.key" -out "$T/srv.csr" -subj "/CN=$B_HOST" \
    && printf 'subjectAltName=DNS:%s\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\nkeyUsage=critical,digitalSignature,keyEncipherment\n' "$B_HOST" > "$T/srv.ext" \
    && openssl x509 -req -in "$T/srv.csr" -CA "$T/ca.pem" -CAkey "$T/ca.key" -CAcreateserial -out "$T/srv.pem" -days 2 -extfile "$T/srv.ext"; } > "$NS/run/routeb-setup.log" 2>&1 \
    || die "could not make the session CA or the certificate (see $NS/run/routeb-setup.log)"
  rm -f -- "$T/ca.key" "$T/ca.srl" "$T/srv.csr"; [ -e "$T/ca.key" ] && die "could not delete the CA key"
  chmod 600 "$T/srv.key"; openssl verify -CAfile "$T/ca.pem" "$T/srv.pem" >/dev/null || die "the certificate doesn't verify against the session CA"
  for role in host guest tv; do
    P="$NS/profiles/$role"; mkdir -m 700 "$P" || die "could not create $P"
    certutil -d "sql:$P" -N --empty-password && certutil -d "sql:$P" -A -t "C,," -n "w7op session CA" -i "$T/ca.pem" || die "could not trust the CA in the $role profile"
    { echo "user_pref(\"network.dns.localDomains\", \"$B_HOST\");"   # beta.localhost -> loopback, no /etc/hosts change
      echo 'user_pref("browser.shell.checkDefaultBrowser", false);'; echo 'user_pref("datareporting.policy.dataSubmissionEnabled", false);'
      echo 'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);'; echo 'user_pref("browser.aboutwelcome.enabled", false);'
      echo "user_pref(\"browser.startup.homepage\", \"$B_ORIGIN/\");"; } > "$P/user.js"
  done
  fp=$(openssl x509 -in "$T/ca.pem" -noout -fingerprint -sha256 | cut -d= -f2)
  { echo "== route B set up at $(date -u +%FT%TZ): origin $B_ORIGIN; session CA SHA-256 $fp (its key deleted after issuing one certificate)"
    openssl x509 -in "$T/srv.pem" -noout -subject -ext subjectAltName -enddate | tr '\n' ' '; echo
    echo "profiles host, guest, tv: the session CA is their only added trust"; } | tee -a "$W/evidence/phases.log" ;;
bstart)
  where >/dev/null; owned "${1:-}"; phase=${2:-}; s=$(rev_of "$phase"); R=$(node_of "$phase")
  pid_alive && die "a server from this folder is already running (stop it first: one writer)"
  [ -f "$NS/run/proxy.pid" ] && kill -0 "$(cat "$NS/run/proxy.pid")" 2>/dev/null && die "this run's TLS proxy is still running (stop first)"
  [ -f "$NS/tls/srv.pem" ] && [ -f "$NS/tls/srv.key" ] && [ -d "$NS/profiles/host" ] || die "route B isn't set up (run: routeb $W)"
  [ -f "$R/dist/server/serve.js" ] || die "$phase isn't prepared"
  [ -d "$NS/data" ] && [ ! -L "$NS/data" ] && [ -d "$NS/run" ] && [ ! -L "$NS/run" ] || die "the run folder has no data or run folder"
  for p in $B_APP $B_TLS $B_HTTP; do listening "$p" && die "port $p is in use by something else"; done
  ts=$(date -u +%Y%m%dT%H%M%SZ); log="$NS/run/server-$phase-$ts.log"; plog="$NS/run/proxy-$phase-$ts.log"
  echo b > "$NS/run/route"
  ( cd "$R" && export NODE_ENV=production PORT=$B_APP MCHEZO_LISTEN_HOST=127.0.0.1 MCHEZO_PUBLIC_ORIGIN="$B_ORIGIN" \
      MCHEZO_DATA_DIR="$NS/data" MCHEZO_BETA_ACCESS_CODE="$(cat "$NS/secret/code")" && \
      exec nohup node "$R/dist/server/serve.js" > "$log" 2>&1 < /dev/null ) &
  echo $! > "$NS/run/server.pid"
  cert="$NS/tls/srv.pem"; if local_test && [ "${W7OP_TEST_BSTART_FAIL:-}" = proxy ]; then cert="$NS/tls/missing-for-test.pem"; echo "w7op: TEST FAILURE of the proxy (local test only)" >&2; fi
  ( exec nohup node "$W/src/scripts/beta/render-like-proxy.mjs" --https-port $B_TLS --http-port $B_HTTP --backend 127.0.0.1:$B_APP \
      --cert "$cert" --key "$NS/tls/srv.key" > "$plog" 2>&1 < /dev/null ) &
  echo $! > "$NS/run/proxy.pid"
  got=; for _ in $(seq 1 40); do got=$(health | revision_of); [ -n "$got" ] && break; sleep 0.5; done
  if [ "$got" != "$s" ]; then
    stop_pidfile proxy.pid "$NS/tls/"; pid_alive && owned_pid && { kill -TERM "$(cat "$NS/run/server.pid")"; for _ in $(seq 1 40); do pid_alive || break; sleep 0.5; done; }
    pid_alive || rm -f "$NS/run/server.pid" "$NS/run/route"
    echo "== bstart $phase FAILED at $(date -u +%FT%TZ): /health through $B_ORIGIN said '${got:-nothing}', expected $s; this run's app and proxy stopped; logs kept: ${log##*/}, ${plog##*/}" | tee -a "$W/evidence/phases.log"
    die "route B start failed; stopped only this run's app and proxy (logs: $log, $plog)"
  fi
  owned_pid || die "the recorded pid isn't the server just started"
  cmd_has "$(cat "$NS/run/proxy.pid")" "$NS/tls/srv.pem" || die "the recorded proxy pid isn't this run's proxy"
  { echo "== bstart $phase at $(date -u +%FT%TZ): /health through $B_ORIGIN (session CA verified) revision $got; data $NS/data; app pid $(cat "$NS/run/server.pid") on 127.0.0.1:$B_APP; proxy pid $(cat "$NS/run/proxy.pid") on 127.0.0.1:$B_TLS"; grep -E '^\[restore\]|Listening on' "$log"; } | tee -a "$W/evidence/phases.log"
  echo "$phase" > "$NS/run/phase"
  say "READY: in the desktop, the host, guest and TV profiles open $B_ORIGIN/ (firefox $W host|guest|tv). Nothing is forwarded but the desktop." ;;
firefox)
  where >/dev/null; owned "${1:-}"; role=${2:-}; case $role in host|guest|tv) ;; *) die "role must be host, guest or tv";; esac
  P="$NS/profiles/$role"; [ -d "$P" ] && [ ! -L "$P" ] || die "no $role profile (run: routeb $W)"
  ff=$(command -v firefox-esr || command -v firefox || true); [ -n "$ff" ] || die "no firefox-esr or firefox on PATH (report it; this tool installs nothing)"
  [ -n "${DISPLAY:-}" ] || die "DISPLAY isn't set: run this in the noVNC desktop's terminal, or export DISPLAY first"
  f="$NS/run/firefox-$role.pid"; [ -f "$f" ] && kill -0 "$(cat "$f")" 2>/dev/null && die "the $role Firefox is already running (pid $(cat "$f"))"
  ( exec nohup "$ff" --no-remote --new-instance --profile "$P" "$B_ORIGIN/" > "$NS/run/firefox-$role.log" 2>&1 < /dev/null ) &
  echo $! > "$f"; sleep 1; kill -0 "$(cat "$f")" 2>/dev/null || die "Firefox exited at once (see $NS/run/firefox-$role.log)"
  say "Firefox ($role) pid $(cat "$f"), profile $P. Phone size: Ctrl+Shift+M (Responsive Design Mode), 390 x 844, touch on." ;;
cleanup)
  record_ok "${1:-}"
  if [ -n "$(field retired)" ]; then say "this run was already cleaned up at $(field retired); nothing removed, nothing else touched"; exit 0; fi
  if [ ! -e "$NS" ] && [ ! -L "$NS" ]; then
    echo "retired $(date -u +%FT%TZ) (the run folder was absent)" >> "$W/$REC"; say "the run folder $NS doesn't exist; nothing removed; the record is retired"; exit 0
  fi
  if [ -z "$(field ns-id)" ]; then # prepare was interrupted between the mkdir and recording its identity: no proof it is ours
    die "$NS has no recorded identity (prepare was interrupted right after creating it), so nothing proves this tool created it. Nothing removed, the record isn't retired. If it is this run's (empty, or holding only $TOKF), remove it by hand: rmdir or rm -r '$NS'"
  fi
  if [ -d "$NS" ] && [ ! -L "$NS" ] && [ ! -e "$NS/$TOKF" ] && [ ! -L "$NS/$TOKF" ]; then # no token file: an interrupted prepare or a final step
    id=$(field ns-id); bt=${id##*:}
    [ "$(idof "$NS")" = "$id" ] || die "$NS is not the folder this run created (identity $(idof "$NS"), recorded $id): a replacement; nothing removed"
    case $bt in 0|0.000000000|'') die "$NS has no token file, and this filesystem reports no birth time, so its identity can't be proven; nothing removed. If it is this run's, remove it by hand";; esac
    [ "$(stat -c %u "$NS")" = "$(id -u)" ] || die "$NS belongs to another user; nothing removed"
    rmdir -- "$NS" || die "could not remove $NS (only an empty folder is removed without its token file: inspect it); the record isn't retired, so cleanup can be retried"
    git -C "$W/src" worktree prune; echo "retired $(date -u +%FT%TZ)" >> "$W/$REC"
    say "removed the run folder $NS, proven by its recorded identity (its token file was already gone), and retired the record"; exit 0
  fi
  ns_ok
  if pid_alive || [ -f "$NS/run/proxy.pid" ]; then bash "$0" stop "$W" || die "the server didn't stop; nothing removed"; fi
  for f in "$NS"/run/firefox-*.pid; do [ -f "$f" ] || continue; stop_pidfile "$(basename "$f")" "$NS/profiles/"; done
  for p in $(pgrep -f -- "$NS/profiles/" || true); do cmd_has "$p" "--profile $NS/profiles/" && kill -TERM "$p" 2>/dev/null; done
  sleep 1; left=$(for p in $(pgrep -f -- "--profile $NS/profiles/" || true); do cmd_has "$p" "--profile $NS/profiles/" && echo "$p"; done)
  [ -z "$left" ] || die "Firefox processes using this run's profiles are still running ($(echo $left)); close them, then retry cleanup. Nothing removed"
  rm -rf --one-file-system -- "$NS/secret"; [ -e "$NS/secret" ] && die "could not remove $NS/secret; nothing else removed"; say "removed the code ($NS/secret)"
  rm -rf --one-file-system -- "$NS/tls"; [ -e "$NS/tls" ] && die "could not remove $NS/tls (the server key); nothing else removed"; say "removed the TLS key and certificates ($NS/tls)"
  if local_test && [ "${W7OP_TEST_INTERRUPT_CLEANUP:-}" = after-secret ]; then echo "w7op: TEST INTERRUPTION after the code (local test only)" >&2; exit 3; fi
  while IFS= read -r e; do [[ $e =~ ^co-[0-9a-f]{40}$ ]] && [ -d "$NS/$e" ] && [ ! -L "$NS/$e" ] && git -C "$W/src" worktree remove --force --force "$NS/$e" 2>/dev/null; done < <(sed -n 's/^wt //p' "$W/$REC")
  find "$NS" -mindepth 1 -maxdepth 1 ! -name "$TOKF" -exec rm -rf --one-file-system -- {} +
  left=$(find "$NS" -mindepth 1 -maxdepth 1 ! -name "$TOKF" | wc -l)
  if [ "$left" != 0 ]; then echo "w7op: CLEANUP INCOMPLETE: $left entr$([ "$left" = 1 ] && echo y || echo ies) left in $NS; the record isn't retired; retry cleanup" >&2; exit 1; fi
  echo "finalizing $(date -u +%FT%TZ)" >> "$W/$REC"
  rm -f -- "$NS/$TOKF" || { echo "w7op: CLEANUP INCOMPLETE: could not remove $NS/$TOKF; retry cleanup" >&2; exit 1; }
  if local_test && [ "${W7OP_TEST_INTERRUPT_CLEANUP:-}" = after-token ]; then echo "w7op: TEST INTERRUPTION after the token file (local test only)" >&2; exit 3; fi
  rmdir -- "$NS" || { echo "w7op: CLEANUP INCOMPLETE: could not remove $NS; the record isn't retired, and a retry proves the folder by its recorded identity" >&2; exit 1; }
  git -C "$W/src" worktree prune
  echo "retired $(date -u +%FT%TZ)" >> "$W/$REC"
  say "removed the run folder $NS and retired the record; kept $W/evidence, src/ and the record; nothing outside the run folder was touched" ;;
*) sed -n 2,22p "$0"; exit 2 ;;
esac
