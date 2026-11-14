/**
 * Press an official Start, answering "Start without …?" when the host is asked first.
 *
 * Sprint 2: an official start asks before leaving out someone still reconnecting. The question closes
 * by itself the moment nobody it names is reconnecting any more (App.tsx: they came back, or the
 * reconnect grace period, RECONNECT_GRACE_MS = 45 s, ended); the host then just presses Start again.
 * A driver that starts about 45 s after someone left can see the question open and then close before
 * its click lands. Full gate 20261114-120354-5f6cfef0-27338: check-leaderboard found "Start without
 * Dee", the question closed, and the click waited 30 s for a button that was gone. So when the
 * question closes by itself, press Start again (at most three times), as a host would.
 *
 * Returns the question's text when it was asked (the last one), else null.
 */
export async function startOfficial(page, startTestId, { log = console.log } = {}) {
  let asked = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.getByTestId(startTestId).click();
    const decision = page.getByTestId("mz-start-decision");
    if (!(await decision.waitFor({ timeout: 2500 }).then(() => true, () => false))) return asked;
    asked = ((await decision.textContent()) ?? "").replace(/\s+/g, " ");
    log(`note: start asked first — ${asked.slice(0, 80)}`);
    if (await page.getByTestId("mz-start-without").click({ timeout: 5000 }).then(() => true, () => false)) return asked;
    if (await decision.isVisible()) throw new Error(`${startTestId}: "Start without" couldn't be pressed although the question is still open: ${asked}`);
    log("note: the question closed by itself (nobody it named is reconnecting any more); pressing Start again");
  }
  throw new Error(`${startTestId}: the start question kept closing before it could be answered`);
}
