# Beta R1: readiness and a portable production package

**Authorization:** the owner's priority update on #42, comment 6896572377 (2026-11-15, 10:05 a.m. ET; D-WF-01). It authorizes deployment **conditionally, after readiness clearance**, within the unchanged $0 / no paid AI constraints. It does not authorize spending, merging the stack, disabling games, or weakening score, content or privacy checks. ChatGPT owns host selection and coordinates the deployment; this slice is the readiness work and its report. Acknowledged in 6897903253 (#42).

**Base:** #41's head `1955c28fd907f9f3f05a82a440b2436e09119de8`, the latest independently cleared candidate (Stage 12.16-R, cleared by review 6896200767). Stage 12.17 (#42) is **not** in this base: it isn't cleared yet. Branch `claude/beta-r1-readiness`, one stacked draft PR on #41, linking #5 and 6896572377.

## What exists at the base (read before planning)
- **Running:** `npm run serve` runs `tsx src/server/serve.ts` (`tsx` is a dev dependency). The web app is built by `npm run build:web` into `apps/web/dist` and served by the same process.
- **The build:** `npm run build` (`tsc -p tsconfig.json`) compiles `src/` **and** `tests/` into `dist/`.
- **Dependencies:** the runtime `dependencies` include build-only packages (`vite`, `@vitejs/plugin-react`, `@types/*`), so `npm ci --omit=dev` would still install them.
- **Data:** room snapshots go to `MCHEZO_DATA_DIR`, default `./data`, inside the release directory. Atomic writes, checksums and one previous-good generation already exist (`docs/PERSISTENCE_CONTRACT.md`).
- **Production guards:** with `NODE_ENV=production`, the content test mode, the lifecycle scale and the content-directory override are refused at start.
- **Health:** `GET /health` returns `{ "ok": true }`.
- **Shutdown:** SIGTERM and SIGINT close the server gracefully.
- **Abuse limits:** per-device and per-room rate limits exist.
- **Not yet there:**
  - no `Origin` check on HTTP or WebSocket;
  - no single-writer guard on the data directory;
  - no beta access gate;
  - no backup or restore tooling;
  - no retention policy.
- **External requests:** none found in `src/` or `apps/web/src`: no AI, no analytics, no external fonts (fonts are bundled from `@fontsource-variable`). To be confirmed with the built bundle.
- **Earlier audits** that this builds on: `docs/SECURITY_AUDIT.md` (M5), `docs/K_HARDENING_AUDIT.md`, `docs/J_INFRASTRUCTURE_INSPECTION.md`, `docs/PERSISTENCE_CONTRACT.md`, `docs/RECOVERY_CONTRACT.md`, `docs/COST_FEASIBILITY.md` (its proof gates), `docs/AI_PRIVACY.md`, and `docs/deploy/npm-audit-2026-11-10.md`. That audit is superseded by a fresh one here.

## Plan
1. **A launch blocker matrix at the exact SHA** (`docs/beta/beta-r1-blockers.md`):
   - a production dependency audit with raw output and reachable-risk triage;
   - secrets and test fixtures kept out of the release;
   - HTTP and WebSocket role isolation, origin checks, recovery and abuse limits;
   - data and log privacy, and any external requests.

   Each row gets a status (blocker / fixed here / accepted risk / not applicable) and its evidence.
2. **The smallest production packaging and startup fixes:**
   - a build config for `src/` only;
   - a start command on plain `node`;
   - build-only packages moved to `devDependencies`, so `npm ci --omit=dev` installs only what runs;
   - a release artifact holding the compiled server, the built web app, `content/` and the lock file, proved by a clean install and start from the artifact alone;
   - `/health` reporting a build revision and nothing sensitive;
   - production refusals re-checked, and graceful shutdown proved;
   - a single-writer lock on the data directory.

   Unrelated tooling is not upgraded just to clear an advisory count.
3. **Data outside the release directory:**
   - production requires an explicit data directory outside the release;
   - rooms and Memory Book survive a restart, and phones reconnect;
   - backup and restore into an isolated directory, with checksums verified;
   - rollback: the previous release reads data written by this one, or refuses it safely, never corrupting it;
   - bounded retention as a documented, manual, dry-run-first command that never deletes by itself;
   - disk-full behaviour tested with a simulated write failure.

   Backups are never public or committed, and no owner data is deleted.
4. **Every playable game stays playable** in casual and Practice. No approvals are manufactured; the Official, privacy and integrity rules are unchanged. A genuinely blocking security or data-loss defect found on the way is reported specifically and fixed with a failing test first.
5. **The first release architecture** (`docs/beta/beta-r1-architecture.md`):
   - one Node service serving the built frontend and HTTP/WebSocket on one origin;
   - a persistent volume, behind an HTTPS reverse proxy (an example config, not a provisioned host);
   - restricted admin access;
   - a beta access gate covering HTTP **and** WebSocket;
   - dev and test data isolated from the beta.

   No autoscaling, no second writer, no persistence rewrite.
6. **The release process** (`docs/beta/beta-r1-release.md`):
   - an immutable reviewed SHA and artifact, with manual promotion;
   - no automatic deploy on development pushes;
   - deploys between sessions, with maintenance handling and rollback;
   - private development previews;
   - no promise that active rooms survive an update.
7. **Tests and report:** focused tests during the work; one stable full regression; a new completed report with raw audit, build, test, restore and rollback results, remaining blockers, and real phones distinguished from emulation. The owner's independent private Codespace audit comes before any release clearance.

**Out of scope:** choosing or provisioning a host, accounts, trials, paid resources, public ports, deployment, merging the stack, Stage 12.17 content, and new games.

## Estimate (written before the work, at 11:50 a.m. ET)
About **9 h**.

| Part | Estimate |
|---|---|
| Branch, spec, decisions, draft PR | 30 min |
| Blocker matrix | 1 h 30 min |
| Packaging and startup | 2 h |
| Data, backup/restore/rollback, retention, disk-full | 2 h |
| Architecture, proxy config, beta access (HTTP + WS) | 1 h 30 min |
| Release process and runbook | 30 min |
| Focused tests, one full gate, report | 1 h |

**Risk:**
- **Dependencies:** moving packages between `dependencies` and `devDependencies` touches the lock file. Versions stay the same, and the gate's clean install proves it.
- **The beta gate:** a new check on every request; every driver must still pass with the gate off, which is the default.
- **Disk-full:** the behaviour depends on how `RoomStore` handles a failed write, which the test will show before anything is changed.
