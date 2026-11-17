#!/bin/bash
# Beta R4 W4 (review 6935165862): the restart and probe actions of the W4 rehearsal, in one file. It is SOURCED by
# scripts/beta/w4-rehearsal.sh (the harness) and by scripts/beta/w4-control-selftest.sh (the fault tests, with a mock
# docker on PATH), so the tests run the very code the harness runs. It is not runnable on its own.
#
# The caller sets RUNID, IMG, BACK (the backend port), ORIGIN, VOL (the data volume), PRIV (the private directory, with
# ctl/ and code.env) and EXPECT (the expected revision), and keeps cid (the current container), nseq and volumes.
#
# Every action fails closed, and every docker call is bounded (`timeout`):
#   stop          Graceful only when `docker stop` succeeded AND the container reads back as exited, with exit code 0,
#                 not OOM-killed. (`docker stop` also exits 0 when it had to SIGKILL after the grace period: exit 137,
#                 a failure here.)
#   start         Only a container that reads back as stopped; afterwards a NEW StartedAt, then readiness.
#   fresh(-empty) The old container must stop gracefully, then be removed (after its label reads back as this run's)
#                 and be confirmed gone, and no container may use the data volume. Only then does a replacement start.
#                 After any failure no replacement starts; the old container is left to the run's cleanup.
#   lock-probe    A second server inside the running container (the lock is per network namespace), bounded twice.
#   guard-probe   Never mounts the data volume. The authorization record (which the running server never writes) is
#                 copied as a tar stream out of the running container into a fixture volume owned by this run, used
#                 only by the probe's own container. That container must exit 78 with a REFUSED line before its
#                 deadline; a server starting, any other exit, or the deadline is a failure. Then its container and
#                 fixture volume are removed (labels read back first) and confirmed gone, and the data volume must
#                 have had exactly one user, the container under test, before and after.
# The run's lifecycle lives here too (review 6935889459), so the fault tests call the very functions the harness calls:
#   cleanup       removes only this run's containers (label read back first), volumes and private files, and its
#                 processes; a listing docker cannot give is noted, never read as "nothing left"
#   finish        the EXIT trap: cleanup twice, then the inventory. count_owned checks each docker query's status: a
#                 failed or timed-out query makes that inventory UNVERIFIED, and the run FAILS. Never read as 0.
# Test-only knobs, for the self-tests' negative controls:
#   W4_STOP_SECONDS   docker stop's grace period (default 30; 0 forces a SIGKILL)
#   W4_GUARD_SECONDS  the guard probe's deadline (default 60)
#   W4_GUARD_MODE     entrypoint (default) | hang (a guard that never answers) | serve (a server started without the guard)
W4_STOP_SECONDS=${W4_STOP_SECONDS:-30}
W4_GUARD_SECONDS=${W4_GUARD_SECONDS:-60}
W4_GUARD_MODE=${W4_GUARD_MODE:-entrypoint}
W4_DOCKER_SECONDS=${W4_DOCKER_SECONDS:-30}
STOP_STATE=""; REQ_T0=0

dk() { timeout "$W4_DOCKER_SECONDS" docker "$@"; }
label_of() { dk inspect -f '{{index .Config.Labels "w4.owner"}}' "$1" 2>/dev/null; }
vol_label_of() { dk volume inspect -f '{{index .Labels "w4.owner"}}' "$1" 2>/dev/null; }
json_str() { printf '%s' "$1" | tr '\n\r\t' '   ' | sed 's/\\/\\\\/g; s/"/'"'"'/g' | head -c 300; }
ms_since() { echo $(( $(date +%s%3N) - $1 )); }
answer() { printf '%s\n' "$2" > "$PRIV/ctl/done-$1"; }
fail_answer() {   # <seq> <action> <why>
  answer "$1" "$(printf '{"ok":false,"action":"%s","why":"%s","ms":%s}' "$2" "$(json_str "$3")" "$(ms_since "$REQ_T0")")"
  echo "   [restart] $2: FAILED: $3"
}

# Every container (running or not) using a volume, one full ID per line, sorted. Fails when docker cannot say.
volume_users() { local out; out=$(dk ps -aq --no-trunc --filter "volume=$1") || return 1; printf '%s\n' "$out" | sed '/^$/d' | sort; }
# 0 the container is confirmed gone; 1 it is still there; 2 docker could not say.
container_gone() { local out; out=$(dk ps -aq --no-trunc --filter "id=$1") || return 2; [ -z "$out" ]; }

# Remove one container of this run: only after its label reads back as this run's, and it must then be confirmed gone.
# Prints what happened; returns 0 only when the container was removed and is gone.
remove_container() {
  local id=$1 l g
  [ -n "$id" ] || { echo "no container to remove"; return 1; }
  l=$(label_of "$id")
  [ "$l" = "$RUNID" ] || { echo "container ${id:0:12} not removed (label '${l:-unreadable}')"; return 1; }
  dk rm -f -v "$id" >/dev/null 2>&1 || { echo "container ${id:0:12} (REMOVAL FAILED)"; return 1; }
  container_gone "$id"; g=$?
  [ "$g" = 0 ] || { echo "container ${id:0:12} (REMOVAL NOT CONFIRMED: $([ "$g" = 1 ] && echo 'still present' || echo 'docker could not say'))"; return 1; }
  echo "container ${id:0:12}"
}
# Remove one volume of this run, after its label reads back as this run's; it must then be confirmed gone.
remove_volume() {
  local v=$1 l out
  l=$(vol_label_of "$v")
  [ "$l" = "$RUNID" ] || { echo "volume $v not removed (label '${l:-unreadable}')"; return 1; }
  dk volume rm "$v" >/dev/null 2>&1 || { echo "volume $v (REMOVAL FAILED)"; return 1; }
  out=$(dk volume ls -q --filter "name=^$v\$") || { echo "volume $v (REMOVAL NOT CONFIRMED: docker could not say)"; return 1; }
  [ -z "$out" ] || { echo "volume $v (REMOVAL NOT CONFIRMED: still present)"; return 1; }
  volumes=$(printf ' %s ' $volumes | sed "s| $v | |g")
  echo "volume $v"
}

# How many of this run's containers or volumes are left: prints the count, or FAILS (status 1) when docker cannot say.
count_owned() {
  local out
  case "$1" in
    containers) out=$(dk ps -aq --no-trunc --filter "label=w4.owner=$RUNID" 2>/dev/null) || return 1 ;;
    volumes) out=$(dk volume ls -q --filter "label=w4.owner=$RUNID" 2>/dev/null) || return 1 ;;
    *) return 1 ;;
  esac
  printf '%s\n' "$out" | sed '/^$/d' | wc -l | tr -d ' '
}

# ---------------------------------------------------------------- the run's lifecycle (the harness's EXIT trap)
listeners() {
  awk -v want=" $HTTPS $HTTPP $BACK " 'FNR > 1 && $4 == "0A" { n = split($2, a, ":"); p = 0; h = toupper(a[n]);
    for (i = 1; i <= length(h); i++) p = p * 16 + index("0123456789ABCDEF", substr(h, i, 1)) - 1;
    if (index(want, " " p " ")) c++ } END { print c + 0 }' $(ls /proc/net/tcp /proc/net/tcp6 2>/dev/null)
}
owned_pids() {
  local f p
  for f in /proc/[0-9]*/environ; do
    p=${f#/proc/}; p=${p%/environ}
    [ "$p" = "$$" ] && continue
    grep -qsaF "W4_OWNER=$RUNID" "$f" 2>/dev/null && echo "$p"
  done
}
stop_pid() {
  local p=$1
  kill -0 "$p" 2>/dev/null || return 0
  kill -TERM "$p" 2>/dev/null
  for _ in $(seq 1 25); do kill -0 "$p" 2>/dev/null || return 0; sleep 0.2; done
  kill -KILL "$p" 2>/dev/null
}
cleanup() {
  cleanups=$((cleanups + 1))
  local did="" left p id v
  if [ -n "$driver_pid" ]; then stop_pid "$driver_pid"; wait "$driver_pid" 2>/dev/null; driver_pid=""; did="$did driver"; fi
  if [ -n "$proxy_pid" ]; then stop_pid "$proxy_pid"; wait "$proxy_pid" 2>/dev/null; proxy_pid=""; did="$did proxy"; fi
  left=$(owned_pids)
  if [ -n "$left" ]; then for p in $left; do stop_pid "$p"; done; did="$did $(echo $left | wc -w)-more-owned-process(es)"; fi
  # Every container of this run: the current one, and any other carrying this run's label (probes, a failed run).
  local listed
  listed=$(dk ps -aq --no-trunc --filter "label=w4.owner=$RUNID" 2>/dev/null) || { listed=""; did="$did (docker could not list this run's containers)"; }
  for id in $cid $listed; do
    case " $did " in *" ${id:0:12}"*) continue ;; esac
    dk inspect "$id" >/dev/null 2>&1 || continue
    did="$did $(remove_container "$id")"
  done
  cid=""
  listed=$(dk volume ls -q --filter "label=w4.owner=$RUNID" 2>/dev/null) || { listed=""; did="$did (docker could not list this run's volumes)"; }
  for v in $volumes $listed; do
    case " $did " in *" volume $v"*) continue ;; esac
    dk volume inspect "$v" >/dev/null 2>&1 || continue
    if [ "$(vol_label_of "$v")" = "$RUNID" ]; then dk volume rm "$v" >/dev/null 2>&1 && did="$did volume $v" || did="$did volume $v (REMOVAL FAILED)"; fi
  done
  volumes=""
  if [ -n "$PRIV" ] && [ -d "$PRIV" ]; then rm -rf -- "$PRIV"; did="$did private-files"; fi
  PRIV=""
  echo "   cleanup #$cleanups:${did:- nothing owned left to remove}"
}
finish() {
  local code=$? left_c left_v left_p left_l leak=0 cookie=0 privleft
  [ "$finished" = 1 ] && return
  finished=1
  trap - INT TERM
  echo "-- cleanup (run $RUNID)"
  cleanup
  cleanup
  # Review 6935889459: an inventory docker cannot give is UNVERIFIED, never 0, and the run fails.
  left_c=$(count_owned containers) || left_c="UNVERIFIED (docker could not list this run's containers)"
  left_v=$(count_owned volumes) || left_v="UNVERIFIED (docker could not list this run's volumes)"
  left_p=$(owned_pids | wc -w)
  if [ "$started" = 1 ]; then left_l=$(listeners); else left_l="not checked (this run started no listener)"; fi
  privleft=no; [ -n "$privpath" ] && [ -e "$privpath" ] && privleft=yes
  echo "   this run's containers left: $left_c; volumes left: $left_v; processes left: $left_p; listeners left on $HTTPS/$HTTPP/$BACK: $left_l; private files left: $privleft"
  if [ -n "$CODE" ]; then leak=$(grep -rlF -f <(printf '%s\n' "$CODE") "$LOG" "$PLOG" "$EVD" 2>/dev/null | wc -l); fi
  cookie=$(grep -rlE 'cgn_beta=[A-Za-z0-9_-]{8}' "$LOG" "$EVD" 2>/dev/null | wc -l)
  echo "   files holding the access code: $leak; files holding a beta cookie value: $cookie"
  if [ "$code" = 0 ] && [ "$rc" = 0 ] && [ "$left_c" = 0 ] && [ "$left_v" = 0 ] && [ "$left_p" = 0 ] && [ "$left_l" = 0 ] && [ "$privleft" = no ] && [ "$leak" = 0 ] && [ "$cookie" = 0 ]; then
    echo "W4 REHEARSAL HARNESS PASSED"; exit 0
  fi
  echo "W4 REHEARSAL HARNESS FAILED"
  if [ "$code" -gt 1 ]; then exit "$code"; fi
  exit 1
}

# One container of this run on the given volume and public origin; prints its ID, or nothing.
run_container() {
  local vol=$1 origin=$2 tag=$3
  timeout 60 docker run -d --name "w4-svc-$RUNID-$tag" --label "w4.owner=$RUNID" -p "127.0.0.1:$BACK:10000" -v "$vol:/var/data" \
    -e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e "MCHEZO_PUBLIC_ORIGIN=$origin" -e MCHEZO_TRUST_PROXY=1 --env-file "$PRIV/code.env" "$IMG" 2>"$PRIV/docker-run.err"
}
new_volume() {
  local v="w4-data-$RUNID-$1"
  dk volume create --label "w4.owner=$RUNID" "$v" >/dev/null 2>&1 || return 1
  volumes="$volumes $v"; echo "$v"
}
# Readiness and the pinned revision of the current container; prints "ok <revision>", or a reason.
ready_check() {
  local ok="" health rev
  for _ in $(seq 1 80); do
    [ "$(dk inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" = true ] || break
    curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:$BACK/health" && { ok=1; break; }
    sleep 0.25
  done
  [ -n "$ok" ] || { echo "never ready (state: $(dk inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' "$cid" 2>/dev/null))"; return 1; }
  health=$(curl -sf --max-time 5 "http://127.0.0.1:$BACK/health") || { echo "/health stopped answering"; return 1; }
  rev=$(printf '%s' "$health" | grep -o '"revision":"[0-9a-f]*"' | head -1 | cut -d'"' -f4)
  [ "$rev" = "$EXPECT" ] || { echo "revision '${rev:-none}', not the expected $EXPECT"; return 1; }
  [ "$(label_of "$cid")" = "$RUNID" ] || { echo "the container does not carry this run's label"; return 1; }
  echo "ok $rev"
}

# Stop a container gracefully. Sets STOP_STATE; returns 0 only for a verified graceful stop.
graceful_stop() {
  local id=$1 code st status exitc oom running
  timeout $((W4_STOP_SECONDS + 20)) docker stop -t "$W4_STOP_SECONDS" "$id" >/dev/null 2>&1; code=$?
  if ! st=$(dk inspect -f '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}} {{.State.Running}}' "$id" 2>/dev/null) || [ -z "$st" ]; then
    STOP_STATE="docker stop exit $code; the state could not be read back"; return 1
  fi
  read -r status exitc oom running <<< "$st"
  STOP_STATE="docker stop exit $code; state $status, exit code $exitc, OOM-killed $oom"
  [ "$code" = 0 ] && [ "$status" = exited ] && [ "$running" = false ] && [ "$exitc" = 0 ] && [ "$oom" = false ]
}

do_stop() {
  local seq=$1 ok=false
  graceful_stop "$cid" && ok=true
  answer "$seq" "$(printf '{"ok":%s,"action":"stop","container":"%s","graceful":%s,"state":"%s",%s"ms":%s}' "$ok" "${cid:0:12}" "$ok" "$(json_str "$STOP_STATE")" "$([ "$ok" = true ] || printf '"why":"not a verified graceful stop: %s",' "$(json_str "$STOP_STATE")")" "$(ms_since "$REQ_T0")")"
  echo "   [restart] stop: $STOP_STATE: $([ "$ok" = true ] && echo 'a verified graceful stop' || echo 'FAILED: not a verified graceful stop')"
}

do_start() {
  local seq=$1 st before after r
  st=$(dk inspect -f '{{.State.Status}} {{.State.Running}}' "$cid" 2>/dev/null) || st=""
  [ "$st" = "exited false" ] || { fail_answer "$seq" start "the container is not stopped (state '${st:-unreadable}'); it was not started"; return; }
  # Review 6935889459: a restart is verified only against a readable baseline. Before the start, a successful, non-empty
  # StartedAt (else the container is not started); after it, a successful, non-empty and DIFFERENT one.
  if ! before=$(dk inspect -f '{{.State.StartedAt}}' "$cid" 2>/dev/null) || [ -z "$before" ]; then
    fail_answer "$seq" start "the start time before the start could not be read ('${before:-}'); the container was not started"; return
  fi
  timeout 60 docker start "$cid" >/dev/null 2>&1 || { fail_answer "$seq" start "docker start failed"; return; }
  if ! after=$(dk inspect -f '{{.State.StartedAt}}' "$cid" 2>/dev/null) || [ -z "$after" ]; then
    fail_answer "$seq" start "the start time after the start could not be read ('${after:-}')"; return
  fi
  [ "$after" != "$before" ] || { fail_answer "$seq" start "no new start is recorded (StartedAt unchanged: $after)"; return; }
  r=$(ready_check) || { fail_answer "$seq" start "$r"; return; }
  answer "$seq" "$(printf '{"ok":true,"action":"start","container":"%s","restarted":true,"revision":"%s","ms":%s}' "${cid:0:12}" "${r#ok }" "$(ms_since "$REQ_T0")")"
  echo "   [restart] start (the same container, stopped before, a new start recorded): $(cat "$PRIV/ctl/done-$seq")"
}

do_fresh() {
  local seq=$1 action=$2 old=$cid v=$VOL rmo users x r
  graceful_stop "$old" || { fail_answer "$seq" "$action" "the old container did not stop gracefully ($STOP_STATE); it was left in place and no replacement was started"; return; }
  echo "   [restart] $action: the old container ${old:0:12} stopped gracefully ($STOP_STATE)"
  rmo=$(remove_container "$old") || { fail_answer "$seq" "$action" "the old container was not removed: $rmo; no replacement was started"; return; }
  cid=""
  echo "   [restart] $action: removed $rmo, confirmed gone"
  if [ "$action" = fresh-empty ]; then
    v=$(new_volume empty) || { fail_answer "$seq" "$action" "could not create the empty volume; no replacement was started"; return; }
    echo "   [restart] NEGATIVE CONTROL: the new container gets a NEW, EMPTY volume $v (data lost)"
  fi
  for x in $(printf '%s\n' "$VOL" "$v" | sort -u); do
    users=$(volume_users "$x") || { fail_answer "$seq" "$action" "docker could not list the containers using $x; no replacement was started"; return; }
    [ -z "$users" ] || { fail_answer "$seq" "$action" "the volume $x is still used by $(printf '%s ' $users | cut -c1-80); no replacement was started"; return; }
  done
  echo "   [restart] $action: no container uses the data volume; starting the replacement"
  nseq=$((nseq + 1))
  cid=$(run_container "$v" "$ORIGIN" "fresh$nseq") || { cid=""; fail_answer "$seq" "$action" "docker run failed: $(head -c 200 "$PRIV/docker-run.err")"; return; }
  r=$(ready_check) || { fail_answer "$seq" "$action" "$r"; return; }
  answer "$seq" "$(printf '{"ok":true,"action":"%s","container":"%s","oldContainer":"%s","graceful":true,"oldRemoved":true,"volumeFree":true,"volume":"%s","revision":"%s","ms":%s}' "$action" "${cid:0:12}" "${old:0:12}" "$v" "${r#ok }" "$(ms_since "$REQ_T0")")"
  echo "   [restart] $action: $(cat "$PRIV/ctl/done-$seq")"
}

do_lock_probe() {
  local seq=$1 out code probe ok=true
  out=$(timeout 45 docker exec -e PORT=10001 "$cid" sh -c 'cd /app && exec timeout 20 node dist/server/serve.js' 2>&1); code=$?
  probe=$(json_str "$out")
  [ "$code" = 124 ] && ok=false
  answer "$seq" "$(printf '{"ok":%s,"action":"lock-probe","exit":%s,"output":"%s","ms":%s}' "$ok" "$code" "$probe" "$(ms_since "$REQ_T0")")"
  echo "   [probe] lock-probe: a second server in the running container exited $code: $probe"
}

do_guard_probe() {
  local seq=$1 tag fix gid code=null wout wrc out="" started=false ok=true why="" before after mounts tdc tdv t1 tdms only=false
  local pre=() post=()
  nseq=$((nseq + 1)); tag="guard$nseq"
  case "$W4_GUARD_MODE" in
    entrypoint) ;;
    hang) pre=(--entrypoint sh); post=(-c 'sleep 3600') ;;
    serve) pre=(--entrypoint sh); post=(-c 'cd /app && exec node dist/server/serve.js') ;;
    *) fail_answer "$seq" guard-probe "unknown W4_GUARD_MODE '$W4_GUARD_MODE'"; return ;;
  esac
  before=$(volume_users "$VOL") || before="unreadable"
  # 1. The record, as a tar stream out of the RUNNING container: no other container mounts the data volume.
  if ! timeout 30 docker cp "$cid:/var/data/cgn-authorized.conf" - > "$PRIV/guard-record.tar" 2>/dev/null || [ ! -s "$PRIV/guard-record.tar" ]; then
    fail_answer "$seq" guard-probe "could not copy the authorization record out of the running container"; return
  fi
  # 2. The probe's own fixture volume and container (created, not started yet), mounting only that volume.
  fix=$(new_volume "$tag") || { fail_answer "$seq" guard-probe "could not create the probe's fixture volume"; return; }
  if ! gid=$(dk create --name "w4-svc-$RUNID-$tag" --label "w4.owner=$RUNID" -v "$fix:/var/data" \
      -e MCHEZO_DATA_DIR=/var/data/cgn-w1 -e "MCHEZO_PUBLIC_ORIGIN=https://other.invalid" -e MCHEZO_TRUST_PROXY=1 \
      --env-file "$PRIV/code.env" "${pre[@]}" "$IMG" "${post[@]}" 2>"$PRIV/guard-create.err") || [ -z "$gid" ]; then
    gid=$(dk ps -aq --no-trunc --filter "name=^w4-svc-$RUNID-$tag\$" 2>/dev/null | head -1)
    ok=false; why="docker create failed: $(head -c 160 "$PRIV/guard-create.err")"
  fi
  if [ "$ok" = true ]; then
    mounts=$(dk inspect -f '{{range .Mounts}}{{.Name}} {{end}}' "$gid" 2>/dev/null | sed 's/ *$//')
    [ "$mounts" = "$fix" ] || { ok=false; why="the probe's container mounts '${mounts:-unreadable}', not only its fixture volume"; }
  fi
  if [ "$ok" = true ]; then timeout 30 docker cp -a - "$gid:/var/data/" < "$PRIV/guard-record.tar" >/dev/null 2>&1 || { ok=false; why="could not copy the record into the fixture volume"; }; fi
  # 3. Start it, and wait for its exit within the deadline.
  if [ "$ok" = true ]; then
    if timeout 30 docker start "$gid" >/dev/null 2>&1; then
      wout=$(timeout "$W4_GUARD_SECONDS" docker wait "$gid" 2>/dev/null); wrc=$?
      if [ "$wrc" = 0 ] && [ -n "$wout" ]; then code=$wout; else ok=false; why="the guard did not exit within $W4_GUARD_SECONDS s"; fi
      out=$(dk logs "$gid" 2>&1 | tail -c 2000)
      if grep -q 'Listening on' <<< "$out"; then started=true; ok=false; why="${why:+$why; }a server STARTED: the guard did not refuse"; fi
      if [ "$code" != null ] && [ "$code" != 78 ]; then ok=false; why="${why:+$why; }exit $code, not 78"; fi
      if [ "$code" = 78 ] && ! grep -q 'cgn-entrypoint: REFUSED: ' <<< "$out"; then ok=false; why="${why:+$why; }exit 78 without a REFUSED line"; fi
    else ok=false; why="docker start of the probe failed"; fi
  fi
  # 4. Teardown, bounded: the probe's container and fixture volume, labels read back first, each confirmed gone.
  t1=$(date +%s%3N)
  if [ -n "$gid" ]; then tdc=$(remove_container "$gid") || { ok=false; why="${why:+$why; }teardown: $tdc"; }; else tdc="no container was created"; fi
  tdv=$(remove_volume "$fix") || { ok=false; why="${why:+$why; }teardown: $tdv"; }
  tdms=$(ms_since "$t1")
  after=$(volume_users "$VOL") || after="unreadable"
  if [ "$before" = "$cid" ] && [ "$after" = "$cid" ]; then only=true; else ok=false; why="${why:+$why; }the data volume's users were not only the container under test (before: $(printf '%s ' $before | cut -c1-60), after: $(printf '%s ' $after | cut -c1-60))"; fi
  answer "$seq" "$(printf '{"ok":%s,"action":"guard-probe","exit":%s,"output":"%s","serverStarted":%s,"mode":"%s","deadlineS":%s,"fixtureVolume":"%s","dataVolume":{"onlyTheWriterBefore":%s,"onlyTheWriterAfter":%s},"teardown":"%s","teardownMs":%s,"why":"%s","ms":%s}' \
    "$ok" "$code" "$(json_str "$out")" "$started" "$W4_GUARD_MODE" "$W4_GUARD_SECONDS" "$fix" "$([ "$before" = "$cid" ] && echo true || echo false)" "$([ "$after" = "$cid" ] && echo true || echo false)" \
    "$(json_str "$tdc; $tdv")" "$tdms" "$(json_str "$why")" "$(ms_since "$REQ_T0")")"
  rm -f "$PRIV/guard-record.tar"
  echo "   [probe] guard-probe ($W4_GUARD_MODE): its own container on the fixture volume $fix (the data volume never mounted); exit $code; server started: $started; $([ "$ok" = true ] && echo 'REFUSED as required' || echo "FAILED: $why")"
  echo "   [probe] guard-probe: teardown in ${tdms} ms: $tdc; $tdv; the data volume's only user before and after: $([ "$only" = true ] && echo 'the container under test' || echo 'NOT ONLY the container under test')"
}

# One request from the driver: "<seq> <action>" in ctl/req; the answer (one JSON line) goes to ctl/done-<seq>.
serve_request() {
  local seq action
  read -r seq action < "$PRIV/ctl/req" || return 0
  rm -f "$PRIV/ctl/req"
  REQ_T0=$(date +%s%3N)
  case "$action" in
    stop) do_stop "$seq" ;;
    start) do_start "$seq" ;;
    fresh|fresh-empty) do_fresh "$seq" "$action" ;;
    lock-probe) do_lock_probe "$seq" ;;
    guard-probe) do_guard_probe "$seq" ;;
    *) answer "$seq" '{"ok":false,"why":"unknown action"}' ;;
  esac
}
