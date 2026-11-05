// Post-completion staged reveal sequence (Milestone D, decision L42).
// Pure: no React, no server, no scoring. Steps carry only kind + index —
// never answer data — so building a step list cannot leak a correct
// answer, and steps exist only for finished games. Live per-question
// reveals are deliberately NOT modelled here: a disconnected player may
// reconnect while answers are still accepted, so any in-play key display
// would create a relay channel (see docs/TRIVIA_REVEAL_GAP.md).
export type RevealStep =
  | { kind: "question"; index: number }
  | { kind: "reveal"; index: number }
  | { kind: "standings" };

/** Ordered walk for a finished game: question, reveal, question, reveal…
    per question, then a standings finale. Unfinished games get no steps
    at all — the reveal UI must not render for them. */
export function revealSteps(questionCount: number, finished: boolean): RevealStep[] {
  if (!finished) return [];
  const steps: RevealStep[] = [];
  const n = Math.max(0, Math.floor(questionCount));
  for (let i = 0; i < n; i++) {
    steps.push({ kind: "question", index: i });
    steps.push({ kind: "reveal", index: i });
  }
  steps.push({ kind: "standings" });
  return steps;
}

/** Clamp a step position into range; empty lists stay at 0. */
export function clampStep(steps: RevealStep[], i: number): number {
  if (steps.length === 0) return 0;
  if (i < 0) return 0;
  if (i >= steps.length) return steps.length - 1;
  return i;
}

/** Human label for a step, for headings and aria text. */
export function stepLabel(step: RevealStep, questionCount: number): string {
  switch (step.kind) {
    case "question":
      return `Question ${step.index + 1} of ${questionCount}`;
    case "reveal":
      return `Reveal ${step.index + 1} of ${questionCount}`;
    case "standings":
      return "Standings";
  }
}
