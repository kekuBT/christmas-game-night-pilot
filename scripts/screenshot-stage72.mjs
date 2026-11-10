// Stage 7.2: screenshots of casual results and session continuation at a
// small phone (320), a common phone (390) and desktop (1440): the casual
// results screen after Math Mayhem (host with Next game; guest waiting),
// the TV's next line, the lineup complete after Trivia, a break on the
// results and in the lobby (host and guest), the lineup card after the
// lineup, and an Apply the app couldn't confirm (P7). Writes
// docs/stage7/screenshots-72/*.png and a manifest naming the exact revision.
// Visual evidence only: check-session-flow is the check.
// Run from the checkout to photograph (it starts ITS OWN server there):
//   node scripts/screenshot-stage72.mjs [--out <dir>]
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out", join("docs", "stage7", "screenshots-72"));
mkdirSync(OUT, { recursive: true });
const REV = execSync("git rev-parse HEAD").toString().trim();
const DIRTY = execSync("git status --porcelain --untracked-files=no").toString().trim() !== "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = { revision: REV, workingTreeClean: !DIRTY, capturedAt: new Date().toISOString(), note: "Chromium headless (Playwright) only; not a real iPhone or Android device, not WebKit.", shots: [] };

const DATA = mkdtempSync(join(tmpdir(), "mz-shot72-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let BASE = "";
for (let i = 0; i < 160 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
if (!BASE) throw new Error(`server did not start: ${out.slice(-300)}`);

const VIEWS = [{ width: 320, height: 640, dpr: 2 }, { width: 390, height: 844, dpr: 2 }, { width: 1440, height: 900, dpr: 1 }];
async function shot(page, name, view, what, full = false) {
  await sleep(400); // let entrance motion settle
  const file = `${name}-${view.width}x${view.height}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: full });
  manifest.shots.push({ file, screen: what, viewport: `${view.width}×${view.height}`, deviceScaleFactor: view.dpr });
  console.log(`saved ${file}`);
}
async function hostRoom(page, name) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(path.replace(":room", roomId), { method, headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { method, path, body });
const into = (page, testId) => page.getByTestId(testId).scrollIntoViewIfNeeded();
async function play(pages) {
  await passBriefing(pages);
  for (const [i, p] of pages.entries()) await answerKitQuestions(p, { player: `player ${i + 1}`, choose: (n) => (n + i) % 4 });
}

const browser = await launchChromium();
try {
  for (const view of VIEWS) {
    const size = { viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dpr };
    const h = await (await browser.newContext(size)).newPage();
    const code = await hostRoom(h, "Keku");
    const g = await (await browser.newContext(size)).newPage();
    await joinRoom(g, "Amina", code);
    let tv = null;
    if (view.width === 1440) {
      tv = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
      await tv.locator(".mz-code__input").fill(code);
      await tv.getByTestId("watch-spectator").click();
      await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
    }
    await api(h, "POST", "/rooms/:room/party", { baseRevision: 0, plan: { expectedPlayers: 2, budgetMinutes: 30, items: [{ gameId: "math-mayhem" }, { gameId: "trivia" }] } });
    await h.getByTestId("party-start").waitFor({ timeout: 15000 });
    if (tv) { await tv.getByTestId("tv-lineup").waitFor({ timeout: 15000 }); await shot(tv, "00-tv-lobby-lineup", view, "TV lobby (spectator): the lineup, game 1 of 2"); }

    // Game 1: Math, to the casual results screen.
    await h.getByTestId("party-start").click();
    await play([h, g]);
    await h.getByTestId("casual-results").waitFor({ timeout: 40000 });
    await g.getByTestId("casual-results").waitFor({ timeout: 40000 });
    await shot(h, "01-results-host-top", view, "Casual results after Math Mayhem, host: one heading saying Casual, the standings");
    await into(h, "whats-next");
    await shot(h, "02-results-host-next", view, "The host's What's next: Next game (game 2 of 2), Play again, Pick a different game, Take a break");
    await into(g, "whats-next");
    await shot(g, "03-results-guest-waiting", view, "The guest's results: up next, game 2 of 2, Keku starts it (no controls)");
    if (tv) { await tv.getByTestId("tv-next").waitFor({ timeout: 15000 }); await shot(tv, "04-tv-final-next", view, "TV final standings (spectator): Casual, and the lineup's next game"); }

    // Game 2: Trivia, through Next game; the lineup is complete.
    await h.getByTestId("next-game").click();
    await play([h, g]);
    await h.locator('[data-testid="whats-next"][data-state="complete"]').waitFor({ timeout: 60000 });
    await into(h, "whats-next");
    await shot(h, "05-complete-host", view, "Trivia's own results with the panel: that was the whole lineup (Play again, Plan another lineup)");
    if (tv) { await tv.locator('[data-testid="tv-next"][data-flow="complete"]').waitFor({ timeout: 15000 }); await shot(tv, "06-tv-complete", view, "TV: that was the whole lineup"); }

    // A break, from the results; then the lobby.
    await h.getByTestId("next-break").click();
    await h.locator('[data-testid="whats-next"][data-state="break"]').waitFor({ timeout: 15000 });
    await into(h, "whats-next");
    await shot(h, "07-break-results-host", view, "On a break, from the results: Resume");
    await g.locator('[data-testid="whats-next"][data-state="break"]').waitFor({ timeout: 15000 });
    await into(g, "whats-next");
    await shot(g, "08-break-results-guest", view, "The guest sees the break; nothing starts until Keku resumes");
    await h.getByRole("button", { name: "Back to lobby" }).last().click();
    await g.getByRole("button", { name: "Back to lobby" }).last().click();
    await h.getByTestId("break-banner").waitFor({ timeout: 15000 });
    await shot(h, "09-break-lobby-host", view, "Lobby on a break, host: the banner with Resume");
    await into(h, "lobby-dock");
    await shot(h, "10-break-lobby-dock", view, "Lobby on a break: Start waits (On a break · Resume first)");
    await g.getByTestId("break-banner").waitFor({ timeout: 15000 });
    await shot(g, "11-break-lobby-guest", view, "Lobby on a break, guest");
    if (tv) { await tv.getByTestId("tv-break").waitFor({ timeout: 15000 }).catch(() => {}); }
    await h.getByTestId("break-resume").click();
    await h.getByTestId("break-take").waitFor({ timeout: 15000 });
    await into(h, "party-lineup");
    await shot(h, "12-lineup-played", view, "After Resume: the lineup card with both games played; Take a break is offered again");

    // P7: an Apply the app couldn't confirm.
    await h.getByTestId("party-edit").click();
    await h.getByTestId("party-sheet").waitFor({ timeout: 5000 });
    await h.getByTestId("party-time-15").click(); // a new time asks for a new suggestion
    await h.getByTestId("party-suggest").click();
    await h.getByTestId("party-preview").waitFor({ timeout: 5000 });
    await h.route((url) => new URL(url).pathname.endsWith("/party"), (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()));
    await h.getByTestId("party-apply").click();
    await h.getByText("Couldn’t confirm whether the lineup was saved").waitFor({ timeout: 15000 });
    await into(h, "party-error");
    await shot(h, "13-apply-unconfirmed", view, "An Apply with no answer: couldn't confirm whether the lineup was saved (P7)");
    await h.unrouteAll({ behavior: "ignoreErrors" });
    await h.context().close(); await g.context().close(); if (tv) await tv.context().close();
  }
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  await new Promise((r) => srv.once("exit", r));
  rmSync(DATA, { recursive: true, force: true });
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${manifest.shots.length} screenshots in ${OUT} (revision ${REV.slice(0, 7)}${DIRTY ? ", working tree NOT clean" : ""})`);
