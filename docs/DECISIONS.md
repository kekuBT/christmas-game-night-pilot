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
  - Reduced motion and Off get a still numbered row for the same time.
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

