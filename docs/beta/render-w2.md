# W2 on Render: the family-scale workload (Beta R4, handoff 6921505856)

**Status: prepared, not run on any target.** W2 runs only after W1 has passed ([render-w1.md](render-w1.md)), inside an owner-approved window, against the validation install with its **throwaway** data folder and **throwaway** access code.
- **Who runs it:** ChatGPT runs it and collects Render's own graphs. Claude doesn't operate the account.
- **What W2 is:** the proposal's W2: "Live play at family scale: 2 rooms × 10 phones + a TV each … a full Trivia game with every phone answering, then a drawing game with strokes, plus Memory Book saves."
- **The tool:** `scripts/beta/w2-load.mjs`, tested locally only ([evidence](../evidence/beta-r4-w2/README.md)). That proves the tool, not Render.

## What existed, and what was added (the gap analysis)
| Existing helper | What it already did | Why it isn't W2 by itself |
|---|---|---|
| The backup drill's `play.mjs` (`docs/evidence/beta-r4-hosting/backup-drill/play.mjs.txt`) | The gate cookie; rooms with a host, players and a TV over WebSocket; Trivia answers as intents, retried with the same `clientEventId`; Memory Book notes with a `requestId` | Plain `http://` only; 2 × (host + 4 + TV); no drawing game; it counts acknowledgements only (no read-back, latency percentiles or isolation); it writes tokens and join codes to its output |
| `scripts/check-draw-guess.mjs`, `check-draw-sync.mjs`, `check-team-draw.mjs` | Drawing turns and stroke sync | They start their own local development server; browser-driven or local-only |
| `scripts/check-ten-players.mjs`, `check-multiplayer.mjs` | Ten-player rooms | The same: a local server they start themselves; no target |
| `scripts/beta/w1-check.mjs` | HTTPS/WSS against an operator-supplied origin, with redacted evidence | The way in only; no load |

**`w2-load.mjs` reuses `play.mjs`'s patterns** (the gate, room setup, intents with idempotent retries, the notes) and `w1-check.mjs`'s target handling and redaction. It adds only what was missing:
- an explicit `https://`/`wss://` target;
- 10 players per room;
- Draw & Guess, with strokes paced under the server's own limit;
- **read-back** of every acknowledged action from the authoritative state;
- acknowledgement percentiles;
- the room-isolation checks;
- the target's identifiers;
- redacted evidence.

## Before W2
1. **W1 passed** on this service, with the final proxy count recorded.
2. **The owner opened a window**, and the operator turned maintenance mode **off**.
3. **The data:** the instance still runs with `MCHEZO_DATA_DIR=/var/data/cgn-w1` and the throwaway code. **Never run W2 against the real folder or the real code.**
4. **The tester's machine:** a checkout of this branch with `npm ci` (Node 22), and the throwaway code in a file only the tester can read.

## Running it
```
node scripts/beta/w2-load.mjs --origin https://<service>.onrender.com --code-file ~/w1-code \
  --label deploy=<Render deploy id> --label artifact=a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131 \
  --label service=<service name> --evidence w2-evidence
```
- **It takes about 75 s** locally: Trivia about 12 s, then six drawing turns of a few seconds plus the 8 s reveal. On Render, network latency adds to that.
- **It stops itself:** at `--max-minutes 20`, and gives up on any one action after `--ack-timeout-s 30`.
- **The `--label` values** are recorded as given, for the record only. Never put a secret in one.
- **While it runs, the operator records Render's CPU and memory for the service**, from the dashboard's Metrics, or the integration's `get_metrics` for the window's start and end. Then the peaks. **The tool can't see them, and nothing local is a Render measurement.**

## What it checks, and what fails the run
| Check | Fails the run when |
|---|---|
| **Preflight** | `/health` isn't 200 with revision `7097ac2…`, or the gate doesn't admit the code |
| **Setup** | The rooms, the 20 seats and the 2 TVs can't be created, or the 22 sockets don't open |
| **Each game** | Trivia or Draw & Guess doesn't finish |
| **Acknowledged** (Ready taps, 200 answers, about 96 stroke messages, 108 guesses, 10 notes) | Any action is rejected (`accepted: false`), or isn't acknowledged within the time limit, retries included |
| **Persisted** (read back with a fresh request) | Anything acknowledged isn't in the authoritative state:<ul><li>answers: each player's own Trivia answers;</li><li>strokes: the turn's drawing, counted piece by piece;</li><li>guesses: the turn's correct guessers;</li><li>notes: the room's Memory Book.</li></ul> |
| **Rooms isolated, passively** | Any WebSocket message or HTTP body read for one room contains another room's canary, room id or a player name |
| **Rooms isolated, actively** | One room's host token is accepted on the other room's projection, Memory Book or socket |
| **Sockets** | Any socket isn't open at the end. Disconnects and reconnects are counted and reported. |

**What "persisted" means here:** read back from the running server, which saves every change synchronously before answering. It does not prove the data survived a restart; that is W4. Locally, `scripts/beta/w2-disk-check.mjs` also matched every acknowledged action against the files on disk. On Render the disk isn't readable from outside.

**Cleanup:** the app has no supported way to delete a room, so the run deletes nothing. Its two rooms stay in the throwaway folder `/var/data/cgn-w1`. That folder is retired when the real folder is authorized after the go/no-go, and the run touches nothing else.

## What to record (the W2 report)
- **The tool's evidence:** the console output and `w2-evidence/w2-<run>.json`, verbatim. They record:
  - per category: sent, acknowledged, rejected, unacknowledged, retried and persisted counts, and acknowledgement median, p95 and max;
  - sockets: total, open at the end, unexpected closes, reconnects, errors and messages;
  - room isolation: the passive hits and the active probes;
  - the target's `/health` revision and the operator labels;
  - the tool's own SHA-256 and Node version.

  **Before sharing, search the files for the code; it must not appear.** The tool redacts the code, the cookie, all tokens and the join codes.
- **Render's CPU and memory peaks** for the window, with how they were read (dashboard or connector), as **operator evidence**.
- **The pass bar** (proposal W2): Render's CPU and memory stay under 50% of Starter.
- **Kept separate:** this is protocol and load evidence from synthetic clients. It is not a browser or native-device check: those are W3 and W8.

## If it fails
1. Maintenance mode **on**.
2. Keep the evidence. A dropped acknowledgement, a missing read-back or a cross-room leak is a **stop**: report it with the evidence. W3 doesn't start.
3. A failure from the target itself (preflight, setup, a game not finishing) is reported the same way, with the deploy's logs and events.
