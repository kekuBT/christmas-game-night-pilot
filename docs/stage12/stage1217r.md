# Stage 12.17-R: a drawing game never starts without a playable prompt for every turn

**Review:** the owner's review on #42, comment 6898755998 (2026-11-15; D-WF-01), finding R1. Same branch and PR (#42), stacked on #41's `1955c28`. It was queued behind Beta R1 (#43) as the review asked, and nothing from #42 enters the beta candidate. Nothing is merged or deployed, and no prompt is approved.

## The defect (reproduced by the reviewer on `0ccf93c`)
- **Draw & Guess:** it plans `min(players, 6)` turns from the roster, and slices its prompts separately from the season-allowed pool. Its guard checks the pool only for emptiness, and **before** the season filter.
  - With three players and one usable Everyday prompt, it starts three turns with one prompt. Turn 2's projection throws on the missing prompt, and the guess and recap paths would reach it too.
  - A non-empty Christmas-only pool passes the guard in Everyday, then filters to zero.
- **Team Draw (Practice and casual):** it can start with fewer prompts than rounds, or with none of the right season.
- **Why it is newly possible:** since Stage 12.17, a prompt rejected in the library leaves the pool. The shipped content doesn't reproduce it.

## The repair
1. **Before anything is created:** the room checks how many prompts this start may deal. That means the library's non-rejected prompts allowed by the content mode: year-round only in Everyday; all of them at Christmas and in a Cup game.
   - **What's needed:** one per turn or round. Draw & Guess needs `min(players, 6)`. Practice or casual Team Draw needs its round count. An Official Team Draw keeps its exact-record selection, unchanged.
   - **Too few:** the start is refused with the existing content-shortage result (HTTP 409 `CONTENT_EXHAUSTED`, available and needed). The reason names the game, the count and what to do.
   - **What a refusal leaves:** no game, no history or usage record, no score and no spent game number. The lobby stays as it was, so the host can choose another game or content and start again.
2. **Module backstops:** both modules' `init` refuse fewer dealt prompts than turns or rounds, so no other path can start an unplayable game.
3. **Swaps:** they stay optional and bounded by what is left over. With exactly enough prompts, there is no swap, and the game still plays to the end.
4. **Unchanged:** the Official exact-record, freeze and shared-history rules; every game with the shipped packs.

## Tests
- **Room start path (unit):** for both games, an insufficient and an exactly sufficient seasonal pool. That includes a non-empty Christmas-only pool under Everyday, which should be refused. Each refusal is checked to leave no game, history or score behind.
- **A complete Draw & Guess game** with exactly enough prompts and no swap reserve: the swap is refused, every turn's projection works, and it ends with results.
- **A browser check** (`scripts/check-draw-shortage.mjs`): the visible refusal in the lobby, then a retry with enough prompts that starts the game.
- **The gates:** focused checks plus the drawing regressions, as the review allows.

## Estimate (written before the work, at 1:31 p.m. ET)
About **2 h 45 min**.

| Part | Estimate |
|---|---|
| Server check, module backstops, message | 30 min |
| Unit tests through the start path | 45 min |
| Browser check and screenshots | 45 min |
| Targeted and fast gates, evidence | 15 min |
| Decisions, progress, report | 30 min |

**Risk:** existing tests and drivers that start drawing games with small or fixture pools could now be refused. Any such case will be checked and named, not loosened.

## Estimate vs actual
- **Estimate:** about 2 h 45 min, written at 1:31 p.m. ET.
- **Actual:** about 1 h 25 min of wall clock, from 1:31 p.m. ET to the report at about 2:55 p.m. ET. The time was interleaved with Beta R1's last correction, gates and report (#43), so the split between the two isn't measured.
- **The parts:**
  - **The repair and its unit tests:** they went faster than estimated, because the existing content-shortage result, the 409 response and the lobby's error display already covered the refusal path.
  - **The browser check:** it passed on its first run.
  - **The gates:** the targeted and fast gates on `6944ea7` both passed first time.
- **The risk named above** (existing tests or drivers refused by the new check) did not happen. All 2044 unit tests and the six drawing drivers pass unchanged.
- **Process:** two overlaps with Beta R1's gates, set out in `docs/evidence/stage1217r-local/README.md`.

