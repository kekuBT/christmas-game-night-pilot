import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import type { ImpostorState } from "../src/games/impostor.js";
import type { CaptionState } from "../src/games/caption.js";
import type { ClosestState } from "../src/games/closest.js";
import type { TriviaQuestion } from "../src/games/trivia.js";
import { CONNECTIONS_BOARD } from "../src/games/connections.js";

// Per-game abstention semantics (decision L33, refining the L13 open item):
// an EXPLICIT abstain intent counts toward advancement thresholds and scores
// 0 for what was abstained from, but never invents scores. Silence still
// blocks until deadline/host-skip; only an explicit abstain unblocks.

function makeEngine(n: number) {
  const engine = new RoomEngine("Abstain Room");
  const players: string[] = [];
  let host = "";
  for (let i = 0; i < n; i++) {
    const { player } = engine.join(`P${i + 1}`, { asHost: i === 0 });
    players.push(player.id);
    if (player.isHost) host = player.id;
  }
  return { engine, players, host };
}

function intent(roomId: string, gameId: string, action: string, payload: Record<string, unknown> = {}) {
  return { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gameId, action, payload };
}

function submit(engine: RoomEngine, gameId: string, action: string, actor: string, payload: Record<string, unknown> = {}, now?: number) {
  return engine.submitIntent(intent(engine.id, gameId, action, payload), actor, now);
}

function answerAllTrivia(engine: RoomEngine, gameId: string, pid: string) {
  const game = engine.games.get(gameId)!;
  const questions = (game.extra as { questions: TriviaQuestion[] }).questions;
  for (const q of questions) {
    submit(engine, gameId, "trivia-answer", pid, { questionId: q.id, chosenIndex: q.correctIndex });
  }
}

function answerAllMath(engine: RoomEngine, gameId: string, pid: string) {
  const game = engine.games.get(gameId)!;
  for (const q of game.questions!) {
    submit(engine, gameId, "submit-math-answer", pid, { questionId: q.id, chosenIndex: q.correctIndex });
  }
}

describe("abstention semantics (L33)", () => {
  it("impostor: a clue abstention advances to the vote phase", () => {
    const { engine, players, host } = makeEngine(4);
    const game = engine.startGame(host, "impostor", { official: true, seed: 7 });
    const state = game.extra as ImpostorState;
    const abstainer = players[0]!;
    for (const pid of players) {
      if (pid === abstainer) continue;
      expect(submit(engine, game.id, "impostor-clue", pid, { clue: "cold" }).accepted).toBe(true);
    }
    expect(state.phase).toBe("clue");
    expect(submit(engine, game.id, "abstain", abstainer).accepted).toBe(true);
    expect(state.phase).toBe("vote");
    expect(state.abstainedClues).toContain(abstainer);
  });

  it("impostor: a vote abstention resolves the vote; the abstainer gets side points but no voter bonus", () => {
    const { engine, players, host } = makeEngine(4);
    const game = engine.startGame(host, "impostor", { official: true, seed: 7 });
    const state = game.extra as ImpostorState;
    for (const pid of players) submit(engine, game.id, "impostor-clue", pid, { clue: "cold" });
    expect(state.phase).toBe("vote");
    const impostor = state.impostorId;
    const abstainer = players.find((p) => p !== impostor)!;
    for (const pid of players) {
      if (pid === abstainer) continue;
      // The impostor votes too (for an honest player); only the abstainer sits out.
      const target = pid === impostor ? players.find((p) => p !== impostor)! : impostor;
      expect(submit(engine, game.id, "impostor-vote", pid, { suspectId: target }).accepted).toBe(true);
    }
    expect(state.phase).toBe("vote");
    expect(submit(engine, game.id, "abstain", abstainer).accepted).toBe(true);
    expect(state.phase).toBe("guess");
    expect(state.convictedId).toBe(impostor);
    // Convicted impostor guesses wrong: honest side wins.
    expect(submit(engine, game.id, "impostor-guess", impostor, { guess: "definitely not it" }).accepted).toBe(true);
    expect(game.status).toBe("finished");
    expect(game.rawScores[abstainer]).toBe(100); // side win, no +20 voter bonus
    for (const pid of players) {
      if (pid !== impostor && pid !== abstainer) expect(game.rawScores[pid]).toBe(120);
    }
    expect(game.rawScores[impostor]).toBe(0);
  });

  it("impostor: an all-abstain vote convicts nobody, so the impostor wins", () => {
    const { engine, players, host } = makeEngine(4);
    const game = engine.startGame(host, "impostor", { official: true, seed: 7 });
    const state = game.extra as ImpostorState;
    for (const pid of players) submit(engine, game.id, "impostor-clue", pid, { clue: "cold" });
    for (const pid of players) expect(submit(engine, game.id, "abstain", pid).accepted).toBe(true);
    expect(state.phase).toBe("finished");
    expect(state.convictedId).toBeNull();
    expect(state.winner).toBe("impostor");
    expect(game.status).toBe("finished");
  });

  it("impostor: a convicted impostor who abstains from the guess forfeits it (honest wins)", () => {
    const { engine, players, host } = makeEngine(4);
    const game = engine.startGame(host, "impostor", { official: true, seed: 7 });
    const state = game.extra as ImpostorState;
    for (const pid of players) submit(engine, game.id, "impostor-clue", pid, { clue: "cold" });
    const impostor = state.impostorId;
    for (const pid of players) {
      const target = pid === impostor ? players.find((p) => p !== impostor)! : impostor;
      submit(engine, game.id, "impostor-vote", pid, { suspectId: target });
    }
    expect(state.phase).toBe("guess");
    expect(submit(engine, game.id, "abstain", impostor).accepted).toBe(true);
    expect(state.phase).toBe("finished");
    expect(state.winner).toBe("honest");
    expect(state.guessCorrect).toBe(false);
  });

  it("caption: submit and vote abstentions advance rounds; the abstainer earns no participation points", () => {
    const { engine, players, host } = makeEngine(4);
    const game = engine.startGame(host, "caption-clash", { official: true, seed: 7 });
    const state = game.extra as CaptionState;
    const abstainer = players[0]!;
    for (const pid of players) {
      if (pid === abstainer) continue;
      submit(engine, game.id, "caption-submit", pid, { caption: "funny" });
    }
    expect(state.phase).toBe("caption");
    expect(submit(engine, game.id, "abstain", abstainer).accepted).toBe(true);
    expect(state.phase).toBe("vote");
    // Vote: the three caption authors vote for each other's captions; abstainer abstains.
    const round = state.rounds[0]!;
    const authors = Object.keys(round.captions);
    for (const pid of authors) {
      const target = authors.find((a) => a !== pid)!;
      submit(engine, game.id, "caption-vote", pid, { captionId: target });
    }
    expect(submit(engine, game.id, "abstain", abstainer).accepted).toBe(true);
    expect(state.roundIndex).toBe(1);
    // Remaining rounds: everyone (including the former abstainer) plays normally.
    for (let r = 1; r < 3; r++) {
      for (const pid of players) submit(engine, game.id, "caption-submit", pid, { caption: `cap-${r}` });
      const cur = state.rounds[state.roundIndex]!;
      const auths = Object.keys(cur.captions);
      for (const pid of auths) {
        const target = auths.find((a) => a !== pid)!;
        submit(engine, game.id, "caption-vote", pid, { captionId: target });
      }
    }
    expect(game.status).toBe("finished");
    // Abstainer wrote captions in rounds 2-3, so they score there — but round 1
    // contributed nothing (no caption, no vote received).
    const round1Scores = state.rounds[0]!;
    expect(round1Scores.captions[abstainer]).toBeUndefined();
    expect(game.rawScores[abstainer]).toBeGreaterThan(0);
  });

  it("caption: a player who abstains from every round finishes with 0", () => {
    const { engine, players, host } = makeEngine(4);
    const game = engine.startGame(host, "caption-clash", { official: true, seed: 7 });
    const state = game.extra as CaptionState;
    const abstainer = players[0]!;
    for (let r = 0; r < 3; r++) {
      for (const pid of players) {
        if (pid === abstainer) continue;
        submit(engine, game.id, "caption-submit", pid, { caption: `cap-${r}` });
      }
      expect(submit(engine, game.id, "abstain", abstainer).accepted).toBe(true);
      const cur = state.rounds[state.roundIndex]!;
      const auths = Object.keys(cur.captions);
      for (const pid of auths) {
        const target = auths.find((a) => a !== pid)!;
        submit(engine, game.id, "caption-vote", pid, { captionId: target });
      }
      expect(submit(engine, game.id, "abstain", abstainer).accepted).toBe(true);
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores[abstainer]).toBe(0);
  });

  it("closest: a per-question abstention advances the question and scores 0 for it", () => {
    const { engine, players, host } = makeEngine(2);
    const game = engine.startGame(host, "closest-wins", { official: true, seed: 7 });
    const state = game.extra as ClosestState;
    const [p1, p2] = players as [string, string];
    expect(submit(engine, game.id, "closest-guess", p1, { value: 330 }).accepted).toBe(true);
    expect(state.questionIndex).toBe(0);
    expect(submit(engine, game.id, "abstain", p2).accepted).toBe(true);
    expect(state.questionIndex).toBe(1);
    // Abstain on every remaining question: game finishes, abstainer scores 0.
    for (let i = 1; i < 8; i++) {
      submit(engine, game.id, "closest-guess", p1, { value: 0 });
      submit(engine, game.id, "abstain", p2);
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores[p2]).toBe(0);
    expect(game.rawScores[p1]).toBeGreaterThan(0);
  });

  it("trivia: a mid-game abstention lets the others finish; the abstainer keeps only answered points", () => {
    const { engine, players, host } = makeEngine(2);
    const game = engine.startGame(host, "trivia", { official: true, seed: 7 });
    const [p1, p2] = players as [string, string];
    const questions = (game.extra as { questions: TriviaQuestion[] }).questions;
    submit(engine, game.id, "trivia-answer", p1, { questionId: questions[0]!.id, chosenIndex: questions[0]!.correctIndex });
    expect(submit(engine, game.id, "abstain", p1).accepted).toBe(true);
    answerAllTrivia(engine, game.id, p2);
    expect(game.status).toBe("finished");
    expect(game.rawScores[p1]).toBe(120); // one correct answer, rest 0
    expect(game.rawScores[p2]).toBe(1200);
  });

  it("math: a mid-game abstention lets the others finish; unanswered questions score 0", () => {
    const { engine, players, host } = makeEngine(2);
    const game = engine.startGame(host, "math-mayhem", { official: true, seed: 7 });
    const [p1, p2] = players as [string, string];
    const q = game.questions![0]!;
    submit(engine, game.id, "submit-math-answer", p1, { questionId: q.id, chosenIndex: q.correctIndex });
    const before = game.rawScores[p1]!;
    expect(before).toBeGreaterThan(0);
    expect(submit(engine, game.id, "abstain", p1).accepted).toBe(true);
    answerAllMath(engine, game.id, p2);
    expect(game.status).toBe("finished");
    expect(game.rawScores[p1]).toBe(before); // no points added after abstaining
    expect(Object.keys(game.answers[p1] ?? {}).length).toBe(1);
  });

  it("connections: abstaining banks the current score and counts as done", () => {
    const { engine, players, host } = makeEngine(2);
    const game = engine.startGame(host, "word-connections", { official: true, seed: 7 });
    const [p1, p2] = players as [string, string];
    const foods = CONNECTIONS_BOARD.categories[0]!.tiles.map(
      (text) => CONNECTIONS_BOARD.tiles.find((t) => t.text === text)!.id,
    );
    submit(engine, game.id, "connections-guess", p1, { tileIds: foods });
    expect(submit(engine, game.id, "abstain", p1).accepted).toBe(true);
    for (const cat of CONNECTIONS_BOARD.categories) {
      const ids = cat.tiles.map((text) => CONNECTIONS_BOARD.tiles.find((t) => t.text === text)!.id);
      submit(engine, game.id, "connections-guess", p2, { tileIds: ids });
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores[p1]).toBe(100);
    expect(game.rawScores[p2]).toBe(450);
  });

  it("sprint: a round abstention advances the round and scores 0 for the game", () => {
    const { engine, players, host } = makeEngine(4);
    const game = engine.startGame(host, "category-sprint", { official: true, seed: 7 });
    const abstainer = players[0]!;
    // Whole-game abstention: abstain once in round 1; later rounds advance on
    // the other players' submissions alone, and re-abstaining is rejected.
    for (const pid of players) {
      if (pid === abstainer) continue;
      submit(engine, game.id, "sprint-answers", pid, { answers: ["apple"] });
    }
    expect(submit(engine, game.id, "abstain", abstainer).accepted).toBe(true);
    for (let r = 1; r < 3; r++) {
      expect(submit(engine, game.id, "abstain", abstainer)).toMatchObject({ accepted: false, reason: "ALREADY_ABSTAINED" });
      for (const pid of players) {
        if (pid === abstainer) continue;
        submit(engine, game.id, "sprint-answers", pid, { answers: ["apple"] });
      }
    }
    expect(game.status).toBe("finished");
    expect(game.rawScores[abstainer]).toBe(0);
  });

  it("charades: abstention does not apply (Pass already exists) and is rejected", () => {
    const { engine, players, host } = makeEngine(4);
    const game = engine.startGame(host, "charades", { official: true, seed: 7 });
    const res = submit(engine, game.id, "abstain", players[0]!);
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("NOT_APPLICABLE");
  });

  it("abstain rejections: double abstain, abstain after submitting, non-player, deadline, finished game", () => {
    const { engine, players, host } = makeEngine(2);
    const game = engine.startGame(host, "trivia", { official: true, seed: 7 });
    const [p1, p2] = players as [string, string];
    expect(submit(engine, game.id, "abstain", p1).accepted).toBe(true);
    expect(submit(engine, game.id, "abstain", p1)).toMatchObject({ accepted: false, reason: "ALREADY_ABSTAINED" });
    expect(submit(engine, game.id, "abstain", "player-999")).toMatchObject({ accepted: false, reason: "NOT_IN_GAME" });

    const { engine: engine2, players: players2, host: host2 } = makeEngine(4);
    const game2 = engine2.startGame(host2, "impostor", { official: true, seed: 7 });
    submit(engine2, game2.id, "impostor-clue", players2[0]!, { clue: "cold" });
    expect(submit(engine2, game2.id, "abstain", players2[0]!)).toMatchObject({ accepted: false, reason: "ALREADY_SUBMITTED" });

    const { engine: engine3, players: players3, host: host3 } = makeEngine(2);
    const game3 = engine3.startGame(host3, "trivia", { official: true, seed: 7 });
    const late = (game3.deadlineAt ?? 0) + 1000;
    expect(submit(engine3, game3.id, "abstain", players3[0]!, {}, late)).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });

    answerAllTrivia(engine, game.id, p2);
    expect(game.status).toBe("finished");
    expect(submit(engine, game.id, "abstain", p2)).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });
  });

  it("an abstained-then-finished official game still counts in official standings", () => {
    const { engine, players, host } = makeEngine(2);
    const game = engine.startGame(host, "trivia", { official: true, seed: 7 });
    const [p1, p2] = players as [string, string];
    submit(engine, game.id, "abstain", p1);
    answerAllTrivia(engine, game.id, p2);
    expect(game.status).toBe("finished");
    expect(game.timedOut).toBeFalsy();
    const standings = engine.officialStandings();
    expect(standings[p2]).toBeGreaterThan(standings[p1] ?? 0);
    expect(engine.ledger.some((e) => e.type === "player-abstained" && e.playerId === p1 && e.gameInstanceId === game.id)).toBe(true);
  });
});
