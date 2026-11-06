// Leaderboard scenarios (Phase 2.1 §4): all-tied, pair ties, middle ties,
// rank changes across games, and a disconnected player — phone results vs
// TV leaderboard vs the server's raw scores, which are authoritative.
// Usage: build:web, serve on a port, then:
//   node scripts/check-leaderboard.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";
import { answerKitQuestions } from "./lib/answer.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function createRoom(page, name) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
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
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
async function roomIdOf(page) {
  return page.evaluate(() => sessionStorage.getItem("cgn_roomId"));
}
// Answer every question with the same option index (0-3).
// Sprint 2 (Workstream I): observable-state answering that fails at the
// missing interaction instead of returning silently (scripts/lib/answer.mjs).
async function answerOption(page, optionIndex) {
  const player = (await page.evaluate(() => sessionStorage.getItem("cgn_name"))) || "player";
  await answerKitQuestions(page, { player, choose: () => optionIndex });
}
// Answer only the first n questions, then stop (used before disconnecting).
async function answerFirstN(page, n, optionIndex = 0) {
  const player = (await page.evaluate(() => sessionStorage.getItem("cgn_name"))) || "player";
  const answered = await answerKitQuestions(page, { player, choose: () => optionIndex, limit: n });
  if (answered !== n) throw new Error(`${player}: expected to answer ${n} questions before disconnecting, answered ${answered}`);
}
// Sprint 2: an official start asks before leaving out a player who is
// still reconnecting. These scenarios continue without the player who
// closed their page, so answer the question explicitly when it appears.
async function startOfficialTrivia(page) {
  await page.getByTestId("start-official-trivia").click();
  const decision = page.getByTestId("mz-start-decision");
  if (await decision.waitFor({ timeout: 2500 }).then(() => true, () => false)) {
    console.log(`note: start asked first — ${((await decision.textContent()) ?? "").replace(/\s+/g, " ").slice(0, 80)}`);
    await page.getByTestId("mz-start-without").click();
  }
}
async function tvProj(roomId) {
  return (await fetch(`${BASE}/rooms/${roomId}/projection?audience=tv`)).json();
}
// Server ranking rule (mirrors rankStandings): score desc, name asc, shared ranks.
function expectedRanking(rawScores, players) {
  const byId = new Map(players.map((p) => [p.id, p.displayName]));
  const rows = Object.entries(rawScores)
    .map(([id, score]) => ({ id, name: byId.get(id) ?? id, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1; });
  return rows;
}
async function phoneRows(page, hostName) {
  const rows = [];
  for (const li of await page.locator(".mz-standings li").all()) {
    const rank = parseInt((await li.locator(".mz-standings__rank").textContent()) ?? "0", 10);
    let name = (await li.locator(".mz-standings__name").textContent()) ?? "";
    if (name === "You") name = hostName;
    const score = parseInt(((await li.locator(".mz-standings__score").textContent()) ?? "0").replace(/,/g, ""), 10);
    const gain = ((await li.locator(".mz-standings__gain").textContent().catch(() => "")) ?? "").trim();
    rows.push({ rank, name, score, gain });
  }
  return rows;
}
async function tvRows(page) {
  await page.waitForTimeout(3000); // leaderboard phase settles to "after"
  const rows = [];
  for (const li of await page.locator(".mz-tv-row").all()) {
    rows.push({
      rank: parseInt((await li.getAttribute("data-rank")) ?? "0", 10),
      name: (await li.locator(".mz-tv-row__name").textContent()) ?? "",
      score: parseInt((await li.getAttribute("data-score")) ?? "0", 10),
    });
  }
  return rows;
}
// Phone results show top 2 + you (handoff limit); every visible row must
// still match the server ranking exactly.
function checkPhoneMatches(name, visible, expected) {
  const ok = visible.every((v) => {
    const e = expected.find((x) => x.name === v.name);
    return e && e.rank === v.rank && e.score === v.score;
  }) && visible.length > 0;
  check(name, ok, `visible=${visible.map((v) => `${v.name}:${v.rank}:${v.score}`).join(" ")}`);
}
function checkTvMatches(name, visible, expected) {
  const ok = visible.length === expected.length && visible.every((v, i) => {
    const e = expected[i];
    return e && e.name === v.name && e.rank === v.rank && e.score === v.score;
  });
  check(name, ok, `tv=${visible.map((v) => `${v.name}:${v.rank}:${v.score}`).join(" ")} | server=${expected.map((v) => `${v.name}:${v.rank}:${v.score}`).join(" ")}`);
}

const browser = await launchChromium();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Ada");
  const roomId = await roomIdOf(host);
  const P = {};
  for (const name of ["Bea", "Cal", "Dee"]) {
    const p = await ctx.newPage();
    await joinRoom(p, name, code);
    P[name] = p;
  }
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tv = await tvCtx.newPage();
  await joinRoom(tv, "TV", code);

  async function playGame(actions, seed) {
    // actions: { page, kind: "option"|"abstain" }[]; host starts from lobby.
    // A fixed seed is used only where the scenario needs a deterministic
    // correct-answer split (game 2: option-0 vs option-1 pairs must score
    // differently). Random seeds made that shape a ~1-in-5 flake: a 5/5
    // split ties all four players and the "pairs differ" check fails
    // through no app fault. Seed 1 splits 5/3 (verified against
    // generateTrivia). All other games still start from the UI.
    if (seed !== undefined) {
      await host.evaluate(async ({ roomId, seed }) => {
        const token = sessionStorage.getItem("cgn_token");
        const r = await fetch(`/rooms/${roomId}/games`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": token }, body: JSON.stringify({ gameId: "trivia", official: true, seed }) });
        if (!r.ok) throw new Error(`seeded start failed: ${r.status}`);
      }, { roomId, seed });
    } else {
      await startOfficialTrivia(host);
    }
    await host.locator(".mz-question").waitFor({ timeout: 30000 });
    for (const a of actions) {
      if (a.kind === "abstain") await a.page.getByRole("button", { name: "Sit this game out" }).click();
      else await answerOption(a.page, a.option);
    }
    await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
    const proj = await tvProj(roomId);
    const game = (proj.games ?? []).filter((g) => g.gameId === "trivia" && g.status === "finished").at(-1);
    const expected = expectedRanking(game.rawScores, proj.players);
    // TV page: results -> lobby -> TV stage -> leaderboard.
    await tv.getByRole("button", { name: "Back to lobby" }).click();
    await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
    await tv.getByRole("button", { name: "TV stage" }).click();
    await tv.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
    // D: finished TV auto-walks the reveal; jump straight to the board.
    await tv.getByRole("tab", { name: "Leaderboard" }).click();
    await tv.locator(".mz-tv-row").first().waitFor({ timeout: 15000 });
    const tvs = await tvRows(tv);
    const moves = {};
    for (const li of await tv.locator(".mz-tv-row").all()) {
      const name = (await li.locator(".mz-tv-row__name").textContent()) ?? "";
      moves[name] = ((await li.locator(".mz-tv-row__move").textContent().catch(() => "")) ?? "").trim();
    }
    const note = await tv.locator("p", { hasText: "Rank movement vs the previous Trivia game" }).count();
    // D: phone results open on the reveal sequence; jump to standings.
    await host.getByTestId("mz-reveal-standings").click();
    await host.locator(".mz-standings").waitFor({ timeout: 15000 });
    const phones = await phoneRows(host, "Ada");
    await tv.getByRole("button", { name: "Back to phone view" }).click();
    await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
    await host.getByRole("button", { name: "Back to lobby" }).click();
    await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
    return { expected, tvs, phones, proj, moves, note };
  }

  // Game 1: everyone answers identically -> all tied.
  {
    const { expected, tvs, phones, note } = await playGame([
      { page: host, kind: "option", option: 0 },
      { page: P.Bea, kind: "option", option: 0 },
      { page: P.Cal, kind: "option", option: 0 },
      { page: P.Dee, kind: "option", option: 0 },
      { page: tv, kind: "abstain" },
    ]);
    check("all tied: every player shares rank 1", expected.filter((r) => r.name !== "TV").every((r) => r.rank === 1));
    checkTvMatches("all tied: TV leaderboard matches server", tvs, expected);
    checkPhoneMatches("all tied: phone rows match server", phones, expected);
    check("first game: no movement note without a previous game", note === 0, `note=${note}`);
  }
  // Game 2: two pairs answer identically -> two shared ranks.
  // Seeded (see playGame): the pair-ties shape needs an uneven split.
  {
    const { expected, tvs, phones } = await playGame([
      { page: host, kind: "option", option: 0 },
      { page: P.Bea, kind: "option", option: 0 },
      { page: P.Cal, kind: "option", option: 1 },
      { page: P.Dee, kind: "option", option: 1 },
      { page: tv, kind: "abstain" },
    ], 1);
    const ranks = new Map(expected.map((r) => [r.name, r.rank]));
    const pairsShare = ranks.get("Ada") === ranks.get("Bea") && ranks.get("Cal") === ranks.get("Dee") && ranks.get("Ada") !== ranks.get("Cal");
    check("pair ties: Ada=Bea and Cal=Dee share ranks, pairs differ", pairsShare,
      [...ranks.entries()].map(([n, r]) => `${n}:${r}`).join(" "));
    checkTvMatches("pair ties: TV leaderboard matches server", tvs, expected);
    checkPhoneMatches("pair ties: phone rows match server", phones, expected);
  }
  // Distinct scores (Milestone C.1, seed 1): correct-answer counts by
  // option are [5,3,0,2], so options 0/1/2/3 score 600/360/0/240 — four
  // distinct ranks plus a zero-point player, no ties among the four.
  {
    const { expected, tvs, phones } = await playGame([
      { page: host, kind: "option", option: 0 },
      { page: P.Bea, kind: "option", option: 1 },
      { page: P.Cal, kind: "option", option: 2 },
      { page: P.Dee, kind: "option", option: 3 },
      { page: tv, kind: "abstain" },
    ], 1);
    const ranks = new Map(expected.map((r) => [r.name, r.rank]));
    const scores = new Map(expected.map((r) => [r.name, r.score]));
    check("distinct scores: Ada 600 / Bea 360 / Dee 240 / Cal 0, ranks 1/2/3/4",
      ranks.get("Ada") === 1 && scores.get("Ada") === 600 &&
      ranks.get("Bea") === 2 && scores.get("Bea") === 360 &&
      ranks.get("Dee") === 3 && scores.get("Dee") === 240 &&
      ranks.get("Cal") === 4 && scores.get("Cal") === 0,
      [...ranks.entries()].map(([n, r]) => `${n}:${r}:${scores.get(n)}`).join(" "));
    checkTvMatches("distinct scores: TV leaderboard matches server", tvs, expected);
    checkPhoneMatches("distinct scores: phone rows match server", phones, expected);
  }
  // Rank movement (Milestone C.2): same seed, Ada/Bea swap options, so
  // Bea climbs 2 -> 1 (+240) and Ada drops 1 -> 2 (-240) vs the previous
  // Trivia game. Cal/Dee keep their options and do not move.
  {
    const { expected, tvs, phones, moves, note } = await playGame([
      { page: host, kind: "option", option: 1 },
      { page: P.Bea, kind: "option", option: 0 },
      { page: P.Cal, kind: "option", option: 2 },
      { page: P.Dee, kind: "option", option: 3 },
      { page: tv, kind: "abstain" },
    ], 1);
    const ranks = new Map(expected.map((r) => [r.name, r.rank]));
    check("movement: Bea takes rank 1, Ada drops to rank 2", ranks.get("Bea") === 1 && ranks.get("Ada") === 2,
      [...ranks.entries()].map(([n, r]) => `${n}:${r}`).join(" "));
    check("movement: TV shows the movement note vs the previous Trivia game", note === 1, `note=${note}`);
    check("movement: TV arrows show Bea up 1, Ada down 1", moves["Bea"] === "▲ 1" && moves["Ada"] === "▼ 1",
      `Bea=${moves["Bea"]} Ada=${moves["Ada"]} Cal=${moves["Cal"]} Dee=${moves["Dee"]}`);
    const beaPhone = phones.find((r) => r.name === "Bea");
    const adaPhone = phones.find((r) => r.name === "Ada");
    check("movement: phone gain chips show Bea +240, Ada −240",
      beaPhone?.gain === "+240" && adaPhone?.gain === "−240",
      `Bea=${beaPhone?.gain} Ada=${adaPhone?.gain}`);
    checkTvMatches("movement: TV leaderboard matches server", tvs, expected);
  }
  // Rank changes: alternate Ada/Bea options across games until the order flips.
  // Seeded (seed 1, like games 2–4 above): with random seeds the first
  // game ties ~1-in-5 — option 0 and option 1 happen to score equally —
  // and a tied first game poisoned this loop: orderA locked to "tied"
  // and the orderB condition (which requires orderA !== "tied") could
  // never be satisfied, so the check failed through no app fault. Seed 1
  // splits option 0/1 as 600/360, so attempt 1 is Ada>Bea and attempt 2
  // is Bea>Ada — a deterministic flip. The loop also no longer locks
  // orderA on a tie, so a tied game is skipped rather than poisoning it.
  let orderA = null, orderB = null, attempts = 0;
  while (attempts < 6 && !(orderA && orderB && orderA !== orderB)) {
    attempts++;
    const swap = attempts % 2 === 0;
    const { expected } = await playGame([
      { page: host, kind: "option", option: swap ? 1 : 0 },
      { page: P.Bea, kind: "option", option: swap ? 0 : 1 },
      { page: P.Cal, kind: "abstain" },
      { page: P.Dee, kind: "abstain" },
      { page: tv, kind: "abstain" },
    ], 1);
    const order = (() => {
      const a = expected.find((r) => r.name === "Ada");
      const b = expected.find((r) => r.name === "Bea");
      if (!a || !b) return "missing";
      if (a.rank < b.rank) return "Ada>Bea";
      if (b.rank < a.rank) return "Bea>Ada";
      return "tied";
    })();
    if (!orderA && order !== "tied") orderA = order;
    else if (orderA && order !== orderA && order !== "tied" && !orderB) orderB = order;
    if (orderA && orderB) break;
  }
  check("rank changes: Ada/Bea order flips across games", !!orderA && !!orderB && orderA !== orderB, `${orderA} -> ${orderB} (${attempts} games)`);
  // Disconnected player: Dee answers 3, closes the page; game still finishes.
  {
    await startOfficialTrivia(host);
    await host.locator(".mz-question").waitFor({ timeout: 30000 });
    await answerFirstN(P.Dee, 3, 0);
    await P.Dee.close();
    await answerOption(host, 0);
    await answerOption(P.Bea, 0);
    await answerOption(P.Cal, 0);
    await tv.getByRole("button", { name: "Sit this game out" }).click();
    await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
    const proj = await tvProj(roomId);
    const game = (proj.games ?? []).filter((g) => g.gameId === "trivia" && g.status === "finished").at(-1);
    const expected = expectedRanking(game.rawScores, proj.players);
    const dee = proj.players.find((p) => p.displayName === "Dee");
    check("disconnected player: game finishes without Dee", game.status === "finished" && dee.connected === false);
    check("disconnected player: Dee keeps a partial score in standings",
      expected.some((r) => r.name === "Dee"), `Dee=${game.rawScores[dee.id]}`);
    await tv.getByRole("button", { name: "Back to lobby" }).click();
    await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
    await tv.getByRole("button", { name: "TV stage" }).click();
    await tv.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
    // D: finished TV auto-walks the reveal; jump straight to the board.
    await tv.getByRole("tab", { name: "Leaderboard" }).click();
    await tv.locator(".mz-tv-row").first().waitFor({ timeout: 15000 });
    const tvs = await tvRows(tv);
    checkTvMatches("disconnected player: TV leaderboard includes Dee with server score", tvs, expected);
  }
  // Away marker (§4b): Cal answers everything, disconnects, everyone else
  // abstains. Cal is the only scorer (rank 1), so his row is visible on
  // every phone's truncated standings as well as on the full TV board.
  {
    // Previous section left TV on the stage; return it to the phone view
    // first, or it has no abstain button for this game.
    await tv.getByRole("button", { name: "Back to phone view" }).click();
    await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
    await host.getByRole("button", { name: "Back to lobby" }).click();
    await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
    await startOfficialTrivia(host);
    await host.locator(".mz-question").waitFor({ timeout: 30000 });
    await answerOption(P.Cal, 0);
    await P.Cal.close();
    await host.getByRole("button", { name: "Sit this game out" }).click();
    await P.Bea.getByRole("button", { name: "Sit this game out" }).click();
    await tv.getByRole("button", { name: "Sit this game out" }).click();
    await host.getByRole("button", { name: "Back to lobby" }).waitFor({ timeout: 30000 });
    const proj = await tvProj(roomId);
    const game = (proj.games ?? []).filter((g) => g.gameId === "trivia" && g.status === "finished").at(-1);
    const expected = expectedRanking(game.rawScores, proj.players);
    const cal = proj.players.find((p) => p.displayName === "Cal");
    check("away marker: Cal disconnected with a positive score", cal.connected === false && game.rawScores[cal.id] > 0, `Cal=${game.rawScores[cal.id]}`);
    check("away marker: Cal ranks 1st as the only scorer", expected.find((r) => r.name === "Cal")?.rank === 1,
      expected.map((r) => `${r.name}:${r.rank}:${r.score}`).join(" "));
    // D: phone results open on the reveal sequence; jump to standings.
    await host.getByTestId("mz-reveal-standings").click();
    await host.locator(".mz-standings").waitFor({ timeout: 15000 });
    let phoneAway = false;
    for (const li of await host.locator(".mz-standings li").all()) {
      const name = (await li.locator(".mz-standings__name").textContent()) ?? "";
      if (name === "Cal") phoneAway = ((await li.locator(".mz-standings__away").textContent().catch(() => "")) ?? "").trim() === "Away";
    }
    check("away marker: host phone results mark Cal Away", phoneAway);
    await tv.getByRole("button", { name: "Back to lobby" }).click();
    await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
    await tv.getByRole("button", { name: "TV stage" }).click();
    await tv.getByRole("region", { name: "Mchezo big screen" }).waitFor({ timeout: 15000 });
    // D: finished TV auto-walks the reveal; jump straight to the board.
    await tv.getByRole("tab", { name: "Leaderboard" }).click();
    await tv.locator(".mz-tv-row").first().waitFor({ timeout: 15000 });
    await tv.waitForTimeout(3000);
    let tvAway = false;
    for (const li of await tv.locator(".mz-tv-row").all()) {
      const name = (await li.locator(".mz-tv-row__name").textContent()) ?? "";
      if (name === "Cal") tvAway = ((await li.locator(".mz-tv-row__away").textContent().catch(() => "")) ?? "").trim() === "Away";
    }
    check("away marker: TV leaderboard marks Cal Away", tvAway);
    await tv.getByRole("button", { name: "Back to phone view" }).click();
    await tv.getByRole("heading", { name: "You’re in, TV." }).waitFor({ timeout: 15000 });
    await host.getByRole("button", { name: "Back to lobby" }).click();
    await host.getByRole("heading", { name: "You’re in, Ada." }).waitFor({ timeout: 15000 });
  }
  console.log(failures === 0 ? "LEADERBOARD ALL PASSED" : `LEADERBOARD FAILED: ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  await browser.close();
}
