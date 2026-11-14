/**
 * Stage 12.11 (docs/stage12/stage1211.md §2): Team Draw on the phones and the TV.
 *
 *   MchezoTeamDraw         the drawer's pad and the word; a guesser's view of their own team's drawing and the guess box;
 *                          then the reveal, with every team's drawing side by side
 *   MchezoTeamDrawResults  every round's word with each team's result (the team results card comes in the hero)
 *   TeamDrawTv, TeamDrawReview
 *
 * Secrecy (D-S1211-02): the server sends the word to the current drawer only, and each phone only its own team's
 * drawing and wrong guesses. The TV and other teams see each team's status (who draws, strokes so far, solved), never a
 * drawing or the word, until the reveal. Every fact here is the server's.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FeedbackLine, GameHeader } from "../../ui/mchezo/components/GameKit.js";
import { Keycap, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { SendNote } from "./SendNote.js";
import { DrawBoard, DrawPad, Letters, type DrawPadActions, type DrawPiece } from "./MchezoDraw.js";
import { ORDINAL, TeamLabel, TeamScoreboard, ordinal, teamDef, useServerNow, type TeamScoreRow } from "./TeamGameKit.js";
import { TeamMark } from "./Teams.js";
import type { TeamDef } from "../../../../../src/shared/teams.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface TdStatus { teamId: string; drawerId: string | null; strokes: number; solved: boolean; place?: number; guesses: number; handoff?: "pass" | "takeover" }
interface TdTeamResult { teamId: string; drawers: string[]; solved: boolean; place: number | null; points: number; bonus: number; solvedBy?: string; seconds?: number; pieces?: DrawPiece[] }
interface TdRecap { word?: string; teams?: TdTeamResult[] }
interface TdHandoff { from: string; to: string; how: "pass" | "takeover" }
export interface TeamDrawView {
  round?: number; roundCount?: number; phase?: "draw" | "reveal" | "finished"; letters?: number[];
  teamStatus?: TdStatus[]; teamTotals?: TeamScoreRow[]; result?: TdRecap; rounds?: TdRecap[];
  myTeamId?: string; myTotal?: number; drawerId?: string; amDrawing?: boolean; myWord?: string; canPass?: boolean; passTo?: string;
  pieces?: DrawPiece[]; teamGuesses?: { by: string; text: string }[]; guessesLeft?: number; lockMs?: number; lockedUntil?: number;
  handoff?: TdHandoff; sawWord?: boolean; canGuess?: boolean; takeoverAt?: number; canTakeOver?: boolean; myGuesses?: number;
  mySolved?: boolean; myPlace?: number; solvedBy?: string;
}

export const TEAM_DRAW_ACTIONS: DrawPadActions = { strokes: "team-draw-strokes", undo: "team-draw-undo", clear: "team-draw-clear" };

type NameOf = (id?: string | null) => string;

/** One team's line in a round's result. */
function resultLine(r: TdTeamResult): string {
  if (!r.solved) return "didn’t get it";
  return `got it ${r.place ? ordinal(r.place) : ""}${r.seconds !== undefined ? ` in ${r.seconds} s` : ""}: +${r.points}${r.bonus ? ` (with +${r.bonus} catch-up)` : ""}`;
}

const drewLine = (r: TdTeamResult, nameOf: NameOf) => (r.drawers.length ? `${r.drawers.map(nameOf).join(" and ")} drew` : "nothing drawn");

/** Every team's drawing side by side (the reveal), each with its team, who drew and its result. */
function Gallery({ game, r, mine, nameOf, testId, totals, tv }: { game: { teams?: { list: TeamDef[] } }; r: TdRecap; mine?: string; nameOf: NameOf; testId: string; totals?: readonly TeamScoreRow[]; tv?: boolean }) {
  const teams = r.teams ?? [];
  return (
    <ul className={`mz-td-gallery${tv ? " mz-td-gallery--tv" : ""}`} data-testid={testId} data-teams={teams.length}>
      {teams.map((t) => {
        const def = teamDef(game, t.teamId);
        return (
          <li key={t.teamId} className={`mz-td-gallery__team mz-team--${def?.color ?? "coral"}${t.teamId === mine ? " is-mine" : ""}`} data-testid={`${testId}-${t.teamId}`}>
            <DrawBoard pieces={t.pieces ?? []} label={`${def?.name ?? "A team"}'s drawing of ${r.word ?? "the word"}`} testId={`${testId}-board-${t.teamId}`} />
            <span className="mz-td-gallery__text">
              {def && <TeamMark color={def.color} />}
              <span><b>{def?.name ?? "A team"}{t.teamId === mine ? " · you" : ""}</b><span>{drewLine(t, nameOf)}</span><span>{resultLine(t)}{totals ? ` · total ${totals.find((x) => x.teamId === t.teamId)?.score ?? 0}` : ""}</span></span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Each team's result for one round, as text (results screen and TV review). */
function TeamLines({ game, r, mine, nameOf, testId }: { game: { teams?: { list: TeamDef[] } }; r: TdRecap; mine?: string; nameOf: NameOf; testId: string }) {
  return (
    <ul className="mz-hd-teams" data-testid={testId}>
      {(r.teams ?? []).map((t) => {
        const def = teamDef(game, t.teamId);
        return (
          <li key={t.teamId} className={`mz-hd-team mz-team--${def?.color ?? "coral"}${t.teamId === mine ? " is-mine" : ""}`} data-testid={`${testId}-${t.teamId}`}>
            {def && <TeamMark color={def.color} />}
            <span className="mz-hd-team__text"><b>{def?.name ?? "A team"}</b><span>{drewLine(t, nameOf)} · {resultLine(t)}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

const statusOf = (st: TeamDrawView, nameOf: NameOf) => (teamId: string): ReactNode => {
  const s = st.teamStatus?.find((x) => x.teamId === teamId);
  if (!s) return null;
  if (s.solved) return `✓ Got it ${s.place ? ORDINAL[s.place - 1] ?? "" : ""}`.trim();
  const who = nameOf(s.drawerId);
  return s.strokes > 0 ? `${who} drawing · ${s.strokes} ${s.strokes === 1 ? "stroke" : "strokes"}` : `Waiting for ${who} to draw`;
};

/** "Ama passed the pen to you" / "Ben took the pen from Ama". */
function handoffLine(h: TdHandoff, nameOf: NameOf): string {
  return h.how === "pass" ? `${nameOf(h.from)} passed the pen to ${nameOf(h.to) === "You" ? "you" : nameOf(h.to)}.` : `${nameOf(h.to)} took the pen from ${nameOf(h.from) === "You" ? "you" : nameOf(h.from)}.`;
}

function GuessList({ st, nameOf }: { st: TeamDrawView; nameOf: NameOf }) {
  const list = st.teamGuesses ?? [];
  if (!list.length) return null;
  return (
    <ul className="mz-td-guesses" aria-label="Your team’s wrong guesses" data-testid="mz-td-guesses">
      {list.slice(-8).map((g, i) => <li key={i}>{nameOf(g.by)}: <s>{g.text}</s></li>)}
    </ul>
  );
}

export interface MchezoTeamDrawDeps {
  game: PlayerGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  landed?: boolean;
}

export function MchezoTeamDraw({ game, players, playerId, title, intent, error, landed }: MchezoTeamDrawDeps) {
  const st = (game.state ?? {}) as TeamDrawView;
  const now = useServerNow();
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  const key = `${st.round ?? 0}:${st.phase ?? ""}`;
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(""); setPending(false); setFailedAt(null); }, [key]);
  const nameOf: NameOf = (id) => (id === playerId ? "You" : players.find((p) => p.id === id)?.displayName ?? "Someone");
  const teamLabel = <TeamLabel game={game} teamId={st.myTeamId} testId="mz-td-myteam" />;
  const scores = <TeamScoreboard game={game} totals={st.teamTotals ?? []} mine={st.myTeamId} status={st.phase === "draw" ? statusOf(st, nameOf) : undefined} testId="mz-td-scores" />;
  const handoff = st.handoff ? <p className="mz-td-handoff" role="status" data-testid="mz-td-handoff">{handoffLine(st.handoff, nameOf)}</p> : null;
  const once = (action: string, payload: Record<string, unknown>) => {
    if (busy) return;
    const at = key;
    setBusy(true); setFailedAt(null);
    void (async () => {
      try { if ((await intent(game.id, action, payload)) === false) setFailedAt(at); }
      finally { setBusy(false); }
    })();
  };

  if ((st.phase === "reveal" || st.phase === "finished") && st.result) {
    const r = st.result;
    const mine = r.teams?.find((t) => t.teamId === st.myTeamId);
    const myLine = !mine ? "" : mine.solved ? `Your team got it, ${ordinal(mine.place ?? 1)}: +${mine.points}${mine.bonus ? ` (including +${mine.bonus} catch-up)` : ""}.` : "Your team didn’t get this one.";
    return (
      <main className="mz-screen" aria-label={`${title}: round ${round} of ${of}, the reveal`} data-testid="mz-td-reveal">
        <GameHeader title={title} objective="Every team’s drawing" accent={5} />
        <p className="mz-mr-round">Round {round} of {of}</p>
        <h2 className="mz-mr-prompt mz-td-answer" data-testid="mz-td-answer">It was: {r.word}</h2>
        <p className="mz-mr-mine" data-testid="mz-td-mine">{myLine}</p>
        <Gallery game={game} r={r} mine={st.myTeamId} nameOf={nameOf} testId="mz-td-gallery" />
        {scores}
        <p className="mz-foot">{round < of ? "The next word is coming up." : "That was the last word."}</p>
      </main>
    );
  }

  const solvedLine = st.mySolved ? `Your team got it${st.myPlace ? `, ${ordinal(st.myPlace)}` : ""}${st.solvedBy ? ` (${nameOf(st.solvedBy)})` : ""}! Waiting for the other teams.` : null;

  if (st.amDrawing && st.myWord) {
    const wrong = st.teamGuesses?.length ?? 0;
    return (
      <main className="mz-screen" aria-label={`${title}: your turn to draw, round ${round} of ${of}`} data-testid="mz-td-draw">
        <GameHeader title={title} objective="Your turn to draw" accent={5} />
        {teamLabel}
        <p className="mz-mr-round">Round {round} of {of} · only you can see the word · every team draws it</p>
        <p className="mz-dg-secret" data-testid="mz-td-word">Draw: <b>{st.myWord}</b></p>
        {handoff}
        <DrawPad gameId={game.id} pieces={st.pieces ?? []} turnKey={`${st.round ?? 0}:${st.drawerId ?? ""}`} intent={intent} actions={TEAM_DRAW_ACTIONS} extra={{ round: st.round ?? 0 }} footer={({ unsent, busy: padBusy, run }) => (
          <>
            <FeedbackLine testId="mz-td-status">{solvedLine ?? (wrong ? `Your team has guessed ${wrong} ${wrong === 1 ? "time" : "times"}: not yet!` : "Draw it! Your teammates guess from your drawing.")}{unsent ? " · sending…" : ""}</FeedbackLine>
            {st.canPass && st.passTo && (
              <div className="mz-dg-row">
                <button type="button" className="mz-chip-btn" data-testid="mz-td-pass" disabled={padBusy || busy} onClick={() => run("team-draw-pass", "pass")}>Pass the pen to {nameOf(st.passTo)}</button>
              </div>
            )}
          </>
        )} />
        <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-td-error" />
        <GuessList st={st} nameOf={nameOf} />
        {scores}
      </main>
    );
  }

  const lockedFor = st.lockedUntil ? Math.max(0, Math.ceil((st.lockedUntil - now) / 1000)) : 0;
  const locked = lockedFor > 0;
  const outOfGuesses = (st.guessesLeft ?? 1) <= 0;
  const drawer = nameOf(st.drawerId);
  const waitingInk = !st.canGuess && !st.sawWord && !st.mySolved && (st.pieces?.length ?? 0) === 0;
  const canTake = !st.mySolved && st.takeoverAt !== undefined && now >= st.takeoverAt;
  const status = solvedLine
    ?? (st.sawWord ? "You’ve seen the word this round, so you can’t guess it. Cheer your team on!"
      : outOfGuesses ? "Your team has used all its guesses for this round. The word comes soon."
      : waitingInk ? `Waiting for ${drawer} to start drawing…`
      : "Say your ideas out loud too: the first right guess counts for your whole team.");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || pending || locked || !st.canGuess || outOfGuesses) return;
    const at = key;
    setPending(true); setFailedAt(null);
    void (async () => {
      try { if ((await intent(game.id, "team-draw-guess", { round: st.round ?? 0, text: t })) === false) setFailedAt(at); else setText(""); }
      finally { setPending(false); input.current?.focus(); }
    })();
  };
  return (
    <main className="mz-screen" aria-label={`${title}: round ${round} of ${of}, ${drawer} is drawing for your team`} data-testid="mz-td-guess">
      <GameHeader title={title} objective={st.mySolved ? "Your team got it!" : "What is your team drawing?"} accent={5} />
      {teamLabel}
      <p className="mz-mr-round" data-testid="mz-td-round">Round {round} of {of} · {drawer === "You" ? "you were drawing" : `${drawer} is drawing for your team`}</p>
      {handoff}
      <DrawBoard pieces={st.pieces ?? []} label={`${drawer}'s drawing so far`} testId="mz-td-board" />
      <Letters letters={st.letters ?? []} />
      {!st.mySolved && !st.sawWord && (
        <form className="mz-dg-form" onSubmit={submit}>
          <label className="mz-sr-only" htmlFor="mz-td-input">Your team’s guess</label>
          <input id="mz-td-input" ref={input} className="mz-dg-input" data-testid="mz-td-input" value={text} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false}
            placeholder={locked ? `Wait ${lockedFor} s…` : waitingInk ? "Wait for the drawing…" : "Type a guess"} disabled={locked || outOfGuesses || !st.canGuess} onChange={(e) => setText(e.target.value)} />
          <Keycap type="submit" disabled={pending || locked || outOfGuesses || !st.canGuess || !text.trim()} data-testid="mz-td-send">{pending ? "Sending…" : "Guess"}</Keycap>
        </form>
      )}
      {locked && !st.mySolved && <p className="mz-sc-locked" role="status" data-testid="mz-td-locked">Not it! Your team can guess again in {lockedFor} s.</p>}
      {!st.mySolved && !st.sawWord && st.guessesLeft !== undefined && (st.teamGuesses?.length ?? 0) > 0 && (
        <p className="mz-foot" data-testid="mz-td-left" style={{ textAlign: "center" }}>{st.guessesLeft > 0 ? `${st.guessesLeft} ${st.guessesLeft === 1 ? "guess" : "guesses"} left for your team.` : "That’s all your team’s guesses for this word."}</p>
      )}
      <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-td-error" />
      <GuessList st={st} nameOf={nameOf} />
      <FeedbackLine testId="mz-td-status">{status}</FeedbackLine>
      {canTake && (
        <button type="button" className="mz-chip-btn mz-td-takeover" data-testid="mz-td-takeover" disabled={busy} onClick={() => once("team-draw-takeover", { round: st.round ?? 0 })}>
          {drawer} hasn’t drawn for a while: take the pen
        </button>
      )}
      {scores}
    </main>
  );
}

/** Results: every round's word with each team's result (the team results card comes in the hero). */
export function MchezoTeamDrawResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as TeamDrawView;
  const nameOf: NameOf = (id) => (id === playerId ? "You" : players.find((p) => p.id === id)?.displayName ?? "Someone");
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-td-results">
      {hero}
      {next}
      <GameHeader title={title} objective="Every word, every team" accent={5} />
      <ol className="mz-mr-recap">
        {(st.rounds ?? []).map((r, i) => (
          <li key={i} data-testid="mz-td-recap-round">
            <span className="mz-foot" style={{ textAlign: "left" }}>Round {i + 1}: <b>{r.word}</b></span>
            <TeamLines game={game} r={r} mine={st.myTeamId} nameOf={nameOf} testId={`mz-td-recap-${i}`} />
          </li>
        ))}
      </ol>
      <p className="mz-foot" data-testid="mz-td-howscore">100, 75, 55, 40 by the order teams get the word, and +25 catch-up for a team alone in last place and 100 or more behind. Everyone scores their team’s points. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
      <OutcomeSummary gameId="team-draw" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the word's shape and each team's status and total; at the reveal, the word and every team's drawing. */
export function TeamDrawTv({ game, title, nameOf }: { game: PublicGame; title: string; nameOf: NameOf }) {
  const st = (game.state ?? {}) as TeamDrawView;
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  if ((st.phase === "reveal" || st.phase === "finished") && st.result) {
    const r = st.result;
    return (
      <section className="mz-tvshow-fq mz-tvshow-td" data-testid="tv-live-team-draw">
        <span className="mz-tv-kicker">{title} · round {round} of {of} · the reveal</span>
        <h1 className="mz-tvshow-h1" data-testid="tv-td-answer">It was: {r.word}</h1>
        <Gallery game={game} r={r} nameOf={nameOf} testId="tv-td-gallery" totals={st.teamTotals ?? []} tv />
      </section>
    );
  }
  return (
    <section className="mz-tvshow-fq mz-tvshow-td" data-testid="tv-live-team-draw">
      <span className="mz-tv-kicker">{title} · round {round} of {of}</span>
      <h1 className="mz-tvshow-h1" data-testid="tv-td-title">Every team is drawing the same word</h1>
      <div data-testid="tv-td-letters"><Letters letters={st.letters ?? []} tv /></div>
      <p className="mz-tvshow-line mz-tvshow-line--muted">Guess on your phone from your own team’s drawing. Wrong guesses stay in your team.</p>
      <TeamScoreboard game={game} totals={st.teamTotals ?? []} status={statusOf(st, nameOf)} tv testId="tv-td-scores" />
    </section>
  );
}

/** TV post-game review: every word and each team's result. */
export function TeamDrawReview({ game, nameOf }: { game: PublicGame; nameOf: NameOf }) {
  const st = (game.state ?? {}) as TeamDrawView;
  return (
    <ol className="mz-mr-recap" data-testid="tv-td-review">
      {(st.rounds ?? []).map((r, i) => <li key={i}><b>Round {i + 1}: {r.word}</b><TeamLines game={game} r={r} nameOf={nameOf} testId={`tv-td-review-${i}`} /></li>)}
    </ol>
  );
}
