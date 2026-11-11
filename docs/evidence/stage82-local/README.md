# Stage 8.2: local evidence (working tree, Chromium emulation)

**What these are.** Supporting runs from the working tree during development. They are not the verdict. The verdicts are the fast and full gates on the final candidate, recorded in `docs/evidence/gate-runs/<run>/` and in `docs/stage8/stage82.md` §7.3.

**Environment.**
- **Server:** one local server from this branch (port 3482, `MCHEZO_CONTENT_TEST_MODE=approve-provisional`, as the gate uses), with the web build of the same tree.
- **Browser:** Chromium headless shell (Playwright). This is not WebKit, and not a real phone.

## Mutations (`mutate.py`): each breaks one safeguard, then runs `tests/stage82-seasonal.test.ts`

| Mutation | Result |
|---|---|
| Everyday filter removed (`select.ts`) | caught: 2 tests fail |
| Christmas-first ordering removed (`select.ts`) | caught: 4 tests fail |
| CONTENT_CHANGED check removed (`room.ts`) | caught: 3 tests fail |
| Briefing re-check by season removed (`room.ts`) | caught: 1 test fails |
| `contentSeason` not restored from a snapshot (`room.ts`) | caught: 2 tests fail |
| Solo replay ignores its season (`room.ts`) | caught: 2 tests fail |
| Season put back inside the content hash (`registry.ts`) | caught: 1 test fails ("is outside the content hash…") |
| Draw & Guess prompts unfiltered (`draw.ts`) | caught: 2 tests fail |

**A first attempt at the hash mutation was invalid.** It left a dangling reference, so the file failed to load rather than a test failing. It was redone correctly, and the corrected run is the one in the table.

**Every file was restored after each mutation.** `git status` showed only the intended changes.

## Content check (`content-check.txt`)
- `npm run content:check`: CONTENT OK.
- Season audit: 0 untagged items with Christmas words, and 42 pack items tagged Christmas.
- Every shipped item's hash is unchanged by the tagging. Hashes were compared before and after the tags (581 items, identical), and `tests/stage82-seasonal.test.ts` pins this too.

## Drivers (`drivers/`)
- **`check-themes-seasonal`:** 125 checks passed.
  - The first pass had 9 failures, all in the driver itself:
    - 8 were a choice measured mid-animation (43.999 px);
    - 1 was the guest still on the results screen before its reload check.
  - Both were fixed in the driver (`settled()`, and back to the lobby before the reload). No app change was needed.
- **`check-session-flow` (s82a), 1 failure:** the new What's next label's test id began `next-`, a prefix the driver reserves for the panel's buttons. It was renamed `whats-next-content`, and the rerun (s82b) passed 70 of 70.
- **All other drivers listed** passed with 0 failures.
