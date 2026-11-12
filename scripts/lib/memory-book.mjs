// Stage 10.2 repair (review 6831760093, S102-R1; D-S102-06): open a seat's Memory Book the way a link would, and
// read what its "linked to" line says. Shared by check-spectrum (a team game: honestly unavailable) and
// check-jebena-rush (a supported game: ready, and the entry cites it).

/** A fresh page in `ctx` for `seat` ({roomId, playerId, token}), loaded straight at /room/memories. */
export async function openMemoryBook(ctx, base, seat) {
  const p = await ctx.newPage();
  await p.goto(`${base}/join`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => { sessionStorage.setItem("cgn_roomId", s.roomId); sessionStorage.setItem("cgn_playerId", s.playerId); sessionStorage.setItem("cgn_token", s.token); }, seat);
  await p.goto(`${base}/room/memories`, { waitUntil: "domcontentloaded" });
  await p.getByTestId("memory-screen").waitFor({ timeout: 15000 });
  return p;
}

/** One read of the line and the Add button, so the state, event and text belong to the same render. */
export const memoryLinkOf = (p) => p.evaluate(() => {
  const el = document.querySelector('[data-testid="memory-link-target"]');
  const add = document.querySelector('[data-testid="memory-add"]');
  const hint = document.querySelector('[data-testid="memory-add-hint"]');
  return { state: el?.getAttribute("data-state") ?? null, event: el?.getAttribute("data-event") ?? null, text: el?.textContent ?? "", addDisabled: add ? add.disabled : null, hint: hint?.textContent ?? "" };
});
