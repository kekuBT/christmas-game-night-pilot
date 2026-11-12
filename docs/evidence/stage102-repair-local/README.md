# Stage 10.2 repairs: local driver runs (review 6831760093)

These are **local driver runs from development, not gate verdicts**. Each was one run of one driver with its own server, in desktop Chromium (chrome-headless-shell). The working tree was the uncommitted repair, equal in product code and drivers to `f21f84b` + `6264827`, except two lines added later: the `soonUntil` move into `scripts/lib/deadline.mjs` and a settle before one screenshot. The gate verdicts for the committed revision are in `docs/evidence/gate-runs/`.

| Log | What ran | Verdict |
|---|---|---|
| `check-spectrum-repaired.log` | `check-spectrum` with the repaired server and web build | exit 0, 144 PASS, 0 FAIL |
| `check-spectrum-prefix-web.log` | the same driver and server, but the **pre-fix web build** (`d0d39e7`), as a control | **exit 1**, 140 PASS, **4 FAIL**: the new Memory Book checks. The page still says "Checking for the latest finished game…", the reviewer's defect. |
| `check-jebena-rush-repaired.log` | `check-jebena-rush` with room S (the short reconnect in its own room) and the Memory Book check in the main room's replay | exit 0, 215 PASS, 0 FAIL. Room S: resync 1,393 ms after the server's loss; the later live loss and the final loss each broke once. |
| `check-jebena-rush-late-reconnect-mutation.log` | a copy of that driver whose phone stays cut 3.5 s after the loss (past the window), as a negative control | **exit 1**, 213 PASS, **3 FAIL**: exactly the step-1 window checks. Steps 2 and 3 still ran and passed. |

The failed runs are kept on purpose: they show the new checks fail on the defect they guard against.
