// Stage 1 lobby fixes (owner-approved 2026-11-07; docs/ux-redesign/AUDIT.md).
// Proves, through the real UI at real phone sizes:
//   - V1/V6: the lobby title never overlaps the Cup badge; seat tokens never
//     touch the centre disc; the up-next name stays inside the disc
//     (5 viewport sizes, 10 players with long names, the longest game title);
//   - F3: Official and Practice look different when selected (fill + check),
//     and expose aria-pressed;
//   - D1: a lone host choosing Official sees why it can't count and an
//     explicit "Play it as practice instead" button; the server refuses an
//     official one-player start with 409 OFFICIAL_NEEDS_TWO;
//   - F2: the room-code Share control opens the invite sheet; Copy link gives
//     visible feedback, and without clipboard access the link is shown instead;
//   - V2: theme-color and the document background are the Mchezo ground;
//   - F7/F8: no dead Sound switch; Animations "Off" also applies on the landing page;
//   - F5: advancing the Cup day asks first; "Not yet" changes nothing.
// Usage: build:web, serve on a port (test content mode), then:
//   node scripts/check-lobby-fixes.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";
import { closeRoomMenu, openRoomMenu, roomGo } from "./lib/room-nav.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const SIZES = [[390, 664], [393, 659], [375, 553], [412, 780], [360, 640]];
const LONG = ["Amina-Josephine Wanjiku", "Bartholomew Otieno", "Christabel Nyambura", "Dmitri Kiprotich", "Esperanza Wambui", "Fitzgerald Mwangi", "Gwendolyn Achieng", "Maximilian Ochieng", "Ngozi Adebayo-Smith"];

async function createRoom(page, name) {
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
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
async function joinByHttp(code, name) {
  const r = await fetch(`${BASE}/rooms/join-by-code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ joinCode: code, displayName: name }) });
  if (!r.ok) throw new Error(`join ${name}: ${r.status}`);
}
/** Geometry of the lobby: returns a list of problems (empty = fine). */
const lobbyProblems = (page) => page.evaluate(() => {
  const out = [];
  const R = (el) => el.getBoundingClientRect();
  const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const h1 = document.querySelector(".mz-h1");
  for (const el of document.querySelectorAll(".mz-topbar > *")) if (h1 && overlap(R(h1), R(el))) out.push(`title overlaps top bar item "${el.textContent.trim().slice(0, 30)}"`);
  const disc = document.querySelector(".mz-circle__center");
  if (disc) {
    const d = R(disc); const cx = d.left + d.width / 2, cy = d.top + d.height / 2, rd = d.width / 2;
    for (const t of document.querySelectorAll(".mz-seat .mz-token")) {
      const r = R(t); const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
      if (Math.hypot(tx - cx, ty - cy) < rd + r.width / 2 - 0.5) out.push(`a seat token touches the centre disc (${t.textContent.trim()})`);
    }
    // Stage 2: the disc shows how many are in the room; the up-next game moved to its own card.
    for (const n of document.querySelectorAll(".mz-circle__center .mz-circle__num, .mz-circle__center .mz-circle__label")) {
      const r = R(n);
      if (r.width > d.width + 0.5) out.push(`"${n.textContent}" is wider than the centre disc`);
      for (const s of document.querySelectorAll(".mz-seat__btn, .mz-seat__name")) if (overlap(r, R(s))) out.push(`"${n.textContent}" overlaps a seat`);
    }
  }
  const card = document.querySelector('[data-testid="up-next-card"]');
  if (card) {
    for (const s of document.querySelectorAll(".mz-seat__btn, .mz-seat__name")) if (overlap(R(card), R(s))) out.push(`the up-next card overlaps the seat "${s.textContent.trim()}"`);
    const name = card.querySelector(".mz-upnext__name");
    if (name && R(name).right > R(card).right + 0.5) out.push("the up-next title runs out of its card");
  }
  return out;
});

const browser = await launchChromium();
try {
  // ---------------------------------------------------------------- V2 theme
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 } });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: "domcontentloaded" });
    const theme = await p.evaluate(() => ({ meta: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"), bg: getComputedStyle(document.body).backgroundColor, html: getComputedStyle(document.documentElement).backgroundColor, title: document.title }));
    check("theme-color is the Mchezo ground", theme.meta?.toLowerCase() === "#16111d", String(theme.meta));
    check("document background is the Mchezo ground, not green", theme.bg === "rgb(22, 17, 29)" && theme.html === "rgb(22, 17, 29)", `${theme.bg} / ${theme.html}`);
    check("page title is Mchezo", theme.title === "Mchezo", theme.title);
    await ctx.close();
  }
  // ---------------------------------------------------------------- F8 motion on landing
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("cgn_anim", "off"); } catch { /* ignore */ } });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: "domcontentloaded" });
    await p.getByTestId("home").waitFor();
    const m = await p.evaluate(() => { const r = document.querySelector(".mz-root"); return { still: r?.hasAttribute("data-mz-still"), motion: r?.getAttribute("data-mz-motion"), anim: getComputedStyle(document.querySelector(".mz-screen")).animationName }; });
    check("Animations Off applies on the start screen (Home)", m.still === true && m.motion === "reduced" && m.anim === "none", JSON.stringify(m));
    await ctx.close();
  }
  // ---------------------------------------------------------------- lone host: D1, modes, share, settings, day
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 } });
  const host = await ctx.newPage();
  const code = await createRoom(host, "Keku");
  await sleep(800);
  // D1 + modes
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-word-connections").click();
  await host.getByTestId("mode-official").click();
  const notice = host.getByTestId("official-needs-two");
  check("D1: a lone host choosing Official is told why it can't count", await notice.isVisible({ timeout: 3000 }).catch(() => false));
  check("D1: Start is not offered as an official start for one player", await host.getByTestId("start-official-word-connections").isDisabled());
  const styles = async () => host.evaluate(() => ["mode-official", "mode-practice"].map((id) => { const e = document.querySelector(`[data-testid=${id}]`); return { pressed: e.getAttribute("aria-pressed"), bg: getComputedStyle(e).backgroundColor, text: e.textContent }; }));
  let st = await styles();
  check("F3: selected Official is filled and checked, Practice is not", st[0].pressed === "true" && st[1].pressed === "false" && st[0].bg !== st[1].bg && st[0].text.includes("✓") && !st[1].text.includes("✓"), JSON.stringify(st));
  await host.getByTestId("switch-to-practice").click();
  st = await styles();
  check("D1: the switch to practice is explicit and visible", st[1].pressed === "true" && st[1].text.includes("✓") && st[0].bg !== st[1].bg, JSON.stringify(st));
  check("D1: practice Start is available for one player", await host.getByTestId("start-practice-word-connections").isEnabled());
  check("D1: the notice goes away in practice", !(await notice.isVisible().catch(() => false)));
  const refused = await host.evaluate(async () => {
    const roomId = sessionStorage.getItem("cgn_roomId"); const token = sessionStorage.getItem("cgn_token");
    const r = await fetch(`/rooms/${roomId}/games`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": token ?? "" }, body: JSON.stringify({ gameId: "word-connections", official: true }) });
    return { status: r.status, body: await r.json() };
  });
  check("D1: the server refuses an official one-player start (409 OFFICIAL_NEEDS_TWO)", refused.status === 409 && refused.body.code === "OFFICIAL_NEEDS_TWO", JSON.stringify(refused));
  // F2 share: clipboard granted → copied
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin });
  await host.getByTestId("share-room").click();
  const sheet = host.getByTestId("invite-sheet");
  check("F2: Share opens the invite sheet", await sheet.isVisible({ timeout: 3000 }).catch(() => false));
  check("F2: the sheet shows the room code and QR", (await sheet.innerText()).includes(code) && (await sheet.locator("img").count()) === 1);
  check("F2: the sheet has an accessible dialog name", (await host.getByRole("dialog", { name: "Invite players" }).count()) === 1);
  await host.getByTestId("invite-copy").click();
  await sleep(300);
  const status = await host.getByTestId("invite-status").innerText();
  const clip = await host.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  check("F2: Copy link copies the join link and says so", /copied/i.test(status) && clip.endsWith(`/join?code=${code}`), `${status} | ${clip}`);
  await host.getByTestId("invite-close").click();
  check("F2: Done closes the sheet", !(await sheet.isVisible().catch(() => false)));
  // F2 fallback: no clipboard → the link is shown to copy by hand
  await host.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); });
  await host.getByTestId("share-room").click();
  await host.getByTestId("invite-copy").click();
  await sleep(200);
  check("F2: without clipboard access the link is shown instead, with an explanation", (await host.getByTestId("invite-link").innerText()).endsWith(`/join?code=${code}`) && /press and hold/i.test(await host.getByTestId("invite-status").innerText()));
  await host.keyboard.press("Escape");
  await host.getByTestId("invite-sheet").waitFor({ state: "detached", timeout: 5000 });
  // F7 settings (Stage 2: room menu → This phone)
  await openRoomMenu(host);
  const settings = host.getByTestId("settings-bar");
  check("F7: no Sound switch that does nothing", (await settings.locator("input[type=checkbox]").count()) === 0 && /doesn’t play any sounds/.test(await host.getByTestId("sound-status").innerText()));
  await host.getByTestId("motion-off").click();
  check("F8: Animations Off applies to the lobby at once", await host.evaluate(() => document.querySelector(".mz-root")?.hasAttribute("data-mz-still")));
  await host.getByTestId("motion-full").click();
  await closeRoomMenu(host);
  // F5 advance day
  await roomGo(host, "cup");
  await host.getByTestId("advance-day").click();
  check("F5: advancing the day asks first", await host.getByTestId("advance-day-confirm").isVisible({ timeout: 3000 }).catch(() => false));
  await host.getByTestId("advance-day-cancel").click();
  await sleep(500);
  check("F5: 'Not yet' leaves the day unchanged", /Championship day:\s*1/.test(await host.locator("body").innerText()));
  await host.getByTestId("advance-day").click();
  await host.getByTestId("advance-day-confirm").click();
  await sleep(1200);
  check("F5: confirming advances to day 2", /Championship day:\s*2/.test(await host.locator("body").innerText()));
  await host.getByRole("button", { name: "Lobby & Games" }).click();
  await sleep(500);
  // ---------------------------------------------------------------- geometry: 10 players, long names, longest title
  for (const n of LONG) await joinByHttp(code, n);
  await host.getByTestId("choose-game").click();
  await host.getByTestId("select-game-geography").click();
  await sleep(1500);
  for (const [w, h] of SIZES) {
    await host.setViewportSize({ width: w, height: h });
    await sleep(500);
    const probs = await lobbyProblems(host);
    check(`V1/V6 ${w}x${h}, 10 players, "Geography Challenge": no overlaps in the lobby`, probs.length === 0, probs.join("; "));
  }
  // A small room too (the common case)
  const ctx2 = await browser.newContext({ viewport: { width: 375, height: 553 } });
  const solo = await ctx2.newPage();
  await createRoom(solo, "Amina-Josephine Wanjiku");
  await sleep(800);
  const probs2 = await lobbyProblems(solo);
  check("V1/V6 375x553, 1 player with a long name: no overlaps", probs2.length === 0, probs2.join("; "));
  await ctx2.close();
  await ctx.close();
} finally {
  await browser.close();
}
console.log(failures === 0 ? "LOBBY FIXES ALL PASSED" : `LOBBY FIXES: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
