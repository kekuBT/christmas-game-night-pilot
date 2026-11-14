// Stage 12.4 (docs/stage12/stage124.md): the TV's big moments.
//   A  a Family Cup taken to Day 7 (three official games, so both players are eligible); the host's room menu offers
//      "Finish the Family Cup" only then; the sheet previews the champion and says the rules are a try-out
//   B  finishing: the guest's lobby and the TV crown the champion; a TV opened later shows it too; official games are
//      refused afterwards; TV sound (off by default) chimes once for the moment after the director turned it on
//   C  a casual night: Math Mayhem results with no TV show the full standings; with a TV watching, the phone steps back
//      (one tap brings them back); "End the night" puts the recap on the TV; the next game clears it
// Usage: node scripts/check-tv-moments.mjs <baseUrl>   (the gate passes its server)
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
async function call(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", ...PROTOCOL_HEADERS };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function api(path, opts) { const r = await call(path, opts); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; }
const seatOf = (page) => page.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") }));
const intent = (roomId, seat, gid, action, payload) =>
  api(`/rooms/${roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId: gid, action, payload } } });
const tvProj = (roomId) => api(`/rooms/${roomId}/projection?audience=tv`);
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage124-screenshots/${name}.png`) });

/** A Math Mayhem game over the API: `right[i]` of seat i's questions answered right, the rest wrong; returns its id. */
async function playMath(roomId, seats, right, official, beforeAnswers) {
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: seats[0].token, body: { gameId: "math-mayhem", official } });
  for (const s of seats) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  for (let t = 0; t < 50; t++) { if ((await tvProj(roomId)).games.find((g) => g.id === gid)?.status === "playing") break; await sleep(200); }
  // A real game lasts minutes and the TV sees it live; the API answers in a second, so wait for the TV when asked.
  if (beforeAnswers) await beforeAnswers();
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
async function hostRoom(page, name, cup) {
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
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 } }).then((c) => c.newPage());
const tvPage = async (code) => { const p = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); await p.goto(`${BASE}/tv?code=${code}`, { waitUntil: "domcontentloaded" }); await p.getByTestId("tv-show").waitFor({ timeout: 20000 }); return p; };

const browser = await launchChromium();
try {
  // ---- A. A Family Cup on Day 7 ----
  const host = await phone();
  const code = await hostRoom(host, "Keku", true);
  const guest = await phone();
  await join(guest, "Amina", code);
  const tv = await tvPage(code);
  const hostSeat = await seatOf(host);
  const guestSeat = await seatOf(guest);
  const roomId = hostSeat.roomId;
  check("A TV sound is off by default", (await tv.getByTestId("tv-dir-sound").getAttribute("aria-pressed")) === "false");
  for (let d = 1; d <= 3; d++) {
    await playMath(roomId, [hostSeat, guestSeat], [10, 2], true);
    await backToLobby([host, guest]);
    await openRoomMenu(host);
    check(`A Day ${d}: the room menu doesn't offer Finish before Day 7`, (await host.getByTestId("menu-finish-cup").count()) === 0);
    await host.keyboard.press("Escape");
    await api(`/rooms/${roomId}/day`, { token: hostSeat.token, body: {} });
  }
  for (let d = 4; d < 7; d++) await api(`/rooms/${roomId}/day`, { token: hostSeat.token, body: {} });
  const early = (await tvProj(roomId)).championshipDay;
  check("A the Cup is on Day 7, both players eligible", early === 7 && (await tvProj(roomId)).championship.every((r) => r.eligible), JSON.stringify((await tvProj(roomId)).championship));
  await sleep(800);
  await openRoomMenu(host);
  await host.getByTestId("menu-finish-cup").click();
  await host.getByTestId("finish-cup-sheet").waitFor({ timeout: 10000 });
  const preview = await host.getByTestId("finish-cup-preview").innerText();
  const points = await host.getByTestId("finish-cup-points").innerText();
  check("A the sheet previews the champion and says the rules are a try-out", /Keku is on top right now/.test(preview) && /provisional/.test(points), `${preview} | ${points}`);
  await sleep(500);
  await shot(host, "finish-cup-sheet-390");

  // ---- B. Finishing ----
  await tv.getByTestId("tv-dir-sound").click();
  check("B the director turns the TV sound on (a confirming chime)", (await tv.getByTestId("tv-dir-sound").getAttribute("aria-pressed")) === "true");
  await sleep(300);
  const playsBefore = Number(await tv.getByTestId("tv-dir-sound").getAttribute("data-plays"));
  check("B the director's press played a confirming chime", playsBefore === 1, String(playsBefore));
  await host.getByTestId("finish-cup-confirm").click();
  await host.getByTestId("finish-cup-sheet").waitFor({ state: "detached", timeout: 10000 });
  await soon("B guest lobby: the Family Cup is complete, with its champion", async () => /Champion: Keku/.test(await guest.getByTestId("cup-finished-notice").innerText()), 20000);
  await soon("B TV: the champion moment", async () => (await tv.getByTestId("tv-champion").getAttribute("data-champions")) === "Keku" && /Keku is the Family Cup champion/.test(await tv.getByTestId("tv-champion-who").innerText()), 20000);
  const plays = async () => Number(await tv.getByTestId("tv-dir-sound").getAttribute("data-plays"));
  await soon("B TV sound: one fanfare for the moment", async () => (await plays()) === playsBefore + 1);
  await sleep(1500);
  check("B …and only one", (await plays()) === playsBefore + 1, JSON.stringify({ playsBefore, now: await plays(), mode: await tv.getByTestId("tv-show").getAttribute("data-mode") }));
  check("B TV: under the moment, only the moment's button is pressed, and the director's row is one line", (await tv.getByTestId("tv-dir-final").getAttribute("aria-pressed")) === "false" && (await tv.getByTestId("tv-dir-moment").getAttribute("aria-pressed")) === "true"
    && await tv.locator(".mz-tvshow-director").evaluate((n) => new Set([...n.children].map((c) => Math.round(c.getBoundingClientRect().top))).size === 1));
  await shot(tv, "tv-champion-1920");
  await shot(guest, "guest-cup-finished-390");
  const late = await tvPage(code);
  await soon("B a TV opened later shows the champion too (it's the server's record)", async () => (await late.getByTestId("tv-champion").count()) === 1);
  check("B a TV opened later has its sound off (remembered per TV, and this one never chose)", (await late.getByTestId("tv-dir-sound").getAttribute("aria-pressed")) === "false");
  const refused = await call(`/rooms/${roomId}/games`, { token: hostSeat.token, body: { gameId: "math-mayhem", official: true } });
  check("B after finishing, an official game is refused (CUP_FINISHED)", refused.status === 409 && refused.body.code === "CUP_FINISHED", JSON.stringify(refused.body));
  check("B the server: one cup-finished record with the try-out rules", (await tvProj(roomId)).cupFinished?.rules === "provisional-1");
  for (const p of [host, guest, tv, late]) await p.context().close();

  // ---- C. A casual night ----
  const h2 = await phone();
  const code2 = await hostRoom(h2, "Ama", false);
  const g2 = await phone();
  await join(g2, "Baraka", code2);
  const s1 = await seatOf(h2);
  const s2 = await seatOf(g2);
  await playMath(s1.roomId, [s1, s2], [8, 3], false);
  await g2.getByTestId("casual-results").waitFor({ timeout: 20000 });
  check("C no TV: the phone shows the full standings", (await g2.getByTestId("phone-tv-note").count()) === 0 && /Final standings/i.test(await g2.getByTestId("casual-results").innerText()));
  await backToLobby([h2, g2]);
  const tv2 = await tvPage(code2);
  await soon("C the room sees the TV", async () => ((await tvProj(s1.roomId)).spectatorCount ?? 0) >= 1);
  await tv2.getByTestId("tv-dir-sound").click();
  const plays2 = async () => Number(await tv2.getByTestId("tv-dir-sound").getAttribute("data-plays"));
  await sleep(600);
  check("C the second TV's director turns sound on (one confirming chime)", (await plays2()) === 1, String(await plays2()));
  await playMath(s1.roomId, [s1, s2], [3, 8], false, () => soon("C the TV shows the game live", async () => (await tv2.getByTestId("tv-show").getAttribute("data-mode")) === "live", 20000));
  await g2.getByTestId("casual-results").waitFor({ timeout: 20000 });
  await soon("C with a TV watching, the phone steps back on Math Mayhem", async () => (await g2.getByTestId("phone-tv-note").count()) === 1 && !/Final standings/i.test(await g2.getByTestId("casual-results").innerText()));
  check("C …and still says what's next", (await g2.getByTestId("whats-next").count()) === 1);
  await sleep(800);
  await shot(g2, "phone-steps-back-390");
  await soon("C TV sound: the game this TV watched chimes once when its standings appear", async () => (await plays2()) === 2);
  await g2.getByTestId("phone-full-results").click();
  check("C one tap brings the standings back", /Final standings/i.test(await g2.getByTestId("casual-results").innerText()) && (await g2.getByTestId("phone-tv-note").count()) === 0);
  await backToLobby([h2, g2]);
  await openRoomMenu(h2);
  await h2.getByTestId("menu-end-night").click();
  await h2.getByTestId("end-night-sheet").waitFor({ timeout: 10000 });
  await h2.getByTestId("end-night-confirm").click();
  await h2.getByTestId("end-night-sheet").waitFor({ state: "detached", timeout: 10000 });
  await soon("C TV: that's the night, with 2 games and the medals", async () => (await tv2.getByTestId("tv-night").getAttribute("data-games")) === "2" && (await tv2.getByTestId("tv-medals").count()) === 1, 20000);
  await soon("C guest lobby: that's the night", async () => (await g2.getByTestId("night-complete-notice").count()) === 1);
  await soon("C TV sound: one fanfare for the night's recap", async () => (await plays2()) === 3);
  await sleep(1200);
  check("C …and nothing more", (await plays2()) === 3, String(await plays2()));
  await shot(tv2, "tv-night-1920");
  await shot(g2, "guest-night-complete-390");
  await api(`/rooms/${s1.roomId}/games`, { token: s1.token, body: { gameId: "math-mayhem", official: false } });
  await soon("C the next game carries the night on: the recap and the notice are gone", async () => (await tv2.getByTestId("tv-night").count()) === 0 && !(await tvProj(s1.roomId)).nightComplete, 20000);
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "TV MOMENTS ALL PASSED" : `TV MOMENTS: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
