# Stage 12.2: finishing the one path (undo, nudge, /tv, content follows the look, TV copy)

**Authorization:** the owner, directly in chat on 2026-11-13 at about 10:40 p.m. ET, replying to the Stage 12.1 report's discussion list: "I agree with the suggestions as well please implement, self direct your self do the best you can with good quality". That covers all items in `docs/stage12/stage121-discussions.md`. This stage takes the one-path items, A1, A2, A3 and A5, and the copy notes C. Stage 12.3 takes Quick Party in a Family Cup (A4). Stage 12.4 takes the TV moments (B1–B4).

- **Branch:** `claude/stage12-2-one-path-follow-ups`, stacked on Stage 12.1 (`d80dfb7`, PR #25), unmerged.
- **Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

## 1. Undo "Make it a Family Cup" (A1; D-S122-01)
**Why:** "It can't be undone" was the scariest line on the Make-a-Cup sheet, and most regret comes in the first minutes. Until an official game has finished, nothing official exists, so going back loses nothing.

- **Server (`POST /rooms/:id/casual`, `RoomEngine.undoCupUpgrade`):**
  - **Who:** host only.
  - **Which rooms:** only a room that became a Cup through the upgrade. A Cup created as one (`cupSince` unset) has no game night to return to.
  - **When:** refused while a game is getting ready or playing, and refused once any official game has finished. Asking in a room that's already casual changes nothing (idempotent).
- **What it does:**
  1. the kind becomes `casual` and the day goes back to 1;
  2. every game already in the room joins `casualGameIds`, including practice games played during the short Cup;
  3. `cupSince` is cleared;
  4. the session is reset (no break);
  5. one ledger event, `cup-undone`, with the actor and the number of games played during the Cup;
  6. `cupUndone { at, seq, games }` is recorded for the lobby notice;
  7. the stored up-next plan becomes non-official, because a casual room has no official games.
  - **Persisted, and in every projection.** The Cup record is kept but unused (a later upgrade starts a fresh one, as before).
- **The Memory Book:** a game the room now treats as casual is casual in the book, even if an entry recorded "cup" when it was saved. That only happens to a practice game played during an undone Cup, because a Cup with a finished official game can't be undone. The rule (D-S112-01 as amended by D-S121-02): the server's current era of the cited game wins when it says casual, so no "Day 1" is left behind by a Cup that never happened.
- **Phones:** in an upgraded Cup with no official game finished yet, the host's room menu offers "Back to a casual game night". A sheet says what goes back:
  - Quick Party, What's next, Play again, breaks and host handover return;
  - practice games played since stay, as casual games;
  - the code, players and Memory Book stay.
  - Guests see a lobby notice until the next game finishes: "This room is a casual game night again."
- **The Make-a-Cup sheet:** "It can't be undone" becomes "Changed your mind? Until the first official game finishes, you can go back to a casual game night from the room menu."

## 2. A gentle nudge (A2; D-S122-02)
- **Who and when:** the host of a casual room, once two games have finished in the room, never while a game is on, and never in a room that has already been a Cup (upgraded or undone).
- **The card:** "Enjoying tonight? Make it a Family Cup: same room and code, official games over 7 days, with a winner each day."
  - "Make it a Family Cup" opens the existing sheet.
  - "Not now" hides it for this room on this device. That's per device, in browser storage with a safe fallback; if storage fails, it stays hidden for this page.
- **Scope:** presentation only, with no server change.

## 3. A short TV address (A5; D-S122-03)
- **Why:** a TV browser can't scan a QR code, and typing `/join`, then the code, then "Watch as spectator" is the clumsiest step of a night.
- **`/tv`:** a TV page with one big code box and one button, "Show on this TV". It starts watching with no seat, which is the existing spectator flow.
- **`/tv?code=ABC123`:** fills the box and starts watching at once.
- **Served:** the server treats `/tv` as an app path.
- **The phone's Invite sheet** gains a line: "On the TV: open <host>/tv and type the code."
- **The TV lobby's join card** already shows the code; the QR stays for phones.

## 4. Christmas content when the host's look is Christmas (A3; D-S122-04)
**This changes the reviewed Stage 8.2 rule** ("content is Everyday unless the host picks Christmas"). The owner agreed to it in the message quoted above.

- **The rule:** a host whose phone is set to the Christmas look (pinned, not "Match the game") creates a room that deals Christmas content from the start. It's a one-time default at creation, never live.
  - `POST /rooms` accepts an optional `contentSeason` for casual rooms.
  - The Host screen says so: "Your phone shows the Christmas look, so tonight's questions start as Christmas ones. You can switch to Everyday in the lobby."
  - The host can change it in the lobby as before.
- **Unchanged:**
  - a guest's look never changes anything;
  - "Match the game" and Everyday hosts get Everyday;
  - Cups don't choose content this way;
  - content is still bound per game at start.

## 5. TV copy (C; D-S122-05)
- **The Cup's name on the TV** is "Family Cup", not the format's long name ("Individual Family Cup"), which stays on the phone's Cup screen.
- **"Qualifying":** instead of "· qualifying" on every row, a not-yet-eligible player's total has a "†". One footnote says "† Not eligible to win yet: too few counted Cup days."

## 6. Acceptance
1. **The undo:**
   - host only, upgraded Cups only;
   - refused mid-game and after an official game finishes;
   - idempotent, persisted, and logged;
   - the code, players and book stay;
   - practice games played during the Cup become casual, and the book doesn't call them "Day 1";
   - casual features return;
   - phones and the TV follow without reloading.
2. **The nudge:** shown to the host after two finished games and never to guests. "Not now" hides it, and "Make it a Family Cup" opens the sheet.
3. **`/tv`:**
   - `/tv` and `/tv?code=` reach the TV show with no seat;
   - a reload works;
   - the Invite sheet shows the address.
4. **Content follows the look:** a pinned Christmas host's new room deals Christmas content. Everyday and "Match the game" hosts are unchanged, and guests are never affected.
5. **TV copy:** "Family Cup" on the TV, and the "†" footnote.
6. **Nothing else moves.** The full gate passes.

## 7. Validation
- **Unit and HTTP tests:**
  - the undo (permissions, refusals, idempotence, restart, ledger, plan, book era after undo);
  - room creation with `contentSeason`;
  - client routes (`/tv`).
- **Browser:** `scripts/check-one-path.mjs` is extended:
  - the undo round-trip on host, guest and TV;
  - the nudge;
  - `/tv?code=` on a TV;
  - the Invite line.
- **A new `check-content-look`:** a pinned Christmas host, an Everyday host and a "Match the game" host.
- **Gates:** targeted, fast, then one full checkpoint.
