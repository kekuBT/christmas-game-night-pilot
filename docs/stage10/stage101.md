# Stage 10.1: Jebena cini cups and truthful result feedback

- **Handoff:** ChatGPT's 6820352096 on PR #17, which also cleared Stage 9.3.
- **The owner's request:** "Instead of hearts let's use cini/cup so when they miss the cup breaks."
- **Base:** `940df38` (PR #17's cleared head), on branch `claude/stage10-1-jebena-cups`, as a PR stacked on #17.
- **Authorization:** the owner's standing D-WF-01.

## 1. What this slice is, and isn't
- **It is:**
  - Jebena Rush's lives, drawn and worded as small handleless Ethiopian coffee cups (cini) on every surface that showed hearts;
  - a cup that breaks when a life is lost;
  - the carried result-copy contradiction: a survival winner told both "You won this one" and "You missed this one".
- **It isn't:**
  - a rule or score change (3/5/7 lives, default 5; 100 points per player outlasted plus 10 per life kept);
  - a protocol or storage rename;
  - humour, Memory Book saving, or any other game.
- **Spend:** no new dependency, no external or generated asset, no paid service, no deployment, no public port.

## 2. The cup
- **An original inline SVG** (24×24 viewBox), no photograph, watermark, emoji or mug. It shows:
  - a small handleless cup with a slightly flared rim and a short foot;
  - a white ceramic body with a dark outline, so it reads on light and dark backgrounds;
  - a thin teal rim stripe, a small red flower and green leaves.
- **Broken:**
  - the same cup split along a zigzag crack, with the right shard tipped away from the left so a gap shows, and a muted glaze;
  - intact and broken differ by silhouette (one piece, or two with a gap), not by colour alone.
- **Both looks:** the shape is the same in Everyday and Christmas. A seasonal look never turns it into a handled mug.

## 3. Where the cups appear, and the words
| Surface | Before | After |
|---|---|---|
| Lobby, host or cohost choice | "Hearts": `3 ♥` `5 ♥` `7 ♥`; "Each player starts with 5 hearts. Run out of time and you lose one; lose them all and you're out." | "Cups each": `3 cups` `5 cups` `7 cups`; "Each player starts with 5 cups. Run out of time and one breaks; when all of yours are broken, you're out." |
| Lobby, everyone else | "Everyone starts with 5 hearts (♥♥♥♥♥)." | "Everyone starts with 5 cups." plus five intact cups (decorative) |
| Briefing, phone and TV | "This game: everyone starts with 5 hearts (♥…)"; rules about losing a heart | "This game: everyone starts with 5 cups." plus the cups; rules: "Time runs out: one of your cups breaks, and a new category starts." · "When all your cups are broken, you're out. The last player with a whole cup keeps the jebena." · "…coming back gives no time or cups back." |
| Your cups (playing, watching, out) | ♥♥♥♡♡ 3/5, hidden once out | the cups, "3/5", accessible name "3 of 5 cups remaining". Once out: every cup broken and "Out". Hidden only after leaving |
| Seat list, phone and TV | ♥ per seat; "Out" or "Left" | cups per seat (compact); an eliminated seat shows every cup broken and "Out"; a seat that left shows "Left" with no cups |
| TV heading | "Jebena Rush · 5 ♥ each" | "Jebena Rush · 5 cups each" |
| Last play | "Amina ran out of time: 3 hearts left." · "Amina is out of hearts." | "Amina ran out of time: a cup broke (3 left)." · "…: the last cup broke." · "Amina is out: every cup is broken." |
| Out screen | "Out of hearts: watch the rest" | "All your cups are broken: watch the rest" |
| Refusal when out | "You're out of hearts. Watch the rest!" | "All your cups are broken. Watch the rest!" |
| Results rows, scoring | "3 of 5 hearts left"; "plus 10 for every heart you keep" | "3 of 5 cups whole"; "plus 10 for every cup still whole" |
| Library, settings refusal, Start refusal | "Time out and lose a heart"; "Hearts must be 3, 5 or 7."; "set to 5 hearts each" | "Time out and a cup breaks"; "Cups must be 3, 5 or 7."; "set to 5 cups each" |

Identifiers keep `hearts` (D-S101-02): the server state, the protocol, the `settings.hearts` key, test ids and data attributes. Only words and pictures change.

## 4. When a cup breaks
- **Only on an authoritative decrement.**
  - The count shown is always the server's (`me.hearts`, `order[].hearts`).
  - A cup breaks only when a later view of the same game and seat, on this page, shows fewer cups than the view before it (D-S101-03).
  - Exactly the newly lost slot breaks, and it stays broken in that slot: intact cups fill from the left, broken ones from the right.
- **Nothing else breaks a cup.**
  - **A wrong or repeated try:** costs nothing; the server rule is unchanged.
  - **A reconnect or a repeated snapshot:** shows the same count, so nothing changes.
  - **A reload:** shows the broken cups at once, without replaying a break.
  - **Leaving:** shows "Left" and no cups, so no cups break (D-S101-05).
  - **Play again:** a new game, so fresh intact cups.
- **The animation:**
  - about 600 ms, local to that cup: the crack shows and the right shard tips away;
  - nothing else moves; no flashing, confetti or sound, and controls are never blocked;
  - full motion only. With reduced motion or Animations "Off", the static broken cup shows at once.

## 5. Accessibility and layout
- **The number is always there:** "3/5" beside the cups, and an accessible name such as "3 of 5 cups remaining". At zero it says "0 of 5 cups: out".
- **Intact vs broken** differ by shape, not only colour (§2).
- **Seven cups fit a 320 px phone** in your own row and in the seat list. The category, the countdown, the answer field and Send stay reachable.
- **The TV** uses the same cups and reads the same public view; no projection changes.

## 6. Truthful result feedback
- **The defect:**
  - The results story (`apps/web/src/ui/mchezo/lib/celebrate.ts`) said "You missed this one" whenever a player had items and completed none.
  - Jebena Rush counts completed items as accepted answers.
  - So a survival winner whose tries weren't accepted, or who never needed one because the others' clocks ran out first, read "You won this one" beside "You missed this one".
- **The fix (D-S101-06):** "missed" needs evidence of absence:
  - no recorded action at all (the outcome's `participation.actions`, falling back to the completed count for a game that doesn't report actions);
  - and never for a player the result places first (alone or shared) in a game somebody won.
- **Unchanged:**
  - the zero-score, sat-out and "played part, then sat out the rest" lines;
  - competitive ranking and scores;
  - Spectrum's separate cooperative result.

## 7. Validation plan
- **Unit:**
  - the pure break detector: a decrement breaks the lost slots; the same count again breaks nothing; a first view or reload breaks nothing; a new game breaks nothing; 3/5/7 cups; zero, out and left;
  - the results story: a survival winner with 0 accepted answers (with tries, and with none) is never "missed"; a truly absent player still is; sat-out lines are unchanged; the line audit covers the new conditions.
- **Server:** unchanged. The existing Jebena tests cover one life per timeout, free wrong tries, sitting out and reconnecting.
- **Browser** (`scripts/check-jebena-rush.mjs`, extended):
  - cups in the lobby, the briefing, your own row, the seat lists and the TV;
  - a page observer that logs every cup break by surface, seat and slot:
    - a timeout breaks exactly the lost slot, once, on the holder's phone, the others' seat lists and the TV;
    - a wrong try breaks nothing;
    - the last cup breaks when a player is out;
    - a reload shows the broken cups with no break event;
    - repeated views never re-break;
    - Play again starts with whole cups;
    - with reduced motion, a break has no animation;
  - the count shown always equals the server's;
  - 320 and 390 px in both looks, and the TV;
  - the results copy for a zero-answer winner.
- **Screenshots:** before (`940df38`, hearts) and after (cups), on phones (320/390, both looks) and the TV.
- **Gates:** focused checks while developing; then one fast gate and one full gate on the final candidate. No full gate is repeated for docs-only changes.

## 8. Estimate
| Part | Estimate |
|---|---|
| Spec, decisions, PR | 0.5 h |
| The cup component and every surface's words | 1.5–2 h |
| Break detection and animation | 1 h |
| Result copy | 0.5 h |
| Unit tests | 0.5–1 h |
| Driver, before/after screenshots | 1.5–2 h |
| Final fast and full gates (about 35 min) and the report | 1 h |
| **Total** | **about 6.5–8 h** |

## 9. As built and tested
| Area | Where | Tests |
|---|---|---|
| The cup | `apps/web/src/components/mchezo/CiniCups.tsx` (`CiniCup`, `CiniCups`), `apps/web/src/ui/mchezo/styles/stage101.css` | Rendered checks in `check-jebena-rush` (whole and broken counts, accessible names, both looks, 320/390 px, TV) |
| When a cup breaks | `apps/web/src/ui/mchezo/lib/cups.ts` (`CupMemory`, `isLiveBreak`, `lastLossAt`, `cupSlots`, `cupsLabel`) | `tests/stage101-cups.test.ts`: first view, repeated view, one loss, the last cup, Play again, per-surface memory, live vs resync, leaving |
| Every surface's words | `MchezoJebena.tsx`, `Briefing.tsx`, `App.tsx`, `lib/jebena.ts` (last play), `lib/briefing.ts`, `lib/errors.ts`, `src/games/manifest.ts`, `registry.ts`, `settings.ts`, `server/room.ts` | `tests/stage101-cups.test.ts` (last play, briefing, refusal, library, tutorial, settings refusal); the driver checks no "heart" or ♥ on the lobby, briefing, play, results and TV |
| Rules unchanged | `src/games/modules/jebena.ts` untouched | `tests/stage101-cups.test.ts` (3/5/7, a wrong try free, one cup per timeout, scoring); the Stage 9.1/9.2 Jebena suites unchanged and passing |
| Truthful results | `apps/web/src/ui/mchezo/lib/celebrate.ts` (`absent` needs no recorded action and no first place in a won game), `types.ts` (`actions`) | `tests/stage101-cups.test.ts` (8; the 4 winner/attempt cases fail on the base); `tests/stage3-qa-results.test.ts` audit extended to first places with nothing completed |
| In real browsers | `scripts/check-jebena-rush.mjs` | A break log on every page. It checks: cups in lobby, briefing, own row, seat lists and TV; wrong tries break nothing; a timeout breaks exactly the lost slot, once, on the holder's row and the TV; a reload and a resync (Amina's socket cut by the driver) replay nothing; the last cup and "Out"; every break on every page is a real lost life (from the server's own totals), once; reduced motion breaks without animating; Play again starts whole, and two players leaving break nothing; seven cups fit 320 px; a third room's zero-answer survivor reads a winner's line, the absent player "You missed this one" |
| Gate hygiene | `tests/stage74-content-variety.test.ts` (D-S101-07; widened in the repair by D-S101-10, §10) | The setup tab gets a 5 s request timeout. After the repair, tabs without faults get 5 s and tabs with faults 2 s |

## 10. Repairs after review 6822605156
- **S101-R1, the deciding cup:** the timeout that decides the match ends it in the same snapshot, so phones went straight to results and the TV to its final screen, and the 1→0 break was never drawn. The repair makes the results themselves the cue (D-S101-08):
  - **Phone results:** every row draws the player's cups. Your own row continues your live row's memory, and the others continue the seat list's, so on a phone that watched the match the runner-up's last cup breaks once when the results appear. The runner-up is always row 2, on screen at 320 px.
  - **The TV:** Jebena Rush gets its own final screen: the winner line, the last play ("… the last cup broke.") and every player's cups. It continues the live seat list's memory, so the deciding cup breaks there once.
  - **Unchanged:** server finalization, scores, places and Play again. Nothing waits and no second loss is drawn. Reduced motion shows the still broken cups. A reload, a later visit or the post-game review shows them still.
- **S101-R2, continuity:** the cup memory was page-wide and keyed by game, seat and surface. Those ids repeat across rooms, and elapsed time can't tell a live loss from a quick resync. Now (D-S101-09):
  - **Scope:** the memory belongs to one room and seat (or one watched room). A different room, seat or watched room clears it.
  - **Epoch:** every loss of continuity starts a new epoch. That covers a socket closing, the staleness watchdog, the browser going offline, and the page coming back from the background. A count recorded in an earlier epoch can't break a cup: the next view is a first view.
  - **The time window stays** as a second guard, never the only one.
- **Estimate for the repair:**
  - code (R1 + R2): about 1.5 h;
  - unit tests: 0.5 h;
  - browser regressions: 1–1.5 h (the deciding timeout on phone and TV, a short reconnect inside the window, a same-tab switch between rooms whose game and seat ids collide);
  - one final fast and full gate: about 35 min;
  - docs and the report: 0.5 h.
  - **Total: about 4–4.5 h.**

### 10.1 As built and tested (repair)
| Area | Where | Tests |
|---|---|---|
| R2 scope and epochs | `lib/cups.ts` (`CupMemory.setScope`, `rebaseline`, records tagged with their epoch) | `tests/stage101-cups.test.ts` +5: the reviewer's repro (a rebaseline, then a lower count: no break); the next live loss breaks once; a room switch with colliding ids clears the memory; the same scope is a no-op; a row re-recorded per snapshot |
| R2 what App reports | `App.tsx`: `cupContinuity.setScope` per player room and seat, or per watched room. `rebaseline` on a socket close, staleness, offline, and `reconnectNow` (back from the background, online, pageshow). `snapshot` before every applied projection | In real browsers, below |
| R1 phone results | `MchezoJebena.tsx` `Standings`: every non-sat-out row draws cups. Your own row's key is your HUD's; the others' keys are the seat list's | Unit: the deciding cup on a HUD-keyed results row; Play again with a new game id starts fresh |
| R1 TV final | `JebenaTvFinal` (`tv-jr-final`), wired in `App.tsx` `renderFinal`; `stage101.css` (a compact heading, so every row is on screen at 1440 px) | In real browsers, below |
| In real browsers | `scripts/check-jebena-rush.mjs` | **R1**, on the match-deciding timeout itself (no final-loss exception any more):<br>- the TV breaks exactly one cup per lost life, the deciding one included;<br>- the TV final breaks the deciding cup once, animated, and says who won and how the last cup went;<br>- Keku's phone breaks it once on the results;<br>- the runner-up's own phone breaks it once (still under reduced motion);<br>- the runner-up's row shows 0 of 3;<br>- results equal the server's scores on all three phones; Play again starts everyone whole and breaks nothing on leaving.<br>**R2:**<br>- a short reconnect inside the 3 s window on Baraka's own turn (his sockets cut 1.5 s before the deadline, then closed and restored): the resync shows the lost cup broken without breaking it, and later live losses still break;<br>- one tab (no reload) moves from room B to a new room D whose game and seat ids collide with B's, 201 ms after D's first loss: no cup breaks. |
| Before and after | `docs/evidence/stage101-local/` | The repaired driver run against `f157422`'s build fails 10 checks (every R1 check, both R2 cases, Amina's resync replay, the TV's missing deciding cup, and cups breaking after the reconnect). The same driver passes on the repair |
| Gate hygiene | `tests/stage62-solo-shelf.test.ts`, `tests/stage74-content-variety.test.ts` (D-S101-10) | The fast gate on `3eb835d` failed on a solo-harness timeout, not on cups. The real-server harnesses now give passing requests 2 s (with faults) or 5 s (without). An injected 400 ms event-loop stall fails 4 of 5 tests in each harness before the change and none after |
| Gate hygiene | `scripts/check-tv-outage.mjs` (D-S101-11) | The full gate on `25c2814` failed one TV-outage check: a driver race, unchanged since Stage 5.1, where the "reconnected" note went away between counting it and reading it. Now it's one read. A 4.5 s gap injected between the old helper's two calls reproduces the gate's exact error; the same delay before the new single read passes |
| Gate hygiene | `scripts/check-jebena-rush.mjs` (D-S101-12) | The full gate on `36e222f` passed, but its Jebena run skipped the out-screen checks: Baraka went out on his R2 short-drop turn, and that branch skipped the out block. The out checks now run whichever turn takes the last cup, in their resync form when that phone was cut, and the driver fails if nobody's out screen was checked |

**Gates:** every run on every revision of the repair, the failed ones included, is listed in `docs/PROGRESS.md` (Stage 10.1 repairs), with raw output in `docs/evidence/gate-runs/<run>/`. The final candidate `0516e3e` passed its full gate `20261112-134811-0516e3ea-18196` (88/88).
