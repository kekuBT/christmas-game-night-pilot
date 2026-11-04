# Game Rules and Acceptance Tests — 11 Launch Games
Status: Owner-locked names/intent; all **specific numerical mechanics below are PROVISIONAL engineering defaults** for local development unless explicitly approved later. Expose host-adjustable timers/difficulty where fair. Use `GAME_RULES` + `CHAMPIONSHIP_RULES` jointly.

## Common game contract
Every module declares a stable ID, semantic version, title, category, min/max players, supported solo/team, contentPackVersion, default duration, accessible tutorial and example, phases, allowed commands per phase/role, pure reducer, derived scores, win/tie rules, sanitized content, public/actor/TV projections, timers stored as absolute server deadlines, deterministic seed, and a test list. Input is untrusted. The server alone determines authoritative outcome. Games yield **raw scores**; the championship scoring module transforms official results into normalized per-game scores. Casual play shows raw results but never posts to official ledger.

### Shared state sequence
Lobby/config -> intro/tutorial -> ready -> round prepare -> timed/private input -> reveal/judge -> raw score event -> next round or final result -> audited official result commit -> return Hub. Invalid/lost clients do not advance phase. Late actions rejected with a friendly message. Duplicate clientEventId acknowledged without scoring twice. Host can pause timers when explicitly allowed (pause is audited in official mode); no hidden-role information leaks in spectator, TV or logs. Every round must have a skip/fallback route for empty content or absent player. For timed submissions, assess on server-receipt timestamp with a generous grace window (e.g. 500–1000ms) configurable for household network jitter, not client clock.

### Content quality
Store versioned, structured packs with question ID, correct answer or judging rule, hints/explanation, difficulty, source/license where factual or image-backed. At least 30 curated items for quiz-style games at prototype exit unless game naturally uses finite boards; enough for a family evening without embarrassing repeats. Separate game logic from packs. Reject contradictory questions (duplicate correct options, impossible dates, incomplete answer sets), offensive entries and missing source provenance. Never pretend an AI-drafted answer was verified.

## G01 Impostor — secret-word social deduction
**Recommended players:** 4–10; one impostor for 4–6, host-configurable one/two for 7–10 but start with exactly one. Assign via secure server RNG (seed stored server-side for audit but never broadcast during active game). Honest players privately receive same word/category; impostor sees only category and 'You are the impostor'. No client receives all roles or the word until allowed reveal.

**Rounds:** host selects pack and 60s discussion/clue collection. Each player offers a short clue in turn or says pass; clues are publicly revealed. Then 45s private simultaneous voting for suspected impostor. Cannot vote self. Locked votes immutable. At timeout, absent votes abstain. Most votes is accused; tied top-vote result means no conviction (explicitly show tie). If convicted person is impostor, allow one 15s secret-word guess. Honest side wins if culprit identified and guess wrong; impostor wins if not convicted or guesses exact word, with normalization/case/punctuation policy defined. One vote per player; dead/missing players handled gracefully.

**Raw scores:** proposed 100 points to members of winning side; 20 individual bonus for a correct suspect vote by honest player; impostor 100 if escapes or guesses word. Because side sizes differ, the leaderboard normalizer must handle ties and scores transparently; evaluate whether side-win bonus overweights the majority. Casual mode always supported. No camera/voice required; text clues displayed.

**Tests:** 4-player, 10-player role counts, impostor never receives secret, vote spoof, self-vote, tie/no conviction, retry, reconnect restores only own role, TV only public clues, case-insensitive guess, round cancellation, identical seeded replay.

## G02 Caption Clash — prompt, caption, anonymous vote
**Players:** 4–10; 3 rounds default, 75s caption writing, 35s voting each. Prompt may be a family-safe original text card or permissively licensed image; must work text-only. Each player submits at most one caption (editable until lock), with max length ~140 characters; host can hide/report offensive content. Captions are anonymously shuffled and presented without names while voting. A player may not vote for their own caption. Each player casts 1 vote; abstentions permitted. If own caption is the only remaining option, skip self-vote.

**Raw scoring:** 100 per received vote plus 25 participation if a valid caption submitted; tied captions share placement; no host arbitrary points except audited override. Show attribution only after voting closes. Funny answers become *candidates*, not automatically approved Memory Book entries.

**Tests:** client cannot see authors during voting, HTML injection escaped, same vote twice, own-vote rejected, all abstain, 4 participants, empty caption, moderation and consent removal, duplicate caption, disconnected contributor, timer.

## G03 Trivia Showdown — verified MCQ
**Players:** 2–10; optimized 4–10; 10 questions, 4 options, 20s per question, answer reveal/explanation after lock. All see same question simultaneously; server binds answer to question ID and shuffles options fairly with canonical option IDs. Every player gets own choice, edit until submission lock or timer expires. No answer sent before reveal.

**Raw scoring:** 100 correct + optional 0–20 speed component for answer received in first 15s, using a coarse bracket to avoid tiny ping advantages; wrong/no answer 0. Host may turn speed bonus off for accessibility. Tie scores share placement.

**Tests:** delayed answer, duplicate replay, wrong answer pack, reordered options with stable IDs, private key leaks, simultaneous 10, deadline based on server clock, consistency of explanation/source.

## G04 Word Connections — sixteen into four coherent groups
**Players:** solo challenge with shared round per person (or optional cooperative casual board); 16 word tiles, four exactly disjoint sets of four, each with a hidden category. Each player independently chooses a group of four, submits a guess, and sees accepted category or mistake count. Default four mistakes before board ends. Timer 4 minutes maximum; category difficulty optionally layered. Each board has unique, editorially reviewed categories (avoid multiple equally valid partitions); shuffle tile positions by seed while maintaining answer IDs.

**Raw scoring:** 100 for each correct group, 50 bonus if zero wrong attempts, 20 if one mistake, otherwise 0; early completion small capped time bonus optional. Do not assign wrong category due to superficial word matching; validate sets by stable tile ID. Hint reduces max bonus but never changes correctness.

**Tests:** no duplicated tile IDs, cannot reselect solved group, multiple valid-looking grouping QA, saved progress after reconnect, mistake cap, hidden category stays hidden until success/end, mobile multi-select accessible.

## G05 Who Said That? — consent-first attribution guessing
**Players:** 4–10; 8–12 questions. Prompts contain a memorable quote or saying plus 3–4 candidate speakers; reveal after all responses or timer. Two pack types: (A) real family quotes individually approved by speaker and host, with explicit opt-out/removal; (B) fictional/clearly labeled sample original quotes with imaginary people for demos. Do NOT invent a real quote and attribute it to a relative, or scrape family chat without permission. If no family submissions exist, the original generic pack makes this game playable.

**Raw scoring:** 100 correct and optionally 10 capped participation/streak bonus; incorrect/no answer 0. Host may privately add/edit a quote pack, with content review status and creator; speakers cannot be forced to contribute. Possible speaker self-knowledge advantage is shown in fairness note; exclude speaker from scoring on their own quote OR use neutral public-source/demo content in official play. Default: exclude speaker from scoring that prompt and normalize eligible opportunities.

**Tests:** attribution permission check, speaker opt-out deletion, unauthorized content leak, generic pack works offline, cannot choose a hidden correct answer with client spoof, avoid own-quote unfairness.

## G06 Guess the Year — chronological closeness
**Players:** 2–10; 8 event cards, ~25s each. Show a verifiable event with a single sourced year, a valid year range and contextual hint. Players submit one integer year; accept only plausible range; reveal answer and brief contextual source. Use global events across eras/countries, not a single franchise.

**Raw scoring (proposed):** `max(0,100 - 10*abs(guess - correctYear))`; exact 100, 1 year off 90, 10+ years off 0. For very old events permit difficulty-specific slope defined in content pack and displayed before play; never hide scoring curve. Ties share placement.

**Tests:** BCE/year-zero policy (avoid BCE packs initially), range validation, event source mismatch, +/- distance, exact vs far scoring, late input, answer reveal.

## G07 Closest Wins — numeric estimation
**Players:** 2–10; 8 questions with a verifiable finite nonnegative or signed numeric target and clear units. Prompts such as length/distance/population must state reference date and acceptable unit conversion if applicable. Entry is numeric and accessible, with magnitude/range hint. No uncited superlatives. Reveal exact answer + source and difference for each guess.

**Raw scoring:** closest absolute error earns 100; 2nd 70; 3rd 50; others 25 for valid attempt. Ties in absolute error share the highest occupied rank's award (a rank-policy variation from championship midranks, clearly separate). Alternatively use a continuous error curve; keep this configurable and consistently explained. No penalty for being above vs below unless declared before round.

**Tests:** negative and decimal inputs, units, ties from opposite sides, all abstain, extreme outliers, zero target, scientific notation rejected or normalized predictably, source data.

## G08 Category Sprint — speed and diversity
**Players:** 4–10; 3 rounds, category announced, 60s to submit up to 5 unique answers each. Host-chosen pre-reviewed category with example but not answer list displayed. Server normalizes case, whitespace and trivial punctuation and rejects duplicate answers by same player; optionally no same answers across players for bonus, but avoid latency race: all responses remain private until reveal and common answer collisions adjudicated simultaneously. Curated deterministic dictionary covers straightforward categories. Unknown/subjective entries become host-judged pending, not automatically wrong due to unavailable language model.

**Raw scoring:** 20 per valid distinct answer, +20 per answer that no other player gave (after simultaneous reveal). Maximum 200 if 5 unique. If contested, host majority/appeal interface records verdict and reason; no automatic AI judging. Provide easy, familiar and varied categories, including an original low-English-dependence pack where possible.

**Tests:** Unicode normalization, synonyms/aliases, repeated answers, race-free shared words, host adjudication, obscene entries, five-answer cap, disconnected player, timer.

## G09 Charades — acted clues, human verified
**Players:** 4–10 in 2 teams where feasible; 4 rounds, 60s turns, roles rotate so each gets a chance to act. Server privately shows charade prompt only to acting player's phone (and optionally a privacy-masked host view), others guess verbally in the room; the game does NOT require camera/microphone permissions or attempt voice recognition. Actor has large Correct/Pass controls; to discourage arbitrary cheating, host/cohost verifies accepted guess or acts as referee. TV shows timer and public scoreboard but NOT secret prompt until revealed.

**Raw scoring:** +100 to team for each correctly guessed charade, 0 for pass; host-configurable 3 passes/turn. Use equal total turn allotment and per-turn rate normalization for uneven teams. For 4-person group, two 2-person teams. For odd player numbers, rotating actor/team assignment must be fair; include host option to use individual 'everybody guesses' casual mode.

**Tests:** unauthorized actor reveal, timer, official host validation, pass limit, team balancing, actor rotation, long prompts, 5-player odd split, spectator projection safety.

## G10 Geography Challenge — 6 proposed submodes in one collection
**Players:** 2–10, 4–10 target; ~5 prompts/mode default; category selector and mixed-mode playlist. Each uses versioned verified data, consistent category progress and independent points.

A. **Flag -> country:** show a legally usable original/attributed flag asset or rendered permissive SVG, choose nation from 4 options; avoid disputed symbols without a source note.
B. **Outline -> country:** simplified country outline SVG from an explicitly licensed dataset; no small-island impossibilities at low zoom; choose from 4.
C. **Capital -> country:** capital named, pick correct country; respect officially multiple capitals / disputed cases; avoid ambiguous prompts.
D. **Locate on map:** user taps approximate location of named country/capital on accessible low-detail map. Server calculates distance against reference coord, not client; include accessible alternative 4-choice region map for non-pointer users. Data and projection/licensing must be explicit.
E. **Higher or lower:** two geographic quantities with verified sources (area, mountain elevation, latitude, etc.), select which is larger; avoid live-changing population unless date-stamped.
F. **Distance challenge:** choose or estimate which location is closest to a target or input a numeric distance in km; score by error with approximate great-circle formula and explicit reference points; avoid asking exact driving distances.

**Raw scoring:** for MCQ modes +100 correct, 0 wrong; for map location +100 within 250km, +70 within 750km, +40 within 1500km, 0 otherwise (region/scale adjustable and disclosed); for distance estimation reuse a transparent closeness scoring rule. No hidden cheating via client-supplied distances. Keep different mode raw scores normalized when official.

**Provisional status:** these six modes were proposed by ChatGPT as candidates, NOT confirmed individually by owner; implement with modular config and mark as requiring owner review before official use. If licensed map data cannot be verified, replace geometry with a working four-choice text/flag variant in local builds and document missing map mode as a blocker, not a fake complete feature.

**Tests:** answer/source review, image license metadata, capital ambiguity, distance endpoints, antimeridian handling, huge/small country click UX, projection privacy, offline packs, six playable flows and scoring consistency.

## G11 Math Mayhem — funny, quick mental arithmetic
**Players:** 2–10; 10 four-choice questions, 20s each plus reveal, ~5 minutes. Questions: addition, subtraction, multiplication, easy division, percentages using whole outcomes, simple word problems. Should be fun for mixed backgrounds, not advanced exams. No trick wording, no hard fractions or difficult algebra. Generate arithmetic from deterministic seeded templates and compute correct answers programmatically; verify distractors unique and plausible. Occasional funny story question is original writing, never personal embarrassment.

**Raw scoring:** +100 for correct, 0 wrong/timeout; small speed bonus **max +20** for early answers in coarse brackets, optional disabled for fairness. E.g. 0–5s +20, 5–10s +10, remaining in time +0. All scoring server-derived, with latency grace; speed never dominates knowledge.

**Tests:** 10 questions exactly, all answers and 4 distinct options verified, divide-by-zero impossible, timer/grace, correct 100 + capped bonus, wrong 0, hidden key, reconnect, 4/10 player play.

## Shared officiating, social safety and presentation rules
- All games disclose the exact raw score before playing and expose the championship normalized score afterward.
- Host can skip bad content without awarding points; reason logged in official mode. Player submissions are sanitized, capped and safe for screen readers/TV. No moderation feature claims fully automatic detection.
- Every game has a compact 3-step tutorial and a practice example. Practice results never count.
- Repeat pack items only after exhausting available items in that session; avoid repeated questions across seven days, persist seen IDs by room.
- Public announcements show names/results only after reveal; secret answers and roles never travel to TV before reveal.
- If a game can't fairly proceed due to too few players or no content, disable start with reason and provide another actual working game.
- Add a game harness that runs all 11 modules with fixed seed, fake clock, deterministic input intents and expected score events.



---
