import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useHaptics, useMchezo } from '../MchezoProvider.js';
import type { Player, ReactionEvent } from '../types.js';
import { PlayerToken } from './primitives.js';
import { REACTION_ICONS, ReactionGlyph } from './Reactions.js';

export interface CircleLobbyProps {
  /** Players in join order. Their palette colour is stable by this order. */
  players: readonly Player[];
  youId: string;
  /** Room capacity (max seats drawn). */
  capacity?: number;
  /** Centre of the circle (up-next game card, counts, etc.). */
  center?: ReactNode;
  reactions?: readonly ReactionEvent[];
  onNudge?: (playerId: string) => void;
  /** Player ids that just nudged you (shows a bubble on their seat). */
  nudgedBy?: readonly string[];
}

const RING = 38; // ring radius as % of the square

/**
 * "The Circle" lobby. You always sit at the bottom (nearest the thumb). Seats are
 * spread around the ring; the ring shows a couple of open seats so it never looks
 * empty with few players, and stops at capacity.
 */
export function CircleLobby({ players, youId, capacity = 10, center, reactions = [], onNudge, nudgedBy = [] }: CircleLobbyProps) {
  const { theme, reducedMotion } = useMchezo();
  const buzz = useHaptics();
  const youIdx = Math.max(0, players.findIndex((p) => p.id === youId));
  // You first, then everyone else in join order, so you are seat 0 at the bottom.
  const ordered = useMemo(() => [players[youIdx], ...players.filter((_, i) => i !== youIdx)].filter(Boolean), [players, youIdx]);
  const slots = Math.min(capacity, Math.max(6, players.length + (players.length < capacity ? 2 : 0)));
  const colorIndex = (p: Player) => players.indexOf(p);

  // Arrival detection (skip players present on first render).
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(players.map((p) => p.id)); return; }
    const added = players.filter((p) => !seen.current!.has(p.id));
    if (added.length) {
      added.forEach((p) => seen.current!.add(p.id));
      const now = Date.now();
      setFresh((f) => ({ ...f, ...Object.fromEntries(added.map((p) => [p.id, now])) }));
    }
  }, [players]);

  // Local nudge feedback (wobble on the person you tapped).
  const [wobble, setWobble] = useState<string | null>(null);
  useEffect(() => {
    if (!wobble) return;
    const t = setTimeout(() => setWobble(null), 700);
    return () => clearTimeout(t);
  }, [wobble]);

  // Re-render while bursts are alive so they expire.
  const [, setTick] = useState(0);
  const live = reactions.filter((r) => Date.now() - r.at < 1700);
  useEffect(() => {
    if (!live.length) return;
    const t = setTimeout(() => setTick((n) => n + 1), 400);
    return () => clearTimeout(t);
  });

  const seatPos = (k: number) => {
    const a = Math.PI / 2 + (k * Math.PI * 2) / slots;
    return { x: 50 + Math.cos(a) * RING, y: 50 + Math.sin(a) * RING, a };
  };

  const ringDots = useMemo(() => {
    const n = 40;
    return Array.from({ length: n }, (_, k) => {
      const a = (k * Math.PI * 2) / n;
      const wreath = theme.ring.style === 'wreath';
      return { cx: 50 + Math.cos(a) * RING, cy: 50 + Math.sin(a) * RING, r: wreath ? (k % 3 === 0 ? 1.1 : 0.75) : 0.45, fill: theme.ring.colors[k % theme.ring.colors.length] };
    });
  }, [theme]);

  const away = players.filter((p) => p.connection === 'disconnected').length;

  return (
    <div className="mz-circle" data-slots={slots}>
      <svg className="mz-circle__ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={RING} fill="none" stroke="var(--mz-line)" strokeWidth="0.45" />
        {ringDots.map((d, i) => <circle key={i} {...d} />)}
      </svg>

      <div className="mz-circle__center">{center}</div>

      <ul className="mz-circle__seats" aria-label={`${players.length} players in the room${away ? `, ${away} reconnecting` : ''}`}>
        {Array.from({ length: slots }, (_, k) => {
          const p = ordered[k];
          const { x, y } = seatPos(k);
          const style = { left: `${x}%`, top: `${y}%`, ['--mz-ox' as string]: `${(x - 50) * 0.9}cqi`, ['--mz-oy' as string]: `${(y - 50) * 0.9}cqi` } as CSSProperties;
          if (!p) return <li key={'empty' + k} className="mz-seat mz-seat--empty" style={style} aria-hidden="true"><span className="mz-seat__open" /></li>;
          const you = p.id === youId;
          const off = p.connection === 'disconnected';
          const isFresh = !reducedMotion && fresh[p.id] && Date.now() - fresh[p.id] < 900;
          const nudgedMe = nudgedBy.includes(p.id);
          return (
            <li key={p.id} className={['mz-seat', x > 62 ? 'mz-seat--right' : x < 38 ? 'mz-seat--left' : '', isFresh ? 'mz-seat--arrive' : '', wobble === p.id && !reducedMotion ? 'mz-seat--wobble' : ''].join(' ')} style={style}>
              <button type="button" className="mz-seat__btn" disabled={you || off}
                aria-label={you ? `You, ${p.name}` : off ? `${p.name}, reconnecting` : `Nudge ${p.name}`}
                title={p.name}
                onClick={() => { if (you || off) return; buzz(10); setWobble(p.id); onNudge?.(p.id); }}>
                <PlayerToken player={p} index={colorIndex(p)} you={you} />
              </button>
              <span className={['mz-seat__name', off ? 'mz-seat__name--off' : ''].join(' ')}>{you ? 'You' : off ? 'Away' : p.name}</span>
              {wobble === p.id && <span className="mz-bubble" role="status">Nudged!</span>}
              {nudgedMe && <span className="mz-bubble mz-bubble--in" role="status">Nudged you</span>}
            </li>
          );
        })}
      </ul>

      <div className="mz-circle__bursts" aria-hidden="true">
        {live.map((r) => {
          const p = ordered.findIndex((pl) => pl.id === r.playerId);
          if (p < 0 || p >= slots) return null;
          const { x, y } = seatPos(p);
          const style = { left: `${x}%`, top: `${y}%`, ['--mz-dx' as string]: `${(50 - x) * 0.55}cqi`, ['--mz-dy' as string]: `${(50 - y) * 0.55}cqi` } as CSSProperties;
          return (
            <span key={r.id} className="mz-burst" style={style}>
              <ReactionGlyph id={r.reaction} size={22} />
              {reducedMotion && <span className="mz-burst__who">{REACTION_ICONS[r.reaction].label}</span>}
            </span>
          );
        })}
      </div>

    </div>
  );
}

/** Name of the most recent arrival for ~2s (announce it in your own status line). */
export function useArrivals(players: readonly Player[], ms = 2200): string | null {
  const seen = useRef<Set<string> | null>(null);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(players.map((p) => p.id)); return; }
    const added = players.filter((p) => !seen.current!.has(p.id));
    added.forEach((p) => seen.current!.add(p.id));
    if (added.length) setLast(added[added.length - 1].name);
  }, [players]);
  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => setLast(null), ms);
    return () => clearTimeout(t);
  }, [last, ms]);
  return last;
}
