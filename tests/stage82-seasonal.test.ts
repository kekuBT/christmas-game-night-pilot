// Stage 8.2 (docs/stage8/stage82.md): seasonal content kept apart. Items carry
// a season tag (metadata, never text matching); a solo or casual session's
// content (Everyday unless Christmas is chosen) decides what may be dealt, and
// is bound to each game at its start. A Family Cup's selection never reads it.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, itemHash, loadContent, type ContentLibrary } from "../src/content/registry.js";
import { CONTENT_GAMES, type ContentGameId } from "../src/content/schema.js";
import { recordUsage, selectContent, type UsageHistory } from "../src/content/select.js";
import { REVIEWED_YEAR_ROUND, seasonAuditFindings } from "../src/content/seasonAudit.js";
import { ITEMS_PER_GAME } from "../src/content/materialize.js";
import { drawPromptsFor } from "../src/games/modules/draw.js";
import { DRAW_PROMPTS } from "../src/games/modules/packs/draw-prompts.js";
import { moduleRng, seededShuffle } from "../src/games/modules/types.js";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine, type SessionAttempt } from "../src/server/room.js";
import { seasonAllows, type SessionSeason } from "../src/shared/season.js";

const TODAY = "2026-11-11";
const shipped = loadContent(DEFAULT_CONTENT_DIR);

/** The spec's §8 list: every item tagged season "christmas". */
const CHRISTMAS_ITEMS = [
  "trv-fest-101", "trv-fest-102", "trv-fest-103", "trv-fest-104", "trv-fest-105", "trv-fest-106", "trv-fest-107", "trv-fest-108", "trv-fest-109", "trv-fest-110", "trv-lite-046",
  "con-legacy-1", "con-s4-03",
  "cap-legacy-1", "cap-legacy-2", "cap-legacy-3", "cap-legacy-4", "cap-legacy-5", "cap-s4-005", "cap-s4-006", "cap-s4-028",
  "chr-legacy-1", "chr-legacy-2", "chr-legacy-3", "chr-legacy-4", "chr-legacy-5", "chr-legacy-6", "chr-s4-032", "chr-s4-062", "chr-s4-076",
  "imp-legacy-1", "imp-legacy-2", "imp-legacy-3", "imp-legacy-4", "imp-legacy-5", "imp-legacy-6",
  "spr-s4-015", "spr-legacy-3",
  "cls-k-27",
  "year-s4-043", "year-s4-044", "year-s4-045",
].sort();
const CHRISTMAS_PROMPTS = ["dg-002", "dg-003", "dg-004"];

const christmasIds = (lib: ContentLibrary) => new Set([...lib.items.values()].filter((li) => li.item.season === "christmas").map((li) => li.item.id));
const isChristmas = (lib: ContentLibrary, id: string) => lib.items.get(id)?.item.season === "christmas";

/** A copy of the shipped packs (and Sprint references) in a temp dir, edited by `edit(packFile, pack)`. */
function editedLibrary(edit: (file: string, pack: { items: Record<string, unknown>[] }) => void): ContentLibrary {
  const dir = mkdtempSync(join(tmpdir(), "mz-s82-lib-"));
  mkdirSync(join(dir, "packs"), { recursive: true });
  cpSync(join(DEFAULT_CONTENT_DIR, "reference"), join(dir, "reference"), { recursive: true });
  for (const file of readdirSync(join(DEFAULT_CONTENT_DIR, "packs")).filter((f) => f.endsWith(".json"))) {
    const pack = JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, "packs", file), "utf8")) as { items: Record<string, unknown>[] };
    edit(file, pack);
    writeFileSync(join(dir, "packs", file), JSON.stringify(pack));
  }
  return loadContent(dir);
}

describe("the season tag (§3.2)", () => {
  it("the shipped library tags exactly the §8 list, and Draw & Guess exactly its three Christmas prompts", () => {
    expect(shipped.problems).toEqual([]);
    expect([...christmasIds(shipped)].sort()).toEqual(CHRISTMAS_ITEMS);
    expect(DRAW_PROMPTS.filter((p) => p.season === "christmas").map((p) => p.id)).toEqual(CHRISTMAS_PROMPTS);
  });

  it("is a closed list: a typo fails loading the item (it is never silently year-round)", () => {
    const lib = editedLibrary((file, pack) => { if (file === "word-connections-s4.json") pack.items[0]!["season"] = "xmas"; });
    expect(lib.problems.some((p) => /season/.test(p.message))).toBe(true);
    expect(lib.items.has("con-s4-01")).toBe(false);
  });

  it("is outside the content hash: tagging changed no shipped item's hash (approvals and frozen briefings stay valid)", () => {
    // The hash as computed before Stage 8.2: everything but `review`.
    const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]`
      : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v);
    const before = (gameId: string, item: Record<string, unknown>) => {
      const { review: _r, ...rest } = item; void _r;
      return createHash("sha256").update(`${gameId}\n${stable(rest)}`).digest("hex").slice(0, 16);
    };
    let tagged = 0;
    for (const li of shipped.items.values()) {
      const { season, ...untagged } = li.item as unknown as Record<string, unknown>;
      if (season) tagged += 1;
      expect(li.hash).toBe(before(li.gameId, untagged));
    }
    expect(tagged).toBe(42);
    // Everything players see is still in the hash.
    const one = shipped.items.get("con-s4-03")!;
    expect(itemHash(one.gameId, { ...(one.item as object), category: "Changed" })).not.toBe(one.hash);
  });

  it("the audit (an editorial net, never a filter) finds nothing untagged in the shipped library, and finds an untagged Christmas item", () => {
    expect(seasonAuditFindings(shipped)).toEqual([]);
    const lib = editedLibrary((file, pack) => { if (file === "word-connections-s4.json") for (const it of pack.items) if (it["id"] === "con-s4-03") delete it["season"]; });
    expect(seasonAuditFindings(lib).map((f) => f.itemId)).toEqual(["con-s4-03"]);
    // Reviewed year-round items are listed with a reason, and exist.
    for (const id of Object.keys(REVIEWED_YEAR_ROUND)) expect(shipped.items.has(id)).toBe(true);
  });
});

describe("selection (§3.3)", () => {
  function deal(lib: ContentLibrary, roomKind: "casual" | "solo", gameId: ContentGameId, n: number, season: SessionSeason, cupId = "room-s82") {
    const usage: UsageHistory = {};
    const games: string[][] = [];
    for (let seq = 0; seq < n; seq++) {
      const count = gameId === "charades" ? Math.max(ITEMS_PER_GAME.charades, 12) : ITEMS_PER_GAME[gameId];
      const r = selectContent({ lib, gameId, count, mode: "practice", roomKind, cupId, usage, seq, today: TODAY, season });
      if (!r.ok) throw new Error(r.message);
      recordUsage(usage, r.items, { gameInstanceId: `g${seq}`, day: 1, mode: "practice", seq });
      games.push(r.items.map((li) => li.item.id));
    }
    return games;
  }

  it("Everyday never deals a Christmas-only item, in any content game, room kind or room, over many games", () => {
    for (const gameId of CONTENT_GAMES) for (const roomKind of ["casual", "solo"] as const) for (const cupId of ["room-a", "room-b", "room-c"]) {
      const dealt = deal(shipped, roomKind, gameId, 30, "everyday", cupId).flat();
      expect(dealt.filter((id) => isChristmas(shipped, id))).toEqual([]);
      expect(dealt.length).toBeGreaterThan(0);
    }
  });

  it("Christmas: unused Christmas items first, then the year-round ones, then least recently used, whatever their season", () => {
    // Connections: one board per game; 2 Christmas boards then the other 11, then a repeat of the oldest.
    const boards = deal(shipped, "casual", "word-connections", 14, "christmas").map((g) => g[0]!);
    expect(new Set(boards.slice(0, 2))).toEqual(new Set(["con-legacy-1", "con-s4-03"]));
    expect(boards.slice(2, 13).some((id) => isChristmas(shipped, id))).toBe(false);
    expect(new Set(boards.slice(0, 13)).size).toBe(13);
    expect(boards[13]).toBe(boards[0]);
    // Trivia: 10 per game; 11 Christmas questions, so the first game is all Christmas and the second leads with the last one.
    const [g1, g2] = deal(shipped, "solo", "trivia", 2, "christmas");
    expect(g1!.every((id) => isChristmas(shipped, id))).toBe(true);
    expect(g2!.filter((id) => isChristmas(shipped, id)).length).toBe(1);
  });

  it("deterministic: the same library, history, sequence and content give the same items", () => {
    for (const season of ["everyday", "christmas"] as const) {
      expect(deal(shipped, "casual", "trivia", 4, season, "room-det")).toEqual(deal(shipped, "casual", "trivia", 4, season, "room-det"));
    }
  });

  it("an empty eligible pool refuses in plain words and never borrows from the other season", () => {
    // A library whose every Connections board is Christmas.
    const lib = editedLibrary((file, pack) => { if (file.startsWith("word-connections")) for (const it of pack.items) it["season"] = "christmas"; });
    const req = { lib, gameId: "word-connections" as const, count: 1, mode: "practice" as const, roomKind: "casual" as const, cupId: "c", usage: {}, seq: 0, today: TODAY };
    expect(selectContent({ ...req, season: "everyday" })).toMatchObject({ ok: false, reason: "insufficient-content", message: "No Everyday content is available for this game yet." });
    expect(selectContent({ ...req, season: "christmas" }).ok).toBe(true);
  });

  it("a solo or casual request must name its content; a Cup request must not (no default either way)", () => {
    const base = { lib: shipped, gameId: "word-connections" as const, count: 1, mode: "practice" as const, cupId: "c", usage: {}, seq: 0, today: TODAY };
    expect(() => selectContent({ ...base, roomKind: "casual" })).toThrow(/needs the session's content/);
    expect(() => selectContent({ ...base, roomKind: "solo" })).toThrow(/needs the session's content/);
    expect(() => selectContent({ ...base, roomKind: "cup", season: "everyday" })).toThrow(/isn't chosen by season/);
    expect(selectContent({ ...base, roomKind: "cup" }).ok).toBe(true);
  });

  it("a Cup still deals Christmas content (the Family Cup is unchanged)", () => {
    const usage: UsageHistory = {};
    const seen = new Set<string>();
    for (let seq = 0; seq < 13; seq++) {
      const r = selectContent({ lib: shipped, gameId: "word-connections", count: 1, mode: "practice", roomKind: "cup", cupId: "cup-s82", usage, seq, today: TODAY });
      if (!r.ok) throw new Error(r.message);
      recordUsage(usage, r.items, { gameInstanceId: `g${seq}`, day: 1, mode: "practice", seq });
      seen.add(r.items[0]!.item.id);
    }
    expect([...seen].some((id) => isChristmas(shipped, id))).toBe(true);
  });

  it("seasonAllows: Everyday takes year-round only; Christmas takes both", () => {
    expect([seasonAllows("everyday", undefined), seasonAllows("everyday", "christmas"), seasonAllows("christmas", undefined), seasonAllows("christmas", "christmas")]).toEqual([true, false, true, true]);
  });
});

describe("Draw & Guess prompts (§3.3)", () => {
  it("a Cup game (no season) deals exactly as before Stage 8.2", () => {
    for (const seed of [1, 7, 42, 99]) expect(drawPromptsFor(undefined, moduleRng(seed))).toEqual(seededShuffle(DRAW_PROMPTS, moduleRng(seed)));
  });
  it("Everyday: the 67 year-round prompts only; Christmas: its three Christmas prompts first", () => {
    for (const seed of [1, 7, 42]) {
      const every = drawPromptsFor("everyday", moduleRng(seed));
      expect([every.length, every.some((p) => p.season)]).toEqual([67, false]);
      const xmas = drawPromptsFor("christmas", moduleRng(seed));
      expect([xmas.length, new Set(xmas.slice(0, 3).map((p) => p.id))]).toEqual([70, new Set(CHRISTMAS_PROMPTS)]);
    }
  });
  it("a room's game binds it: an Everyday casual Draw & Guess game holds no Christmas prompt", () => {
    for (let i = 0; i < 20; i++) {
      const engine = new RoomEngine("Party", { kind: "casual" });
      const host = engine.join("Ada", { asHost: true }).player.id;
      engine.join("Bea"); engine.join("Cy");
      const g = engine.startGame(host, "draw-guess", { official: false, seed: 1000 + i });
      expect((g.extra as { prompts: { season?: string }[] }).prompts.some((p) => p.season)).toBe(false);
      expect(g.season).toBe("everyday");
    }
  });
});

describe("the session's content, in a room (§3.4)", () => {
  const codeOf = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as { code?: string; message?: string }).code ?? (e as Error).message; } return undefined; };
  const restart = (engine: RoomEngine) => RoomEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>);
  const boardOf = (engine: RoomEngine, gid: string) => (engine.games.get(gid)!.extra as { boardId: string }).boardId;
  function casual(timing?: 2) {
    const engine = new RoomEngine("Party", { kind: "casual", ...(timing ? { timing } : {}) });
    engine.content = shipped;
    const host = engine.join("Ada", { asHost: true }).player.id;
    const guest = engine.join("Bea").player.id;
    return { engine, host, guest };
  }
  let n = 0;
  const press = (engine: RoomEngine): SessionAttempt => ({ id: `s82-press-${String(++n).padStart(4, "0")}`, sessionRevision: engine.session.revision });

  it("a new casual or solo room is Everyday; a Cup has no content choice", () => {
    expect(new RoomEngine("x", { kind: "casual" }).contentSeason).toBe("everyday");
    expect(new RoomEngine("x", { kind: "solo" }).contentSeason).toBe("everyday");
    const cup = new RoomEngine("x", { kind: "cup" });
    expect(cup.toJSON()["contentSeason"]).toBeUndefined();
  });

  it("the host or a cohost changes it, against the current revision; a guest, a Cup or a solo room cannot", () => {
    const { engine, host, guest } = casual();
    expect(codeOf(() => engine.setContentSeason(guest, "christmas", engine.session.revision))).toBe("NOT_HOST");
    const r0 = engine.session.revision;
    expect(engine.setContentSeason(host, "christmas", r0)).toMatchObject({ contentSeason: "christmas", changed: true, session: { revision: r0 + 1 } });
    // The same again (a retry, a second tab): unchanged, even against the old revision.
    expect(engine.setContentSeason(host, "christmas", r0)).toMatchObject({ contentSeason: "christmas", changed: false });
    // A delayed change made against the old revision never undoes the newer one.
    expect(codeOf(() => engine.setContentSeason(host, "everyday", r0))).toBe("SESSION_CONFLICT");
    expect(engine.contentSeason).toBe("christmas");
    engine.cohosts.add(guest);
    expect(engine.setContentSeason(guest, "everyday", engine.session.revision).changed).toBe(true);
    const cup = new RoomEngine("Cup", { kind: "cup" });
    const cupHost = cup.join("Ada", { asHost: true }).player.id;
    expect(codeOf(() => cup.setContentSeason(cupHost, "christmas", 0))).toBe("NOT_A_CASUAL_ROOM");
    const solo = new RoomEngine("Solo", { kind: "solo" });
    const me = solo.join("You", { asHost: true }).player.id;
    expect(codeOf(() => solo.setContentSeason(me, "christmas", 0))).toBe("NOT_A_CASUAL_ROOM");
  });

  it("a casual Start is bound to the content its presser saw: a mismatch is refused and starts nothing; the game records its content", () => {
    const { engine, host } = casual();
    engine.setContentSeason(host, "christmas", engine.session.revision);
    const before = JSON.stringify([engine.contentUsage, engine.contentSeq, engine.games.size]);
    // A press from a screen that still showed Everyday (its revision is current: say the change arrived in between).
    expect(codeOf(() => engine.startChosen(host, "word-connections", { official: false, attempt: press(engine), season: "everyday" }))).toBe("CONTENT_CHANGED");
    expect(JSON.stringify([engine.contentUsage, engine.contentSeq, engine.games.size])).toBe(before);
    const g = engine.startChosen(host, "word-connections", { official: false, attempt: press(engine), season: "christmas" }).game;
    expect([g.season, isChristmas(shipped, boardOf(engine, g.id))]).toEqual(["christmas", true]);
  });

  it("a press made before a content change is stale (the change moved the revision on); its replay returns the bound game", () => {
    const { engine, host } = casual();
    const a = press(engine);
    const g = engine.startChosen(host, "word-connections", { official: false, attempt: a, season: "everyday" }).game;
    engine.games.get(g.id)!.status = "finished";
    const stalePress = press(engine);
    engine.setContentSeason(host, "christmas", engine.session.revision);
    expect(codeOf(() => engine.startChosen(host, "word-connections", { official: false, attempt: stalePress, season: "everyday" }))).toBe("SESSION_CONFLICT");
    // The first press again (a lost reply): its game, still Everyday.
    const again = engine.startChosen(host, "word-connections", { official: false, attempt: a, season: "everyday" });
    expect([again.replay, again.game.id, again.game.season]).toEqual([true, g.id, "everyday"]);
  });

  it("Play again and the lineup's next game use the room's current content; a body without content (an older page) gets the room's", () => {
    const { engine, host } = casual();
    engine.setContentSeason(host, "christmas", engine.session.revision);
    const g1 = engine.startChosen(host, "word-connections", { official: false, attempt: press(engine) }).game;
    expect(g1.season).toBe("christmas");
    engine.games.get(g1.id)!.status = "finished";
    expect(codeOf(() => engine.startRematch(host, g1.id, { attempt: press(engine), season: "everyday" }))).toBe("CONTENT_CHANGED");
    const g2 = engine.startRematch(host, g1.id, { attempt: press(engine), season: "christmas" }).game;
    expect(g2.season).toBe("christmas");
  });

  it("a game in play keeps its content when the host changes the room's", () => {
    const { engine, host } = casual();
    const g = engine.startChosen(host, "word-connections", { official: false, attempt: press(engine), season: "everyday" }).game;
    engine.setContentSeason(host, "christmas", engine.session.revision);
    expect([engine.games.get(g.id)!.season, engine.contentSeason]).toEqual(["everyday", "christmas"]);
  });

  it("a briefing freezes its content; play begins only if its items still suit it (an older frozen briefing is checked as Everyday)", () => {
    const { engine, host, guest } = casual(2);
    engine.setContentSeason(host, "christmas", engine.session.revision);
    const g = engine.startChosen(host, "word-connections", { official: false, attempt: press(engine), season: "christmas" }).game;
    expect([g.status, g.pendingContent?.season]).toEqual(["briefing", "christmas"]);
    const frozen = g.pendingContent!.items[0]!.itemId;
    expect(isChristmas(shipped, frozen)).toBe(true);
    // The host switches the room back to Everyday during the briefing: the frozen game keeps Christmas.
    engine.setContentSeason(host, "everyday", engine.session.revision);
    // A restart in between keeps the frozen content and its season.
    const back = restart(engine); back.content = shipped;
    expect(back.games.get(g.id)!.pendingContent?.season).toBe("christmas");
    const ok = back.startNow(host, g.id, { confirmed: [host, guest] }, g.briefing!.startNowAt + 1);
    expect([ok.started, boardOf(back, g.id)]).toEqual([true, frozen]);

    // The same briefing frozen before Stage 8.2 (no season): checked as Everyday, so it never begins play with a Christmas board.
    const old = casual(2);
    old.engine.setContentSeason(old.host, "christmas", old.engine.session.revision);
    const og = old.engine.startChosen(old.host, "word-connections", { official: false, attempt: press(old.engine), season: "christmas" }).game;
    delete og.pendingContent!.season;
    const r = old.engine.startNow(old.host, og.id, { confirmed: [old.host, old.guest] }, og.briefing!.startNowAt + 1);
    expect([r.started, r.cancelled]).toEqual([false, "content-changed"]);
  });

  it("a Cup Start naming a season is refused", () => {
    const cup = new RoomEngine("Cup", { kind: "cup" });
    const h = cup.join("Ada", { asHost: true }).player.id;
    cup.join("Bea");
    expect(codeOf(() => cup.startGame(h, "trivia", { official: false, season: "everyday" }))).toMatch(/isn't chosen by season/);
  });

  it("solo: the Start carries the choice; the room keeps it; a replay is the same press only with the same content", () => {
    const engine = new RoomEngine("Solo", { kind: "solo" });
    engine.content = shipped;
    const me = engine.join("You", { asHost: true }).player.id;
    const a = press(engine);
    const g = engine.startChosen(me, "word-connections", { official: false, attempt: a, season: "christmas" }).game;
    expect([g.season, engine.contentSeason, isChristmas(shipped, boardOf(engine, g.id))]).toEqual(["christmas", "christmas", true]);
    expect(engine.startChosen(me, "word-connections", { official: false, attempt: a, season: "christmas" }).replay).toBe(true);
    expect(codeOf(() => engine.startChosen(me, "word-connections", { official: false, attempt: a, season: "everyday" }))).toMatch(/already used for something else/);
    // Back to Everyday: a new press.
    const g2 = engine.startChosen(me, "word-connections", { official: false, attempt: press(engine), season: "everyday" }).game;
    expect([g2.season, engine.contentSeason, isChristmas(shipped, boardOf(engine, g2.id))]).toEqual(["everyday", "everyday", false]);
  });

  it("persisted: the room's content, each game's and a solo press's survive a restart; an older or damaged snapshot is Everyday", () => {
    const { engine, host } = casual();
    engine.setContentSeason(host, "christmas", engine.session.revision);
    const g = engine.startChosen(host, "word-connections", { official: false, attempt: press(engine), season: "christmas" }).game;
    const back = restart(engine);
    expect([back.contentSeason, back.games.get(g.id)!.season]).toEqual(["christmas", "christmas"]);
    for (const value of [undefined, "summer", 3]) {
      const data = JSON.parse(JSON.stringify(engine.toJSON())) as Record<string, unknown>;
      if (value === undefined) delete data["contentSeason"]; else data["contentSeason"] = value;
      expect(RoomEngine.fromJSON(data).contentSeason).toBe("everyday");
    }
    const solo = new RoomEngine("Solo", { kind: "solo" });
    solo.content = shipped;
    const me = solo.join("You", { asHost: true }).player.id;
    const a = press(solo);
    solo.startChosen(me, "word-connections", { official: false, attempt: a, season: "christmas" });
    const sb = restart(solo); sb.content = shipped;
    expect(sb.contentSeason).toBe("christmas");
    expect(codeOf(() => sb.startChosen(me, "word-connections", { official: false, attempt: a, season: "everyday" }))).toMatch(/already used for something else/);
  });

  it("the projection shows a solo or casual room's content and each game's (never a device look); a Cup's shows none", () => {
    const { engine, host } = casual();
    engine.setContentSeason(host, "christmas", engine.session.revision);
    engine.startChosen(host, "word-connections", { official: false, attempt: press(engine), season: "christmas" });
    const proj = engine.project("player", host);
    expect(proj["contentSeason"]).toBe("christmas");
    expect((proj["games"] as { season?: string }[])[0]!.season).toBe("christmas");
    expect(JSON.stringify(proj)).not.toMatch(/"look"/);
    const cup = new RoomEngine("Cup", { kind: "cup" });
    const h = cup.join("Ada", { asHost: true }).player.id;
    expect(cup.project("player", h)["contentSeason"]).toBeUndefined();
  });
});

describe("over HTTP (§3.4)", () => {
  let dataDir = "";
  let server: LocalServer; let base = "";
  beforeAll(async () => { dataDir = mkdtempSync(join(tmpdir(), "mz-s82-http-")); server = new LocalServer({ dataDir, content: shipped }); base = `http://127.0.0.1:${await server.listen(0)}`; });
  afterAll(async () => { await server.close(); });
  const call = async (method: string, path: string, body?: unknown, token?: string, at = base) => {
    const r = await fetch(`${at}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
  };
  async function room(kind: "casual" | "cup" | "solo") {
    const made = (await call("POST", "/rooms", { kind })).body;
    const id = String(made["roomId"]);
    const host = String((await call("POST", `/rooms/${id}/join`, { displayName: "Ada", asHost: true, hostClaimToken: made["hostClaimToken"] })).body["recoveryToken"]);
    const guest = kind === "solo" ? "" : String((await call("POST", `/rooms/${id}/join`, { displayName: "Bea" })).body["recoveryToken"]);
    return { id, host, guest };
  }
  const revisionOf = async (id: string, token: string) => ((await call("GET", `/rooms/${id}/projection?audience=player`, undefined, token)).body["session"] as { revision: number }).revision;

  it("a host sets a casual room's content; a guest is refused; a bad value or a Cup is refused; the projection and a restart keep it", async () => {
    const { id, host, guest } = await room("casual");
    expect((await call("GET", `/rooms/${id}/projection?audience=player`, undefined, guest)).body["contentSeason"]).toBe("everyday");
    expect((await call("POST", `/rooms/${id}/season`, { season: "christmas", baseRevision: 0 }, guest)).status).toBe(403);
    expect((await call("POST", `/rooms/${id}/season`, { season: "xmas", baseRevision: 0 }, host)).status).toBe(400);
    expect((await call("POST", `/rooms/${id}/season`, { season: "christmas", baseRevision: 0, look: "christmas" }, host)).status).toBe(400);
    const set = await call("POST", `/rooms/${id}/season`, { season: "christmas", baseRevision: await revisionOf(id, host) }, host);
    expect([set.status, set.body["contentSeason"], set.body["unchanged"]]).toEqual([200, "christmas", undefined]);
    expect((await call("POST", `/rooms/${id}/season`, { season: "christmas", baseRevision: 0 }, host)).body["unchanged"]).toBe(true);
    const stale = await call("POST", `/rooms/${id}/season`, { season: "everyday", baseRevision: 0 }, host);
    expect([stale.status, stale.body["code"], stale.body["contentSeason"]]).toEqual([409, "SESSION_CONFLICT", "christmas"]);
    expect((await call("GET", `/rooms/${id}/projection?audience=player`, undefined, guest)).body["contentSeason"]).toBe("christmas");
    const cup = await room("cup");
    expect((await call("POST", `/rooms/${cup.id}/season`, { season: "christmas", baseRevision: 0 }, cup.host)).body["code"]).toBe("NOT_A_CASUAL_ROOM");
    const later = new LocalServer({ dataDir, content: shipped });
    const at = `http://127.0.0.1:${await later.listen(0)}`;
    try {
      expect((await call("GET", `/rooms/${id}/projection?audience=player`, undefined, guest, at)).body["contentSeason"]).toBe("christmas");
    } finally { await later.close(); }
  });

  it("a Start carries the content seen: a bad value is 400, a mismatch 409 CONTENT_CHANGED with the room's content; a match starts that content", async () => {
    const { id, host } = await room("casual");
    await call("POST", `/rooms/${id}/season`, { season: "christmas", baseRevision: await revisionOf(id, host) }, host);
    const roster = ((await call("GET", `/rooms/${id}/projection?audience=player`, undefined, host)).body["readiness"] as { wouldPlay: string[] }).wouldPlay;
    const start = async (season: unknown, attemptId: string) => call("POST", `/rooms/${id}/games`, { gameId: "word-connections", official: false, roster, season, attempt: { id: attemptId, sessionRevision: await revisionOf(id, host) } }, host);
    expect((await start("summer", "s82-http-1")).status).toBe(400);
    const wrong = await start("everyday", "s82-http-2");
    expect([wrong.status, wrong.body["code"], wrong.body["contentSeason"]]).toEqual([409, "CONTENT_CHANGED", "christmas"]);
    const ok = await start("christmas", "s82-http-3");
    expect(ok.status).toBe(201);
    const g = server.rooms.get(id)!.games.get(String(ok.body["gameId"]))!;
    expect([g.season, isChristmas(shipped, (g.pendingContent?.items[0]?.itemId ?? (g.extra as { boardId: string }).boardId))]).toEqual(["christmas", true]);
  });

  it("a Cup Start naming a season is refused (400); a solo Start binds the solo room's content", async () => {
    const cup = await room("cup");
    expect((await call("POST", `/rooms/${cup.id}/games`, { gameId: "trivia", official: false, season: "everyday" }, cup.host)).status).toBe(400);
    const solo = await room("solo");
    const r = await call("POST", `/rooms/${solo.id}/games`, { gameId: "word-connections", official: false, season: "christmas", attempt: { id: "s82-solo-1", sessionRevision: 0 } }, solo.host);
    expect(r.status).toBe(201);
    expect((await call("GET", `/rooms/${solo.id}/projection?audience=player`, undefined, solo.host)).body["contentSeason"]).toBe("christmas");
  });
});
