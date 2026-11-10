// Review of PR #4 (P2): a poll whose reply sends its headers and then stalls
// part-way through the body must not freeze the screen's polling.
//   fetch() resolves on the headers. Stage 5.1 cleared the poll's timeout
//   there, so a body that stalled never timed out, and the one-at-a-time
//   guard then blocked every later poll, even after the network recovered.
//
// A streaming proxy sits in front of this driver's own server. Both pages'
// WebSockets are mocked and deliver nothing, so polling is the only way news
// reaches them. The proxy stalls the next projection poll of the phone and
// of the TV: headers, then "{", then nothing, held open until the driver
// ends. A player who joins after that must still reach both screens (the
// stalled poll times out and the next one goes through), and the proxy must
// see each stalled request cancelled by its page.
// Then (review of PR #5) the TV's next polls get a 500 whose body stalls. The
// TV skips such a reply without reading it, so it must close each one at
// once: no open replies may pile up, and the TV must keep updating.
// Playwright's own routing can't do this: it sends a reply whole or not at
// all, never headers and then part of the body.
// Starts and stops ITS OWN server. Usage: node scripts/check-poll-body-stall.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";

const POLL_TIMEOUT_MS = 6000; // apps/web/src/liveness.ts
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}

const DATA = mkdtempSync(join(tmpdir(), "mz-pollstall-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = 0;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { srv.kill("SIGTERM"); throw new Error(`server did not start: ${out.slice(-300)}`); }

// The proxy: everything streams through to the server, except a projection
// poll that is armed to stall.
const stallNext = { player: 0, spectator: 0 };
const stalls = []; // { audience, at, cancelledAt }
let errorStallNext = 0; // TV polls to answer with a 500 whose body stalls
const errorStalls = []; // { at, cancelledAt }
const proxy = createServer((req, res) => {
  const audience = /\/projection\?(?:.*&)?audience=(player|spectator)/.exec(req.url ?? "")?.[1];
  if (audience === "spectator" && errorStallNext > 0) {
    errorStallNext--;
    const s = { at: Date.now(), cancelledAt: null };
    errorStalls.push(s);
    res.writeHead(500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.flushHeaders();
    res.write("{");
    res.on("close", () => { s.cancelledAt = Date.now(); });
    return; // never ended by the proxy
  }
  if (audience && stallNext[audience] > 0) {
    stallNext[audience]--;
    const s = { audience, at: Date.now(), cancelledAt: null };
    stalls.push(s);
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.flushHeaders();
    res.write("{");
    res.on("close", () => { s.cancelledAt = Date.now(); }); // the page gave up and closed it
    return; // never ended by the proxy
  }
  const up = httpRequest({ host: "127.0.0.1", port, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${port}` } }, (ur) => {
    res.writeHead(ur.statusCode ?? 502, ur.headers);
    ur.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(up);
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const PROXY = `http://127.0.0.1:${proxy.address().port}`;

async function api(path, body) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const browser = await launchChromium();
try {
  const room = await api("/rooms", { name: "Poll stall" });
  const host = await api(`/rooms/${room.roomId}/join`, { displayName: "Keku", asHost: true, hostClaimToken: room.hostClaimToken });

  // The host's phone, with a socket that delivers nothing.
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await phone.routeWebSocket(/.*/, () => { /* mocked: never connects, delivers nothing */ });
  await phone.goto(`${PROXY}/join`, { waitUntil: "domcontentloaded" });
  await phone.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { roomId: room.roomId, playerId: host.playerId, token: host.recoveryToken });
  await phone.goto(`${PROXY}/room`, { waitUntil: "domcontentloaded" });
  await phone.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });

  // The room's TV (a spectator), the same.
  const tv = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await tv.routeWebSocket(/.*/, () => { /* mocked: never connects, delivers nothing */ });
  await tv.goto(`${PROXY}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.joinCode);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });

  const phoneShows = async (name) => (await phone.locator("body").innerText()).includes(name);
  const tvShows = async (name) => (await tv.getByTestId("tv-show").innerText()).includes(name);

  // 1. Polling alone keeps both screens current.
  await api("/rooms/join-by-code", { joinCode: room.joinCode, displayName: "Amina" });
  await soon("polling only: a new player (Amina) reaches the phone", () => phoneShows("Amina"), 10000);
  await soon("polling only: a new player (Amina) reaches the TV", () => tvShows("Amina"), 10000);

  // 2. The next poll of each page stalls part-way through its body.
  stallNext.player = 1; stallNext.spectator = 1;
  await soon("the phone's next poll is stalled after its headers and \"{\"", async () => stalls.some((s) => s.audience === "player"), 10000);
  await soon("the TV's next poll is stalled after its headers and \"{\"", async () => stalls.some((s) => s.audience === "spectator"), 10000);
  const stalledAt = Math.max(...stalls.map((s) => s.at));
  await api("/rooms/join-by-code", { joinCode: room.joinCode, displayName: "Bea" });

  // 3. Each stalled poll times out, its guard is released, and the next poll
  // brings the news. Stage 5.1 never got there: the guard stayed held.
  const window = POLL_TIMEOUT_MS + 9000;
  await soon(`after a stalled poll, a new player (Bea) still reaches the phone (within ${window / 1000} s)`, () => phoneShows("Bea"), window);
  await soon(`after a stalled poll, a new player (Bea) still reaches the TV (within ${window / 1000} s)`, () => tvShows("Bea"), window);
  for (const audience of ["player", "spectator"]) {
    const s = stalls.find((x) => x.audience === audience);
    const took = s?.cancelledAt ? s.cancelledAt - s.at : null;
    check(`${audience === "player" ? "phone" : "TV"}: the stalled request was cancelled by the page at its ${POLL_TIMEOUT_MS / 1000} s timeout`,
      took !== null && took >= POLL_TIMEOUT_MS - 500 && took <= POLL_TIMEOUT_MS + 4000,
      took === null ? "never cancelled" : `cancelled after ${(took / 1000).toFixed(1)} s`);
  }
  console.log(`(Bea joined ${((Date.now() - stalledAt) / 1000).toFixed(1)} s ago; ${stalls.length} poll(s) stalled in all)`);

  // 4. The TV's next three polls get a 500 whose body stalls after "{".
  errorStallNext = 3;
  await soon("the TV's next three polls get a 500 whose body stalls", async () => errorStalls.length === 3, 15000);
  await soon("TV: each skipped 500 reply is closed by the page at once (none left open)", async () => errorStalls.every((s) => s.cancelledAt !== null), 5000);
  const slowest = Math.max(...errorStalls.map((s) => (s.cancelledAt ?? Date.now()) - s.at));
  check("TV: each 500 reply was closed within 2 s, not at the 6 s timeout", slowest < 2000, `slowest ${(slowest / 1000).toFixed(1)} s`);
  await api("/rooms/join-by-code", { joinCode: room.joinCode, displayName: "Cai" });
  await soon("after the stalled 500 replies, a new player (Cai) still reaches the TV", () => tvShows("Cai"), 10000);
} finally {
  await browser.close();
  proxy.closeAllConnections?.();
  await new Promise((r) => proxy.close(() => r()));
  srv.kill("SIGTERM");
  await new Promise((r) => srv.once("exit", r));
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "POLL BODY STALL ALL PASSED" : `POLL BODY STALL FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
