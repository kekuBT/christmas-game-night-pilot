# Stage 10.4: save a memory without leaving the result screen

**Instructions:** ChatGPT's handoff 6838210827 on PR #20, which also cleared Stage 10.3 on `b791015`/`7072def` for development.

**Branch:** `claude/stage10-4-save-memory`, from PR #20's head `7072def`. A new stacked PR, unmerged and linked to #20 and #5.

**Authorization:** the owner's standing D-WF-01.

## 1. What this slice is, and isn't
- **It is:**
  - a compact **Save a memory** action on the **Spectrum and Jebena Rush results** of a player's phone;
  - one tap opens a small inline composer with the match's facts (read-only), a short personal note, and explicit Save and Cancel;
  - a save lands as a pending entry, waiting for the host. It's tied to the match on screen and is safe to retry.
- **It isn't:**
  - the action on any other game's results (a later slice);
  - live approval updates on open pages;
  - automatic saving or approval, a generated anecdote, AI, public sharing, a new dependency, deployment, or a redesign;
  - on the TV: the TV stays a spectator surface.

## 2. Bound to the match on screen (server)
- **The binding:** `POST /rooms/:id/memory` accepts `fromGame: <gameInstanceId>` instead of `sourceEventIds`. The server resolves that game's own `game-finished` event in this room's ledger, so an old result can never save a newer match.
- **The facts:** derived exactly as today. A team result goes through `teamFactsFor` (Stage 10.3); a competitive one gets its score events. The request never supplies a fact, an approval or a game's owner.
- **Refused, with codes:**

  | Case | Response |
  |---|---|
  | No such game in this room (including another room's game id) | 400 `UNKNOWN_GAME` |
  | The game isn't finished yet | 409 `NOT_FINISHED` |
  | Both `fromGame` and `sourceEventIds` | 400 `ONE_SOURCE` |
  | An empty note | 400 `NOTE_REQUIRED` |
  | A note over 280 characters | 400 `NOTE_TOO_LONG` |
  | A voided game, a room-ended Spectrum match, or any other non-final result | the existing 409 `RESULT_NOT_SAVEABLE` / `NOT_IN_MEMORY_BOOK` |

- **Every request rechecks the session.** It must be a member of this room, and a token from another room gets 401. Approval and revocation stay host or cohost only.

## 3. One save, once (idempotency)
- **The key:** a save may carry a `requestId`, which the screen makes once per draft. It is scoped to this room and this member.
- **A repeat with the same key and the same request** (the same finish, note and day), whether a double tap, a network retry or a retry after a reconnect or restart, returns the **same entry** with 200. Nothing is duplicated.
- **The same key with a different request** (an edited note after a lost reply) gets 409 `ATTEMPT_MISMATCH` and the member's original entry. Nothing is overwritten, and the screen tells the player their first save had already gone through.
- **Keys don't collide:** two members using the same key get their own entries.
- **Persistence:** keys are kept with the book (`attempts`), so a retry after a restart is still recognized. An old book with no keys restores unchanged.
- **The boundary:** a separately started save (a new draft, a new key) is a new note on purpose, even for the same game. The Memory Book doesn't deduplicate notes by game.
- **New entries record who added them** (`addedBy`, set by the server).

## 4. The composer (web)
- **Where:** in `MchezoSpectrumResults` and `MchezoJebenaResults`, right under the game's result line and its moment line. That's after the hero and What's next, so Play again, Pick another game and Take a break don't move.
- **Closed:** a "Save a memory" button.
  - It's unavailable when the result can't be saved, with the reason said plainly: a voided game, or a Spectrum match stopped by the room's time limit.
  - It's never shown on the TV.
- **Open:**
  - the facts, read-only: Spectrum's shared team line ("Spectrum team result: … · ended early, …"), or Jebena's final points by name;
  - a note field (up to 280 characters, long text wraps);
  - Save and Cancel. Save is off until there's a note.
  - The facts and the note stay visibly apart.
- **Saving** shows "Saving…" and turns Save off.
- **Saved:** "Saved to the Memory Book. It's waiting for the host to approve it." with an "Open the Memory Book" button.
- **On failure:**
  - **Network or time-out:** "Couldn't reach the game. Your note is still here; try again." Retry reuses the same key.
  - **A refusal:** the server's words. The draft is kept either way.
- **Keyboard:**
  - Enter or Space on the button opens the composer, with focus in the note.
  - Escape or Cancel closes it, and focus returns to the button.
  - After saving, focus moves to the saved message.

## 5. Decisions
D-S104-01 to D-S104-05 in `docs/DECISIONS.md`:
- bind to the game on screen;
- idempotency by member and key;
- a composer on the result screen, not a new screen;
- Spectrum and Jebena only;
- a server that shuts down in bounded time (added after the first full gate failed; see §8).

## 6. Validation plan
- **Unit and HTTP** (`tests/stage104-save-memory.test.ts`):
  - the exact-match binding, including a replay race (the old result saved after a newer match finished);
  - every refusal, and foreign rooms and ids;
  - forged facts and approval ignored;
  - idempotent retries: the same key again, at the same time, after a restart, and with a different note;
  - different members' keys;
  - Spectrum and Jebena facts through `fromGame`;
  - score invariance: no game score or ledger change;
  - the preview helper.
- **Browser:**
  - **`check-spectrum`:**
    - from Amina's results (Christmas, 320 px): open with the keyboard, see the facts preview, Escape back to the button, Cancel a draft (nothing saved), then save a long note through a lost reply. The draft is kept, "try again" leaves exactly one entry, and it's pending, with the link to the book.
    - from Keku's results (Everyday, 390 px): save, approve in the Memory Book, and see it in the export.
    - the TV final has no Save action;
    - the early-ended replay's results save that replay's finish, never the earlier match.
  - **`check-jebena-rush`:**
    - Keku saves from the main match's results;
    - the replay's results save the replay;
    - the TV has no Save action;
    - approval and export work.
  - **Regressions:** manual Add, the watermark, and the 10.3 journeys stay.
- **Gates:** targeted while developing, then fast and one full gate on a clean final candidate, run one after another. Every run's raw output is kept.

## 7. Estimate (after inspecting the delta)
| Step | Time |
|---|---|
| Spec, PR, links, acknowledgement | 0.5 h |
| Server binding, idempotency, persistence; HTTP tests | 1.25 h |
| Composer component, wiring into two results screens, styles, keyboard | 1 h |
| Browser journeys in two drivers (composer, cancel, lost reply and retry, approve, export, replay, TV, looks and widths) | 1.5 h |
| Gates (targeted, fast, one full gate of about 32–34 min) | about 45 min |
| Evidence, docs, report | 0.5 h |
| **Total** | **about 5.5 h** |

**Calibration:** recent slices took 35–45% of their estimates (10.3: about 1 h 10 min of work plus gates against 5–5.75 h). I expect about 2.5–3 h here and will report against the 5.5 h above.

## 8. As built and tested
| Area | Where | Tests |
|---|---|---|
| Bound save | `src/server/http.ts` `POST /rooms/:id/memory`: `fromGame` resolves that game's own finish; refusals `UNKNOWN_GAME`, `NOT_FINISHED`, `RESULT_NOT_SAVEABLE` (voided or not final), `ONE_SOURCE`, `NOTE_REQUIRED`, `NOTE_TOO_LONG`, `BAD_REQUEST_ID` | `tests/stage104-save-memory.test.ts` |
| One save, once | `src/server/memorybook.ts`: `attemptFor`, `recordAttempt`, `attemptFingerprint`; attempts kept with the book (`toJSON`/`fromJSON`); `addedBy` set by the server. The same request returns 200 with the same entry; a different one gets 409 `ATTEMPT_MISMATCH` and the original entry. | the same tests: one after another, a burst of three at once, after a restart, two members with one key |
| The preview | `apps/web/src/ui/mchezo/lib/saveMemory.ts` `saveMemoryFacts`: Spectrum's shared team line, or Jebena's points by name, or why it can't be saved | the same file (3) |
| The composer | `apps/web/src/components/mchezo/SaveMemory.tsx`; `styles/stage104.css`; wired in `App.tsx` (`saveMemoryFor`) into `MchezoSpectrumResults` and `MchezoJebenaResults`, under the result line | the browser checks below |
| Bounded shutdown (D-S104-05, found by the first full gate) | `src/server/http.ts` `LocalServer.close()` | `tests/stage104-shutdown.test.ts` (3) |

### In real browsers
- **`check-spectrum` S1, the completed match:**
  - The TV final has no Save a memory.
  - **Amina (Christmas, 320 px), by keyboard:**
    - Enter opens the composer with focus in the note, and the facts are read-only and apart from it;
    - Save is off with no note;
    - Escape closes it, with focus back on the button;
    - Cancel discards a draft, and nothing is saved.
  - **Amina, through a lost reply** (the request reached the server; its answer was dropped):
    - the screen says it couldn't reach the game, keeps the draft and offers Try again;
    - Try again shows it saved and waiting for the host, with focus on the message and the book link;
    - the server holds exactly one entry: pending, citing this match's finish, with the team facts, added by Amina;
    - no sideways scroll at 320 px, and the long note wraps.
  - **Keku (Everyday, 390 px):**
    - a double tap saves once;
    - What's next and Play again are still there, and the match is unchanged;
    - he approves Amina's entry in the Memory Book, and the export has her note, then the team facts.
- **`check-spectrum` S2, the early-ended replay:** its results show "ended early" facts and save that replay's finish, never the completed match. "Open the Memory Book" shows it, pending.
- **`check-jebena-rush` S1, the main match:**
  - The TV has no Save a memory.
  - **Amina (320 px):** the composer lists the final points by name, highest first, matching the server's scores, with no sideways scroll; Cancel saves nothing.
  - **Keku:** his save is one pending entry citing this match's finish, with its score facts. Approved, it's in the export; the scores are unchanged.
- **`check-jebena-rush` S2, the replay:** its results save the replay's finish, never the main match's.
- **Regressions:** manual Add in the Memory Book (10.3 M1–M3), the 10.2 watermark, `check-cup-memory`, `check-history-links`, `check-contrast`, `check-f4`, `check-f5`.

### A failure on the way, and its fix (D-S104-05)
- **What failed:** the first full gate, on `c634500`, failed one step: `check-tv-outage`, "the driver's server exits within 20 s of SIGTERM". 87 of 88 steps passed. An earlier full gate (`20261112-064509-b668ee3c-28530`, Stage 10.2) had hung at the same step.
- **The cause:** `LocalServer.close()` sent each tracked socket a close frame, then waited for the WebSocket and HTTP servers to close. Those wait for every client's close handshake. A client that never answers is only cut off by `ws`'s own 30-second close timeout, and a socket refused at the door (no such room) was never tracked at all. The Save a memory code doesn't touch this path. The run's log doesn't say which socket held the server open; the test reproduces both kinds.
- **The fix:** `close()` sends every open socket a close frame, waits up to 1.5 s, then terminates the rest. The HTTP server gets the same bounded wait before `closeAllConnections()`. Well-behaved clients still get the polite close.
- **The test:** `tests/stage104-shutdown.test.ts`. Before the fix, 2 of its 3 tests failed: a deaf TV socket and a refused socket each kept `close()` waiting past 5 s. After it, all 3 pass. Logs are in `docs/evidence/stage104-local/`.
- **Rejected:** raising the driver's limit, or retrying the step.

### Gates
Run one after another, each from a fresh clone of the exact commit. Raw output, including the failed run, is in `docs/evidence/gate-runs/<run>/`.

| Run | Commit | Kind | Verdict | Notes |
|---|---|---|---|---|
| `20261112-231121-c6345008-2112` | `c634500` | targeted (spectrum, jebena-rush, cup-memory, history-links, contrast, f4, f5) | PASSED (exit 0), 461 s | spectrum 197, jebena-rush 226 checks |
| `20261112-231913-c6345008-3663` | `c634500` | fast | PASSED (exit 0), 63 s | 1,679 unit tests |
| `20261112-232027-c6345008-7030` | `c634500` | full | **FAILED (exit 1)**, 2017 s | 87 of 88 passed; `check-tv-outage` failed (above): 14 PASS, 1 FAIL. Spectrum 197, jebena-rush 227 checks |
| `20261113-000209-30417918-28168` | `3041791` | targeted (the same, plus tv-outage) | PASSED (exit 0), 465 s | tv-outage 14, spectrum 197, jebena-rush 226 checks |
| `20261113-004113-30417918-190` | `3041791` | fast | PASSED (exit 0), 59 s | 1,682 unit tests |
| `20261113-004221-30417918-3545` | `3041791` | full | **PASSED (exit 0)**, 1977 s | 88 of 88, no retries |

`check-jebena-rush` counts 226 or 227 checks depending on the match: the 10.2 moment line is checked on five screens when a moment happened, or its absence on two when none did. Both are expected.

## 9. Repair: a Memory Book change is live only once it is on disk (review 6842636842, D-S104-06)
- **The finding:** ChatGPT's review of `3041791` found that a failed disk write could turn into a false "Saved" and then lose the note.
  - `POST /rooms/:id/memory` added the new entry and its request key to the live book before writing it.
  - When the write failed, the reply was 500, but the live book kept both. A same-key retry answered 200 from memory, with nothing on disk, and the note was gone after a restart.
  - Manual Add, approval and revocation changed the live book in the same order.
- **Reproduced first:** `tests/stage104-book-durability.test.ts` on the reviewed code failed 4 of its 5 tests. A save's entry stayed listed after one failed write and after repeated ones; a failed manual Add still added its entry; a failed approval still showed the entry approved. Log: `docs/evidence/stage104-local/durability-before-fix.log`.
- **The repair (`0b5a4a2`):**
  - `LocalServer.commitBook()` is the only way a room's book changes. It clones the live book (`MemoryBook.clone()`: entries, the id counter and the save keys, nothing shared), makes the change on the clone, writes it, and only then makes the clone the live book.
  - The write is `atomicWriteFileSync`, which leaves the old file when it fails, so after a failure the live book and the disk agree.
  - From the clone to the swap it runs without a pause, so no other request sees or changes the book in between. A save's key lookup reads the live book after the request's body has arrived.
  - A failed write answers 500: "The Memory Book couldn't be saved, so nothing changed. Try again in a moment." No entry, approval, key or id is used.
- **What a player sees:** the composer shows those words, keeps the draft and the key, and offers Try again. The retry, once the disk works, writes exactly one pending entry.
- **Tests (all pass after the repair):**
  - one failed write, then a same-key retry: nothing listed, approvable or exported after the failure; the retry returns 201 with `book-1`, which survives a restart, and the same request after the restart returns 200 and that entry;
  - three failed writes in a row (a Spectrum team result): each 500, nothing listed for guest or host, nothing to approve, an empty export; then one write that works saves it once;
  - a committed save whose reply was lost: the retry returns the same entry, before and after a restart;
  - approval and revocation: a failed write changes neither the entry nor the export, before or after a restart;
  - manual Add: a failed Add leaves earlier entries exactly as they were, and the next Add is `book-2`;
  - scores and the ledger are unchanged throughout.
  - The existing burst, restart, mismatch and two-member tests are unchanged and pass.
- **Browser (`3a5590a`):** in `check-spectrum` S1, Amina's first save gets the server's own 500 reply for this case (stubbed in the browser; the disk failure itself is in the test above). The composer shows the server's words, keeps the draft, offers Try again, and saves nothing; the same key then goes through the lost reply and saves once, as before.
- **Not changed:** room state keeps its Sprint 1 rule (the change happens in memory, a failed save answers 500, the next successful save writes the whole snapshot). This repair covers the Memory Book.

### Repair gates
Run one after another on `3a5590a`, each from a fresh clone. Raw output is in `docs/evidence/gate-runs/<run>/`.

| Run | Kind | Verdict | Notes |
|---|---|---|---|
| `20261113-031828-3a5590ae-5268` | targeted (spectrum, jebena-rush, cup-memory, history-links, contrast, f4, f5) | PASSED (exit 0), 464 s | spectrum 199, jebena-rush 226 checks |
| `20261113-032621-3a5590ae-6818` | fast | PASSED (exit 0), 54 s | 1,687 unit tests in 131 files |
| `20261113-032723-3a5590ae-10158` | **full (the checkpoint)** | **PASSED (exit 0)**, 1966 s | 88 of 88, no retries; spectrum 199, jebena-rush 226, tv-outage 14 checks |
