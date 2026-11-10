/**
 * Stage 7.3: hand the host role to another player in a casual room
 * (docs/stage7/stage73.md, ChatGPT handoff 6781323820, H1–H6). The engine's
 * atomic transfer, its refusals, its repeat-safety (the Stage 7.2 session
 * revision and press identity), races with starts, persistence, and the
 * HTTP and WebSocket authority of a former host.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { LocalServer } from "../src/server/http.js";
import { HostRefused, RECONNECT_GRACE_MS, RoomEngine, SESSION_OPS_LIMIT, type SessionAttempt } from "../src/server/room.js";

const refusal = (fn: () => unknown) => { try { fn(); } catch (e) { return e; } return undefined; };
const codeOf = (fn: () => unknown) => (refusal(fn) as { code?: string } | undefined)?.code;
let presses = 0;
const press = (engine: RoomEngine): SessionAttempt => ({ id: `hand-${String(++presses).padStart(4, "0")}`, sessionRevision: engine.session.revision });
const restart = (engine: RoomEngine) => RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>);
/** Who holds the role, by every record of it. */
const roles = (engine: RoomEngine) => ({
  hostId: engine.hostId,
  hosts: [...engine.players.values()].filter((p) => p.isHost).map((p) => p.id),
  cohosts: [...engine.cohosts].sort(),
  cohostFlags: [...engine.players.values()].filter((p) => p.isCohost).map((p) => p.id).sort(),
});

/** A casual room: Ada hosts; Bea, Cal and Dee join (all connected). */
function room(kind: "casual" | "cup" = "casual") {
  const engine = new RoomEngine("Party", { kind });
  const ada = engine.join("Ada", { asHost: true }).player.id;
  const [bea, cal, dee] = ["Bea", "Cal", "Dee"].map((n) => engine.join(n).player.id) as [string, string, string];
  return { engine, ada, bea, cal, dee };
}

describe("the handover (H1)", () => {
  it("from the lobby: exactly one host, the old host is a regular player, the room is otherwise unchanged", () => {
    const { engine, ada, bea, cal } = room();
    engine.grantCohost(ada, cal);
    engine.savePartyPlan(ada, 0, { expectedPlayers: 4, budgetMinutes: 30, items: [{ gameId: "trivia" }, { gameId: "math-mayhem" }] });
    const before = { party: JSON.stringify(engine.partyView()), games: engine.games.size, code: engine.joinCode, seats: [...engine.players.keys()], revision: engine.session.revision };
    const done = engine.transferHost(ada, bea, press(engine));
    expect(done).toEqual({ replay: false, hostId: bea, from: ada });
    expect(roles(engine)).toEqual({ hostId: bea, hosts: [bea], cohosts: [cal], cohostFlags: [cal] });
    expect([JSON.stringify(engine.partyView()), engine.games.size, engine.joinCode, [...engine.players.keys()]]).toEqual([before.party, before.games, before.code, before.seats]);
    expect(engine.session.revision).toBe(before.revision + 1);
    expect(engine.ledger.at(-1)).toMatchObject({ type: "host-transferred", playerId: bea, actor: ada });
    const view = engine.project("player", cal) as { players: { id: string; isHost: boolean }[]; notices: { type: string; displayName: string; byName: string; method: string }[] };
    expect(view.players.filter((p) => p.isHost).map((p) => p.id)).toEqual([bea]);
    expect(view.notices.at(-1)).toMatchObject({ type: "host-transferred", displayName: "Bea", byName: "Ada", method: "handover" });
  });

  it("after results and during a break: the new host resumes and plays the lineup's next game; the old host can't", () => {
    const { engine, ada, bea } = room();
    engine.savePartyPlan(ada, 0, { expectedPlayers: 4, budgetMinutes: 30, items: [{ gameId: "trivia" }, { gameId: "math-mayhem" }] });
    const g1 = engine.startPartyGame(ada, "trivia", { revision: 1, index: 0, attempt: press(engine) }).game;
    engine.games.get(g1.id)!.status = "finished";
    engine.setBreak(ada, true, press(engine));
    engine.transferHost(ada, bea, press(engine));
    expect(engine.sessionView().onBreak).toBe(true); // the break is kept: nothing resumes by itself
    expect(engine.partyView().lineup?.next).toBe(1); // and the lineup didn't move
    expect(codeOf(() => engine.setBreak(ada, false, press(engine)))).toBe("NOT_HOST");
    expect(engine.setBreak(bea, false, press(engine)).session.onBreak).toBe(false);
    expect(() => engine.startPartyGame(ada, "math-mayhem", { revision: 1, index: 1, attempt: press(engine) })).toThrow(/host/);
    const g2 = engine.startPartyGame(bea, "math-mayhem", { revision: 1, index: 1, attempt: press(engine) }).game;
    expect([g2.gameId, engine.partyView().lineup?.items[1]?.gameInstanceId]).toEqual(["math-mayhem", g2.id]);
  });

  it("a cohost can be the new host (and leaves the cohost list); a host who was also listed as cohost loses both", () => {
    const { engine, ada, bea, cal } = room();
    engine.grantCohost(ada, bea);
    engine.grantCohost(bea, ada); // the host also on the cohost list
    engine.grantCohost(ada, cal);
    engine.transferHost(ada, bea, press(engine));
    expect(roles(engine)).toEqual({ hostId: bea, hosts: [bea], cohosts: [cal], cohostFlags: [cal] });
    // The other cohost keeps working.
    expect(engine.setBreak(cal, true, press(engine)).session.onBreak).toBe(true);
  });
});

describe("who can't (H2) and when not (H4)", () => {
  it("a guest, a cohost and the former host are refused; nothing changes", () => {
    const { engine, ada, bea, cal, dee } = room();
    engine.grantCohost(ada, cal);
    const snap = JSON.stringify(roles(engine));
    expect(codeOf(() => engine.transferHost(bea, dee, press(engine)))).toBe("NOT_HOST");
    expect(codeOf(() => engine.transferHost(cal, dee, press(engine)))).toBe("NOT_HOST");
    expect(JSON.stringify(roles(engine))).toBe(snap);
    engine.transferHost(ada, bea, press(engine));
    expect(codeOf(() => engine.transferHost(ada, dee, press(engine)))).toBe("NOT_HOST");
    expect(roles(engine).hostId).toBe(bea);
  });

  it("only another connected player of this room; only casual rooms; only between games", () => {
    let t = 5_000_000;
    const { engine, ada, bea, cal, dee } = room();
    engine.clock = () => t;
    expect(codeOf(() => engine.transferHost(ada, ada, press(engine)))).toBe("TARGET_INVALID");
    expect(codeOf(() => engine.transferHost(ada, "player-99", press(engine)))).toBe("TARGET_INVALID");
    engine.disconnect(cal);
    expect(codeOf(() => engine.transferHost(ada, cal, press(engine)))).toBe("TARGET_NOT_CONNECTED"); // reconnecting
    t += RECONNECT_GRACE_MS + 1;
    expect(codeOf(() => engine.transferHost(ada, cal, press(engine)))).toBe("TARGET_NOT_CONNECTED"); // away
    const g = engine.startGame(ada, "math-mayhem", { official: false });
    expect(codeOf(() => engine.transferHost(ada, dee, press(engine)))).toBe("GAME_ACTIVE");
    engine.games.get(g.id)!.status = "finished";
    expect(engine.transferHost(ada, dee, press(engine)).hostId).toBe(dee);
    const cup = room("cup");
    expect(codeOf(() => cup.engine.transferHost(cup.ada, cup.bea, press(cup.engine)))).toBe("NOT_A_CASUAL_ROOM");
    expect(cup.engine.hostId).toBe(cup.ada);
    expect(bea).toBeTruthy();
  });

  it("a briefing counts as a game on", () => {
    const engine = new RoomEngine("Party", { kind: "casual", timing: 2 });
    const ada = engine.join("Ada", { asHost: true }).player.id;
    const bea = engine.join("Bea").player.id;
    const g = engine.startGame(ada, "trivia", { official: false });
    expect(g.status).toBe("briefing");
    expect(codeOf(() => engine.transferHost(ada, bea, press(engine)))).toBe("GAME_ACTIVE");
    engine.cancelBriefing(ada, g.id);
    expect(engine.transferHost(ada, bea, press(engine)).hostId).toBe(bea);
  });

  it("a handover racing a start pressed on the same screen: the second is refused; never both", () => {
    // Start first: the handover from the same screen is stale (and a game is on).
    const a = room();
    const seenA = a.engine.session.revision;
    a.engine.startChosen(a.ada, "math-mayhem", { official: false, attempt: { id: "start-0001", sessionRevision: seenA } });
    expect(codeOf(() => a.engine.transferHost(a.ada, a.bea, { id: "hand-race-1", sessionRevision: seenA }))).toBe("SESSION_CONFLICT");
    expect(a.engine.hostId).toBe(a.ada);
    // Handover first: the old host's start can't take effect.
    const b = room();
    const seenB = b.engine.session.revision;
    b.engine.transferHost(b.ada, b.bea, { id: "hand-race-2", sessionRevision: seenB });
    expect(() => b.engine.startChosen(b.ada, "math-mayhem", { official: false, attempt: { id: "start-0002", sessionRevision: seenB } })).toThrow(/host/);
    expect(b.engine.games.size).toBe(0);
    // And the new host's press from before the handover is stale too.
    expect(codeOf(() => b.engine.startChosen(b.bea, "math-mayhem", { official: false, attempt: { id: "start-0003", sessionRevision: seenB } }))).toBe("SESSION_CONFLICT");
  });
});

describe("repeats, stale presses and restarts (H3, H5)", () => {
  it("the same press again returns its outcome (also to the former host, also after a restart) and changes nothing", () => {
    const { engine, ada, bea } = room();
    const p = press(engine);
    engine.transferHost(ada, bea, p);
    const rev = engine.session.revision;
    expect(engine.transferHost(ada, bea, p)).toEqual({ replay: true, hostId: bea, from: ada });
    const back = restart(engine);
    expect(back.transferHost(ada, bea, p)).toEqual({ replay: true, hostId: bea, from: ada });
    expect([back.session.revision, roles(back).hosts]).toEqual([rev, [bea]]);
    // The same id for anything else is refused.
    expect(() => engine.transferHost(ada, "player-4", p)).toThrow(/already used/);
    expect(() => engine.transferHost(bea, bea, p)).toThrow(/already used/);
  });

  it("two tabs choosing different players: one handover; the other is refused", () => {
    const { engine, ada, bea, cal } = room();
    const seen = engine.session.revision;
    engine.transferHost(ada, bea, { id: "tab1-press", sessionRevision: seen });
    expect(codeOf(() => engine.transferHost(ada, cal, { id: "tab2-press", sessionRevision: seen }))).toBe("NOT_HOST");
    expect(roles(engine).hosts).toEqual([bea]);
  });

  it("Ada → Bea → Ada, then Ada's old press to Cal arrives: refused as stale, never overwriting the later handover", () => {
    const { engine, ada, bea, cal } = room();
    const old = press(engine); // made, but delayed
    engine.transferHost(ada, bea, press(engine));
    engine.transferHost(bea, ada, press(engine));
    expect(codeOf(() => engine.transferHost(ada, cal, old))).toBe("SESSION_CONFLICT");
    expect(roles(engine).hosts).toEqual([ada]);
  });

  it("a forgotten press (beyond the remembered ones) is stale by its revision", () => {
    const { engine, ada, bea } = room();
    const p = press(engine);
    engine.transferHost(ada, bea, p);
    let host = bea, other = ada;
    for (let i = 0; i < SESSION_OPS_LIMIT; i++) { engine.transferHost(host, other, press(engine)); [host, other] = [other, host]; }
    expect(engine.session.ops.some((o) => o.id === p.id)).toBe(false);
    expect(engine.hostId).toBe(bea);
    // Bea is the host now; Ada's forgotten press is just a stale press by a non-host.
    expect(codeOf(() => engine.transferHost(ada, bea, p))).toBe("NOT_HOST");
    engine.transferHost(bea, ada, press(engine));
    expect(codeOf(() => engine.transferHost(ada, bea, p))).toBe("SESSION_CONFLICT");
  });

  it("a restart keeps exactly one host; a snapshot with inconsistent flags comes back with one; a late host-claim join is not the host", () => {
    const { engine, ada, bea, cal } = room();
    engine.grantCohost(ada, cal);
    engine.transferHost(ada, bea, press(engine));
    expect(roles(restart(engine))).toEqual({ hostId: bea, hosts: [bea], cohosts: [cal], cohostFlags: [cal] });
    const json = JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>;
    const players = (json["players"] as { id: string; isHost: boolean; isCohost: boolean }[]).map((p) => ({ ...p, isHost: true, isCohost: p.id === ada }));
    const odd = RoomEngine.fromJSON({ ...json, players, cohosts: [cal, bea] });
    expect(roles(odd)).toEqual({ hostId: bea, hosts: [bea], cohosts: [cal], cohostFlags: [cal] });
    const late = engine.join("Eve", { asHost: true }).player;
    expect([late.isHost, engine.hostId]).toEqual([false, bea]);
  });
});

describe("over HTTP and WebSocket", () => {
  let server: LocalServer; let base = ""; let port = 0; let dataDir = "";
  beforeAll(async () => { dataDir = mkdtempSync(join(tmpdir(), "mz-s73-")); server = new LocalServer({ dataDir }); port = await server.listen(0); base = `http://127.0.0.1:${port}`; });
  afterAll(async () => { await server.close(); });
  const call = async (method: string, path: string, body?: unknown, token?: string, at = base) => {
    const r = await fetch(`${at}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
  };
  async function casual(kind: "casual" | "cup" = "casual") {
    const made = (await call("POST", "/rooms", { kind })).body;
    const id = String(made["roomId"]);
    const claim = made["hostClaimToken"];
    const host = (await call("POST", `/rooms/${id}/join`, { displayName: "Ada", asHost: true, hostClaimToken: claim })).body;
    const bea = (await call("POST", `/rooms/${id}/join`, { displayName: "Bea" })).body;
    const cal = (await call("POST", `/rooms/${id}/join`, { displayName: "Cal" })).body;
    return { id, code: String(made["joinCode"]), claim, ada: { id: String(host["playerId"]), token: String(host["recoveryToken"]) }, bea: { id: String(bea["playerId"]), token: String(bea["recoveryToken"]) }, cal: { id: String(cal["playerId"]), token: String(cal["recoveryToken"]) } };
  }
  const view = async (r: { id: string }, token: string, at = base) => (await call("GET", `/rooms/${r.id}/projection?audience=player`, undefined, token, at)).body as { session: { revision: number }; players: { id: string; isHost: boolean; isCohost: boolean }[]; me: { isHost: boolean; isCohost: boolean }; recoveryRequests?: unknown };
  const attemptNow = async (r: { id: string }, token: string, id: string, at = base) => ({ id, sessionRevision: (await view(r, token, at)).session.revision });

  it("roles: 401 without a player's session, 403 for a guest or a cohost, 400 malformed or the host themself; 200 for the host", async () => {
    const r = await casual();
    const spect = (await call("POST", "/rooms/spectate-by-code", { joinCode: r.code })).body;
    const attempt = await attemptNow(r, r.ada.token, "http-hand-1");
    expect((await call("POST", `/rooms/${r.id}/host`, { targetId: r.bea.id, attempt })).status).toBe(401);
    expect((await call("POST", `/rooms/${r.id}/host`, { targetId: r.bea.id, attempt }, String(spect["spectatorToken"]))).status).toBe(401);
    expect((await call("POST", `/rooms/${r.id}/host`, { targetId: r.cal.id, attempt }, r.bea.token)).status).toBe(403);
    await call("POST", `/rooms/${r.id}/cohost`, { targetId: r.cal.id }, r.ada.token);
    expect((await call("POST", `/rooms/${r.id}/host`, { targetId: r.bea.id, attempt: await attemptNow(r, r.ada.token, "http-hand-2") }, r.cal.token)).status).toBe(403);
    for (const b of [{}, { targetId: r.bea.id }, { targetId: 5, attempt }, { targetId: r.bea.id, attempt, extra: 1 }]) {
      expect((await call("POST", `/rooms/${r.id}/host`, b, r.ada.token)).status, JSON.stringify(b)).toBe(400);
    }
    const self = await call("POST", `/rooms/${r.id}/host`, { targetId: r.ada.id, attempt }, r.ada.token);
    expect([self.status, self.body["code"]]).toEqual([400, "TARGET_INVALID"]);
    const ok = await call("POST", `/rooms/${r.id}/host`, { targetId: r.bea.id, attempt }, r.ada.token);
    expect([ok.status, ok.body["hostId"], ok.body["hostName"]]).toEqual([200, r.bea.id, "Bea"]);
    const replay = await call("POST", `/rooms/${r.id}/host`, { targetId: r.bea.id, attempt }, r.ada.token);
    expect([replay.status, replay.body["replay"], replay.body["hostId"]]).toEqual([200, true, r.bea.id]);
    const v = await view(r, r.cal.token);
    expect(v.players.filter((p) => p.isHost).map((p) => p.id)).toEqual([r.bea.id]);
    expect(v.players.find((p) => p.id === r.cal.id)?.isCohost).toBe(true); // the other cohost stays
    const cup = await casual("cup");
    const c = await call("POST", `/rooms/${cup.id}/host`, { targetId: cup.bea.id, attempt: { id: "http-hand-cup", sessionRevision: 0 } }, cup.ada.token); // a Cup room has no session
    expect([c.status, c.body["code"]]).toEqual([409, "NOT_A_CASUAL_ROOM"]);
  });

  it("the former host's privileged actions are refused at once; their projection carries no host data; the new host's work", async () => {
    const r = await casual();
    await call("POST", `/rooms/${r.id}/host`, { targetId: r.bea.id, attempt: await attemptNow(r, r.ada.token, "http-hand-3") }, r.ada.token);
    const rev = (await view(r, r.ada.token)).session.revision;
    const roster = ((await call("GET", `/rooms/${r.id}/projection?audience=player`, undefined, r.ada.token)).body["readiness"] as { wouldPlay: string[] }).wouldPlay;
    const tries = {
      break: await call("POST", `/rooms/${r.id}/break`, { on: true, attempt: { id: "old-host-brk", sessionRevision: rev } }, r.ada.token),
      lineup: await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, plan: { expectedPlayers: 3, budgetMinutes: 30, items: [{ gameId: "trivia" }] } }, r.ada.token),
      start: await call("POST", `/rooms/${r.id}/games`, { gameId: "math-mayhem", official: false, roster, attempt: { id: "old-host-start", sessionRevision: rev } }, r.ada.token),
      plan: await call("POST", `/rooms/${r.id}/plan`, { gameId: "trivia", official: false }, r.ada.token),
      cohost: await call("POST", `/rooms/${r.id}/cohost`, { targetId: r.cal.id }, r.ada.token),
      handBack: await call("POST", `/rooms/${r.id}/host`, { targetId: r.ada.id, attempt: { id: "old-host-back", sessionRevision: rev } }, r.ada.token),
    };
    for (const [what, t] of Object.entries(tries)) expect(t.status, what).toBeGreaterThanOrEqual(400);
    expect([tries.break.status, tries.lineup.status, tries.plan.status, tries.handBack.status]).toEqual([403, 403, 403, 403]);
    const old = await view(r, r.ada.token);
    expect([old.me.isHost, old.me.isCohost, old.recoveryRequests]).toEqual([false, false, undefined]);
    // The new host's actions work.
    const brk = await call("POST", `/rooms/${r.id}/break`, { on: true, attempt: await attemptNow(r, r.bea.token, "new-host-brk") }, r.bea.token);
    expect(brk.status).toBe(200);
  });

  it("an open WebSocket that connected as the host is served the player projection once its player isn't the host", async () => {
    const r = await casual();
    const frames: Record<string, unknown>[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?roomId=${r.id}&audience=host`, [`cgn-session-${r.ada.token}`]);
    ws.on("message", (d) => { const m = JSON.parse(d.toString()) as { kind: string; state?: Record<string, unknown> }; if (m.kind === "projection" && m.state) frames.push(m.state); });
    await new Promise<void>((res) => ws.on("open", () => res()));
    await new Promise((res) => setTimeout(res, 150));
    expect(frames.at(-1)?.["hostView"]).toBe(true);
    await call("POST", `/rooms/${r.id}/host`, { targetId: r.bea.id, attempt: await attemptNow(r, r.ada.token, "http-hand-ws") }, r.ada.token);
    await new Promise((res) => setTimeout(res, 200));
    const last = frames.at(-1)!;
    expect([last["hostView"], (last["me"] as { isHost: boolean }).isHost, last["recoveryRequests"]]).toEqual([undefined, false, undefined]);
    ws.close();
  });

  it("a server restart keeps exactly one host; the host-claim token can't seize the role back", async () => {
    const r = await casual();
    await call("POST", `/rooms/${r.id}/host`, { targetId: r.bea.id, attempt: await attemptNow(r, r.ada.token, "http-hand-4") }, r.ada.token);
    const later = new LocalServer({ dataDir });
    const at = `http://127.0.0.1:${await later.listen(0)}`;
    try {
      const v = await view(r, r.cal.token, at);
      expect(v.players.filter((p) => p.isHost).map((p) => p.id)).toEqual([r.bea.id]);
      const claim = await call("POST", `/rooms/${r.id}/join`, { displayName: "Eve", asHost: true, hostClaimToken: r.claim }, undefined, at);
      expect(claim.body["isHost"]).not.toBe(true);
      expect((await view(r, r.cal.token, at)).players.filter((p) => p.isHost).map((p) => p.id)).toEqual([r.bea.id]);
      // The former host's replay of their own press, after the restart: the outcome, nothing applied.
      const replay = await call("POST", `/rooms/${r.id}/host`, { targetId: r.bea.id, attempt: { id: "http-hand-4", sessionRevision: 0 } }, r.ada.token, at);
      expect([replay.status, replay.body["replay"], replay.body["hostId"]]).toEqual([200, true, r.bea.id]);
    } finally {
      await later.close();
    }
  });

  it("refusals carry the current host and session; nothing changes (HostRefused shape)", () => {
    const e = new HostRefused("GAME_ACTIVE", "x", { session: { onBreak: false, revision: 3 }, hostId: "player-1" });
    expect([e.code, e.detail.hostId, e.detail.session.revision]).toEqual(["GAME_ACTIVE", "player-1", 3]);
  });
});
