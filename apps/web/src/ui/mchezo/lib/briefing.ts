/**
 * D3 briefing display helpers. Pure: no React, no fetch.
 *
 * The server owns the briefing: who is ready, when Start now unlocks, the
 * warning and the cancellation (docs/ux-redesign/D3_TIMING_CONTRACT.md).
 * These helpers only describe it. `needsConfirmation` mirrors the server's
 * rule so the host's dialog names the right people, but the server checks
 * the host's list against its own state and refuses a stale one.
 */

export type BriefingPresence = "connected" | "reconnecting" | "away";

export interface BriefingInfo {
  createdAt: number;
  startNowAt: number;
  warnAt: number;
  expiresAt: number;
  /** Roster player ids that have tapped Ready, in roster order. */
  ready: string[];
  warned: boolean;
}

export interface BriefingPerson {
  id: string;
  name: string;
  ready: boolean;
  presence: BriefingPresence;
  you: boolean;
}

/** Roster rows, in roster order, with readiness and presence from the projection. */
export function briefingPeople(
  roster: string[],
  briefing: BriefingInfo,
  players: { id: string; displayName: string; connected: boolean; presence?: BriefingPresence }[],
  meId?: string,
): BriefingPerson[] {
  const ready = new Set(briefing.ready);
  return roster.map((id) => {
    const p = players.find((x) => x.id === id);
    return {
      id,
      name: p?.displayName ?? "A player",
      ready: ready.has(id),
      presence: p?.presence ?? (p?.connected ? "connected" : "away"),
      you: id === meId,
    };
  });
}

/**
 * Who the host must name before Start now: everyone not ready or not
 * connected, except the person tapping it (their tap is their own consent;
 * it doesn't make them ready).
 */
export function needsConfirmation(people: BriefingPerson[], actorId: string): BriefingPerson[] {
  return people.filter((p) => p.id !== actorId && (!p.ready || p.presence !== "connected"));
}

/** "Ready", "Not ready yet", plus the connection when it isn't live. */
export function personStatus(p: BriefingPerson): string {
  const r = p.ready ? "Ready" : "Not ready yet";
  if (p.presence === "reconnecting") return `${r} · reconnecting`;
  if (p.presence === "away") return `${r} · away`;
  return r;
}

const PHASE_WORDS: Record<string, string> = {
  question: "each question",
  write: "writing a caption",
  vote: "voting",
  round: "each round",
  clue: "giving clues",
  guess: "guessing",
  predict: "predicting and voting",
  reveal: "each reveal",
  draw: "each drawing",
  turn: "each turn",
};

/**
 * Stage 9.3 (review 6815042876): a phase kind can mean different things in
 * different games ("guess" is the impostor's one guess in Impostor, but
 * everyone's guesses in Spectrum), so a game may name its own phases.
 */
const GAME_PHASE_WORDS: Record<string, Record<string, string>> = {
  "impostor": { guess: "the impostor's guess" },
  "spectrum": { clue: "the clue", guess: "everyone's guesses", reveal: "each reveal" },
  "family-questions": { question: "each question", reveal: "each answer" },
};

/** The real time limits, from the lifecycle policy the server enforces, in this game's own words. */
export function timingLines(lifecycle?: { gameWindowMs: number; phaseMs?: Partial<Record<string, number>> }, gameId?: string): string[] {
  if (!lifecycle) return [];
  const lines: string[] = [];
  const phases = Object.entries(lifecycle.phaseMs ?? {}).filter(([, ms]) => typeof ms === "number" && ms > 0) as [string, number][];
  // Whole seconds, rounded down: a phase may carry a fraction of a second of network grace (Jebena Rush: 10 s + 0.5 s).
  const words = (gameId && GAME_PHASE_WORDS[gameId]) || {};
  for (const [k, ms] of phases) lines.push(`${Math.floor(ms / 1000)} seconds for ${words[k] ?? PHASE_WORDS[k] ?? k}.`);
  const min = Math.round(lifecycle.gameWindowMs / 60_000);
  lines.push(min >= 1 ? `The whole game ends by itself after about ${min} minute${min === 1 ? "" : "s"}.` : `The whole game ends by itself after ${Math.round(lifecycle.gameWindowMs / 1000)} seconds.`);
  return lines;
}

/** Where the briefing stands at `now` (server time), for the countdowns. */
export function briefingClock(b: BriefingInfo, now: number): { startNowInMs: number; cancelInMs: number; warning: boolean } {
  return {
    startNowInMs: Math.max(0, b.startNowAt - now),
    cancelInMs: Math.max(0, b.expiresAt - now),
    warning: b.warned || now >= b.warnAt,
  };
}

/** The rules shown in the briefing: existing intro copy where a game has it, else its registry line. */
const RULES: Record<string, { objective: string; steps: string[] }> = {
  "word-connections": {
    objective: "Find four groups of four.",
    steps: ["Sixteen words hide four secret groups.", "Tap four words that belong together, then Submit.", "Four mistakes and your puzzle ends — the groups you found still count."],
  },
  "caption-clash": {
    objective: "Write the funniest caption.",
    steps: ["Everyone gets the same silly scene.", "Write a caption, then vote for your favourite (not your own).", "Captions are anonymous until the end. 25 points for each caption you write, plus 100 for every vote it gets."],
  },
  // Stage 5.1 (3D): the rules as src/games/impostor.ts plays them.
  "impostor": {
    objective: "Find the impostor, or, as the impostor, blend in.",
    steps: [
      "Everyone sees the category. Everyone except the impostor also sees the secret word; the impostor sees only the category, and knows it.",
      "Write a short clue that shows you know the word without giving it away.",
      "Vote for who you think the impostor is. A tie, or no votes, catches nobody: the impostor wins.",
      "A caught impostor gets one guess at the word: right, the impostor wins; wrong, everyone else wins.",
      "The winning side scores 100; honest players who voted for the impostor get 20 more when their side wins.",
    ],
  },
  "trivia": {
    objective: "Ten questions. One tap locks your answer.",
    steps: [],
  },
  // Stage 5 (Practice-only).
  "majority-rules": {
    objective: "Guess which way the room will vote.",
    steps: [
      "Five fun either/or questions.",
      "First predict which answer most people will pick, then cast your own vote.",
      "100 points for a right prediction. If the room splits evenly, every prediction scores 50.",
      "Votes stay anonymous: only the totals are ever shown.",
    ],
  },
  "pattern-pulse": {
    objective: "Watch a sequence of shapes, then tap it back in order.",
    steps: [
      "Six rounds at your own pace: 3 shapes, then 4, up to 8.",
      "Tap “Show me the pattern” when you're ready. It shows for a few seconds, then hides; you then have 16 to 24 seconds to tap it back (longer patterns get longer).",
      "Each round's time starts when you open it, but the whole game also has a time limit (below): leave yourself time for every round.",
      "20 points per shape right from the start, plus 50 for the whole sequence.",
      "Everyone gets their own pattern, with the same lengths and time.",
    ],
  },
  // Stage 9.1 (docs/stage9/stage91.md §3).
  "jebena-rush": {
    objective: "Name it. Pass it. Beat the steam.",
    steps: [
      "Hold the jebena? Name something in the category before the steam boils over: 10 seconds a turn.",
      "A right answer passes the jebena to the next player. A wrong one costs only time: try again.",
      "Each answer counts once. Time runs out: one of your cups breaks, and a new category starts.",
      "When all your cups are broken, you're out. The last player with a whole cup keeps the jebena.",
      "The clock never stops for anyone: if your phone drops off, your turns still run out, and coming back gives no time or cups back.",
    ],
  },
  // Stage 12.5 (docs/stage12/stage125.md §2).
  "family-questions": {
    objective: "Questions the family wrote. How well do you know each other?",
    steps: [
      "Up to ten questions, written in the lobby by the people playing. Nobody has seen them yet.",
      "Pick your answer on your phone. You don't answer your own question: sit back and keep a straight face.",
      "100 points for a right answer. When some, but not all, get a question right, whoever wrote it scores 50 for a great question.",
      "Who asked each question is revealed with its answer. The host can skip a question; it's never shown again.",
    ],
  },
  // Stage 9.3 (docs/stage9/stage93.md §4): one team, one score.
  "spectrum": {
    objective: "One team, one score: find the secret spot on the scale together.",
    steps: [
      "Four rounds. Each round shows a scale with two ends, like Cold to Hot, from 0 to 100.",
      "Each round one player gives the clue, and the role moves round the room. Only the clue-giver sees the secret target on the scale.",
      "Give a clue, not the target number: a word or a few that sit at about that spot. 60 seconds.",
      "Everyone else places a guess from 0 to 100 and sends it: 45 seconds. A guess can't be changed once it's sent.",
      "The team's guess is the middle of everyone's guesses. Within 5 of the target scores 10, within 10 scores 7, within 20 scores 4: one shared score out of 40.",
      "No clue in time skips the round for 0. Leaving hands your role on. The clock never stops, and only guesses that are sent count.",
    ],
  },
  "draw-guess": {
    objective: "Draw the secret word, or guess what's being drawn.",
    steps: [
      "Up to six turns: with six players or fewer everyone draws once; with more, six players chosen at random draw. Only the drawer sees the word.",
      "The drawer can swap the word once, before drawing starts. Each guesser gets 12 guesses per drawing.",
      "Draw with your finger: colours, three line sizes, undo and clear. No letters or numbers!",
      "Type guesses on your phone. Wrong guesses stay private.",
      "Guessers score 100, 80, 60, then 50 in the order they get it; the drawer 50 for each.",
    ],
  },
};

export function briefingRules(gameId: string, tutorial: string): { objective: string; steps: string[] } {
  return RULES[gameId] ?? { objective: tutorial, steps: [] };
}
