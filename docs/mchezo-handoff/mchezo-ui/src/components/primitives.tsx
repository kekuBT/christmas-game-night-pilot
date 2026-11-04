import { type ButtonHTMLAttributes, type ReactNode, useId } from 'react';
import { useMchezo } from '../MchezoProvider';
import { playerPalette } from '../tokens/tokens';
import type { ChampionshipConfig, Player } from '../types';

/* ------------------------------------------------------------------ icons */

export const ICON = {
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  tv: 'M2 4h20v13H2zM8 21h8M12 17v4',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  flat: 'M5 12h14',
  next: 'M9 6l6 6-6 6',
  prev: 'M15 6l-6 6 6 6',
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  offline: 'M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2-1.5M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5.1M12 20h.01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  star: 'M12 2l2.6 6.2 6.7.6-5.1 4.4 1.6 6.6L12 16.3l-5.8 3.5 1.6-6.6L2.7 8.8l6.7-.6z',
} as const;

export function Icon({ d, size = 20, filled = false, stroke = 2, className }: { d: string; size?: number; filled?: boolean; stroke?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={className}
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/* ------------------------------------------------------------------ logo */

/** The Circle mark: eight seats, one larger "you" dot in brand colour. */
export function CircleMark({ size = 32, multicolor = false }: { size?: number; multicolor?: boolean }) {
  const { theme } = useMchezo();
  const pal = [theme.color.brand, ...theme.color.answer.slice(1), theme.color.answer[0]];
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 40 40">
      {Array.from({ length: 8 }, (_, k) => {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 8;
        return <circle key={k} cx={20 + Math.cos(a) * 14} cy={20 + Math.sin(a) * 14} r={k === 0 ? 5 : 3}
          fill={k === 0 ? theme.color.brand : multicolor ? pal[k % 4] : theme.color.text} />;
      })}
    </svg>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="mz-wordmark" style={{ fontSize: size }}>
      <CircleMark size={size * 1.5} />
      <span>mchezo</span>
    </span>
  );
}

/* ------------------------------------------------------------------ keycap button */

export type KeyVariant = 'brand' | 'neutral' | 'surface' | 'ghost';

export interface KeycapProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: KeyVariant;
  size?: 'md' | 'lg';
  block?: boolean;
}

/** Tactile button: sits on a visible "depth" edge and travels down on press (pure CSS :active). */
export function Keycap({ variant = 'brand', size = 'lg', block, className, type = 'button', ...rest }: KeycapProps) {
  return <button type={type} className={['mz-key', `mz-key--${variant}`, `mz-key--${size}`, block ? 'mz-key--block' : '', className].filter(Boolean).join(' ')} {...rest} />;
}

/* ------------------------------------------------------------------ player token */

export function playerColor(p: Player, index: number) {
  return p.color ?? playerPalette[index % playerPalette.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0][0]).toUpperCase();
}

export interface PlayerTokenProps {
  player: Player;
  index: number;
  size?: number;
  you?: boolean;
  dim?: boolean;
  badge?: 'check' | 'offline' | null;
  className?: string;
}

export function PlayerToken({ player, index, size = 52, you, dim, badge, className }: PlayerTokenProps) {
  const off = player.connection === 'disconnected';
  const b = badge === undefined ? (off ? 'offline' : null) : badge;
  return (
    <span
      className={['mz-token', you ? 'mz-token--you' : '', off ? 'mz-token--offline' : '', dim ? 'mz-token--dim' : '', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, fontSize: Math.max(13, Math.round(size * 0.36)), ['--mz-token' as string]: playerColor(player, index) }}
    >
      {initials(player.name)}
      {b === 'check' && <span className="mz-token__badge mz-token__badge--check"><Icon d={ICON.check} size={Math.max(10, size * 0.22)} stroke={4} /></span>}
      {b === 'offline' && <span className="mz-token__badge mz-token__badge--offline"><Icon d={ICON.offline} size={Math.max(10, size * 0.22)} stroke={2.6} /></span>}
    </span>
  );
}

/* ------------------------------------------------------------------ ring timer */

export function RingTimer({ seconds, total, size = 58, stroke = 5, urgentAt = 5, label }: { seconds: number; total: number; size?: number; stroke?: number; urgentAt?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, seconds / total));
  const urgent = seconds <= urgentAt;
  return (
    <div className={['mz-ring', urgent ? 'mz-ring--urgent' : ''].join(' ')} role="timer" aria-live="off" aria-label={`${seconds} seconds left`} style={{ width: size, height: size }}>
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="mz-ring__track" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} className="mz-ring__fill" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="mz-ring__label">{label ?? seconds}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ championship */

export function EventBadge({ championship, compact }: { championship: ChampionshipConfig; compact?: boolean }) {
  return (
    <span className={['mz-event-badge', compact ? 'mz-event-badge--compact' : ''].join(' ')}>
      <Icon d={ICON.trophy} size={compact ? 16 : 20} stroke={1.9} />
      {championship.name} · {championship.unitLabel} {championship.current} of {championship.total}
    </span>
  );
}

/** One segment per championship unit — length comes from config (7 days, 3 nights, …). */
export function ChampionshipProgress({ championship, showWinners = true }: { championship: ChampionshipConfig; showWinners?: boolean }) {
  return (
    <ol className="mz-cup" aria-label={`${championship.name}: ${championship.unitLabel} ${championship.current} of ${championship.total}`}>
      {Array.from({ length: championship.total }, (_, i) => {
        const n = i + 1;
        const state = n < championship.current ? 'done' : n === championship.current ? 'now' : 'next';
        const w = championship.winners?.[i];
        return (
          <li key={i} className={`mz-cup__seg mz-cup__seg--${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="mz-cup__n">{n}</span>
            {showWinners && <span className="mz-cup__sub" title={w}>{state === 'now' ? 'Now' : w ?? ''}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ switch */

export function BigScreenToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <div className="mz-switch-row">
      <Icon d={ICON.tv} size={22} stroke={1.8} />
      <div className="mz-switch-row__text">
        <span id={id} className="mz-switch-row__label">Big screen</span>
        <span className="mz-switch-row__sub">{on ? 'TV connected · reveals play there' : 'No TV · reveals play on phones'}</span>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} className="mz-switch" onClick={() => onChange(!on)}>
        <span className="mz-switch__track"><span className="mz-switch__knob" /></span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ stamp */

export function Stamp({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={['mz-stamp', className].filter(Boolean).join(' ')}>{children}</span>;
}
