#!/bin/sh
# cgn-entrypoint: PROPOSED deploy file for the Render route (Beta R4, reviews 6917441687, 6918277617, 6918922306,
# 6939462697 and 6940435060). Not part of the runtime.
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
#   cgn-authorize (data folder, public origin, proxy count, a salted hash of the access code). A mismatch, an unusable
#   record (malformed, or a stale pending entry), or data present with no record, exits 78 without starting the
#   server. The only start without a record is a first install (no data yet), and it says so.
# - A data-folder switch (review 6939462697): the record may also name ONE pending folder (cgn-authorize --prepare),
#   with the same origin, proxy count and code. MCHEZO_DATA_DIR then selects which folder starts: the approved one, or
#   the pending one (logged as PENDING until cgn-authorize --commit or --abort). Any other folder is refused. So a
#   failed start on the pending folder is undone by an ordinary redeploy with the original environment.
set -u
RUN=${CGN_RUN_DIR:-/tmp/cgn}
APP=${CGN_APP_DIR:-/app}
CONF=${CGN_AUTHORIZED_CONFIG:-/var/data/cgn-authorized.conf}
refuse() { echo "cgn-entrypoint: REFUSED: $*" >&2; exit 78; }
# --- record reader (identical in cgn-authorize and cgn-entrypoint) ---
# read_record <file>: sets R_data_dir R_public_origin R_trust_proxy R_code_salt R_code_sha256 R_pending_data_dir
# R_pending_base, or returns 1 with the reason in WHY. Fails closed: an unknown or repeated key, a line without "=",
# a missing or ill-formed value, a pending entry without its base, or a STALE pending entry (prepared against another
# approved folder than the recorded one) make the whole record unusable.
read_record() {
  R_data_dir=""; R_public_origin=""; R_trust_proxy=""; R_code_salt=""; R_code_sha256=""; R_pending_data_dir=""; R_pending_base=""
  WHY=""; _seen=" "
  [ -f "$1" ] && [ ! -L "$1" ] || { WHY="it is not a regular file"; return 1; }
  [ -r "$1" ] || { WHY="it is not readable"; return 1; }
  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in *=*) ;; *) WHY="a line without '='"; return 1;; esac
    _k=${_line%%=*}; _v=${_line#*=}
    case "$_k" in data_dir|public_origin|trust_proxy|code_salt|code_sha256|pending_data_dir|pending_base) ;; *) WHY="an unknown key"; return 1;; esac
    case "$_seen" in *" $_k "*) WHY="the key $_k appears twice"; return 1;; esac
    _seen="$_seen$_k "
    eval "R_$_k=\$_v"
  done < "$1"
  case "$R_data_dir" in /*) ;; *) WHY="data_dir is missing or not an absolute path"; return 1;; esac
  case "$R_public_origin" in https://?*|http://?*) ;; *) WHY="public_origin is missing or not http(s)"; return 1;; esac
  case "$R_trust_proxy" in unset|0|1|2|3) ;; *) WHY="trust_proxy is missing or not 0-3/unset"; return 1;; esac
  case "$R_code_salt" in *[!0-9a-f]*|"") WHY="code_salt is missing or not hex"; return 1;; esac
  [ "${#R_code_salt}" -eq 32 ] || { WHY="code_salt is not 32 hex digits"; return 1; }
  case "$R_code_sha256" in *[!0-9a-f]*|"") WHY="code_sha256 is missing or not hex"; return 1;; esac
  [ "${#R_code_sha256}" -eq 64 ] || { WHY="code_sha256 is not 64 hex digits"; return 1; }
  _np=0
  case "$_seen" in *" pending_data_dir "*) _np=$((_np + 1));; esac
  case "$_seen" in *" pending_base "*) _np=$((_np + 1));; esac
  if [ "$_np" = 1 ]; then WHY="a pending entry without its pair"; return 1; fi
  if [ "$_np" = 2 ]; then
    case "$R_pending_data_dir" in /*) ;; *) WHY="pending_data_dir is not an absolute path"; return 1;; esac
    [ "$R_pending_data_dir" != "$R_data_dir" ] || { WHY="pending_data_dir is the approved folder"; return 1; }
    [ "$R_pending_base" = "$R_data_dir" ] || { WHY="STALE: the pending folder was prepared against another approved folder"; return 1; }
  fi
  return 0
}
# --- end record reader ---
# guard: the environment against the CURRENT record, before EVERY server launch (review 6940435060, F-W6-02), so a
# writer paused by a backup hold is never resumed on a folder the record no longer authorizes. MODE remembers how this
# instance started: "record" (refused for good once the record is gone) or "first-install" (no record and no data at
# boot: it may resume while there is still no record; once a record appears, it is enforced like any other).
MODE=""
guard() {
  if [ -e "$CONF" ] || [ -L "$CONF" ]; then
    read_record "$CONF" || refuse "the authorized configuration at $CONF is unusable ($WHY)"
    if [ "${MCHEZO_DATA_DIR:-}" = "$R_data_dir" ]; then
      selected="the APPROVED data folder $R_data_dir"
    elif [ -n "$R_pending_data_dir" ] && [ "${MCHEZO_DATA_DIR:-}" = "$R_pending_data_dir" ]; then
      selected="the PENDING data folder $R_pending_data_dir (not committed: the approved folder stays $R_data_dir; commit or abort before reopening)"
    elif [ -n "$R_pending_data_dir" ]; then
      refuse "MCHEZO_DATA_DIR is not the authorized data folder, nor the pending one (a rollback brings back old environment values)"
    else
      refuse "MCHEZO_DATA_DIR is not the authorized data folder (a rollback brings back old environment values)"
    fi
    [ "${MCHEZO_PUBLIC_ORIGIN:-}" = "$R_public_origin" ] || refuse "MCHEZO_PUBLIC_ORIGIN is not the authorized origin"
    [ "${MCHEZO_TRUST_PROXY:-unset}" = "$R_trust_proxy" ] || refuse "MCHEZO_TRUST_PROXY is not the authorized proxy count"
    [ "$(printf '%s:%s' "$R_code_salt" "${MCHEZO_BETA_ACCESS_CODE:-}" | sha256sum | cut -d' ' -f1)" = "$R_code_sha256" ] || refuse "the access code is not the authorized one"
    MODE=record
    echo "cgn-entrypoint: the environment matches the authorized configuration: $selected" >&2
  elif [ "$MODE" = record ]; then
    refuse "the authorized configuration at $CONF is gone (this instance started with one); the server is not started again"
  elif [ "$MODE" = first-install ]; then
    echo "cgn-entrypoint: WARNING first install: still no authorized configuration; run cgn-authorize after the acceptance checks" >&2
  elif [ -n "$(ls -A "${MCHEZO_DATA_DIR:-/nonexistent}" 2>/dev/null)" ]; then
    refuse "data exists in ${MCHEZO_DATA_DIR:-?} but no authorized configuration is recorded at $CONF"
  else
    MODE=first-install
    echo "cgn-entrypoint: WARNING first install: no authorized configuration yet and no data; run cgn-authorize after the acceptance checks" >&2
  fi
}
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
  guard   # every launch, including the first and each resume after a hold: refuses (78) before any writer starts
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
