# Product Specification — Christmas Game Night / The Family Cup
Status: implementation baseline, owner-locked objectives + provisional detail | v1.0

## Vision and success criteria
The same 4–10 family members should want to return for seven Christmas-season sessions because this is a coherent, funny, competitive, social holiday ritual. It must be fun with 4 players, reliable with 10, accessible to a nontechnical guest, and believable as a family keepsake afterward. A game is not 'complete' because a demo button increments a counter: real players must interact under fair rules and see correct outcomes.

### Locked baseline
- Private room access, no mandatory accounts, browser-based, mobile-first (iPhone Safari, Android Chrome), desktop and optionally TV browser.
- QR and short room-code entry; guest name/avatar; one or more host/cohost; reconnect to same slot without forfeiting results.
- 11 fully playable launch games; modular and individually testable; interactive concise instructions; warm-up/practice; optional casual games outside championship.
- Seven-day championship, one official playlist/day, best five daily results, at least three valid days, ~75% solo/25% team, rotating teams, optional Finale + up to 50 points, achievements.
- Christmas Hub public shared display; immersive player screens; Memory Book created from actual recorded events and approved content.
- $0 service budget until approved, deterministic offline content baseline, no AI dependency.
- Brand: evergreen #102C25, pine #245344, cranberry #A73545, gold #E5BC70, snow #F7F2E8; refined, cozy, celebratory.

### Non-goals
- Public matchmaking, social networking, payments, stores, ads, mandatory sign-in, esports anti-cheat, camera/voice recognition, generative AI deciding winners, endless live content generation, public content sharing by default, 100-person rooms, proprietary game clone.
- The five later ideas (Undercover, One-Night Mystery, Two Truths One Lie, Family Feud style, Risk It) remain extension slots, NOT required launch games.

## Experience map
1. Landing → Join Room / Create Room / How It Works. No network setup exposed to guests.
2. Host creates private room with easily copied room code and QR; default recommended player mode is phones-only; TV may join as an additional read-only display.
3. Player chooses family-friendly nickname + color/avatar, accepts room privacy summary, and sees lobby roster, connection indicator and ready state. Room has an accessible join help screen.
4. Host chooses free-play game or starts official daily playlist. Everyone gets role-specific tutorial / instruction before first game; host sees control surface for start/pause/skip/reveal when legal.
5. During rounds, player phone shows only permitted answers, prompts, role and input; shared display shows public game progress, playful transitions and safe summaries.
6. Results reveal individual/game results and audited points; users can see why points were given. Return to lobby, next game, or Hub.
7. Day closure presents a short ceremony: day winner, close finishes, friendly achievements, summary chapter, standings updates and Memory Book highlights.
8. Across seven days, profiles, scores, approved moments and room roster persist. Finale optional. Owner can export/backup the record locally.

## Modes and players
- 4–10 is the optimized family range. Some social games need a minimum group size (e.g. Impostor >=4); games not eligible at current count are labeled and cannot start until requirements met. Do not silently fill with imaginary online players.
- Phones-only: each sees private state, with a public overview available on a designated host phone/desktop. TV+phones: TV is a **distinct unauthenticated public-role client bound to room**; TV cannot see secret answer keys, individual private prompts, recovery tokens or admin operations.
- Guest recovery: if a browser reloads, prompts the user to resume existing player slot using locally held credential; loss of credential requires host-approved recovery. A display name alone is never a security credential.
- Host + cohosts: host can appoint/revoke cohosts; cohosts may manage operational rounds subject to explicit permission matrix. Host ownership transfer is explicit/audited. Host failure cannot corrupt game state.
- Trust boundary: private family does not mean safe from accidental edits, pasted scripts or anyone guessing a room code.

## Screen inventory and expectations
Landing; room create/join; code+QR; nickname/avatar; lobby; host console; playlist editor; concise rules/help; play screen per game; role-specific privacy screen; score reveal; day ceremony; leaderboard with audit drilldown; achievements; TV Hub; Memory Book daily chapters/photo approvals; settings (sound, reduced motion, large type, privacy); errors/reconnect; export/restore.

## Content strategy
Launch must work without network AI: all trivia/events/geography/word boards/charade words/year/numeric answers must come from reviewed versioned packs with provenance where relevant. Keep content difficulty diverse (not only American pop culture); family-friendly, multicultural and discoverable. Do not use factual 'year' or 'closest number' answers without independently verifiable source. For subjective games, host moderation/adjudication must be explicit and recorded. Localized Ethiopian/Oromo trivia can be a later curated pack with accurate sourcing, not a fabricated launch requirement. Do not use copyrighted music, licensed photos or branded IP assets without permission.

## Accessibility and inclusive fun
- No knowledge-heavy game dominates the playlist; mixing reaction, creativity, memory, logic and social play broadens fairness.
- Portrait smartphone viewport at 320 CSS px; device safe-area insets; readable focus, 44px targets, large numerals, clear timer and progress. Minimum WCAG AA contrast where achievable; no information by color alone.
- Every animation and SFX optional. Provide mute by default or respectful browser-autoplay handling; no flashing/strobe, reduced-motion parity and visible pause state.
- Keyboard and screen reader behavior for all controls; live announcements don't spam; any timed reading can be paused or extended by host for accessibility (with audit when official).
- No gameplay mode should require camera/microphone permissions, GPS, geolocation or paid external service.

## Privacy and retention
Only name/avatar, local recovery capability, game actions, scoring events and explicitly approved highlights are necessary. Guest names are visible to others in the private room; show this before joining. Photos/quotes are opt-in per item and removable; strip EXIF/precise location metadata; use strict size/type limits. No public indexing/shares by default. Self-service reset/export, room archive and TTL/retention configurable. For local demos use synthetic data only.

## Acceptance journey
A full manual test with 4 and 10 local simulated or actual clients must demonstrate: create room; QR join; set name; role-safe Impostor; one deterministic game; simulated disconnect + recovery; complete a mixed playlist; day-close with valid scores; join TV public view; add then revoke Memory Book approval; export an event-grounded keepsake; recover room after server restart. No critical failure or secret leakage is acceptable.

## Open decisions requiring sign-off before real family use
Exact six Geography submodes, championship normalization, 'valid day' rule and participation penalties, finale scoring, family photos storage/consent and live AI data policy. Implement reversible documented defaults locally so work does not stop. See DECISIONS.md.



---
