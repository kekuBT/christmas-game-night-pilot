// Stage 8.2 (docs/stage8/stage82.md §3.1, §3.6): a device's look, kept apart
// from a session's content; both themes' readable contrast; and the solo
// client sending its content choice with every Start.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR, loadContent } from "../src/content/registry.js";
import { LocalServer } from "../src/server/http.js";
import type { RoomEngine } from "../src/server/room.js";
import { LOOK_KEY, lookChoice, lookTheme, readLookPref, resolveLook, writeLookPref, type LookContext, type LookPref } from "../apps/web/src/ui/mchezo/look.js";
import { readSoloSeason, SOLO_SEASON_KEY, soloSeasonChoice, writeSoloSeason } from "../apps/web/src/solo/soloSeason.js";
import { themes, themeToCssVars, type MchezoTheme } from "../apps/web/src/ui/mchezo/tokens/tokens.js";
import { forgetPageSeat, SoloSession } from "../apps/web/src/solo/soloSession.js";

describe("the look (§3.1)", () => {
  const ctxs: Record<string, LookContext> = {
    home: { kind: "none" },
    soloEveryday: { kind: "solo", season: "everyday" },
    soloChristmas: { kind: "solo", season: "christmas" },
    casualEveryday: { kind: "casual", season: "everyday" },
    casualChristmas: { kind: "casual", season: "christmas" },
    casualOld: { kind: "casual" },
    cup: { kind: "cup" },
  };
  it("Match the game: Christmas only for a solo or casual session dealing Christmas content; Everyday for a Cup, home and the library", () => {
    const got = Object.fromEntries(Object.entries(ctxs).map(([k, c]) => [k, resolveLook("auto", c)]));
    expect(got).toEqual({ home: "everyday", soloEveryday: "everyday", soloChristmas: "christmas", casualEveryday: "everyday", casualChristmas: "christmas", casualOld: "everyday", cup: "everyday" });
  });
  it("a pinned look wins everywhere, whatever the content", () => {
    for (const pref of ["everyday", "christmas"] as LookPref[]) for (const c of Object.values(ctxs)) expect(resolveLook(pref, c)).toBe(pref);
  });
  it("each look is the existing theme (no new design): Everyday is the platform skin, Christmas the seasonal one", () => {
    expect(lookTheme("everyday")).toBe(themes.everyday);
    expect(lookTheme("christmas")).toBe(themes.christmas);
    expect(themes.christmas.ring.style).toBe("wreath");
    expect(themeToCssVars(themes.christmas)["--mz-danger"]).toBeDefined();
  });
});

describe("stored choices degrade safely (feedback 6795825877, 5)", () => {
  const g = globalThis as unknown as { localStorage?: unknown };
  const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const use = (store: unknown) => Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, "localStorage", saved); else delete g.localStorage;
    lookChoice.resetForTests(); soloSeasonChoice.resetForTests();
  });
  const map = (entries: Record<string, string>) => ({ getItem: (k: string) => entries[k] ?? null, setItem: () => {}, removeItem: () => {} });
  it("a missing, unknown or damaged value falls back: Match the game, and Everyday content", () => {
    for (const v of [undefined, "", "summer", "CHRISTMAS", "{\"x\":1}"]) {
      use(map(v === undefined ? {} : { [LOOK_KEY]: v, [SOLO_SEASON_KEY]: v }));
      expect([readLookPref(), readSoloSeason()]).toEqual(["auto", "everyday"]);
    }
    use(map({ [LOOK_KEY]: "christmas", [SOLO_SEASON_KEY]: "christmas" }));
    expect([readLookPref(), readSoloSeason()]).toEqual(["christmas", "christmas"]);
  });
  it("storage that throws (private mode, blocked site data) or is missing altogether: the same defaults, no error", () => {
    use({ getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } });
    expect([readLookPref(), readSoloSeason()]).toEqual(["auto", "everyday"]);
    use(undefined);
    expect([readLookPref(), readSoloSeason()]).toEqual(["auto", "everyday"]);
  });
});

describe("repair R82-01 (review 6799134510): a choice that can't be saved is never undone on this page", () => {
  const g = globalThis as unknown as { localStorage?: unknown };
  const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const use = (store: unknown) => Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, "localStorage", saved); else delete g.localStorage;
    lookChoice.resetForTests(); soloSeasonChoice.resetForTests();
  });
  /** Reads work; every write throws (a full or blocked store). */
  const writesThrow = (entries: Record<string, string>) => ({ getItem: (k: string) => entries[k] ?? null, setItem: () => { throw new DOMException("quota", "QuotaExceededError"); }, removeItem: () => {} });
  const cases: [string, () => unknown][] = [
    ["writes throw, nothing stored yet", () => writesThrow({})],
    ["writes throw, an older choice stored", () => writesThrow({ [LOOK_KEY]: "everyday", [SOLO_SEASON_KEY]: "everyday" })],
    ["every access throws", () => ({ getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("SecurityError"); } })],
    ["no storage at all", () => undefined],
  ];
  for (const [name, store] of cases) {
    it(`${name}: the new look and content stay chosen, every reader sees them, and the page says they weren't saved`, () => {
      use(store());
      const seen: string[] = [];
      expect(writeLookPref("christmas")).toBe(false);
      expect(writeSoloSeason("christmas")).toBe(false);
      seen.push(readLookPref(), readSoloSeason());
      expect(seen).toEqual(["christmas", "christmas"]);
      expect([lookChoice.saved(), soloSeasonChoice.saved()]).toEqual([false, false]);
      // Back again, still unsaved: the page follows the latest choice.
      writeSoloSeason("everyday");
      expect(readSoloSeason()).toBe("everyday");
    });
  }
  it("a working store: saved, and the stored value matches", () => {
    const entries: Record<string, string> = {};
    use({ getItem: (k: string) => entries[k] ?? null, setItem: (k: string, v: string) => { entries[k] = v; }, removeItem: () => {} });
    expect([writeLookPref("christmas"), writeSoloSeason("christmas")]).toEqual([true, true]);
    expect([entries[LOOK_KEY], entries[SOLO_SEASON_KEY], lookChoice.saved()]).toEqual(["christmas", "christmas", true]);
  });
});

describe("readable contrast in both themes (§3.6; the design handoff's pairs, WCAG AA 4.5:1)", () => {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [16, 8, 0].map((s) => ((n >> s) & 255) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  for (const t of [themes.everyday, themes.christmas] as MchezoTheme[]) {
    it(`${t.id}: text, muted text, success, highlight and danger on the ground and both surfaces; on-accent on every answer colour and the brand`, () => {
      const c = t.color;
      const low: string[] = [];
      for (const fg of ["text", "textMuted", "success", "highlight", "danger"] as const) for (const bg of ["ground", "surface1", "surface2"] as const) {
        const r = ratio(c[fg], c[bg]);
        if (r < 4.5) low.push(`${fg}/${bg} ${r.toFixed(2)}`);
      }
      for (const [i, a] of c.answer.entries()) { const r = ratio(c.onAccent, a); if (r < 4.5) low.push(`onAccent/answer${i} ${r.toFixed(2)}`); }
      for (const k of ["brand", "highlight", "success", "text"] as const) { const r = ratio(c.onAccent, c[k]); if (r < 4.5) low.push(`onAccent/${k} ${r.toFixed(2)}`); }
      expect(low).toEqual([]);
    });
  }
});

describe("the solo client sends its content choice (§3.4)", () => {
  const shipped = loadContent(DEFAULT_CONTENT_DIR);
  let server: LocalServer; let base = "";
  const realFetch = globalThis.fetch;
  const sessions: SoloSession[] = [];
  const bodies: Record<string, unknown>[] = [];
  beforeAll(async () => { server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-s82-solo-")), content: shipped }); base = `http://127.0.0.1:${await server.listen(0)}`; });
  afterAll(async () => { await server.close(); });
  beforeEach(() => { forgetPageSeat(); bodies.length = 0; });
  afterEach(() => { for (const s of sessions.splice(0)) s.dispose(); });
  const session = () => {
    const f = (async (input: string, init: RequestInit = {}) => {
      const { cache: _c, keepalive: _k, ...rest } = init;
      if (/\/games$/.test(input) && rest.method === "POST") bodies.push(JSON.parse(String(rest.body)) as Record<string, unknown>);
      return realFetch(`${base}${input}`, rest);
    }) as unknown as typeof fetch;
    const s = new SoloSession({ store: null, onChange: () => {}, fetch: f, pollMs: 60_000, requestTimeoutMs: 2_000, startBudgetMs: 6_000 });
    sessions.push(s);
    return s;
  };
  const roomOf = (s: SoloSession) => (server as unknown as { rooms: Map<string, RoomEngine> }).rooms.get(s.roomId!)!;

  it("Christmas: the Start carries it, the round is bound to it and deals a Christmas board first; Everyday: never one", async () => {
    const s = session();
    await s.start("word-connections", "christmas");
    expect(s.current.phase).toBe("playing");
    const room = roomOf(s);
    const g = room.games.get(s.current.gameInstanceId!)!;
    expect([bodies.at(-1)!["season"], g.season, room.contentSeason]).toEqual(["christmas", "christmas", "christmas"]);
    expect(shipped.items.get((g.extra as { boardId: string }).boardId)?.item.season).toBe("christmas");
    for (let i = 0; i < 4; i++) {
      await s.start("word-connections", "everyday");
      const e = room.games.get(s.current.gameInstanceId!)!;
      expect([bodies.at(-1)!["season"], e.season]).toEqual(["everyday", "everyday"]);
      expect(shipped.items.get((e.extra as { boardId: string }).boardId)?.item.season).toBeUndefined();
    }
    expect(room.contentSeason).toBe("everyday");
  });

  it("a press with no answer is sent again unchanged, its content included, even if the remembered choice changed since (feedback 6795825877, 3)", async () => {
    // Every send of the first Start reaches the server, which acts, then the connection drops: the Start ends with no answer.
    let resets = 0;
    const sent: Record<string, unknown>[] = [];
    const f = (async (input: string, init: RequestInit = {}) => {
      const { cache: _c, keepalive: _k, ...rest } = init;
      const reply = await realFetch(`${base}${input}`, rest);
      if (/\/games$/.test(input) && rest.method === "POST") {
        sent.push(JSON.parse(String(rest.body)) as Record<string, unknown>);
        if (resets < 3) { resets++; throw new TypeError("fetch failed"); }
      }
      return reply;
    }) as unknown as typeof fetch;
    const s = new SoloSession({ store: null, onChange: () => {}, fetch: f, pollMs: 60_000, requestTimeoutMs: 2_000, startBudgetMs: 6_000 });
    sessions.push(s);
    await s.start("word-connections", "christmas");
    expect(s.current.phase).toBe("error");
    // Try again, after another tab switched the remembered choice to Everyday: the same press, Christmas.
    await s.start("word-connections", "everyday");
    expect(s.current.phase).toBe("playing");
    const ids = new Set(sent.map((b) => (b["attempt"] as { id: string }).id));
    expect([ids.size, [...new Set(sent.map((b) => b["season"]))]]).toEqual([1, ["christmas"]]);
    const room = roomOf(s);
    expect([room.games.size, room.games.get(s.current.gameInstanceId!)!.season]).toEqual([1, "christmas"]);
    // The next press is new, and takes the choice it is given.
    await s.start("word-connections", "everyday");
    expect(room.games.get(s.current.gameInstanceId!)!.season).toBe("everyday");
  });

  it("without a choice it sends Everyday (the default), never nothing", async () => {
    const s = session();
    await s.start("math-mayhem");
    expect(bodies.at(-1)!["season"]).toBe("everyday");
  });
});
