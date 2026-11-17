// Beta R4 (review 6935165862): a tap answered by a proxy's 502, 503 or 504 (the game restarting behind it) is
// UNCONFIRMED. The phone must say it couldn't confirm it, never show the raw "Request failed (502)", never claim the
// server didn't get it, and then show the server's own state. Typed app errors keep their own wording.
// Real browser (Chromium), real server, Trivia (practice). The intermediary is simulated with Playwright routing on
// POST /rooms/:id/intents, the phone's only path for a tap:
//   A  server down, nothing committed (502, 503, 504 in turn): the proxy answers every try itself.
//        - three tries, one event id; the "couldn't confirm" line; no "Request failed"; not shown as in;
//        - the server has nothing; tapping again after the "restart" locks in once and the line goes.
//   B  committed, reply lost: each try reaches the server (which records the first and dedupes the rest), but the
//      proxy replaces every reply with a 502.
//        - three tries, one event id; the server recorded it exactly once; no "Request failed";
//        - the screen shows the server's state (LOCKED IN), and the line turns into "went through";
//        - a replay of the same request returns the original result, and a fresh tap doesn't count twice.
//   C  a 503 that carries the app's own typed error keeps that error's wording (not "couldn't confirm").
//   D  a real app rejection (the server answers UNKNOWN_QUESTION) keeps its wording; nothing is recorded.
//   E  review 6936791624: a gateway answering with GENERIC JSON that looks like an app error ({"error":"Bad Gateway"} on
//      502, {"code":"SERVICE_UNAVAILABLE"} on 503, {"reason":"upstream timeout"} on 504) is unconfirmed exactly like A:
//      "couldn't confirm", the gateway's text never shown, not shown as in, nothing recorded, a re-tap locks in once.
//      E-committed: every reply replaced by {"error":"Bad Gateway"} after the server recorded the first try: recorded
//      exactly once, LOCKED IN from the server's state, "went through", the gateway's text not left on screen.
// Starts ITS OWN server (port 0, a temporary data directory). Usage: node scripts/check-uncertain-delivery.mjs
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
const DATA = mkdtempSync(join(tmpdir(), "mz-c502-"));
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
  const room = await api("/rooms", { body: { name: "Uncertain delivery check" } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: h.playerId, token: h.recoveryToken }];
  for (const n of names.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
async function practiceTrivia(room) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "trivia", official: false } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  return gid;
}
const mine = async (room, seat, gid) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid);
const answers = async (room, seat, gid) => Object.keys((await mine(room, seat, gid)).state?.myAnswers ?? {}).length;
const browser = await launchChromium();
async function seatPage(room, seat) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await p.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
  return p;
}
const PROXY_PAGE = "<html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>";
/** The proxy answers every try itself: the game never sees the tap (the server is down). */
async function proxyAnswers(p, status) {
  const sent = [];
  await p.route("**/intents", (r) => { sent.push(r.request().postData() ?? ""); return r.fulfill({ status, contentType: "text/html", body: PROXY_PAGE }); });
  return sent;
}
/** The proxy answers every try itself with a JSON body of its own (a gateway's generic JSON): the game never sees it. */
async function proxyAnswersJson(p, status, json) {
  const sent = [];
  await p.route("**/intents", (r) => { sent.push(r.request().postData() ?? ""); return r.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) }); });
  return sent;
}
/** Each try reaches the game, but the proxy replaces the game's reply with a 502 (a reply lost in a restart). */
async function replyReplacedBy502(p, json) {
  const sent = [];
  await p.route("**/intents", async (r) => {
    sent.push(r.request().postData() ?? "");
    try { await r.fetch(); } catch { /* the game's own reply is thrown away either way */ }
    await r.fulfill(json ? { status: 502, contentType: "application/json", body: JSON.stringify(json) } : { status: 502, contentType: "text/html", body: PROXY_PAGE }).catch(() => {});
  });
  return sent;
}
const heal = (p) => p.unrouteAll({ behavior: "ignoreErrors" });
const ids = (sent) => [...new Set(sent.map((b) => { try { return JSON.parse(b).intent.clientEventId; } catch { return "?"; } }))];
const sendLine = (p) => p.evaluate(() => (document.querySelector('[data-testid="mz-send-error"]')?.textContent ?? "").trim());
const pageText = (p) => p.evaluate(() => document.body.innerText);
const couldntConfirm = async (p) => /couldn’t confirm/.test(await sendLine(p));
const lockedIn = async (p) => /LOCKED IN/.test(await pageText(p)) && (await p.locator(".mz-slab:not([disabled])").count()) === 0;
const rawShown = async (p) => /Request failed|\b50[234]\b|Bad Gateway|SERVICE_UNAVAILABLE|upstream timeout/i.test(await pageText(p));
const freshCopy = (body) => { const o = JSON.parse(body); o.intent.clientEventId = randomUUID(); return JSON.stringify(o); };

try {
  // ---------- A: the server is down; the proxy answers 502, 503, 504 ----------
  for (const status of [502, 503, 504]) {
    const label = `A ${status} (server down, nothing committed)`;
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practiceTrivia(room);
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    const sent = await proxyAnswers(p, status);
    await p.locator(".mz-slab:not([disabled])").first().click();
    await soon(`${label}: the phone tried three times`, async () => sent.length >= 3);
    check(`${label}: every try carried the same event id`, ids(sent).length === 1, `${sent.length} tries, ${ids(sent).length} id(s)`);
    await soon(`${label}: the phone says it couldn't confirm it`, () => couldntConfirm(p));
    check(`${label}: no raw "Request failed (${status})" or status code is shown`, !(await rawShown(p)), JSON.stringify(await sendLine(p)));
    check(`${label}: the line never claims it wasn't received`, !/not received|didn’t reach|wasn’t sent|not saved/i.test(await sendLine(p)), JSON.stringify(await sendLine(p)));
    check(`${label}: not shown as in (no LOCKED IN, the answers can still be tapped)`, !(await lockedIn(p)) && (await p.locator(".mz-slab:not([disabled])").count()) > 0);
    check(`${label}: the server has nothing`, (await answers(room, seat, gid)) === 0);
    // The tapped tile animates back after a failed send; screenshot once every tile is back in place (settled).
    await soon(`${label}: the answer tiles are back in place (none overlapping)`, () => p.evaluate(() => {
      const r = [...document.querySelectorAll(".mz-slab")].map((e) => e.getBoundingClientRect());
      return r.length === 4 && r.every((a, i) => r.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1));
    }), 5000);
    if (status === 502) await p.screenshot({ path: screenshotPath("docs/evidence/beta-r4-c502/screens/a-502-couldnt-confirm-390.png") });
    await heal(p);
    await p.locator(".mz-slab:not([disabled])").first().click();
    await soon(`${label}: tapping again after the restart locks it in`, () => lockedIn(p));
    check(`${label}: the server recorded it once`, (await answers(room, seat, gid)) === 1, `${await answers(room, seat, gid)}`);
    await soon(`${label}: the "couldn't confirm" line is gone`, async () => !(await couldntConfirm(p)), 8000);
    await p.context().close();
  }

  // ---------- B: committed, every reply replaced by a 502 ----------
  {
    const label = "B 502 (committed, reply lost)";
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practiceTrivia(room);
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    const sent = await replyReplacedBy502(p);
    await p.locator(".mz-slab:not([disabled])").first().click();
    await soon(`${label}: the phone tried three times`, async () => sent.length >= 3);
    check(`${label}: every try carried the same event id`, ids(sent).length === 1, `${sent.length} tries, ${ids(sent).length} id(s)`);
    check(`${label}: the server recorded it exactly once`, (await answers(room, seat, gid)) === 1, `${await answers(room, seat, gid)}`);
    check(`${label}: no raw "Request failed (502)" is shown`, !(await rawShown(p)), JSON.stringify(await sendLine(p)));
    await soon(`${label}: the screen shows the server's state: LOCKED IN`, () => lockedIn(p), 12000);
    await soon(`${label}: the line says it went through (the server's list of this player's accepted actions)`, async () => (await p.getByTestId("mz-send-landed").count()) >= 1 && !(await couldntConfirm(p)), 8000);
    await p.screenshot({ path: screenshotPath("docs/evidence/beta-r4-c502/screens/b-502-committed-went-through-390.png") });
    await heal(p);
    const again = await raw(`/rooms/${room.roomId}/intents`, { token: seat.token, body: sent[0] });
    check(`${label}: replaying the same request returns the original result`, again.status === 200 && again.json.accepted === true, JSON.stringify(again.json));
    await raw(`/rooms/${room.roomId}/intents`, { token: seat.token, body: freshCopy(sent[0]) });
    check(`${label}: a fresh tap for the same answer doesn't count twice`, (await answers(room, seat, gid)) === 1, `${await answers(room, seat, gid)}`);
    await p.context().close();
  }

  // ---------- E: a gateway's generic JSON (review 6936791624) ----------
  for (const [status, json] of [[502, { error: "Bad Gateway" }], [503, { code: "SERVICE_UNAVAILABLE" }], [504, { reason: "upstream timeout" }]]) {
    const label = `E ${status} ${JSON.stringify(json)} (gateway JSON, server down)`;
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practiceTrivia(room);
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    const sent = await proxyAnswersJson(p, status, json);
    await p.locator(".mz-slab:not([disabled])").first().click();
    await soon(`${label}: the phone tried three times`, async () => sent.length >= 3);
    check(`${label}: every try carried the same event id`, ids(sent).length === 1, `${sent.length} tries, ${ids(sent).length} id(s)`);
    await soon(`${label}: the phone says it couldn't confirm it`, () => couldntConfirm(p));
    check(`${label}: the gateway's text, a raw "Request failed" or a status code is never shown`, !(await rawShown(p)), JSON.stringify(await sendLine(p)));
    check(`${label}: not shown as in (no LOCKED IN, the answers can still be tapped)`, !(await lockedIn(p)) && (await p.locator(".mz-slab:not([disabled])").count()) > 0);
    check(`${label}: the server has nothing`, (await answers(room, seat, gid)) === 0);
    if (status === 502) {
      await soon(`${label}: the answer tiles are back in place (none overlapping)`, () => p.evaluate(() => {
        const r = [...document.querySelectorAll(".mz-slab")].map((e) => e.getBoundingClientRect());
        return r.length === 4 && r.every((a, i) => r.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1));
      }), 5000);
      await p.screenshot({ path: screenshotPath("docs/evidence/beta-r4-c502/screens/e-502-gateway-json-couldnt-confirm-390.png") });
    }
    await heal(p);
    await p.locator(".mz-slab:not([disabled])").first().click();
    await soon(`${label}: tapping again after the restart locks it in`, () => lockedIn(p));
    check(`${label}: the server recorded it once`, (await answers(room, seat, gid)) === 1, `${await answers(room, seat, gid)}`);
    await soon(`${label}: the "couldn't confirm" line is gone`, async () => !(await couldntConfirm(p)), 8000);
    await p.context().close();
  }
  {
    const label = "E-committed 502 {\"error\":\"Bad Gateway\"} (gateway JSON, reply lost after the server recorded it)";
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practiceTrivia(room);
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    const sent = await replyReplacedBy502(p, { error: "Bad Gateway" });
    await p.locator(".mz-slab:not([disabled])").first().click();
    await soon(`${label}: the phone tried three times`, async () => sent.length >= 3);
    check(`${label}: every try carried the same event id`, ids(sent).length === 1, `${sent.length} tries, ${ids(sent).length} id(s)`);
    check(`${label}: the server recorded it exactly once`, (await answers(room, seat, gid)) === 1, `${await answers(room, seat, gid)}`);
    await soon(`${label}: the screen shows the server's state: LOCKED IN`, () => lockedIn(p), 12000);
    await soon(`${label}: the line says it went through, and the gateway's text is not on screen`, async () => (await p.getByTestId("mz-send-landed").count()) >= 1 && !(await couldntConfirm(p)) && !(await rawShown(p)), 8000);
    await heal(p);
    await raw(`/rooms/${room.roomId}/intents`, { token: seat.token, body: freshCopy(sent[0]) });
    check(`${label}: a fresh tap for the same answer doesn't count twice`, (await answers(room, seat, gid)) === 1, `${await answers(room, seat, gid)}`);
    await p.context().close();
  }

  // ---------- C: a 503 carrying the app's own typed error ----------
  {
    const label = "C 503 with the app's own error";
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practiceTrivia(room);
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    await p.route("**/intents", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unknown player slot" }) }));
    await p.locator(".mz-slab:not([disabled])").first().click();
    await soon(`${label}: the typed error keeps its own wording`, async () => /We could not bring you back into your seat/.test(await sendLine(p)));
    check(`${label}: it is not turned into "couldn't confirm"`, !(await couldntConfirm(p)), JSON.stringify(await sendLine(p)));
    check(`${label}: the server has nothing`, (await answers(room, seat, gid)) === 0);
    await heal(p);
    await p.context().close();
  }

  // ---------- D: a real app rejection from the server ----------
  {
    const label = "D a real app rejection (UNKNOWN_QUESTION)";
    const room = await makeRoom(["Keku", "Amina"]);
    const gid = await practiceTrivia(room);
    const seat = room.seats[1];
    const p = await seatPage(room, seat);
    await p.route("**/intents", (r) => {
      const o = JSON.parse(r.request().postData() ?? "{}");
      if (o.intent?.payload) o.intent.payload.questionId = "no-such-question";
      return r.continue({ postData: JSON.stringify(o) });
    });
    await p.locator(".mz-slab:not([disabled])").first().click();
    await soon(`${label}: the server's reason keeps its wording`, async () => /That question is no longer open/.test(await sendLine(p)));
    check(`${label}: it is not turned into "couldn't confirm"`, !(await couldntConfirm(p)), JSON.stringify(await sendLine(p)));
    check(`${label}: nothing is recorded`, (await answers(room, seat, gid)) === 0);
    await heal(p);
    await p.context().close();
  }
} catch (e) {
  check(`the run completed (${String(e?.message ?? e).split("\n")[0].slice(0, 200)})`, false);
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "UNCERTAIN DELIVERY ALL PASSED" : `UNCERTAIN DELIVERY FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
