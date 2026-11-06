/**
 * Sprint 3 privacy: the lifecycle data added this sprint (outcomes,
 * participation, phase keys, Math open/answer times, untimed-client marks)
 * never exposes private answers, who chose to sit out, or another player's
 * timing, to the TV, spectators, or other players.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, Harness, myGame, type Json, type Player } from "./helpers/harness.js";
import { GAME_POLICIES } from "../src/server/lifecycle.js";

let h: Harness;
let clock: FakeClock;
beforeEach(async () => { clock = new FakeClock(); h = await new Harness(undefined, { clock }).start(); await h.createRoom(); });
afterEach(async () => { await h.dispose(); });

const FORBIDDEN_PUBLIC = ["openedAt", "answerTimes", "myAnswerTimes", "promptsExposed", "abstained", "correctIndex", "myAnswers", "answers"];
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
}
async function trio(): Promise<Player[]> { return [await h.join("Ada", { host: true }), await h.join("Bea"), await h.join("Cal")]; }

describe("Sprint 3 projections stay private", () => {
  it("a finished deadline Trivia game: the TV sees counts, never answers or who sat out", async () => {
    const [ada, bea, cal] = await trio();
    const gid = (await h.startGame(ada!, "trivia", { seed: 2 })).body["gameId"] as string;
    const qs = (h.game(gid).extra as { questions: { id: string; correctIndex: number }[] }).questions;
    for (const q of qs.slice(0, 4)) await h.intent(bea!, gid, "trivia-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    await h.intent(cal!, gid, "abstain", {});
    // During play: nothing private in the public view.
    const during = await h.tv();
    const pubDuring = (during["games"] as Json[]).find((g) => g["id"] === gid)!;
    for (const k of FORBIDDEN_PUBLIC) expect(keysDeep(pubDuring).has(k), `public game has "${k}" during play`).toBe(false);
    expect(pubDuring["outcome"]).toBeUndefined();
    clock.advance(GAME_POLICIES["trivia"]!.gameWindowMs + 1);
    h.lifecycleTick();
    const tv = await h.tv();
    const pub = (tv["games"] as Json[]).find((g) => g["id"] === gid)!;
    const outcome = pub["outcome"] as Json;
    expect(Object.keys(outcome).sort()).toEqual(["completedUnits", "countsOfficially", "endedAt", "participation", "reason", "totalUnits"].filter((k) => k in outcome).sort());
    for (const p of Object.values(outcome["participation"] as Record<string, Json>)) {
      for (const k of Object.keys(p)) expect(["done", "of", "finished"]).toContain(k);
    }
    // Cal sat out and Ada did nothing look the same to others: 0 of N.
    expect((outcome["participation"] as Json)[cal!.playerId]).toEqual((outcome["participation"] as Json)[ada!.playerId]);
    expect(JSON.stringify(tv)).not.toMatch(/abstain/i);
    // Bea's view of Cal: no abstention flag about anyone but herself.
    const beaView = await h.projection(bea!);
    expect(JSON.stringify(beaView["games"])).not.toMatch(/abstain/i);
    expect(myGame(beaView, gid)["abstained"]).toBe(false);
    expect(myGame(await h.projection(cal!), gid)["abstained"]).toBe(true); // only Cal learns his own choice
  });

  it("Math: open times, answer times and untimed-client marks are never shown to others", async () => {
    const [ada, bea] = await trio();
    const gid = (await h.startGame(ada!, "math-mayhem", { seed: 4 })).body["gameId"] as string;
    const q = h.game(gid).questions![0]!;
    await h.intent(bea!, gid, "math-open", { questionId: q.id });
    clock.advance(2_000);
    await h.intent(bea!, gid, "submit-math-answer", { questionId: q.id, chosenIndex: q.correctIndex });
    h.legacyClient = true; await h.projection(ada!); h.legacyClient = false; // Ada's old tab
    const tv = await h.tv();
    for (const k of FORBIDDEN_PUBLIC) expect(keysDeep(tv["games"]).has(k), `TV games have "${k}"`).toBe(false);
    expect(JSON.stringify(tv)).not.toContain(q.prompt); // no Math prompt on the TV during play
    const adaView = myGame(await h.projection(ada!), gid);
    expect(adaView["myAnswerTimes"]).toEqual({}); // Ada sees only her own (none), never Bea's 2000 ms
    expect(JSON.stringify(await h.projection(ada!))).not.toMatch(/:2000[,}]/); // Bea's 2000 ms appears nowhere in Ada's view
    const beaView = myGame(await h.projection(bea!), gid);
    expect(beaView["myAnswerTimes"]).toEqual({ [q.id]: 2_000 });
    expect(beaView["refreshNeeded"]).toBeUndefined(); // Ada's old tab is not Bea's business
    // A player who has not opened a question never receives its prompt.
    expect(((beaView["questions"] as Json[])[1]!)["prompt"]).toBeUndefined();
  });

  it("phase keys reveal position only, never content (Impostor, practice)", async () => {
    const ps = [...await trio(), await h.join("Dee")];
    const gid = (await h.startGame(ps[0]!, "impostor", { seed: 5 })).body["gameId"] as string;
    const pub = ((await h.tv())["games"] as Json[]).find((g) => g["id"] === gid)!;
    expect((pub["lifecycle"] as Json)["phaseKey"]).toBe("clue");
    const word = (h.game(gid).extra as { word: string }).word;
    expect(JSON.stringify(pub)).not.toContain(word);
  });
});
