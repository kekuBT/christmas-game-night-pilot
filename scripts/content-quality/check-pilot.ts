/** npm run content:pilot — validate the Content Quality 2.0 pilot draft. Exit 1 on any error. */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadContent, DEFAULT_CONTENT_DIR } from "../../src/content/registry.js";
import { checkPilot, readPilot } from "./pilot-lib.js";

const dir = join(DEFAULT_CONTENT_DIR, "pilot");
const lib = loadContent();
let errors = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const file = readPilot(join(dir, name));
  // review-batch-*.json files list item ids for editors; they are not pilot item files.
  if (!Array.isArray(file.entries)) continue;
  const findings = checkPilot(file, new Set(lib.items.keys()));
  const byGame = new Map<string, number>();
  for (const e of file.entries) byGame.set(e.game, (byGame.get(e.game) ?? 0) + 1);
  const blocked = file.entries.filter((e) => e.editorial.blockedBy).map((e) => e.item.id);
  console.log(`${name}: ${file.entries.length} draft items (${[...byGame].map(([g, n]) => `${g} ${n}`).join(", ")})`);
  console.log(`  blocked by engine limits: ${blocked.length ? blocked.join(", ") : "none"}`);
  for (const x of findings) console.log(`  ${x.level.toUpperCase()} ${x.id}: ${x.message}`);
  errors += findings.filter((x) => x.level === "error").length;
}
console.log(errors ? `FAILED: ${errors} error(s)` : "OK: every draft item passes the live schema and the machine-checkable editorial rules (this is not an approval).");
process.exit(errors ? 1 : 0);
