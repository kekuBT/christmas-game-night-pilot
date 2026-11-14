// Stage 12.3 (docs/stage12/stage123.md): Quick Party inside a Family Cup, end to end in the browser.
//   A  entry: the Cup host (only the host) sees "Plan today's games"; the server shows the Cup's (empty) lineup
//   B  the planner: "Family Cup · Official or Practice"; a lineup for one is all Practice (an official game needs
//      two); for two, each game that can count starts Official, a practice-only game says "Practice only", and the
//      host can switch a game to Practice; no sideways scroll at 320 px
//   C  Apply: host, guest, server and TV show each game's mode; Start says "Official · game 1 of N"
//   D  the lineup's first game is an official game: briefing, play, results; it counts toward the Cup; What's next
//      says the next game and its mode, with no Play again and no break (a Cup has neither)
//   E  Next game starts the lineup's second game in its own mode (Practice): nothing counts from it
//   F  a casual lineup carried into a Family Cup: its games still to play become Official where they can count
// Usage: node scripts/check-cup-party.mjs <baseUrl>   (the gate passes its server)
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { hostFamilyCup, openRoomMenu } from "./lib/room-nav.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage123-screenshots/${name}.png`) });
const myRoom = (page) => page.evaluate(async () => {
  const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=player`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } });
  return r.json();
});
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const preview = (page) => page.locator('[data-testid^="party-item-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-game")));
/** Games that can be Official (src/server/lifecycle.ts policy) and fit two players. */
const COUNTABLE = new Set(["math-mayhem", "word-connections", "trivia", "guess-the-year", "closest-wins", "geography"]);

async function host(page, name, kind) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  if (kind === "cup") await hostFamilyCup(page);
  else await page.getByRole("button", { name: "Host a game", exact: true }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  return code;
}
async function join(page, name, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
/** In the open planner: make Math Mayhem the first game (it fits anyone and can count). */
async function mathFirst(page) {
  for (let guard = 0; guard < 12; guard++) {
    const ids = await preview(page);
    const at = ids.indexOf("math-mayhem");
    if (at === 0) return true;
    if (at > 0) { await page.getByTestId(`party-up-${at}`).click(); continue; }
    await page.getByTestId("party-replace-0").click();
    const opt = page.getByTestId("party-option-math-mayhem");
    if (await opt.count() > 0) { await opt.click(); continue; }
    await page.getByTestId("party-replace-0").click();
    if (ids.length < 2) return false;
    await page.getByTestId(`party-remove-${ids.length - 1}`).click();
  }
  return false;
}

const browser = await launchChromium();
try {
  // ---- A. Entry ----
  const hctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const h = await hctx.newPage();
  const code = await host(h, "Keku", "cup");
  const gctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const g = await gctx.newPage();
  await join(g, "Amina", code);
  const tctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tctx.newPage();
  await tv.goto(`${BASE}/tv?code=${code}`, { waitUntil: "domcontentloaded" });
  await tv.getByTestId("tv-lobby").waitFor({ timeout: 20000 });
  await soon("A Cup host: a Quick Party entry that plans today's games", async () => /today’s games/.test(await h.getByTestId("party-card").innerText()));
  check("A guest: no Quick Party controls", (await g.getByTestId("party-entry").count()) === 0);
  let room = await myRoom(h);
  check("A server: a Family Cup with an empty lineup", room.roomKind === "cup" && room.party?.revision === 0 && room.party?.lineup === null, JSON.stringify(room.party));

  // ---- B. The planner ----
  await h.getByTestId("party-entry").click();
  await h.getByTestId("party-sheet").waitFor({ timeout: 10000 });
  check("B the planner is the Cup's: Official or Practice", /Family Cup · Official or Practice/i.test(await h.getByTestId("party-sheet").innerText()));
  check("B group size starts at who is here (2)", (await h.getByTestId("party-size").innerText()).trim() === "2");
  await h.getByTestId("party-size-dec").click();
  await h.getByTestId("party-time-60").click();
  await h.getByTestId("party-suggest").click();
  await h.getByTestId("party-preview").waitFor({ timeout: 5000 });
  const one = await h.getByTestId("party-cup-note").innerText();
  const toggles1 = await h.locator('button[data-testid^="party-mode-"]').count();
  check("B a lineup for one is all Practice (an official game needs two), with no Official switch", /all Practice/.test(one) && toggles1 === 0, one);
  await h.getByTestId("party-size-inc").click();
  await h.getByTestId("party-suggest").click();
  await h.getByTestId("party-preview").waitFor({ timeout: 5000 });
  check("B Math Mayhem is first in the lineup", await mathFirst(h));
  let ids = await preview(h);
  if (ids.length < 2) { await h.getByTestId("party-regenerate").click(); await mathFirst(h); ids = await preview(h); }
  const modes = [];
  for (let i = 0; i < ids.length; i++) {
    const m = h.getByTestId(`party-mode-${i}`);
    modes.push({ id: ids[i], tag: await m.evaluate((e) => e.tagName), pressed: await m.getAttribute("aria-pressed"), text: (await m.innerText()).trim() });
  }
  check("B every game that can count starts Official; a practice-only game says Practice only", modes.every((m) => (COUNTABLE.has(m.id) ? m.tag === "BUTTON" && m.pressed === "true" && m.text === "Official" : m.tag === "SPAN" && m.text === "Practice only")), JSON.stringify(modes));
  // The host makes the lineup's SECOND game Practice (step E starts it next). The planner orders games at random, so
  // the second can be practice-only (Pattern Pulse): then the host replaces it with a game that can count first.
  // (Until Stage 12.5 this switched the first countable game after the first, wherever it was, while E always starts
  // the second game: whenever the second was practice-only, E expected the wrong game. Found in gate run
  // 20261114-080049-cceb707a-20481.)
  let practiceAt = modes[1]?.tag === "BUTTON" ? 1 : -1;
  if (practiceAt < 0 && ids.length >= 2) {
    await h.getByTestId("party-replace-1").click();
    const options = await h.locator('[data-testid^="party-option-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("party-option-", "")));
    const pick = options.find((id) => COUNTABLE.has(id));
    console.log(`  B the planner put ${ids[1]} (practice-only) second; the host replaces it with ${pick ?? "nothing (no option that can count)"}`);
    if (pick) await h.getByTestId(`party-option-${pick}`).click(); else await h.getByTestId("party-replace-1").click();
    ids = await preview(h);
    practiceAt = COUNTABLE.has(ids[1]) ? 1 : -1;
  }
  check("B the lineup's second game can count", practiceAt === 1, JSON.stringify(ids));
  await h.getByTestId(`party-mode-${practiceAt}`).click();
  check("B the host switched it to Practice", (await h.getByTestId(`party-mode-${practiceAt}`).getAttribute("aria-pressed")) === "false" && (await h.getByTestId(`party-mode-${practiceAt}`).innerText()).trim() === "Practice");
  const practiceGame = ids[practiceAt];
  ids = await preview(h);
  await sleep(400);
  await shot(h, "cup-planner-390");
  await h.setViewportSize({ width: 320, height: 640 });
  await sleep(300);
  check("B no sideways scroll at 320 px with the mode switches", await noSideScroll(h));
  await h.setViewportSize({ width: 390, height: 844 });

  // ---- C. Apply: everyone sees each game's mode ----
  await h.getByTestId("party-apply").click();
  await h.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
  room = await myRoom(h);
  const want = ids.map((id, i) => i !== practiceAt && COUNTABLE.has(id));
  check("C server: the saved lineup's modes are the planner's", JSON.stringify(room.party.lineup.items.map((i) => i.official)) === JSON.stringify(want), JSON.stringify(room.party.lineup.items));
  await soon("C host lobby: each row says its mode", async () => (await h.getByTestId("party-row-0").getAttribute("data-mode")) === "official" && (await h.getByTestId(`party-row-${practiceAt}`).getAttribute("data-mode")) === "practice" && /Official ·/.test(await h.getByTestId("party-row-0").innerText()));
  await soon("C guest lobby: the same modes", async () => (await g.getByTestId("party-row-0").getAttribute("data-mode")) === "official" && (await g.getByTestId(`party-row-${practiceAt}`).getAttribute("data-mode")) === "practice");
  const startText = await h.getByTestId("party-start").innerText();
  check("C Start says the mode and the place in the lineup", /Official · game 1 of/.test(startText), startText);
  await soon("C TV: the lineup with each game's mode", async () => /Math Mayhem · Official/.test(await tv.getByTestId("tv-lineup").innerText()) && new RegExp(`· Practice`).test(await tv.getByTestId("tv-lineup").innerText()));
  // The TV's Cup lobby also holds the Cup card: a long lineup shows three games and how many more, so nothing is cut off.
  if (ids.length > 3) check("C TV: a long lineup shows three games and says how many more", (await tv.locator('[data-testid="tv-lineup"] li').count()) === 3 && /more after these/.test(await tv.getByTestId("tv-lineup-more").innerText()));
  const cupCard = await tv.getByTestId("tv-cup").boundingBox();
  const director = await tv.getByRole("button", { name: "Stop watching" }).boundingBox();
  check("C TV: the Family Cup card is whole, above the director's buttons", !!cupCard && !!director && cupCard.y + cupCard.height <= director.y - 8, JSON.stringify({ cupCard, director }));
  await shot(h, "cup-lobby-lineup-390");
  await shot(g, "cup-lobby-guest-390");
  await shot(tv, "tv-cup-lineup-1920");

  // ---- D. The first game: official, through the Cup's briefing, counting ----
  await h.getByTestId("party-start").click();
  await passBriefing([h, g]);
  room = await myRoom(h);
  check("D the lineup's first game started as an official game", room.games.length === 1 && room.games[0].gameId === "math-mayhem" && room.games[0].official === true && room.party.lineup.items[0].started === true, JSON.stringify(room.games.map((x) => [x.gameId, x.official, x.status])));
  for (const [i, p] of [h, g].entries()) await answerKitQuestions(p, { player: `player ${i + 1}`, choose: (n) => (i === 0 ? 0 : n % 4) });
  await soon("D host results: What's next names the next game and its mode", async () => new RegExp(`Next game: .+ · Practice`).test(await h.getByTestId("next-game").innerText()), 30000);
  check("D a Cup's What's next has no Play again and no break", (await h.getByTestId("next-play-again").count()) === 0 && (await h.getByTestId("next-break").count()) === 0);
  await soon("D guest results: up next with its mode", async () => /Up next: .+ · Practice/.test(await g.getByTestId("whats-next").innerText()), 20000);
  await sleep(500);
  await shot(h, "cup-results-whats-next-390");
  room = await myRoom(h);
  check("D server: the official game finished and counted toward the Cup", room.games[0].status === "finished" && (room.championship ?? []).length > 0 && room.party.lineup.next === 1, JSON.stringify({ champ: room.championship, next: room.party.lineup.next }));

  // ---- E. Next game: the second in its own mode (Practice) ----
  const champBefore = JSON.stringify(room.championship);
  // The press's own answer, recorded where the page sends it (a failure below says what the server said).
  const startReply = h.waitForResponse((r) => r.url().endsWith("/games") && r.request().method() === "POST", { timeout: 20000 }).then(async (r) => ({ status: r.status(), body: await r.json().catch(() => null) })).catch((e) => ({ error: String(e.message ?? e).split("\n")[0] }));
  await h.getByTestId("next-game").click();
  const started = await soon("E the second game started as Practice", async () => { const r = await myRoom(h); return r.games.length === 2 && r.games[1].gameId === practiceGame && r.games[1].official === false && r.party.lineup.items[1].started === true; }, 20000);
  if (!started) {
    // Diagnostics: what the Start press got back, what the host's screen says, and who the room thinks is here.
    const r = await myRoom(h);
    console.log(`  E diagnostics: start reply ${JSON.stringify(await startReply).slice(0, 600)}`);
    console.log(`  E diagnostics: host screen ${JSON.stringify((await h.evaluate(() => document.body.innerText)).slice(0, 700))}`);
    console.log(`  E diagnostics: room ${JSON.stringify({ games: r.games.map((x) => [x.gameId, x.official, x.status]), next: r.party?.lineup?.next, readiness: r.readiness })}`);
  }
  room = await myRoom(h);
  check("E nothing counted from it: the Cup standings are unchanged", JSON.stringify(room.championship) === champBefore);
  await hctx.close(); await gctx.close(); await tctx.close();

  // ---- F. A casual lineup carried into a Family Cup ----
  const cctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const c = await cctx.newPage();
  const ccode = await host(c, "Ama", "casual");
  const c2ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await join(await c2ctx.newPage(), "Baraka", ccode);
  await c.getByTestId("party-entry").click();
  await c.getByTestId("party-sheet").waitFor({ timeout: 10000 });
  check("F the casual planner has no mode switches", (await c.locator('[data-testid^="party-mode-"]').count()) === 0 && /Casual · just for fun/i.test(await c.getByTestId("party-sheet").innerText()));
  await c.getByTestId("party-time-60").click();
  await c.getByTestId("party-suggest").click();
  await c.getByTestId("party-preview").waitFor({ timeout: 5000 });
  await mathFirst(c);
  const cids = await preview(c);
  await c.getByTestId("party-apply").click();
  await c.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
  await openRoomMenu(c);
  await c.getByTestId("menu-make-cup").click();
  await c.getByTestId("make-cup-confirm").click();
  await c.getByTestId("make-cup-sheet").waitFor({ state: "detached", timeout: 15000 });
  const carried = await soon("F after the upgrade, the lineup's games that can count are Official", async () => { const r = await myRoom(c); return r.roomKind === "cup" && JSON.stringify(r.party.lineup.items.map((i) => i.official)) === JSON.stringify(cids.map((id) => COUNTABLE.has(id))) ? r : null; });
  if (carried) await soon("F Start follows: Official · game 1", async () => /Official · game 1 of/.test(await c.getByTestId("party-start").innerText()));
  await cctx.close(); await c2ctx.close();
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "CUP PARTY ALL PASSED" : `CUP PARTY: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
