/**
 * Stage 7.1: Quick Party (docs/stage7/stage71.md). The pure planner (time
 * fit, eligibility, determinism, editing), the room's saved lineup
 * (authorization, validation, revisions, persistence, projection, no Cup
 * or content effects), and the lineup's first-game start (roster checks,
 * repeat-safety), over the engine and over HTTP.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GAME_MANIFESTS, type GameManifest } from "../src/games/manifest.js";
import {
  PARTY_BUDGETS, PARTY_MAX_GAMES, PARTY_TRANSITION_MINUTES, describeLineup, lineupMinutes, moveItem, partyItemsFor, partyPool, planParty, removeItem, replacementOptions,
  validatePartyPlan, type PartyItem,
} from "../src/games/party.js";
import { LocalServer } from "../src/server/http.js";
import { PartyRefused, RoomEngine, StartRefused } from "../src/server/room.js";

const manifestOf = (id: string) => GAME_MANIFESTS.find((m) => m.id === id)!;
const fitsGroup = (it: PartyItem, n: number) => n >= it.minPlayers && n <= it.maxPlayers;

describe("the planner (pure)", () => {
  it("every group size and preset: within budget, every game fits the group, no duplicates, the estimate adds up", () => {
    for (const n of [1, 2, 3, 4, 10]) {
      for (const budget of PARTY_BUDGETS) {
        for (const seed of [1, 2, 3, 42, 977]) {
          const l = planParty({ expectedPlayers: n, budgetMinutes: budget, seed });
          const tag = `${n}p/${budget}m/seed ${seed}`;
          expect(l.status, tag).not.toBe("none");
          expect(l.items.length, tag).toBeGreaterThan(0);
          expect(l.items.length, tag).toBeLessThanOrEqual(PARTY_MAX_GAMES);
          expect(l.estimateMinutes, tag).toBeLessThanOrEqual(budget);
          expect(l.estimateMinutes, tag).toBe(l.items.reduce((s, i) => s + manifestOf(i.gameId).duration.minutes + PARTY_TRANSITION_MINUTES, 0));
          expect(new Set(l.items.map((i) => i.gameId)).size, tag).toBe(l.items.length);
          for (const it of l.items) expect(fitsGroup(it, n), `${tag} ${it.gameId}`).toBe(true);
          expect(l.poolSize, tag).toBe(GAME_MANIFESTS.filter((m) => n >= m.minPlayers && n <= m.maxPlayers).length);
        }
      }
    }
  });

  it("the time-fit rule: a game counts as its design estimate plus 2 minutes; a lineup fits at or under the budget", () => {
    expect(PARTY_TRANSITION_MINUTES).toBe(2);
    const items = partyItemsFor(["trivia", "math-mayhem", "category-sprint"]) as PartyItem[];
    expect(lineupMinutes(items)).toBe(10 + 2 + 5 + 2 + 5 + 2); // 26
    expect(validatePartyPlan({ expectedPlayers: 4, budgetMinutes: 30, items: items.map((i) => ({ gameId: i.gameId })) })).toEqual({ ok: true, estimateMinutes: 26 });
    // Exactly at the budget fits; one minute over doesn't.
    const atBudget = partyItemsFor(["trivia", "word-connections", "math-mayhem"]) as PartyItem[]; // 12 + 10 + 7 = 29
    expect(lineupMinutes(atBudget)).toBe(29);
    const twoTens = partyItemsFor(["trivia", "impostor", "math-mayhem"]) as PartyItem[]; // 12 + 12 + 7 = 31
    expect(validatePartyPlan({ expectedPlayers: 4, budgetMinutes: 30, items: twoTens.map((i) => ({ gameId: i.gameId })) }).ok).toBe(false);
  });

  it("one player: only the three games that work alone, so a longer budget gives an honest short lineup", () => {
    const l = planParty({ expectedPlayers: 1, budgetMinutes: 60, seed: 3 });
    expect(l.status).toBe("short");
    expect(l.items.map((i) => i.gameId).sort()).toEqual(["math-mayhem", "pattern-pulse", "word-connections"]);
    expect(l.estimateMinutes).toBe(24);
    expect(l.poolSize).toBe(3);
  });

  it("invalid requests are refused, not guessed", () => {
    for (const n of [0, 11, 2.5, -1, Number.NaN]) expect(() => planParty({ expectedPlayers: n, budgetMinutes: 30, seed: 1 }), String(n)).toThrow(/group size/);
    for (const b of [0, 20, 45, 90]) expect(() => planParty({ expectedPlayers: 4, budgetMinutes: b, seed: 1 }), String(b)).toThrow(/budget/);
    expect(() => planParty({ expectedPlayers: 4, budgetMinutes: 30, seed: 1.5 })).toThrow(/seed/);
  });

  it("deterministic for a seed; different seeds give different lineups", () => {
    const a = planParty({ expectedPlayers: 4, budgetMinutes: 60, seed: 1234 });
    expect(planParty({ expectedPlayers: 4, budgetMinutes: 60, seed: 1234 })).toEqual(a);
    const seen = new Set<string>();
    for (let s = 0; s < 30; s++) seen.add(planParty({ expectedPlayers: 4, budgetMinutes: 60, seed: s }).items.map((i) => i.gameId).join(","));
    expect(seen.size).toBeGreaterThan(5);
  });

  it("nothing fits: no game for the group, or none short enough, is said plainly", () => {
    const long: GameManifest[] = GAME_MANIFESTS.filter((m) => m.minPlayers <= 4).map((m) => ({ ...m, duration: { ...m.duration, minutes: 20 } }));
    const tooShort = planParty({ expectedPlayers: 4, budgetMinutes: 15, seed: 1, manifests: long });
    expect(tooShort).toMatchObject({ status: "none", noneReason: "too-short", items: [], estimateMinutes: 0 });
    expect(planParty({ expectedPlayers: 4, budgetMinutes: 30, seed: 1, manifests: long }).status).toBe("fits"); // a longer time offers one
    const noGame = planParty({ expectedPlayers: 1, budgetMinutes: 30, seed: 1, excludeIds: ["math-mayhem", "pattern-pulse", "word-connections"] });
    expect(noGame).toMatchObject({ status: "none", noneReason: "no-game-for-group", poolSize: 0 });
  });

  it("exclusions are hard; recently played games are only less likely, and never break eligibility", () => {
    for (let s = 0; s < 20; s++) {
      const l = planParty({ expectedPlayers: 4, budgetMinutes: 60, seed: s, excludeIds: ["trivia", "impostor"] });
      expect(l.items.some((i) => i.gameId === "trivia" || i.gameId === "impostor"), `seed ${s}`).toBe(false);
    }
    const pool = partyPool(3).map((p) => p.gameId);
    const recent = pool.filter((id) => id !== "majority-rules");
    let firstIsFresh = 0;
    for (let s = 0; s < 200; s++) {
      const l = planParty({ expectedPlayers: 3, budgetMinutes: 15, seed: s, recentIds: [...recent, "impostor"] });
      if (l.items[0]?.gameId === "majority-rules") firstIsFresh++;
      expect(l.items.every((i) => fitsGroup(i, 3)), `seed ${s}`).toBe(true); // impostor (4+) never appears
    }
    // 9 eligible games: by chance alone the fresh one leads about 1 in 9 (22 of 200); its bonus roughly doubles that.
    expect(firstIsFresh).toBeGreaterThan(30);
  });

  it("editing: replacements fit the group, aren't in the lineup and keep it within budget; remove and move", () => {
    const l = planParty({ expectedPlayers: 4, budgetMinutes: 30, seed: 5 });
    for (let i = 0; i < l.items.length; i++) {
      const opts = replacementOptions(l, i);
      const others = l.items.filter((_, k) => k !== i);
      for (const o of opts) {
        expect(fitsGroup(o, 4)).toBe(true);
        expect(l.items.some((x) => x.gameId === o.gameId)).toBe(false);
        expect(lineupMinutes([...others, o])).toBeLessThanOrEqual(30);
      }
    }
    // A full 15-minute lineup of one 10-minute game: a replacement must fit 15.
    const fifteen = describeLineup(4, 15, partyItemsFor(["impostor"]) as PartyItem[]);
    expect(replacementOptions(fifteen, 0).every((o) => o.minutes + 2 <= 15 && o.gameId !== "impostor")).toBe(true);
    expect(replacementOptions(fifteen, 0).length).toBeGreaterThan(0);
    const three = partyItemsFor(["trivia", "math-mayhem", "category-sprint"]) as PartyItem[];
    expect(removeItem(three, 1).map((i) => i.gameId)).toEqual(["trivia", "category-sprint"]);
    expect(moveItem(three, 2, -1).map((i) => i.gameId)).toEqual(["trivia", "category-sprint", "math-mayhem"]);
    expect(moveItem(three, 0, -1).map((i) => i.gameId)).toEqual(["trivia", "math-mayhem", "category-sprint"]); // first can't move up
    expect(moveItem(three, 2, 1).map((i) => i.gameId)).toEqual(["trivia", "math-mayhem", "category-sprint"]); // last can't move down
    expect(describeLineup(4, 30, three)).toMatchObject({ status: "fits", estimateMinutes: 26 });
  });

  it("the server-side check: group size, budget, length, known games, fit to the group, no duplicates, within budget", () => {
    const ok = { expectedPlayers: 4, budgetMinutes: 30, items: [{ gameId: "trivia" }, { gameId: "math-mayhem" }] };
    expect(validatePartyPlan(ok)).toEqual({ ok: true, estimateMinutes: 19 });
    const bad: [string, Parameters<typeof validatePartyPlan>[0]][] = [
      ["size 0", { ...ok, expectedPlayers: 0 }],
      ["size 11", { ...ok, expectedPlayers: 11 }],
      ["size 3.5", { ...ok, expectedPlayers: 3.5 }],
      ["budget 20", { ...ok, budgetMinutes: 20 }],
      ["no games", { ...ok, items: [] }],
      ["nine games", { ...ok, budgetMinutes: 60, items: Array.from({ length: 9 }, () => ({ gameId: "math-mayhem" })) }],
      ["duplicate", { ...ok, items: [{ gameId: "trivia" }, { gameId: "trivia" }] }],
      ["unknown", { ...ok, items: [{ gameId: "chess" }] }],
      ["too few for impostor", { ...ok, expectedPlayers: 3, items: [{ gameId: "impostor" }] }],
      ["over budget", { ...ok, budgetMinutes: 15, items: [{ gameId: "trivia" }, { gameId: "math-mayhem" }] }],
    ];
    for (const [why, plan] of bad) expect(validatePartyPlan(plan).ok, why).toBe(false);
  });
});

/** A casual room with a host and `guests` more players, all connected. */
function casualRoom(guests: number, opts: { timing?: 1 | 2 } = {}) {
  const engine = new RoomEngine("Party", { kind: "casual", ...(opts.timing ? { timing: opts.timing } : {}) });
  const host = engine.join("Host", { asHost: true }).player.id;
  const others = Array.from({ length: guests }, (_, i) => engine.join(`P${i + 1}`).player.id);
  return { engine, host, others };
}
const plan = (expectedPlayers: number, ids: string[], budgetMinutes = 30) => ({ expectedPlayers, budgetMinutes, items: ids.map((gameId) => ({ gameId })) });
const refusal = (fn: () => unknown) => { try { fn(); } catch (e) { return e; } return undefined; };

describe("the room's saved lineup", () => {
  it("only the host or a cohost of a casual room saves it; each save or clear moves the revision on", () => {
    const { engine, host, others } = casualRoom(3);
    expect(engine.partyView()).toEqual({ revision: 0, lineup: null });
    expect((refusal(() => engine.savePartyPlan(others[0]!, 0, plan(4, ["trivia"]))) as PartyRefused).code).toBe("NOT_HOST");
    engine.savePartyPlan(host, 0, plan(4, ["trivia", "math-mayhem"]));
    expect(engine.partyView().revision).toBe(1);
    engine.grantCohost(host, others[0]!);
    engine.savePartyPlan(others[0]!, 1, plan(4, ["impostor"]));
    expect(engine.partyView()).toMatchObject({ revision: 2, lineup: { expectedPlayers: 4, budgetMinutes: 30, estimateMinutes: 12, transitionMinutes: 2, items: [{ gameId: "impostor", started: false }] } });
    engine.savePartyPlan(host, 2, null);
    expect(engine.partyView()).toEqual({ revision: 3, lineup: null });
    for (const kind of ["cup", "solo"] as const) {
      const other = new RoomEngine("x", { kind });
      const h = other.join("H", { asHost: true }).player.id;
      expect((refusal(() => other.savePartyPlan(h, 0, plan(1, ["math-mayhem"]))) as PartyRefused).code, kind).toBe("NOT_A_CASUAL_ROOM");
      expect(other.project("player", h)["party"], kind).toBeUndefined();
    }
  });

  it("a stale revision (another tab, a cohost) is refused and changes nothing", () => {
    const { engine, host } = casualRoom(3);
    engine.savePartyPlan(host, 0, plan(4, ["trivia"]));
    const before = JSON.stringify(engine.partyView());
    expect((refusal(() => engine.savePartyPlan(host, 0, plan(4, ["impostor"]))) as PartyRefused).code).toBe("PLAN_CONFLICT");
    expect((refusal(() => engine.savePartyPlan(host, 0, null)) as PartyRefused).code).toBe("PLAN_CONFLICT");
    expect(JSON.stringify(engine.partyView())).toBe(before);
  });

  it("an invalid lineup is refused (the browser is not trusted)", () => {
    const { engine, host } = casualRoom(3);
    for (const p of [plan(4, ["trivia", "trivia"]), plan(3, ["impostor"]), plan(4, ["chess"]), plan(4, ["trivia", "impostor"], 15), { ...plan(4, ["trivia"]), budgetMinutes: 20 }]) {
      expect((refusal(() => engine.savePartyPlan(host, 0, p)) as PartyRefused).code, JSON.stringify(p)).toBe("INVALID_PLAN");
    }
    expect(engine.partyView().revision).toBe(0);
  });

  it("saving uses no content, starts nothing, and touches no ledger, Cup or standings", () => {
    const { engine, host } = casualRoom(3);
    const before = { usage: JSON.stringify(engine.contentUsage), seq: engine.contentSeq, ledger: engine.ledger.length, games: engine.games.size, standings: JSON.stringify(engine.officialStandings()) };
    engine.savePartyPlan(host, 0, plan(4, ["trivia", "word-connections", "math-mayhem"]));
    engine.savePartyPlan(host, 1, plan(4, ["closest-wins", "geography"]));
    expect({ usage: JSON.stringify(engine.contentUsage), seq: engine.contentSeq, ledger: engine.ledger.length, games: engine.games.size, standings: JSON.stringify(engine.officialStandings()) }).toEqual(before);
  });

  it("everyone (guests and the TV) sees the same public lineup, and nothing private", () => {
    const { engine, host, others } = casualRoom(3);
    engine.savePartyPlan(host, 0, plan(4, ["trivia", "math-mayhem"]));
    const forGuest = engine.project("player", others[1]!)["party"];
    const forTv = engine.project("tv")["party"];
    expect(forTv).toEqual(forGuest);
    expect(forTv).toEqual(engine.partyView());
    expect(JSON.stringify(forTv)).not.toMatch(/token|seed|hostClaim|answer|gameInstanceId/i);
  });

  it("is saved with the room, and a damaged saved lineup is dropped whole", () => {
    const { engine, host } = casualRoom(3);
    engine.savePartyPlan(host, 0, plan(4, ["trivia", "math-mayhem"]));
    engine.savePartyPlan(host, 1, plan(4, ["impostor", "math-mayhem"]));
    const json = JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>;
    const back = RoomEngine.fromJSON(json);
    expect(back.partyView()).toEqual(engine.partyView());
    expect(back.partyView().revision).toBe(2);
    const damaged: [string, unknown][] = [
      ["unknown game", { ...(json["party"] as object), items: [{ gameId: "chess" }] }],
      ["over budget", { ...(json["party"] as object), budgetMinutes: 15 }],
      ["a revision from the future", { ...(json["party"] as object), revision: 9 }],
      ["not an object", "lineup"],
    ];
    for (const [why, party] of damaged) {
      const r = RoomEngine.fromJSON({ ...json, party });
      expect(r.partyView(), why).toEqual({ revision: 2, lineup: null });
    }
    // Rooms saved before Stage 7.1 have no lineup and start at revision 0.
    const { party: _p, partyRevision: _r, ...older } = json;
    expect(RoomEngine.fromJSON(older).partyView()).toEqual({ revision: 0, lineup: null });
  });
});

describe("starting the lineup's first game", () => {
  function planned(guests: number, expected: number, ids: string[], opts: { timing?: 1 | 2 } = {}) {
    const r = casualRoom(guests, opts);
    r.engine.savePartyPlan(r.host, 0, plan(expected, ids));
    return r;
  }

  it("starts through the ordinary start (practice, roster as shown), marks the item, and keeps the lineup", () => {
    const { engine, host } = planned(3, 4, ["trivia", "math-mayhem"]);
    const roster = engine.readiness().wouldPlay;
    const { game, replay } = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, roster });
    expect(replay).toBe(false);
    expect(game.official).toBe(false);
    expect(game.players.sort()).toEqual([...roster].sort());
    expect(engine.partyView().lineup?.items).toEqual([{ gameId: "trivia", started: true }, { gameId: "math-mayhem", started: false }]);
    expect(engine.games.size).toBe(1); // nothing else started: no automatic next game
    expect(engine.officialStandings()).toEqual(casualRoom(0).engine.officialStandings());
  });

  it("repeat-safe: the same start again (a lost reply, a second tab) returns that game, never a second one", () => {
    const { engine, host } = planned(3, 4, ["trivia", "math-mayhem"]);
    const first = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 });
    const again = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 });
    expect(again).toEqual({ game: first.game, replay: true });
    expect(engine.games.size).toBe(1);
  });

  it("a cancelled briefing leaves no game, so the item can be started again", () => {
    const { engine, host } = planned(3, 4, ["trivia"], { timing: 2 });
    const first = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 });
    expect(first.game.status).toBe("briefing");
    engine.cancelBriefing(host, first.game.id);
    expect(engine.partyView().lineup?.items[0]?.started).toBe(false);
    const second = engine.startPartyGame(host, "trivia", { revision: 1, index: 0 });
    expect(second.replay).toBe(false);
    expect(second.game.id).not.toBe(first.game.id);
  });

  it("fewer here than planned needs an explicit OK; the planned count never stands in for real players", () => {
    const { engine, host } = planned(2, 5, ["trivia"]); // planned 5, 3 here
    const e = refusal(() => engine.startPartyGame(host, "trivia", { revision: 1, index: 0 })) as StartRefused;
    expect(e).toBeInstanceOf(StartRefused);
    expect([e.code, e.detail]).toEqual(["PARTY_FEWER_THAN_PLANNED", { expected: 5, here: 3 }]);
    expect(engine.games.size).toBe(0);
    expect([engine.contentSeq, JSON.stringify(engine.contentUsage)]).toEqual([0, "{}"]); // a refused start uses no content
    const ok = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, fewerThanPlanned: true });
    expect(ok.game.players).toHaveLength(3);
    expect(engine.contentSeq).toBe(1); // content is chosen only by the real start
  });

  it("the real roster must fit the game, whatever was planned", () => {
    const { engine, host, others } = planned(3, 4, ["impostor"]);
    engine.disconnect(others[0]!);
    engine.clock = (() => { const t = Date.now() + 120_000; return () => t; })(); // past the reconnect grace: away
    const e = refusal(() => engine.startPartyGame(host, "impostor", { revision: 1, index: 0, fewerThanPlanned: true })) as StartRefused;
    expect([e.code, e.detail?.["minPlayers"], e.detail?.["here"]]).toEqual(["PARTY_DOESNT_FIT", 4, 3]);
    expect(engine.games.size).toBe(0);
    expect(engine.partyView().lineup?.items[0]?.started).toBe(false);
  });

  it("someone reconnecting is never left out silently: the host names them, or waits", () => {
    const { engine, host, others } = planned(3, 4, ["trivia"]);
    engine.disconnect(others[2]!); // within the grace window
    const e = refusal(() => engine.startPartyGame(host, "trivia", { revision: 1, index: 0, fewerThanPlanned: true })) as StartRefused;
    expect(e.code).toBe("PLAYERS_RECONNECTING");
    expect(engine.games.size).toBe(0);
    const ok = engine.startPartyGame(host, "trivia", { revision: 1, index: 0, fewerThanPlanned: true, proceedWithout: [others[2]!] });
    expect(ok.game.players).not.toContain(others[2]);
  });

  it("a stale or wrong lineup start is refused: old revision, wrong game, not the next item; and a changed roster", () => {
    const { engine, host, others } = planned(3, 4, ["trivia", "math-mayhem"]);
    const codeOf = (o: Parameters<RoomEngine["startPartyGame"]>[2], g = "trivia") => (refusal(() => engine.startPartyGame(host, g, o)) as StartRefused).code;
    expect(codeOf({ revision: 0, index: 0 })).toBe("PLAN_CONFLICT");
    expect(codeOf({ revision: 1, index: 0 }, "math-mayhem")).toBe("PLAN_CONFLICT");
    expect(codeOf({ revision: 1, index: 1 }, "math-mayhem")).toBe("PLAN_CONFLICT");
    expect(codeOf({ revision: 1, index: 5 })).toBe("PLAN_CONFLICT");
    expect(codeOf({ revision: 1, index: 0, roster: [host, others[0]!] })).toBe("ROSTER_CHANGED");
    expect(engine.games.size).toBe(0);
    expect(engine.partyView().lineup?.items.every((i) => !i.started)).toBe(true);
  });

  it("only in casual rooms, and only by the host or a cohost", () => {
    const { engine, others } = planned(3, 4, ["trivia"]);
    expect(() => engine.startPartyGame(others[0]!, "trivia", { revision: 1, index: 0 })).toThrow(/host/);
    const cup = new RoomEngine("Cup", { kind: "cup" });
    const h = cup.join("H", { asHost: true }).player.id;
    cup.join("G");
    expect((refusal(() => cup.startPartyGame(h, "trivia", { revision: 0, index: 0 })) as StartRefused).code).toBe("NOT_A_CASUAL_ROOM");
  });
});

describe("over HTTP", () => {
  let server: LocalServer; let base = ""; let dataDir = "";
  beforeAll(async () => { dataDir = mkdtempSync(join(tmpdir(), "mz-s71-")); server = new LocalServer({ dataDir }); base = `http://127.0.0.1:${await server.listen(0)}`; });
  afterAll(async () => { await server.close(); });
  const call = async (method: string, path: string, body?: unknown, token?: string, at = base) => {
    const r = await fetch(`${at}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
  };
  async function room(kind: "casual" | "cup", guests: number) {
    const made = (await call("POST", "/rooms", { kind })).body;
    const id = String(made["roomId"]);
    const host = (await call("POST", `/rooms/${id}/join`, { displayName: "Host", asHost: true, hostClaimToken: made["hostClaimToken"] })).body;
    const gs = [];
    for (let i = 0; i < guests; i++) gs.push((await call("POST", `/rooms/${id}/join`, { displayName: `G${i}` })).body);
    return { id, code: String(made["joinCode"]), host: String(host["recoveryToken"]), guests: gs.map((g) => String(g["recoveryToken"])) };
  }
  const lineup = { expectedPlayers: 3, budgetMinutes: 30, items: [{ gameId: "trivia" }, { gameId: "math-mayhem" }] };

  it("who may save: the host; not a guest (403), nor no token, another room's token or a spectator (401)", async () => {
    const r = await room("casual", 2);
    const other = await room("casual", 0);
    const spect = (await call("POST", "/rooms/spectate-by-code", { joinCode: r.code })).body;
    expect((await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, plan: lineup })).status).toBe(401);
    expect((await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, plan: lineup }, other.host)).status).toBe(401);
    expect((await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, plan: lineup }, String(spect["spectatorToken"]))).status).toBe(401);
    const g = await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, plan: lineup }, r.guests[0]);
    expect([g.status, g.body["code"]]).toEqual([403, "NOT_HOST"]);
    const ok = await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, plan: lineup }, r.host);
    expect(ok.status).toBe(200);
    expect(ok.body["party"]).toMatchObject({ revision: 1, lineup: { expectedPlayers: 3, items: [{ gameId: "trivia", started: false }, { gameId: "math-mayhem", started: false }] } });
    // A guest's and the TV's views show the same lineup.
    const guestView = (await call("GET", `/rooms/${r.id}/projection?audience=player`, undefined, r.guests[1])).body;
    const tvView = (await call("GET", `/rooms/${r.id}/projection`)).body;
    expect(guestView["party"]).toEqual(ok.body["party"]);
    expect(tvView["party"]).toEqual(ok.body["party"]);
  });

  it("malformed bodies are 400; a stale revision is 409 with the latest; a Cup room is 409", async () => {
    const r = await room("casual", 2);
    const bad = [
      {}, { baseRevision: 0 }, { baseRevision: -1, plan: lineup }, { baseRevision: 0, plan: { ...lineup, expectedPlayers: 0 } },
      { baseRevision: 0, plan: { ...lineup, budgetMinutes: 45 } }, { baseRevision: 0, plan: { ...lineup, items: [] } },
      { baseRevision: 0, plan: { ...lineup, items: Array.from({ length: 9 }, () => ({ gameId: "trivia" })) } },
      { baseRevision: 0, plan: { ...lineup, extra: 1 } }, { baseRevision: 0, plan: lineup, clear: true }, { baseRevision: 0, clear: false },
      { baseRevision: 0, plan: { ...lineup, items: [{ gameId: "trivia" }, { gameId: "trivia" }] } },
      { baseRevision: 0, plan: { ...lineup, items: [{ gameId: "x".repeat(65) }] } },
    ];
    for (const b of bad) expect((await call("POST", `/rooms/${r.id}/party`, b, r.host)).status, JSON.stringify(b).slice(0, 80)).toBe(400);
    expect((await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, plan: lineup }, r.host)).status).toBe(200);
    const stale = await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, clear: true }, r.host);
    expect([stale.status, stale.body["code"]]).toEqual([409, "PLAN_CONFLICT"]);
    expect((stale.body["party"] as { revision: number }).revision).toBe(1);
    const cup = await room("cup", 1);
    const c = await call("POST", `/rooms/${cup.id}/party`, { baseRevision: 0, plan: lineup }, cup.host);
    expect([c.status, c.body["code"]]).toEqual([409, "NOT_A_CASUAL_ROOM"]);
  });

  it("a lineup start: 400 if malformed or official; 409 with the numbers when fewer are here; then 201, and a replay is 200 with the same game", async () => {
    const r = await room("casual", 1); // 2 here
    expect((await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, plan: lineup }, r.host)).status).toBe(200);
    const start = (extra: Record<string, unknown>) => call("POST", `/rooms/${r.id}/games`, { gameId: "trivia", official: false, party: { revision: 1, index: 0 }, ...extra }, r.host);
    expect((await call("POST", `/rooms/${r.id}/games`, { gameId: "trivia", party: { revision: "1", index: 0 } }, r.host)).status).toBe(400);
    expect((await start({ official: true })).status).toBe(400);
    const fewer = await start({});
    expect([fewer.status, fewer.body["code"], fewer.body["expected"], fewer.body["here"]]).toEqual([409, "PARTY_FEWER_THAN_PLANNED", 3, 2]);
    const first = await start({ fewerThanPlanned: true });
    expect(first.status).toBe(201);
    const replay = await start({ fewerThanPlanned: true });
    expect([replay.status, replay.body["gameId"], replay.body["replay"]]).toEqual([200, first.body["gameId"], true]);
    const view = (await call("GET", `/rooms/${r.id}/projection?audience=player`, undefined, r.host)).body as { games: unknown[]; party: { lineup: { items: { started: boolean }[] } } };
    expect(view.games).toHaveLength(1);
    expect(view.party.lineup.items.map((i) => i.started)).toEqual([true, false]);
  });

  it("survives a server restart (the room file holds the lineup and its revision)", async () => {
    const r = await room("casual", 2);
    expect((await call("POST", `/rooms/${r.id}/party`, { baseRevision: 0, plan: lineup }, r.host)).status).toBe(200);
    expect((await call("POST", `/rooms/${r.id}/party`, { baseRevision: 1, plan: { ...lineup, items: [{ gameId: "closest-wins" }] } }, r.host)).status).toBe(200);
    const again = new LocalServer({ dataDir });
    const at = `http://127.0.0.1:${await again.listen(0)}`;
    try {
      const view = (await call("GET", `/rooms/${r.id}/projection?audience=player`, undefined, r.host, at)).body;
      expect(view["party"]).toMatchObject({ revision: 2, lineup: { expectedPlayers: 3, budgetMinutes: 30, items: [{ gameId: "closest-wins", started: false }] } });
      expect((await call("POST", `/rooms/${r.id}/party`, { baseRevision: 1, clear: true }, r.host, at)).status).toBe(409);
    } finally {
      await again.close();
    }
  });
});
