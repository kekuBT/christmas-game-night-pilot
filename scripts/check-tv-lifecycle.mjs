// TV stage lifecycle (Phase 2.1 §5): the TV follows the LATEST game
// overall through server state — lobby dashboard, Trivia stage while
// Trivia plays, leaderboard when it finishes, dashboard again (never a
// stale Trivia stage) once a newer game starts or finishes, and a fresh
// stage when Trivia starts again. Host game actions drive every transition;
// no TV-device click is needed for the switches themselves.
// Usage: build:web, serve on a port, then:
//   node scripts/check-tv-lifecycle.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";
import { roomGo } from "./lib/room-nav.mjs";
import { hostStartNow, tapReady } from "./lib/briefing.mjs";

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
// Math Mayhem renders in the Mchezo kit since §11 — the same
// QuestionScreen shape as Trivia (slabs + Next question + the
// "Waiting for the game to finish" keycap) — so it uses the same
// single-pass loop as answerAllTrivia above.
async function answerAllMath(page) {
  for (let i = 0; i < 40; i++) {
    if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }).catch(() => false)) return;
    const slab = page.locator(".mz-slab:not([disabled])").first();
    if (await slab.isVisible({ timeout: 1500 }).catch(() => false)) { await slab.click(); await sleep(200); }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 1000 }).catch(() => false)) { await next.click(); await sleep(200); }
    const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
    if (await doneBtn.isVisible({ timeout: 1000 }).catch(() => false)) { await doneBtn.click(); await sleep(200); }
  }
}
async function tvIsStage(tv) {
  return (await tv.getByRole("region", { name: "Mchezo big screen" }).count()) > 0;
}
async function tvIsDashboard(tv) {
  // Stage 5: the live show replaces the old dashboard for every game without its own stage.
  return (await tv.getByTestId("tv-show").count()) > 0;
}

const browser = await launchChromium();
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
  await roomGo(tv, "tv");
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
  check("lobby: TV shows the dashboard", await tvIsDashboard(tv));

  // Trivia starts with its D3 briefing: the TV shows the rules and who is
  // ready, never a question. The TV is a seat that can't tap Ready from the
  // TV view, so the host starts with explicit consent naming it (S4).
  await host.getByTestId("start-official-trivia").click();
  await tv.getByTestId("tv-briefing").waitFor({ timeout: 20000 });
  check("trivia briefing: TV shows the rules and who is ready, no question",
    (await tv.getByTestId("briefing-people").count()) === 1 && (await tv.locator(".mz-question").count()) === 0);
  await tapReady([host, ...guests]);
  const namedTrivia = await hostStartNow(host);
  check("Start now names the not-ready TV seat", /TV/.test(namedTrivia), namedTrivia);
  // Play begins: the TV view switches to the stage on its own.
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
  await roomGo(tv, "tv");
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
  await tv.getByTestId("tv-briefing").waitFor({ timeout: 20000 });
  check("newer game briefing: TV leaves the Trivia stage for the new rules", !(await tvIsStage(tv)));
  await tapReady([host, ...guests]);
  await hostStartNow(host); // the TV seat again isn't ready; the host confirms
  await sleep(2000);
  check("newer game playing: TV leaves the Trivia stage for the dashboard",
    !(await tvIsStage(tv)) && (await tvIsDashboard(tv)));
  check("newer game playing: dashboard names Math Mayhem as now playing",
    (await tv.locator("body").textContent()).includes("Math Mayhem"));

  // Math finishes (everyone plays, TV included): TV stays on the
  // dashboard with Math in Recent games.
  // D3: no per-phone intro after the briefing; everyone is straight in play.
  for (const g of [...guests, tv]) {
    if (g === tv) await tv.getByTestId("tv-back").click(); // the TV show's "Back to phone view"
    await answerAllMath(g);
  }
  await answerAllMath(host);
  await host.getByTestId("show-results").waitFor({ timeout: 30000 });
  await sleep(2000);
  console.log("DEBUG TV body at math finish:", (await tv.locator("body").textContent())?.slice(0, 300));
  // Return TV to TV view (it left to play Math) before asserting.
  if (!(await tvIsDashboard(tv)) && !(await tvIsStage(tv))) {
    await roomGo(tv, "tv"); // the dashboard's own button, or the lobby's room menu
    await sleep(1500);
  }
  const dashText = await tv.locator("body").textContent();
  check("newer game finished: TV still on the live show for Math Mayhem, no stale Trivia stage",
    !(await tvIsStage(tv)) && (await tv.getByTestId("tv-show").getAttribute("data-game")) === "math-mayhem", dashText.slice(0, 120));

  // Trivia starts again: TV returns to a FRESH stage (question, not the
  // old leaderboard) for the new game. The TV page left TV view to play
  // Math, so it re-enters through the old view's TV Dashboard button.
  await host.getByTestId("show-back-to-lobby").click();
  await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-trivia").click();
  await host.getByTestId("start-official-trivia").click();
  await tapReady([host, ...guests]);
  await hostStartNow(host); // the TV seat isn't ready; the host confirms
  await host.locator(".mz-question").waitFor({ timeout: 30000 });
  // TV is already on TV view from the previous check; only navigate if it
  // left (e.g. it went back to a phone view).
  if (!(await tvIsDashboard(tv)) && !(await tvIsStage(tv))) {
    await roomGo(tv, "tv"); // the dashboard's own button, or the lobby's room menu
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
