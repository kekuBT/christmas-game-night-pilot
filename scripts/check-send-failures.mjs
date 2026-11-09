// Stage 5 (review item 1): every game screen tells the truth about a send.
// For Trivia, Math Mayhem, Geography, Guess the Year, Closest Wins and Word
// Connections: a tap whose request never gets an answer must
//   - show "Sending…", never "Locked in", while it is on its way;
//   - then say plainly that it couldn't be confirmed;
//   - keep what the player entered (the number, the four tiles);
//   - leave the server's state unchanged and the question still answerable;
// and tapping again sends it, after which the message is gone.
// Also (review item 2): the reconnecting banner promises only what the
// server confirmed. Practice games, isolated server, no content test mode.
// Starts ITS OWN server. Usage: node scripts/check-send-failures.mjs
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
const DATA = mkdtempSync(join(tmpdir(), "mz-sendfail-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "Send check" } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: h.playerId, token: h.recoveryToken }];
  for (const n of names.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
async function practice(room, gameId) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  return gid;
}
const mine = async (room, seat, gid) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid);
const browser = await launchChromium();
async function seatPage(room, seat) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return p;
}
const cut = (p) => p.route("**/intents", (r) => r.abort("internetdisconnected"));
const heal = (p) => p.unroute("**/intents");
const failureShown = async (p) => { const e = p.getByTestId("mz-send-error"); return (await e.count()) === 1 && /couldn’t confirm/.test(await e.innerText()); };

try {
  // ---- Choice games: Trivia, Math Mayhem, Geography.
  for (const [gameId, label, answered] of [
    ["trivia", "Trivia", (g) => Object.keys(g.state?.myAnswers ?? {}).length],
    ["math-mayhem", "Math Mayhem", (g) => Object.values(g.myAnswers ?? {}).filter((v) => v !== undefined && v !== null).length],
    ["geography", "Geography", (g) => Object.keys(g.state?.myAnswers ?? {}).length],
  ]) {
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practice(room, gameId);
    const p = await seatPage(room, room.seats[1]);
    await p.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
    await cut(p);
    await p.locator(".mz-slab:not([disabled])").first().click();
    check(`${label}: while it's on its way the tile says Sending…, not Locked in`, /SENDING…/.test(await p.locator(".mz-slab--selected").innerText().catch(() => "")), await p.locator(".mz-slab--selected").innerText().catch(() => "(none)"));
    await soon(`${label}: a send with no answer says it couldn't be confirmed`, () => failureShown(p));
    check(`${label}: nothing claims it is locked in`, !/LOCKED IN/.test(await p.evaluate(() => document.body.innerText)));
    check(`${label}: the server has no answer from Amina`, answered(await mine(room, room.seats[1], gid)) === 0);
    check(`${label}: the question can be answered again`, (await p.locator(".mz-slab:not([disabled])").count()) > 0);
    await p.screenshot({ path: screenshotPath(`docs/stage5/after/send-fail-${gameId}-390.png`) });
    await heal(p);
    await p.locator(".mz-slab:not([disabled])").first().click();
    await soon(`${label}: tapping again sends it (the server has it)`, async () => answered(await mine(room, room.seats[1], gid)) === 1);
    await soon(`${label}: the failure line is gone`, async () => (await p.getByTestId("mz-send-error").count()) === 0);
    await p.context().close();
  }

  // ---- Number games: Guess the Year, Closest Wins.
  for (const [gameId, label, value, answered] of [
    ["guess-the-year", "Guess the Year", "1969", (g) => Object.keys(g.state?.myGuesses ?? {}).length],
    ["closest-wins", "Closest Wins", "42", (g) => (g.state?.myGuess === undefined ? 0 : 1)],
  ]) {
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practice(room, gameId);
    const p = await seatPage(room, room.seats[1]);
    await p.getByTestId("mz-num-input").waitFor({ timeout: 20000 });
    await p.getByTestId("mz-num-input").fill(value);
    await cut(p);
    await p.getByTestId("mz-num-submit").click();
    await soon(`${label}: a send with no answer says it couldn't be confirmed`, () => failureShown(p));
    check(`${label}: the number is still in the box`, (await p.getByTestId("mz-num-input").inputValue()) === value, await p.getByTestId("mz-num-input").inputValue());
    check(`${label}: the server has no guess from Amina`, answered(await mine(room, room.seats[1], gid)) === 0);
    await p.screenshot({ path: screenshotPath(`docs/stage5/after/send-fail-${gameId}-390.png`) });
    await heal(p);
    await p.getByTestId("mz-num-submit").click();
    await soon(`${label}: submitting again sends it (the server has it)`, async () => answered(await mine(room, room.seats[1], gid)) === 1);
    await soon(`${label}: the failure line is gone`, async () => (await p.getByTestId("mz-send-error").count()) === 0);
    await p.context().close();
  }

  // ---- Word Connections: the four tiles stay selected.
  {
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practice(room, "word-connections");
    const p = await seatPage(room, room.seats[1]);
    await p.getByTestId("mz-cx-tile").first().waitFor({ timeout: 20000 });
    const tiles = p.getByTestId("mz-cx-tile");
    for (let i = 0; i < 4; i++) await tiles.nth(i).click();
    const picked = await tiles.evaluateAll((els) => els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => e.textContent));
    await cut(p);
    await p.getByTestId("mz-cx-submit").click();
    await soon("Word Connections: a guess with no answer says it couldn't be confirmed", () => failureShown(p));
    const still = await tiles.evaluateAll((els) => els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => e.textContent));
    check("Word Connections: the same four tiles are still selected", JSON.stringify(still) === JSON.stringify(picked), JSON.stringify(still));
    check("Word Connections: the server has no guess from Amina", ((await mine(room, room.seats[1], gid)).state?.myState?.guessed ?? []).length === 0);
    await p.screenshot({ path: screenshotPath("docs/stage5/after/send-fail-word-connections-390.png") });
    await heal(p);
    await p.getByTestId("mz-cx-submit").click();
    await soon("Word Connections: submitting again sends it (the server has it)", async () => ((await mine(room, room.seats[1], gid)).state?.myState?.guessed ?? []).length === 1);
    await soon("Word Connections: the failure line is gone", async () => (await p.getByTestId("mz-send-error").count()) === 0);
    await p.context().close();
  }

  // ---- The reconnecting banner promises only confirmed answers.
  {
    const room = await makeRoom(["Keku", "Amina"]);
    await practice(room, "trivia");
    const p = await seatPage(room, room.seats[1]);
    await p.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
    await p.context().setOffline(true);
    await soon("offline: the banner says only confirmed answers are safe, and taps may not arrive", async () => { const t = await p.getByTestId("mz-conn").innerText(); return /Answers the game confirmed are safe/.test(t) && /may not arrive/.test(t) && !/Your answers are saved/.test(t); }, 20000);
    await p.screenshot({ path: screenshotPath("docs/stage5/after/reconnecting-banner-390.png") });
    await p.context().setOffline(false);
    await soon("back online: 'Reconnected. Answers the game confirmed are safe.'", async () => /Reconnected\. Answers the game confirmed are safe\./.test(await p.getByTestId("mz-conn").innerText().catch(() => "")), 20000);
    await p.context().close();
  }
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "SEND FAILURES ALL PASSED" : `SEND FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
