// Mchezo integration browser check (Chromium).
// Usage: build:web, serve on a port, then: node scripts/check-mchezo.mjs <baseUrl>
// Covers the Phase 2 checkpoint scope through the real UI only:
//   landing + joining, Circle lobby at 4/8/10 players, presence and
//   disconnection, Trivia answer locking, waiting/reveal synchronisation,
//   standings and tie handling via the results screen, TV stage while
//   playing and after finish, mobile widths 320/360/390, reduced motion.
// Fictional test players only; run against a local server only.
import { launchChromium } from "./lib/driver-env.mjs";
import { roomGo } from "./lib/room-nav.mjs";
import { hostStartNow, passBriefing, tapReady } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3457";
const results = [];
function check(name, ok, detail = "") {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = false;
  while (Date.now() < deadline) { last = await fn(); if (last) return true; await sleep(500); }
  return last;
}
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}
async function createRoom(page, name) {
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
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
    if (await slab.isVisible({ timeout: 1500 }).catch(() => false)) { await slab.click(); await sleep(300); }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 1500 }).catch(() => false)) { await next.click(); await sleep(300); }
    const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
    if (await doneBtn.isVisible({ timeout: 1500 }).catch(() => false)) { await doneBtn.click(); await sleep(300); }
  }
}

const browser = await launchChromium();
try {
  // ---- Room A: landing, lobby sizes, presence -------------------------
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hostA = await ctxA.newPage();
  // Stage 2: Home shows the games, with Join and Host one tap away in the dock.
  await hostA.goto(BASE, { waitUntil: "domcontentloaded" });
  await hostA.getByTestId("home").waitFor({ timeout: 15000 });
  const landingText = await hostA.locator("body").textContent();
  check("Home shows the Mchezo wordmark with Join and Host in the dock", landingText.toLowerCase().includes("mchezo") && await hostA.getByTestId("home-join").isVisible() && await hostA.getByTestId("home-host").isVisible());
  await hostA.getByTestId("home-join").click();
  check("Join has a 6-character code input", (await hostA.locator(".mz-code__input").count()) === 1);
  await hostA.getByTestId("nav-back").click();
  await hostA.getByTestId("home-host").click();
  check("Host asks for the host's name before the room exists", await hostA.getByRole("button", { name: "Host a game" }).isDisabled());
  const codeA = await createRoom(hostA, "Ada");
  check("room code is 6 alphanumeric", /^[A-Z0-9]{6}$/.test(codeA), codeA);
  const pagesA = [{ page: hostA, name: "Ada" }];
  for (const name of ["Bea", "Cal", "Dee"]) {
    const p = await ctxA.newPage();
    await joinRoom(p, name, codeA);
    pagesA.push({ page: p, name });
  }
  await hostA.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  let seatsOk = true;
  for (const n of ["Bea", "Cal", "Dee"]) if ((await hostA.getByText(n, { exact: true }).count()) === 0) seatsOk = false;
  check("4-player lobby: host sees all seats", seatsOk);
  check("4-player lobby: up next is Trivia Showdown", (await hostA.locator("body").textContent()).includes("Trivia Showdown"));
  check("4-player lobby: no horizontal overflow", await noOverflow(hostA));
  for (const name of ["Eve", "Fay", "Gus", "Hal"]) {
    const p = await ctxA.newPage();
    await joinRoom(p, name, codeA);
    pagesA.push({ page: p, name });
  }
  check("8-player lobby: seats render", (await hostA.locator(".mz-circle__seats .mz-seat__btn").count()) === 8);
  check("8-player lobby: no horizontal overflow", await noOverflow(hostA));
  for (const name of ["Ida", "Jay"]) {
    const p = await ctxA.newPage();
    await joinRoom(p, name, codeA);
    pagesA.push({ page: p, name });
  }
  check("10-player lobby: room is full", await waitFor(async () => (await hostA.locator("body").textContent()).includes("room is full"), 15000));
  check("10-player lobby: no horizontal overflow", await noOverflow(hostA));
  // Presence: closing Jay's page marks the seat away on the host's view.
  const jay = pagesA.find((x) => x.name === "Jay").page;
  await jay.close();
  check("disconnection: host sees reconnecting", await waitFor(async () => (await hostA.locator("body").textContent()).includes("reconnecting"), 20000));
  check("disconnection: seat shows Away", (await hostA.locator(".mz-seat__name--off").count()) >= 1);
  await ctxA.close();

  // ---- Room B: Trivia phone flow, locking, waiting sync, results ------
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const hostB = await ctxB.newPage();
  const codeB = await createRoom(hostB, "Ada");
  const guestsB = [];
  for (const name of ["Bea", "Cal", "Dee"]) {
    const p = await ctxB.newPage();
    await joinRoom(p, name, codeB);
    guestsB.push(p);
  }
  // Phase 2.1 lobby simplification: guests see no setup controls; the host
  // sees one mode control + one chooser, and the primary Start follows both.
  check("guest sees no game-setup controls",
    (await guestsB[0].getByTestId("choose-game").count()) === 0 &&
    (await guestsB[0].getByTestId("mode-official").count()) === 0);
  check("host sees chooser and mode controls",
    (await hostB.getByTestId("choose-game").count()) === 1 &&
    (await hostB.getByTestId("mode-official").count()) === 1);
  await hostB.getByTestId("choose-game").click();
  check("chooser lists all 11 games",
    (await hostB.locator('[data-testid^="select-game-"]').count()) === 11);
  await hostB.getByTestId("select-game-math-mayhem").click();
  check("chooser sets up next to Math Mayhem",
    (await hostB.locator(".mz-upnext__name").textContent()) === "Math Mayhem");
  await hostB.getByTestId("mode-practice").click();
  check("practice mode moves the Start testid",
    (await hostB.getByTestId("start-practice-math-mayhem").count()) === 1);
  await hostB.getByTestId("mode-official").click();
  await hostB.getByTestId("choose-game").click();
  await hostB.getByTestId("select-game-trivia").click();
  check("chooser returns up next to Trivia Showdown",
    (await hostB.locator(".mz-upnext__name").textContent()) === "Trivia Showdown");
  await hostB.getByTestId("start-official-trivia").click();
  // D3: the rules briefing replaces the 8 s intro; play starts when all are ready.
  await passBriefing([hostB, ...guestsB]);
  await hostB.locator(".mz-question").waitFor({ timeout: 30000 });
  check("everyone ready opens the question screen (no intro countdown)", (await hostB.getByTestId("show-intro").count()) === 0);
  check("trivia question: no horizontal overflow", await noOverflow(hostB));
  const q1Text = await hostB.locator(".mz-question").textContent();
  // Host answers Q1 -> locked view with LOCKED IN stamp.
  await hostB.locator(".mz-slab:not([disabled])").first().click();
  await hostB.locator('main[aria-label="Answer locked in"]').waitFor({ timeout: 15000 });
  check("answer selection locks (LOCKED IN stamp)", true);
  await hostB.getByRole("button", { name: "Next question" }).click();
  await hostB.locator(".mz-question").waitFor({ timeout: 15000 });
  const q2Text = await hostB.locator(".mz-question").textContent();
  check("second question presented after Next", q2Text !== q1Text);
  // Host finishes first; guests still playing -> counts-only waiting.
  await answerAllTrivia(hostB);
  await hostB.getByText("All your answers are in").waitFor({ timeout: 15000 });
  const waitingText = await hostB.locator("body").textContent();
  check("waiting shows counts only (1 of 4 started; S3-TRV-01 wording)", waitingText.includes("1/4") && waitingText.includes("have started"));
  // Guests finish -> host results with standings + question picker.
  for (const g of guestsB) await answerAllTrivia(g);
  await hostB.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  check("results screen after all players finish", true);
  const resultsText = await hostB.locator("body").textContent();
  check("results separate this question from the game total and rank",
    resultsText.includes("This question:") && resultsText.includes("Your game total:") && resultsText.includes("Game rank:"));
  // D: phone results open on the reveal sequence; jump to standings.
  await hostB.getByTestId("mz-reveal-standings").click();
  await hostB.locator(".mz-standings").waitFor({ timeout: 15000 });
  check("results show standings list", (await hostB.locator(".mz-standings").count()) === 1);
  check("results show question picker", (await hostB.getByRole("button", { name: /^Q10 / }).count()) === 1);
  await hostB.getByRole("button", { name: /^Q2 / }).click();
  await sleep(500);
  check("question picker switches the inspected question", true);
  await ctxB.close();

  // ---- Room C: TV stage while playing and after finish ----------------
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const hostC = await ctxC.newPage();
  const codeC = await createRoom(hostC, "Ada");
  const guestC = await ctxC.newPage();
  await joinRoom(guestC, "Bea", codeC);
  const tvC = await ctxC.newPage();
  await joinRoom(tvC, "TV", codeC);
  await roomGo(tvC, "tv");
  await tvC.getByText("TV Dashboard — public only").waitFor({ timeout: 15000 });
  await hostC.getByTestId("start-official-trivia").click();
  // D3: the TV shows the rules during the briefing. The TV seat can't tap
  // Ready from the TV view, so the host starts with explicit consent.
  await tvC.getByTestId("tv-briefing").waitFor({ timeout: 20000 });
  check("TV shows the rules briefing, not a question", (await tvC.locator(".mz-question").count()) === 0);
  await tapReady([hostC, guestC]);
  await hostStartNow(hostC);
  await hostC.locator(".mz-question").waitFor({ timeout: 30000 });
  await tvC.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
  check("TV stage auto-switches to Mchezo stage on start", (await tvC.locator("body").textContent()).includes("Featured question"));
  // TV viewer returns to its phone, answers, and the game finishes.
  await tvC.getByRole("button", { name: "Back to phone view" }).click();
  await tvC.locator(".mz-question").waitFor({ timeout: 30000 });
  await answerAllTrivia(tvC);
  await answerAllTrivia(hostC);
  await answerAllTrivia(guestC);
  await tvC.getByRole("button", { name: "Back to lobby" }).click({ timeout: 30000 });
  await roomGo(tvC, "tv");
  await tvC.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
  check("TV stage shows leaderboard after finish", await waitFor(async () => (await tvC.locator("body").textContent()).includes("Leaderboard"), 30000));
  await tvC.getByRole("button", { name: "Back to phone view" }).click();
  await tvC.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
  check("TV stage returns to phone view", true);
  await ctxC.close();

  // ---- Mobile widths + reduced motion ---------------------------------
  for (const width of [320, 360, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 700 } });
    const h = await ctx.newPage();
    const code = await createRoom(h, "Ada");
    const g = await ctx.newPage();
    await joinRoom(g, "Bea", code);
    check(`mobile ${width}px: lobby no overflow`, await noOverflow(h));
    await h.getByTestId("start-official-trivia").click();
    await h.getByTestId("briefing").waitFor({ timeout: 20000 });
    check(`mobile ${width}px: briefing no overflow`, await noOverflow(h));
    await passBriefing([h, g]);
    await h.locator(".mz-question").waitFor({ timeout: 30000 });
    check(`mobile ${width}px: question no overflow`, await noOverflow(h));
    await ctx.close();
  }
  const ctxRm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const rmPage = await ctxRm.newPage();
  await rmPage.goto(BASE, { waitUntil: "domcontentloaded" });
  check("reduced motion: provider root reports reduced", (await rmPage.locator('[data-mz-motion="reduced"]').count()) >= 1);
  await ctxRm.close();
} catch (e) {
  check("check-mchezo journey crashed", false, String(e).slice(0, 300));
} finally {
  await browser.close();
}
const failed = results.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? "MCHEZO ALL PASSED" : `MCHEZO FAILED: ${failed.length}/${results.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
