# W7 owner test packet: local validation of the operator steps (handoff 6954764073)

**What this is:** Claude's local test of [`scripts/beta/w7-owner-preview.sh`](../../../../scripts/beta/w7-owner-preview.sh), the operator tool of [the packet](../../../beta/w7-owner-test-packet.md).
- **It ran on Claude's machine,** with `W7OP_LOCAL_TEST=1`, on loopback and synthetic data.
- **It wasn't a Codespace.** There was no GitHub forwarder and no owner's browser.
- **It isn't owner-run evidence, and it isn't independent evidence.**

**The runners:**
- [runners/local-run.sh](runners/local-run.sh): every operator step and its refusals, with a synthetic room driven through the API by `scripts/beta/w5-seed.mjs` and `w6-check.mjs`;
- [runners/probe-drive.cjs](runners/probe-drive.cjs): headless Chromium playing the probe's two pages, on plain `http` loopback.

**The final run:** on one clean checkout of the packet commit; see `final/`. Scratch paths in the logs are replaced by `<scratch>`.
- **What it ran:**
  - both releases built, each inventory equal to its expected value;
  - the refusals:
    - outside a Codespace;
    - a second `prepare`;
    - a `start` under the probe's `UNSUITABLE` verdict (the expected verdict on plain `http`);
    - a second writer;
  - phase A on `988c535`;
  - the backup, verified by both releases;
  - the previous release's compatibility check;
  - phase B on `7097ac2`: the same seats, the approved entry and the answers, and ONE new answer acknowledged;
  - the backup, then the current release's check of the folder;
  - phase C on `988c535`: the seats, the entry, and the new answer present with its value (read-only);
  - the cleanup;
  - the leak scan for the code.
- **Not shown:** GitHub's forwarder, the Ports panel, any owner browser, the Codespace's Node version, Render, and B-W7-01.
