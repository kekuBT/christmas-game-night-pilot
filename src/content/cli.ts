/**
 * Content tools (Sprint 4).
 *   npm run content:check                inventory + lint; exit 1 on any error
 *   npm run content:review -- <dir>      write one review sheet per game (markdown) for a human editor
 *   npm run content:approve -- --reviewer "Name" <itemId|@file> ...
 *                                        record a HUMAN approval of the items exactly as they are now
 * Approvals are bound to each item's content hash: editing an item later
 * voids its approval until it is reviewed again.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONTENT_DIR, loadContent, officialEligible, type LoadedItem } from "./registry.js";
import { inventory, lintLibrary } from "./lint.js";
import { seasonAuditFindings } from "./seasonAudit.js";
import { ApprovalsSchema } from "./schema.js";

const today = new Date().toISOString().slice(0, 10);
const [cmd, ...args] = process.argv.slice(2);
const lib = loadContent();
const issues = lintLibrary(lib, today);

function answerOf(li: LoadedItem): string {
  const it = li.item as Record<string, unknown>;
  switch (li.gameId) {
    case "word-connections": return (it["groups"] as { name: string; words: string[]; level: number }[]).map((g) => `L${g.level} ${g.name}: ${g.words.join(", ")}`).join(" · ");
    case "guess-the-year": return String(it["year"]);
    case "closest-wins": return `${it["answer"]} ${it["unit"]}${it["formula"] ? ` (= ${it["formula"]})` : ""}`;
    case "category-sprint": return `${(it["answers"] as string[]).length} answers: ${(it["answers"] as string[]).join(", ")}`;
    case "impostor": return `${it["word"]} (${it["hintCategory"]})`;
    case "caption-clash": case "charades": return "—";
    default: return String(it["answer"] ?? "");
  }
}
function questionOf(li: LoadedItem): string {
  const it = li.item as Record<string, unknown>;
  const q = String(it["prompt"] ?? it["quote"] ?? it["event"] ?? it["name"] ?? it["word"] ?? "(board)");
  const opts = (it["options"] ?? it["speakers"]) as string[] | undefined;
  return opts ? `${q} [${opts.join(" / ")}]` : q;
}

if (cmd === "check" || cmd === undefined) {
  for (const p of lib.problems) console.log(`ERROR load ${p.file}${p.itemId ? ` ${p.itemId}` : ""}: ${p.message}`);
  const rows = inventory(lib, issues, today);
  console.log("game               total approved computed legacy provisional rejected | official practice-only stale | errors warnings");
  for (const r of rows) console.log(`${r.gameId.padEnd(18)} ${String(r.total).padStart(5)} ${String(r.approved).padStart(8)} ${String(r.computed).padStart(8)} ${String(r.legacy).padStart(6)} ${String(r.provisional).padStart(11)} ${String(r.rejected).padStart(8)} | ${String(r.official).padStart(8)} ${String(r.practiceOnly).padStart(13)} ${String(r.stale).padStart(5)} | ${String(r.errors).padStart(6)} ${String(r.warnings).padStart(8)}`);
  for (const i of issues.filter((x) => x.level === "error")) console.log(`ERROR ${i.gameId} ${i.itemId} [${i.code}] ${i.message}`);
  if (args.includes("--warnings")) for (const i of issues.filter((x) => x.level === "warn")) console.log(`warn  ${i.gameId} ${i.itemId} [${i.code}] ${i.message}`);
  // Stage 8.2: untagged items with Christmas words (an editorial net; the game reads only the season tag).
  const seasonal = seasonAuditFindings(lib);
  for (const f of seasonal) console.log(`warn  ${f.gameId} ${f.itemId} [season-untagged] words ${f.words.join(", ")}: tag it season "christmas", or review it and list it in src/content/seasonAudit.ts as year-round`);
  console.log(`season audit: ${seasonal.length} untagged item(s) with Christmas words; ${[...lib.items.values()].filter((li) => li.item.season === "christmas").length} tagged Christmas`);
  const errors = lib.problems.length + issues.filter((x) => x.level === "error").length;
  console.log(errors === 0 ? "CONTENT OK" : `CONTENT ERRORS: ${errors}`);
  process.exit(errors === 0 ? 0 : 1);
} else if (cmd === "review") {
  const dir = args[0] ?? join("test-results", "content-review");
  mkdirSync(dir, { recursive: true });
  for (const [gameId, items] of lib.byGame) {
    const lines = [`# Review sheet — ${gameId} (${today})`, "", "Approve with: `npm run content:approve -- --reviewer \"Your name\" <ids>` (only after checking each answer).", "", "| id | status | diff | question | answer | source | notes / lint |", "|---|---|---|---|---|---|---|"];
    for (const li of items) {
      const lint = issues.filter((i) => i.itemId === li.item.id).map((i) => `${i.level}: ${i.message}`).join("; ");
      const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${li.item.id} | ${li.status}${officialEligible(li, today) ? " ✓official" : ""} | ${li.item.difficulty} | ${cell(questionOf(li))} | ${cell(answerOf(li))} | ${cell(`${li.item.source.kind}${li.item.source.ref ? `: ${li.item.source.ref}` : ""}`)} | ${cell([li.item.review.notes, li.item.ambiguity ? `AMBIGUITY: ${li.item.ambiguity}` : "", lint].filter(Boolean).join(" · "))} |`);
    }
    writeFileSync(join(dir, `${gameId}.md`), `${lines.join("\n")}\n`);
  }
  console.log(`review sheets written to ${dir}`);
} else if (cmd === "approve") {
  const ri = args.indexOf("--reviewer");
  const reviewer = ri >= 0 ? args[ri + 1] : undefined;
  if (!reviewer) { console.error("--reviewer \"Name\" is required: approvals record a human decision"); process.exit(2); }
  const ids = args.filter((a, i) => i !== ri && i !== ri + 1).flatMap((a) => (a.startsWith("@") ? readFileSync(a.slice(1), "utf8").split(/\s+/).filter(Boolean) : [a]));
  const file = join(DEFAULT_CONTENT_DIR, "approvals.json");
  const data = existsSync(file) ? ApprovalsSchema.parse(JSON.parse(readFileSync(file, "utf8"))) : { schemaVersion: 1 as const, approvals: [] };
  for (const id of ids) {
    const li = lib.items.get(id);
    if (!li) { console.error(`unknown item ${id}`); process.exit(2); }
    if (li.item.review.status === "rejected") { console.error(`${id} is rejected; fix the item first`); process.exit(2); }
    if (issues.some((i) => i.itemId === id && i.level === "error")) { console.error(`${id} has lint errors; fix them first`); process.exit(2); }
    data.approvals = data.approvals.filter((a) => a.itemId !== id);
    data.approvals.push({ itemId: id, hash: li.hash, reviewer, date: today });
  }
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`recorded ${ids.length} approval(s) by ${reviewer}`);
} else {
  console.error("usage: content:check | content:review [dir] | content:approve --reviewer NAME ids...");
  process.exit(2);
}
