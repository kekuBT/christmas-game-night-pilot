// Stage 12.1 (docs/stage12/stage121.md): one path, and the TV as the hero.
//   A. The door: Home's dock is Join + Host with a quieter "Play solo" link; Host asks only for a name (no
//      casual/Cup choice), and says a Family Cup can come later from the room menu. The hosted room is casual.
//   B. The TV lobby: the big code and a QR code of exactly <origin>/join?code=CODE (checked against the same
//      encoder), "Scan with a phone camera", who's here.
//   C. Two casual Math Mayhem games (3 players): the TV's final shows the podium (gold, silver, bronze to the
//      right players, from the server's scores), everyone's standings, and the medal table, which accumulates
//      (2 games, ordered by golds, silvers, bronzes, then name). Full motion stages bronze → silver → gold;
//      reduced motion and Pause show it at once.
//   D. Make it a Family Cup from the host's room menu: same code and players, the host's chip, every guest's
//      notice, the TV follows without reloading (Cup card, Day 1 of 7) and still calls the games before Casual.
//   E. Two official games: the TV's final shows the Cup standings "after this game", with ▲/▼ that match the
//      server's standings before and after (the TV's own memory). A TV opened afterwards shows no arrows.
//   F. The host ends Day 1: the TV shows "Day 1 complete" and the server's own Day 1 winner(s); "Cup standings"
//      shows the Cup podium on Day 2. Nothing private reaches the TV (no seat token in its page).
// Usage: node scripts/check-one-path.mjs <baseUrl>   (the gate passes its server)
import QRCode from "qrcode";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { closeRoomMenu, openRoomMenu } from "./lib/room-nav.mjs";
import { solveMath } from "./lib/math-solve.mjs";
import { PROTOCOL_HEADERS } from "./lib/protocol.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", ...PROTOCOL_HEADERS };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const seatOf = (page) => page.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") }));
const intent = (roomId, seat, gid, action, payload) =>
  api(`/rooms/${roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId: gid, action, payload } } });
const tvProj = (roomId) => api(`/rooms/${roomId}/projection?audience=tv`);
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage121-screenshots/journey-${name.replace(/^after-/, "")}.png`) });

/** A Math Mayhem game over the API: `right[i]` of seat i's questions answered right, the rest wrong; returns its id. */
async function playMath(roomId, seats, right, official) {
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: seats[0].token, body: { gameId: "math-mayhem", official } });
  for (const s of seats) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  for (let t = 0; t < 50; t++) { if ((await tvProj(roomId)).games.find((g) => g.id === gid)?.status === "playing") break; await sleep(200); }
  for (const [i, s] of seats.entries()) {
    const mine = (await api(`/rooms/${roomId}/projection?audience=player`, { token: s.token })).myGames.find((g) => g.id === gid);
    for (const [n, q] of mine.questions.entries()) {
      const o = await intent(roomId, s, gid, "math-open", { questionId: q.id });
      const answer = solveMath(o.result.prompt);
      const idx = o.result.options.findIndex((x) => (n < right[i] ? Number(x) === answer : Number(x) !== answer));
      await intent(roomId, s, gid, "submit-math-answer", { questionId: q.id, chosenIndex: idx });
    }
  }
  return gid;
}
/** Competition ranks by total (the TV's rule), as a map. */
const ranksOf = (champ) => {
  const rows = [...champ].map((r, i) => ({ ...r, i })).sort((a, b) => b.total - a.total || a.i - b.i);
  const out = new Map();
  rows.forEach((r, i) => out.set(r.playerId, i > 0 && rows[i - 1].total === r.total ? out.get(rows[i - 1].playerId) : i + 1));
  return out;
};

const browser = await launchChromium();
try {
  // ---- A. The door ----
  const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostCtx.newPage();
  await host.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await host.getByTestId("home-host").waitFor({ timeout: 15000 });
  const dock = await host.locator(".mz-dock--home").innerText();
  check("A Home: two dock buttons, Join and Host, and a quieter Play solo link", (await host.getByTestId("home-join").isVisible()) && (await host.getByTestId("home-host").isVisible()) && /Just you\?\s*Play solo/.test(await host.getByTestId("home-solo").innerText()), JSON.stringify(dock));
  await shot(host, "after-home-390");
  await host.getByTestId("home-host").click();
  await host.getByPlaceholder("e.g. Auntie June").fill("Keku");
  check("A Host: no casual/Cup choice at the door", (await host.locator('[data-testid^="host-kind"]').count()) === 0);
  check("A Host: one line says a Family Cup can come later, from the room menu", /Family Cup/.test(await host.getByTestId("host-cup-note").innerText()) && /room menu/.test(await host.getByTestId("host-cup-note").innerText()));
  await shot(host, "after-host-390");
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  const chip = host.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  const code = await soon("A the room has a code", async () => { const c = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); return /^[A-Z0-9]{6}$/.test(c) ? c : null; });
  const hostSeat = await seatOf(host);
  // Stage 12.2 (D-S122-03): the Invite sheet tells a TV where to go (it can't scan the QR code).
  await host.getByRole("button", { name: /^Share room code / }).click();
  await host.getByTestId("invite-sheet").waitFor({ timeout: 15000 });
  const tvLine = await host.getByTestId("invite-tv").innerText();
  check("A Invite: 'On the TV: open <host>/tv and type the code'", tvLine.includes(`${new URL(BASE).host}/tv`) && /type the code/.test(tvLine), tvLine);
  await host.getByTestId("invite-close").click();
  await host.getByTestId("invite-sheet").waitFor({ state: "detached", timeout: 15000 });
  const roomId = hostSeat.roomId;
  check("A the hosted room is casual", (await tvProj(roomId)).roomKind === "casual");

  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await guestCtx.newPage();
  await guest.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await guest.getByPlaceholder("e.g. Auntie June").fill("Amina");
  await guest.locator(".mz-code__input").fill(code);
  await guest.getByRole("button", { name: "Join the game" }).click();
  await guest.getByRole("heading", { name: "You’re in, Amina." }).waitFor({ timeout: 15000 });
  const guestSeat = await seatOf(guest);
  const b = await api("/rooms/join-by-code", { body: { joinCode: code, displayName: "Baraka" } });
  const barakaSeat = { roomId, playerId: b.playerId, token: b.recoveryToken };
  const seats = [hostSeat, guestSeat, barakaSeat];

  // ---- B. The TV lobby ----
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(code);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });
  const mode = () => tv.getByTestId("tv-mode").getAttribute("data-mode");
  await soon("B TV lobby: the code, big", async () => (await tv.getByTestId("tv-join-code").innerText()) === code);
  await soon("B TV lobby: a QR code", async () => (await tv.getByTestId("tv-join-qr").locator("img").getAttribute("src"))?.startsWith("data:image/png"));
  // Read the drawn QR's modules back (the centre pixel of each) and compare them with the same encoder's matrix
  // for the expected link: the QR says exactly that link, nothing else.
  const qrWant = QRCode.create(`${BASE}/join?code=${code}`, {});
  const size = qrWant.modules.size;
  const bits = await tv.getByTestId("tv-join-qr").locator("img").evaluate(async (img, n) => {
    await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
    const scale = img.naturalWidth / (n + 2); // margin 1 on each side
    let out = "";
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
      const d = ctx.getImageData(Math.floor((1 + col + 0.5) * scale), Math.floor((1 + r + 0.5) * scale), 1, 1).data;
      out += d[0] < 128 ? "1" : "0";
    }
    return out;
  }, size);
  check("B the QR code encodes exactly <origin>/join?code=CODE (the Invite sheet's link)", bits === Array.from(qrWant.modules.data, (v) => (v ? "1" : "0")).join(""), `${size}×${size}`);
  const roster = await tv.locator(".mz-tvshow-roster").innerText();
  check("B TV lobby: 'Scan with a phone camera', and everyone who's here", /Scan with a phone camera/.test(await tv.locator(".mz-tvshow-join").innerText()) && ["Keku", "Amina", "Baraka"].every((n) => roster.includes(n)), roster);
  check("B no medal table before any game", (await tv.getByTestId("tv-medals").count()) === 0);
  check("B no Cup card in a casual room", (await tv.getByTestId("tv-cup").count()) === 0);
  await shot(tv, "after-tv-lobby-qr-1920");

  // A second TV with reduced motion (the OS setting), for the calm podium.
  const calmCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const calm = await calmCtx.newPage();
  await calm.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await calm.locator(".mz-code__input").fill(code);
  await calm.getByTestId("watch-spectator").click();
  await calm.getByTestId("tv-show").waitFor({ timeout: 15000 });

  // ---- C. Two casual games: podium and medals ----
  const g1 = await playMath(roomId, seats, [10, 5, 1], false);
  await soon("C game 1: the TV shows the final with a podium", async () => (await mode()) === "final" && (await tv.getByTestId("tv-podium").count()) === 1, 30000);
  const scores1 = (await tvProj(roomId)).games.find((g) => g.id === g1).rawScores;
  const order1 = Object.entries(scores1).sort((x, y) => y[1] - x[1]).map(([id]) => id);
  check("C game 1: three different scores (Keku > Amina > Baraka > 0)", scores1[hostSeat.playerId] > scores1[guestSeat.playerId] && scores1[guestSeat.playerId] > scores1[barakaSeat.playerId] && scores1[barakaSeat.playerId] > 0, JSON.stringify(scores1));
  check("C podium: gold, silver and bronze go to the server's first, second and third", (await tv.getByTestId("tv-podium-gold").getAttribute("data-players")) === order1[0] && (await tv.getByTestId("tv-podium-silver").getAttribute("data-players")) === order1[1] && (await tv.getByTestId("tv-podium-bronze").getAttribute("data-players")) === order1[2]);
  const anim = await tv.evaluate(() => ["3", "2", "1"].map((n) => { const el = document.querySelector(`.mz-podium__step--${n}`); const cs = getComputedStyle(el); return { name: cs.animationName, delay: parseFloat(cs.animationDelay) }; }));
  check("C full motion: the podium rises bronze, then silver, then gold", anim.every((a) => a.name === "mz-podium-rise") && anim[0].delay < anim[1].delay && anim[1].delay < anim[2].delay, JSON.stringify(anim));
  check("C the final still shows everyone's standings (3 rows) and the winner line", (await tv.getByTestId("tv-last-standings").locator("li").count()) === 3 && /Keku wins/.test(await tv.getByTestId("tv-winner").innerText()));
  await soon("C reduced motion: the podium is there at once (no animation, fully shown)", async () => {
    if ((await calm.getByTestId("tv-podium").count()) !== 1) return false;
    const s = await calm.evaluate(() => [...document.querySelectorAll(".mz-podium__step")].map((el) => [getComputedStyle(el).animationName, getComputedStyle(el).opacity]));
    return s.length === 3 && s.every(([n, o]) => n === "none" && o === "1");
  });
  await sleep(3400);
  // The podium's place numbers, measured the way check-contrast measures (the first solid background up the tree):
  // at least 3:1 (large text) on every earned step; a step nobody earned shows no number at all.
  const podiumContrast = await tv.evaluate(() => {
    const rgb = (c) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [...document.querySelectorAll(".mz-podium__block")].map((el) => {
      let cur = el, bg = null;
      while (cur && !bg) { const c = getComputedStyle(cur).backgroundColor; if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") bg = c; cur = cur.parentElement; }
      const fg = getComputedStyle(el).color, a = lum(rgb(fg)), b = lum(rgb(bg ?? "rgb(0,0,0)"));
      return { place: el.textContent, empty: !!el.closest(".mz-podium__step--empty"), transparent: fg === "rgba(0, 0, 0, 0)", ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  });
  check("C podium numbers: 3:1 or better on every earned step (a solid base under each gradient)", podiumContrast.filter((x) => !x.empty).every((x) => x.ratio >= 3), JSON.stringify(podiumContrast.map((x) => [x.place, x.empty, x.ratio.toFixed(2)])));
  await shot(tv, "after-tv-final-podium-1920");
  await tv.getByTestId("tv-dir-pause").click();
  check("C Pause animations: the podium shows at once (no staged animation)", (await tv.getByTestId("tv-podium").getAttribute("class")).includes("mz-podium--animate") === false);
  await tv.getByTestId("tv-dir-pause").click();
  check("C the medal table counts game 1", (await tv.getByTestId("tv-medals").getAttribute("data-games")) === "1");

  const g2 = await playMath(roomId, seats, [5, 10, 1], false);
  await soon("C game 2: a new final", async () => (await mode()) === "final" && (await tv.getByTestId("tv-podium-gold").getAttribute("data-players")) === guestSeat.playerId, 30000);
  await soon("C the medal table accumulates: 2 games", async () => (await tv.getByTestId("tv-medals").getAttribute("data-games")) === "2");
  const medalRows = await tv.getByTestId("tv-medals").locator("li[data-player]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-player"), ...[...e.querySelectorAll("[data-medal]")].map((x) => Number(x.textContent))]));
  // Keku 1-1-0, Amina 1-1-0 (tied, so by name: Amina first), Baraka 0-0-2.
  check("C medal table: ordered by golds, silvers, bronzes, then name", JSON.stringify(medalRows) === JSON.stringify([[guestSeat.playerId, 1, 1, 0], [hostSeat.playerId, 1, 1, 0], [barakaSeat.playerId, 0, 0, 2]]), JSON.stringify(medalRows));
  await sleep(3400);
  await shot(tv, "after-tv-final-medals-1920");
  await tv.getByTestId("tv-dir-lobby").click();
  await soon("C TV lobby: the medal table, 2 games tonight", async () => /2 games tonight/i.test(await tv.getByTestId("tv-medals").innerText()));
  await shot(tv, "after-tv-lobby-medals-1920");

  // ---- D. Make it a Family Cup ----
  // The phones are on game 2's results: back to the lobby, as people would.
  for (const p of [host, guest]) {
    const back = p.getByRole("button", { name: "Back to lobby" });
    await back.first().waitFor({ timeout: 15000 }).catch(() => {});
    if (await back.count()) await back.first().click();
  }
  await host.getByRole("button", { name: /^Share room code / }).waitFor({ timeout: 15000 });
  // Stage 12.2 (D-S122-02): after two finished games, the host (never a guest) gets a gentle nudge.
  await soon("D host: after two finished games, a gentle 'Make it a Family Cup' nudge", async () => (await host.getByTestId("cup-nudge").count()) === 1);
  check("D guest: no nudge", (await guest.getByTestId("cup-nudge").count()) === 0);
  await shot(host, "after-host-nudge-390");
  await host.getByTestId("cup-nudge-open").click();
  await host.getByTestId("make-cup-sheet").waitFor({ timeout: 15000 });
  check("D the nudge opens the Make-a-Cup sheet", true);
  await host.getByTestId("make-cup-cancel").click();
  await host.getByTestId("make-cup-sheet").waitFor({ state: "detached", timeout: 15000 });
  await host.getByTestId("cup-nudge-dismiss").click();
  await soon("D 'Not now' hides the nudge", async () => (await host.getByTestId("cup-nudge").count()) === 0);
  await host.reload({ waitUntil: "domcontentloaded" });
  await host.getByRole("button", { name: /^Share room code / }).waitFor({ timeout: 15000 });
  await sleep(800);
  check("D …and it stays hidden after a reload (this device remembers)", (await host.getByTestId("cup-nudge").count()) === 0);
  await openRoomMenu(host);
  await host.getByTestId("menu-make-cup").click();
  await host.getByTestId("make-cup-sheet").waitFor({ timeout: 15000 });
  const sheet = await host.getByTestId("make-cup-points").innerText();
  check("D the sheet says what changes, what stays (the 2 games stay casual) and how to go back", /2 games already played stay casual/.test(sheet) && /Changed your mind\?/.test(sheet) && /go back to a casual game night/.test(sheet), sheet);
  await sleep(800); // the sheet's opening transition
  await shot(host, "after-make-cup-sheet-390");
  await host.getByTestId("make-cup-confirm").click();
  await host.getByTestId("make-cup-sheet").waitFor({ state: "detached", timeout: 15000 });
  await soon("D host: the room is a Family Cup (Cup chip)", async () => (await host.locator(".mz-cupchip").count()) > 0);
  const after = await tvProj(roomId);
  check("D server: a Cup, same code and players, the 2 games kept casual", after.roomKind === "cup" && after.joinCode === code && after.players.length === 3 && JSON.stringify(after.casualGameIds) === JSON.stringify([g1, g2]));
  await soon("D guest: the lobby says the room is now a Family Cup", async () => /This room is now a Family Cup/.test(await guest.getByTestId("cup-started-notice").innerText()), 20000);
  await shot(guest, "after-guest-cup-notice-390");
  if ((await mode()) !== "lobby") await tv.getByTestId("tv-dir-lobby").click();
  await soon("D TV follows without reloading: the Cup card, Day 1 of 7, and no medal table", async () => /Day 1 of 7/i.test(await tv.getByTestId("tv-cup").innerText()) && (await tv.getByTestId("tv-medals").count()) === 0);
  const recent = await tv.getByTestId("tv-recent").innerText();
  check("D TV: the games before the Cup are still called Casual, never Practice", (recent.match(/Casual/g) ?? []).length === 2 && !/Practice/.test(recent), recent);
  await shot(tv, "after-tv-lobby-cup-1920");

  // ---- D2. Back to a casual game night, then a Family Cup again (Stage 12.2, D-S122-01) ----
  await openRoomMenu(host);
  await host.getByTestId("menu-undo-cup").click();
  await host.getByTestId("undo-cup-sheet").waitFor({ timeout: 15000 });
  const undoText = await host.getByTestId("undo-cup-points").innerText();
  check("D2 the undo sheet says what comes back and what stays", /Quick Party/.test(undoText) && /Memory Book/.test(undoText) && /Family Cup again/.test(undoText), undoText);
  await sleep(800);
  await shot(host, "after-undo-cup-sheet-390");
  await host.getByTestId("undo-cup-confirm").click();
  await host.getByTestId("undo-cup-sheet").waitFor({ state: "detached", timeout: 15000 });
  await soon("D2 host: a casual game night again (no Cup chip)", async () => (await host.locator(".mz-cupchip").count()) === 0);
  const undone = await tvProj(roomId);
  check("D2 server: casual, same code and players, cupSince gone, the undo recorded", undone.roomKind === "casual" && undone.joinCode === code && undone.players.length === 3 && !undone.cupSince && undone.cupUndone?.games === 2);
  await soon("D2 guest: told the room is a casual game night again", async () => /casual game night again/i.test(await guest.getByTestId("cup-undone-notice").innerText()), 20000);
  await shot(guest, "after-guest-undone-notice-390");
  await soon("D2 TV follows: the medal table is back and the Cup card is gone", async () => (await tv.getByTestId("tv-medals").count()) === 1 && (await tv.getByTestId("tv-cup").count()) === 0);
  check("D2 no nudge in a room that has been a Cup", (await host.getByTestId("cup-nudge").count()) === 0);
  await openRoomMenu(host);
  await host.getByTestId("menu-make-cup").click();
  await host.getByTestId("make-cup-sheet").waitFor({ timeout: 15000 });
  await host.getByTestId("make-cup-confirm").click();
  await host.getByTestId("make-cup-sheet").waitFor({ state: "detached", timeout: 15000 });
  await soon("D2 …and a Family Cup again from the room menu", async () => (await host.locator(".mz-cupchip").count()) > 0 && (await tvProj(roomId)).roomKind === "cup");

  // ---- E. Official games: Cup standings with movement ----
  await playMath(roomId, seats, [10, 5, 1], true);
  await soon("E official game 1: the final shows the Cup standings after this game", async () => (await mode()) === "final" && /Family Cup · after this game/i.test(await tv.getByTestId("tv-final-cup").innerText()), 30000);
  const champ1 = (await tvProj(roomId)).championship;
  // Stage 12.2 (D-S122-05): one footnote for not-yet-eligible players, never "qualifying" on every row.
  check("E TV: the not-yet-eligible mark has one footnote; no 'qualifying' on the rows", (await tv.getByTestId("tv-cup-footnote").count()) === 1 && !/qualifying/i.test(await tv.getByTestId("tv-final-cup").innerText()));
  // Stage 12.2 (D-S122-01): an official game has finished, so the Cup can't go back any more.
  const refused = await fetch(`${BASE}/rooms/${roomId}/casual`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": hostSeat.token, ...PROTOCOL_HEADERS }, body: "{}" });
  check("E once an official game has finished, going back is refused (409 OFFICIAL_GAME_PLAYED)", refused.status === 409 && (await refused.json()).code === "OFFICIAL_GAME_PLAYED");
  for (const p of [host]) { const back = p.getByRole("button", { name: "Back to lobby" }); await back.first().waitFor({ timeout: 15000 }).catch(() => {}); if (await back.count()) await back.first().click(); }
  await openRoomMenu(host);
  check("E …and the room menu no longer offers it", (await host.getByTestId("menu-undo-cup").count()) === 0);
  await closeRoomMenu(host);
  const moves1 = await tv.getByTestId("tv-final-cup").locator("li").evaluateAll((els) => els.map((e) => e.getAttribute("data-move")));
  check("E the first official game: no arrows (nobody had Cup standings before)", moves1.every((m) => m === ""), JSON.stringify(moves1));
  const g4 = await playMath(roomId, seats, [1, 5, 10], true);
  await soon("E official game 2: a new final", async () => (await mode()) === "final" && (await tv.getByTestId("tv-podium-gold").getAttribute("data-players")) === barakaSeat.playerId, 30000);
  const champ2 = (await tvProj(roomId)).championship;
  const r1 = ranksOf(champ1), r2 = ranksOf(champ2);
  const want = Object.fromEntries(champ2.map((r) => [r.playerId, r1.has(r.playerId) ? String(r1.get(r.playerId) - r2.get(r.playerId)) : ""]));
  const shown = Object.fromEntries(await tv.getByTestId("tv-final-cup").locator("li").evaluateAll((els) => els.map((e) => [e.getAttribute("data-player"), e.getAttribute("data-move")])));
  check("E ▲/▼ match the server's standings before and after this game", JSON.stringify(Object.keys(want).filter((k) => k in shown).map((k) => [k, shown[k]])) === JSON.stringify(Object.keys(want).filter((k) => k in shown).map((k) => [k, want[k]])), `want ${JSON.stringify(want)} shown ${JSON.stringify(shown)} before ${JSON.stringify(champ1.map((r) => [r.playerId, r.total]))} after ${JSON.stringify(champ2.map((r) => [r.playerId, r.total]))}`);
  if (Object.values(want).some((v) => v !== "" && v !== "0")) check("E an arrow is drawn where a rank changed", (await tv.getByTestId("tv-final-cup").locator(".mz-tvlist__move").count()) > 0);
  else console.log("NOTE E the ranks didn't change between the two official games; arrows are 0 by the server's totals");
  await sleep(3400);
  await shot(tv, "after-tv-final-cup-1920");
  const late = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  // Stage 12.2 (D-S122-03): the short TV address with the code in it starts watching at once.
  await late.goto(`${BASE}/tv?code=${code}`, { waitUntil: "domcontentloaded" });
  await soon("E a TV opened afterwards shows the final without arrows (no guessed movement)", async () => (await late.getByTestId("tv-final-cup").count()) === 1 && (await late.getByTestId("tv-final-cup").locator("li").evaluateAll((els) => els.every((e) => e.getAttribute("data-move") === ""))));
  check("E the server's game is the one on screen", (await late.getByTestId("tv-show").getAttribute("data-game")) === "math-mayhem" && !!g4);

  // ---- F. The day's trophy ----
  const ceremony = (await tvProj(roomId)).ceremony;
  check("F the server names a Day 1 winner", ceremony.day === 1 && (ceremony.winners ?? []).length > 0, JSON.stringify(ceremony));
  const day = await api(`/rooms/${roomId}/day`, { token: hostSeat.token, body: {} });
  check("F the host ends Day 1", day.day === 2);
  await soon("F TV: 'Day 1 complete' with the server's Day 1 winner(s)", async () => (await mode()) === "trophy" && (await tv.getByTestId("tv-trophy").getAttribute("data-winners")) === ceremony.winners.join("|") && (await tv.getByTestId("tv-trophy-who").innerText()).includes(ceremony.winners[0]));
  check("F the trophy never crowns a Cup champion", !/champion/i.test(await tv.getByTestId("tv-trophy").innerText()));
  await sleep(1200);
  await shot(tv, "after-tv-trophy-1920");
  await tv.getByTestId("tv-dir-cup").click();
  await soon("F Cup standings: Day 2 of 7, the Cup podium and everyone's totals", async () => (await mode()) === "cup" && (await tv.getByTestId("tv-cup-view").getAttribute("data-day")) === "2" && (await tv.getByTestId("tv-cup-standings").locator("li").count()) === champ2.length);
  const top = Math.max(...champ2.map((r) => r.total));
  const leaders = champ2.filter((r) => r.total === top && top > 0).map((r) => r.playerId).sort();
  const empties = await tv.evaluate(() => [...document.querySelectorAll(".mz-podium__step--empty .mz-podium__block")].map((el) => getComputedStyle(el).color));
  check("F a podium step nobody earned shows no low-contrast number", empties.every((c) => c === "rgba(0, 0, 0, 0)"), JSON.stringify(empties));
  check("F the Cup podium: everyone sharing the top total stands on gold (a shared lead is a real result)", JSON.stringify((await tv.getByTestId("tv-podium-gold").getAttribute("data-players")).split(",").sort()) === JSON.stringify(leaders), JSON.stringify(leaders));
  await sleep(3400);
  await shot(tv, "after-tv-cup-view-1920");
  await tv.getByTestId("tv-dir-lobby").click();
  await soon("F TV lobby: Day 2 of 7", async () => /Day 2 of 7/i.test(await tv.getByTestId("tv-cup").innerText()));
  await soon("F the other TV, open when the day ended, shows the trophy too", async () => (await late.getByTestId("tv-trophy").count()) === 1);
  const fresh = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  // Stage 12.2 (D-S122-03): the short TV address, typed: one code box, one button.
  await fresh.goto(`${BASE}/tv`, { waitUntil: "domcontentloaded" });
  await fresh.getByTestId("tv-entry").waitFor({ timeout: 15000 });
  check("F /tv: one code box and 'Show on this TV' (disabled until the code is complete)", (await fresh.getByTestId("tv-entry-go").isDisabled()) && (await fresh.locator(".mz-code__input").count()) === 1);
  await fresh.screenshot({ path: screenshotPath("docs/stage12/stage122-screenshots/tv-entry-1920.png") });
  await fresh.locator(".mz-code__input").fill(code);
  await fresh.getByTestId("tv-entry-go").click();
  await fresh.getByTestId("tv-show").waitFor({ timeout: 15000 });
  await sleep(1500);
  check("F a TV opened after the day ended shows no trophy (it never saw Day 1 end)", (await fresh.getByTestId("tv-trophy").count()) === 0 && (await fresh.getByTestId("tv-mode").getAttribute("data-mode")) !== "trophy");
  const html = await tv.content();
  check("F nothing private on the TV: no player's seat token in its page", seats.every((s) => !html.includes(s.token)));
  for (const w of [1280, 768]) {
    await tv.setViewportSize({ width: w, height: w === 768 ? 1024 : 720 });
    check(`F TV at ${w}px: no sideways scrolling`, await tv.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1));
  }
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "ONE PATH ALL PASSED" : `ONE PATH: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
