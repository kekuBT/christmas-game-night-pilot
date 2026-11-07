// Numeric-guess control: a dial plus a typed field that share ONE value,
// with ONE Submit button labelled with exactly the value it will send.
//
// E1 (Content Quality 2.0) rebuilt the input so every correct answer can
// be entered:
// - The range is the game's fixed, game-wide range (src/shared/
//   numericInput.ts), never derived from the question's answer.
// - Typing never clamps or rounds. An out-of-range or over-precise entry
//   shows a plain message and disables Submit until it is fixed, so no
//   value is ever silently changed (the old field snapped 5,570 to 1,000).
// - The field is type="text" with inputMode "decimal"/"numeric": phones
//   show a number pad with a decimal key, and "5 570", "5,570", "42.195"
//   and "42,195"-style entries are read by parseNumericEntry. The Submit
//   label shows the value as read, so a misreading is visible.
// - Closest Wins' dial is logarithmic (0 … a trillion): every order of
//   magnitude gets the same share of the track. Guess the Year's dial is
//   linear, with ±1 / ±10 nudge buttons for exact years on a phone.
import { useState } from "react";
import { Keycap } from "./primitives.js";
import { formatNumeric, NUMERIC_INPUT, parseNumericEntry, type NumericGameId } from "../../../../../../src/shared/numericInput.js";

export interface NumericGuessProps {
  game: NumericGameId;
  initial: number;
  dialAriaLabel: string;
  fieldLabel: string;
  submitLabel: string;
  hint: string;
  onSubmit: (value: number) => void;
}

const STEPS = 1000;

function sig2(n: number): number {
  if (n < 10) return Math.round(n);
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

export function NumericGuess(props: NumericGuessProps) {
  const spec = NUMERIC_INPUT[props.game];
  const year = props.game === "guess-the-year";
  const show = (v: number) => formatNumeric(v, { year });
  const logMax = Math.log10(spec.max + 1);
  const toDial = (v: number) => Math.round(year ? ((v - spec.min) / (spec.max - spec.min)) * STEPS : (Math.log10(v + 1) / logMax) * STEPS);
  const fromDial = (p: number) => (year ? Math.round(spec.min + (p / STEPS) * (spec.max - spec.min)) : sig2(10 ** ((p / STEPS) * logMax) - 1));

  const [text, setText] = useState(String(props.initial));
  const parsed = parseNumericEntry(props.game, text);
  const value = parsed.ok ? parsed.value : undefined;
  const set = (v: number) => setText(String(v));
  const nudge = (d: number) => value !== undefined && set(value + d);
  const canNudge = (d: number) => value !== undefined && value + d >= spec.min && value + d <= spec.max;

  return (
    <div className="mz-num">
      <p className="mz-muted">{props.hint}</p>
      <div className="mz-num__dial">
        <input
          type="range" min={0} max={STEPS} step={1}
          value={value === undefined ? 0 : toDial(value)}
          aria-label={props.dialAriaLabel}
          aria-valuetext={value === undefined ? "No value" : show(value)}
          data-testid="mz-num-dial"
          onChange={(e) => set(fromDial(Number(e.target.value)))}
        />
        <b data-testid="mz-num-value">{value === undefined ? "–" : show(value)}</b>
      </div>
      {year && (
        <div className="mz-num__nudges" role="group" aria-label="Adjust the year">
          {[-10, -1, 1, 10].map((d) => (
            <button key={d} type="button" className="mz-chip-btn" data-testid={`mz-num-nudge-${d}`} disabled={!canNudge(d)} onClick={() => nudge(d)} aria-label={`${Math.abs(d)} ${Math.abs(d) === 1 ? "year" : "years"} ${d < 0 ? "earlier" : "later"}`}>
              {d > 0 ? `+${d}` : `−${-d}`}
            </button>
          ))}
        </div>
      )}
      <label className="mz-num__field">
        <span className="mz-sr">{props.fieldLabel}</span>
        <input
          type="text"
          inputMode={spec.decimals > 0 ? "decimal" : "numeric"}
          enterKeyHint="done"
          autoComplete="off"
          className="mz-input"
          value={text}
          aria-invalid={!parsed.ok}
          aria-describedby="mz-num-error"
          data-testid="mz-num-input"
          onChange={(e) => setText(e.target.value)}
          placeholder={props.fieldLabel}
        />
      </label>
      <p id="mz-num-error" className="mz-num__error" role="status" aria-live="polite" data-testid="mz-num-error">{parsed.ok ? "" : parsed.message}</p>
      <div style={{ display: "grid", gap: 8 }}>
        <Keycap block data-testid="mz-num-submit" disabled={value === undefined} onClick={() => value !== undefined && props.onSubmit(value)}>
          {props.submitLabel}{value === undefined ? "" : ` ${show(value)}`}
        </Keycap>
      </div>
    </div>
  );
}
