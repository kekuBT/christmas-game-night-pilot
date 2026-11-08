// D3 (owner-approved 2026-11-08): the rules-and-ready briefing, end to end
// in real browsers (docs/ux-redesign/D3_TIMING_CONTRACT.md).
//
// Starts ITS OWN server (free port, temp data dir, the gate's build when
// MCHEZO_WEB_DIST is set) with MCHEZO_LIFECYCLE_SCALE=0.1, the test-only
// setting check-lifecycle uses: the 20 s read window becomes 2 s, the
// warning arrives at 24 s and the cancellation at 30 s. The reconnect grace
// (45 s) is not scaled. The base URL argument is ignored.
//
// Checks:
//  A. Secrecy and readiness: every phone and the spectator TV show the
//     rules and who is ready; no question exists anywhere, on screen or in
//     any projection. Ready is visible to everyone, can be withdrawn, and
//     survives a refresh; a dropped phone shows as reconnecting.
//  B. Fairness: players who read at different speeds get the same server
//     deadline, derived from the single moment the last one was ready. No
//     intro follows; the question is on every phone.
//  C. Start now: locked for the read window; the confirmation names exactly
//     who isn't ready (not the host); a withdrawal while the dialog is open
//     makes it ask again; nobody loses their seat.
//  D. The stall guard: a visible warning on every screen, then the
//     briefing is cancelled with nothing left behind, and everyone is told.
//     The host's Cancel does the same at once.
// Usage: node scripts/check-briefing.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const SCALE = 0.1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function expectSoon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; }
    await sleep(200);
  }
  check(label, false, `not observed within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`);
  return false;
}

const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-briefing-"));
async function startServer() {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR, MCHEZO_LIFECYCLE_SCALE: String(SCALE), MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
  delete env.NODE_ENV;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  let port = null;
  for (let i = 0; i < 120 && port === null && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) port = Number(m[1]); else await sleep(250);
  }
  if (!port) throw new Error(`briefing server did not start: ${out.slice(-400)}`);
  return { child, port };
}

let BASE = "";
async function createRoom(page, name) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300);
  }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function spectate(page, code) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
}
/** This phone's own player projection (its session, as the app fetches it). */
async function myProj(page) {
  return page.evaluate(async () => {
    const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=player`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } });
    return r.json();
  });
}
async function tvProj(page) {
  return page.evaluate(async () => (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=tv`)).json());
}
async function choose(host, gameId, mode) {
  await host.getByTestId("choose-game").click();
  await host.getByTestId(`select-game-${gameId}`).click();
  await host.getByTestId(`mode-${mode}`).click();
  await host.getByTestId(`start-${mode}-${gameId}`).click();
}
const personOf = (page, id) => page.getByTestId(`briefing-person-${id}`);
async function endGameBySittingOut(pages) {
  for (const p of pages) await p.getByRole("button", { name: "Sit this game out" }).click({ timeout: 15000 }).catch(() => {});
  for (const p of pages) {
    const back = p.getByRole("button", { name: "Back to lobby" });
    if (await back.waitFor({ timeout: 20000 }).then(() => true, () => false)) await back.click().catch(() => {});
  }
}

const server = await startServer();
BASE = `http://localhost:${server.port}`;
const browser = await launchChromium();
try {
  const vp = { viewport: { width: 390, height: 844 } };
  const adaCtx = await browser.newContext(vp);
  const beaCtx = await browser.newContext(vp);
  const calCtx = await browser.newContext(vp);
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ada = await adaCtx.newPage();
  const code = await createRoom(ada, "Ada");
  const bea = await beaCtx.newPage();
  await joinRoom(bea, "Bea", code);
  const cal = await calCtx.newPage();
  await joinRoom(cal, "Cal", code);
  const tv = await tvCtx.newPage();
  await spectate(tv, code);
  const ids = Object.fromEntries(((await tvProj(ada)).players ?? []).map((p) => [p.displayName, p.id]));
  const phones = [ada, bea, cal];

  // ---------------- A. Secrecy and readiness ----------------
  await choose(ada, "trivia", "official");
  for (const [p, n] of [[ada, "Ada"], [bea, "Bea"], [cal, "Cal"]]) await expectSoon(`A. ${n}'s phone shows the rules briefing`, async () => (await p.getByTestId("briefing").count()) === 1);
  await expectSoon("A. the spectator TV shows the rules and who is ready", async () => (await tv.getByTestId("tv-briefing").count()) === 1 && (await tv.getByTestId("briefing-people").count()) === 1);
  check("A. no question or answer control on any screen", (await Promise.all([...phones, tv].map(async (p) => (await p.locator(".mz-question, .mz-slab").count()) === 0))).every(Boolean));
  // The TV/spectator projection is the public one; any page may fetch it.
  const projs = [...(await Promise.all(phones.map(myProj))), await tvProj(ada)];
  const briefGames = projs.flatMap((pr) => [...(pr.games ?? []), ...(pr.myGames ?? [])]).filter((g) => g.status === "briefing");
  check("A. every projection carries the briefing and no game state, questions or deadline",
    briefGames.length === 7 && briefGames.every((g) => g.state === undefined && g.questions === undefined && g.deadlineAt === undefined && g.phaseDeadlineAt === undefined),
    `${briefGames.length} entries`);
  check("A. the rules show the real time limit", /about 1 minute/.test(await ada.getByTestId("briefing-timing").innerText()));
  check("A. it says whether it counts", /Official/.test(await ada.getByTestId("briefing-mode").innerText()));
  await bea.screenshot({ path: screenshotPath("docs/ux-redesign/d3/01-briefing-phone.png") });
  await tv.screenshot({ path: screenshotPath("docs/ux-redesign/d3/02-briefing-tv.png") });

  await bea.getByTestId("briefing-ready").click();
  await expectSoon("A. Bea's Ready shows on Ada's phone", async () => (await personOf(ada, ids.Bea).getAttribute("data-ready")) === "true");
  await expectSoon("A. ...and on the spectator TV", async () => (await personOf(tv, ids.Bea).getAttribute("data-ready")) === "true");
  check("A. Bea's own button says she's ready", (await bea.getByTestId("briefing-ready").getAttribute("aria-pressed")) === "true");
  await bea.getByTestId("briefing-ready").click();
  await expectSoon("A. Bea can take it back: everyone sees her not ready", async () => (await personOf(ada, ids.Bea).getAttribute("data-ready")) === "false" && (await personOf(tv, ids.Bea).getAttribute("data-ready")) === "false");
  await bea.getByTestId("briefing-ready").click();
  await expectSoon("A. Bea is ready again", async () => (await personOf(ada, ids.Bea).getAttribute("data-ready")) === "true");
  await bea.reload({ waitUntil: "domcontentloaded" });
  await expectSoon("A. a refresh lands Bea back on the rules, still ready", async () => (await bea.getByTestId("briefing").count()) === 1 && (await bea.getByTestId("briefing-ready").getAttribute("aria-pressed")) === "true");
  await calCtx.setOffline(true);
  await expectSoon("A. Cal's dropped phone shows as reconnecting to the room", async () => (await personOf(ada, ids.Cal).getAttribute("data-presence")) === "reconnecting", 20000);
  await calCtx.setOffline(false);
  await expectSoon("A. Cal is back: connected, rules still on his phone", async () => (await personOf(ada, ids.Cal).getAttribute("data-presence")) === "connected" && (await cal.getByTestId("briefing").count()) === 1, 25000);
  check("A. still no game has started (nobody else was ready)", (await tvProj(ada)).games.some((g) => g.status === "briefing"));

  // ---------------- B. Fairness: one instant for everyone ----------------
  await sleep(1500); // Cal reads slower than Bea
  await cal.getByTestId("briefing-ready").click();
  await sleep(1500); // and Ada slower still
  await ada.getByTestId("briefing-ready").click();
  for (const [p, n] of [[ada, "Ada"], [bea, "Bea"], [cal, "Cal"]]) await expectSoon(`B. ${n} is in the game the moment the last player is ready`, async () => (await p.locator(".mz-question").count()) === 1, 10000);
  const seen = await Promise.all(phones.map(myProj));
  const mine = seen.map((pr) => (pr.myGames ?? []).find((g) => g.status === "playing"));
  const deadlines = new Set(mine.map((g) => g?.deadlineAt));
  check("B. every phone has the identical server deadline", deadlines.size === 1 && mine.every(Boolean), [...deadlines].join(","));
  check("B. the deadline is the game's window after the moment play began", mine[0] && mine[0].deadlineAt - mine[0].playStartedAt === Math.round(6 * 60_000 * SCALE), `${mine[0]?.deadlineAt} - ${mine[0]?.playStartedAt}`);
  check("B. no intro countdown follows the briefing", (await Promise.all(phones.map(async (p) => (await p.getByTestId("show-intro").count()) === 0 && (await p.locator(".mz-intro").count()) === 0))).every(Boolean));
  await endGameBySittingOut(phones);

  // ---------------- C. Start now: read window and consent ----------------
  await ada.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 20000 });
  await choose(ada, "guess-the-year", "official");
  await ada.getByTestId("briefing-start-now").waitFor({ timeout: 15000 });
  check("C. Start now is locked during the read window", await ada.getByTestId("briefing-start-now").isDisabled());
  check("C. guests have no Start now or Cancel", (await bea.getByTestId("briefing-start-now").count()) === 0 && (await bea.getByTestId("briefing-cancel").count()) === 0);
  await bea.getByTestId("briefing-ready").click();
  await expectSoon("C. Start now unlocks after the read window", async () => !(await ada.getByTestId("briefing-start-now").isDisabled()), 10000);
  await ada.getByTestId("briefing-start-now").click();
  await ada.getByTestId("briefing-confirm").waitFor({ timeout: 5000 });
  const listed = await ada.getByTestId("briefing-confirm-list").innerText();
  check("C. the confirmation names Cal (not ready) and not the host or Bea", /Cal: not ready yet/.test(listed) && !/Ada/.test(listed) && !/Bea/.test(listed), listed);
  await ada.getByTestId("briefing-confirm").scrollIntoViewIfNeeded();
  await ada.screenshot({ path: screenshotPath("docs/ux-redesign/d3/03-start-now-confirm.png") });
  await ada.getByTestId("briefing-confirm-cancel").click();
  check("C. Keep waiting starts nothing", (await ada.getByTestId("briefing").count()) === 1 && (await tvProj(ada)).games.some((g) => g.status === "briefing"));
  await ada.getByTestId("briefing-start-now").click();
  await ada.getByTestId("briefing-confirm").waitFor({ timeout: 5000 });
  await bea.getByTestId("briefing-ready").click(); // Bea withdraws while the host's dialog is open
  await expectSoon("C. (Bea's withdrawal reached the host)", async () => (await personOf(ada, ids.Bea).getAttribute("data-ready")) === "false");
  await ada.getByTestId("briefing-confirm-confirm").click();
  await expectSoon("C. a stale confirmation is asked again, now naming Bea too", async () => {
    const t = await ada.getByTestId("briefing-confirm-list").innerText().catch(() => "");
    return (await ada.getByTestId("briefing-confirm-changed").count()) === 1 && /Bea/.test(t) && /Cal/.test(t);
  }, 8000);
  check("C. still nothing started", (await tvProj(ada)).games.some((g) => g.status === "briefing"));
  await ada.getByTestId("briefing-confirm-confirm").click();
  await expectSoon("C. confirmed: play begins for everyone", async () => (await bea.getByTestId("mz-year-progress").count()) === 1 && (await cal.getByTestId("mz-year-progress").count()) === 1, 10000);
  const yearGame = (await tvProj(ada)).games.find((g) => g.gameId === "guess-the-year");
  check("C. nobody lost their seat", yearGame?.players?.length === 3, JSON.stringify(yearGame?.players));
  await endGameBySittingOut(phones);

  // ---------------- D. Stall guard and Cancel ----------------
  await ada.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 20000 });
  await choose(ada, "trivia", "practice");
  await ada.getByTestId("briefing").waitFor({ timeout: 15000 });
  const briefId = (await tvProj(ada)).games.find((g) => g.status === "briefing")?.id;
  check("D. no warning at first", (await ada.getByTestId("briefing-warning").count()) === 0);
  for (const [p, n] of [[ada, "Ada"], [bea, "Bea"], [tv, "the TV"]]) await expectSoon(`D. the cancellation warning appears for ${n}`, async () => (await p.getByTestId("briefing-warning").count()) === 1, 35000);
  check("D. the warning says nothing will be scored", /Nothing will be scored/.test(await ada.getByTestId("briefing-warning").innerText()));
  await bea.screenshot({ path: screenshotPath("docs/ux-redesign/d3/04-warning.png") });
  await expectSoon("D. the briefing is cancelled: everyone is back in the lobby and told why", async () => (await ada.getByTestId("briefing-cancelled-note").count()) === 1 && (await bea.getByTestId("briefing-cancelled-note").count()) === 1, 15000);
  const after = await tvProj(ada);
  check("D. no game is left behind", !after.games.some((g) => g.id === briefId) && !after.games.some((g) => g.status === "briefing"));
  check("D. standings are untouched (the practice game never ran)", JSON.stringify(after.officialStandings) === JSON.stringify(seen[0].officialStandings), JSON.stringify(after.officialStandings));
  await bea.screenshot({ path: screenshotPath("docs/ux-redesign/d3/05-cancelled-note.png") });

  await choose(ada, "trivia", "practice");
  await ada.getByTestId("briefing-cancel").click();
  await ada.getByTestId("briefing-cancel-confirm").waitFor({ timeout: 5000 });
  await ada.getByTestId("briefing-cancel-confirm-confirm").click();
  await expectSoon("D. the host's Cancel ends the briefing at once for everyone", async () => (await bea.getByTestId("briefing").count()) === 0 && (await bea.getByTestId("briefing-cancelled-note").count()) === 1, 10000);
  check("D. no horizontal overflow on the phone screens", (await Promise.all(phones.map((p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)))).every(Boolean));
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
  rmSync(DATA_DIR, { recursive: true, force: true });
}
console.log(failures === 0 ? "BRIEFING ALL PASSED" : `BRIEFING FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
