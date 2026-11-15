// Stage 12.11 (docs/stage12/stage1211.md): Team Draw, on nine phones and a TV.
//   A  the night's teams: Coral (Keku, Amina, Zawadi), Sun (Baraka, Wanjiru), Mint (Juma, Neema at 320 px), Iris
//      (Imani, Musa); 3 rounds (the biggest team's size); the briefing; the TV's four-team scoreboard (2 x 2)
//   B  the word is on each team's drawer's phone only; guessers, the TV and its data never get it
//   C  pass the pen (Coral, a team of 3): the next drawer gets the word, the passer can't guess; a team of 2 can't pass
//   D  drawing with a mouse reaches the team's own guessers (the server's signature), never another team or the TV,
//      which shows "1 stroke"; a team can't guess before its drawer has drawn
//   E  a wrong guess: shown in the team, the team's box pauses 2 s; never on another team's phone or the TV
//   F  solve order 1-2-3-4 (100/75/55/40), a phone guess included; the reveal's gallery: every team's drawing, phones +
//      TV, and on the TV (4 in a row) every team's name and result above the footer
//   G  round 2: a drawer who draws nothing for 20 s; a teammate takes the pen on the phone and keeps going; a team of 2
//      is never offered it
//   H  round 3 over the API; results: the team results card, the recap, the TV final; 320 px
// Usage: node scripts/check-team-draw.mjs <baseUrl>   (the gate passes its server)
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
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage1211-screenshots/${name}.png`) });
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : "");
/** The board's signature as the screen shows it, and the server's for the same pieces (pieces:points). */
const sigOf = (pieces) => `${(pieces ?? []).length}:${(pieces ?? []).reduce((n, x) => n + x.p.length / 2, 0)}`;
const LINE = (n) => ({ pieces: [{ s: n, c: 1, w: 1, p: [120, 200, 500, 520, 880, 300] }] });

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
/** A mouse stroke across the drawer's pad. */
async function stroke(p, from = [0.2, 0.3], to = [0.8, 0.7]) {
  const box = await p.getByTestId("mz-dg-board").boundingBox();
  const at = ([fx, fy]) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const a = at(from), b = at(to);
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  await p.mouse.move(b.x, b.y, { steps: 12 });
  await p.mouse.up();
}

const browser = await launchChromium();
try {
  // ---- A ----
  const host = await phone();
  const code = await hostRoom(host, "Keku");
  const names = ["Amina", "Zawadi", "Baraka", "Wanjiru", "Juma", "Neema", "Imani", "Musa"];
  const pages = [host];
  for (const n of names) { const p = await phone(n === "Neema" ? 320 : 390); await join(p, n, code); pages.push(p); }
  const tv = await tvPage(code);
  const seats = [];
  for (const p of pages) seats.push(await seatOf(p));
  const [k, a, z, b, w, j, n, im, mu] = seats;
  const roomId = k.roomId;
  const pageOf = Object.fromEntries(seats.map((s, i) => [s.playerId, pages[i]]));
  const nameOf = Object.fromEntries(seats.map((s, i) => [s.playerId, ["Keku", ...names][i]]));
  await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "make", count: 4 } });
  for (const [s, team] of [[k, "team-coral"], [a, "team-coral"], [z, "team-coral"], [b, "team-sun"], [w, "team-sun"], [j, "team-mint"], [n, "team-mint"], [im, "team-iris"], [mu, "team-iris"]]) await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "move", playerId: s.playerId, teamId: team } });
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: k.token, body: { gameId: "team-draw", official: false } });
  const g0 = (await tvProj(roomId)).games.find((g) => g.id === gid);
  check("A the game plays with the night's four teams", g0?.teams?.list?.length === 4 && !(g0.teams.moved ?? []).length);
  await soon("A the briefing explains Team Draw", async () => /Every team draws the same word at once/.test(await host.locator("main").innerText()));
  await shot(pageOf[n.playerId], "briefing-320");
  for (const s of seats) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  await soon("A the TV shows a four-team scoreboard", async () => (await tv.getByTestId("tv-td-scores").getAttribute("data-teams")) === "4");
  const teamOf = (s) => g0.teams.members[s.playerId];
  const TEAMS = ["team-coral", "team-sun", "team-mint", "team-iris"];
  const viewOf = async (s) => (await myGame(roomId, s, gid)).state;
  const st0 = await until(async () => { const v = await viewOf(k); return v.phase === "draw" && v.drawerId ? v : null; }, 15000);
  check("A three rounds: the biggest team's size", st0?.roundCount === 3, String(st0?.roundCount));

  // ---- B ----
  const drawerOf = async (team) => { for (const s of seats.filter((x) => teamOf(x) === team)) { const v = await viewOf(s); if (v.amDrawing) return { seat: s, word: v.myWord }; } return null; };
  const d0 = {};
  for (const t of TEAMS) d0[t] = await drawerOf(t);
  const word0 = d0["team-coral"]?.word;
  check("B every team has a drawer with the same word", TEAMS.every((t) => d0[t]?.word && d0[t].word === word0), JSON.stringify(Object.fromEntries(TEAMS.map((t) => [t, d0[t]?.word]))));
  const wordRe = new RegExp(`\\b${(word0 ?? "?").replace(/[^a-z ]/gi, "").replace(/ /g, "\\s+")}\\b`, "i");
  // Stage 12.15 (a false positive in the full gate 20261115-001634-f52309c4-21676): the word can be a team's name or
  // colour ("sun" and Team Sun). Every phone and the TV name the teams, and the TV's data has each team's colour, so
  // both are scrubbed before looking for the word. The self-check below is that run's case.
  const scrubText = (t) => t.replace(/\bTeam (Coral|Sun|Mint|Iris)\b/gi, "Team ·");
  const scrubData = (j) => j.replace(/"color":"(coral|sun|mint|iris)"/gi, '"color":"·"');
  {
    const sunRe = /\bsun\b/i;
    check("B self-check: a team's name or colour is not the word", sunRe.test("Team Sun · 0") && !sunRe.test(scrubText("Team Sun · 0")) && sunRe.test("Draw: sun") && sunRe.test(scrubText("Draw: sun"))
      && JSON.stringify({ color: "sun" }).toLowerCase().includes('"sun"') && !scrubData(JSON.stringify({ color: "sun" })).toLowerCase().includes('"sun"'));
  }
  let phonesRight = true;
  for (const s of seats) {
    const p = pageOf[s.playerId];
    const isDrawer = TEAMS.some((t) => d0[t]?.seat.playerId === s.playerId);
    await until(async () => (await p.getByTestId(isDrawer ? "mz-td-draw" : "mz-td-guess").count()) === 1, 10000);
    const shown = scrubText(await p.locator("main").innerText());
    if (isDrawer !== wordRe.test(shown)) { phonesRight = false; console.log(`  ${nameOf[s.playerId]} drawer=${isDrawer} shows word=${wordRe.test(shown)}`); }
  }
  check("B only the drawers' phones show the word", phonesRight);
  const tvData0 = scrubData(JSON.stringify((await tvProj(roomId)).games.find((g) => g.id === gid).state));
  check("B the TV shows no word and its data has neither the word nor any drawing", !wordRe.test(scrubText(await tv.locator("body").innerText())) && !tvData0.toLowerCase().includes(`"${(word0 ?? "?").toLowerCase()}"`) && !tvData0.includes("\"pieces\""));
  await shot(tv, "tv-draw-1920");

  // ---- C ----
  const coral0 = d0["team-coral"].seat;
  const coralPage0 = pageOf[coral0.playerId];
  const passBtn = coralPage0.getByTestId("mz-td-pass");
  await soon("C Coral's drawer is offered to pass the pen", async () => /Pass the pen to/.test(await text(passBtn)));
  check("C a team of 2 is not offered a pass", (await pageOf[d0["team-sun"].seat.playerId].getByTestId("mz-td-pass").count()) === 0);
  await passBtn.click();
  const coral1 = await until(async () => { const d = await drawerOf("team-coral"); return d && d.seat.playerId !== coral0.playerId ? d.seat : null; }, 10000);
  check("C the pen moved to a Coral teammate", !!coral1, coral1 ? nameOf[coral1.playerId] : "");
  const coralPage1 = pageOf[coral1?.playerId];
  await soon("C the new drawer's phone shows the word", async () => wordRe.test(await text(coralPage1.getByTestId("mz-td-word"))));
  await soon("C the passer can't guess: they've seen the word", async () => /seen the word/.test(await text(coralPage0.getByTestId("mz-td-status"))) && (await coralPage0.getByTestId("mz-td-input").count()) === 0);
  await soon("C the team hears who has the pen", async () => /passed the pen to/.test(await text(coralPage1.getByTestId("mz-td-handoff"))));
  await shot(coralPage0, "passed-390");
  const coralGuesser = seats.find((s) => teamOf(s) === "team-coral" && s.playerId !== coral0.playerId && s.playerId !== coral1?.playerId);
  const guessPage = pageOf[coralGuesser.playerId];

  // ---- D ----
  check("D a team can't guess before its drawer draws", await guessPage.getByTestId("mz-td-input").isDisabled());
  await stroke(coralPage1);
  await stroke(coralPage1, [0.3, 0.8], [0.7, 0.2]);
  const coralPieces = await until(async () => { const v = await viewOf(coralGuesser); return (v.pieces ?? []).length >= 2 ? v.pieces : null; }, 10000);
  check("D the mouse strokes reached the server", !!coralPieces);
  await soon("D Coral's guesser sees exactly the server's drawing", async () => (await guessPage.getByTestId("mz-td-board").getAttribute("data-sig")) === sigOf((await viewOf(coralGuesser)).pieces));
  const sunGuesser = seats.find((s) => teamOf(s) === "team-sun" && s.playerId !== d0["team-sun"].seat.playerId);
  check("D another team's guesser sees an empty page (its own team's)", (await pageOf[sunGuesser.playerId].getByTestId("mz-td-board").getAttribute("data-sig")) === "0:0");
  await soon("D the TV shows Coral's strokes as a count only", async () => /drawing · 2 strokes/.test(await text(tv.getByTestId("tv-td-scores-team-coral"))) && (await tv.getByTestId("tv-live-team-draw").locator(".mz-dg-board").count()) === 0);
  await shot(coralPage1, "drawer-390");
  await shot(guessPage, "guesser-390");

  // ---- E ----
  await soon("E the guess box opens once there's a drawing", async () => !(await guessPage.getByTestId("mz-td-input").isDisabled()));
  await guessPage.getByTestId("mz-td-input").fill("definitely-not-it");
  await guessPage.getByTestId("mz-td-send").click();
  await soon("E the team's box pauses", async () => /guess again in \d s/.test(await text(guessPage.getByTestId("mz-td-locked"))));
  await soon("E the drawer and the passer see the wrong guess", async () => /definitely-not-it/.test(await text(coralPage1.getByTestId("mz-td-guesses"))) && /definitely-not-it/.test(await text(coralPage0.getByTestId("mz-td-guesses"))));
  check("E no other team's phone and not the TV shows it", !(await pageOf[sunGuesser.playerId].locator("main").innerText()).includes("definitely-not-it") && !(await tv.locator("body").innerText()).includes("definitely-not-it") && !JSON.stringify(await tvProj(roomId)).includes("definitely-not-it"));
  await shot(guessPage, "wrong-guess-390");
  await soon("E the pause ends by itself", async () => !(await guessPage.getByTestId("mz-td-input").isDisabled()), 6000);

  // ---- F ----
  // Coral's drawing is finished: its guesser's screen shows exactly what the server has (the gallery is checked against it).
  const coralFinal = sigOf((await viewOf(coralGuesser)).pieces);
  await soon("F Coral's guesser shows the finished drawing", async () => (await guessPage.getByTestId("mz-td-board").getAttribute("data-sig")) === coralFinal);
  for (const t of ["team-mint", "team-sun", "team-iris"]) await intent(roomId, d0[t].seat, gid, "team-draw-strokes", { round: 0, ...LINE(1) });
  const mintGuesser = seats.find((s) => teamOf(s) === "team-mint" && s.playerId !== d0["team-mint"].seat.playerId);
  await intent(roomId, mintGuesser, gid, "team-draw-guess", { round: 0, text: word0 });
  await guessPage.getByTestId("mz-td-input").fill(word0.toUpperCase());
  await guessPage.getByTestId("mz-td-send").click();
  await soon("F Coral got it 2nd, on the phone", async () => /got it, 2nd/.test(await text(guessPage.getByTestId("mz-td-status"))));
  await intent(roomId, sunGuesser, gid, "team-draw-guess", { round: 0, text: word0 });
  await intent(roomId, seats.find((s) => teamOf(s) === "team-iris" && s.playerId !== d0["team-iris"].seat.playerId), gid, "team-draw-guess", { round: 0, text: word0 });
  const rev = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === gid); return g.state.phase === "reveal" ? g.state.result : null; }, 10000);
  const pts = Object.fromEntries((rev?.teams ?? []).map((t) => [t.teamId, [t.place, t.points]]));
  check("F places 1, 2, 3, 4 by solve order, 100 / 75 / 55 / 40", JSON.stringify(["team-mint", "team-coral", "team-sun", "team-iris"].map((t) => pts[t])) === JSON.stringify([[1, 100], [2, 75], [3, 55], [4, 40]]), JSON.stringify(pts));
  await soon("F the reveal on a phone: the word and every team's drawing", async () => wordRe.test(await text(host.getByTestId("mz-td-answer"))) && (await host.getByTestId("mz-td-gallery").locator(".mz-dg-board").count()) === 4);
  check("F Coral's drawing in the gallery is the drawing its guessers saw", (await host.getByTestId("mz-td-gallery-board-team-coral").getAttribute("data-sig")) === coralFinal, coralFinal);
  await soon("F the reveal on the TV: the word, four drawings, each team's result", async () => wordRe.test(await text(tv.getByTestId("tv-td-answer"))) && (await tv.getByTestId("tv-td-gallery").locator(".mz-dg-board").count()) === 4 && /got it 1st/.test(await text(tv.getByTestId("tv-td-gallery-team-mint"))));
  // Every team's name and result stay on screen, above the TV's footer (12.11's first run: they were under it).
  const fits = await tv.evaluate(() => {
    const foot = document.querySelector(".mz-tvshow-privacy")?.closest("footer, div")?.getBoundingClientRect().top ?? window.innerHeight;
    return [...document.querySelectorAll("[data-testid='tv-td-gallery'] .mz-td-gallery__text")].map((el) => Math.round(el.getBoundingClientRect().bottom) <= Math.round(foot));
  });
  check("F the TV's gallery fits: every team's line is above the footer", fits.length === 4 && fits.every(Boolean), JSON.stringify(fits));
  await shot(host, "reveal-390");
  await shot(tv, "tv-reveal-1920");

  // ---- G ----
  const st1 = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === gid); return g.state.phase === "draw" && g.state.round === 1 ? g.state : null; }, 20000);
  check("G round 2 began", !!st1);
  const idle = await drawerOf("team-coral");
  const taker = seats.find((s) => teamOf(s) === "team-coral" && s.playerId !== idle.seat.playerId);
  const takerPage = pageOf[taker.playerId];
  check("G no take-over before 20 s", (await takerPage.getByTestId("mz-td-takeover").count()) === 0);
  const takeBtn = await soon("G after 20 s without drawing, a teammate is offered the pen", async () => ((await takerPage.getByTestId("mz-td-takeover").count()) ? takerPage.getByTestId("mz-td-takeover") : null), 30000);
  const sun2 = seats.find((s) => teamOf(s) === "team-sun" && s.playerId !== (st1?.teamStatus ?? []).find((x) => x.teamId === "team-sun")?.drawerId);
  check("G a team of 2 is never offered it", (await pageOf[sun2.playerId].getByTestId("mz-td-takeover").count()) === 0);
  await shot(takerPage, "takeover-offer-390");
  await takeBtn?.click();
  await soon("G the taker's phone now draws, with the word", async () => (await takerPage.getByTestId("mz-td-draw").count()) === 1 && /^Draw: \S/.test(await text(takerPage.getByTestId("mz-td-word"))));
  await soon("G the idle drawer hears it and can't guess", async () => /took the pen from you/.test(await text(pageOf[idle.seat.playerId].getByTestId("mz-td-handoff"))) && /seen the word/.test(await text(pageOf[idle.seat.playerId].getByTestId("mz-td-status"))));
  await stroke(takerPage);
  await soon("G the taker's drawing reaches the server", async () => ((await viewOf(taker)).pieces ?? []).length >= 1);
  await shot(takerPage, "took-pen-390");
  const word1 = (await viewOf(taker)).myWord;
  for (const t of TEAMS) {
    const d = await drawerOf(t);
    if (t !== "team-coral") await intent(roomId, d.seat, gid, "team-draw-strokes", { round: 1, ...LINE(1) });
    const g = seats.find((s) => teamOf(s) === t && !(st1.teamStatus ?? []).some((x) => x.drawerId === s.playerId) && s.playerId !== taker.playerId && s.playerId !== d.seat.playerId);
    await intent(roomId, g, gid, "team-draw-guess", { round: 1, text: word1 });
  }

  // ---- H ----
  const st2 = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === gid); return g.state.phase === "draw" && g.state.round === 2 ? g.state : null; }, 30000);
  check("H round 3 began", !!st2);
  for (const t of TEAMS) {
    const d = await drawerOf(t);
    await intent(roomId, d.seat, gid, "team-draw-strokes", { round: 2, ...LINE(1) });
    const g = seats.find((s) => teamOf(s) === t && s.playerId !== d.seat.playerId);
    await intent(roomId, g, gid, "team-draw-guess", { round: 2, text: d.word });
  }
  const fin = await until(async () => { const g = (await tvProj(roomId)).games.find((x) => x.id === gid); return g.status === "finished" ? g : null; }, 30000);
  check("H the game finished with team results for four teams", fin?.teamResults?.length === 4, JSON.stringify(fin?.teamResults?.map((r) => [r.teamId, r.rank, r.score])));
  check("H every player scored their team's points", !!fin && seats.every((s) => fin.rawScores[s.playerId] === fin.teamResults.find((r) => r.teamId === teamOf(s))?.score));
  check("H no drawing and no wrong guess is kept once the game is over", !!fin && !JSON.stringify(fin.state).includes("\"pieces\"") && !JSON.stringify(await myGame(roomId, coral0, gid)).includes("definitely-not-it"));
  await soon("H phones: the results, a team-led heading, the team results card and three rounds", async () => (await host.getByTestId("mz-td-results").count()) === 1 && /A team game/i.test(await text(host.getByTestId("team-results"))) && /Team Draw/.test(await text(host.getByTestId("results-headline"))) && (await host.getByTestId("mz-td-recap-round").count()) === 3);
  await soon("H the TV leads with the team result", async () => (await tv.getByTestId("tv-team-results").count()) === 1 && /each team’s points/i.test(await text(tv.getByTestId("tv-team-results"))));
  await sleep(500);
  await shot(host, "results-390");
  await shot(pageOf[n.playerId], "results-320");
  await shot(tv, "tv-final-1920");
  check("H 320 px: the results have no sideways scroll", await noSideScroll(pageOf[n.playerId]));
  console.log(`note: words ${word0} / ${word1}; teams ${TEAMS.map((t) => `${t}=${seats.filter((s) => teamOf(s) === t).map((s) => nameOf[s.playerId]).join("+")}`).join(" ")}`);
} finally {
  await browser.close();
}
console.log(failures === 0 ? "TEAM DRAW PASSED" : `TEAM DRAW FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
