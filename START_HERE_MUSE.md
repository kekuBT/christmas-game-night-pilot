# CHRISTMAS GAME NIGHT / THE FAMILY CUP — AUTONOMOUS BUILD DIRECTIVE
Version: 1.0 | 2026-11-03 | Project owner: Keku | Implementer: Meta Muse

## Read this first — authorization and precedence
Keku now **authorizes Muse to design, implement, test and polish the COMPLETE private 11-game application LOCALLY**, including every agreed milestone, without asking for permission to start the next milestone. This supersedes the older planning-only restriction, but ONLY for reversible local development and testing. Do not mistake this authorization for permission to publish, merge, deploy, incur costs, access unapproved accounts, or bypass platform security gates.

**Still prohibited without fresh explicit owner authorization:** merging into main, production or externally reachable deployment, configuring billing/payment, purchasing any service/product, distributing family data or photos, exposing secrets, irreversibly deleting data, and substantial product-scope changes. Remote GitHub connector writes still require any mandatory runtime approval; never circumvent them via PAT/device flow, SSH/private keys, or shell auth workarounds. Local builds/tests/commits are allowed. Publishing a batch to a draft PR may be requested once a coherent checkpoint exists; if an approval blocks that, continue local work. Scheduled jobs are NOT proof that work can run forever; checkpoint at every session.

**Priority of requirements:** Owner's explicit latest instructions > documented locked product constraints > this directive's defaults > Muse engineering choices. Where a previously agreed rule conflicts with an example here, preserve the owner rule. The detailed accompanying files are normative specifications; if missing on your side, this directive remains enough to start and you should recreate equivalent documents locally. Never treat unavailable GitHub access as a blocker to local work.

## The objective
Create a polished, reliable, emotionally memorable browser game platform for 4–10 English-speaking family members during Christmas 2026: private rooms, QR join, iPhone Safari first, Android/desktop, optional shared TV, 11 real playable games, seven-day championship, solo and team play, achievements, Christmas Hub and Memory Book. A guest should understand how to join and play in under one minute. A reconnect should not corrupt scores or reveal secret game data. Experience: cohesive premium 'Midnight Christmas', not a generic dashboard or disconnected demo screens. No required account, install, paywall, ads, or runtime AI.

### Brand and presentation
Colors: deep evergreen #102C25, pine #245344, cranberry #A73545, antique gold #E5BC70, warm snow #F7F2E8. Warm sophisticated type, excellent contrast, large touch targets (>=44 CSS px), short delight animations (respect reduced motion), optional audio/music with default-safe mute and clear controls; avoid copyrighted recordings/assets. Visual emphasis on layered cards, restrained seasonal ornamentation, beautifully structured score reveals, subtle celebrations. Tablet/TV and mobile layouts must be deliberately different. Design the TV as a **public-only view**, never a player's secret state.

## How you must work autonomously
1. **Work locally first.** Create a persistent workspace and initialize or continue local Git. Save code, tests, docs and running progress in durable project files. Check whether an existing workspace contains valuable code before modifying it. Never rely on a process remaining alive between sessions.
2. **Plan, implement, test, fix, then continue.** Break work into small, testable vertical slices. Keep an internal task board with dependencies, acceptance tests, screenshots, risks, and status. Proceed through ALL authorized milestones without another ordinary go-ahead.
3. **One approval must not block unrelated work.** If GitHub read/write, remote API, provider setup, or an external action requires a card, mark it BLOCKED-EXTERNAL, queue the approval only when truly needed, and continue any independent local task. Never spam approval cards; minimize GitHub requests. If platform approval is explicitly required, respect it, including for reads.
4. **No fake completion.** A checklist item is DONE only when implemented, demonstrable, and accompanied by reproducible tests. Never claim browser/Safari/cloud tests passed if only mocked or simulated. Report a local simulation as such.
5. **Choose sensible reversible defaults** for ambiguous low-stakes game details, mark them PROVISIONAL in DECISIONS.md and implement them behind configuration. Escalate only material product choices that change the agreed purpose, privacy, fairness, or cost. Continue building other features while waiting.
6. **Preserve progress.** Before the end of each session write docs/PROGRESS.md: completed, files changed, tests + output, open defects, blocker, next exact command/task. Local git commit clean cohesive chunks. Never keep critical context only in temporary prompts or chat.
7. **GitHub is a checkpoint/coordination channel, not a dependency for every task.** Use the official GitHub connector for GitHub operations and its authorized batch upload. Batch remote changes into draft PR checkpoints when approvals are available, with test evidence, known limitations, acceptance criteria and a concise change summary. Do not merge or deploy. ChatGPT can audit uploaded snapshots later; do not require synchronous inter-agent discussion to progress.
8. **Review your own work adversarially.** Use subagents, if available, only on disjoint tasks (e.g., game content/tests/design); integrate and verify yourself. Include negative/cheating/disconnect tests. Fix critical defects before starting new features, but don't polish a single game forever while the rest remain unbuilt.
9. **Make the project reproducible.** A clean environment must be able to install dependencies, run dev, run tests, build, and run a multi-browser local demo with clear README commands. Lock dependencies; do not depend on your particular VM's private environment.
10. **End state:** all 11 games, room flows, fair championship, hub and Memory Book functional locally, exhaustive tests, privacy protections, mobile-ready UI, documented limits, owner-ready demo checklist. A mock simulation is an honest stepping stone, not a substituted shipped app.

## Product scope — 11 launch games (each must be playable end to end)
1. **Impostor:** hidden-role social deduction. Players receive a shared secret word except one impostor; timed clue/vote/reveal phases, tie policy, impostor guess opportunity, safe private role projections, score by outcomes. Support small 4-player groups. Never send secret to impostor client.
2. **Caption Clash:** family-safe image/prompt captioning; private text entry, anonymized reveal, one vote/person excluding own entry, tie policy, moderation/skip, scoring and funny-answer Memory Book candidate.
3. **Trivia Showdown:** curated multiple-choice pack with timer, correct answer reveal and explanations; server adjudication, small speed bonus (not ping-race heavy), tie policy, content validation.
4. **Word Connections:** group 16 words into 4 categories of 4; mistake cap, progressive category reveals, high-quality hand-curated unambiguous boards, seeded order, hints/accessible selection.
5. **Who Said That?:** match consented family quotes OR clearly licensed/sample fictional quotations to speakers; no fabricated attributed family quotes; opt-out, moderation and reveal controls. Provide a playable generic-content fallback.
6. **Guess the Year:** estimate year of verifiable historical/cultural event from a vetted pack; points for closeness within bounds, reveal source/context. No speculative 'correct' dates.
7. **Closest Wins:** estimate numeric quantities with units and verified answers; closest bid wins with tie policy and optional precision points; never require impossible knowledge without hints.
8. **Category Sprint:** timed rounds naming valid unique examples in a category; server checks a curated answer set or host adjudicates ambiguous entries; duplicate and offensive word handling; avoid claiming impossible complete semantic validation.
9. **Charades:** acting/guessing with phone/TV roles, clear prompt secrecy, round timer, pass/skip, fair team rotation and host verification where required. Works without motion tracking/camera/voice recognition.
10. **Geography Challenge:** six candidate submodes — flag/country, silhouette/country, capital/country, map location, comparative geographic fact, distance/closest-to-target. Do not invent licensed map assets or fake geographic facts; use verifiable permissive datasets/assets or a neutral offline vector/quiz fallback. Modes are PROVISIONAL pending owner review; implement configurations modularly.
11. **Math Mayhem:** ten rapid, approachable multiple-choice arithmetic questions (~5 minutes) including occasional funny word problems; correct = 100 base points + capped modest speed bonus, incorrect = 0; readable, no trick math, no punishing typing; content and arithmetic verified in code.

Every game must support: coherent lobby/setup, host controls, how-to-play with example, game phases, timer semantics, late input handling, reconnect, end condition, score/result breakdown, replay/rematch, accessible controls, deterministic tests, and a separate casual/official mode. Fallback to good curated packs without AI. No unsupported placeholders or 'coming soon' for the eleven.

## Seven-day championship — the fairness contract
- One official playlist/day; players may enjoy unlimited casual games which DO NOT alter championship standings.
- Seven scheduled days; a player needs at least 3 valid player-days; count their best 5 valid daily results.
- Approximately 75% solo and 25% team influence; apply weighting to **normalized daily components**, not raw incompatible game points, when both categories exist.
- Preserve per-game raw scores and rankings for transparency, but official day/championship scores use deterministic documented normalization. Avoid incentives to spam games or inflate raw totals.
- Teams rotate; no team-size point amplification; team members receive appropriately equal team-result credit unless an approved game explicitly differentiates individual contribution.
- A finale may award at most 50 bonus points (owner-approved rule before official use); all overrides append an auditable correction, never erase prior scores.
- This project's design documents provide a **provisional, testable formula** and worked examples. Treat disputed fairness parameters as configurable and request owner sign-off before an actual family championship, not as a reason to stop implementation.
- Admin audit screen must explain why a player is leading, what counted, what was dropped, who qualified and why, including team-credit provenance.

## Recommended architecture (can revise after proving shortcomings)
Monorepo: `apps/web` React+TS+Vite+Tailwind; `apps/server` Worker + SQLite-backed room Durable Object + optional D1; `packages/shared` Zod protocol, types, constants; `packages/games` pure game reducers/config, seeded content; `packages/scoring` pure ledger/normalization; `packages/ui` components; `tests` fixtures/simulation/e2e. npm workspaces okay. Avoid gold-plating; maintain clear boundaries.

Use one DO per room as server-authoritative ordering/state machine with SQLite-backed event log and snapshots; client sends only intents. No client can award points, self-assign roles, alter the clock, judge opponents or reveal secrets. Event envelope includes schemaVersion, roomId, gameId, actorId, clientEventId, sequence, server timestamp; validate before mutation, deduplicate retries; ack and targeted broadcast. Persist deadlines (server timestamps), not JavaScript intervals; hibernation/restart restores exact phase. Use `Date.now()` or injected clock server side; tests use fake clock. Use per-player state projection and entirely separate safe TV projection. Rate-limit joins and actions, cap payloads/text, escape HTML, validate all content; don't leak private state through error messages/telemetry.

Separate device-friendly recovery capability from visible invite/QR code; server stores hashed opaque recovery tokens, rotates on sensitive rebind, revokes on kick, enforces expiry. Rejoin same slot securely after iOS background suspension; never use URL query strings to grant host access. Cohost delegation explicitly defined and audited; when no host online pause host-gated actions, not the whole state machine arbitrarily. D1 can hold archived championship/audit checkpoints later; do not claim atomic transactions across DO SQLite and D1. Include schema migration and export/restore strategy; no silent data loss.

**Offline/local mode is mandatory for development**, not necessarily the final user runtime: a faithful locally executable room server and multi-tab tests. If cloud integration or external credentials are blocked, implement against an adapter and continue with local production-like semantics. Don't substitute client-authoritative localStorage multiplayer for real synced rooms. A local fake must be labeled as fake.

## Cloud cost constraints (verified Nov 2026 docs; reconfirm before deployment)
Cloudflare *does* provide SQLite-backed Durable Objects on Workers Free (not KV-backed DO). Documentation lists **DO 100,000 requests/day, 13,000 GB-s/day, 5M SQL rows read/day, 100k written/day, 5GB storage total**. Workers Free lists **100,000 requests/day and 10ms CPU/request**. D1 free tier exists, but its daily read/write quota now **fails closed** when exceeded. These are separate quotas, not a blanket production guarantee; account eligibility/configuration, usage patterns, data limits, and 2026 details must be checked again. Build a written peak-usage model, reduce heartbeat/chatter, use hibernatable WebSockets, test graceful quota failures. No self-upgrade to a paid tier. Official source URLs:
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/

**Gemini free tier may use content to improve Google's products.** For privacy, do not send family names, personal quotes, private photos, or Memory Book content to third-party AI without explicit informed consent. Optional AI is low priority; offline curated packs are fully sufficient. Source: https://ai.google.dev/gemini-api/docs/pricing

## Build sequence — automatically progress through all milestones
**M0 Design foundation, local setup:** inspect environment; create repo/workspaces, local scripts, ADR/decision log; write honest product/game/championship specs and test matrix. Build a clickable static design-system shell with responsive host/player/TV frames if local coding is authorized (it is). Exit: clean install/build/test, no GitHub dependency.
**M1 Realtime spine:** local room lifecycle/authority, join via code/QR, identities, reconnect, host/cohost, room snapshots, WebSocket protocol, iOS-safe resync, public vs secret projections, event dedupe; locally integrate DO tooling if feasible. Exit: 10 simulated clients, disconnect/rejoin, replay, timer survives restart, data leak tests.
**M2 Gameplay kernel + first three games:** implement reusable finite-state game module and Impostor, Caption Clash, Closest Wins end-to-end, curated packs, host controls/tutorials, scored casual/official results. Exit: E2E multi-device tests, cheating tests, no client-side secrets.
**M3 Championship/remaining eight games:** implement ledger, player/day normalization, team rotation and audit; complete Trivia, Word Connections, Who Said That?, Guess the Year, Category Sprint, Charades, Geography (six modes), Math Mayhem. Build content quality gates. Exit: all 11 games fully playable, audited worked example championship passes.
**M4 Experience layer:** polished lobby, responsive mobile/TV states, Christmas Hub, sound settings, announcements/achievements, Memory Book with consent/approval, share-image/PDF export, realistic day-cycle and finale ceremony. Exit: full seven-day seeded run produces accurate standings and factual book export.
**M5 Hardening and handoff:** feature freeze; accessibility (keyboard, screen reader, reduced motion, color contrast), browser/device matrix, security/threat tests, performance, crash/reconnect, backup/restore, regression/perf load and free-tier estimate; delivery checklist and owner demo. Exit: no P0/P1 defects, reproducible build, evidence report, outstanding product approvals highlighted.

Completing M0 does **not** require a new permission to start M1; likewise all later local milestones. When external approvals block operations, proceed with tasks that do not require them.

## Test and release gates — minimum requirements
Automated: typecheck, lint, unit tests, deterministic seeded game simulations, state machine invariants, protocol validation, per-player public/private projection leak checks, idempotency, fixed clock timers, 10-player concurrency/reconnect, scoring property tests, DB migrations, multi-browser Playwright including WebKit, PDF/export validation and responsive screenshots. Manual: iPhone Safari background/lock/rejoin, Android Chrome, desktop, TV viewport, 4–10 human players, mute, voiceover, reduced motion. Label unexecuted manual tests as UNVERIFIED; report exact command outputs, not just 'passed'.

Attack cases: impersonated host; forged score, wrong-player input, replayed event, two tabs claiming same slot, guessing room codes, client-provided role, XSS caption injection, oversize payload, secret in TV/WebSocket payload, race at timeout, duplicate result commit, host vanishes, midnight day boundary, 3-of-7 qualification, best-five tie, team imbalance, edited past answer pack, quiz wrong answer, Memory Book consent withdrawn. Never publish or upload real family data in test fixtures.

UX criteria: guest join <60 sec, role instructions discoverable, all critical paths touch friendly, no stale score after reconnect, visible actionable failure states and host recovery, nonintrusive error logging. No flashy animation may block play or scoring.

## Reporting and escalation protocol
Keep `docs/PROGRESS.md` and `docs/DECISIONS.md` current. In each progress update use: `[milestone]`, `[done with evidence]`, `[tests and failures]`, `[locally pending]`, `[external approvals queued]`, `[critical owner decision]`, `[next task]`. No meaningless 'still working' updates. Seek Keku's decision in a SINGLE batched digest only when real product decisions threaten correctness; include recommended default and reversible alternative. If unanswered, mark PROVISIONAL and continue unrelated work. Do not treat an unanswered GitHub approval as granted. If you hit a technical dead-end, compare at least two feasible options, preserve working code, and implement the safest local fallback; do not abandon the project.

## Initial action in this very session
1. Acknowledge that **ALL ELEVEN GAMES are now authorized for local implementation/testing**, while remote publishing, merges, deployments and spending remain gated.
2. Read or create the companion docs in this bundle; if unavailable, reconstruct them locally from this directive. Cross-check for conflicts; record assumptions.
3. Inspect the existing persistent workspace before choosing file paths. Create `docs/PROGRESS.md` and a priority task board. Confirm installed toolchain and run the first baseline commands.
4. Begin M0 immediately. Do not wait for a GitHub read approval, ChatGPT review or another user prompt. Stop only where the platform requires an approval or a forbidden external action is unavoidable, and otherwise continue local work.
5. At the end of the session, show real files built, commands/tests, and exactly what will happen next; don't make empty promises of background execution.

**Quality bar:** A family should be able to play these games joyfully on Christmas without you in the room as a developer. A toy mockup, disconnected collection of UIs, or untested scoring system does not meet the brief. Build the actual app locally, then present it for owner-reviewed publishing and deployment.



---
