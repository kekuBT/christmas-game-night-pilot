// Stage 12.3 (docs/stage12/stage123.md): Quick Party inside a Family Cup. A Cup's lineup marks each game Official or
// Practice (D-S123-01); a lineup start runs through every Cup start rule with the item's own mode (D-S123-02); the
// starts are repeat-safe like a casual room's (D-S123-03); and a lineup carries over the upgrade and its undo (D-S123-04).
import { afterEach, describe, expect, it } from "vitest";
import { RoomEngine, partyModesError } from "../src/server/room.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

async function cupRoom(guests = 1, kind: "cup" | "casual" = "cup"): Promise<{ h: Harness; host: Player; others: Player[] }> {
  const h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
  await h.start();
  const r = await h.post("/rooms", { name: "Cup night", kind });
  h.roomId = r.body["roomId"] as string;
  h.joinCode = r.body["joinCode"] as string;
  h.hostClaimToken = r.body["hostClaimToken"] as string;
  const host = await h.join("Keku", { host: true });
  const others: Player[] = [];
  for (const name of ["Amina", "Baraka", "Zoë"].slice(0, guests)) others.push(await h.join(name));
  return { h, host, others };
}
const save = (h: Harness, p: Player, baseRevision: number, items: { gameId: string; official?: boolean }[], expectedPlayers = 2) =>
  h.post(`/rooms/${h.roomId}/party`, { baseRevision, plan: { expectedPlayers, budgetMinutes: 60, items } }, p.token);
const projection = async (h: Harness, p: Player) => (await h.get(`/rooms/${h.roomId}/projection?audience=player`, { "x-session-token": p.token })).body;
const roster = (h: Harness) => h.engine().readiness().wouldPlay;
let n = 0;
const press = (h: Harness) => ({ id: `press-${Date.now().toString(36)}-${n++}`, sessionRevision: h.engine().sessionView().revision });
const startNext = (h: Harness, p: Player, gameId: string, index: number, opts: { official?: boolean; attempt?: { id: string; sessionRevision: number }; fewerThanPlanned?: boolean } = {}) =>
  h.post(`/rooms/${h.roomId}/games`, { gameId, official: opts.official ?? false, roster: roster(h), party: { revision: h.engine().partyRevision, index }, attempt: opts.attempt ?? press(h), ...(opts.fewerThanPlanned ? { fewerThanPlanned: true } : {}) }, p.token);
async function playTrivia(h: Harness, players: Player[], gid: string): Promise<void> {
  for (const p of players) await h.intent(p, gid, "briefing-ready", { ready: true });
  const qs = (h.game(gid).extra as { questions: { id: string; correctIndex: number }[] }).questions;
  for (const [i, p] of players.entries()) for (const q of qs) await h.intent(p, gid, "trivia-answer", { questionId: q.id, chosenIndex: i === 0 ? q.correctIndex : (q.correctIndex + 1) % 4 });
  expect(h.game(gid).status).toBe("finished");
}

describe("partyModesError: a lineup's modes for the room it's in", () => {
  it("casual: never Official; Cup: Official only for a game that can count, a group of two or more, and no casual-only game", () => {
    expect(partyModesError("casual", 4, [{ gameId: "trivia" }])).toBeNull();
    expect(partyModesError("casual", 4, [{ gameId: "trivia", official: true }])).toMatch(/never count/);
    expect(partyModesError("cup", 4, [{ gameId: "trivia", official: true }, { gameId: "impostor" }])).toBeNull();
    expect(partyModesError("cup", 4, [{ gameId: "impostor", official: true }])).toMatch(/practice only/);
    expect(partyModesError("cup", 1, [{ gameId: "trivia", official: true }])).toMatch(/at least 2 players/);
    expect(partyModesError("cup", 1, [{ gameId: "trivia" }])).toBeNull(); // a Practice lineup for one is fine
    expect(partyModesError("cup", 4, [{ gameId: "jebena-rush" }])).toMatch(/casual rooms only/);
  });
});

describe("a Family Cup's Quick Party (HTTP)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("saves a lineup with Official and Practice games; everyone sees each game's mode; a restart keeps it", async () => {
    const r = await cupRoom(2); h = r.h;
    const bad = await save(h, r.host, 0, [{ gameId: "impostor", official: true }]);
    expect([bad.status, bad.body["code"]]).toEqual([400, "INVALID_PLAN"]);
    expect(h.engine().partyRevision).toBe(0); // a refusal changes nothing
    const ok = await save(h, r.host, 0, [{ gameId: "trivia", official: true }, { gameId: "impostor" }, { gameId: "math-mayhem", official: true }], 4);
    expect(ok.status).toBe(200);
    const guestView = (await projection(h, r.others[0]!))["party"] as Json;
    expect((guestView["lineup"] as { items: Json[] }).items.map((i) => [i["gameId"], i["official"]])).toEqual([["trivia", true], ["impostor", false], ["math-mayhem", true]]);
    expect(JSON.stringify(guestView)).not.toMatch(/token|seed/i);
    await h.restart();
    expect(h.engine().party?.items.map((i) => i.official === true)).toEqual([true, false, true]);
    // A casual room refuses an Official item.
    const c = await cupRoom(1, "casual");
    try {
      const refused = await save(c.h, c.host, 0, [{ gameId: "trivia", official: true }]);
      expect([refused.status, refused.body["code"]]).toEqual([400, "INVALID_PLAN"]);
    } finally { await c.h.dispose(); }
  });

  it("an Official item starts an official game that counts; a Practice item a practice game; a press for the other mode starts nothing", async () => {
    const r = await cupRoom(1); h = r.h;
    expect((await save(h, r.host, 0, [{ gameId: "trivia", official: true }, { gameId: "math-mayhem" }])).status).toBe(200);
    // The other mode: refused, nothing started or marked.
    const wrong = await startNext(h, r.host, "trivia", 0, { official: false });
    expect([wrong.status, wrong.body["code"]]).toEqual([409, "PLAN_CONFLICT"]);
    expect(String(wrong.body["error"])).toMatch(/Official in the lineup/);
    expect(h.engine().games.size).toBe(0);
    const s = await startNext(h, r.host, "trivia", 0, { official: true });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    const gid = s.body["gameId"] as string;
    expect(h.game(gid).official).toBe(true);
    await playTrivia(h, [r.host, r.others[0]!], gid);
    const champ = (await projection(h, r.host))["championship"] as Json[];
    expect(champ.length).toBeGreaterThan(0); // it counted toward the Cup
    const p = (await projection(h, r.host))["party"] as { lineup: { next: number; items: Json[] } };
    expect([p.lineup.next, p.lineup.items[0]!["status"]]).toEqual([1, "completed"]);
    const s2 = await startNext(h, r.host, "math-mayhem", 1);
    expect(s2.status, JSON.stringify(s2.body)).toBe(201);
    expect(h.game(s2.body["gameId"] as string).official).toBe(false);
  });

  it("over HTTP a casual room's lineup start is never official (400); a Cup's is when its item is", async () => {
    const c = await cupRoom(1, "casual"); h = c.h;
    await save(h, c.host, 0, [{ gameId: "trivia" }]);
    const r = await startNext(h, c.host, "trivia", 0, { official: true });
    expect(r.status).toBe(400);
  });

  it("repeat-safe: the same press returns the same game; after a cancelled briefing it starts nothing (ATTEMPT_ENDED)", async () => {
    const r = await cupRoom(1); h = r.h;
    await save(h, r.host, 0, [{ gameId: "trivia", official: true }]);
    const rev0 = h.engine().sessionView().revision;
    const attempt = press(h);
    const a = await startNext(h, r.host, "trivia", 0, { official: true, attempt });
    expect(a.status).toBe(201);
    expect(h.engine().sessionView().revision).toBe(rev0 + 1); // a Cup's session moves on with each new game
    const again = await startNext(h, r.host, "trivia", 0, { official: true, attempt });
    expect([again.status, again.body["gameId"], again.body["replay"]]).toEqual([200, a.body["gameId"], true]);
    // The host cancels the briefing: the item is free again, and that old press can't start it.
    expect((await h.post(`/rooms/${h.roomId}/games/${a.body["gameId"]}/cancel`, {}, r.host.token)).status).toBe(200);
    const stale = await startNext(h, r.host, "trivia", 0, { official: true, attempt });
    expect([stale.status, stale.body["code"]]).toEqual([409, "ATTEMPT_ENDED"]);
    expect(h.engine().games.size).toBe(0);
    // A fresh press does, and the remembered presses survive a restart.
    const fresh = await startNext(h, r.host, "trivia", 0, { official: true });
    expect(fresh.status).toBe(201);
    const ops = h.engine().session.ops.length;
    await h.restart();
    expect(h.engine().session.ops.length).toBe(ops);
  });

  it("Cup rules still apply: an Official item with one player here is refused (OFFICIAL_NEEDS_TWO) and nothing is marked", async () => {
    const r = await cupRoom(1); h = r.h;
    await save(h, r.host, 0, [{ gameId: "math-mayhem", official: true }]);
    h.engine().disconnect(r.others[0]!.playerId);
    h.clock.advance(120_000); // past the reconnect grace: not reconnecting any more, just gone
    const res = await startNext(h, r.host, "math-mayhem", 0, { official: true, fewerThanPlanned: true });
    expect([res.status, res.body["code"]]).toEqual([409, "OFFICIAL_NEEDS_TWO"]);
    expect(h.engine().party?.items[0]!.gameInstanceId).toBeUndefined();
    expect(h.engine().games.size).toBe(0);
  });
});

describe("a lineup across Make it a Family Cup and back (D-S123-04)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("games still to play become Official where they can count; played ones stay; the undo makes them all casual again", async () => {
    const r = await cupRoom(1, "casual"); h = r.h;
    expect((await save(h, r.host, 0, [{ gameId: "trivia" }, { gameId: "impostor" }, { gameId: "math-mayhem" }], 4)).status).toBe(200);
    const s = await startNext(h, r.host, "trivia", 0, { fewerThanPlanned: true });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    await playTrivia(h, [r.host, r.others[0]!], s.body["gameId"] as string);
    const rev = h.engine().partyRevision;
    expect((await h.post(`/rooms/${h.roomId}/cup`, {}, r.host.token)).status).toBe(200);
    const items = ((await projection(h, r.others[0]!))["party"] as { revision: number; lineup: { items: Json[] } });
    expect(items.lineup.items.map((i) => [i["gameId"], i["official"], i["status"]])).toEqual([["trivia", false, "completed"], ["impostor", false, "pending"], ["math-mayhem", true, "pending"]]);
    expect(items.revision).toBe(rev + 1); // a new lineup revision: a draft or press made before is stale
    expect((await h.post(`/rooms/${h.roomId}/casual`, {}, r.host.token)).status).toBe(200);
    const back = ((await projection(h, r.host))["party"] as { revision: number; lineup: { items: Json[] } });
    expect(back.lineup.items.every((i) => i["official"] === undefined)).toBe(true);
    expect(back.revision).toBe(rev + 2);
  });

  it("a lineup planned for one stays Practice after the upgrade (an official game needs two)", () => {
    const e = new RoomEngine("x", { kind: "casual" });
    const host = e.join("Keku", { asHost: true }).player.id;
    e.savePartyPlan(host, 0, { expectedPlayers: 1, budgetMinutes: 30, items: [{ gameId: "math-mayhem" }] });
    e.upgradeToCup(host);
    expect(e.party?.items[0]!.official).toBeUndefined();
    expect(e.partyRevision).toBe(1); // nothing changed, so no new revision
  });

  it("a saved Cup lineup whose modes are no longer valid is dropped on restore, never half-loaded", () => {
    const e = new RoomEngine("x", { kind: "cup" });
    const host = e.join("Keku", { asHost: true }).player.id;
    e.join("Amina");
    e.savePartyPlan(host, 0, { expectedPlayers: 2, budgetMinutes: 30, items: [{ gameId: "trivia", official: true }] });
    const snap = JSON.parse(JSON.stringify(e.toJSON())) as { party: { items: { gameId: string; official?: boolean }[] } };
    snap.party.items[0]!.gameId = "impostor"; // practice only, but marked Official
    const restored = RoomEngine.fromJSON(snap as never);
    expect(restored.party).toBeNull();
  });
});
