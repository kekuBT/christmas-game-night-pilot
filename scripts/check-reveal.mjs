// Staged Trivia reveal (Milestone D): phone sequence walks question ->
// reveal per question, then a standings finale, with auto-play; TV
// auto-director walks question -> reveal per question, then leaderboard.
// Live reveals are out by design (see docs/TRIVIA_REVEAL_GAP.md), so this
// driver covers post-completion behaviour only.
// Usage: build:web, serve on a port, then:
//   node scripts/check-reveal.mjs <baseUrl>
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
// Answer every question with the same option index (0-3).
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
async function revealStep(page) {
  const el = page.locator('[data-testid="mz-reveal-step"]');
  await el.waitFor({ timeout: 15000 });
  return {
    kind: await el.getAttribute("data-step-kind"),
    index: parseInt((await el.getAttribute("data-step-index")) ?? "-1", 10),
  };
}
async function waitForTab(page, name, timeoutMs = 15000) {
  const tab = page.getByRole("tab", { name });
  for (let i = 0; i < timeoutMs / 500; i++) {
    if ((await tab.getAttribute("aria-selected").catch(() => null)) === "true") return true;
    await sleep(500);
  }
  return false;
}
async function waitForQuestionChange(page, oldText, timeoutMs = 20000) {
  for (let i = 0; i < timeoutMs / 500; i++) {
    const t = await page.locator(".mz-tv-question").first().textContent().catch(() => null);
    if (t && t !== oldText) return t;
    await sleep(500);
  }
  return null;
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const bea = await ctx.newPage();
  await joinRoom(bea, "Bea", code);
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tv = await tvCtx.newPage();
  await joinRoom(tv, "TV", code);

  // Play one Trivia game: Ada option 0, Bea option 1, TV abstains.
  await host.getByTestId("start-official-trivia").click();
  await host.locator(".mz-question").waitFor({ timeout: 30000 });
  await tv.locator(".mz-question").waitFor({ timeout: 30000 });
  await tv.getByRole("button", { name: "Sit this game out" }).click();
  await answerOption(host, 0);
  await answerOption(bea, 1);
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });

  // ---- Phone sequence -------------------------------------------------
  let s = await revealStep(host);
  check("reveal opens on the first question phase", s.kind === "question" && s.index === 0, `${s.kind}:${s.index}`);
  const answerOnQuestion = await host.getByTestId("mz-reveal-answer").count();
  check("question phase hides the correct answer", answerOnQuestion === 0, `count=${answerOnQuestion}`);
  await host.getByTestId("mz-reveal-next").click();
  s = await revealStep(host);
  check("Reveal answer steps into the first reveal", s.kind === "reveal" && s.index === 1, `${s.kind}:${s.index}`);
  const answerOnReveal = await host.getByTestId("mz-reveal-answer").count();
  check("reveal phase shows the correct answer", answerOnReveal === 1, `count=${answerOnReveal}`);
  const revealText = await host.locator("body").textContent();
  check("reveal phase separates this question from the game total",
    (revealText?.includes("This question:") ?? false) && (revealText?.includes("Your game total:") ?? false));
  await host.getByTestId("mz-reveal-next").click();
  s = await revealStep(host);
  check("Next question steps into the second question phase", s.kind === "question" && s.index === 2, `${s.kind}:${s.index}`);
  const answerOnQ2 = await host.getByTestId("mz-reveal-answer").count();
  check("second question phase hides the correct answer again", answerOnQ2 === 0, `count=${answerOnQ2}`);
  await host.getByTestId("mz-reveal-q9").click();
  s = await revealStep(host);
  check("Q10 jump lands on the last question phase", s.kind === "question" && s.index === 18, `${s.kind}:${s.index}`);
  await host.getByTestId("mz-reveal-next").click();
  s = await revealStep(host);
  check("last reveal reached", s.kind === "reveal" && s.index === 19, `${s.kind}:${s.index}`);
  await host.getByTestId("mz-reveal-next").click();
  s = await revealStep(host);
  check("See standings lands on the finale (step 20 of 21)", s.kind === "standings" && s.index === 20, `${s.kind}:${s.index}`);
  check("finale shows the standings list", (await host.locator(".mz-standings").count()) === 1);

  // ---- Phone auto-play --------------------------------------------------
  await host.getByTestId("mz-reveal-q0").click();
  s = await revealStep(host);
  check("auto-play starts back at the first question", s.kind === "question" && s.index === 0, `${s.kind}:${s.index}`);
  await host.getByTestId("mz-reveal-play").click();
  await sleep(8000);
  s = await revealStep(host);
  check("auto-play advances a step within 8s", s.index >= 1, `${s.kind}:${s.index}`);
  await host.getByTestId("mz-reveal-play").click();
  const paused = await revealStep(host);
  await sleep(8000);
  s = await revealStep(host);
  check("pausing stops auto-play", s.index === paused.index && s.kind === paused.kind, `was ${paused.kind}:${paused.index}, now ${s.kind}:${s.index}`);

  // ---- TV auto-director walk --------------------------------------------
  await tv.getByRole("button", { name: "Back to lobby" }).click();
  await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
  await tv.getByRole("button", { name: "TV stage" }).click();
  await tv.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
  const q1 = (await tv.locator(".mz-tv-question").first().textContent().catch(() => null)) ?? "";
  check("TV walk opens on a question", q1.length > 0, q1.slice(0, 40));
  check("TV walk advances to the reveal stage", await waitForTab(tv, "Reveal"));
  const q2 = await waitForQuestionChange(tv, q1);
  check("TV walk advances to the second question", q2 !== null, (q2 ?? "").slice(0, 40));
  await tv.getByRole("tab", { name: "Leaderboard" }).click();
  await tv.locator(".mz-tv-row").first().waitFor({ timeout: 15000 });
  check("TV manual jump reaches the leaderboard", (await tv.locator(".mz-tv-row").count()) > 0);
} catch (e) {
  console.log(`FAIL reveal driver crashed — ${String(e).slice(0, 300)}`);
  failures++;
} finally {
  await browser.close();
}
console.log(failures === 0 ? "REVEAL ALL PASSED" : `REVEAL FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
