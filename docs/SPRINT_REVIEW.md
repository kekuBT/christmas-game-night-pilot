# Product Completion Sprint — Visual Review Package

Local release candidate, built from the PR #3 review fixes. All screenshots are
real Chromium renders at 390×844 (iPhone-sized), taken with
`scripts/screenshot-sprint.mjs` from a local server with fictional players
(Alex, Sam, Jo, Kim). Screenshots live in `docs/sprint-screenshots/` and are
local-only: they are PNGs, so they cannot be pushed through the GitHub
snapshot route (UTF-8 text only).

## What the experience is now

- **Landing and joining:** no account, name + 6-character code, or scan a QR
  code from the lobby. The code is also shown as text (manual fallback).
- **Lobby:** roster with host 👑 / cohost ⭐ / away markers, QR invite, and
  all 11 games with tutorials and official/practice starts (host or cohost).
- **Games:** one question/input at a time, with the player's own answers and
  scores only. Impostor, Caption Clash, Trivia, and Geography are shown
  playing in the screenshots; all 11 finish in the browser E2E sweep.
- **Championship:** server-computed, clearly labelled provisional rules
  (midrank per game, 75% solo + 25% team per day, best three days, at least
  three valid days to qualify). Practice and timed-out games never count.
- **Ceremony and achievements:** end-of-day winner card and ledger-derived
  achievements (e.g. First Game Finished, Perfect Math Mayhem).
- **Host overrides:** host/cohost can correct a finished game's score with a
  required reason; the old value, new value, reason, and actor stay in the
  room ledger and are shown as an audit trail to all players.
- **TV Hub:** public only — code, roster, standings, now-playing, recent
  games, ceremony winner. No answer keys, words, or prompts.
- **Memory Book:** entries cite a real game-finished event, facts are
  derived from the ledger, and only approved entries export — as markdown,
  PDF, or a share image.

## Screenshots (docs/sprint-screenshots/)

1. `01-landing-joining.png` — landing and room joining
2. `02-lobby.png` — lobby with QR invite and roster
3. `03-impostor.png` — Impostor playing
4. `04-caption-clash.png` — Caption Clash playing
5. `05-trivia.png` — Trivia playing
6. `06-geography.png` — Geography playing
7. `07-championship.png` — championship leaderboard
8. `08-tv-hub.png` — TV Hub
9. `09-memory-book.png` — Christmas Memory Book
10. `10-winner-ceremony.png` — winner ceremony (championship view, ceremony section)

## Verified in this sprint (local, evidence in docs/PROGRESS.md)

- 138 unit/integration tests pass (was 56), plus E2E Chromium 12/12 and
  Firefox 12/12, multiplayer 12/12, F4 11/11, F5 30/30, mobile 32/32,
  contrast 57/57 WCAG AA.
- WebSocket session tokens moved out of the URL into the subprotocol
  header; a URL-only token is now rejected (1008). Tokens still live in
  sessionStorage per tab — server-side impersonation is fixed, browser-tab
  theft is not (documented in docs/DECISIONS.md, decision L18).
- Disconnected players no longer block a game: connected players can finish
  it, and the disconnected player's partial score stands.
- Test count is 138, not yet the 200–300 target. The remaining gap is
  breadth, not a known defect: more per-game edge cases and HTTP matrix
  cases are the next test batch, not filler assertions.

## Update 2026-11-04 (after the GitHub push)

This document was written while the sprint was local-only. It is now
superseded in two respects, and this note reconciles it with the branch:

- The sprint **was** pushed to GitHub on Keku's explicit approval at
  ~08:20 EST, as commit `2e818f264c46e618127dbaf7f9c2e0ffa81c32c3` on
  `development/first-playable-checkpoint` (PR #3, draft, unmerged).
  The "local-only" and "branch still holds 853704b" statements below
  were true at write time and are no longer true.
- The championship rules below were provisional at write time. They were
  then **owner-approved on 2026-11-04** as the Family Cup rules (best
  three days, participation bonus, finale bonus) — see
  `docs/CHAMPIONSHIP_RULES.md`. Three details remain configurable, not
  approved: the qualifying-day threshold, teamless-day handling, and the
  finale ladder.
- Every future GitHub push still requires Keku's explicit per-checkpoint
  approval; no push is implied by this document or by the sprint itself.

## Remaining gaps (not hidden)

- Real iPhone Safari, Android, desktop Safari, and a real TV: NOT RUN (needs
  real devices). WebKit in this VM is still blocked on missing host libraries.
- Family-member acceptance test (no developer tools): NOT RUN (needs a family member).
- Cloudflare Workers/Durable Objects/D1: UNTESTED-CLOUD, unprovisioned.
- `npm audit`: still blocked by the registry proxy 403.
- Championship formula, Geography modes, Grand Finale, host recovery, AI
  scope, and photo policy: still provisional / owner decisions, unchanged.
- Per-game abstention semantics (beyond late-rejection + host skip): open
  refinement, not silently implemented.

## What Keku needs to approve

1. **Nothing in this sprint is merged, deployed, or spent.** It was
   published to the PR branch only after Keku's explicit approval at
   ~08:20 EST (commit 2e818f2); see the update note above.
2. Approve (or not) pushing this sprint as a new snapshot to PR #3 for
   ChatGPT re-review.
3. Decide the provisional championship rules, or keep them provisional.
4. Run the real-device checklist and the family-member acceptance test when
   devices and a family member are available.
