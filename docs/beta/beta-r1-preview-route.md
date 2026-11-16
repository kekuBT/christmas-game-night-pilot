# Beta R1-R: a private route for the audit preview (handoff 6903638660)

**Status:** an investigation and one proposed procedure, with the probe repaired for review 6903845075. The beta stays on HOLD.

**Update (review 6904986723): route B works, through Firefox ESR, and was used for the independent audit.**
- **How the reviewer ran it** on `456cb0d`, in the existing Codespace with no rebuild:
  - a private noVNC desktop;
  - Firefox ESR in disposable host, guest and TV profiles;
  - the app and TLS proxy on loopback, with TLS validation on (a session CA trusted only in those profiles).
- **The sandbox:** Firefox reported Seccomp-BPF and content process sandboxing at level 6, without user namespaces. That is option 1 of the sandbox section below, not Chromium's namespace sandbox.
- **What the audit found:** one product defect, B-15 (continuing Trivia on small screens), repaired in the fourth round of `docs/beta/beta-r1-repair.md`.
- **Route A** stays unvalidated: the real forwarder's probe returned `INCOMPLETE`.
- **No further preview-infrastructure repair was requested.**
- **The audit stays on hold** until an authorized private route has been **validated in the Codespace** with the original protections intact. Those are the exact-origin check, the beta gate, TLS validation in the browser, private visibility and synthetic data.
- **The probe is evidence, not proof:** it covers only the traffic it observed.
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
2. **Open the other port's page:** `https://<codespace>-3156.app.github.dev/`, in the cloud browser. It sends a fetch POST, a form POST and a WebSocket to 3153 **from another origin**, then says its script finished. That line only tells you the page is done. It is **not** evidence of what arrived; scripts finish on timeouts and errors too.
3. **Open the target page:** `https://<codespace>-3153.app.github.dev/`. It sends the same three from its own origin, then shows the verdict.
4. **Stop the probe:** Ctrl-C. The report stays in `--out`.

**The evidence rules** (a pure function, `classify()`, tested offline in `tests/preview-probe-verdict.test.ts`). The verdict counts **only what arrived at the target**:
- **Absence proves nothing:** a request that never arrived is missing evidence, never proof that the forwarder stopped it.
- **The completion line is never evidence.**
- **What a pass needs, both of:**
  - **The app's own side:** its fetch POST, form POST and WebSocket all observed, each with a **valid https Origin**, all the same value.
  - **The comparison side:** for **each** of the three transports, at least one comparison request observed **carrying the comparison page's own origin**.

**Decide from the verdict:**
| Verdict | Meaning | Next |
|---|---|---|
| `REWRITTEN_SAME_ORIGIN_ONLY` | Both pass conditions met. The own value, the report's `ownOrigin`, isn't the forwarded URL's origin, and no comparison request carried it. | Evidence for review of route A. Step 2, with `MCHEZO_PUBLIC_ORIGIN` = `ownOrigin`, exactly as printed. |
| `PRESERVED` | Both pass conditions met, and the own value **is** the forwarded URL's origin. | Step 2 with the forwarded URL itself. That contradicts 6903475177, so look at the report first. |
| `UNSAFE` *(refusal)* | A comparison request arrived with **no** Origin, or with the app's own value. The check couldn't refuse it. | **Stop route A.** Use route B. |
| `INCONSISTENT` *(refusal)* | The app's own requests arrived with different values, e.g. the WebSocket not rewritten like the POST. No single origin fits. | **Stop route A.** Use route B. |
| `UNSUITABLE` *(refusal)* | An own request arrived with no Origin, or one that isn't a valid https origin. An `http://localhost:…` value would drop the cookie's `Secure` flag. Or the own value equals the comparison origin. | **Stop route A.** Use route B. |
| `INCOMPLETE` | Something required wasn't observed (named). Comparison requests carrying another value (e.g. `"null"`) are unattributed: they neither pass nor refuse. | Repeat steps 2–3 once. If the comparison requests still don't arrive (the forwarder may well refuse cross-origin requests to a private port), **route A can't be validated: use route B.** |

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

A fifth behaviour, `block-foreign`, refuses foreign requests at the forwarder, so the comparison requests never arrive. Headless Chromium played the browser.

- **The probe after the repair:** each of the five behaviours gets the right verdict. In particular, `block-foreign` gives `INCOMPLETE`; the first version of the probe would have passed it.
- **The classifier offline:** 16/16. The review's three false passes reproduce on the first version (`f6647ee`) and now fail closed.
- **Route A** with the **packed `456cb0d`** in production:
  - **S0 reproduces 6903475177:** with the forwarded URL as the public origin, the code form gets 403.
  - **S1, route A with `same-origin-only`:**
    - **The app works:** entry, the cookie flags, `/health` = `456cb0d`, the API (201) and the WebSocket (projection received).
    - **The sibling origin is refused:** its POST and WebSocket get 403, its Origin passed through unchanged.
  - **S2, route A with `all`:** the sibling page's POST **creates a room (201)** and its WebSocket **opens (101)**. That is why step 1 is a hard precondition.

## Route B (the fallback when route A can't be validated): the browser inside the Codespace
**It preserves the browser's original Origin and its TLS validation.** The browser runs inside the Codespace, next to the app, and only its display is forwarded.

- **Where:** the packed candidate, a local TLS proxy and Chromium, all inside the Codespace.
- **Its own origin:** Chromium opens `https://beta.test:<port>`, mapped to the proxy with `--host-resolver-rules`, and the app is configured with that exact origin. **No forwarder sits between the browser and the app,** so the app checks the browser's genuine Origin.
- **TLS validation stays on.** A CA made for the session issues the proxy's certificate for `beta.test`. The CA is trusted **only** in an NSS database under a throwaway `HOME` given to that browser (`certutil -A -t "C,,"`). There is no `--ignore-certificate-errors`, no SPKI list and no `ignoreHTTPSErrors`; a certificate the browser can't validate is refused.
- **The display:** a remote desktop with a noVNC client on a **private** port (e.g. 6080), opened by the cloud browser as `https://<codespace>-6080.app.github.dev/` with the owner's sign-in. The forwarder carries pixels and input, not the app's requests.

**Tested here: the browser half** (`docs/evidence/beta-r1-preview-route/route-b-tls-run1.out.txt`), with the packed `456cb0d` in production and Chromium on the same machine. No certificate errors are ignored.

**Correction (handoff 6904212784):** that Chromium ran **without its OS sandbox**. Playwright passes `--no-sandbox` unless `chromiumSandbox: true` is set, and I ran as root, where Chromium refuses its sandbox. The run tested TLS validation and the browser's own Origin, **not** the browser sandbox. The same is true of every gate driver; see "The browser sandbox in the Codespace" below.
- **B0, the control:** with an empty trust store the page is refused, `ERR_CERT_AUTHORITY_INVALID`.
- **B1, with the session CA trusted in the browser's NSS database:**
  - **Entry:** the code form gets 303.
  - **The cookie:** `Secure`, `HttpOnly`, `SameSite=Lax`.
  - **The candidate:** `/health` = `456cb0d`.
  - **The app works:** the API (201) and the WebSocket (projection).
  - **The Origin:** every one the app received was the browser's own, nothing rewritten.
- **Also in every gate:** the packed server, a TLS proxy and Chromium on one machine are `check-beta-gate-https`. That run trusts its certificate with `ignoreHTTPSErrors`, which is why B1 was added.

**Not tested here:** the remote desktop and noVNC display path, and the Codespace itself.

**Prerequisites** (all in the reviewer's Codespace, $0, no new account or public port):
- **A remote desktop with a web client:**
  - **Option 1, the devcontainer feature `ghcr.io/devcontainers/features/desktop-lite`:** it needs a container rebuild.
  - **Option 2, the same packages installed into the running container:** a VNC server, noVNC and a window manager. They are gone after a rebuild.

  Neither is requested by review 6903845075 ("no rebuild of the active Codespace or new resource"). **Both need the owner's or reviewer's authorization first.**
- **The tools:**
  - a Chromium the remote desktop can run (Playwright's, or another);
  - `openssl` and `certutil` (Debian/Ubuntu `libnss3-tools`).
- **Ports:** the noVNC port stays **Private**. The app and the proxy listen on 127.0.0.1 only and are never forwarded.

**Its exact limitations:**
- **Interaction:** everything goes through a remote desktop (canvas clicks and typing), so it's slower.
- **Several devices** are separate browser profiles (separate `HOME`s, each with the CA trusted) or windows on one desktop.
- **Phone layouts** come from window size or device emulation, not a phone.
- **No touch hardware,** and real phones remain untested.
- **What the session CA covers:** it's trusted only by that browser profile and only for the session. Delete its database and key afterwards.

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
| The probe's classifier, offline (the review's three false passes, refusals, `INCOMPLETE`, complete passes) | yes, 16/16 | |
| The probe's verdicts under five forwarder behaviours, including one that blocks foreign requests | yes, against the stand-in | |
| Route A with the packed `456cb0d` in production, its entry, API, WebSocket and the refusal of a sibling origin | yes, against the stand-in | |
| GitHub's forwarder actually behaving as reported (F1) | **no: needs step 1 in the Codespace** | yes |
| Route B's browser half, with TLS validation intact (session CA in an isolated NSS database) | yes, against the packed `456cb0d` | |
| Route B's remote desktop and noVNC | | yes (prerequisites need authorization) |
| F2 (GitHub's docs) and F3 (the live suffix list) | read through search summaries and `tldts` | |

**Blocked for me:**
- **The Codespace and the cloud browser:** running step 1 there, and opening the private ports, need the owner's session.
- **Primary sources:** reading `docs.github.com` and `publicsuffix.org` directly. They don't resolve from this session.

## ETA for the reviewer
- **Route A:** step 1 about 10 min, steps 2 and 3 about 10 min, then the audit as planned. This only applies if step 1 passes.
- **Route B,** if needed and authorized: about 45–60 min to add the remote desktop and set up the in-Codespace browser with the session CA. That's a guess that depends on how the desktop is added.

## Estimate vs actual
**Estimated:** about 2 h 10 min (written at 7:08 p.m. ET).

**Actual: about 9 min** (7:08 to 7:17 p.m. ET, the commit). Then the report.

**The research went faster:** three of the primary sources weren't reachable from this session, so most of it came down to one verified report and the bundled suffix list.

**The probe and the route-A test** went faster than planned because they reuse the packing and TLS patterns of `check-beta-gate-https`.

## The repair for review 6903845075: estimate vs actual
**Estimated:** about 1 h 15 min (written at 7:20 p.m. ET).

**Actual: about 14 min** (7:20 to 7:34 p.m. ET, the commit). Then the report.

**One extra run:** the harness timed out once on stale wait text and was rerun.

**One extra test:** route B's browser half with a session CA, added so the fallback's TLS validation is tested rather than assumed.

## The browser sandbox in the Codespace (handoff 6904212784)
**The reviewer's route-B attempt** used the actual Codespace, no rebuild and no bypass.
- **What worked:** noVNC (private), the desktop, the TLS proxy, the packed candidate and a session CA.
- **Where it stopped:** Chromium failed before loading the app, first with `No usable sandbox!`, then (with Debian's setuid `chromium-sandbox`) with `Failed to move to new namespace … Operation not permitted`.

### Was my route-B browser run sandboxed? No (measured)
`docs/evidence/beta-r1-preview-route/sbx-check.mjs.txt` launches Chromium (Chrome for Testing 153, the full build) through Playwright. It reads each Chromium process's command line, seccomp state and user/PID namespaces from `/proc`.

| Run | User | Launch | Result |
|---|---|---|---|
| R1 (`sbx-R1-root-default.json`), as my route-B test ran | root | Playwright defaults | **`--no-sandbox` on the browser, zygote, GPU, utility and renderer processes.** Renderers have no seccomp filter and share the browser's user and PID namespaces: no sandbox. |
| R2 (`sbx-R2-root-sandbox.json`) | root | `chromiumSandbox: true` | Refused: `Running as root without --no-sandbox is not supported`. |
| R3 (`sbx-R3-user-sandbox-userns.json`) | 65534 (non-root) | `chromiumSandbox: true`, user namespaces available | **Sandboxed:** renderers and a utility process each have a seccomp-BPF filter (`Seccomp: 2`) and their own user and PID namespaces. |
| R4b (`sbx-R4b-user-sandbox-userns-denied.json`) | 1000 inside a user namespace whose limit denies further namespaces | `chromiumSandbox: true` | **The reviewer's first failure reproduced:** `FATAL … No usable sandbox! If you are running on Ubuntu 23.10+ or another Linux distro that has disabled unprivileged user namespaces …` |
| R5b (`sbx-R5b-user-suid-userns-denied.json`) | the same | the same, with the setuid helper offered (`CHROME_DEVEL_SANDBOX`) | The same FATAL. **Not the reviewer's second message:** inside my user namespace a setuid binary gains nothing, whereas in the Codespace the helper ran but couldn't create namespaces. |
| R4, R5, R6 (`…-INVALID-sysctl-refused.json`) | | | **Invalid:** my attempt to set `user.max_user_namespaces=0` for the whole VM was refused, so namespaces stayed available. Kept for the record. |

### Why both failures happen
- **Chromium's Linux sandbox has two layers,** and the first is required. It is one of:
  - **(a) unprivileged user namespaces,** which give the renderers their own user and PID namespaces (R3);
  - **(b) the setuid helper,** which creates PID and network namespaces as root, and so needs `CAP_SYS_ADMIN`.
- **On top of that:** a seccomp-BPF filter.
- **What the container lacks:** it denies (a) (R4b reproduces that message exactly), and its root lacks `CAP_SYS_ADMIN` for (b) (the reviewer's `Operation not permitted`).
- **No middle ground:** Chromium has no supported "seccomp only" mode. The only other option is `--no-sandbox`, which removes both layers and is excluded.

### Confirm which constraint the Codespace has (read-only, as the non-root `codespace` user)
```bash
id -u; uname -r
cat /proc/sys/user/max_user_namespaces
cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null        # Debian kernels; 0 = denied
cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null   # Ubuntu 23.10+ hosts; 1 = restricted
grep -E '^(Seccomp|Seccomp_filters|NoNewPrivs|CapEff|CapBnd):' /proc/self/status
unshare --user --map-root-user true && echo "user namespaces: allowed" || echo "user namespaces: denied"
```
**Reading the result:**
- **`allowed`:** Chromium as `codespace` (not root) with its default sandbox should start. Retry it; no approval is needed.
- **`denied` with a non-zero `max_user_namespaces`:** the container's own policy (seccomp or capabilities) blocks it. See option 2.
- **`max_user_namespaces` 0, or a kernel or AppArmor restriction:** it's host policy, outside the owner's control.

### Options
**Option 1, no rebuild: Firefox ESR, with a reduced but enabled sandbox.** Proposed, **not tested here** (this session can't obtain a Firefox build).
- **What it keeps:** Firefox's Linux content sandbox is built on seccomp-BPF system-call filtering. User namespaces are an extra layer it uses when available. Without them it still runs its content processes under seccomp-BPF.
  - **Sources:** Mozilla's sandbox wiki (Security/Sandbox/Specifics); a Mozilla support thread (question 1451388) where `about:support` shows "Seccomp-BPF: true" and "Content Process Sandboxing: true" with "User Namespaces: false"; Bugzilla 1756236 ("only the seccomp part remains").
  - **What that costs:** weaker than Chromium's full sandbox (no namespace isolation). **Whether that is acceptable is the reviewer's and the owner's call.**
- **The procedure** (in the existing desktop, as `codespace`; the packages are Debian's, installed like the desktop ones):
  ```bash
  sudo apt-get install -y firefox-esr
  P=$(mktemp -d /tmp/ff-profile-XXXX)                         # throwaway profile
  certutil -d sql:$P -N --empty-password
  certutil -d sql:$P -A -t "C,," -n session-ca -i <session CA .pem>   # TLS validation stays on
  echo 'user_pref("network.dns.localDomains", "beta.test");' > $P/user.js   # beta.test -> loopback, no /etc/hosts change
  DISPLAY=<the desktop's display> firefox-esr --no-remote --profile $P https://beta.test:<TLS proxy port>/
  ```
  - **The app's side:** it runs with `MCHEZO_PUBLIC_ORIGIN=https://beta.test:<TLS proxy port>`, the browser's real origin. Nothing rewrites it, and the exact-origin check is unchanged.
  - **What's forwarded:** only the noVNC port, and it stays Private.
- **The precondition, before the audit:** in `about:support`, the Sandbox section must show **Seccomp-BPF (System Call Filtering): true** and **Content Process Sandboxing: true** (a level above 0). If either is false, stop.
- **Its limitations:**
  - **Coverage:** Firefox desktop, not the Chromium or Safari engines most phones use.
  - **Interaction:** through a remote desktop.
  - **Name resolution:** the `network.dns.localDomains` mapping is untested here. If it doesn't resolve, `*.localhost` names are an alternative to verify.

**Option 2: Chromium with its full sandbox.**
- **Prerequisite:** the Codespace must allow unprivileged user namespaces for the non-root user (the narrowest change that makes layer (a) work).
- **Minimum owner approval:**
  - **A change to the Codespace's container configuration,** for example a devcontainer `runArgs` security option that permits user namespace creation. A seccomp override (such as `seccomp=unconfined`) is broader than needed.
  - **A rebuild of the Codespace, or a new one.**
  - **Not needed:** `--privileged`, or `CAP_SYS_ADMIN` (which only the setuid path needs; it's broader again).
- **Its limitations:**
  - **Container isolation:** it relaxes it.
  - **No guarantee:** it only works if GitHub's host permits user namespaces (the diagnostics above show which). Whether Codespaces honours that run option has to be verified after the change.
  - **Not tested here.**

**Option 3: no Codespace change, with the owner taking part.**
- **The idea:** the owner's own computer and browser, sandboxed as normal.
- **How:** VS Code Desktop or `gh codespace ports forward <proxy port>:<proxy port>`, run on that computer with the owner's existing sign-in, forwards the TLS proxy's port to its localhost. A throwaway browser profile trusts the session CA and opens `https://beta.localhost:<port>/`.
- **Who runs the audit:** the owner, not the cloud browser.
- **Not tested here:** that this forwarding is TCP-level (so it leaves Origin alone), and the whole procedure.

**Recommendation:** run the read-only diagnostics first (5 minutes).
- **`allowed`:** retry Chromium as `codespace`, sandboxed.
- **`denied`:** option 1 is the only no-rebuild path that keeps a browser sandbox (reduced). Option 2 needs the owner's explicit approval of a container-isolation change and a rebuild.

**ETA for the reviewer:**
- **Diagnostics:** 5 min.
- **Option 1:** about 30–45 min to install, set up the profile and verify `about:support`, then the audit.
- **Option 2:** after approval, about 45–60 min for the rebuild and validation. It is uncertain, because host policy may still refuse it.


**This answer: estimate vs actual.** Estimated about 1 h (written at 7:58 p.m. ET); actual about 3 min (7:58 to 8:01 p.m. ET, the commit), then the reply.
