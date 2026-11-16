# Beta R3: the decision-ready release record (handoff 6909443770)

**Scope:** docs and evidence only. The runtime is unchanged: `7097ac2bb062925bb296a129f4771f1e68fd522d`, full gate `20261116-035311-7097ac2b-9479` PASSED (exit 0). No rehearsal or gate was rerun for these record updates, as the handoff asked.

## What changed
- **[release-7097ac2.md](../../beta/release-7097ac2.md),** the pinned promotion artifact:
  - the audited archive's SHA-256 `a693c5433d8dd8c17368e9c02fd8092b316d67b6e62ac9c0070a60b99c3a5131`;
  - its provenance: ChatGPT's verification in the private review Codespace, verdict 6909443770;
  - its inventory `fe6d74f8…` and its `release.json` (`7097ac2`, Node v22.16.0).
  - **Kept distinct:** my three rebuilds and the reproducible runnable files.
  - **Kept:** the R2 record, as written.
- **[beta-go-no-go-DRAFT-7097ac2.md](../../device-testing/beta-go-no-go-DRAFT-7097ac2.md),** from the template:
  - **Filled:** only the evidenced fields.
  - **PENDING:** every host, device and owner field. NO-GO by default.
  - **Earlier evidence** (the gate, the Firefox audit, the local rehearsal) is listed separately as not substitutes.
- **[beta-r1-release.md](../../beta/beta-r1-release.md):**
  - "Deciding the route": the owner's facts F1–F6, with verified prerequisites kept apart from unknown account, quota and billing facts, and the invariants;
  - "Two approvals before anyone is invited": the private target-host validation of the pinned artifact, then invitations and go. Both reference the existing stop and rollback conditions.
- **[REAL_DEVICE_TESTING.md §7](../../REAL_DEVICE_TESTING.md#7-beta-launch-checks-real-phones-and-the-host-beta-r2):** tied to the two approvals.

## Validation
| File | Result |
|---|---|
| `check-r3-record.mjs.txt`, `check-r3-record.out.txt` | **R3 RECORD CHECK PASSED, 40/40.**<br>• **The committed inventory:** it hashes to `fe6d74f8…`, with 144 files.<br>• **Agreement:** the release record, the draft and the runbook state the same runtime SHA, archive SHA-256 and inventory digest.<br>• **PENDING in the draft:** every host field, P1–P8, H1–H6 and every device, with no result marks.<br>• **The draft's decision:** NO-GO by default, both approvals PENDING, and the earlier evidence marked as not substitutes. |
| `check-r3-record-negative.out.txt` | **The check fails when it should,** on mutated copies:<br>• a fabricated ✅ for P1;<br>• a one-digit-off archive hash in the draft;<br>• a host `/health` filled in.<br>Each exits 1 with the right FAIL lines. |
| `runtime-diff.out.txt` | **0 files** outside `docs/` changed since `7097ac2`. |
| `doc-links.out.txt` | **DOC LINKS PASSED,** with 132 links and paths in 9 files: the release docs, the draft record and this README (R2's `check-doc-links.mjs`). |

## Limitations
- **The archive's checksum and verification are ChatGPT's,** reported in 6909443770. This session hasn't read the archive.
- **The draft record is only a draft.** It holds no host or device evidence because none exists yet.
