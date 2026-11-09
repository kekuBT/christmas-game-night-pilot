// Stage 5.1: before/after screenshots of the repaired screens, one scenario
// each, set up the same way on both revisions (only selectors that exist in
// both). Writes docs/stage5-qa/<label>/*.png and a manifest recording, for
// every image, the scenario, viewport and the exact revision it was taken on.
// Visual evidence only: the drivers and unit tests are the checks.
// Run from the checkout to photograph (it starts ITS OWN server there):
//   node scripts/screenshot-stage51.mjs --label before|after [--out <dir>]
import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LABEL = arg("--label", "after");
const OUT = arg("--out", join("docs", "stage5-qa", LABEL));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { label: LABEL, revision: REV, capturedAt: new Date().toISOString(), note: "Chromium headless (Playwright) only; not a real iPhone or Android device.", shots: [] };

let srv, BASE, DATA;
async function startServer(extraEnv = {}) {
  DATA = mkdtempSync(join(tmpdir(), "mz-shot-"));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, ...extraEnv };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
  srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 160; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) { BASE = `http://localhost:${m[1]}`; return; } await sleep(250); }
  throw new Error(`server did not start: ${out.slice(-300)}`);
}
async function stopServer() { if (srv && srv.exitCode === null) { srv.kill("SIGTERM"); await new Promise((r) => srv.once("exit", r)); } rmSync(DATA, { recursive: true, force: true }); }
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "Screens" } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ playerId: h.playerId, token: h.recoveryToken }];
  for (const n of names.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, joinCode: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } }).catch((e) => ({ accepted: false, error: String(e) }));
async function practice(room, gameId) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  return gid;
}
const mine = async (room, seat, gid) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid);
const browser = await launchChromium();
async function seatPage(room, seat, path = "/room", viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return p;
}
async function tvPage(room) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const tv = await ctx.newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.joinCode);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
  return tv;
}
async function shot(page, id, what) {
  const vp = page.viewportSize();
  const file = `${id}-${vp.width}x${vp.height}.png`;
  await page.screenshot({ path: join(OUT, file) });
  manifest.shots.push({ id, file, viewport: `${vp.width}×${vp.height}`, what, status: "captured" });
  console.log(`shot ${file}`);
}
async function scenario(id, what, fn) {
  try { await fn(); } catch (e) { manifest.shots.push({ id, what, status: `not captured: ${String(e.message ?? e).split("\n")[0]}` }); console.log(`skip ${id}: ${String(e.message ?? e).split("\n")[0]}`); }
}

try {
  await startServer({ MCHEZO_LIFECYCLE_SCALE: "0.4" });

  await scenario("o02-sprint-round2", "O-02: Category Sprint round 2 after sending round 1's words", async () => {
    const room = await makeRoom(["Keku", "Amina", "Baraka", "Wanjiru"]);
    const p = await seatPage(room, room.seats[1]);
    const gid = await practice(room, "category-sprint");
    const box = p.getByPlaceholder("e.g. Paris, Rome, Madrid");
    await box.waitFor({ timeout: 20000 });
    await box.fill("school, desk, chalk");
    await p.getByRole("button", { name: /Submit/ }).first().click();
    await sleep(1200);
    for (const i of [0, 2, 3]) await intent(room, room.seats[i], gid, "sprint-answers", { answers: ["apple"] });
    for (let i = 0; i < 60 && ((await mine(room, room.seats[1], gid)).state?.roundIndex ?? 0) < 1; i++) await sleep(250);
    await sleep(1500);
    await shot(p, "o02-sprint-round2", "Round 2 opens; is round 1's text still in the box?");
    await p.context().close();
  });

  await scenario("o07-closest-tv-q2", "O-07: Closest Wins TV when question 2 opens", async () => {
    const room = await makeRoom(["Keku", "Amina", "Bartholomew"]);
    const tv = await tvPage(room);
    const gid = await practice(room, "closest-wins");
    await sleep(1500);
    for (const s of room.seats) await intent(room, s, gid, "closest-guess", { value: 200 });
    await sleep(3000);
    await shot(tv, "o07-closest-tv-q2", "Nobody has answered question 2 yet");
    await tv.context().close();
  });

  await scenario("o07-whosaid-waiting", "O-07: Who Said That waiting card, 2 of 4 finished", async () => {
    const room = await makeRoom(["Keku", "Amina", "Bartholomew", "Wanjiru"]);
    const gid = await practice(room, "who-said-that");
    const qs = (await mine(room, room.seats[0], gid)).state?.questions ?? [];
    for (const q of qs) { await intent(room, room.seats[0], gid, "whosaid-answer", { questionId: q.id, chosenIndex: 0 }); await intent(room, room.seats[1], gid, "whosaid-answer", { questionId: q.id, chosenIndex: 0 }); }
    await intent(room, room.seats[2], gid, "whosaid-answer", { questionId: qs[0].id, chosenIndex: 0 });
    const p = await seatPage(room, room.seats[1]);
    await p.getByTestId("show-waiting").waitFor({ timeout: 15000 });
    await p.getByTestId("show-waiting").scrollIntoViewIfNeeded();
    await shot(p, "o07-whosaid-waiting", "Keku and Amina finished; Bartholomew and Wanjiru still have questions");
    await p.context().close();
  });

  await scenario("s5aud02-pulse-full-entry", "S5-AUD-02: Pattern Pulse with a full entry, before locking", async () => {
    const room = await makeRoom(["Keku", "Amina"]);
    const p = await seatPage(room, room.seats[1], "/room", { width: 375, height: 667 });
    await practice(room, "pattern-pulse");
    await p.getByTestId("mz-pp-open").click({ timeout: 20000 });
    await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
    const seq = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
    await p.getByTestId("mz-pp-input").waitFor({ timeout: 20000 });
    for (const s of seq) await p.getByTestId(`mz-pp-key-${s}`).click();
    await shot(p, "s5aud02-pulse-full-entry", "All shapes entered, not yet locked in");
    await p.context().close();
  });

  await scenario("o06-charades-phone", "O-06: Charades on a guesser's phone", async () => {
    const room = await makeRoom(["Keku", "Amina", "Baraka", "Wanjiru"]);
    const gid = await practice(room, "charades");
    const actor = (await mine(room, room.seats[0], gid)).state?.actor;
    const guesser = room.seats.find((s) => s.playerId !== actor);
    const p = await seatPage(room, guesser);
    await sleep(2500);
    const tv = await tvPage(room);
    await sleep(2500);
    await shot(p, "o06-charades-phone", "Teams, who acts and who guesses");
    await shot(tv, "o06-charades-tv", "Charades on the TV");
    await p.context().close(); await tv.context().close();
  });

  await scenario("3d-impostor-tv", "3D: Impostor on the TV (the impostor's rules)", async () => {
    const room = await makeRoom(["Keku", "Amina", "Baraka", "Wanjiru"]);
    const tv = await tvPage(room);
    await practice(room, "impostor");
    await sleep(3000);
    await shot(tv, "3d-impostor-tv", "TV hint for Impostor");
    await tv.context().close();
  });

  await scenario("3d-draw-briefing", "3D: Draw & Guess briefing (turns, swap, guesses)", async () => {
    const room = await makeRoom(["Keku", "Amina", "Baraka"]);
    const p = await seatPage(room, room.seats[1]);
    await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "draw-guess", official: false } });
    await sleep(2500);
    await shot(p, "3d-draw-briefing", "The briefing's rules");
    await p.context().close();
  });

  await scenario("3d-home-featured", "3D: Home's featured game (Practice-only status)", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("home-featured").waitFor({ timeout: 15000 });
    await shot(p, "3d-home-featured", "Today's featured game card");
    await ctx.close();
  });

  await scenario("2c-reply-lost", "2C: Trivia answer whose reply was lost but which the server recorded", async () => {
    const room = await makeRoom(["Keku", "Amina"]);
    const p = await seatPage(room, room.seats[1]);
    await practice(room, "trivia");
    await p.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
    await p.route("**/intents", async (r) => { try { await r.fetch(); } catch { /* reply dropped */ } await r.abort("internetdisconnected").catch(() => {}); });
    await p.locator(".mz-slab:not([disabled])").first().click();
    await sleep(6000);
    await shot(p, "2c-reply-lost", "The server has the answer; the phone never heard back");
    await p.context().close();
  });

  await scenario("3e-memory-link", "3E: Memory Book left open while a second game finishes", async () => {
    const room = await makeRoom(["Keku", "Amina"]);
    const finish = async (gid, action) => { for (const s of room.seats) { const g = await mine(room, s, gid); for (const q of g.state?.questions ?? []) await intent(room, s, gid, action, { questionId: q.id, chosenIndex: 0 }); } };
    const g1 = await practice(room, "trivia"); await finish(g1, "trivia-answer");
    const g2 = await practice(room, "geography");
    const p = await seatPage(room, room.seats[0], "/room/memories");
    await p.locator(".mz-memory__text").waitFor({ timeout: 15000 });
    await p.locator(".mz-memory__text").fill("Amina swept the geography round");
    await finish(g2, "geography-answer");
    await sleep(4000);
    await p.locator(".mz-memory__text").scrollIntoViewIfNeeded();
    await shot(p, "3e-memory-link", "Geography just finished; which game will the highlight cite?");
    await p.context().close();
  });

  await scenario("s5aud07-tv-outage", "S5-AUD-07: the TV 12 s after the game server stops", async () => {
    const room = await makeRoom(["Keku", "Amina"]);
    const tv = await tvPage(room);
    await practice(room, "trivia");
    await sleep(2500);
    srv.kill("SIGTERM"); await new Promise((r) => srv.once("exit", r));
    await sleep(12000);
    await shot(tv, "s5aud07-tv-outage", "Server stopped 12 s ago; does the TV say its picture may be stale?");
    await tv.context().close();
  });
} finally {
  await browser.close();
  await stopServer().catch(() => {});
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`manifest: ${join(OUT, "manifest.json")} (${manifest.shots.filter((s) => s.status === "captured").length} captured)`);
}
