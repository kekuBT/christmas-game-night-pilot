// Stage 12.15 (docs/stage12/stage1215.md; D-S1215-01): the games built for teams in a Family Cup, on five phones and a TV.
//   A  a casual room made into a Family Cup; the host's Teams card is there, with the Cup's wording and no "play
//      individually" switch; teams Coral (Keku, Amina, Zawadi) and Sun (Baraka, Wanjiru at 320 px). Review 6892025042:
//      the host makes them with the rendered controls (Make teams → Make 2 teams → Move → rename and back → Done →
//      Edit teams → reload → Edit teams); a guest has no team controls
//   B  the lobby: Tug of War can be Official ("Official · counts toward the Family Cup"); the host starts it from the
//      lobby as Official; a guest's dock says so
//   C  three bouts over the API: Sun (2 per player) beats Coral (1 per player) every time
//   D  the result counts by team: Sun's players 100, Coral's 0 (not 87.5 and 25, the players' ranks); the standings
//      and the day score follow; the results say "Official game … as a team game"; the TV's final shows the Cup after
//      this game, Sun first
//   E  the Cup screen (320 px): the game's placements are the server's (Baraka 100, Wanjiru 100, Coral 0) and the note
//      explains team placement and the 75/25 day
//   D+ (review 6890761957) the TV's final standings list Tug of War's players by their team's place (Sun 1, 1; Coral
//      2, 2, 2), with the team named, not re-ranked by points
//   F  (Stage 12.15-R, review 6888718011 R6) the recaps name the team: the lobby's last game ("Team Sun wins"; "Your
//      team, Team Sun, won"; Coral "came 2nd of 2"), the TV's lobby list and the night card, never teammates "tied for
//      first"
//   G  (review 6892025042) a casual room whose host made teams from the sheet becomes a Family Cup from the room menu:
//      Edit teams opens the sheet, a move reaches the server, and after a reload it opens again; guests get no controls
// The Individual Family Cup's refusal can't be reached from a browser any more (every new Cup is a Family Cup); it is
// covered by tests/stage1215-cup-team-games.test.ts.
// Usage: node scripts/check-cup-team-games.mjs <baseUrl>   (the gate passes its server)
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { PROTOCOL_HEADERS } from "./lib/protocol.mjs";
import { solveMath } from "./lib/math-solve.mjs";
import { openRoomMenu } from "./lib/room-nav.mjs";

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
const shot = async (page, name) => { await page.mouse.move(1, 1); await page.screenshot({ path: screenshotPath(`docs/stage12/stage1215-screenshots/${name}.png`) }); };
const shotR = async (page, name) => { await page.mouse.move(1, 1); await page.screenshot({ path: screenshotPath(`docs/stage12/stage1215r-screenshots/${name}.png`) }); };
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : "");

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
  const names = ["Amina", "Zawadi", "Baraka", "Wanjiru"];
  const pages = [host];
  for (const n of names) { const p = await phone(n === "Wanjiru" ? 320 : 390); await join(p, n, code); pages.push(p); }
  const tv = await tvPage(code);
  const seats = [];
  for (const p of pages) seats.push(await seatOf(p));
  const [k, a, z, b, w] = seats;
  const roomId = k.roomId;
  const pageOf = Object.fromEntries(seats.map((s, i) => [s.playerId, pages[i]]));
  await api(`/rooms/${roomId}/cup`, { token: k.token, body: {} });
  const tv0 = await until(async () => { const t = await tvProj(roomId); return t.roomKind === "cup" ? t : null; });
  check("A the room is now a Family Cup: 75% individual, 25% team", tv0?.competition?.format === "combined-75-25" && tv0?.competition?.label === "Family Cup" && tv0?.competition?.teamGamesCount === true, JSON.stringify(tv0?.competition));
  await soon("A the host's Teams card is in the Cup lobby, with the Cup's wording", async () => (await host.getByTestId("teams-card").getAttribute("data-state")) === "none" && /games built for teams.*every other game stays individual/i.test(await text(host.getByTestId("teams-card"))));
  await shot(host, "cup-teams-card-390");
  // Review 6892025042: the host sets the teams up with the rendered controls. (They were made over the API here, so the
  // Cup lobby's "Make teams" button, which opened nothing, went unnoticed.)
  const amina = pageOf[a.playerId];
  check("A a guest's phone has no team controls (no Make teams, no Edit teams)", (await amina.getByTestId("teams-make").count()) === 0 && (await amina.getByTestId("teams-edit").count()) === 0);
  await host.getByTestId("teams-make").click();
  await soon("A the host's Make teams opens the teams sheet in the Cup lobby", async () => (await host.getByTestId("teams-sheet").count()) === 1, 10000);
  await host.getByTestId("teams-count-2").click();
  await host.getByTestId("teams-shuffle").click();
  await soon("A \"Make 2 teams\" from the sheet: the server has 2 teams with all 5 players", async () => { const t = (await tvProj(roomId)).teams; return t?.list?.length === 2 && Object.keys(t.members ?? {}).length === 5; });
  // Everyone to their side with the sheet's own Move buttons, one at a time: each waits for the server and for the
  // host's sheet to show it (a move carries the teams' revision, so the next one must see the last).
  const wantTeam = [[k, "team-coral"], [a, "team-coral"], [z, "team-coral"], [b, "team-sun"], [w, "team-sun"]];
  for (const [s, team] of wantTeam) {
    if ((await tvProj(roomId)).teams.members[s.playerId] === team) continue;
    await host.getByTestId(`teams-move-${s.playerId}-${team}`).click();
    await until(async () => (await tvProj(roomId)).teams.members[s.playerId] === team && (await host.getByTestId(`teams-edit-${team}`).getByTestId(`teams-member-${s.playerId}`).count()) === 1, 10000);
  }
  const sides = (await tvProj(roomId)).teams.members;
  check("A moved from the sheet: Coral Keku, Amina, Zawadi; Sun Baraka, Wanjiru", wantTeam.every(([s, team]) => sides[s.playerId] === team), JSON.stringify(sides));
  const renameTo = async (teamId, name) => {
    const input = host.getByTestId(`teams-name-${teamId}`);
    await input.fill(name);
    await input.press("Enter");
    return until(async () => (await tvProj(roomId)).teams.list.find((t) => t.id === teamId)?.name === name, 10000);
  };
  await renameTo("team-coral", "Coral Crew");
  await soon("A a rename from the sheet reaches the server and a guest's card", async () => /Coral Crew/.test(await text(amina.getByTestId("teams-card"))));
  await shotR(host, "cup-teams-sheet-390");
  await renameTo("team-coral", "Team Coral");
  await soon("A …and back to Team Coral", async () => /Team Coral/.test(await text(amina.getByTestId("teams-card"))) && !/Coral Crew/.test(await text(amina.getByTestId("teams-card"))));
  await host.getByTestId("teams-close").click();
  await soon("A Done closes the sheet", async () => (await host.getByTestId("teams-sheet").count()) === 0);
  await host.getByTestId("teams-edit").click();
  await soon("A Edit teams opens it again, with the teams as set", async () => (await host.getByTestId("teams-sheet").count()) === 1 && (await host.getByTestId("teams-edit-team-sun").getByTestId(`teams-member-${w.playerId}`).count()) === 1 && (await host.getByTestId("teams-name-team-coral").inputValue()) === "Team Coral");
  await host.getByTestId("teams-close").click();
  await host.reload({ waitUntil: "domcontentloaded" });
  await host.getByTestId("teams-edit").waitFor({ timeout: 20000 });
  await host.getByTestId("teams-edit").click();
  await soon("A after the host's reload, Edit teams still opens the sheet with the same teams", async () => (await host.getByTestId("teams-sheet").count()) === 1 && (await host.getByTestId("teams-edit-team-coral").getByTestId(`teams-member-${z.playerId}`).count()) === 1, 15000);
  await host.getByTestId("teams-close").click();
  check("A a guest still has no team controls and no sheet", (await amina.getByTestId("teams-edit").count()) === 0 && (await amina.getByTestId("teams-sheet").count()) === 0 && (await amina.getByTestId("teams-make").count()) === 0);
  await soon("A Wanjiru's phone (320 px) shows she's on Team Sun", async () => /You’re on Team Sun/.test(await text(pageOf[w.playerId].getByTestId("teams-you"))));
  check("A in a Cup there is no \"play the next games individually\" switch", (await host.getByTestId("teams-play-toggle").count()) === 0);

  // ---- B ----
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-tug-of-war").click();
  await soon("B Tug of War can be Official in the Cup: Official is enabled, no practice-only note", async () => !(await host.getByTestId("mode-official").isDisabled()) && (await host.getByTestId("practice-only-note").count()) === 0);
  await host.getByTestId("mode-official").click();
  await soon("B the host's start is Official, and says it counts toward the Family Cup", async () => (await host.locator("[data-testid='start-official-tug-of-war']").count()) === 1 && /counts toward the Family Cup/.test(await host.locator("main").innerText()));
  await soon("B a guest's lobby says Tug of War will be Official", async () => /Tug of War · Official, counts toward the Family Cup/.test(await pageOf[a.playerId].locator("main").innerText()));
  await shot(host, "cup-lobby-official-390");
  await host.getByTestId("start-official-tug-of-war").click();
  const tvGame0 = await until(async () => (await tvProj(roomId)).games.find((g) => g.gameId === "tug-of-war"));
  const gid = tvGame0?.id;
  check("B the game started as Official", tvGame0?.official === true, JSON.stringify({ official: tvGame0?.official, status: tvGame0?.status }));
  for (const s of seats) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  const tvGame = async () => (await tvProj(roomId)).games.find((g) => g.id === gid);
  await until(async () => (await tvGame()).status === "playing");
  const members = (await tvGame()).teams?.members ?? {};
  check("B it plays with the Cup's teams", Object.keys(members).length === 5 && Object.entries(members).every(([p, t]) => t === ([b.playerId, w.playerId].includes(p) ? "team-sun" : "team-coral")), JSON.stringify(members));

  // ---- C ----
  const pull = async (s, count, bout) => {
    for (let i = 0; i < count; i++) {
      const v = (await myGame(roomId, s, gid)).state;
      await intent(roomId, s, gid, "tug-answer", { bout, idx: v.sum.idx, choice: v.sum.options.findIndex((o) => o === solveMath(v.sum.prompt)) });
    }
  };
  for (let bout = 0; bout < 3; bout++) {
    await until(async () => { const g = await tvGame(); return g.state.phase === "pull" && g.state.bout === bout; }, 20000);
    await pull(b, 2, bout); await pull(w, 2, bout); await pull(k, 1, bout); await pull(a, 1, bout); await pull(z, 1, bout);
    const r = await until(async () => { const g = await tvGame(); return g.state.phase === "result" && g.state.bout === bout ? g.state.result : null; }, 60000);
    check(`C bout ${bout + 1}: Sun wins (2.0 per player against 1.0)`, r?.find((x) => x.teamId === "team-sun")?.place === 1, JSON.stringify(r));
  }

  // ---- D ----
  const fin = await until(async () => { const g = await tvGame(); return g.status === "finished" ? g : null; }, 30000);
  check("D the game finished and counts officially", fin?.countsOfficially === true, JSON.stringify({ status: fin?.status, counts: fin?.countsOfficially }));
  const placed = fin?.cupPlacement ?? {};
  check("D placed by team: Sun's players 100, Coral's 0", placed[b.playerId] === 100 && placed[w.playerId] === 100 && placed[k.playerId] === 0 && placed[a.playerId] === 0 && placed[z.playerId] === 0, JSON.stringify(placed));
  const tvNow = await tvProj(roomId);
  check("D the standings are the team placements", tvNow.officialStandings?.[b.playerId] === 100 && tvNow.officialStandings?.[k.playerId] === 0, JSON.stringify(tvNow.officialStandings));
  const champ = (tvNow.championship ?? []).find((r) => r.playerId === b.playerId);
  check("D Baraka's day score is 100 (a day with only a team game uses the team average)", JSON.stringify(champ?.dayScores) === "[100]", JSON.stringify(champ));
  await soon("D Keku's results say it was Official, as a team game", async () => /Official game: it counts toward the Cup as a team game/.test(await text(host.getByTestId("mz-tug-howscore"))));
  // The one-line comment is about the teams (Sun 300, Coral 225), never "tied for first" between teammates.
  await soon("D the results' comment is about the teams, not teammates \"tied for first\"", async () => { const t = await host.locator("main").innerText(); return /Team Sun wins Tug of War/.test(t) && !/Tied for first|Dead heat at the top|A shared win/.test(t); });
  await soon("D the TV's final shows the Family Cup after this game, Sun first", async () => {
    // The kicker is upper-cased by CSS, and innerText follows it. The two leaders come first, with 100 points each.
    const t = await text(tv.getByTestId("tv-final-cup"));
    return /after this game/i.test(t) && /^\s*1\s+(Baraka|Wanjiru)\s+100 pts[\s\S]*1\s+(Baraka|Wanjiru)\s+100 pts/m.test(t);
  });
  await soon("D+ the TV's final standings go by team place: Sun's two 1st, Coral's three 2nd (not 3rd), each with its team", async () => {
    const rows = await tv.getByTestId("tv-last-standings").locator("li").evaluateAll((els) => els.map((e) => [e.getAttribute("data-rank"), e.textContent ?? ""]));
    return JSON.stringify(rows.map((r) => r[0])) === JSON.stringify(["1", "1", "2", "2", "2"]) && rows.slice(0, 2).every((r) => /Team Sun/.test(r[1])) && rows.slice(2).every((r) => /Team Coral/.test(r[1]));
  });
  await shotR(tv, "tv-final-standings-by-team-1920");
  await sleep(500);
  await shot(host, "cup-results-390");
  await shot(tv, "tv-cup-final-1920");

  // ---- E ----
  const wan = pageOf[w.playerId];
  await wan.goto(`${BASE}/room/cup`, { waitUntil: "domcontentloaded" });
  await soon("E the Cup screen lists Tug of War with the server's team placements", async () => {
    const t = await text(wan.getByTestId("cup-games"));
    return /Tug of War/.test(t) && /Baraka 100/.test(t) && /Wanjiru 100/.test(t) && /Keku 0/.test(t);
  });
  await soon("E the note explains team placement and the 75/25 day", async () => /teams are placed.*75%.*25%/s.test(await text(wan.getByTestId("cup-placement-note"))));
  await wan.getByTestId("cup-games").scrollIntoViewIfNeeded();
  await shot(wan, "cup-screen-320");
  check("E 320 px: the Cup screen has no sideways scroll", await noSideScroll(wan));

  // ---- F ---- (Stage 12.15-R R6: the recaps name the team)
  const baraka = pageOf[b.playerId];
  for (const p of [host, baraka]) { const back = p.getByTestId("show-back-to-lobby"); if (await back.count()) await back.first().click(); }
  await soon("F Baraka's lobby: the last game is Sun's win, and his team's", async () => {
    const card = await text(baraka.getByTestId("last-game-card"));
    return /Team Sun wins/.test(card) && /Your team, Team Sun, won · \d+ points\./.test(await text(baraka.getByTestId("last-game-you"))) && !/tie for first/i.test(card);
  });
  await soon("F Keku's lobby: his team came 2nd of 2", async () => /Your team, Team Coral, came 2nd of 2 · \d+ points\./.test(await text(host.getByTestId("last-game-you"))));
  await baraka.getByTestId("last-game-card").scrollIntoViewIfNeeded();
  await shotR(baraka, "lobby-last-game-320");
  await tv.getByTestId("tv-dir-lobby").click();
  await soon("F the TV's lobby list names the winning team, not teammates", async () => { const t = await text(tv.getByTestId("tv-recent")); return /Tug of War[\s\S]*Team Sun wins/.test(t) && !/tie for first/i.test(t); });
  await openRoomMenu(baraka);
  await baraka.getByTestId("menu-night-card").click();
  await baraka.getByTestId("night-card-sheet").waitFor({ timeout: 10000 });
  await soon("F the night card's words name the team: \"Tug of War: Team Sun wins\"", async () => { const t = (await baraka.getByTestId("night-card-text").textContent()) ?? ""; return /Tug of War: Team Sun wins/.test(t) && !/tie for first/i.test(t); });

  // ---- G ---- (review 6892025042) a casual room whose host made teams becomes a Family Cup: Edit teams still opens
  const neema = await phone();
  const code2 = await hostRoom(neema, "Neema");
  const juma = await phone(); await join(juma, "Juma", code2);
  const halima = await phone(); await join(halima, "Halima", code2);
  const [n2, j2] = [await seatOf(neema), await seatOf(juma)];
  const room2 = n2.roomId;
  await neema.getByTestId("teams-make").click();
  await soon("G casual: the host's Make teams opens the sheet", async () => (await neema.getByTestId("teams-sheet").count()) === 1, 10000);
  await neema.getByTestId("teams-count-2").click();
  await neema.getByTestId("teams-shuffle").click();
  await soon("G casual: 2 teams made from the sheet", async () => (await tvProj(room2)).teams?.list?.length === 2);
  await neema.getByTestId("teams-close").click();
  await openRoomMenu(neema);
  await neema.getByTestId("menu-make-cup").click();
  await neema.getByTestId("make-cup-sheet").waitFor({ timeout: 15000 });
  await neema.getByTestId("make-cup-confirm").click();
  await neema.getByTestId("make-cup-sheet").waitFor({ state: "detached", timeout: 15000 });
  await soon("G made a Family Cup from the room menu, its teams kept", async () => { const t = await tvProj(room2); return t.roomKind === "cup" && t.teams?.list?.length === 2; });
  await neema.getByTestId("teams-edit").click();
  await soon("G in the Cup, the host's Edit teams opens the sheet with the night's teams", async () => (await neema.getByTestId("teams-sheet").count()) === 1 && (await neema.getByTestId("teams-edit-list").count()) === 1, 10000);
  const t2 = (await tvProj(room2)).teams;
  const jumaTo = t2.list.find((t) => t.id !== t2.members[j2.playerId]).id;
  await neema.getByTestId(`teams-move-${j2.playerId}-${jumaTo}`).click();
  await soon("G a move from the sheet reaches the server", async () => (await tvProj(room2)).teams.members[j2.playerId] === jumaTo);
  await shotR(neema, "cup-after-change-teams-sheet-390");
  await neema.getByTestId("teams-close").click();
  await neema.reload({ waitUntil: "domcontentloaded" });
  await neema.getByTestId("teams-edit").waitFor({ timeout: 20000 });
  await neema.getByTestId("teams-edit").click();
  await soon("G after a reload, Edit teams opens it again, Juma where he was moved", async () => (await neema.getByTestId("teams-sheet").count()) === 1 && (await neema.getByTestId(`teams-edit-${jumaTo}`).getByTestId(`teams-member-${j2.playerId}`).count()) === 1, 15000);
  await neema.getByTestId("teams-close").click();
  check("G guests in the Cup have no team controls and no sheet", (await juma.getByTestId("teams-edit").count()) === 0 && (await juma.getByTestId("teams-make").count()) === 0 && (await juma.getByTestId("teams-sheet").count()) === 0 && (await halima.getByTestId("teams-edit").count()) === 0);
  await soon("G a guest sees which team he's on", async () => /You’re on Team /.test(await text(juma.getByTestId("teams-you"))));
  for (const p of [neema, juma, halima]) await p.context().close();
} finally {
  await browser.close();
}
console.log(failures === 0 ? "CUP TEAM GAMES PASSED" : `CUP TEAM GAMES FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
