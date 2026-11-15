# Stage 12.16: Split Clues content readiness

**Authorization:** the owner's review and handoff on #40, comment 6892660460 (2026-11-15, 4:58 a.m. ET; D-WF-01).
- It cleared the Stage 12.15-R repair checkpoint. That is engineering and audit clearance only: not a merge, a deployment, content approval or real-device certification.
- It named this bounded milestone.

**Branch:** `claude/stage12-16-split-clues-content`, from #40's head `8798e38`. It goes in one stacked, unmerged draft PR linking #40 and #5.

## What exists now

**The content library (Sprint 4: `src/content/`):**
- Games' items live in JSON packs under `content/packs/`.
- Every item is validated against its game's schema.
- A human approval in `content/approvals.json` is bound to the item's content hash (`itemHash`: everything except `review` and `season`). An edit voids the approval, and the loader reports it.
- `officialEligible` admits only approved, verified-computed or legacy items marked `eligibility: "official"` and not past a review date.
- `selectContent` chooses each game's items, atomically with game creation:
  - **a Cup's Official game:** unused eligible items, or a plain refusal (`ContentShortage`, no silent repeats);
  - **a Cup's Practice game:** least recently used, retiring any fresh official item it takes;
  - **casual and solo rooms:** unused first, then least recently used, filtered by the session's season.
- A briefing freezes the chosen items by id, pack, version and hash. Play re-checks them: a changed item ends the briefing ("content-changed").
- **Test-only switches:** `MCHEZO_CONTENT_TEST_MODE=approve-provisional` treats provisional items as approved; it is not editorial approval and is refused in production. `MCHEZO_CONTENT_DIR` loads another content directory.

**Split Clues (Stage 12.10):**
- Its 51 puzzles (38 Everyday, 13 Christmas) are a TypeScript bank, `src/games/modules/packs/split-clues.ts`, outside that library. They are called "provisional, practice-only" there.
- `splitPuzzlesFor` deals straight from the bank, filtered by season, and avoids the ids this room's earlier Split Clues games dealt.
- Since Stage 12.15 (D-S1215-01) Split Clues can be **Official** in a Family Cup, so unreviewed puzzles can be dealt into a counted game. That is the gap.

## Plan

1. **Split Clues joins the content library** as content game `split-clues`, with its own item schema: the shared fields plus `kind`, `answer`, `alts` and exactly six `clues`.
   - **The packs:** the 51 puzzles move, unchanged, into `content/packs/split-clues-everyday.json` and `split-clues-christmas.json`, generated from the TypeScript bank. A test compares the two exactly: ids, answers, alternatives, clues and seasons.
   - **Each item's review status:** `provisional`, with `eligibility: "official"`. It can count only after a human approves that exact hash; until then it is practice-only.
   - **The shared fields:**
     - `category`: from the puzzle's kind;
     - `source`: `original-creative`;
     - `difficulty`: 2 for all of them, a placeholder flagged in the inventory for an editor to set;
     - `season`: unchanged.
   - **Lint:** a Split Clues rule makes it an error for a clue to contain the answer or an alternative.
2. **Selection through `selectContent`,** six puzzles per game, in every room. The puzzles go into the module's state at creation, like Team Huddle's questions.
   - **Approval:** missing, stale (edited since approval) or rejected approval is never treated as approved.
   - **History:** games played before this change dealt their puzzles without usage records. Their ids are merged into the history this selection reads, without rewriting saved rooms. So no-repeat holds, and a Cup never deals as Official a puzzle it already showed in practice.
3. **The Official gate:**
   - **The server** refuses an Official Split Clues start without six eligible unused puzzles, with a plain reason. It never substitutes provisional puzzles, shortens the game or changes its mode.
   - **The Cup projection** gives the lobby whether Official Split Clues is available and, if not, why.
   - **The lobby** shows the reason and offers Practice, like a practice-only game.
   - **Unchanged:** practice and casual play, which use provisional puzzles as before.
4. **Frozen at the briefing:** the six puzzles are chosen and frozen at the start, as for other content games.
   - **Re-check:** play re-checks them, and a puzzle changed since then ends the briefing.
   - **Unaffected:** reloads, reconnects and later content changes never alter a game in progress.
   - **Unchanged:** privacy, season filtering, scoring, team participation and manual-selection-only.
5. **An inventory of all 51 puzzles** (`docs/stage12/stage1216-split-clues-inventory.md`).
   - **Per puzzle:** id, season, kind, answer, alternatives, the six clues and the exact content hash.
   - **Concerns flagged for an editor:** giveaway or weak clues, ambiguity and factual points.
   - **Not done:** no puzzle is approved here, and no source is claimed as checked.
6. **Tests:**
   - **Approval cases:** missing approval, exact approved hash, edited after approval, rejected, insufficient pool, and season-specific pools. They use isolated approval fixtures in temporary directories; nothing touches `content/approvals.json`.
   - **The game:** freezing, no-repeat, authorization, and guest/TV secrecy.
7. **A browser driver** with two servers of its own:
   - **no approvals, no test mode:** Official is blocked with its reason, then a Practice game is played to the end;
   - **an isolated fixture with exact-hash approvals:** an Official game, guest and TV secrecy, and a reconnect.
   - **Screenshots:** 320 to 390 px, desktop and TV.
8. **Gates:** focused checks, typechecks, lint, the affected drivers, the fast gate, and one full gate at the stable checkpoint, then a new completed report.

**Out of scope:** Team Draw and Know Your Rivals content, other packs, new games, paid services, public ports and deployment.

## Estimate (written before the work, at 5:01 a.m. ET)
About **8 h 30 min**.

| Part | Estimate |
|---|---|
| Branch, spec, draft PR, acknowledgement | 30 min |
| Schema, packs (generated and compared), lint rule, selection, module, room, history merge | 2 h 30 min |
| Lobby projection and UI (reason, Practice choice) | 45 min |
| Focused tests | 1 h 30 min |
| Inventory and editorial flags for 51 puzzles | 1 h |
| Browser driver (two servers), screenshots | 1 h 15 min |
| Gates (targeted, fast, one full), evidence, docs, report | 1 h |

**Risk:**
- A gate can fail on something else in the stack.
- Existing drivers that start Official Split Clues rely on the gate's test mode. They keep working, because test mode treats provisional items as approved. I'll check they don't depend on the TypeScript bank directly.
