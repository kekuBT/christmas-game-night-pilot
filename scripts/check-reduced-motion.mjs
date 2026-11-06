// Reduced-motion floor (Milestone J.1): the kit must suppress the
// fresh-arrival seat animation when the device prefers reduced motion,
// even when the in-app animation setting is "full" (the default).
// Control arm (default emulation): the arriving seat DOES animate.
// Reduced arm (reduced emulation): it NEVER animates during the
// 900ms arrival window. Both arms use the lobby only (no game flow).
// Usage: build:web, serve on a port, then:
//   node scripts/check-reduced-motion.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function setupRoom(ctx, hostName, guestName) {
  const host = await ctx.newPage();
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("e.g. Auntie June").fill(hostName);
  await host.getByRole("button", { name: "Host a game" }).click();
  const chip = host.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(500);
  }
  const guest = await ctx.newPage();
  await guest.goto(BASE, { waitUntil: "domcontentloaded" });
  await guest.getByPlaceholder("e.g. Auntie June").fill(guestName);
  await guest.locator(".mz-code__input").fill(code);
  await guest.getByRole("button", { name: "Join the game" }).click();
  await guest.getByRole("heading", { name: `You’re in, ${guestName}.` }).waitFor({ timeout: 15000 });
  return host;
}

function seatLocator(page, name) {
  return page.locator(".mz-circle__seats li", { hasText: name });
}
async function seatHasArrive(page, name) {
  const loc = seatLocator(page, name);
  if ((await loc.count()) === 0) return false;
  const cls = (await loc.first().getAttribute("class")) ?? "";
  return cls.split(/\s+/).includes("mz-seat--arrive");
}

const browser = await launchChromium();
try {
  // Control arm: default emulation → the arriving seat animates.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const host = await setupRoom(ctx, "Ada", "Bea");
    let seen = false;
    for (let i = 0; i < 80 && !seen; i++) {
      seen = await seatHasArrive(host, "Bea");
      if (!seen) await sleep(100);
    }
    check("control: arriving seat animates under default motion", seen);
    await ctx.close();
  }
  // Reduced arm: reduced emulation → the arriving seat never animates.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const host = await setupRoom(ctx, "Ada", "Bea");
    // Wait for Bea's seat to exist first (poll refresh), then watch a
    // full arrival window (900ms) plus margin for the class to appear.
    let exists = false;
    for (let i = 0; i < 80 && !exists; i++) {
      exists = (await seatLocator(host, "Bea").count()) > 0;
      if (!exists) await sleep(100);
    }
    let appeared = false;
    for (let i = 0; i < 12 && !appeared; i++) {
      appeared = await seatHasArrive(host, "Bea");
      if (!appeared) await sleep(100);
    }
    check("reduced: arriving seat never animates under reduced motion", exists && !appeared);
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? "REDUCED MOTION ALL PASSED" : `REDUCED MOTION FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
