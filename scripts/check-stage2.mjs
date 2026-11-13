// Stage 2 "Night Circle" (owner directive 2026-11-08; docs/ux-redesign/PROPOSAL.md
// §2–§6): Home B, Join/Host, Lobby A with its sheets, the visual library, and
// navigation, through the real UI.
//
//   A. Home: every cover (count from /games), the dock, nothing invented, details sheet + Back.
//   B. Host must type a name (A-04); a QR link fills in the code.
//   C. Lobby A at 375/390/430/768/1440 with 1 and 10 players (long names):
//      Start in the dock and on screen, nothing hidden under the dock, no
//      sideways scrolling, touch targets, guests' waiting line.
//   D. Sheets and Back: Invite, Choose game, Room menu; Back closes a sheet;
//      Back from Cup/library returns to the lobby; Back from the lobby goes
//      Home with Rejoin and the seat kept; Rejoin; reload on routes; deep
//      links while seated (same room → room; other room → explained, no
//      second seat); no duplicate seat after Back/Forward/QR.
//   E. Accessibility: dialogs are named, focus moves into a sheet, Escape
//      closes; icon buttons are labelled; reduced motion and "Off".
//   F. The journey Home → Host → Invite → Choose → Briefing → Play → Results
//      → Lobby, host and guest.
// iOS swipe-back is emulated with history.back(): iOS Safari is not
// available here, so real-device checks stay on the owner's checklist.
// Usage: build:web, serve on a port (test content mode), then:
//   node scripts/check-stage2.mjs <baseUrl>
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { closeRoomMenu, openRoomMenu, roomGo, upNextTitle, hostFamilyCup } from "./lib/room-nav.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage2-screenshots/${name}.png`) });
const path = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };
const LONG = ["Amina-Josephine Wanjiku", "Bartholomew Otieno", "Christabel Nyambura", "Dmitri Kiprotich", "Esperanza Wambui", "Fitzgerald Mwangi", "Gwendolyn Achieng", "Maximilian Ochieng", "Ngozi Adebayo-Smith"];

async function hostRoom(page, name) {
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await hostFamilyCup(page);
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await page.getByTestId("share-room").getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300);
  }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(`${BASE}/join?code=${code}`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function joinByHttp(code, name) {
  const r = await fetch(`${BASE}/rooms/join-by-code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ joinCode: code, displayName: name }) });
  if (!r.ok) throw new Error(`join ${name}: ${r.status}`);
}
const seatsIn = async (page) => page.evaluate(async () => {
  const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=player`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } });
  return (await r.json()).players?.length ?? -1;
});
/** Lobby layout problems at the current size (empty = fine). */
const lobbyLayout = (page) => page.evaluate(() => {
  const out = [];
  const R = (el) => el.getBoundingClientRect();
  const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const vw = innerWidth, vh = innerHeight;
  const screen = document.querySelector(".mz-screen");
  if (document.scrollingElement.scrollWidth > vw + 1) out.push(`the page scrolls sideways (${document.scrollingElement.scrollWidth} > ${vw})`);
  if (screen && screen.scrollWidth > screen.clientWidth + 1) out.push("the lobby scrolls sideways");
  const dock = document.querySelector('[data-testid="lobby-dock"]');
  if (!dock) { out.push("no dock"); return out; }
  const d = R(dock);
  if (d.bottom > vh + 0.5 || d.top < 0) out.push(`the dock is off screen (${Math.round(d.top)}–${Math.round(d.bottom)} of ${vh})`);
  const start = dock.querySelector('[data-testid^="start-"]');
  if (start) { const s = R(start); if (s.top < 0 || s.bottom > vh) out.push("Start is not fully on screen"); }
  for (const sel of [".mz-h1", ".mz-lobby__status", ".mz-topbar"]) { const el = document.querySelector(sel); if (el && overlap(R(el), d)) out.push(`the dock covers ${sel}`); }
  const seats = [...document.querySelectorAll(".mz-seat:not(.mz-seat--empty)")];
  for (const a of seats) for (const b of seats) {
    if (a === b) continue;
    const name = a.querySelector(".mz-seat__name"), tok = b.querySelector(".mz-token");
    if (name && tok && overlap(R(name), R(tok))) out.push(`the name "${name.textContent}" covers another seat's token`);
  }
  for (const b of document.querySelectorAll("button")) {
    const r = R(b); if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(b); if (cs.visibility === "hidden") continue;
    if (r.height < 43.5 || r.width < 43.5) out.push(`small touch target "${(b.getAttribute("aria-label") ?? b.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return out;
});
/** Scroll the lobby to its end: the last content must sit above the dock. */
const endVisible = (page) => page.evaluate(async () => {
  // Stage 3 QA: the lobby's content scrolls in its own area above the dock.
  const screen = document.querySelector('[data-testid="lobby-scroll"]') ?? document.querySelector(".mz-screen");
  screen.scrollTop = screen.scrollHeight;
  await new Promise((r) => setTimeout(r, 120));
  const dock = document.querySelector('[data-testid="lobby-dock"]').getBoundingClientRect();
  const kids = [...screen.children].filter((el) => el.getBoundingClientRect().height > 0);
  const before = screen.matches('[data-testid="lobby-scroll"]') ? kids.at(-1) : document.querySelector('[data-testid="lobby-dock"]').previousElementSibling;
  const last = before?.getBoundingClientRect();
  const ok = !last || last.bottom <= dock.top + 1;
  screen.scrollTop = 0;
  return { ok, last: last ? Math.round(last.bottom) : null, dock: Math.round(dock.top) };
});

// The catalogue size comes from the server (Stage 5 added games), never a fixed number.
const TOTAL = (await (await fetch(`${BASE}/games`)).json()).length;
// Stage 9.1: a Family Cup's picker leaves out casual-only games (Jebena Rush), which a Cup can't start.
const CUP_TOTAL = (await (await fetch(`${BASE}/games`)).json()).filter((g) => !g.casualOnly).length;

const browser = await launchChromium();
try {
  // ======================================================== A. Home
  const homeCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const visitor = await homeCtx.newPage();
  await visitor.goto(BASE, { waitUntil: "domcontentloaded" });
  await visitor.getByTestId("home").waitFor({ timeout: 15000 });
  await sleep(500);
  const covers = await visitor.evaluate(() => [...new Set([...document.querySelectorAll("[data-cover]")].map((e) => e.getAttribute("data-cover")))]);
  check(`A. Home shows the covers of all ${TOTAL} games (featured + shelf)`, covers.length === TOTAL, covers.join(","));
  check("A. the featured game is labelled as today's feature, not a recommendation", /Featured today/i.test(await visitor.locator("body").innerText()));
  const homeText = await visitor.locator("body").innerText();
  check("A. Home invents nothing (no rankings, recommendations or recent activity)", !/recommended for you|recently played|trending|you’re \d|you're \d|\b(1st|2nd|3rd)\b|players online/i.test(homeText));
  check("A. no Rejoin card without a seat", (await visitor.getByTestId("home-rejoin").count()) === 0);
  for (const [w, h] of [[375, 667], [390, 844], [430, 932]]) {
    await visitor.setViewportSize({ width: w, height: h });
    await sleep(250);
    const dock = await visitor.evaluate(() => ["home-join", "home-host"].map((id) => { const r = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    check(`A. ${w}x${h}: Join and Host are on screen in the dock`, dock.every(Boolean));
    await shot(visitor, `home-${w}`);
  }
  await visitor.setViewportSize({ width: 390, height: 844 });
  await visitor.getByTestId("home-featured").click();
  await visitor.getByTestId("game-details").waitFor({ timeout: 5000 });
  check("A. a cover opens its details as a sheet with its own address", /[?&]sheet=details/.test(path(visitor)));
  check("A. the details separate the estimate from the real time limit", /design estimate/.test(await visitor.getByTestId("game-details").innerText()));
  await sleep(500); // let the sheet finish sliding in
  await shot(visitor, "home-details-390");
  await visitor.goBack();
  await visitor.getByTestId("game-details").waitFor({ state: "detached", timeout: 5000 });
  check("A. Back closes the sheet and stays Home", path(visitor) === "/" && (await visitor.getByTestId("home").count()) === 1);
  await visitor.getByTestId("home-all-games").click();
  await visitor.getByTestId("mz-lib-count").waitFor({ timeout: 5000 });
  const libCovers = await visitor.locator('[data-testid^="mz-lib-card-"] [data-cover]').count();
  check("A. the library shows a cover on every card", libCovers === TOTAL, String(libCovers));
  check("A. practice-only games are marked in the library", (await visitor.getByTestId("mz-lib-card-impostor").innerText()).includes("Practice only") && (await visitor.getByTestId("mz-lib-card-charades").innerText()).includes("Practice only"));
  check("A. the library outside a room offers no 'Set as up next'", (await visitor.locator('[data-testid^="mz-lib-select-"]').count()) === 0);
  await shot(visitor, "library-390");
  await visitor.getByTestId("mz-lib-back").click();
  await visitor.getByTestId("home").waitFor({ timeout: 5000 });
  check("A. in-app Back from the library returns Home", path(visitor) === "/");
  await homeCtx.close();

  // ======================================================== B. Host name (A-04), QR prefill
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  await host.getByTestId("home-host").click();
  await host.getByTestId("host-screen").waitFor({ timeout: 5000 });
  check("B. A-04: Host is not possible without a name", await host.getByRole("button", { name: "Host a game" }).isDisabled() && await host.getByTestId("host-reason").isVisible());
  await host.getByPlaceholder("e.g. Auntie June").fill("   ");
  check("B. A-04: spaces are not a name", await host.getByRole("button", { name: "Host a game" }).isDisabled());
  await shot(host, "host-390");
  await host.getByPlaceholder("e.g. Auntie June").fill("Keku");
  await hostFamilyCup(host);
  await host.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });
  const code = ((await host.getByTestId("share-room").getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
  check("B. the host's room shows their name, never 'Player 1'", !(await host.locator("body").innerText()).includes("Player 1"));
  check("B. hosting replaced the Host screen: the lobby is /room", path(host) === "/room");
  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestCtx.newPage();
  await guest.goto(`${BASE}/join?code=${code}`, { waitUntil: "domcontentloaded" });
  await guest.getByTestId("join-screen").waitFor({ timeout: 5000 });
  const filled = await guest.evaluate(() => [...document.querySelectorAll(".mz-code__tile")].map((t) => t.textContent).join(""));
  check("B. a QR/invite link fills in the room code", filled === code, filled);
  await shot(guest, "join-qr-390");
  await guest.getByPlaceholder("e.g. Auntie June").fill("Bea");
  await guest.getByRole("button", { name: "Join the game" }).click();
  await guest.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });

  // ======================================================== C. Lobby A layout
  await sleep(800);
  const sizes = [[375, 667], [390, 844], [430, 932], [768, 1024], [1440, 900]];
  for (const [w, h] of sizes) {
    await host.setViewportSize({ width: w, height: h });
    await sleep(400);
    const probs = await lobbyLayout(host);
    check(`C. ${w}x${h}, 2 players: Start in the dock, nothing covered, no sideways scroll, 44px targets`, probs.length === 0, probs.join("; "));
    const end = await endVisible(host);
    check(`C. ${w}x${h}: the end of the lobby scrolls clear of the dock`, end.ok, JSON.stringify(end));
    await shot(host, `lobby-host-${w}`);
  }
  await host.setViewportSize({ width: 390, height: 844 });
  check("C. the up-next card shows the game's cover", (await host.locator('[data-testid="up-next-card"] [data-cover]').count()) === 1);
  check("C. guests get no Change, mode or Start", (await guest.getByTestId("choose-game").count()) === 0 && (await guest.getByTestId("mode-official").count()) === 0 && (await guest.locator('[data-testid^="start-"]').count()) === 0);
  check("C. guests' dock says who will start", /Waiting for Keku to start/.test(await guest.getByTestId("lobby-dock").innerText()));
  await shot(guest, "lobby-guest-390");
  for (const n of LONG.slice(0, 8)) await joinByHttp(code, n); // 10 seats: the room's capacity
  await sleep(2600);
  for (const [w, h] of sizes) {
    await host.setViewportSize({ width: w, height: h });
    await sleep(400);
    const probs = await lobbyLayout(host);
    check(`C. ${w}x${h}, 10 players with long names: layout holds`, probs.length === 0, probs.join("; "));
    const end = await endVisible(host);
    check(`C. ${w}x${h}, 10 players: the end of the lobby scrolls clear of the dock`, end.ok, JSON.stringify(end));
    await shot(host, `lobby-host-10-${w}`);
  }
  await host.setViewportSize({ width: 390, height: 844 });
  const status10 = await host.getByTestId("lobby-status").innerText();
  check("C. a full room says so", /room is full/.test(status10), status10);

  // ======================================================== D. Sheets and Back
  const seats0 = await seatsIn(host);
  await host.getByTestId("share-room").click();
  await host.getByTestId("invite-sheet").waitFor({ timeout: 5000 });
  check("D. Invite opens as a sheet with its own address", path(host) === "/room?sheet=invite");
  await sleep(500); // let the sheet finish sliding in
  await shot(host, "invite-390");
  await host.goBack();
  await host.getByTestId("invite-sheet").waitFor({ state: "detached", timeout: 5000 });
  check("D. Back closes the Invite sheet and stays in the lobby", path(host) === "/room" && (await host.getByRole("heading", { name: "You’re in, Keku." }).count()) === 1);
  await host.getByTestId("choose-game").click();
  await host.getByTestId("choose-sheet").waitFor({ timeout: 5000 });
  check(`D. Choose game lists all ${CUP_TOTAL} games a Cup can play, with covers`, (await host.locator('[data-testid^="select-game-"] [data-cover]').count()) === CUP_TOTAL);
  await sleep(500); // let the sheet finish sliding in
  await shot(host, "choose-390");
  await host.getByTestId("select-game-word-connections").click();
  await host.getByTestId("choose-sheet").waitFor({ state: "detached", timeout: 5000 });
  check("D. picking a game closes the sheet, keeps the room and sets up next", path(host) === "/room" && (await upNextTitle(host)) === "Word Connections");
  await openRoomMenu(host);
  check("D. the room menu has its own address", path(host) === "/room?sheet=menu");
  await sleep(500); // let the sheet finish sliding in
  await shot(host, "menu-390");
  await host.getByTestId("menu-cup").click();
  await host.getByText("Championship standings").waitFor({ timeout: 15000 });
  check("D. Family Cup opens at /room/cup", path(host) === "/room/cup");
  await host.reload({ waitUntil: "domcontentloaded" });
  await host.getByText("Championship standings").waitFor({ timeout: 15000 });
  check("D. reloading /room/cup shows the Cup again", path(host) === "/room/cup");
  await host.goBack();
  await host.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });
  check("D. Back from the Cup returns to the lobby (not to the menu)", path(host) === "/room" && (await host.getByTestId("room-menu-sheet").count()) === 0);
  // Cup → TV (Stage 4: through the Cup's own room menu) → "Back to phone view" (Stage 5's TV show): the lobby, not the Cup.
  await roomGo(host, "cup");
  await host.getByText("Championship standings").waitFor({ timeout: 15000 });
  await roomGo(host, "tv");
  await host.getByTestId("tv-show").waitFor({ timeout: 15000 }); // Stage 5: the live show
  check("D. Cup → TV is one step: /room/tv", path(host) === "/room/tv");
  await host.getByTestId("tv-back").click();
  await host.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });
  check("D. 'Back to phone view' from the TV (after the Cup) returns to the lobby", path(host) === "/room");
  await roomGo(host, "cup");
  await host.getByText("Championship standings").waitFor({ timeout: 15000 });
  await roomGo(host, "tv");
  await host.getByTestId("tv-show").waitFor({ timeout: 15000 }); // Stage 5: the live show
  await host.goBack();
  await host.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });
  check("D. browser Back from the TV (after the Cup) returns to the lobby too", path(host) === "/room");
  check("D. the host's pick survived the trip and the reload", (await upNextTitle(host)) === "Word Connections");
  await roomGo(host, "library");
  await host.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
  await host.getByTestId("mz-lib-card-geography").getByRole("button", { name: /details/ }).click();
  await host.getByTestId("game-details").waitFor({ timeout: 5000 });
  await host.getByTestId("details-make-up-next").click();
  await host.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });
  check("D. 'Make this up next' from the library's details returns to the lobby in one step", path(host) === "/room" && (await upNextTitle(host)) === "Geography Challenge");
  // Back from the lobby: Home with Rejoin, the seat kept, the socket alive.
  const myId = await host.evaluate(() => sessionStorage.getItem("cgn_playerId"));
  await host.goBack();
  await host.getByTestId("home").waitFor({ timeout: 15000 });
  await host.getByTestId("home-rejoin").waitFor({ timeout: 15000 });
  check("D. Back from the lobby goes Home and offers Rejoin with the room code", (await host.getByTestId("home-rejoin").innerText()).includes(code));
  check("D. ...without leaving the room (same seat on this tab)", (await host.evaluate(() => sessionStorage.getItem("cgn_playerId"))) === myId);
  await sleep(600); // let the screen finish fading in
  await shot(host, "home-rejoin-390");
  await host.goForward();
  await host.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });
  check("D. Forward returns to the lobby", path(host) === "/room");
  await host.goBack();
  await host.getByTestId("home-rejoin-btn").click();
  await host.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });
  check("D. Rejoin opens the room again", path(host) === "/room");
  // Deep links while seated.
  await host.goto(`${BASE}/join?code=${code}`, { waitUntil: "domcontentloaded" });
  await host.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });
  check("D. a QR link to my own room opens my room", path(host) === "/room");
  const otherCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const other = await otherCtx.newPage();
  const code2 = await hostRoom(other, "Mzee");
  const seats2 = await seatsIn(other);
  await host.goto(`${BASE}/join?code=${code2}`, { waitUntil: "domcontentloaded" });
  await host.getByTestId("seated-notice").waitFor({ timeout: 15000 });
  await sleep(600);
  check("D. a QR link to another room explains instead of taking a second seat", (await host.getByRole("button", { name: "Join the game" }).count()) === 0);
  await shot(host, "join-while-seated-390");
  await host.getByTestId("seated-go-room").click();
  await host.getByRole("heading", { name: "You’re in, Keku." }).waitFor({ timeout: 15000 });
  check("D. no duplicate seat after Back, Forward, reload and QR links (this room)", (await seatsIn(host)) === seats0, `${await seatsIn(host)} vs ${seats0}`);
  check("D. ...and none in the other room", (await seatsIn(other)) === seats2);
  await otherCtx.close();
  // A tab without a seat that opens a room address goes Home.
  const stray = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await stray.goto(`${BASE}/room/cup`, { waitUntil: "domcontentloaded" });
  await stray.getByTestId("home").waitFor({ timeout: 15000 });
  check("D. a room address without a seat lands Home", path(stray) === "/");
  const api = await fetch(`${BASE}/room/secret`);
  check("D. unknown addresses are not served the app (404)", api.status === 404);

  // ======================================================== E. Accessibility
  await openRoomMenu(host);
  const a11y = await host.evaluate(() => {
    const d = document.querySelector('[data-testid="room-menu-sheet"] [role="dialog"]');
    const title = d && document.getElementById(d.getAttribute("aria-labelledby") ?? "");
    return { modal: d?.getAttribute("aria-modal"), name: title?.textContent, focused: document.activeElement === title };
  });
  check("E. the room menu is a named modal dialog and takes focus", a11y.modal === "true" && a11y.name === "Room menu" && a11y.focused, JSON.stringify(a11y));
  let escaped = 0;
  for (let i = 0; i < 40; i++) {
    await host.keyboard.press(i % 7 === 6 ? "Shift+Tab" : "Tab");
    if (!(await host.evaluate(() => !!document.activeElement?.closest('[data-testid="room-menu-sheet"]')))) escaped++;
  }
  check("E. Tab and Shift+Tab stay inside the open sheet", escaped === 0, `${escaped} of 40 presses left it`);
  await closeRoomMenu(host);
  check("E. Escape closes it and the address follows", path(host) === "/room");
  check("E. focus returns to the button that opened it", await host.evaluate(() => document.activeElement?.getAttribute("data-testid") === "room-menu"));
  const labels = await host.evaluate(() => ["room-menu", "share-room"].map((id) => document.querySelector(`[data-testid="${id}"]`)?.getAttribute("aria-label")));
  check("E. icon-led buttons have spoken names", labels[0] === "Room menu" && /^Share room code [A-Z0-9]{6}$/.test(labels[1] ?? ""), JSON.stringify(labels));
  const startName = await host.locator('[data-testid^="start-"]').first().innerText();
  // Stage 3 QA (S3-LOB-01): Start also names the mode it starts in.
  check("E. Start says what it starts, and in which mode", /^Start Geography Challenge · (Official|Practice)$|^Waiting for players/.test(startName.trim()), startName);
  const rmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const rm = await rmCtx.newPage();
  await rm.goto(BASE, { waitUntil: "domcontentloaded" });
  await rm.getByTestId("home").waitFor({ timeout: 15000 });
  const rmAnim = await rm.evaluate(() => getComputedStyle(document.querySelector(".mz-screen")).animationName);
  // The OS setting stops all animation (index.css); the in-app "Less" setting fades.
  check("E. reduced motion: screens never slide in", rmAnim === "none" || rmAnim === "mz-fade", rmAnim);
  await rmCtx.close();

  // ======================================================== F. The journey
  // A fresh room: Ada hosts from Home, invites, chooses Trivia, plays it
  // officially with Bea through the briefing, sees results, and is back in
  // the lobby.
  const jCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ada = await jCtx.newPage();
  await ada.goto(BASE, { waitUntil: "domcontentloaded" });
  await ada.getByTestId("home-host").click();
  await ada.getByPlaceholder("e.g. Auntie June").fill("Ada");
  await hostFamilyCup(ada);
  await ada.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  await ada.getByTestId("share-room").click();
  const inviteText = await ada.getByTestId("invite-sheet").innerText();
  const jCode = ((await ada.getByTestId("share-room").getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
  check("F. Invite shows the room code", inviteText.includes(jCode));
  await ada.getByTestId("invite-close").click();
  const bCtx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const bea = await bCtx.newPage();
  await joinRoom(bea, "Bea", jCode);
  await ada.getByTestId("choose-game").click();
  await ada.getByTestId("select-game-trivia").click();
  await ada.getByTestId("mode-official").click();
  await ada.getByTestId("start-official-trivia").click();
  await passBriefing([ada, bea]);
  for (const p of [ada, bea]) await p.locator(".mz-question").waitFor({ timeout: 20000 });
  await shot(bea, "journey-question-375");
  await answerKitQuestions(ada, { player: "Ada", choose: () => 0 });
  await answerKitQuestions(bea, { player: "Bea", choose: () => 1 });
  const back = ada.getByRole("button", { name: "Back to lobby" }).first();
  check("F. the journey reaches results", await back.waitFor({ timeout: 40000 }).then(() => true, () => false));
  await shot(ada, "journey-results-390");
  await back.click();
  await ada.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  check("F. ...and returns to the lobby at /room", path(ada) === "/room");
  await jCtx.close(); await bCtx.close();
} finally {
  await browser.close();
}
console.log(failures === 0 ? "STAGE 2 ALL PASSED" : `STAGE 2 FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
