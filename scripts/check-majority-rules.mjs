// Stage 5 (S5-C1): Majority Rules, a complete game on four phones and a TV.
//   Practice-only (the lobby says so; the server refuses Official); the
//   briefing explains it; five rounds of predict-then-vote; a failed send
//   says so and isn't counted; counts on the TV, never a vote; a clear
//   majority, a tie (every prediction 50), a skipped round, a reload between
//   the two steps, and a round nobody plays (the deadline closes it); results
//   on every phone equal the server's scores; a tie for first; the TV's final
//   standings and its post-game review; no sideways scrolling at 320–430.
// Isolated server, no content test mode (the pack is the game's own,
// provisional, and the game is practice-only). Time scale 0.5.
// Starts ITS OWN server. Usage: node scripts/check-majority-rules.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contrastFailures } from "./lib/contrast.mjs";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-mr-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA, MCHEZO_LIFECYCLE_SCALE: "0.5" };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
const BASE = `http://localhost:${port}`;
async function call(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function api(path, opts) { const r = await call(path, opts); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; }
const NAMES = ["Keku", "Amina", "Bartholomew Otieno-Wanjiku", "Wanjiru"];
const room = await api("/rooms", { body: { name: "Majority Rules" } });
const seats = [];
{
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  seats.push({ name: NAMES[0], playerId: h.playerId, token: h.recoveryToken });
  for (const n of NAMES.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
}
const browser = await launchChromium();
const WIDTHS = [390, 375, 430, 320];
async function phone(seat, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const tvGame = async () => (await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.at(-1);
const noSideways = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);

try {
  const pages = [];
  for (const [i, s] of seats.entries()) pages.push(await phone(s, WIDTHS[i]));
  const [keku] = pages;
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  const tvCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.joinCode);
  await tv.getByTestId("watch-spectator").click();
  await tv.getByTestId("tv-show").waitFor({ timeout: 15000 });

  // ---- Practice-only, in the lobby and on the server.
  await keku.getByTestId("choose-game").click();
  await keku.getByTestId("select-game-majority-rules").click();
  await soon("lobby: Majority Rules is Practice only, and says why", async () => (await keku.getByTestId("mode-official").isDisabled()) && /practice-only until its Cup scoring is approved/.test(await keku.getByTestId("practice-only-note").innerText()));
  const off = await call(`/rooms/${room.roomId}/games`, { token: seats[0].token, body: { gameId: "majority-rules", official: true } });
  check("server: an official start is refused", off.status >= 400 && /practice-only/.test(off.body.error ?? ""), `${off.status} ${off.body.error}`);
  await keku.getByTestId("start-practice-majority-rules").click();
  await soon("briefing: every phone explains the game", async () => (await Promise.all(pages.map(async (p) => /Guess which way the room will vote/.test(await text(p)) && /split/.test(await text(p))))).every(Boolean));
  await pages[1].screenshot({ path: screenshotPath("docs/stage5/after/mr-briefing-375.png") });
  for (const p of pages) await p.getByTestId("briefing-ready").click();

  // A round: predictions, then votes, through each phone's own UI.
  const pick = async (p, step, side) => { await p.getByTestId(`mz-mr-${step}-${side}`).click(); };
  const waitRound = async (n) => {
    await soon(`round ${n}: every phone is on step 1 (predict)`, async () => (await Promise.all(pages.map(async (p) => (await p.getByTestId("mz-mr-predict").count()) === 1 && (await p.locator(".mz-mr-round").textContent()).includes(`Round ${n} of 5`)))).every(Boolean), 30000);
  };
  const rounds = [
    { preds: ["a", "a", "b", "a"], votes: ["a", "b", "a", "a"] },
    { preds: ["a", "b", "a", "b"], votes: ["a", "a", "b", "b"] },
    { preds: ["b", "b", "a", null], votes: ["b", "b", "b", null] }, // Wanjiru skips
    { preds: ["a", "a", "a", "a"], votes: ["a", "a", "a", "b"] },
  ];
  for (const [ri, plan] of rounds.entries()) {
    const n = ri + 1;
    await waitRound(n);
    const prompt = await keku.getByTestId("mz-mr-prompt").innerText();
    check(`round ${n}: the same question on every phone and the TV`, (await Promise.all(pages.map((p) => p.getByTestId("mz-mr-prompt").innerText()))).every((t) => t === prompt) && (await tv.getByTestId("tv-mr-prompt").innerText()) === prompt, prompt);
    if (n === 1) {
      // A prediction that never reaches the server.
      const amina = pages[1];
      await amina.route("**/intents", (r) => r.abort("internetdisconnected"));
      await pick(amina, "predict", "a");
      await soon("a failed prediction says it couldn't be confirmed, and stays on step 1", async () => /couldn’t confirm/.test(await amina.getByTestId("mz-mr-error").innerText()) && (await amina.getByTestId("mz-mr-predict").count()) === 1);
      check("a failed prediction: the server has none from Amina", (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seats[1].token })).myGames.at(-1).state.myPrediction === undefined);
      await amina.screenshot({ path: screenshotPath("docs/stage5/after/mr-send-failed-375.png") });
      await amina.unroute("**/intents");
    }
    for (const [i, p] of pages.entries()) {
      if (plan.preds[i] === null) { await p.getByTestId("mz-mr-skip").click(); continue; }
      await pick(p, "predict", plan.preds[i]);
      await p.getByTestId("mz-mr-vote").waitFor({ timeout: 10000 });
      if (n === 1 && i === 0) {
        await p.screenshot({ path: screenshotPath("docs/stage5/after/mr-vote-step-390.png") });
        { const f = await contrastFailures(p); check("contrast (AA): the vote step", f.length === 0, f.join("; ")); }
        const tvText = await text(tv);
        check("TV during a round: a count, never a vote or a total", /1 of 4 locked in|0 of 4 locked in/.test(tvText) && !/vote[s]?\b.*\d+\s*[–-]\s*\d+/.test(tvText) && (await tv.getByTestId("mz-mr-bars").count()) === 0, (await tv.getByTestId("tv-live-progress").innerText()));
        const pub = JSON.stringify(await tvGame());
        check("public projection during a round: no predictions or votes", !/myPrediction|votesA|"result"/.test(pub));
      }
      if (n === 4 && i === 1) {
        await p.reload({ waitUntil: "domcontentloaded" });
        await soon("reload between the steps: Amina is back on step 2 with her prediction kept", async () => (await p.getByTestId("mz-mr-vote").count()) === 1 && /Your prediction/.test(await p.getByTestId("mz-mr-yourpred").innerText()), 20000);
      }
      await pick(p, "vote", plan.votes[i]);
    }
    await soon(`round ${n}: the reveal reaches every phone and the TV`, async () => (await Promise.all(pages.map((p) => p.getByTestId("mz-mr-reveal").count()))).every((x) => x === 1) && (await tv.getByTestId("tv-mr-verdict").count()) === 1, 15000);
    const g = await tvGame();
    const res = g.state.result;
    const a = plan.votes.filter((v) => v === "a").length, b = plan.votes.filter((v) => v === "b").length;
    check(`round ${n}: the server's totals are the votes cast (${a}–${b})`, res.votesA === a && res.votesB === b, JSON.stringify(res));
    if (n === 1) {
      check("round 1: a clear majority, and the line says so", /The room picked/.test(await keku.getByTestId("mz-mr-verdict").innerText()));
      check("round 1: Keku called it (+100)", /You called it: \+100/.test(await keku.getByTestId("mz-mr-mine").innerText()));
      check("round 1: Bartholomew didn't", /no points this time/.test(await pages[2].getByTestId("mz-mr-mine").innerText()));
      await keku.screenshot({ path: screenshotPath("docs/stage5/after/mr-reveal-390.png") });
      { const f = await contrastFailures(keku); check("contrast (AA): the reveal", f.length === 0, f.join("; ")); }
      await sleep(400);
      await tv.screenshot({ path: screenshotPath("docs/stage5/after/mr-tv-reveal-1440.png") });
    }
    if (n === 2) {
      check("round 2: a tie — 'A split room', every prediction scores 50", /split room/.test(await keku.getByTestId("mz-mr-verdict").innerText()) && res.majority === "tie");
      check("round 2: a split room names nobody publicly (who skipped stays private)", res.spotOn.length === 0, JSON.stringify(res.spotOn));
      check("round 2: each phone says its own prediction scored +50", (await Promise.all(pages.map(async (p) => /\+50/.test(await p.getByTestId("mz-mr-mine").innerText())))).every(Boolean));
      await pages[3].screenshot({ path: screenshotPath("docs/stage5/after/mr-tie-320.png") });
    }
    if (n === 3) check("round 3: a skip scores 0 and isn't counted", !res.spotOn.some((x) => x.playerId === seats[3].playerId) && res.votesA + res.votesB === 3);
  }
  // ---- Round 5: nobody plays; the deadline closes it.
  await waitRound(5);
  await soon("round 5: nobody plays, the deadline reveals 'nobody voted'", async () => /Nobody voted/.test(await keku.getByTestId("mz-mr-verdict").innerText().catch(() => "")), 40000);

  // ---- Results.
  await soon("results on every phone", async () => (await Promise.all(pages.map((p) => p.getByTestId("mz-mr-results").count()))).every((x) => x === 1), 30000);
  const g = await tvGame();
  const expected = { [seats[0].playerId]: 350, [seats[1].playerId]: 350, [seats[2].playerId]: 150, [seats[3].playerId]: 250 };
  check("results: the server's scores are the plan's (350, 350, 150, 250)", JSON.stringify(g.rawScores) === JSON.stringify({ ...g.rawScores, ...expected }) && Object.keys(expected).every((k) => g.rawScores[k] === expected[k]), JSON.stringify(g.rawScores));
  check("results: practice, not counted", g.outcome?.countsOfficially === false && g.official === false);
  for (const [i, p] of pages.entries()) {
    const t = await text(p);
    check(`results ${WIDTHS[i]}px: five rounds recapped, how scoring works, no sideways scrolling`, (await p.getByTestId("mz-mr-recap-round").count()) === 5 && /100 points for predicting the majority/.test(t) && await noSideways(p));
  }
  check("results: a tie for first, said as a tie", /Keku and Amina tie for first|Amina and Keku tie for first/.test(await text(keku)));
  check("results: the moment line comes from a recorded round (round 2's 2–2 split)", (await keku.getByTestId("results-moment").innerText()) === "Round 2 split the room 2–2.");
  { const f = await contrastFailures(keku); check("contrast (AA): results", f.length === 0, f.join("; ")); }
  await keku.screenshot({ path: screenshotPath("docs/stage5/after/mr-results-390.png"), fullPage: true });
  await soon("TV: final standings, then the post-game review with every round", async () => (await tv.getByTestId("tv-mode").getAttribute("data-mode")) === "final");
  await tv.getByTestId("tv-dir-review").click();
  await soon("TV review: five rounds, totals only", async () => (await tv.getByTestId("tv-mr-review").locator("li").count()) === 5 && /split room/.test(await tv.getByTestId("tv-mr-review").innerText()));
  await tv.screenshot({ path: screenshotPath("docs/stage5/after/mr-tv-review-1440.png") });
  const pub = JSON.stringify(g);
  check("votes stay anonymous even after the game: no player's vote in the public projection", !seats.some((s) => new RegExp(`"${s.playerId}":"[ab]"`).test(pub)));
  check("…and no per-player vote count (participation counts predictions only)", Object.values(g.outcome?.participation ?? {}).every((x) => x.actions === x.done), JSON.stringify(g.outcome?.participation));
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "MAJORITY RULES ALL PASSED" : `MAJORITY RULES FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
