// Stage 6.2: the solo shelf (Math Mayhem, Pattern Pulse, Word Connections),
// end to end in the browser.
//   A  the shelf lists exactly the three solo games, each with its own best
//   B  Pattern Pulse played perfectly (960), the first round by keyboard
//   C  Play again: Pulse with a slip in every round (0), the best stays
//   D  switch to Word Connections: solved with no mistakes (450), the first
//      group chosen by keyboard; its own first best (never compared with Pulse)
//   E  Play again: four wrong guesses (0, out of guesses), a fresh round with
//      nothing carried over, every group shown as missed. Which board comes
//      next is the server's content selection: a gate server approves all
//      content for official play, so its solo rooms repeat one board (spec
//      §3.4, kept by decision); board variety is checked in K instead
//   F  Play again: two groups then four wrong (200), found and missed told apart
//   G  switch to Math Mayhem: a fresh round; one solo room for all of it
//   H  personal bests: one per game in storage and on the shelf; another rules
//      version ignored; blocked storage says so and still plays
//   I  lifecycle: Leave mid-Pulse, reload mid-Connections, a second tab's Start
//      replacing a Connections round, Home from results
//   J  fault: a Connections guess that gets no reply ends at the request
//      allowance with the four tiles still selected; sending again works
//   K  own server (short test clock, the shipped content library): a Pulse
//      round left to run out, a Connections game ending at its deadline with
//      one group found, then board variety: Play again and a Start after
//      leaving each deal a board not yet used in that room
//   L  a forged abstain (sent with the seat's own token; the solo screens have
//      no Sit out) after partial progress: the round ends and says why it
//      sets no best; the stored best is unchanged after the result, a replay
//      of the request and a reload (Connections and Pulse). Also the note
//      that Connections' best spans boards, on the shelf, start and results
// Usage: node scripts/check-solo-shelf.mjs <baseUrl>   (the gate passes its server)
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";
import { connectionsGroups } from "./lib/content-oracle.mjs";
import { slabNumber, solveMath } from "./lib/math-solve.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
const num = (s) => Number(String(s).replace(/,/g, "").match(/\d+/)?.[0] ?? NaN);
const seatOf = async (page) => JSON.parse((await page.evaluate(() => localStorage.getItem("mchezo.solo.v1"))) ?? "null");
const bests = async (page) => JSON.parse((await page.evaluate(() => localStorage.getItem("mchezo.pb.v1"))) ?? "{}");
async function serverRoom(seat, base = BASE) {
  const r = await fetch(`${base}/rooms/${seat.roomId}/projection?audience=player`, { headers: { "x-session-token": seat.token } });
  return r.json();
}
function countRooms(page) {
  const box = { n: 0 };
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/rooms") box.n++; });
  return box;
}
async function results(page) {
  await page.getByTestId("solo-results").waitFor({ timeout: 30000 });
  return {
    score: num(await page.getByTestId("solo-score").innerText()),
    headline: (await page.getByTestId("solo-headline").innerText()).trim(),
    pb: await page.getByTestId("solo-pb").innerText().catch(() => ""),
  };
}
async function startFromShelf(page, gameId, base = BASE) {
  if (new URL(page.url()).pathname !== "/solo") await page.goto(`${base}/solo`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("solo-home").waitFor({ timeout: 15000 });
  await page.getByTestId(`solo-start-${gameId}`).click();
  await page.getByTestId("solo-round").waitFor({ timeout: 20000 });
}

/** Pattern Pulse: `how(i)` is "right", "slip" (first shape wrong) or "timeout" (open, never answer). */
async function playPulse(page, how, { keyboardRound = -1 } = {}) {
  for (let i = 0; i < 6; i++) {
    await page.getByTestId("mz-pp-open").waitFor({ timeout: 30000 });
    if (i === keyboardRound) { await page.getByTestId("mz-pp-open").focus(); await page.keyboard.press("Enter"); } else await page.getByTestId("mz-pp-open").click();
    await page.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
    const pattern = await page.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
    await page.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
    const mode = how(i);
    if (mode === "timeout") { await page.locator('[data-testid="mz-pp-ready"], [data-testid="solo-results"]').first().waitFor({ timeout: 40000 }); continue; }
    const entry = mode === "right" ? pattern : [(pattern[0] + 1) % 6, ...pattern.slice(1)];
    for (const s of entry) {
      if (i === keyboardRound) { await page.getByTestId(`mz-pp-key-${s}`).focus(); await page.keyboard.press("Enter"); } else await page.getByTestId(`mz-pp-key-${s}`).click();
    }
    if (i === keyboardRound) { await page.getByTestId("mz-pp-submit").focus(); await page.keyboard.press("Enter"); } else await page.getByTestId("mz-pp-submit").click();
    if (i < 5) await page.getByTestId("mz-pp-ready").waitFor({ timeout: 15000 });
  }
  return results(page);
}

const tileFor = (p, w) => p.getByTestId("mz-cx-tile").filter({ hasText: new RegExp(`^\\s*${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") });

/** Word Connections: `plan` lists moves: "group" (the next unsolved group) or "wrong" (a mixed four never tried before). */
async function playConnections(page, plan, { keyboardFirst = false } = {}) {
  await page.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  const shown = async () => (await page.getByTestId("mz-cx-tile").allInnerTexts()).map((w) => w.trim().toLowerCase());
  const groups = connectionsGroups(await shown());
  let wrongs = 0;
  for (const [n, move] of plan.entries()) {
    const now = new Set(await shown());
    const open = groups.filter((g) => g.every((w) => now.has(w.toLowerCase()))); // groups not found yet
    // "wrong": two words from each of the last two open groups, a different
    // pair each time (never a whole group, never a repeat).
    const [ga, gb] = [open.at(-1), open.at(-2)];
    const four = move === "group" ? open[0] : [ga[0], ga[1], gb[wrongs % 4], gb[(wrongs + 1) % 4]];
    for (const w of four) {
      const tile = tileFor(page, w);
      if (keyboardFirst && n === 0) { await tile.focus(); await page.keyboard.press("Enter"); } else await tile.click();
    }
    await page.getByTestId("mz-cx-submit").click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="mz-cx-tile"][aria-pressed="true"]').length === 0 || !document.querySelector('[data-testid="mz-cx-tile"]'), null, { timeout: 15000 });
    if (move !== "group") wrongs++;
  }
  return results(page);
}

const browser = await launchChromium();
try {
  // ---- A. The shelf ----
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const rooms = countRooms(page);
  await page.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("solo-home").waitFor({ timeout: 15000 });
  const shelf = await page.locator('[data-testid^="solo-game-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("solo-game-", "")));
  check("A the shelf lists exactly Math Mayhem, Pattern Pulse and Word Connections", JSON.stringify(shelf) === JSON.stringify(["math-mayhem", "pattern-pulse", "word-connections"]), shelf.join(", "));
  for (const g of shelf) check(`A ${g}: no personal best yet, and a Start`, /No personal best on this device yet/.test(await page.getByTestId(`solo-best-${g}`).innerText()) && await page.getByTestId(`solo-start-${g}`).isEnabled());

  // ---- B. Pattern Pulse, perfect ----
  await startFromShelf(page, "pattern-pulse");
  check("B Pulse: no name, code or lobby, and no Sit the rest out", (await page.getByTestId("mz-pp-ready").isVisible()) && (await page.getByTestId("mz-pp-sitout").count()) === 0);
  const p1 = await playPulse(page, () => "right", { keyboardRound: 0 });
  check("B Pulse perfect: 960 points, 6 of 6 rounds perfect (round 1 by keyboard)", p1.score === 960 && /^6 of 6 rounds perfect$/.test(p1.headline), JSON.stringify(p1));
  check("B Pulse: its first personal best", /first personal best/.test(p1.pb), p1.pb);
  check("B Pulse results: its own six-round recap and scoring, no Math copy, no lobby or standings", (await page.getByTestId("mz-pp-recap-round").count()) === 6 && /20 points for each shape/.test(await page.getByTestId("solo-scoring").innerText()) && !/sums|correct answer|Waiting for/.test(await page.getByTestId("solo-results").innerText()) && (await page.getByTestId("show-back-to-lobby").count()) === 0);
  await soon("B results move focus to the score", async () => (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "solo-score", 5000);

  // ---- C. Play again: a slip every round ----
  await page.getByTestId("solo-play-again").click();
  const p2 = await playPulse(page, () => "slip");
  check("C Pulse replay with a slip each round: 0 points, 0 of 6 perfect", p2.score === 0 && /^0 of 6 rounds perfect$/.test(p2.headline), JSON.stringify(p2));
  check("C Pulse: a lower score keeps the best (960)", /still 960/.test(p2.pb), p2.pb);

  // ---- D. Switch to Word Connections: solved ----
  await page.getByTestId("solo-back").click();
  await startFromShelf(page, "word-connections");
  check("D Connections: no Sit this game out in solo", (await page.getByRole("button", { name: "Sit this game out" }).count()) === 0);
  const firstBoard = (await page.getByTestId("mz-cx-tile").allInnerTexts()).sort().join("|");
  const c1 = await playConnections(page, ["group", "group", "group", "group"], { keyboardFirst: true });
  check("D Connections solved with no mistakes: 450, the first group by keyboard", c1.score === 450 && c1.headline === "All four groups, no mistakes", JSON.stringify(c1));
  check("D Connections: its own first best (not compared with Pulse's 960)", /first personal best/.test(c1.pb), c1.pb);
  check("D Connections results: the solution with all four groups found", (await page.getByTestId("mz-cx-band").count()) === 4 && (await page.locator(".mz-cx-band--missed").count()) === 0);

  // ---- E. Play again: out of guesses ----
  await page.getByTestId("solo-play-again").click();
  await page.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  check("E Play again: no tile selected from the last round", (await page.locator('[data-testid="mz-cx-tile"][aria-pressed="true"]').count()) === 0);
  const secondBoard = (await page.getByTestId("mz-cx-tile").allInnerTexts()).sort().join("|");
  check("E Play again: a fresh round with nothing found yet (16 tiles, no group bands)", (await page.getByTestId("mz-cx-tile").count()) === 16 && (await page.getByTestId("mz-cx-band").count()) === 0);
  console.log(`INFO E the board after Play again is ${secondBoard === firstBoard ? "the same one" : "a different one"}: the server's content selection decides (with all content approved, as on a gate server, a solo room repeats one board; spec §3.4). Board variety is checked in K, on the shipped library.`);
  const c2 = await playConnections(page, ["wrong", "wrong", "wrong", "wrong"]);
  check("E four wrong guesses: 0 points, out of guesses", c2.score === 0 && c2.headline === "Found 0 of 4 groups · out of guesses", JSON.stringify(c2));
  check("E every group shown, all as missed", (await page.getByTestId("mz-cx-band").count()) === 4 && (await page.locator(".mz-cx-band--missed").count()) === 4);
  check("E the best stays 450", /still 450/.test(c2.pb), c2.pb);

  // ---- F. Play again: two groups, then out of guesses ----
  await page.getByTestId("solo-play-again").click();
  const c3 = await playConnections(page, ["group", "group", "wrong", "wrong", "wrong", "wrong"]);
  check("F two groups then four wrong: 200 points, 2 of 4", c3.score === 200 && c3.headline === "Found 2 of 4 groups · out of guesses", JSON.stringify(c3));
  check("F found and missed told apart: 2 solid, 2 dashed", (await page.getByTestId("mz-cx-band").count()) === 4 && (await page.locator(".mz-cx-band--missed").count()) === 2);

  // ---- G. Switch to Math Mayhem ----
  await page.getByTestId("solo-back").click();
  await startFromShelf(page, "math-mayhem");
  await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
  check("G Math starts fresh at question 1 after the other games", /Question 1 of 10/.test(await page.getByTestId("solo-round").innerText()));
  for (let i = 0; i < 10; i++) {
    const slabs = page.locator(".mz-slab:not([disabled])");
    await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
    while ((await slabs.count()) !== 4) await sleep(100);
    const answer = solveMath(await page.locator("h1.mz-question").innerText());
    const labels = (await slabs.allInnerTexts()).map(slabNumber);
    await slabs.nth(labels.indexOf(answer)).click();
    if (i < 9) { await page.getByTestId("mz-math-next").waitFor({ timeout: 20000 }); await page.getByTestId("mz-math-next").click(); }
  }
  const m1 = await results(page);
  check("G Math: 10 of 10, with the Math headline and its own first best", /^10 of 10 correct$/.test(m1.headline) && m1.score >= 1000 && /first personal best/.test(m1.pb), JSON.stringify(m1));
  check("G one solo room for every round and every switch", rooms.n === 1, `${rooms.n} rooms`);
  const seat = await seatOf(page);
  const room = await serverRoom(seat);
  const byGame = (id) => (room.games ?? []).filter((g) => g.gameId === id && g.status === "finished").length;
  check("G the server holds each round in that one room (2 Pulse, 3 Connections, 1 Math)", byGame("pattern-pulse") === 2 && byGame("word-connections") === 3 && byGame("math-mayhem") === 1, JSON.stringify({ pp: byGame("pattern-pulse"), cx: byGame("word-connections"), mm: byGame("math-mayhem") }));
  check("G solo rounds are never official", (room.games ?? []).every((g) => g.official !== true));

  // ---- H. Personal bests ----
  const pb = await bests(page);
  check("H one best per game and rules version", pb["pattern-pulse@1"]?.score === 960 && pb["word-connections@1"]?.score === 450 && pb["math-mayhem@1"]?.score === m1.score && Object.keys(pb).length === 3, JSON.stringify(pb));
  await page.getByTestId("solo-back").click();
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });
  check("H the shelf shows each game's own best", (await page.getByTestId("solo-best-pattern-pulse").innerText()).includes("960") && (await page.getByTestId("solo-best-word-connections").innerText()).includes("450") && (await page.getByTestId("solo-best-math-mayhem").innerText()).includes(m1.score.toLocaleString("en-US")));
  await page.evaluate(() => { const all = JSON.parse(localStorage.getItem("mchezo.pb.v1")); all["pattern-pulse@0"] = { score: 99999, at: 1, rulesVersion: 0 }; all["word-connections@1"] = { score: 99999, at: 1, rulesVersion: 2 }; localStorage.setItem("mchezo.pb.v1", JSON.stringify(all)); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });
  check("H a best under other rules is never shown (Pulse v0; a v2 record in Connections' v1 slot)", (await page.getByTestId("solo-best-pattern-pulse").innerText()).includes("960") && /No personal best/.test(await page.getByTestId("solo-best-word-connections").innerText()));

  const blocked = await browser.newContext({ viewport: { width: 320, height: 640 } });
  await blocked.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } }); });
  const bp = await blocked.newPage();
  await bp.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
  await bp.getByTestId("solo-home").waitFor({ timeout: 15000 });
  check("H blocked storage: every game says bests can't be kept", (await bp.locator('[data-testid^="solo-best-"]').allInnerTexts()).every((t) => /can’t be kept/.test(t)));
  await bp.getByTestId("solo-start-word-connections").click();
  const cb = await playConnections(bp, ["wrong", "wrong", "wrong", "wrong"]);
  check("H blocked storage: Connections plays to its result and says the best couldn't be saved", cb.score === 0 && /couldn’t be saved/.test(cb.pb), JSON.stringify(cb));
  await blocked.close();

  // ---- I. Lifecycle ----
  await startFromShelf(page, "pattern-pulse");
  await page.getByTestId("mz-pp-open").click();
  await page.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
  await page.getByTestId("solo-leave").click(); await page.getByTestId("solo-leave-yes").click();
  await page.getByTestId("solo-home").waitFor({ timeout: 10000 });
  await soon("I Leave mid-Pulse: the round is removed on the server", async () => !((await serverRoom(seat)).games ?? []).some((g) => g.status === "playing"), 10000);

  await startFromShelf(page, "word-connections");
  const cxBefore = ((await serverRoom(seat)).games ?? []).find((g) => g.status === "playing")?.id;
  await page.reload({ waitUntil: "domcontentloaded" });
  await soon("I reload mid-Connections: the round's start screen", async () => page.getByTestId("solo-ready").isVisible(), 10000);
  await page.getByTestId("solo-round-start").click();
  await page.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  check("I Start after the reload replaces the interrupted round, and says so", (await page.getByTestId("solo-replaced").isVisible()) && !((await serverRoom(seat)).games ?? []).some((g) => g.id === cxBefore));

  const tabB = await ctx.newPage();
  await tabB.goto(`${BASE}/solo/pattern-pulse`, { waitUntil: "domcontentloaded" });
  await tabB.getByTestId("solo-round-start").click();
  await tabB.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
  await soon("I a second tab's Pulse replaces this tab's Connections round: it returns to its Start screen", async () => page.getByTestId("solo-ready").isVisible(), 10000);
  const open = ((await serverRoom(seat)).games ?? []).filter((g) => g.status === "playing");
  check("I exactly one round plays, the second tab's Pulse", open.length === 1 && open[0].gameId === "pattern-pulse");
  await tabB.getByTestId("solo-leave").click(); await tabB.getByTestId("solo-leave-yes").click();
  await tabB.getByTestId("solo-home").waitFor({ timeout: 10000 });
  await tabB.close();
  check("I still one solo room", rooms.n === 1, `${rooms.n} rooms`);

  // ---- J. Fault: a guess with no reply ----
  await page.getByTestId("solo-round-start").click();
  await page.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  const words = (await page.getByTestId("mz-cx-tile").allInnerTexts()).map((w) => w.trim());
  const g0 = connectionsGroups(words)[0];
  for (const w of g0) await tileFor(page, w).click();
  await page.route((url) => /\/intents$/.test(new URL(url).pathname), () => {}); // never answered
  const t0 = Date.now();
  await page.getByTestId("mz-cx-submit").click();
  await soon("J a guess with no reply ends within the request allowance, the four tiles still selected", async () => (await page.getByTestId("mz-cx-submit").innerText()).trim() === "Submit" && (await page.locator('[data-testid="mz-cx-tile"][aria-pressed="true"]').count()) === 4, 15000);
  check("J it ended in about 6 s, not stuck on Checking…", Date.now() - t0 < 12000, `${Date.now() - t0} ms`);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.getByTestId("mz-cx-submit").click();
  await soon("J sending again works: the group is found", async () => (await page.getByTestId("mz-cx-band").count()) === 1, 10000);

  // Home from the results.
  await playConnections(page, ["group", "group", "group"]);
  await page.getByTestId("solo-home").click();
  await page.getByTestId("home").waitFor({ timeout: 10000 });
  check("I Home from the results: Home, with no phantom Rejoin", (await page.getByTestId("home-rejoin").count()) === 0);
  await ctx.close();

  // ---- L. A forged abstain never sets a best; Connections' best note ----
  const lctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const lp = await lctx.newPage();
  await lp.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
  await lp.evaluate(() => localStorage.setItem("mchezo.pb.v1", JSON.stringify({ "word-connections@1": { score: 50, at: 1, rulesVersion: 1 }, "pattern-pulse@1": { score: 20, at: 1, rulesVersion: 1 } })));
  await lp.reload({ waitUntil: "domcontentloaded" });
  await lp.getByTestId("solo-home").waitFor({ timeout: 15000 });
  const NOTE = "Best score across boards. Some boards are harder than others.";
  check("L the shelf says Connections' best spans boards (and only Connections)", (await lp.getByTestId("solo-note-word-connections").innerText()).trim() === NOTE && (await lp.locator('[data-testid^="solo-note-"]').count()) === 1 && (await lp.getByTestId("solo-best-word-connections").innerText()).includes("on this device"));
  await lp.goto(`${BASE}/solo/word-connections`, { waitUntil: "domcontentloaded" });
  await lp.getByTestId("solo-ready").waitFor({ timeout: 10000 });
  check("L Connections' start screen: the device best (50) and the note", (await lp.getByTestId("solo-best-word-connections").innerText()).includes("50") && (await lp.getByTestId("solo-note").innerText()).trim() === NOTE);
  await lp.getByTestId("solo-round-start").click();
  await lp.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  const lw = (await lp.getByTestId("mz-cx-tile").allInnerTexts()).map((w) => w.trim());
  for (const w of connectionsGroups(lw)[0]) await tileFor(lp, w).click();
  await lp.getByTestId("mz-cx-submit").click();
  await soon("L Connections: one group found (100 so far)", async () => (await lp.getByTestId("mz-cx-band").count()) === 1, 10000);
  const lseat = await seatOf(lp);
  const forge = async (gameInstanceId, clientEventId) => {
    const r = await fetch(`${BASE}/rooms/${lseat.roomId}/intents`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": lseat.token },
      body: JSON.stringify({ intent: { kind: "intent", schemaVersion: 1, clientEventId, roomId: lseat.roomId, gameInstanceId, action: "abstain", payload: {} } }) });
    return { status: r.status, body: await r.json() };
  };
  const cxRound = ((await serverRoom(lseat)).games ?? []).find((g) => g.status === "playing" && g.gameId === "word-connections")?.id;
  const cxEvent = randomUUID();
  const a1 = await forge(cxRound, cxEvent);
  check("L the server takes the forged abstain (it is the seat's own token)", a1.status < 300 && a1.body.accepted === true, JSON.stringify(a1));
  const lc = await results(lp);
  check("L Connections results: the server's 100 and 1 of 4, and why it sets no best", lc.score === 100 && lc.headline === "Found 1 of 4 groups" && /sat this round out/.test(lc.pb), JSON.stringify(lc));
  check("L Connections results: the note next to the best", (await lp.getByTestId("solo-note").innerText()).trim() === NOTE);
  check("L the stored Connections best is still 50", (await bests(lp))["word-connections@1"]?.score === 50, JSON.stringify(await bests(lp)));
  const a2 = await forge(cxRound, cxEvent);
  await sleep(2500); // a poll or two
  check("L the same request replayed: the original answer, and still 50", a2.body.accepted === true && (await bests(lp))["word-connections@1"]?.score === 50, JSON.stringify(a2));
  await lp.reload({ waitUntil: "domcontentloaded" });
  await lp.getByTestId("solo-ready").waitFor({ timeout: 10000 });
  check("L after a reload: the start screen, still 50 on screen and in storage", (await lp.getByTestId("solo-best-word-connections").innerText()).includes("50") && (await bests(lp))["word-connections@1"]?.score === 50);

  await startFromShelf(lp, "pattern-pulse");
  await lp.getByTestId("mz-pp-open").click();
  await lp.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
  const lpat = await lp.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
  await lp.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
  for (const s of lpat) await lp.getByTestId(`mz-pp-key-${s}`).click();
  await lp.getByTestId("mz-pp-submit").click();
  await lp.getByTestId("mz-pp-ready").waitFor({ timeout: 15000 }); // round 2 ready
  const ppRound = ((await serverRoom(lseat)).games ?? []).find((g) => g.status === "playing" && g.gameId === "pattern-pulse")?.id;
  const a3 = await forge(ppRound, randomUUID());
  const lq = await results(lp);
  check("L Pulse: a forged abstain after a perfect first round ends it: 110, and it sets no best", a3.body.accepted === true && lq.score === 110 && /sat this round out/.test(lq.pb), JSON.stringify({ a3, lq }));
  check("L Pulse: the stored best is still 20 (110 would have beaten it); no Connections note here", (await bests(lp))["pattern-pulse@1"]?.score === 20 && (await lp.getByTestId("solo-note").count()) === 0, JSON.stringify(await bests(lp)));
  await lctx.close();
} finally {
  await browser.close();
}

// ---- K. Timeouts (own server, short test clock) ----
const DATA = mkdtempSync(join(tmpdir(), "mz-shelf-late-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, MCHEZO_LIFECYCLE_SCALE: "0.05" };
delete env.NODE_ENV;
delete env.MCHEZO_CONTENT_TEST_MODE; // the shipped library, as players get it
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = 0;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
const b2 = await launchChromium();
try {
  if (!port) throw new Error(`timeout server did not start: ${out.slice(-300)}`);
  const LB = `http://localhost:${port}`;
  const kp = await (await b2.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await kp.goto(`${LB}/solo`, { waitUntil: "domcontentloaded" });
  await startFromShelf(kp, "pattern-pulse", LB);
  // Round 1 is left to run out; the rest are never opened: the game's own deadline (15 s on this clock) ends it.
  await kp.getByTestId("mz-pp-open").click();
  await soon("K Pulse: a round left unanswered runs out (Time ran out)", async () => /Time ran out/.test(await kp.getByTestId("mz-pp-last").innerText()), 15000);
  const kr = await results(kp);
  check("K Pulse at its game deadline: a finished server result, 0 points, the timed-out round in the recap", kr.score === 0 && /ran out of time/.test(kr.headline) && /Time ran out/.test(await kp.getByTestId("mz-pp-recap").innerText()), JSON.stringify(kr));
  await kp.getByTestId("solo-back").click();
  await startFromShelf(kp, "word-connections", LB);
  const kb1 = await playConnectionsUntil(kp);
  const kc = await results(kp);
  check("K Connections at its deadline with one group found: 100, 1 of 4, one solid band", kc.score === 100 && kc.headline === "Found 1 of 4 groups" && (await kp.locator(".mz-cx-band--missed").count()) === 3, JSON.stringify(kc));
  // Board variety on the shipped library (12 practice-only boards): Play
  // again deals a board this room hasn't used, and so does a Start after
  // leaving a round (a left round counts as used).
  await kp.getByTestId("solo-play-again").click();
  await kp.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  const kb2 = await boardNow(kp);
  await kp.getByTestId("solo-leave").click(); await kp.getByTestId("solo-leave-yes").click();
  await kp.getByTestId("solo-home").waitFor({ timeout: 10000 });
  await startFromShelf(kp, "word-connections", LB);
  await kp.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  const kb3 = await boardNow(kp);
  check("K shipped library: Play again, then a Start after leaving, each deal a board not yet used in this room", new Set([kb1, kb2, kb3]).size === 3);
} finally {
  await b2.close();
  srv.kill("SIGTERM");
  await new Promise((r) => srv.once("exit", r));
  rmSync(DATA, { recursive: true, force: true });
}

/** The Connections board on screen, as one comparable string. */
async function boardNow(p) {
  return (await p.getByTestId("mz-cx-tile").allInnerTexts()).map((w) => w.trim().toLowerCase()).sort().join("|");
}

/** One group found, then nothing more: the game's deadline (24 s on the short clock) ends it. Returns the board. */
async function playConnectionsUntil(p) {
  await p.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  const board = await boardNow(p);
  const ws = (await p.getByTestId("mz-cx-tile").allInnerTexts()).map((w) => w.trim());
  for (const w of connectionsGroups(ws)[0]) await tileFor(p, w).click();
  await p.getByTestId("mz-cx-submit").click();
  await p.getByTestId("mz-cx-band").waitFor({ timeout: 10000 });
  await p.getByTestId("solo-results").waitFor({ timeout: 60000 });
  return board;
}

console.log(failures === 0 ? "SOLO SHELF ALL PASSED" : `SOLO SHELF FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
