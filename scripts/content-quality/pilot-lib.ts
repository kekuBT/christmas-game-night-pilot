/**
 * Content Quality 2.0: checks for the pilot draft (content/pilot/*.json).
 * The pilot is NOT loaded by the game. These checks prove each draft item
 * passes the live Sprint 4 schema and the editorial integrity rules that a
 * machine can check. They never claim a fact is true or that an item is
 * approved.
 */
import { readFileSync } from "node:fs";
import { roundProblems } from "./variety.js";
import { ITEM_SCHEMAS, type ContentGameId } from "../../src/content/schema.js";
import { evalFormula } from "../../src/content/lint.js";
import { NUMERIC_INPUT, withinNumericInput } from "../../src/shared/numericInput.js";

/** The numeric input bounds the game enforces (src/shared/numericInput.ts). */
export const UI_INPUT_BOUNDS = NUMERIC_INPUT;

export interface Rubric { entertainment: number; creativity: number; clarity: number; distractors: number; social: number }
export interface PilotEntry {
  game: ContentGameId;
  item: Record<string, unknown> & { id: string };
  editorial: {
    expectedCorrect: string; reveal: string; verification: string; whyInclude: string; rubric: Rubric;
    scoring?: string; replaces?: string[]; blockedBy?: string;
    proposedFields?: Record<string, unknown>;
    /** Connections: other groups on the same board a word could honestly belong to. */
    alsoFits?: Record<string, string[]>;
    /** Tone mix (owner direction 2026-11-07): classic, modern, nostalgia, weird. */
    tone?: Tone[];
    /** Playlists the item suits (Mixed Party Night plus themed playlists). */
    playlists?: string[];
    /** Quiz games: how the question works, for the round-variety rule. */
    mechanic?: string;
    /** The stem hinges on "never"/"not". */
    negativeStem?: boolean;
  };
}
export const TONES = ["classic", "modern", "nostalgia", "weird"] as const;
export type Tone = (typeof TONES)[number];
export const PLAYLISTS = ["Mixed Party Night", "Modern Culture", "Internet & Memes", "Gaming", "Music & Entertainment", "2000s Nostalgia", "Weird but True", "Brainy & Challenging", "World Knowledge"] as const;
export const MECHANICS = ["recall", "recognition", "deduction", "comparison", "myth-buster", "never-said", "misquote", "misattribution", "definition-twist", "origin-story", "weird-but-true"] as const;
const QUIZ_GAMES = new Set(["trivia", "geography", "who-said-that"]);
/**
 * Round-variety rule (E10 v2, proposal; not wired into selection). One
 * definition, shared with the selection simulation: see
 * scripts/content-quality/variety.ts roundProblems().
 */
export function roundVarietyProblems(round: PilotEntry[]): string[] {
  return roundProblems(round.map((e) => ({
    id: e.item.id as string,
    difficulty: e.item.difficulty as 1 | 2 | 3,
    category: String(e.item.category),
    tags: { ...(e.editorial.mechanic ? { mechanic: e.editorial.mechanic } : {}), ...(e.editorial.negativeStem ? { negative: true } : {}) },
  })));
}

export interface PilotFile { schemaVersion: 1; pilotId: string; status: string; entries: PilotEntry[] }
export interface Finding { id: string; level: "error" | "warn"; message: string }

/** Is a numeric answer enterable with today's client input? */
export function enterable(game: keyof typeof UI_INPUT_BOUNDS, answer: number): boolean {
  return withinNumericInput(game, answer);
}

/**
 * Count the ways a Connections board can be split into its four named groups,
 * given each word's home group plus any `alsoFits` groups. A fair board has
 * exactly one solution.
 */
export function connectionsSolutions(groups: { name: string; words: string[] }[], alsoFits: Record<string, string[]> = {}): string[][][] {
  const names = groups.map((g) => g.name);
  const words = groups.flatMap((g) => g.words);
  const fits = new Map<string, string[]>();
  for (const g of groups) for (const w of g.words) fits.set(w, [g.name, ...(alsoFits[w] ?? [])].filter((n, i, a) => names.includes(n) && a.indexOf(n) === i));
  const out: string[][][] = [];
  const assign = new Map<string, string[]>(names.map((n) => [n, []]));
  const rec = (i: number) => {
    if (i === words.length) { out.push(names.map((n) => [...assign.get(n)!])); return; }
    const w = words[i]!;
    for (const n of fits.get(w)!) {
      const bucket = assign.get(n)!;
      if (bucket.length >= 4) continue;
      bucket.push(w); rec(i + 1); bucket.pop();
    }
  };
  rec(0);
  return out;
}

export function checkPilot(file: PilotFile, libraryIds: Set<string>): Finding[] {
  const f: Finding[] = [];
  const err = (id: string, message: string) => f.push({ id, level: "error", message });
  const warn = (id: string, message: string) => f.push({ id, level: "warn", message });
  const seen = new Set<string>();
  for (const e of file.entries) {
    const id = e.item.id;
    if (seen.has(id)) err(id, "duplicate id in pilot");
    seen.add(id);
    if (libraryIds.has(id)) err(id, "id collides with an item already in content/packs");
    const parsed = ITEM_SCHEMAS[e.game].safeParse(e.item);
    if (!parsed.success) { err(id, `fails the live ${e.game} schema: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`); continue; }
    const it = parsed.data as Record<string, unknown>;
    const review = it["review"] as { status: string };
    if (review.status !== "provisional") err(id, `pilot items must stay 'provisional' until a human reviews them (found '${review.status}')`);
    const ed = e.editorial;
    for (const k of ["expectedCorrect", "reveal", "verification", "whyInclude"] as const) if (!ed?.[k]?.trim()) err(id, `editorial.${k} is missing`);
    // Rubric: every dimension 1-5; acceptance needs total >= 18 and no dimension below 3; clarity is a gate.
    const r = ed.rubric;
    const vals = r ? [r.entertainment, r.creativity, r.clarity, r.distractors, r.social] : [];
    if (vals.length !== 5 || vals.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) err(id, "rubric needs five integer scores 1-5");
    else {
      const total = vals.reduce((a, b) => a + b, 0);
      if (total < 18) err(id, `rubric total ${total} < 18: below the acceptance bar`);
      if (vals.some((v) => v < 3)) err(id, "a rubric dimension is below 3: below the acceptance bar");
      if (r.clarity < 4) warn(id, "clarity below 4: needs an editor's wording decision before review");
    }
    // Tone, playlists and (for quiz games) mechanic tags.
    if (!ed.tone?.length || ed.tone.some((t) => !(TONES as readonly string[]).includes(t))) err(id, `editorial.tone must list one or more of ${TONES.join(", ")}`);
    if (!ed.playlists?.length || ed.playlists.some((p) => !(PLAYLISTS as readonly string[]).includes(p))) err(id, "editorial.playlists must name known playlists");
    if (QUIZ_GAMES.has(e.game) && !(MECHANICS as readonly string[]).includes(ed.mechanic ?? "")) err(id, `quiz items need editorial.mechanic (one of ${MECHANICS.join(", ")})`);
    // Multiple choice: the answer must not stand out as the uniquely longest option too often (checked across the set below).
    // Numeric input integrity.
    if (e.game === "guess-the-year" || e.game === "closest-wins") {
      const answer = Number(e.game === "guess-the-year" ? it["year"] : it["answer"]);
      const ok = enterable(e.game, answer);
      if (!ok && !ed.blockedBy) err(id, `answer ${answer} cannot be entered with today's input bounds; mark editorial.blockedBy`);
      if (ok && ed.blockedBy) warn(id, "blockedBy is set but the answer is enterable");
    }
    if (typeof it["formula"] === "string" && Math.abs(evalFormula(it["formula"] as string) - Number(it["answer"])) > 1e-9) err(id, "formula does not match the answer");
    // Connections: exactly one solution given the declared overlaps.
    if (e.game === "word-connections") {
      const groups = it["groups"] as { name: string; words: string[] }[];
      for (const [w, gs] of Object.entries(ed.alsoFits ?? {})) {
        if (!groups.some((g) => g.words.includes(w))) err(id, `alsoFits names '${w}', which is not on the board`);
        for (const g of gs) if (!groups.some((x) => x.name === g)) err(id, `alsoFits group '${g}' is not on the board`);
      }
      const n = connectionsSolutions(groups, ed.alsoFits).length;
      if (n !== 1) err(id, `board has ${n} solutions given the declared overlaps (must be exactly 1)`);
      if (!it["redHerrings"]) err(id, "Connections boards must describe their misdirection");
    }
    // Category Sprint: aliases must point at a canonical answer and must not themselves be canonical.
    if (e.game === "category-sprint") {
      const answers = new Set(it["answers"] as string[]);
      const rawAliases = (ed.proposedFields?.["aliases"] ?? {}) as Record<string, string | { to: string; reason: string }>;
      const aliases: Record<string, string> = {};
      for (const [a, v] of Object.entries(rawAliases)) {
        if (typeof v === "string") { warn(id, `alias '${a}' has no reason: E2 v3 aliases are category-scoped and must say why`); aliases[a] = v; }
        else { if (!v.reason?.trim()) err(id, `alias '${a}' needs a reason`); aliases[a] = v.to; }
      }
      const pf = ed.proposedFields ?? {};
      if (pf["closedSet"] === true && typeof pf["setSize"] === "number" && pf["setSize"] !== answers.size) err(id, `setSize ${String(pf["setSize"])} differs from the ${answers.size} listed answers`);
      if (it["eligibility"] === "official" && pf["closedSet"] !== true) err(id, "official Category Sprint items must be closed sets (E2 v3)");
      if (it["eligibility"] === "official" && answers.size < 16) err(id, `official closed sets need at least 16 members even for 4 players (E2 v3 size rule); found ${answers.size}`);
      for (const [a, c] of Object.entries(aliases)) {
        if (!answers.has(c)) err(id, `alias '${a}' points at '${c}', which is not an accepted answer`);
        if (answers.has(a)) err(id, `alias '${a}' is also a canonical answer: it would score twice`);
      }
      const known = (ed.proposedFields?.["knownNotAccepted"] ?? {}) as Record<string, string>;
      for (const k of Object.keys(known)) if (answers.has(k)) err(id, `'${k}' is both accepted and listed as not accepted`);
    }
  }
  // Set-level: answer-position/length tells.
  const mc = file.entries.filter((e) => Array.isArray(e.item["options"] ?? e.item["speakers"]));
  const longest = mc.filter((e) => {
    const opts = (e.item["options"] ?? e.item["speakers"]) as string[];
    const L = opts.map((o) => o.length); const a = String(e.item["answer"]).length;
    return a === Math.max(...L) && L.filter((x) => x === a).length === 1;
  }).length;
  if (mc.length >= 8 && longest / mc.length > 0.35) warn("(set)", `the answer is the uniquely longest option in ${longest} of ${mc.length} multiple-choice items: a length tell`);
  return f;
}

export function readPilot(path: string): PilotFile { return JSON.parse(readFileSync(path, "utf8")) as PilotFile; }
