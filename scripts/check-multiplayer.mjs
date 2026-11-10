// F3 browser check: multiplayer, reconnect, and TV projections, via Playwright.
//
// Usage:
//   npm run build:web
//   PORT=3457 npm run serve &        # in one shell; stop it and `rm -rf data` after
//   node scripts/check-multiplayer.mjs [baseUrl]
//
// Defaults: base http://localhost:3457, Chromium only (multi-browser coverage
// lives in scripts/e2e-browser.mjs; this script proves F3 behaviours, not a
// second full game sweep). Fictional test players only; local server only.
//
// What it proves, through the real UI plus the public TV projection endpoint:
//   1. Simultaneous play: host + 3 joiners all see the same game panel at
//      the same time, and every player's own answers drive the same game.
//   2. Reload reconnect: a player who reloads mid-game (sessionStorage
//      recovery token) returns to the same slot — same name, same game,
//      roster still exactly 4 players, no duplicate slot.
//   3. TV leak check: while a game is playing (never finished), the TV
//      projection contains no answer keys, secret words, recovery tokens,
//      or per-player private state — for Math Mayhem and for Impostor.
//   4. Completion: the game all four played finishes on every page.
// A failed check is recorded and the process exits non-zero.

import { launchChromium } from "./lib/driver-env.mjs";
import { roomGo } from "./lib/room-nav.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3457";
const NAMES = ["Alex", "Sam", "Jo", "Kim"];
// Answer keys are forbidden only for games still PLAYING: a finished game
// legitimately reveals correctAnswer in its questions (by design). Secrets
// that must never appear anywhere in a TV projection:
const FORBIDDEN_TV_GLOBAL_KEYS = ["recoveryToken", "secretWord", "impostorWord", "myAnswers", "myScore"];
const FORBIDDEN_PLAYING_KEYS = ["correctAnswer", "correctIndex", "answerKey", "correctYear"];
const results = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  results.push({ label, ok });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Kit answer loop (same as e2e's actTrivia): slabs + Next question,
// then the "Waiting for the game to finish" keycap clears the last
// lock into the counts-only waiting ring. Answers every question.
async function answerQuiz(page) {
  for (let i = 0; i < 60; i++) {
    if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 }).catch(() => false)) return;
    const doneBtn = page.getByRole("button", { name: "Waiting for the game to finish" });
    if (await doneBtn.isVisible({ timeout: 500 }).catch(() => false)) { await doneBtn.click(); await sleep(400); return; }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 500 }).catch(() => false)) { await next.click(); await sleep(400); continue; }
    const slabs = page.locator(".mz-slab:not([disabled])");
    if ((await slabs.count()) > 0) { await slabs.first().click(); await sleep(500); continue; }
    await sleep(500);
  }
}
async function tvLeakCheck(label, roomId) {
  const proj = await (await fetch(`${BASE}/rooms/${roomId}/projection?audience=tv`)).json();
  const raw = JSON.stringify(proj);
  const leakedGlobal = FORBIDDEN_TV_GLOBAL_KEYS.filter((k) => raw.includes(`"${k}"`));
  const playingRaw = JSON.stringify((proj.games ?? []).filter((g) => g.status === "playing"));
  const leakedPlaying = FORBIDDEN_PLAYING_KEYS.filter((k) => playingRaw.includes(`"${k}"`));
  const leaked = [...leakedGlobal, ...leakedPlaying.map((k) => `${k} (playing game)`)];
  check(`TV projection leak-free during ${label}`, leaked.length === 0,
    leaked.length ? `leaked keys: ${leaked.join(", ")}` : "no forbidden keys");
  const players = proj.players ?? [];
  check(`TV projection roster is exactly 4 during ${label}`, players.length === 4,
    `players=${players.length}`);
}

const browser = await launchChromium({ headless: true });
try {
  const pages = [];
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  pages.push({ page: host, name: NAMES[0] });
  await host.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("e.g. Auntie June").fill(NAMES[0]);
  await host.getByTestId("host-kind-cup").click(); await host.getByRole("button", { name: "Host a game" }).click();
  const shareChip = host.getByRole("button", { name: /^Share room code / });
  await shareChip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
  }
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`unexpected room code: ${code}`);
  const roomId = await host.evaluate(() => sessionStorage.getItem("cgn_roomId"));
  if (!roomId) throw new Error("host sessionStorage has no cgn_roomId");
  console.log(`room code ${code}, roomId ${roomId}`);

  for (let i = 1; i < NAMES.length; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    pages.push({ page: p, name: NAMES[i] });
    await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await p.getByPlaceholder("e.g. Auntie June").fill(NAMES[i]);
    await p.locator(".mz-code__input").fill(code);
    await p.getByRole("button", { name: "Join the game" }).click();
    await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  }
  await host.getByRole("heading", { name: `You’re in, ${NAMES[0]}.` }).waitFor({ timeout: 15000 });
  for (const n of NAMES.slice(1)) await host.locator(".mz-circle__seats").getByText(n, { exact: true }).waitFor({ timeout: 15000 });
  check("lobby roster: 4 players joined", true);

  // --- Simultaneous play: Math Mayhem on all four pages at once. ---
    await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-math-mayhem").click();
  await host.locator('[data-testid="start-official-math-mayhem"]').click();
  await passBriefing(pages.map((p) => p.page)); // D3: all four tap I'm ready
  let allSeeGame = true;
  for (const { page, name } of pages) {
    try {
      // Kit panel since §11: the QuestionScreen's .mz-question is the
      // gameplay signal (the 8s intro auto-advances first).
      await page.locator(".mz-question").waitFor({ timeout: 20000 });
    } catch { allSeeGame = false; console.log(`  ${name} did not show the game panel`); }
  }
  check("all 4 pages show the same game panel simultaneously", allSeeGame);

  // TV leak check while Math Mayhem is playing (before anyone finishes it).
  await tvLeakCheck("math-mayhem (playing)", roomId);

  // --- Reload reconnect: Sam reloads mid-game and must come back as Sam. ---
  const sam = pages[1].page;
  await sam.reload({ waitUntil: "domcontentloaded" });
  let reloadOk = true;
  try {
    await sam.locator(".mz-question").waitFor({ timeout: 20000 });
  } catch { reloadOk = false; }
  check("reloaded player returns to same slot and same game", reloadOk);
  const projAfterReload = await (await fetch(`${BASE}/rooms/${roomId}/projection?audience=tv`)).json();
  const samCount = (projAfterReload.players ?? []).filter((p) => p.displayName === "Sam").length;
  check("reload creates no duplicate player slot", samCount === 1, `Sam entries=${samCount}`);
  check("roster still exactly 4 after reload", (projAfterReload.players ?? []).length === 4,
    `players=${(projAfterReload.players ?? []).length}`);

  // --- Every player answers; the game must finish on every page. ---
  // A finished page shows ShowResults instead of the panel, so accept
  // either as finished.
  const pageFinished = async (page) => {
    try { if (await page.getByTestId("show-results").isVisible({ timeout: 500 })) return true; } catch { /* not on results */ }
    try { if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 })) return true; } catch { /* not on results */ }
    return false;
  };
  for (const { page } of pages) await answerQuiz(page);
  let finishedEverywhere = false;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const dones = [];
    for (const { page } of pages) dones.push(await pageFinished(page));
    if (dones.every(Boolean)) {
      finishedEverywhere = true;
      break;
    }
    // Keep answering in case a page still has open questions.
    for (const { page } of pages) await answerQuiz(page);
    await sleep(700);
  }
  check("math-mayhem finished on all 4 pages after simultaneous play", finishedEverywhere);

  // --- Return to the lobby from the results screen, then start Impostor. ---
  try { await host.getByTestId("show-back-to-lobby").click({ timeout: 5000 }); } catch { /* already in lobby */ }
  // --- TV leak check for a secret-role game: start Impostor, do not finish it. ---
  // Retry the start click once: a click landing during a 2s poll re-render
  // was once lost (heading never arrived) even though the button exists.
  let impostorStarted = false;
  for (let attempt = 0; attempt < 2 && !impostorStarted; attempt++) {
        await host.getByTestId("choose-game").click();
    await host.getByTestId("select-game-impostor").click();
    await host.locator('[data-testid="start-practice-impostor"]').click();
    try {
      await passBriefing(pages.map((p) => p.page)); // D3: all four tap I'm ready
      await host.getByRole("heading", { name: "Now playing: Impostor" }).waitFor({ timeout: 20000 });
      impostorStarted = true;
    } catch { /* retry once, then let the leak check's own failure surface */ }
  }
  check("impostor started after a finished game", impostorStarted);
  await tvLeakCheck("impostor (playing)", roomId);
  // TV Dashboard view itself renders in the browser while a secret game plays.
  await roomGo(host, "tv");
  await host.getByTestId("tv-show").waitFor({ timeout: 15000 }); // Stage 5: the live show
  check("TV view renders during a secret-role game", (await host.getByTestId("tv-mode").getAttribute("data-mode")) === "live");
} catch (e) {
  console.log(`FATAL: ${e.message}`);
  results.push({ label: "script completed without fatal error", ok: false });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0
  ? `MULTIPLAYER ALL PASSED (${results.length}/${results.length})`
  : `MULTIPLAYER FAILED: ${failed}/${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
