// Stage 5.1 (3F, O-12/O-14): older game surfaces, through Chromium's
// accessibility tree. This is NOT a VoiceOver or TalkBack test: it checks
// what Chromium exposes (roles, names, groups), which is necessary but not
// sufficient for real screen readers.
//   A. Geography flag questions: the flag is a picture with a description
//      that names no option (a flag emoji's own name may be the answer).
//   B. Who Said That (older panel): each question is a labelled group; an
//      answered question says the player's own answer.
//   C. No internal ids (who-said-that, player-3) on player-facing screens.
// Practice games, isolated server, no content test mode.
// Starts ITS OWN server. Usage: node scripts/check-a11y-surfaces.mjs
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
const DATA = mkdtempSync(join(tmpdir(), "mz-a11y-"));
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
  const room = await api("/rooms", { body: { name: "A11y check" } });
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
async function seatPage(room, seat, path = "/room") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return p;
}
const INTERNAL = /\b(who-said-that|category-sprint|word-connections|guess-the-year|closest-wins|caption-clash|math-mayhem|majority-rules|pattern-pulse|draw-guess|player-\d+)\b/;
async function part(name, fn) { try { await fn(); } catch (e) { check(`${name}: ran to the end`, false, String(e.message ?? e).split("\n")[0]); } }

try {
  // ---------- A. Geography: a flag question ----------
  await part("Geography flags", async () => {
    let room, gid, flagIdx = -1, qs = [];
    for (let attempt = 0; attempt < 12 && flagIdx < 0; attempt++) {
      room = await makeRoom(["Keku", "Amina"]);
      gid = await practice(room, "geography");
      qs = (await mine(room, room.seats[1], gid)).state?.questions ?? [];
      flagIdx = qs.findIndex((q) => /\p{Regional_Indicator}{2}/u.test(q.prompt));
    }
    check("Geography: a game with a flag question was dealt", flagIdx >= 0, `${qs.length} questions`);
    if (flagIdx < 0) return;
    const q = qs[flagIdx];
    check("Geography: the server describes the flag without naming any option", typeof q.imageAlt === "string" && q.imageAlt.length > 0 && !q.options.some((o) => q.imageAlt.toLowerCase().includes(o.toLowerCase())), JSON.stringify({ imageAlt: q.imageAlt, options: q.options }));
    for (let i = 0; i < flagIdx; i++) await intent(room, room.seats[1], gid, "geography-answer", { questionId: qs[i].id, chosenIndex: 0 });
    const p = await seatPage(room, room.seats[1]);
    await soon("Geography: the flag question is on screen", async () => (await p.locator("h1.mz-question").innerText().catch(() => "")).includes(q.prompt.replace(/\p{Regional_Indicator}{2}/gu, "").trim().slice(0, 20)), 20000);
    const flag = p.getByRole("img", { name: /^Flag: / });
    check("Geography: the flag is exposed as a picture named 'Flag: <description>'", (await flag.count()) === 1, String(await flag.count()));
    const aria = await p.locator("h1.mz-question").ariaSnapshot().catch(() => "");
    console.log(`  question in the accessibility tree: ${aria.replace(/\n/g, " | ")}`);
    check("Geography: the question's accessible text names no option (no answer read out)", !q.options.some((o) => aria.toLowerCase().includes(o.toLowerCase())), aria);
    check("Geography: sighted players still see the flag emoji", /\p{Regional_Indicator}{2}/u.test(await p.locator("h1.mz-question").innerText()));
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/a11y-geo-flag-390.png") });
    await p.context().close();
  });

  // ---------- B + C. Who Said That (older panel) ----------
  await part("Who Said That", async () => {
    const room = await makeRoom(["Keku", "Amina", "Bartholomew", "Wanjiru"]);
    const gid = await practice(room, "who-said-that");
    const p = await seatPage(room, room.seats[1]);
    const startBtn = p.getByTestId("show-start-playing");
    await Promise.race([startBtn.waitFor({ timeout: 15000 }).then(() => startBtn.click()).catch(() => {}), p.locator(".answer-tile").first().waitFor({ timeout: 15000 }).catch(() => {})]);
    await p.locator(".answer-tile").first().waitFor({ timeout: 15000 });
    const qs = (await mine(room, room.seats[1], gid)).state?.questions ?? [];
    const groups = p.getByRole("group");
    await soon("Who Said That: every question is its own labelled group", async () => (await groups.count()) === qs.length && (await groups.first().getAttribute("data-testid")) === "quiz-question", 8000);
    const firstName = await p.getByRole("group").first().evaluate((el) => el.querySelector("legend")?.textContent ?? "");
    check("Who Said That: the group is named by its quote and says which question it is", firstName.includes(qs[0].prompt.slice(0, 15)) && /question 1 of/.test(firstName), firstName);
    const firstOption = await p.getByRole("group").first().locator(".answer-tile").first().innerText();
    await p.getByRole("group").first().locator(".answer-tile").first().click();
    await soon("Who Said That: an answered question says YOUR answer", async () => (await p.getByRole("group").first().getByRole("status").innerText().catch(() => "")) === `Your answer: ${firstOption}`, 10000);
    const body = await p.locator("body").innerText();
    check("Who Said That: no internal game or player ids on the screen", !INTERNAL.test(body), (body.match(INTERNAL) ?? [""])[0]);
    check("Who Said That: no internal status word ('Status: playing')", !/Status: playing/.test(body));
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/a11y-whosaid-groups-390.png") });
    await p.context().close();
  });
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "A11Y SURFACES ALL PASSED" : `A11Y SURFACES FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
