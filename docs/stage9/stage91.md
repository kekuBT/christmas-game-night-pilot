# Stage 9.1: Jebena Rush, the first playable slice

ChatGPT's handoff 6807907986 on PR #14 (Stage 8.3 cleared) set this up. The work proceeds under D-WF-01, based on `90290ef`. No merge, no deployment, no public ports, no spending.

**Goal:** one complete, original Jebena Rush loop in a casual room, small enough to review before the bank and the polish grow.

## 1. Owner's settled direction (docs/MILESTONES.md), kept as is
- **Name and tagline:** Jebena Rush, "Name it. Pass it. Beat the steam."
- **Play:** a category game. Players name answers in a category and pass the jebena on.
- **Look:** an original, animated Ethiopian jebena whose steam and wobble build, passed between players.
- **Hearts:** 5 by default, with a choice of 3, 5 or 7.
- **Answers:** a curated bank with canonical answers and aliases, and careful handling of obvious typos.

Everything else below is an architect default for this first slice (the handoff's own defaults, or mine where marked). None is an owner decision.

## 2. Inventory: what this slice reuses
| Need | Reused | Where |
|---|---|---|
| Game logic contract | `GameModule`: JSON state, validated intents, player and public views, `dueAt`/`advance` for server-clock windows | `src/games/modules/types.ts` |
| Turn deadlines | RoomEngine's tick, which calls `advance()` at a module's `dueAt`, idempotently, also after a restart | `src/server/room.ts` (`tick`, `advanceModule`) |
| Match limit | The lifecycle policy's game deadline, which finalizes exactly once | `src/server/lifecycle.ts`, `expireGame` |
| Roster, readiness, briefing, start, results, Play again, back to lobby | The casual room lifecycle (Stages 6–7) and the D3 briefing | `room.ts`, `Briefing.tsx`, `WhatsNext.tsx` |
| Time authority | Server time only; deadlines are absolute instants in the game record | lifecycle notes in `room.ts` |
| Answer normalisation and typo guard | Category Sprint's matcher v2: meaning-preserving normalisation, a plural fold only onto a listed answer, a one-edit typo only at 6+ letters with no rival within two edits | `src/games/sprint.ts` |
| Seeded order | `moduleRng`, `seededShuffle` | `types.ts` |
| Looks | Everyday and Christmas theme tokens; motion settings (reduced, off) | `ui/mchezo` |
| App-shell privacy | Every `/rooms` and `/games` reply is network-only (Stage 8.3) | `swPolicy.ts` |

**New in this slice:**
- a module (`src/games/modules/jebena.ts`);
- a versioned bank (`src/games/modules/packs/jebena-banks.ts`);
- a matcher wrapper with an explicit "ambiguous" outcome;
- game settings at start (the hearts);
- phone, TV and results screens;
- tests and a browser driver.

## 3. Rules
- **Who:** casual rooms only, 2–10 players. The roster is fixed when the match starts: whoever joins later watches until the next match.
- **Seating:** a seeded shuffle of the roster, shown to everyone.
- **A turn:**
  - The current player has **10 seconds** to name an unused answer in the category.
  - **Accepted:** the jebena passes to the next player in seat order who still has hearts, and their 10 seconds start.
  - **Not accepted** (already used, not in the bank, ambiguous, or empty): the player is told why and can try again. **The deadline doesn't move.**
  - **Time runs out:** the player loses **exactly one heart**, and the jebena passes on.
  - **Zero hearts:** that player is out.
- **Categories** (my default):
  - A category holds until someone loses a heart, or until its bank is used up. Either way the next category in a seeded rotation of the six begins, with no penalty for a used-up bank.
  - A category that returns later keeps its used answers for the whole match.
  - If every category is used up, the match ends (D-S91-03).
- **The end:**
  - **One player left with hearts:** that player keeps the jebena.
  - **The match limit:** 12 minutes from the start (`gameWindowMs`, my default). The turn in progress is cut without costing a heart.
- **Places, deterministic** (D-S91-04):
  - Players still in rank above players out.
  - Among those still in, more hearts ranks higher; equal hearts share a place.
  - Players out rank by when they went out: later is higher. Only one turn runs at a time, so eliminations never tie.
- **Points**, shown on the results:
  - 100 for every player you outlast;
  - 10 for every heart you keep to the end.
  - Hearts never exceed 7 (at most 70 points), so points follow the places exactly. Answers named are shown as a statistic, not points.
- **Practice only:** never official, no Cup, no solo variant, not added to Quick Party automatically, no Memory Book features.

## 4. Timing and boundaries (D-S91-02)
- **One deadline per turn,** `turn.deadline` (server ms), shown as a 10-second countdown.
- **The server accepts an answer until `deadline + 500 ms`** of network grace. The timeout is processed at that same instant, by the tick or by the first request after it.
- **A boundary race resolves once,** because RoomEngine runs `tick()` before every action:
  - an answer arriving after the instant finds the turn already timed out;
  - its `turn` number no longer matches, so it is refused as stale, with no heart change and no second pass.
- **Every answer carries the turn number it was typed for.** A replayed, reloaded or duplicated send for an old turn is stale.
- **An accepted answer ends the turn,** so a second copy of the same send is stale too.
- **A turn takes at most 20 attempts** (an abuse guard). Input is at most 40 characters.

## 5. Disconnects, reconnects and leaving (D-S91-05)
- **Connection never changes the rules.** A turn runs on the server clock whether or not its player is connected.
- **Reconnecting or reloading** shows the current state. It never restores a heart, resets a deadline or replays an old turn.
- **No stall:** every turn ends by its deadline, and the match ends at one survivor, at the match limit or when the banks run out. It can't hang, even when fewer than two players are connected.
- **No win just because a socket dropped:** only hearts decide. An absent player's turns time out like anyone's, one heart each, so a short drop costs nothing if they're back within their turn.
- **"Sit this one out"** (the room's existing abstain) leaves the match: the player is out from that moment, and if it was their turn, the jebena passes.

## 6. State, protocol and projections
- **State** (`game.extra`, JSON, persisted with the room):
  - `rulesVersion`, `bankVersion`, `seed`, `startHearts`, the seat `order`;
  - per player: `hearts`, `outAt` (its order of going out), `answers` (a count), `timeouts`;
  - the current `category` and the `rotation`; `used` (canonical ids per category); `turn` (`n`, `player`, `startedAt`, `deadline`, `attempts`);
  - a public `log` of played facts (accepted answers, timeouts, outs, category changes);
  - private per-player feedback on the current turn's last attempt;
  - `end` (`last-standing`, `banks-exhausted`, or the room's `deadline`).
- **Start:** the casual start request may carry `settings: { hearts: 3 | 5 | 7 }`, for Jebena Rush only. The server validates it (default 5), records it with the game, and Play again reuses it. A repeated start attempt must carry the same settings (as with the content choice in Stage 8.2).
- **Intent `jebena-answer` `{ turn, text }`:**
  - **Refused, nothing changes:** `NOT_IN_GAME`, `OUT`, `NOT_YOUR_TURN`, `STALE_TURN` (the turn has moved on), `TOO_LATE`, `INVALID_PAYLOAD` (text missing or over 40 characters), `TOO_MANY_ATTEMPTS`.
  - **Answered:** `{ verdict: "accepted", answer, via }`, or a rejection with the deadline unchanged: `{ verdict: "used" | "not-in-bank" | "ambiguous" | "near-miss" | "empty", hint? }`.
- **Public projection** (TV, spectators and everyone):
  - the order, with hearts and who is out;
  - the turn (number, player, deadline) and the category (name and definition);
  - this category's accepted answers so far, the last event, places and points when finished.
- **Player projection:** the public one, plus their own hearts and their last attempt this turn (their own text and its verdict only).
- **Never sent:**
  - the bank, or any unused answer;
  - another player's rejected attempts;
  - tokens.
- **Never cached:** none of this enters the app-shell cache. Every `/rooms` reply is network-only, as checked in Stage 8.3.

## 7. Answer bank and matching (D-S91-06)
- **The bank:** `src/games/modules/packs/jebena-banks.ts`, versioned (`JEBENA_BANK_VERSION`). The game records the version it started with.
  - Each category has `id`, `name`, a one-line `definition`, and answers as `{ id, name, aliases? }`. Ids are stable and never reused.
  - Like Majority's and Draw's packs, it is a provisional, practice-only module pack. Before any official use it would move into the reviewed content-pack system.
- **Six year-round categories, at least 40 canonical answers each:**
  - Animals, Fruits, Vegetables, Sports and Jobs start from the reviewed Category Sprint lists (S4) and are extended;
  - Countries in Africa reuses the source-verified closed set (54), with its aliases and its "Congo" rule.
  - Year-round items play under both the Everyday and Christmas content settings. No Christmas category is in this slice.
- **Matching:** Sprint's v2 normalisation (case, accents, spacing, punctuation, a leading article), then:
  1. **An exact answer or listed alias:** that canonical answer.
  2. **A plural that folds onto one listed answer or alias:** that answer.
  3. **A one-edit typo at 6 or more letters,** only when exactly one canonical answer is within one edit and no other answer or alias is within two. It is accepted as that answer.
  4. **A near-miss:** two or more answers within one edit, or one within one edit with a rival within two, or a short word within one edit of an answer. It is **ambiguous**, never silently another answer: "Did you mean…?" without naming the hidden answer when it is unused.
  5. **Anything else:** "not in this bank". The screen never claims the bank knows every valid answer.
- **Duplicates are decided on canonical ids.** An alias or typo uses up the same answer.
- **A bank report** (a unit test and §9): counts per category, any alias claimed by two answers, any alias equal to another answer, and every pair of answers within two edits (where the typo rule stays off).

## 8. Screens
- **Lobby:**
  - Jebena Rush is in the library as practice-only.
  - When it is chosen, the host picks 3, 5 or 7 hearts (5 preselected), and guests see the choice.
  - The existing briefing explains the rules, and players get ready.
- **Phone, while playing:**
  - The category, the jebena (steam and wobble rise as the deadline nears), and whose turn it is ("Your turn!" or a name).
  - A countdown in text, and hearts as icons with the number in text.
  - **On your turn:** a text field that is focused and sends with Enter or the Send key, then feedback (accepted, already used, not in this bank, did you mean…).
  - **Off your turn:** the recent answers and the seat order.
  - **Out:** you watch the rest.
- **TV:** the jebena, the category, the current player and countdown, everyone's hearts, and the last answer. Public facts only.
- **Results:**
  - The places, with "kept the jebena" for the winner;
  - hearts left, answers named and timeouts;
  - points explained in a line;
  - the room's existing Play again and back-to-lobby controls.
- **Motion:**
  - Steam and wobble are CSS animations scaled by urgency.
  - With reduced or no motion, a still jebena and a text urgency label ("Steaming", "Boiling over!") carry the same meaning.
  - Nothing relies on colour alone.
- **Layout and looks:** 320 px and 390 px phones, and a desktop TV. Both looks; the jebena art reads on either background.

## 9. Acceptance matrix
| Area | How it is shown |
|---|---|
| Rules | Unit tests on the module: pass on accept; rejection keeps the deadline; timeout costs one heart and passes; 0 hearts is out; category rotation and used-up banks; one survivor; the match limit and places; points |
| Boundaries | Unit and socket tests: out-of-turn, spoofed (another seat's id), stale turn, late, duplicate and replayed sends never change hearts or pass twice; the deadline instant resolves once |
| Matching | Unit tests: aliases, plurals, typos accepted only when unambiguous; short words and near pairs give "ambiguous"; duplicates by canonical id; the bank report (counts, no collisions) |
| Settings | Unit and HTTP tests: hearts 3, 5 and 7, the default 5, invalid values refused, Play again keeps them, a repeated attempt must match |
| Projections | Tests: no bank, no unused answer and no token in any projection; another player's attempts are never visible |
| Lifecycle | Socket tests at 2, 4 and 10 players: play to results, Play again, back to lobby; late joiners watch; restart recovery mid-turn; two rooms isolated |
| Browser | A new driver (`check-jebena-rush`): host, guest and TV; timeouts and elimination; aliases, typos and duplicates; disconnect and reconnect; both looks; keyboard only; 320 and 390 px; reduced motion |
| Gates | Sequential clean fast then full gates on the completed checkpoint |

## 10. Decisions (details in docs/DECISIONS.md)
- **D-S91-01, a module:** Jebena Rush is a `GameModule` on the room's existing lifecycle, a practice-only casual game; no new room machinery.
- **D-S91-02:** 10-second turns, 500 ms network grace, one deadline per turn, the turn number on every answer, at most 20 attempts and 40 characters.
- **D-S91-03:** a new category after every heart lost or used-up bank, from a seeded rotation; used answers persist per category; all used up ends the match.
- **D-S91-04:**
  - a 12-minute match limit;
  - places (in before out, then hearts, then the order of going out; equal hearts share);
  - points: 100 per player outlasted, 10 per heart kept.
- **D-S91-05:** connection never changes the rules (§5).
- **D-S91-06:** a module bank with canonical ids and aliases, Sprint v2 normalisation, and an explicit "ambiguous" outcome.
- **D-S91-07:** game settings at start (`hearts`), validated, recorded, reused by Play again, and part of a start attempt's identity.

## 11. Questions for you (defaults are in place; say if you want otherwise)
1. **A new category after every lost heart.** The alternative, keeping it until its bank is used up, lets one hard category knock several players out in a row.
2. **The 12-minute match limit** and the 500 ms grace.
3. **Points as 100 per player outlasted plus 10 per heart kept,** so that points follow the places. The alternative is ranking only, with no points shown.

## 12. Validation and report
- Focused deterministic tests while building.
- Then sequential clean fast and full gates on the completed checkpoint.
- One new completed report on the Stage 9.1 PR with the tested SHA and head delta, run IDs and verdicts, raw evidence, screenshots, and limitations.
- Emulation and engines are labelled apart from real devices.
