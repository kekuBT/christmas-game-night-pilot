// True spectator mode (Milestone B): watching must not create a player.
//  - Spectating via the landing button creates no seat and no score.
//  - Spectators survive a full room, join mid-game, refresh, and disconnect
//    without touching player counts, completion, or scores.
//  - Spectator credentials grant no player/host powers (API-checked).
//  - A competing player opening TV on a second tab keeps the same slot.
// Usage: build:web, serve on a port, then:
//   node scripts/check-spectator.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function createRoom(page, name) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(500);
  }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  // A fresh joiner in a room with a just-finished game lands on that
  // game's results screen first — dismiss it to reach the lobby.
  const lobbyHeading = page.getByRole("heading", { name: `You’re in, ${name}.` });
  const backBtn = page.getByRole("button", { name: "Back to lobby" });
  for (let i = 0; i < 30; i++) {
    if (await lobbyHeading.isVisible({ timeout: 500 }).catch(() => false)) return;
    if (await backBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await backBtn.click();
      await lobbyHeading.waitFor({ timeout: 15000 });
      return;
    }
    await sleep(500);
  }
  throw new Error(`join did not reach lobby for ${name}`);
}
async function spectate(page, code) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
}
async function answerAllTrivia(page) {
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }).catch(() => false)) return;
    const slab = page.locator(".mz-slab:not([disabled])").first();
    if (await slab.isVisible({ timeout: 1500 }).catch(() => false)) { await slab.click(); await sleep(300); }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 1500 }).catch(() => false)) { await next.click(); await sleep(300); }
    const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
    if (await doneBtn.isVisible({ timeout: 1500 }).catch(() => false)) { await doneBtn.click(); await sleep(300); }
  }
}
async function tvProj(roomId) {
  const r = await fetch(`${BASE}/rooms/${roomId}/projection?audience=tv`);
  return r.json();
}
async function roomIdOf(page) {
  return page.evaluate(() => sessionStorage.getItem("cgn_roomId"));
}
async function specSessionOf(page) {
  return page.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_spec_roomId"), token: sessionStorage.getItem("cgn_spec_token") }));
}

const browser = await launchChromium();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const roomId = await roomIdOf(host);
  const guests = [];
  for (const name of ["Bea", "Cal"]) {
    const p = await ctx.newPage();
    await joinRoom(p, name, code);
    guests.push(p);
  }
  let proj = await tvProj(roomId);
  check("baseline roster is 3 players, 0 watching", proj.players.length === 3 && proj.spectatorCount === 0,
    `players=${proj.players.length} watching=${proj.spectatorCount}`);

  // 1. Spectate from landing: no seat, no lobby, watching count 1.
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const spec1 = await tvCtx.newPage();
  await spectate(spec1, code);
  await sleep(1500);
  proj = await tvProj(roomId);
  check("spectating adds no player", proj.players.length === 3, `players=${proj.players.length}`);
  check("spectator counted as watching", proj.spectatorCount === 1, `watching=${proj.spectatorCount}`);
  const lobbyHeading = await spec1.getByRole("heading", { name: /You’re in/ }).count();
  const startBtn = await spec1.getByTestId(/start-/).count();
  check("spectator sees no lobby seat and no Start control", lobbyHeading === 0 && startBtn === 0);

  // 2. Spectator credentials grant no powers (via the page's own session).
  const specCreds = await specSessionOf(spec1);
  const denied = await spec1.evaluate(async ({ roomId, token }) => {
    const results = {};
    for (const [label, path, body] of [
      ["games", `/rooms/${roomId}/games`, { gameId: "trivia" }],
      ["intents", `/rooms/${roomId}/intents`, { intent: {} }],
      ["reactions", `/rooms/${roomId}/reactions`, { emoji: "🎄" }],
    ]) {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-spectator-token": token }, body: JSON.stringify(body) });
      results[label] = r.status;
    }
    return results;
  }, specCreds);
  check("spectator token denied on games/intents/reactions",
    denied.games === 401 && denied.intents === 401 && denied.reactions === 401, JSON.stringify(denied));

  // 3. Bad code cannot spectate.
  const stranger = await tvCtx.newPage();
  await stranger.goto(BASE, { waitUntil: "domcontentloaded" });
  await stranger.locator(".mz-code__input").fill("ZZZZZZ");
  await stranger.getByTestId("watch-spectator").click();
  await sleep(1000);
  const errText = await stranger.locator(".err").first().textContent().catch(() => "");
  check("bad code spectate fails on landing", /Room not found/.test(errText ?? ""), errText ?? "");
  proj = await tvProj(roomId);
  check("failed spectate changed nothing", proj.players.length === 3 && proj.spectatorCount === 1);

  // 4. Mid-game spectator joins while Trivia is playing; game unaffected.
  await host.getByTestId("start-official-trivia").click();
  await passBriefing([host, ...guests]); // D3: the three players tap I'm ready
  await host.locator(".mz-question").waitFor({ timeout: 30000 });
  const spec2 = await tvCtx.newPage();
  await spectate(spec2, code);
  await sleep(1500);
  proj = await tvProj(roomId);
  check("mid-game spectator adds no player", proj.players.length === 3 && proj.spectatorCount === 2,
    `players=${proj.players.length} watching=${proj.spectatorCount}`);
  const spec2Stage = await spec2.getByRole("button", { name: "Stop watching" }).count();
  check("mid-game spectator sees the TV view", spec2Stage === 1);

  // 5. Players finish; spectator never scores and never blocked finishing.
  for (const g of [host, ...guests]) await answerAllTrivia(g);
  await sleep(3000);
  proj = await tvProj(roomId);
  const trivia = (proj.games ?? []).find((g) => g.gameId === "trivia");
  check("game finished with spectators watching", trivia?.status === "finished", `status=${trivia?.status}`);
  check("scores cover exactly the 3 players", trivia?.rawScores && Object.keys(trivia.rawScores).length === 3,
    `scores=${trivia?.rawScores ? Object.keys(trivia.rawScores).length : 0}`);

  // 6. Full room still admits spectators.
  for (const name of ["Dee", "Eli", "Fay", "Gus", "Hal", "Ida", "Jay"]) {
    const p = await ctx.newPage();
    await joinRoom(p, name, code);
  }
  proj = await tvProj(roomId);
  check("room filled to 10 players", proj.players.length === 10, `players=${proj.players.length}`);
  const spec3 = await tvCtx.newPage();
  await spectate(spec3, code);
  await sleep(1500);
  proj = await tvProj(roomId);
  check("full room still admits a spectator", proj.players.length === 10 && proj.spectatorCount === 3,
    `players=${proj.players.length} watching=${proj.spectatorCount}`);

  // 7. Disconnect drops the watching count; refresh keeps the same spectator.
  await spec2.close();
  let watched = -1;
  for (let i = 0; i < 20 && watched !== 2; i++) {
    await sleep(500);
    watched = (await tvProj(roomId)).spectatorCount;
  }
  check("closing a spectator tab drops the watching count", watched === 2, `watching=${watched}`);
  await spec1.reload();
  await spec1.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
  await sleep(1500);
  proj = await tvProj(roomId);
  check("refresh keeps the same spectator (no duplicate, no new seat)",
    proj.players.length === 10 && proj.spectatorCount === 2, `players=${proj.players.length} watching=${proj.spectatorCount}`);

  // 8. A competing player opening TV on a second tab keeps the same slot.
  const hostSession = await host.evaluate(() => ({
    roomId: sessionStorage.getItem("cgn_roomId"),
    playerId: sessionStorage.getItem("cgn_playerId"),
    token: sessionStorage.getItem("cgn_token"),
  }));
  const hostTab2 = await tvCtx.newPage();
  await hostTab2.goto(BASE, { waitUntil: "domcontentloaded" });
  await hostTab2.evaluate((s) => {
    sessionStorage.setItem("cgn_roomId", s.roomId);
    sessionStorage.setItem("cgn_playerId", s.playerId);
    sessionStorage.setItem("cgn_token", s.token);
  }, hostSession);
  await hostTab2.reload();
  // A returning player with a finished game lands on results first.
  const hostLobbyHeading = hostTab2.getByRole("heading", { name: "You’re in, Ada." });
  const hostBackBtn = hostTab2.getByRole("button", { name: "Back to lobby" });
  for (let i = 0; i < 30; i++) {
    if (await hostLobbyHeading.isVisible({ timeout: 500 }).catch(() => false)) break;
    if (await hostBackBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await hostBackBtn.click();
      await hostLobbyHeading.waitFor({ timeout: 15000 });
      break;
    }
    await sleep(500);
  }
  await hostTab2.getByRole("button", { name: "TV stage" }).click();
  await sleep(1500);
  proj = await tvProj(roomId);
  check("player TV on a second tab adds no seat", proj.players.length === 10, `players=${proj.players.length}`);
  const hostSeats = proj.players.filter((p) => p.displayName === "Ada");
  check("host still occupies exactly one seat", hostSeats.length === 1);

  // 9. Stop watching clears the spectator session back to landing.
  await spec3.getByRole("button", { name: "Stop watching" }).click();
  await spec3.getByRole("button", { name: "Host a game" }).waitFor({ timeout: 15000 });
  await sleep(1500);
  proj = await tvProj(roomId);
  check("stop watching drops the count to 1", proj.spectatorCount === 1, `watching=${proj.spectatorCount}`);

  console.log(failures === 0 ? "SPECTATOR ALL PASSED" : `SPECTATOR FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await browser.close();
}
