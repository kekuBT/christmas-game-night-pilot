// Beta R4 W4 (handoff 6933392621): a LOCAL rehearsal of the W4 restart check against the pinned runtime, in real
// browser pages (Chromium). A local test helper ONLY: it refuses any origin but https://localhost or https://127.0.0.1,
// and it never touches a hosting account. It is run by scripts/beta/w4-rehearsal.sh, which owns the service and
// performs each restart this driver asks for (through --control-dir). The real W4 (a Render manual deploy and a dashboard
// restart) stays pending in docs/beta/render-w4.md.
//
//   node scripts/beta/w4-rehearsal.mjs --origin https://localhost:18443 --code-file <code> --evidence <dir>
//        --control-dir <dir> [--max-minutes 10] [--control empty-data]
//
// A host, one guest and a TV (throwaway names), in one casual room. "Rendered" checks read a page's own DOM; "API" checks
// read the server's projection over HTTP; "harness" facts come from the harness that restarted the service.
//   S   Memory Book seed: a first Trivia round is finished, and the host saves a synthetic note citing it; it reads back.
//   P   a second Trivia round, mid-play: host and guest each answer question 1 and see it LOCKED IN (acknowledged); the
//       guest moves to question 2.
//   R1  the SAME container is stopped: the harness must report a VERIFIED graceful stop (exited, exit code 0, not forced
//       or OOM-killed). While it is down the guest taps an answer to question 2: the phone must not show it as in. The
//       container is started again (the harness must report it was stopped and a new start is recorded). Then: the pinned
//       revision (harness); the same room, seats and round (API); question 1 recorded once each, and the unconfirmed tap
//       NOT recorded (API); each page opened a new socket; the guest's screen shows question 2 open, the host's and the
//       TV's screens show the playing round (rendered). The guest answers question 2 again: locked in, recorded once.
//   R2  a FRESH container of the same image on the SAME data (a local analogue of a redeploy, not a Render deploy): the
//       harness must report the old container stopped gracefully, was removed and confirmed gone, and no container used
//       the data before the replacement started; then the same checks, both earlier answers kept once, and the seeded
//       Memory Book note still reads back (API).
//   L   the one-writer lock: a second server process in the running container must be refused (harness).
//   G   the rollback guard: the probe's own container, on a fixture volume holding only a copy of the authorization
//       record (never the data volume), with another public origin, must exit 78 with REFUSED before its deadline; its
//       teardown confirmed; the data volume's only user the container under test, before and after (harness).
// Any failed restart or probe action STOPS the rehearsal there (an "ABORTED" line): nothing more is asked of the harness.
//   F   the round finishes (guest through the UI, host through the API): every answer once, the guest's score equal to the
//       score of its recorded answers, and the host's, guest's and TV's rendered standings equal to the recorded scores.
// --control empty-data (the negative control): R2's fresh container gets a NEW, EMPTY volume (data lost). The room,
// answer and Memory Book checks after R2 must then FAIL; the run reports FAILED and a "CONTROL" line lists the failures.
// The evidence holds no access code, cookie, token or room code (redacted; the run fails if one is found in it).
// Exit: 0 "W4 REHEARSAL PASSED", 1 "W4 REHEARSAL FAILED", 2 bad options (before any network activity).
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { passBriefing } from "../lib/briefing.mjs";
import { launchChromium } from "../lib/driver-env.mjs";

const argv = process.argv.slice(2);
const VALUED = new Set(["origin", "code-file", "evidence", "control-dir", "max-minutes", "control"]);
for (let i = 0; i < argv.length; i++) {
  const m = /^--([a-z-]+)$/.exec(argv[i]);
  if (!m || !VALUED.has(m[1]) || argv[i + 1] === undefined || argv[i + 1].startsWith("--")) { console.error(`w4-rehearsal: unknown option or missing value: ${argv[i]}`); process.exit(2); }
  i++;
}
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
let ORIGIN; try { ORIGIN = new URL(opt("origin", "")).origin; } catch { console.error("w4-rehearsal: --origin is not a URL"); process.exit(2); }
if (!ORIGIN.startsWith("https://") || !["localhost", "127.0.0.1"].includes(new URL(ORIGIN).hostname)) { console.error("w4-rehearsal: LOCAL ONLY: --origin must be https://localhost[:port] or https://127.0.0.1[:port]"); process.exit(2); }
if (!opt("code-file") || !opt("evidence") || !opt("control-dir")) { console.error("w4-rehearsal: --code-file, --evidence and --control-dir are required"); process.exit(2); }
const CONTROL = opt("control", "");
if (CONTROL && CONTROL !== "empty-data") { console.error("w4-rehearsal: --control accepts only empty-data"); process.exit(2); }
const MAX_MS = Number(opt("max-minutes", "10")) * 60_000;
if (!(MAX_MS > 0)) { console.error("w4-rehearsal: --max-minutes must be a positive number"); process.exit(2); }
const CTL = opt("control-dir");
const CODE = readFileSync(opt("code-file"), "utf8").trim();

const RUN = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomBytes(3).toString("hex")}`;
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`);
const secrets = new Set([CODE]);
const redact = (s) => { let t = String(s); for (const x of secrets) if (x && x.length >= 6) t = t.split(x).join("<redacted>"); return t.replace(/cgn_beta=[^;,\s"]+/g, "cgn_beta=<redacted>"); };
const ev = {
  tool: "scripts/beta/w4-rehearsal.mjs", toolSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
  node: process.version, runId: RUN, origin: ORIGIN, startedAt: new Date(T0).toISOString(), control: CONTROL || null,
  scope: "LOCAL rehearsal: the packaged pinned runtime on a run-owned Docker volume behind a local TLS proxy, restarted by the harness (docker stop/start; a fresh container on the same volume). Not Render, not a phone.",
  restarts: [], probes: {}, seen: {}, checks: [], failures: [],
};
function check(name, ok, detail = "") { ev.checks.push({ name, ok: !!ok, detail: redact(detail) }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${redact(detail)}` : ""}`); if (!ok) ev.failures.push(redact(name)); }
async function until(fn, timeoutMs, stepMs = 200) { const end = Date.now() + timeoutMs; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await sleep(stepMs); } return null; }
const overall = setTimeout(() => { console.error(`w4-rehearsal: the run exceeded --max-minutes ${MAX_MS / 60_000}`); process.exit(1); }, MAX_MS);

// ---------- restart requests to the harness ----------
// A failed restart or probe action stops the rehearsal: no further restart or probe is requested after it.
class Abort extends Error {}
function mustSucceed(name, ok, res, detail) {
  check(name, ok, JSON.stringify({ ok: res.ok, ...detail, why: res.why }));
  if (!ok) throw new Abort(`the harness reported a failed ${res.action ?? "action"} (${res.why ?? "see the check above"}); no further restart or probe was requested`);
}
let seqN = 0;
async function harness(action, timeoutMs = 120_000) {
  const seq = ++seqN, done = join(CTL, `done-${seq}`);
  writeFileSync(join(CTL, "req.tmp"), `${seq} ${action}\n`);
  writeFileSync(join(CTL, "req"), readFileSync(join(CTL, "req.tmp")));
  unlinkSync(join(CTL, "req.tmp"));
  const res = await until(() => (existsSync(done) ? JSON.parse(readFileSync(done, "utf8")) : null), timeoutMs, 100);
  const out = res ?? { ok: false, why: `no answer from the harness within ${timeoutMs / 1000} s` };
  ev.restarts.push({ action, ...out });
  return out;
}

// ---------- page helpers ----------
const api = (page, method, path, body) => page.evaluate(async ({ method, path, body }) => {
  const roomId = sessionStorage.getItem("cgn_roomId");
  const r = await fetch(path.replace(":room", roomId), { method, headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { method, path, body });
const QUESTION = (n) => `main[aria-label^="Question ${n} of"]`;
const LOCKED = 'main[aria-label="Answer locked in"], main[aria-label="All your answers are in"]';
const phoneScreen = (page) => page.evaluate(() => {
  if (document.querySelector('[data-testid="mz-reveal-step"]')) return "results";
  const m = document.querySelector('main[aria-label^="Question "], main[aria-label="Answer locked in"], main[aria-label="All your answers are in"]');
  return m ? m.getAttribute("aria-label") : "other";
}).catch(() => "unreadable");
const tvScreen = (page) => page.evaluate(() => (document.querySelector(".mz-tv-top__mid .mz-muted")?.textContent ?? "").trim()).catch(() => "unreadable");
const tvPlaying = (label) => /^Featured question \(Q1 of 10\) · each phone goes at its own pace$/.test(label);
const tvFinished = (label) => /^Game finished/.test(label);
const phoneRows = (page) => page.$$eval('[data-testid="standings-list"] li', (lis) => lis.map((li) => ({ name: (li.querySelector(".mz-standings__name")?.textContent ?? "").trim(), score: (li.querySelector(".mz-standings__score")?.textContent ?? "").trim() }))).catch(() => []);
const tvRows = (page) => page.$$eval("li.mz-tv-row", (lis) => lis.map((li) => ({ name: (li.querySelector(".mz-tv-row__name")?.textContent ?? "").trim(), score: (li.querySelector(".mz-tv-row__score")?.textContent ?? "").trim() }))).catch(() => []);
const toInt = (s) => { const d = String(s).replace(/[^0-9-]/g, ""); return d ? Number(d) : NaN; };
const rowsMatch = (rows, want) => rows.length === Object.keys(want).length && Object.entries(want).every(([n, v]) => typeof v === "number" && rows.some((r) => r.name === n && toInt(r.score) === v));
const banner = (page) => page.locator('[data-testid="mz-conn"]').first().getAttribute("class").catch(() => null);

async function hostRoom(page, name) {
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.getByRole("button", { name: "Host a game" }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 20000 });
  let code = "";
  for (let i = 0; i < 40 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  return code;
}
async function joinAs(page, name, code) {
  await page.goto(`${ORIGIN}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 20000 });
}
async function spectate(page, code) {
  await page.goto(`${ORIGIN}/join`, { waitUntil: "domcontentloaded" });
  await page.locator(".mz-code__input").fill(code);
  await page.getByTestId("watch-spectator").click();
  await page.getByTestId("tv-show").waitFor({ timeout: 20000 });
}
const tokenOf = (page) => page.evaluate(() => sessionStorage.getItem("cgn_token")).catch(() => null);
// Screenshots for the evidence, with every element whose text holds the room code masked (and the TV's join pill).
const SHOTS = join(opt("evidence"), `screens-${RUN}`);
async function shot(page, name, roomCode) {
  try {
    mkdirSync(SHOTS, { recursive: true });
    const mask = [page.locator(".mz-tv-pill"), page.getByRole("button", { name: /^Share room code / })];
    if (roomCode) mask.push(page.getByText(roomCode, { exact: false }));
    await page.screenshot({ path: join(SHOTS, `${name}.png`), mask, maskColor: "#222" });
    ev.screenshots = [...(ev.screenshots ?? []), `${name}.png`];
  } catch (e) { ev.screenshotErrors = [...(ev.screenshotErrors ?? []), `${name}: ${String(e?.message ?? e).split("\n")[0].slice(0, 120)}`]; }
}

// =====================================================================================================================
const browser = await launchChromium();
let exitCode = 1;
try {
  const ctx = async (w, h) => browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
  const hCtx = await ctx(390, 844), gCtx = await ctx(390, 844), tCtx = await ctx(1280, 800);
  for (const c of [hCtx, gCtx, tCtx]) {
    const r = await c.request.post(`${ORIGIN}/beta/enter`, { form: { code: CODE, next: "/" }, maxRedirects: 0 });
    if (r.status() !== 303) throw new Error(`the gate answered ${r.status()}, not 303`);
    for (const ck of await c.cookies()) if (ck.name === "cgn_beta") secrets.add(ck.value);
  }
  const h = await hCtx.newPage(), g = await gCtx.newPage(), tv = await tCtx.newPage();
  // Sockets each page opens (a new one after a restart means its live connection came back).
  const sockets = { host: [], guest: [], tv: [] };
  for (const [k, p] of [["host", h], ["guest", g], ["tv", tv]]) p.on("websocket", (ws) => { const rec = { at: Date.now(), closedAt: null }; sockets[k].push(rec); ws.on("close", () => { rec.closedAt = Date.now(); }); });
  const tag = RUN.slice(-6);
  const hostName = `Host-${tag}`, guestName = `Guest-${tag}`;
  const code = await hostRoom(h, hostName); secrets.add(code);
  await joinAs(g, guestName, code);
  await spectate(tv, code);
  const hostToken = (await tokenOf(h)) ?? "", guestToken = (await tokenOf(g)) ?? "";
  for (const t of [hostToken, guestToken]) if (t) secrets.add(t);
  const roomId = (await h.evaluate(() => sessionStorage.getItem("cgn_roomId"))) ?? "";
  const hostApi = async (method, path, body) => {
    const r = await hCtx.request.fetch(`${ORIGIN}${path.replace(":room", roomId)}`, { method, headers: { "content-type": "application/json", "x-session-token": hostToken }, ...(body ? { data: JSON.stringify(body) } : {}), failOnStatusCode: false, maxRedirects: 0 });
    return { status: r.status(), body: await r.json().catch(() => ({})) };
  };
  const hostProj = async () => (await hostApi("GET", "/rooms/:room/projection?audience=player")).body;
  const guestProj = async () => (await api(g, "GET", "/rooms/:room/projection?audience=player")).body;
  const startTrivia = async (label) => {
    const p = await hostProj();
    return hostApi("POST", "/rooms/:room/games", { gameId: "trivia", official: false, roster: p.readiness?.wouldPlay, attempt: { id: `w4-${RUN}-${label}`, sessionRevision: p.session?.revision } });
  };
  const answerAll = async (who, gid, choice) => {
    const proj = who === "host" ? await hostProj() : await guestProj();
    const gm = proj.myGames?.find((x) => x.id === gid);
    for (const q of gm?.state?.questions ?? []) {
      if (gm.state?.myAnswers?.[q.id] !== undefined) continue;
      const body = { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId, gameInstanceId: gid, action: "trivia-answer", payload: { questionId: q.id, chosenIndex: choice } } };
      if (who === "host") await hostApi("POST", "/rooms/:room/intents", body); else await api(g, "POST", "/rooms/:room/intents", body);
    }
  };

  // ---- S: the Memory Book seed (a finished first round, and a saved note citing it) ----
  const s1 = await startTrivia("seed");
  const gid1 = s1.body?.gameId;
  await passBriefing([h, g]);
  await answerAll("host", gid1, 1); await answerAll("guest", gid1, 0);
  const fin1 = await until(async () => { const x = (await guestProj()).myGames?.find((y) => y.id === gid1); return x?.status === "finished" ? x : null; }, 20000);
  const seedText = `W4 rehearsal seed note ${tag}`;
  const note = await hostApi("POST", "/rooms/:room/memory", { text: seedText, day: 1, requestId: randomUUID(), fromGame: gid1 });
  const book0 = await hostApi("GET", "/rooms/:room/memory");
  const entries = (b) => (Array.isArray(b) ? b : b?.entries ?? []);
  const seedId = note.body?.id;
  ev.seen.seed = { firstRound: fin1 ? "finished" : "not finished", noteStatus: note.status, noteId: seedId ?? null };
  check("S a first round finished and a synthetic Memory Book note citing it was saved and reads back (API)", !!fin1 && (note.status === 200 || note.status === 201) && note.body?.text === seedText && entries(book0.body).some((e) => e.id === seedId && e.text === seedText), JSON.stringify({ round: !!fin1, status: note.status, readBack: entries(book0.body).some((e) => e.id === seedId) }));

  // ---- P: a second round, mid-play, with acknowledged answers ----
  const s2 = await startTrivia("play");
  const gid = s2.body?.gameId;
  await passBriefing([h, g]);
  await g.locator(`${QUESTION(1)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 30000 });
  await h.locator(`${QUESTION(1)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 30000 });
  await until(async () => tvPlaying(await tvScreen(tv)), 20000);
  const guest0 = (await guestProj()).players.find((p) => p.displayName === guestName);
  const host0 = (await hostProj()).players.find((p) => p.displayName === hostName);
  await g.locator(`${QUESTION(1)} .mz-slab:not([disabled])`).first().click();
  await h.locator(`${QUESTION(1)} .mz-slab:not([disabled])`).nth(1).click();
  const gAck = await until(async () => (await g.locator(LOCKED).count()) > 0, 15000);
  const hAck = await until(async () => (await h.locator(LOCKED).count()) > 0, 15000);
  const answersOf = async (who) => Object.keys(((who === "host" ? await hostProj() : await guestProj()).myGames ?? []).find((x) => x.id === gid)?.state?.myAnswers ?? {});
  const acked = { guest: await answersOf("guest"), host: await answersOf("host") };
  check("P a second round is playing; host and guest each answered question 1 and saw it locked in (acknowledged, rendered), recorded once (API)", s2.status === 201 && !!gAck && !!hAck && acked.guest.length === 1 && acked.host.length === 1, JSON.stringify({ start: s2.status, guestLocked: !!gAck, hostLocked: !!hAck, recorded: { guest: acked.guest.length, host: acked.host.length } }));
  await g.getByRole("button", { name: /^Next question$/ }).click();
  await g.locator(`${QUESTION(2)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 15000 });

  // The checks after each restart: identity (harness), continuity and answers (API), sockets back, screens (rendered).
  const afterRestart = async (label, res, expect) => {
    check(`${label} the service is back with the pinned revision (harness: ${res.action ?? "?"}, container ${res.container ?? "?"})`, res.ok === true && res.revision === "7097ac2bb062925bb296a129f4771f1e68fd522d", JSON.stringify({ ok: res.ok, revision: res.revision, why: res.why, ms: res.ms }));
    const since = res.at ?? Date.now();
    const fresh = (k) => sockets[k].some((s) => s.at >= since - 1000 && s.closedAt === null);
    const back = await until(async () => (fresh("host") && fresh("guest") && fresh("tv") ? true : null), 30000);
    check(`${label} each page (host, guest, TV) opened a new live socket after the restart`, !!back, JSON.stringify({ host: fresh("host"), guest: fresh("guest"), tv: fresh("tv") }));
    const gp = await guestProj().catch(() => ({})), hp = await hostProj().catch(() => ({}));
    const gNow = gp.players?.find((p) => p.displayName === guestName), hNow = hp.players?.find((p) => p.displayName === hostName);
    const gGame = gp.myGames?.find((x) => x.id === gid), hGame = hp.myGames?.find((x) => x.id === gid);
    check(`${label} the same room, the same two seats and the same round, still playing (API)`, gp.roomId === roomId && gNow?.id === guest0?.id && hNow?.id === host0?.id && gGame?.status === "playing" && hGame?.status === "playing", JSON.stringify({ sameRoom: gp.roomId === roomId, guestSeat: gNow?.id === guest0?.id, hostSeat: hNow?.id === host0?.id, status: gGame?.status ?? null }));
    const gA = Object.keys(gGame?.state?.myAnswers ?? {}), hA = Object.keys(hGame?.state?.myAnswers ?? {});
    check(`${label} the acknowledged answers are kept, each once (guest ${expect.guest}, host ${expect.host}) (API)`, gA.length === expect.guest && hA.length === expect.host && acked.guest.every((q) => gA.includes(q)) && acked.host.every((q) => hA.includes(q)), JSON.stringify({ guest: gA.length, host: hA.length }));
    const gScr = (await until(async () => { const x = await phoneScreen(g); return (await banner(g))?.includes("reconnecting") ? null : x; }, 20000)) ?? await phoneScreen(g);
    const hScr = await phoneScreen(h), tScr = (await until(async () => { const x = await tvScreen(tv); return tvPlaying(x) ? x : null; }, 20000)) ?? await tvScreen(tv);
    ev.seen[label] = { guestScreen: gScr, hostScreen: hScr, tvScreen: tScr };
    // A screen counts only with its own new live socket: a page left showing the old state (no connection back) fails.
    check(`${label} each screen shows the playing round on a new live connection (rendered): guest ${expect.guestScreen}, host locked in, TV the featured question`, fresh("guest") && gScr === expect.guestScreen && fresh("host") && /Answer locked in|All your answers are in/.test(hScr) && fresh("tv") && tvPlaying(tScr), JSON.stringify({ guest: gScr, host: hScr, tv: tScr, live: { guest: fresh("guest"), host: fresh("host"), tv: fresh("tv") } }));
  };
  // Play continues after a restart: the host answers its next question in its own page, and the server acknowledges it.
  const hostAnswersNext = async (label, n) => {
    await h.getByRole("button", { name: /^Next question$/ }).click({ timeout: 10000 }).catch(() => {});
    const shown = await h.locator(`${QUESTION(n)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    if (shown) await h.locator(`${QUESTION(n)} .mz-slab:not([disabled])`).nth(1).click().catch(() => {});
    const locked = shown && await until(async () => (await h.locator(LOCKED).count()) > 0, 15000);
    const after = await answersOf("host").catch(() => []);
    if (locked) acked.host = after;
    check(`${label} play continues: the host answers question ${n} in its own page after the restart, locked in (rendered), recorded once (API)`, !!locked && after.length === n, JSON.stringify({ shown, locked: !!locked, recorded: after.length }));
  };

  // ---- R1: the same container stopped (an unconfirmed tap while down) and started ----
  say("R1: stop the container (graceful SIGTERM); the guest taps while it is down; start it again");
  const stop1 = await harness("stop");
  mustSucceed("R1 the container stopped gracefully: the harness read it back as exited with exit code 0, not forced or OOM-killed (harness)", stop1.ok === true && stop1.graceful === true, stop1, { graceful: stop1.graceful, state: stop1.state });
  const down = await until(async () => ((await banner(g)) ?? "").includes("reconnecting"), 20000);
  await g.locator(`${QUESTION(2)} .mz-slab:not([disabled])`).first().click();
  // The phone retries for about 1.6 s; then it shows its message for the tap. Read what it actually says.
  const tapMessage = await until(async () => { const t = await g.locator('[role="alert"]').allTextContents().catch(() => []); const m = t.map((x) => x.trim()).filter(Boolean); return m.length ? m.join(" | ") : null; }, 15000);
  const falselyIn = (await g.locator(LOCKED).count()) > 0;
  ev.seen.r1TapMessageWhileDown = tapMessage ?? "(no message)";
  check("R1 while the service was down the guest's screen said it was reconnecting, and the tap was NOT shown as in (rendered)", stop1.ok === true && !!down && !falselyIn && !!tapMessage, JSON.stringify({ stop: stop1.state ?? stop1.why, banner: !!down, shownIn: falselyIn, message: tapMessage }));
  // An observation, not a pass condition: the wording a player sees for a tap made during the restart.
  console.log(`NOTE R1 the phone's message for the tap made while the service was down: "${tapMessage ?? "(none)"}" (the friendly wording would be: "We couldn’t confirm that — check your connection. If it doesn’t show as in, try again.")`);
  const start1 = await harness("start");
  mustSucceed("R1 the same container started again: it was stopped before, and a new start is recorded (harness)", start1.ok === true && start1.restarted === true, start1, { restarted: start1.restarted, container: start1.container });
  start1.at = Date.now() - (start1.ms ?? 0);
  await afterRestart("R1", start1, { guest: 1, host: 1, guestScreen: "Question 2 of 10" });
  check("R1 the unconfirmed tap was not saved: question 2 is not recorded for the guest (API)", (await answersOf("guest")).length === 1, `${(await answersOf("guest")).length} recorded`);
  await g.locator(`${QUESTION(2)} .mz-slab:not([disabled])`).first().click();
  const q2 = await until(async () => (await g.locator(LOCKED).count()) > 0, 15000);
  acked.guest = await answersOf("guest");
  check("R1 the guest answered question 2 again after the restart: locked in (rendered), recorded once (API)", !!q2 && acked.guest.length === 2, `${acked.guest.length} recorded`);
  await hostAnswersNext("R1", 2);

  // ---- R2: a fresh container on the same data (the negative control: on empty data) ----
  const freshAction = CONTROL === "empty-data" ? "fresh-empty" : "fresh";
  say(`R2: a fresh container of the same image on ${CONTROL === "empty-data" ? "a NEW, EMPTY volume (negative control)" : "the SAME data"}`);
  const fresh = await harness(freshAction);
  mustSucceed("R2 the old container stopped gracefully, was removed and confirmed gone, and no container used the data before the replacement started (harness)", fresh.ok === true && fresh.graceful === true && fresh.oldRemoved === true && fresh.volumeFree === true, fresh, { graceful: fresh.graceful, oldRemoved: fresh.oldRemoved, volumeFree: fresh.volumeFree, old: fresh.oldContainer, new: fresh.container });
  fresh.at = Date.now() - (fresh.ms ?? 0);
  await afterRestart("R2", fresh, { guest: 2, host: 2, guestScreen: "Answer locked in" });
  await hostAnswersNext("R2", 3);
  for (const [n, p] of [["r2-host", h], ["r2-guest", g], ["r2-tv", tv]]) await shot(p, n, code);
  const book2 = await hostApi("GET", "/rooms/:room/memory").catch(() => ({ status: 0, body: {} }));
  check("R2 the seeded Memory Book note still reads back after the fresh container (API)", book2.status === 200 && entries(book2.body).some((e) => e.id === seedId && e.text === seedText), JSON.stringify({ status: book2.status, found: entries(book2.body).some((e) => e.id === seedId) }));

  if (CONTROL !== "empty-data") {
    // ---- L and G: the one-writer lock and the rollback guard ----
    const lock = await harness("lock-probe");
    ev.probes.lock = lock;
    mustSucceed("L a second server process on the same data, in the running container, is refused by the one-writer lock (harness)", lock.ok === true && lock.exit === 2 && /is using this data directory/.test(lock.output ?? ""), lock, { exit: lock.exit, output: (lock.output ?? "").slice(0, 160) });
    const guard = await harness("guard-probe", 240_000);
    ev.probes.guard = guard;
    mustSucceed("G the rollback guard: the probe's own container (a fixture volume holding only the authorization record, never the data volume) with another public origin exited 78 with REFUSED before its deadline; its teardown was confirmed; the data volume's only user before and after was the container under test (harness)",
      guard.ok === true && guard.exit === 78 && /REFUSED: MCHEZO_PUBLIC_ORIGIN is not the authorized origin/.test(guard.output ?? "") && guard.serverStarted === false && guard.dataVolume?.onlyTheWriterBefore === true && guard.dataVolume?.onlyTheWriterAfter === true,
      guard, { exit: guard.exit, serverStarted: guard.serverStarted, mode: guard.mode, deadlineS: guard.deadlineS, dataVolume: guard.dataVolume, teardown: guard.teardown, teardownMs: guard.teardownMs, ms: guard.ms, output: (guard.output ?? "").slice(0, 160) });

    // ---- F: finish the round; the server's record, then each screen's rendered result ----
    say("F: the guest finishes through the UI, the host through the API");
    await g.getByRole("button", { name: /^Next question$/ }).click();
    for (let n = 3; n <= 10; n++) {
      await g.locator(`${QUESTION(n)} .mz-slab:not([disabled])`).first().waitFor({ timeout: 15000 });
      await g.locator(`${QUESTION(n)} .mz-slab:not([disabled])`).first().click();
      await g.locator(LOCKED).first().waitFor({ timeout: 15000 });
      if (n < 10) await g.getByRole("button", { name: /^Next question$/ }).click();
    }
    await answerAll("host", gid, 1);
    const fin = await until(async () => { const x = (await guestProj()).myGames?.find((y) => y.id === gid); return x?.status === "finished" ? x : null; }, 20000);
    const qs = fin?.state?.questions ?? [], mine = fin?.state?.myAnswers ?? {}, recorded = fin?.rawScores ?? {};
    const expected = qs.reduce((s, q) => s + (typeof q.correctIndex === "number" && mine[q.id] === q.correctIndex ? 120 : 0), 0);
    check("F the round finished with all 10 of the guest's answers recorded once, and its score equal to the score of the recorded answers (API)", !!fin && Object.keys(mine).length === 10 && recorded[guest0?.id] === expected && qs.every((q) => typeof q.correctIndex === "number"), JSON.stringify({ recorded: Object.keys(mine).length, score: recorded[guest0?.id], expected }));
    const want = { [hostName]: recorded[host0?.id], [guestName]: recorded[guest0?.id] };
    const asSeenBy = (self) => Object.fromEntries(Object.entries(want).map(([n, v]) => [n === self ? "You" : n, v]));
    const tvFinal = await until(async () => { if (!tvFinished(await tvScreen(tv))) return null; await tv.getByRole("tab", { name: "Leaderboard" }).click({ timeout: 2000 }).catch(() => {}); return rowsMatch(await tvRows(tv), want); }, 20000);
    const phoneFinal = (page, self) => until(async () => { if ((await phoneScreen(page)) !== "results") return null; await page.locator('[data-testid="mz-reveal-standings"]').click({ timeout: 2000 }).catch(() => {}); return rowsMatch(await phoneRows(page), asSeenBy(self)); }, 20000);
    const hostFinal = await phoneFinal(h, hostName), guestFinal = await phoneFinal(g, guestName);
    ev.seen.final = { recorded: want, distinctScores: want[hostName] !== want[guestName], tv: await tvRows(tv), host: await phoneRows(h), guest: await phoneRows(g) };
    for (const [n, p] of [["final-host", h], ["final-guest", g], ["final-tv", tv]]) await shot(p, n, code);
    check("F the TV's screen (rendered) shows the finished round with every recorded score", !!tvFinal, JSON.stringify(ev.seen.final.tv));
    check("F the host's screen (rendered) shows the finished round with every recorded score", !!hostFinal, JSON.stringify(ev.seen.final.host));
    check("F the guest's screen (rendered) shows the finished round with every recorded score", !!guestFinal, JSON.stringify(ev.seen.final.guest));
  }
  exitCode = ev.failures.length ? 1 : 0;
} catch (e) {
  if (e instanceof Abort) { ev.aborted = e.message; console.log(`ABORTED ${e.message}`); }
  else check(`the run completed (${String(e?.message ?? e).split("\n")[0].slice(0, 160)})`, false);
  exitCode = 1;
} finally {
  clearTimeout(overall);
  await browser.close().catch(() => {});
  ev.finishedAt = new Date().toISOString(); ev.durationS = Math.round((Date.now() - T0) / 1000);
  ev.verdict = ev.failures.length ? "FAILED" : "PASSED";
  mkdirSync(opt("evidence"), { recursive: true });
  const out = redact(JSON.stringify(ev, null, 1));
  const leaked = [...secrets].filter((x) => x && x.length >= 6 && out.includes(x)).length;
  const file = join(opt("evidence"), `w4-${RUN}.json`);
  writeFileSync(file, out + "\n");
  if (leaked) { console.log(`FAIL the evidence holds ${leaked} secret value(s)`); exitCode = 1; }
  console.log(`evidence: ${file}`);
  if (CONTROL) console.log(`CONTROL ${CONTROL}: failed checks: ${ev.failures.length ? ev.failures.join(" | ") : "(none)"}`);
  console.log(`W4 REHEARSAL ${exitCode === 0 ? "PASSED" : "FAILED"}${ev.failures.length ? ` (${ev.failures.length} failure(s))` : ""}`);
  process.exit(exitCode);
}
