// Handoff 7065498313 (D-UI-02), colour exploration: the compact mix's Home, Lobby and Jebena Rush results under the
// current palette and the two treatments in palettes.mjs, at 390 and 320 px in both looks, on the same live room.
// The treatments are applied as a stylesheet over the app's own theme variables, in the screenshot browser only:
// the app's defaults are unchanged. Each shot is also checked for text contrast as rendered (WCAG AA, the shared
// contrast helper) and for the focus ring on Join (home) and on Play again (results).
//   Run from the repository root, with a built web app:
//   MCHEZO_WEB_DIST=<dist> [MCHEZO_CHROMIUM_PATH=<chrome-headless-shell>] node docs/design/compact-mix/capture-palettes.mjs <outDir>
// Content: a casual room hosted by Keku with Amina and Baraka, Jebena Rush with 3 cups; Keku answers every turn and
// the others let theirs run out, so the results are 230 / 100 / 0 (as in docs/design/compact-options/).
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { launchChromium } from "../../../scripts/lib/driver-env.mjs";
import { contrastFailures } from "../../../scripts/lib/contrast.mjs";
import { freshAnswer, jebenaOracle } from "../../../scripts/lib/jebena-oracle.mjs";
import { CURRENT, PALETTES, overrideCss, tokensFor } from "./palettes.mjs";

const OUT = process.argv[2];
if (!OUT) { console.error("usage: capture-palettes.mjs <outDir>"); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
jebenaOracle();

const DATA = mkdtempSync(joinPath(tmpdir(), "mz-pal-"));
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
const report = { palettes: Object.fromEntries(Object.entries(PALETTES).map(([k, v]) => [k, v.label])), shots: [] };
const LOOKS = ["everyday", "christmas"];
const PHONES = [{ w: 390, h: 844 }, { w: 320, h: 568 }];
const NAMES = Object.keys(PALETTES);
async function ctxFor(v, look, palette) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(({ l, css }) => {
    try { localStorage.setItem("mz_look", l); } catch { /* none */ }
    if (!css) return;
    const add = () => { if (document.getElementById("mz-palette")) return; const s = document.createElement("style"); s.id = "mz-palette"; s.textContent = css; (document.head ?? document.documentElement).appendChild(s); };
    if (document.documentElement) add(); else document.addEventListener("DOMContentLoaded", add);
  }, { l: look, css: overrideCss(palette) });
  return ctx;
}
const settle = async (p) => { await p.evaluate(() => document.fonts?.ready).catch(() => {}); await sleep(800); };
/** The palette is live: the page's computed theme variables are the palette's tokens for this look. */
const liveTokens = (p) => p.evaluate(() => { const cs = getComputedStyle(document.querySelector(".mz-root") ?? document.documentElement); const g = (n) => cs.getPropertyValue(n).trim().toUpperCase(); return { ground: g("--mz-ground"), surface1: g("--mz-surface-1"), brand: g("--mz-brand"), highlight: g("--mz-highlight"), text: g("--mz-text") }; });
/** Tab to a control and read its focus ring against what is behind it (the same measure as check-compact-mix). */
async function ringOn(p, testid, max = 60) {
  for (let i = 0; i < max; i++) {
    await p.keyboard.press("Tab");
    if ((await p.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === testid) break;
  }
  return p.evaluate(() => {
    const parse = (s) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s ?? ""); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
    const el = document.activeElement; const cs = getComputedStyle(el);
    let bg = [255, 255, 255, 1]; const layers = [];
    for (let cur = el.parentElement; cur; cur = cur.parentElement) { const c = parse(getComputedStyle(cur).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    bg = layers.reverse().reduce((a, l) => over(l, a), parse(getComputedStyle(document.documentElement).backgroundColor) ?? bg);
    const col = parse(cs.outlineColor); if (!col) return { id: el.getAttribute("data-testid"), ratio: 0 };
    const a = lum(over(col, bg)), b = lum(bg);
    return { id: el.getAttribute("data-testid"), width: parseFloat(cs.outlineWidth), ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 };
  });
}
async function record(p, name, extra = {}) {
  await p.evaluate(() => document.activeElement?.blur?.());
  if (extra.top !== false) await p.evaluate(() => { for (const e of [document.scrollingElement, ...document.querySelectorAll("*")]) if (e && e.scrollTop > 0) e.scrollTop = 0; });
  await sleep(250);
  delete extra.top;
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 84 });
  const fails = await contrastFailures(p);
  report.shots.push({ name, contrastFailures: fails, ...extra });
}
async function openSeat(seat, roomId, v, look, palette) {
  const ctx = await ctxFor(v, look, palette); const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((x) => { sessionStorage.setItem("cgn_roomId", x.roomId); sessionStorage.setItem("cgn_playerId", x.playerId); sessionStorage.setItem("cgn_token", x.token); }, { roomId, playerId: seat.playerId, token: seat.recoveryToken });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return { ctx, p };
}
const want = (palette, look) => { const t = tokensFor(palette, look); return { ground: t.ground, surface1: t.surface1, brand: t.brand, highlight: t.highlight, text: t.text }; };

try {
  // ---------- Home ----------
  for (const palette of NAMES) for (const look of LOOKS) for (const v of PHONES) {
    const ctx = await ctxFor(v, look, palette); const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }); await p.getByTestId("home-dock").waitFor(); await settle(p);
    const live = await liveTokens(p);
    if (JSON.stringify(live) !== JSON.stringify(want(palette, look))) throw new Error(`${palette}/${look}: tokens not live: ${JSON.stringify(live)} vs ${JSON.stringify(want(palette, look))}`);
    const ring = await ringOn(p, "home-join", 8);
    await p.evaluate(() => document.activeElement?.blur?.());
    await record(p, `home-${v.w}-${look}-${palette}`, { focusJoin: ring });
    await ctx.close();
  }

  // ---------- A casual room: Keku hosts, Amina and Baraka join; Jebena Rush, 3 cups ----------
  const room = (await call("/rooms", { body: { name: "Game night", kind: "casual" } })).body;
  const keku = (await call(`/rooms/${room.roomId}/join`, { body: { displayName: "Keku", asHost: true, hostClaimToken: room.hostClaimToken } })).body;
  const amina = (await call("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: "Amina" } })).body;
  const baraka = (await call("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: "Baraka" } })).body;
  const proj = async (tok) => (await call(`/rooms/${room.roomId}/projection?audience=player`, { token: tok })).body;
  {
    const { ctx, p } = await openSeat(keku, room.roomId, PHONES[0], "everyday", "current");
    await p.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    await p.getByTestId("choose-game").click(); await p.getByTestId("select-game-jebena-rush").click();
    await p.getByTestId("lobby-chip-setting").click(); await p.getByTestId("lobby-hearts-3").click();
    for (let i = 0; i < 40 && (await proj(keku.recoveryToken)).lobbySettings?.["jebena-rush"]?.hearts !== 3; i++) await sleep(200);
    await ctx.close();
  }
  // The guests stay connected (the roster is who's connected).
  const holdA = await openSeat(amina, room.roomId, PHONES[0], "everyday", "current");
  const holdB = await openSeat(baraka, room.roomId, PHONES[0], "everyday", "current");
  for (const h of [holdA, holdB]) await h.p.getByTestId("lobby-dock").waitFor({ timeout: 15000 });

  // ---------- Lobby (Keku's seat): the top (circle, code, Start) and the next-game card ----------
  for (const palette of NAMES) for (const look of LOOKS) for (const v of PHONES) {
    const { ctx, p } = await openSeat(keku, room.roomId, v, look, palette);
    await p.getByTestId("up-next-card").waitFor({ timeout: 15000 });
    for (let i = 0; i < 40 && !/Everyone/.test(await p.getByTestId("lobby-status").innerText()); i++) await sleep(200);
    await settle(p);
    await record(p, `lobby-${v.w}-${look}-${palette}`);
    await p.getByTestId("up-next-card").evaluate((e) => e.scrollIntoView({ block: "center" })); await sleep(300);
    await record(p, `lobbycard-${v.w}-${look}-${palette}`, { top: false });
    await ctx.close();
  }

  // ---------- The match: Keku answers, the others let their turns run out ----------
  const hold = await openSeat(keku, room.roomId, PHONES[0], "everyday", "current");
  let p0 = null;
  for (let i = 0; i < 60; i++) { p0 = await proj(keku.recoveryToken); if ((p0.readiness?.wouldPlay ?? []).length === 3) break; await sleep(250); }
  const start = await call(`/rooms/${room.roomId}/games`, { token: keku.recoveryToken, body: { gameId: "jebena-rush", official: false, roster: p0.readiness?.wouldPlay, attempt: { id: randomUUID(), sessionRevision: p0.session?.revision ?? 0 }, season: p0.contentSeason, settings: { hearts: 3 } } });
  if (start.status !== 201) throw new Error(`start ${start.status} ${JSON.stringify(start.body).slice(0, 200)}`);
  const gid = start.body.gameId;
  const intent = (who, action, payload) => call(`/rooms/${room.roomId}/intents`, { token: who.recoveryToken, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
  for (const who of [keku, amina, baraka]) await intent(who, "briefing-ready", { ready: true });
  const used = new Set(); let lastN = null; let g = null;
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    g = ((await proj(keku.recoveryToken)).myGames ?? []).find((x) => x.id === gid);
    if (g?.status === "finished") break;
    const t = g?.state?.turn;
    if (g?.status !== "playing" || !t || t.n === lastN) { await sleep(150); continue; }
    lastN = t.n;
    if (t.player === keku.playerId) { const a = freshAnswer(g.state.category.id, used); used.add(a.name); await intent(keku, "jebena-answer", { turn: t.n, text: a.typed }); }
  }
  if (g?.status !== "finished") throw new Error("the match did not finish");
  report.standings = g.state.standings.map((r) => ({ name: { [keku.playerId]: "Keku", [amina.playerId]: "Amina", [baraka.playerId]: "Baraka" }[r.id], place: r.place, points: r.points }));

  // ---------- Results (Keku's seat) ----------
  for (const palette of NAMES) for (const look of LOOKS) for (const v of PHONES) {
    const { ctx, p } = await openSeat(keku, room.roomId, v, look, palette);
    await p.getByTestId("jr-podium").waitFor({ timeout: 20000 }); await settle(p);
    const ring = await ringOn(p, "next-play-again");
    await p.evaluate(() => document.activeElement?.blur?.());
    await record(p, `results-${v.w}-${look}-${palette}`, { focusPlayAgain: ring });
    await ctx.close();
  }
  for (const h of [hold, holdA, holdB]) await h.ctx.close();
  report.currentTokens = CURRENT;
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  const bad = report.shots.filter((s) => s.contrastFailures.length);
  const rings = report.shots.flatMap((s) => [s.focusJoin, s.focusPlayAgain].filter(Boolean).map((r) => ({ shot: s.name, ...r })));
  console.log(`captured ${report.shots.length} shots; rendered text below AA on ${bad.length}; focus rings below 3:1: ${rings.filter((r) => r.ratio < 3).length} of ${rings.length} (lowest ${Math.min(...rings.map((r) => r.ratio))}:1)`);
  for (const s of bad) console.log(`  ${s.name}: ${s.contrastFailures.slice(0, 3).join("; ")}`);
} finally {
  await browser.close().catch(() => {});
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
