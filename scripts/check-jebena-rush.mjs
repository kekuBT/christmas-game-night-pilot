// Stage 9.1: Jebena Rush, one complete casual-room match in real browsers
// (docs/stage9/stage91.md §8–§9, §12). Real time (10-second turns), its own
// server. Phones: Keku hosts (390 px, Everyday look, full motion), Amina
// (320 px, Christmas look), Baraka (390 px, reduced motion); a TV spectator
// (1440 px); a second room (Zawadi, Juma) playing at the same time.
//   A  lobby: Jebena Rush is practice-only in the picker; the host chooses
//      3/5/7 hearts (5 preselected); guests see the choice; a guest's change
//      is refused; no sideways scroll at 320/390.
//   B  briefing: the rules and "everyone starts with 3 hearts" on every
//      phone and the TV; everyone gets ready.
//   C  turns: the holder's field is focused; typing and Enter sends; Tab
//      reaches Send. Not in the bank, ambiguous and near-miss tries are
//      explained and keep the deadline; an accepted answer passes the jebena;
//      a repeat is "already named"; an alias and an accepted typo count under
//      their canonical names. The TV shows the category, holder, countdown,
//      hearts and last play.
//   D  integrity: an out-of-turn (spoofed) answer, a stale turn's and a
//      duplicate send change nothing; a late joiner watches and can't answer.
//   E  timeouts: one heart, a new category, the jebena passes; offline on
//      your turn costs the heart (no free life), and coming back never
//      resubmits what was typed offline; a reload keeps the game.
//   F  elimination to the finish: out players watch the rest; the last one
//      with hearts keeps the jebena; results on every phone equal the
//      server's scores; the TV's final review.
//   G  Play again keeps the hearts (its briefing says 3); the host cancels;
//      back to the lobby.
//   H  motion and looks: full motion animates steam; reduced motion keeps it
//      still; the urgency word is always there; Everyday and Christmas.
//   I  privacy: no projection carries the bank (aliases, unused answers), and
//      nothing from a room enters the app-shell cache.
//   J  two rooms: each has its own hearts, turns and answers.
// Starts ITS OWN server. Usage: node scripts/check-jebena-rush.mjs
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { freshAnswer, jebenaOracle } from "./lib/jebena-oracle.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage9/screenshots/${name}.png`), fullPage: false });

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
  ctxs.push(ctx);
  return ctx;
}
try {
  // ---------- setup: room A ----------
  const kCtx = await phoneCtx(390, { look: "everyday" });
  const K = await kCtx.newPage();
  const code = await host(K, "Keku");
  const aCtx = await phoneCtx(320, { look: "christmas" });
  const A = await aCtx.newPage();
  await join(A, "Amina", code);
  const bCtx = await phoneCtx(390, { reducedMotion: true });
  const B = await bCtx.newPage();
  await join(B, "Baraka", code);
  const tvCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

  // ---------- J (setup): room B, playing at the same time, with 7 hearts ----------
  const roomB = (await call("/rooms", { body: { name: "Room B", kind: "casual" } })).body;
  const zawadi = (await call(`/rooms/${roomB.roomId}/join`, { body: { displayName: "Zawadi", asHost: true, hostClaimToken: roomB.hostClaimToken } })).body;
  const juma = (await call("/rooms/join-by-code", { body: { joinCode: roomB.joinCode, displayName: "Juma" } })).body;
  const projB = async (tok) => (await call(`/rooms/${roomB.roomId}/projection?audience=player`, { token: tok })).body;
  const setB = await call(`/rooms/${roomB.roomId}/game-settings`, { token: zawadi.recoveryToken, body: { gameId: "jebena-rush", settings: { hearts: 7 }, baseRevision: (await projB(zawadi.recoveryToken)).session?.revision ?? 0 } });
  check("J room B: its host sets 7 hearts", setB.status === 200 && setB.body.lobbySettings?.["jebena-rush"]?.hearts === 7, JSON.stringify(setB.body).slice(0, 200));
  const pB0 = await projB(zawadi.recoveryToken);
  const startB = await call(`/rooms/${roomB.roomId}/games`, { token: zawadi.recoveryToken, body: { gameId: "jebena-rush", official: false, roster: pB0.readiness?.wouldPlay, attempt: { id: randomUUID(), sessionRevision: pB0.session?.revision ?? 0 }, season: pB0.contentSeason, settings: { hearts: 7 } } });
  check("J room B: Jebena Rush starts with 7 hearts", startB.status === 201, JSON.stringify(startB.body).slice(0, 200));
  for (const s of [zawadi, juma]) await call(`/rooms/${roomB.roomId}/intents`, { token: s.recoveryToken, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: roomB.roomId, gameInstanceId: startB.body.gameId, action: "briefing-ready", payload: { ready: true } } } });
  const stB = async () => ((await projB(zawadi.recoveryToken)).myGames ?? []).find((g) => g.id === startB.body.gameId);
  await soon("J room B: playing", async () => (await stB())?.status === "playing");

  // ---------- A. Lobby: pick Jebena Rush, choose hearts ----------
  await K.getByTestId("choose-game").click();
  const pick = K.getByTestId("select-game-jebena-rush");
  await pick.waitFor({ timeout: 10000 });
  check("A the picker lists Jebena Rush as practice-only", /practice only/i.test(await pick.innerText()), (await pick.innerText()).replace(/\s+/g, " ").slice(0, 120));
  await pick.click();
  await soon("A the host sees the hearts choice, 5 preselected", async () => (await K.getByTestId("lobby-hearts").getAttribute("data-hearts")) === "5");
  await soon("A guests see 5 hearts each", async () => (await A.getByTestId("lobby-hearts-guest").getAttribute("data-hearts")) === "5" && (await B.getByTestId("lobby-hearts-guest").getAttribute("data-hearts")) === "5");
  await K.getByTestId("lobby-hearts-3").click();
  await soon("A the host chose 3 hearts", async () => (await K.getByTestId("lobby-hearts").getAttribute("data-hearts")) === "3");
  await soon("A guests see the host's choice: 3 hearts each", async () => (await A.getByTestId("lobby-hearts-guest").getAttribute("data-hearts")) === "3" && /3 hearts/.test(await A.getByTestId("lobby-hearts-guest").innerText()));
  const guestSet = await api(A, "POST", "/rooms/:room/game-settings", { gameId: "jebena-rush", settings: { hearts: 7 }, baseRevision: (await playerView(A)).p.session?.revision ?? 0 });
  check("A a guest can't change the hearts (403)", guestSet.status === 403, JSON.stringify(guestSet));
  const badSet = await api(K, "POST", "/rooms/:room/game-settings", { gameId: "jebena-rush", settings: { hearts: 4 }, baseRevision: (await playerView(K)).p.session?.revision ?? 0 });
  check("A 4 hearts is refused (400)", badSet.status === 400, JSON.stringify(badSet));
  check("A lobby, host 390: no sideways scroll", await noSideScroll(K));
  check("A lobby, guest 320: no sideways scroll", await noSideScroll(A));
  await shot(K, "jr-lobby-host-390");
  await shot(A, "jr-lobby-guest-320-christmas");

  // ---------- B. Briefing ----------
  await K.locator('[data-testid="lobby-dock"] button.mz-key--block').first().click();
  for (const [who, p] of [["Keku", K], ["Amina", A], ["Baraka", B]]) {
    await soon(`B ${who}'s briefing says everyone starts with 3 hearts`, async () => /3 hearts/.test(await p.getByTestId("briefing-hearts").innerText()));
  }
  await soon("B the TV briefing says 3 hearts", async () => /3 hearts/.test(await TV.getByTestId("briefing-hearts").innerText()));
  check("B the briefing states 10 seconds a turn", /10 seconds for each turn/.test(await K.getByTestId("briefing-timing").innerText()), await K.getByTestId("briefing-timing").innerText());
  await shot(A, "jr-briefing-320-christmas");
  await passBriefing([K, A, B]);

  // ---------- C. Turns ----------
  let v = await soon("C play: a turn is on", async () => { const x = await playerView(K); return x.st.turn ? x : null; });
  const gid = v.g.id;
  check("C every player starts with 3 hearts", (v.st.order ?? []).every((s) => s.hearts === 3) && v.st.startHearts === 3);
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
  await soon("C the TV: category, holder, countdown and hearts", async () => {
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

  // ---------- J. Two rooms ----------
  {
    const b = await stB();
    const a = (await playerView(K)).st;
    check("J the rooms keep their own hearts (A 3, B 7)", a.startHearts === 3 && b.state.startHearts === 7);
    const bNames = (b.state.log ?? []).filter((e) => e.kind === "accepted").map((e) => e.answer);
    const bHolder = b.state.turn?.player === zawadi.playerId ? zawadi : juma;
    const bAns = freshAnswer(b.state.category.id, new Set([...bNames, ...used]));
    const sentB = await call(`/rooms/${roomB.roomId}/intents`, { token: bHolder.recoveryToken, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: roomB.roomId, gameInstanceId: startB.body.gameId, action: "jebena-answer", payload: { turn: b.state.turn.n, text: bAns.typed } } } });
    const aLog = JSON.stringify((await playerView(K)).st.log);
    check("J an answer in room B counts there and never shows in room A", sentB.body.accepted === true && !aLog.includes(`"${bAns.name}"`) && !JSON.stringify((await playerView(K)).p).includes("Zawadi"));
  }

  // ---------- E/F. Timeouts, offline, reload, elimination ----------
  // Keku answers whenever he holds the jebena; Amina and Baraka let time run out.
  let offlineDone = false, reloadDone = false, firstTimeoutChecked = false, outShot = false, tvShot = false;
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
      await aCtx.setOffline(true);
      await A.keyboard.type(ans.typed);
      await A.keyboard.press("Enter");
      await soon("E offline: the send says it didn't get through", async () => A.getByTestId("jr-error").isVisible().catch(() => false) || A.getByTestId("mz-send-error").isVisible().catch(() => false), 20000);
      await soon("E the turn times out while she's away (no free life)", async () => (await playerView(K)).st.turn?.n !== n, turnTotal + 8000);
      await aCtx.setOffline(false);
      await soon("E back online, Amina's phone catches up with one heart fewer", async () => (await A.getByTestId("jr-my-hearts").getAttribute("data-hearts")) === String(heartsBefore - 1), 20000);
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
      await shot(B, "jr-myturn-390-reduced");
    }
    // Let this turn time out.
    const timedOut = await soon(`E ${nameOf[h]} times out (turn ${n})`, async () => { const x = await playerView(K); return x.st.turn?.n !== n || x.g.status === "finished" ? x : null; }, turnTotal + 6000);
    if (!timedOut) break;
    const tsOrder = timedOut.st.order ?? timedOut.st.standings ?? [];
    const row = tsOrder.find((s) => s.id === h);
    if (!firstTimeoutChecked && timedOut.g.status !== "finished") {
      firstTimeoutChecked = true;
      check("E a timeout costs exactly one heart", row.hearts === heartsBefore - 1, `${heartsBefore} → ${row.hearts}`);
      check("E a timeout starts a new category", timedOut.st.category.id !== catBefore);
      check("E and the jebena passes", timedOut.st.turn.player !== h);
      await soon(`E ${nameOf[h]}'s phone shows ${heartsBefore - 1} hearts`, async () => (await hp.getByTestId("jr-my-hearts").getAttribute("data-hearts")) === String(heartsBefore - 1));
      await soon("E the TV seat shows the hearts lost", async () => (await TV.getByTestId(`jr-seat-${h}`).innerText()).includes(`${heartsBefore - 1}/3`));
    }
    if (row?.out && timedOut.g.status !== "finished" && !outShot) {
      outShot = true;
      await soon(`F ${nameOf[h]} is out and watches the rest`, async () => hp.getByTestId("jr-out").isVisible());
      check("F the out screen: no sideways scroll", await noSideScroll(hp));
      await shot(hp, `jr-out-${hp === A ? "320-christmas" : "390"}`);
      await soon("F the TV marks them out", async () => (await TV.getByTestId(`jr-seat-${h}`).getAttribute("data-out")) === "true");
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
    check("F results at 320: no sideways scroll", await noSideScroll(A));
    await shot(K, "jr-results-390");
    await shot(A, "jr-results-320-christmas");
    await soon("F the TV shows the final standings: Keku wins", async () => /Keku wins/.test(await TV.locator("body").innerText()), 20000);
    await shot(TV, "jr-tv-final-1440");
    await TV.getByRole("button", { name: "Post-game review" }).click();
    await soon("F the TV's post-game review: Keku kept the jebena, with the places", async () => /Keku kept the jebena/.test(await TV.getByTestId("tv-jr-review").innerText()) && (await TV.getByTestId("tv-jr-review").locator("li").count()) === 3, 15000);
    await shot(TV, "jr-tv-review-1440");
  }

  // ---------- G. Play again keeps the hearts; cancel; back to the lobby ----------
  await soon("G the host has Play again", async () => K.getByTestId("next-play-again").isVisible());
  await K.getByTestId("next-play-again").click();
  await soon("G Play again's briefing: everyone starts with 3 hearts again", async () => /3 hearts/.test(await K.getByTestId("briefing-hearts").innerText()), 20000);
  const again = (await playerView(K)).p.games.filter((g) => g.gameId === "jebena-rush").slice(-1)[0];
  check("G the rematch carries the same settings", again?.settings?.hearts === 3 && again.status === "briefing");
  await K.getByTestId("briefing-cancel").click();
  const confirmCancel = K.getByRole("button", { name: /cancel/i }).last();
  if (await confirmCancel.isVisible().catch(() => false)) await confirmCancel.click().catch(() => {});
  await soon("G the rematch is cancelled", async () => !((await playerView(K)).p.games ?? []).some((g) => g.status === "briefing"), 15000);
  for (const [who, p] of [["Amina", A], ["Baraka", B]]) {
    const backBtn = p.getByTestId("show-back-to-lobby");
    if (await backBtn.isVisible().catch(() => false)) await backBtn.click();
    await soon(`G ${who} is back in the lobby`, async () => p.getByTestId("lobby-dock").isVisible(), 15000);
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
