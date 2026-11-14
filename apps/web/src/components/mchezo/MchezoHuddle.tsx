/**
 * Stage 12.8 (docs/stage12/stage128.md §2): Team Huddle on the phones and the TV.
 *
 *   MchezoHuddle         the game: pick an option with your teammates' picks shown live; then the reveal
 *   MchezoHuddleResults  every question with each team's answer (the team results card comes in the hero)
 *   HuddleTv, HuddleReview
 *
 * Secrecy (D-S128-02): the server sends each phone only its own team's picks. The TV and the other teams get, per team,
 * how many have picked and whether it agrees, never which option, until the reveal. Every fact here is the server's.
 */
import { useEffect, useState, type ReactNode } from "react";
import { FeedbackLine, GameHeader } from "../../ui/mchezo/components/GameKit.js";
import { Keycap, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { Option } from "./MchezoFamily.js";
import { TeamMark } from "./Teams.js";
import { SendNote } from "./SendNote.js";
import type { TeamDef } from "../../../../../src/shared/teams.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface HuddleTeamRound { teamId: string; answer: number | null; counts: number[]; right: boolean; together: boolean; points: number }
interface HuddleReveal { prompt?: string; options?: string[]; correctIndex?: number; explanation?: string; teams?: HuddleTeamRound[] }
interface HuddleProgress { teamId: string; picked: number; of: number; agreed: boolean }
export interface HuddleGameView {
  round?: number; roundCount?: number; phase?: "pick" | "reveal" | "finished";
  prompt?: string; options?: string[]; teamProgress?: HuddleProgress[];
  result?: HuddleReveal; rounds?: HuddleReveal[];
  myTeamId?: string; myPick?: number; mySkipped?: boolean; myTotal?: number;
  teammates?: { playerId: string; choice: number | null; sat: boolean }[];
}

const LETTERS = ["A", "B", "C", "D"];
const teamDef = (game: { teams?: { list: TeamDef[] } }, id?: string): TeamDef | undefined => game.teams?.list.find((t) => t.id === id);

/** One team's line in the reveal: its answer, right or not, and its points. */
function teamRoundLine(r: HuddleTeamRound, options: readonly string[] | undefined): string {
  if (r.answer === null) return "no answer";
  const pick = `${LETTERS[r.answer] ?? ""} ${options?.[r.answer] ?? ""}`.trim();
  return r.right ? `${pick} ✓ +${r.points}${r.together ? " (together)" : ""}` : `${pick} ✗`;
}

/** Each team's answer for one question, with its mark and name (colour is never the only cue). */
function TeamAnswers({ game, r, mine, testId }: { game: { teams?: { list: TeamDef[] } }; r: HuddleReveal; mine?: string; testId: string }) {
  return (
    <ul className="mz-hd-teams" data-testid={testId}>
      {(r.teams ?? []).map((t) => {
        const def = teamDef(game, t.teamId);
        return (
          <li key={t.teamId} className={`mz-hd-team mz-team--${def?.color ?? "coral"}${t.teamId === mine ? " is-mine" : ""}`} data-testid={`${testId}-${t.teamId}`}>
            {def && <TeamMark color={def.color} />}
            <span className="mz-hd-team__text"><b>{def?.name ?? "A team"}</b><span>{teamRoundLine(t, r.options)}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

/** Per team: how many have picked and whether it agrees. Never the option. */
function TeamProgress({ game, progress, mine, testId }: { game: { teams?: { list: TeamDef[] } }; progress: readonly HuddleProgress[]; mine?: string; testId: string }) {
  return (
    <ul className="mz-hd-teams" data-testid={testId}>
      {progress.map((p) => {
        const def = teamDef(game, p.teamId);
        return (
          <li key={p.teamId} className={`mz-hd-team mz-team--${def?.color ?? "coral"}${p.teamId === mine ? " is-mine" : ""}`} data-testid={`${testId}-${p.teamId}`}>
            {def && <TeamMark color={def.color} />}
            <span className="mz-hd-team__text"><b>{def?.name ?? "A team"}</b><span>{p.picked} of {p.of} picked{p.agreed ? " · agreed ✓" : p.picked > 1 ? " · not agreed yet" : ""}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

export interface MchezoHuddleDeps {
  game: PlayerGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  landed?: boolean;
}

export function MchezoHuddle({ game, players, title, intent, error, landed }: MchezoHuddleDeps) {
  const st = (game.state ?? {}) as HuddleGameView;
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  const key = `${st.round ?? 0}:${st.phase ?? ""}`;
  const [pending, setPending] = useState<string | null>(null);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  useEffect(() => { setPending(null); }, [key]);
  const send = async (action: string, payload: Record<string, unknown>, tag: string) => {
    const at = key;
    setPending(tag); setFailedAt(null);
    try { if ((await intent(game.id, action, payload)) === false) setFailedAt(at); } finally { setPending(null); }
  };
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  const myTeam = teamDef(game, st.myTeamId);
  const teamLabel = myTeam ? <span className="mz-hd-you" data-testid="mz-hd-myteam"><TeamMark color={myTeam.color} /> You’re on <b>{myTeam.name}</b></span> : null;

  if (st.phase === "reveal" && st.result) {
    const r = st.result;
    const mine = r.teams?.find((t) => t.teamId === st.myTeamId);
    const myLine = !mine || mine.answer === null ? "Your team didn’t answer this one."
      : mine.right ? `Your team got it: +${mine.points}${mine.together ? ", everyone together!" : "."}`
      : `Your team picked “${r.options?.[mine.answer] ?? ""}”: not this time.`;
    return (
      <main className="mz-screen" aria-label={`${title}: question ${round} of ${of}, the answer`} data-testid="mz-hd-reveal">
        <GameHeader title={title} objective="The answer" accent={2} />
        <p className="mz-mr-round">Question {round} of {of}</p>
        <h2 className="mz-mr-prompt" data-testid="mz-hd-prompt">{r.prompt}</h2>
        <div className="mz-fq-opts" data-testid="mz-hd-reveal-options">
          {(r.options ?? []).map((o, i) => (
            <Option key={i} i={i} text={o} disabled testId={`mz-hd-reveal-${i}`} state={i === r.correctIndex ? "right" : mine?.answer === i ? "wrong" : "dim"}
              note={<span className="mz-fq-opt__tag">{i === r.correctIndex ? "✓ Right answer" : mine?.answer === i ? "Your team’s answer" : ""}</span>} />
          ))}
        </div>
        <p className="mz-mr-mine" data-testid="mz-hd-mine">{myLine}</p>
        <TeamAnswers game={game} r={r} mine={st.myTeamId} testId="mz-hd-answers" />
        <p className="mz-foot">{round < of ? "The next question is coming up." : "That was the last question."}</p>
      </main>
    );
  }

  const progress = st.teamProgress ?? [];
  const myProgress = progress.find((p) => p.teamId === st.myTeamId);
  const others = progress.filter((p) => p.teamId !== st.myTeamId);
  const pickedBy = (i: number) => (st.teammates ?? []).filter((t) => t.choice === i).map((t) => nameOf(t.playerId));
  const waitingOnTeam = (st.teammates ?? []).some((t) => t.choice === null && !t.sat);
  const teamStatus = !myProgress ? "" : myProgress.agreed ? "Your team agrees. When every team agrees, the answer comes early."
    : st.myPick === undefined ? "Pick an answer. Your teammates see it, and you see theirs."
    : waitingOnTeam ? "Waiting for the rest of your team to pick."
    : "Your team doesn’t agree yet: talk it over! Change your pick any time.";

  if (st.mySkipped) {
    return (
      <main className="mz-screen" aria-label={`${title}: sitting this one out, question ${round} of ${of}`} data-testid="mz-hd-sat">
        <GameHeader title={title} objective="Sitting this one out" accent={2} />
        {teamLabel}
        <p className="mz-mr-round">Question {round} of {of}</p>
        <h2 className="mz-mr-prompt" data-testid="mz-hd-prompt">{st.prompt}</h2>
        <p className="mz-mr-mine">Your team answers this one without you.</p>
        <TeamProgress game={game} progress={progress} mine={st.myTeamId} testId="mz-hd-progress" />
      </main>
    );
  }

  return (
    <main className="mz-screen" aria-label={`${title}: question ${round} of ${of}`} data-testid="mz-hd-pick">
      <GameHeader title={title} objective="Agree as a team" accent={2} />
      {teamLabel}
      <p className="mz-mr-round">Question {round} of {of}</p>
      <h2 className="mz-mr-prompt" data-testid="mz-hd-prompt">{st.prompt}</h2>
      <div className="mz-fq-opts">
        {(st.options ?? []).map((o, i) => {
          const mates = pickedBy(i);
          const mineHere = st.myPick === i;
          const tag = [mineHere ? "You" : "", ...mates].filter(Boolean).join(", ");
          return (
            <Option key={i} i={i} text={o} testId={`mz-hd-option-${i}`} disabled={pending !== null} state={mineHere || pending === String(i) ? "chosen" : undefined}
              note={pending === String(i) ? <span className="mz-fq-opt__tag">Sending…</span> : tag ? <span className="mz-fq-opt__tag" data-testid={`mz-hd-picks-${i}`}>{tag}</span> : null}
              onPick={() => { if (!mineHere) void send("huddle-pick", { round: st.round ?? 0, choice: i }, String(i)); }} />
          );
        })}
      </div>
      <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-hd-error" />
      <FeedbackLine testId="mz-hd-status">{teamStatus}</FeedbackLine>
      {others.length > 0 && <TeamProgress game={game} progress={others} testId="mz-hd-others" />}
      {st.myPick === undefined && <button type="button" className="mz-chip-btn" style={{ alignSelf: "center", marginTop: 8 }} disabled={pending !== null} onClick={() => void send("abstain", {}, "skip")} data-testid="mz-hd-pass">Sit this one out</button>}
    </main>
  );
}

/** Results: every question with each team's answer. The team results card (12.7) comes in the hero. */
export function MchezoHuddleResults({ game, publicGame, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as HuddleGameView;
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-hd-results">
      {hero}
      {next}
      <GameHeader title={title} objective="Who huddled best?" accent={2} />
      <ol className="mz-mr-recap">
        {(st.rounds ?? []).map((r, i) => (
          <li key={i} data-testid="mz-hd-recap-round">
            <span className="mz-foot" style={{ textAlign: "left" }}>Question {i + 1}: {r.prompt} <b>({r.options?.[r.correctIndex ?? -1] ?? ""})</b></span>
            <TeamAnswers game={game} r={r} mine={st.myTeamId} testId={`mz-hd-recap-${i}`} />
          </li>
        ))}
      </ol>
      <p className="mz-foot" data-testid="mz-hd-howscore">A team’s answer is what most of it picked. 100 for a right answer, and 25 more when the whole team picked it. Everyone scores their team’s points. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
      <OutcomeSummary gameId="team-huddle" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the question and options, and per team how many picked and whether it agrees; at the reveal, each team's answer. */
export function HuddleTv({ game, title }: { game: PublicGame; title: string }) {
  const st = (game.state ?? {}) as HuddleGameView;
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  if (st.phase === "reveal" && st.result) {
    const r = st.result;
    return (
      <section className="mz-tvshow-fq mz-tvshow-hd" data-testid="tv-live-team-huddle">
        <span className="mz-tv-kicker">{title} · question {round} of {of} · the answer</span>
        <h1 className="mz-tvshow-h1">{r.prompt}</h1>
        <div className="mz-tvshow-fq__row">
          <div className="mz-fq-opts">{(r.options ?? []).map((o, i) => <Option key={i} i={i} text={o} disabled state={i === r.correctIndex ? "right" : "dim"} testId={`tv-hd-reveal-${i}`} note={i === r.correctIndex ? <span className="mz-fq-opt__tag">✓ Right answer</span> : null} />)}</div>
          <TeamAnswers game={game} r={r} testId="tv-hd-answers" />
        </div>
      </section>
    );
  }
  return (
    <section className="mz-tvshow-fq mz-tvshow-hd" data-testid="tv-live-team-huddle">
      <span className="mz-tv-kicker">{title} · question {round} of {of}</span>
      <h1 className="mz-tvshow-h1" data-testid="tv-hd-prompt">{st.prompt}</h1>
      <div className="mz-tvshow-fq__row">
        <div className="mz-fq-opts">{(st.options ?? []).map((o, i) => <Option key={i} i={i} text={o} disabled testId={`tv-hd-option-${i}`} />)}</div>
        <TeamProgress game={game} progress={st.teamProgress ?? []} testId="tv-hd-progress" />
      </div>
      <p className="mz-tvshow-line mz-tvshow-line--muted mz-tvshow-fq__hint">Huddle up! Each team’s answer is what most of it picks. When every team agrees, the answer comes early.</p>
    </section>
  );
}

/** TV post-game review: every question, its answer and each team's. */
export function HuddleReview({ game }: { game: PublicGame }) {
  const st = (game.state ?? {}) as HuddleGameView;
  return (
    <ol className="mz-mr-recap" data-testid="tv-hd-review">
      {(st.rounds ?? []).map((r, i) => <li key={i}><b>Question {i + 1}: {r.prompt} ({r.options?.[r.correctIndex ?? -1] ?? ""})</b><TeamAnswers game={game} r={r} testId={`tv-hd-review-${i}`} /></li>)}
    </ol>
  );
}
