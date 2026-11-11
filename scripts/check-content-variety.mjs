// Stage 7.4: content variety in solo and casual rooms, and the cancel
// wording, end to end in the browser (docs/stage7/stage74.md §5).
//
// A and B start ITS OWN server (free port, temp data dir, the gate's build
// when MCHEZO_WEB_DIST is set) with MCHEZO_CONTENT_DIR (testing only) set to a
// small controlled pool (scripts/lib/small-pool.mjs): one practice-only Word
// Connections board, two approved official boards and one rejected board.
// C uses the gate's server (the base URL argument) and the shipped library.
//   A  solo Word Connections, played four times through Play again: the
//      three usable boards, each once (practice-only and approved alike),
//      then the least recently used; the rejected board never.
//   A2 the own server restarts (same port, same data): Play again in the same
//      tab starts a round (a pre-existing solo defect, spec §7.4) and deals
//      the least recently used board.
//   A3 a stale press: tab 1's Start is held while tab 2 starts Pulse; tab 1 is
//      refused (another tab), nothing changes, and Try again starts.
//   A4 review 6786060026: tab A's Start never reaches the server while tab B
//      starts the same game; A sends its press again unchanged, is refused,
//      and never adopts B's round; B is undisturbed.
//   B  a casual room, Ada hosting and Bea, with a lineup of Word Connections
//      then Math Mayhem:
//        1. Connections picked by hand: board 1; the lineup's item stays pending;
//        2. Play again, then Cancel in its briefing: the confirmation names the
//           results ("You'll go back to the Word Connections results."), and
//           both phones are back on them; nothing changed; the cancelled
//           press sent again starts nothing (ATTEMPT_ENDED);
//        3. Play again: board 2, unused; the lineup unchanged;
//        4. the lineup's Next game: board 3, unused; the item is now played;
//        5. Play again: board 1 again (the least recently used);
//        6. Back to lobby, the lineup's Math started and cancelled: the
//           confirmation names the lobby, and Ada is back in it; Bea, who
//           kept the results open, is back on them; Math still up next.
//   C  shipped library, the gate's server: solo Word Connections started over
//      and over: every shipped board (none rejected) before any repeats,
//      then the least recently used; each board is a real shipped board.
//      Stage 8.2: a solo room is Everyday unless Christmas is chosen, so that
//      is every year-round board (no season tag), and never a Christmas one
//      (check-themes-seasonal covers Christmas sessions).
// Board identity is read from the words on screen and checked against the
// pool (or the shipped packs): never assumed from "a random draw differs".
// Usage: node scripts/check-content-variety.mjs <baseUrl>   (the gate passes its server)
import { execSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { SMALL_CONNECTIONS_USABLE, boardIdFor, writeSmallPool } from "./lib/small-pool.mjs";

const GATE_BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
/** Screenshots (visual evidence only), with a manifest naming the exact revision. */
const shots = [];
async function shot(page, defaultPath, screen) {
  const path = screenshotPath(defaultPath);
  await page.screenshot({ path });
  const vp = page.viewportSize();
  shots.push({ path, file: basename(path), screen, viewport: `${vp.width}×${vp.height}` });
}
function writeManifest() {
  if (!shots.length) return;
  let revision = "unknown", clean = false;
  try { revision = execSync("git rev-parse HEAD").toString().trim(); clean = execSync("git status --porcelain --untracked-files=no").toString().trim() === ""; } catch { /* not a checkout */ }
  writeFileSync(join(dirname(shots[0].path), "manifest.json"), JSON.stringify({ revision, workingTreeClean: clean, capturedAt: new Date().toISOString(), by: "scripts/check-content-variety.mjs", note: "Chromium headless (Playwright) only; not a real iPhone or Android device, not WebKit.", shots: shots.map(({ file, screen, viewport }) => ({ file, screen, viewport })) }, null, 2) + "\n");
}
const text = async (loc) => ((await loc.innerText({ timeout: 5000 })) ?? "").replace(/\s+/g, " ").trim();

// ---- The own server, with the small pool ----
const POOL_DIR = mkdtempSync(join(tmpdir(), "mz-variety-pool-"));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mz-variety-data-"));
const POOL = writeSmallPool(POOL_DIR);
const groupsOf = (id) => POOL.boards.find((b) => b.id === id).groups;
async function startServer(fixedPort = 0) {
  const env = { ...process.env, PORT: String(fixedPort), MCHEZO_DATA_DIR: DATA_DIR, MCHEZO_CONTENT_DIR: POOL_DIR };
  delete env.NODE_ENV;
  delete env.MCHEZO_CONTENT_TEST_MODE; // the pool's statuses are explicit
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  let port = null;
  for (let i = 0; i < 160 && port === null && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) port = Number(m[1]); else await sleep(250);
  }
  if (!port) throw new Error(`variety server did not start: ${out.slice(-400)}`);
  return { child, port, out: () => out };
}
async function stopServer(proc) {
  proc.child.kill("SIGTERM");
  for (let i = 0; i < 20; i++) { if (proc.child.exitCode !== null || proc.child.signalCode !== null) return; await sleep(250); }
  proc.child.kill("SIGKILL");
}

// ---- Page helpers ----
async function host(page, base, name) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
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
async function joinRoom(page, base, name, code) {
  await page.goto(`${base}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
/** A call from the page with its own seat. */
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(path.replace(":room", roomId), { method, headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { method, path, body });
const myRoom = async (page) => (await api(page, "GET", "/rooms/:room/projection?audience=player")).body;
const dockStart = (page) => page.locator('[data-testid="lobby-dock"] button.mz-key--block').first();
const shownWords = async (page) => (await page.getByTestId("mz-cx-tile").allInnerTexts()).map((w) => w.trim());
const tileFor = (p, w) => p.getByTestId("mz-cx-tile").filter({ hasText: new RegExp(`^\\s*${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") });
/** Solve a Connections board group by group, as a player would. */
async function solve(page, groups) {
  for (const g of groups) {
    for (const w of g) await tileFor(page, w).click();
    await page.getByTestId("mz-cx-submit").click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="mz-cx-tile"][aria-pressed="true"]').length === 0 || !document.querySelector('[data-testid="mz-cx-tile"]'), null, { timeout: 15000 });
  }
}
/** The board on screen: which pool board it is (null if none). */
async function poolBoard(page) {
  await page.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="mz-cx-tile"]').length === 16, null, { timeout: 10000 });
  return boardIdFor(POOL, await shownWords(page));
}

const browser = await launchChromium();
let own = await startServer();
const OWN = `http://localhost:${own.port}`;
check("setup: the own server loaded the small pool (not the shipped library)", /TEST MODE: content loaded from .* \(29 items\), not the shipped library/.test(own.out()) && !/\[content\]/.test(own.out()), own.out().split("\n").find((l) => /content loaded/.test(l)) ?? "");
try {
  // ---- A. Solo Word Connections, four times ----
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sp = await sctx.newPage();
  await sp.goto(`${OWN}/solo/word-connections`, { waitUntil: "domcontentloaded" });
  await sp.getByTestId("solo-round-start").click();
  const solo = [];
  for (let i = 0; i < 4; i++) {
    if (i > 0) await sp.getByTestId("solo-play-again").click();
    const id = await poolBoard(sp);
    solo.push(id);
    await solve(sp, groupsOf(id ?? SMALL_CONNECTIONS_USABLE[0]));
    await sp.getByTestId("solo-results").waitFor({ timeout: 20000 });
  }
  check("A solo: every board dealt is a pool board, and never the rejected one", solo.every((id) => id && SMALL_CONNECTIONS_USABLE.includes(id)), JSON.stringify(solo));
  check("A solo: the first three are the three usable boards, each once (practice-only and both approved)", new Set(solo.slice(0, 3)).size === 3 && SMALL_CONNECTIONS_USABLE.every((id) => solo.slice(0, 3).includes(id)), JSON.stringify(solo.slice(0, 3)));
  check("A solo: the fourth is the least recently used (the first again)", solo[3] === solo[0], JSON.stringify(solo));
  const seat = JSON.parse((await sp.evaluate(() => localStorage.getItem("mchezo.solo.v1"))) ?? "null");
  const sroom = await (await fetch(`${OWN}/rooms/${seat.roomId}/projection?audience=player`, { headers: { "x-session-token": seat.token } })).json();
  check("A solo: the server holds four finished Connections rounds in one room", (sroom.games ?? []).filter((g) => g.gameId === "word-connections" && g.status === "finished").length === 4);
  check("A solo: no item id reaches the phone", !/con-t-/.test(JSON.stringify(sroom)));

  // A2. The server restarts (same port and data): Play again in the same tab starts a round.
  // Before Stage 7.4 every solo Start after a restart was refused ("Need at least 1
  // connected players"): a solo room has no socket to mark its player present again.
  await stopServer(own);
  own = await startServer(own.port);
  check("A2 the server restarted on the same port with the same data", own.port === Number(new URL(OWN).port));
  await sp.getByTestId("solo-play-again").click();
  const afterRestart = await soon("A2 after the restart, Play again starts a round (no refusal)", async () => (await sp.getByTestId("mz-cx").isVisible()) && (await sp.getByTestId("solo-error").count()) === 0 ? await poolBoard(sp) : null, 20000);
  check("A2 …and deals the least recently used board (the usage survived the restart)", afterRestart === solo[1], JSON.stringify({ afterRestart, expected: solo[1] }));
  await sctx.close();

  // A3. A press made before a newer round (clarification 6783492788): tab 1's
  // Start is held on its way while tab 2 (same device, same solo room) starts
  // Pattern Pulse. Tab 1's press arrives stale: refused, nothing abandoned or
  // used, and tab 2's round keeps playing. Try again reads the room and starts.
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const t1 = await tctx.newPage();
  await t1.goto(`${OWN}/solo/word-connections`, { waitUntil: "domcontentloaded" });
  await t1.getByTestId("solo-round-start").click();
  await poolBoard(t1);
  const tseat = JSON.parse((await t1.evaluate(() => localStorage.getItem("mchezo.solo.v1"))) ?? "null");
  const troom = async () => (await fetch(`${OWN}/rooms/${tseat.roomId}/projection?audience=player`, { headers: { "x-session-token": tseat.token } })).json();
  await t1.reload({ waitUntil: "domcontentloaded" });
  await t1.getByTestId("solo-ready").waitFor({ timeout: 10000 });
  let release = () => {};
  const held = new Promise((r) => { release = r; });
  const t1posts = [];
  t1.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/games")) t1posts.push(JSON.parse(r.postData() ?? "{}")); });
  await t1.route((url) => new URL(url).pathname.endsWith("/games"), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await held;
    await route.continue();
  });
  await t1.getByTestId("solo-round-start").click();
  await soon("A3 tab 1's Start is on its way (held), made against the room's revision", async () => t1posts.length === 1 && t1posts[0].attempt?.sessionRevision === 1, 10000);
  const t2 = await tctx.newPage();
  await t2.goto(`${OWN}/solo/pattern-pulse`, { waitUntil: "domcontentloaded" });
  await t2.getByTestId("solo-round-start").click();
  await t2.getByTestId("mz-pp-open").waitFor({ timeout: 20000 });
  const mid = await troom();
  const pulse = (mid.games ?? []).find((g) => g.gameId === "pattern-pulse" && g.status === "playing");
  check("A3 tab 2 started Pattern Pulse first (the room moved on)", !!pulse && mid.session?.revision === 2, JSON.stringify({ revision: mid.session?.revision, games: (mid.games ?? []).map((g) => [g.gameId, g.status]) }));
  release();
  await soon("A3 tab 1's late press is refused: “Something changed in another tab or window…”, with Try again", async () => /another tab or window/.test(await text(t1.getByTestId("solo-error"))) && (await text(t1.getByTestId("solo-round-start"))) === "Try again", 15000);
  const after = await troom();
  check("A3 nothing changed: tab 2's Pulse still plays, no new round, the revision unchanged", JSON.stringify((after.games ?? []).map((g) => [g.id, g.status])) === JSON.stringify((mid.games ?? []).map((g) => [g.id, g.status])) && after.session?.revision === 2 && (after.games ?? []).find((g) => g.id === pulse?.id)?.status === "playing");
  await t1.unrouteAll({ behavior: "ignoreErrors" });
  await t1.getByTestId("solo-round-start").click();
  const tb = await soon("A3 Try again reads the room and starts a Connections round", async () => (await t1.getByTestId("mz-cx").isVisible()) ? await poolBoard(t1) : null, 20000);
  check("A3 …against the current revision, with a new press id", t1posts.length === 2 && t1posts[1].attempt?.sessionRevision === 2 && t1posts[1].attempt?.id !== t1posts[0].attempt?.id, JSON.stringify(t1posts.map((x) => x.attempt)));
  check("A3 …and its board is a usable pool board", SMALL_CONNECTIONS_USABLE.includes(tb), String(tb));
  await tctx.close();

  // A4. Review 6786060026: tab A's Start never reaches the server (the network
  // drops it) while tab B, on the same solo seat, starts the same game. A must
  // not adopt B's round: its press is sent again unchanged and refused as
  // stale. B keeps playing; one round, one use.
  const actx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await actx.newPage();
  await a.goto(`${OWN}/solo/pattern-pulse`, { waitUntil: "domcontentloaded" });
  await a.getByTestId("solo-round-start").click();
  await a.getByTestId("mz-pp-open").waitFor({ timeout: 20000 });
  await a.getByTestId("solo-leave").click(); await a.getByTestId("solo-leave-yes").click();
  await a.goto(`${OWN}/solo/word-connections`, { waitUntil: "domcontentloaded" });
  await a.getByTestId("solo-round-start").waitFor({ timeout: 10000 });
  const aseat = JSON.parse((await a.evaluate(() => localStorage.getItem("mchezo.solo.v1"))) ?? "null");
  const aroom = async () => (await fetch(`${OWN}/rooms/${aseat.roomId}/projection?audience=player`, { headers: { "x-session-token": aseat.token } })).json();
  const b = await actx.newPage();
  const aposts = [];
  a.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/games")) aposts.push(JSON.parse(r.postData() ?? "{}").attempt); });
  let firstA = true;
  await a.route((url) => new URL(url).pathname.endsWith("/games"), async (route) => {
    if (route.request().method() !== "POST" || !firstA) return route.continue();
    firstA = false;
    await b.goto(`${OWN}/solo/word-connections`, { waitUntil: "domcontentloaded" });
    await b.getByTestId("solo-round-start").click();
    await b.getByTestId("mz-cx").waitFor({ timeout: 20000 });
    return route.abort("internetdisconnected"); // A's press never reached the server
  });
  await a.getByTestId("solo-round-start").click();
  await soon("A4 tab A is told something changed (another tab) and does not play B's round", async () => /another tab or window/.test(await text(a.getByTestId("solo-error"))) && (await a.getByTestId("mz-cx").count()) === 0, 20000);
  const a4 = await aroom();
  const openA4 = (a4.games ?? []).filter((g) => g.status === "playing");
  check("A4 tab B is undisturbed: its round is the only one playing, and B still plays it", openA4.length === 1 && openA4[0].gameId === "word-connections" && (await b.getByTestId("mz-cx").isVisible()), JSON.stringify(openA4.map((g) => g.id)));
  check("A4 tab A sent the same press again (same id and revision), never a new one", aposts.length === 2 && aposts[0]?.id === aposts[1]?.id && aposts[0]?.sessionRevision === aposts[1]?.sessionRevision, JSON.stringify(aposts));
  await a.unrouteAll({ behavior: "ignoreErrors" });
  await actx.close();

  // ---- B. A casual room: hand pick, rematch (cancelled, then played), the lineup's Next, rematch ----
  const h = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const code = await host(h, OWN, "Ada");
  const g = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await joinRoom(g, OWN, "Bea", code);
  const saved = await api(h, "POST", "/rooms/:room/party", { baseRevision: 0, plan: { expectedPlayers: 2, budgetMinutes: 30, items: [{ gameId: "word-connections" }, { gameId: "math-mayhem" }] } });
  check("B setup: a lineup of Word Connections, then Math Mayhem", saved.status === 200, JSON.stringify(saved.body).slice(0, 160));
  const posts = [];
  h.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/games")) posts.push(JSON.parse(r.postData() ?? "{}")); });
  const lineup = async () => (await myRoom(h)).party.lineup;
  /** Play one casual Connections game to its results: both phones, the same board. */
  async function playCasual(label) {
    await passBriefing([h, g]);
    const [a, b] = [await poolBoard(h), await poolBoard(g)];
    check(`${label}: both phones show the same pool board`, !!a && a === b, JSON.stringify([a, b]));
    await solve(h, groupsOf(a));
    await solve(g, groupsOf(a));
    await soon(`${label}: the results, with What's next`, async () => (await h.getByTestId("whats-next").isVisible()) && (await g.getByTestId("whats-next").isVisible()), 30000);
    return a;
  }

  // 1. Connections picked by hand (the same game as the lineup's next item).
  await h.getByTestId("choose-game").click();
  await h.getByTestId("select-game-word-connections").click();
  await soon("B1 picked by hand: a plain Start (not the lineup's)", async () => (await h.getByTestId("party-start").count()) === 0 && (await text(h.getByTestId("start-practice-word-connections"))) === "Start Word Connections");
  await dockStart(h).click();
  const b1 = await playCasual("B1 hand-picked");
  let lu = await lineup();
  check("B1 the lineup's Connections item is still pending (a hand pick never moves it)", lu.next === 0 && lu.items[0].status === "pending" && !lu.items[0].gameInstanceId, JSON.stringify(lu.items));

  // 2. Play again, then Cancel in its briefing: the confirmation names the results.
  const before = (await myRoom(h)).games.length;
  await h.getByTestId("next-play-again").click();
  await h.getByTestId("briefing").waitFor({ timeout: 20000 });
  await g.getByTestId("briefing").waitFor({ timeout: 20000 });
  const rematchPost = posts.at(-1);
  check("B2 Play again sent a rematch with a press id", !!rematchPost?.rematchOf && !!rematchPost?.attempt?.id, JSON.stringify(rematchPost));
  await h.getByTestId("briefing-cancel").click();
  await h.getByTestId("briefing-cancel-confirm").waitFor({ timeout: 5000 });
  const dest = await text(h.getByTestId("briefing-cancel-destination"));
  check("B2 the cancel confirmation names the results: “You’ll go back to the Word Connections results.”", dest === "You’ll go back to the Word Connections results.", dest);
  check("B2 …and never promises the lobby", !/lobby/i.test(await text(h.getByTestId("briefing-cancel-confirm"))), await text(h.getByTestId("briefing-cancel-confirm")));
  await shot(h, "docs/stage7/screenshots-74/01-cancel-rematch-390x844.png", "Play again cancelled from the results: the confirmation says you go back to the Word Connections results");
  await h.getByTestId("briefing-cancel-confirm-confirm").click();
  await soon("B2 after the cancel, Ada is back on the Word Connections results (What's next)", async () => (await h.getByTestId("briefing").count()) === 0 && (await h.getByTestId("next-play-again").isVisible()), 15000);
  await soon("B2 …and so is Bea", async () => (await g.getByTestId("briefing").count()) === 0 && (await g.getByTestId("whats-next").isVisible()), 15000);
  let room = await myRoom(h);
  lu = room.party.lineup;
  check("B2 the cancel left nothing behind: the same games, the lineup unchanged", room.games.length === before && lu.next === 0 && lu.items[0].status === "pending", JSON.stringify({ games: room.games.length, before, items: lu.items }));
  const again = await api(h, "POST", "/rooms/:room/games", rematchPost);
  room = await myRoom(h);
  check("B2 the cancelled press sent again starts nothing (ATTEMPT_ENDED)", again.status === 409 && again.body.code === "ATTEMPT_ENDED" && room.games.length === before, JSON.stringify({ status: again.status, code: again.body.code, games: room.games.length }));

  // 3. Play again, played: an unused board.
  await h.getByTestId("next-play-again").click();
  const b2 = await playCasual("B3 rematch");
  check("B3 the rematch deals an unused board", b2 !== b1, JSON.stringify([b1, b2]));
  lu = await lineup();
  check("B3 the lineup is unchanged by the rematch", lu.next === 0 && lu.items[0].status === "pending", JSON.stringify(lu.items));

  // 4. The lineup's Next game: the remaining unused board; the item is played.
  await soon("B4 the results offer the lineup's Next game: Word Connections", async () => /Next game: Word Connections/.test(await text(h.getByTestId("next-game"))));
  await h.getByTestId("next-game").click();
  const b3 = await playCasual("B4 lineup Next");
  check("B4 the lineup's game deals the last unused board", ![b1, b2].includes(b3) && new Set([b1, b2, b3]).size === 3, JSON.stringify([b1, b2, b3]));
  lu = await lineup();
  check("B4 the lineup moved on: Connections played, Math next", lu.next === 1 && lu.items[0].status === "completed" && lu.items[1].status === "pending", JSON.stringify(lu.items));

  // 5. Play again: all three used, so the least recently used (board 1).
  await h.getByTestId("next-play-again").click();
  const b4 = await playCasual("B5 rematch after all were used");
  check("B5 the least recently used board comes back (board 1)", b4 === b1, JSON.stringify([b1, b2, b3, b4]));
  lu = await lineup();
  check("B5 the lineup is unchanged (Math still next)", lu.next === 1 && lu.items[1].status === "pending", JSON.stringify(lu.items));
  check("B every board dealt is a usable pool board, never the rejected one", [b1, b2, b3, b4].every((id) => SMALL_CONNECTIONS_USABLE.includes(id)), JSON.stringify([b1, b2, b3, b4]));

  // 6. Back to lobby, then the lineup's Math started and cancelled: the confirmation names the lobby.
  await h.getByTestId("show-back-to-lobby").click();
  await soon("B6 Ada is in the lobby, the lineup's Math up next", async () => /Start Math Mayhem · game 2 of 2/.test(await text(h.getByTestId("party-start"))));
  const gamesBefore = (await myRoom(h)).games.length;
  await h.getByTestId("party-start").click();
  await h.getByTestId("briefing").waitFor({ timeout: 20000 });
  await h.getByTestId("briefing-cancel").click();
  await h.getByTestId("briefing-cancel-confirm").waitFor({ timeout: 5000 });
  const dest2 = await text(h.getByTestId("briefing-cancel-destination"));
  check("B6 the cancel confirmation names the lobby: “You’ll go back to the lobby.”", dest2 === "You’ll go back to the lobby.", dest2);
  await shot(h, "docs/stage7/screenshots-74/02-cancel-lobby-390x844.png", "A start from the lobby cancelled: the confirmation says you go back to the lobby");
  await h.getByTestId("briefing-cancel-confirm-confirm").click();
  await soon("B6 after the cancel, Ada is in the lobby, Math still up next", async () => (await h.getByTestId("briefing").count()) === 0 && /Start Math Mayhem · game 2 of 2/.test(await text(h.getByTestId("party-start"))), 15000);
  await soon("B6 Bea, who kept the results open, is back on them", async () => (await g.getByTestId("briefing").count()) === 0 && (await g.getByTestId("whats-next").isVisible()), 15000);
  room = await myRoom(h);
  check("B6 nothing changed: the same games; Math still pending and next", room.games.length === gamesBefore && room.party.lineup.next === 1 && room.party.lineup.items[1].status === "pending", JSON.stringify({ games: room.games.length, gamesBefore, items: room.party.lineup.items }));

  // Math, the lineup's last game, still plays afterwards (progression intact).
  await h.getByTestId("party-start").click();
  await passBriefing([h, g]);
  await answerKitQuestions(h, { player: "Ada", choose: () => 0 });
  await answerKitQuestions(g, { player: "Bea", choose: (n) => n % 4 });
  await soon("B7 the lineup's Math plays to its results", async () => h.getByTestId("casual-results").isVisible(), 40000);
  lu = await lineup();
  check("B7 the lineup is complete", lu.complete === true && lu.items.every((i) => i.status === "completed"), JSON.stringify(lu.items));
  // At 320 px, the cancel confirmation still fits (no sideways scroll).
  await h.setViewportSize({ width: 320, height: 640 });
  await h.getByTestId("next-play-again").click();
  await h.getByTestId("briefing").waitFor({ timeout: 20000 });
  await h.getByTestId("briefing-cancel").click();
  await h.getByTestId("briefing-cancel-confirm").waitFor({ timeout: 5000 });
  check("B8 at 320 px the cancel confirmation names Math's results and fits", (await text(h.getByTestId("briefing-cancel-destination"))) === "You’ll go back to the Math Mayhem results." && (await h.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
  await shot(h, "docs/stage7/screenshots-74/03-cancel-rematch-320x640.png", "At 320 px: Play again (Math) cancelled, the confirmation names the Math Mayhem results");
  await h.getByTestId("briefing-cancel-confirm-confirm").click();
  await soon("B8 back on the results", async () => (await h.getByTestId("briefing").count()) === 0 && (await h.getByTestId("whats-next").isVisible()), 15000);
} catch (e) {
  check("no unexpected error (own server)", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await stopServer(own);
  rmSync(DATA_DIR, { recursive: true, force: true });
  rmSync(POOL_DIR, { recursive: true, force: true });
}

// ---- C. The shipped library, on the gate's server ----
try {
  const packs = join(process.cwd(), "content", "packs");
  const shipped = readdirSync(packs).filter((f) => f.endsWith(".json")).flatMap((f) => {
    const p = JSON.parse(readFileSync(join(packs, f), "utf8"));
    return p.gameId === "word-connections" ? p.items : [];
  });
  const usable = shipped.filter((it) => it.review.status !== "rejected" && it.season === undefined);
  const keyOfWords = (words) => words.map((w) => w.toLowerCase()).sort().join("|");
  const shippedKeys = new Map(usable.map((it) => [keyOfWords(it.groups.flatMap((x) => x.words)), it.id]));
  const christmasKeys = new Set(shipped.filter((it) => it.season === "christmas").map((it) => keyOfWords(it.groups.flatMap((x) => x.words))));
  let christmasDealt = 0;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cp = await ctx.newPage();
  const dealt = [];
  for (let i = 0; i <= usable.length; i++) {
    // Each Start from the round's own page replaces the round left open (it was shown, so it counts as used).
    await cp.goto(`${GATE_BASE}/solo/word-connections`, { waitUntil: "domcontentloaded" });
    await cp.getByTestId("solo-round-start").click();
    await cp.getByTestId("mz-cx").waitFor({ timeout: 20000 });
    await cp.waitForFunction(() => document.querySelectorAll('[data-testid="mz-cx-tile"]').length === 16, null, { timeout: 10000 });
    const key = keyOfWords(await shownWords(cp));
    if (christmasKeys.has(key)) christmasDealt += 1;
    dealt.push(shippedKeys.get(key) ?? null);
  }
  const n = usable.length;
  check(`C shipped library: every board dealt is a shipped, usable, year-round board (${n} of them)`, dealt.every((id) => id !== null), JSON.stringify(dealt));
  check("C an Everyday solo room never deals a Christmas board", christmasDealt === 0, `${christmasDealt} dealt`);
  check(`C all ${n} shipped boards come before any repeats`, new Set(dealt.slice(0, n)).size === n, `${new Set(dealt.slice(0, n)).size} different in the first ${n}`);
  check("C then the least recently used (the first again)", dealt[n] === dealt[0], JSON.stringify([dealt[0], dealt[n]]));
  await ctx.close();
} catch (e) {
  check("no unexpected error (gate's server)", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
  writeManifest();
}

console.log(failures ? `\n${failures} content-variety check(s) FAILED` : "\nAll content-variety checks passed");
process.exit(failures ? 1 : 0);
