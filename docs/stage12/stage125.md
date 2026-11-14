# Stage 12.5: Family Questions

**Authorization:** the owner, directly in chat on 2026-11-14, quoting suggestion 5 (family-made questions): "Definitely add 5 make improvements on it too".

- **Branch:** `claude/stage12-5-family-questions`, stacked on Stage 12.4. Unmerged.
- **Unchanged:** no merge or deployment, $0, AGENTS.md rules, and the gates.

**The idea:** the family writes trivia about itself ("Where did Bibi grow up?", "Who always burns the chapati?") on their own phones in the lobby, and plays it like Trivia. The fun is in what only this family knows, and in finding out who asked.

**Improvements on the original suggestion** (the owner asked for some):
- "Who in the family?" questions, whose answers are the players themselves;
- the writer never answers their own question, and earns a "great question" bonus when some, but not all, get it right;
- who asked each question is a secret until its answer, then revealed on the TV;
- turn-taking between writers, so one keen writer can't fill a game;
- moderation that never needs anyone to read someone else's questions;
- "Play it next" for the host, and a Start that waits, with a reason, until there are enough questions.

## 1. Writing questions (D-S125-01, D-S125-04)
- **Who:** any player in a casual room, from the lobby's Family Questions card ("Write a question").
- **Kinds:**
  - **Multiple choice:** 2 to 4 answers, one marked right.
  - **Who in the family?:** the writer picks a player as the answer. In the game, the choices are everyone playing, by name.
- **Limits** (`FAMILY_LIMITS`, shared by the server and the phone):
  - a question of up to 140 characters, answers of up to 60, all different;
  - 15 questions per writer waiting to be played, and 60 per room.
  - The phone runs the server's own check, so a refusal says why before anything is sent (for example "Fill in every answer, or remove the empty one.").
- **Secret until played:**
  - each phone receives only its own questions, in full;
  - everyone, the TV included, receives counts: how many are ready, and how many each player wrote;
  - not even the host can read anyone else's questions;
  - the ledger records that a question was added (its kind) or removed (a count), never its words.
- **Taking one back:** the writer can delete their own unplayed question.
- **Saved** with the room, so a restart keeps them. A question that can't be read back whole is left out.

## 2. Playing (D-S125-02)
- **Casual rooms only, practice-only.** Never in a Quick Party lineup and never Home's "featured today", because it needs written questions first.
- **Starting:**
  - at least 3 ready questions are needed. With fewer, the server refuses (`FAMILY_TOO_FEW`) and the host's Start says "Needs N more family questions".
  - When enough are ready, the host's card offers "Play it next".
- **This game's questions:**
  - up to 10, chosen at the start in a seeded order, taking turns between writers;
  - a "Who in the family?" question is used only when its answer is playing;
  - the answer order of a multiple-choice question is shuffled;
  - played questions are used up. A game cancelled in its briefing frees its questions again.
- **Each question:**
  - **Answering** (30 s): everyone except the writer picks an answer on their phone, or passes. The writer's phone says "This one's yours!".
  - Nobody, the TV included, is told the answer or who asked while it's open.
  - **The reveal** (8 s): the right answer and how many picked each, who got it, who asked, and the great-question bonus.
- **Scoring:**
  - 100 for a right answer;
  - 50 to the writer when some, but not all, of the others got it right;
  - a question nobody or everybody gets right earns its writer nothing.
- **The host's skip:**
  - the host or a cohost can skip the open question for everyone, with two taps;
  - it's never revealed and never scored;
  - results say "Skipped by the host." without its words.
- **Results:** every question with its answer and who asked, the great questions celebrated, the scores, and how scoring works.

## 3. Moderation without reading (D-S125-03)
- The host or a cohost can remove every unplayed question one player wrote, from the write sheet's host section. It shows a name and a count, never the questions, and asks for a second tap.
- Together with the live skip, the host never has to read a question early to keep the night kind.

## 4. The TV
- **While a question is open:**
  - the question and its answers;
  - "N of M answered", counting only those who can answer;
  - "Someone here wrote this. Who? You'll find out with the answer."
- **At the reveal:** the right answer marked with ✓ and words (never colour alone), the picks, "Asked by …", the great question, and who got it.
- **Layout:** sized so the longest question (140 characters) with four answers fits a 1080p screen. A long question drops the hint line.
- **After the game:** the usual final standings, and a post-game review of every question.

## 5. Acceptance
1. Writing works for both kinds, says why when refused, and is limited.
2. No projection or screen other than the writer's ever holds a question before it's played. Counts are public.
3. With fewer than 3 ready, nothing starts. Turn-taking, who-questions only with their answer in the game, a seeded shuffle, used up when played, freed by a cancelled briefing.
4. The writer can't answer their own question. Scores follow §2. The host's skip is never revealed or scored, and others can't skip.
5. The host or a cohost removes a writer's unplayed questions unread; others can't.
6. Saved with the room.
7. Phones and the TV show §2 and §4, and the TV fits a 1080p screen. Nothing else moves, and the full gate passes.

## 6. Validation
- **Unit and HTTP tests:** `tests/stage125-family.test.ts` (12), covering:
  - the check, the pick and the scoring (pure);
  - writing, limits and secrecy with canaries;
  - take back and remove-unread;
  - too few, Quick Party exclusion, casual-only and practice-only;
  - a whole game through the room;
  - the host's skip;
  - who-questions and a cancelled briefing;
  - persistence and HTTP statuses.
- **Older tests updated for the 17th game:** the catalogue counts and lists in library, m3, manifest, room, test-batch-200 and covers. In d3-briefing, Family Questions now gets written questions before its briefing secrecy check.
- **Browser:** `scripts/check-family-questions.mjs` (three phones and a TV) covers:
  - writing both kinds and a refusal;
  - secrecy on screens and in feeds;
  - Start waiting, "Play it next" and take back;
  - a whole game with a host skip;
  - TV fit checks on every question and reveal, including the 140-character worst case;
  - results, remove-unread, and the write sheet at 320 px.
- **check-warm-ivory W8:** cover gradients are compared without React's generated id number, which a new cover shifts. The new game's cards and the lobby card are allowed by test-id prefix, and each element must still reuse a base style. On a failure, W8 prints every difference.
- **check-cup-party (Stage 12.3) fix:** the host now switches the lineup's *second* game to Practice, replacing it first when it's practice-only. Step E starts the second game. Before this, a random lineup with a practice-only second game made E expect the wrong game. Found in a gate run; see `docs/evidence/stage125-local/README.md`.
- **Gates:** targeted, fast, then one full checkpoint.

## 7. Estimate vs actual
- **Estimate:** about 6 hours (server, phone, TV, tests, driver).
- **Actual:** about 5½ hours to the first green targeted gate, including two layout passes on the TV after screenshots showed answers cut off at 1080p.
