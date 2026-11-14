/**
 * Stage 12.13 (docs/stage12/stage1213.md §2): Tug of War on the phones and the TV.
 *
 *   TugRope              two teams: a rope; three or four: a knot in a star. The knot leans toward the team pulling
 *                        hardest (each team's pull per player, from the server). Each end carries its team's mark.
 *   MchezoTugOfWar       your own sum and four answers (a wrong one freezes you for 2 s), the rope, your team's pull
 *   MchezoTugOfWarResults, TugOfWarTv, TugOfWarReview
 *
 * Secrecy (D-S1213-01): the server sends a phone only its own current sum and never its answer; the TV and other
 * players see pulls, never a sum.
 */
import { useEffect, useState, type ReactNode } from "react";
import { FeedbackLine, GameHeader } from "../../ui/mchezo/components/GameKit.js";
import { Keycap, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { SendNote } from "./SendNote.js";
import { ORDINAL, TeamLabel, TeamScoreboard, ordinal, teamDef, useServerNow, type TeamScoreRow } from "./TeamGameKit.js";
import { TEAM_SHAPE } from "./Teams.js";
import type { TeamDef } from "../../../../../src/shared/teams.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface TugPull { teamId: string; right: number; size: number; mult: number; pull: number }
interface TugResult extends TugPull { place: number; points: number }
export interface TugView {
  bout?: number; boutCount?: number; phase?: "pull" | "result" | "finished"; teamTotals?: TeamScoreRow[]; pulls?: TugPull[];
  catchUp?: string; boutStartedAt?: number; result?: TugResult[]; bouts?: TugResult[][];
  myTeamId?: string; myTotal?: number; myRight?: number; myWrong?: number;
  sum?: { idx: number; prompt: string; options: number[]; wrong: number[] }; frozenUntil?: number; freezeMs?: number;
}
type Game = { teams?: { list: TeamDef[] } };
const teamName = (game: Game, id?: string | null) => teamDef(game, id)?.name ?? "A team";

/** Where each team pulls from: two teams left and right; three or four spread round a circle. */
function directions(n: number): { x: number; y: number }[] {
  if (n <= 2) return [{ x: -1, y: 0 }, { x: 1, y: 0 }];
  const start = n === 3 ? -90 : -135;
  return Array.from({ length: n }, (_, i) => { const a = ((start + (360 / n) * i) * Math.PI) / 180; return { x: Math.cos(a), y: Math.sin(a) }; });
}

/** The knot's lean: the pulls' directions weighted by pull, scaled so one team pulling alone reaches 70% of an arm. */
export function knotOffset(pulls: readonly { pull: number }[]): { x: number; y: number } {
  const dirs = directions(pulls.length);
  const total = pulls.reduce((n, p) => n + p.pull, 0);
  if (total <= 0) return { x: 0, y: 0 };
  const x = pulls.reduce((n, p, i) => n + dirs[i]!.x * p.pull, 0) / total;
  const y = pulls.reduce((n, p, i) => n + dirs[i]!.y * p.pull, 0) / total;
  return { x: x * 0.7, y: y * 0.7 };
}

export function TugRope({ game, pulls, mine, testId, tv }: { game: Game; pulls: readonly TugPull[]; mine?: string; testId: string; tv?: boolean }) {
  const n = pulls.length;
  const R = 100;
  const dirs = directions(n);
  const k = knotOffset(pulls);
  const kx = k.x * R, ky = k.y * R;
  const twoTeams = n <= 2;
  // The drawing's box hugs the arms (with room for the end marks), so a 3-team star has no empty band below it.
  const pad = 24;
  const xs = [0, ...dirs.map((d) => d.x * R)], ys = [0, ...dirs.map((d) => d.y * R)];
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = twoTeams ? -30 : Math.min(...ys) - pad, maxY = twoTeams ? 30 : Math.max(...ys) + pad;
  const leader = [...pulls].sort((a, b) => b.pull - a.pull)[0];
  const lean = !leader || leader.pull <= 0 ? "Even so far" : pulls.filter((p) => Math.abs(p.pull - leader.pull) < 1e-9).length > 1 ? "Level at the top" : `Leaning to ${teamName(game, leader.teamId)}`;
  return (
    <figure className={`mz-tug-rope${tv ? " mz-tug-rope--tv" : ""}`} data-testid={testId} data-knot={`${k.x.toFixed(2)},${k.y.toFixed(2)}`}>
      <svg viewBox={`${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`} role="img" aria-label={`The rope. ${lean}.`}>
        {twoTeams && <line x1={0} y1={-26} x2={0} y2={26} className="mz-tug-rope__mid" />}
        {pulls.map((p, i) => {
          const def = teamDef(game, p.teamId);
          const ex = dirs[i]!.x * R, ey = dirs[i]!.y * R;
          return (
            <g key={p.teamId} className={`mz-team--${def?.color ?? "coral"}${p.teamId === mine ? " is-mine" : ""}`}>
              <line x1={kx} y1={ky} x2={ex} y2={ey} className="mz-tug-rope__line" />
              <circle cx={ex} cy={ey} r={17} className="mz-tug-rope__end" />
              <text x={ex} y={ey} className="mz-tug-rope__mark" aria-hidden="true">{def ? TEAM_SHAPE[def.color] : ""}</text>
            </g>
          );
        })}
        <circle cx={kx} cy={ky} r={10} className="mz-tug-rope__knot" />
      </svg>
      <figcaption className="mz-tug-rope__lean" data-testid={`${testId}-lean`}>{lean}</figcaption>
    </figure>
  );
}

const pullLine = (st: TugView) => (teamId: string): ReactNode => {
  const p = st.pulls?.find((x) => x.teamId === teamId);
  if (!p) return null;
  const res = st.result?.find((x) => x.teamId === teamId);
  const base = `${p.pull.toFixed(1)} per player (${p.right} right, ${p.size} ${p.size === 1 ? "player" : "players"})${p.mult > 1 ? " · catch-up ×1.2" : ""}`;
  return res ? `${ORDINAL[res.place - 1] ?? ""} this bout: +${res.points} · ${base}` : base;
};

export interface MchezoTugOfWarDeps {
  game: PlayerGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  landed?: boolean;
}

export function MchezoTugOfWar({ game, title, intent, error, landed }: MchezoTugOfWarDeps) {
  const st = (game.state ?? {}) as TugView;
  const now = useServerNow(200);
  const bout = (st.bout ?? 0) + 1;
  const of = st.boutCount ?? 3;
  const key = `${st.bout ?? 0}:${st.phase ?? ""}:${st.sum?.idx ?? ""}`;
  const [pending, setPending] = useState(false);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  useEffect(() => { setPending(false); }, [key]);
  const rope = <TugRope game={game} pulls={st.pulls ?? []} mine={st.myTeamId} testId="mz-tug-rope" />;
  const scores = <TeamScoreboard game={game} totals={st.teamTotals ?? []} mine={st.myTeamId} status={pullLine(st)} testId="mz-tug-scores" />;

  if (st.phase === "result" || st.phase === "finished") {
    const mine = st.result?.find((r) => r.teamId === st.myTeamId);
    return (
      <main className="mz-screen" aria-label={`${title}: bout ${bout} of ${of}, the result`} data-testid="mz-tug-result">
        <GameHeader title={title} objective="The bout's result" accent={3} />
        <p className="mz-mr-round">Bout {bout} of {of}</p>
        <h2 className="mz-mr-prompt mz-tug-headline" data-testid="mz-tug-headline">{mine ? `Your team came ${ordinal(mine.place)}: +${mine.points}` : "Bout over"}</h2>
        <p className="mz-mr-mine" data-testid="mz-tug-mine">You pulled {st.myRight ?? 0} {st.myRight === 1 ? "time" : "times"} this bout.</p>
        {rope}
        {scores}
        <p className="mz-foot">{bout < of ? "The next bout starts in a moment." : "That was the last bout."}</p>
      </main>
    );
  }

  const sum = st.sum;
  const frozenFor = st.frozenUntil ? Math.max(0, Math.ceil((st.frozenUntil - now) / 1000)) : 0;
  const frozen = frozenFor > 0;
  const tap = (i: number) => {
    if (!sum || pending || frozen) return;
    const at = key;
    setPending(true); setFailedAt(null);
    void (async () => {
      try { if ((await intent(game.id, "tug-answer", { bout: st.bout ?? 0, idx: sum.idx, choice: i })) === false) setFailedAt(at); }
      finally { setPending(false); }
    })();
  };
  const myPull = st.pulls?.find((p) => p.teamId === st.myTeamId);
  return (
    <main className="mz-screen" aria-label={`${title}: bout ${bout} of ${of}`} data-testid="mz-tug-pull">
      <GameHeader title={title} objective="Pull!" accent={3} />
      <TeamLabel game={game} teamId={st.myTeamId} testId="mz-tug-myteam" />
      <p className="mz-mr-round" data-testid="mz-tug-round">Bout {bout} of {of} · every right answer pulls</p>
      {rope}
      {st.catchUp && st.catchUp === st.myTeamId && <p className="mz-tug-catchup" data-testid="mz-tug-catchup">Catch-up: your team pulls ×1.2 this bout.</p>}
      {sum ? (
        <section className={`mz-tug-sum${frozen ? " is-frozen" : ""}`} aria-label="Your sum" data-testid="mz-tug-sum">
          <h2 className="mz-tug-sum__prompt" data-testid="mz-tug-prompt">{sum.prompt}</h2>
          <div className="mz-tug-opts" role="group" aria-label="Answers">
            {sum.options.map((o, i) => (
              <button key={i} type="button" className={`mz-tug-opt${sum.wrong.includes(i) ? " is-wrong" : ""}`} data-testid={`mz-tug-opt-${i}`}
                disabled={frozen || pending || sum.wrong.includes(i)} onClick={() => tap(i)}>{o}</button>
            ))}
          </div>
          {frozen && <p className="mz-tug-frozen" role="status" data-testid="mz-tug-frozen">Not that one! Frozen for {frozenFor} s.</p>}
        </section>
      ) : <FeedbackLine testId="mz-tug-status">You’ve answered every sum this bout. Cheer your team on!</FeedbackLine>}
      <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-tug-error" />
      <p className="mz-tug-me" data-testid="mz-tug-me">You: {st.myRight ?? 0} right{(st.myWrong ?? 0) > 0 ? `, ${st.myWrong} wrong` : ""}{myPull ? ` · your team: ${myPull.pull.toFixed(1)} per player` : ""}</p>
      {scores}
    </main>
  );
}

/** Results: every bout's places (the team results card comes in the hero). */
export function MchezoTugOfWarResults({ game, publicGame, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as TugView;
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-tug-results">
      {hero}
      {next}
      <GameHeader title={title} objective="Every bout" accent={3} />
      <BoutList game={game} bouts={st.bouts ?? []} mine={st.myTeamId} testId="mz-tug-recap" />
      <p className="mz-foot" data-testid="mz-tug-howscore">Each bout: 100, 75, 55, 40 by pull per player (right answers ÷ the team’s players); a team far behind pulls ×1.2. Everyone scores their team’s points. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
      <OutcomeSummary gameId="tug-of-war" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

function BoutList({ game, bouts, mine, testId }: { game: Game; bouts: readonly TugResult[][]; mine?: string; testId: string }) {
  return (
    <ol className="mz-mr-recap">
      {bouts.map((rs, i) => (
        <li key={i} data-testid={`${testId}-bout`}>
          <span className="mz-foot" style={{ textAlign: "left" }}>Bout {i + 1}</span>
          <span className="mz-mr-recap__line">{[...rs].sort((a, b) => a.place - b.place).map((r) => `${ORDINAL[r.place - 1] ?? ""} ${teamName(game, r.teamId)}${r.teamId === mine ? " (you)" : ""} ${r.pull.toFixed(1)}${r.mult > 1 ? " ×1.2" : ""}: +${r.points}`).join(" · ")}</span>
        </li>
      ))}
    </ol>
  );
}

/** TV: the rope or star, big; each team's pull per player; at the result, places. Never a sum. */
export function TugOfWarTv({ game, title }: { game: PublicGame; title: string }) {
  const st = (game.state ?? {}) as TugView;
  const bout = (st.bout ?? 0) + 1;
  const result = st.phase !== "pull";
  const winners = (st.result ?? []).filter((r) => r.place === 1).map((r) => teamName(game, r.teamId));
  return (
    <section className="mz-tvshow-tug" data-testid="tv-live-tug-of-war">
      <span className="mz-tv-kicker">{title} · bout {bout} of {st.boutCount ?? 3}{result ? " · the result" : ""}</span>
      <h1 className="mz-tvshow-h1" data-testid="tv-tug-title">{result ? (winners.length === 1 ? `${winners[0]} wins the bout!` : `${winners.join(" and ")} tie the bout!`) : "Pull! Every right answer counts"}</h1>
      <div className="mz-tvshow-tug__row">
        <TugRope game={game} pulls={st.pulls ?? []} testId="tv-tug-rope" tv />
        <TeamScoreboard game={game} totals={st.teamTotals ?? []} status={pullLine(st)} tv testId="tv-tug-scores" />
      </div>
    </section>
  );
}

/** TV post-game review: every bout's places. */
export function TugOfWarReview({ game }: { game: PublicGame }) {
  const st = (game.state ?? {}) as TugView;
  return <div data-testid="tv-tug-review"><BoutList game={game} bouts={st.bouts ?? []} testId="tv-tug-review" /></div>;
}
