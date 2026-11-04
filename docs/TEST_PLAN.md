# Test Plan and Acceptance Matrix
Automate wherever possible, with deterministic fixtures. Never describe a simulator as a production browser test.

## Tooling
- Vitest: pure game logic, championship, projections, schema, content validators, reproducible seeded RNG and fixed clock.
- Integration harness: real local socket server or Cloudflare local DO emulator, SQLite data persistence, auth-capability checks, fault injection, restart/resume.
- Playwright Chromium, Firefox, WebKit: player/host/TV E2E, keyboard, responsive viewport, multi-client flows, screenshots/a11y where supported.
- Real manual devices: iPhone Safari, Android Chrome and TV browser as available. Mark NOT RUN when not available.
- npm scripts: typecheck, lint, test, build, test:integration, test:e2e, test:load, content:validate, test:security. All should exit nonzero on failure.

## Global test cases
**Room:** create, invalid code, expired code, attempts limited, join 4/10, duplicate nickname, 2 tabs same token, host appointed/revoked cohost, leave/kick/rejoin, room reset/archival. TV read only even when attacker sends action. QR join does not leak admin authority.

**Protocol:** 500 malformed intents; wrong phase; wrong actor; stale sequence; duplicate ID; replay after reconnect; out-of-order actions; concurrent last-millisecond submissions; payload > allowed; lost ACK followed by retry; unexpected closure; unknown schema version; input XSS and HTML escaped.

**Privacy:** canary words `SECRET_ROLE_CANARY_123`, `ANSWER_KEY_CANARY_456`, `HOST_TOKEN_CANARY_789` inserted into private test state; assert absent from all public, adversarial player, TV, error and log payloads. Assert individual actor receives only own permitted fields.

**Timers:** remaining time derived from injected server clock; exact deadline boundary; pause/resume; hibernation/wake; forced process restart; long idle 7-day gap; UTC midnight vs configured session slot; duplicated timeout alarm; stopwatch drift.

**Scoring:** normalize 2,3,4,10 competitors, tied midranks, 0/1 valid days, exactly 3, exactly 5, exactly 7, best-five drop, team odd count, absent category, 75/25 day weighted contribution, finale bonus 0..50, host override, override reversal via compensation, score recompute after restore.

**Memory Book:** sources must be event IDs that exist, daily chapters match historical result, winners match recomputed ledger, approved photo/quote only, opt-out applies to export, EXIF removed, malicious filename rejected, unsupported file type blocked, PDF generated locally and opens without text clipping, missing photos show graceful fallback.

**Accessibility and responsive:** 320/375/390/428 px portrait, 768px tablet, 1440px desktop and 1920px TV. Touch targets >=44px; focus stays visible on modal; keyboard-only game selection and voting; screen reader names; reduced motion; colorblind-safe status; no essential audio; safe-area insets; screen orientation change; browser reload.

**Performance:** 10 players + TV + host, at least 1k message burst with stable ordering and no duplicated result; high-latency 500ms and 5% packet-loss simulation where framework allows; controlled backend errors; memory growth; backend wake and restore. Collect event counts, SQL rows and Worker/DO resource costs in log/test report.

## Per-game adversarial tests
G01 Impostor: impostor cannot fetch honest word; fair assignment; tied vote; self vote; guess; TV disclosure.
G02 Caption: anonymous until reveal; own vote rejected; sanitized malicious text; tie; no auto-consent to Memory Book.
G03 Trivia: answer not before lock; option-ID shuffle, timeout and speed grace.
G04 Connections: fixed four exact categories, wrong attempt, solved tiles can't repeat, ambiguous board QA.
G05 Who Said That: consented attribution; speaker excluded from own question as decided; fallback pack; opt-out.
G06 Guess Year: integer range, future vs past, exact/error score.
G07 Closest: decimals, opposite-side ties, sources, bad units.
G08 Sprint: duplicate across players not ping race, adjudication, aliases, text sanitization.
G09 Charades: secret actor prompt, host verification, odd teams, pause/pass/time.
G10 Geography: all six modes, licensed geometry, antimeridian, map accessibility fallback, capitals with multiple answers.
G11 Math: 10 questions, 4 unique choices, correct server computation, no div0, <=20 speed bonus.

## Definition of done
- Required behavior present AND test proves it.
- Accessible UI and clear tutorial present, not a raw developer form.
- No private projection leak or score forgery opportunity.
- Edge cases covered and known limitations accurately recorded.
- Local build and relevant tests pass from clean install.
- Screenshots/recordings from tests named and preserved.
- Any official scoring uncertainty documented and configurable, not concealed.

## Test reporting
For each run record date, git commit ID, runtime versions, command, number of tests passed/failed/skipped, fixture state, environment (mock/local DO/WebKit/real iPhone), and 1–3 key artifacts. If a command isn't run, say NOT RUN. Never say 'all tests pass' while omitting failing steps.



---
