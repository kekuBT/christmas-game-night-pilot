# Trace: from the read-only preflight to go/no-go (review 6909578563; updated for review 6910988491)

One path through the revised runbook ([beta-r1-release.md](../../beta/beta-r1-release.md)), in the order an operator meets it.
- **Each step names:**
  - the section that says what to do;
  - the gate that must hold before the next step;
  - the row it fills in the draft record ([beta-go-no-go-DRAFT-7097ac2.md](../../device-testing/beta-go-no-go-DRAFT-7097ac2.md));
  - whether it changes the host.
- **What this trace is:** a desk trace, made by reading each command in order. The runbook's gated blocks were also *executed* against disposable fixtures:
  - the promotion block (with its artifact gate), the first install's two blocks, and the switch's two blocks;
  - round 2 ran each failed prerequisite the review named ([round 2](round2/README.md));
  - round 1 is kept as it ran ([fixtures log](gate-fixtures-final.log)).
- **What it is not:** nothing ran on a host, with systemd, with Caddy's DNS challenge, through `nc` on a real route, or on a phone.

## The path

| # | Step (runbook section) | What happens | Changes the host? | Gate before the next step | Draft record row it fills |
|---|---|---|---|---|---|
| 1 | **Choosing the route** ("Deciding the route"; "A recommendation for ChatGPT and the owner to weigh") | The owner answers F1–F6, ChatGPT recommends, the owner chooses | No | The route is **available under this handoff**. Only H1 (LAN only) is; H2–H4 need exposure, provisioning or spending ("Routes available under this handoff"). | Host route chosen (H1–H4) and its name |
| 2 | **Stage 0, read-only preflight** ("Stage 0: the read-only preflight") | R1–R8: observing and reading only (`uname`, `node -v`, `df`, the router's forwarding list, the firewall read only, `dig`, the owner's own account pages) | **No** | Every R row passes, and the results are recorded | Read-only preflight R1–R8; Node on the host (R2). R4 names the off-host backup place used by H3. |
| 3 | **Approval 1** ("Two approvals before anyone is invited") | The owner explicitly approves private validation on the selected route | — | **Owner's own approval**, with evidence = the route decision plus R1–R8 recorded. It doesn't allow invitations, another artifact, any public port or exposure, H2–H4, accounts or spending. | Approval 1 |
| 4 | **Stage 1, host software** ("Stage 1", item 1) | Only what Stage 0 found missing and Approval 1 names: Node 22; for H1, Caddy with the DNS module, its scoped token, and the R7 record | Yes, privately | Nothing beyond what Approval 1 names | (part of Isolated staging) |
| 5 | **Stage 1, first install parts 1–2** ("First install": the `first install, prepare` block, then the operator's edits) | `DATA=/var/lib/cgn-validation`: the service user, that throwaway folder, the backup and release folders, an empty settings file (an existing one is kept). Then by hand: the settings with the **throwaway** code, `MCHEZO_DATA_DIR` naming the throwaway folder once, **no** `MCHEZO_TRUST_PROXY`; and the unit from the architecture page. | Yes, privately | — | — |
| 6 | **Stage 1, the artifact gate** (First install part 3 runs "Promoting it", step 1) | Removing any old marker (and checking it's gone), then `sha256sum --check --strict` against the full pinned hash, unpack, `release.json` revision, the inventory digest, `npm ci`, exactly `ws zod`. Only a complete chain in **this run** sets `VERIFIED` and writes the marker. | Yes: an unpacked release folder only | **`VERIFIED 7097ac2…`.** On `STOP`: no `VERIFIED`, so every later block refuses by itself; record a no-go. Fixtures G1–G8 (round 1), P1–P12 and F9 (round 2); mutations M-hash, M-marker, M-rmchain, M-flagreset. | Isolated staging: the artifact gate printed `VERIFIED`; Archive SHA-256 and Inventory digest seen on the host (H1) |
| 7 | **Stage 1, link and start** (the `first install, start` block) | One chain: this run's `VERIFIED` → link `current` → the settings name the throwaway folder exactly once → `datatool check` of it → `ReadWritePaths=$DATA` set and checked → `daemon-reload`. `enable --now` only if all of it succeeded. | Yes, privately | The service runs on the throwaway folder. On `STOP`: not started; "When there is no previous package". Fixtures F1–F10 (round 2); mutations M-filink, M-fienv, M-ficheck, M-fiunit, M-fireload. | — |
| 8 | **Stage 1, the proxy** ("Stage 1", item 3) | Caddy in front (H1: the DNS challenge). This is now **the running isolated preview.** | Configuration | — | — |
| 9 | **Stage 2, route checks** ("Stage 2: the route checks") | V1: TLS `/health` from a device on the route and on a phone. V2: count the proxies with `nc` in the service's place, write the value (or nothing), restart, and V1 again. V3: WebSockets with the throwaway code on two phones. | Configuration only | V1–V3 pass **on the running isolated preview**. Until observed there, they stay PENDING. | Route checks V1–V3; `MCHEZO_TRUST_PROXY` value and how it was counted |
| 10 | **Stage 3, host and device checks** ("Stage 3"; [REAL_DEVICE_TESTING.md §7](../../REAL_DEVICE_TESTING.md#7-beta-launch-checks-real-phones-and-the-host-beta-r2)) | H1–H6 and P1–P8 against the isolated install, with the owner's own testers. H3 backs up `/var/lib/cgn-validation` as `validation-<date>` and copies it to the R4 place. H5 lists the data folder in use. | Restarts, a backup, a restore drill | Every row recorded, with no Blocker (§7.3) | The device and check tables (P1–P8, H1–H6); `/health` on the host; Backup folder name and the off-host copy |
| 11 | **Stage 4, go/no-go** ("Stage 4", item 1) | The completed record, then the owner's sign-off and ChatGPT's review: that is **Approval 2** | No | **Approval 2.** Until then the record's decision stays NO-GO (default). | Decision: Go / No-go; Owner's sign-off; ChatGPT's review |
| 12 | **Stage 4, the switch** ("Stage 4", item 2; the `switch, stop and prepare` and `switch, start` blocks) | Part A: stop; **only if the stop succeeded**, make `/var/lib/christmas-game-night` with `mkdir`, which refuses any existing folder, empty or not, and leaves it as it is. Then by hand: the settings get that folder and the real code. Part B: start only if part A succeeded in this shell, the settings name the folder once, the code line changed (by hash, never printed), the folder is still empty, the unit names it and the reload succeeded. Then `/health` and P1 on one phone. | Yes | `SWITCHED`, then `/health` and P1 pass. On `STOP`: the service stays stopped, every folder is kept. Fixtures W1–W10 (round 2); mutations M-swstop, M-swnew, M-swenv, M-swcode, M-swempty, M-swreload. | (the final `/health` and one P1, per the stage table) |
| 13 | **Invitations** ("Stage 4", item 3) | The family is invited | No | — | — |

## What the trace found, and the fix for each
Tracing steps 5–12 command by command found these gaps in the first version of this repair. They would have made the isolated validation fail, or touch the real data. All are fixed in this change (D-BR3-07).

| # | Gap | Effect | Fix | Proved by |
|---|---|---|---|---|
| T1 | "First install" created and checked `/var/lib/christmas-game-night` literally, while Stage 1 said to use `/var/lib/cgn-validation` | Validation could create, and be checked against, the beta's real folder | One `DATA=/var/lib/cgn-validation` at the top of First install, used by every step | F1: only the throwaway folder is created and checked |
| T2 | The unit's `ReadWritePaths=` named only the real folder (`ProtectSystem=strict`) | A service pointed at the throwaway folder couldn't write its data | `sed` sets `ReadWritePaths=$DATA`, and the start requires that exact line | F1, F4; M-unitgate |
| T3 | The unit isn't in the package, but step 4 ran `install … christmas-game-night.service` from the release folder. The R2 drill wrote its own unit, so this line never ran. | The command would fail with "cannot stat" | The operator writes the architecture page's unit; the runbook says so | (read: the package inventory has no unit file) |
| T4 | The settings preset `MCHEZO_TRUST_PROXY=1` before V2 counts | The proxy count would be assumed rather than measured | Left out until V2; then written, restarted, V1 again | Fixture check "doesn't preset MCHEZO_TRUST_PROXY" |
| T5 | Approval 1 didn't name the host software Stage 0 might find missing | Installing Node or Caddy had no approval to point to | Approval 1 and Stage 1 item 1 name them: only if missing, official packages, $0 | (read) |
| T6 | After a `STOP`, step 4's `datatool check` still ran from whatever folder the shell was in | Harmless but misleading output | `cd … && datatool check` | F2/F3 output: no check line after the STOP |
| T7 | Stage 4's switch was prose ("with `ReadWritePaths=` updated") | Nothing stopped a start on the old folder or the throwaway code | A gated `switch` block: it starts only if the settings and the unit both name the new folder | W1, W2; M-switchgate |

## What review 6910988491 found, and the fix for each
The first version of this repair still let a failed prerequisite through when a block is run as a whole. Each was reproduced on the blocks published at `ca15c99` ([repro-old.log](round2/repro-old.log)) before the fix (D-BR3-08).

| # | Gap (reproduced) | Fix | Proved by |
|---|---|---|---|
| T8 | First install: with a failed data check, the block still ran `daemon-reload` and `enable --now` | One chain: link → settings → data check → unit → reload → start | F5–F8; M-ficheck, M-fienv, M-fireload |
| T9 | The switch: with `systemctl stop` failing and the real folder already holding a room, it still changed the unit, reloaded and started; `install -d` accepted the occupied folder | A successful stop before any change. A **new** folder by `mkdir`, which refuses an existing one, left as it is. Part B checks the settings, the replaced code (by hash), the empty folder, the unit and the reload. | W3–W10; M-swstop, M-swnew, M-swenv, M-swcode, M-swempty, M-swreload |
| T10 | Promotion: with a stale marker that `rm` couldn't remove and the archive missing, it printed `STOP` and still reached `systemctl stop` | The removal is the first link of the chain. Later steps use this run's flags (`VERIFIED`, `STOPPED`, `BACKUP_OK`), reset at the start of every run, never the marker alone. Backup and switch need a successful stop. | P4, P5, P10–P12; M-rmchain, M-runflag, M-flagreset, M-stopflag, M-backupflag |

## What stays unproven until the host and phones
- **Every step from 4 onward** on a real host: systemd as PID 1, the unit's sandboxing, Caddy's DNS challenge and a public certificate on the LAN name, the `nc` proxy count, real phones on the home Wi-Fi.
- **The fixtures replace** `systemctl`, `useradd`, `install -o cgn` and the datatool with no-ops or sentinels, as their printed diffs show. They prove the gating, not those commands.
- **Real `npm ci`:** it ran against the real registry, but on fixture folders, not the audited archive (whose `release.json` revision and inventory it would check the same way).
