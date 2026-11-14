// Stage 12.6 (docs/stage12/stage126.md): the night card's facts (pure) and its drawing (on a recording canvas).
import { describe, expect, it } from "vitest";
import { NIGHT_CARD_LIMITS, nightCardFacts, nightCardFilename, nightCardText, type NightCardGame } from "../apps/web/src/ui/mchezo/lib/nightCard.js";
import { drawNightCard, NIGHT_CARD_SIZE } from "../apps/web/src/ui/mchezo/lib/nightCardDraw.js";

const names: Record<string, string> = { a: "Keku", b: "Amina", c: "Baraka", d: "Wanjiru" };
const nameOf = (id: string) => names[id] ?? "A player";
const titles: Record<string, string> = { trivia: "Trivia Showdown", "math-mayhem": "Math Mayhem", spectrum: "Spectrum" };
const titleOf = (id: string) => titles[id] ?? id;
const NOW = new Date(2026, 10, 14, 21, 30);
const game = (id: string, gameId: string, rawScores: Record<string, number>, extra: Partial<NightCardGame> = {}): NightCardGame => ({ id, gameId, status: "finished", rawScores, ...extra });

describe("the night card's facts", () => {
  it("nothing to tell before a game has finished", () => {
    expect(nightCardFacts({ games: [{ id: "g1", gameId: "trivia", status: "playing" }], nameOf, titleOf, christmas: false, now: NOW })).toBeNull();
  });

  it("a casual night: title, date, counts, medals and every game's result line", () => {
    const f = nightCardFacts({
      games: [
        game("g1", "trivia", { a: 300, b: 200, c: 100 }),
        game("g2", "math-mayhem", { a: 50, b: 90 }),
        game("g3", "spectrum", { a: 0, b: 0, c: 0 }, { outcome: { team: { total: 28, max: 40 } } }),
        { id: "g4", gameId: "trivia", status: "playing" },
      ], nameOf, titleOf, christmas: false, now: NOW, locale: "en-US",
    })!;
    expect(f.title).toBe("Our game night");
    expect(f.dateLine).toBe("Saturday, November 14, 2026");
    expect(f.summary).toBe("3 games · 3 players");
    // Equal medals: the TV's own order (by name), so Amina before Keku.
    expect(f.medals).toEqual([{ name: "Amina", gold: 1, silver: 1, bronze: 0 }, { name: "Keku", gold: 1, silver: 1, bronze: 0 }, { name: "Baraka", gold: 0, silver: 0, bronze: 1 }]);
    expect(f.games).toEqual([
      { title: "Trivia Showdown", line: "Keku wins" },
      { title: "Math Mayhem", line: "Amina wins" },
      { title: "Spectrum", line: "Team result: 28 out of 40" },
    ]);
    expect(f.standings).toBeUndefined();
    expect(f.champion).toBeUndefined();
  });

  it("the look changes the title, never a fact", () => {
    const input = { games: [game("g1", "trivia", { a: 3, b: 1 })], nameOf, titleOf, now: NOW, locale: "en-US" };
    const every = nightCardFacts({ ...input, christmas: false })!;
    const xmas = nightCardFacts({ ...input, christmas: true })!;
    expect(xmas.title).toBe("Our Christmas game night");
    expect({ ...xmas, title: "" }).toEqual({ ...every, title: "" });
  });

  it("long nights are cut with a count, never silently", () => {
    const games = Array.from({ length: 9 }, (_, i) => game(`g${i}`, "trivia", { a: 10 + i, b: 5 }));
    const f = nightCardFacts({ games, nameOf, titleOf, christmas: false, now: NOW })!;
    expect(f.games).toHaveLength(NIGHT_CARD_LIMITS.games);
    expect(f.moreGames).toBe(3);
    expect(nightCardText(f)).toMatch(/…and 3 more games/);
  });

  it("a Family Cup: its day, its standings (top five, with points, 0 included) and its champion; no medals", () => {
    const f = nightCardFacts({
      games: [game("g1", "trivia", { a: 300, b: 200 })], nameOf, titleOf, christmas: false, now: NOW, locale: "en-US",
      cup: { day: 7, standings: [{ playerId: "b", total: 90 }, { playerId: "a", total: 120, displayName: "Keku" }, { playerId: "c", total: 0 }], champions: ["a"] },
    })!;
    expect(f.title).toBe("Our Family Cup");
    expect(f.dateLine).toMatch(/· Day 7 of 7$/);
    expect(f.standings).toEqual([{ name: "Keku", total: 120 }, { name: "Amina", total: 90 }, { name: "Baraka", total: 0 }]);
    expect(f.champion).toBe("Keku is the Family Cup champion");
    expect(f.medals).toEqual([]);
    const shared = nightCardFacts({ games: [game("g1", "trivia", { a: 1, b: 1 })], nameOf, titleOf, christmas: false, now: NOW, cup: { day: 7, standings: [{ playerId: "a", total: 5 }, { playerId: "b", total: 5 }], champions: ["a", "b"] } })!;
    expect(shared.champion).toBe("Keku and Amina share the Family Cup");
  });

  it("the text says what the picture shows, and the file name never has the room code", () => {
    const f = nightCardFacts({ games: [game("g1", "trivia", { a: 3, b: 1 })], nameOf, titleOf, christmas: false, now: NOW, locale: "en-US" })!;
    expect(nightCardText(f).split("\n")).toEqual(["Our game night", "Saturday, November 14, 2026", "1 game · 2 players", "Medals: Keku 🥇, Amina 🥈", "Trivia Showdown: Keku wins"]);
    expect(nightCardFilename(NOW, false, false)).toBe("mchezo-game-night-2026-11-14.png");
    expect(nightCardFilename(NOW, true, true)).toBe("christmas-family-cup-2026-11-14.png");
  });
});

describe("drawing the card", () => {
  /** A canvas that records what was written and where, measuring text at a fixed width per character. */
  function recorder() {
    const texts: { text: string; x: number; y: number; font: string }[] = [];
    let font = "";
    let ty = 0;
    const stack: number[] = [];
    const ctx = {
      set font(v: string) { font = v; }, get font() { return font; },
      save() { stack.push(ty); }, restore() { ty = stack.pop() ?? 0; }, translate(_x: number, y: number) { ty += y; },
      fillStyle: "", strokeStyle: "", lineWidth: 1, textBaseline: "alphabetic",
      fillRect() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {},
      measureText: (t: string) => ({ width: t.length * (Number(/(\d+)px/.exec(font)?.[1] ?? 30) * 0.55) }),
      fillText: (text: string, x: number, y: number) => { texts.push({ text, x, y: y + ty, font }); },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
  }
  const look = { ground: "#000", surface: "#111", line: "#222", text: "#fff", muted: "#ccc", accent: "#f60", highlight: "#fc0", onAccent: "#000" };

  it("every fact is written, inside the card, and nothing runs off its edges", () => {
    const long = { a: "Bibi Wanjiku wa Kamau the Magnificent", b: "Amina", c: "Baraka" } as Record<string, string>;
    const games = Array.from({ length: 8 }, (_, i) => game(`g${i}`, "trivia", i % 2 ? { a: 5, b: 5, c: 1 } : { a: 10, b: 5, c: 1 }));
    const f = nightCardFacts({ games, nameOf: (id) => long[id] ?? id, titleOf, christmas: true, now: NOW, locale: "en-US" })!;
    const { ctx, texts } = recorder();
    drawNightCard(ctx, f, look, true);
    const all = texts.map((t) => t.text).join("\n");
    // The title may wrap onto two lines (at most two).
    expect(all.replace(/\n/g, " ")).toMatch(/🎄 Our Christmas game night/);
    expect(all).toMatch(/Saturday, November 14, 2026/);
    expect(all).toMatch(/8 games · 3 players/);
    expect(all).toMatch(/Played together with mchezo/);
    for (const m of f.medals) expect(all).toContain(m.name.slice(0, 10));
    for (const t of texts) {
      const width = t.text.length * (Number(/(\d+)px/.exec(t.font)?.[1] ?? 30) * 0.55);
      expect(t.x, t.text).toBeGreaterThanOrEqual(0);
      expect(t.x + width, t.text).toBeLessThanOrEqual(NIGHT_CARD_SIZE.width - 40);
      expect(t.y, t.text).toBeLessThanOrEqual(NIGHT_CARD_SIZE.height - 40);
    }
  });

  it("a short night's body moves down from the top, and still ends above the footer", () => {
    const short = nightCardFacts({ games: [game("g1", "trivia", { a: 3, b: 1 })], nameOf, titleOf, christmas: false, now: NOW })!;
    const long = nightCardFacts({ games: Array.from({ length: 9 }, (_, i) => game(`g${i}`, "trivia", { a: 10 + i, b: 5, c: 1, d: 2 })), nameOf, titleOf, christmas: true, now: NOW })!;
    const titleY = (f: typeof short) => { const { ctx, texts } = recorder(); drawNightCard(ctx, f, look, false); return { title: texts.find((t) => t.text.includes("Our"))!.y, last: Math.max(...texts.filter((t) => !t.text.startsWith("Played together")).map((t) => t.y)) }; };
    const a = titleY(short), b = titleY(long);
    expect(a.title).toBeGreaterThan(228 + 100);
    expect(a.last).toBeLessThan(NIGHT_CARD_SIZE.height - 120);
    expect(b.last).toBeLessThan(NIGHT_CARD_SIZE.height - 100);
  });

  it("a Family Cup's card writes the champion and the standings", () => {
    const f = nightCardFacts({ games: [game("g1", "trivia", { a: 3, b: 1 })], nameOf, titleOf, christmas: false, now: NOW, cup: { day: 7, standings: [{ playerId: "a", total: 120 }, { playerId: "b", total: 90 }], champions: ["a"] } })!;
    const { ctx, texts } = recorder();
    drawNightCard(ctx, f, look, false);
    const all = texts.map((t) => t.text).join("\n");
    expect(all).toMatch(/🏆 Keku is the Family Cup champion/);
    expect(all).toMatch(/1\. Keku/);
    expect(all).toMatch(/120 pts/);
  });
});
