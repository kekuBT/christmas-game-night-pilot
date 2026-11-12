/**
 * Stage 9.3: Spectrum in the real room (docs/stage9/stage93.md), through
 * RoomEngine and the HTTP server: eligibility (casual-only, 2–10, late
 * joiners watch, never auto-picked), whole matches at 2, 4 and 10 players on
 * the room's phase clock, the cooperative result branch (outcome.team is the
 * one result; per-player copies never projected, logged, summed, overridden
 * or saved), exactly-once boundaries (phase keys, duplicates, catch-up after
 * a restart), privacy canaries for every role and phase through the room's
 * projections, persistence, Play again, host handover and the backstop.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { SPECTRUM_PHASE_MS, SPECTRUM_ROUNDS, spectrumTeamResult, type SpectrumState } from "../src/games/modules/spectrum.js";
import { RoomEngine, StartRefused } from "../src/server/room.js";
import { RoomSnapshotSchema, TeamResultSchema } from "../src/server/persistence.js";
import { NOT_IN_QUICK_PARTY, partyPool } from "../src/games/party.js";
import { shuffle } from "../src/games/shuffle.js";
import { FakeClock, Harness } from "./helpers/harness.js";

type Json = Record<string, unknown>;
const T0 = 1_800_000_000_000;

function setup(n: number, kind: "casual" | "cup" | "solo" = "casual") {
  const engine = new RoomEngine("Spectrum night", { kind, timing: 2 });
  let t = T0;
  engine.clock = () => t;
  const ids = [engine.join("Keku", { asHost: true }).player.id];
  for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
  const send = (pid: string, gid: string, action: string, payload: Json = {}, clientEventId: string = randomUUID()) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId, roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  return { engine, ids, send, now: () => t, set: (ms: number) => { t = ms; engine.tick(t); } };
}
type Env = ReturnType<typeof setup>;

function start(env: Env) {
  const g = env.engine.startGame(env.ids[0]!, "spectrum", { official: false });
  expect(env.engine.games.get(g.id)!.status).toBe("briefing");
  for (const p of env.ids) expect(env.send(p, g.id, "briefing-ready", { ready: true }).accepted).toBe(true);
  const game = env.engine.games.get(g.id)!;
  expect(game.status).toBe("playing");
  return { gid: g.id, game, st: () => game.extra as SpectrumState };
}
type Match = ReturnType<typeof start>;

const cur = (s: SpectrumState) => s.rounds[s.round]!;
const clue = (env: Env, m: Match, text = "a warm bath", phaseKey = m.game.phaseKey) =>
  env.send(cur(m.st()).giver!, m.gid, "spectrum-clue", { round: m.st().round + 1, text, phaseKey });
const guess = (env: Env, m: Match, pid: string, value: number, clientEventId?: string, phaseKey = m.game.phaseKey) =>
  env.send(pid, m.gid, "spectrum-guess", { round: m.st().round + 1, value, phaseKey }, clientEventId);

/** One round through the room: a clue now, everyone on the target (10 points), then the reveal runs out on the clock. */
function perfectRound(env: Env, m: Match): void {
  const r = m.st().round;
  expect(m.game.phaseKey).toBe(`r${r + 1}:clue`);
  expect(clue(env, m)).toMatchObject({ accepted: true, result: { phase: "guess" } });
  expect(m.game.phaseKey).toBe(`r${r + 1}:guess`);
  expect(m.game.phaseDeadlineAt).toBe(env.now() + SPECTRUM_PHASE_MS.guess);
  const target = cur(m.st()).target;
  for (const p of [...cur(m.st()).required]) expect(guess(env, m, p, target)).toMatchObject({ accepted: true });
  expect(m.game.phaseKey).toBe(`r${r + 1}:reveal`);
  expect(m.game.phaseDeadlineAt).toBe(env.now() + SPECTRUM_PHASE_MS.reveal);
  env.set(m.game.phaseDeadlineAt! + 1);
}

function gameViews(proj: Json, gid: string): Json[] {
  return [...((proj["games"] as Json[] | undefined) ?? []), ...((proj["myGames"] as Json[] | undefined) ?? [])].filter((g) => g["id"] === gid);
}

describe("Spectrum's eligibility (§2)", () => {
  it("casual rooms only, practice only, at least 2 connected players; Cup and solo rooms refuse it", () => {
    const cup = setup(3, "cup");
    expect(() => cup.engine.startGame(cup.ids[0]!, "spectrum", { official: false })).toThrow(StartRefused);
    const solo = setup(1, "solo");
    expect(() => solo.engine.startGame(solo.ids[0]!, "spectrum", { official: false })).toThrow();
    const alone = setup(1);
    expect(() => alone.engine.startGame(alone.ids[0]!, "spectrum", { official: false })).toThrow(/at least 2/);
    const env = setup(3);
    expect(() => env.engine.startGame(env.ids[0]!, "spectrum", { official: true })).toThrow();
    expect(env.engine.startGame(env.ids[0]!, "spectrum", { official: false }).official).toBe(false);
  });

  it("never added by Quick Party or picked by Smart Shuffle (a host starts it from the library)", () => {
    expect(NOT_IN_QUICK_PARTY.has("spectrum")).toBe(true);
    for (const n of [2, 4, 10]) expect(partyPool(n).map((i) => i.gameId)).not.toContain("spectrum");
    for (let seed = 1; seed <= 200; seed++) {
      for (const mode of ["random", "smart"] as const) {
        const r = shuffle({ mode, playerCount: 4, seed, recentIds: [] });
        if (r.ok) expect(r.picks.map((p) => p.gameId)).not.toContain("spectrum");
      }
    }
  });

  it("the roster is fixed at the start: a late joiner watches (public view only) and can't act", () => {
    const env = setup(3);
    const m = start(env);
    const late = env.engine.join("Late").player.id;
    expect(m.game.players).not.toContain(late);
    expect(m.st().order).not.toContain(late);
    expect(clue(env, m)).toMatchObject({ accepted: true });
    expect(guess(env, m, late, 50)).toMatchObject({ accepted: false, reason: "NOT_IN_GAME" });
    const view = gameViews(env.engine.project("player", late), m.gid);
    expect(view.length).toBeGreaterThan(0);
    for (const g of view) expect((g["state"] as { me?: unknown }).me).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain('"target"');
  });
});

describe.each([2, 4, 10])("Spectrum: a whole match through the room with %i players", (n) => {
  it("four rounds on the room's phase clock; one team result recorded, projected and logged; no per-player result anywhere", () => {
    const env = setup(n);
    const m = start(env);
    expect(m.game.phaseKey).toBe("r1:clue");
    expect(m.game.phaseDeadlineAt).toBe(env.now() + SPECTRUM_PHASE_MS.clue);
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) perfectRound(env, m);
    expect(m.game.status).toBe("finished");
    expect(m.game.outcome).toMatchObject({ reason: "completed", countsOfficially: false });
    const team = m.game.outcome!.team!;
    expect(team).toEqual(spectrumTeamResult(m.st()));
    expect(team).toMatchObject({ kind: "spectrum", total: 40, max: 40, end: "completed", roundsPlanned: 4 });
    expect(team.rounds).toHaveLength(4);
    expect(TeamResultSchema.safeParse(team).success).toBe(true);
    // The per-player copies stay inside the server: the same total for every roster player, never summed into the result.
    expect(Object.keys(m.game.rawScores).sort()).toEqual([...env.ids].sort());
    for (const p of env.ids) expect(m.game.rawScores[p]).toBe(40);
    // Projections: the team result for every audience; never per-player scores.
    for (const proj of [env.engine.project("tv"), ...env.ids.map((p) => env.engine.project("player", p))]) {
      const views = gameViews(proj, m.gid);
      expect(views.length).toBeGreaterThan(0);
      for (const g of views) {
        expect(g["rawScores"]).toBeUndefined();
        expect((g["outcome"] as Json)["team"]).toEqual(team);
        if ("myScore" in g) expect(g["myScore"]).toBe(0);
      }
    }
    // The ledger: one team event, no per-player score events for this game.
    const events = env.engine.ledger.filter((e) => e.gameInstanceId === m.gid);
    expect(events.filter((e) => e.type === "score-awarded")).toEqual([]);
    expect(events.filter((e) => e.type === "team-score-recorded")).toEqual([expect.objectContaining({ points: 40 })]);
    // Nothing per player can be drawn from it: no override, no Cup, no achievement from its copies.
    expect(() => env.engine.overrideScore(env.ids[0]!, m.gid, env.ids[1]!, 99, "test")).toThrow(/team result/);
    expect(env.engine.achievements().some((a) => a.ruleId === "perfect-math")).toBe(false);
  });
});

describe("Spectrum's boundaries through the room (§8)", () => {
  it("a send from a closed phase (its phase key) is refused and changes nothing; the round must match too", () => {
    const env = setup(3);
    const m = start(env);
    const oldKey = m.game.phaseKey;
    expect(clue(env, m)).toMatchObject({ accepted: true });
    const before = JSON.stringify(m.game.extra);
    const g = cur(m.st()).required[0]!;
    expect(guess(env, m, g, 50, undefined, oldKey)).toMatchObject({ accepted: false, reason: "PHASE_CLOSED" });
    expect(env.send(g, m.gid, "spectrum-guess", { round: 2, value: 50, phaseKey: m.game.phaseKey })).toMatchObject({ accepted: false, reason: "STALE_ROUND" });
    expect(env.send(g, m.gid, "spectrum-guess", { round: 1, value: 50, target: 50, phaseKey: m.game.phaseKey })).toMatchObject({ accepted: false, reason: "INVALID_PAYLOAD" });
    expect(JSON.stringify(m.game.extra)).toBe(before);
  });

  it("a repeated client event returns its first result and counts once", () => {
    const env = setup(4);
    const m = start(env);
    clue(env, m);
    const g = cur(m.st()).required[0]!;
    const id = randomUUID();
    const first = guess(env, m, g, 61, id);
    expect(first).toMatchObject({ accepted: true });
    expect(guess(env, m, g, 61, id)).toEqual(first);
    expect(Object.keys(cur(m.st()).guesses)).toEqual([g]);
    expect(guess(env, m, g, 62)).toMatchObject({ accepted: false, reason: "ALREADY_GUESSED" });
    expect(cur(m.st()).guesses[g]).toBe(61);
  });

  it("phases expire at their own deadline instants; a guess after the deadline finds the reveal", () => {
    const env = setup(3);
    const m = start(env);
    const clueDue = m.game.phaseDeadlineAt!;
    env.set(clueDue); // at the deadline instant, nothing has expired yet
    expect(m.game.phaseKey).toBe("r1:clue");
    env.set(clueDue + 1);
    expect(m.game.phaseKey).toBe("r1:reveal");
    expect(cur(m.st()).outcome).toMatchObject({ reason: "no-clue", points: 0 });
    expect(m.game.phaseDeadlineAt).toBe(clueDue + SPECTRUM_PHASE_MS.reveal);
    expect(clue(env, m)).toMatchObject({ accepted: false });
  });

  it("catch-up after a restart walks the original deadlines: the same state as a room that never stopped, and idempotent", () => {
    const env = setup(4);
    const m = start(env);
    clue(env, m);
    guess(env, m, cur(m.st()).required[0]!, 40);
    const snap = JSON.parse(JSON.stringify(env.engine.toJSON())) as Json;
    const outage = 5 * 60_000; // long enough for several rounds to run out on their own
    // A room that never stopped, ticking every second.
    const live = RoomEngine.fromJSON(JSON.parse(JSON.stringify(snap)));
    let t = env.now();
    live.clock = () => t;
    for (; t <= env.now() + outage; t += 1000) live.tick(t);
    // A room restored after the outage, catching up in one tick.
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(snap)));
    restored.clock = () => env.now() + outage;
    expect(restored.tick(env.now() + outage)).toBe(true);
    const a = live.games.get(m.gid)!, b = restored.games.get(m.gid)!;
    expect(b.status).toBe(a.status);
    expect(b.extra).toEqual(a.extra);
    expect(b.outcome).toEqual(a.outcome);
    expect((b.extra as SpectrumState).end).toBe("completed"); // the four rounds ran out on the clock
    expect(b.outcome?.team?.rounds[0]).toMatchObject({ aggregate: 40, guesses: 1 }); // the one guess sent counted, nothing invented
    expect(restored.tick(env.now() + outage)).toBe(false);
  });

  it("the backstop ends a stuck match with the revealed rounds only, and the result says the room ended it", () => {
    const env = setup(3);
    const m = start(env);
    perfectRound(env, m);
    clue(env, m);
    m.game.deadlineAt = env.now() + 10; // test seam: the 10-minute backstop arrives mid-round
    env.set(env.now() + 11);
    expect(m.game.status).toBe("finished");
    expect(m.game.outcome?.reason).toBe("backstop-partial");
    expect(m.game.outcome?.team).toMatchObject({ total: 10, end: null });
    expect(m.game.outcome?.team?.rounds).toHaveLength(1);
  });

  it("sit-outs through the room: the clue-giver leaving before the clue skips the round; fewer than two ends the match with the points earned", () => {
    const env = setup(3);
    const m = start(env);
    perfectRound(env, m);
    const giver = cur(m.st()).giver!;
    expect(env.send(giver, m.gid, "abstain", {}).accepted).toBe(true);
    expect(cur(m.st()).outcome).toMatchObject({ reason: "giver-left", points: 0 });
    expect(env.send(giver, m.gid, "spectrum-guess", { round: 2, value: 5 }).accepted).toBe(false);
    const another = m.st().order.find((p) => p !== giver && m.st().satOut[p] === undefined)!;
    expect(env.send(another, m.gid, "abstain", {}).accepted).toBe(true);
    expect(m.game.status).toBe("finished");
    expect(m.game.outcome?.team).toMatchObject({ total: 10, end: "too-few-players" });
  });

  it("the host role: handover waits for the match to end (Stage 7.3); roles come from the seat order, never from the host", () => {
    const env = setup(3);
    const m = start(env);
    const before = JSON.stringify({ order: m.st().order, giver: cur(m.st()).giver });
    expect(() => env.engine.transferHost(env.ids[0]!, env.ids[1]!, { id: randomUUID(), sessionRevision: env.engine.session.revision })).toThrow(/after it ends/);
    expect(JSON.stringify({ order: m.st().order, giver: cur(m.st()).giver })).toBe(before);
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) perfectRound(env, m);
    expect(env.engine.transferHost(env.ids[0]!, env.ids[1]!, { id: randomUUID(), sessionRevision: env.engine.session.revision })).toMatchObject({ hostId: env.ids[1] });
    expect(m.game.outcome?.team?.total).toBe(40); // the finished result is untouched
  });

  it("Play again: a fresh match (new briefing, no clue, guess or role carried over), linked to the last one", () => {
    const env = setup(3);
    const m = start(env);
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) perfectRound(env, m);
    const again = env.engine.startRematch(env.ids[0]!, m.gid, {});
    expect(again.game.gameId).toBe("spectrum");
    expect(again.game.rematchOf).toBe(m.gid);
    expect(again.game.status).toBe("briefing");
    for (const p of env.ids) expect(env.send(p, again.game.id, "briefing-ready", { ready: true }).accepted).toBe(true);
    const s = env.engine.games.get(again.game.id)!.extra as SpectrumState;
    expect(s).toMatchObject({ round: 0, phase: "clue", total: 0, end: null });
    expect(s.rounds.every((r) => r.clue === null && Object.keys(r.guesses).length === 0 && r.outcome === null)).toBe(true);
    expect(env.engine.games.get(again.game.id)!.outcome).toBeUndefined();
  });
});

describe("Spectrum privacy through the room's projections, with canaries (§9)", () => {
  it("every role and phase: the target is the clue-giver's alone until the reveal; a guess is its sender's alone, always; future rounds stay hidden", () => {
    const env = setup(4);
    const m = start(env);
    const targets = [73, 61, 37, 29];
    m.st().rounds.forEach((r, i) => { r.target = targets[i]!; });
    const late = env.engine.join("Late").player.id;
    const giver = cur(m.st()).giver!;
    const guessers = m.st().order.filter((p) => p !== giver);
    const [ga, gb, gc] = guessers as [string, string, string];
    const audiences: [string, Json][] = [];
    const look = () => {
      audiences.length = 0;
      audiences.push(["tv", env.engine.project("tv")], ["late", env.engine.project("player", late)]);
      for (const p of env.ids) audiences.push([p, env.engine.project("player", p)]);
    };
    // State and team result only (timestamps elsewhere could hold any digits).
    const facts = (proj: Json) => JSON.stringify(gameViews(proj, m.gid).map((g) => [g["state"], (g["outcome"] as Json | undefined)?.["team"] ?? null]));
    // Clue phase.
    look();
    for (const [who, proj] of audiences) {
      expect(facts(proj).includes("73"), `${who} clue phase`).toBe(who === giver);
      for (const future of [61, 37, 29]) expect(JSON.stringify(proj)).not.toContain(`"target":${future}`);
    }
    // Guess phase: two of three guesses in.
    clue(env, m);
    guess(env, m, ga, 44);
    guess(env, m, gb, 58);
    look();
    for (const [who, proj] of audiences) {
      const f = facts(proj);
      expect(f.includes("73"), `${who} guess phase target`).toBe(who === giver);
      expect(f.includes("44"), `${who} guess 44`).toBe(who === ga);
      expect(f.includes("58"), `${who} guess 58`).toBe(who === gb);
    }
    // The reveal: the target and the team's guess are public; individual guesses stay with their senders.
    guess(env, m, gc, 50);
    expect(m.game.phaseKey).toBe("r1:reveal");
    look();
    for (const [who, proj] of audiences) {
      const f = facts(proj);
      expect(f, `${who} reveal`).toContain("73");
      expect(f.includes("44"), `${who} reveal 44`).toBe(who === ga);
      expect(f.includes("58"), `${who} reveal 58`).toBe(who === gb);
      expect(JSON.stringify(proj)).not.toContain('"target":61');
    }
    // Finished: the team result for everyone; no individual guess anywhere, for anyone.
    env.set(m.game.phaseDeadlineAt! + 1);
    for (let r = 1; r < SPECTRUM_ROUNDS; r++) perfectRound(env, m);
    expect(m.game.status).toBe("finished");
    look();
    for (const [who, proj] of audiences) {
      const f = facts(proj);
      expect(f, `${who} finished`).toContain("73");
      expect(f.includes("44") || f.includes("58"), `${who} finished guesses`).toBe(false);
    }
    expect(m.game.outcome?.team?.rounds[0]).toMatchObject({ target: 73, aggregate: 50, guesses: 3 });
  });
});

describe("Spectrum's team result is persisted and checked on restore (§3)", () => {
  function finished() {
    const env = setup(3);
    const m = start(env);
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) perfectRound(env, m);
    return { env, m, snap: JSON.parse(JSON.stringify(env.engine.toJSON())) as Json };
  }
  const gameOf = (snap: Json, gid: string) => (snap["games"] as Json[]).find((g) => g["id"] === gid)! as Json & { outcome: Json & { team?: Json } };

  it("a save and restore keeps the same team result, validated", () => {
    const { m, snap } = finished();
    expect(RoomSnapshotSchema.safeParse(snap).success).toBe(true);
    const restored = RoomEngine.fromJSON(snap);
    expect(restored.games.get(m.gid)!.outcome?.team).toEqual(m.game.outcome?.team);
  });

  it("a tampered or missing team result is refused, and only a cooperative game may carry one", () => {
    const { m, snap } = finished();
    const bad = (mutate: (g: Json & { outcome: Json & { team?: Json } }) => void) => {
      const copy = JSON.parse(JSON.stringify(snap)) as Json;
      mutate(gameOf(copy, m.gid));
      return RoomSnapshotSchema.safeParse(copy).success;
    };
    expect(bad((g) => { g.outcome.team!["total"] = 41; })).toBe(false);
    expect(bad((g) => { g.outcome.team!["total"] = 30; })).toBe(false); // the rounds no longer add up
    expect(bad((g) => { (g.outcome.team!["rounds"] as Json[])[0]!["guessesBy"] = { someone: 44 }; })).toBe(false);
    expect(bad((g) => { delete g.outcome.team; })).toBe(false);
    expect(bad((g) => { g["gameId"] = "trivia"; })).toBe(false);
  });
});

describe("Spectrum and the Memory Book over HTTP (§3: not saved in this slice)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("an entry citing a finished Spectrum match is refused; nothing is added", async () => {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    const r = await h.post("/rooms", { name: "Spectrum night", kind: "casual" });
    h.roomId = r.body["roomId"] as string;
    h.joinCode = r.body["joinCode"] as string;
    h.hostClaimToken = r.body["hostClaimToken"] as string;
    const host = await h.join("Keku", { host: true });
    const guest = await h.join("Amina");
    const started = await h.startGame(host, "spectrum", { official: false });
    expect(started.status).toBe(201);
    const gid = started.body["gameId"] as string;
    for (const p of [host, guest]) expect((await h.intent(p, gid, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
    expect((await h.intent(guest, gid, "abstain", {}))["accepted"]).toBe(true); // fewer than two left: the match ends
    expect(h.game(gid).status).toBe("finished");
    const finishedEvent = h.engine().ledger.find((e) => e.type === "game-finished" && e.gameInstanceId === gid)!;
    const res = await h.post(`/rooms/${h.roomId}/memory`, { day: 1, text: "We played Spectrum", sourceEventIds: [finishedEvent.eventId] }, host.token);
    expect(res.status).toBe(409);
    expect(res.body["code"]).toBe("NOT_IN_MEMORY_BOOK");
    expect((await h.get(`/rooms/${h.roomId}/memory`, { "x-session-token": host.token })).body).toEqual([]);
  });
});

describe("review 6815042876: no achievement is ever drawn from a cooperative game", () => {
  it("a room whose only finished game is Spectrum has no achievement; the next competitive game is the room's first", () => {
    const env = setup(3);
    const m = start(env);
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) perfectRound(env, m);
    expect(m.game.status).toBe("finished");
    expect(env.engine.achievements()).toEqual([]);
    for (const p of env.ids) expect((env.engine.project("player", p) as { achievements?: unknown[] }).achievements ?? []).toEqual([]);
    expect((env.engine.project("tv") as { achievements?: unknown[] }).achievements ?? []).toEqual([]);
    // A competitive game afterwards: "First Game Finished" cites that game, never the Spectrum match.
    const g = env.engine.startGame(env.ids[0]!, "trivia", { official: false });
    for (const p of env.ids) env.send(p, g.id, "briefing-ready", { ready: true });
    const trivia = env.engine.games.get(g.id)!;
    expect(trivia.status).toBe("playing");
    for (const p of env.ids) env.send(p, g.id, "abstain", {});
    expect(trivia.status).toBe("finished");
    const first = env.engine.achievements().find((a) => a.ruleId === "first-game");
    expect(first).toBeDefined();
    const cited = env.engine.ledger.filter((e) => first!.sourceEventIds.includes(e.eventId));
    expect(cited.every((e) => e.gameInstanceId === g.id)).toBe(true);
  });
});
