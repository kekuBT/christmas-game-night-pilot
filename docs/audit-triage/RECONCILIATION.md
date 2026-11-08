# Live audit triage: reconciliation (branch `claude/audit-defect-triage`)

**Source:** the independent audit package (`AUDIT-REPORT.md`, `ISSUES.md`, `TEST-MATRIX.md`, 77 local screenshots, live result PDFs), treated as external evidence.

**Baseline:** branch `claude/d3-briefing` at `0cfb50d`. Local and `origin` were identical when this pass started. The triage branch starts there.

**About the preview's identity:**
- The preview behaved like D3, and its D3 quotes match the code word for word. For example: "Nobody's clock is running yet…", "Their clocks start too. They keep their seats and can still play.", "Start everyone's clock".
- Its exact commit is unproven.
- Several other quoted strings exist in **no commit on any branch** of this repository: "Word Assembler", "Caption Contest", "Impostor Hotseat", "Who Said It?", "It's the host's job to move the game on", "You're not in the Cup yet", "POINTS TO TARGET". Those observations (A-11, A-15, A-16, A-18) can't come from this code as recorded, and need a live screenshot before any action.

**How each finding was reproduced:** on the D3 build, served locally, with Chromium (Playwright).
- **Widths:** 375, 390 and 430 px; also 375×667 and 1920×1000 for A-01.
- **Motion:** full and reduced.
- **Answers:** every option selected; long labels taken from the real content packs.
- **Results:** review jumps and auto-reveal.
- **Network:** a slow network (answers delayed 1.2 s) and a slow first projection.

**Tests written before the fixes** (commit `0398e09`):
- `scripts/check-audit-fixes.mjs`: 28 checks failed against `0cfb50d`.
- `tests/audit-triage.test.ts`: the tie cases failed.

**After the fixes** (`7e66677`): 48/48 driver checks pass, and unit tests 910/910.

**What the fixes touch:** none of them changes server state, scoring, rank calculation, content eligibility, D3 readiness rules, Official/Practice separation or existing Cups.

## Confirmed and fixed (category 1: verified functional bugs)

| ID | Audit finding | Reproduction on D3 | Root cause | Test evidence | Fix | Server / scoring / eligibility / existing Cups |
|---|---|---|---|---|---|---|
| A-01 | Answer cards overlap; text collides (phone) | **Reproduced** at 375, 390, 430 px and 1920×1000, once answers lock. On a slow network the locked grid stays visible: three cards at 50% over the expanded chosen card. | `index.css` (since F1) has `button:disabled { opacity: .5 }`, which is more specific than the kit's `.mz-slab--gone { opacity: 0 }` and `--dim`. Every disabled grid (all locked answers, the whole review) showed the "gone" cards half-visible. Later DOM order painted them over the chosen card. | `check-audit-fixes` "A-01 … no visible card overlaps": failed 3/3 widths before, passes after. Before/after: [`a02-review-before.png`](a02-review-before.png) / [`a02-review-after.png`](a02-review-after.png). | Kit CSS: disabled cards keep the kit's opacity (1 / .38 / 0), and the chosen card is painted on top (`z-index`). | None: display only. |
| A-01 (stamp) | LOCKED IN stamp covers part of "shepherd's" | **Reproduced**: on the locked-answer card, the absolute stamp overlapped a long answer by 3,468–4,499 px² at every width, also with reduced motion. | `.mz-lockcard__stamp` was absolutely positioned over the answer area, with no space reserved. | Settled overlap: 0 px² after, with the old placement re-measured in the same page. [`a01-locked-card-long-answer-after.png`](a01-locked-card-long-answer-after.png) | The stamp sits in the card's flow, below the answer. | None. |
| A-02 | LOCKED IN on the wrong card in the reveal; the chosen label on another card | **Reproduced exactly** (review, Q1): the stamp shows on the ● card, the chosen ▲ label lies across the ■ card, the ■ label is squashed underneath, and the ▲ card's own corner is hidden. | Same as A-01: the half-visible "gone" cards sat on top of the expanded chosen card. The server record was right: the footer said "you answered … locked in". | `check-audit-fixes` "A-02 … results review" (14 jumps), "long labels", "auto reveal": failed before at all three widths, pass after (reduced motion passed before and after). | Same CSS fix. The chosen card stays on top even mid-transition. | None. |
| A-03 | Phone standings omit a tied-first player | **Reproduced**: with a three-way tie, two of three phones listed only two players. | `StandingsList` cut `ranked.slice(0, 2)` by row count; ties are sorted by name. | Unit `tests/audit-triage.test.ts` (tie cases failed, pass now); driver A-03 at 375/390/430 (2 of 3 phones failed before). [`a03-three-way-tie-guest-after.png`](a03-three-way-tie-guest-after.png) | `standingsRows()` never splits a shared rank: every player on the cut-off rank is listed. | None: the server's ranks and scores are shown unchanged. |
| A-05 | Guests usually miss the Ready / briefing screen | **Reproduced in part.** A guest on the lobby or the previous results does see it. A guest on Library or Championship never did, and a guest on the TV view saw the TV briefing with no way to Ready. | The briefing showed only on the phone's lobby view. Other views neither switched nor offered Ready. | Driver A-05 (Library 375, Championship 390, TV 430): all failed before, pass after. [`a05-tv-view-back-to-ready-after.png`](a05-tv-view-back-to-ready-after.png) | A player in the game is brought from Library, Studio, Championship or Memory Book to the briefing once. The TV view offers "Back to my phone to get ready". | None. Server-authoritative readiness, the 20 s window and consent are unchanged. |
| A-05 (rest) | — | The audit says its guests were in the lobby. In Chromium that always shows the briefing. | Not shown. Likely cloud-browser windows not repainting in the background; possibly real latency. | — | Category 5: re-test on a real iPhone. | — |
| A-06 | Reconnect first shows "friend · 0 here" for ~15 s | **Reproduced** deterministically with a slow first projection (4–6 s): an empty lobby with "You're in, friend · 0 here". | The phone drew the lobby before its room's first projection arrived. The 15 s itself is network latency (the Codespaces proxy), not app state. | Driver A-06 at 375/430: failed before, passes after. [`a06-rejoining-after.png`](a06-rejoining-after.png) | "Rejoining your room…" until the projection arrives, with Try again, and Back to the start only after an error. | None. |
| A-07 | Late joiner lands on the finished game's review as a non-participant | **Reproduced**: "Everyone finished … Did not answer" and the Q1 review. | The client opened results for the latest finished game whether or not this player was in it. The server never added them: not in the roster, not in the scores (checked). | Driver A-07: failed before, passes after. The server check passes before and after. [`a07-late-joiner-lobby-after.png`](a07-late-joiner-lobby-after.png) | Only games this player was in can open results (same rule as `063f1c9` for playing games). | None: client presentation only. |

## Investigated, not reproduced on D3

| ID | Audit finding | Reproduction on D3 | Finding | Test evidence | Action | Category |
|---|---|---|---|---|---|---|
| A-13 | A spectator who joined after the game saw "What is the capital of Australia?" | **Not reproduced.** A fresh post-finish spectator sees the played questions. A tab that spectated a room with a finished Geography game, stopped, then spectated the Trivia room shows only Trivia questions. A player tab from another room keeps its own room. | That question exists only in **Geography** content (`geography-legacy`, `src/games/geography.ts`). The TV stage it was seen on is chosen only for **Trivia** games and shows that game's own frozen questions. On D3 a Trivia game cannot contain it, and a spectator session is per tab, keyed by room. Not a replay (the played set had no such question), not a wrong game id in this room. The likeliest explanations are another room or session on the shared preview, or a misread. | Guards in `check-audit-fixes` (post-finish spectator; room switch): pass before and after. | Keep the guards. Re-capture live with a screenshot, room code and game id. | 5 |
| A-15 | Game names differ between picker and Library ("Word Assembler"…) | **Not reproduced.** D3 Library titles are the registry titles, the same as the picker. | The quoted titles exist in no commit on any branch. | Library inspection (title list). | Needs a live screenshot. | 5 |
| A-16 | Library tile title doubled; player count twice | **Not reproduced.** One title and one "N–10 players" per tile. | As A-15. | Same. | Needs a live screenshot. | 5 |
| A-11 | "It's the host's job to move the game on" is wrong | **Not reproduced.** The string exists in no commit. Players do advance themselves ("Next question"). | Possibly a paraphrase of "Waiting for the host to start" (lobby) or "Waiting for the host…" (the kit's unused ResultsScreen). | grep across all history. | Needs a live screenshot of the exact screen. | 5 |
| A-18 | Championship: "You're not in the Cup yet" vs a POINTS TO TARGET list | **Not reproduced.** Neither string exists in any commit. | — | grep. | Needs a live screenshot. | 5 |
| A-23 | "Play reveal" disabled on the host results | By design on the Standings step (`disabled={step.kind === "standings"}`). It is enabled on question and reveal steps. | Not a defect. The label could say why. | Code. | Results redesign. | 3 |

## UX improvements for Home B / Lobby A (category 2)

| ID | Audit finding | Verified on D3 | Note |
|---|---|---|---|
| A-04 | No rename; the host is auto-named "Player 1" | Yes. With an empty name field, Host a game uses "Player 1" (`App.tsx`), and nothing renames after joining. | A Lobby A seat sheet: rename (server validation for duplicates). It does change server state (display name), so it needs owner approval. |
| A-08 | Name truncation makes players indistinguishable ("Au…") | Yes: the waiting ring shows "Au…" twice ([`a01-locked-card-long-answer-after.png`](a01-locked-card-long-answer-after.png)). | Distinct initials or wider labels in the Lobby A circle and waiting ring. |
| L-02 | Start below the fold on a phone | Yes (known; Stage 1 "not changed by design"). | The Lobby A dock, to be proven on a real iPhone. |

## Results and TV redesign (category 3)

| ID | Audit finding | Verified on D3 | Note |
|---|---|---|---|
| A-09 | Trivia and Math results differ (reveal vs plain summary; "TV Dashboard" vs "TV stage") | Yes: Math and Geography use the legacy results and TV dashboard (code comments). | One results pattern for all quiz games. |
| A-10 | Math scoring opaque (bonus explained only after answering; no per-question times) | Partly: the bonus line appears after answering. The audit's quoted "worth 100 points" is not in D3. | Show the rule before answering, and the server-recorded per-question time and bonus in results. Never invent one. |
| A-12 | No live TV view for Math; two spectator UIs; empty Family Cup standings unexplained | Yes, by code. | TV redesign. |
| A-19 | A fast finisher waits with no information; "Waiting for the game to finish" looks inert | Yes. The ring shows counts only, deliberately: an earlier privacy rule says nobody sees who submitted. The button goes to the same waiting ring. | **Needs a product decision:** per-player progress versus the counts-only privacy rule. |
| A-21 | TV live view lacks progress, timer, scores | Yes. | TV redesign. |
| A-22 | Trivia ends on the Q1 review, not a results screen | Yes, by design: the reveal walks Q1 → Q10 → standings. | Results redesign (summary first). |

## Low-priority cosmetic (category 4)

| ID | Finding | Verified on D3 | Note |
|---|---|---|---|
| A-14 | Memory Book export buttons give no feedback (files do download) | Yes (`MemoryBookView.tsx`: no status after download). | A one-line status. Legacy screen; do it in its rebuild. |
| A-17 | Studio: "Only 1 games fit", "for 1 players" | Yes (`MchezoStudio.tsx`). | Pluralisation. |
| L-05 | "Play reveal" greyed on the standings step | By design (see A-23). | Clarify the label. |
| L-06 | Large gap above the Trivia answers | Not measured on D3. | Cosmetic. |

## Needs a real iPhone or live reproduction (category 5)

| ID | Finding | Why |
|---|---|---|
| A-05 (rest) | Guests in the lobby still missing the briefing | Chromium always shows it; check background-tab and repaint behaviour on a real phone. |
| A-06 (latency) | The ~15 s wait itself | Network or proxy latency; the misleading state is fixed. |
| A-13, A-15, A-16, A-11, A-18 | See above | Strings not in any commit, or not reproducible; need live screenshots with room and game ids. |
| A-20 | Preview outage (404 from the github.dev proxy) | Environment, not the app (the audit says so too). |
| L-03 | Waiting-ring label overlapping the footer | Not seen in D3 captures (3 players); re-check with 2 players and on a phone. |
| L-07 | Browser Back → about:blank | Local-only observation; live Back test outstanding. |

## Older local build only, not D3 defects (category 6)

| ID | Finding | Why it doesn't apply to D3 |
|---|---|---|
| L-01 | Share-code chip does nothing | Fixed in Stage 1 (invite sheet with Share and Copy link); the audit saw that dialog live. |
| L-04 | Sound checkbox renders as a white square | Stage 1 replaced it with "Mchezo doesn't play any sounds yet." |
| (green theme) | Legacy green screens | Stage 1 recoloured legacy screens to Night Circle. Their layout rebuild is the planned redesign, not a defect. |
| (local timing) | Universal 5-minute deadline, Math timed from game start | `afd48bc` predates Sprint 3; D3 has per-game windows and per-question Math timing. |
