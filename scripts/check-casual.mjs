// Stage 6.1: everyday hosting is casual; the Family Cup is a deliberate choice.
//   - Host a game defaults to Casual: the lobby shows no Cup (no Cup chip,
//     no Official/Practice choice, no Cup in the room menu) and says the game
//     is just for fun, for the host and for a guest.
//   - Two clients play a whole Math Mayhem game in the casual room, the guest
//     on plain http at this machine's network address like a phone on the
//     home Wi-Fi (an insecure context: no crypto.randomUUID) (through
//     its readiness briefing, kept for multiplayer), back to the lobby
//     ("Last game · Math Mayhem · Casual").
//   - The server agrees: roomKind casual, no official games, empty Cup
//     standings, and an official start sent straight to the API is refused.
//   - Picking Family Cup still makes a Cup (chip, Official by default, Cup in
//     the menu) and an official game there still produces standings: the two
//     never mix.
//   - A solo room's code joins nothing ("Room not found").
//   - Honest requirements: Math Mayhem reads "1–10 players · best with 2+".
//   - The theme is the same in a casual room and a Cup.
// Usage: node scripts/check-casual.mjs <baseUrl>   (the gate passes its server)
import { launchChromium } from "./lib/driver-env.mjs";
import { plainHttpContext } from "./lib/lan.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { openRoomMenu, closeRoomMenu, upNextTitle } from "./lib/room-nav.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}

/** Host from Home, as a person would; kind "casual" leaves the default alone. */
async function host(page, name, kind) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  if (kind === "cup") await page.getByTestId("host-kind-cup").click();
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
async function join(page, name, code, base = BASE) {
  await page.goto(`${base}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
/** This page's own view of its room (its seat's token). */
const myRoom = (page) => page.evaluate(async () => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(`/rooms/${roomId}/projection?audience=player`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } });
  return r.json();
});
const theme = (page) => page.evaluate(() => ({
  attr: document.querySelector("[data-mz-theme]")?.getAttribute("data-mz-theme") ?? null,
  ground: getComputedStyle(document.querySelector("[data-mz-theme]") ?? document.documentElement).getPropertyValue("--mz-ground").trim(),
  body: getComputedStyle(document.body).backgroundColor,
  meta: document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null,
}));
/** Both players answer the whole game (any option), then everyone is on the results. */
async function playMath(pages) {
  await passBriefing(pages);
  for (const [i, p] of pages.entries()) await answerKitQuestions(p, { player: `player ${i + 1}`, choose: (n) => n % 4 });
  for (const p of pages) await p.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
}

const browser = await launchChromium();
try {
  // ---- A. Host a game: Casual by default ----
  const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const h = await hostCtx.newPage();
  await h.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const mathMeta = await h.locator(".mz-gamecard, .mz-hero-card").filter({ hasText: "Math Mayhem" }).first().innerText().catch(() => "");
  check("Home is honest about Math Mayhem: 1–10 players, best with 2+", /1–10 players · best with 2\+/.test(mathMeta), mathMeta.replace(/\s+/g, " ").slice(0, 80));
  await h.getByTestId("home-host").click();
  await h.getByTestId("host-kind").waitFor({ timeout: 10000 });
  check("Host a game: Casual is chosen by default", (await h.getByTestId("host-kind-casual").getAttribute("aria-pressed")) === "true" && (await h.getByTestId("host-kind-cup").getAttribute("aria-pressed")) === "false");
  check("Host a game: the note says casual games count toward no Cup", /nothing counts toward a Cup/.test(await h.getByTestId("host-kind-note").innerText()));
  const code = await host(h, "Keku", "casual");
  check("a casual room is made and shows its room code", /^[A-Z0-9]{6}$/.test(code), code);
  check("casual lobby: no Cup chip", (await h.locator(".mz-cupchip").count()) === 0);
  await h.getByTestId("choose-game").click();
  await h.getByTestId("choose-sheet").waitFor({ timeout: 5000 });
  await h.getByTestId("select-game-math-mayhem").click();
  await h.getByTestId("choose-sheet").waitFor({ state: "detached", timeout: 5000 });
  check("casual lobby: Math Mayhem is up next", (await upNextTitle(h)) === "Math Mayhem");
  check("casual lobby: no Official/Practice choice", (await h.getByTestId("mode-choice").count()) === 0 && (await h.getByTestId("mode-official").count()) === 0);
  check("casual lobby: up next says Casual · just for fun", (await h.getByTestId("up-next-mode").innerText()).trim() === "Casual · just for fun");
  check("casual lobby: the dock says just for fun, no Cup", /Casual game: just for fun, no Cup\./.test(await h.getByTestId("dock-mode").innerText()));
  const start = h.getByTestId("start-practice-math-mayhem");
  await openRoomMenu(h);
  check("casual room menu: no Family Cup row", (await h.getByTestId("menu-cup").count()) === 0);
  await closeRoomMenu(h);
  const casualTheme = await theme(h);

  // ---- B. A guest joins by code (320 px, on plain http) and sees the same ----
  const guestLan = await plainHttpContext(browser, BASE, { viewport: { width: 320, height: 640 } });
  const g = await guestLan.ctx.newPage();
  await join(g, "Amina", code, guestLan.base);
  const gInfo = await g.evaluate(() => ({ secure: isSecureContext, randomUUID: typeof crypto.randomUUID }));
  check(`guest on plain http (${guestLan.real ? `real insecure context at ${new URL(guestLan.base).hostname}` : "simulated: randomUUID removed"})`, gInfo.randomUUID === "undefined" && (!guestLan.real || gInfo.secure === false), JSON.stringify(gInfo));
  await soon("guest: waits for the host's game, marked Casual, just for fun", async () => /Casual, just for fun/.test(await g.getByTestId("dock-guest-note").innerText()));
  check("guest: no Cup chip either", (await g.locator(".mz-cupchip").count()) === 0);
  await soon("host: Start names the game, with no Official/Practice suffix", async () => (await start.isEnabled()) && (await start.innerText()).trim() === "Start Math Mayhem");

  // ---- C. The server agrees ----
  let room = await myRoom(h);
  check("server: the room is casual", room.roomKind === "casual", room.roomKind);
  const refused = await h.evaluate(async () => {
    const roomId = sessionStorage.getItem("cgn_roomId");
    const r = await fetch(`/rooms/${roomId}/games`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, body: JSON.stringify({ gameId: "math-mayhem", official: true }) });
    return { status: r.status, body: await r.json() };
  });
  check("server: an official start sent straight to the API is refused", refused.status === 409 && refused.body.code === "NOT_A_CUP_ROOM", JSON.stringify(refused));

  // ---- D. Two clients play a whole game ----
  await start.click();
  await playMath([h, g]);
  check("both players reach the results", true);
  for (const p of [h, g]) await p.getByRole("button", { name: "Back to lobby" }).click();
  const lastLine = await soon("back in the lobby: Last game · Math Mayhem · Casual", async () => {
    const t = await h.locator(".mz-kicker").filter({ hasText: "Last game" }).first().innerText({ timeout: 1000 });
    return /Last game · Math Mayhem · Casual/i.test(t) ? t : null;
  });
  if (!lastLine) console.log(`  lobby shows: ${(await h.locator("main").first().innerText()).replace(/\s+/g, " ").slice(0, 400)}`);
  room = await myRoom(h);
  const played = (room.games ?? []).filter((x) => x.gameId === "math-mayhem");
  check("server: the game finished, unofficial, with both players scored", played.length === 1 && played[0].status === "finished" && played[0].official !== true && Object.keys(played[0].rawScores ?? {}).length === 2, JSON.stringify(played.map((x) => ({ s: x.status, o: x.official, r: x.rawScores }))));
  check("server: the casual room has empty Cup standings", JSON.stringify(room.officialStandings ?? {}) === "{}", JSON.stringify(room.officialStandings));

  // ---- E. A Family Cup, chosen on purpose, is still a Cup ----
  const cupCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ch = await cupCtx.newPage();
  const cupCode = await host(ch, "Keku", "cup");
  check("Family Cup lobby: the Cup chip is shown", (await ch.locator(".mz-cupchip").count()) === 1);
  await ch.getByTestId("choose-game").click();
  await ch.getByTestId("choose-sheet").waitFor({ timeout: 5000 });
  await ch.getByTestId("select-game-math-mayhem").click();
  await ch.getByTestId("choose-sheet").waitFor({ state: "detached", timeout: 5000 });
  check("Family Cup lobby: the Official/Practice choice is there", (await ch.getByTestId("mode-choice").count()) === 1);
  await openRoomMenu(ch);
  check("Family Cup room menu: the Cup row is there", (await ch.getByTestId("menu-cup").count()) === 1);
  await closeRoomMenu(ch);
  const cupTheme = await theme(ch);
  check("the theme is the same in a casual room and a Family Cup", casualTheme.ground !== "" && JSON.stringify(casualTheme) === JSON.stringify(cupTheme), `${JSON.stringify(casualTheme)} vs ${JSON.stringify(cupTheme)}`);
  const cupGuestCtx = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const cg = await cupGuestCtx.newPage();
  await join(cg, "Bea", cupCode);
  const cupStart = ch.getByTestId("start-official-math-mayhem");
  await soon("Family Cup: Start is Official by default", async () => (await cupStart.isEnabled()) && /· Official$/.test((await cupStart.innerText()).trim()));
  await cupStart.click();
  await playMath([ch, cg]);
  const cupRoom = await soon("Family Cup: the official game produces Cup standings for both players", async () => {
    const r = await myRoom(ch);
    return Object.keys(r.officialStandings ?? {}).length === 2 ? r : null;
  }, 15000);
  check("server: the Cup room is a Cup and its game was official", cupRoom?.roomKind === "cup" && (cupRoom?.games ?? []).some((x) => x.official === true && x.status === "finished"));
  room = await myRoom(h);
  check("isolation: the casual room's standings are still empty after the Cup's game", JSON.stringify(room.officialStandings ?? {}) === "{}", JSON.stringify(room.officialStandings));

  // ---- F. A solo room's code joins nothing ----
  const soloCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sp = await soloCtx.newPage();
  await sp.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
  await sp.getByTestId("solo-start-math-mayhem").click();
  await sp.locator("h1.mz-question").waitFor({ timeout: 20000 });
  const soloCode = await sp.evaluate(async () => {
    const seat = JSON.parse(localStorage.getItem("mchezo.solo.v1") ?? "null");
    const r = await fetch(`/rooms/${seat.roomId}/projection?audience=player`, { headers: { "x-session-token": seat.token } });
    return (await r.json()).joinCode;
  });
  const intruder = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await intruder.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await intruder.getByPlaceholder("e.g. Auntie June").fill("Intruder");
  await intruder.locator(".mz-code__input").fill(soloCode);
  await intruder.getByRole("button", { name: "Join the game" }).click();
  await soon("a solo room's code joins nothing: Room not found", async () => (await intruder.getByText(/Room not found/).count()) > 0 && (await intruder.getByRole("heading", { name: /You’re in/ }).count()) === 0);
  check("the solo round is untouched by the attempt", (await sp.getByTestId("solo-round").isVisible()));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "CASUAL ALL PASSED" : `CASUAL FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
