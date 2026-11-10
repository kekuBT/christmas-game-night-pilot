// Stage 7.3: hand the host role to another player in a casual room, end to
// end in the browser (docs/stage7/stage73.md, ChatGPT handoff 6781323820).
// Ada hosts; Bea and Cal play; a spectator watches on the TV.
//   A  only the host has "Make host" (a guest's menu has no host tools)
//   B  the confirmation names Bea and says what changes; Escape and Cancel
//      change nothing
//   C  by keyboard, with the first reply lost: the same press is asked again,
//      exactly one handover; Bea is the only host
//   D  everyone sees it: toasts worded for Ada, Bea and Cal; Ada's controls
//      go and Bea's appear; guests wait for Bea; the TV marks Bea as host
//   E  Ada's own API attempts are refused (break, start, handing it back)
//   F  Bea runs a game: everyone plays, and the results' What's next is Bea's
//   G  during a break, Bea hands the role back to Ada, who resumes
//   H  a player who isn't connected can't be chosen; a reload of both hosts
//      keeps exactly one host
//   I  layout: the menu and confirmation at 320 and 1440 px, no sideways scroll
// Usage: node scripts/check-host-handover.mjs <baseUrl>   (the gate passes its server)
import { launchChromium } from "./lib/driver-env.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
async function host(page, name) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
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
async function join(page, name, code) {
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
const myRoom = async (page) => (await api(page, "GET", "/rooms/:room/projection?audience=player")).body;
const hosts = (room) => room.players.filter((p) => p.isHost).map((p) => p.displayName);
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const dockStart = (page) => page.locator('[data-testid="lobby-dock"] button.mz-key--block').first();
const openMenu = async (page) => { await page.getByTestId("room-menu").click(); await page.getByTestId("room-menu-sheet").waitFor({ timeout: 5000 }); };
const closeMenu = async (page) => { if (await page.getByTestId("room-menu-sheet").count()) { await page.keyboard.press("Escape"); await page.getByTestId("room-menu-sheet").waitFor({ state: "detached", timeout: 5000 }).catch(() => {}); } };
/** Every toast this page shows from now on (one at a time; each stays up to 9 s). */
function watchToasts(page) {
  const seen = new Set();
  const timer = setInterval(async () => { try { for (const t of await page.getByTestId("mz-room-notice").allInnerTexts()) seen.add(t.replace("×", "").trim()); } catch { /* navigating */ } }, 150);
  return { seen, stop: () => clearInterval(timer) };
}

const browser = await launchChromium();
try {
  const ada = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const code = await host(ada, "Ada");
  const bea = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await join(bea, "Bea", code);
  const cal = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await join(cal, "Cal", code);
  const tv = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(code);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
  await soon("setup: the TV marks Ada as host", async () => /Ada\s*host/i.test(await tv.getByTestId("tv-lobby").innerText()));

  // ---- A. Only the host has it ----
  await openMenu(bea);
  check("A a guest's menu has no players-and-roles tools", (await bea.getByTestId("players-roles").count()) === 0);
  await closeMenu(bea);
  await openMenu(ada);
  await soon("A the host's menu: Make host for Bea and Cal", async () => (await ada.getByTestId("make-host-Bea").isEnabled()) && (await ada.getByTestId("make-host-Cal").isEnabled()));

  // ---- B. The confirmation; Escape and Cancel change nothing ----
  await ada.getByTestId("make-host-Bea").click();
  await ada.getByTestId("handover-confirm").waitFor({ timeout: 5000 });
  const text = await ada.getByTestId("handover-confirm").innerText();
  check("B it names Bea and says Ada becomes a regular player", /Make Bea the host\?/.test(text) && /regular player/.test(text) && !/player-\d/.test(text), text.replace(/\n/g, " | "));
  check("B focus moves to the question", await ada.evaluate(() => document.activeElement?.id === "mz-handover-title"));
  await ada.keyboard.press("Escape");
  await soon("B Escape closes it", async () => (await ada.getByTestId("handover-confirm").count()) === 0);
  await ada.getByTestId("make-host-Bea").click();
  await ada.getByTestId("handover-cancel").click();
  check("B Cancel closes it; Ada is still the host", (await ada.getByTestId("handover-confirm").count()) === 0 && JSON.stringify(hosts(await myRoom(ada))) === '["Ada"]');

  // ---- C. By keyboard, the first reply lost ----
  const posts = [];
  await ada.route((url) => new URL(url).pathname.endsWith("/host"), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts.push(JSON.parse(route.request().postData() ?? "{}"));
    if (posts.length === 1) { await route.fetch(); await route.abort("connectionreset"); return; }
    await route.continue();
  });
  const toastsAda = watchToasts(ada), toastsBea = watchToasts(bea), toastsCal = watchToasts(cal);
  await ada.getByTestId("make-host-Bea").focus();
  await ada.keyboard.press("Enter");
  await ada.getByTestId("handover-confirm").waitFor({ timeout: 5000 });
  await ada.getByTestId("handover-confirm-yes").focus();
  await ada.keyboard.press("Enter");
  await soon("C the menu closes once the handover is confirmed", async () => (await ada.getByTestId("room-menu-sheet").count()) === 0, 20000);
  await ada.unrouteAll({ behavior: "ignoreErrors" });
  let room = await myRoom(ada);
  check("C exactly one handover: Bea is the only host, Ada isn't a cohost", JSON.stringify(hosts(room)) === '["Bea"]' && room.players.find((p) => p.displayName === "Ada")?.isCohost === false && room.me.isHost === false);
  check("C the retry was the same press (same request id), to Bea", posts.length === 2 && posts[0].attempt?.id === posts[1].attempt?.id && posts[0].targetId === posts[1].targetId, JSON.stringify(posts));

  // ---- D. Everyone sees it ----
  await soon("D Bea: 'Ada made you the host'", async () => [...toastsBea.seen].some((t) => /Ada made you the host/.test(t)));
  await soon("D Ada: 'Bea is the host now. You're a player.'", async () => [...toastsAda.seen].some((t) => /Bea is the host now\. You’re a player\./.test(t)));
  await soon("D Cal: 'Ada handed the host role to Bea'", async () => [...toastsCal.seen].some((t) => /Ada handed the host role to Bea/.test(t)));
  for (const t of [toastsAda, toastsBea, toastsCal]) t.stop();
  await soon("D Ada's Start is gone; she waits for Bea", async () => (await ada.getByTestId("dock-guest-note").count()) === 1 && /Waiting for Bea/.test(await ada.getByTestId("dock-guest-note").innerText()));
  await soon("D Bea has the Start", async () => (await bea.getByTestId("dock-guest-note").count()) === 0 && (await dockStart(bea).count()) === 1);
  await soon("D Cal waits for Bea", async () => /Waiting for Bea/.test(await cal.getByTestId("dock-guest-note").innerText()));
  await soon("D the TV marks Bea as host and names her", async () => /Bea\s*host/i.test(await tv.getByTestId("tv-lobby").innerText()) && !/Ada\s*host/i.test(await tv.getByTestId("tv-lobby").innerText()));
  await openMenu(ada);
  check("D Ada's menu has no host tools now", (await ada.getByTestId("players-roles").count()) === 0);
  await closeMenu(ada);

  // ---- E. Ada's own API attempts are refused ----
  room = await myRoom(ada);
  const rev = room.session.revision;
  const brk = await api(ada, "POST", "/rooms/:room/break", { on: true, attempt: { id: "ada-after-brk", sessionRevision: rev } });
  const start = await api(ada, "POST", "/rooms/:room/games", { gameId: "math-mayhem", official: false, roster: room.readiness.wouldPlay, attempt: { id: "ada-after-start", sessionRevision: rev } });
  const back = await api(ada, "POST", "/rooms/:room/host", { targetId: room.players.find((p) => p.displayName === "Ada").id, attempt: { id: "ada-after-back", sessionRevision: rev } });
  check("E Ada's break, start and hand-back are refused; nothing changed", brk.status === 403 && start.status >= 400 && back.status === 403 && (await myRoom(bea)).games.length === 0 && JSON.stringify(hosts(await myRoom(bea))) === '["Bea"]', JSON.stringify([brk.status, start.status, back.status]));

  // ---- F. Bea runs a game ----
  await soon("F Bea's Start is a plain Start for the room's up next", async () => (await dockStart(bea).isEnabled()) && /^Start /.test((await dockStart(bea).innerText()).trim()));
  await dockStart(bea).click();
  await passBriefing([ada, bea, cal]);
  for (const [p, n] of [[ada, "Ada"], [bea, "Bea"], [cal, "Cal"]]) await answerKitQuestions(p, { player: n, choose: () => 0 });
  await soon("F the results: Bea has What's next; Ada and Cal are told Bea picks", async () => (await bea.getByTestId("next-break").count()) === 1 && /Bea picks/.test(await ada.getByTestId("next-status").innerText()) && /Bea picks/.test(await cal.getByTestId("next-status").innerText()), 60000);
  check("F Ada has no continuation controls", (await ada.getByTestId("next-break").count()) === 0 && (await ada.getByTestId("next-play-again").count()) === 0);

  // ---- G. During a break, Bea hands it back; Ada resumes ----
  await bea.getByTestId("next-break").click();
  await soon("G on a break", async () => (await myRoom(bea)).session.onBreak === true);
  for (const p of [ada, bea, cal]) await p.getByRole("button", { name: "Back to lobby" }).last().click();
  await bea.getByTestId("break-banner").waitFor({ timeout: 10000 });
  await openMenu(bea);
  await bea.getByTestId("make-host-Ada").click();
  await bea.getByTestId("handover-confirm-yes").click();
  await soon("G during the break, Ada is the host again (the break is kept)", async () => { const r = await myRoom(ada); return JSON.stringify(hosts(r)) === '["Ada"]' && r.session.onBreak === true; });
  await soon("G Ada has Resume; Bea doesn't", async () => (await ada.getByTestId("break-resume").count()) === 1 && (await bea.getByTestId("break-resume").count()) === 0);
  await ada.getByTestId("break-resume").click();
  await soon("G Ada resumed: no break for anyone", async () => (await myRoom(cal)).session.onBreak === false && (await cal.getByTestId("break-banner").count()) === 0);

  // ---- H. A player who isn't connected; reloads ----
  await cal.context().close();
  await openMenu(ada);
  await soon("H Cal isn't connected: Make host is not offered for Cal", async () => (await ada.getByTestId("make-host-Cal").isDisabled()) && /not connected/.test(await ada.getByTestId("role-row-Cal").innerText()), 20000);
  await closeMenu(ada);
  await ada.reload({ waitUntil: "domcontentloaded" });
  await bea.reload({ waitUntil: "domcontentloaded" });
  await soon("H after reloading both: Ada has the host controls, Bea waits for Ada", async () => (await ada.getByTestId("dock-guest-note").count()) === 0 && /Waiting for Ada/.test(await bea.getByTestId("dock-guest-note").innerText()));
  room = await myRoom(bea);
  check("H exactly one host after the reloads", JSON.stringify(hosts(room)) === '["Ada"]', JSON.stringify(hosts(room)));

  // ---- I. Layout ----
  for (const w of [320, 1440]) {
    await ada.setViewportSize({ width: w, height: w === 320 ? 640 : 900 });
    await openMenu(ada);
    await ada.getByTestId("make-host-Bea").click();
    await ada.getByTestId("handover-confirm").scrollIntoViewIfNeeded();
    check(`I ${w} px: the menu and the confirmation fit, no sideways scroll`, (await ada.getByTestId("handover-confirm-yes").isVisible()) && await noSideScroll(ada));
    await ada.getByTestId("handover-cancel").click();
    await closeMenu(ada);
  }
  check("I nothing changed by the layout checks", JSON.stringify(hosts(await myRoom(bea))) === '["Ada"]');
} catch (e) {
  check("driver ran to the end", false, String(e?.message ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll host-handover checks passed");
process.exit(failures ? 1 : 0);
