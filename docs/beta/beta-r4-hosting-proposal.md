# Beta R4: independent cloud hosting, a proposal (handoffs 6916543972, 6916659110, 6916722530)

**Planning only.** Nothing was created, deployed, configured or bought, and no implementation changed.
- **Bases:** docs `d554b800e51ae78a9ca205d12a2d6622eb7795f9`; pinned runtime `7097ac2bb062925bb296a129f4771f1e68fd522d`, with the audited archive's SHA-256 `a693c543…3a5131`.
- **Who decides:** ChatGPT owns the final route recommendation and the owner-facing cost approval. The owner decides.
- **The requirement:** an independently hosted full website, with no dependency on a home computer. It supersedes the home-route (H1) prerequisite.
- **Revision 2 (this one):** puts a paid Render web service with a persistent disk first, as handoff 6916722530 asked, and tests that choice against the code and Render's own pages. Revision 1 recommended Fly.io, which is kept below as the cheaper alternative.

## Recommendation
**Route R: run the pinned server unchanged on one paid Render web service with one persistent disk.** The evidence confirms the fit, on the conditions listed under "Validation still needed".

| | |
|---|---|
| **Compute** | **Starter**: 512 MB, 0.5 CPU, **$7/month**. Measured need: a peak of 95.5 MB and well under 1 CPU-second per step, even at 220 open sockets (below). |
| **Disk** | **1 GB** at **`/var/data`**, $0.25 per GB per month = **$0.25/month**. The server's data folder is `MCHEZO_DATA_DIR=/var/data/cgn`, an absolute path outside the release, as production requires. A room's snapshot is about 9.4 KB plus its previous copy, so 1 GB holds tens of thousands of rooms. A disk can grow later but never shrink. |
| **Workspace** | **Hobby**, $0/month plus compute. |
| **Monthly baseline** | **$7.25** ($87 a year), before any tax (not checked). If the existing Render workspace is on **Pro**, add **$25/month**, so $32.25. |
| **Off-host backup** | The owner's own computer, by `scp`, plus a copy in private cloud storage the owner already has: **$0 extra**. A backup is about 10 KB per room. |
| **Existing Render account** | **Pending, not verified.** Its workspace plan, payment method and contents are unknown here. |

**The other routes:**
- **Route F, Fly.io** (revision 1's recommendation) stays on record as the cheaper alternative. It lists at about $3.84 per 30 days and costs $0 under Fly's under-$5 waiver, with a card on file. The waiver is Fly's policy, not a free tier.
- **Supabase** stays optional. No requirement found needs it: it doesn't host the room server, and its free plan pauses after a week inactive and has no automatic backups.
- **Cloudflare Durable Objects** stays on record: the only no-charge free plan found for a stateful WebSocket room server, but a large port.

## Does the evidence confirm the fit? The challenge, requirement by requirement
| Requirement | What the code does (at `7097ac2`) | What Render says (pages read 2026-11-16) | Verdict |
|---|---|---|---|
| **Data survives deploys and restarts** | Every room and Memory Book lives under `MCHEZO_DATA_DIR`. In production, that must be an absolute path outside the release (`serve.ts` lines 53–57). | Only the disk's mount path survives deploys and restarts. The rest of the filesystem is ephemeral. **Free web services can't attach a disk** and spin down after 15 idle minutes. | **Fits on a paid instance only.** Free is ruled out. |
| **One writer per data folder** | `DataDirLock` (Linux abstract socket) stops a second process on the same machine (`serve.ts` lines 95–102). It can't see another machine. | A disk is reachable by **one instance only**. A disk-backed service can't scale out. A deploy **stops the old instance before starting the new one**, "to prevent data corruption". | **Fits.** Render keeps it to one instance; the lock covers the processes inside it. |
| **Listening address** | With `MCHEZO_TRUST_PROXY` set in production, `MCHEZO_LISTEN_HOST` is required: the server must be reachable only through the proxy (`serve.ts` line 73). | A web service must bind `0.0.0.0`. The expected port is 10000 by default. Other services in the same workspace and region can also reach it over Render's private network. | **Fits, with a review:** `0.0.0.0` replaces the loopback rule (B-07). The workspace should run **no other service**, so Render's proxy is the only way in. |
| **Shutdown** | `SIGTERM` and `SIGINT` close the server, then release the lock (`serve.ts` lines 141–150). Writes are synchronous, so nothing is left queued. | Render sends `SIGTERM`, then `SIGKILL` after 30 s. **A service with a disk can't change that delay.** | **Fits.** The shutdown time is still to be measured on the instance. |
| **WebSockets** | The server pings every 15 s, and clients already reconnect. | No maximum connection time. Instance shutdowns and platform maintenance interrupt connections, so Render advises server pings and client reconnects. | **Fits.** Every deploy or maintenance swap drops all sockets for a few seconds. Rooms restore from the disk. |
| **Linux** | Production refuses any other platform, because the lock needs a Linux kernel facility (`serve.ts` line 59). | The Docker runtime runs the image we build, which is a Linux image. | Fits. |
| **Memory and CPU** | The measurements below. | Starter: 512 MB, 0.5 CPU. | **Fits,** with about 5× memory headroom. The real instance is still to be measured. |
| **Backups** | `datatool backup` holds the data folder's lock. So it **refuses while the server runs**, unless `--allow-running` is passed: then each file is copied whole, but a room and its Memory Book may be a moment apart (`datatool.ts` lines 11–15, 96–107). | The disk is reachable **only from the running instance**: not from builds, pre-deploy commands or one-off jobs. SSH works on paid web services. Files come off with `scp` or Magic-Wormhole. Daily snapshots, kept 7 days, restore the whole disk only. | **Fits, with a difference from the home runbook:** the off-host backup on Render must use `--allow-running`, taken between sessions. Below. |

## Memory and capacity, measured
**The script:** [memory-fit-v2.mjs.txt](../evidence/beta-r4-hosting/memory-fit-v2.mjs.txt).
- It starts the built server (runtime files identical to `7097ac2`) on a throwaway data folder.
- It fills R rooms, each with a host, 9 more players over WebSocket and 1 TV spectator, starts a game in every room, then holds them for 60 s of heartbeats.
- It reads the server's resident memory (`VmRSS`, peak `VmHWM`) and its CPU time from `/proc`.

| Scenario | Open sockets | Memory: idle → seated → game started → after 60 s | Peak memory | CPU used (run 2) |
|---|---|---|---|---|
| A family night: 2 rooms × 10, plus a TV each | 22 | 77.5 → 81.9 → 93.8 → 78.4 MB | 95.4 MB | 0.08 s to seat everyone; 0.17 s to start; **0.08 s over the 60 s hold** |
| A busy night: 5 rooms × 10 | 55 | 74.5 → 82.0 → 90.0 → 76.2 MB | 92.5 MB | 0.30 s; 0.16 s; 0.05 s over 60 s |
| Stress: 20 rooms × 10 | 220 | 77.0 → 88.2 → 94.9 → 80.9 MB | **95.5 MB** | 0.63 s; 0.23 s; 0.24 s over 60 s |

(Memory from run 1; CPU from run 2. Raw logs: [run 1](../evidence/beta-r4-hosting/memory-fit-run1.log), [run 2](../evidence/beta-r4-hosting/memory-fit-run2.log).)

**What the numbers mean:**
- **Memory:** the peak was 95.5 MB in every scenario, against 512 MB. Peaks vary between runs (run 2's family night peaked at 82.9 MB).
- **CPU:** under one CPU-second per step at 220 sockets, so 0.5 CPU should cope. That is the least proven figure: no answers were sent.

**What the numbers don't cover:**
- **Measured here, not on Render:** this session's machine, 4 CPUs, Node 22.23.4. The audited archive targets Node 22.16.0.
- **Without the access gate:** the runs used development mode. The gate adds a cookie check per request.
- **No player answers, drawing strokes or Memory Book exports** were sent. Only joins, a game start and heartbeats.
- **One anomaly, not investigated:** seating the busy night took 17 s of wall clock, while the server used 0.3 CPU-seconds. The other scenarios seated in about 2 s.

## Cost, line by line (Render's pricing and docs pages, read 2026-11-16)
| Item | Render's terms | This setup |
|---|---|---|
| Workspace | Hobby $0/month + compute (Pro $25/month + compute) | $0 on Hobby |
| Compute | Starter: $7/month, 512 MB, 0.5 CPU (the next size up: $25/month, 2 GB, 1 CPU) | $7.00 |
| Persistent disk | $0.25 per GB per month; paid services only; grows, never shrinks | 1 GB: $0.25 |
| **Baseline** | | **$7.25/month** |
| Outbound bandwidth | Hobby includes 5 GB a month, then $0.15 per GB | **Expected $0.** The web app is about 2.2 MB per device's first visit: the server sends it uncompressed, and the browser keeps the hashed assets for a year. So 5 GB is about 2,300 first visits a month. WebSocket traffic isn't measured yet. |
| Build ("pipeline") minutes | Hobby includes 500 a month. When they run out, more are bought automatically, unless the workspace's spend limit is reached or no card is on file; **then builds stop for the rest of the month.** The pages read don't give the per-minute price. | **$0**, with a pipeline spend limit of **$0** (whether the setting allows $0 is to be checked): an extra build is then refused rather than billed. A few builds a month are expected. |
| Custom domains | 2 included, then $0.25 per domain per month | $0: the `onrender.com` address or one own domain |
| Disk snapshots | Daily, kept 7 days. The pages read list no separate charge (the "$0.08 per GB" snapshot line belongs to Sandboxes). | Expected $0; **to confirm on the account's billing page** |
| Not needed | Dedicated IPs ($100/month), Pro features, Render Postgres (free databases expire after 30 days), Key Value | — |

**Overages that could happen:**
- Bandwidth past 5 GB, at $0.15 per GB.
- Moving up to the 1 CPU / 2 GB size ($25/month), if the real instance shows CPU pressure.
- A Pro workspace ($25/month) if the existing account is on it.

## Deploying, rolling back, and backing up
**Building the image (Docker runtime):** the image is built from the **audited archive itself**, not from source.
- The Dockerfile's first steps are the runbook's artifact gate: the full SHA-256 of the archive, the `release.json` revision, the inventory digest, `npm ci`, and exactly `ws zod`. Any mismatch fails the build, so nothing deploys.
- The base image is pinned to Node 22.16.0 by digest. The process runs as a non-root user.
- **No secrets in the image or the repository:** the access code is a Render environment secret, set by the owner.
- **Where the build comes from:** Render builds from a Git repository connected to the owner's account. A small private deploy repository could hold the Dockerfile and the 1.2 MB archive, kept out of this PR stack. The owner decides.

**Deploying:**
- Auto-deploy **off**; deploys are manual, between game nights.
- A disk-backed service is **down for a few seconds on every deploy**, and every socket drops. Rooms restore from the disk on start, and clients reconnect.
- Platform maintenance can interrupt connections the same way, at a time we don't choose.

**Rolling back:** Render redeploys a retained build artifact. How many are kept depends on the plan; the page read doesn't give the number.
- **The disk is never rolled back.** A rollback is only safe while the data format is unchanged, as it is today.
- **Environment variables return to the old deploy's values.** A rollback after rotating the access code would bring the old code back, so check the access code after any rollback.

**Backing up, in two layers:**
1. **Render's daily disk snapshots, kept 7 days.** They are inside Render, so not independent. A restore replaces the whole disk and loses everything since the snapshot.
2. **Our own, off Render, after each game night:**
   - Over SSH: `datatool backup --data /var/data/cgn --out /var/data/backups/<date> --allow-running`, taken when no game is running. Its manifest records `serverWasRunning: true`.
   - **Proving it is consistent:** `--allow-running` copies each file whole, but can't show that a room and its Memory Book are from the same moment. So take the backup **twice**, one after the other. If the two manifests list the same files with the same SHA-256 hashes, nothing changed during either copy, and the backup is one consistent state. If they differ, repeat. This is an operator step; no code change.
   - Copied off with `scp -s` to the owner's computer, then `datatool verify` there.
   - A second copy in the owner's existing private cloud storage.

**Restoring from our own backup:**
- Upload it to the disk with `scp -s`, then `datatool restore` into a **new** folder (it never overwrites), then `datatool check`.
- Point `MCHEZO_DATA_DIR` at the new folder. Changing an environment variable redeploys, which stops the old instance first. The old folder stays as it was.
- This must be drilled before invitations.

## The configuration that changes (no runtime code)
| Setting | Today (home route) | On Render |
|---|---|---|
| Process manager and proxy | systemd and Caddy | One Render web service (Docker) and Render's proxy, which handles TLS |
| `MCHEZO_LISTEN_HOST` / `PORT` | `127.0.0.1` / the unit's port | `0.0.0.0` / `10000`, as Render requires. **Replaces B-07; needs ChatGPT's review.** No other service in the workspace. |
| `MCHEZO_TRUST_PROXY` | Counted at V2 with `nc` in the service's place | **To be counted on Render.** The `nc` method doesn't carry over. A one-off header-echo service on the free instance type, deleted afterwards, is one way; it is a resource, so it needs approval. |
| `MCHEZO_DATA_DIR` | `/var/lib/…` | `/var/data/cgn` on the disk |
| `MCHEZO_PUBLIC_ORIGIN` | The LAN name | `https://<service>.onrender.com`, or the owner's domain |
| Access code | `/etc/christmas-game-night/env` | A Render secret environment variable, set by the owner; never in GitHub |
| Health check | Manual `/health` | Render's health check path `/health` |
| Exposure | LAN only | **A public URL**, behind the access gate on HTTP and WebSocket. **A new owner decision:** earlier approvals excluded public exposure. |

## Validation still needed (none done; each needs execution approval)
1. **The account:** the existing workspace's plan (Hobby or Pro), the payment method, and the region.
2. **The build:** the Docker build on Render runs the artifact gate on the audited archive. A deliberately wrong hash fails the build.
3. **The disk:** who owns the mount for the non-root user; the server creating `/var/data/cgn` private; `datatool check` passing. If ownership is wrong, the server refuses to start (`DataDirUnusable`) rather than run without the data.
4. **Memory and CPU on the real Starter instance,** during a private validation night with real answers. Move up a size only if needed.
5. **The route checks, adapted:** TLS `/health` from a phone (V1); the proxy count for `MCHEZO_TRUST_PROXY` (V2); WebSockets with the throwaway code on two phones (V3).
6. **A deploy and a restart with a room open:** clients reconnect, the room is restored, and the `SIGTERM` shutdown finishes well inside 30 s.
7. **The backup drill:** `--allow-running` backup taken twice with matching manifests, `scp -s` off, `verify`, then restore into a new folder, `check`, and switch `MCHEZO_DATA_DIR`. A snapshot restore drill on throwaway data.
8. **A rollback drill:** the previous deploy comes back, the data is kept, and the access code is checked.
9. **Bandwidth** after the first nights, from the dashboard.
10. **Native-device checks P1–P8** over the public URL.

## Owner decisions and access needed (no secrets in GitHub)
1. **The route:** R (Render, recommended), F (Fly.io, cheaper), or Cloudflare later.
2. **The spend:** $7.25/month on Hobby, plus the possible overages above. ChatGPT presents the cost approval. This needs an explicit ruling against the "$0 / no paid resources" rule.
3. **A public URL behind the access code,** replacing "no public exposure".
4. **The account:** the existing Render account (pending); Hobby; a region; `onrender.com` or the owner's own domain (a DNS record they add).
5. **Who deploys, and from where:** the owner in Render's dashboard, from a private deploy repository. Only after the execution approval.
6. **Where the off-host backup lives:** the owner's computer and existing private cloud storage.
7. **Supabase:** not needed. The existing account and project stay untouched.

## Sources
**Render** ([render.com](https://render.com), official pages read from this session at the times shown, after the owner allowed `render.com`. Each page's SHA-256, first 16 hex digits, is in [render-fetch-log.txt](../evidence/beta-r4-hosting/render-fetch-log.txt)):
- [Pricing](https://render.com/pricing) (12:44:59Z): Hobby, Starter, disks, bandwidth, domains.
- [Persistent disks](https://render.com/docs/disks) (12:44:59Z): mount path, single instance, stop-before-start deploys, fixed shutdown delay, snapshots, `scp`.
- [Free instances](https://render.com/docs/free) (12:45:00Z): no disk on Free; spin-down after 15 minutes; free Postgres expires after 30 days.
- [WebSockets](https://render.com/docs/websocket) (12:45:00Z): no maximum duration; pings; reconnects.
- [Deploys](https://render.com/docs/deploys) (12:45:01Z): `SIGTERM`, 30 s, no custom delay with a disk.
- [Web services](https://render.com/docs/web-services) (12:45:02Z): `0.0.0.0`, port 10000, private network, Docker, health checks.
- [Outbound bandwidth](https://render.com/docs/outbound-bandwidth) (12:45:02Z): $0.15 per GB past the plan's amount.
- [Rollbacks](https://render.com/docs/rollbacks) (12:45:03Z): retained artifacts; disks not rolled back; environment variables match the target deploy.
- [SSH](https://render.com/docs/ssh) (12:52:00Z): paid web services only.
- [Build pipeline](https://render.com/docs/build-pipeline) (12:54:01Z): 500 minutes on Hobby; spend limit; builds stop.

**Fly.io, Supabase and Cloudflare** were read from their official documentation repositories on GitHub, at pinned commits (their websites were blocked from this session):
- **Fly.io**, [superfly/docs @ 0408586](https://github.com/superfly/docs/tree/040858621eea858652b156a71ffe6472e3af724b):
  - [about/pricing.mdx](https://github.com/superfly/docs/blob/040858621eea858652b156a71ffe6472e3af724b/about/pricing.mdx): no free tier for new organizations; the Machine and volume prices.
  - [about/free-waiver.mdx](https://github.com/superfly/docs/blob/040858621eea858652b156a71ffe6472e3af724b/about/free-waiver.mdx): under $5 waived; personal org, Pay As You Go, card on file.
  - [about/free-trial.mdx](https://github.com/superfly/docs/blob/040858621eea858652b156a71ffe6472e3af724b/about/free-trial.mdx): a $1 credit for 7 days.
  - [volumes/overview.mdx](https://github.com/superfly/docs/blob/040858621eea858652b156a71ffe6472e3af724b/volumes/overview.mdx): one server per volume, no replication, the snapshot policy.
  - [networking/websockets.mdx](https://github.com/superfly/docs/blob/040858621eea858652b156a71ffe6472e3af724b/networking/websockets.mdx): idle connections stay open; 1012 on a restart or auto-stop.
- **Supabase**, [supabase/supabase @ 311e2c7](https://github.com/supabase/supabase/tree/311e2c721c1e3dc613cb5161f101eaf68ebe5b27):
  - [apps/docs/content/guides/platform/backups.mdx](https://github.com/supabase/supabase/blob/311e2c721c1e3dc613cb5161f101eaf68ebe5b27/apps/docs/content/guides/platform/backups.mdx): daily backups from Pro.
  - [packages/shared-data/plans.ts](https://github.com/supabase/supabase/blob/311e2c721c1e3dc613cb5161f101eaf68ebe5b27/packages/shared-data/plans.ts): Free pauses after 1 week inactive; Pro $25/month.
- **Cloudflare**, [cloudflare/cloudflare-docs @ ada7e33](https://github.com/cloudflare/cloudflare-docs/tree/ada7e3355579070344a6893e8285ec357b7ff65d):
  - [src/content/partials/durable-objects/durable-objects-pricing.mdx](https://github.com/cloudflare/cloudflare-docs/blob/ada7e3355579070344a6893e8285ec357b7ff65d/src/content/partials/durable-objects/durable-objects-pricing.mdx): the Free plan's daily limits.

**Not verified here:** Koyeb, Railway, Google Cloud, Oracle Cloud Always Free, AWS and Deno Deploy. Their official pages were blocked from this session. Nothing above relies on them.

**Revision 1's full Fly.io, Supabase and Cloudflare comparison** (components, code fit, migration scope, durability) is unchanged at commit `5b38cbb` (`git show 5b38cbb:docs/beta/beta-r4-hosting-proposal.md`).

## Not done
No account, resource, deploy, DNS change, open port or charge. No implementation change and no gate rerun (the runtime is unchanged). #42 is separate. Beta stays on HOLD until the route is selected and execution is explicitly approved.
