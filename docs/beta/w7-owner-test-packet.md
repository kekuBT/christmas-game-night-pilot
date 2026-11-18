# W7: the owner-run browser test packet (handoff 6954764073)

> **The route was changed (review and handoff 6957990858). Use [w7-routeb-recipe.md](w7-routeb-recipe.md).**
> - **Why:** Gate R failed twice in the owner's browser, `UNSUITABLE` (6957040472, then 6957543881).
> - **The new route:** ChatGPT tests hands-on over Route B, the existing private Firefox ESR / noVNC desktop, with the app's genuine HTTPS origin.
> - **What carries over from this packet:** §1 (phases and identities), §4 (O1–O7) and §5 (P1–P3), with `bstart` in place of `start`.
> - **What it replaces:** §2 (Gate R) and the owner's role.
> - **Route A is unchanged:** it still refuses an `UNSUITABLE` probe.

**What this is:** one bounded test for **this checkpoint only**.
- **The test:** the owner tests hands-on in a browser, and ChatGPT reviews the results.
- **What it replaces:** ChatGPT's independent interactive audit. The owner accepted that substitution.
- **How it is recorded:** as **owner-run evidence, never as independent testing.**
- **It changes the tester and nothing else.** It isn't deployment approval or permission to bypass a browser policy. It doesn't relax the origin or cookie checks, and it doesn't waive B-W7-01.

**What it can't change:**
- **W7 stays OPEN** until its actual requirements are met.
- **This packet can't clear B-W7-01** (the audited release pair, [render-w7.md](render-w7.md)).

**The roles:**
- **The owner:** browser observations only, with no shell commands.
- **The operator:** an agent with a terminal in the **existing, authorized Codespace**, coordinated by ChatGPT. It runs [`scripts/beta/w7-owner-preview.sh`](../../scripts/beta/w7-owner-preview.sh) and nothing else that changes state.
- **ChatGPT:** coordinates the session and reviews the results.
- **Claude:** prepared the packet and tested the operator steps locally. Claude has no access to the Codespace.

## 1. What is served, phase by phase
| Phase | Served revision (local `/health` must show it) | Artifact identity (checked by `prepare` before anything is served) | Label |
|---|---|---|---|
| **A: current** | `988c53558bbbcc1545fe0ca32882f30c1970794b`, the runtime review candidate | A local pack (`scripts/release/pack.mjs`). `release.json` names that revision. Its inventory is **144 files, SHA-256 `4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef`**, recorded from Claude's Node v22.16.0 build. | **Unaudited** local pack. Its runtime is identical to `72e9d8b`. |
| **B: previous** (the rollback) | `7097ac2bb062925bb296a129f4771f1e68fd522d` | A local rebuild. Its inventory must equal **the audited release's: 144 files, `fe6d74f8df7280a52102f70ab1d356428e810dfa614f45b53a60596d8e89a61c`** ([release-7097ac2.md](release-7097ac2.md)). | The audited target's **files**, rebuilt locally. These are not the audited archive bytes `a693c543…`. |
| **C: return** | `988c535…` again | The same pack as phase A | As phase A |

**Together, A and B are a LOCAL SURROGATE release pair.** The current side is unaudited, so this pair can't stand in for B-W7-01's audited pair. Every result from phases B and C is labelled LOCAL SURROGATE.

**Why `7097ac2` is the previous phase,** not the rehearsal's `f93e9cb`:
- it is the real rollback target;
- its rebuilt files can be checked against the audited inventory;
- its server is identical to `988c535`'s (`git diff 7097ac2 988c535 -- src` is empty). So compatibility holds by construction, and it is **still checked** (`compat`, `check`).

**`prepare` stops before anything is served if an inventory differs** (for example, under a different Node version). In that case, report `evidence/identity.txt` and don't serve.

## 2. The route: is there a supported way for the owner's browser?
**What the recorded evidence shows:**
- **ChatGPT's cloud browser:** the probe returned `REWRITTEN_SAME_ORIGIN_ONLY` twice, with own origin `https://localhost:3157` (6952207048). That is valid **for that browser session only.**
- **The owner's browser:** `UNSUITABLE`, with own origin `http://localhost:3157` (6954127832).
- **So the recorded evidence can't establish a route for the owner.** Route A's value is per client (D-BR1R-09, D-BR1R-10), and the address in the owner's tab is unknown. **Changing the tester doesn't fix this either.**

**The only supported owner route** needs no HTTP allowance, no remote browser, no public port and nothing new. It is **route A in the owner's own browser**:
- **Open the private forwarded `https://` address directly.** The operator prints the exact address.
- **Not a `localhost` link.** VS Code desktop's port forwarding opens `http://localhost:3157`. That gives an `http` origin, which the check refuses by design.
- **The probe must pass in that same browser session.** This is route A's standing precondition for every session, not a new diagnostic.

**Gate R, the entry check. It runs once and is part of the test:**
1. **The operator** runs `probe`. In the Ports panel, **3157 and 3158 must both show Private.**
2. **The owner opens the OTHER page,** `https://<codespace>-3158.app.github.dev/`, waits for "Control ready", and presses its button **once**. The page then leaves itself.
3. **The owner opens the TARGET page,** `https://<codespace>-3157.app.github.dev/`. They note the **VERDICT** line, and **what the address bar shows** (`https://…-3157.app.github.dev` is expected).
4. **The operator** presses Ctrl-C, keeping `evidence/probe-report.json`.

**Decide from the verdict:**
- **`REWRITTEN_SAME_ORIGIN_ONLY` or `PRESERVED`:** go on. `start` takes the report's `ownOrigin` as the exact public origin. It refuses any other verdict, and any origin that isn't `https`.
- **`INCOMPLETE`:** repeat steps 2–3 once (the probe's own rule).
- **Anything else** (`UNSUITABLE`, `UNSAFE`, `INCONSISTENT`, or `INCOMPLETE` twice): **STOP. The app isn't started.** Report this exact prerequisite as the blocker: *"no private route gives the owner's browser an `https` own origin without an HTTP allowance or a remote display."* With this Codespace and its forwarder, nothing in this packet can supply it.
  - No further loop is proposed.
  - Moving the test elsewhere, for example to a hosted HTTPS window after execution approval, is **the owner's explicit decision**, and it is pending ([beta-r4-readiness.md](beta-r4-readiness.md#5-the-unresolved-preview-audit-the-smallest-supported-next-action)).

## 3. The operator's steps (the existing, authorized Codespace only)
**Before you start:**
- **Use a new folder,** for example `/workspaces/w7-owner-$(date +%Y%m%d)`.
  - Never the main checkout, `/workspaces/mchezo-w7-live.SXcNNq`, or another test's folder.
  - `prepare` refuses a folder that holds anything but `src/`.
- **Inspect first:** `bash <W>/src/scripts/beta/w7-owner-preview.sh inspect`. It changes nothing.
  - **If 3157 or 3158 is in use by someone else's test, don't stop it.** Coordinate with them, or wait.
- **The budget:** the existing $10 Codespaces cap is unchanged, and so is the machine type. Stop the Codespace when the session ends.
- **Never:** make a port public, add a provider, deploy, or touch Render.

```bash
W=/workspaces/w7-owner-YYYYMMDD                       # new, empty
git clone --branch claude/beta-r4-w7-rollback --single-branch https://github.com/kekuBT/christmas-game-night-pilot "$W/src" \
  && git -C "$W/src" checkout --detach <this packet's commit, named in the report> \
  && bash "$W/src/scripts/beta/w7-owner-selftest.sh"   # about 1 min; must end PASSED
T="bash $W/src/scripts/beta/w7-owner-preview.sh"
$T inspect                      # read-only, on its own
```
**Then, if the self-test passed and `inspect` shows nothing in the way:**
```bash
$T prepare "$W" && $T probe "$W"   # builds both phases (stops unless both inventories match), then Gate R; Ctrl-C after the verdict
```
**Only when the verdict passes** (section 2), on its own:
```bash
$T start "$W" current           # refuses without a passing probe; waits for /health = 988c535; prints READY + the address
```

**Only after `start` prints `READY`,** with `/health` on the expected revision:
- give the owner the address, and the code from `<run folder>/secret/code` (`prepare` prints the run folder's path);
- send them privately, in the coordinating chat, **never on GitHub**;
- keep the code out of every log and screenshot.

**Every start and stop goes into `$W/evidence/phases.log`:** the revision, the origin, the data folder, the pid, and the startup's `[restore] …` line.

**What the tool may touch** (reviews 6955337359 and 6955682854; D-R4W7-02, D-R4W7-03):
- **The record:** `prepare` first writes `$W/.w7op-owner`, mode 600, holding a marker, the canonical root and a token.
- **One run folder:** `prepare` then creates `$W/w7op-<token>` with a plain `mkdir`, which fails if anything is already there.
  - A token file goes inside it, and its identity (device, inode and birth time) is recorded.
  - **Everything the run creates lives in that folder:** the code, the data, backups, the probe, builds and compatibility copies. Nothing outside it is created or taken over, apart from `evidence/`, which is kept.
- **Every other command checks the record and the run folder's identity first.** It refuses a run folder that is missing, a symlink, someone else's, replaced (even when the inode number is reused), or a run already cleaned up.
- **`cleanup`:**
  - **The order:** it removes the code first, then everything else in the run folder, then the token file and the folder.
  - **It retires the record only after that.** A retry after success removes nothing, so a replacement made under the same name is never touched.
  - **An interrupted or failed cleanup can be retried** (review 6956209006):
    - before the token file goes, the token and the identity prove the folder;
    - after it, the recorded identity alone does, if the birth time is known. Then only an `rmdir` of the empty folder is allowed;
    - a replacement made in between is refused.
  - **With no recorded identity, nothing is removed.** That happens only if `prepare` stopped right after its `mkdir`. The record isn't retired either, and the message says how to recover by hand.
- **`W7OP_LOCAL_TEST=1` is refused outright** whenever any Codespaces variable is set. In a Codespace, the probe gate always applies.

## 4. The owner's checklist (phase A, current)
**Set up three browser profiles,** or two profiles and one private window, **each signed in to GitHub once** (the port is private):
- **Host:** the first profile, at phone width (for example 390 px, by narrowing the window or device emulation).
- **Guest:** the second profile, also at phone width.
- **TV:** the third, as a wide window.

**For each item, write what you saw in the template (section 6).**

| # | Do | Expect |
|---|---|---|
| O1 | Open the address. Enter a **wrong** code, then the right one. | The wrong code shows "That code didn't work…" and stays on the gate. The right one opens the app. No certificate warning. |
| O2 | **Host:** Host a game (Casual). **Guest:** Join a game, typing the room code. **TV:** open `/tv` and type the code. | The guest's name appears once. The TV watches without taking a seat. |
| O3 | Play **Everyday Trivia** to the end with host and guest. Take a screenshot of the standings. | During play, the TV shows no answer and no correct answer. At the end, the phones and the TV show the same scores. |
| O4 | **Host:** Room menu → **Memory Book** → enter `W7 owner seed` → **Add from last finished game** → **Approve**. | The note shows once, linked to that game's result. |
| O5 | **Play again** (the rematch), and play it to the end. Then **Pick another game**, and start and leave a next game, or return to the lobby. | After Play again, both seats are kept, readiness resets, and the TV again shows no answers. Moving to the next game works from the result screen. |
| O6 | During a question: **reload the guest**. Then turn the guest's network off for about 10 s (devtools offline, or Wi-Fi off), and back on. | The same seat and the same question, and earlier answers are kept. A short "reconnecting" note at most. **No second seat, and no score counted twice.** |
| O7 | Throughout, at phone width. | Note anything hard to read, cut off, or confusing, especially controls whose purpose wasn't clear. |

## 5. The W7 part: rollback and return, with pause points
All of it is **LOCAL SURROGATE** (section 1). Leave the three tabs open throughout.

| Step | Who | What | Pass |
|---|---|---|---|
| **P1** | Owner (phase A) | **Before the rollback,** take a screenshot of: the seats (names on host, guest and TV); the **completed standings**; the **saved entry** `W7 owner seed`. Make sure O5's rematch was **finished**. Then say "P1 done". | — |
| R1 | Operator | One chain: `$T stop "$W" && $T backup "$W" before-rollback && $T compat "$W" before-rollback && $T start "$W" previous`. The backup is verified by both releases; `compat` has the previous release verify, restore and check the copy. A failure stops the chain before `start` (`echo $?` isn't `0`). | `backup OK` + `verify OK` ×2; `restore OK`, `check OK`; `/health` = `7097ac2…`; `[restore] N room(s) restored, 0 not loaded`. **Any failure: STOP the rollback, and don't start the previous release.** Then say "P2 ready" and give the revision. |
| **P2** | Owner (phase B: the previous release) | The tabs reconnect by themselves (if not, reload each **once**). Check that seats, standings and the saved entry match P1. Then make **one new action:** Memory Book → `W7 rollback note` → **Add from last finished game** → **Approve**. | Same seats with no rejoin. The standings equal P1's, and the entry is there. The new note shows once. |
| R2 | Operator | One chain: `$T stop "$W" && $T backup "$W" before-return && $T check "$W" current && $T start "$W" current`. `check` confirms the current release accepts what the previous one wrote. A failure stops the chain before `start`. | `check OK`; `/health` = `988c535…`. Then say "P3 ready". |
| **P3** | Owner (phase C: the return) | The tabs reconnect. Check the seats and standings, `W7 owner seed`, and `W7 rollback note`. | Everything as P2, and **`W7 rollback note` exactly once**: it survived the return once, not twice and not lost. No score changed. |
| End | Operator | `$T stop "$W" && $T cleanup "$W"`. That deletes the synthetic data, backups, copies and the code, and keeps `$W/evidence`. Then stop the Codespace. | — |

**This shows:** a browser session across a rollback and a return, between two locally built releases, on synthetic data.

**It doesn't show:**
- Render's revert-commit deploy, maintenance mode or one-click rollback;
- the audited release pair;
- native devices (W8).

## 6. The evidence template (the owner fills it in; ChatGPT reviews it)
```markdown
### W7 owner-run browser test: owner-run evidence (NOT independent testing)
- Date/time (ET):            Tester: the owner            Reviewer: ChatGPT
- Gate R: verdict ______; target tab's address bar showed https://<codespace>-3157.app.github.dev (yes/no: ____)
- Revisions the operator reported: phase A ______  phase B ______ (LOCAL SURROGATE)  phase C ______

| # | Device / browser / profile | Phase + revision | Expected | Actual | Screenshot (file name) | Notes |
|---|---|---|---|---|---|---|
| O1 | | A | | | | |
| …  | | | | | | |
| P1 | | A | | | | |
| P2 | | B (LOCAL SURROGATE) | | | | |
| P3 | | C (LOCAL SURROGATE) | | | | |

- Untested / skipped, and why:
- Anything confusing:
```
**The screenshot rules:**
- **Never show:** the access code, cookies, devtools storage or network panes with cookie values, or any token.
- Room codes and names are synthetic and fine.

## 7. Tested here (Claude's machine, not a Codespace)
**A correction (review 6955337359).** The first reported run, at `902407d`, **did not test a browser.**
- **What its log shows** (kept unchanged in `final/`): the driver's Chromium never launched (`Executable doesn't exist`). The probe verdict was therefore `INCOMPLETE`, and `start` refused on `INCOMPLETE`.
- **What I reported instead:** that report (6955277111) said a driven HTTP probe returned `UNSUITABLE`. That was **false for that run.** `UNSUITABLE` came from an earlier scratch run that wasn't committed.
- **What changed:**
  - the driver now uses the preinstalled Chromium and exits non-zero if it can't launch;
  - the runner requires the browser step to succeed and the verdict to be exactly `UNSUITABLE`.

**The current evidence**, in [docs/evidence/beta-r4-w7/owner-packet/](../evidence/beta-r4-w7/owner-packet/README.md):
- **[`scripts/beta/w7-owner-selftest.sh`](../../scripts/beta/w7-owner-selftest.sh)**, the focused negatives:
  - P1 ownership isolation: an unprepared root, a record copied from another root, tampered records, unexpected and escaping paths, symlink escapes, an interrupted `prepare`;
  - P2: the test flag inside a Codespace, refused;
  - the probe-report gate on **synthetic report fixtures**, which are not browser results.
- **The local run** of every operator step, with `W7OP_LOCAL_TEST=1` on loopback and synthetic data, with no GitHub forwarder and no owner's browser. It covers:
  - both inventories matching;
  - the refusals: outside a Codespace; a second `prepare`; a second writer;
  - **a real headless-Chromium run of the probe on plain `http`, whose verdict must be exactly `UNSUITABLE`**, and `start` refused because of it;
  - the three phases, with a synthetic room driven through the API (`w5-seed.mjs`, `w6-check.mjs`);
  - the cleanup, and a leak scan for the code.

**Not tested here:** GitHub's forwarder, the Ports panel, the owner's browser, and the Codespace's own Node version.
