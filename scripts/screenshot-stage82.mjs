// Stage 8.2: before/after screenshots of the Everyday and Christmas looks on
// every surface (docs/stage8/stage82.md §5). Visual evidence only:
// check-themes-seasonal is the check.
//
// Run from the checkout to photograph (it starts ITS OWN server there, with
// that checkout's build: run `npm run build:web` first). Each surface is
// photographed in this device's Everyday look and in its Christmas look
// (localStorage mz_look = christmas; before Stage 8.2 nothing reads it, so
// the "before" Christmas shots show that the Christmas theme never rendered).
// Where Stage 8.2 adds a control (the content choice), the after shots use
// it; before, those steps are skipped and the manifest says so.
//   node <path>/scripts/screenshot-stage82.mjs --out <dir>
// Writes <dir>/*.png and <dir>/manifest.json naming the exact revision.
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

import { hostFamilyCup } from "./lib/room-nav.mjs";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", join("docs", "stage8", "screenshots-82", "after"));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
const DIRTY = execSync("git status --porcelain --untracked-files=no").toString().trim() !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { revision: REV, workingTreeClean: !DIRTY, capturedAt: new Date().toISOString(), by: "scripts/screenshot-stage82.mjs", note: "Chromium headless (Playwright) emulation only; not a real iPhone or Android device, not WebKit. Viewport-sized shots.", shots: [], skipped: [] };

const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: mkdtempSync(join(tmpdir(), "mz-shot82-")) };
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
async function shot(page, name, what, lookId) {
  await settle(page);
  const vp = page.viewportSize();
  const file = `${name}-${lookId}-${vp.width}x${vp.height}.png`;
  await page.screenshot({ path: join(OUT, file) });
  const shown = await page.evaluate(() => document.documentElement.dataset.mzTheme ?? document.querySelector(".mz-root")?.getAttribute("data-mz-theme") ?? "everyday");
  manifest.shots.push({ file, screen: what, viewport: `${vp.width}×${vp.height}`, deviceLook: lookId, rendered: shown });
}
const has = async (page, testId) => (await page.getByTestId(testId).count()) > 0;
const skip = (why) => { if (!manifest.skipped.includes(why)) manifest.skipped.push(why); };

const browser = await launchChromium();
try {
  for (const lookId of ["everyday", "christmas"]) {
    const ctxFor = async (viewport) => {
      const ctx = await browser.newContext({ viewport });
      await ctx.addInitScript((v) => { try { localStorage.setItem("mz_look", v); } catch { /* none */ } }, lookId);
      return ctx;
    };
    // Home, library, solo shelf at four sizes.
    for (const vp of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      const ctx = await ctxFor(vp);
      const p = await ctx.newPage();
      await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await p.getByTestId("home-host").waitFor({ timeout: 15000 });
      await shot(p, "01-home", "Home", lookId);
      await p.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
      await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
      if (lookId === "christmas") { if (await has(p, "solo-content-christmas")) await p.getByTestId("solo-content-christmas").click(); else skip("solo content choice (added in Stage 8.2)"); }
      await shot(p, "02-solo-shelf", lookId === "christmas" ? "Solo shelf, Christmas content chosen (where it exists)" : "Solo shelf", lookId);
      if (vp.width === 390) {
        await p.goto(`${BASE}/library`, { waitUntil: "domcontentloaded" });
        await sleep(900);
        await shot(p, "03-library", "Game library", lookId);
        await p.goto(`${BASE}/solo/word-connections`, { waitUntil: "domcontentloaded" });
        await p.getByTestId("solo-ready").waitFor({ timeout: 15000 });
        await shot(p, "04-solo-connections-start", "Word Connections solo start screen", lookId);
        await p.getByTestId("solo-round-start").click();
        await p.getByTestId("mz-cx").waitFor({ timeout: 20000 });
        await shot(p, "05-solo-connections-round", lookId === "christmas" ? "A solo Word Connections round (Christmas content: a Christmas board)" : "A solo Word Connections round", lookId);
      }
      await ctx.close();
    }
    // A casual room: host 390×844, guest 320×640, TV 1280×720.
    {
      const hctx = await ctxFor({ width: 390, height: 844 }), gctx = await ctxFor({ width: 320, height: 640 }), tctx = await ctxFor({ width: 1280, height: 720 });
      const h = await hctx.newPage(), g = await gctx.newPage(), tv = await tctx.newPage();
      await h.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await h.getByTestId("home-host").click();
      await h.getByPlaceholder("e.g. Auntie June").fill("Ada");
      await h.getByRole("button", { name: "Host a game" }).click();
      const chip = h.getByRole("button", { name: /^Share room code / });
      await chip.waitFor({ timeout: 15000 });
      let code = "";
      for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
      await g.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
      await g.getByPlaceholder("e.g. Auntie June").fill("Bea");
      await g.locator(".mz-code__input").fill(code);
      await g.getByRole("button", { name: "Join the game" }).click();
      await g.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });
      await h.getByTestId("choose-game").click();
      await h.getByTestId("select-game-word-connections").click();
      if (lookId === "christmas") { if (await has(h, "lobby-content-christmas")) await h.getByTestId("lobby-content-christmas").click(); else skip("casual content choice (added in Stage 8.2)"); }
      await sleep(800);
      await shot(h, "06-casual-lobby-host", lookId === "christmas" ? "Casual lobby, host (Christmas content where it exists)" : "Casual lobby, host", lookId);
      await shot(g, "07-casual-lobby-guest", "Casual lobby, guest", lookId);
      await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
      await tv.locator(".mz-code__input").fill(code);
      await tv.getByTestId("watch-spectator").click();
      await tv.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
      await sleep(800);
      await shot(tv, "08-tv-lobby", "TV (spectator) between games", lookId);
      await h.locator('[data-testid="lobby-dock"] button.mz-key--block').first().click();
      await h.getByTestId("briefing").waitFor({ timeout: 20000 });
      await g.getByTestId("briefing").waitFor({ timeout: 20000 });
      await shot(h, "09-briefing-host", "Briefing, host", lookId);
      await shot(tv, "10-tv-briefing", "TV briefing", lookId);
      await passBriefing([h, g]);
      await g.getByTestId("mz-cx").waitFor({ timeout: 20000 });
      await shot(g, "11-casual-connections-guest", "Word Connections in a casual room, guest", lookId);
      for (const p of [h, g]) await p.getByRole("button", { name: "Sit this game out" }).click();
      await h.getByTestId("whats-next").waitFor({ timeout: 25000 });
      await shot(h, "12-casual-results-host", "Casual results with What's next, host", lookId);
      // An older game screen (the legacy shell): Category Sprint, which needs four players.
      const extra = [];
      for (const name of ["Cal", "Dee"]) {
        const c = await ctxFor({ width: 390, height: 844 });
        const q = await c.newPage();
        await q.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
        await q.getByPlaceholder("e.g. Auntie June").fill(name);
        await q.locator(".mz-code__input").fill(code);
        await q.getByRole("button", { name: "Join the game" }).click();
        await q.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
        extra.push({ c, q });
      }
      await h.getByRole("button", { name: /Back to (the )?lobby/ }).first().click();
      if (await g.getByTestId("whats-next").count()) await g.getByRole("button", { name: /Back to (the )?lobby/ }).first().click().catch(() => {});
      await h.getByTestId("choose-game").click();
      await h.getByTestId("select-game-category-sprint").click();
      await sleep(800);
      await h.locator('[data-testid="lobby-dock"] button.mz-key--block').first().click();
      await h.getByTestId("briefing").waitFor({ timeout: 20000 });
      await passBriefing([h, g, ...extra.map((e) => e.q)]);
      await sleep(1500);
      await shot(h, "13-legacy-sprint-host", "An older game screen (Category Sprint): its header", lookId);
      await Promise.all([hctx.close(), gctx.close(), tctx.close(), ...extra.map((e) => e.c.close())]);
    }
    // A Family Cup lobby (Cups stay Everyday under Match the game).
    {
      const ctx = await ctxFor({ width: 390, height: 844 });
      const p = await ctx.newPage();
      await p.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
      await p.getByPlaceholder("e.g. Auntie June").fill("Ada");
      await hostFamilyCup(p); // Stage 12.1: host, then the room menu's "Make it a Family Cup"
      await sleep(800);
      await shot(p, "14-cup-lobby", "Family Cup lobby (one player)", lookId);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}
console.log(`${manifest.shots.length} screenshots in ${OUT} (revision ${REV.slice(0, 7)}${DIRTY ? ", tree NOT clean" : ""}); skipped: ${manifest.skipped.join("; ") || "none"}`);
