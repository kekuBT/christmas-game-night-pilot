// Stage 6.2: screenshots of the solo shelf at a small phone (320), a common
// phone (390) and desktop (1440): the top of the shelf and its Word
// Connections card (the app scrolls an inner container, so a "full page"
// shot would show only the first screen), Pattern Pulse ready,
// memorising, tapping back and its results, Word Connections mid-puzzle and
// its results. Writes docs/stage6/screenshots-62/*.png and a manifest naming
// the exact revision. Visual evidence only: check-solo-shelf is the check.
// Run from the checkout to photograph (it starts ITS OWN server there):
//   node scripts/screenshot-stage62.mjs [--out <dir>]
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";
import { connectionsGroups } from "./lib/content-oracle.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", join("docs", "stage6", "screenshots-62"));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
const DIRTY = execSync("git status --porcelain --untracked-files=no").toString().trim() !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { revision: REV, workingTreeClean: !DIRTY, capturedAt: new Date().toISOString(), note: "Chromium headless (Playwright) only; not a real iPhone or Android device, not WebKit.", shots: [] };

const DATA = mkdtempSync(join(tmpdir(), "mz-shot62-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let BASE = "";
for (let i = 0; i < 160 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
if (!BASE) throw new Error(`server did not start: ${out.slice(-300)}`);

const VIEWS = [{ width: 320, height: 640, dpr: 2 }, { width: 390, height: 844, dpr: 2 }, { width: 1440, height: 900, dpr: 1 }];
async function shot(page, name, view, what, fullPage = false) {
  await sleep(350); // let entrance motion settle
  const file = `${name}-${view.width}x${view.height}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage });
  manifest.shots.push({ file, screen: what, viewport: `${view.width}×${view.height}`, deviceScaleFactor: view.dpr, fullPage });
  console.log(`saved ${file}`);
}
const tileFor = (p, w) => p.getByTestId("mz-cx-tile").filter({ hasText: new RegExp(`^\\s*${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") });

const browser = await launchChromium();
try {
  for (const view of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dpr });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
    await shot(p, "01-solo-shelf", view, "Play solo: the top of the shelf");
    await p.getByTestId("solo-game-word-connections").scrollIntoViewIfNeeded();
    await shot(p, "01b-solo-shelf-connections", view, "Play solo: the Word Connections card, its personal best and the note that the best spans boards");
    await p.getByTestId("solo-game-math-mayhem").scrollIntoViewIfNeeded();

    // Pattern Pulse: ready, memorise, tap back, then the rest of the game (round 3 slips) to results.
    await p.getByTestId("solo-start-pattern-pulse").click();
    await p.getByTestId("mz-pp-ready").waitFor({ timeout: 20000 });
    await shot(p, "02-pulse-ready", view, "Pattern Pulse, solo: ready for round 1 (no Sit the rest out)");
    for (let i = 0; i < 6; i++) {
      await p.getByTestId("mz-pp-open").waitFor({ timeout: 30000 });
      await p.getByTestId("mz-pp-open").click();
      await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
      const pattern = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
      if (i === 1) await shot(p, "03-pulse-memorise", view, "Pattern Pulse: memorising round 2");
      await p.getByTestId("mz-pp-input").waitFor({ timeout: 15000 });
      const entry = i === 2 ? [(pattern[0] + 1) % 6, ...pattern.slice(1)] : pattern;
      for (const [k, s] of entry.entries()) {
        await p.getByTestId(`mz-pp-key-${s}`).click();
        if (i === 1 && k === 1) await shot(p, "04-pulse-input", view, "Pattern Pulse: tapping round 2 back (2 of 4 in)");
      }
      await p.getByTestId("mz-pp-submit").click();
      if (i < 5) await p.getByTestId("mz-pp-ready").waitFor({ timeout: 15000 });
    }
    await p.getByTestId("solo-results").waitFor({ timeout: 30000 });
    await shot(p, "05-pulse-results", view, "Pattern Pulse results: score, rounds perfect, personal best, the six-round recap");

    // Word Connections: one group found and two tiles selected, then two more groups and four mistakes.
    await p.getByTestId("solo-back").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 10000 });
    await p.getByTestId("solo-start-word-connections").click();
    await p.getByTestId("mz-cx").waitFor({ timeout: 20000 });
    const groups = connectionsGroups((await p.getByTestId("mz-cx-tile").allInnerTexts()).map((w) => w.trim()));
    const guess = async (four) => {
      for (const w of four) await tileFor(p, w).click();
      await p.getByTestId("mz-cx-submit").click();
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="mz-cx-tile"][aria-pressed="true"]').length === 0 || !document.querySelector('[data-testid="mz-cx-tile"]'), null, { timeout: 15000 });
    };
    await guess(groups[0]);
    await tileFor(p, groups[1][0]).click(); await tileFor(p, groups[1][1]).click();
    await shot(p, "06-connections-play", view, "Word Connections, solo: one group found, two tiles selected (no Sit this game out)");
    await tileFor(p, groups[1][0]).click(); await tileFor(p, groups[1][1]).click(); // deselect
    await guess(groups[1]);
    for (let k = 0; k < 4; k++) await guess([groups[3][0], groups[3][1], groups[2][k], groups[2][(k + 1) % 4]]);
    await p.getByTestId("solo-results").waitFor({ timeout: 30000 });
    await shot(p, "07-connections-results", view, "Word Connections results: 2 of 4 found, the found groups solid and the missed dashed");
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  await new Promise((r) => srv.once("exit", r));
  rmSync(DATA, { recursive: true, force: true });
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.shots.length} screenshots in ${OUT} (revision ${REV.slice(0, 7)}${DIRTY ? ", working tree NOT clean" : ""})`);
