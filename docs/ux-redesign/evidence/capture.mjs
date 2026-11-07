// Evidence script for docs/ux-redesign/AUDIT.md (2026-11-07), kept for reproducibility.
// Environment-specific: paths point at the cloud container that produced the evidence
// (repo at /home/user/christmas-game-night-pilot, machine Chromium headless shell).
// Usage: start `npm run serve:device-test` on a port, then: node <this file> http://localhost:PORT [outDir] [wordsJson]
import { chromium } from "/home/user/christmas-game-night-pilot/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const BASE = process.argv[2]; const OUT = process.argv[3]; mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell" });
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const facts = {};
const clickText = (pg, re) => pg.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll("button")].find((x) => r.test(x.textContent.trim())); if (b) { b.click(); return true; } return false; }, re.source);
const shot = async (p, name, opts = {}) => { await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 72, ...opts }); };
const tall = async (p, name) => { // whole inner-scroll screen
  const h = await p.evaluate(() => { const s = document.querySelector(".mz-screen"); return s ? s.scrollHeight : document.documentElement.scrollHeight; });
  await p.addStyleTag({ content: ".mz-screen{height:auto!important;overflow:visible!important;animation:none!important} .mz-surface{min-height:auto!important}" });
  await sleep(300); await shot(p, name, { fullPage: true }); return h;
};
const reset = async (p) => p.evaluate(() => document.querySelectorAll("style").forEach((s) => { if (s.textContent.includes("height:auto!important")) s.remove(); }));
// ---- landing
const hostCtx = await b.newContext(phone); const host = await hostCtx.newPage();
await host.goto(BASE); await sleep(800); await shot(host, "01-landing");
facts.docBackground = await host.evaluate(() => getComputedStyle(document.body).backgroundColor);
facts.themeColor = await host.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null);
facts.title = await host.title();
facts.viewportFit = await host.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute("content"));
await host.getByPlaceholder("e.g. Auntie June").fill("Keku");
await host.getByRole("button", { name: "Host a game" }).click();
const chip = host.getByRole("button", { name: /^Share room code / }); await chip.waitFor(); await sleep(1500);
const code = (await chip.getAttribute("aria-label")).match(/[A-Z0-9]{6}/)[0];
await shot(host, "02-host-lobby-viewport");
// share button behaviour
const urlBefore = host.url(); await chip.click(); await sleep(500);
facts.shareClick = { urlChanged: host.url() !== urlBefore, dialog: await host.locator("[role=dialog]").count(), toast: (await host.locator("body").innerText()).includes("Copied") };
// overlap measurements
facts.lobbyOverlaps = await host.evaluate(() => {
  const r = (el) => el?.getBoundingClientRect(); const ov = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const h1 = r(document.querySelector(".mz-h1")); const badge = r(document.querySelector(".mz-topbar .mz-event-badge"));
  const center = r(document.querySelector(".mz-circle__center")); const you = r(document.querySelector(".mz-token--you"));
  const name = r(document.querySelector(".mz-upnext__name"));
  return { h1VsBadge: ov(h1, badge), youTokenVsCenterDisc: ov(you, center), youTokenVsUpNextName: ov(you, name), h1, badge, center, you };
});
facts.lobbyScrollHeight = await tall(host, "03-host-lobby-full"); await reset(host);
// official / practice states
await host.getByTestId("mode-practice").click(); await sleep(200);
await host.getByTestId("mode-practice").scrollIntoViewIfNeeded(); await sleep(200);
facts.modeStyles = await host.evaluate(() => ["mode-official", "mode-practice"].map((id) => { const e = document.querySelector(`[data-testid=${id}]`); const s = getComputedStyle(e); return { id, pressed: e.getAttribute("aria-pressed"), bg: s.backgroundColor, border: s.borderColor, color: s.color }; }));
await shot(host, "04-mode-practice-selected");
await host.getByTestId("choose-game").click(); await sleep(300); await host.getByTestId("select-game-trivia").scrollIntoViewIfNeeded(); await shot(host, "05-game-picker");
await host.getByTestId("select-game-trivia").click(); await sleep(200);
// settings card styles (legacy inside kit)
facts.settingsCard = await host.evaluate(() => { const e = document.querySelector("[data-testid=settings-bar]"); const s = getComputedStyle(e); const sel = e.querySelector("select"); return { bg: s.backgroundColor, selectBg: getComputedStyle(sel).backgroundColor }; });
await host.getByTestId("settings-bar").scrollIntoViewIfNeeded(); await shot(host, "06-settings-in-lobby");
// ---- deep link join (second player)
const pCtx = await b.newContext(phone); const p = await pCtx.newPage();
await p.goto(`${BASE}/?code=${code}`); await sleep(800); await shot(p, "07-join-deeplink");
await p.getByPlaceholder("e.g. Auntie June").fill("Amina-Josephine Wanjiku"); await p.getByRole("button", { name: "Join the game" }).click();
await p.getByRole("heading", { name: /You’re in/ }).waitFor(); await sleep(1200); await shot(p, "08-guest-lobby");
// ---- library + championship + tv (legacy) before games
await host.getByTestId("browse-games").click(); await sleep(600); facts.libraryHeight = await tall(host, "09-library"); await reset(host);
await host.getByRole("button", { name: /Back/ }).first().click().catch(() => {}); await sleep(400);
// ---- trivia official, 2 players
await host.getByTestId("mode-official").click();
await host.getByTestId("start-official-trivia").click(); await sleep(1200);
await shot(host, "10-trivia-intro");
await host.getByTestId?.("show-start-playing").click().catch(() => {});
await sleep(9000); await shot(host, "11-trivia-question");
const answer = async (pg) => { for (let i = 0; i < 40; i++) {
  if (await pg.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 300 }).catch(() => false)) return;
  const done = pg.getByRole("button", { name: "Waiting for the game to finish" }); if (await done.isVisible({ timeout: 300 }).catch(() => false)) { await done.click(); await sleep(300); return; }
  const nx = pg.getByRole("button", { name: "Next question" }); if (await nx.isVisible({ timeout: 300 }).catch(() => false)) { await nx.click(); await sleep(300); continue; }
  const s = pg.locator(".mz-slab:not([disabled])"); if (await s.count()) { await s.nth(i % 4 % (await s.count())).click(); await sleep(350); continue; }
  const st = pg.getByTestId("show-start-playing"); if (await st.isVisible({ timeout: 300 }).catch(() => false)) { await st.click(); await sleep(300); continue; }
  await sleep(400); } };
await Promise.all([answer(host), answer(p)]);
await sleep(2500); await shot(host, "12-trivia-results-viewport"); facts.triviaResultsHeight = await tall(host, "13-trivia-results-full"); await reset(host);
// TV stage from host
try { await host.getByTestId("mz-tv-stage").first().click({ timeout: 3000 }); await sleep(1500); await shot(host, "14-tv-stage-on-phone"); } catch (e) { console.log("tv stage step:", e.message.split("\n")[0]); }
console.log("back to phone:", await clickText(host, /^Back to phone view$/));
await sleep(600);
for (let i = 0; i < 4; i++) { if (await clickText(host, /^Back to lobby$/)) await sleep(700); else break; }
await host.screenshot({ path: OUT + "/debug-after-trivia.jpg", type: "jpeg", quality: 50 });
// championship (legacy)
console.log("championship:", await clickText(host, /^Championship$/)); await sleep(800);
facts.championshipHeight = await host.evaluate(() => document.documentElement.scrollHeight);
await shot(host, "15-championship-viewport"); await shot(host, "16-championship-full", { fullPage: true });
facts.championshipBg = await host.evaluate(() => getComputedStyle(document.body).backgroundColor);
// TV dashboard (legacy) via lobby button
console.log("tvdash:", await clickText(host, /^TV Dashboard$/)); await sleep(800); await shot(host, "17-tv-dashboard-legacy", { fullPage: true });
// spectator on a TV-sized screen
const tvCtx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }); const tv = await tvCtx.newPage(); await tv.goto(`${BASE}/?code=${code}`); await tv.getByTestId("watch-spectator").click(); await sleep(2500); await shot(tv, "18-spectator-tv-1280");
// back-navigation behaviour
await clickText(host, /^Lobby & Games$/); await sleep(500);
const histLen = await host.evaluate(() => history.length);
await clickText(host, /^Championship$/); await sleep(300);
facts.history = { before: histLen, afterNavigating: await host.evaluate(() => history.length), url: host.url() };
// ---- Word Connections solo practice on second phone? needs 1 player: use a fresh room
const sCtx = await b.newContext({ ...phone, viewport: { width: 375, height: 667 } }); const s = await sCtx.newPage();
await s.goto(BASE); await s.getByPlaceholder("e.g. Auntie June").fill("Solo"); await s.getByRole("button", { name: "Host a game" }).click();
await s.getByRole("button", { name: /^Share room code / }).waitFor(); await sleep(800);
await shot(s, "19-host-lobby-se");
await s.getByTestId("choose-game").click(); await s.getByTestId("select-game-word-connections").click(); await sleep(200);
await s.getByTestId("start-official-word-connections").click(); await sleep(1200); await shot(s, "20-wc-intro-se");
await s.getByTestId("show-start-playing").click(); await sleep(1200); await shot(s, "21-wc-board-se");
// overflow test: every Connections word in a real tile at 375 and 320
const words = JSON.parse(process.argv[4]);
const measure = async (pg) => pg.evaluate((ws) => { const t = document.querySelector(".mz-cx-tile"); const out = []; for (const w of ws) { const c = t.cloneNode(true); c.textContent = w; const len = Math.max(...w.split(/\s+/).map((x) => x.length)); c.className = "mz-cx-tile" + (len >= 11 ? " mz-cx-tile--xlong" : len >= 9 ? " mz-cx-tile--long" : ""); t.parentElement.appendChild(c); if (c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().height > 70) out.push(w); c.remove(); } return out; }, words);
facts.cxOverflow375 = await measure(s);
await s.setViewportSize({ width: 320, height: 640 }); await sleep(400); facts.cxOverflow320 = await measure(s); await shot(s, "22-wc-board-320");
writeFileSync(`${OUT}/facts.json`, JSON.stringify(facts, null, 2));
console.log(JSON.stringify(facts, null, 1));
await b.close();
