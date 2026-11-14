// Before/after screens for Stage 12.1: the same steps against any build (no Stage 12.1 test ids).
// Usage: node compare-shots.mjs <base> <outdir> <prefix>
import { launchChromium } from "$SP/wt121/scripts/lib/driver-env.mjs";
import { mkdirSync } from "node:fs";
import { solveMath } from "$SP/wt121/scripts/lib/math-solve.mjs";
import { PROTOCOL_HEADERS } from "$SP/wt121/scripts/lib/protocol.mjs";

const [BASE, OUT, PREFIX] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", ...PROTOCOL_HEADERS };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(kind, names) {
  const room = await api("/rooms", { body: { name: "Game night", kind } });
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ playerId: h.playerId, token: h.recoveryToken }];
  for (const n of names.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ playerId: j.playerId, token: j.recoveryToken }); }
  return { roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (roomId, seat, gid, action, payload) =>
  api(`/rooms/${roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId: gid, action, payload } } });
async function playMath(room, right, official) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "math-mayhem", official } });
  for (const s of room.seats) await intent(room.roomId, s, gid, "briefing-ready", { ready: true });
  await sleep(800);
  for (const [i, s] of room.seats.entries()) {
    const mine = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((g) => g.id === gid);
    for (const [n, q] of mine.questions.entries()) {
      const o = await intent(room.roomId, s, gid, "math-open", { questionId: q.id });
      const a = solveMath(o.result.prompt);
      await intent(room.roomId, s, gid, "submit-math-answer", { questionId: q.id, chosenIndex: o.result.options.findIndex((x) => (n < right[i] ? Number(x) === a : Number(x) !== a)) });
    }
  }
  return gid;
}
const browser = await launchChromium();
async function tvFor(code) {
  const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(code);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
  return tv;
}
try {
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await phone.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await phone.getByTestId("home-host").waitFor({ timeout: 15000 });
  await sleep(600);
  await phone.screenshot({ path: `${OUT}/${PREFIX}-home-390.png` });
  await phone.getByTestId("home-host").click();
  await phone.getByPlaceholder("e.g. Auntie June").fill("Keku");
  await sleep(400);
  await phone.screenshot({ path: `${OUT}/${PREFIX}-host-390.png` });

  const casual = await makeRoom("casual", ["Keku", "Amina", "Baraka"]);
  const tv = await tvFor(casual.code);
  await sleep(1500);
  await tv.screenshot({ path: `${OUT}/${PREFIX}-tv-lobby-1920.png` });
  await playMath(casual, [10, 5, 1], false);
  await tv.waitForFunction(() => document.querySelector('[data-testid="tv-mode"]')?.getAttribute("data-mode") === "final", null, { timeout: 30000 });
  await sleep(3500);
  await tv.screenshot({ path: `${OUT}/${PREFIX}-tv-final-1920.png` });

  const cup = await makeRoom("cup", ["Keku", "Amina", "Baraka"]);
  const tv2 = await tvFor(cup.code);
  await playMath(cup, [10, 5, 1], true);
  await tv2.waitForFunction(() => document.querySelector('[data-testid="tv-mode"]')?.getAttribute("data-mode") === "final", null, { timeout: 30000 });
  await sleep(3500);
  await tv2.screenshot({ path: `${OUT}/${PREFIX}-tv-cup-final-1920.png` });
  await tv2.getByTestId("tv-dir-lobby").click();
  await sleep(800);
  await tv2.screenshot({ path: `${OUT}/${PREFIX}-tv-cup-lobby-1920.png` });
  console.log("SHOTS OK");
} catch (e) { console.log("SHOTS FAILED", e); process.exitCode = 1; } finally { await browser.close(); }
