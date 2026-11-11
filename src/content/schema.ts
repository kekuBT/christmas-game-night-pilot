/**
 * Game content packs (Sprint 4). Server-only: answers live here, so the web
 * bundle must never import this module (tests/content.test.ts checks it).
 *
 * A pack is a versioned JSON file in content/packs/. Every item is validated
 * against its game's schema before any engine sees it. Engines consume
 * validated items only; they hold no question banks of their own.
 *
 * Review status decides where an item may be used:
 *   approved           a human editor approved this exact item (content/approvals.json,
 *                      bound to the item's content hash, so an edit voids the approval)
 *   verified-computed  the answer is computed from data in the item and re-checked by a test
 *   legacy             in official play before Sprint 4; grandfathered, flagged for review
 *   provisional        authored, self-checked, NOT human-reviewed: practice only
 *   rejected           never used
 * Official games use only approved, verified-computed and legacy items that
 * are also marked eligibility "official" and not past their review date.
 */
import { z } from "zod";
import { ITEM_SEASONS } from "../shared/season.js";

export const REVIEW_STATUSES = ["approved", "verified-computed", "legacy", "provisional", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const OFFICIAL_STATUSES: readonly ReviewStatus[] = ["approved", "verified-computed", "legacy"];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max);

const ReviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  /** What the author/editor checked, or why it is held back. */
  notes: z.string().max(500).optional(),
}).strict();

const SourceSchema = z.object({
  kind: z.enum(["common-knowledge", "reference", "computed", "original-fiction", "original-creative"]),
  /** Where the fact can be checked (a reference work, a definition, a formula). */
  ref: z.string().max(300).optional(),
}).strict();

const BaseItem = {
  /** Stable forever: usage history and approvals refer to it. */
  id: z.string().regex(/^[a-z]{2,6}-[a-z0-9]+(-[a-z0-9]+)*$/).max(64),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  category: text(40),
  topic: text(60).optional(),
  language: z.literal("en"),
  eligibility: z.enum(["official", "practice"]),
  review: ReviewSchema,
  source: SourceSchema,
  /** Facts that can change (records, office holders, prices): re-check by this date or the item stops being official. */
  timeSensitive: z.object({ asOf: isoDate, reviewBy: isoDate }).strict().optional(),
  /** Known ambiguity an editor should judge (e.g. "some say 7 continents, some 6"). */
  ambiguity: z.string().max(300).optional(),
  accessibility: z.string().max(200).optional(),
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(12).default([]),
  /**
   * Stage 8.2: a seasonal item ("christmas") is dealt in solo and casual
   * sessions only when that session's content is the same season; no tag =
   * year-round. A closed list, so a typo fails loading. Selection reads only
   * this tag (never an item's words), and it is left out of the content hash
   * (registry.ts itemHash): it says where an item may be dealt, not what
   * players see, so tagging never voids an approval. Cups ignore it.
   */
  season: z.enum(ITEM_SEASONS).optional(),
  estSeconds: z.number().int().min(3).max(600).optional(),
};

const fourOptions = z.array(text(80)).length(4);

/**
 * E10 question-format metadata (owner-approved 2026-11-07) for quiz games.
 * Plain formats: recall, recognition, deduction, comparison. Twist formats feel
 * samey when repeated; quote twists (never-said, misquote, misattribution) most
 * of all. Editorial metadata only: selection does not read it (E10's variety
 * step is not activated).
 */
export const QUIZ_MECHANICS = ["recall", "recognition", "deduction", "comparison", "myth-buster", "never-said", "misquote", "misattribution", "definition-twist", "origin-story", "weird-but-true"] as const;
export type QuizMechanic = (typeof QUIZ_MECHANICS)[number];
export const PLAIN_QUIZ_MECHANICS: readonly QuizMechanic[] = ["recall", "recognition", "deduction", "comparison"];
export const QUOTE_TWIST_MECHANICS: readonly QuizMechanic[] = ["never-said", "misquote", "misattribution"];
const QuizFormat = {
  mechanic: z.enum(QUIZ_MECHANICS).optional(),
  /** The question hinges on NOT / never (E10 allows one per round). */
  negativeStem: z.literal(true).optional(),
};
export const TriviaItem = z.object({ ...BaseItem, ...QuizFormat, prompt: text(160), options: fourOptions, answer: text(80), explanation: text(240) }).strict();
export const WhoSaidItem = z.object({ ...BaseItem, ...QuizFormat, quote: text(160), speakers: fourOptions, answer: text(80), explanation: text(240).optional() }).strict();
export const GeographyItem = z.object({
  ...BaseItem,
  ...QuizFormat,
  mode: z.enum(["flag", "outline", "capital", "region", "higher-lower", "distance", "landmark"]),
  prompt: text(160), options: fourOptions, answer: text(80), explanation: text(240),
}).strict();
export const YearItem = z.object({ ...BaseItem, event: text(120), year: z.number().int().min(1000).max(2100), context: text(240) }).strict();
export const ClosestItem = z.object({
  ...BaseItem,
  prompt: text(160),
  unit: text(24),
  answer: z.number().finite().positive(),
  /** For verified-computed items: the arithmetic the test re-evaluates (digits, + - * / ( ) and spaces). */
  formula: z.string().regex(/^[0-9+\-*/(). ]+$/).max(80).optional(),
  explanation: text(240),
}).strict();
export const CaptionItem = z.object({ ...BaseItem, prompt: text(120) }).strict();
const sprintKey = z.string().regex(/^[a-z][a-z ]*[a-z]$|^[a-z]$/).max(60);
export const RECALL_PROFILES = ["even", "famous-first", "obscure-tail", "dominant"] as const;
export type RecallProfile = (typeof RECALL_PROFILES)[number];
export const SprintItem = z.object({
  ...BaseItem,
  name: text(40),
  /** Accepted answers, normalised (lowercase letters and spaces). For a closed set: the canonical members. */
  answers: z.array(z.string().regex(/^[a-z][a-z ]*[a-z]$/)).min(10).max(400),
  /**
   * E2 v3 closed set: membership is decided by a named authority. The item's
   * answers must equal the canonical members of `membership.reference`
   * (content/reference/sprint/<reference>.json), checked when content loads.
   */
  closedSet: z.literal(true).optional(),
  definition: text(100).optional(),
  recallProfile: z.enum(RECALL_PROFILES).optional(),
  /** Author's estimate of how many members a typical player can name (obscure-tail sets need >= 10; an editor confirms it at review). */
  typicalRecall: z.number().int().min(0).max(400).optional(),
  membership: z.object({ reference: z.string().regex(/^[a-z0-9-]+$/).max(48) }).strict().optional(),
  /** Category-scoped: variant -> canonical answer, each with a reason. Never global. */
  aliases: z.record(sprintKey, z.object({ to: sprintKey, reason: text(200) }).strict()).optional(),
  /** Answers that are NOT accepted, with the reason shown in results. */
  knownNotAccepted: z.record(sprintKey, text(200)).optional(),
  typoTolerance: z.boolean().optional(),
  /**
   * How this category scored under answer rules 1, i.e. in every Cup created
   * before the owner's Congo ruling (2026-11-07; Cup field
   * `categorySprint.answerRules`). A frozen copy used only for those Cups, so
   * a Cup already under way is never re-ruled. Never edit it.
   */
  answerRules1: z.object({
    answers: z.array(z.string().regex(/^[a-z][a-z ]*[a-z]$/)).min(10).max(400),
    aliases: z.record(sprintKey, z.object({ to: sprintKey, reason: text(200) }).strict()).optional(),
    knownNotAccepted: z.record(sprintKey, text(200)).optional(),
  }).strict().optional(),
}).strict();

/** A closed set's membership as published by its authority (content/reference/sprint/*.json). */
export const SprintReferenceSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/).max(48),
  title: text(100),
  /** The authority and the page that publishes the list. */
  source: z.object({ authority: text(120), url: z.string().url().max(300), publishedCount: z.number().int().positive() }).strict(),
  /** Members exactly as the source names them (display form). */
  members: z.array(text(80)).min(1).max(400),
  /** How the list was produced. "transcribed" means typed in, not yet compared with the source page. */
  provenance: text(300),
  /**
   * Comparison of `members` with the source page by a named person. Required
   * before any item using this list can be approved for official play.
   */
  sourceCheck: z.object({ by: text(60), date: isoDate, url: z.string().url().max(300), note: z.string().max(300).optional() }).strict().optional(),
  timeSensitive: z.object({ asOf: isoDate, reviewBy: isoDate }).strict().optional(),
}).strict();
export type SprintReference = z.infer<typeof SprintReferenceSchema>;
export const ConnectionsItem = z.object({
  ...BaseItem,
  groups: z.array(z.object({
    name: text(60),
    words: z.array(text(24)).length(4),
    /** 1 = most obvious, 4 = trickiest. */
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }).strict()).length(4),
  /** Words that look like they belong to another group (the intended misdirection). */
  redHerrings: z.string().max(300).optional(),
}).strict();
export const ImpostorItem = z.object({ ...BaseItem, word: text(30), hintCategory: text(30) }).strict();
export const CharadesItem = z.object({ ...BaseItem, prompt: text(60) }).strict();

export const ITEM_SCHEMAS = {
  "trivia": TriviaItem,
  "who-said-that": WhoSaidItem,
  "geography": GeographyItem,
  "guess-the-year": YearItem,
  "closest-wins": ClosestItem,
  "caption-clash": CaptionItem,
  "category-sprint": SprintItem,
  "word-connections": ConnectionsItem,
  "impostor": ImpostorItem,
  "charades": CharadesItem,
} as const;
export type ContentGameId = keyof typeof ITEM_SCHEMAS;
export const CONTENT_GAMES = Object.keys(ITEM_SCHEMAS) as ContentGameId[];

export type ItemOf<G extends ContentGameId> = z.infer<(typeof ITEM_SCHEMAS)[G]>;
export type AnyItem = ItemOf<ContentGameId>;

export const PackHeaderSchema = z.object({
  schemaVersion: z.literal(1),
  packId: z.string().regex(/^[a-z0-9-]+$/).max(48),
  gameId: z.enum(CONTENT_GAMES as [ContentGameId, ...ContentGameId[]]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: text(80),
  language: z.literal("en"),
  items: z.array(z.unknown()),
}).strict();

export const ApprovalsSchema = z.object({
  schemaVersion: z.literal(1),
  approvals: z.array(z.object({
    itemId: z.string(),
    /** Content hash of the item as approved (src/content/registry.ts itemHash). */
    hash: z.string().regex(/^[0-9a-f]{16}$/),
    reviewer: text(60),
    date: isoDate,
    note: z.string().max(300).optional(),
  }).strict()),
}).strict();
