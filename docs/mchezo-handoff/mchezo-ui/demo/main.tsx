import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MchezoProvider, themes, type LeaderboardPhase, type TVStageId } from '../src';
import '../src/styles/mchezo.css';
import './demo.css';
import { PhoneDemo } from './PhoneDemo';
import { TVDemo } from './TVDemo';

/**
 * Playground. URL params:
 *   view=phone|tv            theme=everyday|christmas      rm=1 (force reduced motion)
 *   start=landing|lobby|question|reveal   players=4..10   long=1   offline=N   tv=0|1   still=1
 *   stage=question|reveal|leaderboard     auto=0|1        phase=before|delta|after
 */
// Params from the query string, or from the hash (used by the hosted playground's frames).
const q = new URLSearchParams(location.search || location.hash.replace(/^#/, ''));
const theme = q.get('theme') === 'christmas' ? themes.christmas : themes.everyday;
const rm = q.get('rm') === '1' ? true : undefined;
const view = q.get('view') ?? 'phone';
const players = Math.max(1, Math.min(10, Number(q.get('players') ?? 8)));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MchezoProvider theme={theme} reducedMotion={rm} as={view === 'tv' ? 'bare' : 'surface'}>
      {view === 'tv' ? (
        <TVDemo theme={theme} stage={(q.get('stage') as TVStageId) ?? 'question'} auto={q.get('auto') !== '0'} playerCount={players} offline={Number(q.get('offline') ?? 0)}
          phase0={(q.get('phase') as LeaderboardPhase) ?? undefined} />
      ) : (
        <PhoneDemo theme={theme} start={(q.get('start') as 'landing') ?? 'landing'} playerCount={players} long={q.get('long') === '1'} offline={Number(q.get('offline') ?? 0)}
          tv={q.get('tv') !== '0'} still={q.get('still') === '1'} />
      )}
    </MchezoProvider>
  </StrictMode>,
);
