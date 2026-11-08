import type { CSSProperties } from 'react';
import { ANSWER_SHAPES } from '../tokens/tokens.js';
import { formatScore, ordinal, standingsRows } from '../lib/standings.js';
import type { AnswerOption, Player, RankedEntry } from '../types.js';
import { ICON, Icon, PlayerToken } from './primitives.js';

/* ----------------------------------------------------- waiting for the circle */

export function WaitingCircle({ players, answeredIds, youId }: { players: readonly Player[]; answeredIds: ReadonlySet<string>; youId: string }) {
  const active = players.filter((p) => p.connection !== 'disconnected');
  const done = active.filter((p) => answeredIds.has(p.id)).length;
  const r = 44, c = 2 * Math.PI * r;
  return (
    <div className="mz-wait">
      <svg className="mz-wait__ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="mz-wait__track" />
        <circle cx="50" cy="50" r={r} className="mz-wait__fill" strokeDasharray={c} strokeDashoffset={c * (1 - done / Math.max(1, active.length))} transform="rotate(-90 50 50)" />
      </svg>
      {players.map((p, k) => {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / players.length;
        const ok = answeredIds.has(p.id);
        return (
          <span key={p.id} className="mz-wait__seat" style={{ left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%` } as CSSProperties}>
            <PlayerToken player={p} index={k} size={40} you={p.id === youId} dim={!ok && p.connection !== 'disconnected'} badge={p.connection === 'disconnected' ? 'offline' : ok ? 'check' : null} />
          </span>
        );
      })}
      <div className="mz-wait__center" role="status" aria-live="polite">
        <span className="mz-wait__count">{done}<small>/{active.length}</small></span>
        <span className="mz-wait__label">{done < active.length ? `still thinking: ${active.length - done}` : 'everyone’s in'}</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- personal result card */

export interface ResultCardProps {
  correct: boolean | null; // null = no answer
  correctLabel: string;
  /** Points supplied by the host. Omit to hide the points line. */
  points?: number;
  pointsShown?: number;
  rank?: number;
  movement?: number;
}

export function ResultCard({ correct, correctLabel, points, pointsShown, rank, movement = 0 }: ResultCardProps) {
  const kicker = correct ? 'You got it' : correct === false ? 'Not this time' : 'No answer';
  return (
    <section className={['mz-result', correct ? 'mz-result--correct' : ''].join(' ')} aria-live="polite">
      <span className="mz-kicker">{kicker}</span>
      <h2 className="mz-result__title">{correct ? `Correct — ${correctLabel}` : `It was ${correctLabel}`}</h2>
      <div className="mz-result__row">
        {points !== undefined && (
          <div className="mz-result__points"><span className="mz-result__num">+{formatScore(pointsShown ?? points)}</span><span className="mz-result__unit">points</span></div>
        )}
        {rank !== undefined && (
          <span className="mz-result__rank">
            <Icon d={movement > 0 ? ICON.up : movement < 0 ? ICON.down : ICON.flat} size={16} stroke={2.6} />
            {ordinal(rank)}{movement > 0 ? ` · up ${movement}` : movement < 0 ? ` · down ${-movement}` : ''}
          </span>
        )}
      </div>
    </section>
  );
}

/* ----------------------------------------------------- answer distribution (no-TV mode) */

export function AnswerDistribution({ options, counts, correctId, total }: { options: readonly AnswerOption[]; counts: Record<string, number>; correctId: string; total: number }) {
  return (
    <section className="mz-card mz-dist" aria-label="How the room answered">
      <span className="mz-kicker mz-kicker--muted">How the room answered</span>
      {options.map((o, i) => {
        const n = counts[o.id] ?? 0;
        const right = o.id === correctId;
        return (
          <div key={o.id} className={['mz-dist__row', right ? 'mz-dist__row--right' : ''].join(' ')}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" style={{ fill: `var(--mz-answer-${i % 4})` }}><path d={ANSWER_SHAPES[i % 4]} /></svg>
            <span className="mz-dist__label">{o.label}{right && <span className="mz-sr"> (correct)</span>}</span>
            <span className="mz-dist__bar"><span style={{ width: `${(n / Math.max(1, total)) * 100}%`, background: `var(--mz-answer-${i % 4})` }} /></span>
            <span className="mz-dist__n">{n}</span>
            {right && <Icon d={ICON.check} size={16} stroke={3} className="mz-dist__ok" />}
          </div>
        );
      })}
    </section>
  );
}

/* ----------------------------------------------------- standings (phone) */

export function StandingsList({ ranked, youId, limit = 3, players }: { ranked: readonly RankedEntry[]; youId: string; limit?: number; players: readonly Player[] }) {
  const rows = standingsRows(ranked, youId, limit);
  const me = ranked.find((r) => r.playerId === youId);
  // Your row is shown on its own below the top rows (the "gap" style).
  const youBelow = !!me && ranked.indexOf(me) >= limit;
  return (
    <ol className="mz-standings" aria-label="Standings">
      {rows.map((r) => {
        const you = r.playerId === youId;
        const gap = youBelow && r === me;
        const away = r.player.connection === 'disconnected';
        return (
          <li key={r.playerId} className={['mz-standings__row', you ? 'mz-standings__row--you' : '', gap ? 'mz-standings__row--gap' : ''].join(' ')}>
            <span className="mz-standings__rank">{r.rank}</span>
            <PlayerToken player={r.player} index={players.indexOf(r.player)} size={32} badge={away ? 'offline' : null} />
            <span className="mz-standings__name">{you ? 'You' : r.player.name}</span>
            {away && <span className="mz-standings__away">Away</span>}
            {r.delta !== undefined && r.delta !== 0 && (
              <span className="mz-standings__gain">{r.delta > 0 ? `+${formatScore(r.delta)}` : `−${formatScore(-r.delta)}`}</span>
            )}
            <span className="mz-standings__score">{formatScore(r.score)}</span>
          </li>
        );
      })}
    </ol>
  );
}
