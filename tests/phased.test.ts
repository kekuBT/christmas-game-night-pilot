/**
 * Sprint 3, CP3: lock-step games (per-phase deadlines + backstop) and the
 * practice-only games, on a real server with a fake clock.
 *
 * - Closest Wins: 40 s per question; a closed question scores the guesses
 *   it received; missing guesses score 0 for that question.
 * - Caption Clash: 90 s to write, 45 s to vote; a round with no captions
 *   ends empty; votes received count.
 * - Category Sprint: 60 s per round.
 * - Backstop mid-phase: completed questions/rounds only, counts as practice.
 * - Impostor (practice-only): clue 90 s / vote 60 s / guess 45 s.
 * - Charades (practice-only): an absent actor can no longer stall the game.
 * - An action made in a phase that has since closed never lands in the next one.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, Harness, myGame, type Json, type Player } from "./helpers/harness.js";
import { GAME_POLICIES } from "../src/server/lifecycle.js";
import type { ClosestState } from "../src/games/closest.js";
import type { CaptionState } from "../src/games/caption.js";
import type { ImpostorState } from "../src/games/impostor.js";
import { currentActor, type CharadesState } from "../src/games/charades.js";

let h: Harness;
let clock: FakeClock;
beforeEach(async () => {
  clock = new FakeClock();
  h = await new Harness(undefined, { clock }).start();
  await h.createRoom();
});
afterEach(async () => { await h.dispose(); });

const phase = (id: string, kind: string) => GAME_POLICIES[id]!.phaseMs![kind as "question"]!;
const finishedEvents = (gid: string) => h.engine().ledger.filter((e) => e.type === "game-finished" && e.gameInstanceId === gid);

async function players(n: number): Promise<Player[]> {
  const names = ["Ada", "Bea", "Cal", "Dee", "Eli", "Fay"];
  const out: Player[] = [];
  for (let i = 0; i < n; i++) out.push(await h.join(names[i]!, { host: i === 0 }));
  return out;
}
async function start(host: Player, gameId: string, opts: { official?: boolean } = {}): Promise<string> {
  const r = await h.startGame(host, gameId, { seed: 4, ...opts });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body["gameId"] as string;
}
/** Move the fake clock just past the current phase deadline and run the sweep. */
function expire(gid: string): void {
  clock.t = h.game(gid).phaseDeadlineAt! + 1;
  h.lifecycleTick();
}

describe("Closest Wins: 40 s per question", () => {
  it("everyone guessing ends a question early; the next question's clock starts then", async () => {
    const ps = await players(3);
    const gid = await start(ps[0]!, "closest-wins");
    expect(h.game(gid).phaseDeadlineAt).toBe(h.game(gid).startedAt! + phase("closest-wins", "question"));
    clock.advance(10_000);
    for (const p of ps) await h.intent(p, gid, "closest-guess", { value: 300 });
    const st = h.game(gid).extra as ClosestState;
    expect(st.questionIndex).toBe(1);
    expect(h.game(gid).phaseDeadlineAt).toBe(clock.now() + phase("closest-wins", "question"));
  });

  it("a question whose time runs out closes with the guesses it got; the silent player scores 0 for it", async () => {
    const [ada, bea, cal] = await players(3);
    const gid = await start(ada!, "closest-wins");
    await h.intent(ada!, gid, "closest-guess", { value: 330 });
    await h.intent(bea!, gid, "closest-guess", { value: 100 });
    expire(gid);
    const st = h.game(gid).extra as ClosestState;
    expect(st.questionIndex).toBe(1);
    // Cal's late guess for question 1 (it says so) is refused, not filed under question 2.
    const late = await h.intent(cal!, gid, "closest-guess", { value: 331, phaseKey: "q:0" });
    expect(late).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });
    expect(st.guesses["closest-2"]?.[cal!.playerId]).toBeUndefined();
    // A guess for the current question is fine.
    expect(await h.intent(cal!, gid, "closest-guess", { value: 1440, phaseKey: "q:1" })).toMatchObject({ accepted: true });
  });

  it("all eight questions time out with no player present: the game still ends (completed, nothing invented)", async () => {
    const ps = await players(3);
    const gid = await start(ps[0]!, "closest-wins");
    await h.intent(ps[1]!, gid, "closest-guess", { value: 330 });
    for (let i = 0; i < 8 && h.game(gid).status === "playing"; i++) expire(gid);
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "completed", completedUnits: 8, totalUnits: 8 });
    expect(g.outcome!.participation[ps[1]!.playerId]).toEqual({ done: 1, of: 8, actions: 1 });
    expect(g.rawScores[ps[1]!.playerId]).toBe(100); // closest (only) guess on question 1
    expect(g.rawScores[ps[2]!.playerId]).toBe(0);
    expect(g.outcome!.countsOfficially).toBe(true);
  });

  it("a long outage processes each question deadline in order, each from the previous one", async () => {
    const ps = await players(3);
    const gid = await start(ps[0]!, "closest-wins");
    const t0 = h.game(gid).startedAt!;
    await h.stop();
    clock.t = t0 + 3 * phase("closest-wins", "question") + 5; // three questions' worth of downtime
    await h.restart();
    const g = h.game(gid);
    expect((g.extra as ClosestState).questionIndex).toBe(3);
    expect(g.phaseDeadlineAt).toBe(t0 + 4 * phase("closest-wins", "question"));
    const closed = h.engine().ledger.filter((e) => e.type === "phase-closed" && e.gameInstanceId === gid);
    expect(closed.map((e) => (e.detail as Json)["at"])).toEqual([1, 2, 3].map((k) => t0 + k * phase("closest-wins", "question")));
  });

  it("backstop mid-question: completed questions only, recorded as practice with a plain note", async () => {
    const ps = await players(3);
    const gid = await start(ps[0]!, "closest-wins");
    for (const p of ps) await h.intent(p, gid, "closest-guess", { value: 330 });
    for (const p of ps) await h.intent(p, gid, "closest-guess", { value: 1000 });
    await h.intent(ps[0]!, gid, "closest-guess", { value: 366 }); // question 3 left unfinished
    h.game(gid).deadlineAt = clock.now() + 5; // the backstop arrives first
    clock.advance(10);
    h.lifecycleTick();
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "backstop-partial", countsOfficially: false, completedUnits: 2, totalUnits: 8 });
    expect(g.outcome!.note).toMatch(/counts as practice/);
    // Two completed questions, all three tied each time: 100 + 100 each, question 3 not scored.
    for (const p of ps) expect(g.rawScores[p.playerId]).toBe(200);
    expect(h.engine().officialStandings()).toEqual({});
  });
});

describe("Caption Clash: 90 s write, 45 s vote", () => {
  it("write time runs out with two captions: voting opens with its own clock; vote time runs out: next round", async () => {
    const [ada, bea, cal] = await players(4);
    const gid = await start(ada!, "caption-clash");
    await h.intent(ada!, gid, "caption-submit", { caption: "Snow joke" });
    await h.intent(bea!, gid, "caption-submit", { caption: "Ice to meet you" });
    expire(gid);
    const st = h.game(gid).extra as CaptionState;
    expect(st.phase).toBe("vote");
    expect(h.game(gid).phaseDeadlineAt).toBe(clock.now() - 1 + phase("caption-clash", "vote"));
    // Cal, who wrote nothing, may still vote.
    expect(await h.intent(cal!, gid, "caption-vote", { captionId: ada!.playerId })).toMatchObject({ accepted: true });
    expire(gid);
    expect(st.roundIndex).toBe(1);
    expect(st.phase).toBe("caption");
    expect(st.rounds[0]!.votes[cal!.playerId]).toBe(ada!.playerId);
  });

  it("a round in which nobody writes ends empty; a stale vote for an old round is refused", async () => {
    const [ada, bea] = await players(4);
    const gid = await start(ada!, "caption-clash");
    expire(gid); // nobody wrote
    const st = h.game(gid).extra as CaptionState;
    expect(st.roundIndex).toBe(1);
    expect(st.phase).toBe("caption");
    expect(await h.intent(bea!, gid, "caption-submit", { caption: "late", phaseKey: "0:caption" })).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });
  });

  it("three rounds run out on the clock: the game completes and scores only real captions and votes", async () => {
    const [ada, bea, cal] = await players(4);
    const gid = await start(ada!, "caption-clash");
    await h.intent(ada!, gid, "caption-submit", { caption: "One" });
    await h.intent(bea!, gid, "caption-submit", { caption: "Two" });
    expire(gid); // -> vote
    await h.intent(cal!, gid, "caption-vote", { captionId: bea!.playerId });
    expire(gid); // -> round 2
    expire(gid); // round 2: nobody wrote -> round 3
    expire(gid); // round 3: nobody wrote -> finished
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "completed", completedUnits: 3, totalUnits: 3 });
    expect(g.rawScores[bea!.playerId]).toBe(125); // 25 for writing + 100 for one vote
    expect(g.rawScores[ada!.playerId]).toBe(25);
    expect(g.rawScores[cal!.playerId]).toBe(0);
    expect(g.outcome!.participation[ada!.playerId]).toEqual({ done: 1, of: 3, actions: 1 });
    expect(finishedEvents(gid)).toHaveLength(1);
  });
});

describe("Category Sprint: 60 s per round", () => {
  it("rounds close on time with the answers received; the game completes after three", async () => {
    const [ada, bea] = await players(4);
    const gid = await start(ada!, "category-sprint");
    expect(h.game(gid).phaseDeadlineAt! - h.game(gid).startedAt!).toBe(phase("category-sprint", "round"));
    await h.intent(bea!, gid, "sprint-answers", { answers: ["robin", "reindeer"] });
    expire(gid);
    expect(await h.intent(bea!, gid, "sprint-answers", { answers: ["late"], phaseKey: "r:0" })).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });
    expire(gid);
    expire(gid);
    const g = h.game(gid);
    expect(g.outcome).toMatchObject({ reason: "completed", completedUnits: 3, totalUnits: 3 });
    expect(g.outcome!.participation[bea!.playerId]).toEqual({ done: 1, of: 3, actions: 1 });
    expect(g.outcome!.participation[ada!.playerId]).toEqual({ done: 0, of: 3, actions: 0 });
  });
});

describe("Impostor (practice-only): clue 90 s, vote 60 s, guess 45 s", () => {
  it("silent clue and vote phases close on time; no votes convicts nobody, so the impostor wins; it never counts", async () => {
    const ps = await players(4);
    const gid = await start(ps[0]!, "impostor");
    expect(h.game(gid).official).toBe(false);
    const st = h.game(gid).extra as ImpostorState;
    expect(h.game(gid).phaseDeadlineAt! - h.game(gid).startedAt!).toBe(phase("impostor", "clue"));
    expire(gid);
    expect(st.phase).toBe("vote");
    expect(h.game(gid).phaseDeadlineAt! - (clock.now() - 1)).toBe(phase("impostor", "vote"));
    expire(gid);
    const g = h.game(gid);
    expect(st.winner).toBe("impostor");
    expect(g.outcome).toMatchObject({ reason: "completed", countsOfficially: false });
  });

  it("a convicted impostor who does not guess in 45 s forfeits the guess (honest players win)", async () => {
    const ps = await players(4);
    const gid = await start(ps[0]!, "impostor");
    const st = h.game(gid).extra as ImpostorState;
    for (const p of ps) await h.intent(p, gid, "impostor-clue", { clue: "cold" });
    for (const p of ps) {
      const suspect = p.playerId === st.impostorId ? ps.find((x) => x.playerId !== st.impostorId)!.playerId : st.impostorId;
      await h.intent(p, gid, "impostor-vote", { suspectId: suspect });
    }
    expect(st.phase).toBe("guess");
    expect(h.game(gid).phaseDeadlineAt! - clock.now()).toBe(phase("impostor", "guess"));
    expire(gid);
    expect(st.winner).toBe("honest");
    expect(h.game(gid).status).toBe("finished");
  });
});

describe("Charades (practice-only): an absent actor cannot stall the game", () => {
  it("each actor's turn ends after 90 s with no point; the game always ends", async () => {
    const ps = await players(4);
    const gid = await start(ps[0]!, "charades");
    const st = h.game(gid).extra as CharadesState;
    // Stage 12.8 (D-S128-03): teams take turns, so the acting player comes from the game's own turn order.
    const actor0 = currentActor(st);
    await h.disconnect(ps.find((p) => p.playerId === actor0)!); // the first actor's phone dies
    expire(gid);
    expect(st.turnIndex).toBe(1);
    expect(st.teamScores).toEqual([0, 0]);
    // The second actor plays normally and scores.
    const actor1 = currentActor(st);
    expect(await h.intent(ps.find((p) => p.playerId === actor1)!, gid, "charades-turn", { outcome: "correct" })).toMatchObject({ accepted: true });
    expire(gid);
    expire(gid);
    const g = h.game(gid);
    expect(g.status).toBe("finished");
    expect(g.outcome).toMatchObject({ reason: "completed", countsOfficially: false });
    expect(st.teamScores.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("passes stay within the same 90 s turn (the clock is per turn, not per prompt)", async () => {
    const ps = await players(4);
    const gid = await start(ps[0]!, "charades");
    const st = h.game(gid).extra as CharadesState;
    const actor = ps.find((p) => p.playerId === [...st.teams[0]!, ...st.teams[1]!][0])!;
    const before = h.game(gid).phaseDeadlineAt;
    clock.advance(30_000);
    await h.intent(actor, gid, "charades-turn", { outcome: "pass" });
    expect(h.game(gid).phaseDeadlineAt).toBe(before);
  });
});

describe("projections carry phase deadlines in server time", () => {
  it("player and TV see the same phase deadline and the server's clock", async () => {
    const ps = await players(3);
    const gid = await start(ps[0]!, "closest-wins");
    const mine = myGame(await h.projection(ps[1]!), gid);
    const tv = await h.tv();
    const pub = (tv["games"] as Json[]).find((g) => g["id"] === gid)!;
    expect(mine["phaseDeadlineAt"]).toBe(h.game(gid).phaseDeadlineAt);
    expect(pub["phaseDeadlineAt"]).toBe(h.game(gid).phaseDeadlineAt);
    expect((mine["lifecycle"] as Json)["phaseKey"]).toBe("q:0");
    expect(tv["serverNow"]).toBe(clock.now());
  });
});
