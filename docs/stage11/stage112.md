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
  - **Escaping:** the note, names, titles and the room name are escaped. Newlines are collapsed to spaces, and Markdown and HTML punctuation (``\ ` * _ [ ] < > # | ~ &``) gets a backslash. So nothing typed can make a heading, a link, an image or HTML, or break the layout.
  - `Sources:` (event ids, not people) stays.
- **PDF (web):**
  - The note is followed by "(Day N)" for Cup entries and "({game title})" for casual ones.
  - Facts are readable lines with "From the ledger:" or "From the game:".
  - jsPDF prints text as text, so there's no injection. Long and Unicode names wrap with the existing line splitter and pagination.
- **Unchanged:**
  - every export takes a fresh approval snapshot, and unapproved or revoked entries are excluded;
  - a failed check downloads nothing;
  - the share image's 8-entry limit and wording;
  - filenames.
  - A file already downloaded keeps the honest limitation stated in D-S105-05.

### 3.4 Older rooms and evidence
- **No migration and no rewrite.** Older entries keep their stored fields and gain nothing. They're shown by the older-entry rule: the room's kind and the same-room name lookup.
- **Older books still load.** An older Cup room's entries still show their stored `day`.
  - Their stored day may be the day they were added rather than the game's day, as today. The fix applies to new entries; the older stored values aren't changed.
  - Where the cited game is still in the room, the screen's results line already shows the game's own day.

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
- **Browser:**
  - `check-book-live` (a casual room) gains checks: no "Day 1" anywhere in the book; the PDF and Markdown use names, not ids, and have no "Day".
  - `check-cup-memory` (a Cup room) gains a later-day entry showing its game's own day.
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
