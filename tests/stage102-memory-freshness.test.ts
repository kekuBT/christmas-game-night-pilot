// Stage 10.2 repair (review 6831760093, S102-R1; D-S102-06): the Memory Book judges whether its ledger is
// current by the loaded response's freshness watermark, not by the newest event this viewer may see. When the
// room's newest events are private to someone else (another player's abstention or recovery code), the old rule
// waited forever ("Checking for the latest finished game…"). Stale and in-flight data still can't cite an earlier
// game; an older response can't roll the screen back; private events stay hidden; Spectrum says it can't be saved.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryLink, newerLedger } from "../apps/web/src/ui/mchezo/lib/memoryLink.js";
import type { LedgerEvent, LedgerView, PublicGame, RegistryGame } from "../apps/web/src/types.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

const ev = (seq: number, type: string, extra: Partial<LedgerEvent> = {}): LedgerEvent => ({ eventId: `evt-${seq}`, seq, type, createdAt: seq, ...extra });
const reg = (id: string, cooperative = false): RegistryGame => ({ id, title: id, minPlayers: 2, maxPlayers: 10, defaultDurationMinutes: 5, tutorial: "", ...(cooperative ? { cooperative } : {}) });
const REGISTRY = [reg("trivia"), reg("jebena-rush"), reg("spectrum", true)];
const game = (id: string, gameId: string): PublicGame => ({ id, gameId, status: "finished" } as unknown as PublicGame);
/** The reviewer's room: a game finished at 34, then another player's abstention (35), hidden from this viewer. */
const REDACTED = [ev(31, "ready-changed"), ev(32, "game-started", { gameInstanceId: "g2" }), ev(33, "team-score-recorded", { gameInstanceId: "g2" }), ev(34, "game-finished", { gameInstanceId: "g2" })];
/** The rule the screen used before: the newest visible event against the room's seq. */
const oldSyncing = (ledger: LedgerEvent[], roomSeq: number) => ledger.reduce((m, e) => Math.max(m, e.seq), 0) < roomSeq;

describe("memoryLink: judged by the loaded ledger's watermark (S102-R1)", () => {
  it("the reviewer's case: current (watermark 35) with the newest event hidden is not 'syncing'; the old rule waited forever", () => {
    expect(oldSyncing(REDACTED, 35)).toBe(true);
    const link = memoryLink({ ledger: REDACTED, ledgerAt: 35, roomSeq: 35, games: [game("g2", "trivia")], registry: REGISTRY });
    expect(link.state).toBe("ready");
    expect(link.target?.eventId).toBe("evt-34");
    expect(link.targetGame?.gameId).toBe("trivia");
  });

  it("a team game (Spectrum) as the last finished game: 'unavailable', said plainly, never 'syncing'", () => {
    const link = memoryLink({ ledger: REDACTED, ledgerAt: 35, roomSeq: 35, games: [game("g2", "spectrum")], registry: REGISTRY });
    expect(link.state).toBe("unavailable");
    expect(link.targetGame?.gameId).toBe("spectrum");
  });

  it("a genuinely stale ledger (a game finished after it was read) is 'syncing': it never cites the game before", () => {
    const link = memoryLink({ ledger: REDACTED, ledgerAt: 35, roomSeq: 38, games: [game("g2", "trivia")], registry: REGISTRY });
    expect(link.state).toBe("syncing");
    // The newer room has a newer finished game the screen hasn't loaded: nothing may be added until it has.
  });

  it("before the first load it is 'loading'; with no finished game, 'none'", () => {
    expect(memoryLink({ ledger: [], ledgerAt: undefined, roomSeq: 3, games: [], registry: REGISTRY }).state).toBe("loading");
    expect(memoryLink({ ledger: [ev(1, "player-joined"), ev(2, "player-joined")], ledgerAt: 3, roomSeq: 3, games: [], registry: REGISTRY }).state).toBe("none");
  });

  it("a watermark ahead of the projection (the projection lags) is current", () => {
    expect(memoryLink({ ledger: REDACTED, ledgerAt: 36, roomSeq: 35, games: [game("g2", "trivia")], registry: REGISTRY }).state).toBe("ready");
  });
});

describe("newerLedger: an older response never replaces a newer one", () => {
  const view = (seq: number, events: LedgerEvent[] = []): LedgerView => ({ seq, events });
  it("accepts the first, a newer or an equal watermark; refuses an older one and malformed data", () => {
    expect(newerLedger(undefined, view(5))).toBe(true);
    expect(newerLedger(5, view(6))).toBe(true);
    expect(newerLedger(5, view(5))).toBe(true);
    expect(newerLedger(5, view(4))).toBe(false);
    expect(newerLedger(5, { seq: Number.NaN, events: [] })).toBe(false);
    expect(newerLedger(5, { seq: 6, events: undefined as unknown as LedgerEvent[] })).toBe(false);
  });

  it("overlapping loads arriving out of order: the screen keeps the newer context", () => {
    // Two loads start (projection seq 34, then 35); the 35 answer lands first, the 34 answer last.
    let at: number | undefined;
    let shown: LedgerEvent[] = [];
    const apply = (v: LedgerView) => { if (newerLedger(at, v)) { at = v.seq; shown = v.events; } };
    apply(view(35, REDACTED));
    apply(view(34, REDACTED.slice(0, 2)));
    expect(at).toBe(35);
    expect(shown.at(-1)?.eventId).toBe("evt-34");
    expect(memoryLink({ ledger: shown, ledgerAt: at, roomSeq: 35, games: [game("g2", "trivia")], registry: REGISTRY }).state).toBe("ready");
  });
});

describe("over HTTP: GET /rooms/:id/ledger?watermark=1", () => {
  let h: Harness;
  beforeEach(async () => { h = await new Harness().start(); await h.createRoom(); });
  afterEach(async () => { await h.dispose(); });
  const view = async (p: Player) => (await h.get(`/rooms/${h.roomId}/ledger?watermark=1`, { "x-session-token": p.token })).body as unknown as LedgerView;
  const registry = async () => (await h.get("/games")).body as unknown as RegistryGame[];
  async function finishTrivia(players: Player[]): Promise<string> {
    const gid = (await h.startGame(players[0]!, "trivia", { seed: 3 })).body["gameId"] as string;
    const qs = (h.game(gid)!.extra as { questions: { id: string }[] }).questions;
    for (const p of players) for (const q of qs) await h.intent(p, gid, "trivia-answer", { questionId: q.id, chosenIndex: 0 });
    expect(h.game(gid)!.status).toBe("finished");
    return gid;
  }

  it("after another player saves a recovery code (private to them), the host's ledger is current and cites the finished game", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gid = await finishTrivia([ada, bea]);
    expect((await h.post(`/rooms/${h.roomId}/recovery-code`, {}, bea.token)).status).toBe(201);
    const v = await view(ada);
    const proj = await h.projection(ada);
    expect(v.seq).toBe(proj["seq"]); // the watermark is the room's public seq
    expect(v.events.some((e) => e.type === "recovery-code-issued")).toBe(false); // still private to Bea
    expect(Math.max(...v.events.map((e) => e.seq))).toBeLessThan(v.seq); // the newest event is hidden from Ada
    expect(oldSyncing(v.events, proj["seq"] as number)).toBe(true); // what used to wait forever
    const link = memoryLink({ ledger: v.events, ledgerAt: v.seq, roomSeq: proj["seq"] as number, games: (proj["games"] as unknown as PublicGame[]) ?? [], registry: await registry() });
    expect(link.state).toBe("ready");
    expect(link.target?.gameInstanceId).toBe(gid);
    const added = await h.post(`/rooms/${h.roomId}/memory`, { day: 1, text: "Ada and Bea tied on Trivia", sourceEventIds: [link.target!.eventId] }, ada.token);
    expect(added.status).toBe(201);
    // Bea's own view shows her recovery code; its watermark is the same room seq.
    const vb = await view(bea);
    expect(vb.events.some((e) => e.type === "recovery-code-issued" && e.playerId === bea.playerId)).toBe(true);
    expect(vb.seq).toBe(v.seq);
  });

  it("after another player sits out a game (private to them), the host's ledger is current and still cites the last finished game", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const cy = await h.join("Cy");
    const gid = await finishTrivia([ada, bea, cy]);
    const g2 = (await h.startGame(ada, "math-mayhem", { seed: 2 })).body["gameId"] as string;
    await h.intent(bea, g2, "abstain", {});
    expect(h.engine().ledger.some((e) => e.type === "player-abstained" && e.playerId === bea.playerId)).toBe(true);
    const v = await view(ada);
    const proj = await h.projection(ada);
    expect(v.seq).toBe(proj["seq"]);
    expect(v.events.some((e) => e.type === "player-abstained")).toBe(false);
    expect(Math.max(...v.events.map((e) => e.seq))).toBeLessThan(v.seq); // Bea's sit-out is the newest event
    expect(oldSyncing(v.events, proj["seq"] as number)).toBe(true);
    const link = memoryLink({ ledger: v.events, ledgerAt: v.seq, roomSeq: proj["seq"] as number, games: (proj["games"] as unknown as PublicGame[]) ?? [], registry: await registry() });
    expect(link.state).toBe("ready");
    expect(link.target?.gameInstanceId).toBe(gid);
  });

  it("a supported game ended by the last player sitting out (the sit-out logged after the finish): current, and it cites that game", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gid = (await h.startGame(ada, "trivia", { seed: 4 })).body["gameId"] as string;
    const qs = (h.game(gid)!.extra as { questions: { id: string }[] }).questions;
    for (const q of qs) await h.intent(ada, gid, "trivia-answer", { questionId: q.id, chosenIndex: 0 });
    await h.intent(bea, gid, "abstain", {});
    expect(h.game(gid)!.status).toBe("finished");
    const tail = h.engine().ledger.slice(-2).map((e) => e.type);
    expect(tail).toEqual(["game-finished", "player-abstained"]); // the reviewer's order, on a game that can be saved
    const v = await view(ada);
    const proj = await h.projection(ada);
    expect(v.seq).toBe(proj["seq"]);
    expect(v.events.some((e) => e.type === "player-abstained")).toBe(false);
    expect(oldSyncing(v.events, proj["seq"] as number)).toBe(true);
    const link = memoryLink({ ledger: v.events, ledgerAt: v.seq, roomSeq: proj["seq"] as number, games: (proj["games"] as unknown as PublicGame[]) ?? [], registry: await registry() });
    expect(link.state).toBe("ready");
    expect(link.target?.gameInstanceId).toBe(gid);
    expect((await h.post(`/rooms/${h.roomId}/memory`, { day: 1, text: "Ada finished it alone", sourceEventIds: [link.target!.eventId] }, ada.token)).status).toBe(201);
  });

  it("without the opt-in, the ledger is still the plain array every existing consumer reads", async () => {
    const ada = await h.join("Ada", { host: true });
    const r = await h.get(`/rooms/${h.roomId}/ledger`, { "x-session-token": ada.token });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    const v = await view(ada);
    expect(v.events).toEqual(r.body as unknown as Json[]);
  });

  it("the watermark needs a session, like the ledger, and a token from another room is refused", async () => {
    const ada = await h.join("Ada", { host: true });
    expect((await h.get(`/rooms/${h.roomId}/ledger?watermark=1`, { "x-session-token": "nope" })).status).toBe(401);
    const firstRoom = h.roomId;
    await h.createRoom("Another room");
    const zed = await h.join("Zed", { host: true });
    expect((await h.get(`/rooms/${firstRoom}/ledger?watermark=1`, { "x-session-token": zed.token })).status).toBe(401);
    expect((await h.get(`/rooms/${firstRoom}/ledger?watermark=1`, { "x-session-token": ada.token })).status).toBe(200);
  });
});

describe("over HTTP: the reviewer's Spectrum case (casual room, the guest leaves in round 1)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  // Stage 10.3 changed what happens next: Spectrum is now saved (D-S103-01..03), so the link is "ready" and the
  // entry is added with its team facts. The 10.2 point stays: the hidden sit-out never leaves it "syncing".
  it("the host's ledger is current with the guest's sit-out hidden: ready (Stage 10.3), never 'syncing'; it saves", async () => {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    const r = await h.post("/rooms", { name: "Spectrum night", kind: "casual" });
    h.roomId = r.body["roomId"] as string;
    h.joinCode = r.body["joinCode"] as string;
    h.hostClaimToken = r.body["hostClaimToken"] as string;
    const host = await h.join("Keku", { host: true });
    const guest = await h.join("Amina");
    const gid = (await h.startGame(host, "spectrum", { official: false })).body["gameId"] as string;
    for (const p of [host, guest]) expect((await h.intent(p, gid, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
    expect((await h.intent(guest, gid, "abstain", {}))["accepted"]).toBe(true); // fewer than two left: the match ends
    expect(h.game(gid).status).toBe("finished");
    expect(h.engine().ledger.slice(-2).map((e) => e.type)).toEqual(["game-finished", "player-abstained"]);
    const v = (await h.get(`/rooms/${h.roomId}/ledger?watermark=1`, { "x-session-token": host.token })).body as unknown as LedgerView;
    const proj = await h.projection(host);
    expect(v.seq).toBe(proj["seq"]);
    expect(v.events.some((e) => e.type === "player-abstained" && e.playerId === guest.playerId)).toBe(false);
    expect(oldSyncing(v.events, proj["seq"] as number)).toBe(true); // the observed "Checking…" forever
    const registry = (await h.get("/games")).body as unknown as RegistryGame[];
    const link = memoryLink({ ledger: v.events, ledgerAt: v.seq, roomSeq: proj["seq"] as number, games: (proj["games"] as unknown as PublicGame[]) ?? [], registry });
    expect(link.state).toBe("ready");
    expect(link.target?.gameInstanceId).toBe(gid);
    const saved = await h.post(`/rooms/${h.roomId}/memory`, { day: 1, text: "So close", sourceEventIds: [link.target!.eventId] }, host.token);
    expect(saved.status).toBe(201);
    expect(saved.body["team"]).toMatchObject({ gameInstanceId: gid, end: "too-few-players" });
  });
});
