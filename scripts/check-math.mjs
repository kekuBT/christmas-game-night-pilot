// Math Mayhem kit extraction (§11 optional modernization): the new
// MchezoMath panel must preserve every rule — same intents, same
// speed-based scoring, same whole-game abstention, same host skip
// path, same reconnect — while rendering one question at a time in
// the kit, plus the elapsed-time display (speed is scored). Covers:
// authorization (guests see no start/setup controls), answering
// (one question at a time, locked view with elapsed time,
// next-question navigation), the exact end-to-end scores
// (all correct, answered slowly = 1000; all wrong = 0), whole-game
// abstention, reconnection (reload keeps the abstained state), the
// waiting ring, final results, mobile widths (no horizontal overflow
// at 320/360/390). Usage: build:web, serve on a port, then:
//   node scripts/check-math.mjs <baseUrl>
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

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
async function roomIdOf(page) {
  return await page.evaluate(() => sessionStorage.getItem("cgn_roomId"));
}
// Seeded start (seed 1, like check-leaderboard): the generated questions
// are deterministic, so the correct answers below are exact. A random
// seed would make the exact-score checks unknowable.
async function startMath(host, roomId) {
  const startedAt = Date.now();
  await host.evaluate(async ({ roomId }) => {
    const token = sessionStorage.getItem("cgn_token");
    const r = await fetch(`/rooms/${roomId}/games`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": token }, body: JSON.stringify({ gameId: "math-mayhem", official: true, seed: 1 }) });
    if (!r.ok) throw new Error(`seeded start failed: ${r.status}`);
  }, { roomId });
  return startedAt;
}
// Correct indices for seed 1 (verified against generateMathQuestions):
// 16÷2 → 0, 7×4 → 2, 20÷5 → 2, 88÷8 → 1, 15÷3 → 1, 34−25 → 1,
// 156÷12 → 2, 20% of 160 → 3, 90+22 → 0, 3×11 → 1.
// Scoring is 100 + a speed bonus from the game start (+20 ≤5s, +10
// ≤10s, else +0 — unit-tested in tests/room.test.ts). Every answer
// here lands more than 10s after the game starts, so the bonus is +0
// and all ten correct is exactly 1000; all wrong is exactly 0.
const CORRECT = [0, 2, 2, 1, 1, 1, 2, 3, 0, 1];
const WRONG = CORRECT.map((c) => (c + 1) % 4);
async function answerAll(page, picks) {
  for (let i = 0; i < picks.length; i++) {
    // Click the slab; retry if the click was lost to a poll re-render
    // (a known flake) or the click itself timed out (a transient).
    // The locked view appears only after the next 2s projection poll
    // lands the answer — except for the finishing answer: the game
    // advances to the results in the same mutation, so the locked
    // view never renders (the last finisher's confirmation is never
    // visible; see the Work Package B component inventory). Race the
    // two, and stop answering once the results appear.
    let landed = null;
    for (let attempt = 0; attempt < 3 && !landed; attempt++) {
      try {
        await page.locator(".mz-slab").nth(picks[i]).click();
      } catch {
        await sleep(500);
        continue;
      }
      landed = await Promise.race([
        page.locator('main[aria-label="Answer locked in"]').waitFor({ timeout: 10000 }).then(() => "locked"),
        page.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 10000 }).then(() => "finished"),
      ]).catch(() => null);
    }
    if (landed === "finished") return;
    if (!landed) {
      const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
      throw new Error(`no locked view after answering question ${i + 1}; page shows: ${JSON.stringify(text)}`);
    }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 2000 }).catch(() => false)) {
      await next.click();
      await sleep(300);
    } else {
      // Last question: clear the locked view. Either the waiting ring
      // appears ("All your answers are in") or, if this was the last
      // answer the game needed, the results appear ("Back to lobby").
      await page.getByRole("button", { name: "Waiting for the game to finish" }).click();
      await Promise.race([
        page.getByText("All your answers are in").waitFor({ timeout: 15000 }).then(() => "waiting"),
        page.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 }).then(() => "results"),
      ]);
    }
  }
}

const browser = await launchChromium();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const bea = await ctx.newPage();
  await joinRoom(bea, "Bea", code);

  // Authorization: guests see no setup card and no math start.
  check("guest sees no game setup (host-only)",
    (await bea.getByTestId("choose-game").count()) === 0);
  check("guest sees no math start control",
    (await bea.getByTestId("start-official-math-mayhem").count()) === 0);

  const roomId = await roomIdOf(host);
  const startedAt = await startMath(host, roomId);
  for (const [page, name] of [[host, "host"], [bea, "Bea"]]) {
    await page.locator(".mz-question").waitFor({ timeout: 15000 });
    check(`${name} sees the kit math panel`, true);
  }
  check("first question is 16 ÷ 2",
    (await host.locator(".mz-question").innerText()).includes("16 ÷ 2 = ?"));
  check("question counter reads 1 of 10",
    (await host.evaluate(() => document.body.innerText)).includes("Question 1 of 10"));
  check("four answer options", (await host.locator(".mz-slab").count()) === 4);
  check("no TV stage chip (Math has no TV stage)",
    (await host.getByTestId("mz-tv-stage").count()) === 0);
  await host.screenshot({ path: screenshotPath("docs/mchezo-screenshots/23-math-after.png") });

  // Mobile widths: the new question screen must not overflow.
  for (const w of [320, 360, 390]) {
    await host.setViewportSize({ width: w, height: 844 });
    await sleep(300);
    const overflow = await host.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`no horizontal overflow at ${w}px`, !overflow);
  }
  await host.setViewportSize({ width: 390, height: 844 });

  // Slow answers only: wait until 12s after the game started, so every
  // answer lands past the 10s speed-bonus bracket (bonus +0, exact 1000).
  await sleep(Math.max(0, 12000 - (Date.now() - startedAt)));

  // The locked view after answering, with the elapsed-time display,
  // then the next question.
  await host.locator(".mz-slab").nth(CORRECT[0]).click();
  await host.locator('main[aria-label="Answer locked in"]').waitFor({ timeout: 15000 });
  const lockText = await host.evaluate(() => document.body.innerText);
  check("locked view shows the chosen answer (8)",
    lockText.includes("8"));
  const elapsedEl = host.getByTestId("mz-math-elapsed");
  await elapsedEl.waitFor({ timeout: 5000 });
  const elapsedText = await elapsedEl.innerText();
  const elapsedSecs = Number((elapsedText.match(/Answered in (\d+)s/) ?? [])[1]);
  check("locked view shows the elapsed time (>= 10s, past the bonus)",
    /Answered in \d+s/.test(elapsedText) && elapsedSecs >= 10, elapsedText);
  await host.getByRole("button", { name: "Next question" }).click();
  await sleep(500);
  check("next question is 7 × 4",
    (await host.locator(".mz-question").innerText()).includes("7 × 4 = ?"));

  // Bea answers everything wrong; the host answers the remaining nine
  // correctly. Exact scores: host 1000, Bea 0. (The host already
  // answered Q1 correctly above.)
  await answerAll(bea, WRONG);
  await bea.locator(".mz-wait").waitFor({ timeout: 15000 });
  check("Bea sees the waiting ring after all 10 answers", true);
  // The waiting ring's label is a kicker, and kickers render in
  // uppercase via CSS — innerText returns the rendered case, so
  // compare case-insensitively.
  check("Bea's done state says all answers are in",
    (await bea.evaluate(() => document.body.innerText)).toLowerCase().includes("all your answers are in"));
  await answerAll(host, CORRECT.slice(1));
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 });
  check("game finishes and shows results", true);
  const hostText = await host.evaluate(() => document.body.innerText);
  check("host scores 1000 (all ten correct, no speed bonus)", hostText.includes("Ada: 1000 points"));
  check("Bea scores 0 (all ten wrong)", hostText.includes("Bea: 0 points"));
  check("host wins the game", hostText.includes("Ada wins this game!"));

  // Room 2: whole-game abstention + reconnect. The guest sits out,
  // reloads, and is still sat out; the host's ten answers finish
  // the game without her.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host2 = await ctx2.newPage();
  const code2 = await createRoom(host2, "Ada");
  const bea2 = await ctx2.newPage();
  await joinRoom(bea2, "Bea", code2);
  const roomId2 = await roomIdOf(host2);
  const startedAt2 = await startMath(host2, roomId2);
  await bea2.locator(".mz-question").waitFor({ timeout: 15000 });
  await bea2.getByRole("button", { name: "Sit this game out" }).click();
  await bea2.locator(".mz-wait").waitFor({ timeout: 15000 });
  check("abstention shows the sat-out waiting ring",
    (await bea2.evaluate(() => document.body.innerText)).toLowerCase().includes("you sat this one out"));
  check("no skip button before the deadline (host only, stalled only)",
    (await host2.getByRole("button", { name: /skip/i }).count()) === 0);
  await bea2.reload({ waitUntil: "domcontentloaded" });
  await bea2.locator(".mz-wait").waitFor({ timeout: 15000 });
  check("reloaded player is still sat out (abstention survived)",
    (await bea2.evaluate(() => document.body.innerText)).toLowerCase().includes("you sat this one out"));
  await sleep(Math.max(0, 12000 - (Date.now() - startedAt2)));
  await answerAll(host2, CORRECT);
  await host2.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 });
  check("game finishes without the abstained player", true);
  await bea2.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 });
  check("abstained player scores 0",
    (await bea2.evaluate(() => document.body.innerText)).includes("Bea: 0 points"));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "MATH ALL PASSED" : `MATH FAILED: ${failures} item(s)`);
process.exit(failures === 0 ? 0 : 1);
