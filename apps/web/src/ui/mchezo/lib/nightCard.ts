/**
 * Stage 12.6 (docs/stage12/stage126.md): the night card, a picture of tonight to share with the family (a WhatsApp
 * group, a status). Pure facts here, drawn on a canvas on the phone (nightCardDraw.ts); nothing leaves the phone
 * unless the person shares or saves it.
 *
 * Public facts only, the same every screen in the room already shows after a game: game titles, results from
 * recorded scores, the night's medal table (lib/medals.ts), and in a Family Cup its day, standings and champion. Never
 * Memory Book notes, answers, Family Questions, the room code or anything private to one phone.
 */
import { medalTable, type MedalGame } from "./medals.js";
import { resultLine } from "./tvfeed.js";

export interface NightCardGame extends MedalGame {
  gameId: string;
  rawScores?: Record<string, number>;
  outcome?: { team?: { total: number; max: number } } | null;
}

export interface NightCardInput {
  games: readonly NightCardGame[];
  nameOf: (playerId: string) => string;
  titleOf: (gameId: string) => string;
  /** This phone's look: the card's title and colours follow it, never its facts. */
  christmas: boolean;
  /** The day it's made, on this phone. */
  now: Date;
  locale?: string;
  /** A Family Cup's facts (absent in a casual room). */
  cup?: { day: number; standings: readonly { playerId: string; displayName?: string; total: number }[]; champions?: readonly string[] };
}

export interface NightCardFacts {
  title: string;
  dateLine: string;
  summary: string;
  /** Up to five rows, best first; more beyond them are counted, not dropped silently. */
  medals: { name: string; gold: number; silver: number; bronze: number }[];
  moreMedalRows: number;
  /** The last six games, oldest first. */
  games: { title: string; line: string }[];
  moreGames: number;
  /** A finished Family Cup's champion line. */
  champion?: string;
  /** A Family Cup's top five, by total (0 included, as on the TV). */
  standings?: { name: string; total: number }[];
}

export const NIGHT_CARD_LIMITS = { medals: 5, games: 6, standings: 5 } as const;

const list = (names: readonly string[]) => names.length <= 1 ? names.join("") : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** The card's facts, or null when there's nothing to tell yet (no finished game). Pure. */
export function nightCardFacts(input: NightCardInput): NightCardFacts | null {
  const finished = input.games.filter((g) => g.status === "finished");
  if (finished.length === 0) return null;
  const table = medalTable(finished, input.nameOf);
  const players = new Set(finished.flatMap((g) => Object.keys(g.rawScores ?? {})));
  const dateLine = input.now.toLocaleDateString(input.locale ?? undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const facts: NightCardFacts = {
    title: input.cup ? (input.christmas ? "Our Christmas Family Cup" : "Our Family Cup") : input.christmas ? "Our Christmas game night" : "Our game night",
    dateLine: input.cup ? `${dateLine} · Day ${Math.min(7, Math.max(1, input.cup.day))} of 7` : dateLine,
    summary: `${finished.length} ${finished.length === 1 ? "game" : "games"} · ${players.size} ${players.size === 1 ? "player" : "players"}`,
    // A Family Cup's card tells its standings instead: medals are a casual night's story (D-S121-05).
    medals: input.cup ? [] : table.rows.slice(0, NIGHT_CARD_LIMITS.medals).map((r) => ({ name: input.nameOf(r.playerId), gold: r.gold, silver: r.silver, bronze: r.bronze })),
    moreMedalRows: input.cup ? 0 : Math.max(0, table.rows.length - NIGHT_CARD_LIMITS.medals),
    games: finished.slice(-NIGHT_CARD_LIMITS.games).map((g) => ({ title: input.titleOf(g.gameId), line: resultLine({ rawScores: g.rawScores, ...(g.outcome ? { outcome: g.outcome } : {}) }, input.nameOf) })),
    moreGames: Math.max(0, finished.length - NIGHT_CARD_LIMITS.games),
  };
  if (input.cup) {
    const nameIn = (r: { playerId: string; displayName?: string }) => r.displayName ?? input.nameOf(r.playerId);
    // Everyone in the standings, as the TV lists them: 0 points is a standing too.
    facts.standings = [...input.cup.standings].sort((a, b) => b.total - a.total).slice(0, NIGHT_CARD_LIMITS.standings).map((r) => ({ name: nameIn(r), total: r.total }));
    const champs = (input.cup.champions ?? []).map((id) => nameIn(input.cup!.standings.find((r) => r.playerId === id) ?? { playerId: id }));
    if (champs.length > 0) facts.champion = champs.length === 1 ? `${champs[0]} is the Family Cup champion` : `${list(champs)} share the Family Cup`;
  }
  return facts;
}

/** The card as plain text, for screen readers and the share message: the same facts the picture shows. */
export function nightCardText(f: NightCardFacts): string {
  const lines = [f.title, f.dateLine, f.summary];
  if (f.champion) lines.push(`🏆 ${f.champion}`);
  if (f.standings?.length) lines.push(`Standings: ${f.standings.map((s) => `${s.name} ${s.total}`).join(", ")}`);
  if (f.medals.length) lines.push(`Medals: ${f.medals.map((m) => `${m.name} ${"🥇".repeat(m.gold)}${"🥈".repeat(m.silver)}${"🥉".repeat(m.bronze)}`).join(", ")}`);
  for (const g of f.games) lines.push(`${g.title}: ${g.line}`);
  if (f.moreGames > 0) lines.push(`…and ${f.moreGames} more ${f.moreGames === 1 ? "game" : "games"}`);
  return lines.join("\n");
}

/** The file's name: what it is and the day, never the room code. */
export function nightCardFilename(now: Date, christmas: boolean, cup: boolean): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${christmas ? "christmas-" : "mchezo-"}${cup ? "family-cup" : "game-night"}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.png`;
}
