// Stage 7.2: casual results and explicit session continuation, end to end in
// the browser (docs/stage7/stage72.md). Two players (Keku hosts, Amina) and a
// spectator on the TV view, in a casual room with a two-game Quick Party
// lineup: Math Mayhem, then Trivia Showdown.
//   A  game 1 (Math, no results screen of its own) ends on the casual results
//      screen for both: one result heading saying Casual (never Practice),
//      the standings, the player's own answers, and no old shell (no 🎄
//      header, no Championship). Nothing starts by itself.
//   B  what's next, in sync: the host has "Next game: Trivia Showdown"; the
//      guest reads "Game 2 of 2. Keku starts it."; the TV says the same.
//      A reload on the results keeps all of it.
//   C  Next game with its reply lost: the press is asked again as the same
//      press (the same request id) and exactly one game starts; game 2 is
//      Trivia (its own results screen gains the panel). The lineup is then
//      complete for everyone and the TV.
//   D  Play again: a rematch of Trivia (a new game tied to the last one);
//      the lineup is untouched; the earlier games keep their scores.
//   E  Take a break (from the results): everyone and the TV see it; the
//      lobby's Start waits, for the host after a reload too; the guest has no
//      Resume and the server refuses the guest; Resume clears it for all.
//   F  a guest can't drive: no continuation buttons; the server refuses a
//      guest's Next/Play again.
//   G  keyboard: the panel's choices are reachable with Tab and work with Enter.
//   H  layout: the results panel at 320 and 1440 px without sideways scroll.
//   I  an uncertain Apply (P7): the planner's request is held past the app's
//      timeout and then reaches the server. The planner says it couldn't
//      confirm whether it saved (never "not saved"), and recognises the
//      host's own save when the room shows exactly that draft.
// Usage: node scripts/check-session-flow.mjs <baseUrl>   (the gate passes its server)
import { launchChromium } from "./lib/driver-env.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
async function host(page, name) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
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
async function join(page, name, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function spectate(page, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByTestId("tv-show").waitFor({ timeout: 15000 });
}
/** A call from the page with its own seat (the host's or the guest's). */
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(path.replace(":room", roomId), { method, headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { method, path, body });
const myRoom = async (page) => (await api(page, "GET", "/rooms/:room/projection?audience=player")).body;
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const testIds = (page, prefix) => page.locator(`[data-testid^="${prefix}"]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));

const browser = await launchChromium();
try {
  const h = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const code = await host(h, "Keku");
  const g = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await join(g, "Amina", code);
  const tv = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await spectate(tv, code);

  // The lineup (the planner itself is check-quick-party's): Math, then Trivia, for 2.
  const saved = await api(h, "POST", "/rooms/:room/party", { baseRevision: 0, plan: { expectedPlayers: 2, budgetMinutes: 30, items: [{ gameId: "math-mayhem" }, { gameId: "trivia" }] } });
  check("setup: the lineup is saved (Math, Trivia)", saved.status === 200, JSON.stringify(saved));
  await soon("setup: the host's Start names game 1 of 2", async () => /Start Math Mayhem · game 1 of 2/.test(await h.getByTestId("party-start").innerText()));
  await soon("setup: the TV shows the lineup, game 1 of 2", async () => /game 1 of 2/i.test(await tv.getByTestId("tv-lineup").innerText()));

  // ---- A. Game 1: Math, to the casual results screen ----
  await h.getByTestId("party-start").click();
  await passBriefing([h, g]);
  await answerKitQuestions(h, { player: "Keku", choose: () => 0 });
  await answerKitQuestions(g, { player: "Amina", choose: (n) => n % 4 });
  for (const [who, p] of [["host", h], ["guest", g]]) {
    await soon(`A ${who}: the casual results screen`, async () => p.getByTestId("casual-results").isVisible(), 40000);
  }
  for (const [who, p] of [["host", h], ["guest", g]]) {
    const kicker = await p.locator(".mz-rhero__kicker").innerText();
    check(`A ${who}: one result heading, Casual (not Practice)`, (await p.getByTestId("results-hero").count()) === 1 && /casual/i.test(kicker) && !/practice/i.test(kicker), kicker);
    const body = await p.evaluate(() => document.body.innerText);
    check(`A ${who}: no old shell (no 🎄 header, Championship, Practice, second winner line)`, (await p.getByTestId("show-results").count()) === 0 && !/Christmas Game Night|Championship|practice/i.test(body) && (await p.locator(".reveal-winner").count()) === 0);
    const rows = await p.locator('[data-testid="mz-scores"] li').count();
    check(`A ${who}: standings with both players`, rows === 2, String(rows));
    check(`A ${who}: their own answers to review`, (await p.getByTestId("mz-answer-review").count()) === 1);
  }
  await sleep(2500);
  let room = await myRoom(h);
  check("A nothing started by itself: one game, finished; the lineup's next is game 2", room.games.length === 1 && room.games[0].status === "finished" && room.party.lineup.next === 1 && room.party.lineup.items[0].status === "completed", JSON.stringify({ games: room.games.map((x) => [x.gameId, x.status]), next: room.party.lineup.next }));

  // ---- B. What's next, in sync (host, guest, TV); a reload keeps it ----
  await soon("B host: Next game: Trivia Showdown", async () => /Next game: Trivia Showdown/.test(await h.getByTestId("next-game").innerText()));
  await soon("B guest: up next, game 2 of 2, Keku starts it", async () => /Game 2 of 2\. Keku starts it\./.test(await g.getByTestId("next-status").innerText()));
  check("B guest: no continuation buttons", (await testIds(g, "next-")).every((id) => id === "next-status"), JSON.stringify(await testIds(g, "next-")));
  await soon("B TV: the next game, game 2 of 2", async () => /Next up: Trivia Showdown · game 2 of 2/.test(await tv.getByTestId("tv-next").innerText()));
  await h.reload({ waitUntil: "domcontentloaded" });
  await g.reload({ waitUntil: "domcontentloaded" });
  await soon("B reload: the host is back on the results with Next game", async () => (await h.getByTestId("casual-results").isVisible()) && /Trivia Showdown/.test(await h.getByTestId("next-game").innerText()));
  await soon("B reload: the guest is back on the results, waiting for Keku", async () => (await g.getByTestId("casual-results").isVisible()) && /Keku starts it/.test(await g.getByTestId("next-status").innerText()));

  // ---- F (part). The server refuses a guest's Next and Play again ----
  const gNext = await api(g, "POST", "/rooms/:room/games", { gameId: "trivia", official: false, party: { revision: room.party.revision, index: 1 }, roster: room.readiness.wouldPlay, attempt: { id: "guest-next-0001", sessionRevision: room.session.revision } });
  const gAgain = await api(g, "POST", "/rooms/:room/games", { rematchOf: room.games[0].id, roster: room.readiness.wouldPlay, attempt: { id: "guest-again-0001", sessionRevision: room.session.revision } });
  check("F the server refuses the guest's Next and Play again; nothing starts", gNext.status === 400 && gAgain.status === 400 && (await myRoom(h)).games.length === 1, JSON.stringify([gNext.status, gAgain.status]));

  // ---- C. Next game, its reply lost: the same press again, one game ----
  const posts = [];
  await h.route((url) => new URL(url).pathname.endsWith("/games"), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts.push(JSON.parse(route.request().postData() ?? "{}"));
    if (posts.length === 1) { await route.fetch(); await route.abort("connectionreset"); return; } // it reached the server; the reply is lost
    await route.continue();
  });
  await h.getByTestId("next-game").click();
  await soon("C Next whose reply was lost: the briefing opens for both", async () => (await h.getByTestId("briefing").isVisible()) && (await g.getByTestId("briefing").isVisible()), 20000);
  await h.unrouteAll({ behavior: "ignoreErrors" });
  room = await myRoom(h);
  check("C exactly one new game: Trivia, game 2 of the lineup", room.games.length === 2 && room.games[1].gameId === "trivia" && room.party.lineup.items[1].gameInstanceId === room.games[1].id, JSON.stringify(room.games.map((x) => [x.gameId, x.status])));
  check("C the retry was the same press (same request id, same session revision)", posts.length === 2 && posts[0].attempt?.id && posts[0].attempt.id === posts[1].attempt?.id && posts[0].attempt.sessionRevision === posts[1].attempt.sessionRevision && posts[0].party?.index === 1, JSON.stringify(posts.map((p) => p.attempt)));
  await passBriefing([h, g]);
  await answerKitQuestions(h, { player: "Keku", choose: () => 0 });
  await answerKitQuestions(g, { player: "Amina", choose: (n) => n % 4 });
  await soon("C game 2's own results (Trivia) carry the panel: the lineup is complete", async () => (await h.getByTestId("whats-next").getAttribute("data-state")) === "complete", 60000);
  await soon("C guest: that was the whole lineup", async () => /whole lineup/.test(await g.getByTestId("next-status").innerText()), 30000);
  await soon("C TV: that was the whole lineup", async () => (await tv.getByTestId("tv-next").getAttribute("data-flow")) === "complete");
  check("C host: no Next game once the lineup is complete; Play again and Plan another lineup offered", (await h.getByTestId("next-game").count()) === 0 && (await h.getByTestId("next-play-again").count()) === 1 && (await h.getByTestId("next-plan").count()) === 1);
  room = await myRoom(h);
  const before = room.games.map((x) => [x.id, JSON.stringify(x.rawScores)]);

  // ---- G (part) + D. Play again, by keyboard ----
  let reached = false;
  await h.locator("body").click({ position: { x: 2, y: 2 } }).catch(() => {});
  for (let i = 0; i < 60 && !reached; i++) {
    await h.keyboard.press("Tab");
    reached = await h.evaluate(() => document.activeElement?.getAttribute("data-testid") === "next-play-again");
  }
  check("G Play again is reachable with Tab", reached);
  await h.keyboard.press("Enter");
  await soon("D Play again (Enter): a new briefing for Trivia", async () => (await h.getByTestId("briefing").isVisible()) && (await g.getByTestId("briefing").isVisible()), 20000);
  room = await myRoom(h);
  check("D a rematch: a third game, Trivia, tied to game 2; the lineup is untouched (still complete)", room.games.length === 3 && room.games[2].gameId === "trivia" && room.party.lineup.complete === true && room.party.lineup.items.every((i) => i.status === "completed"), JSON.stringify(room.games.map((x) => [x.gameId, x.status])));
  check("D the earlier games keep their scores", JSON.stringify(room.games.slice(0, 2).map((x) => [x.id, JSON.stringify(x.rawScores)])) === JSON.stringify(before));
  await passBriefing([h, g]);
  await answerKitQuestions(h, { player: "Keku", choose: () => 0 });
  await answerKitQuestions(g, { player: "Amina", choose: (n) => n % 4 });
  await soon("D the rematch ends on its results with the panel", async () => h.getByTestId("whats-next").isVisible(), 60000);

  // ---- H. Layout ----
  await g.setViewportSize({ width: 320, height: 640 });
  await soon("H guest at 320 px: the results and panel without sideways scroll", async () => (await g.getByTestId("whats-next").isVisible()) && await noSideScroll(g));
  await h.setViewportSize({ width: 1440, height: 900 });
  await soon("H host at 1440 px: the panel without sideways scroll", async () => (await h.getByTestId("whats-next").isVisible()) && await noSideScroll(h));
  await h.setViewportSize({ width: 390, height: 844 });

  // ---- E. Take a break, from the results ----
  await h.getByTestId("next-break").click();
  await soon("E host: on a break, with Resume", async () => (await h.getByTestId("whats-next").getAttribute("data-state")) === "break" && await h.getByTestId("next-resume").isVisible());
  await soon("E guest: on a break, no Resume", async () => (await g.getByTestId("whats-next").getAttribute("data-state")) === "break" && (await g.getByTestId("next-resume").count()) === 0);
  await soon("E TV: on a break", async () => (await tv.getByTestId("tv-next").getAttribute("data-flow")) === "break");
  const gBreak = await api(g, "POST", "/rooms/:room/break", { on: false, attempt: { id: "guest-resume-0001", sessionRevision: (await myRoom(g)).session.revision } });
  check("E the server refuses the guest's Resume (403); still on a break", gBreak.status === 403 && (await myRoom(h)).session.onBreak === true, String(gBreak.status));
  // Both go to the lobby: the banner, and Start waits.
  await h.getByTestId("show-back-to-lobby").click().catch(() => h.getByRole("button", { name: "Back to lobby" }).last().click());
  await g.getByRole("button", { name: "Back to lobby" }).last().click();
  await soon("E host lobby: the break banner with Resume; Start waits", async () => (await h.getByTestId("break-banner").isVisible()) && (await h.getByTestId("break-resume").isVisible()) && /On a break/.test(await h.getByTestId("lobby-dock").innerText()));
  await soon("E guest lobby: on a break, the host resumes", async () => (await g.getByTestId("break-banner").isVisible()) && /On a break/.test(await g.getByTestId("dock-guest-note").innerText()));
  await h.reload({ waitUntil: "domcontentloaded" });
  await soon("E host reload: still on a break", async () => h.getByTestId("break-banner").isVisible());
  room = await myRoom(h);
  check("E nothing started during the break (three games)", room.games.length === 3 && room.session.onBreak === true);
  await h.getByTestId("break-resume").click();
  await soon("E Resume: the banner goes for both; Start is back", async () => (await h.getByTestId("break-banner").count()) === 0 && (await g.getByTestId("break-banner").count()) === 0 && !(/On a break/.test(await h.getByTestId("lobby-dock").innerText())));
  await soon("E TV: no longer on a break", async () => (await tv.getByTestId("tv-break").count()) === 0);
  await soon("E host lobby: Take a break is offered again", async () => h.getByTestId("break-take").isVisible());
  await soon("F guest lobby: no break or start controls", async () => (await g.getByTestId("break-take").count()) === 0 && (await g.getByTestId("break-resume").count()) === 0);
  room = await myRoom(h);
  check("lineup card: both games played", room.party.lineup.items.every((i) => i.status === "completed") && /played/.test(await h.getByTestId("party-row-0").innerText()) && /played/.test(await h.getByTestId("party-row-1").innerText()));

  // ---- I. An uncertain Apply (P7) ----
  const baseRevision = room.party.revision;
  await h.getByTestId("party-edit").click();
  await h.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  await h.getByTestId("party-time-15").click();
  await h.getByTestId("party-suggest").click();
  await h.getByTestId("party-preview").waitFor({ timeout: 5000 });
  const draft = await h.locator('[data-testid^="party-item-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-game")));
  let held = 0;
  await h.route((url) => new URL(url).pathname.endsWith("/party"), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    held++;
    await sleep(9500); // past the app's 8-second limit: it can't know whether this saved
    try { await route.fetch(); } catch { /* reaches the server all the same */ }
    try { await route.abort("connectionreset"); } catch { /* the page gave up already */ }
  });
  await h.getByTestId("party-apply").click();
  await soon("I no answer: 'couldn't confirm whether the lineup was saved' (never 'not saved')", async () => /Couldn’t confirm whether the lineup was saved/.test(await h.getByTestId("party-error").innerText()) && !/not saved|isn’t saved/i.test(await h.getByTestId("party-error").innerText()), 15000);
  await soon("I the request lands later: the planner recognises its own save and closes, saying so", async () => (await h.getByTestId("party-sheet").count()) === 0 && /The lineup was saved/.test(await h.getByTestId("lobby-dock").innerText()), 15000);
  await h.unrouteAll({ behavior: "ignoreErrors" });
  room = await myRoom(h);
  check("I the server holds exactly that draft, one revision on", held === 1 && room.party.revision === baseRevision + 1 && JSON.stringify(room.party.lineup.items.map((i) => i.gameId)) === JSON.stringify(draft) && room.party.lineup.budgetMinutes === 15, JSON.stringify({ held, rev: room.party.revision, items: room.party.lineup.items.map((i) => i.gameId), draft }));
  check("I the new lineup starts at its first game; the played games keep their scores", room.party.lineup.next === 0 && room.games.length === 3 && room.games.every((x) => x.status === "finished"));
} catch (e) {
  check("driver ran to the end", false, String(e?.message ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll session-flow checks passed");
process.exit(failures ? 1 : 0);
