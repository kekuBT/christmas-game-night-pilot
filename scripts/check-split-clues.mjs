// Stage 12.10 (docs/stage12/stage1210.md): the team kit and Split Clues, on seven phones and a TV.
//   A  the night's teams: Coral (Keku, Amina), Sun (Baraka, Wanjiru), Mint (Zawadi, Juma), Iris (Neema alone). Iris
//      has 1 player, so Neema plays with the smallest other team, and every briefing says so (D-S1210-01)
//   B  each phone shows exactly its own clues; a team's phones hold all six; the TV and other teams show none
//   C  a wrong try: teammates see it, the team's box pauses for 4 s; other teams and the TV never see it
//   D  help from the server clock: the shape at 30 s, everyone's clues at 45 s, the first letter at 60 s (phones + TV)
//   E  solve order on the phones and over the API: places 1-2-3 and 100/75/55; the reveal on phones and the TV
//   F  the other five puzzles over the API; results: the team results card ("A team game"), the TV final; 320 px
// The answers are secret in every projection, so the driver loads the puzzle pack (through tsx, as the server runs) and
// finds each puzzle from the clues a team holds, the way check-relay solves its sums.
// Usage: node scripts/check-split-clues.mjs <baseUrl>   (the gate passes its server)
import { execFileSync } from "node:child_process";
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
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage1210-screenshots/${name}.png`) });
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : "");

// The puzzle pack, loaded the way the server loads it.
const PUZZLES = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", "import('./src/games/modules/packs/split-clues.ts').then((m) => process.stdout.write(JSON.stringify(m.SPLIT_PUZZLES)))"], { encoding: "utf8" }));
/** The one puzzle whose clues include every clue given (a team's clues). */
const puzzleFrom = (clues) => { const found = PUZZLES.filter((p) => clues.every((c) => p.clues.includes(c))); return found.length === 1 ? found[0] : null; };

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
  const names = ["Amina", "Baraka", "Wanjiru", "Zawadi", "Juma", "Neema"];
  const pages = [host];
  for (const n of names) { const p = await phone(n === "Neema" ? 320 : 390); await join(p, n, code); pages.push(p); }
  const tv = await tvPage(code);
  const seats = [];
  for (const p of pages) seats.push(await seatOf(p));
  const [k, a, b, w, z, j, n] = seats;
  const roomId = k.roomId;
  const pageOf = Object.fromEntries(seats.map((s, i) => [s.playerId, pages[i]]));
  const nameOf = Object.fromEntries(seats.map((s, i) => [s.playerId, ["Keku", ...names][i]]));
  await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "make", count: 4 } });
  for (const [s, team] of [[k, "team-coral"], [a, "team-coral"], [b, "team-sun"], [w, "team-sun"], [z, "team-mint"], [j, "team-mint"], [n, "team-iris"]]) await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "move", playerId: s.playerId, teamId: team } });
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: k.token, body: { gameId: "split-clues", official: false } });
  const g0 = (await tvProj(roomId)).games.find((g) => g.id === gid);
  const moved = g0?.teams?.moved ?? [];
  check("A Iris had 1 player, so Neema plays with another team (and the game has three teams)", moved.length === 1 && moved[0].playerId === n.playerId && g0.teams.list.length === 3, JSON.stringify(moved));
  const neemaTeam = g0?.teams?.members?.[n.playerId];
  await soon("A Neema's briefing says she plays with another team this game", async () => /You play with Team (Coral|Sun|Mint) this game: a team needs at least 2 players/.test(await text(pageOf[n.playerId].getByTestId(`briefing-moved-${n.playerId}`))));
  await soon("A everyone else's briefing says so too", async () => /Neema plays with Team/.test(await text(host.getByTestId(`briefing-moved-${n.playerId}`))));
  await sleep(300);
  await shot(pageOf[n.playerId], "briefing-320");
  for (const s of seats) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  await soon("A the TV shows a three-team scoreboard", async () => (await tv.getByTestId("tv-sc-scores").getAttribute("data-teams")) === "3");

  // ---- B ----
  const teamOf = (s) => (s.playerId === n.playerId ? neemaTeam : g0.teams.members[s.playerId]);
  const teams = [...new Set(seats.map(teamOf))];
  const viewOf = async (s) => (await myGame(roomId, s, gid)).state;
  await until(async () => (await viewOf(k)).myClues?.length > 0, 15000);
  const allClues = new Set();
  let phonesRight = true, unionRight = true;
  for (const t of teams) {
    const union = new Set();
    for (const s of seats.filter((x) => teamOf(x) === t)) {
      const v = await viewOf(s);
      v.myClues.forEach((c) => { union.add(c); allClues.add(c); });
      const shown = await until(async () => { const items = await pageOf[s.playerId].getByTestId("mz-sc-clue").allInnerTexts(); return items.length ? items : null; }, 10000);
      if (JSON.stringify([...(shown ?? [])].sort()) !== JSON.stringify([...v.myClues].sort())) phonesRight = false;
    }
    if (union.size !== 6) unionRight = false;
  }
  check("B every phone shows exactly the clues the server dealt it", phonesRight);
  check("B each team's phones hold all six clues between them", unionRight);
  const puzzle0 = puzzleFrom([...allClues]);
  check("B the puzzle is known to the driver from its clues", !!puzzle0, puzzle0?.id);
  // Stage 12.15 (a false positive in the full gate 20261115-012817-fda15ec8-20702): the answer was "Tea", and "Team
  // Coral" contains "Tea". The answer is now looked for as a whole word, with the teams' names taken out first; the
  // self-check is that run's case.
  const scrubTeams = (t) => t.replace(/\bTeam (Coral|Sun|Mint|Iris)\b/gi, "Team ·");
  const wholeWord = (w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu");
  check("B self-check: a team's name doesn't count as the answer", /Tea/.test("Team Coral · 0") && !wholeWord("Tea").test(scrubTeams("Team Coral · 0")) && wholeWord("Tea").test(scrubTeams("Answer: Tea")));
  const tvText = await tv.getByTestId("tv-live-split-clues").innerText();
  check("B the TV shows the puzzle's kind but no clue and not the answer", tvText.includes(puzzle0?.kind ?? "?") && [...allClues].every((c) => !tvText.includes(c)) && !wholeWord(puzzle0?.answer ?? "?").test(scrubTeams(tvText)));
  const tvData = JSON.stringify((await tvProj(roomId)).games.find((g) => g.id === gid).state);
  check("B the TV's data has no clue and not the answer", [...allClues].every((c) => !tvData.includes(c)) && !tvData.toLowerCase().includes(`"${(puzzle0?.answer ?? "?").toLowerCase()}"`));
  await shot(host, "clues-390");
  await shot(tv, "tv-solve-1920");

  // ---- C ----
  const coralMate = pageOf[a.playerId];
  await host.getByTestId("mz-sc-input").fill("definitely wrong");
  await host.getByTestId("mz-sc-send").click();
  await soon("C a teammate sees the wrong try", async () => /You tried|Keku tried: definitely wrong/.test(await text(coralMate.getByTestId("mz-sc-tries"))));
  await soon("C the team's answer box pauses", async () => /try again in \d+ s/.test(await text(host.getByTestId("mz-sc-locked"))) && await host.getByTestId("mz-sc-input").isDisabled());
  check("C another team's phone never shows the try", !(await pageOf[b.playerId].locator("main").innerText()).includes("definitely wrong"));
  check("C the TV never shows the try", !(await tv.locator("body").innerText()).includes("definitely wrong") && !JSON.stringify(await tvProj(roomId)).includes("definitely wrong"));
  await shot(coralMate, "wrong-try-390");
  await soon("C the pause ends by itself", async () => !(await host.getByTestId("mz-sc-input").isDisabled()), 8000);

  // ---- D ----
  await soon("D at 30 s every phone and the TV show the answer's shape", async () => /Shape: /.test(await text(host.getByTestId("mz-sc-help"))) && /Shape: /.test(await text(tv.getByTestId("tv-sc-help"))), 40000);
  await soon("D at 45 s every phone shows its team's six clues", async () => (await host.getByTestId("mz-sc-clue").count()) === 6 && (await pageOf[b.playerId].getByTestId("mz-sc-clue").count()) === 6, 20000);
  await soon("D at 60 s the first letter", async () => /First letter: [A-Z]/.test(await text(host.getByTestId("mz-sc-help"))) && /First letter: /.test(await text(tv.getByTestId("tv-sc-help"))), 20000);
  await shot(pageOf[b.playerId], "help-390");

  // ---- E ----
  const order = [teams[1], teams[0], teams[2]];
  const solver = (t) => seats.find((s) => teamOf(s) === t);
  // 2nd team in order types it on a phone (lower case); the others over the API.
  await intent(roomId, solver(order[0]), gid, "split-guess", { round: 0, text: puzzle0.answer });
  const phoneSolver = pageOf[solver(order[1]).playerId];
  await phoneSolver.getByTestId("mz-sc-input").fill(puzzle0.answer.toLowerCase());
  await phoneSolver.getByTestId("mz-sc-send").click();
  await soon("E the team that solved it second sees its place", async () => /solved it, 2nd/.test(await text(phoneSolver.getByTestId("mz-sc-status"))));
  await intent(roomId, solver(order[2]), gid, "split-guess", { round: 0, text: puzzle0.answer });
  const rev = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === gid); return g.state.phase === "reveal" ? g.state.result : null; }, 10000);
  const pts = Object.fromEntries((rev?.teams ?? []).map((t) => [t.teamId, [t.place, t.points]]));
  check("E places 1, 2, 3 by solve order, 100 / 75 / 55", JSON.stringify(order.map((t) => pts[t])) === JSON.stringify([[1, 100], [2, 75], [3, 55]]), JSON.stringify(pts));
  await soon("E the reveal on a phone: the answer, all six clues and each team's result", async () => (await text(host.getByTestId("mz-sc-answer"))) === puzzle0.answer && (await host.getByTestId("mz-sc-all-clues").locator("li").count()) === 6 && (await host.getByTestId("mz-sc-team-results").locator("li").count()) === 3);
  await soon("E the reveal on the TV", async () => (await text(tv.getByTestId("tv-sc-answer"))) === puzzle0.answer && (await tv.getByTestId("tv-sc-clues").locator("li").count()) === 6);
  await shot(host, "reveal-390");
  await shot(tv, "tv-reveal-1920");

  // ---- F ----
  for (let round = 1; round < 6; round++) {
    const st = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === gid); return g.state.phase === "solve" && g.state.round === round ? g.state : null; }, 20000);
    if (!st) { check(`F puzzle ${round + 1} began`, false); break; }
    const clues = [];
    for (const s of seats.filter((x) => teamOf(x) === teams[0])) clues.push(...(await viewOf(s)).myClues);
    const p = puzzleFrom(clues);
    if (!p) { check(`F puzzle ${round + 1} known from its clues`, false); break; }
    for (const t of teams) await intent(roomId, solver(t), gid, "split-guess", { round, text: p.answer });
  }
  const fin = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === gid); return g.status === "finished" ? g : null; }, 30000);
  check("F the game finished with team results for three teams", fin?.teamResults?.length === 3, JSON.stringify(fin?.teamResults?.map((r) => [r.teamId, r.rank, r.score])));
  check("F every player scored their team's points", !!fin && seats.every((s) => fin.rawScores[s.playerId] === fin.teamResults.find((r) => r.teamId === teamOf(s))?.score));
  await soon("F phones: the results, a team-led heading and the team results card", async () => (await host.getByTestId("mz-sc-results").count()) === 1 && /A team game/i.test(await text(host.getByTestId("team-results"))) && /Split Clues/.test(await text(host.getByTestId("results-headline"))));
  await soon("F the TV leads with the team result", async () => (await tv.getByTestId("tv-team-results").count()) === 1 && /each team’s points/i.test(await text(tv.getByTestId("tv-team-results"))));
  await sleep(500);
  await shot(host, "results-390");
  await shot(pageOf[n.playerId], "results-320");
  await shot(tv, "tv-final-1920");
  check("F 320 px: the results have no sideways scroll", await noSideScroll(pageOf[n.playerId]));
  console.log(`note: teams ${teams.map((t) => `${t}=${seats.filter((s) => teamOf(s) === t).map((s) => nameOf[s.playerId]).join("+")}`).join(" ")}`);
} finally {
  await browser.close();
}
console.log(failures === 0 ? "SPLIT CLUES PASSED" : `SPLIT CLUES FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
