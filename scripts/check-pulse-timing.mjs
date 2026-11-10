// Stage 5.1 (S5-AUD-02): can a player enter a correct Pattern Pulse
// sequence and lock it in before the answer window ends? Real timings (time
// scale 1), phone sizes 320×568, 375×667, 390×844, 430×932, and Reduced Motion.
// Measured for each:
//   - when the answer screen appears, against the server's memorise deadline;
//   - whether every symbol key and "Lock it in" are on screen WITHOUT
//     scrolling, and the time left is shown near them;
//   - the time a person tapping at ~0.7 s per shape needs, against the window;
//   - what happens when time runs out on a complete entry that wasn't locked.
// Prints a table; fails if a key or "Lock it in" needs scrolling, or the
// answer screen is late by more than 1 s. Scoring and windows are unchanged.
// Starts ITS OWN server. Usage: node scripts/check-pulse-timing.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
const DATA = mkdtempSync(join(tmpdir(), "mz-pptime-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const browser = await launchChromium();
const SIZES = [[320, 568, false], [375, 667, false], [390, 844, false], [430, 932, false], [375, 667, true]];
const TAP_MS = 700;
const rows = [];
try {
  for (const [w, h, reduced] of SIZES) {
    const label = `${w}×${h}${reduced ? " reduced motion" : ""}`;
    const room = await api("/rooms", { body: { name: "Pulse timing" } });
    const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: "Keku", asHost: true, hostClaimToken: room.hostClaimToken } });
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, ...(reduced ? { reducedMotion: "reduce" } : {}) });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { roomId: room.roomId, playerId: host.playerId, token: host.recoveryToken });
    await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
    await api(`/rooms/${room.roomId}/games`, { token: host.recoveryToken, body: { gameId: "pattern-pulse", official: false } });
    await p.getByTestId("briefing-ready").click({ timeout: 20000 });
    const mine = async () => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: host.recoveryToken })).myGames.at(-1).state;
    for (const round of [0, 1]) {
      await p.getByTestId("mz-pp-open").click({ timeout: 20000 });
      await p.getByTestId("mz-pp-memorise").waitFor({ timeout: 10000 });
      const seq = await p.locator('[data-testid="mz-pp-pattern"] li').evaluateAll((els) => els.map((e) => Number(e.dataset.symbol)));
      const open = (await mine()).open;
      await p.getByTestId("mz-pp-input").waitFor({ timeout: 20000 });
      const inputAt = Date.now();
      const lateMs = inputAt - open.showUntil;
      const windowMs = open.inputUntil - open.showUntil;
      const vis = await p.evaluate(() => {
        const inView = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0; };
        const keys = [...document.querySelectorAll('[data-testid^="mz-pp-key-"]')];
        return { keys: keys.length > 0 && keys.every(inView), lock: inView(document.querySelector('[data-testid="mz-pp-submit"]')), timer: inView(document.querySelector('[data-testid="mz-pp-timer"]')), scroll: document.scrollingElement.scrollTop };
      });
      if (round === 0) await p.screenshot({ path: screenshotPath(`docs/stage5-qa/after/pp-input-${w}x${h}${reduced ? "-reduced" : ""}.png`) });
      const t0 = Date.now();
      for (const s of seq) { await p.getByTestId(`mz-pp-key-${s}`).tap(); await sleep(TAP_MS); }
      const enteredMs = Date.now() - t0;
      const hint = await p.evaluate(() => { const el = document.querySelector('[data-testid="mz-pp-lockhint"]'); if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
      if (round === 0) {
        await p.getByTestId("mz-pp-submit").tap();
        const lockedAt = Date.now();
        await p.getByTestId("mz-pp-ready").waitFor({ timeout: 10000 });
        const last = (await mine()).results.at(-1);
        rows.push({ label, round: round + 1, shapes: seq.length, windowMs, lateMs, enterMs: enteredMs, lockAfterInputMs: lockedAt - inputAt, spareMs: open.inputUntil - lockedAt, points: last.points, hint, ...vis });
      } else {
        // Complete but never locked: what does the player get when time runs out?
        await p.getByTestId("mz-pp-ready").waitFor({ timeout: windowMs + 10000 });
        const last = (await mine()).results.at(-1);
        rows.push({ label, round: round + 1, shapes: seq.length, windowMs, lateMs, enterMs: enteredMs, lockAfterInputMs: null, spareMs: null, points: last.points, hint, unlockedExpiry: last.answer === null ? "missed: 0 points" : "counted", ...vis });
      }
    }
    await ctx.close();
  }
  console.log("PULSE TIMING TABLE");
  console.log("| size | round | shapes | window (ms) | screen late (ms) | entry at 0.7 s/tap (ms) | locked after input (ms) | spare (ms) | keys + Lock on screen | time shown | points |");
  for (const r of rows) console.log(`| ${r.label} | ${r.round} | ${r.shapes} | ${r.windowMs} | ${r.lateMs} | ${r.enterMs} | ${r.lockAfterInputMs ?? "not locked"} | ${r.spareMs ?? "—"} | ${r.keys && r.lock ? "yes" : `keys ${r.keys}, lock ${r.lock}`} | ${r.timer} | ${r.points}${r.unlockedExpiry ? ` (${r.unlockedExpiry})` : ""} |`);
  for (const r of rows) {
    check(`${r.label} round ${r.round}: the answer screen appears within 1 s of the memorise deadline`, r.lateMs <= 1000, `${r.lateMs} ms`);
    check(`${r.label} round ${r.round}: every shape key and "Lock it in" are on screen without scrolling`, r.keys && r.lock, JSON.stringify({ keys: r.keys, lock: r.lock }));
    check(`${r.label} round ${r.round}: the time left is shown near the keys`, r.timer);
    check(`${r.label} round ${r.round}: a complete entry says, on screen, to lock it in`, r.hint);
  }
  const unlocked = rows.filter((r) => r.unlockedExpiry);
  check("a complete entry not locked in by the end is recorded as missed (0), as designed — see the recommendation", unlocked.every((r) => r.points === 0));
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "PULSE TIMING ALL PASSED" : `PULSE TIMING FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
