# Beta R4: readiness matrix and Render execution proposal (handoff 6954127832)

**Planning only.** Nothing here is an approval to deploy, merge, create a resource, open a port, spend, or touch production data, and no checkpoint is cleared.
- **The base:** `7c1590cf86e28b82e29766b8d6b54b219df23323` (#50).
- **The runtime candidate:** `988c535` (runtime identical to `72e9d8b`).
- **The audited release:** `7097ac2` (archive `a693c543…3a5131`).
- **W7 stays OPEN.**
- **Revision 2 (review [6954485280](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6954485280)):** the order now follows dependencies (§3). The one-click check is limited to the service's synthetic phase (§2). The cost wording is corrected, and §5 keeps its uncertainty. Revision 1 was `2b26520`. The checks are in [readiness-checks-2026-11-17-r2.log](../evidence/beta-r4-hosting/readiness-checks-2026-11-17-r2.log).
- **How this relates to the other documents:** it reconciles the existing ones and doesn't replace them.
  - The route and its rationale: [beta-r4-hosting-proposal.md](beta-r4-hosting-proposal.md).
  - The exact service configuration: [deploy/render/README.md](../../deploy/render/README.md).
  - The procedures: [render-w1.md](render-w1.md) to [render-w7.md](render-w7.md), and section 7 of [REAL_DEVICE_TESTING.md](../REAL_DEVICE_TESTING.md).

**Three kinds of evidence, kept apart** (handoff 6954127832):
1. **Local rehearsal:** done on this machine or in a private Codespace, with throwaway data.
2. **The actual audited release-pair proof:** B-W7-01. It needs **no provider**: it is packaging, auditing and compatibility work, and can be done before hosting.
3. **Provider execution:** behaviour only Render shows. It needs the owner's execution approval.

"Rollback testing belongs after hosting" is true only of the third.

## 1. The readiness matrix
**Status words:**
- **PASS (local):** developer-run, and accepted by ChatGPT's review where a review ID is given.
- **PASS (independent):** ChatGPT's own run.
- **MODELLED:** a local stand-in for something real.
- **INCOMPLETE:** started, not finished.
- **NOT RUN.**

### A. Product journeys and independent audits
| Requirement | Exact candidate / evidence | Status | If missing | Next actor |
|---|---|---|---|---|
| Full regression gate on the runtime that will ship | `7097ac2`: run `20261116-035311-7097ac2b-9479` PASSED, 111/111. `72e9d8b`: fast 5/5 and targeted 5/5 only (PROGRESS, C502 section). | PASS for `7097ac2`; **INCOMPLETE for `72e9d8b`** | `72e9d8b` can't be packaged or promoted | Claude, on a handoff |
| Private browser audit of the release | `7097ac2` Firefox audit, review 6908014247 | PASS (independent) | — | — |
| Restart: host, guest and TV recover with no rejoin | Exact-pin live audit `w4-live-7097ac2`, in 6936797118 (Firefox emulation, not physical devices) | PASS (independent) | — | — |
| Restore cutover: host, guest and TV, standings | ChatGPT's audit in review 6941129590 | PASS (independent) | — | — |
| **Rollback and return in a browser:** seats, ledger, a persisted action, replay | The developer rehearsal `20261117T073823Z-90aed9d8` passed 46/46 over the API (#50, report 6942141320). ChatGPT's browser journey hasn't run: the preview was blocked, first by Codespaces usage and then by its browser tool's URL policy (6952207048). | Developer PASS (local, MODELLED predecessor); **independent INCOMPLETE** | **W7 can't be cleared,** and hosted execution waits for it (§3) | ChatGPT (§5). Any change to where this audit happens is the owner's decision, **pending**. |
| Native iPhone Safari and Android Chrome, P1–P8 | [REAL_DEVICE_TESTING.md §7](../REAL_DEVICE_TESTING.md), [the go/no-go draft](../device-testing/beta-go-no-go-DRAFT-7097ac2.md) | **NOT RUN** | No go/no-go | The owner, on the hosted URL (W8) |
| The TV entry screen: the spectator action sits below the name field | Observation in 6941129590 | Non-blocking | — | Product backlog |

### B. The release pair (B-W7-01). No provider needed.
| Requirement | Exact candidate / evidence | Status | If missing | Next actor |
|---|---|---|---|---|
| The audited rollback target | `7097ac2`, `a693c543…`, 144-file inventory `fe6d74f8…`, verified in 6909443770 | PASS (independent) | — | — |
| An audited release **newer** than it | Proposed: `72e9d8b` (3 web-client files differ; the server, content and packages are identical). Reply 6951228654. | **NOT STARTED:** unpackaged, unaudited | There's nothing to roll back from | Claude: gate, package, release record. ChatGPT: private archive audit. |
| A pins-only forward commit, and its revert prepared in advance | The same change as `scripts/beta/w7-pred-context.sh` makes, in the other direction | NOT STARTED | No reviewed deploy change to apply | Claude |
| `7097ac2` reads data that `72e9d8b` wrote, on a disposable **received** copy | Identical server by construction (`git diff 7097ac2 72e9d8b -- src` is empty), but still to be shown, as the COMPAT step of [render-w7.md](render-w7.md) does | NOT RUN | B-W7-01 stays open | ChatGPT (where the audited bytes are). Claude can rehearse with local rebuilds. |
| The rollback protocol itself | `988c535`: W7 self-test 13/13, rehearsal 46/46, with the **LOCAL SURROGATE** `f93e9cb` | MODELLED, PASS (local) | — | — |

### C. Provider-only checks (Render). Each needs the owner's execution approval.
| Requirement | Runbook | Local preparation | Status on Render |
|---|---|---|---|
| **W1, the way in:** HTTPS redirect; cookie `Secure`, `HttpOnly` and `SameSite=Lax`; the proxy-count forgery and separation tests; reconnection | [render-w1.md](render-w1.md) | The checker self-test, behind a Render-like proxy (package accepted, 6921505856) | NOT RUN |
| **W2, load:** 2 rooms × (10 phones + TV) | [render-w2.md](render-w2.md) | Cleared, 6929226094 | NOT RUN |
| **W3, reconnect on native phones** | [render-w3.md](render-w3.md) | Cleared, 6933392621 | NOT RUN |
| **W4, restart:** a manual deploy and a dashboard restart | [render-w4.md](render-w4.md) | Accepted, 6937786587 | NOT RUN |
| **W5, backup:** `cgn-backup`, `scp -s`, receipt on the owner's device | [render-w5.md](render-w5.md) | Cleared, 6938602366 | NOT RUN. Needs the owner's `age` key. |
| **W6, restore:** the switch; a Render snapshot restore on throwaway data | [render-w6.md](render-w6.md) | Cleared, 6941129590 | NOT RUN |
| **W7, rollback:** a revert-commit deploy and return; a deliberate one-click rollback, refused | [render-w7.md](render-w7.md) | MODELLED, and W7 OPEN | NOT RUN |
| **W8, native devices** on the public URL | [REAL_DEVICE_TESTING.md §7](../REAL_DEVICE_TESTING.md) | — | NOT RUN |

**Provider facts that can only be seen on Render:**
- that the disk mount is writable by the non-root user;
- the real `X-Forwarded-For` shape, which sets `MCHEZO_TRUST_PROXY`;
- Docker Hub pulls and an `amd64` host in Render's build;
- the 30 s `SIGTERM` window;
- maintenance mode's 503 alongside working SSH;
- what a one-click rollback restores;
- that the guard refuses it.

### D. Account and owner-held prerequisites
| Item | Status | Next actor |
|---|---|---|
| Render route and spend: Starter, a 1 GB disk, $7.25/month baseline, overages disclosed | Approved by the owner's ruling (handoff 6919813048) | — |
| The existing workspace: verify it is on **Hobby** and empty; payment method; region | Connected and empty on 2026-11-16; the plan, payment and region are **unverified** | The owner (billing pages) |
| The owner's `age` key pair, and the receiving device | Pending | The owner |
| The private deploy repository, with the audited archive or archives | Assigned to ChatGPT; its state isn't recorded in this repository | ChatGPT |
| The pipeline spend limit, set as low as Render allows | At creation. **That minimum, and whether $0 is allowed, are still to verify.** | The owner |
| **Execution windows** for W1–W8, with throwaway data and code | **Pending:** the decision in §3 | The owner |

## 2. The Render execution proposal (none of it executed)
Render facts were re-read from the official pages on **2026-11-17, 16:31Z**. The hashes are appended to [render-fetch-log.txt](../evidence/beta-r4-hosting/render-fetch-log.txt). They match the 2026-11-16 reading on every point used here.

| Area | Proposal | Source |
|---|---|---|
| **Candidate and promotion** | **Hosted W1–W6 run on `7097ac2`,** which is already audited. **Promotion and W7 wait for B-W7-01** (§1 B):<br>• the forward deploy of `72e9d8b` needs its full gate, the package and release record, the independent private archive audit, the compatibility proof on a received copy, and the reviewed pins-only forward commit with its revert;<br>• W7's release-pair test needs that forward deploy.<br>**Starting hosted W1–W6 before B-W7-01 is finished is a proposal only.** It is conditional on the owner's execution approval and on the outstanding private W7 audit (§3, §5), and it doesn't replace either. Each build passes the unchanged artifact gate (`ARTIFACT_GATE_OK`, `INSTALLED_OK`). | [release-7097ac2.md](release-7097ac2.md), [render-w7.md](render-w7.md) |
| **Service and storage** | One **Docker web service**, **Starter** (512 MB, 0.5 CPU, $7/month), **1 instance**, a **1 GB disk** at `/var/data` ($0.25 per GB per month), in a Hobby workspace that holds only this service. The data folders are `/var/data/cgn-w1` (throwaway) and `/var/data/cgn` (real, after the go/no-go). | [deploy/render/README.md](../../deploy/render/README.md); Render [pricing](https://render.com/pricing), [disks](https://render.com/docs/disks) |
| **Build and start** | The pinned Dockerfile, with no `ARG`. The Docker command stays empty, so `cgn-entrypoint` is PID 1. Auto-deploy off; manual deploys only. Health check path `/health` (open, revision only). | [Docker](https://render.com/docs/docker), [health checks](https://render.com/docs/health-checks): traffic paused after 15 s of failures, a restart after 60 s |
| **TLS, origin, cookies, WebSockets** | Render terminates TLS. Its proxy is **expected** to pass the browser's `Origin` through unchanged: Render's pages don't state it, so W1 checks it on the gate form, the API and `wss://`. If it doesn't, sign-in is refused (fail closed), and no check is relaxed. `MCHEZO_PUBLIC_ORIGIN` is the exact `https://<service>.onrender.com`, the exact-origin check is unchanged, and the cookie is `Secure`, `HttpOnly` and `SameSite=Lax`. `MCHEZO_TRUST_PROXY=1` stands until W1's two tests. WebSockets have no maximum duration, and deploys drop them (clients reconnect). | [WebSockets](https://render.com/docs/websocket), [custom domains](https://render.com/docs/custom-domains) (managed TLS); W1 |
| **Secrets** | The owner types the access code into the dashboard as a secret value. Never through GitHub, chat, a Blueprint or an MCP call (an MCP environment update replaces the whole list). The backup recipient is the owner's **public** `age` key. | [environment variables](https://render.com/docs/environment-variables); README "Secrets" |
| **Backup and restore** | W5: `cgn-backup` stops the writer and copies under the lock (`BACKUP_OK`), then `scp -s` off Render to the owner's storage, then `cgn-receive` (`RECEIPT_OK`). W6: the prepare / commit-or-abort switch. Render's automatic **daily disk snapshots** (kept seven days) are a separate, extra layer. They are never a substitute, and their restore is tested only on throwaway data. | [disks](https://render.com/docs/disks), [SSH](https://render.com/docs/ssh) (paid services only) |
| **One writer** | Render can't scale a service that has a disk, and stops the old instance before starting the new one. Inside the instance, `DataDirLock` and the guard record refuse a second writer or a stale folder. | [disks](https://render.com/docs/disks): "Adding a disk to a service prevents zero-downtime deploys" |
| **Shutdown** | `SIGTERM`, then 30 s. A service with a disk can't change the delay. The entrypoint passes the signal on, and the server closes cleanly. | [deploys](https://render.com/docs/deploys), [disks](https://render.com/docs/disks) |
| **Maintenance** | On outside approved windows. Public requests get 503; SSH and the private network still work. Paid services only. | [maintenance mode](https://render.com/docs/maintenance-mode) |
| **Rollback** | **Revert commits only**, through the same gate ([render-w7.md](render-w7.md)). A one-click rollback restores the target deploy's **environment variables**, and "disks retain state between all deploys and cannot be rolled back", so the guard refuses it (exit 78). Triggering one also disables auto-deploy (already off). The deliberate one-click check runs **only under the synthetic-phase exception below.** | [rollbacks](https://render.com/docs/rollbacks) |
| **The way in** | The private network spans a workspace and region, and only Pro or higher can block it. So the workspace holds this one service only. | [private network](https://render.com/docs/private-network), [workspaces](https://render.com/docs/team-members) (up to five Hobby workspaces) |

### The one-click check: the synthetic-phase exception
This is the architect's decision in review 6954485280. Execution still needs the owner's approval. It is stated identically in [render-w7.md](render-w7.md#the-synthetic-phase-exception).
- **The condition:** the deliberate one-click check runs on **the single planned service**, so no second service and no extra cost. It runs **only while that service and its disk have never held family data or a real access code.** That means:
  - the data folder is the throwaway `/var/data/cgn-w1`;
  - the code and the `age` identity are throwaway ones;
  - `/var/data/cgn` has never been authorized.
- **Once real data or a real code has existed on the service, the exception ends for good.** A later check would need a separate throwaway service: a new resource with its own approval, and none is proposed.
- **Recovery:** an ordinary manual deploy of the current commit, with the current environment. Then:
  - `cgn-authorize --status` shows the record exactly as before;
  - `datatool check` passes;
  - the synthetic room, its seats and its ledger are there;
  - the reopen gate passes;
  - auto-deploy is still off.
- **Cleanup:** the service and its disk stay for W8, which also uses synthetic data. The refused deploy stays in the deploy history and is recorded. **At the go/no-go,** once the real folder is serving:
  - delete `/var/data/cgn-w1` and its backups on the disk;
  - delete the off-Render backups encrypted to the throwaway `age` identity, then destroy that identity.

  The synthetic phase's daily snapshots expire after seven days.

### Why free hosting doesn't meet this app's requirements (Render's pages, 2026-11-17)
- **Free web services have an ephemeral filesystem,** lost "every time" the service redeploys, restarts or spins down. They can't attach a disk ([free](https://render.com/docs/free)). Rooms and Memory Books would be lost.
- **They spin down after 15 minutes** without inbound traffic, WebSocket messages included, and take about a minute to come back. A game night's sockets would drop.
- **No SSH and no maintenance mode** on free services ([SSH](https://render.com/docs/ssh), [maintenance mode](https://render.com/docs/maintenance-mode)). So the backup, restore and rollback procedures can't run.
- **So, for the existing application on Render's free web-service tier, $0 is possible only by dropping persistence,** which is excluded.
- **Other architectures could cost less.** They are different routes with their own work, not this proposal. Recorded at revision 1 and not re-verified today:
  - Fly.io, about $3.84 per 30 days under a waiver that is policy, not a free tier;
  - Cloudflare Durable Objects, free but a large port.

## 3. The owner decision, and the cost
**Already decided:** the route and the baseline spend (handoff 6919813048).

**Still needed, as one decision:** authorize **execution**. That means:
- **the service:** create the one service, with its disk, in the existing workspace once it is verified as Hobby, with a payment method and a region chosen;
- **the spend limit:** set the pipeline limit to the lowest Render allows (that minimum is still to verify);
- **the windows:** run W1–W8 in approved windows, with throwaway data and a throwaway code, and maintenance on outside them.

**A later, separate decision:** the go/no-go for the real folder and a real access code.

**The recurring cost,** verified 2026-11-17, before tax (not checked):

| Item | $/month |
|---|---|
| Hobby workspace | 0 |
| Starter web service | 7.00 |
| 1 GB persistent disk | 0.25 |
| **Render baseline** | **7.25** |
| Codespaces (approved separately, capped with stop-at-limit; **scoped to the preview audit, not Render**) | up to 10.00 |


**Together:** the $7.25 Render baseline plus up to $10 Codespaces, before Render overages and tax. **That is not a spending ceiling.**

**What can add to it:**
- **Bandwidth beyond 5 GB a month,** at $0.15 per GB. **Render documents no spend limit for bandwidth:** the only one it documents is for pipeline minutes.
- **Pipeline minutes beyond 500 a month** are bought automatically, and stop **only** at the configured pipeline spend limit. The lowest limit Render allows, and whether that can be $0, still needs verifying.
- **Custom domains beyond 2,** at $0.25 per domain per month. None are planned.

### The order of work, by dependency
Each step says what it waits for. None of it is executed or authorized here.

**Without a provider:**
1. **The private W7 audit (ChatGPT):** W7's independent browser journey on the private preview (§5).
   - **It is outstanding, and it stays a requirement before hosted execution.**
   - If it can't be completed without circumvention, moving it (for example, into a hosted window) is an exception that **only the owner can decide**. That decision is pending, and this proposal assumes no exception.
2. **B-W7-01 (Claude, then ChatGPT; §1 B).** **It blocks step 8 (promotion) and step 9 (W7's release-pair test), not W1–W6.**
   - **Claude:** the full gate on `72e9d8b`; its package and release record; the forward and revert pins commits; the local checks, with `W7_CURRENT_REVISION` / `W7_PREVIOUS_REVISION` set in `scripts/beta/w7-rehearsal.sh`.
   - **ChatGPT:** the independent private archive audit, and the compatibility proof on the audited bytes.
3. **The owner:**
   - the `age` key pair;
   - the workspace plan, payment and region;
   - an SSH key on the account.
4. **ChatGPT:** the private deploy repository, holding the audited archive (later, both).
5. **The owner:** the execution decision above.

**On Render, each in an approved window:**
6. **W1–W4 on `7097ac2`.** They wait for steps 1, 3, 4 and 5, and **not** for step 2, since `7097ac2` is already audited. Running them before step 2 is finished is therefore possible, but only as a proposal for the owner, conditional on step 5 and on step 1 (or the owner's explicit exception to it). W1 settles the proxy count; then W2, W3 and W4.
7. **W5 and W6 on `7097ac2`,** including the snapshot restore on throwaway data.
8. **Promotion: the forward deploy of `72e9d8b`.** It waits for step 2, complete:
   - the gate;
   - the package and the release record;
   - the private archive audit;
   - the compatibility proof;
   - the forward and revert commits.

   It also waits for step 7, so that a backup and its receipt come first.
9. **W7:** the revert-commit rollback to `7097ac2`, and the return. It waits for step 8. Then comes the deliberate one-click check, **only under the synthetic-phase exception** (§2).
10. **W8** on the final release, still on synthetic data.
11. **The owner's go/no-go.** Then `cgn-authorize` for the real folder and code, and the synthetic-phase cleanup (§2).

## 4. What is not claimed
- No independent clearance of W7.
- No release-pair evidence. The surrogate `f93e9cb` is not a predecessor.
- No hosted behaviour, and no device results.
- No owner decision about where the W7 audit happens, or about starting hosted W1–W6 before B-W7-01. Neither is assumed.
- The Render terms are as read on 2026-11-17 and can change. Tax and invoicing weren't checked, and neither was the lowest pipeline spend limit.

## 5. The unresolved preview audit: the smallest supported next action
**No observation so far shows an application defect.** The exact-origin check accepted or refused as designed each time. What is open concerns the preview and the auditing browser: **infrastructure, not code.**

| Observation | Whose testing | Kind | What it shows, and what it doesn't |
|---|---|---|---|
| ChatGPT's cloud browser: the probe returned `REWRITTEN_SAME_ORIGIN_ONLY` twice, own origin `https://localhost:3157` (6952207048) | ChatGPT, independent | Infrastructure: the preview route | Route A is valid **for that browser session**. |
| The owner's own browser: `UNSUITABLE`, own origin `http://localhost:3157`; the sibling kept its `https://…-3158.app.github.dev` (6954127832) | The owner, supplementary | Infrastructure | The probe correctly refused an `http` origin, which would drop `Secure`. **The screenshot doesn't show the address bar.** So it doesn't establish which URL the tab had, nor that a localhost tab caused the `http` origin. A tab opened from `http://localhost:3157`, the way an editor's local port forward opens it, is **one hypothesis**, not a finding. What it does confirm is that the value is per client, which is why D-BR1R-09 and D-BR1R-10 require the probe in the auditing browser's own session. The owner's device testing is W8, on the hosted URL. |
| ChatGPT's browser: the first health navigation hit `net::ERR_HTTP_RESPONSE_CODE_FAILURE` while the server was still building. The reload was refused: "The requested URL protocol is not allowed. Allowed protocols: http:, https:" | ChatGPT, independent | Infrastructure: the browser tool's policy | The tool's policy rejected the operation. That the reload targeted an internal error page is **a hypothesis**, not established. |

**The smallest supported next action.** It involves no tunnel experiment, browser workaround, remote display or regression, and there is nothing for Claude to repair.
- **ChatGPT owns resolving its browser restriction without circumvention.** That means finding out, under its tool's own policy, whether a permitted way to open the preview exists.
  - An `https` address alone doesn't establish permission to repeat an operation the policy rejected, and this document doesn't assert that permission.
  - If a permitted way exists, the audit resumes as before: the candidate's local `/health` on the exact SHA; then the probe in that same session (D-BR1R-09, D-BR1R-10); then the W7 journey.
- **The owner, optionally:** which address was in the tab of the `UNSUITABLE` run? That would settle the hypothesis above. It is supplementary, not part of the independent audit.
- **If the private audit can't be completed, W7 stays INCOMPLETE.** Moving the audit elsewhere, for example into a hosted window, is an exception for **the owner's explicit decision**. It is pending, and this proposal doesn't assume it (§3, step 1).
- **Claude:** nothing, unless a handoff asks. No application defect is open.

**Untouched by any of this:** the origin checks, cookie flags, private ports and pins.
