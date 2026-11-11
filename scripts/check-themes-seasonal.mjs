// Stage 8.2: the Everyday and Christmas looks, and seasonal content kept apart,
// end to end through the normal entry points (docs/stage8/stage82.md §5).
// Chromium emulation only: no WebKit, no real phones.
//
//   A  solo, the gate's server: the shelf is Everyday at first (content and
//      look); choosing Christmas turns the look Christmas (Match the game),
//      survives a reload, and Word Connections deals Christmas boards first,
//      labelled; back to Everyday on the start screen, never a Christmas board.
//      No request ever carries a device's look.
//   B  solo, ITS OWN server, restarted on the same data: the content choice and
//      the room's history survive (the next Christmas round is the other
//      Christmas board).
//   C  a casual room, two phones with different looks and a TV: a guest's
//      look never changes the room's content; the host's content change
//      reaches every phone and the TV; a Start whose reply is lost is sent
//      again as the same press and starts one game; the briefing names the
//      content and the board is a Christmas one; Play again keeps it; back
//      to Everyday deals a year-round board; a guest's reload keeps both.
//   D  the looks at 320×640, 390×844, 844×390, 1440×900 and a 1920×1080 TV,
//      in both looks: no sideways overflow, 44 px choices, readable contrast,
//      reduced motion honoured.
//   E  one device, two tabs (feedback 6795825877): tab A's Start is in flight
//      when tab B changes the remembered choice; A's round keeps the content
//      it was pressed with, and its look; A's Play again repeats the finished
//      round's content, not the changed choice; B's own Start uses B's choice.
//   F  this device can't save (repair R82-01, review 6799134510): localStorage
//      writes throw (nothing stored yet, and an older choice stored), and every
//      localStorage access throws. Choosing Christmas content on the shelf and
//      the Christmas look in Settings stays chosen (the page says it lasts
//      until reload), the content survives shelf → Word Connections, the
//      Start reaches the server as Christmas, and the theme stays consistent.
//   Also (C, feedback 6795825877): a guest still on a Christmas game's results
//   keeps that game's look while the host sets the NEXT game to Everyday; the
//   labels say "This game" and "Next game", not colours alone.
// Board identity is read from the words on screen and checked against the
// shipped packs (their season tags): never assumed.
// Usage: node scripts/check-themes-seasonal.mjs <baseUrl>   (the gate passes its server)
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { contrastFailures } from "./lib/contrast.mjs";

const GATE_BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
/** Entry animations finished (a control measured mid-animation reads a fraction short of its size). */
async function settled(page) {
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming?.().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 2000)),
  ]));
}
/** No sideways overflow, every content choice at least 44 px, readable contrast (WCAG AA), on the screen as it is now. */
async function layoutOk(page, where) {
  await settled(page);
  const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [...document.querySelectorAll(".mz-content-choice .mz-choice__opt")].map((b) => b.getBoundingClientRect().height).filter((h) => h < 44) }));
  const bad = await contrastFailures(page);
  check(`${where}: no sideways overflow, choices at least 44 px, readable contrast`, m.over <= 1 && m.small.length === 0 && bad.length === 0, JSON.stringify({ ...m, contrast: bad.slice(0, 3) }));
}
const EVERYDAY_GROUND = "#16111d", CHRISTMAS_GROUND = "#0e1a16";
const look = (p) => p.evaluate(() => ({ theme: document.documentElement.dataset.mzTheme ?? null, meta: (document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "").toLowerCase(), root: document.querySelector(".mz-root")?.getAttribute("data-mz-theme") ?? null }));
const isLook = async (p, id) => { const l = await look(p); return l.theme === id && l.meta === (id === "christmas" ? CHRISTMAS_GROUND : EVERYDAY_GROUND) && (l.root === null || l.root === id); };
/** The room as this seated phone's server sees it (its own session token; the same request the app makes). */
const roomProjection = (p) => p.evaluate(async () => {
  const roomId = sessionStorage.getItem("cgn_roomId"), token = sessionStorage.getItem("cgn_token");
  const r = await fetch(`/rooms/${roomId}/projection?audience=player`, { headers: token ? { "x-session-token": token } : {} });
  return r.json();
});
const pressed = async (p, testId) => (await p.getByTestId(testId).getAttribute("aria-pressed")) === "true";

// ---- The shipped Word Connections boards, by their words, with their season tags ----
const packs = join(process.cwd(), "content", "packs");
const boards = readdirSync(packs).filter((f) => f.endsWith(".json")).flatMap((f) => {
  const p = JSON.parse(readFileSync(join(packs, f), "utf8"));
  return p.gameId === "word-connections" ? p.items.filter((it) => it.review.status !== "rejected") : [];
});
const keyOf = (words) => words.map((w) => String(w).trim().toLowerCase()).sort().join("|");
const boardByKey = new Map(boards.map((b) => [keyOf(b.groups.flatMap((g) => g.words)), b]));
const CHRISTMAS_BOARDS = boards.filter((b) => b.season === "christmas").map((b) => b.id);
async function shownBoard(page) {
  await page.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="mz-cx-tile"]').length === 16, null, { timeout: 10000 });
  const words = (await page.getByTestId("mz-cx-tile").allInnerTexts()).map((w) => w.trim());
  return boardByKey.get(keyOf(words)) ?? null;
}
check(`setup: the shipped library has ${CHRISTMAS_BOARDS.length} Christmas Connections boards (con-legacy-1, con-s4-03) among ${boards.length}`, CHRISTMAS_BOARDS.length === 2 && CHRISTMAS_BOARDS.includes("con-legacy-1") && CHRISTMAS_BOARDS.includes("con-s4-03"));

/** Every request body this context sends, to show that no device look ever leaves the device. */
function watchBodies(ctx) {
  const bodies = [];
  ctx.on("request", (r) => { const b = r.postData(); if (b) bodies.push(b); });
  return bodies;
}
const carriesLook = (bodies) => bodies.some((b) => /"look"|mz_look/.test(b));

const browser = await launchChromium();
let own = null;
try {
  // ---- A. Solo, the gate's server ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const bodies = watchBodies(ctx);
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/solo`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
    check("A a new device: the shelf's content is Everyday", await pressed(p, "solo-content-everyday"));
    check("A a new device: the Everyday look (page, Mchezo screens, browser toolbar)", await isLook(p, "everyday"), JSON.stringify(await look(p)));
    await p.getByTestId("solo-content-christmas").click();
    await soon("A Christmas chosen: the look follows it (Match the game), the toolbar colour too", () => isLook(p, "christmas"));
    check("A the note says what Christmas changes, honestly (Word Connections only)", /Word Connections/.test(await p.getByTestId("solo-content-note").innerText()) && /don.t change/.test(await p.getByTestId("solo-content-note").innerText()));
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
    check("A after a reload: still Christmas, and the Christmas look", (await pressed(p, "solo-content-christmas")) && (await isLook(p, "christmas")));
    await p.getByTestId("solo-start-word-connections").click();
    const b1 = await shownBoard(p);
    check("A Christmas, first round: a Christmas board (unused Christmas first)", !!b1 && CHRISTMAS_BOARDS.includes(b1.id), b1?.id ?? "unknown board");
    check("A the round says it deals Christmas content", /Christmas content/.test(await p.getByTestId("solo-round-content").innerText()));
    await p.goto(`${GATE_BASE}/solo/word-connections`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-ready").waitFor({ timeout: 15000 });
    check("A the round's start screen shows the content chosen (Christmas)", await pressed(p, "solo-content-christmas"));
    await p.getByTestId("solo-round-start").click();
    const b2 = await shownBoard(p);
    check("A Christmas, second round: the other Christmas board", !!b2 && CHRISTMAS_BOARDS.includes(b2.id) && b2.id !== b1?.id, `${b1?.id} then ${b2?.id}`);
    const everyday = [];
    for (let i = 0; i < 3; i++) {
      await p.goto(`${GATE_BASE}/solo/word-connections`, { waitUntil: "domcontentloaded" });
      await p.getByTestId("solo-ready").waitFor({ timeout: 15000 });
      if (i === 0) {
        await p.getByTestId("solo-content-everyday").click();
        await soon("A back to Everyday on the start screen: the Everyday look", () => isLook(p, "everyday"));
      }
      await p.getByTestId("solo-round-start").click();
      const b = await shownBoard(p);
      everyday.push(b?.id ?? null);
    }
    check("A Everyday, three rounds: year-round boards only, never a Christmas one", everyday.every((id) => id !== null && !CHRISTMAS_BOARDS.includes(id)), JSON.stringify(everyday));
    check("A no request from this device ever carried its look", !carriesLook(bodies), `${bodies.length} request bodies`);
    check("A every solo Start carried the content chosen", bodies.filter((b) => /"gameId":"word-connections"/.test(b)).map((b) => JSON.parse(b).season).join(",") === "christmas,christmas,everyday,everyday,everyday");
    await ctx.close();
  }

  // ---- B. Solo across a server restart (its own server, the same data) ----
  {
    const dataDir = mkdtempSync(join(tmpdir(), "mz-s82-restart-"));
    const start = async (port) => {
      const env = { ...process.env, PORT: String(port), MCHEZO_DATA_DIR: dataDir };
      delete env.NODE_ENV; delete env.MCHEZO_CONTENT_DIR;
      const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      child.stdout.on("data", (d) => { out += d.toString(); });
      child.stderr.on("data", (d) => { out += d.toString(); });
      let got = null;
      for (let i = 0; i < 160 && got === null && child.exitCode === null; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) got = Number(m[1]); else await sleep(250); }
      if (!got) throw new Error(`own server did not start: ${out.slice(-400)}`);
      return { child, port: got, base: `http://localhost:${got}`, dataDir };
    };
    const stop = async (s) => { if (!s || s.child.exitCode !== null) return; s.child.kill("SIGTERM"); for (let i = 0; i < 40 && s.child.exitCode === null; i++) await sleep(100); if (s.child.exitCode === null) s.child.kill("SIGKILL"); };
    own = await start(0);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${own.base}/solo/word-connections`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-ready").waitFor({ timeout: 15000 });
    await p.getByTestId("solo-content-christmas").click();
    await p.getByTestId("solo-round-start").click();
    const first = await shownBoard(p);
    check("B before the restart: a Christmas board", !!first && CHRISTMAS_BOARDS.includes(first.id), first?.id);
    const port = own.port;
    await stop(own);
    own = await start(port);
    await p.goto(`${own.base}/solo/word-connections`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-ready").waitFor({ timeout: 15000 });
    check("B after the restart and a reload: still Christmas, in the Christmas look", (await pressed(p, "solo-content-christmas")) && (await isLook(p, "christmas")));
    await p.getByTestId("solo-round-start").click();
    const second = await shownBoard(p);
    check("B after the restart: the other Christmas board (the room's history and content survived)", !!second && CHRISTMAS_BOARDS.includes(second.id) && second.id !== first?.id, `${first?.id} then ${second?.id}`);
    await ctx.close();
    await stop(own); own = null;
    rmSync(dataDir, { recursive: true, force: true });
  }

  // ---- C. A casual room: two phones with different looks, and a TV ----
  {
    const hctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const gctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
    const tctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const hBodies = watchBodies(hctx), gBodies = watchBodies(gctx);
    const h = await hctx.newPage(), g = await gctx.newPage(), tv = await tctx.newPage();
    await h.goto(`${GATE_BASE}/`, { waitUntil: "domcontentloaded" });
    await h.getByTestId("home-host").click();
    await h.getByPlaceholder("e.g. Auntie June").fill("Ada");
    await h.getByRole("button", { name: "Host a game" }).click();
    const chip = h.getByRole("button", { name: /^Share room code / });
    await chip.waitFor({ timeout: 15000 });
    let code = "";
    for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
    await g.goto(`${GATE_BASE}/join`, { waitUntil: "domcontentloaded" });
    await g.getByPlaceholder("e.g. Auntie June").fill("Bea");
    await g.locator(".mz-code__input").fill(code);
    await g.getByRole("button", { name: "Join the game" }).click();
    await g.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });
    await h.getByTestId("choose-game").click();
    await h.getByTestId("select-game-word-connections").click();
    await soon("C the room is Everyday at first: the up-next card says so on both phones", async () => /Everyday content/.test(await h.getByTestId("up-next-content").innerText()) && /Everyday content/.test(await g.getByTestId("up-next-content").innerText()));
    check("C only the host has the content choice; the guest sees it, can't change it", (await h.getByTestId("lobby-content").count()) === 1 && (await g.getByTestId("lobby-content").count()) === 0);
    // The guest pins the Christmas look on their phone (room menu → This phone → Look).
    await g.getByTestId("room-menu").click();
    await g.getByTestId("look-christmas").click();
    await g.keyboard.press("Escape");
    await soon("C the guest's phone takes the Christmas look", () => isLook(g, "christmas"));
    await sleep(1500);
    check("C …the host's phone stays Everyday, and the room's content is still Everyday", (await isLook(h, "everyday")) && /Everyday content/.test(await h.getByTestId("up-next-content").innerText()) && /Everyday content/.test(await g.getByTestId("up-next-content").innerText()));
    // The TV (a spectator screen, seat-free).
    await tv.goto(`${GATE_BASE}/join`, { waitUntil: "domcontentloaded" });
    await tv.locator(".mz-code__input").fill(code);
    await tv.getByTestId("watch-spectator").click();
    await tv.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
    await soon("C the TV says Everyday content, in the Everyday look", async () => /Everyday content/.test(await tv.getByTestId("tv-content").innerText()) && (await isLook(tv, "everyday")));
    // The host chooses Christmas.
    await h.getByTestId("lobby-content-christmas").click();
    await soon("C the host's Christmas reaches the guest's phone and dock", async () => /Christmas content/.test(await g.getByTestId("up-next-content").innerText()) && /Christmas content/.test(await g.getByTestId("dock-guest-content").innerText()));
    await soon("C …and the TV, which takes the Christmas look (Match the game)", async () => /Christmas content/.test(await tv.getByTestId("tv-content").innerText()) && (await isLook(tv, "christmas")));
    check("C the host's phone takes the Christmas look (Match the game)", await isLook(h, "christmas"));
    await layoutOk(h, "C 390×844 host lobby, Christmas look");
    await layoutOk(g, "C 320×640 guest lobby, Christmas look (pinned)");
    await layoutOk(tv, "C 1280×720 TV, Christmas look");
    // The guest switches their look back to Everyday: the room's content stays Christmas.
    await g.getByTestId("room-menu").click();
    await g.getByTestId("look-everyday").click();
    await g.keyboard.press("Escape");
    await soon("C the guest pins Everyday: their phone changes", () => isLook(g, "everyday"));
    await sleep(1500);
    check("C …and nothing else does: the room still deals Christmas on every screen", /Christmas content/.test(await h.getByTestId("up-next-content").innerText()) && /Christmas content/.test(await g.getByTestId("up-next-content").innerText()) && /Christmas content/.test(await tv.getByTestId("tv-content").innerText()));
    check("C no request from either phone ever carried a look", !carriesLook(hBodies) && !carriesLook(gBodies));
    // The guest returns to Match the game (the default): the room's Christmas content shows.
    await g.getByTestId("room-menu").click();
    await g.getByTestId("look-auto").click();
    await g.keyboard.press("Escape");
    await soon("C the guest back on Match the game: the room's Christmas look", () => isLook(g, "christmas"));
    // The host's Start: its first reply is lost after the server acted; the app asks again as the same press.
    const starts = [];
    let dropped = false;
    await h.route("**/rooms/*/games", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      starts.push(JSON.parse(route.request().postData() ?? "{}"));
      if (!dropped) { dropped = true; await route.fetch(); return route.abort("connectionreset"); }
      return route.continue();
    });
    const startBtn = h.locator('[data-testid="lobby-dock"] button.mz-key--block').first();
    await startBtn.click();
    await h.getByTestId("briefing").waitFor({ timeout: 25000 });
    await g.getByTestId("briefing").waitFor({ timeout: 20000 });
    await h.unroute("**/rooms/*/games");
    check("C the lost reply: the same press sent again (same id, same content), and it carried Christmas", starts.length === 2 && starts[0].attempt?.id === starts[1].attempt?.id && starts.every((s) => s.season === "christmas"), JSON.stringify(starts.map((s) => [s.attempt?.id, s.season])));
    await layoutOk(h, "C 390×844 host briefing, Christmas look");
    await layoutOk(g, "C 320×640 guest briefing, Christmas look");
    check("C both briefings name the content this game was frozen with, as this game's", /This game: Christmas content/.test(await h.getByTestId("briefing-content").innerText()) && /This game: Christmas content/.test(await g.getByTestId("briefing-content").innerText()));
    await passBriefing([h, g]);
    const cb1 = await shownBoard(g);
    check("C the game deals a Christmas board", !!cb1 && CHRISTMAS_BOARDS.includes(cb1.id), cb1?.id);
    const proj = await roomProjection(h);
    check("C exactly one game started from the two sends, bound to Christmas", proj.games.length === 1 && proj.games[0].season === "christmas", JSON.stringify(proj.games.map((x) => [x.id, x.status, x.season])));
    // Both sit the game out: results, What's next, Play again.
    for (const p of [h, g]) await p.getByRole("button", { name: "Sit this game out" }).click();
    await soon("C results: What's next says the next game deals Christmas content", async () => /Next game: Christmas content/.test(await h.getByTestId("whats-next-content").innerText()), 25000);
    await layoutOk(h, "C 390×844 host results with What's next, Christmas look");
    await h.getByTestId("next-play-again").click();
    await h.getByTestId("briefing").waitFor({ timeout: 20000 });
    await g.getByTestId("briefing").waitFor({ timeout: 20000 });
    check("C Play again keeps the content: its briefing says Christmas", /Christmas content/.test(await g.getByTestId("briefing-content").innerText()));
    await passBriefing([h, g]);
    const cb2 = await shownBoard(g);
    check("C Play again deals the other Christmas board", !!cb2 && CHRISTMAS_BOARDS.includes(cb2.id) && cb2.id !== cb1?.id, `${cb1?.id} then ${cb2?.id}`);
    for (const p of [h, g]) await p.getByRole("button", { name: "Sit this game out" }).click();
    await h.getByTestId("whats-next").waitFor({ timeout: 25000 });
    // The host goes back to the lobby and sets the NEXT game to Everyday; the guest keeps the results open.
    await h.getByRole("button", { name: /Back to (the )?lobby/ }).first().click();
    await h.getByTestId("lobby-content-everyday").waitFor({ timeout: 15000 });
    await h.getByTestId("lobby-content-everyday").click();
    await soon("C the host's lobby: the Everyday look, and the next game says Everyday", async () => (await isLook(h, "everyday")) && /Everyday content/.test(await h.getByTestId("up-next-content").innerText()));
    await soon("C the guest's results: What's next now says the NEXT game is Everyday", async () => /Next game: Everyday content/.test(await g.getByTestId("whats-next-content").innerText()));
    check("C …while the Christmas game on the guest's screen keeps its Christmas look (a setting for the next game never recolours a game shown)", await isLook(g, "christmas"), JSON.stringify(await look(g)));
    check("C the TV still shows the last game (Christmas), so it keeps that game's look until the next one starts", await isLook(tv, "christmas"), JSON.stringify(await look(tv)));
    // The guest goes back to the lobby, then reloads (a reconnect).
    await g.getByRole("button", { name: /Back to (the )?lobby/ }).first().click();
    await soon("C the guest in the lobby: the Everyday look (Match the game, the next game)", () => isLook(g, "everyday"));
    await g.reload({ waitUntil: "domcontentloaded" });
    await soon("C the guest reloads: the room's content (Everyday) and their own look choice (Match the game) are kept", async () => /Everyday content/.test(await g.getByTestId("up-next-content").innerText()) && (await isLook(g, "everyday")), 20000);
    await startBtn.click();
    await h.getByTestId("briefing").waitFor({ timeout: 20000 });
    await g.getByTestId("briefing").waitFor({ timeout: 20000 });
    check("C the Everyday game's briefing says Everyday (this game)", /This game: Everyday content/.test(await g.getByTestId("briefing-content").innerText()));
    await soon("C the TV shows the new (Everyday) game, in the Everyday look", () => isLook(tv, "everyday"));
    await passBriefing([h, g]);
    const cb3 = await shownBoard(g);
    check("C an Everyday game deals a year-round board", !!cb3 && !CHRISTMAS_BOARDS.includes(cb3.id), cb3?.id);
    await Promise.all([hctx.close(), gctx.close(), tctx.close()]);
  }

  // ---- E. One device, two tabs: in-flight starts and a changed choice ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const bodies = [];
    ctx.on("request", (r) => { const b = r.postData(); if (b && /\/games$/.test(r.url()) && r.method() === "POST") bodies.push({ page: r.frame()?.page(), body: JSON.parse(b) }); });
    const a = await ctx.newPage();
    await a.goto(`${GATE_BASE}/solo`, { waitUntil: "domcontentloaded" });
    await a.getByTestId("solo-home").waitFor({ timeout: 15000 });
    await a.getByTestId("solo-content-christmas").click();
    // Tab A's Start is held in flight while tab B changes the device's remembered choice.
    let release; const held = new Promise((r) => { release = r; });
    await a.route("**/rooms/*/games", async (route) => { if (route.request().method() === "POST") await held; return route.continue(); });
    await a.getByTestId("solo-start-word-connections").click();
    const b = await ctx.newPage();
    await b.goto(`${GATE_BASE}/solo`, { waitUntil: "domcontentloaded" });
    await b.getByTestId("solo-home").waitFor({ timeout: 15000 });
    check("E tab B sees the device's remembered choice (Christmas)", await pressed(b, "solo-content-christmas"));
    await b.getByTestId("solo-content-everyday").click();
    await soon("E tab B changes it to Everyday; tab B's shelf turns Everyday", () => isLook(b, "everyday"));
    release();
    const ab = await shownBoard(a);
    check("E tab A's held Start went out with the content it was pressed with (Christmas), and dealt a Christmas board", bodies.filter((x) => x.page === a).map((x) => x.body.season).join(",") === "christmas" && !!ab && CHRISTMAS_BOARDS.includes(ab.id), `${JSON.stringify(bodies.filter((x) => x.page === a).map((x) => x.body.season))} ${ab?.id}`);
    await soon("E tab A's round keeps its own Christmas look while the device's choice is now Everyday", () => isLook(a, "christmas"));
    // Tab A ends its round (four wrong guesses), then Play again.
    const groups = ab.groups.map((x) => x.words);
    for (let k = 0; k < 4; k++) {
      if (await a.getByTestId("solo-results").count()) break;
      for (const gi of [0, 1, 2, 3]) await a.getByTestId("mz-cx-tile").filter({ hasText: new RegExp(`^\\s*${groups[gi][k].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") }).click();
      await a.getByTestId("mz-cx-submit").click();
      await sleep(400);
    }
    await a.getByTestId("solo-results").waitFor({ timeout: 20000 });
    check("E tab A's results say this round's content, and keep its look", /This round: Christmas content/.test(await a.getByTestId("solo-results-content").innerText()) && (await isLook(a, "christmas")));
    const n0 = bodies.length;
    await a.getByTestId("solo-play-again").click();
    const ab2 = await shownBoard(a);
    const again = bodies.slice(n0).filter((x) => x.page === a).map((x) => x.body.season);
    check("E tab A's Play again repeats the finished round's content (Christmas), not the device's changed choice", again.length >= 1 && again.every((v) => v === "christmas") && !!ab2 && CHRISTMAS_BOARDS.includes(ab2.id), `${JSON.stringify(again)} ${ab2?.id}`);
    // Tab B's own Start uses tab B's choice.
    const n1 = bodies.length;
    await b.getByTestId("solo-start-word-connections").click();
    const bb = await shownBoard(b);
    check("E tab B's own Start uses its choice (Everyday): a year-round board", bodies.slice(n1).filter((x) => x.page === b).map((x) => x.body.season).join(",") === "everyday" && !!bb && !CHRISTMAS_BOARDS.includes(bb.id), bb?.id);
    await soon("E tab B's round is in the Everyday look", () => isLook(b, "everyday"));
    await a.unroute("**/rooms/*/games").catch(() => {});
    await ctx.close();
  }

  // ---- F. This device can't save its choices (repair R82-01) ----
  {
    const MODES = {
      "writes throw, nothing stored": () => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (this === window.localStorage) throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); return orig.call(this, k, v); };
      },
      "writes throw, an older Everyday choice stored": () => {
        try { window.localStorage.setItem("mz_solo_season", "everyday"); window.localStorage.setItem("mz_look", "everyday"); } catch { /* none */ }
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) { if (this === window.localStorage) throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); return orig.call(this, k, v); };
      },
      "every localStorage access throws": () => {
        const set = Storage.prototype.setItem, get = Storage.prototype.getItem, rem = Storage.prototype.removeItem;
        Storage.prototype.setItem = function (k, v) { if (this === window.localStorage) throw new DOMException("denied", "SecurityError"); return set.call(this, k, v); };
        Storage.prototype.getItem = function (k) { if (this === window.localStorage) throw new DOMException("denied", "SecurityError"); return get.call(this, k); };
        Storage.prototype.removeItem = function (k) { if (this === window.localStorage) throw new DOMException("denied", "SecurityError"); return rem.call(this, k); };
      },
    };
    for (const [mode, init] of Object.entries(MODES)) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addInitScript(init);
      const starts = [];
      ctx.on("request", (r) => { const b = r.postData(); if (b && /\/games$/.test(r.url()) && r.method() === "POST") starts.push(JSON.parse(b)); });
      const p = await ctx.newPage();
      const pageErrors = [];
      p.on("pageerror", (e) => pageErrors.push(String(e)));
      // The look, in Settings.
      await p.goto(`${GATE_BASE}/`, { waitUntil: "domcontentloaded" });
      await p.getByTestId("home-settings").click();
      await p.getByTestId("look-christmas").click();
      await sleep(400);
      check(`F ${mode}: Settings → Look → Christmas stays chosen and the page turns Christmas`, (await pressed(p, "look-christmas")) && (await isLook(p, "christmas")), JSON.stringify(await look(p)));
      check(`F ${mode}: Settings says the look lasts until reload (never promises it is kept)`, await p.getByTestId("look-unsaved").isVisible());
      await p.getByTestId("look-auto").click();
      await sleep(200);
      check(`F ${mode}: back to Match the game, still unsaved, the page follows it (Everyday at home)`, (await pressed(p, "look-auto")) && (await isLook(p, "everyday")));
      await p.keyboard.press("Escape");
      // The solo content, on the shelf, reached inside the app (no reload: this page's choices hold).
      await p.getByTestId("home-solo").click();
      await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
      await p.getByTestId("solo-content-christmas").click();
      await sleep(400);
      check(`F ${mode}: the shelf's Christmas stays chosen, with the Christmas look (Match the game)`, (await p.getByTestId("solo-content").getAttribute("data-season")) === "christmas" && (await pressed(p, "solo-content-christmas")) && (await isLook(p, "christmas")), `${await p.getByTestId("solo-content").getAttribute("data-season")} ${JSON.stringify(await look(p))}`);
      check(`F ${mode}: the shelf says the choice lasts until reload`, await p.getByTestId("solo-content-unsaved").isVisible());
      await p.getByTestId("solo-start-word-connections").click();
      const board = await shownBoard(p);
      check(`F ${mode}: shelf → Word Connections: the Start reached the server as Christmas and dealt a Christmas board`, starts.length >= 1 && starts.every((b) => b.season === "christmas") && !!board && CHRISTMAS_BOARDS.includes(board.id), `${JSON.stringify(starts.map((b) => b.season))} ${board?.id}`);
      check(`F ${mode}: the round keeps the Christmas look and label`, (await isLook(p, "christmas")) && /Christmas content/.test(await p.getByTestId("solo-round-content").innerText()));
      // A reload: nothing could be saved, so the page falls back to what storage holds (as the notes said).
      const stored = "everyday"; // in every mode: the default, or the older stored Everyday
      await p.reload({ waitUntil: "domcontentloaded" });
      await p.getByTestId("solo-ready").waitFor({ timeout: 15000 });
      check(`F ${mode}: after a reload the unsaved choice falls back (${stored}), never a broken page`, (await p.getByTestId("solo-content").getAttribute("data-season")) === stored && (await isLook(p, "everyday")));
      check(`F ${mode}: no page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
      await ctx.close();
    }
  }

  // ---- D. The looks at each size, in both looks ----
  {
    const VIEWS = [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }];
    for (const vp of VIEWS) for (const id of ["everyday", "christmas"]) {
      const ctx = await browser.newContext({ viewport: vp, reducedMotion: id === "christmas" ? "reduce" : "no-preference" });
      await ctx.addInitScript((v) => { try { localStorage.setItem("mz_look", v); } catch { /* none */ } }, id);
      const p = await ctx.newPage();
      for (const [path, testId] of [["/", null], ["/solo", "solo-home"], ["/solo/word-connections", "solo-ready"], ["/library", null]]) {
        await p.goto(`${GATE_BASE}${path}`, { waitUntil: "domcontentloaded" });
        if (testId) await p.getByTestId(testId).waitFor({ timeout: 15000 }); else await sleep(900);
        await settled(p);
        const where = `D ${vp.width}×${vp.height} ${id} ${path}`;
        const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, motion: document.querySelector(".mz-root")?.getAttribute("data-mz-motion") ?? null, small: [...document.querySelectorAll(".mz-content-choice .mz-choice__opt")].map((b) => b.getBoundingClientRect().height).filter((h) => h < 44) }));
        check(`${where}: the ${id} look, no sideways overflow, choices at least 44 px`, (await isLook(p, id)) && m.over <= 1 && m.small.length === 0, JSON.stringify(m));
        if (id === "christmas") check(`${where}: reduced motion honoured`, m.motion === "reduced", String(m.motion));
        const bad = await contrastFailures(p);
        check(`${where}: readable contrast (WCAG AA)`, bad.length === 0, bad.slice(0, 3).join("; "));
      }
      await ctx.close();
    }
  }
} catch (e) {
  check("no unexpected error", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  if (own) { try { own.child.kill("SIGKILL"); } catch { /* gone */ } }
  await browser.close();
}

console.log(failures ? `\n${failures} themes-seasonal check(s) FAILED` : "\nAll themes-seasonal checks passed");
process.exit(failures ? 1 : 0);
