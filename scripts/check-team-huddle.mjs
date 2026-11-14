// Stage 12.8 (docs/stage12/stage128.md): games built for teams, on four phones and a TV.
//   A  the night's teams (Coral: Keku and Amina; Sun: Baraka and Wanjiru); the briefing names them; Team Huddle starts
//   B  a pick shows on the picker's teammate's phone, never on the other team's phones or the TV
//   C  a team that disagrees is told so; once every team agrees, the answer comes early (phones and TV)
//   D  the rest of the game; results: the team results card on phones, the winning team on the TV
//   E  320 px: the pick screen and the results have no sideways scroll
//   F  Charades with three teams: the teams' names on phones and the TV, equal turns, team results
// Usage: node scripts/check-team-huddle.mjs <baseUrl>   (the gate passes its server)
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
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
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage128-screenshots/${name}.png`) });
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

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
async function backToLobby(pages) {
  for (const p of pages) {
    const back = p.getByRole("button", { name: "Back to lobby" });
    await back.first().waitFor({ timeout: 20000 }).catch(() => {});
    if (await back.count()) await back.first().click();
  }
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
  await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "make", count: 2 } });
  for (const [s, team] of [[k, "team-coral"], [a, "team-coral"], [b, "team-sun"], [w, "team-sun"]]) await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "move", playerId: s.playerId, teamId: team } });
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: k.token, body: { gameId: "team-huddle", official: false } });
  await soon("A the briefing names the teams and says which one you're on", async () => /Team Coral/.test(await amina.getByTestId("briefing-my-team").innerText()) && /Baraka, Wanjiru|Wanjiru, Baraka/.test(await amina.getByTestId("briefing-team-team-sun").innerText()));
  await soon("A the TV briefing lists the teams", async () => (await tv.getByTestId("briefing-teams").count()) === 1);
  await shot(amina, "briefing-teams-390");
  for (const s of [k, a, b, w]) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  await soon("A Team Huddle is on every phone, with your team named", async () => /Team Coral/.test(await amina.getByTestId("mz-hd-myteam").innerText()) && /Team Sun/.test(await baraka.getByTestId("mz-hd-myteam").innerText()));
  const g0 = (await tvProj(roomId)).games.find((g) => g.id === gid);
  check("A the game copied the night's teams", JSON.stringify(g0.teams.members) === JSON.stringify({ [k.playerId]: "team-coral", [a.playerId]: "team-coral", [b.playerId]: "team-sun", [w.playerId]: "team-sun" }), JSON.stringify(g0.teams.members));
  await soon("A the TV shows the question and each team's progress", async () => (await tv.getByTestId("tv-hd-prompt").count()) === 1 && (await tv.getByTestId("tv-hd-progress-team-coral").count()) === 1);

  // ---- B ----
  await host.getByTestId("mz-hd-option-2").click();
  // The tags are set in capitals by CSS, so names are matched case-insensitively.
  await soon("B Keku's pick shows on Amina's phone (same team)", async () => /keku/i.test(await amina.getByTestId("mz-hd-picks-2").innerText()));
  await soon("B Amina is told she's waiting on herself: pick an answer", async () => /Pick an answer/.test(await amina.getByTestId("mz-hd-status").innerText()));
  check("B Baraka's phone (the other team) never names Keku's pick", !(/keku/i.test(await baraka.getByTestId("mz-hd-pick").innerText())));
  const tvText = await tv.getByTestId("tv-live-team-huddle").innerText();
  check("B the TV says 1 of 2 picked for Team Coral, and no names", /1 of 2 picked/.test(tvText) && !/Keku/.test(tvText), tvText.replace(/\n/g, " | ").slice(0, 200));
  const tvJson = JSON.stringify((await tvProj(roomId)).games.find((g) => g.id === gid));
  check("B the TV's data has no picks at all", !/"choice"|"teammates"|"picks"|"correctIndex"/.test(tvJson));
  await shot(amina, "pick-teammate-390");
  await shot(tv, "tv-pick-1920");

  // ---- C ----
  await amina.getByTestId("mz-hd-option-1").click();
  await soon("C Coral disagrees: told to talk it over", async () => /doesn’t agree yet/.test(await amina.getByTestId("mz-hd-status").innerText()));
  await soon("C the TV says Coral hasn't agreed yet", async () => /not agreed yet/.test(await tv.getByTestId("tv-hd-progress-team-coral").innerText()));
  await amina.getByTestId("mz-hd-option-2").click();
  await soon("C Coral agrees now", async () => /agrees/.test(await amina.getByTestId("mz-hd-status").innerText()));
  await intent(roomId, b, gid, "huddle-pick", { round: 0, choice: 0 });
  await intent(roomId, w, gid, "huddle-pick", { round: 0, choice: 0 });
  await soon("C every team agrees: the answer comes early on phones", async () => (await amina.getByTestId("mz-hd-reveal").count()) === 1 && (await baraka.getByTestId("mz-hd-reveal").count()) === 1);
  await soon("C the TV shows each team's answer", async () => /Team Coral/.test(await tv.getByTestId("tv-hd-answers").innerText()) && /Team Sun/.test(await tv.getByTestId("tv-hd-answers").innerText()));
  await sleep(500);
  await shot(amina, "reveal-390");
  await shot(tv, "tv-reveal-1920");

  // ---- D: the rest, over the API (Coral right, Sun wrong) ----
  let rounds = 0;
  for (let r = 1; r < 8; r++) {
    const st = await until(async () => { const g = await myGame(roomId, k, gid); return g?.state?.phase === "pick" && g.state.round === r ? g.state : null; }, 30000);
    if (!st) break;
    // The right answer is secret until the reveal, so Coral picks A and Sun picks B; each team agrees, so each
    // question closes early. The totals are checked against the team results below.
    for (const s of [k, a]) await intent(roomId, s, gid, "huddle-pick", { round: r, choice: 0 });
    for (const s of [b, w]) await intent(roomId, s, gid, "huddle-pick", { round: r, choice: 1 });
    rounds += 1;
  }
  check("D seven more questions played", rounds === 7, `${rounds}`);
  const fin = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === gid); return g?.status === "finished" ? g : null; }, 40000);
  check("D the game finished with team results", !!fin?.teamResults && fin.teamResults.length === 2);
  const coral = fin?.teamResults?.find((r) => r.teamId === "team-coral"), sun = fin?.teamResults?.find((r) => r.teamId === "team-sun");
  check("D every player scored their team's points", !!fin && fin.rawScores[k.playerId] === fin.rawScores[a.playerId] && fin.rawScores[b.playerId] === fin.rawScores[w.playerId] && coral.score === fin.rawScores[k.playerId] && sun.score === fin.rawScores[b.playerId], JSON.stringify(fin?.rawScores));
  await soon("D phones: the results with the team results card", async () => (await amina.getByTestId("mz-hd-results").count()) === 1 && (await amina.getByTestId("team-results").count()) === 1);
  const winTeam = fin?.teamResults?.find((r) => r.rank === 1);
  await soon("D the phone's heading names the winning team, and your place is your team's", async () => {
    const head = await amina.getByTestId("results-headline").innerText();
    const you = await amina.getByTestId("results-you").innerText();
    return /Team (Coral|Sun) wins Team Huddle|tie for first in Team Huddle|Every team tied in Team Huddle/.test(head) && /Your team/.test(you) && (winTeam ? head.includes(winTeam.name) : true);
  });
  await soon("D the TV leads with the team result", async () => (await tv.getByTestId("tv-team-results").count()) === 1 && /wins|tied|tie for first/.test(await tv.getByTestId("tv-winner").innerText()));
  await sleep(600);
  await shot(amina, "results-390");
  await shot(tv, "tv-final-1920");

  // ---- E ----
  check("E 320 px: the results have no sideways scroll", await noSideScroll(wanjiru));
  await shot(wanjiru, "results-320");
  await backToLobby([host, amina, baraka, wanjiru]);

  // ---- F: Charades with three teams ----
  await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "make", count: 3 } });
  const teams3 = (await tvProj(roomId)).teams;
  const { gameId: cid } = await api(`/rooms/${roomId}/games`, { token: k.token, body: { gameId: "charades", official: false } });
  for (const s of [k, a, b, w]) await intent(roomId, s, cid, "briefing-ready", { ready: true });
  const cg = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === cid); return g?.status === "playing" ? g : null; });
  check("F Charades plays with the night's three teams", cg?.state?.teams?.length === 3 && JSON.stringify(cg.state.teamNames) === JSON.stringify(teams3.list.map((t) => t.name)), JSON.stringify(cg?.state?.teamNames));
  check("F equal turns: 3 teams × the largest team", cg?.state?.totalTurns === 3 * Math.max(...cg.state.teams.map((t) => t.length)), `${cg?.state?.totalTurns}`);
  await soon("F the TV names the acting team by its name", async () => { const line = await tv.getByTestId("tv-charades-actor").innerText(); return teams3.list.some((t) => line.includes(`acting for ${t.name}`)); });
  await sleep(500);
  await shot(tv, "tv-charades-three-1920");
  const seatById = Object.fromEntries([k, a, b, w].map((s) => [s.playerId, s]));
  const acted = [];
  for (let i = 0; i < 20; i++) {
    const g = (await tvProj(roomId)).games.find((x) => x.id === cid);
    if (g.status !== "playing") break;
    acted.push(g.state.actorTeam);
    await intent(roomId, seatById[g.state.actor], cid, "charades-turn", { outcome: "correct" });
  }
  check("F the teams took turns", JSON.stringify(acted) === JSON.stringify(acted.map((_, i) => i % 3)), JSON.stringify(acted));
  const cfin = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === cid); return g?.status === "finished" ? g : null; });
  check("F Charades finished with team results (every team tied: equal turns, all correct)", cfin?.teamResults?.length === 3 && cfin.teamResults.every((r) => r.rank === 1));
  await soon("F the TV final shows the team results", async () => (await tv.getByTestId("tv-team-results").count()) === 1);
  await sleep(500);
  await shot(tv, "tv-charades-final-1920");
} catch (e) {
  check("driver ran without throwing", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
if (failures) { console.log(`check-team-huddle: ${failures} failed`); process.exit(1); }
console.log("check-team-huddle: all passed");
