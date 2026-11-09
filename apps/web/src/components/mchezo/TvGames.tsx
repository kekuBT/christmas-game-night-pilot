/**
 * Stage 5 (S5-A): game-specific live panels for the TV show. Each reads the
 * server's PUBLIC projection of its game only (PublicGame.state), so what it
 * can show is exactly what the server already decided is public.
 */
import { GameClock, TVRing } from "../../ui/mchezo/index.js";
import { TV_HINT } from "./TvShow.js";
import type { PublicGame } from "../../types.js";

interface ClosestPublic { prompt?: string; unit?: string; questionIndex?: number; revealed?: { id: string; prompt: string; unit?: string; answer: number }[] }

/** Closest Wins: the question everyone is answering now (public), the last closed answer. Never anyone's guess. */
export function ClosestTv({ game, title }: { game: PublicGame; title: string }) {
  const st = (game.state ?? {}) as ClosestPublic;
  const last = (st.revealed ?? []).at(-1);
  const n = (st.questionIndex ?? 0) + 1;
  const done = game.submittedCount ?? 0;
  const total = game.totalPlayers ?? game.players.length;
  return (
    <section className="mz-tvshow-live" data-testid="tv-live-closest-wins">
      <div className="mz-tvshow-live__left">
        <span className="mz-tv-kicker">{title} · question {n}</span>
        <h1 className="mz-tvshow-h1" data-testid="tv-closest-prompt">{st.prompt ?? "…"}</h1>
        {st.unit && <p className="mz-tvshow-line mz-tvshow-line--muted">Answer in {st.unit}</p>}
        {last && <p className="mz-tvshow-line" data-testid="tv-closest-last">Last question: {last.prompt} — <b>{last.answer.toLocaleString()}{last.unit ? ` ${last.unit}` : ""}</b></p>}
        <div className="mz-tvshow-clock"><GameClock game={game} tv /></div>
      </div>
      <TVRing value={done} total={Math.max(1, total)} color="var(--mz-answer-1)">
        <span className="mz-tvshow-ring" data-testid="tv-live-progress"><b>{done} of {total}</b> have guessed</span>
      </TVRing>
    </section>
  );
}

const IMPOSTOR_PHASE: Record<string, string> = {
  clue: "Everyone is writing a clue",
  vote: "Vote: who is the impostor?",
  guess: "The accused impostor gets one guess",
  finished: "Round over",
};

/** Impostor: the phase and how many clues are in. Never a word, never a clue's text. */
export function ImpostorTv({ game, title }: { game: PublicGame; title: string }) {
  const st = (game.state ?? {}) as { phase?: string; clues?: Record<string, string>; winner?: string };
  const clues = Object.keys(st.clues ?? {}).length;
  return (
    <section className="mz-tvshow-live" data-testid="tv-live-impostor">
      <div className="mz-tvshow-live__left">
        <span className="mz-tv-kicker">Now playing</span>
        <h1 className="mz-tvshow-h1">{title}</h1>
        <p className="mz-tvshow-line" data-testid="tv-impostor-phase">{IMPOSTOR_PHASE[st.phase ?? ""] ?? "In play"}</p>
        {st.phase !== "clue" && <p className="mz-tvshow-line mz-tvshow-line--muted">{clues} {clues === 1 ? "clue is" : "clues are"} in — read them on your phones.</p>}
        <p className="mz-tvshow-line mz-tvshow-line--muted">{TV_HINT.impostor}</p>
        <div className="mz-tvshow-clock"><GameClock game={game} tv /></div>
      </div>
    </section>
  );
}
