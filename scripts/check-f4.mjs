// F4 browser check: championship, TV Dashboard, and Memory Book in the
// browser, via Playwright.
//
// Usage:
//   npm run build:web
//   PORT=3457 npm run serve &        # in one shell; stop it and `rm -rf data` after
//   node scripts/check-f4.mjs [baseUrl]
//
// Defaults: base http://localhost:3457, Chromium only (multi-browser coverage
// lives in scripts/e2e-browser.mjs; this script proves F4 behaviours, not a
// second full game sweep). Fictional test players only; local server only.
//
// What it proves, through the real UI:
//   1. Championship view after a finished game: standings list all 4
//      players with points, and the per-game breakdown names the finished
//      game with per-player midrank points.
//   2. TV Dashboard view: join code, full roster, standings, and the
//      finished game in recent games.
//   3. Memory Book: an entry added from the last finished game, approved,
//      appears in the export; after Revoke, the same entry no longer
//      appears in a fresh export (it stays listed as pending — revoke
//      un-approves, it does not delete).
// A failed check is recorded and the process exits non-zero.

import { launchChromium } from "./lib/driver-env.mjs";
import { roomGo } from "./lib/room-nav.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3457";
const NAMES = ["Alex", "Sam", "Jo", "Kim"];
const HIGHLIGHT = "F4 test highlight: a close Math Mayhem finish";
const results = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  results.push({ label, ok });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Math Mayhem renders in the Mchezo kit since §11 (no game-panel):
// a finished page shows ShowResults ("Back to lobby"), never a panel
// with "Status: finished" — so the fast path below is the whole check.
async function pageFinished(page) {
  try { if (await page.getByTestId("show-results").isVisible({ timeout: 500 })) return true; } catch { /* not on results */ }
  try { if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 500 })) return true; } catch { /* not on results */ }
  return false;
}
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

const browser = await launchChromium({ headless: true });
try {
  const pages = [];
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  pages.push({ page: host, name: NAMES[0] });
  await host.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("e.g. Auntie June").fill(NAMES[0]);
  await host.getByRole("button", { name: "Host a game" }).click();
  const shareChip = host.getByRole("button", { name: /^Share room code / });
  await shareChip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
  }
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error(`unexpected room code: ${code}`);

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

  // --- Play Math Mayhem to finished on all four pages. ---
    await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-math-mayhem").click();
  await host.locator('[data-testid="start-official-math-mayhem"]').click();
  await passBriefing(pages.map((p) => p.page)); // D3: all four tap I'm ready
  // Kit panel since §11: the QuestionScreen's .mz-question is the gameplay signal.
  await host.locator(".mz-question").waitFor({ timeout: 20000 });
  let finishedEverywhere = false;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const dones = [];
    for (const { page } of pages) dones.push(await pageFinished(page));
    if (dones.every(Boolean)) {
      finishedEverywhere = true;
      break;
    }
    for (const { page } of pages) await answerQuiz(page);
    await sleep(700);
  }
  check("math-mayhem finished on all 4 pages", finishedEverywhere);

  // --- Championship view: standings + per-game breakdown. ---
  await roomGo(host, "cup");
  await host.getByText("Championship standings").waitFor({ timeout: 15000 });
  await sleep(1500); // allow the 2s poll to refresh standings after the finish
  // Stage 4 (S3-CUP-01): standings in their own section; games by title.
  const standingsText = await host.getByTestId("cup-standings").innerText();
  const standingsOk = NAMES.every((n) => standingsText.includes(n));
  check("championship standings list all 4 players", standingsOk);
  const breakdownOk = /Official games so far/.test(await host.getByTestId("cup-games").innerText()) && /Math Mayhem/.test(await host.getByTestId("cup-games").innerText());
  check("championship per-game breakdown names the finished game", breakdownOk);

  // --- TV Dashboard view: code, roster, standings, recent games. ---
  // Stage 5: the live show opens on the finished game's final standings;
  // its Lobby view has the code, the roster and tonight's games.
  await roomGo(host, "tv");
  await host.getByTestId("tv-show").waitFor({ timeout: 15000 });
  await host.getByTestId("tv-dir-lobby").click();
  await host.getByTestId("tv-lobby").waitFor({ timeout: 15000 });
  await sleep(1000);
  const tvText = await host.locator("body").textContent();
  check("TV shows join code", tvText.includes(code));
  check("TV shows full roster", NAMES.every((n) => tvText.includes(n)));
  const recent = await host.getByTestId("tv-recent").innerText();
  check("TV shows finished game in tonight so far",
    recent.includes("Math Mayhem") && recent.includes("finished"), recent.replace(/\n/g, " | "));

  // --- Memory Book: add, approve, export contains it. ---
  await roomGo(host, "memory");
  await host.getByText("Christmas Memory Book").waitFor({ timeout: 15000 });
  await host.getByPlaceholder(/Ada won Math Mayhem/).fill(HIGHLIGHT);
  await host.getByRole("button", { name: "Add from last finished game" }).click();
  await host.getByText(HIGHLIGHT).waitFor({ timeout: 15000 });
  check("Memory Book entry added from last finished game", true);
  // Scope to the entry card: getByRole name matching is substring-based, so
  // unscoped "Approve" also matches "Export approved" — and .first() in DOM
  // order is the Export button, not the entry's Approve button. That exact
  // pitfall made the first two F4 runs (and the E2E views check, which only
  // asserted the highlight text appears somewhere) never actually approve.
  const entryCard = host.locator('[data-testid="memory-entry"]', { hasText: HIGHLIGHT }).last();
  await entryCard.getByRole("button", { name: "Approve", exact: true }).click();
  // Wait for the entry card itself to flip to approved — NOT the static
  // "Only approved entries appear in the export" paragraph, which also
  // matches /approved/ and made the first run export before approval landed.
  await host.getByText(/Day 1 · approved/).waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Export approved" }).click();
  await host.locator("pre").waitFor({ timeout: 15000 });
  await sleep(500);
  // The export renders in a <pre>; the entry list also shows the same text,
  // so only the <pre> block proves what the export contains.
  let exportText = await host.locator("pre").textContent();
  check("export contains the approved entry", exportText.includes(HIGHLIGHT));

  // --- Revoke: fresh export must no longer contain the entry. ---
  await entryCard.getByRole("button", { name: "Revoke", exact: true }).click();
  await host.getByText(/Day 1 · pending/).waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Export approved" }).click();
  await sleep(1000);
  exportText = await host.locator("pre").textContent();
  check("revoked entry disappears from fresh export", !exportText.includes(HIGHLIGHT),
    exportText.includes(HIGHLIGHT) ? "highlight still in export after revoke" : "export no longer contains highlight");
  const bodyText = await host.locator("body").textContent();
  check("revoked entry stays listed as pending (not deleted)",
    bodyText.includes(HIGHLIGHT) && bodyText.includes("pending"));
} catch (e) {
  console.log(`FATAL: ${e.message}`);
  results.push({ label: "script completed without fatal error", ok: false });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0
  ? `F4 ALL PASSED (${results.length}/${results.length})`
  : `F4 FAILED: ${failed}/${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
