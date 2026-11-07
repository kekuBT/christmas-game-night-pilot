// Evidence script for docs/ux-redesign/AUDIT.md (2026-11-07), kept for reproducibility.
// Environment-specific: paths point at the cloud container that produced the evidence
// (repo at /home/user/christmas-game-night-pilot, machine Chromium headless shell).
// Usage: start `npm run serve:device-test` on a port, then: node <this file> http://localhost:PORT [outDir] [wordsJson]
import { chromium } from "/home/user/christmas-game-night-pilot/node_modules/playwright/index.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell" });
const out = [];
for (const [w, h, label] of [[390, 664, "iPhone 14/15 Safari, toolbars shown"], [393, 659, "iPhone 15 Pro Safari"], [375, 553, "iPhone SE Safari"], [412, 780, "Pixel 7 Chrome"], [360, 640, "small Android"]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }); const p = await c.newPage();
  await p.goto(process.argv[2]); await p.getByPlaceholder("e.g. Auntie June").fill("Keku"); await p.getByRole("button", { name: "Host a game" }).click();
  await p.getByRole("button", { name: /^Share room code / }).waitFor(); await p.waitForTimeout(1200);
  const m = await p.evaluate(() => { const r = (s) => document.querySelector(s)?.getBoundingClientRect(); const ov = (a, b) => !!(a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
    const h1 = r(".mz-h1"), badge = r(".mz-topbar .mz-event-badge"), center = r(".mz-circle__center"), you = r(".mz-token--you"), up = r(".mz-upnext__kind"), start = r("[data-testid^=start-]");
    const sc = document.querySelector(".mz-screen");
    return { h1VsBadge: ov(h1, badge), youVsCenterDisc: ov(you, center), youVsUpNextText: ov(you, up), startButtonTopPx: Math.round(start?.top ?? -1), screenScroll: sc.scrollHeight, viewport: innerHeight };
  });
  if (w === 390 && h === 664) await p.screenshot({ path: "shots/23-host-lobby-390x664.jpg", type: "jpeg", quality: 72 });
  out.push({ size: `${w}x${h}`, label, ...m, screensToStart: +(m.startButtonTopPx / m.viewport).toFixed(1) });
  await c.close();
}
console.table(out); await b.close();
