# Jebena Rush: the briefing describes the rules frozen in its match (review 7058937812, D-JR-03)

- **The review:** [7058937812](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7058937812), acknowledged in [7059096120](https://github.com/kekuBT/christmas-game-night-pilot/pull/51#issuecomment-7059096120). It cleared the last-play repair and held one finding from the cadence slice.
- **Base:** `3dd1bd9` (#61's previous head; its code is `72a4b8a`).
- **The fix commit, and the tested SHA:** `ffff88981d681f57ca8fd2f421290a05a694449f`.
  - This folder was added afterwards, in a docs-only commit.
- **Data:** synthetic, local only. Paths are redacted.

## The defect (reproduced on `3dd1bd9`)
A Jebena Rush match saved under rules version 1 (before D-JR-01) keeps version 1 when it is recovered: no streak changes. Its briefing still showed today's sentence, "After a run of 5 to 8 right answers, a new category starts.", on the phone and on the TV.

**Why:**
- the briefing's "How to play" steps came from one fixed table per game (`briefingRules`);
- the briefing projection (`briefingView`) carried no rules version;
- so every briefing showed today's rules.

**The version 1 save:** `tests/fixtures/jebena-v1-briefing.json` is an actual room snapshot written by the `af79b67` engine, with `make-v1-briefing.mts` in this folder.
- It is a casual room with Keku and Amina, and a Jebena Rush game in its briefing.
- Its state has `rulesVersion: 1`, `jr-jobs` and no streak.
- It is committed exactly as that engine saved it. Its players and recovery-token hashes are synthetic, like the other snapshot fixtures.

**The probe** (`v1-symptom.mts`), the review's check, run on each checkout. It recovers that save, reads the phone's and the TV's briefing entries and the rules copy they get, then readies both players and plays 8 accepted answers:

| Checkout | Result (`symptom-*.json`) |
|---|---|
| `3dd1bd9` | `{"savedBriefingRulesVersion":1,"projectedRulesVersion":{"phone":null,"tv":null},"phoneAdvertisesStreak":true,"tvAdvertisesStreak":true,"status":"playing","accepted":8,"categoryChanged":false}` |
| `ffff889` | `{"savedBriefingRulesVersion":1,"projectedRulesVersion":{"phone":1,"tv":1},"phoneAdvertisesStreak":false,"tvAdvertisesStreak":false,"status":"playing","accepted":8,"categoryChanged":false}` |

## The repair (`ffff889`)
- **`GameModule.rulesVersion?(state)`** (`src/games/modules/types.ts`), optional. Jebena Rush returns the version frozen in its state.
- **The briefing projection** (`briefingView` in `src/server/room.ts`) gives that number as `rulesVersion`, for every audience (the games list, a player's own games, the TV).
  - Nothing else of the state joins it: no seed, rotation, bank, used answers or streak count.
  - A game without the method gets no field.
- **`briefingRules(gameId, tutorial, rulesVersion)`** (`apps/web/src/ui/mchezo/lib/briefing.ts`):
  - **version 1:** the steps those matches were briefed with, which differ in one sentence: "Each answer counts once. Time runs out: one of your cups breaks, and a new category starts.";
  - **version 2, a missing version or an unknown one:** today's rules, unchanged.
- **Both surfaces** pass the match's version: the phone briefing (`BriefingScreen`) and the TV briefing (`BriefingTv`).
- **No change** to gameplay, scoring, clocks, the cadence or the last-play line. A version 1 match still plays version 1.

## Tests
### Server: `tests/jebena-briefing-rules.test.ts` (4 tests)
| Test | On `3dd1bd9` | On `ffff889` |
|---|---|---|
| The actual version 1 save, recovered: <ul><li>every phone entry (games list and own games) and the TV entry carry version 1, and their copy has the version 1 sentence and no "5 to 8";</li><li>no state reaches them;</li><li>both players ready, then 8 accepted answers stay in one category.</li></ul> | **FAIL** (no version in the projection) | pass |
| A fresh match is version 2: phones and TV carry 2, and their copy has the 5-to-8 sentence; no state reaches them | **FAIL** (no version) | pass |
| A game without a frozen version (Pattern Pulse) gets no field, and its usual rules | pass | pass |
| The shared copy: version 1 differs from today's in the streak sentence only; versions 2 and 99 get today's | **FAIL** | pass |

### Rendered: `apps/web/src/components/mchezo/BriefingRules.test.tsx` (3 tests)
These render the real `BriefingScreen` (a phone) and `BriefingTv` to markup:

| Test | On `3dd1bd9` | On `ffff889` |
|---|---|---|
| Version 1: neither surface promises the streak change; both show the version 1 sentence and "everyone starts with 5 cups" | **FAIL** | pass |
| Version 2: both surfaces say a run of 5 to 8 right answers changes the category | pass | pass |
| No version (an older server): today's rules, as before | pass | pass |

**Logs:** `base-3dd1bd9-briefing-tests.log` (4 failed, 3 passed) and `fix-ffff889-focused-tests.log`.

**The briefing secrecy test** (`tests/d3-briefing.test.ts`, D3 S5) flagged the new key on its first run.
- It treats every string in a game's state as a secret, including key names.
- It now allows exactly the key name `rulesVersion`, like its existing exception for teams. It also asserts that the value equals the version frozen in the match.
- Every other string in the state is still checked against every audience: 73/73 pass.

**Focused suites on `ffff889`, with the tree clean:** 16 files, **267/267** (`fix-ffff889-focused-tests.log`). They cover the new tests, the cadence and last-play tests, every D3 briefing suite, the Jebena suites, bank privacy and persistence.

### Browser: `scripts/check-jebena-categories.mjs`, new S0
A fresh match, before play: the briefing's steps on Keku's phone (390 px Everyday), Amina's phone (320 px Christmas) and the TV (1440 px) each say "After a run of 5 to 8 right answers, a new category starts." In the targeted gate on `ffff889`, the check passed 35/35, with all three S0 checks and the six S5 last-play checks.

## Gates on `ffff889` (each verdict belongs to its own run; the tree was clean)
| Gate | Verdict | Run | Summary |
|---|---|---|---|
| Targeted: `jebena-categories`, `jebena-rush`, `briefing`, `tv-show`, `tv-spectator`, `one-path` | **`PASSED (exit 0)`**, 8/8 | `20261121-071952-ffff8898-3037` | `gate-ffff889-targeted.txt`, `gate-ffff889-targeted-check-jebena-categories.log` |
| Fast: typecheck, lint, unit tests, build | **`PASSED (exit 0)`**, 5/5 (176 files, 2196 tests) | `20261121-072215-ffff8898-4137` | `gate-ffff889-fast.txt` |

- **In the targeted gate,** `check-jebena-rush` passed 227 checks.
- **No full gate:** the change is one public briefing field, its copy and two callers. The review asked for focused tests and the relevant targeted verdict.

## Limitations
- **No browser run of a recovered version 1 briefing.**
  - The fixture holds only recovery-token hashes, so a browser cannot sit at its players' seats.
  - Its fixed 2027 timestamps would also need rewriting for a live server.
  - So version 1 is covered at the projection (server) and rendered-component levels. The browser covers fresh version 2 on both phones and the TV.
- **Chromium emulation only.** Native iPhone verification stays open for a device.
