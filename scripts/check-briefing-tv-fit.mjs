// D-BF-01 (handoff 7046501193): the TV briefing's cards fit a phone's width. Before, the briefing grid asked for a
// 320 px minimum track (`minmax(320px, 1fr)`) inside a grid about 290 px wide on a 320 px phone, so the rules card's
// right edge sat at about 335 px and was clipped (the page reported no sideways scroll because nothing scrolled: the
// content was cut off).
//
// The briefing TV is what an invited player sees on the TV view when the host starts, and what a spectator sees.
// Each case is measured in the Everyday and the Christmas look, on a 320×568 phone (emulated, touch) and a 1280×800
// desktop:
//   K. Know Your Rivals with the night's teams (a long-rules game built for teams), six players with long names (one
//      a single 32-character word) and the longest team name allowed (one 20-character word): the invited player's view and the spectator's view
//   S. Spectrum (the longest rules), two players: the invited player's view and the spectator's view
// Every card (the top bar, "You're playing in this game", How to play, Ready, Played as teams) lies inside the
// briefing's content box and the viewport, and nothing inside a card spills out of it. On the desktop the cards stay
// side by side as before. The way back works with an ordinary tap (Back to my phone to get ready, Stop watching),
// the spectator's view has no player or host controls, and the server's briefing and start are unchanged (everyone
// ready starts play).
// Usage: node scripts/check-briefing-tv-fit.mjs   (starts its own server; MCHEZO_WEB_DIST passes through)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotDir } from "./lib/driver-env.mjs";
import { roomGo } from "./lib/room-nav.mjs";

const SHOTS = screenshotDir("test-results/screenshots/briefing-tv-fit");
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; return ok; }
async function soon(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* retry */ } await sleep(120); }
  return null;
}
const PHONE = { width: 320, height: 568 }, DESK = { width: 1280, height: 800 };
const LOOKS = ["everyday", "christmas"];
const LONG = ["Wolfeschlegelsteinhausenbergerdo", "Mariafernanda Delossantos-Ruiz", "Bartholomew Featherstonehaugh", "Ada", "Bea", "Cy"];
const LONG_TEAM = "Midnightsnowballteam"; // the longest team name allowed (20 characters), as one word

async function startServer() {
  const dataDir = mkdtempSync(join(tmpdir(), "briefing-tv-fit-"));
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
  const room = await api(base, "/rooms", { body: { name: "Briefing fit", kind: "casual" } });
  const host = await api(base, `/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: host.playerId, token: host.recoveryToken }];
  for (const n of names.slice(1)) {
    const j = await api(base, "/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { base, roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) => api(room.base, `/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
const pub = async (room, gid) => (await api(room.base, `/rooms/${room.roomId}/projection?audience=tv`)).games.find((g) => g.id === gid);

async function context(browser, viewport, look) {
  const mobile = viewport.width < 800;
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  await ctx.addInitScript((l) => { try { localStorage.setItem("mz_look", l); } catch { /* none */ } }, look);
  return ctx;
}
/** A seat's tab, on the TV view (where the host's start finds it). */
async function playerTab(browser, room, seat, viewport, look) {
  const ctx = await context(browser, viewport, look);
  const page = await ctx.newPage();
  await page.goto(`${room.base}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); sessionStorage.setItem("cgn_name", s.name); }, { ...seat, roomId: room.roomId });
  await page.goto(`${room.base}/room`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("room-menu").waitFor({ timeout: 20000 });
  await roomGo(page, "tv");
  await page.getByTestId("tv-show").waitFor({ timeout: 10000 });
  return { ctx, page, viewport, look, who: "player", tag: `${look} ${viewport.width}×${viewport.height} invited player` };
}
/** A spectator's TV (the room's TV link). */
async function spectatorTab(browser, room, viewport, look) {
  const ctx = await context(browser, viewport, look);
  const page = await ctx.newPage();
  await page.goto(`${room.base}/tv?code=${room.code}`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("tv-show").waitFor({ timeout: 20000 });
  return { ctx, page, viewport, look, who: "spectator", tag: `${look} ${viewport.width}×${viewport.height} spectator` };
}

/**
 * Every card of the TV briefing, measured: its box against the briefing's content box and the viewport, and any
 * descendant that reaches past the card's own edges (text cut off by the card or the page).
 */
const measure = (page) => page.evaluate(() => {
  const main = document.querySelector('[data-testid="tv-briefing"]');
  if (!main) return null;
  const de = document.documentElement, vw = de.clientWidth;
  const cs = getComputedStyle(main), mr = main.getBoundingClientRect();
  const left = mr.left + parseFloat(cs.paddingLeft), right = mr.right - parseFloat(cs.paddingRight);
  const name = (el) => el.getAttribute("data-testid") ?? (el.classList.contains("mz-brief__rules") ? "rules" : el.classList.contains("mz-topbar") ? "topbar" : el.querySelector("[data-testid=briefing-people]") ? "ready" : [...el.classList].join("."));
  const grid = main.querySelector(".mz-brief__tvgrid");
  const cards = [...main.querySelectorAll(":scope > .mz-topbar, :scope > [data-testid=briefing-tv-here], :scope > .mz-noticecard, .mz-brief__tvgrid > *")];
  const out = cards.map((el) => {
    const r = el.getBoundingClientRect();
    const spill = [...el.querySelectorAll("*")].filter((d) => { const q = d.getBoundingClientRect(); return q.width > 0 && q.height > 0 && (q.right > r.right + 0.5 || q.left < r.left - 0.5); })
      .slice(0, 3).map((d) => `${d.tagName.toLowerCase()}.${[...d.classList].join(".")} r=${Math.round(d.getBoundingClientRect().right)}`);
    return { card: name(el), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), width: Math.round(r.width),
      inside: r.left >= left - 0.5 && r.right <= right + 0.5 && r.right <= vw + 0.5 && r.left >= -0.5, scrolls: el.scrollWidth > el.clientWidth + 1, spill };
  });
  const gr = grid?.getBoundingClientRect();
  return { vw, content: { left: Math.round(left), right: Math.round(right) }, grid: gr ? { width: Math.round(gr.width), columns: getComputedStyle(grid).gridTemplateColumns } : null,
    sideways: de.scrollWidth - de.clientWidth, theme: de.dataset.mzTheme ?? "", cards: out,
    buttons: [...main.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim()) };
});

function fitChecks(pre, M, look, cardsWanted) {
  check(`${pre}: the briefing is in the ${look} look`, M.theme === look, M.theme);
  const names = M.cards.map((c) => c.card);
  check(`${pre}: the expected cards are on screen (${cardsWanted.join(", ")})`, cardsWanted.every((n) => names.includes(n)), names.join(", "));
  for (const c of M.cards) {
    check(`${pre}: card "${c.card}" lies inside the briefing's content box and the screen`, c.inside, JSON.stringify({ left: c.left, right: c.right, content: M.content, vw: M.vw }));
    check(`${pre}: nothing in card "${c.card}" spills past its edges`, !c.scrolls && c.spill.length === 0, c.spill.join(" | "));
  }
  check(`${pre}: the page has no sideways overflow`, M.sideways <= 0, String(M.sideways));
}
/** The desktop briefing keeps its cards side by side, each at least 320 px wide (the layout before this change). */
function desktopChecks(pre, M) {
  const grid = M.cards.filter((c) => !["topbar", "briefing-tv-here"].includes(c.card));
  const tops = new Set(grid.map((c) => c.top));
  check(`${pre}: the desktop layout is kept: the grid's cards side by side in one row, each at least 320 px wide`, grid.length >= 2 && tops.size === 1 && grid.every((c) => c.width >= 320), JSON.stringify(grid.map((c) => [c.card, c.width, c.top])));
}

const browser = await launchChromium();
let s = null;
const opened = [];
try {
  s = await startServer();

  // ======================= K. Know Your Rivals with teams, long names =======================
  {
    const room = await makeRoom(s.base, LONG);
    const host = room.seats[0], invited = room.seats[0]; // the 32-character single-word name, plus "(you)"
    await api(room.base, `/rooms/${room.roomId}/teams`, { token: host.token, body: { action: "make", count: 2 } });
    const teams0 = (await api(room.base, `/rooms/${room.roomId}/projection?audience=tv`)).teams;
    await api(room.base, `/rooms/${room.roomId}/teams`, { token: host.token, body: { action: "rename", teamId: teams0.list[0].id, name: LONG_TEAM } });
    const tabs = [];
    for (const look of LOOKS) for (const vp of [PHONE, DESK]) {
      const p = await playerTab(browser, room, invited, vp, look); opened.push(p); tabs.push(p);
      const t = await spectatorTab(browser, room, vp, look); opened.push(t); tabs.push(t);
    }
    const gid = (await api(room.base, `/rooms/${room.roomId}/games`, { token: host.token, body: { gameId: "know-your-rivals", official: false } })).gameId;
    check("K the server holds Know Your Rivals in its briefing", (await pub(room, gid))?.status === "briefing");
    for (const t of tabs) {
      const p = t.page, pre = `K ${t.tag}`;
      const shown = !!(await soon(async () => (await p.getByTestId("tv-briefing").count()) > 0 && (await p.getByTestId("briefing-teams").count()) > 0, 15000));
      check(`${pre}: the briefing TV shows the rules, who is ready and the teams`, shown);
      if (!shown) continue;
      await sleep(300);
      const M = await measure(p);
      const wanted = t.who === "player" ? ["topbar", "briefing-tv-here", "rules", "ready", "briefing-teams"] : ["topbar", "rules", "ready", "briefing-teams"];
      fitChecks(pre, M, t.look, wanted);
      const text = await p.getByTestId("tv-briefing").innerText();
      check(`${pre}: the long names and the long team name are shown in full`, [LONG[0], LONG[1], LONG[2], LONG_TEAM].every((n) => text.includes(n)));
      if (t.viewport.width >= 800) desktopChecks(pre, M);
      if (t.who === "spectator") check(`${pre}: the spectator's briefing is read-only (its only control is Stop watching)`, M.buttons.length === 1 && M.buttons[0] === "Stop watching", JSON.stringify(M.buttons));
      const file = `kyr-${t.who}-${t.look}-${t.viewport.width}x${t.viewport.height}`;
      await p.screenshot({ path: join(SHOTS, `${file}.png`) });
      // The briefing scrolls inside the page, so each later card is shown as the phone shows it once scrolled to.
      if (t.viewport.width < 800) {
        for (const [card, sel] of [["rules", ".mz-brief__rules"], ["ready", ".mz-brief__tvgrid > section:has([data-testid=briefing-people])"], ["teams", '[data-testid="briefing-teams"]']]) {
          const el = p.locator(`[data-testid="tv-briefing"] ${sel}`).first();
          await el.evaluate((n) => n.scrollIntoView({ block: "start" })).catch(() => {});
          await sleep(150);
          await p.screenshot({ path: join(SHOTS, `${file}-${card}.png`) });
        }
        await p.evaluate(() => document.querySelector('[data-testid="tv-briefing"]')?.scrollIntoView({ block: "start" }));
      }
    }
    // The way back, with an ordinary tap (phone) or click (desktop).
    for (const t of tabs) {
      const p = t.page, pre = `K ${t.tag}`, touch = t.viewport.width < 800;
      const back = t.who === "player" ? p.getByTestId("briefing-tv-back") : p.getByTestId("tv-briefing").getByRole("button", { name: "Stop watching" });
      const err = await (touch ? back.tap({ timeout: 4000 }) : back.click({ timeout: 4000 })).then(() => null, (e) => String(e?.message ?? e).split("\n")[0]);
      const ok = !err && !!(await soon(async () => (await p.getByTestId("tv-briefing").count()) === 0 && (t.who === "spectator" || (await p.getByTestId("briefing").count()) > 0), 6000));
      check(`${pre}: an ordinary ${touch ? "tap" : "click"} on ${t.who === "player" ? "Back to my phone to get ready" : "Stop watching"} leaves the briefing TV`, ok, err ?? "");
      await t.ctx.close();
    }
  }

  // ======================= S. Spectrum (the longest rules), two players =======================
  {
    const room = await makeRoom(s.base, ["Ada", "Mariafernanda Delossantos-Ruiz"]);
    const keep = await playerTab(browser, room, room.seats[1], PHONE, "everyday"); opened.push(keep); // the other player stays connected
    const tabs = [];
    for (const look of LOOKS) {
      const p = await playerTab(browser, room, room.seats[0], PHONE, look); opened.push(p); tabs.push(p);
      const t = await spectatorTab(browser, room, PHONE, look); opened.push(t); tabs.push(t);
    }
    const desk = await spectatorTab(browser, room, DESK, "everyday"); opened.push(desk); tabs.push(desk);
    const seen = await api(room.base, `/rooms/${room.roomId}/projection?audience=player`, { token: room.seats[0].token });
    const gid = (await api(room.base, `/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "spectrum", official: false, roster: seen.readiness?.wouldPlay, attempt: { id: `fit-spectrum-${Date.now()}`, sessionRevision: seen.session?.revision } } })).gameId;
    for (const t of tabs) {
      const p = t.page, pre = `S ${t.tag}`;
      const shown = !!(await soon(async () => (await p.getByTestId("tv-briefing").count()) > 0, 15000));
      check(`${pre}: the Spectrum briefing is on the TV`, shown);
      if (!shown) continue;
      await sleep(300);
      const M = await measure(p);
      fitChecks(pre, M, t.look, t.who === "player" ? ["topbar", "briefing-tv-here", "rules", "ready"] : ["topbar", "rules", "ready"]);
      if (t.viewport.width >= 800) desktopChecks(pre, M);
      if (t.viewport.width < 800) await p.screenshot({ path: join(SHOTS, `spectrum-${t.who}-${t.look}-${t.viewport.width}x${t.viewport.height}.png`) });
    }
    // The server's briefing and start are unchanged: everyone ready starts play, and the TV leaves the briefing.
    for (const seat of room.seats) await intent(room, seat, gid, "briefing-ready", { ready: true });
    check("S everyone ready starts play on the server", !!(await soon(async () => (await pub(room, gid))?.status === "playing", 10000)));
    check("S the spectator's TV leaves the briefing when play starts", !!(await soon(async () => (await tabs[1].page.getByTestId("tv-briefing").count()) === 0, 10000)));
  }
} catch (e) {
  check("the driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  for (const o of opened) await o.ctx.close().catch(() => {});
  await browser.close().catch(() => {});
  await stopServer(s);
}
console.log(failures === 0 ? "BRIEFING TV FIT ALL PASSED" : `BRIEFING TV FIT FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
