# Beta R4: the beta gate's form sign-in refused with `FOREIGN_ORIGIN` (handoff 6932053542)

**The verdict: a preview configuration fault, not a runtime defect.** No runtime change is proposed, and the release pin stays `7097ac2bb062925bb296a129f4771f1e68fd522d`.

## What was reported
- **The setup:** the reviewer's interactive cloud Chromium, in the existing private Codespace on port 3153. The packaged runtime ran in production, with `MCHEZO_PUBLIC_ORIGIN=https://<codespace>-3153.app.github.dev` and `trustProxy=1`.
- **What happened:** the gate's rendered form, submitted with the owner's code, answered `{"error":"Requests from another site are not allowed.","code":"FOREIGN_ORIGIN"}`.
- **The suspected cause:** the site-wide `Referrer-Policy: no-referrer`, making the browser post with `Origin: null`. The reviewer didn't capture the request headers.

## What the pinned source says
- **The gate isn't served under `no-referrer`.**
  - `src/server/http.ts:660-666` serves every gate page with `Referrer-Policy: same-origin`. That is fix B-13 from review 6901841738 R4, made for exactly the `Origin: null` case.
  - This covers `/beta`, the failed-code page, and the gate shown for an ungated page load such as `/` (`:682`).
  - Other responses keep the site-wide `no-referrer` (`src/server/access.ts:38`).
- **This failure was measured before.** Review 6903475177, on `456cb0d`, measured the same refusal in this Codespace: the form post reached the app with `Origin: https://localhost:3153` and `Host: localhost:3153`.
  - `docs/beta/beta-r1-preview-route.md` records that as finding **F1**: GitHub's forwarder replaces an `Origin` equal to the forwarded URL's own origin with a localhost origin for the port.
  - That document's route B was then used for the independent audit (review 6904986723). Route A, configuring the rewritten value, was never validated.

## The reproduction, local only
**`scripts/beta/gate-origin-repro.mjs --image cgn-render:check`** runs the packaged pinned image (`/health` revision `7097ac2…`), one container per case, each with its own label and removed afterwards.
- **The setup:**
  - a synthetic throwaway code, and a self-signed certificate for `preview.test`, both removed afterwards;
  - a stand-in TLS forwarder written in the script;
  - Chromium (`chrome-headless-shell` 153, build 1243).
- **The form path:** the script types the code into the **rendered** form and clicks **Continue**, a native form navigation. It never uses fetch and never supplies an `Origin`.
- **What is recorded:** the `Origin` the browser sent (from the browser's own request), the `Origin` the app received (from the forwarder), and the gate's `Referrer-Policy` as the browser received it.

| Case | The forwarder | Public origin | Gate's Referrer-Policy as received | `Origin` sent → received | Result |
|---|---|---|---|---|---|
| A | passes Host and Origin unchanged (the release architecture) | the URL's | `same-origin` | `https://preview.test:18443` → the same | **admitted** (303), and the app loads. The cookie is `Secure`, `HttpOnly`, `SameSite=Lax`. A wrong code first got 401, the alert, no cookie, and the gate again. |
| B | **Codespaces-like (F1):** a same-origin `Origin` becomes `https://localhost:18443`, Host becomes `localhost:18443` | the URL's (**the reviewer's configuration**) | `same-origin` | `https://preview.test:18443` → **`https://localhost:18443`** | **403 `FOREIGN_ORIGIN`:** the reported result, exactly |
| C | the same forwarder | the rewritten value (route A) | `same-origin` | → `https://localhost:18443` | **admitted**, and the app loads |
| D | passes Origin unchanged, but **appends `Referrer-Policy: no-referrer`** | the URL's | `same-origin`, `no-referrer` | **`null`** → `null` | 403 `FOREIGN_ORIGIN` |

**What this shows:**
1. **The pinned gate's native form works** on an exact HTTPS origin. The browser sends the page's real origin, because the gate's policy is `same-origin` (A).
2. **The reported answer is reproduced exactly** when a forwarder rewrites the browser's correct `Origin` to a localhost origin that the configured public origin doesn't match (B). That is the forwarder behaviour measured in this Codespace before.
3. **The no-referrer mechanism is real, but not the cause here.** It needs something to impose `no-referrer` on the gate page (D, an intermediary appending it). The pinned server sends only `same-origin` on the gate.

**What isn't shown:**
- These are stand-in forwarders, not GitHub's.
- No WebKit (it isn't installed here), and no real iPhone or Android.
- The reviewer's actual request headers weren't captured, so B is the measured-before explanation, reproduced, not a capture of this attempt.

## The correction (the preview, not the runtime)
- **Don't set `MCHEZO_PUBLIC_ORIGIN` to the `…app.github.dev` URL behind GitHub's port forwarder.** Its forwarder rewrites the app's own `Origin`, so the exact-origin check correctly refuses it.
- **Use route B** from `docs/beta/beta-r1-preview-route.md`, which worked for the earlier independent audit (review 6904986723):
  - a private noVNC desktop in the Codespace;
  - a browser in disposable profiles;
  - the app and its TLS proxy on loopback, with the public origin they actually present.
- **Or validate route A first.** Only after `scripts/preview/probe-forwarded-origin.mjs` returns `REWRITTEN_SAME_ORIGIN_ONLY` in that Codespace, start the server with `MCHEZO_PUBLIC_ORIGIN` set to the probe's printed `ownOrigin`. Route A was never validated: the earlier probe returned `INCOMPLETE`. It is unsafe if the forwarder gives a foreign page's request the same value (all `*.app.github.dev` URLs are one site, finding F3).
- **No guard is relaxed.** Null and foreign origins stay refused (case D, and the regressions below).

## Every run, in order
| Run | Code | Verdict | Evidence |
|---|---|---|---|
| Dev 1 | the working tree | **FAILED, infrastructure:** this machine's Docker daemon had stopped, so `docker run` failed. The script left no container; I then made its cleanup also look for any container carrying the run's label. | [dev/run1-docker-down.log](dev/run1-docker-down.log) |
| Dev 2 | the working tree, Docker restarted | **AS EXPECTED,** all four cases (above); no container left, no code in the evidence | [dev/run2.log](dev/run2.log) and its JSON |
| **Final: the reproduction** | **a clean checkout of `8baa35d`** | **AS EXPECTED,** run `20261116T231231-9d088f`, image `sha256:7b53109a7d69` (`/health` revision `7097ac2…`): A admitted, B 403 `FOREIGN_ORIGIN`, C admitted, D 403 with `Origin: null`. Containers 0 before and after; no code in the evidence. | [final/repro-final.log](final/repro-final.log) and [its JSON](final/repro-final-gate-origin-20261116T231231-9d088f.json) |
| **Final: the focused gate regression** | **the same checkout** | **`scripts/check-beta-gate-https.mjs` PASSED (exit 0).** It packs this revision and runs it in production behind an origin-preserving TLS proxy at `https://beta.test:<port>`, in Chromium:<ul><li>**H1–H3, the native rendered form:** a wrong code gets a plain alert, no cookie, still gated; the right code gets 303 back to the asked page; the cookie is `Secure`, `HttpOnly`, `SameSite=Lax` and host-only; the app loads.</li><li>**H4:** a `wss://` live update after entry.</li><li>**H5:** without the cookie, 401 `BETA_ACCESS_REQUIRED` and the socket refused.</li><li>**H6:** with a valid cookie, the foreign Origins `https://evil.test`, `http://` same host, another port, **`https://localhost:<port>`** and **`null`** are each refused on the API (403 `FOREIGN_ORIGIN`), on the code form (403, no cookie) and on the `wss://` handshake (403). The right Origin passes each time.</li></ul>**Note:** this check rewrote its own tracked screenshot (`docs/beta/screenshots/beta-gate-https-then-app-390.png`) in the clean checkout. The regenerated image isn't committed. | [final/gate-https-final.log](final/gate-https-final.log) |
| **Final: the gate's unit tests** | **the same checkout** | **`npx vitest run tests/beta-r1.test.ts` passed 23/23** | [final/unit-final.log](final/unit-final.log) |
| **Final: the static checks** | **the same checkout** | **Passed:**<ul><li>the changes since #45's head `e16dbdd` are only the reproduction script, its evidence and PROGRESS;</li><li>no runtime file differs from `7097ac2`;</li><li>no deploy file differs from `2e2257c`;</li><li>eslint passes;</li><li>the secret scan is empty.</li></ul>Its header counts 1 status line: the screenshot above. | [final/static-final.log](final/static-final.log) |

## Runtime and candidate identity
- **No runtime change, and no new candidate.**
  - The runtime is the release pin `7097ac2bb062925bb296a129f4771f1e68fd522d`, unchanged.
  - The packaged image used is `cgn-render:check` (`sha256:7b53109a7d69`), whose `/health` reports that revision.
  - The release archive identity is unchanged: ChatGPT verified SHA256 `a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131` in 6931689585.
- **No repair PR was opened,** because no runtime defect was confirmed.
