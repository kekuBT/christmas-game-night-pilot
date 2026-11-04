# Autonomous Development Roadmap and Exit Gates
All milestones **locally authorized**, not remote publication/deployment. Order optimizes technical risk and player-perceived value. Do not claim 'done' unless exit criteria pass; maintain exact evidence in PROGRESS.md. Dependencies can overlap through isolated tasks.

| Stage | Target outcomes | Exit criteria | Recommended first demo |
|---|---|---|---|
| M0 — Local foundation | Repository/workspaces, baseline test/build, theme, basic UX frame, risk/decision log, content schema | Clean install/typecheck/lint/test/build; 320px/TV layouts; no hidden external dependency | Landing, lobby and TV shell locally |
| M1 — Multiplayer spine | Room create/join, QR, host/cohost, secure identities, WebSocket server, DO SQLite integration local, reconnect, public/private projections | Ten simultaneous clients; live room state; double-submit dedupe; timer after restart; secret projection test; join code brute-force mitigation | 4-player lobby and one private-message demo |
| M2 — Engine + flagship trio | Game contract, Impostor, Caption Clash, Closest Wins, practice/help/finish/rematch | Real interactive 4/10 player match per game; scoring server-side; cheating/late input/tie tests; visually polished results | Family plays three games on phones |
| M3 — Championship + other eight | Replayable normalized ledger, team/solo playlist, days, roster rotations; Trivia, Connections, Who Said That, Year, Sprint, Charades, Geography 6 modes, Math | All 11 feature-complete, no placeholder; 7-day worked examples, at least 3 day eligibility, best five and 75/25; restore/override audit | Full daily playlist with seeded 10 people |
| M4 — Christmas experience | Hub, achievements, day ceremony, Memory Book and exports, full brand/polish, sound/accessibility | TV never sees secrets; book contains only approved factual events/photos; download matches source; participant can revoke approval; screen reader controls | End-to-end day-to-keepsake ceremony |
| M5 — Hardening/handoff | Threat/performance/accessibility audit, Safari real device (if available), backups, quotas, content provenance, docs and owner demo | 0 open P0/P1, repeatable clean build, test matrix signed with unverified items explicit, no paid/production changes | 7-day family rehearsal with synthetic users |

## Stop-the-line defects
P0: private word/role/answer exposed; host spoof; duplicated or lost official scoring; repeated server crash/data loss; write access to real external services without authorization; harmful secret leak. P1: iPhone unusable, cannot rejoin, game permanently stuck, scores incorrect, 11 games not actually playable, Memory Book fabricates real people/events. P2: minor styling, occasional confetti defect, nonessential animation.

Do not block all engineering on P2 polish. Resolve P0/P1 in currently touched vertical slice before scaling. If any P0 discovered, do not present app as ready to publish.

## Local proof strategy
Progression: schema/unit tests -> in-process deterministic simulator -> 4-tab real socket test -> 10-tab load/integration -> WebKit/Chromium/Firefox E2E -> manual real iPhone Safari/Android/TV (if actually accessible). Track each result as PASS/FAIL/BLOCKED/NOT RUN. Playwright WebKit is **not** a real iPhone Safari hardware test.

## Vertical slicing each game
1. Read exact GAME_RULES section and clarify ambiguities by reversible documented defaults.
2. Implement versioned content pack and validator.
3. Implement pure rules state/reducer, time/ties/disconnect semantics.
4. Add per-player and TV projection assertions.
5. Add server protocol integration and official/casual score commit.
6. Add tutorial/practice and accessible mobile UX.
7. Simulate 4 and 10 players with cheating/duplicate actions.
8. Render final score explanation and report evidence.

## Progress reporting template
```
Milestone: M1 (day/session)
Implemented: [exact screen, file, endpoint, behavior]
Evidence: [commands + exact pass/fail counts, screenshots filenames, test log path]
Open defects: [severity, reproducer, owner]
Decisions: [ID, provisional or signed-off]
Blocked external: [one GitHub approval; exact operation; local fallback]
Next three atomic tasks: [specific files, tests, expected outputs]
```

## GitHub checkpoint packet format
Submit no more than one draft PR per coherent milestone or major vertical slice where practicable. Include PR body: problem/goal; changes; acceptance checklist; actual unit/integration/E2E commands + output; screenshots; known limitations/untested manual devices; security notes; open owner decisions; file-change summary. Ask for a single required approval using official connector. Don't submit placeholder PRs. If remote publishing blocked, continue local git commits and `docs/PROGRESS.md`.

## Owner handoff checklist
- Local runnable demo with `README.md` steps on a clean machine.
- Screenshots/video evidence of mobile+TV; no fake pass claims.
- Rulebook explaining games, official scoring, attendance, finale, host moderation.
- Configuration guide for room, playlists, content packs and backups.
- Security and privacy notes including what data is stored and deletion process.
- Written honest $0 model, vendor checks, and remaining deployment prerequisites.
- List of every owner decision needed before real use, each with recommended default and tradeoff.



---
