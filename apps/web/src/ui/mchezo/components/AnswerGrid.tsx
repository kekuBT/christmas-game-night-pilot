import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useHaptics, useMchezo } from '../MchezoProvider.js';
import { ANSWER_LETTERS, ANSWER_SHAPES } from '../tokens/tokens.js';
import type { AnswerOption } from '../types.js';
import { Stamp } from './primitives.js';

export interface AnswerGridProps {
  options: readonly AnswerOption[];
  selectedId: string | null;
  /** Once true, the selected answer takes over the grid and others step back. */
  locked: boolean;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

const GAP = 12;

/**
 * Thumb-zone answer keys (2 columns). Tap = press down + lock. On lock the chosen
 * key grows to fill the area and the "LOCKED IN" stamp lands. Reduced motion: the
 * keys stay put; the chosen one gains a thick outline + stamp (fade only).
 */
export function AnswerGrid({ options, selectedId, locked, onSelect, disabled }: AnswerGridProps) {
  const { reducedMotion } = useMchezo();
  const buzz = useHaptics();
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = 2;
  const rows = Math.ceil(options.length / cols);
  const cw = (box.w - GAP * (cols - 1)) / cols;
  const ch = (box.h - GAP * (rows - 1)) / rows;
  const expand = locked && !reducedMotion;

  return (
    <div ref={ref} className={['mz-answers', locked ? 'mz-answers--locked' : ''].join(' ')} role="group" aria-label="Answers">
      {box.w > 0 && options.map((o, i) => {
        const selected = selectedId === o.id;
        const other = selectedId != null && !selected;
        const big = expand && selected;
        const col = i % cols, row = Math.floor(i / cols);
        const lastOdd = options.length % 2 === 1 && i === options.length - 1;
        const style = {
          left: big ? 0 : lastOdd ? 0 : col * (cw + GAP),
          top: big ? 0 : row * (ch + GAP),
          width: big ? box.w : lastOdd ? box.w : cw,
          height: big ? box.h : ch,
          ['--mz-slab' as string]: `var(--mz-answer-${i % 4})`,
          ['--mz-slab-deep' as string]: `var(--mz-answer-${i % 4}-deep)`,
        } as CSSProperties;
        return (
          <button
            key={o.id}
            type="button"
            className={['mz-slab', selected ? 'mz-slab--selected' : '', other ? (expand ? 'mz-slab--gone' : 'mz-slab--dim') : '', big ? 'mz-slab--big' : ''].join(' ')}
            style={style}
            aria-pressed={selected}
            aria-label={`Answer ${ANSWER_LETTERS[i]}: ${o.label}${selected ? ', locked in' : ''}`}
            disabled={disabled || selectedId != null}
            tabIndex={other && expand ? -1 : 0}
            onClick={() => { if (selectedId != null) return; buzz([10, 30, 18]); onSelect(o.id); }}
          >
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" className="mz-slab__shape"><path d={ANSWER_SHAPES[i % 4]} /></svg>
            <span className="mz-slab__label">{o.label}</span>
            {selected && <Stamp className="mz-slab__stamp">LOCKED IN</Stamp>}
          </button>
        );
      })}
    </div>
  );
}
