// Beta R4 W3 (handoff 6929226094): a LOCAL rehearsal of the W3 reconnect check against the pinned runtime, in real
// browser pages (Chromium). It is a local test helper ONLY: it refuses any origin that isn't https://localhost or
// https://127.0.0.1 (the packaged image behind scripts/beta/render-like-proxy.mjs, see scripts/beta/w3-rehearsal.sh),
// it accepts the local self-signed certificate, and it never touches a hosting account. The native checks (a phone
// backgrounded and foregrounded, locked and unlocked, moved from Wi-Fi to mobile data) cannot be rehearsed here: they
// stay pending in docs/beta/render-w3.md.
//
//   node scripts/beta/w3-rehearsal.mjs --origin https://localhost:18443 --code-file <throwaway code> --evidence <dir>
//        [--down-seconds 15] [--lost-ack-down-seconds 8] [--max-minutes 8]
//
// One Casual Trivia round with a host, one guest and a TV, throwaway names. Only the guest's network is interrupted, by
// the test itself (Playwright): while "down", the page is offline (navigator.onLine false, 'offline' event), every HTTP
// request fails as a network error, its open sockets are closed, and new sockets are refused; "up" reverses all four.
//   R1  the guest answers question 1 normally: acknowledged ("Saved."), recorded once.
//   R2  OUTAGE between answers (question 2 on screen, unanswered), --down-seconds long: the guest's banner says it is
//       reconnecting; the host's view marks the guest away; after the network returns the guest is back in the SAME
//       seat and the SAME round on question 2, question 1 still recorded once; host and TV show the same public phase.
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
//   R5  The round is finished (guest through the UI, host through the API) and the guest's final score equals the score
//       computed from the guest's recorded answers and the revealed correct answers: no answer counted twice.
// Timings from the moment the network returns are recorded (socket reopened, host sees the guest back, the phone usable
// again) for the runbook's observation budget. The evidence records what each role SAW, never a hidden answer, a seat
// credential, a cookie or the room code: they are redacted, and the run fails if one is found in its own evidence.
// Exit: 0 "W3 REHEARSAL PASSED", 1 "W3 REHEARSAL FAILED", 2 bad options (before any network activity).
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { passBriefing } from "../lib/briefing.mjs";
import { launchChromium } from "../lib/driver-env.mjs";

// ---------- options, checked before anything else ----------
const argv = process.argv.slice(2);
const VALUED = new Set(["origin", "code-file", "evidence", "down-seconds", "lost-ack-down-seconds", "max-minutes"]);
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
  params: { downSeconds: DOWN_S, lostAckDownSeconds: LOST_DOWN_S, maxMinutes: MAX_MS / 60_000 },
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
// The room's public TV projection, read by the given page (the TV page itself, or a seated page) for a known room.
const tvRoom = (page, roomId) => page.evaluate(async (roomId) => (await (await fetch(`/rooms/${roomId}/projection?audience=tv`)).json()), roomId);
const text = (page) => page.evaluate(() => document.body.innerText).catch(() => "");
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

// ---------- the guest's network, controlled by the test ----------
const net = { down: false, silent: false, loseNext: null, lost: null, live: new Set(), opens: [], refused: 0, aborted: 0 };
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
  // The guest's network: HTTP through route(), sockets through routeWebSocket(); both obey net.down.
  await gCtx.route("**/*", async (route) => {
    const req = route.request();
    if (net.down) { net.aborted++; return route.abort("internetdisconnected"); }
    if (net.loseNext && req.method() === "POST" && /\/rooms\/[^/]+\/intents$/.test(new URL(req.url()).pathname)) {
      const mode = net.loseNext; net.loseNext = null;
      const resp = await route.fetch(); // the request reaches the server and is applied …
      const body = await resp.json().catch(() => ({}));
      net.lost = { at: Date.now(), status: resp.status(), accepted: body.accepted === true, request: req.postData() };
      if (mode === "then-down") await goDown(gCtx, "lost-ack");
      return route.abort("connectionreset"); // … but its response never reaches the phone
    }
    return route.continue();
  });
  await gCtx.routeWebSocket(/.*/, (ws) => {
    if (net.down) { net.refused++; ws.close(); return; }
    const server = ws.connectToServer();
    // Forward by hand, so a dead path can drop traffic both ways while the socket stays open (R2b).
    ws.onMessage((m) => { if (!net.down) server.send(m); });
    server.onMessage((m) => { if (!net.down) ws.send(m); });
    const rec = { ws, server }; net.live.add(rec); net.opens.push(Date.now());
    ws.onClose(() => { net.live.delete(rec); try { server.close(); } catch { /* closed */ } });
    server.onClose(() => { net.live.delete(rec); try { ws.close(); } catch { /* closed */ } });
  });

  const h = await hCtx.newPage(), g = await gCtx.newPage(), tv = await tCtx.newPage();
  const tag = RUN.slice(-6);
  const hostName = `Host-${tag}`, guestName = `Guest-${tag}`;
  const code = await hostRoom(h, hostName); secrets.add(code);
  await joinAs(g, guestName, code);
  await spectate(tv, code);
  for (const t of [await tokenOf(h), await tokenOf(g)]) if (t) secrets.add(t);
  const room0 = await myRoom(h);
  const start = await api(h, "POST", "/rooms/:room/games", { gameId: "trivia", official: false, roster: room0.readiness?.wouldPlay, attempt: { id: `w3-${RUN}`, sessionRevision: room0.session?.revision } });
  const gid = start.body?.gameId;
  await passBriefing([h, g]);
  await g.locator(`${QUESTION(1)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 30000 });
  const me0 = (await myRoom(g)).players.find((p) => p.displayName === guestName);
  const roomId = (await myRoom(h)).roomId;
  const guestId = me0?.id;
  const guestGame = async () => (await myRoom(g)).myGames.find((x) => x.id === gid);
  const answers = async () => Object.keys((await guestGame())?.state?.myAnswers ?? {});
  const hostSeesGuest = async () => (await myRoom(h)).players.find((p) => p.displayName === guestName);
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
  const tAway = await until(async () => (await hostSeesGuest())?.connected === false ? Date.now() : null, DOWN_S * 1000);
  ev.seen.hostViewOfGuestDuringOutage = (await hostSeesGuest().catch(() => null))?.connected === false ? "not connected (away)" : "still connected";
  ev.seen.tvDuringOutage = (await tvShowsPlaying()) ? "the round still playing" : "not the playing round";
  await sleep(Math.max(0, DOWN_S * 1000 - (Date.now() - net.downAt)));
  ev.timings.outageSeconds = Math.round((Date.now() - net.downAt) / 100) / 10;
  ev.timings.bannerAfterDropMs = tBanner ? tBanner - net.downAt : null;
  ev.timings.hostSawAwayAfterDropMs = tAway ? tAway - net.downAt : null;
  const opensBefore = net.opens.length;
  await goUp(gCtx);
  const up = net.upAt;
  const tWs = await until(() => (net.opens.length > opensBefore ? net.opens[opensBefore] : null), 30000, 50);
  const tBack = await until(async () => (await hostSeesGuest())?.connected === true ? Date.now() : null, 30000);
  const timeline = [];
  const tUsable = await until(async () => {
    const st = { t: Date.now() - up, banner: await g.locator('[data-testid="mz-conn"]').first().getAttribute("class").catch(() => "none"), slabs: await g.locator(`${QUESTION(2)} .mz-slab:not([disabled])`).count(), sockets: net.live.size };
    const key = JSON.stringify({ ...st, t: 0 });
    if (!timeline.length || timeline[timeline.length - 1].key !== key) timeline.push({ ...st, key });
    return st.slabs > 0 && !/reconnecting/.test(st.banner ?? "") ? Date.now() : null;
  }, 30000);
  ev.seen.r2AfterReturnTimeline = timeline.map(({ key: _k, ...x }) => x);
  ev.seen.guestAfterReturn = redact((await g.locator('[data-testid="mz-conn"]').first().innerText({ timeout: 1000 }).catch(() => "(no banner)")).replace(/\s+/g, " "));
  Object.assign(ev.timings, { r2SocketReopenedMs: tWs ? tWs - up : null, r2HostSawGuestBackMs: tBack ? tBack - up : null, r2PhoneUsableMs: tUsable ? tUsable - up : null });
  check("R2 during the outage the guest's screen says it is reconnecting", !!tBanner, ev.seen.guestDuringOutage);
  check("R2 during the outage the host's view marks the guest away", !!tAway, `after ${ev.timings.hostSawAwayAfterDropMs} ms`);
  const meAfter = (await myRoom(g)).players.find((p) => p.displayName === guestName);
  const gameAfter = await guestGame();
  const q2 = await answers();
  check("R2 after the network returns: socket reopened, host sees the guest back, the phone usable on question 2", !!tWs && !!tBack && !!tUsable, JSON.stringify({ socketMs: ev.timings.r2SocketReopenedMs, hostMs: ev.timings.r2HostSawGuestBackMs, usableMs: ev.timings.r2PhoneUsableMs }));
  check("R2 the SAME seat and the SAME round (same player id and name, same game, still playing)", meAfter?.id === me0?.id && gameAfter?.id === gid && gameAfter?.status === "playing", JSON.stringify({ sameSeat: meAfter?.id === me0?.id, sameGame: gameAfter?.id === gid, status: gameAfter?.status }));
  check("R2 question 1's answer is still recorded, exactly once", q2.length === 1 && q2[0] === q1[0], `${q2.length} recorded`);
  const hostTv = await tvRoom(h, roomId), tvTv = await tvRoom(tv, roomId);
  const phase = (p) => { const x = (p.games ?? []).find((y) => y.id === gid); return x ? { status: x.status, phaseKey: x.lifecycle?.phaseKey ?? null } : null; };
  check("R2 the host and the TV show the same public phase", JSON.stringify(phase(hostTv)) === JSON.stringify(phase(tvTv)) && phase(tvTv)?.status === "playing" && await tvShowsPlaying(), JSON.stringify({ host: phase(hostTv), tv: phase(tvTv) }));

  // ---- R2b: a silent outage (no offline event, the socket not closed: traffic just stops) ----
  say(`R2b: a SILENT outage for ${DOWN_S} s: the page isn't told, its socket stays open, traffic stops both ways`);
  goSilent();
  const tStale = await until(async () => (await g.locator('[data-testid="mz-conn"].mz-conn--reconnecting').count()) > 0 ? Date.now() : null, DOWN_S * 1000);
  const tAwayS = await until(async () => (await hostSeesGuest())?.connected === false ? Date.now() : null, Math.max(1000, DOWN_S * 1000 - (Date.now() - net.downAt)));
  await sleep(Math.max(0, DOWN_S * 1000 - (Date.now() - net.downAt)));
  ev.timings.r2bOutageSeconds = Math.round((Date.now() - net.downAt) / 100) / 10;
  ev.timings.r2bBannerAfterDropMs = tStale ? tStale - net.downAt : null;
  ev.timings.r2bHostSawAwayAfterDropMs = tAwayS ? tAwayS - net.downAt : null;
  const opensBeforeS = net.opens.length;
  endSilent();
  const upS = net.upAt;
  const tWsS = await until(() => (net.opens.length > opensBeforeS ? net.opens[opensBeforeS] : null), 30000, 50);
  const tBackS = await until(async () => (await hostSeesGuest())?.connected === true ? Date.now() : null, 30000);
  const tUsableS = await until(async () => (await g.locator(`${QUESTION(2)} .mz-slab:not([disabled])`).count()) > 0 && (await g.locator('[data-testid="mz-conn"].mz-conn--reconnecting').count()) === 0 ? Date.now() : null, 30000);
  Object.assign(ev.timings, { r2bSocketReopenedMs: tWsS ? tWsS - upS : null, r2bHostSawGuestBackMs: tBackS ? tBackS - upS : null, r2bPhoneUsableMs: tUsableS ? tUsableS - upS : null });
  check("R2b during the silent outage the app's own watchdog noticed (banner: reconnecting)", !!tStale, `after ${ev.timings.r2bBannerAfterDropMs} ms`);
  check("R2b after the path returns (no online event): socket reopened, host sees the guest back, the phone usable on question 2", !!tWsS && !!tBackS && !!tUsableS, JSON.stringify({ socketMs: ev.timings.r2bSocketReopenedMs, hostMs: ev.timings.r2bHostSawGuestBackMs, usableMs: ev.timings.r2bPhoneUsableMs }));
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

  // ---- R5: finish the round and check the score ----
  say("R5: the guest finishes through the UI, the host through the API");
  for (let n = 4; n <= 10; n++) {
    await g.getByRole("button", { name: /^Next question$/ }).click();
    await g.locator(`${QUESTION(n)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 15000 });
    await g.locator(`${QUESTION(n)} .mz-slab:not([disabled])`).first().click();
    await g.locator(LOCKED).first().waitFor({ timeout: 15000 });
  }
  const hg = (await myRoom(h)).myGames.find((x) => x.id === gid);
  for (const q of hg?.state?.questions ?? []) await api(h, "POST", "/rooms/:room/intents", { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action: "trivia-answer", payload: { questionId: q.id, chosenIndex: 0 } } });
  const fin = await until(async () => { const x = await guestGame(); return x?.status === "finished" ? x : null; }, 20000);
  const qs = fin?.state?.questions ?? [];
  const mine = fin?.state?.myAnswers ?? {};
  const expected = qs.reduce((s, q) => s + (typeof q.correctIndex === "number" && mine[q.id] === q.correctIndex ? 120 : 0), 0);
  const tvFin = await tvRoom(tv, roomId);
  const scored = (tvFin.games ?? []).find((x) => x.id === gid)?.rawScores?.[me0?.id] ?? fin?.rawScores?.[me0?.id];
  ev.seen.final = { answersRecorded: Object.keys(mine).length, questions: qs.length, score: scored, expectedFromRecordedAnswers: expected };
  check("R5 the round finished with all 10 of the guest's answers recorded once", !!fin && Object.keys(mine).length === 10 && qs.length === 10, JSON.stringify({ recorded: Object.keys(mine).length }));
  check("R5 the guest's final score equals the score of the recorded answers (nothing counted twice)", typeof scored === "number" && scored === expected && qs.every((q) => typeof q.correctIndex === "number"), JSON.stringify({ score: scored, expected }));
  check("R5 the host and the TV converge on the finished round", await until(async () => /Game finished/i.test(await text(tv)), 20000) && phase(await tvRoom(h, roomId))?.status === "finished", "");

  ev.network = { abortedWhileDown: net.aborted, socketsRefusedWhileDown: net.refused, socketOpens: net.opens.length };
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
  console.log(`W3 REHEARSAL ${exitCode === 0 ? "PASSED" : "FAILED"}${ev.failures.length ? ` (${ev.failures.length} failure(s))` : ""}`);
  process.exit(exitCode);
}
