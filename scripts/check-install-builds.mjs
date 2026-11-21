// Stage 8.3 repair R83-01 (review 6805055962; docs/stage8/stage83.md §7.6):
// service worker updates between REAL builds of this checkout, end to end in
// Chromium. The app is built with the real build (Vite and apps/web/swBuild.ts)
// from copies of this checkout's source, as it is and with one change each:
//   A  the source as it is (and A2: the same source, built again elsewhere);
//   W  a worker-only change: the offline sentence in sw.ts;
//   P  a worker-policy (dependency) change: swPolicy.ts gains a network-only
//      prefix. Neither W nor P touches the app bundle.
//
//   B  build identity: the same source gives the same version and the same
//      worker, byte for byte (also against the gate's own build); W and P
//      each get a new version, with the app's files unchanged.
//   E  engine, its own server and its own copy of each build (the gate's
//      server is not used):
//      E1 A in charge, a solo round in play in another tab. W is deployed with
//         a listed file missing: W's install fails; A's live cache is exactly
//         as it was (every entry, same bytes, same order), no candidate is
//         left, the round plays on, and offline the shell is A's, whole. The
//         other tab asks for an update the moment W's install ends, as the
//         browser or the app may: that second attempt fails too and leaves no
//         candidate either.
//      E2 W again, now with storage full (Chromium's quota override): the same.
//      E3 W complete: it installs and waits; A's cache is untouched while it
//         waits; with every A page closed, W activates: its live cache holds
//         every file it precaches, A's cache and every candidate are gone,
//         someone else's cache stays; offline, the shell is W's, whole.
//      E4 P after W: a failed install keeps W's cache exactly; then P installs,
//         waits, activates and cleans up the same way.
//      E5 defensive (no real build can make it, B shows why): a worker with P's
//         version but different bytes. A failed install keeps P's cache
//         exactly; a successful one doesn't touch it while it waits, and on
//         activation leaves one complete live cache and no candidate.
// Whose install attempt (D-IB-01): the driver is not the only one that starts
// them. The browser checks for an update when a page navigates (the reloads
// in offlineShell), and the app re-checks on every `online` event, from every
// open page (registerSw.ts). Attempts run one after another, never at once.
// So each attempt of the driver's own (ownUpdate) first waits until none is in
// flight and none has started for a moment, then follows the worker its
// update starts (a new one, not one already in flight), then waits again until
// every attempt set off meanwhile has finished. What it reads next is settled,
// and the cache checks cover every attempt: its own and the others.
// Usage: node scripts/check-install-builds.mjs [gateBaseUrl]   (the gate passes one; it isn't needed)
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";

const ROOT = process.cwd();
const GATE_DIST = process.env.MCHEZO_WEB_DIST ?? null;
const SHOTS = process.env.MCHEZO_SCREENSHOT_DIR ?? null;
// Fault modes, only for scripts/check-install-builds-no-worker.mjs (review 7057502077); the gate never sets them.
//   e1-no-new-worker  E1 deploys the build already in charge again, so the driver's own update starts no attempt.
//   e1-watch-too-late the second tab's watch is armed only after the driver's attempt has ended, so it misses it.
// Either way the run must fail E1 by name, end, and clean up.
const FAULTS = ["e1-no-new-worker", "e1-watch-too-late"];
const FAULT = process.env.MCHEZO_INSTALL_BUILDS_FAULT ?? null;
if (FAULT !== null && !FAULTS.includes(FAULT)) { console.error(`MCHEZO_INSTALL_BUILDS_FAULT must be one of: ${FAULTS.join(", ")}`); process.exit(2); }
if (FAULT) console.log(`FAULT MODE ${FAULT}: ${FAULT === "e1-no-new-worker" ? "E1 deploys the build already in charge, so no new worker appears" : "the second tab's watch starts after the driver's attempt has ended"} (this run is expected to FAIL E1)`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
/** A wait in a page that must end: `p` (an evaluate), or after `ms` either `fallback` or, without one, a named error (which ends the run in its catch and finally). */
function within(ms, what, p, fallback) {
  let timer;
  const late = new Promise((resolve, reject) => {
    timer = setTimeout(() => (fallback !== undefined ? resolve(fallback) : reject(new Error(`${what}: no answer within ${Math.round(ms / 1000)} s`))), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
async function soon(fn, timeout = 15000, every = 200) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await sleep(every); }
  if (last) console.log(`  (waited ${timeout} ms; last error: ${String(last.message ?? last).split("\n")[0]})`);
  return null;
}

// ---------- the builds ----------
const WORK = mkdtempSync(join(tmpdir(), "mz-s83-builds-"));
/** A copy of what the web build reads from this checkout, with an optional change to one file. */
function sourceCopy(name, change) {
  const dst = join(WORK, `src-${name}`);
  for (const d of ["apps/web", "src", "content"]) {
    cpSync(join(ROOT, d), join(dst, d), { recursive: true, filter: (p) => !p.slice(ROOT.length).split(sep).includes("dist") && !p.includes(`${sep}node_modules`) });
  }
  for (const f of ["package.json", "tsconfig.json"]) cpSync(join(ROOT, f), join(dst, f));
  symlinkSync(join(ROOT, "node_modules"), join(dst, "node_modules"), "dir");
  if (change) {
    const file = join(dst, change.file);
    const before = readFileSync(file, "utf8");
    const after = before.replace(change.from, change.to);
    if (after === before) throw new Error(`setup: the change to ${change.file} didn't apply`);
    writeFileSync(file, after);
  }
  return dst;
}
/** The real web build of one source copy. */
function build(name, change) {
  const src = sourceCopy(name, change);
  const out = join(WORK, `dist-${name}`);
  execFileSync(process.execPath, [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "apps/web/vite.config.ts", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"], { cwd: src, stdio: ["ignore", "ignore", "pipe"] });
  return out;
}
const buildOf = (html) => /<meta name="mchezo-build" content="([^"]+)"/.exec(html)?.[1] ?? null;
function describeBuild(dir) {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const sw = readFileSync(join(dir, "sw.js"), "utf8");
  const assets = readdirSync(join(dir, "assets")).sort();
  return {
    dir, html, sw, version: buildOf(html), swVersion: /^\/\* Mchezo service worker, build ([0-9a-f]+) \*\//.exec(sw)?.[1] ?? null,
    assets, assetBytes: Object.fromEntries(assets.map((a) => [a, readFileSync(join(dir, "assets", a)).toString("base64")])),
  };
}
const sameAppFiles = (x, y) => JSON.stringify(x.assets) === JSON.stringify(y.assets) && x.assets.every((a) => x.assetBytes[a] === y.assetBytes[a]);
const htmlBesidesMarker = (b) => b.html.split(b.version).join("<build>");

// ---------- the browser side ----------
async function ownServer(webDist) {
  const dataDir = mkdtempSync(join(tmpdir(), "mz-s83b-data-"));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: dataDir, MCHEZO_WEB_DIST: webDist };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_DIR;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
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
/** Put one build in place on the server (a deploy), optionally with a listed file missing (a partial deploy) or a changed worker. */
function deploy(live, b, { missing = null, sw = null } = {}) {
  for (const f of readdirSync(live)) rmSync(join(live, f), { recursive: true, force: true });
  cpSync(b.dir, live, { recursive: true });
  if (missing) unlinkSync(join(live, missing.slice(1)));
  if (sw !== null) writeFileSync(join(live, "sw.js"), sw);
}
const live = (v) => `mchezo-shell-${v}`;
const stagePrefix = (v) => `mchezo-stage-${v}-`;
const cacheNames = (page) => page.evaluate(async () => (await caches.keys()).sort());
/** One cache's entries, in order, each with a digest of its bytes (null if there is no such cache). Creates nothing. */
const digests = (page, name) => page.evaluate(async (n) => {
  if (!(await caches.has(n))) return null;
  const c = await caches.open(n);
  const out = [];
  for (const r of await c.keys()) {
    const buf = await (await c.match(r)).arrayBuffer();
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
    out.push(`${new URL(r.url).pathname} ${[...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("")}`);
  }
  return out;
}, name);
const workerBuild = (page, which) => page.evaluate(async (w) => {
  const reg = await navigator.serviceWorker.getRegistration();
  const sw = w === "waiting" ? reg?.waiting : reg?.active;
  if (!sw) return null;
  return await new Promise((res) => { const ch = new MessageChannel(); const t = setTimeout(() => res(null), 3000); ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data?.version ?? null); }; sw.postMessage({ type: "mchezo-version" }, [ch.port2]); });
}, which);
const visible = async (page, testId) => (await page.getByTestId(testId).count()) > 0 && (await page.getByTestId(testId).first().isVisible());
/** Watch this page's registration for install attempts (a new installing worker, whoever started it) and their states. Once per page load. */
const watchAttempts = (page) => page.evaluate(async () => {
  if (window.__mzAttempts) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const attempts = [];
  const workers = [];
  const track = (w) => {
    if (!w || workers.includes(w)) return;
    workers.push(w);
    const a = { state: w.state };
    attempts.push(a);
    w.addEventListener("statechange", () => { a.state = w.state; });
  };
  Object.assign(window, { __mzAttempts: attempts, __mzWorkers: workers, __mzTrack: track });
  track(reg?.installing);
  reg?.addEventListener("updatefound", () => track(reg.installing));
});
const QUIET_MS = 1000;
const OWN_DEADLINE_MS = 20000;
/** Wait until no install attempt is in flight and none has started for QUIET_MS (false if that doesn't happen within `timeout`). */
async function settle(page, timeout = 30000) {
  await within(10000, "watching install attempts", watchAttempts(page));
  return within(timeout + 5000, "waiting for install attempts to settle", page.evaluate(async ({ quiet, timeout }) => {
    const reg = await navigator.serviceWorker.getRegistration();
    const end = Date.now() + timeout;
    let calmSince = Date.now();
    let seen = window.__mzAttempts.length;
    while (Date.now() < end) {
      if (reg?.installing || window.__mzAttempts.length !== seen) { calmSince = Date.now(); seen = window.__mzAttempts.length; }
      else if (Date.now() - calmSince >= quiet) return true;
      await new Promise((r) => setTimeout(r, 20));
    }
    return false;
  }, { quiet: QUIET_MS, timeout }));
}
/**
 * The driver's own update attempt (D-IB-01): settle, `prepare()` (a deploy), ask for an update, follow the worker that
 * update starts to its end ("redundant": its install failed; "installed": it waits), then settle again.
 * Returns { own, others, calm }: `others` are the end states of the other attempts that started meanwhile.
 */
async function ownUpdate(page, prepare = async () => {}) {
  const calmBefore = await settle(page);
  await prepare();
  const r = await within(OWN_DEADLINE_MS + 10000, "the driver's own update attempt", page.evaluate(async (deadlineMs) => {
    const reg = await navigator.serviceWorker.getRegistration();
    const from = window.__mzAttempts.length;
    const known = [...window.__mzWorkers];
    await Promise.race([reg.update().catch(() => {}), new Promise((res) => setTimeout(res, deadlineMs))]);
    const w = reg.installing;
    if (!w) return { own: "no new worker", from, mine: -1 };
    if (known.includes(w)) return { own: "joined an attempt already in flight", from, mine: -1 };
    window.__mzTrack(w);
    const mine = window.__mzWorkers.indexOf(w);
    const end = Date.now() + deadlineMs;
    while (!["redundant", "installed", "activating", "activated"].includes(w.state) && Date.now() < end) await new Promise((res) => setTimeout(res, 50));
    return { own: w.state, from, mine };
  }, OWN_DEADLINE_MS));
  const calmAfter = await settle(page);
  const others = await within(10000, "reading the other attempts", page.evaluate(({ from, mine }) => window.__mzAttempts.map((a, i) => ({ i, state: a.state })).filter((a) => a.i >= from && a.i !== mine).map((a) => a.state), r));
  return { own: r.own, others, calm: calmBefore && calmAfter };
}
/**
 * Another tab asks for an update the moment the next install attempt ends, as the browser or the app may: a second
 * attempt, not the driver's. Bounded (review 7057502077): the first attempt must appear and end, and the second must
 * start, within SECOND_DEADLINE_MS; every listener is removed on completion, timeout or cancel; the outcome is always
 * one named string in window.__mzSecond. window.__mzSecondCancel(why) ends it at once.
 */
const SECOND_DEADLINE_MS = 15000;
const armSecondAttempt = (tab) => within(10000, "arming the second attempt", tab.evaluate((deadlineMs) => {
  let cancelled = null;
  let wake = () => {};
  window.__mzSecondCancel = (why) => { if (cancelled === null) { cancelled = why; wake(); } };
  window.__mzSecond = (async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "no registration in the second tab";
    const end = Date.now() + deadlineMs;
    const ended = (w) => ["redundant", "installed", "activating", "activated"].includes(w.state);
    let first = null;
    const off = [];
    try {
      // The first attempt: it appears (installing now, or updatefound later) and ends, or the deadline or a cancel comes first.
      const outcome = await new Promise((resolve) => {
        wake = () => resolve(`cancelled: ${cancelled}`);
        if (cancelled !== null) { wake(); return; } // cancelled before this watch began
        const timer = setTimeout(() => resolve(first ? `the first attempt did not end within ${deadlineMs / 1000} s` : `no first attempt appeared within ${deadlineMs / 1000} s`), deadlineMs);
        off.push(() => clearTimeout(timer));
        const follow = (w) => {
          if (first || !w) return;
          first = w;
          if (ended(w)) { resolve("ended"); return; }
          const onState = () => { if (ended(w)) resolve("ended"); };
          w.addEventListener("statechange", onState);
          off.push(() => w.removeEventListener("statechange", onState));
        };
        const onFound = () => follow(reg.installing);
        reg.addEventListener("updatefound", onFound);
        off.push(() => reg.removeEventListener("updatefound", onFound));
        follow(reg.installing);
      });
      if (outcome !== "ended") return outcome;
    } finally {
      for (const f of off) f();
      wake = () => {};
    }
    // Until the browser has finished that job, an update joins it and starts nothing: ask again, briefly, within the same deadline.
    while (Date.now() < end && cancelled === null) {
      await Promise.race([reg.update().catch(() => {}), new Promise((res) => setTimeout(res, Math.max(0, end - Date.now())))]);
      if (reg.installing && reg.installing !== first) return "started";
      await new Promise((res) => setTimeout(res, 50));
    }
    return cancelled !== null ? `cancelled: ${cancelled}` : `no second attempt started within ${deadlineMs / 1000} s`;
  })();
}, SECOND_DEADLINE_MS));
/** Open the app on a fresh page and wait until `version`'s worker is activated and controls it. */
async function openControlled(ctx, base, version) {
  const p = await ctx.newPage();
  await p.goto(`${base}/`, { waitUntil: "load" });
  const ok = await soon(async () => (await p.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)) === "activated" && (await workerBuild(p, "active")) === version, 20000);
  if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) await p.reload({ waitUntil: "load" });
  return { p, ok: !!ok && (await p.evaluate(() => !!navigator.serviceWorker.controller)) };
}
/** Offline, reload: is the page this build's shell, whole (its HTML, scripts, styles and every asset it loaded), saying it can't reach Mchezo? */
async function offlineShell(ctx, page, b) {
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" }).catch(() => {});
  const notice = (await soon(() => visible(page, "offline-notice"), 10000)) !== null;
  const gen = await page.evaluate(() => ({
    build: document.querySelector('meta[name="mchezo-build"]')?.getAttribute("content"),
    files: [...new Set([
      ...[...document.querySelectorAll("script[src]")].map((s) => new URL(s.src).pathname),
      ...[...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => new URL(l.href).pathname),
      ...performance.getEntriesByType("resource").map((r) => new URL(r.name).pathname).filter((p) => p.startsWith("/assets/")),
    ])],
  }));
  const shot = SHOTS ? join(SHOTS, `r83-offline-after-${b.label}.png`) : null;
  if (shot) { mkdirSync(SHOTS, { recursive: true }); await sleep(900); await page.screenshot({ path: shot }); } // after the page's fade-in
  await ctx.setOffline(false);
  const whole = gen.build === b.version && gen.files.length > 0 && gen.files.every((f) => b.assets.includes(f.replace("/assets/", "")));
  return { ok: notice && whole, detail: JSON.stringify({ notice, build: gen.build, files: gen.files.length, foreign: gen.files.filter((f) => !b.assets.includes(f.replace("/assets/", ""))) }) };
}
/**
 * In the round tab: does play go on? A guess of four tiles not tried before (a different four each
 * time) must get the game server's own answer (its POST /rooms/<id>/intents reply, not the worker's).
 * A finished puzzle is replayed first with Play again, in the same page.
 */
let guessNo = 0;
async function guessAnswered(round) {
  if (!(await visible(round, "mz-cx-submit"))) {
    if (await visible(round, "solo-play-again")) await round.getByTestId("solo-play-again").click();
    await round.getByTestId("mz-cx-submit").waitFor({ timeout: 20000 }).catch(() => {});
  }
  const tiles = round.getByTestId("mz-cx-tile");
  const n = await tiles.count();
  if (n < 4) return false;
  const k = guessNo++;
  for (let i = 0; i < 4; i++) await tiles.nth((k + i) % n).click();
  const reply = round.waitForResponse((r) => r.request().method() === "POST" && /^\/rooms\/[^/]+\/intents$/.test(new URL(r.url()).pathname), { timeout: 10000 })
    .then((r) => r.status() === 200 && !r.fromServiceWorker()).catch(() => false);
  await round.getByTestId("mz-cx-submit").click();
  return await reply;
}

let own = null;
let browser = null;
const LIVE_DIR = mkdtempSync(join(tmpdir(), "mz-s83b-live-"));
try {
  // ---- B. Build identity, from real builds ----
  const t0 = Date.now();
  const A = { ...describeBuild(build("A")), label: "A" };
  const A2 = describeBuild(build("A2"));
  const W = { ...describeBuild(build("W", { file: "apps/web/src/install/sw.ts", from: "Mchezo needs a connection to its game server.", to: "Mchezo needs a working connection to its game server." })), label: "W" };
  const P = { ...describeBuild(build("P", { file: "apps/web/src/install/swPolicy.ts", from: '"/health", "/sw.js"] as const', to: '"/health", "/sw.js", "/future-api"] as const' })), label: "P" };
  console.log(`  (four real builds in ${Math.round((Date.now() - t0) / 1000)} s: A ${A.version}, W ${W.version}, P ${P.version})`);
  for (const b of [A, A2, W, P]) check(`B setup: build ${b.label ?? "A2"} names its version in its page and its worker`, /^[0-9a-f]{16}$/.test(b.version ?? "") && b.swVersion === b.version);
  check("B the same source built twice gives the same version, the same worker byte for byte, the same page and the same files", A2.version === A.version && A2.sw === A.sw && A2.html === A.html && sameAppFiles(A, A2));
  if (GATE_DIST && existsSync(join(GATE_DIST, "sw.js"))) {
    const G = describeBuild(GATE_DIST);
    check("B and the same as the build under test (built separately, elsewhere)", G.version === A.version && G.sw === A.sw, `${G.version} vs ${A.version}`);
  }
  check("B a worker-only change (sw.ts) is a new version and a new worker", W.version !== A.version && W.sw !== A.sw && !W.sw.includes(A.version));
  check("B a worker-policy change (swPolicy.ts, a dependency of the worker only) is a new version too", P.version !== A.version && P.version !== W.version && P.sw !== A.sw && !P.sw.includes(A.version));
  check("B neither change touches the app: the same files, byte for byte, and the same page apart from its build marker", sameAppFiles(A, W) && sameAppFiles(A, P) && htmlBesidesMarker(W) === htmlBesidesMarker(A) && htmlBesidesMarker(P) === htmlBesidesMarker(A));

  // ---- E. Updates between them, in the engine ----
  browser = await launchChromium();
  deploy(LIVE_DIR, A);
  own = await ownServer(LIVE_DIR);
  const base = own.base;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let { p: home, ok } = await openControlled(ctx, base, A.version);
  check("E setup: A's worker is active and controls the page", ok);
  await home.evaluate(async () => { const c = await caches.open("not-mchezo"); await c.put("/not-mchezo.txt", new Response("keep me")); });
  const round = await ctx.newPage();
  await round.goto(`${base}/solo`, { waitUntil: "load" });
  await round.getByTestId("solo-start-word-connections").click(); // D-SR-01: the shelf opens the instructions
  await round.getByTestId("solo-round-start").click(); // and their one Start begins the round
  await round.getByTestId("mz-cx").waitFor({ timeout: 20000 });
  await round.evaluate(() => { window.__mzMarker = "the-same-page"; });
  const a0 = await digests(home, live(A.version));
  check(`E setup: A's live cache holds every file it precaches (${a0?.length ?? 0} entries)`, !!a0 && a0.length >= 10);
  const okNames = (names, v) => JSON.stringify(names) === JSON.stringify([live(v), "not-mchezo"].sort());

  // E1: W, a listed file missing. The round's tab asks for an update right after W's install ends: a second attempt.
  const e1 = await ownUpdate(home, async () => {
    if (FAULT === "e1-no-new-worker") deploy(LIVE_DIR, A); // the build in charge again: no new worker
    else deploy(LIVE_DIR, W, { missing: "/icons/icon-512.png" });
    if (FAULT !== "e1-watch-too-late") await armSecondAttempt(round);
  });
  if (FAULT === "e1-watch-too-late") {
    deploy(LIVE_DIR, A); // the build in charge again, so no later attempt can come either: only the watch's deadline ends it
    await armSecondAttempt(round); // it missed the attempt it was meant to follow
  }
  // No attempt of the driver's own: nothing will start the second tab's, so end its watch now (it is bounded anyway).
  if (!["redundant", "installed"].includes(e1.own)) await within(5000, "cancelling the second attempt", round.evaluate((why) => window.__mzSecondCancel?.(why), `the driver's own update gave "${e1.own}"`), null);
  const second = await within(SECOND_DEADLINE_MS + 5000, "the second tab's watch", round.evaluate(() => window.__mzSecond), `the second tab did not answer within ${(SECOND_DEADLINE_MS + 5000) / 1000} s`);
  check("E1 W deployed with a listed file missing: W's install runs and fails", e1.own === "redundant" && e1.calm && (await workerBuild(home, "active")) === A.version, JSON.stringify(e1));
  check("E1 another tab asks for an update the moment W's install ends: a second attempt, not the driver's, starts and fails too", second === "started" && e1.others.length >= 1 && e1.others.every((x) => x === "redundant"), JSON.stringify({ second, others: e1.others }));
  check("E1 A's live cache is exactly as it was: every entry, the same bytes, the same order", JSON.stringify(await digests(home, live(A.version))) === JSON.stringify(a0));
  check("E1 no candidate is left, nothing else is touched", okNames(await cacheNames(home), A.version), JSON.stringify(await cacheNames(home)));
  check("E1 the round in the other tab plays on (a guess answered, the same page)", (await guessAnswered(round)) && (await round.evaluate(() => window.__mzMarker)) === "the-same-page");
  const s1 = await offlineShell(ctx, home, A);
  check("E1 offline, A's shell is whole: A's page, scripts, styles and assets, saying it can't reach Mchezo", s1.ok, s1.detail);

  // E2: W complete, storage full.
  // Storage is full before W is deployed and until every attempt has ended, so no attempt of W runs with room to spare.
  const cdp = await ctx.newCDPSession(home);
  const e2 = await ownUpdate(home, async () => {
    const { usage } = await home.evaluate(() => navigator.storage.estimate());
    await cdp.send("Storage.overrideQuotaForOrigin", { origin: base, quotaSize: Math.round(usage) + 200_000 });
    deploy(LIVE_DIR, W);
  });
  await cdp.send("Storage.overrideQuotaForOrigin", { origin: base }).catch(() => {});
  check("E2 W with storage full (Chromium's quota override): W's install runs and fails", e2.own === "redundant" && e2.calm && e2.others.every((x) => x === "redundant") && (await workerBuild(home, "active")) === A.version, JSON.stringify(e2));
  check("E2 A's live cache is exactly as it was", JSON.stringify(await digests(home, live(A.version))) === JSON.stringify(a0));
  check("E2 no candidate is left", okNames(await cacheNames(home), A.version), JSON.stringify(await cacheNames(home)));
  check("E2 the round plays on", (await guessAnswered(round)) && (await round.evaluate(() => window.__mzMarker)) === "the-same-page");

  // E3: W complete: waits, then activates.
  const e3 = await ownUpdate(home);
  check("E3 W complete: it installs and waits; A stays in charge", e3.own === "installed" && e3.calm && (await workerBuild(home, "waiting")) === W.version && (await workerBuild(home, "active")) === A.version, JSON.stringify(e3));
  check("E3 while W waits, A's live cache is untouched, and W's files are only in W's own candidate", JSON.stringify(await digests(home, live(A.version))) === JSON.stringify(a0) && (await cacheNames(home)).some((n) => n.startsWith(stagePrefix(W.version))));
  check("E3 the round plays on while W waits", (await guessAnswered(round)) && (await round.evaluate(() => window.__mzMarker)) === "the-same-page");
  await home.close(); await round.close();
  ({ p: home, ok } = await openControlled(ctx, base, W.version));
  check("E3 every A page closed and one reopened: W is activated and controls it", ok);
  const w0 = await digests(home, live(W.version));
  const wPrecache = ["/index.html", ...W.assets.filter((a) => /\.(js|css)$/.test(a)).map((a) => `/assets/${a}`)];
  check("E3 scoped cleanup: W's live cache and someone else's remain; A's cache and every candidate are gone", okNames(await cacheNames(home), W.version), JSON.stringify(await cacheNames(home)));
  check("E3 W's live cache holds every file it precaches, and nothing of A's that W doesn't list", !!w0 && wPrecache.every((f) => w0.some((e) => e.startsWith(`${f} `))) && w0.every((e) => { const f = e.split(" ")[0]; return !f.startsWith("/assets/") || W.assets.includes(f.slice(8)); }));
  const s3 = await offlineShell(ctx, home, W);
  check("E3 offline, W's shell is whole", s3.ok, s3.detail);

  // E4: P after W.
  const e4a = await ownUpdate(home, async () => deploy(LIVE_DIR, P, { missing: "/manifest.webmanifest" }));
  check("E4 P (a policy change) deployed with a listed file missing: its install fails; W's cache exactly as it was; no candidate left", e4a.own === "redundant" && e4a.calm && e4a.others.every((x) => x === "redundant") && JSON.stringify(await digests(home, live(W.version))) === JSON.stringify(w0) && okNames(await cacheNames(home), W.version), JSON.stringify(e4a));
  const e4b = await ownUpdate(home, async () => deploy(LIVE_DIR, P));
  check("E4 P complete: it installs and waits; W's cache untouched", e4b.own === "installed" && e4b.calm && (await workerBuild(home, "waiting")) === P.version && JSON.stringify(await digests(home, live(W.version))) === JSON.stringify(w0), JSON.stringify(e4b));
  await home.close();
  ({ p: home, ok } = await openControlled(ctx, base, P.version));
  const p0 = await digests(home, live(P.version));
  check("E4 P activates; only P's live cache and someone else's remain", ok && okNames(await cacheNames(home), P.version), JSON.stringify(await cacheNames(home)));

  // E5: defensive, the same version with different bytes.
  const sameVersion = `${P.sw}\n/* the same build, different bytes */\n`;
  const e5a = await ownUpdate(home, async () => deploy(LIVE_DIR, P, { missing: "/icons/icon-192.png", sw: sameVersion }));
  check("E5 a worker with P's version but different bytes, a listed file missing: its install fails; P's cache exactly as it was; no candidate left", e5a.own === "redundant" && e5a.calm && e5a.others.every((x) => x === "redundant") && JSON.stringify(await digests(home, live(P.version))) === JSON.stringify(p0) && okNames(await cacheNames(home), P.version), JSON.stringify(e5a));
  const e5b = await ownUpdate(home, async () => deploy(LIVE_DIR, P, { sw: sameVersion }));
  check("E5 complete, it installs and waits without touching P's live cache (only its own candidate)", e5b.own === "installed" && e5b.calm && JSON.stringify(await digests(home, live(P.version))) === JSON.stringify(p0) && (await cacheNames(home)).some((n) => n.startsWith(stagePrefix(P.version))), JSON.stringify(e5b));
  await home.close();
  const fresh = await ctx.newPage();
  await fresh.goto(`${base}/`, { waitUntil: "load" });
  const activated = await soon(async () => fresh.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !r?.waiting && r?.active?.state === "activated"; }), 20000);
  if (!(await fresh.evaluate(() => !!navigator.serviceWorker.controller))) await fresh.reload({ waitUntil: "load" });
  const p1 = await digests(fresh, live(P.version));
  check("E5 on activation: one complete live cache, no candidate left", !!activated && okNames(await cacheNames(fresh), P.version) && !!p1 && p1.length >= (p0?.length ?? 99), JSON.stringify(await cacheNames(fresh)));
  const s5 = await offlineShell(ctx, fresh, P);
  check("E5 offline, the shell is whole", s5.ok, s5.detail);
  await ctx.close();
} catch (e) {
  check("no unexpected error", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await stopServer(own).catch(() => {});
  if (browser) await browser.close();
  rmSync(LIVE_DIR, { recursive: true, force: true });
  rmSync(WORK, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} build-update check(s) FAILED` : "\nAll build-update checks passed");
process.exit(failures ? 1 : 0);
