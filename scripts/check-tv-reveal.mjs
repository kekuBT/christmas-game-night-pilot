// S3-TV-05 and S3-TV-01 (Stage 3 live QA): the TV's Trivia reveal and
// question order, through real phones and a real spectator TV.
//
// The audit's spectator reported the TV marking 7 correct for "How many
// points is a touchdown worth in American football?" (the answer is 6) and,
// in one game, a vote on the wrong option; and a TV question sequence that
// differed from the phones'. This driver replays both documented games:
//
//   Game 4 (2 players): option order 3, 7, 6, 2. Host taps 6, guest taps 3.
//   Game 5 (3 players): option order 2, 7, 3, 6. Host and guest tap 6; the
//   third player sits the game out.
//
// It starts its own fixture server (scripts/lib/tv-reveal-fixture-server.ts:
// the shipped touchdown item plus nine other shipped Trivia items, real
// selection, real seeded shuffle, a seed chosen so the order is exactly the
// documented one). Phones answer by tapping the label; the TV is a /watch
// spectator. On the TV it reads WHERE things are drawn: the label under each
// bar (by position), each bar's count, the CORRECT stamp and which bars are
// dimmed, during the automatic walk, through the Q buttons and after a
// reload. It also compares the TV's Q1..Q10 prompts with the phones'.
// Usage: node scripts/check-tv-reveal.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { optionIndex } from "./lib/content-oracle.mjs";

const TOUCHDOWN_PROMPT = "How many points is a touchdown worth in American football?";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = mkdtempSync(join(tmpdir(), "mchezo-tv-reveal-"));

let out = "";
const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA_DIR };
delete env.NODE_ENV;
const child = spawn(process.execPath, ["--import", "tsx", "scripts/lib/tv-reveal-fixture-server.ts"], { cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"] });
child.stdout.on("data", (d) => { out += d.toString(); });
child.stderr.on("data", (d) => { out += d.toString(); });
let port = 0;
for (let i = 0; i < 120 && child.exitCode === null && !port; i++) {
  const m = /fixture server on http:\/\/localhost:(\d+)/.exec(out);
  if (m) port = Number(m[1]); else await sleep(250);
}
if (!port) { child.kill("SIGKILL"); throw new Error(`fixture server did not start: ${out.slice(-400)}`); }
const BASE = `http://localhost:${port}`;
async function askSeed(roomId, order, ids) {
  const mark = out.length;
  child.stdin.write(`seed ${roomId} ${order.join(",")} ${ids.join(",")}\n`);
  for (let i = 0; i < 400; i++) {
    const m = /seed (\d+)|seed-error (.*)/.exec(out.slice(mark));
    if (m?.[1]) return Number(m[1]);
    if (m?.[2]) throw new Error(m[2]);
    await sleep(50);
  }
  throw new Error("no seed answer");
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function api(path, { token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function makeRoom(names) {
  const room = await api("/rooms", { body: { name: "TV reveal check" } });
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
const myGame = async (room, seat, gid) => (await api(`/rooms/${room.roomId}/projection?audience=player`, { token: seat.token })).myGames.find((g) => g.id === gid);

async function phoneFor(browser, room, seat) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, { ...seat, roomId: room.roomId });
  await page.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return page;
}
async function spectate(browser, code, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
  return page;
}
const exact = (s) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

/**
 * Answer every question on a phone by tapping a label. Records what the
 * phone showed as "Question k of n" and its prompt, for the TV comparison.
 */
async function answerOnPhone(page, choose) {
  const seen = [];
  for (let guard = 0; guard < 80 && seen.length < 10; guard++) {
    const nextBtn = page.getByRole("button", { name: "Next question" });
    if (await nextBtn.isVisible({ timeout: 200 }).catch(() => false)) await nextBtn.click();
    const head = page.locator(".mz-qhead .mz-muted").first();
    if (await head.isVisible({ timeout: 1500 }).catch(() => false)) {
      const k = Number(/Question (\d+) of/.exec(await head.innerText({ timeout: 3000 }).catch(() => ""))?.[1]);
      if (!k || seen.some((s) => s.k === k)) { await sleep(300); continue; }
      const prompt = (await page.locator("h1.mz-question").innerText()).trim();
      const options = await page.locator(".mz-slab").allInnerTexts();
      const label = choose(prompt, options.map((t) => t.trim()));
      await page.locator(".mz-slab:not([disabled])").filter({ hasText: exact(label) }).first().click();
      seen.push({ k, prompt, label });
      const next = page.getByRole("button", { name: "Next question" });
      if (await next.isVisible({ timeout: 3000 }).catch(() => false)) await next.click();
      continue;
    }
    await sleep(300);
  }
  return seen;
}

/** What the TV draws in the reveal: per label (matched by position), the count above it, the stamp, the dimming. */
async function readReveal(tv) {
  return tv.evaluate(() => {
    const centre = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
    const bars = [...document.querySelectorAll(".mz-tv-bars .mz-tv-bar")].map((b) => ({ x: centre(b), n: Number(b.querySelector(".mz-tv-bar__n")?.textContent), dim: b.classList.contains("mz-tv-bar--dim"), name: b.querySelector(".mz-sr")?.textContent ?? "" }));
    const slabs = [...document.querySelectorAll(".mz-tv-answers--row .mz-tv-slab")].map((s) => ({ x: centre(s), label: s.querySelector("span")?.textContent ?? "", stamp: !!s.querySelector(".mz-tv-slab__stamp"), dim: s.classList.contains("mz-tv-slab--dim") }));
    const byLabel = {};
    for (const s of slabs) {
      const bar = bars.slice().sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0];
      byLabel[s.label] = { n: bar?.n, barDim: bar?.dim, stamp: s.stamp, slabDim: s.dim, offset: bar ? Math.round(Math.abs(bar.x - s.x)) : -1, barName: bar?.name };
    }
    return {
      kicker: document.querySelector(".mz-tv-main .mz-tv-kicker")?.textContent ?? "",
      question: document.querySelector(".mz-tv-question--small")?.textContent ?? "",
      byLabel,
    };
  });
}
function checkReveal(label, r, expected) {
  check(`${label}: the reveal is for the touchdown question`, r.question === TOUCHDOWN_PROMPT, r.question);
  const counts = Object.fromEntries(Object.entries(r.byLabel).map(([k, v]) => [k, v.n]));
  check(`${label}: each count sits above its own label`, JSON.stringify(counts) === JSON.stringify(expected), JSON.stringify(counts));
  check(`${label}: bars and labels line up`, Object.values(r.byLabel).every((v) => v.offset <= 2), JSON.stringify(Object.values(r.byLabel).map((v) => v.offset)));
  const stamped = Object.entries(r.byLabel).filter(([, v]) => v.stamp).map(([k]) => k);
  check(`${label}: CORRECT is stamped on 6 and nothing else`, stamped.join() === "6", stamped.join());
  const lit = Object.entries(r.byLabel).filter(([, v]) => !v.barDim && !v.slabDim).map(([k]) => k);
  check(`${label}: only 6's bar and label stay lit`, lit.join() === "6", lit.join());
  const named = Object.entries(r.byLabel).every(([k, v]) => v.barName === `${k}: ${v.n} ${v.n === 1 ? "vote" : "votes"}${k === "6" ? ", the correct answer" : ""}`);
  check(`${label}: each bar names its option and count for screen readers`, named, Object.values(r.byLabel).map((v) => v.barName).join(" | "));
}
async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(250);
  }
}
const revealOfTouchdown = (tv) => waitFor(async () => {
  const r = await readReveal(tv);
  return r.question === TOUCHDOWN_PROMPT && /answer is/i.test(r.kicker) ? r : undefined;
}, 130000, "the touchdown reveal");

async function reviewByButtons(tv, k) {
  await tv.getByRole("button", { name: `Q${k + 1}`, exact: true }).click();
  await tv.getByRole("tab", { name: "Reveal" }).click();
  return revealOfTouchdown(tv);
}

async function game({ label, names, order, picks, phones, expected, shot, auto }) {
  const browser = globalThis.__browser;
  const room = await makeRoom(names);
  const tv = await spectate(browser, room.code, { width: 1280, height: 720 });
  const seed = await askSeed(room.roomId, order, room.seats.map((s) => s.playerId));
  const host = room.seats[0];
  const { gameId: gid } = await api(`/rooms/${room.roomId}/games`, { token: host.token, body: { gameId: "trivia", official: false, seed } });
  for (const s of room.seats) await intent(room, s, gid, "briefing-ready", { ready: true });
  const g = await waitFor(async () => { const x = await myGame(room, host, gid); return x?.status === "playing" ? x : undefined; }, 30000, "play to begin");
  const qs = g.state.questions;
  const k = qs.findIndex((q) => q.prompt === TOUCHDOWN_PROMPT);
  check(`${label}: the touchdown question is in the game (Q${k + 1})`, k >= 0);
  check(`${label}: the phones' option order is the documented ${order.join(", ")}`, k >= 0 && qs[k].options.join() === order.join(), qs[k]?.options.join());

  // While playing the TV shows no key and no tallies.
  await tv.locator(".mz-tv-question").first().waitFor({ timeout: 20000 });
  const live = await tv.evaluate(() => ({ text: document.body.innerText, bars: document.querySelectorAll(".mz-tv-bar").length }));
  check(`${label}: while playing the TV shows no CORRECT and no tallies`, !/CORRECT/.test(live.text) && live.bars === 0);

  // Answers: phones tap labels; the rest answer through the same API; sitters sit out.
  const shown = {};
  for (const [i, seat] of room.seats.entries()) {
    const pick = picks[i];
    if (pick === "sit-out") { await intent(room, seat, gid, "abstain", {}); continue; }
    const choose = (prompt, options) => (prompt === TOUCHDOWN_PROMPT ? pick : options[optionIndex("trivia", prompt, options, { wrong: i > 0 })]);
    if (phones.includes(i)) {
      const page = await phoneFor(browser, room, seat);
      shown[i] = await answerOnPhone(page, choose);
      await page.context().close();
    } else {
      for (const q of qs) await intent(room, seat, gid, "trivia-answer", { questionId: q.id, chosenIndex: q.options.indexOf(choose(q.prompt, q.options)) });
    }
  }
  const done = await waitFor(async () => { const x = await myGame(room, host, gid); return x?.status === "finished" ? x : undefined; }, 30000, "the game to finish");
  check(`${label}: the game finished`, done.status === "finished");
  for (const [i, seen] of Object.entries(shown)) {
    check(`${label}: ${names[i]}'s phone asked all 10 in the game's order`, seen.length === 10 && seen.every((s, j) => s.k === j + 1 && s.prompt === qs[j].prompt), seen.map((s) => s.k).join(","));
  }

  // The TV, as the room saw it: the automatic walk reaches the touchdown reveal.
  if (auto) {
    const r = await revealOfTouchdown(tv);
    checkReveal(`${label} (auto walk)`, r, expected);
    await tv.screenshot({ path: screenshotPath(`docs/stage3-qa/${shot}-auto.png`) });
  }
  // The post-game review through the Q buttons (how the spectator reviewed it).
  const viaButtons = await reviewByButtons(tv, k);
  checkReveal(`${label} (Q${k + 1} button)`, viaButtons, expected);
  const top = await tv.locator(".mz-tv-top__mid").innerText();
  check(`${label}: the TV says which answer of the review is showing`, top.includes(`answers, Q${k + 1} of ${qs.length}`), top);
  await tv.screenshot({ path: screenshotPath(`docs/stage3-qa/${shot}-review.png`) });
  // S3-TV-01: the TV's Q1..Q10 are the phones' Q1..Q10.
  await tv.getByRole("tab", { name: "Question" }).click();
  const tvPrompts = [];
  for (let j = 0; j < qs.length; j++) {
    await tv.getByRole("button", { name: `Q${j + 1}`, exact: true }).click();
    await tv.getByRole("tab", { name: "Question" }).click();
    tvPrompts.push(await waitFor(async () => {
      const t = (await tv.locator(".mz-tv-question").first().innerText()).trim();
      return t === qs[j].prompt ? t : undefined;
    }, 5000, `TV Q${j + 1}`).catch(() => tv.locator(".mz-tv-question").first().innerText()));
  }
  check(`${label}: the TV's Q1..Q${qs.length} are the phones' Q1..Q${qs.length}`, tvPrompts.every((p, j) => p.trim() === qs[j].prompt), tvPrompts.map((p, j) => (p.trim() === qs[j].prompt ? "=" : `Q${j + 1}≠`)).join(""));
  // A reload keeps the same reveal.
  await tv.reload({ waitUntil: "domcontentloaded" });
  await tv.getByRole("button", { name: "Q1", exact: true }).waitFor({ timeout: 20000 });
  checkReveal(`${label} (after reload)`, await reviewByButtons(tv, k), expected);
  // A phone-sized TV (a spectator on a phone) draws the same mapping.
  const small = await spectate(browser, room.code, { width: 390, height: 844 });
  await small.getByRole("button", { name: "Q1", exact: true }).waitFor({ timeout: 20000 });
  checkReveal(`${label} (390px spectator)`, await reviewByButtons(small, k), expected);
  await small.context().close();
  await tv.context().close();
}

const browser = await launchChromium();
globalThis.__browser = browser;
try {
  await game({
    label: "Game 4", names: ["Host", "Guest"], order: ["3", "7", "6", "2"],
    picks: ["6", "3"], phones: [0, 1], expected: { "3": 1, "7": 0, "6": 1, "2": 0 }, shot: "tv05-game4", auto: true,
  });
  await game({
    label: "Game 5", names: ["Host", "Guest", "Third"], order: ["2", "7", "3", "6"],
    picks: ["6", "6", "sit-out"], phones: [0], expected: { "2": 0, "7": 0, "3": 0, "6": 2 }, shot: "tv05-game5", auto: false,
  });
} finally {
  await browser.close();
  child.kill("SIGTERM");
}
console.log(failures === 0 ? "ALL TV REVEAL CHECKS PASSED" : `${failures} TV REVEAL CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
