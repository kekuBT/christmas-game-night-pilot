// Stage 4: the small defects from Muse's Stage 3 audit, through real pages.
//   S3-TRV-02  similar names ("Audit Guest", "Audit Third") stay distinguishable
//              in the waiting ring and the lobby circle (10 similar names too).
//   S3-TRV-03  the results' Standings step offers "Replay from Q1" instead of a
//              greyed-out "Play reveal"; replaying shows only finished data.
//   S3-WCN-03  Word Connections tiles use one type size per board and nothing
//              overflows, at 375, 390 and 430.
//   S3-STU-01  Team Clash's copy matches its result; an infeasible format says
//              which games it needs and their player counts.
//   S3-STU-02  guests opening Studio are told it is a host tool; hosts reach it
//              from the Library as well as the room menu.
//   S3-JOIN-01 the join screen says where to find the code once.
// Starts ITS OWN server (test content mode, for practice content). Usage:
//   node scripts/check-stage4-details.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-s4det-"));
async function startServer() {
  // No content test mode: these checks play practice games only, and practice may use any non-rejected item.
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE;
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
  const room = await api("/rooms", { body: { name: "Details check" } });
  const host = await api(`/rooms/${room.roomId}/join`, { body: { displayName: names[0], asHost: true, hostClaimToken: room.hostClaimToken } });
  const seats = [{ name: names[0], playerId: host.playerId, token: host.recoveryToken }];
  for (const n of names.slice(1)) {
    const j = await api("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: n } });
    seats.push({ name: n, playerId: j.playerId, token: j.recoveryToken });
  }
  return { roomId: room.roomId, code: room.joinCode, seats };
}
const intent = (room, seat, gid, action, payload) =>
  api(`/rooms/${room.roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
async function seatPage(browser, room, seat, path = "/room", viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return page;
}
async function startPlaying(room, gameId) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId, official: false } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  for (let i = 0; i < 40; i++) {
    const g = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: room.seats[0].token })).myGames.find((x) => x.id === gid);
    if (g?.status === "playing") return { gid, g };
    await sleep(200);
  }
  throw new Error("play did not begin");
}
/** Labels drawn under tokens: their text, and whether any is cut off. */
const labelsIn = (page, sel) => page.locator(sel).evaluateAll((els) => els.map((e) => ({ text: (e.textContent ?? "").trim(), title: e.getAttribute("title") ?? "", cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 })));

const browser = await launchChromium();
try {
  // ---- S3-TRV-02 and S3-TRV-03.
  {
    const room = await makeRoom(["Audit Host", "Audit Guest", "Audit Third"]);
    const { gid, g } = await startPlaying(room, "trivia");
    for (const q of g.state.questions) await intent(room, room.seats[0], gid, "trivia-answer", { questionId: q.id, chosenIndex: 0 });
    const host = await seatPage(browser, room, room.seats[0]);
    await host.locator(".mz-wait__seat .mz-seat__name").first().waitFor({ timeout: 15000 });
    await sleep(500);
    const ring = await labelsIn(host, ".mz-wait__seat .mz-seat__name");
    const others = ring.filter((l) => l.text !== "You");
    check("S3-TRV-02: the waiting ring tells 'Audit Guest' and 'Audit Third' apart", others.length === 2 && new Set(others.map((l) => l.text)).size === 2 && others.every((l) => !/^Au…?$/.test(l.text)), JSON.stringify(others.map((l) => l.text)));
    check("S3-TRV-02: the ring's labels aren't cut off, and keep the full name as a tooltip", others.every((l) => !l.cut && l.title.startsWith("Audit ")), JSON.stringify(others));
    await host.screenshot({ path: screenshotPath("docs/stage4/after/trv02-ring-390.png") });
    for (const s of room.seats.slice(1)) for (const q of g.state.questions) await intent(room, s, gid, "trivia-answer", { questionId: q.id, chosenIndex: 1 });
    const guest = await seatPage(browser, room, room.seats[1]);
    await guest.getByTestId("mz-reveal-standings").click({ timeout: 20000 });
    await guest.getByTestId("mz-reveal-step").and(guest.locator('[data-step-kind="standings"]')).waitFor({ timeout: 10000 });
    const disabled = await guest.locator('[data-testid="mz-reveal-step"] button:disabled').count();
    check("S3-TRV-03: the standings step shows no greyed-out control", disabled === 0 && (await guest.getByTestId("mz-reveal-play").count()) === 0, `${disabled} disabled`);
    await guest.screenshot({ path: screenshotPath("docs/stage4/after/trv03-standings-390.png") });
    if ((await guest.getByTestId("mz-reveal-replay").count()) === 0) check("S3-TRV-03: 'Replay from Q1' is offered on the standings step", false, "no replay button");
    else {
      await guest.getByTestId("mz-reveal-replay").click();
      const step = await guest.getByTestId("mz-reveal-step").getAttribute("data-step-kind");
      const idx = await guest.getByTestId("mz-reveal-step").getAttribute("data-step-index");
      check("S3-TRV-03: 'Replay from Q1' goes back to the first question and plays", step === "question" && idx === "0" && (await guest.getByTestId("mz-reveal-play").getAttribute("aria-pressed")) === "true", `${step}:${idx}`);
      await guest.screenshot({ path: screenshotPath("docs/stage4/after/trv03-replay-390.png") });
    }
    await host.context().close(); await guest.context().close();
  }
  // ---- S3-TRV-02 in a full lobby of 10 similar names.
  {
    const names = ["Cousin Amani", "Cousin Baraka", "Cousin Chausiku", "Cousin Daudi", "Cousin Eshe", "Cousin Faraji", "Cousin Gathoni", "Cousin Hamisi", "Cousin Imani", "Cousin Jabari"];
    const room = await makeRoom(names);
    const pages = [];
    for (const s of room.seats.slice(1)) { const p = await seatPage(browser, room, s, "/room", { width: 375, height: 667 }); pages.push(p); }
    const host = await seatPage(browser, room, room.seats[0], "/room", { width: 375, height: 667 });
    await host.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    await sleep(1500);
    const labels = (await labelsIn(host, ".mz-circle .mz-seat__name")).filter((l) => l.text !== "You");
    check("S3-TRV-02: ten 'Cousin …' names get ten different labels in the lobby circle", labels.length === 9 && new Set(labels.map((l) => l.text)).size === 9, JSON.stringify(labels.map((l) => l.text)));
    check("S3-TRV-02: each label comes from that player's own name", labels.every((l) => l.title.startsWith(l.text.replace(/ .\.$/, ""))));
    check("S3-TRV-02: no lobby label is cut off (\"Cousin…\" would hide which cousin)", labels.every((l) => !l.cut), JSON.stringify(labels.filter((l) => l.cut).map((l) => l.text)));
    await host.screenshot({ path: screenshotPath("docs/stage4/after/trv02-lobby-10-375.png") });
    for (const p of pages) await p.context().close();
    await host.context().close();
  }
  // ---- S3-WCN-03.
  {
    const room = await makeRoom(["Keku", "Amina"]);
    await startPlaying(room, "word-connections");
    for (const v of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
      const p = await seatPage(browser, room, room.seats[0], "/room", v);
      await p.locator(".mz-cx-tile").first().waitFor({ timeout: 15000 });
      const tiles = await p.locator(".mz-cx-tile").evaluateAll((els) => els.map((e) => ({ text: e.textContent, size: getComputedStyle(e).fontSize, over: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 })));
      const sizes = new Set(tiles.map((t) => t.size));
      check(`S3-WCN-03 at ${v.width}: one type size for all 16 tiles`, tiles.length === 16 && sizes.size === 1, [...sizes].join(","));
      check(`S3-WCN-03 at ${v.width}: no tile's words overflow or get clipped`, tiles.every((t) => !t.over), tiles.filter((t) => t.over).map((t) => t.text).join(","));
      await p.screenshot({ path: screenshotPath(`docs/stage4/after/wcn03-tiles-${v.width}.png`) });
      await p.context().close();
    }
  }
  // ---- S3-STU-01 / S3-STU-02.
  {
    const room = await makeRoom(["Keku", "Amina"]);
    const guestLobby = await seatPage(browser, room, room.seats[1]);
    await guestLobby.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    const host = await seatPage(browser, room, room.seats[0], "/room/studio");
    await host.getByTestId("studio-format-team-clash").click({ timeout: 15000 });
    await host.getByTestId("studio-infeasible").waitFor({ timeout: 10000 });
    const desc = await host.locator("main").innerText();
    check("S3-STU-01: Team Clash's description no longer promises repeated Charades rounds that can't happen", !/catalog gap is shown/.test(desc) && /only one is Charades/.test(desc));
    const why = await host.getByTestId("studio-infeasible-why").innerText();
    check("S3-STU-01: the 'no games fit' message says what Team Clash needs", /Charades \(\d+–\d+ players\)/.test(why) && /Invite more players/.test(why), why);
    await host.screenshot({ path: screenshotPath("docs/stage4/after/stu01-team-clash-390.png"), fullPage: true });
    await host.goto(`${BASE}/room/library`, { waitUntil: "domcontentloaded" });
    await host.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
    check("S3-STU-02: the host finds Studio from the Library too", await host.getByTestId("mz-lib-studio").isVisible());
    const guest = await seatPage(browser, room, room.seats[1], "/room/studio");
    await guest.getByTestId("studio-host-only").waitFor({ timeout: 15000 });
    check("S3-STU-02: a guest opening Studio is told it's a host tool, with no planner", (await guest.locator('[data-testid^="studio-format-"]').count()) === 0);
    await guest.goto(`${BASE}/room/library`, { waitUntil: "domcontentloaded" });
    await guest.getByTestId("mz-lib-count").waitFor({ timeout: 15000 });
    check("S3-STU-02: guests don't get the Studio link", (await guest.getByTestId("mz-lib-studio").count()) === 0);
    await host.context().close(); await guest.context().close(); await guestLobby.context().close();
  }
  // ---- S3-JOIN-01.
  {
    const room = await makeRoom(["Keku"]);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/join?code=${room.code}`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("join-screen").waitFor({ timeout: 15000 });
    const text = await p.getByTestId("join-screen").innerText();
    const mentions = (text.match(/host’s screen/g) ?? []).length;
    check("S3-JOIN-01: where to find the code is said once", mentions === 1, `${mentions} mentions`);
    check("S3-JOIN-01: the code is still pre-filled from the link", (await p.locator(".mz-code__input").inputValue()) === room.code);
    await p.screenshot({ path: screenshotPath("docs/stage4/after/join01-390.png") });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
}
console.log(failures === 0 ? "ALL STAGE 4 DETAIL CHECKS PASSED" : `${failures} STAGE 4 DETAIL CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
