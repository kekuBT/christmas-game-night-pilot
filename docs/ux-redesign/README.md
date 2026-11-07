# Mchezo product experience audit and redesign proposal (2026-11-07)

**Status:** an investigation and a proposal. **No UI code was changed.** Nothing was merged or deployed, and no scoring, eligibility, timing or content changed.

| Document | What's in it |
|---|---|
| [AUDIT.md](AUDIT.md) | The journeys, who owns each one in the code, the findings with severity and code references, and your iPhone findings checked one by one |
| [PROPOSAL.md](PROPOSAL.md) | The information architecture, the navigation model, the home page and lobby alternatives with a recommendation, the visual direction and design system, the cover-art strategy, the screen specs, personality, and solo play |
| [PLAN.md](PLAN.md) | Defects versus improvements, a staged plan with acceptance criteria and risks, migration, the tests to update, the real-device QA matrix |
| [mockups/](mockups/) | Low-fidelity screens as PNGs (from `mockups.html`; re-render with `node docs/ux-redesign/mockups/render.mjs`) |
| [evidence/](evidence/) | Screenshots and measurements of the current app, at phone sizes |

## The short version

**What's solid.** The core works:
- the server is authoritative;
- the secrecy rules are tested;
- seat recovery and reconnect work;
- the Trivia reveal and the Word Connections mechanics work.

The problems are in presentation and structure:
- one 1,050-line component chooses screens without a router;
- two style systems are loaded at once, and the old one still paints the page background green;
- kit screens are fixed-height boxes that squeeze their own content.

**The confirmed defects** (code-verified; the full list is in AUDIT §2):
1. **A one-player official game says it counts toward the Cup but never scores, and it uses up official content.** This is a score-integrity issue, so the fix needs your ruling (D1).
2. **Official and Practice look exactly the same when selected.** The computed styles are identical.
3. **The share button by the room code has no click handler.**
4. **Browser Back leaves the app.** No history is used anywhere.
5. **"Advance to next day" is one tap and can't be undone.**
6. **The 8-second rules intro takes time from the first round of phased games,** and players who skip it get more time than readers.
7. **Smaller issues:**
   - the Sound setting controls nothing;
   - the title overlaps the Cup badge (the root cause is found);
   - the old green background bleeds into Safari's toolbar and the edges of game screens.

**Recommended direction: "Night Circle".**
- **Kept:** the dark plum ground, coral used only for the primary button, the four answer colours plus two new hues, the keycaps, the Circle and the wordmark.
- **Each game gets a procedural SVG cover:** original, about 1 KB, no cost.
- **Home** leads with discovery, with Join and Host fixed in a bottom dock. A QR code skips Home entirely.
- **The lobby** fits on one screen: players, the up-next game, the mode and Start, with everything else in sheets.
- **Results** get a headline, a score breakdown, Cup movement and reviewed witty lines.
- **The Championship** leads with the day, the podium and your standing.
- **The TV** becomes a proper fluid stage.

## Decisions I need from you before coding

| # | Decision | My recommendation |
|---|---|---|
| **D1** | One-player *official* games: refuse to start them, or let them run but mark them as not counting? | **Refuse at start** (nothing is consumed), and the lobby switches to Practice with a reason. A failing test comes first. |
| **D2** | Solo practice for Trivia, Math Mayhem, Guess the Year and Geography (not Closest Wins, whose scoring needs opponents). And should solo practice ever draw from the official question pool? | **Yes to solo practice. Never use the official pool for solo** (today practice falls back to it once the practice pool runs out). |
| **D3** | Rules and timing: a server "briefing" phase where deadlines start when everyone taps Ready, or after a 20 s limit. Until then, a presentation-only interim (no auto-start for self-paced games; the real countdown shown for phased ones). | **Approve the interim now and the briefing phase for stage 5.** |
| **D4** | Home page B (discover, with a fixed Join/Host dock) and Lobby A (stage and dock). The alternatives are in PROPOSAL §3–4. | **B and A.** |
| **D5** | Allow brief CSS shape-confetti on results (at most 1.2 s, never under reduced motion). This lifts the M6 "no confetti" rule for results only. | **Yes**, scoped as described. |
| **D6** | Humour: tone and a Mild/Spicy banter setting (default Mild); about 120 original lines, reviewed like content. | **Mild only at first;** add Spicy after a family test. |
| **D7** | Work order: stage 0 (test hooks) and stage 1 (safe defect fixes) first, then you review on your iPhone before stages 2–4. | **Yes.** It fixes what you hit on your phone within a couple of days, without a big-bang redesign. |

The Codespaces preview (`claude/codespaces-preview`) is untouched and still usable.
