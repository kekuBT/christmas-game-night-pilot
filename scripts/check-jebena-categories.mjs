// D-JR-01 (handoff 7057753827): Jebena Rush changes its category during a
// streak of accepted answers, and every screen shows the same category.
//
// Two phones (Keku 390 Everyday, Amina 320 Christmas) and a TV spectator play
// a casual Jebena Rush through the real UI: the holder types a fresh answer
// from the bank oracle and presses Enter; no turn is allowed to run out.
//   S1 at every turn both phones and the TV show the server's category (the
//      phones by id, the TV by name), and the projection's round agrees;
//   S2 sustained correct play changes the category within 8 accepted answers
//      (a streak change in the server's log, never a timeout), and again later;
//      every streak lasts 5 to 8 accepted answers;
//   S3 at a change both phones say "Category · new!" for the turn it starts;
//   S4 a rejected try mid-streak and a phone reload mid-streak change nothing:
//      the same category, no "new!", and the streak still ends within bounds.
// On the base (rules version 1) S2 fails: the first category never moves.
// Usage: node scripts/check-jebena-categories.mjs [gateBaseUrl]   (without one it starts its own server)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { freshAnswer, jebenaOracle } from "./lib/jebena-oracle.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 12000) {
  const end = Date.now() + timeout; let last = null;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout} ms${last ? `: ${String(last.message ?? last).split("\n")[0]}` : ""}`);
  return null;
}

const ORACLE = jebenaOracle();
let srv = null; let DATA = null;
let BASE = process.argv[2] ?? null;
if (!BASE) {
  DATA = mkdtempSync(join(tmpdir(), "mz-jrc-"));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE; delete env.MCHEZO_LIFECYCLE_SCALE;
  srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 120 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
  if (!BASE) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
}

const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(path.replace(":room", roomId), { method, headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "", "x-mchezo-protocol": "5" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { method, path, body });
const seatOf = (page) => page.evaluate(() => sessionStorage.getItem("cgn_playerId"));
const view = async (page) => {
  const p = (await api(page, "GET", "/rooms/:room/projection?audience=player")).body;
  return (p.myGames ?? []).filter((g) => g.gameId === "jebena-rush").slice(-1)[0] ?? null;
};
/** Screenshots only into MCHEZO_SCREENSHOT_DIR (never into the checkout). */
/** The category kicker's own text ("Category" or "Category · new!"); CSS shows it in capitals, so read the DOM text, not the rendered one. */
const kicker = async (page) => ((await page.locator('[data-testid="jr-category"] .mz-kicker').textContent()) ?? "").trim();
const shot = async (page, name) => { if (process.env.MCHEZO_SCREENSHOT_DIR) await page.screenshot({ path: screenshotPath(`${name}.png`) }); };

const browser = await launchChromium();
try {
  const phone = async (width, look) => {
    const ctx = await browser.newContext({ viewport: { width, height: 760 } });
    await ctx.addInitScript((l) => { try { localStorage.setItem("mz_look", l); } catch { /* none */ } }, look);
    return ctx.newPage();
  };
  const K = await phone(390, "everyday");
  await K.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await K.getByTestId("home-host").click();
  await K.getByPlaceholder("e.g. Auntie June").fill("Keku");
  await K.getByRole("button", { name: "Host a game" }).click();
  const chip = K.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  const A = await phone(320, "christmas");
  await A.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await A.getByPlaceholder("e.g. Auntie June").fill("Amina");
  await A.locator(".mz-code__input").fill(code);
  await A.getByRole("button", { name: "Join the game" }).click();
  await A.getByRole("heading", { name: "You’re in, Amina." }).waitFor({ timeout: 15000 });
  const TV = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await TV.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await TV.locator(".mz-code__input").fill(code);
  await TV.getByTestId("watch-spectator").click();
  await TV.getByTestId("tv-show").waitFor({ timeout: 15000 });

  await K.getByTestId("choose-game").click();
  await K.getByTestId("select-game-jebena-rush").click();
  await K.locator('[data-testid="lobby-dock"] button.mz-key--block').first().click();
  await passBriefing([K, A]);
  const pageOf = { [await seatOf(K)]: K, [await seatOf(A)]: A };
  let g = await soon("setup: Jebena Rush is playing", async () => { const x = await view(K); return x?.status === "playing" && x.state?.turn ? x : null; }, 20000);
  if (!g) throw new Error("never played");
  check("setup: the server plays rules version 2 (D-JR-01)", g.state.rulesVersion === 2, String(g.state.rulesVersion));

  /** Every surface shows the server's category now (phones by id, TV by name); returns the server's state. */
  async function agree(label) {
    return soon(`S1 ${label}: both phones and the TV show the server's category`, async () => {
      const st = (await view(K))?.state;
      if (!st?.category) return null;
      const k = await K.getByTestId("jr-category").getAttribute("data-category");
      const a = await A.getByTestId("jr-category").getAttribute("data-category");
      const tv = (await TV.getByTestId("tv-jr-category").innerText()).trim();
      return k === st.category.id && a === st.category.id && tv === st.category.name ? st : null;
    });
  }
  const used = new Set();
  const turnNo = async () => (await view(K))?.state?.turn?.n;
  /** The holder types a fresh answer on their own phone and presses Enter; resolves once the server has moved to the next turn. */
  async function playAccepted() {
    const st = (await view(K)).state;
    for (const e of st.log ?? []) if (e.kind === "accepted") used.add(e.answer);
    const pg = pageOf[st.turn.player];
    const pick = freshAnswer(st.category.id, used);
    if (!pick) throw new Error(`oracle: no fresh answer in ${st.category.id}`);
    await pg.getByTestId("jr-input").waitFor({ timeout: 8000 });
    await pg.getByTestId("jr-input").fill(pick.typed);
    await pg.keyboard.press("Enter");
    const moved = await soon(`play: “${pick.typed}” is accepted and the jebena passes`, async () => ((await turnNo()) === st.turn.n + 1 ? true : null), 8000);
    used.add(pick.name);
    return !!moved;
  }

  let st0 = await agree("the first turn");
  const firstCategory = st0?.category.id;
  let streakChanges = 0;
  let sinceChange = 0;
  const gaps = [];
  let rejectedDone = false;
  let reloadDone = false;
  let shotBefore = false;
  for (let i = 0; i < 14 && streakChanges < 2; i++) {
    const before = (await view(K)).state;
    // S4: once, mid-streak, a rejected try on the holder's phone first; once, a reload of Amina's phone.
    if (!rejectedDone && sinceChange === 2) {
      const pg = pageOf[before.turn.player];
      await pg.getByTestId("jr-input").fill(ORACLE[before.category.id].notInBank);
      await pg.keyboard.press("Enter");
      const r = await soon("S4 a rejected try mid-streak is shown on the holder's phone", async () => { const x = await view(pg); return x?.state?.attempt?.verdict === "not-in-bank" ? x.state : null; });
      check("S4 the rejected try keeps the turn and the category", !!r && r.turn.n === before.turn.n && r.category.id === before.category.id && r.category.round === before.category.round);
      rejectedDone = true;
    }
    if (!reloadDone && sinceChange === 3) {
      await A.reload({ waitUntil: "domcontentloaded" });
      await A.getByTestId("jr-category").waitFor({ timeout: 15000 });
      const after = await agree("after Amina's phone reloads mid-streak");
      check("S4 the reload changes nothing: the same category and round, and no new! on her phone", !!after && after.category.id === before.category.id && after.category.round === before.category.round && (await kicker(A)) === "Category");
      reloadDone = true;
    }
    if (!shotBefore && sinceChange >= 4) { await shot(K, "jrc-before-change-390-everyday"); await shot(TV, "jrc-before-change-tv"); shotBefore = true; }
    if (sinceChange >= 1) check(`S3 mid-streak (answer ${sinceChange} in this category): both phones say just "Category"`, (await kicker(K)) === "Category" && (await kicker(A)) === "Category");
    if (!(await playAccepted())) break;
    const st = await agree(`after accepted answer ${i + 1}`);
    if (!st) break;
    sinceChange += 1;
    if (st.category.round !== before.category.round) {
      const entry = (st.log ?? []).filter((e) => e.kind === "category").slice(-1)[0];
      check(`S2 change ${streakChanges + 1} comes from a streak of accepted answers (not a timeout)`, entry?.reason === "streak" && !(st.log ?? []).some((e) => e.kind === "timeout"), JSON.stringify(entry));
      check(`S2 change ${streakChanges + 1} after ${sinceChange} accepted answers: within 5 to 8`, sinceChange >= 5 && sinceChange <= 8, String(sinceChange));
      // Within the turn it starts (a turn is 10 s): both phones flag the new category.
      const kickers = await soon(`S3 change ${streakChanges + 1}: both phones say "Category · new!" for the turn it starts`, async () => {
        const k = await kicker(K);
        const a = await kicker(A);
        return k === "Category · new!" && a === "Category · new!" ? { k, a } : null;
      }, 4000);
      if (kickers) check(`S3 change ${streakChanges + 1}: both phones say "Category · new!" for the turn it starts`, true, JSON.stringify(kickers));
      if (kickers && streakChanges === 0) { await shot(K, "jrc-after-change-390-everyday"); await shot(A, "jrc-after-change-320-christmas"); await shot(TV, "jrc-after-change-tv"); }
      gaps.push(sinceChange);
      streakChanges += 1;
      sinceChange = 0;
    }
  }
  await shot(K, "jrc-end-390-everyday"); await shot(TV, "jrc-end-tv");
  check("S2 sustained correct play changes the category, and again after the next streak", streakChanges >= 2, `changes ${streakChanges}, gaps ${JSON.stringify(gaps)}, first ${firstCategory}`);
  check("S4 both the rejected try and the reload happened mid-streak", rejectedDone && reloadDone);
  const fin = (await view(K)).state;
  check("no turn ran out (every change was a streak's, every player kept every cup)", !(fin.log ?? []).some((e) => e.kind === "timeout") && (fin.order ?? []).every((r) => r.hearts === fin.startHearts), JSON.stringify((fin.order ?? []).map((r) => r.hearts)));
  check("at 320 px Amina's phone has no sideways scroll", await A.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
} catch (e) {
  check("no unexpected error", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close().catch(() => {});
  if (srv) { srv.kill("SIGTERM"); await sleep(300); if (srv.exitCode === null) srv.kill("SIGKILL"); }
  if (DATA) rmSync(DATA, { recursive: true, force: true });
}
console.log(failures ? `\nJEBENA CATEGORIES FAILED: ${failures} failed` : "\nJEBENA CATEGORIES ALL PASSED");
process.exit(failures ? 1 : 0);
