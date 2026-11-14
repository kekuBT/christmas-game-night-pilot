# Stage 12.3: Quick Party inside a Family Cup

**Authorization:** the owner, directly in chat on 2026-11-13 at about 10:40 p.m. ET: "I agree with the suggestions as well please implement, self direct your self do the best you can with good quality". That reply covers A4 in `docs/stage12/stage121-discussions.md`, which I called "the most valuable next stage for the Cup".

- **Branch:** `claude/stage12-3-cup-quick-party`, stacked on Stage 12.2. Unmerged.
- **Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

**Why:** after "Make it a Family Cup" the room lost its best convenience, a lineup that runs itself. It felt like a step down right when the family is most engaged.

**The risk named in A4:** this touches the Cup's start rules, lineup persistence and the Memory Book's day filing. The design keeps every Cup rule in one place, `startGame`, and adds no new path around it.

## 1. A Family Cup's lineup has Official and Practice games (D-S123-01)
- **Who:** a Family Cup's host or cohost can plan a Quick Party, as in a casual room. Solo play still can't.
- **Each game's mode:** each item in a Cup's lineup is Official or Practice (`official: true` on the item; absent means Practice).
- **The server checks every save and every restore (`partyModesError`):**
  - a casual room's lineup never has an Official game;
  - an Official item must be a game that can count (practice-only games such as Impostor, Pattern Pulse or Majority Rules can't be);
  - an Official item needs a planned group of two or more, because an official game needs two players (D1);
  - a casual-only game (Jebena Rush, Spectrum) can't be in a Cup's lineup at all, because it can't start in a Cup.
- **A refused save changes nothing**, as before. **A saved lineup whose modes no longer pass is dropped on restore**, never half-loaded.
- **Everyone sees each game's mode:** the projection's lineup items carry `official: true | false` in a Cup, and none in a casual room, so the casual projection is unchanged.
- **The planner (phone):**
  - kicker "Family Cup · Official or Practice";
  - each game that can count starts Official, with a switch to make it Practice; a practice-only game says "Practice only";
  - a lineup planned for one is all Practice, and says why;
  - one line: "Official games count toward today's standings; Practice games don't."
- **The lobby card:** "Today's lineup", with each row's mode ("Official · …").
- **The TV lobby:** the lineup with each game's mode. A Cup's lobby also holds the Cup card, so its lineup shows three games around the next one and says how many more.

## 2. Starting a lineup game in a Cup (D-S123-02)
- **The lineup decides the mode.** A start of item *i* carries the mode the host saw. If it differs from the item's, it's refused (PLAN_CONFLICT) and nothing starts or is marked.
  - Over HTTP, `official: true` on a lineup start is accepted only in a Family Cup; a casual room still refuses it (400).
  - In the lobby, if the host switches the mode of the up-next game by hand, Start becomes the host's own pick. It doesn't move the lineup on, as with a hand-picked game (Stage 7.2).
- **Every Cup rule still applies,** because the start goes through `startGame`:
  - an official game needs two players (OFFICIAL_NEEDS_TWO);
  - anyone reconnecting must be named;
  - practice-only games never start Official;
  - the Cup's own content selection and briefing.
  - The lineup's own checks come first: the next item only, fewer than planned, the game fits the people here.
- **What's next after a Cup game** (only while the Cup is running a lineup):
  - "Next game: X · Official/Practice", and "Pick a different game";
  - no Play again and no break, because a Cup has neither (the host ends the Cup day instead);
  - a Cup without a lineup keeps its results exactly as before.
- **The Memory Book:** unchanged. An Official lineup game is an official Cup game, filed under its day; a Practice one is a practice game, as before.

## 3. Repeat-safe starts in a Cup (D-S123-03)
- **Each lineup start in a Cup carries its own request id and the session revision it was made against,** like a casual room's (Stage 7.2):
  - the same press again returns the game it started;
  - a press whose briefing was cancelled starts nothing (ATTEMPT_ENDED);
  - a press made against an older session is refused (SESSION_CONFLICT).
- **To support this:**
  - a Cup's session revision now moves on with each new game and each cancelled briefing;
  - its remembered presses are kept on restart (they were dropped for Cups before, since a Cup had none);
  - a Cup's projection shows `session` (never a break).

## 4. A lineup across "Make it a Family Cup" and back (D-S123-04)
- **Upgrade:** a casual room's lineup carries over. Its games still to play become Official where they can count and the lineup was planned for two or more, like the up-next plan (D-S121-02). Games already played stay as they were (casual).
- **Undo** (Stage 12.2): the lineup goes back with the room, and every item loses its mode, since a casual lineup has no Official games.
- **Each relabel is a new lineup revision,** so a draft or a Next press made against the old lineup is stale and is refused rather than misapplied.

## 5. Acceptance
1. **Saving:**
   - a Cup's host saves a lineup with Official and Practice games;
   - a casual room can't have an Official item;
   - a practice-only Official item, an Official item planned for one, and a casual-only game in a Cup are refused;
   - refusals change nothing, and a restart keeps the modes.
2. **Starting:**
   - an Official item starts an official game that counts; a Practice item starts a practice game;
   - a press for the other mode starts nothing;
   - OFFICIAL_NEEDS_TWO still applies;
   - the same press replays, and a press whose briefing was cancelled starts nothing.
3. **Upgrade and undo:** the lineup carries over with the right modes, and goes back without them.
4. **Phones and TV** show each game's mode. The Cup's What's next has no Play again or break. The TV's Cup lobby isn't cut off.
5. **Nothing else moves.** Casual Quick Party, Cup results without a lineup, and every journey are unchanged. The full gate passes.

## 6. Validation
- **Unit and HTTP tests:** `tests/stage123-cup-party.test.ts`. Seven older assertions of "Quick Party is casual-only" are updated to the new rule, each with a Stage 12.3 note:
  - `stage71-quick-party` (three);
  - `stage121-cup-upgrade`;
  - `stage122-one-path`;
  - `stage72-session-flow` (a Cup's session is shown, never a break);
  - `stage72-client` (a Cup's TV feed carries its lineup, never a break).
- **Browser:** the new `scripts/check-cup-party.mjs` (host, guest, TV) covers the planner, the lobby, the TV, an official game through the briefing to results, What's next, the next game as Practice, and the carry-over. `check-quick-party`'s Cup check now expects the Cup's own entry.
- **Gates:** targeted, fast, then one full checkpoint.
