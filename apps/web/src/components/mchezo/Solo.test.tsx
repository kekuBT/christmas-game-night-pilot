/**
 * Solo rules first (handoff 7029967180, D-SR-01). The shelf's action opens a game's instructions; it no longer
 * promises (or starts) a round. Every way into /solo/<game> lands on those instructions, whose one Start begins the
 * round. These static renders pin the labels and the instructions screen for all three solo games. That opening the
 * page creates no round and starts no clock (no request at all until Start), from the shelf, a direct URL, a reload
 * or Back, is checked in a real browser against the server by scripts/check-solo-rules.mjs, which fails on the old
 * auto-start.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GAME_MANIFESTS } from "../../../../../src/games/manifest.js";
import { buildCatalog } from "../../ui/mchezo/lib/catalog.js";
import { soloAdapter } from "../../solo/soloGames.js";
import { SoloHome, SoloRound, soloShelf } from "./Solo.js";

const catalog = buildCatalog(GAME_MANIFESTS);
const shelf = soloShelf(catalog);
const noop = () => {};
/** The text inside the element with this data-testid (first match), tags stripped. */
function textOf(html: string, testId: string): string | null {
  const m = new RegExp(`data-testid="${testId}"[^>]*>(.*?)</(button|p|main)>`, "s").exec(html);
  return m ? m[1]!.replace(/<[^>]+>/g, "").trim() : null;
}

describe("D-SR-01: the solo shelf opens a game's instructions", () => {
  it("the shelf has the three solo games", () => {
    expect(shelf.map((g) => g.id)).toEqual(["math-mayhem", "pattern-pulse", "word-connections"]);
  });

  it("each game's action says How to play (not Start), and names the game for screen readers", () => {
    const html = renderToStaticMarkup(<SoloHome catalog={catalog} onOpen={noop} onBack={noop} onHost={noop} />);
    for (const g of shelf) {
      expect(textOf(html, `solo-start-${g.id}`), g.id).toBe("How to play");
      expect(html).toContain(`aria-label="${g.title}: how to play"`);
    }
    expect(html).not.toMatch(/aria-label="Start /);
    expect(html).not.toMatch(/>Start</);
  });
});

describe("D-SR-01: /solo/<game> is the game's instructions with one Start", () => {
  for (const id of ["math-mayhem", "pattern-pulse", "word-connections"]) {
    it(`${id}: instructions, the personal best and one Start; no round on screen`, () => {
      const game = shelf.find((g) => g.id === id)!;
      const html = renderToStaticMarkup(<SoloRound game={game} onBackToSolo={noop} onHome={noop} store={null} />);
      expect(html).toContain('data-testid="solo-ready"');
      expect(textOf(html, "solo-howto")).toBe(soloAdapter(id)!.howToPlay.replace(/&/g, "&amp;"));
      expect(textOf(html, "solo-round-start")).toBe("Start");
      expect(html.match(/data-testid="solo-round-start"/g)).toHaveLength(1);
      expect(html).not.toContain('data-testid="solo-round"');
      expect(html).not.toContain('data-testid="solo-starting"');
    });
  }
});
