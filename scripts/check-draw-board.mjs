// H3 (handoff 7020760499): Draw & Guess's drawing board on phone screens, the drawer's first.
//   The reported symptom: a nearly black DRAWER screen in an iPhone in-app browser while the timer stayed
//   visible. This driver traces what the drawer's screen actually paints, in a synthetic private room with
//   three phones (320×568, 375×667, 390×844; mobile, touch, 2× pixels), each the drawer once:
//   - mounts and opacity of the screen over the whole turn (a screen that keeps re-entering, or never
//     finishes its entry, would stay dim while the clock above it stays visible);
//   - the board SVG: its box, whether it is in view, what is painted at its centre (elementFromPoint), the
//     computed display/visibility/opacity/transform/filter of it and every ancestor;
//   - pixels: the screenshot's brightness at the board's centre and across the whole screen;
//   - drawing with touch (CDP touch events: Chromium's emulation, not a native iPhone), the stroke on the
//     drawer's board, on the server and on every guesser's board;
//   - a reload mid-turn, and the next drawer.
//   With DG_NO_WS=1 the pages have no WebSocket (the app falls back to HTTP polls), as a stand-in for an
//   in-app browser that blocks it. Neither is a native iPhone: this cannot clear H3 on its own.
// Isolated server, no content test mode. Time scale 0.5.
// Starts ITS OWN server. Usage: node scripts/check-draw-board.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const NO_WS = process.env.DG_NO_WS === "1";
const DATA = mkdtempSync(join(tmpdir(), "mz-dgb-"));
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

const NAMES = ["Keku", "Amina", "Baraka"];
const SIZES = [[320, 568], [375, 667], [390, 844]];
const room = await api("/rooms", { body: { name: "Draw board" } });
const seats = [];
{
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  seats.push({ name: NAMES[0], playerId: h.playerId, token: h.recoveryToken });
  for (const n of NAMES.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
}

/** In every phone page, from its first script: screen mounts, the screen's opacity every 100 ms, page errors. */
const PROBE = `(() => {
  ${NO_WS ? "window.WebSocket = function () { throw new Error('no WebSocket here'); };" : ""}
  const d = window.__dg = { mounts: [], samples: [], errors: [] };
  const seen = new WeakSet();
  const note = () => { for (const m of document.querySelectorAll('main.mz-screen')) if (!seen.has(m)) { seen.add(m); d.mounts.push({ t: Math.round(performance.now()), id: m.getAttribute('data-testid') }); } };
  new MutationObserver(note).observe(document, { childList: true, subtree: true });
  addEventListener('error', (e) => d.errors.push(String(e.message)));
  addEventListener('unhandledrejection', (e) => d.errors.push(String(e.reason)));
  // A stalled entry: with sessionStorage dg_stall=1, each Draw & Guess screen's entry animation is held at its first
  // frame as it mounts, as a suspended or throttled web view can leave it. The screen must still be visible.
  new MutationObserver(() => {
    if (sessionStorage.getItem('dg_stall') !== '1') return;
    for (const m of document.querySelectorAll('main.mz-screen[data-testid^="mz-dg-"]')) if (!m.__held) { m.__held = true; for (const a of m.getAnimations()) { a.pause(); a.currentTime = 0; } }
  }).observe(document, { childList: true, subtree: true });
  setInterval(() => { const m = document.querySelector('main.mz-screen'); if (m) { d.samples.push([Math.round(performance.now()), m.getAttribute('data-testid'), Number(getComputedStyle(m).opacity)]); if (d.samples.length > 4000) d.samples.shift(); } }, 100);
})();`;

const browser = await launchChromium();
async function phone(seat, [w, h]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript({ content: PROBE });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return p;
}
const tvGame = async () => (await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.at(-1);
const sigOf = (pieces) => `${(pieces ?? []).length}:${(pieces ?? []).reduce((n, x) => n + x.p.length / 2, 0)}`;

/** What the board is, where, and what is painted over its centre; the screen and every ancestor's paint-related styles. */
const trace = (p) => p.evaluate(() => {
  const svg = document.querySelector('[data-testid="mz-dg-board"]');
  const main = document.querySelector("main.mz-screen");
  const st = (el) => { const s = getComputedStyle(el); return { display: s.display, visibility: s.visibility, opacity: s.opacity, transform: s.transform, filter: s.filter, bg: s.backgroundColor, h: s.height, anim: s.animationName }; };
  const chain = [];
  for (let el = svg; el && el !== document.documentElement; el = el.parentElement) chain.push({ tag: el.tagName.toLowerCase(), cls: String(el.getAttribute("class") ?? ""), ...st(el) });
  const r = svg?.getBoundingClientRect();
  const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  const paper = svg?.querySelector("rect");
  return {
    screen: main?.getAttribute("data-testid") ?? null,
    viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    scroll: [Math.round(document.scrollingElement.scrollTop), Math.round(main?.scrollTop ?? 0)],
    board: r ? [r.x, r.y, r.width, r.height].map(Math.round) : null,
    inView: !!r && r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0,
    hitInBoard: !!hit?.closest?.('[data-testid="mz-dg-board"]'),
    paperFill: paper ? getComputedStyle(paper).fill : null,
    pieces: svg ? Number(svg.getAttribute("data-pieces")) : null,
    sig: svg?.getAttribute("data-sig") ?? null,
    anims: main ? main.getAnimations().map((a) => `${a.animationName}:${a.playState}`) : [],
    chain,
  };
});
/** Mean brightness (0–255) of a screenshot: the whole page and a square at the board's centre. */
async function brightness(p, board) {
  const png = PNG.sync.read(await p.screenshot());
  const dpr = png.width / (await p.evaluate(() => innerWidth));
  const lum = (x0, y0, x1, y1) => {
    let s = 0, n = 0;
    // Whole pixels only: a fractional x or y would read across channels (alpha included).
    [x0, y0, x1, y1] = [x0, y0, x1, y1].map(Math.round);
    for (let y = Math.max(0, y0); y < Math.min(png.height, y1); y += 2) for (let x = Math.max(0, x0); x < Math.min(png.width, x1); x += 2) {
      const i = (y * png.width + x) * 4; s += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]; n++;
    }
    return n ? Math.round(s / n) : null;
  };
  const whole = lum(0, 0, png.width, png.height);
  if (!board) return { whole, board: null };
  const [x, y, w, h] = board.map((v) => Math.round(v * dpr));
  return { whole, board: lum(x + w / 4, y + h / 4, x + (3 * w) / 4, y + (3 * h) / 4) };
}
/** A finger stroke (CDP touch events, as Chromium emulates a phone). */
async function touchStroke(p, from = [0.25, 0.3], to = [0.75, 0.7]) {
  const box = await p.getByTestId("mz-dg-board").boundingBox();
  const at = ([fx, fy]) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const a = at(from), b = at(to);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 12; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 12, y: a.y + ((b.y - a.y) * i) / 12 }] }); await sleep(25); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
/** The drawer screen's opacity samples since `t0`, after its entry (first 600 ms of each mount excluded). */
const dimSince = (p, t0) => p.evaluate((t) => {
  const d = window.__dg;
  const mounts = d.mounts.filter((m) => m.t >= t);
  const settled = (ts) => !d.mounts.some((m) => m.t <= ts && ts - m.t < 600);
  const drawer = d.samples.filter(([ts, id]) => ts >= t && id === "mz-dg-draw" && settled(ts));
  const dim = drawer.filter(([, , o]) => o < 0.95);
  return { mounts: mounts.map((m) => m.id), samples: drawer.length, dim: dim.length, minOpacity: drawer.reduce((m, [, , o]) => Math.min(m, o), 1), errors: d.errors };
}, t0);

const report = [];
try {
  const pages = [];
  for (const [i, s] of seats.entries()) pages.push(await phone(s, SIZES[i]));
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  await pages[0].getByTestId("choose-game").click();
  await pages[0].getByTestId("select-game-draw-guess").click();
  await pages[0].getByTestId("start-practice-draw-guess").click();
  for (const p of pages) await p.getByTestId("briefing-ready").click({ timeout: 15000 });

  const seatOf = (pid) => seats.findIndex((s) => s.playerId === pid);
  const turns = (await soon("the game starts with a drawer", async () => (await tvGame())?.state?.phase === "draw", 30000)) ? (await tvGame()).state.turnCount : 0;
  const drewOnce = new Set();
  for (let n = 1; n <= turns; n++) {
    await soon(`turn ${n}: one phone draws, the others guess`, async () => { const g = await tvGame(); return g.state.turn === n - 1 && g.state.phase === "draw"; }, 40000);
    const g = await tvGame();
    const d = seatOf(g.state.drawerId);
    drewOnce.add(d);
    const drawer = pages[d];
    const size = SIZES[d].join("×");
    const t0 = await drawer.evaluate(() => performance.now() - 2000);
    await drawer.getByTestId("mz-dg-draw").waitFor({ timeout: 10000 });
    await sleep(700); // past the screen's 0.38 s entry
    // ---- First drawer render.
    const first = await trace(drawer);
    const lum1 = await brightness(drawer, first.board);
    await drawer.screenshot({ path: screenshotPath(`docs/evidence/draw-board/turn${n}-drawer-${size}.png`) });
    report.push({ turn: n, size, step: "first render", ...first, lum: lum1 });
    check(`turn ${n} (${size}): the drawer's board is in view and painted (its centre is the board, paper fill, opacity 1 up the chain)`, first.inView && first.hitInBoard && /255, 253, 247/.test(first.paperFill ?? "") && first.chain.every((c) => c.opacity === "1" && c.visibility === "visible" && c.display !== "none"), JSON.stringify({ board: first.board, hit: first.hitInBoard, fill: first.paperFill, anims: first.anims }));
    check(`turn ${n} (${size}): the drawer's screen is not dark: the board's centre is paper-bright`, lum1.board !== null && lum1.board > 200, JSON.stringify(lum1));
    // ---- Touch drawing reaches the server and every guesser.
    await touchStroke(drawer);
    await soon(`turn ${n} (${size}): a touch stroke reaches the server`, async () => ((await tvGame()).state.pieces ?? []).length >= 1, 8000);
    // A stroke reaches the server in batches (~3 a second): compare every board with the server's drawing as it is now.
    let server = null;
    const boards = () => Promise.all(pages.map((p) => p.getByTestId("mz-dg-board").first().getAttribute("data-sig", { timeout: 1000 }).catch(() => null)));
    const synced = await soon(`turn ${n} (${size}): the drawer's board and every guesser's board show the server's whole drawing`, async () => {
      server = sigOf((await tvGame()).state.pieces);
      return (await boards()).every((s) => s === server);
    }, 10000);
    if (!synced) console.log(`  boards ${JSON.stringify({ server, seats: (await boards()).map((s, i) => `${NAMES[i]}${i === d ? " (drawer)" : ""}: ${s}`) })}`);
    const drawn = await trace(drawer);
    const lum2 = await brightness(drawer, drawn.board);
    report.push({ turn: n, size, step: "after a touch stroke", ...drawn, lum: lum2 });
    check(`turn ${n} (${size}): after drawing, still bright, with the stroke`, lum2.board > 150 && drawn.pieces >= 1, JSON.stringify(lum2));
    // ---- The turn so far: the drawer's screen mounted once and never dim once entered.
    const dim = await dimSince(drawer, t0);
    report.push({ turn: n, size, step: "turn summary", ...dim });
    check(`turn ${n} (${size}): the drawer's screen never re-entered or dimmed during the turn`, dim.dim === 0 && dim.mounts.filter((m) => m === "mz-dg-draw").length === 1 && dim.errors.length === 0, JSON.stringify(dim));
    // ---- Reload mid-turn (first turn only: one reload is enough evidence and keeps the turn short).
    if (n === 1) {
      await drawer.reload({ waitUntil: "domcontentloaded" });
      await drawer.getByTestId("mz-dg-draw").waitFor({ timeout: 15000 });
      await sleep(700);
      const back = await trace(drawer);
      const lum3 = await brightness(drawer, back.board);
      report.push({ turn: n, size, step: "after a reload", ...back, lum: lum3 });
      check(`turn ${n} (${size}): after a reload the drawer is back on its board, bright, with the drawing so far`, back.inView && back.hitInBoard && lum3.board > 150 && back.sig === server, JSON.stringify({ sig: back.sig, server, lum: lum3 }));
      await sleep(1500);
      const again = await dimSince(drawer, 0); // the reloaded page's own record, from its start
      report.push({ turn: n, size, step: "after the reload, summary", ...again });
      check(`turn ${n} (${size}): after the reload, one drawer screen, never dim once entered`, again.dim === 0 && again.mounts.filter((m) => m === "mz-dg-draw").length === 1 && again.errors.length === 0, JSON.stringify(again));
      // ---- A stalled entry: reload again with the screen's entry animation held at its first frame (the drawer's
      // page and one guesser's). The reported picture was a nearly black drawer screen with the clock still showing.
      const guesser = pages[(d + 1) % pages.length];
      for (const p of [drawer, guesser]) { await p.evaluate(() => sessionStorage.setItem("dg_stall", "1")); await p.reload({ waitUntil: "domcontentloaded" }); }
      await drawer.getByTestId("mz-dg-draw").waitFor({ timeout: 15000 });
      await guesser.getByTestId("mz-dg-guess").waitFor({ timeout: 15000 });
      await sleep(900);
      for (const [who, p] of [["drawer", drawer], ["guesser", guesser]]) {
        const held = await trace(p);
        const lum = await brightness(p, held.board);
        const clock = await p.getByTestId("mz-game-clock").first().isVisible().catch(() => false);
        await p.screenshot({ path: screenshotPath(`docs/evidence/draw-board/stalled-entry-${who}-${p.viewportSize().width}x${p.viewportSize().height}.png`) });
        report.push({ turn: n, step: `stalled entry, ${who}`, screen: held.screen, opacity: held.chain.find((c) => c.tag === "main")?.opacity, anims: held.anims, lum, clock });
        check(`a stalled screen entry (${who}, ${p.viewportSize().width}×${p.viewportSize().height}): the screen is still fully visible and its board paper-bright, not dark behind a visible clock`, held.chain.every((c) => c.opacity === "1") && lum.board > 150, JSON.stringify({ opacity: held.chain.find((c) => c.tag === "main")?.opacity, anims: held.anims, lum, clock }));
        await p.evaluate(() => sessionStorage.removeItem("dg_stall"));
      }
    }
    // ---- Next drawer: this one gives up; the reveal; the next turn.
    await drawer.getByTestId("mz-dg-giveup").click();
  }
  check("every phone size was the drawer once", drewOnce.size === Math.min(turns, 3), `${[...drewOnce].map((i) => SIZES[i].join("×")).join(", ")}`);
  console.log(`MCHEZO_DRAW_BOARD ${JSON.stringify({ noWebSocket: NO_WS, report })}`);
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "DRAW BOARD ALL PASSED" : `DRAW BOARD FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
