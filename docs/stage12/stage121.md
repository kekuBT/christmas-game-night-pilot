# Stage 12.1: one path, and the TV as the hero

**Authorization:** the owner, directly in chat on 2026-11-13 at about 4:50 p.m. ET. Quoting two of my design recommendations, the owner wrote: "you have my blessing to optimize however you think is best … You have my permission to implement those in the way you think is best … go straight to it … if you have more discussions go for it just document it."

**The two recommendations:**
- **One path:** "The mental model has too many switches: casual vs Cup, solo, the Everyday vs Christmas look, and Everyday vs Christmas content. For guests, one path should dominate: host, share the code, Quick Party, play, results, Memory Book. 'Make it a Family Cup' can be an optional upgrade, not a decision made at the door."
- **The TV as the hero:** "Phones are controllers; the TV is where the room looks. I'd spend design effort on the TV's big moments (reveals, the standings, the Cup trophy) over more phone screens."

**What doesn't change:** no merge or deployment, $0, AGENTS.md rules, and the gates.

**Branch:** `claude/stage12-1-one-path-tv`, stacked on Stage 11.2 (`c2767fb`), unmerged.

**Who reviews:** this stage didn't come through a ChatGPT handoff. ChatGPT's usage limit was reached, and the owner gave the instruction directly. ChatGPT can review it like any other stage once it's back.

## 1. What's wrong today
- **Two decisions at the door.**
  - Home's dock offers three equal choices: Join, Play solo and Host.
  - Host then asks "Casual or Family Cup?" before a room exists.
  - Hosts who have never played have to guess what a "Family Cup" commits them to.
- **A room's kind is fixed for life** (`RoomEngine.kind` is `readonly`). A family that starts casually and loves it can't turn that night into a Cup. They'd have to start a new room, and every phone would have to rejoin.
- **The TV is complete but plain.**
  - Its lobby shows the code as text, with no QR code to scan.
  - A finished game shows a winner sentence and a leaderboard. There's no reveal and nothing that builds up the night ("who's winning tonight?").
  - The Cup is three lines in a side card. A day's winner appears only on the phone's Cup screen.

## 2. One path (D-S121-01, -02, -03)
### 2.1 The door
- **Home's dock has two buttons:** Join a room (first, because an invited guest is the most common arrival) and Host a game.
- **Play solo moves to a quieter link under them** ("Just you? Play solo"). It's still one tap, but it isn't a peer of hosting.
- **Host asks only for a name.** The casual/Cup choice is gone; every new room starts casual. One line says the room can become a Family Cup later from the lobby menu.
- **Unchanged:**
  - Join;
  - recovery;
  - the API (`POST /rooms` still accepts `kind`, so a Cup created directly by API or a script keeps working);
  - existing rooms.

### 2.2 "Make it a Family Cup" (an in-place upgrade)
- **Where:** in the room menu, the host of a casual room sees "Make it a Family Cup". A confirmation sheet says plainly what changes:
  - **From now on:** official games count toward a 7-day Family Cup, with days and standings. Games already played stay casual and never count.
  - **What a Cup doesn't have:** Quick Party, What's next, Play again, breaks and handing over the host role are casual-room features. The Cup has its own flow: Official or Practice, Cup days, standings.
  - **What stays:** the code, the players and the Memory Book.
  - **It can't be undone.**
- **The server (`POST /rooms/:id/cup`, `RoomEngine.upgradeToCup`):**
  - only the host, only a casual room;
  - refused while a game is getting ready or playing;
  - idempotent: asking again in a room that's already a Cup succeeds and changes nothing.
- **What the upgrade does:**
  1. the kind becomes `cup`;
  2. the day becomes 1;
  3. a fresh Cup record (new id, created now, the same timing version);
  4. `casualGameIds` keeps the ids of every game already in the room;
  5. `cupSince` records `{ at, seq }`;
  6. a ledger event `cup-started` with the actor.
  - It's persisted and survives a restart. The projection carries `cupSince` and `casualGameIds`, which are public facts.
- **Nothing about scores changes.** Casual games were never official, so they already count toward no standings.
  - Choosing the Cup's rules (`configureCup`) is still allowed until the Cup's first game. Games played while the room was casual don't count as Cup games.
- **The Memory Book (extends D-S112-01):** an entry's mode is its cited game's era.
  - **A game played while the room was casual** stays casual: no "Day 1", even in a room that's a Cup now. This covers new entries (recorded at creation), older entries (from the room's citation) and the screen's results line and link preview.
- **Everyone sees it:** the lobby shows a notice to every member until the Cup's first official game finishes: "This room is now a Family Cup · Day 1 of 7. Official games count; games played before stay casual." The TV shows the Cup card.

### 2.3 What I didn't change, and why
- **Content following the look:** Everyday vs Christmas content stays the host's explicit choice in the casual lobby, and the look stays per device. Making content follow the look would reverse the reviewed Stage 8.2 rule (content is Everyday unless the host picks Christmas). That's written up as a proposal for the owner (§6), not done silently.
- **Cup rooms don't get Quick Party or What's next.** Bringing the casual conveniences into Cup rooms is the natural next step (§6). It touches the Cup's start rules, so it deserves its own stage.

## 3. The TV as the hero (D-S121-04 … -07)
All of this is presentation from public facts only, as before: no secret, private answer or playable answer ever reaches the TV.

- **Join, the lobby's main card:**
  - the code, larger;
  - a QR code of the join link (the same `/join?code=…` the phone's Invite sheet uses; `qrcode` is already a dependency);
  - "Scan to join";
  - who's here.
- **The reveal, the end of a competitive game:**
  - **A podium** with bronze, then silver, then gold, rising in turn over about 3 seconds. Ties share a step and its medal.
  - **Calm without animation:** with reduced motion, with Animations Off, or when the TV's director has paused, the podium shows at once.
  - **Beside it:** the full standings.
  - **Below it:** the night so far, as the medal table (casual) or the Cup standings (Cup).
- **The medal table** (casual rooms, and a Cup room's casual games), a pure function with tests:
  - every finished competitive game with at least 2 scored players awards gold, silver and bronze by shared rank;
  - players are ordered by golds, then silvers, then bronzes, then name;
  - cooperative games (Spectrum) award none;
  - shown in the TV lobby ("Medal table · N games") and on every final screen.
- **The Cup on the TV:**
  - **Lobby card:** the top 5 with totals, "Day N of 7", and the current day's leader from the server's own `ceremony()`.
  - **After an official game:** the final screen shows the Cup standings "after this game", with ▲/▼ movement against the standings the TV saw before the game. If the TV opened mid-game, there are no arrows rather than guessed ones.
- **The trophy moment:**
  - When the host ends a day while the TV is open, the TV shows "Day N complete" with a big trophy and that day's winner(s), as the server named them before the day moved on. The TV remembers the last ceremony it saw for each day.
  - A director button, "Cup standings", shows the Cup podium whenever the host wants the moment.
  - With no end-of-Cup state on the server, the TV never claims a final champion. On Day 7 it says "leading on the final day".

## 4. Acceptance
1. **Home and Host:**
   - two dock buttons plus a solo link;
   - no casual/Cup choice when hosting;
   - a hosted room is casual;
   - the API still creates Cups.
2. **The upgrade:**
   - host only;
   - casual only;
   - refused mid-game;
   - idempotent;
   - survives a restart;
   - the room keeps its code and players;
   - no score or standings change;
   - casual games stay casual in the book;
   - official games then count;
   - the Cup's day and standings work;
   - every phone and the TV follow without reloading.
3. **The TV:**
   - QR and code on the lobby;
   - a podium on competitive finals (ties shared; calm with reduced motion);
   - a medal table that accumulates across games;
   - Cup standings with movement after official games;
   - a day trophy when a day ends while the TV is open;
   - nothing private shown.
4. **Nothing else moves:** scores, Cup rules, approvals and every existing journey. The full gate passes, with about 50 drivers now hosting their Cup through the new upgrade.

## 5. Validation
- **Pure:** medal table (ties, cooperative, too-few, order), podium steps (ties).
- **Engine and HTTP:**
  - the upgrade (permissions, refusals, idempotence, restart, ledger, projection);
  - standings unchanged;
  - official games count afterwards;
  - `configureCup` after the upgrade;
  - Memory Book mode per game era.
- **Browser:**
  - a new `check-one-path` journey: host, the TV with its QR, Math twice (podium, medals), Make it a Family Cup (all phones and the TV follow), an official game (Cup standings with movement), end the day (the TV's trophy);
  - before/after screenshots;
  - every driver that hosted a Cup through the old door now uses a shared `hostFamilyCup` helper (host, then upgrade).
- **Gates:** targeted, fast, then one full checkpoint on the clean final SHA.

## 6. Discussions for the owner (not built)
- **Content follows the look.** A Christmas-look host would get Christmas questions by default, removing the last routine switch. It reverses the reviewed Stage 8.2 rule, so it's the owner's call.
- **Quick Party in a Family Cup.** It would make the Cup the same path as casual, with "official" as a property of the lineup. It touches the Cup's start rules.
- **An explicit "Finish the Family Cup" action** after Day 7, so the TV can crown a champion rather than a leader. That's a Cup-rules addition.
