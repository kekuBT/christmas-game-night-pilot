// Handoff 7060711859: "before" screenshots of the current app for the compact UI options, with the same
// representative content the mockups use. Kept for reproducibility; it changes nothing in the app.
//   Run from the repository root, with a built web app:
//   MCHEZO_WEB_DIST=<dist> [MCHEZO_CHROMIUM_PATH=<chrome-headless-shell>] node docs/design/compact-options/capture-before.mjs <outDir>
// Its own server and data folder (deleted after). Content: a casual room hosted by Keku with Amina and Baraka,
// Jebena Rush with 3 cups; Keku answers every turn and the others let theirs run out, so the results are
// 230 / 100 / 0. Screens: home (host/join), lobby, game picker and Jebena results at 320 and 390 px in both
// looks; desktop companions (1280 px); TV companions (1920x1080 lobby and final).
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { launchChromium } from "../../../scripts/lib/driver-env.mjs";
import { freshAnswer, jebenaOracle } from "../../../scripts/lib/jebena-oracle.mjs";

const OUT = process.argv[2];
if (!OUT) { console.error("usage: capture-before.mjs <outDir>"); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
jebenaOracle();

const DATA = mkdtempSync(joinPath(tmpdir(), "mz-cui-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE; delete env.MCHEZO_LIFECYCLE_SCALE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; srv.stdout.on("data", (d) => { log += d; }); srv.stderr.on("data", (d) => { log += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(log); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.error(`server did not start: ${log.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function call(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const browser = await launchChromium();
const metrics = {};
const LOOKS = ["everyday", "christmas"];
const PHONES = [{ w: 320, h: 568 }, { w: 390, h: 844 }];
async function ctxFor(width, height, look, { mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript((l) => { try { localStorage.setItem("mz_look", l); } catch { /* none */ } }, look);
  return ctx;
}
/** Settle: fonts loaded, entrance animations over. */
const settle = async (p) => { await p.evaluate(() => document.fonts?.ready).catch(() => {}); await sleep(900); };
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 82 });
/** How much of the first screen each key part takes (CSS px), and how long the page is. */
async function measure(p, name, testids) {
  metrics[name] = await p.evaluate((ids) => {
    const vh = window.innerHeight;
    const scroller = document.querySelector("[data-testid$='-scroll']") ?? document.scrollingElement;
    const out = { viewport: [window.innerWidth, vh], scrollY: Math.round(Math.max(window.scrollY, scroller?.scrollTop ?? 0)), scrollHeight: Math.max(scroller?.scrollHeight ?? 0, document.documentElement.scrollHeight), sideScroll: document.documentElement.scrollWidth > window.innerWidth + 1, parts: {} };
    for (const id of ids) {
      const e = document.querySelector(`[data-testid="${id}"]`);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      out.parts[id] = { top: Math.round(r.top), height: Math.round(r.height), shareOfViewport: Math.round((r.height / vh) * 100) };
    }
    return out;
  }, testids);
}
/** Back to the top of the page (and of the app's own scroll area, where it has one). */
async function toTop(p) {
  await p.evaluate(() => { for (const e of [document.scrollingElement, ...document.querySelectorAll("[data-testid$='-scroll']")]) if (e) e.scrollTop = 0; window.scrollTo(0, 0); });
  await settle(p);
}
async function openSeat(seat, roomId, width, height, look, opts) {
  const ctx = await ctxFor(width, height, look, opts);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((x) => { sessionStorage.setItem("cgn_roomId", x.roomId); sessionStorage.setItem("cgn_playerId", x.playerId); sessionStorage.setItem("cgn_token", x.token); }, { roomId, playerId: seat.playerId, token: seat.recoveryToken });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return { ctx, p };
}

try {
  // ---------- Home (no session) ----------
  for (const look of LOOKS) for (const v of PHONES) {
    const ctx = await ctxFor(v.w, v.h, look); const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }); await p.getByTestId("home-dock").waitFor(); await settle(p);
    const name = `home-${v.w}-${look}`; await shot(p, name); await measure(p, name, ["home-dock", "home-join", "home-host", "home-featured", "home-solo"]);
    await ctx.close();
  }
  { const ctx = await ctxFor(1280, 800, "everyday", { mobile: false }); const p = await ctx.newPage(); await p.goto(`${BASE}/`); await p.getByTestId("home-dock").waitFor(); await settle(p); await shot(p, "home-desktop-1280-everyday"); await measure(p, "home-desktop-1280-everyday", ["home-dock", "home-featured"]); await ctx.close(); }

  // ---------- A casual room: Keku hosts, Amina and Baraka join ----------
  const room = (await call("/rooms", { body: { name: "Game night", kind: "casual" } })).body;
  const keku = (await call(`/rooms/${room.roomId}/join`, { body: { displayName: "Keku", asHost: true, hostClaimToken: room.hostClaimToken } })).body;
  const amina = (await call("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: "Amina" } })).body;
  const baraka = (await call("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: "Baraka" } })).body;
  const proj = async (tok) => (await call(`/rooms/${room.roomId}/projection?audience=player`, { token: tok })).body;
  await call(`/rooms/${room.roomId}/game-settings`, { token: keku.recoveryToken, body: { gameId: "jebena-rush", settings: { hearts: 3 }, baseRevision: (await proj(keku.recoveryToken)).session?.revision ?? 0 } });

  // ---------- Lobby and picker (Keku's seat) ----------
  for (const look of LOOKS) for (const v of PHONES) {
    const { ctx, p } = await openSeat(keku, room.roomId, v.w, v.h, look);
    await p.getByTestId("lobby-dock").waitFor({ timeout: 15000 }); await settle(p);
    if (look === LOOKS[0] && v === PHONES[0]) {
      // Up next: Jebena Rush (the host picks it once; the lobby keeps it).
      await p.getByTestId("choose-game").click(); await p.getByTestId("select-game-jebena-rush").click();
      await p.getByTestId("lobby-hearts-3").click().catch(() => {}); await settle(p);
    }
    // Tapping the cups control scrolls the page; every lobby is shot and measured from the top.
    await toTop(p);
    const name = `lobby-${v.w}-${look}`; await shot(p, name); await measure(p, name, ["lobby-dock", "lobby-status", "lobby-hearts", "choose-game"]);
    await p.getByTestId("choose-game").click(); await p.getByTestId("select-game-jebena-rush").waitFor(); await settle(p);
    await shot(p, `picker-${v.w}-${look}`); await measure(p, `picker-${v.w}-${look}`, ["choose-sheet"]);
    metrics[`picker-${v.w}-${look}`].gamesFullyVisible = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="select-game-"]')].filter((g) => { const r = g.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }).length);
    await ctx.close();
  }
  { const { ctx, p } = await openSeat(keku, room.roomId, 1280, 800, "everyday", { mobile: false }); await p.getByTestId("lobby-dock").waitFor(); await settle(p); await shot(p, "lobby-desktop-1280-everyday"); await ctx.close(); }
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); const TV = await tvCtx.newPage();
  await TV.goto(`${BASE}/join`); await TV.locator(".mz-code__input").fill(room.joinCode); await TV.getByTestId("watch-spectator").click();
  await TV.getByTestId("tv-show").waitFor({ timeout: 15000 }); await settle(TV); await shot(TV, "tv-lobby-1920-everyday");

  // ---------- The match: Keku answers, the others let their turns run out ----------
  // The roster is who is connected: keep Keku's phone open through the match.
  const hold = await openSeat(keku, room.roomId, 390, 844, "everyday");
  let p0 = null;
  for (let i = 0; i < 60; i++) { p0 = await proj(keku.recoveryToken); if ((p0.readiness?.wouldPlay ?? []).length === 3) break; await sleep(250); }
  if ((p0.readiness?.wouldPlay ?? []).length !== 3) throw new Error(`roster ${JSON.stringify(p0.readiness?.wouldPlay)}`);
  const start = await call(`/rooms/${room.roomId}/games`, { token: keku.recoveryToken, body: { gameId: "jebena-rush", official: false, roster: p0.readiness?.wouldPlay, attempt: { id: randomUUID(), sessionRevision: p0.session?.revision ?? 0 }, season: p0.contentSeason, settings: { hearts: 3 } } });
  if (start.status !== 201) throw new Error(`start ${start.status} ${JSON.stringify(start.body).slice(0, 200)}`);
  const gid = start.body.gameId;
  const intent = (who, action, payload) => call(`/rooms/${room.roomId}/intents`, { token: who.recoveryToken, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
  for (const who of [keku, amina, baraka]) await intent(who, "briefing-ready", { ready: true });
  const game = async () => ((await proj(keku.recoveryToken)).myGames ?? []).find((g) => g.id === gid);
  const used = new Set(); let lastN = null; let g = null;
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    g = await game();
    if (g?.status === "finished") break;
    const t = g?.state?.turn;
    if (g?.status !== "playing" || !t || t.n === lastN) { await sleep(150); continue; }
    lastN = t.n;
    if (t.player === keku.playerId) { const a = freshAnswer(g.state.category.id, used); used.add(a.name); await intent(keku, "jebena-answer", { turn: t.n, text: a.typed }); }
  }
  if (g?.status !== "finished") throw new Error("the match did not finish");
  if (!(g.state?.standings ?? []).some((r) => r.id === keku.playerId)) throw new Error("Keku was not in the match");
  const nameOf = { [keku.playerId]: "Keku", [amina.playerId]: "Amina", [baraka.playerId]: "Baraka" };
  metrics.roomCode = room.joinCode;
  metrics.standings = g.state.standings.map((r) => ({ name: nameOf[r.id], place: r.place, points: r.points, outlasted: r.outlasted, hearts: r.hearts, answers: r.answers, timeouts: r.timeouts }));

  // ---------- Results (Keku's seat) ----------
  for (const look of LOOKS) for (const v of PHONES) {
    const { ctx, p } = await openSeat(keku, room.roomId, v.w, v.h, look);
    try { await p.getByTestId("jr-standings").waitFor({ timeout: 20000 }); } catch (e) { await shot(p, "DEBUG-results"); writeFileSync(`${OUT}/DEBUG-results.txt`, `${p.url()}\n${await p.locator("body").innerText()}`); throw e; }
    await settle(p);
    const name = `results-${v.w}-${look}`; await shot(p, name); await measure(p, name, ["results-hero", "whats-next", "jr-standings", "jr-howscore"]);
    await ctx.close();
  }
  { const { ctx, p } = await openSeat(keku, room.roomId, 1280, 800, "everyday", { mobile: false }); await p.getByTestId("jr-standings").waitFor(); await settle(p); await shot(p, "results-desktop-1280-everyday"); await ctx.close(); }
  await TV.getByTestId("tv-jr-final").waitFor({ timeout: 20000 }); await settle(TV); await shot(TV, "tv-final-1920-everyday");
  writeFileSync(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 2));
  console.log("captured", Object.keys(metrics).length, "measurements");
} finally {
  await browser.close().catch(() => {});
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
