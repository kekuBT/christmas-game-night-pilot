# Decisions — Christmas Game Night (DRAFT, not published as final)

Status: Local draft prepared by Muse in response to Issue #2, ChatGPT comment 6622099490.
Do not treat any entry marked Open or Proposed as final. No app code, no merge, no deployment, no spending.
Source of discussion: GitHub Issue #2 in kekuBT/christmas-game-night-pilot. Batch publication to GitHub is subject to Keku's write approval.

How to read this file:
- Owner = who leads the draft. Architect-settled = Muse + ChatGPT can settle, recorded here. Keku-approved = needs Keku's product approval before it is final.
- Evidence required = what would close the decision (document, test, or worked example), not just agreement in chat.

## D01 — Cloudflare as realtime backend, and $0 claim
- Owner: ChatGPT (source-backed comparison) / Muse (architectural impact + alternatives)
- Status: Open — highest urgency, M0 exit requirement
- Recommendation (draft): Treat Cloudflare Workers + Durable Objects + D1 as a candidate, not a guaranteed $0 solution, until current official limits are recorded.
- Alternatives: (a) Cloudflare as proposed, (b) another free-tier realtime backend, (c) reduced-scope realtime model with less persistence.
- Evidence required: Current official Cloudflare pricing/limits for Workers, Durable Objects, D1, WebSocket hibernation, storage, alarms, and request ceilings, with links and dates, recorded here.

## D02 — Source of truth split: Durable Object vs D1
- Owner: Muse, with ChatGPT review
- Status: Proposed
- Recommendation: Durable Object per room is the live source of truth; D1 is a checkpoint / championship / audit store, written at phase and day boundaries, not per tick.
- Alternatives: D1 as live store (rejected in draft: write contention and latency risk); single-store only (rejected: loses either realtime or durability).
- Evidence required: M1 PoC checkpoint test (see ARCHITECTURE.md).

## D03 — DO / D1 checkpoint reconciliation (no atomic dual-store transaction)
- Owner: Muse
- Status: Proposed, practical with explicit design — see below
- Recommendation: Every checkpoint carries a checkpointId, source event range, and snapshot hash. D1 writes are idempotent by checkpointId and retried. On recovery, load the latest DO snapshot, replay events after it, and if D1 and DO disagree, the DO event log wins for the live game and the disagreement is logged as an incident, not silently overwritten.
- Alternatives: Assume atomic consistency across DO and D1 (rejected: unproven, per ChatGPT comment 6622099490).
- Evidence required: M1 PoC test for checkpoint retry, duplicate checkpoint, and disagreement recovery.

## D04 — Hibernation-safe timers
- Owner: Muse
- Status: Proposed
- Recommendation: Persist server deadlines (timestamps), not a continuously running timer. Remaining time is always derived as deadline minus server now. On wake from hibernation, recompute, do not resume a stale countdown.
- Evidence required: M1 PoC hibernation test with a timer crossing a hibernation wake.

## D05 — Reconnect, recovery tokens, and host authority
- Owner: Muse, with Keku approval for permissions/timeouts
- Status: Open — architect proposal, owner decisions pending
- Recommendation (draft): Player slot = playerId + deviceId + opaque recovery token, hashed server-side. Reconnect re-issues private state only after token verification. Reconnection and host authority are separately authenticated. A designated cohost may perform operational host actions during a host disconnect, with no automatic transfer of ultimate ownership; if no cohost is present, pause host-dependent phases while preserving timers/state under a defined policy.
- Alternatives: Auto-promote cohost to full owner on disconnect (not recommended in draft); pause-until-host-returns for all host actions.
- Evidence required: Keku decision on cohost permissions, timeout, and new-device handling. M1 PoC reconnect test after simulated Safari suspension.

## D06 — Per-player and TV projections
- Owner: Muse
- Status: Proposed
- Recommendation: Server holds full state and broadcasts filtered views only — per-player private view, and a separate public TV view. Hidden roles, answers, and unrevealed scores must never be sent to a client that should not see them.
- Evidence required: Payload-level tests asserting what TV and non-role players actually receive.

## D07 — Event, idempotency, and audit log
- Owner: Muse
- Status: Proposed
- Recommendation: Client intents carry clientEventId; server validates, appends to an append-only log, applies a reducer, derives scores, and acks with a server event ID. Duplicates return the original ack with no double score. Host overrides are separate audited events with reason, actor, and timestamp, never edits to past events.
- Evidence required: Duplicate-delivery and override-audit tests in M1/M2.

## D08 — Geography Challenge: six candidate modes
- Owner: ChatGPT (proposal) / Keku (approval)
- Status: Open — candidates only, not approved
- Candidates: (a) country from outline, (b) flag-to-country, (c) capital-to-country, (d) map pin / locate the place, (e) higher-or-lower geographic facts, (f) distance / closest-to-target guessing.
- Recommendation: Assess each for mobile UX, map/data licensing, difficulty, and content-pack feasibility, and present options to Keku rather than silently fixing the six.
- Evidence required: Licensing and content-pack check per mode, plus a mobile UX note per mode.

## D09 — Championship: official game, valid day, and daily normalized scoring
- Owner: ChatGPT (draft proposal) / Keku (approval)
- Status: Proposed — draft principles, not settled formulas
- Draft proposal (from ChatGPT comment 6622099490): An official game is a completed scheduled game with recorded participants and no unresolved scoring dispute. A valid player-day is participation in at least one official game that day. A day score is a normalized percentage or rank-derived value, not raw game points, so playing more games does not automatically win. Daily solo and team components combine 75/25 at the daily-score level when both exist, with explicit handling for days with only one category. Best five valid daily scores count; at least three valid days to qualify.
- Assessment (Muse, draft): Practical, with conditions — see Issue #2 reply. Normalization needs a defined denominator per game, a rule for single-category days, and worked numerical examples before it is final.
- Evidence required: Worked numerical examples from ChatGPT, including absent-category alternatives, for Keku approval.

## D10 — Championship tie-breaks and team fairness
- Owner: ChatGPT (draft) / Keku (approval)
- Status: Proposed
- Draft proposal: Tie-break order — more first-place daily finishes, then higher median counted-day score, then shared placement. Team points should reflect team result fairly for all members, avoiding team-size amplification.
- Evidence required: Worked examples showing team-size cases and tie cases.

## D11 — Grand Finale
- Owner: Keku (approval)
- Status: Open
- Draft scope: Optional, worth up to 50 bonus points (from kickoff). Whether it can overturn the championship, how it is earned, and who qualifies are not settled.
- Evidence required: Keku decision, plus a worked example showing its effect on a close championship.

## D12 — Host override scope
- Owner: Keku (approval)
- Status: Open
- Questions: Who can override, what can be overridden, and what audit visibility players get.
- Evidence required: Keku decision, recorded with an override-audit example.

## D13 — AI integration: scope and timing
- Owner: ChatGPT (product) / Muse (enforcement and fallback)
- Status: Proposed — defer runtime integration
- Recommendation: Keep optional AI in the product vision, defer runtime integration until after core games and reliability, with no launch dependency. Deterministic offline packs first. Any eventual AI pack must be host-reviewed before use, and private family content must not be sent to a third party without explicit consent and verified terms. AI has no authority over scoring, timers, secrets, or roles.
- Evidence required: Verified Gemini Flash (or other provider) free-tier terms, rate limits, and data handling, only if AI is revived after M2/M3.

## D14 — Milestone order
- Owner: Muse, with ChatGPT review
- Status: Proposed
- Recommendation: M0 spec and cost validation → M1 networking/reconnect PoC → M2 foundation + first game → M3 remaining games + championship ledger (moved earlier than in the first draft, to avoid retrofitting event capture/scoring) → M4 TV Hub / Memory Book → M5 accessibility, device, and release audit.
- Evidence required: Agreement in Issue #2, then MILESTONES.md with objective exit criteria per milestone.

## D15 — Room, player, and Memory Book basics
- Owner: Keku (approval), with architect input
- Status: Open
- Questions: Default mode (phones-only vs TV+phones), QR / room code expiry, room lifetime across 7 days, photo consent and storage limits for Memory Book, and what counts as an approved highlight.
- Evidence required: Keku decisions, plus a storage/consent note for photos.

---
Next update: After ChatGPT's reply to Muse's Issue #2 assessment, and after Keku's decisions on D08–D12 and D15, this draft should be updated with decision IDs, dates, and links to the worked examples.

---
## Local implementation decisions — 2026-11-03 (M0, appended, original Issue #2 decisions above preserved)

- **L01 — Project root:** `christmas-game-night-pilot-local` is the main application root, per Keku 2026-11-03 23:23 EST. No separate competing project was created. Existing Issue #2 docs were preserved; brief docs were written alongside as `docs/*-brief.md` where a file already existed.
- **L02 — Local-only mode:** Development is local-only until Keku explicitly asks for a GitHub review/publishing session. No GitHub publishing or approval requests are initiated in this mode. Local git commits only, no remote push. The 30-minute GitHub coordination cron `hourly-github-coordination-christmas-pilot` was paused (enabled=false, verified) on 2026-11-03.
- **L03 — Cloudflare:** No Cloudflare account setup, provisioning, billing, or deployment. Local multiplayer is built with an in-process / local adapter first. Behaviour tested locally is labelled LOCAL; Cloudflare Durable Object / D1-specific behaviour is labelled UNTESTED-CLOUD until a real (approved) deployment test exists.
- **L04 — Test content:** Fictional names, fictional family scenarios, and synthetic test players only. No real family photos, private quotes, or identifying personal data in code, tests, or fixtures.
- **L05 — Runtime for M0 (CORRECTED after reading project AGENTS.md):** Project AGENTS.md requires strict TypeScript and Zod validation, so M0 uses TypeScript + Zod + Vitest (standard open-source npm packages, $0, npm registry verified reachable 2026-11-03). Layout is a single TypeScript package with module-boundary directories (`src/shared/`, `src/games/`, `src/scoring/`, `src/server/`) instead of a full npm-workspaces monorepo for M0, to keep the build reproducible; splitting into workspaces is a later reversible refactor, not a scope change. The web shell in M0 is a static HTML/CSS shell only, not a React app and not gameplay — React is not claimed until it exists.
- **L06 — Championship formula (PROVISIONAL, not owner-approved):** Midrank percentile per game (0–100), day score = 0.75*soloAvg + 0.25*teamAvg when both categories exist, otherwise the available category normalised to 100% with an off-balance flag, best up to five valid days, minimum three valid days, base = 5 * mean(best days). Finale ladder (50/35/25/15/5) disabled by default. See `docs/CHAMPIONSHIP_RULES.md` and `packages/scoring/`.
- **L07 — Scoring safety:** Server (room engine) is the only score writer. Client intents are validated, deduplicated by `(roomId, actorId, clientEventId)`, and projected per-player / TV-public only. Secrets (roles, answer keys, recovery tokens) are never included in public or TV projections — tested with canary values.
- **L08 — One game at a time (2026-11-04, found by Playwright E2E):** `startGame` now throws "A game is already in progress" while any game is `playing`. Rationale: the browser UI renders a single active-game panel (first playing game), so a second concurrent game orphaned the first — it could never become active again, and the E2E driver stalled behind it. Alternative considered: queue/allow concurrent games and add a game switcher UI — deferred as a product decision for Keku; the guard is reversible. Evidence: `tests/room.test.ts` "cannot start a second game while one is playing"; full 11-game Playwright run re-run after the fix.
- **L09 — WebSocket open/close drives `connected` (2026-11-04, found by F3 multiplayer check):** WS open (player/host/cohost audience) now sets `connected = true`; WS close sets `connected = false` only when no other socket for that player remains. Rationale: previously close set false but nothing on open restored true — only the manual Reconnect button did — so a plain page reload left a player permanently "disconnected" for `startGame`'s connected-player count, and starting a 4-player game after a reload failed with "Need at least 4 connected players" even though the reloaded tab was live. Alternative considered: auto-call /reconnect on page mount — unnecessary once socket lifecycle is authoritative, and it would reintroduce a token round-trip on every load. Evidence: `tests/integration.test.ts` "WebSocket open/close tracks connected"; `scripts/check-multiplayer.mjs` 12/12.

- **L10 — Session token authentication (2026-11-04, PR #3 review #1):** The recovery token issued at join time is the session credential for the HTTP/WS adapter. Clients send it as `x-session-token` (HTTP) or `sessionToken` (WS query); the server hashes it and derives actor and role from the matching player record. Client-supplied `actorId`, `hostId`, `approverId`, and audience-role claims are ignored for player-scoped endpoints. TV projection remains public. Rationale: the engine already stored only token hashes, so no new credential store was needed; the adapter was the trust boundary that was missing. Trade-off: tokens live in sessionStorage per tab, same as before, so this fixes server-side impersonation, not browser-tab theft — a family-local threat model, documented here. Evidence: `tests/review-fixes.test.ts` #1 (three tests: projection spoof, intent/host spoof, WS spoof).
- **L11 — Official-only standings (2026-11-04, PR #3 review #2):** `RoomEngine.officialStandings()` sums midrank scores over finished, official, non-timed-out games only, and the projection carries it as `officialStandings`. The browser uses the server value (with an official-only fallback) for championship and TV standings; practice games still appear in finished-game history but never in standings. Ledger `game-finished` events now record `official`. Evidence: `tests/review-fixes.test.ts` #2.
- **L12 — Memory Book durability and grounding (2026-11-04, PR #3 review #3):** Books persist to `<roomId>.book.json` beside the room snapshot and restore on server start; add/approve/revoke persist immediately. `addFromLedger` now requires at least one source event and requires every source to be a `game-finished` event; derived factual facts (score-awarded events for the same game) are stored separately as `derivedFacts` and exported under "From the ledger:", while human text is exported as "Note:". Approve/revoke at the HTTP boundary require host/cohost. Evidence: `tests/review-fixes.test.ts` #3 (including restart), `tests/m4.test.ts` updated to cite a real finished game.
- **L13 — Deadlines and host skip (2026-11-04, PR #3 review #4):** Social intents after `deadlineAt` are rejected with PHASE_CLOSED (Math already rejected late answers). A host/cohost may close a stalled game after its deadline via `skipTimedOutGame` / POST `/rooms/:id/games/:gid/skip`; the game is marked `timedOut`, no scores are invented, and official standings exclude it. This is a host-safe close, not an automatic abstention engine — per-game abstention semantics (e.g. vote resolution with abstentions) remain an open product refinement, not silently implemented. Evidence: `tests/review-fixes.test.ts` #4; browser shows a host-only skip button for past-deadline playing games.
- **L14 — Secure seed by default (2026-11-04, PR #3 review #5):** `startGame` uses `crypto.randomInt` when no explicit seed is given; the old default of 42 is removed. Explicit seeds remain for controlled tests (deterministic Impostor, Math, Trivia). Evidence: `tests/review-fixes.test.ts` #5.
- **L15 — Charades pass and turn count (2026-11-04, PR #3 review #6):** Passes advance a new `promptIndex` within the same turn, up to 3 per turn, then PASS_LIMIT; Correct ends the turn. The game lasts one acting turn per player (total turns = roster size), not a fixed 4. The spec's "4 rounds" wording is ambiguous here; one full rotation is the implemented interpretation, reversible by owner decision. Old states without `promptIndex` fall back to `turnIndex`. Evidence: `tests/review-fixes.test.ts` #6; existing 4-player test still passes (4 turns = 4 players).
- **L16 — Frontend typecheck (2026-11-04, PR #3 review #7):** `apps/web/tsconfig.json` (strict, react-jsx, bundler) plus `apps/web/src/types.ts` (Projection, PublicPlayer, PublicGame, PlayerGame, GameState, RegistryGame, MemoryEntry, LedgerEvent, JoinResponse) and `npm run typecheck:web`; the main `typecheck` script now runs server and web checks. Game-specific state is typed as GameState (all optional fields) rather than fully union-typed per game — a documented limitation, not a claim of full game-state typing. Evidence: `npm run typecheck` exit 0 (server + web).
- **L17 — No GitHub publication for review fixes (2026-11-04, Keku instruction):** All PR #3 review fixes are local only, per Keku's "no need to go to GitHub now". No PR reply, branch update, or snapshot was pushed in this work; the next GitHub step, if any, needs a fresh explicit authorization.

- **L18 — WebSocket token in subprotocol, not URL (2026-11-04, completion sprint P1):** Player/host/cohost WebSocket connections now present the session token as `Sec-WebSocket-Protocol: cgn-session-<token>`; the server derives the actor from the token in that header. The old `?sessionToken=` query form is removed, and a URL-only token is rejected with 1008. Rationale: URL tokens leak into server logs, browser history, and referers; the handshake header is not logged by this server and is not part of the URL. Limitation, stated honestly: the token still travels in the handshake header and still lives in sessionStorage per tab, so this closes URL exposure and server-side impersonation, not token theft from a compromised browser tab. Evidence: `tests/sprint-p1.test.ts` (URL-only rejected, subprotocol accepted).
- **L19 — Disconnected players do not block games (2026-11-04, completion sprint P2):** Game completion gates now use connected players only (`activePlayers`), falling back to all players if nobody is connected. A disconnected player's partial answers still count; they simply cannot stall the room. Host skip remains for the all-disconnected case. Evidence: `tests/sprint-p2.test.ts`.
- **L20 — Server championship, day, override, ceremony in projections (2026-11-04, completion sprint P2):** The projection now carries `championshipDay`, `championship` (full 7-day provisional calculation), `achievements`, and `ceremony` from the server, plus `day` per game. Host/cohost endpoints: `POST /rooms/:id/day` (advance day) and `POST /rooms/:id/games/:gid/override` (audited score correction with required reason). The browser championship view uses the server values, labelled provisional. Evidence: `tests/sprint-p2.test.ts`, `tests/sprint-http.test.ts`.

- **L21 — Family Cup championship rules, OWNER-APPROVED 2026-11-04 (Keku):** Seven scheduled days; at least three qualifying days to be eligible; main score = sum of best three daily scores; daily score = 75% solo + 25% team with midrank 0–100 placement (ties share average rank); participation +5 per qualifying day beyond three, capped +20; Grand Finale up to +50; practice games never count toward scores or attendance; missing days add nothing and do not reduce the best-three total. Formula: Total = Sum(Best 3) + Participation + Finale. This REPLACES the provisional best-five / 5×mean formula (L06) — old tests and docs were updated, not left alongside. Still configurable in `CHAMPIONSHIP_CONFIG` (src/scoring/championship.ts), per Keku: the precise qualifying-day threshold (currently ≥1 completed official game that day), days-without-team-games handling (currently available-category at 100%, flagged off-balance; "scaled" mode implemented as a config switch but not selected), and the Grand Finale ladder (50/35/25/15/5, disabled by default until a finale is run). Ranking: eligible first, then total, then daily wins, then counted median, then finale placement, then joint. Evidence: `tests/family-cup.test.ts` (23 deterministic tests), `tests/championship.test.ts` recomputed under the new formula.

- **L22 — Follow-up review 5769121221 fixes (2026-11-04, local only):** (1) `docs/SPRINT_REVIEW.md` reconciled with the push (branch 2e818f2, Family Cup approval) and stale best-five wording removed from the review doc and `room.ts` comments; every future GitHub push still requires Keku's explicit per-checkpoint approval. (2) QR localhost warning: the lobby shows a warning when the origin is localhost/127.0.0.1, because a phone scanning that QR is sent to its own localhost; the 6-character code remains the fallback, and a LAN-reachable address or the approved deployed domain is the real fix — not yet tested on a real phone. (3) `advanceDay` now refuses advancing while a game is playing and refuses past day 7; day-close semantics documented (advancing closes the day, finished games keep their start day). (4) Host bootstrap bound to room creation: `POST /rooms` returns a `hostClaimToken`, persisted beside the room snapshot; claiming host without it is rejected (400) at the HTTP boundary on both join routes; a reused token after a host exists just joins as a regular player. Engine-level `join` is internal and unchanged. (5) Memory Book PDF now paginates via the tested `paginateBlocks` helper (blocks start on a new page if they do not fit); the share image uses `selectShareEntries` and labels its 8-entry limit, with the overflow count printed on the image and in the UI. (6) The weak `seen <= 2` Impostor privacy assertion is replaced by a role-aware assertion (exactly one impostor with no word, all honest players share the same word) at engine level and over HTTP/WS. Evidence: `tests/review2-fixes.test.ts` (7 tests: 4 failed before the fixes, 1 already passed).

- **L23 — Third review 5769441799 fixes (2026-11-04, local only):** (1) `championshipDay` is now serialized in `toJSON` and restored in `fromJSON`, with a migration default of 1 for snapshots written before it was serialized — a restart no longer silently resets the championship to Day 1 and misattributes new games. (2) The end-of-day ceremony is now day-specific: `RoomEngine.ceremony()` computes that day's 75/25 day scores from finished official games started that day, and `dayCeremony` returns all tied top players in `winners` (with `winner` kept as the first, for compatibility); the UI shows joint winners. The previous behaviour — crowning the multi-day overall leader as "Day N winner" — is removed, not renamed, because the UI label and the feature name both say end-of-day. (3) PDF export now paginates flat lines (`paginateLines`), so a single oversized entry splits across pages at line boundaries; the share image clamps its note baseline inside the canvas (`canvasNoteY`) and flags mid-entry truncation. The old block-level `paginateBlocks` helper was removed, not left alongside, and its test was rewritten for lines. Evidence: `tests/review3-fixes.test.ts` (6 tests, all failed before the fixes).
- **L24 — Autonomous test batch (2026-11-04, cron run, committed with the review3 fixes):** the local-dev cron's test batch `tests/test-batch-200.test.ts` (44 tests: per-game edges, engine timeout/start guards, HTTP projection and rate-limit matrix) was found untracked in the working tree during the review3 session, reviewed for filler (none found — assertions check real scores, guards, and status codes), verified passing against the review3 tree, and committed in the same commit rather than left orphaned. Total test count is now 216, past the sprint's 200 target, without padding.

## M6 decisions (2026-11-04)
- **L25 — Show Mode is a presentation layer only.** Phases (lobby/intro/gameplay/waiting/results) are derived client-side from the projection plus per-player dismissal state. No new server game state, no rule/timer/scoring change. Only the per-player intro auto-advances (8s); games themselves never auto-advance, and the host still starts the next game.
- **L26 — Waiting is a banner, not a replacement.** An early M6 build replaced the game panel with the waiting screen; that hid phase changes (e.g. Impostor vote phase) from a waiting player and stalled the E2E driver. Waiting now renders above the panel, and the banner disappears on its own when the player's next action becomes available.
- **L27 — Waiting counts are counts only.** `submittedPlayers` is recorded on accepted intents in the engine and projected as `submittedCount`/`totalPlayers`. It is cumulative per game and labelled "have played so far", not per-phase; no identities or answers are projected.
- **L28 — Reactions are server-assisted but scoring-free.** Allowed set only (6 emoji), no free text; rate limit 1/3s and 30/hour per player; host/cohost mute; ephemeral (projections carry only reactions <15s old); never persisted, never in the ledger. Rendered only on lobby/TV/results, never during private phases.
- **L29 — Drag-and-group deferred.** HTML5 drag-and-drop is unreliable on iPhone Safari and a pointer drag would duplicate the tap flow. Connections keeps tap grouping with a visible tray; revisit only with a real-iPhone-proven drag.
- **L30 — E2E driver learned Show Mode.** After starting a game the driver dismisses the intro on every page; a finished game is recognised by the results screen as well as the finished panel; results are dismissed before the next game's start button is sought. Button labels "Submit year"/"Submit guess" were restored after an M6 rename broke the driver; slider/dial submits use distinct labels ("Submit timeline year…", "Submit dial guess…").

## Visual freeze (2026-11-04, owner direction)
- **L31 — M6 visual direction FROZEN.** Owner reviewed the M6 screenshots: current look too monochromatic, heavily green, prototype-like. Do NOT propagate the Midnight Christmas palette/system to remaining games and do NOT make large restyling or visual-theme decisions until the owner supplies approved visual references and a design system. Functionality, Show Mode, reactions, interactions, and tests are all preserved (commit f0584c6). Nonvisual work continues: stability, correctness, testing, reconnection, synchronisation, security, maintainability. Handoff for the future design: docs/DESIGN_HANDOFF.md.
- **L32 — WebSocket auto-reconnect with capped backoff (2026-11-04, local only, nonvisual).** Before this fix a dropped socket stayed dead: the 2s polling fallback kept the UI fresh, but the server had marked the player "(away)" and excluded them from startGame's connected-player count until they hit the manual Reconnect button. The browser client now reopens the socket on close with delays 1s/2s/4s/8s then 10s (`apps/web/src/components/wsBackoff.ts`), reading the session token fresh from sessionStorage on each attempt and never putting it in a URL. A 1008 close (server rejected the session/room) is NOT retried, so a dead session is not spammed; polling and manual reconnect remain. Cleanup on unmount/session change stops all retries and closes the socket. No UI text, layout, or styling changed, so this respects the L31 visual freeze. Evidence: `tests/ws-reconnect.test.ts` (3 tests), `scripts/check-ws-reconnect.mjs` 4/4 (drop via Playwright routeWebSocket, "(away)" appears, then clears with no manual click, then Trivia starts with 2 connected players).
- **L33 — Per-game abstention semantics (2026-11-04, local only, closes the L13 open item).** Abstention is an EXPLICIT `abstain` intent, never silence: a silent connected player still blocks advancement until the deadline/host-skip (L13 unchanged). An explicit abstain counts toward the current advancement threshold and scores 0 for what was skipped; no scores are invented, and the game still finishes normally and still counts as official (it is not timedOut). Per game: Impostor clue/vote abstentions are per-phase (a player may skip the clue and still vote); an all-abstain vote convicts nobody, so the impostor wins, same as a tie; a convicted impostor who abstains from the guess forfeits it (honest wins). Caption submit/vote abstentions are per-round; a submit abstainer earns no 25-point participation credit. Closest abstention is per-question (0 for that question, later questions still playable). Trivia/Who Said That/Geography/Year/Connections/Sprint/Math abstention is whole-game ("sit out the rest"): later answers are rejected with ALREADY_ABSTAINED, unanswered items score 0 via the existing null defaults, and a game whose other players already finished settles immediately on the abstain instead of waiting for a submission that will never come. Charades has no abstention (turns are actor-driven and Pass already exists) — the intent is rejected NOT_APPLICABLE. Abstentions are audited (`player-abstained` ledger events) but projections reveal only the abstainer's own status (counts stay counts, L27 privacy preserved). `finishGame` now normalises rawScores so every player in the game has an entry (default 0) — previously a player who never scored (e.g. a caption abstainer) vanished from rawScores instead of standing at 0. UI addition is functional only (one secondary button + one note line, existing styles), so it respects the L31 visual freeze. Evidence: `tests/abstention.test.ts` (14 tests), `scripts/check-abstain.mjs` 5/5 (real UI: button offered, sat-out note, button hidden, host finishes alone, abstainer scores 0).
- **L34 — Host recovery: cohost delegation + restart disconnects (2026-11-04, local only, nonvisual).** (a) A cohost may grant cohost: a host-away room must not lose its only operator path when the cohost needs to hand over. This does NOT transfer host ownership — `hostId` is unchanged, and a new joiner still cannot claim host while one exists; the original host regains authority on token reconnect. Alternative considered: automatic promotion of a cohost to host on host disconnect — rejected, per the D05 draft (no automatic transfer of ultimate ownership; cohost operational actions suffice). (b) Snapshot restore marks all players disconnected: after a restart no socket exists, so `connected=true` from disk was phantom state that inflated `startGame` counts and blocked advancement. Recovery is explicit (`/reconnect` or a fresh WebSocket open, which the browser auto-reconnect already performs). UI change is functional only: Make-cohost shown to cohosts, plus a plain note when the host is away. Evidence: `tests/host-recovery.test.ts` (4 tests, 3 failed before the fixes).

## Mchezo integration (2026-11-04, owner-approved direction)
- **L35 — Mchezo integration preserves server authority; the handoff is presentational only.** The approved handoff's components render projections and call existing intents; no client-side scoring, no mock data, no placeholder awards in production. Where the handoff assumed data the server deliberately withholds (per-player answer status, per-question reveals), the integration adapts the UI (counts-only waiting, post-finish aggregate distributions) rather than weakening the server's privacy rules (L27). New server surface is minimal and follows existing patterns: post-finish `correctIndex` + aggregate `answerCounts` on Trivia projections, and an ephemeral nudge endpoint mirroring reactions (rate-limited, never persisted, never scored). The everyday theme is the platform skin in Phase 2; Family Cup appears as event data (name/unit/current/total from the server, 7 days per L21), not as a skin, because Mchezo is year-round and Family Cup is a seasonal event. TV "connection" is a local view switch to the stage on the same device (the only TV behaviour that actually exists); returning restores the phone view. Visual expansion stops at the Phase 2 checkpoint by owner instruction: non-Trivia games, Championship, Memory Book, and the old TV dashboard keep their existing UI until a later approved phase. Evidence: `tests/mchezo-integration.test.ts` (8 tests), `scripts/check-mchezo.mjs` 31/31, `docs/mchezo-screenshots/` (8 real-app screenshots).
- **L36 — One deadline governs all games; host skip reaches Mchezo Trivia (2026-11-04, local only, nonvisual + functional UI only).** Math Mayhem previously rejected late answers only on its own 5-minute clock from `startedAt`, while social games used `deadlineAt` — so a past deadline with a recent start did not stop Math answers. Math now checks `deadlineAt` when present (legacy games without it keep the 5-minute `startedAt` window). Separately, the old ShowWaiting banner had a host-only skip button for past-deadline games, but the Mchezo Trivia waiting view had none, so a stalled Trivia game could not be skipped from the UI that plays it; the waiting view now shows the same host-only skip button (guests see a note) in all three waiting states (sat-out, locked, all-answered). A skipped game still invents no scores, still counts as `timedOut` and excluded from official standings, and unblocks starting the next game; a merely past-deadline game still blocks a new start until skipped. Evidence: `tests/deadline-timeout.test.ts` (5 tests, 1 failed before the Math fix), E2E smoke 3/3, check-mchezo ALL PASSED.
- **L37 — TV subject is the latest game overall; no spectator role yet (2026-11-04, Phase 2.1, local only).** The Phase 2 rule (latest playing/finished Trivia anywhere in history) let stale Trivia results own the TV after the room moved on. The TV branch now takes the latest game in the room's game list: Trivia stage only while Trivia is the latest event (playing or finished); any newer game returns the TV to the old dashboard (Now playing + Recent games + Family Cup standings). Host start/finish actions therefore drive every TV viewer's screen through server state alone, with no per-device phase consulted, and the stage remounts per game id so director state never leaks across games. Separately, the Phase 2 screenshot's "TV" leaderboard row was test data, verified: the screenshot driver joined a fifth player literally named TV and answered Trivia for that page, so TV scored by playing, not by viewing. Verified behaviour: an unjoined page cannot reach TV and creates nobody; opening/closing the TV stage creates and removes nobody; a TV-view player who never answers scores 0; a still-connected TV-view player blocks auto-finish like any connected player (until deadline/host skip/abstain), while a disconnected one does not (`activePlayers`); refresh restores the same slot via the session token; close + reopen without the token cannot retake the name (refused — the slot still exists) and a new name is a new slot with the old slot Away. There is still no true spectator mode: watching TV today requires occupying a player slot (capacity 10). A server spectator role (TV projection only, no game membership, no score, never blocks) is future work, not faked client-side. Evidence: `scripts/check-tv-spectator.mjs` 15/15, `scripts/check-tv-lifecycle.mjs` 7/7.
- **L38 — Lobby has one Start and one chooser; results separate question from game (2026-11-04, Phase 2.1, local only).** The 11-game × (official/practice/set-as-up-next) list is replaced by: the Circle's Up next display, one prominent Start (host/cohost only; guests see only "Waiting for the host to start"), one Official/Practice mode control (host/cohost only), and one "Choose a different game" control opening a compact selector (title + players + duration, no tutorials, no per-game buttons). Permissions and the game catalog are unchanged; the Start test id follows the up-next game and mode (`start-<mode>-<id>`). Trivia results now show, per picked question, the answer given, correctness, and points earned from that question (server `questionPoints`, finished Trivia only, computed with the exact scorer call — the web bundle deliberately does NOT import the trivia question bank), plus the whole-game total and rank with tie wording, and a footnote stating standings are whole-game totals, not the question's points. Phone results show top 2 + you (handoff limit); TV shows all rows — both verified against server raw scores. Evidence: `scripts/check-mchezo.mjs` (chooser + mode + results-separation checks), `scripts/check-leaderboard.mjs` 10/10, `tests/standings.test.ts` (4 tests), `tests/mchezo-integration.test.ts` questionPoints test.
- **L39 — No background-color transitions on Keycaps (2026-11-04, Phase 2.1, local only).** The Phase 2 note "one transient coral pair, noted not chased" was wrong to leave: the pair reproduced in Phase 2.1 gates (3 of 4 contrast runs) and was root-caused. The lobby Start Keycap's text is dark (`--mz-on-accent`) on brand coral, which passes at rest — but the Keycap transitioned `background-color` over 200ms when flipping disabled → enabled, and the sampler caught mid-transition interpolations between surface-2 and brand (e.g. rgb(193,86,69), 4.14:1; rgb(166,77,67), 3.32:1) that fail 4.5:1 for normal text. Fix: Keycaps no longer transition background-color at all (press feedback is transform + box-shadow, unchanged; reduced-motion variant likewise). A transient state that fails contrast is a real failure, not flake: any control whose colour animates through a failing pair is inaccessible for the whole animation window. Evidence: contrast 64/64 in 3 consecutive runs after the fix (was 63/64 with the failing pair in 3 of 4 runs before).
- **L40 — Spectator is a separate server role, not a player variant (2026-11-04, Milestone B, local only).** The TV projection was already public-safe, so the gap was never the data — it was identity: watching required a player seat. Spectators now live in their own `spectators` map on the engine, addressed by a dedicated token (hash stored, raw token returned once) that is disjoint from player session tokens in both directions: a spectator token gets 401 on every player/host endpoint, and a player token gets 401 on the spectator projection. Spectators never enter `players`, so seat cap, game membership, completion (`activePlayers`), standings, and attendance ignore them by construction rather than by checks at each call site. Presence is tracked via spectator WebSocket sockets (`cgn-spectator-<token>` subprotocol; actorId stays empty so intent frames are rejected SESSION_REQUIRED) and surfaced as `spectatorCount` (connected only) in every projection. The legacy unauthenticated `audience=tv` HTTP/WS path is unchanged — it serves the same safe projection, but it is uncounted and code-less, so the counted, code-gated spectator path is the one the UI offers. Snapshot restore marks spectators disconnected (no sockets survive a restart), and old snapshots migrate to zero spectators. Client: landing gains "Watch as spectator — no seat needed" (code only, no name); spectator tabs render TV only (stage or dashboard) with Stop watching, no lobby, no reactions, no game controls; a tab holding both sessions shows the player view. Evidence: `tests/spectator.test.ts` (7 tests: engine + HTTP + WS), `scripts/check-spectator.mjs` (all passed: seat-free, full-room admission, mid-game join, refresh, disconnect count, second-tab player TV, stop watching), `scripts/screenshot-spectator.mjs`.
- **L41 — TV/phone movement is measured against the previous finished game of the same type; no previous game means no movement at all (2026-11-04, Milestone C, local only).** The old wiring passed `delta = score` to both TV and phone standings, so every row showed a meaningless "+score" gain and the TV "climb" logic could never show a down-move. Movement now comes from `previousGameScores` (pure function in `apps/web/src/ui/mchezo/lib/standings.ts`): scan backwards from the current game for the latest earlier game with the same `gameId`, `status === "finished"`, and `rawScores`; return those scores or `undefined`. Same-type only — a Trivia score and a Math score are not comparable, so a cross-type "gain" would be meaningless even though ranks are ordinal. When there is no such game, callers show no movement: no arrows, no gain chips, no movement note (the TV "No movers" line is the honest empty state, not an invented baseline). Newly-entered players (absent from the previous game) get no gain chip. Gains are sign-aware on both surfaces (`+N` / `−N`; the old `+{delta}` rendering would have printed "+-120" for a drop). Phone results keep the Phase 2.1 question/game separation and add progressive disclosure: the "This question:" and "Your game total:" lines stay visible, while the standings footnote and question-picker guidance move into an "About these standings" `<details>`. TV entry during an active game is a pure client view switch (`setView("tv")`); returning restores the phone view and the in-progress game re-renders from the projection, so no game state is touched and no restart is possible — verified by driver rather than assumed. Away markers needed no new code: both surfaces already render them from `player.connection === "disconnected"` and the Phase 2.1 driver already asserted them; Milestone C keeps that coverage green. Evidence: `tests/standings.test.ts` (4 new `previousGameScores` tests; 8 total), `scripts/check-leaderboard.mjs` (distinct-scores 600/360/240/0 + movement Bea ▲1/Ada ▼1 + phone gains +240/−240 + first-game-no-note), `scripts/check-tv-entry.mjs` (all passed: mid-game entry, return with progress intact, results entry), `docs/mchezo-screenshots/10-tv-quality.png` (distinct scores + real movement + Away row) and `11-phone-results.png` (question/game separation + gain chips + collapsed disclosure).

- **L42 — Trivia staged reveal is post-completion only; live per-question reveals are ruled out (2026-11-04, Milestone D, local only).** The Phase 2.1 gap note proposed revealing a question once every *connected* player had answered it, plus a host manual reveal. That fails the assignment's integrity rule and is NOT built: a disconnected player may reconnect while answers are still accepted, so any in-play display of a correct answer or distribution creates a relay channel to a still-eligible player; "all connected answered" is therefore insufficient, and a host control must not override the safety condition. The TV is public, so no live key display can be scoped to answered players only. What shipped instead is a display-only staged reveal over already-projected finished data, with no server change and no scoring, deadline, ordering, or tie change: a pure step list (`revealSteps`, question/reveal pairs then a standings finale; empty for unfinished games, so the reveal UI cannot render while play is live), a phone sequence (question phase shows the prompt, options, and the player's own locked answer with no correct marking — AnswerGrid cannot display correctness — then the reveal phase shows the correct answer, aggregate counts, and per-question points, then the standings finale with the same limit-2 phone contract), and a TV auto-director walk (question 4s, reveal 5s per question, then the leaderboard; manual DirectorBar jumps switch auto off). Auto-play on the phone advances one step per 6s and stops at the finale; the step list is memoised on primitives so the 2s projection polls cannot reset its timer. Refresh/reconnect replays the sequence from the first question because every value is rebuilt from the finished projection; a full reload-to-results round-trip was not driver-verified (noted as a limitation). Evidence: `tests/reveal.test.ts` (10 tests), `scripts/check-reveal.mjs` (all passed: sequence order, answer hidden on question phases, auto-play advance + pause, TV walk question→reveal→next question + manual leaderboard jump), full regression batch (16 drivers + E2E, all green after a tv-lifecycle driver update for the new TV walk default).

- **L43 — Game manifests describe, never override: the registry wins (2026-11-04, Milestone F, local only).** The manifest (`src/games/manifest.ts`) is the single typed source for discovery, shuffle, and tournament scheduling, but it holds no authority of its own: titles, player counts, and durations are cross-checked against the registry and a disagreement is a validation error, not a second opinion. Durations are registry design defaults, explicitly unmeasured (`source: "design-default"`, `measured: false`); intensity is `unknown` for all 11 games because it has never been measured and duration must not be read as difficulty. TV support is `dedicated` only for Trivia (the only dedicated stage that exists) and `dashboard` otherwise; tournament format verdicts are deliberately absent — the manifest carries only structural facts (per-player scores for all, team support only for Charades) and Milestone I computes verdicts from them. Categories are editorial discovery labels, not capability claims. The one tension the manifest does not hide: the room's 5-minute submission deadline (L36) vs design durations up to 15 minutes, flagged as an open question for J/K hardening. Evidence: `tests/manifest.test.ts` (22 tests: shipped-set validity, shape errors, registry contradictions, architecture facts, consistency rules), full suite 29 files / 303 tests, no gameplay or registry change.

- **L44 — Game Library: browse, select, and start are three separate acts (2026-11-04, Milestone G, local only).** The library (`MchezoLibrary`) browses the manifest catalog with search (name/description/categories), category chips (OR), player-count compatibility (min ≤ N ≤ max), max duration, solo/team, and name/duration sorting — all pure in `ui/mchezo/lib/library.ts`, reading manifests only, so discovery can never disagree with the capability source. Browsing is open to every lobby player; selecting ("Set as up next") is host/cohost-only and returns to the lobby, where the existing Start button starts the game — the library contains no start button by construction, so browsing can never start a game. The compact lobby chooser is untouched. A single Reset button (disabled when no filter is active) avoids duplicate testids in the empty state; durations show with an estimate qualifier plus a footnote, since they are design defaults, not measurements. Evidence: `tests/library.test.ts` (14 tests), `scripts/check-library.mjs` (17 checks: search, team, duration, player-count filters, reset, empty state, host select, guest read-only browsing, no-start guarantee), full suite 30 files / 318 tests, full driver batch 16 + E2E green.

- **L45 — Shuffle: hard filters, soft weights, honest reasons (2026-11-04, Milestone H, local only).** The shuffle engine (`src/games/shuffle.ts`) separates what must hold from what merely helps: player count, exclusions, format incompatibility, and play style are hard filters that scores can never override, and an empty pool returns an explicit `no-eligible-games` value rather than a fallback pick. Recency, play-style variety, and category variety only adjust weights; a singleton pool reports `only-eligible-game` alone because weights are meaningless without a choice. Determinism comes from the shared mulberry32 PRNG, extracted to `src/shared/rng.ts` (protocol.ts re-exports it, so existing seeded callers are untouched) precisely because protocol's node:crypto import would have broken the web bundle — the engine itself carries no node imports and validates by hand instead of Zod for the same reason. The UI seeds from Date.now() (fresh draw per click; determinism is tested at the engine, not the UI), counts connected players (the population startGame enforces), and clears its result line on manual selection or successful start so it never explains a stale pick. Tournament mode picks a distinct constraint-fitting set but asserts no format compatibility — that verdict belongs to Milestone I. Evidence: `tests/shuffle.test.ts` (19 tests incl. pinned-seed goldens), `scripts/check-shuffle.mjs` (7 checks), full suite 31 files / 337 tests; full driver batch 17 + E2E result recorded in PROGRESS.md when it lands.

- **L46 — Tournament Studio is a scheduling preview, not a scoring system (2026-11-04, Milestone I, local only).** The Studio schedules games and nothing else: no standings, no championship writes, no achievements, no server state, no new server route — Family Cup code is never imported by the tournament engine. Formats are preset data, not engine branches (the scheduler reads config fields, never a format name), so adding a format is a preset plus tests. Distinct schedules come from one H tournament-mode shuffle call and repeat-allowed schedules from one H smart-mode pick per slot (seed + slot index, scheduled games as recency), so I introduces no second picker. Knockout brackets fail validation instead of producing a meaningless bracket: elimination needs a scoring and advancement model that does not exist yet. The two gaps the prototype surfaces honestly are the thin team catalog (Team Clash is Charades three times; infeasible below 4 players) and the absence of team formation (scheduling a team game is not forming teams). Validation is by hand, as in H, so the web bundle stays free of Zod; the engine's inputs are readonly-typed and the no-mutation property is tested with deep-frozen configs. Evidence: `tests/tournament.test.ts` (15 tests), `scripts/check-studio.mjs` (8 checks), full suite 32 files / 352 tests; full driver batch 18 + E2E result recorded in PROGRESS.md when it lands.

## Sprint 3 — game lifecycle (2026-11-06, branch `claude/sprint-3-game-lifecycle`)
Owner-approved policy: P1 timing models, P2 provisional durations, P3 partial results, P4 deadlines are normal / void only for integrity failures, P5 participation markers, P6 disconnect never finishes a game, P8 Impostor practice-only, P9 Charades practice-only. Implementation choices below are reversible engineering decisions within that policy unless marked PROVISIONAL.

- **D-S3-01 — One lazy deadline processor, not a timer per game.** `RoomEngine.tick(now)` processes every due phase/game deadline in time order, each *as of its own deadline instant* (so an outcome's `endedAt` is the deadline, not whenever the server noticed). It runs before every HTTP request and WebSocket action on that room, at server startup (a restart processes what fell due while it was down), and from one unref'd server-wide sweep (`lifecycleSweepMs`, default 1 s; `null` in tests, which call `lifecycleSweep()` on a fake clock). The sweep only bounds how late "Time's up" appears; correctness never depends on it. A deadline is due when `now > deadline`, so an action at exactly the deadline is accepted (same boundary as the existing PHASE_CLOSED check). Alternative rejected: `setTimeout` per game — lost on restart, needs re-arming from snapshots, and two timers can race.
- **D-S3-02 — APPROVED by the owner 2026-11-06: a deadline game in which nobody took any scoring action does not count.** (Record preserved; empty tied results never affect standings.) P3 says unanswered items score 0; applied literally to a game nobody touched it yields an all-0 tie that the midrank normaliser turns into 50 points for everyone, which can displace a real game from a day's best three. Such a game is still ended and recorded (`reason: "deadline"`, note "Nobody answered before time ran out…"), just with `countsOfficially: false`. Configurable: `COUNT_GAMES_WITH_NO_PARTICIPATION` in `src/server/lifecycle.ts`. Alternative: count it (strict reading of P3).
- **D-S3-03 — Completion is roster-based.** `activePlayers(game)` returns the game's roster, not the connected subset (P6). A disconnected player no longer lets the others "finish" the game early; they can return until the deadline. This replaces the Sprint P2 behaviour ("a disconnected player no longer blocks a quiz game"), whose tests were rewritten to the new rule rather than deleted.
- **D-S3-04 — The host Skip no longer voids anything.** Since the server ends every game at its deadline with the deadline rules, `POST …/skip` processes due deadlines and returns the outcome reason; before the deadline it is refused (a host cannot cut a game short, P4). Legacy games already finished by the old skip keep `timedOut: true` and stay excluded — historical results keep their rules.
- **D-S3-05 — One exactly-once `finalize()`.** Every ending (all finished, deadline, backstop, practice) goes through `finalize`, guarded by `status === "playing"`; scores, outcome, participation and ledger events are written together and the room is saved before anyone is told. A scoring exception voids the game (`game-voided` ledger event, no score events, never counts) instead of leaving it half-finished. Math keeps live per-answer scoring, so finalizing Math writes no further score events (no double count).
- **D-S3-06 — Official eligibility is enforced at start.** Starting a practice-only game (Impostor, Charades) as official is refused with the policy's plain reason; the outcome also carries `countsOfficially`, and standings use `countsOfficially(game)` (legacy games without an outcome keep the pre-Sprint 3 rule).
- **D-S3-07 — The Cup format is a property of the room, set at creation, immutable.** New rooms run the temporary Individual Family Cup (`individual-only`: team games contribute nothing, day = mean of individual placement scores at 100%, stated explicitly as `soloWeight 1 / teamWeight 0` rather than relying on the unapproved single-category fallback; best three, attendance bonus, midrank unchanged). Snapshots without a format are restored as `combined-75-25`, so Cups played before Sprint 3 keep their exact results: `tests/cup-integrity.test.ts` loads a 4-day Cup generated on commit 3119f17 (official Charades via the team channel, a skipped game, an override) and requires identical standings, championship and ceremony. There is no setter; the property is a getter. Team capability (combined format, team channel) is kept and tested.
- **D-S3-08 — Qualifying-day mechanism built, existing rule active (P7).** `src/scoring/qualification.ts` offers options A (current, active, proven identical to the old calculation), B, C, D and E. The owner did **not** approve B on 2026-11-06 (one answer is not meaningful participation). Proposed instead: **E**, meaningful scoring participation (≥ half of one official game's scoring items, or played to its end), which also suits short nights. Not active; see `docs/SPRINT_3_QUALIFICATION_OPTIONS.md`.
- **D-S3-09 — Math speed is timed per question on the server (P10). The no-opening/no-bonus rule was APPROVED by the owner 2026-11-06, with outdated-client detection (D-S3-13).** A Math question's prompt is sent to a player only when their client opens it (`math-open`); the server records that instant and the speed bonus brackets (≤5 s +20, ≤10 s +10) are measured from it to the answer's arrival. No client timestamp is used anywhere. What is measured is "revealed by the server → answer received by the server": network delay in both directions counts against the player, and the server cannot know when the prompt was actually *seen* (a phone in a pocket still counts as revealed). Re-opening never restarts the clock; each player's clock is their own. A Sprint 3 game answered without opening (an old client or a script) scores correctness only — no proof of speed, no bonus. Games started before Sprint 3 (no `openedAt`) keep game-start timing and show every prompt. Previously the bonus was measured from the *game* start, so only the first question or two could ever earn it.
- **D-S3-10 — Routine host Skip removed from the UI.** The server ends every game at its time limit with the deadline rules, so the "Skip timed-out game" buttons in the waiting views are replaced by a server-time countdown ("Ends automatically in m:ss") and a plain note. The endpoint stays (idempotent, never voids, refused before the deadline) for old clients. No new host emergency control was added: P4 allows voiding only for integrity failures, which the server detects itself (D-S3-05); P11 retro official/practice control is designed-not-activated.
- **D-S3-11 — Countdowns use server time.** Projections carry `serverNow`; the client keeps `offset = serverNow − Date.now()` and shows `deadline − (Date.now() + offset)`. Proven in a real browser with a phone clock 10 minutes fast (`scripts/check-lifecycle.mjs`). The client never decides that time is up; "Time's up — finishing…" is display only until the server's projection says the game or phase ended.
- **D-S3-12 — A test-only time scale for browser deadline tests (APPROVED by the owner 2026-11-06: strictly isolated from production, unreachable by client requests; `tests/lifecycle-scale.test.ts`).** `MCHEZO_LIFECYCLE_SCALE` (serve.ts) multiplies every game/phase duration so a driver can watch real deadlines pass in seconds; it is refused when `NODE_ENV=production`, defaults to 1, is never persisted, and is used only by `scripts/check-lifecycle.mjs` on its own server. The shared gate server runs real durations. Alternative rejected: a per-room "test mode" API (a production attack surface).
- **D-S3-13 — Outdated clients are detected and told to refresh (owner direction 2026-11-06).** Every app request carries a protocol version (`x-mchezo-protocol` header, `protocol` WebSocket parameter; `src/shared/clientProtocol.ts`), and every projection publishes `protocol: {current, min}`. An app older than `min` shows a "This game was updated — Refresh" banner on every screen. A tab loaded before Sprint 3 sends no version and its old code can show no custom message. It is still sent every Math prompt so it can play rather than break, and that player is marked (`promptsExposed`, saved, audited as `math-untimed-client`). The mark gives correctness-only scoring for that game, and the answer result says "This question wasn't timed … Refresh the page". The mark is also what stops anyone from hiding the version to read prompts early for a bonus. Limitation: a pre-Sprint 3 tab only sees that advice if its old code displays it; the projection marks the game `refreshNeeded` for every newer client.

## Sprint 4 — game experience (2026-11-06, branch `claude/sprint-4-game-experience`, from 5e05a8a)
- **D-S4-01 — A Cup is a saved record, and its qualifying rule belongs to it.** Sprint 3's `qualificationPolicy` was a plain field that was never serialized, so a restart silently reset it to the code default. Each room now holds a validated, frozen Cup record (`src/server/cup.ts`: `cupId`, `format`, `qualificationPolicy`, `origin`), saved in every snapshot. It can be chosen only before the Cup's first game (`configureCup`) and has no setter. Snapshots without a record are Cups from before Sprint 4 and keep the rules they were played under: their saved format (or combined 75/25 if older) and the legacy "any official game" rule. They are then saved with that rule, so a later change to the default can't reach them. If a saved record fails validation, it is kept byte-for-byte and the standings, championship and ceremony are paused with a plain message. It is never replaced with a guessed rule. Alternative rejected: falling back to the default (that silently re-rules a Cup).
- **D-S4-02 — The meaningful-participation rule (owner-approved) applies to new Cups.** A day qualifies when the player meaningfully took part in at least one completed, officially counted game that day. Meaningful means at least 50% of the game's scoring opportunities AND at least 2 genuine actions. Answers and guesses count even when wrong, as do captions and non-empty Sprint submissions. Opens, roster places, staying connected and abstaining don't. Word Connections: the opportunity is the puzzle, so it counts when the player ended it (four groups, or the allowed mistakes used up) or solved half the groups. Reaching the deadline is never "finished". Game-specific findings: an empty Category Sprint submission was counted as "played" before (fixed); Caption votes score other people, so the voter's own action is the caption; Math opens are not actions. A game with no participation record fails closed under this rule (it can only exist in an old Cup, which uses the legacy rule). Worked example: `tests/qualification.test.ts`, "a five-day Individual Cup".
- **D-S4-03 — Content is data with an editorial status; nothing authored becomes official without a human.** Packs live in `content/packs/*.json` and are validated per game by `src/content/schema.ts`. Engines receive only validated items. Only items that are `approved` (a human approval in `content/approvals.json`, bound to the item's content hash), `verified-computed` (arithmetic re-checked by the lint), or `legacy` (content already in official play before Sprint 4) can be used in official games. Everything written in Sprint 4 is `provisional`: practice-only until approved (`npm run content:review` writes review sheets; `npm run content:approve -- --reviewer NAME ids…` records approvals). Consequence until you approve content: official Trivia can run once per Cup (12 legacy questions); Closest Wins has 29 official items (21 computed); Category Sprint has none. The three legacy categories accepted only 10 answers each and were superseded, but older Cups keep their built-in lists. Each case gives a plain "not enough approved content" message, never a silent repeat.
- **D-S4-04 — Selection is deterministic, atomic and scoped to the Cup.** `src/content/select.ts`. For official games, the pool is official-eligible items never used in this Cup, sampled by difficulty in proportion to what's left. The seed is a hash of (cupId, game, Cup sequence number). Practice uses practice-only and already-used items first; if it has to take a fresh official item, it retires that item from official play in this Cup, so practice can never preview an official question. Selection and the usage record happen inside the synchronous `startGame`, are saved with the room, and survive restarts. Cups from before Sprint 4 keep their built-in packs and old behaviour.
- **D-S4-05 — Fixed: Word Connections sent its tiles in answer order.** The board was projected group by group, so the first four tiles always formed one group. New games carry a seeded `tileOrder`; games without one (older or in progress) are shown in a stable order shuffled from their seed.
- **D-S4-06 — Test-only content mode.** `MCHEZO_CONTENT_TEST_MODE=approve-provisional` treats provisional items as approved so test suites and the gate can play many official games in one Cup. Set by `vitest.config.ts`, the gate server and `check-lifecycle`'s own server; refused in production; never set by a request. The shipped library's real approval state is tested without it.
- **D-S4-07 — Math difficulty reviewed, not changed.** Question kinds are drawn uniformly at random, so one game can be noticeably harder than another. Within a game everyone gets the same questions and placements are per game, so it stays fair. Recommended for Sprint 5: a balanced two-of-each-kind mix for new Cups.
- **D-S4-08 — Fixed: Caption Clash voting was not anonymous.** While voting, each caption's id was its author's player id, and every phone holds the player list, so authorship could be read straight out of the projection. Captions also arrived in submission order. Each caption now has a per-round anonymous id (a hash of game, seed, round and author), appears in a seeded shuffled order, and only the viewer's own caption is flagged, for that viewer alone. The server maps a vote's anonymous id back to the author; older clients that send an author id still work. Earlier rounds show their captions and vote counts without names. Authors are revealed to players only when the game ends, and never on the TV, as before. `tests/caption-view.test.ts`.
- **D-S4-09 — Shared game kit, not a generic game.** `GameKit.tsx` (header with objective, feedback line, intro with an 8-second auto-start, score list) and `games.css` hold only what several games really share. Word Connections and Caption Clash keep their own layouts: a puzzle grid with coloured shape-coded bands, and a social prompt card with anonymous vote cards. How to extend this to the other games: `docs/SPRINT_4_DESIGN_SYSTEM_NOTES.md`.

## Content Quality 2.0 (2026-11-07, branch `claude/content-quality-2`, from 212376f)
Editorial work only: no item status changed, no approval recorded, no engine, scoring or selection behaviour changed. Index: `docs/content-quality-2/README.md`.
- **D-CQ2-01 The pilot lives outside the library.** It is in `content/pilot/*.json` (the loader reads only `content/packs/`), so draft items can't reach a game. Each entry wraps a schema-valid `item` plus an `editorial` block for what the schema can't carry yet (reveal, verification requirement, rubric, `alsoFits`, proposed fields). *Alternative:* add the pilot as provisional packs. Rejected because provisional items are usable in practice, and the owner asked for no publication before review.
- **D-CQ2-02 Audit verdicts are data.** They live in `docs/content-quality-2/audit-verdicts.json`, with a generated table (`npm run content:audit`). The script fails if any library item lacks a verdict. *Alternative:* a hand-written table. Rejected because it can't be kept complete or re-checked.
- **D-CQ2-03 The Connections uniqueness check uses declared overlaps.** Authors list every honest second home for a word (`alsoFits`), and a solver counts the valid partitions (must be exactly 1). *Alternative:* automatic detection from a thesaurus. Rejected because it needs an external data source and would still need editorial judgement.
- **D-CQ2-04 Findings that change official play are proposals, not fixes.** This covers the numeric input-range defect (14 official Closest items can't be answered correctly) and Category Sprint adjudication. See `docs/content-quality-2/ENGINE_CHANGES.md` (E1–E10, with the ones needing owner approval marked).

## Content Quality 2.0 — integrity fixes (2026-11-07, branch `claude/cq2-integrity-fixes`, from 88995ae)
Owner decisions of 2026-11-07: E1 approved, E3 approved, E2 peer vote NOT approved (closed-set redesign requested), Who Said That? redesign approved for prototyping, audit partially approved (batches, not bulk), pilot review approved.
- **D-CQ2-05 Numeric input ranges are fixed and game-wide** (`src/shared/numericInput.ts`). Guess the Year: 1000–2100, whole years (the content schema's span). Closest Wins: 0 to 10^12, 3 decimals. Never derived from an answer. *Alternative:* per-item ranges in the schema. Rejected because they can hint at the answer and buy nothing a wide fixed range doesn't.
- **D-CQ2-06 Typing never clamps or rounds.** Invalid entry shows a message and disables Submit. `parseNumericEntry` reads "5,570" as 5570 (a single comma followed by three digits is grouping), and the Submit label shows the value it will send. *Alternative:* the browser's `type=number`. Rejected because it rejects commas in some locales, behaves differently on iOS, and has no decimal-comma support.
- **D-CQ2-07 Selection skips unenterable numeric items** (the owner-approved interim rule, kept as a permanent guard), and content lint errors on them. Recorded usage and results are untouched.
- **D-CQ2-08 Client protocol 4 (minimum 4).** The server refuses numeric guesses from older tabs (`CLIENT_OUTDATED`), because they clamp, and those tabs show the refresh prompt. The Math "legacy client" rule keeps its own threshold (`MATH_OPEN_PROTOCOL = 3`). *Alternative:* accept old tabs' guesses. Rejected because a clamped 1000 isn't what the player meant.
- **D-CQ2-09 Reveal timing.** Independent quiz games (Trivia, Geography, Who Said That?, Guess the Year) reveal answers and explanations only when the game has finished. Closest Wins reveals each question once it has closed. Each player sees only their own choices; the TV sees none. *Alternative:* a per-question reveal once every player has answered that question. Deferred: it adds a rule and a race (late joiners, abstentions) for little gain, and the owner asked for no risk to active questions.
- **D-CQ2-10 TV answers live on the existing dashboard.** The dashboard keeps its routing; it gains a finished game's answers or Closest's last closed answer. *Alternative:* a new TV stage per game. Deferred, because it would change TV routing that existing drivers and hosts rely on.
- **D-CQ2-11 E2 v2: official Category Sprint is closed sets only** (`docs/content-quality-2/E2_CATEGORY_SPRINT_V2.md`), with no votes. Proposal only; scoring unchanged.
- **D-CQ2-12 E2 v3 set-size policy is simulation-backed** (`scripts/content-quality/sprint-sim.ts`, `docs/content-quality-2/E2_SET_SIZE_SIMULATION.md`).
  - The proposal: an official set needs at least max(15, 4 × players) members. Obscure-tail sets need at least 35, and recited-in-order sets are practice-only.
  - The model is checked against the closed form (1 − 5/N)^(P−1).
  - *Alternative:* fixed thresholds by eye (v2). Rejected by the owner, because 12 members for 4 players gives a bonus rate of only about 20%.
  - Proposal only; nothing implemented.
- **D-CQ2-13 Aliases are category-scoped and carry reasons.**
  - For example, sheep → goat holds only in the zodiac, because of the translation of 羊. Zodiac *cat* is a known near-miss (owner ruling).
  - *Alternative:* a global synonym table. Rejected, because it would merge distinct answers in other categories.
- **D-CQ2-14 Rousseau item moved from Who Said That? to Trivia** (`trv-cq2-14`), so the question line shows without engine change E5.
  - *Alternative:* wait for E5. Rejected, because the item was blocked for no gain.
- **D-CQ2-15 Audit Batch A applied as rejected status plus notes, never deletion.**
  - Ids stay valid for usage history and results.
  - The legacy board `con-legacy-1` keeps its legacy status with a one-tile fix (Icicle → Sleet, solver-checked). Making it provisional would have emptied official Connections. It needs owner sign-off at merge.
  - *Alternative:* rename the group "Winter words". Rejected as a catch-all label, not because of the solver (both are unique by counting).
- **D-CQ2-16 Tone, playlist and mechanic tags on pilot items, and a round-variety rule (E10), follow the owner's audience direction.**
  - They live in the pilot's editorial block, not in the live schema, until E9/E10 are approved.
  - *Alternative:* add schema fields now. Deferred, because it is a schema change to shipped packs.


- **D-CQ2-17 E2 v3 Category Sprint is implemented with the owner's corrections (2026-11-07).**
  - **Rules are frozen per Cup and per game.** The Cup record carries `categorySprint {matcher 2, sizePolicy 1}`; each game stores its `matcherVersion`, and official games also store their eligibility. Older Cups and games stay on v1 with Sprint 4 selection.
  - *Alternative:* freeze the rules per game only. Rejected: a Cup's official games should all play under one ruleset, just as the qualification policy is per Cup.
- **D-CQ2-18 Closed-set membership is verified against a reference list when content loads, and a real approval needs a recorded source check.**
  - An item whose list has drifted is skipped (fail safe), not just flagged.
  - *Alternative:* a lint error only. Rejected: content that fails the lint could still be loaded and played.
- **D-CQ2-19 The 14 open Sprint 4 categories marked official are now practice.** Only eligibility changes; review status does not.
  - This implements the approved closed-set-only rule in the data, and a content-check error keeps it that way.
- **D-CQ2-20 E10 v2 caps twist formats only. The bounded variety step (window 3) is a proposal, not wired in.**
  - Simulation showed that capping every mechanic flags 93–100% of realistic rounds.
  - *Alternative:* wire it in now. Deferred: the library has no `mechanic` tags yet, so the step would do nothing, and it changes selection, which needs approval.
- **D-CQ2-21 `scripts/clickthrough-api.mjs` is retired as a tombstone that always exits 2.** A test now requires every script to be either in the gate or explicitly classified as not a check.
  - *Alternative:* repair it. Rejected: its coverage is already in the gate and unit tests, and it never asserted anything beyond "every game finished".
- **D-CQ2-22 Category Sprint source comparison is a reproducible machine report, not a source check.**
  - `npm run content:sprint-sources` fetches each source the owner named, commits snapshots, and writes `SPRINT_SOURCE_CHECK.md`.
  - `sourceCheck` stays a person's signature, and nothing writes it.
  - Sources that block automated access (Britannica, pokemon.com) are documented as blockers, never worked around.
  - *Alternative:* record a `sourceCheck` when the machine diff is clean. Rejected: the owner asked that no human approval be recorded on their behalf.
- **D-CQ2-23 Reference members are the names shown to players.** Where a source's official form differs (M49 "Viet Nam", FIFA "Korea Republic"), a documented crosswalk (`sprint-sources/crosswalk.json`) or an item alias links the two, and the report shows every such link.
  - *Alternative:* use the source's exact form as the canonical answer. Rejected: results would show answers like "iran islamic republic of".
- **D-CQ2-24 New closed-set drafts are practice-only, provisional and tagged `official-candidate`.** This keeps them out of official selection, as a test checks. Promoting them is a review decision.
- **D-CQ2-25 `con-s4-02`: Herbs replaced by Gemstones.** Herb names double as paint shades, so no single-word swap can make a herb group safe beside Shades of green. The id is kept, so stored games keep the old board.
  - *Alternative:* a new id. Rejected: Batch A edits kept ids, and history is already protected by the board stored with each game.
- **D-CQ2-26 E10 metadata is an optional schema field (`mechanic`, `negativeStem`) on quiz items.** It uses one shared vocabulary. Lint reads it; selection does not.
  - *Alternative:* encode it in `tags`. Rejected: tags are free text and could not be validated.
- **D-CQ2-27 Congo ruling (owner, 2026-11-07) via per-Cup answer rules.**
  - New Cups record `categorySprint.answerRules: 2`. Under rules 2, a bare "Congo" is a known non-answer: it scores nothing, and results explain the two Congos.
  - Cups without the field (every earlier Cup) keep rules 1: the item carries a frozen `answerRules1` copy that is used only for them. Games already started are unaffected either way, because each game holds its own copy of its categories.
  - *Alternative:* edit the item in place. Rejected: unstarted games in existing Cups would be re-ruled.
  - *Alternative:* a matcher v3. Rejected: the owner asked for no matcher rewrite without review. Rules 2 is data only, through the existing near-miss mechanism.
- **D-CQ2-28 The Chinese zodiac is compared with the UN publication the owner named** ("The Chinese Zodiac: In Praise of the Jade Rabbit"). All 12 names match. This is machine evidence, not a `sourceCheck`.
- **D-DEV-01 Real-device testing runs on the owner's computer over home Wi-Fi, at $0** (`npm run serve:device-test`, docs/REAL_DEVICE_TESTING.md).
  - The test server defaults to content test mode, which official quiz games need while nothing is approved, and to a separate `./data-device-test`. It is refused in production.
  - The server prints the computer's Wi-Fi addresses, so the host opens a non-localhost address and the QR code works.
  - *Alternative:* a tunnel or temporary hosting. Not used: these are external services that need the owner's approval, and they are offered only if home Wi-Fi fails.
- **D-DEV-02 An optional private GitHub Codespaces preview for one-person phone testing** (`.devcontainer/`, docs/CODESPACES_PREVIEW.md, branch `claude/codespaces-preview`).
  - It uses the smallest 2-core machine, keeps the forwarded port private (the default; nothing sets it public), and has no prebuilds or secrets. It runs the same test-mode `serve:device-test`.
  - *Alternative:* a public port, so family can join. Not done: it exposes the app to anyone with the URL and needs the owner's explicit approval.
- **D-UX-01 D1 is implemented as a server refusal before content selection** (owner-approved 2026-11-07). `StartRefused("OFFICIAL_NEEDS_TWO")` returns HTTP 409; the client shows the reason and an explicit "Play it as practice instead".
  - Stored outcomes of older one-player official games are not rewritten. `countsOfficially()` and the projected outcome report them as not counting, which matches standings, since those always skipped them.
  - *Alternative:* rewrite the stored records. Rejected: the owner asked to preserve completed games and Cup records.
- **D-UX-02 The Official/Practice choice sits directly above Start** as a segmented control (filled + ✓ + `aria-pressed`), not inside the Game setup card. The decision belongs next to the action it changes. It is the first piece of Lobby A, and makes no other layout change.
- **D-UX-03 The room-code Share control opens an invite sheet** rather than calling `navigator.share` directly. The sheet can show the private-preview/localhost reach note, the QR code and a Copy fallback (an http LAN address has no clipboard API).
- **D-UX-04 The legacy screens are recoloured to the Night Circle palette, not rebuilt.** Their CSS variables now carry Mchezo colours and the document background is the Mchezo ground. Championship, TV Dashboard and Memory Book keep their layout until their rebuild is approved.
- **D-UX-05 Lobby overlap fixed by stopping screen children from shrinking,** not by switching to document scrolling. Document scrolling (better for Safari's toolbars) needs scroll-position handling between screens, and belongs with the shell/dock work that must be proven on real devices.
- **D-UX-06 No Sound control until Mchezo has audio.** A switch that changes nothing misleads. The stored preference is left untouched.
- **D-UX-07 D3 timing contract v2** (`docs/ux-redesign/D3_TIMING_CONTRACT.md`). **Owner rulings, 2026-11-07:**
  - T1: Start now after 20 s; if every roster player is ready, start at once.
  - T2: cancel after 5 min, with a visible warning first; nothing scored or used up.
  - T3: everyone sees readiness.
  - T4: Ready can be withdrawn until play starts, then it's locked.
  - T5: new Cups only; existing Cups and stored games are never migrated.

  The owner also required six safeguards: the minimum recheck at T_play; one active game, briefing included; content reserved, not consumed; explicit consent to start with unready players; secrecy until play; server-authoritative timers across restarts.

  **Technical choices** (not yet implemented; approval of the contract pending):
  - "Every eligible participant" means every roster player. An away player who isn't ready therefore needs the host's explicit Start now confirmation.
  - The confirmation is checked on the server (current needs-confirmation set ⊆ `confirmed`).
  - Content is frozen at T_create and recorded at T_play.
  - A cancelled briefing is removed from the games list and logged without item IDs.
  - Timing parameters are frozen per Cup, like `categorySprint`.
  - A restart never cancels a briefing without 60 s of visible warning.

  **Provisional defaults, not owner rulings:**
  - P1: the warning shows 60 s before cancellation.
  - P2: Start now marks the host ready.
  - P3: spectators see readiness like the TV.

  *Alternative:* select content at T_play. Rejected: a shortage would surface only after everyone had read the rules, and Category Sprint eligibility and Impostor roles must be fixed with the roster.
- **D-UX-08 D3 approved for implementation** (owner, 2026-11-08).
  - P1 approved: a 60 s warning before the five-minute cancellation.
  - P2 modified: Start now does not mark the host ready. The actor's own tap authorizes the start for them, so they are left out of their own confirmation set, and their real ready state is what gets recorded.
  - P3 approved: spectators see the TV's public readiness and connection indicators.
  - Branch `claude/d3-briefing`.
- **D-UX-09 Timing version for engines built in code.** `POST /rooms` (the only way players create a Cup) creates timing version 2. An engine built directly in code (unit tests, the console demo) stays on version 1 unless asked for 2.
  - The 191 existing engine-level `startGame` calls therefore keep testing version 1, which every existing Cup still uses. New tests cover version 2, and one checks that `POST /rooms` creates it.
  - *Alternative:* make the engine default version 2 and edit every existing test to opt back into version 1. Rejected: it's the same coverage with 39 extra file edits, and the default would differ from what a restored old Cup gets.
- **D-UX-10 OPEN product question (owner, 2026-11-08), not decided:** how a game should treat players who leave, forfeit, abandon on purpose or barely take part after play begins. Also: whether that opens a way to game the championship.
  - **Today's rule is unchanged:** every roster player has a score from the start, and anyone who never returns scores 0 and counts as a competitor.
  - **D3 doesn't change it.** Alternatives and worked examples will be presented for decision later. No scoring policy is chosen here.
- **D-UX-11 Browser drivers play the D3 briefing as a family would; nothing bypasses it.**
  - Every driver that starts a game in a new room now has each player's phone tap I'm ready (`scripts/lib/briefing.mjs`).
  - Where a seat deliberately can't tap Ready (a TV seat kept on the TV view), the host uses Start now and confirms the named seat, the D3 consent path.
  - Checks that named the old per-phone intro now name its replacement: the briefing explains the game, and no intro follows.
  - Coverage was added for the new screen (contrast, overflow, 44 px targets, TV secrecy). No other assertion was changed.
  - *Alternative:* a test-only switch that starts games without a briefing. Rejected: the gate would stop testing what families actually use.
- **D-UX-12 Live audit triage** (2026-11-08, branch `claude/audit-defect-triage`; table: `docs/audit-triage/RECONCILIATION.md`).
  - **Fixed only defects reproduced on D3:** A-01/A-02 (the disabled-button opacity override and paint order), A-03 (standings never split a shared rank), A-05 (reaching the briefing from other screens), A-06 (honest rejoining state) and A-07 (late joiners stay in the lobby).
  - **None of the fixes touches** server state, scoring, ranks, eligibility, readiness rules or existing Cups.
  - **A-05:** players in the game are brought from Library, Studio, Championship or Memory Book to the briefing once. The TV view only offers a way back, because a laptop used as a TV seat must keep showing the TV.
  - *Alternative:* switch every view, the TV included. Rejected: it would break TV seats (`check-tv-lifecycle`).
- **D-UX-13 Audit observations quoting strings that exist in no commit are not acted on without a live screenshot.**
  - Affected: A-11, A-15, A-16, A-18 ("Word Assembler", "It's the host's job…", "You're not in the Cup yet", "POINTS TO TARGET").
  - The same audit's D3 quotes do match the code word for word, so the preview was D3-era code and these quotes are likely misrecorded.
  - A-13's question is Geography-only content and can't appear in a D3 Trivia TV stage. Guards were added, and a live re-capture is requested.

## Stage 2 "Night Circle" (2026-11-08, branch `claude/stage2-night-circle`, from the Phase 1 triage checkpoint)

Owner direction: the overnight continuation directive, Phase 2 (Home B, Lobby A, visual Library, navigation). Proposal: `docs/ux-redesign/PROPOSAL.md` §1–§7. Presentation and navigation only: no server rule, score, eligibility, content approval or Cup record changes.

- **D-UX-14 Real addresses, no router library** (`apps/web/src/nav.ts`, `ui/mchezo/lib/routes.ts`).
  - `/`, `/join?code=`, `/host`, `/library`, `/watch?code=`, `/room`, `/room/cup`, `/room/tv`, `/room/memories`, `/room/library`, `/room/studio`.
  - Sheets ride in `?sheet=invite|choose|menu|settings|details` (details adds `&game=`), so browser Back and iOS swipe-back close a sheet first.
  - Each history entry records how deep the tab has gone. In-app Back steps back through our own entries, and otherwise replaces the screen (it never leaves the app by accident). Leaving a sheet for another screen replaces the sheet's entry, so Back from the Cup returns to the lobby, not to the menu. Moving from one room screen to another (Cup → TV) replaces the entry too, so history is always "lobby → this screen" (found by `check-f5`: "Lobby & Games" from the TV used to step back to the Cup).
  - URLs never hold credentials. The server serves the app only for these client paths (`src/shared/clientRoutes.ts`), and `/room/anything-else` is still a 404.
  - *Alternative:* a router package. Rejected: about 100 lines cover it, and seat and socket logic stay untouched.
- **D-UX-15 Reload and Back while holding a seat.**
  - A tab that holds a seat and loads `/` or `/host` opens its room: a reload never strands a player outside their game.
  - In-app Back from the lobby goes Home with a Rejoin card. The seat, socket and polling keep running there, and the card says when a game is in progress or about to start.
  - A QR link to the room this tab sits in opens the room. A link to a different room explains that this phone already has a seat, and offers no second seat: the tab holds one credential, and joining elsewhere would drop it. Leaving is the explicit Sign out on this device.
  - A tab with no seat that opens a room address goes Home.
  - *Alternative:* Home stays Home after a reload. Rejected for now: drivers and families relied on reload returning to the room.
- **D-UX-16 Host types a name (A-04).** Host is a screen (`/host`) whose button stays disabled until a name is typed; `createRoom` refuses an empty name. No more "Player 1".
- **D-UX-17 Lobby A layout.**
  - The Circle stays the centrepiece. Its centre shows how many are in the room (the up-next name moved to its own card with the cover).
  - A check on a token means the server's readiness projection says that player would play the next game. It is not the D3 "I'm ready", which exists only in the briefing.
  - Start lives in a sticky dock inside the screen's own scroller (`100dvh`). It sits above Safari's toolbar and the home indicator, takes its own place in the flow so the end of the page scrolls clear of it, and carries the lobby's error and confirmation lines, so a refused Start is never off screen.
  - The headline says "Everyone's here", "Waiting for N more", "N reconnecting" or "Ready when you are", computed from the server's presence.
  - Everything rarely used is in the room menu (☰): TV, Family Cup, Memory Book, all games, motion, This device (remember, seat backup, sign out), Reconnect, Mchezo home, and host tools (cohosts, Studio). A message shows in the menu while it is open, otherwise in the dock; never both.
- **D-UX-18 One catalog for every games surface** (`ui/mchezo/lib/catalog.ts`).
  - Titles, descriptions, player counts and the *estimated* length come from the manifests. The real time limit and Cup eligibility come from the server's lifecycle policy (`GET /games`). Covers come from `lib/covers.ts`.
  - "About N min" (estimate) and "N-min limit" (deadline) are always labelled differently.
  - The featured game rotates by calendar day: it is not a recommendation. Home shows no rankings, recommendations or recent activity.
- **D-UX-19 Library: search on screen, the rest folded away.**
  - Filters open from a "Filters" button showing the number in use. Active filters show as removable chips with "Clear filters"; the empty state has its own Clear filters.
  - Choosing ("Set as up next", or "Make this up next" in a game's details) is host/cohost-only, inside a room, and returns to the lobby in one Back-step. Outside a room the library only browses, and details offer "Host this game".
  - The host's up-next pick is kept per tab (sessionStorage), so a trip to the library or a reload keeps it.
- **D-UX-20 Found while migrating drivers; fixed on the Stage 2 branch.**
  - **The connection alert sat under sheets.** "This seat moved…" was hidden behind an open room menu. Connection alerts now sit above sheets; room notices stay below so they never cover a sheet's buttons.
  - **"This seat moved to another device" was overwritten by "Your session ended"** (pre-existing since Sprint 2). The old phone's next poll is refused with 401 after the server's 4001 close, and the second, less specific reason replaced the first within two seconds; `check-recovery` passed only when it read the banner inside that window. A moved seat now keeps its explanation (`tests/connection-store.test.ts`).
  - **Your own seat looked faded** in the Circle (the legacy global `button:disabled` opacity, the same cause as A-01). Seat buttons no longer inherit it.

## Stage 3 (bonus): results and celebrations (2026-11-08, branch `claude/stage3-results`, from the verified Stage 2 record)

Owner direction: the optional overnight bonus. Presentation only: no scoring, Cup rules, games, content approvals, deployment or spend. The Championship, TV and Memory Book are untouched.

- **D-UX-21 One results header for every game, built only from recorded facts.**
  - **Source** (`ui/mchezo/lib/celebrate.ts`): the server's per-game scores; competition ranks over them (equal scores share a rank, tied winners in name order); and the player's own recorded participation and sat-out flag.
  - **The same on every phone and every refresh:** one result, one story.
  - **Placement:** the header goes inside each game's own results screen. For Trivia it sits above the existing outcome card, so the headline is always first.
  - *Alternative:* each results screen tells its own story. Rejected: three wordings of "who won" already differed (audit A-09).
- **D-UX-22 28 Mild lines, each behind a condition that is true of the result.**
  - **Choice:** a line is picked deterministically from the game's id (FNV-1a), so ties and refreshes show the same words everywhere.
  - **Numbers** come only from the real gap or player count.
  - **Hard limits:** no line is about a named real person, nothing mocks, and a player who dropped out is told without blame.
  - **The celebration:** 14 kit shapes, at most 1.2 s, CSS only, `pointer-events: none`, on a winner's phone only. It never runs under reduced motion (OS, Less or Off): the component doesn't render it, and CSS hides it again.
  - *Alternative:* randomised lines. Rejected: two phones at a tie would read different jokes about the same moment.

## Stage 3 live QA repair sprint (2026-11-08, branch `claude/stage3-live-qa-fixes`, from the Stage 3 record `190c020`)

Owner direction: the Stage 3 live QA repair sprint, which reconciles the Stage 3 audit package. It favours correctness, fairness and clear feedback over new features. It makes no scoring change, no Cup-rule change, no content-approval change, no merge, no deployment and no spend. The full reconciliation is in `docs/stage3-qa/README.md`.

- **D-QA-01 An answer must be one of the question's own options** (Trivia, Who Said That, Geography, Math).
  - The server now refuses an answer index outside the question's options (−1, 4, 1.5, NaN) with `INVALID_PAYLOAD`.
  - Before, such an answer locked the question with a choice that no tally or reveal could place.
  - The app never sends one. This is hardening found while checking S3-TV-05 (`tests/tv-trivia-reveal.test.ts`).
- **D-QA-02 Math: a question opens only when its page can be seen; lost opens are asked again** (S3-MTH-01).
  - **Unchanged:** the server stays the only clock. Speed runs from the open it receives to the answer it receives (D-S3-09). No client time is sent or trusted, and scoring is unchanged (100 base, +20 within 5 s, +10 within 10 s).
  - **Changed (client only):**
    - A hidden page (a background tab or window, or a phone put away with its browser still running) no longer opens a question; it opens when the page is shown.
    - While a prompt is missing, the phone asks again every 3 s. The server keeps the first open time, so asking again can't restart the clock.
  - **Why safe:** hiding a page can only delay an open, never reveal a prompt before its clock starts.
  - **Trade-off left open:** the open's reply still travels back to the phone.
    - Normally the reply is pushed within about 100 ms.
    - With no socket and a slow reply, polling bounds the gap at about 2 s; measured at 3.1 s for a 1 s answer, still within +20.
    - A connection that stalls completely after the open still counts against the player.
    - Compensating for that needs a client-reported or round-trip-based allowance. Each can be gamed (delayed pongs) or is a scoring rule, so it is the owner's call; no change was made.
- **D-QA-03 Results standings list everyone** (S3-RES-01).
  - Up to 4 players are always listed in full.
  - A larger field starts as a preview (the top 2 places, never splitting a shared rank, plus your row) with "Showing N of M players" and a "Show all M players" toggle (`aria-expanded`).
  - It is the same component on every results screen, and ranks and scores are the server's.
  - Who sat out stays private (only public participation counts are used).
- **D-QA-04 Results lines: conditions corrected; 29 lines** (S3-RES-04).
  - 2nd of 2 gets a runner-up line ("Second in a head-to-head. Next game's a clean slate."), never "middle of the pack".
  - "Middle of the pack" is only for the middle half of a field of 3 or more; other between-places get "Not first, not last".
  - "Twice the bragging" is for two-way ties only.
  - "Edged it" is for two-player wins by at most a quarter of the winner's score.
  - When nobody scored, the line is "no points", not "you share the top spot".
  - "Diplomacy wins again" lost "again" (a streak nobody recorded). "The questions won" became "The game won".
  - Every line is checked against its condition over every score combination for 1–5 players and seeded rooms of 6–10.
  - *Alternative:* remove the humour. Rejected: the owner asked for its conditions to be corrected.
- **D-QA-05 The host's plan for the next game is shared with the room** (S3-LOB-02; supersedes D-UX-19's "kept per tab" for what other screens show).
  - **What was wrong:** guests' "Up next" card showed their own tab's default (Trivia), whatever the host had picked, and nobody but the host could see Official/Practice.
  - **What it is now:** `POST /rooms/:id/plan` (host/cohost only, Zod-validated, refuses Official for practice-only games). Every projection (players, TV, spectators) carries `upNext: { gameId, official }`.
  - **Limits:**
    - It is a plan only: Start is still the host's, and every start rule still applies.
    - It is in memory only. The host's tab publishes it again if it is missing, e.g. after a restart.
    - Two host tabs can't bounce it, because a tab publishes only on its own choice and adopts the room's plan.
  - **The default stays Official** (S3-LOB-01): changing it is a product decision for the owner. What changed is clarity.
    - The up-next card shows the mode to everyone.
    - Start reads "Start Trivia Showdown · Official".
    - The host's dock says what Official/Practice means, with Change.
    - The guests' dock names the game and mode.
- **D-QA-06 Home and the lobby scroll above their docks, never under them** (S3-HOME-01, S3-HOME-02).
  - Each screen is a scrolling area above a footer dock (100dvh, safe-area padding), so no card or section is ever behind the dock, with Safari's toolbar shown or hidden.
  - Home's Join and Host sit side by side (about half the old height).
  - On Home's game cards the title and "players · minutes" line come before the picture, so a card coming into view shows them first.
- **D-QA-07 TV and waiting-screen wording.**
  - TV reveal bars name their option for screen readers ("6: 1 vote, the correct answer"). The TV's top bar names the review step ("Game finished · answers, Q3 of 10"). (S3-TV-05/S3-TV-01)
  - The TV dashboard shows a public live card for a game without its own TV stage, and the last game's ranked standings. (S3-TV-06)
    - **Live card:** the game, its mode, who's in it, the clock, "N of M have started" and how Math is timed.
    - **Never shown while playing:** scores, answers, or who has finished (A-19 is still the owner's decision).
  - Word Connections' TV ends on the standings as well as the solution. (S3-TV-02)
  - Word Connections results explain the score: the rule, and your own breakdown, shown only when it adds up to your recorded score. (S3-WCN-01)
  - The waiting ring says "have started" / "all have started", since it counts players who answered at least once or sat out, not who finished. (S3-TRV-01)
  - "1 mistake left". (S3-WCN-02)

## Stage 4: post-audit UX completion and multiplayer validation (2026-11-09, branch `claude/stage4-experience-completion`, from the Stage 3 QA record `c307081`)

Owner direction: "MCHEZO — STAGE 4: POST-AUDIT UX COMPLETION & MULTIPLAYER VALIDATION". It covers the remaining Stage 3 audit items and multiplayer validation. It makes no change to scoring, Cup rules or content approvals, and no merge, deployment or spend. The full reconciliation is in `docs/stage4/README.md`. Owner decisions listed there were kept as they are; proposals are P-S4-01..05 in that README §8.

- **D-S4-01 The Library speaks about group size only** (S3-LIB-01..04, S3-NAV-01).
  - Inside a room each game says whether it fits the players connected now. Nothing says "playable now": content and Cup rules are checked at Start, and the Library can't promise them.
  - "Practice only" explains itself with the server's reason. Eligibility is unchanged.
  - Sort is never a filter.
  - Search, filters and sort live in the address (`replaceState`), so Back/Forward, refresh and details keep them.
  - *Alternative:* keep the view in session storage. Rejected: a second source of truth, and invisible to Back/Forward.
- **D-S4-02 Back during a game lands on Home with Rejoin** (S3-NAV-02).
  - A room screen with nothing of ours beneath it gets Home placed beneath it once.
  - It is not a trap: no popstate interception, no confirm. The server clock, seat and answers are untouched, and Forward, refresh and Rejoin return to the game.
  - *Alternatives:* a "leave the game?" confirm (rejected by the owner as intrusive), or intercepting Back to stay in the room (a Back trap).
- **D-S4-03 Non-JSON replies are not game data** (S3-LOB-03).
  - A non-JSON or error reply is refused.
  - Every projection path checks the shape, and the last good room stays on screen with the existing "Can't reach the game server" notice.
  - No second recovery system was added.
- **D-S4-04 Family Cup screen order** (S3-CUP-01):
  1. Day.
  2. The server's standings, or an empty state.
  3. Official games.
  4. What's next.
  5. Rules, folded.
  6. Host tools, separate and host/cohost only.
  - The client never recalculates standings, and nothing is invented.
  - The override audit trail stays host-only (D12 unchanged).
- **D-S4-05 Memory Book exports say "Download started", never "saved"** (S3-MEM-01).
  - The browser decides where the file goes, so the app can't know it was saved.
  - File name: `christmas-memory-book-<CODE>-<YYYY-MM-DD>.<ext>`.
  - Export content, consent, approval and privacy are unchanged. Names in exports are proposal P-S4-01.
- **D-S4-06 Names are never cut where players tell each other apart** (S3-TRV-02, ten-player room).
  - Ring and lobby labels use the shortest unambiguous form of the player's own name (first word; "First L."; else the full name), with the full name as the tooltip. No name is invented.
  - Lobby-circle and standings names may take two lines, breaking between words only.
  - Measured at 4/6/8/10 players and 320–1440 px.
- **D-S4-07 Caption Clash shows a caption or vote as counted only when the server has it.**
  - This was found by the four-player run; it is the root cause of the audit's "Your vote ✓ but 2 of 4".
  - The tapped card says "Sending…". A failure shows "That didn't reach the game — check your connection and try again." (or the server's reason) and keeps the words.
  - No server, timing, scoring or anonymity change.
  - Applying the same error line to the other game screens is proposal P-S4-03.
- **D-S4-08 Studio is a host tool** (S3-STU-01/02).
  - The host and cohost reach it from the Library; a guest sees a plain note with no planner and no actions.
  - Team Clash's copy says it needs a team game (today only Charades). "No games fit" lists the format's games with their ranges.
  - No new team games.
- **D-S4-09 Stage 4 drivers never treat provisional content as approved.**
  - The new drivers (`check-library-nav`, `check-cup-memory`, `check-stage4-details`, `check-caption-4p`, `check-ten-players`, `check-official-practice`) run their own servers without `MCHEZO_CONTENT_TEST_MODE`.
  - Official games use generated Math questions or Caption Clash's legacy (already official-eligible) scenes.
  - The older drivers' test mode is unchanged.
- **D-S4-10 A polled reply overtaken by a newer push is dropped.**
  - This was found by `check-ten-players` in the first full gate: a results screen briefly showed the game again.
  - The client shows a polled projection unless a newer projection was shown while the request was in flight and the reply has a lower room `seq`. Pushes always apply.
  - Without a race nothing is dropped, so a server restored with a lower `seq` can't freeze the screen.
  - *Alternative:* drop any reply with a lower `seq` than the one shown. Rejected: it could freeze the screen after a restore from an older snapshot.

## Stage 5: the complete game night (2026-11-09, branch `claude/stage5-complete-game-night`, from the Stage 4 record `b706a84`)

Owner direction: "MCHEZO — OVERNIGHT CONTINUATION: FINISH STAGE 4, THEN STAGE 5", then "STAGE 5 — UPDATED STARTING INSTRUCTIONS". It makes no change to existing scores, Cup rules, content approvals or Cup history, and no merge, deployment or spend. Every new game is Practice-only. The full account is in `docs/stage5/README.md`; the per-game audit is in `docs/stage5/AUDIT.md`.

- **D-S5-01 A send is shown as in only when the server has it** (review item 1).
  - Every game screen says when a tap got no answer ("We couldn’t confirm that — check your connection. If it doesn’t show as in, try again.") and keeps what was entered: the number, the tiles, the text, the entry, the drawing.
  - The six Mchezo answer screens show "Sending…" while waiting.
  - The older panel (Category Sprint, Who Said That?, Impostor, Charades) now shows the same line beside the game (S5-F).
  - *Alternative:* keep the app's single general error line. Rejected: it sits away from the control the player just used.
- **D-S5-02 Reconnect wording promises only what the server confirmed** (review item 2).
  - "Connection lost. Reconnecting… Answers the game confirmed are safe. Taps made now may not arrive."
  - Then: "Reconnected. Answers the game confirmed are safe."
- **D-S5-03 One live show for the TV and spectators, from the public projection only** (S5-A).
  - A single label always says what the screen is: Lobby, Getting ready, Live, Final standings or Post-game review.
  - A briefing or live game always takes over.
  - Director controls are local and presentation-only, so no server clock can be paused. Driver-checked: the deadline is unchanged.
  - *Alternative:* a separate TV app. Rejected: a second source of truth.
- **D-S5-04 Between games the host stays in control** (S5-B).
  - Nothing starts by itself.
  - The lobby tells everyone that the last game ended, the winner and their own place (from recorded scores), and whether the host's pick fits the people here.
  - A guest whose pick needs more players is told so, with the code.
- **D-S5-05 New games share one module contract** (`src/games/modules/`).
  - Pure state, validated intents, phases, scores, participation, and a private and a public view.
  - RoomEngine keeps the gates, clocks, briefing, finishing exactly once, the ledger and persistence.
  - The contract adds `dueAt`/`advance`, so a self-paced player's window closes on the server clock with nobody acting.
  - The eleven existing games are untouched.
  - *Alternative:* more branches in `room.ts`. Rejected: no pure tests, and every new game would touch every switch.
- **D-S5-06 Every new game is Practice-only until the owner approves its Cup scoring.**
  - Majority Rules, Pattern Pulse and Draw & Guess have `officialEligible: false` with a stated reason.
  - The server refuses an Official start, and the lobby's Official button is disabled with the reason.
  - Nothing was enabled for the Cup.
- **D-S5-07 Majority Rules tie policy** (provisional, Practice-only).
  - A clear majority gives 100 for each prediction that named it.
  - A split room (equal votes, at least one) gives every prediction 50.
  - No votes means no majority and no points.
  - Votes are anonymous for good: only totals are public, a split room names nobody, and participation counts predictions only (independent review R1).
- **D-S5-08 Pattern Pulse is self-paced with personal patterns** (provisional, Practice-only).
  - Everyone gets the same lengths (3–8), the same six symbols and the same windows, but their own sequence. The server generates and checks it.
  - A pattern is in its own player's projection only during the memorise window.
  - Scoring: 20 per symbol right from the start, plus 50 for the whole sequence.
  - Reduced motion and Off get a still numbered row for the same time. (Superseded by D-AV-01: the pattern is now shown one symbol at a time for every motion setting.)
- **D-S5-09 Draw & Guess.**
  - The server picks the order and the word.
  - Wrong guesses are never stored or shown.
  - Drawing goes in batches over the existing intents and WebSocket, with no paid or third-party service.
  - Bounded per message, per turn and per 2 s.
  - Scoring: guessers 100/80/60/50 in order; the drawer 50 per correct guesser.
  - A drawer who disconnects runs out the clock.
  - Who skipped or passed is never public (review R2). There is one word swap, only before anything is drawn or guessed (R4), and a 12-guess cap (R3).
- **D-S5-10 Personality only from recorded facts** (S5-E).
  - Each new game's results show at most one "moment" line taken from the finished game's recorded state, the same on every phone. A player's own facts appear only on their own phone.
  - A win is celebrated with the short burst under full motion, and with a still ribbon ("You won this one") under Less, Off or the phone's reduced-motion setting.
  - No audio.
  - Reactions are unchanged and already safe: a fixed set, no free text, 1 per 3 s and 30 per hour per player, host mute, and never over a game screen.
- **D-S5-11 Bluff Battle is deferred** (S5-D).
  - Three verified games were preferred over four (review item 5).
  - Bluff Battle needs free-text answers shown to the room. That needs a moderation decision and a careful anonymity model, which shouldn't be rushed overnight.
- **D-S5-12 The intent replay store keeps the latest 4,000 per room** (review R6). Oldest go first. A retry comes seconds after its original, so replays are unaffected; the room file stops growing without bound.
- **D-S5-13 Drivers read the catalogue from `/games`.** The library, Stage 2 and Mchezo drivers no longer hard-code the number of games. Whole-registry drivers (f5, e2e) play new games as Practice through `scripts/lib/stage5-games.mjs`.

## Stage 5.1: combined live audit repair sprint (2026-11-09, branch `claude/stage5-audit-repairs`, from the Stage 5 head `fa823de`)

All reversible technical decisions. None changes scoring, timing, the Cup, content approvals or the Official/Practice rules. Full account: `docs/stage5-qa/README.md`.

- **D-S51-01 A screen knows when it may be stale** (S5-AUD-04, S5-AUD-07).
  - Polls time out after 6 s.
  - A screen with nothing fresh for 8 s says so, and closes its socket so it reconnects.
  - The server sends an `alive` frame every 4 s.
  - API replies say `no-store`.
  - *Rejected:* a blind periodic refresh, which would hide the failure instead of detecting it.
- **D-S51-02 Drafts belong to one game instance and one server phase** (O-02).
  - The older panel is mounted per `draftKey`: the game id plus the server's `phaseKey`.
  - A failed send keeps its text, because the key doesn't change.
  - *Rejected:* clearing inputs on every projection, which would wipe a draft on a harmless refresh.
- **D-S51-03 A player's own accepted event ids are in their projection** (2C).
  - The server keeps the last 16 per player, in memory, rebuilt from the saved replay store on restore.
  - The phone uses them to resolve a "couldn't confirm" line.
  - *Rejected:* resending the failed action automatically, which would act on the player's behalf after a phase may have changed.
- **D-S51-04 Every projection carries a room revision** (O-07).
  - `rev` is bumped on every broadcast and starts from the clock at server start.
  - The overtaken-reply guard prefers it to the ledger `seq`. The `seq` keeps its ledger meaning.
  - A change that isn't broadcast isn't bumped, so it falls back to the old behaviour and never freezes the screen.
- **D-S51-05 Progress counts come from each game's own completion rules** (O-07): `started`, `answeredNow`, `finished`. Counts only, never who. Every label says what its number counts.
- **D-S51-06 History entries record where in-app Back lands** (3E).
  - `backTo(target)` steps back only when the entry beneath is the target; otherwise it replaces the entry with the target.
  - Browser Back is unchanged: Home with Rejoin still sits under a linked room (S3-NAV-02).
- **D-S51-07 The room's Library reopens with this tab's last view** (3E). Per tab (sessionStorage), always shown with its "Clear filters".
- **D-S51-08 The Memory Book follows the room's ledger** (3E).
  - It reloads when the ledger `seq` moves.
  - It shows which game a highlight will cite.
  - Adding waits while its copy is behind, and sends exactly the shown game.
- **D-S51-09 Flag text alternatives never name an option** (O-12).
  - The source is the pack's accessibility note, else the explanation before its final colon, else a generic line.
  - Any candidate that contains an option is dropped.
  - Verified in Chromium's accessibility tree only.
- **D-S51-10 Room snapshots are compact JSON** (Phase 4).
  - About 4× less written per save on a busy drawing.
  - Atomic write, fsync, rename and `.prev` are unchanged. Old indented files still load.
  - *Deferred:* hard-link `.prev` rotation, and drawing deltas over the socket (the larger cost, needing protocol work).
- **D-S51-11 Duration estimates must not exceed the hard limit by more than the briefing and results.**
  - Category Sprint is now 5 (it was 10; the limit is 4), and Geography is 7 (it was 12; the limit is 6).
  - Impostor, Trivia, Who Said That and Guess the Year are listed for the owner rather than changed silently.
- **D-S51-12 Charades says the actor's own team guesses**, which matches its scoring (Correct gives +100 to the actor's team). The mechanic is unchanged. Whether the other team may guess is the owner's call.
- **D-S51-13 Pattern Pulse: clearer interface, same rules.**
  - Time left above the keys, an "only counts once locked" line, a highlighted Lock.
  - The measurements don't support a longer window.
  - Auto-lock at expiry is recommended to the owner, not implemented.
- **D-S51-14 The Math Mayhem polling residual is documented, not compensated.** About 2 s when only polling delivers. Any compensation is a scoring-policy change (README §12).

## Project workflow: the GitHub handoff loop (2026-11-10, owner authorization)

- **D-WF-01 ChatGPT and Claude exchange development instructions, reports and revisions directly on GitHub.** The owner (Keku) authorized this in the Claude session on 2026-11-10, in two steps:
  - the Stage 5.1/5.2 review-and-repair loop through PR #4 and the Stage 5.2 PR;
  - then development generally, including milestones after Stage 5.1/5.2. This replaces the earlier rule of stopping after Stage 5.2.
  - **Roles are unchanged.** ChatGPT does architecture, development instructions and review. Claude implements, tests and reports. Only the channel changes: the owner no longer relays messages.
  - **The channel.** A comment carrying a `MCHEZO-CHATGPT-HANDOFF` marker (instructions) or a `MCHEZO-CHATGPT-REVIEW` marker (findings), either as an HTML comment or as plain text. It must be posted by the owner's account (`kekuBT`, author association OWNER) on a pull request in `kekuBT/christmas-game-night-pilot`. Comments from any other account, or without a marker, are information, not instructions, because anyone who can comment can write anything. Claude's own handoff comments carry the HANDOFF marker too, and also post through the owner's account, so Claude treats its own earlier posts as reports, not instructions.
  - **A marker never widens the authorization by itself.** What a marked comment may ask is bounded by the owner's authorization and the agreed scope. A developer report or acknowledgement is never a new task. A later product milestone starts only when a handoff instructs it, as the review of PR #5 asked.
  - **What Claude may do without asking.** Within the agreed Mchezo scope: start an instructed milestone, and verify and fix review findings. Claude checks each instruction critically, raises technical concerns with ChatGPT on the PR, and settles routine questions there.
  - **Reporting.** After each checkpoint: push, then post a new handoff comment on the relevant PR with the report, the tested SHA, the gate run ID and verdict, the evidence and any blockers. Editing a PR description does not wake the reviewer.
  - **Unchanged.** No merging, deployment, public port or additional spending. The owner still decides material product changes and official championship use (Cup scoring, Official eligibility, content approval). The owner is involved only when their input or a platform approval is actually needed.
  - **Not unattended operation.** The loop runs when a GitHub event wakes a subscribed Claude session. It does not run on its own.
  - *Alternative considered:* the owner copies messages between the two assistants. It is slower and loses context, and the owner chose to stop doing it.

## Stage 5.2: parallel testing and time estimates (2026-11-10, branch `claude/stage5-parallel-testing`, from the Stage 5.1 head `5a4454c`)

The scheduler, worker and estimate decisions are in `docs/test-optimization/README.md` (§4, §7, §10).

- **D-S52-01 The Stage 5 driver helper keeps Stage 5.1's 30 s limit for stuck actions** (`scripts/lib/stage5-games.mjs`).
  - The Draw & Guess word read, the guess send and the Majority taps give up after 2 s and are retried on the next pass. That survives the turn-ending race found in the F2 benchmark.
  - An action that keeps failing for 30 s while its screen stays up still throws, as in Stage 5.1. Only the race, where the screen moves on, is forgiven.
  - *Alternative rejected:* relying on the drivers' 180 s game budget alone. A defect confined to one Draw & Guess turn (75 s) or one Majority round (45 s) could then pass (failure injection, report §13).

## Stage 6.1: everyday entry and one complete solo loop (2026-11-10, branch `claude/stage6-1-everyday-entry`, from the Stage 5.2 head `8fe4f19`)

The spec is `docs/stage6/README.md`. ChatGPT accepted choices 1–4 of its §5 in the clarification on PR #6 (comment 6764965143) and added the seat and isolation requirements recorded in D-S61-03.

- **D-S61-01 Every room has a kind: `cup`, `casual` or `solo`** (`src/server/room.ts`, `RoomKind`).
  - A room's kind is fixed when it is made. Hosting from the UI makes a casual room unless the host picks Family Cup; Play solo makes a solo room.
  - A room without a kind, including every room saved before this change and an API create without one, is a Cup. Cup data and scoring are untouched.
  - Casual and solo rooms refuse official starts (`StartRefused` `NOT_A_CUP_ROOM`), official plans and Cup day changes, on the server. Their games can never reach a Cup's ledger or standings.
  - *Alternative rejected:* a casual room that can become a Cup mid-session. It needs rules for the games already played and for Cup registration, which this slice doesn't have.
- **D-S61-02 Math Mayhem: hard minimum 1, recommended 2+** (`src/games/registry.ts`, `src/games/manifest.ts`).
  - The registry now separates the minimum a game cannot start below (`minPlayers`) from a recommendation (`recommendedPlayers`, shown as "best with 2+").
  - Official play still needs 2 competitors (D1, `MIN_OFFICIAL_COMPETITORS`), so a lone player's official start is still refused. Only Math is solo-capable in this slice (`soloPlay` in the manifest).
- **D-S61-03 A solo round is a private single-seat room on the server, reused per device as far as the browser allows** (`apps/web/src/solo/soloSession.ts`).
  - The same engine, intents, scoring and clocks as multiplayer; no second game implementation.
  - **One room per device is best effort, not a server guarantee.** The seat is kept in `localStorage` (`mchezo.solo.v1`), apart from the multiplayer seat, so Home never offers to rejoin it. When storage is blocked, full or holds a dead seat, the seat is kept for the page's lifetime, so rounds don't each make a room.
  - **A seat is reused only when the server accepts its token** for a solo room. A room id or code alone gets nothing: join by code, spectate by code, seat recovery by code (the seat list, a host-assisted request, recovery by code), a second seat, join by id, and the public TV view (HTTP and WebSocket) all answer as if the room weren't there. (Seat recovery by code was closed in `453fda5`, found in my own review after the full gate on `35f90c1` started.)
  - **Only a definite answer retires a seat** (review of PR #6). A 401/403/404 means the seat or its room is gone; a timeout, a 5xx or a dropped connection proves nothing, so the seat is kept and Start fails with Try again rather than making a replacement room (D-S61-09).
  - **Retention limit (deferred):** the server has no room expiry. Solo rooms stay on disk; a device that loses its storage makes a new one. ChatGPT's review of PR #6 scheduled room retention as a bounded pre-deployment readiness task, after the everyday-play slice, that must not delete Cup history or memories (`docs/MILESTONES.md`, queued work).
- **D-S61-04 Leaving or restarting a solo round removes it unscored; an interrupted round is never resumed** (`RoomEngine.abandonSoloRound`, `startGame`).
  - Start (or Play again) in a solo room removes any round still open, and Leave round removes the open round. Both are logged (`solo-round-abandoned`, with the reason and how many answers it had). A finished round is kept.
  - A reload lands on the round's start screen with nothing polling. Start then says the interrupted round was replaced.
  - Two tabs on one device share the seat: the later Start replaces the earlier tab's round. That tab's late answer is refused and its Leave can't cancel the replacement, because both name the old round, which no longer exists.
  - *Alternative rejected:* resuming the interrupted round. Its clock kept running during the reload, so a resumed round would be shorter than a fresh one, and resuming adds state for little gain in a 10-question round.
- **D-S61-05 A personal best is kept on this device only, per game and rules version** (`apps/web/src/solo/personalBest.ts`).
  - Keyed `<gameId>@<rulesVersion>` in `mchezo.pb.v1`; `MATH_RULES_VERSION` (1) changes whenever Math's questions, difficulty or scoring change, so rounds under other rules never compare. A tie keeps the earlier best.
  - A record found in a game's slot whose own `rulesVersion` differs is ignored on reading and on writing: it never blocks a new best, and a new best replaces it (review of PR #6; before, it was ignored only on reading).
  - Missing, blocked or malformed storage never breaks play; the screens say when a best can't be kept or wasn't saved. Every label says "on this device"; nothing suggests sync or accounts.
- **D-S61-06 Casual rooms keep the readiness briefing; solo skips it.** The briefing is a fairness step for several players, not Cup administration.
- **D-S61-07 Every intent's event id is a real v4 UUID, on plain http too** (`apps/web/src/uuid.ts`).
  - A pre-existing defect found while testing Stage 6.1: on plain http at the host's network address (how phones on the home Wi-Fi reach the server) the browser is an insecure context with no `crypto.randomUUID`. The app's fallback `${Date.now()}-${Math.random()}` is not a UUID, and the server's intent schema refused every action (`INVALID_INTENT`). Math stuck on "Getting question 1 of 10…". The drivers ran on localhost, a secure context, so they never saw it.
  - The id is now built from `crypto.getRandomValues`, which insecure contexts have. `check-solo` and `check-casual` now play over a real insecure origin (the machine's own network address).
- **D-S61-08 The solo screens' Back buttons go where they say.** Back to solo and the solo list's Back step back to that screen when it is the one beneath, and otherwise replace the current entry (`backTo`). In the first version (found by `check-solo` before it was committed), Back to solo pushed a new entry, so Back from the list returned to the finished round's screen.
- **D-S61-09 Every solo request is bounded and belongs to its run; failures are sorted before anything acts on them** (`apps/web/src/solo/soloSession.ts`, review of PR #6, comment 6769583991).
  - **Bounded:** create, join, start, answers and projections each run fetch and the reply read under one timeout (6 s, the same as a poll), and Start has 15 s overall. Start always ends: in the round, or in an error with Try again.
  - **Owned by the run:** Leave, a new Start and the screen going away abort the run's requests, and a generation check drops any reply that still arrives for an older run. A late reply can't revive a left or replaced round.
  - **Sorted:** 401/403/404 is *lost* (the round stops, says so, and offers Start a new round, the only path that makes a new room). Timeouts, 5xx, dropped connections and unreadable replies are *passing*: the round and the seat stay, polling goes on, the screen says "Reconnecting…" after `STALE_AFTER_MS` (8 s) without a good reply, and clears on the next one. Other errors (400/409) are *refused* and shown as given.
  - **Uncertain mutations are reconciled, not repeated:** a Start with no answer reads the room once and adopts a round of that game it did not see before; a room whose join got no answer is joined again with its creation token on Try again. A create with no answer may leave one unused room on the server (no expiry yet); only a person's Try again makes another.
  - *Alternative rejected:* retrying Start automatically. Start is not idempotent (it replaces the open round), so a blind retry after a lost reply could replace the round the first request had just started.
- **D-S61-10 The plain-http event-id fix (D-S61-07) stays in this PR.** ChatGPT's review of PR #6 answered the question in the Stage 6.1 handoff: it directly unblocks the required phone flow, is small, and the regression evidence covers its integration.

## Stage 6.2: complete the solo shelf (2026-11-10, branch `claude/stage6-2-solo-shelf`, from the Stage 6.1 head `643ea03`)

The spec is `docs/stage6/stage62.md`. The instruction is ChatGPT's review handoff on PR #6 (comment 6770278546). ChatGPT clarified it on PR #7 in comments 6770394918 and 6771088990.

- **D-S62-01 The server keeps a solo allowlist: the registry's `soloPlay`** (`src/games/registry.ts`, `RoomEngine.startGame`).
  - A solo room starts only Math Mayhem, Pattern Pulse and Word Connections. Any other game is refused with `NOT_A_SOLO_GAME` (HTTP 409), checked before player minimums, so a forged request gets an explicit reason.
  - The manifest's `soloPlay` must match the registry, and the client lists a game only if it also has a solo adapter.
  - *Alternative rejected:* relying on player minimums. Pattern Pulse and Word Connections have a minimum of 1 and are solo games, but a future 1-player game might not be suited to solo play, so the list should be explicit.
- **D-S62-02 One typed solo adapter per game, in two parts.**
  - `solo/soloRules.ts` (plain TypeScript): the rules version, the copy, and the summary read from the server's projection.
  - `solo/soloGames.tsx`: the existing game screen in solo mode, and the review.
  - The shell holds nothing game-specific, and the play screen is keyed by the round.
  - *Alternative rejected:* a general plugin framework. Three games don't need one.
- **D-S62-03 Rules versions live next to each engine,** and a unit test fingerprints the rules each one covers. A rule change without a version bump fails the test, so old personal bests never compare with rounds under new rules.
- **D-S62-04 A personal best is filed only for a round the server finished,** whether played to the end or ended by its deadline, and that the player did not sit out. A deadline-ended round is a real result, even 0; any later higher score replaces it.
  - The rule is one pure function, `countsForBest` in `apps/web/src/solo/soloRules.ts`. The shell uses it, and unit tests check it against real projections.
  - **A forged abstain** (the solo screens offer no Sit out; the server still accepts one sent with the seat's token) ends the round with its recorded score, and the results say why it sets no best.
    - It never writes one: not on the result, a replayed request, or a reload.
    - The server's handling is unchanged (6770394918, item 3).
- **D-S62-05 A join whose reply was lost is recovered with a new room.** On Try again, the room is joined again with its creation token. If the server refuses because the lost join took the seat, the room is given up and a new one made in the same Start. Access is never claimed from a room id alone.
  - **Bounded, as ChatGPT required (6770394918, item 4):**
    - at most one new room per Start the player triggers;
    - the whole Start stays inside its time budget;
    - only a definite answer (a refusal, or 401/403/404) gives the room up. A timeout, 5xx or network failure keeps it and makes no new room.
  - Unit tests against the real server cover:
    - an accepted join whose reply was dropped;
    - 5xx and no answer on the retried join;
    - the fallback's own join refused or lost;
    - the fallback's room creation failing;
    - the time budget.
    Each of four mutations (fallback on a transient failure; a second replacement; no deadline on the new room; abstain ignored) makes a test fail.
  - The room given up remains until room retention exists.
- **D-S62-06 Connections content in solo uses the existing selection, as instructed.**
  - Today a solo player sees 12 different boards, then least-recently-used repeats. Starting a board uses it, even when the round is left or replaced.
  - If most boards were approved for official play, solo (and casual practice) would repeat one item.
  - **Decided by ChatGPT (6771088990):** unchanged for Stage 6.2. The reproducing test and the limitation are kept. The fix is queued in `docs/MILESTONES.md`: solo/casual prefer unused practice-usable content, then the least recently used; Cup selection is unchanged.
- **D-S62-07 Connections' personal best spans boards, and says so.**
  - One best across the unsorted board pool, under the same scoring (6770394918, item 2).
  - Next to it, on the shelf, the start screen and the results: "Best score across boards. Some boards are harder than others." (`bestNote` in the game's solo rules).
  - The "on this device" label stays.
  - *Alternative rejected:* calibrating difficulty or keeping a best per board. Neither is asked for, and a per-board best would rarely be beaten with 12 boards.

## Stage 7.1: Quick Party planning and first-game entry (2026-11-10, branch `claude/stage7-1-quick-party`, from the Stage 6.2 head `d39bf2e`)

The spec is `docs/stage7/stage71.md`. The instruction is ChatGPT's review and handoff on PR #7 (comment 6773012280).

- **D-S71-01 One pure planner, shared by the browser and the server** (`src/games/party.ts`).
  - The browser builds and edits a preview; the server checks a lineup with the same code before saving it.
  - Hard filters come from `shuffle.ts`'s `eligibleGames`. The order comes from `shuffle()`'s `"tournament"` weighting: not-recently-played and category variety, preferences only. That mode is a weighting, not the Tournament Studio's scoring or formats.
  - *Alternative rejected:* building the lineup on the server. Previewing and editing would then need requests, and a preview must never touch the room.
- **D-S71-02 The time-fit rule.**
  - A game counts as its design estimate (manifest `duration.minutes`, "about N min") plus **2 minutes** for the rules, getting ready and results.
  - A lineup fits when the sum is at or under 15, 30 or 60. A generated lineup always fits.
  - Edits only offer replacements that keep it fitting, and the server refuses one that doesn't. "Short" says when the eligible games run out before the time does.
  - No game clock changes, and no finish time is shown.
- **D-S71-03 The lineup is room state with a revision that only grows** (`RoomEngine.party`, `partyRevision`; persisted).
  - Saving or clearing needs the revision the host saw, otherwise `PLAN_CONFLICT` and nothing changes. Two host tabs can't overwrite each other unseen.
  - Saving writes nothing to the ledger, the Cup or the Memory Book.
  - A damaged saved lineup is dropped whole.
- **D-S71-04 The first game starts through the ordinary start, marked as the lineup's** (`POST /games` with `party: { revision, index }`).
  - It is repeat-safe: an item that already started a game that still exists returns that game. A lost reply, a second tab or a retry never starts a second one, and a cancelled briefing frees the item.
  - Checks, in order:
    1. the host or a cohost (repeats too);
    2. plan conflict (revision, item, game);
    3. replay;
    4. a new start is item 0 only (D-S71-09);
    5. **fewer than planned needs the host's OK** (`PARTY_FEWER_THAN_PLANNED`);
    6. **anyone reconnecting must be named or waited for**, as for an official game;
    7. the real roster must fit the game (`PARTY_DOESNT_FIT`);
    8. `startGame`'s own checks.
- **D-S71-05 A next game that doesn't fit the people here is answered in the lineup card.**
  - The lobby already disables Start then, so the card says why and offers a replan for the people here.
  - The server's refusal stays as the authority.
- **D-S71-06 Apply makes the lineup's first game up next,** through the existing up-next plan. Start uses the lineup only when up next is its next game; the host's own pick starts as before, and the card offers "Use the lineup".
- **D-S71-07 Bounded requests for Quick Party and for every lobby Start** (`postBounded`, the timeout covering the reply).
  - After a request gets no answer, the app reads the room before saying anything. An Apply or a Start that actually happened is recognised; otherwise the screen says nothing was saved or started.
- **D-S71-08 This slice stops at the first game.** No next-game controls and no automatic advancement; the lineup is kept, with game 1 marked, for the next slice.
- **D-S71-09 ChatGPT's clarification on PR #8 (6773171824).**
  - The replay is resolved before the "first game only" rule, so a retry of the first game after it started works.
  - A new start is item 0 only: no hidden way to item 1 in this slice.
  - A cancelled briefing clears the item's start mark in the room and the saved file, and restore drops a mark whose game wasn't saved.
  - Over HTTP a lineup start requires the roster the host was shown.
  - Host checks cover repeats. "Fewer than planned" never overrides the game's real player range.
- **D-S71-10 A Quick Party draft is bound to the saved lineup it started from** (review 6775606005).
  - The planner keeps the revision from when it opened and sends that on Apply, never the latest one a background update brought.
  - A conflict shows the lineup saved now and asks: Edit the latest, Keep the latest, or Replace it with mine. Replace is explicit, against the revision just shown; nothing retries by itself.
  - An Apply with no answer is "saved" only if the room holds exactly that draft at base + 1, and is otherwise a conflict or "not saved".
  - Clear is bound to the revision it asked about.
  - *Alternative rejected:* letting the server merge drafts. A lineup is short and the host decides, so an explicit choice is clearer than a merge.


## Stage 7.2: casual results and explicit session continuation (2026-11-10, branch `claude/stage7-2-session-flow`, from the Stage 7.1 head `08bba4d`)

The spec is `docs/stage7/stage72.md`. The instruction is ChatGPT's handoff on PR #8 (comment 6776351818), with its clarification on PR #9 (comment 6776484058).

- **D-S72-01 A lineup item's state comes from its game, never stored twice.** The item keeps its game's id.
  - **States:** pending (no game), briefing, playing, completed.
  - **Next:** the lowest pending item. Items play in order and are never skipped.
  - **A cancelled briefing** deletes its game, so the item is pending again at the same place.
  - *Alternative rejected:* a stored status per item. It could disagree with the game it describes.
- **D-S72-02 Every continuation press carries its own id and the session revision it was made against** (spec §3.8, clarification 6776484058).
  - **The presses:** Next game, Play again, Take a break, Resume, and the lobby's own Start in a casual room.
  - **The revision** grows with every break change, every game start in the room, and every cancelled briefing.
  - **Remembered presses:** the server keeps the 64 newest that took effect, with the room. They are never projected.
  - **A press seen before** returns what it did and is never applied twice.
  - **A press not seen before** must match the current revision, or it is refused (`SESSION_CONFLICT`).
  - So a delayed Break after another host's Resume changes nothing, before or after a restart. A forgotten press is stale by its revision.
  - *Alternative rejected:* the boolean alone, idempotent only while nothing else changes (the ordering in the clarification).
- **D-S72-03 A cancelled start ends its attempt; a fresh press may start the same thing again.**
  - A retry of the cancelled press gets `ATTEMPT_ENDED` and starts nothing, also after a restart.
  - The cancel also moves the revision on, so another host's press from before it is stale.
- **D-S72-04 Play again is a rematch of the room's last game** (`rematchOf`, through the ordinary start).
  - **Refused:** an older game (`REMATCH_NOT_LATEST`), a game still on, a request combined with a lineup start (400), and one without the roster shown or the request id (400).
  - **Checked:** reconnect confirmation, the people here fitting the game (`GAME_DOESNT_FIT`), and the roster shown.
  - **Not checked:** fewer than planned, because a rematch is not a lineup item.
  - **Two hosts** pressing it get one game: the second press returns it.
  - It never marks or takes a lineup item.
- **D-S72-05 A break is only between games and blocks every new start until Resume** (accepted choice §5.1).
  - No clock is ever paused.
  - Joins and reconnects never change it.
  - There is no ledger entry: it is session state (as D-S71-03).
- **D-S72-06 "Casual" in casual rooms comes from one switch on the Mchezo provider** (`casual`).
  - **Where:** the results heading and lines, the outcome line, the briefing (phone and TV), the TV's chips, final screen and recent games, and the practice-only games' scoring notes.
  - **Unchanged:** Cup rooms keep Official/Practice, and solo is unchanged.
  - **One new results line,** within the existing 30-line limit.
- **D-S72-07 Results screens** (accepted choice §5.4).
  - **Games with their own Mchezo results** keep them and gain the What's next panel.
  - **The rest** (Math, Closest Wins, Guess the Year, Geography, Who Said That?, Category Sprint, Impostor, Charades) get the new casual results screen in casual rooms: one heading, the standings, the player's own answers, the outcome, and the panel.
  - **The old shell** remains for Family Cup rooms only.
- **D-S72-08 Which screen shows comes from the room, never from a reply.**
  - **A lost reply** is asked again once, as the same press.
  - **A late reply** for a finished game only refreshes, so nobody is taken back to old results.
  - **Up next** follows the lineup's next item when the lineup moves on. A game the host then picks by hand stays up next, and never moves the lineup on.
- **D-S72-09 An Apply with no answer "couldn't be confirmed"** (P7).
  - **"Saved"** only when the room shows exactly that draft at base + 1, either later (a watcher) or in a conflict reply.
  - **Anything else** stays a conflict for the host to decide. Nothing rebases or overwrites by itself.
- **D-S72-10 The TV shows the lineup** (game n of N, played, on now, next), **the break, and the lineup's next step** on its final screens, Trivia's own included. These are public planning facts only.
- **D-S72-11 What a start is comes from the control pressed** (review 6778921208).
  - **Picked by hand, the lineup's next item, or Play again:** the intent is fixed at the press and carried through its questions and its retry. It is never inferred from a matching game id or a refreshed room.
  - **Up next records its source.** Only Apply, "Use the lineup", or the lineup moving on while the page is open make it the lineup's. The picker, library, details, shuffle, and a plan adopted from another tab make it a plain pick.
  - **A page's first look at the room** never turns a hand pick into the lineup's.
  - *Alternative rejected:* telling the server which control was pressed. The server already acts on `party` alone, so the client simply never sends it for a hand pick.
- **D-S72-12 What's next sits right under the result heading** (review 6778921208).
  - This holds on every casual results screen: before the standings, the game's details and the answer review.
  - It is not sticky, so nothing is covered. Its controls come early in the keyboard order.

## Stage 7.3: hand the host role to another player (2026-11-10, branch `claude/stage7-3-host-handover`, from the Stage 7.2 head `f24934f`)

The spec is `docs/stage7/stage73.md`. The instruction is ChatGPT's review and handoff on PR #9 (comment 6781323820).

- **D-S73-01 One atomic transfer, current host only, between games** (`RoomEngine.transferHost`, `POST /rooms/:id/host`).
  - **The target:** another connected player of the room. A cohost can be the target.
  - **In one step:** the old host is a regular player (no host, no cohost), the target is the host and leaves the cohost list, and other cohosts stay.
  - **Unchanged:** no game starts or resumes; the lineup, break, scores and seats stay as they are.
  - *Alternative rejected:* letting cohosts transfer. A cohost is a delegate; ownership moves only by the owner's choice.
- **D-S73-02 Repeat-safe with the Stage 7.2 session revision and press identity.**
  - The handover moves the revision on.
  - **A press seen before** tells its own actor the recorded outcome and changes nothing; the former host learns this without any authority.
  - **Refused:** a stale press (`SESSION_CONFLICT`), or a press from someone who isn't the host (`NOT_HOST`).
  - So A→B→A followed by A's old press to C is refused, and two tabs can't both hand over.
  - **A retry must be the whole original command** (clarification 6781456175): the same actor, target and base revision. Its reply is the recorded outcome plus the room's current host, never a saved projection or a past host state.
- **D-S73-03 Authority is the room's current state.**
  - HTTP reads the session's current player record.
  - Engine actions read `hostId` and the cohosts at call time.
  - A WebSocket's `host` or `cohost` audience is re-checked on every projection, so a former host's socket gets the player projection.
  - On restore, the role flags are set from `hostId` and the cohosts.
  - The claim token works only while there is no host.
- **D-S73-04 Announced to everyone.**
  - **The ledger:** a `host-transferred` entry (an audit of a privileged role change, like `host-claimed`).
  - **Notices:** a short public notice, worded for the new host, the former host and everyone else.
  - **The TV:** marks the host and names them.
- **D-S73-05 It lives in the room menu's host tools.** The "Players and roles" card has Make cohost as before. The host of a casual room also gets Make host for connected players, with a named confirmation and busy, refused and uncertain states. The results screen's What's next stays uncluttered.

## Stage 7.4: content variety in solo and casual rooms; the cancel wording (2026-11-11, branch `claude/stage7-4-content-variety`, from the Stage 7.3 head `af39c78`)

The spec is `docs/stage7/stage74.md`. The instruction is ChatGPT's review and handoff on PR #10 (comment 6783345938).

- **D-S74-01 Casual and solo rooms deal unused content first, then the least recently used** (`selectContent`, the variety rule).
  - **The pool:** every practice-usable item (not rejected) whose answer the game's input accepts, the same checks as before.
  - **The order:** a seeded shuffle for ties, then by last use in this room: never used first, then the oldest. Practice-only and approved items are alike here.
  - **Edge cases:** one eligible item is dealt every time; none is refused as before.
  - **Why:** these rooms never play official games and their history belongs to no Cup, so the Cup's rule (keep fresh official items for official play) protected nothing and made a room that never plays official games repeat one item once most content is approved.
  - **The Stage 6.2 pinned test** ("a solo room would deal the same board every time") was changed on purpose: 13 boards now come before any repeat, in normal and test mode.
  - *Alternative rejected:* practice-only items first, then approved ones. It adds an order that protects nothing in these rooms.
- **D-S74-02 The room kind is explicit and required** (`SelectionRequest.roomKind`).
  - The room passes its own kind. `"cup"` runs the official and practice rules unchanged, pinned against `af39c78` in tests: the small pool and the shipped library in both modes give identical items.
  - An official request from a non-Cup room is refused by the selector too (the room refuses it first, `NOT_A_CUP_ROOM`).
  - *Alternative rejected:* an optional field defaulting to the Cup's rules. A future caller could get a room's rules by omission.
- **D-S74-03 Consumption semantics are kept, now written down** (spec §3.2, §4.3).
  - **Shown, so used:** a solo round, from its start, including one left or replaced.
  - **Not shown, so not used:** a casual briefing's frozen content until play begins; a cancelled briefing uses nothing, so the next start of that game deals the same choice.
  - **No effect:** reloads and reconnects. **Restored:** usage and sequence after a restart.
  - No rollback is introduced.
- **D-S74-04 Solo starts carry a press id, fresh-checked against a persisted revision** (clarification 6783492788).
  - **The revision:** every new solo round moves the room's persisted, monotonic revision on; it is projected to the solo player. A press must be made against the current revision; one made before a newer round (another tab, a delayed request, or a press forgotten after 64 newer ones) is refused as stale (`SESSION_CONFLICT`, with the current session) and starts, abandons and uses up nothing.
  - **Replays:** a seen press replays only as the whole original command (actor, game and base revision), and only while it is still the room's latest Start; otherwise `SESSION_CONFLICT`. No older round is ever returned as current. Records: the room's bounded, persisted session records (64), never projected.
  - **The app** sends a new id with each press, against the revision it has just read; a conflict is shown with Try again, which reads the room and presses again. A Start with no answer is recovered by the same press (D-S74-08).
  - **API compatibility:** a solo Start without a press id is still a plain new round (explicit and tested); the app always sends one.
  - *Alternative rejected (the first draft):* a press id with no revision check. A forgotten or delayed old press could then still start a round (review of that draft, 6783492788).
- **D-S74-05 A solo Start marks its player present** (a pre-existing defect, found while testing D-S74-03).
  - **The defect:** a server restart marks every player not connected, and a solo room has no socket, so nothing marked its player present again. Every solo Start was refused ("Need at least 1 connected players"), and the app showed that refusal on every Try again. Reproduced over HTTP on `af39c78`.
  - **The fix:** in a solo room, the one pressing Start is the player and is present. Casual and Cup rooms still count who is actually connected (tested).
  - *Alternative rejected:* treating any authenticated request as presence for every room kind. That would change casual and Cup presence, which sockets track.
- **D-S74-06 The cancel confirmation names the actual destination** (review 6783345938).
  - **The text:** "You'll go back to the {game} results." or "You'll go back to the lobby.", then "Nothing is scored or used up, and everyone else goes back to what they had open."
  - **How:** it is worked out with the same rule that decides the screen after a cancel (`deriveShowPhase` with no game on), for the person cancelling.
  - *Alternative rejected:* routing everyone to the lobby after a cancel. Stage 7.2's audited behaviour (a cancelled rematch returns to the results, with What's next) is right; only the words were wrong.
- **D-S74-08 A solo Start with no answer is recovered only by the same press** (review 6786060026).
  - **The rule:** the app sends the same press again (id, base revision and game, unchanged) and acts only on the server's answer: a replay of its own round while still the latest, a round started now, or a stale refusal. It never adopts a round because it appeared in the room, since another tab may have started the same game.
  - **Bounds:** only a quick failure is resent at once (up to two resends), every send within the first request's own allowance, so a Start with no answer ends as before. A request that used its whole allowance (flagged `timedOut`) is never resent in the same Start, whatever the clock says, since timers can fire a little early (`ecb617c`, after a focused rerun on `8147b72` caught it once; spec §7.5). A press still without an answer is kept for Try again; any definite answer, Leave and dispose end it.
  - *Alternative rejected:* the earlier recovery, reading the room and adopting a new round of the same game. It adopted another tab's round (reproduced by ChatGPT and in tests). *Also rejected:* resending after a timeout as well. That would stretch a Start with no answer from about 6 s to the whole 15 s budget.
- **D-S74-07 `MCHEZO_CONTENT_DIR`, testing only.** It loads the content library from another directory (a small controlled pool for the browser checks). It is refused when `NODE_ENV=production`, like the other test settings, and no request can set it.

## Stage 8.1: mobile usability and solo presentation (2026-11-11, branch `claude/stage8-1-mobile-solo`, from the Stage 7.4 head `58196cb`)

Instructed by ChatGPT's review and handoff 6790743334 on PR #11 under D-WF-01. Spec: `docs/stage8/stage81.md`.

- **D-S81-01 Pattern Pulse draws its own game clock on every screen.**
  - **What:** between patterns, a panel ("Game time left 3:42", and that it keeps running); while memorising and tapping back, the compact clock line. App no longer draws `GameClock` above Pulse.
  - **Why:** one clock per screen, in rooms and solo alike; solo had none.
  - *Alternative rejected:* keeping App's line and adding the panel, which would show two clocks on the ready screen.
- **D-S81-02 Low time is shown and announced at thresholds, never every second.**
  - **What:** the warning tone (border and number, plus the words "Running low") at one minute or less. A polite status announces only crossings into a more urgent band: under a minute, under 20 s, time up. Each is said at most once per game; a clock that jumps back says nothing new. The number itself is a `timer` with `aria-live="off"`.
  - **Per game** (spec feedback 6790913242): the history belongs to the game instance, so screens never repeat a warning and a new game starts afresh; a correction that skips a band says only where it lands.
  - *Alternative considered:* a single announcement at one minute. Two warnings and the end give a screen-reader user the same information a sighted player gets from the colour.
- **D-S81-03 Time up between patterns is a display state; the server decides.**
  - **What:** when the game clock reaches 0:00 on the ready screen, Show me the pattern (and Sit the rest out) give way to "The game's time is up. Your results are on their way." The screen changes to the results when the projection says the game has finished. A press that raced the deadline is refused by the server as before.
  - **While the server isn't answering** (feedback 6790913242): the status says so instead of promising results, and offers Check again (solo: read the room now; a room: the connection's retry, beside its banner). Leave round stays in solo.
  - *Alternative rejected:* disabling the button, which still looks pressable.
- **D-S81-04 The solo session uses the server's clock (a pre-existing defect, F3).** It records `serverNow` from every projection it **accepts**, as room screens always have; never from a refused, failed or out-of-order reply. Reads are numbered when sent and a reply is taken only if no later-sent read has been taken, so an older reply never replaces a newer round or clock (feedback 6790913242). Before, every solo countdown ran on the phone's own clock. Scores were never affected (the server enforces every deadline), but a skewed phone showed the wrong time and could lock Pulse's keys early.
- **D-S81-05 The solo shelf: compact cards on phones, a grid from 600 px.** On phones a 56 px square cover beside the title and the players line only, with the description, best and note at full width below (R81-01: every line beside a 76 px cover made a 320 px card 341 px tall with a wide fallback font); from 600 px an auto-fit grid (columns at least 260 px, up to three) in a 1,080 px shelf. Typography, palette, covers and every line of text are unchanged.
  - **Measured with real fallback fonts:** the app loads no web font, so the acceptance check measures the card caps with the page's own font stack and with every fallback installed (DejaVu Sans, Liberation Sans, FreeSans). *Alternative rejected:* loosening the 320 px cap to pass the wider font.
- **D-S81-06 Short landscape screens and the briefing's I'm ready.**
  - **Landscape** (height 520 px or less): Pulse's ready and tap-back screens in two columns; Math Mayhem's answer area may shrink below its 260 px portrait minimum (only Math's: other quiz games' longer answers would clip; feedback 6790913242); controls stay at least 44 px and the screens scroll rather than clip at larger text; the solo round is exactly one screen tall.
  - **The briefing's I'm ready** is a sticky dock at the bottom while the rules are read (it was below the fold at 320 and 390 px), in the lobby dock's style; shared with Family Cup briefings.
  - **Left and right safe areas** are left to the Home Screen milestone, which turns full-screen display on.

## Stage 8.2: Everyday and Christmas themes, seasonal content kept apart (2026-11-11, branch `claude/stage8-2-themes-seasonal`, from the Stage 8.1 head `0f3cc54`)

Instructed by ChatGPT's clearance of Stage 8.1 and handoff 6795218622 on PR #12, under D-WF-01. Spec: `docs/stage8/stage82.md` (the spec's §6 lists the choices open for review).

- **D-S82-01 A device's look and a session's content are two separate choices.**
  - **The look:** per device: Match the game (default), Everyday or Christmas. It is kept in `localStorage` (`mz_look`), never sent to the server, and changes colours and decoration only. A guest's look can never change what the room deals.
  - **The content:** per session: Everyday (default) or Christmas.
    - The solo player chooses it on the shelf; it is remembered on the device (`mz_solo_season`) and sent with each Start.
    - In a casual room the host or a cohost chooses it in the lobby.
    - It is kept on the room (`contentSeason`, persisted and public) and shown to everyone before Start.
  - **Match the game:** Christmas only for a solo or casual session dealing Christmas content. Cup rooms, home and the library stay Everyday (L35, A10).
  - *Alternative rejected:* one setting for both. It would let a phone's appearance change a shared room's content.
- **D-S82-02 Seasonal eligibility is item metadata: `season: "christmas"`, outside the content hash.**
  - **The field:** a closed enum (a typo fails loading); no tag means year-round. The 45 items in the spec's §8 audit are tagged: 42 in packs, 3 Draw & Guess prompts.
  - **The hash:** the content hash still binds approvals to everything players see. The season says only where an item may be dealt, and Cups never read it, so tagging changed no item's hash (pinned by a test).
  - **No text matching:** selection never reads words. `content:check` reports untagged items with Christmas words, as an editorial net only.
  - *Alternatives rejected:* a separate season index file (it keeps metadata away from the item it describes), and the season inside the hash (tagging would have voided approvals and cancelled briefings frozen before an upgrade).
- **D-S82-03 Selection by season (solo and casual rooms only).**
  - **Everyday:** excludes Christmas-only items.
  - **Christmas:** all items, with the unused Christmas ones before the unused year-round ones; then least recently used, whatever the season.
  - **Empty pool:** an empty eligible pool refuses in plain words and never borrows from the other season.
  - **Requests:** a solo or casual request must name a season; a Cup request must not. Neither is ever filled in by default.
  - **Draw & Guess:** filtered the same way.
  - **Cups:** official and practice selection and history are unchanged; Christmas items stay in the Family Cup.
- **D-S82-04 The content is bound at Start.**
  - **Casual:** a Start carries the content its presser saw. A mismatch is 409 `CONTENT_CHANGED` and starts nothing. A content change (`POST /rooms/:id/season`, host or cohost, against the session revision, idempotent) moves the session revision on, so an earlier press is stale. A replayed press returns its original game.
  - **Solo:** the Start's content is part of the press: the same id with other content is refused.
  - **Recorded:** each game records its content (`season`), and so does a frozen briefing (`pendingContent.season`). When play begins, the frozen items are checked against that content; a briefing frozen before Stage 8.2 is checked as Everyday.
  - **When a change applies:** to the next Start. A game in play or a frozen briefing keeps its content.
  - **Not in the ledger:** a change is session state, like a break (D-S71-03). Each game's start records the content it was bound to.
- **D-S82-05 Compatibility.**
  - Rooms saved without `contentSeason`, or with an unreadable value, restore as Everyday.
  - So a casual or solo room that used to be dealt Christmas boards now gets year-round ones until Christmas is chosen. Usage history is kept.
  - A Start without `season` (a page loaded before an upgrade) is a legacy Everyday press (D-S82-07; the first version took the room's current content, which feedback 6795825877 ruled out).
  - The test pool (`scripts/lib/small-pool.mjs`) copies shipped items without their season, so the Stage 7.4 rotation tests still test rotation. The Stage 6.2 and 7.4 tests that counted 13 boards were changed on purpose: Everyday has 11.
- **D-S82-06 The look reaches every surface; nothing new is designed.**
  - **Applied once:** the device's look is worked out once and given to every Mchezo screen (38 places were hard-coded Everyday). The page itself follows it too: theme variables and the legacy variables on `<html>`, `theme-color` and `data-mz-theme`.
  - **What Christmas is:** the existing Christmas theme only: palette, wreath ring and the "brr" reaction.
  - **Legacy shell header:** it says Mchezo (the 🎄 only in the Christmas look), never "Christmas Game Night" in an Everyday room. The Cup room's own default name is event data and is unchanged.
  - **Gaps closed:**
    - `--mz-danger` is defined in both themes.
    - The neutral key edge and the TV's stale note use tokens.
    - The Memory Book share image uses the look's colours (its words and file names are unchanged).
  - **Contrast:** checked in both themes, by a unit test on the token pairs and in the browser on rendered screens.
  - **Game art** (covers, Pulse keys, Draw & Guess pens) keeps its own colours.
- **D-S82-07 The game on screen, and the whole press** (ChatGPT's spec feedback 6795825877 on PR #13).
  - **A Start without content** is a legacy Everyday press. It never adopts the room's current Christmas, and it is refused with refresh wording when the room requires Christmas.
  - **Every press's content is part of its identity,** normalized (absent means Everyday, records from older builds included), on every path: Start, solo Start, Next, Play again and resends. A repeated id resolves against its own command. A press that would get an already-started game gets it only with the same content, else `CONTENT_CHANGED`. Refusals start and use nothing.
  - **Match the game and the active labels follow the game shown** (briefing, game, results, solo round, TV until the next game). Lobby and next-start controls show the next setting, in words ("This game", "This round", "Next game").
  - **Solo:** Play again repeats the finished round's content; a pending press is resent unchanged; the remembered choice is a default for a new start only.
  - **Migration, by room kind:**
    - Cup briefings are never season-filtered.
    - Older solo and casual briefings are checked as Everyday, and a cancel says why (`briefingCancelled.contentWhy`).
    - Games in play finish unchanged.
    - Eligibility is checked apart from the hash.
  - **Stored device choices fall back safely.**
  - *Alternative rejected:* treating an omitted season as the room's current content. A page from before Stage 8.2 would then silently deal Christmas.
- **D-S82-08 A device choice that can't be saved holds for the page** (repair R82-01, review 6799134510).
  - **What:** the look and the solo content are kept by one store per choice (`deviceChoice.ts`).
    - The value chosen on this page is held in memory, is authoritative for the page, and is shared by every screen.
    - Storage is a best-effort copy.
    - Other tabs' saved choices arrive by the `storage` event.
    - A failed save is said plainly ("applies until you reload"), and after a reload the page falls back to what storage holds.
  - *Alternative rejected:* re-reading storage after every change, which is what `c27570f` did. A failed write then snapped the choice back.
- **D-S82-09 Compact choices wrap; they never clip** (found while validating R82-01; stage82.md §7.5).
  - **What:** a compact two- or three-way choice is a wrapping row.
    - Its options share the row but never shrink below their label. When the labels can't all fit on one line in the phone's font, the row wraps (at 320 px, Settings → Look shows two options and then one).
    - The ✓ hangs after the label, inside side padding that every option has, so choosing never changes a width or moves the others.
  - **Why:** the phone's font is unknown (no web font is loaded; R81-01), so no fixed column width or font size can promise a whole label.
  - *Alternatives rejected:*
    - Smaller text at narrow widths: it still depends on the font, and 13 px labels are hard to read.
    - Always stacking the options: it costs height on every phone, and the R81-01 shelf must keep its first Start on the first screen.
    - Dropping the ✓: it is the choice's non-colour cue.


## Stage 8.3: Home Screen installation foundation (2026-11-11, branch `claude/stage8-3-home-screen`, from the Stage 8.2 head `4c13e2b`)

Handoff 6801615731 (PR #13), under D-WF-01. Spec: `docs/stage8/stage83.md`.

- **D-S83-01 A narrow service worker, by allowlist.**
  - **What:**
    - It answers only same-origin GETs for the public shell: client-route page loads (network first; the cached shell only when the network fails), this build's `/assets`, and the public install files.
    - Every API path, non-GET request, WebSocket and other origin is untouched. Chromium's static routing skips the worker for them entirely.
    - Nothing is queued or retried.
    - It installs only if the server is serving its own build.
  - **Why:**
    - Chromium's install prompt still needs a fetch handler.
    - An installed app opened offline should say Mchezo's own honest thing, not show a browser error.
    - The cache must never hold anything private.
  - *Alternatives rejected:*
    - Cache-first pages: an old version would be shown while online.
    - A library such as Workbox: more code to trust, and the rules harder to see.
    - No worker: no prompt on Android, and a browser error page offline.
- **D-S83-02 Updates never take over a page.**
  - **What:**
    - A new build's worker waits: no `skipWaiting`, no `clients.claim`. It activates only when no old page is open, then deletes only other `mchezo-shell-*` caches.
    - Page loads are network first, so any reload while online is the newest build.
    - "A newer version is ready" appears only on calm screens. **Reload** reloads this tab only, and there is **Later**.
    - Incompatible updates keep the existing protocol refresh.
  - *Alternatives rejected:*
    - `skipWaiting` with an automatic reload: it could reload a game in play.
    - A reload on `controllerchange`: it would disturb other tabs.
- **D-S83-03 Install guidance is asked for, and says only what the browser said.**
  - **What:**
    - A Home card and a Settings row, never in a room or a game.
    - Chromium's prompt is captured (its mini-infobar suppressed) and shown only when the person presses Install. "Added" appears only on `appinstalled`, and "Not added" when the prompt is dismissed.
    - iPhone and iPad get the Share steps.
    - **Not now** is a device choice (as in R82-01).
    - It is hidden when the app runs installed.
  - *Alternatives rejected:* an automatic prompt or banner, or guidance on every screen.
- **D-S83-04 One static identity.**
  - **What:**
    - A static manifest: `id`, `start_url` and `scope` `/`, standalone, the Everyday ground.
    - One icon for everyone, the circle mark in the Everyday palette; the app opens in the device's own look.
  - *Alternative rejected:* a manifest generated per device or per look. Installation metadata would then depend on the device, the first step toward personal data in it.
- **D-S83-05 The server's side.**
  - **What:**
    - `GET /health`: no data, `no-store`.
    - The install files served with their real types.
    - `no-cache` for pages, the manifest, the icons and `sw.js`, so updates are always seen; `immutable` for content-hashed `/assets`.
    - A missing build file is a 404, never a 200 stand-in page a cache could keep.
  - *Alternative rejected:* probing reachability with `/games`, which is heavier and carries data.
- **D-S83-06 Where "Can't reach Mchezo" shows.**
  - **What:**
    - Home, Join, Host, the solo shelf and the library: every entry outside a room. Join is the invite link's screen.
    - Rooms keep their connection banner, which already says the seat is saved. The room's "Rejoining" screen starts below that banner, so its heading is never covered.
  - *Alternative rejected:* the notice on every screen. In a room it would repeat the banner.
- **D-S83-07 Spec feedback 6802191261: an exact build, validated, and truthful** (revises D-S83-01 and D-S83-02).
  - **The allowlist** is the build's own emitted list (scripts, styles, fonts, the install files, the shell), not an `/assets` prefix. Another build's files pass through an old worker without entering its cache.
  - **Every stored response is validated:** a direct same-origin 200 of the expected type, with no redirect, no `no-store` or `private`, and no HTML standing in for a file.
  - **Install is all-or-nothing:** a partial cache is deleted, and the worker in charge stays.
  - **The update notice** appears only when the server answers and the page isn't already the waiting build. Reload claims nothing about the worker.
  - **`/health` counts only as `{"ok":true}`;** `navigator.onLine` only starts a check.
  - **Nothing promises moving seats, bests or choices into an installed app.** The iPhone steps point to the existing seat recovery.
  - *Alternative rejected:* trusting any `/assets` file or any 200. A private preview's sign-in page or another build's file could then be stored.
- **D-S83-08 Repair R83-01: the build version covers the worker; an install owns only its own candidate cache** (review 6805055962; stage83.md §3.3, §7.5).
  - **The defect, on `96b3970`:** the version didn't cover the worker's code, so a worker-only change kept the version and cache name. The installing worker wrote into that cache and deleted it on failure, so a failed update emptied the active worker's cache, and offline there was no shell.
  - **Identity** (`apps/web/swBuild.ts`):
    - The worker is built with a stand-in version.
    - Its code is hashed with the bundle and the public files, then the version is written in.
    - The same source gives the same worker, byte for byte. A worker-only or worker-policy change is a new version.
  - **Ownership** (`apps/web/src/install/swLifecycle.ts`):
    - An install writes only into a fresh candidate, `mchezo-stage-<build>-<install>`, and on failure deletes only that.
    - On activation (no page of the old generation open), the old caches go and a complete candidate is copied into `mchezo-shell-<build>`.
    - If the copy fails, the candidate is served from.
    - Only an active worker writes its live cache.
  - *Alternatives rejected:*
    - A version from the time or a counter: every build would be an update, even an unchanged one.
    - Guarding only the delete: a same-name install would still write into the active cache.
    - `skipWaiting`, `claim` or a forced reload: an open game would be disturbed.
    - Serving straight from per-install caches without promotion: a worker that restarts couldn't tell which candidate is its own.

## Stage 9.1: Jebena Rush, the first playable slice (2026-11-11, branch `claude/stage9-1-jebena-rush`, from the Stage 8.3 head `90290ef`)

Handoff 6807907986 (PR #14), under D-WF-01. Spec: `docs/stage9/stage91.md`. The owner's settled direction (the name, "Name it. Pass it. Beat the steam.", an original jebena with steam and wobble, answers passed around, 5 hearts with 3/5/7, curated answers and careful typos) is kept as given. Everything below is an architect default for local play, practice-only, until the owner says otherwise.

- **D-S91-01 A game module on the room's lifecycle.**
  - **What:** Jebena Rush is a `GameModule` (`src/games/modules/jebena.ts`) on RoomEngine's existing game-deadline model: the briefing, the phase clock, finishing once, the ledger, persistence and broadcast are the room's. It is practice-only, casual rooms only (`casualOnly` in the registry; a Cup or solo start is refused with `CASUAL_ONLY`, and a Cup's game picker doesn't offer it), and never picked automatically (Quick Party, Smart shuffle). Browser drivers that play every game in one Cup room (`check-f5`, `e2e-chromium`) leave casual-only games out; `check-jebena-rush` plays it end to end.
  - **Why:** no new room machinery, and every existing guarantee (one clock, one finish, dedupe by client event id) applies as is.
  - *Alternatives rejected:* a branch inside `room.ts` like the eleven older games (harder to test purely); a new turn engine (a second clock to trust).
- **D-S91-02 One server deadline per turn.**
  - **What:** a turn is the room's phase `turn:<n>`: 10 s for players plus 500 ms of network grace (`phaseMs.turn = 10.5 s`), processed by the tick at its own instant, before any request. The cutoff is inclusive for a request and the clock alike (an answer at exactly the cutoff counts; the timeout is processed for any time after it, as of the cutoff). A turn that runs out at the same instant as the match limit yields to it: the module context carries the game's deadline (`ModuleContext.gameDeadlineAt`), so the limit wins and nobody loses a heart; RoomEngine's ordering for other games is unchanged. Catch-up after a restart processes each timeout at its own instant and starts the next turn from it: bounded and idempotent. Every answer names its turn; the client also sends the phase key. Wrong tries keep the deadline; at most 20 tries and 40 characters a turn. The countdown on screen is the deadline less the grace, on the server's clock, never more than 10.
  - **Why:** a race at the boundary resolves once, on server time; a late, replayed or duplicated send is stale and changes nothing.
  - *Alternatives rejected:* a client timer (unfair across phones); no grace (a send typed in time but carried late would lose a heart).
- **D-S91-03 A new category after every lost heart.**
  - **What:** six Everyday categories in a seeded rotation. A timeout, or a bank used up, moves to the next; answers stay used for the whole match; every bank used up ends the match.
  - **Why:** one hard category can't knock several players out in a row. (Question 1 for the owner.)
- **D-S91-04 The end, places and points.**
  - **What:** the last player with hearts keeps the jebena ("kept the jebena" is said only then); otherwise the room's 12-minute limit ends it (the turn in progress costs nothing), and a shared first place is said as shared. "Outlasted" counts only players who went out earlier: survivors never outlast each other, and seat order never breaks a shared place (owner's reviewer, 6808081378). Places: in above out; more hearts higher, equal hearts share; out players by when they went out. Points: 100 per player outlasted, 10 per heart kept, so points follow places. The standings are public facts and are in every view, so a match ended by the limit still shows places.
  - *Alternatives rejected:* points for answers named (they would reward whoever held the jebena most); no points (questions 2 and 3 for the owner).
- **D-S91-05 Connection never changes the rules.**
  - **What:** turns run on the server clock whether or not their player is connected (the briefing says so); reconnecting shows the current state and never restores a heart, resets a deadline or resubmits; nobody wins because a socket dropped; "sit this one out" leaves the match (the jebena passes if it was their turn; nothing is left pending), and a player who is out shows 0 hearts in every view and earns no heart points.
- **D-S91-06 A curated bank and a conservative matcher.**
  - **What:** `jr-bank-1`, six categories with 373 canonical answers (48 to 97 each) and aliases, stable ids, and named near misses ("Congo", "sport"). Matching uses the Sprint v2 normaliser (Sprint's own matcher and scoring are unchanged): exact or alias, then named near misses, then plurals (every singular reading, deduplicated by answer id: two ids is ambiguous), then a typo only when it is unambiguous (6+ letters, exactly one answer within 1 edit, no rival within 2). Anything closer to two answers, or a short word one letter off, is "ambiguous" and the player is asked to check the spelling. Repeats are by canonical id. A bank report (counts, collisions, close pairs) is a unit test.
  - **Why:** a wrong accept is worse than a retry: the deadline doesn't move on a rejection, so asking costs only time.
- **D-S91-07 Game settings at the start.**
  - **What:** a start may carry `settings` (Jebena Rush: `hearts` 3, 5 or 7; default 5), validated by the game (`src/games/settings.ts`), recorded with the game, public in its projection, reused by Play again, and part of a start attempt's identity.
- **D-S91-08 The lobby's hearts are room state.**
  - **What:** the host or a cohost chooses the hearts in a casual lobby (`POST /rooms/:id/game-settings`, revision-checked like the room's content); everyone sees the choice; it is persisted. A Start carries the settings its presser saw; if the lobby changed since, `SETTINGS_CHANGED` and nothing starts. A Start that names none asks for the defaults (it never silently adopts the lobby's).
  - **Why:** the spec promised guests see the host's choice before the game. Keeping it local to the host's phone would have shown it to guests only in the briefing.
  - *Alternatives rejected:* the hearts only in the start request (guests learn them late); adopting the lobby's settings when a start names none (a stale page could start with hearts nobody saw, as Stage 8.2 found for content).
- **D-S91-09 The jebena on screen.**
  - **What:** an original SVG (round clay body with a cream band, a narrow neck with a straw stopper, a spout and a handle) on a cream stage that reads on either look. Steam curls count the urgency (1 warm, 2 steaming, 3 boiling over) and a word says it ("Warm", "Steaming", "Boiling over!"); the countdown is a number. Wobble and rising steam are CSS, full motion only; reduced motion and Animations Off show the same jebena still.
  - **Why:** nothing relies on colour or motion alone.
- **D-S91-10 The bank never ships to browsers.**
  - **What:** the answer bank, the matcher and the module live on the server only. A unit test walks the web app's import graph and fails if it reaches them (or the module registry); the browser driver scans every built file and the public responses (page, service worker, manifest, assets, game list) for bank-only canaries (its version, source notes, near-miss reasons, distinctive answers). Both were shown to fail on a deliberately leaking build. So the service worker can never cache the bank as ordinary JS.
  - **Why:** projections were already checked; an import is the other way a bank leaks (review 6808081378, 4).


## Stage 9.2: Spectrum foundation (2026-11-12, branch `claude/stage9-2-spectrum`, from the Stage 9.1 head `aaa6981`)

Handoff 6811101479 (PR #15), under D-WF-01. Spec: `docs/stage9/stage92.md`. The rules are the handoff's reversible defaults unless marked as mine.

- **D-S92-01 A pure module, not yet in the product.**
  - **What:** `src/games/modules/spectrum.ts` and `packs/spectrum-pairs.ts`. It is not registered in `GAME_MODULES`, the registry, the manifest or the lifecycle policy; a test checks that. The planned policy entry is in the spec (§5).
  - **Why:** the rules and privacy contract get reviewed before any player can reach them.
- **D-S92-02 Four seeded rounds, chosen at the start.**
  - **What:** four different pairs and targets (whole numbers from 10 to 90), chosen once from the seed and persisted.
  - **The clue-giver:** rotates to the next player in seat order who is still taking part.
  - **The guessers:** everyone else still taking part.
- **D-S92-03 Clue rules (revised by 6811445149: digits allowed).**
  - **What:** control characters become spaces, inner spaces are collapsed and the clue trimmed; it must then be 1–80 Unicode code points. Any language; digits allowed ("a 10-minute walk"). Strict payload fields and the server's role and round checks stay.
  - **Why:** the rule "Give a clue, not the target number" is social in a cooperative game, and the briefing says it in words. A digit ban blocked fair clues and was bypassed by spelling the number out. No semantic policing, no paid AI, no new filter.
  - **Superseded:** my first default rejected any clue with a digit; ChatGPT reversed it in 6811445149.
- **D-S92-04 The team's guess and the points.**
  - **What:** the median of the guesses received. With an even count, the mean of the middle two, rounded half up. The points are 10 within 5, 7 within 10, 4 within 20, otherwise 0, for a maximum of 40.
  - **No invented guesses:** no guesses means 0 points.
- **D-S92-05 Sit-outs and endings.**
  - **The clue-giver leaving before the clue,** or no clue in time: the round is skipped for 0.
  - **The clue-giver leaving after the clue:** the round goes on.
  - **A guesser leaving:** their required guess is removed, and any guess they already sent stays.
  - **Fewer than two still taking part:** the match finishes with the points earned so far; an unrevealed round scores nothing.
  - **Disconnects change nothing.**
- **D-S92-06 Exactly once.**
  - **What:** every send names its round; the phase must fit; payloads are strict (only the action's own fields and the client's `phaseKey`, so no target or score can be sent in); a guess is immutable.
  - **The module's own idempotent expiry:** it records each phase's start (the event's instant) and expires a phase only at `start + duration`. So a repeated or early expiry does nothing, and catch-up walks the original deadlines.
- **D-S92-07 Privacy by role and phase (spec §7).**
  - **What:** before the reveal, only the clue-giver sees the target. Individual guesses are never shown to anyone but their sender, even after the reveal: only the team's guess and counts. Future rounds, the seed and the pack are server-only.
- **D-S92-08 One team result in a per-player pipeline (accepted by 6811445149 for this unwired slice only).**
  - **What:** `spectrumTeamResult()` is the single authoritative result: one total (0–40), the revealed rounds and the end reason, naming no player. `scores()` is a compatibility representation: the same earned total copied to every original roster player, sat-out players included. The copies are never summed into the team total, and never described as individual achievement. Tests at 2, 4 and 10 players and for partial endings pin this.
  - **Before production registration:** equal scores don't prove that no surface names a winner. The integration slice needs an explicit cooperative results branch, for the phone results and the TV, that prevents individual winner, personal-best, achievement and Cup-credit attribution from these scores. Practice and casual only.
  - **Not now:** the room contract is not widened for Spectrum.
- **D-S92-09 An optional `GameModule.onFinish`.**
  - **What:** RoomEngine's `finalize` calls it once, for every ending, before the result is recorded. Jebena Rush uses it to drop private tries when the room's match limit ends a match. Its own endings use one finish helper.
  - **Scope:** no other module defines it.
  - **This changes the existing product** (6811445149): the room's shared `finalize` path, and Jebena Rush's endings. It awaits review and the reviewer's private browser audit of Jebena endings and replay; it is not independently approved yet.

## Stage 9.3: playable Spectrum, one cooperative journey (2026-11-12, branch `claude/stage9-3-spectrum-play`, from the Stage 9.2 head `0765222`)

Handoff 6813167965 (with the Stage 9.2 clearance). Spec: `docs/stage9/stage93.md`. Reversible technical decisions under D-WF-01; the rules are the cleared 9.2 ones.

- **D-S93-01 Registered only together with the cooperative result path.**
  - **What:** registry `cooperative: true` (`isCooperative()`), casual-only, 2–10; manifest `competition: "cooperative"` and `scoring.type: "shared-team-total"`, cross-checked (practice-only, casual-only, no per-player or team-split scores); a phased policy (clue/guess/reveal, 10-minute backstop); never in Quick Party, never auto-picked.
  - **One source for the durations:** `src/games/modules/spectrum-timing.ts`, shared by the module and `lifecycle.ts`, so the lifecycle table never imports the module or its pairs (the web bundle imports shared game metadata).
  - **Library:** a cooperative game lists as a team game (everyone on one team), never as an individual one, with a "Co-op: one team score" tag. `playStyle` stays "solo" so the Cup's team channel and tournament logic never treat it as a two-team game.
- **D-S93-02 A typed cooperative branch in the result pipeline, keyed on the registry.**
  - **What:** `GameModule.teamResult` → `outcome.team` (`src/shared/teamResult.ts`), recorded at `finalize`: the total out of 40, the revealed rounds (pair labels, clue, target, team guess, distance, points, guess count), the module's end reason. Persisted with the room and checked by `TeamResultSchema` on restore (strict, whole numbers, the rounds add up; a finished cooperative game must carry it, no other game may).
  - **The per-player copies stay internal:** `rawScores` is never projected for a cooperative game (`myScore` 0); one `team-score-recorded` ledger event replaces per-player `score-awarded`; score override, the Cup and achievements refuse or skip it; a cooperative game without a valid team result is voided rather than shown per player.
  - **Every summary keys on `outcome.team`:** the phone results hero (`TeamResultsHero`: no winner, place, ribbon, "you won/missed" or confetti), the lobby's last-game card, the TV's final view (its mode label says "Team result"), "Tonight so far", show mode and the generic casual results. Competitive games are unchanged.
  - **Alternative considered:** a cooperative flag on the outcome with per-player scores still projected and every surface filtering them. Rejected: one missed surface would name a winner.
- **D-S93-03 The Memory Book doesn't save a cooperative game in this slice.** Its entries derive per-player facts from `score-awarded` events, which a cooperative game doesn't have; an entry citing one is refused (409 `NOT_IN_MEMORY_BOOK`). A team-result entry is for a later slice.
- **D-S93-04 The scale.** A native range (0–100, step 1) named "Your guess. From <left> (0) to <right> (100)", with `aria-valuetext` ("62, toward Hot"); arrows ±1 and Home/End natively, Page Up/Down ±10 handled explicitly; four touch nudges (−10, −1, +1, +10); the number always shown. Only Send or Enter sends; the draft is local, starts at 50 each round and is never sent by a reconnect.
- **D-S93-05 Markers by shape and position, plus a text legend.** ◆ target above the track, ● team guess on it, ▲ your guess below, so they never hide each other; the legend and the reveal sentence carry the meaning without colour. The only motion is a marker sliding into place, with full motion only.
- **D-S93-06 Leaving is two taps.** "Sit the rest out" asks before it sends the room's whole-game abstain, because it can't be undone; the cleared sit-out rules then apply.
- **D-S93-09 `check-tv-outage` never waits on its own server without a bound.**
  - **Trigger:** full gate `20261112-064509-b668ee3c-28530` on `b668ee3` FAILED. `check-tv-outage` timed out at 600 s, with nothing logged after its third check. It had passed in all 15 earlier recorded gate runs (about 41 s each), including the passing full run on `a25a088`; that revision differs from `b668ee3` only by one screenshot in `check-spectrum`.
  - **Not reproduced:** in 8 local runs, two at a time, every stop took 6–12 ms.
  - **Driver gap:** `stopServer()` sent SIGTERM, then waited for `exit` with no bound and never kept the server's output. A server that had already exited, or never exited, hung the driver silently until the gate killed it. Fault injection reproduces that signature: the old driver, with a server that exits by itself, hangs until killed.
  - **The fix:** an already-exited server, or one still running 20 s after SIGTERM, is a FAIL that prints the server's last output; the driver then kills it and finishes the run. A recurrence stays red, with evidence.
  - **Not changed:** the server's shutdown, which closes every tracked socket and, through `ws`, destroys an unanswered close after 30 s.
  - **Alternative rejected:** re-running the gate unchanged until it passes. That would hide an unexplained hang.
- **D-S93-08 Review 6815908707 repairs (P2, P2, copy).**
  - **Achievements never read a cooperative game:** `RoomEngine.achievements()` filters cooperative games' ledger events at the derivation boundary, alongside the raw-score exclusion; the authoritative ledger is untouched. "First Game Finished" is never Spectrum's, in any order or after a restore.
  - **Timing lines in each game's words:** `timingLines(lifecycle, gameId)` takes per-game phase words. A "guess" phase is the impostor's one guess in Impostor and everyone's guesses in Spectrum; the generic word is "guessing".
  - **A cooperative outcome line says how many rounds were played** ("2 of 4 rounds played."), never "Everyone finished."; why a match ended early is said once, by the team result in the results hero.
- **D-S93-07 The Spectrum driver plays real time.** `scripts/check-spectrum.mjs` runs the real 60/45/8-second phases (one clue phase runs out), so its gate timeout is 900 s.

## Stage 10.1: Jebena cini cups and truthful result feedback (2026-11-12, branch `claude/stage10-1-jebena-cups`, from the Stage 9.3 head `940df38`)

- **D-S101-01 Cups are a picture of the existing lives.** 3, 5 or 7 (default 5); one is lost on a timeout; scoring is unchanged (100 per player outlasted, 10 per life kept). Only the drawing and the words change (owner's request, handoff 6820352096).
- **D-S101-02 Identifiers keep `hearts`.**
  - **What stays:** the server state, the protocol, the `settings.hearts` key, test ids and data attributes.
  - **What changes:** only user-facing words and pictures.
  - **Alternative rejected:** a rename. It would churn persisted rooms, stored lobby settings and every client, for no change a player can see.
- **D-S101-03 A break is detected on the page, from consecutive authoritative views.**
  - **How:** each place cups are drawn remembers the last count it showed for that game and seat. A smaller count breaks exactly the newly lost slots, once.
  - **What follows:**
    - a first view or a reload has nothing to compare, so it shows broken cups without animating;
    - a repeated view changes nothing;
    - a new game id (Play again) starts fresh.
  - **Alternative rejected:** a server "cup broke" event. That would be a protocol change, and it would need its own replay rules on reconnect.
- **D-S101-04 An original inline SVG cup.**
  - **The shape:** handleless, flared rim, white body with a dark outline, a teal rim stripe, a red flower and green leaves.
  - **Broken:** split in two along a zigzag, with the right shard tipped away.
  - **Why:** no external file, photograph or font glyph, and intact vs broken differ by silhouette.
- **D-S101-05 Leaving is not breaking.** A seat that left shows "Left" with no cups, so sitting out never looks like cups breaking. An eliminated seat shows every cup broken and "Out", and your own row stays visible once you're out.
- **D-S101-06 "You missed this one" needs evidence of absence.**
  - **When it shows:** only with no recorded action at all (`participation.actions`, or the completed count where a game doesn't report actions), and never for a player placed first in a game somebody won.
  - **The case it fixes:** Jebena Rush counts completed items as accepted answers, so a survival winner could read "You won this one" beside "You missed this one".
  - **Unchanged:** the sat-out lines, the zero-score line, ranking and scores.
- **D-S101-07 A flaky setup step in `stage74-content-variety` gets a realistic request timeout.**
  - **Trigger:** fast gate `20261112-102438-f4269885-6698` on `f426988` failed in "no network at all: the Start ends within its budget…".
  - **The failure:** `seatedRoom()`'s first real, unfaulted Start ended in `error` instead of `playing` (line 497), because every request in that tab was limited to 250 ms.
  - **History:** the same assertion failed once before, in full gate `20261111-194026-83406685-7879` (Stage 8.3). Five local runs under heavy CPU load all passed.
  - **The fix:** only that setup tab gets a 5 s request timeout. The faulted tabs, which test the 250 ms behaviour and the 4 s Start budget, are unchanged.
  - **Alternative rejected:** re-running the gate until it passed.
- **D-S101-08 The deciding cup breaks in the results (review 6822605156, S101-R1).**
  - **How:** the phone results rows and a Jebena-specific TV final screen draw everyone's cups, continuing the live screens' memory (your own row ← your live row; others ← the seat list; the TV ← its seat list). The match-deciding 1→0 loss breaks once, where the result appears.
  - **Alternative rejected:** holding the live screen for a moment before the results. It delays the result and the continuation controls, and it needs a special render of a finished game on every screen.
- **D-S101-09 Cup memory is scoped to a room and to unbroken continuity (review 6822605156, S101-R2).**
  - **Scope:** a room and seat, or a watched room. Changing it clears the memory.
  - **Epoch:** a new one on every loss of continuity (socket close, staleness, offline, coming back from the background). Only a count recorded in the current epoch can break a cup.
  - **Elapsed time** (3 s) is kept only as a second guard.
  - **Alternative rejected:** relying on room revisions. Those move for unrelated changes (presence, readiness), so a jump doesn't mean a cup was missed.
- **D-S101-10 The two solo harnesses that use the real server give passing requests room (supersedes the part of D-S101-07 that kept the faulted tabs at 250 ms).**
  - **Trigger:** fast gate `20261112-121526-3eb835d3-186` on `3eb835d` failed in `stage62-solo-shelf` "Math → Pulse → Connections → Math…": `math-mayhem: expected 'error' to be 'playing'`. That test has no faults at all.
  - **History:** full gate `20261111-194026-83406685-7879` failed two other tests in the same `stage62` describe, plus the `stage74` setup that D-S101-07 fixed.
  - **Root cause:** each solo request there had 300 ms (`stage62`) or 250 ms (`stage74`, faulted tabs). The real server runs in the test's own thread.
    - Under gate-like load a passing request took at most 29 ms (55 requests, median 4.6 ms), so the cause is not slowness. It is an event-loop stall longer than the allowance.
    - When the loop resumes, due timers run before I/O, so the session's timeout fires even though the reply has arrived.
  - **Reproduced deterministically:** a temporary switch (not committed) blocked the loop for 400 ms during one passing request per test.
    - Before the fix it failed 4 of 5 tests in each harness, the first `stage62` test with the gate's exact error.
    - After the fix, all 10 pass with the same stall.
  - **The fix (tests only):**
    - A session or tab with no faults gets 5 s.
    - One with no-answer faults gets 2 s, the same allowance the `stage81`/`stage82` harnesses use. A "drop" or "hang" still ends through the session's own timeout, so what these tests check (timed out vs quick failure, no resend after a timeout, rooms made, the 700 ms Start budget) is unchanged.
    - The tests that wait through those faults get a 30 s test timeout.
    - Cost: the `stage62` file takes about 16 s and `stage74` about 10 s (they run in parallel with other files). The whole suite under load took 44.6 s, against 40.1 s in the failing gate run.
  - **Not affected:** `stage61`'s 150 ms harness answers from an in-memory server, so its replies resolve before any timer.
  - **Alternative rejected:** re-running the gate until it passed, and adding a timer seam to `SoloSession` (a product change for a test-only problem).
- **D-S101-11 `check-tv-outage` reads the TV's connection note in one call.**
  - **Trigger:** full gate `20261112-122710-25c28143-13503` on `25c2814` failed, 87 of 88 passed. The failure was `check-tv-outage` "server back: the note goes away and the room is shown — not within 15000ms (locator.getAttribute: Timeout 30000ms exceeded.)". The next check passed at once.
  - **Root cause (a driver race, unchanged since Stage 5.1):**
    - The helper counted the `tv-conn` note, then read its `data-state` in a second call.
    - The "reconnected" note goes away 4 s after it appears (`App.tsx`). If that happens between the two calls, `getAttribute` waits its whole 30 s default for an element that no longer exists, and the 15 s check fails.
    - The timeline matches: reconnected at +36 s, removed at about +40 s, the failure at +70 s.
    - The repair's `App.tsx` change adds only synchronous cup-memory calls and doesn't touch the note.
  - **Reproduced deterministically:** a temporary 4.5 s gap between the helper's two calls (`docs/evidence/stage101-local/tv-note-race.patch`) fails the check with the gate's exact message.
  - **The fix:** one `evaluate` returns the note's state, or `null`. The same 4.5 s delay placed before that single read passes, and a normal run passes all 14 checks. What the driver checks is unchanged.
  - **Alternative rejected:** a short `getAttribute` timeout. It narrows the window but keeps the race, and a timeout of 0 means no timeout in Playwright.
- **D-S101-12 `check-jebena-rush` checks the out screen whichever turn takes the last cup, and fails if it never does.**
  - **Trigger:** full gate `20261112-130723-36e222fb-785` on `36e222f` passed 88/88, but its Jebena run had no "is out and watches the rest" checks and no out screenshot.
  - **Root cause (my R2 driver addition):** Baraka had lost a cup earlier in that run, so his R2 short-drop turn took his last cup. That branch, like Amina's offline turn, ends with `continue`, skipping the out block after the ordinary timeout. A section that silently doesn't run is a coverage hole, even in a green run.
  - **The fix:**
    - One `outChecks()` runs from all three branches.
    - A last cup lost while the driver had cut that phone must show broken without breaking (S101-R2); a live one must break on the player's own row, as before.
    - With three players someone always goes out before the end, so the driver fails if the match ends without these checks having run.
  - **Verified:**
    - A temporary switch holding Baraka's short drop until his last cup runs the resync form, ALL PASS (`docs/evidence/stage101-local/`).
    - A normal run passes, 162 checks.
    - In targeted `20261112-134621-0516e3ea-17341`, Amina went out first and the checks ran on her phone.
  - **Alternative rejected:** moving the short drop to a turn where Baraka can't go out. Which turn that is depends on earlier losses, so the R2 reconnect check could itself stop running.
- **D-S101-13 Reconnect checks read a page's break log from a cursor and never erase it (review 6828948844, S101-R3).**
  - **Trigger:** ChatGPT's own run of `check-jebena-rush` on `0516e3e` failed "E the resync showed her broken cup without replaying the break" (160 PASS, 1 FAILED). The check filtered Amina's whole log for her seat, so a cup she lost live before her phone dropped (her own row and the seat list, slot 2) counted as a replay. A driver defect; the cups code is not involved.
  - **The fix (test-only):**
    - Every logged break has a number on its page (`n`).
    - `scripts/lib/break-log.mjs` takes a cursor (`cursorOf`) and returns only what came after it (`since`, `newSeatBreaks`).
    - These checks now take a cursor instead of reading or erasing the history:
      - E, Amina offline;
      - R2, Baraka's short drop. It used to erase his log, which hid his earlier breaks from the end-of-match checks;
      - the out screen's resync form;
      - the same-tab room switch;
      - the wrong tries;
      - Play again.
    - The end-of-match checks still see the whole match.
  - **The reviewer's ordering always runs:**
    - Amina's phone drops only on a turn after a live loss of hers.
    - The driver asserts that earlier break is in the log, on her own row and in the seat list, before checking the resync.
    - It also fails if the offline resync, Keku's reload or the R2 short drop never ran.
  - **Regression:** `tests/stage101-break-log.test.ts` (7). A prior own break on the HUD and the seat list passes; a newly replayed break on either fails, for the lost slot too; other seats don't count; the history is never erased.
  - **Before and after, locally:** the repaired driver with the old lifetime check put back fails exactly the reviewer's check (164 PASS, 1 FAIL). The repaired driver passes (165 PASS, 0 FAIL).
  - **Alternatives rejected:**
    - erasing the log at the offline boundary: it hides history from the integrity checks;
    - filtering by timestamp: clocks across pages and the server aren't one sequence;
    - retrying the check.

## Stage 10.2: a results line for a genuine moment (Jebena Rush and Spectrum)
- **D-S102-01 Extend the existing moment layer.**
  - **How:** `jebenaMoment` and `spectrumMoment` join `apps/web/src/ui/mchezo/lib/moments.ts` (Stage 5, S5-E), which already holds one pure, deterministic line per finished game. They render with the same element as the Stage 5 lines (`results-moment`), and on the TV as `tv-results-moment`.
  - **Alternative rejected:** a new results framework. It would duplicate the Stage 5 rules for the same job.
- **D-S102-02 Jebena's guards.**
  - **When a line can appear:** only when the module ended the match (`end` not null), with one sole winner (first place, not out, not sat out), and at least one opponent knocked out by losing every cup, not by leaving.
  - **J1:** exactly one cup left. **J2:** every starting cup still whole.
  - **No line for:** ties, room-ended games, wins by others leaving, and ordinary wins.
  - **Alternative rejected:** allowing a line when every opponent left. It would comment on absence.
- **D-S102-03 Spectrum's guards.**
  - **When a line can appear:** only for a match the module completed with every planned round revealed.
  - **S1:** every round scored and 40 of 40. It takes priority over **S2:** one or more scored rounds at distance 0.
  - **Team words only:** no names, no winner, place or Cup, and never anyone's own guess.
  - **Alternative rejected:** a bullseye line in an early-ended match. The early ending is the main fact there, and a quip beside it reads as commentary on who left.
- **D-S102-04 Placement.**
  - **Phone:** right under the game's own result line, after the result hero and What's next, so Play again, Pick another game and Take a break don't move.
  - **TV:** under the final view's result line.
  - **No line:** nothing is rendered, not even an empty box.
- **D-S102-05 Fixed, unnamed copy.**
  - **Why:** the lines are authored strings, never chosen at random, so a host, a guest, the TV and a reload read the same words.
  - **Names:** Jebena's lines name nobody, because the headline above already names the winner. Spectrum's lines speak of the team and its rounds.
- **D-S102-06 The Memory Book judges freshness by the loaded response's watermark (review 6831760093, S102-R1).**
  - **The defect:** the screen compared the newest event this viewer may see with the room's unfiltered seq. When the room's newest event is private to someone else, the two never meet, and "Checking for the latest finished game…" waits forever. Private events here are another player's sit-out or recovery code, or a live game's scores. The defect was older than Stage 10.2. A sit-out that ends a game is logged after its `game-finished`, so it is the newest event in exactly the rooms where a highlight is wanted (the reviewer's Spectrum room, and any game ended by the last leaver).
  - **The repair:**
    - `GET /rooms/:id/ledger?watermark=1` returns `{ seq, events }`, where `seq` is the room's seq (already public in every projection) at the moment the events were filtered for this viewer. Without the opt-in, the same plain array goes to every existing consumer (`RoomEngine.ledgerViewFor`).
    - The web keeps the watermark of the response it actually loaded (`ledgerAt`), not the projection's seq at completion time.
    - The pure `memoryLink` (`apps/web/src/ui/mchezo/lib/memoryLink.ts`) gives one of five states:
      - `loading` (nothing loaded);
      - `syncing` (the loaded watermark is behind the room, so a newer game may have finished);
      - `none`;
      - `unavailable` (the last finished game is a team game, not saved yet);
      - `ready`.
    - Add is enabled only when `ready`.
    - `newerLedger` refuses a response whose watermark is older than the one loaded, so overlapping loads can't roll the screen back.
  - **Unchanged:**
    - redaction (`ledgerFor` filters exactly as before; the watermark is a number every role already sees);
    - the stale-citation guard (a ledger behind the room still can't cite the game before);
    - the Memory Book's own rules (`NOT_IN_MEMORY_BOOK` for Spectrum).
  - **Spectrum:** says plainly that the last game was a team game and team games aren't saved yet. Saving them is the next slice, not this repair.
  - **Alternatives rejected:**
    - the max visible seq (the defect);
    - dropping the guard (could cite an earlier game);
    - sending private events' seqs (leaks that something private happened, and when);
    - a separate context endpoint (one opt-in on the existing route is smaller, and the watermark comes from the same filtering pass).
  - **Tests:**
    - `tests/stage102-memory-freshness.test.ts` (13), over HTTP: another player's recovery code; a sit-out in a running game; a supported game ended by the last sit-out; the reviewer's Spectrum case; the plain array unchanged; the opt-in needs a session from this room;
    - pure: current, stale, out-of-order, Spectrum, loading and none;
    - browser: `check-spectrum` (the reviewer's journey: "unavailable", never "Checking…", after a reload too) and `check-jebena-rush` (a replay ended by sit-outs: ready, and the highlight cites exactly that replay's finish).
    - The Spectrum driver run against the pre-fix web build fails exactly these checks, still showing "Checking for the latest finished game…".
- **D-S102-07 The short reconnect gets a room of its own, and its waits a hard deadline (review 6831760093, S102-R2).**
  - **What went wrong:** in the main match, turns kept running out while the driver handled Amina's offline resync. So Baraka's "short drop" could land on the turn that ended the match: Amina was already out, and his phone was cut through the deciding loss. The driver then waited for a playing-screen element on the results (a locator that blocks for 30 s), and the "later live loss" never happened. All four failures follow from that, not from the app.
  - **The repair (driver only):**
    - The short reconnect moved to room S: Pendo's phone (390 px, reduced motion, socket and polls through the driver) against Halima, who answers whenever the jebena is hers, with 3 cups.
    - Each step checks its preconditions first (whose turn, the cups, the match still on), then acts:
      1. the drop, 3 → 2: the match goes on, and the resync must be seen within 3 s of the server's recorded loss;
      2. a later live loss, 2 → 1: it breaks once;
      3. the final loss, 1 → 0: it ends the match and breaks once on the results.
    - `scripts/lib/deadline.mjs` `soonUntil` races every probe against the time left. A late or missing observation is a FAIL, and nothing is retried after the deadline (`tests/stage102-deadline.test.ts`, 5).
    - The main match keeps Amina's offline resync, Keku's reload, and the R1 checks on the runner-up's phone, which is never cut now.
  - **The final-loss question:** with the scenario valid, Pendo's reduced-motion phone breaks the last cup exactly once on the results after an earlier short reconnect. So the reviewer's R1 failure didn't reproduce, and no runtime change was made.
  - **Negative control:** a copy of the driver that keeps the phone cut past the window fails the window checks instead of passing late.
  - **Alternatives rejected:**
    - a longer wait (a late resync would pass);
    - accepting a finished game in the drop step (the original gap);
    - skipping a step whose precondition fails (it fails instead).

## Stage 10.3: Spectrum's team result in the Memory Book, and a Memory Book for every look
- **D-S103-01 A typed team record, derived and frozen by the server.**
  - **How:** when an entry cites a Spectrum game's `game-finished`, the server reads that game's finalized `outcome.team` (checked against `TeamResultSchema`) and stores a `team` record on the entry. The record holds kind, game and event ids, total and max, revealed and planned rounds, and the ending.
  - **Readable lines:** the matching `derivedFacts` lines are added too.
  - **Request data:** nothing but the day, the note and the cited ids is read from the request.
  - **Alternatives rejected:**
    - storing only text lines: a later surface would have to re-parse them;
    - reading facts from the client's projection or the request: the client can lie;
    - writing per-player copies: a team game has no per-player result.
- **D-S103-02 Spectrum by name.**
  - **How:** a `memoryBookTeam: true` flag on Spectrum's registry entry, which reaches the web through `GET /games`. Every other cooperative game still gets `NOT_IN_MEMORY_BOOK`.
  - **Alternative rejected:** enabling every `cooperative` game, which would silently save shapes nobody reviewed.
- **D-S103-03 The endings that can be saved.**
  - **Saveable:** `completed`, with every planned round revealed, and `too-few-players`, with fewer revealed than planned. The early ending says so in every line.
  - **Refused** (409 `RESULT_NOT_SAVEABLE`, said on the screen):
    - an ending of `null` (the room's time limit cut the match mid-round; its own note says it counts as practice);
    - a voided or unfinished game;
    - a missing or invalid team record;
    - a round count that doesn't fit the ending.
  - **Alternative rejected:** saving a room-ended match as "ended early". Its last round was cut, not finished, so "the actual played rounds" would be unclear. It can be added later on its own.
- **D-S103-04 One citation per team entry.**
  - **Why:** a team entry stands for one match. An entry citing a team finish together with anything else is refused (400 `ONE_TEAM_GAME`), so facts from two games never mix.
  - **Competitive entries** keep their existing rules.
- **D-S103-05 One wording, shared.**
  - **How:** `src/shared/memoryTeam.ts` turns a team record into its lines. The server uses it for `derivedFacts` and the Markdown export; the web uses it for the entry card, the PDF and the share image. So every surface says the same thing.
  - **Content:** the lines name no player and claim no winner, place or Cup point.
- **D-S103-06 Titles follow the device's look; the server's are neutral.**
  - **On a device:**
    - Everyday: the screen, PDF and share image say "Mchezo Memory Book", with no tree;
    - Christmas: they keep "Christmas Memory Book" and its 🎄.
  - **The server's Markdown:** it has no look, so it says "Mchezo Memory Book".
  - **What the look changes:** only titles and decoration, never facts or content.

## Stage 10.4: save a memory without leaving the result screen
- **D-S104-01 Bind to the game on screen.**
  - **How:** the results screen sends `fromGame` (the game it shows), and the server resolves that game's own `game-finished` event in this room. An old result can't save a newer match, even if one finished while the composer was open.
  - **Facts and checks:** facts and refusals are exactly Stage 10.3's (`teamFactsFor` for Spectrum, score events for Jebena).
  - **Alternatives rejected:**
    - "the last finished game" at request time: it races a replay;
    - the client sending the finish event id it found: it would need the ledger on the results screen, and the server can resolve it just as safely.
- **D-S104-02 Idempotency by member and key.**
  - **The key:** a `requestId` the screen makes once per draft, scoped to the room and the member and kept with the book. The same key and request return the same entry. The same key with a different request gets 409 `ATTEMPT_MISMATCH` and the original entry, so nothing is overwritten.
  - **The boundary:** a new draft is a new note on purpose; no deduplication by game.
  - **Alternatives rejected:**
    - deduplicating by game and member: it would forbid a second, intentional note;
    - by note text: an edited retry would duplicate;
    - client-only "disable the button": a lost reply and a reconnect would duplicate.
- **D-S104-03 An inline composer on the result screen.**
  - **What:** the facts are read-only, the note is the player's, and Save and Cancel are explicit.
  - **Where:** it sits under the result line, so What's next and its controls don't move.
  - **Alternative rejected:** a dialog over the results, which would hide the result it describes and needs focus trapping for little gain.
- **D-S104-04 Spectrum and Jebena Rush only.**
  - **Why:** their facts are already trusted (Stage 10.3 team record; Jebena's score events), and the handoff names them.
  - **Other games** keep the manual Add in the Memory Book. A later slice can extend the action.
- **D-S104-05 The server shuts down in bounded time, whatever its clients do.**
  - **Why:** the full gate on `c634500` failed `check-tv-outage`'s "the driver's server exits within 20 s of SIGTERM" (an earlier full gate, `20261112-064509-b668ee3c-28530`, hung at the same step). `close()` sent a close frame to each tracked socket, then waited for the WebSocket and HTTP servers to close. Those wait for every client's close handshake, and a client that never answers is only cut off by `ws`'s own 30-second close timeout. A socket refused at the door (no such room) was never tracked at all.
  - **How:** `LocalServer.close()` sends every open socket (`wss.clients` and the tracked ones) a close frame, waits up to 1.5 s for the goodbyes, then terminates whatever is left; the HTTP server gets the same bounded wait before `closeAllConnections()`. Well-behaved clients still get a close frame first.
  - **Tests:** `tests/stage104-shutdown.test.ts` (a deaf TV socket, a refused socket still closing, a polite close that isn't cut). Before the fix the first two waited past 5 s; after it, all three pass.
  - **Alternatives rejected:**
    - raising the driver's 20 s limit: it hides a shutdown that can stall a restart for 30 s;
    - retrying the step: "flake" isn't a root cause;
    - terminating every socket at once: it skips the polite goodbye clients rely on to show "reconnecting" rather than "lost".
- **D-S104-06 A Memory Book change is live only once it is on disk.**
  - **Why:** ChatGPT's review 6842636842 found that a save added its entry and its request key to the live book before writing it. When the write failed, the reply was 500, but the live book kept both: a same-key retry answered 200 from memory with nothing on disk, and the note was gone after a restart. Approvals, revocations and manual Add had the same order.
  - **How:** `LocalServer.commitBook()` is the only way a room's book changes. It clones the live book (`MemoryBook.clone()`: entries, id counter and save keys, nothing shared), makes the change on the clone, writes it (`atomicWriteFileSync`: a failed write leaves the old file), and only then makes the clone the live book. From the clone to the swap it is synchronous, so no other request sees or changes the book in between. A save's attempt lookup reads the live book after the request body has arrived.
  - **Result:** a failed write answers 500 ("The Memory Book couldn't be saved, so nothing changed.") and leaves the visible book, approvals, exports and save keys exactly as on disk, with no id used. A same-key retry once the disk works writes exactly one pending entry (201), which survives a restart. The composer keeps the draft and the key and offers Try again on a 5xx.
  - **Tests:** `tests/stage104-book-durability.test.ts`: one failed write then a retry, three failed writes, a committed save with a lost reply, approval and revocation, manual Add. Four of the five failed before the fix.
  - **Scope:** the Memory Book only. Room state keeps its Sprint 1 rule: the change happens in memory, a failed save answers 500, and the next successful save writes the whole snapshot.
  - **Alternatives rejected:**
    - undoing the change after a failed write: it needs an exact inverse for every operation, and an approval edits an entry in place;
    - writing before validating: a refused change would still cost a write.

## Stage 10.5: a Memory Book that stays current
- **D-S105-01 A durable book revision, moved only by a committed change.**
  - **How:** each room's book keeps a whole-number `revision` on disk, separate from the ledger `seq`. `commitBook` (D-S104-06) raises it by one on the staged copy, so it's written with the change and goes live only after the write succeeds. A failed write, a refused change, an idempotent repeat, a read or an export never moves it. Old books load as 0.
  - **Alternatives rejected:**
    - reusing the ledger `seq`: a book change isn't a game event, and bumping `seq` would make every page reload its ledger and look for new finishes;
    - a timestamp: clocks repeat and go backwards; a counter orders changes exactly.
- **D-S105-02 Revision-only notice; the data comes by authenticated fetch.**
  - **How:** member projections carry `memoryRevision`, and after a commit the server sends `{ kind: "book", revision }` to this room's member sockets with a current credential. TV and spectator projections and sockets get neither. Pages fetch `GET …/memory?revision=1` to learn what changed.
  - **Why:** a notice can be late, lost or duplicated without harm, and it carries nothing private. The fetch rechecks the session every time.
  - **Alternatives rejected:**
    - pushing the entries in the frame: it would put note text on the socket and trust the notice's contents;
    - a full projection broadcast per book change: it moves `rev` for everyone, the TV included, and costs a projection per socket;
    - faster polling of the book: a request storm for something that changes a few times a night.
- **D-S105-03 One ordered book per page.**
  - **How:** a page keeps the highest revision it has heard of and the book it has applied. One fetch runs at a time; a reply is applied only if it's for this room and newer than what's shown; a newer notice during a fetch triggers one more fetch. Room switch and leave reset it.
  - **Alternative rejected:** request counters alone (the Stage 10.2 book load), which order requests but can't tell a page that what it shows is already out of date.
- **D-S105-04 Every new export takes a fresh snapshot, fails closed, and restarts on a newer revision.**
  - **How:** Markdown comes from the server's export; PDF and share image are built from a fresh `?revision=1` snapshot's approved entries. If the check fails, nothing downloads and the page says so; it never uses the approvals on screen. A newer revision heard during the fetch restarts it, up to three times, then the export is cancelled with a message. Markdown on screen is removed once the book moves past its revision.
  - **Alternative rejected:** exporting from the screen's state when it looks current. "Looks current" is exactly what a missed notice gets wrong.
- **D-S105-05 The export boundary.** A downloaded file can't be recalled. A revocation that commits after an export's final snapshot doesn't change that file; only the next export reflects it. The report, the spec and the screen's wording say so rather than imply otherwise.
- **D-S105-06 A failed book refresh retries itself, with backoff, until the page catches up.**
  - **Why:** ChatGPT's review 6845502314 found that a failed automatic refresh was never retried while the revision stayed the same. The projection effect only reruns when `memoryRevision` changes, and a frame only arrives on a change, so a page stayed behind until the book changed again or was reopened. The code comment said "the next notice or poll tries again"; it didn't.
  - **How:** when a refresh fails and the page is still behind what it has heard (`heard > applied`) with the book open, `syncBook` schedules one retry after 1, 2, 4, then 8 s at most (`retryDelay`). A success resets the count. A newer notice fetches at once and replaces the pending retry. Leaving the book, switching rooms, signing out or unmounting cancels it, and the timer checks again before fetching. Still one fetch at a time, and a caught-up page makes no request.
  - **Tests:** `check-book-live` B13–B16 (B13 and B14 failed on the unfixed code) and `tests/stage105-book-sync.test.ts` (`shouldRetry`, `retryDelay`).
  - **Alternatives rejected:**
    - re-hearing the revision on every projection, so each poll refetches while behind: it ties retries to game-tick broadcasts, which can be frequent during a game;
    - an unbounded immediate retry: a storm when the network is down.

## Stage 11.1: the Warm Ivory Christmas look
- **D-OWN-1113 Owner decision: Warm Ivory for Christmas (Option A).** Keku chose Option A, Warm Ivory, from the Christmas theme mockups on November 13 (comment 6845465785, "A sounds good"). It replaces the heavy green Christmas look with a light, modern one: ivory page, cream cards, dark warm text, restrained cranberry, small gold and sage touches. Everyday stays as it is. This is the owner's choice; no new option round. ChatGPT's handoff 6847066185 gives the implementation spec.
- **D-S111-01 A look declares its tone; light-only adjustments are scoped by it.**
  - **How:** `MchezoTheme` gains `tone: 'dark' | 'light'`. The provider and `applyDocumentLook` write it as `data-mz-tone` (and `color-scheme`). The few rules a light ground needs (card hairlines, softer shadows, the neutral key's edge, accent-coloured kickers, legacy pastel text, the Jebena disc) live in one stylesheet, `stage111.css`, under `[data-mz-tone="light"]`.
  - **Why:** every rule stays generic, so a future light look gets them too. Everyday, a dark look, matches none of them, so its appearance can't drift.
  - **Alternatives rejected:**
    - selectors on the theme id (`[data-mz-theme="christmas"]`): that couples CSS to one season;
    - a token for every case (shadow strength, kicker mix, card outline): many tokens whose Everyday value would be "none", for no gain.
- **D-S111-02 On a light look, each accent is dark enough to be both text and a fill.**
  - **How:** cranberry, antique gold, pine sage and slate each pass 4.5:1 as text on ivory and both card colours, and under cream text as a fill.
  - **Why:** the CSS uses each accent both ways (`highlight` is a kicker, a focus ring and a badge fill; `success` is a gain number and a badge fill). One value per role keeps every existing rule correct, and the existing pure contrast test covers it.
  - **Alternative rejected:** bright fills plus a second set of "accent text" tokens. That doubles the palette and means editing every rule that uses an accent as text, for a look the owner wants restrained anyway.
- **D-S111-03 A semantic foreground for colours that don't change with the look (`onBright`).**
  - **How:** player tokens and game cover accents keep their fixed bright colours in every look, so their text is a fixed dark `onBright` (`#16111D`). `onAccent` stays the text on the look's own accents (cream on Warm Ivory).
  - **Why:** the handoff asked for this audit: one `onAccent` can't be right for both a cranberry key and a pastel player dot.
  - **Everyday:** its `onBright` equals its `onAccent`, so nothing there changes.
- **D-S111-04 `tokens.css` is generated, and a test keeps it honest.** `scripts/gen-tokens-css.mjs` writes it from `tokens.ts`, and a unit test fails if they disagree. Before this, the file said "generated" but was edited by hand.
- **D-S111-05 Everyday is proven unchanged by comparing computed styles, not by eye.** The new driver renders the same Everyday screens on the base build and this build, and compares every element's computed colour, background, border, outline and shadow. Any difference fails the check. Screenshots are kept for people to look at, but the check doesn't depend on pixels: room codes, names and timers vary, while computed colours don't.

## Stage 11.2: readable casual Memory Books
- **D-S112-01 A book entry's day label comes from its source's mode, and the mode comes from the server, never the look.**
  - **How:** new entries record `source.mode` from the room's kind (fixed for a room's life; solo counts as casual). Older entries take the room's kind. Cup entries show "Day N", using the cited game's own day. Casual entries show no day and are identified by the game's title. One shared rule (`src/shared/memoryPresent.ts`) serves the screen, the PDF and the Markdown.
  - **Alternatives rejected:**
    - the room's current day: that's the defect, and it also misfiles Cup notes added on a later day;
    - numbering casual games ("Game 3"): the handoff forbids inventing numbering, and a number isn't stable across replays and cancels.
- **D-S112-02 Readable facts come from names the server records, with a same-room fallback and then "A player".**
  - **How:** a new competitive entry records `source.scores`, one per derived fact, with the player's name at that moment (the server's own room players; `null` if the id isn't a player). `derivedFacts` is unchanged. Older entries resolve ids through the same room's players: players are never removed and names never change, so that lookup is reliable. Anything unresolved prints "A player", never an id.
  - **Alternatives rejected:**
    - rewriting `derivedFacts` with names: it changes stored facts and older evidence;
    - client-supplied names: clients don't get to state facts;
    - parsing note text: never.
- **D-S112-03 Exported text is escaped, and `source` is optional and dropped if invalid.**
  - **Escaping:** Markdown escapes the note, names, titles and room name. Newlines are collapsed, and exactly ``\ ` * _ [ ] < > # | ~ &`` get a backslash.
    - `(`, `)` and `!` are not escaped: once `[` and `]` are, they can't start a link or an image.
    - The first version escaped them too. The targeted gate on `9e85bd5` caught it, because a Spectrum team line "(fewer than two players were left)" exported with backslashes. Fixed in `6cae259` with a test.
  - **Invalid `source`:** an invalid `source` on restore is dropped rather than refusing the book, because it only changes presentation. The older-entry rule then applies. A team record keeps its stricter rule.
- **D-S112-04 The PDF prints only what its font can print; anything else becomes "?", and the PDF says so.**
  - **The problem:** the PDF's built-in font (jsPDF Helvetica) covers Windows-1252. jsPDF writes a line containing any other character (Ł, Ş, Greek, Cyrillic, CJK, emoji) as two-byte text the font can't read.
    - Poppler shows the ASCII parts and prints the name wrongly: 李雷 as "gN–÷", Łukasz as "Aukasz". Other viewers may garble more of the line.
    - Notes always had this. This stage put names into the PDF, so it would have reached fact lines.
  - **How:**
    - every PDF line goes through `pdfText`: NFC first, then each character outside Windows-1252 becomes "?" (an emoji counts once);
    - the duplicate-name rule runs on the printed names, so 李雷 and 王芳 print as "??" and "?? (2)", never as one player;
    - when anything was replaced, one closing line says so and points to the Markdown export, which keeps every character;
    - the screen and the Markdown are unchanged.
  - **Alternatives rejected:**
    - embedding a Unicode font: CJK coverage alone is several MB, an asset and dependency decision beyond this slice;
    - transliterating (Ş to S): it silently changes a person's name;
    - "A player" for such names: untrue, since the player is known;
    - a "Player 3" label: it's derived from the internal id and invents numbering.
- **D-S112-05 An older Cup entry's day comes from the same room's citation at read/export time, never from its stored day (ChatGPT's spec feedback 6851031292).**
  - **The problem:** before this stage an entry stored the day it was added, so a Day 2 note about a Day 1 game was stored as day 2.
  - **How:**
    - with no recorded days, the label follows each cited finish to its game and uses that game's recorded day (the room's own rule, `g.day ?? 1`);
    - if any cited finish or game can't be found in the room, there's no day label at all; the label falls back to the citation's title, then "A game";
    - the same path names an older casual entry's game;
    - one rule serves the screen, the PDF and the Markdown;
    - the stored entry is never changed (no migration);
    - the web's results line and link preview also use only the game's recorded day.
  - **Alternatives rejected:**
    - the stored day as a fallback: the feedback rules it out, and it's the wrong value in exactly the case at issue;
    - rewriting stored days on restore: a migration, and it would change existing evidence.

## Stage 12.1: one path, and the TV as the hero (owner-directed)
**Authorization:** the owner, directly in chat on 2026-11-13 at about 4:50 p.m. ET. Quoting my two design recommendations, the owner wrote that I have their "blessing to optimize however you think is best … implement those in the way you think is best". Spec: `docs/stage12/stage121.md`. These are reversible product decisions under that blessing. Nothing is merged or deployed. ChatGPT can review them like any stage.

- **D-S121-01 One path at the door: Join and Host, with Play solo as a quieter link; every hosted room starts casual.**
  - **Home:** two dock buttons: Join a room first (an invited guest is the most common arrival), then Host a game. Play solo moves to a full-width text link under them ("Just you? Play solo"), still one tap.
  - **Host:** asks only for a name. One line says a week-long Family Cup can come later from the room menu.
  - **The API is unchanged:** `POST /rooms` still takes `kind`, so scripts, tests and older clients can still create a Cup directly.
  - **Alternatives rejected:**
    - keeping "Casual or Family Cup?" at the door: it's the decision the owner's brief asked to remove, and a first-time host can't judge it;
    - removing Play solo from Home: solo is a real use (practice, a personal best), so it stays one tap away.
- **D-S121-02 "Make it a Family Cup" turns a casual room into a Cup in place, one way, host only. Games played while casual stay casual. This amends D-S112-01.**
  - **Engine:** `RoomEngine.upgradeToCup`; HTTP: `POST /rooms/:id/cup`.
  - **Who and when:** host only; casual rooms only (solo can't); refused while a game is getting ready or playing; idempotent for a room that's already a Cup.
  - **What it does:**
    - the kind becomes `cup`, the day 1;
    - a fresh Cup record (new id, created now, same timing version);
    - `casualGameIds` keeps every game already in the room;
    - `cupSince` records `{at, seq}`;
    - one ledger event `cup-started`;
    - Quick Party, What's next, breaks and host handover end with the casual room.
  - **Persistence and visibility:** persisted and restored. `cupSince` and `casualGameIds` are in every projection (public facts).
  - **The Memory Book:** an entry's mode is its cited game's era. A game in `casualGameIds` is casual (no "Day"), and Cup games are filed under their day. So D-S112-01's "the room's kind is fixed for a room's life" no longer holds, and the mode is per game instead. New entries record it at creation. Older entries resolve it from the citation.
  - **The up-next plan:** after the upgrade, the stored up-next plan becomes Official for an official-eligible game. The host's phone follows, like a Cup created at the door; the host can still pick Practice.
    - **Found by the drivers:** before this, the casual plan (always practice) carried over and the new Cup's Start defaulted to Practice. check-casual and check-f4 caught it, and it now has a unit test.
  - **Alternatives rejected:**
    - creating a second room and moving everyone: every phone rejoins, and the night's history splits;
    - counting the casual games retroactively: they were never official, and rewriting them would change scores;
    - a two-way switch: a Cup's official results can't become "just for fun" honestly.
- **D-S121-03 What the upgrade deliberately doesn't do: content still doesn't follow the look, and Cups don't get Quick Party.** Both are written up as owner proposals in `docs/stage12/stage121-discussions.md`.
  - **Content following the look** would reverse the reviewed Stage 8.2 rule (Everyday unless the host picks Christmas).
  - **Quick Party in a Cup** touches the Cup's start rules.
- **D-S121-04 The TV lobby shows a QR code of the join link.**
  - **What it encodes:** exactly `<origin>/join?code=CODE`, the link the phone's Invite sheet shares. It's drawn on the TV with the existing `qrcode` dependency, and nothing leaves the screen.
  - **Layout:** the QR sits beside the big code, with "Scan with a phone camera, or go to …" and the short address for people who'd rather type.
  - **Tested:** `check-one-path` reads the drawn modules back and compares them with the encoder's matrix for the expected link.
- **D-S121-05 A competitive game's final on the TV is a reveal: podium, standings, then the night so far. Medals are display only.**
  - **The podium:**
    - gold, silver and bronze by shared competition rank (10, 10, 5 gives two golds and a bronze, no silver);
    - a medal needs a score above zero;
    - a game where everyone tied, or with fewer than two scored players, or a cooperative game, has no podium;
    - it rises bronze, then silver, then gold over about 3 s, only with full motion;
    - with reduced motion (OS), Animations Off, or the director's Pause, it shows at once.
  - **The medal table (casual rooms):** the same rule summed over every finished game. Ordered by golds, then silvers, then bronzes, then name, then id. Shown on the final and in the lobby ("N games tonight").
  - **Not facts:** medals are never scores, Cup points or Memory Book facts. Pure functions in `apps/web/src/ui/mchezo/lib/medals.ts`, with tests.
  - **Contrast:** each block has a solid base colour under its gradient, so its dark number reads 5.9:1 or better against every stop, and a contrast check that reads solid backgrounds sees the true one. An empty step shows no number.
    - **Found by the full gate on `ce3e0a8`:** check-contrast measured the "2" at 1.00:1 against the page behind a gradient-only block.
  - **Alternatives rejected:**
    - dense ranks (1, 1, 2): every medal table uses shared places;
    - medals for zero: a bronze for not scoring reads as a joke at someone's expense;
    - putting medals in the Memory Book: they'd become a second scoring system.
- **D-S121-06 The Cup on the TV: the server's numbers, with movement only from what this TV saw.**
  - **Lobby card:** the top five with shared ranks, "Day N of 7", and the day's leader(s) from the server's own `ceremony()` ("X is leading Day N"; "leading on the final day" on Day 7).
  - **After an official game:** the final shows "Family Cup · after this game" with ▲/▼ against the standings the TV held while that game was getting ready or playing. A TV that wasn't open then shows no arrows, never guessed ones.
  - **"Cup standings" (a director button):** the Cup podium from the totals. Here a shared lead is a real result, so everyone on the top total stands on gold (`cupPodium`), and nobody without points stands on it.
  - **Mode words:** a Cup room's games from before the upgrade are labelled Casual on the TV, never Practice.
  - **Alternatives rejected:**
    - a server-side "previous standings": more state for a presentation detail; the TV's own memory is honest about its limits;
    - reusing the game podium rule for the Cup: it would hide a shared lead ("No Cup points yet" was on screen in the first local run with all three tied on 50; fixed before commit).
- **D-S121-07 The day's trophy, and never a champion.**
  - **When:** the TV remembers the last ceremony it saw for each day. When the host ends a day while the TV is open, it shows "Day N complete", a trophy and that day's winner(s) as the server named them ("X wins Day N", or "X, Y and Z share Day N").
  - **No winners that day:** no trophy, and it says no official game finished.
  - **A TV opened later** never shows it.
  - **No champion:** the server has no end-of-Cup state, so the TV never says "champion". The Make-a-Cup sheet's "a champion at the end" was removed for the same reason.
  - **Alternative rejected:** crowning the overall leader after Day 7. That's a Cup-rules addition (`docs/stage12/stage121-discussions.md`).

## Stage 12.2: finishing the one path (undo, nudge, /tv, content follows the look, TV copy)
**Authorization:** the owner, directly in chat on 2026-11-13 at about 10:40 p.m. ET, replying to the Stage 12.1 report's discussion list: "I agree with the suggestions as well please implement, self direct your self do the best you can with good quality". Spec: `docs/stage12/stage122.md`. Branch `claude/stage12-2-one-path-follow-ups`, stacked on Stage 12.1 (`d80dfb7`). Nothing is merged or deployed. ChatGPT can review these like any stage.

- **D-S122-01 "Back to a casual game night": the Family Cup upgrade can be undone until the first official game finishes. This amends D-S121-02's "one way".**
  - **Engine:** `RoomEngine.undoCupUpgrade`; HTTP: `POST /rooms/:id/casual`.
  - **Who and when:**
    - host only (403 `NOT_HOST`);
    - only a room that became a Cup through the upgrade. A Cup created as one has no game night to go back to (409 `NOT_UPGRADED`), and a solo room isn't a Cup (409 `NOT_A_CUP`);
    - refused while a game is getting ready or playing (409 `GAME_IN_PROGRESS`);
    - refused once any official game has finished (409 `OFFICIAL_GAME_PLAYED`);
    - a room that's already casual changes nothing (200, `changed: false`).
  - **What it does:**
    - the kind becomes `casual` and the day 1;
    - every game in the room joins `casualGameIds`, including practice games played during the short Cup;
    - `cupSince` is cleared; the session is reset with no break;
    - one ledger event, `cup-undone`, with the actor and the number of Cup-era games;
    - `cupUndone {at, seq, games}` is recorded (persisted, in every projection) so the lobby can say so;
    - the stored up-next plan becomes non-official.
  - **The Cup record** is kept but unused; a later upgrade starts a fresh one, as before, and clears `cupUndone`.
  - **The Memory Book (amends D-S121-02's era rule):** when the server says a cited game is casual now, that wins over the "cup" mode an entry recorded when it was saved. This can only happen to a practice game played during an undone Cup, because a Cup with a finished official game can't be undone. So no "Day 1" is left behind by a Cup that never happened.
  - **Phones:**
    - the host's room menu offers "Back to a casual game night", with a sheet: what comes back, what stays, and that it can be a Family Cup again later;
    - everyone's lobby says "A casual game night again" until the next game starts;
    - the Make-a-Cup sheet's "It can't be undone" became "Changed your mind? Until the first official game finishes, you can go back to a casual game night from the room menu."
  - **Why this line:** until an official game has finished, nothing official exists, so going back loses nothing. After it, going back would turn real Cup results into "just for fun", which D-S121-02 rejected for honesty.
  - **Alternatives rejected:**
    - a time window (say 10 minutes): the honest boundary is "nothing official has happened", not a clock;
    - allowing the undo after official games and discarding their points: that's a score-integrity change and needs the owner's Cup rules.
- **D-S122-02 A gentle Family Cup nudge for the host, after two finished games.**
  - **Who and when:** the host of a casual room, once two games have finished, never while a game is getting ready or playing, and never in a room that has been a Cup (upgraded or undone). Guests never see it.
  - **The card:** "Enjoying tonight? Make it a Family Cup: same room and code, official games over 7 days, with a winner each day." "Make it a Family Cup" opens the existing sheet; "Not now" hides it.
  - **Not now** is remembered per room on this device (the last 20 rooms, in browser storage). If storage fails, the page itself still remembers.
  - **Presentation only:** no server change.
  - **Alternatives rejected:**
    - a nudge after the first game: too early; one game doesn't tell a host the night is going well;
    - showing it to guests: the decision is the host's, and a guest can't act on it.
- **D-S122-03 A short TV address: `/tv`.**
  - **`/tv`:** one big code box and "Show on this TV". It uses the existing spectator flow (no seat, no name, no scores, public feed only).
  - **`/tv?code=ABC123`:** starts watching at once, once per code. Never when this page already has a seat or a spectator token.
  - **Served as an app path**, so a reload or a typed address works. `/tv/x` is not one.
  - **The phone's Invite sheet** adds "On the TV: open <host>/tv and type the code." The TV lobby keeps its QR code for phones.
  - **Alternative rejected:** a separate TV pairing code. It's more state for a step the room code already covers.
- **D-S122-04 A host whose phone is pinned to the Christmas look starts the room with Christmas content. This reverses the reviewed Stage 8.2 rule for that one case, with the owner's agreement.**
  - **The rule:** `POST /rooms` accepts an optional `contentSeason` (`everyday` | `christmas`) for casual rooms. The web app sends `christmas` only when the host's look is pinned to Christmas, not "Match the game".
  - **One time, at creation:** never live. The host can switch to Everyday in the lobby as before. Content is still bound per game at start.
  - **Said on screen:** the Host screen shows "🎄 Your phone shows the Christmas look, so tonight's questions start as Christmas ones. You can switch to Everyday in the lobby."
  - **Unchanged:**
    - a guest's look never changes a room;
    - "Match the game" and Everyday hosts get Everyday;
    - a Cup ignores `contentSeason`;
    - an unknown value is refused (400).
  - **Alternatives rejected:**
    - following the look live: a host changing their phone's look mid-night would change the room's questions without a word;
    - following "Match the game" too: that look follows the room, so it would be circular.
- **D-S122-05 TV copy: "Family Cup", and a † instead of "qualifying" on every row.**
  - **Name:** the TV calls the Cup "Family Cup" everywhere. The format's long name ("Individual Family Cup") stays on the phone's Cup screen.
  - **Eligibility:** a not-yet-eligible player's total carries "†" (read aloud as "not eligible to win yet"). One footnote under the list says "† Not eligible to win yet: too few counted Cup days."

## Stage 12.3: Quick Party inside a Family Cup
**Authorization:** the owner, directly in chat on 2026-11-13 at about 10:40 p.m. ET: "I agree with the suggestions as well please implement, self direct your self do the best you can with good quality". That covers A4 in `docs/stage12/stage121-discussions.md`. Spec: `docs/stage12/stage123.md`. Branch `claude/stage12-3-cup-quick-party`, stacked on Stage 12.2. Nothing is merged or deployed.

- **D-S123-01 A Family Cup has Quick Party, with each lineup game Official or Practice. This amends D-S121-03 ("Cups don't get Quick Party") and Stage 7.1's "casual rooms only".**
  - **The model:** a Cup lineup item may carry `official: true`; absent means Practice. A casual lineup never has it.
  - **The server checks modes on every save and every restore (`partyModesError`):**
    - a casual room can't have an Official item;
    - an Official item must be a game that can count;
    - an Official item needs a planned group of two or more (D1);
    - a casual-only game can't be in a Cup lineup.
  - **On refusal and restore:** a refusal changes nothing; a saved lineup that fails the check is dropped on restore, never half-loaded.
  - **The projection** gives each Cup lineup item `official: true | false`. The casual projection is unchanged.
  - **Phones:**
    - the planner shows an Official/Practice switch per game ("Practice only" for a practice-only game; all Practice for a group of one);
    - the lobby card shows "Today's lineup" with each mode.
  - **The TV:** each mode, and a Cup lobby shows three lineup games and says how many more, so the Cup card isn't cut off. The first local run's screenshot showed the cut-off with six games.
  - **Alternatives rejected:**
    - one switch for the whole lineup: a Cup night mixes counted games with a practice-only favourite;
    - Official decided at start: the family should see before the game whether it counts, which is the reason for the lineup.
- **D-S123-02 The lineup decides a game's mode, and every Cup start rule still applies.**
  - **A press for the other mode starts nothing.** A lineup start carries the mode the host saw; if it isn't the item's, PLAN_CONFLICT, and nothing starts or is marked.
  - **Over HTTP:** `official: true` on a lineup start is accepted only in a Cup.
  - **One path for the rules:** the start goes through `startGame`, so official needs two players, reconnecting players must be named, practice-only games never count, and the Cup's content and briefing apply.
  - **The host's own pick:** switching the up-next mode by hand in the lobby makes Start the host's own pick, which doesn't move the lineup on (Stage 7.2's rule for hand picks).
  - **What's next in a Cup** names the next game and its mode, with no Play again and no break. A Cup without a lineup keeps its results exactly as before.
  - **Alternative rejected:** letting the press choose the mode. It would make the lineup's labels untrustworthy for everyone else.
- **D-S123-03 Cup lineup starts are repeat-safe like a casual room's.**
  - **Each press** carries its own request id and the session revision it was made against: a repeat returns its game, and a press whose briefing was cancelled starts nothing (ATTEMPT_ENDED).
  - **To support this:**
    - a Cup's session revision now moves on with each new game and each cancelled briefing;
    - its remembered presses survive a restart (they were dropped for Cups);
    - the projection shows a Cup's `session`, never with a break.
  - **The Cup's own Start** (not a lineup start) is unchanged and sends no attempt.
- **D-S123-04 A lineup carries across "Make it a Family Cup" and back.**
  - **Upgrade:** games still to play become Official where they can count and the lineup was planned for two or more, matching the up-next rule (D-S121-02). Games already played stay as they were.
  - **Undo:** every mode is removed.
  - **A relabel is a new lineup revision,** so stale drafts and presses are refused rather than misapplied.
  - **The Make-a-Cup and undo sheets** now say the lineup carries over.

## Stage 12.4: the TV's big moments (finish the Cup, end the night, sound, phones step back)
**Authorization:** the owner, directly in chat on 2026-11-13 at about 10:40 p.m. ET: "I agree with the suggestions as well please implement, self direct your self do the best you can with good quality". That covers B1–B4 in `docs/stage12/stage121-discussions.md`. Spec: `docs/stage12/stage124.md`. Branch `claude/stage12-4-tv-moments`, stacked on Stage 12.3. Nothing is merged or deployed.

- **D-S124-01 Finish the Family Cup, with PROVISIONAL rules. Owner sign-off is needed before an official championship uses them (AGENTS.md).**
  - **The rules,** in one constant `CUP_FINISH_RULES` (`provisional-1`) that's recorded with the result:
    - the host finishes the Cup on Day 7, between games;
    - the champion is the eligible player (the server's existing `eligible`: enough counted Cup days) with the highest Cup total above zero;
    - equal top totals share the title; nobody eligible means no champion;
    - afterwards no official game starts (CUP_FINISHED), practice games do, and a lineup's games still to play become Practice.
  - **The record:** `cupFinished` (standings at that moment, champion(s), day, rules version), persisted and public, with one `cup-finished` ledger event. Idempotent.
  - **Where it's said:** the rule is shared code (`src/shared/cupFinish.ts`), so the phone's sheet previews exactly what the server will decide. The sheet, the lobby notice and the TV call the rules a try-out.
  - **Questions for the owner:**
    - must Day 7 have ended first;
    - a tie-break instead of a shared title;
    - a minimum total;
    - can finishing be undone;
    - what the Memory Book records.
  - **Alternatives rejected:**
    - finishing automatically after Day 7: the server has no clock-based day end, and a family should choose the moment;
    - crowning the overall leader regardless of eligibility: that would contradict the Cup's own qualification rule shown all week.
- **D-S124-02 "End the night" for a casual room.**
  - **Who and when:** the host or a cohost, between games, after at least one finished game.
  - **What it does:** records `nightComplete` (persisted, public) and one `night-complete` ledger event. Nothing is scored, deleted or locked. The next game clears it, and the night goes on.
  - **The TV recap:** game count, medal table and games with results. Public facts only, with no Memory Book text: the TV is a public screen and book entries are members-only.
  - **Alternative rejected:** a hard "closed" state that refuses new games. Families keep playing after saying goodnight, and a lock would need an undo.
- **D-S124-03 TV sound, off by default.**
  - **How it plays:** WebAudio chimes, with no files, no downloads and $0. The director's button turns it on, and that press satisfies the browsers' autoplay rule.
  - **Remembered per TV.** Silent while animations are paused. Never on phones.
  - **When:** one fanfare for the day trophy, the champion and the night recap; two soft notes for the final standings of a game this TV watched being played. Once per moment, kept per page so a remount never repeats one, and never a game's chime under a moment.
  - **Alternative rejected:** sound on by default. A TV in a living room shouldn't make noise nobody asked for.
- **D-S124-04 Phones step back when a TV is watching: Math Mayhem in casual rooms only, as a first try.**
  - **On the phone:** with a spectator in the room, the results keep the player's own heading and What's next. The standings, outcome and answers are behind "Show them here too".
  - **Why only Math Mayhem:** the discussion advised trying one game first. A spectator count isn't proof the TV is on screen, so the full result is always one tap away.
  - **Alternative rejected:** hiding the results entirely. A player whose TV is off would be stuck.

## Stage 12.5: Family Questions
**Authorization:** the owner, directly in chat on 2026-11-14: "Definitely add 5 make improvements on it too" (suggestion 5, family-made questions). Spec: `docs/stage12/stage125.md`. Branch `claude/stage12-5-family-questions`, stacked on Stage 12.4. Nothing is merged or deployed.

- **D-S125-01 Family Questions are secret until played.**
  - **What each audience gets:** each player's projection holds only their own questions. Everyone, the TV included, gets counts per writer. The host can't read them either.
  - **The ledger** records a question's kind when it's added and a count when questions are removed, never the words.
  - **Saved with the room** (server-side), and re-checked on load.
  - **Alternative rejected:** a host review queue. It would spoil the host's own game, and the family asked for something everyone plays.
- **D-S125-02 How a game is made and scored.**
  - **Casual only, practice-only, never in Quick Party, never Home's "featured today"** (a newcomer can't play it without written questions; the other games' daily rotation is kept as it was).
  - **Picking:** at least 3 ready questions, at most 10 per game, taking turns between writers in a seeded order.
  - **"Who in the family?"** is used only when its answer is playing, and its choices are this game's players by name.
  - **Answers:** a multiple-choice question's answers are shuffled.
  - **Used up:** played questions are used up; a cancelled briefing frees them.
  - **Scoring:** 100 for a right answer. The writer doesn't answer their own question; they earn 50 when some, but not all, of the others get it right.
  - **Alternatives rejected:**
    - letting writers answer their own question: they know it;
    - a flat bonus per question written: it rewards quantity over a good question;
    - official Cup play: family-written content can't be checked, and Cup scoring changes need the owner.
- **D-S125-03 Moderation without reading.**
  - **Live skip:** the host or a cohost can skip the open question for everyone, with two taps. It's never revealed or scored.
  - **Remove unread:** the host or a cohost can remove every unplayed question one writer wrote, seeing only a name and a count.
  - **Take back:** writers can take back their own unplayed questions.
  - **Alternative rejected:** letting the host read questions to approve them, which breaks D-S125-01.
- **D-S125-04 Limits.**
  - **Sizes:** a question of up to 140 characters; 2 to 4 answers of up to 60, all different.
  - **Volume:** 15 waiting per writer and 60 per room.
  - **Shared check:** the check is one shared function (`src/shared/familyPack.ts`), so the phone says why before sending. The TV layout is checked against the longest question with four answers.

## Stage 12.6: the night card
**Authorization:** the owner, directly in chat on 2026-11-14: "Implement 8 as well" (suggestion 8, a shareable night card). Spec: `docs/stage12/stage126.md`. Branch `claude/stage12-6-night-card`, stacked on Stage 12.5. Nothing is merged or deployed.

**Owner direction recorded at the same time (2026-11-14, about 3:25 a.m. ET):**
- "Don't add item 6": Little-ones mode is dropped.
- "The rest that I mentioned can be added. But we definitely need more games that can be played with teams": Teams (suggestion 7) goes ahead, with more games playable as teams. Planned as Stage 12.7 (night-long teams, and "play as teams" for games with per-player scores) and Stage 12.8 (new games built for teams).

- **D-S126-01 The card is made on the phone from public facts only.**
  - **What it holds:** games, results, the night's medal table, and for a Family Cup its day, standings and champion.
  - **What it never holds:** Memory Book notes, answers, Family Questions, the room code or anything private to one phone.
  - **Why:** the card leaves the room, so it holds only what everyone in it already saw.
  - **Alternatives rejected:**
    - a server-rendered image or hosted share page: it needs hosting, public links and money;
    - including approved Memory Book notes: they're members-only and need their writers' approval to leave the book.
- **D-S126-02 Share where the phone can; Save always.**
  - **Share** uses the Web Share API with the PNG file, so the phone's own sheet is used (WhatsApp, Messages and so on). A closed sheet isn't an error, and a failure points to Save.
  - **Nothing is uploaded.**
- **D-S126-03 A Family Cup's card shows standings, not medals.**
  - Medals are a casual night's story (D-S121-05); the Cup's standings are the real result.
  - The date is the phone's own day.
  - The look changes the title and colours, never a fact.

## Stage 12.7: teams for the night
**Authorization:** the owner, directly in chat on 2026-11-14, about 3:25 a.m. ET: "The rest that I mentioned can be added. But we definitely need more games that can be played with teams" (suggestion 7). Spec: `docs/stage12/stage127.md`. Branch `claude/stage12-7-teams`, stacked on Stage 12.6. Nothing is merged or deployed.

- **D-S127-01 Teams belong to the night, not to a game.**
  - **Who and what:** the host or a cohost of a casual room makes 2–4 teams, balanced in a seeded order. Each has a default name and a colour *and* a shape.
  - **Changing them:** names can be changed; players can be moved (a move against an older view is refused).
  - **Newcomers** join the smallest team.
  - **Public, saved, cleared on request.**
  - **Alternatives rejected:**
    - picking teams per game: slow between games, and families keep the same sides all night;
    - players choosing their own team: uneven teams and arguments; the host can still move anyone.
- **D-S127-02 Team play is the average of the players who took part.**
  - **Which games:** every competitive per-player game, 14 of 17. Not Impostor (side scores), Charades (own teams) or Spectrum (cooperative).
  - **The copy:** a team game copies its teams at its start (only its players), so later moves never change it.
  - **Scoring:** a team's score is the average of its members who took part; ties share a place; everyone keeps their own score.
  - **Pausing:** the host can play individually for a while without losing the teams.
  - **Alternatives rejected:**
    - the sum of scores: the bigger team would always win;
    - counting a player who sat out as 0: one person stepping away would sink their team.
- **D-S127-03 A Family Cup stays individual (a provisional default).** *Answered by the owner on 2026-11-14: team games count in a Family Cup. See D-S1215-01.*
  - Teams can't be made in a Cup room, and Cup scoring is untouched.
  - Team scoring in a Cup is an owner decision (AGENTS.md: material product choices get provisional defaults; owner sign-off before official championship use).

## Stage 12.8: games built for teams
**Authorization:** the owner, directly in chat on 2026-11-14, about 3:25 a.m. ET: "But we definitely need more games that can be played with teams". Spec: `docs/stage12/stage128.md`. Branch `claude/stage12-8-team-games`, stacked on Stage 12.7. Nothing is merged or deployed.

- **D-S128-01 A game built for teams always plays as teams.**
  - **Which teams:** the night's teams when at least two of them have players in the game; otherwise two balanced teams dealt for that game only (seeded). A player not on a team joins the smallest.
  - **Pausing doesn't apply:** "Play the next games individually" is for games that can be played either way.
  - **The copy:** as in 12.7, the game keeps its teams from its start.
  - **Alternatives rejected:**
    - refusing to start without the night's teams: an extra step for a quick game;
    - asking each time which teams to use: one more question between games.
- **D-S128-02 Team Huddle: the team answers together.**
  - **What the phones show:** each player picks, and teammates see each other's picks live. Other teams and the TV only see how many have picked and whether a team agrees, never the option, until the reveal.
  - **The team's answer:** its majority. On a tie, the tied option picked first.
  - **Closing early:** once every player has picked and every team agrees.
  - **Scoring:** 100 for a right answer, plus 25 when the whole team picked it. Every player gets their team's points (team-derived, like Charades).
  - **Questions:** from the Trivia pool, used up the same way.
  - **Where:** casual rooms only and practice-only.
    - Never in Quick Party: it's casual-only, like Jebena Rush and Spectrum.
    - Never Home's "featured today": the daily rotation stays as it was, the same as Family Questions in 12.5.
  - **Agreeing:** a team agrees only when everyone on it has picked (or sat out) the same option.
  - **Alternatives rejected:**
    - a captain who locks the answer: one person decides, and the others watch;
    - the first pick counts: no reason to talk;
    - points per player: back to playing alone.
- **D-S128-03 Charades plays with the teams, with equal turns.**
  - **Teams:** 2–4 (the night's teams, or two dealt). Each team acts as often as the largest team has players, so a smaller team's players act more than once.
  - **Names:** the teams' names on the phones and the TV.
  - **Older games keep working:** a game saved before 12.8 keeps its old turn order and Team A/B.
  - **Alternatives rejected:**
    - one turn per player: a bigger team would get more turns;
    - keeping two teams by join order: it ignores the night's teams.

## Stage 12.9: Relay, a race for teams
**Authorization:** the owner, directly in chat on 2026-11-14, about 3:25 a.m. ET: "we definitely need more games that can be played with teams". Spec: `docs/stage12/stage129.md`. Branch `claude/stage12-9-relay`, stacked on Stage 12.8. Nothing is merged or deployed.

- **D-S129-01 Relay: one runner at a time, the same sums for every team, nobody can stall a team.**
  - **The race:**
    - every team runs the same 12 sums in the same order (seeded, from Math Mayhem's generator);
    - only the runner's phone can answer, and a right answer passes the baton to the next teammate;
    - a team sees only its own current sum; the TV and the other teams see lanes.
  - **Mistakes and absences:**
    - a wrong answer freezes the runner for 3 s (the option is greyed out);
    - 20 s without an answer passes the baton to the next teammate on the same sum.
  - **Places and scoring:**
    - places go by most legs, then the earlier finish;
    - 10 per leg, plus 30, 20 or 10 for the first three teams home;
    - every player scores their team's points;
    - the race ends when every team has finished, or at 4 minutes.
  - **Where:** casual rooms only and practice-only. Never in Quick Party or Home's featured rotation (as Team Huddle).
  - **A module's clocks start with play:** a new optional hook, `onPlayStart`, is called when play begins (after the briefing, or at once). init() never knows when play starts.
  - **Alternatives rejected:**
    - each team its own random sums: one team could get easier legs;
    - showing every team's sum on the TV: a team behind could read ahead;
    - waiting for an absent runner: one dropped phone would stop a team.
- **D-S1210-01 The team kit: one set of rules for the five games built for teams (Stages 12.10–12.14).**
  - **Every team plays at once:** no team waits for another's turn, so a round lasts as long with 4 teams as with 2.
  - **At least 2 players per team:**
    - a night's team with only 1 player in the game joins the game's other teams: that player plays with the smallest one, and the briefing says so;
    - if fewer than two teams of 2 would remain, the game deals two balanced teams for itself;
    - Team Huddle, Charades and Relay (12.8–12.9) keep their rule, because a team of 1 works there.
  - **Fair scoring:** a bigger team never wins just by being bigger. Each game says how: one answer per team per round, or a per-player rate. Everyone scores their team's points.
  - **Catch-up:** a team alone in last place and at least 100 behind the leader gets a small bonus on its next success, never enough to pass a team that keeps scoring.
  - **A scoreboard for 2–4 teams** on every phone and the TV (a row, or a 2 × 2 grid for 4). Each team shows its mark and name, so colour is never the only cue.
  - **No repeats in a night:** a game deals content this room hasn't played yet, then what it played longest ago (`contentIds()` and `avoid`).
  - **Alternatives rejected:**
    - **Turns between teams:** with 4 teams, three wait at a time.
    - **Letting a team of 1 play:** Team Draw would have nobody to guess, and Split Clues nobody to talk to.
    - **Dealing new teams whenever one is short:** that would throw away the night's teams for everyone.
- **D-S1210-02 Split Clues: each teammate holds different clues to one answer.**
  - **Puzzles and clues:**
    - 6 puzzles, each with one answer and six clues; all teams play the same puzzle at once;
    - the clues are dealt round each team, and who holds what rotates every round. In a team of more than 6, some clues are held twice.
  - **Help for every team, from the server's clock:**
    - the answer's shape at 30 s;
    - every clue on every phone at 45 s (this also covers a teammate whose phone dropped);
    - the first letter at 60 s;
    - the round ends at 75 s, or once every team has solved it.
  - **Answering:**
    - anyone on a team may type the team's answer; the matching forgives case, accents, punctuation, an article, a plural and one typo in a long answer;
    - a wrong try shows to the teammates and pauses the team's answer box for 4 s;
    - at most 15 tries per team per round, so a bigger team can't guess its way through.
  - **Points:** 100, 75, 55 and 40 by solve order, and +25 catch-up. No sitting out.
  - **Secrecy:**
    - a phone gets only its own clues until the pooling, then its team's six;
    - a team's wrong tries stay within the team;
    - the TV and other teams see only status until the reveal; future puzzles never leave the server.
  - **Content:** 38 Everyday and 13 Christmas puzzles, original. Christmas puzzles are dealt only in Christmas sessions.
  - **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's featured rotation.
  - **Alternatives rejected:**
    - **Multiple-choice answers:** a team could guess without putting the clues together.
    - **Hiding everyone's clues all round:** a dropped phone would sink its team.
    - **Showing wrong tries to everyone:** other teams could rule answers out for free.
- **D-S1211-01 The drawing games share one pad and one word history.**
  - **The pad:** Draw & Guess's drawing pad (palette, widths, Undo, Clear, batched sending that keeps and resends what didn't arrive) becomes one component, `DrawPad`, with the actions it sends as a parameter. Draw & Guess keeps its actions and test ids.
  - **The history:**
    - Draw & Guess and Team Draw deal from the same word pack, so they share a room's no-repeat history;
    - a module names its pack (`contentPool`), and the room counts every earlier game in the same pool;
    - Draw & Guess lists the words it dealt (swaps included) and deals unplayed words first. With nothing to avoid, its deal is exactly as before.
  - **Alternatives rejected:**
    - **A second copy of the pad in Team Draw:** two copies of the batching and retry logic would drift apart.
    - **A history per game only:** a family could draw "snowman" in Team Draw right after drawing it in Draw & Guess.
- **D-S1211-02 Team Draw: every team draws the same word at once.**
  - **Rounds:** 3–5 (the biggest team's size); each team's drawing order is shuffled once and goes round the team; 75 s each, then a 9 s reveal.
  - **Guessing:**
    - teammates guess from their own team's drawing, once something is drawn;
    - the team kit's forgiving match; the first right guess solves it for the team;
    - a wrong guess shows to the team and pauses the team's guessing for 2 s;
    - at most 15 wrong guesses per team per round. The pause and the limit count per team, so a bigger team can't out-type a smaller one.
  - **The pen:**
    - the drawer may pass it once a round before drawing anything;
    - after 20 s with nothing drawn (since getting the pen or the last stroke), a teammate may take it and carry on the drawing;
    - the pen moves only while someone who hasn't seen the word is left to guess;
    - whoever has held the pen this round can't guess.
  - **Points:** 100, 75, 55 and 40 by the order teams get it, and +25 catch-up. No sitting out.
  - **Secrecy:**
    - the word is on the current drawer's phone only until the reveal;
    - each phone gets its own team's drawing and wrong guesses only;
    - the TV and other teams see each team's status (drawer, strokes, solved and place) until the reveal's gallery;
    - drawings are dropped after their reveal, wrong guesses at the end; future words never leave the server.
  - **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's featured rotation.
  - **Alternatives rejected:**
    - **A different word for each team:** some words are easier to draw, so the race wouldn't be fair.
    - **Showing the teams' drawings live on the TV:** every team draws the same word, so another team's drawing is a free hint.
    - **A new word when the pen moves:** that would break "same word for everyone".
    - **Letting the drawer who passed still guess:** they have seen the word.
- **D-S1212-01 Territory's board: 19 hex cells, homes on spread-out corners.**
  - A hexagon of radius 2 (19 cells) named by row and place (A1–E3, C3 the centre). It's small enough for a phone and gives 2–4 teams room to meet in 8 questions.
  - **Homes:** opposite corners for 2 teams, alternate corners for 3, and two top and two bottom corners for 4. Every home is 2 cells from the centre.
  - **Shared code:** the geometry lives in `src/shared/` so the screens draw exactly the server's board. Each team's cells carry its shape as well as its colour.
  - **Alternatives rejected:**
    - **A square grid:** cells would have unequal neighbours (4 or 8), and teams in corners would be further apart on the diagonals.
    - **A bigger board:** 8 questions couldn't make the teams meet, so steals would never happen.
- **D-S1212-02 Territory: a team quiz that claims a board.**
  - **Questions:** 8 from the Trivia pool. One tap answers for the team; the question closes at 20 s or once every team has answered. Answers are hidden from other teams and the TV until it closes.
  - **Claims:**
    - teams that got it right pick one cell next to their land (an empty one, or a steal; never a home) during a 10 s claim;
    - picks stay hidden until the round ends, then resolve in answer order: a faster team wins a contested cell, and the slower team gets the best free cell next to its land;
    - a right team that doesn't pick gets that cell too.
  - **Catch-up:** one extra cell for a team alone in last place and 30+ behind, when it's right.
  - **Score:** 10 per cell, plus 5 per cell in the biggest joined land. Team-derived. No sitting out.
  - **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's featured rotation.
  - **Alternatives rejected:**
    - **A majority vote within each team (as in Team Huddle):** it can't give a clean "who answered first" for contested cells.
    - **Resolving claims in the order they were tapped:** that rewards fast fingers over right answers.
    - **Showing picks live:** a slower team could change its plan to block a faster one.
    - **Points for right answers as well as cells:** the board would stop mattering.
- **D-S1213-01 Tug of War: everyone pulls at once; a team's pull is per player.**
  - **Bouts:** three of 40 s. Every player answers quick sums on their own phone (the same seeded sums for everyone, a new set each bout).
  - **Answering:** a right answer is one pull; a wrong one freezes you for 2 s and greys that option.
  - **Pull per player:** a team's pull is its right answers ÷ its players in this game, so a bigger team doesn't win by being bigger.
  - **The rope:** a rope for two teams; a knot in a star for three or four. The knot leans toward the strongest pull, and the screen says so in words.
  - **Points:** 100/75/55/40 per bout by pull, with ties sharing the place. Team-derived. No sitting out.
  - **Catch-up:** ×1.2 pull in the next bout for a team alone in last place and 40+ behind. This is the game's own gap: the kit's 100 is out of reach with 2–3 teams, because last place still scores.
  - **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's featured rotation.
  - **Alternatives rejected:**
    - **Total right answers:** the bigger team would almost always win.
    - **Counting only the players who answered:** a team could leave its slowest player out to raise its average.
    - **A penalty pull for wrong answers:** the 2 s freeze already costs time, and negative pulls confuse the rope.
    - **Showing each player's sum on the TV:** it would be unreadable with up to 10 players.
- **D-S1214-01 Know Your Rivals: private answers, team totals, and team guesses about the other teams.**
  - **Rounds:** six light "this or that" questions about yourself (54 original ones, 12 of them for Christmas).
  - **Answer (20 s):** each player answers privately, or says "Rather not say". It closes early once everyone has answered.
  - **Guess (25 s):** each team guesses, for every other team, how many of those who answered picked the first option. Any teammate sets or locks; the phase closes early once every team has locked.
  - **Reveal (8 s):** each team's totals, never who picked what, and every team's guesses and points.
  - **Points:** 30 per rival for the exact number, less the further off, never below 0. Every team guesses every other team, so all have the same number of guesses. Team-derived. No sitting out.
  - **Catch-up:** +15 in a round where it scores, for a team alone in last place and 60+ behind (the game's own gap: a round is worth at most 30 per rival).
  - **Privacy:** your answer is never shown to anyone, not even your team; a team's guesses stay with it until the reveal. In a team of two, a teammate can work out your answer from the total. That limit is why the questions are light and "Rather not say" is always offered, and the briefing promises only that "only each team's totals are ever shown".
  - **Where:** casual rooms only and practice-only, for 4–10 players. Never in Quick Party or Home's featured rotation.
  - **Alternatives rejected:**
    - **Guessing who picked what:** it would make players' answers the point of the game, and no answer would be private.
    - **Guessing only each team's majority:** too coarse, and a tie has no answer.
    - **Guessing your own team too:** you already know part of the answer.
    - **Showing answers as they come in:** later players would feel watched and could follow the crowd.
    - **Requiring three per team for privacy:** the night's teams of two couldn't play it. Light questions, "Rather not say" and an honest briefing are the safeguard instead.

## Stage 12.15: team games in a Family Cup
**Authorization:** the owner, directly in chat on 2026-11-14: "Also this both can be added for casuals and cups" (sent about 1:22 p.m. ET, reached me at 3:57 p.m. ET). The owner's answers at 6:12 p.m. ET were "All 7 team games", and "Yes, count it" (the host picks Official or Practice like any Cup game; Official counts in the Cup standings, every player getting their team's result). Spec: `docs/stage12/stage1215.md`. Branch `claude/stage12-15-team-games-cup`, stacked on Stage 12.14. Nothing is merged or deployed.

- **D-S1215-01 The seven games built for teams count in a Family Cup, under the owner-approved Cup rules.**
  - **Which games:** Team Huddle, Relay, Split Clues, Team Draw, Territory, Tug of War and Know Your Rivals.
    - They play in casual rooms and Family Cups, Official or Practice in a Cup.
    - Still never picked automatically: Quick Party, Shuffle and Home's featured game leave them out.
    - Charades stays practice-only: its scoring isn't redesigned.
  - **How they count:** the owner-approved rules of 2026-11-04 (`docs/CHAMPIONSHIP_RULES.md`), not a new rule.
    - A team game's competitors are its teams: midrank 0–100 by team result, and every member gets the team's placement, whatever the team's size.
    - A day is 75% individual and 25% team (the "Family Cup" format); a day with one kind uses that kind at 100%.
    - The engine used to rank a team game's players, which with uneven teams gave the wrong numbers (75 and 12.5 instead of 100 and 0). The seven games now rank teams. A Charades result recorded before Sprint 3 keeps its old numbers (D-S3-07).
  - **Which Cups:** new Cups use the Family Cup format again.
    - The temporary Individual Family Cup (D-S3-07) existed because no team game could count fairly.
    - A Cup already created as an Individual Family Cup keeps its format (a Cup's rules never change). There, team games play as practice, with the reason given (start and lineup are refused as Official).
  - **Teams in a Cup:** the host can make the night's teams in a Cup room, and a casual room made into a Cup keeps them.
    - In a Cup, only the games built for teams use them.
    - "Play as teams" for per-player games stays a casual-room feature: team scoring for those games in a Cup wasn't asked about.
  - **Screens:**
    - the server sends each official game's placements (`cupPlacement`), and the Cup screen shows those;
    - results say Official/Practice/Casual correctly, and their one-line comment is about the teams;
    - TV medals in a game built for teams go by team place (a display fault since 12.8: a second team with a winning team of 2+ ahead got no medal).
  - **Alternatives rejected:**
    - **Counting a team game like an individual game** (each player ranked by their team-derived score, inside the individual average): it contradicts the approved rule (teams are the competitors; team games are the 25% share), and with uneven teams the ranks depend on team size.
    - **A new format for "individual + team games at equal weight":** the owner already approved 75/25, and inventing a weighting would be a new scoring rule without approval.
    - **Converting existing Individual Family Cups to the new format:** a Cup's rules never change while it runs (D-S3-07).
    - **"Play as teams" for every game in a Cup:** not asked for, and it would change how individual games count.


## Stage 12.15-R: repairs from review 6888718011
**Authorization:** the owner's review and handoff on #39, comment 6888718011 (2026-11-14, about 10:43 p.m. ET; D-WF-01). Spec: `docs/stage12/stage1215r.md`. Branch `claude/stage12-15r-team-game-repairs`, PR #40, stacked on #39. Nothing is merged or deployed.

- **D-S1215R-01 Relay: a runner's chances are their own turns.**
  - **The rule:** each time the baton reaches a runner is a turn.
    - `of`: their turns that ended (a right answer, or their 20 s ran out). A turn still open at the game's end counts only if they answered in it.
    - `done`: the turns they answered in, right or wrong.
    - `actions`: every answer, wrong ones included (the qualification contract's "answers … wrong ones included").
  - **What it fixes:** a fully active team of 3 or more failed Cup qualification. Each runner was counted against all 12 legs: 4/12, under half. An idle runner's turns run out and count against them alone.
  - **Unchanged:** each Cup's stored policy. A Relay saved before this has no turn record and keeps its old count; Relay was casual-only before the unmerged Stage 12.15, so no official Relay result exists.
  - **Limit:** in a team of 7 or more, a runner can get a single turn (12 legs), below the policy's 2-action minimum. Teams of 2–6 can always reach it.
  - **Alternatives rejected:**
    - **The team's legs as `done` for every runner:** credits idle runners for teammates' legs.
    - **Lowering the minimum for Relay:** changes the Cup's stored policy, which isn't this repair's to change.
- **D-S1215R-02 Know Your Rivals: guessing is mutual.**
  - **The rule:** in a round, the teams where at least one player answered guess each other, and only each other. A team where everyone said "Rather not say" neither guesses nor is guessed; fewer than two such teams means no guessing, straight to the reveal.
  - **The opt-out:** unconditional and never pressed for. It still counts as an action for qualification.
  - **Feedback:** neutral, on the phones, the TV and the reveal ("… said "Rather not say" this time, so there were no guesses for or about that team"), plus one line in the briefing.
  - **What follows:** with three or more teams, the others still score on each other that round.
  - **Alternatives rejected:**
    - **Scoring nothing for anyone in a round where any team opted out:** one team could cancel everyone's round.
    - **Making up a count for the team that opted out:** an invented answer.
    - **Pressing players to answer:** against the unconditional opt-out.
- **D-S1215R-03 Relay's places are its result everywhere.**
  - **The ranking:** legs, then the time of the last completed leg (`lastLegAt`, recorded for every leg). Equal legs at the same instant, or no legs, share a place.
  - **One ranking everywhere:** the room records the places at the finish (`outcome.teamPlaces`). Team results, medals, the results heading and comment, and the Cup's team placement follow them.
  - **Unchanged:** points; no bonus is added. Equal points with different places can happen only for unfinished teams with equal legs, and the results say so.
  - **Other team games:** still placed by score. A game recorded without places, or with a damaged record, is placed by score as before.
  - **Alternative rejected:** a hidden tiebreak bonus point, which would invent scoring.
- **D-S1215R-04 One clock for Relay's freeze.**
  - **The predicate:** the TV's lanes and the runner's phone use the same test (`now < frozenUntil`).
  - **The tick:** the freeze's end is a module due time, so the room ticks then and clears it. The TV stops showing "(frozen)" without waiting for another answer.
- **Also repaired (no new rule):**
  - **Family Questions:** a skipped question is never described again in any view (R3).
  - **Recaps:** the lobby's last game, the TV's recaps and the night card take a team game's line from its team results (R6).
- **D-S1215R-05 (review 6889824884) Plain facts, never an attributed reason or an unrelated winner.**
  - **Know Your Rivals:** a team that sat a round's guessing out is described as "Nobody on … picked either answer". The records can't always say why (an idle team and a team that opted out look the same in older results), and naming a choice nobody made would be false.
  - **Relay's tiebreak comment:** it speaks only of the winner's own tie on points, and names the team it's level with.
  - **Alternatives rejected:**
    - **Separate wording for "everyone said Rather not say":** needs each team's size on every screen, and would single out a privacy choice.
    - **A comment for any tie lower down:** the lanes' line already explains it from the tied lanes.
- **D-S1215R-06 (review 6890761957) One source for places and for a game's mode.**
  - **The TV's final standings:** for a game built for teams, each player is listed at their team's place from the server's team results (never re-ranked from points), with the team named. Individual games and per-player games played "as teams" keep ranking by points, because their players' own points are real.
  - **The Casual / Practice / Official label:** wherever a finished game is labelled (the lobby's "Last game", the results comment, the results screens), the label is the game's mode as it was played, from `casualGameIds`. It is never the room's current kind.
  - **Which results screen:** a casual game's results stay the casual results screen after the room becomes a Cup (they turned into the old screen's "Practice game"). What's next on that screen still follows the room as it is now.
  - **Alternative rejected:** storing a mode on each game (a data migration for a display label the server already derives).

## Stage 12.16: Split Clues content readiness
**Authorization:** the owner's review and handoff on #40, comment 6892660460 (2026-11-15, 4:58 a.m. ET; D-WF-01). Spec: `docs/stage12/stage1216.md`. Inventory: `docs/stage12/stage1216-split-clues-inventory.md`. Branch `claude/stage12-16-split-clues-content`, PR #41, stacked on #40. Nothing is merged or deployed, and no puzzle is approved.

- **D-S1216-01 Split Clues' puzzles are library content, reviewed like any other.**
  - **The move:** the 51 puzzles left the TypeScript bank (`src/games/modules/packs/split-clues.ts`, deleted) for two JSON packs, `content/packs/split-clues-everyday.json` (38) and `split-clues-christmas.json` (13), generated from the bank. A test pins every id, kind, answer, alternative, clue and season to the bank's own fingerprint.
  - **The schema:** the shared item fields plus `kind`, `answer`, `alts` (1–8) and exactly six `clues`. Lint refuses a clue containing the answer or an alternative and two identical clues; it warns on a clue over 60 characters.
  - **Review status:** every puzzle ships `provisional` with `eligibility: "official"`, so it is practice-only until a person approves its exact hash (`content/approvals.json`, written by `npm run content:approve`). Missing, stale (edited since approval) and rejected approvals are never treated as approved. Authorship, tests, the handoff and the test mode are not editorial approval.
  - **The placeholders:** `difficulty` 2 and `category` from the kind, because the bank had neither. Official selection balances difficulty, so that balancing does nothing for Split Clues until an editor sets real values (flagged in the inventory).
  - **The module:** it no longer reads a bank. The room's content selection chooses the six puzzles and hands them to `init` (as Team Huddle's questions are), and `init` refuses fewer than six. `SplitPuzzle` is declared in `src/games/modules/types.ts`, so the web app's imports never reach a content bank (`tests/stage91-bank-privacy.test.ts`).
  - **Alternative rejected:** keeping the TypeScript bank with a review flag beside it. That would be a second approval system with no hash binding.
- **D-S1216-02 In a Family Cup, Split Clues deals year-round puzzles only, in every mode.**
  - **Why:** a Cup's games keep their full content and have no session season (Stage 8.2), so Christmas puzzles would otherwise mix into a Cup by chance. Before this stage the Cup dealt from the Everyday bank only; this keeps that.
  - **What follows:** an Official Split Clues game in a Cup needs six approved year-round puzzles it hasn't used; approved Christmas puzzles never count there. Casual and solo rooms are unchanged: Everyday sessions get Everyday puzzles, Christmas sessions get their Christmas puzzles first.
  - **Alternative rejected:** dealing Christmas puzzles in December Cups. That is a product choice for the owner, not a repair.
- **D-S1216-03 Puzzles dealt before this stage still count as used.**
  - **The rule:** Split Clues games before Stage 12.16 dealt from the bank and left no usage records. Their dealt ids (the module's `contentIds`) are merged into the usage this selection reads, as practice uses at sequence 0. This is derived on each selection; saved rooms are never rewritten.
  - **What it protects:** no-repeat in a night, and a Cup never deals as Official a puzzle it already showed (practice included).
  - **Alternative rejected:** a data migration writing usage into saved rooms (a write to every room for something derivable).
- **D-S1216-04 The Official gate is the server's, and the lobby shows it.**
  - **The server:** an Official Split Clues start without six eligible unused puzzles is refused with HTTP 409 (`CONTENT_EXHAUSTED`) and a plain reason. Nothing is created; no provisional puzzle is substituted; the game is never shortened or switched to Practice.
  - **The projection:** a Cup's projection carries `officialContent["split-clues"]` (`available`, `needed`, `message`): counts and the reason only, never a puzzle. It is the same selection the start runs, as a dry run that records nothing.
  - **The lobby:** Official is disabled for Split Clues with the reason under the choice ("Practice only: …"), the Up next card says "Practice only", and Start becomes "Start Split Clues · Practice". The host can still change the game.
  - **The shared plan (Up next):** the host's plan is stored as chosen, but every projection shows a plan for Official Split Clues as Practice while the Cup can't play it Official (for example after an Official game used the last approved puzzles). So the TV never announces "Split Clues · Official" when the lobby says Practice only.
  - **Freezing:** the six puzzles are chosen at the start and frozen at the briefing (id, pack, version, hash). Play re-checks them; a puzzle changed in between ends the briefing ("content-changed"), and usage is recorded when play begins. Reloads, reconnects and later edits never alter a game in progress.
  - **Alternative rejected:** a client-only gate. A forged request would bypass it; the driver forges one and gets the 409.

## Stage 12.16-R: repairs from review 6895557386
**Authorization:** the owner's review on #41, comment 6895557386 (2026-11-15, 9:04 a.m. ET; D-WF-01). Spec: `docs/stage12/stage1216r.md`. Same branch and PR (#41), stacked on #40. Nothing is merged or deployed, and no puzzle is approved.

- **D-S1216R-01 For Split Clues, only an approval record approves.**
  - **The rule:** a Split Clues puzzle is approved only by a record in `content/approvals.json` at its exact current content hash. That is a person's record (`npm run content:approve`), or in the test-only mode the record it makes, labelled "TEST MODE (not a human review)" and refused in production.
  - **Raw labels:** a raw pack label (`approved`, `legacy`, `verified-computed`) approves nothing. The loader reports it (`npm run content:check` fails) and treats the puzzle as provisional, so Practice still uses it.
  - **Stale, missing and rejected:** a stale record (the puzzle edited since) or a missing one approves nothing, and `rejected` stays rejected even with a matching record.
  - **Where it is enforced:** `officialEligible` also checks the record, not only the status. Selection, the lobby's `officialContent`, the shared plan, the server's start and the briefing-to-play re-check all go through it, so they agree.
  - **Scope:** `RECORD_ONLY_APPROVAL` in `src/content/registry.ts` holds `split-clues` only. Other games keep their established label rules: legacy items carried over from before approvals, and computed answers (`verified-computed`).
  - **Alternatives rejected:**
    - **Dropping legacy and computed statuses everywhere:** it changes other games' established policy, which this repair isn't for.
    - **Refusing to load a Split Clues item with an official-capable label:** it would silently shrink the Practice pool. Reporting the label and demoting the item keeps Practice and fails the content check.

## Beta R1: readiness and a portable production package
**Authorization:** the owner's priority update on #42, comment 6896572377 (2026-11-15, 10:05 a.m. ET; D-WF-01): deployment only conditionally, after readiness clearance, at $0. Plan: `docs/beta/beta-r1.md`. Matrix: `docs/beta/beta-r1-blockers.md`. Architecture: `docs/beta/beta-r1-architecture.md`. Process: `docs/beta/beta-r1-release.md`. Branch `claude/beta-r1-readiness`, stacked on #41's `1955c28`. Nothing is merged, deployed or provisioned; no host is chosen; no approval is manufactured.

- **D-BR1-01 One package, built once from the cleared SHA, on plain node.**
  - **What it is:** `scripts/release/pack.mjs` compiles `src/` only (`tsconfig.build.json`), builds the web app, and copies `content/` (without the editorial pilot batches) and the package files. It writes `release.json` with the revision, and refuses a dirty tree or an output folder inside the repository.
  - **Install and start:** `npm ci --omit=dev` installs `ws` and `zod` only. Every build tool moved to `devDependencies`, with no version change. `npm start` runs `node dist/server/serve.js`.
  - **Promotion:** the host gets the same tarball, by its recorded hash, and never rebuilds: builds aren't byte-for-byte reproducible, because the build time is recorded.
  - **Alternatives rejected:**
    - **`tsx` in production:** a development dependency, with the TypeScript toolchain on the host.
    - **A container image:** it needs a registry, which depends on the host, and the host is ChatGPT's choice. The package fits in an image later unchanged.
- **D-BR1-02 The family's data lives outside the release, written by one process.**
  - **The data directory:** production refuses a missing, relative or inside-the-release `MCHEZO_DATA_DIR`.
  - **The lock:** `server.lock` holds the owner's pid. A second live server is refused. A stale lock is taken over: a dead pid, an unreadable file, or this very pid (pid 1 in a container on every start).
  - **B-08, found by the release drill:** the lock creates the directory first, private (0700), so a fresh host's first start works.
  - **Not protected:** two hosts sharing a network volume, which is unsupported.
  - **Alternatives rejected:**
    - **`flock`:** needs a native addon in Node.
    - **No lock:** a double start silently overwrites rooms that the other process holds in memory.
- **D-BR1-03 A private-beta gate in the server, covering HTTP and WebSocket (provisional default).**
  - **How it works:**
    - One shared code from the environment, at least 12 characters, required in production unless `MCHEZO_PUBLIC_ACCESS=open` is set on purpose.
    - The right code sets a 30-day cookie that holds an HMAC of the code: HttpOnly, SameSite=Lax, and Secure over HTTPS.
    - Every page, API call and WebSocket handshake needs the cookie; only `/health` and the gate are open.
    - Wrong codes are limited to 10 per address per 15 minutes.
    - Changing the code signs every device out.
  - **Provisional:** who may enter the beta, and how, is the owner's choice; the single shared code is a provisional default.
  - **Alternatives rejected:**
    - **Basic auth at the proxy:** proxy-specific, poorly handled by installed web apps and WebSocket handshakes on phones, and untested here.
    - **Personal accounts:** a product change outside this slice.
- **D-BR1-04 Request and socket hardening from the matrix:**
  - **B-01:** WebSocket messages are capped at 64 KiB, like HTTP bodies.
  - **B-06:** every server socket has an `error` listener, so one malformed frame closes that socket, never the process. This was the most serious finding, reproduced on `1955c28`.
  - **B-02:** security headers on every response.
  - **B-03:** a foreign `Origin` gets 403 when `MCHEZO_PUBLIC_ORIGIN` is set (required in production).
  - **B-05:** behind `MCHEZO_TRUST_PROXY` hops, the client address is the entry our proxy appended.
  - **B-07:** production with a trusted proxy requires `MCHEZO_LISTEN_HOST`, so nothing reaches the server around the proxy.
  - **Defaults:** every setting is off by default, so local play, tests and browser checks are unchanged.
- **D-BR1-05 zod 3's advisory is an accepted, bounded risk for the gated beta.**
  - **The advisory:** GHSA-mrhx-c7xc-m3w5 (high), which affects every version below 4.6.6; only the major upgrade fixes it.
  - **The bound:** with every body and message capped at 64 KiB, the measured worst case is +10 to 12 MB of heap and about 50 to 60 ms per request.
  - **To remove it:** a separate zod 4 migration with its own full gate.
  - **Alternative rejected:** migrating here. It touches every schema, in a readiness slice whose point is a small, reviewable change.
  - **Revised by D-BR1R-07 (review 6903002137):** this measured a schema no route uses. The real exposure was reachable by any seat holder, and is now mitigated; the migration is still the way to remove the advisory.
- **D-BR1-06 The family's data is kept safe by hand, and nothing deletes it.**
  - **The tool:** `datatool` (compiled into the package) has backup, verify, restore and prune.
  - **Backup:** made into a new private folder with a SHA-256 manifest; refused while a server runs, unless asked.
  - **Restore:** verifies everything first, and only into an empty folder; it never overwrites.
  - **Prune:** a dry run unless `--apply`, at least 7 days, never while a server runs. It moves rooms into `data/archive/`, never deletes.
  - **Provisional:** the runbook's 60 days and 14 backups are provisional defaults for the owner to set.
  - **Alternative rejected:** automatic retention in the server. The brief asks for bounded retention without deleting owner data, and a person deciding is the safe reading.
- **D-BR1-07 No host is chosen here.**
  - **What the app needs:** one always-on Node 22 process, a persistent disk, WebSockets, HTTPS and a stable name.
  - **What is written:** the host options found at $0, with their account requirements (some need a card or a domain), are listed for ChatGPT's selection. They come from search results, because the providers' pages weren't reachable from this session.
  - **Not done:** no account, trial, card, domain or public port was created or requested.

## Beta R1-R (review 6900450343, R1 and R2; docs/beta/beta-r1-repair.md)
- **D-BR1R-01 The data folder's exclusion is held by the kernel for the process's life.**
  - **The mechanism:** an exclusive Linux abstract Unix socket named after the folder's device and inode. Its bind is the one atomic step that decides the holder, and the kernel releases it when the process ends, however it ends.
  - **`server.lock`:** a record only, written by the holder.
  - **Who holds it:** the server, a backup without a running server, `prune --apply`, `check`, and a restore (on its new folder), each for its whole run.
  - **Scope:** one Linux host, one network namespace. Production refuses to start off Linux. Off Linux (a developer's computer) only the record is checked, best effort, with a printed note.
  - **Unchanged:** the data format.
  - **Alternatives rejected:**
    - **`flock`:** not in Node, and a native module or a helper process would add a dependency or a second lifetime.
    - **A link-created lock file with a recovery guard:** it fails closed, but a crash inside recovery needs a person, and pid reuse can block a start.
- **D-BR1R-02 A restore is handed to the service user on purpose, and checked as that user.**
  - **`restore --owner <user>`:** it chowns only what it created, keeping 0700 and 0600, while it still holds the folder.
  - **`check`:** run as the service user before a server uses the folder.
  - **The server:** it refuses a folder it can't fully read and write before loading anything.
  - **Copies:** the tools write their own copies, so a copy belongs to whoever ran the tool (root's backups are root's).
  - **Alternative rejected:** restoring as the service user from a staging copy. It needs a second, readable copy of the family's data, and the service could then alter backups.
- **D-BR1R-03 The example unit sets `UMask=0077`.**
  - **Why:** the server writes its files with the process umask. The 0700 folder already keeps them private, and the umask makes the files themselves 0600 too.
  - **`check`:** it requires the folders to be private and every entry to belong to the service user; it doesn't require 0600 on files the server wrote.
- **D-BR1R-04 The gate pages use `Referrer-Policy: same-origin`; everything else keeps `no-referrer`** (B-13, review 6901841738 R4).
  - **Why:** under `no-referrer` a browser posts a form with `Origin: null`, which the origin check refuses. With `same-origin`, the same-origin code form carries its own origin, and no referrer ever reaches another site.
  - **Unchanged:** the origin check. `null` and other origins stay refused.
  - **Alternatives rejected:**
    - **Accepting `Origin: null` on the code form:** it weakens the check the review asked to keep.
    - **Using `Sec-Fetch-Site` instead:** older Safari doesn't send it.
- **D-BR1R-05 A production-origin check runs in every gate** (`scripts/check-beta-gate-https.mjs`).
  - **What it does:** the packed release behind a local TLS proxy that keeps `Host` and `Origin` (like the example Caddy), at `https://beta.test:<port>`, driven by Chromium. Foreign origins are checked at the protocol level.
  - **Isolation:** it is private, $0 and on this machine only. The browser gets no outbound proxy settings, and the certificate is made for the run.
- **D-BR1R-06 The lock race test speaks an explicit protocol.**
  - **Holders only:** END goes only to a confirmed, live holder.
  - **Explicit failures:** an unexpected exit, a missing READY or answer, an ERROR, a non-zero exit, a timeout or any pipe error fails the test with what each contender printed. Nothing counts as a refusal unless the contender said REFUSED.
- **D-BR1R-07 A network-facing array checks its length before zod reads any element** (B-14, D-2, review 6903002137).
  - **What:** `boundedArray(element, max, min?)` (`src/server/boundedArray.ts`) is `z.unknown()` with a fatal `too_big` check on an over-long array, piped into the same `z.array(element).min(min).max(max)` as before. zod 3's pipeline doesn't run the second step when the first fails, so no element is read. Family Questions `options` and the lineup's `items` use it.
  - **Why:** zod 3 walks every element and records an issue for each bad one before `.max()` applies, and it has no fix. At the 64 KiB cap that was about 32,700 issues, about 14 MB of live heap and 50–90 ms per request, from any seat holder.
  - **Unchanged:** what passes, what it parses to, which requests are refused and the 400 they get (8,000 generated bodies against the previous schemas; the routes through the server).
  - **Alternatives rejected:**
    - **zod 4 now:** the supported fix, but a major migration across every schema. The review asked for no unrelated migration, so it stays a separate slice.
    - **A length check in each route before `safeParse`:** it does the same, but it lives outside the schema, where a new route could forget it.
    - **A smaller body cap:** it bounds the cost but doesn't remove the mechanism, and at 64 KiB the cap alone allowed the crash above.
- **D-BR1R-08 A test fails if a network-facing schema gains a collection zod would walk in full.**
  - **What:** `tests/beta-r1r-zod.test.ts` walks every static schema on `LocalServer` and `IntentSchema`, and fails on:
    - a plain `z.array`;
    - a set, map, tuple, intersection or recursive schema;
    - a record whose keys or values can fail.
  - **The inventory:** it also pins the current list of collections, so a new one has to be reviewed.
  - **Why:** the exposure came from two ordinary-looking schemas, and the next one would look ordinary too.
- **D-BR1R-09 The audit preview's route: configure the forwarder's rewrite of the app's own origin, only after a probe shows nothing else is rewritten to it** (handoff 6903638660; `docs/beta/beta-r1-preview-route.md`).
  - **What:** the packed candidate runs with `MCHEZO_PUBLIC_ORIGIN` set to the exact value GitHub's forwarder gives the app's own requests (e.g. `https://localhost:3153`). No product source changes.
  - **The precondition:** `scripts/preview/probe-forwarded-origin.mjs` must report `REWRITTEN_SAME_ORIGIN_ONLY` (or `PRESERVED`) in that Codespace, at the start of each audit session. Under `UNSAFE` or `INCONSISTENT`, the route is not used.
  - **Why:** every `*.app.github.dev` URL is the same site, so `SameSite=Lax` doesn't separate them. The exact-origin check is the only defense, and it stays meaningful only if foreign Origins reach the app as themselves.
  - **Alternatives rejected:**
    - **A preview-only adapter trusting `X-Forwarded-Host` or `Sec-Fetch-Site`:** the first is on every request; the second is absent on WebSocket handshakes in Chromium.
    - **Allowing localhost origins broadly, or replacing Origin blindly:** it would accept the sibling-origin attack shown in S2.
    - **`gh codespace ports forward`:** it forwards to the machine running `gh`, not the reviewer's cloud browser.
  - **The fallback:** route B, a browser inside the Codespace with only its display forwarded. Proposed, not tested here.
- **D-BR1R-10 The preview probe counts only positive, attributed evidence** (review 6903845075; revises D-BR1R-09's precondition).
  - **What it needs to pass:**
    - the target's own fetch POST, form POST and WebSocket, each observed with a valid https Origin, all the same value;
    - **and**, for each transport, a comparison request observed carrying the comparison page's own origin.
  - **Refusals:** a comparison request with no Origin or the own value (`UNSAFE`); own values that differ (`INCONSISTENT`); an own Origin that is missing, invalid or not https (`UNSUITABLE`).
  - **`INCOMPLETE`:** anything missing or unattributed.
  - **What it is not:** the page's completion marker is a hint only. A request that didn't arrive proves nothing.
  - **What a pass is:** evidence for review, covering only the traffic observed. The audit stays on hold until a route has been validated in the Codespace with the original protections intact.
  - **The fallback:** route B keeps the browser's own Origin, and TLS validation through a session CA trusted only in that browser's NSS database. Its browser half is tested here; the remote desktop needs authorization first.
- **D-BR1R-11 The audit browser keeps an OS sandbox; where Chromium can't have one, the choice is the owner's** (handoff 6904212784).
  - **The correction:** my route-B browser-half test (D-BR1R-10), like every gate driver, ran Chromium **without** its OS sandbox: Playwright's `--no-sandbox` default, run as root. It tested TLS validation and Origin, not the browser sandbox.
  - **Measured:** Chromium sandboxes only with unprivileged user namespaces, or with a setuid helper that has `CAP_SYS_ADMIN`. With user namespaces denied it fails exactly as in the Codespace. There is no seccomp-only mode, and `--no-sandbox` is excluded.
  - **The options** (`docs/beta/beta-r1-preview-route.md`):
    1. Firefox ESR, whose seccomp-BPF content sandbox remains without user namespaces. Reduced, no rebuild, sourced but not tested here.
    2. Chromium's full sandbox once the owner approves a container change that permits user namespaces, plus a rebuild.
    3. The owner's own computer and browser.
  - **The first step:** read-only diagnostics in the Codespace decide which applies.
  - **Alternative rejected:** `--no-sandbox`, a privileged container, or `CAP_SYS_ADMIN` without owner approval.
- **D-BR1R-12 After a locked answer, carrying on comes first; after the last one there is nothing to continue** (review 6904986723, R5; B-15).
  - **The finding:** in Casual Trivia the locked-answer screen put "Waiting for everyone" and the tall ring before Next question. At 320×480 the enabled control sat below the first screen (705–761 px), and the lower seat's name label lay on the paragraph under the ring at every size. That told a player to wait when each player goes at their own pace against one deadline.
  - **The decision:** one shared locked-answer view, `apps/web/src/components/mchezo/LockedAnswer.tsx`, for Trivia, Geography and Math Mayhem, which all had a copy of the same branch. Its order:
    1. a compact confirmation card ("Question N of M · your answer", LOCKED IN);
    2. a game's own note (Math Mayhem's answer time);
    3. "Keep going — you don't need to wait for anyone. N questions left.", the enabled **Next question** and the game's time left;
    4. then "How the room is doing": the same counts-only ring, set apart below.
  - **The last answer:** the screen is labelled "All your answers are in". It keeps the card and the room's wait, with no continuation control. The old enabled "Waiting for the game to finish" keycap is gone; after a reload the existing "All your answers are in" view shows, as before.
  - **The shared ring:** `.mz-wait` keeps 46 px under itself for the bottom seat's token and label. Every caller gets the same room.
  - **Unchanged:** the server's deadline, scoring, answer immutability, counts-only progress, private projections and the post-finish reveal. Nothing auto-advances. The next question, and Math Mayhem's per-question timing, still opens only through each game's existing open flow after Next question (checked in the browser, visibility guard included).
  - **Shared rendering only** (scope answer 6905044291): each game keeps its submission, lock, progression and results, and passes its own parts in:
    - **Math:** its answer-time line, its solo mode and its `mz-math-next` test id;
    - **Trivia:** its TV shortcut.
    Solo Math's last answer now reads "All your answers are in." in place of the old keycap; the solo flow is otherwise unchanged.
  - **The drivers:** the shared answer helper and four drivers stop expecting the old keycap. A locked view without Next question now fails loudly instead of being clicked through.
  - **No new colour on Everyday** (full gate `20261116-025903-c955613d-17498`, W8). The first version gave Next question the orange brand keycap and a divider line above the room's progress. Those were the screen's only two new styles. They are back to the screen's own neutral keycap, and spacing alone sets the room apart.
  - **W8_INTENDED** in `check-warm-ivory.mjs` lists the locked screen's re-keyed elements (it gained test ids). Under the guard's rule, each must still reuse a style the base screen had: 44 such changes, 0 new styles, 0 missing.
  - **Alternatives rejected:**
    - A sticky Next question over the old layout: it still says to wait, and it covers content at enlarged text.
    - Re-recording the Everyday baseline: it would accept the two new styles without a review. Keeping the screen's own styles keeps W8's promise.
    - Auto-advancing: excluded by the review.
    - Fixing Trivia alone: it would leave the same defect in Geography and Math Mayhem.

## Beta R2: release preflight (handoff 6908014247; docs and evidence only)

- **D-BR2-01 The promotion artifact is the audited archive, identified by its own hash; a reviewer checks its contents against a recorded file inventory** (`docs/beta/release-7097ac2.md`).
  - **The problem:** the audited archive sits in the private review Codespace, which this session can't reach. `pack.mjs` writes the build time into `release.json`, and `tar` the files' times, so no rebuild can reproduce the archive's hash.
  - **The decision:**
    - **Recorded:** the runtime SHA `7097ac2`, Node v22.16.0, and a 144-file inventory of every package file except `release.json`. The inventory's digest is `fe6d74f8…a61c`, the same in three builds from fresh clones under two Node 22 versions.
    - **Left blank:** the audited archive's SHA-256, for its holder to recompute.
    - **On the host:** the host gets that archive, checked by its hash, and the unpacked release is checked against the inventory before `current` is switched.
  - **If the archive is lost:** a rebuild is recorded as a different file, with its own hash. Whether a matching inventory is enough, or a short private re-check is needed, is the owner's call.
  - **Alternatives rejected:**
    - Recording my rebuild's hash as the release: it isn't the audited file.
    - Making the build reproducible byte for byte: that changes `pack.mjs`, a runtime-release change outside this docs-only slice.
- **D-BR2-02 Host comparison: only already-authorized or owner-provided $0 routes, on official sources, with a provisional recommendation** (the runbook's "Preflight").
  - **The options:**
    - **H1:** LAN only, with a domain the owner already has and a DNS-challenge certificate;
    - **H2:** a Cloudflare named Tunnel, with a domain already on Cloudflare;
    - **H3:** Tailscale Funnel;
    - **H4:** a $0 VM the owner already has.
    Each is compared on compute, TLS and WebSockets, participant access, who is in the path, disk and backups, the proxy count, quotas and billing, and the owner-dependent facts.
  - **The sources:** facts are stated only from the providers' official documentation sources, read at pinned commits, or from Tailscale's own code. The pages unreachable from this session (Tailscale's site, Oracle, Google Cloud, AWS) become "to confirm" rows, not facts.
  - **The recommendation:** it depends on two owner facts, an always-on Linux machine and a domain already owned:
    - **H1** when everyone plays at home;
    - **H2** with a Cloudflare domain and remote players, accepting that Cloudflare sees the decrypted traffic;
    - **H3** with no domain, once Tailscale's terms and WebSocket behaviour are confirmed.
  - **Who decides:** ChatGPT reviews this with the owner. Execution needs the owner's explicit approval.
  - **Alternatives rejected:**
    - Keeping R1's search-result table as the basis: the handoff asks for official terms.
    - Asking for this session's network to be widened to reach the blocked sites: an approval request for a fact the owner or ChatGPT can confirm from a normal browser.
- **D-BR2-03 The proxy count is measured, not assumed.** The runbook's step sends a fake `X-Forwarded-For` through the real route to `nc`, and sets `MCHEZO_TRUST_PROXY` to the number of entries the route itself wrote, when the first of them is the client's real address.
  - **The evidence:** Caddy 2.6.2 was checked here. It drops a client-sent value and writes the connecting address.
  - **When that can't be shown:** the setting stays unset, which is safe: the per-device limits then count everyone together.
- **D-BR2-04 Two doc defects found by the drill are corrected.**
  - **The restore line:** an empty first install prints no `[restore]` line (the server prints it only when a room loaded or failed). The runbook had promised `0 room(s) restored`.
  - **The settings file's mode:** the architecture page said 0600 root-only, against the runbook's 0640 root:`cgn`. It now states the runbook's mode, the one the drill ran.
  - **No code changed:** both are documentation corrections.
- **D-BR2-05 Beta launch checks are written for real phones and the host, with a go/no-go record**:
  - `docs/REAL_DEVICE_TESTING.md` §7;
  - `docs/device-testing/BETA_GO_NO_GO_TEMPLATE.md`.

  **What they cover:**
  - **The phones:** an iPhone with Safari and an Android phone with Chrome against the exact package through the real HTTPS address. That means the gate, invite by QR, manual join, the TV, reconnects, small-screen lock and continue, TV privacy through a rematch, and a reload.
  - **The host:** the revision, a restart with persistence, an independent backup, an isolated restore, the first-install stop, and no route around the proxy.
  - **Who does each pending check:** each is paired with its evidence and the person who can do it. Claude can't run them.
  - **The catalog:** the playable catalog is unchanged.
- **D-BR2-06 The rehearsal script refuses before it can clean up, and cleans up only what it created** (review 6908455526).
  - **The defect:** the first `preflight-drill.sh` installed its EXIT trap before the `cgn` check, so a refusal would delete an existing `cgn` user and group. Reproduced with logging stubs in `repro-v1-unsafe-cleanup.log`.
  - **What it didn't harm:** in runs 1–4 no `cgn` existed beforehand on this machine.
  - **The fix:**
    - the user, group and prefix refusals come first, with no trap;
    - ownership is recorded per resource, including after a partial `useradd` failure;
    - cleanup is limited to owned resources and its own processes;
    - a failed service-user step ends the run;
    - SIGTERM and SIGINT go through the same cleanup.
  - **Proved by** `drill-safety-check.sh` (14/14: existing user, existing group, partial failure, SIGTERM mid-run) and a full run (42/42).
  - **The record:** the unsafe version and its logs stay as history, marked do-not-run.
  - **Alternatives rejected:**
    - Deleting the old version: it would hide what runs 1–4 actually ran.
    - Using a randomly named service user: the drill exists to rehearse the runbook's own `cgn` steps.
- **D-BR2-07 The rehearsal claims an identity only from its own successful creation step** (review 6908557588; refines D-BR2-06).
  - **The defect:** the D-BR2-06 version inferred ownership from what existed after `useradd`. Another run taking `cgn` after the startup checks would be claimed and deleted. Reproduced in `repro-v2-late-collision.log`.
  - **The fix:** `groupadd --system cgn`, then `useradd --system … -g cgn cgn`, each marking ownership only on exit 0. A taken name (exit 9) becomes a refusal, and the other run's identities are kept. It is the two-step equivalent of the runbook's `useradd --user-group`.
  - **Proved by:** the safety check, now 24/24 with the late-collision cases (user and group; user only), and a full run, 42/42.
  - **Alternatives rejected:**
    - Per-run random names: the drill rehearses the runbook's own `cgn` steps.
    - A lock file between runs: it protects only runs that use the lock, and a confirmed creation step protects against any other creator.

## Beta R3: a decision-ready release record (handoff 6909443770; docs and evidence only)
- **D-BR3-01 The pinned artifact is the audited archive `a693c543…3a5131`.**
  - **The source:** ChatGPT's verification in the private review Codespace. It read the tar without extracting it, matched the 144-file inventory `fe6d74f8…`, and checked `release.json` (`7097ac2`, Node v22.16.0).
  - **On the host:** that hash is what is checked before unpacking.
  - **My three rebuilds** stay separate files. Their matching inventory shows the runnable files are the same, not that a rebuild is the audited archive.
- **D-BR3-02 Two separate owner approvals** (the runbook's "Two approvals before anyone is invited"):
  - **Approval 1:** private target-host validation of the pinned artifact, after the route is chosen;
  - **Approval 2:** invitations and go, after the go/no-go record has host and real-device evidence with no blocker, the owner's sign-off and ChatGPT's review.
  - **Neither implies the other.** A new artifact needs both again.
  - **Not evidence for either:** the local rehearsal and the private Firefox audit.
- **D-BR3-03 The draft go/no-go record fills only evidenced fields.** Everything that needs the host, a phone or the owner is PENDING, and the default is NO-GO.
  - **Enforced by** `check-r3-record.mjs`, which fails on a fabricated result, a disagreeing hash or a filled host field.
- **D-BR3-04 The route decision needs six owner facts (F1–F6), not another survey.** ChatGPT recommends once they are known, and the owner chooses.
- **D-BR3-05 One order of execution, and routes available only within this handoff** (review 6909578563; the runbook's "The order of execution").
  - **The stages:**
    - 0: read-only preflight R1–R8;
    - Approval 1;
    - 1: isolated staging;
    - 2: route checks V1–V3;
    - 3: host and device checks;
    - 4: go/no-go, then Approval 2, then the switch and invitations.
  - **The rules:** each stage starts only when the one before it is recorded, and any failure is a no-go. The checks that need the running isolated preview are named per stage and stay PENDING until observed there.
  - **Routes:** H1 (LAN only) is the only route available under this handoff. H2–H4 need public exposure, new provisioning or possibly spending, so they are recorded as unavailable; making one available needs a separate, explicit owner decision. Approval 1 allows no public port or public exposure: the earlier "a public port beyond the chosen route" wording is gone.
  - **Alternative rejected:** keeping H2–H4 selectable with a warning. The handoff excludes exposure, provisioning and spending, and an option the operator may not take shouldn't look like one.
- **D-BR3-06 The archive checksum is a command precondition** (the runbook's "Promoting it", step 1).
  - **The gate:** `sha256sum --check --strict` against the full pinned SHA-256 is the first link of one `&&` chain: unpack, `release.json`'s revision, the inventory digest, `npm ci`, then exactly `ws` and `zod`.
  - **The marker:** only a complete chain writes `verified-<sha>`, outside the release folder so the inventory is unaffected. Any failure prints `STOP` and leaves no marker, and a stale marker is removed first.
  - **What the marker gates:** stopping the server, the backup, the switch (which also needs this run's backup), and the first install's link and start.
  - **Proved by** `docs/evidence/beta-r3-gate/`:
    - **fixtures from the runbook's own blocks:** a correct archive reaches the sentinels; a wrong, missing, wrong-revision, extra-file or repacked archive never does.
    - **mutation runs:** each guard removed in a copy of the runbook makes its own case fail.
  - **Rebuilds stay distinct:** a rebuild has the same inventory but a different hash, so the gate refuses it (fixture G8).
  - **Alternative rejected:** a separate "compare the printed hash by eye" step. It doesn't stop the commands after it.
- **D-BR3-07 The isolated install uses its own data folder, end to end** (found by tracing the new order; review 6909578563 item 1).
  - **First install** now runs from one `DATA=/var/lib/cgn-validation`. Before, its commands created and checked the real folder, and the unit's `ReadWritePaths=` named only the real folder, so a service pointed at the throwaway folder couldn't write under `ProtectSystem=strict`.
  - **The unit** isn't in the package. The operator writes it from the architecture page, sets `ReadWritePaths=` to `$DATA`, and the start is gated on that line.
  - **`MCHEZO_TRUST_PROXY`** is left out until V2 counts the proxies on the running preview.
  - **Approval 1** names the host software Stage 0 may find missing: Node 22, and for H1, Caddy with the DNS module.
  - **The Stage 4 switch** is one gated block. It starts only when the settings and the unit both name the new, empty real folder.
  - **Alternative rejected:** a systemd drop-in for the data path. It is one more file to keep in step, and the gate checks the unit line directly.
- **D-BR3-08 Every operator block fails closed when run as a whole** (review 6910988491; reproduced first on the blocks published at `ca15c99`).
  - **The rule:** a printed `STOP` is never the only safeguard. Each later step reads this run's flags or one `&&` chain, so it refuses by itself.
  - **Promotion:**
    - `VERIFIED`, `STOPPED` and `BACKUP_OK` are reset at the start of every run.
    - The chain begins by removing any old marker and checking it is gone.
    - Stopping needs `VERIFIED`; backing up needs a successful stop; switching needs all three.
    - Step 1 sets no data-folder variable (the backup uses `LIVE_DATA`), so running it inside the first install can't redirect that install's `DATA`.
  - **First install:** split into prepare, the operator's edits, the artifact gate and start.
    - The settings file is never truncated.
    - The start is one chain: this run's verification, the link, the settings naming the throwaway folder exactly once, the data check, the unit line and the reload.
  - **The switch:** split around the operator's settings edit.
    - Part A changes nothing unless the stop succeeded, and makes the real folder with `mkdir`, which refuses any existing folder and leaves it as it is.
    - Part B starts only after these checks: part A's flags, the settings naming the new folder once, the access-code line changed (compared by hash, never printed), the folder still empty, the unit line, and the reload.
    - On refusal the service stays stopped and nothing is deleted.
  - **Proved by** `docs/evidence/beta-r3-gate/round2/`:
    - the review's three scenarios reproduced on the old blocks;
    - the new blocks run against fixtures with logging stubs for the privileged commands, positive and negative per path;
    - 16 mutations, each removing one guard and caught by its own case.
  - **Alternatives rejected:**
    - `set -e` in the blocks: it doesn't stop on failures inside `if` conditions or `&&` lists, and it would end the operator's interactive shell.
    - One long script: the operator's settings edit has to happen by hand between the parts, and the code mustn't pass through a script's arguments or logs.

## Beta R4: uncertain delivery after an intermediary 5xx (review 6935165862, item 4; separate stacked draft PR)
- **D-BR4-C502-01 An exhausted 502, 503 or 504 with no error of the app's own is "couldn't confirm", not `Request failed (502)`.**
  - **Why:** the W4 rehearsal showed the raw text for a tap made while the server restarted behind a proxy.
    - The server itself never answers 502, 503 or 504, so such an answer comes from an intermediary.
    - The action may or may not have been recorded: a restart can lose the reply to a committed action.
    - So the phone uses the existing `NOT_DELIVERED` wording, which never claims either way, and the screen then shows the server's state.
  - **What decides it** (amended after review 6936791624): `isUnconfirmedIntermediaryFailure` in `apps/web/src/components/intentRetry.ts`. The status is 502, 503 or 504, **and** none of the body's `error`, `reason` or `code` strings is one of **Mchezo's existing app errors** (`isKnownAppError` in `errors.ts`: an error with an established message there). That means:
    - an exact entry: a server reason code or sentence;
    - or one of the two families ("Only host/cohost can …", "Need at least N connected players"), with or without "Not accepted: ".

    A known app error is authoritative and keeps its wording.
  - **The boundary, and why:**
    - The intents endpoint (`src/server/http.ts`) answers only 200, 4xx `{error}` or 500 `{error}`, **never 502, 503 or 504**.
    - Its replies carry **no header that proves app origin** (only `content-type` and `cache-control`).
    - So no existing discriminator covers these statuses. A gateway's **generic JSON** (`{"error":"Bad Gateway"}`, `{"code":"SERVICE_UNAVAILABLE"}`, `{"reason":"upstream timeout"}`, …) looks like an app error but isn't one, and is unconfirmed like HTML or an empty body.
    - **The first version** treated any non-empty `error`, `code` or `reason` as the app's, and showed "Bad Gateway", `Request failed (503)` or `Request failed (504)` for those bodies. Review 6936791624 reproduced this.
    - **Other statuses are unchanged:** a 500 or 4xx still shows the body's error, or the bare status.
  - **Unchanged:** the retries, the event id, the pending state, the server's dedupe and exactly-once scoring.
  - **Alternatives rejected:**
    - **Any non-empty `error`, `code` or `reason` field counts as the app's** (the first version): a gateway's generic JSON passes that test.
    - **A new origin header on the server's replies:** it changes the server, and the server never answers these statuses anyway.
    - **Mapping every 5xx:** a 500 is a real error and should say so.
    - **"Not received" wording:** false in the committed, reply-lost case.
    - **Changing the server or the retry count:** out of scope, and not needed.
  - **The release pin `7097ac2` is unchanged** until an explicit candidate review.


## Beta R4 W7: the owner-run browser test packet (handoff 6954764073; docs/beta/w7-owner-test-packet.md)
- **D-R4W7-01 The packet's previous phase is a local rebuild of `7097ac2`, checked against the audited inventory.**
  - **The pair:** the current phase is `988c535`, the runtime review candidate. The previous phase is `7097ac2`, rebuilt locally. Its 144-file inventory must equal the audited `fe6d74f8…`, and `prepare` refuses to serve otherwise.
  - **Why:**
    - `7097ac2` is the real rollback target;
    - its files can be checked against the audited record;
    - it has the same server as `988c535` (`git diff 7097ac2 988c535 -- src` is empty). Compatibility is still checked (`compat`, `check`).
  - **Its label:** a LOCAL SURROGATE pair, since the current side is an unaudited local pack. It can't clear B-W7-01.
  - **Alternatives:**
    - **The rehearsal's `f93e9cb` surrogate:** rejected. It has no audited identity to check, and it isn't the rollback target.
    - **The audited archive bytes `a693c543…`, where the operator holds them:** better, but not implemented. The tool builds from source, and `prepare`'s inventory check covers the same files.
  - **Reversible:** the pair is two constants in `scripts/beta/w7-owner-preview.sh`.
- **D-R4W7-02 The operator tool deletes only what it recorded creating** (review 6955337359, P1 and P2).
  - **The record:** `prepare` first writes `<work>/.w7op-owner`, mode 600, holding a marker, the canonical root and a token. Every resource is registered in it **before** it is created.
  - **Every other command refuses** a folder without that record, or one whose record is a symlink, belongs to another user, isn't mode 600, or names another root.
  - **`cleanup`** removes only recorded entries whose names are on a fixed list. It never removes a symlink, `src/`, `evidence/` or the record. It reports `REFUSED` with a non-zero exit, but still removes the safe entries, the code first.
  - **`W7OP_LOCAL_TEST=1` is refused before anything** whenever any Codespaces variable is set.
  - **Why:** a mistyped work folder must never cost another checkout its data, and an interrupted `prepare` must never strand the code.
  - **Alternatives rejected:**
    - **checking only for `src/.git`** (the defect itself);
    - **refusing the whole cleanup on one bad entry:** that would strand the code;
    - **a local-test flag that's merely ignored in a Codespace:** a silent mode change is worse than a refusal.
- **D-R4W7-03 One exclusive run folder, identified, then retired** (review 6955682854; it supersedes D-R4W7-02's per-entry inventory).
  - **The folder:** `prepare` creates `<work>/w7op-<token>` with a plain `mkdir`. It writes a token file inside it, and records the folder's device:inode:birth time. Every resource of the run lives inside it.
  - **The checks:** every command verifies that identity first.
  - **`cleanup`:** it removes the code, then the rest, then the token file and the folder. Only then does it retire the record. A retired record removes nothing.
  - **Why:**
    - a per-entry list kept stale ownership after a removal, so a retry deleted replacements (34 of 34 in the reproduction);
    - `mkdir -p` of shared names could take over a pre-existing folder;
    - an inode number alone is reused when a folder is recreated, and a birth time isn't.
  - **Alternatives rejected:**
    - **removing `own` lines one by one:** a crash between a removal and its line still leaves a window;
    - **an inode alone:** reuse was observed;
    - **trusting the token file alone:** it can be copied.
  - **Where birth time is unavailable,** a filesystem reports 0. Identity then rests on device:inode plus the token file.
- **D-R4W7-04 The run folder stays provable through its last step** (review 6956209006).
  - **`prepare`** records the identity (device:inode:birth time) right after the `mkdir`, before the token file.
  - **`cleanup`** records `finalizing` before it deletes the token file.
  - **A cleanup that finds no token file proceeds only if** the recorded identity matches and the birth time is known and non-zero. Even then it only `rmdir`s the empty folder, so a replacement is refused.
  - **With no recorded identity, nothing is removed or retired.** The message gives the by-hand recovery.
  - **Why:** removing the token before the `rmdir` made a failed or interrupted final step permanently unretryable. An empty folder without a recorded identity is no proof of ownership, so it is left alone.
  - **Alternatives rejected:**
    - **moving the token file outside the run folder before the `rmdir`:** it leaves another file to clean up;
    - **trusting the token file alone when there's no identity:** it can be copied;
    - **a recursive delete without the token file:** only an empty folder is safe to remove on identity alone.
- **D-R4W7-05 W7's browser route is Route B, with an explicit operator entry** (review and handoff 6957990858).
  - **What:** `w7-owner-preview.sh` gains `routeb`, `bstart` and `firefox`. `stop`, `status` and `cleanup` cover them.
    - **The origin:** both pinned releases run on 127.0.0.1:3171, behind `render-like-proxy.mjs` (it passes Host and Origin unchanged) on 127.0.0.1:3173, with `MCHEZO_PUBLIC_ORIGIN=https://beta.localhost:3173`.
    - **The certificate:** a session CA issues one 2-day certificate for `beta.localhost`, and its key is deleted at once.
    - **The trust:** only the run's host, guest and TV Firefox profiles trust the CA.
    - **Where it all lives:** in the run folder, so the existing ownership checks and cleanup apply. Cleanup stops only processes whose command line names this run folder.
  - **Why:** the reviewer rejected the origin adapter, which depends on an undocumented forwarder distinction. Route B keeps the browser's genuine origin and normal certificate checks, and it worked in this Codespace before (6904986723).
  - **Unchanged:** Route A's `start` and its `UNSUITABLE` refusal; the inventories; one writer; the runtime.
  - **Alternatives rejected:**
    - **a separate Route B script:** it would duplicate the ownership and cleanup machinery;
    - **reusing ports 3157 and 3158:** they are already forwarded;
    - **keeping the CA key for re-issue:** a new session gets a new run folder and a new CA.


- **D-R4W7-06 The pins-only forward change and its revert are named patches against an exact baseline** (handoff 6966073894).
  - **What:** `scripts/beta/w7-pins-pair.sh make` writes both patches from the deploy context, together with `IDENTITY`, `baseline.sha256`, `forward.sha256` and `SHA256SUMS`, into `docs/beta/pins-72e9d8b/`. `verify` checks them in a private copy.
    - The canonical `deploy/render` stays at `7097ac2` on the branch.
    - The forward and revert are never two successive commits on the PR branch, so the proposal doesn't cancel out of its own diff.
  - **The substitutions:** the exact, counted ones of `w7-pred-context.sh` (revision, archive name, inventory digest, the inventory pin's name three times, the two `.dockerignore` names, the Dockerfile's comment), **plus** the gate's two comment lines that state the pinned digests.
    - **Alternative:** leave those comments stale. It would make the diff two lines smaller, but the forward gate's header would then name `a693c543...` and `fe6d74f8...` while it enforces `aac13a8a...` and `4f58b323...`.
    - **Kept unchanged on purpose:** the gate's reference to `docs/beta/release-7097ac2.md` for how the inventory is computed. It describes a method that is still true.
  - **What `verify` takes:** the identity on the command line, and the folder must pin exactly that identity. A folder made for another build of the same files is refused (self-test F7).
  - **Why a second check besides `git apply`:** `git apply` alone accepts a base changed outside every hunk (self-test F2, a guard script). So `verify` first requires the whole context to match `baseline.sha256`. It then maps every new identity token back and requires the baseline byte for byte, so a change hidden inside an allowlisted file is refused (F6).
  - **Paths:** relative to the context's root, as in the deploy repository. In this repository, use `git apply --directory=deploy/render`.
  - **The archive bytes are not in the patches.** Swapping `artifact/` is a companion step for ChatGPT, where the bytes are kept. The gate refuses any other archive.
  - **The gate checks run without docker:** each context's own `cgn-artifact-gate.sh`, run as the Dockerfile's gate stage runs it (`sh` is dash, Node v22.16.0, the inputs filtered by `.dockerignore`). The script is the same; docker would only add the image layers already reviewed in the render-package evidence.

## Post-beta: fair game starts and clocks (handoff 7004097156; QA report details 7004164219; direction 7004637491; docs/evidence/fair-starts/)
The QA report's IDs:
- **H6:** readiness rows and starts.
- **H7:** actionable time lost; this includes previous feedback pushing the next question's controls down.
- **M9:** the ready heading, the confirm dialog and the rows disagreeing.

Every fix here is client-side. The server's start, timing, scoring and ledger are unchanged.
- **D-FS-01 The server's start and timing contract is unchanged; no shared pre-start stage.**
  - **The evidence:** `scripts/check-fair-starts.mjs` (six contexts, a server clock the driver owns). On the baseline `da5ac0f` and on live `7097ac2` alike:
    - every phone was actionable within 168 ms of the start broadcast, the 6× CPU-throttled one included (the final runs; the evidence README has each figure);
    - all got one `playStartedAt` and one set of deadlines;
    - the all-ready start, the tick start, the late confirm ("already started"), a truly concurrent final Ready and confirm, and the expiry all behaved as D3 documents, with one transition and one `game-started` each.
  - **The original H7 reports of seconds of lost time are not reproduced; their cause is unknown.** They came from six cloud desktop browsers driven one after another, without simultaneous timestamps.
  - **Alternative not taken:** a shared "Get ready" lead to absorb network latency. Nothing measured calls for it, and it would change the approved timing contract. Native phones on real networks remain the open limit.
- **D-FS-02 Closest Wins: the new question comes first, the last answer after it** (H7).
  - **Why:** a question's 40 s clock starts the moment the last one closes. Drawing the "Last question" card above the new question pushed Submit below the fold of a 320×568 phone (616–672 px of 568, in every run), and of a 375×667 one for a longer question, while the clock ran.
  - **What:** on the guessing screen only, the card moves below the controls. The waiting screen (guess in) keeps it on top: there is nothing to do there. No forced scrolling. No server or timing change.
  - **Checked through the real input path:** with a long question 2 (196 characters), at 320×568 and 375×667:
    - the input's and Submit's on-screen points hit the controls themselves;
    - a tap focuses the input and typed digits go in;
    - a tap on Submit, or Tab then Enter, submits with no scroll.

    **A negative control** proves the measurement calls a pushed-down Submit not actionable.
  - **Alternative:** a reveal phase between questions, as Team Huddle has. It would change the game's timing and backstop.
- **D-FS-03 Only an "I'm ready" refused because its own game began is not shown as a failure** (H7; narrowed per 7004637491).
  - **Why:** a `briefing-ready` with `ready: true` that reaches the server just after that game's start (the host's confirmed Start now, or a concurrent last Ready) is refused with `READY_LOCKED` and records nothing. `READY_LOCKED` means exactly "this intent's game has left its briefing". The phone used to put "The game has already started." as an alert on that player's first question.
  - **What:** `refusalText(action, payload, reason)` returns null for that one case. Unchanged:
    - a late "not ready" still says the game has already started;
    - `READY_LOCKED` on any other action keeps its words, as does every other refusal;
    - delivery failures and reconnects;
    - what an accepted send says.
  - **Alternative:** have the server accept a late Ready as a no-op. That changes the D3 intent contract for a display problem.
- **D-FS-04 "Game cancelled" belongs to the cancelled briefing, and shows on the results screen too** (H6/H7).
  - **Why:** a cancelled or expired briefing returns people to the last results they hadn't closed (Stage 7.4, C1). The note only rendered in the lobby, so an expiry was silent there, including for a host whose Start now confirmation was open.
  - **What:** one note element, keyed to the cancelled briefing's id, shown in the lobby notice and above the results hero (every results screen goes through `resultsHero`).
    - **Semantics:** it is a polite `role="status"` region.
    - **Lifetime:** it stays through later broadcasts until OK. It goes as soon as another game opens its briefing or is being played, so it never speaks for a later round.
- **D-FS-05 The Start now confirmation is a labelled snapshot whose title matches its rows** (M9).
  - **Why:**
    - **The snapshot problem:** the dialog's title counted the ids captured when the host tapped Start now, while each of its rows showed that person's live status. Two people getting ready with the dialog open gave "3 people aren't ready" over rows reading "ready, ready, not ready yet", the same disagreement the QA report lists for Majority Rules and Closest Wins.
    - **The title wording:** a Ready player who was reconnecting was counted as "not ready".
  - **What:** the dialog keeps the snapshot it confirms (unchanged server semantics: a stale list is refused and asked again, as check-briefing C requires).
    - **The labels:** "When you tapped Start now:" over the snapshot's rows, and a title that says the same (`confirmTitle`: "not ready", "not connected", or both).
    - **Live changes** go on a separate "Since then: …" status line (`confirmChanges`): who is ready now, who isn't any more, who came back or dropped.
  - **Alternative:** a fully live dialog. Confirming a list that changed under the host's finger would either start play without the server's "ask again", or refuse a list that was on screen. Both contradict the D3 contract.
  - **The refreshed snapshot** (review 7007413347, which found it on `8f2ead3`):
    - **The race:** when the server asked again, the replacement snapshot paired the server's new ids with the rows captured before the request. The host confirmed Baraka; Amina withdrew while the request was in flight; the host's phone applied her withdrawal; then the refusal named Amina and Baraka. The replacement said "2 people aren't ready or aren't connected" over "Amina: ready", with "Since then: Amina isn't ready any more".
    - **What:** a `READINESS_CHANGED` refusal now carries `needsStatus` (each named player's readiness and connection at the refusal) and `rev` (the projection revision broadcast with it). Both are additive; the server's ids, the confirm rule and the start are unchanged.
    - **The rows:** the replacement keeps the server's ids as sent and takes each row's status from those facts (`refusalSnapshot`). Names come from the latest applied projection of this briefing. A server without the facts gets the latest applied projection's rows, never the rows captured at the tap; a title for a row that then gives no reason says only that the game asked again.
    - **The label:** "When you confirmed, the game checked again:" (or "When you tapped Start now, the game checked:" when the first tap was refused).
    - **"Since then":** quiet until the live rows are at least as new as the refusal (`liveCaughtUp`: by `rev`, or, without one, once they have agreed with the snapshot), so an older projection can't contradict the rows.
    - **The regression:** check-fair-starts M2 holds the host's confirmation on the network while Amina withdraws, then reads every frame of the replacement for 1.5 s.
    - **Alternative:** rebuild the replacement from the latest projection only. A projection older than the refusal can still say "Amina: ready" while the server names her, which is the same disagreement in a narrower window.
- **Not changed, and why** (H6): "pressed and disabled, the row still not ready, then play at 5/6".
  - **What happens:** the last Ready starts play in the same server step, so no projection ever shows 6/6. The button is busy from the tap until the start frame arrives, 0.07–0.17 s later in the driver's runs.
  - **The verdict:** that is the documented all-ready contract, not a stale row.

## Post-beta: answer visibility and accessibility, H1/H2 (handoff 7008903623; acknowledged 7008956723; docs/evidence/answer-visibility/)
The acceptance criteria are the handoff's, from the November 19 audit's page 4 findings. The audit itself isn't in this repository.

- **D-AV-01 Pattern Pulse shows its pattern as a transient cue, one symbol at a time** (H1).
  - **Why:** the memorise screen drew the whole pattern for the whole window, as a row of cells.
    - The row's accessible name listed the complete sequence ("The pattern: Red circle, Yellow square, …").
    - Each cell also carried a visible short name.
    - So the complete sequence sat in persistent text and in an accessible name for the whole memorise window. The handoff's criterion is that it never does, while memorising or while tapping it back.
  - **What:**
    - **The slots:** the server's memorise window (unchanged: 1.2 s plus 0.7 s per symbol) is split into one equal slot per symbol (`pulseCue.ts`). Each symbol is on screen for the first 80% of its slot, then the stage is empty, so a symbol shown twice reads as two appearances.
    - **The stage:** shows one symbol with its place and full name ("2 of 5: Yellow square").
    - **The accessible cue:** ~~the stage is also an `aria-live="assertive"`, `aria-atomic` region~~ (superseded by D-AV-05: one announcer that is already in the page, empty, before the pattern opens), so a screen reader hears the same symbol in the same slot.
    - **The countdown** ("Hides in 3s") is no longer a live region, so it can't talk over the symbols.
    - **Reduced motion and Animations Off:** the same timing, with only the pop-in dropped.
    - **The server's only change** is the additive `open.showFrom` (the window's start, server time), so every phone times the slots on the server's clock. An older server without it is timed from when the phone first saw the round.
  - **Unchanged:** the windows, the pattern's lifetime in the player's own projection, the recall screen and its controls, the post-round line, the recap after the game, and scoring.
  - **Alternative:** keep the row and only remove the names and the accessible label. A sighted player would still see the whole sequence at once while a screen reader user got nothing equivalent, so the cue would not be equivalent across senses. Another alternative, a server push per symbol, adds a broadcast every 0.7 s per player for no gain the slot timing doesn't already give.
  - **Not hidden:** the player's own projection still carries the round's pattern during the window (it always has; the phone needs it to present the cue). The criterion is about rendered and announced text and accessible names.
- **D-AV-02 Pattern Pulse's rules version moves to 2** (H1).
  - **Why:** seeing one symbol at a time is a different memory task from seeing the whole row, so a solo personal best set under v1 no longer compares with a v2 round.
  - **What:** `PULSE_RULES_VERSION = 2`; a v1 best stays stored but is not compared. Lengths, symbols, windows and scoring are unchanged (the fingerprint test pins them).
  - **Alternative:** keep v1 and compare across presentations. Rejected: a best from the easier presentation would be unbeatable on equal terms.
- **D-AV-03 Spectrum's target: the contracts pinned as regressions; no leak found** (H2).
  - **What the source review found:**
    - every phone, the host's included, uses the player audience;
    - the module's `playerView` sends `me.target` only to the round's clue-giver, in the clue and guess phases;
    - the host and cohost tool audiences, the TV and spectators (which the server serves the TV projection) get only the public view, which carries a target only once revealed;
    - the phone draws a target only on the clue-giver's screen and at the reveal.
  - **The contracts now pinned:**
    - `tests/h2-spectrum-target.test.ts`: every audience and round with a canary target per round, the host in a guessing seat, a cohost, a late joiner, a sit-out, role rotation, the reveal, and the HTTP projections a phone, the host's tools and a spectator fetch. A negative control (the module leaking the target to guessers) fails both tests.
    - `MchezoSpectrum.test.tsx`: the rendering for each role, including a stale or forged projection that hands a guesser a target, which the phone does not draw.
    - `check-spectrum` round 2: every non-giver phone and the TV, in the DOM, the text and accessible names, after the roles rotate.
  - **Alternative:** none needed at the source. The audit's observation is not reproduced as a leak by these checks; its exact steps were not available here.
- **D-AV-04 Browser drivers read a Pulse pattern from their own seat's projection** (H1).
  - **Why:** with a transient cue there is no longer a row to read, and sampling the cue in every driver would slow them all by a whole window.
  - **What:** `scripts/lib/pulse-pattern.mjs` reads the open round's pattern from the page's own seat's projection (the tab's seat, a remembered seat or the solo seat): a test oracle that reads nothing another player could not. `check-pattern-pulse` still watches the cue itself, sampling the page every 15 ms through the window.
  - **Alternative:** a test-only hook in the app exposing the pattern. Rejected: a production page should not carry one.
- **D-AV-05 Pattern Pulse's cue is spoken by one announcer that is already in the page, empty, before the pattern opens** (H1, review 7010784066).
  - **Why:** the review found that the memorise screen's live region arrived together with its first words. The ready screen had none. Live regions are generally announced when a region already in the page changes, so the first spoken cue was not assured, whatever a DOM sample of the three labels showed.
  - **What:**
    - **The announcer:** `PulseAnnouncer` is one visually hidden `aria-live="assertive"`, `aria-atomic="true"` paragraph. Every Pulse screen (ready, memorising, recall, finished) renders it right after its own `<main>`, at the same place in the tree, so React keeps ONE DOM node for the whole game.
    - **Its text:** `pulseCueSay` gives "1 of 5: Blue diamond" in its slot and empty in each gap, before a round opens and once the window ends. Recall therefore finds it empty. A symbol that comes back later in a pattern is said again with its new place. The server never sends one twice in a row (`pulsePattern`), and if it did, the gap and the new place would still make it a new announcement.
    - **Mounting empty:** a newly mounted announcer stays empty for 150 ms (`PULSE_ANNOUNCER_SETTLE_MS`) before it may speak. In play it mounts with the ready screen, long before the pattern opens. The wait matters only when the page itself loads mid-window, after a reload.
    - **The visible stage:** it keeps the same one symbol in the same slot, now `aria-hidden="true"` and not live, so nothing is heard twice. The one-symbol constraint, the visual cue, the server window and scoring are unchanged.
  - **The regression:** `check-pattern-pulse` marks the announcer node on the ready screen, before the pattern opens. A MutationObserver then records each change of its text with what the stage showed at that moment.
    - **For every round opened through the UI** (13 a game), it checks:
      - the same node at recall;
      - that it was empty and assertive/atomic before the pattern opened;
      - that the first change is the first cue;
      - each cue once, in order, in step with the visible symbol;
      - empty at recall.
    - **On `b936586`** (the build reviewed) these checks fail, because there is no announcer before the pattern opens. The unit tests pin the text per slot and gap, and the announcer's place and empty mount on every screen.
  - **Cadence, not changed and not measured with assistive technology:**
    - **The timing:** each symbol is on screen and in the announcer for 0.68–0.88 s, in a 0.85–1.1 s slot.
    - **The arithmetic:** "2 of 5: Yellow square" is five words. At an illustrative 180–300 words a minute, that is 1.0–1.7 s to speak, longer than a slot. So at many speech rates the next assertive cue arrives before the last has finished. Whether a screen reader then cuts it off or queues it is the screen reader's behaviour, which only the native-device retest can observe.
    - **Options for a decision after that observation** (none applied; the authoritative window is unchanged):
      - shorter words, such as the name alone;
      - a polite region, which queues every cue but lets speech trail the symbol;
      - a per-player slower-cue option that lengthens that player's memorise window. That changes the timing the score depends on, so it is the owner's decision, made after the observed behaviour is reported.
  - **Alternative:** keep the stage as the live region and mount it empty on the ready screen too. That would put a memorise-only region on the ready screen, and still lose the node at recall (the screen's `<main>` changes). One announcer outside the screens is simpler and survives every screen change.

## Post-beta: Draw & Guess drawing board on phones, H3 (handoff 7020760499; acknowledged 7020806630; docs/evidence/draw-board/)
The reported symptom: a nearly black **drawer** screen in an iPhone in-app browser while the timer stayed visible. Its cause on that device is not established; no native iPhone was available here.

- **D-H3-01 Draw & Guess's play screens have no entry animation** (H3).
  - **What the trace found** (`scripts/check-draw-board.mjs`):
    - **The setup:** Chromium phone emulation, three phones at 320×568, 375×667 and 390×844, each the drawer once; touch strokes; a reload mid-turn; the next drawer; with and without a WebSocket.
    - **The result:** the drawer's board was always in view and painted. Its centre was the board, with the paper fill and opacity 1 up the ancestor chain, paper-bright in the screenshot. Touch strokes reached the server and every guesser, and the screen never re-entered or dimmed.
    - **The weak point:** the game clock is rendered *above* the screen, outside it. Every screen (`.mz-screen`) fades in from opacity 0 (`mz-enter`, fill mode `both`).
    - **The reproduction:** held at its first frame, the drawer's screen stays at opacity 0, which is the whole screen at brightness 19 of 255, while the clock still shows. That is the reported picture. A web view can hold an animation like that when it is suspended or throttled; this one simulates it.
  - **What:** the drawing, guessing and reveal screens carry `mz-dg-screen`, which turns the entry animation off in every motion setting. So they are visible from their first frame whatever the web view does with animations. Nothing else changes: the board, the word only on the drawer's phone, turns, stroke limits and scoring.
  - **The regression:**
    - `check-draw-board` holds the entry animation at its first frame after a reload, on the drawer and on a guesser. It fails on `6897765` (opacity 0, brightness 19, the clock visible) and passes with the fix.
    - `MchezoDraw.test.tsx` pins the class on the three screens and the stylesheet rule.
  - **Not claimed:** that this was the iPhone's cause. A native Safari (and in-app browser) check on the exact candidate is still needed (see the evidence README).
  - **Scope:** Draw & Guess only, as the handoff asks. Every other screen still fades in from opacity 0, and Team Draw's drawing screen has the same dependency. Whether to make all screens visible from their first frame is a separate decision.
  - **Alternative:** a transform-only entry (no opacity). That would keep the motion, but it would keep a composited, animating layer over a large SVG on the screen that was reported black. With no animation, the screen has nothing to stall.

## Post-beta: player-facing copy in Who Said That? and Geography Challenge, H8 (handoff 7027768922; acknowledged 7027797177; the November 19 QA audit, pages 7 and 29; docs/evidence/player-copy/)
- **D-H8-01 The two games tell players what they do, with no build or status note** (H8).
  - **Where the copy reaches players:**
    - The registry `tutorial` (`src/games/registry.ts`) is the briefing's "How to play" line (`briefingRules`; neither game has its own rules entry) and the older intro screen.
    - The manifest `description` (`src/games/manifest.ts`) is the game's card and details sheet: Home, the Library (`/library` and, in a room, Room menu → All games) and the host's picker.
  - **What players saw on the base (`7c013bf`):**
    - Who Said That?: "Match the quote to the speaker. Generic pack only in local builds." (briefing) and "Match quotes to their speakers. Generic pack only in local builds." (details).
    - Geography Challenge: "Flags, capitals, outlines, maps, and distance — six modes, provisional." (briefing) and "…Six modes, provisional." (details).
  - **What they see now:**
    - Who Said That?: "Match each quote to the character who said it. Everyone answers on their own phone, and the answers are shown when the game ends." (briefing) and "Match each quote to the made-up character who said it. Played in a room, each player on their own phone." (details).
    - Geography Challenge: "Geography questions, mixed in every game: flags, capitals, regions, distances and more. Pick one of four answers on your phone." (briefing) and "Four-choice geography questions, mixed in every game: flags, capitals, regions, distances and more." (details).
  - **Why this wording:**
    - Who Said That? is played in a room only (4–10 players); it is not on the solo shelf, and the shelf already says "the other games are played in a room". The quotes are from made-up characters. Answers are revealed on the results screen.
    - Geography Challenge has no mode to pick: each game mixes question types from the pack (flags, capitals, regions, landmarks, higher-or-lower, distance; outlines in the older pack). "Six modes" described the module, not anything a player chooses.
  - **The audit's other two strings:** "play solo (not in a room)" and "It is easy to get all answers right in tests." are not in the source, its history, or the built bundle of `7c013bf`, and no results screen shows them. The likely meaning of the second one is that the older Who Said That? pack's answers are guessable from the speakers' jobs ("Baking is just chemistry with cinnamon" → Mira the Baker). That is content, listed below.
  - **Unchanged:** players, durations, play styles, statuses, solo availability, scoring and every question. The only pack change is D-H8-02's two explanations. The manifest `details` field (not shown to players) now says the same as the code.
  - **The regression:**
    - `tests/h8-player-copy.test.ts` (14 tests, with D-H8-02's) runs one guard for team notes over every game's tutorial, details description and briefing lines. It pins the two games' new text and unchanged registry facts, and its negative control is the audit's strings.
    - `scripts/check-player-copy.mjs` (a browser driver) runs on a 320 px phone through the normal entry points:
      - the Library's details sheet;
      - the solo shelf;
      - in a room: Room menu → All games → details, then the picker, Start, the briefing, play, results with the answers, and Back to lobby.
    - On `7c013bf` the driver fails 13 checks: 10 on this copy and 3 on D-H8-02's results text. It passes on the fix.
  - **Alternative:** hiding the briefing line for these two games. Rejected: players lose their only "How to play" text.
- **D-H8-02 Two Geography answer explanations lose their team note (a wording edit inside H8, authorised in handoff 7028695889)** (H8).
  - **What players saw:** two revealed explanations on the Geography results screen ended with a note for the team:
    - `geo-legacy-5` / `geo-outline-1`: "Italy is famously boot-shaped. Text hint fallback, not SVG geometry."
    - `geo-legacy-6` / `geo-region-1`: "Egypt is in North Africa. Accessible region fallback, not map tap."
  - **History:** at first (tested commit `777b6f5`) H8 left them alone and only listed them, because they are pack content and the handoff said "preserve content". ChatGPT's scope answer [7028695889](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7028695889) then clarified that removing these two implementation notes is within H8, with no owner relay needed for this narrow edit.
  - **What:** each explanation keeps its first sentence only ("Italy is famously boot-shaped." and "Egypt is in North Africa."). The edit is in both sources: `content/packs/geography-legacy.json`, whose version is now 1.0.1, and `src/games/geography.ts`.
  - **Unchanged:** IDs, prompts, options, answers, difficulty, category, mechanics, mode, scoring, eligibility and the review block (status `legacy`, notes as before).
  - **Approvals:** none was made or touched; there is no approvals file. This is a wording edit, not an editorial or factual approval of the pack, and not clearance for official championship use.
  - **The technical rationale stays in developer docs:** the outline and region questions are text and region fallbacks, not licensed geometry or map tiles. It is in the comment above `GEOGRAPHY_PACK`, the manifest's `details` (not shown to players) and `docs/SECURITY_AUDIT.md`.
  - **Hash and snapshot effect (existing behaviour, no incompatibility):**
    - The pack version and both items' content hashes changed.
    - A Geography briefing frozen on the old text before a server restart onto this pack fails its content check at play start (`pendingItems`). It is cancelled as `content-changed`: no game, no usage, no score, and the host can start again.
    - A game already in play keeps the questions it was dealt. Content history is by item ID, so the no-repeat rules are unaffected.
    - `npm run content:check` reports CONTENT OK, with the same single Geography warning as the base.
  - **The regression:**
    - `tests/h8-player-copy.test.ts` asserts that neither game's questions, options, answers or explanations contain a team note, in both packs, with no exception list. It pins both cleaned items field by field, the 1.0.1 version, the clean load, the `legacy` status and Official eligibility, and the hash change. It also plays a whole Official Geography game on both paths and reads the revealed explanations from a player's projection: a Cup created now deals from the content pack, and a Cup restored from before Sprint 4 deals from the built-in pack.
    - `scripts/check-player-copy.mjs` checks the unfiltered results text, and that each of the two explanations is shown as exactly its first sentence.
  - **Alternative:** keep them and list them (H8 as first tested). Superseded by the scope answer.
- **H8 sweep: other player-facing notes, for the backlog (not patched; the patch is limited to the two reported games):**
  1. Finish the Family Cup sheet (`apps/web/src/components/mchezo/Lobby.tsx`): "Try-out rules: these are provisional and haven’t been confirmed for an official championship yet." The TV's champion screen (`TvShow.tsx`) also says "Try-out rules: …". These are deliberate status lines about the Cup's rules; they need the owner's wording.
  2. "Design estimate" notes about game lengths, which read like team notes:
     - the game details sheet (`Home.tsx`): "“About N min” is our design estimate of a session, not a measurement.";
     - the Library footer (`MchezoLibrary.tsx`): "Lengths are design estimates…";
     - the host's picker (`Lobby.tsx`): "Times are design estimates, not measured."
     Suggested: "About N min is a typical game." Each one also says the game ends by itself at its time limit, which should stay.
  3. Who Said That? older pack: answers are guessable from the speakers' roles (content).
  4. Rooms deal the older packs for Who Said That? and Geography when the newer items are not approved for Official play (content approval, not copy).
  5. Practice-only reasons name approval status (e.g. "practice-only until its Cup scoring is approved"). This is honest status and acceptable as is; listed for the owner's wording pass.
  6. Accuracy, not a team note: the details sheet's chip "Can count in the Cup (2+ players)" (`Home.tsx`) gives the Cup's two-player minimum. It shows that number on games that need more, such as Who Said That? (4–10 players). Suggested: name the game's own minimum.
  - **Result of the sweep:** no other game's tutorial, details description or briefing line trips the guard, and no other pack item does (pack titles such as "Sprint 4" are never shown to players).

## Post-beta: solo players read the rules before they start (handoff 7029967180; acknowledged 7029976924; docs/evidence/solo-rules/)
- **D-SR-01 Every way into a solo game lands on its instructions; only their Start makes a round** (owner-approved fix of the solo entry flow).
  - **What live playtests found:** in Math Mayhem, Pattern Pulse and Word Connections, the solo shelf's Start opened a round before the instructions could be read.
    - **The cause:** the shelf set an `autostart` flag, and `SoloRound` started a round on mount. The game's own instructions screen (`solo-howto` and one `solo-round-start`) was skipped.
    - **The base already got some paths right:** a direct `/solo/<game>` URL and a reload landed on that screen without starting anything.
  - **What:**
    - `autostart` is gone (`App.tsx`, `Solo.tsx`), so mounting `SoloRound` never starts a round.
    - The shelf's action now says **How to play** (screen readers hear "<game>: how to play") and opens the instructions. Its test id `solo-start-<game>` is kept, because the Everyday style baseline and other drivers key on it.
    - A round starts only from the instructions' Start (or Try again), or from Play again on the results.
  - **Unchanged:**
    - content selection, scoring, personal bests, solo recovery (a reload lands on the instructions; Start replaces any round left open) and the season choice;
    - Leave round, and browser Back mid-round, both still remove the round;
    - Pattern Pulse: each pattern still opens on its own in-round action, with its timing rules unchanged.
    - One press is still one round: `SoloSession.start` sets `starting` synchronously, so a second tap returns.
  - **Out of scope:** Trivia/Math auto-advance, results restructuring and the broader redesign.
  - **The regression:**
    - `scripts/check-solo-rules.mjs` (new, its own server, 320×568 and 375×667 touch phones) runs every step for all three games:
      - shelf → instructions, then waiting there;
      - Back and Forward, and re-entry;
      - a rapid double tap on Start;
      - Pattern Pulse's first pattern still waiting for its open action;
      - play to the results, then Play again;
      - Back mid-round, then re-entry;
      - a direct URL on a fresh device, then a reload.
    - It counts every room made, round started and projection poll.
    - **The result:** on `3cc1c2f` it FAILS 30 checks; every shelf entry made a room, a start and polls before anything was read. On the fix it passes 88/88.
    - `apps/web/src/components/mchezo/Solo.test.tsx` pins the shelf's How to play label and the instructions screen, with one Start, for each game.
  - **The drivers updated for the new flow:**
    - `check-solo`, `check-solo-shelf`, `check-mobile-everyday`, `check-install`, `check-install-builds`, `check-casual` and `check-themes-seasonal` now tap the instructions' Start after the shelf. The stage screenshot scripts have the same change.
    - `check-solo` now checks that tap 2 is the instructions and tap 3 is the round, and its keyboard path tabs to Start on the instructions.
  - **Alternative:** a modal over the shelf with the rules and Start. Rejected: the game's own instructions screen already exists, is reachable by URL and survives a reload.

## Post-beta: Trivia and Math Mayhem move on after the answer locks (handoff 7037561069; acknowledged 7037632425; docs/evidence/quiz-advance/)
- **D-AA-01 A locked answer moves on by itself after a reading time; Next question still works; Stay on this screen keeps it** (owner-directed in the handoff; the 4-second reading time is a provisional, configurable default, not an owner-approved number).
  - **What the trace found (both games, room and solo Math):**
    - Each player goes at their own pace. The server takes answers in any order, and a phone shows its first unanswered question.
    - The locked view (`LockedAnswer`) appears only once the server's projection carries the answer, so it always follows a lock the server confirmed.
    - Its routine Next question tap only cleared a local "just answered" marker. Math's next question then asks the server to open it (`math-open`), which starts its speed clock, and only on a visible page (S3-MTH-01).
    - There is no room-wide step between questions. The room reaches its results when the server finishes the game: everyone answered, its deadline, or a host skip.
  - **What:**
    - **Trivia and Math Mayhem** (room and solo) pass `autoAdvanceMs` (`QUIZ_AUTO_ADVANCE_MS`, 4000 ms) to `LockedAnswer`. A nonfinal locked view counts down ("Next question in 4 s") and then does what Next question did.
    - **The countdown starts on the server-confirmed lock.** It pauses while the page is hidden, and it fires once.
    - **Next question works at once**, as before. Tapping it and the countdown are the same action (clear the marker; show the first unanswered question), so the two cannot add up to two steps.
    - **Stay on this screen** turns the countdown off for the rest of that game (keyed by the game's id, so Play again or a new game counts down again). A status line says so, and Next question then moves on (WCAG 2.2.1, timing adjustable).
    - **Screen readers:** the existing `role="status"` line gains one static sentence ("The next question opens by itself in 4 seconds."). The ticking number is `aria-hidden` and sits in no live region. Stay follows Next question in the tab order.
    - **The final answer** has no countdown and no continuation, as before.
  - **The carry-over guard (found by this slice's regression):**
    - **The finding:** a second tap on Next question landed on an answer of the next Trivia question and locked it. Answers can't be changed once locked. The old manual flow had the same double-tap hazard; solo Math showed it on the base too. A tap just as the countdown runs out is a new way in.
    - **The fix:** for `QUIZ_ARM_MS` (450 ms) after moving on, the next question's answers and Sit this game out are disabled. They look the same (`.mz-slab:disabled` keeps full opacity).
    - **Where:** `useAdvanceGuard` and `QuestionScreen`'s new `arming` prop. Only Trivia and Math use it, and only after a locked view, not on a game's first question.
    - A deliberate answer takes longer than 450 ms. Math is timed from the server's open, so the guard runs mostly during the open's round trip.
  - **Unchanged:**
    - scoring, answer immutability, reveal permissions (the locked view shows the chosen answer, no correctness), the TV and spectator projections;
    - the authoritative deadline and Math's open-then-time rule (the next question opens only when it is shown on a visible page, now after the countdown);
    - Geography (it passes no `autoAdvanceMs` and stays manual; following it is a backlog item), and every other game.
  - **Multiplayer:** moving on is per player, so a slow player keeps their question open. A missing player holds nobody up. Only the server's existing rules move the whole room to its results.
  - **Reconnect during feedback:** a reload drops the local "just answered" marker, and the phone resumes at the next unanswered question. The answer and seat are kept, and nothing is recorded twice. A socket reconnect keeps the component, so the countdown carries on.
  - **The regression:** `scripts/check-quiz-advance.mjs` (new, its own servers, 61 checks).
    - **Solo Math, 320×568:** the countdown and its accessibility; moving on without a tap within 3.5–6.5 s of the lock, with the server not opening the next question during the countdown; hidden-page pause; two taps as it runs out (one step, no answer); Next at once; keyboard (Tab to Next, then Stay; Enter); Stay for the rest of the game; ten questions in order to the results; Play again counts down again.
    - **Room Trivia, host 390×844 + guest 320×568, test-only `MCHEZO_LIFECYCLE_SCALE=0.2`:** the host moves on while the guest keeps question 1; the host's end has no continuation while the room plays on; the guest reloads during the countdown; two taps on Next; the guest stops, and only the server deadline ends the game.
    - **Room Math:** the next question opens after the countdown and is timed from that open; everyone finishes, and the server ends the game.
    - **The result:** on base `ce626a8` it FAILS 22 checks. That includes the double-tap answer in solo Math (the existing hazard). On the fix it passes 61/61.
    - `LockedAnswer.test.tsx` pins the countdown, the sentence, the hidden number, Stay, the stayed line, no countdown on the final answer and solo.
  - **Drivers updated for the new flow:**
    - **Tolerant taps:** the shared `scripts/lib/answer.mjs` and the drivers that tap Next question in a loop. They make the tap with a short timeout, because losing the race to the countdown has the same outcome.
    - **Longer holds** (`check-locked-answer` T, Z and M, and `check-math`'s 3-second linger) first press Stay on this screen, as a slow reader would, and measure that layout too. `check-locked-answer`'s guest reload now asserts that it happens during the countdown.
    - **`check-warm-ivory` W8:** allows the four new locked-view keys, each reusing a style this screen had.
    - **Found by the gates (driver fixes only):**
      - The fixed 12-pass answer loops in `check-mchezo`, `check-reveal`, `check-spectator`, `check-tv-entry`, `check-tv-lifecycle`, `check-tv-spectator` and two screenshot scripts now wait up to 700 ms for an enabled answer. Inside the carry-over guard a pass was wasted (targeted run `20261120-112523-fd9ff395-7559`).
      - `check-answer-race` now counts answer intents by action. With auto-advance, Math's `math-open` for question 2 can fall inside its 3.7 s window on a loaded machine. It is not an answer (full run `20261120-114819-5fb22906-14972`, and a probe recording `submit-math-answer, math-open`).
  - **The Stay choice lasts for the game (review 7040842858, a P2 finding on `9f7ed98`):**
    - **The defect:** `stayedIn` lived in component state, so a reload, recovery or remount (the TV stage and back) dropped it, and the countdown came back although the screen had promised it would not.
    - **The fix:** a shared helper, `apps/web/src/components/mchezo/stayPreference.ts` (`useStayPreference`), used by both Trivia and Math.
      - **What it stores:** one small record in this tab's sessionStorage (`mz_quiz_stay`): `{ v: 1, scope: "room:<id>" | "solo:<id>", seat: "<playerId>", games: { "<gameId>": savedAt } }`. No answers, names, tokens or recovery codes.
      - **Why the room is in the key:** game and player ids are only unique within a room, so the room is part of the scope.
      - **Isolation:** a read for another scope or seat finds nothing and removes the stale record; a write for a new seat replaces it.
      - **Bounds:** at most 8 games, each kept for at most 12 hours.
      - **Cleanup:** it is cleared when this device signs out of a seat and when a solo round is left.
      - **Without storage:** if sessionStorage is unavailable, the record lives in memory for the page, so remounts keep the choice and a reload cannot (without storage the seat itself is not kept either).
      - **New games:** a new game or Play again is a new game instance, so it counts down. A solo reload lands on the instructions and Start begins a new round (D-SR-01), so solo does not resume a stayed round.
    - **The regression:** `check-quiz-advance` section P (P1–P7).
      - It FAILS 9 checks on `9f7ed98`: Trivia reload, the TV stage round trip, Math reload (where question 4 is also opened), and the no-storage round trip.
      - It passes 27/27 on the fix.
      - `stayPreference.test.ts` covers the record, isolation, retention, malformed records and throwing storage (10 tests).
    - **Memory is authoritative after a failed write (review 7042658020, a P2 finding on `cfef39f`):**
      - **The defect:** once an earlier game's record was stored, a later failing write (a full quota) put the new choice in memory, but reads still preferred the older stored record. So the next game's Stay did nothing.
      - **The fix:** `createStayStorage`. After the first failed write, the page's store latches into memory mode, and every read comes from memory, which holds the newest value.
        - The stale persistent copy is removed where possible, so a reload cannot bring back an older choice instead.
        - Later writes are still tried on storage, so when it is writable again the newest value is persisted.
        - Removing (clear, a seat or room switch) acts on both copies.
      - **The regression:**
        - Section P8 (a prior game's Stay stored, then writes fail) FAILS 6 checks on `cfef39f`: choosing Stay took no effect, the countdown ran on and moved the phone on, and the old record stayed.
        - It passes 10/10 on the fix.
        - 6 more unit tests cover the reviewer's cases: a later failure with an old record still readable, a remount, clear and seat/room switches, storage writable again, a failing remove, and storage unavailable from the start.
      - **The same driver edit** reads the countdown text without Playwright's 30 s wait when it is absent, so section P runs in about 100 s instead of about 390 s.
  - **Alternatives:**
    - **A room-wide step after every question.** Rejected: the games are paced per player, and the handoff asks to keep each player's opportunity to answer.
    - **Moving on with no visible countdown.** Rejected: it surprises players, and WCAG 2.2.1 needs a way to stop it.
    - **A longer or shorter reading time.** 4 s is a provisional default in one constant, for the owner to tune.

## Post-beta: getting back from the TV view on a phone (handoff 7044277833; acknowledged 7044287517; docs/evidence/tv-return/)
- **D-TV-01 A TV screen's controls live in a control layer outside its scaled picture, with the way back first** (owner-directed architecture in the handoff; the 900 px breakpoint and the layer's look are provisional, configurable defaults).
  - **What the trace found** (Chromium phone emulation with touch: 320×568, 375×667 and 390×844, base `640d2ee`):
    - **Trivia's TV stage, while playing and at its results:** an ordinary tap or click on Back to phone view timed out; `.mz-tv-outer` (or `.mz-tv`) took the event. The keyboard path worked.
    - **The cause:** `DirectorBar` is styled for a spot inside the 1920×1080 picture (`.mz-director { position: absolute; left/right 72px; bottom 34px }`). `MchezoTvStage` rendered it outside the picture, under no positioned ancestor, so it was placed against the page itself.
      - On a phone it floated over the picture's box and spilled the page sideways to about 788 px.
      - The mobile browser widened the layout viewport to 788 px (the page zoomed out), and the tap's point landed on the picture.
      - The picture's box also filled the whole screen (`min-height: 100dvh`) with the picture only at its top, so the way back sat below the fold anyway.
    - **The TV show** (a room's TV view, before a game and while another game plays): the way back is drawn inside the scaled picture, about 34×9 px at 320 px. It could be tapped, but it is not a usable touch target.
    - **The briefing TV:** an ordinary page; its Back to phone view (167×46) worked.
  - **What (shared, one layer for every TV screen):**
    - **`TVStage`** takes `controls`, rendered right after the picture, in the page's normal flow, outside the scaled canvas and above it in stacking order (`.mz-tv-controls`, `z-index: 1`). The picture can never take its taps, and its buttons keep their real size.
    - **The picture's box with controls:**
      - On a narrow screen (below 900 px) it is the picture's own 16:9 height, so the controls follow right under the picture.
      - On a wider screen the picture keeps its full-screen size, and the controls take any spare band below it. At 1280×800 that is the 80 px band under a 1280×720 picture. On an exactly 16:9 TV the picture still fills the screen and the controls are one scroll below.
    - **`TVControls`** (new, in the design kit): the way back first, as a full-size chip button (at least 48 px tall), then the screen's other controls, wrapping to a phone's width.
    - **Trivia's TV stage** puts its question chips, next line, director bar and watching count in the layer. The director bar flows and wraps there.
    - **The TV show** keeps its director inside the picture on TVs and desktops (the full-screen presentation is unchanged). On a narrow screen its buttons and the way back move to the layer. Only one copy is ever rendered, so test ids and screen readers see one set.
  - **Unchanged:** server authority, scores, reveal privacy, the read-only spectator boundary (a spectator's phone gets the same local-only controls and Stop watching), player state, Stay and auto-advance. There is no server change.
  - **The regression:** `scripts/check-tv-return.mjs` (new, its own server, 218 checks).
    - **Ordinary activation only:** Playwright's own `tap()` (touch) and `click()` (mouse), which scroll into view and refuse when something else would take the event. No force, no synthetic dispatch, no devtools. The keyboard is checked separately and never stands in for the tap.
    - **Phones:** 320×568, 375×667 and 390×844, emulated with touch, in the Everyday and the Christmas look.
    - **Routes:** the TV show before a game; the briefing TV; Trivia while playing (tap and click); Trivia at its results; Math Mayhem live on the TV show.
    - **Each route's checks:** the way back is on the first screen and not covered, at least 44×44, the page has no sideways overflow and is not zoomed out, and no control overlaps the picture or another control. After a normal scroll, an ordinary tap returns.
    - **Returning:** the same room, seat, game and question come back, and the server's state is unchanged (no answer, reveal or host action).
    - **Stay and auto-advance:** with Stay, the next answer after the TV stage still shows the stayed status and holds past the reading time. Without Stay, the next answer counts down and the next question opens by itself.
    - **Desktop and TV (1280×800, 1920×1080):** Trivia's picture keeps its full size, no control overlaps it, and a click returns. The TV show's picture fills the screen with its director inside it.
    - **The result:** on base `640d2ee` (its own worktree and web build) it FAILS 59 checks. That includes the reported tap/click interception on Trivia while playing at all three sizes in both looks, and the same at the results. On the fix it passes 218/218.
  - **`check-warm-ivory` W8:** lists the TV question screen's moved controls as intended: the same elements and colours under new keys (`tv-controls>`, `tv-stage-back>`).
  - **Not claimed:** real devices. This is Chromium emulation; native iPhone and Android checks are separate (H3's native confirmation also remains open).
  - **Alternatives:**
    - Keep the director inside the picture on phones too: at 320 px it would be drawn at a sixth of its size, so its buttons would be far too small to tap.
    - A fixed bottom bar over the picture: it would overlap the picture.
    - Hiding the director on phones, or turning pointer events off on the picture: the handoff rules both out.

## Post-beta: the TV briefing on a phone (handoff 7046501193; acknowledged 7046515024; docs/evidence/briefing-tv-fit/)
- **D-BF-01 The TV briefing's cards fit the width they are given** (a layout repair within the existing design; it is no redesign).
  - **What the trace found** (base `5d5eead`, Chromium phone emulation at 320×568, in both looks, for an invited player on the TV view and for a spectator):
    - The briefing grid (`.mz-brief__tvgrid`) asked for `repeat(auto-fit, minmax(320px, 1fr))`. That is a 320 px minimum track inside about 290 px of content on a 320 px phone.
    - So each card (How to play, Ready and, when shown, Played as teams) was 320 px wide and ran from x=15 to x=335, past the content edge at 305 and the screen's edge at 320.
    - Its right side was clipped. Nothing scrolled, so the page reported no sideways overflow.
    - The top bar and the "You're playing in this game" notice were not in the grid and fit.
    - The TV people list's own tracks (`minmax(220px, 1fr)`) had the same weakness at narrower sizes.
  - **What:** both track minimums are capped at the grid's own width, `minmax(min(320px, 100%), 1fr)` and `minmax(min(220px, 100%), 1fr)`.
    - On a phone each card takes the full width.
    - On a desktop nothing changes: the cards sit side by side, each at least 320 px. At 1280×800 the widths are identical to the base (three cards of 376 px).
  - **Unchanged:** content, the way back (Back to phone view, Back to my phone to get ready, Stop watching), the spectator's read-only view, and the server's briefing and start.
  - **The regression:** `scripts/check-briefing-tv-fit.mjs` (new, its own server, 186 checks).
    - **K:** Know Your Rivals with the night's teams. It has long rules and six players with long names (one a single 32-character word), plus the longest team name allowed (20 characters, one word).
    - **S:** Spectrum, the game with the longest rules.
    - **Views:** an invited player and a spectator, in both looks, at 320×568 and 1280×800 (Spectrum's desktop case is the spectator only).
    - **Checks:**
      - every card lies inside the briefing's content box and the screen, and nothing inside a card spills past its edges;
      - long names are shown in full;
      - the desktop keeps its side-by-side cards;
      - the spectator's only control is Stop watching;
      - an ordinary tap or click on the way back leaves the briefing TV;
      - everyone ready still starts play.
    - **The result:** on `5d5eead` it FAILS 20 checks (every grid card at 320 px, in both games, views and looks). On the fix it passes 186/186.
  - **Not changed (out of scope):** the teams card keeps the TV's large team text (24 px), so a long one-word name wraps mid-word on a phone. It fits; a phone-specific type scale belongs to the broader redesign.
  - **Alternative:** a media query that switches the grid to one column below a breakpoint. The capped minimum does the same at any width with no breakpoint to keep in step, and it leaves wider layouts untouched.

## Post-beta: whose install attempt, in `check-install-builds` (handoff 7052991290; acknowledged 7055587114; docs/evidence/install-builds-ownership/)
- **D-IB-01 The driver follows the install attempt it starts and waits for every other one** (a test repair; no runtime change).
  - **What the trace found** (seven instrumented runs on `618c567`, one reproducing E1's failure):
    - Install attempts the driver does not start are routine.
      - **The browser starts some itself** (no page called `update()`): at the reload in the driver's offline step, shortly after another attempt ends, or right after a deploy.
      - **The app starts others:** its `online` re-check calls `reg.update()` from the open pages.
    - **Attempts run one after another, never at once.**
    - **E1's leftover candidate** belonged to a browser-started attempt that was still installing when the driver read the cache names. It then failed and deleted its own candidate.
    - **In E2,** the driver often followed an attempt the app had started, and the storage-full override was lifted while more attempts could follow.
    - **No failed attempt left a candidate behind,** so the trace points to no production lifecycle defect.
  - **What** (`scripts/check-install-builds.mjs` only):
    - `settle()` waits until no attempt is in flight and none has started for 1 s.
    - `ownUpdate()` settles, deploys, follows the new worker its own update starts (never one already in flight), then settles again. It reports the end state of every other attempt.
    - **E1** adds a deterministic second attempt from the other tab, right after W's failed install. It must start and fail, and then no candidate may be left.
    - **E2** applies the storage-full override before the deploy and keeps it until every attempt has ended.
    - **E3 to E5** use `ownUpdate()`.
    - All earlier assertions are kept. "No candidate is left" now covers every attempt, not only the driver's.
  - **The evidence:**
    - **Negative control** (the old driver plus only the second attempt): 5 of 6 runs fail with the reported E1 message.
    - **The repaired driver:** 12/12 passes, three at a time, on the tested SHA.
  - **Alternatives:**
    - Matching candidate names to attempts, through the creation time in each name. This is fragile, and it would still leave E2 observing other attempts.
    - Turning off the app's `online` re-check or the browser's update checks in the test. That would test less than the product does.
    - Retrying the check. The gate never retries, and a retry would hide the cause.
  - **Addendum (review 7057502077): the second-tab watch is bounded.**
    - It has one 15 s deadline, removes its listeners on completion, timeout or cancel, and always ends with a named outcome.
    - E1 cancels it when the driver's own update starts no attempt.
    - Driver-side deadlines (`within()`) bound every in-page wait.
    - Two fault modes (`MCHEZO_INSTALL_BUILDS_FAULT`, regression only) drive the new `scripts/check-install-builds-no-worker.mjs`. For each mode, the run must exit 1 by itself, fail E1 by name, reach its summary, leave no process behind and leave an empty temp directory.
    - **Alternative:** a single overall time limit on the driver. It would end a hung run, but without naming what was missing and without reaching `finally`.

## Post-beta: Jebena Rush categories change during successful play (handoff 7057753827; acknowledged 7057757959; docs/evidence/jebena-category-cadence/)
- **D-JR-01 A category also ends after a seeded run of 5 to 8 accepted answers** (rules version 2; amends D-S91-03).
  - **Why:** Keku reported that categories feel stuck through successful turns.
    - The server changed the category only on a timeout or a used-up bank, and every bank holds 40 or more answers.
    - So sustained correct play kept one category all match. On `af79b67`, a seeded test played 16 accepted answers in one category, and a browser run 14.
  - **What** (`src/games/modules/jebena.ts`):
    - **The length:** `jebenaStreakLength(seed, categoryRound)` gives 5 to 8 (`JEBENA_STREAK`), from the match's server-owned seed. It is set when a category starts and saved in the state as `streak: { accepted, changeAfter }`.
    - **The change:** after the streak's last accepted answer, the next category in the existing seeded rotation starts at the turn boundary, with the pass. It is logged with reason `streak` for the turn that starts with it.
    - **No match end:** a streak never ends the match. With no other category left, the current one stays.
    - **What counts:** only accepted answers. Rejected tries, out-of-turn, stale and duplicate sends, and reconnects change nothing.
    - **Timeouts and used-up banks** work as before, with reasons `timeout` and `used-up`, and restart the count.
    - **Unchanged:** used answers, cups, the turn clock and points. The bank stays private, and the count is never shown.
    - **Rules version 1 matches** saved before the change keep version 1.
  - **The cadence is a provisional default:**
    - **Why 5 to 8:** it is long enough for a few players each to answer, and short enough that a correct streak never stays on one category for long. Two players see a change every 3 or 4 turns each.
    - **Why seeded:** a seeded length keeps the change from being predictable.
    - **Configurable:** `JEBENA_STREAK`.
  - **Alternatives:**
    1. A fixed length, for example every 6 answers. It is predictable, so players can count to it.
    2. A change on every pass. It is too busy, and nobody builds on a category.
    3. A timer instead of a count. It would change the category mid-turn, against the turn boundary.
    4. A schedule computed at start and stored as a list. It is the same result with more state, and the per-round length is derived the same way.
  - **Scoring (no change):** the reported 120-0 is the existing rule (100 per player outlasted, 10 per cup kept while in). In two-player play the player who goes out always scores 0, however many answers they named. A change to the rule or its presentation is left for a separate decision.
- **D-JR-02 After a category change, the last-play line names the category the answer was given in** (review 7058749487; presentation only).
  - **Why:** right after a streak changed the category, "Keku named “Boxing”." sat under the new category's heading, so the answer seemed to belong to it.
  - **What:**
    - **The public view** gives each accepted log entry its own category's public name (`categoryName`). It is worked out when the view is built, so older saved matches get it too. Only played categories are in the log, so nothing of an unused bank is added. The saved state is unchanged.
    - **`lastPlayLine`** takes the category on screen:
      - the same category: the plain line, unchanged;
      - another category: "Keku named “Boxing” in Sports.";
      - another category whose name is unknown: "…, before the category changed.", never a raw id or a guessed label.
    - **Surfaces:** the watching and out phone screens, the live TV and the TV final. The holder's turn screen has no last-play line, before and after.
    - **No change** to scoring, the cadence or the turn clock.
  - **Alternatives:**
    1. Add the category to every line, also within a category. It is longer every turn, for a case that only follows a change.
    2. Hide the last-play line for the first turn after a change. The answer that ended the streak would go unmentioned.
    3. Name the category on the client from its own copy of the banks. The client would need the category list, and old or unknown ids would need a second fallback; the server already has the public names.
- **D-JR-03 A briefing describes the rules frozen in its match** (review 7058937812).
  - **Why:** a Jebena Rush match saved under rules version 1 keeps version 1 when it is recovered (no streak changes). Its briefing still showed today's 5-to-8 sentence on the phone and the TV, because the briefing copy was one fixed table per game and the briefing projection carried no version.
  - **What:**
    - **The module hook:** modules may expose `rulesVersion(state)`, the version frozen at creation. Jebena Rush does.
    - **The projection:** a briefing gives that number (`rulesVersion`) to every audience. It is a public rule, like a game's settings; nothing else of the state joins it.
    - **The copy:** `briefingRules` takes the version. Version 1 gets the steps those matches were briefed with. Version 2, a missing version and an unknown one get today's rules.
    - **Both surfaces:** the phone and TV briefings pass the match's version.
    - **Unchanged:** gameplay, scoring, clocks, the cadence and the last-play line.
    - **The secrecy test** (D3 S5) allows exactly the `rulesVersion` key name, and checks its value against the match.
  - **Alternatives:**
    1. Send a cadence flag (`streakChanges: true`) instead of the version. It is narrower now, but each later rules change would need another flag; the version already exists in the state.
    2. Migrate version 1 matches to version 2 on recovery. That changes the rules of a match in progress, against D-JR-01.
    3. Keep one copy that covers both ("a new category may start after a run of right answers"). It is vague for new matches and still wrong for old ones.
- **D-JR-04 Jebena Rush results say how each total was earned, with answers shown apart** (handoff 7059278886; presentation only).
  - **Why:**
    - In the verified two-player example, 120–0 read as a rout: a bare total sat next to "9 answers".
    - The points rule (D-S91-04, cups since D-S101-01; unchanged) rewards outlasting players and keeping cups. Accepted answers keep a player in the game but add no points.
    - Nothing on the results said this.
  - **What:**
    - **The server's standings** give each row `outlasted`: the players out before this one. It comes from the same helper as the total, so with `hearts` it always makes `points` (outlasted × 100 + hearts × 10). It is a public fact, derived from what every audience already sees (places, outs, cups).
    - **Every results surface** shows, under each row:
      - the parts, such as "Outlasted 1 player (100) + 2 whole cups (20) = 120";
      - apart from them, "Played: 9 answers · 5 timeouts".
      - The surfaces are the phone results, the TV's final standings and the TV's post-game review, all one shared list.
    - **The total stays the server's.** A row whose parts are missing (an older server) or don't add up shows only the total, never a wrong sum.
    - **The footer** adds "Right answers keep you in the game; they don't add points." before the unchanged casual or practice label.
    - **The TV** keeps two lines per row, so the standings still fit the stage.
    - **Unchanged:** the rule, totals, places, `rawScores`, replay and the casual/practice wording.
  - **Alternatives:**
    1. Change the scoring so accepted answers earn points. That is a rules change, and it stays a separate owner decision. This only explains the current rule.
    2. Work the parts out in the browser from places and cups. That repeats the server's rule in a second place, where it could drift. It also can't tell an early leaver from a player knocked out at the same time without more of the state.
    3. Show only the footer's rule. Players would still have to do the sum, and the 120–0 would still read as unexplained.

## Post-beta: compact UI options for owner selection (handoff 7060711859; acknowledged 7060716374; docs/design/compact-options/)
- **D-UI-01 Two compact UI options are proposed in isolated mockups; Option A is recommended, and the owner selects** (proposal only; the app is unchanged).
  - **Why:**
    - Keku reported crowded screens and an oversized host/join area.
    - On `f263362`, measured at 320 × 568:
      - the home's fixed host/join dock is 131 px and its featured card 163 px;
      - the lobby's own setting (cups each) starts at about 1030 px, below the first screen, behind a 183 px dock;
      - the picker shows 2 whole games;
      - the Jebena results put the explained standings at 802 px.
    - The handoff asks for two concrete options before any broad redesign, so the choice is the owner's.
  - **What:**
    - Two static mockups (`mockups/option-a.html`, `mockups/option-b.html`) on one shared scale (`mockups/shared.css`):
      - spacing 4/8/12/16/24 px;
      - type 13/15/17/20/24 px;
      - 44 px controls, 48 px primaries;
      - the app's own colour tokens for both looks;
      - the existing circle-and-dots mark.
    - **Option A · Compact list:** rows with 44 px art, the host/join entry at the top (94 px), the settings inside the Up next card, a short dock, and results that lead with the explained standings.
    - **Option B · Focus and sheets:** a one-line code entry, a stage card with settings as chips and an avatar stack, a tile picker, and a results podium with secondary actions under More….
    - **The recommendation is A.** It puts the host's main controls on the first screen at 320 px with no extra taps, carries long names and "practice only" in full, and rearranges controls the app already has.
    - **The capture:**
      - `capture-before.mjs` captures the current app from one real room.
      - `render.mjs --content` renders both options with that room's code and result, so before and after show the same content.
      - The same script checks overflow, 44 px targets, WCAG contrast, keyboard order and focus rings, and fonts.
    - **Unchanged:** scoring, replay, role permissions and the casual/practice distinctions. Each option repeats the same rule, totals, places, mode labels and practice-only labels.
  - **Alternatives:**
    1. Implement Option A directly. That skips the owner's selection, which the handoff requires before any broad redesign.
    2. Mock up inside the app behind a flag. That touches production code for a proposal, and the mockups would inherit app state and gates the owner doesn't need to review.
    3. One option with variants. The handoff asks for two distinct options; two let the owner compare density against focus.
- **D-UI-02 The owner-selected compact mix: Option A's Home, the circle plus Option B's card, chips and sheet in the Lobby, and Option B's podium results with More…; two palette treatments compared, defaults unchanged** (handoff 7065498313; stacked on the proposal head `9992014`).
  - **Why:**
    - Keku confirmed the mix, released the implementation hold from the proposal review (7061462484), and asked to explore the colours before any default changes.
    - Scope: Home, Lobby and Jebena Rush results, plus the shared styles they need. Host/join, readiness, role permissions, replay, casual/practice behaviour and the TV QR code are preserved.
  - **What:**
    - **Home (Option A, compact list).**
      - Join and Host sit in the page under the header, with more room above and between them. They are no longer pinned in a dock.
      - Games are 64 px rows with 48 px art, in one rounded list (two columns from 720 px). Featured comes first.
      - `check-lobby-mode`'s Home checks now test this design: Join and Host on the first screen (and a game too, from 600 px tall); every row readable at every scroll position; nothing runs off the side; the lowest row reachable.
    - **Lobby.**
      - The seat circle is unchanged and is the only player display.
      - Below it is one next-game card: cover, title, facts, Change.
      - The card's facts are chips: the mode (read-only), the cups and the content (the host's are 44 px buttons that open one "Next game settings" sheet; guests' are labels), and the fit.
      - The night's other activities (Quick Party, Teams, Family Questions) are grouped under "More for tonight".
      - The Start dock is unchanged.
      - A Cup room's Official/Practice choice stays inline, not behind a chip: it is the game mode, which must stay easy to find, and about 12 drivers rely on it.
    - **Jebena Rush results (Option B).**
      - A tighter result card: the casual quip and the winners list are hidden, because the podium names the winners; your own line stays.
      - Then the podium: 2nd, 1st, 3rd. It shows the server's places and points as given; a tie at the top raises every 1st place; full names are clamped to two lines.
      - Then the explained standings (unchanged), Save a memory (inline, unchanged) and the outcome.
      - One dock: the host's single main action (Play again, or Next game or Resume when a lineup or break applies) plus More… (a sheet with Pick another game, Take a break, Plan another lineup when complete, and Back to lobby). Guests get who picks next and Back to lobby.
      - Every other game's results keep the What's next panel.
    - **Join.**
      - A refusal ("Room not found for that code") now shows directly under Join the game, and a new refusal is scrolled into view once.
      - On `9992014` at 320 × 568 it rendered below the fold, at the end of the screen. This is the one change outside the three surfaces; the handoff asked to verify room-code errors.
    - **Accessibility.**
      - Each chip button's name starts with what it shows ("3 cups each, change").
      - Sheets keep focus inside and return it to the opener.
      - Focus rings are measured at 3:1 or better.
      - Primary targets are 48 px and settable chips 44 px.
    - **Colour exploration.**
      - The tools are `docs/design/compact-mix/palettes.mjs`, `capture-palettes.mjs` and `compare-palettes.mjs`.
      - Three palettes are shot on the same live room and layouts: the current palette (reference), T1 (lighter, warmer Everyday surfaces) and T2 (a different accent balance).
      - Contrast is checked at token level (23 pairs per look) and as rendered.
      - Treatments are injected into the screenshot browser only; `tokens.ts` is unchanged.
    - **Tests.**
      - `CompactMix.test.tsx`: podium order, ties and early exit; dock variants.
      - New `check-compact-mix` driver.
      - Updated drivers: `check-lobby-mode`, `check-one-path`, `check-casual`, `check-jebena-rush`, `check-themes-seasonal`.
      - `check-warm-ivory` W8: the Everyday style baseline was re-recorded for this intended Everyday layout change. Only the Home, Lobby, guest Lobby and menu-over-Lobby records were replaced (diff in the PR); every other screen's recorded styles are byte-identical to `d4dc408`.
      - Hidden text (the chips' ", change" and the results dock's heading) uses `mz-sr`, the app's visually hidden class that the layout checks already recognise (`414e3d4`; the targeted gate on `7eddbd4` flagged `mz-sr-only` as clipped text).
  - **Alternatives:**
    1. Put the Cup mode (Official/Practice) behind a chip as well. Rejected: the game mode must stay easy to find, and it would churn about 12 drivers for no gain.
    2. Keep a pinned Join/Host dock on Home. Rejected: the owner selected Option A's in-page entry; a pinned dock took 131 of 568 px.
    3. Move the night's other activities into sheets. Rejected: that hides lineup and teams state behind taps.
    4. Put Save a memory under More…. Rejected: its inline composer, pending state and focus handling (S10.4) would need rework.
    5. Make a treatment the default now. Rejected: the owner asked to see the side-by-sides and a recommendation first.
