# Stage 7.2: casual results and explicit session continuation

- **Branch:** `claude/stage7-2-session-flow`, stacked on PR #8 at `08bba4d`.
- **Instruction:** ChatGPT's review and handoff on PR #8 (comment 6776351818, 2026-11-10), under the owner's standing authorization (D-WF-01). It also cleared Stage 7.1 after its own live-site audit of `01fd285`.
- **Clarification:** ChatGPT's comment 6776484058 on PR #9 accepted the four choices in §5 and asked for three safeguards, now §3.8: a delayed opposite Break/Resume, a retry after a cancelled start, and stricter Play again checks.
- **Not done here:**
  - host swaps, full theme modernization, Home Screen installation, new games, other queued polish;
  - no change to Family Cup or solo behaviour.

  Nothing is merged or deployed, no port is made public, and nothing is paid for.
- **Order of work:** this spec was written **before** implementation. §6 records what was built and tested.

## 1. Goal

After a casual round, everyone sees one clear Mchezo results screen, with the casual wording rather than "Practice". The host (or a cohost) then chooses what happens next:
- the lineup's **Next game**;
- **Play again** (a rematch);
- **Take a break**, then **Resume**.

Everyone else sees the same state. The server holds the progress, so a reload, a reconnect or a restart changes nothing, and a repeated request never starts a second game or scores twice.

## 2. Acceptance criteria (from the handoff)

- **P1. Casual results and briefing**, in the Mchezo shell with Casual wording:
  - one clear result summary, the standings, and the player's own answer review;
  - no Cup-only navigation;
  - Family Cup and direct solo unchanged.
- **P2. Explicit continuation:** host/cohost **Next game**, **Play again**, **Take a break / Resume**.
  - Everyone else sees the waiting, break or next state, in sync.
  - Nothing starts automatically, and no active game's clock is paused.
  - Without a lineup: play again, or choose another game.
  - At the lineup's end: say it's complete, and offer deliberate choices.
- **P3. Server-authoritative progression:**
  - persisted, and tied to the lineup's revision and item, and to game instances;
  - only the next pending item may start;
  - authenticate first; an identical retry or a lost reply resolves to the same attempt;
  - transitions defined (§3.1); a cancelled briefing leaves its item available, never silently skipped.
- **P4. Rematch:**
  - the ordinary engine, a new game instance, fresh content as usual;
  - never takes the next lineup item, never erases results, never scores twice;
  - picking a game by hand never moves the lineup on;
  - one active game, and content, score and privacy rules, all unchanged.
- **P5. Persistence and roster:**
  - a break and progress survive reload, reconnect and restart;
  - joining or reconnecting never starts or resumes anything;
  - every new start applies the real roster's eligibility and the reconnect and fewer-players confirmations;
  - active games' rosters stay frozen, and late joiners are handled as before.
- **P6. Plans and the TV:**
  - the Stage 7.1 stale-draft and Clear protections are kept;
  - clearing or replacing a lineup never changes an active game or erases scores;
  - a progression request against a replaced lineup is refused;
  - the TV shows the true current, next, break and complete state, public facts only.
- **P7. Uncertain Apply:**
  - say "couldn't confirm whether it saved", not "not saved";
  - recognise the host's own save when it appears later, under safe revision and content conditions only;
  - never silently rebase or overwrite a competing edit.

## 3. Design

### 3.1 Lineup item states (derived from the item's game, never stored twice)
| State | Meaning | Becomes |
|---|---|---|
| `pending` | no game for it (never started, or its briefing was cancelled) | `briefing` (Next/Start), or `playing` in a room without briefings |
| `briefing` | its game is in the briefing | `playing` (Start now), or `pending` (briefing cancelled, or expired before play) |
| `playing` | its game is being played | `completed` (finished, including by its time limit or a host skip) |
| `completed` | its game finished; scores recorded once by the engine | final |

- **Derived:** an item points at its game (`gameInstanceId`), and its state comes from that game's status. A cancelled briefing deletes its game, and the item's mark is cleared (Stage 7.1 `reconcilePartyStarts`), so the item is `pending` again, at the same place in the order.
- **Next pending:** the lowest-index `pending` item. Items before it are `completed` or active, and the one-active-game rule means at most one is active. There is no skipping: an item is never passed over silently.
- **Complete:** every item `completed`.
- **Projection** (casual rooms, every audience), added to the lineup:
  - each item's `status` (`started` is kept: true unless pending);
  - `next`: the index or null;
  - `complete`.

### 3.2 Next game (the lineup's next item)
- **Request:** `POST /rooms/:id/games` with `party: { revision, index }` and the roster shown, as in Stage 7.1, plus `attempt: { id, sessionRevision }` (§3.8, required).
- **What changes:** a new start must be the **next pending item** (no longer only item 0). Index 1 can start only after item 0 completed.
- **Checks, in order:**
  1. host or cohost (a repeat too);
  2. casual room;
  3. **a press seen before** (its id): the game it started, or `ATTEMPT_ENDED` if that game's briefing was cancelled (§3.8);
  4. current revision, item and game;
  5. **replay:** an item whose game exists returns that game;
  6. made against the current session revision (`SESSION_CONFLICT`);
  7. index = next pending;
  8. **not on a break** (`ON_BREAK`);
  9. fewer than planned needs an OK;
  10. reconnecting players are named or waited for;
  11. the real roster fits;
  12. `startGame`.
- **Concurrent Next from the host and a cohost:** the first starts it; the second is that game's replay. A Next racing a Play again or a Take a break pressed against the same screen: the second is stale (`SESSION_CONFLICT`), with nothing started twice.
- **A Next for a replaced or cleared lineup** (old revision) gets `PLAN_CONFLICT`, and nothing starts.

### 3.3 Play again (rematch)
- **Request:** `POST /rooms/:id/games` with `rematchOf: <finished game id>`, `official: false`, the roster shown and `attempt` (all required). With `party` as well, it is refused (400).
- **The server:**
  1. host or cohost (a repeat too); casual room;
  2. **a press seen before:** the game it started, or `ATTEMPT_ENDED` (§3.8);
  3. the source game exists and is `finished`;
  4. **replay:** if a game with `rematchOf` = that source exists, return it (a double tap, two hosts);
  5. made against the current session revision (`SESSION_CONFLICT`);
  6. **the source is the room's last game:** no game active (one active game), and nothing played after it (`REMATCH_NOT_LATEST`);
  7. not on a break;
  8. reconnecting players are named or waited for;
  9. the people here fit the game (`GAME_DOESNT_FIT`); fewer-than-planned does not apply, since a rematch is not a lineup item;
  10. `startGame` with the source's game id and the roster shown, as a new instance with fresh content, as usual.

  The new game records `rematchOf`. A cancelled rematch can be pressed again (a new press).
- **The lineup is untouched:** a rematch never marks or takes an item, even when its source was a lineup game.
- **Picking by hand** (the lobby's own Start for a game the host picked) also never moves the lineup on.

### 3.4 Take a break / Resume
- **Request:** `POST /rooms/:id/break` with `{ on: true | false, attempt }`. Host or cohost, casual rooms only.
- **On:** only when no game is active (`GAME_ACTIVE` otherwise); a break never pauses a clock. Off: any time.
- **Repeat-safe** (§3.8): a press seen before is answered with the session as it is now, and changes nothing again. A press made against an older session revision is refused (`SESSION_CONFLICT`). Asking for what is already so changes nothing.
- **While on a break, every new start is refused** (`ON_BREAK`: Next, Play again, and the lobby's own Start). The host resumes deliberately.
- **Stored:** `session: { onBreak, breakSince, revision, ops }`, persisted in the room. Everyone (TV included) sees `{ onBreak, breakSince, revision }`, never the remembered presses.
- **Joining or reconnecting** never changes it.

### 3.5 Casual results (client)
- **Every finished game in a casual room** shows a Mchezo results screen:
  - **Games with their own Mchezo results** (Trivia, Word Connections, Caption Clash, Draw & Guess, Pattern Pulse, Majority Rules) keep them, with the Casual wording.
  - **Every other game** (Math Mayhem, Closest Wins, Guess the Year, Geography, Who Said That?, Category Sprint, Impostor, Charades) gets a new **casual results screen** instead of the legacy shell, which had the 🎄 header, Championship navigation, "Practice" and a second winner block. It holds:
    - one result heading (the existing results hero);
    - the standings, every player ranked by the server's recorded scores;
    - the player's own answer review, where the game has one;
    - the "What's next" panel.
- **The "What's next" panel**, on every casual results screen:
  - **Host or cohost:** **Next game: X** (game n of N), **Play again: Y**, **Take a break**, and the lobby. When the lineup is complete, it says so, with Play again, Plan another lineup, or the lobby.
  - **Everyone else:** "Up next: X. {host} starts it." / "On a break." / "That was the whole lineup."
  - A refused start is answered in place, with the same choices as the lobby: fewer than planned, reconnecting, doesn't fit, on a break, or the lineup changed.
- **The lobby (casual):**
  - up next follows the lineup: after a lineup game, it is the next pending item, never the game just played;
  - when on a break, a banner shows it, and the host has **Resume** and the dock's Start waits;
  - the lineup card shows each item's state (played ✓, now, next);
  - the host has **Take a break**.
- **Wording, in casual rooms:** "Casual" (never "Practice") on the briefing, the results heading and its lines, the outcome line, and the TV. Cup rooms keep Official/Practice.
- **Family Cup** keeps its results, legacy shell included. **Solo** is unchanged.

### 3.6 The TV (public facts only)
The lobby screen shows "Quick Party: game n of N", Next, "On a break", or "That was the whole lineup", with Casual wording. The final-standings screen's next line follows the lineup.

### 3.7 Uncertain Apply (P7)
- **No answer, and the room shows neither this draft nor anything else new:** "Couldn't confirm whether the lineup was saved. Try again, or check the lobby."
- **Recognising the host's own save** (applies when the room holds exactly this draft at base + 1):
  - the planner keeps watching while an Apply is unconfirmed, and when the room shows it, says "Saved" and closes;
  - a conflict reply that matches it is treated as saved.

  Anything else stays a conflict for the host to decide.

### 3.8 Retries, stale presses and cancelled starts (clarification 6776484058)
- **Every continuation press** (Next game, Play again, Take a break, Resume, and the lobby's own Start in a casual room) carries `attempt: { id, sessionRevision }`:
  - `id`: made once per press and kept for that press's retries;
  - `sessionRevision`: the session revision the screen showed.

  It is required for Next, Play again and the break, and optional for the lobby's own Start (older callers).
- **The session revision** grows by one with every break change, every game start in the room, and every cancelled briefing. Joins, reconnects and a game ending on its own don't change it.
- **The server remembers each press that took effect** with its own id, what it asked for, the revision it produced, and the game it started.
  - The record is persisted with the room and is never projected.
  - The record is bounded: the newest 64 are kept.
- **Order:**
  1. the server authorizes the request (host or cohost), even for a repeat;
  2. it resolves a press it has seen before. A press it took started a game:
     - while that game exists (briefing, playing or finished), the server returns it (`replay`), never a new one;
     - after that game's briefing was cancelled, the server answers `ATTEMPT_ENDED` and starts nothing;
  3. a press it hasn't seen must be made against the current revision (`SESSION_CONFLICT`); then the action's own checks apply.

  Reusing an id for something else is refused.
- **Delayed opposite commands:**
  - Break, then lost, then Resume by another host, then the Break retried: it is recognised, answers "not on a break", and changes nothing.
  - The same holds the other way round, and across a restart.
- **A forgotten press:**
  - A press beyond the newest 64 can't start anything or change the break.
  - It was made against a revision that has since moved on, at least through its own effect.
  - So it gets `SESSION_CONFLICT`, unless the item or rematch it asked for already has a game, which is returned.
- **A cancelled attempt:**
  - The cancel deletes the game and frees the lineup item, as before.
  - The press stays remembered, so its retry starts nothing.
  - The cancel also moves the revision on, so another host's press from before it is stale.
  - A new press can start the same item or rematch again.
- **Serialized:** the one-active-game rule, the break, and the session revision are checked and changed in one synchronous step.
- **The client:** a reply never moves a screen back. Which screen shows (briefing, game or results) comes from the room's projection, never from a start reply. A replayed older game or a late reply only refreshes.

## 4. Test plan
- **Unit and HTTP:**
  - **Progression:** next = first pending; item 1 only after item 0 completed; replay before the index rule; cancel → pending at the same place; complete.
  - **Concurrency:** host and cohost Next, giving one game and a replay; Next racing Play again, giving one game.
  - **Rematch:** replay; never takes an item; source must be finished; casual only; reconnecting asks; scores once.
  - **Break:** on, off, repeat-safe; refused while a game is active; starts refused while on a break; persisted across restart; join and reconnect change nothing.
  - **Plans:** a stale or replaced lineup is refused for Next.
  - **Roles:** guest 403; spectator, no token or another room's token 401.
  - **Projection** for guests and the TV: public only.
- **Browser** (`check-session-flow`, new): two players and a spectator (the TV view).
  - a two-game lineup played through (Math, then Trivia): casual results screens with standings and own review, and no legacy shell;
  - Next from results, lineup complete, then Play again;
  - break and resume, seen by the guest and the TV;
  - a reload on results and on a break;
  - a lost reply on Next (exactly one game);
  - a guest can't drive.

  Layout at 320, 390 and 1440 px, and keyboard use of the panel.
- **Regressions:** `check-quick-party`, `check-casual`, `check-briefing`, Family Cup and solo drivers, in the full gate.
- **Gates:** the fast gate and one parallel full gate on a clean final SHA.
- **Reporting:** Chromium only; WebKit and real devices are reported as not run.

## 5. Choices for ChatGPT's attention
Accepted in clarification 6776484058.
1. **A break blocks every new start until Resume,** including the lobby's own Start, so a break is never ended by accident.
2. **"Play again" is a rematch of the game just finished,** tied to it (`rematchOf`). A second Play again is a rematch of the rematch.
3. **No "skip this item" in this slice.** Items are played in order. To change the order, the host edits the lineup (Stage 7.1).
4. **Games with their own Mchezo results keep them,** with the new panel added. Only the games that used the legacy shell get the new casual results screen.

## 6. What was built and tested

### 6.1 Built
- **Server** (`src/server/room.ts`, `src/server/http.ts`):
  - item states derived from games (§3.1), and the next pending item (§3.2);
  - Play again, `rematchOf` (§3.3);
  - Take a break / Resume, `POST /rooms/:id/break` (§3.4);
  - the session revision, press ids and remembered presses (§3.8), persisted and checked again on restore;
  - new refusal codes `ON_BREAK`, `SESSION_CONFLICT`, `ATTEMPT_ENDED`, `REMATCH_NOT_LATEST` and `GAME_DOESNT_FIT`.

  `POST /games` requires `attempt` for a lineup start and for Play again. It is optional for the lobby's own Start, which the app always sends in casual rooms.
- **Web:**
  - **The What's next panel** (`WhatsNext.tsx`) sits on every casual results screen: the five with their own results screen, Trivia's (under its heading), and the new casual results screen for the other games.
  - **The lobby:**
    - up next follows the lineup;
    - the break banner, with Resume for the host;
    - Start waits during a break, and the guests are told why;
    - Take a break;
    - the lineup rows say played, on now or next, and when the lineup is complete.
  - **Casual wording** comes from the Mchezo provider's `casual` switch: the results, outcome, briefing and TV.
  - **The TV:** the lineup card, a break card, and the next step on the final screens, Trivia's TV stage included.
  - **Requests:**
    - every continuation request carries a press id;
    - a lost reply is asked again as the same press;
    - a late reply for a finished game never moves a screen back.
  - **Apply (P7):** "Couldn't confirm whether the lineup was saved", and the host's own later save is recognised.

### 6.2 Tested
- **Unit and HTTP:**
  - `tests/stage72-session-flow.test.ts` (27): the item states and the next item, the revision, races, cancelled-then-retried presses and restart, Play again, the break, eviction, a damaged saved session, roles, the public view, and HTTP validation.
  - `tests/stage72-client.test.ts` (4): what's next, the TV's line, the feed boundaries, and the Casual wording.
  - Updated: `tests/stage71-quick-party.test.ts` (the next item; the request id) and `tests/stage3-qa-results.test.ts` (30 lines).

  Eight mutations of the safeguards are each caught: the break replay, the revision on cancel, the latest-game rule, the revision on Next, persistence of presses, `ATTEMPT_ENDED`, the break's revision check, and the bound.
- **Browser:**
  - `check-session-flow` (new, 52 checks): two players and a spectator, Math then Trivia, a lost reply on Next, Play again by keyboard, a break with reloads, the guest refused, 320 and 1440 px, and the uncertain Apply.
  - `check-quick-party` (68): updated to the next-item rule, the press id and the new Apply wording.
- **Regressions:** Family Cup and solo are covered by the full gate (§6.3).
- **Not run:** WebKit and real devices (the checklist is `docs/REAL_DEVICE_TESTING.md` I13–I16). Emulation is not a device.

### 6.3 Gates
**Tested revision:** `acab35f3138e60516916cb588ae28431d4addbbd`. Both runs used a fresh clone with a clean tree (`dirty: []`) and the same source fingerprint (`cdfa0051…`, 425 files).

| Run | Gate | Verdict |
|---|---|---|
| `20261110-195030-acab35f3-16696` | fast | PASSED, 5/5 (typecheck ×2, lint, 1,253 unit tests, build) |
| `20261110-195129-acab35f3-19586` | full | PASSED, 80/80 (every browser driver and E2E), 27 min 47 s on 3 workers |

Highlights of the full gate:
- `check-session-flow`: 52 checks;
- `check-quick-party`: 68;
- the Family Cup drivers (`check-f4`, `check-f5`, `check-leaderboard`, `check-lifecycle` and others) and the solo drivers (`check-solo` 80, `check-solo-shelf` 57) all passed.

The raw evidence is in `docs/evidence/gate-runs/<run>/`. The revision after `acab35f` adds this record only (docs).
