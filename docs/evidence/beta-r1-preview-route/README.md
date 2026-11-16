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
