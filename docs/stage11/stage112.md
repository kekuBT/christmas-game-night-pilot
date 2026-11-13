# Stage 11.2: readable casual Memory Books

**Instructions:** ChatGPT's handoff 6850906565 on PR #23. That comment also cleared Stage 11.1 on `f944b3f`/`602b73d` for development.

**Branch:** `claude/stage11-2-readable-books`, from PR #23's head `602b73d`. It's a new stacked PR, unmerged, and linked to #23 and #5.

**Authorization:** the owner's standing D-WF-01.

## 1. What this slice fixes, and what it doesn't
Two existing problems, both seen in ChatGPT's audit of a casual room:
1. **"Day 1" in casual rooms.** A casual room's book labels every entry "Day 1": on the badge, the results line, the link preview, the PDF and the Markdown. Casual rooms have no Family Cup days, so the label implies a Cup day that doesn't exist.
2. **Internal ids in exports.** PDF and Markdown exports print competitive facts as `player-1: 480 points`, while the screen shows names.

**It isn't:**
- a change to scores, Cup rules, approvals, revocation, export freshness, room isolation or the look;
- a redesign;
- new game numbering;
- AI, telemetry, deployment or a new dependency.

## 2. What exists today
- **Entries:** `MemoryBookEntry` (`src/server/memorybook.ts`) has `day`, `text`, `sourceEventIds`, `derivedFacts`, an optional `team`, and the approval fields.
  - `day` is whatever the client sends, which is the room's current championship day. Every page sends `proj.championshipDay`, which is always 1 in a casual room.
  - In a Cup room, a note added on Day 2 about a Day 1 game is filed under Day 2. That's the same defect in Cup form.
- **Competitive facts:** `derivedFacts` holds server-written strings, one per score event of the cited game, in exactly the form `${playerId}: ${points} points`.
  - The screen maps ids to names (`readableFact`).
  - The PDF (built on the client) and the Markdown (`exportMarkdown`, on the server) print them raw.
- **Room kind:** `cup`, `casual` or `solo`. It's fixed when the room is created (`RoomEngine.kind` is `readonly`).
  - Every game records its own `day`, the championship day it started on.
  - Players are never removed from a room (`player-N` ids are never reused) and display names never change. A same-room lookup by id is therefore reliable.

**Consumers of the day label and the facts:**

| Consumer | Where | Today |
|---|---|---|
| Entry badge | `MemoryScreen.tsx` | `Day {e.day} · approved` / `· pending` |
| Results line | `MemoryScreen.tsx` `results()` | `{title} · Day {g.day ?? e.day}: names and scores` |
| Link preview (before adding) | `MemoryScreen.tsx` | `Linked to {title} · Day {n}: …` |
| PDF | `MemoryScreen.tsx` `downloadPdf` | `{note} (Day {e.day})`, then `From the ledger: player-1: 480 points` |
| Markdown | `memorybook.ts` `exportMarkdown` | `## Day {e.day}`, `Note: …`, `- player-1: 480 points` |
| Share image | `MemoryScreen.tsx` | note text and team line only (no day, no ids). Unchanged. |

## 3. The design
### 3.1 One presentation rule, shared by screen, PDF and Markdown
- **Where:** a new module, `src/shared/memoryPresent.ts`, used by both the server (Markdown) and the web (screen, PDF), the way `memoryTeam.ts` already is.
- **The source's mode:**
  - It's `entry.source.mode` when present (new entries).
  - Otherwise it's the room's kind (older entries): a room's kind never changes, so an older entry in a casual room was made in a casual room.
  - `cup` shows a day. `casual` (and `solo`) never does.
  - It's **never** taken from the look, the content pack, or a later room setting.
- **The day label:**
  - **Cup:** "Day N", where N is the cited game's own day. If an entry ever cites games on different days, it's "Days 1, 2".
  - **Casual:** no day label. The entry is identified by its source game's title, e.g. "Trivia Showdown · approved" and a Markdown heading "## Trivia Showdown".
  - No numbering is invented.
- **Competitive facts as readable lines:** each fact becomes "Name: N points".
  - The name comes from the entry's recorded players (new entries).
  - Otherwise it comes from the room's own players, looked up by id (older entries).
  - Otherwise it's "A player". An internal id is never printed.
  - Two different players with the same name in one entry (only possible through a corrupted or hand-edited file, since names are unique within a room) become "Ada" and "Ada (2)", in id order.
- **Team facts** (Spectrum) keep their existing shared line unchanged.

### 3.2 What a new entry records (server-verified, additive, optional)
Each new entry gets `source`:
```ts
source?: {
  mode: "cup" | "casual";                // the room's kind ("solo" counts as casual)
  days?: number[];                       // cup only: the cited games' own days, sorted and unique
  titles: string[];                      // the cited games' titles, in citation order
  scores?: { playerId: string; name: string | null; points: number }[]; // competitive: one per derived fact, same order
}
```
- **Everything comes from the server's own state at creation:**
  - `mode` from the room's kind;
  - days and titles from the cited games;
  - scores from the same score events `derivedFacts` is built from;
  - names from the room's players at that moment, or `null` if the id isn't a player.
- **Nothing comes from the request.**
  - The request's `day` stays in the save fingerprint (Stage 10.4 idempotency) but no longer decides the label.
  - `entry.day` becomes the first cited game's own day; for a casual room's games that is 1, as before.
- **`derivedFacts` is unchanged** for every entry, new or old. It stays the exact server-derived fact list, and `source.scores` is its readable twin.
- **Validation on restore:** strict Zod. An invalid `source` is dropped (the entry falls back to the older-entry rule). The whole book is never refused for it, because it only affects how an entry is shown. A team record keeps its existing stricter rule.

### 3.3 Exports
- **Markdown (server):**
  - The heading is "## Day N" for Cup entries and "## {game title}" for casual ones.
  - Facts are readable lines. The "From the ledger:" and "From the game:" labels stay.
  - **Escaping:** the note, names, titles and the room name are escaped. Newlines are collapsed to spaces, and exactly ``\ ` * _ [ ] < > # | ~ &`` get a backslash. So nothing typed can make a heading, a Markdown link, an image or HTML, or break the layout.
    - `(`, `)` and `!` stay as typed, since they're inert once `[` and `]` are escaped.
    - **Limitation:** a renderer with GitHub's autolink extension may still link a bare web address typed in a note. The link text is the address itself, so nothing is hidden.
  - `Sources:` (event ids, not people) stays.
- **PDF (web):**
  - The note is followed by "(Day N)" for Cup entries and "({game title})" for casual ones.
  - Facts are readable lines with "From the ledger:" or "From the game:".
  - jsPDF prints text as text, so there's no injection. Long names wrap with the existing line splitter and pagination.
  - **Characters the font can't print (D-S112-04, added during this stage):**
    - The built-in font covers Windows-1252 only, and any other character used to garble its line.
    - Every line now goes through `pdfText`: characters outside Windows-1252 print as "?".
    - Names that print alike are told apart ("??", "?? (2)").
    - If anything was replaced, one closing line says so and points to the Markdown export, which keeps everything.
- **Unchanged:**
  - every export takes a fresh approval snapshot, and unapproved or revoked entries are excluded;
  - a failed check downloads nothing;
  - the share image's 8-entry limit and wording;
  - filenames.
  - A file already downloaded keeps the honest limitation stated in D-S105-05.

### 3.4 Older rooms and evidence
- **No migration and no rewrite.** Older entries keep their stored fields and gain nothing. They're shown by the older-entry rule: the room's kind and the same-room name lookup.
- **Older Cup entries: the day comes from the room's citation (changed by ChatGPT's spec feedback 6851031292; D-S112-05).**
  - The first version of this spec kept an older entry's stored day. That can be the day it was added (a Day 2 note about a Day 1 game).
  - Now, at read/export time, an older entry's day comes from the same room's citation: each cited finish, its game, and that game's recorded day.
  - If that can't be verified (a cited finish or game the room doesn't have), there's no day label, never the stored day.
  - The same path names an older casual entry's game.
  - It's one rule for the screen, the PDF and the Markdown. The stored entry is unchanged.
- **Older books still load,** and presentation data can't change stored facts. A restored entry's facts, their order and their points are always its stored `derivedFacts`. A recorded name is used only when its player id and points match that fact.

## 4. Acceptance
1. **Two casual games:** two finished casual games give correctly linked entries. There's no "Day 1" in the book, its link preview, badges, results lines, new PDF or new Markdown. Each entry is identified by its game's title.
2. **Cup days are right:** a Cup entry shows its game's day, including when it's added on a later day. Ending a day doesn't change it.
3. **Readable, unchanged facts:** approved competitive exports show names with exactly the stored points.
   - These cases behave deterministically and safely: an id that isn't a player, a duplicate name, Unicode and 32-character names, and older entries.
   - Unapproved and revoked entries stay out.
   - Names and notes can't inject Markdown or HTML, or break the layout.
   - No session credential or private answer appears.
4. **Usable everywhere:** both looks at 320 and 390 px. A look switch keeps the draft and the entry's source identity, because mode comes from the server, never the look.
5. **Nothing else moves:** older rooms and evidence stay readable, and score calculations and Cup rules don't change.

## 5. Validation
- **Pure and HTTP tests (`tests/stage112-readable-book.test.ts`):**
  - the shared rule: mode, day label, readable facts, the fallback, duplicates, escaping;
  - new entries' `source` (mode, the game's own day on a later day, titles, names);
  - nothing taken from the request;
  - older entries in casual and Cup rooms;
  - an invalid `source` dropped on restore;
  - Markdown for a casual room and a Cup room;
  - unapproved and revoked entries excluded;
  - injection attempts in notes and names.
  - **Added during the work:**
    - the PDF's printable text, run through real jsPDF (D-S112-04);
    - the older-entry day rule (D-S112-05);
    - over HTTP, books rewritten on disk while the server is down and then restored: a Day 2 note about a Day 1 finish, a citation the room lacks, and forged presentation data.
- **Browser:**
  - `check-book-live` (a casual room) gains checks:
    - R1–R3: no "Day 1" anywhere in the book; the PDF and Markdown use names, not ids, and have no "Day";
    - R4: players named 李雷, 王芳 and Łukasz; the downloaded PDF has no unreadable line, and the Markdown keeps every name.
  - `check-cup-memory` (a Cup room) gains:
    - a later-day entry showing its game's own day;
    - a restored older Day 2 note about a Day 1 finish, checked on screen, in the downloaded PDF and in the Markdown.
  - Both download a PDF and a Markdown file as examples.
  - Kept: `check-warm-ivory`, `check-themes-seasonal`, `check-spectrum`, `check-jebena-rush`, `check-f4`, `check-f5`, `e2e`.
- **Gates:** focused tests and targeted drivers during work; fast once and **one** full checkpoint gate on the clean final SHA.

## 6. Estimate
These are separate, because gates take wall time while the code doesn't change.
- **Implementation:** about 2–2.5 h.
  - the shared rule and its tests: 40 min;
  - the server entry `source`, Markdown and restore: 30 min;
  - the web screen and PDF: 30 min;
  - the drivers: 30 min;
  - examples and docs: 15 min.
- **Gates:** about 45 min.
  - a targeted run: about 8 min;
  - fast: about 1 min;
  - the full checkpoint: about 35 min, going by the last two runs (34.5–35.5 min); that's not a promise.
- **Calibration:** Stage 11.1 came in at about 1 h of work plus 1 h 22 min of gates, because a full gate had to be repeated.

## 7. The preview recipe
Stage 11.1's §9 holds.

**Addition from ChatGPT's 11.1 audit:** after the preview server restarts, the browser's GitHub forwarded-port session can be stale, and a change then gets 401. A normal top-level reload of the page refreshes it: it goes through `pf-signin` and back to the app automatically. That's preview access, not an app defect, and needs no credentials.

## 8. Results
**The tested candidate is `adf6e8d`.** Later commits are docs and evidence only.

**Also covered:** ChatGPT's spec feedback 6851031292 on this PR (6:06 a.m. ET). I didn't read it until about 6:50 a.m. ET, after gates on `9d19970` had begun; see below.

### 8.1 What was built
- **D-S112-01 to 03 (the spec as written):**
  - one presentation rule;
  - new entries record their source (mode, the games' days and titles, players' names);
  - a casual book has no "Day";
  - a Cup note is filed under its game's day;
  - exports print names, never ids;
  - Markdown is escaped.
- **Found and fixed by the gates and my own checks:**
  - **The escaper also escaped `( ) !`** (targeted gate 1, check-spectrum M3), so a Spectrum team line "(fewer than two players were left)" exported with backslashes. It now escapes exactly the spec's characters (`6cae259`).
  - **The badge's new `data-testid` renamed an element's key in the Everyday computed-style baseline** (targeted gate 1, check-warm-ivory W8). The colours themselves were identical. The test id was dropped and the baseline left as recorded (`6022bfa`).
  - **check-warm-ivory W6 raced:** it used `isVisible({ timeout })`, which never waits. Reproduced deterministically with a 250 ms answer delay, and fixed (`015464c`).
  - **D-S112-04: the PDF's built-in font prints Windows-1252 only,** and any other character garbled its whole line. A name like 李雷 or Łukasz would have printed wrongly in fact lines. Every PDF line now prints only characters the font has, with "?" otherwise. Names stay distinct, one closing line says so, and the Markdown keeps everything (`9d19970`).
- **D-S112-05 (spec feedback 6851031292):** an older Cup entry's day comes from the room's citation at read/export time. If that day can't be verified, there's no day label. The stored entry is unchanged (`4c05450`, `adf6e8d`).

### 8.2 Acceptance
1. **Two casual games, no "Day 1":** check-book-live R1–R3, the HTTP test, and the before/after captures. Before, "Day N" appeared 7 times on screen; after, 0, in both looks at 320 and 390 px. The PDF and Markdown have no "Day" and no ids.
2. **Cup days are right, also later:**
   - a new note added on Day 2 about a Day 1 game is filed under Day 1 (check-cup-memory, HTTP test);
   - a restored older one reads Day 1 on screen, in the PDF and in the Markdown, with its stored day 2 untouched (check-cup-memory, HTTP test).
3. **Readable, unchanged facts:**
   - names, with exactly the stored points;
   - "A player" for an id that isn't a player;
   - duplicates as "Ada (2)" in id order;
   - names in other scripts: the PDF prints "?" without garbling, and the Markdown keeps them in full;
   - older entries: same-room names;
   - unapproved and revoked entries excluded;
   - injection escaped;
   - forged presentation data on disk can't change a fact or a point.
4. **Usable:** both looks at 320 and 390 px with no sideways scrolling (captures). A look switch keeps the draft (check-warm-ivory W6). The mode comes from the server, never the look.
5. **Nothing else moves:** older books load unchanged; `derivedFacts`, scores and Cup rules are untouched; the full gate (below).

### 8.3 Gate runs (each verdict is one run on one revision)
| Revision | Gate | Run | Verdict |
|---|---|---|---|
| `9e85bd5` | targeted (10 drivers) | `20261113-111520-9e85bd5f-5011` | **FAILED**: check-spectrum M3 (escaper) and check-warm-ivory W8 (baseline key) |
| `015464c` | targeted (10 drivers) | `20261113-113634-015464ce-14630` | PASSED |
| `9d19970` | targeted (6 drivers) | `20261113-114449-9d19970e-20895` | PASSED |
| `9d19970` | fast | `20261113-114718-9d19970e-23097` | PASSED |
| `9d19970` | full | `20261113-114827-9d19970e-26589` | **CANCELLED** by me after 3 steps (superseded by D-S112-05) |
| `adf6e8d` | targeted (6 drivers) | `20261113-115657-adf6e8db-31605` | PASSED |
| `adf6e8d` | fast | `20261113-115927-adf6e8db-1236` | PASSED |
| **`adf6e8d`** | **full (checkpoint)** | `20261113-120037-adf6e8db-4741` | **PASSED** (90/90, exit 0, 34 min 20 s) |

Raw logs are in `docs/evidence/gate-runs/<run>/`, and local runs in `docs/evidence/stage112-local/`.

### 8.4 Estimate vs actual
- **The estimate:** about 2–2.5 h of implementation plus about 45 min of gates.
- **The actual:**
  - the handoff came at 5:59 a.m. ET;
  - spec and acknowledgement at 6:03;
  - the first implementation commit at 6:13;
  - then the gate-found fixes, the PDF fix and the D-S112-05 change, with the last code commit (`adf6e8d`) at 6:56, about an hour after the handoff;
  - gates: about 8 + 8 + 2.5 + 1 + 3 (cancelled) + 2.5 + 1 min, plus the full run (34 min 20 s).
- **Why it differs:** implementation took about an hour, against 2–2.5 h estimated, even with three gate-found problems and one review round. Gates took more than the 45 min estimated: one failed targeted run, one cancelled full run, and a second targeted, fast and full on the final candidate.

### 8.5 Limitations
- **The PDF can't show letters outside Windows-1252.** They print as "?", and the PDF says so. Embedding a Unicode font is a separate decision (size and assets).
- **Bare web addresses:** a renderer with GitHub's autolink extension may link one typed in a note. The link text is the address itself, so nothing is hidden.
- **Fact lines per event:** the PDF and Markdown list one fact line per score event (30 for a 3-player, 10-question game), as before. Totals are on the screen only.
- **Not run on real devices:** no real iPhone Safari, Android Chrome or TV. Desktop Chromium only.
- **A file already downloaded** keeps the honest limitation in D-S105-05.
