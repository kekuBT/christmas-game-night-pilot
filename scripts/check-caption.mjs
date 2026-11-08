// Sprint 4: the Caption Clash experience, end to end, in real browsers.
// Own server (test time scale 0.5: write 45 s, vote 22 s) and test content.
// Usage: node scripts/check-caption.mjs   (base URL argument ignored)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-cap-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, MCHEZO_LIFECYCLE_SCALE: "0.5", MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function createRoom(page, name) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / }); await chip.waitFor({ timeout: 15000 });
  let code = ""; for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(250); }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
const text = (page) => page.evaluate(() => document.body.innerText);
const NAMES = ["Ada", "Bea", "Cal", "Dee"];

const browser = await launchChromium();
try {
  const mk = async (w) => (await browser.newContext({ viewport: { width: w, height: 844 } })).newPage();
  const [ada, bea, cal, dee] = [await mk(390), await mk(390), await mk(320), await mk(360)];
  const all = [ada, bea, cal, dee];
  const code = await createRoom(ada, "Ada");
  await joinRoom(bea, "Bea", code); await joinRoom(cal, "Cal", code); await joinRoom(dee, "Dee", code);
  await ada.getByTestId("choose-game").click();
  await ada.getByTestId("select-game-caption-clash").click();
  await ada.getByTestId("start-official-caption-clash").click();
  // D3: the rules briefing explains the game before any clock runs.
  await soon("the briefing explains the game", async () => /Write the funniest caption/.test(await text(bea)) && (await bea.getByTestId("briefing").count()) === 1);
  await bea.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cap-01-intro.png") });
  await passBriefing(all);
  for (const p of all) await p.getByTestId("mz-cap-write").waitFor({ timeout: 15000 });
  const prompt = await ada.getByTestId("mz-cap-prompt").innerText();
  check("everyone sees the same scene", (await Promise.all(all.map((p) => p.getByTestId("mz-cap-prompt").innerText()))).every((t) => t === prompt), prompt);
  for (const [i, p] of all.entries()) check(`no horizontal overflow at ${[390, 390, 320, 360][i]}px (write)`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // Writing: counter, one obvious submit, double submit sends one caption.
  const input = bea.getByTestId("mz-cap-input");
  await input.fill("When the robot laughs at its own joke");
  check("character counter counts down", /\d+ left/.test(await bea.locator(".mz-cap-count").innerText()));
  await bea.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cap-02-write.png") });
  let posts = 0;
  bea.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/intents")) posts++; });
  await bea.getByTestId("mz-cap-submit").click();
  await input.press("Enter").catch(() => {});
  await soon("Bea's caption is in and shown back to her", async () => /When the robot laughs/.test(await bea.getByTestId("mz-cap-mine").innerText()));
  check("a double submit sends one caption", posts === 1, String(posts));
  // Reload keeps her submitted state.
  await bea.reload({ waitUntil: "domcontentloaded" });
  await soon("after a reload Bea still sees her caption, not an empty box", async () => (await bea.getByTestId("mz-cap-mine").count()) === 1, 20000);
  await bea.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cap-03-submitted.png") });
  // Keyboard: type and submit with Tab + Enter.
  await cal.getByTestId("mz-cap-input").focus();
  await cal.keyboard.type("Grandpa's new ringtone");
  await cal.keyboard.press("Tab");
  await cal.keyboard.press("Enter");
  await soon("keyboard: Cal submits with Tab + Enter", async () => (await cal.getByTestId("mz-cap-mine").count()) === 1);
  for (const [p, c] of [[ada, "Error 404: punchline not found"], [dee, "Beep boop, that's a knock-knock joke"]]) {
    await p.getByTestId("mz-cap-input").fill(c); await p.getByTestId("mz-cap-submit").click();
  }

  // Voting: anonymous; yours is marked and disabled.
  for (const p of all) await p.getByTestId("mz-cap-vote").waitFor({ timeout: 20000 });
  const voteArea = await bea.locator(".mz-cap-votes").innerText();
  check("vote cards show no names (anonymous)", !NAMES.some((n) => voteArea.includes(n)), voteArea.replace(/\n/g, " | "));
  check("Bea's own caption is marked Yours and disabled", (await bea.getByTestId("mz-cap-yours").count()) === 1 && await bea.getByTestId("mz-cap-yours").isDisabled());
  check("Bea can vote for the other three", (await bea.locator('[data-testid="mz-cap-option"]').count()) === 3);
  const sizes = await cal.locator(".mz-cap-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  check("vote cards are at least 44px tall at 320px", sizes.every((h) => h >= 44), String(Math.min(...sizes)));
  await sleep(700); // cards animate in
  await bea.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cap-04-vote.png") });
  // The TV (a spectator) shows the captions but never names.
  const tv = await mk(1280);
  await tv.goto(BASE, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(code);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("mz-cap-tv").waitFor({ timeout: 15000 });
  await sleep(700);
  const tvText = await text(tv);
  check("TV shows the scene and the captions", tvText.includes(prompt) && tvText.includes("Grandpa's new ringtone"));
  check("TV never shows who wrote what", !["Ada", "Bea", "Cal", "Dee"].some((n) => tvText.includes(`by ${n}`)));
  await tv.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cap-05-tv-vote.png") });
  // Three of four vote; Dee doesn't. The vote deadline (22 s) moves the room on.
  for (const p of [ada, bea, cal]) {
    const opt = p.locator('[data-testid="mz-cap-option"]').filter({ hasText: "Grandpa" });
    if (await opt.count()) await opt.first().click(); else await p.locator('[data-testid="mz-cap-option"]').first().click();
  }
  await soon("a vote is confirmed on the card", async () => /your vote ✓/i.test(await ada.locator(".mz-cap-votes").innerText()));
  await soon("round 2 starts on time without Dee's vote", async () => /Round 2 of 3/.test(await ada.getByTestId("mz-cap-prompt").evaluate((e) => e.closest("section")?.getAttribute("aria-label") ?? "")), 25000);
  await soon("round 2 shows last round's favourite (no names)", async () => /Grandpa's new ringtone/.test(await ada.getByTestId("mz-cap-last").innerText()) && !/by /.test(await ada.getByTestId("mz-cap-last").innerText()));
  await ada.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cap-06-round2.png") });
  // Rounds 2 and 3: two write, two skip; votes happen on time.
  for (let r = 2; r <= 3; r++) {
    for (const p of all) await p.getByTestId("mz-cap-write").waitFor({ timeout: 50000 }).catch(() => {});
    await ada.getByTestId("mz-cap-input").fill(`Round ${r}: Ada's line`); await ada.getByTestId("mz-cap-submit").click();
    await bea.getByTestId("mz-cap-input").fill(`Round ${r}: Bea's line`); await bea.getByTestId("mz-cap-submit").click();
    await cal.getByRole("button", { name: "Skip this round" }).click();
    await dee.getByRole("button", { name: "Skip this round" }).click();
    await cal.getByTestId("mz-cap-vote").waitFor({ timeout: 50000 });
    await cal.locator('[data-testid="mz-cap-option"]').filter({ hasText: "Bea's line" }).click();
    await sleep(500);
  }
  // Results: authors revealed, scores, outcome.
  await soon("results reach every phone", async () => (await Promise.all(all.map((p) => p.getByTestId("mz-cap-results").count()))).every((n) => n === 1), 90000);
  const res = await text(ada);
  check("results credit the winning caption's author", /by (Cal|you)/.test(res) && /Grandpa's new ringtone/.test(res), res.slice(0, 300));
  check("results explain points (25 per caption, 100 per vote)", /25 points for writing a caption, 100 for every vote/.test(res));
  check("results show participation", /Wrote a caption in/.test(res));
  await cal.screenshot({ path: screenshotPath("docs/sprint-4-screenshots/cap-07-results-320.png"), fullPage: true });
  check("no horizontal overflow on results at 320px", await cal.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const tvRes = await text(tv);
  check("the TV results still show no author names", !NAMES.some((n) => tvRes.includes(`by ${n}`)));
  for (const p of all) await p.getByTestId("show-back-to-lobby").click();
  await soon("back in the lobby", async () => (await ada.getByRole("heading", { name: "You’re in, Ada." }).count()) === 1);
  const again = await ada.evaluate(async () => (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/games`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") }, body: JSON.stringify({ gameId: "caption-clash", official: true }) })).status);
  check("another Caption Clash starts with new scenes", again === 201, String(again));
  await passBriefing(all); // D3: everyone taps I'm ready for the second game too
  await ada.getByTestId("mz-cap-write").waitFor({ timeout: 15000 });
  check("the new game's first scene differs", (await ada.getByTestId("mz-cap-prompt").innerText()) !== prompt);
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "CAPTION ALL PASSED" : `CAPTION FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
