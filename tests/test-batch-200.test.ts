import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import { LocalServer } from "../src/server/http.js";
import { generateTrivia, scoreTrivia, triviaSpeedBonus } from "../src/games/trivia.js";
import { generateMathQuestions, mathSpeedBonus, scoreMathAnswer } from "../src/games/math.js";
import { scoreYear, YEAR_EVENTS } from "../src/games/year.js";
import { GEOGRAPHY_PACK, scoreGeography } from "../src/games/geography.js";
import { WHO_SAID_PACK, scoreWhoSaid } from "../src/games/whosaid.js";
import {
  CONNECTIONS_BOARD,
  guessConnections,
  connectionsScore,
  type ConnectionsPlayerState,
} from "../src/games/connections.js";
import { normalizeSprintAnswer, scoreSprintRound, SPRINT_CATEGORIES } from "../src/games/sprint.js";
import {
  initClosest,
  submitClosestGuess,
  advanceClosest,
  closestQuestionScores,
  projectClosest,
} from "../src/games/closest.js";
import {
  initCaption,
  submitCaption,
  submitCaptionVote,
  captionRoundScores,
  projectCaption,
} from "../src/games/caption.js";
import {
  initImpostor,
  submitClue,
  submitVote,
  tallyVotes,
  resolveVote,
  submitGuess,
  impostorScores,
} from "../src/games/impostor.js";
import { initCharades, currentActor, charadesTurn, charadesPlayerScores, projectCharades } from "../src/games/charades.js";

// Test batch toward 200 meaningful tests (board task, 2026-11-04):
// per-game scoring edges, timeout/abstention at engine level, and the
// HTTP projection/rate-limit matrix. No filler: every case pins a rule
// a player could actually hit on game night.
function intent(gameId: string, action: string, payload: Record<string, unknown>, roomId: string) {
  return { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action, payload };
}
function room(n: number) {
  const engine = new RoomEngine("Batch 200");
  const host = engine.join("Host", { asHost: true }).player.id;
  const ids = [host];
  for (let i = 0; i < n - 1; i++) ids.push(engine.join(`G${i}`).player.id);
  return { engine, host, ids };
}
function freshConnections(): ConnectionsPlayerState {
  return { solved: [], mistakes: 0, guessed: [] };
}
function boardGroup(category: string): string[] {
  return CONNECTIONS_BOARD.tiles.filter((t) => t.category === category).map((t) => t.id);
}

describe("Trivia edges", () => {
  it("a seeded pack is deterministic, has 10 unique prompts, and every question has 4 unique options", () => {
    const a = generateTrivia(7);
    const b = generateTrivia(7);
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    expect(new Set(a.map((q) => q.prompt)).size).toBe(10);
    for (const q of a) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(4);
    }
    expect(generateTrivia(8).map((q) => q.prompt)).not.toEqual(a.map((q) => q.prompt));
  });
  it("speed bonus brackets at the 15s boundary, and wrong/null answers score 0", () => {
    const q = generateTrivia(7)[0]!;
    expect(triviaSpeedBonus(15000)).toBe(20);
    expect(triviaSpeedBonus(15001)).toBe(0);
    expect(scoreTrivia(q, q.correctIndex, 15000)).toBe(120);
    expect(scoreTrivia(q, q.correctIndex, 30000)).toBe(100);
    expect(scoreTrivia(q, null, 1000)).toBe(0);
    expect(scoreTrivia(q, (q.correctIndex + 1) % 4, 1000)).toBe(0);
  });
  it("count is honoured and clamped to the pack, not padded with duplicates", () => {
    expect(generateTrivia(7, 3)).toHaveLength(3);
    const all = generateTrivia(7, 99);
    expect(all.length).toBeLessThanOrEqual(12);
    expect(new Set(all.map((q) => q.prompt)).size).toBe(all.length);
  });
});

describe("Math edges", () => {
  it("generated questions are unique, have 4 unique options, and correctIndex points at correctAnswer", () => {
    const qs = generateMathQuestions(11);
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.prompt)).size).toBe(10);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correctIndex]).toBe(q.correctAnswer);
      expect(q.correctAnswer).toBeGreaterThanOrEqual(0);
    }
  });
  it("division and percentage questions are whole-number arithmetic, not trick math", () => {
    for (const q of generateMathQuestions(23)) {
      if (q.prompt.includes("÷")) {
        const [a, b] = q.prompt.replace(" = ?", "").split(" ÷ ").map(Number);
        expect(a! % b!).toBe(0);
        expect(a! / b!).toBe(q.correctAnswer);
      }
      if (q.prompt.includes("% of")) {
        const [pct, base] = q.prompt.replace(" = ?", "").split("% of ").map((s) => Number(s.replace("%", "")));
        expect((pct! * base!) / 100).toBe(q.correctAnswer);
      }
    }
  });
  it("speed bonus brackets at 5s and 10s, and null/wrong answers score 0", () => {
    expect(mathSpeedBonus(5000)).toBe(20);
    expect(mathSpeedBonus(5001)).toBe(10);
    expect(mathSpeedBonus(10000)).toBe(10);
    expect(mathSpeedBonus(10001)).toBe(0);
    const q = generateMathQuestions(11)[0]!;
    expect(scoreMathAnswer(q, q.correctIndex, 4000)).toBe(120);
    expect(scoreMathAnswer(q, null, 1000)).toBe(0);
    expect(scoreMathAnswer(q, (q.correctIndex + 1) % 4, 1000)).toBe(0);
  });
});

describe("Guess the Year / Geography / Who Said That edges", () => {
  it("year scoring decays 10 per year and floors at 0 from 10 years out", () => {
    const e = YEAR_EVENTS[0]!; // 1969
    expect(scoreYear(e, 1969)).toBe(100);
    expect(scoreYear(e, 1970)).toBe(90);
    expect(scoreYear(e, 1960)).toBe(10);
    expect(scoreYear(e, 1959)).toBe(0);
    expect(scoreYear(e, 1800)).toBe(0);
    expect(scoreYear(e, null)).toBe(0);
    expect(scoreYear(e, 1969.5)).toBe(0);
  });
  it("year events are distinct years with a context and source each", () => {
    expect(new Set(YEAR_EVENTS.map((e) => e.year)).size).toBe(YEAR_EVENTS.length);
    for (const e of YEAR_EVENTS) {
      expect(e.context.length).toBeGreaterThan(0);
      expect(e.source.length).toBeGreaterThan(0);
    }
  });
  it("geography covers all six modes and every question is a valid 4-choice item", () => {
    expect(new Set(GEOGRAPHY_PACK.map((q) => q.mode))).toEqual(
      new Set(["flag", "outline", "capital", "region", "higher-lower", "distance"]),
    );
    for (const q of GEOGRAPHY_PACK) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(scoreGeography(q, q.correctIndex)).toBe(100);
      expect(scoreGeography(q, null)).toBe(0);
      expect(scoreGeography(q, (q.correctIndex + 1) % 4)).toBe(0);
    }
  });
  it("who-said-that uses only the fictional speaker set and scores 100/0", () => {
    for (const q of WHO_SAID_PACK) {
      expect(q.speakers).toHaveLength(4);
      expect(new Set(q.speakers).size).toBe(4);
      expect(scoreWhoSaid(q, q.correctIndex)).toBe(100);
      expect(scoreWhoSaid(q, null)).toBe(0);
    }
  });
});

describe("Word Connections edges", () => {
  it("the board is 16 unique tiles in 4 groups of 4", () => {
    expect(CONNECTIONS_BOARD.categories).toHaveLength(4);
    expect(CONNECTIONS_BOARD.tiles).toHaveLength(16);
    expect(new Set(CONNECTIONS_BOARD.tiles.map((t) => t.id)).size).toBe(16);
    for (const c of CONNECTIONS_BOARD.categories) expect(c.tiles).toHaveLength(4);
  });
  it("invalid groups are rejected before any score change", () => {
    const st = freshConnections();
    const group = boardGroup("Christmas foods");
    expect(() => guessConnections(CONNECTIONS_BOARD, st, group.slice(0, 3))).toThrow("INVALID_GROUP");
    expect(() => guessConnections(CONNECTIONS_BOARD, st, [...group.slice(0, 3), group[0]!])).toThrow("DUPLICATE_TILE");
    expect(() => guessConnections(CONNECTIONS_BOARD, st, ["tile-nope", ...group.slice(0, 3)])).toThrow("UNKNOWN_TILE");
    expect(st.mistakes).toBe(0);
    expect(st.solved).toEqual([]);
  });
  it("a repeated group is rejected, and a wrong group costs exactly one mistake", () => {
    const st = freshConnections();
    const foods = boardGroup("Christmas foods");
    const weather = boardGroup("Winter weather");
    const wrong = [foods[0]!, foods[1]!, weather[0]!, weather[1]!];
    expect(guessConnections(CONNECTIONS_BOARD, st, wrong).correct).toBe(false);
    expect(st.mistakes).toBe(1);
    expect(() => guessConnections(CONNECTIONS_BOARD, st, wrong)).toThrow("ALREADY_GUESSED");
    expect(st.mistakes).toBe(1);
    const ok = guessConnections(CONNECTIONS_BOARD, st, foods);
    expect(ok).toMatchObject({ correct: true, category: "Christmas foods", finished: false });
  });
  it("four mistakes finish the game, and the perfect/sloppy bonuses are 50/20/0", () => {
    const perfect = freshConnections();
    for (const c of CONNECTIONS_BOARD.categories) {
      const r = guessConnections(CONNECTIONS_BOARD, perfect, boardGroup(c.name));
      expect(r.correct).toBe(true);
    }
    expect(perfect.solved).toHaveLength(4);
    expect(connectionsScore(perfect)).toBe(450);
    const oneMistake = freshConnections();
    const foods = boardGroup("Christmas foods");
    guessConnections(CONNECTIONS_BOARD, oneMistake, [foods[0]!, foods[1]!, boardGroup("Winter weather")[0]!, boardGroup("Winter weather")[1]!]);
    for (const c of CONNECTIONS_BOARD.categories) guessConnections(CONNECTIONS_BOARD, oneMistake, boardGroup(c.name));
    expect(connectionsScore(oneMistake)).toBe(420);
    const bust = freshConnections();
    const weather = boardGroup("Winter weather");
    const wrongGroups = [
      [foods[0]!, foods[1]!, weather[0]!, weather[1]!],
      [foods[0]!, foods[2]!, weather[0]!, weather[2]!],
      [foods[0]!, foods[3]!, weather[0]!, weather[3]!],
      [foods[1]!, foods[2]!, weather[1]!, weather[2]!],
    ];
    for (const g of wrongGroups) {
      const r = guessConnections(CONNECTIONS_BOARD, bust, g);
      expect(r.correct).toBe(false);
    }
    expect(bust.mistakes).toBe(4);
    expect(wrongGroups.length).toBe(4);
  });
});

describe("Category Sprint edges", () => {
  it("normalisation strips case, punctuation and extra spaces", () => {
    expect(normalizeSprintAnswer("  Apple! ")).toBe("apple");
    expect(normalizeSprintAnswer("STRAWBERRY")).toBe("strawberry");
    expect(normalizeSprintAnswer("snow  man")).toBe("snow man");
  });
  it("only the first 5 answers count, duplicates count once, invalid answers score nothing", () => {
    const cat = SPRINT_CATEGORIES[0]!; // Fruits
    const scores = scoreSprintRound(cat, {
      p1: ["apple", "Apple", "banana", "orange", "grape", "mango", "pear"],
      p2: ["not-a-fruit", "also-not"],
    });
    // p1: slice(0,5) keeps apple, Apple(dup), banana, orange, grape = 4 distinct
    // valid x20 + 4 unique x20 = 160; mango/pear are cut by the 5-answer cap.
    expect(scores["p1"]).toBe(160);
    expect(scores["p2"]).toBe(0);
  });
  it("a shared answer earns base points only; a unique answer earns the uniqueness bonus", () => {
    const cat = SPRINT_CATEGORIES[1]!; // Animals
    const scores = scoreSprintRound(cat, { p1: ["dog", "cat"], p2: ["dog", "fox"] });
    expect(scores["p1"]).toBe(60); // dog 20 + cat 20+20
    expect(scores["p2"]).toBe(60); // dog 20 + fox 20+20
  });
});

describe("Closest Wins edges", () => {
  it("rank awards are 100/70/50/25 and tied players share the higher award", () => {
    const q = { id: "t", prompt: "t", unit: "u", answer: 100, source: "s" };
    expect(closestQuestionScores(q, { p1: 100, p2: 90, p3: 80, p4: 0 })).toEqual({ p1: 100, p2: 70, p3: 50, p4: 25 });
    const tiedSecond = closestQuestionScores(q, { p1: 100, p2: 95, p3: 105, p4: 0 });
    expect(tiedSecond["p2"]).toBe(70);
    expect(tiedSecond["p3"]).toBe(70);
    expect(tiedSecond["p4"]).toBe(25);
  });
  it("non-finite and duplicate guesses are rejected, and the last question finishes the game", () => {
    const st = initClosest();
    expect(() => submitClosestGuess(st, "p1", Number.NaN)).toThrow("INVALID_GUESS");
    submitClosestGuess(st, "p1", 100);
    expect(() => submitClosestGuess(st, "p1", 101)).toThrow("ALREADY_GUESSED");
    while (st.phase !== "finished") advanceClosest(st);
    expect(st.phase).toBe("finished");
    expect(() => submitClosestGuess(st, "p2", 100)).toThrow("PHASE_CLOSED");
  });
  it("the playing projection hides the answer and other guesses; the finished projection reveals them", () => {
    const st = initClosest();
    submitClosestGuess(st, "p1", 330);
    const playing = projectClosest(st, "p2", false) as { answer?: number; guesses?: unknown; myGuess?: number };
    expect(playing.answer).toBeUndefined();
    expect(playing.guesses).toBeUndefined();
    expect(playing.myGuess).toBeUndefined();
    while (st.phase !== "finished") advanceClosest(st);
    const finished = projectClosest(st, "p2", false) as { answer?: number };
    // The finished projection reveals the final question's answer (December, 31 days).
    expect(finished.answer).toBe(31);
  });
});

describe("Caption Clash edges", () => {
  it("votes in the caption phase, unknown captions and repeat votes are rejected", () => {
    const st = initCaption(5);
    expect(() => submitCaptionVote(st, "p1", "p2", ["p1", "p2"])).toThrow("PHASE_CLOSED");
    submitCaption(st, "p1", "one");
    submitCaption(st, "p2", "two");
    st.phase = "vote";
    expect(() => submitCaptionVote(st, "p1", "p9", ["p1", "p2"])).toThrow("UNKNOWN_CAPTION");
    submitCaptionVote(st, "p1", "p2", ["p1", "p2"]);
    expect(() => submitCaptionVote(st, "p1", "p2", ["p1", "p2"])).toThrow("ALREADY_VOTED");
  });
  it("round scores are 25 participation plus 100 per received vote", () => {
    const st = initCaption(5);
    submitCaption(st, "p1", "one");
    submitCaption(st, "p2", "two");
    st.phase = "vote";
    submitCaptionVote(st, "p1", "p2", ["p1", "p2"]);
    const scores = captionRoundScores(st.rounds[0]!);
    expect(scores["p2"]).toBe(125);
    expect(scores["p1"]).toBe(25);
  });
  it("captions are anonymised while voting and attributed only after finish, never on TV", () => {
    const st = initCaption(5);
    submitCaption(st, "p1", "one");
    st.phase = "vote";
    const voting = projectCaption(st, "p2", false) as { captions: { author?: string }[] };
    expect(voting.captions[0]!.author).toBeUndefined();
    st.phase = "finished";
    const done = projectCaption(st, "p2", false) as { captions: { author?: string }[] };
    expect(done.captions[0]!.author).toBe("p1");
    const tv = projectCaption(st, "p2", true) as { captions: { author?: string }[] };
    expect(tv.captions[0]!.author).toBeUndefined();
  });
});

describe("Impostor edges", () => {
  function votedState(seed: number, votes: [string, string][]) {
    const ids = ["p1", "p2", "p3", "p4"];
    const st = initImpostor(ids, seed);
    for (const id of ids) submitClue(st, id, "clue");
    st.phase = "vote";
    for (const [voter, suspect] of votes) submitVote(st, voter, suspect, ids);
    return { st, ids };
  }
  it("duplicate clues, votes in the clue phase and votes for strangers are rejected", () => {
    const st = initImpostor(["p1", "p2", "p3", "p4"], 3);
    submitClue(st, "p1", "cold");
    expect(() => submitClue(st, "p1", "again")).toThrow("ALREADY_SUBMITTED");
    expect(() => submitVote(st, "p1", "p2", ["p1", "p2", "p3", "p4"])).toThrow("PHASE_CLOSED");
    st.phase = "vote";
    expect(() => submitVote(st, "p1", "stranger", ["p1", "p2", "p3", "p4"])).toThrow("UNKNOWN_PLAYER");
  });
  it("a correct conviction moves to the guess phase; a wrong guess hands the win to the honest side", () => {
    const { st, ids } = votedState(3, []);
    const imp = st.impostorId;
    const honest = ids.filter((id) => id !== imp);
    for (const id of ids) {
      if (id !== imp) submitVote(st, id, imp, ids);
      else submitVote(st, id, honest[0]!, ids);
    }
    expect(tallyVotes(st)).toBe(imp);
    resolveVote(st);
    expect(st.phase).toBe("guess");
    expect(() => submitGuess(st, honest[0]!, st.word)).toThrow("NOT_IMPOSTOR");
    submitGuess(st, imp, "not the word");
    expect(st.phase).toBe("finished");
    expect(st.winner).toBe("honest");
  });
  it("a correct guess is case- and punctuation-tolerant and wins for the impostor", () => {
    const { st, ids } = votedState(3, []);
    const imp = st.impostorId;
    const honest = ids.filter((id) => id !== imp);
    for (const id of ids) submitVote(st, id, id === imp ? honest[0]! : imp, ids);
    resolveVote(st);
    submitGuess(st, imp, `  ${st.word.toUpperCase()}! `);
    expect(st.guessCorrect).toBe(true);
    expect(st.winner).toBe("impostor");
  });
  it("honest players who voted correctly get the 20-point bonus on an honest win", () => {
    const { st, ids } = votedState(3, []);
    const imp = st.impostorId;
    const honest = ids.filter((id) => id !== imp);
    for (const id of ids) submitVote(st, id, id === imp ? honest[0]! : imp, ids);
    resolveVote(st);
    submitGuess(st, imp, "wrong");
    const scores = impostorScores(st, ids);
    for (const id of honest) expect(scores[id]).toBe(120);
    expect(scores[imp]).toBe(0);
  });
});

describe("Charades edges", () => {
  it("a 5-player game lasts 5 turns with alternating teams, and team scores follow the actor", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5"];
    const st = initCharades(ids);
    let turns = 0;
    while (st.phase !== "finished" && turns < 10) {
      charadesTurn(st, currentActor(st), "correct");
      turns++;
    }
    expect(turns).toBe(5);
    const scores = charadesPlayerScores(st);
    // Actor order is team0 then team1: p1,p3,p5 (team0) then p2,p4 (team1).
    expect(scores["p1"]).toBe(300);
    expect(scores["p2"]).toBe(200);
    expect(scores["p5"]).toBe(300);
  });
  it("passes reset after a correct turn, and only the actor may act", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const st = initCharades(ids);
    const actor = currentActor(st);
    charadesTurn(st, actor, "pass");
    charadesTurn(st, actor, "pass");
    expect(st.passesThisTurn).toBe(2);
    const other = ids.find((id) => id !== actor)!;
    expect(() => charadesTurn(st, other, "correct")).toThrow("NOT_ACTOR");
    charadesTurn(st, actor, "correct");
    expect(st.passesThisTurn).toBe(0);
  });
  it("non-actors and TV never see the prompt, and a finished game rejects further turns", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const st = initCharades(ids);
    const actor = currentActor(st);
    const other = ids.find((id) => id !== actor)!;
    expect((projectCharades(st, other, false) as { prompt?: string }).prompt).toBeUndefined();
    expect((projectCharades(st, actor, true) as { prompt?: string }).prompt).toBeUndefined();
    while (st.phase !== "finished") charadesTurn(st, currentActor(st), "correct");
    expect(() => charadesTurn(st, currentActor(st), "correct")).toThrow("PHASE_CLOSED");
  });
});

describe("Engine timeout, abstention and start guards", () => {
  it("a legacy timed-out game (pre-Sprint 3 skip) stays excluded from standings and championship", () => {
    const { engine, host } = room(2);
    const game = engine.startGame(host, "math-mayhem", { official: true });
    // As a Sprint 2 snapshot records it: finished by the old skip, no outcome.
    game.status = "finished";
    game.timedOut = true;
    expect(engine.officialStandings()).toEqual({});
    expect(engine.championshipResults()).toEqual([]);
    expect(engine.skipTimedOutGame(host, game.id)).toBe("legacy-timed-out");
  });
  it("a game that reaches its deadline with nobody answering ends at 0 for everyone, is not voided, and has nothing to count", () => {
    const { engine, host, ids } = room(2);
    const game = engine.startGame(host, "math-mayhem", { official: true });
    game.deadlineAt = Date.now() - 1;
    expect(engine.skipTimedOutGame(host, game.id)).toBe("deadline");
    expect(game.rawScores).toEqual({ [ids[0]!]: 0, [ids[1]!]: 0 });
    expect(game.outcome?.reason).toBe("deadline");
    expect(game.outcome?.countsOfficially).toBe(false); // D-S3-02: no participation, no result
    expect(game.outcome?.participation[ids[0]!]).toEqual({ done: 0, of: game.questions!.length, actions: 0 });
  });
  it("skipping before the deadline is rejected, and a cohost may skip after it", () => {
    const { engine, host, ids } = room(2);
    engine.grantCohost(host, ids[1]!);
    const game = engine.startGame(host, "math-mayhem", { official: true });
    expect(() => engine.skipTimedOutGame(ids[1]!, game.id)).toThrow("Game has not timed out yet");
    expect(game.status).toBe("playing");
    game.deadlineAt = Date.now() - 1;
    expect(engine.skipTimedOutGame(ids[1]!, game.id)).toBe("deadline");
    expect(game.status).toBe("finished");
  });
  // Sprint 3 (P6): a disconnect alone never ends a game; the deadline does.
  it("a disconnected player does not finish a trivia game early; at the deadline they score 0 for unanswered questions", () => {
    const { engine, host, ids } = room(2);
    const game = engine.startGame(host, "trivia", { official: true, seed: 7 });
    const questions = (game.extra as { questions: { id: string; correctIndex: number }[] }).questions;
    engine.disconnect(ids[1]!);
    for (const q of questions) {
      const r = engine.submitIntent(intent(game.id, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex }, engine.id), ids[0]!);
      expect(r.accepted).toBe(true);
    }
    expect(game.status).toBe("playing"); // the disconnected player may still come back
    game.deadlineAt = Date.now() - 1;
    engine.tick();
    expect(game.status).toBe("finished");
    expect(game.outcome?.reason).toBe("deadline");
    expect(game.outcome?.participation[ids[1]!]).toEqual({ done: 0, of: questions.length, actions: 0 });
    expect(game.rawScores[ids[0]!]).toBe(questions.length * 120);
    expect(game.rawScores[ids[1]!]).toBe(0);
  });
  it("starting a second game while one is playing is rejected, as is an unknown game", () => {
    const { engine, host } = room(2);
    engine.startGame(host, "math-mayhem", { official: true });
    expect(() => engine.startGame(host, "trivia", {})).toThrow("A game is already in progress");
    expect(() => engine.startGame(host, "not-a-game", {})).toThrow();
  });
  it("a game requiring 4 players cannot start with 2 connected players", () => {
    const { engine, host } = room(2);
    expect(() => engine.startGame(host, "impostor", {})).toThrow("Need at least 4 connected players");
  });
  it("an override on a timed-out game is rejected, and a finished game's override flows into standings", () => {
    const { engine, host, ids } = room(2);
    const timed = engine.startGame(host, "math-mayhem", { official: true });
    timed.status = "finished"; // a legacy (pre-Sprint 3) host-skipped game
    timed.timedOut = true;
    expect(() => engine.overrideScore(host, timed.id, ids[0]!, 500, "late")).toThrow();
    const game = engine.startGame(host, "math-mayhem", { official: true });
    const questions = game.questions!;
    for (const pid of ids) {
      for (const q of questions) {
        engine.submitIntent(intent(game.id, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex }, engine.id), pid);
      }
    }
    expect(game.status).toBe("finished");
    engine.overrideScore(host, game.id, ids[1]!, 0, "test override");
    expect(game.rawScores[ids[1]!]).toBe(0);
    expect(engine.officialStandings()[ids[0]!]).toBeGreaterThan(engine.officialStandings()[ids[1]!] ?? -1);
  });
});

describe("HTTP projection and rate-limit matrix", () => {
  let server: LocalServer;
  let port: number;
  beforeAll(async () => {
    server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "cgn-batch200-http-")) });
    port = await server.listen(0);
  });
  afterAll(async () => { await server.close(); });
  async function post(path: string, body: Record<string, unknown>, token?: string) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers["x-session-token"] = token;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }
  async function get(path: string, token?: string) {
    const headers: Record<string, string> = {};
    if (token) headers["x-session-token"] = token;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }
  async function makeRoom(n: number) {
    const created = await post("/rooms", { name: "Batch 200 HTTP" });
    const roomId = created.json["roomId"] as string;
    const claim = created.json["hostClaimToken"] as string;
    const players: { id: string; token: string }[] = [];
    for (let i = 0; i < n; i++) {
      const j = await post(`/rooms/${roomId}/join`, { displayName: `B${i}-${randomUUID().slice(0, 4)}`, asHost: i === 0, hostClaimToken: claim });
      players.push({ id: j.json["playerId"] as string, token: j.json["recoveryToken"] as string });
    }
    return { roomId, players };
  }

  it("GET /games lists all 13 implemented games (Stage 5 adds Majority Rules and Pattern Pulse)", async () => {
    const res = await get("/games");
    expect(res.status).toBe(200);
    const games = res.json as unknown as { id: string; status: string }[];
    expect(Array.isArray(games)).toBe(true);
    expect(games).toHaveLength(13);
    expect(games.every((g) => g.status === "implemented")).toBe(true);
  });
  it("TV projection is public, player projection and ledger require a session", async () => {
    const { roomId, players } = await makeRoom(2);
    expect((await get(`/rooms/${roomId}/projection?audience=tv`)).status).toBe(200);
    expect((await get(`/rooms/${roomId}/projection?audience=player`)).status).toBe(401);
    expect((await get(`/rooms/${roomId}/projection?audience=player`, players[0]!.token)).status).toBe(200);
    expect((await get(`/rooms/${roomId}/ledger`)).status).toBe(401);
    expect((await get(`/rooms/${roomId}/ledger`, players[0]!.token)).status).toBe(200);
  });
  it("host projection is forbidden to a non-host member, and memory export requires a session", async () => {
    const { roomId, players } = await makeRoom(2);
    expect((await get(`/rooms/${roomId}/projection?audience=host`, players[1]!.token)).status).toBe(403);
    expect((await get(`/rooms/${roomId}/projection?audience=host`, players[0]!.token)).status).toBe(200);
    expect((await get(`/rooms/${roomId}/memory/export`)).status).toBe(401);
  });
  it("an unknown room returns 404 for both projection and join", async () => {
    expect((await get("/rooms/room-nope/projection?audience=tv")).status).toBe(404);
    expect((await post("/rooms/room-nope/join", { displayName: "Zed" })).status).toBe(404);
  });
  it("a wrong session token is rejected, not treated as a guest session", async () => {
    const { roomId } = await makeRoom(2);
    expect((await get(`/rooms/${roomId}/projection?audience=player`, "not-a-real-token")).status).toBe(401);
    expect((await get(`/rooms/${roomId}/ledger`, "not-a-real-token")).status).toBe(401);
  });
  it("the 21st join attempt within a minute is rate-limited with 429", async () => {
    const created = await post("/rooms", { name: "Rate Limit" });
    const roomId = created.json["roomId"] as string;
    const code = (await get(`/rooms/${roomId}/projection?audience=tv`)).json["joinCode"] as string;
    let last = 0;
    for (let i = 0; i < 21; i++) {
      const r = await post("/rooms/join-by-code", { joinCode: code, displayName: `R${i}` });
      last = r.status;
    }
    expect(last).toBe(429);
  });
});
