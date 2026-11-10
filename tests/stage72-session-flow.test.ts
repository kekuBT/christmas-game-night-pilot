/**
 * Stage 7.2: explicit session continuation in a casual room
 * (docs/stage7/stage72.md). Lineup item states and the next pending item;
 * Next / Play again / Take a break; and the safeguards of clarification
 * 6776484058 (§3.8): every press carries its own id and the session revision
 * it was made against, so a retry is recognised and never applied twice, a
 * delayed opposite command is refused, and a cancelled start ends there.
 * Two-host races, cancellation then a delayed retry, restart, eviction,
 * roles and the public view.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine, SESSION_OPS_LIMIT, StartRefused, type SessionAttempt } from "../src/server/room.js";

const refusal = (fn: () => unknown) => { try { fn(); } catch (e) { return e; } return undefined; };
const codeOf = (fn: () => unknown) => (refusal(fn) as { code?: string } | undefined)?.code;
const plan = (expectedPlayers: number, ids: string[], budgetMinutes = 30) => ({ expectedPlayers, budgetMinutes, items: ids.map((gameId) => ({ gameId })) });

let presses = 0;
/** A press made against the room's session as it is now (what the screen showed). */
const press = (engine: RoomEngine): SessionAttempt => ({ id: `press-${String(++presses).padStart(4, "0")}`, sessionRevision: engine.session.revision });

/** A casual room (no briefings unless `timing`), a host, `guests` more players, and a lineup. */
function room(guests: number, ids: string[] | null, opts: { timing?: 1 | 2 } = {}) {
  const engine = new RoomEngine("Party", { kind: "casual", ...(opts.timing ? { timing: opts.timing } : {}) });
  const host = engine.join("Host", { asHost: true }).player.id;
  const others = Array.from({ length: guests }, (_, i) => engine.join(`P${i + 1}`).player.id);
  if (ids) engine.savePartyPlan(host, 0, plan(guests + 1, ids));
  return { engine, host, others };
}
const finish = (engine: RoomEngine, gid: string) => { engine.games.get(gid)!.status = "finished"; };
const statuses = (engine: RoomEngine) => engine.partyView().lineup?.items.map((i) => i.status);
const restart = (engine: RoomEngine) => RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>);

describe("lineup item states and the next pending item", () => {
  it("pending → playing → completed, in order; the lineup ends complete", () => {
    const { engine, host } = room(2, ["trivia", "math-mayhem"]);
    expect(engine.partyView().lineup).toMatchObject({ next: 0, complete: false });
    expect(statuses(engine)).toEqual(["pending", "pending"]);
    const g1 = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: press(engine) }).game;
    expect(statuses(engine)).toEqual(["playing", "pending"]);
    expect(engine.partyView().lineup?.next).toBe(1);
    finish(engine, g1.id);
    expect(statuses(engine)).toEqual(["completed", "pending"]);
    const g2 = engine.startPartyGame(host, "math-mayhem", { revision: 1, index: 1, attempt: press(engine) }).game;
    finish(engine, g2.id);
    expect(engine.partyView().lineup).toMatchObject({ next: null, complete: true, items: [{ status: "completed", gameInstanceId: g1.id }, { status: "completed", gameInstanceId: g2.id }] });
  });

  it("a game that ends by its time limit completes its item", () => {
    const { engine, host } = room(2, ["math-mayhem"]);
    let t = 2_000_000;
    engine.clock = () => t;
    const g = engine.startPartyGame(host, "math-mayhem", { revision: 1, index: 0 }).game;
    t = engine.games.get(g.id)!.deadlineAt! + 1;
    engine.tick(t);
    expect(engine.games.get(g.id)!.status).toBe("finished");
    expect(engine.partyView().lineup).toMatchObject({ next: null, complete: true, items: [{ status: "completed" }] });
  });

  it("a briefing: the item shows it; cancelled, the item is pending again at the same place (never skipped)", () => {
    const { engine, host } = room(2, ["trivia", "math-mayhem"], { timing: 2 });
    const g = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: press(engine) }).game;
    expect(statuses(engine)).toEqual(["briefing", "pending"]);
    engine.cancelBriefing(host, g.id);
    expect(statuses(engine)).toEqual(["pending", "pending"]);
    expect(engine.partyView().lineup?.next).toBe(0);
    expect(codeOf(() => engine.startPartyGame(host, "math-mayhem", { revision: 1, index: 1, attempt: press(engine) }))).toBe("PLAN_CONFLICT");
  });

  it("an item whose game finished before a restart is still completed after it", () => {
    const { engine, host } = room(2, ["trivia", "math-mayhem"]);
    const g = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 }).game;
    finish(engine, g.id);
    expect(restart(engine).partyView().lineup).toMatchObject({ next: 1, items: [{ status: "completed" }, { status: "pending" }] });
  });

  it("the session revision moves on with each game start, break change and cancelled briefing (not with joins or reconnects)", () => {
    const { engine, host, others } = room(2, ["trivia"], { timing: 2 });
    expect(engine.sessionView()).toEqual({ onBreak: false, revision: 0 });
    const g = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: press(engine) }).game;
    expect(engine.session.revision).toBe(1);
    engine.join("Late");
    engine.disconnect(others[0]!);
    engine.markConnected(others[0]!);
    expect(engine.session.revision).toBe(1);
    engine.cancelBriefing(host, g.id);
    expect(engine.session.revision).toBe(2);
    engine.setBreak(host, true, press(engine));
    expect(engine.session.revision).toBe(3);
  });
});

describe("Next game: repeats and races", () => {
  it("host and cohost press Next for the same item at once: one game; the second is its replay", () => {
    const { engine, host, others } = room(2, ["trivia", "math-mayhem"]);
    engine.grantCohost(host, others[0]!);
    const seenByBoth = engine.session.revision;
    const a = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: { id: "host-next-1", sessionRevision: seenByBoth } });
    const b = engine.startPartyGame(others[0]!, "trivia", { revision: 1, index: 0, attempt: { id: "cohost-next-1", sessionRevision: seenByBoth } });
    expect([a.replay, b.replay, b.game.id]).toEqual([false, true, a.game.id]);
    expect(engine.games.size).toBe(1);
  });

  it("a lost reply: the same press again returns the same game, even after the game finished or the lineup changed", () => {
    const { engine, host } = room(2, ["trivia", "math-mayhem"]);
    const a = press(engine);
    const g1 = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: a }).game;
    expect(engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: a })).toEqual({ game: g1, replay: true });
    finish(engine, g1.id);
    engine.savePartyPlan(host, 1, plan(3, ["closest-wins"]));
    expect(engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: a })).toEqual({ game: g1, replay: true });
    expect(engine.games.size).toBe(1);
  });

  it("Next racing Play again or Take a break (all pressed against the same screen): the first wins, the others are refused; never two games", () => {
    for (const first of ["next", "rematch", "break"] as const) {
      const { engine, host, others } = room(2, ["trivia", "math-mayhem"]);
      engine.grantCohost(host, others[0]!);
      const g1 = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 }).game;
      finish(engine, g1.id);
      const seen = engine.session.revision;
      const next = () => engine.startPartyGame(host, "math-mayhem", { revision: 1, index: 1, attempt: { id: "next-press", sessionRevision: seen } });
      const again = () => engine.startRematch(others[0]!, g1.id, { attempt: { id: "again-press", sessionRevision: seen } });
      const brk = () => engine.setBreak(others[0]!, true, { id: "break-press", sessionRevision: seen });
      const all = { next, rematch: again, break: brk };
      all[first]();
      for (const [k, fn] of Object.entries(all)) if (k !== first) expect(codeOf(fn), `${first} then ${k}`).toBe("SESSION_CONFLICT");
      expect(engine.games.size).toBe(first === "break" ? 1 : 2);
      expect(engine.session.onBreak).toBe(first === "break");
    }
  });

  it("cancelled, then a delayed retry: the retry starts nothing (ATTEMPT_ENDED), a cohost's old press is stale, a fresh press starts the same item again", () => {
    const { engine, host, others } = room(2, ["trivia", "math-mayhem"], { timing: 2 });
    engine.grantCohost(host, others[0]!);
    const seen = engine.session.revision;
    const a = { id: "host-next-1", sessionRevision: seen };
    const g = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: a }).game;
    engine.cancelBriefing(host, g.id);
    const ended = refusal(() => engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: a })) as StartRefused;
    expect([ended.code, (ended.detail?.["session"] as { revision: number }).revision]).toEqual(["ATTEMPT_ENDED", engine.session.revision]);
    expect(codeOf(() => engine.startPartyGame(others[0]!, "trivia", { revision: 1, index: 0, attempt: { id: "cohost-next-1", sessionRevision: seen } }))).toBe("SESSION_CONFLICT");
    expect([engine.games.size, statuses(engine)]).toEqual([0, ["pending", "pending"]]);
    // After a restart, the cancelled press still starts nothing.
    const back = restart(engine);
    expect(codeOf(() => back.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: a }))).toBe("ATTEMPT_ENDED");
    expect(back.games.size).toBe(0);
    const fresh = back.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: press(back) });
    expect([fresh.replay, fresh.game.status, back.partyView().lineup?.items[0]?.gameInstanceId]).toEqual([false, "briefing", fresh.game.id]);
  });

  it("a Next for a replaced or cleared lineup starts nothing; the played game and its scores stay", () => {
    const { engine, host } = room(2, ["trivia", "math-mayhem"]);
    const g1 = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 }).game;
    engine.games.get(g1.id)!.rawScores = { [host]: 300 };
    finish(engine, g1.id);
    engine.savePartyPlan(host, 1, plan(3, ["closest-wins", "geography"]));
    expect(codeOf(() => engine.startPartyGame(host, "math-mayhem", { revision: 1, index: 1, attempt: press(engine) }))).toBe("PLAN_CONFLICT");
    engine.savePartyPlan(host, 2, null);
    expect(codeOf(() => engine.startPartyGame(host, "closest-wins", { revision: 2, index: 0, attempt: press(engine) }))).toBe("PLAN_CONFLICT");
    expect([engine.games.size, engine.games.get(g1.id)!.status, engine.games.get(g1.id)!.rawScores]).toEqual([1, "finished", { [host]: 300 }]);
  });

  it("only the host or a cohost, for a repeat too; a request id can't be reused for something else", () => {
    const { engine, host, others } = room(2, ["trivia", "math-mayhem"]);
    const a = press(engine);
    const g = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: a }).game;
    expect(() => engine.startPartyGame(others[1]!, "trivia", { revision: 1, index: 0, attempt: a })).toThrow(/host/);
    finish(engine, g.id);
    expect(() => engine.startPartyGame(host, "math-mayhem", { revision: 1, index: 1, attempt: { ...a, sessionRevision: engine.session.revision } })).toThrow(/already used/);
    expect(() => engine.setBreak(host, true, { ...a, sessionRevision: engine.session.revision })).toThrow(/already used/);
    expect(engine.games.size).toBe(1);
  });
});

describe("Play again (rematch)", () => {
  it("a new game of the same kind, tied to the one before; a repeat returns it; a second host's press is its replay; the lineup is untouched", () => {
    const { engine, host, others } = room(2, ["trivia", "math-mayhem"]);
    engine.grantCohost(host, others[0]!);
    const g1 = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 }).game;
    finish(engine, g1.id);
    const before = JSON.stringify(engine.partyView());
    const seen = engine.session.revision;
    const a = { id: "host-again-1", sessionRevision: seen };
    const r = engine.startRematch(host, g1.id, { attempt: a });
    expect([r.replay, r.game.gameId, r.game.rematchOf, r.game.official]).toEqual([false, "trivia", g1.id, false]);
    expect(r.game.id).not.toBe(g1.id);
    expect(engine.startRematch(host, g1.id, { attempt: a })).toEqual({ game: r.game, replay: true });
    expect(engine.startRematch(others[0]!, g1.id, { attempt: { id: "cohost-again-1", sessionRevision: seen } })).toEqual({ game: r.game, replay: true });
    expect(engine.games.size).toBe(2);
    expect(JSON.stringify(engine.partyView())).toBe(before); // never takes or marks a lineup item
    expect(engine.partyView().lineup?.next).toBe(1);
  });

  it("no lineup needed; a rematch of the rematch is the next Play again; the earlier games keep their results", () => {
    const { engine, host } = room(2, null);
    const g1 = engine.startGame(host, "math-mayhem", { official: false });
    finish(engine, g1.id);
    engine.games.get(g1.id)!.rawScores = { [host]: 500 };
    const g2 = engine.startRematch(host, g1.id, { attempt: press(engine) }).game;
    finish(engine, g2.id);
    const g3 = engine.startRematch(host, g2.id, { attempt: press(engine) }).game;
    expect([g3.rematchOf, engine.games.size]).toEqual([g2.id, 3]);
    expect(engine.games.get(g1.id)!.rawScores).toEqual({ [host]: 500 });
  });

  it("only the game just played: not an older one (REMATCH_NOT_LATEST), not while a game is on", () => {
    const { engine, host } = room(2, ["trivia", "math-mayhem"]);
    const g1 = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 }).game;
    finish(engine, g1.id);
    const g2 = engine.startPartyGame(host, "math-mayhem", { revision: 1, index: 1 }).game;
    expect(() => engine.startRematch(host, g1.id, { attempt: press(engine) })).toThrow(/already in progress/);
    finish(engine, g2.id);
    const old = refusal(() => engine.startRematch(host, g1.id, { attempt: press(engine) })) as StartRefused;
    expect([old.code, old.detail?.["latestGameInstanceId"]]).toEqual(["REMATCH_NOT_LATEST", g2.id]);
    expect(engine.startRematch(host, g2.id, { attempt: press(engine) }).game.gameId).toBe("math-mayhem");
  });

  it("cancelled, then a delayed retry: nothing starts (also after a restart); a fresh press plays it again; the lineup's next item is unchanged", () => {
    const { engine, host } = room(2, ["trivia", "math-mayhem"], { timing: 2 });
    const g1 = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 }).game;
    finish(engine, g1.id);
    const a = press(engine);
    const r = engine.startRematch(host, g1.id, { attempt: a }).game;
    expect(r.status).toBe("briefing");
    engine.cancelBriefing(host, r.id);
    expect(codeOf(() => engine.startRematch(host, g1.id, { attempt: a }))).toBe("ATTEMPT_ENDED");
    const back = restart(engine);
    expect(codeOf(() => back.startRematch(host, g1.id, { attempt: a }))).toBe("ATTEMPT_ENDED");
    expect([back.games.size, back.partyView().lineup?.next]).toEqual([1, 1]);
    const fresh = back.startRematch(host, g1.id, { attempt: press(back) });
    expect([fresh.replay, fresh.game.rematchOf, back.partyView().lineup?.next]).toEqual([false, g1.id, 1]);
  });

  it("only a finished game; only casual rooms; only the host or a cohost", () => {
    const { engine, host, others } = room(2, null);
    const g1 = engine.startGame(host, "math-mayhem", { official: false });
    expect(() => engine.startRematch(host, g1.id, {})).toThrow(/finished/);
    expect(() => engine.startRematch(host, "game-404", {})).toThrow(/finished/);
    finish(engine, g1.id);
    expect(() => engine.startRematch(others[0]!, g1.id, {})).toThrow(/host/);
    const cup = new RoomEngine("Cup", { kind: "cup" });
    const h = cup.join("H", { asHost: true }).player.id;
    cup.join("G");
    const cg = cup.startGame(h, "math-mayhem", { official: false });
    cup.games.get(cg.id)!.status = "finished";
    expect(codeOf(() => cup.startRematch(h, cg.id, {}))).toBe("NOT_A_CASUAL_ROOM");
  });

  it("the room as it is now: someone reconnecting is named or waited for, the roster shown must match, and the people here must fit the game", () => {
    const { engine, host, others } = room(3, null);
    const g1 = engine.startGame(host, "impostor", { official: false });
    finish(engine, g1.id);
    engine.disconnect(others[2]!);
    expect(codeOf(() => engine.startRematch(host, g1.id, { attempt: press(engine) }))).toBe("PLAYERS_RECONNECTING");
    const doesnt = refusal(() => engine.startRematch(host, g1.id, { proceedWithout: [others[2]!], attempt: press(engine) })) as StartRefused;
    expect([doesnt.code, doesnt.detail?.["minPlayers"], doesnt.detail?.["here"]]).toEqual(["GAME_DOESNT_FIT", 4, 3]);
    engine.markConnected(others[2]!);
    expect(codeOf(() => engine.startRematch(host, g1.id, { roster: [host, others[0]!], attempt: press(engine) }))).toBe("ROSTER_CHANGED");
    expect(engine.startRematch(host, g1.id, { roster: engine.readiness().wouldPlay, attempt: press(engine) }).game.players).toHaveLength(4);
  });
});

describe("Take a break / Resume", () => {
  it("on and off; only between games; every new start waits for Resume; asking for what is already so changes nothing", () => {
    const { engine, host } = room(2, ["trivia", "math-mayhem"]);
    let t = 3_000_000;
    engine.clock = () => t;
    expect(engine.setBreak(host, true, press(engine))).toEqual({ session: { onBreak: true, breakSince: t, revision: 1 }, replay: false });
    t += 1000;
    expect(engine.setBreak(host, true, press(engine)).session).toEqual({ onBreak: true, breakSince: t - 1000, revision: 1 });
    // Every new start waits: the lineup's Next, a rematch, the lobby's own Start.
    expect(codeOf(() => engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: press(engine) }))).toBe("ON_BREAK");
    expect(codeOf(() => engine.startChosen(host, "geography", { official: false, attempt: press(engine) }))).toBe("ON_BREAK");
    expect(codeOf(() => engine.startGame(host, "geography", { official: false }))).toBe("ON_BREAK");
    expect(engine.games.size).toBe(0);
    expect(engine.setBreak(host, false, press(engine)).session).toEqual({ onBreak: false, revision: 2 });
    const a = press(engine);
    const g = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: a }).game;
    // No break while a game is on (no clock is ever paused).
    expect(codeOf(() => engine.setBreak(host, true, press(engine)))).toBe("GAME_ACTIVE");
    finish(engine, g.id);
    engine.setBreak(host, true, press(engine));
    expect(codeOf(() => engine.startRematch(host, g.id, { attempt: press(engine) }))).toBe("ON_BREAK");
    // A repeat of a start that already happened is still answered on a break.
    expect(engine.startPartyGame(host, "trivia", { revision: 1, index: 0, attempt: a })).toMatchObject({ replay: true });
  });

  it("a delayed Break after a Resume never puts the room back on a break (and the other way round), also after a restart", () => {
    for (const viaRestart of [false, true]) {
      const { engine: e0, host, others } = room(2, null);
      e0.grantCohost(host, others[0]!);
      let engine = e0;
      // Break succeeds, its reply is lost; the cohost resumes; the Break is retried.
      const brk = press(engine);
      engine.setBreak(host, true, brk);
      engine.setBreak(others[0]!, false, press(engine));
      if (viaRestart) engine = restart(engine);
      expect(engine.setBreak(host, true, brk)).toEqual({ session: { onBreak: false, revision: 2 }, replay: true });
      // A different, older Break press (from before the Resume) is stale.
      expect(codeOf(() => engine.setBreak(host, true, { id: "old-break-2", sessionRevision: 0 }))).toBe("SESSION_CONFLICT");
      // The other way round: Resume lost, the cohost takes a new break, the Resume is retried.
      engine.setBreak(host, true, press(engine));
      const resume = press(engine);
      engine.setBreak(host, false, resume);
      engine.setBreak(others[0]!, true, press(engine));
      if (viaRestart) engine = restart(engine);
      expect(engine.setBreak(host, false, resume)).toMatchObject({ session: { onBreak: true }, replay: true });
      expect(engine.sessionView().onBreak).toBe(true);
    }
  });

  it("a forgotten request (beyond the remembered ones) is stale by its revision, never applied again", () => {
    const { engine, host } = room(1, null);
    const first = press(engine);
    engine.setBreak(host, true, first);
    engine.setBreak(host, false, press(engine));
    for (let i = 0; i < SESSION_OPS_LIMIT; i++) engine.setBreak(host, i % 2 === 0, press(engine));
    expect(engine.session.ops.some((o) => o.id === first.id)).toBe(false);
    expect(engine.session.ops).toHaveLength(SESSION_OPS_LIMIT);
    const before = engine.sessionView();
    expect(codeOf(() => engine.setBreak(host, true, first))).toBe("SESSION_CONFLICT");
    expect(engine.sessionView()).toEqual(before);
    expect(restart(engine).session.ops).toHaveLength(SESSION_OPS_LIMIT);
  });

  it("the host or a cohost of a casual room only; joining or reconnecting changes nothing; saved with the room", () => {
    const { engine, host, others } = room(2, null);
    expect(codeOf(() => engine.setBreak(others[0]!, true, press(engine)))).toBe("NOT_HOST");
    engine.grantCohost(host, others[0]!);
    engine.setBreak(others[0]!, true, press(engine));
    engine.join("Late");
    engine.disconnect(others[1]!);
    engine.markConnected(others[1]!);
    expect(engine.sessionView()).toMatchObject({ onBreak: true, revision: 1 });
    expect(restart(engine).sessionView()).toMatchObject({ onBreak: true, revision: 1 });
    const cup = new RoomEngine("Cup", { kind: "cup" });
    const h = cup.join("H", { asHost: true }).player.id;
    expect(codeOf(() => cup.setBreak(h, true, press(cup)))).toBe("NOT_A_CASUAL_ROOM");
    expect(cup.project("player", h)["session"]).toBeUndefined();
  });

  it("a damaged saved session restores as no break and nothing remembered; the revision is kept when it is sound", () => {
    const { engine, host } = room(1, null);
    engine.setBreak(host, true, press(engine));
    const json = JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>;
    const back = RoomEngine.fromJSON({ ...json, session: { onBreak: "yes", revision: 1, ops: [{ id: 5 }, null, { id: "ok-0001", key: "break:true", revision: 1 }] } });
    expect([back.sessionView(), back.session.ops.map((o) => o.id)]).toEqual([{ onBreak: false, revision: 1 }, ["ok-0001"]]);
    expect(RoomEngine.fromJSON({ ...json, session: undefined }).sessionView()).toEqual({ onBreak: false, revision: 0 });
  });

  it("everyone and the TV see the same public state, never the remembered requests", () => {
    const { engine, host, others } = room(2, ["trivia", "math-mayhem"]);
    engine.setBreak(host, true, { id: "secret-press-id", sessionRevision: 0 });
    const tv = engine.project("tv");
    expect(engine.project("player", others[0]!)["session"]).toEqual(tv["session"]);
    expect(tv["session"]).toEqual({ onBreak: true, breakSince: expect.any(Number), revision: 1 });
    expect(JSON.stringify(engine.project("player", host))).not.toContain("secret-press-id");
    expect(JSON.stringify({ party: tv["party"], session: tv["session"] })).not.toMatch(/token|seed|hostClaim|answer|ops/i);
  });
});

describe("over HTTP", () => {
  let server: LocalServer; let base = ""; let dataDir = "";
  beforeAll(async () => { dataDir = mkdtempSync(join(tmpdir(), "mz-s72-")); server = new LocalServer({ dataDir }); base = `http://127.0.0.1:${await server.listen(0)}`; });
  afterAll(async () => { await server.close(); });
  const call = async (method: string, path: string, body?: unknown, token?: string, at = base) => {
    const r = await fetch(`${at}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
  };
  async function casual(guests: number) {
    const made = (await call("POST", "/rooms", { kind: "casual" })).body;
    const id = String(made["roomId"]);
    const host = (await call("POST", `/rooms/${id}/join`, { displayName: "Host", asHost: true, hostClaimToken: made["hostClaimToken"] })).body;
    const gs = [];
    for (let i = 0; i < guests; i++) gs.push((await call("POST", `/rooms/${id}/join`, { displayName: `G${i}` })).body);
    return { id, code: String(made["joinCode"]), host: String(host["recoveryToken"]), guests: gs.map((g) => String(g["recoveryToken"])) };
  }
  const view = async (r: { id: string; host: string }, at = base) => (await call("GET", `/rooms/${r.id}/projection?audience=player`, undefined, r.host, at)).body as { readiness: { wouldPlay: string[] }; session: { onBreak: boolean; revision: number }; games: { id: string }[] };
  const attemptNow = async (r: { id: string; host: string }, id: string, at = base) => ({ id, sessionRevision: (await view(r, at)).session.revision });

  it("break: 401 without a player's token, 403 for a guest, 400 malformed or without its request id; 200 for the host; the projection shows it; starts wait", async () => {
    const r = await casual(1);
    const spect = (await call("POST", "/rooms/spectate-by-code", { joinCode: r.code })).body;
    const attempt = await attemptNow(r, "http-break-1");
    expect((await call("POST", `/rooms/${r.id}/break`, { on: true, attempt })).status).toBe(401);
    expect((await call("POST", `/rooms/${r.id}/break`, { on: true, attempt }, String(spect["spectatorToken"]))).status).toBe(401);
    expect((await call("POST", `/rooms/${r.id}/break`, { on: true, attempt }, r.guests[0])).status).toBe(403);
    for (const b of [{}, { on: "yes", attempt }, { on: true }, { on: true, attempt: { id: "short", sessionRevision: 0 } }, { on: true, attempt, extra: 1 }]) {
      expect((await call("POST", `/rooms/${r.id}/break`, b, r.host)).status, JSON.stringify(b)).toBe(400);
    }
    const ok = await call("POST", `/rooms/${r.id}/break`, { on: true, attempt }, r.host);
    expect([ok.status, ok.body["session"]]).toEqual([200, { onBreak: true, breakSince: expect.any(Number), revision: 1 }]);
    expect(((await call("GET", `/rooms/${r.id}/projection`)).body["session"] as { onBreak: boolean }).onBreak).toBe(true);
    const start = await call("POST", `/rooms/${r.id}/games`, { gameId: "math-mayhem", official: false, roster: (await view(r)).readiness.wouldPlay }, r.host);
    expect([start.status, start.body["code"]]).toEqual([409, "ON_BREAK"]);
    const stale = await call("POST", `/rooms/${r.id}/break`, { on: false, attempt: { id: "http-break-old", sessionRevision: 0 } }, r.host);
    expect([stale.status, stale.body["code"], (stale.body["session"] as { revision: number }).revision]).toEqual([409, "SESSION_CONFLICT", 1]);
  });

  it("a Break whose reply was lost, retried after a Resume and a server restart, is answered without putting the room back on a break", async () => {
    const r = await casual(1);
    const brk = await attemptNow(r, "http-break-a");
    expect((await call("POST", `/rooms/${r.id}/break`, { on: true, attempt: brk }, r.host)).status).toBe(200);
    expect((await call("POST", `/rooms/${r.id}/break`, { on: false, attempt: await attemptNow(r, "http-resume-b") }, r.host)).status).toBe(200);
    const later = new LocalServer({ dataDir });
    const at = `http://127.0.0.1:${await later.listen(0)}`;
    try {
      const retry = await call("POST", `/rooms/${r.id}/break`, { on: true, attempt: brk }, r.host, at);
      expect([retry.status, retry.body["replay"], (retry.body["session"] as { onBreak: boolean }).onBreak]).toEqual([200, true, false]);
      expect((await view(r, at)).session).toEqual({ onBreak: false, revision: 2 });
    } finally {
      await later.close();
    }
  });

  it("Play again: 400 if malformed, official, a lineup start too, or without the roster or request id; 201, then 200 with the same game; cancelled, a retry starts nothing, also after a restart", async () => {
    const r = await casual(1);
    const shown = (await view(r)).readiness.wouldPlay;
    const first = await call("POST", `/rooms/${r.id}/games`, { gameId: "math-mayhem", official: false, roster: shown, attempt: await attemptNow(r, "http-start-1") }, r.host);
    expect(first.status).toBe(201);
    const gid = String(first.body["gameId"]);
    // Finish it on the server (as its time limit would).
    server.rooms.get(r.id)!.games.get(gid)!.status = "finished";
    const attempt = await attemptNow(r, "http-again-1");
    for (const b of [{ rematchOf: 5, roster: shown, attempt }, { rematchOf: gid, official: true, roster: shown, attempt }, { rematchOf: gid, attempt }, { rematchOf: gid, roster: shown }, { rematchOf: gid, roster: shown, attempt, party: { revision: 1, index: 0 } }]) {
      expect((await call("POST", `/rooms/${r.id}/games`, b, r.host)).status, JSON.stringify(b)).toBe(400);
    }
    const again = await call("POST", `/rooms/${r.id}/games`, { rematchOf: gid, roster: shown, attempt }, r.host);
    expect([again.status, again.body["gameType"], again.body["status"]]).toEqual([201, "math-mayhem", "briefing"]);
    const repeat = await call("POST", `/rooms/${r.id}/games`, { rematchOf: gid, roster: shown, attempt }, r.host);
    expect([repeat.status, repeat.body["gameId"], repeat.body["replay"]]).toEqual([200, again.body["gameId"], true]);
    expect((await call("POST", `/rooms/${r.id}/games`, { rematchOf: gid, roster: shown, attempt }, r.guests[0])).status).toBe(400); // a guest's repeat
    // The host cancels the rematch's briefing; the same press again starts nothing.
    expect((await call("POST", `/rooms/${r.id}/games/${String(again.body["gameId"])}/cancel`, {}, r.host)).status).toBe(200);
    const ended = await call("POST", `/rooms/${r.id}/games`, { rematchOf: gid, roster: shown, attempt }, r.host);
    expect([ended.status, ended.body["code"]]).toEqual([409, "ATTEMPT_ENDED"]);
    const later = new LocalServer({ dataDir });
    const at = `http://127.0.0.1:${await later.listen(0)}`;
    try {
      const retry = await call("POST", `/rooms/${r.id}/games`, { rematchOf: gid, roster: shown, attempt }, r.host, at);
      expect([retry.status, retry.body["code"]]).toEqual([409, "ATTEMPT_ENDED"]);
      expect((await view(r, at)).games).toHaveLength(1);
      // A fresh press applies the room as it is now: after a restart nobody has reconnected yet.
      const waiting = await call("POST", `/rooms/${r.id}/games`, { rematchOf: gid, roster: shown, attempt: await attemptNow(r, "http-again-2", at) }, r.host, at);
      expect([waiting.status, waiting.body["code"]]).toEqual([409, "PLAYERS_RECONNECTING"]);
      for (const id of shown) later.rooms.get(r.id)!.markConnected(id); // both phones back (their sockets)
      const fresh = await call("POST", `/rooms/${r.id}/games`, { rematchOf: gid, roster: shown, attempt: await attemptNow(r, "http-again-3", at) }, r.host, at);
      expect([fresh.status, fresh.body["gameType"]], JSON.stringify(fresh.body).slice(0, 300)).toEqual([201, "math-mayhem"]);
    } finally {
      await later.close();
    }
  });

  it("the lobby's own Start: with a request id, a lost reply's retry is 200 with the same game; a stale one is 409", async () => {
    const r = await casual(1);
    const shown = (await view(r)).readiness.wouldPlay;
    const attempt = await attemptNow(r, "http-own-1");
    const first = await call("POST", `/rooms/${r.id}/games`, { gameId: "closest-wins", official: false, roster: shown, attempt }, r.host);
    const retry = await call("POST", `/rooms/${r.id}/games`, { gameId: "closest-wins", official: false, roster: shown, attempt }, r.host);
    expect([first.status, retry.status, retry.body["gameId"], retry.body["replay"]]).toEqual([201, 200, first.body["gameId"], true]);
    server.rooms.get(r.id)!.games.get(String(first.body["gameId"]))!.status = "finished";
    const stale = await call("POST", `/rooms/${r.id}/games`, { gameId: "geography", official: false, roster: shown, attempt: { id: "http-own-2", sessionRevision: 0 } }, r.host);
    expect([stale.status, stale.body["code"]]).toEqual([409, "SESSION_CONFLICT"]);
  });
});
