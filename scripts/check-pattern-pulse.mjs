// Stage 5 (S5-C2): Pattern Pulse, a complete game on three phones and a TV.
//   Practice-only (the lobby says so; the server refuses Official); the
//   briefing explains it; six self-paced rounds through each phone's own UI;
//   the pattern is on the memorising phone only, and hides at the server's
//   deadline; undo and clear; a failed send says so and keeps the entry; a
//   reload mid-round never shows the pattern again; a window nobody answers
//   is closed by the server clock (0 points) with nobody acting; reduced
//   motion gets the still row; sitting the rest out; a late joiner sees no
//   pattern; results on every phone equal the server's scores; the TV shows
//   counts only, then final standings and the review; no sideways scrolling.
// Isolated server, no content test mode. Time scale 0.5.
// Starts ITS OWN server. Usage: node scripts/check-pattern-pulse.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-pp-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, MCHEZO_LIFECYCLE_SCALE: "0.5" };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
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
async function api(path, opts) { const r = await call(path, opts); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; }
const NAMES = ["Keku", "Amina", "Bartholomew Otieno-Wanjiku"];
const room = await api("/rooms", { body: { name: "Pattern Pulse" } });
const seats = [];
{
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  seats.push({ name: NAMES[0], playerId: h.playerId, token: h.recoveryToken });
  for (const n of NAMES.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
}
const browser = await launchChromium();
const WIDTHS = [390, 375, 320];
async function phone(seat, width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, ...opts });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const tvGame = async () => (await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.at(-1);
const myGame = async (i) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seats[i].token })).myGames.at(-1);
const noSideways = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);
const LENGTHS = [3, 4, 5, 6, 7, 8];
const pts = (len, run) => run * 20 + (run === len ? 50 : 0);

/** Open the round, read the pattern from the memorise screen, wait for it to hide. */
async function openAndRead(p) {
  await p.getByTestId("mz-pp-open").click();
  await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
  const seq = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
  await p.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
  return seq;
}
async function tap(p, seq) { for (const s of seq) await p.getByTestId(`mz-pp-key-${s}`).click(); }
async function playRound(p, entryOf = (seq) => seq) {
  const seq = await openAndRead(p);
  await tap(p, entryOf(seq));
  await p.getByTestId("mz-pp-submit").click();
  await p.locator('[data-testid="mz-pp-ready"], [data-testid="mz-pp-done"], [data-testid="mz-pp-results"]').first().waitFor({ timeout: 10000 });
  return seq;
}

try {
  const pages = [];
  for (const [i, s] of seats.entries()) pages.push(await phone(s, WIDTHS[i], i === 1 ? { reducedMotion: "reduce" } : {}));
  const [keku, amina, bart] = pages;
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  const tvCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.joinCode);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });

  // ---- Practice-only, in the lobby and on the server.
  await keku.getByTestId("choose-game").click();
  await keku.getByTestId("select-game-pattern-pulse").click();
  await soon("lobby: Pattern Pulse is Practice only, and says why", async () => (await keku.getByTestId("mode-official").isDisabled()) && /practice-only until its Cup scoring is approved/.test(await keku.getByTestId("practice-only-note").innerText()));
  const off = await call(`/rooms/${room.roomId}/games`, { token: seats[0].token, body: { gameId: "pattern-pulse", official: true } });
  check("server: an official start is refused", off.status >= 400 && /practice-only/.test(off.body.error ?? ""), `${off.status} ${off.body.error}`);
  await keku.getByTestId("start-practice-pattern-pulse").click();
  await soon("briefing: every phone explains the game", async () => (await Promise.all(pages.map(async (p) => /tap it back in order/i.test(await text(p)) && /20 points per shape/.test(await text(p))))).every(Boolean));
  await amina.screenshot({ path: screenshotPath("docs/stage5/after/pp-briefing-375.png") });
  for (const p of pages) await p.getByTestId("briefing-ready").click();
  await soon("every phone: round 1 of 6, 3 shapes, ready when you are", async () => (await Promise.all(pages.map(async (p) => (await p.getByTestId("mz-pp-ready").count()) === 1 && /3 shapes/.test(await p.getByTestId("mz-pp-next").innerText())))).every(Boolean), 20000);
  await keku.screenshot({ path: screenshotPath("docs/stage5/after/pp-ready-390.png") });
  await soon("TV: Pattern Pulse live, counts only", async () => (await tv.getByTestId("tv-live-pattern-pulse").count()) === 1 && /0 of 3/.test(await tv.getByTestId("tv-live-progress").innerText()), 15000);

  // ---- Keku, round 1: the pattern on his phone only, then hidden by the server's clock.
  await keku.getByTestId("mz-pp-open").click();
  await keku.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
  const k1 = await keku.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
  const kekuServer = (await myGame(0)).state;
  check("memorise: the phone shows exactly the server's pattern for Keku (3 shapes)", k1.length === 3 && JSON.stringify(kekuServer.open?.pattern) === JSON.stringify(k1), `${k1} vs ${JSON.stringify(kekuServer.open)}`);
  check("memorise: each shape is named (shape + colour, not colour alone)", /circle|square|triangle|diamond|star|hexagon/.test(await keku.getByTestId("mz-pp-pattern").innerText()));
  check("memorise (full motion): the highlight sweep is on", (await keku.locator(".mz-pp-pattern--sweep").count()) === 1);
  await keku.screenshot({ path: screenshotPath("docs/stage5/after/pp-memorise-390.png") });
  const tvPub = JSON.stringify(await tvGame());
  check("privacy: the TV projection never has a pattern", !/"pattern"/.test(tvPub) && !/"open"/.test(tvPub));
  check("privacy: another player's projection never has Keku's pattern", !/"pattern"/.test(JSON.stringify(await myGame(1))));
  check("privacy: the TV screen shows no sequence", (await tv.locator('[data-testid="mz-pp-pattern"]').count()) === 0);
  await keku.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
  check("hidden: once the window passes the pattern is gone from the screen", (await keku.getByTestId("mz-pp-pattern").count()) === 0);
  check("hidden: …and from Keku's own projection", (await myGame(0)).state.open?.pattern === undefined);
  // Undo and clear.
  const wrong = (k1[0] + 1) % 6;
  await tap(keku, [wrong]);
  await keku.getByTestId("mz-pp-undo").click();
  check("undo removes the last shape", (await keku.locator(".mz-pp-slot--filled").count()) === 0);
  await tap(keku, k1.slice(0, 2));
  await keku.getByTestId("mz-pp-clear").click();
  check("clear empties the entry", (await keku.locator(".mz-pp-slot--filled").count()) === 0);
  await tap(keku, k1);
  check("a full entry: 'Lock it in', and every shape key is done", /Lock it in/.test(await keku.getByTestId("mz-pp-submit").innerText()) && await keku.getByTestId("mz-pp-key-0").isDisabled());
  await keku.screenshot({ path: screenshotPath("docs/stage5/after/pp-input-390.png") });
  await keku.getByTestId("mz-pp-submit").click();
  await soon("round 1 (Keku): all three right, +110, from the server", async () => /All 3 right: \+110/.test(await keku.getByTestId("mz-pp-last").innerText()));
  check("server: Keku's round 1 scored 110", (await myGame(0)).state.results[0].points === 110);

  // ---- Amina (reduced motion), round 1: the still row; two right, then a slip.
  await amina.getByTestId("mz-pp-open").click();
  await amina.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
  const stillOk = await amina.evaluate(() => {
    const row = document.querySelector('[data-testid="mz-pp-pattern"]');
    const cells = [...row.querySelectorAll("li")];
    return row.classList.contains("mz-pp-pattern--still") && cells.every((c) => getComputedStyle(c).animationName === "none") && cells.every((c) => /\d/.test(c.querySelector(".mz-pp-cell__n").textContent));
  });
  check("reduced motion: a still, numbered row (no animation), same window", stillOk);
  await amina.screenshot({ path: screenshotPath("docs/stage5/after/pp-memorise-reduced-375.png") });
  const a1 = await amina.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
  await amina.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
  await tap(amina, [a1[0], a1[1], (a1[2] + 1) % 6]);
  await amina.getByTestId("mz-pp-submit").click();
  await soon("round 1 (Amina): 2 of 3 before the first slip, +40", async () => /2 of 3 right before the first slip: \+40/.test(await amina.getByTestId("mz-pp-last").innerText()));

  // ---- Bartholomew (320), round 1: the send fails; the entry stays; a retry counts.
  const b1 = await openAndRead(bart);
  await tap(bart, b1);
  await bart.route("**/intents", (r) => r.abort("internetdisconnected"));
  await bart.getByTestId("mz-pp-submit").click();
  await soon("a failed send says it couldn't be confirmed, and keeps the entry", async () => /couldn’t confirm/.test(await bart.getByTestId("mz-pp-error").innerText()) && (await bart.locator(".mz-pp-slot--filled").count()) === 3 && (await bart.getByTestId("mz-pp-input").count()) === 1);
  check("a failed send: the server has no answer from Bartholomew", ((await myGame(2)).state.results ?? []).length === 0);
  await bart.screenshot({ path: screenshotPath("docs/stage5/after/pp-send-failed-320.png") });
  await bart.unroute("**/intents");
  await bart.getByTestId("mz-pp-submit").click();
  await soon("the retry counts: All 3 right, +110", async () => /All 3 right: \+110/.test(await bart.getByTestId("mz-pp-last").innerText()));

  // ---- A late joiner: in the room, not in the game, and never sees a pattern.
  const late = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: "Lulu" } });
  const lulu = await phone({ playerId: late.playerId, token: late.recoveryToken }, 390);
  await sleep(1500);
  check("a late joiner: no Pattern Pulse play screen", (await lulu.locator('[data-testid^="mz-pp-"]').count()) === 0);
  const luluProj = JSON.stringify(await api(`/rooms/${room.roomId}/projection?audience=player`, { token: late.recoveryToken }));
  check("a late joiner's projection has no pattern", !/"pattern"/.test(luluProj));
  await lulu.context().close();

  // ---- Bartholomew sits the rest out.
  await bart.getByTestId("mz-pp-sitout").click();
  await soon("sitting out: 'Sitting the rest out', with his total", async () => (await bart.getByTestId("mz-pp-done").count()) === 1 && /Sitting the rest out/.test(await text(bart)) && /110/.test(await bart.getByTestId("mz-pp-total").innerText()));
  check("sitting out: further opens are refused by the server", (await call(`/rooms/${room.roomId}/intents`, { token: seats[2].token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: (await tvGame()).id, action: "pulse-open", payload: { round: 1 } } } })).body.accepted === false);

  // ---- Keku, round 2: a reload during the answer window never shows the pattern again.
  const k2 = await openAndRead(keku);
  await keku.reload({ waitUntil: "domcontentloaded" });
  await soon("reload mid-round: back on the answer screen, round 2, no pattern", async () => (await keku.getByTestId("mz-pp-input").count()) === 1 && (await keku.getByTestId("mz-pp-memorise").count()) === 0 && /Round 2 of 6/.test(await keku.locator(".mz-mr-round").textContent()), 20000);
  await tap(keku, k2);
  await keku.getByTestId("mz-pp-submit").click();
  await soon("round 2 (Keku): all 4 right after the reload, +130", async () => /All 4 right: \+130/.test(await keku.getByTestId("mz-pp-last").innerText()));

  // ---- Amina, round 2: opens and walks away; the server's clock closes it.
  await openAndRead(amina);
  const openAt = Date.now();
  await soon("a window nobody answers: the server closes it as missed, with nobody acting", async () => (await amina.getByTestId("mz-pp-ready").count()) === 1 && /Round 2: Time ran out: no points/.test(await amina.getByTestId("mz-pp-last").innerText()), 30000);
  check("…after the answer window (≈ 9 s at this scale), not before", Date.now() - openAt > 7000, `${Date.now() - openAt}ms`);
  await amina.screenshot({ path: screenshotPath("docs/stage5/after/pp-missed-375.png") });

  // ---- Rounds 3–6 for Keku and Amina (Amina's last one wrong from the start).
  for (let r = 2; r < 6; r++) {
    await soon(`round ${r + 1}: ${LENGTHS[r]} shapes for Keku`, async () => new RegExp(`${LENGTHS[r]} shapes`).test(await keku.getByTestId("mz-pp-next").innerText()));
    await playRound(keku);
    await playRound(amina, (seq) => (r === 5 ? [(seq[0] + 1) % 6, ...seq.slice(1)] : seq));
    if (r === 2) await tv.screenshot({ path: screenshotPath("docs/stage5/after/pp-tv-live-1440.png") });
  }

  // ---- Results.
  await soon("results on every phone", async () => (await Promise.all(pages.map((p) => p.getByTestId("mz-pp-results").count()))).every((x) => x === 1), 30000);
  const g = await tvGame();
  const kExp = pts(3, 3) + pts(4, 4) + [5, 6, 7, 8].reduce((n, l) => n + pts(l, l), 0);
  const aExp = pts(3, 2) + 0 + [5, 6, 7].reduce((n, l) => n + pts(l, l), 0) + 0;
  const expected = { [seats[0].playerId]: kExp, [seats[1].playerId]: aExp, [seats[2].playerId]: 110 };
  check(`results: the server's scores are the plan's (${kExp}, ${aExp}, 110)`, Object.keys(expected).every((k) => g.rawScores[k] === expected[k]), JSON.stringify(g.rawScores));
  check("results: ended because everyone finished (or sat out); practice, not counted", g.outcome?.reason === "completed" && g.outcome?.countsOfficially === false && g.official === false, JSON.stringify(g.outcome));
  for (const [i, p] of pages.entries()) {
    const t = await text(p);
    check(`results ${WIDTHS[i]}px: how scoring works, no sideways scrolling`, /20 points for each shape/.test(t) && await noSideways(p));
  }
  check("results: Keku's six rounds recapped (his own patterns, now it's over)", (await keku.getByTestId("mz-pp-recap-round").count()) === 6);
  check("results: Amina's slipped last round says so", /The first one slipped: no points/.test(await text(amina)));
  await keku.screenshot({ path: screenshotPath("docs/stage5/after/pp-results-390.png"), fullPage: true });
  await soon("TV: final standings, then the review", async () => (await tv.getByTestId("tv-mode").getAttribute("data-mode")) === "final");
  await tv.screenshot({ path: screenshotPath("docs/stage5/after/pp-tv-final-1440.png") });
  await tv.getByTestId("tv-dir-review").click();
  await soon("TV review: the room's totals only", async () => /13 rounds played across the room, 10 of them perfect/.test(await tv.getByTestId("tv-pp-review").innerText()));
  check("privacy after the game: no pattern in the public projection", !/"pattern"|"answer"/.test(JSON.stringify(g)));
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "PATTERN PULSE ALL PASSED" : `PATTERN PULSE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
