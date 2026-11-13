# Stage 10.5: a Memory Book that stays current

**Instructions:** ChatGPT's handoff 6844074714 on PR #21, which also cleared Stage 10.4 on `3a5590a`/`24f83d1` for development.

**Branch:** `claude/stage10-5-book-freshness`, from PR #21's head `24f83d1`. A new stacked PR, unmerged and linked to #21 and #5.

**Authorization:** the owner's standing D-WF-01.

## 1. What this slice is, and isn't
- **It is:** keeping Memory Book entries, approval status and newly requested exports current on every member's open book.
  - When another member adds, approves or revokes a note, an open book updates without leaving the screen.
  - Every new export (Markdown, PDF, share image) first gets a fresh, authorized approval snapshot.
- **It isn't:**
  - a change to who can see, add, approve or revoke notes;
  - new games, a visual redesign, public sharing, AI, a new dependency or a paid service;
  - a rewrite of room-state persistence.
  - The TV and spectators get nothing new.

## 2. The book revision (server)
- **What it is:** each room's book has a `revision`: a whole number, kept with the book on disk, separate from the room's ledger `seq`.
- **When it moves:** it goes up by exactly one inside `commitBook` (Stage 10.4, D-S104-06), on the staged copy, so it is written with the change and becomes live only once the write succeeds. So it never moves on:
  - a failed write;
  - a refused change;
  - an idempotent repeat (that returns before any commit);
  - a read or an export.
- **Old books:** a book saved before this stage has no `revision` and loads as `0`. Its first change makes it `1`. A missing, negative, fractional or non-numeric value also loads as `0`.

## 3. Reading it (server)
- **The snapshot:** `GET /rooms/:id/memory?revision=1` returns `{ revision, entries }`. It's for members of this room only (the existing session check). Without the parameter the reply is the plain entry list, as every existing caller expects.
- **The export:** `GET /rooms/:id/memory/export` adds `revision` next to `markdown`.
- **Telling members it moved:**
  - Member projections (audience player, host or cohost; never the TV or a spectator) carry `memoryRevision`. The 2-second poll and every pushed projection deliver it.
  - After a commit, the server also sends a small frame, `{ kind: "book", revision }`, to this room's member sockets whose credential is current. No other room's sockets, and never TV or spectator sockets, receive it.
  - Neither carries note text, facts, approval states or save keys. Clients fetch the snapshot to learn what changed.
  - A book change doesn't touch the ledger, a score or a game, and doesn't send a full projection broadcast.

## 4. A live book (web)
- **One authoritative copy per page:** the page keeps the newest revision it has heard of (from projections and frames; it only goes up) and the book it has applied (entries plus their revision).
- **Fetching:**
  - When the Memory Book is open and the heard revision is above the applied one, the page fetches the snapshot.
  - One fetch at a time. A frame that arrives during a fetch is remembered, and one more fetch follows if the reply is still behind.
  - A reply is applied only if it's for this room and its revision is above the applied one. Older and out-of-order replies are dropped.
- **When:**
  - on opening the book;
  - on a frame or a projection with a newer revision;
  - on reconnect and on returning to the page (the existing refresh brings a projection, and with it the revision).
- **Room switch or leave:** the book, its revision and any pending fetch are reset for the new room. Replies for the old room are ignored, and nothing is fetched after leaving.
- **What stays put:** the highlight draft, the Save a memory draft, focus, and the ledger watermark protections (Stage 10.2), which keep guarding which finish a new note cites.
- **No storm:** the ledger is fetched when `seq` moves, as before. The book is fetched only when its revision moves, never on a game tick.

## 5. Exports (web)
- **The Markdown on screen:** the export shown on screen belongs to a revision. When the book moves past it, the text is removed and the screen says "The book changed since this export. Export again for the current approvals."
- **Every new export gets a fresh snapshot first:** Markdown from the server's export, PDF and share image from `GET …/memory?revision=1`.
  - If that check fails (network, time-out, 401 or 403), nothing is downloaded, and it says so: "Couldn't check the latest approvals, so nothing was downloaded. Try again." It never falls back to the approvals already on screen.
  - The file is built from that snapshot's approved entries only, so pending and revoked notes stay out.
  - If a newer revision is heard while the snapshot is being fetched, the page fetches again, up to three times. If the book is still moving, the export is cancelled: "The book is changing right now, so nothing was downloaded. Try again in a moment."
  - The snapshot also updates the screen if it's newer than what's shown.
- **The honest boundary:** a file that has been downloaded can't be recalled. A revocation that commits after the export's final snapshot doesn't change that file. Only the next export reflects it.

## 6. Approve and revoke (web)
- **While a request is running:** each entry's Approve or Revoke shows its busy state, with the button off.
- **On failure** (server refusal, network, a 500 from a failed write): a message on that entry, such as "Couldn't approve it. Nothing changed; try again." The entry keeps its last authoritative state. No optimistic change, and no unhandled promise.
- **On success:** the page fetches the snapshot, so it shows what the server committed.
- **Losing the role:** Approve and Revoke come from the current role in the projection. When the host hands the role over, they disappear on the next projection (pushed at once), and the server refuses them anyway.
- **Losing the seat:** when the seat is replaced or signed out, the controls are removed, and exports fail visibly with the server's 401.

## 7. Target for healthy connected clients
- **With a live socket:** an open book shows another member's committed change **within 3 seconds**: the frame plus one fetch.
- **Without a socket:** with only the 2-second poll working, within 5 seconds.
- The browser journey measures both.

## 8. Decisions
D-S105-01 to D-S105-05 in `docs/DECISIONS.md`:
- a durable book revision, moved only by a committed change;
- revision-only notice, data by authenticated fetch;
- one ordered book per page;
- every export takes a fresh snapshot, fails closed and restarts on a newer revision;
- the export boundary.

## 9. Validation plan
- **Unit and HTTP** (`tests/stage105-book-revision.test.ts`):
  - the revision persists across a restart; old books load as 0;
  - failed writes, refusals and idempotent repeats don't move it;
  - the snapshot and the export carry it;
  - the frame reaches only this room's current members (no TV, spectator or other room) and carries no note text;
  - member projections carry the revision and the TV's doesn't;
  - guest, cohost and host permissions are unchanged;
  - revoked and pending notes stay out of fresh exports.
- **Pure** (`apps/web/src/ui/mchezo/lib/bookSync.ts`): reply ordering (stale, reordered and other-room replies dropped), the heard revision only rising, the export restart and cancel decision.
- **Browser** (a new `check-book-live` driver; the gate picks it up):
  - two open books (host and guest): add, approve and revoke each show on the other book within the target, and the drafts are kept;
  - a late, reordered reply is dropped;
  - a dropped and returned socket reconciles;
  - a room switch and leaving clean up;
  - fresh exports in each format;
  - an already-approved stale page asks for a PDF and an image after another page revoked: neither contains the revoked note;
  - the export check failing on the network: a visible failure, and no download;
  - both looks, 320 and 390 px.
- **Regressions:** `check-spectrum`, `check-jebena-rush`, `check-cup-memory`, `check-history-links`, `check-contrast`, `check-f4`, `check-f5`.
- **Gates:** targeted while developing, then fast and one full gate on the clean final candidate, run one after another. Every run's raw output is kept.

## 10. Estimate (after inspecting the delta)
| Step | Time |
|---|---|
| Spec, PR, links, acknowledgement | 0.5 h |
| Server: revision, snapshot, frame, projection field; HTTP and socket tests | 1 h |
| Web: ordered live book, export snapshots with restart and cancel, approve and revoke feedback, Markdown invalidation; pure tests | 1.5 h |
| Browser journey (`check-book-live`) | 1.5–2 h |
| Gates (targeted, fast, one full gate of about 33 min) | about 50 min |
| Evidence, docs, report | 0.5 h |
| **Total** | **about 6–6.5 h** |

**Calibration:** recent slices took 30–50% of their estimates. I expect about 3 h here and will report against the 6–6.5 h above.

## 11. As built and tested
| Area | Where | Tests |
|---|---|---|
| The book revision | `src/server/memorybook.ts`: `revision`, `bumpRevision`, carried by `clone`, `toJSON` and `fromJSON` (old or malformed books load as 0). `src/server/http.ts` `commitBook`: raised on the staged copy before the write, so only a committed change moves it. | `tests/stage105-book-revision.test.ts` (8) |
| The snapshot and export | `GET /rooms/:id/memory?revision=1` returns `{ revision, entries }` (the plain list without it); the export adds `revision` | the same |
| Telling members | Member projections carry `memoryRevision` (never the TV's or a spectator's). `notifyBook` sends `{ kind: "book", revision }` after each commit to this room's current member sockets only. | the same: who gets the frame, what's in it, and that a book change moves no ledger `seq` or room `rev` |
| One ordered book per page | `apps/web/src/ui/mchezo/lib/bookSync.ts` (`hear`, `accept`, `exportStep`, `exportIsStale`); `App.tsx` (`syncFor`, `fetchBook`, `syncBook`, `hearBook`; the ledger keeps its own `loadLedger`) | `tests/stage105-book-sync.test.ts` (10) |
| Exports and decisions | `MemoryScreen.tsx`: `latestSnapshot`, `runExport`, `exportMarkdown` (each fresh; restart, then cancel), the stale-Markdown notice, `decide` (busy, failure, no optimistic change), the export boundary sentence | `check-book-live` (39) |

### In real browsers (`check-book-live`)
- **Two open books:** Keku (host, Everyday, 390 px) and Amina (guest, Christmas, 320 px).
  - Baraka's add (through the API) showed on both books within 3 s. Keku's approve on his page showed on Amina's. Her unsent draft and its focus were kept throughout.
  - Five quiet seconds made no book fetch on either page.
- **Markdown:** a revoke took Keku's Markdown down within 3 s, with the notice.
- **Fresh exports:** Markdown, PDF and share image each held both approved notes. The PDF's bytes and the image's drawn text were read. Each export made its own snapshot fetch.
- **A stale page:** Keku's refresh was held, so his screen still showed a revoked note approved. His PDF and share image both left the note out, and the export's snapshot updated his screen. The held refresh, arriving late, changed nothing.
- **A reordered reply:** Amina's refresh was held while a newer change landed. Her export's newer snapshot showed first, and the older reply, arriving after it, didn't roll the screen back.
- **The export check failing:** with the snapshot request failing on the network, PDF and share image said "Couldn't check the latest approvals, so nothing was downloaded" and no file was downloaded. Markdown said the export couldn't load.
- **A failed approve:** a 500 showed the message on that entry, the entry stayed pending on both pages, and trying again worked.
- **Losing the role:** Keku handed the host role to Amina with a pending note on his open book. His Approve and Revoke were gone within 3 s, he saw who decides instead, she got them, and the server refused his approval (403).
- **Offline and back:** offline, Amina's page couldn't know of a change. Back online, it showed it, and her draft was kept.
- **No socket at all:** with the socket blocked, the 2-second poll brought a change within 5 s.
- **Leaving and switching:** in the lobby, a book change made no book fetch, and reopening showed it. Switched to another room, the page showed that room's empty book, and the left room's changes fetched nothing.
- **Regressions:** `check-cup-memory`, `check-spectrum` (10.3 Memory Book and 10.4 Save a memory), `check-jebena-rush`, `check-history-links`, `check-contrast`, `check-f4`, `check-f5`.

### Gates
Run one after another, each from a fresh clone of the exact commit. Raw output, including the cancelled run, is in `docs/evidence/gate-runs/<run>/`.

| Run | Commit | Kind | Verdict | Notes |
|---|---|---|---|---|
| `20261113-045353-963df5d0-6998` | `963df5d` | targeted (book-live, spectrum, jebena-rush, cup-memory, history-links, contrast, f4, f5) | PASSED (exit 0), 460 s | book-live 39, spectrum 199, jebena-rush 228 checks |
| `20261113-050156-963df5d0-8721` | `963df5d` | fast | PASSED (exit 0), 61 s | 1,705 unit tests |
| `20261113-050305-963df5d0-12145` | `963df5d` | full | **CANCELLED** (exit 130) after 71 s | I stopped it (SIGINT) four steps in, to add the role-loss check (B8b); a new commit needs its own gates anyway. 4 of 89 steps had run and passed; 0 failed. |
| `20261113-050546-6edb5881-16110` | `6edb588` | targeted (the same) | PASSED (exit 0), 463 s | book-live 44, spectrum 199, jebena-rush 227 checks |
| `20261113-051339-6edb5881-17762` | `6edb588` | fast | PASSED (exit 0), 57 s | 1,705 unit tests |
| `20261113-051445-6edb5881-21197` | `6edb588` | full | **PASSED (exit 0)**, 2012 s | 89 of 89 (the new driver is the 89th), no retries; book-live 44, spectrum 199, jebena-rush 227, tv-outage 14 checks |

`check-jebena-rush` counts 226 to 228 checks depending on how the match plays out (the 10.2 moment line is checked when a moment happened, and its absence when none did).
