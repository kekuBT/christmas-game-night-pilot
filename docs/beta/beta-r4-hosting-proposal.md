# Beta R4: independent cloud hosting, a proposal (handoffs 6916543972, 6916659110, 6916722530; reviews 6917441687, 6918277617, 6918922306)

**Planning only.** Nothing was created, deployed, configured or bought, and no runtime changed.
- **Bases:** docs `d554b800e51ae78a9ca205d12a2d6622eb7795f9`; pinned runtime `7097ac2bb062925bb296a129f4771f1e68fd522d`, with the audited archive's SHA-256 `a693c543…3a5131`.
- **Who decides:** ChatGPT owns the final route recommendation and the owner-facing cost approval. The owner decides.
- **Accepted and approved:** review 6919662222 accepted revision 5. The owner then approved this Render setup ("Proceed with that Render setup using my existing account", relayed in handoff 6919813048): Starter + a 1 GB disk, the $7.25/month baseline with overages disclosed, and the access-gated public URL. **Next, the package:** [deploy/render/](../../deploy/render/README.md) (Dockerfile, artifact gate, the reviewed scripts, the exact configuration, what the Render integration can't do) and the W1 steps in [render-w1.md](render-w1.md). Nothing is deployed yet; the backup destination and key, and the real-device steps, are still pending.
- **Current status** (2026-11-16; handoff 6919813048 as edited, review 6921505856). This bullet is the current status; the sections below keep revision 5's text, as history.
  - **The package:** [deploy/render/](../../deploy/render/README.md) was accepted within its scope (review 6921505856). **Not** a target-host or launch clearance.
  - **The account:** connected. The owner chose their **existing** workspace, which holds no services, databases or Key Value instances.
    - Its plan must still be verified as **Hobby**.
    - It must stay otherwise empty: that is the way-in control below.
  - **The off-provider destination:** selected by the owner (a private folder), with access and owner-only sharing verified by ChatGPT.
  - **Still pending:** the transfer, receipt and restore with throwaway data (W5, W6); the owner's `age` key pair; W1–W8; native devices; the go/no-go.
- **The requirement:** an independently hosted full website, with no dependency on a home computer. It supersedes the home-route (H1) prerequisite.
- **Revision 5 (this one), for review 6918922306:** a run killed outright after its files exist.
  - **The fix:** each run now records what it may create before creating it, and every process it starts carries its token. Reconciliation (automatic at the start of every backup, or `cgn-backup reconcile`) removes an abandoned run's recorded files once none of its processes lives. It never touches a running run or any path no record lists.
  - **Two corrections:** revision 4's "a failure leaves nothing behind" held only for failures the script itself observes; and the entrypoint now keeps the hold while a dead owner's copy still runs.
  - **Evidence:** [round5/](../evidence/beta-r4-hosting/backup-drill/round5/README.md).
- **Revision 4, for review 6918277617:** the backup's failure handling and the hold's ownership, repaired. That review reproduced both defects; the repair is in [round4/](../evidence/beta-r4-hosting/backup-drill/round4/README.md).
  - **Every step is checked, with no pipeline,** and a failure the script observes leaves no archive and no success behind. *(A run killed outright: see revision 5.)*
  - **The hold is exclusive and owned,** and a dead owner's hold is released within about a second.
  - **Success has two stages:** `BACKUP_OK` means the archive is on the Render disk; **`RECEIPT_OK`** (`cgn-receive`) means the independent copy off Render was received and verified. A deploy or restore requires `RECEIPT_OK`.
- **Revision 3, for review 6917441687:**
  - The backup now **stops the writer** and holds the data lock for the copy. Revision 2's "take it twice and compare" claim is withdrawn: matching lists can't rule out a change that was reverted between the copies.
  - Explicit rules for the way in (ingress) and for rollback, with an enforced rollback guard.
  - The baseline is separated from any spending cap.
  - A production-mode validation workload, for a later approval.
  - The proposed deploy-side slice and its local drill evidence: [backup-drill/](../evidence/beta-r4-hosting/backup-drill/README.md).
- **Earlier revisions:** revision 1 recommended Fly.io (kept as the cheaper alternative); revision 2 put Render first (`852b955`).

## Recommendation
**Route R: run the pinned server unchanged on one paid Render web service with one persistent disk, in a workspace of its own.** The evidence supports it, on the conditions under "Validation still needed" and "Approvals still needed".

| | |
|---|---|
| **Compute** | **Starter**: 512 MB, 0.5 CPU, **$7/month**. Measured locally: a peak of 95.5 MB, and well under 1 CPU-second per step, at 220 open sockets. |
| **Disk** | **1 GB** mounted at **`/var/data`**, **$0.25/month**. Game data in `MCHEZO_DATA_DIR=/var/data/cgn`; backups in `/var/data/backups`. A disk can grow later but never shrink. |
| **Workspace** | **A dedicated Hobby workspace** ($0/month plus compute), holding only this service. This is the way-in control below. *Revision 5 said "a new" one, and Render allows up to five Hobby workspaces. Current: the owner's existing, otherwise-empty workspace, with its Hobby plan still to verify.* |
| **Monthly baseline** | **$7.25** ($87 a year), before any tax (not checked). **It is not a cap:** see "Cost". |
| **Off-Render backup** | Encrypted to the owner's public key, then kept in the owner's private storage: **$0 extra**. |
| **Existing Render account** | *Revision 5: pending, not verified.* **Current:** connected on 2026-11-16. The workspace holds nothing; its plan and payment method are still to verify. |

**The other routes:**
- **Route F, Fly.io:** about $3.84 per 30 days at list price, $0 under Fly's under-$5 waiver with a card on file. The waiver is Fly's policy, not a free tier.
- **Supabase:** optional. No demonstrated requirement needs it.
- **Cloudflare Durable Objects:** a free-plan option, but a large port.

## Cost: the baseline is not a cap
| Item | Render's terms (pages read 2026-11-16) | This setup |
|---|---|---|
| Workspace | Hobby $0/month + compute; Pro $25/month + compute | $0 (a new Hobby workspace) |
| Compute | Starter $7/month, 512 MB, 0.5 CPU; the next size $25/month, 2 GB, 1 CPU | $7.00 |
| Persistent disk | $0.25 per GB per month | $0.25 |
| **Baseline** | | **$7.25/month** |
| Outbound bandwidth | 5 GB a month on Hobby, then $0.15 per GB, **with no cap** | Expected $0: about 2.2 MB per device's first visit, so about 2,300 first visits a month. WebSocket traffic isn't measured yet. |
| Build (pipeline) minutes | 500 a month on Hobby; more are bought automatically unless a **pipeline spend limit** stops them, after which builds stop for the month | $0, with that limit set as low as Render allows (whether $0 is allowed is to be checked) |
| Custom domains | 2 included, then $0.25 per domain per month | $0 |
| Disk snapshots | Daily, kept 7 days; no separate price on the pages read | Expected $0; to confirm on the billing page |
| Not used | Dedicated IPs ($100/month), inbound IP rules for web services (Scale plan only), Render Postgres | — |

**What can raise the bill:**
- **Render has no overall spending cap.** The only limit is the one on build minutes. Bandwidth past 5 GB is billed without limit, at $0.15 per GB.
- **The existing workspace's plan matters:** if this service went into a Pro workspace, add $25/month (so $32.25). A separate Hobby workspace avoids that.
- **A bigger instance** ($25/month), only if the real instance shows CPU pressure. That needs a new approval.

## The challenge, requirement by requirement
| Requirement | What the code does (at `7097ac2`) | What Render says | Verdict |
|---|---|---|---|
| **Data survives deploys and restarts** | Rooms and Memory Books live under `MCHEZO_DATA_DIR`, which production requires to be absolute and outside the release (`serve.ts` lines 53–57) | Only the disk's mount path survives deploys and restarts. Free services can't attach a disk. | **Fits on a paid instance only.** |
| **One writer** | `DataDirLock` stops a second process on the same machine (`serve.ts` lines 95–102) | A disk belongs to one instance; a deploy stops the old instance before starting the new one | **Fits.** |
| **The way in** | With `MCHEZO_TRUST_PROXY` set, production requires `MCHEZO_LISTEN_HOST`, so that only the proxy reaches the server (`serve.ts` line 73) | Bind `0.0.0.0`, port 10000. Services in the **same workspace and region** share a private network; on Hobby it can't be blocked (Pro and up can). | **Fits, with a dedicated workspace.** Below. |
| **Shutdown** | `SIGTERM` closes the server, then releases the lock (`serve.ts` lines 141–150) | `SIGTERM`, then `SIGKILL` after 30 s; a disk-backed service can't change the delay | **Fits.** Measured locally: the entrypoint passes `SIGTERM` on and the server stops cleanly. |
| **WebSockets** | Pings every 15 s; clients reconnect | No maximum duration; deploys and maintenance interrupt connections | **Fits.** The drill: all 12 sockets dropped at the stop, reconnected and were open at the end. |
| **Backups** | `datatool backup` holds the data lock, so it refuses while a server runs (`datatool.ts` lines 11–15, 96–107) | The disk is reachable only from the running instance (not from builds, pre-deploy commands or one-off jobs); SSH works on paid web services; maintenance mode keeps the service up and reachable by SSH, but refuses public traffic | **Fits, with a small deploy-side slice:** a container entrypoint that keeps the instance up while the server is stopped for the copy. Below. |
| **Rollback** | — | A rollback redeploys an old build **with that deploy's environment values**; disks are never rolled back | **Fits, with rules and an enforced guard.** Below. |

## Backups: the writer is stopped, and the stop is enforced
**The rule.** A backup is taken only with **no writer at all**:
1. **The server process has exited.** Its `SIGTERM` handler runs between event-loop turns, and every save is synchronous inside a turn, so no save is half done.
2. **`datatool backup` holds the data lock for the whole copy.** It is run *without* `--allow-running`, so it refuses if any process holds the lock, and no server can start until it ends.
3. **The manifest must record `serverWasRunning: false`.**

The copy is therefore one state of the folder. Nothing is inferred from comparing copies.

**How, on Render: the proposed deploy-side slice** (short shell scripts, not in the runtime: three in the image, and `cgn-receive` where the copy is received; [the scripts](../evidence/beta-r4-hosting/backup-drill/README.md#the-proposed-deploy-side-slice)):
- **`cgn-entrypoint`** is the container's first process. It runs the unchanged server, passes Render's `SIGTERM` on to it, and keeps the instance up while a backup holds the server stopped.
  - **The hold** is a folder in an ephemeral folder, so an instance restart always clears it.
  - **A dead owner:** if the hold's owner is gone (the backup killed, the SSH session lost), the entrypoint releases the hold once no process the owner started still runs. That means within about a second, or, if its copy still runs, once the copy ends (bounded by the copy's 30 s limit). Then the server starts again. The killed run's files are left for reconciliation.
  - **A server exit without a hold** ends the container, so Render restarts the instance as it would without the script.
- **`cgn-backup`**, run over SSH between sessions with **maintenance mode on** (public traffic refused):
  - **Checks first, before anything stops:** the owner's public key, the folders and the tools.
  - **Takes the hold atomically and owns it.** `mkdir` fails if any hold exists; the hold records this run's pid and a random token. Only its owner releases it, on every exit path including hang-up, interrupt and terminate. The backup's names are chosen and checked only while holding, so a run never removes another run's files.
  - **Then the backup:** `SIGTERM`, wait (10 s limit), copy under the lock (30 s limit), `datatool verify`, the manifest check. Then release the hold; the entrypoint restarts the server.
  - **Then, reading only the copy:** a checksum list over the whole copy; a tar written to a file and listed back; encryption to the owner's `age` public key; the hash; publish by rename. **Every step's own status is checked, with no pipeline.**
  - **It prints `BACKUP_OK <file> sha256=…` only after all of that.** On any failure the script observes, everything the run created in the backup folder is removed.
  - **Before creating anything, it records the exact paths it may create,** in a run record in the backup folder, with its token and pid. Every process it starts carries the token. The record goes away with the run's own cleanup, or just before `BACKUP_OK`.
  - **It reconciles first.** At the start of every backup (or alone, as `cgn-backup reconcile`), still under the hold, a record whose run has no live process is abandoned: exactly its listed paths are removed. A run with a live process, and any path no record lists, are left alone.
- **`cgn-receive`**, where the copy is received off Render (the owner's device). It prints **`RECEIPT_OK`** only if all of these hold:
  - the archive's SHA-256 is the one in the `BACKUP_OK` line;
  - it decrypts with the owner's key;
  - every file matches the checksum list, and the list covers the whole copy.
- **Measured locally:** the server was down for **about 1 s**, against Render's 15 s (traffic paused) and 60 s (instance restarted) health-check limits.

**The fail-closed rules:**
- **Two stages.** `BACKUP_OK` only says the archive is complete on the Render disk. **A deploy, a restore and a data-folder change each require `RECEIPT_OK` for a backup from the same window.** That proves the independent copy exists off Render and is readable.
- **The expected hash** given to `cgn-receive` comes from the `BACKUP_OK` line seen in the SSH session, never from the archive's folder.
- **A failure before the stop** changes nothing.
- **A failure the script observes, after the stop or after the release** (the copy, verify, the archive, the encryption, the hash, the publish, or a `HUP`, `INT` or `TERM`): the hold is released (if still held), and everything the run created is removed: no archive, no `.part`, no checksum list, no copy. The server restarts on the same, untouched data.
- **A second backup** is refused while one holds, and can never release another run's hold.
- **An abandoned session:**
  - **A hang-up or interrupt** releases the hold at once, through the script's own trap.
  - **A run killed outright can't clean up after itself.** Its hold is released once none of its processes lives: within about a second, or after its still-running copy ends (bounded by the copy's time limit). The server then starts.
  - **Its files stay** (the copy, and from the encryption stage on also the checksum list, the temporary plaintext tar and a partial archive) **until reconciliation removes exactly the paths its record lists.** That is automatic at the start of the next backup, or `cgn-backup reconcile`.
  - **No promotion happens first:** every deploy, restore or data-folder change needs a fresh backup's `RECEIPT_OK`, and every backup reconciles before anything else. The plaintext left meanwhile is as private as the data folder beside it.
- **A server that doesn't stop within 10 s:** no backup, and the hold is released. The pending `SIGTERM` then stops the server, and the platform restarts the instance.
- **An instance restart mid-backup** clears the hold, and the server starts on boot. Nothing from the interrupted run is ever verified.

**Where the backups live, and who can read them:**

| | |
|---|---|
| **Encryption** | `age` to the **owner's public key**, which is not a secret and is set as `CGN_BACKUP_RECIPIENT`. The private key stays with the owner, offline, and **is never on Render**. A stolen archive is unreadable. |
| **Off Render** | After each night: `scp -s` the `.tar.age` file to an administrative device, then upload it to the **owner's existing private cloud storage**. The laptop is only a transfer device: the game service never depends on it. |
| **Access** | The owner's storage account, with two-factor sign-in. The operator gets SSH to the instance only during approved windows, and never the private key. |
| **Retention** | Off Render: every pre-deploy and pre-restore backup for 90 days, plus the last 8 game-night backups. On the disk: the last 3 plaintext copies (as private as the data itself), deleted only after their archive is confirmed off Render. Render's own daily snapshots (7 days) are an extra layer inside Render, not the independent one. |
| **Restore** | **From the received copy only, after its `RECEIPT_OK`:**<ul><li>upload it with `scp -s`;</li><li>`datatool verify` it on the instance;</li><li>`datatool restore` it into a **new** folder, then `datatool check`;</li><li>`cgn-authorize` the new folder, then change `MCHEZO_DATA_DIR` (which redeploys).</li></ul>The old folder is kept. |
| **Cost** | $0 extra, with storage the owner already has. Each archive is a few KB per room. |

**Evidence: one drill on disposable local data** ([backup-drill/](../evidence/beta-r4-hosting/backup-drill/README.md)).
- **What ran:** the unchanged server in **production mode** (access gate, public origin), under the proposed scripts.
- **The live load:** 2 rooms of 5 players and a TV each answered Trivia over HTTP and WebSocket, while hosts saved Memory Book notes. **Rooms and Memory Books both changed** on both sides of the backup.
- **What it showed:**
  - The copy equals the data folder as it was once the server had stopped, every file's SHA-256 included.
  - Every answer and note acknowledged before the stop is in it; nothing first sent after the restart is.
  - Every answer and note was acknowledged and saved by the end; every socket reconnected.
  - The encrypted archive hides the contents, and another key can't open it.
  - The restore came back with each room and its host's saved session.
- **The failure cases:**
  - a backup refused while a server runs;
  - a server refused while the lock is held;
  - a preflight failure that stops nothing;
  - a copy that times out after the stop;
  - a server that doesn't stop.
- **The checker's own negatives:** three deliberately damaged backups, each caught.
- **The final run on the committed files:** see the evidence README.

**Round 5's evidence** ([round5/](../evidence/beta-r4-hosting/backup-drill/round5/README.md)):
- **The review's case, reproduced on the revision 4 scripts.** A run killed at a copy checkpoint (a room file and a manifest written) or at an encryption checkpoint (plaintext tar and partial archive written) gave no `BACKUP_OK`, but its files survived, and nothing could remove them.
- **On the repaired scripts:**
  - **killed at each checkpoint** (the shell alone, or its whole process group): reconciliation is refused or deferred while the copy or encryption still lives, then removes exactly that run's files;
  - **the server** comes back within the bound;
  - **a neighbouring successful backup** survives byte for byte;
  - **a healthy backup** still encrypting is reported as running, and left alone.

**Round 4's evidence** ([round4/](../evidence/beta-r4-hosting/backup-drill/round4/README.md)):
- **The review's defects, reproduced on the revision 3 scripts:**
  - a failing archiver behind a working encryptor gave `BACKUP_OK`, and so did a failed hash;
  - one run's exit released another run's hold, and a server started mid-backup;
  - an abandoned or hung-up session left the server down.
- **The focused negatives** (failures injected by command stubs), on the repaired scripts:
  - a failed archiver, encryptor, hash or publish, each leaving nothing behind;
  - two backups started at once (5 rounds), a second backup while one holds, and a second backup after a release but during encryption;
  - the same backup stamp twice;
  - a killed session and a hung-up session, each back in about 1 s.
- **The full drill** now receives the archive in a separate folder with `cgn-receive` (`RECEIPT_OK`), refuses four bad receipts, and restores **the received copy**.

## The way in (ingress)
- **A dedicated workspace.** Render puts services of the same workspace and region on one private network. A Hobby workspace can't block that traffic (Pro and up can).
  - **So the service's Hobby workspace holds no other service.** Then nothing but Render's proxy can reach `0.0.0.0:10000`. That is the owner's existing, otherwise-empty workspace (revision 5 said "a new" one).
  - **The check, before every deploy and in validation:** the workspace lists exactly this one service.
  - **This replaces the loopback rule B-07** for this route, for your review.
- **What `MCHEZO_TRUST_PROXY` controls** (`access.ts` lines 13–14, 66–73): only the client address that the wrong-code limits count against. It doesn't affect HTTPS or authorization.
  - **The limits:** the access gate allows 10 failures per 15 minutes per address; recovery codes allow 20 per address, 5 per address per room and 30 per room.
  - **Too few hops:** everyone shares Render's proxy address, so anyone's 10 wrong codes lock the whole family out for 15 minutes.
  - **Too many hops:** a client can forge `X-Forwarded-For` entries to dodge the limits.
- **HTTPS:** Render terminates TLS. The beta cookie is `Secure` because `MCHEZO_PUBLIC_ORIGIN` is `https://…` (`access.ts` line 97), not because of any forwarded header.
- **An approved access-controlled route for the checks.** Render's inbound IP rules for web services need the Scale plan, so they aren't available. Instead:
  - **maintenance mode on** outside approved check windows, so every public request gets a 503;
  - **during a window:** the `onrender.com` address behind the app's own access gate, with a **throwaway access code** and a **throwaway data folder**.
- **Same-path checks, on the paid service itself, with throwaway data** (a separate free echo service can't prove this boundary):
  1. **HTTP and WebSocket boundary:**
     - without the cookie: the API gets 401 and the WebSocket handshake is refused;
     - a foreign `Origin` gets 403 on the API, the code form and the handshake;
     - with the cookie and the right origin: a live projection arrives over `wss://`.
  2. **HTTPS:** `http://` redirects to `https://`, and the cookie is `Secure`, `HttpOnly` and `SameSite=Lax`.
  3. **Client-address trust:** the hop count is settled by two tests on the real path, starting from 1 and changing it only on evidence (each change is a redeploy, which also clears the in-memory limits):
     - **Forgery:** 10 wrong codes, each with a different forged `X-Forwarded-For`, must make the 11th attempt get 429. If not, the count is too high.
     - **Separation:** right after that, a second device on another network (a phone on mobile data) enters the right code and gets in. If it gets 429, the count is too low.
  4. **Reconnection:** a manual deploy and a dashboard restart, each with an open room: every client reconnects and the room is restored.

## Rollback: rules, and a guard that fails closed
**The hazard.** Render's one-click rollback brings back the old deploy's **environment values** but never the disk. A rollback past a configuration change could therefore restart with:
- an **old access code** (for example, one rotated after a leak);
- an **old data folder** (for example, the throwaway validation folder), hiding the family's data and writing elsewhere;
- an **old proxy count or origin.**

**The rules:**
1. **Don't use the one-click rollback.** Roll back by a normal manual deploy of the previous audited release from the deploy repository (a revert commit). It runs the same artifact gate and uses the service's **current** environment values.
2. **Before any deploy, rollback or restore:** a backup from this window with `BACKUP_OK` **and its `RECEIPT_OK`**, with maintenance mode on.
3. **After any deploy:**
   - `/health` reports the expected revision;
   - the startup log names the intended data folder and the number of rooms restored;
   - the authorized access code opens the gate, and an old code doesn't;
   - a known room and session work;
   - then maintenance mode goes off.

**The guard** (`cgn-entrypoint`, with `cgn-authorize`):
- **The record:** `cgn-authorize` writes the configuration the owner approved to the disk. That is the data folder, the public origin, the proxy count, and a salted hash of the access code (never the code).
- **Before starting anything,** the entrypoint compares the environment with that record. A mismatch exits 78, and the server never starts.
- **So a one-click rollback to old values fails closed** instead of serving the wrong folder or code. The disk, and so the record, isn't rolled back.
- **Data present but no record** also refuses. A first install (no data yet) starts, and says so.
- **A planned change** (validation folder to the real folder, a new code): `cgn-authorize` the new values first, then save the environment, which redeploys.
- **The drill** exercised each refusal: the previous data folder, an older access code, another proxy count, and data with no record.

## The configuration that changes (no runtime code)
| Setting | Today (home route) | On Render |
|---|---|---|
| Process manager and proxy | systemd and Caddy | One Render web service (Docker) with `cgn-entrypoint` as its command; Render's proxy for TLS |
| `MCHEZO_LISTEN_HOST` / `PORT` | `127.0.0.1` / the unit's port | `0.0.0.0` / `10000`, in a dedicated workspace. **Replaces B-07, for review.** |
| `MCHEZO_TRUST_PROXY` | Counted at V2 with `nc` | Settled by the forgery and separation tests above |
| `MCHEZO_DATA_DIR` | `/var/lib/…` | A throwaway folder for validation, then `/var/data/cgn`, each authorized first |
| `MCHEZO_PUBLIC_ORIGIN` | The LAN name | `https://<service>.onrender.com`, or the owner's domain |
| Access code | `/etc/christmas-game-night/env` | A Render secret environment variable, set by the owner; never in GitHub |
| `CGN_BACKUP_RECIPIENT` | — | The owner's `age` public key (not a secret) |
| The image | — | Built from the audited archive. The artifact gate (the full SHA-256, the revision, the inventory, `npm ci`, exactly `ws zod`) runs as the first build steps. Node 22.16.0 pinned by digest; `age` installed; a non-root user with a shell and `~/.ssh`, as Render's SSH requires. |
| Exposure | LAN only | A public URL behind the access gate, with maintenance mode outside approved windows. **A new owner decision.** |

## The production-mode validation workload (for a later approval; none run)
All of it runs on the paid service, in production mode, with a throwaway access code and data folder, inside approved windows:

| # | Workload | Pass when |
|---|---|---|
| W1 | The way-in checks 1–4 above | All pass; the proxy count is recorded with the two tests' results |
| W2 | **Live play at family scale:** 2 rooms × 10 phones + a TV each, driven by the drill's load script pointed at `https://`. A full Trivia game with every phone answering, then a **drawing** game (Draw & Guess or Team Draw) with strokes, plus Memory Book saves. | Every answer, stroke and save acknowledged and saved. Render's memory and CPU graphs stay under 50% of Starter. Acknowledgement times recorded (median and 95th percentile). |
| W3 | **Reconnect:** phones backgrounded and foregrounded; a Wi-Fi to mobile data switch | Every client back in its seat, with no lost answer |
| W4 | **Restart:** a manual deploy, and a dashboard restart, each mid-game | The room restored; acknowledged answers kept; sockets back |
| W5 | **Backup:** `cgn-backup` during a validation night, then `scp -s` off Render to the owner's storage, fetch it back, then `cgn-receive` | `BACKUP_OK`, then `RECEIPT_OK` on the owner's device; the stop under 10 s |
| W6 | **Restore of the received copy:** upload, `verify`, into a new folder, then `check`, authorize, switch, redeploy. Separately, a Render snapshot restore on throwaway data. | The rooms and books back; the old folder kept |
| W7 | **Rollback:** a revert-commit deploy of the previous release, then the acceptance checks. And one deliberate one-click rollback across a configuration change, to see the guard refuse it. | The previous release serves the current configuration; the one-click rollback fails closed |
| W8 | **Native devices:** an iPhone (Safari) and an Android phone (Chrome), P1–P8 from REAL_DEVICE_TESTING.md over the public URL. That covers the gate, a QR join, play, lock and unlock, Home Screen install, and a Memory Book export. | No Blocker |

## Approvals still needed (as listed at revision 5), with their current status
**Current status** (2026-11-16):
1. **Approved:** the owner's ruling, handoff 6919813048.
2. **Partly done:** the account is connected, and the existing workspace was chosen. Its Hobby plan, the payment method and the region are still to confirm.
3. **Approved.**
4. **Accepted within scope:** review 6921505856. The private deploy repository is ChatGPT's.
5. **Partly done:** the destination is selected and its access verified. The owner's key pair, and the transfer, receipt and restore, are pending.
6. **Pending.**

1. **The route and the spend:** Render, a new Hobby workspace, Starter and a 1 GB disk, **$7.25/month baseline with uncapped bandwidth overage.** This needs an explicit ruling against the "$0 / no paid resources" rule. ChatGPT presents it to the owner.
2. **The account:** the existing Render account (pending), a payment method, a region, and `onrender.com` or an own domain.
3. **A public URL behind the access gate,** with maintenance mode outside approved windows. This replaces "no public exposure".
4. **The deploy-side slice:**
   - the three image scripts and the Dockerfile in a private deploy repository, with the audited archive, plus `cgn-receive` for the receiving device;
   - review of the `0.0.0.0`-in-a-dedicated-workspace rule in place of B-07.
5. **The off-Render destination:** which of the owner's storage services; the owner's `age` key pair, made and kept by the owner; the retention above.
6. **Execution windows** for W1–W8, each with throwaway data. Real data comes only after W1–W8 pass and the go/no-go.

## Sources
**Render** (official pages read from this session at the logged times, after the owner allowed `render.com`; hashes in [render-fetch-log.txt](../evidence/beta-r4-hosting/render-fetch-log.txt)):
- [Pricing](https://render.com/pricing): Hobby, Starter, disks, bandwidth, domains, inbound IP rules by plan.
- [Persistent disks](https://render.com/docs/disks): mount path; one instance; stop-before-start deploys; fixed shutdown delay; snapshots; no disk for builds or one-off jobs; `scp`.
- [Free instances](https://render.com/docs/free): no disk on Free; spin-down after 15 minutes.
- [WebSockets](https://render.com/docs/websocket): no maximum duration; pings; reconnects.
- [Deploys](https://render.com/docs/deploys): `SIGTERM`, 30 s, no custom delay with a disk.
- [Web services](https://render.com/docs/web-services): `0.0.0.0`, port 10000, Docker, health checks.
- [Health checks](https://render.com/docs/health-checks): traffic paused after 15 s of failures; instance restarted after 60 s.
- [Maintenance mode](https://render.com/docs/maintenance-mode): paid web services; public requests get 503; still reachable by SSH and the private network.
- [Private network](https://render.com/docs/private-network): same workspace and region; blocking needs Pro or higher.
- [Workspaces](https://render.com/docs/team-members): up to five Hobby workspaces.
- [Inbound IP rules](https://render.com/docs/inbound-ip-rules): for web services, Scale and Enterprise only.
- [Docker](https://render.com/docs/docker): the Docker Command setting.
- [SSH](https://render.com/docs/ssh): paid web services; sessions run as the image's running user, who needs a shell.
- [Rollbacks](https://render.com/docs/rollbacks): environment values match the target deploy; disks aren't rolled back.
- [Outbound bandwidth](https://render.com/docs/outbound-bandwidth) and [Build pipeline](https://render.com/docs/build-pipeline): overages and the spend limit.

**Fly.io, Supabase and Cloudflare** were read at pinned commits of their official documentation repositories. They are listed in revision 1 (`git show 5b38cbb:docs/beta/beta-r4-hosting-proposal.md`) and are unchanged.

**Not verified here:** Koyeb, Railway, Google Cloud, Oracle Cloud Always Free, AWS and Deno Deploy (their sites are blocked from this session). Nothing above relies on them.

## Not done
No account, resource, deploy, DNS change, open port or charge. No runtime change and no gate rerun (the runtime is unchanged). The deploy-side scripts exist only as proposals and local drill evidence. #42 stays queued as it is. Beta stays on HOLD until the route is selected and execution is explicitly approved.
