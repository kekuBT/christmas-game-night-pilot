// Sprint 4: the Word Connections experience, end to end, in real browsers.
// Starts its own server (like check-lifecycle) with the test-only time scale
// so the game's 8-minute limit passes in 48 s, and the test content mode.
// The test oracle (scripts/lib/content-oracle.mjs) knows the board's groups.
// Usage: node scripts/check-connections.mjs   (base URL argument ignored)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { connectionsBoard } from "./lib/content-oracle.mjs";
import { lifecycleDiagnosis } from "./lib/diagnose.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`);
  return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-cx-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, MCHEZO_LIFECYCLE_SCALE: "0.1", MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = "";
srv.stdout.on("data", (d) => { out += d; });
srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;

async function createRoom(page, name) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(250); }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
const tileTexts = async (page) => (await page.getByTestId("mz-cx-tile").allInnerTexts()).map((t) => t.trim());
async function pick(page, words) {
  for (const w of words) await page.getByTestId("mz-cx-tile").filter({ hasText: new RegExp(`^${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).first().click();
}
const bodyText = (page) => page.evaluate(() => document.body.innerText);

const browser = await launchChromium();
try {
  const mk = async (w) => (await browser.newContext({ viewport: { width: w, height: 844 } })).newPage();
  const ada = await mk(390), bea = await mk(390), cal = await mk(320);
  const calCtx = cal.context();
  const code = await createRoom(ada, "Ada");
  await joinRoom(bea, "Bea", code);
  await joinRoom(cal, "Cal", code);
  // Host starts through the real lobby controls.
  await ada.getByTestId("choose-game").click();
  await ada.getByTestId("select-game-word-connections").click();
  await ada.getByTestId("start-official-word-connections").click();
  const decision = ada.getByTestId("mz-start-decision");
  if (await decision.waitFor({ timeout: 2000 }).then(() => true, () => false)) await ada.getByTestId("start-official-word-connections").click();

  // Intro: objective in plain words, one obvious button.
  // D3: the rules briefing explains the objective before any clock runs.
  await soon("the briefing explains the objective", async () => /Find four groups of four/.test(await bodyText(bea)) && (await bea.getByTestId("briefing").count()) === 1);
  await bea.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cx-01-intro.png") });
  await passBriefing([ada, bea, cal]);
  for (const p of [ada, bea, cal]) await p.getByTestId("mz-cx").waitFor({ timeout: 15000 });
  const words = await tileTexts(ada);
  check("16 tiles", words.length === 16, words.join(","));
  const board = connectionsBoard(words);
  const groups = board.map((g) => g.words);
  const cxNames = board.map((g) => g.name);
  // Tiles are never in answer order.
  const groupIndex = (w) => groups.findIndex((g) => g.some((x) => x.toLowerCase() === w.toLowerCase()));
  check("tiles are shuffled (the first four are not one group)", new Set(words.slice(0, 4).map(groupIndex)).size > 1);
  for (const w of [320, 360, 390]) {
    await cal.setViewportSize({ width: w, height: 844 });
    await sleep(250);
    check(`no horizontal overflow at ${w}px`, await cal.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const sizes = await cal.getByTestId("mz-cx-tile").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    check(`tiles are at least 44px at ${w}px`, sizes.every((s) => s >= 44), String(Math.min(...sizes)));
  }
  await cal.setViewportSize({ width: 320, height: 844 });

  // Selection: tap to select, tap again to deselect; Submit waits for four.
  const submit = ada.getByTestId("mz-cx-submit");
  await pick(ada, [groups[0][0]]);
  check("a tapped tile is marked selected (aria-pressed)", (await ada.locator('[data-testid="mz-cx-tile"][aria-pressed="true"]').count()) === 1);
  await pick(ada, [groups[0][0]]);
  check("tapping again deselects", (await ada.locator('[data-testid="mz-cx-tile"][aria-pressed="true"]').count()) === 0);
  check("Submit is disabled until four are picked", await submit.isDisabled());

  // A wrong guess: three from one group plus one other ("one away").
  await pick(ada, [...groups[3].slice(0, 3), groups[2][0]]);
  await sleep(300);
  await ada.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cx-02-selecting.png") });
  let posts = 0;
  ada.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/intents")) posts++; });
  await submit.click();
  await submit.click({ force: true, timeout: 300 }).catch(() => {}); // impatient double tap
  await soon("one-away feedback after a near miss", async () => /One away/.test(await ada.getByTestId("mz-cx-feedback").innerText()));
  check("a double tap sends one guess", posts === 1, String(posts));
  check("mistake dots show 3 left", /3 mistakes left/.test((await ada.locator(".mz-cx-status").getAttribute("aria-label")) ?? ""));
  // Trying the same wrong group again is caught before it costs anything.
  await pick(ada, [...groups[3].slice(0, 3), groups[2][0]]);
  await submit.click();
  await soon("re-trying the same group is refused locally", async () => /already tried/.test(await ada.getByTestId("mz-cx-feedback").innerText()));
  await ada.getByRole("button", { name: "Deselect" }).click();

  // Correct groups: bands appear with their names; tiles leave the grid.
  for (const [k, g] of groups.entries()) {
    await pick(ada, g);
    await submit.click();
    await soon(`group ${k + 1} found shows a band`, async () => (await ada.getByTestId("mz-cx-band").count()) === k + 1);
    if (k === 0) {
      await sleep(400);
      await ada.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cx-03-group-found.png") });
      const adaText = await bodyText(ada);
      check("Ada sees the name of the group she found, not the others", adaText.includes(cxNames[0]) && !cxNames.slice(1).some((n) => adaText.includes(n)));
    }
  }
  await soon("Ada's puzzle is solved", async () => /Puzzle solved|All four groups/.test(await bodyText(ada)));
  await ada.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cx-04-solved-waiting.png") });

  // Bea plays badly: four wrong guesses end her puzzle (allowed mistakes).
  const wrongs = [[groups[0][0], groups[1][0], groups[2][0], groups[3][0]], [groups[0][1], groups[1][1], groups[2][1], groups[3][1]], [groups[0][2], groups[1][2], groups[2][2], groups[3][2]], [groups[0][3], groups[1][3], groups[2][3], groups[3][3]]];
  for (const w of wrongs) { await pick(bea, w); await bea.getByTestId("mz-cx-submit").click(); await sleep(700); }
  await soon("four mistakes end Bea's puzzle", async () => /Out of guesses/.test(await bodyText(bea)));
  // Privacy: Bea never sees the group names she didn't find, even now.
  const beaText = await bodyText(bea);
  check("unsolved group names stay hidden until the game ends", !groups.some((_, i) => beaText.includes((cxNames[i] ?? "\u0000"))));

  // Cal solves one group, loses connection, comes back with it intact.
  await pick(cal, groups[1]);
  await cal.getByTestId("mz-cx-submit").click();
  await soon("Cal finds a group", async () => (await cal.getByTestId("mz-cx-band").count()) === 1);
  await calCtx.setOffline(true);
  await sleep(1500);
  await calCtx.setOffline(false);
  await cal.reload({ waitUntil: "domcontentloaded" });
  await soon("after reconnecting Cal still has his group and 12 tiles", async () => (await cal.getByTestId("mz-cx-band").count()) === 1 && (await cal.getByTestId("mz-cx-tile").count()) === 12, 20000);
  // Keyboard: Tab to a tile and press Space.
  await cal.getByTestId("mz-cx-tile").first().focus();
  await cal.keyboard.press("Space");
  check("keyboard: Space toggles a focused tile", (await cal.locator('[data-testid="mz-cx-tile"][aria-pressed="true"]').count()) === 1);
  check("keyboard focus is visible", await cal.getByTestId("mz-cx-tile").first().evaluate((el) => getComputedStyle(el).outlineStyle !== "none"));

  // TV (a spectator screen): the board, never the answers.
  const tv = await mk(1280);
  await tv.goto(BASE, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(code);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("mz-cx-tv").waitFor({ timeout: 15000 });
  const tvText = await bodyText(tv);
  check("the TV shows the board's 16 words", words.every((w) => tvText.toLowerCase().includes(w.toLowerCase())));
  check("the TV never shows group names while the game is on", !cxNames.some((n) => tvText.includes(n)));
  await sleep(700); // let the entry fade finish
  await tv.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cx-06-tv.png") });

  // The deadline ends the game for everyone; results reveal the board.
  const diag = await lifecycleDiagnosis(cal, "Cal");
  console.log(diag);
  await soon("the deadline brings everyone to the results", async () => (await ada.getByTestId("mz-cx-results").count()) === 1 && (await cal.getByTestId("mz-cx-results").count()) === 1, 90000);
  check("results show all four groups", (await cal.getByTestId("mz-cx-band").count()) === 4);
  check("results mark groups Cal missed (dashed)", (await cal.locator(".mz-cx-band--missed").count()) === 3);
  check("results explain the deadline ending", /Time’s up/.test(await bodyText(cal)));
  check("results show Cal's participation", /You: Solved 1 of 4 groups/.test(await bodyText(cal)), (await bodyText(cal)).slice(0, 300));
  await cal.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cx-05-results-320.png"), fullPage: true });
  check("no horizontal overflow on results at 320px", await cal.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // Back to the lobby and start another game.
  for (const p of [ada, bea, cal]) await p.getByTestId("show-back-to-lobby").click();
  await soon("everyone is back in the lobby", async () => (await ada.getByRole("heading", { name: "You’re in, Ada." }).count()) === 1);
  const again = await ada.evaluate(async () => (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/games`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") }, body: JSON.stringify({ gameId: "word-connections", official: true }) })).status);
  check("a second official Connections game starts (a different board)", again === 201, String(again));
  await passBriefing([ada, bea, cal]); // D3: everyone taps I'm ready for the second game too
  const words2 = await (async () => { await ada.getByTestId("mz-cx").waitFor({ timeout: 15000 }); return tileTexts(ada); })();
  check("the second board is different", words2.join() !== words.join() && !words2.every((w) => words.includes(w)));
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "CONNECTIONS ALL PASSED" : `CONNECTIONS FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
