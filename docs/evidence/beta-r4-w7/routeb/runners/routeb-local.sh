#!/bin/bash
# Local validation of Route B in scripts/beta/w7-owner-preview.sh (handoff 6957990858). W7OP_LOCAL_TEST=1: this is NOT a
# Codespace, there is no noVNC desktop and no Firefox here.
# - The browser: headless Chromium plays the three profiles, through a copy of each profile's NSS database
#   (routeb-drive.cjs).
# - Firefox: a stand-in process (a PATH shim) tests only the tool's launch, record and scoped stop.
# Usage: bash routeb-local.sh <scratch dir holding r2/node (Node v22.16.0)> <clean checkout of the packet commit>
set -uo pipefail
SP=$1; REPO=$(cd "$2" && pwd); B=$SP/r4rb; W=$B/work; T="bash $REPO/scripts/beta/w7-owner-preview.sh"; D="node $REPO/docs/evidence/beta-r4-w7/routeb/runners/routeb-drive.cjs"
export PATH=$SP/r2/node/node-v22.16.0-linux-x64/bin:$PATH W7OP_LOCAL_TEST=1
ORIGIN=https://beta.localhost:3173; CUR=988c53558bbbcc1545fe0ca32882f30c1970794b; PREV=7097ac2bb062925bb296a129f4771f1e68fd522d
ok() { if [ "$1" = 0 ]; then echo "PASS $2"; else echo "FAIL $2"; BAD=1; fi; }
listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
BAD=0; rm -rf "$B"; mkdir -p "$W" "$B/state" "$B/shim" "$B/priv"; chmod 700 "$B/priv"
git clone -q --no-hardlinks "$REPO" "$W/src" && git -C "$W/src" checkout -q --detach "$(git -C "$REPO" rev-parse HEAD)"
echo "== route B local run, $(date -u +%FT%TZ); packet checkout $(git -C "$W/src" rev-parse HEAD); tool sha256 $(sha256sum "$REPO/scripts/beta/w7-owner-preview.sh" | cut -c1-16)"
# Foreign processes that must survive: a "proxy" with our script's name and a "Firefox" with another profile.
node -e 'require("http").createServer().listen(3175,"127.0.0.1")' render-like-proxy.mjs --foreign-sentinel & S1=$!
node -e 'setInterval(()=>{},1e6)' -- --profile "$B/other-task/profiles/host" & S2=$!
echo "-- 1 inspect (route B prerequisites: Firefox and the desktop are absent here)"; $T inspect | sed -n '/route B/,$p'
echo "-- 2 prepare (both releases)"; $T prepare "$W" 2>&1 | grep -v '^npm warn'; ok "${PIPESTATUS[0]}" "prepare: both inventories match"
grep -E '^(previous|current):' "$W/evidence/identity.txt"
NS=$(ls -d "$W"/w7op-* | head -1); cp "$NS/secret/code" "$B/priv/code"
echo "-- 3 route A's refusal is kept"; echo '{"verdict":"UNSUITABLE","ownOrigin":"http://localhost:3157"}' > "$W/evidence/probe-report.json"
out=$($T start "$W" current 2>&1); rc=$?; echo "$out" | tail -1; [ $rc != 0 ] && grep -q "verdict is UNSUITABLE" <<< "$out"; ok $? "start (route A) still refuses an UNSUITABLE probe"
mv "$W/evidence/probe-report.json" "$W/evidence/probe-report-test-unsuitable.json"
echo "-- 4 routeb: the session CA, the certificate and three profiles"; $T routeb "$W"; ok $? "routeb set up"
[ ! -e "$NS/tls/ca.key" ] && openssl verify -CAfile "$NS/tls/ca.pem" "$NS/tls/srv.pem" >/dev/null; ok $? "the CA key is gone after issuing one certificate, which verifies against the session CA"
openssl x509 -in "$NS/tls/srv.pem" -noout -ext subjectAltName | grep -q "DNS:beta.localhost"; ok $? "the certificate names exactly beta.localhost"
for r in host guest tv; do certutil -d "sql:$NS/profiles/$r" -L | grep -q "w7op session CA" && grep -q '"network.dns.localDomains", "beta.localhost"' "$NS/profiles/$r/user.js"; ok $? "the $r profile trusts the session CA and maps beta.localhost to loopback"
  mkdir -p "$B/state/home-$r/.pki/nssdb"; cp "$NS/profiles/$r/"{cert9.db,key4.db,pkcs11.txt} "$B/state/home-$r/.pki/nssdb/"; done
out=$($T routeb "$W" 2>&1); [ $? != 0 ] && grep -q "already set up" <<< "$out"; ok $? "a second routeb is refused"
echo "-- 5 the firefox command"; out=$(env -u DISPLAY PATH="$(echo "$PATH" | tr : '\n' | grep -v "$B/shim" | paste -sd:)" $T firefox "$W" host 2>&1); echo "$out" | tail -1
if command -v firefox-esr >/dev/null || command -v firefox >/dev/null; then echo "INFO a Firefox exists here; the refusal check is skipped"; else [ -n "$out" ] && grep -q "no firefox-esr or firefox" <<< "$out"; ok $? "without Firefox, the firefox command says so and installs nothing"; fi
printf '#!/bin/sh\nexec node -e "setInterval(()=>{},1e6)" -- "$@"\n' > "$B/shim/firefox-esr"; chmod +x "$B/shim/firefox-esr"
PATH=$B/shim:$PATH DISPLAY=:99 $T firefox "$W" host; ok $? "a stand-in Firefox starts on the host profile, recorded in the run folder"
fp=$(cat "$NS/run/firefox-host.pid"); tr '\0' ' ' < "/proc/$fp/cmdline" | grep -qF -- "--profile $NS/profiles/host"; ok $? "its command line names --profile <run folder>/profiles/host"
echo "-- 6 a failed start stops only this run's processes and keeps the evidence"
W7OP_TEST_BSTART_FAIL=proxy $T bstart "$W" current > "$B/failed-start.out" 2>&1; rc=$?; tail -2 "$B/failed-start.out"; [ $rc != 0 ]; ok $? "bstart fails when its proxy can't start"
! listening 3171 && ! listening 3173 && [ ! -f "$NS/run/server.pid" ] && [ ! -f "$NS/run/proxy.pid" ]; ok $? "the app and proxy it started are stopped, and their pid files removed"
kill -0 $S1 && kill -0 $S2 && kill -0 "$fp" && listening 3175; ok $? "the foreign proxy-named sentinel, the foreign Firefox stand-in and this run's Firefox stand-in are untouched"
ls "$NS"/run/server-current-*.log "$NS"/run/proxy-current-*.log >/dev/null && grep -q "bstart current FAILED" "$W/evidence/phases.log"; ok $? "the failed start's logs and its line in phases.log are kept"
echo "-- 7 phase A: current"; $T bstart "$W" current; ok $? "bstart current: /health through $ORIGIN (session CA verified) = 988c535"
out=$($T bstart "$W" previous 2>&1); [ $? != 0 ] && grep -q "already running" <<< "$out"; ok $? "a second writer is refused (bstart)"
out=$($T start "$W" previous 2>&1); [ $? != 0 ]; ok $? "a route A start is refused while route B runs"
$D control "$ORIGIN" "$B/state"; ok $? "control: a browser without the CA is refused"
$D phase "$ORIGIN" "$B/state" "$B/priv/code" $CUR; ok $? "current: three profiles sign in, Secure cookie, a room, a live WS each"
$D foreign "$ORIGIN" "$B/state" "$B/priv/code" "$NS/tls/ca.pem"; ok $? "current: foreign, null and spoofed Origins refused through the TLS origin"
W5_OWNER=w7op node "$REPO/scripts/beta/w5-seed.mjs" seed http://127.0.0.1:3171 "$B/priv"; ok $? "synthetic room seeded on current (finished game, approved entry, 3 acknowledged answers)"
echo "-- 8 rollback"; $T stop "$W"; ok $? "stop current (app and proxy)"
! listening 3171 && ! listening 3173 && ! listening 3174; ok $? "ports 3171, 3173 and 3174 are free after the stop"
$T backup "$W" before-rollback; ok $? "backup + verify by both releases"
$T compat "$W" before-rollback; ok $? "the previous release verifies, restores and checks the copy"
$T bstart "$W" previous; ok $? "bstart previous: /health = 7097ac2 behind the same origin"
$D phase "$ORIGIN" "$B/state" "$B/priv/code" $PREV; ok $? "previous: the same three profiles stay signed in, the same room, a live WS each"
W5_OWNER=w7op node "$REPO/scripts/beta/w5-seed.mjs" resume http://127.0.0.1:3171 "$B/priv"; ok $? "on previous: same seats, approved entry, answers kept; ONE new answer acknowledged"
echo "-- 9 return"; $T stop "$W"; ok $? "stop previous"
$T backup "$W" before-return; ok $? "backup before the return"
$T check "$W" current; ok $? "the current release's datatool check accepts what the previous one wrote"
$T bstart "$W" current; ok $? "bstart current again: /health = 988c535"
$D phase "$ORIGIN" "$B/state" "$B/priv/code" $CUR; ok $? "after the return: the same profiles, the same room, a live WS each"
W5_OWNER=w7op node "$REPO/scripts/beta/w6-check.mjs" live http://127.0.0.1:3171 "$B/priv" fallback; ok $? "after the return (read-only): seats work, the approved entry is there, and the action made on the previous release is present"
$T status "$W"
echo "-- 10 cleanup"; code=$(cat "$NS/secret/code"); $T cleanup "$W"; ok $? "cleanup"
[ ! -e "$NS" ] && grep -q "^retired " "$W/.w7op-owner"; ok $? "the run folder (code, TLS key, profiles, data, builds) is gone and the record is retired"
! kill -0 "$fp" 2>/dev/null; ok $? "this run's Firefox stand-in was stopped"
kill -0 $S1 && kill -0 $S2 && listening 3175; ok $? "the foreign sentinels are untouched"
! pgrep -f -- "$NS" >/dev/null; ok $? "no process names the run folder any more"
hits=$(grep -rlF -- "$code" "$W" "$B/failed-start.out" 2>/dev/null || true); [ -z "$hits" ]; ok $? "the code appears in no evidence, log or release file ($([ -z "$hits" ] && echo 0 || echo "$hits") files)"
mkdir -p "$B/evidence-kept" && cp -r "$W/evidence/." "$B/evidence-kept/" && cp "$B"/state/*.png "$B/evidence-kept/" 2>/dev/null
kill $S1 $S2 2>/dev/null; rm -rf "$B/priv" "$B/state"
echo "== verdict: $([ $BAD = 0 ] && echo 'ROUTE B LOCAL RUN PASSED' || echo 'ROUTE B LOCAL RUN FAILED') ($(date -u +%FT%TZ))"; exit $BAD
