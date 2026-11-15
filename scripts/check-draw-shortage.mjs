// Stage 12.17-R (review 6898755998 R1; docs/stage12/stage1217r.md; D-S1217R-01): a drawing game with too few words
// for its turns is refused at Start, visibly, and the lobby recovers. On a server of its own with a TEST-ONLY content
// directory: a copy of content/ in which the review rejects every drawing word but one year-round and three Christmas
// ones (the shipped files are never touched; nothing is approved).
//   1 a casual room of three at 390 px: the host picks Draw & Guess with Everyday content and presses Start
//   2 refused: the host sees why (3 words needed, only 1 Everyday), nobody is taken into a game, the server holds no game,
//     the page fits at 390 and 320 px
//   3 the host switches content to Christmas and presses Start again: the briefing opens for everyone
// Usage: node scripts/check-draw-shortage.mjs   (starts its own server; screenshots in docs/stage12/stage1217r-screenshots/)
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}

const owned = { dirs: [], child: null, out: "" };
let browser;
try {
  // The TEST-ONLY library: one Everyday word and three Christmas words survive the "review".
  const content = mkdtempSync(join(tmpdir(), "mz-s1217r-content-"));
  owned.dirs.push(content);
  cpSync(join(ROOT, "content"), content, { recursive: true });
  const packFile = join(content, "packs", "draw-prompts.json");
  const pack = JSON.parse(readFileSync(packFile, "utf8"));
  const keep = new Set([pack.items.find((i) => !i.season).id, ...pack.items.filter((i) => i.season === "christmas").slice(0, 3).map((i) => i.id)]);
  for (const item of pack.items) if (!keep.has(item.id)) item.review = { status: "rejected" };
  writeFileSync(packFile, JSON.stringify(pack));
  const data = mkdtempSync(join(tmpdir(), "mz-s1217r-data-"));
  owned.dirs.push(data);
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: data, MCHEZO_CONTENT_DIR: content };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
  owned.child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  owned.child.stdout.on("data", (d) => { owned.out += d; }); owned.child.stderr.on("data", (d) => { owned.out += d; });
  let port;
  for (let i = 0; i < 160 && !port && owned.child.exitCode === null; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(owned.out); if (m) port = Number(m[1]); else await sleep(250); }
  if (!port) throw new Error(`the server did not start: ${owned.out.slice(-300)}`);
  const BASE = `http://localhost:${port}`;
  check("the server runs the test-only library without the content test mode", /TEST MODE: content loaded from/.test(owned.out) && !/provisional content treated as approved/.test(owned.out));
  const api = async (path, body, token) => {
    const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { "x-session-token": token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const room = (await api("/rooms", { name: "Short of words", kind: "casual" })).body;
  const host = (await api(`/rooms/${room.roomId}/join`, { displayName: "Keku", asHost: true, hostClaimToken: room.hostClaimToken })).body;
  const guests = [];
  for (const name of ["Amina", "Baraka"]) guests.push((await api("/rooms/join-by-code", { joinCode: room.joinCode, displayName: name })).body);

  browser = await launchChromium();
  const seat = async (s, width = 390) => {
    const page = await (await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" })).newPage();
    await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await page.evaluate((x) => { sessionStorage.setItem("cgn_roomId", x.roomId); sessionStorage.setItem("cgn_playerId", x.playerId); sessionStorage.setItem("cgn_token", x.token); }, { roomId: room.roomId, playerId: s.playerId, token: s.recoveryToken });
    await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    return page;
  };
  const gp = [];
  for (const g of guests) gp.push(await seat(g));
  const h = await seat(host);
  const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const gameCount = async () => ((await api(`/rooms/${room.roomId}/projection?audience=player`, null, host.recoveryToken)).body.games ?? []).length;

  // 1-2: Everyday, one word for three turns.
  await h.getByTestId("choose-game").click();
  await h.getByTestId("select-game-draw-guess").click();
  await soon("the host's Up next is Draw & Guess with Everyday content", async () => /Draw & Guess/.test(await h.locator(".mz-upnext__name").first().innerText()) && (await h.getByTestId("up-next-content").getAttribute("data-season")) === "everyday");
  await h.getByTestId("start-practice-draw-guess").click();
  const alert = await soon("Start is refused, and the host sees why: 3 words needed, only 1 Everyday, with the way out", async () => {
    const t = await h.getByTestId("mz-error").innerText().catch(() => "");
    return /Draw & Guess needs 3 drawing words \(one for each of the 3 turns\), and there is only 1 Everyday drawing word to deal, so nothing started\. Choose another game, or switch to Christmas content\./.test(t) ? t : null;
  });
  check("nothing started: the server holds no game", (await gameCount()) === 0);
  check("the host is still in the lobby (no briefing)", (await h.getByTestId("lobby-dock").count()) === 1 && (await h.getByTestId("briefing-ready").count()) === 0);
  for (const [i, p] of gp.entries()) check(`guest ${i + 1} is still in the lobby`, (await p.getByTestId("lobby-dock").count()) === 1 && (await p.getByTestId("briefing-ready").count()) === 0);
  check("the refusal fits at 390 px", await fits(h));
  await h.screenshot({ path: screenshotPath("docs/stage12/stage1217r-screenshots/draw-shortage-refused-390.png") });
  if (alert) {
    // The same refusal on a 320 px phone (a second host tab of the same seat).
    const narrow = await seat(host, 320);
    await narrow.getByTestId("choose-game").click().catch(() => {});
    await narrow.getByTestId("select-game-draw-guess").click().catch(() => {});
    await narrow.getByTestId("start-practice-draw-guess").click();
    await soon("at 320 px the refusal shows and the page fits", async () => /needs 3 drawing words/.test(await narrow.getByTestId("mz-error").innerText().catch(() => "")) && (await fits(narrow)));
    await narrow.screenshot({ path: screenshotPath("docs/stage12/stage1217r-screenshots/draw-shortage-refused-320.png") });
    await narrow.context().close();
    check("still no game after the second refusal", (await gameCount()) === 0);
  }

  // 3: Christmas content has enough words; Start again.
  await h.getByTestId("lobby-content-christmas").click();
  await soon("the content is now Christmas", async () => (await h.getByTestId("up-next-content").getAttribute("data-season")) === "christmas");
  await h.getByTestId("start-practice-draw-guess").click();
  await soon("the retry starts: the briefing opens for the host", async () => (await h.getByTestId("briefing-ready").count()) === 1, 15000);
  for (const [i, p] of gp.entries()) await soon(`the briefing opens for guest ${i + 1}`, async () => (await p.getByTestId("briefing-ready").count()) === 1, 15000);
  check("the server holds exactly one game, Draw & Guess, with Christmas content", await (async () => { const g = (await api(`/rooms/${room.roomId}/projection?audience=player`, null, host.recoveryToken)).body.games ?? []; return g.length === 1 && g[0].gameId === "draw-guess" && g[0].season === "christmas"; })());
  await h.screenshot({ path: screenshotPath("docs/stage12/stage1217r-screenshots/draw-shortage-retry-christmas-390.png") });
} catch (e) {
  check("the driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  if (failures) console.log(`--- server output ---\n${owned.out.slice(-1500)}`);
  await browser?.close().catch(() => {});
  if (owned.child && owned.child.exitCode === null && owned.child.signalCode === null) { const exited = new Promise((r) => owned.child.once("exit", r)); owned.child.kill("SIGTERM"); const hard = setTimeout(() => owned.child.kill("SIGKILL"), 5000); await exited; clearTimeout(hard); }
  for (const d of owned.dirs) rmSync(d, { recursive: true, force: true });
  console.log(`cleanup: server stopped; ${owned.dirs.length} temporary dir(s) removed`);
}
console.log(failures === 0 ? "DRAW SHORTAGE CHECKS PASSED" : `DRAW SHORTAGE CHECKS FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
