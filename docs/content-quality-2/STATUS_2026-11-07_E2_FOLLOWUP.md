# Status: E2 checkpoint follow-up (owner review, 2026-11-07)

**Branch:** `claude/cq2-e10-meta-sprint-sources`. It starts from `999a3f1`, the verified `a95e211` checkpoint plus its docs-only verdict commit; that checkpoint and its documents are untouched.

**Hard limits observed:**
- Nothing merged or deployed.
- No approvals or `sourceCheck` recorded.
- No scoring change.
- E10 selection not activated.
- No spending.

**One environment change, approved by you on a card:** this repository now has a personal cloud environment, `christmas-game-night-pilot`. It allows the source hosts (census.gov, europa.eu, un.org, unstats.un.org, iupac.org, nasa.gov, fifa.com, nfl.com, whitehouse.gov and a few others). Nothing else changed.

## What changed

| # | Your instruction | Result |
|---|---|---|
| 1 | E10: metadata, mix warnings, tests; selector unchanged; versioning proposal; test on the real library | **Metadata:** all 235 quiz items tagged with a `mechanic`. **Warnings:** `content:check` gains `format-untagged` and `content-mix`. **Selector:** proven unchanged by a test. **Versioning:** the proposal is in [E10_ROUND_VARIETY.md](E10_ROUND_VARIETY.md) (last section). **Real-library simulation:** 0% problem rounds with or without the step, so activating it now would change nothing. |
| 2 | Source checks for the seven Sprint lists | **Six lists match their sources.** This is a machine comparison; no person has signed it. **The Chinese zodiac is blocked:** Britannica serves a bot challenge. **Report:** [SPRINT_SOURCE_CHECK.md](SPRINT_SOURCE_CHECK.md), with snapshots in [sprint-sources/](sprint-sources/). |
| 3 | Redesign `con-s4-02` | **Herbs replaced by Gemstones.** Lime (fruit or green), and Emerald and Jade (gem or green), stay as deliberate misdirection, pinned by counting. **Checks:** the solver finds one solution, and the semantic review covers every tile. **History:** games that stored the old board keep it. **Still provisional.** |
| 4 | Small new closed-set batch | **Three practice-only drafts**, built from the fetched source lists: UN member states in Asia (47), 2026 World Cup teams (48) and NFL teams (32). **Investigated but not built:** Pokémon Gen 1, US presidents and the Paris 2024 sports. |

## Source-check findings

- **US states, EU members, elements and planets:** every name matches its source.
  - IUPAC prints element names in lower case and uses aluminium, caesium and sulfur. The US and UK spellings are aliases.
  - The planets source changed: the old IAU page now returns 404, so NASA's page, which states the IAU's five dwarf planets, is used.
- **UN Africa:** the comparison now uses the African States regional group, as you asked. All 54 match.
  - The UN's name is "United Republic of Tanzania"; our "Tanzania" matches it by alias.
  - **Congo:** the UN lists "Congo" (Brazzaville) and "Democratic Republic of the Congo". A bare "Congo" scores the Republic, which is the UN's own short name for it. Every DRC form (DRC, DR Congo, Congo-Kinshasa) scores the DRC. A test pins this. **Your call:** whether a bare "Congo" should instead be refused as ambiguous.
  - The UN's own pages disagree on spelling: "Côte d'Ivoire" vs "Côte D'Ivoire", and "Guinea-Bissau" vs "Guinea Bissau".
- **South America:** all 12 match. M49 writes "Bolivia (Plurinational State of)" and "Venezuela (Bolivarian Republic of)"; a documented crosswalk maps them to the short names. French Guiana, the Falklands, Bouvet Island and South Georgia are excluded as not sovereign.
- **Chinese zodiac:** not verified. A person compares it by hand, or you name another source.
- **US presidents:** the White House list's entry for the 46th president (2021–2025) reads "AUTOPEN" instead of a name. It cannot serve as a neutral source, and I did not fill the gap from memory.
- **Pokémon:** pokemon.com blocks automated access. Separately, the two Nidorans normalise to the same answer, so this category needs a matcher change before it can exist.

## Product limits you should know about

1. **Even if every draft is approved, rooms of 9–10 players still get only one official Sprint game per Cup.**
   - Rooms of 4–8 players would get two.
   - Rooms of 9–10 players need sets of at least 36–40 recallable members. Only US states, Africa, elements, Asia and the World Cup qualify; NFL (32) and EU (27) are too small.
   - A test pins this capacity.
   - The candidates that pass the closed-set rules lean toward geography and sport. Gaming and culture sets either can't be verified (Pokémon, the zodiac) or fail the matcher (Nidoran; "49ers", which reads as "ers").
2. **Results show canonical answers in normalised form,** for example "cote d ivoire" and "san francisco ers". This is cosmetic but visible; showing the display name would be a small UI change.

## Approvals and decisions still needed

1. **A person source-checks each list** using the report, and records `sourceCheck`. The zodiac also needs a hand comparison or another source.
2. **Congo ruling:** accept a bare "Congo" as the Republic (current), or refuse it as ambiguous.
3. **`con-s4-02` redesign:** editorial review, including the Garnet call (not a green).
4. **Draft batch 1:** promote, revise or drop each of Asia, World Cup and NFL.
5. **E10:** approve the versioning design. Activate only once the approved library has enough twist formats for it to matter.
6. **Decisions D-CQ2-22..26** in `docs/DECISIONS.md`.

## Tests

- **New:** `tests/sprint-sources.test.ts` (18) and `tests/quiz-format.test.ts` (8).
- **Updated:** `tests/batch-a-compat.test.ts` gains 2 (the redesigned board, and the old board restored).
- **Unit tests:** 788 passed (68 files).
- **Checks:** typecheck, lint, `content:check`, `content:audit` (0 multi-solution boards) and `content:pilot` all OK.

The full-gate verdict for the exact commit is recorded in `docs/PROGRESS.md`.
