# W7 Route B: local validation of the operator entry (handoff 6957990858)

**What this is:** Claude's local tests of the new `routeb`, `bstart` and `firefox` commands in [`scripts/beta/w7-owner-preview.sh`](../../../../scripts/beta/w7-owner-preview.sh), and of the recipe [w7-routeb-recipe.md](../../../beta/w7-routeb-recipe.md).
- **They ran on Claude's machine,** with `W7OP_LOCAL_TEST=1`. It isn't a Codespace: there is no noVNC desktop and **no Firefox**.
- **It isn't independent evidence.** ChatGPT runs the real session.

**The runners:**
- [runners/routeb-local.sh](runners/routeb-local.sh): every Route B step, its refusals, the three phases, the failed-start case and the cleanup.
- [runners/routeb-drive.cjs](runners/routeb-drive.cjs): headless Chromium plays the host, guest and TV profiles.
  - **Each role's HOME holds a copy of that Firefox profile's NSS database,** exactly as `routeb` wrote it, so the CA trust tested is the profiles'.
  - **Each role keeps one persistent browser profile across the phases.**

**What the local run checks:**
- **Identity:** both inventories match (`prepare`), and `/health` shows the right revision **through the session CA** in each phase.
- **Route A is kept:** `start` still refuses an `UNSUITABLE` probe, and refuses while Route B runs.
- **TLS:**
  - the CA key is deleted after issuing one certificate;
  - that certificate verifies against the CA and names exactly `beta.localhost`;
  - each profile trusts the CA and maps `beta.localhost` to loopback;
  - a browser without the CA gets `ERR_CERT_AUTHORITY_INVALID`, and a client without the CA fails TLS verification.
- **In each of the three profiles:**
  - the gate's form posts with the page's own origin (303);
  - the cookie is `Secure`, `HttpOnly`, `SameSite=Lax` and host-only;
  - the host's room request carries the page's origin (201);
  - a live `wss://` update arrives for the same room.
- **Origins refused, with a valid cookie** (API 403 `FOREIGN_ORIGIN`, form 403 with no cookie, WebSocket 403):
  - `https://evil.example`;
  - another port;
  - `http://` on the same host;
  - `http://localhost:3157`;
  - `null`;
  - a foreign Origin with spoofed `X-Forwarded-*`, `Referer` and `Sec-Fetch-Site`.

  Without the cookie: 401.
- **The same data across phases:** the same browser profiles stay signed in, with the same room and live updates, on `previous` and after the return. `w5-seed` and `w6-check` confirm the seats, the approved entry, and the action made on the previous release.
- **One writer:** a second `bstart`, and a Route A `start` while Route B runs, are both refused.
- **A failed start** (a test hook makes the proxy fail):
  - only this run's app and proxy are stopped, and their pid files removed;
  - its logs and the `FAILED` line in `phases.log` are kept;
  - a foreign process named like the proxy, a foreign "Firefox" with another profile, and this run's own "Firefox" all keep running.
- **Cleanup:**
  - it stops this run's Firefox stand-in only, removes the run folder (code, TLS key, profiles, data, builds) and retires the record;
  - the foreign processes survive, and no process names the run folder afterwards;
  - the code appears in no file.

**The Firefox stand-in:** a PATH shim. It tests only that `firefox` starts the browser on the right profile, records its pid, and that cleanup stops exactly it. Firefox itself is untested here: its NSS profile loading, its `.localhost` resolution and `network.dns.localDomains`, its Responsive Design Mode, and `about:support`.

**The runs:** in `final/`. Its `summary.txt` gives the revision and the verdict.
