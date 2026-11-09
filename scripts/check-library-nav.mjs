// Stage 4: the Library and navigation, through real pages.
//   S3-LIB-01  inside a room, games show whether they fit the players
//              connected now, grouped that way; outside a room, plain
//              requirements only. Never "playable now".
//   S3-LIB-02  "Practice only" explains itself on the card.
//   S3-LIB-03  "Group size" (with "Your room (N)") instead of "Players in the room".
//   S3-LIB-04  sorting is its own control and never a filter; Done folds the
//              filters away; Clear filters keeps the sort.
//   S3-NAV-01  Back, Forward, refresh and a details sheet keep the Library's
//              search and filters (they live in the address).
//   S3-NAV-02  Back during a game, in a tab that opened the join link after
//              browsing the Library, lands on this app's Home with Rejoin, not
//              the Library; Forward, refresh and Rejoin return to the same
//              game, seat, clock and progress.
//   S3-LOB-03  a reply that isn't the game's JSON (a proxy page served with
//              200) never blanks the room: the lobby keeps its people.
// Starts ITS OWN server. Usage: node scripts/check-library-nav.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-libnav-"));
async function startServer() {
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR };
  delete env.NODE_ENV;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  for (let i = 0; i < 120 && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) return { child, port: Number(m[1]) };
    await sleep(250);
  }
  child.kill("SIGKILL");
  throw new Error(`server did not start: ${out.slice(-400)}`);
}
const server = await startServer();
const BASE = `http://localhost:${server.port}`;
// Stage 5: the catalog grows (practice-only new games); read its size from the server, never assume it.
const TOTAL = (await (await fetch(`${BASE}/games`)).json()).length;
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "Library check" } });
  const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: host.playerId, token: host.recoveryToken }];
  for (const n of names.slice(1)) {
    const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { roomId: room.roomId, code: room.joinCode, seats };
}
async function seatPage(browser, room, seat, path = "/room", viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return page;
}
const count = (page) => page.getByTestId("mz-lib-count").innerText().catch(() => "");
async function waitCount(page, text, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if ((await count(page)) === text) return true; await sleep(100); }
  return false;
}
const pathOf = (page) => { const u = new URL(page.url()); return u.pathname + u.search; };

const browser = await launchChromium();
try {
  // ---- Visitor library: plain requirements, practice-only explained, view in the address.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("home-all-games").click();
    await p.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
    check("visitor: no room-fit claims outside a room", (await p.locator('[data-testid^="mz-lib-fit-"]').count()) === 0 && (await p.locator('[data-testid^="mz-lib-group-"]').count()) === 0);
    check("S3-LIB-02: a legend says Practice only never counts toward the Cup", /never count toward the Family Cup/.test(await p.getByTestId("mz-lib-legend").innerText().catch(() => "")));
    await p.getByTestId("mz-lib-practice-charades").click();
    const why = await p.getByTestId("mz-lib-why-charades").innerText().catch(() => "");
    check("S3-LIB-02: the Practice only tag says what it means and why", /never counts toward the Family Cup/.test(why) && /Why:/.test(why), why);
    check("S3-LIB-02: the tag is a toggle that says it's expanded", (await p.getByTestId("mz-lib-practice-charades").getAttribute("aria-expanded")) === "true");
    // S3-NAV-01: search, Back to Home, Forward: the search is still there.
    await p.getByTestId("mz-lib-search").fill("trivia");
    check("search narrows to Trivia", await waitCount(p, `Showing 1 of ${TOTAL} games`));
    check("S3-NAV-01: the search is in the address", /[?&]q=trivia/.test(pathOf(p)), pathOf(p));
    await p.goBack();
    await p.getByTestId("home").waitFor({ timeout: 10000 });
    check("Back from the Library is Home", new URL(p.url()).pathname === "/");
    await p.goForward();
    await p.getByTestId("mz-lib-count").waitFor({ timeout: 10000 });
    check("S3-NAV-01: Forward brings the Library back with the search applied", (await p.getByTestId("mz-lib-search").inputValue()) === "trivia" && await waitCount(p, `Showing 1 of ${TOTAL} games`));
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.getByTestId("mz-lib-count").waitFor({ timeout: 10000 });
    check("S3-NAV-01: a refresh keeps the search", (await p.getByTestId("mz-lib-search").inputValue()) === "trivia" && await waitCount(p, `Showing 1 of ${TOTAL} games`));
    // Details sheet on top, then Back: the sheet closes, the view stays.
    await p.getByTestId("mz-lib-card-trivia").locator(".mz-libcard__open").click();
    await p.getByTestId("game-details").waitFor({ timeout: 10000 });
    check("S3-NAV-01: the details sheet keeps the view in its address", /[?&]q=trivia/.test(pathOf(p)) && /sheet=details/.test(pathOf(p)), pathOf(p));
    await p.goBack();
    await p.getByTestId("game-details").waitFor({ state: "detached", timeout: 10000 });
    check("S3-NAV-01: Back closes the details and keeps the search", (await p.getByTestId("mz-lib-search").inputValue()) === "trivia" && await waitCount(p, `Showing 1 of ${TOTAL} games`));
    // S3-LIB-04: sorting is not a filter; Done folds the panel; Clear filters keeps the sort.
    await p.getByTestId("mz-lib-search").fill("");
    await p.getByTestId("mz-lib-sort").selectOption("duration");
    check("S3-LIB-04: sorting is not counted as a filter (no chip, no count)", (await p.getByTestId("mz-lib-active").count()) === 0 && /^Filters\s*▾?$/.test((await p.getByTestId("mz-lib-filters-toggle").innerText()).trim()), (await p.getByTestId("mz-lib-filters-toggle").innerText()).trim());
    await p.getByTestId("mz-lib-filters-toggle").click();
    const help = await p.getByTestId("mz-lib-filters").innerText();
    check("S3-LIB-03: the size filter is 'Group size', not 'Players in the room'", /Group size/i.test(help) && !/Players in the room/i.test(help) && /work for this many players/.test(help));
    await p.getByTestId("mz-lib-style-team").click();
    check("a filter applies while the panel stays open to add more", await waitCount(p, `Showing 1 of ${TOTAL} games`) && await p.getByTestId("mz-lib-filters").isVisible());
    await p.getByTestId("mz-lib-done").click();
    check("S3-LIB-04: Done folds the filters away", (await p.getByTestId("mz-lib-filters").count()) === 0 && /Filters · 1/.test(await p.getByTestId("mz-lib-filters-toggle").innerText()));
    check("the address has the filter and the sort", /type=team/.test(pathOf(p)) && /sort=duration/.test(pathOf(p)), pathOf(p));
    await p.getByTestId("mz-lib-reset").click();
    check("Clear filters clears filters but keeps the sort", await waitCount(p, `Showing ${TOTAL} of ${TOTAL} games`) && (await p.getByTestId("mz-lib-sort").inputValue()) === "duration" && !/type=/.test(pathOf(p)));
    await p.screenshot({ path: screenshotPath("docs/stage4/after/lib-visitor-390.png") });
    await ctx.close();
  }

  // ---- In a room of 2: room fit (S3-LIB-01), "Your room (2)" (S3-LIB-03), the view kept in the room's address.
  const room = await makeRoom(["Keku", "Amina"]);
  {
    const guest = await seatPage(browser, room, room.seats[1]);
    await guest.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    for (const v of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      const host = await seatPage(browser, room, room.seats[0], "/room/library", v);
      await host.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
      let fitCaption = "";
      for (let i = 0; i < 30 && !/Needs 2 more players/.test(fitCaption); i++) { fitCaption = await host.getByTestId("mz-lib-fit-caption-clash").innerText().catch(() => ""); await sleep(150); }
      if (v.width === 390) {
        check("S3-LIB-01: a 4–10 player game says it needs 2 more players in a room of 2", /Needs 2 more players \(4–10 players\)/.test(fitCaption), fitCaption);
        check("S3-LIB-01: a 2-player game says it fits", /Fits your 2 players/.test(await host.getByTestId("mz-lib-fit-trivia").innerText()));
        check("S3-LIB-01: nothing claims to be 'playable now'", !/playable now/i.test(await host.locator("main").innerText()));
        const groups = await host.locator('[data-testid^="mz-lib-group-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
        check("S3-LIB-01: games that fit come first, then those needing more players", groups.join() === "mz-lib-group-fits,mz-lib-group-needs-more", groups.join());
        const firstNeeds = await host.getByTestId("mz-lib-group-needs-more").locator('[data-testid^="mz-lib-card-"]').first().getAttribute("data-fit");
        check("S3-LIB-01: games needing more players are drawn as not fitting", firstNeeds === "needs-more");
        await host.getByTestId("mz-lib-filters-toggle").click();
        await host.getByTestId("mz-lib-players-room").click();
        check("S3-LIB-03: 'Your room (2)' shows only games for 2", await waitCount(host, `Showing 6 of ${TOTAL} games`) && /Fits your room \(2\)/.test(await host.getByTestId("mz-lib-active").innerText()));
        check("the room's library keeps its view in the address", /^\/room\/library\?players=room/.test(pathOf(host)), pathOf(host));
        await host.reload({ waitUntil: "domcontentloaded" });
        await host.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
        check("S3-NAV-01 in a room: a refresh keeps 'Your room'", await waitCount(host, `Showing 6 of ${TOTAL} games`));
        await host.getByTestId("mz-lib-reset").click();
        await waitCount(host, `Showing ${TOTAL} of ${TOTAL} games`);
      }
      const over = await host.evaluate(() => document.scrollingElement.scrollWidth > innerWidth + 1);
      check(`library in a room at ${v.width}×${v.height}: no sideways scrolling`, !over);
      await host.screenshot({ path: screenshotPath(`docs/stage4/after/lib-room2-${v.width}.png`) });
      await host.context().close();
    }
    await guest.context().close();
  }

  // ---- S3-NAV-02: the join link opened after browsing the Library; Back mid-game.
  {
    const r = await makeRoom(["Keku"]);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/library`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
    await p.goto(`${BASE}/join?code=${r.code}`, { waitUntil: "domcontentloaded" }); // a fresh page, as when a link is opened
    await p.getByTestId("join-screen").waitFor({ timeout: 15000 });
    await p.locator('input[autocomplete="nickname"]').fill("Amina");
    await p.getByRole("button", { name: "Join the game" }).click();
    await p.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    const me = await p.evaluate(() => ({ playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") }));
    const { gameId: gid } = await api(`/rooms/${r.roomId}/games`, { token: r.seats[0].token, body: { gameId: "math-mayhem", official: false } });
    await api(`/rooms/${r.roomId}/intents`, { token: r.seats[0].token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: r.roomId, gameInstanceId: gid, action: "briefing-ready", payload: { ready: true } } } });
    await p.getByRole("button", { name: /I.?m ready/i }).click();
    await p.locator("h1.mz-question").waitFor({ timeout: 20000 });
    await p.locator(".mz-slab:not([disabled])").first().click();
    await sleep(800);
    const answeredBefore = Object.keys((await api(`/rooms/${r.roomId}/projection?audience=player`, { token: me.token })).myGames.find((g) => g.id === gid).myAnswers ?? {}).length;
    await p.goBack();
    await sleep(1200);
    const landed = new URL(p.url()).pathname;
    check("S3-NAV-02: Back mid-game lands on this app's Home, not the Library", landed === "/" && (await p.getByTestId("home").count()) === 1, landed);
    const rejoin = await p.getByTestId("home-rejoin").innerText().catch(() => "");
    check("S3-NAV-02: Home offers Rejoin and says the game is still running", /Rejoin/.test(rejoin) && /in progress/.test(rejoin), rejoin.replace(/\n/g, " | "));
    const g = (await api(`/rooms/${r.roomId}/projection?audience=player`, { token: me.token })).myGames.find((x) => x.id === gid);
    check("S3-NAV-02: the game kept running on the server (not paused), seat and answers intact", g.status === "playing" && Object.keys(g.myAnswers ?? {}).length === answeredBefore && answeredBefore >= 1);
    await p.goForward();
    await p.locator("h1.mz-question, .mz-lockcard, [aria-label='Getting your next question']").first().waitFor({ timeout: 15000 });
    check("S3-NAV-02: Forward returns to the same game", new URL(p.url()).pathname === "/room");
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.locator("h1.mz-question, .mz-lockcard, [aria-label='Getting your next question']").first().waitFor({ timeout: 20000 });
    check("S3-NAV-02: a refresh returns to the same game", new URL(p.url()).pathname === "/room");
    await p.goBack();
    await p.getByTestId("home-rejoin-btn").click();
    await p.locator("h1.mz-question, .mz-lockcard, [aria-label='Getting your next question']").first().waitFor({ timeout: 15000 });
    const after = (await api(`/rooms/${r.roomId}/projection?audience=player`, { token: me.token })).myGames.find((x) => x.id === gid);
    check("S3-NAV-02: Rejoin returns to the same game, progress kept", after.status === "playing" && Object.keys(after.myAnswers ?? {}).length === answeredBefore);
    await ctx.close();
  }

  // ---- S3-LOB-03: a proxy page served with 200 instead of the room.
  {
    const r = await makeRoom(["Keku", "Amina"]);
    const p = await seatPage(browser, r, r.seats[0]);
    await p.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    await p.route("**/rooms/**/projection**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>This codespace is stopped</body></html>" }));
    await p.routeWebSocket(/.*/, (ws) => ws.close());
    await sleep(9000);
    const text = await p.evaluate(() => document.body.innerText);
    check("S3-LOB-03: the room never goes blank on a proxy page", text.trim().length > 0);
    check("S3-LOB-03: the lobby keeps its people (no 'friend', no '0 here')", /You’re in, Keku\./.test(text) && /2 here/.test(text) && !/friend/.test(text), text.replace(/\n+/g, " | ").slice(0, 200));
    check("S3-LOB-03: and says the server can't be reached", /Can.t reach the game server|Reconnecting|Connection lost/i.test(text));
    await p.screenshot({ path: screenshotPath("docs/stage4/after/lob03-proxy-page-390.png") });
    await p.unroute("**/rooms/**/projection**");
    await sleep(3000);
    check("S3-LOB-03: when the server answers again, the room carries on", /You’re in, Keku\./.test(await p.evaluate(() => document.body.innerText)));
    await p.context().close();
  }
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
}
console.log(failures === 0 ? "ALL LIBRARY/NAV CHECKS PASSED" : `${failures} LIBRARY/NAV CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
