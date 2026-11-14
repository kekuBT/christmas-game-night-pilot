// Stage 12.6 (docs/stage12/stage126.md): the night card, a picture of the night to share.
//   A  before any game finishes there's nothing to share (no menu row); after two games, the host's and a guest's menus
//      offer it; the sheet shows the picture (1080×1350) and lists the same facts in words
//   B  the facts: title, date, games and players, the medal table, each game's result; never the room code
//   C  saving: a PNG named for the night and the date (no room code), 1080×1350, painted in this phone's look
//   D  sharing: on a phone that can share pictures (a stubbed Web Share), the picture goes to the share sheet; closing
//      the sheet isn't an error; a share that fails says so and points to Save
//   E  the Christmas look: the same facts, the Christmas title and an ivory ground
//   F  after "End the night", the lobby notice offers the card too
//   G  a Family Cup's card: its day, standings and points instead of medals
//   H  layout: the sheet at 320 px has no sideways scroll
// Usage: node scripts/check-night-card.mjs <baseUrl>   (the gate passes its server)
import { readFileSync } from "node:fs";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { hostFamilyCup, openRoomMenu } from "./lib/room-nav.mjs";
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
  if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const seatOf = (page) => page.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") }));
const intent = (roomId, seat, gid, action, payload) =>
  api(`/rooms/${roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId: gid, action, payload } } });
const tvProj = (roomId) => api(`/rooms/${roomId}/projection?audience=tv`);
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage126-screenshots/${name}.png`) });

/** A Math Mayhem game over the API: `right[i]` of seat i's answers right. */
async function playMath(roomId, seats, right, official = false) {
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
  for (let t = 0; t < 50; t++) { if ((await tvProj(roomId)).games.find((g) => g.id === gid)?.status === "finished") break; await sleep(200); }
  return gid;
}
async function hostRoom(page, name, cup = false) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  if (cup) await hostFamilyCup(page);
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
async function backToLobby(pages) {
  for (const p of pages) {
    const back = p.getByRole("button", { name: "Back to lobby" });
    await back.first().waitFor({ timeout: 20000 }).catch(() => {});
    if (await back.count()) await back.first().click();
  }
}
/**
 * A phone. `share`: "none" (no Web Share, like this headless browser), "ok" (shares and records the files), "abort"
 * (the person closes the share sheet) or "fail" (the share fails).
 */
async function phone({ width = 390, look = "everyday", share = "none" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, acceptDownloads: true, reducedMotion: "reduce" });
  await ctx.addInitScript(({ look, share }) => {
    try { localStorage.setItem("mz_look", look); } catch { /* none */ }
    window.__shared = [];
    if (share !== "none") {
      navigator.canShare = (d) => Array.isArray(d?.files) && d.files.length > 0;
      navigator.share = async (d) => {
        window.__shared.push({ title: d.title, files: (d.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })) });
        if (share === "abort") throw new DOMException("closed", "AbortError");
        if (share === "fail") throw new DOMException("nope", "NotAllowedError");
      };
    }
  }, { look, share });
  return ctx.newPage();
}
/** The picture's size and the colour at a point, read from the image the sheet shows. */
const pictureFacts = (page) => page.evaluate(async () => {
  const img = document.querySelector('[data-testid="night-card-image"]');
  if (!img) return null;
  await img.decode().catch(() => {});
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const px = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3);
  return { w: img.naturalWidth, h: img.naturalHeight, ground: px(40, 600), band: px(540, 6), alt: img.alt };
});
const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
async function openCard(page) {
  await openRoomMenu(page);
  await page.getByTestId("menu-night-card").click();
  await page.getByTestId("night-card-sheet").waitFor({ timeout: 10000 });
  await page.getByTestId("night-card-image").waitFor({ timeout: 10000 });
}

const browser = await launchChromium();
try {
  // ---- A. Nothing to share until a game finishes ----
  const host = await phone();
  const code = await hostRoom(host, "Keku");
  const amina = await phone({ share: "ok" });
  await join(amina, "Amina", code);
  const baraka = await phone({ look: "christmas", share: "abort" });
  await join(baraka, "Baraka", code);
  const [hostSeat, aminaSeat, barakaSeat] = [await seatOf(host), await seatOf(amina), await seatOf(baraka)];
  const roomId = hostSeat.roomId;
  await openRoomMenu(host);
  check("A before any game, the menu has no night card", (await host.getByTestId("menu-night-card").count()) === 0);
  await host.keyboard.press("Escape");
  await playMath(roomId, [hostSeat, aminaSeat, barakaSeat], [10, 5, 2]);
  await backToLobby([host, amina, baraka]);
  await playMath(roomId, [hostSeat, aminaSeat, barakaSeat], [3, 8, 1]);
  await backToLobby([host, amina, baraka]);
  await sleep(500);

  // ---- B. The facts ----
  await openCard(host);
  const text = await host.getByTestId("night-card-text").textContent();
  check("B the card's title, and its games and players", /^Our game night\n/.test(text) && /\n2 games · 3 players\n/.test(text), JSON.stringify(text));
  check("B the date the card was made", text.split("\n")[1] === new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), text.split("\n")[1]);
  check("B the medal table: Keku and Amina a gold and a silver each, Baraka two bronzes", /Medals: (Keku 🥇🥈, Amina 🥇🥈|Amina 🥇🥈, Keku 🥇🥈), Baraka 🥉🥉/.test(text), JSON.stringify(text));
  check("B each game's result, oldest first", /Math Mayhem: Keku wins\nMath Mayhem: Amina wins/.test(text), JSON.stringify(text));
  check("B never the room code", !text.includes(code) && !(await host.getByTestId("night-card-image").getAttribute("alt")).includes(code));
  const pic = await pictureFacts(host);
  check("B the picture is 1080×1350, and its description is the same facts", pic?.w === 1080 && pic?.h === 1350 && pic.alt.startsWith("Our game night. "), JSON.stringify(pic && { w: pic.w, h: pic.h }));
  check("C the Everyday picture: the Everyday ground and the coral band", hex(pic.ground) === "#16111D" && hex(pic.band) === "#FF6B4A", `${hex(pic.ground)} ${hex(pic.band)}`);
  await shot(host, "sheet-everyday-390");

  // ---- C. Saving (this browser can't share pictures, so Save is the way) ----
  check("C without Web Share, there's no Share button, only Save", (await host.getByTestId("night-card-share").count()) === 0 && await host.getByTestId("night-card-save").isEnabled());
  const [download] = await Promise.all([host.waitForEvent("download"), host.getByTestId("night-card-save").click()]);
  const name = download.suggestedFilename();
  check("C the file is named for the night and the date, never the room code", /^mchezo-game-night-\d{4}-\d{2}-\d{2}\.png$/.test(name) && !name.includes(code), name);
  const file = readFileSync(await download.path());
  check("C it's a PNG of 1080×1350", file.subarray(1, 4).toString() === "PNG" && file.readUInt32BE(16) === 1080 && file.readUInt32BE(20) === 1350, `${file.length} bytes`);
  await soon("C the sheet says where it went", async () => /Saved: mchezo-game-night-/.test(await host.getByTestId("night-card-status").innerText()));
  await host.getByTestId("night-card-close").click();

  // ---- D. Sharing ----
  await openCard(amina);
  await soon("D a phone that can share pictures gets Share…", async () => (await amina.getByTestId("night-card-share").count()) === 1);
  await amina.getByTestId("night-card-share").click();
  await soon("D the share sheet got the picture: one PNG with the night's name", async () => {
    const s = await amina.evaluate(() => window.__shared);
    return s.length === 1 && s[0].files.length === 1 && s[0].files[0].type === "image/png" && /^mchezo-game-night-/.test(s[0].files[0].name) && s[0].files[0].size > 20000 && s[0].title === "Our game night";
  });
  await soon("D …and the sheet says so", async () => (await amina.getByTestId("night-card-status").innerText()) === "Shared.");
  await shot(amina, "sheet-shared-390");
  await amina.getByTestId("night-card-close").click();

  // ---- E. The Christmas look (Baraka), whose share sheet he closes ----
  await openCard(baraka);
  const xmasText = await baraka.getByTestId("night-card-text").textContent();
  check("E the Christmas look's title; every other fact is the same", xmasText.split("\n")[0] === "Our Christmas game night" && xmasText.split("\n").slice(1).join("\n") === text.split("\n").slice(1).join("\n"), JSON.stringify(xmasText));
  const xpic = await pictureFacts(baraka);
  check("E the Christmas picture: the ivory ground and the cranberry band", hex(xpic.ground) === "#F7F1E6" && hex(xpic.band) === "#A3253A", `${hex(xpic.ground)} ${hex(xpic.band)}`);
  await baraka.getByTestId("night-card-share").click();
  await sleep(500);
  check("E closing the share sheet isn't an error", (await baraka.getByTestId("night-card-status").count()) === 0 && (await baraka.evaluate(() => window.__shared.length)) === 1);
  await shot(baraka, "sheet-christmas-390");
  await baraka.getByTestId("night-card-close").click();

  // ---- H. 320 px ----
  const narrow = await phone({ width: 320, share: "fail" });
  await join(narrow, "Wanjiru", code);
  await openCard(narrow);
  check("H the sheet fits 320 px (no sideways scroll)", await narrow.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await narrow.getByTestId("night-card-share").click();
  await soon("D a share that fails says so, and points to Save", async () => /Save the picture instead/.test(await narrow.getByTestId("night-card-status").innerText()));
  await shot(narrow, "sheet-share-failed-320");

  // ---- F. After "End the night" ----
  await api(`/rooms/${roomId}/night`, { token: hostSeat.token, body: {} });
  await soon("F the lobby's 'That's the night!' offers the card", async () => (await amina.getByTestId("night-card-open").count()) === 1);
  await amina.getByTestId("night-card-open").click();
  await soon("F …and opens it", async () => (await amina.getByTestId("night-card-sheet").count()) === 1);
  await shot(amina, "lobby-night-complete-390");
  await amina.getByTestId("night-card-close").click();

  // ---- G. A Family Cup's card ----
  const cupHost = await phone();
  const cupCode = await hostRoom(cupHost, "Keku", true);
  const cupGuest = await phone();
  await join(cupGuest, "Amina", cupCode);
  const [ch, cg] = [await seatOf(cupHost), await seatOf(cupGuest)];
  await playMath(ch.roomId, [ch, cg], [10, 4], true);
  await backToLobby([cupHost, cupGuest]);
  await sleep(500);
  await openCard(cupHost);
  const cupText = await cupHost.getByTestId("night-card-text").textContent();
  check("G a Family Cup's card: its title and day", cupText.startsWith("Our Family Cup\n") && /· Day 1 of 7\n/.test(cupText), JSON.stringify(cupText));
  check("G its standings, with points, instead of medals", /Standings: Keku \d+, Amina \d+/.test(cupText) && !/Medals:/.test(cupText), JSON.stringify(cupText));
  await shot(cupHost, "sheet-cup-390");
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "check-night-card: all checks passed" : `check-night-card: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
