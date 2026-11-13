// Geography Challenge kit extraction (Work Package E): the new
// MchezoGeography panel must preserve every rule — same intents,
// same whole-game abstention, same host skip path, same reconnect
// — while rendering one question at a time in the kit. Covers:
// authorization (guests see no start/setup controls), answering
// (one question at a time, locked view, next-question navigation),
// the exact end-to-end scores (all correct = 800, all wrong = 0),
// whole-game abstention, reconnection (reload keeps the abstained
// state), the waiting ring, final results, mobile widths (no
// horizontal overflow at 320/360/390). Usage: build:web, serve on
// a port, then:
//   node scripts/check-geography.mjs <baseUrl>
import { answerFor, optionIndex } from "./lib/content-oracle.mjs";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

import { hostFamilyCup } from "./lib/room-nav.mjs";
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
  await hostFamilyCup(page);
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
async function startGeography(host, players) {
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-geography").click();
  await host.getByTestId("start-official-geography").click();
  // D3: every player reads the rules and taps I'm ready; play starts for all at once.
  await passBriefing(players);
}
// Sprint 4: each game draws its own 8 questions from the content packs.
// The test oracle (scripts/lib/content-oracle.mjs) finds the right option
// for the question on screen. All right = 800 (8 x 100); all wrong = 0.
const CORRECT = Array(8).fill("right");
const WRONG = Array(8).fill("wrong");
async function pickIndex(page, how) {
  const prompt = await page.locator(".mz-question").innerText();
  const options = await page.locator(".mz-slab").allInnerTexts();
  return optionIndex("geography", prompt, options.map((o) => o.split("\n").filter(Boolean).pop() ?? o), { wrong: how === "wrong" });
}
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
        await page.locator(".mz-slab").nth(await pickIndex(page, picks[i])).click();
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

  // Authorization: guests see no setup card and no geography start.
  check("guest sees no game setup (host-only)",
    (await bea.getByTestId("choose-game").count()) === 0);
  check("guest sees no geography start control",
    (await bea.getByTestId("start-official-geography").count()) === 0);

  await startGeography(host, [host, bea]);
  for (const [page, name] of [[host, "host"], [bea, "Bea"]]) {
    await page.locator(".mz-question").waitFor({ timeout: 15000 });
    check(`${name} sees the kit geography panel`, true);
  }
  check("the first question comes from the geography content (oracle knows its answer)",
    typeof answerFor("geography", await host.locator(".mz-question").innerText()) === "string");
  check("question counter reads 1 of 8",
    (await host.evaluate(() => document.body.innerText)).includes("Question 1 of 8"));
  check("four answer options", (await host.locator(".mz-slab").count()) === 4);
  check("no TV stage chip (Geography has no TV stage)",
    (await host.getByTestId("mz-tv-stage").count()) === 0);
  await host.screenshot({ path: screenshotPath("docs/mchezo-screenshots/21-geography-after.png") });

  // Mobile widths: the new question screen must not overflow.
  for (const w of [320, 360, 390]) {
    await host.setViewportSize({ width: w, height: 844 });
    await sleep(300);
    const overflow = await host.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`no horizontal overflow at ${w}px`, !overflow);
  }
  await host.setViewportSize({ width: 390, height: 844 });

  // The locked view after answering, then the next question.
  const q1 = await host.locator(".mz-question").innerText();
  const q1Answer = answerFor("geography", q1);
  await host.locator(".mz-slab").nth(await pickIndex(host, "right")).click();
  await host.locator('main[aria-label="Answer locked in"]').waitFor({ timeout: 15000 });
  check(`locked view shows the chosen answer (${q1Answer})`,
    (await host.evaluate(() => document.body.innerText)).includes(q1Answer));
  await host.getByRole("button", { name: "Next question" }).click();
  await sleep(500);
  check("the next question is a different one",
    (await host.locator(".mz-question").innerText()) !== q1);

  // Bea answers everything wrong (always the last option); the host
  // answers the remaining seven correctly. Exact scores: host 800,
  // Bea 0. (The host already answered Q1 correctly above.)
  await answerAll(bea, WRONG);
  await bea.locator(".mz-wait").waitFor({ timeout: 15000 });
  check("Bea sees the waiting ring after all 8 answers", true);
  // The waiting ring's label is a kicker, and kickers render in
  // uppercase via CSS — innerText returns the rendered case, so
  // compare case-insensitively.
  check("Bea's done state says all answers are in",
    (await bea.evaluate(() => document.body.innerText)).toLowerCase().includes("all your answers are in"));
  await answerAll(host, CORRECT.slice(1));
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 });
  check("game finishes and shows results", true);
  const hostText = await host.evaluate(() => document.body.innerText);
  check("host scores 800 (all eight correct)", hostText.includes("Ada: 800 points"));
  check("Bea scores 0 (all eight wrong)", hostText.includes("Bea: 0 points"));
  check("host wins the game", hostText.includes("Ada wins this game!"));

  // Room 2: whole-game abstention + reconnect. The guest sits out,
  // reloads, and is still sat out; the host's eight answers finish
  // the game without her.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host2 = await ctx2.newPage();
  const code2 = await createRoom(host2, "Ada");
  const bea2 = await ctx2.newPage();
  await joinRoom(bea2, "Bea", code2);
  await startGeography(host2, [host2, bea2]);
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
  await answerAll(host2, CORRECT);
  await host2.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 });
  check("game finishes without the abstained player", true);
  await bea2.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 });
  check("abstained player scores 0",
    (await bea2.evaluate(() => document.body.innerText)).includes("Bea: 0 points"));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "GEOGRAPHY ALL PASSED" : `GEOGRAPHY FAILED: ${failures} item(s)`);
process.exit(failures === 0 ? 0 : 1);
