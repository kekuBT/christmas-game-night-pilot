/**
 * Sprint 2 Workstream D/E: seat recovery (docs/RECOVERY_CONTRACT.md),
 * exercised over the real HTTP + WebSocket server.
 *
 * Requirement: someone who lost their phone or tab gets back their OWN
 * seat (same slot, role, answers, scores) and nothing else; the old
 * credential and old devices stop working immediately; nothing can be
 * guessed, replayed or approved by name; every recovery is visible to the
 * room and audited; secrets never appear in projections, ledgers or logs.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeClock, Harness, myGame, waitFor, type Json, type Player } from "./helpers/harness.js";

let h: Harness;
let logged: string[];
beforeEach(async () => {
  h = await new Harness(undefined, { clock: new FakeClock() }).start();
  await h.createRoom("Family Night");
  logged = [];
  for (const m of ["log", "warn", "error", "info"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(" ")); });
  }
});
afterEach(async () => { vi.restoreAllMocks(); await h.dispose(); });

const issueCode = async (p: Player) => {
  const r = await h.post(`/rooms/${h.roomId}/recovery-code`, {}, p.token);
  expect(r.status).toBe(201);
  return r.body["recoveryCode"] as string;
};
const recover = (code: string, joinCode = h.joinCode) => h.post("/rooms/recover-by-code", { joinCode, recoveryCode: code });
const sessionOk = async (token: string) => (await h.get(`/rooms/${h.roomId}/session`, { "x-session-token": token })).status === 200;
/** Every string a client could ever see: all projections, ledgers, plus server logs. */
async function everythingVisible(players: Player[]): Promise<string> {
  const parts: unknown[] = [await h.tv(), logged];
  for (const p of players) {
    if (await sessionOk(p.token)) {
      parts.push(await h.projection(p));
      parts.push((await h.get(`/rooms/${h.roomId}/ledger`, { "x-session-token": p.token })).body);
    }
  }
  return JSON.stringify(parts);
}

describe("recovery codes", () => {
  it("issued codes are 20 unambiguous characters (≈100 bits), shown once, stored only as a hash", async () => {
    const ada = await h.join("Ada", { host: true });
    const code = await issueCode(ada);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/);
    const slot = h.engine().players.get(ada.playerId)!;
    expect(slot.recoveryCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(h.engine().toJSON())).not.toContain(code.replace(/-/g, ""));
    expect(await everythingVisible([ada])).not.toContain(code.replace(/-/g, "").slice(0, 10));
    // A second issue revokes the first.
    const second = await issueCode(ada);
    expect((await recover(code)).status).toBe(400);
    expect((await recover(second)).status).toBe(200);
  });

  it("23. a valid code restores the SAME seat on a new device, with a new credential, and the old one dies", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const code = await issueCode(bea);
    const seatsBefore = h.engine().players.size;
    const r = await recover(code.toLowerCase().replace(/-/g, " ")); // case and spacing don't matter
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ roomId: h.roomId, playerId: bea.playerId, displayName: "Bea" });
    const newToken = r.body["sessionToken"] as string;
    expect(newToken).not.toBe(bea.token);
    expect(r.body["recoveryCode"]).not.toBe(code); // rotated
    expect(await sessionOk(newToken)).toBe(true);
    expect(await sessionOk(bea.token)).toBe(false); // real invalidation, not a UI flag
    expect(h.engine().players.size).toBe(seatsBefore); // no duplicate seat
    expect(ada.playerId).toBeTruthy();
  });

  it("24. replaying a used code fails, and the fresh code from the recovery works", async () => {
    const bea = (await h.join("Ada", { host: true }), await h.join("Bea"));
    const code = await issueCode(bea);
    const first = await recover(code);
    expect(first.status).toBe(200);
    expect((await recover(code)).status).toBe(400);
    expect((await recover(first.body["recoveryCode"] as string)).status).toBe(200);
  });

  it("25. wrong or malformed codes fail without saying which seat they were near", async () => {
    const bea = (await h.join("Ada", { host: true }), await h.join("Bea"));
    const real = await issueCode(bea);
    const wrong = real.slice(0, -1) + (real.endsWith("A") ? "B" : "A");
    for (const c of [wrong, "short", "", "0O1I0O1I0O1I0O1I0O1I", 12345]) {
      const r = await h.post("/rooms/recover-by-code", { joinCode: h.joinCode, recoveryCode: c });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).not.toContain("Bea");
    }
    expect((await recover(real, "ZZZZZZ")).status).toBe(400); // right code, wrong room
  });

  it("26. brute force is cut off after 5 failures per device (even a correct code is refused), then the window passes", async () => {
    const bea = (await h.join("Ada", { host: true }), await h.join("Bea"));
    const real = await issueCode(bea);
    for (let i = 0; i < 5; i++) expect((await recover("AAAAA-AAAAA-AAAAA-AAAA" + String.fromCharCode(66 + i))).status).toBe(400);
    const blocked = await recover(real);
    expect(blocked.status).toBe(429);
    expect(String(blocked.body["error"])).toMatch(/Too many attempts/);
    expect(await sessionOk(bea.token)).toBe(true); // nothing rotated
    h.clock.advance(15 * 60_000);
    expect((await recover(real)).status).toBe(200);
    // Failures are audited, without the guessed values.
    const audits = h.engine().ledger.filter((e) => e.type === "recovery-attempt-failed");
    expect(audits).toHaveLength(5);
    expect(JSON.stringify(audits)).not.toContain("AAAAA");
  });

  it("27. concurrent recoveries with one code: exactly one succeeds, exactly one credential is valid", async () => {
    const bea = (await h.join("Ada", { host: true }), await h.join("Bea"));
    const code = await issueCode(bea);
    const results = await Promise.all(Array.from({ length: 6 }, () => recover(code)));
    const wins = results.filter((r) => r.status === 200);
    expect(wins).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(5);
    expect(await sessionOk(wins[0]!.body["sessionToken"] as string)).toBe(true);
    expect(h.engine().ledger.filter((e) => e.type === "seat-recovered")).toHaveLength(1);
  });

  it("28. recovery mid-game keeps participation, answers and score; the new device can keep playing, the old cannot", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gid = (await h.startGame(ada, "math-mayhem", { seed: 4 })).body["gameId"] as string;
    const qs = h.game(gid).questions!;
    await h.intent(bea, gid, "submit-math-answer", { questionId: qs[0]!.id, chosenIndex: qs[0]!.correctIndex });
    const scoreBefore = h.game(gid).rawScores[bea.playerId];
    const code = await issueCode(bea);
    const r = await recover(code);
    const fresh: Player = { name: "Bea", playerId: bea.playerId, token: r.body["sessionToken"] as string };
    expect(h.game(gid).players).toContain(bea.playerId);
    expect(h.game(gid).rawScores[bea.playerId]).toBe(scoreBefore);
    expect(myGame(await h.projection(fresh), gid)["myAnswers"]).toEqual({ [qs[0]!.id]: qs[0]!.correctIndex });
    const oldTry = await h.post(`/rooms/${h.roomId}/intents`, h.intentBody(gid, "submit-math-answer", { questionId: qs[1]!.id, chosenIndex: 0 }), bea.token);
    expect(oldTry.status).toBe(401);
    expect((await h.intent(fresh, gid, "submit-math-answer", { questionId: qs[1]!.id, chosenIndex: qs[1]!.correctIndex }))["accepted"]).toBe(true);
  });

  it("29. survives restarts: rotation and code consumption are on disk; old credentials stay dead", async () => {
    const bea = (await h.join("Ada", { host: true }), await h.join("Bea"));
    const code = await issueCode(bea);
    await h.restart(); // the code was saved
    const r = await recover(code);
    expect(r.status).toBe(200);
    await h.restart(); // the rotation was saved
    expect(await sessionOk(bea.token)).toBe(false);
    expect(await sessionOk(r.body["sessionToken"] as string)).toBe(true);
    expect((await recover(code)).status).toBe(400);
    expect((await recover(r.body["recoveryCode"] as string)).status).toBe(200);
  });

  it("30. an old device's WebSocket is told and closed, and its credential cannot open a new one", async () => {
    const bea = (await h.join("Ada", { host: true }), await h.join("Bea"));
    const messages: Json[] = [];
    const old = await h.openSocket(bea, { onMessage: (m) => messages.push(m) });
    const closed = new Promise<number>((r) => old.once("close", (code) => r(code)));
    const code = await issueCode(bea);
    expect((await recover(code)).status).toBe(200);
    expect(await closed).toBe(4001);
    expect(messages.some((m) => m["kind"] === "error" && m["code"] === "SESSION_REPLACED")).toBe(true);
    await expect(h.openSocket(bea)).rejects.toThrow(/1008/);
  });

  it("31/32. a host and a cohost who recover their own seats keep exactly their roles", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const cal = await h.join("Cal");
    await h.post(`/rooms/${h.roomId}/cohost`, { targetId: bea.playerId }, ada.token);
    const hostBack = await recover(await issueCode(ada));
    const cohostBack = await recover(await issueCode(bea));
    const newAda: Player = { name: "Ada", playerId: ada.playerId, token: hostBack.body["sessionToken"] as string };
    const newBea: Player = { name: "Bea", playerId: bea.playerId, token: cohostBack.body["sessionToken"] as string };
    expect(h.engine().hostId).toBe(ada.playerId);
    expect(((await h.projection(newAda))["me"] as Json)).toMatchObject({ isHost: true, isCohost: false });
    expect(((await h.projection(newBea))["me"] as Json)).toMatchObject({ isHost: false, isCohost: true });
    // The recovering devices connect, as the app does right after recovery.
    await h.connect(newAda);
    await h.connect(newBea);
    expect((await h.startGame(newAda, "trivia", { official: false })).status).toBe(201);
    expect((await h.startGame(ada, "trivia", { official: false })).status).toBe(401); // the old host credential is dead
    expect(((await h.projection(cal))["me"] as Json)).toMatchObject({ isHost: false, isCohost: false }); // nobody else gained anything
  });

  it("36. a recovery whose save fails is NOT reported as successful and changes nothing", async () => {
    const bea = (await h.join("Ada", { host: true }), await h.join("Bea"));
    const code = await issueCode(bea);
    const file = join(h.dataDir, `${h.roomId}.json`);
    rmSync(file);
    mkdirSync(file); // the next save cannot replace a directory
    const r = await recover(code);
    expect(r.status).toBe(500);
    expect(r.body["sessionToken"]).toBeUndefined();
    rmSync(file, { recursive: true });
    // In memory, everything was rolled back: old credential and the same code still work.
    expect(await sessionOk(bea.token)).toBe(true);
    expect(h.engine().ledger.some((e) => e.type === "seat-recovered")).toBe(false);
    expect((await recover(code)).status).toBe(200);
  });
});

describe("host-assisted recovery", () => {
  async function requestSeat(playerId: string) {
    const seats = await h.post("/rooms/recovery-requests/seats", { joinCode: h.joinCode });
    expect((seats.body["seats"] as Json[]).map((s) => s["playerId"])).toContain(playerId);
    const r = await h.post("/rooms/recovery-requests", { joinCode: h.joinCode, playerId });
    expect(r.status).toBe(201);
    return r.body as { requestId: string; requestSecret: string; matchCode: string };
  }
  const collect = (req: { requestId: string; requestSecret: string }, secret = req.requestSecret) =>
    fetch(`${h.base}/rooms/recovery-requests/${req.requestId}/status`, { method: "POST", headers: { "x-recovery-request-secret": secret } }).then(async (r) => ({ status: r.status, body: (await r.json()) as Json }));
  const decide = (operator: Player, requestId: string, verb: "approve" | "deny", playerId?: string) => h.post(`/rooms/${h.roomId}/recovery-requests/${requestId}/${verb}`, { playerId }, operator.token);

  it("33. a second device recovers an exact seat after the host compares the match code and approves it", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const req = await requestSeat(bea.playerId);
    expect(req.matchCode).toMatch(/^\d{4}$/);
    expect((await collect(req)).body["status"]).toBe("pending");
    // The host sees the request, the seat and the match code, never the secret.
    const hostView = (await h.projection(ada))["recoveryRequests"] as Json[];
    expect(hostView).toEqual([expect.objectContaining({ requestId: req.requestId, playerId: bea.playerId, displayName: "Bea", matchCode: req.matchCode })]);
    expect(JSON.stringify(await h.projection(ada))).not.toContain(req.requestSecret);
    const approved = await decide(ada, req.requestId, "approve", bea.playerId);
    expect(approved.status).toBe(200);
    expect(JSON.stringify(approved.body)).not.toMatch(/token|code/i); // the host never receives a credential
    const got = await collect(req);
    expect(got.body).toMatchObject({ status: "recovered", playerId: bea.playerId, displayName: "Bea" });
    expect(await sessionOk(got.body["sessionToken"] as string)).toBe(true);
    expect(await sessionOk(bea.token)).toBe(false);
    expect((await collect(req)).status).toBe(404); // single use
    expect(h.engine().players.size).toBe(2);
  });

  it("34. unauthorized or careless approvals are refused", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const cal = await h.join("Cal");
    const req = await requestSeat(bea.playerId);
    expect((await decide(cal, req.requestId, "approve", bea.playerId)).status).toBe(403); // a regular player
    expect((await decide(ada, req.requestId, "approve", cal.playerId)).status).toBe(400); // the wrong seat
    expect((await decide(ada, req.requestId, "approve")).status).toBe(400); // no seat named
    expect((await collect(req, "f".repeat(64))).status).toBe(404); // someone else's device
    expect((await collect(req)).body["status"]).toBe("pending"); // still nothing granted
    const own = await requestSeat(ada.playerId);
    expect((await decide(ada, own.requestId, "approve", ada.playerId)).status).toBe(400); // own seat
    const denied = await requestSeat(cal.playerId);
    expect((await decide(ada, denied.requestId, "deny")).status).toBe(200);
    expect((await collect(denied)).body["status"]).toBe("denied");
    expect(await sessionOk(cal.token)).toBe(true);
  });

  it("requests expire, are rate-limited per device, and recovering a seat never needs (or accepts) a name", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const req = await requestSeat(bea.playerId);
    h.clock.advance(10 * 60_000);
    expect((await collect(req)).status).toBe(404);
    expect((await decide(ada, req.requestId, "approve", bea.playerId)).status).toBe(404);
    expect((await h.post("/rooms/recovery-requests", { joinCode: h.joinCode, playerId: "Bea" })).status).toBe(404); // a name is not a seat
    for (let i = 0; i < 3; i++) await h.post("/rooms/recovery-requests", { joinCode: h.joinCode, playerId: bea.playerId });
    expect((await h.post("/rooms/recovery-requests", { joinCode: h.joinCode, playerId: bea.playerId })).status).toBe(429);
  });

  it("a cohost can restore the host's own seat: the role is the seat's, and the room is told who did it", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    await h.post(`/rooms/${h.roomId}/cohost`, { targetId: bea.playerId }, ada.token);
    const req = await requestSeat(ada.playerId);
    expect((await decide(bea, req.requestId, "approve", ada.playerId)).status).toBe(200);
    const got = await collect(req);
    const newAda: Player = { name: "Ada", playerId: ada.playerId, token: got.body["sessionToken"] as string };
    expect(((await h.projection(newAda))["me"] as Json)["isHost"]).toBe(true);
    expect(h.engine().hostId).toBe(ada.playerId);
    expect(((await h.projection(bea))["me"] as Json)["isHost"]).toBe(false); // the approver gained nothing
    const notice = ((await h.tv())["notices"] as Json[])[0]!;
    expect(notice).toMatchObject({ displayName: "Ada", method: "host", byName: "Bea" });
  });
});

describe("35. accountability and secrecy", () => {
  it("every recovery is a ledger event and a visible room notice; no code, token or secret ever appears to anyone", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const cal = await h.join("Cal");
    const code = await issueCode(bea);
    const r = await recover(code);
    const newBea: Player = { name: "Bea", playerId: bea.playerId, token: r.body["sessionToken"] as string };
    const ev = h.engine().ledger.filter((e) => e.type === "seat-recovered");
    expect(ev).toEqual([expect.objectContaining({ playerId: bea.playerId, detail: expect.objectContaining({ method: "code" }) })]);
    // Visible to the room (players and TV), so a wrong recovery can be questioned.
    for (const view of [await h.projection(ada), await h.projection(cal), await h.tv()]) {
      expect((view["notices"] as Json[]).map((n) => [n["displayName"], n["method"]])).toEqual([["Bea", "code"]]);
    }
    await waitFor(() => (((ada.lastPush?.["notices"] as Json[]) ?? []).length === 1));
    // Secrecy: nothing a client or log can see contains the codes or tokens.
    const visible = await everythingVisible([ada, cal, newBea]);
    for (const secret of [code, code.replace(/-/g, ""), r.body["recoveryCode"] as string, (r.body["recoveryCode"] as string).replace(/-/g, ""), r.body["sessionToken"] as string, bea.token]) {
      expect(visible).not.toContain(secret);
    }
    // Whether someone saved a code is their business: hidden from others' ledgers.
    const adaLedger = (await h.get(`/rooms/${h.roomId}/ledger`, { "x-session-token": ada.token })).body as unknown as Json[];
    expect(adaLedger.some((e) => e["type"] === "recovery-code-issued")).toBe(false);
  });

  it("spectators and the TV cannot recover anything and see no requests", async () => {
    await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    await h.post("/rooms/recovery-requests", { joinCode: h.joinCode, playerId: bea.playerId });
    const spec = await h.post("/rooms/spectate-by-code", { joinCode: h.joinCode });
    const specView = await h.get(`/rooms/${h.roomId}/projection?audience=spectator`, { "x-spectator-token": spec.body["spectatorToken"] as string });
    expect(specView.body["recoveryRequests"]).toBeUndefined();
    expect((await h.tv())["recoveryRequests"]).toBeUndefined();
    expect((await h.projection(bea))["recoveryRequests"]).toBeUndefined(); // not an operator
    expect((await recover(spec.body["spectatorToken"] as string)).status).toBe(400);
  });
});

describe("38/39/40. persistence compatibility", () => {
  it("legacy rooms without the new fields load, and their players can get codes and recover", async () => {
    const ada = await h.join("Ada", { host: true });
    const slot = h.engine().players.get(ada.playerId)!;
    delete slot.credentialVersion; delete slot.recoveryCodeHash; delete slot.disconnectedAt;
    await h.restart();
    expect(h.server.restoreReport.failed).toEqual([]);
    const r = await recover(await issueCode(ada));
    expect(r.status).toBe(200);
    expect(h.engine().players.get(ada.playerId)!.credentialVersion).toBe(1);
  });

  it("a restart while a player is away keeps their seat and game roster; their WebSocket can come back", async () => {
    const ada = await h.join("Ada", { host: true });
    const bea = await h.join("Bea");
    const gid = (await h.startGame(ada, "trivia", { seed: 3 })).body["gameId"] as string;
    await h.disconnect(bea);
    await h.restart();
    expect(h.game(gid).players).toEqual([ada.playerId, bea.playerId]);
    expect(h.engine().presenceOf(bea.playerId)).toBe("reconnecting");
    const ws = await h.openSocket(bea);
    expect(h.engine().presenceOf(bea.playerId)).toBe("connected");
    ws.terminate();
  });
});

// Keep the WebSocket import used for type-only helpers in some environments.
void WebSocket;
