/**
 * Stage 12.11 (docs/stage12/stage1211.md): Team Draw (D-S1211-02) and the shared word history of the drawing games
 * (D-S1211-01). The module is pure; then the room: a whole game with the night's teams, and Draw & Guess afterwards
 * dealing words Team Draw hasn't used.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newTeamList, type GameTeams } from "../src/shared/teams.js";
import {
  TEAM_DRAW_LOCK_MS, TEAM_DRAW_MAX_GUESSES, TEAM_DRAW_POINTS, TEAM_DRAW_TAKEOVER_MS, passTarget, takeoverAt, teamDrawModule as m, teamDrawRoundCount, type TeamDrawState,
} from "../src/games/modules/teamDraw.js";
import { DRAW_LIMITS, drawModule, drawPromptsFor, type DrawState } from "../src/games/modules/draw.js";
// Stage 12.17: the prompts live in the content library; this is the shared pool the games deal from (pack order).
import { drawPromptPool } from "../src/content/materialize.js";
import { loadContent } from "../src/content/registry.js";
const DRAW_PROMPTS = drawPromptPool(loadContent());
import { moduleRng, seededShuffle, type ModuleContext } from "../src/games/modules/types.js";
import { RoomEngine } from "../src/server/room.js";

const CORAL = "team-coral", SUN = "team-sun", MINT = "team-mint";
// Coral: k, a, z (3); Sun: b, w (2).
const players = ["k", "a", "z", "b", "w"];
const teams: GameTeams = { list: newTeamList(2), members: { k: CORAL, a: CORAL, z: CORAL, b: SUN, w: SUN } };
const T0 = 3_000_000;
const ctx = (now: number, ps: readonly string[] = players): ModuleContext => ({ now, players: ps, active: ps, scale: 1 });
const view = (s: TeamDrawState, p: string, now: number) => m.playerView(s, p, ctx(now)) as Record<string, unknown>;
function game(seed = 7, t: GameTeams = teams, ps: string[] = players): TeamDrawState {
  const s = m.init({ players: ps, seed, teams: t, season: "everyday", drawPool: DRAW_PROMPTS });
  m.onPlayStart(s, ctx(T0, ps));
  return s;
}
const drawer = (s: TeamDrawState, team: string) => s.rounds[s.round]![team]!.drawer;
const word = (s: TeamDrawState) => s.prompts[s.round]!.word;
const line = (n = 1) => ({ pieces: [{ s: n, c: 0, w: 1, p: [100, 100, 400, 400, 600, 300] }] });
const draw = (s: TeamDrawState, team: string, now: number, n = 1) => m.intent(s, drawer(s, team), "team-draw-strokes", { round: s.round, ...line(n) }, ctx(now));
const guess = (s: TeamDrawState, p: string, text: string, now: number) => m.intent(s, p, "team-draw-guess", { round: s.round, text }, ctx(now));
/** A guesser on a team (not the drawer, and hasn't seen the word). */
const guesser = (s: TeamDrawState, team: string) => players.find((p) => s.teams.members[p] === team && !s.rounds[s.round]![team]!.sawWord.includes(p))!;

describe("Team Draw (pure)", () => {
  it("rounds: the biggest team's size, from 3 to 5; every team draws the same word; the pen goes round each team", () => {
    expect(teamDrawRoundCount(teams, players)).toBe(3);
    const big: GameTeams = { list: newTeamList(2), members: Object.fromEntries(["p1", "p2", "p3", "p4", "p5", "p6", "q1", "q2"].map((p) => [p, p.startsWith("p") ? CORAL : SUN])) };
    expect(teamDrawRoundCount(big, Object.keys(big.members))).toBe(5);
    const s = game();
    expect(s.prompts).toHaveLength(3);
    expect(s.drawOrder[CORAL]!.slice().sort()).toEqual(["a", "k", "z"]);
    expect(s.drawOrder[SUN]!.slice().sort()).toEqual(["b", "w"]);
    // Coral's three each draw once in 3 rounds; Sun's two go round (one draws twice).
    const drew: Record<string, string[]> = { [CORAL]: [], [SUN]: [] };
    let t = T0;
    for (let r = 0; r < 3; r++) {
      for (const team of [CORAL, SUN]) drew[team]!.push(drawer(s, team));
      m.expirePhase(s, ctx(t += 1000)); m.expirePhase(s, ctx(t += 1000));
    }
    expect(drew[CORAL]!.slice().sort()).toEqual(["a", "k", "z"]);
    expect(drew[SUN]).toEqual([s.drawOrder[SUN]![0], s.drawOrder[SUN]![1], s.drawOrder[SUN]![0]]);
    expect(s.phase).toBe("finished");
  });

  it("secrecy: the word is on the drawer's phone only; a phone gets its own team's drawing and guesses only; the TV gets neither", () => {
    const s = game();
    const w = word(s);
    expect(draw(s, CORAL, T0 + 1000).ok).toBe(true);
    const coralGuesser = guesser(s, CORAL);
    expect(draw(s, SUN, T0 + 1100, 2).ok).toBe(true);
    expect(guess(s, coralGuesser, "secret-wrong-coral", T0 + 2000)).toMatchObject({ ok: true, result: { right: false } });
    const needle = `"${w}"`;
    for (const p of players) {
      const v = view(s, p, T0 + 2100);
      const json = JSON.stringify(v);
      const team = s.teams.members[p]!;
      if (p === drawer(s, team)) expect(v["myWord"]).toBe(w);
      else expect(json, `${p} must not get the word`).not.toContain(needle);
      // Only its own team's drawing: Coral's piece has stroke 1, Sun's stroke 2.
      const strokes = (v["pieces"] as { s: number }[]).map((x) => x.s);
      expect(strokes).toEqual(team === CORAL ? [1] : [2]);
      if (team === SUN) expect(json).not.toContain("secret-wrong-coral");
    }
    const tv = JSON.stringify(m.publicView(s, ctx(T0 + 2100)));
    expect(tv).not.toContain(needle);
    expect(tv).not.toContain("secret-wrong-coral");
    expect(tv).not.toContain("\"pieces\"");
    // Future words never leave the server.
    for (const later of s.prompts.slice(1)) for (const p of players) expect(JSON.stringify(view(s, p, T0 + 2100))).not.toContain(`"${later.word}"`);
  });

  it("guessing: not the drawer, not before anything is drawn; a wrong guess pauses the team 2 s; 15 a round per team", () => {
    const s = game();
    const g = guesser(s, CORAL);
    expect(guess(s, drawer(s, CORAL), word(s), T0 + 100)).toMatchObject({ ok: false, reason: "DRAWER_CANNOT_GUESS" });
    expect(guess(s, g, word(s), T0 + 100)).toMatchObject({ ok: false, reason: "NOTHING_DRAWN_YET" });
    draw(s, CORAL, T0 + 200);
    expect(guess(s, g, "nope", T0 + 300)).toMatchObject({ ok: true, result: { right: false } });
    const other = players.find((p) => s.teams.members[p] === CORAL && p !== g && p !== drawer(s, CORAL))!;
    expect(guess(s, other, "nope again", T0 + 400)).toMatchObject({ ok: false, reason: "LOCKED" });
    expect(view(s, other, T0 + 400)).toMatchObject({ lockedUntil: T0 + 300 + TEAM_DRAW_LOCK_MS, teamGuesses: [{ by: g, text: "nope" }] });
    let t = T0 + 300;
    for (let i = 1; i < TEAM_DRAW_MAX_GUESSES; i++) { t += TEAM_DRAW_LOCK_MS; expect(guess(s, i % 2 ? other : g, `wrong ${i}`, t).ok).toBe(true); }
    t += TEAM_DRAW_LOCK_MS;
    expect(guess(s, g, word(s), t)).toMatchObject({ ok: false, reason: "TOO_MANY_GUESSES" });
    expect(view(s, g, t)["guessesLeft"]).toBe(0);
    expect(m.intent(s, g, "team-draw-guess", { round: s.round + 1, text: "x" }, ctx(t))).toMatchObject({ ok: false, reason: "STALE_ROUND" });
  });

  it("points by the order teams get it; the round ends once every team has; everyone scores their team's points", () => {
    const s = game();
    draw(s, CORAL, T0 + 100); draw(s, SUN, T0 + 100, 2);
    expect(guess(s, guesser(s, SUN), word(s).toUpperCase() + "!", T0 + 6000)).toMatchObject({ ok: true, result: { right: true, place: 1 } });
    expect(guess(s, guesser(s, SUN), word(s), T0 + 6500)).toMatchObject({ ok: false, reason: "ALREADY_SOLVED" });
    expect(s.phase).toBe("draw");
    expect(guess(s, guesser(s, CORAL), word(s), T0 + 9000)).toMatchObject({ ok: true, result: { right: true, place: 2 } });
    expect(s.phase).toBe("reveal");
    expect(m.scores(s, players)).toEqual({ k: 75, a: 75, z: 75, b: 100, w: 100 });
    const reveal = m.publicView(s, ctx(T0 + 9000))["result"] as { word: string; teams: { teamId: string; place: number; seconds: number; pieces: unknown[]; drawers: string[] }[] };
    expect(reveal.word).toBe(s.prompts[0]!.word);
    expect(reveal.teams.find((x) => x.teamId === SUN)).toMatchObject({ place: 1, seconds: 6, drawers: [drawer(s, SUN)] });
    // The gallery: every team's drawing at the reveal.
    expect(reveal.teams.map((x) => x.pieces.length)).toEqual([1, 1]);
    // The next round drops this round's drawings.
    m.expirePhase(s, ctx(T0 + 20_000));
    expect(s.rounds[0]![CORAL]!.pieces).toEqual([]);
  });

  it("catch-up: +25 for a team alone in last place and 100+ behind, from the rounds before", () => {
    const s = game();
    let t = T0;
    draw(s, SUN, t += 100);
    guess(s, guesser(s, SUN), word(s), t += 1000); // Sun 100, Coral 0
    m.expirePhase(s, ctx(t += 1000)); m.expirePhase(s, ctx(t += 1000));
    draw(s, CORAL, t += 100);
    guess(s, guesser(s, CORAL), word(s), t + 1000);
    expect(s.rounds[1]![CORAL]).toMatchObject({ place: 1, bonus: TEAM_DRAW_POINTS.catchUp, points: TEAM_DRAW_POINTS.place[0] + TEAM_DRAW_POINTS.catchUp });
  });

  it("pass the pen: once, before drawing, to a teammate who hasn't seen the word; the passer can't guess", () => {
    const s = game();
    const first = drawer(s, CORAL);
    const to = passTarget(s, CORAL, s.rounds[0]![CORAL]!)!;
    expect(view(s, first, T0)).toMatchObject({ canPass: true, passTo: to });
    expect(m.intent(s, first, "team-draw-pass", { round: 0 }, ctx(T0 + 500))).toEqual({ ok: true });
    expect(drawer(s, CORAL)).toBe(to);
    expect(view(s, to, T0 + 600)["myWord"]).toBe(word(s));
    const passer = view(s, first, T0 + 600);
    expect(passer).toMatchObject({ amDrawing: false, sawWord: true, canGuess: false, handoff: { from: first, to, how: "pass" } });
    expect(passer["myWord"]).toBeUndefined();
    draw(s, CORAL, T0 + 700);
    expect(guess(s, first, word(s), T0 + 800)).toMatchObject({ ok: false, reason: "YOU_SAW_THE_WORD" });
    // Once a round, and never after drawing.
    expect(m.intent(s, to, "team-draw-pass", { round: 0 }, ctx(T0 + 900))).toMatchObject({ ok: false, reason: "PASS_NOT_AVAILABLE" });
    // A team of 2 can't pass: nobody would be left to guess.
    expect(m.intent(s, drawer(s, SUN), "team-draw-pass", { round: 0 }, ctx(T0 + 900))).toMatchObject({ ok: false, reason: "PASS_NOT_AVAILABLE" });
    expect(view(s, drawer(s, SUN), T0 + 900)["canPass"]).toBe(false);
  });

  it("take the pen: after 20 s without drawing (from the pen or the last stroke), the drawing kept, a guesser always left", () => {
    const s = game();
    const tr = s.rounds[0]![CORAL]!;
    const first = tr.drawer;
    const taker = guesser(s, CORAL);
    expect(m.dueAt!(s)).toBe(T0 + TEAM_DRAW_TAKEOVER_MS);
    expect(m.intent(s, taker, "team-draw-takeover", { round: 0 }, ctx(T0 + 10_000))).toMatchObject({ ok: false, reason: "TAKEOVER_NOT_YET" });
    // Drawing restarts the clock.
    draw(s, CORAL, T0 + 10_000);
    expect(takeoverAt(s, tr)).toBe(T0 + 10_000 + TEAM_DRAW_TAKEOVER_MS);
    expect(m.intent(s, taker, "team-draw-takeover", { round: 0 }, ctx(T0 + 25_000))).toMatchObject({ ok: false, reason: "TAKEOVER_NOT_YET" });
    // At the instant, advance() opens it (so every phone hears), and the taker keeps the drawing.
    m.advance!(s, ctx(T0 + 30_000));
    expect(tr.takeoverOpen).toBe(true);
    expect(view(s, taker, T0 + 30_000)).toMatchObject({ canTakeOver: true, takeoverAt: T0 + 30_000 });
    expect(m.intent(s, taker, "team-draw-takeover", { round: 0 }, ctx(T0 + 30_000))).toEqual({ ok: true });
    expect(tr).toMatchObject({ drawer: taker, takeoverOpen: false, sawWord: [first, taker] });
    expect(tr.pieces).toHaveLength(1);
    expect(view(s, taker, T0 + 30_100)["myWord"]).toBe(word(s));
    // The old drawer can't draw any more, or guess; the last Coral player can't take it (nobody would be left to guess).
    expect(m.intent(s, first, "team-draw-strokes", { round: 0, ...line(5) }, ctx(T0 + 30_200))).toMatchObject({ ok: false, reason: "NOT_YOUR_TURN" });
    const last = players.find((p) => s.teams.members[p] === CORAL && !tr.sawWord.includes(p))!;
    expect(m.intent(s, last, "team-draw-takeover", { round: 0 }, ctx(T0 + 60_000))).toMatchObject({ ok: false, reason: "NO_ONE_LEFT_TO_GUESS" });
    expect(view(s, last, T0 + 60_000)["takeoverAt"]).toBeUndefined();
    // A team of 2 never offers it.
    expect(m.intent(s, guesser(s, SUN), "team-draw-takeover", { round: 0 }, ctx(T0 + 60_000))).toMatchObject({ ok: false, reason: "NO_ONE_LEFT_TO_GUESS" });
  });

  it("drawing: the drawer's only; pieces checked and bounded; undo removes a stroke, clear empties the page", () => {
    const s = game();
    const d = drawer(s, CORAL);
    expect(m.intent(s, guesser(s, CORAL), "team-draw-strokes", { round: 0, ...line() }, ctx(T0))).toMatchObject({ ok: false, reason: "NOT_YOUR_TURN" });
    expect(m.intent(s, d, "team-draw-strokes", { round: 0, pieces: [{ s: 1, c: 99, w: 1, p: [1, 2] }] }, ctx(T0))).toMatchObject({ ok: false, reason: "INVALID_PAYLOAD" });
    expect(m.intent(s, d, "team-draw-strokes", { round: 0, pieces: [{ s: 1, c: 0, w: 1, p: Array.from({ length: (DRAW_LIMITS.pointsPerMessage + 1) * 2 }, () => 5) }] }, ctx(T0))).toMatchObject({ ok: false, reason: "PAYLOAD_TOO_LARGE" });
    for (let i = 0; i < 3; i++) expect(draw(s, CORAL, T0 + 100 + i, i + 1).ok).toBe(true);
    expect(m.intent(s, d, "team-draw-undo", { round: 0 }, ctx(T0 + 200)).ok).toBe(true);
    expect(s.rounds[0]![CORAL]!.pieces.map((x) => x.s)).toEqual([1, 2]);
    expect(m.intent(s, d, "team-draw-clear", { round: 0 }, ctx(T0 + 300)).ok).toBe(true);
    expect(s.rounds[0]![CORAL]!).toMatchObject({ pieces: [], inked: 0, everDrew: true });
    // The rate window is per team: Coral's drawing doesn't slow Sun's.
    const t = T0 + 10_000;
    for (let i = 0; i < DRAW_LIMITS.messagesPer2s; i++) expect(draw(s, CORAL, t, 10 + i).ok).toBe(true);
    expect(draw(s, CORAL, t, 99)).toMatchObject({ ok: false, reason: "RATE_LIMITED" });
    expect(draw(s, SUN, t, 1).ok).toBe(true);
    // Messages from an earlier round are refused.
    expect(m.intent(s, d, "team-draw-strokes", { round: 5, ...line() }, ctx(t + 3000))).toMatchObject({ ok: false, reason: "STALE_ROUND" });
  });

  it("the end: no sitting out; guesses and drawings dropped; the recap has every word and result; words listed for no repeats", () => {
    const s = game();
    expect(m.abstain(s, "k", ctx(T0)).ok).toBe(false);
    expect(m.contentPool).toBe("draw-prompts");
    expect(m.contentIds(s)).toEqual(s.prompts.map((p) => p.id));
    draw(s, CORAL, T0 + 100);
    guess(s, guesser(s, CORAL), "a wrong one", T0 + 200);
    let t = T0 + 1000;
    while (s.phase !== "finished") m.expirePhase(s, ctx(t += 1000));
    m.onFinish!(s, ctx(t));
    const json = JSON.stringify(s);
    expect(json).not.toContain("a wrong one");
    expect(Object.values(s.rounds).every((r) => Object.values(r).every((tr) => tr.pieces.length === 0))).toBe(true);
    const pub = m.publicView(s, ctx(t)) as { rounds: { word: string; teams: { pieces?: unknown }[] }[] };
    expect(pub.rounds.map((r) => r.word)).toEqual(s.prompts.map((p) => p.word));
    expect(pub.rounds.every((r) => r.teams.every((x) => x.pieces === undefined))).toBe(true);
    expect(m.participation(s, players).completedUnits).toBe(3);
  });

  it("3 and 4 teams: every team draws and is scored; the TV status lists each", () => {
    const four: GameTeams = { list: newTeamList(4), members: { a1: CORAL, a2: CORAL, b1: SUN, b2: SUN, c1: MINT, c2: MINT, d1: "team-iris", d2: "team-iris" } };
    const ps = Object.keys(four.members);
    const s = game(3, four, ps);
    const status = m.publicView(s, ctx(T0, ps))["teamStatus"] as { teamId: string }[];
    expect(status.map((x) => x.teamId)).toEqual([CORAL, SUN, MINT, "team-iris"]);
    const ids = [CORAL, SUN, MINT, "team-iris"];
    ids.forEach((team, i) => {
      const tr = s.rounds[0]![team]!;
      expect(m.intent(s, tr.drawer, "team-draw-strokes", { round: 0, ...line() }, ctx(T0 + 10, ps)).ok).toBe(true);
      const g = ps.find((p) => four.members[p] === team && p !== tr.drawer)!;
      expect(m.intent(s, g, "team-draw-guess", { round: 0, text: word(s) }, ctx(T0 + 1000 * (i + 1), ps))).toMatchObject({ ok: true, result: { place: i + 1 } });
    });
    expect(s.phase).toBe("reveal");
    expect(m.scores(s, ps)).toMatchObject({ a1: 100, b1: 75, c1: 55, d1: 40 });
  });
});

describe("the drawing games share one word history (D-S1211-01)", () => {
  it("drawPromptsFor deals unplayed words first, and with nothing to avoid deals exactly as before", () => {
    for (const seed of [1, 9]) expect(drawPromptsFor(DRAW_PROMPTS, undefined, moduleRng(seed), [])).toEqual(seededShuffle(DRAW_PROMPTS, moduleRng(seed)));
    const played = drawPromptsFor(DRAW_PROMPTS, "everyday", moduleRng(4)).slice(0, 10).map((p) => p.id);
    const next = drawPromptsFor(DRAW_PROMPTS, "everyday", moduleRng(4), played);
    const firstPart = next.slice(0, next.length - played.length).map((p) => p.id);
    expect(firstPart.some((id) => played.includes(id))).toBe(false);
    expect(next.slice(-played.length).map((p) => p.id)).toEqual(played);
  });

  it("Draw & Guess lists the words it dealt (swaps included) and avoids played ones", () => {
    const ps = ["a", "b", "c"];
    const s = drawModule.init({ drawPool: DRAW_PROMPTS, players: ps, seed: 2, season: "everyday" }) as DrawState;
    expect(drawModule.contentIds(s)).toEqual(s.prompts.slice(0, 3).map((p) => p.id));
    drawModule.intent(s, s.turns[0]!.drawer, "draw-swap", {}, { now: 1, players: ps, active: ps, scale: 1 });
    expect(drawModule.contentIds(s)).toHaveLength(4);
    const avoid = drawModule.contentIds(s);
    const again = drawModule.init({ drawPool: DRAW_PROMPTS, players: ps, seed: 2, season: "everyday", avoid }) as DrawState;
    expect(again.prompts.some((p) => avoid.includes(p.id))).toBe(false);
  });
});

describe("Team Draw in the room", () => {
  function room(names: string[]) {
    let t = 1_800_000_000_000;
    const engine = new RoomEngine("Draw night", { kind: "casual", timing: 2 });
    engine.clock = () => t;
    const ids = [engine.join(names[0]!, { asHost: true }).player.id];
    for (const n of names.slice(1)) ids.push(engine.join(n).player.id);
    const send = (pid: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
      engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
    return { engine, ids, send, advance: (ms: number) => { t += ms; engine.tick(); }, now: () => t };
  }

  it("a whole game with the night's teams, projected per player; then Draw & Guess deals words Team Draw didn't", () => {
    const r = room(["Keku", "Amina", "Baraka", "Wanjiru"]);
    const [k, a, b, w] = r.ids as [string, string, string, string];
    const t = r.engine.makeTeams(k, 2, 5);
    const [c1, c2] = t.list.map((x) => x.id) as [string, string];
    for (const [p, team] of [[k, c1], [a, c1], [b, c2], [w, c2]] as const) r.engine.moveToTeam(k, p, team);
    const g = r.engine.startGame(k, "team-draw", { official: false, seed: 6 });
    for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
    const game = r.engine.games.get(g.id)!;
    const st = game.extra as TeamDrawState;
    expect(st.prompts).toHaveLength(3);
    const stateOf = (pid?: string) => (pid ? (r.engine.project("player", pid) as { myGames: { id: string; state: Record<string, unknown> }[] }).myGames.find((x) => x.id === g.id)!.state : (r.engine.project("tv") as { games: { id: string; state: Record<string, unknown> }[] }).games.find((x) => x.id === g.id)!.state);
    for (let round = 0; round < 3; round++) {
      const w0 = st.prompts[round]!.word;
      for (const p of r.ids) {
        const own = JSON.stringify(stateOf(p));
        const isDrawer = Object.values(st.rounds[round]!).some((tr) => tr.drawer === p);
        expect(own.includes(`"${w0}"`), `round ${round}: ${p} drawer=${isDrawer}`).toBe(isDrawer);
      }
      expect(JSON.stringify(stateOf())).not.toContain(`"${w0}"`);
      for (const team of [c1, c2]) {
        const tr = st.rounds[round]![team]!;
        expect(r.send(tr.drawer, g.id, "team-draw-strokes", { round, ...line() }).accepted).toBe(true);
        const mate = r.ids.find((p) => st.teams.members[p] === team && p !== tr.drawer)!;
        expect(r.send(mate, g.id, "team-draw-guess", { round, text: w0 }).accepted).toBe(true);
      }
      expect(st.phase).toBe("reveal");
      r.advance(10_000);
    }
    expect(game.status).toBe("finished");
    const tv = (r.engine.project("tv")["games"] as Record<string, unknown>[]).find((x) => x["id"] === g.id)!;
    expect((tv["teamResults"] as { rank: number }[]).length).toBe(2);
    const dg = r.engine.startGame(k, "draw-guess", { official: false, seed: 6 });
    for (const p of r.ids) r.send(p, dg.id, "briefing-ready", { ready: true });
    const dgState = r.engine.games.get(dg.id)!.extra as DrawState;
    const used = new Set(st.prompts.map((p) => p.id));
    expect(dgState.prompts.some((p) => used.has(p.id))).toBe(false);
  });

  it("a takeover opens on the room's clock even when nobody acts", () => {
    const r = room(["Keku", "Amina", "Baraka", "Wanjiru", "Zawadi", "Juma"]);
    const g = r.engine.startGame(r.ids[0]!, "team-draw", { official: false, seed: 2 });
    for (const p of r.ids) r.send(p, g.id, "briefing-ready", { ready: true });
    const st = r.engine.games.get(g.id)!.extra as TeamDrawState;
    const anyTeam = Object.values(st.rounds[0]!)[0]!;
    expect(anyTeam.takeoverOpen).toBe(false);
    r.advance(TEAM_DRAW_TAKEOVER_MS - 500);
    expect(Object.values(st.rounds[0]!).some((tr) => tr.takeoverOpen)).toBe(false);
    r.advance(1_000);
    expect(Object.values(st.rounds[0]!).every((tr) => tr.takeoverOpen)).toBe(true);
  });
});
