/**
 * Review 7058937812: a Jebena Rush briefing describes the rules frozen in its match.
 *
 * `tests/fixtures/jebena-v1-briefing.json` is an actual room snapshot saved by the
 * pre-cadence engine (`af79b67`, rules version 1): a casual room, Keku and Amina,
 * and a Jebena Rush game still in its briefing. It was written by the generator in
 * `docs/evidence/jebena-category-cadence/briefing-rules/make-v1-briefing.mts` and is
 * committed byte for byte as that engine saved it.
 *
 * Recovered with today's engine, that match keeps version 1 (no streak changes), so
 * its briefing must not promise them, on the phone or on the TV. A fresh match is
 * version 2, and its briefing keeps the 5-to-8 sentence. Only the version number
 * joins the briefing projection: no seed, rotation, bank or streak count.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JEBENA_CATEGORIES } from "../src/games/modules/packs/jebena-banks.js";
import type { JebenaState } from "../src/games/modules/jebena.js";
import { RoomEngine } from "../src/server/room.js";
import { briefingRules } from "../apps/web/src/ui/mchezo/lib/briefing.js";

type Json = Record<string, unknown>;
const FIXTURE = new URL("./fixtures/jebena-v1-briefing.json", import.meta.url);
const T0 = 1_800_000_000_000;
const STREAK_SENTENCE = "After a run of 5 to 8 right answers, a new category starts.";
const V1_SENTENCE = "Each answer counts once. Time runs out: one of your cups breaks, and a new category starts.";

/** The briefing entry each surface is given: the phone's (its games list and its own games) and the TV's. */
function surfaces(engine: RoomEngine, gid: string, playerId: string) {
  const phone = engine.project("player", playerId) as { games: Json[]; myGames: Json[] };
  const tv = engine.project("tv") as { games: Json[] };
  return {
    phoneGames: phone.games.find((g) => g.id === gid)!,
    phoneMine: phone.myGames.find((g) => g.id === gid)!,
    tv: tv.games.find((g) => g.id === gid)!,
  };
}
/** The "How to play" steps the shared rules copy gives for a projected briefing entry. */
const stepsFor = (entry: Json) => briefingRules(String(entry.gameId), "", entry.rulesVersion as number | undefined).steps.join("\n");

function sender(engine: RoomEngine) {
  return (pid: string, gid: string, action: string, payload: Json = {}) =>
    engine.submitIntent({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: engine.id, gameInstanceId: gid, action, payload }, pid);
}
const st = (engine: RoomEngine, gid: string) => engine.games.get(gid)!.extra as JebenaState;
const unusedName = (s: JebenaState) => {
  const c = JEBENA_CATEGORIES.find((x) => x.id === s.category)!;
  return c.answers.find((a) => !(s.used[s.category] ?? []).includes(a.id))!.name;
};

/** Every field a briefing entry may carry (D3 S5: timing and readiness, never game state). */
const BRIEFING_KEYS = new Set(["id", "gameId", "official", "status", "season", "settings", "rulesVersion", "teams", "timedOut", "day", "players", "totalPlayers", "submittedCount", "lifecycle", "timingVersion", "briefing", "participant", "myAnswers", "myScore", "abstained"]);
function expectNoGameState(entry: Json, s: JebenaState) {
  for (const k of Object.keys(entry)) expect(BRIEFING_KEYS.has(k), `briefing key ${k}`).toBe(true);
  const text = JSON.stringify(entry);
  expect(text).not.toContain(String(s.seed));
  for (const secret of ["streak", "changeAfter", "rotation", "used", "category", "order", s.category]) expect(text, secret).not.toContain(secret);
}

describe("review 7058937812: the briefing describes the rules frozen in its match", () => {
  it("an actual version 1 briefing (saved by af79b67), recovered: phone and TV are told version 1's rules; the match plays version 1", () => {
    const snap = JSON.parse(readFileSync(FIXTURE, "utf8")) as Json;
    const engine = RoomEngine.fromJSON(snap as never);
    let t = T0 + 5_000;
    engine.clock = () => t;
    const gid = "game-1";
    const game = engine.games.get(gid)!;
    expect(game.status).toBe("briefing");
    const s = st(engine, gid);
    expect(s.rulesVersion).toBe(1);
    expect(s.streak).toBeUndefined();
    const ids = game.players;
    expect(ids).toEqual(["player-1", "player-2"]);

    for (const pid of ids) {
      const v = surfaces(engine, gid, pid);
      for (const [name, entry] of Object.entries(v)) {
        expect(entry.status, name).toBe("briefing");
        expect(entry.rulesVersion, name).toBe(1);
        const steps = stepsFor(entry);
        expect(steps, name).not.toContain("5 to 8");
        expect(steps, name).toContain(V1_SENTENCE);
        expectNoGameState(entry, s);
      }
    }

    // Both players ready: play starts, under version 1. Eight accepted answers stay in the first category.
    const send = sender(engine);
    for (const pid of ids) expect(send(pid, gid, "briefing-ready", { ready: true }).accepted).toBe(true);
    expect(engine.games.get(gid)!.status).toBe("playing");
    const first = st(engine, gid).category;
    for (let i = 0; i < 8; i++) {
      const cur = st(engine, gid);
      t += 1_000;
      expect(send(cur.turn!.player, gid, "jebena-answer", { turn: cur.turn!.n, text: unusedName(cur) }).accepted).toBe(true);
    }
    const after = st(engine, gid);
    expect(after.log.filter((e) => e.kind === "accepted")).toHaveLength(8);
    expect(after.category).toBe(first);
    expect(after.rulesVersion).toBe(1);
    expect(after.log.some((e) => e.kind === "category" && e.reason === "streak")).toBe(false);
  });

  it("a fresh match is version 2: phone and TV are told the 5-to-8 rule; only the version number joins the briefing", () => {
    const engine = new RoomEngine("JR v2 briefing", { kind: "casual", timing: 2 });
    engine.clock = () => T0;
    const host = engine.join("Keku", { asHost: true }).player.id;
    const guest = engine.join("Amina").player.id;
    const g = engine.startGame(host, "jebena-rush", { official: false });
    const s = st(engine, g.id);
    expect(engine.games.get(g.id)!.status).toBe("briefing");
    expect(s.rulesVersion).toBe(2);
    for (const pid of [host, guest]) {
      for (const [name, entry] of Object.entries(surfaces(engine, g.id, pid))) {
        expect(entry.rulesVersion, name).toBe(2);
        expect(stepsFor(entry), name).toContain(STREAK_SENTENCE);
        expectNoGameState(entry, s);
      }
    }
  });

  it("a game without a frozen rules version gets no version in its briefing, and its usual rules", () => {
    const engine = new RoomEngine("Spectrum briefing", { kind: "casual", timing: 2 });
    engine.clock = () => T0;
    const host = engine.join("Keku", { asHost: true }).player.id;
    engine.join("Amina");
    const g = engine.startGame(host, "pattern-pulse", { official: false });
    const entry = surfaces(engine, g.id, host).tv;
    expect(entry.status).toBe("briefing");
    expect("rulesVersion" in entry).toBe(false);
    expect(briefingRules("pattern-pulse", "", undefined)).toEqual(briefingRules("pattern-pulse", ""));
  });

  it("the shared copy: version 1 drops only the streak sentence; version 2, a missing version and an unknown one get today's rules", () => {
    const today = briefingRules("jebena-rush", "");
    const v1 = briefingRules("jebena-rush", "", 1);
    expect(today.steps.join("\n")).toContain(STREAK_SENTENCE);
    expect(v1.objective).toBe(today.objective);
    expect(v1.steps).toHaveLength(today.steps.length);
    const differing = v1.steps.map((x, i) => [x, today.steps[i]] as const).filter(([a, b]) => a !== b);
    expect(differing).toEqual([[V1_SENTENCE, today.steps.find((x) => x.includes(STREAK_SENTENCE))]]);
    expect(briefingRules("jebena-rush", "", 2)).toEqual(today);
    expect(briefingRules("jebena-rush", "", 99)).toEqual(today);
  });
});
