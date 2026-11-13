// Stage 10.5 (docs/stage10/stage105.md; D-S105-01..05): a Memory Book that stays current, in real browsers.
//   Two books open at once (Keku, the host: Everyday, 390 px; Amina, a guest: Christmas, 320 px). Another member's add,
//   approve and revoke show on both within 3 s (a live socket), drafts and focus kept. No book fetch while nothing
//   changes. Markdown on screen is taken down when the book moves on. Fresh exports in every format, built from a fresh
//   snapshot: a stale page that still shows a revoked note approved exports without it. A late, reordered reply is
//   dropped. The export check failing on the network: a visible failure, and no download. A failed approve changes
//   nothing. Offline and back reconciles; with no socket at all, the 2-second poll brings the change within 5 s. Leaving
//   the book stops book fetches; switching rooms shows only the new room's book.
// Starts ITS OWN server. Usage: node scripts/check-book-live.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-booklive-"));
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
async function makeRoom(names, name = "Live book", kind = undefined) {
  const room = await api("/rooms", { body: { name, ...(kind ? { kind } : {}) } });
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
const solve = (prompt) => {
  const pct = /^(\d+)% of (\d+)/.exec(prompt);
  if (pct) return (Number(pct[1]) * Number(pct[2])) / 100;
  const [a, op, b] = prompt.replace(/[=?]/g, " ").trim().split(/\s+/);
  const x = Number(a), y = Number(b);
  return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
};
/** A practice Math game everyone plays through, so the room has a finished game to cite. */
async function playMath(room) {
  const seen = await api(`/rooms/${room.roomId}/projection?audience=player`, { token: room.seats[0].token });
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "math-mayhem", official: false, roster: seen.readiness?.wouldPlay } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  for (const s of room.seats) {
    const g = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((x) => x.id === gid);
    for (const q of g.questions) {
      const o = await intent(room, s, gid, "math-open", { questionId: q.id });
      await intent(room, s, gid, "submit-math-answer", { questionId: q.id, chosenIndex: o.result.options.findIndex((x) => Number(x) === solve(o.result.prompt)) });
    }
  }
  const ledger = await api(`/rooms/${room.roomId}/ledger?watermark=1`, { token: room.seats[0].token });
  return ledger.events.find((e) => e.type === "game-finished" && e.gameInstanceId === gid).eventId;
}
const noSideways = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll("main")].every((m) => m.scrollWidth <= m.clientWidth + 1));
const BOOK = /\/memory\?revision=1$/;

/** A seated page on the Memory Book. It counts its book fetches and records every word drawn on a canvas (the share image). */
async function seatPage(browser, room, seat, viewport, look) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.addInitScript((l) => {
    try { localStorage.setItem("mz_look", l); } catch { /* none */ }
    window.__drawn = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) { window.__drawn.push(String(t)); return fill.call(this, t, ...rest); };
  }, look);
  const page = await ctx.newPage();
  page.bookFetches = { [room.roomId]: 0 };
  page.on("request", (r) => {
    const m = /\/rooms\/([^/]+)\/memory\?revision=1$/.exec(r.url());
    if (m) page.bookFetches[m[1]] = (page.bookFetches[m[1]] ?? 0) + 1;
  });
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}/room/memories`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("memory-screen").waitFor({ timeout: 15000 });
  return page;
}
const card = (p, text) => p.getByTestId("memory-entry").filter({ hasText: text });
const stateOf = async (p, text) => {
  const c = card(p, text);
  if ((await c.count()) === 0) return "absent";
  const t = await c.first().innerText();
  return /· approved/.test(t) ? "approved" : /· pending/.test(t) ? "pending" : "?";
};
/** Milliseconds from `t0` until `cond` holds, or -1 after `ms`. */
async function untilFrom(t0, ms, cond) {
  while (Date.now() - t0 < ms) {
    if (await cond().catch(() => false)) return Date.now() - t0;
    await sleep(40);
  }
  return -1;
}
const TARGET = 3000; // healthy, connected (spec §7)
const POLL_TARGET = 5000; // no socket, the 2-second poll only
/** Download from a click and return the file's bytes as text (jsPDF writes text uncompressed). */
async function download(p, testId) {
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.getByTestId(testId).click()]);
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path()).toString("latin1") };
}
const drawn = (p) => p.evaluate(() => window.__drawn.splice(0).join(" | "));

const browser = await launchChromium();
try {
  // A casual room: the host role can be handed over there (B8b).
  const room = await makeRoom(["Keku", "Amina", "Baraka"], "Live book", "casual");
  const [keku, amina, baraka] = room.seats;
  const fin = await playMath(room);
  await api(`/rooms/${room.roomId}/cohost`, { token: keku.token, body: { targetId: baraka.playerId } });
  const add = (seat, text) => api(`/rooms/${room.roomId}/memory`, { token: seat.token, body: { day: 1, text, sourceEventIds: [fin] } });
  const decide = (seat, id, kind) => api(`/rooms/${room.roomId}/memory/${id}/${kind}`, { token: seat.token, body: {} });

  const K = await seatPage(browser, room, keku, { width: 390, height: 844 }, "everyday");
  const A = await seatPage(browser, room, amina, { width: 320, height: 740 }, "christmas");
  check("B0 both books are open and empty", (await K.getByTestId("memory-empty").count()) === 1 && (await A.getByTestId("memory-empty").count()) === 1);
  check("B0 each book's title follows its look", (await K.getByTestId("memory-title").innerText()) === "Mchezo Memory Book" && (await A.getByTestId("memory-title").innerText()) === "Christmas Memory Book");

  // ---------- B1. Another member adds, approves, revokes: both open books follow, within the target. ----------
  const DRAFT = "Amina draft not sent yet";
  const area = A.getByPlaceholder("e.g. Ada won Math Mayhem in a tie-break");
  await area.click();
  await area.fill(DRAFT);
  let t0 = Date.now();
  const n1 = await add(baraka, "Baraka note about the tea");
  const kMs = await untilFrom(t0, TARGET, async () => (await stateOf(K, "Baraka note about the tea")) === "pending");
  const aMs = await untilFrom(t0, TARGET, async () => (await stateOf(A, "Baraka note about the tea")) === "pending");
  check("B1 Baraka adds a note: Keku's open book shows it within 3 s", kMs >= 0, `${kMs} ms`);
  check("B1 … and Amina's, within 3 s", aMs >= 0, `${aMs} ms`);
  check("B1 Amina's unsent draft is still there, and still has focus", (await area.inputValue()) === DRAFT && await area.evaluate((e) => document.activeElement === e));

  t0 = Date.now();
  await card(K, "Baraka note about the tea").getByRole("button", { name: "Approve", exact: true }).click();
  const apMs = await untilFrom(t0, TARGET, async () => (await stateOf(A, "Baraka note about the tea")) === "approved");
  check("B1 Keku approves on his page: Amina's book shows it approved within 3 s", apMs >= 0, `${apMs} ms`);
  check("B1 Amina still sees no Approve or Revoke", (await card(A, "Baraka note about the tea").getByRole("button", { name: /Approve|Revoke/ }).count()) === 0);
  check("B1 Amina's draft survived the approval too", (await area.inputValue()) === DRAFT);
  check("B1 Amina's book at 320 px: no sideways scroll", await noSideways(A));
  await A.screenshot({ path: screenshotPath("docs/stage10/stage105-screenshots/live-guest-320-christmas.png"), fullPage: true });

  // ---------- B2. Nothing changes: no book fetches (no storm), though the poll runs every 2 s. ----------
  const quiet = { k: K.bookFetches[room.roomId], a: A.bookFetches[room.roomId] };
  await sleep(5000);
  check("B2 5 s with no change: neither page fetched the book", K.bookFetches[room.roomId] === quiet.k && A.bookFetches[room.roomId] === quiet.a, JSON.stringify({ k: K.bookFetches[room.roomId] - quiet.k, a: A.bookFetches[room.roomId] - quiet.a }));

  // ---------- B3. Markdown on screen is taken down when the book moves on. ----------
  await K.getByTestId("memory-md").click();
  await K.getByTestId("memory-md-text").waitFor({ timeout: 10000 });
  check("B3 Keku's Markdown export has the approved note", (await K.getByTestId("memory-md-text").innerText()).includes("Baraka note about the tea"));
  t0 = Date.now();
  await decide(baraka, n1.id, "revoke");
  const mdMs = await untilFrom(t0, TARGET, async () => (await K.getByTestId("memory-md-text").count()) === 0 && await K.getByTestId("memory-md-stale").isVisible());
  check("B3 Baraka (cohost) revokes it: the export on Keku's screen is taken down, and says why, within 3 s", mdMs >= 0, `${mdMs} ms`);
  check("B3 … and the note shows pending on both pages", (await stateOf(K, "Baraka note about the tea")) === "pending" && (await untilFrom(Date.now(), TARGET, async () => (await stateOf(A, "Baraka note about the tea")) === "pending")) >= 0);
  await K.getByTestId("memory-md-stale").scrollIntoViewIfNeeded();
  await K.screenshot({ path: screenshotPath("docs/stage10/stage105-screenshots/md-stale-390.png") });

  // ---------- B4. Fresh exports in each format. ----------
  await decide(keku, n1.id, "approve");
  const n2 = await add(keku, "Second approved note");
  await decide(keku, n2.id, "approve");
  await untilFrom(Date.now(), TARGET, async () => (await stateOf(K, "Second approved note")) === "approved");
  let before = K.bookFetches[room.roomId];
  await K.getByTestId("memory-md").click();
  await K.getByTestId("memory-md-text").waitFor({ timeout: 10000 });
  const md = await K.getByTestId("memory-md-text").innerText();
  check("B4 Markdown: both approved notes", md.includes("Baraka note about the tea") && md.includes("Second approved note"));
  const pdf = await download(K, "memory-pdf");
  check("B4 PDF: a fresh snapshot was fetched for it", K.bookFetches[room.roomId] > before, `${K.bookFetches[room.roomId] - before} fetch(es)`);
  check("B4 PDF: both approved notes are in the file", pdf.text.includes("Baraka note about the tea") && pdf.text.includes("Second approved note"), pdf.name);
  before = K.bookFetches[room.roomId];
  await drawn(K);
  await download(K, "memory-image");
  const img = await drawn(K);
  check("B4 share image: a fresh snapshot, and both notes drawn", K.bookFetches[room.roomId] > before && img.includes("Baraka note about the tea") && img.includes("Second approved note"), img.slice(0, 160));

  // ---------- B5. A stale page that still shows a revoked note approved exports without it. ----------
  // Keku's next background refresh is held, so his screen stays out of date; an export fetches on its own.
  let releaseK;
  const heldK = new Promise((r) => { releaseK = r; });
  let heldKCount = 0;
  await K.route(BOOK, async (route) => {
    if (heldKCount === 0) { heldKCount++; const resp = await route.fetch(); await heldK; await route.fulfill({ response: resp }).catch(() => {}); return; }
    await route.continue();
  });
  await decide(baraka, n2.id, "revoke");
  await untilFrom(Date.now(), TARGET, async () => heldKCount === 1);
  check("B5 (Keku's page is stale: it still shows the revoked note approved)", heldKCount === 1 && (await stateOf(K, "Second approved note")) === "approved");
  const stalePdf = await download(K, "memory-pdf");
  check("B5 the stale page's PDF leaves the revoked note out and keeps the approved one", !stalePdf.text.includes("Second approved note") && stalePdf.text.includes("Baraka note about the tea"));
  await drawn(K);
  await download(K, "memory-image");
  const staleImg = await drawn(K);
  check("B5 … and its share image too", !staleImg.includes("Second approved note") && staleImg.includes("Baraka note about the tea"), staleImg.slice(0, 160));
  check("B5 the export's snapshot also brought the screen up to date", (await stateOf(K, "Second approved note")) === "pending");
  releaseK();
  await sleep(400);
  await K.unroute(BOOK);
  check("B5 the held refresh, arriving late, changed nothing", (await stateOf(K, "Second approved note")) === "pending");
  await K.getByTestId("memory-export-status").scrollIntoViewIfNeeded();
  await K.screenshot({ path: screenshotPath("docs/stage10/stage105-screenshots/stale-export-390.png") });

  // ---------- B6. A late, reordered reply is dropped. ----------
  // Amina's refresh after an approval is held; a newer change follows, and her export's snapshot (newer) arrives first.
  let releaseA;
  const heldA = new Promise((r) => { releaseA = r; });
  let heldACount = 0;
  await A.route(BOOK, async (route) => {
    if (heldACount === 0) { heldACount++; const resp = await route.fetch(); await heldA; await route.fulfill({ response: resp }).catch(() => {}); return; }
    await route.continue();
  });
  await decide(baraka, n2.id, "approve");
  await untilFrom(Date.now(), TARGET, async () => heldACount === 1);
  const n3 = await add(baraka, "Third note after the approval");
  await A.waitForTimeout(300);
  await download(A, "memory-pdf"); // its snapshot (the newer book) arrives first and is shown
  const showsNewer = await untilFrom(Date.now(), TARGET, async () => (await stateOf(A, "Third note after the approval")) === "pending");
  releaseA();
  await sleep(600);
  await A.unroute(BOOK);
  check("B6 the newer snapshot is on screen first", showsNewer >= 0, `${showsNewer} ms`);
  check("B6 the older reply, arriving after it, doesn't roll the screen back", (await stateOf(A, "Third note after the approval")) === "pending" && (await stateOf(A, "Second approved note")) === "approved");

  // ---------- B7. The export check fails on the network: a visible failure, and no download. ----------
  await A.route(BOOK, (route) => route.abort("failed"));
  let downloaded = false;
  const onDl = () => { downloaded = true; };
  A.on("download", onDl);
  await A.getByTestId("memory-pdf").click();
  await A.waitForFunction(() => document.querySelector('[data-testid="memory-export-status"]')?.getAttribute("data-state") === "error", null, { timeout: 10000 });
  check("B7 PDF: it says it couldn't check the approvals, so nothing was downloaded", /Couldn’t check the latest approvals, so nothing was downloaded/.test(await A.getByTestId("memory-export-status").innerText()));
  await A.getByTestId("memory-image").click();
  await sleep(300);
  await A.waitForFunction(() => document.querySelector('[data-testid="memory-export-status"]')?.getAttribute("data-state") === "error", null, { timeout: 10000 });
  await sleep(800);
  check("B7 share image: the same, and no file was downloaded for either", /Couldn’t check the latest approvals/.test(await A.getByTestId("memory-export-status").innerText()) && !downloaded);
  await A.getByTestId("memory-export-status").scrollIntoViewIfNeeded();
  await A.screenshot({ path: screenshotPath("docs/stage10/stage105-screenshots/export-check-failed-320-christmas.png") });
  await A.unroute(BOOK);
  await A.route(/\/memory\/export$/, (route) => route.abort("failed"));
  await A.getByTestId("memory-md").click();
  await A.waitForFunction(() => document.querySelector('[data-testid="memory-export-status"]')?.getAttribute("data-state") === "error", null, { timeout: 10000 });
  check("B7 Markdown: it says the export couldn't load", /Couldn’t load the export/.test(await A.getByTestId("memory-export-status").innerText()));
  await A.unroute(/\/memory\/export$/);
  A.off("download", onDl);

  // ---------- B8. A failed approve changes nothing, says so, and can be tried again. ----------
  await K.route(new RegExp(`/memory/${n3.id}/approve$`), (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "The Memory Book couldn't be saved, so nothing changed. Try again in a moment." }) }));
  await card(K, "Third note after the approval").getByRole("button", { name: "Approve", exact: true }).click();
  await K.getByTestId("memory-entry-error").waitFor({ timeout: 10000 });
  check("B8 a failed approve: a plain message on that entry", /Couldn’t approve it\./.test(await K.getByTestId("memory-entry-error").innerText()), await K.getByTestId("memory-entry-error").innerText());
  check("B8 … and the entry is still pending, on both pages", (await stateOf(K, "Third note after the approval")) === "pending" && (await stateOf(A, "Third note after the approval")) === "pending");
  await K.getByTestId("memory-entry-error").scrollIntoViewIfNeeded();
  await K.screenshot({ path: screenshotPath("docs/stage10/stage105-screenshots/entry-error-390.png") });
  await K.unroute(new RegExp(`/memory/${n3.id}/approve$`));
  t0 = Date.now();
  await card(K, "Third note after the approval").getByRole("button", { name: "Approve", exact: true }).click();
  check("B8 trying again approves it; Amina's book follows within 3 s", (await untilFrom(t0, TARGET, async () => (await stateOf(A, "Third note after the approval")) === "approved")) >= 0 && (await K.getByTestId("memory-entry-error").count()) === 0);

  // ---------- B8b. Losing the role: Keku hands the host role to Amina; his Approve and Revoke go away. ----------
  const n4 = await add(baraka, "Waiting after the handover");
  await untilFrom(Date.now(), TARGET, async () => (await stateOf(K, "Waiting after the handover")) === "pending");
  check("B8b before: Keku, the host, has Approve on the pending note", (await card(K, "Waiting after the handover").getByRole("button", { name: "Approve", exact: true }).count()) === 1);
  const seenByKeku = await api(`/rooms/${room.roomId}/projection?audience=player`, { token: keku.token });
  t0 = Date.now();
  await api(`/rooms/${room.roomId}/host`, { token: keku.token, body: { targetId: amina.playerId, attempt: { id: `book-live-handover-${Date.now()}`, sessionRevision: seenByKeku.session?.revision ?? 0 } } });
  const goneMs = await untilFrom(t0, TARGET, async () => (await K.getByRole("button", { name: /^(Approve|Revoke)$/ }).count()) === 0);
  check("B8b Keku hands the host role to Amina: his Approve and Revoke are gone within 3 s", goneMs >= 0, `${goneMs} ms`);
  check("B8b … and he sees who decides instead", /Waiting for the host to approve it/.test(await card(K, "Waiting after the handover").innerText()));
  const aGets = await untilFrom(t0, TARGET, async () => (await card(A, "Waiting after the handover").getByRole("button", { name: "Approve", exact: true }).count()) === 1);
  check("B8b … while Amina, now the host, has them", aGets >= 0, `${aGets} ms`);
  let refused = "";
  try { await decide(keku, n4.id, "approve"); refused = "accepted"; } catch (e) { refused = /: 403 /.test(String(e.message)) ? "403" : String(e.message).slice(0, 80); }
  check("B8b the server refuses an approval from Keku now", refused === "403", refused);

  // ---------- B9. Offline and back: the page reconciles. ----------
  await A.context().setOffline(true);
  await sleep(500);
  await add(baraka, "Added while Amina was offline");
  await sleep(1500);
  check("B9 offline, Amina's page can't know yet", (await stateOf(A, "Added while Amina was offline")) === "absent");
  t0 = Date.now();
  await A.context().setOffline(false);
  const backMs = await untilFrom(t0, 8000, async () => (await stateOf(A, "Added while Amina was offline")) === "pending");
  check("B9 back online, it shows the change (within 8 s of reconnecting)", backMs >= 0, `${backMs} ms`);
  check("B9 her draft is still there", (await area.inputValue()) === DRAFT);

  // ---------- B10. No socket at all: the 2-second poll brings the change within 5 s. ----------
  await A.routeWebSocket(/\?roomId=/, () => { /* never connects to the server, never says anything */ });
  await A.reload({ waitUntil: "domcontentloaded" });
  await A.getByTestId("memory-screen").waitFor({ timeout: 15000 });
  await untilFrom(Date.now(), 5000, async () => (await stateOf(A, "Added while Amina was offline")) === "pending");
  t0 = Date.now();
  await add(baraka, "Heard by polling alone");
  const pollMs = await untilFrom(t0, POLL_TARGET, async () => (await stateOf(A, "Heard by polling alone")) === "pending");
  check("B10 with no socket, the poll brings Baraka's note within 5 s", pollMs >= 0, `${pollMs} ms`);
  await A.context().close();

  // ---------- B11. Leaving the book stops book fetches; switching rooms shows only the new room's book. ----------
  const A2 = await seatPage(browser, room, amina, { width: 390, height: 844 }, "christmas");
  await A2.getByTestId("memory-back").click();
  await A2.waitForURL((u) => !/memories/.test(u.pathname), { timeout: 10000 });
  const away = A2.bookFetches[room.roomId];
  await add(baraka, "Added while Amina was in the lobby");
  await sleep(3500);
  check("B11 in the lobby, a change to the book fetches nothing", A2.bookFetches[room.roomId] === away, `${A2.bookFetches[room.roomId] - away}`);
  await A2.goto(`${BASE}/room/memories`, { waitUntil: "domcontentloaded" });
  check("B11 opening the book again shows it", (await untilFrom(Date.now(), TARGET, async () => (await stateOf(A2, "Added while Amina was in the lobby")) === "pending")) >= 0);
  const other = await makeRoom(["Zawadi", "Amina"], "Next door");
  await A2.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...other.seats[1], roomId: other.roomId });
  await A2.goto(`${BASE}/room/memories`, { waitUntil: "domcontentloaded" });
  await A2.getByTestId("memory-empty").waitFor({ timeout: 15000 });
  check("B11 switched to another room: its own (empty) book, nothing from the last room", (await A2.getByTestId("memory-entry").count()) === 0);
  const lastRoom = A2.bookFetches[room.roomId];
  await add(baraka, "A change in the room Amina left");
  await sleep(3500);
  check("B11 … and a change in the room she left fetches nothing", A2.bookFetches[room.roomId] === lastRoom && (await A2.getByTestId("memory-entry").count()) === 0);
  await A2.context().close();

  check("B12 Keku's book at 390 px: no sideways scroll", await noSideways(K));
  await K.context().close();
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
}
console.log(failures === 0 ? "ALL BOOK-LIVE CHECKS PASSED" : `${failures} BOOK-LIVE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
