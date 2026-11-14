# Stage 12.4: the TV's big moments (finish the Cup, end the night, sound, phones step back)

**Authorization:** the owner, directly in chat on 2026-11-13 at about 10:40 p.m. ET: "I agree with the suggestions as well please implement, self direct your self do the best you can with good quality". That reply covers B1–B4 in `docs/stage12/stage121-discussions.md`.

- **Branch:** `claude/stage12-4-tv-moments`, stacked on Stage 12.3. Unmerged.
- **Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

**The one product rule here is provisional.** B2, "Finish the Family Cup", needs Cup rules the owner hasn't set. Per AGENTS.md ("material open product choices get provisional configurable defaults for local simulation, not an invented 'owner approved' label. Owner sign-off required before official championship use"), the rules below are provisional:
- they're in one constant, `CUP_FINISH_RULES` (`version: "provisional-1"`), recorded with each finished Cup;
- the phone says so on the sheet and in the lobby notice;
- the TV calls them "try-out rules".

## 1. Finish the Family Cup (B2; D-S124-01, PROVISIONAL)
- **Who and when:** the host, on the Cup's final day (Day 7), between games. On an earlier day it's refused (NOT_FINAL_DAY). A Family Cup only.
- **The champion:** the eligible player with the highest Cup total, above zero.
  - Eligible means enough counted Cup days, the server's existing `eligible`.
  - Equal top totals share the title.
  - Nobody eligible means no champion, said plainly.
  - The rule is in `src/shared/cupFinish.ts`, shared by the server (which decides) and the phone (which previews it).
- **What it records:** `cupFinished`, which is persisted and public:
  - the standings at that moment (names, totals, eligibility, shared ranks);
  - the champion(s), the day and the rules version;
  - one `cup-finished` ledger event. Asking again changes nothing.
- **After it:**
  - no official game starts (CUP_FINISHED); practice games still do;
  - a lineup's games still to play become Practice;
  - the phone's Start defaults to Practice.
- **Phones:**
  - on Day 7 the host's room menu offers "Finish the Family Cup";
  - a sheet previews who would be champion now, explains the rule and what changes, and says it's a try-out;
  - everyone's lobby then says "The Family Cup is complete", with the champion(s).
- **The TV:** "The Family Cup is complete", 🏆, the champion line and the final standings (with † for not eligible). It's shown by default until a new game starts. A TV opened later shows it too, because it's the server's record, unlike the day trophy.
- **Not decided here (owner):**
  - whether Day 7 must have ended;
  - what a tie should do (share, or a tie-break);
  - whether the champion needs a minimum total;
  - whether finishing can be undone;
  - what the Memory Book says about the champion.

## 2. End the night (B1; D-S124-02)
- **Who and when:** the host or a cohost of a casual room, between games, once at least one game has finished.
- **What it does:**
  - records `nightComplete {at, seq, games}` (persisted, public) and one `night-complete` ledger event;
  - nothing is scored, deleted or locked;
  - starting any game clears it, and the night goes on.
- **Phones:** the room menu's "End the night" opens a sheet; everyone's lobby then says "That's the night!"
- **The TV:** "That's the night!", the number of games, the night's medal table, and the games with their results. Public facts only: no Memory Book text, no answers.

## 3. TV sound (B3; D-S124-03)
- **Off by default.** The director's "🔇 Sound" button turns it on, and that press is the gesture browsers require before audio. It's remembered on that TV only (browser storage, with the page's own memory if storage fails).
- **What plays:** a short chime made with WebAudio, so there are no audio files, nothing is downloaded, and it costs $0. Phones never play it.
  - a rising fanfare for the day trophy, the Cup champion and the night recap;
  - two soft notes when a game's final standings first appear.
- **Never more than once a moment.** Silent while the director has paused animations.

## 4. Phones step back when a TV is watching (B4; D-S124-04)
- **Where:** casual Math Mayhem results only, as a first try. The discussion said to try one game and see how it feels on a real night.
- **When:** the room has a spectator (a TV).
- **What the phone shows:**
  - the player's own result heading and What's next;
  - "📺 The full standings are on the TV. Look up!";
  - "Show them here too", which brings back the standings, the outcome and the player's answers.
- **What it doesn't do:** a TV count isn't proof the TV is on screen, so nothing is ever more than one tap away.

## 5. Acceptance
1. **Finish:**
   - host only, Cup only, Day 7 only, between games;
   - champion(s) by the rule; ties shared; none when nobody is eligible;
   - one ledger event; idempotent; persisted;
   - official starts refused after; practice allowed; a lineup turns Practice;
   - phones and the TV show it, and a TV opened later shows it too.
2. **Night:**
   - host or cohost, casual only, after a game, between games;
   - persisted and public; a new game clears it; the TV shows the recap.
3. **Sound:**
   - off by default; on only after the director's press; remembered;
   - plays once per moment, never on phones.
4. **Step back:** on casual Math Mayhem results with a TV watching, the standings are hidden behind one tap. Without a TV, nothing changes.
5. **Nothing else moves.** The full gate passes.

## 6. Validation
- **Unit and HTTP tests:** `tests/stage124-finish.test.ts`, covering the champion rule (pure), finishing (permissions, days, mid-game, ledger, idempotence, official refused, practice allowed, restart, lineup) and the night (permissions, no games yet, Cup refused, public, saved, cleared by a new game).
- **Browser:** `scripts/check-tv-moments.mjs`:
  - a Cup taken to Day 7 and finished on the host, guest and TV;
  - a TV opened later still shows the champion;
  - a casual night ended, its recap on the TV, then cleared by the next game;
  - TV sound off by default and on after the press, chiming once per moment;
  - the phone stepping back on Math Mayhem with a TV watching, and not without one.
- **Gates:** targeted, fast, then one full checkpoint.
