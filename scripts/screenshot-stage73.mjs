// Stage 7.3: screenshots of handing the host role over, at a small phone
// (320), a common phone (390) and desktop (1440): the host's players and roles,
// the confirmation, an outcome the app couldn't confirm, both lobbies right
// after the handover (with their notices), the TV marking the new host, and a
// player who isn't connected. Writes docs/stage7/screenshots-73/*.png and a
// manifest naming the exact revision. Visual evidence only:
// check-host-handover is the check.
// Run from the checkout to photograph (it starts ITS OWN server there):
//   node scripts/screenshot-stage73.mjs [--out <dir>]
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", join("docs", "stage7", "screenshots-73"));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
const DIRTY = execSync("git status --porcelain --untracked-files=no").toString().trim() !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { revision: REV, workingTreeClean: !DIRTY, capturedAt: new Date().toISOString(), note: "Chromium headless (Playwright) only; not a real iPhone or Android device, not WebKit.", shots: [] };

const DATA = mkdtempSync(join(tmpdir(), "mz-shot73-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let BASE = "";
for (let i = 0; i < 160 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
if (!BASE) throw new Error(`server did not start: ${out.slice(-300)}`);

const VIEWS = [{ width: 320, height: 640, dpr: 2 }, { width: 390, height: 844, dpr: 2 }, { width: 1440, height: 900, dpr: 1 }];
async function shot(page, name, view, what) {
  await sleep(400); // let entrance motion settle
  const file = `${name}-${view.width}x${view.height}.png`;
  await page.screenshot({ path: join(OUT, file) });
  manifest.shots.push({ file, screen: what, viewport: `${view.width}×${view.height}`, deviceScaleFactor: view.dpr });
  console.log(`saved ${file}`);
}
async function hostRoom(page, name) {
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
const into = (page, testId) => page.getByTestId(testId).scrollIntoViewIfNeeded();
const openMenu = async (page) => { await page.getByTestId("room-menu").click(); await page.getByTestId("room-menu-sheet").waitFor({ timeout: 5000 }); };

const browser = await launchChromium();
try {
  for (const view of VIEWS) {
    const size = { viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dpr };
    const ada = await (await browser.newContext(size)).newPage();
    const code = await hostRoom(ada, "Ada");
    const bea = await (await browser.newContext(size)).newPage();
    await joinRoom(bea, "Bea", code);
    const cal = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await joinRoom(cal, "Cal", code);
    let tv = null;
    if (view.width === 1440) {
      tv = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
      await tv.locator(".mz-code__input").fill(code);
      await tv.getByTestId("watch-spectator").click();
      await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
    }

    await openMenu(ada);
    await ada.getByTestId("make-host-Bea").waitFor({ timeout: 10000 });
    await into(ada, "players-roles");
    await shot(ada, "01-menu-roles", view, "The host's room menu: players and roles, with Make cohost and Make host");
    await ada.getByTestId("make-host-Bea").click();
    await into(ada, "handover-confirm");
    await shot(ada, "02-confirm", view, "The confirmation names Bea and says what changes; Cancel or Make Bea the host");

    // An outcome the app can't confirm: both tries get no answer.
    await ada.route((url) => new URL(url).pathname.endsWith("/host"), (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()));
    await ada.getByTestId("handover-confirm-yes").click();
    await ada.getByTestId("handover-error").waitFor({ timeout: 20000 });
    await into(ada, "handover-error");
    await shot(ada, "03-uncertain", view, "No answer: the app couldn't confirm the handover and says to check the lobby (never 'failed')");
    await ada.unrouteAll({ behavior: "ignoreErrors" });

    // The handover itself.
    await ada.getByTestId("handover-confirm-yes").click();
    await ada.getByTestId("room-menu-sheet").waitFor({ state: "detached", timeout: 15000 });
    await ada.getByTestId("mz-room-notice").waitFor({ timeout: 10000 });
    await shot(ada, "04-old-host-lobby", view, "Ada's lobby right after: 'Bea is the host now. You're a player.' and she waits for Bea");
    await bea.getByTestId("mz-room-notice").waitFor({ timeout: 10000 });
    await shot(bea, "05-new-host-lobby", view, "Bea's lobby right after: 'Ada made you the host.' and the Start is hers");
    if (tv) { await tv.getByTestId("tv-host-tag").waitFor({ timeout: 10000 }); await shot(tv, "06-tv-new-host", view, "The TV marks Bea as host and says Bea starts the next game"); }

    // A player who isn't connected can't be chosen.
    await cal.context().close();
    await openMenu(bea);
    await bea.getByText("not connected").waitFor({ timeout: 20000 });
    await into(bea, "players-roles");
    await shot(bea, "07-not-connected", view, "Bea's menu: Cal isn't connected, so Make host isn't offered for Cal");
    await ada.context().close(); await bea.context().close(); if (tv) await tv.context().close();
  }
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  await new Promise((r) => srv.once("exit", r));
  rmSync(DATA, { recursive: true, force: true });
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.shots.length} screenshots in ${OUT} (revision ${REV.slice(0, 7)}${DIRTY ? ", working tree NOT clean" : ""})`);
