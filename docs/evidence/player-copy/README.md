# H8 evidence: player-facing copy in Who Said That? and Geography Challenge

- **The request:** handoff [7027768922](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7027768922), H8 from the November 19 QA audit, pages 7 and 29.
- **Decisions:** D-H8-01 and D-H8-02 in `docs/DECISIONS.md`; the H8 sweep backlog is there too.
- **Draft PR:** #55, stacked on #54 at exact base `7c013bfbfbdc526ec9000c7ac9f05d612e75fd90`.
- **Tested commit:** `436f272d13ee021f246d4669a8fb88e327704f74`, the final one. This folder was added afterwards, in a docs-only commit.
  - **The earlier commit `777b6f5`** had the copy fix only, before the D-H8-02 edit. Its own verdicts are listed separately below and are not part of `436f272`'s.
- **Data:** local, synthetic only. Each run used an isolated server on port 0 with a temporary data directory, four made-up seats, and no content test mode. No beta codes, cookies or tokens are recorded here.

## What players saw and see

| Screen | Before (`7c013bf`) | After (`436f272`) |
|---|---|---|
| Who Said That?, details sheet (Library, room library, Home) | Match quotes to their speakers. Generic pack only in local builds. | Match each quote to the made-up character who said it. Played in a room, each player on their own phone. |
| Who Said That?, briefing "How to play" | Match the quote to the speaker. Generic pack only in local builds. | Match each quote to the character who said it. Everyone answers on their own phone, and the answers are shown when the game ends. |
| Geography Challenge, details sheet | Flags, capitals, outlines, maps, and distance. Six modes, provisional. | Four-choice geography questions, mixed in every game: flags, capitals, regions, distances and more. |
| Geography Challenge, briefing "How to play" | Flags, capitals, outlines, maps, and distance — six modes, provisional. | Geography questions, mixed in every game: flags, capitals, regions, distances and more. Pick one of four answers on your phone. |
| Geography Challenge, results (revealed explanations) | "Italy is famously boot-shaped. Text hint fallback, not SVG geometry." and "Egypt is in North Africa. Accessible region fallback, not map tap." | "Italy is famously boot-shaped." and "Egypt is in North Africa." (D-H8-02, authorised in handoff 7028695889) |
| Who Said That? results; both games, Back to lobby | No note | Unchanged; checked |

**The audit's other two strings** are "play solo (not in a room)" and "It is easy to get all answers right in tests.". Neither is in the source of `7c013bf`, in the history reachable from it, or in its built bundle; `strings-search.txt` has the searches. So this patch changes nothing for them.

**The solo shelf (`/solo`)** offers neither game, and already says "the other games are played in a room". The new copy says the same.

## The browser check: `scripts/check-player-copy.mjs`

- **The phone:** Chromium phone emulation at 320×568, mobile, touch, scale 2.
- **The route, through the normal entry points:**
  1. **The Library:** `/library`, then the game card's details.
  2. **The solo shelf:** `/solo`.
  3. **In a room, as host:**
     - Room menu → All games → the game's details;
     - back to the lobby, then the picker and Start;
     - the briefing;
     - play: all four seats answer all 8 questions through the server;
     - the results with the answers revealed;
     - Back to lobby.
- **What it checks on every screen:** no team note.
  - The pattern is the same as `tests/h8-player-copy.test.ts`: local build, provisional, in tests, test mode, registry, generic pack, placeholder, stub, debug, owner review, review pending, not licensed, fallback, sprint N, stage N.
  - It also checks the new player text, and that scores are the server's (100 per right answer).
- **The results text is checked whole, with no exception.** On Geography, the driver also requires that the outline and region questions were dealt, and that each explanation is exactly its first sentence: "Italy is famously boot-shaped." and "Egypt is in North Africa."

| Run | Revision (server source + web build) | Result | Log |
|---|---|---|---|
| Before, negative control | `7c013bf` (base worktree; web build of `9d2eda5`, the same app code) | **13 FAIL**, 19 PASS. Every failure is reported copy: 4 in the Library, 2 in the room library, 4 in the briefing, and 3 on the Geography results (the two explanations, and a note in the unfiltered text). | `before-7c013bf.log` |
| After, development build | the working tree that became `436f272` | 32 PASS, 0 FAIL | `after-dev.log` |
| After, in the gate | `436f272`, built by the gate | see the gate summaries | `gate-436f272-*.txt` |

**Screenshots** (320 px, taken after each screen's entry animation has finished):

| Screen | Before | After |
|---|---|---|
| Who Said That? details | `before/library-details-who-said-that-320.png` | `after/library-details-who-said-that-320.png` |
| Who Said That? briefing | `before/briefing-who-said-that-320.png` | `after/briefing-who-said-that-320.png` |
| Who Said That? results | `before/results-who-said-that-320.png` | `after/results-who-said-that-320.png` |
| Geography details | `before/library-details-geography-320.png` | `after/library-details-geography-320.png` |
| Geography briefing | `before/briefing-geography-320.png` | `after/briefing-geography-320.png` |
| Geography results | `before/results-geography-320.png` | `after/results-geography-320.png` |

- **Where they come from:** the "after" pictures are from the targeted gate run on `436f272`; the "before" pictures are from the before run.

## The unit regression: `tests/h8-player-copy.test.ts` (14 tests)

- **The guard over every game:** the guard runs over every game's How to play line (registry tutorial), its card and details description (manifest), and its briefing objective and steps.
- **Negative control:** the audit's strings, which the guard must catch.
- **The two games:** their exact new text; `soloPlay` stays false; players, durations and play style are unchanged.
- **Content, with no exception list:** neither game's questions, options, answers or explanations contain a team note, in the content packs or the built-in packs.
- **D-H8-02, pinned:**
  - both items, field by field, in both packs;
  - pack version 1.0.1, a clean load, status `legacy`, Official eligibility, and no approval;
  - the content hash changed with the wording, which is what cancels a briefing frozen on the old text after a restart;
  - a whole Official Geography game on both paths (a Cup created now deals from the content pack; a Cup restored from before Sprint 4 deals from the built-in pack), with the revealed explanations read from a player's projection.
- **Result:** with the D-H8-02 edit stashed, 7 tests fail (every content and D-H8-02 test); with it, 14/14 pass (`unit-negative-control.log`).
- **`npm run content:check`:** CONTENT OK, with the same single Geography warning as the base.

## Gates

Each verdict below belongs to one run on one revision.

| Revision | Gate | Verdict | Run | Summary |
|---|---|---|---|---|
| **`436f272` (final)** | targeted: player-copy plus 16 drivers touching these games, the Library, the briefing or details | **`PASSED (exit 0)`**, 17/17 | `20261120-030228-436f272d-10627` | `gate-436f272-targeted.txt` |
| **`436f272` (final)** | full: typecheck, lint, unit tests, build and every driver | **`PASSED (exit 0)`**, 115/115 | `20261120-030829-436f272d-13337` | `gate-436f272-full.txt` |
| `777b6f5` (before D-H8-02) | targeted, the same steps | `PASSED (exit 0)`, 17/17 | `20261120-020658-777b6f5f-7891` | `gate-777b6f5-targeted.txt` |
| `777b6f5` (before D-H8-02) | full | `PASSED (exit 0)`, 115/115 | `20261120-021257-777b6f5f-10794` | `gate-777b6f5-full.txt` |

- **`d2b9fba`** (the first copy commit) has no gate verdict. Its targeted run was stopped by hand, because the driver's screenshots were caught mid-fade.
- **The driver's own log in each `436f272` run:** `after-gate-436f272-targeted-check-player-copy.log` and `after-gate-436f272-full-check-player-copy.log`. Each has 32 PASS lines and `PLAYER COPY ALL PASSED`.

## Files

- **Logs:** `before-7c013bf.log`, `after-dev.log`, the two `after-gate-436f272-*.log`, `unit-negative-control.log`, `content-check.log` and `strings-search.txt`.
  - **Redaction:** the scratch directory is shown as `$SCRATCH`, the repository as `$REPO`, and temporary data directories as `/tmp/mz-XXXX`; colour codes are removed. Nothing else was edited.
- **Gate summaries:** `gate-*.txt`.
- **Screenshots:** `before/` and `after/`.

## Limits

- **Browser coverage:** Chromium emulation only. No native iPhone or Android run, and no other browser engine.
- **What was checked:** text and screenshots of the listed screens; the TV and the older intro screen read the same registry text, and are not separately screenshotted.
- **Not changed:** the sweep's backlog items (DECISIONS, H8 sweep). The handoff authorised no broader rewrite of copy or content.
- **Not approved:** the D-H8-02 edit is wording only, not an editorial approval of the pack or clearance for official championship use.
