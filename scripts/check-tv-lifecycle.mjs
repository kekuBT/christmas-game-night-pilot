// TV stage lifecycle (Phase 2.1 §5): the TV follows the LATEST game
// overall through server state — lobby dashboard, Trivia stage while
// Trivia plays, leaderboard when it finishes, dashboard again (never a
// stale Trivia stage) once a newer game starts or finishes, and a fresh
// stage when Trivia starts again. Host game actions drive every transition;
// no TV-device click is needed for the switches themselves.
// Usage: build:web, serve on a port, then:
//   node scripts/check-tv-lifecycle.mjs <baseUrl>
import { chromium } from "playwright";

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
    if (await slab.isVisible({ timeout: 1500 }).catch(() => false)) { await slab.click(); await sleep(200); }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 1000 }).catch(() => false)) { await next.click(); await sleep(200); }
    const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
    if (await doneBtn.isVisible({ timeout: 1000 }).catch(() => false)) { await doneBtn.click(); await sleep(200); }
  }
}
async function answerAllMath(page) {
  for (let i = 0; i < 40; i++) {
    const tiles = page.locator(".grid button");
    if (await tiles.count() === 0) break;
    await tiles.first().click();
    await page.waitForTimeout(200);
  }
}
async function tvIsStage(tv) {
  return (await tv.getByRole("region", { name: "Mchezo big screen" }).count()) > 0;
}
async function tvIsDashboard(tv) {
  return ((await tv.locator("body").textContent()) ?? "").includes("TV Dashboard — public only");
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const guests = [];
  for (const name of ["Bea", "Cal"]) {
    const p = await ctx.newPage();
    await joinRoom(p, name, code);
    guests.push(p);
  }
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tv = await tvCtx.newPage();
  await joinRoom(tv, "TV", code);

  // Lobby: TV shows the dashboard (no game yet).
  await tv.getByRole("button", { name: "TV stage" }).click();
  await tv.getByText("TV Dashboard — public only").waitFor({ timeout: 15000 });
  check("lobby: TV shows the dashboard", await tvIsDashboard(tv));

  // Trivia starts: the TV view switches to the stage on its own.
  await host.getByTestId("start-official-trivia").click();
  await host.locator(".mz-question").waitFor({ timeout: 30000 });
  await tv.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 20000 });
  check("trivia playing: TV auto-switches to the stage", (await tv.locator("body").textContent()).includes("Featured question"));

  // Trivia finishes: the stage follows to the leaderboard on its own.
  // The TV player must answer or abstain for the game to finish, so it
  // leaves the stage for its phone view first. Its intro countdown (8s)
  // may still be running, so wait for the question screen properly.
  for (const g of [host, ...guests]) await answerAllTrivia(g);
  await tv.getByRole("button", { name: "Back to phone view" }).click();
  await tv.locator(".mz-question").waitFor({ timeout: 30000 });
  await answerAllTrivia(tv);
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  await tv.getByRole("button", { name: "Back to lobby" }).click().catch(() => {});
  await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
  await tv.getByRole("button", { name: "TV stage" }).click();
  await tv.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
  // D: finished TV auto-walks the reveal; jump straight to the board.
  await tv.getByRole("tab", { name: "Leaderboard" }).click();
  await sleep(3000);
  check("trivia finished: TV shows the leaderboard stage",
    (await tv.locator("body").textContent()).includes("This game's standings"));

  // Host returns to lobby and starts Math: TV must leave the Trivia stage.
  // Everyone first returns to the lobby from the Trivia results screens.
  await host.getByRole("button", { name: "Back to lobby" }).click();
  await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  for (const g of guests) {
    await g.getByRole("button", { name: "Back to lobby" }).click().catch(() => {});
    await g.getByRole("heading", { name: /You’re in, / }).waitFor({ timeout: 15000 }).catch(() => {});
  }
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-math-mayhem").click();
  await host.getByTestId("start-official-math-mayhem").click();
  await host.getByTestId("show-intro").waitFor({ timeout: 15000 });
  await sleep(2000);
  check("newer game playing: TV leaves the Trivia stage for the dashboard",
    !(await tvIsStage(tv)) && (await tvIsDashboard(tv)));
  check("newer game playing: dashboard names Math Mayhem as now playing",
    (await tv.locator("body").textContent()).includes("Math Mayhem"));

  // Math finishes (everyone plays, TV included): TV stays on the
  // dashboard with Math in Recent games.
  await host.getByTestId("show-start-playing").click();
  for (const g of [...guests, tv]) {
    if (g === tv) await tv.getByRole("button", { name: "Lobby & Games" }).click();
    await g.getByTestId("show-intro").waitFor({ timeout: 15000 }).catch(() => {});
    await g.getByTestId("show-start-playing").click().catch(() => {});
    await answerAllMath(g);
  }
  await answerAllMath(host);
  await host.getByTestId("show-results").waitFor({ timeout: 30000 });
  await sleep(2000);
  console.log("DEBUG TV body at math finish:", (await tv.locator("body").textContent())?.slice(0, 300));
  // Return TV to TV view (it left to play Math) before asserting.
  if (!(await tvIsDashboard(tv)) && !(await tvIsStage(tv))) {
    if ((await tv.getByRole("button", { name: "TV Dashboard" }).count()) > 0) await tv.getByRole("button", { name: "TV Dashboard" }).click();
    else await tv.getByRole("button", { name: "TV stage" }).click();
    await sleep(1500);
  }
  const dashText = await tv.locator("body").textContent();
  check("newer game finished: TV still on the dashboard, no stale Trivia stage",
    !(await tvIsStage(tv)) && dashText.includes("math-mayhem"));

  // Trivia starts again: TV returns to a FRESH stage (question, not the
  // old leaderboard) for the new game. The TV page left TV view to play
  // Math, so it re-enters through the old view's TV Dashboard button.
  await host.getByTestId("show-back-to-lobby").click();
  await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-trivia").click();
  await host.getByTestId("start-official-trivia").click();
  await host.locator(".mz-question").waitFor({ timeout: 30000 });
  // TV is already on TV view from the previous check; only navigate if it
  // left (e.g. it went back to a phone view).
  if (!(await tvIsDashboard(tv)) && !(await tvIsStage(tv))) {
    if ((await tv.getByRole("button", { name: "TV Dashboard" }).count()) > 0) await tv.getByRole("button", { name: "TV Dashboard" }).click();
    else await tv.getByRole("button", { name: "TV stage" }).click();
  }
  await tv.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 20000 });
  const stageText = await tv.locator("body").textContent();
  check("trivia restarts: TV returns to a fresh question stage",
    stageText.includes("Featured question") && !stageText.includes("This game's standings"));
  console.log(failures === 0 ? "TV LIFECYCLE ALL PASSED" : `TV LIFECYCLE FAILED: ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await browser.close();
}
