/**
 * Stage 12.16 (docs/stage12/stage1216.md §Inventory): the reviewable inventory of every Split Clues puzzle, written from
 * the loaded content library (so ids, wording, accepted answers, status and the approval hash are exactly what the game
 * plays and what an approval must name), plus the editorial notes below and a probe of the real answer matcher.
 *
 * The notes are one reader's flags for a person to decide on. Nothing here approves, edits or verifies a puzzle, and no
 * source was consulted: a "check" note means the claim needs a source before approval, not that it is wrong.
 *
 * Usage: npx tsx scripts/content-quality/split-clues-inventory.ts > docs/stage12/stage1216-split-clues-inventory.md
 */
import { loadContent } from "../../src/content/registry.js";
import { lintLibrary } from "../../src/content/lint.js";
import { answerMatches } from "../../src/games/modules/teamKit.js";
import type { ItemOf } from "../../src/content/schema.js";

type Flag = "giveaway" | "check" | "ambiguous" | "weak" | "local" | "repeat";
/** id -> [flag, note] pairs, and typed answers a team might reasonably try (probed against the real matcher). */
const NOTES: Record<string, { flags: [Flag, string][]; tries?: string[] }> = {
  // ---- Christmas ----
  "sc-101": { flags: [["giveaway", "Clue 5 (\"Rudolph is one\") names a famous reindeer: whoever holds it can answer alone."], ["ambiguous", "Clue 6 invites \"Caribou\", which is refused."]], tries: ["Caribou", "Reindeers"] },
  "sc-102": { flags: [["giveaway", "Clue 6 (\"Frosty is a famous one\") is close to the answer on its own."]], tries: ["Snowmen", "Snow person"] },
  "sc-103": { flags: [["giveaway", "Clue 2 (\"shaped like a big sock\") nearly names it."], ["check", "Clue 6 (an orange at the bottom) is a family tradition in some places, not everywhere; reads as \"some families\", which is fair."]], tries: ["Sock", "Stockings"] },
  "sc-104": { flags: [["ambiguous", "\"Fir tree\" is accepted but \"Pine tree\" and bare \"Tree\" are refused, though many Christmas trees are pine or spruce."], ["weak", "Clue 1 (\"stays green all year\") is true of a real evergreen but sits oddly beside clue 6 (\"real or plastic\")."]], tries: ["Tree", "Pine tree", "Fir tree"] },
  "sc-105": { flags: [["giveaway", "Clue 4 (a kiss underneath) gives it away."], ["check", "Clue 5 (\"Its berries are poisonous\"): how toxic mistletoe berries are to people is often overstated; needs a source or softer wording."], ["weak", "Clue 6 (\"It's a plant used at Christmas\") repeats the kind (\"A plant\") and the season."]] },
  "sc-106": { flags: [["giveaway", "Clue 5 quotes the Gingerbread Man story."]], tries: ["Gingerbread man", "Ginger biscuit"] },
  "sc-107": { flags: [["giveaway", "Clue 6 points straight at \"A Christmas Carol\"."], ["ambiguous", "\"Hymn\" and \"Christmas song\" are reasonable tries for clues 1, 3, 4 and are refused."]], tries: ["Hymn", "Christmas song", "Carols"] },
  "sc-108": { flags: [["giveaway", "Clue 6 (\"Ho ho ho\") and clue 3 (checks a list twice) each give it away; every clue is easy in a Christmas game."], ["ambiguous", "\"Saint Nicholas\" is accepted although the historical saint and Santa are not quite the same figure; a reviewer may want that."]], tries: ["Father Christmas", "St. Nicholas", "Santa Clause"] },
  "sc-109": { flags: [["giveaway", "Clue 5 (Jesus was born there) and clue 6 (\"O Little Town of Bethlehem\") each give it away."], ["check", "Clue 3 (the name means \"house of bread\") is the usual Hebrew reading; other etymologies are proposed. Needs a source or \"is often said to mean\"."], ["check", "Clue 2 (south of Jerusalem): needs a source; wording kept neutral (no political framing), which should stay so."]] },
  "sc-110": { flags: [["local", "Christmas crackers are mainly a British and Commonwealth custom; some families will not know them."], ["ambiguous", "\"Bon-bon\" (another name in some countries) is refused."]], tries: ["Bon-bon", "Christmas cracker"] },
  "sc-111": { flags: [["check", "Clue 3 (peppermint): the classic flavour; other flavours exist. Fine as a clue, worth a glance."]], tries: ["Candy cane", "Candy stick"] },
  "sc-112": { flags: [["check", "Clue 5 (starts on 1 December) and clue 6 (ends on Christmas Eve) hold for most calendars, not all (some start on the first Sunday of Advent, some have 25 doors)."], ["ambiguous", "Bare \"Advent\" is accepted though it names the season, not the object; \"Calendar\" is refused."]], tries: ["Calendar", "Advent"] },
  "sc-113": { flags: [["weak", "Clue 1 (round) and clue 5 (a hole in the middle) say the same thing twice."], ["ambiguous", "\"Advent wreath\", which clue 6 invites, is refused."]], tries: ["Advent wreath", "Garland"] },
  // ---- Everyday ----
  "sc-001": { flags: [["giveaway", "Clue 2 (\"It's in Tanzania\") with kind \"A place\" nearly gives it away; clue 5 (Uhuru Peak) gives it away to anyone who knows the name."], ["check", "Clue 3 (snow at the top): its glaciers are shrinking; a reviewer may want \"snow and ice\" with a source and a review date."]], tries: ["Mount Kilimanjaro", "Kili"] },
  "sc-002": { flags: [["check", "Clue 3 (sleeps only a few minutes at a time) and clue 4 (no two patterns alike) are commonly said; need a source."], ["repeat", "Clue 4 is close to Zebra's clue 5 (\"No two have the same pattern\")."]] },
  "sc-003": { flags: [["giveaway", "Clue 6 (bad luck indoors) gives it away for many players."], ["ambiguous", "\"Brolly\" and \"Parasol\" are refused."]], tries: ["Brolly", "Parasol"] },
  "sc-004": { flags: [["check", "Clue 5 (came to East Africa from India) is the usual account; needs a source."], ["ambiguous", "\"Roti\" (the same flatbread in many homes) and \"Flatbread\" are refused."], ["local", "Clue 6 (Kenya) and the answer assume East African players."]], tries: ["Roti", "Flatbread", "Chapo"] },
  "sc-005": { flags: [["check", "Clue 6 (a keeper living inside): many keepers lived in a cottage beside the tower; \"some\" makes it fair."]] },
  "sc-006": { flags: [["giveaway", "Clue 2 (\"grand\" and \"upright\") gives it away."], ["ambiguous", "\"Keyboard\" fits clues 1, 5 and 6 and is refused; so is \"Grand piano\", which clue 2 invites."], ["repeat", "Clue 5 (\"It's black and white\") is the same wording as Zebra's clue 6."]], tries: ["Keyboard", "Grand piano"] },
  "sc-007": { flags: [["giveaway", "Clue 5 (largest land animal) and clue 6 (nose like a hand) each give it away."], ["check", "Clue 4 (senses sounds through its feet): needs a source."]] },
  "sc-008": { flags: [["ambiguous", "\"Nile River\" is refused while \"River Nile\" is accepted."], ["check", "Clue 3 (\"one of its sources is Lake Victoria\") and clue 6 (one of the longest) are hedged; a reviewer may want a source."]], tries: ["Nile River", "White Nile"] },
  "sc-009": { flags: [["check", "Clue 2 (only one player may use their hands) is not quite right: every player takes throw-ins with their hands. Suggest \"Only the goalkeeper may handle the ball in play\"."], ["ambiguous", "\"Association football\" is refused; clues 1, 3 and 5 also fit other sports (intended as decoys)."]], tries: ["Association football", "Soccer"] },
  "sc-010": { flags: [["check", "Clue 5 (over a year to grow) needs a source."]] },
  "sc-011": { flags: [["weak", "Very easy: clues 1–4 each point straight at it. Difficulty is a placeholder (2) for every puzzle."]], tries: ["Bike", "Cycle"] },
  "sc-012": { flags: [["check", "Clue 4 (seven colours) is a convention, not a physical fact; \"is usually said to have seven colours\" is safer."], ["giveaway", "Clue 6 (gold at the end) gives it away for many."]] },
  "sc-013": { flags: [["check", "Clue 3 (about 70 km/h) needs a source."], ["repeat", "Clue 1 (\"It can't fly\") is the same wording as Penguin's clue 1."]] },
  "sc-014": { flags: [["local", "Clue 6 (a jebena) assumes players know the Ethiopian pot (it is also the name of this app's Jebena Rush game)."], ["ambiguous", "\"Kahawa\" (Swahili) is refused, while Tea accepts \"Chai\": a reviewer may want one rule for Swahili answers."]], tries: ["Espresso", "Kahawa"] },
  "sc-015": { flags: [["giveaway", "Clue 3 (M-Pesa) gives it away to Kenyan players; clue 2 (SIM card) to anyone."], ["local", "M-Pesa assumes Kenyan players."], ["ambiguous", "\"Simu\" (Swahili) is refused (see Coffee)."]], tries: ["Simu", "Mobile"] },
  "sc-016": { flags: [["giveaway", "Clue 6 (black and white) with clue 1 (savannah) gives it away."], ["check", "Clue 4 (stripes may confuse biting flies) is hedged with \"may\"; needs a source."], ["repeat", "Clue 5 matches Giraffe's clue 4; clue 6 matches Piano's clue 5."]] },
  "sc-017": { flags: [["ambiguous", "\"Pyramids of Giza\" and \"Sphinx\" are plausible wrong tries; the accepted forms look right."]], tries: ["Pyramids of Giza", "Great Pyramid"] },
  "sc-018": { flags: [["check", "Clue 4 (India's national fruit) is widely repeated but its official status has been questioned; needs a source or rewording."], ["check", "Clue 5 (trees over a hundred years) needs a source."]] },
  "sc-019": { flags: [["giveaway", "Clue 3 (1969) gives it away."], ["ambiguous", "\"Full moon\" is refused."]], tries: ["Full moon", "The moon"] },
  "sc-020": { flags: [["giveaway", "Clue 6 (\"king of the jungle\") gives it away."], ["ambiguous", "\"Lioness\", which clue 3 invites, is refused."], ["check", "Clue 1 (up to 20 hours) and clue 4 (heard for kilometres) need a source."]], tries: ["Lioness", "Simba"] },
  "sc-021": { flags: [["check", "Clue 3 (change every three months): dental advice is usually \"every three to four months\"."], ["weak", "Easy: clues 2 and 5 together give it away."]] },
  "sc-022": { flags: [["check", "Clue 1 (every four years): true of the Summer and the Winter Games each; together there is a Games every two years."]], tries: ["Olympic Games", "Olympic"] },
  "sc-023": { flags: [["local", "Clue 1 (Kericho) assumes Kenyan players."]], tries: ["Chai", "Black tea"] },
  "sc-024": { flags: [["check", "Clue 3 (southern half of the world): almost all; one species lives at the equator. \"Almost all live…\" is safer."], ["repeat", "Clue 1 (\"It can't fly\") is the same wording as Ostrich's clue 1."]] },
  "sc-025": { flags: [["giveaway", "Clue 4 (lava) gives it away."], ["check", "Clue 3 (Mount Kenya is an old one) needs a source."], ["ambiguous", "Clue 6 (Pompeii) invites \"Vesuvius\", which is refused (right: the answer is the kind of thing)."]], tries: ["Vesuvius", "Volcanoes"] },
  "sc-026": { flags: [["ambiguous", "\"Watch\" fits clues 1, 2, 4 and 6; \"Alarm clock\" and \"Cuckoo clock\" are refused."]], tries: ["Watch", "Alarm clock", "Cuckoo clock"] },
  "sc-027": { flags: [["check", "Clue 1 (\"It doesn't go off\") is broadly true if kept sealed and dry; it can ferment. \"It keeps for a very long time\" is safer."]] },
  "sc-028": { flags: [] },
  "sc-029": { flags: [["giveaway", "Clue 5 (fastest land animal) gives it away."]], tries: ["Leopard"] },
  "sc-030": { flags: [["ambiguous", "\"Rainfall\" and \"Storm\" are refused (\"Rains\" is accepted)."], ["local", "Clue 1 (Kenya's long and short rains) assumes Kenyan players."]], tries: ["Rains", "Rainfall", "Storm"] },
  "sc-031": { flags: [["check", "Clue 2 (you need a card to borrow) and clue 6 (free) hold for most public libraries, not all."]], tries: ["Bookshop"] },
  "sc-032": { flags: [["ambiguous", "\"Clinic\" fits several clues and is refused (right, but a team may be locked out on it)."]], tries: ["Clinic"] },
  "sc-033": { flags: [["ambiguous", "Clue 1 says \"It's a minibus\", so a team holding it may type \"Minibus\", which is refused."], ["check", "Clue 6 (the name comes from Swahili for three) is the usual explanation (an early fare of three coins); needs a source."], ["local", "Assumes Kenyan players."]], tries: ["Minibus", "Matatus"] },
  "sc-034": { flags: [["check", "Clue 3 (Lake Nakuru is famous for it): flamingo numbers there have changed a lot in recent years; a reviewer may want \"was famous\" or Lake Bogoria, with a review date."]] },
  "sc-035": { flags: [["check", "Clue 2 (16 pieces) counts the pawns as pieces, which is the usual way."]] },
  "sc-036": { flags: [["giveaway", "Clue 6 (the upside-down tree) gives it away."], ["check", "Clue 2 (over a thousand years) needs a source."]] },
  "sc-037": { flags: [["check", "Clue 6 (Atlantic to the Red Sea) is commonly said; needs a source."], ["ambiguous", "Bare \"Desert\" is refused (right: the kind is \"A place\")."]], tries: ["Desert", "Sahara Desert"] },
  "sc-038": { flags: [["check", "Clue 3 (\"Some are venomous\") is not quite right: almost all spiders have venom, but few are dangerous to people. Suggest \"A few are dangerous to people\"."], ["local", "Clue 6 (Anansi) is a West African and Caribbean story figure; fine as a bonus clue."]], tries: ["Tarantula", "Arachnid"] },
};

const lib = loadContent();
const today = new Date().toISOString().slice(0, 10);
const issues = lintLibrary(lib, today).filter((i) => i.gameId === "split-clues");
const items = [...(lib.byGame.get("split-clues") ?? [])];
const ever = items.filter((li) => !li.item.season), xmas = items.filter((li) => li.item.season);
const missing = items.filter((li) => !NOTES[li.item.id]).map((li) => li.item.id);
if (missing.length) throw new Error(`no notes for ${missing.join(", ")}`);
const extra = Object.keys(NOTES).filter((id) => !items.some((li) => li.item.id === id));
if (extra.length) throw new Error(`notes for unknown ids ${extra.join(", ")}`);

// Exact clue repeats across puzzles (case and punctuation ignored).
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const where = new Map<string, string[]>();
for (const li of items) (li.item as ItemOf<"split-clues">).clues.forEach((c, i) => where.set(norm(c), [...(where.get(norm(c)) ?? []), `${li.item.id} clue ${i + 1}`]));
const repeats = [...where.entries()].filter(([, w]) => w.length > 1);

const flagCount = (f: Flag) => items.filter((li) => NOTES[li.item.id]!.flags.some(([x]) => x === f)).length;
const approvedCount = items.filter((li) => li.status === "approved" && !!li.approval).length;
const out: string[] = [];
const p = (s = "") => out.push(s);
p("# Stage 12.16: Split Clues puzzle inventory (for review)");
p();
p(`Generated from the loaded content library by \`scripts/content-quality/split-clues-inventory.ts\` on ${today}. Every id, clue, accepted answer, status and hash below is what the game plays and what an approval must name. ${approvedCount === 0 ? `**No puzzle is approved**: all ${items.length} are \`provisional\`, so they play in casual and Practice games and never in an Official Cup game.` : `**${approvedCount} of ${items.length} puzzles are approved**; the rest play only in casual and Practice games.`}`);
p();
p("The notes are one reader's flags for a person to decide on. Nothing here approves, edits or verifies a puzzle, and **no source was consulted**: a `check` flag means the claim needs a source before approval, not that it is wrong. Authorship, tests, this document and the review handoff are not editorial approval.");
p();
p("## How a puzzle becomes Official");
p();
p("1. A person checks every clue and the accepted answers (and fixes any in the pack first: an edit changes the hash).");
p("2. They approve it: `npm run content:approve -- --reviewer \"Name\" <id>` writes `content/approvals.json` with the item's current hash. (That file does not exist yet: nothing in the library has been approved through it.) Only that record approves a Split Clues puzzle: a `review.status` label in the pack (`approved`, `legacy`, `verified-computed`) approves nothing, is reported by `npm run content:check`, and leaves the puzzle provisional (review 6895557386).");
p("3. `npm run content:check` shows the counts. An approval whose hash no longer matches (the puzzle was edited) is reported and ignored: the puzzle is not Official until approved again. A `rejected` status is never Official and never played.");
p("4. An Official Split Clues game needs 6 approved puzzles this Cup has not used yet, Practice included (a Practice game in the Cup uses its puzzles up too). In a Family Cup only year-round puzzles are dealt (D-S1216-02), so the 13 Christmas puzzles never count toward that six.");
p();
p("## Summary");
p();
p(`| | Everyday | Christmas | All |`);
p(`|---|---|---|---|`);
p(`| Puzzles | ${ever.length} | ${xmas.length} | ${items.length} |`);
p(`| Approved | ${ever.filter((li) => li.status === "approved").length} | ${xmas.filter((li) => li.status === "approved").length} | ${items.filter((li) => li.status === "approved").length} |`);
p(`| Lint errors / warnings | ${issues.filter((i) => i.level === "error" && !lib.items.get(i.itemId ?? "")?.item.season).length} / ${issues.filter((i) => i.level === "warn" && !lib.items.get(i.itemId ?? "")?.item.season).length} | ${issues.filter((i) => i.level === "error" && lib.items.get(i.itemId ?? "")?.item.season).length} / ${issues.filter((i) => i.level === "warn" && lib.items.get(i.itemId ?? "")?.item.season).length} | ${issues.filter((i) => i.level === "error").length} / ${issues.filter((i) => i.level === "warn").length} |`);
p();
p("Puzzles carrying each flag (a puzzle can carry several):");
p();
p("| Flag | Meaning | Puzzles |");
p("|---|---|---|");
p(`| giveaway | one clue alone (often the last) names or nearly names the answer, so its holder can answer without the team | ${flagCount("giveaway")} |`);
p(`| check | a factual claim that needs a source (or softer wording) before approval | ${flagCount("check")} |`);
p(`| ambiguous | a reasonable answer the matcher refuses, or another answer that fits the clues | ${flagCount("ambiguous")} |`);
p(`| weak | a clue that adds nothing, or a puzzle that is very easy | ${flagCount("weak")} |`);
p(`| local | assumes East African (or British) knowledge | ${flagCount("local")} |`);
p(`| repeat | the same clue wording appears in another puzzle | ${flagCount("repeat")} |`);
p(`| none | no flag | ${items.filter((li) => NOTES[li.item.id]!.flags.length === 0).length} |`);
p();
p("Every puzzle's `difficulty` is a placeholder (2): the code bank had none. Official selection keeps the pool's difficulty mix and spreads categories (`src/content/select.ts`), so until a reviewer sets real difficulties that balancing does nothing for Split Clues. Every puzzle's `source` is `original-creative` (written for this app), and none has a recorded source check.");
p();
if (repeats.length) {
  p("Exact clue repeats across puzzles: " + repeats.map(([, w]) => w.join(" = ")).join("; ") + ".");
  p();
}
p("**Lint** (`npm run content:check`): " + (issues.length ? issues.map((i) => `${i.itemId} ${i.code} (${i.level})`).join("; ") : "none") + ".");
p();
p("**Matcher probe**: each puzzle lists plausible typed answers and whether the real matcher (`answerMatches` in `src/games/modules/teamKit.ts`: case, accents, punctuation, a leading article and a plural ignored; one typo forgiven from 7 letters) accepts them. A refusal pauses that team's answer box for 4 s and uses one of its 15 tries for the round, so a refused reasonable answer costs time (and, in the end, a try).");
p();
const section = (title: string, list: typeof items) => {
  p(`## ${title} (${list.length})`);
  p();
  for (const li of list) {
    const it = li.item as ItemOf<"split-clues">;
    const n = NOTES[it.id]!;
    p(`### ${it.id} · ${it.answer}`);
    p();
    p(`- **Kind** ${it.kind} · **season** ${it.season ?? "year-round"} · **status** ${li.status} · **difficulty** ${it.difficulty} (placeholder) · **category** ${it.category}`);
    p(`- **Accepted** ${[it.answer, ...(it.alts ?? [])].map((a) => `"${a}"`).join(", ")}`);
    p(`- **Approval hash** \`${li.hash}\` (pack \`${li.packId}\` ${li.packVersion}) · **approval record** ${li.approval ? `${li.approval.reviewer}, ${li.approval.date}` : "none"}`);
    p(`- **Clues** ${it.clues.map((c, i) => `(${i + 1}) ${c}`).join(" ")}`);
    const lint = issues.filter((i) => i.itemId === it.id);
    if (lint.length) p(`- **Lint** ${lint.map((i) => `${i.code}: ${i.message}`).join("; ")}`);
    if (n.tries?.length) p(`- **Probe** ${n.tries.map((t) => `"${t}" ${answerMatches([it.answer, ...(it.alts ?? [])], t) ? "accepted" : "refused"}`).join(", ")}`);
    p(`- **Flags** ${n.flags.length ? n.flags.map(([f, note]) => `\`${f}\` ${note}`).join(" ") : "none"}`);
    p();
  }
};
section("Everyday puzzles", ever);
section("Christmas puzzles", xmas);
process.stdout.write(out.join("\n"));
