# FULL EXECUTION BRIEF FOR META MUSE

One self-contained handoff document. This version includes ALL project instructions and accompanying specs. Do not stop for GitHub reads; use these instructions as authoritative and reconstruct separate docs locally as needed. Latest owner instructions take precedence.



---

# FILE: START_HERE_MUSE.md

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

# FILE: AGENTS.md

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



---

# FILE: docs/PRODUCT_SPEC.md

# Product Specification — Christmas Game Night / The Family Cup
Status: implementation baseline, owner-locked objectives + provisional detail | v1.0

## Vision and success criteria
The same 4–10 family members should want to return for seven Christmas-season sessions because this is a coherent, funny, competitive, social holiday ritual. It must be fun with 4 players, reliable with 10, accessible to a nontechnical guest, and believable as a family keepsake afterward. A game is not 'complete' because a demo button increments a counter: real players must interact under fair rules and see correct outcomes.

### Locked baseline
- Private room access, no mandatory accounts, browser-based, mobile-first (iPhone Safari, Android Chrome), desktop and optionally TV browser.
- QR and short room-code entry; guest name/avatar; one or more host/cohost; reconnect to same slot without forfeiting results.
- 11 fully playable launch games; modular and individually testable; interactive concise instructions; warm-up/practice; optional casual games outside championship.
- Seven-day championship, one official playlist/day, best five daily results, at least three valid days, ~75% solo/25% team, rotating teams, optional Finale + up to 50 points, achievements.
- Christmas Hub public shared display; immersive player screens; Memory Book created from actual recorded events and approved content.
- $0 service budget until approved, deterministic offline content baseline, no AI dependency.
- Brand: evergreen #102C25, pine #245344, cranberry #A73545, gold #E5BC70, snow #F7F2E8; refined, cozy, celebratory.

### Non-goals
- Public matchmaking, social networking, payments, stores, ads, mandatory sign-in, esports anti-cheat, camera/voice recognition, generative AI deciding winners, endless live content generation, public content sharing by default, 100-person rooms, proprietary game clone.
- The five later ideas (Undercover, One-Night Mystery, Two Truths One Lie, Family Feud style, Risk It) remain extension slots, NOT required launch games.

## Experience map
1. Landing → Join Room / Create Room / How It Works. No network setup exposed to guests.
2. Host creates private room with easily copied room code and QR; default recommended player mode is phones-only; TV may join as an additional read-only display.
3. Player chooses family-friendly nickname + color/avatar, accepts room privacy summary, and sees lobby roster, connection indicator and ready state. Room has an accessible join help screen.
4. Host chooses free-play game or starts official daily playlist. Everyone gets role-specific tutorial / instruction before first game; host sees control surface for start/pause/skip/reveal when legal.
5. During rounds, player phone shows only permitted answers, prompts, role and input; shared display shows public game progress, playful transitions and safe summaries.
6. Results reveal individual/game results and audited points; users can see why points were given. Return to lobby, next game, or Hub.
7. Day closure presents a short ceremony: day winner, close finishes, friendly achievements, summary chapter, standings updates and Memory Book highlights.
8. Across seven days, profiles, scores, approved moments and room roster persist. Finale optional. Owner can export/backup the record locally.

## Modes and players
- 4–10 is the optimized family range. Some social games need a minimum group size (e.g. Impostor >=4); games not eligible at current count are labeled and cannot start until requirements met. Do not silently fill with imaginary online players.
- Phones-only: each sees private state, with a public overview available on a designated host phone/desktop. TV+phones: TV is a **distinct unauthenticated public-role client bound to room**; TV cannot see secret answer keys, individual private prompts, recovery tokens or admin operations.
- Guest recovery: if a browser reloads, prompts the user to resume existing player slot using locally held credential; loss of credential requires host-approved recovery. A display name alone is never a security credential.
- Host + cohosts: host can appoint/revoke cohosts; cohosts may manage operational rounds subject to explicit permission matrix. Host ownership transfer is explicit/audited. Host failure cannot corrupt game state.
- Trust boundary: private family does not mean safe from accidental edits, pasted scripts or anyone guessing a room code.

## Screen inventory and expectations
Landing; room create/join; code+QR; nickname/avatar; lobby; host console; playlist editor; concise rules/help; play screen per game; role-specific privacy screen; score reveal; day ceremony; leaderboard with audit drilldown; achievements; TV Hub; Memory Book daily chapters/photo approvals; settings (sound, reduced motion, large type, privacy); errors/reconnect; export/restore.

## Content strategy
Launch must work without network AI: all trivia/events/geography/word boards/charade words/year/numeric answers must come from reviewed versioned packs with provenance where relevant. Keep content difficulty diverse (not only American pop culture); family-friendly, multicultural and discoverable. Do not use factual 'year' or 'closest number' answers without independently verifiable source. For subjective games, host moderation/adjudication must be explicit and recorded. Localized Ethiopian/Oromo trivia can be a later curated pack with accurate sourcing, not a fabricated launch requirement. Do not use copyrighted music, licensed photos or branded IP assets without permission.

## Accessibility and inclusive fun
- No knowledge-heavy game dominates the playlist; mixing reaction, creativity, memory, logic and social play broadens fairness.
- Portrait smartphone viewport at 320 CSS px; device safe-area insets; readable focus, 44px targets, large numerals, clear timer and progress. Minimum WCAG AA contrast where achievable; no information by color alone.
- Every animation and SFX optional. Provide mute by default or respectful browser-autoplay handling; no flashing/strobe, reduced-motion parity and visible pause state.
- Keyboard and screen reader behavior for all controls; live announcements don't spam; any timed reading can be paused or extended by host for accessibility (with audit when official).
- No gameplay mode should require camera/microphone permissions, GPS, geolocation or paid external service.

## Privacy and retention
Only name/avatar, local recovery capability, game actions, scoring events and explicitly approved highlights are necessary. Guest names are visible to others in the private room; show this before joining. Photos/quotes are opt-in per item and removable; strip EXIF/precise location metadata; use strict size/type limits. No public indexing/shares by default. Self-service reset/export, room archive and TTL/retention configurable. For local demos use synthetic data only.

## Acceptance journey
A full manual test with 4 and 10 local simulated or actual clients must demonstrate: create room; QR join; set name; role-safe Impostor; one deterministic game; simulated disconnect + recovery; complete a mixed playlist; day-close with valid scores; join TV public view; add then revoke Memory Book approval; export an event-grounded keepsake; recover room after server restart. No critical failure or secret leakage is acceptable.

## Open decisions requiring sign-off before real family use
Exact six Geography submodes, championship normalization, 'valid day' rule and participation penalties, finale scoring, family photos storage/consent and live AI data policy. Implement reversible documented defaults locally so work does not stop. See DECISIONS.md.



---

# FILE: docs/GAME_RULES.md

# Game Rules and Acceptance Tests — 11 Launch Games
Status: Owner-locked names/intent; all **specific numerical mechanics below are PROVISIONAL engineering defaults** for local development unless explicitly approved later. Expose host-adjustable timers/difficulty where fair. Use `GAME_RULES` + `CHAMPIONSHIP_RULES` jointly.

## Common game contract
Every module declares a stable ID, semantic version, title, category, min/max players, supported solo/team, contentPackVersion, default duration, accessible tutorial and example, phases, allowed commands per phase/role, pure reducer, derived scores, win/tie rules, sanitized content, public/actor/TV projections, timers stored as absolute server deadlines, deterministic seed, and a test list. Input is untrusted. The server alone determines authoritative outcome. Games yield **raw scores**; the championship scoring module transforms official results into normalized per-game scores. Casual play shows raw results but never posts to official ledger.

### Shared state sequence
Lobby/config -> intro/tutorial -> ready -> round prepare -> timed/private input -> reveal/judge -> raw score event -> next round or final result -> audited official result commit -> return Hub. Invalid/lost clients do not advance phase. Late actions rejected with a friendly message. Duplicate clientEventId acknowledged without scoring twice. Host can pause timers when explicitly allowed (pause is audited in official mode); no hidden-role information leaks in spectator, TV or logs. Every round must have a skip/fallback route for empty content or absent player. For timed submissions, assess on server-receipt timestamp with a generous grace window (e.g. 500–1000ms) configurable for household network jitter, not client clock.

### Content quality
Store versioned, structured packs with question ID, correct answer or judging rule, hints/explanation, difficulty, source/license where factual or image-backed. At least 30 curated items for quiz-style games at prototype exit unless game naturally uses finite boards; enough for a family evening without embarrassing repeats. Separate game logic from packs. Reject contradictory questions (duplicate correct options, impossible dates, incomplete answer sets), offensive entries and missing source provenance. Never pretend an AI-drafted answer was verified.

## G01 Impostor — secret-word social deduction
**Recommended players:** 4–10; one impostor for 4–6, host-configurable one/two for 7–10 but start with exactly one. Assign via secure server RNG (seed stored server-side for audit but never broadcast during active game). Honest players privately receive same word/category; impostor sees only category and 'You are the impostor'. No client receives all roles or the word until allowed reveal.

**Rounds:** host selects pack and 60s discussion/clue collection. Each player offers a short clue in turn or says pass; clues are publicly revealed. Then 45s private simultaneous voting for suspected impostor. Cannot vote self. Locked votes immutable. At timeout, absent votes abstain. Most votes is accused; tied top-vote result means no conviction (explicitly show tie). If convicted person is impostor, allow one 15s secret-word guess. Honest side wins if culprit identified and guess wrong; impostor wins if not convicted or guesses exact word, with normalization/case/punctuation policy defined. One vote per player; dead/missing players handled gracefully.

**Raw scores:** proposed 100 points to members of winning side; 20 individual bonus for a correct suspect vote by honest player; impostor 100 if escapes or guesses word. Because side sizes differ, the leaderboard normalizer must handle ties and scores transparently; evaluate whether side-win bonus overweights the majority. Casual mode always supported. No camera/voice required; text clues displayed.

**Tests:** 4-player, 10-player role counts, impostor never receives secret, vote spoof, self-vote, tie/no conviction, retry, reconnect restores only own role, TV only public clues, case-insensitive guess, round cancellation, identical seeded replay.

## G02 Caption Clash — prompt, caption, anonymous vote
**Players:** 4–10; 3 rounds default, 75s caption writing, 35s voting each. Prompt may be a family-safe original text card or permissively licensed image; must work text-only. Each player submits at most one caption (editable until lock), with max length ~140 characters; host can hide/report offensive content. Captions are anonymously shuffled and presented without names while voting. A player may not vote for their own caption. Each player casts 1 vote; abstentions permitted. If own caption is the only remaining option, skip self-vote.

**Raw scoring:** 100 per received vote plus 25 participation if a valid caption submitted; tied captions share placement; no host arbitrary points except audited override. Show attribution only after voting closes. Funny answers become *candidates*, not automatically approved Memory Book entries.

**Tests:** client cannot see authors during voting, HTML injection escaped, same vote twice, own-vote rejected, all abstain, 4 participants, empty caption, moderation and consent removal, duplicate caption, disconnected contributor, timer.

## G03 Trivia Showdown — verified MCQ
**Players:** 2–10; optimized 4–10; 10 questions, 4 options, 20s per question, answer reveal/explanation after lock. All see same question simultaneously; server binds answer to question ID and shuffles options fairly with canonical option IDs. Every player gets own choice, edit until submission lock or timer expires. No answer sent before reveal.

**Raw scoring:** 100 correct + optional 0–20 speed component for answer received in first 15s, using a coarse bracket to avoid tiny ping advantages; wrong/no answer 0. Host may turn speed bonus off for accessibility. Tie scores share placement.

**Tests:** delayed answer, duplicate replay, wrong answer pack, reordered options with stable IDs, private key leaks, simultaneous 10, deadline based on server clock, consistency of explanation/source.

## G04 Word Connections — sixteen into four coherent groups
**Players:** solo challenge with shared round per person (or optional cooperative casual board); 16 word tiles, four exactly disjoint sets of four, each with a hidden category. Each player independently chooses a group of four, submits a guess, and sees accepted category or mistake count. Default four mistakes before board ends. Timer 4 minutes maximum; category difficulty optionally layered. Each board has unique, editorially reviewed categories (avoid multiple equally valid partitions); shuffle tile positions by seed while maintaining answer IDs.

**Raw scoring:** 100 for each correct group, 50 bonus if zero wrong attempts, 20 if one mistake, otherwise 0; early completion small capped time bonus optional. Do not assign wrong category due to superficial word matching; validate sets by stable tile ID. Hint reduces max bonus but never changes correctness.

**Tests:** no duplicated tile IDs, cannot reselect solved group, multiple valid-looking grouping QA, saved progress after reconnect, mistake cap, hidden category stays hidden until success/end, mobile multi-select accessible.

## G05 Who Said That? — consent-first attribution guessing
**Players:** 4–10; 8–12 questions. Prompts contain a memorable quote or saying plus 3–4 candidate speakers; reveal after all responses or timer. Two pack types: (A) real family quotes individually approved by speaker and host, with explicit opt-out/removal; (B) fictional/clearly labeled sample original quotes with imaginary people for demos. Do NOT invent a real quote and attribute it to a relative, or scrape family chat without permission. If no family submissions exist, the original generic pack makes this game playable.

**Raw scoring:** 100 correct and optionally 10 capped participation/streak bonus; incorrect/no answer 0. Host may privately add/edit a quote pack, with content review status and creator; speakers cannot be forced to contribute. Possible speaker self-knowledge advantage is shown in fairness note; exclude speaker from scoring on their own quote OR use neutral public-source/demo content in official play. Default: exclude speaker from scoring that prompt and normalize eligible opportunities.

**Tests:** attribution permission check, speaker opt-out deletion, unauthorized content leak, generic pack works offline, cannot choose a hidden correct answer with client spoof, avoid own-quote unfairness.

## G06 Guess the Year — chronological closeness
**Players:** 2–10; 8 event cards, ~25s each. Show a verifiable event with a single sourced year, a valid year range and contextual hint. Players submit one integer year; accept only plausible range; reveal answer and brief contextual source. Use global events across eras/countries, not a single franchise.

**Raw scoring (proposed):** `max(0,100 - 10*abs(guess - correctYear))`; exact 100, 1 year off 90, 10+ years off 0. For very old events permit difficulty-specific slope defined in content pack and displayed before play; never hide scoring curve. Ties share placement.

**Tests:** BCE/year-zero policy (avoid BCE packs initially), range validation, event source mismatch, +/- distance, exact vs far scoring, late input, answer reveal.

## G07 Closest Wins — numeric estimation
**Players:** 2–10; 8 questions with a verifiable finite nonnegative or signed numeric target and clear units. Prompts such as length/distance/population must state reference date and acceptable unit conversion if applicable. Entry is numeric and accessible, with magnitude/range hint. No uncited superlatives. Reveal exact answer + source and difference for each guess.

**Raw scoring:** closest absolute error earns 100; 2nd 70; 3rd 50; others 25 for valid attempt. Ties in absolute error share the highest occupied rank's award (a rank-policy variation from championship midranks, clearly separate). Alternatively use a continuous error curve; keep this configurable and consistently explained. No penalty for being above vs below unless declared before round.

**Tests:** negative and decimal inputs, units, ties from opposite sides, all abstain, extreme outliers, zero target, scientific notation rejected or normalized predictably, source data.

## G08 Category Sprint — speed and diversity
**Players:** 4–10; 3 rounds, category announced, 60s to submit up to 5 unique answers each. Host-chosen pre-reviewed category with example but not answer list displayed. Server normalizes case, whitespace and trivial punctuation and rejects duplicate answers by same player; optionally no same answers across players for bonus, but avoid latency race: all responses remain private until reveal and common answer collisions adjudicated simultaneously. Curated deterministic dictionary covers straightforward categories. Unknown/subjective entries become host-judged pending, not automatically wrong due to unavailable language model.

**Raw scoring:** 20 per valid distinct answer, +20 per answer that no other player gave (after simultaneous reveal). Maximum 200 if 5 unique. If contested, host majority/appeal interface records verdict and reason; no automatic AI judging. Provide easy, familiar and varied categories, including an original low-English-dependence pack where possible.

**Tests:** Unicode normalization, synonyms/aliases, repeated answers, race-free shared words, host adjudication, obscene entries, five-answer cap, disconnected player, timer.

## G09 Charades — acted clues, human verified
**Players:** 4–10 in 2 teams where feasible; 4 rounds, 60s turns, roles rotate so each gets a chance to act. Server privately shows charade prompt only to acting player's phone (and optionally a privacy-masked host view), others guess verbally in the room; the game does NOT require camera/microphone permissions or attempt voice recognition. Actor has large Correct/Pass controls; to discourage arbitrary cheating, host/cohost verifies accepted guess or acts as referee. TV shows timer and public scoreboard but NOT secret prompt until revealed.

**Raw scoring:** +100 to team for each correctly guessed charade, 0 for pass; host-configurable 3 passes/turn. Use equal total turn allotment and per-turn rate normalization for uneven teams. For 4-person group, two 2-person teams. For odd player numbers, rotating actor/team assignment must be fair; include host option to use individual 'everybody guesses' casual mode.

**Tests:** unauthorized actor reveal, timer, official host validation, pass limit, team balancing, actor rotation, long prompts, 5-player odd split, spectator projection safety.

## G10 Geography Challenge — 6 proposed submodes in one collection
**Players:** 2–10, 4–10 target; ~5 prompts/mode default; category selector and mixed-mode playlist. Each uses versioned verified data, consistent category progress and independent points.

A. **Flag -> country:** show a legally usable original/attributed flag asset or rendered permissive SVG, choose nation from 4 options; avoid disputed symbols without a source note.
B. **Outline -> country:** simplified country outline SVG from an explicitly licensed dataset; no small-island impossibilities at low zoom; choose from 4.
C. **Capital -> country:** capital named, pick correct country; respect officially multiple capitals / disputed cases; avoid ambiguous prompts.
D. **Locate on map:** user taps approximate location of named country/capital on accessible low-detail map. Server calculates distance against reference coord, not client; include accessible alternative 4-choice region map for non-pointer users. Data and projection/licensing must be explicit.
E. **Higher or lower:** two geographic quantities with verified sources (area, mountain elevation, latitude, etc.), select which is larger; avoid live-changing population unless date-stamped.
F. **Distance challenge:** choose or estimate which location is closest to a target or input a numeric distance in km; score by error with approximate great-circle formula and explicit reference points; avoid asking exact driving distances.

**Raw scoring:** for MCQ modes +100 correct, 0 wrong; for map location +100 within 250km, +70 within 750km, +40 within 1500km, 0 otherwise (region/scale adjustable and disclosed); for distance estimation reuse a transparent closeness scoring rule. No hidden cheating via client-supplied distances. Keep different mode raw scores normalized when official.

**Provisional status:** these six modes were proposed by ChatGPT as candidates, NOT confirmed individually by owner; implement with modular config and mark as requiring owner review before official use. If licensed map data cannot be verified, replace geometry with a working four-choice text/flag variant in local builds and document missing map mode as a blocker, not a fake complete feature.

**Tests:** answer/source review, image license metadata, capital ambiguity, distance endpoints, antimeridian handling, huge/small country click UX, projection privacy, offline packs, six playable flows and scoring consistency.

## G11 Math Mayhem — funny, quick mental arithmetic
**Players:** 2–10; 10 four-choice questions, 20s each plus reveal, ~5 minutes. Questions: addition, subtraction, multiplication, easy division, percentages using whole outcomes, simple word problems. Should be fun for mixed backgrounds, not advanced exams. No trick wording, no hard fractions or difficult algebra. Generate arithmetic from deterministic seeded templates and compute correct answers programmatically; verify distractors unique and plausible. Occasional funny story question is original writing, never personal embarrassment.

**Raw scoring:** +100 for correct, 0 wrong/timeout; small speed bonus **max +20** for early answers in coarse brackets, optional disabled for fairness. E.g. 0–5s +20, 5–10s +10, remaining in time +0. All scoring server-derived, with latency grace; speed never dominates knowledge.

**Tests:** 10 questions exactly, all answers and 4 distinct options verified, divide-by-zero impossible, timer/grace, correct 100 + capped bonus, wrong 0, hidden key, reconnect, 4/10 player play.

## Shared officiating, social safety and presentation rules
- All games disclose the exact raw score before playing and expose the championship normalized score afterward.
- Host can skip bad content without awarding points; reason logged in official mode. Player submissions are sanitized, capped and safe for screen readers/TV. No moderation feature claims fully automatic detection.
- Every game has a compact 3-step tutorial and a practice example. Practice results never count.
- Repeat pack items only after exhausting available items in that session; avoid repeated questions across seven days, persist seen IDs by room.
- Public announcements show names/results only after reveal; secret answers and roles never travel to TV before reveal.
- If a game can't fairly proceed due to too few players or no content, disable start with reason and provide another actual working game.
- Add a game harness that runs all 11 modules with fixed seed, fake clock, deterministic input intents and expected score events.



---

# FILE: docs/CHAMPIONSHIP_RULES.md

# Seven-Day Championship — Deterministic Proposed Rules
Status: **PROVISIONAL FORMULA FOR LOCAL IMPLEMENTATION**, not yet owner-approved for an official family championship.

## Invariants
- Seven calendar **session slots** are explicitly scheduled by the host; dates/time zone stored per room; default room time zone chosen by host; late-night play cannot automatically spill scores into a different day.
- At most one official playlist per day slot. Finalized official results cannot be edited silently or counted twice. Casual games never change championship points.
- Each official playlist is a set of announced game instances. Attendance, eligibility, rosters, game mode (solo/team), raw results, cancellations and justified exclusions are captured before locking the day.
- Only actual eligible human players score. Solo/team weight targets 75/25; team outcomes must not scale with team size. No raw-point aggregation across games with incompatible scales.
- Host override is a signed append-only correction event: actor, time, target, previous calculated value, new corrected value, reason; audit always visible to room participants (private notes, if any, excluded).

## Recommended normalized game score, 0–100
For a completed official game among N eligible competitors (individuals in solo games; TEAMS in team games), use **midrank percentile**: rank each by official raw points descending; ties receive average occupied rank; if N>=2, `gameScore = 100 * (N - averageRank)/(N - 1)`; if N=1, the event is invalid for championship. Clamp and round only for display, not internal calculations. Example N=4 and distinct rankings: 100, 66.666..., 33.333..., 0. Tie for 1st occupying ranks 1 and 2: each score 83.333...; ranks 3,4 score 33.333...,0. A team-result score is awarded equally to all eligible team members; do not multiply contribution by team size. Preserve exact precision in ledger.

**Important tradeoff:** In a 2-team game only 100/0 outcomes occur; creative games need subjective tie adjudication. Disclose exact behavior to Keku, run simulations and compare alternate score transforms before finalizing.

## Provisional official day score
- Recommended official playlist has a mixture of three solo games and one team game. Do not enforce exactly 3:1, but warn if a playlist cannot support ~75/25 experience.
- For any participating player, `SoloAvg = mean(gameScore for all scheduled eligible solo games)`, `TeamAvg = mean(gameScore for all scheduled eligible team games)`.
- If a player joins an official game and receives no valid result because they voluntarily abandon it, default 0 with host appeal; if the host cancels the whole game or marks a participant ineligible before start, exclude that item from relevant denominator. Do not compute an average only over the games someone chose to finish: prevents cherry-picking.
- If a playlist contains both categories, `DayScore = 0.75*SoloAvg + 0.25*TeamAvg`. If **only solo** or **only team** games were scheduled, normalize the available category to 100% rather than treating a missing category as zero; flag the playlist as off-balance and ask host to confirm. If the player skipped every game in one scheduled category, its average is 0.
- **Valid player-day (proposed):** player took part in >=1 successfully completed scheduled official game. This is flexible but permits one-game days; log a fairness warning where total participation was <50% of eligible official games. A more stringent 2-game/50% threshold remains an owner option. A fully absent player has no valid day and no 0 score.

## Best-five-of-seven and minimum-three eligibility
For player P, take valid day scores sorted high-to-low, keep up to five (i.e., the best five of seven). To be championship eligible, P must have >=3 valid days.

**Attendance-neutral provisional championship base score:** `Base = 5 * mean(best min(5, validDayCount) day scores)`. The base range is 0–500 and gives a 3-day player a fair numerical chance while attendees at 5–7 days have more opportunities to replace a weak day. This interprets 'best five' as best *up to* five, rather than a sum in which fewer than five days automatically lose points. Present both interpretations with example before the owner signs off.

Example: Ada valid days [75,80,90,65,70,85], keeps [90,85,80,75,70], mean 80, base 400. Bea valid days [93,89,88] keeps all three, mean 90, base 450, eligible because >=3. Cal only two days [100,100] is ineligible, shown as provisional/unranked. This is deliberate: attending five days increases chance of a good average, but does not grant free points simply for showing up.

**Grand Finale:** Optional 0–50 extra championship points from a separately declared Finale session. Provisional mapping: 50 to 1st, 35 to 2nd, 25 to 3rd, 15 to 4th, 5 to any other eligible finisher, 0 nonparticipant. *Needs owner approval*; must not silently alter eligibility or erase best-five. Configurable disabled by default until sign-off. Grand Finale may change winner by design; disclose in advance.

**Provisional tie-breaks:** higher count of winning valid daily placements among counted days; then higher median of counted day scores; then head-to-head finale placement if both entered; then joint champion. Avoid attendance as an arbitrary unannounced tie-breaker. Ranks and any subsequent adjusted points are reproducible from event log.

## Team assignment and fairness
Rotate teams automatically across team events, aiming to minimize repeated partner pairings and imbalance in team sizes. For odd player counts use uneven teams with a transparent compensation policy: prefer a 3-person team vs 2-person team with neutral difficulty or extra turn normalization; never assume raw points are comparable without per-capita/turn normalization. Provide host manual shuffle with audit and avoid hard-coded gender/age/skill grouping. No player should systematically sit out team games without fair substitute credit; explicit opt-in sit-out can be an excused exclusion before game start.

## Edge cases to test
- Player reconnects and retries same score submission; counted once.
- Host cancels game after one result; voiding event does not alter already finalized other days.
- Tie raw score among two of four; midrank arithmetic verified.
- Solo game 3 players and team game 2 teams; different N handled.
- Score overflow, negative game score, impossible rank and invalid actor rejected.
- Attendance 0/1/2/3/5/7 days, late join, withdrawn player, walkover and cancellation.
- 3- and 5-day players compare correctly, no raw score advantage from playing more games per category.
- Duplicate day close, timezone midnight edge, host override undo via compensating event.
- Championship recomputes identically from ledger after DB migration and restore.

## Owner decisions, not silently final
1. Is mean(best up to five)*5 the preferred fairness model vs sum(best five)?
2. Is at least one game enough for valid day or require majority / minimum 2?
3. Is 75/25 appropriate at day level, and what happens with absent category?
4. Finale 0–50 ladder and its possibility to change champion?
5. Tie-break sequence, team-rotation and odd-size compensation?

All figures here are implementation defaults and test data for LOCAL development. The owner must approve before using them to award real family trophies.



---

# FILE: docs/ARCHITECTURE.md

# Technical Architecture and Engineering Contracts
Status: Candidate design. Local implementation authorized; production/provider selection is NOT authorization to deploy or spend.

## System topology
```
Mobile browser (private role) ─┐
Mobile/desktop host (admin) ──┼── HTTPS/WSS Worker router ── Room Durable Object (SQLite)
TV browser (public view) ─────┘                              ├── room config + player IDs
                                                              ├── event log + outbox + snapshots
                                                              ├── game finite-state machine
                                                              ├── per-client filtered projections
                                                              └── checkpoint coordinator -> D1 optional
Static assets via same origin or separate static hosting (subject to approval).
```
No user accounts required. Room ID is an unguessable internal identifier; displayed short join code resolves only to a public invitation and is subject to brute-force throttling. TV gets a separate read-only capability. Owner/host recovery token is never a URL parameter.

## Repository layout (recommended)
```
apps/web/src/{app,routes,features,components,styles}
apps/server/src/{index,room-do,auth,storage,router}
packages/shared/src/{protocol,schemas,models,constants}
packages/games/src/{registry,core,game-name,content}
packages/scoring/src/{normalization,championship,ledger}
packages/ui/src/{primitives,theme}
tests/{integration,e2e,fixtures,security,load}
docs/{PRODUCT_SPEC,GAME_RULES,CHAMPIONSHIP_RULES,ARCHITECTURE,UX_DESIGN_SYSTEM,TEST_PLAN,MILESTONES,AI_PRIVACY,COST_FEASIBILITY,DECISIONS,PROGRESS}.md
AGENTS.md README.md package-lock.json
```
Start smaller if necessary but preserve these module boundaries. npm workspaces + strict TS. No magic WebSocket mock that is incapable of being replaced with the actual server.

## State model
Room {id, schemaVersion, name, timezone, currentDaySlot, status, hostPlayerId, cohosts[], players[], invitations[], activeGameId?, dailyPlaylist[], achievementRulesVersion, seq, createdAt, expiresAt}; player {id, displayName, avatar, capabilities, connectedSessions[], joinTimestamp, kickedAt?, preferences}; game {instanceId, gameType, version, officialFlag, teamRoster?, roundIndex, phase, deadlineAt?, contentPackId, seed, publicState, privateStateByPlayer, rawResults}; ledger {eventId, seq, roomId, gameInstanceId, playerId?, teamId?, type, points?, issuedAt, issuer, reason, correctionRef?, contentHash}; achievement {ruleId, owner, sourceEventIds}. Preserve actual scoring semantics in versioned data. Changes to game rules after events are recorded do not reinterpret history without an explicit migration/recompute policy.

## Message contracts
Client intent example:
```
{kind:"intent", schemaVersion:1, clientEventId:"uuid", roomId:"opaque", gameInstanceId:"opaque", action:"submit-answer", payload:{optionId:"b"}}
```
Server response:
```
{kind:"ack", clientEventId:"uuid", accepted:true, serverEventId:"opaque", seq:421}
{kind:"projection", seq:421, audience:"player", state:{...redacted role-specific view...}}
{kind:"error", clientEventId:"uuid", code:"PHASE_CLOSED", retryable:false}
```
The authenticated socket/session—not a user-controlled `playerId` in payload—determines actor identity. Validate Zod schema, content length, IDs, action permissions, state-machine phase, deadlines, rate limits, and any per-round action constraints. Dedupe by `(roomId, actorId, clientEventId)`, persist result of intent so retries return original outcome. Prefer event+idempotency index+state mutation in one DO SQLite transaction; if runtime constraints differ, prove atomicity by test and fail closed.

## Durable objects and timers
Use SQLite-backed Durable Object per room, WebSocket hibernation API. Never rely on JS intervals running while idle. Store `deadlineAt` in authoritative state on phase entry, use server current time to compute remaining; schedule alarm for phase transition if needed, and re-check on every client request and restore. Clients render countdown optimistically but cannot advance phase or grant points. A reconnect receives fresh full snapshot with `seq`, then any delta replay. Avoid high-frequency heartbeats to reduce free-tier pressure; use native ping/autoresponse and activity-based presence with `lastSeenAt` separately from player identity.

## Event sourcing and scoring
Record immutable ordered semantic game actions and resulting score events. Reducers deterministic given prior state, action, server-assigned timestamp, and seeded RNG. Rebuild raw per-game score and championship tallies from event log with versioned reducer. Host corrections append events including reason/actor; never update past score rows in place. Command processing must be idempotent across packet duplicates, restarts, client reconnect and a user double-tap. Exactly-once network delivery cannot be assumed; implement exactly-once *effects* via deduplication.

## Storage boundaries and persistence
DO SQLite is authoritative for live room and ongoing game. D1, if adopted, is *derived* archive/read model for summaries, championship history and Memory Book event index, not a second simultaneous writer. Persist checkpoint {roomId, snapshotVersion, highestIncludedSeq, checksum, createdAt}; D1 replication uses an idempotent outbox retry with checkpoint ID and watermark, never claims distributed atomicity. If D1 unavailable or quota exceeded, continue current live game if safe, mark archive as behind, backoff, preserve local DO log, report degraded status; never discard scores. For local development use adapter based on SQLite or provided DO local runtime. Implement schema migrations with fixture of old room format and roundtrip tests.

## Player, host, and TV capabilities
- `joinCode`: short, rate-limited, only resolves to join offer; join itself creates or resumes a player slot.
- `playerRecoveryToken`: random high-entropy credential, hashed at rest, scoped to room+player, HTTPS-only production, not logged or displayed; browser storage threat model stated. Cannot change host identity.
- `hostCapability`: separately generated, strongly authenticated, revoke/rotate; host operations require server capability and current role, not UI buttons alone.
- `cohostGrant`: explicit, revocable, scope-bound operational actions with event/audit trail; no silent owner promotion.
- `tvView`: public read-only projection and reconnect credential only for TV audience; never signs gameplay intents.
- Session binding and two-tabs: either mutually revoke old session or allow explicitly marked secondary read-only session to avoid score duplication.
- Kicked/banned guest tokens are immediately revoked and outstanding sockets closed.

## Private state and projection
`projectForActor(roomState, audience)` is the ONLY pathway to outbound broadcast. Audience types: owner host (still not entitled to arbitrary unrevealed answers where fairness forbids), cohost, individual player, TV public, guest spectator. For each game define explicit allowlist of public fields and role-private fields. Test serialized JSON payload for forbidden canary secret values on every recipient. The prompt/answer key/role assignment must not be included in generic global app state, Redux devtools snapshots delivered to other clients, logs, errors, telemetry, or TV. No CSS-only hiding.

## Frontend runtime behavior
Client connection state: connecting -> joined -> online -> degraded -> reconnecting -> reauthenticated -> snapshot-reconciled; explicit UI for reconnect and host-granted recovery. Dedupe optimistic visual submission with ACK; retract pending UI after rejected action. Support Safari visibility/pagehide/pageshow, app switching, WiFi->mobile path, offline banners and backoff with jitter. `sessionStorage` vs `localStorage` credential trade-off should be threat modeled; never put admin capability in share links. Use safe-area and virtual-keyboard handling. Reduced motion, autoplay restrictions, landscape/portrait and TV pointer/remote navigation.

## Game-engine module interface (conceptual)
```
interface GameModule<Config, State, Action, Result> {
  id: GameId;
  version: number;
  minPlayers: number;
  supportedModes: ('solo'|'team')[];
  validateConfig(input: unknown): Config;
  init(config: Config, roster: Player[], seed: string, now: number): State;
  allowedActions(state: State, actor: Actor, now: number): string[];
  reduce(state: State, intent: Action, actor: Actor, now: number): Transition<State>;
  project(state: State, audience: Audience): unknown;
  result(state: State): Result | null;
  howToPlay(config: Config): Tutorial;
}
```
The interface must never expose score-ledger mutation as a game capability; authoritative coordinator commits final results once. Game-specific RNG should be replayable for tests but unpredictable to real players before reveal. Persist a commitment/hash if provable fairness desired; do not send seed early.

## Security baseline
Use HTTPS/WSS when deployed; Origin and room capability validation on socket upgrade; CSP with minimal trusted scripts, safe React rendering (no unsanitized HTML), client rate limits/room join throttling, short-code collision resistance, input size limits, content moderation review, safe file sniffing/types/sizes, CSRF evaluation for cookie endpoints, no open CORS, dependencies audited, sensitive-data minimization, access-control tests for each host/admin action. No secret keys, API tokens, user photos or personal names in git. Use fake/synthetic content for fixtures. Backend should enforce server max response size, avoid unbounded event-log replay to every client, and paginate archives.

## Failure behavior and backup
- Room becomes unavailable: show retry with preserved local client submissions as pending; never fabricate success.
- Host offline: designated cohost continues authorized operations; if no cohost, host-only phase pauses at safe boundary while common game timers still use explicit policy. Do not promote a guest based only on elapsed time.
- D1 over quota: live room safe; archive pending; export manual fallback where feasible; no paid upgrade.
- All clients disconnect: DO may hibernate; room retains state and deadlines. Seven-day room should not depend on memory-only state.
- Event log corruption or schema mismatch: stop score mutation, preserve raw log, show host repair/export instructions; no silent reset.
- Photos: favor on-device resizing and export; do not silently assume D1/DO is appropriate image hosting. If free object storage/consent unavailable, allow local-only approved photo attachments for export with clear persistence limitation.

## Local development/test strategy
`npm install` (lockfile), `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, optional `npm run test:load`, `npm run dev`. Provide a local server runner with real WebSocket state and deterministic simulated time; use Wrangler `dev --local` when possible without external authentication. A server mock is acceptable solely for isolated unit tests, not the multiplayer acceptance gate. Running a server on local loopback is authorized; exposing via public tunnel or Cloudflare deploy is NOT.



---

# FILE: docs/TEST_PLAN.md

# Test Plan and Acceptance Matrix
Automate wherever possible, with deterministic fixtures. Never describe a simulator as a production browser test.

## Tooling
- Vitest: pure game logic, championship, projections, schema, content validators, reproducible seeded RNG and fixed clock.
- Integration harness: real local socket server or Cloudflare local DO emulator, SQLite data persistence, auth-capability checks, fault injection, restart/resume.
- Playwright Chromium, Firefox, WebKit: player/host/TV E2E, keyboard, responsive viewport, multi-client flows, screenshots/a11y where supported.
- Real manual devices: iPhone Safari, Android Chrome and TV browser as available. Mark NOT RUN when not available.
- npm scripts: typecheck, lint, test, build, test:integration, test:e2e, test:load, content:validate, test:security. All should exit nonzero on failure.

## Global test cases
**Room:** create, invalid code, expired code, attempts limited, join 4/10, duplicate nickname, 2 tabs same token, host appointed/revoked cohost, leave/kick/rejoin, room reset/archival. TV read only even when attacker sends action. QR join does not leak admin authority.

**Protocol:** 500 malformed intents; wrong phase; wrong actor; stale sequence; duplicate ID; replay after reconnect; out-of-order actions; concurrent last-millisecond submissions; payload > allowed; lost ACK followed by retry; unexpected closure; unknown schema version; input XSS and HTML escaped.

**Privacy:** canary words `SECRET_ROLE_CANARY_123`, `ANSWER_KEY_CANARY_456`, `HOST_TOKEN_CANARY_789` inserted into private test state; assert absent from all public, adversarial player, TV, error and log payloads. Assert individual actor receives only own permitted fields.

**Timers:** remaining time derived from injected server clock; exact deadline boundary; pause/resume; hibernation/wake; forced process restart; long idle 7-day gap; UTC midnight vs configured session slot; duplicated timeout alarm; stopwatch drift.

**Scoring:** normalize 2,3,4,10 competitors, tied midranks, 0/1 valid days, exactly 3, exactly 5, exactly 7, best-five drop, team odd count, absent category, 75/25 day weighted contribution, finale bonus 0..50, host override, override reversal via compensation, score recompute after restore.

**Memory Book:** sources must be event IDs that exist, daily chapters match historical result, winners match recomputed ledger, approved photo/quote only, opt-out applies to export, EXIF removed, malicious filename rejected, unsupported file type blocked, PDF generated locally and opens without text clipping, missing photos show graceful fallback.

**Accessibility and responsive:** 320/375/390/428 px portrait, 768px tablet, 1440px desktop and 1920px TV. Touch targets >=44px; focus stays visible on modal; keyboard-only game selection and voting; screen reader names; reduced motion; colorblind-safe status; no essential audio; safe-area insets; screen orientation change; browser reload.

**Performance:** 10 players + TV + host, at least 1k message burst with stable ordering and no duplicated result; high-latency 500ms and 5% packet-loss simulation where framework allows; controlled backend errors; memory growth; backend wake and restore. Collect event counts, SQL rows and Worker/DO resource costs in log/test report.

## Per-game adversarial tests
G01 Impostor: impostor cannot fetch honest word; fair assignment; tied vote; self vote; guess; TV disclosure.
G02 Caption: anonymous until reveal; own vote rejected; sanitized malicious text; tie; no auto-consent to Memory Book.
G03 Trivia: answer not before lock; option-ID shuffle, timeout and speed grace.
G04 Connections: fixed four exact categories, wrong attempt, solved tiles can't repeat, ambiguous board QA.
G05 Who Said That: consented attribution; speaker excluded from own question as decided; fallback pack; opt-out.
G06 Guess Year: integer range, future vs past, exact/error score.
G07 Closest: decimals, opposite-side ties, sources, bad units.
G08 Sprint: duplicate across players not ping race, adjudication, aliases, text sanitization.
G09 Charades: secret actor prompt, host verification, odd teams, pause/pass/time.
G10 Geography: all six modes, licensed geometry, antimeridian, map accessibility fallback, capitals with multiple answers.
G11 Math: 10 questions, 4 unique choices, correct server computation, no div0, <=20 speed bonus.

## Definition of done
- Required behavior present AND test proves it.
- Accessible UI and clear tutorial present, not a raw developer form.
- No private projection leak or score forgery opportunity.
- Edge cases covered and known limitations accurately recorded.
- Local build and relevant tests pass from clean install.
- Screenshots/recordings from tests named and preserved.
- Any official scoring uncertainty documented and configurable, not concealed.

## Test reporting
For each run record date, git commit ID, runtime versions, command, number of tests passed/failed/skipped, fixture state, environment (mock/local DO/WebKit/real iPhone), and 1–3 key artifacts. If a command isn't run, say NOT RUN. Never say 'all tests pass' while omitting failing steps.



---

# FILE: docs/UX_DESIGN_SYSTEM.md

# Midnight Christmas Design System and UX Behavior

## Identity
The Christmas family living room, translated into a deliberate premium digital experience: midnight pine, warm gold, candle-like light, soft snow, restrained cranberry, gentle motion and excellent typography. Avoid a kindergarten clipart festival, giant generic gradients, random emoji backgrounds and low-contrast glass morphism. Never sacrifice usability for ornament.

**Tokens:** background `#102C25`, surface `#245344`, accent `#A73545`, celebration `#E5BC70`, text `#F7F2E8`. Provide accessible text/surface variants, shadows and ring contrast; validate contrast rather than assuming this palette meets WCAG everywhere. 8px spacing grid; 12/16/24px radii as needed; maintain consistent heading scale; limit to two type families, open-license system fonts are acceptable.

## Layout principles
- **Phone:** one dominant task per view, bottom-friendly interactions, sticky input/submit when appropriate, visible timer and player context, clear host vs player roles, safe areas, portrait first. Avoid horizontal scroll and keyboard-covered submit.
- **Desktop host:** overview of participant readiness, playlist, content moderation, timers, appeals and next step; no sensitive player secret displayed accidentally.
- **TV:** high-contrast 10-foot readable presentation, QR with room code, live standings, recent moments, next game, approved highlights; auto-rotate ~20–30s while idle, pause dashboard rotation during game, return automatically. TV shows *only public projection*; no private clue roles or input.

## Visual journeys
1. Landing hero: 'Christmas Game Night' with one inviting sentence, Join / Host, discreet How it Works.
2. Join: 6-character code or QR, clear room privacy note, name/avatar, instant roster.
3. Lobby: centered game context, readable participant chips, host-only controls, 'Ready' indicators.
4. How To Play: maximum 3 steps and concrete example, 15-second digest, expand for full edge cases; cannot trap user in tutorial.
5. Game: one question/input at a time, optional time bar, subtle success/failure feedback, announce round number.
6. Reveal: suspenseful but skippable, legible score table and 'why did I get points?' breakdown, one tap next game.
7. Night ceremony: recognizable winning moments, award, visual but muted-friendly delight, Memory Book opt-in.

## Motion and sound
Use 180–350ms default transitions, delayed 800ms max celebratory reveal that can be skipped. `prefers-reduced-motion` disables nonessential animation. Sound is off until user gesture/explicit opt-in where autoplay is restricted; always expose volume/mute and silent play parity. Any music must be original/commercially licensed, public-domain as verified, or omitted; do not embed commercial Christmas tracks. No auto-play surprises on TV.

## Accessibility
Progress, correct/incorrect and team identity expressed in words/patterns, not only color. Score announcements in aria-live region with throttling. Keyboard tab sequence and screen-reader labels audited. All tap targets 44px; contrast check; large text option; timer accessibility accommodations announced before official game. Focus restored after popovers and modals.

## Content and microcopy
Family-friendly, warm, slightly witty, never patronizing. Invite rather than punish: 'Connection lost. Your spot is saved. Reconnecting…' rather than raw exceptions; 'Your answer arrived after this round closed' rather than silently ignoring it. Avoid personal insults in achievements or placeholder family-specific jokes. Clear finality around locked submissions and official score adjustments.

## Design QA
Capture 320px iPhone, 390px iPhone, 768 tablet, 1440 desktop, 1920 TV screenshots for each primary flow. Test with 4 and 10 roster chips. Run contrast, focus, overflow and keyboard-cover checks. Every one of 11 games must share branding yet have unmistakable game-specific interaction.



---

# FILE: docs/AI_PRIVACY.md

# AI Policy, Data Privacy, Consent and Content Handling

## Runtime policy
The application must be fully enjoyable and fully playable with AI disabled. AI may propose GENERIC fact-based questions or write optional narrative prose from owner-approved nonprivate facts; it never assigns roles, chooses answers, determines win/loss, calculates points, changes deadlines, moderates family quotes without human review, or alters the audit log. Treat model output as untrusted text with schema validation and human review.

## No family data to free AI without informed consent
Google's Gemini free-tier pricing states submitted content may be used to improve its products. Therefore by default send **no real names, photos, family quotes, game chat, room codes, private history, recovery tokens or raw Memory Book content** to any third-party AI. Generic trivia themes and fictional sample text may be sent only after provider terms and current rate limits are checked, and the owner enables the feature. The family's real Memory Book can be generated deterministically from recorded approved events with templates; AI narrative is optional, off by default.

## Content production
Use structured pack schema: source, license, question ID, difficulty, factual answer and explanation, reviewStatus, generatedBy, reviewer, updatedAt, packVersion. User can reject/edit/regenerate draft; AI output cannot go live in a round without explicit host approval and factual validation. Maintain a rich curated offline pack for all deterministic games.

## Photos/quotes
Photo entry requires uploader opt-in and separate approval to display/share/export. Strip EXIF; limit file type, size and quantity; enforce delete/revoke in cached outputs and exports when regenerated. Use anonymized captions where possible. Consent for quotes belongs to person quoted and host editorial approval, especially for Who Said That. Public share image export is an explicit user action, not auto-posted.

## Secrets
Store API keys only in secure server-side runtime environment if AI integration ever authorized. Never in Vite public env, browser JS, GitHub files or logs. Paid upgrade or third-party integration must never be enabled automatically. Muse development-agent complementary access is not the product runtime API.

## Fallbacks
If AI fails/returns 429, invalid facts, offensive text, provider outages, or review declined: preserve room state and switch to vetted local pack or local deterministic chapter template; show unobtrusive notice to host, not disruption to family play.



---

# FILE: docs/COST_FEASIBILITY.md

# $0 Feasibility, Cloud Limits, AI and Exit Conditions
Verified research links as of November 3, 2026; reconfirm live before provider provisioning. Source values are planning inputs, not warranty or account-specific entitlement.

## Cloudflare candidate
Source [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/): SQLite-backed Durable Objects are available on Workers Free. The docs list **100,000 DO requests/day, 13,000 GB-s/day compute duration, 5,000,000 SQLite rows read/day, 100,000 written/day and 5 GB account storage** on Free. No KV-backed new objects on Free. A `20:1` billing/request-count ratio applies to incoming WebSocket messages for compute request metering, but NOT to message/metrics counts; do not naively assume every HTTP and DO request quota is interchangeable.

Source [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Workers Free lists 100,000 requests/day, 10 ms CPU per request and 128 MB memory. Worker routing/validation must be efficient; more expensive logic belongs in the DO within its separate CPU budget. Measure worst-case actual use.

Source [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Sept 1, 2026 enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/): D1 has a free plan and applies hard row read/write limits. Since September 2026, queries fail when daily row limits are exhausted, until reset; storage itself is not deleted. DO's budget and D1's budget must be modeled separately.

## Preliminary family usage model — MUST MEASURE
Assumption: one room, 10 players + TV, 2 hours/day for seven days, 4 games/day, per game average 20 player action messages x 10 players, 10 room join/reconnect events and 10 alarms per day. Gives about `4 * 20 * 10 = 800` incoming game action messages/day, plus joins and setup/admin actions. Even with a generous x10 headroom for extra interactions, far below 100k/day DO requests as a *rough order of magnitude*. This is NOT a forecast for connection cost, active duration, SQL row operations, archive reads, AI or asset fetches; profile the actual app with `N=10`, timer cadence, real message volume, connection lifetime and free-tier behavior. Prefer event-driven updates over 1-second per-client heartbeats; a simple mistake could multiply writes by thousands. Include storage growth after 7 days and retry/backfill behavior.

## Costs and approvals
- No credit card registration, provider account upgrade, paid tier, domain purchase, API charges, paid assets/fonts, email/SMS provider, managed DB service or paid telemetry without explicit Keku approval.
- Local development with open-source npm packages is permitted (review licenses and security; do not install suspicious packages).
- Do not enable automatic deployments/production CI that could spend money or publish work. Official GitHub remote writes may need runtime approval even with owner standing authorization; respect connector gating.
- If limits fail, preserve functional local build and propose a narrower free alternative (e.g. static content + alternate free realtime, simplified photo storage) with exact tradeoffs. Do not change backend vendors silently.

## AI privacy
Official [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) states free-tier submitted content may be used to improve Google's products. Never send private family quotes, photos, names or Memory Book content to Gemini free tier without explicit owner+participant-informed consent; preferably do not send personal content at all. AI can draft **generic** question packs from nonpersonal topics only, subject to host review and factual verification. Runtime AI unavailable must never disable games. Internal Muse developer access isn't automatically an app runtime entitlement.

## Proof gates before any future public deployment
[ ] Account confirms free services and quota model
[ ] End-to-end 4–10 player room tested against actual backend or parity environment
[ ] WebSocket hibernation/state restore and server-side timers proved
[ ] Safari real-device tests completed
[ ] Quota fail-closed behavior and recovery demonstrated
[ ] Source/image/license policy satisfied
[ ] Secret and personal data excluded from logs/analytics
[ ] Backup/restore and deletion demonstrated
[ ] Owner explicitly approves publication/deployment

No deployment is authorized by this document.



---

# FILE: docs/DECISIONS.md

# Decision Log — Ownership and Current Status
Record future ADR entries append-only: ID, date, status (LOCKED / PROVISIONAL / OPEN-OWNER / ARCHITECT-SETTLED / REJECTED), owner, alternatives, decision, rationale, evidence, consequences, implementation flag, rollback strategy.

| ID | Topic | Status | Owner | Current working choice | Alternatives / gate |
|---|---|---|---|---|---|
| D-001 | Private family scope, 4–10, browser only, phone/TV | LOCKED | Keku | Guest code/QR, no mandatory accounts | No public accounts/monetization |
| D-002 | 11 named launch games + five later ideas excluded | LOCKED | Keku | All 11 locally implemented | No substitutions without owner decision |
| D-003 | Seven-day championship, best five, min three | LOCKED | Keku | Seven host-defined slots | Exact fairness formula provisional |
| D-004 | 75% solo / 25% team | LOCKED target | Keku | Daily normalized components | Exact placement of weight OPEN-OWNER |
| D-005 | Championship normalized ranking | OPEN-OWNER | Keku | Per-game midrank, daily 75/25, best up to five * mean *5 | Raw sum, placement points, minimum 5 days; sign-off before official use |
| D-006 | Valid player-day and partial attendance | OPEN-OWNER | Keku | >=1 official game; transparent low-participation warning | Min 2 or majority; sign-off |
| D-007 | Grand Finale | OPEN-OWNER | Keku | Disabled by default, max +50; sample ladder | Flat or relative bonus; can it overturn winner |
| D-008 | Geography six modes | OPEN-OWNER | Keku | Flag, outline, capital, map pin, higher-lower, distance | Scope/license and accessibility review |
| D-009 | Room host failover | PROVISIONAL | Muse+ChatGPT | Explicit cohosts may run eligible operations; ownership not auto transferred | Automatic promotion (higher risk), host-only pause |
| D-010 | Multiplayer backend | ARCHITECT-SETTLED candidate, not deployment approved | Muse+ChatGPT | SQLite-backed DO/WebSockets, Worker router, optional D1 archive | Alternative realtime free hosting if load/limits fail |
| D-011 | AI | LOCKED optional; integration OPEN | Keku | Offline packs; AI off for private data; late-stage generic review only | Paid/private AI on explicit consent+permission |
| D-012 | Photo storage/consent | OPEN-OWNER | Keku | Opt-in approved entries, EXIF stripped; local export first | Remote storage requires approved provider and retention policy |
| D-013 | Autonomous implementation | LOCKED | Keku | All 11 games and milestones locally authorized | No merge, deploy, spend, GitHub gate bypass |
| D-014 | GitHub collaboration | LOCKED operational constraint | Muse+ChatGPT | Local-first, batch official connector writes, draft PR review; respect fresh approvals | Direct shell auth workaround prohibited |
| D-015 | Content moderation/quote consent | PROVISIONAL privacy default | Keku+architects | Participant consents to attributed family quote, host approval; demo original content fallback | No invented real-person quotes |
| D-016 | Championship ties | PROVISIONAL | Muse+ChatGPT | Midrank tie, counted daily wins, counted median, finale, joint rank | Owner sign-off before official use |
| D-017 | SFX and music | LOCKED optional | Keku | Mute/opt-in; original/open licensed sounds | No copyrighted commercial track embedding |
| D-018 | Realtime free infrastructure quota | VERIFIED docs, unverified account/deployment | Muse | DO free SQLite available with hard limits; profile and recheck | Paid not permitted without approval |

## Escalation rubric
**Do not ask owner for:** filename choices, code organization, test fixtures, package versions within existing free stack, visual spacing, typical accessible defaults, provisional timers/question counts that can be configured, test-first implementation order, local bug repairs.

**Ask owner before:** changing the 11-game list, adding a required account, sending personal data externally, making payment, merging, any internet-accessible deployment, permanently deleting records, adopting a provider with paid risk, changing core championship fairness after explicit sign-off, exposing family photos or personal quotes, using non-free copyrighted assets.

**Owner decision packet format:** 1 paragraph issue, ranked alternatives with objective tradeoff, recommended reversible default and test, blocking/nonblocking status, what Muse is continuing meanwhile. Batch choices instead of one approval request per detail.

## Evidence and reconciliation
Cloudflare free limits from official docs checked November 3, 2026; no deployment account verified. Prior kickoff Issue #2 is useful background but Muse must not need to read it for local implementation. If a companion doc is missing, reconstruct it from START_HERE_MUSE.md and record the difference, rather than halting work.



---

# FILE: docs/MILESTONES.md

# Autonomous Development Roadmap and Exit Gates
All milestones **locally authorized**, not remote publication/deployment. Order optimizes technical risk and player-perceived value. Do not claim 'done' unless exit criteria pass; maintain exact evidence in PROGRESS.md. Dependencies can overlap through isolated tasks.

| Stage | Target outcomes | Exit criteria | Recommended first demo |
|---|---|---|---|
| M0 — Local foundation | Repository/workspaces, baseline test/build, theme, basic UX frame, risk/decision log, content schema | Clean install/typecheck/lint/test/build; 320px/TV layouts; no hidden external dependency | Landing, lobby and TV shell locally |
| M1 — Multiplayer spine | Room create/join, QR, host/cohost, secure identities, WebSocket server, DO SQLite integration local, reconnect, public/private projections | Ten simultaneous clients; live room state; double-submit dedupe; timer after restart; secret projection test; join code brute-force mitigation | 4-player lobby and one private-message demo |
| M2 — Engine + flagship trio | Game contract, Impostor, Caption Clash, Closest Wins, practice/help/finish/rematch | Real interactive 4/10 player match per game; scoring server-side; cheating/late input/tie tests; visually polished results | Family plays three games on phones |
| M3 — Championship + other eight | Replayable normalized ledger, team/solo playlist, days, roster rotations; Trivia, Connections, Who Said That, Year, Sprint, Charades, Geography 6 modes, Math | All 11 feature-complete, no placeholder; 7-day worked examples, at least 3 day eligibility, best five and 75/25; restore/override audit | Full daily playlist with seeded 10 people |
| M4 — Christmas experience | Hub, achievements, day ceremony, Memory Book and exports, full brand/polish, sound/accessibility | TV never sees secrets; book contains only approved factual events/photos; download matches source; participant can revoke approval; screen reader controls | End-to-end day-to-keepsake ceremony |
| M5 — Hardening/handoff | Threat/performance/accessibility audit, Safari real device (if available), backups, quotas, content provenance, docs and owner demo | 0 open P0/P1, repeatable clean build, test matrix signed with unverified items explicit, no paid/production changes | 7-day family rehearsal with synthetic users |

## Stop-the-line defects
P0: private word/role/answer exposed; host spoof; duplicated or lost official scoring; repeated server crash/data loss; write access to real external services without authorization; harmful secret leak. P1: iPhone unusable, cannot rejoin, game permanently stuck, scores incorrect, 11 games not actually playable, Memory Book fabricates real people/events. P2: minor styling, occasional confetti defect, nonessential animation.

Do not block all engineering on P2 polish. Resolve P0/P1 in currently touched vertical slice before scaling. If any P0 discovered, do not present app as ready to publish.

## Local proof strategy
Progression: schema/unit tests -> in-process deterministic simulator -> 4-tab real socket test -> 10-tab load/integration -> WebKit/Chromium/Firefox E2E -> manual real iPhone Safari/Android/TV (if actually accessible). Track each result as PASS/FAIL/BLOCKED/NOT RUN. Playwright WebKit is **not** a real iPhone Safari hardware test.

## Vertical slicing each game
1. Read exact GAME_RULES section and clarify ambiguities by reversible documented defaults.
2. Implement versioned content pack and validator.
3. Implement pure rules state/reducer, time/ties/disconnect semantics.
4. Add per-player and TV projection assertions.
5. Add server protocol integration and official/casual score commit.
6. Add tutorial/practice and accessible mobile UX.
7. Simulate 4 and 10 players with cheating/duplicate actions.
8. Render final score explanation and report evidence.

## Progress reporting template
```
Milestone: M1 (day/session)
Implemented: [exact screen, file, endpoint, behavior]
Evidence: [commands + exact pass/fail counts, screenshots filenames, test log path]
Open defects: [severity, reproducer, owner]
Decisions: [ID, provisional or signed-off]
Blocked external: [one GitHub approval; exact operation; local fallback]
Next three atomic tasks: [specific files, tests, expected outputs]
```

## GitHub checkpoint packet format
Submit no more than one draft PR per coherent milestone or major vertical slice where practicable. Include PR body: problem/goal; changes; acceptance checklist; actual unit/integration/E2E commands + output; screenshots; known limitations/untested manual devices; security notes; open owner decisions; file-change summary. Ask for a single required approval using official connector. Don't submit placeholder PRs. If remote publishing blocked, continue local git commits and `docs/PROGRESS.md`.

## Owner handoff checklist
- Local runnable demo with `README.md` steps on a clean machine.
- Screenshots/video evidence of mobile+TV; no fake pass claims.
- Rulebook explaining games, official scoring, attendance, finale, host moderation.
- Configuration guide for room, playlists, content packs and backups.
- Security and privacy notes including what data is stored and deletion process.
- Written honest $0 model, vendor checks, and remaining deployment prerequisites.
- List of every owner decision needed before real use, each with recommended default and tradeoff.



---

# FILE: docs/PROGRESS.md

# Muse local progress and resume checkpoint
Updated: Not yet started by Muse (template created by ChatGPT)

## Current milestone
M0 — bootstrap and design

## Completed with evidence
- [ ] Workspace inspected; no existing work overwritten
- [ ] Dependencies installed (command/output)
- [ ] Typecheck/lint/tests/build initial baseline (command/output)
- [ ] App design shell bootstrapped
- [ ] Local WebSocket room design and risk audit started

## Task board (next three)
1. Inspect persistent workspace; preserve existing files and note git status.
2. Set up npm monorepo workspaces, scripts, and minimal responsive shell; run tests.
3. Implement shared event/room schema and unit tests for state/projection.

## Open defects
None recorded (NOT equivalent to zero defects; app not built yet).

## External approvals pending
None queued. Do not request GitHub read merely to commence local work.

## Unresolved owner decisions
See DECISIONS.md. Keep reversible defaults; do not claim owner-approved championship math.

## Last commands actually run
None by Muse yet; update this section with reproducible output.

## Next session exact resume step
Open this file and confirm workspace/git status before editing; begin the first incomplete task.

