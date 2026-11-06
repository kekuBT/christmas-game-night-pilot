/**
 * Sprint 1 Priority D: private game information reaches only eligible,
 * authorized participants. Exercised over real HTTP and WebSocket.
 *
 * Joining the room, spectating, reconnecting and taking part in a game
 * are separate things: only players listed in a game's roster at start
 * may receive that game's private state.
 */
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Harness, myGame, type Json, type Player } from "./helpers/harness.js";
import type { CharadesState } from "../src/games/charades.js";
import type { ImpostorState } from "../src/games/impostor.js";

let h: Harness;
beforeEach(async () => { h = await new Harness().start(); await h.createRoom(); });
afterEach(async () => { await h.dispose(); });

async function spectator(): Promise<{ token: string; projection: () => Promise<{ status: number; body: Json }> }> {
  const r = await h.post("/rooms/spectate-by-code", { joinCode: h.joinCode });
  const token = r.body["spectatorToken"] as string;
  return { token, projection: () => h.get(`/rooms/${h.roomId}/projection?audience=spectator`, { "x-spectator-token": token }) };
}

/** First projection a fresh WebSocket receives. */
function firstPush(url: string, protocols: string[] = []): Promise<Json> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, protocols);
    ws.once("message", (d) => { ws.terminate(); resolve((JSON.parse(d.toString()) as Json)["state"] as Json); });
    ws.once("close", (code) => reject(new Error(`closed ${code}`)));
    ws.once("error", reject);
  });
}

describe("Impostor: secret word and hidden role", () => {
  let players: Player[];
  let gameId: string;
  let state: ImpostorState;
  beforeEach(async () => {
    players = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal"), await h.join("Dee")];
    gameId = (await h.startGame(players[0]!, "impostor", { seed: 11 })).body["gameId"] as string;
    state = h.game(gameId).extra as ImpostorState;
  });

  it("each eligible player sees only their own role; honest players get the word, the impostor does not", async () => {
    for (const p of players) {
      const g = myGame(await h.projection(p), gameId);
      const st = g["state"] as Json;
      expect(g["participant"]).toBe(true);
      if (p.playerId === state.impostorId) {
        expect(st["role"]).toBe("impostor");
        expect(st["word"]).toBeUndefined();
      } else {
        expect(st["role"]).toBe("honest");
        expect(st["word"]).toBe(state.word);
      }
      // Nobody is told who the impostor is.
      expect(JSON.stringify(await h.projection(p))).not.toContain(`"impostorId"`);
    }
  });

  it("an eligible player who reconnects gets the same private view back", async () => {
    const bea = players[1]!;
    const before = myGame(await h.projection(bea), gameId)["state"];
    await h.disconnect(bea);
    const r = await h.post(`/rooms/${h.roomId}/reconnect`, { playerId: bea.playerId, recoveryToken: bea.token });
    expect(r.status).toBe(200);
    await h.connect(bea);
    expect(myGame(await h.projection(bea), gameId)["state"]).toEqual(before);
  });

  it("a player who joins the room after the game started is not a participant and never receives the word (HTTP and WebSocket)", async () => {
    const late = await h.join("Latecomer");
    expect(h.game(gameId).players).not.toContain(late.playerId);
    const proj = await h.projection(late);
    const g = myGame(proj, gameId);
    expect(g["participant"]).toBe(false);
    expect((g["state"] as Json)["role"]).toBeUndefined();
    expect(JSON.stringify(proj)).not.toContain(state.word);
    const pushed = await firstPush(`ws://localhost:${h.port}/?roomId=${h.roomId}&audience=player`, [`cgn-session-${late.token}`]);
    expect(JSON.stringify(pushed)).not.toContain(state.word);
    // And cannot act in the game either.
    const vote = await h.intent(late, gameId, "impostor-clue", { clue: "hello" });
    expect(vote).toMatchObject({ accepted: false, reason: "NOT_IN_GAME" });
  });

  it("TV and spectator projections never contain the word or the impostor, in any phase", async () => {
    const spec = await spectator();
    const check = async () => {
      for (const body of [await h.tv(), (await h.get(`/rooms/${h.roomId}`)).body, (await spec.projection()).body]) {
        const text = JSON.stringify(body);
        expect(text).not.toContain(state.word);
        expect(text).not.toContain(`"impostorId"`);
        expect(text).not.toContain(`"role"`);
      }
    };
    await check(); // clue phase
    for (const p of players) await h.intent(p, gameId, "impostor-clue", { clue: `clue from ${p.name}` });
    expect(state.phase).toBe("vote");
    await check(); // vote phase
  });

  it("after the game finishes, participants see the revealed word; the public view still shows only the outcome", async () => {
    for (const p of players) await h.intent(p, gameId, "impostor-clue", { clue: "c" });
    const innocent = players.find((p) => p.playerId !== state.impostorId)!;
    for (const p of players) await h.intent(p, gameId, "impostor-vote", { suspectId: p.playerId === innocent.playerId ? players.find((x) => x !== innocent)!.playerId : innocent.playerId });
    if (state.phase === "guess") {
      const imp = players.find((p) => p.playerId === state.impostorId)!;
      await h.intent(imp, gameId, "impostor-guess", { guess: "wrong" });
    }
    expect(h.game(gameId).status).toBe("finished");
    expect((myGame(await h.projection(players[0]!), gameId)["state"] as Json)["revealedWord"]).toBe(state.word);
    expect(JSON.stringify(await h.tv())).not.toContain(state.word);
  });
});

describe("Charades: the actor's prompt", () => {
  it("only the current actor receives the prompt; teammates, late joiners, TV and spectators do not", async () => {
    const players = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal"), await h.join("Dee")];
    const gameId = (await h.startGame(players[0]!, "charades")).body["gameId"] as string;
    const st = h.game(gameId).extra as CharadesState;
    const actor = [...st.teams[0]!, ...st.teams[1]!][0]!;
    const prompt = st.prompts[0]!;
    const late = await h.join("Latecomer");
    const spec = await spectator();
    for (const p of [...players, late]) {
      const text = JSON.stringify(await h.projection(p));
      if (p.playerId === actor) expect(text).toContain(prompt);
      else expect(text).not.toContain(prompt);
    }
    expect(JSON.stringify(await h.tv())).not.toContain(prompt);
    expect(JSON.stringify((await spec.projection()).body)).not.toContain(prompt);
  });
});

describe("answer keys and private answers", () => {
  it("Trivia: no audience sees correct answers while playing; a late joiner never sees anyone's answers", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gameId = (await h.startGame(ada, "trivia", { seed: 3 })).body["gameId"] as string;
    const q = (myGame(await h.projection(ada), gameId)["state"] as { questions: Json[] }).questions[0]!;
    await h.intent(ada, gameId, "trivia-answer", { questionId: q["id"], chosenIndex: 2 });
    const late = await h.join("Latecomer");
    const spec = await spectator();
    for (const body of [await h.projection(ada), await h.projection(bea), await h.projection(late), await h.tv(), (await spec.projection()).body]) {
      expect(JSON.stringify(body)).not.toContain("correctIndex");
    }
    const lateGame = myGame(await h.projection(late), gameId);
    expect(lateGame["myAnswers"]).toEqual({});
    expect((lateGame["state"] as Json)["myAnswers"]).toBeUndefined();
  });

  it("Math: no audience sees the answer key while playing, and the ledger hides live per-answer points from other players", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gameId = (await h.startGame(ada, "math-mayhem", { seed: 9 })).body["gameId"] as string;
    const q = h.game(gameId).questions![0]!;
    await h.intent(ada, gameId, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    for (const body of [await h.projection(ada), await h.projection(bea), await h.tv()]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain("correctIndex");
      expect(text).not.toContain("correctAnswer");
    }
    const ledger = (await h.get(`/rooms/${h.roomId}/ledger`, { "x-session-token": bea.token })).body as unknown as Json[];
    expect(ledger.some((e) => e["type"] === "score-awarded" && e["gameInstanceId"] === gameId)).toBe(false);
    // The server still records them (scoring and audit are unaffected).
    expect(h.engine().ledger.some((e) => e.type === "score-awarded" && e.gameInstanceId === gameId)).toBe(true);
  });

  it("Caption Clash: authors stay anonymous to everyone during the vote", async () => {
    const players = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal"), await h.join("Dee")];
    const gameId = (await h.startGame(players[0]!, "caption-clash", { seed: 4 })).body["gameId"] as string;
    for (const p of players) await h.intent(p, gameId, "caption-submit", { caption: `caption by ${p.name}` });
    for (const body of [...await Promise.all(players.map((p) => h.projection(p))), await h.tv()]) {
      const games = [...((body["games"] as Json[]) ?? []), ...((body["myGames"] as Json[]) ?? [])];
      for (const g of games) for (const c of (((g["state"] as Json)?.["captions"] as Json[]) ?? [])) expect(c["author"]).toBeUndefined();
    }
  });

  it("abstentions: a player's ledger shows their own abstention but never another player's (decision L33)", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gameId = (await h.startGame(ada, "trivia", { seed: 3 })).body["gameId"] as string;
    await h.intent(bea, gameId, "abstain", {});
    const ledgerFor = async (p: Player) => (await h.get(`/rooms/${h.roomId}/ledger`, { "x-session-token": p.token })).body as unknown as Json[];
    expect((await ledgerFor(bea)).some((e) => e["type"] === "player-abstained")).toBe(true);
    expect((await ledgerFor(ada)).some((e) => e["type"] === "player-abstained")).toBe(false);
    expect(JSON.stringify(await h.projection(ada))).not.toMatch(/"abstained":true/);
  });
});

describe("authorization of private projections", () => {
  it("player projections and the ledger require a valid session token", async () => {
    await h.join("Ada", { host: true });
    expect((await h.get(`/rooms/${h.roomId}/projection?audience=player`)).status).toBe(401);
    expect((await h.get(`/rooms/${h.roomId}/projection?audience=player`, { "x-session-token": "f".repeat(64) })).status).toBe(401);
    expect((await h.get(`/rooms/${h.roomId}/ledger`, { "x-session-token": "nope" })).status).toBe(401);
  });

  it("a session token from another room is not accepted", async () => {
    const other = new Harness();
    other.server = h.server; other.base = h.base; other.port = h.port;
    await other.createRoom("Other");
    const stranger = await other.join("Stranger", { connect: false });
    expect((await h.get(`/rooms/${h.roomId}/projection?audience=player`, { "x-session-token": stranger.token })).status).toBe(401);
  });

  it("an invalid WebSocket session is closed with 1008 before any state is sent", async () => {
    await h.join("Ada", { host: true });
    await expect(firstPush(`ws://localhost:${h.port}/?roomId=${h.roomId}&audience=player`, ["cgn-session-bogus"])).rejects.toThrow("closed 1008");
  });

  it("a spectator token is not a player session, and a player token is not a spectator credential", async () => {
    const ada = await h.join("Ada", { host: true });
    const spec = await spectator();
    expect((await h.get(`/rooms/${h.roomId}/projection?audience=player`, { "x-session-token": spec.token })).status).toBe(401);
    expect((await h.get(`/rooms/${h.roomId}/projection?audience=spectator`, { "x-spectator-token": ada.token })).status).toBe(401);
  });
});
