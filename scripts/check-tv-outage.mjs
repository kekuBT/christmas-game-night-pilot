// Stage 5.1 (S5-AUD-07): the TV says when what it shows may be out of date.
//   - Only the socket goes silent, polling works: no false alarm.
//   - Only polling fails, the socket works: no false alarm.
//   - The whole server stops: the TV says the connection is lost and keeps
//     the last known display; a phone shows its connection banner.
//   - The server restarts on the same data: the TV says it reconnected and
//     shows the room again.
//   - An invalid spectator session: told plainly, nothing private shown.
// Starts and stops ITS OWN server. Usage: node scripts/check-tv-outage.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
/** Holds for the whole window (no false alarm). */
async function never(label, fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn().catch(() => false)) { check(label, false, "it happened"); return false; } await sleep(250); }
  check(label, true); return true;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-tvout-"));
let srv = null;
let port = 0;
async function startServer(p = 0) {
  const env = { ...process.env, PORT: String(p), MCHEZO_DATA_DIR: DATA };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
  const proc = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  srv = proc; proc.out = "";
  proc.stdout.on("data", (d) => { proc.out += d; }); proc.stderr.on("data", (d) => { proc.out += d; });
  for (let i = 0; i < 120; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(proc.out); if (m) return Number(m[1]); await sleep(250); }
  throw new Error(`server did not start: ${proc.out.slice(-300)}`);
}
/**
 * Stops this driver's own server, never waiting without a bound: a server that already exited, or one still running
 * STOP_MS after SIGTERM, is a FAIL that shows the server's own last output, then it is killed so the run can finish.
 * (Full gate 20261112-064509-b668ee3c-28530 timed out here with nothing in its log.)
 */
const STOP_MS = 20_000;
const tail = (s) => JSON.stringify(s.out.slice(-600));
async function stopServer() {
  const s = srv; srv = null; if (!s) return;
  if (s.exitCode !== null || s.signalCode !== null) { check("the driver's server was still running when stopped", false, `it had already exited (${s.exitCode ?? s.signalCode}); its output: ${tail(s)}`); return; }
  const exited = new Promise((r) => s.once("exit", () => r(true)));
  s.kill("SIGTERM");
  if (await Promise.race([exited, sleep(STOP_MS).then(() => false)])) return;
  check(`the driver's server exits within ${STOP_MS / 1000} s of SIGTERM`, false, `its output: ${tail(s)}`);
  s.kill("SIGKILL"); await exited;
}
port = await startServer();
const BASE = () => `http://localhost:${port}`;
async function api(path, body) {
  const r = await fetch(`${BASE()}${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const room = await api("/rooms", { name: "TV outage" });
const host = await api(`/rooms/${room.roomId}/join`, { displayName: "Keku", asHost: true, hostClaimToken: room.hostClaimToken });
const browser = await launchChromium();
try {
  // A phone (the host) and the room's TV (a spectator), each in its own context.
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await pctx.newPage();
  await phone.goto(`${BASE()}/join`, { waitUntil: "domcontentloaded" });
  await phone.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { roomId: room.roomId, playerId: host.playerId, token: host.recoveryToken });
  await phone.goto(`${BASE()}/room`, { waitUntil: "domcontentloaded" });
  await phone.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });

  const tctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tv = await tctx.newPage();
  let tvWs = "pass", tvHttp = "pass";
  await tv.routeWebSocket(/.*/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => { if (tvWs !== "drop") ws.send(m); });
  });
  await tv.route(/\/projection\?/, (route) => (tvHttp === "fail" ? route.abort("connectionfailed") : route.continue()));
  await tv.goto(`${BASE()}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.joinCode);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
  // The note's state in ONE read (D-S101-11). The "reconnected" note goes away 4 s after it appears, so counting it and
  // then reading it in a second call can find it gone in between; getAttribute then waits its whole 30 s for an element
  // that no longer exists (full gate 20261112-122710-25c28143-13503).
  const tvNote = () => tv.evaluate(() => document.querySelector('[data-testid="tv-conn"]')?.getAttribute("data-state") ?? null);
  check("TV live: no connection note", (await tvNote()) === null);

  // 1. Only the socket goes silent: polling keeps the TV live.
  tvWs = "drop";
  await never("socket silent, polling works: the TV raises no false alarm (12 s)", async () => (await tvNote()) !== null, 12000);
  tvWs = "pass";
  // 2. Only polling fails: the socket's "alive" frames keep the TV live.
  tvHttp = "fail";
  await never("polling fails, socket works: the TV raises no false alarm (12 s)", async () => (await tvNote()) !== null, 12000);
  tvHttp = "pass";

  // 3. The whole server stops.
  const before = await tv.getByTestId("tv-show").innerText();
  await stopServer();
  await soon("server down: the TV says the connection is lost", async () => (await tvNote()) === "stale" && /Connection to the game lost/.test(await tv.getByTestId("tv-conn").innerText()), 15000);
  check("server down: the last known display stays on screen", (await tv.getByTestId("tv-show").count()) === 1 && (await tv.getByTestId("tv-show").innerText()).includes(room.joinCode), before.slice(0, 60));
  check("server down: the note is announced politely (role=status)", (await tv.getByTestId("tv-conn").getAttribute("role")) === "status" && (await tv.getByTestId("tv-conn").getAttribute("aria-live")) === "polite");
  const noteText = await tv.getByTestId("tv-conn").innerText();
  check("server down: the note shows nothing private (no tokens, codes or host tools)", !/token|recovery|host|password/i.test(noteText), noteText);
  await soon("server down: the phone shows its connection banner", async () => /Connection lost/.test(await phone.locator("body").innerText()), 15000);
  await tv.screenshot({ path: screenshotPath("docs/stage5-qa/after/tv-outage-stale-1440.png") });
  await phone.screenshot({ path: screenshotPath("docs/stage5-qa/after/phone-outage-390.png") });

  // 4. The server comes back on the same data.
  port = await startServer(port);
  await soon("server back: the TV says it reconnected", async () => (await tvNote()) === "restored", 30000);
  await tv.screenshot({ path: screenshotPath("docs/stage5-qa/after/tv-outage-restored-1440.png") });
  await soon("server back: the note goes away and the room is shown", async () => (await tvNote()) === null && (await tv.getByTestId("tv-show").innerText()).includes(room.joinCode), 15000);
  // A change after the restart reaches the TV.
  await api(`/rooms/join-by-code`, { joinCode: room.joinCode, displayName: "Amina" });
  await soon("server back: a new player shows on the TV", async () => /Amina/.test(await tv.getByTestId("tv-show").innerText()), 15000);
  await soon("server back: the phone is back too", async () => !/Connection lost/.test(await phone.locator("body").innerText()), 20000);

  // 5. An invalid spectator session.
  const bad = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await bad.goto(`${BASE()}/join`, { waitUntil: "domcontentloaded" });
  await bad.evaluate((rid) => { sessionStorage.setItem("cgn_spec_roomId", rid); sessionStorage.setItem("cgn_spec_token", "not-a-real-token"); }, room.roomId);
  await bad.goto(`${BASE()}/watch`, { waitUntil: "domcontentloaded" });
  await soon("invalid spectator session: told plainly to enter the code again", async () => /Spectator session expired|enter the code again/i.test(await bad.locator("body").innerText()), 15000);
  check("invalid spectator session: no room details shown", !(await bad.locator("body").innerText()).includes("Keku"));
} finally {
  await browser.close();
  await stopServer();
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "TV OUTAGE ALL PASSED" : `TV OUTAGE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
