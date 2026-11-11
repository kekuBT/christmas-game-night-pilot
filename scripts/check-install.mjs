// Stage 8.3: the Home Screen installation foundation, end to end in Chromium
// (docs/stage8/stage83.md §5). Evidence kinds are labelled: "engine" checks
// use Chromium itself (its manifest parser, its installability verdict, a
// real service worker and Cache Storage); "emulated" checks fake a platform
// signal (an iPhone user agent, standalone display mode, the install prompt
// event). Real phones are the checklist's job (REAL_DEVICE_TESTING Part J).
//
//   M  install identity: the manifest as Chromium parses it, no install
//      errors, the icons at their sizes, the page's links, the build marker.
//   W  the worker's boundary, inspected: after solo play, a casual room with
//      a guest, and Memory Book, ledger and session reads, every Cache
//      Storage entry is a public shell file, no API reply ever came from the
//      worker, and no cached body holds a room id, code or token.
//   O  offline: Home, Join (a deep link), the solo shelf and a room each say
//      honestly what is wrong; nothing starts; back online, they recover.
//   I  install guidance: none without a real path; the browser's prompt only
//      when asked (its mini-infobar suppressed, also mid-round); "added" only
//      on appinstalled; iPhone steps; Not now holds (and, when storage can't
//      save it, only for the page); hidden when installed (standalone).
//   S  storage unavailable: the app, the worker and the guidance still work.
//   U  a new build while a round is in play (its own server, its own copy of
//      the build): the round carries on untouched (no reload, its old files
//      still served from its cache though the server dropped them); the
//      notice appears only on calm screens; Reload gives the new build; the
//      old cache goes once no old page is open; preferences, the solo seat
//      and a room seat survive.
//   N  deep links and reloads on a controlled page land on the same screen.
// Usage: node scripts/check-install.mjs <baseUrl>   (the gate passes its server)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";
import { contrastFailures } from "./lib/contrast.mjs";

const GATE_BASE = process.argv[2] ?? "http://localhost:3461";
const DIST = process.env.MCHEZO_WEB_DIST ?? join(process.cwd(), "apps", "web", "dist");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(fn, timeout = 15000, every = 200) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await sleep(every); }
  if (last) console.log(`  (waited ${timeout} ms; last error: ${String(last.message ?? last).split("\n")[0]})`);
  return null;
}

const PUBLIC_FILES = ["/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-192.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png", "/icons/mark.svg"];
const distAssets = new Set(readdirSync(join(DIST, "assets")).map((f) => `/assets/${f}`));
const buildOf = (html) => /<meta name="mchezo-build" content="([^"]+)"/.exec(html)?.[1] ?? null;
const BUILD = buildOf(readFileSync(join(DIST, "index.html"), "utf8"));

/** Make the page controlled by the worker: wait for it to be active, then reload once. */
async function controlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload({ waitUntil: "load" });
  return page.evaluate(() => !!navigator.serviceWorker.controller);
}
/** Every Cache Storage entry, by cache, as paths (with any query). */
const cacheContents = (page) => page.evaluate(async () => {
  const out = {};
  for (const name of await caches.keys()) {
    const c = await caches.open(name);
    out[name] = (await c.keys()).map((r) => { const u = new URL(r.url); return u.pathname + u.search; });
  }
  return out;
});
/** Ask a worker (waiting or active) for its build. */
const workerBuild = (page, which) => page.evaluate(async (w) => {
  const reg = await navigator.serviceWorker.getRegistration();
  const sw = w === "waiting" ? reg?.waiting : w === "installing" ? reg?.installing : reg?.active;
  if (!sw) return null;
  return await new Promise((res) => { const ch = new MessageChannel(); const t = setTimeout(() => res(null), 3000); ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data?.version ?? null); }; sw.postMessage({ type: "mchezo-version" }, [ch.port2]); });
}, which);
const pageBuild = (page) => page.evaluate(() => document.querySelector('meta[name="mchezo-build"]')?.getAttribute("content") ?? null);
const visible = async (page, testId) => (await page.getByTestId(testId).count()) > 0 && (await page.getByTestId(testId).first().isVisible());
/** Host a casual room from /host, as a person would; returns when the lobby is open. */
async function hostRoom(page, base, name) {
  await page.goto(`${base}/host`, { waitUntil: "load" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game", exact: true }).click();
  await page.waitForURL(/\/room$/, { timeout: 15000 });
}
/** Join with a code from an invite link, as a guest would. */
async function joinRoom(page, base, code, name) {
  await page.goto(`${base}/join?code=${code}`, { waitUntil: "load" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Join the game", exact: true }).click();
  await page.waitForURL(/\/room$/, { timeout: 15000 });
}

/** Start this driver's own server on a copy of the build it can swap. */
async function ownServer(webDist) {
  const dataDir = mkdtempSync(join(tmpdir(), "mz-s83-data-"));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: dataDir, MCHEZO_WEB_DIST: webDist };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_DIR;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  let port = null;
  for (let i = 0; i < 160 && port === null && child.exitCode === null; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
  if (!port) throw new Error(`own server did not start: ${out.slice(-400)}`);
  return { child, base: `http://localhost:${port}`, dataDir };
}
async function stopServer(s) {
  if (!s) return;
  if (s.child.exitCode === null) { s.child.kill("SIGTERM"); for (let i = 0; i < 40 && s.child.exitCode === null; i++) await sleep(100); if (s.child.exitCode === null) s.child.kill("SIGKILL"); }
  rmSync(s.dataDir, { recursive: true, force: true });
}

const browser = await launchChromium();
let own = null;
let liveDir = null;
try {
  check(`setup: the build under test carries its build marker (${BUILD})`, typeof BUILD === "string" && /^[0-9a-f]{16}$/.test(BUILD));

  // ---- M. Install identity ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    await p.getByTestId("home").waitFor({ timeout: 15000 });
    const links = await p.evaluate(() => ({
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
      apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
      icon: document.querySelector('link[rel="icon"]')?.getAttribute("href"),
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
      build: document.querySelector('meta[name="mchezo-build"]')?.getAttribute("content"),
    }));
    check("M the page links the manifest, the Apple touch icon and the favicon, and names the app for iOS", links.manifest === "/manifest.webmanifest" && links.apple === "/icons/apple-touch-icon.png" && links.icon === "/favicon.svg" && links.title === "Mchezo", JSON.stringify(links));
    check("M the page served is the build under test", links.build === BUILD, `${links.build} vs ${BUILD}`);
    const mres = await p.request.get(`${GATE_BASE}/manifest.webmanifest`);
    const manifest = await mres.json();
    check("M the manifest: application/manifest+json, always revalidated", mres.headers()["content-type"]?.startsWith("application/manifest+json") && mres.headers()["cache-control"] === "no-cache", JSON.stringify(mres.headers()));
    check("M the manifest: id, start_url and scope '/', standalone, Mchezo, the Everyday ground", manifest.id === "/" && manifest.start_url === "/" && manifest.scope === "/" && manifest.display === "standalone" && manifest.name === "Mchezo" && manifest.short_name === "Mchezo" && manifest.background_color === "#16111D");
    const sizes = await p.evaluate(async (srcs) => Promise.all(srcs.map((src) => new Promise((res) => { const im = new Image(); im.onload = () => res(`${im.naturalWidth}x${im.naturalHeight}`); im.onerror = () => res("error"); im.src = src; }))), [...manifest.icons.map((i) => i.src), "/icons/apple-touch-icon.png"]);
    check("M every icon decodes at its stated size (192, 512, maskable 192 and 512, Apple 180)", JSON.stringify(sizes) === JSON.stringify([...manifest.icons.map((i) => i.sizes), "180x180"]), JSON.stringify(sizes));
    const ok = await controlled(p);
    check("M engine: the service worker registers and controls the page after a reload", ok);
    const cdp = await ctx.newCDPSession(p);
    const am = await cdp.send("Page.getAppManifest");
    check("M engine: Chromium parses the manifest with no errors", am.url === `${GATE_BASE}/manifest.webmanifest` && Array.isArray(am.errors) && am.errors.length === 0, JSON.stringify(am.errors));
    const inst = await cdp.send("Page.getInstallabilityErrors").catch((e) => ({ installabilityErrors: [{ errorId: String(e) }] }));
    check("M engine: Chromium reports no installability errors (headless; a real phone's install is checklist J1/J2)", inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
    check("M the worker belongs to this build", (await workerBuild(p, "active")) === BUILD);
    const sw = await p.request.get(`${GATE_BASE}/sw.js`);
    check("M /sw.js: JavaScript, never cached by HTTP (updates are always seen)", sw.headers()["content-type"]?.startsWith("text/javascript") && sw.headers()["cache-control"] === "no-cache");
    const missing = await p.request.get(`${GATE_BASE}/assets/not-in-this-build.js`);
    check("M a file the build doesn't have is a 404 (no stand-in page for a cache to keep)", missing.status() === 404);
    await ctx.close();
  }

  // ---- W. The worker's boundary, inspected (solo, a casual room with a guest, Memory Book and ledger reads) ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const fromWorker = [];
    const apiSeen = [];
    ctx.on("response", (r) => {
      const u = new URL(r.url());
      if (u.origin !== GATE_BASE) return;
      const api = /^\/(rooms|games|health)(\/|$)/.test(u.pathname);
      if (api) apiSeen.push(`${r.request().method()} ${u.pathname}`);
      if (r.fromServiceWorker()) fromWorker.push(u.pathname + u.search);
    });
    const host = await ctx.newPage();
    await host.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    check("W setup: controlled", await controlled(host));
    // Solo: a Word Connections round, one guess.
    await host.goto(`${GATE_BASE}/solo`, { waitUntil: "load" });
    await host.getByTestId("solo-start-word-connections").click();
    await host.getByTestId("mz-cx").waitFor({ timeout: 20000 });
    const tiles = host.getByTestId("mz-cx-tile");
    for (let i = 0; i < 4; i++) await tiles.nth(i).click();
    await host.getByTestId("mz-cx-submit").click();
    await sleep(800);
    // A casual room: host here, a guest in another tab of the same device (its own tab session).
    await hostRoom(host, GATE_BASE, "Ada");
    const room = await host.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), token: sessionStorage.getItem("cgn_token") }));
    const code = await soon(() => host.evaluate(async (id) => { const r = await fetch(`/rooms/${id}`); return r.ok ? (await r.json()).joinCode ?? null : null; }, room.roomId));
    const guest = await ctx.newPage();
    await joinRoom(guest, GATE_BASE, code, "Bea");
    const gtoken = await guest.evaluate(() => sessionStorage.getItem("cgn_token"));
    // The private reads the app makes (session, ledger, Memory Book), with the seat's token, as the app sends it.
    const reads = await host.evaluate(async ({ id, token }) => {
      const h = { "x-session-token": token };
      const out = [];
      for (const path of [`/rooms/${id}/session`, `/rooms/${id}/ledger`, `/rooms/${id}/memory`, `/rooms/${id}/projection?audience=player`]) { const r = await fetch(path, { headers: h }); out.push(r.status); }
      return out;
    }, { id: room.roomId, token: room.token });
    check("W setup: the room's private reads succeeded with the seat's token (session, ledger, Memory Book, projection)", reads.length === 4 && reads.every((s) => s === 200), JSON.stringify(reads));
    await sleep(500);
    const contents = await cacheContents(host);
    const names = Object.keys(contents);
    const entries = Object.values(contents).flat();
    check(`W engine: exactly one cache, this build's shell (mchezo-shell-${BUILD})`, names.length === 1 && names[0] === `mchezo-shell-${BUILD}`, JSON.stringify(names));
    const bad = entries.filter((e) => !(e === "/index.html" || PUBLIC_FILES.includes(e) || distAssets.has(e)));
    check(`W engine: every one of the ${entries.length} cached entries is a public shell file of this build (no API path, no query)`, entries.length > 0 && bad.length === 0, bad.slice(0, 5).join(", "));
    const secrets = [room.roomId, room.token, gtoken, code].filter(Boolean);
    const leaks = await host.evaluate(async (needles) => {
      const found = [];
      for (const name of await caches.keys()) {
        const c = await caches.open(name);
        for (const req of await c.keys()) {
          const res = await c.match(req);
          const type = res.headers.get("content-type") ?? "";
          if (!/text|javascript|json|svg|manifest/.test(type)) continue;
          const body = await res.text();
          for (const n of needles) if (body.includes(n)) found.push(`${new URL(req.url).pathname} holds ${n.slice(0, 6)}…`);
        }
      }
      return found;
    }, secrets);
    check("W engine: no cached body holds the room's id, code or either seat's token", leaks.length === 0, leaks.join("; "));
    const apiFromWorker = fromWorker.filter((p) => /^\/(rooms|games|health)(\/|\?|$)/.test(p));
    check(`W engine: none of the ${apiSeen.length} API replies came from the worker (all from the network)`, apiSeen.length > 10 && apiFromWorker.length === 0, apiFromWorker.slice(0, 3).join(", "));
    check("W engine: the worker did answer shell files (it is really there)", fromWorker.some((p) => p.startsWith("/assets/") || p === "/" || p === "/room" || p === "/solo" || p.startsWith("/join")), fromWorker.slice(0, 3).join(", "));
    await ctx.close();
  }

  // ---- O. Offline: honest screens, nothing started, recovery ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    await controlled(p);
    // A room seat in this tab, to reload offline later.
    const r = await p.evaluate(async () => {
      const room = await (await fetch("/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Offline test", kind: "casual" }) })).json();
      return room;
    });
    check("O setup: online, Home has no offline notice", !(await visible(p, "offline-notice")));
    await ctx.setOffline(true);
    await p.reload({ waitUntil: "load" });
    await p.getByTestId("home").waitFor({ timeout: 10000 });
    check("O offline: Home still opens (the cached shell) and says Mchezo can't be reached, solo rounds included, nothing started", await soon(() => visible(p, "offline-notice"), 8000) !== null && /solo rounds included/.test(await p.getByTestId("offline-notice").innerText()) && /Nothing has started/.test(await p.getByTestId("offline-notice").innerText()));
    await p.getByTestId("offline-retry").click();
    await sleep(800);
    check("O offline: Try again while still offline keeps the notice (no false recovery)", await visible(p, "offline-notice"));
    await p.goto(`${GATE_BASE}/join?code=${r.joinCode ?? "ABCDEF"}`, { waitUntil: "load" });
    check("O offline: an invite link (/join?code=) opens Join, says Mchezo can't be reached", (await soon(() => visible(p, "join-screen"), 8000)) !== null && (await soon(() => visible(p, "offline-notice"), 8000)) !== null);
    await p.goto(`${GATE_BASE}/solo`, { waitUntil: "load" });
    await p.getByTestId("solo-home").waitFor({ timeout: 10000 });
    check("O offline: the solo shelf says so too", (await soon(() => visible(p, "offline-notice"), 8000)) !== null);
    await p.getByTestId("solo-start-math-mayhem").click();
    await sleep(2500);
    const roundShown = await visible(p, "solo-round");
    const err = (await p.getByTestId("solo-error").count()) ? await p.getByTestId("solo-error").innerText() : "";
    check("O offline: pressing Start shows no round and says why", !roundShown && err.length > 0, err.slice(0, 120));
    await ctx.setOffline(false);
    await p.getByTestId("offline-retry").click().catch(() => {});
    check("O back online: the notice goes", (await soon(async () => !(await visible(p, "offline-notice")), 10000)) !== null);
    // A room seat, reloaded offline: honest "rejoining", then the same seat when online.
    await hostRoom(p, GATE_BASE, "Ola");
    const seat = await p.evaluate(() => sessionStorage.getItem("cgn_playerId"));
    await ctx.setOffline(true);
    await p.reload({ waitUntil: "load" });
    const offlineRoom = await soon(async () => { const t = await p.locator("body").innerText(); return /Reconnecting|Rejoining/i.test(t) ? t : null; }, 10000);
    check("O offline: a room reloaded offline opens and says it is reconnecting (no game claimed)", !!offlineRoom, (offlineRoom ?? "").slice(0, 120).replace(/\n/g, " | "));
    await ctx.setOffline(false);
    const back = await soon(async () => /You’re in, Ola/.test(await p.locator("body").innerText()), 20000);
    check("O back online: the same seat in the same room, no new seat", !!back && (await p.evaluate(() => sessionStorage.getItem("cgn_playerId"))) === seat);
    await ctx.close();
  }

  // ---- I. Install guidance ----
  // Emulated install prompt (Chromium's event, faked): the page gets it ~200 ms after load unless o is "none".
  // (Serialized into the page: it may use only its argument.)
  const bip = () => (o) => {
    window.__mzPrompted = 0;
    const fire = () => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      e.prompt = async () => { window.__mzPrompted++; };
      e.userChoice = Promise.resolve({ outcome: o, platform: "web" });
      window.dispatchEvent(e);
      window.__mzBipPrevented = e.defaultPrevented;
    };
    window.__mzFireBip = fire;
    if (o !== "none") window.addEventListener("load", () => setTimeout(fire, 200));
  };
  {
    // I1: Chromium with no prompt offered (headless never offers one): no Home card; Settings explains the browser's menu.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    await p.getByTestId("home").waitFor();
    await sleep(600);
    check("I no real path (no prompt, not an iPhone): Home shows no install card", !(await visible(p, "install-card")));
    await p.getByTestId("home-settings").click();
    check("I Settings → Add to Home Screen explains the browser's own menu", await visible(p, "install-steps-menu"));
    await ctx.close();
  }
  for (const outcome of ["accepted", "dismissed"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(bip(), outcome);
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    await p.getByTestId("install-card").waitFor({ timeout: 10000 });
    check(`I emulated prompt (${outcome}): the browser's mini-infobar is suppressed (preventDefault)`, await p.evaluate(() => window.__mzBipPrevented === true));
    check(`I emulated prompt (${outcome}): Home offers Install Mchezo; nothing was shown until asked`, (await visible(p, "install-prompt")) && (await p.evaluate(() => window.__mzPrompted)) === 0);
    await p.getByTestId("install-prompt").click();
    await sleep(400);
    check(`I emulated prompt (${outcome}): pressing Install shows the browser's prompt once`, (await p.evaluate(() => window.__mzPrompted)) === 1);
    if (outcome === "accepted") {
      check("I accepted: says to follow the browser, never 'added' before the browser says so", (await visible(p, "install-accepted")) && !(await visible(p, "install-done")));
      await p.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
      check("I appinstalled: only now says Mchezo is added", await soon(() => visible(p, "install-done"), 3000) !== null);
    } else {
      check("I dismissed: no install claim; says it can be added later from the menu", (await visible(p, "install-dismissed")) && !(await visible(p, "install-done")) && !(await visible(p, "install-accepted")));
    }
    await ctx.close();
  }
  {
    // I: never during play: a prompt offered mid-round is held, with nothing on the round's screen.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(bip(), "none");
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/solo`, { waitUntil: "load" });
    await p.getByTestId("solo-start-word-connections").click();
    await p.getByTestId("mz-cx").waitFor({ timeout: 20000 });
    await p.evaluate(() => window.__mzFireBip());
    await sleep(500);
    check("I mid-round: the browser's own prompt is suppressed and the round shows no install UI", (await p.evaluate(() => window.__mzBipPrevented === true)) && !(await visible(p, "install-card")) && !(await visible(p, "install-prompt")));
    await ctx.close();
  }
  for (const look of ["everyday", "christmas"]) {
    // I: an iPhone (emulated user agent): the card and the Share steps, in both looks; contrast and fit.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", hasTouch: true, isMobile: true });
    await ctx.addInitScript((v) => { try { localStorage.setItem("mz_look", v); } catch { /* none */ } }, look);
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    await p.getByTestId("install-card").waitFor({ timeout: 10000 });
    await p.getByTestId("install-card").scrollIntoViewIfNeeded();
    const fit = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [...document.querySelectorAll('[data-testid="install-card"] button')].map((b) => b.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length }));
    const bad = await contrastFailures(p);
    check(`I iPhone (emulated), ${look} look: the card offers Show me how; no sideways overflow, 44 px targets, readable contrast`, (await visible(p, "install-how")) && fit.over <= 1 && fit.small === 0 && bad.length === 0, JSON.stringify({ ...fit, contrast: bad.slice(0, 2) }));
    await p.getByTestId("install-how").click();
    const sheet = p.getByTestId("install-sheet");
    await sheet.waitFor();
    const steps = await sheet.innerText();
    check(`I iPhone, ${look} look: the sheet's steps say Share, Add to Home Screen, Add, and that the app keeps its own data`, /Share/.test(steps) && /Add to Home Screen/.test(steps) && /\bAdd\b/.test(steps) && /keeps its own data/.test(steps) && (await sheet.getByRole("dialog").count()) === 1);
    await p.keyboard.press("Escape");
    check(`I iPhone, ${look} look: the sheet closes with Escape`, (await soon(async () => (await p.getByTestId("install-sheet").count()) === 0, 3000)) !== null);
    if (look === "everyday") {
      await p.getByTestId("install-not-now").click();
      check("I Not now: the card goes", !(await visible(p, "install-card")));
      await p.reload({ waitUntil: "load" });
      await p.getByTestId("home").waitFor();
      await sleep(500);
      check("I Not now holds after a reload (saved on this device)", !(await visible(p, "install-card")));
      await p.getByTestId("home-settings").click();
      check("I Settings still offers the steps after Not now", await visible(p, "install-steps-ios"));
    }
    await ctx.close();
  }
  {
    // I: Not now when storage can't save it: hidden for this page only (it never claims to remember).
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
    await ctx.addInitScript(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === window.localStorage) throw new DOMException("The quota has been exceeded.", "QuotaExceededError"); return orig.call(this, k, v); }; });
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    await p.getByTestId("install-card").waitFor({ timeout: 10000 });
    await p.getByTestId("install-not-now").click();
    check("I storage can't save: Not now still hides the card for this page", !(await visible(p, "install-card")));
    await p.reload({ waitUntil: "load" });
    check("I storage can't save: after a reload the card is back (nothing was kept, nothing claimed)", (await soon(() => visible(p, "install-card"), 8000)) !== null);
    await ctx.close();
  }
  for (const how of ["display-mode", "navigator.standalone"]) {
    // I: running installed (standalone): no card, and Settings says so. Chromium's own display-mode emulation where it has it.
    // An iPhone user agent and an offered prompt, so the card WOULD show if the app weren't running installed.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
    await ctx.addInitScript(bip(), "offered");
    let label = how;
    if (how === "navigator.standalone") await ctx.addInitScript(() => { Object.defineProperty(navigator, "standalone", { value: true }); });
    const p = await ctx.newPage();
    if (how === "display-mode") {
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] }).catch(() => {});
      await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
      if (!(await p.evaluate(() => matchMedia("(display-mode: standalone)").matches))) {
        label = "display-mode (script-emulated)";
        await ctx.addInitScript(() => {
          const orig = window.matchMedia.bind(window);
          window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q)
            ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }
            : orig(q));
        });
        await p.reload({ waitUntil: "load" });
      } else label = "display-mode (Chromium's media emulation)";
    } else {
      await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    }
    await p.getByTestId("home").waitFor();
    await sleep(500);
    check(`I installed (${label}): Home shows no install card`, !(await visible(p, "install-card")));
    await p.getByTestId("home-settings").click();
    check(`I installed (${label}): Settings says it is the Home Screen app`, await visible(p, "install-settings-standalone"));
    await ctx.close();
  }

  // ---- S. Storage unavailable (every localStorage access throws) ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => {
      for (const m of ["getItem", "setItem", "removeItem"]) { const orig = Storage.prototype[m]; Storage.prototype[m] = function (...a) { if (this === window.localStorage) throw new DOMException("denied", "SecurityError"); return orig.apply(this, a); }; }
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    await p.getByTestId("home").waitFor({ timeout: 10000 });
    const ok = await controlled(p);
    check("S storage unavailable: Home opens, the worker still registers and controls, no page errors", ok && errors.length === 0, errors.slice(0, 2).join(" | "));
    await p.goto(`${GATE_BASE}/solo`, { waitUntil: "load" });
    await p.getByTestId("solo-start-word-connections").click();
    check("S storage unavailable: a solo round still starts", (await soon(() => visible(p, "mz-cx"), 20000)) !== null);
    await ctx.close();
  }

  // ---- N. Deep links and reloads on a controlled page ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${GATE_BASE}/`, { waitUntil: "load" });
    await controlled(p);
    for (const [path, testId] of [["/solo/word-connections", "solo-ready"], ["/library", null], ["/join?code=ABC123", "join-screen"], ["/solo", "solo-home"], ["/", "home"]]) {
      await p.goto(`${GATE_BASE}${path}`, { waitUntil: "load" });
      if (testId) await p.getByTestId(testId).waitFor({ timeout: 10000 }); else await p.getByRole("heading", { name: "All games" }).waitFor({ timeout: 10000 });
      await p.reload({ waitUntil: "load" });
      const again = testId ? await soon(() => visible(p, testId), 8000) : await soon(() => p.getByRole("heading", { name: "All games" }).isVisible(), 8000);
      check(`N controlled: ${path} opens and reloads to the same screen (served fresh: network first)`, again !== null && (await pageBuild(p)) === BUILD && new URL(p.url()).pathname + new URL(p.url()).search === path);
    }
    const code = await p.goto(`${GATE_BASE}/join?code=QWERTY`, { waitUntil: "load" }).then(() => p.locator("input").first().inputValue().catch(() => ""));
    check("N an invite link still fills in its code", /QWERTY/i.test(code), code);
    await ctx.close();
  }

  // ---- U. A new build while a round is in play (its own server and its own copy of the build) ----
  {
    liveDir = mkdtempSync(join(tmpdir(), "mz-s83-live-"));
    cpSync(DIST, liveDir, { recursive: true });
    const v1Html = readFileSync(join(liveDir, "index.html"), "utf8");
    const V1 = buildOf(v1Html);
    const mainOld = /src="\/assets\/(index-[^"]+\.js)"/.exec(v1Html)?.[1];
    const V2 = createHash("sha256").update(`${V1}:next`).digest("hex").slice(0, 16);
    const mainNew = `index-next${V2.slice(0, 6)}.js`;
    own = await ownServer(liveDir);
    const B = own.base;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const home = await ctx.newPage();
    await home.goto(`${B}/`, { waitUntil: "load" });
    check("U setup: controlled by this build's worker", (await controlled(home)) && (await workerBuild(home, "active")) === V1);
    // Preferences and seats to keep: a pinned look, the solo content, a room seat in another tab.
    await home.getByTestId("home-settings").click();
    await home.getByTestId("look-christmas").click();
    await home.keyboard.press("Escape");
    const roomTab = await ctx.newPage();
    await hostRoom(roomTab, B, "Uma");
    const roomSeat = await roomTab.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId") }));
    const round = await ctx.newPage();
    await round.goto(`${B}/solo`, { waitUntil: "load" });
    await round.getByTestId("solo-content-christmas").click();
    await round.getByTestId("solo-start-word-connections").click();
    await round.getByTestId("mz-cx").waitFor({ timeout: 20000 });
    await round.evaluate(() => { window.__mzMarker = "still-the-same-page"; });
    const local = () => home.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith("mz_") || k.startsWith("cgn_") || k.startsWith("mchezo")).sort().map((k) => [k, localStorage.getItem(k)])));
    const localBefore = await local();
    // The deploy: the next build replaces the files on the server (its main file renamed, the old one gone).
    const v2Main = readFileSync(join(liveDir, "assets", mainOld), "utf8") + "\n/* the next build */\n";
    writeFileSync(join(liveDir, "assets", mainNew), v2Main);
    writeFileSync(join(liveDir, "index.html"), v1Html.split(V1).join(V2).split(mainOld).join(mainNew));
    writeFileSync(join(liveDir, "sw.js"), readFileSync(join(liveDir, "sw.js"), "utf8").split(V1).join(V2).split(mainOld).join(mainNew));
    unlinkSync(join(liveDir, "assets", mainOld));
    check("U setup: the server now serves the next build and no longer has the old main file", (await (await fetch(`${B}/assets/${mainOld}`)).status) === 404 && buildOf(await (await fetch(`${B}/`)).text()) === V2);
    await home.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    const waiting = await soon(() => workerBuild(home, "waiting").then((v) => (v === V2 ? v : null)), 15000);
    check("U the next build's worker installs and waits (no skipWaiting); the old one stays active", waiting === V2 && (await workerBuild(home, "active")) === V1);
    // The round in play: untouched.
    check("U the round in play was not reloaded and is still the old build", (await round.evaluate(() => window.__mzMarker)) === "still-the-same-page" && (await pageBuild(round)) === V1);
    const tiles = round.getByTestId("mz-cx-tile");
    for (let i = 0; i < 4; i++) await tiles.nth(i).click();
    await round.getByTestId("mz-cx-submit").click();
    check("U the round keeps playing: a guess is answered by the server", (await soon(() => round.getByTestId("mz-cx-feedback").count().then((n) => n > 0), 8000)) !== null || (await soon(() => visible(round, "mz-cx-band"), 3000)) !== null);
    const oldFile = await round.evaluate(async (f) => (await fetch(`/assets/${f}`)).status, mainOld);
    check("U the old page's own files still come from its cache, though the server dropped them", oldFile === 200);
    check("U no update notice in the round", !(await visible(round, "update-notice")));
    // Leave the round deliberately, in-app: the same old-build page, now on the shelf (a calm screen).
    await round.getByTestId("solo-leave").click();
    await round.getByTestId("solo-leave-yes").click();
    await round.locator('main[data-testid="solo-home"]').waitFor({ timeout: 10000 });
    check("U back on the shelf (in-app, the same old page): the update is offered", (await round.evaluate(() => window.__mzMarker)) === "still-the-same-page" && (await soon(() => visible(round, "update-notice"), 8000)) !== null);
    await round.getByTestId("update-later").click();
    check("U Later hides it for this page", !(await visible(round, "update-notice")));
    check("U Home (another old-build tab) offers it too", (await soon(() => visible(home, "update-notice"), 8000)) !== null);
    const targets = await home.evaluate(() => [...document.querySelectorAll('[data-testid="update-notice"] button')].map((b) => { const r = b.getBoundingClientRect(); return [b.textContent?.trim(), Math.round(r.width), Math.round(r.height)]; }));
    check("U the notice's Reload and Later are 44 px targets", targets.length === 2 && targets.every(([, w, h]) => w >= 44 && h >= 44), JSON.stringify(targets));
    await Promise.all([home.waitForEvent("load"), home.getByTestId("update-reload").click()]);
    check("U the notice's Reload reloads only its own tab, onto the next build", (await pageBuild(home)) === V2 && (await round.evaluate(() => window.__mzMarker)) === "still-the-same-page" && (await pageBuild(round)) === V1);
    // A page loaded now is network-first: it is already the next build, so it offers nothing.
    await round.goto(`${B}/solo`, { waitUntil: "load" });
    check("U a page loaded now is already the next build, and offers no update", (await pageBuild(round)) === V2 && !(await visible(round, "update-notice")));
    await round.getByTestId("solo-start-word-connections").click();
    check("U solo replay on the next build: a round starts with the same solo seat", (await soon(() => visible(round, "mz-cx"), 20000)) !== null);
    const localAfter = await local();
    check("U preferences and the solo seat survived the update (localStorage unchanged)", JSON.stringify(localAfter) === JSON.stringify(localBefore) && localAfter["mz_look"] === "christmas", JSON.stringify(Object.keys(localAfter)));
    await roomTab.reload({ waitUntil: "load" });
    const rejoined = await soon(async () => /You’re in, Uma/.test(await roomTab.locator("body").innerText()), 15000);
    check("U the room tab, reloaded onto the next build: the same seat in the same room", !!rejoined && JSON.stringify(await roomTab.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId") }))) === JSON.stringify(roomSeat));
    // Every old-worker page closed: the next worker activates, and only its cache remains.
    await home.close(); await round.close(); await roomTab.close();
    const fresh = await ctx.newPage();
    await fresh.goto(`${B}/`, { waitUntil: "load" });
    const active = await soon(() => workerBuild(fresh, "active").then((v) => (v === V2 ? v : null)), 15000);
    if (!(await fresh.evaluate(() => !!navigator.serviceWorker.controller))) await fresh.reload({ waitUntil: "load" });
    const caches2 = await cacheContents(fresh);
    check("U once no old page is open, the next worker is active and controls new pages", active === V2 && (await fresh.evaluate(() => !!navigator.serviceWorker.controller)));
    check("U the old build's cache is gone; only the next build's remains", JSON.stringify(Object.keys(caches2)) === JSON.stringify([`mchezo-shell-${V2}`]), JSON.stringify(Object.keys(caches2)));
    check("U the next build's cache holds its own main file, not the old one", caches2[`mchezo-shell-${V2}`]?.includes(`/assets/${mainNew}`) && !caches2[`mchezo-shell-${V2}`]?.includes(`/assets/${mainOld}`));
    check("U preferences still there after the old cache was cleaned", (await fresh.evaluate(() => localStorage.getItem("mz_look"))) === "christmas");
    await ctx.close();
    await stopServer(own); own = null;
  }
} catch (e) {
  check("no unexpected error", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await stopServer(own).catch(() => {});
  if (liveDir) rmSync(liveDir, { recursive: true, force: true });
  await browser.close();
}

console.log(failures ? `\n${failures} install check(s) FAILED` : "\nAll install checks passed");
process.exit(failures ? 1 : 0);
