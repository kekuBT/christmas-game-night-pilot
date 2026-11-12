// Visual review package for the completion sprint (local only, Chromium, 390x844).
// Usage: start the server first (PORT=3457 npm run serve after npm run build:web),
// then: node scripts/screenshot-sprint.mjs http://localhost:3457
// Writes docs/sprint-screenshots/*.png (PNGs are local-only; they are NOT pushed
// to GitHub because the snapshot route accepts UTF-8 text only).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3457";
const OUT = "docs/sprint-screenshots";
mkdirSync(OUT, { recursive: true });
const NAMES = ["Alex", "Sam", "Jo", "Kim"];

async function api(path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function setupRoom(browser) {
  const room = await api("/rooms", { name: "Sprint Review" });
  const players = [];
  for (let i = 0; i < 4; i++) {
    const j = await api(`/rooms/${room.roomId}/join`, { displayName: NAMES[i], asHost: i === 0, hostClaimToken: room.hostClaimToken });
    players.push(j);
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base);
  await page.evaluate(([roomId, playerId, token]) => {
    sessionStorage.setItem("cgn_roomId", roomId);
    sessionStorage.setItem("cgn_playerId", playerId);
    sessionStorage.setItem("cgn_token", token);
  }, [room.roomId, players[0].playerId, players[0].recoveryToken]);
  await page.reload();
  await page.getByRole("heading", { name: "Players" }).waitFor({ timeout: 15000 });
  return { room, players, page };
}
function solveMath(prompt, options) {
  const m = prompt.match(/(-?\d+)\s*([+\-×*])\s*(-?\d+)/);
  if (!m) return -1;
  const a = Number(m[1]); const b = Number(m[3]);
  const v = m[2] === "+" ? a + b : m[2] === "-" ? a - b : a * b;
  return options.indexOf(String(v));
}
async function finishMath(room, players) {
  const game = await api(`/rooms/${room.roomId}/games`, { gameId: "math-mayhem", official: true }, players[0].recoveryToken);
  const gid = game.gameId;
  for (const p of players) {
    const proj = await fetch(`${base}/rooms/${room.roomId}/projection?audience=player`, { headers: { "x-session-token": p.recoveryToken } }).then((r) => r.json());
    const mine = proj.myGames.find((g) => g.id === gid);
    for (const q of mine.questions ?? []) {
      const idx = solveMath(q.prompt, q.options);
      await api(`/rooms/${room.roomId}/intents`, { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action: "submit-math-answer", payload: { questionId: q.id, chosenIndex: idx < 0 ? 0 : idx } } }, p.recoveryToken);
    }
  }
}

const browser = await chromium.launch({ headless: true });
try {
  // 1. Landing and room joining (no session).
  const landing = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await landing.goto(base);
  await landing.getByText("Join the family game night").waitFor({ timeout: 15000 });
  await landing.screenshot({ path: `${OUT}/01-landing-joining.png`, fullPage: true });
  await landing.close();

  // 2. Lobby with QR invite.
  const lobby = await setupRoom(browser);
  await lobby.page.screenshot({ path: `${OUT}/02-lobby.png`, fullPage: true });

  // 3-6. One fresh room per playing game, so each screenshot shows a live game.
  for (const [gameId, file] of [["impostor", "03-impostor.png"], ["caption-clash", "04-caption-clash.png"], ["trivia", "05-trivia.png"], ["geography", "06-geography.png"]]) {
    const s = await setupRoom(browser);
    await api(`/rooms/${s.room.roomId}/games`, { gameId, official: true }, s.players[0].recoveryToken);
    await s.page.reload();
    await s.page.getByText(`Now playing: ${gameId}`).waitFor({ timeout: 15000 });
    await s.page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
    await s.page.close();
  }

  // 7-10. Championship, TV, Memory Book, ceremony from one finished room.
  const main = await setupRoom(browser);
  await finishMath(main.room, main.players);
  await main.page.reload();
  await main.page.getByRole("button", { name: "Championship" }).click();
  await main.page.getByRole("heading", { name: "Championship standings" }).waitFor({ timeout: 15000 });
  await main.page.screenshot({ path: `${OUT}/07-championship.png`, fullPage: true });
  await main.page.getByRole("button", { name: "TV Dashboard" }).click();
  await main.page.getByRole("heading", { name: "TV Dashboard" }).waitFor({ timeout: 15000 });
  await main.page.screenshot({ path: `${OUT}/08-tv-hub.png`, fullPage: true });
  await main.page.getByRole("button", { name: "Memory Book" }).click();
  await main.page.getByTestId("memory-title").waitFor({ timeout: 15000 });
  await main.page.screenshot({ path: `${OUT}/09-memory-book.png`, fullPage: true });
  // Add + approve an entry, then screenshot the ceremony section of the championship view.
  const proj = await fetch(`${base}/rooms/${main.room.roomId}/ledger`, { headers: { "x-session-token": main.players[0].recoveryToken } }).then((r) => r.json());
  const src = proj.filter((e) => e.type === "game-finished").slice(-1).map((e) => e.eventId);
  const entry = await api(`/rooms/${main.room.roomId}/memory`, { day: 1, text: "Alex won Math Mayhem to open the night", sourceEventIds: src }, main.players[0].recoveryToken);
  await api(`/rooms/${main.room.roomId}/memory/${entry.id}/approve`, {}, main.players[0].recoveryToken);
  await main.page.getByRole("button", { name: "Championship" }).click();
  await main.page.getByRole("heading", { name: "End-of-day ceremony" }).waitFor({ timeout: 15000 });
  await main.page.screenshot({ path: `${OUT}/10-winner-ceremony.png`, fullPage: true });
  await main.page.close();
  console.log("SPRINT SCREENSHOTS OK: 10 views in docs/sprint-screenshots/");
} finally {
  await browser.close();
}
