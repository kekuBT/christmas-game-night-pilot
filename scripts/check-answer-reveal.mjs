// E3 (Content Quality 2.0): correct answers and explanations are shown
// only once answers are locked. On emulated phones plus a spectator TV:
//   Geography (independent): a player who has finished sees no answers
//     while another player is still answering, and neither does the TV;
//     after the game finishes, every phone and the TV list each question's
//     answer (checked against the content packs) and its explanation.
//   Closest Wins (lock-step): no answer while a question is open; once it
//     closes, phones show "Last question" with the answer and the player's
//     own guess, and the TV shows the last answer.
// Usage: build:web, serve on a port, then:
//   node scripts/check-answer-reveal.mjs <baseUrl>
import { itemFor, optionIndex } from "./lib/content-oracle.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();

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
async function spectate(page, code) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
}
async function start(host, gameId) {
  await host.getByTestId("choose-game").click();
  await host.getByTestId(`select-game-${gameId}`).click();
  await host.getByTestId(`start-official-${gameId}`).click();
  try { await host.getByTestId("show-start-playing").click({ timeout: 3000 }); } catch { await sleep(8500); }
}
const geoChoose = async (_n, page) => {
  const prompt = await page.locator(".mz-question").innerText();
  const options = await page.locator(".mz-slab").allInnerTexts();
  return optionIndex("geography", prompt, options.map((o) => o.split("\n").filter(Boolean).pop() ?? o));
};
const noReveal = async (page) => (await page.getByTestId("mz-answer-review").count()) === 0 && (await page.getByTestId("tv-answer-review").count()) === 0 && (await page.getByTestId("mz-review-why").count()) === 0;

const browser = await launchChromium();
try {
  const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  // ---------------- Geography ----------------
  const pA = await browser.newContext(phone);
  const pB = await browser.newContext(phone);
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ada = await pA.newPage();
  const code = await createRoom(ada, "Ada");
  const bea = await pB.newPage();
  await joinRoom(bea, "Bea", code);
  const tv = await tvCtx.newPage();
  await spectate(tv, code);
  await start(ada, "geography");
  await ada.locator(".mz-question").waitFor({ timeout: 15000 });
  await bea.locator(".mz-question").waitFor({ timeout: 15000 });
  // Bea answers ONE question and keeps her next ones open.
  await answerKitQuestions(bea, { player: "Bea", choose: geoChoose, limit: 1 });
  // Ada answers everything: she is done, Bea is not.
  await answerKitQuestions(ada, { player: "Ada", choose: geoChoose });
  await sleep(2500);
  check("Geography: finished player sees no answers while Bea still plays", await noReveal(ada));
  check("Geography: TV shows no answers while Bea still plays", await noReveal(tv));
  check("Geography: Bea (mid-game) sees no answers", await noReveal(bea));
  await answerKitQuestions(bea, { player: "Bea", choose: async (n, page) => ((await geoChoose(n, page)) + 1) % 4 });
  await bea.getByTestId("mz-answer-review").waitFor({ timeout: 20000 });
  const rows = bea.getByTestId("mz-review-item");
  const n = await rows.count();
  check("Geography: results list every question", n === 8, `${n}`);
  let matched = 0, explained = 0;
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    const it = itemFor("geography", await r.locator(".mz-review__prompt").innerText());
    if (norm(await r.getByTestId("mz-review-answer").innerText()) === norm(it.answer)) matched++;
    const why = r.getByTestId("mz-review-why");
    if ((await why.count()) && norm(await why.innerText()) === norm(it.explanation)) explained++;
  }
  check("Geography: each answer matches the content pack", matched === n, `${matched}/${n}`);
  check("Geography: each explanation is shown", explained === n, `${explained}/${n}`);
  check("Geography: Bea sees her own choices marked", (await bea.getByTestId("mz-review-mine").count()) === n);
  const overflow = await bea.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check("Geography: answer list fits a 390px phone (no horizontal scroll)", !overflow);
  await bea.screenshot({ path: screenshotPath("docs/content-quality-2/screenshots/e3-geography-results-phone.png"), fullPage: true });
  await tv.getByTestId("tv-answer-review").waitFor({ timeout: 15000 });
  check("Geography: TV lists the answers after the game", (await tv.getByTestId("tv-answer-review").getByTestId("mz-review-item").count()) === n);
  check("Geography: TV shows no player's choices", (await tv.getByTestId("mz-review-mine").count()) === 0);
  await tv.screenshot({ path: screenshotPath("docs/content-quality-2/screenshots/e3-geography-tv.png"), fullPage: true });
  for (const p of [ada, bea]) await p.getByTestId("show-back-to-lobby").click().catch(() => {});

  // ---------------- Closest Wins ----------------
  await sleep(1000);
  await start(ada, "closest-wins");
  await ada.getByTestId("mz-num-input").waitFor({ timeout: 15000 });
  await bea.getByTestId("mz-num-input").waitFor({ timeout: 15000 });
  const q1 = (await ada.locator(".mz-card p b").first().innerText()).trim();
  const item1 = itemFor("closest-wins", q1);
  await ada.getByTestId("mz-num-input").fill("12.5");
  await ada.getByTestId("mz-num-submit").tap();
  await ada.getByText("Your guess: 12.5").waitFor({ timeout: 15000 });
  await sleep(2500);
  check("Closest: no answer anywhere while question 1 is open", await noReveal(ada) && await noReveal(bea) && await noReveal(tv) && (await ada.getByTestId("mz-closest-last").count()) === 0);
  await bea.getByTestId("mz-num-input").fill("3");
  await bea.getByTestId("mz-num-submit").tap();
  await ada.getByTestId("mz-closest-last").waitFor({ timeout: 15000 });
  const last = ada.getByTestId("mz-closest-last");
  const shownAnswer = (await last.getByTestId("mz-review-answer").innerText()).replace(/[^0-9.]/g, "");
  check("Closest: after question 1 closes, phones show its answer (matches the pack)", Number(shownAnswer) === item1.answer, `${shownAnswer} vs ${item1.answer}`);
  check("Closest: and the player's own guess", (await last.getByTestId("mz-review-mine").innerText()).includes("12.5"));
  check("Closest: Bea sees her own guess, not Ada's", (await bea.getByTestId("mz-closest-last").getByTestId("mz-review-mine").innerText()).includes("You: 3"));
  check("Closest: the explanation is shown", (await last.getByTestId("mz-review-why").count()) === 1);
  const q2 = (await ada.locator(".mz-card p b").first().innerText()).trim();
  check("Closest: question 2 is now open and its answer is not shown", q2 !== q1 && (await ada.getByTestId("mz-review-item").count()) === 1);
  await ada.screenshot({ path: screenshotPath("docs/content-quality-2/screenshots/e3-closest-last-phone.png"), fullPage: true });
  await tv.getByTestId("tv-answer-review").waitFor({ timeout: 15000 });
  const tvText = await tv.getByTestId("tv-answer-review").innerText();
  check("Closest: TV shows the last answer only", tvText.includes("last answer") && (await tv.getByTestId("tv-answer-review").getByTestId("mz-review-item").count()) === 1);
  check("Closest: TV shows nobody's guess", (await tv.getByTestId("mz-review-mine").count()) === 0);
  await tv.screenshot({ path: screenshotPath("docs/content-quality-2/screenshots/e3-closest-tv.png"), fullPage: true });
  await pA.close(); await pB.close(); await tvCtx.close();
} finally {
  await browser.close();
}
console.log(failures === 0 ? "ANSWER REVEAL ALL PASSED" : `ANSWER REVEAL FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
