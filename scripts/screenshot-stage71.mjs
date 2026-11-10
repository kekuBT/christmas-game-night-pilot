// Stage 7.1: screenshots of Quick Party at a small phone (320), a common phone
// (390) and desktop (1440): the host's entry, the planner (settings, a
// suggested lineup, replacing a game), the applied lineup for the host and a
// guest, "fewer than planned", and a next game that doesn't fit the people
// here. Writes docs/stage7/screenshots-71/*.png and a manifest naming the
// exact revision. Visual evidence only: check-quick-party is the check.
// Run from the checkout to photograph (it starts ITS OWN server there):
//   node scripts/screenshot-stage71.mjs [--out <dir>]
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", join("docs", "stage7", "screenshots-71"));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
const DIRTY = execSync("git status --porcelain --untracked-files=no").toString().trim() !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { revision: REV, workingTreeClean: !DIRTY, capturedAt: new Date().toISOString(), note: "Chromium headless (Playwright) only; not a real iPhone or Android device, not WebKit.", shots: [] };

const DATA = mkdtempSync(join(tmpdir(), "mz-shot71-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let BASE = "";
for (let i = 0; i < 160 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
if (!BASE) throw new Error(`server did not start: ${out.slice(-300)}`);

const VIEWS = [{ width: 320, height: 640, dpr: 2 }, { width: 390, height: 844, dpr: 2 }, { width: 1440, height: 900, dpr: 1 }];
async function shot(page, name, view, what) {
  await sleep(350); // let entrance motion settle
  const file = `${name}-${view.width}x${view.height}.png`;
  await page.screenshot({ path: join(OUT, file) });
  manifest.shots.push({ file, screen: what, viewport: `${view.width}×${view.height}`, deviceScaleFactor: view.dpr });
  console.log(`saved ${file}`);
}
async function host(page, name) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
const preview = (page) => page.locator('[data-testid^="party-item-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-game")));
/** In the open planner: make `gameId` the first game (move it up, or replace the first with it, making room if needed). */
async function putFirst(page, gameId) {
  for (let guard = 0; guard < 12; guard++) {
    const ids = await preview(page);
    const at = ids.indexOf(gameId);
    if (at === 0) return true;
    if (at > 0) { await page.getByTestId(`party-up-${at}`).click(); continue; }
    await page.getByTestId("party-replace-0").click();
    const opt = page.getByTestId(`party-option-${gameId}`);
    if (await opt.count() > 0) { await opt.click(); continue; }
    await page.getByTestId("party-replace-0").click(); // close the options: it doesn't fit the time left
    if (ids.length < 2) return false;
    await page.getByTestId(`party-remove-${ids.length - 1}`).click(); // make room
  }
  return false;
}
const into = (page, testId) => page.getByTestId(testId).scrollIntoViewIfNeeded();

const browser = await launchChromium();
try {
  for (const view of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dpr });
    const h = await ctx.newPage();
    const code = await host(h, "Keku");
    const gctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dpr });
    const g = await gctx.newPage();
    await joinRoom(g, "Amina", code);
    const g2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await joinRoom(g2, "Baraka", code);
    await h.getByTestId("party-entry").waitFor({ timeout: 15000 });
    await into(h, "party-card");
    await shot(h, "01-lobby-entry", view, "Casual lobby, host: the Quick Party entry");

    await h.getByTestId("party-entry").click();
    await h.getByTestId("party-sheet").waitFor({ timeout: 5000 });
    await h.getByTestId("party-size-inc").click();
    await shot(h, "02-planner-settings", view, "The planner: expected group size (4; 3 here) and 15/30/60 minutes");
    await h.getByTestId("party-suggest").click();
    await h.getByTestId("party-preview").waitFor({ timeout: 5000 });
    await putFirst(h, "impostor");
    await into(h, "party-estimate");
    await shot(h, "03-planner-lineup", view, "A suggested 30-minute lineup for 4, with its estimate and edit controls");
    await h.getByTestId("party-replace-1").click();
    await into(h, "party-options");
    await shot(h, "04-planner-replace", view, "Replacing a game: only games that fit 4 and the time left");
    await h.getByTestId("party-replace-1").click();
    await h.getByTestId("party-apply").click();
    await h.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
    await h.getByTestId("party-misfit").waitFor({ timeout: 10000 });
    await into(h, "party-lineup");
    await shot(h, "05-lineup-host-misfit", view, "The applied lineup, host: Impostor needs 4 with 3 here, so Start waits and a replan for 3 is offered");
    await g.getByTestId("party-lineup").waitFor({ timeout: 10000 });
    await into(g, "party-lineup");
    await shot(g, "06-lineup-guest", view, "The same lineup on a guest's phone (read-only)");

    // Replan with Math first, planned for 4: Start asks about fewer than planned.
    await h.getByTestId("party-replan-card").click();
    await h.getByTestId("party-sheet").waitFor({ timeout: 5000 });
    await h.getByTestId("party-size-inc").click();
    await h.getByTestId("party-suggest").click();
    await h.getByTestId("party-preview").waitFor({ timeout: 5000 });
    await putFirst(h, "math-mayhem");
    await h.getByTestId("party-apply").click();
    await h.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
    await h.getByTestId("party-start").click();
    await h.getByTestId("party-ask-fewer").waitFor({ timeout: 10000 });
    await into(h, "party-ask-fewer");
    await shot(h, "07-ask-fewer", view, "Start with fewer than planned: the host decides (Start with 3, Replan for 3, Wait)");
    await h.getByTestId("party-wait").click();
    await into(h, "party-lineup");
    await shot(h, "08-lineup-start", view, "The lineup with Math Mayhem first; Start names it as game 1 of the lineup");
    await ctx.close(); await gctx.close(); await g2.context().close();
  }
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  await new Promise((r) => srv.once("exit", r));
  rmSync(DATA, { recursive: true, force: true });
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.shots.length} screenshots in ${OUT} (revision ${REV.slice(0, 7)}${DIRTY ? ", working tree NOT clean" : ""})`);
