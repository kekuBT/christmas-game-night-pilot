#!/bin/sh
# cgn-authorize: PROPOSED deploy file for the Render route (Beta R4, reviews 6917441687, 6939462697 and 6940435060).
# Not part of the runtime.
# Records, on the disk, the configuration the owner approved. cgn-entrypoint refuses to start the server under any
# other data folder, public origin, proxy count or access code. Render's one-click rollback brings back an old
# deploy's environment values but never rolls the disk back, so a rollback to old values fails closed instead of
# serving the wrong folder or an old access code.
#
#   printf '%s' "$CODE" | cgn-authorize <data dir> <public origin> <trust-proxy hops, or "unset">
#       The whole configuration (a first install, or a planned change of origin, proxy count or code). Run over SSH
#       BEFORE changing the service's environment to those values (then save the environment, which redeploys).
#       Refused while a folder switch is pending (commit or abort it first). The access code is read from standard
#       input and kept only as a salted SHA-256; it is never printed or stored.
#
# A data-folder switch (a restore, review 6939462697) is a prepare / commit-or-abort transition, in a maintenance window:
#   cgn-authorize --prepare <dir>   records <dir> as the ONE pending replacement for the approved folder, with the
#                                   same origin, proxy count and access code. The approved folder keeps starting with
#                                   its own MCHEZO_DATA_DIR, so a failed start on <dir> is undone by an ordinary
#                                   redeploy with the original environment (no SSH to the failed instance needed).
#   cgn-authorize --commit <dir>    from the instance that is serving <dir> (checked): <dir> becomes the approved
#                                   folder; the previous one is refused from then on.
#   cgn-authorize --abort <dir>     only from the instance serving the APPROVED folder (checked, review 6940435060): the
#                                   pending entry is removed; <dir> is refused from then on. The approved folder is
#                                   unchanged. A writer that is unknown, paused, down or pending refuses the abort.
#   cgn-authorize --status          prints the record (never the code or its hash); exit 1 if there is none or it is
#                                   unusable.
# Every change holds an exclusive lock (flock on <record>.lock, released if the process dies), writes a new file next to
# the record, flushes it, renames it over the record and flushes the file system: an interrupted change leaves the
# old record or the new one, never a mix. A leftover <record>.part.* file is ignored by cgn-entrypoint and removed by
# the next change.
set -eu
CONF=${CGN_AUTHORIZED_CONFIG:-/var/data/cgn-authorized.conf}
RUN=${CGN_RUN_DIR:-/tmp/cgn}
fail() { echo "AUTHORIZE_FAILED: $*" >&2; exit 1; }

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

# A path given to --prepare/--commit/--abort: absolute, no trailing "/", no "//", no "." or ".." segment.
clean_path() {
  case "$1" in /*) ;; *) return 1;; esac
  case "$1" in */|*//*|*/./*|*/../*|*/.|*/..) return 1;; esac
  return 0
}
# The data folder the game server on THIS instance is running with (empty if none runs): the server cgn-entrypoint
# started (its pid file), checked to be that server, read from its environment.
serving_dir() {
  _p=$(cat "$RUN/server.pid" 2>/dev/null || true)
  case "$_p" in ""|*[!0-9]*) return 0;; esac
  [ -r "/proc/$_p/environ" ] || return 0
  tr '\0' ' ' < "/proc/$_p/cmdline" 2>/dev/null | grep -q 'dist/server/serve.js' || return 0
  tr '\0' '\n' < "/proc/$_p/environ" 2>/dev/null | sed -n 's/^MCHEZO_DATA_DIR=//p' | head -n 1
}
# write_record <data dir> <origin> <hops> <salt> <sha> [<pending dir>]: the new record, atomically (under the lock).
write_record() {
  _tmp="$CONF.part.$$"
  umask 077
  if [ $# -ge 6 ] && [ -n "$6" ]; then
    printf 'data_dir=%s\npublic_origin=%s\ntrust_proxy=%s\ncode_salt=%s\ncode_sha256=%s\npending_data_dir=%s\npending_base=%s\n' "$1" "$2" "$3" "$4" "$5" "$6" "$1" > "$_tmp"
  else
    printf 'data_dir=%s\npublic_origin=%s\ntrust_proxy=%s\ncode_salt=%s\ncode_sha256=%s\n' "$1" "$2" "$3" "$4" "$5" > "$_tmp"
  fi
  sync "$_tmp" || { rm -f -- "$_tmp"; fail "could not flush the new record; nothing was changed"; }
  mv -f -- "$_tmp" "$CONF" || { rm -f -- "$_tmp"; fail "could not put the new record in place; nothing was changed"; }
  sync -f "$CONF" || echo "cgn-authorize: WARNING: the record was replaced, but the file system flush reported an error" >&2
}
lock() {
  umask 077
  exec 9>>"$CONF.lock" || fail "could not open the lock $CONF.lock"
  flock -w 10 9 || fail "another change of the record is in progress (lock $CONF.lock); nothing was changed"
  rm -f -- "$CONF.part" "$CONF".part.*   # leftovers of an interrupted change (we hold the lock)
}
need_record() {
  { [ -e "$CONF" ] || [ -L "$CONF" ]; } || fail "no authorized configuration is recorded at $CONF"
  read_record "$CONF" || fail "the record at $CONF is unusable ($WHY); nothing was changed"
}

case "${1:-}" in
  --status)
    [ $# -eq 1 ] || { echo "usage: cgn-authorize --status" >&2; exit 2; }
    if ! { [ -e "$CONF" ] || [ -L "$CONF" ]; }; then echo "STATUS none: no authorized configuration at $CONF"; exit 1; fi
    if ! read_record "$CONF"; then echo "STATUS UNUSABLE: $WHY"; exit 1; fi
    echo "STATUS data_dir=$R_data_dir public_origin=$R_public_origin trust_proxy=$R_trust_proxy pending_data_dir=${R_pending_data_dir:-none} serving=$(serving_dir | grep . || echo none)"
    exit 0 ;;
  --prepare)
    [ $# -eq 2 ] || { echo "usage: cgn-authorize --prepare DIR" >&2; exit 2; }
    clean_path "$2" || fail "the folder must be an absolute path without a trailing '/', '//', '.' or '..'"
    lock; need_record
    [ -z "$R_pending_data_dir" ] || fail "a switch to $R_pending_data_dir is already pending: commit or abort it first"
    [ "$2" != "$R_data_dir" ] || fail "$2 is already the approved folder"
    case "$2/" in "$R_data_dir/"*) fail "$2 is inside the approved folder";; esac
    case "$R_data_dir/" in "$2/"*) fail "the approved folder is inside $2";; esac
    [ -d "$2" ] && [ ! -L "$2" ] || fail "$2 is not a folder (restore and check it first)"
    [ -O "$2" ] || fail "$2 does not belong to this user (restore it as the service user)"
    write_record "$R_data_dir" "$R_public_origin" "$R_trust_proxy" "$R_code_salt" "$R_code_sha256" "$2"
    echo "PREPARED pending_data_dir=$2 approved_data_dir=$R_data_dir (the approved folder still starts with its own MCHEZO_DATA_DIR; start $2, check it, then commit or abort before reopening)"
    exit 0 ;;
  --commit)
    [ $# -eq 2 ] || { echo "usage: cgn-authorize --commit DIR" >&2; exit 2; }
    lock; need_record
    [ -n "$R_pending_data_dir" ] || fail "no folder switch is pending"
    [ "$2" = "$R_pending_data_dir" ] || fail "$2 is not the pending folder ($R_pending_data_dir)"
    [ "$(serving_dir)" = "$2" ] || fail "the server on this instance is not running on $2: commit only from the instance serving it, after its checks"
    write_record "$2" "$R_public_origin" "$R_trust_proxy" "$R_code_salt" "$R_code_sha256"
    echo "COMMITTED data_dir=$2 (the previous folder $R_data_dir is no longer authorized)"
    exit 0 ;;
  --abort)
    [ $# -eq 2 ] || { echo "usage: cgn-authorize --abort DIR" >&2; exit 2; }
    lock; need_record
    [ -n "$R_pending_data_dir" ] || fail "no folder switch is pending"
    [ "$2" = "$R_pending_data_dir" ] || fail "$2 is not the pending folder ($R_pending_data_dir)"
    # Review 6940435060 (F-W6-02): only with affirmative evidence that the APPROVED folder is being served here. A writer
    # that is unknown, paused by a backup hold, down, or on the pending folder fails closed: the record is unchanged.
    sv=$(serving_dir)
    [ "$sv" = "$R_data_dir" ] || fail "the server on this instance is not running on the approved folder $R_data_dir (it is ${sv:-not running, or paused}): redeploy with the approved folder, check it, then abort from that instance"
    write_record "$R_data_dir" "$R_public_origin" "$R_trust_proxy" "$R_code_salt" "$R_code_sha256"
    echo "ABORTED pending_data_dir=$2 (no longer authorized); the approved folder stays $R_data_dir"
    exit 0 ;;
  -*)
    echo "usage: printf %s CODE | cgn-authorize DATA_DIR PUBLIC_ORIGIN HOPS|unset; or cgn-authorize --prepare|--commit|--abort DIR; or cgn-authorize --status" >&2; exit 2 ;;
esac

[ $# -eq 3 ] || { echo "usage: printf %s CODE | cgn-authorize DATA_DIR PUBLIC_ORIGIN HOPS|unset" >&2; exit 2; }
case "$1" in /*) ;; *) fail "the data folder must be an absolute path";; esac
case "$2" in https://*|http://*) ;; *) fail "the public origin must be http(s)";; esac
case "$3" in unset|0|1|2|3) ;; *) fail "hops must be 0-3 or unset";; esac
code=$(cat)
[ "${#code}" -ge 12 ] || fail "the access code must be at least 12 characters"
lock
if { [ -e "$CONF" ] || [ -L "$CONF" ]; } && read_record "$CONF" && [ -n "$R_pending_data_dir" ]; then
  fail "a switch to $R_pending_data_dir is pending: commit or abort it first"
fi
salt=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
hash=$(printf '%s:%s' "$salt" "$code" | sha256sum | cut -d' ' -f1)
write_record "$1" "$2" "$3" "$salt" "$hash"
echo "AUTHORIZED data_dir=$1 public_origin=$2 trust_proxy=$3 (the access code is kept only as a salted hash)"
