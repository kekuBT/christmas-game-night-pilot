# Beta R4: readiness matrix and Render execution proposal (handoff 6954127832)

**Planning only.** Nothing here is an approval to deploy, merge, create a resource, open a port, spend, or touch production data, and no checkpoint is cleared.
- **The base:** `7c1590cf86e28b82e29766b8d6b54b219df23323` (#50).
- **The runtime candidate:** `988c535` (runtime identical to `72e9d8b`).
- **The audited release:** `7097ac2` (archive `a693c543…3a5131`).
- **W7 stays OPEN.**
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
| **Rollback and return in a browser:** seats, ledger, a persisted action, replay | The developer rehearsal `20261117T073823Z-90aed9d8` passed 46/46 over the API (#50, report 6942141320). ChatGPT's browser journey hasn't run: the preview was blocked, first by Codespaces usage and then by its browser tool's URL policy (6952207048). | Developer PASS (local, MODELLED predecessor); **independent INCOMPLETE** | **W7 can't be cleared** | ChatGPT (§5) |
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
| The pipeline spend limit, set as low as allowed | At creation | The owner |
| **Execution windows** for W1–W8, with throwaway data and code | **Pending:** the decision in §3 | The owner |

## 2. The Render execution proposal (none of it executed)
Render facts were re-read from the official pages on **2026-11-17, 16:31Z**. The hashes are appended to [render-fetch-log.txt](../evidence/beta-r4-hosting/render-fetch-log.txt). They match the 2026-11-16 reading on every point used here.

| Area | Proposal | Source |
|---|---|---|
| **Candidate and promotion** | **Validate on the already-audited `7097ac2` first** (W1–W6), so nothing waits on the second release. Then forward-deploy `72e9d8b` once it is gated, packaged, recorded and independently audited (§1 B), by a reviewed pins-only commit. W7 rolls back to `7097ac2` and returns. Each build passes the unchanged artifact gate (`ARTIFACT_GATE_OK`, `INSTALLED_OK`). | [release-7097ac2.md](release-7097ac2.md), [render-w7.md](render-w7.md) |
| **Service and storage** | One **Docker web service**, **Starter** (512 MB, 0.5 CPU, $7/month), **1 instance**, a **1 GB disk** at `/var/data` ($0.25 per GB per month), in a Hobby workspace that holds only this service. The data folders are `/var/data/cgn-w1` (throwaway) and `/var/data/cgn` (real, after the go/no-go). | [deploy/render/README.md](../../deploy/render/README.md); Render [pricing](https://render.com/pricing), [disks](https://render.com/docs/disks) |
| **Build and start** | The pinned Dockerfile, with no `ARG`. The Docker command stays empty, so `cgn-entrypoint` is PID 1. Auto-deploy off; manual deploys only. Health check path `/health` (open, revision only). | [Docker](https://render.com/docs/docker), [health checks](https://render.com/docs/health-checks): traffic paused after 15 s of failures, a restart after 60 s |
| **TLS, origin, cookies, WebSockets** | Render terminates TLS. Its proxy is **expected** to pass the browser's `Origin` through unchanged: Render's pages don't state it, so W1 checks it on the gate form, the API and `wss://`. If it doesn't, sign-in is refused (fail closed), and no check is relaxed. `MCHEZO_PUBLIC_ORIGIN` is the exact `https://<service>.onrender.com`, the exact-origin check is unchanged, and the cookie is `Secure`, `HttpOnly` and `SameSite=Lax`. `MCHEZO_TRUST_PROXY=1` stands until W1's two tests. WebSockets have no maximum duration, and deploys drop them (clients reconnect). | [WebSockets](https://render.com/docs/websocket), [custom domains](https://render.com/docs/custom-domains) (managed TLS); W1 |
| **Secrets** | The owner types the access code into the dashboard as a secret value. Never through GitHub, chat, a Blueprint or an MCP call (an MCP environment update replaces the whole list). The backup recipient is the owner's **public** `age` key. | [environment variables](https://render.com/docs/environment-variables); README "Secrets" |
| **Backup and restore** | W5: `cgn-backup` stops the writer and copies under the lock (`BACKUP_OK`), then `scp -s` off Render to the owner's storage, then `cgn-receive` (`RECEIPT_OK`). W6: the prepare / commit-or-abort switch. Render's automatic **daily disk snapshots** (kept seven days) are a separate, extra layer. They are never a substitute, and their restore is tested only on throwaway data. | [disks](https://render.com/docs/disks), [SSH](https://render.com/docs/ssh) (paid services only) |
| **One writer** | Render can't scale a service that has a disk, and stops the old instance before starting the new one. Inside the instance, `DataDirLock` and the guard record refuse a second writer or a stale folder. | [disks](https://render.com/docs/disks): "Adding a disk to a service prevents zero-downtime deploys" |
| **Shutdown** | `SIGTERM`, then 30 s. A service with a disk can't change the delay. The entrypoint passes the signal on, and the server closes cleanly. | [deploys](https://render.com/docs/deploys), [disks](https://render.com/docs/disks) |
| **Maintenance** | On outside approved windows. Public requests get 503; SSH and the private network still work. Paid services only. | [maintenance mode](https://render.com/docs/maintenance-mode) |
| **Rollback** | **Revert commits only**, through the same gate ([render-w7.md](render-w7.md)). A one-click rollback restores the target deploy's **environment variables**, and "disks retain state between all deploys and cannot be rolled back", so the guard refuses it (exit 78). Triggering one also disables auto-deploy (already off). The deliberate one-click check runs **on this same service while it holds only throwaway data and a throwaway code**. That needs no second service, so the workspace stays single-service. This clarifies the runbook's "throwaway service". | [rollbacks](https://render.com/docs/rollbacks) |
| **The way in** | The private network spans a workspace and region, and only Pro or higher can block it. So the workspace holds this one service only. | [private network](https://render.com/docs/private-network), [workspaces](https://render.com/docs/team-members) (up to five Hobby workspaces) |

### Why free hosting doesn't meet this app's requirements (Render's pages, 2026-11-17)
- **Free web services have an ephemeral filesystem,** lost "every time" the service redeploys, restarts or spins down. They can't attach a disk ([free](https://render.com/docs/free)). Rooms and Memory Books would be lost.
- **They spin down after 15 minutes** without inbound traffic, WebSocket messages included, and take about a minute to come back. A game night's sockets would drop.
- **No SSH and no maintenance mode** on free services ([SSH](https://render.com/docs/ssh), [maintenance mode](https://render.com/docs/maintenance-mode)). So the backup, restore and rollback procedures can't run.
- **So $0 is possible only by dropping persistence,** which is excluded.
- **The cheaper paths recorded at revision 1, not re-verified today:**
  - Fly.io, about $3.84 per 30 days under a waiver that is policy, not a free tier;
  - Cloudflare Durable Objects, free but a large port.

## 3. The owner decision, and the cost
**Already decided:** the route and the baseline spend (handoff 6919813048).

**Still needed, as one decision:** authorize **execution**. That means:
- **the service:** create the one service, with its disk, in the existing workspace once it is verified as Hobby, with a payment method and a region chosen;
- **the spend limit:** set the pipeline limit to the lowest allowed;
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
| **The planned total** | **up to 17.25** |

**What can add to it:**
- **Bandwidth beyond 5 GB a month,** at $0.15 per GB. **Render documents no spend limit for bandwidth:** the only one it documents is for pipeline minutes.
- **Pipeline minutes beyond 500 a month.** These stop at the spend limit instead of being billed.
- **Custom domains beyond 2,** at $0.25 per domain per month. None are planned.

### The order of work
**Before deployment** (no provider resources):
1. **ChatGPT:** finish W7's independent browser journey on the private preview (§5), or decide that it moves to the hosted window.
2. **Claude, then ChatGPT:** B-W7-01 (§1 B).
   - Claude: the full gate on `72e9d8b`; the package and release record; the forward and revert pins commits; the local checks, with `W7_CURRENT_REVISION` / `W7_PREVIOUS_REVISION` set in `scripts/beta/w7-rehearsal.sh`.
   - ChatGPT: the private archive audit, and compatibility on the audited bytes.
3. **The owner:** the `age` key pair; the workspace plan, payment and region; an SSH key on the account.
4. **ChatGPT:** the private deploy repository, holding the audited archive.
5. **The owner:** the execution decision above.

**After deployment** (each step in an approved window):
6. **W1** on `7097ac2`. This settles the proxy count.
7. **W2, W3 and W4.**
8. **W5 and W6,** including the snapshot restore on throwaway data.
9. **The forward deploy of `72e9d8b`,** with a backup and its receipt first.
10. **W7:** the revert-commit rollback to `7097ac2`, and the return. Then the deliberate one-click check while only throwaway data and a throwaway code exist.
11. **W8** on the final release.
12. **The owner's go/no-go,** then `cgn-authorize` for the real folder and code.

## 4. What is not claimed
- No independent clearance of W7.
- No release-pair evidence. The surrogate `f93e9cb` is not a predecessor.
- No hosted behaviour, and no device results.
- The Render terms are as read on 2026-11-17 and can change. Tax and invoicing weren't checked.

## 5. The unresolved preview audit: the smallest supported next step
**None of the observations shows an application defect.** The exact-origin check behaved as designed every time.

| Observation | Kind | Reading |
|---|---|---|
| ChatGPT's cloud browser: the probe returned `REWRITTEN_SAME_ORIGIN_ONLY` twice, own origin `https://localhost:3157` (6952207048) | Independent | Route A is valid **for that browser session**. |
| The owner's own browser: `UNSUITABLE`, own origin `http://localhost:3157`; the sibling kept its `https://…-3158.app.github.dev` (6954127832) | Owner-observed, supplementary | The probe correctly refused it, since an `http` origin would drop `Secure`. The likely cause is that the owner's target tab was loaded from `http://localhost:3157`, as an editor's local port forward opens it, rather than from the forwarded `https://…-3157.app.github.dev` URL. Then the value is that page's real origin, not the forwarder's rewrite. **The one question:** which address was in the target tab? It needs no rerun. Either way it shows that route A's value is per client, which is why D-BR1R-09 and D-BR1R-10 require the probe in the auditing browser's own session. The owner's devices never need this route: they test on the hosted URL (W8). |
| ChatGPT's browser: the first health navigation hit `net::ERR_HTTP_RESPONSE_CODE_FAILURE` while the server was still building. The **reload** was refused: "The requested URL protocol is not allowed. Allowed protocols: http:, https:" | Infrastructure, in the browser tool | A reload of a failed tab targets the browser's internal error page, not an `http(s)` URL. That would explain a protocol refusal. This is an inference. |

**The proposed step (ChatGPT's, independent):**
1. Start the candidate.
2. Wait until its local `/health` returns the exact SHA.
3. Make **one new navigation**, not a reload, to the `https://<codespace>-3157.app.github.dev/beta` URL. That is an allowed protocol, so there's no workaround and no remote display.
4. Re-run the probe first in that same session, as before.

**If that navigation is also refused,** the cloud browser can't reach the preview. W7's browser journey then moves to the first hosted window (W1's session) on synthetic data, where no preview route is needed. Render's proxy is expected to keep the browser's origin, and W1 checks that first.

**Untouched by any of this:** the origin checks, cookie flags, private ports and pins.
