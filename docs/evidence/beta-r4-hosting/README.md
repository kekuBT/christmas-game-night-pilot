# Beta R4 hosting proposal: evidence (handoffs 6916659110, 6916722530; review 6917441687)

Evidence behind [the proposal](../../beta/beta-r4-hosting-proposal.md).

**Revision 3 (review 6917441687):** the stopped-writer backup, the rollback guard and their local drill are in [backup-drill/](backup-drill/README.md). The memory and CPU runs below are revision 2's and unchanged. Nothing here ran on a provider: no account, resource, deploy or charge. The runtime is unchanged at `7097ac2bb062925bb296a129f4771f1e68fd522d`.

## Memory and CPU on a local machine
| File | What |
|---|---|
| [memory-fit.mjs.txt](memory-fit.mjs.txt) | Run 1's script: memory only |
| [memory-fit-v2.mjs.txt](memory-fit-v2.mjs.txt) | Run 2's script: the same load, plus the server's CPU time from `/proc/<pid>/stat`, and a 5 s idle reading |
| [memory-fit-run1.log](memory-fit-run1.log) | Run 1, 2026-11-16T12:48Z: three scenarios, all games started |
| [memory-fit-run2.log](memory-fit-run2.log) | Run 2, 2026-11-16T12:55Z: the same three scenarios, all games started, exit 0 |

**The load in each scenario:**
- R rooms, each with a host, 9 more players over WebSocket and 1 TV spectator.
- A Trivia game started in every room, then 60 s of heartbeats.

**What these runs are, and aren't:**
- **The server:** the built server from a tree whose runtime files equal `7097ac2` (each log's header names the tree), in development mode (no access gate), on a throwaway data folder deleted afterwards.
- **The machine:** this session's 4 CPUs, Node 22.23.4. **Not** a Render instance, and not Node 22.16.0.
- **No player answers, drawings or exports** were sent.
- **Memory peaks vary between runs:** 95.4 MB, then 82.9 MB, for the same family night.
- **Busy night, run 2: seating took 17 s of wall clock** for 0.3 CPU-seconds of server time. Not investigated. The other scenarios seated in about 2 s.

**To reproduce:** build the server (`npm run build`), rename the script to `.mjs`, then run:
```
node memory-fit-v2.mjs <repo root> <rooms> <players per room> <label>
```

## Render's own pages
[render-fetch-log.txt](render-fetch-log.txt): each page's URL, read time and the first 16 hex digits of its SHA-256.
- Read from this session after the owner's environment change allowed `render.com`.
- The pages are live, so a later read may differ. The proposal names the facts used from each page.
- Render's backups page returned 404 and wasn't used.
