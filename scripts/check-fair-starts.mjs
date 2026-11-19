// Post-beta H6/H7/M9 (handoff 7004097156): fair game starts and clocks, in six real browser contexts on a
// deterministic server clock.
//
// Starts ITS OWN server (scripts/lib/fair-start-server.ts: the shipped LocalServer with a clock this driver owns, and
// no background sweep), so every authoritative instant is an exact number: the play start, the first phase deadline,
// a Relay turn. Each browser records, in the page itself, when each projection frame arrived and when the first
// actionable control was on screen (present, enabled and inside the viewport). Those page timestamps, not the
// driver's own locator waits, measure what a player saw; the driver's sequential waits are recorded beside them, to
// tell a slow automation locator from a slow screen.
//
// The six contexts: Keku (host, 390x844), Amina (390x844), Baraka (375x667), Wanjiru (320x568), Zawadi (390x844, the
// one who drops and reconnects) and Juma (390x844, a slow phone: CPU throttled 6x).
//
// Cases, for Closest Wins, Team Huddle and Relay:
//   A  all-ready through the real Ready buttons (one transition, one game-started, one shared deadline)
//   N  the next actionable phase (Closest Wins question 2 after question 1 closed; Team Huddle question 2 after
//      the reveal; Relay's next runner after a right answer): is it on screen when its clock starts, or pushed off
//      screen by the previous feedback? (Fixed: Closest Wins drew the last answer above question 2's controls.)
//   R  a reconnecting player: the host confirms Start now naming them; then they come back
//   T  a Ready player who drops blocks all-ready; when they're back, the room's tick starts play
//   C  a stale host confirm after all-ready (already started), with exactly one transition
//   L  a late Ready: the host's confirm lands first, the player's Ready after it (fixed: it no longer puts "The
//      game has already started." on that player's first question)
//   E  the host's confirm is open when the briefing expires (fixed: "Game cancelled" shows on the results the
//      players are back on, not only in the lobby)
//   S  informational: Chromium's emulated 400 ms latency on one phone (it is late by about its latency; the start
//      and deadlines stay shared)
//   Z  over the whole run: every briefing started exactly once or was cancelled; every start finished once
// Handoff 7004097156; the baseline and live runs are in docs/evidence/fair-starts/.
//
// Usage: node scripts/check-fair-starts.mjs [--report <file.json>]   (FS_KEEP_DATA=1 keeps the data and screenshots)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { launchChromium } from "./lib/driver-env.mjs";
import { solveMath } from "./lib/math-solve.mjs";
import { PROTOCOL_HEADERS } from "./lib/protocol.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reportArg = process.argv.indexOf("--report");
const REPORT = reportArg > 0 ? process.argv[reportArg + 1] : null;
let failures = 0;
const results = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  results.push({ name, ok, detail });
  if (!ok) failures++;
}
async function until(fn, timeout = 15000, step = 50) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await sleep(step); }
  if (last) console.log(`  (last error: ${String(last.message ?? last).split("\n")[0]})`);
  return null;
}

// ---- the fixture server ----
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-fair-starts-"));
const bcasts = [];
const waiting = [];
function startServer() {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR };
  delete env.NODE_ENV;
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/lib/fair-start-server.ts"], { cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"] });
  let errOut = "";
  child.stderr.on("data", (d) => { errOut += d.toString(); });
  const ready = new Promise((resolve, reject) => {
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (!line.startsWith("FS ")) return;
      const m = JSON.parse(line.slice(3));
      if (m.kind === "bcast") { bcasts.push(m); return; }
      if (m.kind === "ready") { resolve(m); return; }
      const w = waiting.shift();
      if (w) w(m);
    });
    child.on("exit", (code) => reject(new Error(`fair-start server exited ${code}: ${errOut.slice(-600)}`)));
  });
  return { child, ready };
}
const srv = startServer();
const { port, t: T0 } = await srv.ready;
const BASE = `http://127.0.0.1:${port}`;
function command(obj) {
  return new Promise((resolve, reject) => {
    waiting.push((m) => (m.kind === "error" ? reject(new Error(m.message)) : resolve(m)));
    srv.child.stdin.write(`${JSON.stringify(obj)}\n`);
  });
}
const advance = (ms) => command({ cmd: "advance", ms });
const serverState = (roomId) => command({ cmd: "state", roomId });

// ---- HTTP helpers ----
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", ...PROTOCOL_HEADERS };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}
async function apiOk(path, opts) {
  const r = await api(path, opts);
  if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
const seatOf = (page) => page.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") }));
const intentApi = (roomId, seat, gid, action, payload) =>
  api(`/rooms/${roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId: gid, action, payload } } });

// ---- in-page instrumentation (runs before the app in every context) ----
function instrument() {
  const fs = { frames: [], watches: [], sockets: [] };
  window.__fs = fs;
  const Orig = window.WebSocket;
  class Watched extends Orig {
    constructor(...args) {
      super(...args);
      fs.sockets.push(this);
      this.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.kind !== "projection") return;
          const gs = (m.state?.myGames ?? []).map((g) => ({ id: g.id, status: g.status, phaseKey: g.lifecycle?.phaseKey, playStartedAt: g.playStartedAt, phaseDeadlineAt: g.phaseDeadlineAt, deadlineAt: g.deadlineAt, turnEndsAt: g.state?.turnEndsAt, myTurn: g.state?.myTurn }));
          fs.frames.push({ wall: Date.now(), serverNow: m.state?.serverNow, gs });
          scan();
        } catch { /* not ours */ }
      });
    }
  }
  window.WebSocket = Watched;
  // A watch counts only once this page has received the frame it waits for (that game playing, in that phase), so a
  // control left over from the previous phase never counts as the next phase's.
  // `fresh`: only a frame received after the watch was armed opens it (Relay's next runner: myTurn turns true).
  const gateOpen = (w) => !w.gate || fs.frames.some((f) => (!w.gate.fresh || f.wall >= w.since) && f.gs.some((g) => g.id === w.gate.gid && g.status === "playing"
    && (w.gate.phaseKey === undefined || g.phaseKey === w.gate.phaseKey) && (w.gate.myTurn === undefined || g.myTurn === w.gate.myTurn)));
  function scan() {
    const now = Date.now();
    for (const w of fs.watches) {
      if (w.actionable || !gateOpen(w)) continue;
      const el = document.querySelector(w.selector);
      if (!el) continue;
      w.present ??= now;
      const r = el.getBoundingClientRect();
      const enabled = !el.disabled && el.getAttribute("aria-disabled") !== "true";
      if (enabled) w.enabled ??= now;
      const inView = r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
      w.top = Math.round(r.top); w.bottom = Math.round(r.bottom); w.vh = window.innerHeight;
      if (enabled && inView) w.actionable = now;
    }
  }
  fs.watch = (name, selector, gate) => { fs.watches.push({ name, selector, gate, since: Date.now() }); scan(); };
  fs.scan = scan;
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  setInterval(scan, 20);
}

// ---- the six phones ----
const browser = await launchChromium();
const PLAYERS = [
  { key: "keku", name: "Keku", vw: 390, vh: 844, host: true },
  { key: "amina", name: "Amina", vw: 390, vh: 844 },
  { key: "baraka", name: "Baraka", vw: 375, vh: 667 },
  { key: "wanjiru", name: "Wanjiru", vw: 320, vh: 568 },
  { key: "zawadi", name: "Zawadi", vw: 390, vh: 844, dropper: true },
  { key: "juma", name: "Juma", vw: 390, vh: 844, slow: true },
];
const report = { server: { T0 }, cases: [] };

try {
  for (const p of PLAYERS) {
    p.context = await browser.newContext({ viewport: { width: p.vw, height: p.vh }, reducedMotion: "reduce" });
    await p.context.addInitScript(instrument);
    p.page = await p.context.newPage();
    if (p.slow) {
      p.cdp = await p.context.newCDPSession(p.page);
      await p.cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    }
  }
  const host = PLAYERS[0];
  await host.page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await host.page.getByTestId("home-host").click();
  await host.page.getByPlaceholder("e.g. Auntie June").fill(host.name);
  await host.page.getByRole("button", { name: "Host a game", exact: true }).click();
  const chip = host.page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 20000 });
  const code = await until(async () => { const c = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); return /^[A-Z0-9]{6}$/.test(c) ? c : null; });
  for (const p of PLAYERS.slice(1)) {
    await p.page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await p.page.getByPlaceholder("e.g. Auntie June").fill(p.name);
    await p.page.locator(".mz-code__input").fill(code);
    await p.page.getByRole("button", { name: "Join the game" }).click();
    await p.page.getByRole("heading", { name: `You’re in, ${p.name}.` }).waitFor({ timeout: 30000 });
  }
  for (const p of PLAYERS) p.seat = await seatOf(p.page);
  const roomId = host.seat.roomId;
  const byId = Object.fromEntries(PLAYERS.map((p) => [p.seat.playerId, p]));
  report.server.roomCode = "(redacted)";
  // Three night teams of two (Team Huddle and Relay are built for teams; Closest Wins stays individual: team play is off).
  await apiOk(`/rooms/${roomId}/teams`, { token: host.seat.token, body: { action: "make", count: 3 } });
  const teamsProj = await apiOk(`/rooms/${roomId}/projection?audience=tv`);
  const teamIds = (teamsProj.teams?.list ?? []).map((t) => t.id);
  for (const [i, p] of PLAYERS.entries()) await apiOk(`/rooms/${roomId}/teams`, { token: host.seat.token, body: { action: "move", playerId: p.seat.playerId, teamId: teamIds[Math.floor(i / 2)] } });
  const teamsByPlayer = Object.fromEntries(PLAYERS.map((p, i) => [p.seat.playerId, teamIds[Math.floor(i / 2)]]));

  // ---- shared measuring helpers ----
  const ACTION = {
    "closest-wins": () => '[data-testid="mz-num-submit"]',
    "team-huddle": () => '[data-testid="mz-hd-option-0"]',
    relay: (runner) => (runner ? '[data-testid="mz-rl-option-0"]' : '[data-testid="mz-rl-prompt"]'),
  };
  async function startGame(gameId) {
    const r = await apiOk(`/rooms/${roomId}/games`, { token: host.seat.token, body: { gameId, official: false } });
    const gid = r.gameId;
    for (const p of PLAYERS) if (!p.offline) await p.page.getByTestId("briefing").waitFor({ timeout: 20000 });
    return gid;
  }
  // Arms each phone's watch for the game's first actionable control, BEFORE the start, gated on the frame that
  // starts play (or the given phase). Relay: the runner's first option, or a teammate's view of the team's sum.
  async function armPre(gameId, label, gid, phaseKey) {
    for (const p of PLAYERS) {
      const sel = gameId === "relay" ? '[data-testid="mz-rl-run"] [data-testid="mz-rl-option-0"], [data-testid="mz-rl-cheer"] [data-testid="mz-rl-prompt"]' : ACTION[gameId]();
      p.watchName = `${label}:${p.key}`;
      p.watchSel = sel;
      await p.page.evaluate(([n, s, g]) => window.__fs.watch(n, s, g), [p.watchName, sel, { gid, ...(phaseKey ? { phaseKey } : {}) }]).catch(() => {});
    }
  }
  async function collect(gid, label, firstPlayingBcast, phaseKey) {
    const st = await serverState(roomId);
    const g = st.games.find((x) => x.id === gid);
    const rows = [];
    for (const p of PLAYERS) {
      const fsData = await p.page.evaluate(() => ({ frames: window.__fs.frames, watches: window.__fs.watches })).catch(() => null);
      const w = fsData?.watches.find((x) => x.name === `${label}:${p.key}`);
      const frame = fsData?.frames.find((f) => f.gs.some((x) => x.id === gid && x.status === "playing" && (phaseKey === undefined || x.phaseKey === phaseKey)));
      const fg = frame?.gs.find((x) => x.id === gid);
      const base = firstPlayingBcast?.wall ?? 0;
      rows.push({
        player: p.key, viewport: `${p.vw}x${p.vh}`, slow: !!p.slow, dropped: !!p.offline,
        frameDeadlines: fg ? { playStartedAt: fg.playStartedAt, phaseDeadlineAt: fg.phaseDeadlineAt, deadlineAt: fg.deadlineAt, turnEndsAt: fg.turnEndsAt, myTurn: fg.myTurn } : null,
        frameLagMs: frame ? frame.wall - base : null,
        presentLagMs: w?.present ? w.present - base : null,
        enabledLagMs: w?.enabled ? w.enabled - base : null,
        actionableLagMs: w?.actionable ? w.actionable - base : null,
        controlTop: w?.top ?? null, controlBottom: w?.bottom ?? null, viewportH: w?.vh ?? null,
      });
    }
    return { game: g, rows, ledger: st.ledger.filter((e) => e.gameInstanceId === gid), presence: st.presence };
  }
  const firstBcast = (gid, pred, since) => bcasts.find((b) => b.wall >= since && b.games.some((x) => x.id === gid && pred(x)));
  async function finishGame(gid) {
    // Run the game out on the server clock (each phase as of its own deadline), then let the phones settle.
    for (let i = 0; i < 40; i++) {
      const st = await serverState(roomId);
      const g = st.games.find((x) => x.id === gid);
      if (!g || g.status !== "playing") break;
      await advance(60_000);
    }
    await sleep(800);
  }
  async function clickReady(p) {
    await p.page.getByTestId("briefing-ready").click({ timeout: 15000 });
  }
  async function automationWaits(gameId, label) {
    // What a sequential QA script sees: it waits for each phone's control in turn.
    const t0 = Date.now();
    const out = [];
    for (const p of PLAYERS) {
      if (p.offline) { out.push({ player: p.key, automationLagMs: null }); continue; }
      await p.page.locator(p.watchSel).first().waitFor({ timeout: 20000 }).catch(() => {});
      await p.page.screenshot({ path: join(DATA_DIR, `${label}-${p.key}.png`) }).catch(() => {});
      out.push({ player: p.key, automationLagMs: Date.now() - t0 });
    }
    return out;
  }
  const oneStart = (ledger) => ledger.filter((e) => e.type === "game-started").length === 1;

  // ======== Case A: all-ready through the real buttons, for each game ========
  for (const gameId of ["closest-wins", "team-huddle", "relay"]) {
    const label = `A-${gameId}`;
    const gid = await startGame(gameId);
    await armPre(gameId, label, gid);
    // The players read at different speeds: one Ready per server second; Juma (the slow phone) is last.
    const order = [1, 2, 3, 4, 0, 5].map((i) => PLAYERS[i]);
    for (const p of order.slice(0, -1)) { await clickReady(p); await until(async () => (await serverState(roomId)).games.find((x) => x.id === gid)?.briefing?.ready[p.seat.playerId] !== undefined); await advance(1000); }
    const since = Date.now();
    await clickReady(order.at(-1));
    const b = await until(async () => firstBcast(gid, (x) => x.status === "playing", since), 15000);
    await sleep(2500);
    const autos = await automationWaits(gameId, label);
    const c = await collect(gid, label, b);
    const g = c.game;
    const started = c.ledger.filter((e) => e.type === "game-started");
    check(`${label} one transition, one game-started (trigger all-ready)`, oneStart(c.ledger) && started[0]?.detail?.trigger === "all-ready", JSON.stringify(started.map((e) => e.detail?.trigger)));
    const lastReady = c.ledger.filter((e) => e.type === "ready-changed").at(-1);
    check(`${label} play starts at the final Ready's server instant`, g?.playStartedAt === lastReady?.at && started[0]?.at === lastReady?.at, `playStartedAt=${g?.playStartedAt} lastReady=${lastReady?.at}`);
    const shared = c.rows.every((r) => r.frameDeadlines && r.frameDeadlines.playStartedAt === g.playStartedAt && r.frameDeadlines.phaseDeadlineAt === g.phaseDeadlineAt && r.frameDeadlines.deadlineAt === g.deadlineAt);
    check(`${label} every phone got the same start and deadlines`, shared, JSON.stringify(c.rows.map((r) => r.frameDeadlines)));
    const lagMax = Math.max(...c.rows.map((r) => r.actionableLagMs ?? Infinity));
    report.cases.push({ case: label, gameId, trigger: started[0]?.detail?.trigger, playStartedAt: g?.playStartedAt, firstPhaseDeadlineAt: g?.phaseDeadlineAt, firstPhaseWindowMs: g?.phaseDeadlineAt ? g.phaseDeadlineAt - g.playStartedAt : null, relay: g?.relay, gameDeadlineAt: g?.deadlineAt, startBroadcastWall: b?.wall, rows: c.rows, automation: autos, ledger: c.ledger.map((e) => ({ type: e.type, at: e.at, trigger: e.detail?.trigger })) });
    check(`${label} every phone showed an actionable screen (in the page's own time)`, Number.isFinite(lagMax), `max ${lagMax} ms`);

    // ======== Case N: the next actionable phase ========
    if (gameId === "closest-wins" || gameId === "team-huddle") {
      const labelN = `N-${gameId}`;
      const nextKey = gameId === "closest-wins" ? "q:1" : "1:pick";
      await armPre(gameId, labelN, gid, nextKey);
      // Everyone answers question 1 (on the server, the same intents the buttons send).
      const g1 = (await serverState(roomId)).games.find((x) => x.id === gid);
      const sinceN = Date.now();
      for (const p of PLAYERS) {
        if (gameId === "closest-wins") await intentApi(roomId, p.seat, gid, "closest-guess", { value: 42, phaseKey: g1.phaseKey });
        else await intentApi(roomId, p.seat, gid, "huddle-pick", { round: 0, choice: 1, phaseKey: g1.phaseKey });
      }
      await sleep(400);
      const g2 = (await serverState(roomId)).games.find((x) => x.id === gid);
      if (gameId === "team-huddle") {
        // Every team agreed: the reveal came early and runs its own clock; question 2 starts when it ends.
        check(`${labelN} every team agreed: the reveal came early`, g2.phaseKey === "0:reveal", g2.phaseKey);
        await advance(g2.phaseDeadlineAt - (await serverState(roomId)).t + 1);
      }
      // Everyone guessed: Closest Wins question 1 closed early, and question 2's clock started with it.
      const bN = await until(async () => firstBcast(gid, (x) => x.phaseKey === nextKey, sinceN), 15000);
      await sleep(2000);
      const cN = await collect(gid, labelN, bN, nextKey);
      for (const p of PLAYERS) await p.page.screenshot({ path: join(DATA_DIR, `${labelN}-${p.key}.png`) }).catch(() => {});
      report.cases.push({ case: labelN, gameId, phaseKey: cN.game.phaseKey, phaseStartedAtServer: bN?.t, phaseDeadlineAt: cN.game.phaseDeadlineAt, phaseWindowMs: cN.game.phaseDeadlineAt - (bN?.t ?? 0), phaseBroadcastWall: bN?.wall, rows: cN.rows });
      check(`${labelN} the next question's control is on screen, unscrolled, on every phone`, cN.rows.every((r) => r.actionableLagMs !== null), JSON.stringify(cN.rows.map((r) => [r.player, r.actionableLagMs, r.controlTop, r.controlBottom, r.viewportH])));
    }
    if (gameId === "relay") {
      // The baton: a right answer passes it, and the next runner's 20 s turn starts at that instant.
      const labelN = "N-relay";
      const st = (await serverState(roomId)).games.find((x) => x.id === gid);
      const lane = st.relay.lanes[0];
      const runner = byId[lane.runnerId];
      const mine = (await apiOk(`/rooms/${roomId}/projection?audience=player`, { token: runner.seat.token })).myGames.find((x) => x.id === gid).state;
      const right = mine.options.findIndex((o) => Number(o) === solveMath(mine.prompt));
      const nextRunner = PLAYERS.find((p) => p !== runner && teamsByPlayer[p.seat.playerId] === lane.teamId);
      await nextRunner.page.evaluate(([n, s, g]) => window.__fs.watch(n, s, g), [`${labelN}:${nextRunner.key}`, '[data-testid="mz-rl-run"] [data-testid="mz-rl-option-0"]', { gid, myTurn: true, fresh: true }]);
      const sinceN = Date.now();
      const r = await intentApi(roomId, runner.seat, gid, "relay-answer", { leg: 0, choice: right });
      const bN = await until(async () => bcasts.find((x) => x.wall >= sinceN && x.games.some((y) => y.id === gid)), 15000);
      await sleep(1500);
      const w = await nextRunner.page.evaluate((n) => window.__fs.watches.find((x) => x.name === n), `${labelN}:${nextRunner.key}`);
      const after = (await serverState(roomId)).games.find((x) => x.id === gid);
      const l2 = after.relay.lanes.find((l) => l.teamId === lane.teamId);
      report.cases.push({ case: labelN, gameId, answer: r.body, turnStartedAt: l2.turnStartedAt, nextRunner: nextRunner.key, viewport: `${nextRunner.vw}x${nextRunner.vh}`, actionableLagMs: w?.actionable ? w.actionable - bN.wall : null, controlTop: w?.top, controlBottom: w?.bottom, viewportH: w?.vh });
      check(`${labelN} the next runner's turn starts at the right answer, and their options are on screen`, r.body.accepted === true && l2.legs === 1 && l2.runnerId === nextRunner.seat.playerId && !!w?.actionable, `lag ${w?.actionable ? w.actionable - bN.wall : null} ms, control ${w?.top}-${w?.bottom}/${w?.vh}`);
    }
    await finishGame(gid);
  }

  // ======== Case R: a reconnecting player; the host confirms Start now naming them ========
  {
    const label = "R-relay";
    const gid = await startGame("relay");
    await armPre("relay", label, gid);
    const z = PLAYERS.find((p) => p.dropper);
    // Zawadi's phone drops (radio off, socket gone) before reading the rules.
    await z.context.setOffline(true);
    await z.page.evaluate(() => { for (const s of window.__fs.sockets) try { s.close(); } catch { /* closing */ } });
    z.offline = true;
    await until(async () => (await serverState(roomId)).presence[z.seat.playerId] === "reconnecting");
    for (const p of PLAYERS.filter((x) => !x.dropper)) await clickReady(p);
    const g0 = (await serverState(roomId)).games.find((x) => x.id === gid);
    check(`${label} a reconnecting player blocks all-ready`, g0.status === "briefing");
    // The read window passes; the host's Start now names Zawadi.
    await advance(g0.briefing.startNowAt - (await serverState(roomId)).t);
    await host.page.getByTestId("briefing-start-now").click({ timeout: 10000 });
    await host.page.getByTestId("briefing-confirm").waitFor({ timeout: 10000 });
    const confirmRows = await host.page.getByTestId("briefing-confirm-list").innerText();
    const countText = await host.page.getByTestId("briefing-ready-count").innerText();
    check(`${label} the confirmation names exactly the reconnecting player`, confirmRows.includes("Zawadi") && /reconnecting/i.test(confirmRows) && !/Amina|Baraka|Wanjiru|Juma|Keku/.test(confirmRows), `${confirmRows} | ${countText}`);
    const since = Date.now();
    await host.page.getByRole("button", { name: "Start everyone’s clock" }).click();
    const b = await until(async () => firstBcast(gid, (x) => x.status === "playing", since), 15000);
    await sleep(2000);
    const cOthers = await collect(gid, label, b);
    // Zawadi comes back.
    const back = Date.now();
    await z.context.setOffline(false);
    z.offline = false;
    await until(async () => (await z.page.evaluate(() => window.__fs.watches.find((w) => w.name.startsWith("R-relay:zawadi"))?.actionable ?? null)), 30000, 100);
    const c = await collect(gid, label, b);
    const started = c.ledger.filter((e) => e.type === "game-started");
    check(`${label} one transition (start-now, confirmed [Zawadi])`, oneStart(c.ledger) && started[0]?.detail?.trigger === "start-now" && JSON.stringify(started[0]?.detail?.confirmed) === JSON.stringify([z.seat.playerId]), JSON.stringify(started[0]?.detail));
    report.cases.push({ case: label, gameId: "relay", trigger: "start-now", confirmText: confirmRows, readyCount: countText, playStartedAt: c.game.playStartedAt, relay: c.game.relay, startBroadcastWall: b?.wall, backOnlineAfterStartMs: back - (b?.wall ?? back), rows: c.rows, rowsBeforeReturn: cOthers.rows, ledger: c.ledger.map((e) => ({ type: e.type, at: e.at, detail: e.detail })) });
    await finishGame(gid);
  }

  // ======== Case T: a Ready player drops; all-ready waits; back again, the sweep starts play ========
  {
    const label = "T-team-huddle";
    const gid = await startGame("team-huddle");
    await armPre("team-huddle", label, gid);
    const z = PLAYERS.find((p) => p.dropper);
    await clickReady(z);
    await until(async () => (await serverState(roomId)).games.find((x) => x.id === gid)?.briefing?.ready[z.seat.playerId] !== undefined);
    await z.context.setOffline(true);
    await z.page.evaluate(() => { for (const s of window.__fs.sockets) try { s.close(); } catch { /* closing */ } });
    await until(async () => (await serverState(roomId)).presence[z.seat.playerId] === "reconnecting");
    for (const p of PLAYERS.filter((x) => !x.dropper)) await clickReady(p);
    await advance(1000);
    const g0 = (await serverState(roomId)).games.find((x) => x.id === gid);
    check(`${label} every roster player is Ready but one is reconnecting: still the briefing`, g0.status === "briefing" && Object.keys(g0.briefing.ready).length === 6);
    const tvCount = await host.page.getByTestId("briefing-ready-count").innerText();
    const zRow = await host.page.getByTestId(`briefing-person-${z.seat.playerId}`).innerText();
    // (The count is drawn in capitals by CSS: innerText reads "READY · 6 OF 6". A case-sensitive locator here was a
    // harness bug in the first baseline run, not a player-visible one.)
    check(`${label} the host's rows say 6 of 6 ready and Zawadi reconnecting`, /6 of 6/i.test(tvCount) && /Ready · reconnecting/i.test(zRow), `${tvCount} | ${zRow.replace(/\n/g, " / ")}`);
    // Zawadi comes back. Any request from the phone (or the 1 s sweep) runs the room's tick, which starts play.
    const since = Date.now();
    await z.context.setOffline(false);
    await until(async () => (await serverState(roomId)).presence[z.seat.playerId] === "connected", 30000, 100);
    await advance(1000); // the 1 s sweep, if no request ticked it first
    const b = await until(async () => firstBcast(gid, (x) => x.status === "playing", since), 15000);
    await sleep(2500);
    const c = await collect(gid, label, b);
    const started = c.ledger.filter((e) => e.type === "game-started");
    check(`${label} the tick started play once (all-ready), when Zawadi was back`, oneStart(c.ledger) && started[0]?.detail?.trigger === "all-ready" && started[0]?.detail?.presenceAtStart?.[z.seat.playerId] === "connected", JSON.stringify(started.map((e) => e.detail)));
    const shared = c.rows.every((r) => r.frameDeadlines?.playStartedAt === c.game.playStartedAt && r.frameDeadlines?.phaseDeadlineAt === c.game.phaseDeadlineAt);
    check(`${label} every phone, Zawadi's too, got the same start and deadline`, shared, JSON.stringify(c.rows.map((r) => [r.player, r.frameDeadlines?.phaseDeadlineAt, r.actionableLagMs])));
    report.cases.push({ case: label, gameId: "team-huddle", trigger: started[0]?.detail?.trigger, playStartedAt: c.game.playStartedAt, firstPhaseDeadlineAt: c.game.phaseDeadlineAt, startBroadcastWall: b?.wall, rows: c.rows });
    await finishGame(gid);
  }

  // ======== Case C: the host's confirm is open; the last player taps Ready; then the stale confirm lands ========
  {
    const label = "C-closest-wins";
    const gid = await startGame("closest-wins");
    await armPre("closest-wins", label, gid);
    const juma = PLAYERS.find((p) => p.slow);
    for (const p of PLAYERS.filter((x) => !x.slow)) await clickReady(p);
    const g0 = (await serverState(roomId)).games.find((x) => x.id === gid);
    await advance(g0.briefing.startNowAt - (await serverState(roomId)).t);
    await host.page.getByTestId("briefing-start-now").click({ timeout: 10000 });
    await host.page.getByTestId("briefing-confirm").waitFor({ timeout: 10000 });
    const confirmRows = await host.page.getByTestId("briefing-confirm-list").innerText();
    const since = Date.now();
    await clickReady(juma);
    const b = await until(async () => firstBcast(gid, (x) => x.status === "playing", since), 15000);
    await sleep(1500);
    const hostLeft = (await host.page.getByTestId("briefing-confirm").count()) === 0 && (await host.page.getByTestId("briefing").count()) === 0;
    // The host's tap on the stale dialog, delivered now (it was in flight, or the screen hadn't caught up).
    const stale = await api(`/rooms/${roomId}/games/${gid}/start-now`, { token: host.seat.token, body: { confirmed: [juma.seat.playerId] } });
    await sleep(500);
    const c = await collect(gid, label, b);
    const hostNote = await host.page.locator('[role="alert"]').allInnerTexts();
    check(`${label} all-ready won; the stale confirm is "already started"; one transition`, oneStart(c.ledger) && c.ledger.find((e) => e.type === "game-started")?.detail?.trigger === "all-ready" && stale.status === 200 && stale.body.trigger === "already-started", `${stale.status} ${JSON.stringify(stale.body)}`);
    check(`${label} the host's dialog went with the briefing, and no error shows`, hostLeft && hostNote.length === 0, `confirm listed: ${confirmRows}; alerts: ${JSON.stringify(hostNote)}`);
    report.cases.push({ case: label, gameId: "closest-wins", confirmText: confirmRows, stale: stale.body, rows: c.rows, hostAlerts: hostNote });
    await finishGame(gid);
  }

  // ======== Case L: a late Ready (the host's confirm lands first) ========
  for (const lateGame of ["team-huddle", "closest-wins"]) {
    const label = `L-${lateGame}`;
    const gid = await startGame(lateGame);
    await armPre(lateGame, label, gid);
    const juma = PLAYERS.find((p) => p.slow);
    for (const p of PLAYERS.filter((x) => !x.slow)) await clickReady(p);
    const g0 = (await serverState(roomId)).games.find((x) => x.id === gid);
    await advance(g0.briefing.startNowAt - (await serverState(roomId)).t);
    // Juma's Ready is on its way (held 600 ms on the phone's network) while the host's confirmed Start now lands.
    let release;
    const held = new Promise((r) => { release = r; });
    await juma.page.route("**/intents", async (route) => { await held; await route.continue(); });
    const tapped = juma.page.getByTestId("briefing-ready").click({ timeout: 10000 });
    await sleep(300);
    const since = Date.now();
    const sn = await api(`/rooms/${roomId}/games/${gid}/start-now`, { token: host.seat.token, body: { confirmed: [juma.seat.playerId] } });
    await sleep(300);
    release();
    await tapped;
    const b = await until(async () => firstBcast(gid, (x) => x.status === "playing", since), 15000);
    await sleep(2000);
    await juma.page.unroute("**/intents");
    const alerts = await juma.page.locator('[role="alert"]').allInnerTexts();
    const c = await collect(gid, label, b);
    const readyEvents = c.ledger.filter((e) => e.type === "ready-changed" && e.playerId === juma.seat.playerId);
    await juma.page.screenshot({ path: join(DATA_DIR, `${label}-juma.png`) }).catch(() => {});
    check(`${label} one transition (start-now), the late Ready changed nothing on the server`, oneStart(c.ledger) && sn.status === 200 && readyEvents.length === 0, `${sn.status} ${JSON.stringify(sn.body)} readyEvents=${readyEvents.length}`);
    check(`${label} the late Ready leaves no error on Juma's first question`, alerts.length === 0, JSON.stringify(alerts));
    report.cases.push({ case: label, gameId: lateGame, startNow: sn.body, jumaAlerts: alerts, rows: c.rows });
    await finishGame(gid);
  }

  // ======== Case E: the host's confirm is open when the briefing expires; the stale confirm lands after ========
  {
    const label = "E-relay";
    const gid = await startGame("relay");
    for (const p of PLAYERS.filter((x) => !x.slow)) await clickReady(p);
    const g0 = (await serverState(roomId)).games.find((x) => x.id === gid);
    await advance(g0.briefing.startNowAt - (await serverState(roomId)).t);
    await host.page.getByTestId("briefing-start-now").click({ timeout: 10000 });
    await host.page.getByTestId("briefing-confirm").waitFor({ timeout: 10000 });
    await advance(g0.briefing.expiresAt - (await serverState(roomId)).t);
    await sleep(800);
    const st = await serverState(roomId);
    const gone = !st.games.some((x) => x.id === gid);
    const stale = await api(`/rooms/${roomId}/games/${gid}/start-now`, { token: host.seat.token, body: { confirmed: [PLAYERS.find((p) => p.slow).seat.playerId] } });
    await sleep(500);
    const note = await host.page.getByTestId("briefing-cancelled-note").innerText().catch(() => "");
    const dialog = await host.page.getByTestId("briefing-confirm").count();
    const cancelled = st.ledger.filter((e) => e.gameInstanceId === gid && e.type === "briefing-cancelled");
    const started = st.ledger.filter((e) => e.gameInstanceId === gid && e.type === "game-started");
    check(`${label} the expired briefing is cancelled once, never started; the stale confirm is refused`, gone && cancelled.length === 1 && started.length === 0 && stale.status >= 400, `${stale.status} ${JSON.stringify(stale.body)} cancelled=${cancelled.length}`);
    check(`${label} the host sees "Game cancelled", not the stale dialog`, dialog === 0 && /cancelled/i.test(note), note.replace(/\n/g, " / "));
    report.cases.push({ case: label, gameId: "relay", stale: { status: stale.status, body: stale.body }, hostNote: note, cancelled: cancelled.map((e) => ({ at: e.at, detail: e.detail })) });
    await host.page.getByTestId("briefing-cancelled-note").getByRole("button", { name: "OK" }).click().catch(() => {});
  }

  // ======== Case S: a slow network (informational: Chromium's emulated latency on Juma's phone) ========
  {
    const label = "S-team-huddle";
    const juma = PLAYERS.find((p) => p.slow);
    await juma.cdp.send("Network.enable");
    await juma.cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: -1, uploadThroughput: -1 });
    const gid = await startGame("team-huddle");
    await armPre("team-huddle", label, gid);
    for (const p of PLAYERS.filter((x) => !x.slow)) await intentApi(roomId, p.seat, gid, "briefing-ready", { ready: true });
    const since = Date.now();
    await intentApi(roomId, juma.seat, gid, "briefing-ready", { ready: true });
    const b = await until(async () => firstBcast(gid, (x) => x.status === "playing", since), 15000);
    await sleep(3000);
    const c = await collect(gid, label, b);
    await juma.cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    report.cases.push({ case: label, gameId: "team-huddle", emulatedLatencyMs: 400, playStartedAt: c.game.playStartedAt, firstPhaseDeadlineAt: c.game.phaseDeadlineAt, rows: c.rows });
    const jr = c.rows.find((r) => r.player === "juma");
    console.log(`INFO ${label} Juma (400 ms emulated latency): frame +${jr.frameLagMs} ms, actionable +${jr.actionableLagMs} ms; others max +${Math.max(...c.rows.filter((r) => r.player !== "juma").map((r) => r.actionableLagMs ?? -1))} ms`);
    check(`${label} one shared start and deadline whatever the network`, oneStart(c.ledger) && c.rows.every((r) => r.frameDeadlines?.phaseDeadlineAt === c.game.phaseDeadlineAt));
    await finishGame(gid);
  }

  // ======== Z: no orphaned or duplicated starts, and every played game finished once, over the whole run ========
  {
    const st = await serverState(roomId);
    const briefed = st.ledger.filter((e) => e.type === "game-briefing-started").map((e) => e.gameInstanceId);
    const per = (type) => (id) => st.ledger.filter((e) => e.type === type && e.gameInstanceId === id).length;
    const startedOnce = briefed.filter((id) => per("game-started")(id) === 1);
    const cancelled = briefed.filter((id) => per("briefing-cancelled")(id) === 1 && per("game-started")(id) === 0);
    const finishedOnce = startedOnce.filter((id) => per("game-finished")(id) === 1);
    const live = st.games.filter((g) => g.status === "briefing" || g.status === "playing").map((g) => g.id);
    check("Z every briefing either started exactly once or was cancelled, never both", startedOnce.length + cancelled.length === briefed.length, `briefings=${briefed.length} startedOnce=${startedOnce.length} cancelled=${cancelled.length}`);
    check("Z every started game finished exactly once; nothing is left in a briefing or in play", finishedOnce.length === startedOnce.length && live.length === 0, `finishedOnce=${finishedOnce.length} live=${JSON.stringify(live)}`);
    report.summary = { briefings: briefed.length, startedOnce: startedOnce.length, cancelled: cancelled.length, finishedOnce: finishedOnce.length };
  }
} finally {
  if (REPORT) writeFileSync(REPORT, `${JSON.stringify({ ...report, results }, null, 2)}\n`);
  await browser.close().catch(() => {});
  srv.child.kill("SIGTERM");
  await sleep(300);
  if (!process.env.FS_KEEP_DATA) rmSync(DATA_DIR, { recursive: true, force: true }); else console.log(`data and screenshots kept in ${DATA_DIR}`);
}
console.log(failures === 0 ? "ALL FAIR-START CHECKS PASSED" : `${failures} FAIR-START CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
