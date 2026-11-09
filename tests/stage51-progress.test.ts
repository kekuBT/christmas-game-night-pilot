/**
 * Stage 5.1 (O-07, S5-AUD-01): progress counts come from the server's own
 * rules and say what they count; an older poll reply can't roll a screen back
 * within a game. Counts only, never who.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isOvertakenReply } from "../apps/web/src/http.js";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine } from "../src/server/room.js";

type Progress = { started: number; total: number; answeredNow?: number; finished?: number };

function room(names: string[]) {
  const engine = new RoomEngine("Progress", { timing: 2 });
  let t = 1_800_000_000_000;
  engine.clock = () => t;
  const ids = names.map((n, i) => engine.join(n, i === 0 ? { asHost: true } : {}).player.id);
  return { engine, ids, tick: (ms: number) => { t += ms; } };
}
const progressOf = (e: RoomEngine, gid: string) =>
  ((e.project("tv")["games"] as { id: string; progress?: Progress }[]).find((g) => g.id === gid)!.progress!);

describe("progress counts", () => {
  it("Closest Wins: 'answered' is for the current question and starts again at 0", () => {
    const { engine, ids, tick } = room(["Keku", "Amina", "Baraka"]);
    const g = engine.startGame(ids[0]!, "closest-wins", { official: false });
    const send = (pid: string, action: string, payload: Record<string, unknown>) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: g.id, action, payload }, pid);
    for (const p of ids) send(p, "briefing-ready", { ready: true });
    tick(10);
    expect(progressOf(engine, g.id)).toMatchObject({ started: 0, total: 3, answeredNow: 0 });
    send(ids[0]!, "closest-guess", { value: 10 });
    expect(progressOf(engine, g.id)).toMatchObject({ started: 1, answeredNow: 1 });
    for (const p of ids.slice(1)) send(p, "closest-guess", { value: 20 });
    // Question 2 is open: everyone has STARTED, nobody has answered it.
    expect(progressOf(engine, g.id)).toMatchObject({ started: 3, answeredNow: 0 });
    expect(JSON.stringify(progressOf(engine, g.id))).not.toMatch(/Keku|Amina|Baraka|p\d/);
  });

  it("Who Said That: 'finished' counts only players with every question answered", () => {
    const { engine, ids, tick } = room(["Keku", "Amina", "Baraka", "Wanjiru"]);
    const g = engine.startGame(ids[0]!, "who-said-that", { official: false });
    const send = (pid: string, action: string, payload: Record<string, unknown>) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: g.id, action, payload }, pid);
    for (const p of ids) send(p, "briefing-ready", { ready: true });
    tick(10);
    const qs = ((engine.project("player", ids[0]).myGames as { id: string; state: { questions: { id: string }[] } }[]).find((x) => x.id === g.id)!.state.questions);
    expect(qs.length).toBeGreaterThan(1);
    for (const q of qs) send(ids[0]!, "whosaid-answer", { questionId: q.id, chosenIndex: 0 });
    send(ids[1]!, "whosaid-answer", { questionId: qs[0]!.id, chosenIndex: 0 });
    expect(progressOf(engine, g.id)).toMatchObject({ started: 2, finished: 1, total: 4 });
  });
});

describe("overtaken replies (revision)", () => {
  const shown = { roomId: "r1", seq: 40, rev: 1000 };
  it("an older revision is dropped even when the ledger seq is the same (a round changed, no ledger event)", () => {
    expect(isOvertakenReply({ roomId: "r1", seq: 40, rev: 999 }, shown, true)).toBe(true);
  });
  it("equal or newer revisions, nothing newer in flight, another room: kept", () => {
    expect(isOvertakenReply({ roomId: "r1", seq: 40, rev: 1000 }, shown, true)).toBe(false);
    expect(isOvertakenReply({ roomId: "r1", seq: 40, rev: 1001 }, shown, true)).toBe(false);
    expect(isOvertakenReply({ roomId: "r1", seq: 40, rev: 1 }, shown, false)).toBe(false);
    expect(isOvertakenReply({ roomId: "r2", seq: 1, rev: 1 }, shown, true)).toBe(false);
  });
  it("without a revision on either side it falls back to seq (Stage 4 behaviour)", () => {
    expect(isOvertakenReply({ roomId: "r1", seq: 37 }, shown, true)).toBe(true);
    expect(isOvertakenReply({ roomId: "r1", seq: 40 }, { roomId: "r1", seq: 40 }, true)).toBe(false);
  });
});

describe("room revision (server)", () => {
  let server: LocalServer;
  let port = 0;
  beforeAll(async () => {
    server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-rev-")) });
    port = await server.listen(0);
  });
  afterAll(async () => { await server.close(); });
  it("every projection carries it; it rises with each change and not with a plain read", async () => {
    const post = (path: string, body: unknown, token?: string) => fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, body: JSON.stringify(body) }).then((r) => r.json()) as Promise<Record<string, unknown>>;
    const room = await post("/rooms", { name: "Rev" }) as { roomId: string; joinCode: string; hostClaimToken: string };
    const host = await post(`/rooms/${room.roomId}/join`, { displayName: "Keku", asHost: true, hostClaimToken: room.hostClaimToken }) as { recoveryToken: string };
    const read = async () => (await (await fetch(`http://127.0.0.1:${port}/rooms/${room.roomId}/projection?audience=player`, { headers: { "x-session-token": host.recoveryToken } })).json() as { rev: number; seq: number });
    const a = await read();
    expect(typeof a.rev).toBe("number");
    expect((await read()).rev).toBe(a.rev); // a read changes nothing
    await post("/rooms/join-by-code", { joinCode: room.joinCode, displayName: "Amina" });
    const b = await read();
    expect(b.rev).toBeGreaterThan(a.rev);
  });
});
