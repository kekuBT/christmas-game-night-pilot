// Stage 9.1: Jebena Rush, one complete casual-room match in real browsers
// (docs/stage9/stage91.md §8–§9, §12). Stage 10.1 (docs/stage10/stage101.md):
// lives are cini cups, and a lost life is a broken cup. Every page logs every
// cup that breaks (an init-script observer), so the driver checks that a cup
// breaks only for a real lost life, exactly once, in its slot, and never on a
// wrong try, a reload, a resync, a repeated view or a player leaving. Real time (10-second turns), its own
// server. Phones: Keku hosts (390 px, Everyday look, full motion), Amina
// (320 px, Christmas look), Baraka (390 px, reduced motion); a TV spectator
// (1440 px); a second room (Zawadi, Juma) playing at the same time.
//   A  lobby: Jebena Rush is practice-only in the picker; the host chooses
//      3/5/7 cups (5 preselected); guests see the choice; a guest's change
//      is refused; no sideways scroll at 320/390; no hearts anywhere.
//   B  briefing: the rules and "everyone starts with 3 cups" on every
//      phone and the TV; everyone gets ready.
//   C  turns: the holder's field is focused; typing and Enter sends; Tab
//      reaches Send. Not in the bank, ambiguous and near-miss tries are
//      explained and keep the deadline; an accepted answer passes the jebena;
//      a repeat is "already named"; an alias and an accepted typo count under
//      their canonical names. The TV shows the category, holder, countdown,
//      cups and last play. Wrong tries break no cup.
//   D  integrity: an out-of-turn (spoofed) answer, a stale turn's and a
//      duplicate send change nothing; a late joiner watches and can't answer.
//   E  timeouts: one cup breaks (exactly the lost slot, once, on the
//      holder's own row, the seat lists and the TV; never again on a
//      repeated view), a new category, the jebena passes; offline on your turn
//      costs the cup (no free life) and coming back shows it broken without
//      replaying the break, never resubmitting what was typed offline; a
//      reload keeps the game and shows broken cups without breaking them.
//   F  elimination to the finish: the last cup breaks, out players watch the
//      rest; the last one with a whole cup keeps the jebena; results on every
//      phone equal the server's scores; every break on every page was a real
//      lost life, once; reduced motion breaks without animating.
//   G  Play again keeps the cups (its briefing says 3) and starts with
//      whole cups; two players leave and nothing breaks; back to the lobby.
//   H  motion and looks: full motion animates steam; reduced motion keeps it
//      still; the urgency word is always there; Everyday and Christmas.
//   I  privacy: no projection carries the bank (aliases, unused answers), and
//      nothing from a room enters the app-shell cache. The shipped app never
//      carries the bank: bank-only canaries (its version, source notes,
//      near-miss reasons, distinctive answers) appear in no built file and no
//      public response (the page, the service worker, the manifest, assets,
//      the game list), so the service worker can't cache it either.
//   J  two rooms: each has its own cups, turns and answers; room B's seven
//      cups fit a 320 px phone.
//   Z  a third room: the survivor never had an answer accepted, so its
//      results say "You won this one" and never "You missed this one"; the
//      player who did nothing at all is truthfully told they missed it.
//   K  a Family Cup never offers it: its picker leaves Jebena Rush out, and
//      the server refuses a Cup start of it (CASUAL_ONLY).
// Starts ITS OWN server. Usage: node scripts/check-jebena-rush.mjs
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { bankCanaries, freshAnswer, jebenaOracle } from "./lib/jebena-oracle.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage10/screenshots/${name}.png`), fullPage: false });
const noHearts = (text) => !/heart|♥|♡/i.test(text);

/**
 * Stage 10.1: every page logs each cup that breaks (data-breaking="true"
 * appearing): the place (surface), the seat, the slot, the count shown and
 * the animation the cup is playing (reduced motion: none).
 */
const BREAK_LOG = () => {
  const log = [];
  Object.defineProperty(window, "__cupBreaks", { value: log, configurable: true });
  const rec = (svg) => {
    const row = svg.closest("[data-cup-surface]");
    const shard = svg.querySelector(".mz-cini__shard--r");
    log.push({ surface: row?.getAttribute("data-cup-surface") ?? null, seat: row?.getAttribute("data-cup-seat") ?? null, slot: Number(svg.getAttribute("data-cup-slot")), cups: Number(row?.getAttribute("data-cups")), anim: shard ? getComputedStyle(shard).animationName : null, t: Date.now() });
  };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "attributes") { if (m.target.getAttribute("data-breaking") === "true") rec(m.target); continue; }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.getAttribute("data-breaking") === "true") rec(n);
        for (const x of n.querySelectorAll('[data-breaking="true"]')) rec(x);
      }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-breaking"] });
};
const breaks = (page) => page.evaluate(() => [...(window.__cupBreaks ?? [])]).catch(() => []);
const clearBreaks = (page) => page.evaluate(() => { if (window.__cupBreaks) window.__cupBreaks.length = 0; }).catch(() => {});
/** A cups row: the count it shows, its whole and broken cups, its words. */
const cupsIn = (locator) => locator.evaluate((el) => {
  const row = el.matches("[data-cups]") ? el : el.querySelector("[data-cups]");
  return { cups: Number(row?.getAttribute("data-cups")), of: Number(row?.getAttribute("data-of")), whole: el.querySelectorAll('svg[data-state="whole"]').length, broken: el.querySelectorAll('svg[data-state="broken"]').length, label: row?.getAttribute("aria-label") ?? null, text: el.textContent ?? "" };
});

const ORACLE = jebenaOracle();
const DATA = mkdtempSync(joinPath(tmpdir(), "mz-jr-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE; delete env.MCHEZO_LIFECYCLE_SCALE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;

/** A call with a seat's own token (from outside the browser). */
async function call(path, { token, body, spectator } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  if (spectator) headers["x-spectator-token"] = spectator;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})), text: "" };
}
/** A call from the page, with that page's own seat. */
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(path.replace(":room", roomId), { method, headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { method, path, body });
const seatOf = (page) => page.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") }));
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function host(page, name) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300);
  }
  return code;
}
async function join(page, name, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function spectate(page, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByTestId("tv-show").waitFor({ timeout: 15000 });
}

const browser = await launchChromium();
const ctxs = [];
async function phoneCtx(width, { look, reducedMotion } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 760 }, ...(reducedMotion ? { reducedMotion: "reduce" } : {}) });
  if (look) await ctx.addInitScript((l) => { try { localStorage.setItem("mz_look", l); } catch { /* none */ } }, look);
  await ctx.addInitScript(BREAK_LOG);
  ctxs.push(ctx);
  return ctx;
}
try {
  // ---------- setup: room A ----------
  const kCtx = await phoneCtx(390, { look: "everyday" });
  const K = await kCtx.newPage();
  const code = await host(K, "Keku");
  const aCtx = await phoneCtx(320, { look: "christmas" });
  // Amina's socket goes through the driver, so "away" can mean truly away: setOffline alone doesn't
  // reliably cut an open WebSocket in Chromium, and a push that still arrives is a live break, not a resync.
  let aminaAway = false;
  await aCtx.routeWebSocket(/.*/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => { if (!aminaAway) server.send(m); });
    server.onMessage((m) => { if (!aminaAway) ws.send(m); });
  });
  const A = await aCtx.newPage();
  await join(A, "Amina", code);
  const bCtx = await phoneCtx(390, { reducedMotion: true });
  const B = await bCtx.newPage();
  await join(B, "Baraka", code);
  const tvCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await tvCtx.addInitScript(BREAK_LOG);
  ctxs.push(tvCtx);
  const TV = await tvCtx.newPage();
  await spectate(TV, code);
  const seat = { K: await seatOf(K), A: await seatOf(A), B: await seatOf(B) };
  const ROOM = seat.K.roomId;
  const pageOf = { [seat.K.playerId]: K, [seat.A.playerId]: A, [seat.B.playerId]: B };
  const nameOf = { [seat.K.playerId]: "Keku", [seat.A.playerId]: "Amina", [seat.B.playerId]: "Baraka" };
  const playerView = async (page) => {
    const p = (await api(page, "GET", "/rooms/:room/projection?audience=player")).body;
    const g = (p.myGames ?? []).filter((x) => x.gameId === "jebena-rush").slice(-1)[0];
    return { p, g, st: g?.state ?? {} };
  };

  // ---------- J (setup): room B, playing at the same time, with 7 cups ----------
  const roomB = (await call("/rooms", { body: { name: "Room B", kind: "casual" } })).body;
  const zawadi = (await call(`/rooms/${roomB.roomId}/join`, { body: { displayName: "Zawadi", asHost: true, hostClaimToken: roomB.hostClaimToken } })).body;
  const juma = (await call("/rooms/join-by-code", { body: { joinCode: roomB.joinCode, displayName: "Juma" } })).body;
  const projB = async (tok) => (await call(`/rooms/${roomB.roomId}/projection?audience=player`, { token: tok })).body;
  const setB = await call(`/rooms/${roomB.roomId}/game-settings`, { token: zawadi.recoveryToken, body: { gameId: "jebena-rush", settings: { hearts: 7 }, baseRevision: (await projB(zawadi.recoveryToken)).session?.revision ?? 0 } });
  check("J room B: its host sets 7 cups", setB.status === 200 && setB.body.lobbySettings?.["jebena-rush"]?.hearts === 7, JSON.stringify(setB.body).slice(0, 200));
  const pB0 = await projB(zawadi.recoveryToken);
  const startB = await call(`/rooms/${roomB.roomId}/games`, { token: zawadi.recoveryToken, body: { gameId: "jebena-rush", official: false, roster: pB0.readiness?.wouldPlay, attempt: { id: randomUUID(), sessionRevision: pB0.session?.revision ?? 0 }, season: pB0.contentSeason, settings: { hearts: 7 } } });
  check("J room B: Jebena Rush starts with 7 cups", startB.status === 201, JSON.stringify(startB.body).slice(0, 200));
  for (const s of [zawadi, juma]) await call(`/rooms/${roomB.roomId}/intents`, { token: s.recoveryToken, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: roomB.roomId, gameInstanceId: startB.body.gameId, action: "briefing-ready", payload: { ready: true } } } });
  const stB = async () => ((await projB(zawadi.recoveryToken)).myGames ?? []).find((g) => g.id === startB.body.gameId);
  await soon("J room B: playing", async () => (await stB())?.status === "playing");

  // ---------- Z (runs alongside): room C, 3 cups, nobody's answer is ever accepted ----------
  // Both players let every turn run out; the one later in the seat order outlasts the other.
  // That survivor makes one wrong try (an action, but never an accepted answer): Stage 10.1's
  // results must call it a win, never "You missed this one".
  const zeroRoom = (async () => {
    const roomC = (await call("/rooms", { body: { name: "Room C", kind: "casual" } })).body;
    const wanjiru = (await call(`/rooms/${roomC.roomId}/join`, { body: { displayName: "Wanjiru", asHost: true, hostClaimToken: roomC.hostClaimToken } })).body;
    const otieno = (await call("/rooms/join-by-code", { body: { joinCode: roomC.joinCode, displayName: "Otieno" } })).body;
    const projC = async (tok) => (await call(`/rooms/${roomC.roomId}/projection?audience=player`, { token: tok })).body;
    await call(`/rooms/${roomC.roomId}/game-settings`, { token: wanjiru.recoveryToken, body: { gameId: "jebena-rush", settings: { hearts: 3 }, baseRevision: (await projC(wanjiru.recoveryToken)).session?.revision ?? 0 } });
    const p0 = await projC(wanjiru.recoveryToken);
    const startC = await call(`/rooms/${roomC.roomId}/games`, { token: wanjiru.recoveryToken, body: { gameId: "jebena-rush", official: false, roster: p0.readiness?.wouldPlay, attempt: { id: randomUUID(), sessionRevision: p0.session?.revision ?? 0 }, season: p0.contentSeason, settings: { hearts: 3 } } });
    if (startC.status !== 201) return { error: `start ${startC.status}` };
    const gidC = startC.body.gameId;
    const intentC = (who, action, payload) => call(`/rooms/${roomC.roomId}/intents`, { token: who.recoveryToken, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: roomC.roomId, gameInstanceId: gidC, action, payload } } });
    for (const who of [wanjiru, otieno]) await intentC(who, "briefing-ready", { ready: true });
    const gC = async () => ((await projC(wanjiru.recoveryToken)).myGames ?? []).find((g) => g.id === gidC);
    let g = null;
    for (let i = 0; i < 80 && g?.status !== "playing"; i++) { g = await gC(); if (g?.status !== "playing") await sleep(250); }
    if (g?.status !== "playing") return { error: "never played" };
    const order = g.state.order.map((r) => r.id);
    const survivor = order[1] === wanjiru.playerId ? wanjiru : otieno;
    const other = survivor === wanjiru ? otieno : wanjiru;
    let tried = null;
    for (let i = 0; i < 400; i++) {
      g = await gC();
      if (g?.status === "finished") break;
      if (!tried && g?.state?.turn?.player === survivor.playerId) {
        tried = (await intentC(survivor, "jebena-answer", { turn: g.state.turn.n, text: ORACLE[g.state.category.id].notInBank })).body;
      }
      await sleep(250);
    }
    return { roomC, survivor, other, gidC, tried, g };
  })();

  // ---------- A. Lobby: pick Jebena Rush, choose cups ----------
  await K.getByTestId("choose-game").click();
  const pick = K.getByTestId("select-game-jebena-rush");
  await pick.waitFor({ timeout: 10000 });
  check("A the picker lists Jebena Rush as practice-only", /practice only/i.test(await pick.innerText()), (await pick.innerText()).replace(/\s+/g, " ").slice(0, 120));
  await pick.click();
  await soon("A the host sees the cups choice (3, 5 or 7 cups), 5 preselected", async () => (await K.getByTestId("lobby-hearts").getAttribute("data-hearts")) === "5" && /3 cups/.test(await K.getByTestId("lobby-hearts").innerText()) && /7 cups/.test(await K.getByTestId("lobby-hearts").innerText()));
  await soon("A guests see 5 cups each", async () => (await A.getByTestId("lobby-hearts-guest").getAttribute("data-hearts")) === "5" && (await B.getByTestId("lobby-hearts-guest").getAttribute("data-hearts")) === "5");
  await K.getByTestId("lobby-hearts-3").click();
  await soon("A the host chose 3 cups", async () => (await K.getByTestId("lobby-hearts").getAttribute("data-hearts")) === "3" && /starts with 3 cups/.test(await K.getByTestId("lobby-hearts-note").innerText()));
  await soon("A guests see the host's choice: 3 cups each, drawn as three whole cups", async () => (await A.getByTestId("lobby-hearts-guest").getAttribute("data-hearts")) === "3" && /starts with 3 cups/.test(await A.getByTestId("lobby-hearts-guest").innerText()) && (await cupsIn(A.getByTestId("lobby-hearts-guest"))).whole === 3);
  check("A no hearts anywhere in the lobby (host and guest)", noHearts(await K.locator("body").innerText()) && noHearts(await A.locator("body").innerText()));
  const guestSet = await api(A, "POST", "/rooms/:room/game-settings", { gameId: "jebena-rush", settings: { hearts: 7 }, baseRevision: (await playerView(A)).p.session?.revision ?? 0 });
  check("A a guest can't change the cups (403)", guestSet.status === 403, JSON.stringify(guestSet));
  const badSet = await api(K, "POST", "/rooms/:room/game-settings", { gameId: "jebena-rush", settings: { hearts: 4 }, baseRevision: (await playerView(K)).p.session?.revision ?? 0 });
  check("A 4 cups is refused (400), in words about cups", badSet.status === 400 && /Cups must be 3, 5 or 7/.test(JSON.stringify(badSet.body)), JSON.stringify(badSet));
  check("A lobby, host 390: no sideways scroll", await noSideScroll(K));
  check("A lobby, guest 320: no sideways scroll", await noSideScroll(A));
  await shot(K, "jr-lobby-host-390");
  await shot(A, "jr-lobby-guest-320-christmas");

  // ---------- B. Briefing ----------
  await K.locator('[data-testid="lobby-dock"] button.mz-key--block').first().click();
  for (const [who, p] of [["Keku", K], ["Amina", A], ["Baraka", B]]) {
    await soon(`B ${who}'s briefing says everyone starts with 3 cups, with three whole cups`, async () => /starts with 3 cups/.test(await p.getByTestId("briefing-hearts").innerText()) && (await cupsIn(p.getByTestId("briefing-hearts"))).whole === 3);
    check(`B ${who}'s briefing: a timeout breaks a cup; no hearts`, /one of your cups breaks/.test(await p.locator("body").innerText()) && noHearts(await p.locator("body").innerText()));
  }
  await soon("B the TV briefing says 3 cups", async () => /starts with 3 cups/.test(await TV.getByTestId("briefing-hearts").innerText()) && noHearts(await TV.locator("body").innerText()));
  check("B the briefing states 10 seconds a turn", /10 seconds for each turn/.test(await K.getByTestId("briefing-timing").innerText()), await K.getByTestId("briefing-timing").innerText());
  await shot(A, "jr-briefing-320-christmas");
  await passBriefing([K, A, B]);

  // ---------- C. Turns ----------
  let v = await soon("C play: a turn is on", async () => { const x = await playerView(K); return x.st.turn ? x : null; });
  const gid = v.g.id;
  check("C every player starts with 3 lives (the server's count)", (v.st.order ?? []).every((s) => s.hearts === 3) && v.st.startHearts === 3);
  for (const [who, p] of [["Keku", K], ["Amina", A], ["Baraka", B]]) {
    await soon(`C ${who}'s own row: three whole cups, "3/3", "3 of 3 cups remaining"`, async () => { const c = await cupsIn(p.getByTestId("jr-my-hearts")); return c.cups === 3 && c.whole === 3 && c.broken === 0 && c.label === "3 of 3 cups remaining" && /3\/3/.test(c.text); });
  }
  const holderNow = async () => (await playerView(K)).st.turn?.player;
  const used = new Set();
  const namedNow = async () => { const x = await playerView(K); for (const e of x.st.log ?? []) if (e.kind === "accepted") used.add(e.answer); return x; };
  /** Type on the holder's phone and press Enter; resolve with the next state once the server has answered. */
  async function typeAndSend(page, text) {
    const before = (await playerView(page)).st;
    await page.getByTestId("jr-input").waitFor({ timeout: 8000 });
    await page.getByTestId("jr-input").fill("");
    await page.getByTestId("jr-input").focus();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
    return soon(`C sent “${text}”`, async () => {
      const now = (await playerView(page)).st;
      if (!now.turn || now.turn.n !== before.turn?.n) return now;
      if (now.attempt && now.attempt.text === text.trim()) return now;
      return null;
    }, 8000);
  }
  const holder1 = v.st.turn.player;
  const H1 = pageOf[holder1];
  await soon("C the holder's phone says Your turn! and its field has focus", async () => (await H1.getByTestId("jr-holder").innerText()) === "Your turn!" && (await H1.evaluate(() => document.activeElement?.id)) === "jr-input");
  for (const [id, p] of Object.entries(pageOf)) if (id !== holder1) await soon(`C ${nameOf[id]} sees ${nameOf[holder1]} has the jebena`, async () => (await p.getByTestId("jr-holder").innerText()).includes(nameOf[holder1]));
  await soon("C the TV: category, holder, countdown and cups", async () => {
    const cat = await TV.getByTestId("tv-jr-category").innerText();
    return cat === v.st.category.name && (await TV.getByTestId("tv-jr-holder").innerText()).includes(nameOf[holder1]) && /\d/.test(await TV.getByTestId("tv-jr-clock-seconds").innerText()) && (await TV.getByTestId("tv-jr-seats").locator('[data-hearts="3"]').count()) === 3;
  });
  // Keyboard: Tab from the field reaches Send.
  await H1.getByTestId("jr-input").focus();
  await H1.keyboard.type("x");
  await H1.keyboard.press("Tab");
  check("C keyboard: Tab from the field reaches Send", (await H1.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "jr-send");
  await H1.getByTestId("jr-input").fill("");
  const cat1 = v.st.category.id;
  const deadline1 = v.g.phaseDeadlineAt;
  const o1 = ORACLE[cat1];
  let st = await typeAndSend(H1, o1.notInBank);
  check("C not in the bank: explained, no pass", st?.attempt?.verdict === "not-in-bank" && st.turn.n === 1);
  await soon("C the phone explains it isn't on the list", async () => /isn't on our/.test(await H1.getByTestId("jr-feedback").innerText()));
  check("C a rejected try keeps the deadline", (await playerView(K)).g.phaseDeadlineAt === deadline1);
  if (o1.ambiguous[0]) {
    st = await typeAndSend(H1, o1.ambiguous[0]);
    check(`C ambiguous (“${o1.ambiguous[0]}”): asks to check the spelling`, st?.attempt?.verdict === "ambiguous");
    await soon("C the phone says it can't be sure", async () => /can't be sure/.test(await H1.getByTestId("jr-feedback").innerText()));
  }
  if (o1.nearMiss[0]) {
    st = await typeAndSend(H1, o1.nearMiss[0]);
    check(`C near miss (“${o1.nearMiss[0]}”): its reason is shown`, st?.attempt?.verdict === "near-miss" && !!st.attempt.reason);
  }
  await shot(H1, `jr-myturn-feedback-${H1 === A ? "320-christmas" : "390"}`);
  {
    const logs = await Promise.all([K, A, B, TV].map(breaks));
    const mine = await cupsIn(H1.getByTestId("jr-my-hearts"));
    check("C wrong tries (not on the list, ambiguous, near miss) break no cup anywhere", logs.every((l) => l.length === 0) && mine.whole === 3 && mine.broken === 0, JSON.stringify(logs).slice(0, 200));
  }
  check("C the holder's turn screen: no sideways scroll", await noSideScroll(H1));
  await namedNow();
  const first = freshAnswer(cat1, used);
  st = await typeAndSend(H1, first.typed);
  check(`C “${first.typed}” is accepted and the jebena passes`, st?.turn?.n === 2 && (st.log ?? []).some((e) => e.kind === "accepted" && e.answer === first.name));
  used.add(first.name);
  await soon("C the previous holder reads “You named …”", async () => (await H1.getByTestId("jr-last").innerText()).includes(`You named “${first.name}”`));
  await soon("C the TV shows the last play", async () => (await TV.getByTestId("tv-jr-last").innerText()).includes(`named “${first.name}”`));
  // Turn 2: a repeat, then an alias.
  const holder2 = await holderNow();
  const H2 = pageOf[holder2];
  st = await typeAndSend(H2, first.name.toUpperCase());
  check("C a repeat (any case) is “already named”, no pass", st?.attempt?.verdict === "used" && st.turn.n === 2);
  await soon("C the phone says it was already named", async () => /already named/.test(await H2.getByTestId("jr-feedback").innerText()));
  const cat2 = (await playerView(K)).st.category.id;
  const alias = freshAnswer(cat2, used, { kind: "alias" });
  if (alias) {
    st = await typeAndSend(H2, alias.typed);
    check(`C an alias (“${alias.typed}”) counts as “${alias.name}”`, st?.turn?.n === 3 && (st.log ?? []).some((e) => e.kind === "accepted" && e.answer === alias.name && e.via === "alias"));
    used.add(alias.name);
  } else {
    const plain = freshAnswer(cat2, used);
    st = await typeAndSend(H2, plain.typed); used.add(plain.name);
    check("C (no alias left here) a plain answer passes", st?.turn?.n === 3);
  }
  // Turn 3: an accepted typo.
  const holder3 = await holderNow();
  const H3 = pageOf[holder3];
  const cat3 = (await playerView(K)).st.category.id;
  const typo = freshAnswer(cat3, used, { kind: "typo" });
  st = await typeAndSend(H3, typo.typed);
  check(`C a typo (“${typo.typed}”) counts as “${typo.name}”`, st?.turn?.n === 4 && (st.log ?? []).some((e) => e.kind === "accepted" && e.answer === typo.name && e.via === "typo"));
  used.add(typo.name);
  await soon("C the named list shows canonical names", async () => (await TV.locator("body").innerText()).length > 0 && (await K.getByTestId("jr-named").innerText()).includes(typo.name));

  // ---------- D. Integrity ----------
  v = await playerView(K);
  const turnD = v.st.turn.n;
  const holderD = v.st.turn.player;
  const notHolder = [K, A, B].find((p) => pageOf[holderD] !== p);
  const intent = (page, payload, clientEventId = randomUUID()) => api(page, "POST", "/rooms/:room/intents", { intent: { kind: "intent", schemaVersion: 1, clientEventId, roomId: ROOM, gameInstanceId: gid, action: "jebena-answer", payload } });
  const spoof = await intent(notHolder, { turn: turnD, text: freshAnswer(v.st.category.id, used).typed });
  const stale = await intent(pageOf[holderD], { turn: turnD - 1, text: freshAnswer(v.st.category.id, used).typed });
  const after = (await playerView(K)).st;
  check("D an out-of-turn answer is refused", spoof.body.accepted === false, JSON.stringify(spoof.body));
  check("D a stale turn's answer is refused", stale.body.accepted === false, JSON.stringify(stale.body));
  check("D neither changed the turn or the answers", after.turn.n === turnD && after.log.length === v.st.log.length);
  // A duplicate send (the same client id twice) counts once.
  const dupText = freshAnswer(v.st.category.id, used);
  const dupId = randomUUID();
  const d1 = await intent(pageOf[holderD], { turn: turnD, text: dupText.typed, phaseKey: `turn:${turnD}` }, dupId);
  const d2 = await intent(pageOf[holderD], { turn: turnD, text: dupText.typed, phaseKey: `turn:${turnD}` }, dupId);
  used.add(dupText.name);
  const afterDup = (await playerView(K)).st;
  check("D a duplicate send replays its first answer, counted once", d1.body.accepted === true && JSON.stringify(d1.body) === JSON.stringify(d2.body) && afterDup.turn.n === turnD + 1 && afterDup.log.filter((e) => e.kind === "accepted" && e.answer === dupText.name).length === 1, `${JSON.stringify(d1.body).slice(0, 120)} | ${JSON.stringify(d2.body).slice(0, 120)}`);
  // A late joiner watches.
  const lateCtx = await phoneCtx(390);
  const L = await lateCtx.newPage();
  await join(L, "Late", code);
  await soon("D a late joiner is told the game started before they joined", async () => L.getByTestId("not-in-game-note").isVisible());
  const lateTry = await intent(L, { turn: afterDup.turn.n, text: freshAnswer(afterDup.category.id, used).typed });
  check("D a late joiner's answer is refused", lateTry.body.accepted === false, JSON.stringify(lateTry.body));
  await lateCtx.close();

  // ---------- H. Motion and looks (while a turn runs) ----------
  const anim = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).animationName : null; }, sel);
  check("H full motion: steam rises on Keku's phone", (await anim(K, '[data-testid="jr-art"] .mz-jr-steam__curl')) === "mz-jr-rise");
  check("H reduced motion: Baraka's jebena is still", (await anim(B, '[data-testid="jr-art"] .mz-jr-steam__curl')) === "none" && (await B.evaluate(() => document.querySelector(".mz-root")?.getAttribute("data-mz-motion"))) === "reduced");
  check("H the urgency word is shown with reduced motion", /Warm|Steaming|Boiling over!/.test(await B.getByTestId("jr-clock-word").innerText()));
  check("H Amina's phone has the Christmas look, Keku's Everyday", (await A.evaluate(() => document.querySelector(".mz-root")?.getAttribute("data-mz-theme"))) === "christmas" && (await K.evaluate(() => document.querySelector(".mz-root")?.getAttribute("data-mz-theme"))) === "everyday");

  // ---------- I. Privacy ----------
  {
    const cur = (await playerView(K)).st;
    const unused = ORACLE[cur.category.id].answers.map((a) => a.name).filter((n) => !used.has(n));
    const spec = await TV.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_spec_roomId"), token: sessionStorage.getItem("cgn_spec_token") }));
    const specJson = JSON.stringify((await call(`/rooms/${spec.roomId}/projection?audience=spectator`, { spectator: spec.token })).body);
    const playerJson = JSON.stringify((await playerView(A)).p);
    const leaks = (json) => unused.filter((n) => json.includes(`"${n}"`));
    check("I the TV's projection carries no unused answer and no aliases", specJson.length > 100 && leaks(specJson).length === 0 && !specJson.includes("aliases"), leaks(specJson).slice(0, 5).join(", "));
    check("I a player's projection carries no unused answer and no aliases", leaks(playerJson).length === 0 && !playerJson.includes("aliases"), leaks(playerJson).slice(0, 5).join(", "));
    const cached = await K.evaluate(async () => { if (!("caches" in window)) return []; const urls = []; for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) urls.push(r.url); return urls; });
    check("I nothing from the room is in the app-shell cache", !cached.some((u) => /\/rooms\b|projection|intents/.test(u)), cached.filter((u) => /rooms/.test(u)).slice(0, 3).join(", "));
  }

  // ---------- I2. The shipped app never carries the bank (review 6808081378, 4) ----------
  {
    const canaries = bankCanaries();
    const found = (text) => canaries.filter((c) => text.toLowerCase().includes(c.toLowerCase()));
    check("I2 the canary check finds a canary when one is there (self-test)", found(`x ${canaries[canaries.length - 1]} y`).length === 1);
    const dist = process.env.MCHEZO_WEB_DIST || "apps/web/dist";
    const files = [];
    const walk = (d) => { for (const f of readdirSync(d)) { const p = joinPath(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
    walk(dist);
    const leaks = files.flatMap((f) => found(readFileSync(f, "latin1")).map((c) => `${f}: ${c}`));
    check(`I2 no built file carries the bank (${files.length} files, ${canaries.length} canaries)`, files.length > 5 && leaks.length === 0, leaks.slice(0, 3).join(" | "));
    const paths = ["/", "/index.html", "/sw.js", "/manifest.webmanifest", "/games", "/health", ...readdirSync(joinPath(dist, "assets")).map((f) => `/assets/${f}`)];
    const pub = [];
    for (const p of paths) { const r = await fetch(`${BASE}${p}`); pub.push({ p, status: r.status, text: await r.text() }); }
    const pubLeaks = pub.flatMap((r) => found(r.text).map((c) => `${r.p}: ${c}`));
    check(`I2 no public response carries the bank (${pub.length} responses)`, pub.every((r) => r.status === 200) && pubLeaks.length === 0, `${pub.filter((r) => r.status !== 200).map((r) => `${r.p} ${r.status}`).join(", ")} ${pubLeaks.slice(0, 3).join(" | ")}`);
  }

  // ---------- J. Two rooms ----------
  {
    const b = await stB();
    const a = (await playerView(K)).st;
    check("J the rooms keep their own cups (A 3, B 7)", a.startHearts === 3 && b.state.startHearts === 7);
    const bNames = (b.state.log ?? []).filter((e) => e.kind === "accepted").map((e) => e.answer);
    const bHolder = b.state.turn?.player === zawadi.playerId ? zawadi : juma;
    const bAns = freshAnswer(b.state.category.id, new Set([...bNames, ...used]));
    const sentB = await call(`/rooms/${roomB.roomId}/intents`, { token: bHolder.recoveryToken, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: roomB.roomId, gameInstanceId: startB.body.gameId, action: "jebena-answer", payload: { turn: b.state.turn.n, text: bAns.typed } } } });
    const aLog = JSON.stringify((await playerView(K)).st.log);
    check("J an answer in room B counts there and never shows in room A", sentB.body.accepted === true && !aLog.includes(`"${bAns.name}"`) && !JSON.stringify((await playerView(K)).p).includes("Zawadi"));
    // Seven cups on a 320 px phone (Juma's seat in room B, Christmas look): they fit, the names and the countdown stay legible.
    const jCtx = await phoneCtx(320, { look: "christmas" });
    const J = await jCtx.newPage();
    await J.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await J.evaluate((x) => { sessionStorage.setItem("cgn_roomId", x.roomId); sessionStorage.setItem("cgn_playerId", x.playerId); sessionStorage.setItem("cgn_token", x.token); }, { roomId: roomB.roomId, playerId: juma.playerId, token: juma.recoveryToken });
    await J.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
    // Watching (Zawadi's turn), so the seat list shows both players' seven cups too.
    const seven = await soon("J room B at 320 px: seven cups in Juma's own row and the seat list", async () => { if (!(await J.getByTestId("jr-watch").isVisible())) return null; const c = await cupsIn(J.getByTestId("jr-my-hearts")); return c.of === 7 ? c : null; }, 30000);
    if (seven) {
      const fit = await J.evaluate(() => {
        const vw = window.innerWidth;
        const inside = (el) => { const r = el.getBoundingClientRect(); return r.left >= -0.5 && r.right <= vw + 0.5; };
        const rows = [...document.querySelectorAll(".mz-cini-row")];
        const names = [...document.querySelectorAll(".mz-jr-seat__name")];
        const clock = document.querySelector('[data-testid="jr-clock-seconds"]');
        return { rows: rows.length, rowsInside: rows.every(inside), namesInside: names.every(inside), namesWide: names.every((n) => n.getBoundingClientRect().width >= 60), clock: clock ? inside(clock) && clock.getBoundingClientRect().height >= 24 : true, scroll: document.documentElement.scrollWidth <= vw + 1 };
      });
      check("J seven cups fit 320 px: every cup row, name and the countdown inside the screen; no sideways scroll", fit.rows >= 3 && fit.rowsInside && fit.namesInside && fit.namesWide && fit.clock && fit.scroll, JSON.stringify(fit));
      await sleep(800); // let the screen's fade-in finish
      await shot(J, "jr-seven-cups-320-christmas");
    }
    await jCtx.close();
  }

  // ---------- E/F. Timeouts, offline, reload, elimination ----------
  // Keku answers whenever he holds the jebena; Amina and Baraka let time run out.
  let offlineDone = false, reloadDone = false, firstTimeoutChecked = false, outShot = false, tvShot = false;
  /** Every life lost (seat, the slot that broke), from the server's own counts; `final` ended the match. */
  const lost = [];
  const turnTotal = 10_500;
  for (let guard = 0; guard < 40; guard++) {
    const now = await playerView(K);
    if (now.g.status === "finished" || !now.st.turn) break;
    const h = now.st.turn.player;
    const n = now.st.turn.n;
    if (h === seat.K.playerId) {
      await namedNow();
      const ans = freshAnswer(now.st.category.id, used);
      const r = await typeAndSend(K, ans.typed);
      used.add(ans.name);
      if (!r || (r.turn && r.turn.n === n)) check(`E Keku's answer “${ans.typed}” passed`, false, JSON.stringify(r?.attempt ?? {}));
      if (!reloadDone && !tvShot) { await shot(TV, "jr-tv-1440"); tvShot = true; }
      continue;
    }
    const hp = pageOf[h];
    const heartsBefore = now.st.order.find((s) => s.id === h).hearts;
    const catBefore = now.st.category.id;
    if (!offlineDone && h === seat.A.playerId) {
      // E: Amina's phone drops on her turn; what she typed never reaches the server, and the clock keeps running.
      offlineDone = true;
      const ans = freshAnswer(now.st.category.id, used);
      await soon("E Amina's turn: her field has focus", async () => (await A.evaluate(() => document.activeElement?.id)) === "jr-input");
      await shot(A, "jr-myturn-320-christmas");
      aminaAway = true;
      await aCtx.setOffline(true);
      await A.keyboard.type(ans.typed);
      await A.keyboard.press("Enter");
      await soon("E offline: the send says it didn't get through", async () => A.getByTestId("jr-error").isVisible().catch(() => false) || A.getByTestId("mz-send-error").isVisible().catch(() => false), 20000);
      await soon("E the turn times out while she's away (no free life)", async () => (await playerView(K)).st.turn?.n !== n, turnTotal + 8000);
      lost.push({ seat: h, slot: heartsBefore - 1 });
      // Stay away a little longer than a live break lasts (lib/cups.ts LIVE_BREAK_MS = 3 s): coming back is a resync.
      await sleep(4500);
      aminaAway = false;
      await aCtx.setOffline(false);
      await soon("E back online, Amina's phone catches up with one cup fewer, shown broken", async () => { const c = await cupsIn(A.getByTestId("jr-my-hearts")); return c.cups === heartsBefore - 1 && c.broken === 3 - (heartsBefore - 1); }, 20000);
      // (Other players' cups may break live on her phone meanwhile; only her own lost cup must not replay.)
      check("E the resync showed her broken cup without replaying the break", (await breaks(A)).filter((x) => x.seat === seat.A.playerId).length === 0, JSON.stringify(await breaks(A)));
      await sleep(2500);
      const back = (await playerView(K)).st;
      check("E reconnecting never resubmitted what she typed offline", !(back.log ?? []).some((e) => e.kind === "accepted" && e.answer === ans.name) && back.order.find((s) => s.id === seat.A.playerId).answers === now.st.order.find((s) => s.id === seat.A.playerId).answers);
      continue;
    }
    if (!reloadDone && h === seat.B.playerId) {
      // A reload (Keku's, mid-game) keeps the game.
      reloadDone = true;
      await K.reload({ waitUntil: "domcontentloaded" });
      await soon("E after a reload, Keku is back in the game, same category", async () => (await K.getByTestId("jr-category").getAttribute("data-category")) === catBefore);
      {
        const srvA = (await playerView(K)).st.order.find((x) => x.id === seat.A.playerId).hearts;
        await soon("E after the reload, Keku's seat list shows Amina's cups as the server has them (broken ones still broken)", async () => { const c = await cupsIn(K.getByTestId(`jr-seat-${seat.A.playerId}`)); return c.cups === srvA && c.broken === 3 - srvA; });
        check("E the reload replayed no break", (await breaks(K)).length === 0, JSON.stringify(await breaks(K)));
      }
      await shot(B, "jr-myturn-390-reduced");
    }
    // Let this turn time out.
    const timedOut = await soon(`E ${nameOf[h]} times out (turn ${n})`, async () => { const x = await playerView(K); return x.st.turn?.n !== n || x.g.status === "finished" ? x : null; }, turnTotal + 6000);
    if (!timedOut) break;
    const tsOrder = timedOut.st.order ?? timedOut.st.standings ?? [];
    const row = tsOrder.find((s) => s.id === h);
    if (row && row.hearts < heartsBefore) lost.push({ seat: h, slot: row.hearts, final: timedOut.g.status === "finished" }); // (the F checks use the server's own totals)
    if (!firstTimeoutChecked && timedOut.g.status !== "finished") {
      firstTimeoutChecked = true;
      check("E a timeout costs exactly one life (the server's count)", row.hearts === heartsBefore - 1, `${heartsBefore} → ${row.hearts}`);
      check("E a timeout starts a new category", timedOut.st.category.id !== catBefore);
      check("E and the jebena passes", timedOut.st.turn.player !== h);
      const slot = heartsBefore - 1;
      await soon(`E ${nameOf[h]}'s phone: ${slot} whole, the lost cup broken in its slot, "${slot} of 3 cups remaining"`, async () => { const c = await cupsIn(hp.getByTestId("jr-my-hearts")); return c.cups === slot && c.whole === slot && c.broken === 3 - slot && c.label === `${slot} of 3 cups remaining`; });
      await soon(`E ${nameOf[h]}'s own row: exactly that cup broke, once`, async () => { const b = (await breaks(hp)).filter((x) => x.surface === "hud" && x.slot === slot); return b.length === 1 && b[0].seat === h && b[0].cups === slot; }, 5000);
      await soon("E the TV seat shows the cup lost", async () => { const c = await cupsIn(TV.getByTestId(`jr-seat-${h}`)); return c.cups === slot && c.broken === 3 - slot && c.text.includes(`${slot}/3`); });
      await soon("E the TV: that one cup broke, once, in its slot", async () => (await breaks(TV)).filter((x) => x.seat === h && x.slot === slot).length === 1, 5000);
      const hudAnim = (await breaks(hp)).find((x) => x.surface === "hud" && x.slot === slot)?.anim;
      check(`E the break plays only with full motion (${nameOf[h]}: ${hp === B ? "reduced, so still" : "full"})`, hp === B ? hudAnim === "none" : hudAnim === "mz-cini-tip", String(hudAnim));
      await shot(TV, "jr-tv-cup-broken-1440");
      // Repeated views (pushes, clock ticks) never break a cup twice: checked on every page at the end of the match (F).
    }
    if (row?.out && timedOut.g.status !== "finished" && !outShot) {
      outShot = true;
      await soon(`F ${nameOf[h]} is out and watches the rest`, async () => hp.getByTestId("jr-out").isVisible());
      await soon(`F ${nameOf[h]}'s own row: every cup broken, "0 of 3 cups: out"`, async () => { const c = await cupsIn(hp.getByTestId("jr-my-hearts")); return c.cups === 0 && c.whole === 0 && c.broken === 3 && c.label === "0 of 3 cups: out"; });
      check(`F ${nameOf[h]}'s last cup broke on their own row`, (await breaks(hp)).some((x) => x.surface === "hud" && x.seat === h && x.slot === 0));
      check("F the out screen says the cups are broken", /All your cups are broken/.test(await hp.locator("body").innerText()) && noHearts(await hp.locator("body").innerText()));
      check("F the out screen: no sideways scroll", await noSideScroll(hp));
      await shot(hp, `jr-out-${hp === A ? "320-christmas" : "390"}`);
      await soon("F the TV marks them out: every cup broken, and \"Out\"", async () => { const c = await cupsIn(TV.getByTestId(`jr-seat-${h}`)); return (await TV.getByTestId(`jr-seat-${h}`).getAttribute("data-out")) === "true" && c.broken === 3 && c.whole === 0 && /Out/.test(c.text); });
    }
  }

  // ---------- F. Results ----------
  const fin = await soon("F the match finishes: one player left", async () => { const x = await playerView(K); return x.g?.status === "finished" ? x : null; }, 30000);
  if (fin) {
    const stds = fin.st.standings ?? [];
    check("F Keku kept the jebena (place 1, still in)", stds[0]?.id === seat.K.playerId && stds[0].place === 1 && !stds[0].out && fin.st.end === "last-standing");
    for (const [who, p] of [["Keku", K], ["Amina", A], ["Baraka", B]]) {
      await soon(`F ${who} sees the results`, async () => p.getByTestId("jr-results").isVisible(), 20000);
      const rows = await p.getByTestId("jr-standings").locator("li").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-testid").replace("jr-row-", ""), pts: Number(e.querySelector(".mz-jr-row__pts")?.textContent ?? "NaN") })));
      const raw = fin.g.rawScores ?? {};
      check(`F ${who}'s results equal the server's scores`, rows.length === 3 && rows.every((r) => raw[r.id] === r.pts), JSON.stringify(rows));
    }
    check("F the winner's line says they kept the jebena", /Kept the jebena/.test(await K.getByTestId(`jr-row-${seat.K.playerId}`).innerText()));
    {
      const keeper = stds[0];
      const krow = await cupsIn(K.getByTestId(`jr-row-${seat.K.playerId}`));
      check("F the results row: the keeper's cups, whole as the server has them", krow.whole === keeper.hearts && new RegExp(`${keeper.hearts} of 3 cups whole`).test(krow.text), krow.text);
      const outRow = await K.getByTestId(`jr-row-${stds[stds.length - 1].id}`).innerText();
      check("F an eliminated row says every cup broke", /Out: every cup broken/.test(outRow), outRow);
      check("F the scoring is explained in cups", /plus 10 for every cup still whole/.test(await K.getByTestId("jr-howscore").innerText()));
      check("F no hearts on any results screen", noHearts(await K.locator("body").innerText()) && noHearts(await A.locator("body").innerText()) && noHearts(await B.locator("body").innerText()));
    }
    // Every break on every page was a real lost life, once; the TV (always watching, always live) broke each one.
    // The lives lost come from the server's own totals: each timeout broke the next cup down (3 → slot 2, then 1, then 0),
    // including any the driver's loop didn't watch (one during Amina's resync, or Keku's turn running out under load).
    {
      const all = stds.flatMap((r) => Array.from({ length: r.timeouts }, (_, i) => ({ seat: r.id, slot: 2 - i })));
      // The life that ended the match (the runner-up's last cup) can end it in the same view, so the TV may go straight to the final screen.
      const runnerUp = stds.find((r) => r.place === 2);
      const finalKey = runnerUp ? `${runnerUp.id}:0` : "";
      const lost = all.map((l) => ({ ...l, final: `${l.seat}:${l.slot}` === finalKey }));
      const lostKeys = new Set(lost.map((l) => `${l.seat}:${l.slot}`));
      for (const [who, p] of [["Keku", K], ["Amina", A], ["Baraka", B], ["the TV", TV]]) {
        const b = await breaks(p);
        const keys = b.map((x) => `${x.surface}:${x.seat}:${x.slot}`);
        const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
        const stray = b.filter((x) => !lostKeys.has(`${x.seat}:${x.slot}`) || x.cups !== x.slot);
        check(`F ${who}: every cup that broke was a real lost life, in its slot, once`, dup.length === 0 && stray.length === 0, `${b.length} breaks; ${JSON.stringify({ dup, stray }).slice(0, 200)}`);
      }
      const live = lost.filter((l) => !l.final);
      const tv = await breaks(TV);
      check(`F the TV broke exactly one cup for each life lost during play (${live.length})`, tv.length >= live.length && live.every((l) => tv.filter((x) => x.seat === l.seat && x.slot === l.slot).length === 1), `${tv.length} breaks for ${live.length} lives: ${JSON.stringify(tv.map((x) => [x.seat.slice(0, 4), x.slot]))}`);
      const bLog = await breaks(B);
      check("F reduced motion (Baraka): cups break without animating", bLog.length > 0 && bLog.every((x) => x.anim === "none"), JSON.stringify(bLog.map((x) => x.anim)));
      check("F full motion (the TV): each break animates", tv.length > 0 && tv.every((x) => x.anim === "mz-cini-tip"), JSON.stringify(tv.map((x) => x.anim)));
    }
    check("F results at 320: no sideways scroll", await noSideScroll(A));
    await shot(K, "jr-results-390");
    await shot(A, "jr-results-320-christmas");
    await soon("F the TV shows the final standings: Keku wins", async () => /Keku wins/.test(await TV.locator("body").innerText()), 20000);
    await shot(TV, "jr-tv-final-1440");
    await TV.getByRole("button", { name: "Post-game review" }).click();
    await soon("F the TV's post-game review: Keku kept the jebena, with the places", async () => /Keku kept the jebena/.test(await TV.getByTestId("tv-jr-review").innerText()) && (await TV.getByTestId("tv-jr-review").locator("li").count()) === 3, 15000);
    await shot(TV, "jr-tv-review-1440");
  }

  // ---------- G. Play again: the same cups, all whole; leaving breaks nothing; back to the lobby ----------
  for (const p of [K, A, B, TV]) await clearBreaks(p);
  await soon("G the host has Play again", async () => K.getByTestId("next-play-again").isVisible());
  await K.getByTestId("next-play-again").click();
  await soon("G Play again's briefing: everyone starts with 3 cups again", async () => /starts with 3 cups/.test(await K.getByTestId("briefing-hearts").innerText()), 20000);
  const again = (await playerView(K)).p.games.filter((g) => g.gameId === "jebena-rush").slice(-1)[0];
  check("G the rematch carries the same settings", again?.settings?.hearts === 3 && again.status === "briefing");
  await passBriefing([K, A, B]);
  const replay = await soon("G the replay is on", async () => { const x = await playerView(K); return x.g?.id !== gid && x.g?.status === "playing" ? x : null; }, 20000);
  if (replay) {
    for (const [who, p] of [["Keku", K], ["Amina", A], ["Baraka", B]]) {
      await soon(`G ${who} starts the replay with three whole cups`, async () => { const c = await cupsIn(p.getByTestId("jr-my-hearts")); return c.cups === 3 && c.whole === 3 && c.broken === 0; }, 15000);
    }
    await soon("G the TV: everyone's cups whole again", async () => { const c = await cupsIn(TV.getByTestId("tv-jr-seats")); return c.whole === 9 && c.broken === 0; }, 15000);
    // Amina and Baraka leave the replay: a sit-out is not a lost life, so no cup breaks; Keku is left and keeps the jebena.
    for (const [who, p] of [["Amina", A], ["Baraka", B]]) {
      const r = await api(p, "POST", "/rooms/:room/intents", { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: ROOM, gameInstanceId: replay.g.id, action: "abstain", payload: {} } });
      check(`G ${who} leaves the replay`, r.body.accepted === true, JSON.stringify(r.body).slice(0, 160));
    }
    const fin2 = await soon("G with both of them gone, the replay ends: Keku kept the jebena", async () => { const x = await playerView(K); return x.g?.id === replay.g.id && x.g.status === "finished" ? x : null; }, 20000);
    if (fin2) check("G both leavers sat out; Keku kept all 3 cups", fin2.st.standings.filter((r) => r.satOut).length === 2 && fin2.st.standings.find((r) => r.id === seat.K.playerId)?.hearts === 3);
    await sleep(1500);
    const logs = await Promise.all([K, A, B, TV].map(breaks));
    check("G leaving broke no cup on any screen (phones or TV)", logs.every((l) => l.length === 0), JSON.stringify(logs).slice(0, 200));
  }
  for (const [who, p] of [["Keku", K], ["Amina", A], ["Baraka", B]]) {
    const backBtn = p.getByTestId("show-back-to-lobby");
    await backBtn.waitFor({ timeout: 15000 }).catch(() => {});
    if (await backBtn.isVisible().catch(() => false)) await backBtn.click();
    await soon(`G ${who} is back in the lobby`, async () => p.getByTestId("lobby-dock").isVisible(), 15000);
  }
  // ---------- K. A Family Cup never offers Jebena Rush ----------
  {
    const cupCtx = await phoneCtx(390);
    const C = await cupCtx.newPage();
    await C.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await C.getByTestId("home-host").click();
    await C.getByPlaceholder("e.g. Auntie June").fill("Cupholder");
    await C.getByTestId("host-kind-cup").click();
    await C.getByRole("button", { name: "Host a game" }).click();
    await C.getByTestId("choose-game").waitFor({ timeout: 15000 });
    await C.getByTestId("choose-game").click();
    await C.getByTestId("choose-sheet").waitFor({ timeout: 5000 });
    const listed = await C.locator('[data-testid^="select-game-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    check("K a Cup's picker leaves Jebena Rush out (and lists the others)", !listed.includes("select-game-jebena-rush") && listed.length >= 10, `${listed.length} games`);
    const cupStart = await api(C, "POST", "/rooms/:room/games", { gameId: "jebena-rush", official: false });
    check("K the server refuses Jebena Rush in a Cup (409 CASUAL_ONLY)", cupStart.status === 409 && cupStart.body.code === "CASUAL_ONLY", JSON.stringify(cupStart.body).slice(0, 160));
  }

  // ---------- Z. A survivor with no accepted answer is a winner, never "missed" ----------
  {
    const z = await zeroRoom;
    const zs = z.g?.state?.standings ?? [];
    const top = zs.find((r) => r.id === z.survivor?.playerId);
    const part = z.g?.outcome?.participation?.[z.survivor?.playerId] ?? {};
    check("Z room C ran to the end: the survivor tried (an action), had no answer accepted, and kept the jebena", !z.error && z.g?.status === "finished" && part.done === 0 && part.actions >= 1 && top?.place === 1 && top.answers === 0 && z.g.state.end === "last-standing", JSON.stringify({ error: z.error, status: z.g?.status, tried: z.tried, part, top }).slice(0, 260));
    const openAs = async (who, look, width) => {
      const c = await phoneCtx(width, { look });
      const p = await c.newPage();
      await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
      await p.evaluate((x) => { sessionStorage.setItem("cgn_roomId", x.roomId); sessionStorage.setItem("cgn_playerId", x.playerId); sessionStorage.setItem("cgn_token", x.token); }, { roomId: z.roomC.roomId, playerId: who.playerId, token: who.recoveryToken });
      await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
      return p;
    };
    if (z.survivor) {
      const W = await openAs(z.survivor, "everyday", 390);
      await soon("Z the survivor's results: first place, with a winner's line", async () => { const t = await W.getByTestId("results-you").innerText(); return /You came 1st of 2/.test(t) && /That was you|You won\./.test(t); }, 20000);
      check("Z ... and never \"You missed this one\"", !/missed this one/i.test(await W.locator("body").innerText()), (await W.getByTestId("results-hero").innerText()).replace(/\s+/g, " ").slice(0, 200));
      await shot(W, "jr-results-zero-answers-winner-390");
      const O = await openAs(z.other, "christmas", 320);
      await soon("Z the player who did nothing at all is truthfully told they missed it", async () => /You missed this one/.test(await O.getByTestId("results-hero").innerText()), 20000);
    }
  }
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 4).join(" | "));
} finally {
  for (const c of ctxs) await c.close().catch(() => {});
  await browser.close().catch(() => {});
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
