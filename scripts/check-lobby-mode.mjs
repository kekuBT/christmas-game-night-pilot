// Stage 3 live QA: S3-HOME-01 (Home's dock covered the game cards) and
// S3-LOB-01 / S3-LOB-02 / S3-HOME-02 (which mode the next game is in, for
// the host and for guests), at 375/390/430/768/1440 and with Safari's
// toolbar shown or hidden (the visible height changes; the app uses 100dvh).
//
// Home: at every scroll position the games scroll above the Join/Host dock,
// never under it; every card's title and "players · minutes" line can be
// read; both actions stay on screen.
// Lobby (host): Start says what it will start and in which mode; the mode
// line is on screen without scrolling; "Change" brings the mode choice into
// view. The default (Official) is unchanged.
// Lobby (guest): shows the host's game and mode (not this tab's own default),
// and follows the host's changes.
// Starts ITS OWN server. Usage: node scripts/check-lobby-mode.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-lobby-mode-"));
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
  const headers = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const VIEWS = [
  { w: 375, h: 667 }, { w: 375, h: 553 }, // iPhone SE, Safari toolbar hidden / shown
  { w: 390, h: 844 }, { w: 390, h: 664 },
  { w: 430, h: 932 }, { w: 430, h: 740 },
  { w: 768, h: 1024 }, { w: 1440, h: 900 },
];

/**
 * Home, at this scroll position: does the dock overlap the scrolling area,
 * is any card's title or facts line hidden by it, and does every card whose
 * picture is showing also show its title and facts in full?
 */
const homeState = (page) => page.evaluate(() => {
  const scroller = document.querySelector('[data-testid="home-scroll"]');
  const dock = document.querySelector('[data-testid="home-dock"]').getBoundingClientRect();
  const area = scroller.getBoundingClientRect();
  const covered = [];
  const unreadable = [];
  for (const card of scroller.querySelectorAll(".mz-gamecard, .mz-hero-card")) {
    const c = card.getBoundingClientRect();
    if (c.right <= 0 || c.left >= innerWidth) continue; // off to the side in a sideways shelf
    const texts = [...card.querySelectorAll(".mz-gamecard__title, .mz-gamecard__meta, .mz-hero-card__title, .mz-hero-card__meta")];
    for (const t of texts) {
      const r = t.getBoundingClientRect();
      const top = Math.max(r.top, area.top), bottom = Math.min(r.bottom, area.bottom); // the part the scroller shows
      if (bottom > top && bottom > dock.top + 1 && top < dock.bottom - 1) covered.push((t.textContent ?? "").trim().slice(0, 24));
    }
    const art = card.querySelector(".mz-gamecard__art, .mz-cover");
    const a = art?.getBoundingClientRect();
    const artShowing = a && a.top < area.bottom - 1 && a.bottom > area.top + 1;
    const cardTopShown = c.top >= area.top - 0.5;
    if (artShowing && cardTopShown) {
      for (const t of texts) {
        const r = t.getBoundingClientRect();
        if (r.top < area.top - 0.5 || r.bottom > area.bottom + 0.5) unreadable.push((t.textContent ?? "").trim().slice(0, 24));
      }
    }
  }
  const btns = ["home-join", "home-host"].map((id) => { const b = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 0.5; });
  return { overlap: Math.max(0, Math.round(area.bottom - dock.top)), covered, unreadable, buttons: btns.every(Boolean), dockH: Math.round(dock.height), scrollMax: scroller.scrollHeight - scroller.clientHeight };
});

const browser = await launchChromium();
try {
  // ---- Home
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("home-scroll").waitFor({ timeout: 15000 });
    await sleep(300);
    let overlap = 0;
    const covered = new Set();
    const unreadable = new Set();
    let buttons = true;
    const first = await homeState(page);
    for (let y = 0; y <= first.scrollMax + 24; y += 24) { // every 24 px: every intermediate position
      await page.getByTestId("home-scroll").evaluate((el, top) => { el.scrollTop = top; }, Math.min(y, first.scrollMax));
      const s = await homeState(page);
      overlap = Math.max(overlap, s.overlap);
      s.covered.forEach((x) => covered.add(x));
      s.unreadable.forEach((x) => unreadable.add(`${x}@${y}`));
      buttons &&= s.buttons;
    }
    check(`Home ${v.w}×${v.h}: the dock never overlaps the games, at any scroll position`, overlap === 0 && covered.size === 0, `overlap ${overlap}px; ${[...covered].join(", ")}`);
    check(`Home ${v.w}×${v.h}: any card whose picture shows also shows its title and players · minutes in full`, unreadable.size === 0, [...unreadable].slice(0, 6).join(", "));
    check(`Home ${v.w}×${v.h}: Join and Host stay on screen`, buttons, `dock ${first.dockH}px`);
    // Every card's details can be scrolled into the readable area.
    const reachable = await page.evaluate(() => {
      const scroller = document.querySelector('[data-testid="home-scroll"]');
      scroller.scrollTop = scroller.scrollHeight;
      const area = scroller.getBoundingClientRect();
      const last = [...scroller.querySelectorAll(".mz-gamecard__meta")].map((e) => e.getBoundingClientRect()).reduce((a, r) => Math.max(a, r.bottom), 0);
      return last <= area.bottom + 0.5;
    });
    check(`Home ${v.w}×${v.h}: the lowest card's details scroll fully into view above the dock`, reachable);
    if ([375, 390, 1440].includes(v.w) && (v.h === 667 || v.h === 844 || v.h === 900)) {
      await page.getByTestId("home-scroll").evaluate((el) => { el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * 0.4); });
      await sleep(150);
      await page.screenshot({ path: screenshotPath(`docs/stage3-qa/home01-${v.w}-midscroll.png`) });
    }
    await ctx.close();
  }

  // ---- Lobby: host and guest
  const room = await api("/rooms", { body: { name: "Mode check" } });
  const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: "Keku", asHost: true, hostClaimToken: room.hostClaimToken } });
  const guest = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: "Amina" } });
  const seatPage = async (seat, v) => {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
    await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    return page;
  };
  const hostSeat = { playerId: host.playerId, token: host.recoveryToken };
  const guestSeat = { playerId: guest.playerId, token: guest.recoveryToken };
  let guestOnline;
  // Before any host screen has opened: the guest is told the host is choosing (no invented game).
  {
    const g = await seatPage(guestSeat, { w: 390, h: 844 });
    await sleep(800);
    const note = await g.getByTestId("dock-guest-note").innerText();
    check("guest, before the host chooses: told the host is choosing, no made-up game", /choosing a game/.test(note) && (await g.getByTestId("up-next-card").count()) === 0, note);
    guestOnline = g; // stays connected, so the host has a second player and can Start
  }
  const inView = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.height > 0; }, sel);
  for (const v of VIEWS) {
    const h = await seatPage(hostSeat, v);
    // Both seats are connected (the guest's page stays open); wait for this page's view of that.
    let start = "";
    for (let i = 0; i < 25 && !start.startsWith("Start "); i++) { start = (await h.getByTestId("lobby-dock").locator(".mz-key").first().innerText()).trim(); if (!start.startsWith("Start ")) await sleep(200); }
    check(`host ${v.w}×${v.h}: Start names the game and the mode (default Official, unchanged)`, /^Start .+ · Official$/.test(start), start);
    check(`host ${v.w}×${v.h}: the mode line is on screen without scrolling`, await inView(h, '[data-testid="dock-mode"]'));
    check(`host ${v.w}×${v.h}: the up-next card shows the mode`, /Official · counts toward/.test(await h.getByTestId("up-next-mode").innerText()));
    await h.getByTestId("dock-mode-change").click();
    await sleep(700);
    check(`host ${v.w}×${v.h}: Change brings the Official/Practice choice into view`, await inView(h, '[data-testid="mode-choice"]'));
    if ([375, 390, 1440].includes(v.w) && [667, 844, 900].includes(v.h)) {
      await h.evaluate(() => document.querySelector('[data-testid="lobby-scroll"]')?.scrollTo(0, 0));
      await sleep(150);
      await h.screenshot({ path: screenshotPath(`docs/stage3-qa/lob01-host-${v.w}.png`) });
    }
    await h.context().close();
  }
  // The guest sees the host's plan, and follows it.
  {
    const h = await seatPage(hostSeat, { w: 390, h: 844 });
    const g = guestOnline;
    const guestSees = async (want) => {
      for (let i = 0; i < 30; i++) {
        const t = await g.evaluate(() => ({ name: document.querySelector(".mz-upnext__name")?.textContent ?? "", mode: document.querySelector('[data-testid="up-next-mode"]')?.textContent ?? "", note: document.querySelector('[data-testid="dock-guest-note"]')?.textContent ?? "" }));
        if (want(t)) return t;
        await sleep(200);
      }
      return g.evaluate(() => ({ name: document.querySelector(".mz-upnext__name")?.textContent ?? "", mode: document.querySelector('[data-testid="up-next-mode"]')?.textContent ?? "", note: document.querySelector('[data-testid="dock-guest-note"]')?.textContent ?? "" }));
    };
    let t = await guestSees((x) => x.name === "Trivia Showdown" && /Official/.test(x.mode));
    check("guest: sees the host's game and that it's Official", t.name === "Trivia Showdown" && /Official · counts toward/.test(t.mode) && /Official, counts toward/.test(t.note), JSON.stringify(t));
    await h.getByTestId("mode-practice").click();
    t = await guestSees((x) => /Practice/.test(x.mode));
    check("guest: sees Practice within seconds of the host switching", /Practice · no Cup points/.test(t.mode) && /Practice, no Cup points/.test(t.note), JSON.stringify(t));
    await h.getByTestId("choose-game").click();
    await h.getByTestId("select-game-math-mayhem").click();
    t = await guestSees((x) => x.name === "Math Mayhem");
    check("guest: sees the host's new pick (not this tab's own default)", t.name === "Math Mayhem" && /Practice/.test(t.mode), JSON.stringify(t));
    await g.screenshot({ path: screenshotPath("docs/stage3-qa/lob02-guest-390.png") });
    // A reload keeps the plan on both sides.
    await h.reload({ waitUntil: "domcontentloaded" });
    await h.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    await sleep(1500);
    const hs = (await h.getByTestId("lobby-dock").locator(".mz-key").first().innerText()).trim();
    check("host reload: still Math Mayhem · Practice", hs === "Start Math Mayhem · Practice", hs);
    t = await guestSees((x) => x.name === "Math Mayhem");
    check("guest after the host's reload: unchanged", t.name === "Math Mayhem" && /Practice/.test(t.mode), JSON.stringify(t));
    // Starting still works as before, in the mode shown.
    await h.getByTestId("start-practice-math-mayhem").click();
    const p = await api(`/rooms/${room.roomId}/projection?audience=player`, { token: host.recoveryToken });
    const started = p.games.at(-1);
    check("Start starts the shown game in the shown mode", started?.gameId === "math-mayhem" && started?.official === false, JSON.stringify({ gameId: started?.gameId, official: started?.official }));
    await h.context().close(); await g.context().close();
  }
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
}
console.log(failures === 0 ? "ALL LOBBY/HOME CHECKS PASSED" : `${failures} LOBBY/HOME CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
