// Numeric-guess control (Milestone J.3 primitive, unified in Work
// Package B) — a dial plus a number field that share ONE value, with
// ONE primary Submit button labelled with that value. The two-button
// version held two independent values (the dial and the field), so
// "Submit guess" and "Submit dial guess {v}" sent different numbers
// and the player could not tell at a glance which value each button
// sent. Unifying the state removes the ambiguity: the dial sets the
// value, the field edits it, and the displayed value is always the
// value that will be submitted. The old "empty field submits 0"
// quirk is gone with the unification — the value is never invisible
// (the button, the dial readout, and the field after blur all show
// it). The field's text is a draft while typing; on blur it resets
// to the value. Out-of-range input is clamped visibly (the field
// snaps to the clamped value), so no value is silently changed.
// Shared by Closest Wins today (dial 0–1000) and Guess the Year
// next (timeline 1896–2025): the two games have the same input
// shape, so one component serves both instead of a copied branch
// per game. Games that answer differently (text, tiles, choices,
// performance) do not use this component and are never forced into it.
import { useState } from "react";
import { Keycap } from "./primitives.js";

export interface NumericGuessProps {
  min: number;
  max: number;
  initial: number;
  dialAriaLabel: string;
  numberPlaceholder: string;
  submitLabel: string;
  hint: string;
  onSubmit: (value: number) => void;
}

export function NumericGuess(props: NumericGuessProps) {
  const [value, setValue] = useState(props.initial);
  const [text, setText] = useState(String(props.initial));
  const clamp = (n: number) => Math.min(props.max, Math.max(props.min, n));
  const setFromDial = (v: number) => { setValue(v); setText(String(v)); };
  const onFieldChange = (t: string) => {
    setText(t);
    const n = Number(t);
    if (t !== "" && Number.isFinite(n)) {
      const c = clamp(Math.trunc(n));
      setValue(c);
      if (c !== n) setText(String(c));
    }
  };
  return (
    <div>
      <p className="mz-muted">{props.hint}</p>
      <div>
        <input type="range" min={props.min} max={props.max} value={value} aria-label={props.dialAriaLabel} data-testid="mz-num-dial" onChange={(e) => setFromDial(Number(e.target.value))} />
        <b data-testid="mz-num-value">{value}</b>
      </div>
      <div>
        <input type="number" className="mz-input" value={text} data-testid="mz-num-input" onChange={(e) => onFieldChange(e.target.value)} onBlur={() => setText(String(value))} placeholder={props.numberPlaceholder} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <Keycap block data-testid="mz-num-submit" onClick={() => props.onSubmit(value)}>{props.submitLabel} {value}</Keycap>
      </div>
    </div>
  );
}
