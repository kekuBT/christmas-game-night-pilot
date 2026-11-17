# Review 6938403611 item 3: the reproduction, before and after
A synthetic received copy in the pinned Trivia shape (`extra.answers[player][question]` = an integer option index), made by `make-fixture.mjs.txt`. All the values are synthetic test values. The copy is then changed in ONE place: one guest answer's value (same keys, same count).

Commands (fixture made in a scratch folder; `old-w5-seed.mjs` is `git show 63f9dc5:scripts/beta/w5-seed.mjs`):
```
node make-fixture.mjs <priv> <copy-base>; cp -r <copy-base> <copy-changed>; (change one value in <copy-changed>)
node old-w5-seed.mjs check-copy <priv> <copy-base|copy-changed>
node scripts/beta/w5-seed.mjs check-copy <priv> <copy-base|copy-changed>
```

| Checker | Unchanged copy | Changed value |
|---|---|---|
| `63f9dc5` (the reviewed candidate) | `COPY OK`, exit 0 | **`COPY OK`, exit 0: the gap the review reproduced** |
| the repair | `COPY OK`, exit 0 | **`COPY FAILED`, exit 1**, on exactly one line: "the guest's answer to q1 holds the acknowledged value" |

The raw output is in [repro.log](repro.log). No value is printed by either checker.
