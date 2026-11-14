/**
 * Stage 5 (S5-A): game-specific live panels for the TV show. Each reads the
 * server's PUBLIC projection of its game only (PublicGame.state), so what it
 * can show is exactly what the server already decided is public.
 */
import { GameClock, TVRing } from "../../ui/mchezo/index.js";
import { TV_HINT } from "./TvShow.js";
import type { PublicGame } from "../../types.js";
import { teamName } from "../../ui/mchezo/lib/charades.js";

interface ClosestPublic { prompt?: string; unit?: string; questionIndex?: number; revealed?: { id: string; prompt: string; unit?: string; answer: number }[] }

/** Closest Wins: the question everyone is answering now (public), the last closed answer. Never anyone's guess. */
export function ClosestTv({ game, title }: { game: PublicGame; title: string }) {
  const st = (game.state ?? {}) as ClosestPublic;
  const last = (st.revealed ?? []).at(-1);
  const n = (st.questionIndex ?? 0) + 1;
  // Stage 5.1 (O-07): this question's answers, from the server. The old ring
  // counted anyone who had ever guessed, so a new question read "3 of 3".
  const done = game.progress?.answeredNow ?? 0;
  const total = game.progress?.total ?? game.totalPlayers ?? game.players.length;
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
        <span className="mz-tvshow-ring" data-testid="tv-live-progress"><b>{done} of {total}</b> {done === 1 ? "has" : "have"} answered question {n}</span>
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

/** Stage 5.1 (O-06): Charades on the TV: who is acting for which team, both teams, and the team scores. Never the prompt. */
export function CharadesTv({ game, title, nameOf }: { game: PublicGame; title: string; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as { actor?: string; actorTeam?: number; teams?: string[][]; teamScores?: number[]; passesThisTurn?: number; teamNames?: string[] };
  const names = st.teamNames;
  const teams = st.teams ?? [];
  const acting = st.actorTeam ?? 0;
  return (
    <section className="mz-tvshow-live" data-testid="tv-live-charades">
      <div className="mz-tvshow-live__left">
        <span className="mz-tv-kicker">Now playing</span>
        <h1 className="mz-tvshow-h1">{title}</h1>
        <p className="mz-tvshow-line" data-testid="tv-charades-actor"><b>{nameOf(st.actor ?? "")}</b> is acting for <b>{teamName(acting, names)}</b>. {teamName(acting, names)} guesses out loud.</p>
        <ul className="mz-tvshow-teams" data-testid="tv-charades-teams">
          {teams.map((t, i) => (
            <li key={i} className={i === acting ? "mz-tvshow-team mz-tvshow-team--on" : "mz-tvshow-team"}>
              <b>{teamName(i, names)}: {st.teamScores?.[i] ?? 0}</b>
              <span>{t.map(nameOf).join(", ")}</span>
            </li>
          ))}
        </ul>
        <p className="mz-tvshow-line mz-tvshow-line--muted">{TV_HINT.charades}</p>
        <div className="mz-tvshow-clock"><GameClock game={game} tv /></div>
      </div>
    </section>
  );
}
