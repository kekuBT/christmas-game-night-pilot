# Decision Log — Ownership and Current Status
Record future ADR entries append-only: ID, date, status (LOCKED / PROVISIONAL / OPEN-OWNER / ARCHITECT-SETTLED / REJECTED), owner, alternatives, decision, rationale, evidence, consequences, implementation flag, rollback strategy.

| ID | Topic | Status | Owner | Current working choice | Alternatives / gate |
|---|---|---|---|---|---|
| D-001 | Private family scope, 4–10, browser only, phone/TV | LOCKED | Keku | Guest code/QR, no mandatory accounts | No public accounts/monetization |
| D-002 | 11 named launch games + five later ideas excluded | LOCKED | Keku | All 11 locally implemented | No substitutions without owner decision |
| D-003 | Seven-day championship, best five, min three | LOCKED | Keku | Seven host-defined slots | Exact fairness formula provisional |
| D-004 | 75% solo / 25% team | LOCKED target | Keku | Daily normalized components | Exact placement of weight OPEN-OWNER |
| D-005 | Championship normalized ranking | OPEN-OWNER | Keku | Per-game midrank, daily 75/25, best up to five * mean *5 | Raw sum, placement points, minimum 5 days; sign-off before official use |
| D-006 | Valid player-day and partial attendance | OPEN-OWNER | Keku | >=1 official game; transparent low-participation warning | Min 2 or majority; sign-off |
| D-007 | Grand Finale | OPEN-OWNER | Keku | Disabled by default, max +50; sample ladder | Flat or relative bonus; can it overturn winner |
| D-008 | Geography six modes | OPEN-OWNER | Keku | Flag, outline, capital, map pin, higher-lower, distance | Scope/license and accessibility review |
| D-009 | Room host failover | PROVISIONAL | Muse+ChatGPT | Explicit cohosts may run eligible operations; ownership not auto transferred | Automatic promotion (higher risk), host-only pause |
| D-010 | Multiplayer backend | ARCHITECT-SETTLED candidate, not deployment approved | Muse+ChatGPT | SQLite-backed DO/WebSockets, Worker router, optional D1 archive | Alternative realtime free hosting if load/limits fail |
| D-011 | AI | LOCKED optional; integration OPEN | Keku | Offline packs; AI off for private data; late-stage generic review only | Paid/private AI on explicit consent+permission |
| D-012 | Photo storage/consent | OPEN-OWNER | Keku | Opt-in approved entries, EXIF stripped; local export first | Remote storage requires approved provider and retention policy |
| D-013 | Autonomous implementation | LOCKED | Keku | All 11 games and milestones locally authorized | No merge, deploy, spend, GitHub gate bypass |
| D-014 | GitHub collaboration | LOCKED operational constraint | Muse+ChatGPT | Local-first, batch official connector writes, draft PR review; respect fresh approvals | Direct shell auth workaround prohibited |
| D-015 | Content moderation/quote consent | PROVISIONAL privacy default | Keku+architects | Participant consents to attributed family quote, host approval; demo original content fallback | No invented real-person quotes |
| D-016 | Championship ties | PROVISIONAL | Muse+ChatGPT | Midrank tie, counted daily wins, counted median, finale, joint rank | Owner sign-off before official use |
| D-017 | SFX and music | LOCKED optional | Keku | Mute/opt-in; original/open licensed sounds | No copyrighted commercial track embedding |
| D-018 | Realtime free infrastructure quota | VERIFIED docs, unverified account/deployment | Muse | DO free SQLite available with hard limits; profile and recheck | Paid not permitted without approval |

## Escalation rubric
**Do not ask owner for:** filename choices, code organization, test fixtures, package versions within existing free stack, visual spacing, typical accessible defaults, provisional timers/question counts that can be configured, test-first implementation order, local bug repairs.

**Ask owner before:** changing the 11-game list, adding a required account, sending personal data externally, making payment, merging, any internet-accessible deployment, permanently deleting records, adopting a provider with paid risk, changing core championship fairness after explicit sign-off, exposing family photos or personal quotes, using non-free copyrighted assets.

**Owner decision packet format:** 1 paragraph issue, ranked alternatives with objective tradeoff, recommended reversible default and test, blocking/nonblocking status, what Muse is continuing meanwhile. Batch choices instead of one approval request per detail.

## Evidence and reconciliation
Cloudflare free limits from official docs checked November 3, 2026; no deployment account verified. Prior kickoff Issue #2 is useful background but Muse must not need to read it for local implementation. If a companion doc is missing, reconstruct it from START_HERE_MUSE.md and record the difference, rather than halting work.



---
