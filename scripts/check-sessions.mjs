// Sprint 2: guest sessions in the real browser.
// Same-tab refresh; closed tab without Remember (nothing kept); closed tab
// with Remember ("Welcome back. Continue as Bea", same seat, no duplicate);
// Remember revoked; sign out on this device; a saved credential the server
// rejects (never trusted, never a new seat); a browser that refuses storage.
// Usage: node scripts/check-sessions.mjs <baseUrl>
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";
import { openRoomMenu, hostFamilyCup } from "./lib/room-nav.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function expectSoon(label, fn, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { if (await fn()) { check(label, true); return true; } } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 200));
  }
  check(label, false, `not observed within ${timeout}ms${last ? ` (${String(last.message ?? last).split("\n")[0]})` : ""}`);
  return false;
}
async function createRoom(page, name) {
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await hostFamilyCup(page);
  const chip = page.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 300));
  }
  return code;
}
async function fillJoin(page, name, code, { remember = false } = {}) {
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  if (remember) await page.getByTestId("mz-remember-device").check();
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}
const seatCount = (host) => host.evaluate(async () => (await (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=tv`)).json()).players.length);
const storages = (page) => page.evaluate(() => ({ session: JSON.stringify({ ...sessionStorage }), local: JSON.stringify({ ...localStorage }) }));

const browser = await launchChromium();
try {
  const vp = { viewport: { width: 390, height: 844 } };
  const hostCtx = await browser.newContext(vp);
  const host = await hostCtx.newPage();
  const code = await createRoom(host, "Ada");

  // 16. Same-tab refresh with an ordinary guest session.
  const beaCtx = await browser.newContext(vp);
  let bea = await beaCtx.newPage();
  await fillJoin(bea, "Bea", code);
  const beaToken = await bea.evaluate(() => sessionStorage.getItem("cgn_token"));
  check("16. default: the credential is in this tab only", !!beaToken && !(await storages(bea)).local.includes(beaToken));
  check("default: Remember is off", !(await bea.evaluate(() => localStorage.getItem("mz_remembered_seats"))));
  await bea.reload({ waitUntil: "domcontentloaded" });
  await expectSoon("16. refresh keeps the seat", async () => (await bea.getByRole("heading", { name: "You’re in, Bea." }).count()) === 1);

  // 17. Closed tab without Remember: a new tab starts fresh.
  await bea.close();
  bea = await beaCtx.newPage();
  await bea.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await expectSoon("17. new tab without Remember shows the join screen", async () => (await bea.getByRole("button", { name: "Join the game" }).count()) === 1);
  await bea.waitForTimeout(800);
  check("17. and offers no saved seat", (await bea.getByTestId("mz-continue-seat").count()) === 0);
  const seatsBefore = await seatCount(host);

  // 18. Closed tab WITH Remember: "Welcome back. Continue as Cal?"
  const calCtx = await browser.newContext(vp);
  let cal = await calCtx.newPage();
  await fillJoin(cal, "Cal", code, { remember: true });
  const calPlayer = await cal.evaluate(() => sessionStorage.getItem("cgn_playerId"));
  const st = await storages(cal);
  check("18. Remember: credential stored once, on the device, not also in the tab", !st.session.includes("cgn_token") && st.local.includes("mz_remembered_seats"));
  await cal.close();
  cal = await calCtx.newPage();
  await cal.goto(BASE, { waitUntil: "domcontentloaded" });
  const cont = cal.getByTestId("mz-continue-seat");
  await expectSoon("18. new tab offers \"Continue as Cal\"", async () => ((await cont.textContent()) ?? "").includes("Continue as Cal"));
  await cal.waitForTimeout(300);
  await cal.screenshot({ path: screenshotPath("docs/mchezo-screenshots/33-welcome-back.png") });
  check("touch target: Continue is at least 44px", ((await cont.boundingBox())?.height ?? 0) >= 44);
  await cont.click();
  await expectSoon("18. continuing restores the same seat", async () => (await cal.getByRole("heading", { name: "You’re in, Cal." }).count()) === 1 && (await cal.evaluate(() => sessionStorage.getItem("cgn_playerId"))) === calPlayer);
  check("18. no duplicate seat was created", (await seatCount(host)) === seatsBefore + 1, `seats=${await seatCount(host)}`);

  // 19. Remember revoked from the lobby (room menu → This device).
  await openRoomMenu(cal);
  await cal.getByTestId("mz-this-device").getByRole("button", { name: /This device/ }).click();
  await cal.waitForTimeout(200);
  await cal.getByTestId("mz-this-device").scrollIntoViewIfNeeded();
  await cal.screenshot({ path: screenshotPath("docs/mchezo-screenshots/34-this-device.png") });
  await cal.getByTestId("mz-remember-device").uncheck();
  await expectSoon("19. revoking Remember erases the credential from the device", async () => !(await cal.evaluate(() => localStorage.getItem("mz_remembered_seats"))) && !!(await cal.evaluate(() => sessionStorage.getItem("cgn_token"))));
  await cal.reload({ waitUntil: "domcontentloaded" });
  await expectSoon("19. this tab still works after revoking", async () => (await cal.getByRole("heading", { name: "You’re in, Cal." }).count()) === 1);

  // Sign out on this device: the seat stays in the game.
  await openRoomMenu(cal);
  await cal.getByTestId("mz-this-device").getByRole("button", { name: /This device/ }).click();
  await cal.getByTestId("mz-forget-device").click();
  await cal.getByTestId("mz-forget-device-confirm").click();
  await expectSoon("sign out returns to the start screen (Home), saying so", async () => (await cal.getByTestId("home").count()) === 1 && (await cal.getByTestId("room-menu").count()) === 0 && /Signed out on this device/.test(await cal.locator("body").innerText()));
  check("sign out leaves no credential on the device", !(await storages(cal)).session.includes("cgn_token") && !(await storages(cal)).local.includes("mz_remembered"));
  check("sign out keeps the seat in the room", (await seatCount(host)) === seatsBefore + 1);

  // 21. A saved credential the server rejects is never trusted.
  const fakeCtx = await browser.newContext(vp);
  const fake = await fakeCtx.newPage();
  const roomId = await host.evaluate(() => sessionStorage.getItem("cgn_roomId"));
  await fake.goto(BASE, { waitUntil: "domcontentloaded" });
  await fake.evaluate((roomId) => localStorage.setItem("mz_remembered_seats", JSON.stringify([{ roomId, playerId: "player-1", token: "f".repeat(64), displayName: "Ada", remembered: true, savedAt: 1 }])), roomId);
  await fake.reload({ waitUntil: "domcontentloaded" });
  await expectSoon("21. an invalid saved seat is explained, not offered", async () => ((await fake.getByTestId("mz-welcome-back").textContent()) ?? "").includes("no longer works"));
  check("21. no 'Continue as Ada' for a credential the server rejected", (await fake.getByTestId("mz-continue-seat").count()) === 0);
  check("21. the rejected credential is removed from the device", !(await fake.evaluate(() => localStorage.getItem("mz_remembered_seats"))));
  check("21. nothing was created on the server", (await seatCount(host)) === seatsBefore + 1);

  // 20. A browser that refuses storage can still play.
  const deniedCtx = await browser.newContext(vp);
  await deniedCtx.addInitScript(() => {
    const deny = () => { throw new DOMException("The operation is insecure.", "SecurityError"); };
    for (const k of ["localStorage", "sessionStorage"]) Object.defineProperty(window, k, { get: deny, configurable: true });
  });
  const denied = await deniedCtx.newPage();
  await denied.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await expectSoon("20. storage-denied browser renders the join screen", async () => (await denied.getByRole("button", { name: "Join the game" }).count()) === 1);
  check("20. Remember is disabled, with a plain explanation", await denied.getByTestId("mz-remember-device").isDisabled() && ((await denied.locator(".mz-remember__help").textContent()) ?? "").includes("won’t let Mchezo remember"));
  await denied.getByPlaceholder("e.g. Auntie June").fill("Dee");
  await denied.locator(".mz-code__input").fill(code);
  await denied.getByRole("button", { name: "Join the game" }).click();
  await expectSoon("20. and can still join and play", async () => (await denied.getByRole("heading", { name: "You’re in, Dee." }).count()) === 1);
  check("no horizontal overflow on the welcome screen", await cal.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await Promise.all([hostCtx, beaCtx, calCtx, fakeCtx, deniedCtx].map((c) => c.close()));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "SESSIONS ALL PASSED" : `SESSIONS FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
