// TV spectator investigation (Phase 2.1 §1). Answers, with evidence:
//  - Can a page watch TV without joining? (No: no room, no TV button.)
//  - Does opening/closing/reopening the TV stage create participants?
//  - Does a TV-view player score, or block finishing, by viewing?
// Usage: build:web, serve on a port, then:
//   node scripts/check-tv-spectator.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";

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
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
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
// Public TV projection: roster + games, no session needed.
async function tvProj(roomId) {
  const r = await fetch(`${BASE}/rooms/${roomId}/projection?audience=tv`);
  return r.json();
}
async function roomIdOf(page) {
  return page.evaluate(() => sessionStorage.getItem("cgn_roomId"));
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
  check("baseline roster is 3 players", proj.players.length === 3, proj.players.map((p) => p.displayName).join(","));

  // 1. A fresh page that never joins sees landing only — no TV, no room.
  const stranger = await ctx.newPage();
  await stranger.goto(BASE, { waitUntil: "domcontentloaded" });
  await stranger.waitForTimeout(1000);
  const hasTvBtn = await stranger.getByRole("button", { name: "TV stage" }).count();
  const hasHostBtn = await stranger.getByRole("button", { name: "Host a game" }).count();
  check("unjoined page has no TV stage button", hasTvBtn === 0 && hasHostBtn === 1);
  proj = await tvProj(roomId);
  check("unjoined page created no participant", proj.players.length === 3);

  // 2. Joining as TV adds exactly one participant; view switches add none.
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tv = await tvCtx.newPage();
  await joinRoom(tv, "TV", code);
  proj = await tvProj(roomId);
  check("joining as TV adds one participant", proj.players.length === 4 && proj.players.some((p) => p.displayName === "TV"));
  await tv.getByRole("button", { name: "TV stage" }).click();
  // No game has started yet, so the TV view is still the old dashboard
  // (the Mchezo stage only takes over once a Trivia game exists).
  await tv.getByText("TV Dashboard — public only").waitFor({ timeout: 15000 });
  await sleep(1000);
  proj = await tvProj(roomId);
  check("opening TV stage adds no participant", proj.players.length === 4);
  await tv.getByRole("button", { name: "Lobby & Games" }).click();
  await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
  proj = await tvProj(roomId);
  check("closing TV stage removes no participant", proj.players.length === 4);

  // 3. TV view does not score: start trivia, everyone except TV answers.
  await host.getByTestId("start-official-trivia").click();
  await host.locator(".mz-question").waitFor({ timeout: 30000 });
  for (const g of [host, ...guests]) await answerAllTrivia(g);
  await sleep(3000);
  proj = await tvProj(roomId);
  const trivia = (proj.games ?? []).find((g) => g.gameId === "trivia");
  check("game stays unfinished while connected TV has not answered",
    trivia?.status === "playing", `status=${trivia?.status}`);
  check("TV has no answers while only viewing",
    !(trivia?.answers && Object.keys(trivia.answers).length > 3), `answers keys=${trivia?.answers ? Object.keys(trivia.answers).length : 0}`);

  // TV abstains from the phone view; the game can then finish.
  await tv.getByRole("button", { name: "Sit this game out" }).click();
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  proj = await tvProj(roomId);
  const finished = (proj.games ?? []).find((g) => g.gameId === "trivia");
  check("game finishes once TV abstains", finished?.status === "finished");
  const tvScore = (finished?.rawScores ?? {})[proj.players.find((p) => p.displayName === "TV")?.id ?? ""];
  check("TV scores 0 after viewing + abstaining", tvScore === 0, `tvScore=${tvScore}`);
  const others = (finished?.rawScores ?? {});
  console.log("DEBUG finished rawScores:", JSON.stringify(others), "players:", JSON.stringify(proj.players.map((p) => ({ id: p.id, name: p.displayName }))));
  // Identical answers must give identical scores regardless of which
  // options happened to be correct in this game's random question set
  // (this is what makes the check deterministic; correctness luck varies).
  const tvId = proj.players.find((p) => p.displayName === "TV")?.id;
  const playerScores = Object.entries(others).filter(([id]) => id !== tvId).map(([, s]) => s);
  check("identical answers give identical scores for all answering players",
    playerScores.length === 3 && playerScores.every((s) => s === playerScores[0]),
    `scores=${playerScores.join(",")}`);

  // 4. Refreshing the TV page restores the same slot (session token).
  // After the finished game the page reloads onto the results screen, not
  // the lobby, so accept either state and return to the lobby first.
  await tv.reload({ waitUntil: "domcontentloaded" });
  await tv.waitForTimeout(3000);
  console.log("DEBUG after reload body:", (await tv.locator("body").textContent())?.slice(0, 300));
  const backBtn = tv.getByRole("button", { name: "Back to lobby" });
  if (await backBtn.isVisible({ timeout: 15000 }).catch(() => false)) await backBtn.click();
  await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
  proj = await tvProj(roomId);
  const tvEntries = proj.players.filter((p) => p.displayName === "TV");
  check("refresh restores the same TV slot, no duplicate",
    tvEntries.length === 1 && tvEntries[0].connected === true, `entries=${tvEntries.length}`);

  // 5. Close + reopen without the token: same name is refused (slot still
  // exists, disconnected); a new name creates a new slot, old slot Away.
  await tv.close();
  const tv2 = await tvCtx.newPage();
  await tv2.goto(BASE, { waitUntil: "domcontentloaded" });
  await tv2.getByPlaceholder("e.g. Auntie June").fill("TV");
  await tv2.locator(".mz-code__input").fill(code);
  await tv2.getByRole("button", { name: "Join the game" }).click();
  await sleep(1500);
  const bodyText = await tv2.locator("body").textContent();
  check("rejoining as TV is refused while the old slot exists",
    // Work Package F: the refusal now reads as the human sentence, not
    // the raw server text ("Display name already taken").
    /That name is taken in this room/i.test(bodyText ?? ""), (bodyText ?? "").slice(0, 80));
  proj = await tvProj(roomId);
  check("failed rejoin added no participant", proj.players.length === 4);
  await tv2.getByPlaceholder("e.g. Auntie June").fill("TV2");
  await tv2.getByRole("button", { name: "Join the game" }).click();
  // A fresh joiner in a room with a just-finished game lands on that
  // game's results screen, not the lobby — accept either, then go lobby.
  await tv2.waitForTimeout(3000);
  const tv2Back = tv2.getByRole("button", { name: "Back to lobby" });
  if (await tv2Back.isVisible({ timeout: 5000 }).catch(() => false)) await tv2Back.click();
  await tv2.getByRole("heading", { name: "You’re in, TV2." }).waitFor({ timeout: 15000 });
  proj = await tvProj(roomId);
  const oldTv = proj.players.find((p) => p.displayName === "TV");
  check("new name joins as a new slot; old TV slot shows disconnected",
    proj.players.length === 5 && oldTv?.connected === false,
    proj.players.map((p) => `${p.displayName}:${p.connected}`).join(","));
  console.log(failures === 0 ? "TV SPECTATOR ALL PASSED" : `TV SPECTATOR FAILED: ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await browser.close();
}
