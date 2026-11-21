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
//   S0 (review 7058937812) a fresh match is rules version 2: before play, the
//      briefing on both phones and on the TV says a run of 5 to 8 right answers
//      changes the category (a recovered version 1 match is covered by
//      tests/jebena-briefing-rules.test.ts and BriefingRules.test.tsx).
//   S5 (review 7058749487) right after each change, the watching phone (the one
//      that just answered: "You named …") and the TV say which category the last
//      answer was named in ("… named “X” in Sports."), also after that phone
//      reloads (Christmas at 320 px after change 1, Everyday at 390 after change 2);
//      after the first answer in the new category, the plain line is back. The
//      holder's turn screen has no last-play line (it shows the input instead).
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
const textOf = async (loc) => ((await loc.count()) ? ((await loc.first().textContent()) ?? "").trim() : null);
/** The last-play lines as written (DOM text): the watching phone, the TV, and whether the holder's screen has one. */
const lastLines = async (watcher, holder, TV) => ({
  phone: await textOf(watcher.getByTestId("jr-last")),
  tv: await textOf(TV.getByTestId("tv-jr-last")),
  holderHasLine: (await holder.getByTestId("jr-last").count()) > 0,
});
/** Reload a phone in another look at another width (a later init script wins); returns the look it shows. */
async function reloadAs(page, look, width) {
  await page.context().addInitScript((l) => { try { localStorage.setItem("mz_look", l); } catch { /* none */ } }, look);
  await page.setViewportSize({ width, height: 760 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("jr-category").waitFor({ timeout: 8000 });
  return page.evaluate(() => document.querySelector(".mz-root")?.getAttribute("data-mz-theme"));
}
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
  // S0: the briefing states the rules frozen in this (version 2) match, on both phones and the TV.
  const STREAK_RULE = "After a run of 5 to 8 right answers, a new category starts.";
  for (const [who, pg, id] of [["Keku's phone", K, "briefing"], ["Amina's phone", A, "briefing"], ["the TV", TV, "tv-briefing"]]) {
    const steps = await soon(`S0 ${who} shows the briefing's rules`, async () => {
      const loc = pg.getByTestId(id).locator(".mz-brief__steps");
      return (await loc.count()) ? ((await loc.textContent()) ?? "") : null;
    }, 15000);
    if (steps !== null) check(`S0 ${who}: the briefing (rules version 2) says "${STREAK_RULE}"`, steps.includes(STREAK_RULE), steps.slice(0, 200));
  }
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
  /** After a change: the next accepted answer must bring back the plain line. */
  let plainPending = false;
  const lastAccepted = (st) => (st.log ?? []).filter((e) => e.kind === "accepted").slice(-1)[0];
  /** The phone that just answered watches now; the other holds the jebena. */
  const sides = (st) => { const last = lastAccepted(st); const w = pageOf[last?.player]; return { last, watcher: w, holder: w === K ? A : K, who: w === K ? "Keku" : "Amina" }; };
  let seen = null;
  async function plainCheck(st) {
    const { last, watcher, holder, who } = sides(st);
    const want = `named “${last?.answer}”.`;
    const lines = await soon(`S5 the first answer in the new category: the plain line on ${who}'s phone and the TV`, async () => {
      const l = (seen = await lastLines(watcher, holder, TV));
      return l.phone === `You ${want}` && l.tv?.endsWith(want) && !l.tv.includes(" in ") && !l.holderHasLine ? l : null;
    }, 4000);
    if (lines) check(`S5 the first answer in the new category: the plain line on ${who}'s phone and the TV (no category named)`, true, JSON.stringify(lines));
    else console.log("  seen:", JSON.stringify(seen));
    plainPending = false;
  }
  // Two whole streaks can take up to 8 + 8 accepted answers (D-JR-01: each lasts 5 to 8); one more to see the second change land.
  const MAX_STREAK = 8;
  for (let i = 0; i < 2 * MAX_STREAK + 1 && streakChanges < 2; i++) {
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
    if (plainPending && st.category.round === before.category.round) await plainCheck(st);
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
      // S5: the last answer belongs to the previous category, and every screen says so.
      const prevName = before.category.name;
      const { last, watcher, holder, who } = sides(st);
      const want = `named “${last?.answer}” in ${prevName}.`;
      const ctxLines = await soon(`S5 change ${streakChanges + 1}: ${who}'s phone and the TV say the last answer was named in ${prevName}`, async () => {
        const l = (seen = await lastLines(watcher, holder, TV));
        return l.phone === `You ${want}` && l.tv === `${who} ${want}` && !l.holderHasLine ? l : null;
      }, 4000);
      if (ctxLines) check(`S5 change ${streakChanges + 1}: ${who}'s phone and the TV say the last answer was named in ${prevName} (now ${st.category.name}); the holder's turn screen has no last-play line`, true, JSON.stringify(ctxLines));
      else console.log("  seen:", JSON.stringify(seen));
      if (kickers && streakChanges === 0) { await shot(K, "jrc-after-change-390-everyday"); await shot(A, "jrc-after-change-320-christmas"); await shot(TV, "jrc-after-change-tv"); }
      // S5 after a reload, in the other look at the other width: Keku's phone after the first change, Amina's after the second.
      const [look, width] = streakChanges === 0 ? ["christmas", 320] : ["everyday", 390];
      const theme = await reloadAs(watcher, look, width);
      const line = await soon(`S5 change ${streakChanges + 1}: ${who}'s phone shows the line again after the reload`, async () => {
        const t = await textOf(watcher.getByTestId("jr-last")); return t === `You ${want}` ? t : null;
      }, 4000);
      const noScroll = await watcher.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      check(`S5 change ${streakChanges + 1}: after ${who}'s phone reloads in ${look} at ${width} px, it still says “You ${want}” with no sideways scroll`, theme === look && !!line && noScroll, JSON.stringify({ theme, line, noScroll }));
      // Let the reload's entrance fade finish (finite animations only; the steam loops), at most 1.5 s.
      await watcher.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime)).map((a) => a.finished.catch(() => null))),
        new Promise((r) => setTimeout(r, 1500)),
      ]));
      await shot(watcher, `jrc-after-change-reload-${width}-${look}`);
      plainPending = true;
      gaps.push(sinceChange);
      streakChanges += 1;
      sinceChange = 0;
    }
  }
  // The loop stops at the second change: one more answer for its plain-line check.
  if (plainPending && streakChanges >= 2 && (await playAccepted())) { const st = await agree("after the answer that follows the second change"); if (st) await plainCheck(st); }
  /** Name a shot by the page's width and look as they are now (the S5 reloads change them). */
  const tag = (pg) => pg.evaluate(() => `${window.innerWidth}-${document.querySelector(".mz-root")?.getAttribute("data-mz-theme")}`);
  await shot(K, `jrc-end-keku-${await tag(K)}`); await shot(A, `jrc-end-amina-${await tag(A)}`); await shot(TV, "jrc-end-tv");
  check("S2 sustained correct play changes the category, and again after the next streak", streakChanges >= 2, `changes ${streakChanges}, gaps ${JSON.stringify(gaps)}, first ${firstCategory}`);
  check("S4 both the rejected try and the reload happened mid-streak", rejectedDone && reloadDone);
  const fin = (await view(K)).state;
  check("no turn ran out (every change was a streak's, every player kept every cup)", !(fin.log ?? []).some((e) => e.kind === "timeout") && (fin.order ?? []).every((r) => r.hearts === fin.startHearts), JSON.stringify((fin.order ?? []).map((r) => r.hearts)));
  for (const [who, pg] of [["Keku", K], ["Amina", A]]) {
    const w = await pg.evaluate(() => window.innerWidth);
    check(`${who}'s phone (${w} px now) has no sideways scroll`, await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
} catch (e) {
  check("no unexpected error", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close().catch(() => {});
  if (srv) { srv.kill("SIGTERM"); await sleep(300); if (srv.exitCode === null) srv.kill("SIGKILL"); }
  if (DATA) rmSync(DATA, { recursive: true, force: true });
}
console.log(failures ? `\nJEBENA CATEGORIES FAILED: ${failures} failed` : "\nJEBENA CATEGORIES ALL PASSED");
process.exit(failures ? 1 : 0);
