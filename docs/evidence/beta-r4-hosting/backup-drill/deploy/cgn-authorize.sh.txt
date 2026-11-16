#!/bin/sh
# cgn-authorize: PROPOSED deploy file for the Render route (Beta R4, review 6917441687). Not part of the runtime.
# Records, on the disk, the configuration the owner approved. cgn-entrypoint refuses to start the server under any
# other data folder, public origin, proxy count or access code. Render's one-click rollback brings back an old
# deploy's environment values but never rolls the disk back, so a rollback to old values fails closed instead of
# serving the wrong folder or an old access code.
#   printf '%s' "$CODE" | cgn-authorize <data dir> <public origin> <trust-proxy hops, or "unset">
# Run over SSH, BEFORE changing the service's environment to those values (then save the environment, which redeploys).
# The access code is read from standard input and kept only as a salted SHA-256; it is never printed or stored.
set -eu
CONF=${CGN_AUTHORIZED_CONFIG:-/var/data/cgn-authorized.conf}
[ $# -eq 3 ] || { echo "usage: printf %s CODE | cgn-authorize DATA_DIR PUBLIC_ORIGIN HOPS|unset" >&2; exit 2; }
case "$1" in /*) ;; *) echo "AUTHORIZE_FAILED: the data folder must be an absolute path" >&2; exit 1;; esac
case "$2" in https://*|http://*) ;; *) echo "AUTHORIZE_FAILED: the public origin must be http(s)" >&2; exit 1;; esac
case "$3" in unset|0|1|2|3) ;; *) echo "AUTHORIZE_FAILED: hops must be 0-3 or unset" >&2; exit 1;; esac
code=$(cat)
[ "${#code}" -ge 12 ] || { echo "AUTHORIZE_FAILED: the access code must be at least 12 characters" >&2; exit 1; }
salt=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
hash=$(printf '%s:%s' "$salt" "$code" | sha256sum | cut -d' ' -f1)
umask 077
printf 'data_dir=%s\npublic_origin=%s\ntrust_proxy=%s\ncode_salt=%s\ncode_sha256=%s\n' "$1" "$2" "$3" "$salt" "$hash" > "$CONF.part"
mv "$CONF.part" "$CONF"
echo "AUTHORIZED data_dir=$1 public_origin=$2 trust_proxy=$3 (the access code is kept only as a salted hash)"
