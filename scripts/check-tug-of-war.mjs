// Stage 12.13 (docs/stage12/stage1213.md): Tug of War, on seven phones in three uneven teams and a TV.
//   A  the night's teams: Coral (Keku, Amina, Zawadi), Sun (Baraka, Wanjiru), Mint (Juma, Neema at 320 px); the
//      briefing; the TV's star (three teams) and scoreboard; everyone starts on the same sum
//   B  secrecy: a phone gets its own sum and never its answer; the TV's data has no sum
//   C  on a phone: a right answer moves on; a wrong one freezes for 2 s and greys that option
//   D  fair for uneven teams: Sun (2 players, 8 right) pulls 4.0 per player, Coral (3 players, 6 right) 2.0; the knot
//      leans to Sun on the TV and the phones
//   E  the bout's result: Sun 1st, Coral 2nd, Mint 3rd (100/75/55) on the TV and phones
//   F  bout 2: Mint, alone in last place and 45 behind, pulls ×1.2 (shown on its phones and the TV) and wins it
//   G  bout 3 over the API; results: the team results card, three bouts, the TV final; 320 px; the TV fits
// Answers come from the sum on screen (scripts/lib/math-solve.mjs).
// Usage: node scripts/check-tug-of-war.mjs <baseUrl>   (the gate passes its server)
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { PROTOCOL_HEADERS } from "./lib/protocol.mjs";
import { solveMath } from "./lib/math-solve.mjs";

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
const shot = async (page, name) => { await page.mouse.move(1, 1); await page.screenshot({ path: screenshotPath(`docs/stage12/stage1213-screenshots/${name}.png`) }); };
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : "");
const tvFits = (tv) => tv.evaluate(() => {
  const foot = document.querySelector(".mz-tvshow-foot")?.getBoundingClientRect().top ?? innerHeight;
  const panel = document.querySelector("[data-testid='tv-live-tug-of-war']");
  if (!panel) return { ok: false, why: "no panel" };
  const bottom = Math.max(...[...panel.querySelectorAll("svg, li, h1, figcaption")].map((e) => Math.round(e.getBoundingClientRect().bottom)));
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
  await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "make", count: 3 } });
  for (const [s, team] of [[k, "team-coral"], [a, "team-coral"], [z, "team-coral"], [b, "team-sun"], [w, "team-sun"], [j, "team-mint"], [n, "team-mint"]]) await api(`/rooms/${roomId}/teams`, { token: k.token, body: { action: "move", playerId: s.playerId, teamId: team } });
  const { gameId: gid } = await api(`/rooms/${roomId}/games`, { token: k.token, body: { gameId: "tug-of-war", official: false } });
  await soon("A the briefing explains Tug of War", async () => /every right answer pulls the rope/i.test(await host.locator("main").innerText()));
  await shot(pageOf[n.playerId], "briefing-320");
  for (const s of seats) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  await soon("A the TV shows the star (three rope ends) and a three-team scoreboard", async () => (await tv.locator("[data-testid='tv-tug-rope'] .mz-tug-rope__end").count()) === 3 && (await tv.getByTestId("tv-tug-scores").getAttribute("data-teams")) === "3");
  await soon("A every phone starts on the same sum", async () => { const ps = []; for (const p of pages) ps.push(await text(p.getByTestId("mz-tug-prompt"))); return ps[0] && ps.every((x) => x === ps[0]); });
  const tvGame = async () => (await tvProj(roomId)).games.find((g) => g.id === gid);
  const viewOf = async (s) => (await myGame(roomId, s, gid)).state;

  // ---- B ----
  const kv = await viewOf(k);
  const tvData = JSON.stringify((await tvGame()).state);
  check("B a phone has its own sum and never its answer", !!kv.sum?.prompt && !JSON.stringify(kv).includes("correctIndex"));
  check("B the TV's data has no sum and no answer", !tvData.includes(kv.sum.prompt) && !tvData.includes("\"sum\"") && !tvData.includes("correctIndex"));

  // ---- C ----
  const optIdx = async (p, right) => {
    const prompt = await text(p.getByTestId("mz-tug-prompt"));
    const want = solveMath(prompt);
    const opts = await p.locator("[data-testid^='mz-tug-opt-']").allInnerTexts();
    const i = opts.findIndex((o) => Number(o) === want);
    return right ? i : (i + 1) % opts.length;
  };
  const first = await text(host.getByTestId("mz-tug-prompt"));
  await host.getByTestId(`mz-tug-opt-${await optIdx(host, true)}`).click();
  await soon("C a right answer moves Keku on to the next sum", async () => (await text(host.getByTestId("mz-tug-prompt"))) !== first && /You: 1 right/.test(await text(host.getByTestId("mz-tug-me"))));
  const wrongI = await optIdx(host, false);
  await host.getByTestId(`mz-tug-opt-${wrongI}`).click();
  await soon("C a wrong answer freezes Keku and greys that option", async () => /Frozen for \d s/.test(await text(host.getByTestId("mz-tug-frozen"))) && (await host.locator(`[data-testid='mz-tug-opt-${wrongI}'].is-wrong`).count()) === 1 && await host.getByTestId(`mz-tug-opt-${(wrongI + 1) % 4}`).isDisabled());
  await shot(host, "frozen-390");
  await soon("C the freeze ends by itself", async () => (await host.getByTestId("mz-tug-frozen").count()) === 0 && !(await host.getByTestId(`mz-tug-opt-${(wrongI + 1) % 4}`).isDisabled()), 6000);

  // ---- D ----
  const pull = async (s, count, bout) => {
    for (let i = 0; i < count; i++) {
      const v = await viewOf(s);
      const choice = v.sum.options.findIndex((o) => o === solveMath(v.sum.prompt));
      await intent(roomId, s, gid, "tug-answer", { bout, idx: v.sum.idx, choice });
    }
  };
  // Coral: Keku 1 (already), Amina 3, Zawadi 2 = 6 right for 3 players. Sun: 4 + 4 = 8 for 2 players.
  await pull(a, 3, 0); await pull(z, 2, 0); await pull(b, 4, 0); await pull(w, 4, 0);
  const st = (await tvGame()).state;
  const pullOf = (t) => st.pulls.find((p) => p.teamId === t);
  check("D the pull is per player: Sun 4.0 (8 right, 2 players), Coral 2.0 (6 right, 3 players)", pullOf("team-sun").pull === 4 && pullOf("team-sun").right === 8 && pullOf("team-coral").pull === 2 && pullOf("team-coral").right === 6, JSON.stringify(st.pulls));
  await soon("D the TV's knot leans to Sun, and says so", async () => /Leaning to Team Sun/.test(await text(tv.getByTestId("tv-tug-rope-lean"))) && /4\.0 per player \(8 right, 2 players\)/.test(await text(tv.getByTestId("tv-tug-scores-team-sun"))));
  await soon("D a phone shows the same lean", async () => /Leaning to Team Sun/.test(await text(pageOf[j.playerId].getByTestId("mz-tug-rope-lean"))));
  const knot = (await tv.getByTestId("tv-tug-rope").getAttribute("data-knot")).split(",").map(Number);
  // Sun pulls from the lower right, Coral from the top, Mint (0) from the lower left: the knot moves right.
  check("D the knot moved toward Sun's side", knot[0] > 0.1, String(knot));
  await shot(tv, "tv-pull-1920");
  const fitP = await tvFits(tv);
  check("D the TV fits above its footer (pulling)", fitP.ok, JSON.stringify(fitP));
  await shot(pageOf[b.playerId], "pull-390");

  // ---- E ----
  const r0 = await until(async () => { const g = await tvGame(); return g.state.phase === "result" && g.state.bout === 0 ? g.state.result : null; }, 50000);
  const pts = Object.fromEntries((r0 ?? []).map((r) => [r.teamId, [r.place, r.points]]));
  check("E bout 1: Sun 1st, Coral 2nd, Mint 3rd (100/75/55)", JSON.stringify([pts["team-sun"], pts["team-coral"], pts["team-mint"]]) === JSON.stringify([[1, 100], [2, 75], [3, 55]]), JSON.stringify(pts));
  await soon("E the TV and a phone show the result", async () => /Team Sun wins the bout/.test(await text(tv.getByTestId("tv-tug-title"))) && /came 2nd: \+75/.test(await text(host.getByTestId("mz-tug-headline"))));
  await shot(tv, "tv-result-1920");
  await shot(host, "result-390");

  // ---- F ----
  const b1 = await until(async () => { const g = await tvGame(); return g.state.phase === "pull" && g.state.bout === 1 ? g.state : null; }, 15000);
  check("F Mint (alone last, 45 behind) is the catch-up team for bout 2", b1?.catchUp === "team-mint", JSON.stringify(b1?.teamTotals));
  await soon("F Mint's phones say it pulls ×1.2", async () => /pulls ×1\.2/.test(await text(pageOf[n.playerId].getByTestId("mz-tug-catchup"))));
  await shot(pageOf[n.playerId], "catchup-320");
  await pull(j, 2, 1); await pull(n, 2, 1); await pull(b, 2, 1); await pull(w, 2, 1); await pull(k, 1, 1);
  await soon("F the TV shows Mint's ×1.2 pull", async () => /2\.4 per player.*catch-up ×1\.2/.test(await text(tv.getByTestId("tv-tug-scores-team-mint"))));
  const r1 = await until(async () => { const g = await tvGame(); return g.state.phase === "result" && g.state.bout === 1 ? g.state.result : null; }, 50000);
  check("F Mint wins bout 2 with the catch-up pull (2.4 against Sun's 2.0)", r1?.find((r) => r.teamId === "team-mint")?.place === 1, JSON.stringify(r1));

  // ---- G ----
  await until(async () => { const g = await tvGame(); return g.state.phase === "pull" && g.state.bout === 2; }, 15000);
  await pull(k, 3, 2); await pull(a, 3, 2); await pull(z, 3, 2); await pull(b, 1, 2);
  const fin = await until(async () => { const g = await tvGame(); return g.status === "finished" ? g : null; }, 60000);
  const teamOf = { [k.playerId]: "team-coral", [a.playerId]: "team-coral", [z.playerId]: "team-coral", [b.playerId]: "team-sun", [w.playerId]: "team-sun", [j.playerId]: "team-mint", [n.playerId]: "team-mint" };
  check("G the game finished with team results for three teams", fin?.teamResults?.length === 3, JSON.stringify(fin?.teamResults?.map((r) => [r.teamId, r.rank, r.score])));
  check("G every player scored their team's points", !!fin && seats.every((s) => fin.rawScores[s.playerId] === fin.teamResults.find((r) => r.teamId === teamOf[s.playerId])?.score));
  await soon("G phones: the results, three bouts and the team results card", async () => (await host.getByTestId("mz-tug-results").count()) === 1 && (await host.getByTestId("mz-tug-recap-bout").count()) === 3 && /A team game/i.test(await text(host.getByTestId("team-results"))));
  await soon("G the TV leads with the team result", async () => (await tv.getByTestId("tv-team-results").count()) === 1);
  await sleep(500);
  await shot(host, "results-390");
  await shot(pageOf[n.playerId], "results-320");
  await shot(tv, "tv-final-1920");
  check("G 320 px: the results have no sideways scroll", await noSideScroll(pageOf[n.playerId]));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "TUG OF WAR PASSED" : `TUG OF WAR FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
