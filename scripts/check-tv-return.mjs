// D-TV-01 (handoff 7044277833): a phone player who opens a TV view gets back to their phone view with an ordinary
// tap. Before, in Trivia's TV stage the director bar (drawn for a spot inside the 1920×1080 picture) was positioned
// against the page: on a phone it floated over the picture and spilled the page sideways to about 788 px, the phone
// browser zoomed the page out, and a tap on "Back to phone view" landed on the picture (.mz-tv-outer) instead: a
// touch-only player was stuck on the TV view. On the TV show the way back was drawn inside the scaled picture, about
// 34×9 px on a phone.
//
// Every activation here is ordinary: Playwright's own tap() (touch) or click() (mouse), which scroll the control into
// view and refuse to act when something else would take the event. No force, no synthetic dispatch, no devtools.
// The keyboard path is checked separately and never stands in for the tap. Phones are emulated (isMobile, touch) at
// 320×568, 375×667 and 390×844, in the Everyday and the Christmas look; real devices are a separate check.
//
// V. The TV show (a room's TV view before any game): the way back is in the first screen, at least 44×44, the page has
//    no sideways overflow and is not zoomed out, no control overlaps the picture or another control; an ordinary tap
//    after scrolling returns to the lobby
// B. The briefing TV (a player on the TV view when the host starts): an ordinary tap on Back to phone view returns to
//    the briefing (its I'm ready button)
// T. Trivia while playing, the TV stage from the question screen: the same layout checks; after scrolling, an
//    ordinary TAP returns, and separately an ordinary CLICK returns; the same room, seat, game and question come back
//    and the server recorded nothing (no answer, no reveal, no host action)
// K. Keyboard, separately: Tab reaches Back to phone view, and Enter returns
// S. Stay and auto-advance across the TV stage: S1 a player who chose Stay taps back: still the stayed status, no
//    countdown, still locked past the reading time; S2 a player who did not: the countdown runs and the next question
//    opens by itself
// R. Trivia at its results, the TV stage from the results screen: the same layout checks, and a tap returns to the
//    results
// M. Another TV show route: Math Mayhem live on the TV show, for a player who was on the TV view when it started: the
//    same checks, and a tap returns to the game
// D. Desktop and TV sizes (1280×800, 1920×1080, mouse): the TV show keeps its full-screen picture with its director
//    inside it; Trivia's TV stage keeps the picture at full size (never shrunk for the controls), its controls never
//    overlap the picture, and a click returns
// Usage: node scripts/check-tv-return.mjs   (starts its own server; MCHEZO_WEB_DIST passes through)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotDir } from "./lib/driver-env.mjs";
import { roomGo } from "./lib/room-nav.mjs";

const SHOTS = screenshotDir("test-results/screenshots/tv-return");
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; return ok; }
async function soon(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* retry */ } await sleep(120); }
  return null;
}
const PHONES = [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }];
const LOOKS = ["everyday", "christmas"];
/** Long enough for an ordinary tap to scroll and act; a tap the picture takes instead fails within it. */
const TAP_TIMEOUT = 4000;
const READ_MAX = 6500;
const MIN_TARGET = 44;

async function startServer() {
  const dataDir = mkdtempSync(join(tmpdir(), "tv-return-"));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: dataDir, MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
  delete env.NODE_ENV; delete env.MCHEZO_LIFECYCLE_SCALE;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 120 && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) return { child, dataDir, base: `http://localhost:${m[1]}` };
    await sleep(250);
  }
  child.kill("SIGKILL");
  throw new Error(`server did not start: ${out.slice(-400)}`);
}
async function stopServer(s) {
  if (!s) return;
  s.child.kill("SIGTERM");
  for (let i = 0; i < 20 && s.child.exitCode === null && s.child.signalCode === null; i++) await sleep(250);
  if (s.child.exitCode === null && s.child.signalCode === null) s.child.kill("SIGKILL");
  rmSync(s.dataDir, { recursive: true, force: true });
}
async function api(base, path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(base, names) {
  const room = await api(base, "/rooms", { body: { name: "TV return", kind: "casual" } });
  const host = await api(base, `/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: host.playerId, token: host.recoveryToken }];
  for (const n of names.slice(1)) {
    const j = await api(base, "/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { base, roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) => api(room.base, `/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
async function startGame(room, gameId) {
  const seen = await api(room.base, `/rooms/${room.roomId}/projection?audience=player`, { token: room.seats[0].token });
  const { gameId: gid } = await api(room.base, `/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false, roster: seen.readiness?.wouldPlay, attempt: { id: `tvr-${gameId}-${Date.now()}`, sessionRevision: seen.session?.revision } } });
  return gid;
}
/** What the server holds for the room and each seat: what a misfired tap (an answer, a reveal, a host action) would change. */
async function serverState(room) {
  const pub = await api(room.base, `/rooms/${room.roomId}/projection?audience=tv`);
  const seats = [];
  for (const s of room.seats) {
    const p = await api(room.base, `/rooms/${room.roomId}/projection?audience=player`, { token: s.token });
    const g = (p.myGames ?? []).at(-1);
    const answers = g?.state?.myAnswers ?? g?.myAnswers ?? {};
    seats.push({ game: g?.id, answered: Object.values(answers).filter((v) => v !== undefined && v !== null).length });
  }
  return JSON.stringify({ games: (pub.games ?? []).map((g) => [g.id, g.gameId, g.status]), host: (pub.players ?? []).find((p) => p.isHost)?.id, seats });
}

async function seatTab(browser, room, seat, viewport, look, { mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  await ctx.addInitScript((l) => { try { localStorage.setItem("mz_look", l); } catch { /* none */ } }, look);
  const page = await ctx.newPage();
  await page.goto(`${room.base}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); sessionStorage.setItem("cgn_name", s.name); }, { ...seat, roomId: room.roomId });
  await page.goto(`${room.base}/room`, { waitUntil: "domcontentloaded" });
  return { ctx, page, viewport, look, tag: `${look} ${viewport.width}×${viewport.height}`, file: `${look}-${viewport.width}x${viewport.height}` };
}
const mainLabel = (page) => page.evaluate(() => document.querySelector("main.mz-screen")?.getAttribute("aria-label") ?? "");
const seatIds = (page) => page.evaluate(() => [sessionStorage.getItem("cgn_roomId"), sessionStorage.getItem("cgn_playerId")].join("/"));
const onTvStage = async (page) => (await page.getByRole("region", { name: "Mchezo big screen" }).count()) > 0;

/**
 * How the way back looks on the first screen, before any scrolling: its size, whether it is on screen and nothing
 * covers it, whether the page spills sideways or is zoomed out, and whether any control outside the picture overlaps
 * the picture's box or another control (the picture's own in-frame buttons are drawn at TV size by design).
 */
const firstView = (loc) => loc.evaluate((el) => {
  window.scrollTo(0, 0);
  const de = document.documentElement;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const box = (q) => ({ x: q.left, y: q.top + scrollY, r: q.right, b: q.bottom + scrollY });
  const outerEl = document.querySelector(".mz-tv-outer");
  const pic = outerEl ? box(outerEl.getBoundingClientRect()) : null;
  const cross = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
  const ctl = [...document.querySelectorAll("button")].filter((b) => !b.closest(".mz-tv") && b.getClientRects().length > 0)
    .map((b) => ({ name: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 24), ...box(b.getBoundingClientRect()) }));
  const overPicture = pic ? ctl.filter((c) => cross(c, pic) > 1).map((c) => c.name) : [];
  const overlapping = [];
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) if (cross(ctl[i], ctl[j]) > 1) overlapping.push(`${ctl[i].name} / ${ctl[j].name}`);
  return {
    w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight,
    onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= de.clientWidth,
    uncovered: !!hit && (hit === el || el.contains(hit)),
    sideways: de.scrollWidth - de.clientWidth, layoutWidth: innerWidth, width: de.clientWidth, zoom: +(window.visualViewport?.scale ?? 1).toFixed(3),
    overPicture, overlapping, theme: de.dataset.mzTheme ?? "", insidePicture: !!el.closest(".mz-tv"),
    picture: pic ? { w: Math.round(pic.r - pic.x), h: Math.round(pic.b - pic.y) } : null,
  };
});
/** The layout checks every phone TV route shares. */
function phoneLayout(prefix, L, look) {
  check(`${prefix}: the page is in the ${look} look`, L.theme === look, L.theme);
  check(`${prefix}: the way back is on the first screen, not covered (visible without scrolling)`, L.onScreen && L.uncovered, JSON.stringify({ top: L.top, bottom: L.bottom, vh: L.vh, uncovered: L.uncovered }));
  check(`${prefix}: the way back is a usable touch target (at least ${MIN_TARGET}×${MIN_TARGET})`, L.w >= MIN_TARGET && L.h >= MIN_TARGET, `${L.w}×${L.h}`);
  check(`${prefix}: the page has no sideways overflow and is not zoomed out`, L.sideways <= 0 && L.layoutWidth === L.width && L.zoom === 1, JSON.stringify({ sideways: L.sideways, layoutWidth: L.layoutWidth, width: L.width, zoom: L.zoom }));
  check(`${prefix}: no control overlaps the picture or another control`, L.overPicture.length === 0 && L.overlapping.length === 0, JSON.stringify({ overPicture: L.overPicture, overlapping: L.overlapping.slice(0, 4) }));
}
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
/** Playwright's own tap or click: it scrolls the control into view and refuses when something else would take it. */
async function ordinary(loc, how) {
  const t0 = Date.now();
  const err = await (how === "tap" ? loc.tap({ timeout: TAP_TIMEOUT }) : loc.click({ timeout: TAP_TIMEOUT })).then(() => null, (e) => String(e?.message ?? e));
  const lines = (err ?? "").split("\n").map((l) => l.replace(ANSI, "").trim());
  return { ok: !err, ms: Date.now() - t0, why: err ? (lines.find((l) => /intercepts pointer events/.test(l)) ?? lines[0]).slice(0, 140) : "" };
}
/** After a failed ordinary activation, leave the TV view by keyboard so later checks can run (never counted as a pass). */
async function recover(page, loc) { await loc.focus().catch(() => {}); await page.keyboard.press("Enter").catch(() => {}); await sleep(600); }
/** A normal scroll (the mouse wheel) to the end of the page before the tap, as a person might have scrolled. */
async function scrollDown(page) { await page.mouse.wheel(0, 1600).catch(() => {}); await sleep(250); }

const browser = await launchChromium();
let s = null;
const opened = [];
try {
  s = await startServer();
  const room = await makeRoom(s.base, ["Ada", "Bea"]);
  const [ada, bea] = room.seats;
  // Bea stays connected throughout (the all-ready start needs her) and plays S2.
  const B = await seatTab(browser, room, bea, { width: 390, height: 844 }, "everyday"); opened.push(B);
  await B.page.getByTestId("room-menu").waitFor({ timeout: 20000 });
  // Ada, the host, on six phones: three sizes in each look. Each tab is its own phone (its own session storage).
  const tabs = [];
  for (const look of LOOKS) for (const vp of PHONES) { const t = await seatTab(browser, room, ada, vp, look); tabs.push(t); opened.push(t); }
  for (const t of tabs) await t.page.getByTestId("room-menu").waitFor({ timeout: 20000 });

  // ======================= V. The TV show (before any game) =======================
  for (const t of tabs) {
    const p = t.page, pre = `V ${t.tag} TV show`;
    await roomGo(p, "tv");
    await p.getByTestId("tv-show").waitFor({ timeout: 10000 });
    await sleep(400);
    const back = p.getByTestId("tv-back");
    phoneLayout(pre, await firstView(back), t.look);
    if (t.viewport.width === 320) await p.screenshot({ path: join(SHOTS, `${t.file}-tvshow.png`) });
    await scrollDown(p);
    const a = await ordinary(back, "tap");
    const ok = a.ok && !!(await soon(async () => (await p.getByTestId("room-menu").count()) > 0 && (await p.getByTestId("tv-show").count()) === 0, 5000));
    check(`${pre}: after scrolling, an ordinary tap on the way back returns to the lobby`, ok, a.why);
    if (!ok) await recover(p, back);
    // Back to the TV view, to be there when the host starts (B).
    await roomGo(p, "tv");
    await p.getByTestId("tv-show").waitFor({ timeout: 10000 });
  }

  // ======================= B. The briefing TV =======================
  const gid = await startGame(room, "trivia");
  for (const t of tabs) {
    const p = t.page, pre = `B ${t.tag} briefing TV`;
    const shown = !!(await soon(async () => (await p.getByTestId("tv-briefing").count()) > 0, 10000));
    check(`${pre}: a player on the TV view sees the briefing on it`, shown);
    if (!shown) continue;
    await sleep(300);
    const back = p.getByTestId("tv-briefing").getByRole("button", { name: "Back to phone view" });
    const L = await firstView(back);
    check(`${pre}: the way back is on the first screen and at least ${MIN_TARGET}×${MIN_TARGET}`, L.onScreen && L.uncovered && L.w >= MIN_TARGET && L.h >= MIN_TARGET, JSON.stringify({ w: L.w, h: L.h, top: L.top }));
    await scrollDown(p);
    const a = await ordinary(back, "tap");
    const ok = a.ok && !!(await soon(async () => (await p.getByTestId("briefing-ready").count()) > 0 && (await p.getByTestId("tv-briefing").count()) === 0, 5000));
    check(`${pre}: after scrolling, an ordinary tap on Back to phone view returns to the briefing (its I'm ready button)`, ok, a.why);
    if (!ok) await recover(p, back);
  }
  for (const seat of room.seats) await intent(room, seat, gid, "briefing-ready", { ready: true });

  // ======================= T. Trivia while playing =======================
  for (const t of tabs) {
    const p = t.page, pre = `T ${t.tag} Trivia TV stage`;
    const playing = !!(await soon(async () => (await p.locator(".mz-slab:not([disabled])").count()) > 0, 20000));
    check(`${pre}: the question screen is up`, playing);
    if (!playing) continue;
    const label0 = await mainLabel(p), ids0 = await seatIds(p), srv0 = await serverState(room);
    for (const how of ["tap", "click"]) {
      await p.getByTestId("mz-tv-stage").first().tap({ timeout: 10000 });
      await p.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 10000 });
      await sleep(400);
      const back = p.getByRole("button", { name: "Back to phone view" });
      if (how === "tap") {
        phoneLayout(pre, await firstView(back), t.look);
        await p.screenshot({ path: join(SHOTS, `${t.file}-trivia-playing.png`) });
      }
      await scrollDown(p);
      const a = await ordinary(back, how);
      const ok = a.ok && !!(await soon(async () => !(await onTvStage(p)) && (await mainLabel(p)) === label0, 5000));
      check(`${pre}: after scrolling, an ordinary ${how === "tap" ? "TAP (touch)" : "CLICK (mouse)"} on Back to phone view returns to the question`, ok, a.ok ? `${a.ms} ms` : a.why);
      if (!ok) await recover(p, back);
    }
    check(`${pre}: the same room, seat, game and question came back`, (await seatIds(p)) === ids0 && (await mainLabel(p)) === label0 && (await p.locator(".mz-slab:not([disabled])").count()) > 0, label0);
    const srv1 = await serverState(room);
    check(`${pre}: returning fired nothing on the server (no answer, no reveal, no host action)`, srv1 === srv0, srv1 === srv0 ? "" : `${srv0} -> ${srv1}`);
  }

  // ======================= K. Keyboard, separately =======================
  {
    const p = tabs[0].page, pre = `K ${tabs[0].tag} keyboard`;
    await p.getByTestId("mz-tv-stage").first().tap({ timeout: 10000 });
    await p.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 10000 });
    await p.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
    let reached = false;
    for (let i = 0; i < 20 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.textContent?.trim() === "Back to phone view"); }
    check(`${pre}: Tab reaches Back to phone view`, reached);
    if (reached) await p.keyboard.press("Enter"); else await recover(p, p.getByRole("button", { name: "Back to phone view" }));
    check(`${pre}: Enter on it returns to the question`, reached && !!(await soon(async () => !(await onTvStage(p)) && (await p.locator(".mz-slab:not([disabled])").count()) > 0, 5000)));
  }

  // ======================= S. Stay and auto-advance across the TV stage =======================
  // Coming back remounts the phone's game screen, which opens the player's next unanswered question (their progress);
  // the choice is then seen on the next answer.
  const QUESTION = /^Question (\d+) of \d+$/;
  const backOnPhone = async (page) => !(await onTvStage(page)) && (await page.locator(".mz-slab:not([disabled])").count()) > 0;
  {
    // S1: Ada (Everyday 320×568) answers, chooses Stay, opens the TV stage, taps back and answers the next question.
    const p = tabs[0].page, pre = `S1 ${tabs[0].tag}`;
    await p.locator(".mz-slab:not([disabled])").first().tap({ timeout: 10000 });
    await p.getByTestId("mz-locked").waitFor({ timeout: 10000 });
    await p.getByRole("button", { name: "Stay on this screen" }).tap({ timeout: 5000 });
    check(`${pre}: Stay chosen (the stayed status shows, no countdown)`, !!(await soon(async () => (await p.getByTestId("mz-advance-paused").count()) === 1 && (await p.getByTestId("mz-advance").count()) === 0, 4000)));
    await p.getByRole("button", { name: "TV stage" }).first().tap({ timeout: 10000 });
    await p.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 10000 });
    await sleep(300);
    const back = p.getByRole("button", { name: "Back to phone view" });
    await scrollDown(p);
    const a = await ordinary(back, "tap");
    const ok = a.ok && !!(await soon(() => backOnPhone(p), 5000));
    check(`${pre}: an ordinary tap on Back to phone view returns to the game (the next unanswered question)`, ok, a.ok ? await mainLabel(p) : a.why);
    if (!ok) { await recover(p, back); await soon(() => backOnPhone(p), 5000); }
    await p.locator(".mz-slab:not([disabled])").first().tap({ timeout: 10000 });
    await p.getByTestId("mz-locked").waitFor({ timeout: 10000 });
    const locked0 = await mainLabel(p);
    check(`${pre}: the next answer shows the stayed status and no countdown (Stay still holds after the TV stage)`, (await p.getByTestId("mz-advance-paused").count()) === 1 && (await p.getByTestId("mz-advance").count()) === 0);
    await sleep(READ_MAX + 500);
    check(`${pre}: still locked past the reading time (no automatic advance)`, (await mainLabel(p)) === locked0 && (await p.getByTestId("mz-locked").count()) === 1, await mainLabel(p));

    // S2: Bea (390×844) did not choose Stay: she answers, opens the TV stage during the countdown and taps back; her
    // next answer counts down and moves on by itself, as before.
    const g = B.page, pre2 = "S2 everyday 390×844, no Stay";
    await g.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
    await g.locator(".mz-slab:not([disabled])").first().tap({ timeout: 10000 });
    await g.getByTestId("mz-advance").waitFor({ timeout: 10000 });
    await g.getByRole("button", { name: "TV stage" }).first().tap({ timeout: 10000 });
    await g.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 10000 });
    const gb = g.getByRole("button", { name: "Back to phone view" });
    const a2 = await ordinary(gb, "tap");
    const back2 = a2.ok && !!(await soon(() => backOnPhone(g), 5000));
    check(`${pre2}: an ordinary tap on Back to phone view returns to the game`, back2, a2.why);
    if (!back2) { await recover(g, gb); await soon(() => backOnPhone(g), 5000); }
    const q0 = await mainLabel(g);
    await g.locator(".mz-slab:not([disabled])").first().tap({ timeout: 10000 });
    check(`${pre2}: the next answer counts down (no Stay was chosen)`, !!(await soon(async () => (await g.getByTestId("mz-advance").count()) === 1, 5000)));
    const t0 = Date.now();
    const next = await soon(async () => { const l = await mainLabel(g); return QUESTION.test(l) && l !== q0 ? l : null; }, READ_MAX + 2500);
    check(`${pre2}: the next question opens by itself after the reading time (normal auto-advance)`, !!next && Date.now() - t0 >= 2000, `${q0} -> ${next ?? "(none)"} in ${Date.now() - t0} ms`);
  }

  // ======================= R. Trivia at its results =======================
  for (const seat of room.seats) {
    const p = await api(room.base, `/rooms/${room.roomId}/projection?audience=player`, { token: seat.token });
    for (const q of (p.myGames ?? []).find((x) => x.id === gid)?.state?.questions ?? []) await intent(room, seat, gid, "trivia-answer", { questionId: q.id, chosenIndex: 0 }).catch(() => {});
  }
  check("R the Trivia game finished (both seats answered every question)", !!(await soon(async () => (await api(room.base, `/rooms/${room.roomId}/projection?audience=tv`)).games.find((x) => x.id === gid)?.status === "finished", 15000)));
  for (const t of tabs) {
    const p = t.page, pre = `R ${t.tag} Trivia results TV stage`;
    const results = !!(await soon(async () => (await p.getByText(/Your game total:/).count()) > 0 && (await p.getByTestId("mz-tv-stage").count()) > 0, 15000));
    check(`${pre}: the results screen is up`, results);
    if (!results) continue;
    await p.getByTestId("mz-tv-stage").first().tap({ timeout: 10000 });
    await p.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 10000 });
    await sleep(400);
    const back = p.getByRole("button", { name: "Back to phone view" });
    phoneLayout(pre, await firstView(back), t.look);
    if (t.viewport.width !== 375) await p.screenshot({ path: join(SHOTS, `${t.file}-trivia-results.png`) });
    await scrollDown(p);
    const a = await ordinary(back, "tap");
    const ok = a.ok && !!(await soon(async () => !(await onTvStage(p)) && (await p.getByText(/Your game total:/).count()) > 0, 5000));
    check(`${pre}: after scrolling, an ordinary tap on Back to phone view returns to the results`, ok, a.why);
    if (!ok) await recover(p, back);
  }

  // ======================= D. Desktop and TV sizes (mouse) =======================
  for (const [vp, look] of [[{ width: 1280, height: 800 }, "christmas"], [{ width: 1920, height: 1080 }, "everyday"]]) {
    const t = await seatTab(browser, room, ada, vp, look, { mobile: false }); opened.push(t);
    const p = t.page, pre = `D ${t.tag} Trivia TV stage`;
    await p.getByTestId("mz-tv-stage").first().click({ timeout: 20000 });
    await p.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 10000 });
    await sleep(400);
    const back = p.getByRole("button", { name: "Back to phone view" });
    const L = await firstView(back);
    const pic = await p.locator(".mz-tv").evaluate((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    const full = { w: Math.round(Math.min(vp.width, vp.height * 16 / 9)), h: Math.round(Math.min(vp.height, vp.width * 9 / 16)) };
    check(`${pre}: the picture keeps its full size (never shrunk for the controls)`, Math.abs(pic.w - full.w) <= 16 && Math.abs(pic.h - full.h) <= 9, `${pic.w}×${pic.h}, full ${full.w}×${full.h}`);
    check(`${pre}: no control overlaps the picture or another control; no sideways scrolling`, L.overPicture.length === 0 && L.overlapping.length === 0 && L.sideways <= 0, JSON.stringify({ overPicture: L.overPicture, overlapping: L.overlapping.slice(0, 3), sideways: L.sideways }));
    if (vp.width === 1280) {
      check(`${pre}: on a screen taller than 16:9 the way back is in the band under the picture, on the first screen`, L.onScreen && L.uncovered, JSON.stringify({ top: L.top, bottom: L.bottom }));
      await p.screenshot({ path: join(SHOTS, `${t.file}-trivia-results.png`) });
    }
    const a = await ordinary(back, "click");
    const ok = a.ok && !!(await soon(async () => !(await onTvStage(p)) && (await p.getByText(/Your game total:/).count()) > 0, 5000));
    check(`${pre}: an ordinary click on Back to phone view returns to the results`, ok, a.why);
    await t.ctx.close();
  }
  // ======================= M. Math Mayhem live on the TV show =======================
  for (const t of tabs) {
    // From the results screen to the TV view, where the next game's start finds the player.
    await t.page.getByTestId("mz-tv-stage").first().tap({ timeout: 10000 }).catch(() => {});
  }
  const mid = await startGame(room, "math-mayhem");
  await sleep(500);
  for (const seat of room.seats) await intent(room, seat, mid, "briefing-ready", { ready: true });
  for (const t of tabs) {
    const p = t.page, pre = `M ${t.tag} Math Mayhem live on the TV show`;
    const live = !!(await soon(async () => (await p.locator('[data-testid="tv-show"][data-game="math-mayhem"]').count()) > 0, 15000));
    check(`${pre}: a player on the TV view sees the game live on it`, live);
    if (!live) continue;
    await sleep(300);
    const back = p.getByTestId("tv-back");
    phoneLayout(pre, await firstView(back), t.look);
    if (t.viewport.width === 320) await p.screenshot({ path: join(SHOTS, `${t.file}-tvshow-math.png`) });
    await scrollDown(p);
    const a = await ordinary(back, "tap");
    const ok = a.ok && !!(await soon(async () => (await p.getByTestId("tv-show").count()) === 0 && (await p.locator("h1.mz-question").count()) > 0, 8000));
    check(`${pre}: after scrolling, an ordinary tap on the way back returns to the game`, ok, a.why);
    if (!ok) await recover(p, back);
  }
  // D (TV): the room's TV (a spectator screen) at TV size, with Math Mayhem live: the full-screen picture with its
  // director (and Stop watching) inside it, as before.
  for (const vp of [{ width: 1920, height: 1080 }, { width: 1280, height: 800 }]) {
    const ctx = await browser.newContext({ viewport: vp }); opened.push({ ctx });
    const p = await ctx.newPage();
    await p.goto(`${room.base}/tv?code=${room.code}`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("tv-show").waitFor({ timeout: 20000 });
    await sleep(400);
    const L = await firstView(p.getByTestId("tv-back"));
    check(`D TV ${vp.width}×${vp.height} TV show: the picture fills the screen and its director (with Stop watching) stays inside it`, L.insidePicture && L.picture?.h === vp.height && (await p.getByTestId("tv-controls").count()) === 0 && L.sideways <= 0, JSON.stringify({ inside: L.insidePicture, picture: L.picture }));
    if (vp.width === 1920) await p.screenshot({ path: join(SHOTS, "tv-1920x1080-tvshow.png") });
    await ctx.close();
  }

} catch (e) {
  check("the driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  for (const o of opened) await o.ctx.close().catch(() => {});
  await browser.close().catch(() => {});
  await stopServer(s);
}
console.log(failures === 0 ? "TV RETURN ALL PASSED" : `TV RETURN FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
