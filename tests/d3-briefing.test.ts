/**
 * D3 (owner-approved 2026-11-08): a server-authoritative rules-and-ready
 * BRIEFING before play, for Cups created with timing version 2.
 * Contract: docs/ux-redesign/D3_TIMING_CONTRACT.md. One test per guarantee.
 *
 * Engine level, with a fake clock. Every game id is covered for secrecy.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent, type ContentLibrary } from "../src/content/registry.js";
import { GAME_REGISTRY, getGame } from "../src/games/registry.js";
import { policyFor } from "../src/server/lifecycle.js";
import { BriefingRefused, RoomEngine, type GameInstance } from "../src/server/room.js";

type Json = Record<string, unknown>;
const lib = loadContent(DEFAULT_CONTENT_DIR, { testApproveProvisional: true });
const T0 = 1_800_000_000_000;

function setup(n: number, opts: { timing?: 1 | 2; names?: string[]; casual?: boolean } = {}) {
  // Stage 9.1: a casual-only game (Jebena Rush) is briefed in a casual room, with the same briefing.
  const engine = new RoomEngine("D3 Cup", opts.timing === 1 ? {} : { timing: 2, ...(opts.casual ? { kind: "casual" as const } : {}) });
  let t = T0;
  engine.clock = () => t;
  engine.content = lib;
  const ids = [engine.join("Keku", { asHost: true }).player.id];
  for (let i = 1; i < n; i++) ids.push(engine.join(opts.names?.[i] ?? `P${i}`).player.id);
  return {
    engine, host: ids[0]!, ids,
    advance(ms: number) { t += ms; },
    now: () => t,
  };
}
function ready(engine: RoomEngine, pid: string, gid: string, value = true, clientEventId = randomUUID()) {
  return engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId, roomId: engine.id, gameInstanceId: gid, action: "briefing-ready", payload: { ready: value } }, pid);
}
const usageOf = (e: RoomEngine) => JSON.stringify((e.toJSON() as Json)["contentUsage"]);
const seqOf = (e: RoomEngine) => (e.toJSON() as Json)["contentSeq"];
const events = (e: RoomEngine, type: string) => e.ledger.filter((x) => x.type === type);
function refusal(fn: () => unknown): BriefingRefused {
  try { fn(); } catch (err) { if (err instanceof BriefingRefused) return err; throw err; }
  throw new Error("expected a BriefingRefused");
}

describe("D3 T5: timing versions are frozen per Cup", () => {
  it("an engine built without a timing version is version 1 and starts games at once, exactly as before", () => {
    const { engine, host } = setup(2, { timing: 1 });
    expect(engine.cup.timing).toBeUndefined();
    const g = engine.startGame(host, "trivia", { official: true });
    expect(g.status).toBe("playing");
    expect(g.deadlineAt).toBe(T0 + policyFor("trivia").gameWindowMs);
    expect(g.briefing).toBeUndefined();
  });

  it("a version 2 Cup stores its frozen timing record, and it survives a snapshot", () => {
    const { engine } = setup(2);
    expect(engine.cup.timing).toEqual({ version: 2, readMinMs: 20_000, stallMs: 300_000, warnMs: 60_000 });
    expect(Object.isFrozen(engine.cup.timing)).toBe(true);
    const back = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json);
    expect(back.cup.timing).toEqual({ version: 2, readMinMs: 20_000, stallMs: 300_000, warnMs: 60_000 });
  });

  it("a running version 1 game restored after the change keeps its deadlines exactly, and its Cup stays version 1", () => {
    const { engine, host } = setup(2, { timing: 1 });
    const g = engine.startGame(host, "closest-wins", { official: true });
    const snap = JSON.parse(JSON.stringify(engine.toJSON())) as Json;
    const back = RoomEngine.fromJSON(snap);
    const again = back.games.get(g.id)!;
    expect(again.status).toBe("playing");
    expect(again.deadlineAt).toBe(g.deadlineAt);
    expect(again.phaseDeadlineAt).toBe(g.phaseDeadlineAt);
    expect(back.cup.timing).toBeUndefined();
  });
});

describe("D3: Start creates a BRIEFING with no game clock", () => {
  it("content is frozen but not recorded as used; no deadline exists; the briefing times are server time", () => {
    const { engine, host } = setup(2);
    const usage = usageOf(engine);
    const seq = seqOf(engine);
    const g = engine.startGame(host, "trivia", { official: true });
    expect(g.status).toBe("briefing");
    expect(g.deadlineAt).toBeUndefined();
    expect(g.phaseDeadlineAt).toBeUndefined();
    expect(g.startedAt).toBe(T0);
    expect(g.briefing).toEqual({ createdAt: T0, startNowAt: T0 + 20_000, warnAt: T0 + 240_000, expiresAt: T0 + 300_000, ready: {}, warned: false });
    expect(usageOf(engine)).toBe(usage);
    expect(seqOf(engine)).toBe(seq);
    expect(events(engine, "content-selected")).toHaveLength(0);
    expect(events(engine, "game-started")).toHaveLength(0);
    expect(events(engine, "game-briefing-started")).toHaveLength(1);
  });

  it("every Start check still runs first: one player can't create an official briefing (D1)", () => {
    const { engine, host } = setup(1);
    // Word Connections allows one player by itself, so only D1 can refuse this.
    expect(() => engine.startGame(host, "word-connections", { official: true })).toThrow(/Official games need at least 2 players/);
    expect(engine.games.size).toBe(0);
  });
});

describe("D3 S5: nothing secret is disclosed during the briefing (every game × every audience)", () => {
  // Every string a value holds: values AND object keys (a map keyed by a secret leaks it too).
  const strings = (v: unknown, out: Set<string>): Set<string> => {
    if (typeof v === "string") out.add(v);
    else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); strings(x, out); }
    return out;
  };
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const desc of GAME_REGISTRY) {
    it(`${desc.id}: no state, questions, roles, answers or content strings reach any projection`, () => {
      const n = Math.max(desc.minPlayers, 4);
      const { engine, host, ids } = setup(n, { names: ["Keku", "Amina", "Baraka", "Chausiku", "Dalila", "Eshe"], casual: desc.casualOnly === true });
      const official = policyFor(desc.id).officialEligible;
      const spectatorView = () => engine.project("tv");
      const baseline = new Set<string>();
      for (const pid of ids) strings(engine.project("player", pid), baseline);
      strings(engine.project("host", host), baseline);
      strings(spectatorView(), baseline);
      const g = engine.startGame(host, desc.id, { official });
      expect(g.status).toBe("briefing");
      // Every string the server holds for this game that wasn't already public.
      const secrets = [...strings({ extra: g.extra, questions: g.questions }, new Set())]
        .filter((s) => s.length >= 4 && !baseline.has(s) && !ids.includes(s) && s !== desc.id && s !== desc.title && !/^[a-z]+(-[a-z]+)*$/.test(s));
      const views: [string, Json][] = [
        ...ids.map((pid) => [`player ${pid}`, engine.project("player", pid)] as [string, Json]),
        ["host", engine.project("host", host)],
        ["tv/spectator", spectatorView()],
      ];
      for (const [who, proj] of views) {
        const entries = [...((proj["games"] as Json[]) ?? []), ...((proj["myGames"] as Json[]) ?? [])].filter((x) => x["id"] === g.id);
        expect(entries.length, who).toBeGreaterThan(0);
        for (const e of entries) {
          expect(e["status"], who).toBe("briefing");
          expect(e["state"], `${who} state`).toBeUndefined();
          expect(e["questions"], `${who} questions`).toBeUndefined();
          expect(e["rawScores"], `${who} rawScores`).toBeUndefined();
          expect(e["deadlineAt"], `${who} deadlineAt`).toBeUndefined();
          expect(e["phaseDeadlineAt"], `${who} phaseDeadlineAt`).toBeUndefined();
          if ("myAnswers" in e) expect(e["myAnswers"], `${who} myAnswers`).toEqual({});
        }
        // Anything in this view that wasn't public before Start must not equal a
        // secret or contain one as a whole word. (A raw substring search of the
        // JSON flagged the Connections tile "Code" inside the key "joinCode".)
        const fresh = [...strings(proj, new Set())].filter((x) => !baseline.has(x));
        for (const secret of secrets) {
          const word = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(secret)}($|[^\\p{L}\\p{N}])`, "u");
          const hit = fresh.find((x) => x === secret || word.test(x));
          expect(hit, `${who} leaks ${JSON.stringify(secret)} in ${JSON.stringify(hit)}`).toBeUndefined();
        }
      }
      // After play begins, the participant projection carries the game again (today's rules).
      for (const pid of ids) ready(engine, pid, g.id);
      expect(engine.games.get(g.id)!.status).toBe("playing");
      const after = (engine.project("player", host)["myGames"] as Json[]).find((x) => x["id"] === g.id)!;
      expect(after["status"]).toBe("playing");
    });
  }
});

describe("D3 clocks: every deadline derives from the single instant T_play", () => {
  it("everyone ready at 3 s starts at 3 s; startedAt stays T_create; deadlines come from T_play", () => {
    const { engine, ids, advance } = setup(3);
    const g = engine.startGame(ids[0]!, "closest-wins", { official: true });
    advance(1_000); ready(engine, ids[1]!, g.id);
    advance(1_000); ready(engine, ids[2]!, g.id);
    advance(1_000);
    const r = ready(engine, ids[0]!, g.id);
    expect(r).toMatchObject({ accepted: true, result: { ready: true, started: true } });
    const live = engine.games.get(g.id)!;
    expect(live.status).toBe("playing");
    expect(live.startedAt).toBe(T0);
    expect(live.playStartedAt).toBe(T0 + 3_000);
    const p = policyFor("closest-wins");
    expect(live.deadlineAt).toBe(T0 + 3_000 + p.gameWindowMs);
    expect(live.phaseDeadlineAt).toBe(T0 + 3_000 + p.phaseMs!["question"]!);
  });

  it("content is recorded as used once, at T_play, with the items that were frozen at Start", () => {
    const { engine, ids } = setup(2);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    const frozen = (g.pendingContent?.items ?? []).map((i) => i.itemId);
    expect(frozen.length).toBeGreaterThan(0);
    for (const pid of ids) ready(engine, pid, g.id);
    const sel = events(engine, "content-selected");
    expect(sel).toHaveLength(1);
    expect((sel[0]!.detail as { items: string[] }).items).toEqual(frozen);
    const usage = (engine.toJSON() as Json)["contentUsage"] as Record<string, unknown[]>;
    for (const id of frozen) expect(usage[id]).toHaveLength(1);
  });
});

describe("D3 (a): play starts at once when every roster player is ready", () => {
  it("waits while a roster player is reconnecting; a ready player who goes away doesn't block", () => {
    const { engine, ids, advance } = setup(3);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    ready(engine, ids[2]!, g.id);
    engine.disconnect(ids[2]!); // ready, then the phone drops
    ready(engine, ids[1]!, g.id);
    ready(engine, ids[0]!, g.id);
    engine.tick();
    expect(engine.games.get(g.id)!.status).toBe("briefing"); // Baraka is reconnecting
    advance(45_001); // grace over: away, but still ready
    engine.tick();
    expect(engine.games.get(g.id)!.status).toBe("playing");
    expect(engine.games.get(g.id)!.players).toContain(ids[2]!); // keeps the seat
  });

  it("an away player who never tapped Ready blocks the automatic start", () => {
    const { engine, ids, advance } = setup(3);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    engine.disconnect(ids[2]!);
    advance(45_001);
    ready(engine, ids[0]!, g.id);
    ready(engine, ids[1]!, g.id);
    engine.tick();
    expect(engine.games.get(g.id)!.status).toBe("briefing");
  });

  it("no timer ever starts a game: an unready room just waits until the stall guard", () => {
    const { engine, ids, advance } = setup(2);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    for (const step of [20_000, 60_000, 150_000]) { advance(step); engine.tick(); expect(engine.games.get(g.id)!.status).toBe("briefing"); }
  });
});

describe("D3 S1: player minimums are checked again when play would begin", () => {
  it("4 players, 3 drop away: an official game never starts with one connected player and is never switched to practice", () => {
    const { engine, ids, advance } = setup(4);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    for (const pid of ids.slice(1)) { ready(engine, pid, g.id); engine.disconnect(pid); }
    advance(45_001);
    ready(engine, ids[0]!, g.id); // everyone ready, nobody reconnecting, but only 1 connected
    engine.tick();
    expect(engine.games.get(g.id)!.status).toBe("briefing");
    advance(20_000);
    const err = refusal(() => engine.startNow(ids[0]!, g.id, { confirmed: ids.slice(1) }));
    expect(err.code).toBe("OFFICIAL_NEEDS_TWO");
    expect(engine.games.get(g.id)!.status).toBe("briefing");
    expect(engine.games.get(g.id)!.official).toBe(true);
  });

  it("a practice game rechecks its own minimum (Impostor needs 4 connected)", () => {
    const { engine, ids, advance } = setup(4);
    const g = engine.startGame(ids[0]!, "impostor", { official: false });
    engine.disconnect(ids[3]!);
    advance(45_001);
    const err = refusal(() => engine.startNow(ids[0]!, g.id, { confirmed: ids.slice(1) }));
    expect(err.code).toBe("NOT_ENOUGH_CONNECTED");
    expect(engine.games.get(g.id)!.status).toBe("briefing");
  });
});

describe("D3 T1 + S4: Start now needs 20 s and explicit, server-checked consent", () => {
  it("refused before 20 s with READ_WINDOW", () => {
    const { engine, ids, advance } = setup(2);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    advance(19_999);
    const err = refusal(() => engine.startNow(ids[0]!, g.id, { confirmed: [ids[1]!] }));
    expect(err.code).toBe("READ_WINDOW");
    expect(err.startNowAt).toBe(T0 + 20_000);
  });

  it("names everyone who isn't ready, or is ready but not connected; never the host's own seat (P2 modified)", () => {
    const { engine, ids, advance } = setup(4);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    ready(engine, ids[1]!, g.id);
    engine.disconnect(ids[1]!); // ready · reconnecting
    advance(20_000);
    const err = refusal(() => engine.startNow(ids[0]!, g.id, {}));
    expect(err.code).toBe("READINESS_CHANGED");
    expect([...err.needsConfirmation].sort()).toEqual([ids[1]!, ids[2]!, ids[3]!].sort());
    expect(engine.games.get(g.id)!.status).toBe("briefing");
  });

  it("a player who withdraws while the dialog is open makes the confirmation stale; a superset is accepted", () => {
    const { engine, ids, advance } = setup(4);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    ready(engine, ids[1]!, g.id);
    ready(engine, ids[2]!, g.id);
    advance(20_000);
    // Host's dialog showed only P3 as not ready. Then P1 withdraws.
    ready(engine, ids[1]!, g.id, false);
    const err = refusal(() => engine.startNow(ids[0]!, g.id, { confirmed: [ids[3]!] }));
    expect(err.code).toBe("READINESS_CHANGED");
    expect([...err.needsConfirmation].sort()).toEqual([ids[1]!, ids[3]!].sort());
    // A confirmation naming more people than needed is fine.
    const r = engine.startNow(ids[0]!, g.id, { confirmed: [ids[1]!, ids[2]!, ids[3]!] });
    expect(r).toMatchObject({ started: true, trigger: "start-now" });
    expect(engine.games.get(g.id)!.players).toEqual(ids); // nobody removed
  });

  it("the host isn't marked ready by Start now, and the record says so (P2 modified)", () => {
    const { engine, ids, advance } = setup(3);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    ready(engine, ids[1]!, g.id);
    ready(engine, ids[2]!, g.id);
    advance(20_000);
    engine.startNow(ids[0]!, g.id, { confirmed: [] }); // only the host isn't ready: no one else to confirm
    const live = engine.games.get(g.id)!;
    expect(live.status).toBe("playing");
    expect(live.briefing!.ready[ids[0]!]).toBeUndefined();
    const ev = events(engine, "game-started")[0]!;
    expect(ev.actor).toBe(ids[0]!);
    expect(ev.detail).toMatchObject({
      trigger: "start-now",
      readyAtStart: { [ids[0]!]: false, [ids[1]!]: true, [ids[2]!]: true },
      presenceAtStart: { [ids[0]!]: "connected", [ids[1]!]: "connected", [ids[2]!]: "connected" },
      confirmed: [],
    });
  });

  it("a cohost may Start now; a plain player may not", () => {
    const { engine, ids, advance } = setup(3);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    advance(20_000);
    expect(() => engine.startNow(ids[1]!, g.id, { confirmed: ids })).toThrow(/host/i);
    engine.grantCohost(ids[0]!, ids[1]!);
    expect(engine.startNow(ids[1]!, g.id, { confirmed: [ids[0]!, ids[2]!] })).toMatchObject({ started: true });
  });
});

describe("D3 T3 + T4: readiness is public, withdrawable until play, then locked", () => {
  it("withdraw works during the briefing; repeats are idempotent; every audience sees the same ready list", () => {
    const { engine, ids } = setup(3);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    const ceid = randomUUID();
    expect(ready(engine, ids[1]!, g.id, true, ceid)).toMatchObject({ accepted: true, result: { ready: true, started: false } });
    expect(ready(engine, ids[1]!, g.id, true, ceid)).toMatchObject({ accepted: true, result: { ready: true, started: false } }); // replay
    const changes = events(engine, "ready-changed").length;
    ready(engine, ids[1]!, g.id, true); // same value, new event id: no change
    expect(events(engine, "ready-changed")).toHaveLength(changes);
    const readyList = (proj: Json) => (((proj["games"] as Json[]).find((x) => x["id"] === g.id)!["briefing"] as Json)["ready"]);
    for (const proj of [engine.project("player", ids[0]!), engine.project("player", ids[2]!), engine.project("tv"), engine.project("host", ids[0]!)]) {
      expect(readyList(proj)).toEqual([ids[1]!]);
    }
    expect(ready(engine, ids[1]!, g.id, false)).toMatchObject({ accepted: true, result: { ready: false } });
    expect(engine.games.get(g.id)!.briefing!.ready[ids[1]!]).toBeUndefined();
  });

  it("after play starts, Ready is locked: READY_LOCKED changes nothing", () => {
    const { engine, ids } = setup(2);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    for (const pid of ids) ready(engine, pid, g.id);
    const before = JSON.stringify(engine.games.get(g.id));
    expect(ready(engine, ids[1]!, g.id, false)).toMatchObject({ accepted: false, reason: "READY_LOCKED" });
    expect(JSON.stringify(engine.games.get(g.id))).toBe(before);
  });

  it("someone who joined the room during the briefing is not in the roster and can't ready", () => {
    const { engine, ids } = setup(2);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    const late = engine.join("Late").player.id;
    expect(ready(engine, late, g.id)).toMatchObject({ accepted: false, reason: "NOT_A_PARTICIPANT" });
    expect(engine.games.get(g.id)!.players).not.toContain(late);
  });
});

describe("D3 T2: the stall guard warns, then cancels; cancellation leaves nothing behind", () => {
  it("the warning is a server state change at 4:00; at 5:00 the briefing is cancelled with no trace in play history", () => {
    const { engine, ids, advance } = setup(2);
    const usage = usageOf(engine);
    const seq = seqOf(engine);
    const day = engine.championshipDay;
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    advance(239_999);
    expect(engine.tick()).toBe(false);
    advance(1);
    expect(engine.tick()).toBe(true); // pushed to every screen
    expect(engine.games.get(g.id)!.briefing!.warned).toBe(true);
    advance(60_000);
    expect(engine.tick()).toBe(true);
    expect(engine.games.has(g.id)).toBe(false);
    expect(usageOf(engine)).toBe(usage);
    expect(seqOf(engine)).toBe(seq);
    expect(engine.championshipDay).toBe(day);
    expect(engine.officialStandings()).toEqual({});
    const cancel = events(engine, "briefing-cancelled");
    expect(cancel).toHaveLength(1);
    expect(cancel[0]!.detail).toMatchObject({ reason: "expired" });
    expect(JSON.stringify(cancel[0]!.detail)).not.toMatch(/"items"/); // a count, never the item ids
    expect(events(engine, "game-started")).toHaveLength(0);
  });

  it("the host or a cohost can cancel at any time; a player can't", () => {
    const { engine, ids } = setup(2);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    expect(() => engine.cancelBriefing(ids[1]!, g.id)).toThrow(/host/i);
    engine.cancelBriefing(ids[0]!, g.id);
    expect(engine.games.has(g.id)).toBe(false);
    expect(events(engine, "briefing-cancelled")[0]!.detail).toMatchObject({ reason: "host" });
  });

  it("a cancelled briefing's content is still available: the next Start freezes the same items", () => {
    const { engine, ids } = setup(2);
    const a = engine.startGame(ids[0]!, "word-connections", { official: true });
    const first = a.pendingContent!.items.map((i) => i.itemId);
    engine.cancelBriefing(ids[0]!, a.id);
    const b = engine.startGame(ids[0]!, "word-connections", { official: true });
    expect(b.pendingContent!.items.map((i) => i.itemId)).toEqual(first);
  });
});

describe("D3 S2: a briefing is an active game", () => {
  it("Start and Advance day are refused while a briefing is open; two Starts give one briefing", () => {
    const { engine, ids } = setup(2);
    engine.startGame(ids[0]!, "trivia", { official: true });
    expect(() => engine.startGame(ids[0]!, "trivia", { official: true })).toThrow(/already in progress/);
    expect(() => engine.advanceDay(ids[0]!)).toThrow(/in progress/);
    expect([...engine.games.values()].filter((x) => x.status === "briefing")).toHaveLength(1);
  });
});

describe("D3 S3 + S6: restarts keep the briefing, its content and its timing", () => {
  function restore(engine: RoomEngine, content: ContentLibrary = lib, at?: number) {
    const back = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Json);
    const t = at ?? engine.clock();
    back.clock = () => t;
    back.content = content;
    return back;
  }

  it("a snapshot keeps the frozen content and the ready map; play then uses that content", () => {
    const { engine, ids } = setup(2);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    ready(engine, ids[1]!, g.id);
    const back = restore(engine);
    const again = back.games.get(g.id)!;
    expect(again.status).toBe("briefing");
    expect(again.briefing!.ready).toEqual(g.briefing!.ready);
    expect(again.pendingContent).toEqual(g.pendingContent);
    ready(back, ids[0]!, g.id);
    expect(back.games.get(g.id)!.status).toBe("playing");
    expect((back.ledger.filter((e) => e.type === "content-selected")[0]!.detail as { items: string[] }).items).toEqual(g.pendingContent!.items.map((i) => i.itemId));
  });

  it("if a restart loaded a library without a frozen item, play doesn't begin: the briefing is cancelled as content-changed", () => {
    const { engine, ids } = setup(2);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    const gone = g.pendingContent!.items[0]!.itemId;
    const items = new Map(lib.items);
    items.delete(gone);
    const byGame = new Map([...lib.byGame].map(([k, v]) => [k, v.filter((li) => li.item.id !== gone)] as const));
    const back = restore(engine, { ...lib, items, byGame } as ContentLibrary);
    const usage = usageOf(back);
    ready(back, ids[1]!, g.id);
    ready(back, ids[0]!, g.id);
    expect(back.games.has(g.id)).toBe(false);
    expect(usageOf(back)).toBe(usage);
    expect(back.ledger.filter((e) => e.type === "briefing-cancelled")[0]!.detail).toMatchObject({ reason: "content-changed" });
  });

  it("a restart never cancels without 60 s of visible warning (expiry near or already past)", () => {
    for (const downtime of [250_000, 299_000, 900_000]) {
      const { engine, ids } = setup(2);
      const g = engine.startGame(ids[0]!, "trivia", { official: true });
      const restartAt = T0 + downtime;
      const back = restore(engine, lib, restartAt);
      back.afterRestore(restartAt);
      const b = back.games.get(g.id)!.briefing!;
      expect(b.expiresAt, `downtime ${downtime}`).toBe(restartAt + 60_000);
      expect(b.warnAt).toBe(restartAt);
      expect(back.ledger.filter((e) => e.type === "briefing-extended")).toHaveLength(1);
      expect(back.tick(restartAt)).toBe(true); // the warning is pushed straight away
      expect(back.games.get(g.id)!.briefing!.warned).toBe(true);
      expect(back.games.has(g.id)).toBe(true);
    }
  });

  it("a restart early in the briefing changes nothing about its timing", () => {
    const { engine, ids } = setup(2);
    const g = engine.startGame(ids[0]!, "trivia", { official: true });
    const back = restore(engine, lib, T0 + 30_000);
    back.afterRestore(T0 + 30_000);
    expect(back.games.get(g.id)!.briefing).toEqual(g.briefing);
    expect(back.ledger.filter((e) => e.type === "briefing-extended")).toHaveLength(0);
  });
});

describe("D3: after T_play, every game plays exactly as it does under version 1", () => {
  // Timing versions 1 and 2 are a Cup's; a casual-only game (Stage 9.1) never plays in a Cup.
  for (const desc of GAME_REGISTRY.filter((d) => !d.casualOnly)) {
    it(`${desc.id}: same seed, same initial play state, deadlines shifted to T_play`, () => {
      const n = Math.max(getGame(desc.id).minPlayers, 4);
      const official = policyFor(desc.id).officialEligible;
      const v1 = setup(n, { timing: 1 });
      // The same Cup (same id, so the same content selection), but under timing version 2.
      const snap = JSON.parse(JSON.stringify(v1.engine.toJSON())) as Json;
      snap["cup"] = { ...(snap["cup"] as Json), timing: { version: 2, readMinMs: 20_000, stallMs: 300_000, warnMs: 60_000 } };
      const v2 = RoomEngine.fromJSON(snap);
      let t2 = T0;
      v2.clock = () => t2;
      v2.content = lib;
      const a = v1.engine.startGame(v1.host, desc.id, { official, seed: 7 });
      const b = v2.startGame(v1.host, desc.id, { official, seed: 7 });
      expect(b.status).toBe("briefing");
      t2 += 5_000;
      for (const pid of v1.ids) ready(v2, pid, b.id);
      const live = v2.games.get(b.id) as GameInstance;
      expect(live.status).toBe("playing");
      expect(live.playStartedAt).toBe(T0 + 5_000);
      expect(JSON.stringify(live.extra)).toBe(JSON.stringify(a.extra));
      expect(JSON.stringify(live.questions)).toBe(JSON.stringify(a.questions));
      expect(live.deadlineAt! - live.playStartedAt!).toBe(a.deadlineAt! - a.startedAt!);
      if (a.phaseDeadlineAt !== undefined) expect(live.phaseDeadlineAt! - live.playStartedAt!).toBe(a.phaseDeadlineAt - a.startedAt!);
      else expect(live.phaseDeadlineAt).toBeUndefined();
      const pa = (v1.engine.project("player", v1.ids[1]!)["myGames"] as Json[])[0]!;
      const pb = (v2.project("player", v1.ids[1]!)["myGames"] as Json[])[0]!;
      expect(JSON.stringify(pb["state"])).toBe(JSON.stringify(pa["state"]));
    });
  }
});
