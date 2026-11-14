// Stage 12.2 (docs/stage12/stage122.md §4; D-S122-04): a room's starting content follows the HOST's pinned look, once,
// at creation. Never live, never a guest's look.
//   - A host whose phone is pinned to the Christmas look sees a line on the Host screen and gets a room that deals
//     Christmas content; the host can still switch to Everyday in the lobby.
//   - A host on "Match the game" (auto) or pinned Everyday sees no line and gets Everyday (unchanged).
//   - A guest with the Christmas look joining an Everyday room changes nothing.
// Usage: node scripts/check-content-look.mjs <baseUrl>   (the gate passes its server)
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failures++; }
async function soon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { const v = await fn(); if (v) { check(label, true); return v; } } catch (e) { last = e; } await sleep(200); }
  check(label, false, `not within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`); return null;
}
/** This page's own view of its room. */
const myRoom = (page) => page.evaluate(async () => {
  const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=player`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } });
  return r.json();
});

const browser = await launchChromium();
/** A phone with its look pinned (or left on "Match the game" when look is null). */
async function phone(look) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (look) await ctx.addInitScript((v) => { try { localStorage.setItem("mz_look", v); } catch { /* none */ } }, look);
  return ctx.newPage();
}
async function host(page, name) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("home-host").click();
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  const note = await page.getByTestId("host-content-note").count();
  await page.getByRole("button", { name: "Host a game", exact: true }).click();
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) { code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim(); if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(300); }
  return { note, code };
}

try {
  // ---- A pinned Christmas host ----
  const xmas = await phone("christmas");
  await xmas.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await xmas.getByTestId("host-screen").waitFor({ timeout: 15000 });
  check("A Christmas host: the Host screen says the questions start as Christmas ones", /Christmas look/.test(await xmas.getByTestId("host-content-note").innerText()) && /switch to Everyday in the lobby/.test(await xmas.getByTestId("host-content-note").innerText()));
  await xmas.screenshot({ path: screenshotPath("docs/stage12/stage122-screenshots/host-christmas-note-390.png") });
  const a = await host(xmas, "Keku");
  check("A the room deals Christmas content from the start", (await myRoom(xmas)).contentSeason === "christmas");
  // The host can still switch, as before (the lobby's content control).
  const room = await myRoom(xmas);
  const sw = await xmas.evaluate(async ({ roomId, rev }) => {
    const r = await fetch(`/rooms/${roomId}/season`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") ?? "" }, body: JSON.stringify({ season: "everyday", baseRevision: rev }) });
    return r.status;
  }, { roomId: room.roomId, rev: room.session?.revision ?? 0 });
  await soon("A the host can still switch it to Everyday", async () => sw === 200 && (await myRoom(xmas)).contentSeason === "everyday");

  // ---- Auto ("Match the game") and pinned Everyday hosts: unchanged ----
  for (const [label, look] of [["auto", null], ["Everyday", "everyday"]]) {
    const p = await phone(look);
    const b = await host(p, "Ama");
    check(`B ${label} host: no line, and the room deals Everyday content`, b.note === 0 && (await myRoom(p)).contentSeason === "everyday");
    // ---- A guest with the Christmas look never changes the room ----
    if (label === "auto") {
      const g = await phone("christmas");
      await g.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
      await g.getByPlaceholder("e.g. Auntie June").fill("Baraka");
      await g.locator(".mz-code__input").fill(b.code);
      await g.getByRole("button", { name: "Join the game" }).click();
      await g.getByRole("heading", { name: "You’re in, Baraka." }).waitFor({ timeout: 15000 });
      await sleep(800);
      check("C a guest with the Christmas look joining an Everyday room changes nothing", (await myRoom(g)).contentSeason === "everyday" && (await myRoom(p)).contentSeason === "everyday");
    }
  }
  check("A the Christmas host's room code is real", /^[A-Z0-9]{6}$/.test(a.code));
} catch (e) {
  check("driver ran to the end", false, String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "CONTENT LOOK ALL PASSED" : `CONTENT LOOK: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
