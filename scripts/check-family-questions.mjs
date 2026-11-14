// Stage 12.5 (docs/stage12/stage125.md): Family Questions, end to end, on three phones and a TV.
//   A  writing: Amina writes a multiple-choice and a "Who in the family?" question on her phone (a refused one says why);
//      nobody else, not the host and not the TV, ever has a word of them; counts per writer are public
//   B  getting ready: too few questions and Start waits (and the server refuses); the host's "Play it next"; a writer
//      takes one back and Start waits again
//   C  playing: the writer sits out their own question ("This one's yours!"); the others answer; the reveal says who asked
//      and crowns a great question; the host skips one, which is never revealed; results and the TV's review
//   D  moderation: the host removes a writer's unplayed questions without reading them
//   E  layout: the write sheet at 320 px has no sideways scroll
// Usage: node scripts/check-family-questions.mjs <baseUrl>   (the gate passes its server)
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { PROTOCOL_HEADERS } from "./lib/protocol.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
async function call(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", ...PROTOCOL_HEADERS };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})), text: "" };
}
async function api(path, opts) { const r = await call(path, opts); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; }
const seatOf = (page) => page.evaluate(() => ({ roomId: sessionStorage.getItem("cgn_roomId"), playerId: sessionStorage.getItem("cgn_playerId"), token: sessionStorage.getItem("cgn_token") }));
const intent = (roomId, seat, gid, action, payload) =>
  api(`/rooms/${roomId}/intents`, { token: seat.token, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId: gid, action, payload } } });
const tvProj = (roomId) => api(`/rooms/${roomId}/projection?audience=tv`);
const myProj = (roomId, seat) => api(`/rooms/${roomId}/projection?audience=player`, { token: seat.token });
const shot = (page, name) => page.screenshot({ path: screenshotPath(`docs/stage12/stage125-screenshots/${name}.png`) });
const text = (page) => page.evaluate(() => document.body.innerText);
/** Nothing on the TV's game screen is cut off: every part ends above whatever clips it and above the director's bar. */
const tvFits = (tv) => tv.evaluate(() => {
  const sec = document.querySelector('[data-testid="tv-live-family-questions"]');
  if (!sec) return { ok: false, why: "no game screen" };
  let limit = document.querySelector(".mz-tvshow-director")?.getBoundingClientRect().top ?? window.innerHeight;
  for (let a = sec.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a); if (o.overflowY !== "visible" || o.overflow !== "visible") limit = Math.min(limit, a.getBoundingClientRect().bottom); }
  const bottom = Math.max(...[...sec.querySelectorAll("*")].map((e) => e.getBoundingClientRect().bottom));
  return { ok: bottom <= limit + 1, bottom: Math.round(bottom), limit: Math.round(limit) };
});

async function hostRoom(page, name) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game", exact: true }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  return code;
}
async function join(page, name, code) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
const phone = (width = 390) => browser.newContext({ viewport: { width, height: 844 } }).then((c) => c.newPage());
const tvPage = async (code) => { const p = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); await p.goto(`${BASE}/tv?code=${code}`, { waitUntil: "domcontentloaded" }); await p.getByTestId("tv-show").waitFor({ timeout: 20000 }); return p; };

// The questions, with canaries: a leak of any of them anywhere it shouldn't be is a failure.
const AMINA_CHOICE = { prompt: "Where did Bibi CANARY-ONE grow up?", options: ["Nyeri CANARY-OPT", "Kisumu", "Mombasa"], right: 1 };
const AMINA_WHO = { prompt: "Who CANARY-TWO always burns the chapati?" };
const BARAKA_Q = { kind: "choice", prompt: "What was Babu CANARY-THREE first car?", options: ["A Peugeot 404", "A VW Beetle"], correctIndex: 0 };
// The longest question a writer can send (140 characters) with four answers: the TV's worst case.
const KEKU_Q = { kind: "choice", prompt: "Which month is Shosho CANARY-FOUR birthday, the one we always celebrate with far too much pilau and the big cake from town, every single year?".slice(0, 140), options: ["March", "July", "October", "December"], correctIndex: 3 };
const CANARY = /CANARY-(ONE|TWO|THREE|FOUR|OPT)/;

const browser = await launchChromium();
try {
  // ---- A. Writing, secretly ----
  const host = await phone();
  const code = await hostRoom(host, "Keku");
  const amina = await phone();
  await join(amina, "Amina", code);
  const baraka = await phone();
  await join(baraka, "Baraka", code);
  const tv = await tvPage(code);
  const [hostSeat, aminaSeat, barakaSeat] = [await seatOf(host), await seatOf(amina), await seatOf(baraka)];
  const roomId = hostSeat.roomId;
  for (const [who, p] of [["host", host], ["guest", amina]]) await soon(`A ${who}: the lobby has the Family Questions card`, async () => (await p.getByTestId("family-card").count()) === 1);
  await shot(amina, "lobby-card-empty-390");
  await amina.getByTestId("family-write").click();
  await amina.getByTestId("family-sheet").waitFor({ timeout: 10000 });
  // A refused question says why, and nothing is sent.
  await amina.getByTestId("family-prompt").fill(AMINA_CHOICE.prompt);
  await amina.getByTestId("family-option-0").fill("Nyeri");
  await amina.getByTestId("family-right-0").click();
  await amina.getByTestId("family-add").click();
  check("A an empty answer is refused, and says why", /Fill in every answer/.test(await amina.getByTestId("family-error").innerText()));
  check("A …and nothing reached the room", (await tvProj(roomId)).family.ready === 0);
  check("B the worst case for the TV is the longest question a writer can send", KEKU_Q.prompt.length === 140, String(KEKU_Q.prompt.length));
  for (const [i, o] of AMINA_CHOICE.options.entries()) {
    if (i >= 2) await amina.getByTestId("family-option-add").click();
    await amina.getByTestId(`family-option-${i}`).fill(o);
  }
  await amina.getByTestId(`family-right-${AMINA_CHOICE.right}`).click();
  await shot(amina, "write-choice-390");
  await amina.getByTestId("family-add").click();
  await soon("A Amina's multiple-choice question is added", async () => /Added! 1 question/.test(await amina.getByTestId("family-added").innerText()));
  await amina.getByTestId("family-kind-who").click();
  await amina.getByTestId("family-prompt").fill(AMINA_WHO.prompt);
  await amina.getByTestId(`family-who-${barakaSeat.playerId}`).click();
  await shot(amina, "write-who-390");
  await amina.getByTestId("family-add").click();
  await soon("A …and her 'Who in the family?' question", async () => /Added! 2 questions/.test(await amina.getByTestId("family-added").innerText()));
  await soon("A Amina sees her own two questions, with their answers", async () => (await amina.getByTestId("family-mine-row").count()) === 2 && /Answer: Baraka/.test(await amina.getByTestId("family-mine").innerText()) && /Answer: Kisumu/.test(await amina.getByTestId("family-mine").innerText()));
  await shot(amina, "write-mine-390");
  // E. 320 px: the sheet never scrolls sideways.
  await amina.setViewportSize({ width: 320, height: 700 });
  await sleep(300);
  check("E the write sheet fits 320 px (no sideways scroll)", await amina.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await shot(amina, "write-sheet-320");
  await amina.setViewportSize({ width: 390, height: 844 });
  await amina.getByTestId("family-close").click();
  // Secrecy: not the host, not Baraka, not the TV, on screen or in what the server sends them.
  await soon("A the counts are public: Baraka's card says 2 questions from 1 writer", async () => /2 questions ready from 1 writer/.test(await baraka.getByTestId("family-card").innerText()));
  for (const [who, p, seat] of [["host", host, hostSeat], ["Baraka", baraka, barakaSeat]]) {
    check(`A ${who}'s screen has no word of Amina's questions`, !CANARY.test(await text(p)));
    check(`A ${who}'s projection has no word of them`, !CANARY.test(JSON.stringify(await myProj(roomId, seat))));
  }
  check("A the TV has none, on screen or in its feed", !CANARY.test(await text(tv)) && !CANARY.test(JSON.stringify(await tvProj(roomId))));

  // ---- B. Getting ready ----
  const few = await call(`/rooms/${roomId}/games`, { token: hostSeat.token, body: { gameId: "family-questions", official: false } });
  check("B with 2 questions, the server refuses to start (FAMILY_TOO_FEW)", few.status === 409 && few.body.code === "FAMILY_TOO_FEW" && few.body.ready === 2, JSON.stringify(few.body));
  check("B …and the host isn't offered 'Play it next'", (await host.getByTestId("family-play-next").count()) === 0);
  await api(`/rooms/${roomId}/family`, { token: barakaSeat.token, body: BARAKA_Q });
  await soon("B with 3 ready, the host can make it the next game", async () => (await host.getByTestId("family-play-next").count()) === 1);
  await host.getByTestId("family-play-next").click();
  await soon("B Family Questions is up next", async () => /Family Questions/.test(await host.getByTestId("up-next-card").innerText()));
  const start = host.locator('[data-testid="start-practice-family-questions"]');
  check("B Start is ready", await start.isEnabled());
  await shot(host, "lobby-host-ready-390");
  // A writer takes one back: Start waits, and says why.
  const bq = (await myProj(roomId, barakaSeat)).family.mine[0];
  await baraka.getByTestId("family-write").click();
  await baraka.getByTestId(`family-delete-${bq.id}`).click();
  await soon("B Baraka took his question back; the host's Start waits for one more", async () => /Needs 1 more family question/.test(await start.innerText()) && !(await start.isEnabled()));
  await baraka.getByTestId("family-close").click();
  await shot(host, "lobby-host-needs-more-390");
  await api(`/rooms/${roomId}/family`, { token: barakaSeat.token, body: BARAKA_Q });
  await api(`/rooms/${roomId}/family`, { token: hostSeat.token, body: KEKU_Q });
  await soon("B 4 ready from 3 writers; Start is back", async () => /4 questions ready from 3 writers/.test(await host.getByTestId("family-card").innerText()) && await start.isEnabled());

  // ---- C. Playing ----
  await start.click();
  const gid = await soon("C the game is in its briefing", async () => (await tvProj(roomId)).games.find((g) => g.gameId === "family-questions" && g.status === "briefing")?.id);
  for (const s of [hostSeat, aminaSeat, barakaSeat]) await intent(roomId, s, gid, "briefing-ready", { ready: true });
  await soon("C …and playing", async () => (await tvProj(roomId)).games.find((g) => g.id === gid)?.status === "playing");
  const seats = { [hostSeat.playerId]: [host, hostSeat, "Keku"], [aminaSeat.playerId]: [amina, aminaSeat, "Amina"], [barakaSeat.playerId]: [baraka, barakaSeat, "Baraka"] };
  const ANSWERS = { [AMINA_CHOICE.prompt]: "Kisumu", [AMINA_WHO.prompt]: "Baraka", [BARAKA_Q.prompt]: "A Peugeot 404", [KEKU_Q.prompt]: "December" };
  const AUTHORS = { [AMINA_CHOICE.prompt]: "Amina", [AMINA_WHO.prompt]: "Amina", [BARAKA_Q.prompt]: "Baraka", [KEKU_Q.prompt]: "Keku" };
  const pub = async () => (await tvProj(roomId)).games.find((g) => g.id === gid).state;
  let skippedPrompt = null;
  let round = -1;
  for (let n = 0; n < 4; n++) {
    const st = await soon(`C question ${n + 1} is open`, async () => { const s = await pub(); return s.phase === "answer" && s.round > round ? s : null; }, 30000);
    if (!st) break;
    round = st.round;
    const author = AUTHORS[st.prompt];
    const authorId = Object.keys(seats).find((id) => seats[id][2] === author);
    const others = Object.keys(seats).filter((id) => id !== authorId);
    // The writer sits out; the others see the question; nobody (and not the TV) is told who asked.
    await soon(`C q${n + 1}: ${author}'s phone says it's theirs`, async () => (await seats[authorId][0].getByTestId("mz-fq-yours").count()) === 1);
    for (const id of others) await soon(`C q${n + 1}: ${seats[id][2]} sees the question to answer`, async () => (await seats[id][0].getByTestId("mz-fq-answer").count()) === 1);
    await soon(`C q${n + 1}: the TV shows the question, not who asked`, async () => (await tv.getByTestId("tv-fq-prompt").innerText()) === st.prompt && (await tv.getByTestId("tv-fq-asked").count()) === 0);
    { const f = await tvFits(tv); check(`C q${n + 1}: the TV question fits the screen (${st.options.length} answers, ${st.prompt.length} characters)`, f.ok, JSON.stringify(f)); }
    check(`C q${n + 1}: the open question's feed has no answer and no writer`, !/correctIndex|askedBy|authorId/.test(JSON.stringify(st)));
    if (n === 0) { await shot(seats[authorId][0], "phone-yours-390"); await shot(seats[others[0]][0], "phone-answer-390"); await shot(tv, "tv-question-1920"); }
    if (st.prompt === KEKU_Q.prompt) { await shot(tv, "tv-question-long-1920"); await shot(seats[others[0]][0], "phone-answer-long-390"); }
    if (n === 1) {
      // The host skips this one: two taps; it's never revealed or scored.
      skippedPrompt = st.prompt;
      await host.getByTestId("mz-fq-skip").click();
      await host.getByTestId("mz-fq-skip-confirm").click();
      await soon(`C q2: the host's skip moves everyone on, with no reveal`, async () => { const s = await pub(); return s.round > round && s.skippedRounds === 1; }, 15000);
      continue;
    }
    // One answers right on their phone; the other wrong (a great question when there are two answerers).
    const options = st.options;
    const right = options.indexOf(ANSWERS[st.prompt]);
    const [first, second] = others;
    await seats[first][0].getByTestId(`mz-fq-option-${right}`).click();
    await soon(`C q${n + 1}: ${seats[first][2]}'s pick is locked in`, async () => (await seats[first][0].getByTestId("mz-fq-locked").count()) === 1);
    await intent(roomId, seats[second][1], gid, "family-answer", { round, choice: (right + 1) % options.length });
    const res = await soon(`C q${n + 1}: the reveal`, async () => { const s = await pub(); return s.phase === "reveal" && s.round === round ? s.result : null; });
    check(`C q${n + 1}: the right answer and who asked`, res?.correctIndex === right && res?.askedByName === author, JSON.stringify(res));
    check(`C q${n + 1}: a great question (one of two got it)`, res?.greatQuestion === true && res.right.length === 1);
    await soon(`C q${n + 1}: phones say who asked, and the great question`, async () => new RegExp(`Asked by ${seats[first][2] === author ? "you" : author}`).test(await seats[first][0].getByTestId("mz-fq-asked").innerText()) && /Great question/.test(await seats[first][0].getByTestId("mz-fq-asked").innerText()));
    await soon(`C q${n + 1}: the writer's phone says it was theirs, +50`, async () => /Your question!.*\+50/.test(await seats[authorId][0].getByTestId("mz-fq-mine").innerText()));
    await soon(`C q${n + 1}: the TV reveals the answer and who asked`, async () => new RegExp(`Asked by ${author}`).test(await tv.getByTestId("tv-fq-asked").innerText()) && /right answer/i.test(await tv.getByTestId(`tv-fq-reveal-${right}`).innerText()));
    { const f = await tvFits(tv); check(`C q${n + 1}: the TV reveal fits the screen`, f.ok, JSON.stringify(f)); }
    if (n === 0) { await shot(seats[first][0], "phone-reveal-390"); await shot(tv, "tv-reveal-1920"); }
    if (st.prompt === KEKU_Q.prompt) await shot(tv, "tv-reveal-long-1920");
  }
  await soon("C the game finishes", async () => (await tvProj(roomId)).games.find((g) => g.id === gid)?.status === "finished", 40000);
  const fin = await pub();
  check("C 4 rounds: one skipped by the host, three played", fin.rounds?.length === 4 && fin.rounds.filter((r) => r.skipped).length === 1, JSON.stringify(fin.rounds?.map((r) => r.skipped ?? r.askedByName)));
  check("C the skipped question's answer and writer were never revealed", fin.rounds.find((r) => r.skipped) && !JSON.stringify(fin.rounds.find((r) => r.skipped)).includes("askedBy"));
  const scores = (await tvProj(roomId)).games.find((g) => g.id === gid).rawScores;
  check("C scores: 3 played rounds × (100 right + 50 great question) = 450 in all", Object.values(scores).reduce((a, b) => a + b, 0) === 450, JSON.stringify(scores));
  await soon("C phone results: every question with its answer and who asked", async () => (await amina.getByTestId("mz-fq-recap-round").count()) === 4 && /Skipped by the host/.test(await amina.getByTestId("mz-fq-results").innerText()));
  check("C results: the great questions are celebrated", /Great question/.test(await amina.getByTestId("results-moment").innerText()));
  check("C results: the skipped question's prompt isn't in the recap", !(await amina.getByTestId("mz-fq-results").innerText()).includes(skippedPrompt ?? "§"));
  await shot(amina, "phone-results-390");
  await sleep(1500);
  await shot(tv, "tv-final-1920");
  // The questions are used: none are ready now.
  check("C played questions are used up (0 ready)", (await tvProj(roomId)).family.ready === 0);
  for (const p of [host, amina, baraka]) { const b = p.getByRole("button", { name: "Back to lobby" }); if (await b.count()) await b.first().click(); }

  // ---- D. Moderation, unread ----
  await api(`/rooms/${roomId}/family`, { token: barakaSeat.token, body: { kind: "choice", prompt: "Baraka CANARY-THREE again?", options: ["Yes", "No"], correctIndex: 0 } });
  await api(`/rooms/${roomId}/family`, { token: barakaSeat.token, body: { kind: "who", prompt: "Who CANARY-THREE snores?", answerPlayerId: hostSeat.playerId } });
  await soon("D the host's card counts Baraka's 2 new questions", async () => /2 questions ready from 1 writer/.test(await host.getByTestId("family-card").innerText()));
  await host.getByTestId("family-write").click();
  await host.getByTestId("family-host").waitFor({ timeout: 10000 });
  check("D the host's tool lists Baraka with a count, and no word of his questions", /Baraka\s*2 questions waiting/.test(await host.getByTestId("family-host").innerText()) && !/CANARY-THREE/.test(await text(host)), await host.getByTestId("family-host").innerText());
  await host.getByTestId(`family-remove-${barakaSeat.playerId}`).click();
  await shot(host, "host-remove-390");
  await host.getByTestId(`family-remove-confirm-${barakaSeat.playerId}`).click();
  await soon("D Baraka's unplayed questions are removed", async () => (await tvProj(roomId)).family.ready === 0);
  const removedMine = (await myProj(roomId, barakaSeat)).family.mine;
  check("D Baraka keeps only his played question (marked played)", removedMine.length === 1 && removedMine[0].played === true, JSON.stringify(removedMine.map((q) => q.played)));
  const notHost = await call(`/rooms/${roomId}/family/author/${hostSeat.playerId}/remove`, { token: aminaSeat.token, body: {} });
  check("D a player who isn't the host can't remove anyone's questions (403)", notHost.status === 403);
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "check-family-questions: all checks passed" : `check-family-questions: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
