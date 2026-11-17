# W7 private preview: where the Origin incompatibility is (handoff 6957705907)

**Status:** an investigation and one recommendation, for architecture review.
- **Implemented:** nothing in the operator tool or the probe.
- **Unchanged:** the runtime.
- **Not run:** anything in the Codespace.

W7 and B-W7-01 stay OPEN.

## The input (review 6957543881, the owner's retry)
The browser opened `https://<codespace>-3157.app.github.dev` (the address bar was shown), and the top-control receipt succeeded.

| Request | `Origin` as the server received it |
|---|---|
| the page's own fetch POST, form POST and WebSocket | `http://localhost:3157` |
| the 3158 page's cross-origin fetch and WebSocket, and its top-control | `https://<codespace>-3158.app.github.dev` (kept) |
| an iframe | `null` |

The own fetch and form also carried an HTTPS `Referer` and `X-Forwarded-Proto: https`.

## What rejected it, exactly
1. **What stopped the run was our tooling, not the runtime.**
   - `scripts/preview/probe-forwarded-origin.mjs:90-91`: an own Origin that isn't a valid https origin gives `UNSUITABLE`.
   - `scripts/beta/w7-owner-preview.sh:146-147`: `start` refuses any verdict other than `REWRITTEN_SAME_ORIGIN_ONLY` or `PRESERVED`, and any `ownOrigin` that isn't `https://`.
   - **Where the rule came from:** `docs/beta/beta-r1-preview-route.md:89` and `:129`. An `http://` public origin makes the runtime drop the cookie's `Secure` flag.
2. **What the runtime would do,** if the tool used the address-bar origin: `AccessGuard.foreignOrigin` (`src/server/access.ts:76-79`).
   - It compares the request's normalized Origin exactly with the configured public origin. A missing Origin passes this check; one that can't be parsed (`null` included) is refused.
   - The forwarder's rewritten own requests don't match the address-bar origin, so they are refused. **C0 below reproduces this:** 403 `FOREIGN_ORIGIN` on the API, the form and the WebSocket.

## What the runtime needs, and what our tooling assumed
| Constraint | Needed by | Kept by the recommendation |
|---|---|---|
| Exactly one configured origin is admitted (B-03) | the runtime | yes, unchanged |
| The public origin is `https://` | **not the runtime.** `normalizeOrigin` (`access.ts:43-48`) accepts `http:`, and production only requires one to be set (`serve.ts:58`). This rule is the tooling's. | the app keeps an `https://` origin |
| The cookie is `Secure` | the runtime sets it **only when the public origin is https** (`access.ts:96-98`). One value decides both the matched origin and the cookie flag (F5 of the route-A doc), which is the coupling behind this blocker. | yes |
| The beta cookie gate (B-04) | the runtime | yes, unchanged |
| No trust in `X-Forwarded-*`, `Referer` or `Sec-Fetch-*` | the runtime reads none of them for this decision. `X-Forwarded-For` is read only with `MCHEZO_TRUST_PROXY`, which isn't set. The spoof case below shows it. | yes, and the adapter reads none of them either |
| Both releases run unchanged | W7: `988c535` and the audited `7097ac2` | yes, so a runtime change can't be the fix |

## Options considered
| Option | Result |
|---|---|
| **C1:** `MCHEZO_PUBLIC_ORIGIN=http://localhost:3157`, configuration only | **It works, with no new code** (measured below). But it ties the cookie to the internal value: the cookie loses `Secure`, and the app is configured with a value that isn't its identity. **Not recommended:** the handoff asks to keep the external identity and the internal Origin separate, cookie included. |
| A runtime setting that separates the matched origin from the cookie flag | It would change both pinned runtimes, including the audited `7097ac2`. **Not available for W7.** |
| Setting the port's protocol to HTTPS, hoping the rewrite becomes `https://localhost:3157` | **A hypothesis only.** The earlier `https://localhost:3153` measurement (6903475177) had no recorded cause. It also needs a TLS terminator and another owner experiment. |
| Route B (a browser inside the Codespace, over noVNC) | It worked before, with Firefox ESR (6904986723). **It stays the fallback.** It isn't the owner's own browser. |
| **C2: a preview-only adapter that restores one exact Origin value** | **Recommended**, below. |

## The recommendation: C2
**The process:** a new `scripts/preview/origin-adapter.mjs`, outside the release. `w7-owner-preview.sh` starts and stops it in the existing run folder.

**Binding:**
- **The adapter** listens on `127.0.0.1:<APP_PORT>` (3157, the Private forwarded port).
- **The app** moves to `127.0.0.1:<APP_PORT+2>` (3159). Nothing forwards that port on purpose. If it gets auto-forwarded, it is Private, and its own rewritten value `http://localhost:3159` matches nothing, so it is refused.

**The values are computed, never typed:**
- **internal** = `http://localhost:<APP_PORT>`. It must equal the probe report's `ownOrigin` byte for byte.
- **external** = `https://$CODESPACE_NAME-<APP_PORT>.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`. It must end in `.app.github.dev`.
- The app gets `MCHEZO_PUBLIC_ORIGIN=external`, its real identity, so its cookie is `Secure`.

**The rule, in order:**
1. A request that carries no Origin, on an Upgrade or a non-GET/HEAD method: 403 `ORIGIN_REQUIRED`.
2. An Origin already equal to **external:** 403 `ORIGIN_NOT_REWRITTEN`. The forwarder is measured never to deliver it, so if GitHub's behaviour changes, this fails closed and gets noticed.
3. An Origin exactly equal to **internal:** it is replaced by **external**.
4. **Everything else passes unchanged,** and the runtime's own check decides. `null` and foreign origins get 403 `FOREIGN_ORIGIN`.

**What it never does:**
- It doesn't read `Referer`, `Sec-Fetch-*`, `Host` or `X-Forwarded-*`.
- It adds and removes no header other than Origin.
- It logs Origin values and counts only: never cookies, bodies or tokens.

**The upstream:** loopback only, one fixed port. As today, any process inside the Codespace can reach any 127.0.0.1 port. Production's proxy-on-loopback design makes the same assumption.

### The trust argument
1. **Only the owner gets in.** The port is Private, and GitHub's forwarder authenticates the owner's signed-in browser.
2. **The forwarder has already told the two kinds of request apart.** It rewrote only the page's own Origin and kept the sibling's (6957543881). The adapter doesn't try to tell them apart itself: it restores that one value.
3. **C2 admits nothing C1 refuses.** For every request that carries an Origin, the two decide the same way: a request gets in only when it arrives with Origin exactly `http://localhost:3157` and has the beta cookie. For a POST or WebSocket without an Origin, C2 is stricter.
   - C1 is a supported runtime configuration.
   - C2 changes only what the app is told its identity is, so the cookie is `Secure`, and the public origin has production's https shape.
4. **What remains:** a page genuinely served at `http://localhost:3157` in the owner's own browser, on their computer, would carry the same value.
   - It is cross-site to `github.dev`, so the `SameSite=Lax` beta cookie isn't sent with its fetch, form POST or WebSocket, and the gate refuses them. The checks without the cookie show this: API 401, WebSocket 401.
   - It could submit the code form only if it knew the code.

### Platform assumptions
- **A1, the forwarder's rule:** the page's own Origin becomes `http://localhost:<port>`, and others are unchanged.
  - **Evidence:** measured 2026-11-17 for one sibling origin. GitHub doesn't document it.
  - **Mitigation:** the probe measures it at the start of each session. Any other result stops the run, and every existing refusal is kept.
- **A2:** the port stays Private.
- **A3:** browsers send Origin on POST and on the WebSocket handshake. This only matters for whether refusal 1 could get in the way.
- **A4:** `SameSite=Lax` cross-site behaviour, for the localhost residual.
- **A5:** processes inside the Codespace are trusted, as now.

## The local validation (`repro-origin-cases.mjs`)
**The setup:**
- the real runtime from this checkout's source, under `NODE_ENV=production`, gated, on loopback;
- each request sent with its headers **as the server received them** in the Codespace (there is no stand-in forwarder);
- C2 uses a **model** of the adapter written inside the test. It isn't the operator tool.

**For each configuration and each Origin:** the API (`POST /rooms`) with a valid cookie, the code form (`POST /beta/enter`), and the WebSocket handshake with a valid cookie.

| Origin | C0: public origin = the address bar, sent directly | C1: `http://localhost:3157`, sent directly | C2: the address bar, behind the adapter model |
|---|---|---|---|
| `http://localhost:3157`, own as received | **403** on all three: the blocker | admitted, cookie **not** `Secure` | admitted, cookie `Secure` |
| the address-bar origin | admitted (but the forwarder never delivers it) | 403 | 403 `ORIGIN_NOT_REWRITTEN` |
| the sibling `https://…-3158…`, as received | 403 | 403 | 403 (runtime) |
| `null` | 403 | 403 | 403 (runtime) |
| `https://localhost:3157` (scheme swapped), `http://localhost:3158`, `https://evil.example` | 403 | 403 | 403 (runtime) |
| foreign, with spoofed `X-Forwarded-Host/Proto`, `Referer` and `Sec-Fetch-Site: same-origin` | 403 | 403 | 403 (runtime) |
| missing | passes the origin check (production, a plain navigation) | the same | 403 `ORIGIN_REQUIRED` on POST and WebSocket |
| the admitted value without the beta cookie | API 401 `BETA_ACCESS_REQUIRED`, WebSocket 401 | the same | the same |

The runs are in `final/`, and its `summary.txt` gives the revision and verdict.

## The implementation plan (only after the architecture review)
1. **`scripts/preview/origin-adapter.mjs`,** about 70 lines: the rule above as a command-line tool. It refuses to start when:
   - the internal value isn't `http://localhost:<listen port>`;
   - the external value isn't on `.app.github.dev`, or isn't for this Codespace and port;
   - either address isn't 127.0.0.1;
   - the two ports are the same.
2. **The probe:** a new passing verdict, `REWRITTEN_TO_LOOPBACK`.
   - **When it passes:** every own observation is exactly `http://localhost:<target port>`, and the comparison side is complete and kept, under the same rules as now.
   - **Every other non-https own value stays `UNSUITABLE`.**
   - **Its tests** (`tests/preview-probe-verdict.test.ts`) gain the observed report's shape as a fixture, plus negatives: another port, `http://127.0.0.1:<port>`, and mixed http/https (`INCONSISTENT`).
3. **`w7-owner-preview.sh start`:** only on that verdict.
   - It starts the app on the internal port with `MCHEZO_PUBLIC_ORIGIN=external`, and the adapter on `APP_PORT`.
   - Both process ids go in the run folder; `stop` and `status` cover both.
   - There is no new cleanup path: the adapter's only file is its log, in the run folder.
4. **The self-test:** these origin cases against the real adapter instead of the model, plus the start refusals.

**Estimate:** about 60–90 minutes after approval, including the self-test and the local run. No full regression.

## The live-audit plan (ChatGPT's)
1. **The probe,** once at the start of the session. This is the new route's precondition, not a repeat of the failed one. The expected verdict is `REWRITTEN_TO_LOOPBACK`.
2. **`start`:** `/health` shows the expected revision.
3. **The owner,** with the address bar visible:
   - a wrong code gets the alert and no cookie;
   - the right code returns to the app;
   - DevTools shows the cookie `Secure`, `HttpOnly` and `SameSite=Lax`;
   - live updates work.
4. **ChatGPT reads the adapter's counts:** some renamed; 0 `ORIGIN_NOT_REWRITTEN`; foreign values passed to the runtime and refused.
5. **Then phase A,** as in the packet.

## Not shown
- GitHub's forwarder itself (the requests replay its measured output).
- A real browser's `SameSite` handling of the localhost residual.
- The adapter as a real program (only its model).
- Any Codespace run.
- B-W7-01 (the real audited release pair) is still open.
- Owner-run evidence is still not independent testing.
