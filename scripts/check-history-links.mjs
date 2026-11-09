// Stage 5.1 (3E): two navigation/state reports, reproduced with controlled
// transitions.
//   A. Library: a filtered in-room Library opened straight from a link (a
//      fresh tab, so Home is put beneath it) — "Back to lobby" used to land
//      on Home, outside the room, where "All games" is the plain standalone
//      Library. Now it reaches the lobby; browser Back still offers Home with
//      Rejoin (S3-NAV-02); reopening the room's Library keeps its filters.
//   B. Memory Book: a page left open while another game finishes used to
//      cite the game before. Now it shows which game a highlight will cite
//      before adding, follows the room's ledger, and sends exactly that game.
// Practice games, isolated server, no content test mode.
// Starts ITS OWN server. Usage: node scripts/check-history-links.mjs
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
const DATA = mkdtempSync(join(tmpdir(), "mz-hist-"));
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
  const room = await api("/rooms", { body: { name: "History check" } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: h.playerId, token: h.recoveryToken }];
  for (const n of names.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, joinCode: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
/** Start a practice quiz game; everyone is ready, so it is playing. */
async function startQuiz(room, gameId) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  return gid;
}
/** Everyone answers every question (option 0): the game finishes. Returns its status. */
async function finishQuiz(room, gid, action) {
  for (const s of room.seats) {
    const g = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((x) => x.id === gid);
    for (const q of g.state?.questions ?? []) await intent(room, s, gid, action, { questionId: q.id, chosenIndex: 0 });
  }
  return (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: room.seats[0].token })).myGames.find((x) => x.id === gid).status;
}
const browser = await launchChromium();
async function seatPage(room, seat, path, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }); // a fresh page load, as when a link is opened
  return p;
}
const pathOf = (p) => { const u = new URL(p.url()); return u.pathname + u.search; };

/** Each part runs on its own: a failure in one never hides the other. */
async function part(name, fn) {
  try { await fn(); } catch (e) { check(`${name}: ran to the end`, false, String(e.message ?? e).split("\n")[0]); }
}
try {
  // ---------- A. The room's Library, opened straight from a link ----------
  await part("Library", async () => {
    const room = await makeRoom(["Keku", "Amina"]);
    const p = await seatPage(room, room.seats[0], "/room/library?q=word");
    await p.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
    check("Library link: the room's Library opens filtered", pathOf(p) === "/room/library?q=word" && /word/.test(await p.getByTestId("mz-lib-active").innerText()), pathOf(p));
    await p.getByTestId("mz-lib-search").fill("words"); // the view this tab last had in the room
    await soon("Library: the new search is in the address", async () => pathOf(p) === "/room/library?q=words");
    check("Library: its Back button promises the lobby", (await p.getByTestId("mz-lib-back").getAttribute("aria-label")) === "Back to lobby");
    await p.getByTestId("mz-lib-back").click();
    await soon("Library: 'Back to lobby' reaches the lobby (not Home, outside the room)", async () => pathOf(p) === "/room" && (await p.getByTestId("lobby-dock").count()) === 1, 8000);
    console.log(`  after Back to lobby: ${pathOf(p)}`);
    await p.goBack();
    await soon("Browser Back from the lobby still offers Home with Rejoin (S3-NAV-02)", async () => pathOf(p) === "/" && (await p.getByTestId("home-rejoin").count()) === 1, 8000);
    await p.getByTestId("home-rejoin-btn").click();
    await p.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    await p.getByTestId("room-menu").click();
    await p.getByTestId("browse-games").click();
    await p.getByTestId("mz-lib-count").waitFor({ timeout: 10000 });
    await soon("Reopening the room's Library keeps its filters (in the room, not the standalone Library)", async () => pathOf(p) === "/room/library?q=words" && /words/.test(await p.getByTestId("mz-lib-active").innerText()), 8000);
    check("…and it is still the room's Library (Back to lobby, room fit)", (await p.getByTestId("mz-lib-back").getAttribute("aria-label")) === "Back to lobby");
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/library-reopened-filtered-390.png") });
    await p.context().close();
  });

  // ---------- B. Memory Book open while another game finishes ----------
  // (A briefing brings every player to the lobby, so the page is opened
  // while game 2 is already being played and stays open as it ends.)
  await part("Memory", async () => {
    const room = await makeRoom(["Keku", "Amina"]);
    const g1 = await startQuiz(room, "trivia");
    check("Memory: game 1 (Trivia) finished", (await finishQuiz(room, g1, "trivia-answer")) === "finished");
    const g2 = await startQuiz(room, "geography");
    const p = await seatPage(room, room.seats[0], "/room/memories");
    await p.getByTestId("memory-link-target").waitFor({ timeout: 15000 });
    const ledger1 = await api(`/rooms/${room.roomId}/ledger`, { token: room.seats[0].token });
    const fin1 = ledger1.find((e) => e.type === "game-finished" && e.gameInstanceId === g1);
    await soon("Memory: before adding, it says the highlight will cite Trivia", async () => /Linked to Trivia/.test(await p.getByTestId("memory-link-target").innerText()) && (await p.getByTestId("memory-link-target").getAttribute("data-event")) === fin1.eventId);
    await p.locator(".mz-memory__text").fill("Amina swept the geography round");
    check("Memory: game 2 (Geography) finishes while the page is open", (await finishQuiz(room, g2, "geography-answer")) === "finished");
    const ledger2 = await api(`/rooms/${room.roomId}/ledger`, { token: room.seats[0].token });
    const fin2 = ledger2.find((e) => e.type === "game-finished" && e.gameInstanceId === g2);
    check("Memory: still on the Memory Book", new URL(p.url()).pathname === "/room/memories", new URL(p.url()).pathname);
    await soon("Memory: the shown link follows the room: it now says Geography", async () => /Linked to Geography/.test(await p.getByTestId("memory-link-target").innerText()) && (await p.getByTestId("memory-link-target").getAttribute("data-event")) === fin2.eventId, 10000);
    check("Memory: the typed highlight is still there", (await p.locator(".mz-memory__text").inputValue()) === "Amina swept the geography round");
    await p.screenshot({ path: screenshotPath("docs/stage5-qa/after/memory-link-follows-390.png") });
    await p.getByRole("button", { name: "Add from last finished game" }).click();
    await soon("Memory: the added entry cites exactly the game shown (Geography), not the one before", async () => {
      const book = await api(`/rooms/${room.roomId}/memory`, { token: room.seats[0].token });
      const e = book.find((x) => x.text === "Amina swept the geography round");
      return !!e && e.sourceEventIds.length === 1 && e.sourceEventIds[0] === fin2.eventId;
    }, 10000);
    const book = await api(`/rooms/${room.roomId}/memory`, { token: room.seats[0].token });
    const added = book.find((x) => x.text === "Amina swept the geography round");
    console.log(`  added entry cites: ${JSON.stringify(added?.sourceEventIds)} (game 1 ${fin1.eventId}, game 2 ${fin2.eventId})`);
    check("Memory: still pending approval (approval rules unchanged)", added?.approved === false);
    await p.context().close();
  });
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "HISTORY LINKS ALL PASSED" : `HISTORY LINKS FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
