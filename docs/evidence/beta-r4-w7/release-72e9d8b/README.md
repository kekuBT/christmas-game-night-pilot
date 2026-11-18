# B-W7-01: `72e9d8b` developer validation evidence (handoffs 6963579755 and 6964628237)

**What this is:** the evidence I generated for the newer release candidate `72e9d8ba59ef3271d756bc2bf77b40ea4d6ee74d`. It is published unchanged, because review 6964628237 asked for it, and nothing was rerun.
- **This is developer evidence, not an audit.** Every gate claim here stays developer-run until ChatGPT reads the raw files.
- **The audited archive will be ChatGPT's own:** it builds the archive in the private Codespace (option (a), as for `7097ac2`), and that archive gets its own `builtAt` and SHA-256.
- **My archive** (`f3bd00ea…`) **is a developer reference only.** Its bytes are not in the repository.
- **W7 and B-W7-01 stay OPEN.**

## Two runs, two Node versions
| What | Where | Node | Result |
|---|---|---|---|
| **The full gate**, run `20261117-231232-72e9d8ba-471` | `gate-run-20261117-231232-72e9d8ba-471/` (`report.json`, `summary.txt`, `gate-console.log`, `logs/`) | **v22.23.4**, chrome-headless-shell 153.0.8010.12 | **PASSED (exit 0)**, 112/112; unit 2,085/2,085; a clean tree at `72e9d8b`; 41m 39s |
| **The R2 package** | `package/pack.log` | **v22.16.0** | archive SHA-256 `f3bd00ea2f2c17e1f84e0b413822f5cd181247774f9872923860c1120f4d72ca`; 144-file inventory `4f58b3239f04f9ea074c15993371effee6fac1295dd8124924ea00fefb19daef` |
| **The archive checks and a production-start smoke test** | `package/verify.log`, `package/smoke-server.log` | v22.16.0 | the entries, the inventory, the runtime packages, `/health` = `72e9d8b`, and 401 without the code |

**Also in `package/`:**
- `cgn-72e9d8b….inventory.sha256`, the 144 files;
- `release.json`, a copy of the archive's;
- `release-72e9d8b-DRAFT.md`, the draft release record.
  - **Its line about not being committed was true when I wrote it** (the first handoff asked for no push). It is published unchanged so its hash still matches the original manifest.

## What was published, and what wasn't
- **Published:** everything above, plus **3 of the run's 66 screenshot folders**: `check-uncertain-delivery` (the driver for this candidate's change), `check-send-failures` and `check-action-ack`.
- **Not published:**
  - the other 63 screenshot folders (about 55 MB). They're listed, with hashes, in `original-bundle-SHA256SUMS`;
  - **the archive bytes**, the gate's `server-data/` and `web-dist/`, `node_modules`, and any credential.
- **The scan:** I checked every published file for cookies, tokens, access codes, keys and email addresses before publishing.
  - **No secret value was found.** The only matches were game text ("secret word"), test names, and the server's refusal messages, which name a setting but contain no value.
  - **Nothing was redacted or edited.**

## The two manifests (don't confuse them)
| Manifest | Covers | Its digest |
|---|---|---|
| **`original-bundle-SHA256SUMS`** | the **whole original private bundle**: 696 files, including the archive and every screenshot | **`4abbb2e2c5c9023eb695e44679577951dcc6a412f0b0f0de016ef8cd7cf97d49`** |
| **`MANIFEST-published.sha256`** | **only the 142 files published here.** It leaves out itself, `README.md` and `original-bundle-SHA256SUMS`. | `b9b0b4ff326c5e4c55651525acd2804891ea5804e59d31173033ea065d450b91` |

**The subset check:** each of the 142 published files has the same SHA-256 as its line in the original manifest, mapped back to the staging layout (`gate-run-…/` ← `evidence/gate-run-…/`; `package/*.log` ← `evidence/`; the rest of `package/` ← the bundle root). 142 matched and 0 didn't. The published subset does **not** have the original digest; only its files are identical.

## Pending (not claimed here)
- **ChatGPT's work:** reading this evidence; the independent build and audit of its own archive (inventory expected `4f58b323…`); the private-browser revision and start check on that archive; and the compatibility proof on a disposable **received** backup copy.
- **After those:** the pins-only forward commit and its revert.
- **Not authorized:** promotion, merge, Render and spend.
