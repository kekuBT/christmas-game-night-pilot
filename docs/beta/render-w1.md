# W1 on Render: the way-in checks, step by step (Beta R4, handoff 6919813048)

**Status: prepared, not run.** No Render service exists yet.
- **What W1 is:** the first validation workload of [the proposal](beta-r4-hosting-proposal.md) ("The way in (ingress)", checks 1–4), on the paid service, with **throwaway** data and a **throwaway** access code.
- **The package and configuration:** [deploy/render/README.md](../../deploy/render/README.md).
- **The checker:** `scripts/beta/w1-check.mjs`. It was tested locally against the packaged image behind a Render-like proxy ([evidence](../evidence/beta-r4-render-package/README.md)). That proves the checker, not Render.

**Who does what:**
- **ChatGPT** operates the Render account, with the integration or the dashboard (the list of what needs the dashboard is in the package README).
- **The owner:**
  - types the throwaway access code into the dashboard;
  - provides the second device on another network;
  - decides every open window.
- **Claude** doesn't operate the account and has no Render credentials.
- **Nobody runs two operators at once**, and nobody creates a second service.

## Before W1 (each must hold, or W1 doesn't start)
1. **The account:** connected; a **new Hobby workspace** holding nothing else; a payment method; the build pipeline spend limit at its lowest.
2. **The deploy repository:** private, assembled as in the package README. `artifact/mchezo-7097ac2.tgz` has SHA-256 `a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131`.
3. **The service:** created exactly as in "The exact Render configuration":
   - Starter, 1 instance, the 1 GB disk at `/var/data`, health check `/health`, auto-deploy off, Docker command empty;
   - `MCHEZO_DATA_DIR=/var/data/cgn-w1`, `MCHEZO_TRUST_PROXY=1`;
   - the throwaway code, typed by the owner;
   - `MCHEZO_PUBLIC_ORIGIN` set to the exact `https://<service>.onrender.com` once Render shows it.
   - **Maintenance mode on** as soon as the service exists.
4. **SSH:** the operator's SSH key is on the account.
5. **The tester's machine:** a checkout of this branch with `npm ci` (Node 22). The throwaway code is in a file readable only by the tester (`chmod 600`), never in the repository, chat or GitHub.
6. **The second device:** on **another network** (mobile data, not the same Wi-Fi), with either the same checkout or just a browser.

## Step 0: the first deploy and the instance (evidence only, no window needed)
1. **The deploy log** must contain:
   - the gate's `ARTIFACT_GATE_OK archive=a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131 revision=7097ac2… inventory=fe6d74f8… deps="ws@8.22.1 zod@3.25.76"`;
   - the runtime stage's `INSTALLED_OK`;
   - `age: OK`.

   Any `ARTIFACT_GATE_FAILED` stops W1.
2. **The service log** must say `cgn-entrypoint: WARNING first install`, and the health check must pass.
3. **Over SSH** (`ssh <service>@ssh.<region>.render.com`), record the output of:
   ```
   id                                                     # uid=10001(cgn) gid=10001(cgn)
   sh /usr/local/share/cgn/cgn-artifact-gate.sh installed /app        # INSTALLED_OK ...
   stat -c '%a %U %G' /var/data; touch /var/data/.w1-write && rm /var/data/.w1-write && echo DISK_WRITABLE
   ```
   - **The disk check is unverified until here.** Render doesn't document who owns a newly mounted disk.
   - **If `/var/data` isn't writable by `cgn`, stop.** The server can't have started either: it fails closed, which was shown locally with a root-owned disk. Report it. A fix needs review; don't improvise one.
4. **Authorize the throwaway configuration, BEFORE any restart or redeploy.** Without it, the guard refuses to start once data exists (exit 78), as designed; this happened in the local self-test. Over SSH, with the code supplied on standard input and never echoed:
   ```
   cgn-authorize /var/data/cgn-w1 https://<service>.onrender.com 1     # then paste the code, Enter, Ctrl-D
   ```
   It prints `AUTHORIZED data_dir=/var/data/cgn-w1 public_origin=https://<service>.onrender.com trust_proxy=1 …`.

## The window
**Opening it:** the owner opens the window, and the operator turns maintenance mode **off** and records the time. Run the checks in this order: `forgery` locks this network's address out of the gate for 15 minutes, so it comes after the checks that sign in from it.

```
O="--origin https://<service>.onrender.com --evidence w1-evidence"
node scripts/beta/w1-check.mjs closed   $O                         # BEFORE the window, with maintenance on: PASSED
node scripts/beta/w1-check.mjs boundary $O --code-file ~/w1-code   # checks 1 and 2: PASSED
node scripts/beta/w1-check.mjs reconnect $O --code-file ~/w1-code  # then trigger a MANUAL DEPLOY: PASSED
node scripts/beta/w1-check.mjs reconnect $O --code-file ~/w1-code  # then the dashboard RESTART: PASSED
node scripts/beta/w1-check.mjs forgery  $O --trust-proxy 1         # check 3, not too high: PASSED
# on the second device, on another network, within 15 minutes:
node scripts/beta/w1-check.mjs separation $O --code-file ~/w1-code --trust-proxy 1   # check 3, not too low: PASSED
```

| Step | What it proves | If it fails |
|---|---|---|
| `closed` (before) | Maintenance mode refuses public traffic: 503 for `/health`, `/` and `/beta`, with no gate page and no cookie | Maintenance isn't on. Turn it on; don't open a window until this passes. |
| `boundary` | Checks 1 and 2:<ul><li>`http://` redirects to `https://`;</li><li>the certificate verifies;</li><li>`/health` names the revision;</li><li>security headers;</li><li>no cookie: gate page 401, API 401, WebSocket 401;</li><li>the cookie is `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, host-only;</li><li>four foreign Origins get 403 on the API, the code form and the WebSocket;</li><li>the right Origin gets a live `wss://` projection</li></ul> | Stop. Maintenance on. Record and report. |
| `reconnect` ×2 | Check 4. A room with a host, two players and a TV socket; every socket closes in the deploy (then in the restart), comes back, and sees the same room and players. Each deploy also shows the guard accepting the authorized configuration: the log says `the environment matches the authorized configuration`. | Stop. A refusal in the log (`REFUSED: …`, exit 78) means the environment no longer matches the record. Don't override the guard; find out why. |
| `forgery` | Fourteen wrong codes, each forging a different `X-Forwarded-For`. A 429 by the 11th attempt, and only 429s after it, proves forged entries aren't trusted: the count **is not too high**. | **No 429 at all:** the count is too high. Lower it (below). **`INCONCLUSIVE`:** this address was already limited; wait 15 minutes, or redeploy, and run it again. |
| `separation` | Another network's device gets in with the right code (303, then the API answers 200) while the tester's address is still locked: addresses are told apart, so the count **is not too low** | **429:** everyone shares one address; the count is too low. Raise it (below). |
| `closed` (after) | Maintenance is back on | Turn it on. |

**Without Node on the second device:** open `https://<service>.onrender.com` on a phone on mobile data and enter the throwaway code.
- **Pass:** the app loads.
- **Fail:** "Too many attempts" (429).
- Take a screenshot with the time, and note the network.

**Changing the proxy count** (only on evidence from the two tests):
1. Over SSH, `cgn-authorize /var/data/cgn-w1 https://<service>.onrender.com <N>` (the code on standard input).
2. Then set `MCHEZO_TRUST_PROXY=<N>` in the dashboard. That redeploys, and clears the in-memory limits.
3. Run `forgery` and `separation` again.

Record every value tried and both results. The local self-test shows why both tests are needed:
- with two proxy hops and a count of 1, `forgery` still passes and only `separation` fails;
- with one hop and a count of 2, `forgery` fails.

**Closing the window:**
- maintenance **on**, and the time recorded;
- `closed` again;
- a redeploy after `forgery`, so the tester's address isn't left locked for 15 minutes.

## What to record (the W1 report)
- **The `w1-evidence/*.json` files and each run's console output, verbatim:**
  - the checker records statuses, header names, timings and the forged addresses;
  - it redacts the code and the cookie;
  - **before sharing anything, search the files for the code; it must not appear.**
- **The deploy:** its ID, the commit of the deploy repository, and the deploy log's `ARTIFACT_GATE_OK`, `INSTALLED_OK` and `age: OK` lines.
- **Step 0's SSH output.**
- **The service's settings:** the environment variable **names** (never values), the final `MCHEZO_TRUST_PROXY`, and the instance type, disk, region and health check path, as the dashboard shows them.
- **The workspace's service list**, showing exactly one service.
- **The maintenance-mode times** (on, off, on).
- **Any failure:** what, when, the raw output, and the decision taken (stop, or the count change).

**W1 passes when** every step above passed with the final proxy count, and the count is recorded with both tests' results.
- **Only then does W2 start.** W2–W8 need their own windows.
- **Real family data needs W1–W8 and the go/no-go.**

## Still pending, and not part of W1
- **Backups:**
  - the backup destination (Google Drive is proposed for the encrypted archives; not selected, and no upload authorized);
  - the owner's `age` key pair, made and kept by the owner, with `CGN_BACKUP_RECIPIENT` set after that;
  - W5 (backup and receipt) and W6 (restore).
- **Real devices and networks:** W3 (Wi-Fi to mobile data) and W8 (iPhone and Android over the public URL).
- **The real access code:** after W1–W8, the owner rotates from the throwaway code to the real one. That means `cgn-authorize` with the new code, then the dashboard value, then a redeploy, so the throwaway code stops working.
