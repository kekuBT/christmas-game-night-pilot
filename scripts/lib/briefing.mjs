// D3 (owner-approved 2026-11-08): a room created now opens every game with a
// server-side BRIEFING: the rules and "I'm ready", with no game clock. Play
// starts for everyone at the same instant once every player is ready
// (docs/ux-redesign/D3_TIMING_CONTRACT.md). Drivers play that real flow:
// each participating phone reads the rules and taps "I'm ready", exactly as
// a family would. Nothing here bypasses the briefing.

/**
 * UI path. Wait until every page shows the briefing, tap "I'm ready" on each
 * (the last tap starts play), then wait until every page has left it.
 * `pages`: the phones of the players in this game (not TV/spectator pages).
 */
export async function passBriefing(pages, { timeout = 20000 } = {}) {
  const list = Array.isArray(pages) ? pages : [pages];
  for (const p of list) await p.getByTestId("briefing").waitFor({ timeout });
  for (const p of list) {
    const btn = p.getByTestId("briefing-ready");
    if ((await btn.count()) === 0) continue;
    if ((await btn.getAttribute("aria-pressed")) !== "true") await btn.click({ timeout });
  }
  for (const p of list) await p.getByTestId("briefing").waitFor({ state: "detached", timeout });
}

/**
 * API path, for drivers that start games with fetch from the page: each page
 * sends its own `briefing-ready` intent with its own session (the server
 * refuses anyone not in the game). Resolves once the server reports play.
 */
export async function readyViaApi(pages, { timeout = 20000 } = {}) {
  const list = Array.isArray(pages) ? pages : [pages];
  for (const p of list) {
    const r = await p.evaluate(async () => {
      const roomId = sessionStorage.getItem("cgn_roomId");
      const token = sessionStorage.getItem("cgn_token") ?? "";
      const headers = { "content-type": "application/json", "x-session-token": token };
      const proj = await (await fetch(`/rooms/${roomId}/projection?audience=player`, { headers })).json();
      const g = (proj.games ?? []).find((x) => x.status === "briefing");
      if (!g) return { skipped: true };
      const body = { intent: { kind: "intent", schemaVersion: 1, clientEventId: crypto.randomUUID(), roomId, gameInstanceId: g.id, action: "briefing-ready", payload: { ready: true } } };
      const res = await fetch(`/rooms/${roomId}/intents`, { method: "POST", headers, body: JSON.stringify(body) });
      return await res.json();
    });
    if (r && r.accepted === false) throw new Error(`briefing-ready refused: ${r.reason}`);
  }
  const end = Date.now() + timeout;
  for (;;) {
    const open = await list[0].evaluate(async () => {
      const roomId = sessionStorage.getItem("cgn_roomId");
      const proj = await (await fetch(`/rooms/${roomId}/projection?audience=tv`)).json();
      return (proj.games ?? []).some((x) => x.status === "briefing");
    });
    if (!open) return;
    if (Date.now() > end) throw new Error("briefing did not end after every player was ready");
    await new Promise((res) => setTimeout(res, 200));
  }
}

/**
 * The host's explicit "Start now" (for drivers whose game deliberately starts
 * with someone not ready or not connected). Waits for the read window, taps
 * Start now and confirms the named people. Returns the names the dialog showed.
 */
export async function hostStartNow(host, { timeout = 40000 } = {}) {
  const btn = host.getByTestId("briefing-start-now");
  await btn.waitFor({ timeout });
  const end = Date.now() + timeout;
  while (await btn.isDisabled()) {
    if (Date.now() > end) throw new Error("Start now never unlocked");
    await new Promise((res) => setTimeout(res, 250));
  }
  await btn.click();
  const dialog = host.getByTestId("briefing-confirm");
  let named = "";
  if (await dialog.waitFor({ timeout: 3000 }).then(() => true, () => false)) {
    named = (await host.getByTestId("briefing-confirm-list").innerText()).trim();
    await host.getByTestId("briefing-confirm-confirm").click();
  }
  await host.getByTestId("briefing").waitFor({ state: "detached", timeout });
  return named;
}
