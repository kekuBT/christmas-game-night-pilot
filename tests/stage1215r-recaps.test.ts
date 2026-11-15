/**
 * Stage 12.15-R (docs/stage12/stage1215r.md; review 6888718011) R6: the lobby, the TV's recaps and the night card tell
 * a team game by its teams (the server's team results), never teammates as tied players.
 * These tests fail on #39's source (1eafe41); see docs/evidence/stage1215r-local/README.md. (The lobby's summary is a
 * new pure function, lib/lastGame.ts; it is imported inside its own test, so on the old source only that test fails at
 * its import while the others fail on their assertions.)
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newTeamList, teamResults, type GameTeams, type TeamResultRow } from "../src/shared/teams.js";
import { RoomEngine } from "../src/server/room.js";
import { resultLine } from "../apps/web/src/ui/mchezo/lib/tvfeed.js";
import { nightCardFacts, nightCardText } from "../apps/web/src/ui/mchezo/lib/nightCard.js";
import { RELAY_LEGS, type RelayState } from "../src/games/modules/relay.js";

type Json = Record<string, unknown>;
const CORAL = "team-coral", SUN = "team-sun", MINT = "team-mint";
const lastGame = async () => (await import("../apps/web/src/ui/mchezo/lib/lastGame.js")).lastGameSummary;

describe("the screens' own lines (Relay's tiebreak, Know Your Rivals' sit-out)", () => {
  const teamName = (id: string) => ({ [CORAL]: "Team Coral", [SUN]: "Team Sun", [MINT]: "Team Mint" })[id] ?? "A team";
  it("Relay: two teams out with the same legs, ranked apart by their last leg, get one plain line; otherwise none", async () => {
    const { relayTiebreakLine } = await import("../apps/web/src/ui/mchezo/lib/teamLines.js");
    const lane = (teamId: string, legs: number, finished = false) => ({ teamId, legs, runnerId: null, frozen: false, finished, score: legs * 10 });
    const row = (teamId: string, rank: number) => ({ teamId, rank });
    expect(relayTiebreakLine([lane(CORAL, 5), lane(SUN, 5)], [row(SUN, 1), row(CORAL, 2)], teamName)).toBe("Team Sun and Team Coral both ran 5 legs; Team Sun finished its last leg first.");
    expect(relayTiebreakLine([lane(CORAL, 5), lane(SUN, 5)], [row(SUN, 1), row(CORAL, 1)], teamName)).toBeNull(); // a true tie
    expect(relayTiebreakLine([lane(CORAL, 5), lane(SUN, 4)], [row(CORAL, 1), row(SUN, 2)], teamName)).toBeNull();
    expect(relayTiebreakLine([lane(CORAL, 12, true), lane(SUN, 12, true)], [row(CORAL, 1), row(SUN, 2)], teamName)).toBeNull();
  });
  it("Know Your Rivals: the reveal names the teams that sat the guessing out, neutrally, never saying why (review 6889824884)", async () => {
    const { sitOutLine: line } = await import("../apps/web/src/ui/mchezo/lib/teamLines.js");
    const sitOutLine = (_g: unknown, r: Parameters<typeof line>[0]) => line(r, teamName);
    const game = null;
    // passed: how many said "Rather not say"; the rest of a team that didn't answer let the time run out.
    const count = (teamId: string, answered: number, passed = 0) => ({ teamId, answered, a: answered, b: 0, passed });
    const neutral = "Nobody on Team Sun picked either answer this time, so there were no guesses for or about that team.";
    // All "Rather not say", all timed out (the review's case: {answered 0, passed 0}), and a mix: the same neutral line.
    for (const sun of [count(SUN, 0, 2), count(SUN, 0, 0), count(SUN, 0, 1)]) {
      const l = sitOutLine(game, { counts: [count(CORAL, 2), sun], sitOut: [SUN] });
      expect(l).toBe(neutral);
      expect(l).not.toMatch(/Rather not say/);
    }
    expect(sitOutLine(game, { counts: [count(CORAL, 2), count(SUN, 0), count(MINT, 0, 2)], sitOut: [SUN, MINT] })).toBe("Nobody on Team Sun and Team Mint picked either answer this time, so there were no guesses for or about those teams.");
    expect(sitOutLine(game, { counts: [count(CORAL, 2), count(SUN, 1, 1)], sitOut: [] })).toBeNull();
    // A result saved before 12.15-R has no sitOut list: its counts say the same, in the same neutral words.
    expect(sitOutLine(game, { counts: [count(CORAL, 2), count(SUN, 0)] })).toBe(neutral);
  });

  it("an Official game's tiebreak comment: only when the winner is level on points with a team it's placed ahead of (review 6889824884)", async () => {
    const { teamTiebreakQuip } = await import("../apps/web/src/ui/mchezo/lib/teamLines.js");
    const row = (name: string, score: number | null, rank: number | null) => ({ name, score, rank });
    // First place decided by the tiebreak: names the winner and the team it's level with.
    expect(teamTiebreakQuip([row("Team Sun", 50, 1), row("Team Coral", 50, 2)])).toBe("Level on points with Team Coral; Team Sun got there first.");
    expect(teamTiebreakQuip([row("Team Sun", 50, 1), row("Team Coral", 50, 2), row("Team Mint", 50, 3)])).toBe("Level on points with Team Coral and Team Mint; Team Sun got there first.");
    // The review's case: a clear winner (Coral 150), Sun and Mint level further down: no tiebreak comment (it said
    // "Level on points; Team Coral got there first", naming an unrelated winner).
    expect(teamTiebreakQuip([row("Team Coral", 150, 1), row("Team Sun", 50, 2), row("Team Mint", 50, 3)])).toBeNull();
    // A true tie for first (the same place), and ordinary unequal points: none either.
    expect(teamTiebreakQuip([row("Team Sun", 50, 1), row("Team Coral", 50, 1)])).toBeNull();
    expect(teamTiebreakQuip([row("Team Sun", 60, 1), row("Team Coral", 50, 2)])).toBeNull();
    // A team that didn't score is left out.
    expect(teamTiebreakQuip([row("Team Sun", 0, 1), row("Team Coral", null, null)])).toBeNull();
  });
});

const teams2: GameTeams = { list: newTeamList(2), members: { k: CORAL, a: CORAL, b: SUN, w: SUN } };
const names: Record<string, string> = { k: "Keku", a: "Amina", b: "Baraka", w: "Wanjiru" };
const nameOf = (id: string) => names[id] ?? "Someone";
const everyone = () => true;

describe("R6: a team game is told by its teams in the lobby, the TV's recaps and the night card", () => {
  it("resultLine: the team wins or ties; individual and cooperative games unchanged", () => {
    const win = { rawScores: { k: 140, a: 140, b: 150, w: 150 }, teamResults: teamResults(teams2, { k: 140, a: 140, b: 150, w: 150 }, everyone) };
    expect(resultLine(win, nameOf)).toBe("Team Sun wins");
    // Before: "Baraka and Wanjiru tie for first".
    expect(resultLine({ rawScores: win.rawScores }, nameOf)).toBe("Baraka and Wanjiru tie for first");
    const tie = { rawScores: { k: 90, a: 90, b: 90, w: 90 }, teamResults: teamResults(teams2, { k: 90, a: 90, b: 90, w: 90 }, everyone) };
    expect(resultLine(tie, nameOf)).toBe("Every team tied");
    const three: GameTeams = { list: newTeamList(3), members: { k: CORAL, a: SUN, b: MINT } };
    expect(resultLine({ rawScores: { k: 5, a: 5, b: 1 }, teamResults: teamResults(three, { k: 5, a: 5, b: 1 }, everyone) }, nameOf)).toBe("Team Coral and Team Sun tie for first");
    expect(resultLine({ rawScores: { k: 3, a: 1 } }, nameOf)).toBe("Keku wins");
    expect(resultLine({ rawScores: { k: 3 }, outcome: { team: { total: 7, max: 10 } } }, nameOf)).toBe("Team result: 7 out of 10");
  });

  it("the lobby's last game: your team's place, never teammates as tied players; individual and cooperative unchanged", async () => {
    const lastGameSummary = await lastGame();
    const scores = { k: 140, a: 140, b: 150, w: 150 };
    const g = { players: ["k", "a", "b", "w"], rawScores: scores, teams: teams2, teamResults: teamResults(teams2, scores, everyone) };
    expect(lastGameSummary(g, "b", nameOf)).toEqual({ headline: "Team Sun wins", yourLine: "Your team, Team Sun, won · 150 points." });
    expect(lastGameSummary(g, "k", nameOf)).toEqual({ headline: "Team Sun wins", yourLine: "Your team, Team Coral, came 2nd of 2 · 140 points." });
    expect(lastGameSummary(g, "zz", nameOf)).toEqual({ headline: "Team Sun wins", yourLine: "You weren’t in this one." });
    const three: GameTeams = { list: newTeamList(3), members: { k: CORAL, a: SUN, b: MINT } };
    const t3 = { players: ["k", "a", "b"], rawScores: { k: 5, a: 5, b: 1 }, teams: three, teamResults: teamResults(three, { k: 5, a: 5, b: 1 }, everyone) };
    expect(lastGameSummary(t3, "a", nameOf).yourLine).toBe("Your team, Team Sun, tied for first · 5 points.");
    expect(lastGameSummary(t3, "b", nameOf).yourLine).toBe("Your team, Team Mint, came 3rd of 3 · 1 points.");
    const tied = { players: ["k", "a", "b", "w"], rawScores: { k: 9, a: 9, b: 9, w: 9 }, teams: teams2, teamResults: teamResults(teams2, { k: 9, a: 9, b: 9, w: 9 }, everyone) };
    expect(lastGameSummary(tied, "k", nameOf)).toEqual({ headline: "Every team tied", yourLine: "Your team, Team Coral, tied with every team · 9 points." });
    // Unchanged for everything else.
    expect(lastGameSummary({ players: ["k", "a", "b"], rawScores: { k: 30, a: 10, b: 10 } }, "a", nameOf)).toEqual({ headline: "Keku wins", yourLine: "You tied for 2nd of 3 · 10 points." });
    expect(lastGameSummary({ players: ["k"], rawScores: { k: 30 } }, "k", nameOf)).toEqual({ headline: "Keku wins", yourLine: "You played solo: 30 points." });
    expect(lastGameSummary({ players: ["k", "a"], rawScores: { k: 3, a: 3 }, outcome: { team: { total: 7, max: 10 } } }, "a", nameOf)).toEqual({ headline: "Team result: 7 out of 10", yourLine: "You played on the team." });
  });

  it("the night card names the winning team, in its text and on the picture's game lines", () => {
    const scores = { k: 140, a: 140, b: 150, w: 150 };
    const facts = nightCardFacts({
      games: [{ id: "g1", gameId: "relay", status: "finished", rawScores: scores, teamResults: teamResults(teams2, scores, everyone) }],
      nameOf, titleOf: () => "Relay", christmas: false, now: new Date(2026, 11, 24),
    })!;
    expect(facts.games).toEqual([{ title: "Relay", line: "Team Sun wins" }]);
    expect(nightCardText(facts)).toContain("Relay: Team Sun wins");
    expect(nightCardText(facts)).not.toContain("tie for first");
  });

  it("room: a finished Relay's projection gives the TV's recap, the lobby and the night card the team line", async () => {
    const lastGameSummary = await lastGame();
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Relay night", { kind: "casual", timing: 2 });
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (const n of ["Amina", "Baraka", "Wanjiru"]) ids.push(engine.join(n).player.id);
    const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    const g = engine.startGame(ids[0]!, "relay", { official: false, seed: 9 });
    for (const p of ids) send(p, g.id, "briefing-ready", { ready: true });
    const st = engine.games.get(g.id)!.extra as RelayState;
    const [first, second] = st.lanes as [RelayState["lanes"][number], RelayState["lanes"][number]];
    for (const lane of [first, second]) for (let i = 0; i < RELAY_LEGS; i++) { t += 100; send(lane.runners[lane.runner]!, g.id, "relay-answer", { leg: lane.legs, choice: st.questions[lane.legs]!.correctIndex }); }
    const tvg = (engine.project("tv")["games"] as Json[]).find((x) => x["id"] === g.id)! as { rawScores: Record<string, number>; teamResults: TeamResultRow[]; players: string[]; teams: GameTeams };
    const pname = (id: string) => (engine.project("tv")["players"] as { id: string; displayName: string }[]).find((p) => p.id === id)?.displayName ?? "Someone";
    const winnerName = tvg.teams.list.find((x) => x.id === first.teamId)!.name;
    expect(resultLine(tvg, pname)).toBe(`${winnerName} wins`);
    expect(lastGameSummary(tvg, first.runners[0]!, pname).yourLine).toMatch(new RegExp(`^Your team, ${winnerName}, won · `));
    expect(nightCardFacts({ games: [{ id: g.id, gameId: "relay", status: "finished", ...tvg }], nameOf: pname, titleOf: () => "Relay", christmas: false, now: new Date() })!.games[0]!.line).toBe(`${winnerName} wins`);
  });
});
