// TEST TOOLING ONLY (scripts/check-fair-starts.mjs). Never used by the app.
//
// The real LocalServer with a clock the driver owns. Nothing moves the room's clock but an "advance" line, and no
// background sweep runs (lifecycleSweepMs: null), so every authoritative instant (play start, a phase deadline, a
// Relay turn) is an exact, repeatable number. Every broadcast is printed with the wall time it was sent at, so the
// driver can measure how long each browser took to show it. The HTTP and WebSocket paths are the shipped ones.
//
//   stdin  {"cmd":"advance","ms":N}   move the clock by N ms, then run the lifecycle sweep once (what the 1 s timer does)
//          {"cmd":"state","roomId":R} the room's games and timing ledger, as the server holds them
//   stdout FS {"kind":"ready","port":P,"t":T}
//          FS {"kind":"advanced","t":T,"swept":N}
//          FS {"kind":"bcast","wall":W,"t":T,"roomId":R,"games":[...]}
//          FS {"kind":"state",...}
import { createInterface } from "node:readline";
import { LocalServer } from "../../src/server/http.js";
import { moduleFor } from "../../src/games/modules/index.js";

if (process.env.NODE_ENV === "production") {
  console.error("fair-start-server is test tooling and is not allowed in production.");
  process.exit(2);
}

// A fixed, ordinary evening (not "now"), so every run's authoritative times are the same numbers.
const T0 = Date.parse("2026-12-24T17:00:00.000Z");
let t = T0;
const emit = (o: Record<string, unknown>) => { process.stdout.write(`FS ${JSON.stringify(o)}\n`); };

const server = new LocalServer({
  clock: () => t,
  lifecycleSweepMs: null,
  dataDir: process.env.MCHEZO_DATA_DIR || undefined,
  webDistDir: process.env.MCHEZO_WEB_DIST || undefined,
});

type AnyGame = {
  id: string; gameId: string; status: string; players: string[]; playStartedAt?: number; deadlineAt?: number; phaseKey?: string; phaseDeadlineAt?: number;
  briefing?: { createdAt: number; startNowAt: number; warnAt: number; expiresAt: number; ready: Record<string, number> };
  extra: unknown; rawScores?: Record<string, number>; finalScores?: Record<string, number>;
};
type Engine = { games: Map<string, AnyGame>; ledger: { seq: number; type: string; createdAt: number; gameInstanceId?: string; playerId?: string; actor?: string; detail?: unknown }[]; presenceOf(id: string, now?: number): string };

function gameSummary(g: AnyGame) {
  const mod = moduleFor(g.gameId);
  const ex = g.extra as { lanes?: { teamId: string; legs: number; runner: number; runners: string[]; turnStartedAt: number | null }[]; startedAt?: number | null; questionIndex?: number; round?: number; phase?: string } | undefined;
  return {
    id: g.id, gameId: g.gameId, status: g.status, players: g.players,
    briefing: g.briefing ? { createdAt: g.briefing.createdAt, startNowAt: g.briefing.startNowAt, warnAt: g.briefing.warnAt, expiresAt: g.briefing.expiresAt, ready: g.briefing.ready } : undefined,
    playStartedAt: g.playStartedAt, deadlineAt: g.deadlineAt, phaseKey: g.phaseKey, phaseDeadlineAt: g.phaseDeadlineAt,
    moduleDueAt: g.status === "playing" ? mod?.dueAt?.(g.extra as never) : undefined,
    relay: ex?.lanes ? { startedAt: ex.startedAt ?? null, lanes: ex.lanes.map((l) => ({ teamId: l.teamId, legs: l.legs, runnerId: l.runners[l.runner % Math.max(1, l.runners.length)] ?? null, turnStartedAt: l.turnStartedAt })) } : undefined,
    rawScores: g.rawScores,
  };
}

const TIMING_EVENTS = new Set(["game-briefing-started", "ready-changed", "game-started", "briefing-cancelled", "briefing-extended", "content-selected", "phase-closed", "game-finished", "score-awarded", "team-score-recorded", "game-voided", "player-reconnected"]);

// Every broadcast, with the wall time it went out at (the instant the server's state became visible to sockets).
const s = server as unknown as { broadcast(roomId: string): void; rooms: Map<string, Engine> };
const original = s.broadcast.bind(server);
s.broadcast = (roomId: string) => {
  const engine = s.rooms.get(roomId);
  emit({ kind: "bcast", wall: Date.now(), t, roomId, games: engine ? [...engine.games.values()].map((g) => ({ id: g.id, gameId: g.gameId, status: g.status, phaseKey: g.phaseKey, phaseDeadlineAt: g.phaseDeadlineAt, playStartedAt: g.playStartedAt })) : [] });
  original(roomId);
};

const port = await server.listen(Number(process.env.PORT ?? 0), "127.0.0.1");
emit({ kind: "ready", port, t });

createInterface({ input: process.stdin }).on("line", (line) => {
  let msg: { cmd?: string; ms?: number; roomId?: string };
  try { msg = JSON.parse(line) as typeof msg; } catch { return; }
  try {
    if (msg.cmd === "advance") {
      const ms = Number(msg.ms ?? 0);
      if (!Number.isFinite(ms) || ms < 0) throw new Error("advance needs ms >= 0");
      t += ms;
      const swept = server.lifecycleSweep();
      emit({ kind: "advanced", t, swept });
    } else if (msg.cmd === "state") {
      const engine = s.rooms.get(String(msg.roomId));
      if (!engine) throw new Error(`no room ${msg.roomId}`);
      const games = [...engine.games.values()];
      const ids = new Set(games.flatMap((g) => g.players));
      emit({
        kind: "state", t,
        games: games.map(gameSummary),
        presence: Object.fromEntries([...ids].map((id) => [id, engine.presenceOf(id, t)])),
        ledger: engine.ledger.filter((e) => TIMING_EVENTS.has(e.type)).map((e) => ({ seq: e.seq, type: e.type, at: e.createdAt, gameInstanceId: e.gameInstanceId, playerId: e.playerId, actor: e.actor, detail: e.detail })),
      });
    } else throw new Error(`unknown command ${msg.cmd}`);
  } catch (e) {
    emit({ kind: "error", message: (e as Error).message });
  }
});
process.on("SIGTERM", () => { void server.close().then(() => process.exit(0)); });
