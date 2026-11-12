// Stage 10.4 (docs/stage10/stage104.md; D-S104-01..04): Save a memory from a result screen. The save names the game
// it shows (`fromGame`) and the server resolves that game's own finish in this room, so an old result never saves a
// newer match; a member's request key makes one save once (double tap, retry, reconnect, restart) and never lets a
// different request overwrite it; facts, refusals and authority are Stage 10.3's; nothing touches a score.
import { afterEach, describe, expect, it } from "vitest";
import { SPECTRUM_ROUNDS, type SpectrumState } from "../src/games/modules/spectrum.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

async function casualRoom(h: Harness, name = "Save night"): Promise<void> {
  const r = await h.post("/rooms", { name, kind: "casual" });
  h.roomId = r.body["roomId"] as string;
  h.joinCode = r.body["joinCode"] as string;
  h.hostClaimToken = r.body["hostClaimToken"] as string;
}
async function start(h: Harness, host: Player, gameId: string, seats: Player[]): Promise<string> {
  const started = await h.startGame(host, gameId, { official: false });
  expect(started.status).toBe(201);
  const gid = started.body["gameId"] as string;
  for (const p of seats) expect((await h.intent(p, gid, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
  expect(h.game(gid).status).toBe("playing");
  return gid;
}
/** A completed Spectrum match: every round on target, the reveal run out on the fake clock. */
async function spectrumToTheEnd(h: Harness, gid: string, seats: Player[]): Promise<void> {
  const byId = new Map(seats.map((s) => [s.playerId, s]));
  for (let i = 0; i < SPECTRUM_ROUNDS; i++) {
    const g = h.game(gid);
    const st = g.extra as SpectrumState;
    const r = st.rounds[st.round]!;
    expect((await h.intent(byId.get(r.giver!)!, gid, "spectrum-clue", { round: st.round + 1, text: "a warm bath", phaseKey: g.phaseKey }))["accepted"]).toBe(true);
    for (const pid of [...r.required]) expect((await h.intent(byId.get(pid)!, gid, "spectrum-guess", { round: st.round + 1, value: r.target, phaseKey: h.game(gid).phaseKey }))["accepted"]).toBe(true);
    h.clock.advance(h.game(gid).phaseDeadlineAt! - h.clock.now() + 1);
    h.lifecycleTick();
  }
  expect(h.game(gid).status).toBe("finished");
}
const finishOf = (h: Harness, gid: string) => h.engine().ledger.find((e) => e.type === "game-finished" && e.gameInstanceId === gid)!;
const save = (h: Harness, p: Player, body: Json) => h.post(`/rooms/${h.roomId}/memory`, { day: 1, ...body }, p.token);
const book = async (h: Harness, p: Player) => (await h.get(`/rooms/${h.roomId}/memory`, { "x-session-token": p.token })).body as unknown as Json[];
const KEY = "save-0001-aaaa";

describe("Stage 10.4: Save a memory from a result screen (over HTTP)", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });
  async function room() {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    await casualRoom(h);
    const host = await h.join("Keku", { host: true });
    const amina = await h.join("Amina");
    return { h, host, amina, seats: [host, amina] };
  }
  /** Spectrum completed, then a Jebena match the guest leaves (the host wins by her leaving). */
  async function twoFinishedGames() {
    const r = await room();
    const sp = await start(r.h, r.host, "spectrum", r.seats);
    await spectrumToTheEnd(r.h, sp, r.seats);
    const jr = await start(r.h, r.host, "jebena-rush", r.seats);
    expect((await r.h.intent(r.amina, jr, "abstain", {}))["accepted"]).toBe(true);
    expect(r.h.game(jr).status).toBe("finished");
    return { ...r, sp, jr };
  }

  it("binds to the game on screen: an old result saved after a newer match finished still cites the old one (the replay race)", async () => {
    const { h, amina, sp, jr } = await twoFinishedGames();
    // Amina's phone still shows Spectrum's result while the Jebena match finished after it.
    const old = await save(h, amina, { fromGame: sp, text: "Every round on target", requestId: KEY });
    expect(old.status).toBe(201);
    expect(old.body["sourceEventIds"]).toEqual([finishOf(h, sp).eventId]);
    expect(old.body["team"]).toMatchObject({ gameInstanceId: sp, end: "completed", total: 40 });
    expect(old.body["addedBy"]).toBe(amina.playerId);
    // And the Jebena result, from its own screen, cites the Jebena finish with its score facts.
    const newer = await save(h, amina, { fromGame: jr, text: "I left, Keku kept the jebena", requestId: "save-0002-bbbb" });
    expect(newer.status).toBe(201);
    expect(newer.body["sourceEventIds"]).toEqual([finishOf(h, jr).eventId]);
    expect(newer.body["team"]).toBeUndefined();
    expect((newer.body["derivedFacts"] as string[]).length).toBe(2);
    expect((newer.body["derivedFacts"] as string[]).every((f) => /^player-\d+: \d+ points$/.test(f))).toBe(true);
  });

  it("one save, once: the same key and request again (one after another, or at the same time) returns the same entry", async () => {
    const { h, amina, sp } = await twoFinishedGames();
    const body = { fromGame: sp, text: "Round 3 was a bullseye", requestId: KEY };
    const first = await save(h, amina, body);
    expect(first.status).toBe(201);
    const again = await save(h, amina, body);
    expect(again.status).toBe(200);
    expect(again.body["id"]).toBe(first.body["id"]);
    const burst = await Promise.all([save(h, amina, { ...body, requestId: "save-0003-cccc" }), save(h, amina, { ...body, requestId: "save-0003-cccc" }), save(h, amina, { ...body, requestId: "save-0003-cccc" })]);
    expect(burst.filter((r) => r.status === 201)).toHaveLength(1);
    expect(new Set(burst.map((r) => r.body["id"])).size).toBe(1);
    // Two keys, two intentional notes (the boundary: no deduplication by game).
    expect((await book(h, amina)).length).toBe(2);
  });

  it("a different request under the same key is refused with the original entry, never overwriting it", async () => {
    const { h, amina, sp } = await twoFinishedGames();
    const first = await save(h, amina, { fromGame: sp, text: "First words", requestId: KEY });
    const edited = await save(h, amina, { fromGame: sp, text: "Edited after a lost reply", requestId: KEY });
    expect([edited.status, edited.body["code"]]).toEqual([409, "ATTEMPT_MISMATCH"]);
    expect((edited.body["entry"] as Json)["id"]).toBe(first.body["id"]);
    expect((edited.body["entry"] as Json)["text"]).toBe("First words");
    const all = await book(h, amina);
    expect(all.map((e) => e["text"])).toEqual(["First words"]);
  });

  it("keys are each member's own: the same key from two members makes two entries; one never touches the other's", async () => {
    const { h, host, amina, sp } = await twoFinishedGames();
    const a = await save(h, amina, { fromGame: sp, text: "Amina's note", requestId: KEY });
    const k = await save(h, host, { fromGame: sp, text: "Keku's note", requestId: KEY });
    expect([a.status, k.status]).toEqual([201, 201]);
    expect(a.body["id"]).not.toBe(k.body["id"]);
    expect([a.body["addedBy"], k.body["addedBy"]]).toEqual([amina.playerId, host.playerId]);
    expect((await book(h, host)).map((e) => e["text"])).toEqual(["Amina's note", "Keku's note"]);
  });

  it("a retry after a restart is still recognized (keys are kept with the book)", async () => {
    const { h, amina, sp } = await twoFinishedGames();
    const first = await save(h, amina, { fromGame: sp, text: "Before the restart", requestId: KEY });
    await h.restart();
    const retry = await save(h, amina, { fromGame: sp, text: "Before the restart", requestId: KEY });
    expect(retry.status).toBe(200);
    expect(retry.body["id"]).toBe(first.body["id"]);
    expect((await book(h, amina)).length).toBe(1);
  });

  it("refusals, each with a code, and nothing added", async () => {
    const { h, host, amina, sp } = await twoFinishedGames();
    const refuse = async (body: Json, status: number, code: string) => {
      const r = await save(h, amina, body);
      expect([r.status, r.body["code"]], JSON.stringify(body)).toEqual([status, code]);
    };
    await refuse({ fromGame: "game-999", text: "x" }, 400, "UNKNOWN_GAME");
    await refuse({ fromGame: sp, text: "   " }, 400, "NOTE_REQUIRED");
    await refuse({ fromGame: sp, text: "x".repeat(281) }, 400, "NOTE_TOO_LONG");
    await refuse({ fromGame: sp, text: "x", sourceEventIds: [finishOf(h, sp).eventId] }, 400, "ONE_SOURCE");
    await refuse({ fromGame: sp, text: "x", requestId: "no spaces allowed" }, 400, "BAD_REQUEST_ID");
    // A game still being played.
    const playing = await start(h, host, "spectrum", [host, amina]);
    await refuse({ fromGame: playing, text: "x" }, 409, "NOT_FINISHED");
    // A room-ended Spectrum match (end null) and a voided game, as the server would hold them.
    const g = h.game(sp);
    const real = structuredClone(g.outcome!);
    g.outcome = { ...real, team: { ...real.team!, end: null } } as typeof g.outcome;
    await refuse({ fromGame: sp, text: "x" }, 409, "RESULT_NOT_SAVEABLE");
    g.outcome = { ...real, reason: "void", team: undefined } as typeof g.outcome;
    await refuse({ fromGame: sp, text: "x" }, 409, "RESULT_NOT_SAVEABLE");
    g.outcome = real;
    expect(await book(h, amina)).toEqual([]);
  });

  it("forged facts, approval or authorship in a save are ignored; approval stays host or cohost only", async () => {
    const { h, host, amina, sp } = await twoFinishedGames();
    const r = await save(h, amina, { fromGame: sp, text: "Forged", requestId: KEY, approved: true, approvedBy: amina.playerId, addedBy: host.playerId, team: { kind: "spectrum", total: 3, max: 40, roundsRevealed: 1, roundsPlanned: 4, end: "too-few-players" }, derivedFacts: ["player-1: 999 points"] });
    expect(r.status).toBe(201);
    expect(r.body["approved"]).toBe(false);
    expect(r.body["approvedBy"]).toBeUndefined();
    expect(r.body["addedBy"]).toBe(amina.playerId);
    expect(r.body["team"]).toMatchObject({ total: 40, end: "completed" });
    expect(r.body["derivedFacts"]).toEqual(["Spectrum team result: 40 out of 40 · all 4 rounds played"]);
    expect((await h.post(`/rooms/${h.roomId}/memory/${r.body["id"]}/approve`, {}, amina.token)).status).toBe(403);
    expect((await h.post(`/rooms/${h.roomId}/memory/${r.body["id"]}/approve`, {}, host.token)).status).toBe(200);
  });

  it("other rooms: a foreign token is refused, and another room's game id is unknown here", async () => {
    const { h, amina, sp } = await twoFinishedGames();
    const roomA = h.roomId;
    await casualRoom(h, "Room B");
    const zed = await h.join("Zed", { host: true });
    expect((await h.post(`/rooms/${roomA}/memory`, { day: 1, fromGame: sp, text: "x" }, zed.token)).status).toBe(401);
    // Game ids are per room (game-1, game-2…): room B has no game, so room A's id finds nothing here.
    const r = await h.post(`/rooms/${h.roomId}/memory`, { day: 1, fromGame: sp, text: "x" }, zed.token);
    expect([r.status, r.body["code"]]).toEqual([400, "UNKNOWN_GAME"]);
    h.roomId = roomA;
    expect(await book(h, amina)).toEqual([]);
  });

  it("saving changes no score, outcome or ledger event, and advances nothing", async () => {
    const { h, host, amina, sp, jr } = await twoFinishedGames();
    const snapshot = () => JSON.stringify({ games: [...h.engine().games.values()].map((g) => [g.id, g.status, g.rawScores, g.outcome]), ledger: h.engine().ledger.length, seq: h.engine().seq });
    const before = snapshot();
    await save(h, amina, { fromGame: sp, text: "Team!", requestId: KEY });
    await save(h, host, { fromGame: jr, text: "Kept it", requestId: KEY });
    expect(snapshot()).toBe(before);
  });
});
