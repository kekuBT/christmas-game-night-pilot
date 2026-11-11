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

## Queued product work (owner-approved, not started)

- **Installable Home Screen web app** (queued 2026-11-10; the owner approved it, relayed by ChatGPT's handoff on PR #4).
  - **When:** in the modernization / mobile-polish milestone, before deployment readiness. It is not a Stage 5.1/5.2 acceptance item.
  - **Icon:** Mchezo's existing top-left circle-and-dots logo. Keep the identity; don't design a replacement.
  - **Scope:**
    - first inspect the existing manifest, icons and standalone support;
    - add what's missing: app name, icons and launch configuration;
    - add short install guidance for Safari on iPhone/iPad and for Android Chrome.
  - **Verify:** standalone navigation, safe areas, joining a room, reconnecting, and theme consistency.
  - **Reporting:** report automated and browser checks separately from real-device installation checks. Never claim real-device verification without doing it.
  - **Out of scope:** installing does not mean offline play. Offline solo support is not part of this item. Deployment, spending and public ports stay as they are.
- **Room retention / expiry** (queued 2026-11-10 by ChatGPT's review of PR #6, comment 6769583991, under the standing authorization D-WF-01).
  - **Why:** the server keeps every room forever. Solo rooms (Stage 6.1, D-S61-03) make that visible: one per device, more when a device's storage is cleared or a create got no answer.
  - **When:** a bounded pre-deployment readiness task, after the immediate everyday-play slice. Not part of Stage 6.1's repairs.
  - **Must not:** delete Cup history or Memory Book memories.
- **From ChatGPT's interactive audit of Stage 6.1/6.2** (comment 6773609572 on PR #8, 2026-11-10). Queued, not started; each is for the milestone named.
  - **Casual results use the legacy shell** (session-flow / modernization):
    - After a casual Math game, both players land in the old "Christmas Game Night" header, with Championship navigation, PRACTICE labels and a duplicate winner/results block. The modern lobby returns afterwards. The briefing also calls casual play "Practice".
    - Direction: the Mchezo shell and consistent "Casual" wording, with no Cup-only navigation in this flow. Standings and each seat's answer privacy stay as they are.
    - Needed before casual/polish sign-off.
  - **Solo shelf on desktop** (polish): one tall column, whose large artwork pushes other games below the fold. Direction: compact phone cards and a wider desktop layout, keeping touch targets and bests. **Done in Stage 8.1** (PR #12, `docs/stage8/stage81.md`, D-S81-05).
  - **Pattern Pulse's ready screen** (polish): it says the overall clock keeps running but doesn't show the time left. Add the remaining time, or a low-time warning, before later patterns. **Done in Stage 8.1** (D-S81-01 … 03).
  - **Dependency advisories** (deployment readiness): triage in `docs/deploy/npm-audit-2026-11-10.md`. Use targeted updates with tests; no automatic fixes.
- **Practice content variety in solo and casual rooms** (queued 2026-11-10 by ChatGPT's architecture decision on PR #7, comment 6771088990, under D-WF-01). **Done in Stage 7.4** (PR #11, `docs/stage7/stage74.md`, D-S74-01 … 07); kept here for its history.
  - **Why:** practice selection takes an already-used item before a fresh official one. That protects official content in a Cup. But a room that never plays official games would repeat one item once most of the library is approved for official play (Stage 6.2 spec §3.4, §5 item 4; pinned by a unit test in `tests/stage62-solo-shelf.test.ts`).
  - **When:** with the smoother-session / content-variety work, before library eligibility changes make it visible. Today's library has 12 practice-only Connections boards, so it doesn't show yet.
  - **Direction:** solo and casual rooms prefer unused practice-usable content, then the least recently used.
  - **Must not:** change Cup selection, eligibility validation or Cup usage. Update the pinned test deliberately.
- **Seasonal content in everyday play** (a concrete check from ChatGPT's review 6786060026 on PR #11, for the seasonal-content separation milestone it calls already approved). Not started.
  - **Seen:** a shipped Word Connections board with Christmas clues dealt in everyday solo play.
  - **The boards:** `con-s4-03` ("On a Christmas tree", "Santa's reindeer") and `con-legacy-1` (Christmas foods, Christmas decorations, reindeer names). Stage 7.4 put `con-legacy-1` into solo and casual rotation (it is approved; D-S74-01).
  - **Direction, when that milestone starts:** keep seasonal content out of everyday solo and casual play unless a seasonal mode is chosen. Content isn't changed before then.

## Roadmap after Stage 8.1 (owner direction, relayed by ChatGPT's handoff 6790743334 on PR #11, 2026-11-11)

Each item waits for its own brief. In order:
1. **Everyday and Christmas themes, complete,** with seasonal-content separation (the item above).
2. **Home Screen installation** using the existing circle-and-dots logo (the first queued item above).
3. **New games:** Jebena Rush first, then Spectrum.

- **Jebena Rush: the owner's settled direction** (recorded so it isn't lost; **not to be implemented in Stage 8.1**).
  - **Name and tagline:** Jebena Rush, "Name it. Pass it. Beat the steam."
  - **Play:** a category game. Players name answers in a category and pass the jebena on.
  - **Look:** an original animated jebena whose steam and wobble increase, and which is passed between players.
  - **Lives:** five by default, configurable to 3, 5 or 7.
  - **Answers:** a large curated answer bank with aliases, and careful normalization of obvious typos to the canonical answer.
- **Spectrum** follows Jebena Rush; no direction recorded yet.

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
