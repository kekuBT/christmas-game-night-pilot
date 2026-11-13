// Stage 7.1: Quick Party in a casual room, end to end in the browser
// (docs/stage7/stage71.md).
//   A  entry: the host (and only the host) sees Quick Party; a Cup room has none
//   B  the planner by keyboard: group size starts at who is here and is labelled
//      as expected; 15/30/60; a suggested lineup within budget, every game fitting
//   C  editing: move, remove, replace (only fitting games), suggest again; none
//      of it reaches the server (no lineup, no game, no content)
//   D  Apply: the host's and a guest's lobbies show the same lineup as the
//      server; up next is its first game; Start says "game 1 of N"
//   E  a guest can't edit it (no controls; the server refuses with 403)
//   F  the host reloads: the lineup comes back from the server
//   G  roster: a next game that doesn't fit the people here can't be started
//      (the server refuses it too) and offers a replan for that count; fewer
//      here than planned asks first, and Start with N starts it
//   H  the first game goes through its briefing to play and results; the lineup
//      stays with game 1 played, and nothing else starts by itself (Stage 7.2:
//      Start now names the lineup's next game)
//   I  faults: Apply with no network can't confirm it saved (Stage 7.2, P7);
//      Apply whose reply is lost is recognised as saved; Start whose reply is
//      lost is asked again as the same press (Stage 7.2) and opens the game,
//      once; the TV view holds only public planning facts
//   J  layout at 320 px: the card and the planner fit without sideways scroll
//   K  two hosts (review 6775606005): a host's draft is bound to the lineup it
//      started from. The cohost saves a different lineup meanwhile; the host
//      sees that, and applying the old draft overwrites nothing: the conflict
//      is shown with the latest lineup, and only an explicit choice (edit the
//      latest, keep it, or replace it with the draft) changes anything. Clear
//      is bound the same way.
// Usage: node scripts/check-quick-party.mjs <baseUrl>   (the gate passes its server)
import { launchChromium } from "./lib/driver-env.mjs";
import { plainHttpContext } from "./lib/lan.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";
import { passBriefing } from "./lib/briefing.mjs";

import { hostFamilyCup } from "./lib/room-nav.mjs";
const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}

async function host(page, name, kind = "casual") {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  // Stage 12.1 (D-S121-01/02): no choice at the door; a Family Cup is the room menu's upgrade after hosting.
  if (kind === "cup") await hostFamilyCup(page);
  else await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300);
  }
  return code;
}
async function join(page, name, code, base = BASE) {
  await page.goto(`${base}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
const myRoom = (page) => page.evaluate(async () => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(`/rooms/${roomId}/projection?audience=player`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } });
  return r.json();
});
const tvView = (page) => page.evaluate(async () => (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection`)).json());
/** The planner's preview, in order. */
const preview = (page) => page.locator('[data-testid^="party-item-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-game")));
const lobbyLineup = (page) => page.locator('[data-testid="party-lineup"] .mz-party__name').allInnerTexts();
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const MANIFEST = { "math-mayhem": [1, 10], "pattern-pulse": [1, 10], "word-connections": [1, 10], trivia: [2, 10], "guess-the-year": [2, 10], "closest-wins": [2, 10], geography: [2, 10], "majority-rules": [3, 10], "draw-guess": [3, 10], impostor: [4, 10], "caption-clash": [4, 10], "who-said-that": [4, 10], "category-sprint": [4, 10], charades: [4, 10] };
const fits = (id, n) => MANIFEST[id] && n >= MANIFEST[id][0] && n <= MANIFEST[id][1];

/** In the open planner: make `gameId` the first game (move it up, or replace the first with it, making room if needed). */
async function putFirst(page, gameId) {
  for (let guard = 0; guard < 12; guard++) {
    const ids = await preview(page);
    const at = ids.indexOf(gameId);
    if (at === 0) return true;
    if (at > 0) { await page.getByTestId(`party-up-${at}`).click(); continue; }
    await page.getByTestId("party-replace-0").click();
    const opt = page.getByTestId(`party-option-${gameId}`);
    if (await opt.count() > 0) { await opt.click(); continue; }
    await page.getByTestId("party-replace-0").click(); // close the options: it doesn't fit the time left
    if (ids.length < 2) return false;
    await page.getByTestId(`party-remove-${ids.length - 1}`).click(); // make room
  }
  return false;
}
/** In the open planner, suggest until a lineup is shown. */
async function suggest(page) {
  await page.getByTestId("party-suggest").click();
  await page.getByTestId("party-preview").waitFor({ timeout: 5000 });
}

const browser = await launchChromium();
try {
  // ---- A. Entry ----
  const hctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const h = await hctx.newPage();
  const code = await host(h, "Keku");
  const g1ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const g1 = await g1ctx.newPage();
  await join(g1, "Amina", code);
  const lan = await plainHttpContext(browser, BASE, { viewport: { width: 320, height: 640 } });
  const g2 = await lan.ctx.newPage();
  await join(g2, "Baraka", code, lan.base);
  await soon("A host: a Quick Party entry in the casual lobby", async () => h.getByTestId("party-entry").isVisible());
  check("A guests: no Quick Party controls", (await g1.getByTestId("party-entry").count()) === 0 && (await g2.getByTestId("party-card").count()) === 0);
  let room = await myRoom(h);
  check("A server: a casual room with no lineup yet", room.roomKind === "casual" && room.party?.revision === 0 && room.party?.lineup === null, JSON.stringify(room.party));

  // ---- B. The planner, by keyboard ----
  await h.getByTestId("party-entry").focus();
  await h.keyboard.press("Enter");
  await h.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  await soon("B the group size starts at the 3 here", async () => (await h.getByTestId("party-size").innerText()).trim() === "3");
  check("B it is labelled as expected, not who's here", /Expected group size/.test(await h.getByTestId("party-sheet").innerText()) && /Who’s coming, not who’s here: 3 here now/.test(await h.getByTestId("party-sheet").innerText()));
  await h.getByTestId("party-size-inc").focus();
  await h.keyboard.press("Enter");
  check("B + by keyboard: 4", (await h.getByTestId("party-size").innerText()).trim() === "4");
  check("B 30 minutes is the default; 15, 30 and 60 are offered", (await h.getByTestId("party-time-30").getAttribute("aria-checked")) === "true" && (await h.getByTestId("party-time-15").count()) === 1 && (await h.getByTestId("party-time-60").count()) === 1);
  await h.getByTestId("party-suggest").focus();
  await h.keyboard.press("Enter");
  await h.getByTestId("party-preview").waitFor({ timeout: 5000 });
  let ids = await preview(h);
  const est = await h.getByTestId("party-estimate").innerText();
  const minutes = Number(/About (\d+) of your 30 minutes/.exec(est)?.[1] ?? NaN);
  check("B a suggested lineup: 1+ games, each fitting 4, no repeats", ids.length >= 1 && ids.every((id) => fits(id, 4)) && new Set(ids).size === ids.length, ids.join(", "));
  check("B its estimate is within 30 minutes, and says it's an estimate", minutes > 0 && minutes <= 30 && /Estimated: each game’s usual length plus 2 minutes/.test(est), est);

  // ---- C. Editing stays in the browser ----
  await h.getByTestId("party-time-60").click();
  check("C a new time clears the lineup (never silently kept)", (await h.getByTestId("party-preview").count()) === 0 && (await h.getByTestId("party-suggest").count()) === 1);
  await suggest(h);
  ids = await preview(h);
  check("C 60 minutes: a longer lineup", ids.length >= 3, ids.join(", "));
  if (ids.length >= 2) {
    await h.getByTestId("party-down-0").click();
    const moved = await preview(h);
    check("C move down: the first two swap", moved[0] === ids[1] && moved[1] === ids[0], moved.join(", "));
  }
  const before = await preview(h);
  // Remove the last game that isn't Impostor: a removed game is left out of the rest of this
  // draft (by design), and part G needs Impostor. Removing it here, when the random lineup
  // ended with it, made "arrange Impostor first" fail now and then.
  const drop = before.map((id, i) => (id === "impostor" ? -1 : i)).filter((i) => i >= 0).pop() ?? before.length - 1;
  await h.getByTestId(`party-remove-${drop}`).click();
  check("C remove: one fewer, the rest in order", JSON.stringify(await preview(h)) === JSON.stringify(before.filter((_, i) => i !== drop)));
  await h.getByTestId("party-replace-0").click();
  const offered = await h.locator('[data-testid^="party-option-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("party-option-", "")));
  const now = await preview(h);
  check("C replace offers only games that fit 4 and aren't in the lineup", offered.length > 0 && offered.every((id) => fits(id, 4) && !now.includes(id)), offered.join(", "));
  await h.getByTestId(`party-option-${offered[0]}`).click();
  check("C replace: the first game is the chosen one", (await preview(h))[0] === offered[0]);
  await h.getByTestId("party-regenerate").click();
  check("C suggest again: still a valid lineup", (await preview(h)).every((id) => fits(id, 4)));
  room = await myRoom(h);
  check("C server: still no lineup, no game, nothing used", room.party?.lineup === null && (room.games ?? []).length === 0, JSON.stringify(room.party));

  // Arrange Impostor (4+) first, to meet a roster that doesn't fit it later.
  await h.getByTestId("party-time-30").click();
  await suggest(h);
  check("C arrange: Impostor first", await putFirst(h, "impostor"), (await preview(h)).join(", "));
  const applied = await preview(h);

  // ---- I (part). Apply with no network: not saved, and says so ----
  await h.route((url) => new URL(url).pathname.endsWith("/party"), (route) => route.abort("internetdisconnected"));
  await h.getByTestId("party-apply").click();
  await soon("I Apply with no network: 'couldn't confirm whether it saved' (P7), the planner stays open", async () => /Couldn’t confirm whether the lineup was saved/.test(await h.getByTestId("party-error").innerText()) && await h.getByTestId("party-sheet").isVisible());
  await h.unrouteAll({ behavior: "ignoreErrors" });
  check("I server: nothing was saved", (await myRoom(h)).party?.lineup === null);

  // ---- D. Apply (its reply lost: recognised as saved) ----
  await h.route((url) => new URL(url).pathname.endsWith("/party"), async (route) => { await route.fetch(); await route.abort("connectionreset"); });
  await h.getByTestId("party-apply").click();
  await soon("I Apply whose reply was lost: recognised as saved, the planner closes", async () => (await h.getByTestId("party-sheet").count()) === 0, 15000);
  await h.unrouteAll({ behavior: "ignoreErrors" });
  room = await myRoom(h);
  check("D server: the lineup, in the planner's order, revision 1", room.party?.revision === 1 && JSON.stringify(room.party.lineup.items.map((i) => i.gameId)) === JSON.stringify(applied) && room.party.lineup.expectedPlayers === 4 && room.party.lineup.budgetMinutes === 30, JSON.stringify(room.party));
  const titles = await soon("D host: the lineup card", async () => { const t = await lobbyLineup(h); return t.length === applied.length ? t : null; });
  await soon("D guests see the same lineup", async () => JSON.stringify(await lobbyLineup(g1)) === JSON.stringify(titles) && JSON.stringify(await lobbyLineup(g2)) === JSON.stringify(titles));
  check("D the card says planned for 4, an estimate, and who is here", /Planned for 4 players · about \d+ of your 30 minutes \(estimated\) · 3 here now/.test(await h.getByTestId("party-meta").innerText()), await h.getByTestId("party-meta").innerText());
  await soon("D up next is the lineup's first game (Impostor needs 4: Start waits for players)", async () => (await h.getByTestId("up-next-card").innerText()).includes("Impostor") && /^Waiting for players \(3\/4\)$/.test((await h.getByTestId("party-start").innerText()).trim()) && await h.getByTestId("party-start").isDisabled());
  check("D the lineup shows Impostor needs one more", /Needs 1 more player · 3 here/.test(await h.getByTestId("party-row-0-short").innerText()));

  // ---- E. A guest can't edit ----
  check("E guest: no Edit or Clear", (await g1.getByTestId("party-edit").count()) === 0 && (await g1.getByTestId("party-clear").count()) === 0);
  const forged = await g1.evaluate(async () => {
    const roomId = sessionStorage.getItem("cgn_roomId");
    const r = await fetch(`/rooms/${roomId}/party`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, body: JSON.stringify({ baseRevision: 1, clear: true }) });
    return { status: r.status, body: await r.json() };
  });
  check("E guest: the server refuses an edit (403)", forged.status === 403 && forged.body.code === "NOT_HOST", JSON.stringify(forged));

  // ---- F. Reload ----
  await h.reload({ waitUntil: "domcontentloaded" });
  await soon("F host reload: the lineup comes back from the server", async () => JSON.stringify(await lobbyLineup(h)) === JSON.stringify(titles));
  await soon("F and Start is still the lineup's", async () => (await h.getByTestId("party-start").count()) === 1);

  // ---- G. Roster: a game that doesn't fit, then fewer than planned ----
  check("G Impostor doesn't fit the 3 here: the card says so and offers a replan for 3", /Impostor needs at least 4; 3 are here/.test(await h.getByTestId("party-misfit").innerText()) && /replan for 3/.test(await h.getByTestId("party-replan-card").innerText()));
  const misfit = await h.evaluate(async () => {
    const roomId = sessionStorage.getItem("cgn_roomId");
    const headers = { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" };
    const view = await (await fetch(`/rooms/${roomId}/projection?audience=player`, { headers })).json();
    const r = await fetch(`/rooms/${roomId}/games`, { method: "POST", headers, body: JSON.stringify({ gameId: "impostor", official: false, party: { revision: 1, index: 0 }, roster: view.readiness.wouldPlay, fewerThanPlanned: true, attempt: { id: "misfit-press-0001", sessionRevision: view.session.revision } }) });
    return { status: r.status, body: await r.json() };
  });
  check("G the server refuses it too (409 PARTY_DOESNT_FIT, needs 4, 3 here), nothing started", misfit.status === 409 && misfit.body.code === "PARTY_DOESNT_FIT" && misfit.body.minPlayers === 4 && misfit.body.here === 3 && ((await myRoom(h)).games ?? []).length === 0, JSON.stringify(misfit.body).slice(0, 160));
  await h.getByTestId("party-replan-card").click();
  await h.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  check("G replan: the planner opens for the 3 here", (await h.getByTestId("party-size").innerText()).trim() === "3");
  // Expect one more (4), Math first: a game that works with the 3 here.
  await h.getByTestId("party-size-inc").click();
  await suggest(h);
  check("G arrange: Math Mayhem first", await putFirst(h, "math-mayhem"), (await preview(h)).join(", "));
  await h.getByTestId("party-apply").click();
  await h.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
  room = await myRoom(h);
  check("G server: the replanned lineup, revision 2", room.party?.revision === 2 && room.party.lineup.items[0].gameId === "math-mayhem");

  // ---- H + I. Start (its reply lost), the first game to results ----
  await soon("G Start says Math Mayhem, game 1", async () => /^Start Math Mayhem · game 1 of/.test((await h.getByTestId("party-start").innerText()).trim()));
  await h.getByTestId("party-start").click();
  await soon("G fewer than planned again (4 planned): asks", async () => h.getByTestId("party-ask-fewer").isVisible());
  // Stage 7.2: the first reply is lost; the app asks again as the same press, which the server answers.
  let lost = 0;
  const startBodies = [];
  await h.route((url) => new URL(url).pathname.endsWith("/games"), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    startBodies.push(JSON.parse(route.request().postData() ?? "{}"));
    if (lost > 0) return route.continue();
    lost++;
    await route.fetch();
    await route.abort("connectionreset");
  });
  await h.getByTestId("party-start-anyway").click();
  await soon("I Start whose reply was lost: the game opens anyway (briefing)", async () => (await myRoom(h)).games?.some((x) => x.status === "briefing" || x.status === "playing"), 20000);
  // The room (read straight from the server) can show the new game before the lost reply has even
  // reached the page and the app has asked again (full gate 20261111-224616 saw that race). Keep the
  // route until the app's retry is recorded; if the app never asks again, the check below fails.
  for (let i = 0; i < 50 && startBodies.length < 2; i++) await sleep(200);
  await h.unrouteAll({ behavior: "ignoreErrors" });
  room = await myRoom(h);
  check("I the retry was the same press (same request id)", startBodies.length === 2 && !!startBodies[0].attempt?.id && startBodies[0].attempt.id === startBodies[1].attempt?.id, JSON.stringify(startBodies.map((b) => b.attempt)));
  check("I exactly one game started, Math Mayhem, practice, with the 3 here", lost === 1 && room.games.length === 1 && room.games[0].gameId === "math-mayhem" && room.games[0].official !== true && room.games[0].players.length === 3, JSON.stringify({ lost, games: room.games.map((x) => [x.gameId, x.status, x.players?.length]) }));
  check("H the lineup marks game 1 as started", room.party.lineup.items[0].started === true && room.party.lineup.items.slice(1).every((i) => !i.started));
  // A second start of the same item (a second tab, a retry) returns the same game.
  const replay = await h.evaluate(async (rev) => {
    const roomId = sessionStorage.getItem("cgn_roomId");
    const headers = { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" };
    const roster = (await (await fetch(`/rooms/${roomId}/projection?audience=player`, { headers })).json()).readiness.wouldPlay;
    const sessionRevision = (await (await fetch(`/rooms/${roomId}/projection?audience=player`, { headers })).json()).session.revision;
    const r = await fetch(`/rooms/${roomId}/games`, { method: "POST", headers, body: JSON.stringify({ gameId: "math-mayhem", official: false, party: { revision: rev, index: 0 }, roster, fewerThanPlanned: true, attempt: { id: "second-tab-0001", sessionRevision } }) });
    return { status: r.status, body: await r.json() };
  }, room.party.revision);
  check("I the same start again answers with the same game (200, replay)", replay.status === 200 && replay.body.replay === true && replay.body.gameId === room.games[0].id, JSON.stringify(replay));
  await passBriefing([h, g1, g2]);
  for (const [i, p] of [h, g1, g2].entries()) await answerKitQuestions(p, { player: `player ${i + 1}`, choose: (n) => n % 4 });
  for (const p of [h, g1, g2]) await p.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  check("H all three reach the results", true);
  for (const p of [h, g1, g2]) await p.getByRole("button", { name: "Back to lobby" }).click();
  await soon("H back in the lobby, the lineup is kept with game 1 played", async () => /played/.test(await h.getByTestId("party-row-0").innerText()));
  room = await myRoom(h);
  check("H server: one finished practice game; nothing started after it; no Cup standings", room.games.length === 1 && room.games[0].status === "finished" && JSON.stringify(room.officialStandings ?? {}) === "{}" && room.party.lineup.items.length >= 1, JSON.stringify(room.games.map((x) => [x.gameId, x.status])));
  // Stage 7.2: nothing starts by itself; the lineup moves on only when the host starts its next game.
  check("H no automatic next game: one game; up next is the lineup's game 2, marked next (or the lineup is complete)", room.games.length === 1 && (room.party.lineup.items.length > 1 ? room.party.lineup.next === 1 && (await h.getByTestId("party-start").count()) === 1 && /next up/.test(await h.getByTestId("party-row-1").innerText()) : (await h.getByTestId("party-complete").count()) === 1), room.party.lineup.items.length > 1 ? await h.getByTestId("party-row-1").innerText().catch(() => "") : "complete");

  // ---- I. The TV view: public planning facts only ----
  const tv = await tvView(h);
  check("I TV view: the same lineup, with no tokens, seeds or answers", JSON.stringify(tv.party) === JSON.stringify(room.party) && !/token|seed|hostClaim|correct/i.test(JSON.stringify(tv.party)), JSON.stringify(tv.party).slice(0, 160));

  // ---- J. 320 px ----
  await soon("J guest at 320 px: the lineup card fits, no sideways scroll", async () => (await g2.getByTestId("party-lineup").isVisible()) && await noSideScroll(g2));
  await h.setViewportSize({ width: 320, height: 640 });
  await h.getByTestId("party-edit").click();
  await h.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  check("J host at 320 px: the planner opens with the saved lineup, no sideways scroll", (await preview(h)).length === room.party.lineup.items.length && await noSideScroll(h));
  await h.getByRole("button", { name: /close/i }).first().click().catch(async () => { await h.keyboard.press("Escape"); });
  await h.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});

  // Clear: asks first, then the room has no lineup.
  await h.getByTestId("party-clear").click();
  await h.getByTestId("party-clear-yes").click();
  await soon("I Clear (after asking): the lineup is gone for everyone", async () => (await g1.getByTestId("party-lineup").count()) === 0 && (await myRoom(h)).party?.lineup === null);

  // ---- K. Two hosts: a stale draft never overwrites a newer lineup (review 6775606005) ----
  const kh = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const kcode = await host(kh, "Hana");
  const kc = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await join(kc, "Cleo", kcode);
  const cohostId = await kc.evaluate(() => sessionStorage.getItem("cgn_playerId"));
  const granted = await kh.evaluate(async (targetId) => {
    const roomId = sessionStorage.getItem("cgn_roomId");
    const r = await fetch(`/rooms/${roomId}/cohost`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, body: JSON.stringify({ targetId }) });
    return r.status;
  }, cohostId);
  check("K the second player is made a cohost", granted === 200, String(granted));
  await soon("K the cohost gets the Quick Party entry", async () => kc.getByTestId("party-entry").isVisible());
  // 1. The host opens a 15-minute draft.
  await kh.getByTestId("party-entry").click();
  await kh.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  await kh.getByTestId("party-time-15").click();
  await suggest(kh);
  const hostDraft = await preview(kh);
  // 2. The cohost saves a different 30-minute lineup.
  await kc.getByTestId("party-entry").click();
  await kc.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  await suggest(kc);
  const cohostLineup = await preview(kc);
  await kc.getByTestId("party-apply").click();
  await kc.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
  let kroom = await myRoom(kh);
  check("K the cohost's 30-minute lineup is saved (revision 1)", kroom.party?.revision === 1 && kroom.party.lineup.budgetMinutes === 30 && JSON.stringify(kroom.party.lineup.items.map((i) => i.gameId)) === JSON.stringify(cohostLineup), JSON.stringify(kroom.party));
  // The host's open draft sees the background change.
  await soon("K the host's draft says the saved lineup changed while planning", async () => kh.getByTestId("party-stale-note").isVisible());
  // 3. The host applies the older draft: nothing is overwritten, the conflict is shown.
  await kh.getByTestId("party-apply").click();
  await soon("K applying the stale draft shows the conflict with the latest lineup", async () => (await kh.getByTestId("party-conflict").isVisible()) && /30 minutes/.test(await kh.getByTestId("party-conflict").innerText()));
  kroom = await myRoom(kh);
  check("K the newer lineup is unchanged on the server (revision 1, the cohost's games)", kroom.party?.revision === 1 && kroom.party.lineup.budgetMinutes === 30 && JSON.stringify(kroom.party.lineup.items.map((i) => i.gameId)) === JSON.stringify(cohostLineup), JSON.stringify(kroom.party));
  check("K the host's draft is still there to decide about", JSON.stringify(await preview(kh)) === JSON.stringify(hostDraft));
  // Recovery 1: edit the latest: the draft becomes the cohost's lineup, bound to revision 1.
  await kh.getByTestId("party-conflict-edit-latest").click();
  check("K 'Edit the latest' loads the cohost's lineup into the planner", JSON.stringify(await preview(kh)) === JSON.stringify(cohostLineup) && (await kh.getByTestId("party-time-30").getAttribute("aria-checked")) === "true" && (await kh.getByTestId("party-conflict").count()) === 0);
  // The cohost changes it again, so the host's new draft is stale too.
  await kc.getByTestId("party-edit").click();
  await kc.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  await kc.getByTestId("party-remove-0").click();
  const cohostSecond = await preview(kc);
  await kc.getByTestId("party-apply").click();
  await kc.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
  await soon("K the host sees the second background change", async () => kh.getByTestId("party-stale-note").isVisible());
  await kh.getByTestId("party-apply").click();
  await kh.getByTestId("party-conflict").waitFor({ timeout: 10000 });
  kroom = await myRoom(kh);
  check("K again nothing is overwritten (revision 2, the cohost's edit)", kroom.party?.revision === 2 && JSON.stringify(kroom.party.lineup.items.map((i) => i.gameId)) === JSON.stringify(cohostSecond), JSON.stringify(kroom.party));
  // Recovery 2: deliberately replace it with the draft, after seeing the conflict.
  const mine = await preview(kh);
  await kh.getByTestId("party-conflict-replace").click();
  await kh.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
  kroom = await myRoom(kh);
  check("K 'Replace it with mine' (an explicit choice) saves the draft as revision 3", kroom.party?.revision === 3 && JSON.stringify(kroom.party.lineup.items.map((i) => i.gameId)) === JSON.stringify(mine), JSON.stringify(kroom.party));
  // Recovery 3: keep the latest discards a stale draft.
  await kh.getByTestId("party-edit").click();
  await kh.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  await kh.getByTestId("party-remove-0").click();
  await kc.getByTestId("party-edit").click();
  await kc.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  await kc.getByTestId("party-time-60").click();
  await suggest(kc);
  const cohostThird = await preview(kc);
  await kc.getByTestId("party-apply").click();
  await kc.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
  await kh.getByTestId("party-apply").click();
  await kh.getByTestId("party-conflict").waitFor({ timeout: 10000 });
  await kh.getByTestId("party-conflict-keep").click();
  await kh.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
  kroom = await myRoom(kh);
  check("K 'Keep the latest' discards the stale draft: the cohost's 60-minute lineup stays (revision 4)", kroom.party?.revision === 4 && kroom.party.lineup.budgetMinutes === 60 && JSON.stringify(kroom.party.lineup.items.map((i) => i.gameId)) === JSON.stringify(cohostThird), JSON.stringify(kroom.party));
  // Clear is bound to the lineup it was asked about.
  await soon("K host lobby shows the cohost's lineup", async () => (await lobbyLineup(kh)).length === cohostThird.length);
  await kh.getByTestId("party-clear").click();
  await kc.getByTestId("party-edit").click();
  await kc.getByTestId("party-sheet").waitFor({ timeout: 5000 });
  await kc.getByTestId("party-remove-0").click();
  await kc.getByTestId("party-apply").click();
  await kc.getByTestId("party-sheet").waitFor({ state: "detached", timeout: 10000 });
  await soon("K the host's open 'Clear?' notices the lineup changed and asks again", async () => (await kh.getByTestId("party-clear-changed").isVisible()) && (await kh.getByTestId("party-clear-yes").count()) === 0);
  kroom = await myRoom(kh);
  check("K nothing was cleared (revision 5, the cohost's edit)", kroom.party?.revision === 5 && kroom.party.lineup !== null, JSON.stringify(kroom.party));
  // A clear sent for an older revision (an old tab, a slow click) is refused by the server too.
  const staleClear = await kh.evaluate(async () => {
    const roomId = sessionStorage.getItem("cgn_roomId");
    const r = await fetch(`/rooms/${roomId}/party`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, body: JSON.stringify({ baseRevision: 4, clear: true }) });
    return { status: r.status, body: await r.json() };
  });
  check("K a clear for an older revision is refused (409), and the lineup stays", staleClear.status === 409 && staleClear.body.code === "PLAN_CONFLICT" && (await myRoom(kh)).party?.lineup !== null, JSON.stringify(staleClear.body).slice(0, 120));
  await kh.context().close(); await kc.context().close();

  // ---- A (Cup). A Family Cup has no Quick Party ----
  const cctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const c = await cctx.newPage();
  await host(c, "Cup host", "cup");
  await c.getByTestId("lobby-dock").waitFor({ timeout: 10000 });
  check("A a Family Cup lobby has no Quick Party", (await c.getByTestId("party-card").count()) === 0 && (await myRoom(c)).party === undefined);
  await cctx.close();
} finally {
  await browser.close();
}
console.log(failures === 0 ? "QUICK PARTY ALL PASSED" : `QUICK PARTY FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
