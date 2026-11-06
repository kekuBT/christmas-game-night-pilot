// Smart Shuffle UI (Milestone H): host-only Surprise me / Smart shuffle
// buttons pick an up-next game via the pure engine and never start one.
// Guests see no shuffle buttons. Manual selection clears the result line.
// Usage: build:web, serve on a port, then:
//   node scripts/check-shuffle.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const TITLES = ["Impostor", "Caption Clash", "Trivia Showdown", "Word Connections", "Who Said That?", "Guess the Year", "Closest Wins", "Category Sprint", "Charades", "Geography Challenge", "Math Mayhem"];

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
async function upNextTitle(page) {
  const text = ((await page.getByText(/Up next is /).first().textContent()) ?? "");
  const m = text.match(/Up next is (.+)\. Official games/);
  return m ? m[1] : "";
}

const browser = await launchChromium();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const bea = await ctx.newPage();
  await joinRoom(bea, "Bea", code);

  // Guests never see shuffle controls: choosing is a host action.
  check("guest sees no shuffle buttons",
    (await bea.locator('[data-testid="surprise-me"]').count()) === 0
    && (await bea.locator('[data-testid="smart-shuffle"]').count()) === 0);

  // Surprise me picks a real game as up-next and explains itself.
  await host.getByTestId("surprise-me").click();
  await host.getByTestId("shuffle-result").waitFor({ timeout: 15000 });
  const surpriseTitle = await upNextTitle(host);
  const surpriseText = ((await host.getByTestId("shuffle-result").textContent()) ?? "");
  check("surprise me picks a real game as up-next",
    TITLES.includes(surpriseTitle), `up-next=${surpriseTitle}`);
  check("surprise me explains the pick",
    surpriseText.startsWith(`${surpriseTitle}: `) && surpriseText.length > surpriseTitle.length + 2);

  // Smart shuffle likewise, and neither starts a game.
  await host.getByTestId("smart-shuffle").click();
  await host.getByTestId("shuffle-result").waitFor({ timeout: 15000 });
  const smartTitle = await upNextTitle(host);
  check("smart shuffle picks a real game as up-next",
    TITLES.includes(smartTitle), `up-next=${smartTitle}`);
  check("shuffling started no game",
    (await host.locator(".mz-question").count()) === 0
    && await host.getByRole("heading", { name: "You’re in, Ada." }).isVisible()
    && (await host.locator('[data-testid^="start-"]').count()) >= 1);

  // Manual selection clears the shuffle result line.
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-impostor").click();
  await sleep(500);
  check("manual selection clears the shuffle result",
    (await host.locator('[data-testid="shuffle-result"]').count()) === 0);
  check("manual selection sets the chosen game up next",
    (await upNextTitle(host)) === "Impostor");
} finally {
  await browser.close();
}
console.log(failures === 0 ? "SHUFFLE ALL PASSED" : `SHUFFLE FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
