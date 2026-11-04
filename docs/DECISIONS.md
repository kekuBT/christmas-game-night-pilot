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
