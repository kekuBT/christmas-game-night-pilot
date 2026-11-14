// Guess the Year kit extraction (Work Package D): the new
// MchezoYear panel must preserve every rule — same intents, same
// whole-game abstention, same host skip path, same reconnect — while
// rendering one event at a time in the kit. Covers: authorization
// (guests see no start/setup controls), the E1 range 1000–2100 (the
// old 1896–2025 clamp made earlier events unanswerable), no clamping
// (out-of-range input shows a message and disables Submit), the ±1/±10
// nudge buttons, the numeric phone keypad, locked guessed
// events, any-order answering, whole-game abstention, reconnection
// (reload keeps guesses and the abstained state), the waiting ring,
// final results, mobile widths (no horizontal overflow at
// 320/360/390). Usage: build:web, serve on a port, then:
//   node scripts/check-year.mjs <baseUrl>
import { yearFor } from "./lib/content-oracle.mjs";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

import { hostFamilyCup } from "./lib/room-nav.mjs";
const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL" } ${name}${detail ? ` — ${detail}` : ""}`);
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
async function startYear(host, players) {
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-guess-the-year").click();
  await host.getByTestId("start-official-guess-the-year").click();
  // D3: every player reads the rules and taps I'm ready; play starts for all at once.
  await passBriefing(players);
}
// Guess one event by chip index, via the field (default) or the dial.
// Skips the event if it is already guessed (the confirmation shows).
// Returns "already" | "guessed" | "finished" — "finished" when this
// guess was the last one the game needed: the game advances to the
// results in the same mutation, so the confirmation never renders
// (the last finisher's confirmation is never visible; see the
// Work Package B component inventory). Callers must stop guessing
// after "finished".
async function guessEvent(page, i, value, via = "field") {
  await page.getByTestId(`mz-year-q${i}`).click();
  await sleep(200);
  if ((await page.getByTestId("mz-year-guessed").count()) > 0) return "already";
  if (via === "dial") {
    await page.getByTestId("mz-num-dial").fill(String(value));
  } else {
    await page.getByTestId("mz-num-input").fill(String(value));
  }
  await page.getByTestId("mz-num-submit").click();
  const won = await Promise.race([
    page.getByTestId("mz-year-guessed").waitFor({ timeout: 15000 }).then(() => "guessed"),
    page.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 }).then(() => "finished"),
  ]);
  return won;
}

const browser = await launchChromium();
try {
  // E1: an emulated phone (touch, mobile viewport) for the first room.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const bea = await ctx.newPage();
  await joinRoom(bea, "Bea", code);

  // Authorization: guests see no setup card and no year start control.
  check("guest sees no game setup (host-only)",
    (await bea.getByTestId("choose-game").count()) === 0);
  check("guest sees no year start control",
    (await bea.getByTestId("start-official-guess-the-year").count()) === 0);

  await startYear(host, [host, bea]);
  for (const [page, name] of [[host, "host"], [bea, "Bea"]]) {
    await page.getByTestId("mz-year-progress").waitFor({ timeout: 15000 });
    check(`${name} sees the kit year panel`, true);
  }
  check("progress line reads Event 1 of 8",
    (await host.getByTestId("mz-year-progress").innerText()) === "Event 1 of 8");
  // Sprint 4: events are drawn from the content packs; the test oracle
  // knows each event's year, so expected scores are computed, not fixed.
  const years = [];
  for (let i = 0; i < 8; i++) {
    await host.getByTestId(`mz-year-q${i}`).click();
    years.push(yearFor(await host.getByTestId("mz-year-event").innerText()));
  }
  await host.getByTestId("mz-year-q0").click();
  check("every event comes from the content (oracle knows all 8 years)", years.length === 8 && years.every((y) => Number.isInteger(y)), years.join(","));
  const pts = (guess, year) => Math.max(0, 100 - 10 * Math.abs(guess - year));
  check("eight jump chips", (await host.locator("[data-testid^='mz-year-q']").count()) === 8);
  await host.screenshot({ path: screenshotPath("docs/mchezo-screenshots/19-year-after.png") });

  // Mobile widths: the new controls must not overflow horizontally.
  for (const w of [320, 360, 390]) {
    await host.setViewportSize({ width: w, height: 844 });
    await sleep(300);
    const overflow = await host.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`no horizontal overflow at ${w}px`, !overflow);
  }
  await host.setViewportSize({ width: 390, height: 844 });

  // E1: the phone gets a numeric keypad, and a year before the old 1896
  // floor can be typed exactly (no clamp).
  await host.getByTestId("mz-year-q3").click();
  const yf = host.getByTestId("mz-num-input");
  check("phone gets a numeric keypad (inputmode=numeric)", (await yf.getAttribute("inputmode")) === "numeric");
  await yf.fill(""); await yf.pressSequentially("1066", { delay: 15 });
  check("1066 is accepted as typed (old input clamped it to 1896)",
    (await host.getByTestId("mz-num-submit").innerText()).trim().endsWith("1066") && !(await host.getByTestId("mz-num-submit").isDisabled()));
  await yf.fill(""); await yf.pressSequentially("999", { delay: 15 });
  check("999 shows a message and disables Submit (no silent clamp)",
    (await host.getByTestId("mz-num-error").innerText()).includes("1000 to 2100") && await host.getByTestId("mz-num-submit").isDisabled());
  // Nudge buttons fine-tune the year by touch: 1890 +10 −1 −1 −1 −1 = 1896.
  await yf.fill("1890");
  await host.getByTestId("mz-num-nudge-10").tap();
  for (let i = 0; i < 4; i++) await host.getByTestId("mz-num-nudge--1").tap();
  check("nudges reach 1896", (await host.getByTestId("mz-num-value").innerText()) === "1896");
  check("Submit is labelled with 1896",
    (await host.getByTestId("mz-num-submit").innerText()).includes("1896"));
  await host.getByTestId("mz-num-submit").tap();
  await host.getByTestId("mz-year-guessed").waitFor({ timeout: 15000 });
  check("1896 guess confirmed", (await host.getByTestId("mz-year-guessed").innerText()).includes("1896"));

  // The dial covers the whole range: its ends are 1000 and 2100.
  await host.getByTestId("mz-year-q1").click();
  await host.getByTestId("mz-num-dial").fill("0");
  check("dial start is 1000", (await host.getByTestId("mz-num-value").innerText()) === "1000");
  await host.getByTestId("mz-num-dial").fill("1000");
  check("dial end is 2100", (await host.getByTestId("mz-num-value").innerText()) === "2100");
  // 2025 via the field.
  await guessEvent(host, 1, 2025);
  check("2025 guess confirmed", (await host.getByTestId("mz-year-guessed").innerText()).includes("2025"));

  // 1800 (below the old floor) is submitted exactly as typed.
  await host.getByTestId("mz-year-q2").click();
  await host.getByTestId("mz-num-input").fill("1800");
  check("1800 is kept as typed", (await host.getByTestId("mz-num-input").inputValue()) === "1800");
  check("Submit shows 1800",
    (await host.getByTestId("mz-num-submit").innerText()).includes("1800"));
  await host.getByTestId("mz-num-submit").click();
  await host.getByTestId("mz-year-guessed").waitFor({ timeout: 15000 });
  check("1800 guess confirmed", (await host.getByTestId("mz-year-guessed").innerText()).includes("1800"));

  // A guessed event is locked: no number controls, the confirmation
  // shows instead, and the chip carries a check mark.
  await host.getByTestId("mz-year-q3").click();
  check("guessed event shows its confirmation, not the controls",
    (await host.getByTestId("mz-num-input").count()) === 0 &&
    (await host.getByTestId("mz-year-guessed").innerText()).includes("1896"));
  check("guessed chips carry a check mark",
    (await host.getByTestId("mz-year-q3").innerText()) === "✓");

  // Bea guesses all eight (any order, field path); her done state
  // shows the waiting ring. The host finishes the remaining five.
  for (let i = 0; i < 8; i++) await guessEvent(bea, i, 2000);
  await bea.locator(".mz-wait").waitFor({ timeout: 15000 });
  check("Bea sees the waiting ring after all 8 guesses", true);
  check("Bea's done state says all guesses are in",
    (await bea.getByTestId("mz-year-guessed").innerText()).includes("All 8 events guessed"));
  for (let i = 0; i < 8; i++) {
    if ((await guessEvent(host, i, 2000)) === "finished") break;
  }
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 });
  check("game finishes and shows results", true);
  const hostGuesses = years.map((_, i) => (i === 3 ? 1896 : i === 2 ? 1800 : i === 1 ? 2025 : 2000));
  const hostExpected = years.reduce((s, y, i) => s + pts(hostGuesses[i], y), 0);
  const beaExpected = years.reduce((s, y) => s + pts(2000, y), 0);
  const resultsText = await host.evaluate(() => document.body.innerText);
  check(`host's results show his exact score (${hostExpected}, from the oracle's years)`, resultsText.includes(`Ada: ${hostExpected} points`), resultsText.slice(0, 200));
  check(`Bea's exact score (${beaExpected})`, resultsText.includes(`Bea: ${beaExpected} points`));

  // Room 2: whole-game abstention + reconnect. The guest sits out,
  // reloads, and is still sat out; the host's eight guesses finish
  // the game without her.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host2 = await ctx2.newPage();
  const code2 = await createRoom(host2, "Ada");
  const bea2 = await ctx2.newPage();
  await joinRoom(bea2, "Bea", code2);
  await startYear(host2, [host2, bea2]);
  await bea2.getByTestId("mz-year-progress").waitFor({ timeout: 15000 });
  await bea2.getByTestId("mz-abstain").click();
  await bea2.getByTestId("mz-year-guessed").waitFor({ timeout: 15000 });
  check("abstention shows the sat-out note",
    (await bea2.getByTestId("mz-year-guessed").innerText()).includes("sat this game out"));
  check("no skip button before the deadline (host only, stalled only)",
    (await host2.getByRole("button", { name: /skip/i }).count()) === 0);
  await bea2.reload({ waitUntil: "domcontentloaded" });
  await bea2.getByTestId("mz-year-guessed").waitFor({ timeout: 15000 });
  check("reloaded player is still sat out (abstention survived)",
    (await bea2.getByTestId("mz-year-guessed").innerText()).includes("sat this game out"));
  for (let i = 0; i < 8; i++) {
    if ((await guessEvent(host2, i, 2000)) === "finished") break;
  }
  await host2.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 });
  check("game finishes without the abstained player", true);
  await bea2.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 15000 });
  check("abstained player scores 0",
    (await bea2.evaluate(() => document.body.innerText)).includes("Bea: 0 points"));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "YEAR ALL PASSED" : `YEAR FAILED: ${failures} item(s)`);
process.exit(failures === 0 ? 0 : 1);
