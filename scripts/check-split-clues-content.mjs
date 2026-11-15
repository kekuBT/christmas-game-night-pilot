// Stage 12.16 (docs/stage12/stage1216.md; D-S1216-01..04): Split Clues' Official gate, on two servers of its own.
//   A  the shipped content, NO content test mode: every puzzle is provisional. In a Family Cup the host's lobby says
//      Split Clues is Practice only and why (390 and 320 px), with Official disabled; the server refuses a forged
//      Official start (409, the same reason) and a guest's start; Practice from the lobby plays a whole game to the end,
//      year-round puzzles only, and the Cup standings don't move.
//   B  an isolated fixture: a copy of content/ whose approvals.json approves six Everyday puzzles at their exact
//      content hashes (reviewer "TEST FIXTURE (not an editorial approval)"; the shipped approvals file is never
//      touched). Official is offered; the host starts it from the lobby; it deals exactly the approved puzzles; a guest
//      reloads mid-round and gets only their own clues back; the TV shows no clue or answer while solving; the game
//      ends Official with the teams placed in the Cup.
// The answers are secret in every projection, so the driver reads the packs and finds each puzzle from a team's clues.
// Usage: node scripts/check-split-clues-content.mjs   (starts its own servers, like check-official-practice)
import { spawn, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { PROTOCOL_HEADERS } from "./lib/protocol.mjs";

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

const ROOT = new URL("..", import.meta.url).pathname;
const PACKS = ["split-clues-everyday.json", "split-clues-christmas.json"];
const PUZZLES = PACKS.flatMap((f) => JSON.parse(readFileSync(join(ROOT, "content", "packs", f), "utf8")).items);
const EVERYDAY = new Set(PUZZLES.filter((p) => !p.season).map((p) => p.id));
const puzzleFrom = (clues) => { const found = PUZZLES.filter((p) => clues.every((c) => p.clues.includes(c))); return found.length === 1 ? found[0] : null; };

/** A server of this driver's own: fresh data, no content test mode, optionally another content directory. */
async function startServer(label, extraEnv = {}) {
  const data = mkdtempSync(join(tmpdir(), `mz-s1216-${label}-`));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: data, ...extraEnv };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
  const srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
  let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
  let port = null;
  for (let i = 0; i < 160 && !port; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) port = Number(m[1]); else await sleep(250); }
  if (!port) { console.log(`FAIL ${label}: the server did not start: ${out.slice(-400)}`); process.exit(1); }
  check(`${label}: the server runs without the content test mode`, !/provisional content treated as approved/.test(out));
  return { base: `http://localhost:${port}`, out: () => out, stop: () => { srv.kill(); rmSync(data, { recursive: true, force: true }); } };
}

/**
 * The isolated fixture: a copy of content/ plus TEST FIXTURE approvals for `ids` at the hashes the loader computes
 * (asked of the real loader, on the copy), so the approval path is the production one end to end.
 */
function fixtureContent(ids) {
  const dir = mkdtempSync(join(tmpdir(), "mz-s1216-fixture-"));
  cpSync(join(ROOT, "content"), dir, { recursive: true });
  const hashes = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", "import('./src/content/registry.ts').then((m) => { const lib = m.loadContent(process.env.FIXTURE_DIR); process.stdout.write(JSON.stringify(Object.fromEntries((lib.byGame.get('split-clues') ?? []).map((li) => [li.item.id, li.hash])))); })"], { cwd: ROOT, env: { ...process.env, FIXTURE_DIR: dir, MCHEZO_CONTENT_TEST_MODE: "" }, encoding: "utf8" }));
  const file = join(dir, "approvals.json");
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { schemaVersion: 1, approvals: [] };
  for (const id of ids) existing.approvals.push({ itemId: id, hash: hashes[id], reviewer: "TEST FIXTURE (not an editorial approval)", date: "2026-11-15", note: "Stage 12.16 driver fixture, in a temporary copy of content/" });
  writeFileSync(file, JSON.stringify(existing, null, 2));
  return { dir, hashes };
}

const browser = await launchChromium();
const phone = (width = 390) => browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" }).then((c) => c.newPage());
const shot = async (page, name) => { await page.mouse.move(1, 1); await page.screenshot({ path: screenshotPath(`docs/stage12/stage1216-screenshots/${name}.png`) }); };
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : "");

/** One room of four on `base`, made a Family Cup: host Keku, guests Amina, Baraka, Wanjiru (Wanjiru at 320 px). */
async function cupRoom(base) {
  const api = async (path, { token, body } = {}) => {
    const headers = { "content-type": "application/json", ...PROTOCOL_HEADERS };
    if (token) headers["x-session-token"] = token;
    const r = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const ok = async (path, opts) => { const r = await api(path, opts); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
  const host = await phone();
  await host.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await host.getByTestId("home-host").click();
  await host.getByPlaceholder("e.g. Auntie June").fill("Keku");
  await host.getByRole("button", { name: "Host a game", exact: true }).click();
  const chip = host.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  const pages = [host];
  for (const [name, width] of [["Amina", 390], ["Baraka", 390], ["Wanjiru", 320]]) {
    const p = await phone(width);
    await p.goto(`${base}/join`, { waitUntil: "domcontentloaded" });
    await p.getByPlaceholder("e.g. Auntie June").fill(name);
    await p.locator(".mz-code__input").fill(code);
    await p.getByRole("button", { name: "Join the game" }).click();
    await p.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
    pages.push(p);
  }
  const seats = [];
  for (const p of pages) seats.push(await p.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") })));
  const roomId = seats[0].roomId;
  await ok(`/rooms/${roomId}/cup`, { token: seats[0].token, body: {} });
  const tvProj = () => ok(`/rooms/${roomId}/projection?audience=tv`);
  await until(async () => (await tvProj()).roomKind === "cup");
  const intent = (seat, gid, action, payload) => ok(`/rooms/${roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId: gid, action, payload } } });
  const myState = async (seat, gid) => (await ok(`/rooms/${roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid)?.state;
  return { base, code, host, pages, seats, roomId, api, ok, tvProj, intent, myState };
}

/** Every team solves every puzzle (found from the team's clues); returns the puzzle ids played, in order. */
async function playToTheEnd(r, gid) {
  const played = [];
  const game = async () => (await r.tvProj()).games.find((g) => g.id === gid);
  for (let round = 0; round < 6; round++) {
    const g = await until(async () => { const x = await game(); return x?.state?.phase === "solve" && x.state.round === round ? x : null; }, 25000);
    if (!g) { check(`round ${round + 1} began`, false); return played; }
    const teamOf = (s) => g.teams?.members?.[s.playerId];
    const teams = [...new Set(r.seats.map(teamOf))];
    const clues = [];
    for (const s of r.seats.filter((x) => teamOf(x) === teams[0])) clues.push(...((await r.myState(s, gid))?.myClues ?? []));
    const p = puzzleFrom(clues);
    if (!p) { check(`round ${round + 1}: the puzzle is known from a team's clues`, false); return played; }
    played.push(p.id);
    for (const t of teams) await r.intent(r.seats.find((s) => teamOf(s) === t), gid, "split-guess", { round, text: p.answer });
  }
  await until(async () => (await game())?.status === "finished", 30000);
  return played;
}

try {
  // ---- A: shipped content, nothing approved ----
  const A = await startServer("A");
  const ra = await cupRoom(A.base);
  const [k, a] = ra.seats;
  await ra.host.getByTestId("choose-game").click();
  await ra.host.getByTestId("select-game-split-clues").click();
  const reason = await soon("A the Cup lobby says Split Clues is Practice only, and why (no approved puzzles)", async () => {
    const note = await text(ra.host.getByTestId("practice-only-note"));
    return /Practice only: Split Clues counts only with puzzles a person has approved/.test(note) && /0 unused approved puzzles/.test(note) && /Play it as Practice/.test(note) ? note : null;
  });
  console.log(`  (the note: ${reason})`);
  check("A Official is disabled; Practice is the start", await ra.host.getByTestId("mode-official").isDisabled() && (await ra.host.locator("[data-testid='start-practice-split-clues']").count()) === 1);
  const view = (await ra.ok(`/rooms/${ra.roomId}/projection?audience=player`, { token: k.token })).officialContent?.["split-clues"];
  check("A the server's lobby view: 0 of 6, with the reason (counts only)", view?.available === 0 && view?.needed === 6 && /approved/.test(view?.message ?? ""), JSON.stringify(view));
  await shot(ra.host, "cup-lobby-practice-only-390");
  await ra.pages[3].getByTestId("choose-game").count(); // guests never choose
  const forged = await ra.api(`/rooms/${ra.roomId}/games`, { token: k.token, body: { gameId: "split-clues", official: true } });
  check("A a forged Official start by the host is refused (409, the same reason), and nothing starts", forged.status === 409 && forged.body.code === "CONTENT_EXHAUSTED" && /counts only with puzzles a person has approved/.test(forged.body.error) && (await ra.tvProj()).games.length === 0, JSON.stringify(forged));
  const guest = await ra.api(`/rooms/${ra.roomId}/games`, { token: a.token, body: { gameId: "split-clues", official: true } });
  check("A a guest's Official start is refused", guest.status >= 400 && (await ra.tvProj()).games.length === 0, `${guest.status} ${JSON.stringify(guest.body)}`);
  // The host's own lobby at 320 px and on a desktop browser (more screens for the host, the same seat).
  for (const [width, height, name] of [[320, 844, "320"], [1440, 900, "desktop-1440"]]) {
    const hp = await (await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })).newPage();
    await hp.goto(`${A.base}/join`, { waitUntil: "domcontentloaded" });
    await hp.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, k);
    await hp.goto(`${A.base}/room`, { waitUntil: "domcontentloaded" });
    await soon(`A at ${width} px the host's lobby says the same, with Official disabled`, async () => /Practice only: Split Clues counts only/.test(await text(hp.getByTestId("practice-only-note"))) && await hp.getByTestId("mode-official").isDisabled());
    await hp.getByTestId("practice-only-note").scrollIntoViewIfNeeded();
    await shot(hp, `cup-lobby-practice-only-${name}`);
    check(`A ${width} px: no sideways scroll`, await hp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await hp.context().close();
  }
  const standingsBefore = JSON.stringify((await ra.tvProj()).championship ?? []);
  await ra.host.getByTestId("start-practice-split-clues").click();
  const ga = await until(async () => (await ra.tvProj()).games.find((g) => g.gameId === "split-clues"));
  check("A Practice from the lobby starts, as Practice", ga?.official === false, JSON.stringify({ official: ga?.official, status: ga?.status }));
  for (const s of ra.seats) await ra.intent(s, ga.id, "briefing-ready", { ready: true });
  const playedA = await playToTheEnd(ra, ga.id);
  const finA = (await ra.tvProj()).games.find((g) => g.id === ga.id);
  check("A the practice game played all six puzzles to the end, year-round ones only (a Cup)", finA?.status === "finished" && playedA.length === 6 && playedA.every((id) => EVERYDAY.has(id)), JSON.stringify(playedA));
  check("A nothing counted: the Cup standings are as before", JSON.stringify((await ra.tvProj()).championship ?? []) === standingsBefore);
  await soon("A the host's phone shows the practice game's results, as Practice", async () => /practice/i.test(await text(ra.host.locator("main"))) && !/counts toward the Family Cup/i.test(await text(ra.host.locator("main"))));
  await shot(ra.host, "practice-results-390");
  for (const p of ra.pages) await p.context().close();
  A.stop();

  // ---- B: an isolated fixture with six approved puzzles ----
  const approved = [...EVERYDAY].slice(0, 6);
  const fx = fixtureContent(approved);
  const shippedApprovals = () => { const f = join(ROOT, "content", "approvals.json"); return existsSync(f) ? readFileSync(f, "utf8") : ""; };
  const shippedBefore = shippedApprovals();
  check("B the fixture is a temporary copy outside the repository, approving exactly the six at their hashes; the shipped content has no Split Clues approval", !fx.dir.startsWith(ROOT) && approved.every((id) => /^[0-9a-f]{16}$/.test(fx.hashes[id])) && !/"sc-\d{3}"/.test(shippedBefore), `shipped approvals file: ${shippedBefore ? "present" : "none"}`);
  const B = await startServer("B", { MCHEZO_CONTENT_DIR: fx.dir });
  const rb = await cupRoom(B.base);
  const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })).newPage();
  await tv.goto(`${B.base}/tv?code=${rb.code}`, { waitUntil: "domcontentloaded" });
  await rb.host.getByTestId("choose-game").click();
  await rb.host.getByTestId("select-game-split-clues").click();
  await soon("B with six approved puzzles, Official is offered: enabled, no practice-only note", async () => !(await rb.host.getByTestId("mode-official").isDisabled()) && (await rb.host.getByTestId("practice-only-note").count()) === 0);
  await rb.host.getByTestId("mode-official").click();
  await soon("B the host's start is Official and says it counts toward the Family Cup", async () => (await rb.host.locator("[data-testid='start-official-split-clues']").count()) === 1);
  await shot(rb.host, "cup-lobby-official-390");
  await rb.host.getByTestId("start-official-split-clues").click();
  const gb = await until(async () => (await rb.tvProj()).games.find((g) => g.gameId === "split-clues"));
  check("B the game started as Official", gb?.official === true, JSON.stringify({ official: gb?.official, status: gb?.status }));
  await soon("B the TV's briefing says Official", async () => /^official\b/i.test(await text(tv.getByTestId("tv-briefing"))) && !/practice/i.test(await text(tv.getByTestId("tv-briefing"))));
  await shot(tv, "tv-briefing-official-1920");
  for (const s of rb.seats) await rb.intent(s, gb.id, "briefing-ready", { ready: true });
  // First round: the TV shows no clue or answer; a guest reloads and gets only their own clues back.
  const st0 = await until(async () => { const g = (await rb.tvProj()).games.find((x) => x.id === gb.id); return g?.state?.phase === "solve" ? g.state : null; });
  const wanjiru = rb.pages[3], w = rb.seats[3];
  const before = (await rb.myState(w, gb.id))?.myClues ?? [];
  await wanjiru.reload({ waitUntil: "domcontentloaded" });
  const after = await until(async () => { const v = (await rb.myState(w, gb.id))?.myClues; return v && v.length ? v : null; });
  check("B a guest's reload mid-round gives back exactly their own clues", JSON.stringify([...(after ?? [])].sort()) === JSON.stringify([...before].sort()) && before.length > 0, `${before.length} clue(s)`);
  await soon("B …on the reloaded phone, too", async () => (await Promise.all(before.map(async (c) => (await wanjiru.locator("body").innerText()).includes(c)))).every(Boolean));
  await shot(wanjiru, "official-round-320");
  const tvText = await tv.locator("body").innerText();
  const tvJson = JSON.stringify(await rb.tvProj());
  const p0 = PUZZLES.filter((p) => approved.includes(p.id));
  check("B while solving, the TV (screen and data) shows no clue and no answer of any approved puzzle", st0 && p0.every((p) => !tvText.includes(p.answer) && !tvJson.includes(p.answer) && p.clues.every((c) => !tvText.includes(c) && !tvJson.includes(c))));
  await shot(tv, "tv-solve-official-1920");
  const playedB = await playToTheEnd(rb, gb.id);
  check("B the Official game dealt exactly the six approved puzzles", JSON.stringify([...playedB].sort()) === JSON.stringify([...approved].sort()), JSON.stringify(playedB));
  const finB = (await rb.tvProj()).games.find((g) => g.id === gb.id);
  check("B it finished Official, with team results and Cup placements", finB?.status === "finished" && finB.official === true && (finB.teamResults?.length ?? 0) >= 2 && !!finB.cupPlacement, JSON.stringify({ status: finB?.status, official: finB?.official, teams: finB?.teamResults?.map((t) => [t.teamId, t.rank]) }));
  const backB = (await rb.ok(`/rooms/${rb.roomId}/projection?audience=player`, { token: rb.seats[0].token })).officialContent?.["split-clues"];
  check("B afterwards the lobby view says the approved puzzles are used up (0 of 6), never reusing them", backB?.available === 0 && backB?.needed === 6, JSON.stringify(backB));
  // The host's plan was Official Split Clues; with no approved puzzle left, every screen shows it as Practice.
  check("B the shared plan now says Split Clues · Practice (it can no longer be Official here)", JSON.stringify((await rb.tvProj()).upNext) === JSON.stringify({ gameId: "split-clues", official: false }), JSON.stringify((await rb.tvProj()).upNext));
  await soon("B the TV's Next up line says Practice, not Official", async () => { const t = await text(tv.getByTestId("tv-next")); return /Split Clues/.test(t) && /Practice/.test(t) && !/Official/.test(t); });
  await sleep(600);
  await shot(tv, "tv-final-official-1920");
  await soon("B the host's phone shows the results, as Official", async () => /official/i.test(await text(rb.host.locator("main"))));
  await shot(rb.host, "official-results-390");
  for (const p of rb.pages) await p.context().close();
  B.stop();
  rmSync(fx.dir, { recursive: true, force: true });
  check("B the shipped approvals are unchanged after the fixture run", shippedApprovals() === shippedBefore);
} catch (e) {
  check("the driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "SPLIT CLUES CONTENT PASSED" : `SPLIT CLUES CONTENT FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
