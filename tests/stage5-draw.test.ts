/**
 * Stage 5: Draw & Guess — the pure module and the engine around it.
 * Practice-only; the word only on the drawer's phone; guesses checked on the
 * server and wrong ones never stored; bounded drawing data; rotation; a
 * drawer who disconnects runs out the clock.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DRAW_LIMITS, DRAW_MAX_TURNS, drawModule, drawTurnPoints, guessMatches, letterPattern, normalizeGuess, type DrawState,
} from "../src/games/modules/draw.js";
import { DRAW_PROMPTS } from "../src/games/modules/packs/draw-prompts.js";
import { RoomEngine } from "../src/server/room.js";

type Json = Record<string, unknown>;
const P = ["a", "b", "c", "d"];
const ctx = (now = 0, players = P) => ({ now, players, active: players, scale: 1 });
const word = (s: DrawState) => s.prompts[s.turns[s.turn]!.promptIdx]!.word;
const piece = (s = 1, n = 2) => ({ s, c: 0, w: 1, p: Array.from({ length: n * 2 }, (_, i) => (i * 37) % 1000) });

describe("Draw & Guess: guessing", () => {
  it("matching ignores case, accents, punctuation, spaces, a leading article and plurals; alternates count", () => {
    const snow = DRAW_PROMPTS.find((p) => p.word === "snowman")!;
    for (const g of ["Snowman", "  snow man ", "a snowman!", "SNOWMEN"].slice(0, 3)) expect(guessMatches(snow, g), g).toBe(true);
    expect(guessMatches(snow, "snowmen")).toBe(false); // irregular plurals are not guessed for you
    const candle = DRAW_PROMPTS.find((p) => p.word === "candle")!;
    expect(guessMatches(candle, "candles")).toBe(true);
    const sled = DRAW_PROMPTS.find((p) => p.word === "sled")!;
    expect(guessMatches(sled, "the Sledge")).toBe(true);
    expect(guessMatches(sled, "toboggans")).toBe(true);
    expect(guessMatches(sled, "slide")).toBe(false);
    expect(guessMatches(sled, "")).toBe(false);
    expect(normalizeGuess("Crème Brûlée")).toBe("cremebrulee");
    expect(letterPattern("hot air balloon")).toEqual([3, 3, 7]);
  });

  it("the pack: unique ids and words, every word matches itself, no word is another's alternate", () => {
    expect(new Set(DRAW_PROMPTS.map((p) => p.id)).size).toBe(DRAW_PROMPTS.length);
    expect(new Set(DRAW_PROMPTS.map((p) => normalizeGuess(p.word))).size).toBe(DRAW_PROMPTS.length);
    for (const p of DRAW_PROMPTS) expect(guessMatches(p, p.word)).toBe(true);
    for (const p of DRAW_PROMPTS) for (const q of DRAW_PROMPTS) if (p !== q) expect(guessMatches(q, p.word), `${p.word} vs ${q.word}`).toBe(false);
  });
});

describe("Draw & Guess module", () => {
  it("rotation: min(players, 6) turns, everyone draws once in a room of 6 or fewer; same seed, same game", () => {
    const s = drawModule.init({ players: P, seed: 4 });
    expect(s.turns).toHaveLength(4);
    expect(new Set(s.turns.map((t) => t.drawer))).toEqual(new Set(P));
    expect(drawModule.init({ players: P, seed: 4 })).toEqual(s);
    const ten = Array.from({ length: 10 }, (_, i) => `p${i}`);
    expect(drawModule.init({ players: ten, seed: 1 }).turns).toHaveLength(DRAW_MAX_TURNS);
  });

  it("privacy: the word only in the drawer's own view while drawing; everyone else gets the drawing and the letter pattern", () => {
    const s = drawModule.init({ players: P, seed: 2 });
    const drawer = s.turns[0]!.drawer;
    const guesser = P.find((p) => p !== drawer)!;
    const w = word(s);
    drawModule.intent(s, drawer, "draw-strokes", { pieces: [piece()] }, ctx());
    const pub = JSON.stringify(drawModule.publicView(s, { now: 0, scale: 1 }));
    expect(pub).not.toContain(w);
    expect(pub).toContain(`"pieces"`);
    expect(JSON.stringify(drawModule.playerView(s, guesser, { now: 0, scale: 1 }))).not.toContain(w);
    expect(drawModule.playerView(s, drawer, { now: 0, scale: 1 })["myWord"]).toBe(w);
    // A future turn's word is never in anyone's view.
    const next = s.prompts[s.turns[1]!.promptIdx]!.word;
    for (const p of P) expect(JSON.stringify(drawModule.playerView(s, p, { now: 0, scale: 1 }))).not.toContain(`"${next}"`);
  });

  it("a wrong guess is counted, never stored; right guesses score 100/80/60 in order and the drawer 50 each", () => {
    const s = drawModule.init({ players: P, seed: 3 });
    const t = s.turns[0]!;
    const [g1, g2, g3] = P.filter((p) => p !== t.drawer);
    expect(drawModule.intent(s, t.drawer, "draw-guess", { text: word(s) }, ctx())).toEqual({ ok: false, reason: "DRAWER_CANNOT_GUESS" });
    expect(drawModule.intent(s, g1!, "draw-guess", { text: "zebra crossing" }, ctx())).toEqual({ ok: true, result: { correct: false, order: undefined } });
    expect(JSON.stringify(s)).not.toContain("zebra");
    expect(t.guessCounts[g1!]).toBe(1);
    expect(drawModule.intent(s, g2!, "draw-guess", { text: word(s) }, ctx())).toEqual({ ok: true, result: { correct: true, order: 1 } });
    expect(drawModule.intent(s, g2!, "draw-guess", { text: word(s) }, ctx())).toEqual({ ok: false, reason: "ALREADY_ANSWERED" });
    drawModule.intent(s, g1!, "draw-guess", { text: word(s).toUpperCase() }, ctx());
    expect(s.phase).toBe("draw");
    drawModule.intent(s, g3!, "draw-guess", { text: `the ${word(s)}` }, ctx());
    expect(s.phase).toBe("reveal"); // everyone got it: the turn ends early
    expect(drawTurnPoints(t)).toEqual({ [g2!]: 100, [g1!]: 80, [g3!]: 60, [t.drawer]: 150 });
    const after = drawModule.publicView(s, { now: 0, scale: 1 }) as Json;
    expect((after["result"] as Json)["word"]).toBe(word(s));
  });

  it("limits: bad pieces, too much in one message, too many messages, too long a guess, too many guesses", () => {
    const s = drawModule.init({ players: P, seed: 5 });
    const t = s.turns[0]!;
    const g = P.find((p) => p !== t.drawer)!;
    const bad = [{ s: 1, c: 9, w: 0, p: [0, 0] }, { s: 1, c: 0, w: 0, p: [0, 1001] }, { s: 1, c: 0, w: 0, p: [1, 2, 3] }, { s: -1, c: 0, w: 0, p: [0, 0] }];
    for (const b of bad) expect(drawModule.intent(s, t.drawer, "draw-strokes", { pieces: [b] }, ctx()).ok, JSON.stringify(b)).toBe(false);
    expect(drawModule.intent(s, t.drawer, "draw-strokes", { pieces: [piece(1, DRAW_LIMITS.pointsPerMessage + 1)] }, ctx(10_000))).toEqual({ ok: false, reason: "PAYLOAD_TOO_LARGE" });
    expect(drawModule.intent(s, g, "draw-strokes", { pieces: [piece()] }, ctx())).toEqual({ ok: false, reason: "NOT_YOUR_TURN" });
    // The rate window: 16 messages in 2 s, then refused until the window moves on.
    const r = drawModule.init({ players: P, seed: 5 });
    const d = r.turns[0]!.drawer;
    for (let i = 0; i < DRAW_LIMITS.messagesPer2s; i++) expect(drawModule.intent(r, d, "draw-strokes", { pieces: [piece(i)] }, ctx(i * 10)).ok).toBe(true);
    expect(drawModule.intent(r, d, "draw-strokes", { pieces: [piece(99)] }, ctx(500))).toEqual({ ok: false, reason: "RATE_LIMITED" });
    expect(drawModule.intent(r, d, "draw-strokes", { pieces: [piece(99)] }, ctx(2500)).ok).toBe(true);
    expect(drawModule.intent(s, g, "draw-guess", { text: "x".repeat(DRAW_LIMITS.guessLength + 1) }, ctx())).toEqual({ ok: false, reason: "INVALID_PAYLOAD" });
    for (let i = 0; i < DRAW_LIMITS.guessesPerTurn; i++) drawModule.intent(s, g, "draw-guess", { text: `nope ${i}` }, ctx());
    expect(drawModule.intent(s, g, "draw-guess", { text: word(s) }, ctx())).toEqual({ ok: false, reason: "TOO_MANY_GUESSES" });
  });

  it("the drawing has a per-turn ceiling", () => {
    const s = drawModule.init({ players: P, seed: 6 });
    const d = s.turns[0]!.drawer;
    let n = 0, t = 0;
    while (n + 400 <= DRAW_LIMITS.pointsPerTurn) { expect(drawModule.intent(s, d, "draw-strokes", { pieces: [piece(n, 400)] }, ctx(t)).ok).toBe(true); n += 400; t += 1000; }
    expect(drawModule.intent(s, d, "draw-strokes", { pieces: [piece(n, 400)] }, ctx(t + 1000))).toEqual({ ok: false, reason: "DRAWING_FULL" });
  });

  it("undo removes the whole latest stroke (all its pieces); clear empties; a swap only before drawing", () => {
    const s = drawModule.init({ players: P, seed: 7 });
    const t = s.turns[0]!;
    const first = word(s);
    expect(drawModule.intent(s, t.drawer, "draw-swap", {}, ctx())).toEqual({ ok: true });
    expect(word(s)).not.toBe(first);
    expect(drawModule.intent(s, t.drawer, "draw-swap", {}, ctx())).toEqual({ ok: false, reason: "SWAP_NOT_AVAILABLE" });
    drawModule.intent(s, t.drawer, "draw-strokes", { pieces: [piece(1), piece(2)] }, ctx(0));
    drawModule.intent(s, t.drawer, "draw-strokes", { pieces: [piece(2)] }, ctx(100)); // stroke 2 continues
    drawModule.intent(s, t.drawer, "draw-undo", {}, ctx(200));
    expect(t.pieces.map((x) => x.s)).toEqual([1]);
    expect(t.points).toBe(2);
    drawModule.intent(s, t.drawer, "draw-clear", {}, ctx(300));
    expect(t.pieces).toEqual([]);
  });

  it("phases: draw → reveal → next drawer; time running out closes a turn with what was guessed; the last reveal finishes", () => {
    const s = drawModule.init({ players: P, seed: 8 });
    for (let i = 0; i < s.turns.length; i++) {
      expect(drawModule.phase(s)).toEqual({ key: `${i}:draw`, kind: "draw" });
      drawModule.expirePhase(s, ctx());
      expect(drawModule.phase(s)).toEqual({ key: `${i}:reveal`, kind: "reveal" });
      drawModule.expirePhase(s, ctx());
    }
    expect(drawModule.finished(s, ctx())).toBe(true);
    expect(drawModule.scores(s, P)).toEqual(Object.fromEntries(P.map((p) => [p, 0])));
  });

  it("skipping a turn and the drawer giving up both end the turn; right guesses before a give-up still score", () => {
    const s = drawModule.init({ players: P, seed: 9 });
    const t = s.turns[0]!;
    const [g1, g2, g3] = P.filter((p) => p !== t.drawer);
    drawModule.intent(s, g1!, "draw-guess", { text: word(s) }, ctx());
    expect(drawModule.abstain(s, g2!, ctx())).toEqual({ ok: true });
    expect(drawModule.intent(s, g2!, "draw-guess", { text: word(s) }, ctx())).toEqual({ ok: false, reason: "ALREADY_ABSTAINED" });
    expect(s.phase).toBe("draw");
    expect(drawModule.abstain(s, t.drawer, ctx())).toEqual({ ok: true });
    expect(s.phase).toBe("reveal");
    expect(drawModule.scores(s, P)).toMatchObject({ [g1!]: 100, [t.drawer]: 50, [g2!]: 0, [g3!]: 0 });
  });
});

describe("Draw & Guess: review fixes", () => {
  it("no swap once anything was drawn (even if cleared) or anyone guessed", () => {
    const s = drawModule.init({ players: P, seed: 11 });
    const t = s.turns[0]!;
    const g = P.find((p) => p !== t.drawer)!;
    drawModule.intent(s, t.drawer, "draw-strokes", { pieces: [piece()] }, ctx(0));
    drawModule.intent(s, t.drawer, "draw-clear", {}, ctx(100));
    expect(drawModule.intent(s, t.drawer, "draw-swap", {}, ctx(200))).toEqual({ ok: false, reason: "SWAP_NOT_AVAILABLE" });
    expect(drawModule.playerView(s, t.drawer, { now: 0, scale: 1 })["canSwap"]).toBe(false);
    const s2 = drawModule.init({ players: P, seed: 11 });
    const t2 = s2.turns[0]!;
    drawModule.intent(s2, g, "draw-guess", { text: "something else" }, ctx(0));
    expect(drawModule.intent(s2, t2.drawer, "draw-swap", {}, ctx(10))).toEqual({ ok: false, reason: "SWAP_NOT_AVAILABLE" });
  });

  it("who sat out stays private: no skip count, no 'passed' in any public view", () => {
    const s = drawModule.init({ players: ["a", "b", "c"], seed: 12 });
    const t = s.turns[0]!;
    const [g1] = ["a", "b", "c"].filter((p) => p !== t.drawer);
    drawModule.abstain(s, g1!, ctx(0, ["a", "b", "c"]));
    expect(JSON.stringify(drawModule.publicView(s, { now: 0, scale: 1 }))).not.toMatch(/skipped|gaveUp/);
    drawModule.abstain(s, t.drawer, ctx(0, ["a", "b", "c"]));
    expect(JSON.stringify(drawModule.publicView(s, { now: 0, scale: 1 }))).not.toMatch(/skipped|gaveUp|passed/);
    expect(drawModule.playerView(s, g1!, { now: 0, scale: 1 })["mySkipped"]).toBe(true); // your own phone knows
  });
});

describe("the intent replay store is bounded (S5-F)", () => {
  it("keeps at most SEEN_INTENTS_MAX, oldest first; a recent replay still returns its original result", () => {
    const engine = new RoomEngine("Cap room", { timing: 2 });
    const host = engine.join("Keku", { asHost: true }).player.id;
    const send = (id: string) => engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: id, roomId: engine.id, gameInstanceId: "none", action: "draw-guess", payload: { text: "x" } }, host);
    const firstId = randomUUID();
    send(firstId);
    let recent = "";
    let recentResult: unknown;
    for (let i = 0; i < RoomEngine.SEEN_INTENTS_MAX + 50; i++) { recent = randomUUID(); recentResult = send(recent); }
    const saved = (engine.toJSON() as Json)["seenIntents"] as [string, unknown][];
    expect(saved.length).toBe(RoomEngine.SEEN_INTENTS_MAX);
    expect(saved.some(([k]) => k.includes(firstId))).toBe(false); // the oldest went first
    expect(send(recent)).toBe(recentResult); // a recent replay returns the very same result
    expect(((engine.toJSON() as Json)["seenIntents"] as unknown[]).length).toBe(RoomEngine.SEEN_INTENTS_MAX);
    const back = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())));
    expect(((back.toJSON() as Json)["seenIntents"] as unknown[]).length).toBe(RoomEngine.SEEN_INTENTS_MAX);
  });
});

describe("Draw & Guess in the room engine", () => {
  const T0 = 1_800_000_000_000;
  function setup(n = 3) {
    const engine = new RoomEngine("DG room", { timing: 2 });
    let t = T0;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
    const send = (pid: string, gid: string, action: string, payload: Json = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    return { engine, ids, send, now: () => t, advance: (ms: number) => { t += ms; engine.tick(t); } };
  }
  function started(n = 3) {
    const x = setup(n);
    const g = x.engine.startGame(x.ids[0]!, "draw-guess", { official: false });
    for (const p of x.ids) x.send(p, g.id, "briefing-ready", { ready: true });
    expect(x.engine.games.get(g.id)!.status).toBe("playing");
    return { ...x, gid: g.id, st: () => x.engine.games.get(g.id)!.extra as DrawState };
  }

  it("is practice-only: an official start is refused with the reason", () => {
    const { engine, ids } = setup();
    expect(() => engine.startGame(ids[0]!, "draw-guess", { official: true })).toThrow(/practice-only/);
  });

  it("plays every turn to a finish; the TV sees the drawing, never the word until the reveal; a wrong guess never reaches any projection", () => {
    const { engine, send, gid, st, advance } = started(3);
    for (let i = 0; i < 3; i++) {
      const t = st().turns[i]!;
      const w = st().prompts[t.promptIdx]!.word;
      expect(send(t.drawer, gid, "draw-strokes", { pieces: [piece(1, 10)] }).accepted).toBe(true);
      const tv = JSON.stringify(engine.project("tv"));
      expect(tv).toContain(`"pieces"`);
      expect(tv).not.toContain(`"${w}"`);
      const [g1, g2] = st().players.filter((p) => p !== t.drawer);
      expect(send(g1!, gid, "draw-guess", { text: "definitely wrong" }).accepted).toBe(true);
      expect(JSON.stringify(engine.project("tv"))).not.toContain("definitely wrong");
      expect(JSON.stringify(engine.project("player", t.drawer))).not.toContain("definitely wrong");
      expect(JSON.stringify(engine.toJSON())).not.toContain("definitely wrong");
      send(g1!, gid, "draw-guess", { text: w });
      send(g2!, gid, "draw-guess", { text: w });
      expect(st().phase).toBe("reveal");
      expect(JSON.stringify(engine.project("tv"))).toContain(`"${w}"`);
      advance(9_000); // the reveal moves on
    }
    const g = engine.games.get(gid)!;
    expect(g.status).toBe("finished");
    expect(g.outcome?.countsOfficially).toBe(false);
    // Everyone drew once (2 correct guessers each: 100 + 80 to the guessers, 100 to the drawer).
    expect(Object.values(g.rawScores ?? {}).reduce((a, b) => a + b, 0)).toBe(3 * (100 + 80 + 100));
  });

  it("a drawer who disconnects: the turn runs out on the server clock and the next drawer is up, with nobody acting", () => {
    const { engine, st, advance } = started(3);
    const first = st().turns[0]!.drawer;
    engine.disconnect(first);
    advance(76_000); // the 75 s draw phase
    expect(st().phase).toBe("reveal");
    advance(9_000);
    expect(st().turn).toBe(1);
    expect(st().turns[1]!.drawer).not.toBe(first);
  });

  it("a restart mid-turn keeps the drawing and the correct guesses; the word stays private", () => {
    const { engine, send, gid, st, now } = started(3);
    const t = st().turns[0]!;
    const w = st().prompts[t.promptIdx]!.word;
    send(t.drawer, gid, "draw-strokes", { pieces: [piece(1, 5)] });
    const g1 = st().players.find((p) => p !== t.drawer)!;
    send(g1, gid, "draw-guess", { text: w });
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())));
    restored.clock = () => now();
    const rs = restored.games.get(gid)!.extra as DrawState;
    expect(rs.turns[0]!.pieces).toHaveLength(1);
    expect(rs.turns[0]!.correct).toEqual([g1]);
    expect(JSON.stringify(restored.project("tv"))).not.toContain(`"${w}"`);
  });
});
