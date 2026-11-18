# Beta R4: readiness matrix and Render execution proposal (handoff 6954127832)

**Planning only.** Nothing here is an approval to deploy, merge, create a resource, open a port, spend, or touch production data, and no checkpoint is cleared.
- **The base:** `7c1590cf86e28b82e29766b8d6b54b219df23323` (#50).
- **The runtime candidate:** `72e9d8b`, archive `aac13a8a…` ([release-72e9d8b.md](release-72e9d8b.md)). Revision 1 named `988c535`, whose runtime is identical.
- **The audited release:** `7097ac2` (archive `a693c543…3a5131`).
- **W7 stays OPEN.**
- **Revision 4 (review and handoff [6966711883](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-6966711883)):** B-W7-01's **local engineering proof has PASSED.** It covers the audited newer archive with its metadata, the received-copy compatibility, the reviewed pins pair, and the exact positive gates and protocol check on the retained archives. The forward and revert patches are still unapplied preparation. Hosted W7 and native W8 are NOT RUN; they wait for the owner's execution approval. §1, §2, §3, §4 and §5 now give the current state; earlier text is kept as dated history.
- **Revision 3 (handoff [6966073894](https://github.com/kekuBT/christmas-game-night-pilot/pull/50#issuecomment-6966073894)):** §1 A and B and §3 step 2 now record B-W7-01's progress. The newer release `72e9d8b` is independently audited as archive `aac13a8a…` ([release-72e9d8b.md](release-72e9d8b.md)), and the exact-pair compatibility check passed on a received copy (review 6966023566). The pins-only forward and revert pair is prepared for review ([pins-72e9d8b/](pins-72e9d8b/README.md)). B-W7-01 stays OPEN.
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
| Full regression gate on the runtime that will ship | `7097ac2`: run `20261116-035311-7097ac2b-9479` PASSED, 111/111. `72e9d8b`: run `20261117-231232-72e9d8ba-471` PASSED (exit 0), 112/112, unit 2,085/2,085, on a clean clone ([evidence](../evidence/beta-r4-w7/release-72e9d8b/README.md)). | PASS for `7097ac2`; **developer PASS for `72e9d8b`**, its raw evidence read independently (6966023566) | — | — |
| Private browser audit of the release | `7097ac2` Firefox audit, review 6908014247 | PASS (independent) | — | — |
| Restart: host, guest and TV recover with no rejoin | Exact-pin live audit `w4-live-7097ac2`, in 6936797118 (Firefox emulation, not physical devices) | PASS (independent) | — | — |
| Restore cutover: host, guest and TV, standings | ChatGPT's audit in review 6941129590 | PASS (independent) | — | — |
| **Rollback and return in a browser:** seats, ledger, a persisted action, replay | **Current:** ChatGPT's private Route B audit (6963579755) covered the host, guest and TV journeys, replay, the transitions and reconnection, on a local pack whose runtime inventory is identical to `72e9d8b`'s. The exact pair then passed privately in Firefox ESR. The revision check is in 6966023566. In 6966711883, the forward gate's installed `72e9d8b` served `ok:true` over loopback HTTPS, beta entry succeeded, and the desktop and 320×480 home screens were usable. The focused actual-pair check ran on the gate-installed packages. **History (revision 2, 2026-11-17):** at that point the journey hadn't run, and the preview was blocked (6952207048). The owner had accepted owner-run testing for that checkpoint (handoff 6954764073); the independent Route B audit has since superseded that. | **Independent PASS, private and local** (6963579755, 6966023566, 6966711883). Hosted W7: **NOT RUN**. | — locally. Hosted W7 waits for the owner's execution approval (§1 C, §3) | The owner (execution approval) |
| Native iPhone Safari and Android Chrome, P1–P8 | [REAL_DEVICE_TESTING.md §7](../REAL_DEVICE_TESTING.md), [the go/no-go draft](../device-testing/beta-go-no-go-DRAFT-7097ac2.md) | **NOT RUN** | No go/no-go | The owner, on the hosted URL (W8) |
| The TV entry screen: the spectator action sits below the name field | Observation in 6941129590 | Non-blocking | — | Product backlog |

### B. The release pair (B-W7-01). No provider needed.
| Requirement | Exact candidate / evidence | Status | If missing | Next actor |
|---|---|---|---|---|
| The audited rollback target | `7097ac2`, `a693c543…`, 144-file inventory `fe6d74f8…`, verified in 6909443770 | PASS (independent) | — | — |
| An audited release **newer** than it | `72e9d8b` (3 web-client files differ; the server, content and packages are identical): archive **`aac13a8a…`**, Node v22.16.0, `builtAt` `2026-11-18T01:07:42.001Z`, 144-file inventory `4f58b323…` ([release-72e9d8b.md](release-72e9d8b.md)). ChatGPT's own build, audited in 6966023566; its metadata was read from the selected bytes in 6966711883. | **PASS (independent)** | — | — |
| A pins-only forward commit, and its revert prepared in advance | [pins-72e9d8b/](pins-72e9d8b/README.md): two patches against the exact baseline (#50 at `71d0200`), made by the counted substitutions of `w7-pred-context.sh`. Checked locally: `w7-pins-selftest.sh`, and the gate refuses the developer archive under the proposed pin. | **PASS (independent, local):** reviewed. The forward context installed the exact `aac13a8a…` and the reverted context the exact `a693c543…` through the unchanged gate, with `ARTIFACT_GATE_OK` and `INSTALLED_OK` (6966711883). **Not applied:** the patches are preparation only. | — | The owner: the execution approval. Applying the patches in the deploy repository is the forward deploy (§3, step 8). |
| `7097ac2` reads data that `72e9d8b` wrote, on a disposable **received** copy | Review 6966023566: `BACKUP_OK` and `RECEIPT_OK`; the exact `7097ac2` archive verified, restored, checked and served the received copy; the seats, ledger, answers and Memory Book entry survived; a replayed answer was saved once; the exact `72e9d8b` archive read it after the return. **Review 6966711883 repeated it on the gate-installed packages:** the whole 16-event ledger was unchanged, one deduplicated new action was saved, and a changed-ledger negative was refused. That run's receipt was a same-Codespace local copy, not W5's off-provider or owner-device evidence. | **PASS (independent, local)** | — | — |
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
| The existing workspace: verify it is on **Hobby** and empty; payment method; region | **Hobby, with no services: verified by ChatGPT in the signed-in Render dashboard on 2026-11-17** (review-start 6955289084; nothing changed, no service created). The payment method and the region are **unverified**. | The owner (payment method, region) |
| The owner's `age` key pair, and the receiving device | Pending | The owner |
| The private deploy repository, with the audited archive or archives | Assigned to ChatGPT; its state isn't recorded in this repository | ChatGPT |
| The pipeline spend limit | **Set to $0 a month on the workspace's Starter build pipeline: verified by ChatGPT in the dashboard on 2026-11-17** (6955289084). Builds stop once the included minutes are used. **It caps pipeline purchases only:** not service, disk or bandwidth charges. | — (keep it at $0) |
| **Execution windows** for W1–W8, with throwaway data and code | **Pending:** the decision in §3 | The owner |

## 2. The Render execution proposal (none of it executed)
Render facts were re-read from the official pages on **2026-11-17, 16:31Z**. The hashes are appended to [render-fetch-log.txt](../evidence/beta-r4-hosting/render-fetch-log.txt). They match the 2026-11-16 reading on every point used here.

| Area | Proposal | Source |
|---|---|---|
| **Candidate and promotion** | **Hosted W1–W6 run on `7097ac2`,** which is already audited. **Promotion and W7 wait for B-W7-01** (§1 B):<br>• the forward deploy of `72e9d8b` needs its full gate, the package and release record, the independent private archive audit, the compatibility proof on a received copy, and the reviewed pins-only forward commit with its revert;<br>• W7's release-pair test needs that forward deploy.<br>**B-W7-01's local engineering proof has passed** (revision 4), and so has the private W7 audit (§5). **Promotion and W7 now wait only for the owner's execution approval** and the hosted order of §3. Each build passes the unchanged artifact gate (`ARTIFACT_GATE_OK`, `INSTALLED_OK`). | [release-7097ac2.md](release-7097ac2.md), [render-w7.md](render-w7.md) |
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
- **The condition:** the deliberate one-click check runs on **the single planned service**. Reusing the service and disk avoids a second service or disk charge; the usual Render overages and tax may still apply (§3). It runs **only while that service and its disk have never held family data or a real access code.** That means:
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
- **the spend limit:** keep the pipeline limit at the $0 that is already set (verified by ChatGPT on 2026-11-17). It doesn't cap service, disk or bandwidth charges;
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
- **Pipeline minutes beyond 500 a month** are bought automatically, and stop **only** at the configured pipeline spend limit. **It is set to $0** (ChatGPT's dashboard check, 2026-11-17), so builds stop instead of being bought. That limit doesn't cover service, disk or bandwidth charges.
- **Custom domains beyond 2,** at $0.25 per domain per month. None are planned.

### The order of work, by dependency
Each step says what it waits for. None of it is executed or authorized here.

**Without a provider:**
1. **The private W7 audit (ChatGPT): DONE.** The independent Route B browser audit is 6963579755. The exact-pair private-browser and protocol checks are 6966023566 and 6966711883.
   - **History (revision 2):** the audit was outstanding then. Moving it into a hosted window would have been an exception for the owner to decide. It is no longer needed, so no relocation decision is pending.
2. **B-W7-01 (Claude, then ChatGPT; §1 B).** **It blocks step 8 (promotion) and step 9 (W7's release-pair test), not W1–W6.**
   - **Its local engineering proof is DONE** (revision 4). It covers:
     - the full gate on `72e9d8b` (developer-run, independently read), and the package;
     - the independent archive audit (`aac13a8a…`, with `builtAt` read from the selected bytes);
     - the compatibility proof on a received copy (6966023566);
     - the release record ([release-72e9d8b.md](release-72e9d8b.md));
     - the reviewed forward and revert pins patches ([pins-72e9d8b/](pins-72e9d8b/README.md));
     - the exact positive gates and the focused actual-pair protocol check on the retained archives (6966711883).
   - **Not done:** the forward and revert **commits** in the deploy repository. The patches are preparation only, and applying them is step 8.
3. **The owner:**
   - the `age` key pair;
   - the payment method and the region (the Hobby plan, the empty workspace and the $0 pipeline limit were verified by ChatGPT on 2026-11-17);
   - an SSH key on the account.
4. **ChatGPT:** the private deploy repository, holding the audited archive (later, both).
5. **The owner:** the execution decision above.

**On Render, each in an approved window:**
6. **W1–W4 on `7097ac2`.** Steps 1 and 2 are done, so they wait for steps 3, 4 and 5. W1 settles the proxy count; then W2, W3 and W4.
7. **W5 and W6 on `7097ac2`,** including the snapshot restore on throwaway data.
8. **Promotion: the forward deploy of `72e9d8b`.** Step 2 is complete locally. This step:
   - **applies** the reviewed forward patch in the deploy repository, with the exact `aac13a8a…` bytes in `artifact/`;
   - keeps the reviewed revert ready for W7.

   It waits for step 7, so that a backup and its receipt come first, and for the owner's approval.
9. **W7:** the revert-commit rollback to `7097ac2`, and the return. It waits for step 8. Then comes the deliberate one-click check, **only under the synthetic-phase exception** (§2).
10. **W8** on the final release, still on synthetic data.
11. **The owner's go/no-go.** Then `cgn-authorize` for the real folder and code, and the synthetic-phase cleanup (§2).

## 4. What is not claimed
- No independent clearance of W7, which is the hosted run.
- No **hosted** release-pair evidence. The local release-pair proof (B-W7-01) passed. The surrogate `f93e9cb` was only the rehearsal's stand-in, and is not a predecessor.
- No hosted behaviour, and no device results.
- No owner execution decision; none is assumed. **History:** the earlier questions about where the W7 audit happens, and about starting W1–W6 before B-W7-01, are moot now that both are done.
- The Render terms are as read on 2026-11-17 and can change. Tax and invoicing weren't checked. The workspace's plan, its emptiness and its $0 pipeline limit were checked in the dashboard by ChatGPT, not by Claude; the payment method and region were not.

## 5. The preview audit (RESOLVED; kept as dated history)
**Resolved:** ChatGPT completed the private audit over Route B (6963579755), and the exact-pair checks (6966023566, [6966711883](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-6966711883)). **Everything below is history from revision 2 (2026-11-17), and none of it is a current instruction.**

**At that time:** no observation showed an application defect. The exact-origin check accepted or refused as designed each time. What is open concerns the preview and the auditing browser: **infrastructure, not code.**

| Observation | Whose testing | Kind | What it shows, and what it doesn't |
|---|---|---|---|
| ChatGPT's cloud browser: the probe returned `REWRITTEN_SAME_ORIGIN_ONLY` twice, own origin `https://localhost:3157` (6952207048) | ChatGPT, independent | Infrastructure: the preview route | Route A is valid **for that browser session**. |
| The owner's own browser: `UNSUITABLE`, own origin `http://localhost:3157`; the sibling kept its `https://…-3158.app.github.dev` (6954127832) | The owner, supplementary | Infrastructure | The probe correctly refused an `http` origin, which would drop `Secure`. **The screenshot doesn't show the address bar.** So it doesn't establish which URL the tab had, nor that a localhost tab caused the `http` origin. A tab opened from `http://localhost:3157`, the way an editor's local port forward opens it, is **one hypothesis**, not a finding. What it does confirm is that the value is per client, which is why D-BR1R-09 and D-BR1R-10 require the probe in the auditing browser's own session. The owner's device testing is W8, on the hosted URL. |
| ChatGPT's browser: the first health navigation hit `net::ERR_HTTP_RESPONSE_CODE_FAILURE` while the server was still building. The reload was refused: "The requested URL protocol is not allowed. Allowed protocols: http:, https:" | ChatGPT, independent | Infrastructure: the browser tool's policy | The tool's policy rejected the operation. That the reload targeted an internal error page is **a hypothesis**, not established. |

**The smallest supported next action, as proposed then (superseded).** It involved no tunnel experiment, browser workaround, remote display or regression, and there is nothing for Claude to repair.
- **ChatGPT owns resolving its browser restriction without circumvention.** That means finding out, under its tool's own policy, whether a permitted way to open the preview exists.
  - An `https` address alone doesn't establish permission to repeat an operation the policy rejected, and this document doesn't assert that permission.
  - If a permitted way exists, the audit resumes as before: the candidate's local `/health` on the exact SHA; then the probe in that same session (D-BR1R-09, D-BR1R-10); then the W7 journey.
- **The owner, optionally:** which address was in the tab of the `UNSUITABLE` run? That would settle the hypothesis above. It is supplementary, not part of the independent audit.
- **If the private audit can't be completed, W7 stays INCOMPLETE.** Moving the audit elsewhere, for example into a hosted window, is an exception for **the owner's explicit decision**. It is pending, and this proposal doesn't assume it (§3, step 1).
- **Claude:** nothing, unless a handoff asks. No application defect is open.

**Untouched by any of this:** the origin checks, cookie flags, private ports and pins.
