// Sprint 4: Caption Clash voting is genuinely anonymous.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RoomEngine } from "../src/server/room.js";
import type { CaptionState } from "../src/games/caption.js";

type Json = Record<string, unknown>;
function setup(n = 4) {
  let t = 1_800_000_000_000;
  const engine = new RoomEngine("Cap");
  engine.clock = () => t;
  const ids = [engine.join("Ada", { asHost: true }).player.id];
  for (const name of ["Bea", "Cal", "Dee", "Eli"].slice(0, n - 1)) ids.push(engine.join(name).player.id);
  const g = engine.startGame(ids[0]!, "caption-clash", { official: true, seed: 9 });
  const act = (pid: string, action: string, payload: Json) => engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: g.id, action, payload }, pid);
  const view = (pid?: string) => (pid ? (engine.project("player", pid) as { myGames: { state: Json }[] }).myGames[0]!.state : (engine.project("tv") as { games: { state: Json }[] }).games[0]!.state);
  const writeAll = (texts: string[]) => ids.forEach((pid, i) => act(pid, "caption-submit", { caption: texts[i] }));
  return { engine, g, ids, act, view, writeAll, st: () => g.extra as CaptionState, tick: (ms: number) => { t += ms; engine.tick(); } };
}

describe("Caption Clash anonymity", () => {
  it("during voting no caption carries its author's player id, and order is not submission order", () => {
    const s = setup();
    s.writeAll(["one", "two", "three", "four"]);
    const caps = s.view(s.ids[1]!)["captions"] as { id: string; text: string; mine?: boolean }[];
    expect(caps).toHaveLength(4);
    const json = JSON.stringify([s.view(s.ids[1]!), s.view()]);
    for (const pid of s.ids) expect(json).not.toContain(pid);
    expect(caps.every((c) => /^c-[0-9a-f]{10}$/.test(c.id))).toBe(true);
    // Deterministic, and different from the order captions were submitted in for at least one seed.
    expect(caps.map((c) => c.text)).toEqual((s.view(s.ids[2]!)["captions"] as { text: string }[]).map((c) => c.text));
  });

  it("only you see which caption is yours", () => {
    const s = setup();
    s.writeAll(["one", "two", "three", "four"]);
    const bea = s.view(s.ids[1]!)["captions"] as { text: string; mine?: boolean }[];
    expect(bea.filter((c) => c.mine).map((c) => c.text)).toEqual(["two"]);
    expect((s.view()["captions"] as { mine?: boolean }[]).some((c) => c.mine)).toBe(false);
  });

  it("votes by anonymous id count for the right author; voting for yourself is refused", () => {
    const s = setup();
    s.writeAll(["one", "two", "three", "four"]);
    const caps = (pid: string) => s.view(pid)["captions"] as { id: string; text: string; mine?: boolean }[];
    const idOf = (pid: string, text: string) => caps(pid).find((c) => c.text === text)!.id;
    expect(s.act(s.ids[1]!, "caption-vote", { captionId: idOf(s.ids[1]!, "two") })).toMatchObject({ accepted: false, reason: "OWN_VOTE" });
    for (const pid of s.ids.slice(1)) expect(s.act(pid, "caption-vote", { captionId: idOf(pid, "one") }).accepted).toBe(true);
    expect(s.act(s.ids[0]!, "caption-vote", { captionId: idOf(s.ids[0]!, "three") }).accepted).toBe(true);
    const r0 = s.st().rounds[0]!;
    expect(Object.values(r0.votes).filter((v) => v === s.ids[0]).length).toBe(3);
    // The next round shows last round's result: counts, no authors.
    const last = s.view(s.ids[2]!)["lastRound"] as { captions: { text: string; votes: number; author?: string }[] };
    expect(last.captions[0]).toMatchObject({ text: "one", votes: 3 });
    expect(last.captions.some((c) => c.author)).toBe(false);
  });

  it("authors are revealed to players when the game ends, never on the TV", () => {
    const s = setup();
    for (let r = 0; r < 3; r++) {
      s.writeAll(["a", "b", "c", "d"].map((x) => `${x}${r}`));
      s.tick(46_000); // vote phase closes on time
    }
    expect(s.g.status).toBe("finished");
    const mine = s.view(s.ids[0]!)["rounds"] as { captions: { author?: string }[] }[];
    expect(mine.every((r) => r.captions.every((c) => typeof c.author === "string"))).toBe(true);
    const tv = s.view()["rounds"] as { captions: { author?: string }[] }[];
    expect(tv.every((r) => r.captions.every((c) => c.author === undefined))).toBe(true);
  });

  it("an older client voting by author id still works", () => {
    const s = setup();
    s.writeAll(["one", "two", "three", "four"]);
    expect(s.act(s.ids[1]!, "caption-vote", { captionId: s.ids[0]! }).accepted).toBe(true);
    expect(s.st().rounds[0]!.votes[s.ids[1]!]).toBe(s.ids[0]);
  });
});
