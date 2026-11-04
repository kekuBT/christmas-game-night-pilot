# Midnight Christmas Design System and UX Behavior

## Identity
The Christmas family living room, translated into a deliberate premium digital experience: midnight pine, warm gold, candle-like light, soft snow, restrained cranberry, gentle motion and excellent typography. Avoid a kindergarten clipart festival, giant generic gradients, random emoji backgrounds and low-contrast glass morphism. Never sacrifice usability for ornament.

**Tokens:** background `#102C25`, surface `#245344`, accent `#A73545`, celebration `#E5BC70`, text `#F7F2E8`. Provide accessible text/surface variants, shadows and ring contrast; validate contrast rather than assuming this palette meets WCAG everywhere. 8px spacing grid; 12/16/24px radii as needed; maintain consistent heading scale; limit to two type families, open-license system fonts are acceptable.

## Layout principles
- **Phone:** one dominant task per view, bottom-friendly interactions, sticky input/submit when appropriate, visible timer and player context, clear host vs player roles, safe areas, portrait first. Avoid horizontal scroll and keyboard-covered submit.
- **Desktop host:** overview of participant readiness, playlist, content moderation, timers, appeals and next step; no sensitive player secret displayed accidentally.
- **TV:** high-contrast 10-foot readable presentation, QR with room code, live standings, recent moments, next game, approved highlights; auto-rotate ~20–30s while idle, pause dashboard rotation during game, return automatically. TV shows *only public projection*; no private clue roles or input.

## Visual journeys
1. Landing hero: 'Christmas Game Night' with one inviting sentence, Join / Host, discreet How it Works.
2. Join: 6-character code or QR, clear room privacy note, name/avatar, instant roster.
3. Lobby: centered game context, readable participant chips, host-only controls, 'Ready' indicators.
4. How To Play: maximum 3 steps and concrete example, 15-second digest, expand for full edge cases; cannot trap user in tutorial.
5. Game: one question/input at a time, optional time bar, subtle success/failure feedback, announce round number.
6. Reveal: suspenseful but skippable, legible score table and 'why did I get points?' breakdown, one tap next game.
7. Night ceremony: recognizable winning moments, award, visual but muted-friendly delight, Memory Book opt-in.

## Motion and sound
Use 180–350ms default transitions, delayed 800ms max celebratory reveal that can be skipped. `prefers-reduced-motion` disables nonessential animation. Sound is off until user gesture/explicit opt-in where autoplay is restricted; always expose volume/mute and silent play parity. Any music must be original/commercially licensed, public-domain as verified, or omitted; do not embed commercial Christmas tracks. No auto-play surprises on TV.

## Accessibility
Progress, correct/incorrect and team identity expressed in words/patterns, not only color. Score announcements in aria-live region with throttling. Keyboard tab sequence and screen-reader labels audited. All tap targets 44px; contrast check; large text option; timer accessibility accommodations announced before official game. Focus restored after popovers and modals.

## Content and microcopy
Family-friendly, warm, slightly witty, never patronizing. Invite rather than punish: 'Connection lost. Your spot is saved. Reconnecting…' rather than raw exceptions; 'Your answer arrived after this round closed' rather than silently ignoring it. Avoid personal insults in achievements or placeholder family-specific jokes. Clear finality around locked submissions and official score adjustments.

## Design QA
Capture 320px iPhone, 390px iPhone, 768 tablet, 1440 desktop, 1920 TV screenshots for each primary flow. Test with 4 and 10 roster chips. Run contrast, focus, overflow and keyboard-cover checks. Every one of 11 games must share branding yet have unmistakable game-specific interaction.



---
