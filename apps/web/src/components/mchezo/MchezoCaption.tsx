/**
 * Caption Clash (Sprint 4): a social party round, three times over.
 *   write  -> a vivid prompt, a roomy caption box, one Submit.
 *   vote   -> anonymous caption cards; yours is marked "Yours" and can't be
 *             picked; one tap votes. Nobody sees who wrote what.
 *   between rounds -> last round's captions with vote counts (no names).
 *   results -> each round's winning caption, now with its author, + scores.
 * The server owns deadlines, anonymity, voting rules and scores.
 */
import { useEffect, useState, type ReactNode } from "react";
import { SendNote } from "./SendNote.js";
import { Keycap, MchezoWaiting, OutcomeSummary } from "../../ui/mchezo/index.js";
import { FeedbackLine, GameHeader, ScoreList } from "../../ui/mchezo/components/GameKit.js";
import { participationLine } from "../../ui/mchezo/lib/lifecycle.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface CapCaption { id: string; text: string; votes?: number; author?: string; mine?: boolean }
interface CapRound { prompt: string; captions: CapCaption[] }
interface CaptionState {
  phase?: "caption" | "vote" | "finished";
  roundIndex?: number;
  roundCount?: number;
  prompt?: string;
  submitted?: number;
  totalPlayers?: number;
  captions?: CapCaption[];
  myCaption?: string;
  myVote?: string;
  myAbstained?: boolean;
  lastRound?: CapRound;
  rounds?: CapRound[];
}
const MAX = 140;

function PromptCard({ prompt, round, of }: { prompt: string; round: number; of: number }) {
  return (
    <section className="mz-cap-prompt" aria-label={`Round ${round} of ${of}. Prompt: ${prompt}`}>
      <span className="mz-cap-prompt__label">Round {round} of {of} · the scene</span>
      <p className="mz-cap-prompt__text" data-testid="mz-cap-prompt">{prompt}</p>
    </section>
  );
}

function LastRound({ r }: { r: CapRound }) {
  const top = r.captions[0];
  if (!top || top.votes === 0) return null;
  return (
    <p className="mz-foot" data-testid="mz-cap-last">Last round’s favourite: <b>“{top.text}”</b> — {top.votes} vote{top.votes === 1 ? "" : "s"}{top.mine ? " (yours!)" : ""}</p>
  );
}

export interface MchezoCaptionDeps {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  /** Resolves false when the action did not reach the game or was refused. */
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  /** The app's human sentence for the last failed action, if any. */
  error?: string;
  /** Stage 5.1 (2C): the server lists the unconfirmed send as accepted for this player. */
  landed?: boolean;
}

/**
 * Stage 4 (audit Stage 3, Game 7): a caption or vote counts only when the
 * server has it. "Your vote ✓" and "Caption is in" come from the server's
 * view, never from the tap; a tap that fails says so, keeps the words, and
 * can be tried again.
 */
export function MchezoCaption({ game, publicGame, players, playerId, title, intent, error, landed }: MchezoCaptionDeps) {
  const st = (game.state ?? {}) as CaptionState;
  const round = (st.roundIndex ?? 0) + 1;
  const of = st.roundCount ?? 3;
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  const phaseKey = `${st.roundIndex ?? 0}:${st.phase ?? ""}`;
  // A new round starts with an empty box (the last one's words were sent).
  useEffect(() => { setDraft(""); }, [st.roundIndex]);
  const send = async (action: string, payload: Record<string, unknown>) => {
    const at = phaseKey;
    setPending(true);
    setFailedAt(null);
    try {
      const ok = await intent(game.id, action, payload);
      if (ok === false) setFailedAt(at);
    } finally { setPending(false); setVoting(null); }
  };
  const failure = <SendNote shown={failedAt === phaseKey} landed={landed} error={error} testId="mz-cap-error" />;
  const counts = `${st.submitted ?? 0} of ${st.totalPlayers ?? players.length}`;

  if (st.phase === "vote") {
    const caps = st.captions ?? [];
    const voted = st.myVote;
    const done = !!st.myVote || st.myAbstained === true;
    return (
      <main className="mz-screen" aria-label={`${title}: vote, round ${round} of ${of}`} data-testid="mz-cap-vote">
        <GameHeader title={title} objective={done ? "Vote is in" : "Vote for the funniest caption"} accent={1} />
        <PromptCard prompt={st.prompt ?? ""} round={round} of={of} />
        {caps.length === 0 ? <p className="mz-foot">Nobody wrote a caption this round.</p> : (
          <div className="mz-cap-votes" role="group" aria-label="Captions, anonymous">
            {caps.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`mz-cap-card${c.mine ? " mz-cap-card--yours" : ""}`}
                aria-pressed={voted === c.id}
                disabled={c.mine || done || pending}
                onClick={() => { setVoting(c.id); void send("caption-vote", { captionId: c.id }); }}
                data-testid={c.mine ? "mz-cap-yours" : "mz-cap-option"}
              >
                {c.mine && <span className="mz-cap-card__tag">Yours — you can’t vote for it</span>}
                {voted === c.id ? <span className="mz-cap-card__tag">Your vote ✓</span> : pending && voting === c.id ? <span className="mz-cap-card__tag">Sending…</span> : null}
                “{c.text}”
              </button>
            ))}
          </div>
        )}
        {failure}
        <FeedbackLine tone={done ? "good" : "neutral"} testId="mz-cap-feedback">{st.myVote ? `Voted. ${counts} have voted.` : st.myAbstained ? "You skipped this vote." : `Tap one. Votes are anonymous. ${counts} have voted.`}</FeedbackLine>
        {!done && caps.length > 0 && <button type="button" className="mz-chip-btn" style={{ alignSelf: "center", marginTop: 10 }} onClick={() => void send("abstain", {})}>Skip this vote</button>}
      </main>
    );
  }

  // Write phase.
  const mine = st.myCaption;
  if (mine !== undefined || st.myAbstained) {
    return (
      <main className="mz-screen" aria-label={`${title}: waiting, round ${round} of ${of}`} data-testid="mz-cap-wait">
        <GameHeader title={title} objective={mine !== undefined ? "Caption is in" : "Sitting this round out"} accent={1} />
        <PromptCard prompt={st.prompt ?? ""} round={round} of={of} />
        {mine !== undefined && (
          <div className="mz-cap-mine"><span className="mz-cap-mine__label">Your caption</span><p className="mz-cap-mine__text" data-testid="mz-cap-mine">“{mine}”</p></div>
        )}
        <MchezoWaiting label="Waiting for captions" players={players} playerId={playerId} publicGame={publicGame} footNote={`${counts} have written. Voting starts when everyone is in or time runs out.`} />
      </main>
    );
  }
  const left = MAX - draft.length;
  return (
    <main className="mz-screen" aria-label={`${title}: write, round ${round} of ${of}`} data-testid="mz-cap-write">
      <GameHeader title={title} objective="Write the funniest caption" accent={1} />
      {st.lastRound && <LastRound r={st.lastRound} />}
      <PromptCard prompt={st.prompt ?? ""} round={round} of={of} />
      <form className="mz-cap-entry" onSubmit={(e) => { e.preventDefault(); const c = draft.trim(); if (c && !pending) void send("caption-submit", { caption: c }); }}>
        <label className="mz-sr" htmlFor="mz-cap-input">Your caption</label>
        <textarea id="mz-cap-input" data-testid="mz-cap-input" maxLength={MAX} value={draft} placeholder="Something that would make Grandma laugh…" onChange={(e) => setDraft(e.target.value.slice(0, MAX))} />
        <span className="mz-cap-count" aria-live="off">{left} left</span>
        <Keycap type="submit" block disabled={!draft.trim() || pending} data-testid="mz-cap-submit">{pending ? "Sending…" : "Submit caption"}</Keycap>
      </form>
      {failure}
      <FeedbackLine testId="mz-cap-feedback">Captions are anonymous while everyone votes.</FeedbackLine>
      <button type="button" className="mz-chip-btn" style={{ alignSelf: "center", marginTop: 6 }} onClick={() => void send("abstain", {})}>Skip this round</button>
    </main>
  );
}

/** Results: each round's best caption with its author, then the scores. */
export function MchezoCaptionResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; /** Stage 7.2: a casual room's What's next panel. */ next?: ReactNode }) {
  const st = (game.state ?? {}) as CaptionState;
  const nameOf = (id?: string) => (id ? players.find((p) => p.id === id)?.displayName ?? "Someone" : "Someone");
  const rows = Object.entries(game.rawScores ?? publicGame?.rawScores ?? {}).map(([id, score]) => ({
    id, name: nameOf(id), score: score as number, you: id === playerId,
    detail: participationLine("caption-clash", game.outcome?.participation[id], { you: id === playerId }),
  }));
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-cap-results">
      {hero}
      <GameHeader title={title} objective="The room’s favourites" accent={1} />
      <div className="mz-cap-votes">
        {(st.rounds ?? []).map((r, i) => {
          const best = r.captions[0];
          return (
            <section key={i} aria-label={`Round ${i + 1}`}>
              <p className="mz-foot" style={{ textAlign: "left", marginBottom: 6 }}>Round {i + 1}: {r.prompt}</p>
              {best ? (
                <div className={`mz-cap-result${best.votes ? " mz-cap-result--winner" : ""}`}>
                  <span className="mz-cap-result__text">“{best.text}”</span>
                  <span className="mz-cap-result__by">by {best.author === playerId ? "you" : nameOf(best.author)}</span>
                  <span className="mz-cap-result__votes">{best.votes ?? 0}<small>vote{best.votes === 1 ? "" : "s"}</small></span>
                </div>
              ) : <p className="mz-foot">No captions this round.</p>}
            </section>
          );
        })}
      </div>
      <ScoreList rows={rows} />
      <p className="mz-foot">25 points for writing a caption, 100 for every vote it gets.</p>
      <OutcomeSummary gameId="caption-clash" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      {next}
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the scene big; during voting the anonymous captions; never authors. */
export function CaptionTv({ game }: { game: PublicGame }) {
  const st = (game.state ?? {}) as CaptionState;
  if (game.status === "finished") {
    return (
      <section aria-label="Caption Clash favourites" className="mz-cap-tv-cards">
        {(st.rounds ?? []).map((r, i) => r.captions[0] && <div key={i} className="mz-cap-card">“{r.captions[0].text}” — {r.captions[0].votes} vote{r.captions[0].votes === 1 ? "" : "s"}</div>)}
      </section>
    );
  }
  return (
    <section aria-label="Caption Clash">
      <p className="mz-cap-tv-prompt" data-testid="mz-cap-tv-prompt">{st.prompt}</p>
      {st.phase === "vote" && <div className="mz-cap-tv-cards">{(st.captions ?? []).map((c) => <div key={c.id} className="mz-cap-card">“{c.text}”</div>)}</div>}
      <p className="mz-lede" style={{ marginTop: 20 }}>{st.phase === "vote" ? "Vote on your phones" : "Write your captions"} · {st.submitted ?? 0} of {st.totalPlayers ?? game.players.length} done</p>
    </section>
  );
}
