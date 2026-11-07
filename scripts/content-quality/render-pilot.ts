/** npm run content:pilot:render — write docs/content-quality-2/PILOT_ITEMS.md from the pilot JSON (the JSON is the source of truth). */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONTENT_DIR } from "../../src/content/registry.js";
import { readPilot } from "./pilot-lib.js";

const root = join(import.meta.dirname, "..", "..");
const file = readPilot(join(DEFAULT_CONTENT_DIR, "pilot", "pilot-cq2.json"));
const DIFF = ["", "Easy", "Medium", "Hard"];
const out: string[] = ["# Pilot collection — Content Quality 2.0 (draft)", "",
  "Generated from `content/pilot/pilot-cq2.json` by `npm run content:pilot:render`. **Draft only:** written by Claude; not loaded by the game; not human-reviewed or fact-checked by a person; not approved. Each item names the check a human must do before it can be approved.", "",
  "Rubric = author's self-score: Entertainment / Creativity / Clarity / Distractors / Social (each 1–5; the bar is a total of at least 18 with no dimension below 3, and the mandatory gates).", ""];
let game = "";
for (const e of file.entries) {
  if (e.game !== game) { game = e.game; out.push(`\n## ${game}\n`); }
  const it = e.item as Record<string, unknown>; const ed = e.editorial; const r = ed.rubric;
  const head = String(it["prompt"] ?? it["quote"] ?? it["event"] ?? it["name"] ?? it["word"] ?? (it["groups"] ? "Word Connections board" : ""));
  out.push(`### ${e.item.id} · ${DIFF[Number(it["difficulty"])]} · ${it["category"]}`, "", `**${game === "who-said-that" ? `“${head}”` : head}**`, "");
  const opts = (it["options"] ?? it["speakers"]) as string[] | undefined;
  if (opts) out.push(`- Options: ${opts.map((o) => (o === it["answer"] ? `**${o}** ✓` : o)).join(" · ")}`);
  if (game === "closest-wins") out.push(`- Answer: **${it["answer"]} ${it["unit"]}**${it["formula"] ? ` (formula: \`${it["formula"]}\`)` : ""}`);
  if (game === "guess-the-year") out.push(`- Answer: **${it["year"]}**`);
  if (game === "word-connections") for (const g of it["groups"] as { name: string; words: string[]; level: number }[]) out.push(`- Level ${g.level} · ${g.name}: ${g.words.join(", ")}`);
  if (game === "category-sprint") out.push(`- Accepted (${(it["answers"] as string[]).length}): ${(it["answers"] as string[]).join(", ")}`);
  if (game === "impostor") out.push(`- Impostor sees only the hint: **${it["hintCategory"]}**`);
  if (it["explanation"] || it["context"]) out.push(`- Explanation: ${it["explanation"] ?? it["context"]}`);
  if (it["redHerrings"]) out.push(`- Misdirection: ${it["redHerrings"]}`);
  if (it["ambiguity"]) out.push(`- Known ambiguity: ${it["ambiguity"]}`);
  out.push(`- Reveal moment: ${ed.reveal}`, `- Expected correct: ${ed.expectedCorrect}`);
  if (ed.scoring) out.push(`- Scoring: ${ed.scoring}`);
  out.push(`- Source basis: ${(it["source"] as { ref?: string }).ref ?? (it["source"] as { kind: string }).kind}`, `- Verification required: ${ed.verification}`, `- Why include it: ${ed.whyInclude}`, `- Rubric: ${r.entertainment}/${r.creativity}/${r.clarity}/${r.distractors}/${r.social} = ${r.entertainment + r.creativity + r.clarity + r.distractors + r.social}`);
  if (ed.replaces?.length) out.push(`- Replaces: ${ed.replaces.join(", ")}`);
  if (ed.proposedFields) out.push(`- Needs fields the engine doesn't have yet: \`${JSON.stringify(ed.proposedFields)}\``);
  if (ed.blockedBy) out.push(`- **Blocked:** ${ed.blockedBy}`);
  out.push("");
}
writeFileSync(join(root, "docs/content-quality-2/PILOT_ITEMS.md"), out.join("\n"));
console.log(`wrote PILOT_ITEMS.md (${file.entries.length} items)`);
