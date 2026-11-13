// Stage 4: the Family Cup (S3-CUP-01) and the Memory Book (S3-MEM-01, v1 A-14).
//   Cup, empty: Day 1 of 7, an honest empty state, no numbers, rules folded,
//   host tools only for the host.
//   Cup with official results: the server's standings, in the server's order
//   and with the server's totals; the games played; the day winner; phone and
//   desktop, no sideways scrolling.
//   Memory Book: empty state and disabled downloads (with the reason); add as a
//   guest, approve as the host (guests see no approve buttons); real PDF and
//   image downloads with "Preparing…" then "Download started: <file>" and the
//   room code and date in the name; a failed export says so and claims nothing.
// Starts ITS OWN server. Usage: node scripts/check-cup-memory.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-cupmem-"));
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
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "Cup check" } });
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
async function seatPage(browser, room, seat, path, viewport = { width: 390, height: 844 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return page;
}
const solve = (prompt) => {
  const pct = /^(\d+)% of (\d+)/.exec(prompt);
  if (pct) return (Number(pct[1]) * Number(pct[2])) / 100;
  const [a, op, b] = prompt.replace(/[=?]/g, " ").trim().split(/\s+/);
  const x = Number(a), y = Number(b);
  return op === "+" ? x + y : op === "−" ? x - y : op === "×" ? x * y : x / y;
};
/** An official Math game where seat i gets `right[i]` questions right. */
async function playMath(room, right, official = true) {
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: room.seats[0].token, body: { gameId: "math-mayhem", official } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  for (const [i, s] of room.seats.entries()) {
    const g = (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: s.token })).myGames.find((x) => x.id === gid);
    for (const [k, q] of g.questions.entries()) {
      const o = await intent(room, s, gid, "math-open", { questionId: q.id });
      const idx = o.result.options.findIndex((x) => (k < right[i] ? Number(x) === solve(o.result.prompt) : Number(x) !== solve(o.result.prompt)));
      await intent(room, s, gid, "submit-math-answer", { questionId: q.id, chosenIndex: idx });
    }
  }
  return gid;
}
const noSideways = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll("main")].every((m) => m.scrollWidth <= m.clientWidth + 1));

const browser = await launchChromium();
try {
  // ---- An empty Cup (its own room), and a room whose official game is played
  // before any page opens (closing a page leaves that player "reconnecting",
  // which the server rightly refuses for an official start).
  const room = await makeRoom(["Keku", "Amina", "Bartholomew Otieno-Wanjiku"]);
  const played = await makeRoom(["Keku", "Amina", "Bartholomew Otieno-Wanjiku"]);
  await playMath(played, [10, 6, 3]);
  {
    const guest = await seatPage(browser, room, room.seats[1], "/room/cup");
    await guest.getByTestId("cup-screen").waitFor({ timeout: 15000 });
    check("empty Cup: Day 1 of 7 first", /Day 1 of 7/.test(await guest.getByTestId("cup-day").innerText()));
    check("empty Cup: an honest empty state", /No standings yet/.test(await guest.getByTestId("cup-empty").innerText()) && /official/.test(await guest.getByTestId("cup-empty").innerText()));
    check("empty Cup: no numbers before an official game", !/\d+\s*pts/.test(await guest.getByTestId("cup-standings").innerText()));
    check("empty Cup: the rules are folded away", (await guest.getByTestId("cup-rules").getAttribute("open")) === null);
    check("empty Cup: a guest sees no host tools", (await guest.getByTestId("cup-host-tools").count()) === 0 && (await guest.getByTestId("advance-day").count()) === 0);
    const order = await guest.evaluate(() => ["cup-hero", "cup-standings", "cup-next", "cup-rules"].map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? -1));
    check("S3-CUP-01: the order is day, standings, what's next, then rules", order.every((t, i) => t >= 0 && (i === 0 || t > order[i - 1])), JSON.stringify(order.map(Math.round)));
    const left = await guest.getByTestId("cup-hero").evaluate((e) => e.getBoundingClientRect().left);
    check("empty Cup: the content keeps the screen's side margin", left >= 12, `${Math.round(left)}px`);
    const standingsTop = await guest.getByTestId("cup-standings").evaluate((e) => e.getBoundingClientRect().top);
    check("S3-CUP-01 at 390×844: the standings start on the first screen", standingsTop < 844 * 0.6, `${Math.round(standingsTop)}px`);
    await guest.screenshot({ path: screenshotPath("docs/stage4/after/cup-empty-guest-390.png"), fullPage: true });
    await guest.context().close();
    const host = await seatPage(browser, room, room.seats[0], "/room/cup", { width: 1440, height: 900 });
    await host.getByTestId("cup-screen").waitFor({ timeout: 15000 });
    check("empty Cup: the host's tools are there, separate", await host.getByTestId("cup-host-tools").isVisible() && await host.getByTestId("advance-day").isVisible());
    await host.screenshot({ path: screenshotPath("docs/stage4/after/cup-empty-host-1440.png"), fullPage: true });
    await host.context().close();
  }

  // ---- Memory Book, empty.
  {
    const p = await seatPage(browser, room, room.seats[1], "/room/memories");
    await p.getByTestId("memory-screen").waitFor({ timeout: 15000 });
    check("Memory Book empty: says how to start", /No entries yet/.test(await p.getByTestId("memory-empty").innerText()) && /Finish a game first/.test(await p.getByTestId("memory-add-hint").innerText()));
    check("Memory Book empty: downloads are off, and it says why", await p.getByTestId("memory-pdf").isDisabled() && await p.getByTestId("memory-image").isDisabled() && /once an entry is approved/.test(await p.getByTestId("memory-export-status").innerText()));
    await p.screenshot({ path: screenshotPath("docs/stage4/after/memory-empty-390.png"), fullPage: true });
    await p.context().close();
  }

  // ---- Real official results.
  const server = await api(`/rooms/${played.roomId}/projection?audience=tv`);
  for (const v of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    const p = await seatPage(browser, played, played.seats[v.width === 1440 ? 0 : 1], "/room/cup", v);
    await p.getByTestId("cup-row-" + server.championship[0].playerId).waitFor({ timeout: 15000 });
    if (v.width === 390) {
      const rows = await p.locator('[data-testid^="cup-row-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-testid").slice(8), total: Number(e.querySelector(".mz-cup-row__total b")?.textContent) })));
      check("Cup: the standings are the server's, in the server's order", JSON.stringify(rows.map((r) => r.id)) === JSON.stringify(server.championship.map((r) => r.playerId)), rows.map((r) => r.id).join(","));
      check("Cup: every total is the server's total", rows.every((r, i) => r.total === server.championship[i].total), JSON.stringify(rows.map((r) => r.total)));
      check("Cup: the games played are listed by title", /Math Mayhem · Day 1/.test(await p.getByTestId("cup-games").innerText()));
      check("Cup: the day winner is named", /Day 1 winner:/.test(await p.getByTestId("cup-next").innerText()));
      check("Cup: a long name doesn't break the row", await noSideways(p));
      await p.getByTestId(`cup-row-${server.championship[0].playerId}`).getByRole("button", { name: "How it adds up" }).click();
      const detail = await p.getByTestId(`cup-detail-${server.championship[0].playerId}`).innerText();
      check("Cup: 'How it adds up' shows the server's parts", detail.includes(`= ${server.championship[0].total}`) && detail.includes(`participation +${server.championship[0].participationBonus}`), detail);
      await p.getByTestId("cup-rules").locator("summary").click();
      check("Cup: the rules open on demand", (await p.getByTestId("cup-rules").getAttribute("open")) !== null && /best three daily scores/.test(await p.getByTestId("cup-rules").innerText()));
      await p.getByTestId("cup-rules").locator("summary").click();
    }
    check(`Cup with results at ${v.width}×${v.height}: no sideways scrolling`, await noSideways(p));
    await sleep(700); // let the screen's fade-in finish before the documentation shot
    await p.screenshot({ path: screenshotPath(`docs/stage4/after/cup-results-${v.width}.png`), fullPage: v.width !== 1440 });
    await p.context().close();
  }

  // ---- Memory Book with an entry: a guest adds, the host approves, downloads.
  {
    const guest = await seatPage(browser, played, played.seats[1], "/room/memories");
    await guest.getByTestId("memory-screen").waitFor({ timeout: 15000 });
    await guest.getByPlaceholder("e.g. Ada won Math Mayhem in a tie-break").fill("Keku went ten for ten in Math Mayhem");
    await guest.getByRole("button", { name: "Add from last finished game" }).click();
    const entry = guest.getByTestId("memory-entry").filter({ hasText: "Keku went ten for ten" });
    await entry.waitFor({ timeout: 15000 });
    check("a guest can add a highlight; it waits for the host", /Day 1 · pending/.test(await entry.innerText()) && /Waiting for the host/.test(await entry.innerText()));
    check("a guest sees no approve or revoke buttons", (await entry.getByRole("button", { name: /Approve|Revoke/ }).count()) === 0);
    check("the entry shows the game's recorded scores by name", /Math Mayhem · Day 1: Keku 1,200/.test(await entry.innerText()), (await entry.innerText()).replace(/\n/g, " | "));
    const facts = await entry.locator("details").innerText();
    check("the ledger facts are folded and use names, not ids", /From the ledger \(\d+ score events\)/.test(facts) && !/player-\d/.test(await entry.innerText()));
    await guest.context().close();

    for (const v of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const host = await seatPage(browser, played, played.seats[0], "/room/memories", v, { acceptDownloads: true });
      const e = host.getByTestId("memory-entry").filter({ hasText: "Keku went ten for ten" });
      await e.waitFor({ timeout: 15000 });
      if (v.width === 390) {
        await e.getByRole("button", { name: "Approve", exact: true }).click();
        await host.getByText(/Day 1 · approved/).waitFor({ timeout: 15000 });
        check("the host approves; downloads open", await host.getByTestId("memory-pdf").isEnabled() && await host.getByTestId("memory-image").isEnabled());
        // PDF: Preparing… then Download started, and a real download with the right name.
        const [dl] = await Promise.all([host.waitForEvent("download", { timeout: 15000 }), host.getByTestId("memory-pdf").click()]);
        const name = dl.suggestedFilename();
        const today = new Date();
        const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        // Stage 10.3 (D-S103-06): files are named for the device's look, like the title inside them (a Cup room shows Everyday).
        const lookNow = await host.locator("[data-mz-theme]").first().getAttribute("data-mz-theme");
        const stem = lookNow === "christmas" ? "christmas-memory-book" : "mchezo-memory-book";
        check(`the Memory Book's title follows the look (${lookNow})`, (await host.getByTestId("memory-title").innerText()) === (lookNow === "christmas" ? "Christmas Memory Book" : "Mchezo Memory Book"), await host.getByTestId("memory-title").innerText());
        check("PDF: the file is named for the room and the date", name === `${stem}-${played.code}-${ymd}.pdf`, name);
        await host.waitForFunction(() => document.querySelector('[data-testid="memory-export-status"]')?.getAttribute("data-state") === "done", null, { timeout: 10000 });
        const status = await host.getByTestId("memory-export-status").innerText();
        check("PDF: says the download started (not that it was saved), with the name", status.startsWith(`Download started: ${stem}-`) && !/saved/i.test(status), status);
        const [img] = await Promise.all([host.waitForEvent("download", { timeout: 15000 }), host.getByTestId("memory-image").click()]);
        check("share image: a real download, named for the room and date", img.suggestedFilename() === `${stem}-${played.code}-${ymd}.png`, img.suggestedFilename());
        // A failure says so, and nothing claims success.
        await host.evaluate(() => { HTMLCanvasElement.prototype.getContext = () => null; });
        let downloaded = false;
        host.once("download", () => { downloaded = true; });
        await host.getByTestId("memory-image").click();
        await host.waitForFunction(() => document.querySelector('[data-testid="memory-export-status"]')?.getAttribute("data-state") === "error", null, { timeout: 10000 });
        await sleep(500);
        check("a failed export says it couldn't be prepared, and no download happens", /Couldn’t prepare the share image/.test(await host.getByTestId("memory-export-status").innerText()) && !downloaded);
        await host.getByRole("button", { name: "Export approved" }).click();
        await host.locator("pre").waitFor({ timeout: 10000 });
        check("Export approved shows the entry", (await host.locator("pre").innerText()).includes("Keku went ten for ten"));
      }
      check(`Memory Book at ${v.width}: no sideways scrolling`, await noSideways(host));
      await host.screenshot({ path: screenshotPath(`docs/stage4/after/memory-host-${v.width}.png`), fullPage: true });
      await host.context().close();
    }
  }

  // ---- Stage 11.2 (docs/stage11/stage112.md; D-S112-01): a Cup entry shows its game's own day, also when it's added
  // after the day moved on; the Cup Markdown keeps its days and prints names, never ids.
  {
    const ledger = await api(`/rooms/${played.roomId}/ledger?watermark=1`, { token: played.seats[0].token });
    const fin = ledger.events.filter((e) => e.type === "game-finished").at(-1).eventId;
    const moved = await api(`/rooms/${played.roomId}/day`, { token: played.seats[0].token, body: {} });
    check("the host ends Day 1 (the room is on Day 2)", moved.day === 2, JSON.stringify(moved));
    const late = await api(`/rooms/${played.roomId}/memory`, { token: played.seats[1].token, body: { day: 2, text: "Added on Day 2 about Day 1", sourceEventIds: [fin] } });
    check("a note added on Day 2 about a Day 1 game is filed under Day 1 (the game's own day)",
      late.day === 1 && late.source?.mode === "cup" && JSON.stringify(late.source?.days) === "[1]", JSON.stringify({ day: late.day, source: late.source?.days }));
    await api(`/rooms/${played.roomId}/memory/${late.id}/approve`, { token: played.seats[0].token, body: {} });
    const host = await seatPage(browser, played, played.seats[0], "/room/memories");
    const e = host.getByTestId("memory-entry").filter({ hasText: "Added on Day 2 about Day 1" });
    await e.waitFor({ timeout: 15000 });
    const badge = (await e.getByTestId("memory-entry-badge").innerText()).trim();
    check("…and its badge says Day 1, not the room's Day 2", badge === "Day 1 · approved", badge);
    const md = (await api(`/rooms/${played.roomId}/memory/export`, { token: played.seats[0].token })).markdown;
    writeFileSync(screenshotPath("/tmp/cup-memory-example.md"), md);
    check("the Cup Markdown keeps its days and prints names, never ids", /^## Day 1$/m.test(md) && !/player-\d/.test(md) && /^- Keku: \d+ points$/m.test(md), md.slice(0, 220).replace(/\n/g, " ⏎ "));
    await host.context().close();
  }
} finally {
  await browser.close();
  server.child.kill("SIGTERM");
}
console.log(failures === 0 ? "ALL CUP/MEMORY CHECKS PASSED" : `${failures} CUP/MEMORY CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
