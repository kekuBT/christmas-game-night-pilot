# Agent Working Agreement — Christmas Game Night

## Roles
Keku: owner and sole final authority over external publication, merge, deployment, spend and material product changes. Muse: primary autonomous local developer, architecture implementer, tester and integrator. ChatGPT: product spec reviewer, adversarial engineering reviewer, optional GitHub snapshot auditor. No synchronous review dependency for routine local development.

## Decision policy
Muse may independently make reversible technical decisions that conform to locked requirements, writing down rationale and alternative in docs/DECISIONS.md. Material open product choices get provisional configurable defaults for local simulation, not an invented 'owner approved' label. Owner sign-off required before official championship use. Safety and privacy defaults are restrictive until explicitly expanded.

## Approval control
GitHub connector fresh consent cannot be removed by instruction; respect read and write cards. Do NOT work around GitHub app using PAT, SSH keys, gh login, device authorization, or secrets extraction. Instead develop in persistent local workspace; locally commit; make official GitHub batch snapshot when approved. A denied or pending approval affects only that external operation, not unrelated local work. Don't spam approval requests or idle-poll issue #2.

## Checkpoints
At start of every working session inspect docs/PROGRESS.md and local git. At end record milestone, exact completed features, file paths, tests, failures, external blockers, next task and risk. Never claim continual unattended operation without a supported scheduled execution actually running. Never silently delete others' changes or force-push.

## Code and PR quality
Strict TS, Zod validation, per-player secret projection, idempotency and score ledger all required. Each game module implements common contract and pure tests. A draft PR includes summary, linked spec/decision IDs, screenshots, commands/run results, limitations, risk and unresolved approvals. No merging/deploying without owner approval. Respect $0 target; no paid resources.

## Safety response
If a secret leak, data-loss bug or score integrity failure is found, stop that unsafe feature, write a reproducible failing test and fix before demoing it. Other independent development may proceed. If a provider needs paid setup, write a feasibility comparison, use local adapter, and request permission only for the actual external step.

## Regression gates
Run gates only through `scripts/run-gate.sh` (see `docs/GATE_RUNNER.md`). It takes an exclusive `flock` on `~/workspace/.mchezo-gate.lock` and writes a timestamped log per run. Never start a second gate while one holds the lock, never run a raw `node scripts/check-*.mjs` loop as a gate, and never write to another run's log. A 28-driver gate takes ~60–70 minutes and does not fit in a 30-minute scheduled slot — do not let a timeout kill a gate mid-run and call the partial log a result. Record the run's log path in `docs/PROGRESS.md` before starting, so any other worker reading the task board sees the gate is claimed. **Never edit `scripts/run-gate.sh` (or any script a running process is executing) while a gate holds the lock — bash reads scripts lazily, so overwriting a running script corrupts the running instance (on 2026-11-05 a mid-run rewrite killed the resume gate with a syntax error at its final line). Treat the runner as frozen for the duration of a run; edit it only when no gate holds the lock.**



---
