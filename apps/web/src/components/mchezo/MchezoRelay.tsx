/**
 * Stage 12.9 (docs/stage12/stage129.md): Relay on the phones and the TV.
 *
 *   MchezoRelay         the runner answers their team's sum; teammates see it and shout help; every phone sees lanes
 *   MchezoRelayResults  each team's legs, finish and place (the team results card comes in the hero)
 *   RelayTv, RelayReview
 *
 * Secrecy (D-S129-01): each phone gets only its own team's current sum, the TV only lanes. Every fact is the server's.
 */
import { useEffect, useState, type ReactNode } from "react";
import { FeedbackLine, GameHeader } from "../../ui/mchezo/components/GameKit.js";
import { Keycap, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { serverNowEstimate } from "../../ui/mchezo/lib/lifecycle.js";
import { Option } from "./MchezoFamily.js";
import { TeamMark } from "./Teams.js";
import { teamGameModeLine } from "./TeamGameKit.js";
import { SendNote } from "./SendNote.js";
import type { TeamDef } from "../../../../../src/shared/teams.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface RelayLaneView { teamId: string; legs: number; runnerId: string | null; frozen: boolean; finished: boolean; place?: number; score: number }
export interface RelayGameView {
  legsTotal?: number; started?: boolean; lanes?: RelayLaneView[]; finishOrder?: string[];
  myTeamId?: string; myLeg?: number; runnerId?: string | null; myTurn?: boolean;
  prompt?: string; options?: number[]; wrong?: number[]; frozenUntil?: number; turnEndsAt?: number;
  /** The freeze and the turn, in ms at this game's time scale: the countdowns never show more than these. */
  freezeMs?: number; turnMs?: number;
}

const ORDINAL = ["1st", "2nd", "3rd", "4th"];
const teamDef = (game: { teams?: { list: TeamDef[] } }, id?: string): TeamDef | undefined => game.teams?.list.find((t) => t.id === id);

function useNow(): number {
  const [now, setNow] = useState(() => serverNowEstimate());
  useEffect(() => { const t = setInterval(() => setNow(serverNowEstimate()), 250); return () => clearInterval(t); }, []);
  return now;
}

/**
 * Each team's lane: its mark and name, legs done (a bar and words), who's running, and its place once home.
 * `over`: the race has ended (results, review). A team still out when time ran out shows its legs, never a runner.
 */
export function RelayLanes({ game, view, nameOf, mine, testId, tv, over }: { game: { teams?: { list: TeamDef[] } }; view: RelayGameView; nameOf: (id: string) => string; mine?: string; testId: string; tv?: boolean; over?: boolean }) {
  const total = view.legsTotal ?? 12;
  return (
    <ul className={`mz-rl-lanes${tv ? " mz-rl-lanes--tv" : ""}`} data-testid={testId}>
      {(view.lanes ?? []).map((l) => {
        const def = teamDef(game, l.teamId);
        return (
          <li key={l.teamId} className={`mz-rl-lane mz-team--${def?.color ?? "coral"}${l.teamId === mine ? " is-mine" : ""}`} data-testid={`${testId}-${l.teamId}`} data-legs={l.legs}>
            {def && <TeamMark color={def.color} />}
            <span className="mz-rl-lane__text">
              <b>{def?.name ?? "A team"}</b>
              <span>{l.finished ? `🏁 Home: ${ORDINAL[(l.place ?? 1) - 1] ?? `${l.place}th`}` : over ? `Time ran out: ${l.legs} of ${total} legs` : l.runnerId ? `${nameOf(l.runnerId)} is running${l.frozen ? " (frozen)" : ""}` : ""}</span>
            </span>
            <span className="mz-rl-lane__legs" aria-label={`${l.legs} of ${total} legs`}>{l.legs}/{total}</span>
            <span className="mz-rl-lane__bar" aria-hidden="true"><span style={{ width: `${Math.round((l.legs / total) * 100)}%` }} /></span>
          </li>
        );
      })}
    </ul>
  );
}

export interface MchezoRelayDeps {
  game: PlayerGame;
  players: PublicPlayer[];
  title: string;
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  landed?: boolean;
}

export function MchezoRelay({ game, players, title, intent, error, landed }: MchezoRelayDeps) {
  const st = (game.state ?? {}) as RelayGameView;
  const now = useNow();
  const key = `${st.myLeg ?? 0}:${st.runnerId ?? ""}`;
  const [pending, setPending] = useState<number | null>(null);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  useEffect(() => { setPending(null); }, [key, (st.wrong ?? []).length]);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  const total = st.legsTotal ?? 12;
  const leg = (st.myLeg ?? 0) + 1;
  const myTeam = teamDef(game, st.myTeamId);
  const myLane = st.lanes?.find((l) => l.teamId === st.myTeamId);
  // Seconds left, rounded up (so the options stay locked until the freeze really ends), but never more than the
  // whole freeze or turn: this phone's estimate of the server clock can trail it by a few ms ("Frozen: 4" for 3 s).
  const secondsLeft = (until: number, cap?: number) => Math.min(Math.max(0, Math.ceil((until - now) / 1000)), cap !== undefined ? Math.ceil(cap / 1000) : Infinity);
  const frozenFor = st.frozenUntil ? secondsLeft(st.frozenUntil, st.freezeMs) : 0;
  const turnLeft = st.turnEndsAt ? secondsLeft(st.turnEndsAt, st.turnMs) : undefined;
  const teamLabel = myTeam ? <span className="mz-hd-you" data-testid="mz-rl-myteam"><TeamMark color={myTeam.color} /> You’re on <b>{myTeam.name}</b></span> : null;
  const lanes = <RelayLanes game={game} view={st} nameOf={nameOf} mine={st.myTeamId} testId="mz-rl-lanes" />;

  if (myLane?.finished) {
    return (
      <main className="mz-screen" aria-label={`${title}: your team is home`} data-testid="mz-rl-home">
        <GameHeader title={title} objective={`🏁 Home in ${ORDINAL[(myLane.place ?? 1) - 1] ?? "place"}!`} accent={3} />
        {teamLabel}
        <FeedbackLine testId="mz-rl-status">Your team ran all {total} legs. Cheer the others home!</FeedbackLine>
        {lanes}
      </main>
    );
  }

  if (!st.myTurn) {
    return (
      <main className="mz-screen" aria-label={`${title}: ${st.runnerId ? `${nameOf(st.runnerId)} is running` : "waiting"}`} data-testid="mz-rl-cheer">
        <GameHeader title={title} objective={st.runnerId ? `${nameOf(st.runnerId)} is running` : "Get ready"} accent={3} />
        {teamLabel}
        <p className="mz-mr-round">Leg {leg} of {total}</p>
        {st.prompt && <h2 className="mz-mr-prompt mz-rl-sum" data-testid="mz-rl-prompt">{st.prompt}</h2>}
        <FeedbackLine testId="mz-rl-status">{st.runnerId ? `Help ${nameOf(st.runnerId)} out loud! Only the runner’s phone can answer. Your leg comes round soon.` : "The race starts in a moment."}</FeedbackLine>
        {lanes}
      </main>
    );
  }

  return (
    <main className="mz-screen" aria-label={`${title}: your leg, ${leg} of ${total}`} data-testid="mz-rl-run">
      <GameHeader title={title} objective="Your leg! Answer to pass the baton" accent={3} />
      {teamLabel}
      <p className="mz-mr-round">Leg {leg} of {total}{turnLeft !== undefined ? ` · baton passes in ${turnLeft} s` : ""}</p>
      <h2 className="mz-mr-prompt mz-rl-sum" data-testid="mz-rl-prompt">{st.prompt}</h2>
      {frozenFor > 0 && <p className="mz-rl-frozen" role="status" data-testid="mz-rl-frozen">Not that one! Frozen: {frozenFor}</p>}
      <div className="mz-fq-opts mz-rl-opts">
        {(st.options ?? []).map((o, i) => {
          const tried = (st.wrong ?? []).includes(i);
          return (
            <Option key={i} i={i} text={String(o)} testId={`mz-rl-option-${i}`} disabled={pending !== null || tried || frozenFor > 0} state={tried ? "wrong" : pending === i ? "chosen" : undefined}
              note={tried ? <span className="mz-fq-opt__tag">Tried</span> : null}
              onPick={() => {
                setPending(i); setFailedAt(null);
                void (async () => { try { if ((await intent(game.id, "relay-answer", { leg: st.myLeg ?? 0, choice: i })) === false) setFailedAt(key); } finally { setPending(null); } })();
              }} />
          );
        })}
      </div>
      <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-rl-error" />
      {lanes}
    </main>
  );
}

/** Results: each team's legs, place and finish (the team results card comes in the hero). */
export function MchezoRelayResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as RelayGameView;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-rl-results">
      {hero}
      {next}
      <GameHeader title={title} objective="Who got home first?" accent={3} />
      <RelayLanes game={game} view={st} nameOf={nameOf} mine={st.myTeamId} testId="mz-rl-final-lanes" over />
      <p className="mz-foot" data-testid="mz-rl-howscore">10 points per leg, and 30, 20 or 10 for the first three teams home. Every player scores their team’s points. {teamGameModeLine(casual, game.official ?? publicGame?.official)}</p>
      <OutcomeSummary gameId="relay" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: one lane per team (never a sum). */
export function RelayTv({ game, title, nameOf }: { game: PublicGame; title: string; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as RelayGameView;
  return (
    <section className="mz-tvshow-fq mz-tvshow-rl" data-testid="tv-live-relay">
      <span className="mz-tv-kicker">{title} · first team home wins</span>
      <h1 className="mz-tvshow-h1">The race is on!</h1>
      <RelayLanes game={game} view={st} nameOf={nameOf} testId="tv-rl-lanes" tv />
      <p className="mz-tvshow-line mz-tvshow-line--muted">Only the runner’s phone can answer; the team can shout help. A right answer passes the baton.</p>
    </section>
  );
}

/** TV post-game review: the lanes as they finished. */
export function RelayReview({ game, nameOf }: { game: PublicGame; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as RelayGameView;
  return <RelayLanes game={game} view={st} nameOf={nameOf} testId="tv-rl-review" tv over />;
}
