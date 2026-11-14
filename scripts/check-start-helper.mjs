// Tests the drivers' official-start helper itself (scripts/lib/start.mjs) on
// controlled fake lobby screens, so its behaviour is proven, not hoped:
//   - the race seen in full gate 20261114-120354-5f6cfef0-27338: "Start
//     without Dee?" opens, then closes by itself (the reconnect grace period
//     ended) before the click lands. The OLD helper (click and wait) times
//     out; the new one presses Start again and the game starts;
//   - the question is asked and answered: the game starts without them, and
//     the helper returns the question;
//   - nobody is reconnecting: Start starts at once, nothing is asked;
//   - the question stays open but its button can't be pressed: the helper
//     throws (it never presses Start behind an open question).
// Needs a browser but no server (the base URL argument is ignored).
import { launchChromium } from "./lib/driver-env.mjs";
import { startOfficial } from "./lib/start.mjs";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/**
 * A stand-in for the lobby's Start and the "Start without …?" question.
 *   asks:    how many presses ask first (0 = nobody is reconnecting);
 *   closeMs: the question closes by itself this long after it opens (< 0 = never);
 *   blocked: the question's buttons sit under a cover, so a click can't land (the race's window, held open).
 */
const fakeLobby = ({ asks, closeMs, blocked }) => `<!doctype html><body><div id="app"></div><script>
  let presses = 0; window.started = null;
  const app = () => document.getElementById("app");
  const lobby = (question) => { app().innerHTML = '<button data-testid="start-official-trivia" onclick="press()">Start Trivia</button>' + (question ?
    '<div data-testid="mz-start-decision" role="alertdialog" style="position:relative">Dee is reconnecting. Start Trivia without them?' +
    '<button data-testid="mz-start-wait">Wait for Dee</button><button data-testid="mz-start-without" onclick="go(true)">Start without Dee</button>' +
    (${blocked} ? '<div style="position:absolute;inset:0;background:transparent"></div>' : '') + '</div>' : ''); };
  window.go = (without) => { window.started = { without, presses }; app().innerHTML = '<p>Rules: tap I’m ready</p>'; };
  window.press = () => {
    presses++;
    if (presses > ${asks}) return go(false);
    lobby(true);
    if (${closeMs} >= 0) setTimeout(() => lobby(false), ${closeMs});
  };
  lobby(false);
</script></body>`;

/** The helper before the fix, verbatim in behaviour: click Start; if asked, click "Start without" and wait. */
async function oldStart(page, timeout) {
  await page.getByTestId("start-official-trivia").click();
  const decision = page.getByTestId("mz-start-decision");
  if (await decision.waitFor({ timeout: 2500 }).then(() => true, () => false)) {
    await page.getByTestId("mz-start-without").click({ timeout });
  }
}

const browser = await launchChromium();
try {
  let page = await browser.newPage();
  const fresh = async (html) => { await page.close(); page = await browser.newPage(); await page.setContent(html); };
  const started = () => page.evaluate(() => window.started);
  const logs = [];
  const log = (s) => logs.push(s);

  // The race: asked once, the question closes 600 ms later while its button can't be pressed yet.
  await fresh(fakeLobby({ asks: 1, closeMs: 600, blocked: true }));
  const oldErr = await oldStart(page, 4000).then(() => null, (e) => e);
  check("old helper: the question closes before the click lands, and the click times out", !!oldErr && /Timeout/.test(String(oldErr)) && (await started()) === null,
    String(oldErr).split("\n")[0]);

  await fresh(fakeLobby({ asks: 1, closeMs: 600, blocked: true }));
  logs.length = 0;
  const q1 = await startOfficial(page, "start-official-trivia", { log });
  const s1 = await started();
  check("new helper: presses Start again after the question closes by itself, and the game starts", s1?.without === false && s1.presses === 2, JSON.stringify(s1));
  check("new helper: returns the question that was asked", (q1 ?? "").includes("Start Trivia without them?"), q1 ?? "null");
  check("new helper: says the question closed by itself", logs.some((l) => l.includes("closed by itself")), logs.join(" | "));

  // Asked and answered: starts without them on the first press.
  await fresh(fakeLobby({ asks: 1, closeMs: -1, blocked: false }));
  const q2 = await startOfficial(page, "start-official-trivia", { log });
  const s2 = await started();
  check("asked and answered: the game starts without them", s2?.without === true && s2.presses === 1 && (q2 ?? "").includes("Dee is reconnecting"), JSON.stringify(s2));

  // Nobody reconnecting: nothing asked.
  await fresh(fakeLobby({ asks: 0, closeMs: -1, blocked: false }));
  const q3 = await startOfficial(page, "start-official-trivia", { log });
  const s3 = await started();
  check("nobody reconnecting: Start starts at once and nothing is asked", q3 === null && s3?.without === false && s3.presses === 1, JSON.stringify(s3));

  // The question stays open but can't be answered: throw, never press Start behind it.
  await fresh(fakeLobby({ asks: 5, closeMs: -1, blocked: true }));
  const err = await startOfficial(page, "start-official-trivia", { log }).then(() => null, (e) => e);
  const s4 = await started();
  check("an open question that can't be answered throws, and Start is not pressed again", !!err && /still open/.test(String(err)) && s4 === null,
    String(err).split("\n")[0]);
} finally {
  await browser.close();
}
console.log(failures === 0 ? "START HELPER PASSED" : `START HELPER FAILED: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
