/**
 * Handoff 7065498313 (D-UI-02): the compact Jebena Rush results. The podium shows the server's standings as given
 * (places and points unchanged, ties raised together, the full name), and the results dock gives the host one big
 * next step plus More…, and everyone else Back to lobby.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MchezoJebenaResults } from "./MchezoJebena.js";
import { WhatsNext, type WhatsNextProps } from "./WhatsNext.js";
import type { JebenaStanding } from "../../ui/mchezo/lib/jebena.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

const player = (id: string, displayName: string): PublicPlayer => ({ id, displayName, avatar: "🙂", isHost: id === "k", isCohost: false, connected: true });
const PLAYERS = [player("k", "Keku"), player("a", "Amina Wolde-Mariam Tesfaye"), player("b", "Baraka"), player("c", "Keku Jr")];
const ROW = (over: Partial<JebenaStanding> & { id: string }): JebenaStanding => ({ place: 1, hearts: 0, out: false, satOut: false, answers: 0, timeouts: 0, outlasted: 0, points: 0, ...over });

function results(standings: JebenaStanding[], me = "a", next?: string) {
  const state = { startHearts: 3, end: "last-standing", standings, log: [], order: [] };
  const pub = { id: "g1", gameId: "jebena-rush", official: false, status: "finished", timedOut: false, players: standings.map((r) => r.id), rawScores: Object.fromEntries(standings.map((r) => [r.id, r.points])), state } as PublicGame;
  const mine = { ...pub, participant: true, myAnswers: {}, myScore: 0 } as unknown as PlayerGame;
  return renderToStaticMarkup(<MchezoJebenaResults game={mine} publicGame={pub} players={PLAYERS} playerId={me} title="Jebena Rush" onBackToLobby={() => {}}
    hero={<section data-testid="results-hero">result</section>} next={next ? <p data-testid="next-slot">{next}</p> : undefined} />);
}
/** The podium's steps, left to right: id, place, the class list and the accessible name. */
function podium(html: string) {
  const ol = /<ol[^>]*data-testid="jr-podium"[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1];
  if (!ol) return null;
  return [...ol.matchAll(/<li class="([^"]*)" data-testid="jr-podium-([^"]+)" data-place="(\d+)" aria-label="([^"]*)">([\s\S]*?)<\/li>/g)].map(([, cls, id, place, label, inner]) => ({
    id, place: Number(place), top: cls!.includes("--top"), you: cls!.includes("--you"), label: label!.replace(/&#x27;/g, "'"),
    shown: inner!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));
}

describe("D-UI-02: the Jebena Rush podium shows the server's standings", () => {
  it("three players: second, first, third, left to right; the server's places and points; the winner raised", () => {
    const p = podium(results([
      ROW({ id: "k", place: 1, hearts: 3, outlasted: 2, points: 230, answers: 2 }),
      ROW({ id: "b", place: 2, out: true, outlasted: 1, points: 100, timeouts: 3 }),
      ROW({ id: "a", place: 3, out: true, outlasted: 0, points: 0, timeouts: 3 }),
    ]));
    expect(p?.map((s) => [s.id, s.place, s.top])).toEqual([["b", 2, false], ["k", 1, true], ["a", 3, false]]);
    expect(p?.[1]?.label).toBe("1st: Keku, 230 points");
    expect(p?.[2]).toMatchObject({ you: true, label: "3rd: Amina Wolde-Mariam Tesfaye (you), 0 points" });
    // The full name shows (two players can share a first name), with the points and the place.
    expect(p?.[2]?.shown).toBe("Amina Wolde-Mariam Tesfaye (you) 0 3rd");
  });

  it("a tie at the top: both 1st places are raised, and the places stay the server's", () => {
    const p = podium(results([
      ROW({ id: "k", place: 1, hearts: 3, outlasted: 1, points: 130 }),
      ROW({ id: "c", place: 1, hearts: 3, outlasted: 1, points: 130 }),
      ROW({ id: "a", place: 3, out: true, satOut: true, points: 0 }),
    ]));
    expect(p?.map((s) => [s.id, s.place, s.top])).toEqual([["c", 1, true], ["k", 1, true], ["a", 3, false]]);
    expect(p?.map((s) => s.label)).toEqual(["1st: Keku Jr, 130 points", "1st: Keku, 130 points", "3rd: Amina Wolde-Mariam Tesfaye (you), 0 points"]);
  });

  it("an early exit: the one who left is on the podium with the 0 the server gave, never re-ranked", () => {
    const p = podium(results([
      ROW({ id: "b", place: 1, hearts: 2, outlasted: 1, points: 120 }),
      ROW({ id: "k", place: 2, satOut: true, points: 0 }),
    ], "k"));
    expect(p?.map((s) => [s.id, s.place, s.top, s.you])).toEqual([["k", 2, false, true], ["b", 1, true, false]]);
  });

  it("one player: no podium (the standings say it all)", () => {
    expect(podium(results([ROW({ id: "k", place: 1, hearts: 3, points: 30 })], "k"))).toBeNull();
  });

  it("the results keep their order: the result, the podium, the explained standings; the dock holds What's next", () => {
    const html = results([ROW({ id: "k", place: 1, hearts: 3, outlasted: 1, points: 130 }), ROW({ id: "a", place: 2, out: true, points: 0 })], "a", "next");
    const at = (id: string) => html.indexOf(`data-testid="${id}"`);
    expect(at("results-hero")).toBeGreaterThan(-1);
    expect(at("results-hero")).toBeLessThan(at("jr-podium"));
    expect(at("jr-podium")).toBeLessThan(at("jr-standings"));
    expect(at("jr-standings")).toBeLessThan(at("jr-results-dock"));
    expect(at("jr-results-dock")).toBeLessThan(at("next-slot"));
  });
});

const NEXT: WhatsNextProps = {
  isHost: true, hostName: "Keku", game: { id: "g1", gameId: "jebena-rush", title: "Jebena Rush" }, canPlayAgain: true, lineup: null, onBreak: false,
  titleOf: (id) => (id === "trivia" ? "Trivia Showdown" : id), onNext: () => {}, onPlayAgain: () => {}, onBreakChange: () => {}, onChoose: () => {},
  content: "everyday", variant: "dock", onBackToLobby: () => {},
};
const ids = (html: string) => [...html.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);

describe("D-UI-02: What's next as the results dock", () => {
  it("host: Play again is the one big button; More… holds the rest; Back to lobby is not in the dock", () => {
    const html = renderToStaticMarkup(<WhatsNext {...NEXT} />);
    expect(ids(html)).toEqual(["whats-next", "next-play-again", "next-more", "whats-next-content"]);
    expect(html).toContain('data-variant="dock"');
    expect(html).toMatch(/data-testid="next-more"[^>]*aria-haspopup="dialog"/);
  });

  it("guest: who picks next, and Back to lobby", () => {
    const html = renderToStaticMarkup(<WhatsNext {...NEXT} isHost={false} />);
    expect(ids(html)).toEqual(["whats-next", "next-status", "show-back-to-lobby", "whats-next-content"]);
    expect(html).toContain("Keku picks what’s next.");
  });

  it("host with a lineup: Next game is the big button; on a break: Resume", () => {
    const lineup = { items: [{ gameId: "jebena-rush" }, { gameId: "trivia" }], next: 1, complete: false } as unknown as WhatsNextProps["lineup"];
    expect(ids(renderToStaticMarkup(<WhatsNext {...NEXT} lineup={lineup} />))).toEqual(["whats-next", "next-status", "next-game", "next-more", "whats-next-content"]);
    expect(ids(renderToStaticMarkup(<WhatsNext {...NEXT} onBreak />))).toEqual(["whats-next", "next-status", "next-resume", "next-more", "whats-next-content"]);
  });

  it("the panel (every other game) is unchanged: no dock variant", () => {
    const html = renderToStaticMarkup(<WhatsNext {...NEXT} variant={undefined} />);
    expect(html).not.toContain('data-variant="dock"');
    expect(ids(html)).toContain("next-play-again");
    expect(ids(html)).toContain("next-choose");
  });
});
