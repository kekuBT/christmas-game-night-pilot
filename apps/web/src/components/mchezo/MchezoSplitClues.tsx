/**
 * Stage 12.10 (docs/stage12/stage1210.md §2): Split Clues on the phones and the TV.
 *
 *   MchezoSplitClues         your clues, the help as it arrives, your team's tries and the answer box; then the reveal
 *   MchezoSplitCluesResults  every puzzle with each team's result (the team results card comes in the hero)
 *   SplitCluesTv, SplitCluesReview
 *
 * Secrecy (D-S1210-02): the server sends each phone only its own clues until the 45 s pooling, then its own team's six;
 * a team's wrong tries go to its own players only. The TV and other teams see each team's status, never a clue or the
 * answer, until the reveal. Every fact here is the server's.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FeedbackLine, GameHeader } from "../../ui/mchezo/components/GameKit.js";
import { Keycap, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { SendNote } from "./SendNote.js";
import { ORDINAL, TeamLabel, TeamScoreboard, ordinal, teamDef, useServerNow, type TeamScoreRow, teamGameModeLine } from "./TeamGameKit.js";
import { TeamMark } from "./Teams.js";
import type { TeamDef } from "../../../../../src/shared/teams.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface SplitStatus { teamId: string; solved: boolean; place?: number; tries: number; locked: boolean }
interface SplitTeamResult { teamId: string; solved: boolean; place: number | null; points: number; bonus: number; seconds?: number }
interface SplitReveal { kind?: string; answer?: string; clues?: string[]; teams?: SplitTeamResult[] }
export interface SplitGameView {
  round?: number; roundCount?: number; phase?: "solve" | "reveal" | "finished"; kind?: string;
  teamStatus?: SplitStatus[]; teamTotals?: TeamScoreRow[]; help?: number; helpAt?: number[]; shape?: string; firstLetter?: string;
  result?: SplitReveal; rounds?: SplitReveal[];
  myTeamId?: string; myTotal?: number; myClues?: string[]; pooled?: boolean; teamTries?: { by: string; text: string }[];
  lockedUntil?: number; lockMs?: number; mySolved?: boolean; myPlace?: number; solvedBy?: string; triesLeft?: number;
}

const HELP_WORDS = ["the answer’s shape", "everyone’s clues", "the first letter"];

/** The help so far, and when the next comes (from the server's clock). */
function helpLines(st: SplitGameView, now: number): { shown: string[]; next?: string } {
  const shown: string[] = [];
  if (st.shape) shown.push(`Shape: ${st.shape}`);
  if (st.firstLetter) shown.push(`First letter: ${st.firstLetter}`);
  const i = st.help ?? 0;
  const at = st.helpAt?.[i];
  const next = at !== undefined && i < HELP_WORDS.length ? `In ${Math.max(1, Math.ceil((at - now) / 1000))} s: ${HELP_WORDS[i]}` : undefined;
  return { shown, ...(next ? { next } : {}) };
}

/** One team's line in a puzzle's result. */
function resultLine(r: SplitTeamResult): string {
  if (!r.solved) return "didn’t get it";
  return `solved ${r.place ? ordinal(r.place) : ""}${r.seconds !== undefined ? ` in ${r.seconds} s` : ""}: +${r.points}${r.bonus ? ` (with +${r.bonus} catch-up)` : ""}`;
}

/** Each team's result for one puzzle; with `totals`, its running total too (the TV's reveal, which has no room for a scoreboard). */
function TeamResults({ game, r, mine, testId, totals }: { game: { teams?: { list: TeamDef[] } }; r: SplitReveal; mine?: string; testId: string; totals?: readonly TeamScoreRow[] }) {
  return (
    <ul className="mz-hd-teams" data-testid={testId}>
      {(r.teams ?? []).map((t) => {
        const def = teamDef(game, t.teamId);
        return (
          <li key={t.teamId} className={`mz-hd-team mz-team--${def?.color ?? "coral"}${t.teamId === mine ? " is-mine" : ""}`} data-testid={`${testId}-${t.teamId}`}>
            {def && <TeamMark color={def.color} />}
            <span className="mz-hd-team__text"><b>{def?.name ?? "A team"}</b><span>{resultLine(t)}{totals ? ` · total ${totals.find((x) => x.teamId === t.teamId)?.score ?? 0}` : ""}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

const statusOf = (st: SplitGameView) => (teamId: string): ReactNode => {
  const s = st.teamStatus?.find((x) => x.teamId === teamId);
  if (!s) return null;
  if (s.solved) return `✓ Solved ${s.place ? ORDINAL[s.place - 1] ?? "" : ""}`.trim();
  if (s.locked) return "Wrong try: a short pause";
  return s.tries > 0 ? `Solving… ${s.tries} ${s.tries === 1 ? "try" : "tries"}` : "Solving…";
};

export interface MchezoSplitCluesDeps {
  game: PlayerGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  landed?: boolean;
}

export function MchezoSplitClues({ game, players, playerId, title, intent, error, landed }: MchezoSplitCluesDeps) {
  const st = (game.state ?? {}) as SplitGameView;
  const now = useServerNow();
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  const key = `${st.round ?? 0}:${st.phase ?? ""}`;
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(""); setPending(false); }, [key]);
  const nameOf = (id: string) => (id === playerId ? "You" : players.find((p) => p.id === id)?.displayName ?? "Someone");
  const teamLabel = <TeamLabel game={game} teamId={st.myTeamId} testId="mz-sc-myteam" />;
  const scores = <TeamScoreboard game={game} totals={st.teamTotals ?? []} mine={st.myTeamId} status={st.phase === "solve" ? statusOf(st) : undefined} testId="mz-sc-scores" />;

  if ((st.phase === "reveal" || st.phase === "finished") && st.result) {
    const r = st.result;
    const mine = r.teams?.find((t) => t.teamId === st.myTeamId);
    const myLine = !mine ? "" : mine.solved ? `Your team got it, ${ordinal(mine.place ?? 1)}: +${mine.points}${mine.bonus ? ` (including +${mine.bonus} catch-up)` : ""}.` : "Your team didn’t get this one.";
    return (
      <main className="mz-screen" aria-label={`${title}: puzzle ${round} of ${of}, the answer`} data-testid="mz-sc-reveal">
        <GameHeader title={title} objective="The answer" accent={1} />
        <p className="mz-mr-round">Puzzle {round} of {of} · {r.kind}</p>
        <h2 className="mz-mr-prompt mz-sc-answer" data-testid="mz-sc-answer">{r.answer}</h2>
        <p className="mz-mr-mine" data-testid="mz-sc-mine">{myLine}</p>
        <section className="mz-card mz-sc-clues" aria-label="All six clues" data-testid="mz-sc-all-clues">
          <span className="mz-kicker">All six clues</span>
          <ol className="mz-sc-clues__list">{(r.clues ?? []).map((c, i) => <li key={i}>{c}</li>)}</ol>
        </section>
        <TeamResults game={game} r={r} mine={st.myTeamId} testId="mz-sc-team-results" />
        {scores}
        <p className="mz-foot">{round < of ? "The next puzzle is coming up." : "That was the last puzzle."}</p>
      </main>
    );
  }

  const help = helpLines(st, now);
  const lockedFor = st.lockedUntil ? Math.max(0, Math.ceil((st.lockedUntil - now) / 1000)) : 0;
  const locked = lockedFor > 0;
  const outOfTries = (st.triesLeft ?? 1) <= 0;
  const status = st.mySolved ? `Your team solved it${st.myPlace ? `, ${ordinal(st.myPlace)}` : ""}${st.solvedBy ? ` (${nameOf(st.solvedBy)})` : ""}! Waiting for the other teams.`
    : outOfTries ? "Your team has used all its tries for this puzzle. The answer comes soon."
    : st.pooled ? "Every clue is on every phone in your team now. Put them together!"
    : "Your teammates hold different clues. Read yours out and put them together!";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.replace(/\s+/g, " ").trim();
    if (!t || pending || locked || st.mySolved || outOfTries) return;
    const at = key;
    setPending(true); setFailedAt(null);
    void (async () => {
      try { if ((await intent(game.id, "split-guess", { round: st.round ?? 0, text: t })) === false) setFailedAt(at); else setText(""); }
      finally { setPending(false); input.current?.focus(); }
    })();
  };

  return (
    <main className="mz-screen" aria-label={`${title}: puzzle ${round} of ${of}`} data-testid="mz-sc-solve">
      <GameHeader title={title} objective="Put your clues together" accent={1} />
      {teamLabel}
      <p className="mz-mr-round" data-testid="mz-sc-round">Puzzle {round} of {of} · {st.kind}</p>
      <section className="mz-card mz-sc-clues" aria-label={st.pooled ? "Your team’s clues" : "Your clues"} data-testid="mz-sc-clues">
        <span className="mz-kicker">{st.pooled ? "Your team’s clues (everyone’s now)" : (st.myClues?.length ?? 0) === 1 ? "Your clue" : "Your clues"}</span>
        <ul className="mz-sc-clues__list">{(st.myClues ?? []).map((c, i) => <li key={i} data-testid="mz-sc-clue">{c}</li>)}</ul>
      </section>
      {(help.shown.length > 0 || help.next) && (
        <p className="mz-sc-help" data-testid="mz-sc-help">
          {help.shown.map((h) => <b key={h}>{h}</b>)}
          {help.next && <span data-testid="mz-sc-next-help">{help.next}</span>}
        </p>
      )}
      {!st.mySolved && (
        <form className="mz-sc-form" onSubmit={submit}>
          <label className="mz-sr-only" htmlFor="mz-sc-input">Your team’s answer</label>
          <input id="mz-sc-input" ref={input} className="mz-input mz-sc-input" data-testid="mz-sc-input" value={text} maxLength={40} autoComplete="off" autoCapitalize="off" spellCheck={false}
            placeholder={locked ? `Wait ${lockedFor} s…` : "Your team’s answer"} disabled={locked || outOfTries} onChange={(e) => setText(e.target.value)} />
          <Keycap type="submit" disabled={pending || locked || outOfTries || !text.trim()} data-testid="mz-sc-send">{pending ? "Sending…" : "Send"}</Keycap>
        </form>
      )}
      {locked && <p className="mz-sc-locked" role="status" data-testid="mz-sc-locked">Not that one! Your team can try again in {lockedFor} s.</p>}
      <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-sc-error" />
      {(st.teamTries?.length ?? 0) > 0 && (
        <ul className="mz-sc-tries" aria-label="Your team’s tries" data-testid="mz-sc-tries">
          {(st.teamTries ?? []).map((t, i) => <li key={i}>{nameOf(t.by)} tried: <s>{t.text}</s></li>)}
        </ul>
      )}
      <FeedbackLine testId="mz-sc-status">{status}</FeedbackLine>
      {scores}
    </main>
  );
}

/** Results: every puzzle with each team's result (the team results card comes in the hero). */
export function MchezoSplitCluesResults({ game, publicGame, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as SplitGameView;
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-sc-results">
      {hero}
      {next}
      <GameHeader title={title} objective="Who put it together?" accent={1} />
      <ol className="mz-mr-recap">
        {(st.rounds ?? []).map((r, i) => (
          <li key={i} data-testid="mz-sc-recap-round">
            <span className="mz-foot" style={{ textAlign: "left" }}>Puzzle {i + 1} · {r.kind}: <b>{r.answer}</b></span>
            <TeamResults game={game} r={r} mine={st.myTeamId} testId={`mz-sc-recap-${i}`} />
          </li>
        ))}
      </ol>
      <p className="mz-foot" data-testid="mz-sc-howscore">100, 75, 55, 40 by the order teams solve, and +25 catch-up for a team alone in last place and 100 or more behind. Everyone scores their team’s points. {teamGameModeLine(casual, game.official ?? publicGame?.official)}</p>
      <OutcomeSummary gameId="split-clues" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the puzzle's kind, the help so far, and each team's status and total; at the reveal, the answer and every clue. */
export function SplitCluesTv({ game, title }: { game: PublicGame; title: string }) {
  const st = (game.state ?? {}) as SplitGameView;
  const now = useServerNow();
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  if ((st.phase === "reveal" || st.phase === "finished") && st.result) {
    const r = st.result;
    return (
      <section className="mz-tvshow-fq mz-tvshow-sc" data-testid="tv-live-split-clues">
        <span className="mz-tv-kicker">{title} · puzzle {round} of {of} · the answer</span>
        <h1 className="mz-tvshow-h1" data-testid="tv-sc-answer">{r.answer}</h1>
        <div className="mz-tvshow-fq__row">
          <ol className="mz-sc-clues__list mz-sc-clues__list--tv" data-testid="tv-sc-clues">{(r.clues ?? []).map((c, i) => <li key={i}>{c}</li>)}</ol>
          <TeamResults game={game} r={r} testId="tv-sc-team-results" totals={st.teamTotals ?? []} />
        </div>
      </section>
    );
  }
  const help = helpLines(st, now);
  return (
    <section className="mz-tvshow-fq mz-tvshow-sc" data-testid="tv-live-split-clues">
      <span className="mz-tv-kicker">{title} · puzzle {round} of {of}</span>
      <h1 className="mz-tvshow-h1" data-testid="tv-sc-kind">{st.kind}</h1>
      <p className="mz-tvshow-line" data-testid="tv-sc-help">{help.shown.length ? help.shown.join(" · ") : "Every teammate holds different clues. Talk it out!"}{help.next ? <span className="mz-tvshow-line--muted"> · {help.next}</span> : null}</p>
      <TeamScoreboard game={game} totals={st.teamTotals ?? []} status={statusOf(st)} tv testId="tv-sc-scores" />
    </section>
  );
}

/** TV post-game review: every puzzle, its answer and each team's result. */
export function SplitCluesReview({ game }: { game: PublicGame }) {
  const st = (game.state ?? {}) as SplitGameView;
  return (
    <ol className="mz-mr-recap" data-testid="tv-sc-review">
      {(st.rounds ?? []).map((r, i) => <li key={i}><b>Puzzle {i + 1} · {r.kind}: {r.answer}</b><TeamResults game={game} r={r} testId={`tv-sc-review-${i}`} /></li>)}
    </ol>
  );
}
