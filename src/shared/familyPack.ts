// Stage 12.5 (docs/stage12/stage125.md §1): a room's Family Questions, the questions its players write about the
// family. Pure: the limits and the check are shared by the server (which decides) and the phones (which say why
// before sending).

export const FAMILY_LIMITS = {
  prompt: 140,
  option: 60,
  minOptions: 2,
  maxOptions: 4,
  perAuthor: 15,
  perRoom: 60,
} as const;

export type FamilyKind = "choice" | "who";

/** What a player sends to add a question. */
export interface FamilyQuestionInput {
  kind: FamilyKind;
  prompt: string;
  /** "choice": 2–4 options and the right one. */
  options?: string[];
  correctIndex?: number;
  /** "who": the player who is the answer (the options are everyone in the game, by name). */
  answerPlayerId?: string;
}

/** A question as the room keeps it. */
export interface FamilyQuestion {
  id: string;
  authorId: string;
  kind: FamilyKind;
  prompt: string;
  options?: string[];
  correctIndex?: number;
  answerPlayerId?: string;
  createdAt: number;
  /** The game that played it (a cancelled briefing leaves no game, so the question is ready again). */
  playedIn?: string;
}

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/**
 * Check and tidy a new question. Returns the question's fields, or why it can't be added. `players` are the room's
 * player ids (a "who" answer must be one of them).
 */
export function checkFamilyQuestion(input: FamilyQuestionInput, players: readonly string[]):
  | { ok: true; question: Pick<FamilyQuestion, "kind" | "prompt" | "options" | "correctIndex" | "answerPlayerId"> }
  | { ok: false; error: string } {
  const prompt = clean(input.prompt);
  if (!prompt) return { ok: false, error: "Write the question first." };
  if (prompt.length > FAMILY_LIMITS.prompt) return { ok: false, error: `Keep the question to ${FAMILY_LIMITS.prompt} characters.` };
  if (input.kind === "who") {
    if (!input.answerPlayerId || !players.includes(input.answerPlayerId)) return { ok: false, error: "Pick who the answer is." };
    return { ok: true, question: { kind: "who", prompt, answerPlayerId: input.answerPlayerId } };
  }
  if (input.kind !== "choice") return { ok: false, error: "A question is multiple choice or 'Who in the family?'." };
  const options = (input.options ?? []).map(clean);
  if (options.some((o) => o.length === 0)) return { ok: false, error: "Fill in every answer, or remove the empty one." };
  if (options.length < FAMILY_LIMITS.minOptions || options.length > FAMILY_LIMITS.maxOptions) return { ok: false, error: `Give ${FAMILY_LIMITS.minOptions} to ${FAMILY_LIMITS.maxOptions} answers to choose from.` };
  if (options.some((o) => o.length > FAMILY_LIMITS.option)) return { ok: false, error: `Keep each answer to ${FAMILY_LIMITS.option} characters.` };
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { ok: false, error: "Each answer must be different." };
  const ci = input.correctIndex;
  if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci >= options.length) return { ok: false, error: "Mark the right answer." };
  return { ok: true, question: { kind: "choice", prompt, options, correctIndex: ci } };
}
