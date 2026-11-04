# @mchezo/ui — “The Circle”

Design tokens and presentational React components for Mchezo: the phone controller and the optional TV stage.
It's written in TypeScript for React 18/19 and Vite. There's no backend in here, and no game or scoring logic.

```
src/
  tokens/tokens.ts        foundation + themes (everyday, christmasFamilyCup), createTheme(), themeToCssVars()
  tokens/tokens.css       generated CSS variables for non-React surfaces
  styles/mchezo.css       all component styles (prefix mz-, colours via CSS variables)
  MchezoProvider.tsx      theme + reduced-motion + haptics context
  lib/standings.ts        rankStandings(), previousScores(), rankMovement(): pure display helpers
  components/
    primitives.tsx        Keycap, PlayerToken, RingTimer, CircleMark/Wordmark, EventBadge,
                          ChampionshipProgress, BigScreenToggle, Stamp, Icon
    CodeInput.tsx         4-tile room code over one real <input>
    CircleLobby.tsx       the Circle lobby (+ useArrivals)
    AnswerGrid.tsx        tactile answer keys that grow into the locked answer
    Reactions.tsx         ReactionBar, ReactionGlyph
    Results.tsx           WaitingCircle, ResultCard, AnswerDistribution, StandingsList
    phone/screens.tsx     LandingScreen, LobbyScreen, GameIntroScreen, QuestionScreen,
                          LockedScreen, PhoneRevealScreen
    tv/tv.tsx             TVStage (1920×1080, scales to fit), TVTopBar, TVCircle, TVRing,
                          TVQuestion, TVReveal, TVLeaderboard (+ useLeaderboardPhases), DirectorBar
demo/                     playground with a mock session (not for production)
qa/                       Playwright checks used to validate the build
```

## Integrate

1. Copy `src/` into your app (for example `src/ui/mchezo/`), or add this folder as a workspace package.
   It's consumed as TypeScript source, so there's no build step.
2. Load the fonts once. Choose one:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700;800&family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">
   ```
   or self-host them with `@fontsource-variable/unbounded` and `@fontsource-variable/figtree`.
   The display font is used only for short headlines and numbers; all body and UI text is Figtree.
3. Wrap each phone route or TV route:
   ```tsx
   import { MchezoProvider, themes, LobbyScreen } from '@/ui/mchezo';

   <MchezoProvider theme={session.season === 'christmas' ? themes.christmas : themes.everyday}>
     <LobbyScreen … />
   </MchezoProvider>
   ```
   Importing `index.ts` pulls in `styles/mchezo.css`. If you import components individually, import the CSS yourself.
   Phone screens fill the viewport (`100dvh`, max width 480px, safe-area aware). Mount them as the whole page.
   If they sit under your own header, give their container a fixed height.

## Data ownership (important)

Components are presentational. Your app owns all game state and passes it in.

- **Scores:** pass `ScoreEntry { playerId, score, delta? }` from your server. The components never compute points.
  `rankStandings()` only **orders** the scores you give it: higher first; ties share a rank (1, 2, 2, 4); ties then sort by name.
  Use it everywhere (phone and TV) so ranks always agree.
- **Players:** `Player { id, name, color?, connection?: 'connected' | 'disconnected', isHost? }`.
  Colours come from a fixed player palette by join order, and stay the same across seasons.
- **Championship:** `ChampionshipConfig { name, unitLabel, current, total, winners? }`.
  Duration is data. The Christmas Family Cup is `{ name: 'Family Cup', unitLabel: 'Day', current: 3, total: 7 }`,
  but a 3-night or 10-round cup uses the same component. Leave `championship` out for everyday sessions.
- **TV present or not:** `tvConnected` changes behaviour, not layout. Without a TV, the phone result adds
  `AnswerDistribution` and the waiting copy says the reveal happens on the phone.
- The demo's flat 750 points per correct answer is **placeholder data only**.

## Themes (seasonal skins)

Themes change **colour and decoration only**. Layout, motion and interaction are shared foundation tokens.

```ts
import { createTheme, everyday } from '@/ui/mchezo';

export const halloween = createTheme(everyday, {
  id: 'halloween', name: 'Halloween',
  color: { ground: '#120F0A', brand: '#FF7A1A', brandDeep: '#B24F05' /* … */ },
  ring: { style: 'wreath', colors: ['#FF7A1A', '#9B7BFF', '#3E3550'] },
  reactions: ['love', 'bravo', 'ha', 'wow'],
});
```

Before shipping a new theme, run `qa/` or check contrast. These pairs need at least 4.5:1:

- `text`, `textMuted`, `success` and `highlight` on `ground`, `surface1` and `surface2`
- `onAccent` on every answer colour

`line` needs at least 3:1 against `ground`, because it draws input borders, the switch track and empty seats.
Both shipped themes pass. The lowest pair is `onAccent` on the Christmas cranberry, at 5.47:1.

## Leaderboard consistency

`TVLeaderboard` has three phases, and **every resting phase is internally consistent**:

| phase    | order          | totals          | extras             |
|----------|----------------|-----------------|--------------------|
| `before` | previous order | previous totals | —                  |
| `delta`  | previous order | previous totals | `+n` chips appear  |
| `after`  | new order      | new totals      | rows slide; ▲/▼ movement; climb callout |

Totals are never animated while rows move, so a higher score can never sit below a lower one.
`useLeaderboardPhases(runKey)` drives the timing. You can also control `phase` yourself.

The climb callout names a player only when exactly one player has the biggest climb.
Otherwise it reads "N players moved up".

## Accessibility and motion

- Real `<button>` and `<input>` elements throughout, with labelled icon buttons. The TV switch is `role="switch"`.
  Live regions announce arrivals, results and the waiting count.
- Touch targets are at least 44px. Phone text is at least 13px and TV text at least 18px (at 1080p).
  Answers use colour **and** shape (▲ ● ■ ◆).
- Reduced motion follows the OS setting (`prefers-reduced-motion`), or force it with `<MchezoProvider reducedMotion>`.
  When it's on, nothing moves, but every state change stays visible:
  - Screens crossfade.
  - The answer you chose stays in place with a thick outline and the "LOCKED IN" stamp, and the others dim.
  - Reactions fade in place, labelled with their name.
  - The leaderboard crossfades between phases and keeps the ▲/▼ chips.
- Haptics: `navigator.vibrate` on joining, answering and reacting. Turn it off with `<MchezoProvider haptics={false}>`.

## Run the playground

```
npm install
npm run dev          # http://localhost:5173
```

URL parameters (in `demo/main.tsx`):

- `view=phone|tv`, `theme=everyday|christmas`, `rm=1`
- Phone: `start=landing|lobby|question|reveal`, `players=4..10`, `long=1`, `offline=N`, `tv=0|1`, `still=1`
- TV: `stage=question|reveal|leaderboard`, `auto=0|1`, `phase=after`

## QA

`qa/run_phone.py` and `qa/run_tv.py` need Python Playwright (`pip install playwright && playwright install chromium`).
Run them against the dev server: `MZ_URL=http://localhost:5173/ python3 qa/run_phone.py out`.

They cover:

- The whole phone flow at 390×844, 360×740 (Christmas, no TV), 320×640, and 390×844 with reduced motion.
- The lobby with 4, 8 and 10 players, long names and disconnected players, checking that seats and names don't overlap.
- Horizontal overflow, text smaller than 13px, and WCAG contrast of rendered text.
- The TV at 1920×1080 and 1280×720: timer, director controls, and leaderboard consistency at every phase, plus 14 samples taken mid-transition.

## Known limits

- These are presentational components only. Hook them to your realtime state. Networking and reconnection are your app's job.
- Only trivia is designed. Other games should reuse `AnswerGrid`, `RingTimer`, `WaitingCircle` and the TV frame,
  each with its own `accentIndex`.
