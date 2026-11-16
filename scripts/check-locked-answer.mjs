// Beta R1-R, R5 (review 6904986723): after a player locks a NONFINAL answer in
// Trivia (and in Geography and Math Mayhem, which share the screen), carrying
// on must be obvious on a small screen, and the room's progress is secondary.
// Measured in the real app: Chromium emulation at the stated CSS sizes, not
// real phones or other engines.
//
// A. Layout, on the gate's server (unscaled clocks), two players, Casual Trivia,
//    at 320×480 and 390×844 (phones) and 1440×900 (desktop):
//    L1  the enabled Next question action is fully inside the INITIAL viewport,
//        not covered (the element at its centre is the button), and it opens
//        the next question
//    L2  it comes before the room's progress (the ring), and nothing on the
//        screen tells the player to wait for everyone
//    L3  no seat token or name label overlaps any text or control (the
//        guest's name is the 24-character maximum, so the lower seat's label
//        is long on the host's ring)
//    L4  no sideways scroll
//    F   after the FINAL answer (phones): "All your answers are in", no
//        enabled continuation control, no overlap
//    T   the longest supported answer (80 characters, the content schema's
//        limit) set into the rendered card: L1 and L3 still hold, and the
//        LOCKED IN stamp stays clear of the answer
//    Z   enlarged text: 150% and 200% page zoom on a 390×844 phone (a 260×563
//        and a 195×422 CSS-px viewport): no sideways scroll, no overlap, and
//        Next question is reached by scrolling the screen and works
// C. The same screen in Geography and Math Mayhem at 320×480 (L1–L4, F), and
//    the shared ring's sat-out caller (Trivia's "Sit this game out") for L3.
// B. A journey on this driver's OWN server with MCHEZO_LIFECYCLE_SCALE=0.2, a
//    test-only setting that makes every time limit 5× shorter (Trivia's 6 min
//    → 72 s; the deadline is still the server's own, with no host action).
//    MCHEZO_LOCKED_ANSWER_SCALE=1 runs it on the real clock instead:
//    host 390×844, guest 320×480, TV spectator 1440×900.
//    B1  while playing, the TV's projection carries no answers and the TV
//        screen shows none, Reveal included
//    B2  both players lock and advance on their own; the guest reloads on the
//        locked view, keeps the seat and resumes at the next question
//    B3  the host finishes: no continuation control; a reload keeps "All
//        your answers are in"
//    B4  the guest stops after 2 answers; the server deadline ends the game:
//        both phones reach the results, time ran out, the guest's 2 answers
//    B5  the TV goes to the finished game's review (answers now allowed)
//    B6  Play again: both seats kept, readiness reset, and the TV shows the
//        new game with no answers before it finishes
// Usage: node scripts/check-locked-answer.mjs <baseUrl>   (the gate passes its server)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { launchChromium, screenshotDir } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const GATE_BASE = process.argv[2] ?? "http://localhost:3471";
const SHOTS = screenshotDir("test-results/screenshots/locked-answer");
mkdirSync(SHOTS, { recursive: true });
// MCHEZO_LOCKED_ANSWER_SCALE=1 runs the journey on the real clock (Trivia's full 6 minutes); the gate uses 0.2.
const SCALE = Number(process.env.MCHEZO_LOCKED_ANSWER_SCALE ?? "0.2");
if (!(SCALE > 0 && SCALE <= 1)) throw new Error(`MCHEZO_LOCKED_ANSWER_SCALE must be in (0, 1], got ${process.env.MCHEZO_LOCKED_ANSWER_SCALE}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(250); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}

// 24 characters, the longest name the join form takes (Home.tsx maxLength; the server allows 32).
const LONG_NAME = "Bartholomew Featherstone";
// 80 characters, the longest option the content schema accepts (src/content/schema.ts, fourOptions).
const LONG_ANSWER = "The Great Exhibition of the Works of Industry of All Nations, Hyde Park, London.";
const NONFINAL = 'main[aria-label="Answer locked in"]';
const FINAL = 'main[aria-label="All your answers are in"]';
const AFTER_LOCK = `${NONFINAL}, ${FINAL}`;

async function host(base, page, name) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300);
  }
  return code;
}
async function joinAs(base, page, name, code) {
  await page.goto(`${base}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function spectate(base, page, code) {
  await page.goto(`${base}/join`, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByTestId("tv-show").waitFor({ timeout: 15000 });
}
/** A call from the page with its own seat. */
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(path.replace(":room", roomId), { method, headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { method, path, body });
const myRoom = async (page) => (await api(page, "GET", "/rooms/:room/projection?audience=player")).body;
/** The room's public TV projection (the same endpoint the TV reads; fetched from a seated page, which knows the room id). */
const tvRoom = (page) => page.evaluate(async () => (await (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=tv`)).json()));
async function startGame(h, gameId, tag) {
  const room = await myRoom(h);
  return api(h, "POST", "/rooms/:room/games", { gameId, official: false, roster: room.readiness?.wouldPlay, attempt: { id: `locked-${tag}-${Date.now()}`, sessionRevision: room.session?.revision } });
}

/** Everything L1–L4 and F need, measured on the screen as shown (its own scroll at the top unless asked). */
const measure = (page, { keepScroll = false } = {}) => page.evaluate(({ AFTER_LOCK, keepScroll }) => {
  const main = document.querySelector(AFTER_LOCK);
  if (!main) return { missing: true, text: document.body.innerText.replace(/\s+/g, " ").slice(0, 200) };
  if (!keepScroll) main.scrollTop = 0;
  const rect = (el) => el.getBoundingClientRect();
  const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const buttons = [...main.querySelectorAll("button")].map((b) => ({ el: b, text: b.innerText.trim(), enabled: !b.disabled && b.getAttribute("aria-disabled") !== "true" }));
  const nextEl = buttons.find((b) => /^Next question$/i.test(b.text));
  let next = null;
  if (nextEl) {
    const b = rect(nextEl.el);
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    next = { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), enabled: nextEl.enabled, hitIsButton: !!hit && (hit === nextEl.el || nextEl.el.contains(hit)) };
  }
  const ring = main.querySelector(".mz-wait");
  const nextBeforeRing = nextEl && ring ? !!(nextEl.el.compareDocumentPosition(ring) & Node.DOCUMENT_POSITION_FOLLOWING) : nextEl ? true : null;
  const seats = [...main.querySelectorAll(".mz-wait__seat")];
  const blocks = [...main.querySelectorAll("p, h1, h2, h3, .mz-kicker, button, .mz-lockcard, [role=timer], [role=status]")].filter((el) => !el.closest(".mz-wait"));
  const collisions = [];
  for (const s of seats) {
    for (const part of [s.firstElementChild, s.querySelector(".mz-seat__name")].filter(Boolean)) {
      const pr = rect(part);
      for (const bl of blocks) {
        const a = area(pr, rect(bl));
        if (a > 1) collisions.push({ seat: (s.querySelector(".mz-seat__name")?.textContent ?? "").slice(0, 24), part: part.classList.contains("mz-seat__name") ? "label" : "token", block: (bl.innerText || bl.className).replace(/\s+/g, " ").slice(0, 48), px2: Math.round(a) });
      }
    }
  }
  const ans = main.querySelector(".mz-lockcard__answer"), stamp = main.querySelector(".mz-lockcard__stamp");
  const stampOverAnswer = ans && stamp ? Math.round(area(rect(ans), rect(stamp))) : 0;
  return {
    label: main.getAttribute("aria-label"),
    innerWidth, innerHeight,
    next, nextBeforeRing,
    tellsToWait: /waiting for everyone/i.test(main.innerText),
    collisions, stampOverAnswer,
    sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || main.scrollWidth > main.clientWidth + 1,
    enabledOther: buttons.filter((b) => b.enabled && !/^(TV stage|Next question)$/i.test(b.text)).map((b) => b.text),
    text: main.innerText.replace(/\s+/g, " ").slice(0, 400),
  };
}, { AFTER_LOCK, keepScroll });

/** Tap an open answer and wait for the screen that follows a lock. */
async function lockOne(page, index = 0) {
  const slab = page.locator(".mz-slab:not([disabled])").nth(index);
  await slab.waitFor({ timeout: 20000 });
  await slab.click();
  await page.locator(AFTER_LOCK).first().waitFor({ timeout: 15000 });
  await sleep(250); // let the ring's count settle before measuring
}
const questionNumber = async (page) => {
  const t = await page.locator(".mz-qhead .mz-muted").first().innerText({ timeout: 15000 }).catch(() => "");
  return Number((/Question (\d+) of/.exec(t) ?? [])[1] ?? NaN);
};
/** Lock the rest of the questions, tapping Next question in between; true once on the final screen. */
async function finishAll(page) {
  for (let i = 0; i < 15; i++) {
    await lockOne(page);
    if (await page.locator(FINAL).count()) return true;
    const nx = page.getByRole("button", { name: "Next question" });
    await nx.scrollIntoViewIfNeeded();
    await nx.click();
  }
  return false;
}
function nonfinalChecks(tag, who, m) {
  const n = m.next;
  check(`${tag} ${who} L1 Next question is enabled and fully inside the initial viewport`, !!n && n.enabled && n.top >= 0 && n.bottom <= m.innerHeight && n.left >= 0 && n.right <= m.innerWidth, JSON.stringify({ next: n, viewport: [m.innerWidth, m.innerHeight] }));
  check(`${tag} ${who} L1 nothing covers it (the element at its centre is the button)`, !!n && n.hitIsButton, JSON.stringify(n));
  check(`${tag} ${who} L2 it comes before the room's progress`, m.nextBeforeRing === true, String(m.nextBeforeRing));
  check(`${tag} ${who} L2 nothing says to wait for everyone`, !m.tellsToWait, (m.text ?? "").slice(0, 160));
  check(`${tag} ${who} L3 no seat token or label overlaps text or a control`, (m.collisions ?? []).length === 0, JSON.stringify(m.collisions));
  check(`${tag} ${who} L4 no sideways scroll`, !m.sideways);
}
function finalChecks(tag, who, f) {
  check(`${tag} ${who} F after the final answer: no enabled continuation control`, !f.missing && !f.next && f.enabledOther.length === 0, JSON.stringify({ missing: f.missing, next: f.next, enabled: f.enabledOther, text: f.text?.slice(0, 120) }));
  check(`${tag} ${who} F it says all their answers are in`, f.label === "All your answers are in" && /all your answers are in/i.test(f.text ?? ""), (f.text ?? "").slice(0, 200));
  check(`${tag} ${who} F no seat token or label overlaps text or a control`, (f.collisions ?? []).length === 0, JSON.stringify(f.collisions));
  check(`${tag} ${who} F no sideways scroll`, !f.sideways);
}

async function startServer() {
  const dataDir = mkdtempSync(pathJoin(tmpdir(), "locked-answer-"));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: dataDir, MCHEZO_CONTENT_TEST_MODE: "approve-provisional" };
  delete env.NODE_ENV;
  if (SCALE < 1) env.MCHEZO_LIFECYCLE_SCALE = String(SCALE); else delete env.MCHEZO_LIFECYCLE_SCALE;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => { out += d.toString(); });
  child.stderr.on("data", (d) => { out += d.toString(); });
  let port = null;
  for (let i = 0; i < 120 && port === null && child.exitCode === null; i++) {
    const m = /on http:\/\/localhost:(\d+)/.exec(out);
    if (m) port = Number(m[1]); else await sleep(250);
  }
  if (!port) throw new Error(`scaled server did not start: ${out.slice(-400)}`);
  return { child, port, dataDir };
}
async function stopServer(proc) {
  if (!proc) return;
  proc.child.kill("SIGTERM");
  for (let i = 0; i < 20; i++) { if (proc.child.exitCode !== null || proc.child.signalCode !== null) break; await sleep(250); }
  if (proc.child.exitCode === null && proc.child.signalCode === null) proc.child.kill("SIGKILL");
  rmSync(proc.dataDir, { recursive: true, force: true });
}

const SIZES = [
  { tag: "320x480", width: 320, height: 480, phone: true },
  { tag: "390x844", width: 390, height: 844, phone: true },
  { tag: "1440x900", width: 1440, height: 900, phone: false },
];

const browser = await launchChromium();
let scaled = null;
try {
  // ======================= A. Layout (gate server) =======================
  for (const size of SIZES) {
    const vp = { width: size.width, height: size.height };
    const hCtx = await browser.newContext({ viewport: vp });
    const gCtx = await browser.newContext({ viewport: vp });
    const h = await hCtx.newPage();
    const g = await gCtx.newPage();
    const code = await host(GATE_BASE, h, "Keku");
    await joinAs(GATE_BASE, g, LONG_NAME, code);
    const start = await startGame(h, "trivia", size.tag);
    check(`${size.tag} setup: a two-player Casual Trivia game starts`, start.status === 201 || start.status === 200, JSON.stringify({ status: start.status, err: start.body?.error }));
    await passBriefing([h, g]);

    // Nonfinal: each player locks question 1 (the guest's long name is the lower seat on the host's ring).
    for (const [who, p] of [["host", h], ["guest", g]]) {
      await lockOne(p);
      const m = await measure(p);
      await p.screenshot({ path: pathJoin(SHOTS, `trivia-nonfinal-${who}-${size.tag}.png`) });
      nonfinalChecks(size.tag, who, m);
    }
    // T: the longest supported answer in the rendered card.
    if (size.phone) {
      await g.evaluate((t) => { document.querySelector(".mz-lockcard__answer").textContent = t; }, LONG_ANSWER);
      const m = await measure(g);
      await g.screenshot({ path: pathJoin(SHOTS, `trivia-nonfinal-long-answer-${size.tag}.png`) });
      const n = m.next;
      check(`${size.tag} T with an 80-character answer, Next question is still inside the initial viewport and uncovered`, !!n && n.top >= 0 && n.bottom <= m.innerHeight && n.hitIsButton, JSON.stringify({ next: n, viewport: [m.innerWidth, m.innerHeight] }));
      check(`${size.tag} T the LOCKED IN stamp stays clear of the long answer`, m.stampOverAnswer <= 1, `${m.stampOverAnswer}px²`);
      check(`${size.tag} T no overlap and no sideways scroll with the long answer`, m.collisions.length === 0 && !m.sideways, JSON.stringify(m.collisions));
    }
    // L1: it works — the next question opens.
    await h.getByRole("button", { name: "Next question" }).click();
    check(`${size.tag} host L1 Next question opens question 2`, (await questionNumber(h)) === 2);

    if (size.phone) {
      check(`${size.tag} host F setup: the rest answered, ending on the final screen`, await finishAll(h));
      const f = await measure(h);
      await h.screenshot({ path: pathJoin(SHOTS, `trivia-final-host-${size.tag}.png`) });
      finalChecks(size.tag, "host", f);
    }
    await hCtx.close();
    await gCtx.close();
  }

  // Z: enlarged text, as page zoom gives it on a 390×844 phone.
  for (const z of [{ tag: "zoom150", width: 260, height: 563, dsf: 1.5 }, { tag: "zoom200", width: 195, height: 422, dsf: 2 }]) {
    const hCtx = await browser.newContext({ viewport: { width: z.width, height: z.height }, deviceScaleFactor: z.dsf });
    const gCtx = await browser.newContext({ viewport: { width: z.width, height: z.height }, deviceScaleFactor: z.dsf });
    const h = await hCtx.newPage();
    const g = await gCtx.newPage();
    const code = await host(GATE_BASE, h, "Keku");
    await joinAs(GATE_BASE, g, LONG_NAME, code);
    await startGame(h, "trivia", z.tag);
    await passBriefing([h, g]);
    await lockOne(h);
    const m = await measure(h);
    await h.screenshot({ path: pathJoin(SHOTS, `trivia-nonfinal-host-${z.tag}.png`) });
    check(`${z.tag} Z no sideways scroll`, !m.sideways);
    check(`${z.tag} Z no seat token or label overlaps text or a control`, m.collisions.length === 0, JSON.stringify(m.collisions));
    check(`${z.tag} Z Next question comes before the room's progress`, m.nextBeforeRing === true);
    // Reach it by scrolling the screen (it scrolls itself), then it must be uncovered and work.
    await h.getByRole("button", { name: "Next question" }).scrollIntoViewIfNeeded();
    const s = await measure(h, { keepScroll: true });
    check(`${z.tag} Z Next question is reachable by scrolling and uncovered`, !!s.next && s.next.top >= 0 && s.next.bottom <= s.innerHeight && s.next.hitIsButton, JSON.stringify(s.next));
    await h.getByRole("button", { name: "Next question" }).click();
    check(`${z.tag} Z Next question opens question 2`, (await questionNumber(h)) === 2);
    await hCtx.close();
    await gCtx.close();
  }

  // ======================= C. Geography, Math Mayhem, sat-out ring (gate server) =======================
  for (const gameId of ["geography", "math-mayhem"]) {
    const vp = { width: 320, height: 480 };
    const hCtx = await browser.newContext({ viewport: vp });
    const gCtx = await browser.newContext({ viewport: vp });
    const h = await hCtx.newPage();
    const g = await gCtx.newPage();
    const code = await host(GATE_BASE, h, "Keku");
    await joinAs(GATE_BASE, g, LONG_NAME, code);
    const start = await startGame(h, gameId, gameId);
    check(`${gameId} 320x480 setup: a two-player casual game starts`, start.status === 201 || start.status === 200, JSON.stringify({ status: start.status, err: start.body?.error }));
    await passBriefing([h, g]);
    await lockOne(h);
    const m = await measure(h);
    await h.screenshot({ path: pathJoin(SHOTS, `${gameId}-nonfinal-host-320x480.png`) });
    nonfinalChecks(`${gameId} 320x480`, "host", m);
    await h.getByRole("button", { name: "Next question" }).click();
    check(`${gameId} 320x480 host L1 Next question opens question 2`, (await questionNumber(h)) === 2);
    check(`${gameId} 320x480 host F setup: the rest answered, ending on the final screen`, await finishAll(h));
    const f = await measure(h);
    await h.screenshot({ path: pathJoin(SHOTS, `${gameId}-final-host-320x480.png`) });
    finalChecks(`${gameId} 320x480`, "host", f);
    await hCtx.close();
    await gCtx.close();
  }
  {
    // The shared ring's other Trivia caller: a guest who sits the game out.
    const vp = { width: 320, height: 480 };
    const hCtx = await browser.newContext({ viewport: vp });
    const gCtx = await browser.newContext({ viewport: vp });
    const h = await hCtx.newPage();
    const g = await gCtx.newPage();
    const code = await host(GATE_BASE, h, LONG_NAME);
    await joinAs(GATE_BASE, g, "Amina", code);
    await startGame(h, "trivia", "satout");
    await passBriefing([h, g]);
    await g.getByRole("button", { name: "Sit this game out" }).click();
    await g.locator(".mz-wait").waitFor({ timeout: 15000 });
    await sleep(300);
    const s = await g.evaluate(() => {
      const area = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const wait = document.querySelector(".mz-wait");
      const root = wait.parentElement;
      const blocks = [...root.querySelectorAll("p, .mz-kicker, button, [role=timer]")].filter((el) => !el.closest(".mz-wait"));
      const out = [];
      for (const seat of wait.querySelectorAll(".mz-wait__seat")) for (const part of [seat.firstElementChild, seat.querySelector(".mz-seat__name")].filter(Boolean)) for (const b of blocks) { const a = area(part.getBoundingClientRect(), b.getBoundingClientRect()); if (a > 1) out.push({ seat: seat.innerText.slice(0, 24), block: b.innerText.slice(0, 40), px2: Math.round(a) }); }
      return out;
    });
    await g.screenshot({ path: pathJoin(SHOTS, "trivia-sat-out-guest-320x480.png") });
    check("sat-out ring 320x480 L3 no seat token or label overlaps text (the guest is the lower seat)", s.length === 0, JSON.stringify(s));
    await hCtx.close();
    await gCtx.close();
  }

  // ======================= B. Journey on a scaled server =======================
  scaled = await startServer();
  const B = `http://localhost:${scaled.port}`;
  const hCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const gCtx = await browser.newContext({ viewport: { width: 320, height: 480 } });
  const tCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const h = await hCtx.newPage();
  const g = await gCtx.newPage();
  const tv = await tCtx.newPage();
  const code = await host(B, h, "Keku");
  await joinAs(B, g, "Amina", code);
  await spectate(B, tv, code);
  const start = await startGame(h, "trivia", "journey");
  check("B setup: Casual Trivia starts with the TV watching", start.status === 201 || start.status === 200, JSON.stringify({ status: start.status }));
  const gid = start.body?.gameId;
  await passBriefing([h, g]);
  await h.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });

  // B1: the TV while playing.
  const leakOf = (game) => /"correctIndex"|"answer"\s*:|"myAnswers"/.test(JSON.stringify(game ?? {}));
  await soon("B1 the TV shows the playing game", async () => /each phone goes at its own pace/i.test(await tv.evaluate(() => document.body.innerText)), 20000);
  const p1 = await tvRoom(h);
  const g1 = (p1.games ?? []).find((x) => x.id === gid);
  check("B1 while playing, the TV's projection carries no answers", g1?.status === "playing" && !leakOf(g1), JSON.stringify({ status: g1?.status, leaks: leakOf(g1) }));
  const revealTab = tv.getByRole("tab", { name: "Reveal" });
  const hadReveal = (await revealTab.count()) > 0;
  if (hadReveal) await revealTab.first().click();
  await sleep(300);
  const tvText = await tv.evaluate(() => document.body.innerText);
  check(`B1 while playing, the TV shows no answer${hadReveal ? " (Reveal says it plays when the game finishes)" : " (no Reveal control on this TV)"}`, !/The answer is/i.test(tvText) && (!hadReveal || /The reveal plays here when the game finishes/i.test(tvText)), tvText.replace(/\s+/g, " ").slice(0, 160));
  await tv.screenshot({ path: pathJoin(SHOTS, "journey-tv-playing.png") });
  const questionTab = tv.getByRole("tab", { name: "Question" });
  if (await questionTab.count()) await questionTab.first().click();

  // B2: both lock and advance independently; the guest reloads on the locked view.
  await lockOne(h);
  nonfinalChecks("B2", "host 390x844", await measure(h));
  await h.getByRole("button", { name: "Next question" }).click();
  check("B2 the host moves on to question 2 by themself", (await questionNumber(h)) === 2);
  await lockOne(g);
  nonfinalChecks("B2", "guest 320x480", await measure(g));
  const seatBefore = await g.evaluate(() => sessionStorage.getItem("cgn_playerId"));
  await g.reload({ waitUntil: "domcontentloaded" });
  await soon("B2 after a reload on the locked view, the guest resumes at question 2", async () => (await questionNumber(g)) === 2, 20000);
  check("B2 the guest keeps the same seat", !!seatBefore && (await g.evaluate(() => sessionStorage.getItem("cgn_playerId"))) === seatBefore, String(seatBefore));
  await lockOne(g);
  check("B2 the guest's second answer locks (nonfinal screen)", (await g.locator(NONFINAL).count()) === 1);

  // B3: the host finishes; a reload keeps "All your answers are in".
  check("B3 host: the rest answered, ending on the final screen", await finishAll(h));
  finalChecks("B3", "host 390x844", await measure(h));
  await h.screenshot({ path: pathJoin(SHOTS, "journey-host-final-390x844.png") });
  await h.reload({ waitUntil: "domcontentloaded" });
  await soon("B3 after a reload the host still sees all their answers are in, with no question", async () => /all your answers are in/i.test(await h.evaluate(() => document.body.innerText)) && (await h.locator(".mz-slab:not([disabled])").count()) === 0, 20000);
  check("B3 after the reload there is no continuation control", (await h.getByRole("button", { name: /Next question|Waiting for the game to finish/ }).count()) === 0);

  // B4: the guest stops after 2 answers; the server's deadline ends the game.
  const p0 = await tvRoom(h);
  const g0 = (p0.games ?? []).find((x) => x.id === gid);
  const leftMs = Math.max(0, (g0?.deadlineAt ?? 0) - (p0.serverNow ?? 0));
  console.log(`     (the game's server deadline is ${Math.round(leftMs / 1000)} s away, at scale ${SCALE}${SCALE === 1 ? ": the real clock" : ", test-only"})`);
  const atResults = async (p) => (await p.getByTestId("results-hero").count()) > 0 || (await p.getByTestId("mz-outcome").count()) > 0 || (await p.getByTestId("casual-results").count()) > 0;
  await soon("B4 the host's phone reaches the results with no host action", () => atResults(h), leftMs + 25_000);
  await soon("B4 the guest's phone reaches the results too", () => atResults(g), 20000);
  const fin = await tvRoom(h);
  const fg = (fin.games ?? []).find((x) => x.id === gid);
  check("B4 the server ended it at its deadline", fg?.status === "finished" && fg?.outcome?.reason === "deadline", JSON.stringify({ status: fg?.status, outcome: fg?.outcome }));
  const ids = Object.fromEntries((fin.players ?? []).map((p) => [p.displayName, p.id]));
  const amina = fg?.rawScores?.[ids.Amina];
  check("B4 the guest scored only their 2 answers (0, 120 or 240)", [0, 120, 240].includes(amina), JSON.stringify(fg?.rawScores));
  const gText = await g.evaluate(() => document.body.innerText);
  check("B4 the guest's results say time ran out", /Time’s up|time ran out/i.test(gText), gText.replace(/\s+/g, " ").slice(0, 200));
  await g.screenshot({ path: pathJoin(SHOTS, "journey-guest-results-320x480.png") });

  // B5: the TV goes to the finished game's review.
  await soon("B5 the TV shows the finished game", async () => /Game finished/i.test(await tv.evaluate(() => document.body.innerText)), 20000);
  await tv.screenshot({ path: pathJoin(SHOTS, "journey-tv-finished.png") });

  // B6: Play again from the host's results.
  const again = h.getByTestId("next-play-again");
  await soon("B6 the host has Play again", async () => (await again.count()) === 1, 15000);
  await again.click();
  for (const [who, p] of [["host", h], ["guest", g]]) await soon(`B6 ${who}: the new game's briefing (seat kept)`, async () => (await p.getByTestId("briefing").count()) === 1, 20000);
  const rp = await tvRoom(h);
  const newGame = (rp.games ?? []).find((x) => x.id !== gid && x.gameId === "trivia" && x.status === "briefing");
  check("B6 a new Trivia game in its briefing", !!newGame, JSON.stringify((rp.games ?? []).map((x) => [x.gameId, x.status])));
  check("B6 readiness reset: nobody is ready yet", (await h.getByTestId("briefing-ready").getAttribute("aria-pressed")) !== "true" && (await g.getByTestId("briefing-ready").getAttribute("aria-pressed")) !== "true");
  await passBriefing([h, g]);
  await h.locator(".mz-slab:not([disabled])").first().waitFor({ timeout: 20000 });
  await soon("B6 the TV follows to the new game", async () => { const t = await tv.evaluate(() => document.body.innerText); return /each phone goes at its own pace/i.test(t) && !/Game finished/i.test(t); }, 20000);
  const p2 = await tvRoom(h);
  const ng = (p2.games ?? []).find((x) => x.id === newGame?.id);
  check("B6 the new game's TV projection carries no answers", ng?.status === "playing" && !leakOf(ng), String(ng?.status));
  check("B6 the TV shows no answer for the new game", !/The answer is/i.test(await tv.evaluate(() => document.body.innerText)));
  await tv.screenshot({ path: pathJoin(SHOTS, "journey-tv-rematch-playing.png") });
  await hCtx.close();
  await gCtx.close();
  await tCtx.close();
} catch (e) {
  check("check-locked-answer journey crashed", false, String(e?.stack ?? e).slice(0, 600));
} finally {
  await browser.close();
  await stopServer(scaled);
}
console.log(failures ? `\nLOCKED ANSWER CHECK FAILED (${failures})` : "\nLOCKED ANSWER CHECK PASSED");
process.exit(failures ? 1 : 0);
