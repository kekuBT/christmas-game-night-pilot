// Live audit triage (2026-11-08): regression checks for every audit finding
// confirmed on the D3 build. See docs/audit-triage/RECONCILIATION.md.
//
//  A-01/A-02  Answer cards: once answers lock, no visible card overlaps
//             another and the chosen card (with its LOCKED IN stamp and its
//             own label) is on top; long labels never run under a stamp.
//             Play (with a slow network, so the locked grid stays on screen),
//             the locked-answer card, results review (every question, jumps,
//             auto reveal), at 375, 390 and 430 px, full and reduced motion.
//  A-03       Phone standings: a three-way tie for first shows all three
//             players on every phone (phones at 375, 390, 430 px).
//  A-05       A guest on another screen (Library, Championship) is brought to
//             the briefing; a guest on the TV view can get back to Ready.
//  A-06       A reload whose first projection is slow shows an honest
//             "rejoining" state, never "You're in, friend · 0 here".
//  A-07       Someone who joins after a game finished lands in the lobby,
//             not on that game's results as a zero-scoring player.
//  A-13       (guard) A spectator who joins after a game sees that game's own
//             questions, also in a tab that watched another room first.
// Usage: node scripts/check-audit-fixes.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";
import { roomGo } from "./lib/room-nav.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function enter(page, name, code) {
  await page.goto(`${BASE}/${code ? "join" : "host"}`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  if (!code) {
    await page.getByRole("button", { name: "Host a game" }).click();
    const chip = page.getByRole("button", { name: /^Share room code / });
    await chip.waitFor({ timeout: 15000 });
    let c = "";
    for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(c); i++) { c = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(c)) await sleep(300); }
    return c;
  }
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function spectate(page, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
}
const tvProj = (page) => page.evaluate(async () => (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=tv`)).json());
async function startPractice(host, gameId) {
  await host.getByTestId("choose-game").click();
  await host.getByTestId(`select-game-${gameId}`).click();
  await host.getByTestId("mode-practice").click();
  await host.getByTestId(`start-practice-${gameId}`).click();
}
const LONG = ["The printing press with movable type", "A partridge in a pear tree", "30 million km per second", "A J or shepherd's crook"];

/**
 * Answer-grid integrity, measured in the page. Only what a player can see
 * counts: cards with opacity above 5%. Returns a list of problems.
 */
const GRID_PROBLEMS = () => {
  const grid = document.querySelector(".mz-answers");
  if (!grid) return ["no answer grid on screen"];
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const slabs = [...grid.querySelectorAll(".mz-slab")].map((el, i) => ({ el, i, r: box(el), op: Number(getComputedStyle(el).opacity), sel: el.classList.contains("mz-slab--selected"), label: el.querySelector(".mz-slab__label"), stamp: el.querySelector(".mz-slab__stamp") }));
  const vis = slabs.filter((s) => s.op > 0.05);
  const out = [];
  for (let a = 0; a < vis.length; a++) for (let b = a + 1; b < vis.length; b++) {
    const o = area(vis[a].r, vis[b].r);
    if (o > 4) out.push(`visible cards ${vis[a].i} and ${vis[b].i} overlap by ${Math.round(o)}px² (opacity ${vis[a].op}/${vis[b].op})`);
  }
  const sel = slabs.find((s) => s.sel);
  if (sel) {
    const top = (el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit?.closest(".mz-slab") === sel.el; };
    if (!top(sel.label)) out.push(`the chosen card's label (${sel.i}) is covered by another card`);
    if (sel.stamp && !top(sel.stamp)) out.push(`the LOCKED IN stamp (${sel.i}) is covered by another card`);
    if (sel.stamp && area(box(sel.stamp), box(sel.label)) > 4) out.push(`the LOCKED IN stamp overlaps the chosen label (${Math.round(area(box(sel.stamp), box(sel.label)))}px²)`);
  }
  return out;
};
const setLongLabels = (labels) => document.querySelectorAll(".mz-answers .mz-slab__label").forEach((e, i) => { e.textContent = labels[i % labels.length]; });

const browser = await launchChromium();
try {
  // ---------------- A-01 / A-02: answer cards ----------------
  for (const [w, h, reduced] of [[375, 812, false], [390, 844, false], [430, 932, false], [390, 844, true]]) {
    const tag = `${w}px${reduced ? " reduced motion" : ""}`;
    const hctx = await browser.newContext({ viewport: { width: w, height: h }, ...(reduced ? { reducedMotion: "reduce" } : {}) });
    const host = await hctx.newPage();
    const code = await enter(host, "Ada");
    const bctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const bea = await bctx.newPage();
    await enter(bea, "Bea", code);
    await startPractice(host, "trivia");
    await passBriefing([host, bea]);
    await host.locator(".mz-question").waitFor({ timeout: 15000 });
    // A slow network (the audit's cloud browser): answers take 1.2 s to land,
    // so the locked grid stays on screen as it does on a slow phone.
    await host.route("**/intents", async (route) => { await sleep(1200); await route.continue(); });
    const playProblems = [];
    let lockcardIssue = "";
    for (let q = 0; q < 10; q++) {
      await host.locator(".mz-slab").first().waitFor({ timeout: 15000 });
      await host.locator(".mz-slab").nth(q % 4).click();
      await sleep(650);
      const p = await host.evaluate(GRID_PROBLEMS);
      if (!(p.length === 1 && p[0] === "no answer grid on screen")) playProblems.push(...p.map((x) => `Q${q + 1} pick ${q % 4}: ${x}`));
      if (q === 5) {
        await host.evaluate(setLongLabels, LONG);
        for (const x of await host.evaluate(GRID_PROBLEMS)) if (x !== "no answer grid on screen") playProblems.push(`Q6 long labels: ${x}`);
      }
      // The locked-answer card that follows: a long answer must not run under its stamp.
      await host.locator(".mz-lockcard").waitFor({ timeout: 15000 });
      if (q === 0) {
        // Measured once the stamp has landed (its 0.15 s + 0.4 s "slam" starts
        // invisible at 1.8x scale). The old absolute stamp still overlapped a
        // long answer by 3,468-4,499 px² at this point; the fix leaves 0.
        await host.evaluate((long) => { document.querySelector(".mz-lockcard__answer").textContent = long; }, LONG[3]);
        await sleep(900);
        lockcardIssue = await host.evaluate(() => {
          const a = document.querySelector(".mz-lockcard__answer"); const s = document.querySelector(".mz-lockcard__stamp");
          const r1 = a.getBoundingClientRect(); const r2 = s.getBoundingClientRect();
          const o = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left)) * Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
          return o > 4 ? `stamp overlaps the answer by ${Math.round(o)}px²` : "";
        });
      }
      const next = host.getByRole("button", { name: /Next question|Waiting for the game to finish/ });
      if ((await next.innerText()).startsWith("Next")) await next.click(); else break;
    }
    await host.unroute("**/intents");
    check(`A-01 ${tag}: while answers lock, no visible card overlaps another and the chosen card is on top`, playProblems.length === 0, playProblems.slice(0, 3).join(" | "));
    check(`A-01 ${tag}: a long answer never runs under the LOCKED IN stamp on the locked card`, lockcardIssue === "", lockcardIssue);
    await bea.getByRole("button", { name: "Sit this game out" }).click().catch(() => {});
    await host.getByTestId("mz-reveal-step").waitFor({ timeout: 30000 });
    const reviewProblems = [];
    for (const target of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 5, 0, 9, 2]) {
      await host.getByTestId(`mz-reveal-q${target}`).click();
      await sleep(150);
      for (const x of await host.evaluate(GRID_PROBLEMS)) if (/covered/.test(x)) reviewProblems.push(`mid-transition → Q${target + 1}: ${x}`);
      await sleep(600);
      reviewProblems.push(...(await host.evaluate(GRID_PROBLEMS)).map((x) => `→ Q${target + 1}: ${x}`));
    }
    check(`A-02 ${tag}: results review shows only the chosen card, on top, for every question and jump`, reviewProblems.length === 0, reviewProblems.slice(0, 3).join(" | "));
    await host.getByTestId("mz-reveal-q0").click(); await sleep(700);
    await host.evaluate(setLongLabels, LONG);
    const longReview = await host.evaluate(GRID_PROBLEMS);
    check(`A-02 ${tag}: long labels on the review stay clear of the stamp`, longReview.length === 0, longReview.join(" | "));
    await host.getByTestId("mz-reveal-q0").click(); await sleep(400);
    await host.getByTestId("mz-reveal-play").click();
    const autoProblems = [];
    for (let k = 0; k < 6; k++) { await sleep(700); const p = await host.evaluate(GRID_PROBLEMS); if (!(p.length === 1 && p[0] === "no answer grid on screen")) autoProblems.push(...p); }
    check(`A-02 ${tag}: auto reveal never shows overlapping cards`, autoProblems.length === 0, autoProblems.slice(0, 2).join(" | "));
    await hctx.close(); await bctx.close();
  }

  // ---------------- A-03: three-way tie on three phones ----------------
  {
    const pages = [];
    const sizes = [[375, 812], [390, 844], [430, 932]];
    const names = ["Player 1", "Audit Guest", "Audit Third"];
    let code = "";
    for (let i = 0; i < 3; i++) {
      const p = await (await browser.newContext({ viewport: { width: sizes[i][0], height: sizes[i][1] } })).newPage();
      if (i === 0) code = await enter(p, names[0]); else await enter(p, names[i], code);
      pages.push(p);
    }
    await startPractice(pages[0], "trivia");
    await passBriefing(pages);
    // Everyone sits the game out: three-way tie for first (all 0), the same
    // display case as the audit's three-way tie at 1,200.
    for (const p of pages) await p.getByRole("button", { name: "Sit this game out" }).click({ timeout: 15000 });
    const scores = (await tvProj(pages[0])).games.at(-1);
    check("A-03 setup: the server has a three-way tie", !!scores && Object.values(scores.rawScores ?? {}).length === 3 && new Set(Object.values(scores.rawScores)).size === 1, JSON.stringify(scores?.rawScores));
    for (let i = 0; i < 3; i++) {
      const p = pages[i];
      await p.getByTestId("mz-reveal-standings").click({ timeout: 20000 });
      const rows = p.locator(".mz-standings__row");
      await rows.first().waitFor({ timeout: 10000 });
      const shown = await p.locator(".mz-standings__name").allInnerTexts();
      check(`A-03 ${sizes[i][0]}px (${names[i]}): all three tied-first players are listed`, (await rows.count()) === 3, shown.join(", "));
      check(`A-03 ${sizes[i][0]}px (${names[i]}): every row shows rank 1`, (await p.locator(".mz-standings__rank").allInnerTexts()).every((t) => t.trim() === "1"));
      check(`A-03 ${sizes[i][0]}px: no horizontal overflow on standings`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    }

    // ---------------- A-07: a late joiner after that finished game ----------------
    const late = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await late.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await late.getByPlaceholder("e.g. Auntie June").fill("Cal");
    await late.locator(".mz-code__input").fill(code);
    await late.getByRole("button", { name: "Join the game" }).click();
    const inLobby = await late.getByRole("heading", { name: "You’re in, Cal." }).waitFor({ timeout: 10000 }).then(() => true, () => false);
    const lateText = await late.locator("body").innerText();
    check("A-07: someone who joins after a game finished lands in the lobby", inLobby, lateText.slice(0, 120));
    check("A-07: ...and is not shown that game's results as if they had played", !/Did not answer|You didn.t answer|Your game total/.test(lateText), lateText.slice(0, 160));
    const fin = await tvProj(pages[0]);
    const calId = fin.players.find((p) => p.displayName === "Cal")?.id;
    check("A-07: the server never made the late joiner a participant or gave them a score", !fin.games.at(-1).players.includes(calId) && !(calId in (fin.games.at(-1).rawScores ?? {})));

    // ---------------- A-13 (guard): spectator after the game ----------------
    const played = (fin.games.at(-1).state?.questions ?? []).map((q) => q.prompt);
    const tv = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await spectate(tv, code);
    await sleep(1500);
    const tvText = await tv.locator("body").innerText();
    check("A-13: a spectator joining after the game sees that game's own questions", played.some((p) => tvText.includes(p)), tvText.slice(0, 120));
  }

  // ---------------- A-13 (guard): a tab that watched another room first ----------------
  {
    const a1 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const codeA = await enter(a1, "Ann");
    const a2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await enter(a2, "Abe", codeA);
    await startPractice(a1, "geography");
    await passBriefing([a1, a2]);
    for (const p of [a1, a2]) await p.getByRole("button", { name: "Sit this game out" }).click({ timeout: 15000 });
    const geo = ((await tvProj(a1)).games.at(-1).state?.questions ?? []).map((q) => q.prompt);
    const b1 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const codeB = await enter(b1, "Bo");
    const b2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await enter(b2, "Bi", codeB);
    await startPractice(b1, "trivia");
    await passBriefing([b1, b2]);
    for (const p of [b1, b2]) await p.getByRole("button", { name: "Sit this game out" }).click({ timeout: 15000 });
    const triv = ((await tvProj(b1)).games.at(-1).state?.questions ?? []).map((q) => q.prompt);
    const tvTab = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await spectate(tvTab, codeA); await sleep(1000);
    await tvTab.getByRole("button", { name: "Stop watching" }).click();
    await tvTab.getByTestId("home-join").click(); // Stage 2: Stop watching returns Home
    await tvTab.locator(".mz-code__input").fill(codeB); await tvTab.getByTestId("watch-spectator").click();
    await tvTab.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 }); await sleep(1500);
    const t = await tvTab.locator("body").innerText();
    check("A-13: after switching rooms, the TV shows the new room's game only", triv.some((p) => t.includes(p)) && !geo.some((p) => t.includes(p)));
  }

  // ---------------- A-05: guests away from the lobby when the host starts ----------------
  for (const [where, w] of [["library", 375], ["championship", 390], ["tv", 430]]) {
    const h = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const code = await enter(h, "Ada");
    const g = await (await browser.newContext({ viewport: { width: w, height: 844 } })).newPage(); await enter(g, "Bea", code);
    // Each guest really is on that screen before the host starts (nothing
    // swallowed: a missed tap must fail loudly). Stage 2: via the room menu.
    if (where === "library") { await roomGo(g, "library"); await g.getByTestId("mz-lib-count").waitFor({ timeout: 15000 }); }
    if (where === "championship") { await roomGo(g, "cup"); await g.getByText("Championship standings").waitFor({ timeout: 15000 }); }
    if (where === "tv") { await roomGo(g, "tv"); await g.getByText("TV Dashboard — public only").waitFor({ timeout: 15000 }); }
    await sleep(600);
    await startPractice(h, "trivia");
    await h.getByTestId("briefing").waitFor({ timeout: 15000 });
    if (where === "tv") {
      const tvBrief = await g.getByTestId("tv-briefing").waitFor({ timeout: 8000 }).then(() => true, () => false);
      const back = g.getByTestId("briefing-tv-back");
      const offered = tvBrief && (await back.waitFor({ timeout: 5000 }).then(() => true, () => false));
      check(`A-05 ${w}px: a player on the TV view is offered a way back to Ready`, offered);
      if (offered) await back.click();
    }
    const ready = await g.getByTestId("briefing-ready").waitFor({ timeout: 8000 }).then(() => true, () => false);
    check(`A-05 ${w}px: a guest on the ${where} screen reaches the briefing and its I'm ready button`, ready);
    if (ready) {
      await passBriefing([h, g]);
      check(`A-05 ${w}px: after Ready, play starts for the guest too`, await g.locator(".mz-question").waitFor({ timeout: 15000 }).then(() => true, () => false));
    }
  }

  // ---------------- A-06: reload with a slow first projection ----------------
  for (const w of [375, 430]) {
    const h = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const code = await enter(h, "Ada");
    const g = await (await browser.newContext({ viewport: { width: w, height: 844 } })).newPage(); await enter(g, "Bea", code);
    await g.route("**/projection?audience=player", async (route) => { await sleep(4000); await route.continue(); });
    await g.routeWebSocket(/.*/, (ws) => { setTimeout(() => ws.connectToServer(), 4000); });
    await g.reload({ waitUntil: "domcontentloaded" });
    await sleep(1200);
    const early = await g.locator("body").innerText();
    check(`A-06 ${w}px: while the room loads, no fake empty lobby ("friend", "0 here")`, !/You’re in, friend|0 here/.test(early), early.slice(0, 120).replace(/\s+/g, " "));
    check(`A-06 ${w}px: ...an honest "rejoining" status instead`, (await g.getByTestId("rejoining").count()) === 1);
    check(`A-06 ${w}px: ...which offers the same Reconnect action as the lobby`, (await g.getByTestId("rejoining").getByRole("button", { name: "Reconnect" }).count()) === 1);
    const restored = await g.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 }).then(() => true, () => false);
    check(`A-06 ${w}px: the real lobby (name, players) follows`, restored);
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? "AUDIT FIXES ALL PASSED" : `AUDIT FIXES FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
