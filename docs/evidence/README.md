# Raw test evidence

Raw output from the gate runs and checks that the PR handoffs cite, committed so a reviewer can read it without rerunning anything. Every file is copied unchanged from the run's `test-results/<runId>/`. Paths inside the files are those of the cloud container that ran them.

## `gate-runs/<runId>/`

| Run | Revision | What | Files |
|---|---|---|---|
| `20261110-055944-735242dd-14712` | `735242d` | Full gate on the cumulative Stage 5.1 + 5.2 tree (the review candidate) | `report.json`, `summary.txt`, `gate-console.log`, and every step log in `logs/` |
| `20261110-052100-872add3c-26825` | `872add3` | Full gate, Stage 5.2 before the Stage 5.1 review fix (superseded) | `report.json`, `summary.txt`, `gate-console.log` |
| `20261110-003130-0a3964f3-11617` | `0a3964f` | Full gate, Stage 5.1, the old sequential gate (PR #4's tested revision) | `report.json`, `summary.txt` |

`report.json` records the revision, `git.dirty` (empty: a clean tree), the source fingerprint, the browser and Node versions, and every step's status, time, worker, CPU and peak memory. The server data, screenshots and built app are left out.

## `failure-injection/<label>/`

The nine runs in `docs/test-optimization/README.md` §13. Each folder holds:
- `injected.diff`: the one-line change, which was committed in a throwaway clone and never pushed;
- `gate-console.log`: the gate's output (`targeted f5`);
- `check-f5.log`: the driver's own log.

| Label | Commit | Injection |
|---|---|---|
| `dg-word`, `dg-guess`, `mr-tap` | `dab1c65` | The action always fails |
| `old-t2-word`, `old-t2-guess`, `old-r2-tap` | `dab1c65` | The action fails on Draw & Guess turn 2, or in Majority round 2, only |
| `new-t2-word`, `new-t2-guess`, `new-r2-tap` | `872add3` | The same, after the 30 s rule |

## `poll-body-stall/<label>/`

`check-poll-body-stall` (PR #4 review, P2), run before and after the fix:
- `old-5a4454c`: the unchanged Stage 5.1 code plus only the new driver (FAILED);
- `fixed-uncommitted`: the fix before it was committed as `7e7ab16` (PASSED).

The committed fix is covered by the full gate on `735242d` above.
