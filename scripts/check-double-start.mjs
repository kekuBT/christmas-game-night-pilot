// Double-start guard (Milestone K, host-action race): two rapid clicks
// on Start must send exactly one start request. The server already
// rejects the second (a game is already playing), but the rejection
// surfaced as a spurious error to the host; the App-level in-flight
// guard stops the redundant request. The driver counts start POSTs
// directly (the game count alone cannot distinguish guard from
// server-rejection) and asserts exactly one game in the projection.
// Usage: build:web, serve on a port, then:
//   node scripts/check-double-start.mjs <baseUrl>
import { launchChromium } from "./lib/driver-env.mjs";
import { passBriefing } from "./lib/briefing.mjs";

const BASE = process.argv[2] ?? "http://localhost:3461";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const browser = await launchChromium();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await ctx.newPage();
  let startPosts = 0;
  host.on("request", (r) => {
    if (r.method() === "POST" && /\/rooms\/[^/]+\/games$/.test(new URL(r.url()).pathname)) startPosts++;
  });
  await host.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("e.g. Auntie June").fill("Ada");
  await host.getByTestId("host-kind-cup").click(); await host.getByRole("button", { name: "Host a game" }).click();
  const chip = host.getByRole("button", { name: /^Share room code / });
  await chip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await chip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await sleep(500);
  }
  const bea = await ctx.newPage();
  await bea.goto(`${BASE}/join`, { waitUntil: "domcontentloaded" });
  await bea.getByPlaceholder("e.g. Auntie June").fill("Bea");
  await bea.locator(".mz-code__input").fill(code);
  await bea.getByRole("button", { name: "Join the game" }).click();
  await bea.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });

  // Two clicks in the same JS task (one evaluate, back-to-back dispatches):
  // without the guard both fire startGame; with it the second is ignored.
  // (Two sequential locator clicks cannot do this: the first click starts
  // the game and unmounts the button, so the second waits on a gone element.)
  await host.getByRole("button", { name: /^Start Trivia Showdown/ }).waitFor({ timeout: 15000 });
  await host.evaluate(() => {
    const b = document.querySelector('[data-testid="start-official-trivia"]');
    if (!b) throw new Error("start button missing");
    b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await passBriefing([host, bea]); // D3: both tap I'm ready
  await host.locator(".mz-question").waitFor({ timeout: 15000 });
  await sleep(500);
  check("double-click sends exactly one start request", startPosts === 1, `saw ${startPosts}`);

  // Belt and braces: the projection holds exactly one game.
  const games = await host.evaluate(async () => {
    const token = sessionStorage.getItem("cgn_token") ?? "";
    const roomId = sessionStorage.getItem("cgn_roomId") ?? "";
    const r = await fetch(`/rooms/${roomId}/projection?audience=player`, { headers: { "x-session-token": token } });
    const data = await r.json();
    return data.games ?? [];
  });
  check("projection holds exactly one game", games.length === 1, `saw ${games.length}`);
} finally {
  await browser.close();
}
console.log(failures === 0 ? "DOUBLE-START ALL PASSED" : `DOUBLE-START FAILURES: ${failures}`);
process.exitCode = failures ? 1 : 0;
