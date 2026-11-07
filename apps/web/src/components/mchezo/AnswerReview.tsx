/**
 * E3 (Content Quality 2.0): the answers, and why — shown only from what
 * the server has already revealed. The server sends answers for a finished
 * game (all answers locked), or for a Closest Wins question that has closed,
 * and nothing else. This component never infers an answer; if the
 * projection carries none, it renders nothing.
 *
 * Used on the phone results screen (with "you answered …") and on the TV
 * dashboard (answers only, no player's choices).
 */
import { formatNumeric } from "../../../../../src/shared/numericInput.js";
import type { PlayerGame, PublicGame } from "../../types.js";
import { asRecord } from "../../types.js";

export interface ReviewRow { id: string; prompt: string; answer: string; mine?: string; ok?: boolean; detail?: string; explanation?: string }

type Q = { id: string; prompt: string; options?: (string | number)[]; correctIndex?: number; explanation?: string };
type Ev = { id: string; event: string; year?: number; context?: string };
type Closed = { id: string; prompt: string; unit?: string; answer?: number; explanation?: string; myGuess?: number; myAbstained?: boolean };

/** Rows for one game from its projection. `player` adds the viewer's own choices. */
export function reviewRows(game: PublicGame | PlayerGame, player?: PlayerGame, publicGame?: PublicGame): ReviewRow[] {
  const st = asRecord(player?.state ?? game.state);
  switch (game.gameId) {
    case "trivia":
    case "geography":
    case "who-said-that": {
      const mineBy = (st["myAnswers"] ?? {}) as Record<string, number>;
      return ((st["questions"] ?? []) as Q[]).filter((q) => q.correctIndex !== undefined).map((q) => {
        const opts = (q.options ?? []).map(String);
        const pick = player ? mineBy[q.id] : undefined;
        return {
          id: q.id, prompt: q.prompt, answer: opts[q.correctIndex!] ?? "—", explanation: q.explanation,
          ...(player ? { mine: pick === undefined ? "no answer" : opts[pick] ?? "—", ok: pick === q.correctIndex } : {}),
        };
      });
    }
    case "guess-the-year": {
      const mineBy = (st["myGuesses"] ?? {}) as Record<string, number>;
      return ((st["events"] ?? []) as Ev[]).filter((e) => e.year !== undefined).map((e) => {
        const g = player ? mineBy[e.id] : undefined;
        return {
          id: e.id, prompt: e.event, answer: String(e.year), explanation: e.context,
          ...(player ? { mine: g === undefined ? "no guess" : String(g), ok: g === e.year, detail: g === undefined ? undefined : g === e.year ? "exact" : `${Math.abs(g - e.year!)} year${Math.abs(g - e.year!) === 1 ? "" : "s"} off` } : {}),
        };
      });
    }
    case "closest-wins":
      return ((st["revealed"] ?? []) as Closed[]).filter((r) => r.answer !== undefined).map((r) => {
        const unit = r.unit ? ` ${r.unit}` : "";
        return {
          id: r.id, prompt: r.prompt, answer: `${formatNumeric(r.answer!)}${unit}`, explanation: r.explanation,
          ...(player ? { mine: r.myGuess === undefined ? (r.myAbstained ? "sat out" : "no guess") : `${formatNumeric(r.myGuess)}${unit}` } : {}),
        };
      });
    case "math-mayhem": {
      const qs = (publicGame ?? (game as PublicGame)).questions ?? [];
      return qs.filter((q) => q.correctAnswer !== undefined).map((q) => {
        const pick = player?.myAnswers?.[q.id];
        const opts = (q.options ?? []).map(String);
        return {
          id: q.id, prompt: q.prompt, answer: String(q.correctAnswer),
          ...(player ? { mine: pick === undefined || pick === null ? "no answer" : opts[pick] ?? "—", ok: pick !== undefined && pick !== null && Number(opts[pick]) === q.correctAnswer } : {}),
        };
      });
    }
    default:
      return [];
  }
}

export function AnswerReview({ rows, title = "Answers", tv = false, testId = "mz-answer-review" }: { rows: ReviewRow[]; title?: string; tv?: boolean; testId?: string }) {
  if (rows.length === 0) return null;
  return (
    <section className={`mz-review${tv ? " mz-review--tv" : ""}`} aria-label={title} data-testid={testId}>
      <h3 className="mz-review__title">{title}</h3>
      <ol className="mz-review__list">
        {rows.map((r) => (
          <li key={r.id} className="mz-review__item" data-testid="mz-review-item">
            <p className="mz-review__prompt">{r.prompt}</p>
            <p className="mz-review__answer">Answer: <b data-testid="mz-review-answer">{r.answer}</b></p>
            {r.mine !== undefined && (
              <p className="mz-review__mine" data-testid="mz-review-mine">
                You: {r.mine}{r.ok === true ? " ✓" : r.ok === false && r.detail === undefined && !/^no /.test(r.mine) ? " ✗" : ""}{r.detail ? ` (${r.detail})` : ""}
              </p>
            )}
            {r.explanation && <p className="mz-review__why" data-testid="mz-review-why">{r.explanation}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
