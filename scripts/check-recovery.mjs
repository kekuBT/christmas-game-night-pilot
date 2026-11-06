// Sprint 2: seat recovery in the real UI, as a family member would do it.
// 1. Bea saves a recovery code; her phone is "lost" (a new device recovers
//    with the code) while the old tab is still open: the old tab is told
//    its seat moved and is signed out; the room sees a notice.
// 2. A wrong code gets a plain error and changes nothing.
// 3. Cal lost everything: the new device asks the host; both screens show
//    the same match code; the host approves deliberately (two steps); Cal
//    is back in the same seat; the room sees who restored it.
// Usage: node scripts/check-recovery.mjs <baseUrl>
import { launchChromium, screenshotPath } from "./lib/driver-env.mjs";

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
const text = async (loc) => ((await loc.textContent({ timeout: 2000 })) ?? "").replace(/\s+/g, " ").trim();
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
const playerIdOf = (page) => page.evaluate(() => sessionStorage.getItem("cgn_playerId"));
const seatCount = (page) => page.evaluate(async () => (await (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/projection?audience=tv`)).json()).players.length);

const browser = await launchChromium();
try {
  const vp = { viewport: { width: 390, height: 844 } };
  const hostCtx = await browser.newContext(vp);
  const host = await hostCtx.newPage();
  const code = await createRoom(host, "Ada");
  const beaCtx = await browser.newContext(vp);
  const bea = await beaCtx.newPage();
  await joinRoom(bea, "Bea", code);
  const beaId = await playerIdOf(bea);

  // Bea saves a recovery code (optional, inside "This device").
  await bea.getByTestId("mz-this-device").getByRole("button", { name: /This device/ }).click();
  await bea.getByTestId("mz-get-recovery-code").click();
  const shown = bea.getByTestId("mz-recovery-code");
  await expectSoon("Bea gets a recovery code", async () => /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(await text(shown)));
  const recoveryCode = await text(shown);
  await bea.getByTestId("mz-code-reveal").scrollIntoViewIfNeeded();
  await bea.waitForTimeout(300);
  await bea.screenshot({ path: screenshotPath("docs/mchezo-screenshots/35-recovery-code.png") });
  check("touch target: 'I’ve saved it' ≥ 44px", ((await bea.getByTestId("mz-code-saved").boundingBox())?.height ?? 0) >= 44);
  await bea.getByTestId("mz-code-saved").click();
  const seatsBefore = await seatCount(host);

  // 2. A wrong code first, on the new device.
  const newCtx = await browser.newContext(vp);
  const newBea = await newCtx.newPage();
  await newBea.goto(BASE, { waitUntil: "domcontentloaded" });
  await newBea.getByTestId("mz-lost-place").click();
  await newBea.screenshot({ path: screenshotPath("docs/mchezo-screenshots/36-recover-choose.png") });
  await newBea.getByTestId("mz-recover-with-code").click();
  await newBea.getByTestId("mz-recover-room").fill(code);
  const wrong = recoveryCode.slice(0, -1) + (recoveryCode.endsWith("A") ? "B" : "A");
  await newBea.getByTestId("mz-recover-code").fill(wrong);
  await newBea.getByTestId("mz-recover-submit").click();
  await expectSoon("2. a wrong code gets a plain error", async () => (await text(newBea.getByTestId("mz-recover-error"))).includes("don’t match a seat"));
  check("2. the wrong code changed nothing (old tab still in)", (await bea.getByRole("heading", { name: "You’re in, Bea." }).count()) === 1);

  // 1. The right code, typed sloppily (lowercase, spaces).
  await newBea.getByTestId("mz-recover-code").fill(recoveryCode.toLowerCase().replace(/-/g, " "));
  await newBea.getByTestId("mz-recover-submit").click();
  const newCode = newBea.getByTestId("mz-recovery-code");
  await expectSoon("1. recovery shows a fresh code", async () => /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(await text(newCode)) && (await text(newCode)) !== recoveryCode);
  await newBea.waitForTimeout(300);
  await newBea.screenshot({ path: screenshotPath("docs/mchezo-screenshots/37-recovered-new-code.png") });
  await newBea.getByTestId("mz-code-saved").click();
  await expectSoon("1. the new device is back in Bea's seat", async () => (await newBea.getByRole("heading", { name: "You’re in, Bea." }).count()) === 1 && (await playerIdOf(newBea)) === beaId);
  check("1. no duplicate seat", (await seatCount(host)) === seatsBefore);
  const replaced = bea.getByTestId("mz-conn-replaced");
  await expectSoon("1. the old tab is told its seat moved", async () => (await text(replaced)).includes("This seat moved to another device"));
  await bea.waitForTimeout(300);
  await bea.screenshot({ path: screenshotPath("docs/mchezo-screenshots/38-old-device-replaced.png") });
  const oldTry = await bea.evaluate(async () => (await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/session`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } })).status);
  check("1. the old tab's credential is really dead (server says 401)", oldTry === 401, String(oldTry));
  await replaced.getByRole("button", { name: "OK" }).click();
  await expectSoon("1. after OK the old tab is back at the start screen", async () => (await bea.getByRole("button", { name: "Join the game" }).count()) === 1);
  await expectSoon("1. the room sees a notice", async () => (await text(host.getByTestId("mz-room-notice"))).includes("Bea’s seat was recovered on a new device"));
  await host.getByTestId("mz-room-notice").getByRole("button", { name: "Dismiss" }).click();

  // 3. Host-assisted: Cal lost everything.
  const calCtx = await browser.newContext(vp);
  const cal = await calCtx.newPage();
  await joinRoom(cal, "Cal", code);
  const calId = await playerIdOf(cal);
  await calCtx.close(); // phone lost, no code saved
  const cal2Ctx = await browser.newContext(vp);
  const cal2 = await cal2Ctx.newPage();
  await cal2.goto(BASE, { waitUntil: "domcontentloaded" });
  await cal2.getByTestId("mz-lost-place").click();
  await cal2.getByTestId("mz-recover-with-host").click();
  await cal2.getByTestId("mz-recover-room").fill(code);
  await cal2.getByRole("button", { name: "Find my seat" }).click();
  await cal2.getByRole("listitem").filter({ hasText: "Cal" }).click();
  await cal2.getByTestId("mz-ask-host").click();
  const match = cal2.getByTestId("mz-match-code");
  await expectSoon("3. Cal's new device shows a match code", async () => /^\d{4}$/.test(await text(match)));
  const matchCode = await text(match);
  await cal2.screenshot({ path: screenshotPath("docs/mchezo-screenshots/39-recover-ask-host.png") });
  const card = host.getByTestId("mz-recovery-requests");
  await expectSoon("3. the host sees the request with the same number", async () => (await text(card)).includes("Cal") && (await text(card)).includes(matchCode));
  await card.scrollIntoViewIfNeeded();
  await host.getByTestId("mz-recreq-restore").click();
  await host.waitForTimeout(200);
  await host.screenshot({ path: screenshotPath("docs/mchezo-screenshots/40-host-approve-recovery.png") });
  check("3. approving needs a second, deliberate tap", (await host.getByTestId("mz-recreq-confirm").count()) === 1 && (await cal2.getByTestId("mz-code-reveal").count()) === 0);
  await host.getByTestId("mz-recreq-confirm").click();
  await expectSoon("3. Cal's new device gets the seat and a fresh code", async () => (await cal2.getByTestId("mz-code-reveal").count()) === 1, 20000);
  // The new credential is kept the moment it arrives: no Back button can
  // throw it away, and a reload (or the tab being killed) keeps the seat.
  check("3. no Back button while the new code is shown", (await cal2.getByRole("button", { name: "Back" }).count()) === 0);
  await cal2.reload({ waitUntil: "domcontentloaded" });
  await expectSoon("3. same seat as before", async () => (await cal2.getByRole("heading", { name: "You’re in, Cal." }).count()) === 1 && (await playerIdOf(cal2)) === calId);
  await expectSoon("3. the room is told who restored the seat", async () => (await text(newBea.getByTestId("mz-room-notice"))).includes("Ada restored Cal’s seat"));
  check("3. the request card is gone", (await card.count()) === 0);
  check("no horizontal overflow on the recovery screens", await cal2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await Promise.all([hostCtx, beaCtx, newCtx, cal2Ctx].map((c) => c.close()));
} finally {
  await browser.close();
}
console.log(failures === 0 ? "RECOVERY ALL PASSED" : `RECOVERY FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
