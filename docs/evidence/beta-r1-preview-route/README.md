# Beta R1-R: the preview route investigation (handoff 6903638660)

**The procedure and its reasoning:** `docs/beta/beta-r1-preview-route.md`.

**What these are:** local runs in my container. They ran against a **local stand-in** for GitHub's port forwarder (`fwd.mjs.txt`), never GitHub's forwarder, the reviewer's Codespace or the cloud browser.
- **Format:** scripts are saved as `.txt`. `<scratchpad>` stands for my throwaway folder.
- **Data:** every access code and room is synthetic.
- **Ran alone:** nothing else ran meanwhile, no gate or test.

| File | What ran | Result |
|---|---|---|
| `psl-check.out.txt` | The Public Suffix List as bundled in `tldts` 7.5.4. `publicsuffix.org` doesn't resolve from this session. | `*.app.github.dev` names are all the same site, `github.dev`; `app.github.dev` is no public suffix. The controls `github.io`, `vercel.app` and `ngrok.io` are recognised as private-section suffixes. |
| `probe-test-run1-no-browser.out.txt` | `probe-test.mjs` (`probe-test.mjs.txt`), first run | **FAILED: my harness's error.** The repo's Playwright looked for a browser build that isn't installed. Rerun with the gates' own Chromium (`MCHEZO_CHROMIUM_PATH`). |
| `probe-test-run2.out.txt` | the same, with the gates' Chromium; the probe's first version | **PASSED, 4/4 verdicts.** In this version the other page had `Referrer-Policy: same-origin`, so its cross-origin form post carried `Origin: "null"` (refused by the app). The final probe gives the other page the browser's default policy, so it carries its real origin. |
| `probe-test-run3.out.txt` | the final probe (`scripts/preview/probe-forwarded-origin.mjs`) | **PASSED, 4/4:** `same-origin-only` gives `REWRITTEN_SAME_ORIGIN_ONLY` (own origin `https://localhost:3155`); `all` gives `UNSAFE`; `http-only` gives `INCONSISTENT`; `none` gives `PRESERVED`. Chrome for Testing 153 sent `Sec-Fetch-Site` on fetch and form requests, and **none on WebSocket handshakes**. |
| `release-456cb0d.json`, `pack-456cb0d-tail.log` | `scripts/release/pack.mjs` from a clean clone of `456cb0d`, then `npm ci --omit=dev` | packed and installed, exit 0; revision `456cb0de3bfea99b2c47234e5729eb6b03b53efc` |
| `route-a-run1.out.txt` | `route-a-test.mjs` (`route-a-test.mjs.txt`): the packed candidate in production behind the stand-in, driven by Chromium | **ROUTE A TEST PASSED, 10/10.** **S0:** the forwarded URL as the public origin gives 403 on the code form (6903475177 reproduced). **S1, route A:** entry, cookie flags, `/health` = `456cb0d`, room 201 and WebSocket projection all work; a sibling origin's POST and WebSocket both get 403. **S2:** a forwarder that rewrites every Origin lets the sibling page create a room (201) and open a WebSocket (101), which is why the probe must pass first. |

## The probe's repair (review 6903845075)
**The finding:** the first probe's verdict treated comparison requests that never arrived as proof the forwarder stopped them, and the other page's `done` marker as evidence. It passed partial and Origin-less records.

**The repair:** the verdict is a pure `classify()`. It needs **positive** evidence for all three transports on both sides and a valid https own Origin. It refuses known conflicts, and anything missing or unattributed is `INCOMPLETE`.

| File | What ran | Result |
|---|---|---|
| `old-verdict-replay.mjs.txt`, `old-verdict-replay-f6647ee.out.txt` | the first probe's `verdict()` (`f6647ee`), extracted verbatim and run on the review's three fixtures, in memory only | **All three PASS, wrongly, as the review found:** `REWRITTEN_SAME_ORIGIN_ONLY` with no comparison sample; the same with one of three; and the same with no Origin at all (`ownOrigin null`). |
| `probe-verdict-tests-run1.log` | `tests/preview-probe-verdict.test.ts` on the repaired probe, offline | **16/16.** The three false passes fail closed (`INCOMPLETE`, `INCOMPLETE`, `UNSUITABLE`). Complete, consistent records pass with the right origin (`REWRITTEN_SAME_ORIGIN_ONLY` and `PRESERVED`). The refusals are `UNSAFE`, `INCONSISTENT` and `UNSUITABLE`. Missing or unattributed evidence is `INCOMPLETE`, and the `done` marker changes nothing. Typecheck and lint exit 0. |
| `probe-test-run4-harness-timeout.out.txt` | the stand-in run with a fifth behaviour, `block-foreign` | **FAILED: my harness's error.** It waited for the other page's old "done" text, which the repair rewords, and timed out after 30 s. It also left the probe child running, which held the pipe open until I stopped it. The harness now waits for the new text and always stops the probe. |
| `probe-test-run5.out.txt` | the same, with the fixed harness | **PASSED, 5/5:** `same-origin-only` gives `REWRITTEN_SAME_ORIGIN_ONLY`; `all` gives `UNSAFE`; `http-only` gives `INCONSISTENT`; `none` gives `PRESERVED`; **`block-foreign` gives `INCOMPLETE`** (the stand-in refused the 3 foreign requests; the first probe would have passed). No probe process left running. |
| `route-b-tls-test.mjs.txt`, `route-b-tls-run1.out.txt` | route B's browser half: the packed `456cb0d` in production, a TLS proxy whose certificate a session CA issued, and Chromium on the same machine with that CA trusted only in an NSS database under a throwaway `HOME`. No certificate error is ignored. | **ROUTE B TLS TEST PASSED, 7/7.** **B0 (an empty trust store):** `ERR_CERT_AUTHORITY_INVALID`. **B1:** entry (303), a `Secure`/`HttpOnly`/`Lax` cookie, `/health` = `456cb0d`, the API (201), the WebSocket (projection), and only the browser's own Origin received. |

| `final-focused-before-commit.log` | the focused checks on the final tree, just before the commit: the classifier tests, typecheck, lint | **16/16, tsc exit 0, eslint exit 0** |
