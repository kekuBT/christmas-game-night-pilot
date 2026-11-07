/**
 * E3 (Content Quality 2.0, owner-approved): correct answers and their
 * explanations are revealed only once answers are locked, and never in a
 * way that could reach a participant whose question is still open.
 *
 * - Trivia, Geography, Who Said That?, Guess the Year are independent games
 *   (each player at their own pace): nothing until the GAME has finished.
 * - Closest Wins is lock-step: a question's answer appears once that
 *   question has closed, never for the question in play or later ones.
 * Checked in every projection a client can get: each player, a late joiner,
 * and the TV.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, Harness, myGame, type Json, type Player } from "./helpers/harness.js";
import type { ClosestState } from "../src/games/closest.js";

let h: Harness;
let clock: FakeClock;
beforeEach(async () => {
  clock = new FakeClock();
  h = await new Harness(undefined, { clock }).start();
  await h.createRoom();
});
afterEach(async () => { await h.dispose(); });

/** Every key anywhere in a projection that would carry an answer or its reveal. */
function revealKeys(v: unknown, keys: string[], found: string[] = [], path = ""): string[] {
  if (Array.isArray(v)) v.forEach((x, i) => revealKeys(x, keys, found, `${path}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
    if (keys.includes(k) && x !== undefined) found.push(`${path}.${k}`);
    revealKeys(x, keys, found, `${path}.${k}`);
  }
  return found;
}
const gameIn = (proj: Json, gid: string): Json[] => [
  ...((proj["games"] as Json[]) ?? []).filter((g) => g["id"] === gid),
  ...((proj["myGames"] as Json[]) ?? []).filter((g) => g["id"] === gid),
];
async function allViews(players: Player[], late: Player, gid: string): Promise<Json[]> {
  const out: Json[] = [];
  for (const p of [...players, late]) out.push(...gameIn(await h.projection(p), gid));
  out.push(...gameIn(await h.tv(), gid));
  return out;
}

const QUIZ: { gameId: string; action: string; keys: string[] }[] = [
  { gameId: "trivia", action: "trivia-answer", keys: ["correctIndex", "explanation"] },
  { gameId: "geography", action: "geography-answer", keys: ["correctIndex", "explanation"] },
  { gameId: "who-said-that", action: "whosaid-answer", keys: ["correctIndex", "explanation"] },
];

describe("independent quiz games reveal only after the game finishes", () => {
  for (const { gameId, action, keys } of QUIZ) {
    it(`${gameId}: nothing while anyone is still answering; answers + explanations after`, async () => {
      const ada = await h.join("Ada", { host: true });
      const bea = await h.join("Bea");
      // Who Said That needs four players.
      const others = gameId === "who-said-that" ? [await h.join("Cal"), await h.join("Dee")] : [];
      const started = await h.startGame(ada, gameId, { seed: 5 });
      expect(started.status, JSON.stringify(started.body)).toBe(201);
      const gid = started.body["gameId"] as string;
      const late = await h.join("Late");
      const qs = (h.game(gid).extra as { questions: { id: string; correctIndex: number; explanation?: string }[] }).questions;
      // Ada answers every question: she is done, Bea is not.
      for (const q of qs) expect(await h.intent(ada, gid, action, { questionId: q.id, chosenIndex: q.correctIndex })).toMatchObject({ accepted: true });
      for (const p of others) for (const q of qs) await h.intent(p, gid, action, { questionId: q.id, chosenIndex: 0 });
      expect(h.game(gid).status).toBe("playing");
      for (const view of await allViews([ada, bea, ...others], late, gid)) expect(revealKeys(view, [...keys, "answerCounts", "questionPoints"])).toEqual([]);
      // Bea answers the rest: answers are now locked and the game finishes.
      for (const q of qs) await h.intent(bea, gid, action, { questionId: q.id, chosenIndex: (q.correctIndex + 1) % 4 });
      expect(h.game(gid).status).toBe("finished");
      const mine = myGame(await h.projection(bea), gid);
      const shown = ((mine["state"] as Json)["questions"] as Json[]);
      expect(shown.map((q) => q["correctIndex"])).toEqual(qs.map((q) => q.correctIndex));
      for (const [i, q] of qs.entries()) if (q.explanation) expect(shown[i]!["explanation"]).toBe(q.explanation);
      // Bea still sees only her own answers, never Ada's.
      expect((mine["state"] as Json)["myAnswers"]).toEqual(Object.fromEntries(qs.map((q) => [q.id, (q.correctIndex + 1) % 4])));
    });
  }

  it("a game that ends at its deadline reveals then, not before", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gid = (await h.startGame(ada, "geography", { seed: 2 })).body["gameId"] as string;
    const qs = (h.game(gid).extra as { questions: { id: string }[] }).questions;
    await h.intent(ada, gid, "geography-answer", { questionId: qs[0]!.id, chosenIndex: 0 });
    clock.t = h.game(gid).deadlineAt! - 1; h.lifecycleTick();
    expect(revealKeys(myGame(await h.projection(bea), gid), ["correctIndex", "explanation"])).toEqual([]);
    clock.t = h.game(gid).deadlineAt! + 1; h.lifecycleTick();
    expect(h.game(gid).status).toBe("finished");
    expect(revealKeys(myGame(await h.projection(bea), gid), ["correctIndex"]).length).toBe(qs.length);
  });
});

describe("Guess the Year reveals years and context only after the game finishes", () => {
  it("no year or context while playing; both after", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gid = (await h.startGame(ada, "guess-the-year", { seed: 5 })).body["gameId"] as string;
    const late = await h.join("Late");
    const evs = (h.game(gid).extra as { events: { id: string; year: number; context: string }[] }).events;
    for (const e of evs) await h.intent(ada, gid, "year-guess", { eventId: e.id, value: 2000 });
    expect(h.game(gid).status).toBe("playing");
    for (const view of await allViews([ada, bea], late, gid)) expect(revealKeys(view, ["year", "context"])).toEqual([]);
    for (const e of evs) await h.intent(bea, gid, "year-guess", { eventId: e.id, value: 1950 });
    expect(h.game(gid).status).toBe("finished");
    const shown = ((myGame(await h.projection(bea), gid)["state"] as Json)["events"] as Json[]);
    expect(shown.map((e) => [e["year"], e["context"]])).toEqual(evs.map((e) => [e.year, e.context]));
  });
});

describe("Closest Wins reveals each question once it has closed", () => {
  it("the open question and later ones are never revealed; closed ones carry answer, explanation and only your own guess", async () => {
    const [ada, bea, cal] = [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")];
    const gid = (await h.startGame(ada!, "closest-wins", { seed: 5 })).body["gameId"] as string;
    const late = await h.join("Late");
    const st = () => h.game(gid).extra as ClosestState;
    const q0 = st().questions[0]!;
    await h.intent(ada!, gid, "closest-guess", { value: 10 });
    await h.intent(bea!, gid, "closest-guess", { value: 20 });
    // Q1 is still open (Cal hasn't guessed): nothing revealed anywhere.
    for (const view of await allViews([ada!, bea!, cal!], late, gid)) {
      expect(revealKeys(view, ["answer", "explanation"])).toEqual([]);
      expect(((view["state"] as Json)["revealed"] as Json[]) ?? []).toEqual([]);
    }
    await h.intent(cal!, gid, "closest-guess", { value: 30 });
    expect(st().questionIndex).toBe(1);
    const beaView = myGame(await h.projection(bea!), gid)["state"] as Json;
    expect(beaView["revealed"]).toEqual([{ id: q0.id, prompt: q0.prompt, unit: q0.unit, answer: q0.answer, explanation: q0.source, myGuess: 20, myAbstained: false }]);
    // Q2 (now open) is not revealed: only one entry, and no top-level answer.
    expect(beaView["answer"]).toBeUndefined();
    // The TV gets the closed question without anyone's guess.
    const tvRevealed = (gameIn(await h.tv(), gid)[0]!["state"] as Json)["revealed"] as Json[];
    expect(tvRevealed).toEqual([{ id: q0.id, prompt: q0.prompt, unit: q0.unit, answer: q0.answer, explanation: q0.source }]);
    // A question closed by its deadline is revealed too, with the silent player's guess absent.
    await h.intent(ada!, gid, "closest-guess", { value: 1 });
    clock.t = h.game(gid).phaseDeadlineAt! + 1; h.lifecycleTick();
    const calView = myGame(await h.projection(cal!), gid)["state"] as Json;
    expect((calView["revealed"] as Json[]).map((r) => [r["id"], r["myGuess"]])).toEqual([[q0.id, 30], [st().questions[1]!.id, undefined]]);
  });
});
