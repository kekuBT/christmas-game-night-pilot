// Stage 5.1 (2C): a send the phone couldn't confirm never looks accepted,
// and one that DID land never counts twice.
//
// Part 1, "reply lost" (the request reaches the server and is applied, but
// the phone never hears back), for Trivia (an older game) and the three
// Stage 5 games, Majority Rules, Pattern Pulse and Draw & Guess:
//   - the phone's own retries reuse ONE event id, and the server applies the
//     action once;
//   - the screen then shows what the server recorded and stops saying it
//     couldn't be confirmed: it says it went through, because the server's
//     own list of this player's accepted actions has that event id;
//   - replaying the same request returns the original result, and a NEW
//     request for the same answer (a second tap) doesn't count it twice.
// Part 2, "never arrived" (the request is dropped before the server), for the
// three Stage 5 games (Stage 5's check-send-failures covers the older ones):
//   - "couldn't confirm" is shown and nothing claims it's in;
//   - what the player entered is still there (prediction cards, the Pulse
//     entry, the typed guess) and the server has nothing;
//   - sending again lands once and the failure line goes.
// Practice games, real timings, isolated server, no content test mode.
// Starts ITS OWN server. Usage: node scripts/check-action-ack.mjs
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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
const DATA = mkdtempSync(join(tmpdir(), "mz-ack-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function raw(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function api(path, opts) {
  const r = await raw(path, opts);
  if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "Ack check" } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: h.playerId, token: h.recoveryToken }];
  for (const n of names.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
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
/** The request reaches the server (which applies it) but the phone never gets the reply. */
async function loseReplies(p) {
  const sent = [];
  await p.route("**/intents", async (r) => {
    sent.push(r.request().postData() ?? "");
    try { await r.fetch(); } catch { /* the server's answer is thrown away either way */ }
    await r.abort("internetdisconnected").catch(() => {});
  });
  return sent;
}
/** The request is dropped before it reaches the server. */
async function cut(p) {
  const sent = [];
  await p.route("**/intents", (r) => { sent.push(r.request().postData() ?? ""); return r.abort("internetdisconnected"); });
  return sent;
}
const heal = (p) => p.unrouteAll({ behavior: "ignoreErrors" });
const ids = (sent) => [...new Set(sent.map((b) => { try { return JSON.parse(b).intent.clientEventId; } catch { return "?"; } }))];
const anyFailure = async (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid="mz-send-error"],[data-testid="mz-mr-error"],[data-testid="mz-pp-error"],[data-testid="mz-dg-error"]')].map((e) => e.textContent ?? "").filter((t) => /couldn’t confirm/.test(t)).length);
/** A second tap for the same answer: the captured request with a NEW event id. */
const freshCopy = (body) => { const o = JSON.parse(body); o.intent.clientEventId = randomUUID(); return JSON.stringify(o); };

/** Shared checks for a reply-lost send. `count` reads the server's record for this player. */
async function replyLost(label, { room, seat, p, sent, count, shown }) {
  await soon(`${label}: the phone tried with one event id, three times`, async () => sent.length >= 3, 15000);
  check(`${label}: all tries carried the same event id`, ids(sent).length === 1, `${sent.length} tries, ${ids(sent).length} id(s)`);
  check(`${label}: the server recorded it exactly once`, (await count()) === 1, `count ${await count()}`);
  await soon(`${label}: the screen shows what the server recorded`, shown, 12000);
  await soon(`${label}: once the server shows it, no "couldn't confirm" line remains`, async () => (await anyFailure(p)) === 0, 8000);
  await soon(`${label}: instead it says it went through (from the server's list of this player's accepted actions)`, async () => (await p.getByTestId("mz-send-landed").count()) >= 1, 8000);
  await heal(p);
  const again = await raw(`/rooms/${room.roomId}/intents`, { token: seat.token, body: sent[0] });
  check(`${label}: replaying the same request returns the original result`, again.status === 200 && again.json.accepted === true, JSON.stringify(again.json));
  const second = await raw(`/rooms/${room.roomId}/intents`, { token: seat.token, body: freshCopy(sent[0]) });
  check(`${label}: a second tap for the same answer doesn't count twice`, (await count()) === 1, `second tap → ${JSON.stringify(second.json)}; count ${await count()}`);
}

try {
  // ---------- Part 1: the reply is lost after the server applied it ----------
  {
    const label = "Trivia (reply lost)";
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practice(room, "trivia");
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    await p.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
    const sent = await loseReplies(p);
    await p.locator(".mz-slab:not([disabled])").first().click();
    const count = async () => Object.keys((await mine(room, seat, gid)).state?.myAnswers ?? {}).length;
    await replyLost(label, { room, seat, gid, p, sent, count, shown: async () => /LOCKED IN/.test(await p.evaluate(() => document.body.innerText)) && (await p.locator(".mz-slab:not([disabled])").count()) === 0 });
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/ack-reply-lost-trivia-390.png") });
    await p.context().close();
  }
  {
    const label = "Majority Rules prediction (reply lost)";
    const room = await makeRoom(["Keku", "Amina", "Bartholomew"]);
    const gid = await practice(room, "majority-rules");
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    await p.getByTestId("mz-mr-predict-a").waitFor({ timeout: 20000 });
    const sent = await loseReplies(p);
    await p.getByTestId("mz-mr-predict-a").click();
    const count = async () => ((await mine(room, seat, gid)).state?.myPrediction === undefined ? 0 : 1);
    await replyLost(label, { room, seat, gid, p, sent, count, shown: async () => (await p.getByTestId("mz-mr-vote").count()) === 1 && /Your prediction/.test(await p.getByTestId("mz-mr-yourpred").innerText()) });
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/ack-reply-lost-majority-390.png") });
    await p.context().close();
  }
  {
    const label = "Pattern Pulse answer (reply lost)";
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practice(room, "pattern-pulse");
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    await p.getByTestId("mz-pp-open").click({ timeout: 20000 });
    await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
    const seq = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
    await p.getByTestId("mz-pp-input").waitFor({ timeout: 20000 });
    for (const s of seq) await p.getByTestId(`mz-pp-key-${s}`).click();
    const sent = await loseReplies(p);
    await p.getByTestId("mz-pp-submit").click();
    const count = async () => ((await mine(room, seat, gid)).state?.results ?? []).filter((r) => r.round === 0).length;
    await replyLost(label, { room, seat, gid, p, sent, count, shown: async () => (await p.getByTestId("mz-pp-ready").count()) === 1 });
    const pts = ((await mine(room, seat, gid)).state?.results ?? []).filter((r) => r.round === 0).map((r) => r.points);
    check(`${label}: the round scored once`, pts.length === 1 && pts[0] > 0, JSON.stringify(pts));
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/ack-reply-lost-pulse-390.png") });
    await p.context().close();
  }
  {
    const label = "Draw & Guess right guess (reply lost)";
    const room = await makeRoom(["Keku", "Amina", "Bartholomew"]);
    const gid = await practice(room, "draw-guess");
    let drawer = null, word = null;
    for (const s of room.seats) { const g = await mine(room, s, gid); if (g.state?.amDrawing) { drawer = s; word = g.state.myWord; } }
    const seat = room.seats.find((s) => s !== drawer);
    const p = await seatPage(room, seat);
    await p.getByTestId("mz-dg-input").waitFor({ timeout: 20000 });
    await p.getByTestId("mz-dg-input").fill(word);
    const sent = await loseReplies(p);
    await p.getByTestId("mz-dg-send").click();
    const count = async () => { const st = (await mine(room, seat, gid)).state; return st?.myCorrect ? st.myGuesses : 0; };
    await replyLost(label, { room, seat, gid, p, sent, count, shown: async () => (await p.getByTestId("mz-dg-right").count()) === 1 });
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/ack-reply-lost-draw-390.png") });
    await p.context().close();
  }

  // ---------- Part 2: the request never reaches the server (Stage 5 games) ----------
  {
    const label = "Majority Rules prediction (never arrived)";
    const room = await makeRoom(["Keku", "Amina", "Bartholomew"]);
    const gid = await practice(room, "majority-rules");
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    await p.getByTestId("mz-mr-predict-a").waitFor({ timeout: 20000 });
    const sent = await cut(p);
    await p.getByTestId("mz-mr-predict-a").click();
    await soon(`${label}: says it couldn't be confirmed`, async () => (await anyFailure(p)) === 1);
    check(`${label}: still on the prediction step (nothing claims it's in)`, (await p.getByTestId("mz-mr-predict").count()) === 1 && (await p.getByTestId("mz-mr-wait").count()) === 0);
    check(`${label}: the server has no prediction`, (await mine(room, seat, gid)).state?.myPrediction === undefined);
    check(`${label}: both answers can still be picked`, (await p.locator('[data-testid^="mz-mr-predict-"]:not([disabled])').count()) === 2);
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/ack-never-arrived-majority-390.png") });
    await heal(p);
    await p.getByTestId("mz-mr-predict-a").click();
    await soon(`${label}: picking again lands it`, async () => (await mine(room, seat, gid)).state?.myPrediction === "a");
    await soon(`${label}: the failure line is gone`, async () => (await anyFailure(p)) === 0);
    check(`${label}: three tries were made, all with one event id`, sent.length === 3 && ids(sent).length === 1, `${sent.length} tries`);
    await p.context().close();
  }
  {
    const label = "Pattern Pulse answer (never arrived)";
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practice(room, "pattern-pulse");
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    await p.getByTestId("mz-pp-open").click({ timeout: 20000 });
    await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
    const seq = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
    await p.getByTestId("mz-pp-input").waitFor({ timeout: 20000 });
    for (const s of seq) await p.getByTestId(`mz-pp-key-${s}`).click();
    const filled = async () => p.locator('[data-testid="mz-pp-slots"] li[data-symbol]').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
    const before = await filled();
    await cut(p);
    await p.getByTestId("mz-pp-submit").click();
    await soon(`${label}: says it couldn't be confirmed`, async () => (await anyFailure(p)) === 1);
    check(`${label}: the entry is still there, in order`, JSON.stringify(await filled()) === JSON.stringify(before) && before.length === seq.length, JSON.stringify({ before, now: await filled() }));
    check(`${label}: the server has no answer`, ((await mine(room, seat, gid)).state?.results ?? []).length === 0);
    check(`${label}: nothing claims it's in`, (await p.getByTestId("mz-pp-ready").count()) === 0);
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/ack-never-arrived-pulse-390.png") });
    await heal(p);
    await p.getByTestId("mz-pp-submit").click();
    await soon(`${label}: locking again lands it, once`, async () => ((await mine(room, seat, gid)).state?.results ?? []).filter((r) => r.round === 0).length === 1);
    await soon(`${label}: the failure line is gone`, async () => (await anyFailure(p)) === 0);
    await p.context().close();
  }
  {
    const label = "Draw & Guess guess (never arrived)";
    const room = await makeRoom(["Keku", "Amina", "Bartholomew"]);
    const gid = await practice(room, "draw-guess");
    let drawer = null;
    for (const s of room.seats) { const g = await mine(room, s, gid); if (g.state?.amDrawing) drawer = s; }
    const seat = room.seats.find((s) => s !== drawer);
    const p = await seatPage(room, seat);
    await p.getByTestId("mz-dg-input").waitFor({ timeout: 20000 });
    await p.getByTestId("mz-dg-input").fill("zebra crossing");
    await cut(p);
    await p.getByTestId("mz-dg-send").click();
    await soon(`${label}: says it couldn't be confirmed`, async () => (await anyFailure(p)) === 1);
    check(`${label}: the guess is still in the box`, (await p.getByTestId("mz-dg-input").inputValue()) === "zebra crossing");
    check(`${label}: the server has no guess`, ((await mine(room, seat, gid)).state?.myGuesses ?? 0) === 0);
    check(`${label}: nothing says "Not it"`, (await p.getByTestId("mz-dg-wrong").count()) === 0);
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/ack-never-arrived-draw-390.png") });
    await heal(p);
    await p.getByTestId("mz-dg-send").click();
    await soon(`${label}: sending again lands it, once`, async () => ((await mine(room, seat, gid)).state?.myGuesses ?? 0) === 1);
    await soon(`${label}: the failure line is gone and the server's answer shows`, async () => (await anyFailure(p)) === 0 && (await p.getByTestId("mz-dg-wrong").count()) === 1);
    await p.context().close();
  }
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "ACTION ACK ALL PASSED" : `ACTION ACK FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
