import { useEffect, useState } from 'react';
import { useMchezo } from '../MchezoProvider.js';
import type { Player } from '../types.js';
import { GameCover } from './GameCover.js';
import { PlayerToken } from './primitives.js';
import { accentColor } from '../lib/covers.js';
import type { ResultsStory } from '../lib/celebrate.js';

/**
 * Stage 3 (bonus): the top of every results screen. The headline names the
 * winner or the tie, your card says where you placed, and one Mild line is
 * tied to something that really happened. All of it comes from the server's
 * recorded scores (lib/celebrate.ts).
 *
 * The celebration is a short burst of the kit's four shapes (at most 1.2 s,
 * 14 pieces, CSS only), only on the phone of a winner, never under reduced
 * motion or "Off", and it never covers or delays a button.
 */
export function ResultsHero({ story, gameId, title, official, players, points }: {
  story: ResultsStory;
  gameId: string;
  title: string;
  official: boolean;
  players: readonly Player[];
  /** Your points in this game (the server's), shown on your card. */
  points?: number;
}) {
  // reducedMotion already covers the OS setting, in-app "Less" and "Off".
  const { reducedMotion } = useMchezo();
  const [burst, setBurst] = useState(story.celebrate && !reducedMotion);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(false), 1400);
    return () => clearTimeout(t);
  }, [burst]);
  const winners = story.winners.map((id) => players.find((p) => p.id === id)).filter((p): p is Player => !!p);
  return (
    <section className={`mz-rhero mz-rhero--${story.tone}`} data-testid="results-hero" data-tone={story.tone} style={{ ['--mz-accent' as string]: accentColor(gameId) }} aria-labelledby="mz-rhero-title">
      <div className="mz-rhero__top">
        <GameCover gameId={gameId} decorative className="mz-rhero__cover" />
        <div className="mz-rhero__text">
          <span className="mz-kicker mz-rhero__kicker">{title} · {official ? 'Official' : 'Practice'}</span>
          <h1 className="mz-rhero__title" id="mz-rhero-title" data-testid="results-headline">{story.headline}</h1>
        </div>
      </div>
      {winners.length > 0 && story.tone !== 'no-score' && story.tone !== 'single' && (
        <ul className="mz-rhero__winners" aria-label={winners.length > 1 ? 'Sharing first place' : 'Winner'}>
          {winners.slice(0, 6).map((p) => (
            <li key={p.id} className="mz-rhero__winner">
              <PlayerToken player={p} index={players.indexOf(p)} size={40} badge={null} />
              <span className="mz-rhero__wname">{p.name}</span>
            </li>
          ))}
          {winners.length > 6 && <li className="mz-rhero__more">+{winners.length - 6} more</li>}
        </ul>
      )}
      {story.quip && <p className="mz-rhero__quip" data-testid="results-quip">{story.quip}</p>}
      {story.you && (
        <div className="mz-rhero__you" data-testid="results-you">
          <span className="mz-rhero__place">{story.you.label}</span>
          {points !== undefined && <span className="mz-rhero__pts">{points} pts</span>}
          {story.you.line && <span className="mz-rhero__line">{story.you.line}</span>}
        </div>
      )}
      {burst && (
        <div className="mz-confetti" aria-hidden="true" data-testid="results-confetti">
          {Array.from({ length: 14 }, (_, i) => <span key={i} className={`mz-confetti__bit mz-confetti__bit--${i % 4}`} style={{ ['--i' as string]: i }} />)}
        </div>
      )}
    </section>
  );
}
