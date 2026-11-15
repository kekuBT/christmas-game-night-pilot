# Stage 12.16-R: repairs from review 6895557386

**Authorization:** the owner's review on #41, comment 6895557386 (2026-11-15, 9:04 a.m. ET; D-WF-01). It found Stage 12.16 needs changes and handed the repair to me. Branch `claude/stage12-16-split-clues-content`, from head `20cf06d`; PR #41 stays stacked on #40 and unmerged.

## Findings
- **R1 (blocking):** a Split Clues puzzle's raw pack status (`approved`, `legacy`, `verified-computed`) made it Official-eligible with no approval record. A stale approval (edited since) only added a problem and left the raw status in force. The loader starts from `item.review.status`, and `officialEligible` checks the status without asking where the approval came from. Confirmed independently on `a1032ad`'s tree. The shipped packs are all `provisional`, so no shipped game was affected; it is a content-policy enforcement defect.
- **R2:** `tests/stage1216-split-clues-content.test.ts` leaves its temporary content trees behind. `scripts/check-split-clues-content.mjs` cleans its servers and copies only on success, and exits from inside the server startup on failure.
- **Wording:** the inventory says puzzles "this Cup has not used officially"; Practice uses them up too.

## Plan
1. **R1, approval by record only (Split Clues):**
   - **The loader:** a Split Clues puzzle is `approved` only with an approval record at its exact current hash: a human's, or the test mode's, which keeps its "TEST MODE (not a human review)" label and production refusal. A raw official-capable label is reported as a problem and the puzzle is treated as `provisional`. A stale record is reported and ignored. `rejected` stays rejected, even with a matching record.
   - **Eligibility:** `officialEligible` also requires that record for Split Clues. Selection, the lobby view, the shared plan, the start and the briefing-to-play re-check all use it, so they agree.
   - **Other games:** they keep their established `legacy` and `verified-computed` rules.
   - **The inventory:** it shows each puzzle's approval record (or none) as well as its status.
2. **R1 tests:** they go through the loader, eligibility and the real room projection, start and briefing-to-play paths, not just `li.status`:
   - each raw official-capable status with a missing record, a deleted record and a stale record;
   - six exact approvals, then one invalidated (five left: a truthful refusal, no game or usage recorded);
   - revocation between the briefing and play;
   - rejected with a matching record;
   - Practice still usable.
3. **R2:**
   - **The unit tests:** they remove every temporary tree in `afterEach` and `afterAll`.
   - **The driver:** it tracks the servers and fixture copies it owns. In `finally` it stops each server and awaits its exit, then deletes that server's data, including when startup fails. It keeps the logs and screenshots and exits non-zero on failure.
   - **Verification:** one injected early failure (a test-only environment switch) and the ordinary success path, each checked for leftover processes and directories.
4. **Wording:** the inventory says "not used in this Cup yet, Practice included".
5. **Checks:**
   - focused tests, content check, both typechecks, lint;
   - the Split Clues browser checks;
   - the fast gate at the repair checkpoint.

   No full gate unless the final shared-code change or a failure calls for one, with the reason stated. CPU-heavy unit phases won't overlap.

## Estimate (written before the work, at 9:05 a.m. ET)
About **3 h**.

| Part | Estimate |
|---|---|
| Plan | 15 min |
| R1 code and tests | 1 h 15 min |
| R2 and its verification | 45 min |
| Wording | 5 min |
| Checks and gates | 30 min |
| Docs and report | 30 min |

## What was built (`06bebdc`; D-S1216R-01)
As planned, with one detail settled during the work: a raw official-capable label is demoted to provisional before the test mode is consulted. So in test mode such a puzzle gets the test mode's truthfully labelled record like any provisional one, never approval from its label. The other steps went as planned; evidence is in `docs/evidence/stage1216r-local/README.md`.

## Estimate vs actual
- **Estimate:** about 3 h, written at 9:05 a.m. ET before the work.
- **Actual:** about 25 minutes, from the review at 9:04 to about 9:30 a.m. ET.
  - **Implementation:** 9:05 to 9:14: R1 tests first (6 failing), the fix, R2, the wording.
  - **Driver cleanup checks:** within that window.
  - **Gates:** 9:15 to 9:20; docs and report after.
- **Why under:** the fix is a small change in one place (the loader and `officialEligible`). Both test paths already existed (the room and the fixture library), and no full gate was needed.
