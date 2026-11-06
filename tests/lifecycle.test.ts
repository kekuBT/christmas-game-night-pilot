/**
 * Sprint 3, CP1 + CP2: the game lifecycle on a real server (HTTP + WS),
 * with a fake server clock, persisted state and restarts.
 *
 * What must hold (decisions P1-P6, docs/GAME_LIFECYCLE_POLICY_PROPOSAL.md):
 * - every game has a server-time deadline from the central policy table;
 * - the deadline ends the game even when nobody acts (server sweep), and
 *   identically after a restart;
 * - valid answers are kept, unanswered items score 0, nothing is invented;
 * - a disconnect alone never ends a game;
 * - a game ends exactly once, whoever gets there first (final answer,
 *   deadline sweep, request, host skip, restart);
 * - an answer at the deadline instant counts; one a millisecond later does not.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, Harness, myGame, type Json, type Player } from "./helpers/harness.js";
import { GAME_POLICIES } from "../src/server/lifecycle.js";
import { CONNECTIONS_BOARD } from "../src/games/connections.js";

let h: Harness;
let clock: FakeClock;
beforeEach(async () => {
  clock = new FakeClock();
  h = await new Harness(undefined, { clock }).start();
  await h.createRoom();
});
afterEach(async () => { await h.dispose(); });

type Q = { id: string; correctIndex: number };
const quizQuestions = (gid: string) => (h.game(gid).extra as { questions: Q[] }).questions;
const finishedEvents = (gid: string) => h.engine().ledger.filter((e) => e.type === "game-finished" && e.gameInstanceId === gid);
const scoreEvents = (gid: string) => h.engine().ledger.filter((e) => e.type === "score-awarded" && e.gameInstanceId === gid);

async function three(): Promise<[Player, Player, Player]> {
  return [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
}
async function start(host: Player, gameId: string, opts: { official?: boolean; seed?: number } = {}): Promise<string> {
  const r = await h.startGame(host, gameId, { seed: 3, ...opts });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body["gameId"] as string;
}
async function answerTrivia(p: Player, gid: string, n: number, correct = true): Promise<void> {
  for (const q of quizQuestions(gid).slice(0, n)) {
    const r = await h.intent(p, gid, "trivia-answer", { questionId: q.id, chosenIndex: correct ? q.correctIndex : (q.correctIndex + 1) % 4 });
    expect(r["accepted"], JSON.stringify(r)).toBe(true);
  }
}

describe("deadlines come from the central policy table", () => {
  it.each(["trivia", "who-said-that", "geography", "guess-the-year", "math-mayhem", "word-connections"])("%s: deadline = start + its window", async (gameId) => {
    const [ada] = await three();
    await h.join("Dee"); // Who Said That needs four
    const gid = await start(ada, gameId);
    const g = h.game(gid);
    expect(g.deadlineAt! - g.startedAt!).toBe(GAME_POLICIES[gameId]!.gameWindowMs);
    expect(g.phaseDeadlineAt).toBeUndefined(); // independent games have no phase clock
    const proj = myGame(await h.projection(ada), gid);
    expect(proj["deadlineAt"]).toBe(g.deadlineAt);
    expect((await h.projection(ada))["serverNow"]).toBe(clock.now());
  });

  it("the provisional windows are the approved ones (P2)", () => {
    const min = (id: string) => GAME_POLICIES[id]!.gameWindowMs / 60_000;
    expect([min("trivia"), min("who-said-that"), min("geography"), min("guess-the-year"), min("math-mayhem"), min("word-connections")]).toEqual([6, 6, 6, 6, 4, 8]);
  });
});

describe("independent games: how they end", () => {
  it("everyone finishes before the deadline: completed, counts officially, everyone 'N of N'", async () => {
    const [ada, bea, cal] = await three();
    const gid = await start(ada, "trivia");
    const n = quizQuestions(gid).length;
    for (const p of [ada, bea, cal]) await answerTrivia(p, gid, n);
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "completed", countsOfficially: true });
    for (const p of [ada, bea, cal]) expect(g.outcome!.participation[p.playerId]).toEqual({ done: n, of: n });
    expect(finishedEvents(gid)).toHaveLength(1);
  });

  it("partial participation: valid answers are kept, the rest score 0, the result counts", async () => {
    const [ada, bea, cal] = await three();
    const gid = await start(ada, "trivia");
    const n = quizQuestions(gid).length;
    await answerTrivia(ada, gid, n);
    await answerTrivia(bea, gid, 3);
    clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 1);
    expect(h.lifecycleTick()).toBe(1);
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "deadline", countsOfficially: true });
    expect(g.outcome!.participation[bea.playerId]).toEqual({ done: 3, of: n });
    expect(g.outcome!.participation[cal.playerId]).toEqual({ done: 0, of: n });
    expect(g.rawScores[ada.playerId]).toBe(n * 120);
    expect(g.rawScores[bea.playerId]).toBe(3 * 120); // exactly her three valid answers, nothing invented
    expect(g.rawScores[cal.playerId]).toBe(0);
    expect(h.engine().officialStandings()[cal.playerId]).toBeDefined(); // Cal is ranked (last), not dropped
  });

  it("nobody answers: the deadline ends it at 0 for all, recorded but not counted (D-S3-02)", async () => {
    const [ada] = await three();
    const gid = await start(ada, "geography");
    clock.advance(GAME_POLICIES["geography"]!.gameWindowMs + 1);
    h.lifecycleTick();
    expect(h.game(gid).outcome).toMatchObject({ reason: "deadline", countsOfficially: false });
    expect(h.engine().officialStandings()).toEqual({});
  });

  it("a practice game ends by the same rules and never counts", async () => {
    const [ada, bea] = await three();
    const gid = await start(ada, "trivia", { official: false });
    await answerTrivia(bea, gid, 2);
    clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 1);
    h.lifecycleTick();
    expect(h.game(gid).outcome).toMatchObject({ reason: "deadline", countsOfficially: false });
    expect(h.engine().officialStandings()).toEqual({});
  });

  it("a disconnect does not end the game; the player returns and finishes before the deadline", async () => {
    const [ada, bea, cal] = await three();
    const gid = await start(ada, "trivia");
    const n = quizQuestions(gid).length;
    await answerTrivia(ada, gid, n);
    await answerTrivia(bea, gid, n);
    await answerTrivia(cal, gid, 2);
    await h.disconnect(cal);
    clock.advance(3 * 60_000); // well past the 45 s reconnect grace, still before the deadline
    h.lifecycleTick();
    expect(h.game(gid).status).toBe("playing");
    await h.connect(cal);
    const qs = quizQuestions(gid);
    for (const q of qs.slice(2)) await h.intent(cal, gid, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    expect(h.game(gid).outcome).toMatchObject({ reason: "completed", countsOfficially: true });
    expect(h.game(gid).rawScores[cal.playerId]).toBe(n * 120);
  });

  it("an answer at the deadline instant counts; a millisecond later it is refused and the game ends as of its deadline", async () => {
    const [ada, bea] = await three();
    const gid = await start(ada, "trivia");
    const [q1, q2] = quizQuestions(gid);
    const deadline = h.game(gid).deadlineAt!;
    clock.t = deadline;
    expect(await h.intent(bea, gid, "trivia-answer", { questionId: q1!.id, chosenIndex: q1!.correctIndex })).toMatchObject({ accepted: true });
    clock.t = deadline + 1;
    expect(await h.intent(bea, gid, "trivia-answer", { questionId: q2!.id, chosenIndex: q2!.correctIndex })).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "deadline", endedAt: deadline });
    expect(g.rawScores[bea.playerId]).toBe(120);
  });

  it("the deadline is processed with no request at all, and every connected screen is told", async () => {
    const [ada, bea] = await three();
    const gid = await start(ada, "trivia");
    await answerTrivia(bea, gid, 1);
    const seen: Json[] = [];
    bea.ws!.on("message", (d) => { const m = JSON.parse(d.toString()) as Json; if (m["kind"] === "projection") seen.push(m); });
    clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 1);
    expect(h.lifecycleTick()).toBe(1);
    await new Promise((r) => setTimeout(r, 100));
    const last = seen.at(-1)!["state"] as Json;
    const game = (last["games"] as Json[]).find((g) => g["id"] === gid)!;
    expect(game["status"]).toBe("finished");
    expect((game["outcome"] as Json)["reason"]).toBe("deadline");
    expect(h.lifecycleTick()).toBe(0); // nothing left to do
  });

  it("a read after the deadline sees the ended game (deadline processed before the projection)", async () => {
    const [ada] = await three();
    await h.join("Dee");
    const gid = await start(ada, "who-said-that");
    clock.advance(GAME_POLICIES["who-said-that"]!.gameWindowMs + 1);
    const g = myGame(await h.projection(ada), gid);
    expect(g["status"]).toBe("finished");
  });
});

describe("restarts", () => {
  it("a deadline that passes while the server is down is processed at startup, as of the deadline, and saved", async () => {
    const [ada, bea] = await three();
    const gid = await start(ada, "trivia");
    await answerTrivia(bea, gid, 4);
    const deadline = h.game(gid).deadlineAt!;
    await h.stop();
    clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 60 * 60_000); // down for an hour
    await h.restart();
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "deadline", endedAt: deadline, countsOfficially: true });
    expect(g.rawScores[bea.playerId]).toBe(4 * 120);
    // Saved to disk, not just in memory: a second restart reads the same outcome.
    const file = readdirSync(h.dataDir).find((f) => f.includes(h.roomId) && f.endsWith(".json"))!;
    expect(readFileSync(join(h.dataDir, file), "utf8")).toMatch(/"reason":\s*"deadline"/);
    await h.restart();
    expect(finishedEvents(gid)).toHaveLength(1);
  });

  it("a game still in time survives a restart with its deadline and answers unchanged", async () => {
    const [ada, bea] = await three();
    const gid = await start(ada, "guess-the-year");
    const before = h.game(gid).deadlineAt;
    const ev = (h.game(gid).extra as { events: { id: string }[] }).events[0]!;
    await h.intent(bea, gid, "year-guess", { eventId: ev.id, value: 1990 });
    await h.restart();
    expect(h.game(gid).status).toBe("playing");
    expect(h.game(gid).deadlineAt).toBe(before);
    expect((h.game(gid).extra as { guesses: Record<string, Json> }).guesses[bea.playerId]).toEqual({ [ev.id]: 1990 });
  });
});

describe("exactly-once finalization", () => {
  it("repeated sweeps, a host skip and a late answer after the deadline produce one ending and one set of scores", async () => {
    const [ada, bea, cal] = await three();
    const gid = await start(ada, "trivia");
    await answerTrivia(bea, gid, 2);
    clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 1);
    const q = quizQuestions(gid)[5]!;
    await Promise.all([
      Promise.resolve(h.lifecycleTick()),
      h.post(`/rooms/${h.roomId}/games/${gid}/skip`, {}, ada.token),
      h.intent(cal, gid, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex }),
      h.projection(bea),
      Promise.resolve(h.lifecycleTick()),
    ]);
    expect(finishedEvents(gid)).toHaveLength(1);
    expect(scoreEvents(gid)).toHaveLength(3); // one per roster player
    expect(h.game(gid).rawScores[cal.playerId]).toBe(0);
  });

  it("final actions and the deadline at the same instant: the last action completes the game; the sweep then has nothing to do", async () => {
    const [ada, bea, cal] = await three();
    const gid = await start(ada, "math-mayhem");
    const qs = h.game(gid).questions!;
    for (const p of [ada, bea]) for (const q of qs.slice(0, -1)) await h.intent(p, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    clock.t = h.game(gid).deadlineAt!; // the deadline instant: still in time
    const last = qs.at(-1)!;
    await h.intent(cal, gid, "abstain", {});
    await h.intent(ada, gid, "submit-math-answer", { questionId: last.id, chosenIndex: last.correctIndex });
    expect(h.game(gid).status).toBe("playing");
    await h.intent(bea, gid, "submit-math-answer", { questionId: last.id, chosenIndex: last.correctIndex });
    expect(h.game(gid).outcome?.reason).toBe("completed");
    clock.advance(1);
    expect(h.lifecycleTick()).toBe(0);
    expect(finishedEvents(gid)).toHaveLength(1);
  });

  it("Math: live per-answer scores are not added again at the deadline", async () => {
    const [ada, bea] = await three();
    const gid = await start(ada, "math-mayhem");
    const qs = h.game(gid).questions!;
    for (const q of qs.slice(0, 5)) await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    const live = h.game(gid).rawScores[bea.playerId];
    clock.advance(GAME_POLICIES["math-mayhem"]!.gameWindowMs + 1);
    h.lifecycleTick();
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "deadline", countsOfficially: true });
    expect(g.rawScores[bea.playerId]).toBe(live);
    const ledgerSum = scoreEvents(gid).filter((e) => e.playerId === bea.playerId).reduce((s, e) => s + (e.points ?? 0), 0);
    expect(ledgerSum).toBe(live);
    expect(g.outcome!.participation[bea.playerId]).toEqual({ done: 5, of: qs.length });
    void ada;
  });
});

describe("Word Connections at the deadline", () => {
  it("solved groups count, an unfinished puzzle is shown as such, nothing is invented", async () => {
    const [ada, bea] = await three();
    const gid = await start(ada, "word-connections");
    const tilesOf = (name: string) => CONNECTIONS_BOARD.tiles.filter((t) => t.category === name).map((t) => t.id);
    for (const cat of CONNECTIONS_BOARD.categories.slice(0, 2)) {
      expect(await h.intent(bea, gid, "connections-guess", { tileIds: tilesOf(cat.name) })).toMatchObject({ accepted: true });
    }
    clock.advance(GAME_POLICIES["word-connections"]!.gameWindowMs + 1);
    h.lifecycleTick();
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "deadline", countsOfficially: true });
    expect(g.outcome!.participation[bea.playerId]).toEqual({ done: 2, of: 4, finished: false });
    expect(g.rawScores[bea.playerId]).toBeGreaterThan(0);
    expect(g.rawScores[ada.playerId]).toBe(0);
  });
});

describe("integrity failures void, deadlines never do", () => {
  it("a scoring failure at the deadline voids the game (audited, not counted, no partial scores)", async () => {
    const [ada, bea] = await three();
    const gid = await start(ada, "trivia");
    await answerTrivia(bea, gid, 2);
    (h.game(gid).extra as { questions: unknown }).questions = null; // corrupted state
    clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 1);
    h.lifecycleTick();
    const g = h.game(gid);
    expect(g.status).toBe("finished");
    expect(g.outcome).toMatchObject({ reason: "void", countsOfficially: false });
    expect(scoreEvents(gid)).toHaveLength(0);
    expect(h.engine().ledger.filter((e) => e.type === "game-voided" && e.gameInstanceId === gid)).toHaveLength(1);
    expect(h.engine().officialStandings()).toEqual({});
  });

  it("the host cannot end or void a game before its deadline", async () => {
    const [ada, bea] = await three();
    const gid = await start(ada, "trivia");
    await answerTrivia(bea, gid, 1);
    expect((await h.post(`/rooms/${h.roomId}/games/${gid}/skip`, {}, ada.token)).status).toBe(400);
    expect(h.game(gid).status).toBe("playing");
  });

  it("a player cannot void a game by refusing to play: abstaining is a choice, the game still ends and counts", async () => {
    const [ada, bea, cal] = await three();
    const gid = await start(ada, "trivia");
    const n = quizQuestions(gid).length;
    await answerTrivia(ada, gid, n);
    await answerTrivia(bea, gid, n);
    expect(await h.intent(cal, gid, "abstain", {})).toMatchObject({ accepted: true });
    expect(h.game(gid).outcome).toMatchObject({ reason: "completed", countsOfficially: true });
  });
});

describe("practice-only games are enforced by the server (P8, P9)", () => {
  it.each(["impostor", "charades"])("%s cannot be started as official over HTTP; practice is fine", async (gameId) => {
    const players = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal"), await h.join("Dee")];
    const refused = await h.startGame(players[0]!, gameId, { official: true });
    expect(refused.status).toBe(400);
    expect(String(refused.body["error"])).toMatch(/practice-only/);
    expect(h.engine().games.size).toBe(0);
    const ok = await h.startGame(players[0]!, gameId, { official: false });
    expect(ok.status).toBe(201);
    const g = myGame(await h.projection(players[1]!), ok.body["gameId"] as string);
    expect((g["lifecycle"] as Json)["officialEligible"]).toBe(false);
    expect((g["lifecycle"] as Json)["practiceOnlyReason"]).toMatch(/practice-only/);
  });
});

describe("public projections stay public", () => {
  it("the TV sees the outcome counts but never who chose to sit out", async () => {
    const [ada, bea, cal] = await three();
    const gid = await start(ada, "trivia");
    const n = quizQuestions(gid).length;
    await answerTrivia(ada, gid, n);
    await answerTrivia(bea, gid, 2);
    await h.intent(cal, gid, "abstain", {});
    clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 1);
    const tv = (await h.get(`/rooms/${h.roomId}/projection?audience=tv`)).body as Json;
    const g = (tv["games"] as Json[]).find((x) => x["id"] === gid)!;
    const outcome = g["outcome"] as Json;
    expect(outcome["reason"]).toBe("deadline");
    expect(JSON.stringify(outcome)).not.toMatch(/abstain/i);
    expect((outcome["participation"] as Json)[cal.playerId]).toEqual({ done: 0, of: n });
  });
});

