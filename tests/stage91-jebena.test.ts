/**
 * Stage 9.1: Jebena Rush (docs/stage9/stage91.md). The bank and matcher,
 * game settings, the pure module, and the module in the room engine:
 * turns on the server clock, hearts, categories, the end and places, every
 * refusal (out of turn, stale, duplicate, late), privacy, Play again,
 * restart recovery and room isolation.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { JEBENA_BANK_VERSION, JEBENA_CATEGORIES } from "../src/games/modules/packs/jebena-banks.js";
import { bankReport, matchJebena } from "../src/games/modules/jebenaMatch.js";
import {
  JEBENA_GRACE_MS, JEBENA_MAX_ATTEMPTS, JEBENA_MAX_INPUT, JEBENA_TURN_MS, jebenaModule, jebenaPoints, jebenaStandings, type JebenaState,
} from "../src/games/modules/jebena.js";
import { JEBENA_DEFAULT_HEARTS, sameSettings, validateGameSettings } from "../src/games/settings.js";
import { policyFor } from "../src/server/lifecycle.js";
import { RoomEngine, SessionRefused, StartRefused } from "../src/server/room.js";
import { NOT_IN_QUICK_PARTY, partyPool, planParty } from "../src/games/party.js";
import { GAME_MANIFESTS, validateManifest } from "../src/games/manifest.js";

type Json = Record<string, unknown>;
const cat = (id: string) => JEBENA_CATEGORIES.find((c) => c.id === id)!;
const ctx = (now: number, players: string[] = ["a", "b", "c"]) => ({ now, players, active: players, scale: 1 });
/** An answer that is in the current category and not yet used (the test plays it on purpose). */
const unused = (s: JebenaState) => cat(s.category).answers.find((x) => !(s.used[s.category] ?? []).includes(x.id))!;
const answer = (s: JebenaState, who: string, text: string, now = 1) => jebenaModule.intent(s, who, "jebena-answer", { turn: s.turn!.n, text }, ctx(now, s.order));

describe("Jebena Rush bank (§7)", () => {
  it("six year-round categories, at least 40 canonical answers each, every id unique across the bank", () => {
    expect(JEBENA_CATEGORIES).toHaveLength(6);
    const ids = JEBENA_CATEGORIES.flatMap((c) => c.answers.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of JEBENA_CATEGORIES) {
      expect(c.answers.length, c.id).toBeGreaterThanOrEqual(40);
      expect(c.definition.length, c.id).toBeGreaterThan(10);
      expect(c.source.length, c.id).toBeGreaterThan(10);
    }
    expect(JEBENA_BANK_VERSION).toMatch(/^jr-bank-\d+$/);
  });

  it("the bank report: no form claimed by two answers, no not-accepted word that is also accepted, no duplicate ids", () => {
    for (const c of JEBENA_CATEGORIES) {
      const r = bankReport(c);
      expect(r.formCollisions, c.id).toEqual([]);
      expect(r.notAcceptedCollisions, c.id).toEqual([]);
      expect(r.duplicateIds, c.id).toEqual([]);
      expect(r.answers).toBe(c.answers.length);
    }
  });

  it("Countries in Africa is the 54-member closed set, Congo stays a deliberate near-miss", () => {
    expect(cat("jr-africa").answers).toHaveLength(54);
    expect(matchJebena(cat("jr-africa"), "Congo")).toMatchObject({ kind: "near-miss" });
  });
});

describe("Jebena Rush matching (§7)", () => {
  const animals = cat("jr-animals");
  const africa = cat("jr-africa");
  it("exact answers, whatever the case, spacing, accents, punctuation or a leading article", () => {
    for (const t of ["Giraffe", "  giraffe ", "GIRAFFE", "the giraffe", "a giraffe"]) expect(matchJebena(animals, t)).toMatchObject({ kind: "accepted", answerId: "jr-ani-giraffe" });
    expect(matchJebena(africa, "Côte d’Ivoire")).toMatchObject({ kind: "accepted", answerId: "jr-afr-cote-d-ivoire", via: "exact" });
    expect(matchJebena(africa, "sao tome and principe")).toMatchObject({ kind: "accepted", answerId: "jr-afr-sao-tome-and-principe" });
  });
  it("aliases and plurals use up the SAME canonical answer", () => {
    expect(matchJebena(animals, "hippopotamus")).toEqual({ kind: "accepted", answerId: "jr-ani-hippo", via: "alias" });
    expect(matchJebena(animals, "mice")).toEqual({ kind: "accepted", answerId: "jr-ani-mouse", via: "alias" });
    expect(matchJebena(animals, "Lions")).toEqual({ kind: "accepted", answerId: "jr-ani-lion", via: "plural" });
    expect(matchJebena(africa, "Ivory Coast")).toEqual({ kind: "accepted", answerId: "jr-afr-cote-d-ivoire", via: "alias" });
    expect(matchJebena(cat("jr-vegetables"), "eggplant")).toEqual({ kind: "accepted", answerId: "jr-veg-aubergine", via: "alias" });
  });
  it("a typo is accepted only when unambiguous: 6+ letters, one answer within one edit, no rival within two", () => {
    expect(matchJebena(africa, "Ethopia")).toEqual({ kind: "accepted", answerId: "jr-afr-ethiopia", via: "typo" });
    expect(matchJebena(animals, "kangaro")).toEqual({ kind: "accepted", answerId: "jr-ani-kangaroo", via: "typo" });
    expect(matchJebena(cat("jr-vegetables"), "brocoli")).toEqual({ kind: "accepted", answerId: "jr-veg-broccoli", via: "typo" });
  });
  it("near pairs and short words are AMBIGUOUS, never silently another answer", () => {
    for (const t of ["Nigera", "Nigerai", "Malwi"]) expect(matchJebena(africa, t)).toMatchObject({ kind: "ambiguous" }); // Niger/Nigeria, Mali/Malawi
    expect(matchJebena(animals, "monkee")).toMatchObject({ kind: "ambiguous" }); // monkey/donkey
    expect(matchJebena(animals, "cst")).toMatchObject({ kind: "ambiguous" }); // too short to guess (cat? bat? rat?)
    expect(matchJebena(animals, "elefant")).toMatchObject({ kind: "ambiguous" }); // two edits: "check the spelling", never accepted
  });
  it("anything else is 'not in this bank' (never 'wrong'); empty input is empty", () => {
    expect(matchJebena(animals, "spaceship")).toMatchObject({ kind: "not-in-bank" });
    expect(matchJebena(animals, "   ")).toEqual({ kind: "empty" });
    expect(matchJebena(animals, "!!!")).toEqual({ kind: "empty" });
  });
});

describe("Jebena Rush settings (§6, D-S91-07)", () => {
  it("hearts are 3, 5 or 7, default 5; anything else is refused; other games take no settings", () => {
    expect(validateGameSettings("jebena-rush", undefined)).toEqual({ ok: true, settings: { hearts: JEBENA_DEFAULT_HEARTS } });
    for (const h of [3, 5, 7]) expect(validateGameSettings("jebena-rush", { hearts: h })).toEqual({ ok: true, settings: { hearts: h } });
    for (const bad of [{ hearts: 4 }, { hearts: "5" }, { hearts: 0 }, { hearts: 5, extra: 1 }, [5], "5"]) expect(validateGameSettings("jebena-rush", bad).ok).toBe(false);
    expect(validateGameSettings("trivia", undefined)).toEqual({ ok: true });
    expect(validateGameSettings("trivia", {})).toEqual({ ok: true });
    expect(validateGameSettings("trivia", { hearts: 5 }).ok).toBe(false);
    expect(sameSettings({ hearts: 5 }, { hearts: 5 })).toBe(true);
    expect(sameSettings({ hearts: 5 }, { hearts: 7 })).toBe(false);
    expect(sameSettings(undefined, undefined)).toBe(true);
  });
  it("the policy's turn phase is the shown turn plus the network grace; a 12-minute match limit; practice-only", () => {
    const p = policyFor("jebena-rush");
    expect(p.phaseMs?.turn).toBe(JEBENA_TURN_MS + JEBENA_GRACE_MS);
    expect(p.gameWindowMs).toBe(12 * 60_000);
    expect(p.officialEligible).toBe(false);
    expect(p.model).toBe("game-deadline");
  });
});

describe("Jebena Rush module: the rules (§3)", () => {
  it("init: a seeded seat order and category rotation, hearts from settings, the first seat holds the jebena", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 42, settings: { hearts: 3 } });
    const t = jebenaModule.init({ players: ["a", "b", "c"], seed: 42, settings: { hearts: 3 } });
    expect(s.order).toEqual(t.order);
    expect(s.rotation).toEqual(t.rotation);
    expect([...s.order].sort()).toEqual(["a", "b", "c"]);
    expect([...s.rotation].sort()).toEqual(JEBENA_CATEGORIES.map((c) => c.id).sort());
    expect(Object.values(s.per).every((p) => p.hearts === 3)).toBe(true);
    expect(s.turn).toEqual({ n: 1, player: s.order[0], attempts: 0 });
    expect(jebenaModule.phase(s)).toEqual({ key: "turn:1", kind: "turn" });
    expect(jebenaModule.init({ players: ["a", "b"], seed: 1 }).startHearts).toBe(JEBENA_DEFAULT_HEARTS);
    expect(jebenaModule.init({ players: ["a", "b"], seed: 1, settings: { hearts: 9 } }).startHearts).toBe(JEBENA_DEFAULT_HEARTS);
  });

  it("an accepted answer passes the jebena to the next seat and uses that answer up (an alias counts as the same)", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 7 });
    const [p0, p1] = s.order as [string, string, string];
    const first = unused(s);
    const r = answer(s, p0, first.name, 1000);
    expect(r).toEqual({ ok: true, result: { verdict: "accepted", turn: 1, answer: first.name, via: "exact" } });
    expect(s.turn).toEqual({ n: 2, player: p1, attempts: 0 });
    expect(s.used[s.category]).toEqual([first.id]);
    expect(s.per[p0]!.answers).toBe(1);
    expect(jebenaModule.phase(s)!.key).toBe("turn:2");
    // The same answer (here by its name again) is "used": the deadline doesn't move, the turn doesn't pass.
    const again = answer(s, p1, first.name, 1500);
    expect(again).toEqual({ ok: true, result: { verdict: "used", turn: 2, answer: first.name } });
    expect(s.turn).toEqual({ n: 2, player: p1, attempts: 1 });
    expect(jebenaModule.phase(s)!.key).toBe("turn:2");
  });

  it("a rejection keeps the turn and deadline, and says why: used, not in this bank, ambiguous, near-miss, empty", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 3 });
    s.category = "jr-africa";
    const who = s.turn!.player;
    expect(answer(s, who, "Atlantis")).toMatchObject({ ok: true, result: { verdict: "not-in-bank" } });
    expect(answer(s, who, "Nigera")).toMatchObject({ ok: true, result: { verdict: "ambiguous" } });
    expect(answer(s, who, "Congo")).toMatchObject({ ok: true, result: { verdict: "near-miss", reason: expect.stringContaining("Two countries") } });
    expect(answer(s, who, "  ")).toMatchObject({ ok: true, result: { verdict: "empty" } });
    expect(s.turn).toMatchObject({ n: 1, player: who, attempts: 4 });
    expect(jebenaModule.phase(s)!.key).toBe("turn:1");
  });

  it("refusals change nothing: not in the game, out, stale turn, not your turn, bad payload, too long, too many attempts", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 5 });
    const [p0, p1] = s.order as [string, string, string];
    const before = JSON.stringify(s);
    expect(jebenaModule.intent(s, "zz", "jebena-answer", { turn: 1, text: "Lion" }, ctx(1))).toEqual({ ok: false, reason: "NOT_IN_GAME" });
    expect(jebenaModule.intent(s, p1, "jebena-answer", { turn: 1, text: "Lion" }, ctx(1))).toEqual({ ok: false, reason: "NOT_YOUR_TURN" });
    expect(jebenaModule.intent(s, p0, "jebena-answer", { turn: 2, text: "Lion" }, ctx(1))).toEqual({ ok: false, reason: "STALE_TURN" });
    expect(jebenaModule.intent(s, p0, "jebena-answer", { turn: 0, text: "Lion" }, ctx(1))).toEqual({ ok: false, reason: "STALE_TURN" });
    expect(jebenaModule.intent(s, p0, "jebena-answer", { turn: "1", text: "Lion" }, ctx(1))).toEqual({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(jebenaModule.intent(s, p0, "jebena-answer", { turn: 1 }, ctx(1))).toEqual({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(jebenaModule.intent(s, p0, "jebena-answer", { turn: 1, text: "x".repeat(JEBENA_MAX_INPUT + 1) }, ctx(1))).toEqual({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(JSON.stringify(s)).toBe(before);
    for (let i = 0; i < JEBENA_MAX_ATTEMPTS; i++) answer(s, p0, `nothing ${i}`);
    expect(answer(s, p0, "Lion")).toEqual({ ok: false, reason: "TOO_MANY_ATTEMPTS" });
    s.per[p1]!.outOrder = 1;
    expect(jebenaModule.intent(s, p1, "jebena-answer", { turn: 1, text: "Lion" }, ctx(1))).toEqual({ ok: false, reason: "OUT" });
  });

  it("a duplicated or replayed send for a turn that has moved on is stale: no second pass", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 9 });
    const p0 = s.turn!.player;
    const a1 = unused(s);
    expect(answer(s, p0, a1.name)).toMatchObject({ ok: true, result: { verdict: "accepted" } });
    const after = JSON.stringify(s);
    expect(jebenaModule.intent(s, p0, "jebena-answer", { turn: 1, text: a1.name }, ctx(2))).toEqual({ ok: false, reason: "STALE_TURN" });
    expect(JSON.stringify(s)).toBe(after);
  });

  it("a timeout costs exactly one heart, starts a new category and passes; no hearts left is out", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 11, settings: { hearts: 3 } });
    const [p0, p1] = s.order as [string, string, string];
    const cat0 = s.category;
    jebenaModule.expirePhase(s, ctx(10_500, s.order));
    expect(s.per[p0]!.hearts).toBe(2);
    expect(s.per[p0]!.timeouts).toBe(1);
    expect(s.category).not.toBe(cat0);
    expect(s.categoryRound).toBe(2);
    expect(s.turn).toEqual({ n: 2, player: p1, attempts: 0 });
    // Expiring a phase for a game that is over does nothing; a second expiry of the same turn is a new turn's.
    const outPlayer = p1;
    s.per[outPlayer]!.hearts = 1;
    jebenaModule.expirePhase(s, ctx(21_000, s.order));
    expect(s.per[outPlayer]!.hearts).toBe(0);
    expect(s.per[outPlayer]!.outOrder).toBe(1);
    expect(s.log.some((e) => e.kind === "out" && e.player === outPlayer)).toBe(true);
    // The jebena skips a player who is out.
    expect(s.turn!.player).not.toBe(outPlayer);
  });

  it("the last player with hearts keeps the jebena: the match ends, no phase is left, places and points follow", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 13, settings: { hearts: 3 } });
    let guard = 0;
    while (!s.end && guard++ < 100) jebenaModule.expirePhase(s, ctx(guard * 11_000, s.order));
    expect(s.end).toBe("last-standing");
    expect(jebenaModule.finished(s, ctx(0))).toBe(true);
    expect(jebenaModule.phase(s)).toBeNull();
    const standings = jebenaStandings(s);
    expect(standings[0]!.place).toBe(1);
    expect(standings[0]!.out).toBe(false);
    expect(standings.map((r) => r.place)).toEqual([1, 2, 3]);
    // 100 per player outlasted + 10 per heart kept: the winner outlasted 2.
    const winner = standings[0]!;
    expect(winner.points).toBe(200 + winner.hearts * 10);
    expect(standings[1]!.points).toBe(100);
    expect(standings[2]!.points).toBe(0);
    expect(jebenaModule.scores(s, s.order)).toEqual(jebenaPoints(s));
  });

  it("at the match limit, players still in rank by hearts (equal hearts share a place), above everyone out", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c", "d"], seed: 17 });
    const [p0, p1, p2, p3] = s.order as [string, string, string, string];
    s.per[p0]!.hearts = 2;
    s.per[p1]!.hearts = 4;
    s.per[p2]!.hearts = 2;
    s.per[p3]!.hearts = 0; s.per[p3]!.outOrder = 1; s.outCount = 1;
    const st = jebenaStandings(s);
    expect(st.map((r) => [r.id, r.place])).toEqual([[p1, 1], [p0, 2], [p2, 2], [p3, 4]]);
    const pts = jebenaPoints(s);
    expect(pts[p1]).toBe(100 + 40);
    expect(pts[p0]).toBe(100 + 20);
    expect(pts[p2]).toBe(100 + 20);
    expect(pts[p3]).toBe(0);
  });

  it("a used-up category moves on with no penalty; every category used up ends the match", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 19 });
    const c0 = s.category;
    const all = cat(c0).answers.map((x) => x.id);
    s.used[c0] = all.slice(0, -1); // one left
    const last = cat(c0).answers[all.length - 1]!;
    const who = s.turn!.player;
    expect(answer(s, who, last.name)).toMatchObject({ ok: true, result: { verdict: "accepted" } });
    expect(s.category).not.toBe(c0);
    expect(s.per[who]!.hearts).toBe(JEBENA_DEFAULT_HEARTS);
    // Use up every category but the current one, then its last answer: the match ends.
    for (const c of JEBENA_CATEGORIES) if (c.id !== s.category) s.used[c.id] = c.answers.map((x) => x.id);
    const cur = cat(s.category);
    s.used[s.category] = cur.answers.slice(0, -1).map((x) => x.id);
    expect(answer(s, s.turn!.player, cur.answers[cur.answers.length - 1]!.name)).toMatchObject({ ok: true, result: { verdict: "accepted" } });
    expect(s.end).toBe("banks-exhausted");
    expect(jebenaModule.phase(s)).toBeNull();
  });

  it("sitting out: out from now; on your own turn the jebena passes; one player left ends the match", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 23 });
    const [p0, p1, p2] = s.order as [string, string, string];
    expect(jebenaModule.abstain(s, p0, ctx(1))).toEqual({ ok: true, wholeGameAbstain: true });
    expect(s.per[p0]!.outOrder).toBe(1);
    expect(s.turn!.player).toBe(p1);
    expect(jebenaModule.abstain(s, p0, ctx(2))).toEqual({ ok: false, reason: "ALREADY_FINISHED" });
    expect(jebenaModule.abstain(s, p2, ctx(3))).toEqual({ ok: true, wholeGameAbstain: true });
    expect(s.end).toBe("last-standing");
    expect(jebenaStandings(s)[0]!.id).toBe(p1);
  });

  it("privacy: views carry played facts only, never the bank; a player's own attempt is theirs alone", () => {
    const s = jebenaModule.init({ players: ["a", "b"], seed: 29 });
    const [p0, p1] = s.order as [string, string];
    answer(s, p0, "my secret typing");
    const pub = JSON.stringify(jebenaModule.publicView(s, { now: 1, scale: 1 }));
    const theirs = JSON.stringify(jebenaModule.playerView(s, p1, { now: 1, scale: 1 }));
    const mine = jebenaModule.playerView(s, p0, { now: 1, scale: 1 }) as Json;
    expect(pub).not.toContain("my secret typing");
    expect(theirs).not.toContain("my secret typing");
    expect((mine["attempt"] as Json)["text"]).toBe("my secret typing");
    // No unused answer of the current category anywhere.
    for (const a of cat(s.category).answers) {
      expect(pub).not.toContain(`"${a.name}"`);
      expect(theirs).not.toContain(`"${a.name}"`);
    }
    expect(pub).not.toContain("aliases");
  });

  it("persists as JSON and carries on", () => {
    const s = jebenaModule.init({ players: ["a", "b", "c"], seed: 31 });
    answer(s, s.turn!.player, unused(s).name);
    const t = JSON.parse(JSON.stringify(s)) as JebenaState;
    expect(t).toEqual(s);
    expect(answer(t, t.turn!.player, unused(t).name)).toMatchObject({ ok: true, result: { verdict: "accepted" } });
  });
});

describe("Jebena Rush in the room engine (§4–§6)", () => {
  const T0 = 1_800_000_000_000;
  function setup(n = 3, kind: "casual" | "cup" = "casual") {
    const engine = new RoomEngine("JR room", { kind, timing: 2 });
    let t = T0;
    engine.clock = () => t;
    const ids = [engine.join("Keku", { asHost: true }).player.id];
    for (let i = 1; i < n; i++) ids.push(engine.join(`P${i}`).player.id);
    const send = (pid: string, gid: string, action: string, payload: Json = {}, clientEventId: string = randomUUID()) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId, roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    return { engine, ids, send, now: () => t, set: (ms: number) => { t = ms; engine.tick(t); }, advance: (ms: number) => { t += ms; engine.tick(t); } };
  }
  function start(env: ReturnType<typeof setup>, settings?: unknown) {
    // The host chooses the hearts in the lobby first; the Start carries what it showed (§8).
    if (settings !== undefined) env.engine.setLobbySettings(env.ids[0]!, "jebena-rush", settings, env.engine.session.revision);
    const g = env.engine.startGame(env.ids[0]!, "jebena-rush", { official: false, ...(settings !== undefined ? { settings } : {}) });
    for (const p of env.ids) expect(env.send(p, g.id, "briefing-ready", { ready: true }).accepted).toBe(true);
    const game = env.engine.games.get(g.id)!;
    expect(game.status).toBe("playing");
    return { gid: g.id, game, st: () => game.extra as JebenaState };
  }

  it("casual rooms only, practice only; hearts are a validated start setting recorded with the game", () => {
    const cup = setup(3, "cup");
    expect(() => cup.engine.startGame(cup.ids[0]!, "jebena-rush", { official: false })).toThrow(StartRefused);
    const env = setup();
    expect(() => env.engine.startGame(env.ids[0]!, "jebena-rush", { official: true })).toThrow();
    expect(() => env.engine.startGame(env.ids[0]!, "jebena-rush", { official: false, settings: { hearts: 4 } })).toThrow(/3, 5 or 7/);
    expect(() => env.engine.startGame(env.ids[0]!, "trivia", { official: false, settings: { hearts: 3 } })).toThrow(/no settings/);
    const { game, st } = start(env, { hearts: 7 });
    expect(game.settings).toEqual({ hearts: 7 });
    expect(st().startHearts).toBe(7);
  });

  it("lobby hearts (§8): host or cohost only, casual only, revision-checked, shown to everyone, bound at Start, persisted", () => {
    const env = setup();
    const host = env.ids[0]!, guest = env.ids[1]!;
    expect(env.engine.lobbySettingsView()["jebena-rush"]).toEqual({ hearts: JEBENA_DEFAULT_HEARTS });
    expect(() => env.engine.setLobbySettings(guest, "jebena-rush", { hearts: 3 }, env.engine.session.revision)).toThrow(SessionRefused);
    expect(() => env.engine.setLobbySettings(host, "jebena-rush", { hearts: 4 }, env.engine.session.revision)).toThrow(/3, 5 or 7/);
    expect(() => env.engine.setLobbySettings(host, "trivia", { hearts: 3 }, env.engine.session.revision)).toThrow(SessionRefused);
    const rev = env.engine.session.revision;
    expect(env.engine.setLobbySettings(host, "jebena-rush", { hearts: 3 }, rev).changed).toBe(true);
    expect(env.engine.session.revision).toBe(rev + 1);
    // The same choice again changes nothing, whatever its revision (a retry, a second tab).
    expect(env.engine.setLobbySettings(host, "jebena-rush", { hearts: 3 }, rev).changed).toBe(false);
    // A delayed change made against an older revision never undoes a newer one.
    expect(() => env.engine.setLobbySettings(host, "jebena-rush", { hearts: 7 }, rev)).toThrow(/changed since/);
    // Every audience sees the choice (public projection, a guest's own and the TV's).
    for (const view of [env.engine.project("player", guest), env.engine.project("tv")]) expect((view as { lobbySettings?: unknown }).lobbySettings).toEqual(expect.objectContaining({ "jebena-rush": { hearts: 3 } }));
    // A Start that shows other hearts (or none: the default) is refused; nothing starts.
    const before = env.engine.games.size;
    let refused: unknown;
    try { env.engine.startGame(host, "jebena-rush", { official: false, settings: { hearts: 5 } }); } catch (e) { refused = e; }
    expect(refused).toBeInstanceOf(StartRefused);
    expect((refused as StartRefused).code).toBe("SETTINGS_CHANGED");
    expect(() => env.engine.startGame(host, "jebena-rush", { official: false })).toThrow(StartRefused);
    expect(env.engine.games.size).toBe(before);
    // Persisted with the room, and only valid choices come back.
    const saved = JSON.parse(JSON.stringify(env.engine.toJSON())) as Record<string, unknown>;
    expect(RoomEngine.fromJSON(saved).lobbySettingsFor("jebena-rush")).toEqual({ hearts: 3 });
    expect(RoomEngine.fromJSON({ ...saved, lobbySettings: { "jebena-rush": { hearts: 9 }, trivia: { hearts: 3 } } }).lobbySettingsView()["jebena-rush"]).toEqual({ hearts: JEBENA_DEFAULT_HEARTS });
    // A Cup has no lobby settings.
    const cup = setup(3, "cup");
    expect(() => cup.engine.setLobbySettings(cup.ids[0]!, "jebena-rush", { hearts: 3 }, cup.engine.session.revision)).toThrow(SessionRefused);
    expect((cup.engine.project("player", cup.ids[0]!) as { lobbySettings?: unknown }).lobbySettings).toBeUndefined();
  });

  it("the turn clock is the room's phase clock: 10.5 s after play starts; a timeout is processed once, on time, with nobody acting", () => {
    const env = setup();
    const { game, st } = start(env);
    const startedAt = env.now();
    expect(game.phaseKey).toBe("turn:1");
    expect(game.phaseDeadlineAt).toBe(startedAt + JEBENA_TURN_MS + JEBENA_GRACE_MS);
    const first = st().turn!.player;
    env.set(startedAt + JEBENA_TURN_MS + JEBENA_GRACE_MS); // the deadline instant itself: still that turn
    expect(st().turn!.n).toBe(1);
    env.set(startedAt + JEBENA_TURN_MS + JEBENA_GRACE_MS + 1);
    expect(st().per[first]!.hearts).toBe(JEBENA_DEFAULT_HEARTS - 1);
    expect(st().turn!.n).toBe(2);
    expect(game.phaseDeadlineAt).toBe(startedAt + 2 * (JEBENA_TURN_MS + JEBENA_GRACE_MS));
    env.engine.tick(env.now()); // running the clock again changes nothing
    expect(st().per[first]!.hearts).toBe(JEBENA_DEFAULT_HEARTS - 1);
  });

  it("an accepted answer restarts the clock for the next player; a rejected one keeps the deadline", () => {
    const env = setup();
    const { gid, game, st } = start(env);
    const p0 = st().turn!.player;
    const deadline1 = game.phaseDeadlineAt!;
    env.advance(3000);
    expect(env.send(p0, gid, "jebena-answer", { turn: 1, text: "Atlantis" }).accepted).toBe(true);
    expect(game.phaseDeadlineAt).toBe(deadline1);
    env.advance(2000);
    const r = env.send(p0, gid, "jebena-answer", { turn: 1, text: unused(st()).name });
    expect(r.accepted).toBe(true);
    expect(game.phaseKey).toBe("turn:2");
    expect(game.phaseDeadlineAt).toBe(env.now() + JEBENA_TURN_MS + JEBENA_GRACE_MS);
  });

  it("boundary race: an answer arriving after the deadline finds the turn timed out (stale), resolved once", () => {
    const env = setup();
    const { gid, game, st } = start(env);
    const p0 = st().turn!.player;
    const due = game.phaseDeadlineAt!;
    env.set(due + 1); // the tick ran: one heart, turn 2
    const r = env.send(p0, gid, "jebena-answer", { turn: 1, text: unused(st()).name });
    expect(r.accepted).toBe(false);
    expect((r as { reason?: string }).reason).toBe("STALE_TURN");
    expect(st().per[p0]!.hearts).toBe(JEBENA_DEFAULT_HEARTS - 1);
    expect(st().turn!.n).toBe(2);
  });

  it("spoofing and duplicates: another seat can't answer for the holder; a resend with the same client id replays its first answer", () => {
    const env = setup();
    const { gid, st } = start(env);
    const holder = st().turn!.player;
    const other = env.ids.find((x) => x !== holder)!;
    expect(env.send(other, gid, "jebena-answer", { turn: 1, text: unused(st()).name }).accepted).toBe(false);
    const id = randomUUID();
    const text = unused(st()).name;
    const a = env.send(holder, gid, "jebena-answer", { turn: 1, text }, id);
    const b = env.send(holder, gid, "jebena-answer", { turn: 1, text }, id);
    expect(a.accepted).toBe(true);
    expect(b).toEqual(a);
    expect(st().turn!.n).toBe(2);
    expect(st().per[holder]!.answers).toBe(1);
  });

  it("late joiners watch: not in the roster, their answers are refused, the match goes on", () => {
    const env = setup();
    const { gid, st } = start(env);
    const late = env.engine.join("Late").player.id;
    expect(st().order).not.toContain(late);
    expect(env.send(late, gid, "jebena-answer", { turn: st().turn!.n, text: "Lion" }).accepted).toBe(false);
  });

  it("the whole loop: timeouts until one player is left, results with places, Play again keeps the hearts", () => {
    const env = setup(3);
    const { gid, game, st } = start(env, { hearts: 3 });
    let guard = 0;
    while (game.status === "playing" && guard++ < 50) env.advance(JEBENA_TURN_MS + JEBENA_GRACE_MS + 1);
    expect(game.status).toBe("finished");
    expect(game.outcome?.reason).toBe("completed");
    expect(st().end).toBe("last-standing");
    const placed = jebenaStandings(st());
    expect(game.rawScores[placed[0]!.id]).toBe(placed[0]!.points);
    const again = env.engine.startRematch(env.ids[0]!, gid, {});
    expect(again.game.settings).toEqual({ hearts: 3 });
    expect(again.game.rematchOf).toBe(gid);
  });

  it("the match limit ends it with places, never running forever", () => {
    const env = setup(2);
    const { gid, game, st } = start(env);
    // Keep answering until the limit: every turn accepted, so nobody loses a heart.
    let guard = 0;
    while (game.status === "playing" && guard++ < 200) {
      const s = st();
      if (!s.turn) break;
      const a = cat(s.category).answers.find((x) => !(s.used[s.category] ?? []).includes(x.id));
      if (a) env.send(s.turn.player, gid, "jebena-answer", { turn: s.turn.n, text: a.name });
      env.advance(5_000);
    }
    expect(game.status).toBe("finished");
    expect(game.outcome?.reason).toBe("deadline");
    expect(st().end).toBeNull(); // the room's limit, not the module, ended it
    // Nobody lost a heart: both still in, equal hearts share first place, equal points.
    expect(Object.values(game.rawScores)).toEqual([JEBENA_DEFAULT_HEARTS * 10, JEBENA_DEFAULT_HEARTS * 10]);
    // Every view still carries the places for the results screen.
    for (const pid of env.ids) {
      const mine = (env.engine.project("player", pid) as { myGames: { id: string; state: { standings?: { place: number }[] } }[] }).myGames.find((g) => g.id === gid)!;
      expect(mine.state.standings?.map((r) => r.place)).toEqual([1, 1]);
    }
  });

  it("restart recovery mid-turn: the absolute deadline still applies, nothing is reset or replayed", () => {
    const env = setup();
    const { gid, game, st } = start(env);
    const p0 = st().turn!.player;
    env.advance(4000);
    const restored = RoomEngine.fromJSON(JSON.parse(JSON.stringify(env.engine.toJSON())));
    restored.clock = () => env.now();
    const rg = restored.games.get(gid)!;
    expect(rg.phaseDeadlineAt).toBe(game.phaseDeadlineAt);
    restored.tick(game.phaseDeadlineAt! + 1);
    expect((rg.extra as JebenaState).per[p0]!.hearts).toBe(JEBENA_DEFAULT_HEARTS - 1);
  });

  it("projections: no bank, no unused answer, no token, no other player's attempt; two rooms never mix", () => {
    const env = setup();
    const { gid, st } = start(env);
    const holder = st().turn!.player;
    env.send(holder, gid, "jebena-answer", { turn: 1, text: "zzz private typing" });
    const tv = JSON.stringify(env.engine.project("tv"));
    const other = JSON.stringify(env.engine.project("player", env.ids.find((x) => x !== holder)!));
    for (const out of [tv, other]) {
      expect(out).not.toContain("zzz private typing");
      for (const a of cat(st().category).answers) expect(out).not.toContain(`"${a.name}"`);
      expect(out).not.toContain("aliases");
    }
    const mine = JSON.stringify(env.engine.project("player", holder));
    expect(mine).toContain("zzz private typing");
    // A second room has its own match: playing in one never changes the other.
    const env2 = setup();
    const s2 = start(env2);
    const room2Before = JSON.stringify(s2.st());
    const s1 = st();
    env.send(s1.turn!.player, gid, "jebena-answer", { turn: s1.turn!.n, text: unused(s1).name });
    env.advance(JEBENA_TURN_MS + JEBENA_GRACE_MS + 1);
    expect(JSON.stringify(s2.st())).toBe(room2Before);
    expect(env2.engine.id).not.toBe(env.engine.id);
  });
});

describe("Jebena Rush in the catalogue (§3)", () => {
  it("the manifest is valid and casual/practice; Quick Party never adds it, and existing lineups are unchanged", () => {
    const m = GAME_MANIFESTS.find((x) => x.id === "jebena-rush")!;
    expect(validateManifest(m)).toEqual([]);
    expect(m.features.official).toBe(false);
    expect(NOT_IN_QUICK_PARTY.has("jebena-rush")).toBe(true);
    for (const n of [2, 3, 6, 10]) expect(partyPool(n).map((p) => p.gameId)).not.toContain("jebena-rush");
    for (const seed of [1, 2, 3]) expect(planParty({ expectedPlayers: 4, budgetMinutes: 60, seed }).items.map((i) => i.gameId)).not.toContain("jebena-rush");
  });
});
