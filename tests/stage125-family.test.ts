/**
 * Stage 12.5 (docs/stage12/stage125.md): Family Questions. Questions the family writes about itself, kept secret until
 * they're played (D-S125-01), picked fairly at the start (D-S125-02), moderated without reading them (D-S125-03), and
 * played like Trivia: 100 for a right answer, a "great question" bonus for the writer, the writer never answers their own.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { FAMILY_POINTS, FAMILY_ROUNDS_MAX, familyRoundResult, pickFamilyQuestions, type FamilyState } from "../src/games/modules/family.js";
import { FAMILY_LIMITS, checkFamilyQuestion } from "../src/shared/familyPack.js";
import { FamilyRefused, RoomEngine, StartRefused } from "../src/server/room.js";
import { NOT_IN_QUICK_PARTY, partyPool } from "../src/games/party.js";
import { policyFor } from "../src/server/lifecycle.js";
import { FakeClock, Harness, type Player } from "./helpers/harness.js";
import { NOT_FEATURED, featuredOfTheDay } from "../apps/web/src/ui/mchezo/lib/catalog.js";
import { GAME_MANIFESTS } from "../src/games/manifest.js";

type Json = Record<string, unknown>;
const T0 = 1_800_000_000_000;

function setup(n = 3, kind: "casual" | "cup" = "casual") {
  const engine = new RoomEngine("Family night", { kind, timing: 2 });
  let t = T0;
  engine.clock = () => t;
  const names = ["Keku", "Amina", "Baraka", "Wanjiru", "Otieno"];
  const ids = [engine.join(names[0]!, { asHost: true }).player.id];
  for (let i = 1; i < n; i++) ids.push(engine.join(names[i]!).player.id);
  const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
  /** Run the clock to the open phase's deadline (one phase ends; nothing else). */
  const nextPhase = (gid: string) => { const d = engine.games.get(gid)!.phaseDeadlineAt; expect(d).toBeDefined(); t = d! + 1; engine.tick(t); };
  return { engine, ids, send, nextPhase };
}
type Env = ReturnType<typeof setup>;

/** A choice question with a canary in its prompt and answers, so a leak shows up in any JSON. */
const choice = (tag: string, right = 0) => ({ kind: "choice" as const, prompt: `Where was Bibi born ${tag}?`, options: [`Nairobi ${tag}`, `Mombasa ${tag}`, `Kisumu ${tag}`], correctIndex: right });

function start(env: Env, opts: { proceedWithout?: string[] } = {}): { gid: string; st: () => FamilyState } {
  const g = env.engine.startGame(env.ids[0]!, "family-questions", { official: false, seed: 7, ...opts });
  for (const p of env.ids) expect(env.send(p, g.id, "briefing-ready", { ready: true }).accepted).toBe(true);
  const game = env.engine.games.get(g.id)!;
  expect(game.status).toBe("playing");
  return { gid: g.id, st: () => game.extra as FamilyState };
}
const views = (proj: Json, gid: string): Json[] =>
  [...((proj["games"] as Json[] | undefined) ?? []), ...((proj["myGames"] as Json[] | undefined) ?? [])].filter((g) => g["id"] === gid);

describe("a question's check (pure, shared by server and phones)", () => {
  it("tidies and checks choice and who questions", () => {
    expect(checkFamilyQuestion({ kind: "choice", prompt: "  Who   cooks?  ", options: [" Mum ", "Dad"], correctIndex: 1 }, [])).toEqual({ ok: true, question: { kind: "choice", prompt: "Who cooks?", options: ["Mum", "Dad"], correctIndex: 1 } });
    const bad = (input: Parameters<typeof checkFamilyQuestion>[0], players: string[] = []) => { const r = checkFamilyQuestion(input, players); return r.ok ? "ok" : r.error; };
    expect(bad({ kind: "choice", prompt: " ", options: ["a", "b"], correctIndex: 0 })).toBe("Write the question first.");
    expect(bad({ kind: "choice", prompt: "x".repeat(FAMILY_LIMITS.prompt + 1), options: ["a", "b"], correctIndex: 0 })).toMatch(/140 characters/);
    expect(bad({ kind: "choice", prompt: "Q", options: ["a", " "], correctIndex: 0 })).toMatch(/Fill in every answer/);
    expect(bad({ kind: "choice", prompt: "Q", options: ["a"], correctIndex: 0 })).toMatch(/2 to 4 answers/);
    expect(bad({ kind: "choice", prompt: "Q", options: ["a", "b", "c", "d", "e"], correctIndex: 0 })).toMatch(/2 to 4 answers/);
    expect(bad({ kind: "choice", prompt: "Q", options: ["Tea", "tea"], correctIndex: 0 })).toMatch(/must be different/);
    expect(bad({ kind: "choice", prompt: "Q", options: ["a", "b"], correctIndex: 2 })).toMatch(/Mark the right answer/);
    expect(bad({ kind: "choice", prompt: "Q", options: ["a", "x".repeat(61)], correctIndex: 0 })).toMatch(/60 characters/);
    expect(bad({ kind: "who", prompt: "Who snores?", answerPlayerId: "p9" }, ["p1"])).toBe("Pick who the answer is.");
    expect(bad({ kind: "who", prompt: "Who snores?", answerPlayerId: "p1" }, ["p1"])).toBe("ok");
  });

  it("a game takes turns between writers, up to the most a game holds, in a seeded order", () => {
    const ready = [...Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, authorId: "A" })), { id: "b0", authorId: "B" }, { id: "b1", authorId: "B" }, { id: "c0", authorId: "C" }];
    const picked = pickFamilyQuestions(ready, 3);
    expect(picked).toHaveLength(FAMILY_ROUNDS_MAX);
    // B's two and C's one are all in: one keen writer doesn't fill the game.
    expect(picked.filter((q) => q.authorId !== "A").map((q) => q.id).sort()).toEqual(["b0", "b1", "c0"]);
    expect(pickFamilyQuestions(ready, 3)).toEqual(picked);
    expect(pickFamilyQuestions(ready, 4).map((q) => q.id)).not.toEqual(picked.map((q) => q.id));
  });

  it("scoring: 100 a right answer; the writer's bonus only when some but not all got it; a skipped question scores nothing", () => {
    const s: FamilyState = { players: ["A", "B", "C"], questions: [{ id: "q", authorId: "A", authorName: "A", kind: "choice", prompt: "?", options: ["x", "y"], correctIndex: 0 }], round: 0, phase: "reveal", answers: { 0: { B: 0, C: 1 } }, skipped: {}, hostSkipped: [] };
    expect(familyRoundResult(s, 0).points).toEqual({ B: FAMILY_POINTS.right, A: FAMILY_POINTS.greatQuestion });
    s.answers[0] = { B: 0, C: 0 };
    expect(familyRoundResult(s, 0)).toMatchObject({ greatQuestion: false, points: { B: 100, C: 100 } });
    s.answers[0] = { B: 1, C: 1 };
    expect(familyRoundResult(s, 0)).toMatchObject({ greatQuestion: false, points: {} });
    s.answers[0] = { B: 0 };
    s.hostSkipped = [0];
    expect(familyRoundResult(s, 0).points).toEqual({});
  });
});

describe("writing questions (D-S125-01)", () => {
  it("any player of a casual room adds; refused in a Cup, for strangers, when invalid, and past the per-writer limit", () => {
    const cup = setup(2, "cup");
    expect(() => cup.engine.addFamilyQuestion(cup.ids[0]!, choice("x"))).toThrow(FamilyRefused);
    const env = setup(2);
    expect(() => env.engine.addFamilyQuestion("nobody", choice("x"))).toThrowError(/Only players/);
    expect(() => env.engine.addFamilyQuestion(env.ids[1]!, { kind: "choice", prompt: "", options: ["a", "b"], correctIndex: 0 })).toThrowError(/Write the question/);
    for (let i = 0; i < FAMILY_LIMITS.perAuthor; i++) env.engine.addFamilyQuestion(env.ids[1]!, choice(`n${i}`));
    try { env.engine.addFamilyQuestion(env.ids[1]!, choice("over")); expect.unreachable(); } catch (e) { expect((e as FamilyRefused).code).toBe("TOO_MANY"); }
    // The limit is per writer: the host can still add.
    expect(env.engine.addFamilyQuestion(env.ids[0]!, choice("host")).authorId).toBe(env.ids[0]);
  });

  it("secret until played: a writer sees only their own; others and the TV see counts per writer, never a word of a question", () => {
    const env = setup(3);
    const [host, amina, baraka] = env.ids as [string, string, string];
    env.engine.addFamilyQuestion(amina, choice("CANARY-A1"));
    env.engine.addFamilyQuestion(amina, choice("CANARY-A2"));
    env.engine.addFamilyQuestion(baraka, { kind: "who", prompt: "Who CANARY-B1 snores?", answerPlayerId: host });
    const tv = env.engine.project("tv");
    expect(JSON.stringify(tv)).not.toMatch(/CANARY/);
    expect(tv["family"]).toEqual({ ready: 3, needed: 3, writers: [{ playerId: amina, count: 2 }, { playerId: baraka, count: 1 }] });
    const hostProj = env.engine.project("player", host);
    expect(JSON.stringify(hostProj)).not.toMatch(/CANARY/); // not even the host
    expect((hostProj["family"] as Json)["mine"]).toEqual([]);
    const aminaProj = JSON.stringify(env.engine.project("player", amina));
    expect(aminaProj).toMatch(/CANARY-A1/);
    expect(aminaProj).not.toMatch(/CANARY-B1/);
    const mine = (env.engine.project("player", baraka)["family"] as Json)["mine"] as Json[];
    expect(mine).toEqual([expect.objectContaining({ kind: "who", prompt: "Who CANARY-B1 snores?", answerPlayerId: host, played: false })]);
  });

  it("a writer takes back their own unplayed question; nobody else's; the host removes a writer's unplayed questions unread", () => {
    const env = setup(3);
    const [host, amina, baraka] = env.ids as [string, string, string];
    const q = env.engine.addFamilyQuestion(amina, choice("1"));
    env.engine.addFamilyQuestion(amina, choice("2"));
    env.engine.addFamilyQuestion(baraka, choice("3"));
    expect(() => env.engine.deleteFamilyQuestion(baraka, q.id)).toThrowError(/isn't one of yours/);
    env.engine.deleteFamilyQuestion(amina, q.id);
    expect(env.engine.familyQuestions.map((x) => x.prompt)).toEqual([choice("2").prompt, choice("3").prompt]);
    expect(() => env.engine.removeFamilyAuthor(baraka, amina)).toThrowError(/host or a cohost/);
    expect(env.engine.removeFamilyAuthor(host, amina)).toBe(1);
    expect(env.engine.familyQuestions.map((x) => x.authorId)).toEqual([baraka]);
    expect(env.engine.ledger.filter((e) => e.type === "family-questions-removed")).toHaveLength(1);
    // The ledger records that questions were added and removed, never what they said.
    expect(JSON.stringify(env.engine.ledger)).not.toMatch(/Bibi/);
  });
});

describe("playing (D-S125-02)", () => {
  it("needs 3 questions ready; never auto-picked by Quick Party; casual only and never official", () => {
    const env = setup(3);
    env.engine.addFamilyQuestion(env.ids[1]!, choice("1"));
    env.engine.addFamilyQuestion(env.ids[2]!, choice("2"));
    try { env.engine.startGame(env.ids[0]!, "family-questions", { official: false }); expect.unreachable(); } catch (e) {
      expect(e).toBeInstanceOf(StartRefused);
      expect([(e as StartRefused).code, (e as StartRefused).detail]).toEqual(["FAMILY_TOO_FEW", { ready: 2, needed: 3 }]);
    }
    expect(env.engine.games.size).toBe(0);
    expect(NOT_IN_QUICK_PARTY.has("family-questions")).toBe(true);
    expect(partyPool(4).map((i) => i.gameId)).not.toContain("family-questions");
    expect(policyFor("family-questions").officialEligible).toBe(false);
    const cup = setup(3, "cup");
    expect(() => cup.engine.startGame(cup.ids[0]!, "family-questions", { official: false })).toThrow(StartRefused);
  });

  it("a whole game: the writer sits out their own question; the answer and the writer stay hidden until the reveal; scores add up", () => {
    const env = setup(3);
    const [host, amina, baraka] = env.ids as [string, string, string];
    env.engine.addFamilyQuestion(amina, choice("QA", 1));
    env.engine.addFamilyQuestion(baraka, choice("QB", 2));
    env.engine.addFamilyQuestion(host, { kind: "who", prompt: "Who QH snores?", answerPlayerId: baraka });
    const m = start(env);
    const st = m.st();
    expect(st.questions).toHaveLength(3);
    // The "who" options are this game's players by name, and the right one is Baraka.
    const who = st.questions.find((q) => q.kind === "who")!;
    expect(who.options).toEqual(["Keku", "Amina", "Baraka"]);
    expect(who.options[who.correctIndex]).toBe("Baraka");
    // The questions are now played (and no longer count as ready).
    expect(env.engine.familyQuestions.every((q) => q.playedIn === m.gid)).toBe(true);
    expect((env.engine.project("tv")["family"] as Json)["ready"]).toBe(0);
    for (let r = 0; r < 3; r++) {
      const q = st.questions[r]!;
      expect(st.round).toBe(r);
      // While it's open: no answer, no writer, on any screen.
      for (const proj of [env.engine.project("tv"), ...env.ids.map((p) => env.engine.project("player", p))]) {
        for (const v of views(proj, m.gid)) {
          const s = v["state"] as Json;
          expect(s["result"]).toBeUndefined();
          expect(JSON.stringify(s)).not.toMatch(/askedBy|correctIndex|authorId/);
        }
      }
      // Progress counts only those who can answer (the writer can't): "0 of 2", never "0 of 3".
      expect(views(env.engine.project("tv"), m.gid)[0]!["progress"]).toMatchObject({ answeredNow: 0, total: 2 });
      const authorView = views(env.engine.project("player", q.authorId), m.gid).find((v) => (v["state"] as Json)["myQuestion"] !== undefined)!;
      expect((authorView["state"] as Json)["myQuestion"]).toBe(true);
      expect(env.send(q.authorId, m.gid, "family-answer", { round: r, choice: 0 })).toMatchObject({ accepted: false, reason: "YOUR_QUESTION" });
      const others = env.ids.filter((p) => p !== q.authorId);
      // The first other player answers right, the second wrong: a great question.
      expect(env.send(others[0]!, m.gid, "family-answer", { round: r, choice: q.correctIndex })).toMatchObject({ accepted: true });
      expect(env.send(others[0]!, m.gid, "family-answer", { round: r, choice: q.correctIndex })).toMatchObject({ accepted: false });
      expect(env.send(others[1]!, m.gid, "family-answer", { round: r, choice: (q.correctIndex + 1) % q.options.length })).toMatchObject({ accepted: true });
      expect(st.phase).toBe("reveal");
      const tvState = views(env.engine.project("tv"), m.gid)[0]!["state"] as Json;
      expect(tvState["result"]).toMatchObject({ correctIndex: q.correctIndex, askedBy: q.authorId, askedByName: q.authorName, greatQuestion: true, right: [others[0]] });
      env.nextPhase(m.gid); // the reveal ends: the next question (or the end)
    }
    const game = env.engine.games.get(m.gid)!;
    expect(game.status).toBe("finished");
    // Each player: right once on each of the two questions they answered first or second... recompute from the rule.
    const expected: Record<string, number> = Object.fromEntries(env.ids.map((p) => [p, 0]));
    for (let r = 0; r < 3; r++) for (const [p, pts] of Object.entries(familyRoundResult(st, r).points)) expected[p] = (expected[p] ?? 0) + pts;
    expect(game.rawScores).toEqual(expected);
    expect(Object.values(expected).reduce((a, b) => a + b, 0)).toBe(3 * (FAMILY_POINTS.right + FAMILY_POINTS.greatQuestion));
    expect(game.official).toBe(false);
    // The finished game shows every round.
    expect(((views(env.engine.project("tv"), m.gid)[0]!["state"] as Json)["rounds"] as Json[])).toHaveLength(3);
  });

  it("the host or a cohost skips an unkind question: never revealed, never scored; a player can't", () => {
    const env = setup(3);
    const [host, amina, baraka] = env.ids as [string, string, string];
    env.engine.addFamilyQuestion(amina, choice("S1"));
    env.engine.addFamilyQuestion(baraka, choice("S2"));
    env.engine.addFamilyQuestion(amina, choice("S3"));
    const m = start(env);
    const first = m.st().questions[0]!;
    const answerer = env.ids.find((p) => p !== first.authorId)!;
    expect(env.send(answerer, m.gid, "family-answer", { round: 0, choice: first.correctIndex })).toMatchObject({ accepted: true });
    const notHost = [amina, baraka].find((p) => p !== host)!;
    expect(env.send(notHost, m.gid, "family-skip", { round: 0 })).toMatchObject({ accepted: false, reason: "NOT_HOST" });
    expect(env.send(host, m.gid, "family-skip", { round: 1 })).toMatchObject({ accepted: false, reason: "STALE_ROUND" });
    expect(env.send(host, m.gid, "family-skip", { round: 0 })).toMatchObject({ accepted: true });
    expect(m.st()).toMatchObject({ round: 1, phase: "answer", hostSkipped: [0] });
    expect(m.st().answers[0]).toBeUndefined();
    expect((views(env.engine.project("tv"), m.gid)[0]!["state"] as Json)["skippedRounds"]).toBe(1);
    // Played out: the skipped round shows only that it was skipped.
    for (let i = 0; i < 4; i++) env.nextPhase(m.gid); // round 2: answer, reveal; round 3: answer, reveal
    const game = env.engine.games.get(m.gid)!;
    expect(game.status).toBe("finished");
    const rounds = (views(env.engine.project("tv"), m.gid)[0]!["state"] as Json)["rounds"] as Json[];
    expect(rounds[0]).toEqual({ skipped: true });
    expect(Object.values(game.rawScores ?? {}).every((v) => v === 0)).toBe(true);
  });

  it("a who question whose answer isn't in this game waits for another; a cancelled briefing frees its questions", () => {
    const env = setup(3);
    const [host, amina, baraka] = env.ids as [string, string, string];
    const late = env.engine.join("Wanjiru").player.id;
    env.engine.addFamilyQuestion(amina, { kind: "who", prompt: "Who is late?", answerPlayerId: late });
    env.engine.disconnect(late); // Wanjiru steps out before the game starts
    env.engine.addFamilyQuestion(amina, choice("1"));
    env.engine.addFamilyQuestion(baraka, choice("2"));
    env.engine.addFamilyQuestion(host, choice("3"));
    const g = env.engine.startGame(host, "family-questions", { official: false, seed: 1, proceedWithout: [late] });
    expect(env.engine.games.get(g.id)!.players).toEqual([host, amina, baraka]);
    expect((env.engine.games.get(g.id)!.extra as FamilyState).questions.map((q) => q.kind)).not.toContain("who");
    expect(env.engine.familyQuestions.find((q) => q.kind === "who")!.playedIn).toBeUndefined();
    expect((env.engine.project("tv")["family"] as Json)["ready"]).toBe(1);
    env.engine.cancelBriefing(host, g.id);
    expect((env.engine.project("tv")["family"] as Json)["ready"]).toBe(4);
    // A played question can't be taken back.
    const m = start({ ...env, ids: [host, amina, baraka] }, { proceedWithout: [late] });
    const played = env.engine.familyQuestions.find((q) => q.playedIn === m.gid && q.authorId === amina)!;
    expect(() => env.engine.deleteFamilyQuestion(amina, played.id)).toThrowError(/played already/);
  });

  it("saved with the room: questions and their played state survive a restart; an unreadable one is left out", () => {
    const env = setup(3);
    env.engine.addFamilyQuestion(env.ids[1]!, choice("1"));
    env.engine.addFamilyQuestion(env.ids[2]!, { kind: "who", prompt: "Who?", answerPlayerId: env.ids[0]! });
    const snap = JSON.parse(JSON.stringify(env.engine.toJSON())) as Json;
    const restored = RoomEngine.fromJSON(snap);
    expect(restored.familyQuestions).toEqual(env.engine.familyQuestions);
    (snap["familyQuestions"] as Json[]).push({ id: "bad", authorId: env.ids[1], kind: "choice", prompt: "Broken", options: ["only one"], correctIndex: 0, createdAt: T0 }, { nope: true });
    expect(RoomEngine.fromJSON(snap).familyQuestions).toHaveLength(2);
    // The saved room keeps the questions; no projection carries the list.
    expect(JSON.stringify(env.engine.project("tv"))).not.toContain("familyQuestions");
  });
});

describe("Home's featured game", () => {
  it("never Family Questions (it needs written questions first) or Team Huddle (Stage 12.8); the others' rotation is unchanged", () => {
    const catalog = GAME_MANIFESTS.map((m) => ({ id: m.id })) as unknown as Parameters<typeof featuredOfTheDay>[0];
    const others = [...catalog].filter((g) => !NOT_FEATURED.has(g.id)).sort((a, b) => a.id.localeCompare(b.id));
    // Stage 12.8: Team Huddle stays out too, so the 16 others keep their days.
    expect(others).toHaveLength(16);
    for (let d = 0; d < 40; d++) {
      const day = new Date(2026, 10, 1 + d);
      const dayNumber = Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86_400_000);
      expect(featuredOfTheDay(catalog, day)?.id).toBe(others[dayNumber % others.length]!.id);
    }
  });
});

describe("over HTTP", () => {
  let h: Harness | null = null;
  afterEach(async () => { await h?.dispose(); h = null; });

  it("add, take back and remove; statuses; a reply never carries anyone else's question", async () => {
    h = new Harness(undefined, { clock: new FakeClock(), timing: 2 });
    await h.start();
    const r = await h.post("/rooms", { name: "Night", kind: "casual" });
    h.roomId = r.body["roomId"] as string;
    h.joinCode = r.body["joinCode"] as string;
    h.hostClaimToken = r.body["hostClaimToken"] as string;
    const host: Player = await h.join("Keku", { host: true });
    const amina: Player = await h.join("Amina");
    const add = (p: Player, body: unknown) => h!.post(`/rooms/${h!.roomId}/family`, body, p.token);
    const a = await add(amina, choice("SECRET-A"));
    expect(a.status).toBe(200);
    const qid = (a.body["question"] as Json)["id"] as string;
    const hostAdd = await add(host, choice("SECRET-H"));
    expect(JSON.stringify(hostAdd.body)).not.toMatch(/SECRET-A/);
    expect((await add(amina, { kind: "choice", prompt: "Q", options: ["a"], correctIndex: 0 })).status).toBe(400);
    expect((await add(amina, { kind: "riddle", prompt: "Q" })).status).toBe(400);
    expect((await add(amina, { ...choice("x"), extra: 1 })).status).toBe(400);
    expect((await h.post(`/rooms/${h.roomId}/family`, choice("anon"))).status).toBe(401);
    expect((await h.post(`/rooms/${h.roomId}/family/${qid}/delete`, {}, host.token)).status).toBe(404);
    expect((await h.post(`/rooms/${h.roomId}/family/author/${host.playerId}/remove`, {}, amina.token)).status).toBe(403);
    const removed = await h.post(`/rooms/${h.roomId}/family/author/${amina.playerId}/remove`, {}, host.token);
    expect([removed.status, removed.body["removed"]]).toEqual([200, 1]);
    expect(JSON.stringify(removed.body)).not.toMatch(/SECRET-A/);
    const del = await h.post(`/rooms/${h.roomId}/family/${(hostAdd.body["question"] as Json)["id"]}/delete`, {}, host.token);
    expect([del.status, (del.body["family"] as Json)["ready"]]).toEqual([200, 0]);
    // Too few to start: a 409 with the counts.
    const s = await h.startGame(host, "family-questions", { official: false });
    expect([s.status, s.body["code"], s.body["ready"], s.body["needed"]]).toEqual([409, "FAMILY_TOO_FEW", 0, 3]);
    // Saved: a restart keeps them.
    await add(amina, choice("kept"));
    await h.restart();
    expect(h.engine().familyQuestions).toHaveLength(1);
  });
});
