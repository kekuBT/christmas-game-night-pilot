// WS auto-reconnect browser check (Chromium, 2 fictional players).
// Usage: build:web, serve on a port, then: node scripts/check-ws-reconnect.mjs <baseUrl>
// What it proves, through the real UI only:
//   1. Host + guest both connected (Circle lobby shows the guest seat).
//   2. The guest's WebSocket is dropped mid-session (Playwright intercepts
//      the guest's first WS connection and closes it once, via
//      routeWebSocket; later connections pass through untouched).
//   3. The server marks the guest away (Circle seat shows "Away" and the
//      lobby line says "reconnecting"; its WS close handler fires), then
//      the client's auto-reconnect reopens the socket and the away marker
//      clears WITHOUT any manual Reconnect click.
//   4. The host can then start Trivia (min 2 connected players), which
//      would fail while the guest was still marked away.
// Checks: 4. Fictional test players only; run against a local server only.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3457";
const results = [];
function pass(name) { results.push([name, true]); console.log("PASS", name); }
function fail(name, detail) { results.push([name, false]); console.log("FAIL", name, detail ?? ""); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll a predicate until it is true or the timeout elapses.
async function waitFor(fn, timeoutMs, _label) {
  const deadline = Date.now() + timeoutMs;
  let last = false;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return true;
    await sleep(500);
  }
  return last;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
try {
  const host = await ctx.newPage();
  await host.goto(BASE, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("e.g. Auntie June").fill("Ada");
  await host.getByRole("button", { name: "Host a game" }).click();
  const shareChip = host.getByRole("button", { name: /^Share room code / });
  await shareChip.waitFor({ timeout: 15000 });
  let code = "";
  for (let i = 0; i < 30 && !/^[A-Z0-9]{6}$/.test(code); i++) {
    code = ((await shareChip.getAttribute("aria-label")) ?? "").replace("Share room code ", "").trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) await new Promise((r) => setTimeout(r, 500));
  }

  const guest = await ctx.newPage();
  await guest.goto(BASE, { waitUntil: "domcontentloaded" });
  await guest.getByPlaceholder("e.g. Auntie June").fill("Bea");
  await guest.locator(".mz-code__input").fill(code);
  // Intercept ONLY the guest's player WS, before it is created (join click
  // is what creates it). First connection: proxy to the real server, then
  // close it once after 800ms. Later connections pass through untouched,
  // so a reconnect attempt can actually succeed.
  let dropped = false;
  await guest.routeWebSocket(
    (url) => url.searchParams.get("audience") === "player",
    (ws) => {
      ws.connectToServer();
      if (!dropped) {
        dropped = true;
        setTimeout(() => { try { ws.close(); } catch { /* already closed */ } }, 800);
      }
    },
  );
  await guest.getByRole("button", { name: "Join the game" }).click();
  await guest.getByRole("heading", { name: "You’re in, Bea." }).waitFor({ timeout: 15000 });

  // Host's Circle lobby: the guest seat name, and the lobby status line.
  const hostLobbyText = async () => {
    try { return (await host.locator("body").textContent()) ?? ""; } catch { return ""; }
  };
  if (await waitFor(async () => (await hostLobbyText()).includes("Bea") && !(await hostLobbyText()).includes("reconnecting"), 15000, "initial connected")) {
    pass("both players connected before drop");
  } else fail("both players connected before drop");

  // The drop should mark the guest away on the host's view (server WS
  // close handler), via the 2s polling fallback even with WS dead.
  if (await waitFor(async () => (await hostLobbyText()).includes("reconnecting"), 20000, "away after drop")) {
    pass("guest marked away after socket drop");
  } else fail("guest marked away after socket drop");

  // Auto-reconnect (first retry after 1s backoff) must clear the marker
  // with NO manual Reconnect click on either page.
  if (await waitFor(async () => {
    const t = await hostLobbyText();
    return t.includes("Bea") && !t.includes("reconnecting");
  }, 30000, "reconnected")) {
    pass("guest auto-reconnected, away cleared, no manual click");
  } else fail("guest auto-reconnected, away cleared, no manual click");

  // Functional proof: Trivia needs 2 connected players. While the guest
  // was away this start would fail; now it must reach a Trivia question
  // (Mchezo intro auto-advances in 8s, so wait for the question screen).
  await host.getByTestId("start-official-trivia").click();
  try {
    await host.locator(".mz-question").waitFor({ timeout: 30000 });
    pass("host can start Trivia after reconnect (2 connected players)");
  } catch (e) {
    fail("host can start Trivia after reconnect (2 connected players)", String(e).slice(0, 200));
  }
} catch (e) {
  fail("ws-reconnect journey crashed", String(e).slice(0, 300));
} finally {
  await browser.close();
}
const failed = results.filter(([, ok]) => !ok);
console.log(failed.length === 0 ? "WS-RECONNECT ALL PASSED" : `WS-RECONNECT FAILED: ${failed.length}/${results.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
