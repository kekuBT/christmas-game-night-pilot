# The Render package: a reviewable candidate (Beta R4, handoff 6919813048)

**Status: prepared and checked locally. Nothing is deployed.** No Render account was used, no service exists, and nothing was bought.
- **What the owner approved:** the Render setup in [the proposal](../../docs/beta/beta-r4-hosting-proposal.md): Starter + a 1 GB disk, a $7.25/month baseline with usage overages disclosed, and a public URL behind the access gate.
- **Current status** (2026-11-16, from handoff 6919813048 as edited and review 6921505856):
  - **The account:** connected. The owner chose their **existing** workspace, and the connector found no services, databases or Key Value instances in it. **Its plan still has to be verified as Hobby.** On Pro the baseline would be $32.25/month, which is outside the approval.
  - **The off-provider backup destination:** selected by the owner (a private folder). ChatGPT verified access and owner-only sharing. Its link isn't in this repository.
  - **Still pending:**
    - the Hobby-plan check;
    - the transfer, receipt (`RECEIPT_OK`) and restore checks with throwaway data (W5, W6);
    - the owner's `age` key pair;
    - the real-device and network steps.
- **History:** the package was first written (at `405f06f`) for "a new Hobby workspace" and a destination still to be chosen. The requirement behind the workspace wording is unchanged: nothing else is in the workspace.
- **The runtime is unchanged:** `7097ac2bb062925bb296a129f4771f1e68fd522d`. This folder only packages the audited archive of it.
- **W1:** how to run it is in [render-w1.md](../../docs/beta/render-w1.md); the local evidence is in [beta-r4-render-package](../../docs/evidence/beta-r4-render-package/README.md).

## What is here
| File | What it is |
|---|---|
| `Dockerfile` | Three stages, every base image pinned by digest, **no `ARG`**:<ul><li>`age`: builds age v1.2.1 from source and checks the binary's pinned SHA-256;</li><li>`gate`: runs the artifact gate on the audited archive;</li><li>`runtime`: the slim Node 22.16.0 image with the verified release (read-only, owned by root), the three reviewed scripts, age, and the non-root user `cgn`.</li></ul> |
| `.dockerignore` | An allowlist. Only the files the Dockerfile copies can enter the build context, so a file Render copies into the context (its "secret files") never reaches the image. |
| `cgn-artifact-gate.sh` | The artifact gate. `gate` runs at build time; `installed` reruns on the finished image, and over SSH on the instance. The checks are listed at the top of the file. |
| `cgn-entrypoint.sh`, `cgn-backup.sh`, `cgn-authorize.sh` | **Byte for byte the reviewed round-5 scripts** (`docs/evidence/beta-r4-hosting/backup-drill/deploy/*.sh.txt`, accepted in review 6919662222). The gate refuses any other bytes. In the image they are `/usr/local/bin/cgn-entrypoint`, `cgn-backup` and `cgn-authorize`. |
| `operator/cgn-receive.sh` | The reviewed receiving-side script. It runs on the device that receives the backup, **never in the image**. |
| `pins/` | `archive.sha256` (the audited archive), `release-7097ac2.inventory.sha256` (its 144 files), `scripts.sha256` (the three scripts), `age.sha256` (the age binary). |
| `render.yaml` | The configuration below as a Render Blueprint. **A candidate, not applied.** The dashboard route is equivalent. |

**Not here, on purpose: the audited archive.** It is `mchezo-7097ac2.tgz` (SHA-256 `a693c543…3a5131`), kept privately by ChatGPT ([release record](../../docs/beta/release-7097ac2.md)). This session can't reach it, and it is not committed to this repository.

## The pinned inventory
| What | Pinned value | Where it is enforced |
|---|---|---|
| Runtime revision | `7097ac2bb062925bb296a129f4771f1e68fd522d` (no `-dirty`) | gate: `release.json` |
| Audited archive | `mchezo-7097ac2.tgz`, SHA-256 `a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131` | gate: `pins/archive.sha256`; `artifact/` must hold exactly that file |
| Its files | 144 files, inventory digest `fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c` (the same list as `docs/beta/release-7097ac2.inventory.sha256`) | gate and `installed`: byte-for-byte comparison, plus the file count |
| Node | `v22.16.0` in `release.json`, in the build stage and in the runtime | gate and `installed` |
| Runtime packages | `ws` 8.22.1 (`sha512-oyL6OPYm…UtK9g==`) and `zod` 3.25.76 (`sha512-gzUt/qt8…NQxcQ==`), from the archive's `package-lock.json` by `npm ci --omit=dev --ignore-scripts` | gate and `installed`: nothing else in `node_modules` |
| Build image | `docker.io/library/node:22.16.0-bookworm@sha256:71bcbb3b215b3fa84b5b167585675072f4c270855e37a599803f1a58141a0716` | `FROM … AS gate` |
| Runtime image | `docker.io/library/node:22.16.0-bookworm-slim@sha256:048ed02c5fd52e86fda6fbd2f6a76cf0d4492fd6c6fee9e2c463ed5108da0e34` | `FROM … AS runtime` |
| Go toolchain | `docker.io/library/golang:1.24.4-bookworm@sha256:10f549dc8489597aa7ed2b62008199bb96717f52a8e8434ea035d5b44368f8a6` | `FROM … AS age` |
| age | module `filippo.io/age v1.2.1` (`h1:X0TZjehAZylOIj4DubWYU1vWQxv9bJpo+Uu2/LGhi1o=`, checked by Go against `sum.golang.org`); its dependencies are recorded in the evidence | the Go module checksum database |
| age binary | `linux/amd64`, `CGO_ENABLED=0`, `-trimpath`: SHA-256 `e9f29db5f16a0da8761d5945c93c9518d81cbaa3ab428277f4465793038613f0` (two separate builds were byte-identical) | `pins/age.sha256` |
| Deploy scripts | `cgn-entrypoint.sh` `6c623dd0…6b4157`, `cgn-backup.sh` `accca178…c63c`, `cgn-authorize.sh` `b77c398e…20773` (full values in `pins/scripts.sha256`) | gate: step 1 |

**How the image digests were confirmed:** each image was pulled from two independent official mirrors, Google's (`mirror.gcr.io/library`) and AWS's (`public.ecr.aws/docker/library`), and both gave the same digests. Docker Hub itself answered 429 (rate limited) from this sandbox. A digest pin can only match exactly that content, so a wrong digest would fail the build; it can't be silently replaced.

**The image itself:**
- **User:** runs as `cgn` (uid/gid 10001), with shell `/bin/bash` and `~/.ssh` at 0700 (both required by Render's SSH). Its password field is `*`, so no password ever works, without the account being "locked".
- **Data folder:** `/var/data` is 0700, owned by `cgn`.
- **The release:** `/app` is owned by root, and no file in it is writable by group or others.
- **Fixed environment:** `NODE_ENV=production`, `PORT=10000`, `MCHEZO_LISTEN_HOST=0.0.0.0`, and the `CGN_*` defaults the scripts use.
- **Start-up:** `CMD ["/usr/local/bin/cgn-entrypoint"]`, so the entrypoint is PID 1.

## Assembling the deploy repository (ChatGPT, privately)
The accepted proposal puts these files and the audited archive in a **private deploy repository**. It isn't created here: this session doesn't create repositories.
1. Copy this folder's files to the deploy repository's root, except `operator/` and this README: `Dockerfile`, `.dockerignore`, `cgn-artifact-gate.sh`, the three `cgn-*.sh`, `pins/` and `render.yaml` (if used).
2. Put the audited archive at `artifact/mchezo-7097ac2.tgz`, and nothing else in `artifact/`.
3. Before committing, run `sha256sum artifact/mchezo-7097ac2.tgz`. It must print `a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131`. The build checks it again anyway.
4. Commit nothing else: no `.env` file, no key, no code.

**Alternative:** build from this repository with Root Directory / Docker context `deploy/render`. That puts the archive in this repository on a deploy branch. It is the owner's choice, and isn't recommended.

## The exact Render configuration
For the dashboard (or the MCP integration, where it can), or `render.yaml`. **One service, in a Hobby workspace that holds nothing else:** the owner's existing, otherwise-empty workspace, once its plan is verified.

| Setting | Value | Why |
|---|---|---|
| Workspace | **the owner's existing workspace** (otherwise empty, as the connector showed on 2026-11-16). It must be on **Hobby** (to be verified) and hold **only this service**. | The private network spans a workspace and region, and a Hobby workspace can't block it. `0.0.0.0:10000` is then reachable only through Render's proxy. |
| Service type, runtime | Web Service, **Docker**, from the private deploy repository and branch | |
| Dockerfile path / Docker context | `./Dockerfile` / `.` (the repository root) | |
| Docker command | **empty** | The image's exec-form CMD keeps `cgn-entrypoint` as PID 1, which `SIGTERM` handling and the hold need. |
| Pre-deploy command, build filter, root directory | none | The disk isn't reachable from a pre-deploy command anyway. |
| Instance type | **Starter**: 0.5 CPU, 512 MB, **$7/month** (Blueprint `0.5c-512mb`; the MCP tool's `starter`) | Approved. Anything bigger needs a new approval. |
| Instances | **1** | One writer; a service with a disk can't scale out anyway. |
| Region | **to confirm** (suggested `virginia`, US East) | Can't be changed after creation. |
| Disk | name `cgn-data`, mount path **`/var/data`**, size **1 GB** ($0.25/month) | Approved. **The Blueprint default is 10 GB; `sizeGB: 1` must be stated.** A disk can grow, never shrink. |
| Health check path | **`/health`** | It is open without the access code and returns only `{"ok":true,"revision":…}`. |
| Auto-deploy | **Off** (Blueprint `autoDeployTrigger: "off"`, MCP `autoDeploy: "no"`) | Manual deploys only. |
| Maintenance mode | **On**, except inside an approved window | Public requests then get 503; SSH still works. |
| `MCHEZO_DATA_DIR` | `/var/data/cgn-w1` (**throwaway**) | The real folder (`/var/data/cgn`) only after W1–W8 and the go/no-go, authorized first. |
| `MCHEZO_PUBLIC_ORIGIN` | `https://<service>.onrender.com`, exactly as Render shows it (no trailing slash) | Must equal the address the browser uses. The cookie is `Secure` because it is `https://`. |
| `MCHEZO_TRUST_PROXY` | `1` to start | Settled by W1's forgery and separation tests. Each change is a redeploy and needs `cgn-authorize` first. |
| `MCHEZO_BETA_ACCESS_CODE` | **a throwaway code for W1** (at least 12 characters), **typed by the owner into the dashboard** as a secret value | Never in GitHub, chat, a Blueprint file or an MCP call (see below). |
| `CGN_BACKUP_RECIPIENT` | **pending**: the owner's `age` public key (`age1…`) | Not needed for W1; needed for W5. |
| Not set | `NODE_ENV`, `PORT`, `MCHEZO_LISTEN_HOST` | The image sets them (`production`, `10000`, `0.0.0.0`). |
| Must never be set | `MCHEZO_CONTENT_TEST_MODE`, `MCHEZO_LIFECYCLE_SCALE`, `MCHEZO_CONTENT_DIR`, `MCHEZO_PUBLIC_ACCESS` | The first three are test settings that production refuses. The fourth would open the site without a code. |
| Build pipeline spend limit (workspace) | the lowest Render allows | Builds stop instead of buying minutes. Each build compiles age and runs `npm ci`. |
| SSH | the operator's public key on the Render account | For `cgn-authorize`, `cgn-artifact-gate.sh installed /app` and, later, `cgn-backup`. |
| Not used | custom domain, one-click rollback, Render Postgres, dedicated IP, Pro workspace | Each is either a new cost or is excluded by the rollback rules. |

**Secrets and environment variables:**
- **Each Render environment variable is also a build argument.** The Dockerfile declares no `ARG`, so none of them, the access code included, can reach the image.
- **The MCP tool `update_environment_variables` replaces the complete list.** A call that leaves out the access code removes it, and the server then refuses to start (fail closed).
- **A call that includes the code puts it in the AI's context.** So environment changes go through the dashboard, by the owner, for anything secret.

## What the Render integration can't do (dashboard fallback)
Source: Render's MCP server documentation and its README, both read 2026-11-16 (`render.com/docs/mcp-server`; `github.com/render-oss/render-mcp-server`, hashes in the fetch log). The documentation says:
- "The MCP server does not support all configuration options when creating services"
- it "supports limited changes to existing Render resources" (a deploy, and environment variables)
- "does not support modifying scaling settings or other operational service controls"

| Control | Through the integration | Dashboard fallback needed |
|---|---|---|
| Select the owner's **existing** workspace, and check that it lists no other service | Yes (`list_workspaces`, `select_workspace`, `list_services`) | — |
| Verify that workspace's **plan** (Hobby, not Pro) | No billing tool is documented | **Yes** (billing settings) |
| Payment method, plan, billing, **pipeline spend limit** | No | **Yes** |
| Create the Docker web service (repository, branch, Dockerfile path, context, plan `starter`, region, auto-deploy `no`) | Yes (`create_web_service`) | — |
| Attach the **1 GB disk at `/var/data`** | **No** (`create_web_service` has no disk option, and nothing updates one) | **Yes**, or a Blueprint |
| **Health check path** `/health` | **No** (not a create option; `update_web_service` only returns a dashboard link) | **Yes**, or a Blueprint |
| **Maintenance mode** on/off | **No** ("operational service controls") | **Yes**, or a Blueprint (on only) |
| The access code (a secret value) | It could, but the value would pass through the AI's context, and the update replaces the whole list | **Yes, by the owner** |
| The other environment values | Yes (`update_environment_variables`, the complete list) | Preferably the dashboard, for the reason above |
| A **manual deploy** | Yes (`trigger_deploy`) | — |
| A **restart** (W1 check 4, second half) | No (`trigger_deploy` is a deploy) | **Yes** |
| SSH keys; an SSH session (`cgn-authorize`, `installed` check) | No | **Yes** (account settings; then the operator's terminal) |
| Disk snapshots, restore (W6) | No | **Yes** |
| Deploy history, logs, events (`maintenance_mode_enabled`, `disk_created`, `server_failed`), CPU and memory | Yes (`list_deploys`, `list_logs`, `list_events`, `get_metrics`) | — |
| "The workspace holds exactly one service" | Yes (`list_services`) | — |
| Blueprints (`create_blueprint`, `plan_blueprint`, `approve_blueprint`) | Listed in the README at `main`, **not on the documentation page**: confirm they exist in the session. Required environment values passed to `approve_blueprint` "appear as plaintext in the agent context", so the code must not go that way. | If not available: the dashboard |
| A one-click rollback | Not to be used (the rules) | — |

## What was checked here (locally, no Render)
See [the evidence](../../docs/evidence/beta-r4-render-package/README.md).
- **The image build:**
  - from a local rebuild of `7097ac2` given a test pin;
  - the production pin refuses that rebuild;
  - ten other refusals: a changed file, another revision, `-dirty`, a link, shipped `node_modules`, an extra file, a changed script, a second artifact, a wrong age pin, and a context file that must not reach the image;
  - the other archive layout is accepted.
- **The container:** non-root, first install, `cgn-authorize`, the guard's five refusals, `SIGTERM`, restart with the room restored, `cgn-backup` → `BACKUP_OK` → `cgn-receive` → `RECEIPT_OK`, and a root-owned disk failing closed.
- **The W1 checker:** its self-test, against the image behind a Render-like local proxy, with right and deliberately wrong proxy counts, maintenance, no redirect, and a service that never comes back.

**What it does not prove:** anything about Render itself. These are W1's job, and none is claimed here:
- whether Render's disk mount is writable by a non-root user;
- what `X-Forwarded-For` looks like there;
- whether Docker Hub pulls succeed in Render's build;
- whether the Render build host is `amd64` (if it isn't, the age pin fails the build: it fails closed).
