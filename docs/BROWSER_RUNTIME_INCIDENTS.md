# Browser Runtime Incidents (Work Package G, §9.2)

**Status: evidence log, not a root-cause claim.** This file records
what was observed, when, and what recovered it, so a future outage
can be recognized instead of re-diagnosed. No root cause is asserted
here — none was established. Do not modify app logic to compensate
for a broken test runtime on the basis of this file.

## Incident 1 — 2026-11-04 night (Milestone I)

- **Symptom:** every Chromium launch died at startup with SIGTRAP
  (exit 133), identically for the headless shell and the full
  chromium-1248 build. `check-shuffle` failed the same way. The
  batch was compromised (a transient `tee` EPERM also truncated its
  log, losing results).
- **What it was not:** not an app failure — no app code changed
  between the failure and the recovery, and the same drivers passed
  after recovery. The `e2e` "FAILED: 1 item(s)" in that window was
  the launch crash, not an app failure.
- **Recovery:** a runtime restart at ~22:18 EST. Launches returned
  (LAUNCH OK). The full batch was re-run in full (18 drivers + E2E,
  all green, 0 FAIL lines; log `~/workspace/gates-i-batch2.log`).
- **Evidence not collected:** no memory, disk, process-count, or
  temp-profile measurements were taken during the outage, so no
  resource-exhaustion claim can be made.

## Incident 2 — 2026-11-05 ~00:50 EST (Milestone J.3)

- **Symptom:** the first J.3 batch died at `check-f4` — every
  Chromium launch crashed at startup, the same SIGTRAP/exit-133
  signature as Incident 1. The remaining drivers never ran the app.
  The batch log was truncated by the same transient `tee` EPERM.
- **Response (decision E):** the batch was NOT re-run while the
  runtime was unhealthy, and the J.3 commit was HELD until the
  runtime recovered. The outage was reported to the owner as a
  correction (environment, not the app).
- **Recovery:** LAUNCH OK at 02:04 EST, after a runtime restart had
  intervened. The restart killed the 3461 dev server (restarted,
  HTTP 200) and an accidental PORT-less instance on port 3000 was
  killed first. The batch was then re-run (batch2: 11/12, with the
  F4 failure below, plus a solo F4 re-run 11/11).
- **Evidence not collected:** as in Incident 1, no resource
  measurements at the time of the crash. Disk was 148G free (2%
  used) at the 02:44 EST baseline check.

## Incident 3 — parallel-run interference (2026-11-05 01:45 EST)

- **Symptom:** the 30-minute local-dev cron run timed out after
  1800s and ran its own partial J.3 re-verification (its log
  `~/workspace/gates-j3-rerun.log`: `check-f5` 30/30, its e2e
  interrupted) while the J.3 batch2 was also running against the
  same server. Its driver-only fixes (check-f5/e2e Closest selectors)
  were legitimate and were kept.
- **Related:** batch2's only failure was F4 timing out waiting for
  an "Approve" button in a Math Mayhem flow J.3 did not touch, while
  the parallel cron run was hitting the same server. A solo re-run
  of `check-f4` passed 11/11 with no code change. Attributed to
  parallel-run interference (the documented poll-rerender click-loss
  flake is the same mechanism class), not to an app defect.
- **Lesson:** two jobs that both launch browsers against the same
  server and the same tracked screenshot directory are not isolated
  from each other. See the isolation analysis below.

## Incident 3 — 2026-11-05 ~03:44 EST (Work Package B e2e gate)

- **Symptom:** Chromium died at launch with SIGTRAP (the same
  signature as Incidents 1 and 2). A minimal launch test
  (`chromium.launch()` then close) failed with
  `browserType.launch: Target page, context or browser has been
  closed`; a foreground `e2e-browser.mjs` run failed at launch the
  same way (pid 31834, `signal=SIGTRAP`). The dbus errors in the
  launch log (`Failed to connect to the bus`) are also present on
  healthy launches and are not the cause.
- **What it interrupted:** the Work Package B verification batch
  (`check-closest` 21/21 and `check-f5` 30/30 had already passed
  while the runtime was healthy — those verdicts stand). Its `e2e`
  reported `E2E FAILED: 4 item(s)`, but the detailed output was lost
  to a transient `tee` EPERM on the batch log, and the outage may
  have begun mid-run — so the 4-item failure is **inconclusive**,
  not evidence of a regression. The B-fix commit is HELD at the e2e
  gate (per decision E) until the runtime recovers and the e2e can
  be re-run cleanly.
- **Response:** no repeated runs against the broken runtime. The
  tree is preserved (the B-fix code is uncommitted in the working
  tree). Non-browser work continues. When a minimal launch returns
  LAUNCH OK, re-run the e2e once with `>` (not `tee`) and commit
  the B fix if it is green.
- **Accompanying filesystem degradation (same window, ~03:44–03:47
  EST):** git object writes to this repo intermittently fail with
  `fatal: unable to write loose object file: Operation not
  permitted`, while plain file writes to the same directory succeed.
  Diagnostics: `touch` and `mkdir` in `.git/objects/` succeed;
  `git hash-object -w` of a 5-byte test blob succeeded once, then
  the same command on the docs failed; `git add` and `git commit`
  have failed five times (the docs commit is uncommitted, the files
  are safe on disk). A throwaway repo in `/tmp` commits fine (per
  the 03:45 cron run), so the failure is specific to this repo's
  object store, not to git generally, and the disk has 148G free.
  The EPERM flaps (successes and failures interleave in time), so
  no single cause is asserted. Do not run `git gc` or other
  maintenance on the repo while it is degraded. The docs commit
  retries when the writes stop flapping.
- **Evidence not collected:** as in Incidents 1 and 2, no resource
  measurements at the time of the crash.

## What the runtime looks like when healthy

- Chromium launches from the Playwright cache
  (`~/.cache/ms-playwright/chromium_headless_shell-1248/`) with a
  fresh temp profile per launch
  (`/tmp/playwright_chromiumdev_profile-*`, `--no-sandbox`,
  `--headless`, `--disable-dev-shm-usage`).
- Each driver launches its own browser (fresh profile, no shared
  browser state between drivers). The K batch (started 2026-11-05
  ~02:40 EST) is healthy so far: four drivers green, the fifth
  (`check-leaderboard`, pid 19120, started 02:46) running with its
  headless-shell process alive.
- The dev server (port 3461) is shared by every driver in a batch.
  That is the one shared mutable resource between drivers in a batch
  (plus the tracked `docs/mobile-screenshots/` directory, which the
  mobile driver regenerates).

## Isolation analysis (Package G §9.1 — from code reads, no new data)

- **Port:** all drivers target the same base URL (default
  `http://localhost:3461`, overridable by argument). They do not
  start their own servers (except `check-restart`, which spawns its
  own server on the first free port of 3462/3463/3464 with the shared
  data dir). Within a batch, drivers run sequentially, so the shared
  port is not a concurrency problem *inside* a batch — only *between*
  concurrent jobs (Incident 3).
- **Room state:** every driver creates its own room(s) by code, so
  rooms do not collide between drivers. The server's `data/` directory
  accumulates room files (525 from testing, git-ignored) — a hygiene
  note, not a collision.
- **Browser profiles:** fresh temp profile per launch; no shared
  profile between drivers. No driver assumes another driver's
  profile state.
- **Tracked screenshots:** `check-mobile` regenerates tracked
  `docs/mobile-screenshots/*.png` files, dirtying the tree. They are
  regenerable test artifacts, not milestone content — restore them
  with `git checkout -- docs/mobile-screenshots/` before staging a
  commit. New screenshots that are milestone content (e.g. the
  J.3 before/after pair, the game-night set) are committed
  intentionally and are not regenerated by any driver.
- **Timing:** drivers wait on visible state (polls, `waitFor`) with
  bounded timeouts; arbitrary `sleep()` calls exist but are short
  (150–1500ms) and sit between waits, not in place of them. The
  known flake is a single click lost to a poll re-render (a click
  landing on an element that unmounts mid-poll) — it has recurred
  across drivers (leaderboard, F4) and is mitigated by re-trying the
  action, never by weakening the assertion.
- **Fixtures:** drivers create their own rooms and players; no shared
  fixture files are mutated concurrently. The one exception is the
  mobile screenshots above.

## The protocol (decision E / assignment §2.2, restated)

1. If Chromium crashes at launch (SIGTRAP), test a minimal launch
   first; distinguish an environment failure from an application
   failure before doing anything else.
2. Do not repeatedly run the full suite against a broken runtime.
3. Preserve the tree; continue non-browser work; resume browser
   verification when the runtime is healthy.
4. Never claim an unexecuted test passed; never weaken an assertion
   to hide a failure; never claim switching browsers proves
   Chrome/Safari functionality.
5. If a scheduled job collides with a manual batch (Incident 3), do
   not modify the scheduled automation without the owner's approval
   — document the precise conflict and propose the scheduling change
   for approval.
