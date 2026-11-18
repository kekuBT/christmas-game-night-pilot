# B-W7-01: local checks of the pins-only forward/revert pair (handoff 6966073894)

**What this is:** Claude's developer-run checks of the pair in [docs/beta/pins-72e9d8b/](../../../beta/pins-72e9d8b/README.md).
- **Where they ran:** this session's machine.
- **What they are not:** independent evidence, and not a check of the audited archives. Neither `aac13a8a…` (`72e9d8b`) nor `a693c543…` (`7097ac2`) is here. **Their positive checks are ChatGPT's,** on the retained bytes.
- **No full gate** was run (the handoff): this is docs and pin-patch preparation, with no app or runtime change.

## The runners
**1. `scripts/beta/w7-pins-selftest.sh`** works on an isolated clean clone of the base (#50 at `71d0200`). It covers the helper `scripts/beta/w7-pins-pair.sh` and the committed pair:
- **S2:** `make` reproduces the committed folder byte for byte.
- **S3:** `verify` passes.
- **S4:** in the repository layout, the forward changes exactly the six allowlisted paths, and the revert leaves the clone clean.
- **The failure controls,** each followed by a dependent step in the same `&&` chain, which must not run:

  | Case | What is wrong |
  |---|---|
  | **F1** | the base changed inside a hunk's context |
  | **F2** | the base changed outside every hunk: `git apply` alone would accept it |
  | **F3** | the forward patch applied twice |
  | **F4** | the reviewed text moved, so a substitution count is 0 (or 4 where 3 are expected) |
  | **F5** | an unexpected changed file: a guard script, the guard pin, `render.yaml` |
  | **F6** | a non-identity change inside an allowlisted file |
  | **F7** | another build's identity as the selected pin |
  | **F8** | a revert that doesn't restore the baseline |
  | **F9** | the output folder already exists |

- **Isolation and cleanup:**
  - **I1:** `SIGTERM` while the helper holds its private folder;
  - **I2:** the private temporary root is empty after every case, a sentinel is unchanged, and the checkout's HEAD, status, worktrees, refs and stash are unchanged.

**2. [runners/gate-archives.sh](runners/gate-archives.sh)** runs the proposed contexts through the **unchanged** artifact gate.
- **How the gate runs:** each context's own `cgn-artifact-gate.sh`, as the Dockerfile's gate stage runs it. `sh` is dash, Node is v22.16.0, and the inputs are filtered by the context's `.dockerignore`. No docker.
- **Its cases:**

  | Case | What goes in | Expected |
  |---|---|---|
  | **G1** | the developer archive `f3bd00ea…` under the proposed `aac13a8a…` pin | **refused** |
  | **G2** | that archive under the old name | not admitted, so refused |
  | **G3** | a local `7097ac2` rebuild, with the archive pin re-pointed to it | refused by the inventory |
  | **G4** | the reverted (canonical) context with a local `7097ac2` rebuild | refused |
  | **G5** | the reverted context with `f3bd00ea…` | refused |
  | **L1** | **LOCAL SURROGATE:** a pair made with the TEST pin `f3bd00ea…`, whose context differs from the proposal's only in the archive pin and the gate's archive comment, with `f3bd00ea…` | `ARTIFACT_GATE_OK` and `INSTALLED_OK` |

**The runs** on the tested commit are in `final/`, with its `summary.txt`.
