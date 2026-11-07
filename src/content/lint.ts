/**
 * Content checks (Sprint 4). Errors make content unusable and fail the
 * build; warnings go on the editor's review sheet. The lint never claims a
 * fact is TRUE: it catches structural mistakes and flags what a human must
 * judge (ambiguity, wording, staleness, near-duplicates).
 */
import type { ContentLibrary, LoadedItem } from "./registry.js";
import { officialEligible } from "./registry.js";
import { PLAIN_QUIZ_MECHANICS, QUOTE_TWIST_MECHANICS, type ContentGameId, type ItemOf, type QuizMechanic } from "./schema.js";
import { officialSprintSuitable } from "./closedSet.js";
import { isNumericGame, NUMERIC_INPUT, withinNumericInput } from "../shared/numericInput.js";

export interface LintIssue { level: "error" | "warn"; gameId: ContentGameId; itemId: string; code: string; message: string }

// Letters, digits and pictographs (flag emoji distinguish otherwise identical prompts).
const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator} ]/gu, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "a", "an", "of", "in", "on", "is", "was", "which", "what", "who", "how", "many", "to", "and", "for", "this", "that", "does", "did", "are", "by", "with", "at", "from"]);
const tokens = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** The text that identifies an item's question, for duplicate detection. */
function promptOf(li: LoadedItem): string {
  const it = li.item as Record<string, unknown>;
  if (li.gameId === "word-connections") return (it["groups"] as { words: string[] }[]).flatMap((g) => g.words).sort().join(" ");
  return String(it["prompt"] ?? it["quote"] ?? it["event"] ?? it["name"] ?? it["word"] ?? "");
}

const TIME_WORDS = /\b(current(ly)?|now|today|as of|latest|record|tallest|largest|biggest|most populous|population|president|prime minister|champion|holds the)\b/i;

/** Evaluate a closest-wins formula (digits and + - * / ( ) only; validated by the schema). */
export function evalFormula(f: string): number {
  if (!/^[0-9+\-*/(). ]+$/.test(f)) throw new Error("bad formula");
  return Function(`"use strict"; return (${f});`)() as number;
}

const QUIZ_GAMES = new Set<ContentGameId>(["trivia", "geography", "who-said-that"]);
/**
 * E10 content mix (owner-approved 2026-11-07). If one twist format is more
 * than this share of a game's official pool, no selector can keep every round
 * to two of it, so the editor hears about it here, at authoring time.
 */
export const CONTENT_MIX = { maxTwistShare: 0.2, maxQuoteTwistShare: 0.1, maxNegativeShare: 0.1, minPool: 10 } as const;

/** Mix warnings for one game's items. The pool is every official-eligibility item that is not rejected (what official play would draw on once approved). */
export function contentMixWarnings(items: LoadedItem[]): string[] {
  const pool = items.filter((li) => li.item.eligibility === "official" && li.status !== "rejected");
  if (pool.length < CONTENT_MIX.minPool) return [];
  const mech = (li: LoadedItem) => (li.item as { mechanic?: QuizMechanic }).mechanic;
  const counts = new Map<QuizMechanic, number>();
  for (const li of pool) { const m = mech(li); if (m && !PLAIN_QUIZ_MECHANICS.includes(m)) counts.set(m, (counts.get(m) ?? 0) + 1); }
  const pct = (n: number) => `${Math.round((n / pool.length) * 100)}%`;
  const out: string[] = [];
  for (const [m, n] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if (n / pool.length > CONTENT_MIX.maxTwistShare) out.push(`'${m}' is ${n} of ${pool.length} official-pool items (${pct(n)}; max ${CONTENT_MIX.maxTwistShare * 100}%): rounds will repeat this format`);
  }
  const quote = pool.filter((li) => QUOTE_TWIST_MECHANICS.includes(mech(li)!)).length;
  if (quote / pool.length > CONTENT_MIX.maxQuoteTwistShare) out.push(`quote twists are ${quote} of ${pool.length} official-pool items (${pct(quote)}; max ${CONTENT_MIX.maxQuoteTwistShare * 100}%)`);
  const neg = pool.filter((li) => (li.item as { negativeStem?: boolean }).negativeStem).length;
  if (neg / pool.length > CONTENT_MIX.maxNegativeShare) out.push(`negative stems are ${neg} of ${pool.length} official-pool items (${pct(neg)}; max ${CONTENT_MIX.maxNegativeShare * 100}%)`);
  return out;
}

export function lintLibrary(lib: ContentLibrary, today: string): LintIssue[] {
  const out: LintIssue[] = [];
  const add = (li: LoadedItem, level: LintIssue["level"], code: string, message: string) => out.push({ level, gameId: li.gameId, itemId: li.item.id, code, message });
  for (const [gameId, items] of lib.byGame) {
    for (const li of items) {
      const it = li.item as Record<string, unknown>;
      if (li.item.review.status === "approved") add(li, "error", "approved-in-file", "status 'approved' can only come from content/approvals.json (a human sign-off), not from the pack file");
      if (li.status === "rejected") continue; // never used: no editorial warnings needed
      // Multiple-choice integrity.
      const opts = (it["options"] ?? it["speakers"]) as string[] | undefined;
      if (opts) {
        const answer = String(it["answer"]);
        const hits = opts.filter((o) => o === answer).length;
        if (hits !== 1) add(li, "error", "answer-not-an-option", `answer "${answer}" must match exactly one option`);
        if (new Set(opts.map(norm)).size !== opts.length) add(li, "error", "duplicate-options", "two options are the same");
        if (opts.some((o) => /\b(all|none) of the above\b/i.test(o))) add(li, "warn", "above-option", "'all/none of the above' options are hard to shuffle fairly");
      }
      if (gameId === "trivia" && !String(it["prompt"]).trim().endsWith("?")) add(li, "warn", "format", "trivia prompts should be questions ending in '?'");
      const p = promptOf(li);
      if (/\b(not|never|except)\b/i.test(p) && gameId !== "word-connections") add(li, "warn", "negative-wording", "negative wording (NOT/never/except): check it reads clearly under time pressure");
      if (p.length > 140) add(li, "warn", "long-prompt", `prompt is ${p.length} characters: hard to read on a phone in time`);
      // Facts that can change.
      if (li.item.timeSensitive && li.item.timeSensitive.reviewBy < today) add(li, "warn", "stale", `time-sensitive fact past its review date (${li.item.timeSensitive.reviewBy}): no longer used officially`);
      if (!li.item.timeSensitive && TIME_WORDS.test(`${p} ${String(it["explanation"] ?? "")}`) && li.item.eligibility === "official") add(li, "warn", "maybe-time-sensitive", "wording suggests a fact that can change; add timeSensitive or rephrase");
      if (li.item.ambiguity && li.item.eligibility === "official" && li.status !== "approved") add(li, "warn", "ambiguity", `known ambiguity needs an editor's decision: ${li.item.ambiguity}`);
      if (li.status === "verified-computed") {
        if (gameId !== "closest-wins" || typeof it["formula"] !== "string") add(li, "error", "unverifiable", "verified-computed needs a formula the test can re-evaluate");
        else {
          const v = evalFormula(String(it["formula"]));
          if (Math.abs(v - Number(it["answer"])) > 1e-9) add(li, "error", "formula-mismatch", `formula gives ${v}, answer says ${it["answer"]}`);
        }
      }
      // E1: a numeric answer the game's input can't accept is never selected.
      if (isNumericGame(gameId)) {
        const v = Number(gameId === "guess-the-year" ? it["year"] : it["answer"]);
        const spec = NUMERIC_INPUT[gameId];
        if (!withinNumericInput(gameId, v)) add(li, "error", "unenterable-answer", `answer ${v} can't be entered (input: ${spec.min}–${spec.max}, ${spec.decimals} decimal places); the item is never selected`);
      }
      // Game-specific structure.
      if (gameId === "word-connections") {
        const groups = it["groups"] as { name: string; words: string[]; level: number }[];
        const words = groups.flatMap((g) => g.words.map(norm));
        if (new Set(words).size !== 16) add(li, "error", "duplicate-words", "the 16 words must all be different");
        if (new Set(groups.map((g) => g.level)).size !== 4) add(li, "error", "levels", "each difficulty level 1-4 must appear exactly once");
        if (new Set(groups.map((g) => norm(g.name))).size !== 4) add(li, "error", "group-names", "group names must differ");
        if (words.some((w) => w.length > 14)) add(li, "warn", "long-word", "a word longer than 14 letters may not fit a phone tile");
        if (li.item.eligibility === "official" && !(it["redHerrings"] as string | undefined)) add(li, "warn", "no-red-herring-note", "describe the intended misdirection so an editor can check no word honestly fits two groups");
      }
      if (gameId === "category-sprint") {
        const sp = li.item as ItemOf<"category-sprint">;
        const answers = sp.answers;
        if (new Set(answers).size !== answers.length) add(li, "error", "duplicate-answers", "accepted answers repeat");
        if (!sp.closedSet && answers.length < 25) add(li, "warn", "thin-answers", `only ${answers.length} accepted answers: players will give valid answers that are not listed`);
        // E2 v3 (owner-approved): official competition uses closed sets only.
        if (!sp.closedSet && sp.eligibility === "official") add(li, "error", "open-set-official", "open categories are practice-only under E2 v3: mark it practice, or make it a closed set with a membership reference");
        if (sp.closedSet && sp.eligibility === "official") {
          const rooms = [4, 5, 6, 7, 8, 9, 10].filter((p) => officialSprintSuitable(sp, p).ok);
          if (rooms.length === 0) add(li, "warn", "never-suitable", `no room size from 4 to 10 players passes the size policy (${answers.length} members, ${sp.recallProfile}): it will never be chosen officially`);
          else if (rooms.length < 7) add(li, "warn", "room-limited", `official only for ${rooms[0]}-${rooms[rooms.length - 1]} players under the size policy`);
        }
        if (sp.closedSet) {
          const ref = lib.sprintReferences.get(sp.membership!.reference);
          if (ref && !ref.sourceCheck) add(li, "warn", "membership-unchecked", `membership list "${ref.id}" has no human source check against ${ref.source.url} (machine comparison: docs/content-quality-2/SPRINT_SOURCE_CHECK.md); approval is refused until a person records that check`);
        }
      }
      if (gameId === "impostor" && norm(String(it["word"])) === norm(String(it["hintCategory"]))) add(li, "error", "word-is-category", "the secret word must differ from its category hint");
      if (gameId === "geography" && it["mode"] === "flag" && !li.item.accessibility) add(li, "warn", "accessibility", "flag questions rely on colour/emoji: describe a text alternative");
    }
    // Near-duplicates within a game.
    const toks = items.filter((li) => li.status !== "rejected").map((li) => ({ li, t: tokens(promptOf(li)), answer: norm(String((li.item as Record<string, unknown>)["answer"] ?? "")) }));
    for (let i = 0; i < toks.length; i++) {
      for (let j = i + 1; j < toks.length; j++) {
        const a = toks[i]!, b = toks[j]!;
        const sim = jaccard(a.t, b.t);
        const sameAnswer = a.answer !== "" && a.answer === b.answer;
        if (sim >= 0.8 || (sim >= 0.5 && sameAnswer)) add(b.li, "warn", "near-duplicate", `similar to ${a.li.item.id} (${Math.round(sim * 100)}% word overlap${sameAnswer ? ", same answer" : ""})`);
      }
    }
    // E10 (owner-approved metadata and warnings; selection unchanged): question formats.
    if (QUIZ_GAMES.has(gameId)) {
      for (const li of items) if (li.status !== "rejected" && !(li.item as { mechanic?: string }).mechanic) add(li, "warn", "format-untagged", "quiz item has no question format (mechanic): the content-mix check cannot count it");
      for (const w of contentMixWarnings(items)) out.push({ level: "warn", gameId, itemId: "(pool)", code: "content-mix", message: w });
    }
    // Difficulty balance among items usable officially.
    const off = items.filter((li) => officialEligible(li, today));
    if (off.length >= 10) {
      const hard = off.filter((li) => li.item.difficulty === 3).length / off.length;
      const easy = off.filter((li) => li.item.difficulty === 1).length / off.length;
      if (hard > 0.4) out.push({ level: "warn", gameId, itemId: "(pack)", code: "difficulty-skew", message: `${Math.round(hard * 100)}% of official items are hard` });
      if (easy < 0.15) out.push({ level: "warn", gameId, itemId: "(pack)", code: "difficulty-skew", message: `only ${Math.round(easy * 100)}% of official items are easy` });
    }
  }
  return out;
}

export interface InventoryRow { gameId: ContentGameId; total: number; approved: number; computed: number; legacy: number; provisional: number; rejected: number; official: number; practiceOnly: number; stale: number; errors: number; warnings: number }

export function inventory(lib: ContentLibrary, issues: LintIssue[], today: string): InventoryRow[] {
  return [...lib.byGame.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([gameId, items]) => ({
    gameId,
    total: items.length,
    approved: items.filter((i) => i.status === "approved").length,
    computed: items.filter((i) => i.status === "verified-computed").length,
    legacy: items.filter((i) => i.status === "legacy").length,
    provisional: items.filter((i) => i.status === "provisional").length,
    rejected: items.filter((i) => i.status === "rejected").length,
    official: items.filter((i) => officialEligible(i, today)).length,
    practiceOnly: items.filter((i) => !officialEligible(i, today) && i.status !== "rejected").length,
    stale: items.filter((i) => i.item.timeSensitive && i.item.timeSensitive.reviewBy < today).length,
    errors: issues.filter((x) => x.gameId === gameId && x.level === "error").length,
    warnings: issues.filter((x) => x.gameId === gameId && x.level === "warn").length,
  }));
}
