#!/bin/bash
# Beta R4 packaging (handoff 6919813048): LOCAL checks of the proposed Render image.
# W6 repair copy (review 6939462697): identical to docs/evidence/beta-r4-render-package/harness/image-checks.sh.txt except
# that C2 takes the three scripts' expected hashes from <deploy/render>/pins/scripts.sha256 (and checks the deploy files
# against it) instead of the round-5 hashes written into the check. Disposable data only; no Render,
# no account, no network beyond localhost and the package registries the build itself uses.
#   bash image-checks.sh <deploy/render folder> <local rebuild archive of 7097ac2> <work dir>
# Needs: docker (BuildKit), node 22, age, curl, and build.sh / assemble.sh / api.mjs next to this script.
#
# THE ARCHIVE HERE IS A LOCAL REBUILD (docs/beta/release-7097ac2.md, build 2), NOT the audited a693c543... archive, which
# this session can't reach. So the positive builds use a TEST PIN (pins/archive.sha256 replaced by the rebuild's own
# hash), and G1 shows the production pin refusing the rebuild. The two build stages' base images are replaced by local
# copies that trust this sandbox's TLS-inspection CA (see build.sh); the runtime stage is the exact pinned image.
set -uo pipefail
SRC=$(cd "$1" && pwd); ARC=$(cd "$(dirname "$2")" && pwd)/$(basename "$2"); WK=$3
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$WK"; WK=$(cd "$WK" && pwd)
PASS=0; FAILN=0; FAILED=()
check() { if [ "$2" = 0 ]; then PASS=$((PASS + 1)); echo "PASS $1${3:+ — $3}"; else FAILN=$((FAILN + 1)); FAILED+=("$1"); echo "FAIL $1${3:+ — $3}"; fi; }
ok() { "$@" >/dev/null 2>&1; echo $?; }
IMG=cgn-render:check
PORT=18080; BASE=http://127.0.0.1:$PORT
ORIGIN=https://cgn-w1.test
SECRETS=$WK/secrets; rm -rf "$SECRETS"; mkdir -m 700 "$SECRETS"
cleanup() { docker rm -f cgn-c1 cgn-c10 >/dev/null 2>&1; docker volume rm -f cgn-vol1 >/dev/null 2>&1; }
trap cleanup EXIT
cleanup

echo "== image-checks $(date -u +%FT%TZ)"
echo "deploy files:"; (cd "$SRC" && sha256sum Dockerfile .dockerignore cgn-artifact-gate.sh cgn-entrypoint.sh cgn-backup.sh cgn-authorize.sh operator/cgn-receive.sh pins/*)
echo "archive (local rebuild): $(sha256sum "$ARC" | cut -d' ' -f1)"
echo "docker $(docker version --format '{{.Server.Version}}'), base images: $(docker image inspect --format '{{.Id}}' docker.io/library/node:22.16.0-bookworm-slim)"

# ---------------- B: the build ----------------
"$HERE/assemble.sh" "$SRC" "$ARC" "$WK/ctx" test-pin
"$HERE/build.sh" "$WK/ctx" "$IMG" --no-cache > "$WK/build-B0.log" 2>&1; rc=$?   # no cache: every stage runs and prints
check "B0 the image builds from the local rebuild (test pin): gate ARTIFACT_GATE_OK, image INSTALLED_OK, age OK" \
  "$([ $rc = 0 ] && grep -q 'ARTIFACT_GATE_OK archive=' "$WK/build-B0.log" && grep -q 'INSTALLED_OK revision=7097ac2bb062925bb296a129f4771f1e68fd522d' "$WK/build-B0.log" && grep -q 'age: OK' "$WK/build-B0.log"; echo $?)" \
  "$(grep -o 'ARTIFACT_GATE_OK.*' "$WK/build-B0.log" | head -1)"
[ $rc = 0 ] || { echo "the base build failed; see $WK/build-B0.log"; tail -30 "$WK/build-B0.log"; exit 1; }

# A negative build: assemble (with a change), build the given target, expect a failure with the given reason.
neg() { # <id> <description> <target> <expected text> <mutation function>
  local id=$1 desc=$2 target=$3 want=$4 mut=$5 c="$WK/ctx-$1"
  "$HERE/assemble.sh" "$SRC" "$ARC" "$c" test-pin >/dev/null
  "$mut" "$c"
  "$HERE/build.sh" "$c" "cgn-render:neg-$id" --target "$target" --no-cache > "$WK/build-$id.log" 2>&1; local rc=$?
  check "$id $desc" "$([ $rc != 0 ] && grep -q -- "$want" "$WK/build-$id.log"; echo $?)" "build exit $rc; $(grep -o "ARTIFACT_GATE_FAILED[^\"]*\|age: FAILED\|WARNING: 1 computed checksum did NOT match" "$WK/build-$id.log" | head -1 | cut -c1-200)"
}
repack() { # <ctx> <python edit of the unpacked package, in $P>: rebuild the archive after an edit, and re-pin it
  local c=$1; local t; t=$(mktemp -d)
  tar -xzf "$c/artifact/mchezo-7097ac2.tgz" -C "$t"
  P=$t bash -c "$2"
  tar -czf "$c/artifact/mchezo-7097ac2.tgz" -C "$t" .
  (cd "$c/artifact" && sha256sum mchezo-7097ac2.tgz) > "$c/pins/archive.sha256"
  rm -rf "$t"
}
m_prodpin() { cp "$SRC/pins/archive.sha256" "$1/pins/archive.sha256"; }
m_file() { repack "$1" 'printf "\n// changed\n" >> "$P/dist/server/serve.js"'; }
m_revision() { repack "$1" 'sed -i "s/7097ac2bb062925bb296a129f4771f1e68fd522d/1111111111111111111111111111111111111111/" "$P/release.json"'; }
m_link() { repack "$1" 'ln -s /etc/passwd "$P/content/link"'; }
m_nodemods() { repack "$1" 'mkdir -p "$P/node_modules/evil" && echo "module.exports=1" > "$P/node_modules/evil/index.js"'; }
m_extrafile() { repack "$1" 'echo extra > "$P/extra.txt"'; }
m_script() { printf '\n# changed\n' >> "$1/cgn-backup.sh"; }
m_twoartifacts() { cp "$1/artifact/mchezo-7097ac2.tgz" "$1/artifact/second.tgz"; }
m_agepin() { printf '%s  age\n' 0000000000000000000000000000000000000000000000000000000000000000 > "$1/pins/age.sha256"; }
m_dirty() { repack "$1" 'sed -i "s/7097ac2bb062925bb296a129f4771f1e68fd522d\"/7097ac2bb062925bb296a129f4771f1e68fd522d-dirty\"/" "$P/release.json"'; }
neg G1 "the PRODUCTION pin (the audited a693c543...) refuses the local rebuild" gate "the archive is not the audited one" m_prodpin
neg G2 "one changed file in the package (re-pinned archive): refused by the inventory" gate "the inventory differs from the pinned one" m_file
neg G3 "release.json naming another revision: refused" gate "release.json names the revision 1111111111111111111111111111111111111111" m_revision
neg G4 "release.json marked -dirty: refused" gate "release.json names the revision 7097ac2bb062925bb296a129f4771f1e68fd522d-dirty" m_dirty
neg G5 "a symbolic link in the archive: refused before unpacking" gate "neither files nor folders (types: l)" m_link
neg G6 "node_modules shipped in the archive: refused" gate "the archive holds node_modules" m_nodemods
neg G7 "one extra file in the package: refused" gate "the package holds 146 files" m_extrafile
neg G8 "a changed cgn-backup.sh: refused as not the reviewed script" gate "a deploy-side script is not the reviewed one" m_script
# G9: a second file in artifact/ can't even enter the build (.dockerignore admits only the archive's name), and the gate
# refuses one when run directly on such a folder.
c="$WK/ctx-G9"; "$HERE/assemble.sh" "$SRC" "$ARC" "$c" test-pin >/dev/null; m_twoartifacts "$c"
"$HERE/build.sh" "$c" cgn-render:neg-G9 --target gate --no-cache > "$WK/build-G9.log" 2>&1; rc=$?
direct=$(docker run --rm -v "$c":/gate:ro local/cgn-test-node-ca:22.16.0 sh /gate/cgn-artifact-gate.sh gate /gate /tmp/out 2>&1); drc=$?
check "G9 a second file in artifact/: kept out of the build by .dockerignore, and refused by the gate itself" \
  "$([ $rc = 0 ] && ! grep -q 'second.tgz' "$WK/build-G9.log" && [ $drc != 0 ] && echo "$direct" | grep -q 'artifact/ must hold exactly mchezo-7097ac2.tgz'; echo $?)" "build $rc; direct run exit $drc: $(echo "$direct" | grep -o 'ARTIFACT_GATE_FAILED.*' | cut -c1-110)"
neg G10 "a wrong age pin: the age stage fails" age "age: FAILED" m_agepin

# G11: the other archive layout (everything inside one top-level folder) is accepted.
c="$WK/ctx-G11"; "$HERE/assemble.sh" "$SRC" "$ARC" "$c" test-pin >/dev/null
t=$(mktemp -d); mkdir "$t/mchezo-7097ac2"; tar -xzf "$c/artifact/mchezo-7097ac2.tgz" -C "$t/mchezo-7097ac2"; tar -czf "$c/artifact/mchezo-7097ac2.tgz" -C "$t" mchezo-7097ac2; rm -rf "$t"
(cd "$c/artifact" && sha256sum mchezo-7097ac2.tgz) > "$c/pins/archive.sha256"
"$HERE/build.sh" "$c" cgn-render:g11 --target gate --no-cache > "$WK/build-G11.log" 2>&1; rc=$?
check "G11 the same package inside one top-level folder is accepted (ARTIFACT_GATE_OK)" "$([ $rc = 0 ] && grep -q ARTIFACT_GATE_OK "$WK/build-G11.log"; echo $?)"

# G12: a file Render would copy into the build context (a "secret file") never reaches the image.
c="$WK/ctx-G12"; "$HERE/assemble.sh" "$SRC" "$ARC" "$c" test-pin >/dev/null
CANARY="cgn-canary-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
echo "$CANARY" > "$c/render-secret-file.env"
"$HERE/build.sh" "$c" cgn-render:g12 --no-cache > "$WK/build-G12.log" 2>&1; rc=$?
cid=$(docker create cgn-render:g12); hits=$(docker export "$cid" | grep -a -c "$CANARY"); docker rm "$cid" >/dev/null
hist=$(docker history --no-trunc cgn-render:g12 | grep -c "$CANARY")
check "G12 a secret file in the build context's root is not in the image (.dockerignore; named COPYs only)" "$([ $rc = 0 ] && [ "$hits" = 0 ] && [ "$hist" = 0 ]; echo $?)" "build $rc, canary in the filesystem: $hits, in the history: $hist"

# ---------------- C: the container ----------------
cfg=$(docker image inspect "$IMG" --format '{{json .Config}}')
check "C1 the image runs as cgn:cgn with CMD cgn-entrypoint, production defaults, port 10000, and no secret in its config" \
  "$(echo "$cfg" | python3 -I -c '
import json,sys; c=json.load(sys.stdin); env=dict(e.split("=",1) for e in c["Env"])
ok = c["User"]=="cgn:cgn" and c["Cmd"]==["/usr/local/bin/cgn-entrypoint"] and env.get("NODE_ENV")=="production" and env.get("PORT")=="10000" and env.get("MCHEZO_LISTEN_HOST")=="0.0.0.0" and "10000/tcp" in (c.get("ExposedPorts") or {}) and not any(k in env for k in ("MCHEZO_BETA_ACCESS_CODE","CGN_BACKUP_RECIPIENT","MCHEZO_DATA_DIR","MCHEZO_PUBLIC_ORIGIN","MCHEZO_TRUST_PROXY"))
print("ok" if ok else c); sys.exit(0 if ok else 1)' >/dev/null; echo $?)" "$(echo "$cfg" | python3 -I -c 'import json,sys; c=json.load(sys.stdin); print(c["User"], c["Cmd"], sorted(e.split("=")[0] for e in c["Env"]))')"
inside=$(docker run --rm "$IMG" sh -c '
  echo "uid=$(id -u) gid=$(id -g) shell=$(getent passwd cgn | cut -d: -f7) home=$(getent passwd cgn | cut -d: -f6) pw=$(getent shadow cgn 2>/dev/null | cut -d: -f2)"
  echo "ssh=$(stat -c "%a %U" /home/cgn/.ssh) data=$(stat -c "%a %U" /var/data)"
  touch /app/x 2>/dev/null && echo "app=WRITABLE" || echo "app=read-only"
  echo "age=$(age --version) node=$(node -v)"
  for f in cgn-entrypoint cgn-backup cgn-authorize; do echo "$f=$(sha256sum /usr/local/bin/$f | cut -d" " -f1)"; done
  sh /usr/local/share/cgn/cgn-artifact-gate.sh installed /app | tail -1')
echo "$inside" | sed 's/^/    /'
want_s="$(cd "$SRC" && sha256sum cgn-entrypoint.sh | cut -d' ' -f1)"
check "C2 inside: uid 10001, bash, ~/.ssh 700, /var/data 700 cgn, /app read-only, age v1.2.1, Node v22.16.0, scripts = reviewed, INSTALLED_OK" \
  "$(echo "$inside" | grep -q '^uid=10001 gid=10001 shell=/bin/bash home=/home/cgn' && echo "$inside" | grep -q '^ssh=700 cgn data=700 cgn$' && echo "$inside" | grep -q '^app=read-only$' && echo "$inside" | grep -q '^age=v1.2.1 node=v22.16.0$' \
     && for f in cgn-entrypoint cgn-backup cgn-authorize; do echo "$inside" | grep -q "^$f=$(sed -n "s/^\([0-9a-f]\{64\}\)  $f.sh\$/\1/p" "$SRC/pins/scripts.sha256")\$" || exit 1; done \
     && (cd "$SRC" && sha256sum -c --status pins/scripts.sha256) && echo "$inside" | grep -q '^INSTALLED_OK'; echo $?)"

# Throwaway secrets for this run, in files (never printed): an access code and an age key pair standing in for the owner's.
od -An -N18 -tx1 /dev/urandom | tr -d ' \n' > "$SECRETS/code"; chmod 600 "$SECRETS/code"
age-keygen -o "$SECRETS/owner.key" 2>/dev/null; RECIP=$(age-keygen -y "$SECRETS/owner.key")
CODE=$(cat "$SECRETS/code")
( umask 077; printf 'MCHEZO_BETA_ACCESS_CODE=%s\n' "$CODE" > "$SECRETS/code.env" )
run_env=(-e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e MCHEZO_PUBLIC_ORIGIN=$ORIGIN -e MCHEZO_TRUST_PROXY=1 -e CGN_BACKUP_RECIPIENT=$RECIP --env-file "$SECRETS/code.env")
waitup() { for _ in $(seq 1 60); do curl -sf -o /dev/null "$BASE/health" && return 0; sleep 0.25; done; return 1; }
docker volume create cgn-vol1 >/dev/null
docker run -d --name cgn-c1 -p 127.0.0.1:$PORT:10000 -v cgn-vol1:/var/data "${run_env[@]}" "$IMG" >/dev/null
waitup; health=$(curl -s "$BASE/health")
games=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/games"); gamesbody=$(curl -s "$BASE/games")
procs=$(docker exec cgn-c1 sh -c 'echo "pid1=$(tr "\0" " " < /proc/1/cmdline)"; for p in /proc/[0-9]*; do c=$(tr "\0" " " < $p/cmdline 2>/dev/null); case "$c" in "node dist/server/serve.js"*) echo "server uid=$(awk "/^Uid:/{print \$2}" $p/status)";; esac; done')
check "C3 first install: health 200 with the pinned revision; the API refuses without the cookie (401); PID 1 is cgn-entrypoint; the server runs as uid 10001; the log says first install" \
  "$([ "$health" = '{"ok":true,"revision":"7097ac2bb062925bb296a129f4771f1e68fd522d"}' ] && [ "$games" = 401 ] && echo "$gamesbody" | grep -q BETA_ACCESS_REQUIRED && echo "$procs" | grep -q '^pid1=/bin/sh /usr/local/bin/cgn-entrypoint' && echo "$procs" | grep -q '^server uid=10001$' && docker logs cgn-c1 2>&1 | grep -q 'WARNING first install'; echo $?)" \
  "$health; /games $games; $(echo "$procs" | tr '\n' ';')"
auth=$(docker exec -i cgn-c1 cgn-authorize /var/data/cgn-w1 "$ORIGIN" 1 < "$SECRETS/code" 2>&1)
conf=$(docker exec cgn-c1 sh -c 'stat -c "%a %U" /var/data/cgn-authorized.conf; grep -c . /var/data/cgn-authorized.conf')
leak=$(docker exec cgn-c1 grep -c "$CODE" /var/data/cgn-authorized.conf)
check "C4 cgn-authorize over exec (as SSH would): AUTHORIZED, the record is 600 cgn, five lines, and the code isn't in it" \
  "$(echo "$auth" | grep -q '^AUTHORIZED data_dir=/var/data/cgn-w1 public_origin=https://cgn-w1.test trust_proxy=1' && [ "$(echo "$conf" | head -1)" = "600 cgn" ] && [ "$(echo "$conf" | tail -1)" = 5 ] && [ "$leak" = 0 ]; echo $?)" "$(echo "$auth" | head -1)"
enter=$(node "$HERE/api.mjs" enter "$BASE" "$SECRETS/code" "$SECRETS/cookie"); mk=$(node "$HERE/api.mjs" mkroom "$BASE" "$SECRETS/cookie" "$SECRETS/room")
check "C5 the gate signs in (303 + a cookie flagged HttpOnly, Secure, SameSite), and a room is created and its host joined" \
  "$(echo "$enter" | grep -q '"status":303,"cookie":true' && echo "$enter" | grep -q 'HttpOnly' && echo "$enter" | grep -q 'Secure' && echo "$enter" | grep -q 'SameSite' && echo "$mk" | grep -q '"create":201,"join":201'; echo $?)" "$enter $mk"
t0=$(date +%s%N); docker stop -t 30 cgn-c1 >/dev/null; t1=$(date +%s%N)
ec=$(docker inspect cgn-c1 --format '{{.State.ExitCode}}'); ms=$(( (t1 - t0) / 1000000 ))
check "C6 SIGTERM (docker stop, as Render's deploy or restart): the server closes, the entrypoint exits 0, well inside 30 s" \
  "$([ "$ec" = 0 ] && [ "$ms" -lt 10000 ] && docker logs cgn-c1 2>&1 | grep -q 'received SIGTERM, closing server' && docker logs cgn-c1 2>&1 | grep -q 'cgn-entrypoint: stopped on request'; echo $?)" "exit $ec after ${ms} ms"
docker start cgn-c1 >/dev/null; waitup; pj=$(node "$HERE/api.mjs" proj "$BASE" "$SECRETS/cookie" "$SECRETS/room")
check "C7 restart with the authorized configuration: the guard accepts it, and the room and its host are restored from the volume" \
  "$(docker logs cgn-c1 2>&1 | grep -q 'the environment matches the authorized configuration' && echo "$pj" | grep -q '"status":200' && echo "$pj" | grep -q '"Image check room"' && echo "$pj" | grep -q '"Ada"'; echo $?)" "$pj"

# C8: the rollback guard, each with the instance stopped and a fresh container on the same disk.
docker stop -t 30 cgn-c1 >/dev/null
guard() { # <id> <description> <env overrides...>
  local id=$1 desc=$2; shift 2
  out=$(timeout 60 docker run --rm -v cgn-vol1:/var/data "${run_env[@]}" "$@" "$IMG" 2>&1); local rc=$?
  check "$id $desc" "$([ $rc = 78 ] && echo "$out" | grep -q 'cgn-entrypoint: REFUSED' && ! echo "$out" | grep -q 'Christmas Game Night server on'; echo $?)" "exit $rc: $(echo "$out" | grep -o 'REFUSED: .*' | head -1 | cut -c1-120)"
}
guard C8a "a rollback to the old (other) data folder exits 78 and never starts the server" -e MCHEZO_DATA_DIR=/var/data/cgn-other
guard C8b "an older access code exits 78" -e MCHEZO_BETA_ACCESS_CODE=an-older-code-0000000000
guard C8c "another proxy count exits 78" -e MCHEZO_TRUST_PROXY=2
guard C8d "another public origin exits 78" -e MCHEZO_PUBLIC_ORIGIN=https://old.example
docker run --rm -v cgn-vol1:/var/data "$IMG" mv /var/data/cgn-authorized.conf /var/data/cgn-authorized.conf.aside
guard C8e "data present but the record removed exits 78"
docker run --rm -v cgn-vol1:/var/data "$IMG" mv /var/data/cgn-authorized.conf.aside /var/data/cgn-authorized.conf

# C9: a backup as from an SSH session without the service's environment, then the receipt off the "instance".
docker start cgn-c1 >/dev/null; waitup
pid_before=$(docker exec cgn-c1 cat /tmp/cgn/server.pid)
bk=$(docker exec cgn-c1 env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/cgn cgn-backup 2>&1); brc=$?
echo "$bk" | sed 's/^/    /'
waitup; pid_after=$(docker exec cgn-c1 cat /tmp/cgn/server.pid)
line=$(echo "$bk" | grep '^BACKUP_OK'); arch=$(echo "$line" | awk '{print $2}'); sum=$(echo "$line" | sed -n 's/.* sha256=\([0-9a-f]*\) .*/\1/p')
rm -rf "$WK/received"; mkdir -p "$WK/received/work"
docker cp "cgn-c1:$arch" "$WK/received/" >/dev/null 2>&1
rcpt=$(sh "$SRC/operator/cgn-receive.sh" "$WK/received/$(basename "$arch")" "$sum" "$SECRETS/owner.key" "$WK/received/work" 2>&1)
check "C9 cgn-backup with no service environment (read from the running server): BACKUP_OK, the server back with a new pid, and cgn-receive off the container gives RECEIPT_OK" \
  "$([ $brc = 0 ] && [ -n "$line" ] && [ "$pid_before" != "$pid_after" ] && echo "$rcpt" | grep -q '^RECEIPT_OK'; echo $?)" "$(echo "$rcpt" | tail -1 | sed "s#$WK#<work>#g")"
pj=$(node "$HERE/api.mjs" proj "$BASE" "$SECRETS/cookie" "$SECRETS/room")
check "C9 after the backup the room still answers" "$(echo "$pj" | grep -q '"status":200'; echo $?)" "$pj"

# C10: a disk mounted at /var/data owned by root (Render's mount ownership is unverified): fail closed.
rootdir=$(mktemp -d); chmod 755 "$rootdir"
out=$(timeout 60 docker run --rm --name cgn-c10 -v "$rootdir":/var/data "${run_env[@]}" "$IMG" 2>&1); rc=$?
echo "$out" | sed 's/^/    /' | head -8
check "C10 a root-owned /var/data: the server never serves, and the container exits non-zero with the reason (fail closed)" \
  "$([ $rc != 0 ] && [ $rc != 124 ] && ! echo "$out" | grep -q 'Christmas Game Night server on'; echo $?)" "exit $rc"
rm -rf "$rootdir"

# C11: the installed-release check catches a change on the instance.
t1=$(docker run --rm --user root "$IMG" sh -c 'mkdir /app/node_modules/evil && echo x > /app/node_modules/evil/index.js && sh /usr/local/share/cgn/cgn-artifact-gate.sh installed /app' 2>&1); r1=$?
t2=$(docker run --rm --user root "$IMG" sh -c 'echo "//x" >> /app/dist/server/serve.js && sh /usr/local/share/cgn/cgn-artifact-gate.sh installed /app' 2>&1); r2=$?
check "C11 'installed' refuses an extra package and a changed file" "$([ $r1 != 0 ] && echo "$t1" | grep -q 'outside ws and zod' && [ $r2 != 0 ] && echo "$t2" | grep -q 'inventory differs'; echo $?)" \
  "$(echo "$t1" | grep -o 'ARTIFACT_GATE_FAILED.*' | cut -c1-80) | $(echo "$t2" | grep -o 'ARTIFACT_GATE_FAILED.*' | cut -c1-60)"

leaks=$(docker logs cgn-c1 2>&1 | grep -c "$CODE")
check "the access code was never printed by the container" "$([ "$leaks" = 0 ]; echo $?)"
echo
echo "passed $PASS, failed $FAILN${FAILED:+: ${FAILED[*]}}"
if [ "$FAILN" = 0 ]; then echo "IMAGE CHECKS PASSED"; exit 0; else echo "IMAGE CHECKS FAILED"; exit 1; fi
