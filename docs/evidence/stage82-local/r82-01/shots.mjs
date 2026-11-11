// Repair R82-01 (review 6799134510): pictures of a device that can't save its
// choices. Visual evidence only; check-themes-seasonal section F is the check.
//
// Run from the checkout root after `npm run build:web` (it starts ITS OWN
// server from that checkout):
//   node docs/evidence/stage82-local/r82-01/shots.mjs --out <dir>
// localStorage writes throw (QuotaExceededError) before any page script runs,
// and nothing is stored. Every choice is made through the UI, as a person would.
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "../../../../scripts/lib/driver-env.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", join("docs", "stage8", "screenshots-82", "r82-01"));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
// Code outside docs/ (what runs) must match the revision; docs/ may hold the shots being retaken.
const DIRTY = execSync("git status --porcelain --untracked-files=no -- . ':!docs'").toString().trim() !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { revision: REV, codeOutsideDocsClean: !DIRTY, capturedAt: new Date().toISOString(), by: "docs/evidence/stage82-local/r82-01/shots.mjs", storage: "localStorage.setItem throws QuotaExceededError; nothing stored", note: "Chromium headless (Playwright) emulation only; not a real device or WebKit.", shots: [] };

const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: mkdtempSync(join(tmpdir(), "mz-shot-r8201-")) };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_DIR;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let BASE = "";
for (let i = 0; i < 160 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
if (!BASE) throw new Error(`server did not start: ${out.slice(-300)}`);

async function settle(page) {
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming?.().iterations !== Infinity).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1500))]));
  await sleep(250);
}
async function shot(page, file, what) {
  await settle(page);
  const vp = page.viewportSize();
  await page.screenshot({ path: join(OUT, file) });
  const state = await page.evaluate(() => ({
    rendered: document.documentElement.dataset.mzTheme ?? "everyday",
    stored: { mz_look: localStorage.getItem("mz_look"), mz_solo_season: localStorage.getItem("mz_solo_season") },
  }));
  manifest.shots.push({ file, screen: what, viewport: `${vp.width}×${vp.height}`, ...state });
}

const browser = await launchChromium();
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
    const size = `${viewport.width}x${viewport.height}`;
    const ctx = await browser.newContext({ viewport });
    await ctx.addInitScript(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (this === window.localStorage) throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); return orig.call(this, k, v); };
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("home-settings").click();
    await p.getByTestId("look-christmas").click();
    await p.getByTestId("look-unsaved").waitFor({ timeout: 5000 });
    await shot(p, `01-settings-look-christmas-unsaved-${size}.png`, "Settings → Look → Christmas, on a device that can't save: it stays chosen and says it lasts until reload");
    await p.getByTestId("look-auto").click();
    await p.keyboard.press("Escape");
    await p.getByTestId("home-solo").click();
    await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
    await p.getByTestId("solo-content-christmas").click();
    await p.getByTestId("solo-content-unsaved").waitFor({ timeout: 5000 });
    await shot(p, `02-shelf-christmas-unsaved-${size}.png`, "Solo shelf, Christmas content chosen (Look: Match the game), on a device that can't save");
    if (viewport.width === 390) {
      await p.getByTestId("solo-start-word-connections").click();
      await p.getByTestId("mz-cx").waitFor({ timeout: 20000 });
      await shot(p, `03-connections-round-christmas-unsaved-${size}.png`, "Shelf → Word Connections: a Christmas board in the Christmas look, the choice never saved");
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.shots.length} screenshots in ${OUT} (revision ${REV.slice(0, 7)}${DIRTY ? ", tree NOT clean" : ""})`);
