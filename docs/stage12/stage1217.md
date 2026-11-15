# Stage 12.17: Team Draw content readiness

**Authorization:** the owner's review and handoff on #41, comment 6896200767 (2026-11-15, 9:36 a.m. ET; D-WF-01).
- It cleared Stage 12.16-R on `06bebdc` (head `1955c28`). That is engineering clearance only: not a merge, a deployment or editorial approval.
- It named this bounded milestone.

**Branch:** `claude/stage12-17-team-draw-content`, from #41's head `1955c28`. It goes in one stacked, unmerged draft PR linking #41 and #5.

## What exists now
- **The prompts:** `src/games/modules/packs/draw-prompts.ts` holds 70 drawing prompts (`dg-001`…`dg-070`): a word, optional accepted alternatives, and an optional `season: "christmas"`. They have no difficulty and no review status. Draw & Guess (Practice-only) and Team Draw (Official-eligible since Stage 12.15) both deal from them.
- **The dealing:** `drawPromptsFor(season, rng, avoid)` in `draw.ts`.
  - **A Family Cup** (no session season): every prompt, Christmas ones included.
  - **Everyday:** year-round prompts only.
  - **Christmas:** Christmas prompts first, then year-round.
  - Each part is shuffled, with this room's unplayed prompts first.
- **The shared history:** both modules declare `contentPool: "draw-prompts"`, so `playedContentIds` gives each new game the ids every earlier game of either kind dealt. Draw & Guess counts a swapped-in prompt as dealt (its `contentIds` covers the reserve it used).
- **Team Draw's rounds:** `teamDrawRoundCount` sets 3 to 5, from the biggest team in the final roster. Team Draw deals that many prompts at init.
- **The gap:** an Official Team Draw game in a Family Cup deals unreviewed prompts, because nothing in the content library knows about them.

## Plan
1. **One canonical prompt pool in the content library:**
   - **The pack:** content id `draw-prompts`, a pool rather than a game, as `trivia` is for Team Huddle. The 70 prompts move unchanged (ids, words, alternatives, seasons) into `content/packs/draw-prompts.json`. They are generated from the TypeScript list, and a test pins them to its fingerprint.
   - **Changed during the work:** one pack, not the two (Everyday and Christmas) planned. Every game deals by shuffling the list's own order with its seed, and the Christmas prompts sit among the year-round ones (`dg-002`…`dg-004`). One pack in that order keeps every seed dealing exactly as before; two packs would have changed the order.
   - **The shared fields:** `difficulty` 2 (a placeholder; the list has none), a category, `source: original-creative`, `review.status: provisional`, `eligibility: official`.
   - **The adapter:** a typed server-side one gives both modules the same prompt objects, so the pool is never cloned. The modules get their prompts through `init`, as Split Clues does.
2. **Official Team Draw needs record-only approval:**
   - **The policy:** `draw-prompts` joins `RECORD_ONLY_APPROVAL` (D-S1216R-01). Only an exact-hash record approves a prompt; raw labels, missing, revoked or stale records never do, and rejected stays rejected.
   - **The count:** an Official start needs as many eligible prompts as the game has rounds. Rounds are computed from the final team roster (3 to 5) with the existing function, and the prompts must be unused in this Cup.
   - **Enforcement:** the count is checked in the Cup projection (`officialContent["team-draw"]`, for the lobby and the shared plan), at the server's start, and again at the briefing-to-play re-check.
   - **A shortage:** it gets a specific reason and the Practice choice. The game is never shortened, switched to Practice silently, or filled with unapproved prompts.
3. **Practice and casual are unchanged:**
   - **What they deal:** Practice and casual Team Draw, and Draw & Guess, keep dealing every non-rejected prompt, with the existing season and ordering rules.
   - **Draw & Guess:** it stays Practice-only.
   - **The season rule in a Cup** (to be decided: D-S1217-03): Team Draw in a Cup has always dealt every prompt, Christmas ones included. Unlike Split Clues, keeping that means approved Christmas prompts count toward an Official game. I'll keep it, as the existing rule, and flag it for the owner.
4. **History:**
   - **What counts as used:** prompts already dealt by either game, swaps included, as Stage 12.16 does for Split Clues. Official usage is recorded when play begins.
   - **Freezing:** the chosen ids and hashes are frozen at the briefing and re-checked at play. Running games keep their own copy.
5. **Unchanged:** secrecy (only the current drawer sees the word; guessers see only their own team's drawing; the TV and other teams see the public view until the reveal), the UI, scoring, draw timing, pen handoff and takeover.
6. **The inventory:** `docs/stage12/stage1217-draw-prompts-inventory.md`, generated from the library. Per prompt: id, season, word, accepted alternatives, approval hash and record, and concise flags for ambiguity, drawability and missing alternatives. Unclear words stay provisional; no approvals and no source claims.
7. **Tests:**
   - **Approvals:** exact, missing, stale, revoked and rejected records; raw labels.
   - **The count:** real three- and five-round thresholds, using real team rosters.
   - **History:** across both games, including Draw & Guess swaps.
   - **Seasons:** year-round vs Christmas in a Cup and in casual rooms.
   - **Briefing:** a change or refusal between the briefing and play leaves no score or usage change.
   - **Running games:** frozen.
   - **Privacy and Practice:** guest/TV secrecy, and Practice still works.
8. **The browser check** (two servers of its own, no content test mode, cleanup as in R2):
   - **Shipped content:** Official is disabled in the Cup lobby with the reason, and the host, a guest and the TV agree; one complete Practice game.
   - **An isolated fixture approving enough prompts:** an Official game with drawer/guesser privacy, a reload, a takeover, results, and what's next.

   Screenshots at phone size, desktop and TV. Regression: `check-draw-guess`, `check-draw-sync`, `check-team-draw`.
9. **Gates:** focused tests; content check, typechecks, lint; the affected drivers; the fast gate; then one full gate at the stable checkpoint, for the shared prompt and history change. CPU-heavy unit phases won't overlap. Then a new completed report.

**Out of scope:** Know Your Rivals content, other packs, new games, real approvals, paid services, public ports and deployment.

## Estimate (written before the work, at 9:40 a.m. ET)
About **7 h 30 min**.

| Part | Estimate |
|---|---|
| Branch, spec, draft PR, acknowledgement | 30 min |
| Library pool and adapter; both modules; Official selection, count gate, projection, freezing, history | 2 h |
| Focused tests | 1 h 15 min |
| Inventory and flags for 70 prompts | 45 min |
| Browser check (two servers, Practice and fixture Official with drawing), screenshots | 1 h 30 min |
| Gates (targeted, fast, one full), docs, report | 1 h 30 min |

**Risk:**
- The shared history touches Draw & Guess as well.
- Drivers that play Official Team Draw rely on the gate's test mode, which labels its records truthfully, so they should keep working.
- A gate can fail on something else in the stack.

## Estimate vs actual
- **Estimated:** about 7 h 30 min, written at 9:39 a.m. ET.
- **Actual:** about 2 h 15 min, from 9:39 a.m. to 11:55 a.m. ET. About 1 h 25 min of that was the two full gates (41 min each), and about 15 min was diagnosing and fixing the driver race the first full gate found.
- **Why the estimate was high:** Stage 12.16 had built the machinery this stage reused (record-only approval, the projection, freezing, the driver's cleanup pattern), and the prompt list moved without changes. The estimate didn't discount for that reuse.

