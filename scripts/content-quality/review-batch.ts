/**
 * npm run content:review-batch -- review-batch-01
 * Writes a BLIND editorial review sheet for a batch of pilot items:
 *   docs/content-quality-2/<batch>/REVIEW_SHEET.md   (what the reviewer reads)
 *   docs/content-quality-2/<batch>/SCORES.csv        (what the reviewer fills in)
 *   docs/content-quality-2/<batch>/author-key.json   (author's scores + why each item was picked; open AFTER review)
 * The sheet carries no author rubric scores, no "why include", and no
 * strong/average/questionable label, so the review is independent.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONTENT_DIR } from "../../src/content/registry.js";
import { readPilot } from "./pilot-lib.js";

const batchId = process.argv[2] ?? "review-batch-01";
const root = join(import.meta.dirname, "..", "..");
const batch = JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "pilot", `${batchId}.json`), "utf8")) as { items: string[]; authorSelection: Record<string, string[]> };
const pilot = readPilot(join(DEFAULT_CONTENT_DIR, "pilot", "pilot-cq2.json"));
const byId = new Map(pilot.entries.map((e) => [e.item.id, e]));
const out = join(root, "docs", "content-quality-2", batchId);
mkdirSync(out, { recursive: true });
const DIFF = ["", "Easy", "Medium", "Hard"];
const GAME: Record<string, string> = { "trivia": "Trivia", "geography": "Geography", "closest-wins": "Closest Wins", "guess-the-year": "Guess the Year", "who-said-that": "Who Said That?", "word-connections": "Word Connections", "caption-clash": "Caption Clash", "category-sprint": "Category Sprint", "impostor": "Impostor (practice)", "charades": "Charades (practice)" };

const md: string[] = [
  `# Editorial review — ${batchId} (20 pilot items, blind)`, "",
  "**Reviewer:** __________________  **Date:** __________", "",
  "## How to review", "",
  "1. Read each item as a player would, then as an editor.",
  "2. **Gates (pass/fail):**",
  "   - G1 the answer is correct (do the listed fact check, and note what you looked at);",
  "   - G2 exactly one defensible answer;",
  "   - G3 clear on a phone in under 8 seconds;",
  "   - G4 objectively scorable;",
  "   - G5 enterable;",
  "   - G6 dated if the fact can change;",
  "   - G7 safe for the table.",
  "3. **Rubric (1–5 each):**",
  "   - R1 entertainment and memorability;",
  "   - R2 creativity and originality;",
  "   - R3 clarity, accuracy and fairness;",
  "   - R4 difficulty and distractors;",
  "   - R5 social and accessibility.",
  "   - The bar is a total of at least 18, no score below 3, and every gate passed.",
  "4. **Decision:** KEEP / REVISE (say what) / REJECT. Then give your own difficulty estimate.",
  "5. Fill in `SCORES.csv`, one row per item.",
  "",
  "**Independence:**",
  "- The author's scores and reasons are in `author-key.json`, `content/pilot/" + batchId + ".json`, `content/pilot/pilot-cq2.json` and `PILOT_ITEMS.md`. Please don't open those until your scores are in.",
  "- This batch mixes items the author rates highly with items the author has doubts about; which is which isn't shown.",
  "- Automated checks (schema, solver, rubric arithmetic) have passed for all 20. **That is not editorial approval and not a fact check.**",
  "",
  "The full standard is in `docs/content-quality-2/EDITORIAL_STANDARD.md`.",
  "",
];
const csv = ["n,item_id,game,G1_correct,G2_one_answer,G3_clear,G4_objective,G5_enterable,G6_dated,G7_safe,R1,R2,R3,R4,R5,decision,your_difficulty,fact_check_notes,comments"];
const key: Record<string, unknown> = {};
batch.items.forEach((id, i) => {
  const e = byId.get(id);
  if (!e) throw new Error(`${id} is not in the pilot`);
  const it = e.item as Record<string, unknown>;
  const ed = e.editorial;
  md.push(`---`, "", `## ${i + 1}. ${GAME[e.game] ?? e.game} · \`${id}\` · labelled ${DIFF[Number(it["difficulty"])]}`, "");
  const opts = (it["options"] ?? it["speakers"]) as string[] | undefined;
  if (e.game === "who-said-that") md.push(`**Quote:** “${it["quote"]}”`);
  else if (e.game === "guess-the-year") md.push(`**Event:** ${it["event"]}`);
  else if (e.game === "category-sprint") md.push(`**Category:** ${it["name"]}`);
  else if (e.game === "impostor") md.push(`**Secret word:** ${it["word"]} · **Impostor's hint:** ${it["hintCategory"]}`);
  else if (e.game === "word-connections") md.push("**Board** (players see the 16 words shuffled):");
  else md.push(`**Prompt:** ${it["prompt"]}`);
  md.push("");
  if (opts) md.push(`- Options: ${opts.join(" · ")}`, `- Answer: **${it["answer"]}**`);
  if (e.game === "closest-wins") md.push(`- Answer: **${it["answer"]} ${it["unit"]}**${it["formula"] ? ` (formula \`${it["formula"]}\`)` : ""}`);
  if (e.game === "guess-the-year") md.push(`- Answer: **${it["year"]}**`);
  if (e.game === "word-connections") for (const g of it["groups"] as { name: string; words: string[]; level: number }[]) md.push(`- Level ${g.level} · ${g.name}: ${g.words.join(", ")}`);
  if (e.game === "category-sprint") md.push(`- Accepted (${(it["answers"] as string[]).length}): ${(it["answers"] as string[]).join(", ")}`);
  if (it["redHerrings"]) md.push(`- Intended misdirection: ${it["redHerrings"]}`);
  const reveal = it["explanation"] ?? it["context"];
  if (reveal) md.push(`- Explanation shown to players: ${reveal}`);
  md.push(`- Reveal moment: ${ed.reveal}`);
  if (it["ambiguity"]) md.push(`- Known ambiguity: ${it["ambiguity"]}`);
  if (ed.proposedFields) md.push(`- Needs fields the engine doesn't support yet: \`${JSON.stringify(ed.proposedFields)}\``);
  if (ed.blockedBy) md.push(`- **Blocked:** ${ed.blockedBy}`);
  md.push(`- Source basis (as written by the author, **not yet checked by a person**): ${(it["source"] as { ref?: string; kind: string }).ref ?? (it["source"] as { kind: string }).kind}`);
  md.push(`- **Fact check to do:** ${ed.verification}`, "");
  md.push("| G1 | G2 | G3 | G4 | G5 | G6 | G7 | R1 | R2 | R3 | R4 | R5 | Decision | Your difficulty |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|", "| | | | | | | | | | | | | | |", "", "Notes:", "");
  csv.push(`${i + 1},${id},${e.game},,,,,,,,,,,,,,,,`);
  const sel = Object.entries(batch.authorSelection).find(([, ids]) => ids.includes(id))?.[0];
  key[id] = { authorPick: sel, authorRubric: ed.rubric, authorTotal: Object.values(ed.rubric).reduce((a, b) => a + b, 0), authorExpectedCorrect: ed.expectedCorrect, whyInclude: ed.whyInclude };
});
writeFileSync(join(out, "REVIEW_SHEET.md"), md.join("\n"));
writeFileSync(join(out, "SCORES.csv"), csv.join("\n") + "\n");
writeFileSync(join(out, "author-key.json"), JSON.stringify({ note: "Open only after the independent review is submitted.", items: key }, null, 1) + "\n");
console.log(`wrote ${batchId}: ${batch.items.length} items`);
