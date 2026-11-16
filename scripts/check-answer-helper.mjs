// Tests the drivers' answering helper itself (scripts/lib/answer.mjs) on
// controlled fake question screens, so its behaviour is proven, not hoped:
//   - a slow app (answers confirmed after 1.2s): the OLD fixed-sleep helper
//     answers 1 of 3 and returns silently; the new helper answers all 3;
//   - an app that never confirms an answer: the new helper throws, naming
//     the player, the question and the state it was stuck in;
//   - a normal flow ends on the waiting ring with every question answered;
//   - Beta R1-R (R5): the last answer goes straight to "All your answers are
//     in"; a locked view with no Next question fails loudly.
// Needs a browser but no server (the base URL argument is ignored).
import { launchChromium } from "./lib/driver-env.mjs";
import { AnswerStuckError, answerKitQuestions } from "./lib/answer.mjs";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** A tiny stand-in for the kit's question flow. confirmMs < 0 = never confirms. brokenFinal = the old final keycap-less locked view. */
const fakeApp = (confirmMs, count = 3, brokenFinal = false) => `<!doctype html><body><div id="app"></div><script>
  let q = 1; const answers = [];
  const render = (html) => { document.getElementById("app").innerHTML = html; };
  const question = () => render('<main class="mz-screen" aria-label="Question ' + q + ' of ${count}">' +
    [0,1,2,3].map(i => '<button class="mz-slab" onclick="tap(' + i + ')">Option ' + i + '</button>').join("") + '</main>');
  const locked = () => render('<main class="mz-screen" aria-label="Answer locked in"><button onclick="next()">Next question</button></main>');
  const lockedNoNext = () => render('<main class="mz-screen" aria-label="Answer locked in"><p>Locked in</p></main>');
  // Uppercased by CSS like the real kit kicker (innerText returns "ALL YOUR ANSWERS ARE IN").
  // R5: the app shows this straight after the last answer (no continuation control).
  const waiting = () => render('<main class="mz-screen" aria-label="All your answers are in"><p style="text-transform:uppercase">All your answers are in</p></main>');
  window.tap = (i) => { if (${confirmMs} < 0) return; setTimeout(() => { answers.push(i); if (answers.length < ${count}) locked(); else if (${brokenFinal}) lockedNoNext(); else waiting(); }, ${confirmMs}); };
  window.next = () => { q++; question(); };
  window.answered = () => answers.length;
  question();
</script></body>`;

/** The pre-Sprint-2 helper, verbatim in behaviour: tap, sleep 250ms, give up if "Next question" is not visible within 500ms. */
async function oldAnswerAll(page) {
  for (let i = 0; i < 12; i++) {
    const slab = page.locator(".mz-slab:not([disabled])").first();
    if (await slab.isVisible({ timeout: 1500 }).catch(() => false)) { await slab.click(); await page.waitForTimeout(250); }
    const next = page.getByRole("button", { name: "Next question" });
    if (await next.isVisible({ timeout: 500 }).catch(() => false)) { await next.click(); await page.waitForTimeout(250); }
    else return;
  }
}

const browser = await launchChromium();
try {
  // A fresh page per scenario: setContent reuses the window, and each
  // fixture declares its own globals.
  let page = await browser.newPage();
  const fresh = async (html) => { await page.close(); page = await browser.newPage(); await page.setContent(html); };

  await page.setContent(fakeApp(1200));
  await oldAnswerAll(page);
  const oldCount = await page.evaluate(() => window.answered());
  await page.waitForTimeout(1500);
  check("old helper on a slow app returns silently with questions unanswered", oldCount < 3, `answered ${oldCount} of 3, no error raised`);

  await fresh(fakeApp(1200));
  const n = await answerKitQuestions(page, { player: "Bea", choose: () => 1, timeout: 5000 });
  check("new helper on the same slow app answers every question", n === 3 && (await page.evaluate(() => window.answered())) === 3, `answered ${n}`);

  await fresh(fakeApp(-1));
  let err = null;
  try { await answerKitQuestions(page, { player: "Cal", choose: () => 0, timeout: 1500 }); } catch (e) { err = e; }
  check("an answer that is never confirmed fails loudly", err instanceof AnswerStuckError, String(err?.message ?? "no error"));
  check("the failure names the player, the question and the stuck state", /Cal: after answering question 1 of 3/.test(err?.message ?? "") && /"kind":"question"/.test(err?.message ?? ""));
  // Sprint 3: it also carries the server/screen diagnosis (no server here, so it says so).
  check("the failure carries a lifecycle diagnosis line", /DIAG player=Cal server=unavailable\(.+\) \| screen="Question 1 of 3".* type=server-unreachable/.test(err?.message ?? ""), String(err?.message ?? "").split("\n").at(-1));

  await fresh(fakeApp(50));
  const m = await answerKitQuestions(page, { player: "Dee", choose: (q) => q % 4 });
  const ended = await page.evaluate(() => /all your answers are in/i.test(document.body.innerText));
  check("a normal flow answers all questions and ends on the waiting ring", m === 3 && ended);

  await fresh(fakeApp(50, 3, true));
  let err2 = null;
  try { await answerKitQuestions(page, { player: "Fay", choose: () => 0, timeout: 1500 }); } catch (e) { err2 = e; }
  check("a locked view with no Next question fails loudly (R5)", err2 instanceof AnswerStuckError && /Fay: the locked view has no Next question/.test(err2.message), String(err2?.message ?? "no error").split("\n")[0]);

  await fresh(fakeApp(50, 5));
  const partial = await answerKitQuestions(page, { player: "Eli", choose: () => 2, limit: 2 });
  check("limit stops after exactly n answers (\"answer 2, then the phone dies\")", partial === 2 && (await page.evaluate(() => window.answered())) === 2);
} finally {
  await browser.close();
}
console.log(failures === 0 ? "ANSWER HELPER ALL PASSED" : `ANSWER HELPER FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
