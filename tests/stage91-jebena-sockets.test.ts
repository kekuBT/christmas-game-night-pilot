/**
 * Stage 9.1 (docs/stage9/stage91.md §9, §12): Jebena Rush over the product
 * path, a real LocalServer driven over HTTP with every player holding a real
 * WebSocket, at 2, 4 and 10 players. A fake server clock drives the turns:
 * everything below is decided on server time, once.
 *   - the lobby's hearts reach every socket; the Start binds them;
 *   - every push names one holder, never carries the bank or another
 *     player's tries, and agrees with the server;
 *   - turns time out on the clock with nobody acting (a heart, a new
 *     category, the jebena passes); players run out and watch; the last one
 *     with hearts keeps the jebena; scores and places match on every socket;
 *   - a holder whose socket drops loses the heart on time (no free life, no
 *     pause); reconnecting shows the current turn and resubmits nothing;
 *   - an answer at the deadline instant counts; one after it doesn't.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { JEBENA_CATEGORIES } from "../src/games/modules/packs/jebena-banks.js";
import { JEBENA_GRACE_MS, JEBENA_TURN_MS, jebenaPoints, type JebenaState } from "../src/games/modules/jebena.js";
import { FakeClock, Harness, myGame, waitFor, type Json, type Player } from "./helpers/harness.js";

let h: Harness | null = null;
afterEach(async () => { await h?.dispose(); h = null; });
const TURN = JEBENA_TURN_MS + JEBENA_GRACE_MS;

async function casualRoom(n: number) {
  const clock = new FakeClock();
  h = new Harness(undefined, { clock, timing: 2 });
  await h.start();
  const r = await h.post("/rooms", { name: "Jebena night", kind: "casual" });
  h.roomId = r.body["roomId"] as string;
  h.joinCode = r.body["joinCode"] as string;
  h.hostClaimToken = r.body["hostClaimToken"] as string;
  const ps: Player[] = [await h.join("Keku", { host: true })];
  for (let i = 1; i < n; i++) ps.push(await h.join(`P${i}`));
  return { h, clock, ps };
}

/** Wait until every socket has had a push that satisfies `ok`. */
async function allPushes(ps: Player[], ok: (proj: Json, p: Player) => boolean, ms = 3000): Promise<void> {
  await waitFor(() => ps.every((p) => !!p.lastPush && ok(p.lastPush, p)), ms);
}

async function startJebena(h: Harness, ps: Player[], hearts: number) {
  const host = ps[0]!;
  const before = await h.projection(host);
  const set = await h.post(`/rooms/${h.roomId}/game-settings`, { gameId: "jebena-rush", settings: { hearts }, baseRevision: (before["session"] as Json)["revision"] }, host.token);
  expect(set.status).toBe(200);
  // Every socket hears the host's choice.
  await allPushes(ps, (proj) => ((proj["lobbySettings"] as Json | undefined)?.["jebena-rush"] as Json | undefined)?.["hearts"] === hearts);
  const now = await h.projection(host);
  const start = await h.post(`/rooms/${h.roomId}/games`, { gameId: "jebena-rush", official: false, roster: ps.map((p) => p.playerId), attempt: { id: randomUUID(), sessionRevision: (now["session"] as Json)["revision"] }, season: now["contentSeason"], settings: { hearts } }, host.token);
  expect(start.status).toBe(201);
  const gid = start.body["gameId"] as string;
  for (const p of ps) expect((await h.intent(p, gid, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
  expect(h.game(gid).status).toBe("playing");
  return gid;
}

const st = (h: Harness, gid: string) => h.game(gid).extra as JebenaState;
/** An unused canonical answer in the current category (server truth; test side only). */
function fresh(s: JebenaState): string {
  const cat = JEBENA_CATEGORIES.find((c) => c.id === s.category)!;
  const used = new Set(s.used[s.category] ?? []);
  return cat.answers.find((a) => !used.has(a.id))!.name;
}

/** What a push may never carry: the bank (aliases, any unused answer) or anyone's private tries. */
function assertPushIsClean(proj: Json, s: JebenaState): void {
  const text = JSON.stringify(proj);
  expect(text).not.toContain("aliases");
  expect(text).not.toContain("\"attempts\"");
  expect(text).not.toContain("\"used\"");
  const cat = JEBENA_CATEGORIES.find((c) => c.id === s.category)!;
  const used = new Set(s.used[s.category] ?? []);
  for (const a of cat.answers) if (!used.has(a.id)) expect(text).not.toContain(`"${a.name}"`);
}

describe.each([2, 4, 10])("Jebena Rush over real sockets, %i players", (n) => {
  it("a whole match: hearts from the lobby, one holder at a time, timeouts on the server clock, outs, the last one keeps the jebena", async () => {
    const { h, clock, ps } = await casualRoom(n);
    const gid = await startJebena(h, ps, 3);
    const byId = new Map(ps.map((p) => [p.playerId, p]));
    // The first push of play: every socket names the same single holder; only the holder's says myTurn.
    await allPushes(ps, (proj) => (myGame(proj, gid)?.["state"] as Json | undefined)?.["turn"] !== undefined);
    const s0 = st(h, gid);
    for (const p of ps) {
      const view = myGame(p.lastPush!, gid)["state"] as Json;
      expect((view["turn"] as Json)["player"]).toBe(s0.turn!.player);
      expect(view["myTurn"]).toBe(p.playerId === s0.turn!.player);
      expect(view["startHearts"]).toBe(3);
      assertPushIsClean(p.lastPush!, s0);
    }
    // Keku (the host) answers every turn he holds; everyone else lets time run out.
    const keku = ps[0]!.playerId;
    let turns = 0;
    while (h.game(gid).status === "playing" && turns++ < 200) {
      const s = st(h, gid);
      const holder = s.turn!.player;
      const n0 = s.turn!.n;
      if (holder === keku) {
        const r = await h.intent(byId.get(holder)!, gid, "jebena-answer", { turn: n0, text: fresh(s), phaseKey: `turn:${n0}` });
        expect(r).toMatchObject({ accepted: true, result: { verdict: "accepted" } });
        clock.advance(1000);
        continue;
      }
      const hearts = s.per[holder]!.hearts;
      const cat = s.category;
      // Nothing happens before the deadline (the sweep runs at the deadline instant itself)…
      clock.advance(h.game(gid).phaseDeadlineAt! - clock.t);
      h.lifecycleTick();
      expect(st(h, gid).turn?.n).toBe(n0);
      // …and exactly once after it, with nobody acting.
      clock.advance(1);
      h.lifecycleTick();
      h.lifecycleTick();
      const after = st(h, gid);
      expect(after.per[holder]!.hearts).toBe(hearts - 1);
      if (h.game(gid).status === "playing") {
        expect(after.category).not.toBe(cat);
        expect(after.turn!.player).not.toBe(holder);
        // Every socket hears it.
        await allPushes(ps, (proj) => ((myGame(proj, gid)?.["state"] as Json | undefined)?.["turn"] as Json | undefined)?.["n"] === after.turn!.n);
        if (after.per[holder]!.outOrder !== null) {
          const outView = myGame(byId.get(holder)!.lastPush!, gid)["state"] as Json;
          expect((outView["me"] as Json)["out"]).toBe(true);
          // An out player's answer is refused.
          expect((await h.intent(byId.get(holder)!, gid, "jebena-answer", { turn: after.turn!.n, text: fresh(after) }))["accepted"]).toBe(false);
        }
      }
    }
    const game = h.game(gid);
    expect(game.status).toBe("finished");
    const final = st(h, gid);
    expect(final.end).toBe("last-standing");
    // Keku kept the jebena; everyone else is out, in the order they ran out.
    expect(final.per[keku]!.outOrder).toBeNull();
    expect(ps.slice(1).every((p) => final.per[p.playerId]!.outOrder !== null)).toBe(true);
    // Scores: the server's, on every socket, with the places.
    const pts = jebenaPoints(final);
    expect(game.rawScores).toEqual(pts);
    expect(pts[keku]).toBe((n - 1) * 100 + 3 * 10);
    await allPushes(ps, (proj) => myGame(proj, gid)?.["status"] === "finished");
    for (const p of ps) {
      const g = myGame(p.lastPush!, gid);
      expect(g["rawScores"]).toEqual(pts);
      const standings = (g["state"] as Json)["standings"] as { id: string; place: number }[];
      expect(standings[0]).toMatchObject({ id: keku, place: 1 });
      expect(new Set(standings.map((r) => r.place)).size).toBe(n);
    }
  }, 60_000);
});

describe("Jebena Rush over real sockets: disconnects and the deadline boundary", () => {
  it("a holder whose socket drops loses the heart on time; reconnecting shows the current turn and resubmits nothing", async () => {
    const { h, clock, ps } = await casualRoom(4);
    const gid = await startJebena(h, ps, 5);
    const byId = new Map(ps.map((p) => [p.playerId, p]));
    const holder = byId.get(st(h, gid).turn!.player)!;
    const answersBefore = st(h, gid).per[holder.playerId]!.answers;
    await h.disconnect(holder);
    // No pause and no free life: the clock runs on, the heart goes, the jebena passes.
    clock.advance(TURN + 1);
    h.lifecycleTick();
    const s = st(h, gid);
    expect(s.per[holder.playerId]!.hearts).toBe(4);
    expect(s.turn!.player).not.toBe(holder.playerId);
    // Nobody won because a socket dropped: the match goes on with everyone in.
    expect(h.game(gid).status).toBe("playing");
    expect(Object.values(s.per).every((p) => p.outOrder === null)).toBe(true);
    // Back: the current turn, the lost heart; nothing was resubmitted.
    await h.connect(holder);
    await waitFor(() => !!holder.lastPush && ((myGame(holder.lastPush, gid)?.["state"] as Json | undefined)?.["turn"] as Json | undefined)?.["n"] === s.turn!.n);
    const view = myGame(holder.lastPush!, gid)["state"] as Json;
    expect((view["me"] as Json)["hearts"]).toBe(4);
    expect(view["myTurn"]).toBe(false);
    expect(st(h, gid).per[holder.playerId]!.answers).toBe(answersBefore);
    expect(st(h, gid).log.filter((e) => e.kind === "accepted").length).toBe(0);
  });

  it("an answer at the deadline instant counts; one a millisecond later finds the turn over, decided once", async () => {
    const { h, clock, ps } = await casualRoom(2);
    const gid = await startJebena(h, ps, 3);
    const byId = new Map(ps.map((p) => [p.playerId, p]));
    let s = st(h, gid);
    const p0 = byId.get(s.turn!.player)!;
    clock.advance(h.game(gid).phaseDeadlineAt! - clock.t); // exactly the deadline (turn + grace)
    const onTime = await h.intent(p0, gid, "jebena-answer", { turn: 1, text: fresh(s), phaseKey: "turn:1" });
    expect(onTime).toMatchObject({ accepted: true, result: { verdict: "accepted", turn: 1 } });
    s = st(h, gid);
    const p1 = byId.get(s.turn!.player)!;
    expect(p1.playerId).not.toBe(p0.playerId);
    clock.advance(h.game(gid).phaseDeadlineAt! - clock.t + 1); // one millisecond late
    const late = await h.intent(p1, gid, "jebena-answer", { turn: 2, text: fresh(s), phaseKey: "turn:2" });
    expect(late["accepted"]).toBe(false);
    const after = st(h, gid);
    expect(after.per[p1.playerId]!.hearts).toBe(2); // the timeout, once
    expect(after.per[p1.playerId]!.answers).toBe(0);
    h.lifecycleTick();
    expect(st(h, gid).per[p1.playerId]!.hearts).toBe(2);
  });
});

describe("Jebena Rush over real sockets: a continuous clock (review 6808081378, 3)", () => {
  it("everyone disconnected: nobody is out for being away, the turns still run out on time, and the match ends; back online, everyone sees the result", async () => {
    const { h, clock, ps } = await casualRoom(3);
    const gid = await startJebena(h, ps, 3);
    for (const p of ps) await h.disconnect(p);
    // Away is not out: same hearts, nobody eliminated, the same turn, until its deadline.
    clock.advance(TURN - 100);
    h.lifecycleTick();
    let s = st(h, gid);
    expect(s.turn!.n).toBe(1);
    expect(Object.values(s.per).every((p) => p.hearts === 3 && p.outOrder === null)).toBe(true);
    // A long outage: the clock never waited for anyone.
    clock.advance(10 * 60_000);
    h.lifecycleTick();
    s = st(h, gid);
    expect(h.game(gid).status).toBe("finished");
    expect(s.end).toBe("last-standing");
    // Every turn ran out in seat order: two players lost all 3 hearts, the last one 2 of 3 (8 timeouts), and keeps the jebena.
    expect(s.log.filter((e) => e.kind === "timeout").length).toBe(3 + 3 + 2);
    for (const p of ps) await h.connect(p);
    await allPushes(ps, (proj) => myGame(proj, gid)?.["status"] === "finished");
  });

  it("one player connected: the others' turns run out on time while the connected one plays; the connected one keeps the jebena", async () => {
    const { h, clock, ps } = await casualRoom(4);
    const gid = await startJebena(h, ps, 3);
    const keku = ps[0]!;
    for (const p of ps.slice(1)) await h.disconnect(p);
    for (let guard = 0; guard < 100 && h.game(gid).status === "playing"; guard++) {
      const s = st(h, gid);
      if (s.turn!.player === keku.playerId) {
        expect((await h.intent(keku, gid, "jebena-answer", { turn: s.turn!.n, text: fresh(s), phaseKey: `turn:${s.turn!.n}` }))["accepted"]).toBe(true);
        clock.advance(2000);
      } else {
        clock.advance(h.game(gid).phaseDeadlineAt! - clock.t + 1);
        h.lifecycleTick();
      }
    }
    const s = st(h, gid);
    expect(s.end).toBe("last-standing");
    expect(s.per[keku.playerId]!.outOrder).toBeNull();
    expect(s.per[keku.playerId]!.hearts).toBe(3);
    await waitFor(() => !!keku.lastPush && myGame(keku.lastPush, gid)?.["status"] === "finished");
  });

  it("a real server restart mid-match after a prolonged outage: the turns that ran out meanwhile are processed at their own instants; nothing is reset or replayed", async () => {
    const { h, clock, ps } = await casualRoom(3);
    const gid = await startJebena(h, ps, 5);
    const t0 = clock.t;
    const firstHolder = st(h, gid).turn!.player;
    await h.stop();
    clock.advance(3 * TURN + 2000); // three turns ran out while the server was down
    await h.start(); // the start runs the deadline sweep (catch-up)
    const s = st(h, gid);
    const timeouts = s.log.filter((e) => e.kind === "timeout");
    expect(timeouts.map((e) => e.at)).toEqual([t0 + TURN, t0 + 2 * TURN, t0 + 3 * TURN]);
    expect(timeouts[0]!.player).toBe(firstHolder);
    expect(h.game(gid).phaseDeadlineAt).toBe(t0 + 4 * TURN); // the current turn's time comes from the event, not the restart
    expect(Object.values(s.per).reduce((n, p) => n + p.hearts, 0)).toBe(3 * 5 - 3);
    // Reconnect: the current turn, no hearts given back.
    for (const p of ps) await h.connect(p);
    await allPushes(ps, (proj) => ((myGame(proj, gid)?.["state"] as Json | undefined)?.["turn"] as Json | undefined)?.["n"] === 4);
    expect(Object.values(st(h, gid).per).reduce((n, p) => n + p.hearts, 0)).toBe(3 * 5 - 3);
  });
});

