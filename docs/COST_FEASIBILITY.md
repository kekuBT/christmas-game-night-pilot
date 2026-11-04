# $0 Feasibility, Cloud Limits, AI and Exit Conditions
Verified research links as of November 3, 2026; reconfirm live before provider provisioning. Source values are planning inputs, not warranty or account-specific entitlement.

## Cloudflare candidate
Source [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/): SQLite-backed Durable Objects are available on Workers Free. The docs list **100,000 DO requests/day, 13,000 GB-s/day compute duration, 5,000,000 SQLite rows read/day, 100,000 written/day and 5 GB account storage** on Free. No KV-backed new objects on Free. A `20:1` billing/request-count ratio applies to incoming WebSocket messages for compute request metering, but NOT to message/metrics counts; do not naively assume every HTTP and DO request quota is interchangeable.

Source [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): Workers Free lists 100,000 requests/day, 10 ms CPU per request and 128 MB memory. Worker routing/validation must be efficient; more expensive logic belongs in the DO within its separate CPU budget. Measure worst-case actual use.

Source [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Sept 1, 2026 enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/): D1 has a free plan and applies hard row read/write limits. Since September 2026, queries fail when daily row limits are exhausted, until reset; storage itself is not deleted. DO's budget and D1's budget must be modeled separately.

## Preliminary family usage model — MUST MEASURE
Assumption: one room, 10 players + TV, 2 hours/day for seven days, 4 games/day, per game average 20 player action messages x 10 players, 10 room join/reconnect events and 10 alarms per day. Gives about `4 * 20 * 10 = 800` incoming game action messages/day, plus joins and setup/admin actions. Even with a generous x10 headroom for extra interactions, far below 100k/day DO requests as a *rough order of magnitude*. This is NOT a forecast for connection cost, active duration, SQL row operations, archive reads, AI or asset fetches; profile the actual app with `N=10`, timer cadence, real message volume, connection lifetime and free-tier behavior. Prefer event-driven updates over 1-second per-client heartbeats; a simple mistake could multiply writes by thousands. Include storage growth after 7 days and retry/backfill behavior.

## Costs and approvals
- No credit card registration, provider account upgrade, paid tier, domain purchase, API charges, paid assets/fonts, email/SMS provider, managed DB service or paid telemetry without explicit Keku approval.
- Local development with open-source npm packages is permitted (review licenses and security; do not install suspicious packages).
- Do not enable automatic deployments/production CI that could spend money or publish work. Official GitHub remote writes may need runtime approval even with owner standing authorization; respect connector gating.
- If limits fail, preserve functional local build and propose a narrower free alternative (e.g. static content + alternate free realtime, simplified photo storage) with exact tradeoffs. Do not change backend vendors silently.

## AI privacy
Official [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) states free-tier submitted content may be used to improve Google's products. Never send private family quotes, photos, names or Memory Book content to Gemini free tier without explicit owner+participant-informed consent; preferably do not send personal content at all. AI can draft **generic** question packs from nonpersonal topics only, subject to host review and factual verification. Runtime AI unavailable must never disable games. Internal Muse developer access isn't automatically an app runtime entitlement.

## Proof gates before any future public deployment
[ ] Account confirms free services and quota model
[ ] End-to-end 4–10 player room tested against actual backend or parity environment
[ ] WebSocket hibernation/state restore and server-side timers proved
[ ] Safari real-device tests completed
[ ] Quota fail-closed behavior and recovery demonstrated
[ ] Source/image/license policy satisfied
[ ] Secret and personal data excluded from logs/analytics
[ ] Backup/restore and deletion demonstrated
[ ] Owner explicitly approves publication/deployment

No deployment is authorized by this document.



---
