# AI Policy, Data Privacy, Consent and Content Handling

## Runtime policy
The application must be fully enjoyable and fully playable with AI disabled. AI may propose GENERIC fact-based questions or write optional narrative prose from owner-approved nonprivate facts; it never assigns roles, chooses answers, determines win/loss, calculates points, changes deadlines, moderates family quotes without human review, or alters the audit log. Treat model output as untrusted text with schema validation and human review.

## No family data to free AI without informed consent
Google's Gemini free-tier pricing states submitted content may be used to improve its products. Therefore by default send **no real names, photos, family quotes, game chat, room codes, private history, recovery tokens or raw Memory Book content** to any third-party AI. Generic trivia themes and fictional sample text may be sent only after provider terms and current rate limits are checked, and the owner enables the feature. The family's real Memory Book can be generated deterministically from recorded approved events with templates; AI narrative is optional, off by default.

## Content production
Use structured pack schema: source, license, question ID, difficulty, factual answer and explanation, reviewStatus, generatedBy, reviewer, updatedAt, packVersion. User can reject/edit/regenerate draft; AI output cannot go live in a round without explicit host approval and factual validation. Maintain a rich curated offline pack for all deterministic games.

## Photos/quotes
Photo entry requires uploader opt-in and separate approval to display/share/export. Strip EXIF; limit file type, size and quantity; enforce delete/revoke in cached outputs and exports when regenerated. Use anonymized captions where possible. Consent for quotes belongs to person quoted and host editorial approval, especially for Who Said That. Public share image export is an explicit user action, not auto-posted.

## Secrets
Store API keys only in secure server-side runtime environment if AI integration ever authorized. Never in Vite public env, browser JS, GitHub files or logs. Paid upgrade or third-party integration must never be enabled automatically. Muse development-agent complementary access is not the product runtime API.

## Fallbacks
If AI fails/returns 429, invalid facts, offensive text, provider outages, or review declined: preserve room state and switch to vetted local pack or local deterministic chapter template; show unobtrusive notice to host, not disruption to family play.



---
