# W7 over Route B: the operator recipe (handoff 6957990858)

**What this is:** the shortest reproducible way to run W7's browser journeys and its rollback and return.
- **Where:** the existing private Firefox ESR / noVNC desktop in the authorized Codespace. That desktop is Route B of [beta-r1-preview-route.md](beta-r1-preview-route.md), used for the independent audit in review 6904986723.
- **Who tests:** ChatGPT, hands-on, owning the Codespace and the browser. The owner takes part only if a platform access prompt actually requires it.
- **Why the app's origin stays genuine:** the browser runs inside the Codespace. Only the desktop's pixels are forwarded. The app sees Firefox's real `https://beta.localhost:3173` origin, end to end.

**What doesn't change:**
- **The phases and identities** are those of [w7-owner-test-packet.md §1](w7-owner-test-packet.md#1-what-is-served-phase-by-phase):
  - current `988c535`, an unaudited local pack, inventory `4f58b323…`;
  - previous `7097ac2`, whose inventory must equal the audited `fe6d74f8…`.
  - Together they are a **LOCAL SURROGATE pair.** W7 and B-W7-01 stay OPEN.
- **The checklists** are §4 (O1–O7) and §5 (P1–P3), with ChatGPT as the tester, three Firefox profiles as the three devices, and `bstart` in place of `start`.

**What is never done:**
- no public port, and no forwarding of the app or proxy ports;
- no security-model change, no certificate exception, no HTTP allowance;
- no container rebuild, new resource or deployment.

**Route A is untouched:** `start` still refuses without a passing probe. Its `UNSUITABLE` result stands (6957040472, 6957543881).

## 0. The prerequisites (read-only; report any that is missing, don't install)
```bash
W=/workspaces/w7-routeb-YYYYMMDD            # new and empty: never the main checkout, /workspaces/mchezo-w7-live.SXcNNq, or another test's folder
git clone --branch claude/beta-r4-w7-rollback --single-branch https://github.com/kekuBT/christmas-game-night-pilot "$W/src" \
  && git -C "$W/src" checkout --detach <the tested commit named in the report> \
  && bash "$W/src/scripts/beta/w7-owner-selftest.sh"   # about 1 min; must end PASSED
T="bash $W/src/scripts/beta/w7-owner-preview.sh"
$T inspect                                          # read-only, on its own; see "route B prerequisites"
```
**`inspect` must show:**
- `openssl` and `certutil` present (`certutil` comes in `libnss3-tools`);
- Firefox (`firefox-esr`) present;
- the desktop's VNC and noVNC processes running;
- ports 3171, 3173 and 3174 free.

**Any of those missing: STOP and report exactly which.** Nothing is installed by this recipe.

**In the Ports panel:**
- only the noVNC port is forwarded, and it shows **Private**;
- if 3171, 3173 or 3174 ever appears, use **Stop Forwarding Port** on it. That only narrows access.

**In Firefox:** `about:support` → Sandbox must show Seccomp-BPF **true** and content process sandboxing **true**, at a level above 0. If either is false, stop. This is Route B's existing precondition.

**Every copyable sequence below is ONE `&&` chain** (review 6958719378):
- the first failing step ends the chain with a non-zero exit, and nothing after it runs, `bstart` included;
- run `echo $?` after each chain, and go on only if it prints `0`;
- inspection steps (`inspect`, `status`, `pgrep`) stay on their own lines.

## 1. Build, set up the session CA, and start phase A (current)
```bash
$T prepare "$W" && $T routeb "$W" && $T bstart "$W" current
```
- **`prepare`** builds both releases, and fails unless both inventories match (`evidence/identity.txt`).
- **`routeb`** makes the session CA and one certificate for `beta.localhost`, deletes the CA key, and makes the host, guest and TV profiles trusting only that CA.
- **`bstart`** runs the app on 127.0.0.1:3171 and the TLS proxy on 127.0.0.1:3173. It waits for `/health` = `988c535` through the CA, then prints READY.
**In the desktop's terminal** (`DISPLAY` set to the desktop's display), one Firefox per device:
```bash
$T firefox "$W" host && $T firefox "$W" guest && $T firefox "$W" tv
```
**The revision:**
- open `https://beta.localhost:3173/health` in each profile;
- or run `$T status "$W"` in a terminal;
- or run `curl --cacert $W/w7op-*/tls/ca.pem --resolve beta.localhost:3173:127.0.0.1 https://beta.localhost:3173/health`.

**A certificate warning in any profile means STOP.** Never add an exception.

**Phone size (host and guest):** press Ctrl+Shift+M for Responsive Design Mode, choose 390 × 844 (or 320), and turn touch simulation on. The TV profile stays a wide window.
- This is a **desktop Firefox phone-size check.** It isn't mobile Safari or Android Chrome; those are W8's native devices.

**The access code** is in `$W/w7op-<token>/secret/code` (mode 600). Type it into each profile's gate. **Never paste it into GitHub, a log or a screenshot.**

## 2. The journeys and the rollback (packet §4 and §5)
- **Phase A:** O1–O7 in the three profiles. Then P1, the screenshots of seats, standings and the saved entry.
- **R1:**
  ```bash
  $T stop "$W" && $T backup "$W" before-rollback && $T compat "$W" before-rollback && $T bstart "$W" previous
  ```
  `/health` must be `7097ac2…`, behind the **same origin**. **Any failure stops the chain before `bstart`** (`echo $?` isn't `0`): STOP the rollback and report it.
- **P2:** the same three Firefox windows reconnect; reload once if needed. Each profile keeps its cookie and its seat, because the origin is the same. Check the seats, standings and entry against P1, then add `W7 rollback note`.
- **R2:**
  ```bash
  $T stop "$W" && $T backup "$W" before-return && $T check "$W" current && $T bstart "$W" current
  ```
  `/health` must be `988c535…`. Any failure stops the chain before `bstart`: STOP and report it.
- **P3:** as in P2, with `W7 rollback note` exactly once.

**Profile reuse:**
- keep the three Firefox windows open across every stop and start;
- if one closes, `$T firefox "$W" <role>` reopens the **same** profile, with its cookie and stored seat;
- a new session means a new work folder (and a new CA): never reuse a cleaned-up run.

**Every start and stop goes into `$W/evidence/phases.log`:** the revision through the CA, the data folder, both process ids, and the startup's `[restore] …` line. `routeb` also writes the session CA's SHA-256 fingerprint there.

## 3. Cleanup (scoped to this run)
```bash
$T cleanup "$W"
pgrep -af "$W/w7op-" || echo "nothing of this run is running"
```
`cleanup` does this, in order:
1. it stops this run's app and proxy, and the Firefox processes whose command line names **this run's** profiles;
2. it deletes the code, then the TLS key and certificates, then the profiles (and with them the CA trust), the data, the backups and the builds;
3. it retires the record.

**What it keeps:** `$W/evidence`, `src/` and the record. It refuses to remove anything while one of this run's Firefox windows is still running.

**Then stop the Codespace.** The $10 Codespaces cap and the machine type are unchanged.

## 4. What each part relies on
| Part | Guarantee | Where it's enforced |
|---|---|---|
| **The origin** | The app's public origin is exactly `https://beta.localhost:3173`, the browser's real origin. Its exact-origin check, the beta gate and the `Secure` cookie are unchanged. | the runtime (`src/server/access.ts`) |
| **TLS** | The certificate is issued for `beta.localhost` only, for 2 days, by a session CA whose key is deleted at setup. The CA is trusted only in this run's three profiles. | `routeb` |
| **Name resolution** | `beta.localhost` resolves to loopback (Firefox's own handling of `.localhost`, plus `network.dns.localDomains` in each profile's `user.js`). There is no `/etc/hosts` change. | `routeb` |
| **The listeners** | The app and the proxy listen on 127.0.0.1 only. Nothing is forwarded but the desktop. | `bstart` and the Ports panel check |
| **One writer** | A second `bstart` or `start` is refused while one runs. Backup, compat and check need the app stopped. | the tool |
| **A failed start** | Only this run's app and proxy are stopped. Their logs and the failure line in `phases.log` are kept. | `bstart` |
