# Architecture — Christmas Game Night (DRAFT, not published as final)

Status: Local draft prepared by Muse in response to Issue #2, ChatGPT comment 6622099490.
Do not treat unverified assumptions as facts. No app code, no merge, no deployment, no spending.
Companion draft: docs/DECISIONS.md (decision IDs D01–D15). Batch publication to GitHub is subject to Keku's write approval.

## Unverified assumptions — read first
- [UNVERIFIED] Cloudflare Workers / Durable Objects / D1 free-tier limits, pricing, storage, alarms, and WebSocket hibernation behaviour. Cloudflare is a candidate, not a guaranteed $0 solution, until current official limits are recorded in DECISIONS.md D01.
- [UNVERIFIED] Real iPhone Safari suspension / reconnect behaviour. Playwright WebKit is not a substitute for a real-device test.
- [UNVERIFIED] Gemini Flash or any other AI provider's free-tier terms, rate limits, and data handling for family content. AI is deferred, not a launch dependency.
- [UNVERIFIED] Durable Object room persistence across a 7-day championship, including idle expiry and storage growth.
- [UNVERIFIED] Content sources, licensing, and moderation for Trivia, Geography, Who Said That?, and Caption Clash.
- [ASSUMED, to confirm] Private room, 4–10 players, no mandatory accounts. Identity will therefore be weaker than account-based identity, and host approval is the recovery mechanism.
- [ASSUMED, to confirm] TV is a separate public client, not a player device with private state.

## System overview
- Client: React + TypeScript + Vite + Tailwind. iPhone Safari first, Android Chrome, desktop, and TV supported.
- Realtime server: Cloudflare Workers + one Durable Object per room (candidate, see unverified assumptions).
- Durable store: D1 for checkpoints, championship records, and audit exports.
- Validation: Zod at every server boundary. Client input is an intent, never a fact.
- Tests: Vitest for rules, scoring, projections, and reducers; Playwright for end-to-end flows, including WebKit.

## Data flow
1. Client sends an intent over WebSocket with a clientEventId.
2. The room Durable Object validates phase, player, role, timer, and payload.
3. The event is appended to an append-only log, then applied by a reducer.
4. Score totals are derived from the log, never hand-edited.
5. The server broadcasts filtered projections: a per-player view, and a separate public TV view.
6. The client receives an ack with a server event ID. A duplicate clientEventId returns the original ack with no double score.

## Source of truth
1. Durable Object per room — live source of truth, event log, and SQLite snapshot.
2. D1 — checkpoint / championship / audit store, written at phase and day boundaries, not per tick.
3. Clients — projections only.

If D1 and the Durable Object disagree, the Durable Object event log wins for the live game, and the disagreement is logged as an incident. There is no assumed atomic transaction across the two stores.

## Checkpoint and reconciliation (D03)
- Every checkpoint has: checkpointId, source event range (first and last server event ID), snapshot hash, and timestamp.
- D1 checkpoint writes are idempotent by checkpointId and are retried on failure.
- Recovery: load the latest Durable Object snapshot, replay events after it, then reconcile with D1. A duplicate checkpoint is a no-op. A missing checkpoint range is an incident, not a silent overwrite.
- This design is practical because reconciliation is a defined, testable operation (checkpointId + event range + hash), not a hope that two stores stay in sync automatically. It is not free: it needs tests for retry, duplicate, and disagreement cases in the M1 PoC.

## Timers and hibernation (D04)
- Persist server deadlines, not a running timer.
- Remaining time = deadline − server now, recomputed on every wake and every broadcast.
- On hibernation wake, recompute from the persisted deadline. Do not resume a stale countdown.
- Timers, phase transitions, and host timeouts must all be expressible as deadlines, or they are not hibernation-safe.

## Reconnect and identity (D05)
- Player slot: playerId + deviceId + opaque recovery token, hashed server-side, scoped to room + player, with an expiry to be decided by Keku.
- On reconnect: verify the token, send the full current projection for that player, replay missed public events, and restore private state only for that player.
- New device without a token: treat as a new slot request for host approval, not an automatic takeover.
- Reconnection and host authority are separately authenticated. QR join tokens and host tokens are separate.

## Host recovery (D05, owner decisions pending)
- Room state includes an explicitly designated cohost list.
- Draft rule (not final): a designated cohost may perform operational host actions during a host disconnect, with no automatic transfer of ultimate ownership. If no cohost is present, pause host-dependent phases while preserving timers/state under a defined policy.
- Exact cohost permissions, timeout, and new-device handling need Keku's decision and must be recorded in DECISIONS.md before implementation.

## Game module contract (draft)
Each game must implement, in code and in tests, when it is eventually approved:
- id, display name, player count range, solo/team mode
- phases, setup (content pack, seed, config), validated actions
- state split into public and private slices, with a projection filter
- scoring function, timer rules, end conditions
- tutorial / example, practice mode flag where appropriate
- test cases: happy path, edge cases, late answers, duplicates, and cheating attempts

No game may write directly to the score ledger except through the Durable Object event reducer.

## Championship scoring — daily normalized scoring (D09, draft assessment)
- Official game: a completed scheduled game with recorded participants and no unresolved scoring dispute.
- Valid player-day: participation in at least one official game that day.
- Day score: a normalized percentage or rank-derived value per game, then combined per day, not raw game points. This prevents playing more games from automatically winning, but only if the denominator per game is defined.
- Daily solo and team components combine 75/25 at the daily-score level when both exist. Days with only one category need an explicit rule — for example, treat the missing category as absent (not zero) with a stated effect, or require a minimum category mix for a day to count. This is not settled and needs worked examples from ChatGPT for Keku approval.
- Championship: best five valid daily scores, at least three valid days to qualify.
- Tie-breaks (draft): more first-place daily finishes, then higher median counted-day score, then shared placement.
- Team fairness: team points must reflect team result fairly for all members, avoiding team-size amplification. The exact team-point formula needs a worked example showing different team sizes.
- Assessment: daily normalized scoring is practical, but only with a defined per-game denominator, a single-category rule, and worked examples. Without those, two reasonable implementations can produce different champions from the same games.

## TV Hub and Memory Book
- TV Hub: read-only public client, subscribed only to the public projection. Standings, presence, next game, QR, results, and approved highlights. Game takeover and return to Hub are driven by authoritative room state, not a separate TV timer.
- Memory Book: chapters, highlights, and photos derived from the actual event log and host-approved items only. No fabricated results. Export should be client-side where possible to keep $0. Photo consent, storage, and size limits are open decisions (D15).

## AI integration (deferred, D13)
- Optional AI is in the product vision only, deferred until after core games and reliability, with no launch dependency.
- Deterministic offline packs first.
- Any eventual AI pack must be host-reviewed before use. Private family content must not be sent to a third party without explicit consent and verified terms.
- AI has no authority over scoring, timers, secrets, or roles. That is enforced in server validation, not in prompts.

## Testing strategy
- Vitest: game rules, scoring, normalization, projections, reducers, checkpoint reconciliation, timer derivation.
- Playwright: end-to-end room, join, game, scoring, TV, and reconnect flows, including WebKit.
- Real-device: iPhone Safari suspension/reconnect, Android Chrome, desktop, and TV — required before M1 is considered passed, not optional.
- Payload tests: assert the actual broadcast payload for a TV client and for a non-role player contains no hidden role, answer, or unrevealed score.

## Milestones (summary, see MILESTONES.md when drafted)
- M0: Spec and cost validation, documentation only.
- M1: Networking / reconnect PoC — future approved task only, not now. Must prove hibernation, timer survival, reconnect, projection isolation, and idempotent scoring, or report failure and a fallback.
- M2: Foundation + first deterministic game.
- M3: Remaining games + championship ledger (moved earlier to avoid retrofitting event capture/scoring).
- M4: TV Hub / Memory Book.
- M5: Accessibility, device, and release audit, including a $0 audit of every external service.

---
Next update: After ChatGPT's reply to Muse's Issue #2 assessment, and after the Cloudflare limits and worked championship examples are recorded, the unverified assumptions above should be updated to verified limits or to a changed architecture, with dates and links.
