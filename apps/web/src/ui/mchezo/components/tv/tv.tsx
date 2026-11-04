import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMchezo } from '../../MchezoProvider.js';
import { ANSWER_SHAPES } from '../../tokens/tokens.js';
import { formatScore, previousScores, rankMovement, rankStandings } from '../../lib/standings.js';
import type { AnswerOption, ChampionshipConfig, GameInfo, Player, ScoreEntry } from '../../types.js';
import { EventBadge, ICON, Icon, PlayerToken, Stamp, Wordmark } from '../primitives.js';

/* ============================================================ stage frame */

/** Designs at 1920×1080 and scales uniformly to whatever screen it is cast to. */
export function TVStage({ children, label = 'Mchezo big screen' }: { children: ReactNode; label?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / 1920, el.clientHeight / 1080) || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="mz-tv-outer">
      <div className="mz-tv" style={{ transform: `scale(${scale})` }} role="region" aria-label={label}>
        <div className="mz-tv__spot" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function TVTopBar({ game, questionLabel, roomCode, championship }: { game: GameInfo; questionLabel: string; roomCode: string; championship?: ChampionshipConfig }) {
  return (
    <header className="mz-tv-top">
      <Wordmark size={30} />
      <div className="mz-tv-top__mid">
        <span style={{ color: `var(--mz-answer-${game.accentIndex ?? 3})` }}>{game.name}</span>
        <span className="mz-dot" aria-hidden="true" />
        <span className="mz-muted">{questionLabel}</span>
      </div>
      <div className="mz-tv-top__right">
        {championship && <EventBadge championship={championship} />}
        <span className="mz-tv-pill">Join <b>{roomCode}</b></span>
      </div>
    </header>
  );
}

/* ============================================================ circle (TV) */

export function TVCircle({ players, litIds, checkIds, center, caption }: { players: readonly Player[]; litIds: ReadonlySet<string>; checkIds: ReadonlySet<string>; center: ReactNode; caption?: string }) {
  const { theme } = useMchezo();
  const dots = useMemo(() => Array.from({ length: 48 }, (_, k) => {
    const a = (k * Math.PI * 2) / 48;
    const w = theme.ring.style === 'wreath';
    return { cx: 280 + Math.cos(a) * 220, cy: 280 + Math.sin(a) * 220, r: w ? (k % 3 === 0 ? 5 : 3.5) : 2.2, fill: theme.ring.colors[k % theme.ring.colors.length] };
  }), [theme]);
  return (
    <div className="mz-tv-circle">
      <svg width="560" height="560" viewBox="0 0 560 560" aria-hidden="true">
        <circle cx="280" cy="280" r="220" fill="none" stroke="var(--mz-line)" strokeWidth="2" />
        {dots.map((d, i) => <circle key={i} {...d} />)}
      </svg>
      <div className="mz-tv-circle__center">{center}</div>
      {players.map((p, k) => {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / players.length;
        const lit = litIds.has(p.id);
        return (
          <div key={p.id} className={['mz-tv-seat', lit ? '' : 'mz-tv-seat--dim'].join(' ')} style={{ left: 280 + Math.cos(a) * 220, top: 280 + Math.sin(a) * 220 } as CSSProperties}>
            <PlayerToken player={p} index={k} size={80} dim={!lit} badge={p.connection === 'disconnected' ? 'offline' : checkIds.has(p.id) ? 'check' : null} />
            <span className="mz-tv-seat__name">{p.name}</span>
          </div>
        );
      })}
      {caption && <div className="mz-tv-circle__caption" role="status">{caption}</div>}
    </div>
  );
}

export function TVRing({ value, total, color, children }: { value: number; total: number; color: string; children: ReactNode }) {
  const r = 132, c = 2 * Math.PI * r;
  return (
    <div className="mz-tv-ring">
      <svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true">
        <circle cx="150" cy="150" r={r} fill="var(--mz-surface-1)" stroke="var(--mz-surface-2)" strokeWidth="12" />
        <circle cx="150" cy="150" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value / total)))} transform="rotate(-90 150 150)" className="mz-tv-ring__fill" />
      </svg>
      <div className="mz-tv-ring__label">{children}</div>
    </div>
  );
}

/* ============================================================ question */

export function TVQuestion({ category, question, options }: { category?: string; question: string; options: readonly AnswerOption[] }) {
  return (
    <section className="mz-tv-main mz-enter">
      {category && <span className="mz-tv-kicker" style={{ color: 'var(--mz-answer-3)' }}>{category}</span>}
      <h1 className="mz-tv-question">{question}</h1>
      <div className="mz-grow" />
      <div className="mz-tv-answers">
        {options.map((o, i) => (
          <div key={o.id} className="mz-tv-slab" style={{ ['--mz-slab' as string]: `var(--mz-answer-${i % 4})`, ['--mz-slab-deep' as string]: `var(--mz-answer-${i % 4}-deep)` } as CSSProperties}>
            <svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24"><path d={ANSWER_SHAPES[i % 4]} /></svg>
            <span>{o.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================ reveal */

export type RevealPhase = 'counting' | 'bars' | 'answer';

export function TVReveal({ question, options, counts, correctId, phase }: { question: string; options: readonly AnswerOption[]; counts: Record<string, number>; correctId: string; phase: RevealPhase }) {
  const max = Math.max(1, ...Object.values(counts));
  const grow = phase !== 'counting';
  const mark = phase === 'answer';
  return (
    <section className="mz-tv-main mz-enter" aria-live="polite">
      <span className="mz-tv-kicker" style={{ color: 'var(--mz-highlight)' }}>{mark ? 'The answer is' : 'The room said…'}</span>
      <span className="mz-tv-question mz-tv-question--small">{question}</span>
      <div className="mz-grow" />
      <div className="mz-tv-bars">
        {options.map((o, i) => {
          const n = counts[o.id] ?? 0;
          const right = o.id === correctId;
          return (
            <div key={o.id} className={['mz-tv-bar', mark && !right ? 'mz-tv-bar--dim' : ''].join(' ')}>
              <span className="mz-tv-bar__n" style={{ opacity: grow ? 1 : 0 }}>{n}</span>
              <span className="mz-tv-bar__fill" style={{ height: grow ? Math.max(10, (n / max) * 300) : 10, background: `var(--mz-answer-${i % 4})` }} />
            </div>
          );
        })}
      </div>
      <div className="mz-tv-answers mz-tv-answers--row">
        {options.map((o, i) => {
          const right = o.id === correctId;
          return (
            <div key={o.id} className={['mz-tv-slab', 'mz-tv-slab--small', mark && right ? 'mz-tv-slab--right' : '', mark && !right ? 'mz-tv-slab--dim' : ''].join(' ')}
              style={{ ['--mz-slab' as string]: `var(--mz-answer-${i % 4})`, ['--mz-slab-deep' as string]: `var(--mz-answer-${i % 4}-deep)` } as CSSProperties}>
              <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24"><path d={ANSWER_SHAPES[i % 4]} /></svg>
              <span>{o.label}</span>
              {mark && right && <Stamp className="mz-tv-slab__stamp">CORRECT</Stamp>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================ leaderboard */

/**
 * Leaderboard phases — every resting state is internally consistent:
 *   'before': previous order, previous totals.
 *   'delta' : previous order, previous totals, "+n" chips appear.
 *   'after' : new order, new totals (rows slide; reduced motion crossfades).
 * Totals are never shown mid-count in a position they don't belong to.
 */
export type LeaderboardPhase = 'before' | 'delta' | 'after';

export function TVLeaderboard({ players, scores, phase, kicker, title }: { players: readonly Player[]; scores: readonly ScoreEntry[]; phase: LeaderboardPhase; kicker: string; title: string }) {
  const { reducedMotion } = useMchezo();
  const before = useMemo(() => rankStandings(previousScores(scores), players), [scores, players]);
  const after = useMemo(() => rankStandings(scores, players), [scores, players]);
  const move = useMemo(() => rankMovement(before, after), [before, after]);
  const showAfter = phase === 'after';
  const list = showAfter ? after : before;
  const max = Math.max(1, ...after.map((r) => r.score));
  // Biggest climb: name one player only when the climb is unique; otherwise say how many moved up.
  const best = Math.max(0, ...move.values());
  const climbers = [...move.entries()].filter(([, v]) => v === best && best > 0).map(([id]) => players.find((p) => p.id === id)!.name);
  const c = climbers.length === 1 ? { label: `${climbers[0]} · up ${best}` } : climbers.length > 1 ? { label: `${[...move.values()].filter((v) => v > 0).length} players moved up` } : null;
  const rowH = 84;
  return (
    <section className="mz-tv-board mz-enter" aria-live="polite" data-phase={phase}>
      <div className="mz-tv-board__head">
        <div>
          <span className="mz-tv-kicker" style={{ color: 'var(--mz-highlight)' }}>{kicker}</span>
          <h1 className="mz-tv-board__title">{title}</h1>
        </div>
        <div className={['mz-tv-climb', showAfter && c ? 'mz-tv-climb--on' : ''].join(' ')}>
          <Icon d={ICON.up} size={30} stroke={2.6} />
          <div><span className="mz-tv-climb__k">{climbers.length > 1 ? 'On the move' : 'Biggest climb'}</span><span className="mz-tv-climb__v">{c ? c.label : 'No movers'}</span></div>
        </div>
      </div>
      <ol className={['mz-tv-rows', reducedMotion ? 'mz-tv-rows--rm' : ''].join(' ')} key={reducedMotion ? phase : 'stable'} style={{ height: list.length * rowH }}>
        {(reducedMotion ? list : after).map((r) => {
          const pos = list.findIndex((x) => x.playerId === r.playerId);
          const row = list[pos];
          const lead = showAfter && row.rank === 1;
          const m = move.get(r.playerId) ?? 0;
          const away = r.player.connection === 'disconnected';
          return (
            <li key={r.playerId} className={['mz-tv-row', lead ? 'mz-tv-row--lead' : ''].join(' ')} style={{ top: pos * rowH }} data-rank={row.rank} data-score={row.score}>
              <span className="mz-tv-row__rank">{row.rank}</span>
              <PlayerToken player={r.player} index={players.indexOf(r.player)} size={60} badge={away ? 'offline' : null} />
              <div className="mz-tv-row__bar">
                <span className="mz-tv-row__fill" style={{ width: `${(row.score / max) * 100}%` }} />
                <span className="mz-tv-row__label">
                  <span className="mz-tv-row__name">{r.player.name}</span>
                  {away && <span className="mz-tv-row__away">Away</span>}
                  {phase !== 'before' && !!r.delta && <span className="mz-tv-row__gain">+{formatScore(r.delta)}</span>}
                  {showAfter && m !== 0 && <span className={['mz-tv-row__move', m > 0 ? 'mz-tv-row__move--up' : ''].join(' ')} aria-label={m > 0 ? `up ${m}` : `down ${-m}`}>{m > 0 ? `▲ ${m}` : `▼ ${-m}`}</span>}
                </span>
              </div>
              <span className="mz-tv-row__score">{formatScore(row.score)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Drive leaderboard phases on a timer; restarts whenever `runKey` changes. */
export function useLeaderboardPhases(runKey: unknown, start: LeaderboardPhase = 'before', timings = { delta: 900, after: 2000 }) {
  const [phase, setPhase] = useState<LeaderboardPhase>(start);
  useEffect(() => {
    setPhase(start);
    if (start === 'after') return;
    const a = start === 'before' ? setTimeout(() => setPhase('delta'), timings.delta) : undefined;
    const b = setTimeout(() => setPhase('after'), timings.after);
    return () => { if (a) clearTimeout(a); clearTimeout(b); };
    // NOTE (integration): the handoff disabled exhaustive-deps here; our
    // eslint setup has no such rule, so the disable comment was removed.
    // The dependency list (runKey, start) is intentional.
  }, [runKey, start]);
  return phase;
}

/* ============================================================ director */

export type TVStageId = 'question' | 'reveal' | 'leaderboard';

export function DirectorBar({ stage, auto, onAutoChange, onJump, onNext, onPrev }: { stage: TVStageId; auto: boolean; onAutoChange: (a: boolean) => void; onJump: (s: TVStageId) => void; onNext: () => void; onPrev: () => void }) {
  const stages: [TVStageId, string][] = [['question', 'Question'], ['reveal', 'Reveal'], ['leaderboard', 'Leaderboard']];
  return (
    <nav className="mz-director" aria-label="Show controls">
      <div className="mz-director__stages" role="tablist">
        {stages.map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={stage === id} className={['mz-director__stage', stage === id ? 'mz-director__stage--on' : ''].join(' ')} onClick={() => onJump(id)}>{l}</button>
        ))}
      </div>
      <div className="mz-director__ctl">
        <button type="button" className="mz-key mz-key--surface mz-key--md" onClick={onPrev} aria-label="Previous cue"><Icon d={ICON.prev} size={20} stroke={2.6} /></button>
        <button type="button" className="mz-key mz-key--surface mz-key--md" aria-pressed={auto} onClick={() => onAutoChange(!auto)}>
          <Icon d={auto ? ICON.pause : ICON.play} size={18} filled />{auto ? 'Auto-director on' : 'Auto-director paused'}
        </button>
        <button type="button" className="mz-key mz-key--brand mz-key--md" onClick={onNext}>Next<Icon d={ICON.next} size={20} stroke={2.6} /></button>
      </div>
    </nav>
  );
}
