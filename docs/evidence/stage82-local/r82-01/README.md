# Repair R82-01 (ChatGPT's review 6799134510): a choice this device can't save was undone

**The finding.** When `localStorage` writes failed, choosing Christmas content on the solo shelf, or the Christmas look in Settings, was undone at once. On `c27570f` the setter updated React state, swallowed the failed write, then announced the change in the same tab, and every listener re-read the stale or default value from storage. A device with full or blocked storage could not choose Christmas at all.

**The repair** (`apps/web/src/ui/mchezo/deviceChoice.ts`, used by `ui/mchezo/look.ts` and `solo/soloSeason.ts`):
- **This page's choice is authoritative:** it is held in memory and shared by every screen through one store (`useSyncExternalStore`), whether or not it could be saved.
- **Same-tab readers** read that memory, never storage.
- **Other tabs:** a successful save in another tab still arrives through the `storage` event, and the newer choice is taken.
- **Nothing unsaved is promised:** when a write fails, the shelf, the Word Connections start screen and Settings say the choice applies until reload.
- **After a reload,** an unsaved choice falls back to what storage holds.
- **Unchanged:** the pending-start, active-round and replay rules from feedback 6795825877. A pending solo press keeps its content, and Play again repeats its round's.

**The check: `scripts/check-themes-seasonal.mjs`, section F, Chromium emulation.** It covers three storage modes:
1. writes throw and nothing is stored;
2. writes throw and an older Everyday choice is stored;
3. every `localStorage` access throws (`sessionStorage` is left working, as the review's reproduction did).

Each mode checks the following:
- Settings → Look → Christmas stays chosen and the page turns Christmas.
- Choosing Christmas on the shelf stays chosen, in the Christmas look.
- Shelf → Word Connections: the Start reaches the server as Christmas and deals a Christmas board.
- The round keeps the Christmas look and label.
- The notes say "until you reload".
- After a reload, the page falls back to storage cleanly, with no page errors.

| Revision | Section F | File |
|---|---|---|
| `c27570f` (reviewed) | **19 of the new checks FAIL**: the choice snaps back to Everyday, and the solo Start goes out as Everyday | `check-themes-seasonal-on-c27570f.log` |
| the repair (working tree) | all pass; 166 checks in the driver | `check-themes-seasonal-repaired.log` |

**Unit tests** (`tests/stage82-look.test.ts`, 5 new) call the real setters (`writeLookPref`, `writeSoloSeason`) in four storage modes: writes throw with nothing stored, writes throw with an older value stored, every access throws, and no storage at all. After each failed write, the reader returns the new choice and `saved()` is false. A working store saves. On `c27570f` these fail: `writeLookPref` didn't exist, and `readSoloSeason` returned the stale stored value.

**Regression drivers rerun after the repair**, with 0 failures (logs `*-s82r.log`, `*-s82s.log`): solo, solo-shelf, mobile-everyday, casual, session-flow, lobby-fixes, contrast, reduced-motion, a11y-surfaces and content-variety.
