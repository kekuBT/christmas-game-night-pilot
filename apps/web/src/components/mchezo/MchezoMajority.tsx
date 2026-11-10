/**
 * Majority Rules (Stage 5, Practice-only): predict how the room will vote.
 *   Step 1: predict which answer most people will pick (private).
 *   Step 2: cast your own vote (private).
 *   Reveal: the totals, the majority, and who called it. Votes stay
 *   anonymous for good; only totals are ever shown.
 * "Locked in" comes only from the server's state; a send that fails says so.
 * The server owns rounds, deadlines, the tie policy and every point.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Keycap, MchezoWaiting, OutcomeSummary, TVRing, useMchezo } from "../../ui/mchezo/index.js";
import { FeedbackLine, GameHeader, ScoreList } from "../../ui/mchezo/components/GameKit.js";
import { participationLine } from "../../ui/mchezo/lib/lifecycle.js";
import { majorityMoment } from "../../ui/mchezo/lib/moments.js";
import { SendNote } from "./SendNote.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

type Choice = "a" | "b";
interface Reveal { prompt: string; a: string; b: string; votesA: number; votesB: number; majority: Choice | "tie" | "none"; spotOn: { playerId: string; points: number }[] }
export interface MajorityView {
  round?: number; roundCount?: number; phase?: "predict" | "reveal" | "finished";
  prompt?: string; a?: string; b?: string; done?: number; total?: number;
  result?: Reveal; rounds?: Reveal[];
  myPrediction?: Choice; myVote?: Choice; mySkipped?: boolean; myTotal?: number;
}

/** The two answers: colour AND shape AND letter, never colour alone. */
const SIDE = {
  a: { cls: "mz-mr-card--a", mark: "◆", letter: "A" },
  b: { cls: "mz-mr-card--b", mark: "●", letter: "B" },
} as const;

function Card({ side, text, onPick, disabled, chosen, testId, note }: { side: Choice; text: string; onPick?: () => void; disabled?: boolean; chosen?: boolean; testId: string; note?: ReactNode }) {
  const s = SIDE[side];
  return (
    <button type="button" className={`mz-mr-card ${s.cls}${chosen ? " mz-mr-card--chosen" : ""}`} onClick={onPick} disabled={disabled} aria-pressed={chosen} data-testid={testId}>
      <span className="mz-mr-card__mark" aria-hidden="true">{s.mark} {s.letter}</span>
      <span className="mz-mr-card__text">{text}</span>
      {note}
    </button>
  );
}

export function majorityLine(r: Reveal): string {
  if (r.majority === "none") return "Nobody voted this round, so there's no majority.";
  if (r.majority === "tie") return `A split room: ${r.votesA}–${r.votesB}. Every prediction scores 50.`;
  const win = r.majority === "a" ? r.a : r.b;
  const n = Math.max(r.votesA, r.votesB), m = Math.min(r.votesA, r.votesB);
  return `The room picked “${win}”, ${n}–${m}.`;
}

function Bars({ r }: { r: Reveal }) {
  const total = Math.max(1, r.votesA + r.votesB);
  return (
    <div className="mz-mr-bars" data-testid="mz-mr-bars" role="img" aria-label={`${r.a}: ${r.votesA} ${r.votesA === 1 ? "vote" : "votes"}. ${r.b}: ${r.votesB} ${r.votesB === 1 ? "vote" : "votes"}.`}>
      {(["a", "b"] as const).map((k) => {
        const n = k === "a" ? r.votesA : r.votesB;
        const top = r.majority === k;
        return (
          <div key={k} className={`mz-mr-bar mz-mr-bar--${k}${top ? " mz-mr-bar--top" : ""}`}>
            <span className="mz-mr-bar__label">{SIDE[k].mark} {k === "a" ? r.a : r.b}</span>
            <span className="mz-mr-bar__track"><span className="mz-mr-bar__fill" style={{ width: `${(n / total) * 100}%` }} /></span>
            <b className="mz-mr-bar__n">{n}</b>
          </div>
        );
      })}
    </div>
  );
}

export interface MchezoMajorityDeps {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  /** Resolves false when the action did not reach the game or was refused. */
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  /** Stage 5.1 (2C): the server lists the unconfirmed send as accepted for this player. */
  landed?: boolean;
}

export function MchezoMajority({ game, publicGame, players, playerId, title, intent, error, landed }: MchezoMajorityDeps) {
  const st = (game.state ?? {}) as MajorityView;
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 5;
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
  const failure = <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-mr-error" />;
  const counts = `${st.done ?? 0} of ${st.total ?? players.length} locked in`;

  if (st.phase === "reveal" && st.result) {
    const r = st.result;
    const mine = r.spotOn.find((x) => x.playerId === playerId);
    return (
      <main className="mz-screen" aria-label={`${title}: round ${round} of ${of}, the reveal`} data-testid="mz-mr-reveal">
        <GameHeader title={title} objective="The room has spoken" accent={2} />
        <p className="mz-mr-round">Round {round} of {of}</p>
        <h2 className="mz-mr-prompt" data-testid="mz-mr-prompt">{r.prompt}</h2>
        <Bars r={r} />
        <p className="mz-mr-verdict" data-testid="mz-mr-verdict">{majorityLine(r)}</p>
        <p className="mz-mr-mine" data-testid="mz-mr-mine">
          {st.myPrediction === undefined ? "You didn't predict this round." : r.majority === "tie" ? "A split room: your prediction scores +50." : mine ? `You called it: +${mine.points}.` : `You predicted “${st.myPrediction === "a" ? r.a : r.b}”: no points this time.`}
        </p>
        {r.spotOn.length > 0 && <p className="mz-foot" data-testid="mz-mr-spoton">Spot on: {r.spotOn.map((x) => (x.playerId === playerId ? "you" : nameOf(x.playerId))).join(", ")}</p>}
        <p className="mz-foot">{round < of ? "The next question is coming up." : "That was the last question."}</p>
      </main>
    );
  }

  if (st.mySkipped) {
    return (
      <main className="mz-screen" aria-label={`${title}: sitting this round out`} data-testid="mz-mr-wait">
        <GameHeader title={title} objective="Sitting this round out" accent={2} />
        <MchezoWaiting label="Waiting for the room" players={players} playerId={playerId} publicGame={publicGame} footNote={`${counts}.`} />
      </main>
    );
  }

  const step = st.myPrediction === undefined ? 1 : st.myVote === undefined ? 2 : 3;
  if (step === 3) {
    return (
      <main className="mz-screen" aria-label={`${title}: locked in, round ${round} of ${of}`} data-testid="mz-mr-wait">
        <GameHeader title={title} objective="Locked in" accent={2} />
        <p className="mz-mr-round">Round {round} of {of}</p>
        <h2 className="mz-mr-prompt" data-testid="mz-mr-prompt">{st.prompt}</h2>
        <p className="mz-mr-mine" data-testid="mz-mr-locked">You predicted <b>{st.myPrediction === "a" ? st.a : st.b}</b> and voted <b>{st.myVote === "a" ? st.a : st.b}</b>.</p>
        <MchezoWaiting label="Waiting for the room" players={players} playerId={playerId} publicGame={publicGame} footNote={`${counts}. The reveal comes when everyone's in or time runs out.`} />
      </main>
    );
  }
  const action = step === 1 ? "majority-predict" : "majority-vote";
  return (
    <main className="mz-screen" aria-label={`${title}: round ${round} of ${of}, step ${step} of 2`} data-testid={step === 1 ? "mz-mr-predict" : "mz-mr-vote"}>
      <GameHeader title={title} objective={step === 1 ? "Predict the room" : "Now your own vote"} accent={2} />
      <p className="mz-mr-round">Round {round} of {of} · step {step} of 2</p>
      <h2 className="mz-mr-prompt" data-testid="mz-mr-prompt">{st.prompt}</h2>
      <p className="mz-mr-ask">{step === 1 ? "Which answer will MOST of the room pick?" : "Which would YOU pick? Nobody will see your vote."}</p>
      {step === 2 && <p className="mz-foot" data-testid="mz-mr-yourpred">Your prediction: {st.myPrediction === "a" ? st.a : st.b}</p>}
      <div className="mz-mr-cards">
        {(["a", "b"] as const).map((k) => (
          <Card key={k} side={k} text={(k === "a" ? st.a : st.b) ?? ""} testId={`mz-mr-${step === 1 ? "predict" : "vote"}-${k}`}
            disabled={pending !== null} chosen={pending === k}
            note={pending === k ? <span className="mz-mr-card__tag">Sending…</span> : null}
            onPick={() => void send(action, { choice: k }, k)} />
        ))}
      </div>
      {failure}
      <FeedbackLine testId="mz-mr-feedback">{counts}</FeedbackLine>
      <button type="button" className="mz-chip-btn" style={{ alignSelf: "center", marginTop: 8 }} disabled={pending !== null} onClick={() => void send("abstain", {}, "skip")} data-testid="mz-mr-skip">Skip this round</button>
    </main>
  );
}

/** Results: each round's majority, your calls, the scores, how scoring works. */
export function MchezoMajorityResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; /** Stage 7.2: a casual room's What's next panel. */ next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as MajorityView;
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  const rows = Object.entries(game.rawScores ?? publicGame?.rawScores ?? {}).map(([id, score]) => ({
    id, name: nameOf(id), score: score as number, you: id === playerId,
    detail: participationLine("majority-rules", game.outcome?.participation[id], { you: id === playerId }),
  }));
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-mr-results">
      {hero}
      {next /* Stage 7.2: what's next, right under the result heading (review 6778921208) */}
      <GameHeader title={title} objective="How well do you know this room?" accent={2} />
      {(() => { const m = majorityMoment(st.rounds, publicGame?.players ?? Object.keys(game.rawScores ?? {}), (id) => nameOf(id)); return m ? <p className="mz-moment" data-testid="results-moment">{m}</p> : null; })()}
      <ol className="mz-mr-recap">
        {(st.rounds ?? []).map((r, i) => (
          <li key={i} data-testid="mz-mr-recap-round">
            <span className="mz-foot" style={{ textAlign: "left" }}>Round {i + 1}: {r.prompt}</span>
            <span className="mz-mr-recap__line">{majorityLine(r)}</span>
          </li>
        ))}
      </ol>
      <ScoreList rows={rows} />
      <p className="mz-foot" data-testid="mz-mr-howscore">100 points for predicting the majority. When the room splits evenly, every prediction scores 50. Votes stay anonymous. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
      <OutcomeSummary gameId="majority-rules" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the question, two big cards, "N of M locked in"; at the reveal, the totals and who called it. */
export function MajorityTv({ game, title, nameOf }: { game: PublicGame; title: string; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as MajorityView;
  const round = (st.round ?? 0) + 1;
  if (st.phase === "reveal" && st.result) {
    const r = st.result;
    return (
      <section className="mz-tvshow-mr" data-testid="tv-live-majority-rules">
        <span className="mz-tv-kicker">{title} · round {round} of {st.roundCount ?? 5} · the reveal</span>
        <h1 className="mz-tvshow-h1">{r.prompt}</h1>
        <div className="mz-tvshow-mr__bars"><Bars r={r} /></div>
        <p className="mz-tvshow-line" data-testid="tv-mr-verdict">{majorityLine(r)}</p>
        {r.spotOn.length > 0 && <p className="mz-tvshow-line mz-tvshow-line--muted">Spot on: {r.spotOn.map((x) => nameOf(x.playerId)).join(", ")}</p>}
      </section>
    );
  }
  return (
    <section className="mz-tvshow-mr" data-testid="tv-live-majority-rules">
      <span className="mz-tv-kicker">{title} · round {round} of {st.roundCount ?? 5}</span>
      <h1 className="mz-tvshow-h1" data-testid="tv-mr-prompt">{st.prompt}</h1>
      <div className="mz-tvshow-mr__cards">
        <div className="mz-mr-card mz-mr-card--a"><span className="mz-mr-card__mark">{SIDE.a.mark} A</span><span className="mz-mr-card__text">{st.a}</span></div>
        <TVRing value={st.done ?? 0} total={Math.max(1, st.total ?? game.players.length)} color="var(--mz-answer-1)">
          <span className="mz-tvshow-ring" data-testid="tv-live-progress"><b>{st.done ?? 0} of {st.total ?? game.players.length}</b> locked in</span>
        </TVRing>
        <div className="mz-mr-card mz-mr-card--b"><span className="mz-mr-card__mark">{SIDE.b.mark} B</span><span className="mz-mr-card__text">{st.b}</span></div>
      </div>
      <p className="mz-tvshow-line mz-tvshow-line--muted">Predict on your phone which answer most of the room will pick, then vote. Votes stay anonymous.</p>
    </section>
  );
}

/** TV post-game review: every round's question and how the room voted (totals only). */
export function MajorityReview({ game }: { game: PublicGame }) {
  const st = (game.state ?? {}) as MajorityView;
  return (
    <ol className="mz-mr-recap" data-testid="tv-mr-review">
      {(st.rounds ?? []).map((r, i) => <li key={i}><b>Round {i + 1}: {r.prompt}</b><span className="mz-mr-recap__line">{majorityLine(r)}</span></li>)}
    </ol>
  );
}
