// Stage 5 (S5-C2): Pattern Pulse, a complete game on three phones and a TV.
//   Practice-only (the lobby says so; the server refuses Official); the
//   briefing explains it; six self-paced rounds through each phone's own UI;
//   the pattern is on the memorising phone only, and hides at the server's
//   deadline; undo and clear; a failed send says so and keeps the entry; a
//   reload mid-round never shows the pattern again; a window nobody answers
//   is closed by the server clock (0 points) with nobody acting; H1 (handoff
//   7008903623): the pattern is shown one symbol at a time, in order, never two
//   at once and never as text or a name holding the sequence (sampled in the
//   page every 15 ms through the window); reduced motion keeps the timing and
//   drops the pop-in; the cue announcer (review 7010784066): ONE assertive
//   live region already in the page, empty, on the ready screen before the
//   pattern opens; the SAME node then says each cue in order ("1 of 3: …"),
//   in step with the visible symbol, is empty in the gaps, and is empty at
//   recall (a MutationObserver records every change of its text), for every
//   round opened through the UI; sitting the rest out; a late joiner sees no
//   pattern; results on every phone equal the server's scores; the TV shows
//   counts only, then final standings and the review; no sideways scrolling.
// Isolated server, no content test mode. Time scale 0.5.
// Starts ITS OWN server. Usage: node scripts/check-pattern-pulse.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contrastFailures } from "./lib/contrast.mjs";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { readPulsePattern } from "./lib/pulse-pattern.mjs";

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

/** Open the round, read the pattern (this phone's own projection: a test oracle, H1), wait for it to hide. */
async function openAndRead(p) {
  const armed = await armAnnouncer(p);
  await p.getByTestId("mz-pp-open").click();
  await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
  const seq = await readPulsePattern(p);
  await p.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
  ANNOUNCER_ROUNDS.push(judgeAnnouncer(armed, await readAnnouncer(p), seq));
  return seq;
}
/**
 * H1: everything the memorise screen showed, sampled in the page every 15 ms until the window ends: each
 * symbol in turn, the most shown at once, and the most symbol names any text or accessible name held at once.
 */
const watchCue = (p) => p.evaluate(() => new Promise((resolve) => {
  // A symbol counts as named in a text when its full name or its one-word name ("circle") is there.
  const NAMES = ["Red circle", "Yellow square", "Green triangle", "Blue diamond", "Pink star", "Purple hexagon"];
  const WORDS = NAMES.map((n) => new RegExp(`\\b${n.split(" ")[1]}\\b`, "i"));
  const seen = []; const anims = new Set(); let maxAtOnce = 0, maxInText = 0, maxInLabel = 0, samples = 0;
  const names = (t) => NAMES.filter((n, i) => t.includes(n) || WORDS[i].test(t)).length;
  const stage = document.querySelector('[data-testid="mz-pp-stage"]');
  // The visible stage is seen, not heard: hidden from assistive technology, and not a live region (the announcer speaks).
  const stageA11y = stage ? `hidden=${stage.getAttribute("aria-hidden")} live=${stage.getAttribute("aria-live")}` : "none";
  const tick = () => {
    if (!document.querySelector('[data-testid="mz-pp-memorise"]')) { resolve({ seen, maxAtOnce, maxInText, maxInLabel, anims: [...anims], stageA11y, samples }); return; }
    samples++;
    const cues = [...document.querySelectorAll('[data-testid="mz-pp-cue"]')];
    maxAtOnce = Math.max(maxAtOnce, cues.length);
    for (const c of cues) {
      const i = Number(c.dataset.index);
      if (seen.at(-1)?.index !== i) seen.push({ index: i, symbol: Number(c.dataset.symbol) });
      anims.add(getComputedStyle(c).animationName);
    }
    maxInText = Math.max(maxInText, names(document.body.innerText));
    for (const el of document.querySelectorAll("[aria-label]")) maxInLabel = Math.max(maxInLabel, names(el.getAttribute("aria-label") ?? ""));
    setTimeout(tick, 15);
  };
  tick();
}));
/**
 * H1 (review 7010784066): the cue announcer. Call on the ready screen, BEFORE the pattern opens: finds the one
 * announcer, notes that it is already there and empty, marks the node, and records every change of its text
 * from then on, with what the visible stage showed at that moment and which screen was up.
 */
const armAnnouncer = (p) => p.evaluate(() => {
  const all = document.querySelectorAll('[data-testid="mz-pp-announcer"]');
  const el = all[0];
  if (!el) return { found: false, count: 0 };
  const mark = `ann-${Math.random().toString(36).slice(2)}`;
  const log = [];
  let last = el.textContent;
  const obs = new MutationObserver(() => {
    const now = el.textContent;
    if (now === last) return;
    last = now;
    const cue = document.querySelector('[data-testid="mz-pp-cue"]');
    const screen = document.querySelector('[data-testid="mz-pp-memorise"]') ? "memorise" : document.querySelector('[data-testid="mz-pp-input"]') ? "recall" : "other";
    log.push({ t: Math.round(performance.now()), text: now, visual: cue ? Number(cue.dataset.index) : null, screen });
  });
  obs.observe(el, { childList: true, characterData: true, subtree: true });
  el.__mzMark = mark;
  window.__mzAnn = { el, mark, log, obs };
  return { found: true, count: all.length, live: el.getAttribute("aria-live"), atomic: el.getAttribute("aria-atomic"), text: el.textContent, ready: !!document.querySelector('[data-testid="mz-pp-ready"]') };
});
/** Once the recall screen is up: still the same node (identity and mark), its text now, and everything it said since arming. */
const readAnnouncer = (p) => p.evaluate(() => {
  const a = window.__mzAnn;
  const all = document.querySelectorAll('[data-testid="mz-pp-announcer"]');
  const el = all[0];
  a?.obs.disconnect();
  return { same: !!a && !!el && el === a.el && el.__mzMark === a.mark && el.isConnected, count: all.length, text: el?.textContent ?? null, live: el?.getAttribute("aria-live") ?? null, atomic: el?.getAttribute("aria-atomic") ?? null, log: a?.log ?? [], recall: !!document.querySelector('[data-testid="mz-pp-input"]') };
});
const SYMBOL_NAMES = ["Red circle", "Yellow square", "Green triangle", "Blue diamond", "Pink star", "Purple hexagon"];
/** One round's announcer record against the server's pattern for that round. */
function judgeAnnouncer(armed, read, pattern) {
  const len = pattern?.length ?? 0;
  const cues = (pattern ?? []).map((s, i) => `${i + 1} of ${len}: ${SYMBOL_NAMES[s]}`);
  const said = read.log.map((x) => x.text);
  const spoken = said.filter((x) => x !== "");
  // Each cue said while the stage showed that same symbol; each empty while it showed none (a gap, or recall).
  const inSync = read.log.every((x) => (x.text === "" ? x.visual === null : x.visual === Number(x.text.split(" ")[0]) - 1));
  const mountedEmpty = armed.found === true && armed.ready === true && armed.count === 1 && armed.text === "" && armed.live === "assertive" && armed.atomic === "true";
  const firstFromEmpty = said[0] === cues[0];
  const clearedAtRecall = read.recall && read.text === "" && said.at(-1) === "";
  // A symbol that comes back later in the pattern (the server never puts one twice in a row: pulsePattern).
  const repeats = (pattern ?? []).filter((s, i) => pattern.indexOf(s) < i).length;
  const ok = mountedEmpty && read.same && read.count === 1 && read.live === "assertive" && read.atomic === "true" && len > 0
    && JSON.stringify(spoken) === JSON.stringify(cues) && firstFromEmpty && clearedAtRecall && inSync;
  return { ok, len, mountedEmpty, same: read.same, firstFromEmpty, firstCue: spoken[0] ?? null, lastCue: spoken.at(-1) ?? null, clearedAtRecall, inSync, gaps: said.filter((x) => x === "").length, repeats, said };
}
const ANNOUNCER_ROUNDS = [];
const ANNOUNCER_FIRST = []; // Keku's and Amina's round 1, checked on their own above
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

  // ---- Keku, round 1: the pattern on his phone only, one symbol at a time (H1), then hidden by the server's clock.
  const kArm = await armAnnouncer(keku);
  check("announcer (H1): on the ready screen, before the pattern opens, the one assertive, atomic announcer is already in the page, empty", kArm.found && kArm.ready && kArm.count === 1 && kArm.text === "" && kArm.live === "assertive" && kArm.atomic === "true", JSON.stringify(kArm));
  await keku.getByTestId("mz-pp-open").click();
  await keku.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
  const kWatch = watchCue(keku);
  const kekuServer = (await myGame(0)).state;
  await keku.screenshot({ path: screenshotPath("docs/stage5/after/pp-memorise-390.png") });
  { const f = await contrastFailures(keku); check("contrast (AA): memorise", f.length === 0, f.join("; ")); }
  const tvPub = JSON.stringify(await tvGame());
  check("privacy: the TV projection never has a pattern", !/"pattern"/.test(tvPub) && !/"open"/.test(tvPub));
  check("privacy: another player's projection never has Keku's pattern", !/"pattern"/.test(JSON.stringify(await myGame(1))));
  check("privacy: the TV screen shows no sequence", (await tv.locator('[data-testid="mz-pp-stage"], [data-testid="mz-pp-cue"]').count()) === 0);
  const kw = await kWatch;
  const k1 = kw.seen.map((x) => x.symbol);
  check("memorise (H1): the phone showed the server's pattern for Keku one symbol at a time, in order (3 shapes)", k1.length === 3 && JSON.stringify(kw.seen.map((x) => x.index)) === "[0,1,2]" && JSON.stringify(kekuServer.open?.pattern) === JSON.stringify(k1), `${JSON.stringify(kw.seen)} vs ${JSON.stringify(kekuServer.open?.pattern)}`);
  check("memorise (H1): never two symbols at once, and no text or accessible name held more than one symbol's name", kw.maxAtOnce === 1 && kw.maxInText <= 1 && kw.maxInLabel <= 1, JSON.stringify({ maxAtOnce: kw.maxAtOnce, maxInText: kw.maxInText, maxInLabel: kw.maxInLabel, samples: kw.samples }));
  check("memorise (full motion): each symbol pops in", kw.anims.length > 0 && kw.anims.every((a) => a === "mz-pp-pop"), JSON.stringify(kw.anims));
  await keku.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
  {
    const k = judgeAnnouncer(kArm, await readAnnouncer(keku), kekuServer.open?.pattern);
    ANNOUNCER_FIRST.push(k);
    check("announcer (H1): the visible stage is seen, not heard (hidden from assistive technology, not live)", kw.stageA11y === "hidden=true live=null", kw.stageA11y);
    check("announcer (H1): the SAME node from the ready screen through memorising to recall, and still the only one", k.same && k.mountedEmpty, JSON.stringify({ same: k.same, mountedEmpty: k.mountedEmpty }));
    check("announcer (H1): the first cue is an update of that empty node; each symbol said once, in order, with its place, in step with the visible symbol", k.firstFromEmpty && k.inSync && k.ok, JSON.stringify(k.said));
    check("announcer (H1): empty in the gaps, and empty at recall after the last cue", k.clearedAtRecall && k.gaps >= 1, JSON.stringify({ firstCue: k.firstCue, lastCue: k.lastCue, gaps: k.gaps, clearedAtRecall: k.clearedAtRecall }));
  }
  check("hidden: once the window passes the pattern is gone from the screen", (await keku.locator('[data-testid="mz-pp-stage"], [data-testid="mz-pp-cue"]').count()) === 0);
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
  { const f = await contrastFailures(keku); check("contrast (AA): tap it back", f.length === 0, f.join("; ")); }
  await keku.getByTestId("mz-pp-submit").click();
  await soon("round 1 (Keku): all three right, +110, from the server", async () => /All 3 right: \+110/.test(await keku.getByTestId("mz-pp-last").innerText()));
  check("server: Keku's round 1 scored 110", (await myGame(0)).state.results[0].points === 110);

  // ---- Amina (reduced motion), round 1: the same one-at-a-time cue with no animation; two right, then a slip.
  const aArm = await armAnnouncer(amina);
  await amina.getByTestId("mz-pp-open").click();
  await amina.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
  const aWatch = watchCue(amina);
  const aminaServer = (await myGame(1)).state;
  await amina.screenshot({ path: screenshotPath("docs/stage5/after/pp-memorise-reduced-375.png") });
  const aw = await aWatch;
  const a1 = aw.seen.map((x) => x.symbol);
  check("reduced motion (H1): the same one-at-a-time cue, in order, with no animation", a1.length === 3 && JSON.stringify(aw.seen.map((x) => x.index)) === "[0,1,2]" && aw.maxAtOnce === 1 && aw.maxInText <= 1 && aw.maxInLabel <= 1 && aw.anims.every((a) => a === "none"), JSON.stringify(aw));
  await amina.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
  {
    const a = judgeAnnouncer(aArm, await readAnnouncer(amina), aminaServer.open?.pattern);
    ANNOUNCER_FIRST.push(a);
    check("announcer (H1), reduced motion: the same one node, mounted empty before the pattern opened; each cue in order and in step; empty at recall", a.ok && aw.stageA11y === "hidden=true live=null", JSON.stringify({ said: a.said, same: a.same, stage: aw.stageA11y }));
  }
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

  // ---- The announcer in every other round opened through the UI (Bartholomew's, Keku's 2–6, Amina's 2–6).
  {
    const bad = ANNOUNCER_ROUNDS.filter((r) => !r.ok);
    const all = [...ANNOUNCER_ROUNDS, ...ANNOUNCER_FIRST];
    const repeats = all.reduce((n, r) => n + r.repeats, 0);
    const lengths = ANNOUNCER_ROUNDS.map((r) => r.len).join(",");
    check(`announcer (H1), every other round opened (${ANNOUNCER_ROUNDS.length}, lengths ${lengths}): one node from the ready screen to recall, mounted empty, each cue in order and in step, empty at recall`, ANNOUNCER_ROUNDS.length === 11 && bad.length === 0, JSON.stringify(bad.slice(0, 2)));
    const withRepeat = all.filter((r) => r.repeats > 0);
    console.log(`MCHEZO_ANNOUNCER ${JSON.stringify({ rounds: all.length, recurringSymbols: repeats, gapsSeen: all.map((r) => `${r.gaps}/${r.len}`), first: all.map((r) => r.firstCue), last: all.map((r) => r.lastCue), recurringRounds: withRepeat.map((r) => r.said) })}`);
    // Every pattern of 7 or 8 symbols from six repeats one, so the game always has some.
    check("announcer (H1): a symbol that comes back later in a pattern is said again each time, with its own place", withRepeat.length > 0 && withRepeat.every((r) => r.ok), `${repeats} recurrence(s) in ${withRepeat.length} of ${all.length} round(s)`);
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
  { const f = await contrastFailures(keku); check("contrast (AA): results", f.length === 0, f.join("; ")); }
  check("results: Keku's moment is his own recorded rounds", (await keku.getByTestId("results-moment").innerText()) === "Six perfect rounds out of six. Total recall.");
  check("results: Amina's moment is her own longest perfect sequence (7)", (await amina.getByTestId("results-moment").innerText()) === "Your longest perfect sequence: 7 shapes.");
  // S5-E: the winner's celebration follows the motion setting.
  check("celebration with full motion: the short burst, no ribbon", (await keku.getByTestId("results-ribbon").count()) === 0);
  await keku.emulateMedia({ reducedMotion: "reduce" });
  await keku.reload({ waitUntil: "domcontentloaded" });
  await soon("celebration with reduced motion: a still ribbon, no confetti", async () => /You won this one/.test(await keku.getByTestId("results-ribbon").innerText()) && (await keku.getByTestId("results-confetti").count()) === 0, 15000);
  await keku.screenshot({ path: screenshotPath("docs/stage5/after/pp-results-still-390.png") });
  check("celebration: only the winner's phone celebrates", (await amina.getByTestId("results-ribbon").count()) === 0 && (await amina.getByTestId("results-confetti").count()) === 0);
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
