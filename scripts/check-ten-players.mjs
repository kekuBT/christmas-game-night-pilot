// Stage 4, Phase 5B: a full room of ten, each player on their own phone
// (separate browser contexts at 375, 390, 430, 768 and 1440 px), with
// similar and long family names.
//   Lobby: who you are, ten readable names (never cut, never split mid-word,
//   never touching), "room is full"; the eleventh person is refused in
//   words and can still watch; every game in the Library fits ten.
//   Ready: "Ready · N of 10" everywhere, ten names on the briefing, the last
//   tap starts play for all.
//   Results: an official Math Mayhem with two ties; every phone's standings
//   preview never splits a tie, "Show all 10 players" lists everyone with
//   the server's scores and shared ranks, the last row scrolls into view,
//   nothing scrolls sideways; the Family Cup lists all ten in the server's
//   order; the TV shows them too.
// Official game, isolated server and data, NO content test mode (Math
// Mayhem's questions are generated). Answers go in through each seat's own
// session, immediately, so scores are exact: 120 per right answer.
// Starts ITS OWN server. Usage: node scripts/check-ten-players.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; } await sleep(250); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return false;
}
const DATA = mkdtempSync(join(tmpdir(), "mz-ten-"));
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
let port = null;
for (let i = 0; i < 120 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
if (!port) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
check("the server runs without the content test mode", !/provisional content treated as approved/.test(out));
const BASE = `http://localhost:${port}`;
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}

// Similar first words, shared surnames, and long names (32 is the limit).
const NAMES = ["Keku", "Cousin Amani", "Cousin Amina", "Cousin Amani Wanjiru", "Auntie June", "Auntie Joan", "Grandpa Joseph Otieno-Wanjiku", "Grandma Josephine", "Bartholomew Otieno-Wanjiku", "Wanjiru Kamau-Njoroge the Third"];
const VIEWPORTS = [[390, 844], [375, 667], [430, 932], [768, 1024], [1440, 900], [375, 667], [390, 844], [430, 932], [375, 667], [390, 844]];
// Right answers out of 10 → 120 points each (100 + the fastest speed bonus).
// Ties: Cousin Amani = Cousin Amina (2nd); Auntie June = Auntie Joan = Grandpa Joseph (5th).
const RIGHT = [10, 8, 8, 6, 5, 5, 5, 3, 1, 0];
const room = await api("/rooms", { body: { name: "Ten at the table" } });
const seats = [];
{
  const h = await api(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  seats.push({ name: NAMES[0], playerId: h.playerId, token: h.recoveryToken });
  for (const n of NAMES.slice(1)) { const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } }); seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken }); }
}
const intent = (seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
const solve = (prompt) => {
  const pct = /^(\d+)% of (\d+)/.exec(prompt);
  if (pct) return (Number(pct[1]) * Number(pct[2])) / 100;
  const [a, op, b] = prompt.replace(/[=?]/g, " ").trim().split(/\s+/);
  const x = Number(a), y = Number(b);
  return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
};
const text = (p) => p.evaluate(() => document.body.innerText);
const noSideways = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1);
/** The lobby circle's name labels: cut, split mid-word, off-screen, or touching. */
const circleLabels = (p) => p.evaluate(() => {
  const els = [...document.querySelectorAll(".mz-circle .mz-seat__name")];
  const box = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
  const labels = els.map((e) => ({ t: e.textContent ?? "", title: e.getAttribute("title") ?? "", b: box(e), cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 }));
  const tokens = [...document.querySelectorAll(".mz-circle .mz-seat .mz-token")].map(box);
  const ov = (a, c) => a[0] < c[2] - 1 && c[0] < a[2] - 1 && a[1] < c[3] - 1 && c[1] < a[3] - 1;
  const clashes = [];
  labels.forEach((l, i) => { labels.forEach((m, j) => { if (j > i && ov(l.b, m.b)) clashes.push(`${l.t}~${m.t}`); }); tokens.forEach((tk, j) => { if (j !== i && ov(l.b, tk)) clashes.push(`${l.t}~seat${j}`); }); });
  const split = [];
  for (const e of els) {
    const tn = [...e.childNodes].find((n) => n.nodeType === 3); if (!tn) continue;
    const re = /\S+/g; let m;
    while ((m = re.exec(tn.data))) { const r = document.createRange(); r.setStart(tn, m.index); r.setEnd(tn, m.index + m[0].length); if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) split.push(m[0]); }
  }
  return { labels: labels.map((l) => ({ t: l.t, title: l.title })), cut: labels.filter((l) => l.cut).map((l) => l.t), split, clashes, off: labels.filter((l) => l.b[0] < 0 || l.b[2] > innerWidth).map((l) => l.t) };
});

const browser = await launchChromium();
try {
  const pages = [];
  for (const [i, s] of seats.entries()) {
    const ctx = await browser.newContext({ viewport: { width: VIEWPORTS[i][0], height: VIEWPORTS[i][1] } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await p.evaluate((x) => { sessionStorage.setItem("cgn_roomId", x.roomId); sessionStorage.setItem("cgn_playerId", x.playerId); sessionStorage.setItem("cgn_token", x.token); }, { ...s, roomId: room.roomId });
    await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
    pages.push(p);
  }
  const host = pages[0];
  const vp = (i) => `${VIEWPORTS[i][0]}×${VIEWPORTS[i][1]}`;

  // ---- Lobby: identity and ten readable names on every phone.
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 20000 });
  check("identity: every phone greets its own player by full name", true);
  await sleep(1500); // arrival animations settle
  for (const [i, p] of pages.entries()) {
    const r = await circleLabels(p);
    const others = r.labels.filter((l) => l.t !== "You");
    check(`lobby ${vp(i)} (${NAMES[i]}): ten seats, "You" once, nine other labels all different`, r.labels.length === 10 && r.labels.filter((l) => l.t === "You").length === 1 && others.length === 9 && new Set(others.map((l) => l.t)).size === 9, JSON.stringify(others.map((l) => l.t)));
    check(`lobby ${vp(i)}: each label is that player's own name (full name as tooltip)`, others.every((l) => NAMES.includes(l.title) && (l.title === l.t || l.title.startsWith(l.t.replace(/ \S\.$/, "")))));
    check(`lobby ${vp(i)}: no name cut, split mid-word, off-screen or touching another`, r.cut.length === 0 && r.split.length === 0 && r.off.length === 0 && r.clashes.length === 0, JSON.stringify({ cut: r.cut, split: r.split, off: r.off, clashes: r.clashes }));
    check(`lobby ${vp(i)}: "10 here · room is full"`, /10 here[\s\S]{0,20}room is full/.test(await text(p)));
    check(`lobby ${vp(i)}: no sideways scrolling`, await noSideways(p));
  }
  for (const i of [1, 0, 2, 3, 4]) await pages[i].screenshot({ path: screenshotPath(`docs/stage4/after/ten-lobby-${VIEWPORTS[i][0]}.png`) });
  const circleBox = async (p) => p.locator(".mz-circle").first().evaluate((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(","); });
  const box0 = await circleBox(pages[1]);
  await sleep(2000);
  check("viewport stability: the 375×667 lobby circle doesn't move while idle", (await circleBox(pages[1])) === box0, box0);

  // ---- Limits: the eleventh person is refused in words, and can watch.
  const eleventh = await (await browser.newContext({ viewport: { width: 375, height: 667 } })).newPage();
  await eleventh.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await eleventh.getByPlaceholder("e.g. Auntie June").fill("Zawadi");
  await eleventh.locator(".mz-code__input").fill(room.joinCode);
  await eleventh.getByRole("button", { name: "Join the game" }).click();
  await soon("limit: the eleventh person is told the room is full (10 players)", async () => /Room is full \(10 players\)/i.test(await text(eleventh)));
  check("limit: the server still has ten players", (await api(`/rooms/${room.roomId}/projection?audience=tv`)).players.length === 10);
  await eleventh.screenshot({ path: screenshotPath("docs/stage4/after/ten-eleventh-refused-375.png") });
  const tvCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tv = await tvCtx.newPage();
  await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await tv.locator(".mz-code__input").fill(room.joinCode);
  await tv.getByTestId("watch-spectator").click();
  await soon("spectator: a full room can still be watched, with all ten names", async () => { const t = await text(tv); return NAMES.every((n) => t.includes(n.split(" ")[0])); }, 15000);
  check("spectator: watching doesn't take a seat", (await api(`/rooms/${room.roomId}/projection?audience=tv`)).players.length === 10);

  // ---- Eligibility: every game in the room's Library fits ten.
  const catalog = await api("/games");
  const fitTen = catalog.filter((g) => g.minPlayers <= 10 && 10 <= g.maxPlayers).map((g) => g.id);
  const lib = pages[3];
  await lib.goto(`${BASE}/room/library`, { waitUntil: "domcontentloaded" });
  await lib.locator('[data-testid^="mz-lib-fit-"]').first().waitFor({ timeout: 15000 });
  const fits = await lib.locator('[data-testid^="mz-lib-card-"]').evaluateAll((els) => els.map((e) => [e.getAttribute("data-testid").replace("mz-lib-card-", ""), e.getAttribute("data-fit"), e.querySelector('[data-testid^="mz-lib-fit-"]')?.textContent ?? ""]));
  check("eligibility: the Library marks exactly the games that take 10 as fitting", fits.length === catalog.length && fits.every(([id, fit]) => (fit === "fits") === fitTen.includes(id)), JSON.stringify(fits.map(([id, fit]) => `${id}:${fit}`)));
  check("eligibility: the fit line names the room's size", fits.filter(([, fit]) => fit === "fits").every(([, , t]) => /10 players/.test(t)));
  await lib.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  await lib.getByRole("heading", { name: `You’re in, ${NAMES[3]}.` }).waitFor({ timeout: 15000 });

  // ---- Ready: the official briefing for ten.
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-math-mayhem").click();
  await host.getByTestId("start-official-math-mayhem").click();
  for (const p of pages) await p.getByTestId("briefing").waitFor({ timeout: 20000 });
  for (const [i, p] of pages.entries()) {
    check(`briefing ${vp(i)}: "Ready · 0 of 10" and ten people listed`, /Ready · 0 of 10/.test(await p.getByTestId("briefing-ready-count").textContent()) && (await p.locator('[data-testid^="briefing-person-"]').count()) === 10);
  }
  const people = await pages[1].getByTestId("briefing-people").innerText();
  check("briefing: every full name is listed, and yours says (you)", NAMES.every((n) => people.includes(n)) && people.includes(`${NAMES[1]} (you)`));
  check("briefing: the list doesn't scroll sideways at 375", await noSideways(pages[1]));
  for (const [i, p] of pages.slice(1).entries()) {
    await p.getByTestId("briefing-ready").click();
    const n = i + 1;
    await soon(`ready: ${n} of 10 on the host's phone`, async () => new RegExp(`Ready · ${n} of 10`).test(await host.getByTestId("briefing-ready-count").textContent()), 10000);
  }
  await soon("ready: every phone agrees, 9 of 10", async () => (await Promise.all(pages.map((p) => p.getByTestId("briefing-ready-count").textContent()))).every((t) => /Ready · 9 of 10/.test(t)));
  await pages[1].screenshot({ path: screenshotPath("docs/stage4/after/ten-briefing-9of10-375.png"), fullPage: true });
  await host.getByTestId("briefing-ready").click();
  await soon("ready: the tenth tap starts play on every phone", async () => (await Promise.all(pages.map((p) => p.getByTestId("briefing").count()))).every((n) => n === 0), 20000);

  // ---- Play (each seat answers through its own session) and finish.
  const gid = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seats[0].token })).myGames.find((g) => g.gameId === "math-mayhem").id;
  // Question by question across all ten seats (the phones open each next
  // question themselves), so every answer lands well inside the 5-second
  // fastest-bonus window and the scores are exact.
  const qs = [];
  for (const s of seats) qs.push((await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((x) => x.id === gid).questions);
  for (let k = 0; k < qs[0].length; k++) {
    for (const [i, s] of seats.entries()) {
      const q = qs[i][k];
      const o = await intent(s, gid, "math-open", { questionId: q.id });
      const idx = o.result.options.findIndex((x) => (k < RIGHT[i] ? Number(x) === solve(o.result.prompt) : Number(x) !== solve(o.result.prompt)));
      await intent(s, gid, "submit-math-answer", { questionId: q.id, chosenIndex: idx });
    }
  }
  const pub = (await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.find((g) => g.id === gid);
  const raw = pub.rawScores ?? {};
  check("server: the game finished and counts officially", pub.status === "finished" && pub.official === true, pub.status);
  check("server: scores are 120 per right answer", seats.every((s, i) => raw[s.playerId] === RIGHT[i] * 120), JSON.stringify(seats.map((s) => raw[s.playerId])));
  const scoreOf = (i) => raw[seats[i].playerId];
  const tiedIdx = (i) => seats.filter((x) => raw[x.playerId] === scoreOf(i)).length > 1;
  for (const p of pages) await p.getByTestId("show-results").waitFor({ timeout: 30000 });
  /** Is the last element of `sel` reachable: scrolled into view and not under anything? */
  const lastReachable = async (p, sel) => {
    const last = p.locator(sel).last();
    await last.scrollIntoViewIfNeeded();
    return last.evaluate((e) => { const b = e.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.top >= 0 && b.bottom <= innerHeight + 1 && !!hit && e.contains(hit); });
  };

  // ---- Official Math results on every phone: everyone listed, the server's points.
  for (const [v, p] of pages.entries()) {
    const rows = await p.locator(".reveal-row").evaluateAll((els) => els.map((e) => e.textContent ?? ""));
    const parsed = rows.map((t) => { const m = /^(.*?): (\d+) points/.exec(t); return m ? { name: m[1], score: Number(m[2]) } : null; });
    check(`Math results ${vp(v)} (${NAMES[v]}): all ten players listed, highest first`, parsed.length === 10 && parsed.every(Boolean) && parsed.every((r, k) => k === 0 || parsed[k - 1].score >= r.score), JSON.stringify(rows.slice(0, 3)));
    check(`Math results ${vp(v)}: every name and score is the server's`, seats.every((x, i) => parsed.some((r) => r && (r.name === NAMES[i] || (i === v && r.name === "You")) && r.score === scoreOf(i))));
    const hero = await text(p);
    const want = tiedIdx(v) ? `You tied for` : `You came`;
    check(`Math results ${vp(v)}: "${want} … of 10" for this player`, new RegExp(`${want} \\S+ of 10`).test(hero), (hero.match(/You (came|tied)[^\n]*/) ?? [""])[0]);
    check(`Math results ${vp(v)}: no sideways scrolling`, await noSideways(p));
    check(`Math results ${vp(v)}: the tenth player scrolls into view, not hidden`, await lastReachable(p, ".reveal-row"));
    check(`Math results ${vp(v)}: Back to lobby is reachable`, await lastReachable(p, '[data-testid="show-back-to-lobby"]'));
    if ([1, 0, 2, 3, 4].includes(v)) await p.screenshot({ path: screenshotPath(`docs/stage4/after/ten-math-results-${VIEWPORTS[v][0]}.png`), fullPage: true });
  }

  // ---- The Family Cup: all ten, the server's order and totals.
  const tvProj = await api(`/rooms/${room.roomId}/projection?audience=tv`);
  const cupOrder = (tvProj.championship ?? []).map((r) => r.playerId);
  check("Cup (server): all ten players have standings", cupOrder.length === 10);
  const os = tvProj.officialStandings ?? {};
  check("Cup (server): tied players have equal official standings", os[seats[1].playerId] === os[seats[2].playerId] && os[seats[4].playerId] === os[seats[5].playerId] && os[seats[5].playerId] === os[seats[6].playerId], JSON.stringify(seats.map((s) => os[s.playerId])));
  const cupPage = pages[8];
  await cupPage.getByTestId("show-back-to-lobby").click().catch(() => {});
  await cupPage.goto(`${BASE}/room/cup`, { waitUntil: "domcontentloaded" });
  await cupPage.getByTestId("cup-standings").waitFor({ timeout: 15000 });
  const cupRows = await cupPage.locator('[data-testid^="cup-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("cup-row-", "")));
  check("Cup (375): all ten rows, in the server's order", cupRows.join(",") === cupOrder.join(","), `${cupRows.length} rows`);
  check("Cup (375): no sideways scrolling", await noSideways(cupPage));
  await cupPage.screenshot({ path: screenshotPath("docs/stage4/after/ten-cup-375.png"), fullPage: true });

  // ---- TV: the spectator sees the ten after the game.
  await soon("TV: the finished game shows all ten players", async () => { const t = await text(tv); return NAMES.every((n) => t.includes(n) || t.includes(n.split(" ")[0])); }, 15000);
  check("TV: no sideways scrolling at 1440", await noSideways(tv));
  await tv.screenshot({ path: screenshotPath("docs/stage4/after/ten-tv-1440.png"), fullPage: true });

  // ---- Practice Trivia for ten: the standings preview and "Show all".
  // Practice draws on any non-rejected question; nothing is approved.
  // Answers by group (the same option for everyone in a group, all at once),
  // so each group ties exactly, whatever the right answers are.
  const GROUP = [0, 1, 1, 2, 2, 2, 3, 3, 0, 1];
  for (const p of pages) { const b = p.getByTestId("show-back-to-lobby"); if (await b.count()) await b.click(); else await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" }); }
  for (const [i, p] of pages.entries()) await p.getByRole("heading", { name: `You’re in, ${NAMES[i]}.` }).waitFor({ timeout: 15000 });
  const osBefore = JSON.stringify((await api(`/rooms/${room.roomId}/projection?audience=tv`)).officialStandings);
  const { gameId: tgid } = await api(`/rooms/${room.roomId}/games`, { token: seats[0].token, body: { gameId: "trivia", official: false } });
  for (const p of pages) await p.getByTestId("briefing").waitFor({ timeout: 20000 });
  check("practice briefing: says Practice, no Cup points", /Practice · no Cup points/.test(await pages[1].getByTestId("briefing-mode").textContent()));
  for (const p of pages) await p.getByTestId("briefing-ready").click();
  await soon("practice: the tenth ready starts Trivia", async () => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seats[0].token })).myGames.find((g) => g.id === tgid)?.status === "playing", 20000);
  const tq = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seats[0].token })).myGames.find((g) => g.id === tgid).state.questions;
  for (const q of tq) for (const [i, x] of seats.entries()) await intent(x, tgid, "trivia-answer", { questionId: q.id, chosenIndex: GROUP[i] % q.options.length });
  const tpub = (await api(`/rooms/${room.roomId}/projection?audience=tv`)).games.find((g) => g.id === tgid);
  check("practice: Trivia finished and does not count officially", tpub.status === "finished" && tpub.official === false);
  check("practice: the Family Cup standings did not move", JSON.stringify((await api(`/rooms/${room.roomId}/projection?audience=tv`)).officialStandings) === osBefore);
  const traw = tpub.rawScores ?? {};
  const tscore = (i) => traw[seats[i].playerId];
  const trank = (i) => 1 + seats.filter((x) => traw[x.playerId] > tscore(i)).length;
  const ranksAll = seats.map((_, i) => trank(i)).sort((a, b) => a - b);
  console.log(`  (practice Trivia scores: ${seats.map((_, i) => tscore(i)).join(", ")})`);
  const rowsOf = (p) => p.locator('[data-testid="standings-list"] .mz-standings__row').evaluateAll((els) => els.map((e) => ({
    rank: Number(e.querySelector(".mz-standings__rank")?.textContent), name: e.querySelector(".mz-standings__name")?.textContent ?? "",
    score: Number((e.querySelector(".mz-standings__score")?.textContent ?? "").replace(/[^\d]/g, "")),
    nameCut: (() => { const n = e.querySelector(".mz-standings__name"); return n ? n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1 : false; })(),
    rowWide: e.scrollWidth > e.clientWidth + 1,
  })));
  for (const [v, p] of pages.entries()) {
    await p.getByTestId("mz-reveal-standings").click({ timeout: 30000 });
    await p.getByTestId("standings-list").waitFor({ timeout: 15000 });
    const preview = await rowsOf(p);
    // The preview shows the top two places (limit 2) and never splits a shared rank.
    const cutoff = ranksAll[1];
    const mustShow = seats.map((_, i) => i).filter((i) => trank(i) <= cutoff);
    check(`Trivia standings ${vp(v)} (${NAMES[v]}): the preview never splits a tie at the cut`, mustShow.every((i) => preview.some((r) => r.name === (i === v ? "You" : NAMES[i]))), JSON.stringify(preview.map((r) => `${r.rank}:${r.name}`)));
    check(`Trivia standings ${vp(v)}: your own row is in the preview with your score and rank`, preview.some((r) => r.name === "You" && r.score === tscore(v) && r.rank === trank(v)));
    const toggle = p.getByTestId("standings-toggle");
    if (preview.length < 10) {
      check(`Trivia standings ${vp(v)}: "Show all 10 players" is offered`, (await toggle.count()) === 1 && /Show all 10 players/.test(await toggle.innerText()));
      await toggle.click();
    }
    const all = await rowsOf(p);
    check(`Trivia standings ${vp(v)}: all ten with the server's scores, highest first`, all.length === 10 && seats.every((_, i) => all.some((r) => r.name === (i === v ? "You" : NAMES[i]) && r.score === tscore(i))) && all.every((r, k) => k === 0 || all[k - 1].score >= r.score), JSON.stringify(all.map((r) => `${r.rank}:${r.name}:${r.score}`)));
    check(`Trivia standings ${vp(v)}: ties share a rank (competition ranking)`, all.map((r) => r.rank).join(",") === ranksAll.join(","), `${all.map((r) => r.rank).join(",")} vs ${ranksAll.join(",")}`);
    check(`Trivia standings ${vp(v)}: no name cut off`, all.every((r) => !r.nameCut), JSON.stringify(all.filter((r) => r.nameCut).map((r) => r.name)));
    check(`Trivia standings ${vp(v)}: no row and no page scrolls sideways`, all.every((r) => !r.rowWide) && await noSideways(p));
    check(`Trivia standings ${vp(v)}: the tenth row scrolls into view, not hidden`, await lastReachable(p, '[data-testid="standings-list"] .mz-standings__row'));
    if ([1, 0, 2, 3, 4].includes(v)) await p.screenshot({ path: screenshotPath(`docs/stage4/after/ten-standings-showall-${VIEWPORTS[v][0]}.png`), fullPage: true });
    if (preview.length < 10) {
      await toggle.click();
      check(`Trivia standings ${vp(v)}: Show fewer goes back to the preview`, (await rowsOf(p)).length === preview.length);
    }
  }

  // ---- Back to the lobby: the circle is where it was.
  const p375 = pages[1];
  await p375.getByRole("button", { name: "Back to lobby" }).first().click();
  await p375.getByRole("heading", { name: `You’re in, ${NAMES[1]}.` }).waitFor({ timeout: 15000 });
  await sleep(1200);
  check("viewport stability: after a whole game the 375×667 lobby circle is where it was", (await circleBox(p375)) === box0, `${box0} → ${await circleBox(p375)}`);
} finally {
  await browser.close();
  srv.kill("SIGTERM");
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "TEN PLAYERS ALL PASSED" : `TEN PLAYERS FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
