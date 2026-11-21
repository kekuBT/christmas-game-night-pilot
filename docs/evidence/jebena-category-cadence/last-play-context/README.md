# Jebena Rush: the last-play line names the previous category after a change (review 7058749487)

- **The review:** [7058749487](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7058749487) (P2), acknowledged in [7058757460](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7058757460). The decision note is D-JR-02 in `docs/DECISIONS.md`.
- **Base:** `168e2af9` (#61's head; its code is the cleared cadence at `c041146`).
- **The fix commit, and the tested SHA:** `72a4b8a1c66226dace3c8b83711c8e1b558aa63a`.
  - This folder was added afterwards, in a docs-only commit.
- **Data:** synthetic, local only. Phones are emulated in headless Chromium. Paths are redacted.

## The defect
Right after a streak changed the category, the last-play line still read "Keku named “Boxing”." under the new category's heading, so the answer seemed to belong to the new category. On `168e2af`, after a streak in Animals:
- Amina's phone said **"You named “Cow”."** under **Countries in Africa** (`before/jrc-after-change-reload-320-christmas.png`);
- the TV said **"Amina named “Cow”."** under the same heading (`before/jrc-after-change-tv.png`).

## The repair (`72a4b8a`)
- **The server view** (`src/games/modules/jebena.ts`, `publicView`):
  - each accepted entry in the public log now carries its own category's public name (`categoryName`);
  - the name is worked out when the view is built, so a match saved before this gets it too;
  - only categories already played appear in the log, so nothing of an unused bank is added;
  - the saved state is unchanged.
- **The line** (`apps/web/src/ui/mchezo/lib/jebena.ts`, `lastPlayLine`) now takes the category on screen:

  | The last accepted answer | The line |
  |---|---|
  | in the category on screen | "Keku named “Apple”." (unchanged) |
  | in another category, with its name | "Keku named “Boxing” in Sports." |
  | in another category, no known name (an old or unknown entry) | "Keku named “Boxing”, before the category changed." (never a raw id or a guessed label) |
  | with no category id at all, or no category on screen | "Keku named “Boxing”." (as before) |

  - Timeout, out and sat-out lines are unchanged.
  - The current category stays in the heading, as before.
- **Where it shows:** every surface that has the line passes the current category:
  - the watching phone and the out phone (`MchezoJebena`);
  - the live TV (`JebenaTv`);
  - the TV final (`JebenaTvFinal`).
  - The holder's turn screen has no last-play line (it shows the answer box and the verdict), before and after.
- **No change** to scoring, the cadence, the turn clock or what is saved.

## Tests
### Unit: `tests/jebena-category-cadence.test.ts` (5 new, 16 in all)
| Test | On `168e2af` | On `72a4b8a` |
|---|---|---|
| The transition: "Keku named “Boxing” in Sports.", and "You …" for the player who named it | **FAIL** | pass |
| The same category: the plain line | pass | pass |
| Legacy or missing context: "…, before the category changed.", no `jr-` id; no id or no current category gives the plain line | **FAIL** | pass |
| A timeout line is unaffected by a change | pass | pass |
| Room engine: after a streak's change, every view (TV and both players) has the last accepted entry with the previous category's id and name; only played categories appear; the saved state has no `categoryName` | **FAIL** | pass |

- **Logs:** `base-168e2af-cadence-tests.log` (3 failed, 13 passed) and `fix-72a4b8a-focused-tests.log`.
- **The focused suites on `72a4b8a`, with the tree clean:** 14 files, **190/190**. They include all the Jebena suites, and the bank-privacy test (`stage91-bank-privacy`), since the view now carries category names.

### Browser: `scripts/check-jebena-categories.mjs`, new S5
**The setup** is the same as for the cadence: Keku at 390 px Everyday, Amina at 320 px Christmas, and a TV at 1440 px. The holder types a fresh answer and presses Enter.

**What S5 checks:**
- **Right after each streak change:**
  - the watching phone (the one that just answered) reads "You named “X” in <previous category>.";
  - the TV reads "<name> named “X” in <previous category>.";
  - the holder's turn screen has no last-play line.
- **After a reload of that phone:**
  - Christmas at 320 px after the first change;
  - Everyday at 390 px after the second;
  - the look is the one asked for, the line is the same, and there is no sideways scroll.
- **After the first accepted answer in the new category:** the plain line is back on that phone and the TV, with no category named.

| Run | Result | Log |
|---|---|---|
| `168e2af` (base, its own worktree and build, with the new check) | **FAIL**, 6 of 34: every S5 context check (for example `seen: {"phone":"You named “Cow”.","tv":"Amina named “Cow”."}` under Countries in Africa); its plain-line checks pass | `base-168e2af-check-jebena-categories.log` |
| `72a4b8a`, in the targeted gate below (its own build and server) | **pass**, 32/32, all six S5 checks | `gate-72a4b8a-targeted-check-jebena-categories.log` |

**Before the commit,** two runs on a development build of the same change passed, with 30 and 33 checks. The count varies with the seeded streak lengths.

**A correction during development:** the first draft of S5 also expected the line on the holder's phone. The holder's turn screen has never had one, so S5 now reads the watching phone and checks that the holder's screen has none.

## The gate on `72a4b8a`
| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted: `jebena-categories`, `jebena-rush`, `briefing`, `tv-show`, `tv-spectator`, `one-path` | **`PASSED (exit 0)`**, 8/8 | `20261121-064909-72a4b8a1-2324` | `gate-72a4b8a-targeted.txt`, `gate-72a4b8a-targeted-check-jebena-categories.log` |
| Fast: typecheck, lint, unit tests (174 files, 2189 tests), build | **`PASSED (exit 0)`**, 5/5 | `20261121-065152-72a4b8a1-3485` | `gate-72a4b8a-fast.txt` |

- **In the targeted gate:** `check-jebena-rush` passed 227 checks, and the briefing, TV and one-path checks passed too.
- **No full gate:** the review judged one unnecessary for this presentation-only repair. The change is one public-view field, one line helper and three callers.

## Screenshots
**`before/`, on `168e2af`:**
- `jrc-after-change-reload-320-christmas.png`: Amina's phone, "You named “Cow”." under Countries in Africa.
- `jrc-after-change-tv.png`: the TV, "Amina named “Cow”." under Countries in Africa.
- `jrc-after-change-reload-390-everyday.png`: Keku's phone after the second change, "You named “Cabo Verde”." under Vegetables.

**`after/`, on `72a4b8a`, taken by the targeted gate's run:**
- `jrc-after-change-reload-320-christmas.png`: Amina's phone after the first change and a reload in Christmas at 320 px, "You named “Cabo Verde” in Countries in Africa." under Vegetables. The line wraps onto two lines, with no sideways scroll.
- `jrc-after-change-reload-390-everyday.png`: Amina's phone after the second change and a reload in Everyday at 390 px, "You named “Cabbage” in Vegetables." under Animals.
- `jrc-after-change-tv.png`: the TV, "Amina named “Cabo Verde” in Countries in Africa." under Vegetables.
- `jrc-end-keku-390-everyday.png`, `jrc-end-tv.png`: the plain line after the next answer ("You named “Badger”." under Animals).

## Limitations
- **Chromium emulation only.** Native iPhone verification stays open for a device.
- **The holder's turn screen** has no last-play line, as before. The holder sees the new category in the heading and the input.
- **The legacy wording** ("…, before the category changed.") appears only for an entry whose category this bank does not know. Every current bank has a name, so in practice it would need an old or edited save.
