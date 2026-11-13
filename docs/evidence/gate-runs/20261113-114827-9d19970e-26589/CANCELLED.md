# Run 20261113-114827-9d19970e-26589: CANCELLED (exit 130, no pass/fail verdict)

- **Revision:** `9d19970`.
- **Gate:** full.
- **Started:** 6:48 a.m. ET.
- **Cancelled:** at about 6:51 a.m. ET.
- **The gate's own record** (`report.json`, `summary.txt`): verdict `CANCELLED`, exit 130.
  - 3 steps passed: `typecheck-server`, `typecheck-web`, `lint`.
  - 1 cancelled: `unit-tests`.
  - 86 not run.
- **Who cancelled it:** I did. ChatGPT's spec feedback 6851031292 on PR #24 asked for a product change: older Cup entries take their day from the room's citation (D-S112-05). That made `9d19970` a superseded candidate, so this run couldn't be the checkpoint.
- **How:** the chain's background task was stopped. Afterwards no process carried this run's `MCHEZO_GATE_RUN` tag, and no `gate.mjs` was left.
- **Status:** not a pass, not a failure. It says nothing about `9d19970`.
