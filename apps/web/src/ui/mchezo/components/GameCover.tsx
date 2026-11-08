import { useId, useMemo } from 'react';
import { coverSvg } from '../lib/covers.js';

/**
 * A game's procedural cover (lib/covers.ts). The SVG is generated from a
 * constant table (no user input), so injecting it as markup is safe. The
 * element is labelled by the game title, or hidden when the caller already
 * names the game next to it.
 */
export function GameCover({ gameId, title, ratio = 1, size = 156, decorative, className }: {
  gameId: string;
  title?: string;
  /** width / height of the drawing (1 = square, 16/9 = hero). */
  ratio?: number;
  /** Drawing resolution of the shorter side; CSS sets the displayed size. */
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const w = Math.round(ratio >= 1 ? size * ratio : size);
  const h = Math.round(ratio >= 1 ? size : size / ratio);
  const html = useMemo(() => coverSvg(gameId, w, h, uid), [gameId, w, h, uid]);
  return (
    <span
      className={['mz-cover', className].filter(Boolean).join(' ')}
      style={{ aspectRatio: `${w} / ${h}` }}
      data-cover={gameId}
      {...(decorative || !title ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `${title} cover` })}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
