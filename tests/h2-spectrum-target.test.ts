/**
 * H2 (handoff 7008903623): in Spectrum only the entitled clue-giver receives the target before the reveal.
 * Explicit projection contracts with synthetic local fixtures, through the room's real projections:
 * - who: the clue-giver, each guesser, the host in a guessing seat, a cohost, the TV/spectator, a late joiner
 *   who only watches, and a guesser who sat out;
 * - when: every round's clue and guess phases (the giver rotates each round), its reveal, and the finished game;
 * - which audiences: the engine's player, host, cohost and tv projections, and over HTTP the player, host and
 *   spectator projections a phone, the host's tools and the TV actually fetch.
 * Every round has its own canary target (67, 77, 83, 89), so a target leaking into the wrong round shows too.
 * The rendering contract (phone and TV components) is apps/web/src/components/mchezo/MchezoSpectrum.test.tsx.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { SPECTRUM_ROUNDS, type SpectrumState } from "../src/games/modules/spectrum.js";
import { RoomEngine } from "../src/server/room.js";
import { FakeClock, Harness, type Player } from "./helpers/harness.js";

type Json = Record<string, unknown>;
const T0 = 1_800_000_000_000;
const CANARIES = [83, 77, 67, 89] as const;

function setup(n: number) {
  const engine = new RoomEngine("Spectrum night", { kind: "casual", timing: 2 });
  let t = T0;
  engine.clock = () => t;
  const ids = [engine.join("Keku", { asHost: true }).player.id];
  for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  return { engine, ids, send, now: () => t, set: (ms: number) => { t = ms; engine.tick(t); } };
}

/** Everything a projection says about the game: its state and its team result (timestamps elsewhere could hold any digits). */
function gameFacts(proj: Json, gid: string): string {
  const views = [...((proj["games"] as Json[] | undefined) ?? []), ...((proj["myGames"] as Json[] | undefined) ?? [])].filter((g) => g["id"] === gid);
  return JSON.stringify(views.map((g) => [g["state"], (g["outcome"] as Json | undefined)?.["team"] ?? null]));
}
/** The targets a projection holds, as numbers: any "target" key anywhere, and a canary anywhere in the game's facts. */
function targetsIn(proj: Json, gid: string): number[] {
  const whole = JSON.stringify(proj);
  const facts = gameFacts(proj, gid);
  return CANARIES.filter((c) => whole.includes(`"target":${c}`) || new RegExp(`(^|[^0-9])${c}([^0-9]|$)`).test(facts));
}

describe("H2: only the clue-giver has the target before the reveal, for every audience and round (engine projections)", () => {
  it("five players, the host and a cohost among them, a late joiner and a sit-out; all four rounds, each phase", () => {
    const env = setup(5);
    const [host, cohost] = env.ids as [string, string];
    env.engine.grantCohost(host, cohost);
    const g = env.engine.startGame(host, "spectrum", { official: false });
    for (const p of env.ids) env.send(p, g.id, "briefing-ready", { ready: true });
    const game = env.engine.games.get(g.id)!;
    expect(game.status).toBe("playing");
    const st = () => game.extra as SpectrumState;
    st().rounds.forEach((r, i) => { r.target = CANARIES[i]!; });
    const late = env.engine.join("Late").player.id;
    // Who looks: every seat as a phone, the host's and cohost's tool views, the TV (spectators get exactly this), the late joiner.
    const audiences = (): [string, Json][] => [
      ...env.ids.map((p): [string, Json] => [`player:${p}`, env.engine.project("player", p)]),
      ["host-audience", env.engine.project("host", host)],
      ["cohost-audience", env.engine.project("cohost", cohost)],
      ["tv", env.engine.project("tv")],
      ["late", env.engine.project("player", late)],
    ];
    let hostGuessed = false, hostGave = false, rotated = 0;
    let prevGiver: string | null = null;
    for (let r = 0; r < SPECTRUM_ROUNDS; r++) {
      const round = st().rounds[r]!;
      const giver = round.giver!;
      if (prevGiver && giver !== prevGiver) rotated++;
      if (giver === host) hostGave = true; else hostGuessed = true;
      const revealedBefore = CANARIES.slice(0, r);
      for (const phase of ["clue", "guess"] as const) {
        if (phase === "guess") expect(env.send(giver, g.id, "spectrum-clue", { round: r + 1, text: `clue ${r + 1}`, phaseKey: game.phaseKey }).accepted).toBe(true);
        expect(st().phase).toBe(phase);
        for (const [who, proj] of audiences()) {
          const seen = targetsIn(proj, g.id);
          const expected = [...revealedBefore, ...(who === `player:${giver}` ? [CANARIES[r]!] : [])];
          expect(seen.sort(), `${who} round ${r + 1} ${phase}`).toEqual([...expected].sort());
        }
      }
      // Round 2: a guesser sits out mid-guess; from then on they see what any watcher sees (no target before a reveal).
      if (r === 1) {
        const satOut = round.required.find((p) => p !== host && p !== cohost);
        expect(satOut).toBeDefined();
        expect(env.send(satOut!, g.id, "abstain", {}).accepted).toBe(true);
        expect(targetsIn(env.engine.project("player", satOut!), g.id).sort()).toEqual([...revealedBefore].sort());
      }
      // Everyone still asked guesses; the reveal shows this round's target to everyone, and no later one.
      for (const p of [...round.required]) env.send(p, g.id, "spectrum-guess", { round: r + 1, value: 50, phaseKey: game.phaseKey });
      expect(st().phase).toBe("reveal");
      for (const [who, proj] of audiences()) expect(targetsIn(proj, g.id).sort(), `${who} round ${r + 1} reveal`).toEqual([...CANARIES.slice(0, r + 1)].sort());
      prevGiver = giver;
      env.set(game.phaseDeadlineAt! + 1);
    }
    expect(game.status).toBe("finished");
    for (const [who, proj] of audiences()) expect(targetsIn(proj, g.id).sort(), `${who} finished`).toEqual([...CANARIES].sort());
    // The fixture covered what the handoff names: the host in a guessing seat, the roles rotating.
    expect(hostGuessed).toBe(true);
    expect(rotated).toBeGreaterThanOrEqual(2);
    // Whether the host also gave a clue depends on the shuffled order; when it did, that round checked the host as giver.
    void hostGave;
  });
});

describe("H2 over HTTP: the projections the phones, the host's tools and the TV actually fetch", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("the clue-giver's phone only, before the reveal; the host's own phone in a guessing seat, its host audience and a spectator never", async () => {
    const clock = new FakeClock();
    h = new Harness(undefined, { clock, timing: 2 });
    await h.start();
    const room = await h.post("/rooms", { name: "Spectrum night", kind: "casual" });
    h.roomId = room.body["roomId"] as string;
    h.joinCode = room.body["joinCode"] as string;
    h.hostClaimToken = room.body["hostClaimToken"] as string;
    const ps: Player[] = [await h.join("Keku", { host: true })];
    for (const name of ["Amina", "Baraka"]) ps.push(await h.join(name));
    const start = await h.startGame(ps[0]!, "spectrum", { official: false });
    expect(start.status, JSON.stringify(start.body)).toBeLessThan(300);
    const gid = start.body["gameId"] as string;
    for (const p of ps) await h.intent(p, gid, "briefing-ready", { ready: true });
    const engine = h.engine();
    const game = engine.games.get(gid)!;
    expect(game.status).toBe("playing");
    const st = game.extra as SpectrumState;
    st.rounds.forEach((r, i) => { r.target = CANARIES[i]!; });
    const spec = await h.post("/rooms/spectate-by-code", { joinCode: h.joinCode });
    const specToken = spec.body["spectatorToken"] as string;
    // Find a round where the host guesses (the order is shuffled at the start): play rounds until then.
    for (let r = 0; r < SPECTRUM_ROUNDS && st.rounds[st.round]!.giver === ps[0]!.playerId; r++) {
      clock.advance(game.phaseDeadlineAt! - clock.t + 1);
      h.lifecycleTick();
      clock.advance(game.phaseDeadlineAt! - clock.t + 1);
      h.lifecycleTick();
    }
    const r = st.round;
    const giverId = st.rounds[r]!.giver!;
    expect(giverId).not.toBe(ps[0]!.playerId);
    const giver = ps.find((p) => p.playerId === giverId)!;
    const target = CANARIES[r]!;
    const look = async () => ({
      giver: await h!.projection(giver),
      hostPhone: await h!.projection(ps[0]!),
      hostTools: (await h!.get(`/rooms/${h!.roomId}/projection?audience=host`, { "x-session-token": ps[0]!.token })).body,
      guesser: await h!.projection(ps.find((p) => p !== giver && p !== ps[0])!),
      spectator: (await h!.get(`/rooms/${h!.roomId}/projection?audience=spectator`, { "x-spectator-token": specToken })).body,
      tv: await h!.tv(),
    });
    const has = (proj: Json) => targetsIn(proj, gid).includes(target);
    for (const phase of ["clue", "guess"]) {
      if (phase === "guess") expect(await h.intent(giver, gid, "spectrum-clue", { round: r + 1, text: "a warm bath", phaseKey: game.phaseKey })).toMatchObject({ accepted: true });
      const v = await look();
      expect(has(v.giver), `giver ${phase}`).toBe(true);
      for (const who of ["hostPhone", "hostTools", "guesser", "spectator", "tv"] as const) expect(has(v[who]), `${who} ${phase}`).toBe(false);
    }
    // The supported reveal: everyone sees the target.
    clock.advance(game.phaseDeadlineAt! - clock.t + 1);
    h.lifecycleTick();
    expect(st.phase).toBe("reveal");
    const v = await look();
    for (const who of ["giver", "hostPhone", "hostTools", "guesser", "spectator", "tv"] as const) expect(has(v[who]), `${who} reveal`).toBe(true);
  });
});
