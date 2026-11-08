import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A bottom sheet (Stage 2): grab handle, title, close button. The caller pushes
 * a history entry when it opens one, so browser Back and iOS swipe-back close
 * it first. Escape and the backdrop close it too. Focus moves to the title on
 * open, so screen readers announce what opened.
 */
export function Sheet({ title, onClose, children, testId, wide, kicker }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  /** Wider sheet on tablets and laptops (game grids). */
  wide?: boolean;
  kicker?: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const titleId = `mz-sheet-title-${testId ?? 'x'}`;
  return (
    <div className="mz-sheet-layer" data-testid={testId}>
      <div className="mz-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <section className={['mz-sheet', wide ? 'mz-sheet--wide' : ''].join(' ')} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="mz-sheet__grab" aria-hidden="true" />
        <div className="mz-sheet__head">
          <div className="mz-sheet__headtext">
            {kicker && <span className="mz-kicker">{kicker}</span>}
            <h2 className="mz-sheet__title mz-sheet__title--left" id={titleId} tabIndex={-1} ref={titleRef}>{title}</h2>
          </div>
          <button type="button" className="mz-iconbtn" aria-label="Close" data-testid={testId ? `${testId}-close` : undefined} onClick={onClose}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
