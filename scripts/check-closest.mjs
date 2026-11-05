// Closest Wins kit extraction (Milestone J.3) + the Work Package B
// single-Submit unification: the new MchezoClosest panel must
// preserve every rule — same intents, same abstention, same host
// skip path, same reconnect — while rendering in the kit. Covers:
// authorization (guests see no start/setup controls), submission
// (one unified value + one Submit button, labelled with the value),
// abstention (per-question), reconnection (reload keeps the guessed
// state), mobile widths (no horizontal overflow at 320/360/390).
// Usage: build:web, serve on a port, then:
//   node scripts/check-closest.mjs <baseUrl>
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

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const bea = await ctx.newPage();
  await joinRoom(bea, "Bea", code);
  const cal = await ctx.newPage();
  await joinRoom(cal, "Cal", code);

  // Authorization: guests see no setup card and no closest start control.
  check("guest sees no game setup (host-only)",
    (await bea.getByTestId("choose-game").count()) === 0);
  check("guest sees no closest start control",
    (await bea.getByTestId("start-official-closest-wins").count()) === 0);

  // Host starts Closest Wins (official) via the chooser.
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-closest-wins").click();
  await host.getByTestId("start-official-closest-wins").click();
  try {
    await host.getByTestId("show-start-playing").click({ timeout: 3000 });
  } catch {
    await sleep(8500);
  }
  for (const [page, name] of [[host, "host"], [bea, "Bea"], [cal, "Cal"]]) {
    await page.getByTestId("mz-num-dial").waitFor({ timeout: 15000 });
    check(`${name} sees the kit closest panel`, true);
  }

  // Mobile widths: the new controls view must not overflow horizontally.
  for (const w of [320, 360, 390]) {
    await host.setViewportSize({ width: w, height: 844 });
    await sleep(300);
    const overflow = await host.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`no horizontal overflow at ${w}px`, !overflow);
  }
  await host.setViewportSize({ width: 390, height: 844 });

  // Submission via the number field.
  await bea.getByTestId("mz-num-input").fill("42");
  await bea.getByTestId("mz-num-submit").click();
  await bea.getByText("Your guess: 42").waitFor({ timeout: 15000 });
  check("number guess submits and confirms", true);
  check("guessed player sees the waiting ring",
    await bea.locator(".mz-wait").isVisible());

  // Reconnection: reload while Q1 is still open keeps the guessed state.
  await bea.reload({ waitUntil: "domcontentloaded" });
  await bea.getByText("Your guess: 42").waitFor({ timeout: 15000 });
  check("reload restores the guessed state", true);

  // Per-question abstention.
  await cal.getByTestId("mz-abstain").click();
  await cal.getByText("Abstained on this question.").waitFor({ timeout: 15000 });
  check("abstain shows the abstained state", true);
  check("abstained player sees the sat-out note",
    await cal.getByText(/0 points for what you skipped/).isVisible());
  check("abstained player loses the guess controls",
    (await cal.getByTestId("mz-num-dial").count()) === 0);

  // The unified value: the field and the dial share one value, and
  // there is one primary Submit button labelled with it. Bea guessed
  // and Cal abstained, so the host's guess completes Q1: the game
  // advances (next question's prompt, or results if Q1 was last). A
  // rejected guess would leave Q1's prompt and controls unchanged,
  // so advancement proves acceptance.
  const q1Prompt = await host.locator(".mz-card p b").first().textContent();
  // Typing in the field moves the dial (the readout and the button follow).
  await host.getByTestId("mz-num-input").fill("250");
  check("field value moves the dial",
    (await host.getByTestId("mz-num-value").textContent()) === "250");
  check("Submit button is labelled with the value",
    (await host.getByTestId("mz-num-submit").textContent())?.trim() === "Submit guess 250");
  // Clearing the field does not lose the value (no invisible 0).
  await host.getByTestId("mz-num-input").fill("");
  check("clearing the field keeps the value (no invisible 0)",
    (await host.getByTestId("mz-num-submit").textContent())?.trim() === "Submit guess 250");
  check("there is exactly one submit button",
    (await host.getByTestId("mz-num-dial-submit").count()) === 0);
  // Moving the dial moves the field (the button follows).
  await host.getByTestId("mz-num-dial").fill("123");
  const dialShown = (await host.getByTestId("mz-num-value").textContent()) === "123";
  check("dial value follows the slider", dialShown);
  check("Submit button follows the dial",
    (await host.getByTestId("mz-num-submit").textContent())?.trim() === "Submit guess 123");
  await host.getByTestId("mz-num-submit").click();
  let advanced = false;
  for (let i = 0; i < 60 && !advanced; i++) {
    const now = await host.locator(".mz-card p b").first().textContent().catch(() => null);
    const results = await host.getByText(/wins this game|It's a tie/).count();
    const guessText = await host.getByText("Your guess: 123").count();
    advanced = (now !== null && now !== q1Prompt) || results > 0 || guessText > 0;
    if (!advanced) await sleep(250);
  }
  check("dial guess accepted (game advances or confirms)", advanced);

  await ctx.close();
} finally {
  await browser.close();
}
console.log(failures === 0 ? "CLOSEST ALL PASSED" : `CLOSEST FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
