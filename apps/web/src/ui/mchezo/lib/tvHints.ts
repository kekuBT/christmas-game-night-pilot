/**
 * The TV's one-line "how this game works" hint, per game (moved from
 * TvShow.tsx in Stage 5.1 so plain tests can read it). Public facts only.
 */
export const TV_HINT: Record<string, string> = {
  "math-mayhem": "Questions appear one at a time on each phone, and each is timed from when the game sends it. Scores appear here when the game ends.",
  "trivia": "Everyone answers the same ten questions on their own phone. Answers stay hidden until the game is over.",
  "who-said-that": "Match each quote to who said it, on your own phone. Answers stay hidden until the game is over.",
  "geography": "Each phone gets the same questions. Answers stay hidden until the game is over.",
  "guess-the-year": "Guess the year of each event on your phone. Closer is better; answers come at the end.",
  "closest-wins": "One number question at a time. Closest guess wins the round.",
  "category-sprint": "Name as many fitting answers as you can before the round ends.",
  "impostor": "One player is the impostor: they see only the category, not the word. Clues, then a vote; a caught impostor gets one guess at the word. Nobody's word is ever shown here.",
  "charades": "One player acts; their own team guesses out loud. When they get it, the actor taps Correct: +100 to that team. The prompt stays on the actor's phone.",
  "word-connections": "Everyone solves their own board of sixteen words. Solutions appear when the game is over.",
  "caption-clash": "Everyone writes a caption, then votes for the funniest. Authors stay hidden until the end.",
  // Stage 9.3: cooperative. The target stays on the clue-giver's phone; guesses stay on each phone.
  "spectrum": "One team: the clue-giver sees a secret spot on the scale and gives a clue; everyone else guesses on their phone. One shared score.",
  // Stage 12.5: the family wrote the questions; who asked each one comes with its answer.
  "family-questions": "Questions the family wrote about itself. Everyone answers on their phone, except whoever wrote it; who asked comes with the answer.",
};
