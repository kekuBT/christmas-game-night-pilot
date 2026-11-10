// TV entry during an active game (Milestone C.5): opening the TV stage
// from a question screen or a results screen must be a pure view switch —
// no game state touched, no restart, progress intact on return.
// Usage: build:web, serve on a port, then:
//   node scripts/check-tv-entry.mjs <baseUrl>
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
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByTestId("host-kind-cup").click(); await page.getByRole("button", { name: "Host a game" }).click();
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
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function roomIdOf(page) {
  return page.evaluate(() => sessionStorage.getItem("cgn_roomId"));
}
async function answerOption(page, optionIndex) {
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }).catch(() => false)) return;
    const slab = page.locator(".mz-slab:not([disabled])").nth(optionIndex);
    if (await slab.isVisible({ timeout: 1500 }).catch(() => false)) { await slab.click(); await sleep(200); }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 1000 }).catch(() => false)) { await next.click(); await sleep(200); }
    const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
    if (await doneBtn.isVisible({ timeout: 1000 }).catch(() => false)) { await doneBtn.click(); await sleep(200); }
  }
}
async function tvProj(roomId) {
  return (await fetch(`${BASE}/rooms/${roomId}/projection?audience=tv`)).json();
}

const browser = await launchChromium();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const roomId = await roomIdOf(host);
  const bea = await ctx.newPage();
  await joinRoom(bea, "Bea", code);

  await host.getByTestId("start-official-trivia").click();
  await passBriefing([host, bea]); // D3: both tap I'm ready
  await bea.locator(".mz-question").waitFor({ timeout: 30000 });

  // Mid-game: question screen -> TV stage -> back, progress intact.
  await bea.getByTestId("mz-tv-stage").click();
  await bea.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
  check("tv entry mid-game: TV stage opens from a question screen", true);
  const midProj = await tvProj(roomId);
  const midGame = (midProj.games ?? []).at(-1);
  check("tv entry mid-game: game still playing, no restart",
    midGame?.status === "playing", `status=${midGame?.status}`);
  check("tv entry mid-game: TV entry added no player seat",
    midProj.players.length === 2, `players=${midProj.players.length}`);
  await bea.getByRole("button", { name: "Back to phone view" }).click();
  await bea.locator(".mz-question").waitFor({ timeout: 30000 });
  check("tv entry mid-game: back returns to the question screen", true);

  // Finish the game from both phones; scores must be intact.
  await answerOption(bea, 0);
  await answerOption(host, 0);
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  await bea.getByText(/Your game total:/).waitFor({ timeout: 30000 });
  const finProj = await tvProj(roomId);
  const finGame = (finProj.games ?? []).filter((g) => g.gameId === "trivia" && g.status === "finished").at(-1);
  const scores = finGame?.rawScores ?? {};
  check("tv entry mid-game: game finishes with both players scored",
    finGame?.status === "finished" && Object.keys(scores).length === 2,
    `status=${finGame?.status} scores=${JSON.stringify(scores)}`);

  // Results screen -> TV stage -> back, results intact.
  await bea.getByTestId("mz-tv-stage").click();
  await bea.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
  check("tv entry from results: TV stage opens from the results screen", true);
  await bea.getByRole("button", { name: "Back to phone view" }).click();
  await bea.getByText(/Your game total:/).waitFor({ timeout: 15000 });
  check("tv entry from results: back returns to the results screen", true);

  console.log(failures === 0 ? "TV ENTRY ALL PASSED" : `TV ENTRY FAILED: ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await browser.close();
}
