#!/bin/sh
# cgn-entrypoint: PROPOSED deploy file for the Render route (Beta R4, reviews 6917441687, 6918277617 and 6918922306).
# Not part of the runtime.
# PID 1 in the container. It runs the unchanged game server, passes Render's SIGTERM on to it, and keeps the
# container up (and with it the disk and SSH) while cgn-backup has stopped the server on purpose.
#
# - The hold is a folder made by cgn-backup in an ephemeral folder (CGN_RUN_DIR, /tmp/cgn by default), recording its
#   owner's pid. An instance restart always clears it, so a hold never outlives a restart: the server starts on boot.
# - A hold whose owner is gone (the backup killed outright, the SSH session lost) is stale once no process carries the
#   owner's run token any more (a copy started by the dead owner runs on until it ends or reaches its time limit, and
#   the server must not restart under it). Then this script releases the hold within about a second, and the server
#   starts again. A hold with no recorded owner is stale after 10 s. Files a killed run left are not removed here:
#   the next cgn-backup (or `cgn-backup reconcile`) reconciles them.
# - A server exit WITHOUT a hold ends the container with the server's exit code, so Render restarts the instance, as it
#   would without this script.
# - Render's SIGTERM (a deploy, a restart, a shutdown) is passed to the server, which closes every socket and releases
#   the data lock; then this script exits 0. The 30 s SIGKILL deadline is Render's.
# - The rollback guard: before anything starts, the environment must match the configuration recorded on the disk by
#   cgn-authorize (data folder, public origin, proxy count, a salted hash of the access code). A mismatch, or data
#   present with no record, exits 78 without starting the server. The only start without a record is a first install
#   (no data yet), and it says so.
set -u
RUN=${CGN_RUN_DIR:-/tmp/cgn}
APP=${CGN_APP_DIR:-/app}
CONF=${CGN_AUTHORIZED_CONFIG:-/var/data/cgn-authorized.conf}
refuse() { echo "cgn-entrypoint: REFUSED: $*" >&2; exit 78; }
if [ -f "$CONF" ]; then
  get() { sed -n "s/^$1=//p" "$CONF"; }
  [ "${MCHEZO_DATA_DIR:-}" = "$(get data_dir)" ] || refuse "MCHEZO_DATA_DIR is not the authorized data folder (a rollback brings back old environment values)"
  [ "${MCHEZO_PUBLIC_ORIGIN:-}" = "$(get public_origin)" ] || refuse "MCHEZO_PUBLIC_ORIGIN is not the authorized origin"
  [ "${MCHEZO_TRUST_PROXY:-unset}" = "$(get trust_proxy)" ] || refuse "MCHEZO_TRUST_PROXY is not the authorized proxy count"
  [ "$(printf '%s:%s' "$(get code_salt)" "${MCHEZO_BETA_ACCESS_CODE:-}" | sha256sum | cut -d' ' -f1)" = "$(get code_sha256)" ] || refuse "the access code is not the authorized one"
  echo "cgn-entrypoint: the environment matches the authorized configuration" >&2
elif [ -n "$(ls -A "${MCHEZO_DATA_DIR:-/nonexistent}" 2>/dev/null)" ]; then
  refuse "data exists in ${MCHEZO_DATA_DIR:-?} but no authorized configuration is recorded at $CONF"
else
  echo "cgn-entrypoint: WARNING first install: no authorized configuration yet and no data; run cgn-authorize after the acceptance checks" >&2
fi
mkdir -p "$RUN"
child=0
# True if any process carries the run token in its environment (CGN_BACKUP_RUN, set by cgn-backup for everything it runs).
token_alive() {
  for e in /proc/[0-9]*/environ; do
    { tr '\0' '\n' < "$e"; } 2>/dev/null | grep -qx "CGN_BACKUP_RUN=$1" && return 0
  done
  return 1
}
# True when the hold exists but its owner is gone and nothing it started still runs (or it never recorded itself).
waiting_note=""
stale_hold() {
  [ -d "$RUN/hold" ] || return 1
  hp=$(cat "$RUN/hold/pid" 2>/dev/null); ht=$(cat "$RUN/hold/owner" 2>/dev/null)
  if [ -n "$hp" ]; then
    kill -0 "$hp" 2>/dev/null && return 1
    if [ -n "$ht" ] && token_alive "$ht"; then
      [ "$waiting_note" = "$ht" ] || echo "cgn-entrypoint: the hold's owner (pid $hp) is gone, but a process it started still runs: waiting" >&2
      waiting_note=$ht
      return 1
    fi
    return 0
  fi
  made=$(stat -c %Y "$RUN/hold" 2>/dev/null) || return 1
  [ $(( $(date +%s) - made )) -ge 10 ]
}
on_term() {
  if [ "$child" -ne 0 ]; then kill -TERM "$child" 2>/dev/null; wait "$child"; fi
  rm -f "$RUN/server.pid"
  echo "cgn-entrypoint: stopped on request" >&2
  exit 0
}
trap on_term TERM INT
while :; do
  if [ -e "$RUN/hold" ]; then
    if stale_hold; then
      echo "cgn-entrypoint: releasing a stale hold (its owner, pid ${hp:-unrecorded}, is gone)" >&2
      rm -rf "$RUN/hold"
      continue
    fi
    sleep 1 & wait $!
    continue
  fi
  (cd "$APP" && exec node dist/server/serve.js) &
  child=$!
  echo "$child" > "$RUN/server.pid"
  wait "$child"
  code=$?
  child=0
  rm -f "$RUN/server.pid"
  if [ -e "$RUN/hold" ]; then
    echo "cgn-entrypoint: server stopped for a backup (exit $code); holding until the backup ends" >&2
    continue
  fi
  echo "cgn-entrypoint: server exited ($code) with no hold; exiting so the platform restarts the instance" >&2
  exit "$code"
done
