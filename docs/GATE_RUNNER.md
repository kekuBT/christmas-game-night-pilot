# Gate runner (retired)

`scripts/run-gate.sh`, `scripts/test-run-gate.sh` and `scripts/stub-driver.mjs` were removed in Sprint 1. The runner swallowed every driver failure (`|| true`), always exited 0, never rebuilt the bundle it tested, only checked its timeout between drivers, and depended on `~/workspace` paths.

The replacement is `scripts/gate.mjs`; see [TESTING.md](TESTING.md). This file's earlier content is in git history (`git show 761e17f:docs/GATE_RUNNER.md`).
