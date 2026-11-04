# Technical handoff for the new visual design (M6 visual freeze, 2026-11-04)

**Status: visual direction is FROZEN.** The owner reviewed the M6 screenshots and
found the current look too monochromatic, heavily green, and prototype-like.
Do NOT propagate the current design system to the remaining games, and do NOT
make large restyling or visual-theme decisions until the owner supplies approved
visual references and a design system. All M6 functionality below is preserved
and committed locally (commit `f0584c6`); only the visuals are on hold.

## What a new design must accommodate (constraints, not preferences)

1. **Server stays authoritative.** Game state, scoring, timers, deadlines, and
   private information come from the server projection. The client never
   computes scores, never invents a winner, and never renders another player's
   secrets. A redesign may change presentation only.
2. **Per-player projections are different objects.** The same game renders
   differently for each player (own answers, own role card, own prompt), and
   differently again for TV (public only: no answer keys, secret words,
   prompts, or recovery tokens). Any component that shows game data must take
   the projection it is given, never a shared "game state".
3. **Show Mode phases are presentation, not server state** (`apps/web/src/components/showPhase.ts`):
   lobby → intro → gameplay → waiting → results, derived from the projection
   plus per-player dismissal state in `sessionStorage` (`cgn_intro_dismissed`,
   `cgn_results_dismissed`). The intro auto-advances after 8s for that player
   only; games never auto-advance; the host still starts the next game.
   Waiting is a **banner above the game panel**, not a replacement — replacing
   the panel hid phase changes from waiting players (decision L26).
4. **Secrets live in plain sight of the DOM unless hidden by design.** The
   Impostor role card renders both faces and hides one with CSS
   (`display: none`). A new design must keep unrevealed faces out of the
   *visible* rendering and must not move secret text into attributes, alt
   text, or aria labels that a screen reader or a DOM dump would surface
   before reveal. (Note: `textContent` includes `display: none` text — a
   test that reads textContent will "see" the hidden face; that is a test
   artefact, not a visual leak, but a redesign should not make it worse.)
5. **Touch and accessibility floors, not nice-to-haves:** 44px minimum targets;
   keyboard-operable everything (role-card flip is a `<button>`, not a hover);
   every gesture has a tap/type alternative (timeline slider + numeric input,
   dial + numeric input, tap grouping); focus visible; `prefers-reduced-motion`
   respected; nothing important depends on animation; sound off by default.
   Animation intensity is a per-player local setting (`full`/`reduced`/`off`,
   `localStorage` `cgn_anim`).
6. **No new paid assets.** $0 constraint: no purchased fonts, images, icon
   sets, or APIs; no unlicensed copyrighted media. System font stack today;
   all visuals are CSS. Any new design must stay within that unless the owner
   explicitly approves a spend.
7. **Performance envelope:** phones first (320–390px viewports are the tested
   sizes), TV/desktop as a second layout (the TV view is a separate `view`,
   not a responsive breakpoint of the phone view). No large asset downloads;
   no 3D; no particle/confetti systems (deliberately excluded in M6).
8. **Tests pin the UI contract.** Browser drivers locate elements by
   `data-testid` and by button text — see "Stable hooks" below. A redesign
   must keep those hooks or update the drivers in the same change, and must
   re-run the full gates (typecheck, lint, 221 tests, M6 driver 9/9, E2E 12/12).

## Frontend structure

```
apps/web/                 Vite 5 + React + TypeScript (strict, separate web tsconfig)
  index.html              Vite entry
  src/main.tsx            Mounts <App/>
  src/App.tsx             (233 lines) Session, nav, and Show Mode orchestration.
                          Owns: landing (step-based), lobby view, championship /
                          TV / memory views, WS + 2s polling fallback, session
                          token handling, QR generation, host/cohost actions.
  src/types.ts            Typed projection contracts: Projection, PublicPlayer,
                          PublicGame (incl. submittedCount/totalPlayers),
                          PlayerGame, RegistryGame, ChampionshipResult,
                          Ceremony, MemoryEntry, LedgerEvent, JoinResponse.
                          GameState is a loose record, NOT a per-game union
                          (known limitation, decision L16).
  src/components/
    GamePanel.tsx         All 11 games' play screens, one branch per gameId.
                          This is the file a per-game personality redesign
                          touches most. Quiz games share the answer-tile branch.
    ChampionshipView.tsx  Family Cup standings, day advance, ceremony,
                          achievements, host override panel + audit trail.
    MemoryBookView.tsx    Add/approve/revoke, markdown/PDF/share-image export
                          (layout via exportLayout.ts: paginateLines,
                          canvasNoteY, selectShareEntries).
    LivingLobby.tsx       Ornament players, presence, tap-to-sparkle (local only).
    ShowMode.tsx          ShowIntro / ShowWaiting / ShowResults.
    Reactions.tsx         Curated emoji bar + recent reactions + host mute.
    SettingsBar.tsx       Sound toggle + animation-intensity select.
    showPhase.ts          Pure deriveShowPhase() + myProgressDone() + ornament
                          colour hash. Unit-tested; keep it pure.
    exportLayout.ts       Pure export pagination helpers. Unit-tested.
  src/index.css           Single stylesheet, no framework, no CSS modules.
                          See "Current styling" below.
src/server/http.ts        HTTP + WS adapter. Projections are merged through
                          projectFor() (adds ephemeral reactions + mute flag).
                          Session token in x-session-token header; WS token in
                          the subprotocol header (never in the URL).
src/server/room.ts        Authoritative engine. Public games carry
                          submittedCount/totalPlayers for the waiting banner.
src/scoring/              Family Cup rules (CHAMPIONSHIP_CONFIG). DO NOT
                          restyle-or-refactor scoring as part of a visual pass.
```

## Current styling (what to replace, deliberately)

- Single file `apps/web/src/index.css` (~120 lines incl. M6 additions).
  No Tailwind in the built app despite the early plan mentioning it — the
  implementation uses plain CSS classes (`.card`, `.row`, `.grid`, `.pill`,
  `.tile`, `.ornament`, `.answer-tile`, `.role-card`, `.show-*`, `.waiting`).
- Tokens (`:root`): bg `#102C25`, panel `#245344`, panel2 `#1B4237`,
  gold `#E5BC70`, cream `#F7F2E8`, accent `#A73545`, muted `#C8D8D0`,
  green `#3E8E6A`, line `#3A6B5C`. This is the "heavily green, monochromatic"
  system the owner rejected — replace the palette, not the class structure,
  unless the approved design justifies a restructure.
- Layout: single centred column, max-width 760px, 16px cards, 44px controls.
  TV view reuses the same column; a cinematic TV layout is still an open
  design task (M6.4), not an implemented one.
- Motion: 250ms card-in, 400ms staggered result rows, 300ms role-card flip,
  180ms button transitions; `anim-reduced`/`anim-off` classes + media query.

## Stable hooks a redesign must preserve (or update drivers with)

- `data-testid`: `living-lobby`, `show-intro`, `show-start-playing`,
  `show-waiting`, `show-results`, `show-back-to-lobby`, `game-panel`,
  `role-card`, `reactions`, `recent-reactions`, `settings-bar`,
  `finished-games`, `game-card-<id>`, `start-official-<id>`,
  `start-practice-<id>`.
- Button texts drivers rely on: "Submit year", "Submit guess", "Submit clue",
  "Submit caption", "Submit group of 4", "Submit answers", "Correct (+100 team)".
  (A prior rename to "Submit typed year/guess" broke E2E; slider/dial submits
  now use distinct labels "Submit timeline year …" / "Submit dial guess …".)
- Drivers: `scripts/check-m6.mjs` (9 checks), `scripts/e2e-browser.mjs`
  (12/12), `scripts/screenshot-m6.mjs` (8 screenshots in
  `docs/m6-screenshots/`), plus `check-mobile` (32/32), `check-f4` (11/11),
  `check-f5` (30/30), `check-contrast` (57/57). All Chromium emulation;
  real-device verification remains NOT RUN.

## Nonvisual work that continues during the freeze

Stability, gameplay correctness, testing, reconnection, synchronisation,
security, and maintainability — no large UI restyling. Concrete backlog
(also in docs/PROGRESS.md): M6.4 restyle is ON HOLD; instead: per-game
abstention semantics (L13 open refinement), host-recovery edge cases,
deadline/timeout behaviour, WS reconnect robustness, and test coverage for
show-phase transitions already added in tests/m6-showmode.test.ts.
