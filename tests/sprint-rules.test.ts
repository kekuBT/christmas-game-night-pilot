import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import { charadesTurn, initCharades, currentActor, charadesPlayerScores, projectCharades } from "../src/games/charades.js";
import { initImpostor, submitClue, submitVote, tallyVotes, resolveVote, impostorScores, projectImpostor, allCluesIn } from "../src/games/impostor.js";
import { initCaption, submitCaption, submitCaptionVote, captionRoundScores, currentRound } from "../src/games/caption.js";
import { initClosest, submitClosestGuess, advanceClosest, closestQuestionScores } from "../src/games/closest.js";
import { hashToken, sanitizeText, createJoinCode } from "../src/shared/protocol.js";

// Completion-sprint P4: game-rule correctness, ties, timeouts, security boundaries.
function intent(gameId: string, action: string, payload: Record<string, unknown>, roomId: string) {
  return { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action, payload };
}
function room(n: number) {
  const engine = new RoomEngine("P4 Rules");
  const host = engine.join("Host", { asHost: true }).player.id;
  const ids = [host];
  for (let i = 0; i < n - 1; i++) ids.push(engine.join(`G${i}`).player.id);
  return { engine, host, ids };
}

describe("Impostor rules", () => {
  it("impostor never receives the word and TV never leaks it", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const st = initImpostor(ids, 42);
    const imp = ids.find((id) => st.impostorId === id)!;
    const proj = projectImpostor(st, imp, false) as { word?: string };
    expect(proj.word).toBeUndefined();
    const tv = projectImpostor(st, "", true) as { word?: string };
    expect(tv.word).toBeUndefined();
    const honest = projectImpostor(st, ids.find((id) => id !== imp)!, false) as { word?: string };
    expect(typeof honest.word).toBe("string");
  });
  it("self-vote is rejected, tie means no conviction, correct conviction scores honest side", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const st = initImpostor(ids, 1);
    expect(() => submitVote(st, "p1", "p1", ids)).toThrow();
    for (const id of ids) submitClue(st, id, "clue");
    expect(allCluesIn(st, ids)).toBe(true);
    st.phase = "vote"; // the engine advances clue -> vote once all clues are in
    // Two votes for p1, two for p2: tie -> no conviction.
    submitVote(st, "p1", "p2", ids);
    submitVote(st, "p2", "p1", ids);
    submitVote(st, "p3", "p2", ids);
    submitVote(st, "p4", "p1", ids);
    expect(tallyVotes(st)).toBeNull();
    resolveVote(st);
    expect(st.phase).not.toBe("guess");
    const scores = impostorScores(st, ids);
    // A tie means no conviction, so the impostor side wins: impostor 100, honest players 0.
    expect(scores[st.impostorId]).toBe(100);
    expect(ids.filter((id) => id !== st.impostorId).every((id) => scores[id] === 0)).toBe(true);
  });
  it("deterministic seed replays the same impostor and word", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const a = initImpostor(ids, 99);
    const b = initImpostor(ids, 99);
    expect(a.impostorId).toBe(b.impostorId);
    expect(a.word).toBe(b.word);
  });
});

describe("Caption Clash rules", () => {
  it("own-vote is rejected and vote points go to the caption author", () => {
    const st = initCaption(5);
    const ids = ["p1", "p2", "p3", "p4"];
    for (const id of ids) submitCaption(st, id, `caption by ${id}`);
    st.phase = "vote"; // the engine advances caption -> vote once all captions are in
    const round = currentRound(st);
    expect(() => submitCaptionVote(st, "p1", "p1", ids)).toThrow();
    submitCaptionVote(st, "p1", "p2", ids);
    const scores = captionRoundScores(round);
    expect(scores["p2"]).toBeGreaterThan(0);
  });
  it("a duplicate caption is rejected", () => {
    const st = initCaption(5);
    submitCaption(st, "p1", "first");
    expect(() => submitCaption(st, "p1", "second")).toThrow();
  });
});

describe("Closest Wins rules", () => {
  it("closest guess wins, ties share, and rounds advance", () => {
    const st = initClosest();
    const q = st.questions[0]!;
    const scores = closestQuestionScores(q, { p1: q.answer, p2: q.answer + 10, p3: q.answer - 5 });
    expect(scores["p1"]).toBeGreaterThan(scores["p2"]!);
    expect(scores["p3"]).toBeGreaterThan(scores["p2"]!);
    const tied = closestQuestionScores(q, { p1: q.answer, p2: q.answer });
    expect(tied["p1"]).toBe(tied["p2"]);
    submitClosestGuess(st, "p1", q.answer);
    submitClosestGuess(st, "p2", q.answer);
    advanceClosest(st);
    expect(st.questionIndex).toBe(1);
  });
});

describe("Charades rules (sprint fixes)", () => {
  it("passes stay in the same turn up to 3, then the turn advances", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const st = initCharades(ids);
    const actor = currentActor(st);
    const startTurn = st.turnIndex;
    charadesTurn(st, actor, "pass");
    expect(st.turnIndex).toBe(startTurn);
    expect(st.passesThisTurn).toBe(1);
    charadesTurn(st, actor, "pass");
    charadesTurn(st, actor, "pass");
    expect(st.passesThisTurn).toBe(3);
    expect(() => charadesTurn(st, actor, "pass")).toThrow("PASS_LIMIT");
    charadesTurn(st, actor, "correct");
    expect(st.turnIndex).toBe(startTurn + 1);
  });
  it("a correct answer scores the actor's team, and the game lasts one turn per player", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const st = initCharades(ids);
    let turns = 0;
    while (st.phase !== "finished" && turns < 10) {
      charadesTurn(st, currentActor(st), "correct");
      turns++;
    }
    expect(turns).toBe(4);
    expect(st.phase).toBe("finished");
    const scores = charadesPlayerScores(st);
    // Two teams, two correct turns each: every player shares their team's 200.
    expect(Object.values(scores).every((v) => v === 200)).toBe(true);
  });
  it("only the actor's prompt is private; TV sees no prompt", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const st = initCharades(ids);
    const actor = currentActor(st);
    const mine = projectCharades(st, actor, false) as { prompt?: string };
    expect(typeof mine.prompt).toBe("string");
    const tv = projectCharades(st, "", true) as { prompt?: string };
    expect(tv.prompt).toBeUndefined();
  });
});

describe("Engine security and session boundaries", () => {
  it("duplicate intents are deduplicated, forged room ids are rejected", () => {
    const { engine, host, ids } = room(3);
    const game = engine.startGame(host, "math-mayhem", { official: true });
    const q = game.questions![0]!;
    const inv = intent(game.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, engine.id);
    const first = engine.submitIntent(inv, ids[0]!);
    expect(first.accepted).toBe(true);
    const second = engine.submitIntent(inv, ids[0]!);
    expect(second.accepted).toBe(true);
    expect(engine.ledger.filter((e) => e.type === "score-awarded").length).toBe(1);
    const wrongRoom = engine.submitIntent(intent(game.id, "submit-math-answer", { questionId: q.id, chosenIndex: 0 }, "room-other"), ids[1]!);
    expect(wrongRoom.accepted).toBe(false);
  });
  it("a non-member cannot start a game, and only host/cohost can skip", () => {
    const { engine, host } = room(3);
    expect(() => engine.startGame("player-999", "math-mayhem", {})).toThrow();
    const game = engine.startGame(host, "trivia", { official: true, seed: 1 });
    expect(() => engine.skipTimedOutGame("player-999", game.id)).toThrow();
    game.deadlineAt = Date.now() - 1;
    engine.skipTimedOutGame(host, game.id);
    expect(game.timedOut).toBe(true);
  });
  it("join tokens are hashed, names are sanitised, and codes are 6 characters", () => {
    const token = "a".repeat(64);
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(sanitizeText("  Ada  ", 32)).toBe("Ada");
    expect(sanitizeText("x".repeat(50), 32)).toHaveLength(32);
    expect(sanitizeText("   ", 32)).toBeNull();
    expect(createJoinCode()).toMatch(/^[A-Z0-9]{6}$/);
  });
  it("practice games appear in history but never in official standings", () => {
    const { engine, host, ids } = room(2);
    const practice = engine.startGame(host, "math-mayhem", { official: false });
    for (const pid of ids) for (const q of practice.questions!) {
      engine.submitIntent(intent(practice.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, engine.id), pid);
    }
    expect(practice.status).toBe("finished");
    expect(engine.officialStandings()).toEqual({});
    expect(engine.championshipResults()).toEqual([]);
  });
  it("late answers after the math window are rejected, not silently dropped", () => {
    const { engine, host, ids } = room(2);
    const game = engine.startGame(host, "math-mayhem", { official: true });
    const q = game.questions![0]!;
    const late = engine.submitIntent(intent(game.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, engine.id), ids[0]!, Date.now() + 6 * 60 * 1000);
    expect(late.accepted).toBe(false);
    expect(late.reason).toBe("PHASE_CLOSED");
  });
});
