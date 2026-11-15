/**
 * Stage 12.14 (docs/stage12/stage1214.md §2): Know Your Rivals on the phones and the TV.
 *
 *   MchezoKnowYourRivals         answer about yourself (or "Rather not say"); then guess, with your team, how many of
 *                                each other team picked the first option; then the totals and points
 *   MchezoKnowYourRivalsResults, KnowYourRivalsTv, KnowYourRivalsReview
 *
 * Privacy (D-S1214-01): a phone only ever gets its own answer; teams' totals come at the reveal, never who picked what.
 * A team's guesses stay on its own phones until the reveal. Every fact here is the server's.
 */
import { useEffect, useState, type ReactNode } from "react";
import { FeedbackLine, GameHeader } from "../../ui/mchezo/components/GameKit.js";
import { Keycap, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { SendNote } from "./SendNote.js";
import { TeamLabel, TeamScoreboard, teamDef, type TeamScoreRow, teamGameModeLine } from "./TeamGameKit.js";
import { TeamMark } from "./Teams.js";
import type { TeamDef } from "../../../../../src/shared/teams.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface KyrCount { teamId: string; answered: number; a: number; b: number; passed: number }
interface KyrGuess { teamId: string; target: string; guess: number | null; actual: number; size: number; points: number }
interface KyrResult { prompt?: string; a?: string; b?: string; counts: KyrCount[]; guesses: KyrGuess[]; points: { teamId: string; points: number; bonus: number }[] }
export interface KyrView {
  round?: number; roundCount?: number; phase?: "answer" | "guess" | "reveal" | "finished"; teamTotals?: TeamScoreRow[]; catchUp?: string;
  question?: { prompt: string; a: string; b: string }; answered?: number; of?: number;
  sizes?: { teamId: string; answered: number }[]; teamStatus?: { teamId: string; locked: boolean }[];
  result?: KyrResult | null; rounds?: KyrResult[];
  myTeamId?: string; myTotal?: number; myAnswer?: "a" | "b" | "pass"; teamGuesses?: Record<string, { value: number; by: string }>; lockedBy?: string;
}
type Game = { teams?: { list: TeamDef[] } };
type NameOf = (id?: string | null) => string;
const teamName = (game: Game, id?: string | null) => teamDef(game, id)?.name ?? "A team";

/** One team's totals: a two-part bar and the numbers in words. */
function CountBar({ game, c, a, b, testId, mine }: { game: Game; c: KyrCount; a: string; b: string; testId: string; mine?: string }) {
  const def = teamDef(game, c.teamId);
  const pct = c.answered ? (c.a / c.answered) * 100 : 0;
  return (
    <li className={`mz-kyr-count mz-team--${def?.color ?? "coral"}${c.teamId === mine ? " is-mine" : ""}`} data-testid={testId}>
      <span className="mz-kyr-count__head">{def && <TeamMark color={def.color} />}<b>{def?.name ?? "A team"}</b></span>
      {c.answered > 0 ? (
        <span className="mz-kyr-count__bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      ) : null}
      <span className="mz-kyr-count__text">{c.answered > 0 ? `${c.a} ${a} · ${c.b} ${b}` : "Nobody answered"}{c.passed ? ` · ${c.passed} rather not say` : ""}</span>
    </li>
  );
}

const statusOf = (st: KyrView) => (teamId: string): ReactNode => {
  if (st.phase === "answer") return st.catchUp === teamId ? "Catch-up: +15 if you score this round" : null;
  if (st.phase === "guess") return st.teamStatus?.find((x) => x.teamId === teamId)?.locked ? "✓ Guesses locked" : "Guessing…";
  if ((st.phase === "reveal" || st.phase === "finished") && st.result) {
    const p = st.result.points.find((x) => x.teamId === teamId);
    return p ? `+${p.points + p.bonus} this round${p.bonus ? ` (with +${p.bonus} catch-up)` : ""}` : null;
  }
  return null;
};

export interface MchezoKnowYourRivalsDeps {
  game: PlayerGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  landed?: boolean;
}

export function MchezoKnowYourRivals({ game, players, playerId, title, intent, error, landed }: MchezoKnowYourRivalsDeps) {
  const st = (game.state ?? {}) as KyrView;
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  const key = `${st.round ?? 0}:${st.phase ?? ""}`;
  const [pending, setPending] = useState<string | null>(null);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  useEffect(() => { setPending(null); }, [key]);
  const nameOf: NameOf = (id) => (id === playerId ? "You" : players.find((p) => p.id === id)?.displayName ?? "Someone");
  const send = (action: string, payload: Record<string, unknown>, tag: string) => {
    if (pending) return;
    const at = key;
    setPending(tag); setFailedAt(null);
    void (async () => {
      try { if ((await intent(game.id, action, { round: st.round ?? 0, ...payload })) === false) setFailedAt(at); }
      finally { setPending(null); }
    })();
  };
  const q = st.question;
  const scores = <TeamScoreboard game={game} totals={st.teamTotals ?? []} mine={st.myTeamId} status={statusOf(st)} testId="mz-kyr-scores" />;
  const note = <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-kyr-error" />;

  if ((st.phase === "reveal" || st.phase === "finished") && st.result && q) {
    const r = st.result;
    const mineGuesses = r.guesses.filter((g) => g.teamId === st.myTeamId);
    const myPts = r.points.find((p) => p.teamId === st.myTeamId);
    return (
      <main className="mz-screen" aria-label={`${title}: question ${round} of ${of}, the totals`} data-testid="mz-kyr-reveal">
        <GameHeader title={title} objective="How everyone answered" accent={4} />
        <p className="mz-mr-round">Question {round} of {of} · only each team’s totals, never who picked what</p>
        <h2 className="mz-mr-prompt mz-kyr-prompt">{q.prompt}</h2>
        <ul className="mz-kyr-counts" data-testid="mz-kyr-counts">{r.counts.map((c) => <CountBar key={c.teamId} game={game} c={c} a={q.a} b={q.b} mine={st.myTeamId} testId={`mz-kyr-count-${c.teamId}`} />)}</ul>
        {mineGuesses.length > 0 && (
          <section className="mz-card mz-kyr-yours" aria-label="Your team's guesses" data-testid="mz-kyr-yours">
            <span className="mz-kyr-yours__title">Your team’s guesses</span>
            <ul>{mineGuesses.map((g) => <li key={g.target} data-testid={`mz-kyr-yours-${g.target}`}>{teamName(game, g.target)}: you said {g.guess ?? "nothing"}, it was {g.actual} of {g.size}: <b>+{g.points}</b></li>)}</ul>
          </section>
        )}
        {myPts && <p className="mz-mr-mine" data-testid="mz-kyr-mine">Your team: +{myPts.points + myPts.bonus} this round{myPts.bonus ? ` (with +${myPts.bonus} catch-up)` : ""}.</p>}
        {scores}
        <p className="mz-foot">{round < of ? "The next question is coming up." : "That was the last question."}</p>
      </main>
    );
  }

  if (st.phase === "guess" && q) {
    const rivals = (st.sizes ?? []).filter((x) => x.teamId !== st.myTeamId);
    const locked = !!st.lockedBy;
    const missing = rivals.filter((r) => r.answered > 0 && !st.teamGuesses?.[r.teamId]).map((r) => r.teamId);
    return (
      <main className="mz-screen" aria-label={`${title}: question ${round} of ${of}, guess the other teams`} data-testid="mz-kyr-guess">
        <GameHeader title={title} objective="Know your rivals" accent={4} />
        <TeamLabel game={game} teamId={st.myTeamId} testId="mz-kyr-myteam" />
        <p className="mz-mr-round">Question {round} of {of} · guess together: any teammate can set it</p>
        <h2 className="mz-mr-prompt mz-kyr-prompt" data-testid="mz-kyr-guess-prompt">{q.prompt} How many of each team picked <b>{q.a}</b>?</h2>
        <ul className="mz-kyr-rows">
          {rivals.map((r) => {
            const def = teamDef(game, r.teamId);
            const g = st.teamGuesses?.[r.teamId];
            return (
              <li key={r.teamId} className={`mz-kyr-row mz-team--${def?.color ?? "coral"}`} data-testid={`mz-kyr-row-${r.teamId}`}>
                <span className="mz-kyr-row__head">{def && <TeamMark color={def.color} />}<b>{def?.name ?? "A team"}</b><span>{r.answered ? `of the ${r.answered} who answered` : "nobody answered"}</span></span>
                {r.answered > 0 && (
                  <span className="mz-kyr-chips" role="group" aria-label={`How many of ${def?.name ?? "that team"} picked ${q.a}`}>
                    {Array.from({ length: r.answered + 1 }, (_, v) => (
                      <button key={v} type="button" className={`mz-kyr-chip${g?.value === v ? " is-on" : ""}`} aria-pressed={g?.value === v} data-testid={`mz-kyr-pick-${r.teamId}-${v}`}
                        disabled={locked || !!pending} onClick={() => send("rivals-guess", { target: r.teamId, value: v }, `g${r.teamId}${v}`)}>{v}</button>
                    ))}
                  </span>
                )}
                {g && <span className="mz-kyr-row__by" data-testid={`mz-kyr-by-${r.teamId}`}>Set by {nameOf(g.by)}</span>}
              </li>
            );
          })}
        </ul>
        {!locked && missing.length > 0 && <p className="mz-kyr-missing" data-testid="mz-kyr-missing">Still to guess: {missing.map((t) => teamName(game, t)).join(", ")}. A team you don’t guess scores nothing.</p>}
        {locked
          ? <FeedbackLine testId="mz-kyr-locked">{nameOf(st.lockedBy)} locked your team’s guesses. Waiting for the other teams.</FeedbackLine>
          : <Keycap block onClick={() => send("rivals-lock", {}, "lock")} disabled={!!pending} data-testid="mz-kyr-lock">Lock our guesses</Keycap>}
        {note}
        {scores}
      </main>
    );
  }

  const mine = st.myAnswer;
  return (
    <main className="mz-screen" aria-label={`${title}: question ${round} of ${of}, about you`} data-testid="mz-kyr-answer">
      <GameHeader title={title} objective="About you" accent={4} />
      <TeamLabel game={game} teamId={st.myTeamId} testId="mz-kyr-myteam" />
      <p className="mz-mr-round" data-testid="mz-kyr-round">Question {round} of {of} · private: only your team’s total is ever shown</p>
      <h2 className="mz-mr-prompt mz-kyr-prompt" data-testid="mz-kyr-prompt">{q?.prompt}</h2>
      <div className="mz-kyr-ab" role="group" aria-label="Your answer">
        {(["a", "b"] as const).map((k) => (
          <button key={k} type="button" className={`mz-kyr-choice${mine === k ? " is-on" : ""}`} aria-pressed={mine === k} data-testid={`mz-kyr-${k}`} disabled={!!pending}
            onClick={() => send("rivals-answer", { choice: k }, k)}>{k === "a" ? q?.a : q?.b}</button>
        ))}
      </div>
      <button type="button" className={`mz-chip-btn mz-kyr-pass${mine === "pass" ? " is-on" : ""}`} aria-pressed={mine === "pass"} data-testid="mz-kyr-pass" disabled={!!pending} onClick={() => send("rivals-answer", { choice: "pass" }, "pass")}>Rather not say</button>
      <FeedbackLine testId="mz-kyr-mine">{mine ? `You said: ${mine === "a" ? q?.a : mine === "b" ? q?.b : "rather not say"}. You can change it until everyone has answered.` : "Pick one. Nobody sees your answer, only your team’s total."}</FeedbackLine>
      {st.of ? <p className="mz-kyr-progress" data-testid="mz-kyr-progress">{st.answered ?? 0} of {st.of} answered</p> : null}
      {note}
      {scores}
    </main>
  );
}

function RoundList({ game, rounds, mine, testId }: { game: Game; rounds: readonly KyrResult[]; mine?: string; testId: string }) {
  return (
    <ol className="mz-mr-recap">
      {rounds.map((r, i) => (
        <li key={i} data-testid={`${testId}-round`}>
          <span className="mz-foot" style={{ textAlign: "left" }}>Question {i + 1}: {r.prompt}</span>
          <span className="mz-mr-recap__line">{r.counts.map((c) => `${teamName(game, c.teamId)}${c.teamId === mine ? " (you)" : ""} ${c.a} ${r.a} · ${c.b} ${r.b}`).join(" | ")}</span>
          <span className="mz-mr-recap__line">{r.points.map((p) => `${teamName(game, p.teamId)} +${p.points + p.bonus}`).join(" · ")}</span>
        </li>
      ))}
    </ol>
  );
}

export function MchezoKnowYourRivalsResults({ game, publicGame, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as KyrView;
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-kyr-results">
      {hero}
      {next}
      <GameHeader title={title} objective="Every question, every team" accent={4} />
      <RoundList game={game} rounds={st.rounds ?? []} mine={st.myTeamId} testId="mz-kyr-recap" />
      <p className="mz-foot" data-testid="mz-kyr-howscore">Up to 30 points for each other team you guessed: exact scores 30, less the further off. Only each team’s totals were ever shown. Everyone scores their team’s points. {teamGameModeLine(casual, game.official ?? publicGame?.official)}</p>
      <OutcomeSummary gameId="know-your-rivals" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV (not zoomed, sized in the 1920 x 1080 canvas's pixels): the question; how many have answered (never what); which
 *  teams have locked; then each team's totals and points. Never a player's own answer or a team's guess before the reveal. */
export function KnowYourRivalsTv({ game, title }: { game: PublicGame; title: string }) {
  const st = (game.state ?? {}) as KyrView;
  const round = (st.round ?? 0) + 1;
  const q = st.question;
  const reveal = (st.phase === "reveal" || st.phase === "finished") && st.result;
  return (
    <section className="mz-tvshow-kyr" data-testid="tv-live-know-your-rivals">
      <div className="mz-tvshow-kyr__main">
        <span className="mz-tv-kicker">{title} · question {round} of {st.roundCount ?? 0}{st.phase === "guess" ? " · the guesses" : reveal ? " · the totals" : ""}</span>
        <h1 className="mz-tvshow-h1" data-testid="tv-kyr-prompt">{q?.prompt}</h1>
        {st.phase === "answer" && <p className="mz-tvshow-line" data-testid="tv-kyr-progress"><b>{st.answered ?? 0} of {st.of ?? 0}</b> answered. Nobody sees your answer, only your team’s total.</p>}
        {st.phase === "guess" && <p className="mz-tvshow-line" data-testid="tv-kyr-progress">Each team guesses: how many of the other teams picked <b>{q?.a}</b>?</p>}
        {reveal && q && <ul className="mz-kyr-counts mz-kyr-counts--tv" data-testid="tv-kyr-counts">{st.result!.counts.map((c) => <CountBar key={c.teamId} game={game} c={c} a={q.a} b={q.b} testId={`tv-kyr-count-${c.teamId}`} />)}</ul>}
      </div>
      <TeamScoreboard game={game} totals={st.teamTotals ?? []} status={statusOf(st)} tv testId="tv-kyr-scores" />
    </section>
  );
}

export function KnowYourRivalsReview({ game }: { game: PublicGame }) {
  const st = (game.state ?? {}) as KyrView;
  return <div data-testid="tv-kyr-review"><RoundList game={game} rounds={st.rounds ?? []} testId="tv-kyr-review" /></div>;
}
