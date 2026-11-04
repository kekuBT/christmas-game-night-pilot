import { useMchezo, useHaptics } from '../MchezoProvider';
import type { ReactionId } from '../tokens/tokens';

export const REACTION_ICONS: Record<ReactionId, { label: string; d: string; fill: boolean }> = {
  love: { label: 'Love', d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', fill: true },
  bravo: { label: 'Bravo', d: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z', fill: true },
  ha: { label: 'Ha!', d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01', fill: false },
  wow: { label: 'Wow', d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9.5h.01M15 9.5h.01M12 17.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', fill: false },
  brr: { label: 'Brr', d: 'M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 4l3 2 3-2M9 20l3-2 3 2', fill: false },
};

const REACTION_TONE: Record<ReactionId, number> = { love: 0, bravo: 1, ha: 2, wow: 3, brr: 3 };

export function ReactionGlyph({ id, size = 24 }: { id: ReactionId; size?: number }) {
  const r = REACTION_ICONS[id];
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={`mz-reaction-glyph mz-tone-${REACTION_TONE[id]}`}
      fill={r.fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={r.fill ? 0 : 1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d={r.d} />
    </svg>
  );
}

/** Row of tactile reaction keys. The reaction set comes from the theme (seasonal swaps). */
export function ReactionBar({ onReact, disabled }: { onReact: (r: ReactionId) => void; disabled?: boolean }) {
  const { theme } = useMchezo();
  const buzz = useHaptics();
  const ids = theme.reactions ?? (['love', 'bravo', 'ha', 'wow'] as const);
  return (
    <div className="mz-reactions" role="group" aria-label="Send a reaction">
      {ids.map((id) => (
        <button key={id} type="button" className="mz-key mz-key--surface mz-key--reaction" aria-label={`Send ${REACTION_ICONS[id].label}`} disabled={disabled}
          onClick={() => { buzz(8); onReact(id); }}>
          <ReactionGlyph id={id} />
        </button>
      ))}
    </div>
  );
}
