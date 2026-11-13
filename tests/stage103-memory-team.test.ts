// Stage 10.3 (docs/stage10/stage103.md; D-S103-01..06): a finished Spectrum match can be saved in the Memory Book
// with team facts the server derives from the room's own finalized game, never from the request; early endings say
// so; anything not final fails closed; authority, exports and persistence keep their rules; titles are neutral on the
// server. Spectrum is enabled by name only.
import { afterEach, describe, expect, it } from "vitest";
import { memoryTeamLine, type MemoryTeamFacts } from "../src/shared/memoryTeam.js";
import { MemoryBook, MemoryTeamFactsSchema } from "../src/server/memorybook.js";
import { GAME_REGISTRY, isMemoryBookTeam } from "../src/games/registry.js";
import { SPECTRUM_ROUNDS, type SpectrumState } from "../src/games/modules/spectrum.js";
import { memoryLink, teamResultSaveable } from "../apps/web/src/ui/mchezo/lib/memoryLink.js";
import type { LedgerEvent, PublicGame, RegistryGame } from "../apps/web/src/types.js";
import { FakeClock, Harness, type Json, type Player } from "./helpers/harness.js";

const facts = (o: Partial<MemoryTeamFacts> = {}): MemoryTeamFacts => ({ kind: "spectrum", gameInstanceId: "game-1", finishedEventId: "evt-9", total: 27, max: 40, roundsRevealed: 4, roundsPlanned: 4, end: "completed", ...o });

describe("the shared wording (src/shared/memoryTeam.ts)", () => {
  it("a completed match: the total, the max and every round played", () => {
    expect(memoryTeamLine(facts())).toBe("Spectrum team result: 27 out of 40 · all 4 rounds played");
  });
  it("an early ending says it ended early, with the rounds actually played, and never claims completion", () => {
    const line = memoryTeamLine(facts({ total: 9, roundsRevealed: 1, end: "too-few-players" }));
    expect(line).toBe("Spectrum team result: 9 out of 40 · ended early, 1 of 4 rounds played (fewer than two players were left)");
    expect(line).not.toMatch(/all 4 rounds/);
    expect(memoryTeamLine(facts({ total: 0, roundsRevealed: 0, end: "too-few-players" }))).toMatch(/ended early, 0 of 4 rounds played/);
  });
  it("names no player and claims no winner, place, points per person or Cup", () => {
    for (const f of [facts(), facts({ end: "too-few-players", roundsRevealed: 2, total: 12 })]) {
      expect(memoryTeamLine(f)).not.toMatch(/\bwins?\b|\bwon\b|place|Cup|\bpts\b|player-/i);
    }
  });
});

describe("the saved record is checked (MemoryTeamFactsSchema)", () => {
  it("accepts both endings and refuses impossible facts or extra fields", () => {
    expect(MemoryTeamFactsSchema.safeParse(facts()).success).toBe(true);
    expect(MemoryTeamFactsSchema.safeParse(facts({ end: "too-few-players", roundsRevealed: 1 })).success).toBe(true);
    expect(MemoryTeamFactsSchema.safeParse(facts({ total: 41 })).success).toBe(false);
    expect(MemoryTeamFactsSchema.safeParse(facts({ roundsRevealed: 3 })).success).toBe(false); // "completed" with a round missing
    expect(MemoryTeamFactsSchema.safeParse(facts({ end: "too-few-players" })).success).toBe(false); // early, yet every round
    expect(MemoryTeamFactsSchema.safeParse({ ...facts(), end: null }).success).toBe(false);
    expect(MemoryTeamFactsSchema.safeParse({ ...facts(), winner: "player-1" }).success).toBe(false);
  });
  it("a book saved before Stage 10.3 (no team records) restores exactly as it was", () => {
    const old = { entries: [{ id: "book-1", day: 1, type: "game-result", text: "Ada won", sourceEventIds: ["evt-3"], approved: true, approvedBy: "player-1", derivedFacts: ["player-1: 30 points"] }], next: 2 };
    const book = MemoryBook.fromJSON(old);
    expect(book.entries).toEqual(old.entries);
    // Stage 11.2 (D-S112-02): the stored fact is unchanged, but an export no longer prints the internal id. With the
    // room's players it reads the name; with no room to ask, "A player". (This line used to expect "player-1: 30 points".)
    expect(book.exportMarkdown("Den", { roomKind: "cup", nameOf: (id) => (id === "player-1" ? "Ada" : undefined) })).toContain("From the ledger:\n- Ada: 30 points");
    expect(book.exportMarkdown("Den")).toContain("From the ledger:\n- A player: 30 points");
    expect(book.exportMarkdown("Den")).not.toContain("player-1");
  });
  it("a tampered team record, or one citing another event, refuses the book on restore", () => {
    const entry = (team: unknown, src = ["evt-9"]) => ({ entries: [{ id: "book-1", day: 1, type: "game-result", text: "x", sourceEventIds: src, approved: false, derivedFacts: [], team }], next: 2 });
    expect(() => MemoryBook.fromJSON(entry(facts()))).not.toThrow();
    expect(() => MemoryBook.fromJSON(entry({ ...facts(), total: 99 }))).toThrow(/invalid team result/);
    expect(() => MemoryBook.fromJSON(entry(facts(), ["evt-2"]))).toThrow(/other than its team result's finish/);
  });
});

describe("Spectrum, enabled by name", () => {
  it("is the only Memory Book team game; a cooperative game without the flag stays refused", () => {
    expect(isMemoryBookTeam("spectrum")).toBe(true);
    expect(GAME_REGISTRY.filter((g) => g.cooperative).map((g) => [g.id, isMemoryBookTeam(g.id)])).toEqual([["spectrum", true]]);
    expect(isMemoryBookTeam("trivia")).toBe(false);
  });
});

// ---------- the screen's link state (pure) ----------
const ev = (seq: number, type: string, extra: Partial<LedgerEvent> = {}): LedgerEvent => ({ eventId: `evt-${seq}`, seq, type, createdAt: seq, ...extra });
const team = (end: "completed" | "too-few-players" | null, revealed: number) => ({ kind: "spectrum" as const, total: 10 * revealed, max: 40, roundsPlanned: 4, end, rounds: Array.from({ length: revealed }, (_, i) => ({ roundNo: i + 1, pair: { left: "a", right: "b", meaning: "" }, clue: "c", reason: "scored" as const, target: 50, aggregate: 50, distance: 0, points: 10, guesses: 2 })) });
const sp = (t: ReturnType<typeof team> | undefined, reason = "completed"): PublicGame => ({ id: "g2", gameId: "spectrum", status: "finished", outcome: { reason, endedAt: 1, countsOfficially: false, participation: {}, ...(t ? { team: t } : {}) } } as unknown as PublicGame);
const reg = (o: Partial<RegistryGame>): RegistryGame => ({ id: "spectrum", title: "Spectrum", minPlayers: 2, maxPlayers: 10, defaultDurationMinutes: 8, tutorial: "", cooperative: true, ...o });
const LEDGER = [ev(30, "game-finished", { gameInstanceId: "g1" }), ev(32, "game-started", { gameInstanceId: "g2" }), ev(34, "game-finished", { gameInstanceId: "g2" })];

describe("memoryLink: Spectrum in the Memory Book", () => {
  it("a completed or genuinely early Spectrum finish is ready to add, citing that finish", () => {
    for (const t of [team("completed", 4), team("too-few-players", 1), team("too-few-players", 0)]) {
      const l = memoryLink({ ledger: LEDGER, ledgerAt: 35, roomSeq: 35, games: [sp(t)], registry: [reg({ memoryBookTeam: true })] });
      expect(l.state).toBe("ready");
      expect(l.target?.eventId).toBe("evt-34");
    }
  });
  it("a room-ended (end null), voided or missing team result is unavailable as not final", () => {
    for (const g of [sp(team(null, 2)), sp(team("completed", 4), "void"), sp(undefined)]) {
      const l = memoryLink({ ledger: LEDGER, ledgerAt: 35, roomSeq: 35, games: [g], registry: [reg({ memoryBookTeam: true })] });
      expect([l.state, l.why]).toEqual(["unavailable", "team-not-final"]);
    }
  });
  it("a cooperative game without the flag is unavailable as not supported", () => {
    const l = memoryLink({ ledger: LEDGER, ledgerAt: 35, roomSeq: 35, games: [sp(team("completed", 4))], registry: [reg({})] });
    expect([l.state, l.why]).toEqual(["unavailable", "team-not-supported"]);
  });
  it("a stale load (the Spectrum finish not yet loaded) is syncing and never cites the earlier game", () => {
    const l = memoryLink({ ledger: LEDGER.slice(0, 1), ledgerAt: 31, roomSeq: 35, games: [sp(team("completed", 4))], registry: [reg({ memoryBookTeam: true })] });
    expect(l.state).toBe("syncing");
  });
  it("teamResultSaveable mirrors the server's rule", () => {
    expect(teamResultSaveable(team("completed", 4))).toBe(true);
    expect(teamResultSaveable(team("completed", 3))).toBe(false);
    expect(teamResultSaveable(team("too-few-players", 4))).toBe(false);
    expect(teamResultSaveable(team(null, 2))).toBe(false);
    expect(teamResultSaveable(undefined)).toBe(false);
  });
});

// ---------- over HTTP, with real Spectrum matches ----------
type Seat = Player;
async function casualRoom(h: Harness, name = "Spectrum night"): Promise<void> {
  const r = await h.post("/rooms", { name, kind: "casual" });
  h.roomId = r.body["roomId"] as string;
  h.joinCode = r.body["joinCode"] as string;
  h.hostClaimToken = r.body["hostClaimToken"] as string;
}
async function startSpectrum(h: Harness, host: Seat, seats: Seat[]): Promise<string> {
  const started = await h.startGame(host, "spectrum", { official: false });
  expect(started.status).toBe(201);
  const gid = started.body["gameId"] as string;
  for (const p of seats) expect((await h.intent(p, gid, "briefing-ready", { ready: true }))["accepted"]).toBe(true);
  expect(h.game(gid).status).toBe("playing");
  return gid;
}
/** Every round: a clue, everyone exactly on the target (10 points each round), then the reveal runs out. */
async function playToTheEnd(h: Harness, gid: string, seats: Seat[]): Promise<void> {
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
const add = (h: Harness, p: Seat, body: Json) => h.post(`/rooms/${h.roomId}/memory`, { day: 1, ...body }, p.token);
const book = async (h: Harness, p: Seat) => (await h.get(`/rooms/${h.roomId}/memory`, { "x-session-token": p.token })).body as unknown as Json[];
const exportMd = async (h: Harness, p: Seat) => ((await h.get(`/rooms/${h.roomId}/memory/export`, { "x-session-token": p.token })).body["markdown"] as string);

describe("over HTTP: saving Spectrum's team result", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });
  async function room() {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    await casualRoom(h);
    const host = await h.join("Keku", { host: true });
    const amina = await h.join("Amina");
    const baraka = await h.join("Baraka");
    return { h, host, amina, baraka, seats: [host, amina, baraka] };
  }

  it("a completed match saves with the server's frozen facts; forged facts in the request are ignored", async () => {
    const { h, host, amina, seats } = await room();
    const gid = await startSpectrum(h, host, seats);
    await playToTheEnd(h, gid, seats);
    const t = h.game(gid).outcome!.team!;
    expect([t.end, t.rounds.length, t.total, t.max]).toEqual(["completed", 4, 40, 40]);
    const fin = finishOf(h, gid);
    // A guest adds it, and tries to slip in different facts, an approval and a per-player score.
    const res = await add(h, amina, { text: "We were all on one wavelength", sourceEventIds: [fin.eventId], team: { kind: "spectrum", total: 3, max: 40, roundsRevealed: 1, roundsPlanned: 4, end: "too-few-players" }, total: 3, derivedFacts: ["player-1: 999 points"], approved: true, approvedBy: amina.playerId });
    expect(res.status).toBe(201);
    expect(res.body["team"]).toEqual({ kind: "spectrum", gameInstanceId: gid, finishedEventId: fin.eventId, total: 40, max: 40, roundsRevealed: 4, roundsPlanned: 4, end: "completed" });
    expect(res.body["derivedFacts"]).toEqual(["Spectrum team result: 40 out of 40 · all 4 rounds played"]);
    expect(res.body["approved"]).toBe(false);
    expect(res.body["approvedBy"]).toBeUndefined();
    expect(res.body["sourceEventIds"]).toEqual([fin.eventId]);
    expect(res.body["text"]).toBe("We were all on one wavelength"); // the note stays the person's words
    // No game-score write: the ledger gained no score event, and no per-player number exists for this game.
    expect(h.engine().ledger.filter((e) => e.gameInstanceId === gid && e.type === "score-awarded")).toEqual([]);
  });

  it("a genuinely early ending saves, saying it ended early with the rounds actually played", async () => {
    const { h, host, amina, baraka, seats } = await room();
    const gid = await startSpectrum(h, host, seats);
    for (const p of [amina, baraka]) expect((await h.intent(p, gid, "abstain", {}))["accepted"]).toBe(true);
    expect(h.game(gid).status).toBe("finished");
    const t = h.game(gid).outcome!.team!;
    expect(t.end).toBe("too-few-players");
    const res = await add(h, host, { text: "We'll get it next time", sourceEventIds: [finishOf(h, gid).eventId] });
    expect(res.status).toBe(201);
    expect(res.body["team"]).toMatchObject({ end: "too-few-players", roundsRevealed: t.rounds.length, roundsPlanned: 4, total: t.total });
    expect((res.body["derivedFacts"] as string[])[0]).toMatch(new RegExp(`^Spectrum team result: ${t.total} out of 40 · ended early, ${t.rounds.length} of 4 rounds played \\(fewer than two players were left\\)$`));
  });

  it("fails closed: a room-ended match (end null), a voided game, a missing or corrupted team result, two citations", async () => {
    const { h, host, seats } = await room();
    const gid = await startSpectrum(h, host, seats);
    await playToTheEnd(h, gid, seats);
    const fin = finishOf(h, gid);
    const g = h.game(gid);
    const real = structuredClone(g.outcome!);
    const tryWith = async (outcome: unknown) => { g.outcome = outcome as typeof g.outcome; return add(h, host, { text: "x", sourceEventIds: [fin.eventId] }); };
    const r1 = await tryWith({ ...real, team: { ...real.team!, end: null } });
    expect([r1.status, r1.body["code"]]).toEqual([409, "RESULT_NOT_SAVEABLE"]);
    expect(r1.body["error"]).toMatch(/time limit/);
    expect((await tryWith({ ...real, reason: "void", team: undefined })).body["code"]).toBe("RESULT_NOT_SAVEABLE");
    expect((await tryWith({ ...real, team: undefined })).body["code"]).toBe("RESULT_NOT_SAVEABLE");
    expect((await tryWith({ ...real, team: { ...real.team!, total: 41 } })).body["code"]).toBe("RESULT_NOT_SAVEABLE");
    expect((await tryWith({ ...real, team: { ...real.team!, rounds: real.team!.rounds.slice(0, 3), total: 30 } })).body["code"]).toBe("RESULT_NOT_SAVEABLE"); // "completed" with a round missing
    g.outcome = real;
    const two = await add(h, host, { text: "x", sourceEventIds: [fin.eventId, fin.eventId] });
    expect([two.status, two.body["code"]]).toEqual([400, "ONE_TEAM_GAME"]);
    // An unfinished game: its start event, cited before it ends, is not a finish.
    const started = h.engine().ledger.find((e) => e.type === "game-started" && e.gameInstanceId === gid)!;
    expect((await add(h, host, { text: "x", sourceEventIds: [started.eventId] })).status).toBe(400);
    expect(await book(h, host)).toEqual([]); // nothing was added by any refusal
    // With the real result back, it saves.
    expect((await add(h, host, { text: "x", sourceEventIds: [fin.eventId] })).status).toBe(201);
  });

  it("authority unchanged: a guest adds pending; only the host or a cohost approves or revokes; exports hold approved entries only", async () => {
    const { h, host, amina, baraka, seats } = await room();
    const gid = await startSpectrum(h, host, seats);
    await playToTheEnd(h, gid, seats);
    const entry = (await add(h, amina, { text: "Team night", sourceEventIds: [finishOf(h, gid).eventId] })).body;
    const id = entry["id"] as string;
    expect((await h.post(`/rooms/${h.roomId}/memory/${id}/approve`, {}, amina.token)).status).toBe(403);
    expect(await exportMd(h, amina)).not.toContain("Team night");
    expect((await h.post(`/rooms/${h.roomId}/memory/${id}/approve`, {}, host.token)).status).toBe(200);
    const md = await exportMd(h, amina);
    expect(md).toMatch(/^# Mchezo Memory Book — Spectrum night/);
    expect(md).not.toContain("Christmas");
    expect(md).toContain("Note: Team night\nFrom the game:\n- Spectrum team result: 40 out of 40 · all 4 rounds played");
    expect(md).not.toMatch(/player-\d|points/); // no per-player fact for a team game
    // A cohost (granted by the host) can revoke; a revoked entry leaves the export.
    expect((await h.post(`/rooms/${h.roomId}/cohost`, { targetId: baraka.playerId }, host.token)).status).toBe(200);
    expect((await h.post(`/rooms/${h.roomId}/memory/${id}/revoke`, {}, amina.token)).status).toBe(403);
    expect((await h.post(`/rooms/${h.roomId}/memory/${id}/revoke`, {}, baraka.token)).status).toBe(200);
    expect(await exportMd(h, host)).not.toContain("Team night");
    expect((await h.post(`/rooms/${h.roomId}/memory/${id}/approve`, {}, baraka.token)).status).toBe(200);
    expect(await exportMd(h, host)).toContain("Team night");
  });

  it("the same trusted facts after a restart; a competitive entry beside it keeps its own facts", async () => {
    const { h, host, amina, seats } = await room();
    const gid = await startSpectrum(h, host, seats);
    await playToTheEnd(h, gid, seats);
    const teamEntry = (await add(h, host, { text: "Spectrum!", sourceEventIds: [finishOf(h, gid).eventId] })).body;
    await h.post(`/rooms/${h.roomId}/memory/${teamEntry["id"]}/approve`, {}, host.token);
    // A competitive game afterwards: Trivia, everyone answering.
    const tg = (await h.startGame(host, "trivia", { official: false, seed: 3 })).body["gameId"] as string;
    for (const p of seats) await h.intent(p, tg, "briefing-ready", { ready: true });
    const qs = (h.game(tg).extra as { questions: { id: string }[] }).questions;
    for (const p of seats) for (const q of qs) await h.intent(p, tg, "trivia-answer", { questionId: q.id, chosenIndex: 0 });
    expect(h.game(tg).status).toBe("finished");
    const comp = (await add(h, amina, { text: "Trivia too", sourceEventIds: [finishOf(h, tg).eventId] })).body;
    expect(comp["team"]).toBeUndefined();
    expect((comp["derivedFacts"] as string[]).every((f) => /^player-\d+: \d+ points$/.test(f))).toBe(true);
    const before = await book(h, host);
    await h.restart();
    const after = await book(h, host);
    expect(after).toEqual(before);
    expect(after.find((e) => e["id"] === teamEntry["id"])!["team"]).toEqual(teamEntry["team"]);
    expect(await exportMd(h, host)).toContain("From the game:\n- Spectrum team result: 40 out of 40 · all 4 rounds played");
  });

  it("other rooms: a foreign token is refused, and a foreign event id never yields another room's facts", async () => {
    const { h, host, seats } = await room();
    const gid = await startSpectrum(h, host, seats);
    await playToTheEnd(h, gid, seats);
    const roomA = h.roomId;
    const finA = finishOf(h, gid);
    await casualRoom(h, "Room B");
    const zed = await h.join("Zed", { host: true });
    await h.join("Yusuf");
    // Zed's token can't add to room A.
    expect((await h.post(`/rooms/${roomA}/memory`, { day: 1, text: "x", sourceEventIds: [finA.eventId] }, zed.token)).status).toBe(401);
    // Room A's finish id cited in room B resolves only in room B's ledger (where no Spectrum finished): no team facts.
    const r = await h.post(`/rooms/${h.roomId}/memory`, { day: 1, text: "x", sourceEventIds: [finA.eventId] }, zed.token);
    expect(r.status).toBe(400);
    expect((await h.get(`/rooms/${h.roomId}/memory`, { "x-session-token": zed.token })).body).toEqual([]);
  });
});
