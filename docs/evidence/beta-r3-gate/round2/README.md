# Beta R3 repair, round 2: failed prerequisites stop the later steps (review 6910988491)

Docs and evidence only. No host action, browser run or full-gate rerun. The runtime is unchanged at `7097ac2bb062925bb296a129f4771f1e68fd522d` ([runtime-diff.txt](runtime-diff.txt)).

## What the review found, reproduced first
On the blocks published at `ca15c99`, run as whole blocks, with logging stubs ([repro-old.log](repro-old.log)):

| | The block | The scenario | What happened |
|---|---|---|---|
| R1 | Promotion | A stale marker that `rm` can't remove; the archive missing | It printed `STOP`, then reached `systemctl stop` |
| R2 | First install | The data check fails | It still ran `daemon-reload` and `enable --now` |
| R3 | The switch | `systemctl stop` fails; the real folder already holds a room | It still changed the unit, reloaded and started on the occupied folder |

## The fix (D-BR3-08; [beta-r1-release.md](../../../beta/beta-r1-release.md))
- **Promotion** (`promote` block):
  - The run-scoped flags `VERIFIED`, `STOPPED` and `BACKUP_OK` are reset at the start of every run.
  - The chain begins with `rm -f "$MARK" && [ ! -e "$MARK" ]`.
  - Stopping needs `VERIFIED`; backing up needs a successful stop; switching needs all three.
- **First install:**
  - The `first install, prepare` block. Its settings file is never truncated.
  - The operator's edits.
  - The artifact gate.
  - The `first install, start` block: one chain of this run's `VERIFIED`, the link, the settings naming the throwaway folder exactly once, the data check, the unit line and `daemon-reload`, before `enable --now`.
- **The switch:**
  - **Part A** (`switch, stop and prepare`): nothing changes unless the stop succeeded. Then `mkdir` makes the new real folder; it refuses any existing one, which is left as it is.
  - **The operator's edit** of the settings.
  - **Part B** (`switch, start`): it starts only after these checks:
    - part A's flags;
    - the settings naming the new folder exactly once;
    - the code line changed (by hash, never printed);
    - the folder still empty;
    - the unit line, and the reload.

## How the round-2 fixtures work ([gate-fixtures2.sh.txt](gate-fixtures2.sh.txt))
- **The blocks** are extracted verbatim from the runbook between their `>>>`/`<<<` markers; an indented block loses only its indentation.
- **The only text changes**, printed:
  - absolute paths under `/opt/`, `/var/lib/`, `/var/backups/` and `/etc/` move under the case's folder;
  - `EXPECTED_SHA256` and `EXPECTED_INVENTORY` become the fixture archive's.
- **Stubs:** commands that need root, a real user or systemd are shell functions defined before the blocks (printed in full in the log).
  - `systemctl` logs `SENTINEL-STOP`, `SENTINEL-START`, `SENTINEL-ENABLE` or `STUB daemon-reload`, with the stop and reload exit codes set per case.
  - `useradd` and `chown` only log.
  - `install` drops its `-o`/`-g` owner flags; `sudo -u` runs the command.
  - `rm` fails only where a case asks.
- **The fixture package** carries `release.json` for `7097ac2`, the real `package.json` and lock, and a stand-in `dist/server/datatool.js`:
  - `check` fails on a file named `BAD`;
  - `backup` logs `SENTINEL-BACKUP`, or fails when asked.
  - `npm ci` runs for real.

| Path | Positive | Negative cases (each must not reach the later sentinels) |
|---|---|---|
| Promotion | P1: `VERIFIED`; stop, backup, start; `ws zod` only | P2 wrong bytes · P3 missing · **P4 the review's case** · P5 an unremovable stale marker with the correct archive · P6 stale marker then wrong bytes · P7 wrong revision · P8 extra file · P9 repacked (rebuild-like) · P10 flags left set by an earlier run · P11 the stop fails (no backup, no start) · P12 the backup fails (no switch, no start) |
| First install | F1: linked, data checked, reloaded, started; the unit names the throwaway folder; the real folder never created | F2 wrong bytes · F3 missing · F4 no `ReadWritePaths=` · **F5 the review's case** (the data check fails) · F6 the settings name the real folder · F7 named twice · F8 the reload fails · F9 an unremovable stale marker · F10 the prepare block keeps an existing settings file |
| The switch | W1: stopped, new folder, reloaded, started; the validation room kept | W2 the settings still name the throwaway folder · **W3 the review's case** (the stop fails, the real folder holds a room) · W4 the stop fails, no real folder · W5 the real folder holds a room · W6 the real folder exists empty · W7 the code wasn't replaced · W8 the folder named twice · W9 the reload fails · W10 a file appeared in the new folder between parts A and B |

**Checks across the switch cases:**
- the validation room is kept in every case;
- an existing real folder is left exactly as it was;
- neither access code appears in any output.

**The harness's own negatives** ([gate-mutations2.sh.txt](gate-mutations2.sh.txt)): 16 mutations, each removing one guard from a copy of the runbook. Each must fail the case written for it.

## Every run, in order (raw logs)
| Run | What | Verdict | Log |
|---|---|---|---|
| Repro 1 | The review's three scenarios on the blocks at `ca15c99` | 3 of 3 defects reproduced | [repro-old-run1.log](repro-old-run1.log) |
| Fixtures 1 | The new blocks, first harness | PASSED, 86/86 | [gate-fixtures2-run1.log](gate-fixtures2-run1.log) |
| Fixtures 2 | Plus W10 and a dangling-link check (`-L`), added before the mutations so each guard has its own case | PASSED, 90/90 | [gate-fixtures2-run2.log](gate-fixtures2-run2.log) |
| Mutations 1 | 16 mutations against fixtures 2's harness | 16 of 16 caught | [gate-mutations2-run1.log](gate-mutations2-run1.log) |
| **Final** | **Repro on `ca15c99`, fixtures, mutations, record check and negatives on the committed docs** (each log's first line names the commit) | see the logs | [repro-old.log](repro-old.log), [gate-fixtures2-final.log](gate-fixtures2-final.log), [gate-mutations2-final.log](gate-mutations2-final.log), [record-check-final.out.txt](record-check-final.out.txt), [record-negatives-final.out.txt](record-negatives-final.out.txt) |
| **Links** | The changed docs | see the log | [doc-links-final.out.txt](doc-links-final.out.txt) |

**Notes on the logs:**
- Runs 1–2 and mutations 1 ran on the uncommitted working tree. Only the final runs bind to the committed docs.
- In the final logs, my local checkout path in the header lines is replaced with `<repo checkout>`; nothing else is edited.

## To reproduce
```
REPRO_OLD=ca15c999b822c722b35a21df1be6fa775ab9c4e6 bash gate-fixtures2.sh.txt <repo root>
bash gate-fixtures2.sh.txt <repo root>                     # needs network for npm ci
bash gate-mutations2.sh.txt <repo root> gate-fixtures2.sh.txt
```

## Limitations
- **The fixtures prove the gating, not the commands the stubs stand in for:** systemd, `useradd`, the owner flags, the real datatool, Caddy. Those are first observed in Stages 1–2 on the host.
- **The fixture archives are small, not the audited archive.** The gate checks the audited archive the same way: full hash, revision, inventory and packages.
- **The round-1 harness targets the round-1 blocks,** so it isn't rerun here. Its cases are carried into round 2: G1–G8 as P1–P12, F1–F4 as F1–F10, W1–W2 as W1–W10.
