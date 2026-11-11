// Stage 8.3: pictures of the install guidance, the offline and update
// notices, and a raw inventory of what the service worker keeps
// (docs/stage8/stage83.md §5). Visual evidence only: check-install is the check.
//
// Run from the checkout after `npm run build:web`; it starts ITS OWN server
// on a copy of that build (so it can also put a "next build" in place for
// the update notice):
//   node scripts/screenshot-stage83.mjs --out <dir>
// Writes <dir>/*.png, <dir>/manifest.json (exact revision, what each shot is,
// how the platform was emulated) and <dir>/cache-inventory.json.
import { execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", join("docs", "stage8", "screenshots-83"));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
const DIRTY = execSync("git status --porcelain --untracked-files=no -- . ':!docs'").toString().trim() !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const manifest = { revision: REV, codeOutsideDocsClean: !DIRTY, capturedAt: new Date().toISOString(), by: "scripts/screenshot-stage83.mjs", note: "Chromium headless (Playwright) only. 'emulated' = a platform signal faked (an iPhone user agent, the install prompt event, standalone display mode); the service worker, Cache Storage and offline are the real engine's. Not a real phone, not WebKit.", shots: [] };

const live = mkdtempSync(join(tmpdir(), "mz-shot83-live-"));
cpSync(join("apps", "web", "dist"), live, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), "mz-shot83-data-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: dataDir, MCHEZO_WEB_DIST: live };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_DIR;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let B = "";
for (let i = 0; i < 160 && !B; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) B = `http://localhost:${m[1]}`; else await sleep(250); }
if (!B) throw new Error(`server did not start: ${out.slice(-300)}`);

async function settle(page) {
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming?.().iterations !== Infinity).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1500))]));
  await sleep(250);
}
async function shot(page, name, what, emulated, look) {
  await settle(page);
  const vp = page.viewportSize();
  const file = `${name}-${look}-${vp.width}x${vp.height}.png`;
  await page.screenshot({ path: join(OUT, file) });
  const rendered = await page.evaluate(() => document.documentElement.dataset.mzTheme ?? "everyday");
  manifest.shots.push({ file, screen: what, viewport: `${vp.width}×${vp.height}`, look, rendered, emulated });
}
const bip = (o) => {
  window.addEventListener("load", () => setTimeout(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: o, platform: "web" });
    window.dispatchEvent(e);
  }, 200));
};
const lookInit = (v) => { try { localStorage.setItem("mz_look", v); } catch { /* none */ } };
const controlled = async (p) => { await p.evaluate(() => navigator.serviceWorker.ready.then(() => true)); if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) await p.reload({ waitUntil: "load" }); };

const browser = await launchChromium();
try {
  for (const look of ["everyday", "christmas"]) {
    for (const vp of [{ width: 320, height: 640 }, { width: 390, height: 844 }]) {
      // iPhone: the card (scrolled into view) and the steps.
      {
        const ctx = await browser.newContext({ viewport: vp, userAgent: IPHONE, isMobile: true, hasTouch: true });
        await ctx.addInitScript(lookInit, look);
        const p = await ctx.newPage();
        await p.goto(`${B}/`, { waitUntil: "load" });
        await p.getByTestId("install-card").waitFor({ timeout: 10000 });
        await p.getByTestId("install-card").scrollIntoViewIfNeeded();
        await shot(p, "01-home-install-card-iphone", "Home, the install card on an iPhone (below the games)", "iPhone user agent", look);
        await p.getByTestId("install-how").click();
        await p.getByTestId("install-sheet").waitFor();
        await shot(p, "02-install-steps-iphone", "Show me how: the Share → Add to Home Screen → Add steps", "iPhone user agent", look);
        await p.keyboard.press("Escape");
        await p.getByTestId("home-settings").click();
        await p.getByTestId("install-settings").scrollIntoViewIfNeeded();
        await shot(p, "03-settings-add-to-home-screen-iphone", "Settings → Add to Home Screen (iPhone)", "iPhone user agent", look);
        await ctx.close();
      }
      if (vp.width === 390) {
        // Chromium: the prompt offered, then accepted (no "added" until the browser says so).
        const ctx = await browser.newContext({ viewport: vp });
        await ctx.addInitScript(lookInit, look);
        await ctx.addInitScript(bip, "accepted");
        const p = await ctx.newPage();
        await p.goto(`${B}/`, { waitUntil: "load" });
        await p.getByTestId("install-card").waitFor({ timeout: 10000 });
        await p.getByTestId("install-card").scrollIntoViewIfNeeded();
        await shot(p, "04-home-install-card-chromium", "Home, Chromium offered its install prompt: Install Mchezo", "beforeinstallprompt event", look);
        await p.getByTestId("install-prompt").click();
        await p.getByTestId("install-accepted").waitFor();
        await p.getByTestId("install-accepted").scrollIntoViewIfNeeded();
        await shot(p, "05-home-install-accepted", "After the browser's prompt was accepted: follow your browser (no success claim yet)", "beforeinstallprompt event", look);
        await ctx.close();
        // Running installed: Settings says so.
        const sctx = await browser.newContext({ viewport: vp, userAgent: IPHONE, isMobile: true, hasTouch: true });
        await sctx.addInitScript(lookInit, look);
        await sctx.addInitScript(() => { Object.defineProperty(navigator, "standalone", { value: true }); });
        const s = await sctx.newPage();
        await s.goto(`${B}/`, { waitUntil: "load" });
        await s.getByTestId("home-settings").click();
        await s.getByTestId("install-settings-standalone").scrollIntoViewIfNeeded();
        await shot(s, "06-settings-standalone", "Opened from the Home Screen: no install card; Settings says so", "navigator.standalone on an iPhone user agent", look);
        await sctx.close();
      }
      // Offline: Home and an invite link (a tab with no seat), then a room reloaded offline.
      {
        const ctx = await browser.newContext({ viewport: vp });
        await ctx.addInitScript(lookInit, look);
        const p = await ctx.newPage();
        await p.goto(`${B}/`, { waitUntil: "load" });
        await controlled(p);
        await ctx.setOffline(true);
        await p.reload({ waitUntil: "load" });
        await p.getByTestId("offline-notice").waitFor({ timeout: 10000 });
        await shot(p, "07-home-offline", "Home with no connection: Can't reach Mchezo, Try again", "none (real offline)", look);
        await p.goto(`${B}/join?code=ABCDEF`, { waitUntil: "load" });
        await p.getByTestId("offline-notice").waitFor({ timeout: 10000 });
        await shot(p, "08-join-link-offline", "An invite link opened with no connection", "none (real offline)", look);
        await ctx.setOffline(false);
        await p.goto(`${B}/host`, { waitUntil: "load" });
        await p.getByPlaceholder("e.g. Auntie June").fill("Ada");
        await p.getByRole("button", { name: "Host a game", exact: true }).click();
        await p.waitForURL(/\/room$/, { timeout: 15000 });
        await ctx.setOffline(true);
        await p.reload({ waitUntil: "load" });
        await sleep(2500);
        await shot(p, "09-room-reloaded-offline", "A room reloaded with no connection: rejoining, seat saved on the server", "none (real offline)", look);
        await ctx.close();
      }
    }
  }

  // The update notice: a real next build put in place while a page of the old one is open.
  {
    const v1Html = readFileSync(join(live, "index.html"), "utf8");
    const V1 = /<meta name="mchezo-build" content="([^"]+)"/.exec(v1Html)[1];
    const mainOld = /src="\/assets\/(index-[^"]+\.js)"/.exec(v1Html)[1];
    const V2 = createHash("sha256").update(`${V1}:next`).digest("hex").slice(0, 16);
    const mainNew = `index-next${V2.slice(0, 6)}.js`;
    const pages = [];
    for (const look of ["everyday", "christmas"]) for (const vp of [{ width: 320, height: 640 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(lookInit, look);
      const p = await ctx.newPage();
      await p.goto(`${B}/solo`, { waitUntil: "load" });
      await controlled(p);
      pages.push({ ctx, p, look });
    }
    writeFileSync(join(live, "assets", mainNew), readFileSync(join(live, "assets", mainOld), "utf8") + "\n/* the next build */\n");
    writeFileSync(join(live, "index.html"), v1Html.split(V1).join(V2).split(mainOld).join(mainNew));
    writeFileSync(join(live, "sw.js"), readFileSync(join(live, "sw.js"), "utf8").split(V1).join(V2).split(mainOld).join(mainNew));
    unlinkSync(join(live, "assets", mainOld));
    for (const { ctx, p, look } of pages) {
      await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
      await p.getByTestId("update-notice").waitFor({ timeout: 15000 });
      await shot(p, "10-solo-shelf-update-ready", "The solo shelf when a newer build is waiting: Reload or Later", "none (a real next build)", look);
      await ctx.close();
    }
    // Put the build back for the inventory below.
    cpSync(join("apps", "web", "dist"), live, { recursive: true, force: true });
    rmSync(join(live, "assets", mainNew), { force: true });
  }

  // Raw cache inventory after solo play and a casual room with a guest, and where every API reply came from.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const replies = [];
    ctx.on("response", (r) => { const u = new URL(r.url()); if (u.origin === B) replies.push({ method: r.request().method(), path: u.pathname, status: r.status(), fromServiceWorker: r.fromServiceWorker() }); });
    const p = await ctx.newPage();
    await p.goto(`${B}/`, { waitUntil: "load" });
    await controlled(p);
    await p.goto(`${B}/solo`, { waitUntil: "load" });
    await p.getByTestId("solo-start-word-connections").click();
    await p.getByTestId("mz-cx").waitFor({ timeout: 20000 });
    await p.goto(`${B}/host`, { waitUntil: "load" });
    await p.getByPlaceholder("e.g. Auntie June").fill("Ada");
    await p.getByRole("button", { name: "Host a game", exact: true }).click();
    await p.waitForURL(/\/room$/, { timeout: 15000 });
    const roomId = await p.evaluate(() => sessionStorage.getItem("cgn_roomId"));
    const code = await p.evaluate(async (id) => (await (await fetch(`/rooms/${id}`)).json()).joinCode, roomId);
    const g = await ctx.newPage();
    await g.goto(`${B}/join?code=${code}`, { waitUntil: "load" });
    await g.getByPlaceholder("e.g. Auntie June").fill("Bea");
    await g.getByRole("button", { name: "Join the game", exact: true }).click();
    await g.waitForURL(/\/room$/, { timeout: 15000 });
    await sleep(1000);
    const caches = await p.evaluate(async () => {
      const outc = {};
      for (const n of await caches.keys()) { const c = await caches.open(n); outc[n] = await Promise.all((await c.keys()).map(async (r) => { const res = await c.match(r); return { url: new URL(r.url).pathname + new URL(r.url).search, type: res.headers.get("content-type"), bytes: (await res.clone().arrayBuffer()).byteLength }; })); }
      return outc;
    });
    const api = replies.filter((r) => /^\/(rooms|games|health)(\/|$)/.test(r.path));
    writeFileSync(join(OUT, "cache-inventory.json"), JSON.stringify({
      revision: REV, capturedAt: new Date().toISOString(),
      what: "Every Cache Storage entry after a solo round and a casual room joined by a guest (the same device, two tabs), and every API reply with whether the service worker answered it.",
      caches,
      apiReplies: { total: api.length, fromServiceWorker: api.filter((r) => r.fromServiceWorker).length, list: api },
    }, null, 2) + "\n");
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
  rmSync(live, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.shots.length} screenshots and cache-inventory.json in ${OUT} (revision ${REV.slice(0, 7)}${DIRTY ? ", code NOT clean" : ""})`);
