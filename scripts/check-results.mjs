// Stage 3 (bonus): results and celebrations, through the real UI, with the
// outcomes controlled exactly. Extra players answer through the same intent
// API the phones use (their answers chosen with the content oracle, as an
// editor would); phones then open each player's own seat to see the result
// from their side.
//
//   2-player win · 3 players (middle, last) · 3-way tie (same story on every
//   phone) · a player who dropped out (answered nothing) · practice ·
//   official · 10 players with long names · refresh (same story) ·
//   reduced motion (no celebration) · the celebration never covers a button.
//
// Starts ITS OWN server (free port, temp data dir, the gate's build when
// MCHEZO_WEB_DIST is set) with MCHEZO_LIFECYCLE_SCALE=0.1, the test-only
// setting that makes time limits 10x shorter, so the game with a player who
// dropped out ends at its deadline in seconds. The base URL is ignored.
// Usage: node scripts/check-results.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { optionIndex } from "./lib/content-oracle.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-results-"));
async function startServer() {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR, MCHEZO_LIFECYCLE_SCALE: "0.1", MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
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
  throw new Error(`results server did not start: ${out.slice(-400)}`);
}
const server = await startServer();
const BASE = `http://localhost:${server.port}`;
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage3/${name}.png`) });

async function api(path, { token, body, method } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: method ?? (body ? "POST" : "GET"), headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
/** A room with a host seat and named guest seats, all made through the API. */
async function makeRoom(hostName, guestNames) {
  const room = await api("/rooms", { body: { name: "Results check" } });
  const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: hostName, asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: hostName, playerId: host.playerId, token: host.recoveryToken }];
  for (const n of guestNames) {
    const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (roomId, seat, gameInstanceId, action, payload) =>
  api(`/rooms/${roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId, action, payload } } });
const proj = (roomId, seat) => api(`/rooms/${roomId}/projection?audience=player`, { token: seat.token });

/** Start Trivia, everyone ready, then each seat answers `plan[i]` questions right (the rest wrong, or none if null). */
async function playTrivia(room, { official, plan }) {
  const host = room.seats[0];
  const start = await api(`/rooms/${room.roomId}/games`, { token: host.token, body: { gameId: "trivia", official } });
  const gid = start.gameId; // the new game instance
  for (const s of room.seats) await intent(room.roomId, s, gid, "briefing-ready", { ready: true });
  for (let i = 0; i < room.seats.length; i++) {
    const s = room.seats[i];
    const right = plan[i];
    if (right === null) continue; // dropped out: answers nothing
    let g;
    for (let t = 0; t < 40; t++) { // play begins once everyone is ready
      g = (await proj(room.roomId, s)).myGames.find((x) => x.id === gid);
      if (g?.status === "playing") break;
      await sleep(250);
    }
    for (const [k, q] of (g.state?.questions ?? []).entries()) {
      const idx = optionIndex("trivia", q.prompt, q.options, { wrong: k >= right });
      await intent(room.roomId, s, gid, "trivia-answer", { questionId: q.id, chosenIndex: idx });
    }
  }
  return gid;
}
/** Open a phone on a given seat (as if that person's own phone). */
async function phoneFor(browser, room, seat, viewport = { width: 390, height: 844 }, opts = {}, waitMs = 30000) {
  const ctx = await browser.newContext({ viewport, ...opts });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("results-hero").waitFor({ timeout: waitMs });
  return page;
}
/** S3-RES-01: open the Trivia reveal's Standings step; return the names listed and the toggle's state. */
async function standingsOf(page) {
  await page.getByTestId("mz-reveal-standings").click();
  await page.locator("ol.mz-standings").waitFor({ timeout: 10000 });
  return page.evaluate(() => ({
    rows: [...document.querySelectorAll("ol.mz-standings .mz-standings__name")].map((e) => e.textContent ?? ""),
    toggle: document.querySelector('[data-testid="standings-toggle"]')?.textContent ?? null,
    expanded: document.querySelector('[data-testid="standings-toggle"]')?.getAttribute("aria-expanded") ?? null,
    count: document.querySelector('[data-testid="standings-count"]')?.textContent ?? null,
  }));
}
const story = (page) => page.evaluate(() => ({
  headline: document.querySelector('[data-testid="results-headline"]')?.textContent ?? "",
  quip: document.querySelector('[data-testid="results-quip"]')?.textContent ?? "",
  you: document.querySelector('[data-testid="results-you"]')?.textContent ?? "",
  tone: document.querySelector('[data-testid="results-hero"]')?.getAttribute("data-tone") ?? "",
  confetti: !!document.querySelector('[data-testid="results-confetti"]'),
}));

const browser = await launchChromium();
try {
  // ---- two players: a clear win
  {
    const room = await makeRoom("Ada", ["Bea"]);
    await playTrivia(room, { official: true, plan: [10, 0] });
    const ada = await phoneFor(browser, room, room.seats[0]);
    const s = await story(ada);
    check("2 players: the winner is named", s.headline === "Ada wins Trivia Showdown", s.headline);
    check("2 players: the winner's phone celebrates", s.confetti);
    check("2 players: the winner's card says 1st of 2", s.you.includes("You came 1st of 2"), s.you);
    await shot(ada, "01-two-player-win-winner");
    const bea = await phoneFor(browser, room, room.seats[1]);
    const b = await story(bea);
    check("2 players: the other phone shows the same headline and line", b.headline === s.headline && b.quip === s.quip);
    check("2 players: no celebration for 2nd", !b.confetti);
    check("2 players: 2nd of 2", b.you.includes("You came 2nd of 2"), b.you);
    check("2 players: 2nd of 2 is never 'middle of the pack' (S3-RES-04)", !/middle|not first, not last/i.test(b.you), b.you);
    const bs = await standingsOf(bea);
    check("2 players: the standings list both players", bs.rows.length === 2 && bs.toggle === null, JSON.stringify(bs));
    await shot(bea, "02-two-player-win-second");
    // The celebration never covers a button.
    const covered = await ada.evaluate(() => {
      const c = document.querySelector('[data-testid="results-confetti"]');
      if (!c) return false;
      return getComputedStyle(c).pointerEvents !== "none";
    });
    check("the celebration never takes a tap", !covered);
    await sleep(1600);
    check("the celebration is over within about a second", !(await story(ada)).confetti);
    // Refresh: the same story.
    await ada.reload({ waitUntil: "domcontentloaded" });
    await ada.getByTestId("results-hero").waitFor({ timeout: 20000 });
    const r = await story(ada);
    check("refresh: same headline, same line", r.headline === s.headline && r.quip === s.quip);
    await ada.context().close(); await bea.context().close();
  }
  // ---- three players: middle and last; official
  {
    const room = await makeRoom("Ada", ["Bea", "Cal"]);
    await playTrivia(room, { official: true, plan: [8, 5, 1] });
    const cal = await phoneFor(browser, room, room.seats[2]);
    const c = await story(cal);
    check("3 players: last place reads 3rd of 3", c.you.includes("You came 3rd of 3"), c.you);
    check("3 players: the kicker says Official", /official/i.test(await cal.getByTestId("results-hero").innerText()));
    await shot(cal, "03-three-players-last");
    const bea = await phoneFor(browser, room, room.seats[1]);
    check("3 players: the middle reads 2nd of 3", (await story(bea)).you.includes("You came 2nd of 3"));
    await cal.context().close(); await bea.context().close();
  }
  // ---- three-way tie: the same story on every phone
  {
    const room = await makeRoom("Ada", ["Bea", "Cal", "Dee"]);
    await playTrivia(room, { official: true, plan: [6, 6, 6, 2] });
    const phones = [];
    for (const s of room.seats.slice(0, 3)) phones.push(await phoneFor(browser, room, s));
    const stories = await Promise.all(phones.map(story));
    check("3-way tie: named as a tie", stories[0].headline === "3-way tie for first", stories[0].headline);
    check("3-way tie: identical headline and line on all three phones", stories.every((x) => x.headline === stories[0].headline && x.quip === stories[0].quip));
    check("3-way tie: each phone says 'tied for 1st of 4'", stories.every((x) => x.you.includes("You tied for 1st of 4")));
    await shot(phones[1], "04-three-way-tie");
    for (const p of phones) await p.context().close();
  }
  // ---- a player who dropped out (answered nothing)
  {
    const room = await makeRoom("Ada", ["Bea", "Cal"]);
    await playTrivia(room, { official: true, plan: [7, 4, null] });
    // Cal never answers, so the game runs to its (scaled) deadline.
    const cal = await phoneFor(browser, room, room.seats[2], undefined, {}, 120000);
    const c = await story(cal);
    check("dropped out: told without blame", /missed this one/i.test(c.you), c.you);
    await shot(cal, "05-dropped-out");
    await cal.context().close();
    // S3-RES-01: the player who answered nothing is on every phone's standings, not just their own.
    for (const [i, who] of [[0, "Ada"], [1, "Bea"]]) {
      const p = await phoneFor(browser, room, room.seats[i]);
      const st = await standingsOf(p);
      check(`dropped out: ${who}'s standings list all 3 players, Cal included`, st.rows.length === 3 && st.rows.includes("Cal"), JSON.stringify(st.rows));
      if (i === 1) await shot(p, "05b-standings-all-three");
      await p.context().close();
    }
  }
  // ---- practice
  {
    const room = await makeRoom("Ada", ["Bea"]);
    await playTrivia(room, { official: false, plan: [3, 2] });
    const ada = await phoneFor(browser, room, room.seats[0]);
    check("practice: the kicker says Practice", /practice/i.test(await ada.getByTestId("results-hero").innerText()));
    check("practice: the line says it's practice", /[Pp]ractice/.test((await story(ada)).quip));
    await shot(ada, "06-practice");
    await ada.context().close();
    // S3-RES-04: 2nd of 2 with points is a head-to-head loss, never "the middle".
    const bea = await phoneFor(browser, room, room.seats[1]);
    const b = await story(bea);
    check("2nd of 2 with points: the runner-up line, not 'middle of the pack'", /You came 2nd of 2/.test(b.you) && /Second in a head-to-head/.test(b.you) && !/middle/i.test(b.you), b.you);
    await shot(bea, "06b-second-of-two");
    await bea.context().close();
  }
  // ---- ten players, long names; and reduced motion
  {
    const names = ["Bartholomew Otieno", "Christabel Nyambura", "Dmitri Kiprotich", "Esperanza Wambui", "Fitzgerald Mwangi", "Gwendolyn Achieng", "Maximilian Ochieng", "Ngozi Adebayo-Smith", "Amina-Josephine Wanjiku"];
    const room = await makeRoom("Keku", names);
    await playTrivia(room, { official: true, plan: [9, 9, 8, 7, 6, 5, 4, 3, 2, 1] });
    for (const w of [375, 390, 430]) {
      const p = await phoneFor(browser, room, room.seats[1], { width: w, height: 844 });
      const over = await p.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1);
      check(`10 players, long names, ${w}px: no sideways scrolling`, !over);
      await shot(p, `07-ten-players-${w}`);
      await p.context().close();
    }
    {
      const p = await phoneFor(browser, room, room.seats[6], { width: 375, height: 812 });
      const pre = await standingsOf(p);
      check("10 players: the standings start as a preview that says how many are shown", pre.rows.length < 10 && /Showing \d+ of 10 players/.test(pre.count ?? "") && pre.expanded === "false", JSON.stringify(pre));
      check("10 players: your own row is in the preview", pre.rows.includes("You"), JSON.stringify(pre.rows));
      await p.getByRole("button", { name: "Show all 10 players" }).click({ timeout: 5000 }).catch(() => {});
      const all = await p.evaluate(() => ({ rows: document.querySelectorAll("ol.mz-standings li").length, expanded: document.querySelector('[data-testid="standings-toggle"]')?.getAttribute("aria-expanded"), over: document.scrollingElement.scrollWidth > innerWidth + 1 }));
      check("10 players: Show all lists all 10, and says it is expanded", all.rows === 10 && all.expanded === "true", JSON.stringify(all));
      check("10 players: the full list fits 375px without sideways scrolling", !all.over);
      await shot(p, "08-ten-players-full-standings-375");
      await p.context().close();
    }
    const rm = await phoneFor(browser, room, room.seats[0], { width: 390, height: 844 }, { reducedMotion: "reduce" });
    const s = await story(rm);
    // Tied winners are named in name order, the same on every phone.
    check("10 players: a two-way tie at the top is named", s.headline === "Bartholomew Otieno and Keku tie for first", s.headline);
    check("reduced motion: no celebration, even for a winner", !s.confetti);
    await rm.context().close();
  }
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
  await sleep(500);
  rmSync(DATA_DIR, { recursive: true, force: true });
}
console.log(failures === 0 ? "RESULTS ALL PASSED" : `RESULTS FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
