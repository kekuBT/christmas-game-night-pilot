# W7 owner test packet: local validation of the operator steps (handoffs 6954764073, review 6955337359)

**What this is:** Claude's local tests of [`scripts/beta/w7-owner-preview.sh`](../../../../scripts/beta/w7-owner-preview.sh), the operator tool of [the packet](../../../beta/w7-owner-test-packet.md).
- **They ran on Claude's machine,** on loopback and synthetic data.
- **It wasn't a Codespace.** There was no GitHub forwarder and no owner's browser.
- **It isn't owner-run evidence, and it isn't independent evidence.**

**The runners:**
- [runners/local-run.sh](runners/local-run.sh): every operator step and its refusals, with `W7OP_LOCAL_TEST=1`, and a synthetic room driven through the API by `scripts/beta/w5-seed.mjs` and `w6-check.mjs`;
- [runners/probe-drive.cjs](runners/probe-drive.cjs): headless Chromium playing the probe's two pages on plain `http` loopback;
- [`scripts/beta/w7-owner-selftest.sh`](../../../../scripts/beta/w7-owner-selftest.sh): the tool's focused negatives (ownership isolation, the Codespace test-flag refusal, and the report gate on synthetic fixtures).

Scratch paths in the logs are replaced by `<scratch>`.

## `final/`: the first run, at `902407d` (kept unchanged; its browser step FAILED)
**This run did not test a browser.** `2-local-run.log` shows the driver's Chromium never launched (`Executable doesn't exist`).
- **Why:** the copy of the driver in the checkout resolved the project's pinned Playwright, whose browser isn't installed here.
- **The result:** the probe verdict was `INCOMPLETE`, and `start` refused on `INCOMPLETE`. The runner didn't check the driver's exit code, and it accepted any verdict, so the step was counted as a pass.
- **The correction:** report 6955277111's "a driven HTTP probe returned `UNSUITABLE`" was false for this run (review 6955337359). The other phases of this run passed as logged.

## `selftest-before-fix-902407d.log`: the failing test first
The new self-test, run against the `902407d` tool, fails as it should:
- **P1:** `cleanup` of an unprepared root (a real `git init` at `src/`) exits 0 and deletes the foreign files. The same happens with another root's record, with a tampered record, and with escaping or symlinked entries.
- **P2:** `W7OP_LOCAL_TEST=1` is accepted alongside the Codespaces variables.

That log was taken before two fixes to the test itself, so two of its lines aren't evidence about the tool:
- S1's `probe` line (exit 127) came from `timeout` being given a shell function;
- S7's interruption killed the wrong process group.

The tool's identity there (`sha256 2c4e6aef…`) is the `902407d` script.

## `final-<sha>/`: the repaired tool, on one clean checkout
See that folder's `summary.txt`. It holds the self-test, the local run (whose browser step must launch, and whose plain-`http` verdict must be exactly `UNSUITABLE`), and the W7 static checks on the change.

**Not shown:** GitHub's forwarder, the Ports panel, any owner browser, the Codespace's Node version, Render, and B-W7-01.
