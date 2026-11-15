// Stage 12.17 (docs/stage12/stage1217.md; D-S1217-01..04): Team Draw's Official gate, on two servers of its own.
//   A  the shipped content, NO content test mode: every drawing prompt is provisional. In a Family Cup of four the
//      host picks Team Draw: the host's lobby (390, 320 and 1440 px), a guest's lobby (320 px) and the TV all say it is
//      Practice only (the host's lobby with the reason); Official is disabled; the server refuses a forged Official start
//      (409, the same reason) and a guest's start. Practice from the lobby plays a whole game (3 rounds) to the end, and
//      the Cup standings don't move.
//   B  an isolated fixture: a copy of content/ whose approvals.json approves five year-round prompts at their exact
//      content hashes (reviewer "TEST FIXTURE (not an editorial approval)"; the shipped approvals file is never
//      touched). Six players (two dealt teams of three: 3 rounds). Official is offered; the host starts it; only each
//      team's drawer gets the word (phones, TV and the TV's data checked); a guesser gets only their own team's drawing;
//      a guesser and a drawer reload mid-round and get the same back; a teammate takes the pen from an idle drawer; the
//      game deals three of the five approved words and ends Official with the teams placed in the Cup. Then two
//      approved words are left: the lobby, the shared plan and the TV say Practice; back in the lobby, a Practice game
//      starts and is cancelled from its briefing, back to the lobby.
// Usage: node scripts/check-team-draw-content.mjs   (starts its own servers, like check-split-clues-content)
import { spawn, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { PROTOCOL_HEADERS } from "./lib/protocol.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
async function until(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* retry */ } await sleep(200); }
  return null;
}

const ROOT = new URL("..", import.meta.url).pathname;
const PROMPTS = JSON.parse(readFileSync(join(ROOT, "content", "packs", "draw-prompts.json"), "utf8")).items;
const wordOf = Object.fromEntries(PROMPTS.map((p) => [p.id, p.word]));
// Five year-round words, none of them a team's name or colour (coral, sun, mint, iris).
const APPROVE = ["dg-011", "dg-013", "dg-014", "dg-016", "dg-017"];
const APPROVED_WORDS = new Set(APPROVE.map((id) => wordOf[id]));

/**
 * As check-split-clues-content (review 6895557386, R2): everything this driver starts or creates is tracked here and
 * released in the final `finally`, whatever happened: each server is stopped and its exit awaited before its data
 * directory is deleted, and each fixture copy is deleted. When the run failed, each server's output is printed first.
 */
const owned = { servers: [], dirs: [] };

async function stopServer(s) {
  if (s.child.exitCode === null && s.child.signalCode === null) {
    const exited = new Promise((r) => s.child.once("exit", r));
    s.child.kill("SIGTERM");
    const hard = setTimeout(() => s.child.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(hard);
  }
  rmSync(s.data, { recursive: true, force: true });
}

/** A server of this driver's own: fresh data, no content test mode, optionally another content directory. */
async function startServer(label, extraEnv = {}) {
  const data = mkdtempSync(join(tmpdir(), `mz-s1217-${label}-`));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: data, ...extraEnv };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
  const s = { label, data, child, out: "" };
  owned.servers.push(s);
  child.stdout.on("data", (d) => { s.out += d; }); child.stderr.on("data", (d) => { s.out += d; });
  let port = null;
  for (let i = 0; i < 160 && !port && child.exitCode === null; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(s.out); if (m) port = Number(m[1]); else await sleep(250); }
  if (!port) throw new Error(`${label}: the server did not start (exit code ${child.exitCode}): ${s.out.slice(-300).replace(/\s+/g, " ")}`);
  check(`${label}: the server runs without the content test mode`, !/provisional content treated as approved/.test(s.out));
  return { base: `http://localhost:${port}`, stop: () => stopServer(s) };
}

/** The isolated fixture: a copy of content/ plus TEST FIXTURE approvals for `ids` at the hashes the real loader computes. */
function fixtureContent(ids) {
  const dir = mkdtempSync(join(tmpdir(), "mz-s1217-fixture-"));
  owned.dirs.push(dir);
  cpSync(join(ROOT, "content"), dir, { recursive: true });
  const hashes = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", "import('./src/content/registry.ts').then((m) => { const lib = m.loadContent(process.env.FIXTURE_DIR); process.stdout.write(JSON.stringify(Object.fromEntries((lib.byGame.get('draw-prompts') ?? []).map((li) => [li.item.id, li.hash])))); })"], { cwd: ROOT, env: { ...process.env, FIXTURE_DIR: dir, MCHEZO_CONTENT_TEST_MODE: "" }, encoding: "utf8" }));
  const file = join(dir, "approvals.json");
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { schemaVersion: 1, approvals: [] };
  for (const id of ids) existing.approvals.push({ itemId: id, hash: hashes[id], reviewer: "TEST FIXTURE (not an editorial approval)", date: "2026-11-15", note: "Stage 12.17 driver fixture, in a temporary copy of content/" });
  writeFileSync(file, JSON.stringify(existing, null, 2));
  return { dir, hashes };
}

let browser;
const phone = (width = 390) => browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" }).then((c) => c.newPage());
const shot = async (page, name) => { await page.mouse.move(1, 1); await page.screenshot({ path: screenshotPath(`docs/stage12/stage1217-screenshots/${name}.png`) }); };
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : "");
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
// A word can be a team's name or colour ("sun", Team Sun): both are scrubbed before looking for the word (as check-team-draw).
const scrubText = (t) => t.replace(/\bTeam (Coral|Sun|Mint|Iris)\b/gi, "Team ·");
const scrubData = (j) => j.replace(/"color":"(coral|sun|mint|iris)"/gi, '"color":"·"');
const wordRe = (w) => new RegExp(`\\b${w.replace(/[^a-z ]/gi, "").replace(/ /g, "\\s+")}\\b`, "i");
const sigOf = (pieces) => `${(pieces ?? []).length}:${(pieces ?? []).reduce((n, x) => n + x.p.length / 2, 0)}`;
const LINE = { pieces: [{ s: 1, c: 1, w: 1, p: [120, 200, 500, 520, 880, 300] }] };
async function stroke(p) {
  const box = await p.getByTestId("mz-dg-board").boundingBox();
  await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 12 });
  await p.mouse.up();
}

/** One room on `base`, made a Family Cup: host Keku (390 px) and the guests [name, width]. */
async function cupRoom(base, guests) {
  const api = async (path, { token, body } = {}) => {
    const headers = { "content-type": "application/json", ...PROTOCOL_HEADERS };
    if (token) headers["x-session-token"] = token;
    const r = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const ok = async (path, opts) => { const r = await api(path, opts); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
  const host = await phone();
  await host.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await host.getByTestId("home-host").click();
  await host.getByPlaceholder("e.g. Auntie June").fill("Keku");
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  const chip = host.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  const pages = [host];
  for (const [name, width] of guests) {
    const p = await phone(width);
    await p.goto(`${base}/join`, { waitUntil: "domcontentloaded" });
    await p.getByPlaceholder("e.g. Auntie June").fill(name);
    await p.locator(".mz-code__input").fill(code);
    await p.getByRole("button", { name: "Join the game" }).click();
    await p.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
    pages.push(p);
  }
  const seats = [];
  for (const p of pages) seats.push(await p.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") })));
  const roomId = seats[0].roomId;
  await ok(`/rooms/${roomId}/cup`, { token: seats[0].token, body: {} });
  const tvProj = () => ok(`/rooms/${roomId}/projection?audience=tv`);
  await until(async () => (await tvProj()).roomKind === "cup");
  const intent = (seat, gid, action, payload) => ok(`/rooms/${roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId: gid, action, payload } } });
  const myState = async (seat, gid) => (await ok(`/rooms/${roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid)?.state;
  const view = async (seat) => (await ok(`/rooms/${roomId}/projection?audience=player`, { token: seat.token })).officialContent?.["team-draw"];
  const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })).newPage();
  await tv.goto(`${base}/tv?code=${code}`, { waitUntil: "domcontentloaded" });
  await tv.getByTestId("tv-show").waitFor({ timeout: 20000 });
  const pageOf = (seat) => pages[seats.findIndex((s) => s.playerId === seat.playerId)];
  return { base, code, host, pages, seats, roomId, api, ok, tvProj, intent, myState, view, tv, pageOf };
}

/** Waits for round `round`'s drawing phase; returns each team's drawer seat and the word (from the drawer's own view). */
async function roundOf(r, gid, round) {
  const g = await until(async () => { const x = (await r.tvProj()).games.find((y) => y.id === gid); return x?.state?.phase === "draw" && x.state.round === round ? x : null; }, 40000);
  if (!g) return null;
  const teamOf = (s) => g.teams?.members?.[s.playerId];
  const teams = {};
  for (const t of g.state.teamStatus) {
    const drawer = r.seats.find((s) => s.playerId === t.drawerId);
    teams[t.teamId] = { drawer, mates: r.seats.filter((s) => teamOf(s) === t.teamId && s.playerId !== t.drawerId), word: (await r.myState(drawer, gid))?.myWord };
  }
  return { g, teamOf, teams };
}
/** Every team's drawer draws and a teammate (who hasn't seen the word) guesses it, over the API. */
async function solveRound(r, gid, round, info, skip = new Set()) {
  for (const [teamId, t] of Object.entries(info.teams)) {
    if (skip.has(teamId)) continue;
    await r.intent(t.drawer, gid, "team-draw-strokes", { round, ...LINE });
    await r.intent(t.mates[0], gid, "team-draw-guess", { round, text: t.word });
  }
}

try {
  browser = await launchChromium();
  // ---- A: shipped content, nothing approved ----
  const A = await startServer("A");
  const ra = await cupRoom(A.base, [["Amina", 390], ["Baraka", 390], ["Wanjiru", 320]]);
  const [k, a] = ra.seats;
  const wanjiru = ra.pages[3];
  await ra.host.getByTestId("choose-game").click();
  await ra.host.getByTestId("select-game-team-draw").click();
  const reason = await soon("A the host's lobby says Team Draw is Practice only, and why (no approved words)", async () => {
    const note = await text(ra.host.getByTestId("practice-only-note"));
    return /Practice only: Team Draw counts only with drawing words a person has approved/.test(note) && /0 unused approved words/.test(note) && /this game has 3 rounds/.test(note) && /Play it as Practice/.test(note) ? note : null;
  });
  console.log(`  (the note: ${reason})`);
  check("A Official is disabled; Practice is the start", await ra.host.getByTestId("mode-official").isDisabled() && (await ra.host.locator("[data-testid='start-practice-team-draw']").count()) === 1);
  const v0 = await ra.view(k);
  check("A the server's lobby view: 0 of 3 (four players, two teams of two), with the reason; counts only", v0?.available === 0 && v0?.needed === 3 && /approved/.test(v0?.message ?? ""), JSON.stringify(v0));
  check("A the shared plan is Team Draw · Practice for everyone", JSON.stringify((await ra.tvProj()).upNext) === JSON.stringify({ gameId: "team-draw", official: false }) && JSON.stringify((await ra.ok(`/rooms/${ra.roomId}/projection?audience=player`, { token: a.token })).upNext) === JSON.stringify({ gameId: "team-draw", official: false }), JSON.stringify((await ra.tvProj()).upNext));
  // A guest's lobby has no reason note (the host's lobby does, as for Split Clues; this stage changes no UI): it says
  // Practice only on the Up next card and in the waiting line, and never Official.
  await soon("A a guest's lobby (320 px) agrees: Team Draw up next, Practice only · no Cup points, waiting for a Practice start", async () => {
    const card = await text(wanjiru.getByTestId("up-next-card"));
    const waiting = (await text(wanjiru.locator("body"))).split("\n").find((l) => /Waiting for Keku to start Team Draw/.test(l)) ?? "";
    return /Team Draw/.test(card) && /Practice only · no Cup points/.test(card) && !/Official/.test(card) && /Practice, no Cup points/.test(waiting) && !/Official/.test(waiting) ? `${card.replace(/\s+/g, " ")} | ${waiting}` : null;
  });
  check("A guests can't choose or start a game", (await wanjiru.getByTestId("choose-game").count()) === 0 && (await wanjiru.locator("[data-testid^='start-official-'], [data-testid^='start-practice-']").count()) === 0);
  await soon("A the TV says the same: Up next Team Draw · Practice", async () => { const t = await text(ra.tv.getByTestId("tv-up-next")); return /Team Draw/.test(t) && /Practice · no Cup points/.test(t) && !/Official/.test(t); });
  await shot(ra.host, "cup-lobby-practice-only-390");
  await shot(wanjiru, "guest-lobby-practice-only-320");
  await shot(ra.tv, "tv-lobby-practice-1920");
  check("A 320 px guest lobby: no sideways scroll", await noSideScroll(wanjiru));
  const forged = await ra.api(`/rooms/${ra.roomId}/games`, { token: k.token, body: { gameId: "team-draw", official: true } });
  check("A a forged Official start by the host is refused (409, the same reason), and nothing starts", forged.status === 409 && forged.body.code === "CONTENT_EXHAUSTED" && forged.body.available === 0 && forged.body.needed === 3 && /Team Draw counts only with drawing words a person has approved/.test(forged.body.error) && (await ra.tvProj()).games.length === 0, JSON.stringify(forged));
  const guest = await ra.api(`/rooms/${ra.roomId}/games`, { token: a.token, body: { gameId: "team-draw", official: true } });
  check("A a guest's Official start is refused", guest.status >= 400 && (await ra.tvProj()).games.length === 0, `${guest.status} ${JSON.stringify(guest.body)}`);
  for (const [width, height, name] of [[320, 844, "320"], [1440, 900, "desktop-1440"]]) {
    const hp = await (await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })).newPage();
    await hp.goto(`${A.base}/join`, { waitUntil: "domcontentloaded" });
    await hp.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, k);
    await hp.goto(`${A.base}/room`, { waitUntil: "domcontentloaded" });
    await soon(`A at ${width} px the host's lobby says the same, with Official disabled`, async () => /Practice only: Team Draw counts only/.test(await text(hp.getByTestId("practice-only-note"))) && await hp.getByTestId("mode-official").isDisabled());
    await hp.getByTestId("practice-only-note").scrollIntoViewIfNeeded();
    await shot(hp, `cup-lobby-practice-only-${name}`);
    check(`A ${width} px: no sideways scroll`, await noSideScroll(hp));
    await hp.context().close();
  }
  const standingsBefore = JSON.stringify((await ra.tvProj()).championship ?? []);
  await ra.host.getByTestId("start-practice-team-draw").click();
  const ga = await until(async () => (await ra.tvProj()).games.find((g) => g.gameId === "team-draw"));
  check("A Practice from the lobby starts, as Practice", ga?.official === false, JSON.stringify({ official: ga?.official, status: ga?.status }));
  for (const s of ra.seats) await ra.intent(s, ga.id, "briefing-ready", { ready: true });
  const wordsA = [];
  for (let round = 0; round < 3; round++) {
    const info = await roundOf(ra, ga.id, round);
    if (!info) { check(`A round ${round + 1} began`, false); break; }
    const words = Object.values(info.teams).map((t) => t.word);
    wordsA.push(words[0]);
    if (round === 0) {
      check("A round 1: every team's drawer has the same word, from the pack", words.every((w) => w && w === words[0]) && PROMPTS.some((p) => p.word === words[0]), JSON.stringify(words));
      const drawerSeat = Object.values(info.teams)[0].drawer;
      await soon("A the drawer's phone shows the word", async () => wordRe(words[0]).test(await text(ra.pageOf(drawerSeat).getByTestId("mz-td-word"))));
      await shot(ra.pageOf(drawerSeat), `practice-drawer-${(await ra.pageOf(drawerSeat).viewportSize()).width}`);
    }
    await solveRound(ra, ga.id, round, info);
  }
  const finA = await until(async () => { const g = (await ra.tvProj()).games.find((x) => x.id === ga.id); return g?.status === "finished" ? g : null; }, 40000);
  check("A the practice game played three rounds to the end, three different words", finA?.status === "finished" && new Set(wordsA).size === 3, JSON.stringify(wordsA));
  check("A it ended as Practice: nothing counted, the Cup standings are as before", finA?.official === false && JSON.stringify((await ra.tvProj()).championship ?? []) === standingsBefore);
  await soon("A the host's phone shows the practice game's results, as Practice", async () => (await ra.host.getByTestId("mz-td-results").count()) === 1 && /practice/i.test(await text(ra.host.locator("main"))) && !/counts toward the Family Cup/i.test(await text(ra.host.locator("main"))));
  await sleep(400);
  await shot(ra.host, "practice-results-390");
  for (const p of [...ra.pages, ra.tv]) await p.context().close();
  await A.stop();

  // ---- B: an isolated fixture with five approved year-round prompts ----
  const fx = fixtureContent(APPROVE);
  const shippedApprovals = () => { const f = join(ROOT, "content", "approvals.json"); return existsSync(f) ? readFileSync(f, "utf8") : ""; };
  const shippedBefore = shippedApprovals();
  check("B the fixture is a temporary copy outside the repository, approving exactly the five at their hashes; the shipped content has no drawing-prompt approval", !fx.dir.startsWith(ROOT) && APPROVE.every((id) => /^[0-9a-f]{16}$/.test(fx.hashes[id])) && !/"dg-\d{3}"/.test(shippedBefore), `shipped approvals file: ${shippedBefore ? "present" : "none"}`);
  const B = await startServer("B", { MCHEZO_CONTENT_DIR: fx.dir });
  const rb = await cupRoom(B.base, [["Amina", 390], ["Baraka", 390], ["Wanjiru", 320], ["Zawadi", 390], ["Juma", 320]]);
  const tv = rb.tv;
  await rb.host.getByTestId("choose-game").click();
  await rb.host.getByTestId("select-game-team-draw").click();
  await soon("B with five approved words (3 rounds), Official is offered: enabled, no practice-only note", async () => !(await rb.host.getByTestId("mode-official").isDisabled()) && (await rb.host.getByTestId("practice-only-note").count()) === 0);
  const vb = await rb.view(rb.seats[0]);
  check("B the server's lobby view: enough for 3 rounds (six players, two teams of three)", vb?.available === 3 && vb?.needed === 3, JSON.stringify(vb));
  await rb.host.getByTestId("mode-official").click();
  await soon("B the host's start is Official", async () => (await rb.host.locator("[data-testid='start-official-team-draw']").count()) === 1);
  await soon("B the TV's Up next says Official", async () => /Official · counts toward the Cup/.test(await text(tv.getByTestId("tv-up-next"))));
  await shot(rb.host, "cup-lobby-official-390");
  await rb.host.getByTestId("start-official-team-draw").click();
  const gb = await until(async () => (await rb.tvProj()).games.find((g) => g.gameId === "team-draw"));
  check("B the game started as Official", gb?.official === true, JSON.stringify({ official: gb?.official, status: gb?.status }));
  await soon("B the TV's briefing says Official", async () => /^official\b/i.test(await text(tv.getByTestId("tv-briefing"))) && !/practice/i.test(await text(tv.getByTestId("tv-briefing"))));
  await shot(tv, "tv-briefing-official-1920");
  for (const s of rb.seats) await rb.intent(s, gb.id, "briefing-ready", { ready: true });

  // Round 1: privacy and reloads.
  const r0 = await roundOf(rb, gb.id, 0);
  const wordsB = [];
  if (!r0) check("B round 1 began", false);
  else {
    const [tA, tB] = Object.keys(r0.teams);
    const w0 = r0.teams[tA].word;
    wordsB.push(w0);
    check("B round 1: both drawers have the same word, one of the approved five", Object.values(r0.teams).every((t) => t.word === w0) && APPROVED_WORDS.has(w0), w0);
    let phonesRight = true;
    for (const s of rb.seats) {
      const p = rb.pageOf(s);
      const isDrawer = Object.values(r0.teams).some((t) => t.drawer.playerId === s.playerId);
      await until(async () => (await p.getByTestId(isDrawer ? "mz-td-draw" : "mz-td-guess").count()) === 1, 10000);
      if (isDrawer !== wordRe(w0).test(scrubText(await p.locator("main").innerText()))) phonesRight = false;
    }
    check("B only the drawers' phones show the word", phonesRight);
    // Team A's drawer draws with the mouse; its guesser sees exactly that; team B's guesser sees an empty page.
    const drawerA = rb.pageOf(r0.teams[tA].drawer);
    await stroke(drawerA);
    const guesserA = r0.teams[tA].mates[0], guesserB = r0.teams[tB].mates[0];
    const serverSig = await until(async () => { const v = await rb.myState(guesserA, gb.id); return (v?.pieces ?? []).length ? sigOf(v.pieces) : null; }, 10000);
    await soon("B team A's guesser sees exactly the server's drawing of their own team", async () => (await rb.pageOf(guesserA).getByTestId("mz-td-board").getAttribute("data-sig")) === serverSig);
    check("B team B's guesser sees an empty page (their own team's, not team A's)", (await rb.pageOf(guesserB).getByTestId("mz-td-board").getAttribute("data-sig")) === "0:0");
    const tvData = scrubData(JSON.stringify((await rb.tvProj()).games.find((g) => g.id === gb.id)));
    check("B the TV (screen and data) has neither the word nor any drawing", !wordRe(w0).test(scrubText(await tv.locator("body").innerText())) && !tvData.toLowerCase().includes(`"${w0.toLowerCase()}"`) && !tvData.includes("\"pieces\""));
    await shot(drawerA, `official-drawer-${(await drawerA.viewportSize()).width}`);
    await shot(tv, "tv-draw-official-1920");
    // Reloads mid-round: the guesser gets their team's drawing back and still no word; the drawer keeps the pen and the word.
    const gp = rb.pageOf(guesserA);
    await gp.reload({ waitUntil: "domcontentloaded" });
    await soon("B after a reload, team A's guesser gets their team's drawing back, and still no word", async () => (await gp.getByTestId("mz-td-board").getAttribute("data-sig")) === serverSig && !wordRe(w0).test(scrubText(await gp.locator("main").innerText())));
    await shot(gp, `official-guesser-after-reload-${(await gp.viewportSize()).width}`);
    const dpB = rb.pageOf(r0.teams[tB].drawer);
    await dpB.reload({ waitUntil: "domcontentloaded" });
    await soon("B after a reload, team B's drawer still has the pen and the word", async () => (await dpB.getByTestId("mz-td-draw").count()) === 1 && wordRe(w0).test(await text(dpB.getByTestId("mz-td-word"))));
    // Team A guesses on the phone; team B over the API.
    await soon("B team A's guess box is open", async () => !(await gp.getByTestId("mz-td-input").isDisabled()));
    await gp.getByTestId("mz-td-input").fill(w0.toUpperCase());
    await gp.getByTestId("mz-td-send").click();
    await soon("B team A got it, on the phone", async () => /got it/.test(await text(gp.getByTestId("mz-td-status"))));
    await solveRound(rb, gb.id, 0, r0, new Set([tA]));
  }

  // Round 2: a teammate takes the pen from an idle drawer.
  const r1 = await roundOf(rb, gb.id, 1);
  if (!r1) check("B round 2 began", false);
  else {
    const [tA, tB] = Object.keys(r1.teams);
    wordsB.push(r1.teams[tA].word);
    const idle = r1.teams[tA].drawer, taker = r1.teams[tA].mates[0], last = r1.teams[tA].mates[1];
    const takerPage = rb.pageOf(taker);
    check("B no take-over before 20 s", (await takerPage.getByTestId("mz-td-takeover").count()) === 0);
    const takeBtn = await soon("B after 20 s without drawing, a teammate is offered the pen", async () => ((await takerPage.getByTestId("mz-td-takeover").count()) ? takerPage.getByTestId("mz-td-takeover") : null), 30000);
    await shot(takerPage, `takeover-offer-${(await takerPage.viewportSize()).width}`);
    await takeBtn?.click();
    await soon("B the taker's phone now draws, with the word", async () => (await takerPage.getByTestId("mz-td-draw").count()) === 1 && wordRe(r1.teams[tA].word).test(await text(takerPage.getByTestId("mz-td-word"))));
    await soon("B the idle drawer hears it and can't guess", async () => /took the pen from you/.test(await text(rb.pageOf(idle).getByTestId("mz-td-handoff"))) && /seen the word/.test(await text(rb.pageOf(idle).getByTestId("mz-td-status"))));
    await rb.intent(taker, gb.id, "team-draw-strokes", { round: 1, ...LINE });
    await rb.intent(last, gb.id, "team-draw-guess", { round: 1, text: r1.teams[tA].word });
    await solveRound(rb, gb.id, 1, r1, new Set([tA]));
    void tB;
  }

  // Round 3, then the results.
  const r2 = await roundOf(rb, gb.id, 2);
  if (!r2) check("B round 3 began", false);
  else { wordsB.push(Object.values(r2.teams)[0].word); await solveRound(rb, gb.id, 2, r2); }
  const finB = await until(async () => { const g = (await rb.tvProj()).games.find((x) => x.id === gb.id); return g?.status === "finished" ? g : null; }, 40000);
  check("B the Official game dealt three different approved words", wordsB.length === 3 && new Set(wordsB).size === 3 && wordsB.every((w) => APPROVED_WORDS.has(w)), JSON.stringify(wordsB));
  check("B it finished Official, with team results and Cup placements", finB?.status === "finished" && finB.official === true && (finB.teamResults?.length ?? 0) === 2 && !!finB.cupPlacement, JSON.stringify({ status: finB?.status, official: finB?.official, teams: finB?.teamResults?.map((t) => [t.teamId, t.rank, t.score]) }));
  check("B every player scored their team's points", !!finB && rb.seats.every((s) => finB.rawScores[s.playerId] === finB.teamResults.find((t) => t.teamId === finB.teams.members[s.playerId])?.score));
  await soon("B the host's phone shows the results, as Official", async () => (await rb.host.getByTestId("mz-td-results").count()) === 1 && /official/i.test(await text(rb.host.locator("main"))));
  await soon("B the TV leads with the team result", async () => (await tv.getByTestId("tv-team-results").count()) === 1);
  // What's next: two approved words are left, fewer than a game needs.
  const after = await rb.view(rb.seats[0]);
  check("B afterwards the lobby view: 2 unused approved words for 3 rounds, with the reason", after?.available === 2 && after?.needed === 3 && /this Cup has 2 unused approved words/.test(after?.message ?? ""), JSON.stringify(after));
  check("B the shared plan now says Team Draw · Practice (it can no longer be Official here)", JSON.stringify((await rb.tvProj()).upNext) === JSON.stringify({ gameId: "team-draw", official: false }), JSON.stringify((await rb.tvProj()).upNext));
  await soon("B the TV's Next up line says Practice, not Official", async () => { const t = await text(tv.getByTestId("tv-next")); return /Team Draw/.test(t) && /Practice/.test(t) && !/Official/.test(t); });
  await sleep(600);
  await shot(rb.host, "official-results-390");
  await shot(tv, "tv-final-official-1920");
  await rb.host.getByTestId("show-back-to-lobby").click();
  await soon("B back in the lobby, the host sees Practice only: 2 unused approved words", async () => /Practice only: Team Draw counts only/.test(await text(rb.host.getByTestId("practice-only-note"))) && /2 unused approved words/.test(await text(rb.host.getByTestId("practice-only-note"))) && await rb.host.getByTestId("mode-official").isDisabled());
  await rb.host.getByTestId("practice-only-note").scrollIntoViewIfNeeded();
  await shot(rb.host, "lobby-after-official-390");
  await rb.host.getByTestId("start-practice-team-draw").click();
  const next = await until(async () => (await rb.tvProj()).games.find((g) => g.gameId === "team-draw" && g.id !== gb.id));
  check("B the next game starts as Practice", next?.official === false && next?.status === "briefing", JSON.stringify({ official: next?.official, status: next?.status }));
  await soon("B the host can cancel it from the briefing", async () => (await rb.host.getByTestId("briefing-cancel").count()) === 1);
  await rb.host.getByTestId("briefing-cancel").click();
  await rb.host.getByTestId("briefing-cancel-confirm").waitFor({ timeout: 5000 });
  check("B the cancel says it goes back to the lobby, with nothing scored or used up", /back to the lobby/.test(await text(rb.host.getByTestId("briefing-cancel-destination"))) && /Nothing is scored or used up/.test(await text(rb.host.getByTestId("briefing-cancel-confirm"))));
  await rb.host.getByTestId("briefing-cancel-confirm-confirm").click();
  await soon("B cancelled: no game left in its briefing, and the host is back in the lobby", async () => !(await rb.tvProj()).games.some((g) => g.id === next?.id && g.status === "briefing") && (await rb.host.getByTestId("choose-game").count()) === 1);
  for (const p of [...rb.pages, tv]) await p.context().close();
  await B.stop();
  rmSync(fx.dir, { recursive: true, force: true });
  check("B the shipped approvals are unchanged after the fixture run", shippedApprovals() === shippedBefore);
  console.log(`note: practice words ${wordsA.join(", ")}; official words ${wordsB.join(", ")}`);
} catch (e) {
  check("the driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  if (failures) for (const s of owned.servers) console.log(`--- server ${s.label} output (last 2000 characters) ---\n${s.out.slice(-2000)}`);
  await browser?.close().catch((e) => console.log(`cleanup: closing the browser failed: ${e}`));
  for (const s of owned.servers) await stopServer(s).catch((e) => console.log(`cleanup: stopping server ${s.label} failed: ${e}`));
  for (const d of owned.dirs) rmSync(d, { recursive: true, force: true });
  const running = owned.servers.filter((s) => s.child.exitCode === null && s.child.signalCode === null).map((s) => s.label);
  const left = [...owned.servers.map((s) => s.data), ...owned.dirs].filter((d) => existsSync(d));
  console.log(`cleanup: ${owned.servers.length} server(s) stopped, ${owned.servers.length + owned.dirs.length} temporary dir(s) removed; still running: ${running.length ? running.join(", ") : "none"}; left on disk: ${left.length ? left.join(", ") : "none"}`);
  if (running.length || left.length) failures++;
}
console.log(failures === 0 ? "TEAM DRAW CONTENT PASSED" : `TEAM DRAW CONTENT FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
