/**
 * Sprint 1 Priority F: things that actually happen at a family game night,
 * driven through the real server over HTTP + WebSocket.
 *
 * Two kinds of test live here, and the difference matters:
 *
 * - REQUIREMENT: behaviour Mchezo must have. These guard real guarantees.
 * - CURRENT BEHAVIOUR (decision Dn pending): what the code does today in a
 *   situation whose correct outcome is an owner decision (see
 *   docs/CLAUDE_SPRINT_1_PLAN.md and the Sprint 1 report). They pin the
 *   present behaviour so it cannot change by accident, and they document
 *   the problem for the decision. When the owner decides, these tests
 *   change on purpose, together with the rule.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Harness, myGame, waitFor, type Json, type Player } from "./helpers/harness.js";
import { GAME_POLICIES } from "../src/server/lifecycle.js";

let h: Harness;
beforeEach(async () => { h = await new Harness().start(); await h.createRoom(); });
afterEach(async () => { await h.dispose(); });

/** Answer every Math question for `p` (correctly unless `wrong`). */
async function answerAllMath(p: Player, gid: string, wrong = false) {
  for (const q of h.game(gid).questions!) {
    await h.intent(p, gid, "submit-math-answer", { questionId: q.id, chosenIndex: wrong ? (q.correctIndex + 1) % 4 : q.correctIndex });
  }
}
const standings = () => h.engine().officialStandings();

describe("disconnections during a game", () => {
  it("REQUIREMENT: a player who disconnects after answering keeps their answers and score", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 5 })).body["gameId"] as string;
    await answerAllMath(bea, gid);
    await h.disconnect(bea); // Bea's phone locks after she finishes
    await answerAllMath(ada, gid, true);
    await answerAllMath(cal, gid, true);
    expect(h.game(gid).status).toBe("finished");
    expect(h.game(gid).rawScores[bea.playerId]).toBeGreaterThanOrEqual(1000);
    expect(standings()[bea.playerId]).toBe(100); // she won, and it counts
  });

  it("REQUIREMENT (P6, Sprint 3): when the last unfinished player disconnects, the game waits for them until the deadline", async () => {
    // A disconnect alone never finishes a game: Cal may come back and
    // finish. The deadline (next test) is what ends it if he does not.
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 5 })).body["gameId"] as string;
    await answerAllMath(ada, gid);
    await answerAllMath(bea, gid);
    await h.disconnect(cal);
    expect(h.game(gid).status).toBe("playing");
  });

  it("REQUIREMENT (P3/P4, Sprint 3): at the deadline the server finishes that game by itself and keeps everyone's valid results", async () => {
    // Sprint 1 recorded the old behaviour here: the host skip discarded two
    // complete results. Now the deadline closes the game with no host action,
    // Cal's unanswered questions score 0, and the result counts.
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 5 })).body["gameId"] as string;
    await answerAllMath(ada, gid);
    await answerAllMath(bea, gid);
    await h.disconnect(cal);
    const early = await h.post(`/rooms/${h.roomId}/games/${gid}/skip`, {}, ada.token);
    expect(early.status).toBe(400); // a host cannot cut a game short
    h.game(gid).deadlineAt = Date.now() - 1; // the deadline passes
    expect(h.lifecycleTick()).toBe(1); // the server's own sweep, no request needed
    const g = h.game(gid);
    expect(g.status).toBe("finished");
    expect(g.outcome).toMatchObject({ reason: "deadline", countsOfficially: true });
    expect(g.outcome!.participation[cal.playerId]).toEqual({ done: 0, of: g.questions!.length });
    expect(g.rawScores[cal.playerId]).toBe(0);
    expect(Object.keys(standings()).sort()).toEqual([ada.playerId, bea.playerId, cal.playerId].sort());
    expect(standings()[ada.playerId]).toBeGreaterThan(standings()[cal.playerId]!);
    // A host "skip" afterwards is harmless: it voids nothing.
    expect((await h.post(`/rooms/${h.roomId}/games/${gid}/skip`, {}, ada.token)).body).toMatchObject({ ok: true, reason: "deadline" });
  });

  it("REQUIREMENT: a player who reconnects mid-game gets the same seat, their answers intact, and can finish", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 6 })).body["gameId"] as string;
    const qs = h.game(gid).questions!;
    for (const q of qs.slice(0, 4)) await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    await h.disconnect(bea);
    await h.connect(bea); // tab comes back with its session token
    expect(h.engine().players.get(bea.playerId)!.connected).toBe(true);
    expect(Object.keys(myGame(await h.projection(bea), gid)["myAnswers"] as Json)).toHaveLength(4);
    for (const q of qs.slice(4)) await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    await answerAllMath(ada, gid, true);
    expect(h.game(gid).status).toBe("finished");
    expect(h.game(gid).rawScores[bea.playerId]).toBeGreaterThanOrEqual(1000);
  });

  it("REQUIREMENT: if the host disconnects, a connected cohost can still run the night; the host keeps the role on return", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    expect((await h.post(`/rooms/${h.roomId}/cohost`, { targetId: bea.playerId }, ada.token)).status).toBe(200);
    await h.disconnect(ada);
    // Sprint 2: the host is still inside the reconnect window, so an official
    // start asks first (409); the cohost then deliberately proceeds.
    expect((await h.startGame(bea, "trivia", { seed: 1 })).status).toBe(409);
    const started = await h.startGame(bea, "trivia", { seed: 1, proceedWithout: [ada.playerId] });
    expect(started.status).toBe(201);
    const gid = started.body["gameId"] as string;
    h.game(gid).deadlineAt = Date.now() - 1;
    expect((await h.post(`/rooms/${h.roomId}/games/${gid}/skip`, {}, bea.token)).status).toBe(200);
    expect((await h.post(`/rooms/${h.roomId}/day`, {}, bea.token)).status).toBe(200);
    // A regular player still cannot.
    expect((await h.startGame(cal, "trivia")).status).toBe(400);
    await h.connect(ada);
    expect(h.engine().hostId).toBe(ada.playerId);
    expect(((await h.projection(ada))["me"] as Json)["isHost"]).toBe(true);
  });
});

describe("before the game starts", () => {
  it("REQUIREMENT (Sprint 2): a player whose phone just went to sleep is not left out silently; once the host chooses to start without them, they stay out of that game", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    await h.disconnect(cal);
    const refused = await h.startGame(ada, "trivia", { seed: 2 });
    expect(refused.status).toBe(409);
    expect(refused.body["code"]).toBe("PLAYERS_RECONNECTING");
    const gid = (await h.startGame(ada, "trivia", { seed: 2, proceedWithout: [cal.playerId] })).body["gameId"] as string;
    expect(h.game(gid).players).toEqual([ada.playerId, bea.playerId]);
    await h.connect(cal); // wakes up seconds later
    const q = (myGame(await h.projection(cal), gid)["state"] as { questions: Json[] }).questions[0]!;
    expect(await h.intent(cal, gid, "trivia-answer", { questionId: q["id"], chosenIndex: 0 })).toMatchObject({ accepted: false, reason: "NOT_IN_GAME" });
    expect(myGame(await h.projection(cal), gid)["participant"]).toBe(false);
  });
});

describe("losing a session", () => {
  it("CURRENT BEHAVIOUR (decision D3 pending): a player who loses their browser session cannot rejoin under their name, and their results stay on the old seat", async () => {
    const [ada, gran] = [await h.join("Ada", { host: true }), await h.join("Grandma")];
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 3, official: true })).body["gameId"] as string;
    await answerAllMath(gran, gid);
    await answerAllMath(ada, gid, true);
    // Grandma's tab is closed: sessionStorage (and her token) is gone.
    await h.disconnect(gran);
    const again = await h.post("/rooms/join-by-code", { joinCode: h.joinCode, displayName: "Grandma" });
    expect(again.status).toBe(400);
    expect(again.body["error"]).toBe("Display name already taken");
    const asNew = await h.post("/rooms/join-by-code", { joinCode: h.joinCode, displayName: "Grandma 2" });
    expect(asNew.status).toBe(201);
    expect(h.engine().players.size).toBe(3); // a second seat; the win stays on the first
    expect(standings()[gran.playerId]).toBe(100);
    expect(standings()[asNew.body["playerId"] as string]).toBeUndefined();
  });
});

describe("server restarts", () => {
  it("REQUIREMENT: several rooms, one mid-game, all come back after a restart; players resume with their tokens", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 4 })).body["gameId"] as string;
    const firstQ = h.game(gid).questions![0]!;
    await h.intent(bea, gid, "submit-math-answer", { questionId: firstQ.id, chosenIndex: firstQ.correctIndex });
    const roomA = h.roomId;
    await h.createRoom("Second household");
    const zed = await h.join("Zed", { host: true });
    const roomB = h.roomId;

    await h.restart();
    expect(h.server.restoreReport.loaded.map((l) => l.roomId).sort()).toEqual([roomA, roomB].sort());
    h.roomId = roomA;
    expect(h.engine().players.get(bea.playerId)!.connected).toBe(false); // nobody is "present" until they reconnect
    await h.connect(bea);
    await h.connect(ada);
    expect(myGame(await h.projection(bea), gid)["myAnswers"]).toEqual({ [firstQ.id]: firstQ.correctIndex });
    for (const q of h.game(gid).questions!.slice(1)) await h.intent(bea, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    await answerAllMath(ada, gid, true);
    expect(h.game(gid).status).toBe("finished");
    h.roomId = roomB;
    expect(((await h.projection(zed))["me"] as Json)["displayName"]).toBe("Zed");
  });

  it("REQUIREMENT: one corrupt room file does not stop the family's room loading", async () => {
    const ada = await h.join("Ada", { host: true });
    writeFileSync(join(h.dataDir, "room-0000-corrupt.json"), "{\"id\": \"room-0000");
    await h.restart();
    expect((await h.get(`/rooms/${h.roomId}/projection?audience=player`, { "x-session-token": ada.token })).status).toBe(200);
    expect(h.server.restoreReport.failed.map((f) => f.file)).toEqual(["room-0000-corrupt.json"]);
  });
});

describe("deadlines", () => {
  it("REQUIREMENT (P1/P2, Sprint 3): each game gets its own window from the central policy table", async () => {
    const players = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal"), await h.join("Dee")];
    const gid = (await h.startGame(players[0]!, "caption-clash", { seed: 1 })).body["gameId"] as string;
    const g = h.game(gid);
    expect(g.deadlineAt! - g.startedAt!).toBe(GAME_POLICIES["caption-clash"]!.gameWindowMs); // 10-minute backstop, not 5
    expect(g.phaseDeadlineAt! - g.startedAt!).toBe(GAME_POLICIES["caption-clash"]!.phaseMs!.write!);
    g.deadlineAt = Date.now() - 1;
    expect(await h.intent(players[1]!, gid, "caption-submit", { caption: "a little late" })).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });
  });
});

describe("interrupted and duplicate actions", () => {
  it("REQUIREMENT: if the response to an answer is lost and the phone resends it, the answer is recorded once and the player sees success", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const gid = (await h.startGame(ada, "trivia", { seed: 8 })).body["gameId"] as string;
    const q = (myGame(await h.projection(bea), gid)["state"] as { questions: Json[] }).questions[0]!;
    const id = randomUUID();
    // First send: the server applies it, but pretend the reply never arrived.
    await h.intent(bea, gid, "trivia-answer", { questionId: q["id"], chosenIndex: 1 }, id);
    const resend = await h.intent(bea, gid, "trivia-answer", { questionId: q["id"], chosenIndex: 1 }, id);
    expect(resend).toMatchObject({ accepted: true });
    expect(Object.keys((h.game(gid).extra as { answers: Record<string, Json> }).answers[bea.playerId]!)).toHaveLength(1);
  });

  it("REQUIREMENT: the same action sent over WebSocket and HTTP with one id is applied once", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 8 })).body["gameId"] as string;
    const q = h.game(gid).questions![0]!;
    const body = h.intentBody(gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    const ack = new Promise<Json>((r) => bea.ws!.on("message", (d) => { const m = JSON.parse(d.toString()) as Json; if (m["kind"] === "ack") r(m["result"] as Json); }));
    bea.ws!.send(JSON.stringify(body));
    const wsResult = await ack;
    const httpResult = (await h.post(`/rooms/${h.roomId}/intents`, body, bea.token)).body;
    expect(httpResult).toEqual(wsResult);
    expect(h.engine().ledger.filter((e) => e.type === "score-awarded" && e.playerId === bea.playerId)).toHaveLength(1);
  });
});

describe("spectators and late joiners", () => {
  it("REQUIREMENT: a spectator can watch a whole game: live updates, no seat, no private data, never blocks completion", async () => {
    const [ada, bea] = [await h.join("Ada", { host: true }), await h.join("Bea")];
    const spec = await h.post("/rooms/spectate-by-code", { joinCode: h.joinCode });
    const pushes: Json[] = [];
    const ws = new WebSocket(`ws://localhost:${h.port}/?roomId=${h.roomId}&audience=spectator`, [`cgn-spectator-${spec.body["spectatorToken"]}`]);
    ws.on("message", (d) => pushes.push((JSON.parse(d.toString()) as Json)["state"] as Json));
    await new Promise((r) => ws.once("open", r));
    await waitFor(() => h.engine().spectatorCount() === 1);
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 7 })).body["gameId"] as string;
    expect(h.game(gid).players).toEqual([ada.playerId, bea.playerId]);
    await answerAllMath(ada, gid);
    await answerAllMath(bea, gid, true);
    expect(h.game(gid).status).toBe("finished");
    await waitFor(() => pushes.some((p) => ((p["games"] as Json[]) ?? []).some((g) => g["status"] === "finished")));
    const during = pushes.filter((p) => ((p["games"] as Json[]) ?? []).some((g) => g["status"] === "playing"));
    expect(during.length).toBeGreaterThan(0);
    for (const p of during) expect(JSON.stringify(p)).not.toMatch(/correctIndex|correctAnswer|recoveryToken|tokenHash/);
    ws.terminate();
  });

  it("REQUIREMENT: a late joiner cannot see or act on a game's private information (see tests/privacy.test.ts)", async () => {
    const players = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal"), await h.join("Dee")];
    const gid = (await h.startGame(players[0]!, "impostor", { seed: 2 })).body["gameId"] as string;
    const word = (h.game(gid).extra as { word: string }).word;
    const late = await h.join("Latecomer");
    expect(JSON.stringify(await h.projection(late))).not.toContain(word);
    expect(JSON.stringify(late.lastPush)).not.toContain(word);
  });
});
