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
