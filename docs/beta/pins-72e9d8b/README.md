# The pins-only forward change to `72e9d8b`, and its revert (B-W7-01, handoff 6966073894)

**A proposal for review. Nothing here is applied.**
- **The canonical deploy context is unchanged:** `deploy/render` on this branch still pins `7097ac2`.
- **The two patches are preparation artifacts.** Applying them in the private deploy repository is a later step, outside this handoff. Nothing here authorizes that step, a promotion or a deploy.
- **The selected identity** (handoff 6966073894):
  - revision `72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d`;
  - the audited archive `aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6`;
  - Node v22.16.0;
  - inventory `4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef`, 144 files.

  Its record is [release-72e9d8b.md](../release-72e9d8b.md).
- **The rollback target:** `7097ac2`, `a693c543…`, `fe6d74f8…` ([release-7097ac2.md](../release-7097ac2.md)).

## The files
| File | What it is | SHA-256 |
|---|---|---|
| `forward-7097ac2-to-72e9d8b.patch` | The forward change: the `7097ac2` context → the `72e9d8b` pins | `632125750b7dc9cd159cd93fefd3bf827b203b37ee5a411dedcdd62a69cae04f` |
| `revert-72e9d8b-to-7097ac2.patch` | Its inverse: the forward context → the `7097ac2` context, byte for byte | `26d897523c38ce8521abef7a62e06456e15b03b6a1dbdb101264c1e823905afe` |
| `IDENTITY` | Both identities, and the git tree hashes of the baseline and forward contexts | `d130755d4419eb4abab3bae3c2aba1feb61cff32792dd6a4ddf1595b036b5620` |
| `baseline.sha256` | The 11 baseline files, each with its SHA-256 | `c2b548be6fda254af0e462f77d7ad4ae2e2d929b64d69b898205316e529e6e15` |
| `forward.sha256` | The 11 files after the forward change | `6d9afd39fbd41d82ddd72ccba0c3329b806071963055e2fd9864137060fe6b20` |
| `SHA256SUMS` | The five files above | `11af1e9b24f17d3d3ef426d2361cf8f76450d1dd805aa075cab4932e05f9b30d` |

They were written by `bash scripts/beta/w7-pins-pair.sh make`, run on an isolated clean clone of the base. The self-test remakes them from the base and compares them byte for byte (case S2).

## The exact baseline
- **The base commit:** `71d02009a1b7ed537824b20a0c23d62b157046db` (#50).
- **The deploy context:** what [deploy/render/README.md](../../../deploy/render/README.md) "Assembling the deploy repository" copies. That is every file of `deploy/render` except `README.md` and `operator/`.
  - **The files (11):** `.dockerignore`, `Dockerfile`, `cgn-artifact-gate.sh`, `cgn-authorize.sh`, `cgn-backup.sh`, `cgn-entrypoint.sh`, `pins/age.sha256`, `pins/archive.sha256`, `pins/release-7097ac2.inventory.sha256`, `pins/scripts.sha256` and `render.yaml`.
  - **`artifact/` is not part of it.** The archive bytes are private and never in a patch.
- **The baseline tree** (those 11 files only): `106ba330772aa5abfb45a7f43711c026aea569ec`.
- **The forward tree:** `c282c08adbbf9429379bcc32d4043c4acf415de0`.
- **The patch paths** are relative to the context's root, as in the deploy repository:
  - **in the deploy repository:** `git apply <patch>`;
  - **in this repository:** `git apply --directory=deploy/render <patch>`.

## The allowlist: what the forward change touches (6 paths), and nothing else
| Path | The change |
|---|---|
| `cgn-artifact-gate.sh` | `REVISION=`, `ARCHIVE=` and `INVENTORY_SHA256=`. The inventory pin's file name, all 3 times. The 2 comment lines that name the pinned digests: `a693c543..., recorded in docs/beta/release-7097ac2.md` and `whose own SHA-256 is fe6d74f8...`. |
| `pins/archive.sha256` | `aac13a8a…  mchezo-72e9d8b.tgz` |
| `pins/release-7097ac2.inventory.sha256` | deleted |
| `pins/release-72e9d8b.inventory.sha256` | added: the 144-file inventory, byte for byte [release-72e9d8b.inventory.sha256](../release-72e9d8b.inventory.sha256) |
| `.dockerignore` | the two admitted names: the archive and the inventory pin |
| `Dockerfile` | the archive's name in its header comment |

**Unchanged, byte for byte** (the verify step and the self-test prove it):
- the guard scripts `cgn-entrypoint.sh`, `cgn-backup.sh` and `cgn-authorize.sh`;
- their pin `pins/scripts.sha256`, and the age pin `pins/age.sha256`;
- every image digest, `NODE_VERSION`, `INVENTORY_FILES` (144), `DEPS`, the environment, and every check of the gate;
- `render.yaml`, the provider configuration.

**How the change is made:** the exact, counted substitutions of `scripts/beta/w7-pred-context.sh`. Any substitution whose expected count is off stops it, so a moved baseline is refused, not guessed at.
- **The one addition** is the gate's two comment lines that state the pinned digests. Without it, the forward gate would describe `a693c543...` and `fe6d74f8...` while it enforces `aac13a8a...` and `4f58b323...`.
- **The alternative** (leave the comments stale) is recorded in DECISIONS (D-R4W7-06).

**The inventory change itself** is four lines: `index.html`, `sw.js`, and the two renamed hashed bundles ([release-72e9d8b.md](../release-72e9d8b.md)).

## The companion step the patch can't carry: the archive
In the deploy repository, the forward commit also swaps `artifact/mchezo-7097ac2.tgz` for `artifact/mchezo-72e9d8b.tgz`. The latter is the exact retained `aac13a8a…` bytes. The revert commit swaps them back.
- **This step is ChatGPT's,** where the bytes are kept.
- **The gate enforces it at build time:** `artifact/` must hold exactly the pinned name, and its SHA-256 must be the pinned one.

## Verifying the pair (anyone, on a clean checkout)
```
bash scripts/beta/w7-pins-pair.sh verify deploy/render docs/beta/pins-72e9d8b 72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d aac13a8a5e89f56013cfd8905a7c7f6216c640b98d51d25476b22141eddce2a6 4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef
```
- **It must end with** `PINS_PAIR_VERIFIED … guards=unchanged reverted=byte-identical`.
- **The identity is given on the command line.** The folder must pin exactly that identity, so a folder for another build is refused.
- **Its checks, in a private temporary copy:**
  1. the context is the recorded baseline, byte for byte;
  2. both patches touch exactly the six paths above, with no mode change, rename or binary data;
  3. the forward patch applies;
  4. the guards and their pins are unchanged;
  5. the three changed text files differ from the baseline only by the identity tokens (each new token is mapped back, and the result must be the baseline file);
  6. the pins agree with each other and with the identity;
  7. the forward tree is the recorded one;
  8. the revert applies, and leaves the baseline byte for byte;
  9. the forward patch applies again after the revert.

**The self-test:** `bash scripts/beta/w7-pins-selftest.sh` runs it on an isolated clean clone of the base, with its failure controls. **The gate checks:** the archive checks are in [the evidence](../../evidence/beta-r4-w7/pins-72e9d8b/README.md).

## ChatGPT's actual-pair checks (next; not done here)
1. **Check the forward context against the exact retained `aac13a8a…` archive,** through the unchanged gate: `ARTIFACT_GATE_OK` and `INSTALLED_OK` for `72e9d8b`.
2. **Check the reverted context against the exact `a693c543…` archive,** the same way, for `7097ac2`.
3. **Run the focused actual-pair protocol check** it chooses.

**What this session can't do:** it has neither archive. Both positive checks stay ChatGPT's. That is not a defect in the pair, and it is no reason to rebuild.
