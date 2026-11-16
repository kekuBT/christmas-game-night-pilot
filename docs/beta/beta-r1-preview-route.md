# Beta R1-R: a private route for the audit preview (handoff 6903638660)

**Status:** an investigation and one proposed procedure. The beta stays on HOLD.
- **Not changed:** no product source and no production guard.
- **Not touched:** no reviewer workspace, no public port, no tunnel account, no paid resource and no deployment.

**What was asked:** a supported $0 private route that lets the reviewer's interactive cloud browser reach the exact packed candidate (`456cb0de3bfea99b2c47234e5729eb6b03b53efc`) with the production origin check meaningful.

**The blocker** (measured by the reviewer on `456cb0d`, review 6903475177): the gate's code form, posted through the private forwarded URL, reached the app with:
- `Origin: https://localhost:3153`;
- `Host: localhost:3153`;
- `X-Forwarded-Host: <codespace>-3153.app.github.dev`;
- `X-Forwarded-Proto: https`.

The app was configured with the forwarded URL as its public origin, so it answered 403 `FOREIGN_ORIGIN`.

**Estimate:** about 2 h 10 min, written at 7:08 p.m. ET before the work. The actual time is at the end.

## What is established, and how well
| # | Fact | Source | How sure |
|---|---|---|---|
| F1 | GitHub's forwarder replaces an `Origin` **equal to the forwarded URL's own origin** with a localhost origin for the port. It **leaves other Origins unchanged** (`Origin: http://example.com` arrived as itself). | A community report with curl tests: symfony/demo#1542 (Dec 2024). Rails and Next.js reports of the same symptom agree. | **Not GitHub documentation.** That report saw `http://localhost:<port>`; the reviewer saw `https://localhost:3153`. So the rule must be **measured** in this Codespace before anything relies on it. |
| F2 | Ports are private by default. Visibility can be private, organization or public. The forwarder talks HTTP to the app unless the port's protocol is set to HTTPS. | GitHub's docs, through search summaries. `docs.github.com` doesn't resolve from my session, so I couldn't read the pages. | Secondhand |
| F3 | **`app.github.dev` is not a public suffix.** Every forwarded URL, of every codespace and every user, is the **same site**: `github.dev`. | The Public Suffix List as bundled in `tldts` 7.5.4. The controls `github.io`, `vercel.app` and `ngrok.io` are recognised as suffixes. `publicsuffix.org` doesn't resolve from my session. | The bundled list, not read live |
| F4 | Chromium sends **no** `Sec-Fetch-Site` on a WebSocket handshake. It does send one on fetch and form requests: `same-origin`, or `same-site` from a sibling port. | Measured here: Chrome for Testing 153 headless shell, through the stand-in forwarder. | One browser build |
| F5 | The configured public origin controls exactly two things: the exact-origin check (`AccessGuard.foreignOrigin`) and the beta cookie's `Secure` flag. Join links, invite links and QR codes use the browser's own `location.origin`. | `src/server/access.ts`, `apps/web/src/App.tsx`, `TvShow.tsx` | Read in the code |

**What F3 means:** `SameSite=Lax` does **not** separate the preview from other forwarded pages. A page on any `*.app.github.dev` origin is the same site, so the browser sends the beta cookie with that page's requests to the preview. That includes another port of this Codespace, or someone else's public port the owner happens to open. The **exact-origin check is the only thing that refuses them.** Any route has to keep that check meaningful, and the route below is chosen for that reason.

## Route A (recommended, conditional): configure the one origin the forwarder gives the app's own requests
**The idea:** start the packed candidate with `MCHEZO_PUBLIC_ORIGIN` set to the exact value the forwarder turns the app's **own** origin into (e.g. `https://localhost:3153`).
- **Nothing in the code changes.** The check still accepts exactly one origin. The gate, cookie flags, TLS in the browser, private visibility and the synthetic data are all as before.
- **It is only safe if the forwarder rewrites the app's own origin and nothing else** (F1). The probe below decides that first.
  - If a foreign page's request arrived with the same value, the check couldn't tell them apart. **That is the stop condition.**
  - The local stand-in demonstrates exactly that failure: S2 in the evidence.

**Where each part runs:**
| Part | Where | Authorization it uses |
|---|---|---|
| The probe (step 1), then the packed server (step 2) | inside the existing Codespace, on `127.0.0.1:3153`; the probe's second port is 3156 | the Codespace's own; nothing new |
| The forwarder | GitHub's, in front of the **private** ports, as now | the owner's GitHub sign-in in the browser, which a private port requires. No `gh`, no tunnel, no token handling. |
| The browser | the reviewer's interactive cloud browser, already signed in, opening `https://<codespace>-3153.app.github.dev/` | as in 6903475177 |
| Left alone | the Stage 5 device-test server and the editor services | |

### Step 0: preconditions
- The review-owned preview is stopped and port 3153 is free.
- The candidate worktree is clean at `456cb0d`, and the packed release from it is in place (the reviewer's `package.log`).

### Step 1: the probe (no app, no data; about 10 min)
`scripts/preview/probe-forwarded-origin.mjs` is at the PR head, outside the candidate's code. It is a header-echo pair of listeners on 127.0.0.1. It records Origin, Host, `X-Forwarded-*`, `Sec-Fetch-*` and whether a cookie was present, **never a cookie's value**, a token or a body.
```bash
mkdir -p /tmp/origin-probe && cd /tmp/origin-probe
git -C <candidate worktree> fetch origin claude/beta-r1-readiness
git -C <candidate worktree> show <the PR head named in the report>:scripts/preview/probe-forwarded-origin.mjs > probe.mjs
ln -s <packed release>/node_modules node_modules          # for its one import, ws
node probe.mjs --target-port 3153 --other-port 3156 --out /workspaces/mchezo-evidence-beta-456cb0d/forwarded-origin-probe.json
```
1. **Check visibility:** in the Codespace's Ports panel, **3153 and 3156 must both show Private**, which is the default.
2. **Open the other port's page:** `https://<codespace>-3156.app.github.dev/`, in the cloud browser. It sends a POST, a form post and a WebSocket to 3153 **from another origin**, then shows "done".
3. **Open the target page:** `https://<codespace>-3153.app.github.dev/`. It sends the same three from its own origin, then shows the verdict.
4. **Stop the probe:** Ctrl-C. The report stays in `--out`.

**Decide from the verdict:**
| Verdict | Meaning | Next |
|---|---|---|
| `REWRITTEN_SAME_ORIGIN_ONLY` | The app's own form post, fetch and WebSocket all arrived with one value, the report's `ownOrigin`. The other origin's requests arrived as themselves, or never reached the app. | Step 2, with `MCHEZO_PUBLIC_ORIGIN` = `ownOrigin`, exactly as printed. |
| `PRESERVED` | Same-origin requests keep the forwarded URL's own origin. | Step 2 with the forwarded URL itself. That contradicts 6903475177, so look at the report first. |
| `UNSAFE` | A foreign request arrived with the app's own value, or with none. | **Stop route A.** Use route B. |
| `INCONSISTENT` | The app's own requests arrived with different values, e.g. the WebSocket not rewritten like the POST. No single origin fits. | **Stop route A.** Use route B. |
| `INCOMPLETE` | A step is missing; the report names it. | Repeat steps 2–3. |

### Step 2: start the packed candidate (about 5 min)
From the packed release directory:
```bash
NODE_ENV=production PORT=3153 MCHEZO_LISTEN_HOST=127.0.0.1 \
MCHEZO_PUBLIC_ORIGIN='<ownOrigin from step 1, e.g. https://localhost:3153>' \
MCHEZO_DATA_DIR=/workspaces/mchezo-evidence-beta-456cb0d/preview-data-$(date +%s) \
MCHEZO_BETA_ACCESS_CODE='<a synthetic code, 12+ characters>' \
node dist/server/serve.js
```
- **What it prints:** `Listening on 127.0.0.1; public origin <ownOrigin>.`
- **No `MCHEZO_TRUST_PROXY`:** every request then counts as one address, the forwarder's. That is fine for one auditor, and the gate's wrong-code limit (10 per 15 min) is shared.

### Step 3: verify before the audit
- **Visibility:** the Ports panel shows 3153 **Private**.
- **The revision:** `/health` in the cloud browser shows `456cb0de3bfea99b2c47234e5729eb6b03b53efc`.
- **The gate:**
  - a wrong code gives the gate's message, with no cookie;
  - the right code returns to the page;
  - the cookie is `Secure` (if `ownOrigin` is https), `HttpOnly` and `SameSite=Lax`.
- **Live updates:** a room shows live updates, which proves the WebSocket.

### Step 4: the audit (the reviewer's)
**Several devices:** use separate profiles or private windows of the same signed-in browser. Join links and QR codes point at the forwarded URL (F5), and only browsers signed in as the owner can open a private port.

### Step 5: stop
SIGTERM the server, delete the synthetic data folder, and keep the probe report with the evidence.

### Threat model for route A
- **Who can reach the port:** only a browser signed in as the owner. The port is private and GitHub's forwarder authenticates it (F2).
- **Another origin under `app.github.dev`,** from this Codespace or anyone's:
  - **What it gets past:** it is the same site, so the beta cookie goes with its requests (F3).
  - **What stops it:** the exact-origin check, because that page's Origin isn't the app's own value. The probe establishes exactly that for a sibling port, over HTTP and WebSocket. A sibling port also maps to *its own* localhost port, which isn't 3153.
  - **What the probe doesn't cover:** another user's codespace origin isn't tested directly. It is the same kind of non-matching origin under the reported rule (F1).
- **Requests that carry no usable origin:**
  - **`Origin: null`** (a sandboxed frame, or a no-referrer form post) is refused, as in production.
  - **A request with no Origin** is a plain navigation. The app's API calls and WebSockets always carry one.
- **What differs from production:**
  - **The configured value only.** If `ownOrigin` is `http://…` (as in the Symfony report), the cookie loses `Secure`. The whole `.dev` domain is HSTS-preloaded, so browsers only ever use https there anyway.
  - **Client addresses:** they collapse into one (no trusted proxy).
- **The residual risk:** the result depends on the forwarder's behaviour at the time it was measured, and GitHub can change it. **Run step 1 at the start of every audit session;** it takes minutes.

### Tested here, against a stand-in (not GitHub's forwarder)
I have no access to the Codespace, GitHub's forwarder or the cloud browser. So I built a local TLS stand-in forwarder for `*.app.test` that can behave four ways (`docs/evidence/beta-r1-preview-route/fwd.mjs.txt`):
- `same-origin-only`: the reported rule, with the scheme the reviewer measured;
- `all`: every Origin rewritten;
- `http-only`: WebSockets not rewritten;
- `none`: nothing rewritten.

Headless Chromium played the browser.

- **The probe:** each of the four behaviours gets the right verdict.
- **Route A** with the **packed `456cb0d`** in production:
  - **S0 reproduces 6903475177:** with the forwarded URL as the public origin, the code form gets 403.
  - **S1, route A with `same-origin-only`:**
    - **The app works:** entry, the cookie flags, `/health` = `456cb0d`, the API (201) and the WebSocket (projection received).
    - **The sibling origin is refused:** its POST and WebSocket get 403, its Origin passed through unchanged.
  - **S2, route A with `all`:** the sibling page's POST **creates a room (201)** and its WebSocket **opens (101)**. That is why step 1 is a hard precondition.

## Route B (fallback if the probe says UNSAFE or INCONSISTENT): the browser inside the Codespace
**A proposal, not tested here.** Run the browser inside the Codespace and forward only its display.
- **The display:** the devcontainer `desktop-lite` feature provides a light desktop and a noVNC web client on a port (6080 by default). It stays **private**, and the cloud browser opens `https://<codespace>-6080.app.github.dev/`.
- **The browser inside:** in that desktop, the Codespace's own Chromium opens the packed candidate through a local TLS proxy, exactly as `scripts/check-beta-gate-https.mjs` does:
  - public origin `https://beta.test:<port>`;
  - `--host-resolver-rules`;
  - the run's certificate trusted for that browser only.
- **What is genuine:** the Origin, because no forwarder sits between that browser and the app. The forwarder carries only pixels. The production check runs unchanged.
- **Already covered by the gates:** the in-machine half (packed production server, TLS proxy, Chromium on the same machine) runs in every gate as `check-beta-gate-https` (28 checks; it passed in targeted `20261115-233420-456cb0de-5276`).
- **Not tested:** the desktop and noVNC display path.
- **Its costs:**
  - **A change to the Codespace:** adding the feature means rebuilding its container (or installing the packages by hand). That is the reviewer's environment, so it is the reviewer's call.
  - **Clumsy interaction:** everything goes through a remote desktop.
  - **Layouts:** phone sizes come from window size or device emulation.

## Not recommended, and why
- **`gh codespace ports forward`, or VS Code desktop's forwarding:**
  - **Where the port appears:** on localhost of the machine running it. That is the owner's computer, not the cloud browser. Installing `gh` inside the Codespace would forward inside the Codespace, which helps no one.
  - **For the owner's own audit:** it could work from their computer. The browser would send `Origin: http://localhost:<port>`, so the public origin would be that and the cookie wouldn't be `Secure`. Not tested.
- **Setting the port's protocol to HTTPS:** it changes how the forwarder talks to the app (F2). Nothing documented or reported ties it to the Origin rewrite, so it isn't a route. If tried, run step 1 again, since the rewritten value may change.
- **A preview-only adapter in the app** (accepting the rewritten Origin on the strength of `X-Forwarded-Host` or `Sec-Fetch-Site`): **not proposed.**
  - **`X-Forwarded-Host`** is set by the forwarder on every request, foreign or not, so it distinguishes nothing.
  - **`Sec-Fetch-Site`** separates `same-origin` from `same-site` for fetch and form requests. Chromium sends none on a WebSocket handshake (F4), and game actions travel over the WebSocket.
  - **Under `UNSAFE`,** the information has already been destroyed before the app sees it, and no adapter can recover it safely. Route B is the answer there.
- **Allowing `localhost` origins broadly, or replacing Origin blindly:** refused by the brief, and S2 shows why.

## Tested here vs proposed
| | Tested here | Proposed only |
|---|---|---|
| The probe's verdicts under four forwarder behaviours | yes, against the stand-in | |
| Route A with the packed `456cb0d` in production, its entry, API, WebSocket and the refusal of a sibling origin | yes, against the stand-in | |
| GitHub's forwarder actually behaving as reported (F1) | **no: needs step 1 in the Codespace** | yes |
| Route B (desktop-lite and noVNC) | only its in-machine half (`check-beta-gate-https`) | yes |
| F2 (GitHub's docs) and F3 (the live suffix list) | read through search summaries and `tldts` | |

**Blocked for me:**
- **The Codespace and the cloud browser:** running step 1 there, and opening the private ports, need the owner's session.
- **Primary sources:** reading `docs.github.com` and `publicsuffix.org` directly. They don't resolve from this session.

## ETA for the reviewer
- **Route A:** step 1 about 10 min, steps 2 and 3 about 10 min, then the audit as planned.
- **Route B,** if needed: about 45–60 min to add the desktop and set up the in-Codespace browser. That's a guess: it depends on the rebuild.

## Estimate vs actual
**Estimated:** about 2 h 10 min (written at 7:08 p.m. ET).

**Actual: about 9 min** (7:08 to 7:17 p.m. ET, the commit). Then the report.

**The research went faster:** three of the primary sources weren't reachable from this session, so most of it came down to one verified report and the bundled suffix list.

**The probe and the route-A test** went faster than planned because they reuse the packing and TLS patterns of `check-beta-gate-https`.
