// Stage 12.14 (docs/stage12/stage1214.md): Know Your Rivals, on seven phones in three uneven teams and a TV.
//   A  the night's teams: Coral (Keku, Amina, Zawadi), Sun (Baraka, Wanjiru), Mint (Juma, Neema at 320 px); the
//      briefing; every phone and the TV show the same question; the TV counts answers, never what they are
//   B  answering on the phones: Keku picks one, then changes it; Neema says "Rather not say"; nobody else's phone, and
//      not the TV, ever gets another player's own answer; once everyone has answered, on to the guesses (early)
//   C  guessing together: Keku sets Sun's number on his phone, Amina sees "Set by Keku" and sets Mint's; Sun's phones
//      and the TV never see Coral's guesses; Zawadi locks them (the chips lock on every Coral phone); the TV shows
//      "Guesses locked"; once every team has locked, the reveal (early)
//   D  the reveal: each team's totals in words and bars (never who picked what), each team's guesses and points:
//      Coral 60, Sun 30, Mint 50 on the TV and the phones; the TV fits above its footer
//   E  round 2 over the API: Sun, alone in last place and 60+ behind, gets catch-up; its phones say so; round 3: Sun
//      scores and gets +15
//   F  rounds 4–6 over the API; results: six questions, the team results card, the TV final; 320 px; no answer of
//      anyone's left in any view
//   G  (Stage 12.15-R, D-S1215R-02) in round 4 everyone on Sun says "Rather not say": Sun's phones say it sits the
//      guessing out (no chips, no lock); Sun can't guess; the TV says "Sitting this one out"; Coral and Mint's locks
//      close the phase without Sun; the reveal says there were no guesses for or about Team Sun; Sun scores 0
// Usage: node scripts/check-know-your-rivals.mjs <baseUrl>   (the gate passes its server)
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
// The mouse is moved off the page first: a button under the last click would show its hover style.
const shot = async (page, name) => { await page.mouse.move(1, 1); await page.screenshot({ path: screenshotPath(`docs/stage12/stage1214-screenshots/${name}.png`) }); };
// Stage 12.15-R's screenshots (the round where a team sits the guessing out).
const shotR = async (page, name) => { await page.mouse.move(1, 1); await page.screenshot({ path: screenshotPath(`docs/stage12/stage1215r-screenshots/${name}.png`) }); };
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : "");
const tvFits = (tv) => tv.evaluate(() => {
  const foot = document.querySelector(".mz-tvshow-foot")?.getBoundingClientRect().top ?? innerHeight;
  const panel = document.querySelector("[data-testid='tv-live-know-your-rivals']");
  if (!panel) return { ok: false, why: "no panel" };
  const bottom = Math.max(...[...panel.querySelectorAll("li, h1, p")].map((e) => Math.round(e.getBoundingClientRect().bottom)));
  return { ok: bottom <= Math.round(foot), bottom, foot: Math.round(foot) };
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
  const names = ["Amina", "Zawadi", "Baraka", "Wanjiru", "Juma", "Neema"];
  const pages = [host];
  for (const n of names) { const p = await phone(n === "Neema" ? 320 : 390); await join(p, n, code); pages.push(p); }
  const tv = await tvPage(code);
  const seats = [];
  for (const p of pages) seats.push(await seatOf(p));
  const [k, a, z, b, w, j, n] = seats;
  const roomId = k.roomId;
  const pageOf = Object.fromEntries(seats.map((s, i) => [s.playerId, pages[i]]));
  const CORAL = "team-coral", SUN = "team-sun", MINT = "team-mint";
  await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "make", count: 3 } });
  for (const [s, team] of [[k, CORAL], [a, CORAL], [z, CORAL], [b, SUN], [w, SUN], [j, MINT], [n, MINT]]) await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "move", playerId: s.playerId, teamId: team } });
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: k.token, body: { gameId: "know-your-rivals", official: false } });
  await soon("A the briefing explains Know Your Rivals (private answers, team totals only)", async () => /Nobody sees your answer, not even your team/i.test(await host.locator("main").innerText()));
  await shot(pageOf[n.playerId], "briefing-320");
  for (const s of seats) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  const tvGame = async () => (await tvProj(roomId)).games.find((g) => g.id === gid);
  const viewOf = async (s) => (await myGame(roomId, s, gid)).state;
  const q0 = await until(async () => { const g = await tvGame(); return g?.status === "playing" && g.state.phase === "answer" ? g.state.question : null; });
  check("A the game is on question 1 with a two-choice question", !!q0?.prompt && !!q0?.a && !!q0?.b, JSON.stringify(q0));
  await soon("A every phone and the TV show the same question", async () => {
    const ps = []; for (const p of pages) ps.push(await text(p.getByTestId("mz-kyr-prompt")));
    return ps.every((x) => x === q0.prompt) && (await text(tv.getByTestId("tv-kyr-prompt"))) === q0.prompt;
  });
  await soon("A the TV counts the answers: 0 of 7", async () => /0 of 7 answered/.test(await text(tv.getByTestId("tv-kyr-progress"))));

  // ---- B ----
  await host.getByTestId("mz-kyr-a").click();
  await soon("B Keku's phone shows his own answer", async () => (await text(host.getByTestId("mz-kyr-mine"))).includes(`You said: ${q0.a}`) && (await host.getByTestId("mz-kyr-a").getAttribute("aria-pressed")) === "true");
  await host.getByTestId("mz-kyr-b").click();
  await soon("B Keku can change it before everyone has answered", async () => (await text(host.getByTestId("mz-kyr-mine"))).includes(`You said: ${q0.b}`));
  await pageOf[n.playerId].getByTestId("mz-kyr-pass").click();
  await soon("B Neema (320 px) says \"Rather not say\"", async () => /You said: rather not say/.test(await text(pageOf[n.playerId].getByTestId("mz-kyr-mine"))));
  await soon("B the TV counts 2 of 7, and its data has no player and no answer", async () => {
    const g = await tvGame();
    const json = JSON.stringify(g.state);
    return /2 of 7 answered/.test(await text(tv.getByTestId("tv-kyr-progress"))) && g.state.answered === 2 && !json.includes("myAnswer") && seats.every((s) => !json.includes(s.playerId));
  });
  await shot(host, "answer-390");
  await shot(pageOf[n.playerId], "answer-320");
  const av = await viewOf(a), zv = await viewOf(z), bv = await viewOf(b);
  check("B a teammate's phone (Amina, Zawadi) and a rival's (Baraka) never get Keku's answer", av.myAnswer === undefined && zv.myAnswer === undefined && bv.myAnswer === undefined && ![av, zv, bv].some((v) => JSON.stringify(v).includes(k.playerId)));
  check("B Keku's own phone has his answer", (await viewOf(k)).myAnswer === "b");
  // Coral: Keku b, Amina a, Zawadi a = 2 a, 1 b. Sun: Baraka a, Wanjiru b. Mint: Juma a, Neema "Rather not say".
  for (const [s, c] of [[a, "a"], [z, "a"], [b, "a"], [w, "b"]]) await intent(roomId, s, gid, "rivals-answer", { round: 0, choice: c });
  check("B with one still to answer, still answering", (await tvGame()).state.phase === "answer");
  await intent(roomId, j, gid, "rivals-answer", { round: 0, choice: "a" });
  await soon("B everyone has answered: on to the guesses, early", async () => (await tvGame()).state.phase === "guess");

  // ---- C ----
  await soon("C Keku's phone shows a row for each rival (Sun 0–2, Mint 0–1: only who answered)", async () =>
    (await host.locator("[data-testid^='mz-kyr-pick-team-sun-']").count()) === 3 && (await host.locator("[data-testid^='mz-kyr-pick-team-mint-']").count()) === 2 && (await host.getByTestId("mz-kyr-row-team-coral").count()) === 0);
  await host.getByTestId("mz-kyr-pick-team-sun-1").click();
  const amina = pageOf[a.playerId];
  await soon("C Amina's phone shows Coral's guess for Sun and who set it", async () => /Set by Keku/.test(await text(amina.getByTestId("mz-kyr-by-team-sun"))) && (await amina.getByTestId("mz-kyr-pick-team-sun-1").getAttribute("aria-pressed")) === "true");
  await soon("C Amina's phone says Mint is still to guess", async () => /Still to guess: Team Mint/.test(await text(amina.getByTestId("mz-kyr-missing"))));
  await shot(amina, "guess-390");
  await amina.getByTestId("mz-kyr-pick-team-mint-1").click();
  await soon("C Keku sees Amina's guess for Mint", async () => /Set by Amina/.test(await text(host.getByTestId("mz-kyr-by-team-mint"))));
  const sunView = await viewOf(b);
  const tvData = JSON.stringify((await tvGame()).state);
  check("C Sun's phones never get Coral's guesses; the TV's data has no guesses", JSON.stringify(sunView.teamGuesses ?? {}) === "{}" && !tvData.includes("teamGuesses") && !tvData.includes(a.playerId), JSON.stringify(sunView.teamGuesses));
  await pageOf[z.playerId].getByTestId("mz-kyr-lock").click();
  await soon("C Zawadi locked Coral's guesses: Keku's chips are locked and say who", async () => /Zawadi locked your team’s guesses/.test(await text(host.getByTestId("mz-kyr-locked"))) && await host.getByTestId("mz-kyr-pick-team-sun-0").isDisabled());
  await soon("C the TV shows Coral's guesses locked, and the others still guessing", async () => /Guesses locked/.test(await text(tv.getByTestId("tv-kyr-scores-team-coral"))) && /Guessing/.test(await text(tv.getByTestId("tv-kyr-scores-team-sun"))));
  await shot(tv, "tv-guess-1920");
  // Sun: Coral 2 (exact, 30), Mint 0 (1 off of 1: 0) = 30. Mint: Coral 3 (1 off of 3: 20), Sun 1 (exact, 30) = 50.
  for (const [s, target, value] of [[b, CORAL, 2], [w, MINT, 0], [j, CORAL, 3], [n, SUN, 1]]) await intent(roomId, s, gid, "rivals-guess", { round: 0, target, value });
  await intent(roomId, b, gid, "rivals-lock", { round: 0 });
  check("C with one team still guessing, still guessing", (await tvGame()).state.phase === "guess");
  await intent(roomId, j, gid, "rivals-lock", { round: 0 });
  await soon("C every team has locked: the reveal, early", async () => (await tvGame()).state.phase === "reveal");

  // ---- D ----
  const r0 = (await tvGame()).state.result;
  const ptsOf = (r, t) => { const p = r.points.find((x) => x.teamId === t); return p.points + p.bonus; };
  check("D the points: Coral 60, Sun 30, Mint 50", ptsOf(r0, CORAL) === 60 && ptsOf(r0, SUN) === 30 && ptsOf(r0, MINT) === 50, JSON.stringify(r0.points));
  check("D the totals are per team, never per player", JSON.stringify(r0.counts) === JSON.stringify([{ teamId: CORAL, answered: 3, a: 2, b: 1, passed: 0 }, { teamId: SUN, answered: 2, a: 1, b: 1, passed: 0 }, { teamId: MINT, answered: 1, a: 1, b: 0, passed: 1 }]) && seats.every((s) => !JSON.stringify(r0).includes(s.playerId)), JSON.stringify(r0.counts));
  await soon("D the TV shows each team's totals in words", async () =>
    (await text(tv.getByTestId(`tv-kyr-count-${CORAL}`))).includes(`2 ${q0.a} · 1 ${q0.b}`) && (await text(tv.getByTestId(`tv-kyr-count-${MINT}`))).includes(`1 ${q0.a} · 0 ${q0.b} · 1 rather not say`));
  await soon("D Keku's phone shows Coral's guesses and +60", async () => /you said 1, it was 1 of 2: \+30/.test(await text(host.getByTestId("mz-kyr-yours-team-sun"))) && /\+60 this round/.test(await text(host.getByTestId("mz-kyr-mine"))));
  await soon("D the scores: Coral 60, Sun 30, Mint 50 on the TV", async () => (await tv.getByTestId("tv-kyr-scores-team-coral").getAttribute("data-score")) === "60" && (await tv.getByTestId("tv-kyr-scores-team-mint").getAttribute("data-score")) === "50");
  await shot(host, "reveal-390");
  await shot(pageOf[n.playerId], "reveal-320");
  await shot(tv, "tv-reveal-1920");
  const fit = await tvFits(tv);
  check("D the TV fits above its footer (the reveal, three teams)", fit.ok, JSON.stringify(fit));

  // ---- E ----
  const roundOn = (r, phase = "answer") => until(async () => { const g = await tvGame(); return g.state.round === r && g.state.phase === phase ? g.state : null; }, 20000);
  // Answer, then guess (only `guessers` guess, every rival exactly), then everyone locks.
  const playRound = async (r, guessers, { sunPasses = false, beforeLocks } = {}) => {
    await roundOn(r);
    const picks = [[k, "a"], [a, "b"], [z, "a"], [b, sunPasses ? "pass" : "b"], [w, sunPasses ? "pass" : "b"], [j, "a"], [n, "b"]];
    for (const [s, c] of picks) await intent(roomId, s, gid, "rivals-answer", { round: r, choice: c });
    await roundOn(r, "guess");
    const exact = { [CORAL]: 2, [SUN]: 0, [MINT]: 1 };
    const inGuessing = sunPasses ? [CORAL, MINT] : [CORAL, SUN, MINT];
    for (const [s, team] of guessers) for (const t of inGuessing.filter((x) => x !== team)) await intent(roomId, s, gid, "rivals-guess", { round: r, target: t, value: exact[t] });
    if (beforeLocks) await beforeLocks();
    for (const s of sunPasses ? [k, j] : [k, b, j]) await intent(roomId, s, gid, "rivals-lock", { round: r });
    return roundOn(r, "reveal");
  };
  // Round 2: Coral and Mint guess both rivals exactly (+60 each); Sun guesses nothing. Totals 120 / 30 / 110.
  await playRound(1, [[k, CORAL], [j, MINT]]);
  const s2 = await roundOn(2);
  check("E Sun (alone in last place, 90 behind) is round 3's catch-up team", s2?.catchUp === SUN, JSON.stringify(s2?.teamTotals));
  await soon("E Sun's phones say so", async () => /Catch-up: \+15 if you score this round/.test(await text(pageOf[w.playerId].getByTestId(`mz-kyr-scores-${SUN}`))));
  await shot(pageOf[w.playerId], "catchup-390");
  // Round 3: only Sun guesses (exactly): +60, with +15 catch-up.
  const s3 = await playRound(2, [[b, SUN]]);
  const sunPts = s3?.result?.points.find((p) => p.teamId === SUN);
  check("E round 3: Sun scores 60 and gets the +15 catch-up", sunPts?.points === 60 && sunPts?.bonus === 15, JSON.stringify(s3?.result?.points));
  await soon("E Sun's phones show the catch-up in the round's points", async () => /\+75 this round \(with \+15 catch-up\)/.test(await text(pageOf[b.playerId].getByTestId("mz-kyr-mine"))));

  // ---- G ---- (round 4: Sun keeps its answers to itself)
  const sunPhone = pageOf[w.playerId];
  const s4 = await playRound(3, [[k, CORAL], [j, MINT]], { sunPasses: true, beforeLocks: async () => {
    await soon("G Sun's phone (Wanjiru) says Sun sits this round's guessing out, with no chips and no lock", async () =>
      (await sunPhone.getByTestId("mz-kyr-sitting-out").count()) === 1 && /sit out this round’s guessing/.test(await text(sunPhone.getByTestId("mz-kyr-sitout-note")))
      && (await sunPhone.locator("[data-testid^='mz-kyr-pick-']").count()) === 0 && (await sunPhone.getByTestId("mz-kyr-lock").count()) === 0);
    let refused;
    try { refused = (await intent(roomId, b, gid, "rivals-guess", { round: 3, target: CORAL, value: 2 })).accepted === false; } catch { refused = true; }
    check("G Sun's guess is refused (it sits this round out)", refused);
    await soon("G the TV shows Sun sitting this one out", async () => /Sitting this one out/.test(await text(tv.getByTestId(`tv-kyr-scores-${SUN}`))));
    await soon("G Coral's phone has no row of chips for Sun", async () => (await host.locator("[data-testid^='mz-kyr-pick-team-sun-']").count()) === 0 && /no guess this round/.test(await text(host.getByTestId("mz-kyr-row-team-sun"))));
    await shotR(sunPhone, "kyr-sitting-out-390");
  } });
  check("G Coral and Mint's locks closed the guessing without Sun", s4?.phase === "reveal");
  const p4 = Object.fromEntries((s4?.result?.points ?? []).map((p) => [p.teamId, p.points + p.bonus]));
  check("G round 4: Coral 30 and Mint 30 (each guessed the other exactly), Sun 0; no guess about or by Sun", p4[CORAL] === 30 && p4[MINT] === 30 && p4[SUN] === 0 && (s4?.result?.guesses ?? []).every((g) => g.teamId !== SUN && g.target !== SUN) && JSON.stringify(s4?.result?.sitOut) === JSON.stringify([SUN]), JSON.stringify(s4?.result));
  await soon("G the reveal says so, on Sun's phone and the TV", async () => /Team Sun said “Rather not say” this time, so there were no guesses for or about that team/.test(await text(sunPhone.getByTestId("mz-kyr-sitout"))) && /no guesses for or about that team/.test(await text(tv.getByTestId("tv-kyr-sitout"))));
  await shotR(tv, "kyr-tv-sitout-1920");

  // ---- F ----
  for (let r = 4; r < 6; r++) await playRound(r, [[k, CORAL], [b, SUN], [j, MINT]]);
  const fin = await until(async () => { const g = await tvGame(); return g.status === "finished" ? g : null; }, 30000);
  const teamOf = { [k.playerId]: CORAL, [a.playerId]: CORAL, [z.playerId]: CORAL, [b.playerId]: SUN, [w.playerId]: SUN, [j.playerId]: MINT, [n.playerId]: MINT };
  const score = (t) => fin?.teamResults?.find((r) => r.teamId === t)?.score;
  // Coral 60+60+0+30+120 = 270; Sun 30+0+75+0+120 = 225; Mint 50+60+0+30+120 = 260.
  check("F the game finished: Coral 270, Mint 260, Sun 225", score(CORAL) === 270 && score(MINT) === 260 && score(SUN) === 225, JSON.stringify(fin?.teamResults?.map((r) => [r.teamId, r.rank, r.score])));
  check("F every player scored their team's points", !!fin && seats.every((s) => fin.rawScores[s.playerId] === fin.teamResults.find((r) => r.teamId === teamOf[s.playerId])?.score));
  check("F nobody's own answer is left in any view at the end", !JSON.stringify(fin.state).includes("myAnswer") && !(await viewOf(k)).myAnswer && seats.every((s) => !JSON.stringify(fin.state).includes(s.playerId)));
  await soon("F phones: the results, six questions and the team results card", async () => (await host.getByTestId("mz-kyr-results").count()) === 1 && (await host.getByTestId("mz-kyr-recap-round").count()) === 6 && /A team game/i.test(await text(host.getByTestId("team-results"))));
  await soon("F the TV leads with the team result", async () => (await tv.getByTestId("tv-team-results").count()) === 1);
  await sleep(500);
  await shot(host, "results-390");
  await shot(pageOf[n.playerId], "results-320");
  await shot(tv, "tv-final-1920");
  check("F 320 px: the results have no sideways scroll", await noSideScroll(pageOf[n.playerId]));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "KNOW YOUR RIVALS PASSED" : `KNOW YOUR RIVALS FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
