// Handoff 7065498313 (D-UI-02): the owner-selected compact mix, live, on phones at 320×568 and 390×844 in both
// looks (Everyday and Christmas), plus a desktop (1280) and a TV (1920).
//   H  Home (Option A's compact list): Join and Host on the first screen, at least 48 px tall; every game row at
//      least 44 px; nothing runs off the side; no text under AA contrast; the keyboard reaches Join, then Host, then
//      the games, each with a visible focus ring (at least 2 px, at least 3:1 against what is behind it).
//   J  A room code that isn't a room: the join screen says so in words, right under Join the game and on screen
//      without scrolling (a new refusal is scrolled into view), inside the width, legibly.
//   L  The lobby, with long names (31–32 characters, one of them a single unbroken word): the room code, who's here
//      and Start on the first screen; the players shown once (the circle; no second list); the next-game card and its
//      chips inside the width; the host's settable chips are 44 px buttons that open one settings sheet from the
//      keyboard (focus moves in; Escape closes it and focus returns to the chip); guests' chips are labels.
//   R  Jebena Rush results after an early exit (both guests leave the match): the podium and the explained standings
//      are exactly the server's standings (places, points, names); the host's dock has Play again (48 px) and More…
//      (keyboard: the sheet opens with Pick another game, Take a break and Back to lobby; Escape returns focus);
//      a guest's dock says who picks next and has Back to lobby; long names wrap inside the podium; no sideways
//      scroll; no text under AA contrast. Then Play again still starts the next match (the dock's main action).
//   M  Save a memory (review 7067254640): the host's is in More… (first in the sheet), with no button of its own under
//      the standings. By keyboard at 320 px in both looks: More… → Save a memory closes the sheet and puts focus in
//      the note; Cancel puts focus back on More…; Save moves focus to the confirmation, and the entry then reads
//      "Your saved memory" and brings the confirmation back. A guest still saves inline (its own button). Both
//      saves are in the server's Memory Book once, pending, citing this match's finish; the cancelled draft isn't.
//   D  Desktop results (1280) and the TV's final (1920): no sideways scroll; the desktop podium is the server's.
// Screenshots of every screen go to MCHEZO_SCREENSHOT_DIR when it's set (the gate sets it).
// Chromium emulation only: no real phones or TVs. Starts ITS OWN server unless given one.
// Usage: node scripts/check-compact-mix.mjs [gateBaseUrl]
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { contrastFailures } from "./lib/contrast.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last = null;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await sleep(150); }
  check(label, false, `not within ${timeout} ms${last ? `: ${String(last.message ?? last).split("\n")[0]}` : ""}`);
  return null;
}
/** `soon`, and a PASS line when it holds (the M steps are the evidence). */
async function sure(label, fn, timeout) { const v = await soon(label, fn, timeout); if (v) check(label, true); return v; }

let srv = null; let DATA = null;
let BASE = process.argv[2] ?? null;
if (!BASE) {
  DATA = mkdtempSync(join(tmpdir(), "mz-mix-"));
  const env = { ...process.env, PORT: "0", MCHEZO_DATA_DIR: DATA };
  delete env.NODE_ENV; delete env.MCHEZO_CONTENT_TEST_MODE; delete env.MCHEZO_LIFECYCLE_SCALE;
  srv = spawn(process.execPath, ["--import", "tsx", "src/server/serve.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; srv.stdout.on("data", (d) => { out += d; }); srv.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 120 && !BASE; i++) { const m = /on http:\/\/localhost:(\d+)/.exec(out); if (m) BASE = `http://localhost:${m[1]}`; else await sleep(250); }
  if (!BASE) { console.log(`FAIL server did not start: ${out.slice(-300)}`); process.exit(1); }
}
async function call(path, { token, body } = {}) {
  const headers = { "content-type": "application/json", "x-mchezo-protocol": "5" };
  if (token) headers["x-session-token"] = token;
  const r = await fetch(`${BASE}${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const LOOKS = ["everyday", "christmas"];
const PHONES = [{ w: 320, h: 568 }, { w: 390, h: 844 }];
// The longest names a seat can have (32), one a single unbroken word after the first name.
const NAMES = { host: "Keku Wolde-Mariam Tesfaye-Haile", a: "Amina Nakimuli-Ssebunya Wanjiru", b: "Baraka Mwangikamauwanjirumuthoni" };

const browser = await launchChromium();
const ctxs = [];
async function phone(v, look, { mobile = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  ctxs.push(ctx);
  await ctx.addInitScript((l) => { try { localStorage.setItem("mz_look", l); } catch { /* none */ } }, look);
  return ctx.newPage();
}
async function seatPage(seat, roomId, v, look, opts) {
  const p = await phone(v, look, opts);
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((x) => { sessionStorage.setItem("cgn_roomId", x.roomId); sessionStorage.setItem("cgn_playerId", x.playerId); sessionStorage.setItem("cgn_token", x.token); }, { roomId, playerId: seat.playerId, token: seat.recoveryToken });
  await p.goto(`${BASE}/room`, { waitUntil: "domcontentloaded" });
  return p;
}
const settle = async (p) => { await p.evaluate(() => document.fonts?.ready).catch(() => {}); await sleep(500); };
const shot = (p, name) => p.screenshot({ path: screenshotPath(`docs/design/compact-mix/shots/${name}.png`) }).catch(() => {});
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const isLook = (p, look) => p.evaluate((l) => document.documentElement.dataset.mzTheme === l, look);

/** In the page: the focused element, its focus ring, and that ring's contrast against what is painted behind it. */
const focusRing = (p) => p.evaluate(() => {
  const parse = (s) => {
    let m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s ?? "");
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
    m = /color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+))?\)/.exec(s ?? "");
    return m ? [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : Number(m[4])] : null;
  };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const painted = (from) => {
    const layers = [];
    for (let cur = from; cur; cur = cur.parentElement) { const c = parse(getComputedStyle(cur).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    const base = parse(getComputedStyle(document.documentElement).backgroundColor) ?? [255, 255, 255, 1];
    return layers.reverse().reduce((acc, l) => over(l, acc), base[3] < 1 ? [255, 255, 255, 1] : base);
  };
  const el = document.activeElement;
  if (!el || el === document.body) return { id: null };
  const cs = getComputedStyle(el);
  const col = parse(cs.outlineColor);
  const inside = parseFloat(cs.outlineOffset) < 0;
  const behind = painted(inside ? el : el.parentElement);
  return {
    id: el.getAttribute("data-testid") ?? `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`,
    width: parseFloat(cs.outlineWidth), style: cs.outlineStyle,
    ratio: col ? Math.round(ratio(over(col, behind), behind) * 100) / 100 : 0,
  };
});
const ringOk = (r) => !!r && r.style !== "none" && r.width >= 2 && r.ratio >= 3;
const ringText = (r) => `${r?.id}: ${r?.style} ${r?.width}px, ${r?.ratio}:1`;
/** Tab until `testid` has focus (at most `max` stops); the stops on the way. */
async function tabTo(p, testid, max = 45) {
  const stops = [];
  for (let i = 0; i < max; i++) {
    await p.keyboard.press("Tab");
    const id = await p.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? null);
    stops.push(id);
    if (id === testid) return stops;
  }
  return null;
}
/** A sheet, once open: fully opaque, on an opaque background (not see-through over the screen behind it). */
const sheetOpaque = (p, id) => p.getByTestId(id).locator(".mz-sheet").evaluate((e) => { const cs = getComputedStyle(e); const a = /rgba\([^)]*,\s*([\d.]+)\)/.exec(cs.backgroundColor); return cs.opacity === "1" && (!a || Number(a[1]) === 1) && cs.backgroundColor !== "rgba(0, 0, 0, 0)"; });
const box = (p, id) => p.getByTestId(id).first().boundingBox().catch(() => null);
const fits = (b, v) => !!b && b.x >= -0.5 && b.x + b.width <= v.w + 0.5;
const onScreen = (b, v) => fits(b, v) && b.y >= -0.5 && b.y + b.height <= v.h + 0.5;

try {
  // ---------- H. Home ----------
  for (const look of LOOKS) for (const v of PHONES) {
    const tag = `${v.w} ${look}`;
    const p = await phone(v, look);
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("home-dock").waitFor({ timeout: 15000 });
    await settle(p);
    check(`H ${tag}: the ${look} look`, await isLook(p, look));
    const [join, host] = [await box(p, "home-join"), await box(p, "home-host")];
    check(`H ${tag}: Join and Host are on the first screen, in full, at least 48 px tall`, onScreen(join, v) && onScreen(host, v) && join.height >= 48 && host.height >= 48, `${Math.round(join?.height)} / ${Math.round(host?.height)} px`);
    const rows = await p.evaluate(() => [...document.querySelectorAll(".mz-gamerow")].map((e) => { const r = e.getBoundingClientRect(); return { h: r.height, right: r.right }; }));
    check(`H ${tag}: every game row is at least 44 px tall and inside the width`, rows.length >= 8 && rows.every((r) => r.h >= 44 && r.right <= v.w + 0.5), `${rows.length} rows, lowest ${Math.round(Math.min(...rows.map((r) => r.h)))} px`);
    check(`H ${tag}: nothing runs off the side`, (await sideways(p)) <= 0);
    const bad = await contrastFailures(p);
    check(`H ${tag}: no text under AA contrast`, bad.length === 0, bad.slice(0, 3).join("; "));
    await shot(p, `home-${v.w}-${look}`);
    // Keyboard: Join, then Host, then (after Play solo) the first game.
    const toJoin = await tabTo(p, "home-join", 8);
    const ringJoin = await focusRing(p);
    await p.keyboard.press("Tab");
    const ringHost = await focusRing(p);
    check(`H ${tag}: the keyboard reaches Join within ${toJoin?.length ?? "∞"} stops, then Host, each with a visible ring`, !!toJoin && ringHost.id === "home-host" && ringOk(ringJoin) && ringOk(ringHost), `${ringText(ringJoin)}; ${ringText(ringHost)}`);
    const toGame = await tabTo(p, "home-featured", 6);
    const ringGame = await focusRing(p);
    check(`H ${tag}: then the games (Featured first), with a visible ring inside the row`, !!toGame && ringOk(ringGame), `${toGame?.join(" → ")}; ${ringText(ringGame)}`);
    if (v.w === 320) await shot(p, `home-${v.w}-${look}-focus-row`);
    await p.context().close();
  }

  // ---------- J. A room code that isn't a room ----------
  for (const look of LOOKS) for (const v of PHONES) {
    const tag = `${v.w} ${look}`;
    const p = await phone(v, look);
    await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await p.getByPlaceholder("e.g. Auntie June").fill(NAMES.a);
    await p.locator(".mz-code__input").fill("ZZZZ22");
    await p.getByRole("button", { name: "Join the game" }).click();
    const err = await soon(`J ${tag}: the join screen shows an error`, async () => ((await p.getByTestId("mz-error").isVisible().catch(() => false)) ? p.getByTestId("mz-error").innerText() : null));
    await sleep(400);
    const eb = await box(p, "mz-error");
    const jb = await p.getByRole("button", { name: "Join the game" }).boundingBox();
    check(`J ${tag}: it says, in words, that the code isn't a room; on screen without scrolling, right under Join the game`, /room|code/i.test(err ?? "") && onScreen(eb, v) && !!jb && eb.y >= jb.y + jb.height - 1, `${JSON.stringify(err)} at ${Math.round(eb?.y)}–${Math.round((eb?.y ?? 0) + (eb?.height ?? 0))} of ${v.h}`);
    check(`J ${tag}: nothing runs off the side; no text under AA contrast`, (await sideways(p)) <= 0 && (await contrastFailures(p)).length === 0);
    await shot(p, `join-error-${v.w}-${look}`);
    await p.context().close();
  }

  // ---------- A casual room with long names; Jebena Rush up next, 3 cups ----------
  const room = (await call("/rooms", { body: { name: "Game night", kind: "casual" } })).body;
  const keku = (await call(`/rooms/${room.roomId}/join`, { body: { displayName: NAMES.host, asHost: true, hostClaimToken: room.hostClaimToken } })).body;
  const amina = (await call("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: NAMES.a } })).body;
  const baraka = (await call("/rooms/join-by-code", { body: { joinCode: room.joinCode, displayName: NAMES.b } })).body;
  check("setup: a casual room with three long-named seats", !!keku.playerId && !!amina.playerId && !!baraka.playerId, JSON.stringify({ k: !!keku.playerId, a: !!amina.playerId, b: !!baraka.playerId }));
  const proj = async (tok) => (await call(`/rooms/${room.roomId}/projection?audience=player`, { token: tok })).body;
  {
    const p = await seatPage(keku, room.roomId, PHONES[1], "everyday");
    await p.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
    await p.getByTestId("choose-game").click();
    await p.getByTestId("select-game-jebena-rush").click();
    await p.getByTestId("lobby-chip-setting").click();
    await p.getByTestId("lobby-hearts-3").click();
    await soon("setup: Jebena Rush is up next, 3 cups each", async () => (await proj(keku.recoveryToken)).lobbySettings?.["jebena-rush"]?.hearts === 3);
    await p.getByTestId("lobby-settings-done").click();
    await p.context().close();
  }

  // ---------- L. The lobby ----------
  // The guests' phones stay open through the lobby and the match (the roster is who's connected).
  const guestA = await seatPage(amina, room.roomId, { w: 390, h: 844 }, "everyday");
  const guestB = await seatPage(baraka, room.roomId, { w: 390, h: 844 }, "everyday");
  for (const g of [guestA, guestB]) await g.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
  for (const look of LOOKS) for (const v of PHONES) {
    const tag = `${v.w} ${look}`;
    const h = await seatPage(keku, room.roomId, v, look);
    const g = await seatPage(amina, room.roomId, v, look);
    for (const p of [h, g]) { await p.getByTestId("up-next-card").waitFor({ timeout: 15000 }); await settle(p); }
    await soon(`L ${tag}: everyone's here`, async () => /Everyone/.test(await h.getByTestId("lobby-status").innerText()));
    // The first screen: the room code, who's here, and Start (the host) / the host's plan (a guest).
    const start = h.getByTestId("lobby-dock").locator(".mz-key").first();
    const sb = await start.boundingBox();
    check(`L ${tag} host: the room code, who's here and Start are on the first screen; Start at least 48 px`, onScreen(await box(h, "share-room"), v) && onScreen(await box(h, "lobby-status"), v) && onScreen(sb, v) && sb.height >= 48 && /^Start Jebena Rush/.test((await start.innerText()).trim()), `${(await start.innerText()).trim()} ${Math.round(sb?.height)} px`);
    check(`L ${tag}: the game mode is on the card (Casual) and in the dock`, /Casual · just for fun/.test(await h.getByTestId("up-next-mode").innerText()) && /Casual game/.test(await h.getByTestId("lobby-dock").innerText()));
    // The players are shown once: the circle. No other element outside it names a guest.
    const elsewhere = await h.evaluate((first) => {
      const main = document.querySelector("main.mz-lobby");
      return [...main.querySelectorAll("*")].filter((e) => e.children.length === 0 && !e.closest(".mz-circle-wrap, [data-testid='lobby-status'], [data-testid='lobby-dock']") && first.some((f) => (e.textContent ?? "").includes(f))).map((e) => (e.textContent ?? "").slice(0, 40));
    }, ["Amina", "Baraka"]);
    const inCircle = await h.evaluate(() => document.querySelectorAll(".mz-circle-wrap").length);
    check(`L ${tag}: the players are shown once, in the circle (no second list)`, inCircle === 1 && elsewhere.length === 0, JSON.stringify(elsewhere));
    // The card and its chips inside the width; the host's chips are buttons; the guest's are labels.
    await h.getByTestId("up-next-card").scrollIntoViewIfNeeded();
    const chips = await h.evaluate(() => { const card = document.querySelector('[data-testid="up-next-card"]').getBoundingClientRect(); return [...document.querySelectorAll(".mz-factchip")].map((c) => { const r = c.getBoundingClientRect(); return { in: r.left >= card.left - 0.5 && r.right <= card.right + 0.5, text: c.textContent.trim().slice(0, 30) }; }).concat([{ in: card.right <= innerWidth + 0.5, text: "card" }]); });
    check(`L ${tag}: the next-game card and every chip fit inside the width`, chips.every((c) => c.in) && (await sideways(h)) <= 0 && (await sideways(g)) <= 0, chips.filter((c) => !c.in).map((c) => c.text).join(", "));
    const targets = {};
    for (const id of ["share-room", "room-menu", "choose-game", "lobby-chip-setting", "lobby-chip-content"]) targets[id] = Math.round((await box(h, id))?.height ?? 0);
    check(`L ${tag} host: the code, menu, Change and the settable chips are at least 44 px tall`, Object.values(targets).every((x) => x >= 44), JSON.stringify(targets));
    check(`L ${tag} guest: the chips are labels (no settings buttons), the cups say 3 cups each`, (await g.getByTestId("lobby-chip-setting").count()) === 0 && (await g.getByTestId("lobby-chip-content").count()) === 0 && /3 cups each/.test(await g.getByTestId("lobby-hearts-guest").innerText()));
    for (const [who, p] of [["host", h], ["guest", g]]) {
      const bad = await contrastFailures(p);
      check(`L ${tag} ${who}: no text under AA contrast`, bad.length === 0, bad.slice(0, 3).join("; "));
    }
    await h.evaluate(() => document.querySelector('[data-testid="lobby-scroll"]')?.scrollTo(0, 0));
    await shot(h, `lobby-${v.w}-${look}-host-top`);
    await h.getByTestId("up-next-card").scrollIntoViewIfNeeded();
    await shot(h, `lobby-${v.w}-${look}-host-card`);
    await g.getByTestId("up-next-card").scrollIntoViewIfNeeded();
    await shot(g, `lobby-${v.w}-${look}-guest-card`);
    // Keyboard: the cups chip opens the settings sheet; Escape closes it and focus comes back to the chip.
    await h.evaluate(() => { document.activeElement?.blur?.(); document.querySelector('[data-testid="lobby-scroll"]')?.scrollTo(0, 0); });
    const toChip = await tabTo(h, "lobby-chip-setting");
    const ringChip = await focusRing(h);
    check(`L ${tag} host: the keyboard reaches the cups chip, with a visible ring`, !!toChip && ringOk(ringChip), `${toChip?.length ?? "∞"} stops; ${ringText(ringChip)}`);
    const chipName = await h.getByTestId("lobby-chip-setting").evaluate((e) => e.innerText.replace(/\s+/g, " ").trim());
    await h.keyboard.press("Enter");
    const opened = await soon(`L ${tag} host: Enter opens the settings sheet, focus inside`, async () => (await h.getByTestId("lobby-settings-sheet").isVisible().catch(() => false)) && h.evaluate(() => !!document.activeElement?.closest('[data-testid="lobby-settings-sheet"]')));
    if (opened) {
      await sleep(500); // the sheet's entrance
      check(`L ${tag} host: the sheet is opaque once open`, await sheetOpaque(h, "lobby-settings-sheet"));
      check(`L ${tag} host: the sheet has the cups choice (3 chosen) and the content choice`, (await h.getByTestId("lobby-hearts").getAttribute("data-hearts")) === "3" && (await h.getByTestId("lobby-content").count()) === 1);
      if (v.w === 320) await shot(h, `lobby-${v.w}-${look}-settings-sheet`);
      await h.keyboard.press("Escape");
      await soon(`L ${tag} host: Escape closes the sheet and focus returns to the chip`, async () => (await h.getByTestId("lobby-settings-sheet").count()) === 0 && (await h.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "lobby-chip-setting");
    }
    check(`L ${tag} host: the chip's name starts with what it shows`, /^3 cups each/.test(chipName), JSON.stringify(chipName));
    await h.context().close(); await g.context().close();
  }

  // ---------- The match, ended early: both guests leave ----------
  const hold = await seatPage(keku, room.roomId, { w: 390, h: 844 }, "everyday");
  await hold.getByTestId("lobby-dock").waitFor({ timeout: 15000 });
  let p0 = null;
  for (let i = 0; i < 60; i++) { p0 = await proj(keku.recoveryToken); if ((p0.readiness?.wouldPlay ?? []).length === 3) break; await sleep(250); }
  const startRes = await call(`/rooms/${room.roomId}/games`, { token: keku.recoveryToken, body: { gameId: "jebena-rush", official: false, roster: p0.readiness?.wouldPlay, attempt: { id: randomUUID(), sessionRevision: p0.session?.revision ?? 0 }, season: p0.contentSeason, settings: { hearts: 3 } } });
  check("R the host starts Jebena Rush with all three", startRes.status === 201, `${startRes.status} ${JSON.stringify(startRes.body).slice(0, 160)}`);
  const gid = startRes.body.gameId;
  await passBriefing([hold, guestA, guestB]);
  const intent = (who, action, payload) => call(`/rooms/${room.roomId}/intents`, { token: who.recoveryToken, body: { intent: { kind: "intent", schemaVersion: 1, clientEventId: randomUUID(), roomId: room.roomId, gameInstanceId: gid, action, payload } } });
  await soon("R the match is on", async () => ((await proj(keku.recoveryToken)).myGames ?? []).find((g) => g.id === gid)?.status === "playing", 25000);
  for (const who of [baraka, amina]) { const r = await intent(who, "abstain", {}); check(`R ${who === baraka ? "Baraka" : "Amina"} leaves the match`, r.body?.accepted === true, JSON.stringify(r.body).slice(0, 120)); }
  const fin = await soon("R the match ends: the one who stayed keeps the jebena", async () => { const g = ((await proj(keku.recoveryToken)).myGames ?? []).find((x) => x.id === gid); return g?.status === "finished" ? g : null; }, 25000);
  const standings = fin?.state?.standings ?? [];
  const nameOf = { [keku.playerId]: NAMES.host, [amina.playerId]: NAMES.a, [baraka.playerId]: NAMES.b };
  const ord = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
  console.log(`  server standings: ${JSON.stringify(standings.map((r) => ({ name: nameOf[r.id]?.split(" ")[0], place: r.place, points: r.points, satOut: r.satOut })))}`);
  /** The podium, step by step: equal to the server's top three (places, points, full names in the accessible name). */
  const podiumOk = async (p, meId) => {
    const shown = await p.getByTestId("jr-podium").locator("li").evaluateAll((ls) => ls.map((l) => ({ id: l.getAttribute("data-testid").replace("jr-podium-", ""), place: Number(l.dataset.place), label: l.getAttribute("aria-label"), top: l.classList.contains("mz-jr-podium__step--top"), fits: l.scrollWidth <= l.clientWidth + 1 })));
    const top = standings.slice(0, 3);
    const want = (top.length === 3 ? [top[1], top[0], top[2]] : [top[1], top[0]]).map((r) => ({ id: r.id, place: r.place, label: `${ord(r.place)}: ${nameOf[r.id]}${r.id === meId ? " (you)" : ""}, ${r.points} points`, top: r.place === 1, fits: true }));
    return { ok: JSON.stringify(shown) === JSON.stringify(want), shown };
  };
  const rowsOk = async (p) => {
    const ids = await p.getByTestId("jr-standings").locator('[data-testid^="jr-row-"]').evaluateAll((ls) => ls.map((l) => [l.getAttribute("data-testid").replace("jr-row-", ""), l.querySelector(".mz-jr-row__pts")?.textContent?.trim()]));
    return JSON.stringify(ids) === JSON.stringify(standings.map((r) => [r.id, String(r.points)]));
  };

  // ---------- R. Results ----------
  for (const look of LOOKS) for (const v of PHONES) {
    const tag = `${v.w} ${look}`;
    const h = await seatPage(keku, room.roomId, v, look);
    const g = await seatPage(amina, room.roomId, v, look);
    for (const p of [h, g]) { await p.getByTestId("jr-podium").waitFor({ timeout: 20000 }); await settle(p); }
    for (const [who, p, me] of [["host", h, keku.playerId], ["guest", g, amina.playerId]]) {
      const pod = await podiumOk(p, me);
      check(`R ${tag} ${who}: the podium is the server's standings (places, points, full names); long names wrap inside their step`, pod.ok, JSON.stringify(pod.shown));
      check(`R ${tag} ${who}: the explained standings are the server's, in its order`, await rowsOk(p));
      check(`R ${tag} ${who}: the one who left says so`, /Left the game/.test(await p.getByTestId("jr-standings").innerText()));
      check(`R ${tag} ${who}: nothing runs off the side`, (await sideways(p)) <= 0);
      const bad = await contrastFailures(p);
      check(`R ${tag} ${who}: no text under AA contrast`, bad.length === 0, bad.slice(0, 3).join("; "));
    }
    const [again, more] = [await box(h, "next-play-again"), await box(h, "next-more")];
    check(`R ${tag} host: the dock has Play again (at least 48 px) and More… (at least 44 px), on screen`, onScreen(again, v) && onScreen(more, v) && again.height >= 48 && more.height >= 44 && (await h.getByTestId("jr-results-dock").getByTestId("show-back-to-lobby").count()) === 0, `${Math.round(again?.height)} / ${Math.round(more?.height)} px`);
    const back = await box(g, "show-back-to-lobby");
    check(`R ${tag} guest: the dock says who picks next and has Back to lobby (at least 48 px), no Play again`, onScreen(back, v) && back.height >= 48 && (await g.getByTestId("next-play-again").count()) === 0 && /picks what’s next/.test(await g.getByTestId("next-status").innerText()), `${Math.round(back?.height)} px`);
    await shot(h, `results-${v.w}-${look}-host`);
    await shot(g, `results-${v.w}-${look}-guest`);
    await h.getByTestId("jr-standings").scrollIntoViewIfNeeded();
    await shot(h, `results-${v.w}-${look}-host-standings`);
    // Keyboard: More… opens the sheet with the rest; Escape returns focus to More….
    await h.evaluate(() => document.activeElement?.blur?.());
    const toMore = await tabTo(h, "next-more", 60);
    const ringMore = await focusRing(h);
    check(`R ${tag} host: the keyboard reaches More… after Play again, with a visible ring`, !!toMore && toMore.at(-2) === "next-play-again" && ringOk(ringMore), `${toMore?.length ?? "∞"} stops; ${ringText(ringMore)}`);
    await h.keyboard.press("Enter");
    const sheet = await soon(`R ${tag} host: Enter opens More, focus inside`, async () => (await h.getByTestId("next-more-sheet").isVisible().catch(() => false)) && h.evaluate(() => !!document.activeElement?.closest('[data-testid="next-more-sheet"]')));
    if (sheet) {
      await sleep(500); // the sheet's entrance
      check(`R ${tag} host: More is opaque once open`, await sheetOpaque(h, "next-more-sheet"));
      const inSheet = await h.getByTestId("next-more-sheet").locator("[data-testid]").evaluateAll((ls) => ls.map((l) => l.getAttribute("data-testid")));
      check(`R ${tag} host: More holds Save a memory (first), Pick another game, Take a break and Back to lobby (Play again stays in the dock)`, inSheet.filter((x) => x !== "next-more-sheet-close")[0] === "next-save-memory" && ["next-choose", "next-break", "show-back-to-lobby"].every((x) => inSheet.includes(x)) && !inSheet.includes("next-play-again"), inSheet.join(", "));
      if (v.w === 320) await shot(h, `results-${v.w}-${look}-more-sheet`);
      await h.keyboard.press("Escape");
      await soon(`R ${tag} host: Escape closes More and focus returns to More…`, async () => (await h.getByTestId("next-more-sheet").count()) === 0 && (await h.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "next-more");
    }
    await h.context().close(); await g.context().close();
  }

  // ---------- M. Save a memory: the host's in More…, a guest's inline (review 7067254640) ----------
  {
    const finEv = ((await call(`/rooms/${room.roomId}/ledger?watermark=1`, { token: keku.recoveryToken })).body.events ?? []).filter((e) => e.type === "game-finished" && e.gameInstanceId === gid).at(-1);
    const book = async () => { const b = (await call(`/rooms/${room.roomId}/memory`, { token: keku.recoveryToken })).body; return Array.isArray(b) ? b : []; };
    const active = (p) => p.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
    const v = PHONES[0];
    const NOTES = { cancelled: "A draft the host cancels", host: "Keku kept the jebena", guest: "Amina's first Jebena Rush" };
    for (const look of LOOKS) {
      const tag = `${v.w} ${look}`;
      const h = await seatPage(keku, room.roomId, v, look);
      await h.getByTestId("jr-podium").waitFor({ timeout: 20000 }); await settle(h);
      check(`M ${tag} host: no Save a memory button under the standings (it is in More…)`, (await h.getByTestId("save-memory-open").count()) === 0 && (await h.getByTestId("save-memory").count()) === 0);
      // More… by keyboard, then Save a memory.
      await h.evaluate(() => document.activeElement?.blur?.());
      const toMore = await tabTo(h, "next-more", 60);
      await h.keyboard.press("Enter");
      await sure(`M ${tag} host: Enter on More… opens the sheet`, async () => h.getByTestId("next-more-sheet").isVisible(), 10000);
      await sleep(500); // the sheet's entrance
      const entry = (await h.getByTestId("next-save-memory").innerText().catch(() => "")).trim();
      const toEntry = await tabTo(h, "next-save-memory", 6);
      const ringEntry = await focusRing(h);
      check(`M ${tag} host: the keyboard reaches More… and then Save a memory in the sheet, with a visible ring`, !!toMore && !!toEntry && entry === "Save a memory" && ringOk(ringEntry), `${JSON.stringify(entry)}; ${toEntry?.join(" → ") ?? "∞"}; ${ringText(ringEntry)}`);
      await shot(h, `results-${v.w}-${look}-more-save-memory`);
      await h.keyboard.press("Enter");
      const opened = await sure(`M ${tag} host: Save a memory closes More and opens the composer, focus in the note`, async () => (await h.getByTestId("next-more-sheet").count()) === 0 && (await active(h)) === "save-memory-note", 10000);
      if (opened) {
        await sleep(300);
        const nb = await box(h, "save-memory-note");
        check(`M ${tag} host: the note is on screen and inside the width; nothing runs off the side`, onScreen(nb, v) && (await sideways(h)) <= 0, `note at ${Math.round(nb?.y)}–${Math.round((nb?.y ?? 0) + (nb?.height ?? 0))} of ${v.h}`);
        check(`M ${tag} host: the composer shows this match's facts`, (await h.getByTestId("save-memory-facts").locator("li").count()) === standings.length);
        const bad = await contrastFailures(h);
        check(`M ${tag} host: no text under AA contrast in the open composer`, bad.length === 0, bad.slice(0, 3).join("; "));
        await shot(h, `results-${v.w}-${look}-save-memory-open`);
      }
      if (look === "everyday") {
        // Cancel: nothing saved, focus back on More….
        await h.keyboard.type(NOTES.cancelled);
        const toCancel = await tabTo(h, "save-memory-cancel", 4);
        await h.keyboard.press("Enter");
        await sure(`M ${tag} host: Cancel (by keyboard${toCancel ? "" : ", not reached"}) closes the composer and focus returns to More…`, async () => (await h.getByTestId("save-memory").count()) === 0 && (await active(h)) === "next-more", 10000);
        // Again, and Save: focus moves to the confirmation.
        await h.keyboard.press("Enter");
        await sure(`M ${tag} host: More… opens again from the keyboard`, async () => h.getByTestId("next-more-sheet").isVisible(), 10000);
        await tabTo(h, "next-save-memory", 6);
        await h.keyboard.press("Enter");
        await sure(`M ${tag} host: …Save a memory: the composer, empty, focus in the note`, async () => (await active(h)) === "save-memory-note" && (await h.getByTestId("save-memory-note").inputValue()) === "", 10000);
        await h.keyboard.type(NOTES.host);
        await tabTo(h, "save-memory-save", 4);
        await h.keyboard.press("Enter");
        const saved = await sure(`M ${tag} host: Save: saved, focus on the confirmation`, async () => /Saved to the Memory Book\. Approve it there/.test(await h.getByTestId("save-memory-saved").innerText().catch(() => "")) && (await active(h)) === "save-memory-saved", 15000);
        if (saved) await shot(h, `results-${v.w}-${look}-save-memory-saved`);
        // The entry now says the memory is saved, and brings the confirmation back.
        await h.getByTestId("next-more").click();
        await sure(`M ${tag} host: More… now reads "Your saved memory"`, async () => (await h.getByTestId("next-save-memory").innerText().catch(() => "")).trim() === "Your saved memory", 10000);
        await h.getByTestId("next-save-memory").click();
        await sure(`M ${tag} host: …which closes More and puts focus on the confirmation`, async () => (await h.getByTestId("next-more-sheet").count()) === 0 && (await active(h)) === "save-memory-saved", 10000);
      } else {
        // The other look checks the way in and out: Cancel (by pointer) puts focus back on More….
        await h.getByTestId("save-memory-cancel").click();
        await sure(`M ${tag} host: Cancel closes the composer and focus returns to More…`, async () => (await h.getByTestId("save-memory").count()) === 0 && (await active(h)) === "next-more", 10000);
      }
      await h.context().close();
    }
    // A guest (Christmas, 320): the composer's own button, as before; Save, confirmation focused.
    {
      const tag = `${v.w} christmas`;
      const g = await seatPage(amina, room.roomId, v, "christmas");
      await g.getByTestId("jr-podium").waitFor({ timeout: 20000 }); await settle(g);
      check(`M ${tag} guest: no More…; the results keep their own Save a memory button`, (await g.getByTestId("next-more").count()) === 0 && (await g.getByTestId("save-memory-open").isVisible()));
      await g.evaluate(() => document.activeElement?.blur?.());
      const toOpen = await tabTo(g, "save-memory-open", 60);
      await g.keyboard.press("Enter");
      await sure(`M ${tag} guest: the keyboard${toOpen ? "" : " (not reached)"} opens the composer, focus in the note`, async () => (await active(g)) === "save-memory-note", 10000);
      await g.keyboard.type(NOTES.guest);
      await tabTo(g, "save-memory-save", 4);
      await g.keyboard.press("Enter");
      await sure(`M ${tag} guest: Save: saved (the host approves it), focus on the confirmation`, async () => /Saved to the Memory Book/.test(await g.getByTestId("save-memory-saved").innerText().catch(() => "")) && (await active(g)) === "save-memory-saved", 15000);
      check(`M ${tag} guest: nothing runs off the side`, (await sideways(g)) <= 0);
      await shot(g, `results-${v.w}-christmas-guest-save-memory-saved`);
      await g.context().close();
    }
    const b = await book();
    const one = (text, by) => { const es = b.filter((x) => x.text === text); return es.length === 1 && es[0].approved === false && es[0].addedBy === by && JSON.stringify(es[0].sourceEventIds) === JSON.stringify([finEv?.eventId]); };
    check("M the server's Memory Book: the host's and the guest's saves, once each, pending, citing this match's finish; the cancelled draft saved nothing", !!finEv && one(NOTES.host, keku.playerId) && one(NOTES.guest, amina.playerId) && !b.some((x) => x.text === NOTES.cancelled), JSON.stringify(b.map((x) => ({ t: x.text, a: x.approved, by: x.addedBy === keku.playerId ? "host" : x.addedBy === amina.playerId ? "guest" : x.addedBy }))));
  }

  // ---------- D. Desktop and TV ----------
  {
    const d = await seatPage(keku, room.roomId, { w: 1280, h: 800 }, "everyday", { mobile: false });
    await d.getByTestId("jr-podium").waitFor({ timeout: 20000 }); await settle(d);
    const pod = await podiumOk(d, keku.playerId);
    check("D desktop 1280: the podium is the server's; nothing runs off the side; Play again on screen", pod.ok && (await sideways(d)) <= 0 && onScreen(await box(d, "next-play-again"), { w: 1280, h: 800 }), JSON.stringify(pod.shown));
    await shot(d, "results-desktop-1280-everyday");
    const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); ctxs.push(tvCtx);
    const tv = await tvCtx.newPage();
    await tv.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
    await tv.locator(".mz-code__input").fill(room.joinCode);
    await tv.getByTestId("watch-spectator").click();
    await tv.getByTestId("tv-jr-final").waitFor({ timeout: 20000 }); await settle(tv);
    check("D TV 1920: the final shows; nothing runs off the side", (await sideways(tv)) <= 0);
    await shot(tv, "tv-final-1920-everyday");
    // Play again, from the dock, still starts the next match (with the same 3 cups).
    await d.getByTestId("next-play-again").click();
    const again = await soon("D Play again (the dock's main action) starts the next match", async () => ((await proj(keku.recoveryToken)).games ?? []).find((x) => x.gameId === "jebena-rush" && x.id !== gid) ?? null, 20000);
    check("D …with the same 3 cups each, in its briefing", again?.settings?.hearts === 3 && again?.status === "briefing", JSON.stringify({ settings: again?.settings, status: again?.status }));
    await soon("D …and the desktop shows that briefing: everyone starts with 3 cups", async () => /starts with 3 cups/.test(await d.getByTestId("briefing-hearts").innerText()), 20000);
  }
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  for (const c of ctxs) await c.close().catch(() => {});
  await browser.close().catch(() => {});
  if (srv) srv.kill("SIGTERM");
  if (DATA) rmSync(DATA, { recursive: true, force: true });
}
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
