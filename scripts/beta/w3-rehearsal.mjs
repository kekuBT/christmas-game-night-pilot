// Beta R4 W3 (handoff 6929226094): a LOCAL rehearsal of the W3 reconnect check against the pinned runtime, in real
// browser pages (Chromium). It is a local test helper ONLY: it refuses any origin that isn't https://localhost or
// https://127.0.0.1 (the packaged image behind scripts/beta/render-like-proxy.mjs, see scripts/beta/w3-rehearsal.sh),
// it accepts the local self-signed certificate, and it never touches a hosting account. The native checks (a phone
// backgrounded and foregrounded, locked and unlocked, moved from Wi-Fi to mobile data) cannot be rehearsed here: they
// stay pending in docs/beta/render-w3.md.
//
//   node scripts/beta/w3-rehearsal.mjs --origin https://localhost:18443 --code-file <throwaway code> --evidence <dir>
//        [--down-seconds 15] [--lost-ack-down-seconds 8] [--max-minutes 8] [--control stale-host]
//
// One Casual Trivia round with a host, one guest and a TV, throwaway names. Only the guest's network is interrupted, by
// the test itself (Playwright): while "down", the page is offline (navigator.onLine false, 'offline' event), every HTTP
// request fails as a network error, its open sockets are closed, and new sockets are refused; "up" reverses all four.
//   R1  the guest answers question 1 normally: acknowledged ("Saved."), recorded once.
//   R2  OUTAGE between answers (question 2 on screen, unanswered), --down-seconds long: the guest's banner says it is
//       reconnecting; the server marks the guest away (an API observation: the host stays on its question screen,
//       which doesn't show presence; only a phone waiting after its last answer does);
//       after the network returns the guest is back in the SAME seat and the SAME round on question 2, question 1 still
//       recorded once. The host's and the TV's screens are read from their own DOM (review 6930033578): each must still
//       render the playing round, and both must agree with the server's status.
//   R2b SILENT OUTAGE (what a Wi-Fi to mobile data switch often looks like): the same length, but the page is NOT told
//       it is offline and its open socket is NOT closed; traffic simply stops in both directions (a dead path). The app's
//       own watchdog must notice, and after the path returns the phone must find its way back without any 'online'
//       event: the same seat, round and recorded answer, and the time it took (the runbook's budget).
//   R3  INTERRUPTED SUBMISSION, with an outage: the guest taps an answer to question 2; the request REACHES the server
//       but its response is lost and the network goes down for --lost-ack-down-seconds, so the phone's own retries fail.
//       Expected: the answer counts exactly once; after the network returns the phone shows it as in; replaying the
//       very same request (same clientEventId) changes nothing; a different second answer is refused (ALREADY_ANSWERED).
//   R4  INTERRUPTED SUBMISSION, quick: question 3's first response is lost but the network stays up, so the phone's
//       automatic retry (same clientEventId) is answered from the server's dedupe: shown as in, recorded once.
//   R5  The round is finished (guest through the UI, host through the API). Server record (API): all 10 of the guest's
//       answers recorded once, and the guest's score equals the score of those answers and the revealed correct answers:
//       no answer counted twice. Then, separately, what each screen RENDERS: the host's, the guest's and the TV's own
//       DOM must each show the finished round with every player's recorded score in its standings.
// Timings from the moment the network returns are recorded (socket reopened, the server marks the guest back, the phone
// usable again) for the runbook's observation budget. Names say where a value comes from: "rendered" is a page's DOM,
// "API" is the server's projection read over HTTP. The evidence records what each role SAW, never a hidden answer, a
// seat credential, a cookie or the room code: they are redacted, and the run fails if one is found in its own evidence.
//
// --control stale-host (a negative control, review 6930033578): just before R5 the HOST'S PAGE stops receiving updates
// (its sockets and HTTP are dropped by the test; the host's API calls, made outside the page, still work). The host's
// rendered R5 check must then FAIL while the API and the TV checks pass: the run reports FAILED, and a closing
// "CONTROL" line lists the failed checks.
// Exit: 0 "W3 REHEARSAL PASSED", 1 "W3 REHEARSAL FAILED", 2 bad options (before any network activity).
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { passBriefing } from "../lib/briefing.mjs";
import { launchChromium } from "../lib/driver-env.mjs";

// ---------- options, checked before anything else ----------
const argv = process.argv.slice(2);
const VALUED = new Set(["origin", "code-file", "evidence", "down-seconds", "lost-ack-down-seconds", "max-minutes", "control"]);
for (let i = 0; i < argv.length; i++) {
  const m = /^--([a-z-]+)$/.exec(argv[i]);
  if (!m || !VALUED.has(m[1]) || argv[i + 1] === undefined || argv[i + 1].startsWith("--")) { console.error(`w3-rehearsal: unknown option or missing value: ${argv[i]}`); process.exit(2); }
  i++;
}
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
let ORIGIN; try { ORIGIN = new URL(opt("origin", "")).origin; } catch { console.error("w3-rehearsal: --origin is not a URL"); process.exit(2); }
const host = new URL(ORIGIN).hostname;
if (!ORIGIN.startsWith("https://") || !["localhost", "127.0.0.1"].includes(host)) { console.error("w3-rehearsal: LOCAL ONLY: --origin must be https://localhost[:port] or https://127.0.0.1[:port]"); process.exit(2); }
if (!opt("code-file") || !opt("evidence")) { console.error("w3-rehearsal: --code-file and --evidence are required"); process.exit(2); }
const num = (n, d) => { const v = Number(opt(n, d)); if (!(v > 0)) { console.error(`w3-rehearsal: --${n} must be a positive number`); process.exit(2); } return v; };
const DOWN_S = num("down-seconds", "15"), LOST_DOWN_S = num("lost-ack-down-seconds", "8"), MAX_MS = num("max-minutes", "8") * 60_000;
const CONTROL = opt("control", "");
if (CONTROL && CONTROL !== "stale-host") { console.error("w3-rehearsal: --control accepts only stale-host"); process.exit(2); }
const CODE = readFileSync(opt("code-file"), "utf8").trim();

const RUN = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomBytes(3).toString("hex")}`;
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
const secrets = new Set([CODE]);
const redact = (s) => { let t = String(s); for (const x of secrets) if (x && x.length >= 6) t = t.split(x).join("<redacted>"); return t.replace(/cgn_beta=[^;,\s"]+/g, "cgn_beta=<redacted>"); };
const ev = {
  tool: "scripts/beta/w3-rehearsal.mjs", toolSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
  node: process.version, runId: RUN, origin: ORIGIN, startedAt: new Date(T0).toISOString(),
  params: { downSeconds: DOWN_S, lostAckDownSeconds: LOST_DOWN_S, maxMinutes: MAX_MS / 60_000, control: CONTROL || null },
  scope: "LOCAL rehearsal: the packaged pinned runtime behind a local TLS proxy, synthetic Chromium pages, a simulated network interruption. Not Render, not a phone, not a real network handoff.",
  timings: {}, seen: {}, checks: [], failures: [],
};
function check(name, ok, detail = "") { ev.checks.push({ name, ok: !!ok, detail: redact(detail) }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${redact(detail)}` : ""}`); if (!ok) ev.failures.push(redact(name)); }
async function until(fn, timeoutMs, stepMs = 200) { const end = Date.now() + timeoutMs; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await sleep(stepMs); } return null; }
const overall = setTimeout(() => { console.error(`w3-rehearsal: the run exceeded --max-minutes ${MAX_MS / 60_000}`); process.exit(1); }, MAX_MS);

// ---------- page helpers (the app's own UI and API, as a phone uses them) ----------
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(path.replace(":room", roomId), { method, headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { method, path, body });
const myRoom = async (page) => (await api(page, "GET", "/rooms/:room/projection?audience=player")).body;
const text = (page) => page.evaluate(() => document.body.innerText).catch(() => "");
// ---------- what a screen RENDERS (its own DOM), kept apart from what the API says ----------
// A phone: "results" (a finished game's step-through review), its question ("Question 3 of 10"), "Answer locked in",
// or "other".
const phoneScreen = (page) => page.evaluate(() => {
  if (document.querySelector('[data-testid="mz-reveal-step"]')) return "results";
  const m = document.querySelector('main[aria-label^="Question "], main[aria-label="Answer locked in"], main[aria-label="All your answers are in"]');
  return m ? m.getAttribute("aria-label") : "other";
}).catch(() => "unreadable");
// The TV: Trivia's TV stage states its phase in its top bar, as rendered: "Featured question (Q1 of 10) · each phone
// goes at its own pace" while the round plays, "Game finished · …" after it.
const tvScreen = (page) => page.evaluate(() => (document.querySelector(".mz-tv-top__mid .mz-muted")?.textContent ?? "").trim()).catch(() => "unreadable");
const tvPlaying = (label) => /^Featured question \(Q1 of 10\) · each phone goes at its own pace$/.test(label);
const tvFinished = (label) => /^Game finished/.test(label);
// Rendered standings: a phone's standings step (the viewer is "You") and the TV's leaderboard.
const phoneRows = (page) => page.$$eval('[data-testid="standings-list"] li', (lis) => lis.map((li) => ({ name: (li.querySelector(".mz-standings__name")?.textContent ?? "").trim(), score: (li.querySelector(".mz-standings__score")?.textContent ?? "").trim() }))).catch(() => []);
const tvRows = (page) => page.$$eval("li.mz-tv-row", (lis) => lis.map((li) => ({ name: (li.querySelector(".mz-tv-row__name")?.textContent ?? "").trim(), score: (li.querySelector(".mz-tv-row__score")?.textContent ?? "").trim() }))).catch(() => []);
const toInt = (s) => { const d = String(s).replace(/[^0-9-]/g, ""); return d ? Number(d) : NaN; };
const rowsMatch = (rows, want) => rows.length === Object.keys(want).length && Object.entries(want).every(([n, v]) => typeof v === "number" && rows.some((r) => r.name === n && toInt(r.score) === v));
const QUESTION = (n) => `main[aria-label^="Question ${n} of"]`;
const LOCKED = 'main[aria-label="Answer locked in"], main[aria-label="All your answers are in"]';

async function hostRoom(page, name) {
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 20000 });
  let code = "";
  for (let i = 0; i < 40 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  return code;
}
async function joinAs(page, name, code) {
  await page.goto(`${ORIGIN}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 20000 });
}
async function spectate(page, code) {
  await page.goto(`${ORIGIN}/join`, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByTestId("tv-show").waitFor({ timeout: 20000 });
}
const tokenOf = (page) => page.evaluate(() => sessionStorage.getItem("cgn_token")).catch(() => null);

// ---------- a page's network, controlled by the test (the guest's; the host's only for --control stale-host) ----------
const makeNet = () => ({ down: false, silent: false, loseNext: null, lost: null, live: new Set(), opens: [], refused: 0, aborted: 0 });
const net = makeNet(), hostNet = makeNet();
async function goDown(gCtx, why) {
  net.down = true; net.downAt = Date.now(); net.downWhy = why;
  await gCtx.setOffline(true);
  for (const r of [...net.live]) { try { r.ws.close(); } catch { /* closed */ } try { r.server.close(); } catch { /* closed */ } }
}
async function goUp(gCtx) { net.down = false; net.upAt = Date.now(); await gCtx.setOffline(false); }
// The silent variant: requests fail and socket traffic stops, but nothing tells the page (no offline event, no close).
function goSilent() { net.down = true; net.silent = true; net.downAt = Date.now(); net.downWhy = "silent"; }
function endSilent() { net.down = false; net.silent = false; net.upAt = Date.now(); }

// =====================================================================================================================
const browser = await launchChromium();
let exitCode = 1;
try {
  const ctx = async (w, h) => browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
  const hCtx = await ctx(390, 844), gCtx = await ctx(390, 844), tCtx = await ctx(1280, 800);
  for (const c of [hCtx, gCtx, tCtx]) {
    const r = await c.request.post(`${ORIGIN}/beta/enter`, { form: { code: CODE, next: "/" }, maxRedirects: 0 });
    if (r.status() !== 303) throw new Error(`the gate answered ${r.status()}, not 303`);
    for (const ck of await c.cookies()) if (ck.name === "cgn_beta") secrets.add(ck.value);
  }
  // A page's network: HTTP through route(), sockets through routeWebSocket(); both obey n.down. Only the guest's
  // requests can lose their response (n.loseNext). The host's is controlled only by --control stale-host.
  const controlNetwork = async (c, n) => {
    await c.route("**/*", async (route) => {
      const req = route.request();
      if (n.down) { n.aborted++; return route.abort("internetdisconnected"); }
      if (n === net && n.loseNext && req.method() === "POST" && /\/rooms\/[^/]+\/intents$/.test(new URL(req.url()).pathname)) {
        const mode = n.loseNext; n.loseNext = null;
        const resp = await route.fetch(); // the request reaches the server and is applied …
        const body = await resp.json().catch(() => ({}));
        n.lost = { at: Date.now(), status: resp.status(), accepted: body.accepted === true, request: req.postData() };
        if (mode === "then-down") await goDown(gCtx, "lost-ack");
        return route.abort("connectionreset"); // … but its response never reaches the phone
      }
      return route.continue();
    });
    await c.routeWebSocket(/.*/, (ws) => {
      if (n.down) { n.refused++; ws.close(); return; }
      const server = ws.connectToServer();
      // Forward by hand, so a dead path can drop traffic both ways while the socket stays open (R2b, the control).
      ws.onMessage((m) => { if (!n.down) server.send(m); });
      server.onMessage((m) => { if (!n.down) ws.send(m); });
      const rec = { ws, server }; n.live.add(rec); n.opens.push(Date.now());
      ws.onClose(() => { n.live.delete(rec); try { server.close(); } catch { /* closed */ } });
      server.onClose(() => { n.live.delete(rec); try { ws.close(); } catch { /* closed */ } });
    });
  };
  await controlNetwork(gCtx, net);
  await controlNetwork(hCtx, hostNet);
  // The host's API calls go OUTSIDE its page (the context's request client, with its cookie and session token), so they
  // are API observations by construction and keep working when the host's page is frozen (--control stale-host).
  let hostToken = "", hostRoomId = "";
  const hostApi = async (method, path, body) => {
    const r = await hCtx.request.fetch(`${ORIGIN}${path.replace(":room", hostRoomId)}`, { method, headers: { "content-type": "application/json", "x-session-token": hostToken }, ...(body ? { data: JSON.stringify(body) } : {}), failOnStatusCode: false, maxRedirects: 0 });
    return { status: r.status(), body: await r.json().catch(() => ({})) };
  };
  const hostProj = async () => (await hostApi("GET", "/rooms/:room/projection?audience=player")).body;

  const h = await hCtx.newPage(), g = await gCtx.newPage(), tv = await tCtx.newPage();
  const tag = RUN.slice(-6);
  const hostName = `Host-${tag}`, guestName = `Guest-${tag}`;
  const code = await hostRoom(h, hostName); secrets.add(code);
  await joinAs(g, guestName, code);
  await spectate(tv, code);
  for (const t of [await tokenOf(h), await tokenOf(g)]) if (t) secrets.add(t);
  hostToken = (await tokenOf(h)) ?? ""; hostRoomId = (await h.evaluate(() => sessionStorage.getItem("cgn_roomId"))) ?? "";
  const room0 = await hostProj();
  const start = await hostApi("POST", "/rooms/:room/games", { gameId: "trivia", official: false, roster: room0.readiness?.wouldPlay, attempt: { id: `w3-${RUN}`, sessionRevision: room0.session?.revision } });
  const gid = start.body?.gameId;
  await passBriefing([h, g]);
  await g.locator(`${QUESTION(1)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 30000 });
  const me0 = (await myRoom(g)).players.find((p) => p.displayName === guestName);
  const roomId = (await hostProj()).roomId;
  const guestId = me0?.id;
  const guestGame = async () => (await myRoom(g)).myGames.find((x) => x.id === gid);
  const answers = async () => Object.keys((await guestGame())?.state?.myAnswers ?? {});
  // The server's presence for the guest, read over the API with the host's session (the host's question screen doesn't
  // show presence).
  const apiGuest = async () => (await hostProj()).players.find((p) => p.displayName === guestName);
  const tvShowsPlaying = async () => /each phone goes at its own pace/i.test(await text(tv));
  const tvOk = await until(tvShowsPlaying, 20000);
  if (!tvOk) ev.seen.tvTextAtSetup = redact((await text(tv)).replace(/\s+/g, " ").slice(0, 300));
  check("setup: one active Casual Trivia round with a host, the guest and the TV", (start.status === 201 || start.status === 200) && !!gid && !!guestId && !!tvOk, JSON.stringify({ start: start.status, game: !!gid, seat: !!guestId, tvPlaying: !!tvOk }));
  say(`setup done (run ${RUN}); the round is playing`);

  // ---- R1: an answer acknowledged before any interruption ----
  await g.locator(`${QUESTION(1)} .mz-slab:not([disabled])`).first().click();
  const r1 = await until(async () => (await g.locator(LOCKED).count()) > 0, 15000);
  const q1 = await answers();
  check("R1 question 1 answered and acknowledged before any interruption (locked in, recorded once)", !!r1 && q1.length === 1, `${q1.length} recorded`);
  await g.getByRole("button", { name: /^Next question$/ }).click();
  await g.locator(`${QUESTION(2)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 15000 });

  // ---- R2: an outage between answers ----
  say(`R2: the guest's network goes down for ${DOWN_S} s (question 2 on screen, unanswered)`);
  await goDown(gCtx, "outage");
  const tBanner = await until(async () => (await g.locator('[data-testid="mz-conn"].mz-conn--reconnecting').count()) > 0 ? Date.now() : null, 10000);
  ev.seen.guestDuringOutage = redact((await g.locator('[data-testid="mz-conn"]').first().innerText().catch(() => "")).replace(/\s+/g, " "));
  const tAway = await until(async () => (await apiGuest())?.connected === false ? Date.now() : null, DOWN_S * 1000);
  ev.seen.apiPresenceOfGuestDuringOutage = (await apiGuest().catch(() => null))?.connected === false ? "not connected (away)" : "still connected";
  ev.seen.tvDuringOutage = (await tvShowsPlaying()) ? "the round still playing" : "not the playing round";
  await sleep(Math.max(0, DOWN_S * 1000 - (Date.now() - net.downAt)));
  ev.timings.outageSeconds = Math.round((Date.now() - net.downAt) / 100) / 10;
  ev.timings.bannerAfterDropMs = tBanner ? tBanner - net.downAt : null;
  ev.timings.apiMarkedAwayAfterDropMs = tAway ? tAway - net.downAt : null;
  const opensBefore = net.opens.length;
  await goUp(gCtx);
  const up = net.upAt;
  const tWs = await until(() => (net.opens.length > opensBefore ? net.opens[opensBefore] : null), 30000, 50);
  const tBack = await until(async () => (await apiGuest())?.connected === true ? Date.now() : null, 30000);
  const timeline = [];
  const tUsable = await until(async () => {
    const st = { t: Date.now() - up, banner: await g.locator('[data-testid="mz-conn"]').first().getAttribute("class").catch(() => "none"), slabs: await g.locator(`${QUESTION(2)} .mz-slab:not([disabled])`).count(), sockets: net.live.size };
    const key = JSON.stringify({ ...st, t: 0 });
    if (!timeline.length || timeline[timeline.length - 1].key !== key) timeline.push({ ...st, key });
    return st.slabs > 0 && !/reconnecting/.test(st.banner ?? "") ? Date.now() : null;
  }, 30000);
  ev.seen.r2AfterReturnTimeline = timeline.map(({ key: _k, ...x }) => x);
  ev.seen.guestAfterReturn = redact((await g.locator('[data-testid="mz-conn"]').first().innerText({ timeout: 1000 }).catch(() => "(no banner)")).replace(/\s+/g, " "));
  Object.assign(ev.timings, { r2SocketReopenedMs: tWs ? tWs - up : null, r2ApiMarkedBackMs: tBack ? tBack - up : null, r2PhoneUsableMs: tUsable ? tUsable - up : null });
  check("R2 during the outage the guest's screen says it is reconnecting", !!tBanner, ev.seen.guestDuringOutage);
  check("R2 during the outage the server marks the guest away (API, read with the host's session)", !!tAway, `after ${ev.timings.apiMarkedAwayAfterDropMs} ms`);
  const meAfter = (await myRoom(g)).players.find((p) => p.displayName === guestName);
  const gameAfter = await guestGame();
  const q2 = await answers();
  check("R2 after the network returns: socket reopened, the server marks the guest back (API), the phone usable on question 2 (rendered)", !!tWs && !!tBack && !!tUsable, JSON.stringify({ socketMs: ev.timings.r2SocketReopenedMs, apiBackMs: ev.timings.r2ApiMarkedBackMs, usableMs: ev.timings.r2PhoneUsableMs }));
  check("R2 the SAME seat and the SAME round (same player id and name, same game, still playing)", meAfter?.id === me0?.id && gameAfter?.id === gid && gameAfter?.status === "playing", JSON.stringify({ sameSeat: meAfter?.id === me0?.id, sameGame: gameAfter?.id === gid, status: gameAfter?.status }));
  check("R2 question 1's answer is still recorded, exactly once", q2.length === 1 && q2[0] === q1[0], `${q2.length} recorded`);
  // Each screen's phase from its own DOM (review 6930033578), then both against the server's status (API).
  const isQuestion = (x) => /^Question \d+ of 10$/.test(x);
  const hostScr = (await until(async () => { const x = await phoneScreen(h); return isQuestion(x) ? x : null; }, 10000)) ?? await phoneScreen(h);
  const tvScr = (await until(async () => { const x = await tvScreen(tv); return tvPlaying(x) ? x : null; }, 10000)) ?? await tvScreen(tv);
  const serverStatus = gameAfter?.status;
  ev.seen.r2HostScreen = hostScr; ev.seen.r2TvScreen = tvScr; ev.seen.r2ServerStatus = serverStatus;
  check("R2 the host's screen (rendered) still shows the playing round: a Trivia question, no results", isQuestion(hostScr), hostScr);
  check("R2 the TV's screen (rendered) still shows the playing round: the featured question, each phone at its own pace", tvPlaying(tvScr), tvScr);
  check("R2 both rendered phases agree with the server's status (API): playing", serverStatus === "playing" && isQuestion(hostScr) && tvPlaying(tvScr), JSON.stringify({ server: serverStatus, host: hostScr, tv: tvScr }));

  // ---- R2b: a silent outage (no offline event, the socket not closed: traffic just stops) ----
  say(`R2b: a SILENT outage for ${DOWN_S} s: the page isn't told, its socket stays open, traffic stops both ways`);
  goSilent();
  const tStale = await until(async () => (await g.locator('[data-testid="mz-conn"].mz-conn--reconnecting').count()) > 0 ? Date.now() : null, DOWN_S * 1000);
  const tAwayS = await until(async () => (await apiGuest())?.connected === false ? Date.now() : null, Math.max(1000, DOWN_S * 1000 - (Date.now() - net.downAt)));
  await sleep(Math.max(0, DOWN_S * 1000 - (Date.now() - net.downAt)));
  ev.timings.r2bOutageSeconds = Math.round((Date.now() - net.downAt) / 100) / 10;
  ev.timings.r2bBannerAfterDropMs = tStale ? tStale - net.downAt : null;
  ev.timings.r2bApiMarkedAwayAfterDropMs = tAwayS ? tAwayS - net.downAt : null;
  const opensBeforeS = net.opens.length;
  endSilent();
  const upS = net.upAt;
  const tWsS = await until(() => (net.opens.length > opensBeforeS ? net.opens[opensBeforeS] : null), 30000, 50);
  const tBackS = await until(async () => (await apiGuest())?.connected === true ? Date.now() : null, 30000);
  const tUsableS = await until(async () => (await g.locator(`${QUESTION(2)} .mz-slab:not([disabled])`).count()) > 0 && (await g.locator('[data-testid="mz-conn"].mz-conn--reconnecting').count()) === 0 ? Date.now() : null, 30000);
  Object.assign(ev.timings, { r2bSocketReopenedMs: tWsS ? tWsS - upS : null, r2bApiMarkedBackMs: tBackS ? tBackS - upS : null, r2bPhoneUsableMs: tUsableS ? tUsableS - upS : null });
  check("R2b during the silent outage the app's own watchdog noticed (banner: reconnecting)", !!tStale, `after ${ev.timings.r2bBannerAfterDropMs} ms`);
  check("R2b after the path returns (no online event): socket reopened, the server marks the guest back (API), the phone usable on question 2 (rendered)", !!tWsS && !!tBackS && !!tUsableS, JSON.stringify({ socketMs: ev.timings.r2bSocketReopenedMs, apiBackMs: ev.timings.r2bApiMarkedBackMs, usableMs: ev.timings.r2bPhoneUsableMs }));
  const meS = (await myRoom(g)).players.find((p) => p.displayName === guestName);
  const gS = await guestGame();
  const qS = await answers();
  check("R2b the same seat and round, question 1 still recorded once", meS?.id === me0?.id && gS?.id === gid && gS?.status === "playing" && qS.length === 1, JSON.stringify({ sameSeat: meS?.id === me0?.id, sameGame: gS?.id === gid, recorded: qS.length }));

  // ---- R3: an interrupted submission, then an outage ----
  say(`R3: the guest answers question 2; the request reaches the server, its response is lost and the network goes down for ${LOST_DOWN_S} s`);
  net.loseNext = "then-down"; net.lost = null;
  await g.locator(`${QUESTION(2)} .mz-slab:not([disabled])`).first().click();
  await until(() => net.lost, 10000, 50);
  const notDelivered = await until(async () => /couldn’t confirm that/i.test(await text(g)), 8000);
  ev.seen.guestAfterLostAnswer = notDelivered ? "the phone said it couldn't confirm the answer (\"We couldn’t confirm that — check your connection. If it doesn’t show as in, try again.\")" : redact((await text(g)).replace(/\s+/g, " ").slice(0, 160));
  await sleep(Math.max(0, LOST_DOWN_S * 1000 - (Date.now() - net.downAt)));
  const opensBefore3 = net.opens.length;
  await goUp(gCtx);
  const up3 = net.upAt;
  const tLocked3 = await until(async () => (await g.locator(LOCKED).count()) > 0 ? Date.now() : null, 30000);
  const tWs3 = await until(() => (net.opens.length > opensBefore3 ? net.opens[opensBefore3] : null), 30000, 50);
  ev.timings.r3PhoneShowsAnswerInMs = tLocked3 ? tLocked3 - up3 : null;
  ev.timings.r3SocketReopenedMs = tWs3 ? tWs3 - up3 : null;
  ev.seen.guestAfterLostAnswerReturn = tLocked3 ? "question 2 shown as locked in" : redact((await text(g)).replace(/\s+/g, " ").slice(0, 160));
  check("R3 the lost-response request reached the server and was accepted", net.lost?.accepted === true, JSON.stringify({ status: net.lost?.status }));
  check("R3 while the network was down the phone did not claim the answer was in (it said it couldn't confirm)", !!notDelivered, ev.seen.guestAfterLostAnswer);
  check("R3 after the network returns the phone shows question 2's answer as in (the server's record)", !!tLocked3, `after ${ev.timings.r3PhoneShowsAnswerInMs} ms`);
  const q3 = await answers();
  check("R3 question 2 recorded exactly once (2 answers in total)", q3.length === 2, `${q3.length} recorded`);
  const replay = await g.evaluate(async (body) => { const roomId = sessionStorage.getItem("cgn_roomId"); const r = await fetch(`/rooms/${roomId}/intents`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, body }); return { status: r.status, body: await r.json().catch(() => ({})) }; }, net.lost?.request ?? "{}");
  const q3b = await answers();
  check("R3 replaying the very same request (same clientEventId) is answered from the dedupe and changes nothing", replay.status === 200 && replay.body?.accepted === true && q3b.length === 2, JSON.stringify({ status: replay.status, accepted: replay.body?.accepted, recorded: q3b.length }));
  const intent = JSON.parse(net.lost?.request ?? "{}").intent ?? {};
  const second = await api(g, "POST", "/rooms/:room/intents", { intent: { ...intent, clientEventId: randomUUID(), payload: { ...intent.payload, chosenIndex: ((intent.payload?.chosenIndex ?? 0) + 1) % 4 } } });
  check("R3 a different second answer to question 2 is refused (ALREADY_ANSWERED), so nothing can count twice", second.body?.accepted === false && second.body?.reason === "ALREADY_ANSWERED", JSON.stringify({ accepted: second.body?.accepted, reason: second.body?.reason }));

  // ---- R4: an interrupted submission with the network up (the phone's own retry) ----
  say("R4: question 3's first response is lost, the network stays up");
  await g.getByRole("button", { name: /^Next question$/ }).click();
  await g.locator(`${QUESTION(3)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 15000 });
  net.loseNext = "stay-up"; net.lost = null;
  const t4 = Date.now();
  await g.locator(`${QUESTION(3)} .mz-slab:not([disabled])`).first().click();
  const tLocked4 = await until(async () => (await g.locator(LOCKED).count()) > 0 ? Date.now() : null, 15000);
  const q4 = await answers();
  ev.timings.r4ShownInAfterTapMs = tLocked4 ? tLocked4 - t4 : null;
  check("R4 the lost first response was recovered by the phone's own retry: shown as in, recorded once (3 answers)", net.lost?.accepted === true && !!tLocked4 && q4.length === 3 && !/couldn’t confirm that/i.test(await text(g)), JSON.stringify({ shownInMs: ev.timings.r4ShownInAfterTapMs, recorded: q4.length }));

  // ---- R5: finish the round; the server's record (API), then each screen's rendered result ----
  if (CONTROL === "stale-host") {
    hostNet.down = true; hostNet.silent = true; hostNet.downAt = Date.now();
    say("CONTROL stale-host: the host's PAGE stops receiving updates now (its API calls, made outside the page, still work)");
  }
  say("R5: the guest finishes through the UI, the host through the API");
  for (let n = 4; n <= 10; n++) {
    await g.getByRole("button", { name: /^Next question$/ }).click();
    await g.locator(`${QUESTION(n)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 15000 });
    await g.locator(`${QUESTION(n)} .mz-slab:not([disabled])`).first().click();
    await g.locator(LOCKED).first().waitFor({ timeout: 15000 });
  }
  const hg = (await hostProj()).myGames?.find((x) => x.id === gid);
  // The guest taps each question's first option; the host answers the second, so their choices always differ and a
  // tie (where swapped rows would look the same) is unlikely. Whether the scores differ is recorded.
  for (const q of hg?.state?.questions ?? []) await hostApi("POST", "/rooms/:room/intents", { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action: "trivia-answer", payload: { questionId: q.id, chosenIndex: 1 } } });
  const fin = await until(async () => { const x = await guestGame(); return x?.status === "finished" ? x : null; }, 20000);
  const qs = fin?.state?.questions ?? [];
  const mine = fin?.state?.myAnswers ?? {};
  const expected = qs.reduce((s, q) => s + (typeof q.correctIndex === "number" && mine[q.id] === q.correctIndex ? 120 : 0), 0);
  const recorded = fin?.rawScores ?? {};
  const scored = recorded[me0?.id];
  ev.seen.final = { answersRecorded: Object.keys(mine).length, questions: qs.length, score: scored, expectedFromRecordedAnswers: expected };
  check("R5 the round finished with all 10 of the guest's answers recorded once (server record, API)", !!fin && Object.keys(mine).length === 10 && qs.length === 10, JSON.stringify({ recorded: Object.keys(mine).length }));
  check("R5 the guest's final score equals the score of the recorded answers, nothing counted twice (server record, API)", typeof scored === "number" && scored === expected && qs.every((q) => typeof q.correctIndex === "number"), JSON.stringify({ score: scored, expected }));
  // What each screen renders, read from its own DOM and compared with the server's recorded scores.
  const hostId = (await myRoom(g)).players.find((p) => p.displayName === hostName)?.id;
  const want = { [hostName]: recorded[hostId], [guestName]: recorded[me0?.id] };
  const asSeenBy = (self) => Object.fromEntries(Object.entries(want).map(([n, v]) => [n === self ? "You" : n, v]));
  // The TV's director jumps to its leaderboard and each phone to its standings step, as a person can on that screen;
  // both appear only once the screen itself shows the finished game.
  const tvFinal = await until(async () => {
    if (!tvFinished(await tvScreen(tv))) return null;
    await tv.getByRole("tab", { name: "Leaderboard" }).click({ timeout: 2000 }).catch(() => {});
    return rowsMatch(await tvRows(tv), want);
  }, 20000);
  const phoneFinal = (page, self) => until(async () => {
    if ((await phoneScreen(page)) !== "results") return null;
    await page.locator('[data-testid="mz-reveal-standings"]').click({ timeout: 2000 }).catch(() => {});
    return rowsMatch(await phoneRows(page), asSeenBy(self));
  }, 20000);
  const hostFinal = await phoneFinal(h, hostName);
  const guestFinal = await phoneFinal(g, guestName);
  const seenTv = { screen: await tvScreen(tv), rows: await tvRows(tv) }, seenHost = { screen: await phoneScreen(h), rows: await phoneRows(h) }, seenGuest = { screen: await phoneScreen(g), rows: await phoneRows(g) };
  ev.seen.r5Rendered = { recorded: want, distinctScores: want[hostName] !== want[guestName], tv: seenTv, host: seenHost, guest: seenGuest };
  check("R5 the TV's screen (rendered) shows the finished round with every recorded score", !!tvFinal, JSON.stringify(seenTv));
  check("R5 the host's screen (rendered) shows the finished round with every recorded score", !!hostFinal, JSON.stringify(seenHost));
  check("R5 the guest's screen (rendered) shows the finished round with every recorded score", !!guestFinal, JSON.stringify(seenGuest));

  ev.network = { abortedWhileDown: net.aborted, socketsRefusedWhileDown: net.refused, socketOpens: net.opens.length, hostAbortedWhileFrozen: hostNet.aborted, hostSocketsRefusedWhileFrozen: hostNet.refused };
  exitCode = ev.failures.length ? 1 : 0;
} catch (e) {
  check(`the run completed (${String(e?.message ?? e).split("\n")[0].slice(0, 160)})`, false);
  exitCode = 1;
} finally {
  clearTimeout(overall);
  await browser.close().catch(() => {});
  ev.finishedAt = new Date().toISOString(); ev.durationS = Math.round((Date.now() - T0) / 1000);
  ev.verdict = ev.failures.length ? "FAILED" : "PASSED";
  mkdirSync(opt("evidence"), { recursive: true });
  const out = redact(JSON.stringify(ev, null, 1));
  const leaked = [...secrets].filter((x) => x && x.length >= 6 && out.includes(x)).length;
  const file = join(opt("evidence"), `w3-${RUN}.json`);
  writeFileSync(file, out + "\n");
  if (leaked) { console.log(`FAIL the evidence holds ${leaked} secret value(s)`); exitCode = 1; }
  console.log(`evidence: ${file}`);
  if (CONTROL) console.log(`CONTROL ${CONTROL}: failed checks: ${ev.failures.length ? ev.failures.join(" | ") : "(none)"}`);
  console.log(`W3 REHEARSAL ${exitCode === 0 ? "PASSED" : "FAILED"}${ev.failures.length ? ` (${ev.failures.length} failure(s))` : ""}`);
  process.exit(exitCode);
}
