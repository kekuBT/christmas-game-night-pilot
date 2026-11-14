// Stage 6.1: screenshots of the everyday entry and the solo loop, at a small
// phone (320), a common phone (390) and desktop (1440): Home, Play solo
// (fresh, then with a personal best), a solo question, solo results, Host a
// game (Casual by default) and a casual lobby. Writes
// docs/stage6/screenshots/*.png and a manifest recording, for every image, the
// screen, viewport and the exact revision it was taken on.
// Visual evidence only: check-solo and check-casual are the checks.
// Run from the checkout to photograph (it starts ITS OWN server there):
//   node scripts/screenshot-stage61.mjs [--out <dir>]
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";
import { slabNumber, solveMath } from "./lib/math-solve.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", join("docs", "stage6", "screenshots"));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
const DIRTY = execSync("git status --porcelain --untracked-files=no").toString().trim() !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { revision: REV, workingTreeClean: !DIRTY, capturedAt: new Date().toISOString(), note: "Chromium headless (Playwright) only; not a real iPhone or Android device, not WebKit.", shots: [] };

const DATA = mkdtempSync(join(tmpdir(), "mz-shot61-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let BASE = "";
for (let i = 0; i < 160 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
if (!BASE) throw new Error(`server did not start: ${out.slice(-300)}`);

const VIEWS = [{ width: 320, height: 640, dpr: 2 }, { width: 390, height: 844, dpr: 2 }, { width: 1440, height: 900, dpr: 1 }];
async function shot(page, name, view, what) {
  await sleep(400); // let entrance motion settle
  const file = `${name}-${view.width}x${view.height}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: false });
  manifest.shots.push({ file, screen: what, viewport: `${view.width}×${view.height}`, deviceScaleFactor: view.dpr });
  console.log(`saved ${file}`);
}
async function playRound(page, rightFor) {
  for (let i = 0; i < 10; i++) {
    const slabs = page.locator(".mz-slab:not([disabled])");
    await page.locator("h1.mz-question").waitFor({ timeout: 20000 });
    while ((await slabs.count()) !== 4) await sleep(100);
    const answer = solveMath(await page.locator("h1.mz-question").innerText());
    const labels = (await slabs.allInnerTexts()).map(slabNumber);
    await slabs.nth(rightFor(i) ? labels.indexOf(answer) : labels.findIndex((v) => v !== answer)).click();
    if (i < 9) { await page.getByTestId("mz-math-next").waitFor({ timeout: 20000 }); await page.getByTestId("mz-math-next").click(); }
  }
  await page.getByTestId("solo-results").waitFor({ timeout: 20000 });
}

const browser = await launchChromium();
try {
  for (const view of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dpr });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("home").waitFor({ timeout: 15000 });
    await shot(p, "01-home", view, "Home: Join a room / Play solo / Host a game");
    await p.getByTestId("home-solo").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 10000 });
    await shot(p, "02-solo-list", view, "Play solo: the games that work alone, no personal best yet");
    await p.getByTestId("solo-start-math-mayhem").click();
    await p.locator("h1.mz-question").waitFor({ timeout: 20000 });
    await shot(p, "03-solo-question", view, "A solo Math Mayhem question (two taps from Home)");
    await playRound(p, (i) => i !== 3 && i !== 7);
    await shot(p, "04-solo-results", view, "Solo results: score, correct count, personal best on this device, Play again");
    await p.getByTestId("solo-back").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 10000 });
    await shot(p, "05-solo-list-best", view, "Play solo after a round: the personal best on this device");
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("home-host").click();
    await p.getByTestId("host-cup-note").waitFor({ timeout: 10000 });
    await p.getByPlaceholder("e.g. Auntie June").fill("Keku");
    await shot(p, "06-host-casual", view, "Host a game: just a name; a Family Cup is a later upgrade from the room menu (Stage 12.1)");
    await p.getByRole("button", { name: "Host a game" }).click();
    await p.getByRole("button", { name: /^Share room code / }).waitFor({ timeout: 15000 });
    await p.getByTestId("choose-game").click();
    await p.getByTestId("choose-sheet").waitFor({ timeout: 5000 });
    await p.getByTestId("select-game-math-mayhem").click();
    await p.getByTestId("choose-sheet").waitFor({ state: "detached", timeout: 5000 });
    const code = ((await p.getByRole("button", { name: /^Share room code / }).getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    await fetch(`${BASE}/rooms/join-by-code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ joinCode: code, displayName: "Amina" }) });
    await p.getByText("Amina").first().waitFor({ timeout: 10000 });
    await shot(p, "07-casual-lobby", view, "A casual lobby: no Cup chip, no Official/Practice choice, Casual · just for fun");
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
