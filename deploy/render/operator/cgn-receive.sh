#!/bin/sh
# cgn-receive: PROPOSED operator file for the Render route (Beta R4, review 6918277617). Not part of the runtime, and
# not run on Render: it runs where the independent copy is received (the owner's device, or wherever the archive is
# fetched back from the owner's private storage).
#   cgn-receive <archive.tar.age> <sha256 from that backup's BACKUP_OK line> <age identity file> <empty work folder>
# Prints "RECEIPT_OK ..." only if the received archive is byte-for-byte the one cgn-backup published (its SHA-256),
# decrypts with the owner's key, unpacks, and every file matches the checksum list made on the instance, which covers
# the whole copy (the manifest's files plus the manifest). Standard tools only: sha256sum, age, tar, find, grep.
# A deploy, a restore or a data-folder change requires RECEIPT_OK for a backup from the same window; BACKUP_OK alone
# only says the archive exists on the Render disk.
# The expected hash must come from the BACKUP_OK line seen in the SSH session, not from the archive's own folder: the
# checksum list travels inside the archive, and anyone with the public key could make a self-consistent archive.
# Any failure: RECEIPT_FAILED and a non-zero exit. The work folder is left for inspection; it is never used as a
# backup unless RECEIPT_OK was printed for it.
set -u
fail() { echo "RECEIPT_FAILED: $*" >&2; exit 1; }
[ $# -eq 4 ] || fail "usage: cgn-receive ARCHIVE EXPECTED_SHA256 IDENTITY_FILE EMPTY_WORK_FOLDER"
A=$1; WANT=$2; KEY=$3; W=$4
for c in age tar sha256sum find grep; do command -v "$c" >/dev/null 2>&1 || fail "$c is not installed"; done
[ -f "$A" ] || fail "no archive at $A"
[ -f "$KEY" ] || fail "no identity file at $KEY"
case "$WANT" in *[!0-9a-f]*|"") fail "the expected SHA-256 is not 64 hex digits";; esac
[ "${#WANT}" -eq 64 ] || fail "the expected SHA-256 is not 64 hex digits"
[ -d "$W" ] || fail "no work folder at $W"
[ -z "$(ls -A "$W")" ] || fail "the work folder $W is not empty"

line=$(sha256sum -- "$A") || fail "could not hash the archive"
got=${line%% *}
[ "$got" = "$WANT" ] || fail "the archive's SHA-256 is $got, not the expected $WANT"
age -d -i "$KEY" -o "$W/archive.tar" "$A" || fail "decryption failed (wrong key, or a damaged archive)"
tar -tf "$W/archive.tar" > "$W/archive.list" || fail "the archive's contents can't be listed"
tar -C "$W" -xf "$W/archive.tar" || fail "unpacking failed"
n=0; S=""
for s in "$W"/*.SHA256SUMS; do [ -f "$s" ] && { n=$((n + 1)); S=$s; }; done
[ "$n" -eq 1 ] || fail "expected exactly one checksum list, found $n"
STAMP=$(basename "$S" .SHA256SUMS)
[ -f "$W/$STAMP/manifest.json" ] || fail "the backup has no manifest"
(cd "$W" && sha256sum -c --strict --quiet "$STAMP.SHA256SUMS") || fail "a file doesn't match its checksum"
listed=$(grep -c . "$S") || fail "the checksum list is empty"
files=$(grep -c '"sha256"' "$W/$STAMP/manifest.json") || fail "could not count the manifest's files"
[ "$listed" -eq $((files + 1)) ] || fail "the checksum list covers $listed files; the manifest lists $files plus itself"
find "$W/$STAMP" -type f > "$W/found.list" || fail "could not list the unpacked copy"
found=$(grep -c . "$W/found.list") || fail "the unpacked copy is empty"
[ "$found" -eq "$listed" ] || fail "the unpacked copy holds $found files, but $listed are checked"
rm -f -- "$W/archive.tar" "$W/archive.list" "$W/found.list" || fail "could not remove the temporary files"
echo "RECEIPT_OK $A sha256=$got files=$listed copy=$W/$STAMP"
