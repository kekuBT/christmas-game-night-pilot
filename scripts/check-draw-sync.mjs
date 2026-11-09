// Stage 5.1 (S5-AUD-04): Draw & Guess live drawing reaches EVERY guesser.
//
// Four players in independent browser contexts and a spectator TV. Every
// player takes a drawing turn. Throughout, a sampler compares the server's
// confirmed drawing (the public projection) with what each guesser's and the
// TV's canvas renders (data-sig = pieces:points), and records every
// projection each guesser received over the WebSocket and over HTTP, so a
// screen that RECEIVED a drawing but didn't render it is told apart from one
// that never got it.
//
// Faults, one guesser at a time while the others stay normal:
//   - the WebSocket stops delivering (polling must carry the drawing);
//   - HTTP projection replies delayed and delivered out of order;
//   - every reply stalls (socket and polls): the screen must say it can't
//     reach the game rather than sit silently on an empty canvas;
//   - a page hidden and shown again;
//   - a guesser reloads mid-drawing; the drawer reloads mid-drawing;
//   - the drawer drops off the network and comes back (unsent strokes retried);
//   - a spectator joins mid-turn; undo and clear; a burst of rapid strokes.
// A guesser fails the test if it stays behind the server's confirmed drawing
// for longer than the allowance while the others show it. The final reveal
// showing the drawing is NOT counted as live delivery.
// Isolated server, time scale 0.5. Usage: node scripts/check-draw-sync.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-dsync-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, MCHEZO_LIFECYCLE_SCALE: "0.5" };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function call(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function api(path, opts) { const r = await call(path, opts); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; }
const NAMES = ["Keku", "Amina", "Baraka", "Wanjiru"];
const room = await api("/rooms", { body: { name: "Draw sync" } });
const seats = [];
{
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  seats.push({ name: NAMES[0], playerId: h.playerId, token: h.recoveryToken });
  for (const n of NAMES.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
}
const sigOf = (pieces) => `${(pieces ?? []).length}:${(pieces ?? []).reduce((n, x) => n + x.p.length / 2, 0)}`;
const countOf = (sig) => Number(String(sig ?? "0:0").split(":")[0]);
const tvGame = async () => (await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.at(-1);

const browser = await launchChromium();
const WIDTHS = [390, 375, 430, 320];
/** Per page: the network mode and what it has received (WS frames and HTTP projections). */
const net = new Map();
async function phone(seat, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  const n = { ws: "pass", http: "pass", received: [] };
  net.set(p, n);
  const note = (via, text) => {
    try {
      const m = JSON.parse(text);
      const st = m.kind === "projection" ? m.state : m;
      const g = (st?.myGames ?? st?.games ?? []).find((x) => x.gameId === "draw-guess");
      if (g?.state?.pieces) n.received.push({ at: Date.now(), via, sig: sigOf(g.state.pieces), turn: g.state.turn, phase: g.state.phase });
    } catch { /* not a projection */ }
  };
  await p.routeWebSocket(/.*/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      if (n.ws === "drop") return; // the socket stays open but delivers nothing
      note("ws", typeof m === "string" ? m : m.toString());
      ws.send(m);
    });
  });
  await p.route(/\/projection\?/, async (route) => {
    if (n.http === "stall") { await sleep(60000).catch(() => {}); return route.abort().catch(() => {}); }
    const resp = await route.fetch().catch(() => null);
    if (!resp) return route.abort().catch(() => {});
    const body = await resp.text();
    if (n.http === "jitter") await sleep(Math.random() * 1800); // replies land late and out of order
    note("http", body);
    await route.fulfill({ response: resp, body }).catch(() => {});
  });
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return p;
}
async function watcher(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const tv = await ctx.newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.joinCode);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
  return tv;
}
const boardSig = async (page, testId = "mz-dg-board") => page.getByTestId(testId).first().getAttribute("data-sig", { timeout: 1000 }).catch(() => null);

/** A stroke with the mouse or with touch events, as on a phone. */
async function stroke(p, { touch = false, from = [0.2, 0.3], to = [0.8, 0.7], steps = 10 } = {}) {
  const box = await p.getByTestId("mz-dg-board").boundingBox();
  const at = ([fx, fy]) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const a = at(from), b = at(to);
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }] });
      await sleep(25);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps });
    await p.mouse.up();
  }
}

/**
 * The sampler: every 200 ms, the server's confirmed drawing and every
 * viewer's rendered drawing. A viewer is "behind" while it shows fewer
 * confirmed pieces than the server had 1 s earlier (rendering a newer state,
 * or an undo the server already applied, is never behind). Records the
 * longest time each viewer stayed behind, and whether it had RECEIVED a
 * projection with the drawing during that time.
 */
function sampler(viewers, getServerSig) {
  const hist = []; // { at, sig }
  const st = new Map();
  const statOf = (name) => { if (!st.has(name)) st.set(name, { behindSince: null, worst: 0, worstAt: null, receivedButBehind: 0 }); return st.get(name); };
  for (const v of viewers) statOf(v.name);
  let stop = false;
  const loop = (async () => {
    while (!stop) {
      const at = Date.now();
      const s = await getServerSig().catch(() => null);
      if (s) hist.push({ at, sig: s });
      const ref = [...hist].reverse().find((h) => h.at <= at - 1000) ?? null;
      await Promise.all(viewers.map(async (v) => {
        if (!v.active()) { statOf(v.name).behindSince = null; return; }
        const shown = await boardSig(v.page, v.testId);
        const r = statOf(v.name);
        const need = ref ? countOf(ref.sig) : 0;
        const behind = shown !== null && countOf(shown) < need && countOf(s) >= need;
        if (behind) {
          r.behindSince ??= at;
          const dur = at - r.behindSince;
          if (dur > r.worst) { r.worst = dur; r.worstAt = at; }
          const n = net.get(v.page);
          if (n && n.received.some((x) => x.at >= r.behindSince && countOf(x.sig) >= need && x.at < at - 600)) r.receivedButBehind += 1;
        } else r.behindSince = null;
      }));
      await sleep(200);
    }
  })();
  return { stats: st, stop: async () => { stop = true; await loop; } };
}

try {
  let pages = [];
  for (const [i, s] of seats.entries()) pages.push(await phone(s, WIDTHS[i]));
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  const tv = await watcher();
  await pages[0].getByTestId("choose-game").click();
  await pages[0].getByTestId("select-game-draw-guess").click();
  await pages[0].getByTestId("start-practice-draw-guess").click();
  for (const p of pages) await p.getByTestId("briefing-ready").click({ timeout: 20000 });

  const seatOf = (pid) => seats.findIndex((s) => s.playerId === pid);
  let lateTv = null;
  const turnStart = async (n) => {
    await soon(`turn ${n}: the drawer draws, the others guess`, async () => {
      const g = await tvGame();
      if (g.state.turn !== n - 1 || g.state.phase !== "draw") return false;
      const d = seatOf(g.state.drawerId);
      return (await pages[d].getByTestId("mz-dg-draw").count()) === 1;
    }, 50000);
    const g = await tvGame();
    const d = seatOf(g.state.drawerId);
    const word = ((await pages[d].getByTestId("mz-dg-word").textContent()) ?? "").replace(/^Draw:\s*/i, "").trim();
    return { d, word, guessers: [0, 1, 2, 3].filter((i) => i !== d) };
  };
  /** Wait until the server's drawing is stable, then every viewer must show exactly it. */
  const converged = async (label, viewers, limit = 4000) => {
    let s = sigOf((await tvGame()).state.pieces), stable = Date.now();
    while (Date.now() - stable < 700) { await sleep(150); const t = sigOf((await tvGame()).state.pieces); if (t !== s) { s = t; stable = Date.now(); } }
    const t0 = Date.now();
    const lag = {};
    await Promise.all(viewers.map(async (v) => {
      while (Date.now() - t0 < limit) { if ((await boardSig(v.page, v.testId)) === s) { lag[v.name] = Date.now() - t0; return; } await sleep(100); }
      lag[v.name] = null;
    }));
    check(`${label}: every viewer shows the server's drawing (${s}) within ${limit} ms`, Object.values(lag).every((x) => x !== null), JSON.stringify(lag));
    return lag;
  };
  const report = [];
  const runTurn = async (n, plan) => {
    const t = await turnStart(n);
    const viewers = [...t.guessers.map((i) => ({ name: NAMES[i], page: pages[i], testId: "mz-dg-board", active: () => true })), { name: "TV", page: tv, testId: "tv-dg-board", active: () => true }];
    if (lateTv) viewers.push({ name: "TV2", page: lateTv, testId: "tv-dg-board", active: () => true });
    const smp = sampler(viewers, async () => sigOf((await tvGame()).state.pieces));
    await plan(t, viewers);
    await smp.stop();
    for (const v of viewers) {
      const r = smp.stats.get(v.name) ?? { worst: 0, receivedButBehind: 0 };
      const allow = v.allow ?? 3500;
      report.push({ turn: n, viewer: v.name, worstBehindMs: r.worst, allow, receivedButBehind: r.receivedButBehind });
      check(`turn ${n}: ${v.name} never stays behind the server's drawing longer than ${allow} ms`, r.worst <= allow, `worst ${r.worst} ms`);
      check(`turn ${n}: ${v.name} never had a received drawing left unrendered`, r.receivedButBehind === 0, `${r.receivedButBehind} samples`);
    }
    // End the turn by guessing (the reveal is NOT counted as delivery).
    for (const g of t.guessers) { const p = pages[g]; if (await p.getByTestId("mz-dg-input").count()) { await p.getByTestId("mz-dg-input").fill(t.word); await p.getByTestId("mz-dg-send").click(); } }
    await soon(`turn ${n}: the reveal`, async () => (await tvGame()).state.phase !== "draw", 20000);
    return t;
  };

  // ---- Turn 1: normal play, touch strokes, a burst, undo and clear; the TV and three guessers.
  await runTurn(1, async ({ d }, viewers) => {
    await stroke(pages[d], { touch: true });
    await converged("turn 1, first (touch) stroke", viewers);
    for (let k = 0; k < 12; k++) await stroke(pages[d], { from: [0.1 + k * 0.06, 0.1], to: [0.15 + k * 0.06, 0.9], steps: 14 });
    await converged("turn 1, a burst of 12 rapid strokes", viewers);
    await pages[d].getByTestId("mz-dg-undo").click();
    await converged("turn 1, undo", viewers);
    await pages[d].getByTestId("mz-dg-clear").click();
    await converged("turn 1, clear", viewers);
    await stroke(pages[d]);
    await converged("turn 1, drawing again after clear", viewers);
  });

  // ---- Turn 2: one guesser's socket stops delivering; another gets late, out-of-order replies; a spectator joins mid-turn.
  await runTurn(2, async ({ d, guessers: [ga, gb] }, viewers) => {
    net.get(pages[ga]).ws = "drop";
    net.get(pages[gb]).http = "jitter";
    viewers.find((v) => v.name === NAMES[ga]).allow = 5000; // polling only: one 2 s poll plus delivery
    viewers.find((v) => v.name === NAMES[gb]).allow = 5000;
    for (let k = 0; k < 6; k++) { await stroke(pages[d], { from: [0.1, 0.1 + k * 0.12], to: [0.9, 0.15 + k * 0.12] }); await sleep(400); }
    await converged("turn 2, socket silent (polling) and jittered replies", viewers, 6000);
    lateTv = await watcher(1280, 720);
    await soon("turn 2: a spectator joining mid-turn sees the drawing so far", async () => (await boardSig(lateTv, "tv-dg-board")) === sigOf((await tvGame()).state.pieces), 8000);
    viewers.push({ name: "TV2", page: lateTv, testId: "tv-dg-board", active: () => true });
    await stroke(pages[d]);
    await converged("turn 2, after the spectator joined", viewers, 6000);
    net.get(pages[ga]).ws = "pass";
    net.get(pages[gb]).http = "pass";
  });

  // ---- Turn 3: a guesser reloads mid-drawing; the drawer reloads mid-drawing; a page is hidden and shown.
  await runTurn(3, async ({ d, guessers: [ga, gb] }, viewers) => {
    for (let k = 0; k < 3; k++) await stroke(pages[d], { from: [0.2, 0.2 + k * 0.2], to: [0.8, 0.25 + k * 0.2] });
    await converged("turn 3, before reloads", viewers);
    const vga = viewers.find((v) => v.name === NAMES[ga]);
    let reloading = true; vga.active = () => !reloading;
    await pages[ga].reload({ waitUntil: "domcontentloaded" });
    await pages[ga].getByTestId("mz-dg-board").waitFor({ timeout: 15000 });
    reloading = false;
    await converged("turn 3, a guesser reloaded mid-drawing", viewers);
    await pages[d].reload({ waitUntil: "domcontentloaded" });
    await pages[d].getByTestId("mz-dg-draw").waitFor({ timeout: 15000 });
    await stroke(pages[d]);
    await converged("turn 3, the drawer reloaded mid-drawing and drew again", viewers);
    // Hidden, then shown (as when a phone screen locks): the app reconnects at once.
    await pages[gb].evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await stroke(pages[d]);
    await sleep(1500);
    await pages[gb].evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
    await converged("turn 3, a page hidden and shown again", viewers);
  });

  // ---- Turn 4: the drawer drops off the network and comes back; a guesser whose every reply stalls.
  await runTurn(4, async ({ d, guessers: [, gb] }, viewers) => {
    await stroke(pages[d]);
    await converged("turn 4, first stroke", viewers);
    await pages[d].context().setOffline(true);
    await stroke(pages[d], { from: [0.1, 0.9], to: [0.9, 0.1] });
    await sleep(2500);
    await pages[d].context().setOffline(false);
    await converged("turn 4, the drawer came back: the stroke drawn offline arrives", viewers, 8000);
    // Every reply to one guesser stalls (as a stuck tunnel can): it must not sit silently.
    const vgb = viewers.find((v) => v.name === NAMES[gb]);
    vgb.active = () => false;
    net.get(pages[gb]).ws = "drop";
    net.get(pages[gb]).http = "stall";
    await stroke(pages[d]);
    await soon("turn 4: a guesser whose replies all stall is told it can't reach the game (not a silent blank)", async () => /can.?t reach the game|Reconnecting|Connection lost/i.test(await pages[gb].locator("body").innerText()), 15000);
    await pages[gb].screenshot({ path: screenshotPath("docs/stage5-qa/after/dsync-stalled-320.png") });
    net.get(pages[gb]).ws = "pass";
    net.get(pages[gb]).http = "pass";
    await pages[gb].evaluate(() => window.dispatchEvent(new Event("online")));
    await soon("turn 4: when replies flow again, that guesser catches up", async () => (await boardSig(pages[gb])) === sigOf((await tvGame()).state.pieces), 12000);
    vgb.active = () => true;
  });

  console.log(`SYNC REPORT ${JSON.stringify(report)}`);
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "DRAW SYNC ALL PASSED" : `DRAW SYNC FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
