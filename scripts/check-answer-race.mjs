// Reproduces the answer-confirmation race deterministically (found in
// Sprint 2 by the observable-state answer helper): the tapping player's
// own projection refresh is slowed down, so the server's WebSocket push
// confirming the answer always arrives first. Before the fix, the screen
// then jumped to the NEXT question and flipped back to the previous
// question's locked view a moment later. Requirement: after a tap, the
// screen goes straight to "Answer locked in" for that question, never
// showing the next question first, and a second tap sends nothing.
// Usage: node scripts/check-answer-race.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function createRoom(page, name) {
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
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
  await page.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("e.g. Auntie June").fill(name);
  await page.locator(".mz-code__input").fill(code);
  await page.getByRole("button", { name: "Join the game" }).click();
  await page.getByRole("heading", { name: `You’re in, ${name}.` }).waitFor({ timeout: 15000 });
}

const browser = await launchChromium();
try {
  for (const gameId of ["trivia", "geography", "math-mayhem"]) {
    const vp = { viewport: { width: 390, height: 844 } };
    const host = await (await browser.newContext(vp)).newPage();
    const code = await createRoom(host, "Ada");
    const bea = await (await browser.newContext(vp)).newPage();
    await joinRoom(bea, "Bea", code);
    await host.evaluate(async (gameId) => {
      const r = await fetch(`/rooms/${sessionStorage.getItem("cgn_roomId")}/games`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": sessionStorage.getItem("cgn_token") }, body: JSON.stringify({ gameId, official: false, seed: 1 }) });
      if (!r.ok) throw new Error(`start failed ${r.status}`);
    }, gameId);
    await passBriefing([host, bea]); // D3: both tap I'm ready
    await bea.locator(".mz-question").waitFor({ timeout: 20000 });
    await bea.waitForTimeout(600);
    // Slow ONLY Bea's projection polls/refreshes; the WebSocket push is untouched.
    await bea.route("**/projection?audience=player", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
    let posts = 0;
    bea.on("request", (req) => { if (req.method() === "POST" && req.url().includes("/intents")) posts++; });
    // Record every screen state for 3.5s after the tap.
    await bea.evaluate(() => {
      window.__states = [];
      const t = setInterval(() => window.__states.push(document.querySelector("main.mz-screen")?.getAttribute("aria-label") ?? ""), 40);
      setTimeout(() => clearInterval(t), 3500);
    });
    const tapped = await bea.evaluate(() => document.querySelector("main.mz-screen")?.getAttribute("aria-label") ?? "");
    const slab = bea.locator(".mz-slab:not([disabled])").first();
    await slab.click();
    await slab.click({ timeout: 300, force: true }).catch(() => {}); // an impatient double tap
    await bea.waitForTimeout(3700);
    const states = await bea.evaluate(() => window.__states);
    const seen = [...new Set(states)];
    const firstLocked = states.indexOf("Answer locked in");
    // Before the lock, only the tapped question may ever be on screen.
    const nextBeforeLock = states.slice(0, firstLocked < 0 ? states.length : firstLocked).some((s) => /^Question \d+ of/.test(s) && s !== tapped);
    check(`${gameId}: the answer locks on the same question`, firstLocked >= 0, seen.join(" → "));
    check(`${gameId}: no other question flashes before the lock`, !nextBeforeLock, `tapped "${tapped}": ${seen.join(" → ")}`);
    check(`${gameId}: a double tap sends one answer`, posts === 1, `${posts} answer requests`);
    await host.context().close();
    await bea.context().close();
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? "ANSWER RACE ALL PASSED" : `ANSWER RACE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
