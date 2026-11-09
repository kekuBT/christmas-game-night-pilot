import { useId, useState } from 'react';

export interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  label?: string;
  hint?: string;
  /** Allowed characters; defaults to A–Z (room codes avoid digits to reduce confusion). */
  pattern?: RegExp;
}

/**
 * Room-code entry: visible keycap tiles over a single real <input>, so native
 * keyboards, paste, autofill and screen readers all work.
 */
export function CodeInput({ value, onChange, length = 4, label = 'Room code', hint = 'Letters and numbers on the host’s screen', pattern = /[^A-Z]/g }: CodeInputProps) {
  const id = useId();
  const [focus, setFocus] = useState(false);
  const chars = value.split('');
  return (
    <div className="mz-field">
      <label htmlFor={id} className="mz-field__label">{label}</label>
      <div className="mz-code" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {Array.from({ length }, (_, k) => {
          const active = focus && k === Math.min(length - 1, value.length);
          return (
            <span key={k} aria-hidden="true" className={['mz-code__tile', chars[k] ? 'mz-code__tile--filled' : '', active ? 'mz-code__tile--active' : ''].join(' ')}>
              {chars[k] ?? ''}
            </span>
          );
        })}
        <input
          id={id}
          className="mz-code__input"
          value={value}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={length}
          aria-describedby={hint ? id + '-hint' : undefined}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(pattern, '').slice(0, length))}
        />
      </div>
      {hint && <span id={id + '-hint'} className="mz-field__hint">{hint}</span>}
    </div>
  );
}
