// Stage 12.7 (docs/stage12/stage127.md): teams for the night, on four phones and a TV.
//   A  no teams yet: only the host is offered "Make teams"
//   B  the host makes 2 teams in the sheet, renames one, moves a player with the sheet's buttons
//   C  everyone's lobby says which team they're on; the TV lists the teams
//   D  a team game: phones show the team results under the heading; the TV leads with the winning team
//   E  "Play the next games individually": the next game has no team results; then back to teams
//   F  a newcomer joins the smallest team; the TV counts tonight's team wins
//   G  320 px: the lobby card and the sheet have no sideways scroll
//   H  "No teams tonight" clears them for everyone
// Usage: node scripts/check-teams.mjs <baseUrl>   (the gate passes its server)
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
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage127-screenshots/${name}.png`) });
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

/** A Math Mayhem game over the API: `right[i]` of seat i's answers right; waits for the TV to see it live first. */
async function playMath(roomId, seats, right) {
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: seats[0].token, body: { gameId: "math-mayhem", official: false } });
  for (const s of seats) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  for (let t = 0; t < 50; t++) { if ((await tvProj(roomId)).games.find((g) => g.id === gid)?.status === "playing") break; await sleep(200); }
  await sleep(1500);
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
  const amina = await phone(), baraka = await phone(), wanjiru = await phone();
  await join(amina, "Amina", code); await join(baraka, "Baraka", code); await join(wanjiru, "Wanjiru", code);
  const tv = await tvPage(code);
  const [k, a, b, w] = [await seatOf(host), await seatOf(amina), await seatOf(baraka), await seatOf(wanjiru)];
  const roomId = k.roomId;
  await soon("A host: a Teams card offering Make teams", async () => (await host.getByTestId("teams-card").getAttribute("data-state")) === "none");
  check("A a guest has no Teams card before there are teams", (await amina.getByTestId("teams-card").count()) === 0);

  // ---- B ----
  await host.getByTestId("teams-make").click();
  await host.getByTestId("teams-sheet").waitFor({ timeout: 10000 });
  await host.getByTestId("teams-count-2").click();
  await host.getByTestId("teams-shuffle").click();
  await soon("B two teams of two", async () => { const t = (await tvProj(roomId)).teams; return t && t.list.length === 2 && t.list.every((x) => Object.values(t.members).filter((m) => m === x.id).length === 2); });
  // Put Keku and Amina on Coral, Baraka and Wanjiru on Sun: Amina's move is made with the sheet's own button.
  let t = (await tvProj(roomId)).teams;
  for (const [s, team] of [[k, "team-coral"], [b, "team-sun"], [w, "team-sun"]]) if (t.members[s.playerId] !== team) await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "move", playerId: s.playerId, teamId: team } });
  t = (await tvProj(roomId)).teams;
  if (t.members[a.playerId] !== "team-coral") {
    await soon("B the sheet shows Amina with a move button", async () => (await host.getByTestId(`teams-move-${a.playerId}-team-coral`).count()) === 1);
    await host.getByTestId(`teams-move-${a.playerId}-team-coral`).click();
  }
  await soon("B the teams: Keku and Amina on Coral, Baraka and Wanjiru on Sun", async () => { const m = (await tvProj(roomId)).teams.members; return m[k.playerId] === "team-coral" && m[a.playerId] === "team-coral" && m[b.playerId] === "team-sun" && m[w.playerId] === "team-sun"; });
  await host.getByTestId("teams-name-team-coral").fill("The Lions");
  await host.getByTestId("teams-name-team-coral").press("Enter");
  await soon("B renamed: The Lions", async () => (await tvProj(roomId)).teams.list.find((x) => x.id === "team-coral").name === "The Lions");
  await shot(host, "teams-sheet-390");
  await host.getByTestId("teams-close").click();

  // ---- C ----
  for (const [who, p, team] of [["Amina", amina, "The Lions"], ["Baraka", baraka, "Team Sun"]]) await soon(`C ${who}'s lobby: "You're on ${team}"`, async () => new RegExp(`You’re on ${team}`).test(await p.getByTestId("teams-you").innerText()));
  await soon("C the TV lists the teams and their players", async () => /The Lions/.test(await tv.getByTestId("tv-teams").innerText()) && /Baraka and Wanjiru|Wanjiru and Baraka/.test(await tv.getByTestId("tv-team-team-sun").innerText()));
  await shot(amina, "lobby-guest-teams-390");
  await shot(tv, "tv-lobby-teams-1920");

  // ---- D: The Lions (10 + 2 = average 6 right) vs Team Sun (5 + 5) ----
  const gid = await playMath(roomId, [k, a, b, w], [10, 2, 5, 5]);
  const fin = (await tvProj(roomId)).games.find((g) => g.id === gid);
  check("D the game copied the teams at its start", fin.teams?.members?.[a.playerId] === "team-coral" && Object.keys(fin.teams.members).length === 4, JSON.stringify(fin.teams));
  const rows = fin.teamResults ?? [];
  const avg = (ids) => Math.round(ids.reduce((s, id) => s + (fin.rawScores[id] ?? 0), 0) / ids.length);
  check("D each team's score is its players' average", rows.find((r) => r.teamId === "team-coral")?.score === avg([k.playerId, a.playerId]) && rows.find((r) => r.teamId === "team-sun")?.score === avg([b.playerId, w.playerId]), JSON.stringify(rows.map((r) => [r.name, r.score, r.rank])));
  const winner = rows.find((r) => r.rank === 1);
  await soon("D phone results: the team results under the heading, with the winner", async () => new RegExp(`${winner.name} wins`).test(await amina.getByTestId("team-winner").innerText()) && (await amina.locator('[data-testid^="team-result-"]').count()) === 2);
  check("D your own team is marked on your phone", await amina.locator('[data-testid="team-result-team-coral"].is-mine').count() === 1);
  await soon("D the TV leads with the winning team", async () => new RegExp(`${winner.name} wins`).test(await tv.getByTestId("tv-winner").innerText()) && (await tv.getByTestId("tv-team-results").count()) === 1);
  await sleep(800);
  await shot(amina, "results-teams-390");
  await shot(tv, "tv-final-teams-1920");
  await backToLobby([host, amina, baraka, wanjiru]);

  // ---- E: individually for a game ----
  await soon("E the host's card offers playing individually", async () => (await host.getByTestId("teams-play-toggle").count()) === 1);
  await host.getByTestId("teams-play-toggle").click();
  await soon("E paused for everyone", async () => (await amina.getByTestId("teams-card").getAttribute("data-state")) === "paused");
  const gid2 = await playMath(roomId, [k, a, b, w], [3, 4, 5, 6]);
  const fin2 = (await tvProj(roomId)).games.find((g) => g.id === gid2);
  check("E the paused game has no teams and no team results", fin2.teams === undefined && fin2.teamResults === undefined);
  await soon("E its phone results are up, with no team card", async () => (await amina.getByRole("button", { name: "Back to lobby" }).count()) > 0 && (await amina.getByTestId("team-results").count()) === 0);
  await backToLobby([host, amina, baraka, wanjiru]);
  await host.getByTestId("teams-play-toggle").click();
  await soon("E back to teams", async () => (await amina.getByTestId("teams-card").getAttribute("data-state")) === "on");

  // ---- F ----
  const zawadi = await phone();
  await join(zawadi, "Zawadi", code);
  const z = await seatOf(zawadi);
  await soon("F the newcomer joins a team", async () => !!(await tvProj(roomId)).teams.members[z.playerId]);
  // The TV keeps the last game's final until the next game; its director picks the lobby to show the teams.
  await tv.getByTestId("tv-dir-lobby").click();
  await soon("F the TV counts tonight's team wins", async () => new RegExp(`1 win`).test(await tv.getByTestId(`tv-team-${winner.teamId}`).innerText()));
  await shot(tv, "tv-lobby-team-wins-1920");

  // ---- G ----
  await host.setViewportSize({ width: 320, height: 700 });
  await sleep(400);
  check("G the lobby with the Teams card fits 320 px", await noSideScroll(host));
  await host.getByTestId("teams-edit").click();
  await host.getByTestId("teams-sheet").waitFor({ timeout: 10000 });
  await sleep(300);
  check("G the teams sheet fits 320 px", await noSideScroll(host));
  await shot(host, "teams-sheet-320");

  // ---- H ----
  await host.getByTestId("teams-clear").click();
  await host.getByTestId("teams-clear-confirm").click();
  await soon("H no teams for everyone", async () => (await tvProj(roomId)).teams === undefined && (await amina.getByTestId("teams-card").count()) === 0);
  check("H a finished team game keeps its team results", ((await tvProj(roomId)).games.find((g) => g.id === gid).teamResults ?? []).length === 2);
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "check-teams: all checks passed" : `check-teams: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
