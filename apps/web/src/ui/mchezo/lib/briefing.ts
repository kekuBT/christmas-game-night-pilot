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

/**
 * Fair starts (handoff 7004097156, M9): the Start now confirmation is a snapshot, taken when the host tapped Start
 * now (or when the server asked again): what the host confirms is what they were shown, and the server refuses a stale
 * list. The title says what the snapshot's rows say, in the same words: "not ready" only for someone who hasn't tapped
 * Ready, "not connected" for a Ready player whose phone is away or reconnecting.
 */
export function confirmTitle(snapshot: BriefingPerson[]): string {
  const notReady = snapshot.filter((p) => !p.ready).length;
  const offline = snapshot.filter((p) => p.ready && p.presence !== "connected").length;
  const one = snapshot.length === 1 ? snapshot[0]! : null;
  // Only a refusal from a server that sends no status facts can name someone whose latest row is ready and connected
  // (refreshedSnapshot): the title then claims no reason the row doesn't show.
  if (notReady + offline < snapshot.length) return one ? `The game asked again about ${one.name}. Start anyway?` : `The game asked again about ${snapshot.length} people. Start anyway?`;
  if (offline === 0) return one ? `${one.name} isn’t ready. Start anyway?` : `${snapshot.length} people aren’t ready. Start anyway?`;
  if (notReady === 0) return one ? `${one.name} isn’t connected. Start anyway?` : `${snapshot.length} people aren’t connected. Start anyway?`;
  return `${snapshot.length} people aren’t ready or aren’t connected. Start anyway?`;
}

/** Fair starts (review 7007413347): one named player's readiness and connection at a READINESS_CHANGED refusal. */
export interface NeedStatus {
  id: string;
  ready: boolean;
  presence: BriefingPresence;
}

const PRESENCES: readonly string[] = ["connected", "reconnecting", "away"];

/** The well-formed status facts in a refusal body, or undefined when it has none (a server that doesn't send them). */
export function parseNeedStatus(x: unknown): NeedStatus[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out: NeedStatus[] = [];
  for (const e of x) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    if (typeof r["id"] === "string" && typeof r["ready"] === "boolean" && typeof r["presence"] === "string" && PRESENCES.includes(r["presence"])) {
      out.push({ id: r["id"], ready: r["ready"], presence: r["presence"] as BriefingPresence });
    }
  }
  return out;
}

/**
 * The host's Start now confirmation (M9; review 7007413347). `ids` is the list Confirm sends: the client rule's on a
 * tap, the server's own when it asked again, unchanged. `rows` say why each of them needs confirming, as of one
 * moment, and the title counts them. `rev` is the projection revision that moment belongs to; a live projection at
 * or after it describes the time after the snapshot. `caughtUp` is set once the live rows have done so, and from
 * then on their differences are listed as changes; before that, an older projection can't contradict the rows.
 */
export interface ConfirmSnapshot {
  ids: string[];
  rows: BriefingPerson[];
  /** "tap": the host tapped Start now. "checked": the server asked when they tapped. "checked-again": it asked again when they confirmed. */
  source: "tap" | "checked" | "checked-again";
  rev?: number;
  caughtUp: boolean;
}

const placeholder = (id: string): BriefingPerson => ({ id, name: "A player", ready: false, presence: "away", you: false });

/** The snapshot when the host taps Start now: the live rows they are looking at. */
export function tapSnapshot(live: BriefingPerson[], actorId: string, liveRev?: number): ConfirmSnapshot {
  const rows = needsConfirmation(live, actorId).map((p) => ({ ...p }));
  return { ids: rows.map((p) => p.id), rows, source: "tap", ...(liveRev !== undefined ? { rev: liveRev } : {}), caughtUp: true };
}

/**
 * The snapshot when the server asks (again): its list, unchanged, and each person's status from the refusal's own
 * facts. Names come from the latest applied projection of this briefing. A server that sends no facts gets the latest
 * applied projection's rows instead (never rows captured before the request was sent).
 */
export function refusalSnapshot(ids: string[], facts: NeedStatus[] | undefined, latest: BriefingPerson[], opts: { rev?: number; again: boolean }): ConfirmSnapshot {
  const rows = ids.map((id) => {
    const row = { ...(latest.find((p) => p.id === id) ?? placeholder(id)) };
    const f = facts?.find((x) => x.id === id);
    return f ? { ...row, ready: f.ready, presence: f.presence } : row;
  });
  return { ids: [...ids], rows, source: opts.again ? "checked-again" : "checked", ...(opts.rev !== undefined ? { rev: opts.rev } : {}), caughtUp: false };
}

/**
 * Whether the live rows describe the time after the snapshot: by revision when both are known, otherwise once the
 * live rows have agreed with the snapshot (the projection broadcast with a refusal says what the refusal said).
 */
export function liveCaughtUp(snap: ConfirmSnapshot, live: BriefingPerson[], liveRev: number | undefined): boolean {
  if (snap.caughtUp) return true;
  if (snap.rev !== undefined && liveRev !== undefined) return liveRev >= snap.rev;
  return snap.rows.every((s) => {
    const l = live.find((p) => p.id === s.id);
    return !!l && l.ready === s.ready && l.presence === s.presence;
  });
}

/** The line above the snapshot's rows, saying which moment they describe. */
export function confirmWhen(snap: ConfirmSnapshot): string {
  if (snap.source === "checked-again") return "When you confirmed, the game checked again:";
  if (snap.source === "checked") return "When you tapped Start now, the game checked:";
  return "When you tapped Start now:";
}

/**
 * What has changed since the snapshot, from the live rows (the same projection the heading and the person rows use):
 * one line per change, in the snapshot's order, then anyone who now needs confirming but wasn't in it. Empty when the
 * snapshot is still true. The dialog shows these lines instead of silently mixing a snapshot count with live rows.
 */
export function confirmChanges(snapshot: BriefingPerson[], live: BriefingPerson[], liveNeedIds: string[]): string[] {
  const out: string[] = [];
  const now = (id: string) => live.find((p) => p.id === id);
  const presenceLine = (p: BriefingPerson) => (p.presence === "connected" ? `${p.name} is connected again` : `${p.name} is ${p.presence} now`);
  for (const s of snapshot) {
    const l = now(s.id);
    if (!l) continue;
    if (s.ready !== l.ready) out.push(l.ready ? `${l.name} is ready now` : `${l.name} isn’t ready any more`);
    else if (s.presence !== l.presence) out.push(presenceLine(l));
  }
  for (const id of liveNeedIds) {
    if (snapshot.some((s) => s.id === id)) continue;
    const l = now(id);
    if (l) out.push(!l.ready ? `${l.name} isn’t ready any more` : presenceLine(l));
  }
  return out;
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
  "team-huddle": { question: "each question", reveal: "each answer" },
  "split-clues": { question: "each puzzle", reveal: "each answer" },
  "team-draw": { draw: "each drawing", reveal: "each reveal" },
  "territory": { question: "each question", reveal: "each claim" },
  "tug-of-war": { round: "each bout", reveal: "each result" },
  "know-your-rivals": { question: "each answer", guess: "each guess", reveal: "each reveal" },
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
      "Each answer counts once. After a run of 5 to 8 right answers, a new category starts. Time runs out: one of your cups breaks, and a new category starts too.",
      "When all your cups are broken, you're out. The last player with a whole cup keeps the jebena.",
      "The clock never stops for anyone: if your phone drops off, your turns still run out, and coming back gives no time or cups back.",
    ],
  },
  // Stage 12.14 (docs/stage12/stage1214.md §1).
  "know-your-rivals": {
    objective: "How well does your team know the others?",
    steps: [
      "Six light \"this or that\" questions about yourself, like \"Tea or coffee?\". Pick one on your own phone, or \"Rather not say\".",
      "Nobody sees your answer, not even your team: only each team's totals are ever shown.",
      "Then, together, your team guesses how many of each other team picked the first option. Any teammate can set it; one locks it in.",
      "If nobody on a team picks either answer (\"Rather not say\", or the time runs out), that team sits the round's guessing out: nobody guesses it, and it guesses nobody.",
      "Up to 30 points for each team you guess: exact scores 30, less the further off. Everyone scores their team's points.",
    ],
  },
  // Stage 12.13 (docs/stage12/stage1213.md §2).
  "tug-of-war": {
    objective: "Pull the rope for your team!",
    steps: [
      "Three bouts. Answer quick sums on your own phone as fast as you can: every right answer pulls the rope for your team.",
      "Everyone gets the same sums in the same order. A wrong answer freezes you for 2 seconds.",
      "Your team's pull is its right answers per player, so a smaller team can win. With three or four teams, everyone pulls a knot in the middle.",
      "Each bout: 100, 75, 55 or 40 by pull. A team far behind pulls ×1.2 in the next bout. Everyone scores their team's points.",
    ],
  },
  // Stage 12.12 (docs/stage12/stage1212.md §2).
  "territory": {
    objective: "Answer as a team, then claim the board.",
    steps: [
      "Eight quiz questions. One tap answers for your whole team, so agree first! Other teams only see that you've answered.",
      "Got it right? Pick a cell next to your land: an empty one, or steal one from another team. Homes can't be taken.",
      "If two teams pick the same cell, the team that answered first gets it; the other gets the nearest free cell.",
      "10 points per cell, plus 5 per cell in your biggest joined land. A team far behind gets an extra cell when it's right.",
    ],
  },
  // Stage 12.11 (docs/stage12/stage1211.md §2).
  "team-draw": {
    objective: "Draw it for your team, or guess your team's drawing.",
    steps: [
      "Every team draws the same word at once. One of you draws; only the drawer's phone shows the word. Your team takes turns drawing.",
      "Your teammates guess from your own team's drawing; the other teams never see it until the reveal. A wrong guess pauses your team's guessing for 2 seconds.",
      "Stuck? The drawer can pass the pen once before drawing. If the drawer stops drawing for 20 seconds, a teammate can take the pen. Once you've seen the word, you can't guess it.",
      "100, 75, 55 or 40 by the order teams get it, and a +25 catch-up for a team far behind. Everyone scores their team's points.",
    ],
  },
  // Stage 12.10 (docs/stage12/stage1210.md §2).
  "split-clues": {
    objective: "Put your team's clues together.",
    steps: [
      "Six puzzles. Every teammate's phone shows different clues to the same answer, so read yours out and put them together.",
      "Anyone on your team can type the answer. A wrong try pauses your team's answer box for 4 seconds.",
      "Help comes for every team: the answer's shape at 30 seconds, everyone's clues on every phone at 45, the first letter at 60.",
      "100, 75, 55 or 40 by the order teams solve it, and a +25 catch-up for a team far behind. Everyone scores their team's points.",
    ],
  },
  // Stage 12.9 (docs/stage12/stage129.md §1).
  "relay": {
    objective: "A team race: first team home wins.",
    steps: [
      "Your team runs 12 quick sums, one leg each in turn. Every team gets the same sums.",
      "Only the runner's phone can answer. Your team sees the sum too: shout help!",
      "A right answer passes the baton. A wrong one freezes you for 3 seconds. No answer in 20 seconds and the baton passes to the next teammate.",
      "10 points per leg, plus 30, 20 or 10 for the first three teams home. Everyone scores their team's points.",
    ],
  },
  // Stage 12.8 (docs/stage12/stage128.md §2).
  "team-huddle": {
    objective: "A quiz you answer as a team. Huddle up!",
    steps: [
      "Eight questions. You play with your team: the night's teams, or two the game makes. Your phone says which team you're on.",
      "Tap an answer. Your teammates see your pick and you see theirs; you can change it until time runs out. The other teams can't see what you picked.",
      "Your team's answer is what most of you picked. When every team agrees, the answer comes early.",
      "100 to your team for a right answer, and 25 more when the whole team picked it. Everyone scores their team's points.",
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
