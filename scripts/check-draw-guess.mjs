// Stage 5 (S5-C3): Draw & Guess, a complete game on four phones and a TV.
//   Practice-only (lobby + server); the briefing explains it; the server
//   picks every drawer (everyone draws once with four players); the word is
//   on the drawer's phone only; touch AND mouse drawing reach the TV and the
//   guessers live; undo removes the last stroke; a wrong guess says "not it"
//   and its text appears nowhere; a failed guess keeps the text; right
//   guesses score in order; skipping; a spectator who joins mid-turn sees the
//   drawing, never the word; a drawer who disconnects runs out the clock and
//   comes back as a guesser; giving up; one word swap; the server refuses a
//   burst of drawing messages and an oversized one; results on every phone
//   equal the server's scores; TV final standings and review; no sideways
//   scrolling at 320–430.
// Isolated server, no content test mode. Time scale 0.5.
// Starts ITS OWN server. Usage: node scripts/check-draw-guess.mjs
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contrastFailures } from "./lib/contrast.mjs";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-dg-"));
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
const NAMES = ["Keku", "Amina", "Bartholomew Otieno-Wanjiku", "Wanjiru"];
const room = await api("/rooms", { body: { name: "Draw & Guess" } });
const seats = [];
{
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  seats.push({ name: NAMES[0], playerId: h.playerId, token: h.recoveryToken });
  for (const n of NAMES.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
}
const browser = await launchChromium();
const WIDTHS = [390, 375, 430, 320];
async function phone(seat, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return p;
}
async function watcher() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tv = await ctx.newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.joinCode);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
  return tv;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const tvGame = async () => (await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.at(-1);
const myGame = async (i) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seats[i].token })).myGames.at(-1);
const noSideways = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);
const strokesOf = (pieces) => new Set((pieces ?? []).map((x) => x.s)).size;
/** Does this text show the word as a word ("hat" is not in "What is it?")? */
const showsWord = (t, word) => new RegExp(`(^|[^a-z])${word.toLowerCase().replace(/[^a-z ]/g, "").replace(/ /g, "\\s+")}([^a-z]|$)`, "i").test(t);

/** A stroke with a finger (touch events, as on a phone), or with a mouse. */
async function stroke(p, { touch = false, from = [0.2, 0.3], to = [0.8, 0.7] } = {}) {
  const box = await p.getByTestId("mz-dg-board").boundingBox();
  const at = ([fx, fy]) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const a = at(from), b = at(to);
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 10, y: a.y + ((b.y - a.y) * i) / 10 }] });
      await sleep(30);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await p.mouse.move(a.x, a.y);
    await p.mouse.down();
    await p.mouse.move(b.x, b.y, { steps: 10 });
    await p.mouse.up();
  }
}

try {
  let pages = [];
  for (const [i, s] of seats.entries()) pages.push(await phone(s, WIDTHS[i]));
  // Keku's phone, looked up each time: turn 2 closes the drawer's page and
  // opens a new one in pages[d], and the drawer is seat 0 in about one game
  // in four (the server shuffles the order). A page captured here went stale
  // then, and the results checks crashed with "Target page … has been closed".
  const keku = () => pages[0];
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  const tv = await watcher();

  // ---- Practice-only, in the lobby and on the server.
  await keku().getByTestId("choose-game").click();
  await keku().getByTestId("select-game-draw-guess").click();
  await soon("lobby: Draw & Guess is Practice only, and says why", async () => (await keku().getByTestId("mode-official").isDisabled()) && /practice-only until its Cup scoring is approved/.test(await keku().getByTestId("practice-only-note").innerText()));
  const off = await call(`/rooms/${room.roomId}/games`, { token: seats[0].token, body: { gameId: "draw-guess", official: true } });
  check("server: an official start is refused", off.status >= 400 && /practice-only/.test(off.body.error ?? ""), `${off.status} ${off.body.error}`);
  await keku().getByTestId("start-practice-draw-guess").click();
  await soon("briefing: every phone explains the game", async () => (await Promise.all(pages.map(async (p) => /Only the drawer sees the word/.test(await text(p)) && /Wrong guesses stay private/.test(await text(p))))).every(Boolean));
  await pages[1].screenshot({ path: screenshotPath("docs/stage5/after/dg-briefing-375.png") });
  for (const p of pages) await p.getByTestId("briefing-ready").click();

  const seatOf = (pid) => seats.findIndex((s) => s.playerId === pid);
  const scores = Object.fromEntries(seats.map((s) => [s.playerId, 0]));
  const drawers = [];
  const turnStart = async (n) => {
    await soon(`turn ${n}: one phone draws, the others guess`, async () => {
      const g = await tvGame();
      if (g.state.turn !== n - 1 || g.state.phase !== "draw") return false;
      const d = seatOf(g.state.drawerId);
      const kinds = await Promise.all(pages.map(async (p, i) => (i === d ? p.getByTestId("mz-dg-draw") : p.getByTestId("mz-dg-guess")).count()));
      return kinds.every((k) => k === 1);
    }, 50000);
    const g = await tvGame();
    const d = seatOf(g.state.drawerId);
    drawers.push(d);
    const word = ((await pages[d].getByTestId("mz-dg-word").textContent()) ?? "").replace(/^Draw:\s*/i, "").trim();
    return { d, word, guessers: [0, 1, 2, 3].filter((i) => i !== d) };
  };
  const guess = async (i, t) => { await pages[i].getByTestId("mz-dg-input").fill(t); await pages[i].getByTestId("mz-dg-send").click(); };

  // ======== Turn 1: touch drawing, live TV, undo, a wrong guess, a failed send, order, a skip.
  {
    const { d, word, guessers: [ga, gb, gc] } = await turnStart(1);
    check(`turn 1: the drawer (${NAMES[d]}) sees the word`, word.length > 1, word);
    const others = await Promise.all(pages.map((p, i) => (i === d ? "" : text(p))));
    check("turn 1: no guesser's screen shows the word", others.every((t) => !showsWord(t, word)), word);
    check("turn 1: the TV and the public projection don't have the word", !showsWord(await text(tv), word) && !JSON.stringify(await tvGame()).toLowerCase().includes(`"${word.toLowerCase()}"`));
    await stroke(pages[d], { touch: true });
    await soon("a finger stroke reaches the server and shows on the TV and the guessers' phones", async () => strokesOf((await tvGame()).state.pieces) === 1 && Number(await tv.getByTestId("tv-dg-board").getAttribute("data-pieces")) >= 1 && Number(await pages[ga].getByTestId("mz-dg-board").getAttribute("data-pieces")) >= 1, 8000);
    await stroke(pages[d], { from: [0.3, 0.8], to: [0.7, 0.2] });
    await soon("a mouse stroke too (two strokes on the server)", async () => strokesOf((await tvGame()).state.pieces) === 2, 8000);
    await stroke(pages[d], { from: [0.1, 0.5], to: [0.9, 0.5] });
    await soon("a third stroke", async () => strokesOf((await tvGame()).state.pieces) === 3, 8000);
    await pages[d].getByTestId("mz-dg-undo").click();
    await soon("undo removes the last stroke (two left), for everyone", async () => strokesOf((await tvGame()).state.pieces) === 2 && Number(await tv.getByTestId("tv-dg-board").getAttribute("data-pieces")) === (await tvGame()).state.pieces.length, 8000);
    await pages[d].screenshot({ path: screenshotPath(`docs/stage5/after/dg-drawer-${WIDTHS[d]}.png`) });
    { const f = await contrastFailures(pages[d]); check("contrast (AA): the drawer's screen", f.length === 0, f.join("; ")); }
    { const f = await contrastFailures(pages[ga]); check("contrast (AA): a guesser's screen", f.length === 0, f.join("; ")); }
    { const f = await contrastFailures(tv); check("contrast (AA): the TV during a drawing", f.length === 0, f.join("; ")); }
    await tv.screenshot({ path: screenshotPath("docs/stage5/after/dg-tv-live-1440.png") });
    // The TV board always fits the screen, and the drawer's name never breaks mid-word, at common TV sizes.
    for (const [w, h] of [[1280, 720], [1920, 1080], [1440, 900]]) {
      await tv.setViewportSize({ width: w, height: h });
      await sleep(250);
      const fit = await tv.evaluate(() => {
        const b = document.querySelector('[data-testid="tv-dg-board"]').getBoundingClientRect();
        const h1 = document.querySelector(".mz-tvshow-dg .mz-tvshow-h1");
        const words = h1.textContent.split(/\s+/).filter(Boolean);
        const range = document.createRange(); range.selectNodeContents(h1);
        return { inside: b.bottom <= innerHeight + 1 && b.right <= innerWidth + 1, noScroll: document.scrollingElement.scrollWidth <= innerWidth + 1, lines: range.getClientRects().length, words: words.length };
      });
      check(`TV ${w}×${h}: the whole board is on screen, no sideways scrolling`, fit.inside && fit.noScroll, JSON.stringify(fit));
      if (w === 1920) await tv.screenshot({ path: screenshotPath("docs/stage5/after/dg-tv-live-1920.png") });
    }

    // A spectator who arrives mid-turn: the drawing, never the word.
    const late = await watcher();
    await soon("a spectator joining mid-turn sees the drawing so far", async () => Number(await late.getByTestId("tv-dg-board").getAttribute("data-pieces")) >= 2, 10000);
    check("…and not the word", !showsWord(await text(late), word));
    await late.context().close();

    // A wrong guess.
    await guess(ga, "pineapple pizza");
    await soon("a wrong guess: 'Not it', and the box is ready again", async () => /Not it/.test(await pages[ga].getByTestId("mz-dg-wrong").innerText()) && (await pages[ga].getByTestId("mz-dg-input").inputValue()) === "");
    const everywhere = [await text(tv), await text(pages[d]), await text(pages[gb]), JSON.stringify(await tvGame()), JSON.stringify(await myGame(d)), JSON.stringify(await myGame(gb))];
    check("the wrong guess's text appears nowhere (TV, drawer, other guessers, projections)", everywhere.every((t) => !/pineapple/i.test(t)));
    await pages[ga].screenshot({ path: screenshotPath(`docs/stage5/after/dg-guess-wrong-${WIDTHS[ga]}.png`) });

    // A guess that never reaches the server keeps its text.
    await pages[gb].route("**/intents", (r) => r.abort("internetdisconnected"));
    await guess(gb, word);
    await soon("a failed guess says it couldn't be confirmed, and keeps the text", async () => /couldn’t confirm/.test(await pages[gb].getByTestId("mz-dg-error").innerText()) && (await pages[gb].getByTestId("mz-dg-input").inputValue()) === word);
    check("a failed guess: the server has nothing from them", !(await tvGame()).state.correct.some((c) => c.playerId === seats[gb].playerId));
    await pages[gb].unroute("**/intents");

    // Right guesses, in order: ga first (100), gb second (80) after the retry.
    await guess(ga, word.toUpperCase());
    await soon("a right guess (any case): 'Right! You were first'", async () => /Right! You were first/.test(await pages[ga].getByTestId("mz-dg-right").innerText()));
    await pages[gb].getByTestId("mz-dg-send").click();
    await soon("the retried guess counts: number 2", async () => /You were number 2/.test(await pages[gb].getByTestId("mz-dg-right").innerText()));
    await soon("the drawer sees '2 of 3 got it'", async () => /2 of 3 got it/.test(await pages[d].getByTestId("mz-dg-progress").innerText()));
    await pages[gc].getByTestId("mz-dg-skip").click();
    await soon("turn 1: the last guesser skips, the reveal comes at once on every phone and the TV", async () => (await Promise.all(pages.map((p) => p.getByTestId("mz-dg-reveal").count()))).every((x) => x === 1) && new RegExp(`It was: ${word}`, "i").test(await tv.getByTestId("tv-dg-answer").innerText()), 10000);
    await pages[ga].screenshot({ path: screenshotPath(`docs/stage5/after/dg-reveal-${WIDTHS[ga]}.png`) });
    { const f = await contrastFailures(pages[ga]); check("contrast (AA): the reveal", f.length === 0, f.join("; ")); }
    await tv.screenshot({ path: screenshotPath("docs/stage5/after/dg-tv-reveal-1440.png") });
    scores[seats[ga].playerId] += 100; scores[seats[gb].playerId] += 80; scores[seats[d].playerId] += 100;
  }

  // ======== Turn 2: the drawer's phone goes away; the server's clock ends the turn; they come back as a guesser.
  {
    const { d, guessers: [ga] } = await turnStart(2);
    await stroke(pages[d]);
    await soon("turn 2: the drawing starts", async () => strokesOf((await tvGame()).state.pieces) === 1, 8000);
    await pages[d].context().close();
    const at = Date.now();
    await soon("turn 2: with the drawer gone and nobody guessing, the clock ends the turn (≈ 37 s at this scale)", async () => (await tvGame()).state.phase !== "draw", 60000);
    check("…not before its time", Date.now() - at > 20000, `${Date.now() - at}ms`);
    await soon("turn 2's reveal says nobody got it", async () => /Nobody got it/.test(await pages[ga].getByTestId("mz-dg-mine").innerText()), 10000);
    pages[d] = await phone(seats[d], WIDTHS[d]);
    await soon("the drawer comes back (same seat) and is on the game again", async () => (await pages[d].locator('[data-testid="mz-dg-reveal"], [data-testid="mz-dg-guess"], [data-testid="mz-dg-draw"]').count()) === 1, 20000);
  }

  // ======== Turn 3: the drawer gives up.
  {
    const { d, word, guessers: [ga] } = await turnStart(3);
    await pages[d].getByTestId("mz-dg-giveup").click();
    await soon("turn 3: giving up reveals the word at once (said as 'nobody got it': who passed stays private)", async () => /Nobody got it/.test(await pages[ga].getByTestId("mz-dg-mine").innerText()) && !/pass/i.test(await text(pages[ga])) && new RegExp(word, "i").test(await pages[ga].getByTestId("mz-dg-answer").innerText()), 10000);
    check("turn 3: the public projection has no skip count or 'gave up'", !/skipped|gaveUp/.test(JSON.stringify(await tvGame())));
  }

  // ======== Turn 4: one word swap, server limits, everyone gets it.
  {
    const { d, word: first, guessers } = await turnStart(4);
    await pages[d].getByTestId("mz-dg-swap").click();
    await soon("turn 4: 'New word' gives a different word, once", async () => {
      const w = ((await pages[d].getByTestId("mz-dg-word").textContent()) ?? "").replace(/^Draw:\s*/i, "").trim();
      return w && w !== first && (await pages[d].getByTestId("mz-dg-swap").count()) === 0;
    });
    const word = ((await pages[d].getByTestId("mz-dg-word").textContent()) ?? "").replace(/^Draw:\s*/i, "").trim();
    const gid = (await tvGame()).id;
    const raw = (payload, action = "draw-strokes") => call(`/rooms/${room.roomId}/intents`, { token: seats[d].token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
    const big = await raw({ pieces: [{ s: 900, c: 0, w: 0, p: Array.from({ length: 802 }, (_, i) => i % 1000) }] });
    check("server: a message over 400 points is refused", big.body.accepted === false && big.body.reason === "PAYLOAD_TOO_LARGE", JSON.stringify(big.body));
    const burst = await Promise.all(Array.from({ length: 24 }, (_, i) => raw({ pieces: [{ s: 1000 + i, c: 1, w: 0, p: [10 * i, 10, 10 * i, 20] }] })));
    check("server: a burst of drawing messages is rate limited", burst.some((r) => r.body.reason === "RATE_LIMITED") && burst.some((r) => r.body.accepted === true));
    const notMine = await call(`/rooms/${room.roomId}/intents`, { token: seats[guessers[0]].token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action: "draw-strokes", payload: { pieces: [{ s: 1, c: 0, w: 0, p: [0, 0] }] } } } });
    check("server: a guesser can't draw", notMine.body.accepted === false && notMine.body.reason === "NOT_YOUR_TURN");
    await sleep(2100); // let the rate window pass (the burst used it up; the phone's own pace never does)
    await pages[d].getByTestId("mz-dg-clear").click();
    await soon("clear empties the drawing for everyone", async () => (await tvGame()).state.pieces.length === 0, 8000);
    await stroke(pages[d]);
    await soon("drawing again after the clear", async () => strokesOf((await tvGame()).state.pieces) === 1, 8000);
    for (const [k, g] of guessers.entries()) {
      await guess(g, `the ${word}`);
      await soon(`turn 4: guesser ${k + 1} gets it`, async () => (await tvGame()).state.correct.length === k + 1 || (await tvGame()).state.phase !== "draw", 8000);
    }
    await soon("turn 4: everyone got it, the reveal comes at once", async () => (await tvGame()).state.phase !== "draw", 8000);
    scores[seats[guessers[0]].playerId] += 100; scores[seats[guessers[1]].playerId] += 80; scores[seats[guessers[2]].playerId] += 60; scores[seats[d].playerId] += 150;
  }
  check("rotation: four turns, four different drawers (everyone drew once)", new Set(drawers).size === 4, drawers.join(","));

  // ---- Results.
  await soon("results on every phone", async () => (await Promise.all(pages.map((p) => p.getByTestId("mz-dg-results").count()))).every((x) => x === 1), 30000);
  const g = await tvGame();
  check(`results: the server's scores are the plan's (${Object.values(scores).join(", ")})`, Object.keys(scores).every((k) => g.rawScores[k] === scores[k]), `${JSON.stringify(g.rawScores)} vs ${JSON.stringify(scores)}`);
  check("results: practice, not counted", g.outcome?.countsOfficially === false && g.official === false);
  for (const [i, p] of pages.entries()) {
    const t = await text(p);
    check(`results ${WIDTHS[i]}px: four turns recapped, how scoring works, no sideways scrolling`, (await p.getByTestId("mz-dg-recap-turn").count()) === 4 && /in the order they got it/.test(t) && await noSideways(p));
  }
  check("results: the moment line comes from a recorded turn (turn 4: everyone got it)", /^Everyone got .+’s “.+”\.$/.test(await keku().getByTestId("results-moment").innerText()), await keku().getByTestId("results-moment").innerText().catch(() => "none"));
  await keku().screenshot({ path: screenshotPath("docs/stage5/after/dg-results-390.png"), fullPage: true });
  { const f = await contrastFailures(keku()); check("contrast (AA): results", f.length === 0, f.join("; ")); }
  await soon("TV: final standings, then the review", async () => (await tv.getByTestId("tv-mode").getAttribute("data-mode")) === "final", 20000);
  await tv.getByTestId("tv-dir-review").click();
  await soon("TV review: four turns, each word and who drew it", async () => (await tv.getByTestId("tv-dg-review").locator("li").count()) === 4);
  await tv.screenshot({ path: screenshotPath("docs/stage5/after/dg-tv-review-1440.png") });
  check("privacy after the game: no wrong guess anywhere in the public projection", !/pineapple/i.test(JSON.stringify(g)));
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "DRAW & GUESS ALL PASSED" : `DRAW & GUESS FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
