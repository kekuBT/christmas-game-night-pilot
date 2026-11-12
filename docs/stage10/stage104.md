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
D-S104-01 to D-S104-04 in `docs/DECISIONS.md`:
- bind to the game on screen;
- idempotency by member and key;
- a composer on the result screen, not a new screen;
- Spectrum and Jebena only.

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
