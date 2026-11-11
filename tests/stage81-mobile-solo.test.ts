/**
 * Stage 8.1 (docs/stage8/stage81.md): Pattern Pulse's game clock between
 * patterns, and the solo session's use of the server's clock.
 *
 *  - The clock helper: time left from the server's deadline, the low and
 *    up states, and announcements made only on crossing into a more urgent
 *    band, each once (never every second, never repeated by a clock that
 *    jumps back).
 *  - The numbers come from the server: a solo room's projection carries
 *    the game's deadline and the server's time; the server alone ends the
 *    game and refuses a pattern opened after its time is up.
 *  - F3: the solo session records the server's clock from every projection,
 *    so a phone whose clock is wrong still shows the right time left.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LocalServer } from "../src/server/http.js";
import { RoomEngine } from "../src/server/room.js";
import { SoloSession, forgetPageSeat } from "../apps/web/src/solo/soloSession.js";
import { noteServerTime, serverNowEstimate, serverOffsetMs } from "../apps/web/src/ui/mchezo/lib/lifecycle.js";
import {
  NO_ANNOUNCEMENTS, PULSE_CLOCK_LOW_MS, PULSE_CLOCK_URGENT_MS, clockAnnouncement, clockAnnouncementText, clockBand, gameClockView, nextAnnouncement,
  type AnnouncementHistory, type ClockBand,
} from "../apps/web/src/components/mchezo/pulseClock.js";
import type { PlayerGame, Projection } from "../apps/web/src/types.js";

const intent = (roomId: string, gid: string, action: string, payload: Record<string, unknown> = {}) =>
  ({ kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action, payload });

describe("Pattern Pulse's game clock (pure)", () => {
  it("time left is the server's deadline minus the server's time, shown as m:ss and never negative", () => {
    expect(gameClockView(undefined, 1_000)).toBeNull();
    expect(gameClockView(Number.NaN, 1_000)).toBeNull();
    const at = 10_000_000;
    expect(gameClockView(at, at - 222_000)).toMatchObject({ leftMs: 222_000, label: "3:42", band: "none", low: false, up: false });
    expect(gameClockView(at, at - 300_000)?.label).toBe("5:00");
    expect(gameClockView(at, at - 999)?.label).toBe("0:01"); // rounds up: 0:00 means the deadline is here
    expect(gameClockView(at, at)).toMatchObject({ leftMs: 0, label: "0:00", band: "up", up: true, low: false });
    expect(gameClockView(at, at + 5_000)).toMatchObject({ leftMs: 0, label: "0:00", up: true });
  });

  it("low at one minute or less, urgent at 20 s or less, up at the deadline", () => {
    expect(clockBand(PULSE_CLOCK_LOW_MS + 1)).toBe("none");
    expect(clockBand(PULSE_CLOCK_LOW_MS)).toBe("low");
    expect(clockBand(PULSE_CLOCK_URGENT_MS + 1)).toBe("low");
    expect(clockBand(PULSE_CLOCK_URGENT_MS)).toBe("urgent");
    expect(clockBand(1)).toBe("urgent");
    expect(clockBand(0)).toBe("up");
    expect(clockBand(-1)).toBe("up");
    const at = 5_000_000;
    expect(gameClockView(at, at - 30_000)).toMatchObject({ band: "low", low: true, up: false });
    expect(gameClockView(at, at - 10_000)).toMatchObject({ band: "urgent", low: true, up: false });
  });

  it("a second-by-second countdown announces exactly three times: under a minute, under 20 s, time up", () => {
    let announced: ClockBand = "none";
    const said: string[] = [];
    for (let left = 95_000; left >= -3_000; left -= 1_000) {
      const due = clockAnnouncement(announced, clockBand(left));
      if (due) { announced = due; said.push(clockAnnouncementText(due)); }
    }
    expect(said).toEqual(["Under a minute of game time left.", "Under 20 seconds of game time left.", "The game’s time is up."]);
  });

  it("a clock that jumps back and forth across a threshold announces it once, never again", () => {
    let announced: ClockBand = "none";
    let count = 0;
    for (const left of [61_000, 59_000, 61_000, 59_500, 62_000, 58_000, 60_500, 57_000]) {
      const due = clockAnnouncement(announced, clockBand(left));
      if (due) { announced = due; count++; }
    }
    expect(count).toBe(1);
    expect(clockAnnouncement("urgent", "low")).toBeNull(); // going back to a less urgent band says nothing
    expect(clockAnnouncement("up", "none")).toBeNull();
  });

  it("arriving with the clock already low or up announces that state once (not each band on the way)", () => {
    expect(clockAnnouncement("none", clockBand(45_000))).toBe("low");
    expect(clockAnnouncement("none", clockBand(5_000))).toBe("urgent");
    expect(clockAnnouncement("none", clockBand(-1))).toBe("up");
    expect(clockAnnouncementText("none")).toBe("");
  });
});

describe("announcement history belongs to the game instance (spec feedback 6790913242)", () => {
  /** Feed readings (game id, ms left) through the history; return what was said. */
  function run(readings: [string, number][], start: AnnouncementHistory = NO_ANNOUNCEMENTS) {
    let h = start;
    const said: string[] = [];
    for (const [gid, left] of readings) {
      const next = nextAnnouncement(h, gid, clockBand(left));
      h = next.history;
      if (next.say) said.push(`${gid}:${next.say}`);
    }
    return { said, h };
  }

  it("moving between the ready, memorise and tap-back screens never repeats a warning (the same game, the same band)", () => {
    // The component reads the clock each time the ready screen returns; the band stays "low".
    const { said } = run([["g1", 55_000], ["g1", 50_000], ["g1", 41_000], ["g1", 30_000], ["g1", 25_000]]);
    expect(said).toEqual(["g1:low"]);
  });

  it("a new game (Play again, a rematch) starts with a clean history: its warnings are said again", () => {
    const first = run([["g1", 59_000], ["g1", 10_000], ["g1", -1]]);
    expect(first.said).toEqual(["g1:low", "g1:urgent", "g1:up"]);
    const second = run([["g2", 299_000], ["g2", 59_000], ["g2", 10_000]], first.h);
    expect(second.said).toEqual(["g2:low", "g2:urgent"]);
  });

  it("a clock correction that skips a threshold says only where it lands, not every band it jumped over", () => {
    expect(run([["g", 90_000], ["g", 12_000]]).said).toEqual(["g:urgent"]); // never "low" then "urgent" in a burst
    expect(run([["g", 90_000], ["g", -500]]).said).toEqual(["g:up"]);
  });

  it("a correction back across a threshold and forward again repeats nothing outdated", () => {
    const { said } = run([["g", 18_000], ["g", 65_000], ["g", 75_000], ["g", 55_000], ["g", 19_000], ["g", 70_000], ["g", 0]]);
    expect(said).toEqual(["g:urgent", "g:up"]);
  });
});

describe("the clock's numbers come from the server (solo room)", () => {
  function soloPulse() {
    const engine = new RoomEngine("solo", { kind: "solo" });
    const me = engine.join("You", { asHost: true }).player.id;
    let t = 2_000_000_000;
    engine.clock = () => t;
    const g = engine.startGame(me, "pattern-pulse", { official: false, seed: 9 });
    const mine = () => (engine.project("player", me) as unknown as Projection).myGames?.find((x) => x.id === g.id) as PlayerGame;
    const proj = () => engine.project("player", me) as unknown as Projection;
    return { engine, me, g, mine, proj, advance: (ms: number) => { t += ms; }, now: () => t };
  }

  it("the player's projection carries the game's deadline and the server's time; the clock reads them", () => {
    const { mine, proj, advance } = soloPulse();
    const game = mine();
    expect(game.status).toBe("playing");
    expect(typeof game.deadlineAt).toBe("number");
    expect(gameClockView(game.deadlineAt, proj().serverNow!)?.label).toBe("5:00"); // Pattern Pulse's 5-minute window
    advance(4 * 60_000);
    expect(gameClockView(mine().deadlineAt, proj().serverNow!)).toMatchObject({ label: "1:00", band: "low" });
  });

  it("time up on the ready screen: the server refuses a late Show me the pattern and ends the game itself", () => {
    const { engine, me, g, mine, proj, advance } = soloPulse();
    // Round 1 is played, so the player is between patterns (the ready screen) when time runs out.
    expect(engine.submitIntent(intent(engine.id, g.id, "pulse-open", { round: 0 }), me).accepted).toBe(true);
    const deadline = mine().deadlineAt!;
    advance(deadline - proj().serverNow! + 1); // just past the deadline; the server hasn't ticked yet
    expect(gameClockView(mine().deadlineAt, proj().serverNow!)?.up).toBe(true);
    const late = engine.submitIntent(intent(engine.id, g.id, "pulse-open", { round: 1 }), me);
    expect(late.accepted).toBe(false); // the display state matches the server: nothing to press
    engine.tick();
    expect(mine().status).toBe("finished"); // the screen then follows the projection to the results
    expect(engine.tick()).toBe(false); // and only once
  });

  it("time up with nobody pressing: the server's clock alone ends the game at its deadline", () => {
    const { engine, me, g, mine, proj, advance } = soloPulse();
    expect(engine.submitIntent(intent(engine.id, g.id, "pulse-open", { round: 0 }), me).accepted).toBe(true);
    advance(mine().deadlineAt! - proj().serverNow! - 1);
    expect(engine.tick()).toBe(true); // round 1's answer window closed as missed, nothing more
    expect(mine().status).toBe("playing");
    expect(gameClockView(mine().deadlineAt, proj().serverNow!)).toMatchObject({ label: "0:01", band: "urgent" });
    advance(2);
    expect(engine.tick()).toBe(true);
    expect(mine().status).toBe("finished");
  });
});

describe("F3: the solo session uses the server's clock, as room screens do", () => {
  let server: LocalServer;
  let base = "";
  const realFetch = globalThis.fetch;
  const sessions: SoloSession[] = [];
  beforeAll(async () => { server = new LocalServer({ dataDir: mkdtempSync(join(tmpdir(), "mz-s81-clock-")) }); base = `http://127.0.0.1:${await server.listen(0)}`; });
  afterAll(async () => { await server.close(); });
  beforeEach(() => { forgetPageSeat(); noteServerTime(Date.now()); });
  afterEach(() => { for (const s of sessions.splice(0)) s.dispose(); noteServerTime(Date.now()); });

  /** A phone whose own clock is `skewMs` behind the server: every projection's serverNow reads that much ahead of it. */
  function skewedTab(skewMs: number) {
    const f = (async (input: string, init: RequestInit = {}) => {
      const { cache: _c, keepalive: _k, ...rest } = init;
      const res = await realFetch(`${base}${input}`, rest);
      if (!/\/projection\?/.test(input) || !res.ok) return res;
      const body = (await res.json()) as Projection;
      if (typeof body.serverNow === "number") body.serverNow += skewMs;
      return new Response(JSON.stringify(body), { status: res.status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const s = new SoloSession({ store: null, onChange: () => {}, fetch: f, pollMs: 60_000, requestTimeoutMs: 2_000, startBudgetMs: 6_000 });
    sessions.push(s);
    return s;
  }

  it("after a solo Start, countdowns are measured on the server's clock, not this phone's", async () => {
    const s = skewedTab(90_000);
    expect(Math.abs(serverOffsetMs())).toBeLessThan(1_000); // nothing recorded yet
    await s.start("pattern-pulse");
    expect(s.current.phase).toBe("playing");
    expect(serverOffsetMs()).toBeGreaterThan(88_000);
    expect(serverOffsetMs()).toBeLessThan(92_000);
    const proj = s.current.proj!;
    const game = proj.myGames!.find((x) => x.id === s.current.gameInstanceId)!;
    // The time left shown is what the server's own numbers say (its deadline
    // minus its time), whatever this phone's clock reads; on the phone's own
    // clock it would be 90 s more.
    const byServer = game.deadlineAt! - proj.serverNow!;
    const view = gameClockView(game.deadlineAt, serverNowEstimate())!;
    expect(Math.abs(view.leftMs - byServer)).toBeLessThan(1_500);
    expect(Math.abs(view.leftMs - (game.deadlineAt! - Date.now()))).toBeGreaterThan(85_000);
  });

  it("recovery after the server was unreachable: the clock is taken again from the first reply after it", async () => {
    let skew = 90_000;
    let down = false;
    const f = (async (input: string, init: RequestInit = {}) => {
      const { cache: _c, keepalive: _k, ...rest } = init;
      if (down && /\/projection\?/.test(input)) throw new TypeError("fetch failed");
      const res = await realFetch(`${base}${input}`, rest);
      if (!/\/projection\?/.test(input) || !res.ok) return res;
      const body = (await res.json()) as Projection;
      if (typeof body.serverNow === "number") body.serverNow += skew;
      return new Response(JSON.stringify(body), { status: res.status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    let t = Date.now();
    const s = new SoloSession({ store: null, onChange: () => {}, fetch: f, pollMs: 60_000, requestTimeoutMs: 2_000, startBudgetMs: 6_000, staleAfterMs: 1_000, now: () => t });
    sessions.push(s);
    await s.start("pattern-pulse");
    expect(serverOffsetMs()).toBeGreaterThan(88_000); // the first accepted reply, from Start
    down = true;
    t += 2_000;
    await s.refresh();
    expect(s.current.stale).toBe(true); // unreachable: the round is kept and says so
    expect(serverOffsetMs()).toBeGreaterThan(88_000); // a failed read changes nothing
    // Back, and meanwhile this phone's clock was corrected (or the server's
    // time moved): the next accepted reply sets the clock again.
    down = false;
    skew = -30_000;
    t += 1_000;
    await s.refresh();
    expect(s.current.stale).toBe(false);
    expect(serverOffsetMs()).toBeLessThan(-28_000);
    expect(serverOffsetMs()).toBeGreaterThan(-32_000);
  });

  it("an older read answering after a newer one changes nothing: not the round shown, not the clock", async () => {
    let slowNext = false;
    let n = 0;
    const f = (async (input: string, init: RequestInit = {}) => {
      const { cache: _c, keepalive: _k, ...rest } = init;
      const isProj = /\/projection\?/.test(input);
      const mine = isProj ? ++n : 0;
      const slow = isProj && slowNext;
      if (slow) slowNext = false;
      const res = await realFetch(`${base}${input}`, rest);
      if (!isProj || !res.ok) return res;
      const body = (await res.json()) as Projection;
      // The slow (older) read says the server's clock is 50 s ahead; the newer one 20 s behind.
      if (typeof body.serverNow === "number") body.serverNow += slow ? 50_000 : -20_000;
      (body as unknown as { readNo: number }).readNo = mine;
      if (slow) await new Promise((r) => setTimeout(r, 300));
      return new Response(JSON.stringify(body), { status: res.status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const s = new SoloSession({ store: null, onChange: () => {}, fetch: f, pollMs: 60_000, requestTimeoutMs: 2_000, startBudgetMs: 6_000 });
    sessions.push(s);
    await s.start("pattern-pulse");
    slowNext = true;
    const older = s.refresh(); // sent first, answers last
    await new Promise((r) => setTimeout(r, 20));
    const newer = s.refresh();
    await Promise.all([older, newer]);
    const shown = (s.current.proj as unknown as { readNo: number }).readNo;
    expect(shown).toBe(n); // the newest read's reply is on screen, not the older one that came later
    expect(serverOffsetMs()).toBeLessThan(-18_000); // and the clock is the newer reply's
    expect(serverOffsetMs()).toBeGreaterThan(-22_000);
  });

  it("a phone whose clock is ahead of the server's: the offset goes the other way", async () => {
    const s = skewedTab(-120_000);
    await s.start("math-mayhem");
    expect(serverOffsetMs()).toBeLessThan(-118_000);
    expect(serverOffsetMs()).toBeGreaterThan(-122_000);
  });
});
