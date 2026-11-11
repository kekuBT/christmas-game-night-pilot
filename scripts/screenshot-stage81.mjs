// Stage 8.1: before/after screenshots of the everyday journey at 320×640,
// 390×844, 844×390 (a phone held sideways) and 1440×900. Visual evidence
// only: check-mobile-everyday is the check.
//
// Run from the checkout to photograph (it starts ITS OWN server there, with
// that checkout's build: run `npm run build:web` first). It uses only screens
// and test ids that exist before and after Stage 8.1, so the same script
// photographs both:
//   node <path>/scripts/screenshot-stage81.mjs --out <dir>
// Writes <dir>/*.png and <dir>/manifest.json naming the exact revision.
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { slabNumber, solveMath } from "./lib/math-solve.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", join("docs", "stage8", "screenshots-81", "after"));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
const DIRTY = execSync("git status --porcelain --untracked-files=no").toString().trim() !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { revision: REV, workingTreeClean: !DIRTY, capturedAt: new Date().toISOString(), by: "scripts/screenshot-stage81.mjs", note: "Chromium headless (Playwright) emulation only; not a real iPhone or Android device, not WebKit. Viewport-sized shots (the app scrolls an inner container).", shots: [] };

const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: mkdtempSync(join(tmpdir(), "mz-shot81-")) };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let BASE = "";
for (let i = 0; i < 160 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
if (!BASE) throw new Error(`server did not start: ${out.slice(-300)}`);

const VIEWS = [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }];
async function shot(page, name, what) {
  await sleep(450); // let entrance motion settle
  const vp = page.viewportSize();
  const file = `${name}-${vp.width}x${vp.height}.png`;
  await page.screenshot({ path: join(OUT, file) });
  manifest.shots.push({ file, screen: what, viewport: `${vp.width}×${vp.height}` });
  console.log(`saved ${file}`);
}
async function playMath(page) {
  for (let i = 0; i < 10; i++) {
    const slabs = page.locator(".mz-slab:not([disabled])");
    await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
    for (let k = 0; k < 50 && (await slabs.count()) !== 4; k++) await sleep(100);
    const answer = solveMath(await page.locator("h1.mz-question").innerText());
    const labels = (await slabs.allInnerTexts()).map(slabNumber);
    await slabs.nth(Math.max(0, labels.indexOf(answer))).click();
    if (i < 9) { await page.getByTestId("mz-math-next").waitFor({ timeout: 20000 }); await page.getByTestId("mz-math-next").click(); }
  }
  await page.getByTestId("solo-results").waitFor({ timeout: 20000 });
}

const browser = await launchChromium();
try {
  for (const view of VIEWS) {
    const ctx = await browser.newContext({ viewport: view });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
    await shot(p, "01-solo-shelf", "Play solo: the shelf, first screen");

    // Pattern Pulse: round 1 played, then the between-pattern screen; round 2 tapping back.
    await p.getByTestId("solo-start-pattern-pulse").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
    await p.getByTestId("mz-pp-open").click();
    await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
    let pattern = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
    await p.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
    for (const s of pattern) await p.getByTestId(`mz-pp-key-${s}`).click();
    await p.getByTestId("mz-pp-submit").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 15000 });
    await shot(p, "02-pulse-between-patterns", "Pattern Pulse between patterns (round 2 next)");
    await p.getByTestId("mz-pp-open").click();
    await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
    pattern = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
    await p.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
    await p.getByTestId(`mz-pp-key-${pattern[0]}`).click();
    await shot(p, "03-pulse-tap-back", "Pattern Pulse tapping round 2 back (1 of 4 in)");
    await p.getByTestId("solo-leave").click();
    await p.getByTestId("solo-leave-yes").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 10000 });

    // Math Mayhem: a question, then the results.
    await p.getByTestId("solo-start-math-mayhem").click();
    await p.locator("h1.mz-question").waitFor({ timeout: 20000 });
    await shot(p, "04-math-question", "Math Mayhem, solo: the first question");
    await playMath(p);
    await shot(p, "05-solo-results", "Math Mayhem, solo: results with Play again");
    await ctx.close();

    // A casual room with the longest names: lobby (host), briefing (guest), Pulse between patterns in a room, results.
    const hctx = await browser.newContext({ viewport: view });
    const gctx = await browser.newContext({ viewport: view });
    const h = await hctx.newPage();
    const g = await gctx.newPage();
    await h.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await h.getByTestId("home-host").click();
    await h.getByPlaceholder("e.g. Auntie June").fill("Bartholomew Featherstone");
    await h.getByRole("button", { name: "Host a game" }).click();
    const chip = h.getByRole("button", { name: /^Share room code / });
    await chip.waitFor({ timeout: 15000 });
    let code = "";
    for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
    await g.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await g.getByPlaceholder("e.g. Auntie June").fill("Wolfeschlegelsteinhausen");
    await g.locator(".mz-code__input").fill(code);
    await g.getByRole("button", { name: "Join the game" }).click();
    await g.getByRole("heading", { name: /You’re in, Wolfeschlegelsteinhausen/ }).waitFor({ timeout: 15000 });
    await h.getByText("Wolfeschlegelsteinhausen").first().waitFor({ timeout: 15000 });
    await h.getByTestId("choose-game").click();
    await h.getByTestId("select-game-pattern-pulse").click();
    await sleep(300);
    await shot(h, "06-casual-lobby-host", "Casual lobby, host, the longest names (24 characters)");
    await h.locator('[data-testid="lobby-dock"] button.mz-key--block').first().click();
    await g.getByTestId("briefing").waitFor({ timeout: 20000 });
    await shot(g, "07-casual-briefing-guest", "Casual briefing, guest: the first screen");
    await passBriefing([h, g]);
    await g.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
    await shot(g, "08-casual-pulse-ready-guest", "Pattern Pulse in a casual room, guest, before round 1");
    await h.getByTestId("mz-pp-sitout").click();
    await g.getByTestId("mz-pp-sitout").click();
    await h.getByTestId("whats-next").waitFor({ timeout: 30000 });
    await shot(h, "09-casual-results-host", "Casual results with What's next, host");
    await hctx.close();
    await gctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.shots.length} screenshots at ${REV}${DIRTY ? " (tree not clean)" : ""}`);
