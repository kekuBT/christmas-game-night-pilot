// Sprint 2: connection feedback and host readiness in the real UI.
// A guest's phone drops off the network (its own browser context goes
// offline, so its WebSocket dies like a locked phone's), then comes back.
// Checks: the guest's own banner ("Connection lost. Reconnecting…" →
// "Reconnected. Your progress is saved." only after the server accepts
// the session); the host's readiness card naming who is reconnecting;
// Start on an official game asks first instead of silently leaving the
// player out; "Wait" starts nothing; "Start without" starts with exactly
// the roster shown. Screenshots at 320 and 390 px.
// Usage: node scripts/check-readiness.mjs <baseUrl>
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
/** Wait for a condition, failing loudly with what was being waited for. */
async function expectSoon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 200));
  }
  check(label, false, `not observed within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`);
  return false;
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
    if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 300));
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
const text = async (loc) => ((await loc.textContent({ timeout: 2000 })) ?? "").replace(/\s+/g, " ").trim();

const browser = await launchChromium();
try {
  for (const width of [390, 320]) {
    console.log(`== ${width}px`);
    const vp = { width, height: 760 };
    const hostCtx = await browser.newContext({ viewport: vp });
    const host = await hostCtx.newPage();
    const code = await createRoom(host, "Ada");
    const beaCtx = await browser.newContext({ viewport: vp });
    const bea = await beaCtx.newPage();
    await joinRoom(bea, "Bea", code);
    const calCtx = await browser.newContext({ viewport: vp });
    const cal = await calCtx.newPage();
    await joinRoom(cal, "Cal", code);

    const summary = host.getByTestId("mz-readiness-summary");
    await expectSoon("host: all here → one calm line", async () => (await text(summary)).startsWith("Everyone’s here · 3 will play"));
    check(`${width}: no missing-player list when everyone is here`, (await host.locator(".mz-ready__list").count()) === 0);

    // Cal's phone drops off the network.
    await calCtx.setOffline(true);
    const banner = cal.getByTestId("mz-conn");
    await expectSoon(`${width}: Cal sees a calm reconnecting banner`, async () => (await text(banner)).startsWith("Connection lost. Reconnecting…"));
    check(`${width}: banner is a polite status, not an alert`, (await banner.getAttribute("role")) === "status" && (await banner.getAttribute("aria-live")) === "polite");
    await expectSoon(`${width}: host sees Cal reconnecting`, async () => (await text(summary)).includes("1 reconnecting") && (await text(host.locator(".mz-ready__list"))).includes("Cal"));
    if (width === 390) {
      await cal.waitForTimeout(400); // let the banner's fade-in finish before capturing
      await cal.screenshot({ path: screenshotPath("docs/mchezo-screenshots/30-reconnecting-banner.png") });
    }

    // Start (official) asks first instead of silently excluding Cal.
    await host.getByTestId("start-official-trivia").click();
    const decision = host.getByTestId("mz-start-decision");
    await expectSoon(`${width}: Start asks before leaving Cal out`, async () => (await text(decision)).includes("Cal is reconnecting"));
    await decision.scrollIntoViewIfNeeded();
    await host.screenshot({ path: screenshotPath(`docs/mchezo-screenshots/31-host-readiness-decision-${width}.png`) });
    // The question must be on screen next to Start, not somewhere above the fold.
    const box = await decision.boundingBox();
    const startBox = await host.getByTestId("start-official-trivia").boundingBox();
    check(`${width}: the question sits directly above the Start button`, !!box && !!startBox && startBox.y - (box.y + box.height) < 120 && startBox.y > box.y, JSON.stringify({ box, startBox }));
    check(`${width}: decision buttons are at least 44px`, (await Promise.all(["mz-start-wait", "mz-start-without"].map(async (id) => (await host.getByTestId(id).boundingBox())?.height ?? 0))).every((h) => h >= 44));
    await host.getByTestId("mz-start-wait").click();
    await expectSoon(`${width}: "Wait" closes the question`, async () => (await decision.count()) === 0);
    check(`${width}: "Wait" started nothing`, (await host.locator(".mz-question").count()) === 0);

    // Cal comes back: banner confirms only after the server accepts the session.
    await calCtx.setOffline(false);
    await expectSoon(`${width}: Cal sees "Reconnected. Your progress is saved."`, async () => (await text(banner)).includes("Reconnected. Your progress is saved."), 20000);
    if (width === 390) { await cal.waitForTimeout(400); await cal.screenshot({ path: screenshotPath("docs/mchezo-screenshots/32-reconnected-banner.png") }); }
    await expectSoon(`${width}: host sees everyone again`, async () => (await text(summary)).startsWith("Everyone’s here · 3 will play"));
    await expectSoon(`${width}: banner clears by itself`, async () => (await banner.count()) === 0, 10000);

    // Cal drops again; this time the host starts without them, explicitly.
    await calCtx.setOffline(true);
    await expectSoon(`${width}: host sees Cal reconnecting again`, async () => (await text(summary)).includes("1 reconnecting"));
    await host.getByTestId("start-official-trivia").click();
    await expectSoon(`${width}: question shown again`, async () => (await decision.count()) === 1);
    await host.getByTestId("mz-start-without").click();
    // D3: the two players in this game read the rules and tap I'm ready.
    await passBriefing([host, bea]);
    await expectSoon(`${width}: game starts for the host`, async () => (await host.locator(".mz-question").count()) > 0);
    await expectSoon(`${width}: game starts for Bea`, async () => (await bea.locator(".mz-question").count()) > 0);
    const roster = await host.evaluate(async () => {
      const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=tv`);
      const p = await r.json();
      const g = p.games.find((x) => x.status === "playing");
      return g.players.map((id) => p.players.find((x) => x.id === id).displayName);
    });
    check(`${width}: roster is exactly the one shown (Ada, Bea)`, JSON.stringify(roster) === JSON.stringify(["Ada", "Bea"]), JSON.stringify(roster));
    await calCtx.setOffline(false);
    await expectSoon(`${width}: Cal reconnects during the game`, async () => (await text(banner)).includes("Reconnected"), 20000);
    check(`${width}: Cal (not in this game) gets no question screen`, (await cal.locator(".mz-slab:not([disabled])").count()) === 0);
    check(`${width}: no horizontal overflow on the host lobby`, await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await Promise.all([hostCtx.close(), beaCtx.close(), calCtx.close()]);
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? "READINESS ALL PASSED" : `READINESS FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
