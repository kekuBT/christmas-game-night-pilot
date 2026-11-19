# Fair game starts and clocks: H6/H7/M9 evidence (handoff 7004097156)

**What this is:** Claude's developer-run checks in headless Chromium, on this session's machine. It is not independent evidence, and not a real-device test.
- **The QA IDs** follow the report details in 7004164219: H6 readiness rows and starts; H7 actionable time, including previous feedback pushing the next controls down; M9 the ready heading, the confirm dialog and the rows disagreeing.
- **The direction** followed is 7004637491. **The decisions** are D-FS-01..05 in `docs/DECISIONS.md`.
- **Review 7007413347** (changes requested on M9, the refreshed confirmation) is answered on `84955a5`: see the last section before Limits.

## The builds measured (each web build from an exact source revision)
| Build | Source revision | What it is |
|---|---|---|
| Baseline | `da5ac0f740aab43c86fdaadd436f8c1b34802176` | #51's head; its runtime is byte-identical to the audited `72e9d8b` |
| Live comparison | `7097ac2` | the live beta's client. Its server code is byte-identical to the baseline's; it differs only in `App.tsx`, `intentRetry.ts` and `errors.ts` (uncertain delivery) |
| Fixed | `8f2ead3a6eb9aa6eb839c9b79b7735ae972e429e` | draft PR #52 |
| Review fix | `84955a5277dd1bef59e93c0be4c441cfc11b6ccd` | draft PR #52, after review 7007413347 (M2 only; see its section) |

**How each build was run:**
- **The server:** each run used the driver's fixture server from the fixed tree. The server code is identical across the three builds; only the web build changes.
- **The web app:** built with `vite build --config apps/web/vite.config.ts` from that revision.
- **The driver** is `scripts/check-fair-starts.mjs` at `8f2ead3`. The baseline and live runs used the same logic, before two header-comment edits.

## How it measures
**The server clock:** `scripts/lib/fair-start-server.ts` is the shipped `LocalServer` with `clock: () => t` and no background sweep.
- **Where it starts:** `t` begins at `2026-12-24T17:00:00Z`, and only the driver's `advance` moves it. Each advance then runs the lifecycle sweep once, as the 1 s timer would.
- **Exact instants:** every authoritative instant (a play start, a phase deadline, a Relay turn) is that clock's number.
- **The clock-to-wall link:** every broadcast is logged with both the server clock (`t`) and the wall time it went out (`wall`). A broadcast's `wall` is the zero of every lag below.
- **Test-only extra:** a `long-prompt` command gives one not-yet-open Closest Wins question a 196-character prompt.

**Six separate Chromium contexts:**
| Player | Viewport | Role |
|---|---|---|
| Keku | 390×844 | the host |
| Amina | 390×844 | |
| Baraka | 375×667 | |
| Wanjiru | 320×568 | |
| Zawadi | 390×844 | drops and reconnects |
| Juma | 390×844 | a slow phone, CPU throttled 6× by CDP; 400 ms emulated latency in case S only |

**In each page, before the app loads:**
- **Frames:** every WebSocket projection frame is recorded with its arrival wall time, and that frame's `playStartedAt`, phase deadline, game deadline, phase key, Relay `turnEndsAt` and `myTurn`.
- **The definition of an actionable control:** present, enabled (no `disabled` attribute, no `aria-disabled="true"`), and its whole box inside the viewport. It is measured by a MutationObserver plus a 20 ms scan, in the page's own `Date.now()`.
- **Gating:** a watch only counts after the page has received the frame it waits for: that game playing, in that phase, or a fresh `myTurn` for Relay's next runner. So a control left from the previous phase never counts as the next one's.
- **The negative control:** a `padding-top: 2400px` spacer pushes Keku's live Submit down. The same watch must report it present and enabled but **not** actionable (top 2879–3089 px of 844, in all three builds), and actionable again once the spacer goes.

**The real input path** (Closest Wins question 2, long prompt):
- **The hit test:** `elementFromPoint` at the centres of the input and of Submit must hit the controls themselves.
- **Taps:** a real mouse tap focuses the input, and the digits are typed.
- **Submit:** by a tap at its point (Wanjiru, 320×568), or by Tab then Enter (Baraka, 375×667). There is no scrolling, and the server must hold the guess.

**Automation versus players:** the driver also records its own sequential waits, as a QA script that checks phones one after another would see them.

## The runs (logs and JSON reports in `runs/`)
| Run | Web build | Result |
|---|---|---|
| `runs/baseline-da5ac0f.*` | `da5ac0f` | **8 FAILED**, 38 passed |
| `runs/live-7097ac2.*` | `7097ac2` | **the same 8 FAILED**, 38 passed |
| `runs/fixed-8f2ead3.*` | `8f2ead3` | **46 passed, 0 failed** |
| Targeted gate: fair-starts, briefing, closest, answer-reveal, relay, team-huddle | `8f2ead3` | `PASSED (exit 0)`, run `20261119-093030-8f2ead3a-10462`, 8/8 |
| **Full gate, `node scripts/gate.mjs full`** | `8f2ead3` | **`PASSED (exit 0)`, run `20261119-102025-8f2ead3a-2360`, 113/113** (Node v22.23.4, a clean tree) |

**The 8 failures on baseline and live:**
- **N-closest-wins:** Submit is not actionable at 375×667 and 320×568.
- **The real input path:** at 320×568 the tap path fails. At 375×667 the keyboard path submitted, but Submit was off screen.
- **M:** two failures, both with the title counting a snapshot over live rows.
- **L-closest-wins:** the late-Ready alert.
- **E:** two failures, both because no note shows on results.

**The gate records** are in `gates/`:
- **Run 1, `FAILED (exit 1)`:** an earlier full gate on the same `8f2ead3`, run `20261119-093227-8f2ead3a-11408`, finished with 111 passed and 2 failed. Its summary and both failing step logs are kept. That run used Node v22.16.0 from this session's private scratchpad.
  - **`check-release-package`:** the service user it runs the package as could not execute that private Node binary (`Permission denied`), so the failure came from the setup, not the code.
  - **`check-install`:** its last page load (`goto … waitUntil: load`) timed out after 30 s, at a load peak of 5.49 on 4 CPUs. The same step took 1.3 s in the passing `72e9d8b` full gate. Its cause is not established beyond that.
  - **No change was made after it.** Both drivers then passed on `8f2ead3` with the system Node (targeted run `20261119-101802-8f2ead3a-1289`), and the full gate was rerun once on the same revision, as earlier full gates were run.
  - **The verdict claimed is run 2's alone.** The results of different runs are not combined.
- **Before that:** a full gate on the superseded first commit `de569d2` was started and stopped at step 6/113 when the review direction arrived. It gives no verdict.

**Earlier, interim runs** are in `runs/earlier/`, from earlier drafts of the driver: baseline runs 1–2, the first live run, and the first fix `de569d2`. They are superseded by the three above and kept for the record.

## Results
**The time from the start broadcast to an actionable screen,** in each page's own time (ms, all six phones):
| Case | Baseline | Live | Fixed |
|---|---|---|---|
| A, all-ready, Closest Wins | 21–140 | 15–50 | 18–168 |
| A, all-ready, Team Huddle | 10–31 | 7–62 | 11–72 |
| A, all-ready, Relay | 13–63 | 19–54 | 15–67 |
| A, the sequential automation wait by the 6th phone (Closest Wins / Team Huddle / Relay) | 246 / 205 / 219 | 240 / 222 / 217 | 226 / 198 / 213 |
| N, Team Huddle question 2 after an early reveal | 5–17 | 7–19 | 6–14 |
| N, Relay's next runner | 7 | 15 | 12 |
| N, Closest Wins question 2 (long prompt) | **not actionable at 375×667 and 320×568** | **not actionable at 375×667 and 320×568** | 8–21 on all six |
| T, the tick start when a Ready player reconnects | 4–31 | 23–69 | 7–36 |
| R, a reconnecting player confirmed by the host | others 14–40; Zawadi 2,264 | others 10–65; Zawadi 2,271 | others 6–24; Zawadi 2,262 |
| S, 400 ms emulated latency on Juma | others 29–64; Juma 431 | others 16–64; Juma 728 | others 25–77; Juma 622 |

**Submit on Closest Wins question 2, with the long prompt:**
| Phone | Baseline | Fixed |
|---|---|---|
| 320×568 | 708–764 px (live: 751–807), not hit | 498–554 px, hit; the tap submitted 123 |
| 375×667 | 685–741 px | 475–531 px, hit; Tab and Enter submitted 456 |

## What the evidence says
### Not reproduced as a player-visible problem; the cause of the original observations is unknown
1. **H7, seconds of lost time at a start or a next phase:**
   - **The QA report's numbers:** Team Huddle Q1 seen with 9 s or 2 s left; Relay legs with 3–9 s of 20.
   - **Here:** every phone showed an actionable screen within 168 ms of the broadcast, the 6× throttled one included, on all three builds. Every phone's frame carried the server's own `playStartedAt` and deadlines.
   - **The report's runs** were six cloud desktop browsers driven one after another, with no simultaneous timestamps.
   - **Not established here:** sequential automation waits grow with each phone (about 0.2 s by the sixth here, and seconds once each phone also takes a screenshot), but this evidence does not establish that this caused the original observations.
   - **Native devices remain untested.**
2. **H6, "Ready pressed and disabled, the row still not ready, then play at 5/6":**
   - **What happens:** the last Ready starts play in the same server step. The ledger's sixth `ready-changed` and its `game-started` have the same instant in every A case.
   - **The timing:** the tapper's button is busy from the tap (59–126 ms after the click) until the start frame arrives (69–167 ms).
   - **The verdict:** no frame ever shows 6/6, so play appears to start "at 5/6" by design.
   - **The rows are accurate:**
     - `READY · 5 OF 6`, with only "Zawadi: not ready yet · reconnecting" in the confirm (R);
     - `READY · 6 OF 6`, with Zawadi's row "Ready · reconnecting" (T).
3. **All-ready versus the host's confirm, the final-ready/confirm ordering:**
   - **Ready first (C):** all-ready wins. The host's dialog goes with the briefing, the stale confirm returns `200 already-started`, and there is one `game-started`.
   - **Both in flight together (X1, X2):** exactly one transition each time, and both answers agree with it:
     - Ready first: `{accepted, started}` and `already-started`;
     - confirm first: `start-now`, and `READY_LOCKED` for the Ready.
   - **The late Ready (L):** the server records nothing for it.
4. **Z, over the whole run, on every build:** 13 briefings: 12 started exactly once and finished exactly once, 1 was cancelled, and none is left open.

### Confirmed on baseline and live, and fixed on `8f2ead3`
1. **H7, Closest Wins** (D-FS-02):
   - **The problem:** question 2's 40 s clock started while "Last question" sat above it, and Submit was below the fold (see the table above).
   - **After the fix:** the new question and Submit come first. With the long prompt, Submit is hit-tested and used without scrolling.
   - **Screenshots:** `screenshots/before-closest-q2-long-*.png` and `after-closest-q2-long-*.png`.
2. **H7, a late "I'm ready"** (D-FS-03):
   - **The problem:** "The game has already started." showed as an alert on Juma's first Closest Wins question (L).
   - **After the fix:** no alert. The server is unchanged: still `READY_LOCKED`, and no ready event.
   - **Screenshots:** `screenshots/before-late-ready-390x844.png` and `after-late-ready-390x844.png`.
3. **H6/H7, an expired briefing with the host's confirm open** (D-FS-04):
   - **The problem:** the briefing was cancelled once and never started, and the stale confirm was refused (`400`). But the host and guests, back on the previous results, were told nothing.
   - **After the fix:** "Game cancelled …" shows above those results as a `role="status"` region. It survives two later broadcasts, and does not appear on the next round's results.
   - **Screenshots:** `screenshots/before-expired-briefing-host-390x844.png` and `after-expired-briefing-host-390x844.png`.
4. **M9, the confirm dialog** (D-FS-05). The host opens Start now with 3 not ready, then Baraka and Wanjiru get ready, all on the same frame:

   | Build | Dialog title | Dialog rows | Heading |
   |---|---|---|---|
   | Baseline and live | "3 people aren't ready" | "Baraka: ready", "Wanjiru: ready", "Juma: not ready yet" | `5 of 6` |
   | Fixed | "3 people aren't ready" | "Baraka: not ready yet", "Wanjiru: not ready yet", "Juma: not ready yet" | `5 of 6` |

   - **On the fix,** the title and rows describe the snapshot, under "When you tapped Start now:". The live line reads "Since then: Baraka is ready now; Wanjiru is ready now."
   - **A withdrawal while open** is named ("Amina isn't ready any more"). Confirming then asks again with exactly Amina and Juma, and the second confirm starts play once.

**No server, timing, scoring or ledger change on `8f2ead3`.** `84955a5` adds two fields to one refusal's body (below); timing, scoring and the ledger are still unchanged.

## Review 7007413347: the refreshed confirmation (case M2)
**The race, as reviewed on `8f2ead3`:** when the server asked again, the replacement dialog paired the server's new ids with the rows captured before the request.

**Case M2 in `scripts/check-fair-starts.mjs`:**
1. Everyone but Baraka is Ready. The host opens Start now, which names Baraka only.
2. The host confirms, and that request is held on the host's network (a Playwright route).
3. Amina withdraws through her own Ready button, and the driver waits until the host's person rows show her as not ready.
4. The request is released. The server refuses with `READINESS_CHANGED`, naming Amina and Baraka.
5. Every frame of the host's screen is read for 1.5 s, all from the same rendered frame: the heading, the dialog's title, its rows, its "Since then" line, its label and the person rows.
6. The host confirms again, and the ledger must show exactly one `game-started`, `trigger: start-now`, with Amina and Baraka confirmed.

| Run | Tree and web build | Result |
|---|---|---|
| `m9-refresh/before-8f2ead3.*` | `8f2ead3` (server and web), with the new driver | **2 FAILED** (both M2), 48 passed |
| `m9-refresh/fixed-84955a5.*` | `84955a5` | **50 passed, 0 failed** |

**What the host saw after the refusal,** on the first frame read:

| Build | Title | Rows | "Since then" | Label |
|---|---|---|---|---|
| `8f2ead3` | "2 people aren't ready or aren't connected. Start anyway?" | "Amina: ready", "Baraka: not ready yet" | "Amina isn't ready any more." | "When you tapped Start now:" |
| `84955a5` | "2 people aren't ready. Start anyway?" | "Amina: not ready yet", "Baraka: not ready yet" | (none) | "When you confirmed, the game checked again:" |

- **On both builds,** the heading said `4 of 6`, and the person rows showed Amina and Baraka as not ready.
- **On `8f2ead3`,** the check failed: the first and the last of the 46 frames read both showed the disagreement above. The report keeps the first three disagreeing frames.
- **On `84955a5`,** none of the 47 frames read disagreed.- **The second confirm started play once on both builds:** the server's confirm rule is unchanged.
- **Screenshots:** `m9-refresh/before-M2-host-390x844.png` and `m9-refresh/after-M2-host-390x844.png`.

**The change** (D-FS-05, "The refreshed snapshot"):
- **The server (additive):** a `READINESS_CHANGED` refusal also carries `needsStatus`, each named player's `{ id, ready, presence }` at the refusal, and `rev`, the projection revision broadcast with it. The ids, the confirm rule, timing, scoring and the ledger are unchanged.
- **The client:** the replacement keeps the server's ids as sent and builds its rows from those facts. "Since then" stays quiet until the live rows are at least as new as the refusal.
- **Not covered by a browser case:** the opposite order, where the refusal reaches the phone before the withdrawal projection. M2 holds the request, so the projection always arrives first. That order is covered by the unit tests (`liveCaughtUp` by revision).
- **Tests:**
  - `tests/d3-briefing.test.ts`: the facts for a ready-but-reconnecting player and two not-ready players.
  - `tests/d3-briefing-http.test.ts`: the 409 body, its `rev` against the projection, and one start after the refreshed confirm.
  - `tests/fair-starts-ui.test.ts`: the pure helpers, including the fallback for a server that sends no facts.

**The gates on `84955a5`** (records in `m9-refresh/`):
- **Targeted** (briefing, fair-starts, team-huddle, answer-reveal, relay, closest): `PASSED (exit 0)`, run `20261119-112958-84955a52-29908`, 8/8.
- **Full, `node scripts/gate.mjs full`:** `PASSED (exit 0)`, run `20261119-113202-84955a52-30803`, 113/113 (Node v22.23.4, a clean tree).
- **Unit tests, lint and typecheck** on the same tree: 2,106 tests in 166 files passed; `eslint .` and both `tsc` projects were clean.

## Limits
- **Headless Chromium on one Linux machine:** throttling and latency are emulated. Real phones on Wi-Fi and cellular networks are untested; the queued iPhone retest can measure them.
- **The QA report itself** was read by ChatGPT (7004164219), not by this session. The cases follow its excerpts.
- **The frozen server clock:** between the driver's steps it is frozen, so a page's own countdown estimate runs ahead while frozen. That is display only; no measured control depends on it.
- **Screenshots are the driver's own,** from the three runs above. Their content differs between runs because the room's content rotation differs.
