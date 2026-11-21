/**
 * Handoff 7059278886: the Jebena Rush results, rendered, explain each total. The real phone results
 * (MchezoJebenaResults) and the TV's final standings (JebenaTvFinal) render the server's standings: every row says
 * how its points were earned ("Outlasted 1 player (100) + 2 whole cups (20) = 120") and, apart, how the player played
 * ("Played: 9 answers · 5 timeouts"). The points cell is the server's total, unchanged. An older server's standings
 * (no parts) show the total and the played line only, as before.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JebenaTvFinal, MchezoJebenaResults } from "./MchezoJebena.js";
import type { JebenaStanding } from "../../ui/mchezo/lib/jebena.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

const player = (id: string, displayName: string): PublicPlayer => ({ id, displayName, avatar: "🙂", isHost: id === "k", isCohost: false, connected: true });
const PLAYERS = [player("k", "Keku"), player("a", "Amina"), player("b", "Baraka")];
const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.displayName ?? id;

function games(standings: JebenaStanding[], startHearts = 5) {
  const state = { startHearts, end: "last-standing", standings, log: [], order: [] };
  const rawScores = Object.fromEntries(standings.map((r) => [r.id, r.points]));
  const players = standings.map((r) => r.id);
  const pub = { id: "g1", gameId: "jebena-rush", official: false, status: "finished", timedOut: false, players, rawScores, state } as PublicGame;
  const mine = { ...pub, participant: true, myAnswers: {}, myScore: 0 } as unknown as PlayerGame;
  return { pub, mine };
}
const text = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();
/** Each rendered row: its points cell, its breakdown and its played line. */
function rows(html: string) {
  return [...html.matchAll(/<li[^>]*data-testid="jr-row-([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map(([, id, li]) => ({
    id,
    pts: text(/<b class="mz-jr-row__pts">([\s\S]*?)<\/b>/.exec(li!)?.[1] ?? ""),
    why: /data-testid="jr-why-/.test(li!) ? text(/<span class="mz-jr-row__why"[^>]*>([\s\S]*?)<\/span>/.exec(li!)?.[1] ?? "") : null,
    played: text(/<span class="mz-jr-row__played"[^>]*>([\s\S]*?)<\/span>/.exec(li!)?.[1] ?? ""),
  }));
}
const phone = (standings: JebenaStanding[], startHearts?: number) => {
  const { pub, mine } = games(standings, startHearts);
  return renderToStaticMarkup(<MchezoJebenaResults game={mine} publicGame={pub} players={PLAYERS} playerId="a" title="Jebena Rush" onBackToLobby={() => {}} />);
};
const tv = (standings: JebenaStanding[], startHearts?: number) => renderToStaticMarkup(<JebenaTvFinal game={games(standings, startHearts).pub} title="Jebena Rush" nameOf={nameOf} />);

const ROW = (over: Partial<JebenaStanding> & { id: string }): JebenaStanding => ({ place: 1, hearts: 0, out: false, satOut: false, answers: 0, timeouts: 0, points: 0, ...over });
/** The verified 120–0 (tests/jebena-points-explained.test.ts plays it through a room). */
const ONE_TWENTY_ZERO = [
  ROW({ id: "k", place: 1, hearts: 2, answers: 10, timeouts: 3, outlasted: 1, points: 120 }),
  ROW({ id: "a", place: 2, out: true, answers: 9, timeouts: 5, outlasted: 0, points: 0 }),
];

describe("handoff 7059278886: phone and TV results explain each total", () => {
  for (const [surface, render] of [["phone", phone], ["tv", tv]] as const) {
    it(`${surface}: the 120–0, row by row, with answers as a separate participation stat`, () => {
      const html = render(ONE_TWENTY_ZERO);
      expect(rows(html)).toEqual([
        { id: "k", pts: "120", why: "Outlasted 1 player (100) + 2 whole cups (20) = 120", played: "Played: 10 answers · 3 timeouts" },
        { id: "a", pts: "0", why: "Outlasted nobody (0) + no whole cups (0) = 0", played: "Played: 9 answers · 5 timeouts" },
      ]);
    });

    it(`${surface}: a tie (two still in, the same cups) and an early exit (left first)`, () => {
      const html = render([
        ROW({ id: "k", place: 1, hearts: 3, answers: 6, timeouts: 0, outlasted: 1, points: 130 }),
        ROW({ id: "a", place: 1, hearts: 3, answers: 5, timeouts: 0, outlasted: 1, points: 130 }),
        ROW({ id: "b", place: 3, out: true, satOut: true, answers: 0, timeouts: 0, outlasted: 0, points: 0 }),
      ], 3);
      const r = rows(html);
      expect(r.map((x) => [x.id, x.pts, x.why])).toEqual([
        ["k", "130", "Outlasted 1 player (100) + 3 whole cups (30) = 130"],
        ["a", "130", "Outlasted 1 player (100) + 3 whole cups (30) = 130"],
        ["b", "0", "Outlasted nobody (0) + no whole cups (0) = 0"],
      ]);
      expect(text(html)).toContain("Left the game");
    });

    it(`${surface}: an older server's standings (no parts): the total and the played line, no breakdown`, () => {
      const r = rows(render(ONE_TWENTY_ZERO.map((row) => { const older: Partial<JebenaStanding> = { ...row }; delete older.outlasted; return older as JebenaStanding; })));
      expect(r.map((x) => [x.pts, x.why, x.played])).toEqual([["120", null, "Played: 10 answers · 3 timeouts"], ["0", null, "Played: 9 answers · 5 timeouts"]]);
    });
  }

  it("phone: the footer explains the rule, says answers add no points, and keeps the casual label", () => {
    const foot = text(/<p class="mz-foot" data-testid="jr-howscore">([\s\S]*?)<\/p>/.exec(phone(ONE_TWENTY_ZERO))?.[1] ?? "");
    expect(foot).toBe("100 points for each player you outlast, plus 10 for every cup still whole. Right answers keep you in the game; they don't add points. Practice game: no Cup points.");
  });
});
