// Stage 9.3: Spectrum, one complete cooperative casual-room journey in real
// browsers (docs/stage9/stage93.md). Real time (clue 60 s, guesses 45 s,
// reveal 8 s), its own server. Phones: Keku hosts (390 px, Everyday look,
// full motion), Amina (320 px, Christmas look), Baraka (390 px, reduced
// motion); a TV spectator (1440 px); a second room playing at the same time.
//   A  lobby and library: Spectrum is in the casual picker; the library tags
//      it "Co-op: one team score"; no sideways scroll at 320/390.
//   B  briefing: the common goal, the rotating roles and "Give a clue, not
//      the target number" on every phone and the TV; everyone gets ready.
//   C  round 1: only the clue-giver sees the target (DOM and projection);
//      future pairs are nowhere; an over-long clue can't be sent; a clue with
//      digits is sent with Enter; a guesser works the scale with the
//      keyboard only (Home, Page Up, arrows, End) and nothing is sent until
//      Enter; another uses the touch nudges and Send; the reveal explains
//      the target, the team's guess, the distance and the points in words on
//      every phone and the TV; each guess stays on its own phone; a stale
//      send changes nothing.
//   D  round 2: a reload keeps the game; the clue-giver goes offline, types
//      and presses Send: nothing arrives, and coming back online resends
//      nothing; the clue phase runs out on the server clock: "No clue in
//      time · 0 points" everywhere.
//   E  rounds 3–4: a non-ASCII clue and an HTML-looking clue are shown as
//      plain text.
//   F  the team result: the same total on every phone and the TV as the
//      server's outcome.team; no winner, place, ribbon, confetti or Cup
//      credit anywhere; every round explained; the TV's final view and
//      review; no projection carries per-player scores.
//   G  Play again: a fresh match with its own briefing, cancelled by the
//      host; the lobby's last-game card and the TV's "Tonight so far" say
//      "Team result". A new match from the lobby starts clean; two players
//      sit the rest out (two taps), and the match ends early, keeping what
//      was earned and saying why.
//   H  looks and motion: Everyday and Christmas; reduced motion stops the
//      marker slide; meaning in words and shapes.
//   I  privacy: the built app and its public responses never carry the pack.
//   J  two rooms: each has its own match.
//   K  a Family Cup never offers it, and the server refuses a Cup start.
// Starts ITS OWN server. Usage: node scripts/check-spectrum.mjs
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { memoryLinkOf, openMemoryBook } from "./lib/memory-book.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage9/screenshots/${name}.png`), fullPage: false });

const DATA = mkdtempSync(joinPath(tmpdir(), "mz-sp-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE; delete env.MCHEZO_LIFECYCLE_SCALE;
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
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(path.replace(":room", roomId), { method, headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { method, path, body });
const seatOf = (page) => page.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") }));
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** The server's own truth (targets, pairs, guesses), from its saved room file: for checks only. */
function truth(roomId, gid) {
  const p = joinPath(DATA, `${roomId}.json`);
  if (!existsSync(p)) return null;
  const snap = JSON.parse(readFileSync(p, "utf8"));
  const room = snap.room ?? snap;
  const g = (room.games ?? []).find((x) => x.id === gid);
  return g ? { game: g, st: g.extra } : null;
}

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
/**
 * Stage 10.2 (docs/stage10/stage102.md §3): the team line a finished match should show, worked out here from the
 * server's team result with the driver's own copy of the rules (not the app's selector): only a completed match with
 * every round revealed; 40 of 40, else the rounds exactly on target; team words only.
 */
function expectedSpectrumLine(t) {
  if (!t || t.end !== "completed" || !t.roundsPlanned || t.rounds?.length !== t.roundsPlanned) return null;
  if (t.max > 0 && t.total === t.max && t.rounds.every((r) => r.reason === "scored")) return `${t.max} out of ${t.max}. The whole team was on one wavelength.`;
  const ex = t.rounds.filter((r) => r.reason === "scored" && r.distance === 0).map((r) => r.roundNo).sort((a, b) => a - b);
  if (!ex.length) return null;
  if (ex.length === 1) return `Round ${ex[0]} landed exactly on the target.`;
  return `Rounds ${ex.slice(0, -1).join(", ")} and ${ex.at(-1)} ${ex.length === 2 ? "both" : "all"} landed exactly on the target.`;
}
/** Under the result: below the result hero and the What's next panel, so its controls stay where they were. */
async function underResult(page) {
  const box = (id) => page.getByTestId(id).first().boundingBox().catch(() => null);
  const [m, hero, next] = [await box("results-moment"), await box("results-hero"), await box("whats-next")];
  return !!m && !!hero && m.y >= hero.y + hero.height - 1 && (!next || m.y >= next.y + next.height - 1);
}

async function phoneCtx(width, { look, reducedMotion } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, ...(reducedMotion ? { reducedMotion: "reduce" } : {}) });
  if (look) await ctx.addInitScript((l) => { try { localStorage.setItem("mz_look", l); } catch { /* none */ } }, look);
  ctxs.push(ctx);
  return ctx;
}
const WINNER_WORDS = /\bwins\b|won this|You came|tied for|\b(1st|2nd|3rd)\b|personal best|Cup point|Kept the|share the win/i;

try {
  // ---------- setup ----------
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
  const ctxOf = { [seat.K.playerId]: kCtx, [seat.A.playerId]: aCtx, [seat.B.playerId]: bCtx };
  const nameOf = { [seat.K.playerId]: "Keku", [seat.A.playerId]: "Amina", [seat.B.playerId]: "Baraka" };
  const playerView = async (page) => {
    const p = (await api(page, "GET", "/rooms/:room/projection?audience=player")).body;
    const g = (p.myGames ?? []).filter((x) => x.gameId === "spectrum").slice(-1)[0];
    return { p, g, st: g?.state ?? {} };
  };
  const tvView = async () => (await call(`/rooms/${ROOM}/projection?audience=tv`)).body;

  // ---------- J (setup): a second room playing at the same time ----------
  const roomB = (await call("/rooms", { body: { name: "Room B", kind: "casual" } })).body;
  const zawadi = (await call(`/rooms/${roomB.roomId}/join`, { body: { displayName: "Zawadi", asHost: true, hostClaimToken: roomB.hostClaimToken } })).body;
  const juma = (await call("/rooms/join-by-code", { body: { joinCode: roomB.joinCode, displayName: "Juma" } })).body;
  const projB = async (tok) => (await call(`/rooms/${roomB.roomId}/projection?audience=player`, { token: tok })).body;
  const pB0 = await projB(zawadi.recoveryToken);
  const startB = await call(`/rooms/${roomB.roomId}/games`, { token: zawadi.recoveryToken, body: { gameId: "spectrum", official: false, roster: pB0.readiness?.wouldPlay, attempt: { id: randomUUID(), sessionRevision: pB0.session?.revision ?? 0 }, season: pB0.contentSeason } });
  check("J room B: Spectrum starts", startB.status === 201, JSON.stringify(startB.body).slice(0, 200));
  for (const s of [zawadi, juma]) await call(`/rooms/${roomB.roomId}/intents`, { token: s.recoveryToken, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: roomB.roomId, gameInstanceId: startB.body.gameId, action: "briefing-ready", payload: { ready: true } } } });
  const gB = async () => ((await projB(zawadi.recoveryToken)).myGames ?? []).find((g) => g.id === startB.body.gameId);
  await soon("J room B: playing, round 1", async () => (await gB())?.status === "playing" && (await gB())?.state?.roundNo === 1);

  // ---------- A. Library and lobby ----------
  {
    const libCtx = await phoneCtx(390);
    const L = await libCtx.newPage();
    await L.goto(`${BASE}/library`, { waitUntil: "domcontentloaded" });
    await soon("A the library lists Spectrum, tagged Co-op: one team score", async () => /Co-op: one team score/.test(await L.getByTestId("mz-lib-coop-spectrum").innerText()));
    check("A library at 390: no sideways scroll", await noSideScroll(L));
    await shot(L, "sp-library-390");
    await libCtx.close();
  }
  await K.getByTestId("choose-game").click();
  const pick = K.getByTestId("select-game-spectrum");
  await pick.waitFor({ timeout: 10000 });
  check("A the casual picker lists Spectrum (practice only)", /practice only/i.test(await pick.innerText()), (await pick.innerText()).replace(/\s+/g, " ").slice(0, 120));
  await pick.click();
  check("A lobby, host 390: no sideways scroll", await noSideScroll(K));
  check("A lobby, guest 320: no sideways scroll", await noSideScroll(A));
  await shot(K, "sp-lobby-host-390");

  // ---------- B. Briefing ----------
  await K.locator('[data-testid="lobby-dock"] button.mz-key--block').first().click();
  for (const [who, p, tid] of [["Keku", K, "briefing"], ["Amina", A, "briefing"], ["Baraka", B, "briefing"], ["the TV", TV, "tv-briefing"]]) {
    await soon(`B ${who}: the briefing explains the team goal and "Give a clue, not the target number"`, async () => {
      const t = await p.getByTestId(tid).innerText();
      return /One team, one score/.test(t) && /Give a clue, not the target number/.test(t) && /can't be changed/.test(t) && /out of 40/.test(t);
    });
    // Review 6815908707: the timing lines name this game's phases, never another game's ("the impostor's guess").
    const timing = await p.getByTestId("briefing-timing").innerText();
    check(`B ${who}: the briefing's timing names Spectrum's own phases, never an impostor`,
      /60 seconds for the clue/.test(timing) && /45 seconds for everyone's guesses/.test(timing) && /8 seconds for each reveal/.test(timing) && !/impostor/i.test(await p.getByTestId(tid).innerText()), timing.replace(/\s+/g, " "));
  }
  await shot(A, "sp-briefing-320-christmas");
  // The phone's timing lines sit below the fold: centre them, clear of the Ready dock, for the picture (review 6815908707).
  await K.getByTestId("briefing-timing").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await shot(K, "sp-briefing-timing-390");
  await shot(TV, "sp-briefing-tv-1440");
  await passBriefing([K, A, B]);

  // ---------- C. Round 1 ----------
  let v = await soon("C play: round 1, clue phase", async () => { const x = await playerView(K); return x.g?.status === "playing" && x.st.phase === "clue" && x.st.roundNo === 1 ? x : null; });
  const gid = v.g.id;
  const t1 = await soon("C the server's truth is readable (driver only)", async () => truth(ROOM, gid));
  const futureIds = t1.st.rounds.slice(1).map((r) => r.pairId);
  const g1 = v.st.current.giver;
  const G1 = pageOf[g1];
  const target1 = t1.st.rounds[0].target;
  const others1 = Object.keys(pageOf).filter((id) => id !== g1);
  await soon(`C the clue-giver (${nameOf[g1]}) alone sees the target, ${target1}`, async () => (await G1.getByTestId("sp-target").innerText()) === String(target1) && (await G1.getByTestId("sp-giver-scale-target").getAttribute("data-value")) === String(target1));
  for (const id of others1) {
    const p = pageOf[id];
    await soon(`C ${nameOf[id]} waits for ${nameOf[g1]}'s clue`, async () => /is thinking of a clue/.test(await p.getByTestId("sp-watch").innerText()));
    check(`C ${nameOf[id]}'s phone shows no target`, (await p.getByTestId("sp-target").count()) === 0 && (await p.locator('[data-testid$="-target"]').count()) === 0);
    const pj = JSON.stringify((await playerView(p)).g);
    check(`C ${nameOf[id]}'s projection has no target and no future pair`, !/"target":/.test(pj) && futureIds.every((f) => !pj.includes(f)));
  }
  {
    const tj = JSON.stringify(await tvView());
    check("C the TV projection has no target and no future pair", !/"target":/.test(tj) && futureIds.every((f) => !tj.includes(f)));
    await soon(`C the TV: ${nameOf[g1]} is thinking of a clue; no target marker`, async () => (await TV.getByTestId("tv-sp-status").innerText()).includes(nameOf[g1]) && (await TV.getByTestId("tv-sp-scale-target").count()) === 0);
    await soon("C the TV shows a running clock", async () => /\d+ s/.test(await TV.getByTestId("tv-sp-clock").innerText()));
  }
  check("C clue-giver phone: no sideways scroll", await noSideScroll(G1));
  await shot(G1, `sp-giver-clue-${G1 === A ? "320-christmas" : "390"}`);
  await shot(TV, "sp-tv-clue-1440");
  // An over-long clue can't be sent; a clue with digits is fine (D-S92-03).
  await G1.getByTestId("sp-clue-input").fill("x".repeat(81));
  await soon("C an 81-character clue can't be sent (too long)", async () => (await G1.getByTestId("sp-clue-send").isDisabled()) && /too long/.test(await G1.getByTestId("sp-clue-help").innerText()));
  await G1.getByTestId("sp-clue-input").fill("");
  await G1.getByTestId("sp-clue-input").focus();
  await G1.keyboard.type("a 10-minute walk");
  await G1.keyboard.press("Enter");
  v = await soon("C the clue with digits is sent with Enter: guessing starts", async () => { const x = await playerView(K); return x.st.phase === "guess" && x.st.current?.clue === "a 10-minute walk" ? x : null; });
  const [ga, gb] = others1;
  const GA = pageOf[ga], GB = pageOf[gb];
  for (const id of others1) await soon(`C ${nameOf[id]} sees the clue as text`, async () => (await pageOf[id].getByTestId("sp-clue-text").innerText()) === "“a 10-minute walk”");
  await soon("C the TV shows the clue and the count", async () => /a 10-minute walk/.test(await TV.getByTestId("tv-sp-clue").innerText()) && /0 of 2 guesses in/.test(await TV.getByTestId("tv-sp-count").innerText()));
  // Keyboard only on the first guesser: Home, Page Up, arrows, End; nothing is sent until Enter.
  const r1 = GA.getByTestId("sp-guess-range");
  await r1.focus();
  await GA.keyboard.press("Home");
  check("C keyboard: Home moves the guess to 0", (await GA.getByTestId("sp-draft").innerText()) === "0");
  await GA.keyboard.press("PageUp"); await GA.keyboard.press("PageUp");
  check("C keyboard: Page Up twice moves it to 20", (await GA.getByTestId("sp-draft").innerText()) === "20");
  await GA.keyboard.press("ArrowRight"); await GA.keyboard.press("ArrowRight"); await GA.keyboard.press("ArrowLeft");
  check("C keyboard: arrows move it by 1", (await GA.getByTestId("sp-draft").innerText()) === "21");
  await GA.keyboard.press("PageDown");
  check("C keyboard: Page Down moves it by 10", (await GA.getByTestId("sp-draft").innerText()) === "11");
  await GA.keyboard.press("End");
  check("C keyboard: End moves it to 100", (await GA.getByTestId("sp-draft").innerText()) === "100");
  const aim = (target1 + 2 > 100 ? target1 - 2 : target1 + 2);
  await GA.keyboard.press("Home");
  for (let i = 0; i < Math.floor(aim / 10); i++) await GA.keyboard.press("PageUp");
  for (let i = 0; i < aim % 10; i++) await GA.keyboard.press("ArrowRight");
  check(`C keyboard: the draft reads ${aim} and says where it sits`, (await GA.getByTestId("sp-draft").innerText()) === String(aim) && (await r1.getAttribute("aria-valuetext"))?.startsWith(String(aim)));
  check("C the scale's accessible name names both ends", /^Your guess\. From .+ \(0\) to .+ \(100\)$/.test((await r1.getAttribute("aria-label")) ?? ""), await r1.getAttribute("aria-label"));
  await sleep(600);
  check("C moving the scale sent nothing (the server has no guess yet)", (await playerView(GA)).st.me?.myGuess === undefined);
  await GA.keyboard.press("Enter");
  await soon(`C ${nameOf[ga]}'s guess (${aim}) is locked in`, async () => /Your guess: \d+ · locked in/.test(await GA.getByTestId("sp-locked").innerText()) && (await playerView(GA)).st.me?.myGuess === aim);
  await shot(GA, `sp-guess-locked-${GA === A ? "320-christmas" : "390"}`);
  // Touch nudges and Send on the second guesser.
  const aimB = target1 - 4 < 0 ? target1 + 4 : target1 - 4;
  let draftB = 50;
  while (draftB !== aimB) {
    const d = aimB - draftB;
    const btn = d >= 10 ? "sp-nudge-up-10" : d <= -10 ? "sp-nudge-down-10" : d > 0 ? "sp-nudge-up-1" : "sp-nudge-down-1";
    await GB.getByTestId(btn).click();
    draftB += d >= 10 ? 10 : d <= -10 ? -10 : d > 0 ? 1 : -1;
  }
  check(`C touch: the nudges move ${nameOf[gb]}'s draft to ${aimB}`, (await GB.getByTestId("sp-draft").innerText()) === String(aimB));
  check(`C ${nameOf[gb]}'s guess screen: no sideways scroll`, await noSideScroll(GB));
  await shot(GB, `sp-guess-${GB === A ? "320-christmas" : GB === B ? "390-reduced" : "390"}`);
  await GB.getByTestId("sp-guess-send").click();
  v = await soon("C every guess in: the reveal", async () => { const x = await playerView(K); return x.st.phase === "reveal" ? x : null; });
  const rev1 = v.st.revealed.at(-1);
  const expectAgg = Math.floor((aim + aimB) / 2 + 0.5);
  check("C the team's guess is the middle of the two guesses (half up)", rev1.target === target1 && rev1.aggregate === expectAgg, JSON.stringify(rev1));
  for (const [id, p] of Object.entries(pageOf)) {
    await soon(`C ${nameOf[id]}'s reveal explains it in words`, async () => {
      const line = await p.getByTestId("sp-reveal-line").innerText();
      return line.includes(`Target ${target1}`) && line.includes(`team guess ${expectAgg}`) && line.includes(`${rev1.distance} away`) && line.includes(`+${rev1.points} point`) && line.includes("for the team");
    });
  }
  await soon("C the TV reveal: the target and the team's guess, in words and on the scale", async () => (await TV.getByTestId("tv-sp-reveal").innerText()).includes(`Target ${target1}`) && (await TV.getByTestId("tv-sp-scale-target").getAttribute("data-value")) === String(target1) && (await TV.getByTestId("tv-sp-scale-team").getAttribute("data-value")) === String(expectAgg));
  check(`C ${nameOf[gb]}'s phone shows their own guess, never ${nameOf[ga]}'s`, (await GB.getByTestId("sp-reveal-scale-mine").getAttribute("data-value")) === String(aimB) && !JSON.stringify((await playerView(GB)).g).includes(`"myGuess":${aim}`));
  check(`C ${nameOf[g1]} (the clue-giver) sees no one's individual guess`, (await G1.getByTestId("sp-reveal-scale-mine").count()) === 0 && !/"myGuess"/.test(JSON.stringify((await playerView(G1)).g)));
  const tvj = JSON.stringify(await tvView());
  check("C the TV never carries an individual guess", !/"myGuess"|"guesses":\{/.test(tvj));
  await shot(K, "sp-reveal-390");
  await shot(TV, "sp-tv-reveal-1440");
  // A stale send (round 1's guess phase) changes nothing.
  const before = JSON.stringify(truth(ROOM, gid)?.st.rounds[0]);
  const stale = await api(GA, "POST", "/rooms/:room/intents", { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: ROOM, gameInstanceId: gid, action: "spectrum-guess", payload: { round: 1, value: 3, phaseKey: "r1:guess" } } });
  check("C a stale send is refused and changes nothing", stale.body.accepted === false && JSON.stringify(truth(ROOM, gid)?.st.rounds[0]) === before, JSON.stringify(stale.body));

  // ---------- D. Round 2: reload, offline, the clue runs out ----------
  v = await soon("D round 2, clue phase", async () => { const x = await playerView(K); return x.st.roundNo === 2 && x.st.phase === "clue" ? x : null; }, 15000);
  const g2 = v.st.current.giver;
  check("D the clue-giver role moved on", g2 !== g1);
  const G2 = pageOf[g2];
  const reloader = Object.keys(pageOf).find((id) => id !== g2);
  await pageOf[reloader].reload({ waitUntil: "domcontentloaded" });
  await soon(`D ${nameOf[reloader]} reloads and is back in round 2`, async () => /Round 2 of 4/.test(await pageOf[reloader].getByTestId("sp-round").innerText()), 20000);
  await ctxOf[g2].setOffline(true);
  await G2.getByTestId("sp-clue-input").fill("typed while offline");
  await G2.getByTestId("sp-clue-send").click();
  await sleep(4000);
  check("D offline: the clue never reached the server", truth(ROOM, gid)?.st.rounds[1].clue === null);
  await ctxOf[g2].setOffline(false);
  await sleep(5000);
  check("D back online: nothing was resent", truth(ROOM, gid)?.st.rounds[1].clue === null);
  v = await soon("D the clue phase runs out on the server clock: the round is skipped", async () => { const x = await playerView(K); return x.st.phase === "reveal" && x.st.revealed.at(-1)?.reason === "no-clue" ? x : null; }, 75000);
  for (const [id, p] of Object.entries(pageOf)) await soon(`D ${nameOf[id]}: "No clue in time · 0 points"`, async () => /No clue in time · target \d+ · 0 points/.test(await p.getByTestId("sp-reveal-line").innerText()));
  await soon("D the TV: No clue in time", async () => /No clue in time/.test(await TV.getByTestId("tv-sp-reveal").innerText()));

  // ---------- E. Rounds 3 and 4: clues shown as text ----------
  /** Touch nudges from wherever the draft is to `to` (as in C). */
  const nudgeTo = async (Q, to) => {
    let at = Number(await Q.getByTestId("sp-draft").innerText());
    for (let i = 0; i < 40 && at !== to; i++) {
      const d = to - at;
      await Q.getByTestId(d >= 10 ? "sp-nudge-up-10" : d <= -10 ? "sp-nudge-down-10" : d > 0 ? "sp-nudge-up-1" : "sp-nudge-down-1").click();
      at = Number(await Q.getByTestId("sp-draft").innerText());
    }
    return at;
  };
  const playRound = async (roundNo, clueText, onTarget = false) => {
    const x = await soon(`E round ${roundNo}, clue phase`, async () => { const y = await playerView(K); return y.st.roundNo === roundNo && y.st.phase === "clue" ? y : null; }, 20000);
    const g = x.st.current.giver;
    const P = pageOf[g];
    await P.getByTestId("sp-clue-input").fill(clueText);
    await P.getByTestId("sp-clue-send").click();
    await soon(`E round ${roundNo}: guessing`, async () => (await playerView(K)).st.phase === "guess");
    for (const id of Object.keys(pageOf).filter((y) => y !== g)) {
      const Q = pageOf[id];
      await soon(`E round ${roundNo}: ${nameOf[id]} sees the clue exactly as typed, as text`, async () => (await Q.getByTestId("sp-clue-text").innerText()) === `“${clueText}”` && (await Q.getByTestId("sp-clue-text").locator("b, a, script").count()) === 0);
      if (onTarget) {
        // Stage 10.2: everyone's guess on the target, so the team's guess (the middle) lands on it exactly.
        const target = truth(ROOM, gid)?.st.rounds[roundNo - 1]?.target;
        const at = await nudgeTo(Q, target);
        check(`E round ${roundNo}: ${nameOf[id]}'s guess is on the target (${target})`, typeof target === "number" && at === target, String(at));
      }
      await Q.getByTestId("sp-guess-send").click();
    }
    await soon(`E round ${roundNo}: the reveal`, async () => (await playerView(K)).st.phase === "reveal" || (await playerView(K)).g?.status === "finished");
  };
  await playRound(3, "ቡና በጣም ሞቃት", true);
  await playRound(4, "<b>hot</b> & cold");

  // ---------- F. The team result ----------
  const fin = await soon("F the match finishes after four rounds", async () => { const x = await playerView(K); return x.g?.status === "finished" ? x : null; }, 20000);
  const team = fin?.g.outcome?.team;
  check("F the server's one team result: four rounds, out of 40", team?.rounds?.length === 4 && team.max === 40 && team.end === "completed", JSON.stringify(team).slice(0, 200));
  check("F no projection carries per-player scores", fin?.g.rawScores === undefined && fin?.g.myScore === 0 && (await tvView()).games.filter((g) => g.gameId === "spectrum").every((g) => g.rawScores === undefined));
  for (const [id, p] of Object.entries(pageOf)) {
    await soon(`F ${nameOf[id]} sees the team result: ${team?.total} out of 40`, async () => (await p.getByTestId("sp-team-total").getAttribute("data-total")) === String(team.total) && (await p.getByTestId("results-headline").innerText()) === `Team result: ${team.total} out of 40`, 20000);
    const text = await p.getByTestId("sp-results").innerText();
    check(`F ${nameOf[id]}'s results name no winner, place or credit`, !WINNER_WORDS.test(text) && (await p.getByTestId("results-ribbon").count()) === 0 && (await p.getByTestId("results-you").count()) === 0 && (await p.getByTestId("results-confetti").count()) === 0, (text.match(WINNER_WORDS) ?? [""])[0]);
    check(`F ${nameOf[id]}'s results explain all four rounds`, (await p.getByTestId("sp-rounds").locator("li").count()) === 4 && /No clue in time/.test(await p.getByTestId("sp-rounds-2").innerText()));
    check(`F ${nameOf[id]}'s results say "4 of 4 rounds played", not "Everyone finished"`, (await p.getByTestId("mz-outcome-headline").innerText()) === "4 of 4 rounds played." && !/Everyone finished/.test(text));
    check(`F ${nameOf[id]}'s results: no sideways scroll`, await noSideScroll(p));
  }
  const wantSp = expectedSpectrumLine(team);
  check("10.2 F round 3 landed exactly on the target, so the team line is due", team?.rounds?.[2]?.distance === 0 && /^Rounds? .*\b3\b.* landed exactly on the target\.$/.test(wantSp ?? ""), `${wantSp} ${JSON.stringify(team?.rounds?.map((r) => [r.roundNo, r.reason, r.distance, r.points]))}`);
  for (const [id, p] of Object.entries(pageOf)) {
    await soon(`10.2 F ${nameOf[id]}: “${wantSp}”`, async () => (await p.getByTestId("results-moment").innerText().catch(() => "")) === wantSp, 15000);
  }
  check("10.2 F the line sits under the result and What's next", await underResult(K));
  check("10.2 F the line names nobody and no winner, place or Cup", !WINNER_WORDS.test(wantSp ?? "") && !Object.values(nameOf).some((n) => (wantSp ?? "").includes(n)));
  await A.reload({ waitUntil: "domcontentloaded" });
  await soon("10.2 F after a reload, Amina's phone: the same line", async () => (await A.getByTestId("results-moment").innerText().catch(() => "")) === wantSp, 20000);
  await shot(K, "sp-results-390");
  await shot(A, "sp-results-320-christmas");
  await soon("F the TV's final view: the team result, no winner or standings", async () => /Team result: \d+ out of 40/.test(await TV.getByTestId("tv-team-result").innerText()) && (await TV.getByTestId("tv-winner").count()) === 0 && (await TV.getByTestId("tv-last-standings").count()) === 0, 20000);
  check("F the TV final names no winner and says Team result, not standings", !WINNER_WORDS.test(await TV.locator("body").innerText()) && (await TV.getByTestId("tv-mode").innerText()).toLowerCase() === "team result" && !/standings/i.test(await TV.locator("body").innerText()), await TV.getByTestId("tv-mode").innerText());
  await soon(`10.2 F the TV's final view: “${wantSp}”`, async () => (await TV.getByTestId("tv-results-moment").innerText().catch(() => "")) === wantSp, 15000);
  await TV.reload({ waitUntil: "domcontentloaded" });
  await soon("10.2 F after a reload, the TV's final view: the same line", async () => (await TV.getByTestId("tv-results-moment").innerText().catch(() => "")) === wantSp, 20000);
  await shot(TV, "sp-tv-final-1440");
  await TV.getByTestId("tv-dir-review").click();
  await soon("F the TV's post-game review: every round of the team's match", async () => (await TV.getByTestId("tv-sp-review-rounds").locator("li").count()) === 4, 15000);
  await shot(TV, "sp-tv-review-1440");

  // ---------- G. Play again (cancelled), the lobby, a new match, an early ending ----------
  await soon("G the host has Play again", async () => K.getByTestId("next-play-again").isVisible());
  await K.getByTestId("next-play-again").click();
  await soon("G Play again opens a fresh briefing", async () => /Give a clue, not the target number/.test(await K.getByTestId("briefing").innerText()), 20000);
  const rematch = (await playerView(K)).p.games.filter((g) => g.gameId === "spectrum").slice(-1)[0];
  check("G the rematch is a new match, linked to the last one", rematch?.status === "briefing" && rematch.id !== gid);
  await K.getByTestId("briefing-cancel").click();
  const confirmCancel = K.getByRole("button", { name: /cancel/i }).last();
  if (await confirmCancel.isVisible().catch(() => false)) await confirmCancel.click().catch(() => {});
  await soon("G the rematch is cancelled", async () => !((await playerView(K)).p.games ?? []).some((g) => g.status === "briefing"), 15000);
  for (const [who, p] of [["Keku", K], ["Amina", A], ["Baraka", B]]) {
    const backBtn = p.getByTestId("show-back-to-lobby");
    if (await backBtn.isVisible().catch(() => false)) await backBtn.click();
    await soon(`G ${who} is back in the lobby`, async () => p.getByTestId("lobby-dock").isVisible(), 15000);
  }
  await soon("G the lobby's last game: the team result, no place", async () => /Team result: \d+ out of 40/.test(await A.getByTestId("last-game-card").innerText()) && (await A.getByTestId("last-game-you").innerText()) === "You played on the team." && !WINNER_WORDS.test(await A.getByTestId("last-game-card").innerText()));
  await shot(A, "sp-lobby-last-game-320-christmas");
  if (await TV.getByTestId("tv-dir-lobby").isVisible().catch(() => false)) await TV.getByTestId("tv-dir-lobby").click();
  await soon("G the TV's Tonight so far: Spectrum's team result, no winner", async () => /Spectrum[^\n]*Team result: \d+ out of 40/.test(await TV.getByTestId("tv-recent").innerText()) && !WINNER_WORDS.test(await TV.getByTestId("tv-recent").innerText()), 20000);
  await shot(TV, "sp-tv-lobby-1440");
  // A new match from the lobby starts clean.
  await K.getByTestId("choose-game").click();
  await K.getByTestId("select-game-spectrum").click();
  await K.locator('[data-testid="lobby-dock"] button.mz-key--block').first().click();
  await passBriefing([K, A, B]);
  const v2 = await soon("G the new match starts clean: round 1, no clue, team 0", async () => { const x = await playerView(K); return x.g?.id !== gid && x.g?.status === "playing" && x.st.roundNo === 1 && x.st.total === 0 && x.st.current?.clue === null ? x : null; });
  const gid2 = v2.g.id;
  check("G nothing carried over: no guess and no revealed round", (v2.st.revealed ?? []).length === 0 && v2.st.me?.myGuess === undefined);
  // Two players sit the rest out (two taps each); fewer than two are left.
  const leavers = Object.keys(pageOf).filter((id) => id !== seat.K.playerId);
  for (const id of leavers) {
    const p = pageOf[id];
    await p.getByTestId("sp-sitout").click();
    await soon(`G ${nameOf[id]} is asked to confirm`, async () => p.getByTestId("sp-sitout-confirm").isVisible());
    if (id === leavers[0]) await shot(p, `sp-sitout-confirm-${p === A ? "320-christmas" : "390"}`);
    await p.getByTestId("sp-sitout-yes").click();
    if (id === leavers[0]) await soon(`G ${nameOf[id]} has left and watches`, async () => /You left this game/.test(await p.getByTestId("sp-watch").innerText()) || (await playerView(K)).g?.status === "finished");
  }
  const early = await soon("G fewer than two left: the match ends early", async () => { const x = await playerView(K); return x.g?.id === gid2 && x.g.status === "finished" ? x : null; }, 15000);
  check("G the early ending keeps what was earned and says why", early?.g.outcome?.team?.end === "too-few-players");
  await soon("G Keku's results say why it ended early", async () => /Fewer than two players were left/.test(await K.getByTestId("results-team-end").innerText()), 15000);
  {
    // Review 6815908707: said once, never contradicted by "Everyone finished", the partial score and round count explicit.
    const t = await K.getByTestId("sp-results").innerText();
    const once = (t.match(/Fewer than two players were left/g) ?? []).length;
    check("G the early ending is explained once, never 'Everyone finished'; score and rounds explicit", once === 1 && !/Everyone finished/.test(t) && /Team result: \d+ out of 40/.test(t) && /\d+ of 4 rounds/.test(t), `${once}× · ${(await K.getByTestId("mz-outcome-headline").innerText())}`);
  }
  check("10.2 G the early ending's facts call for no line", expectedSpectrumLine(early?.g.outcome?.team) === null);
  await soon("10.2 G the early ending: no moment line on Keku's results (none carried over)", async () => (await K.getByTestId("sp-results").isVisible()) && (await K.getByTestId("results-moment").count()) === 0, 15000);
  check("10.2 G the TV shows no moment line for the early ending", (await TV.getByTestId("tv-results-moment").count()) === 0);
  await shot(K, "sp-results-early-390");

  // ---------- 10.2 repair (review 6831760093, S102-R1): Keku's Memory Book after the early ending ----------
  {
    // The last leaver's sit-out is logged after the match ends, so the room's newest event is private to them.
    // Keku's ledger is current, yet its newest visible event is older than the room's seq: the screen used to
    // wait forever on "Checking for the latest finished game…". Spectrum still isn't saved (NOT_IN_MEMORY_BOOK).
    const led = (await call(`/rooms/${ROOM}/ledger?watermark=1`, { token: seat.K.token })).body;
    const pk = (await call(`/rooms/${ROOM}/projection?audience=player`, { token: seat.K.token })).body;
    const evs = Array.isArray(led?.events) ? led.events : [];
    const fin = evs.filter((e) => e.type === "game-finished").at(-1);
    const newestSeen = Math.max(0, ...evs.map((e) => e.seq));
    check("R1 Keku's ledger carries the room's seq as its watermark", Number.isInteger(led?.seq) && led.seq === pk.seq, `${led?.seq} vs ${pk.seq}`);
    check("R1 the room's newest event is hidden from Keku (someone else's sit-out), and his last finished game is this match", newestSeen < led.seq && fin?.gameInstanceId === gid2, `newest seen ${newestSeen}, seq ${led?.seq}, finished ${fin?.gameInstanceId}`);
    check("R1 no one else's sit-out reaches Keku's ledger", !evs.some((e) => e.type === "player-abstained" && e.playerId !== seat.K.playerId));
    const memCtx = await phoneCtx(390, { look: "everyday" });
    const M = await openMemoryBook(memCtx, BASE, seat.K);
    await M.locator(".mz-memory__text").fill("We nearly had round 2");
    const seen = await soon("R1 Keku's Memory Book says plainly the last game was a team game, not 'Checking…'", async () => { const x = await memoryLinkOf(M); return x.state === "unavailable" ? x : null; }, 15000);
    check("R1 it names Spectrum, says team games aren't saved yet, and keeps Add off", !!seen && /Spectrum/.test(seen.text) && /team games aren.t saved to the Memory Book yet/.test(seen.text) && seen.addDisabled === true && /next game that isn't a team game/.test(seen.hint), JSON.stringify(seen));
    await sleep(2500);
    const later = await memoryLinkOf(M);
    check("R1 it stays that way (no 'Checking…' after a few seconds)", later.state === "unavailable" && !/Checking/.test(later.text), JSON.stringify(later));
    await shot(M, "sp-memory-team-game-390");
    await M.reload({ waitUntil: "domcontentloaded" });
    await soon("R1 after a reload, the same: unavailable, not 'Checking…'", async () => { const x = await memoryLinkOf(M); return x.state === "unavailable" && x.addDisabled === true; }, 15000);
    const refused = await call(`/rooms/${ROOM}/memory`, { token: seat.K.token, body: { day: 1, text: "We nearly had round 2", sourceEventIds: [fin?.eventId] } });
    check("R1 the server still refuses a Spectrum entry (409 NOT_IN_MEMORY_BOOK): no Spectrum saving in this repair", refused.status === 409 && refused.body?.code === "NOT_IN_MEMORY_BOOK", `${refused.status} ${JSON.stringify(refused.body).slice(0, 120)}`);
    await memCtx.close();
  }

  // ---------- H. Looks and motion ----------
  check("H Amina's phone uses the Christmas look", (await A.locator("[data-mz-theme]").first().getAttribute("data-mz-theme")) === "christmas");
  check("H Keku's phone uses the Everyday look", (await K.locator("[data-mz-theme]").first().getAttribute("data-mz-theme")) === "everyday");
  check("H Baraka's phone is in reduced motion", (await B.locator("[data-mz-motion]").first().getAttribute("data-mz-motion")) === "reduced");

  // ---------- I. The shipped app never carries the pack ----------
  {
    const canaries = ["sp-pairs-1", "sp-cold-hot", "sp-underrated-overrated", "How much fuss people make about it.", "How spooky it feels."];
    const found = (text) => canaries.filter((c) => text.includes(c));
    check("I the canary check finds a canary when one is there (self-test)", found("x sp-cold-hot y").length === 1);
    const dist = process.env.MCHEZO_WEB_DIST || "apps/web/dist";
    const files = [];
    const walk = (d) => { for (const f of readdirSync(d)) { const p = joinPath(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
    walk(dist);
    const leaks = files.flatMap((f) => found(readFileSync(f, "latin1")).map((c) => `${f}: ${c}`));
    check(`I no built file carries the pack (${files.length} files)`, files.length > 5 && leaks.length === 0, leaks.slice(0, 3).join(" | "));
    const paths = ["/", "/sw.js", "/manifest.webmanifest", "/games", ...readdirSync(joinPath(dist, "assets")).map((f) => `/assets/${f}`)];
    const pub = [];
    for (const p of paths) { const r = await fetch(`${BASE}${p}`); pub.push({ p, status: r.status, text: await r.text() }); }
    const pubLeaks = pub.flatMap((r) => found(r.text).map((c) => `${r.p}: ${c}`));
    check(`I no public response carries the pack (${pub.length} responses)`, pub.every((r) => r.status === 200) && pubLeaks.length === 0, pubLeaks.slice(0, 3).join(" | "));
  }

  // ---------- J. Two rooms ----------
  {
    // Nobody acted in room B: its rounds ran out on its own clock, untouched by room A's clues and guesses.
    const b = await gB();
    const revealedB = b?.state?.revealed ?? [];
    check("J room B ran its own match: its own clock, no clue or guess from room A", !!b && roomB.roomId !== ROOM && revealedB.length >= 1 && revealedB.every((r) => r.reason === "no-clue" && r.clue === null && r.guesses === 0) && (b.state?.total ?? 0) === 0, JSON.stringify(revealedB.map((r) => r.reason)));
  }

  // ---------- K. A Family Cup never offers Spectrum ----------
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
    check("K a Cup's picker leaves Spectrum out", !listed.includes("select-game-spectrum") && listed.length >= 10, `${listed.length} games`);
    const cupStart = await api(C, "POST", "/rooms/:room/games", { gameId: "spectrum", official: false });
    check("K the server refuses Spectrum in a Cup (409 CASUAL_ONLY)", cupStart.status === 409 && cupStart.body.code === "CASUAL_ONLY", JSON.stringify(cupStart.body).slice(0, 160));
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
