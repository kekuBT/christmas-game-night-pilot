// Numeric-guess control (Milestone J.3 primitive) — a dial plus a
// number field, both submitting the same guess. Shared by Closest
// Wins today (dial 0–1000) and Guess the Year next (timeline
// 1900–2025): the two games have the same input shape, so one
// component serves both instead of a copied branch per game. Games
// that answer differently (text, tiles, choices, performance) do not
// use this component and are never forced into it.
// State is component-local (dial + number). The old panel shared one
// number field across games at App level; this component does not —
// the field starts empty per mount, which is input hygiene, not a
// rule change. An empty number field submits 0, exactly as the old
// panel did (Number("") === 0); that behavior is preserved, not fixed.
import { useState } from "react";
import { Keycap } from "./primitives.js";

export interface NumericGuessProps {
  min: number;
  max: number;
  initial: number;
  dialAriaLabel: string;
  numberPlaceholder: string;
  submitLabel: string;
  dialSubmitLabel: (value: number) => string;
  hint: string;
  onSubmit: (value: number) => void;
}

export function NumericGuess(props: NumericGuessProps) {
  const [dialValue, setDialValue] = useState(props.initial);
  const [numInput, setNumInput] = useState("");
  return (
    <div>
      <p className="mz-muted">{props.hint}</p>
      <div>
        <input type="range" min={props.min} max={props.max} value={dialValue} aria-label={props.dialAriaLabel} data-testid="mz-num-dial" onChange={(e) => setDialValue(Number(e.target.value))} />
        <b data-testid="mz-num-value">{dialValue}</b>
      </div>
      <div>
        <input type="number" className="mz-input" value={numInput} data-testid="mz-num-input" onChange={(e) => setNumInput(e.target.value)} placeholder={props.numberPlaceholder} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <Keycap block data-testid="mz-num-submit" onClick={() => props.onSubmit(Number(numInput))}>{props.submitLabel}</Keycap>
        <Keycap block variant="neutral" data-testid="mz-num-dial-submit" onClick={() => props.onSubmit(dialValue)}>{props.dialSubmitLabel(dialValue)}</Keycap>
      </div>
    </div>
  );
}
