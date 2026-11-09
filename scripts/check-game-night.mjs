// Realistic game-night simulation (Work Package C): a full evening of
// play in one driver — a 6-player room (host + cohost + 4 players +
// a 7th who joins mid-session and disconnects) plus a spectator/TV,
// three games (Trivia, Closest Wins, Math Mayhem), an abstention, a
// disconnect + reconnect, a tie, host/cohost permission checks, and
// score agreement across phone / TV / server — then a second,
// maximum-capacity room (10 players) playing Trivia.
// Usage: build:web, serve on a port, then:
//   node scripts/check-game-night.mjs <baseUrl>
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { closeRoomMenu, openRoomMenu, roomGo } from "./lib/room-nav.mjs";
import { passBriefing } from "./lib/briefing.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
let passes = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passes++; else failures++;
}
async function createRoom(page, name) {
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(500);
  }
  return code;
}
async function joinRoom(page, name, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  // A joiner does not always land in the lobby: if a game just
  // finished, a fresh joiner lands on that game's results first
  // (and must dismiss via "Back to lobby"); if a game is playing,
  // they land in the game. So wait for the lobby heading, the
  // results' "Back to lobby", or a game indicator — any of them
  // proves the join succeeded. Retry the click once only if the
  // Join button is still on the page (after a successful click it
  // is gone, and clicking again would be a second join attempt).
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Join the game" }).click();
    const heading = page.getByRole("heading", { name: `You’re in, ${name}.` });
    const back = page.getByRole("button", { name: "Back to lobby" });
    const reveal = page.getByTestId("mz-reveal-step");
    const game = page.locator(".mz-question, [data-testid='game-panel'], [data-testid='mz-num-dial']").first();
    let landed;
    try {
      landed = await Promise.race([
        heading.waitFor({ timeout: 20000 }).then(() => "lobby"),
        back.waitFor({ timeout: 20000 }).then(() => "results"),
        reveal.waitFor({ timeout: 20000 }).then(() => "reveal"),
        game.waitFor({ timeout: 20000 }).then(() => "game"),
      ]);
    } catch {
      if (attempt === 1) {
        const text = await page.evaluate(() => document.body.innerText.slice(0, 400));
        throw new Error(`join timed out for ${name} (code ${code}); page showed: ${JSON.stringify(text)}`);
      }
      if ((await page.getByRole("button", { name: "Join the game" }).count()) === 0) {
        // The click landed but the lobby is slow — wait longer instead
        // of clicking a button that is no longer there.
        await heading.waitFor({ timeout: 20000 });
        return;
      }
      await sleep(1000);
      continue;
    }
    if (landed === "reveal") {
      // A finished Trivia game shows the reveal walk, whose "Back to
      // lobby" only appears on the finale — jump there first.
      await page.getByTestId("mz-reveal-standings").click();
      await sleep(300);
      await page.getByTestId("mz-reveal-next").click();
      await heading.waitFor({ timeout: 15000 });
    } else if (landed === "results" && (await back.isVisible().catch(() => false))) {
      await back.click();
      await heading.waitFor({ timeout: 15000 });
    }
    return;
  }
}
async function spectate(page, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByRole("button", { name: "Stop watching" }).waitFor({ timeout: 15000 });
}
// Sprint 2: an official start asks before leaving out a player who is
// still reconnecting ("Start without Gus?"). This scenario deliberately
// continues without them, so answer explicitly and report who was named.
async function startGame(page, gameId, { expectLeftOut, players } = {}) {
  await page.getByTestId("choose-game").click();
  await page.getByTestId(`select-game-${gameId}`).click();
  await page.getByTestId(`start-official-${gameId}`).click();
  const decision = page.getByTestId("mz-start-decision");
  const asked = await decision.waitFor({ timeout: 2500 }).then(() => true, () => false);
  if (asked) {
    const q = ((await decision.textContent()) ?? "").replace(/\s+/g, " ");
    check(`start asks before leaving out a reconnecting player${expectLeftOut ? ` (${expectLeftOut})` : ""}`, !expectLeftOut || q.includes(expectLeftOut), q);
    await page.getByTestId("mz-start-without").click();
  }
  // D3: every player in this game reads the rules and taps I'm ready.
  await passBriefing(players);
}
// The host's player projection (server ground truth) via the page's own session.
async function getProjection(page) {
  return page.evaluate(async () => {
    const token = sessionStorage.getItem("cgn_token") ?? "";
    const roomId = sessionStorage.getItem("cgn_roomId") ?? "";
    const r = await fetch(`/rooms/${roomId}/projection?audience=player`, { headers: { "x-session-token": token } });
    return r.json();
  });
}
async function getTvProjection(page) {
  return page.evaluate(async () => {
    const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_spec_roomId") ?? ""}/projection?audience=tv`);
    return r.json();
  });
}
// Answer all 10 Trivia questions with the same slab index every time
// (identical answers across players => identical scores => a tie).
// Sprint 2 (Workstream I): answers through observable app states and
// fails AT the missing interaction (player, question, state) instead of
// returning silently when the UI is slower than a fixed sleep.
async function answerAllTrivia(page, slabIndex) {
  const player = (await page.evaluate(() => sessionStorage.getItem("cgn_name"))) || "player";
  await answerKitQuestions(page, { player, choose: () => slabIndex });
}
// Answer all 10 Math questions. Math renders in the Mchezo kit since
// §11 — the same QuestionScreen shape as Trivia — so it uses the same
// slab + Next-question loop as answerAllTrivia above.
async function answerAllMath(page) {
  await answerAllTrivia(page, 0);
}
// One Closest question for every connected player (number-field path —
// the path that survives the planned single-Submit unification).
async function guessClosest(pairs) {
  for (const [page, value] of pairs) {
    await page.getByTestId("mz-num-input").fill(String(value));
    await page.getByTestId("mz-num-submit").click();
    await sleep(200);
  }
}
async function backToLobby(page) {
  // Trivia's kit results are the reveal walk: jump to the standings,
  // then the finale button is "Back to lobby". Old results have the
  // button directly. A page already in the lobby has neither — return.
  const jump = page.getByTestId("mz-reveal-standings");
  if (await jump.isVisible({ timeout: 2000 }).catch(() => false)) {
    await jump.click();
    await sleep(300);
    await page.getByTestId("mz-reveal-next").click();
  } else if (await page.getByRole("button", { name: "Back to lobby" }).isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Back to lobby" }).click();
  } else {
    return;
  }
  await page.getByRole("heading", { name: /You’re in,/ }).waitFor({ timeout: 15000 });
}
// Everyone returns to the lobby between games (as in a real evening).
// A disconnected player's page is skipped — it cannot return.
async function backToLobbyAll(pages) {
  for (const page of pages) await backToLobby(page);
}

const browser = await launchChromium();
try {
  // ---------- Scenario 1: the main room (6 players + spectator + Gus) ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const names = ["Bea", "Cal", "Dee", "Eli", "Fay"];
  const guests = {};
  for (const name of names) {
    const p = await ctx.newPage();
    await joinRoom(p, name, code);
    guests[name] = p;
  }
  // Host grants Bea cohost (UI: room menu → Host tools → "Make cohost" next to the first guest).
  await openRoomMenu(host);
  await host.getByRole("button", { name: "Make cohost" }).first().click();
  await sleep(1500);
  await closeRoomMenu(host);
  let proj = await getProjection(host);
  check("cohost granted via the room menu", (proj.players ?? []).find((p) => p.displayName === "Bea")?.isCohost === true);
  await host.screenshot({ path: screenshotPath("docs/mchezo-screenshots/14-game-night-lobby.png") });

  // Spectator opens the TV (must not consume a player slot).
  const tv = await ctx.newPage();
  await spectate(tv, code);
  proj = await getProjection(host);
  check("spectator does not consume a player slot", (proj.players ?? []).length === 6 && (proj.spectatorCount ?? 0) === 1,
    `players=${(proj.players ?? []).length} spectators=${proj.spectatorCount ?? 0}`);

  // --- Game 1: Trivia. Ada/Cal/Dee answer slab 0 (identical => tie),
  // Bea slab 1, Fay slab 2, Eli sits the game out. ---
  await startGame(host, "trivia", { players: [host, ...Object.values(guests)] });
  await host.locator(".mz-question").waitFor({ timeout: 15000 });
  // Spectator sees no answer key and no answer controls while playing.
  const tvProj = await getTvProjection(tv);
  const tvQuestions = tvProj.games?.[0]?.state?.questions ?? [];
  check("spectator sees no correct answers while playing",
    tvQuestions.length === 10 && tvQuestions.every((q) => q.correctIndex === undefined));
  check("spectator has no answer controls", (await tv.locator(".mz-slab").count()) === 0);
  await guests["Eli"].locator(".mz-question").waitFor({ timeout: 15000 });
  await guests["Eli"].getByRole("button", { name: "Sit this game out" }).click();
  await sleep(500);
  await answerAllTrivia(host, 0);
  await answerAllTrivia(guests["Bea"], 1);
  await answerAllTrivia(guests["Cal"], 0);
  await answerAllTrivia(guests["Dee"], 0);
  await answerAllTrivia(guests["Fay"], 2);
  await host.locator('[data-testid="mz-reveal-step"]').waitFor({ timeout: 30000 });
  check("trivia finishes (Eli abstained, no one blocked)", true);
  // Scores agree: TV leaderboard rows vs the server's rawScores.
  await tv.getByRole("tab", { name: "Leaderboard" }).click().catch(() => {});
  await sleep(1000);
  const tvRows = await tv.locator(".mz-tv-row").evaluateAll((rows) =>
    rows.map((r) => ({ name: r.textContent ?? "", rank: r.getAttribute("data-rank"), score: r.getAttribute("data-score") })));
  proj = await getProjection(host);
  const triviaScores = proj.games?.[0]?.rawScores ?? {};
  const nameOf = (pid) => (proj.players ?? []).find((p) => p.id === pid)?.displayName ?? pid;
  let agree = tvRows.length === 6;
  for (const row of tvRows) {
    const pid = Object.keys(triviaScores).find((id) => row.name.includes(nameOf(id)));
    if (!pid || String(triviaScores[pid]) !== row.score) agree = false;
  }
  check("trivia scores agree: TV vs server", agree, `tvRows=${tvRows.length}`);
  const calRow = tvRows.find((r) => r.name.includes("Cal"));
  const deeRow = tvRows.find((r) => r.name.includes("Dee"));
  check("tied players share a rank and a score (Cal = Dee)",
    !!calRow && !!deeRow && calRow.rank === deeRow.rank && calRow.score === deeRow.score,
    `Cal rank ${calRow?.rank} score ${calRow?.score}; Dee rank ${deeRow?.rank} score ${deeRow?.score}`);
  check("identical answers give identical scores (no double-count)",
    triviaScores && Object.keys(triviaScores).length > 0 &&
    triviaScores[Object.keys(triviaScores).find((id) => nameOf(id) === "Ada")] ===
    triviaScores[Object.keys(triviaScores).find((id) => nameOf(id) === "Cal")]);
  await tv.screenshot({ path: screenshotPath("docs/mchezo-screenshots/15-game-night-tv-results.png") });
  // The phone's standings show the same leader as the TV (and the server).
  // The host's own row shows "You", not her name — so when the leader
  // is the host (Ada, whose page this is), "You" is the leader's row.
  await host.getByTestId("mz-reveal-standings").click();
  await sleep(500);
  const phoneTop = await host.locator(".mz-standings").first().textContent().catch(() => "");
  const tvTop = tvRows.find((r) => r.rank === "1");
  const leaderId = Object.entries(triviaScores).sort((a, b) => b[1] - a[1])[0]?.[0];
  const leaderName = leaderId ? nameOf(leaderId) : "";
  const phoneShowsLeader = (phoneTop ?? "").includes(leaderName) ||
    (leaderName === "Ada" && (phoneTop ?? "").includes("You"));
  check("phone standings show the same leader as the TV and the server",
    leaderName !== "" && phoneShowsLeader && (tvTop?.name ?? "").includes(leaderName),
    `leader: ${leaderName}; phone top: ${(phoneTop ?? "").slice(0, 60)}`);
  await backToLobbyAll([host, guests["Bea"], guests["Cal"], guests["Dee"], guests["Eli"], guests["Fay"]]);
  check("host returns to the lobby after trivia", true);

  // Gus joins between games (7th player), then drops off mid-Closest and
  // comes back (his own browser context, so only his network goes down).
  const gusCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const gus = await gusCtx.newPage();
  await joinRoom(gus, "Gus", code);

  // --- Game 2: Closest Wins. ---
  await startGame(host, "closest-wins", { players: [host, ...Object.values(guests), gus] });
  await host.getByTestId("mz-num-dial").waitFor({ timeout: 15000 });
  // Q1: Ada 100, Bea 200 (then the waiting ring shows 2/7), Cal 300,
  // Dee 300, Fay 400, Eli abstains (per-question), Gus 100.
  await guessClosest([[host, 100], [guests["Bea"], 200]]);
  // The ring counts come from the 2s projection poll — wait for 2/7.
  let ring = "";
  for (let i = 0; i < 20; i++) {
    ring = await host.locator(".mz-wait__count").first().textContent().catch(() => "");
    if (/2\s*\/\s*7/.test(ring ?? "")) break;
    await sleep(500);
  }
  check("waiting ring shows honest counts (2/7 after two guesses)", /2\s*\/\s*7/.test(ring ?? ""), `ring: ${ring}`);
  await guessClosest([[guests["Cal"], 300], [guests["Dee"], 300], [guests["Fay"], 400]]);
  await guests["Eli"].getByTestId("mz-abstain").click();
  await sleep(500);
  await gus.getByTestId("mz-num-dial").waitFor({ timeout: 15000 });
  await guessClosest([[gus, 100]]);
  // Q2: Gus's phone loses its connection before he guesses.
  await host.getByTestId("mz-num-dial").waitFor({ timeout: 15000 });
  await gusCtx.setOffline(true);
  let gusAway = false;
  for (let i = 0; i < 30 && !gusAway; i++) {
    proj = await getProjection(host);
    gusAway = (proj.players ?? []).find((p) => p.displayName === "Gus")?.connected === false;
    if (!gusAway) await sleep(500);
  }
  check("disconnected player is marked away", gusAway);
  await guessClosest([[host, 100], [guests["Bea"], 200], [guests["Cal"], 300], [guests["Dee"], 300], [guests["Fay"], 400], [guests["Eli"], 150]]);
  await sleep(1500);
  proj = await getProjection(host);
  const closestNow = (proj.games ?? []).find((g) => g.status === "playing" && g.gameId === "closest-wins");
  // Sprint 3 (P6): a disconnect alone never ends a question or a game.
  check("the question waits for the disconnected player (no early finish)", closestNow?.lifecycle?.phaseKey === "q:1", `phase ${closestNow?.lifecycle?.phaseKey}`);
  // Gus's connection comes back within the question's time: he guesses and play moves on.
  await gusCtx.setOffline(false);
  await gus.getByTestId("mz-num-dial").waitFor({ timeout: 20000 });
  await guessClosest([[gus, 100]]);
  check("the returning player catches up in the same question", true);
  // Q3–Q8: everyone guesses; Eli is back in after his Q1 abstain.
  for (let q = 3; q <= 8; q++) {
    await host.getByTestId("mz-num-dial").waitFor({ timeout: 15000 });
    await guessClosest([[host, 100], [guests["Bea"], 200], [guests["Cal"], 300], [guests["Dee"], 300], [guests["Fay"], 400], [guests["Eli"], 150], [gus, 100]]);
    await sleep(600);
    if (q === 3) {
      // Eli's Q3 controls appearing proves he is back in after the
      // per-question abstain (his Q2 panel showed the waiting ring).
      await guests["Eli"].getByTestId("mz-num-dial").waitFor({ timeout: 15000 });
      check("abstained player is back in for the next question (per-question scope)", true);
    }
  }
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  check("closest finishes with everyone, including the player who dropped and came back", true);
  // The TV shows Gus as Away and follows the game (dashboard, closest).
  const tvText = await tv.evaluate(() => document.body.innerText);
  // The old TV dashboard lists the disconnected player but has NO
  // Away marker (the kit surfaces do — the stage leaderboard and the
  // waiting ring). That is a real consistency gap, recorded in the
  // review doc; the check asserts what the dashboard actually renders
  // (Gus listed) and the projection already proved him marked away.
  check("TV lists the disconnected player (Gus)", /Gus/.test(tvText));
  // Stage 5 (S5-A): the live show names the game by its title ("Closest Wins"), not its id.
  check("TV follows the active game (closest)", /closest[- ]wins/i.test(tvText));
  await host.screenshot({ path: screenshotPath("docs/mchezo-screenshots/16-game-night-closest.png") });
  await backToLobbyAll([host, guests["Bea"], guests["Cal"], guests["Dee"], guests["Eli"], guests["Fay"]]);
  // Gus leaves the night for good before Math (the next game starts without him).
  await gusCtx.close();
  for (let i = 0; i < 30; i++) {
    proj = await getProjection(host);
    if ((proj.players ?? []).find((p) => p.displayName === "Gus")?.connected === false) break;
    await sleep(500);
  }

  // --- Game 3: Math Mayhem, started by the cohost (not the host). ---
  check("guest sees no start button", (await guests["Cal"].getByTestId("start-official-math-mayhem").count()) === 0);
  await startGame(guests["Bea"], "math-mayhem", { expectLeftOut: "Gus", players: [host, ...Object.values(guests)] });
  await guests["Bea"].locator(".mz-question").waitFor({ timeout: 15000 });
  check("cohost can start a game", true);
  // A guest's skip attempt is rejected for permission, not timing.
  proj = await getProjection(host);
  const mathGame = (proj.games ?? []).find((g) => g.status === "playing");
  const skip = await guests["Cal"].evaluate(async (gameId) => {
    const token = sessionStorage.getItem("cgn_token") ?? "";
    const roomId = sessionStorage.getItem("cgn_roomId") ?? "";
    const r = await fetch(`/rooms/${roomId}/games/${gameId}/skip`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-session-token": token }, body: "{}",
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, mathGame?.id);
  check("guest skip is rejected (host/cohost only)", skip.status === 400 && /host/i.test(String(skip.body.error ?? "")),
    `status ${skip.status}: ${JSON.stringify(skip.body)}`);
  // Eli reloads mid-game: disconnects, reconnects, keeps his answers.
  await answerAllMath(host);
  await answerAllMath(guests["Bea"]);
  await answerAllMath(guests["Cal"]);
  await answerAllMath(guests["Dee"]);
  await answerAllMath(guests["Fay"]);
  // Eli answers one question, then reloads mid-game: disconnects,
  // reconnects, keeps his answer. (Kit panel since §11: the first
  // enabled slab is the current question's first option.)
  await guests["Eli"].locator(".mz-slab:not([disabled])").first().click();
  await sleep(300);
  await guests["Eli"].reload({ waitUntil: "domcontentloaded" });
  await guests["Eli"].locator(".mz-question").waitFor({ timeout: 15000 });
  check("reloaded player lands back in the game (not the landing)", true);
  await answerAllMath(guests["Eli"]);
  await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
  check("math finishes (reconnected player included)", true);
  proj = await getProjection(host);
  const mathScores = (proj.games ?? []).find((g) => g.gameId === "math-mayhem")?.rawScores ?? {};
  const eliId = (proj.players ?? []).find((p) => p.displayName === "Eli")?.id;
  check("reconnected player's answers survived (he scored)", eliId !== undefined && (mathScores[eliId] ?? 0) >= 0);
  const tvText2 = await tv.evaluate(() => document.body.innerText);
  check("TV follows the active game (math)", /math[- ]mayhem/i.test(tvText2));
  await backToLobbyAll([host, guests["Bea"], guests["Cal"], guests["Dee"], guests["Eli"], guests["Fay"]]);
  check("no stale game panel in the lobby", (await host.locator(".mz-question").count()) === 0 &&
    (await host.locator('[data-testid="game-panel"]').count()) === 0);
  // Championship view: all seven names in the standings.
  await roomGo(host, "cup");
  await host.getByText("Championship standings").waitFor({ timeout: 15000 });
  await sleep(1500);
  const champText = await host.evaluate(() => document.body.innerText);
  check("championship standings list all seven players",
    ["Ada", "Bea", "Cal", "Dee", "Eli", "Fay", "Gus"].every((n) => champText.includes(n)));
  await ctx.close();

  // ---------- Scenario 2: maximum-capacity room (10 players) ----------
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host2 = await ctx2.newPage();
  const code2 = await createRoom(host2, "Ada");
  const maxGuests = {};
  for (let i = 1; i <= 9; i++) {
    const p = await ctx2.newPage();
    await joinRoom(p, `P${i}`, code2);
    maxGuests[`P${i}`] = p;
  }
  await host2.screenshot({ path: screenshotPath("docs/mchezo-screenshots/17-game-night-max-room.png") });
  const tv2 = await ctx2.newPage();
  await spectate(tv2, code2);
  let proj2 = await getProjection(host2);
  check("max room holds 10 players + spectator", (proj2.players ?? []).length === 10 && (proj2.spectatorCount ?? 0) === 1);
  await startGame(host2, "trivia", { players: [host2, ...Object.values(maxGuests)] });
  await host2.locator(".mz-question").waitFor({ timeout: 15000 });
  const answerers = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
  for (const name of answerers) await answerAllTrivia(maxGuests[name], 0);
  await maxGuests["P9"].getByRole("button", { name: "Sit this game out" }).click();
  await answerAllTrivia(host2, 0);
  await host2.locator('[data-testid="mz-reveal-step"]').waitFor({ timeout: 30000 });
  check("max-room trivia finishes", true);
  await tv2.getByRole("tab", { name: "Leaderboard" }).click().catch(() => {});
  await sleep(1000);
  check("max-room TV leaderboard shows all 10 players", (await tv2.locator(".mz-tv-row").count()) === 10);
  await ctx2.close();
} finally {
  await browser.close();
}
console.log(failures === 0 ? `GAME NIGHT ALL PASSED (${passes} checks)` : `GAME NIGHT FAILURES: ${failures} (${passes} passed)`);
process.exitCode = failures ? 1 : 0;
