// Stage 12.12 (docs/stage12/stage1212.md): Territory, on eight phones in four teams and a TV.
//   A  the night's teams: Coral (Keku, Amina), Sun (Baraka, Wanjiru), Mint (Juma, Neema at 320 px), Iris (Imani,
//      Musa); the briefing; four homes on the board; the TV's four-team scoreboard
//   B  one tap answers for the team (on a phone): teammates see who answered and what; other teams and the TV only see
//      "Answered", and no screen or data has the right answer before the question closes
//   C  the claim: Coral and Sun both pick A2 (next to both homes). Coral answered first and gets it; Sun's claim moves to
//      the nearest free cell. Picks stay hidden until the round ends; a wrong team claims nothing
//   D  a steal on a phone (Coral takes Sun's cell)
//   E  catch-up: Iris alone in last place and 30+ behind gets an extra cell when right
//   F  the rest over the API; results: the final board, the recap, the team results card, the TV final; 320 px; the TV
//      fits above its footer
// Right answers come from the content packs on disk (scripts/lib/content-oracle.mjs), matched by the prompt shown.
// Usage: node scripts/check-territory.mjs <baseUrl>   (the gate passes its server)
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { PROTOCOL_HEADERS } from "./lib/protocol.mjs";
import { optionIndex } from "./lib/content-oracle.mjs";

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
// The mouse is moved off the page first: a cell under the last click would show its hover outline.
const shot = async (page, name) => { await page.mouse.move(1, 1); await page.screenshot({ path: screenshotPath(`docs/stage12/stage1212-screenshots/${name}.png`) }); };
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : "");
/** Everything in the TV's game panel is above its footer. */
const tvFits = (tv) => tv.evaluate(() => {
  const foot = document.querySelector(".mz-tvshow-foot")?.getBoundingClientRect().top ?? innerHeight;
  const panel = document.querySelector("[data-testid='tv-live-territory']");
  if (!panel) return { ok: false, why: "no panel" };
  const bottoms = [...panel.querySelectorAll("svg, li, h1, p")].map((e) => Math.round(e.getBoundingClientRect().bottom));
  const right = Math.max(...[...panel.querySelectorAll("*")].map((e) => Math.round(e.getBoundingClientRect().right)));
  return { ok: Math.max(...bottoms) <= Math.round(foot) && right <= innerWidth, bottom: Math.max(...bottoms), foot: Math.round(foot), right };
});

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
  const names = ["Amina", "Baraka", "Wanjiru", "Juma", "Neema", "Imani", "Musa"];
  const pages = [host];
  for (const n of names) { const p = await phone(n === "Neema" ? 320 : 390); await join(p, n, code); pages.push(p); }
  const tv = await tvPage(code);
  const seats = [];
  for (const p of pages) seats.push(await seatOf(p));
  const [k, a, b, w, j, n, im, mu] = seats;
  const roomId = k.roomId;
  const pageOf = Object.fromEntries(seats.map((s, i) => [s.playerId, pages[i]]));
  await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "make", count: 4 } });
  for (const [s, team] of [[k, "team-coral"], [a, "team-coral"], [b, "team-sun"], [w, "team-sun"], [j, "team-mint"], [n, "team-mint"], [im, "team-iris"], [mu, "team-iris"]]) await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "move", playerId: s.playerId, teamId: team } });
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: k.token, body: { gameId: "territory", official: false } });
  await soon("A the briefing explains Territory", async () => /One tap answers for your whole team/.test(await host.locator("main").innerText()));
  await shot(pageOf[n.playerId], "briefing-320");
  for (const s of seats) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  await soon("A the TV shows a four-team scoreboard", async () => (await tv.getByTestId("tv-tt-scores").getAttribute("data-teams")) === "4");
  const homes = { "team-coral": 0, "team-sun": 2, "team-mint": 18, "team-iris": 16 };
  await soon("A each team starts on its home corner (A1, A3, E3, E1)", async () => {
    for (const [t, c] of Object.entries(homes)) if ((await tv.getByTestId(`tv-tt-board-cell-${c}`).getAttribute("data-owner")) !== t) return false;
    return (await tv.locator("[data-testid^='tv-tt-board-cell-'][data-owner='']").count()) === 15;
  });
  const tvGame = async () => (await tvProj(roomId)).games.find((g) => g.id === gid);
  const stateAt = (round, phase) => until(async () => { const g = await tvGame(); return g.state.round === round && g.state.phase === phase ? g.state : null; }, 30000);

  // ---- B ----
  const q0 = await stateAt(0, "question");
  check("B question 1 is on the TV", !!q0?.question?.prompt);
  const r0 = optionIndex("trivia", q0.question.prompt, q0.question.options);
  await soon("B every phone shows the same question", async () => { for (const p of pages) if ((await text(p.getByTestId("mz-tt-prompt"))) !== q0.question.prompt) return false; return true; });
  await host.getByTestId(`mz-tt-opt-${r0}`).click();
  await soon("B a teammate sees who answered for the team, and can't answer again", async () => /You answered|Keku answered for your team/.test(await text(pageOf[a.playerId].getByTestId("mz-tt-status"))) && await pageOf[a.playerId].getByTestId("mz-tt-opt-0").isDisabled());
  check("B another team's phone doesn't show it", !/answered for your team/.test(await text(pageOf[b.playerId].getByTestId("mz-tt-status"))) && !(await pageOf[b.playerId].getByTestId("mz-tt-opt-0").isDisabled()));
  await soon("B the TV shows Coral has answered, not what", async () => /✓ Answered/.test(await text(tv.getByTestId("tv-tt-scores-team-coral"))));
  const tvData = JSON.stringify((await tvGame()).state);
  check("B no right answer and no team's choice in the TV's data or another team's", !tvData.includes("correctIndex") && !tvData.includes("\"choice\"") && !JSON.stringify((await myGame(roomId, b, gid)).state).includes("\"choice\""));
  await shot(pageOf[a.playerId], "question-390");
  await shot(tv, "tv-question-1920");
  const fitQ = await tvFits(tv);
  check("B the TV fits above its footer (question)", fitQ.ok, JSON.stringify(fitQ));
  await sleep(400);
  await intent(roomId, b, gid, "territory-answer", { round: 0, choice: r0 }); // Sun right, after Coral
  await intent(roomId, j, gid, "territory-answer", { round: 0, choice: (r0 + 1) % 4 }); // Mint wrong
  await intent(roomId, im, gid, "territory-answer", { round: 0, choice: (r0 + 2) % 4 }); // Iris wrong

  // ---- C ----
  const c0 = await stateAt(0, "claim");
  check("C the question closed early once every team answered", !!c0 && c0.correctIndex === r0 && JSON.stringify(c0.order) === JSON.stringify(["team-coral", "team-sun"]), JSON.stringify(c0?.order));
  await soon("C Coral's phone offers the three cells next to its home", async () => (await host.locator("[data-testid='mz-tt-board'] .is-claimable").count()) === 3);
  await soon("C a wrong team's phone says so", async () => /Not this time/.test(await text(pageOf[j.playerId].getByTestId("mz-tt-status"))));
  await shot(host, "claim-390");
  await host.getByTestId("mz-tt-board-cell-1").click(); // A2
  await soon("C Coral's pick shows on its phones", async () => /picked A2/.test(await text(pageOf[a.playerId].getByTestId("mz-tt-status"))));
  check("C picks stay hidden: other teams' phones and the TV don't show Coral's", !(await pageOf[b.playerId].locator(".is-picked").count()) && !(await pageOf[j.playerId].locator(".is-picked").count()) && (await tv.getByTestId("tv-tt-board-cell-1").getAttribute("data-owner")) === "" && !JSON.stringify((await tvGame()).state).includes("teamPick") && !JSON.stringify((await myGame(roomId, b, gid)).state).includes("teamPick"));
  await intent(roomId, w, gid, "territory-claim", { round: 0, cell: 1 }); // Sun wants A2 too
  await soon("C Sun's phones show Sun's own pick", async () => /picked A2/.test(await text(pageOf[b.playerId].getByTestId("mz-tt-status"))));
  await soon("C the TV shows the answer and who's picking", async () => /Team Coral, Team Sun got it/.test(await text(tv.getByTestId("tv-tt-claiming"))));
  await shot(tv, "tv-claim-1920");
  const fitC = await tvFits(tv);
  check("C the TV fits above its footer (claim)", fitC.ok, JSON.stringify(fitC));
  const q1 = await stateAt(1, "question");
  const last0 = q1?.lastClaims ?? [];
  check("C A2 went to Coral (answered first); Sun's claim moved to B3, the nearest free cell", JSON.stringify(last0.map((c) => [c.teamId, c.cell, c.auto, c.wanted ?? null])) === JSON.stringify([["team-coral", 1, false, null], ["team-sun", 5, true, 1]]), JSON.stringify(last0));
  await soon("C the board and the last-round line on the TV and phones", async () => (await tv.getByTestId("tv-tt-board-cell-1").getAttribute("data-owner")) === "team-coral" && /Team Sun got B3 \(A2 went to a faster team\)/.test(await text(tv.getByTestId("tv-tt-last"))) && /Team Coral got A2/.test(await text(pageOf[b.playerId].getByTestId("mz-tt-last"))));
  await shot(pageOf[b.playerId], "last-round-390");

  // ---- D ----
  const r1 = optionIndex("trivia", q1.question.prompt, q1.question.options);
  await pageOf[a.playerId].getByTestId(`mz-tt-opt-${r1}`).click();
  for (const s of [b, j, im]) await intent(roomId, s, gid, "territory-answer", { round: 1, choice: (r1 + 1) % 4 });
  await stateAt(1, "claim");
  await soon("D Coral may steal Sun's B3", async () => (await pageOf[a.playerId].locator("[data-testid='mz-tt-board-cell-5'].is-claimable").count()) === 1);
  await pageOf[a.playerId].getByTestId("mz-tt-board-cell-5").click();
  await soon("D the steal is picked", async () => /picked B3/.test(await text(pageOf[a.playerId].getByTestId("mz-tt-status"))));
  await shot(pageOf[a.playerId], "steal-390");
  const q2 = await stateAt(2, "question");
  check("D Coral took B3 from Sun", (q2?.lastClaims ?? []).some((c) => c.teamId === "team-coral" && c.cell === 5 && c.from === "team-sun"), JSON.stringify(q2?.lastClaims));
  await soon("D the TV says so", async () => /Team Coral took B3 from Team Sun/.test(await text(tv.getByTestId("tv-tt-last"))));
  await shot(tv, "tv-board-1920");

  // ---- E ----
  // Round 3: Sun and Mint right (Coral and Iris wrong), so Iris is alone in last place, 30 behind Coral.
  const r2 = optionIndex("trivia", q2.question.prompt, q2.question.options);
  for (const [s, ok] of [[k, false], [b, true], [j, true], [im, false]]) await intent(roomId, s, gid, "territory-answer", { round: 2, choice: ok ? r2 : (r2 + 1) % 4 });
  const q3 = await stateAt(3, "question");
  check("E Iris is the catch-up team", q3?.catchUp === "team-iris", JSON.stringify(q3?.teamTotals));
  const r3 = optionIndex("trivia", q3.question.prompt, q3.question.options);
  for (const [s, ok] of [[k, false], [b, false], [j, false], [im, true]]) await intent(roomId, s, gid, "territory-answer", { round: 3, choice: ok ? r3 : (r3 + 1) % 4 });
  await stateAt(3, "claim");
  await soon("E Iris's phone says it gets an extra cell", async () => /extra cell/.test(await text(pageOf[mu.playerId].getByTestId("mz-tt-catchup"))));
  await shot(pageOf[mu.playerId], "catchup-390");
  const q4 = await stateAt(4, "question");
  const irisClaims = (q4?.lastClaims ?? []).filter((c) => c.teamId === "team-iris");
  check("E Iris got two cells, one the catch-up extra", irisClaims.length === 2 && irisClaims.some((c) => c.extra), JSON.stringify(irisClaims));

  // ---- F ----
  for (let round = 4; round < 8; round++) {
    const st = await stateAt(round, "question");
    if (!st) { check(`F question ${round + 1} began`, false); break; }
    const r = optionIndex("trivia", st.question.prompt, st.question.options);
    for (const [s, ok] of [[k, true], [b, round % 2 === 0], [j, false], [im, false]]) await intent(roomId, s, gid, "territory-answer", { round, choice: ok ? r : (r + 1) % 4 });
  }
  const fin = await until(async () => { const g = await tvGame(); return g.status === "finished" ? g : null; }, 40000);
  const teamOf = (s) => ({ [k.playerId]: "team-coral", [a.playerId]: "team-coral", [b.playerId]: "team-sun", [w.playerId]: "team-sun", [j.playerId]: "team-mint", [n.playerId]: "team-mint", [im.playerId]: "team-iris", [mu.playerId]: "team-iris" })[s.playerId];
  check("F the game finished with team results for four teams", fin?.teamResults?.length === 4, JSON.stringify(fin?.teamResults?.map((r) => [r.teamId, r.rank, r.score])));
  check("F every player scored their team's points", !!fin && seats.every((s) => fin.rawScores[s.playerId] === fin.teamResults.find((r) => r.teamId === teamOf(s))?.score));
  await soon("F phones: the results, the final board, eight rounds and the team results card", async () => (await host.getByTestId("mz-tt-results").count()) === 1 && (await host.getByTestId("mz-tt-final-board").count()) === 1 && (await host.getByTestId("mz-tt-recap-round").count()) === 8 && /A team game/i.test(await text(host.getByTestId("team-results"))));
  await soon("F the TV leads with the team result", async () => (await tv.getByTestId("tv-team-results").count()) === 1);
  await sleep(500);
  await shot(host, "results-390");
  await shot(pageOf[n.playerId], "results-320");
  await shot(tv, "tv-final-1920");
  check("F 320 px: the results have no sideways scroll", await noSideScroll(pageOf[n.playerId]));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "TERRITORY PASSED" : `TERRITORY FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
