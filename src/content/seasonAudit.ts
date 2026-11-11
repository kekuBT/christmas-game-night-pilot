/**
 * Stage 8.2 (docs/stage8/stage82.md §3.2, §8): an editorial safety net,
 * never a filter. Selection reads only an item's `season` tag. This finds
 * UNTAGGED items whose words look Christmas-specific, so a new Christmas item
 * can't reach Everyday play unnoticed: `npm run content:check` reports each
 * as a warning until it is tagged `season: "christmas"`, or reviewed and
 * listed below as year-round. tests/stage82-seasonal.test.ts keeps the
 * shipped library free of such warnings.
 *
 * Server-only (it reads answers), like the rest of src/content.
 */
import { DRAW_PROMPTS } from "../games/modules/packs/draw-prompts.js";
import type { ContentLibrary } from "./registry.js";

/** Words only Christmas has (winter, snow, presents, December and turkey are year-round on their own). */
export const CHRISTMAS_WORDS = /\b(christmas|xmas|santa|reindeer|rudolph|sleighs?|mistletoe|nativity|tinsel|baubles?|wreaths?|crackers?|mince pies?|candy canes?|gingerbread|eggnog|stockings?|advent|yule|noel|nutcracker|scrooge|grinch|jingle|carols?|festive|twelve days|north pole|elf|elves)\b/i;

/**
 * Untagged items whose words match, reviewed and kept year-round (§8), each
 * with the reason. Anything else that matches is a warning.
 */
export const REVIEWED_YEAR_ROUND: Readonly<Record<string, string>> = {
  "trv-arts-061": "The Nutcracker's composer: a ballet question",
  "year-s4-015": "the first SMS: a technology fact (its note quotes the message)",
  "spr-s4-008": "things that are cold: the North Pole is one answer among many",
};

export interface SeasonAuditFinding { source: "pack" | "draw-prompts"; gameId: string; itemId: string; words: string[] }

const wordsIn = (text: string): string[] => [...new Set((text.match(new RegExp(CHRISTMAS_WORDS.source, "gi")) ?? []).map((w) => w.toLowerCase()))];

/** Untagged items with Christmas words that aren't on the reviewed list. */
export function seasonAuditFindings(lib: ContentLibrary): SeasonAuditFinding[] {
  const out: SeasonAuditFinding[] = [];
  for (const li of lib.items.values()) {
    if (li.item.season !== undefined || li.item.id in REVIEWED_YEAR_ROUND) continue;
    const { review: _r, source: _s, id: _i, ...shown } = li.item as unknown as Record<string, unknown>;
    void _r; void _s; void _i;
    const words = wordsIn(JSON.stringify(shown));
    if (words.length) out.push({ source: "pack", gameId: li.gameId, itemId: li.item.id, words });
  }
  for (const p of DRAW_PROMPTS) {
    if (p.season !== undefined || p.id in REVIEWED_YEAR_ROUND) continue;
    const words = wordsIn([p.word, ...(p.alts ?? [])].join(" "));
    if (words.length) out.push({ source: "draw-prompts", gameId: "draw-guess", itemId: p.id, words });
  }
  return out.sort((a, b) => a.itemId.localeCompare(b.itemId));
}
