# Beta R2: release preflight evidence (handoff 6908014247)

**What this is:** launch-readiness documentation and evidence only. The runtime candidate is unchanged: `7097ac2bb062925bb296a129f4771f1e68fd522d`, whose full gate `20261116-035311-7097ac2b-9479` passed (exit 0, 111/111). Nothing here was provisioned, deployed, published on a public port, or paid for.

**Where it ran:** this cloud container, 2026-11-16 between 05:19 and 05:45 UTC.
- **Scratch:** `<scratchpad>` stands for the session's throwaway folder.
- **The drill's root:** a throwaway folder under `/srv`, made and removed by each run.
- **Names and codes:** synthetic. The drill's access code was random per run and never printed.

## 1. The package (item 1: the promotion artifact)
| File | What it shows |
|---|---|
| `node-v22.16.0-download.txt` | Node v22.16.0 from nodejs.org, its SHA-256 checked against the official `SHASUMS256.txt` (OK). Its GPG signature was **not** checked. |
| `build.sh.txt`, `inventory.sh.txt` | **The build:** a fresh clone, `git checkout --detach 7097ac2`, `npm ci`, `pack.mjs`, `tar`, `sha256sum`. **The inventory:** every file but `release.json`, hashed. |
| `build1-node22.16.0.log` | Build 1: archive `d827e14d…ea7d` |
| `build2-node22.16.0.log`, `inventory-build2.sha256` | Build 2, same Node: archive `e5738094…fe52`, **the same 144-file inventory** |
| `build3-node22.23.4.log`, `inventory-build3.sha256` | Build 3, this machine's Node: archive `432f53df…cdcc`, **the same inventory** |
| `../../beta/release-7097ac2.inventory.sha256` | Build 1's inventory, the one recorded. Its digest, `fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c`, is the same for all three builds. |

**The audited archive** in the review Codespace was **not** read: this session has no access to it. Its SHA-256 is still to be recorded by whoever holds it (`docs/beta/release-7097ac2.md`).

## 2. The host comparison (item 2)
- **`official-sources.md`:** the verbatim extracts relied on, each with its file, line and pinned commit:
  - Caddy, Let's Encrypt and Cloudflare documentation;
  - Tailscale's source code;
  - Node's schedule.
  - It also lists what couldn't be read from here.
- **`xff-caddy-2.6.2.out.txt`:** what Caddy 2.6.2 forwards when a client sends its own `X-Forwarded-For`. Caddy drops it and writes the connecting address. The runbook's proxy-count step was corrected to match.

## 3. The runbook, run as a drill (validation)

> **Safety correction (review 6908455526).** The first version of the drill installed its EXIT trap **before** checking for an existing `cgn` account. A refusal (exit 2) would still run cleanup, which called `userdel cgn` and `groupdel cgn` whenever they existed, so it could delete accounts it didn't create.
> - **Runs 1–4 used that version.** On this machine no `cgn` user or group existed before any of them: each run created both, and its own cleanup removed them.
> - **Kept, marked do-not-run:** `preflight-drill.v1-unsafe.sh.txt`, with its logs kept as history.
> - **The second version (run 5)** fixed that, but inferred ownership from what existed after `useradd` (review 6908557588). It is kept as `preflight-drill.v2-late-collision.sh.txt`, marked do-not-run.
> - **The current script** is `preflight-drill.sh.txt` (section 3b).

`preflight-drill.sh.txt` runs the runbook's own commands, with `<prefix>` standing for `/`:
- **A. The artifact:** the recorded hash, unpacking, `release.json`, the inventory digest, `npm ci --omit=dev --ignore-scripts`, only `ws` and `zod` installed.
- **B. First install:**
  - a real system user `cgn`, made and removed by the run;
  - the folders and the settings file with the runbook's modes;
  - `datatool check` as `cgn`;
  - the server started the way the unit starts it (as `cgn`, the env file, `UMask 0077`), listening on 127.0.0.1 only.
- **C. The HTTPS proxy:**
  - `caddy validate` on the runbook's site block with its maintenance page;
  - Caddy 2.6.2 in front, with a local CA, because this name isn't public;
  - `drill-client.mjs.txt` through it, with the certificate verified: `/health`, HSTS, the gate (refusals and entry), a foreign Origin refused, a room with two players, and a live `wss://` message.
- **D. Restart with persistence:**
  - a clean SIGTERM, and the lock gone;
  - the maintenance page (503) while stopped;
  - the data private and owned by `cgn`;
  - after the restart, the restore line, the same room, the same cookie, and `wss://` again.
- **E. Backup and isolated restore:**
  - a backup as root (0700/0600, unreadable by `cgn`), then `verify`;
  - `restore --owner cgn` into a new folder, then `check` as `cgn`;
  - a restore into the live folder is refused;
  - the restore drill's server on port 3999 loads the room;
  - the drill copy is removed, and the live data is byte-for-byte unchanged.
- **F. First-install stop:** stopped and kept stopped, the data untouched, the site on its maintenance page.
- **G. The unit:** `systemd-analyze verify` on the unit from the architecture page. Its only complaint is that `/usr/bin/node` is missing in this container. That became preflight check P2.

| Run | Result |
|---|---|
| `drill-run1-aborted-driver-error.log` | **Invalid, my driver's errors.**<br>• `curl` went through this session's outbound proxy, with no timeout, and hung at C2.<br>• `ss` isn't installed, so B9 failed.<br>• I stopped the run. My manual clean-up raced its remaining steps.<br>• Its results aren't used. |
| `drill-run2-two-vacuous-checks.log` | 42 "passed". **Two checks proved nothing:**<br>• C2 took the exit status of an `echo`;<br>• A5 took that of a `tail`.<br>The client's own certificate-verified `/health` check (C3) passed in the same run. **Not counted.** |
| `drill-run3.log` | **PREFLIGHT DRILL PASSED, 42/42.**<br>• C2 now requires curl's exit 0 and the exact body.<br>• A5 requires npm's own exit code.<br>• E5 and E6 require the tools' exact `verify OK` and `restore OK: 1 room(s)` lines. |
| `drill-run6-confirmed-ownership.log` | **PREFLIGHT DRILL PASSED, 42/42,** with the current script.<br>• `B1 … groupadd exit 0, useradd exit 0; created: user 1, group 1`.<br>• `cleanup: removed only what this run created (user 1, group 1, prefix 1)`.<br>• Nothing was left. |
| `drill-run5-fixed-script.log` | **PREFLIGHT DRILL PASSED, 42/42,** with the second version (later found to infer ownership; see 3b).<br>• `B1 … created: user 1, group 1`.<br>• `cleanup: removed only what this run created (user 1, group 1, prefix 1)`.<br>• Nothing was left behind. |
| `drill-run4-negative-wrong-hash-and-inventory.log` | **The drill fails when it should:**<br>• a wrong recorded hash and a wrong inventory digest;<br>• A1 and A4 fail, 40 pass;<br>• "PREFLIGHT DRILL FAILED", exit 2. |

### 3b. The drill's own safety (reviews 6908455526 and 6908557588)
**The current script, `preflight-drill.sh.txt`:**
- **The refusals come before any trap or change:** an existing `cgn` user, an existing `cgn` group, or an existing prefix folder each exit 2. At that point there is nothing to clean up.
- **Ownership comes only from this run's own confirmed creation steps** (review 6908557588):
  - **the prefix folder:** only when its own `mkdir` succeeds;
  - **the group:** only when `groupadd --system cgn` exits 0;
  - **the user:** only when `useradd --system … -g cgn cgn` then exits 0.
  - **Why exit 0 is enough:** both tools fail atomically (exit 9) on a name that is already taken. So a name another run took after the startup checks is refused and never claimed.
  - **Equivalence:** this is the two-step equivalent of the runbook's `useradd --user-group`.
  - **What it replaced:** the second version claimed whatever `cgn` existed after `useradd`.
- **Cleanup deletes only those,** and kills only the processes it started.
- **A failed group or user step** ends the run with a refusal (exit 2).
- **SIGTERM and SIGINT** end it through the same cleanup (exit 143 and 130).

**The evidence:**

| File | What it shows |
|---|---|
| `repro-v1-unsafe-cleanup.log` | **The finding reproduced with the unsafe version.**<br>• **The fixture:** a `cgn` user made for the check.<br>• **The stubs:** `userdel` and `groupdel` only logged, so nothing could be deleted.<br>• **The result:** the drill printed its refusal and exited 2, then attempted `userdel cgn` **and** `groupdel cgn`.<br>• The check then removed its own fixture. |
| `repro-v2-late-collision.log` | **The second finding reproduced with the second version.**<br>• **The race:** "another run" created the `cgn` user and group while this run prepared the package.<br>• **The result:** this run's `useradd` exited 9, yet B1 reported `created: user 1, group 1`, and cleanup attempted `userdel cgn` and `groupdel cgn`.<br>• **The stubs:** logging-only, so nothing was deleted. |
| `drill-safety-check.sh.txt`, `drill-safety-check-run2.log` | **DRILL SAFETY CHECK PASSED, 24/24,** against the current script.<br>• **S1–S4:** the cases below.<br>• **S3 now:** this run's `groupadd` succeeds, then `useradd` fails. The drill refuses (exit 2), and the only deletion is `groupdel cgn`, the group it created.<br>• **S5, another run takes the user and group during package preparation:** refused at `groupadd` (exit 9 → exit 2). **No deletion attempted.** The other run's uid and gid are unchanged. Cleanup reports `user 0, group 0, prefix 1`, and the run's folder and processes are gone.<br>• **S6, another run takes only the user:** refused at `useradd` (exit 9 → exit 2). The only deletion is `groupdel cgn`, this run's own group. The other run's user is unchanged, and cleanup reports `user 0, group 1, prefix 1`.<br>• **After removing the other run's fixtures:** nothing is left. |
| `drill-safety-check.v1.sh.txt`, `drill-safety-check-run1.log` | **DRILL SAFETY CHECK PASSED, 14/14,** against the second version: the earlier check.<br>• **The method:** `userdel` and `groupdel` are logging wrappers around the real tools, so every attempted deletion is recorded.<br>• **S1, an existing user without a group:** refused, exit 2. No deletion attempted, the uid unchanged, no folder made.<br>• **S2, an existing group without a user:** refused, exit 2. No deletion attempted, the gid unchanged.<br>• **S3, a `useradd` stub that creates the group and then fails:** the drill stops (exit 1). The only deletion is `groupdel cgn`, the group this run created, and nothing is left.<br>• **S4, SIGTERM after the service user exists and the server runs as `cgn`:** exit 143. Cleanup reports `user 1, group 1, prefix 1`. The only deletion is `userdel cgn`, which also removed its private group. No user, group, folder or process is left. |

**What remains:**
- **Cleanup deletes only identities this run created.** It checks they still exist, but not that nothing else replaced them in between: for that, another process would have to delete this run's own `cgn` while it runs and create a new one.
- **The drill stays for disposable machines only,** never a host with a real service user.

**Found by the drill and fixed in the docs:**
1. **The runbook's first-install log line:** it promised `[restore] 0 room(s) restored`. An empty first install prints no `[restore]` line (step B8).
2. **The settings file's mode:** the architecture page said 0600 root-only, and the runbook said 0640 root:`cgn`. They now agree on the runbook's mode, the one drilled.

**Not covered by the drill:**
- systemd as PID 1;
- a public certificate, or any real route (H1–H4);
- a real host and real phones;
- Caddy newer than Ubuntu's 2.6.2.

## 4. Links and paths
`check-doc-links.mjs.txt` checks every relative link, heading anchor and backticked repository path in the release docs. Run on the final docs, this README included (`doc-links-final.out.txt`):
- **Result:** "DOC LINKS PASSED", with 115 links and paths in 9 files (112 before the review 6908455526 update).
- **External links:** listed, not fetched.
- **One path is named on purpose although it doesn't exist yet:** `content/approvals.json`. Each doc says so.

## 5. Why no new gate run
- **The delta:** `git diff --name-only 7097ac2 -- . ':!docs'` lists **0 files**. The delta from the cleared runtime touches only `docs/`.
- **What reads docs:** no test, driver or gate step reads the documents changed here. A search of `tests/` and `scripts/` for their names finds comments only.
- **So:** full gate `20261116-035311-7097ac2b-9479` (PASSED, exit 0) still covers everything that runs, and no gate was started for this slice.
