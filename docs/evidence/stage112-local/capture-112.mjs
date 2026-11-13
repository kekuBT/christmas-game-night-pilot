// Stage 11.2 before/after capture. Run with cwd = a worktree whose web app is built:
//   node capture-112.mjs <outdir> <prefix>
// One casual room with two finished Math Mayhem games and three notes (two approved, one pending), shown at
// 320 and 390 px in both looks; its PDF and Markdown; and one Cup room where a note is added on Day 2 about the
// Day 1 game. The same steps run against the base build (before) and the Stage 11.2 build (after).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const { launchChromium } = await import(resolve("scripts/lib/driver-env.mjs"));

const [outDir, prefix] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const out = (f) => join(outDir, `${prefix}-${f}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-cap112-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR, MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
delete env.NODE_ENV;
const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
child.stdout.on("data", (d) => { log += d; });
child.stderr.on("data", (d) => { log += d; });
let port;
for (let i = 0; i < 120 && !port; i++) { port = /on http:\/\/localhost:(\d+)/.exec(log)?.[1]; if (!port) await sleep(250); }
if (!port) { console.error(log.slice(-400)); process.exit(2); }
const BASE = `http://localhost:${port}`;

async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(names, name, kind) {
  const room = await api("/rooms", { body: { name, ...(kind ? { kind } : {}) } });
  const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: host.playerId, token: host.recoveryToken }];
  for (const n of names.slice(1)) {
    const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { roomId: room.roomId, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
const solve = (prompt) => {
  const pct = /^(\d+)% of (\d+)/.exec(prompt);
  if (pct) return (Number(pct[1]) * Number(pct[2])) / 100;
  const [a, op, b] = prompt.replace(/[=?]/g, " ").trim().split(/\s+/);
  const x = Number(a), y = Number(b);
  return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
};
/** Seat i gets right[i] questions right. Returns the game's game-finished event id. */
async function playMath(room, right, official) {
  const seen = await api(`/rooms/${room.roomId}/projection?audience=player`, { token: room.seats[0].token });
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "math-mayhem", official, ...(official ? {} : { roster: seen.readiness?.wouldPlay }) } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  for (const [i, s] of room.seats.entries()) {
    const g = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((x) => x.id === gid);
    for (const [k, q] of g.questions.entries()) {
      const o = await intent(room, s, gid, "math-open", { questionId: q.id });
      const idx = o.result.options.findIndex((x) => (k < right[i] ? Number(x) === solve(o.result.prompt) : Number(x) !== solve(o.result.prompt)));
      await intent(room, s, gid, "submit-math-answer", { questionId: q.id, chosenIndex: idx });
    }
  }
  const ledger = await api(`/rooms/${room.roomId}/ledger?watermark=1`, { token: room.seats[0].token });
  return ledger.events.find((e) => e.type === "game-finished" && e.gameInstanceId === gid).eventId;
}
const approve = (room, id) => api(`/rooms/${room.roomId}/memory/${id}/approve`, { token: room.seats[0].token, body: {} }).catch(() => undefined);
async function bookPage(browser, room, seat, viewport, look) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, deviceScaleFactor: 2 });
  await ctx.addInitScript((l) => { try { localStorage.setItem("mz_look", l); } catch { /* none */ } }, look);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}/room/memories`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("memory-screen").waitFor({ timeout: 15000 });
  return page;
}
const summary = {};
const browser = await launchChromium();
try {
  // ---- A casual room, two games.
  const casual = await makeRoom(["Keku", "Amina", "Zoë"], "Friday games", "casual");
  const g1 = await playMath(casual, [9, 6, 4], false);
  const g2 = await playMath(casual, [5, 10, 7], false);
  const n1 = await api(`/rooms/${casual.roomId}/memory`, { token: casual.seats[0].token, body: { day: 1, text: "Keku opened with nine right", sourceEventIds: [g1] } });
  const n2 = await api(`/rooms/${casual.roomId}/memory`, { token: casual.seats[1].token, body: { day: 1, text: "Amina took the rematch, ten for ten", sourceEventIds: [g2] } });
  await approve(casual, n1.id); await approve(casual, n2.id);
  await api(`/rooms/${casual.roomId}/memory`, { token: casual.seats[2].token, body: { day: 1, text: "Zoë wants a third round", sourceEventIds: [g2] } });
  for (const look of ["everyday", "christmas"]) {
    for (const [w, h] of [[320, 740], [390, 844]]) {
      const p = await bookPage(browser, casual, casual.seats[0], { width: w, height: h }, look);
      await p.getByTestId("memory-entry").nth(2).waitFor({ timeout: 15000 });
      await p.getByPlaceholder("e.g. Ada won Math Mayhem in a tie-break").fill("A draft about the rematch");
      await p.getByTestId("memory-link-target").filter({ hasText: "Linked to" }).waitFor({ timeout: 10000 });
      await sleep(300);
      await p.screenshot({ path: out(`${look}-casual-memory-${w}.png`), fullPage: true });
      const text = await p.getByTestId("memory-screen").innerText();
      summary[`${look}-${w}`] = {
        entries: (await p.getByTestId("memory-entry").allInnerTexts()).map((t) => t.split("\n").slice(0, 2).join(" / ")),
        dayWords: (text.match(/Day \d+/g) ?? []).length,
        preview: (await p.getByTestId("memory-link-target").innerText()).trim(),
        sideways: await p.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1),
      };
      if (look === "everyday" && w === 390) {
        await p.getByTestId("memory-md").click();
        await p.getByTestId("memory-md-text").waitFor({ timeout: 10000 });
        writeFileSync(out("casual.md"), await p.getByTestId("memory-md-text").innerText());
        const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.getByTestId("memory-pdf").click()]);
        writeFileSync(out("casual.pdf"), readFileSync(await dl.path()));
      }
      await p.context().close();
    }
  }
  // ---- A Cup room: an official game on Day 1, the host ends the day, a note about the Day 1 game added on Day 2.
  const cup = await makeRoom(["Keku", "Amina", "Zoë"], "Family Cup");
  const c1 = await playMath(cup, [10, 6, 3], true);
  await api(`/rooms/${cup.roomId}/day`, { token: cup.seats[0].token, body: {} });
  const late = await api(`/rooms/${cup.roomId}/memory`, { token: cup.seats[1].token, body: { day: 2, text: "Added on Day 2 about the Day 1 game", sourceEventIds: [c1] } });
  await approve(cup, late.id);
  const p = await bookPage(browser, cup, cup.seats[0], { width: 390, height: 844 }, "everyday");
  await p.getByTestId("memory-entry").first().waitFor({ timeout: 15000 });
  await sleep(300);
  await p.screenshot({ path: out("everyday-cup-memory-390.png"), fullPage: true });
  summary.cup = { storedDay: late.day, entries: (await p.getByTestId("memory-entry").allInnerTexts()).map((t) => t.split("\n").slice(0, 2).join(" / ")) };
  writeFileSync(out("cup.md"), (await api(`/rooms/${cup.roomId}/memory/export`, { token: cup.seats[0].token })).markdown);
  await p.context().close();
} finally {
  await browser.close();
  child.kill("SIGTERM");
}
writeFileSync(out("summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
