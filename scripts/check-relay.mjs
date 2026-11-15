// Stage 12.9 (docs/stage12/stage129.md): Relay, a team race of sums, on four phones and a TV.
//   A  the night's teams (Coral: Keku and Amina; Sun: Baraka and Wanjiru); Relay starts; the TV shows the lanes
//   B  the runner answers; the teammate sees the same sum and "help out loud"; a right answer passes the baton
//   C  privacy: once Coral is a leg ahead, Sun's phones and the TV never show Coral's sum
//   D  a wrong answer freezes the runner and greys the option out; after the freeze the right answer still counts.
//      Stage 12.15-R (D-S1215R-04): the TV's lane says "(frozen)" during the freeze and stops when it ends, with no
//      other answer (it used to stay frozen until the next answer)
//   E  a runner who doesn't answer in 20 s is passed over on the same sum
//   F  the rest of the race over the API; results: the team results card on phones, the winning team on the TV; 320 px
// Usage: node scripts/check-relay.mjs <baseUrl>   (the gate passes its server)
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
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
async function until(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* retry */ } await sleep(200); }
  return null;
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
const myGame = async (roomId, seat, gid) => (await api(`/rooms/${roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid);
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage129-screenshots/${name}.png`) });
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const rightIndex = (st) => st.options.findIndex((o) => Number(o) === solveMath(st.prompt));

async function hostRoom(page, name) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game", exact: true }).click();
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
const phone = (width = 390) => browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" }).then((c) => c.newPage());
const tvPage = async (code) => { const p = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })).newPage(); await p.goto(`${BASE}/tv?code=${code}`, { waitUntil: "domcontentloaded" }); await p.getByTestId("tv-show").waitFor({ timeout: 20000 }); return p; };

const browser = await launchChromium();
try {
  // ---- A ----
  const host = await phone();
  const code = await hostRoom(host, "Keku");
  const amina = await phone(), baraka = await phone(), wanjiru = await phone(320);
  await join(amina, "Amina", code); await join(baraka, "Baraka", code); await join(wanjiru, "Wanjiru", code);
  const tv = await tvPage(code);
  const [k, a, b, w] = [await seatOf(host), await seatOf(amina), await seatOf(baraka), await seatOf(wanjiru)];
  const roomId = k.roomId;
  const pageOf = { [k.playerId]: host, [a.playerId]: amina, [b.playerId]: baraka, [w.playerId]: wanjiru };
  const seatById = { [k.playerId]: k, [a.playerId]: a, [b.playerId]: b, [w.playerId]: w };
  await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "make", count: 2 } });
  for (const [s, team] of [[k, "team-coral"], [a, "team-coral"], [b, "team-sun"], [w, "team-sun"]]) await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "move", playerId: s.playerId, teamId: team } });
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: k.token, body: { gameId: "relay", official: false } });
  await soon("A the briefing names the teams", async () => /Team Coral/.test(await amina.getByTestId("briefing-my-team").innerText()));
  await sleep(400);
  await shot(amina, "briefing-390");
  for (const s of [k, a, b, w]) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  await soon("A the TV shows a lane per team", async () => (await tv.getByTestId("tv-rl-lanes-team-coral").count()) === 1 && (await tv.getByTestId("tv-rl-lanes-team-sun").count()) === 1);
  const lane = async (teamId) => (await tvProj(roomId)).games.find((g) => g.id === gid).state.lanes.find((l) => l.teamId === teamId);

  // ---- B ----
  const coral0 = await lane("team-coral");
  const runner = pageOf[coral0.runnerId], mate = coral0.runnerId === k.playerId ? amina : host;
  await soon("B the runner's phone says it's their leg", async () => (await runner.getByTestId("mz-rl-run").count()) === 1);
  await soon("B the teammate sees the same sum and is told to help", async () => (await mate.getByTestId("mz-rl-prompt").innerText()) === (await runner.getByTestId("mz-rl-prompt").innerText()) && /out loud/.test(await mate.getByTestId("mz-rl-status").innerText()));
  await shot(runner, "run-390");
  await shot(mate, "cheer-390");
  await shot(tv, "tv-race-1920");
  // The runner's leg line counts the turn down, never above the 20 s turn (the phone's clock can trail the server's).
  await soon("B the runner's leg line: leg 1 of 12, the baton passes in at most 20 s", async () => { const m = /Leg 1 of 12 · baton passes in (\d+) s/i.exec(await runner.locator(".mz-mr-round").innerText()); return !!m && Number(m[1]) >= 1 && Number(m[1]) <= 20; });
  const st0 = (await myGame(roomId, seatById[coral0.runnerId], gid)).state;
  await runner.getByTestId(`mz-rl-option-${rightIndex(st0)}`).click();
  await soon("B a right answer passes the baton (Coral leg 1, the other runner)", async () => { const l = await lane("team-coral"); return l.legs === 1 && l.runnerId !== coral0.runnerId; });

  // ---- C ----
  const coralSum1 = (await myGame(roomId, seatById[coral0.runnerId], gid)).state.prompt;
  const sunLane = await lane("team-sun");
  check("C Sun is still on leg 0", sunLane.legs === 0);
  for (const p of [baraka, wanjiru]) {
    const text = await p.locator("main").innerText();
    check(`C ${p === baraka ? "Baraka" : "Wanjiru"}'s phone never shows Coral's next sum`, !text.includes(coralSum1), coralSum1);
  }
  const tvJson = JSON.stringify((await tvProj(roomId)).games.find((g) => g.id === gid));
  check("C the TV's data has no sum, option or answer", !/"prompt"|"options"|"correctIndex"/.test(tvJson));

  // ---- D ----
  const coral1 = await lane("team-coral");
  const runner2 = pageOf[coral1.runnerId];
  const st1 = (await myGame(roomId, seatById[coral1.runnerId], gid)).state;
  const wrong = (rightIndex(st1) + 1) % 4;
  await runner2.getByTestId(`mz-rl-option-${wrong}`).click();
  // The first local run showed "Frozen: 4" for a 3 s freeze (rounding up a clock estimate a few ms behind); never above 3.
  await soon("D a wrong answer freezes the runner, counting down from at most 3", async () => { const m = /Frozen: (\d+)/.exec(await runner2.getByTestId("mz-rl-frozen").innerText()); return !!m && Number(m[1]) >= 1 && Number(m[1]) <= 3; });
  check("D the wrong option is greyed out", await runner2.getByTestId(`mz-rl-option-${wrong}`).isDisabled());
  await shot(runner2, "frozen-390");
  await soon("D (12.15-R) the TV's lane says the runner is frozen", async () => /\(frozen\)/.test(await tv.getByTestId("tv-rl-lanes-team-coral").innerText()), 3000);
  await soon("D the freeze ends", async () => (await runner2.getByTestId("mz-rl-frozen").count()) === 0, 8000);
  await soon("D (12.15-R) the TV's lane stops saying frozen when the freeze ends, with no other answer", async () =>
    !/\(frozen\)/.test(await tv.getByTestId("tv-rl-lanes-team-coral").innerText()) && (await lane("team-coral")).frozen === false && (await lane("team-coral")).legs === 1, 3000);
  await runner2.getByTestId(`mz-rl-option-${rightIndex(st1)}`).click();
  await soon("D after the freeze, the right answer passes the baton", async () => (await lane("team-coral")).legs === 2);

  // ---- E ----
  const sunBefore = await lane("team-sun");
  await soon("E a Sun runner who doesn't answer in 20 s is passed over on the same sum", async () => { const l = await lane("team-sun"); return l.legs === 0 && l.runnerId !== sunBefore.runnerId; }, 26000);
  // The race's 4-minute clock has been running all along (every screenshot above was taken in its first seconds).
  await soon("E the game clock counts down: under 3:45 left after the pass", async () => { const m = /^(\d+):(\d\d)$/.exec((await runner2.getByTestId("mz-game-clock-left").innerText()).trim()); return !!m && Number(m[1]) * 60 + Number(m[2]) < 225; });

  // ---- F ----
  for (let i = 0; i < 60; i++) {
    const g = (await tvProj(roomId)).games.find((x) => x.id === gid);
    if (g.status !== "playing") break;
    // Coral first, then Sun: Coral comes home first.
    for (const l of [...g.state.lanes].sort((x) => (x.teamId === "team-coral" ? -1 : 1))) {
      if (l.finished || !l.runnerId) continue;
      const st = (await myGame(roomId, seatById[l.runnerId], gid)).state;
      if (!st?.prompt) continue;
      await intent(roomId, seatById[l.runnerId], gid, "relay-answer", { leg: st.myLeg, choice: rightIndex(st) });
      if (l.teamId === "team-coral") break;
    }
  }
  const fin = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === gid); return g?.status === "finished" ? g : null; }, 40000);
  check("F the race finished with Coral home first", fin?.state?.finishOrder?.[0] === "team-coral", JSON.stringify(fin?.state?.finishOrder));
  check("F every player scored their team's points", !!fin && fin.rawScores[k.playerId] === fin.rawScores[a.playerId] && fin.rawScores[b.playerId] === fin.rawScores[w.playerId] && fin.rawScores[k.playerId] > fin.rawScores[b.playerId], JSON.stringify(fin?.rawScores));
  await soon("F phones: the results with the team results card and a team-led heading", async () => (await amina.getByTestId("mz-rl-results").count()) === 1 && (await amina.getByTestId("team-results").count()) === 1 && /Team Coral wins Relay/.test(await amina.getByTestId("results-headline").innerText()));
  await soon("F the TV leads with the winning team", async () => (await tv.getByTestId("tv-team-results").count()) === 1 && /Team Coral wins/.test(await tv.getByTestId("tv-winner").innerText()));
  // A game built for teams shows each team's points, not an average (everyone on a team scores the team's points).
  await soon("F the team results show points, not an average (phone and TV)", async () => {
    const card = await amina.getByTestId("team-results").innerText(), tvCard = await tv.getByTestId("tv-team-results").innerText();
    return /A team game/i.test(card) && /pts/.test(card) && !/average/i.test(card) && /each team’s points/i.test(tvCard) && !/average/i.test(tvCard);
  });
  await sleep(600);
  await shot(amina, "results-390");
  await shot(tv, "tv-final-1920");
  check("F 320 px: the results have no sideways scroll", await noSideScroll(wanjiru));
  await shot(wanjiru, "results-320");
} catch (e) {
  check("driver ran without throwing", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
if (failures) { console.log(`check-relay: ${failures} failed`); process.exit(1); }
console.log("check-relay: all passed");
