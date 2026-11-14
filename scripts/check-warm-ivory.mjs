// Stage 11.1 (docs/stage11/stage111.md §6; D-S111-01..05): the Warm Ivory Christmas look, in real browsers.
//   W1 rendered text contrast on every main screen in Warm Ivory (home, solo shelf, library, lobby host and guest,
//      room menu, briefing, a live quiz, locked, results, Memory Book, the TV): normal text >= 4.5:1, large >= 3:1,
//      against the painted background (semi-transparent layers composited); disabled controls reported, exempt.
//   W2 controls and focus >= 3:1: inputs, choices, chips, keys and options stand out from what's behind them (fill,
//      border or edge); the focus ring after Tab; a disabled key looks different from an enabled one.
//   W3 no dark slabs: every large page, card or panel background is light (luminance > 0.5); only game colours,
//      keys and art are exempt.
//   W4 at 320 px: no sideways scroll, every key, chip and choice at least 44 px tall, and no clipped label.
//   W5 reduced motion: with Animations Off, nothing runs on any Warm Ivory screen.
//   W6 switching the look keeps the session: a Memory Book draft survives Christmas -> Everyday -> Christmas from the
//      room menu; a game in progress re-themes from another tab without reloading or losing its place.
//   W7 Memory Book exports: the Christmas PDF has the ivory page and cranberry title, the Everyday PDF neither; the
//      share image's background is the look's ground; a revoked note stays out of a fresh PDF.
//   W8 Everyday unchanged: the same Everyday screens' computed colours (text, background, border, outline, shadow,
//      fill, stroke, opacity), element by element kind, equal those recorded on the base build d4dc408
//      (scripts/lib/everyday-style-baseline.json). Re-record only for an intended Everyday change:
//        MCHEZO_WEB_DIST=<base build>/apps/web/dist node scripts/check-warm-ivory.mjs --record-everyday
//      Stage 12.1 (D-S121-01/02) added and renamed Everyday elements without changing a colour. Those exact element
//      keys are listed in W8_INTENDED. A listed new element passes only if its style already appears on the same
//      screen in the base build. A listed removed element passes only because it was replaced. Anything else still fails.
//      Stage 12.5 added a 17th game: its cards (home, library) and the lobby's Family Questions card are listed by test-id
//      prefix, under the same rule (every element reuses a base style). Cover gradients are compared without React's
//      generated id number, which a new cover shifts.
// Screenshots of both looks (320/390/1280 and the TV) go to MCHEZO_SCREENSHOT_DIR when it's set.
// Starts ITS OWN server. Chromium emulation only: no real phones or TVs. Usage: node scripts/check-warm-ivory.mjs
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const RECORD = process.argv.includes("--record-everyday");
/**
 * Stage 12.1's intended Everyday element changes (no colour changes), by screen kind and exact element key
 * (`<nearest test id>><tag>.<classes>`):
 * - Home's dock is Join and Host, with Play solo as a link;
 * - the casual host's room menu has "Make it a Family Cup".
 */
const W8_INTENDED = {
  home: {
    added: ["home-dock>nav.mz-dock.mz-dock--home.mz-dock--onepath", "home-solo>button.mz-dock__solo.mz-linkbtn", "home-solo>b."],
    removed: ["home-dock>nav.mz-dock.mz-dock--home.mz-dock--three", "home-solo>button.mz-key.mz-key--block.mz-key--lg.mz-key--surface"],
    // Stage 12.5: a 17th game's card in the home shelf (Home never features it, so the featured game is unchanged).
    addedPrefixes: ["game-card-family-questions>"],
  },
  menu: {
    added: ["menu-make-cup>button.mz-menurow", "menu-make-cup>path.", "menu-make-cup>span.mz-menurow__chev", "menu-make-cup>span.mz-menurow__detail", "menu-make-cup>span.mz-menurow__icon", "menu-make-cup>span.mz-menurow__label", "menu-make-cup>svg.",
      // Stage 12.4 (D-S124-02): "End the night" in a casual room's menu, the same row style as every menu row.
      "menu-end-night>button.mz-menurow", "menu-end-night>path.", "menu-end-night>span.mz-menurow__chev", "menu-end-night>span.mz-menurow__detail", "menu-end-night>span.mz-menurow__icon", "menu-end-night>span.mz-menurow__label", "menu-end-night>svg.", "menu-end-night>span."],
    removed: [],
    // Stage 12.5 (D-S125-01): the casual lobby (seen behind the menu) has the Family Questions card.
    addedPrefixes: ["family-card>", "family-write>", "family-play-next>", "family-card-mine>",
      // Stage 12.6 (D-S126-01): "Share the night" once a game has finished, the same row style as every menu row.
      "menu-night-card>",
      // Stage 12.7 (D-S127-01): the host's lobby (behind the menu) offers "Make teams".
      "teams-card>", "teams-make>"],
  },
  // Stage 12.5: a 17th game. Its card on home and in the library, and the lobby's Family Questions card: whole new
  // components, allowed by their test id, and still only when every element reuses a style the base screen had.
  library: { added: [], removed: [], addedPrefixes: ["mz-lib-card-family-questions>", "mz-lib-practice-family-questions>"] },
  lobby: { added: [], removed: [], addedPrefixes: ["family-card>", "family-write>", "family-play-next>", "family-card-mine>",
    // Stage 12.7 (D-S127-01): the host's Teams card ("Make teams"); a guest sees none until there are teams.
    "teams-card>", "teams-make>"] },
  "lobby-guest": { added: [], removed: [], addedPrefixes: ["family-card>", "family-write>", "family-card-mine>"] },
};
/**
 * A cover's gradient is referenced by an id React generates in render order (`url("#mzcov-_r_2_")`). A new game's cover
 * shifts every later id without changing a colour, so W8 compares the reference without its generated number. The
 * gradient's own colours were never part of the signature (its stops aren't laid out), so nothing is lost.
 */
const normSig = (x) => x.replace(/url\("#mzcov-[^"]*"\)/g, 'url("#mzcov")');
const BASELINE = new URL("./lib/everyday-style-baseline.json", import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-ivory-"));
async function startServer() {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR };
  delete env.NODE_ENV;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  for (let i = 0; i < 120 && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) return { child, port: Number(m[1]) };
    await sleep(250);
  }
  child.kill("SIGKILL");
  throw new Error(`server did not start: ${out.slice(-400)}`);
}
const server = await startServer();
const BASE = `http://localhost:${server.port}`;
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "Warm Ivory", kind: "casual" } });
  const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: host.playerId, token: host.recoveryToken }];
  for (const n of names.slice(1)) {
    const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
async function startGame(room, gameId) {
  const seen = await api(`/rooms/${room.roomId}/projection?audience=player`, { token: room.seats[0].token });
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false, roster: seen.readiness?.wouldPlay } });
  return gid;
}
async function finishTrivia(room, gid, except = []) {
  for (const s of room.seats) {
    if (except.includes(s)) continue;
    const g = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((x) => x.id === gid);
    for (const q of g?.state?.questions ?? []) await intent(room, s, gid, "trivia-answer", { questionId: q.id, chosenIndex: 0 }).catch(() => {});
  }
}

const browser = await launchChromium();
/** A page in `look`, Animations Off and reduced motion (so nothing is mid-transition), optionally seated. */
async function pageIn(look, viewport, { seat, room, fixedDay = false, extra } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", acceptDownloads: true });
  // Home's "Featured today" follows the date; a fixed day keeps the Everyday comparison exact.
  if (fixedDay) await ctx.clock.setFixedTime(new Date("2026-12-20T12:00:00"));
  await ctx.addInitScript((l) => {
    try { localStorage.setItem("mz_look", l); localStorage.setItem("cgn_anim", "off"); } catch { /* none */ }
    window.__mark = Math.random();
    window.__sharePixel = null;
    const toUrl = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...a) {
      // Only the 1080×1080 share image; other canvases (jsPDF's, a QR code) are not it.
      try { if (this.width === 1080 && this.height === 1080) window.__sharePixel = [...this.getContext("2d").getImageData(5, 5, 1, 1).data].slice(0, 3); } catch { /* none */ }
      return toUrl.apply(this, a);
    };
  }, look);
  if (extra) await extra(ctx);
  const page = await ctx.newPage();
  if (seat) {
    await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  }
  return page;
}
const settle = async (p) => { await p.waitForLoadState("networkidle").catch(() => {}); await sleep(500); };
async function tvPage(look, room) {
  const tv = await pageIn(look, { width: 1920, height: 1080 });
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.code);
  await tv.getByTestId("watch-spectator").click();
  // During a briefing a spectator sees the briefing (with Stop watching), not the show yet.
  await tv.getByTestId("tv-show").or(tv.getByRole("button", { name: "Stop watching" })).first().waitFor({ timeout: 15000 });
  return tv;
}

/** Everything W1–W5 and W8 read from one screen, measured inside the page. */
function measure() {
  const parse = (s) => {
    if (!s) return null;
    let m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    m = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+))?\)/.exec(s);
    if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : Number(m[4])];
    return null;
  };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
  /** The colour actually painted behind `el` (its own background and every translucent layer under it, composited). */
  const paintedBg = (el, includeSelf = true) => {
    const layers = [];
    for (let cur = includeSelf ? el : el.parentElement; cur; cur = cur.parentElement) {
      const c = parse(getComputedStyle(cur).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    if (!layers.length || layers[layers.length - 1][3] < 1) base = parse(getComputedStyle(document.documentElement).backgroundColor) ?? base;
    return layers.reverse().reduce((acc, l) => over(l, acc), base);
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
  const faded = (el) => { for (let cur = el; cur; cur = cur.parentElement) if (Number(getComputedStyle(cur).opacity) < 0.99) return true; return false; };
  const disabled = (el) => !!el.closest("button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled='true'], [disabled]");
  const label = (el) => (el.getAttribute("data-testid") ?? el.className?.toString?.().split(" ")[0] ?? el.tagName).slice(0, 40);
  // W1: text
  const text = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n; (n = walker.nextNode());) {
    const t = n.textContent.trim();
    const el = n.parentElement;
    if (!t || !el || seen.has(el) || el.closest("svg, .mz-sr, .mz-sr-only, [aria-hidden='true']") || !visible(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = paintedBg(el);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const r = ratio(over(fg, bg), bg);
    text.push({ t: t.slice(0, 40), r: Math.round(r * 100) / 100, need: large ? 3 : 4.5, exempt: disabled(el) || faded(el), where: label(el) });
  }
  // W2: control boundaries
  const controls = [];
  for (const el of document.querySelectorAll("input:not([type=hidden]):not(.mz-code__input), textarea, select, .mz-chip-btn, .mz-pill, .mz-choice, .mz-key:not(.mz-key--ghost), .mz-option")) {
    if (!visible(el) || disabled(el)) continue;
    const cs = getComputedStyle(el);
    const behind = paintedBg(el, false);
    const own = paintedBg(el);
    const cands = [ratio(own, behind)];
    if (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== "none") { const b = parse(cs.borderTopColor); if (b) cands.push(ratio(over(b, behind), behind)); }
    for (const m of cs.boxShadow.matchAll(/(rgba?\([^)]*\)|color\([^)]*\))/g)) { const c = parse(m[1]); if (c && c[3] > 0.5) cands.push(ratio(over(c, behind), behind)); }
    controls.push({ where: label(el), r: Math.round(Math.max(...cands) * 100) / 100 });
  }
  // W3: large light panels (game colours, keys and art exempt)
  const slabs = [];
  const EXEMPT = ".mz-slab, .mz-tv-slab, .mz-key, .mz-hero-card, .mz-mr-card, .mz-intro, .mz-lockcard, .mz-cx-band, .mz-tv-row__fill, .mz-dg-board, .mz-result--correct, .mz-cap-prompt, .mz-sheet-backdrop, .mz-token, .mz-tv-bar__fill, svg, img, canvas, [class*='art'], [class*='cover'], .mz-brief__mode, .mz-badge, .mz-chip, .mz-choice__opt, .mz-director__stage--on, .mz-bubble, .mz-cap-result--winner, .mz-tv-conn, .mz-modebadge, .mz-lib-tag, .mz-solo-results__pb, .mz-rhero__ribbon, .mz-mr-bar, .mz-intro-steps__n";
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || el.closest(EXEMPT)) continue;
    const c = parse(getComputedStyle(el).backgroundColor);
    if (!c || c[3] < 0.9) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 12000) continue;
    const L = lum(c);
    if (L <= 0.5) slabs.push(`${label(el)} L=${L.toFixed(2)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  // W4: overflow, target height, clipped labels
  const overflow = document.scrollingElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll("main")].some((m) => m.scrollWidth > m.clientWidth + 1);
  const small = [], clipped = [];
  for (const el of document.querySelectorAll(".mz-key, .mz-chip-btn, .mz-choice__opt, .mz-iconbtn, .mz-pill")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5) small.push(`${label(el)} ${r.height.toFixed(1)}`);
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") clipped.push(label(el));
  }
  // W5: running animations
  const anims = document.getAnimations().filter((a) => a.playState === "running").length;
  // W8: the computed colours of every element kind on the screen
  const sig = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).sort().join(".") : "";
    const tid = el.closest("[data-testid]")?.getAttribute("data-testid")?.replace(/[0-9a-f-]{8,}|\d+/g, "#") ?? "";
    const style = [cs.color, cs.backgroundColor, cs.backgroundImage.slice(0, 120), `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, `${cs.borderBottomWidth} ${cs.borderBottomColor}`,
      `${cs.outlineStyle} ${cs.outlineColor}`, cs.boxShadow, cs.fill, cs.stroke, cs.opacity].join("|");
    sig.add(`${tid}>${el.tagName.toLowerCase()}.${cls}=>${style}`);
  }
  return { text, controls, slabs, overflow, small, clipped, anims, sig: [...sig].sort(), theme: document.documentElement.dataset.mzTheme, tone: document.documentElement.dataset.mzTone };
}

/** The screens, in one look, at one phone width (plus the TV). Each entry: name, page, and how to get there. */
async function tour(look, width, room, { shots = true } = {}) {
  const height = width === 320 ? 640 : width === 1280 ? 800 : 844;
  const out = [];
  const take = async (name, p, full = true) => {
    await settle(p);
    out.push({ name, m: await p.evaluate(measure) });
    if (shots) await p.screenshot({ path: screenshotPath(`/tmp/wi-${look}-${name}-${width}.png`), fullPage: full });
  };
  const anon = await pageIn(look, { width, height }, { fixedDay: true });
  await anon.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }); await take("home", anon, false);
  await anon.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" }); await take("solo", anon);
  await anon.goto(`${BASE}/library`, { waitUntil: "domcontentloaded" }); await take("library", anon, false);
  /** The room's last game finished, so the room opens on its results; Back to lobby (this page only) shows the lobby. */
  const toLobby = async (p, resultsName) => {
    await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("results-hero").waitFor({ timeout: 15000 });
    if (resultsName) await take(resultsName, p);
    await p.getByRole("button", { name: "Back to lobby" }).click();
    await p.getByTestId("room-menu").waitFor({ timeout: 15000 });
  };
  const host = await pageIn(look, { width, height }, { seat: room.seats[0], room });
  await toLobby(host, "results"); await take("lobby", host);
  await host.getByTestId("room-menu").click(); await host.getByTestId("room-menu-sheet").waitFor(); await take("menu", host, false);
  await host.keyboard.press("Escape");
  const guest = await pageIn(look, { width, height }, { seat: room.seats[1], room });
  await toLobby(guest); await take("lobby-guest", guest);
  await host.goto(`${BASE}/room/memories`, { waitUntil: "domcontentloaded" }); await host.getByTestId("memory-screen").waitFor(); await take("memory", host);
  for (const p of [anon, host, guest]) await p.context().close();
  return out;
}
/** A game's screens: briefing, the question, locked, and results; and the TV at each. */
async function gameTour(look, width, { shots = true, results = true } = {}) {
  const room = await makeRoom(["Keku", "Amina", "Baraka"]);
  const height = width === 320 ? 640 : 844;
  const out = [];
  const take = async (name, p, full = true) => {
    await settle(p);
    out.push({ name, m: await p.evaluate(measure) });
    if (shots) await p.screenshot({ path: screenshotPath(`/tmp/wi-${look}-${name}-${p.viewportSize().width}.png`), fullPage: full });
  };
  const host = await pageIn(look, { width, height }, { seat: room.seats[0], room });
  await host.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  const gid = await startGame(room, "trivia");
  await host.getByText("Read the rules").first().waitFor({ timeout: 15000 }).catch(() => {});
  await take("briefing", host);
  const tv = width === 390 ? await tvPage(look, room) : null;
  if (tv) await take("tv-briefing", tv, false);
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  await host.locator(".mz-slab").first().waitFor({ timeout: 15000 });
  await take("question", host, false);
  if (tv) { await tv.locator(".mz-tv-slab").first().waitFor({ timeout: 15000 }).catch(() => {}); await take("tv-question", tv, false); }
  await host.locator(".mz-slab").first().click();
  await sleep(600); await take("locked", host, false);
  if (results) {
    await finishTrivia(room, gid);
    await host.getByTestId("results-hero").waitFor({ timeout: 20000 });
    await take("results", host);
    if (tv) { await sleep(2500); await take("tv-results", tv, false); }
  }
  await host.context().close(); if (tv) await tv.context().close();
  return { out, room, gid };
}

const everydaySig = {};
const addSig = (screen, m) => { everydaySig[screen] = [...new Set([...(everydaySig[screen] ?? []), ...m.sig])].sort(); };
try {
  // A room with a finished game and two notes (one approved), for the lobby, menu and Memory Book.
  const room = await makeRoom(["Keku", "Amina", "Baraka"]);
  const g0 = await startGame(room, "trivia");
  for (const s of room.seats) await intent(room, s, g0, "briefing-ready", { ready: true });
  await finishTrivia(room, g0);
  const fin = (await api(`/rooms/${room.roomId}/ledger?watermark=1`, { token: room.seats[0].token })).events.find((e) => e.type === "game-finished").eventId;
  const approvedNote = await api(`/rooms/${room.roomId}/memory`, { token: room.seats[1].token, body: { day: 1, text: "Amina's ivory streak", sourceEventIds: [fin] } });
  const pendingNote = await api(`/rooms/${room.roomId}/memory`, { token: room.seats[2].token, body: { day: 1, text: "Baraka's pending note", sourceEventIds: [fin] } });
  const pendingId = pendingNote.id ?? pendingNote.entry?.id;
  const approvedId = approvedNote.id ?? approvedNote.entry?.id;
  await api(`/rooms/${room.roomId}/memory/${approvedId}/approve`, { token: room.seats[0].token, body: {} });

  // ---- W8 (and the "before"/"after" Everyday screenshots): Everyday at 390 and 320.
  for (const w of [390, 320]) {
    // Results are left out: which answers come out right varies by the questions dealt, so its review marks vary.
    for (const s of await tour("everyday", w, room)) if (s.name !== "results") addSig(`${s.name}-${w}`, s.m);
    const { out } = await gameTour("everyday", w, { results: false });
    for (const s of out) addSig(`${s.name}-${w}`, s.m);
  }
  if (RECORD) {
    writeFileSync(BASELINE, JSON.stringify(everydaySig, null, 0).replace(/\],"/g, '],\n"') + "\n");
    console.log(`RECORDED Everyday baseline: ${Object.keys(everydaySig).length} screens, ${Object.values(everydaySig).reduce((n, a) => n + a.length, 0)} element styles -> ${BASELINE.pathname}`);
  } else {
    const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
    const keyOf = (x) => x.slice(0, x.indexOf("=>"));
    const styleOf = (x) => x.slice(x.indexOf("=>") + 2);
    for (const [screen, nowRaw] of Object.entries(everydaySig)) {
      const now = [...new Set(nowRaw.map(normSig))];
      const baseList = [...new Set((base[screen] ?? []).map(normSig))];
      const was = new Set(baseList);
      const baseStyles = new Set(baseList.map(styleOf));
      const kind = screen.replace(/-\d+$/, "");
      const intended = W8_INTENDED[kind] ?? { added: [], removed: [] };
      const addedAll = now.filter((x) => !was.has(x));
      const goneAll = baseList.filter((x) => !now.includes(x));
      // An intended new element must reuse a style this screen already had: a new key, never a new colour.
      const listed = (k) => intended.added.includes(k) || (intended.addedPrefixes ?? []).some((p) => k.startsWith(p));
      const added = addedAll.filter((x) => !(listed(keyOf(x)) && baseStyles.has(styleOf(x))));
      const gone = goneAll.filter((x) => !intended.removed.includes(keyOf(x)));
      const allowed = addedAll.length - added.length + goneAll.length - gone.length;
      // On a failure, every difference (up to 40 each way), so the log alone says what changed.
      if (added.length || gone.length) for (const [sign, xs] of [["+", added], ["-", gone]]) for (const x of xs.slice(0, 40)) console.log(`  W8 ${screen} ${sign} ${x.slice(0, 400)}`);
      check(`W8 Everyday ${screen}: every element kind's computed colours equal the base build's (d4dc408)`, was.size > 0 && added.length === 0 && gone.length === 0,
        was.size === 0 ? "no baseline for this screen" : `${now.length} kinds; new ${added.length}, missing ${gone.length}${allowed ? `; ${allowed} intended element change(s) (Stage 12.1, 12.4, 12.5, 12.6), each reusing a base style` : ""}${added.length ? ` e.g. ${added[0].slice(0, 240)}` : ""}${gone.length ? ` | missing e.g. ${gone[0].slice(0, 240)}` : ""}`);
    }
  }

  // ---- The Christmas look.
  const ivory = [];
  for (const w of [390, 320]) {
    for (const s of await tour("christmas", w, room)) ivory.push({ ...s, w });
    const { out } = await gameTour("christmas", w);
    for (const s of out) ivory.push({ ...s, w });
  }
  const desk = await pageIn("christmas", { width: 1280, height: 800 }, { seat: room.seats[0], room });
  // The room's last game finished, so on a desktop the room opens on its results.
  await desk.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" }); await desk.getByTestId("results-hero").waitFor({ timeout: 15000 }); await settle(desk);
  ivory.push({ name: "results", w: 1280, m: await desk.evaluate(measure) });
  await desk.screenshot({ path: screenshotPath("/tmp/wi-christmas-results-1280.png") });
  await desk.goto(`${BASE}/room/memories`, { waitUntil: "domcontentloaded" }); await settle(desk);
  ivory.push({ name: "memory", w: 1280, m: await desk.evaluate(measure) });
  await desk.screenshot({ path: screenshotPath("/tmp/wi-christmas-memory-1280.png") });
  await desk.context().close();

  if (!RECORD) {
    for (const { name, w, m } of ivory) {
      const where = `${name} at ${w === 390 && name.startsWith("tv-") ? "1920×1080" : `${w} px`}`;
      check(`W0 ${where}: the page is the light Christmas look`, m.theme === "christmas" && m.tone === "light", `${m.theme}/${m.tone}`);
      const low = m.text.filter((t) => !t.exempt && t.r < t.need);
      const exempt = m.text.filter((t) => t.exempt).length;
      check(`W1 ${where}: every text element reads (4.5:1, large 3:1)`, m.text.length > 0 && low.length === 0,
        `${m.text.length} text elements, lowest ${Math.min(...m.text.filter((t) => !t.exempt).map((t) => t.r)).toFixed(2)}:1, ${exempt} disabled or faded (exempt)${low.length ? `; LOW: ${low.slice(0, 4).map((t) => `"${t.t}" (${t.where}) ${t.r}`).join("; ")}` : ""}`);
      const weak = m.controls.filter((c) => c.r < 3);
      check(`W2 ${where}: every control stands out from what's behind it (3:1)`, weak.length === 0,
        `${m.controls.length} controls${m.controls.length ? `, weakest ${Math.min(...m.controls.map((c) => c.r)).toFixed(2)}:1` : ""}${weak.length ? `; WEAK: ${weak.slice(0, 4).map((c) => `${c.where} ${c.r}`).join("; ")}` : ""}`);
      check(`W3 ${where}: no dark page, card or panel`, m.slabs.length === 0, m.slabs.slice(0, 3).join("; "));
      if (w === 320) {
        check(`W4 ${where}: no sideways scroll`, !m.overflow);
        check(`W4 ${where}: keys, chips and choices at least 44 px, none clipped`, m.small.length === 0 && m.clipped.length === 0, [...m.small, ...m.clipped.map((c) => `clipped ${c}`)].slice(0, 4).join("; "));
      }
      check(`W5 ${where}: nothing animates with Animations Off`, m.anims === 0, `${m.anims} running`);
    }

    // W2 focus ring and disabled key, on the Memory Book.
    const mb = await pageIn("christmas", { width: 390, height: 844 }, { seat: room.seats[0], room });
    await mb.goto(`${BASE}/room/memories`, { waitUntil: "domcontentloaded" }); await mb.getByTestId("memory-screen").waitFor(); await settle(mb);
    const rings = [];
    for (let i = 0; i < 4; i++) {
      await mb.keyboard.press("Tab");
      rings.push(await mb.evaluate(() => {
        const el = document.activeElement; const cs = getComputedStyle(el);
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cs.outlineColor);
        let bg = null; for (let cur = el.parentElement; cur && !bg; cur = cur.parentElement) { const b = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(cur).backgroundColor); if (b && (b[4] === undefined || Number(b[4]) > 0.9)) bg = b; }
        bg ??= /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.documentElement).backgroundColor);
        const L = (x) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(+x[1]) + 0.7152 * f(+x[2]) + 0.0722 * f(+x[3]); };
        const r = m && bg ? (Math.max(L(m), L(bg)) + 0.05) / (Math.min(L(m), L(bg)) + 0.05) : 0;
        return { what: el.getAttribute("data-testid") ?? el.tagName, width: parseFloat(cs.outlineWidth), style: cs.outlineStyle, r: Math.round(r * 100) / 100 };
      }));
    }
    check("W2 the focus ring after Tab is visible and stands out (3:1, at least 2 px)", rings.every((r) => r.style !== "none" && r.width >= 2 && r.r >= 3), rings.map((r) => `${r.what} ${r.width}px ${r.r}:1`).join("; "));
    // The same key, Add, disabled with nothing typed and enabled once there's a draft.
    const addBg = () => mb.evaluate(() => { const k = document.querySelector("[data-testid=memory-add]"); return { disabled: k.disabled, bg: getComputedStyle(k).backgroundColor }; });
    const off = await addBg();
    // W6 the look switch keeps a draft.
    const draft = "A draft that survives a change of look";
    await mb.locator(".mz-memory__text").fill(draft);
    const on = await addBg();
    check("W2 a disabled key looks different from the same key enabled (its fill differs)", off.disabled && !on.disabled && off.bg !== on.bg, `disabled ${off.bg}, enabled ${on.bg}`);
    const switchLook = async (p, id) => { await p.getByTestId("room-menu").click(); await p.getByTestId("room-menu-sheet").waitFor(); await p.getByTestId(`look-${id}`).click(); await p.keyboard.press("Escape"); await sleep(300); };
    await switchLook(mb, "everyday");
    const mid = await mb.evaluate(() => [document.documentElement.dataset.mzTheme, document.querySelector(".mz-memory__text").value, window.__mark]);
    await switchLook(mb, "christmas");
    const end = await mb.evaluate(() => [document.documentElement.dataset.mzTheme, document.querySelector(".mz-memory__text").value, window.__mark]);
    check("W6 Memory Book: Christmas -> Everyday -> Christmas from the room menu keeps the unsent draft (no reload)",
      mid[0] === "everyday" && end[0] === "christmas" && mid[1] === draft && end[1] === draft && mid[2] === end[2], JSON.stringify({ mid: mid.slice(0, 2), end: end.slice(0, 2) }));

    // W7 exports: the Christmas PDF and share image, then Everyday's PDF; a revoked note stays out.
    const dl = async (p, id) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.getByTestId(id).click()]); return { name: d.suggestedFilename(), text: readFileSync(await d.path()).toString("latin1") }; };
    // jsPDF writes a fill colour to two decimals and a text colour to three: ivory #F7F1E6 is "0.97 0.95 0.9 rg",
    // cranberry #A3253A "0.639 0.145 0.227 rg".
    const ivoryFill = /\b0\.97 0\.95 0\.9 rg/;
    const cranberry = /\b0\.639 0\.145 0\.227 rg/;
    const pdfX = await dl(mb, "memory-pdf");
    check("W7 Christmas PDF: ivory page, cranberry title, the approved note, not the pending one", ivoryFill.test(pdfX.text) && cranberry.test(pdfX.text) && pdfX.text.includes("Amina's ivory streak") && !pdfX.text.includes("Baraka's pending note"), pdfX.name);
    await mb.evaluate(() => { window.__sharePixel = null; });
    await mb.getByTestId("memory-image").click();
    await mb.waitForFunction(() => window.__sharePixel !== null, null, { timeout: 15000 }).catch(() => {});
    const px = await mb.evaluate(() => window.__sharePixel);
    check("W7 Christmas share image: its background is the ivory ground (247, 241, 230)", JSON.stringify(px) === JSON.stringify([247, 241, 230]), JSON.stringify(px));
    await switchLook(mb, "everyday");
    const pdfE = await dl(mb, "memory-pdf");
    check("W7 Everyday PDF: unchanged (no page fill, no coloured title)", !ivoryFill.test(pdfE.text) && !cranberry.test(pdfE.text) && !/ rg\n/.test(pdfE.text) && pdfE.text.includes("Amina's ivory streak"), pdfE.name);
    await switchLook(mb, "christmas");
    // Approve Baraka's note and revoke Amina's: the next PDF has the one and not the other.
    await api(`/rooms/${room.roomId}/memory/${pendingId}/approve`, { token: room.seats[0].token, body: {} });
    await api(`/rooms/${room.roomId}/memory/${approvedId}/revoke`, { token: room.seats[0].token, body: {} });
    await sleep(1500);
    const pdfR = await dl(mb, "memory-pdf");
    check("W7 after a revoke, a fresh Christmas PDF leaves the revoked note out and keeps the approved one", !pdfR.text.includes("Amina's ivory streak") && pdfR.text.includes("Baraka's pending note") && ivoryFill.test(pdfR.text), pdfR.name);
    await mb.context().close();

    // W6 a game in progress re-themes from another tab without reloading or losing its place.
    const gr = await makeRoom(["Keku", "Amina"]);
    const host = await pageIn("christmas", { width: 390, height: 844 }, { seat: gr.seats[0], room: gr });
    await host.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
    const gg = await startGame(gr, "trivia");
    for (const s of gr.seats) await intent(gr, s, gg, "briefing-ready", { ready: true });
    await host.locator(".mz-slab").first().waitFor({ timeout: 15000 });
    await host.locator(".mz-slab").first().click();
    // The tap locks the answer; once the server confirms it, the locked view offers "Next question". Wait for that
    // button, then for question 2. (This used isVisible({ timeout }), which never waits: Playwright ignores that
    // timeout, so a slower answer reply skipped the click and W6 read the locked view, which has no question counter.)
    const next = host.getByRole("button", { name: "Next question" });
    await next.waitFor({ timeout: 10000 });
    await next.click();
    await host.getByText(/Question 2 of \d+/).first().waitFor({ timeout: 10000 });
    const before = await host.evaluate(() => [document.documentElement.dataset.mzTheme, document.body.innerText.match(/Question \d+ of \d+/)?.[0], window.__mark, location.pathname]);
    const other = await host.context().newPage();
    await other.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await other.getByTestId("home-settings").click();
    await other.getByTestId("look-everyday").click();
    await host.waitForFunction(() => document.documentElement.dataset.mzTheme === "everyday", null, { timeout: 5000 }).catch(() => {});
    const after = await host.evaluate(() => [document.documentElement.dataset.mzTheme, document.body.innerText.match(/Question \d+ of \d+/)?.[0], window.__mark, location.pathname]);
    check("W6 a game in progress: another tab's look change re-themes it, with no reload and the same question",
      before[0] === "christmas" && after[0] === "everyday" && before[1] && after[1] === before[1] && after[2] === before[2] && after[3] === before[3], JSON.stringify({ before: [before[0], before[1]], after: [after[0], after[1]] }));
    await host.context().close();
  }
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).slice(0, 600));
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
}
console.log(failures ? `\n${failures} check(s) FAILED` : RECORD ? "\nRECORD MODE: the baseline was written; no checks were run" : "\nALL WARM IVORY CHECKS PASSED");
process.exit(failures ? 1 : 0);
