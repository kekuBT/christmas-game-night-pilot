/**
 * Stage 1 (owner-approved fixes, 2026-11-07): a segmented choice whose selected
 * option is unmistakable — it FILLS with its role colour and shows a check —
 * and whose state is exposed to assistive tech with aria-pressed. Each option
 * can carry a one-line explanation and a reason when it is unavailable.
 */
import type { ReactNode } from "react";

export interface ChoiceOption {
  value: string;
  title: string;
  /** One short line under the title ("Counts toward the Cup"). */
  detail?: ReactNode;
  /** Selected colour: sun = official/Cup, mint = practice/success, neutral = settings. */
  tone?: "sun" | "mint" | "neutral";
  disabled?: boolean;
  testId?: string;
}

export function SegmentedChoice({ label, options, value, onChange, compact, testId }: {
  label: string;
  options: readonly ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  testId?: string;
}) {
  return (
    <div className={`mz-choice${compact ? " mz-choice--compact" : ""}`} role="group" aria-label={label} data-testid={testId} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className={`mz-choice__opt mz-choice__opt--${o.tone ?? "neutral"}${on ? " is-on" : ""}`}
            aria-pressed={on}
            disabled={o.disabled}
            data-testid={o.testId}
            onClick={() => onChange(o.value)}
          >
            <span className="mz-choice__title">{o.title}{on && <span className="mz-choice__check" aria-hidden="true">✓</span>}</span>
            {o.detail && !compact && <span className="mz-choice__detail">{o.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** An inline explanation with an optional action, for "why can't I…" moments. */
export function NoticeCard({ tone = "warn", title, children, action, testId }: { tone?: "warn" | "info"; title: string; children?: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div className={`mz-noticecard mz-noticecard--${tone}`} role="status" data-testid={testId}>
      <p className="mz-noticecard__title">{title}</p>
      {children && <p className="mz-noticecard__text">{children}</p>}
      {action && <div className="mz-noticecard__actions">{action}</div>}
    </div>
  );
}
