/**
 * Stage 12.17 (docs/stage12/stage1217.md §6): the reviewable inventory of every drawing prompt, written from the loaded
 * content library (so ids, words, accepted alternatives, seasons, status and the approval hash are exactly what the games
 * play and what an approval must name), plus the editorial flags below and a probe of both games' real answer matchers.
 *
 * The flags are one reader's notes for a person to decide on. Nothing here approves or edits a prompt.
 *
 * Usage: npx tsx scripts/content-quality/draw-prompts-inventory.ts > docs/stage12/stage1217-draw-prompts-inventory.md
 */
import { loadContent } from "../../src/content/registry.js";
import { lintLibrary } from "../../src/content/lint.js";
import { answerMatches, TYPO_FROM_LENGTH } from "../../src/games/modules/teamKit.js";
import { guessMatches } from "../../src/games/modules/draw.js";
import { drawPromptOf } from "../../src/content/materialize.js";

type Flag = "ambiguous" | "draw" | "season" | "local";
/** id -> [flag, note] pairs, and guesses a player might reasonably type (probed against both games' matchers). */
const NOTES: Record<string, { flags: [Flag, string][]; tries?: string[] }> = {
  "dg-001": { flags: [["season", "Winter imagery in a year-round prompt: dealt in Everyday sessions too."]], tries: ["Snowmen", "Snow man"] },
  "dg-002": { flags: [["ambiguous", "\"Deer\", \"Caribou\" and \"Rudolph\" are refused."], ["draw", "Hard to tell from a deer or another antlered animal without a sleigh or a red nose."]], tries: ["Deer", "Caribou", "Rudolph", "Raindeer"] },
  "dg-003": { flags: [["ambiguous", "\"Cane\" and \"Candy\" alone are refused."], ["local", "Candy canes are mainly a North American and European sweet."]], tries: ["Cane", "Candycane"] },
  "dg-004": { flags: [["draw", "Needs icing or sweets drawn on it to tell it from House (dg-052)."], ["ambiguous", "\"House\" (another prompt) and \"Gingerbread\" are refused."]], tries: ["House", "Gingerbread"] },
  "dg-005": { flags: [["season", "Winter clothing in a year-round prompt."], ["ambiguous", "\"Glove\" is accepted, though a glove and a mitten are different things: generous, a reviewer's call."]], tries: ["Mittens", "Gloves"] },
  "dg-006": { flags: [["season", "Winter clothing in a year-round prompt."], ["ambiguous", "The plural \"Scarves\" is refused (the matchers only drop a final -s or -es)."]], tries: ["Scarves"] },
  "dg-007": { flags: [["season", "Snow imagery in a year-round prompt."], ["ambiguous", "\"Sleigh\", which a sled drawing in December invites, is refused."]], tries: ["Sleigh", "Sledge", "Toboggan"] },
  "dg-008": { flags: [["ambiguous", "\"Fire\" is refused here but accepted for Campfire (dg-040); \"Chimney\" is refused."], ["draw", "Close to Campfire (dg-040) unless the hearth and mantel are drawn."]], tries: ["Fire", "Chimney", "Fire place"] },
  "dg-009": { flags: [["ambiguous", "\"Box\", the likeliest guess for a wrapped present, is refused."]], tries: ["Box", "Gift", "Parcel"] },
  "dg-010": { flags: [["ambiguous", "\"Jingle bell\" is refused."]], tries: ["Bells", "Jingle bell"] },
  "dg-011": { flags: [], tries: ["Candles"] },
  "dg-012": { flags: [], tries: ["Biscuit", "Cookies"] },
  "dg-013": { flags: [["ambiguous", "\"Kettle\" is refused."]], tries: ["Kettle", "Tea pot"] },
  "dg-014": { flags: [["ambiguous", "\"Brolly\" and \"Parasol\" are refused."]], tries: ["Brolly", "Parasol"] },
  "dg-015": { flags: [], tries: ["Bike", "Cycle"] },
  "dg-016": { flags: [["ambiguous", "\"Spaceship\" is refused."]], tries: ["Spaceship", "Rockets"] },
  "dg-017": { flags: [["ambiguous", "\"Tower\" is refused."]], tries: ["Tower", "Light house"] },
  "dg-018": { flags: [["ambiguous", "\"Squid\" is refused (fair); the plural \"Octopi\" is refused."]], tries: ["Octopi", "Octopuses", "Squid"] },
  "dg-019": { flags: [], tries: ["Girafe"] },
  "dg-020": { flags: [["ambiguous", "The plural \"Cacti\" is refused."]], tries: ["Cacti", "Cactuses"] },
  "dg-021": { flags: [["draw", "Needs a bucket, spade or beach to tell it from Castle (dg-026)."], ["ambiguous", "\"Castle\" (another prompt) is refused."]], tries: ["Castle", "Sand castle"] },
  "dg-022": { flags: [["draw", "Needs smoke or lava to tell it from Mountain (dg-067)."], ["ambiguous", "\"Mountain\" (another prompt) is refused."]], tries: ["Mountain", "Volcanoes"] },
  "dg-023": { flags: [] },
  "dg-024": { flags: [] },
  "dg-025": { flags: [] },
  "dg-026": { flags: [["ambiguous", "\"Palace\" is refused."]], tries: ["Palace", "Castles"] },
  "dg-027": { flags: [["ambiguous", "\"Pizza slice\" is refused, though a slice is the usual way to draw it."]], tries: ["Pizza slice", "Slice"] },
  "dg-028": { flags: [] },
  "dg-029": { flags: [["ambiguous", "\"Violin\" and \"Ukulele\" are refused (fair: different instruments, but easy to draw alike)."]], tries: ["Violin", "Ukulele"] },
  "dg-030": { flags: [], tries: ["Drums"] },
  "dg-031": { flags: [], tries: ["Tiara"] },
  "dg-032": { flags: [] },
  "dg-033": { flags: [] },
  "dg-034": { flags: [] },
  "dg-035": { flags: [], tries: ["Slug"] },
  "dg-036": { flags: [["ambiguous", "\"Moth\" is refused (fair)."]], tries: ["Moth"] },
  "dg-037": { flags: [["ambiguous", "\"Spider\" is refused; \"Web\" is accepted."]], tries: ["Spider", "Web", "Spiderweb"] },
  "dg-038": { flags: [["ambiguous", "Bare \"Balloon\" is accepted: generous, a reviewer's call."]], tries: ["Balloon", "Air balloon"] },
  "dg-039": { flags: [] },
  "dg-040": { flags: [["ambiguous", "\"Fire\" is accepted here and refused for Fireplace (dg-008)."]], tries: ["Fire", "Bonfire", "Camp fire"] },
  "dg-041": { flags: [["season", "Snow and ice imagery in a year-round prompt."]], tries: ["Igloos"] },
  "dg-042": { flags: [["ambiguous", "\"Cone\" is refused."]], tries: ["Icecream", "Cone"] },
  "dg-043": { flags: [["ambiguous", "\"Cake\" and \"Muffin\" are refused."]], tries: ["Cake", "Muffin", "Cup cake"] },
  "dg-044": { flags: [], tries: ["Tooth brush"] },
  "dg-045": { flags: [["ambiguous", "\"Sunglasses\" is refused; \"Glass\" is accepted (as the singular)."]], tries: ["Sunglasses", "Spectacles", "Glass"] },
  "dg-046": { flags: [] },
  "dg-047": { flags: [] },
  "dg-048": { flags: [["ambiguous", "\"Watch\" and \"Alarm clock\" are refused."]], tries: ["Watch", "Alarm clock"] },
  "dg-049": { flags: [["ambiguous", "\"Crescent\" and \"Full moon\" are refused."]], tries: ["Crescent", "Full moon"] },
  "dg-050": { flags: [] },
  "dg-051": { flags: [["ambiguous", "\"Christmas tree\" and \"Pine\" are refused: a tree drawn in a Christmas session invites them."]], tries: ["Christmas tree", "Pine", "Trees"] },
  "dg-052": { flags: [["ambiguous", "\"Home\" and \"Hut\" are refused."]], tries: ["Home", "Hut"] },
  "dg-053": { flags: [] },
  "dg-054": { flags: [["ambiguous", "\"Kitten\" and \"Kitty\" are refused."]], tries: ["Kitten", "Kitty"] },
  "dg-055": { flags: [["ambiguous", "\"Puppy\" is refused."]], tries: ["Puppy"] },
  "dg-056": { flags: [["ambiguous", "\"Sailboat\" is refused."]], tries: ["Ship", "Sailboat"] },
  "dg-057": { flags: [], tries: ["Locomotive"] },
  "dg-058": { flags: [["ambiguous", "\"Jet\" and \"Aircraft\" are refused."]], tries: ["Plane", "Jet", "Aircraft"] },
  "dg-059": { flags: [] },
  "dg-060": { flags: [["ambiguous", "A drawn flower invites its name: \"Rose\" and \"Daisy\" are refused."]], tries: ["Rose", "Daisy"] },
  "dg-061": { flags: [] },
  "dg-062": { flags: [["local", "\"Football\" means different balls in different countries; \"Ball\" is accepted, so any ball drawing counts."], ["ambiguous", "\"Soccer\" alone is refused."]], tries: ["Soccer", "Soccer ball", "Ball"] },
  "dg-063": { flags: [["ambiguous", "\"Cap\" is refused."]], tries: ["Cap"] },
  "dg-064": { flags: [["ambiguous", "\"Boot\" and \"Sneaker\" are refused."]], tries: ["Boot", "Sneaker"] },
  "dg-065": { flags: [] },
  "dg-066": { flags: [["ambiguous", "\"Lioness\" is refused (a lion drawn without a mane)."]], tries: ["Lioness"] },
  "dg-067": { flags: [["ambiguous", "\"Hill\" and \"Volcano\" (another prompt) are refused."]], tries: ["Hill", "Mountains"] },
  "dg-068": { flags: [] },
  "dg-069": { flags: [["ambiguous", "\"Wind turbine\" is refused."]], tries: ["Wind turbine"] },
  "dg-070": { flags: [["draw", "Harder to draw recognisably than most: it can read as a tube or a cannon."], ["ambiguous", "\"Binoculars\" is refused."]], tries: ["Binoculars"] },
};

const lib = loadContent();
const today = new Date().toISOString().slice(0, 10);
const issues = lintLibrary(lib, today).filter((i) => i.gameId === "draw-prompts");
const items = [...(lib.byGame.get("draw-prompts") ?? [])];
const missing = items.filter((li) => !NOTES[li.item.id]).map((li) => li.item.id);
if (missing.length) throw new Error(`no notes for ${missing.join(", ")}`);
const extra = Object.keys(NOTES).filter((id) => !items.some((li) => li.item.id === id));
if (extra.length) throw new Error(`notes for unknown ids ${extra.join(", ")}`);

const flagCount = (f: Flag) => items.filter((li) => NOTES[li.item.id]!.flags.some(([x]) => x === f)).length;
const approvedCount = items.filter((li) => li.status === "approved" && !!li.approval).length;
const xmas = items.filter((li) => li.item.season === "christmas");
const out: string[] = [];
const p = (s = "") => out.push(s);
p("# Stage 12.17: drawing prompt inventory (for review)");
p();
p(`Generated from the loaded content library by \`scripts/content-quality/draw-prompts-inventory.ts\` on ${today}. Every id, word, accepted alternative, season, status and hash below is what Team Draw and Draw & Guess play and what an approval must name. ${approvedCount === 0 ? `**No prompt is approved**: all ${items.length} are \`provisional\`, so they play in casual and Practice games and never in an Official Team Draw game.` : `**${approvedCount} of ${items.length} prompts are approved**; the rest play only in casual and Practice games.`}`);
p();
p("The flags are one reader's notes for a person to decide on. Nothing here approves or edits a prompt. Authorship, tests, this document and the review handoff are not editorial approval.");
p();
p("## How a prompt becomes Official");
p();
p("1. A person checks the word and its accepted alternatives (and fixes them in `content/packs/draw-prompts.json` first: an edit changes the hash).");
p("2. They approve it: `npm run content:approve -- --reviewer \"Name\" <id>` writes `content/approvals.json` with the prompt's current hash. (That file does not exist yet: nothing in the library has been approved through it.) Only that record approves a drawing prompt: a `review.status` label in the pack (`approved`, `legacy`, `verified-computed`) approves nothing, is reported by `npm run content:check`, and leaves the prompt provisional (D-S1217-02, as D-S1216R-01).");
p("3. `npm run content:check` shows the counts. An approval whose hash no longer matches (the prompt was edited) is reported and ignored. A `rejected` prompt is never Official and is dealt by no game at all.");
p("4. An Official Team Draw game needs one approved prompt per round that this Cup has not dealt yet: 3 to 5 rounds, the size of the biggest team in the final roster. Every earlier drawing game in the Cup uses its prompts up, Practice and Draw & Guess included (a Draw & Guess swap uses both the word swapped out and the one swapped in). A Family Cup deals every prompt, so approved Christmas prompts count too (D-S1217-03, provisional: for the owner to confirm).");
p("5. Draw & Guess stays Practice-only: approvals change nothing there.");
p();
p("## Summary");
p();
p("| | Year-round | Christmas | All |");
p("|---|---|---|---|");
p(`| Prompts | ${items.length - xmas.length} | ${xmas.length} | ${items.length} |`);
p(`| Approved | ${items.filter((li) => !li.item.season && li.status === "approved").length} | ${xmas.filter((li) => li.status === "approved").length} | ${items.filter((li) => li.status === "approved").length} |`);
p(`| With accepted alternatives | ${items.filter((li) => !li.item.season && drawPromptOf(li).alts).length} | ${xmas.filter((li) => drawPromptOf(li).alts).length} | ${items.filter((li) => drawPromptOf(li).alts).length} |`);
p(`| Lint errors / warnings | | | ${issues.filter((i) => i.level === "error").length} / ${issues.filter((i) => i.level === "warn").length} |`);
p();
p("Prompts carrying each flag (a prompt can carry several):");
p();
p("| Flag | Meaning | Prompts |");
p("|---|---|---|");
p(`| ambiguous | a reasonable guess both matchers refuse, a generous alternative, or a guess that is another prompt | ${flagCount("ambiguous")} |`);
p(`| draw | hard to draw recognisably, or easy to draw like another prompt | ${flagCount("draw")} |`);
p(`| season | winter imagery in a year-round prompt (dealt in Everyday sessions) | ${flagCount("season")} |`);
p(`| local | the word or the thing is regional | ${flagCount("local")} |`);
p(`| none | no flag | ${items.filter((li) => NOTES[li.item.id]!.flags.length === 0).length} |`);
p();
p("- **Difficulty:** every prompt's `difficulty` is a placeholder (2): the list had none. Official selection keeps the pool's difficulty mix (`src/content/select.ts`), so until a reviewer sets real difficulties that balancing does nothing here.");
p("- **Source:** every prompt is `original-creative` (the Stage 5 list, written for this app). A prompt is a single everyday word with no factual claim, so no source check applies.");
p("- **Order:** the pack keeps the list's order. Every game deals by shuffling it with its seed, so changing the order changes which prompts a seed deals.");
p();
p("**Lint** (`npm run content:check`): " + (issues.length ? issues.map((i) => `${i.itemId} ${i.code} (${i.level})`).join("; ") : "none") + ".");
p();
p(`**Matcher probe**: each prompt lists plausible typed guesses and whether each game's real matcher accepts them. Both ignore case, accents, punctuation, spaces, a leading article and a final -s or -es. They differ in one way, which this stage does not change: **Team Draw** (\`answerMatches\` in \`src/games/modules/teamKit.ts\`) also forgives one typo when the accepted word has at least ${TYPO_FROM_LENGTH} letters; **Draw & Guess** (\`guessMatches\` in \`src/games/modules/draw.ts\`) forgives none. So "Raindeer" scores in Team Draw and not in Draw & Guess. A refused guess in Team Draw pauses that team's guessing for a moment and uses one of its tries for the round.`);
p();
const probe = (li: (typeof items)[number], t: string) => {
  const dp = drawPromptOf(li);
  const td = answerMatches([dp.word, ...(dp.alts ?? [])], t), dg = guessMatches(dp, t);
  return `"${t}" ${td && dg ? "accepted" : !td && !dg ? "refused" : td ? "accepted in Team Draw, refused in Draw & Guess" : "accepted in Draw & Guess, refused in Team Draw"}`;
};
const section = (title: string, list: typeof items) => {
  p(`## ${title} (${list.length})`);
  p();
  for (const li of list) {
    const dp = drawPromptOf(li);
    const n = NOTES[dp.id]!;
    p(`### ${dp.id} · ${dp.word}`);
    p();
    p(`- **Season** ${dp.season ?? "year-round"} · **status** ${li.status} · **difficulty** ${li.item.difficulty} (placeholder) · **source** ${li.item.source.kind}`);
    p(`- **Accepted** ${[dp.word, ...(dp.alts ?? [])].map((a) => `"${a}"`).join(", ")}${dp.alts ? "" : " (no alternatives)"}`);
    p(`- **Approval hash** \`${li.hash}\` (pack \`${li.packId}\` ${li.packVersion}) · **approval record** ${li.approval ? `${li.approval.reviewer}, ${li.approval.date}` : "none"}`);
    const lint = issues.filter((i) => i.itemId === dp.id);
    if (lint.length) p(`- **Lint** ${lint.map((i) => `${i.code}: ${i.message}`).join("; ")}`);
    if (n.tries?.length) p(`- **Probe** ${n.tries.map((t) => probe(li, t)).join(", ")}`);
    p(`- **Flags** ${n.flags.length ? n.flags.map(([f, note]) => `\`${f}\` ${note}`).join(" ") : "none"}`);
    p();
  }
};
section("Christmas prompts", xmas);
section("Year-round prompts", items.filter((li) => !li.item.season));
process.stdout.write(out.join("\n"));
