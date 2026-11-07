# D3: Rules and Ready timing contract (for approval; not implemented)

**Status:** a proposal. Nothing here is built, and today's timing is unchanged.

**What you asked for (2026-11-07):**
- Players can read the rules before committing to a timed game.
- The first gameplay deadline starts at the same instant for every participant.
- No forced 20-second cutoff.
- Slow readers, disconnected players and the host's decision to proceed are handled fairly.

**Today** (`room.ts:594, 631, 660`): the clock starts when the host taps Start. The rules screen is a per-phone overlay that auto-closes after 8 s (`GameKit.tsx:26`, `MchezoTrivia.tsx:45`). Phased games lose up to 8 s of their first round, and a player who skips the rules gets more time than one who reads them (audit F6).

## 1. The contract

### 1.1 Phases

```
host taps Start ──► BRIEFING (no clock) ──► PLAYING (all clocks start at T_play) ──► FINISHED
                        │
                        └──► CANCELLED (host cancels, or the stall guard): no scores, no content used
```

### 1.2 At Start (T_create)

**Unchanged from today:**
- The roster is fixed exactly as it is now: the readiness check, the "X is reconnecting: wait or start without them?" question, the D1 two-player minimum for official games, and capacity.
- Nobody is ever added after this.

**New:**
- The game's content is chosen and frozen on the server, but it is **not sent to any phone or TV**, and it is **not yet recorded as used** in the Cup's history.
- **No deadline exists yet.** `deadlineAt` and `phaseDeadlineAt` are unset; `lifecycle.phase = "briefing"`.

### 1.3 During BRIEFING

**Every screen:**
- **Player phones** show the rules (cover, objective, three steps, the real timing, e.g. "8 questions, 40 seconds each") and an **I'm ready** button.
- **TV and spectators** see the rules and who is ready. They never see content.

**Ready:**
- Tapping Ready sends a `ready` intent. It is idempotent and tied to the phase.
- **Ready cannot be withdrawn.** (Decision T4.)
- A player who taps Ready and then loses connection stays ready.

**Who has tapped Ready is shown to everyone,** as ✓ on each token, the same badge style as the lobby.

### 1.4 When play begins (T_play)

Play begins at the first of these. **No timer ever starts a game automatically.**

**(a) Everyone is ready:**
- Every roster player who is *connected* has tapped Ready, **and** no roster player is *reconnecting* (inside the existing 45 s grace, `RECONNECT_GRACE_MS`).
- *Away* players (past the grace) don't block this, but they stay in the roster and can join play later.

**(b) The host or a cohost taps "Start now":**
- **Minimum read window:** available only after T_create + **R_min**, unless (a) is already true. This protects slow readers from a host who taps through. (Decision T1, proposed 15 s.)
- **If anyone isn't ready,** the host sees a confirmation that names them. For example: "Juma and Mzee haven't tapped Ready. Their clocks will start too. They stay in the game and can still play." This is the same principle as today's "start without them?", except nobody is removed.

**At T_play** the server, in one step:
- records `playStartedAt = T_play`;
- sets `deadlineAt = T_play + gameWindowMs`;
- sets the first `phaseDeadlineAt = T_play + phaseMs` (phased games) or the first turn (Charades);
- records the content as used in the Cup;
- sends the content to phones in the next projection.

Every phone and the TV switch to play on that push. Deadlines are server time, which clients already display through `serverNow`.

### 1.5 Fairness guarantees

1. Nobody can see content before T_play, because the server doesn't send it. (Today the questions already sit in the phone's data behind the intro overlay.)
2. Every participant's first deadline is the same server instant. The only difference between phones is network delivery, as for every phase today.
3. Reading the rules never costs answer time. Skipping them never gains answer time.
4. Math Mayhem's speed bonus keeps timing each question from when it opens (`room.ts:1605-1613`).
5. A disconnected player is never dropped by this phase. If play starts while they are away, they rejoin the running game with the remaining time, as today.

### 1.6 The stall guard (Decision T2)

If neither (a) nor (b) happens within **S_max** of T_create (proposed: 5 minutes), the game is **cancelled**:
- no scores and no content used;
- a ledger entry `briefing-expired`;
- everyone returns to the lobby with "The game was cancelled because it didn't start. Nothing was scored."

The host can also **Cancel** at any time during briefing, with the same result.

*Alternative:* auto-start at S_max instead of cancelling. Not recommended, because it starts clocks for people who may have walked away.

### 1.7 Edge cases

| Situation | Behaviour |
|---|---|
| A player reconnects during briefing | Sees the rules and their own ready state; can tap Ready |
| The host disconnects during briefing | (a) still applies; a cohost can Start now or Cancel; otherwise the stall guard applies |
| Solo practice (D2) | Play starts the moment the one player taps Ready |
| Practice vs official | Same contract |
| Someone opens the rules again mid-game | A "Rules" button in the game header opens them as a sheet, **with the clock visible and running**. That is the player's choice. |
| Refresh during briefing | Same seat, same ready state, back on the rules |
| A game started before this change | Keeps its recorded `startedAt`-based deadlines exactly. Scoring and Cup records are untouched |
| An outdated client tab | `CLIENT_PROTOCOL` is raised, so old tabs are told to refresh (existing mechanism) |

### 1.8 What does not change

- Score formulas.
- Eligibility.
- The D1 rule.
- Roster rules.
- Abstention ("Sit this game out" during play).
- Content-selection rules. Only the *moment* usage is recorded moves from Start to T_play, so a cancelled briefing uses nothing.

## 2. Decisions I need from you

| # | Question | Proposal |
|---|---|---|
| T1 | Minimum read window before the host can use "Start now" | **15 s.** (0 would let a host tap straight through, as today.) |
| T2 | Stall guard | **Cancel after 5 min**, nothing scored or used. (Alternative: auto-start, not recommended.) |
| T3 | Who can see who is ready | **Everyone** (the same badges as the lobby; mild social nudge). Alternative: the host only. |
| T4 | Can a player undo Ready? | **No.** It keeps the rule simple and removes a griefing path. |
| T5 | Does this apply to games in Cups created before the change? | **Yes, for new games only.** It changes no scoring, and finished or running games keep their timestamps. Alternative: freeze per Cup, like the E10 selector. |

## 3. Tests that would come with it (a failing test first for each guarantee)

- Content is absent from every projection (player, TV, spectator) during briefing, and present after T_play.
- No deadline exists during briefing; at T_play every deadline is derived from the same instant.
- (a) does not start while a roster player is reconnecting, and starts when they are ready or go away.
- (b) is refused before R_min, unless everyone is ready.
- (b) with not-ready players keeps them in the roster and records the host's decision in the ledger.
- The stall guard cancels: no rawScores, no content usage, no Cup effect.
- A cancelled briefing doesn't change standings or the official pool.
- An old game (no briefing field) restored after the change keeps its deadlines.
- Drivers:
  - two phones read at different speeds and get identical deadlines;
  - TV secrecy during briefing;
  - reconnecting during briefing.

**Effort once approved:** about 2 days, covering server, client, TV and drivers. Its own branch, with a full gate.
