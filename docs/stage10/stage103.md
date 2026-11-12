# Stage 10.3: Spectrum's team result in the Memory Book, and a Memory Book for every look

**Instructions:** ChatGPT's handoff 6834334005 on PR #19, which also cleared Stage 10.2 on `b8e75be`/`e1e9a6b` for development.

**Branch:** `claude/stage10-3-spectrum-memory`, from PR #19's head `e1e9a6b`. A new stacked PR, unmerged and linked to #19 and #5.

**Authorization:** the owner's standing D-WF-01.

## 1. What this slice is, and isn't
- **It is:**
  - a finished Spectrum match, completed or genuinely ended early, can be saved through the existing Memory Book flow, with its team facts derived and frozen by the server;
  - the Memory Book stops saying "Christmas" to an Everyday device, and the server's Markdown export gets a neutral title.
- **It isn't:**
  - one-tap saving from the results screen (the next, separately reviewed slice);
  - automatic saving or approval, public sharing, AI, a new dependency, a new game or a redesign;
  - a change to scores, places, Cup points or any game's rules;
  - saving for any other cooperative game: Spectrum is enabled by name, and a future team game stays refused until it is enabled on purpose.

## 2. The trusted team record (server)
- **Where it comes from:** `POST /rooms/:id/memory` already resolves each cited event in the room's own ledger. When the cited `game-finished` belongs to a Spectrum game in this room, the server reads that game's finalized `outcome.team` and freezes a typed record on the entry:

  | Field | From |
  |---|---|
  | `kind` | `"spectrum"` |
  | `gameInstanceId`, `finishedEventId` | the cited event and its game |
  | `total`, `max` | the team result |
  | `roundsRevealed`, `roundsPlanned` | `rounds.length`, `roundsPlanned` |
  | `end` | `"completed"` or `"too-few-players"` |

- **Never read from the request:** totals, rounds, endings, places, names or any other fact. Only `day`, the note text and the cited event ids are read, as today.
- **Fail closed, with a code:**
  - **Not saveable** (409 `RESULT_NOT_SAVEABLE`):
    - the game isn't finished, or was voided;
    - its `outcome.team` is missing or fails `TeamResultSchema`;
    - its ending is `null` (the room's time limit cut it mid-round, not the module);
    - the revealed rounds don't match the ending: completed needs all of them; an early ending needs fewer.
  - **Another cooperative game** (409 `NOT_IN_MEMORY_BOOK`, as today): only Spectrum is enabled, by a `memoryBookTeam: true` flag on its registry entry.
  - **More than one citation** (400 `ONE_TEAM_GAME`): an entry citing a team finish must cite exactly that one event.
- **What is never written:** no per-player score, place, winner or Cup point. The team record is the whole fact.
- **Readable facts:** `derivedFacts` also gets the same wording every surface uses, from the shared formatter `src/shared/memoryTeam.ts`:
  - completed: "Spectrum team result: 27 out of 40 · all 4 rounds played";
  - early: "Spectrum team result: 9 out of 40 · ended early after 1 of 4 rounds (fewer than two players were left)".
  - An early result always says it ended early and never claims completion.
- **Kept:** the competitive derivation (score events by player), and every saved entry and its approval. Old entries have no `team` field and read exactly as before.
- **Persistence:** the record is saved with the book, and on restore each entry's `team` is checked against its schema.
- **Authority, unchanged:**
  - any room member may add a pending entry;
  - only the current host or cohost may approve or revoke;
  - exports contain approved entries only;
  - a token from another room is refused.
  - A cited id resolves only in this room's ledger, so another room's finish can't be cited, and no facts are taken from another room.

## 3. Titles and the look
- **On a device (screen, PDF, share image):**
  - Christmas look: "Christmas Memory Book", with the share image's 🎄;
  - Everyday look: "Mchezo Memory Book", with no Christmas decoration.
  - Colours already follow the look (Stage 8.2).
- **The server's Markdown export:** "# Mchezo Memory Book — {room}". The server has no device look.
- **The look only changes the title and decoration,** never a fact, a total or any content.

## 4. The screen
- **The link line:**
  - **Ready:** after a supported Spectrum finish (completed, or early with the reason), it reads "Linked to **Spectrum** · Day N: the last game that finished." Add is on.
  - **Unavailable:** a room-ended Spectrum match says it can't be saved and why. Any other team game keeps the plain "team games aren't saved yet" answer.
  - **Kept from 10.2:** the loaded-watermark guard and in-order responses, so the link never falls back to an earlier game.
- **An entry card:**
  - the note (the person's words) stays on top;
  - a visibly separate "From the game" line comes under it, built from the server's team record: the title, the day, and the team result with its ending;
  - competitive entries keep their per-player results and folded ledger facts.
- **PDF:** each approved entry has its note and then its facts ("From the game: …" for team results, "From the ledger: …" as before). Line pagination is unchanged.
- **Share image:** a team entry gets one facts line under its note. The "first 8" limit and both "…continues"/"…and N more" notices are unchanged.

## 5. Decisions
D-S103-01 to D-S103-06 in `docs/DECISIONS.md`:
- a typed team record, server-derived and frozen;
- Spectrum by name;
- the endings that can be saved;
- one citation per team entry;
- one shared wording;
- titles by look.

## 6. Validation plan
- **Unit and HTTP** (`tests/stage103-memory-team.test.ts`):
  - **Saving:** a completed match and an early ending each save with the right frozen facts and wording.
  - **Refused (fail closed):** an ending of `null`, a voided or unfinished game, a corrupted team record, a mismatched round count, two citations, and a future cooperative game.
  - **Forged fields:** forged totals, rounds or endings in the request are ignored.
  - **Other rooms:** another room's token is refused, and another room's event id never yields that room's facts.
  - **Authority:** guests add but can't approve or revoke; host and cohost can.
  - **Exports:** approved entries only, revoked ones dropped, the neutral Markdown title, and team lines with no per-player numbers.
  - **Persistence:** the facts survive a restart, and an old book with no team records restores unchanged.
  - **Regression:** Jebena and Trivia keep their facts.
  - The shared formatter has its own tests.
- **Browser** (`check-spectrum`, extended):
  - **The completed match:** a guest saves a pending entry (390 px, keyboard: Tab to Add, Enter). The host approves it, Export shows it, the PDF downloads, and a reload keeps it.
  - **The early-ended replay:** it saves with "ended early …".
  - **The wrong game:** a stale page never links the earlier game.
  - **Permissions:** the guest has no Approve. A cohost approves and revokes, and a revoked entry leaves the export.
  - **Looks and widths:** both looks, at 320 and 390 px. The Everyday title is "Mchezo Memory Book"; the Christmas one is "Christmas Memory Book".
- **Regression:** `check-jebena-rush`, `check-cup-memory`, `check-history-links` and `check-contrast` unchanged.
- **Gates:** targeted while developing, then fast and one full gate on a clean final candidate, run one after another.

## 7. Estimate (after inspecting the delta)
| Step | Time |
|---|---|
| Spec, PR, links, acknowledgement | 0.5 h |
| Server team record, guards, persistence, Markdown title, registry flag | 0.75 h |
| Shared wording; unit and HTTP tests | 1 h |
| Web: types, link state, entry card, PDF, share image, titles by look | 0.75 h |
| Browser journey in `check-spectrum` (save, approve, export, reload, early replay, permissions, looks, 320/390, keyboard), screenshots | 1–1.5 h |
| Gates (targeted, fast, one full gate of about 34 min) | about 45 min |
| Evidence, docs, report | 0.5 h |
| **Total** | **about 5–5.75 h** |

**Calibration note:** the last two slices came in well under their estimates: 10.2 took about 1 h against 4.5–5.5 h, and its repairs about 1 h 10 min against 2–2.5 h. That is because the drivers and layers they used already existed. This slice adds a new stored record and a longer browser journey, so I expect about 2.5–3.5 h in practice and report against the range above.

## 8. As built and tested
| Area | Where | Tests |
|---|---|---|
| The team record | `src/server/memorybook.ts`: `teamFactsFor` derives from the cited game's `outcome.team`; `addTeamResult`; `MemoryTeamFactsSchema`, re-checked on restore; refusals `RESULT_NOT_SAVEABLE`, `ONE_TEAM_GAME`, `NOT_A_FINISH` | `tests/stage103-memory-team.test.ts` (18) |
| The route | `src/server/http.ts` `POST /rooms/:id/memory`: a cited team game goes the team path; only Spectrum (`isMemoryBookTeam`) is saved, and every other cooperative game still gets `NOT_IN_MEMORY_BOOK`. The Markdown title is neutral. | the same tests, over HTTP, with real Spectrum matches |
| Spectrum by name | `src/games/registry.ts`: `memoryBookTeam: true`; `isMemoryBookTeam`. It reaches the web through `GET /games`. | the registry test in the same file |
| One wording | `src/shared/memoryTeam.ts` `memoryTeamLine` | its own tests |
| The screen | `MemoryScreen.tsx`: the title follows the look; the link line previews "Saved with: …"; "From the game" on entry cards; the PDF and share image carry the team line; `memoryLink.ts`: `teamResultSaveable`, `why` | `tests/stage103-memory-team.test.ts` (pure link states) |
| File names | `exportLayout.ts` `exportFilename(…, look)`: `mchezo-memory-book-…` or `christmas-memory-book-…` | `tests/stage4-memory.test.ts` |
| Changed on purpose | The two tests that asserted the old Spectrum refusal (`stage93-spectrum-room`, `stage102-memory-freshness`) now assert the save. The drivers that waited for "Christmas Memory Book" in Cup rooms (`check-contrast`, `check-f4`, `check-f5`, `check-cup-memory`) now check the title for the look (Cup rooms show Everyday). | the drivers below |

### In real browsers (`check-spectrum`, the driver's own copy of the wording rule)
- **M1, the completed match:**
  - Amina, a guest (Christmas, 320 px), opens the Christmas Memory Book. It links the completed match and previews its facts.
  - She reaches Add with Tab from her note and presses Enter.
  - Her entry is pending with "From the game: Spectrum team result: N out of 40 · all 4 rounds played" under her note. The server froze the match's own facts, citing exactly its finish.
  - She has no Approve or Revoke, and the page has no sideways scroll at 320 px.
  - Keku, the host (Everyday, 390 px), sees the Mchezo Memory Book, with nothing Christmas on it. He approves the entry, and the export starts "# Mchezo Memory Book — …" with the note and then the facts.
  - The PDF is `mchezo-memory-book-….pdf`; Amina's share image is `christmas-memory-book-….png`.
  - After a reload, the entry is still approved with the same facts.
- **M2, the early-ended match:**
  - Keku opens the Memory Book while the next match is being played. It links the completed match.
  - When the match ends early, the open page moves to the new finish, never the old one, and previews "ended early, R of 4 rounds played (fewer than two players were left)". His note is kept.
  - Add saves an entry citing exactly the early finish, with its facts. The completed match's entry is untouched.
  - A forged save straight to the server can't change the facts.
  - The 10.2 watermark checks still pass: his ledger is current with the newest event hidden.
- **M3, permissions:**
  - Baraka is made a cohost. He revokes the completed entry, and it leaves the export. He approves the early one, and the export says it ended early.
  - Amina still has no Approve or Revoke.
- **Regressions:**
  - `check-jebena-rush`: a competitive replay's Memory Book is ready and cites it;
  - `check-cup-memory`: titles and file names for the look;
  - `check-history-links`: the open page follows a newly finished game;
  - `check-contrast`, `check-f4`, `check-f5`: unchanged.
- **Screenshots:** `docs/stage10/stage103-screenshots/`.

### Gates on `b791015` (each verdict is one run on one revision; raw output in `docs/evidence/gate-runs/<run>/`)
- **targeted** (`spectrum jebena-rush cup-memory history-links contrast f4 f5`): `20261112-201742-b7910156-5587` **PASSED** (exit 0, 9/9, 7 min 43 s). Spectrum 173, Jebena 218, contrast 79, cup-memory 37, f5 37, history-links 16, f4 12.
- **fast:** `20261112-211748-b7910156-251` **PASSED** (exit 0, 5/5, 63 s; 1,667 unit tests in 128 files).
- **full**, the one checkpoint: `20261112-211904-b7910156-3590` **PASSED** (exit 0, 88/88, 32 min 21 s). Spectrum 173, Jebena 217, contrast 78, briefing 44, f5 37, cup-memory 37; 1,667 unit tests.

### Found along the way, unchanged
- **Approvals aren't pushed live.** An approval isn't a room event, so another open Memory Book page sees it on its next load. The driver reloads before the guest's share image.
- **A starting match pulls players in.** It brings its players to it, including a Memory Book tab opened earlier, so the driver opens the book once the match is playing, as `check-history-links` does.
- **Player ids in the Markdown.** Competitive facts in the Markdown export still show player ids ("player-1: 30 points"); the screen shows names. Team entries have no per-player line.
