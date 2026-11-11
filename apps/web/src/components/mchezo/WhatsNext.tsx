/**
 * Stage 7.2 (docs/stage7/stage72.md §3.5): after a casual game, one clear
 * results screen and a "What's next" panel.
 *
 * - The host or a cohost chooses, explicitly: the lineup's Next game, Play
 *   again (a rematch of the game just played), or Take a break / Resume.
 *   Nothing starts by itself.
 * - Everyone else sees the same state in words: up next and who starts it,
 *   on a break, or that the lineup is complete.
 *
 * Display only: the server decides (one active game, the next pending item,
 * the break, the real roster). A refused press is answered here (`ask`,
 * `error`), with the same choices as the lobby.
 */
import type { ReactNode } from "react";
import type { PartyView, PlayerGame, PublicGame, PublicPlayer } from "../../types.js";
import { Keycap, OutcomeSummary } from "../../ui/mchezo/index.js";
import { GameHeader, ScoreList } from "../../ui/mchezo/components/GameKit.js";
import { participationLine } from "../../ui/mchezo/lib/lifecycle.js";
import { AnswerReview, type ReviewRow } from "./AnswerReview.js";
import { ContentSeasonLabel } from "./ContentChoice.js";
import type { SessionSeason } from "../../../../../src/shared/season.js";

export { nextState, type NextState } from "./whatsNextState.js";
import { nextState } from "./whatsNextState.js";

export interface WhatsNextProps {
  isHost: boolean;
  hostName?: string;
  /** The finished game on this screen. */
  game: { id: string; gameId: string; title: string };
  /** Play again applies to the room's last game only (the server checks this too). */
  canPlayAgain: boolean;
  lineup?: PartyView["lineup"] | null;
  onBreak: boolean;
  titleOf: (gameId: string) => string;
  busy?: boolean;
  /** A question the host must answer before a start (fewer than planned, reconnecting). */
  ask?: ReactNode;
  error?: string;
  onNext: (index: number, gameId: string) => void;
  onPlayAgain: () => void;
  onBreakChange: (on: boolean) => void;
  /** Open the planner (the lineup is complete). */
  onPlan?: () => void;
  /** Pick any game in the lobby. */
  onChoose: () => void;
  /** Stage 8.2 (§3.7): what the next game will deal (the room's content now; changed in the lobby). */
  content?: SessionSeason;
}

export function WhatsNext(p: WhatsNextProps) {
  const { state, index } = nextState(p.lineup ?? undefined, p.onBreak);
  const host = p.hostName ?? "The host";
  const total = p.lineup?.items.length ?? 0;
  const nextItem = index !== undefined ? p.lineup?.items[index] : undefined;
  const nextTitle = nextItem ? p.titleOf(nextItem.gameId) : "";
  return (
    <section className="mz-card mz-next" aria-labelledby="mz-next-title" data-testid="whats-next" data-state={state} style={{ margin: "8px 16px" }}>
      <span className="mz-kicker" id="mz-next-title">What’s next</span>
      {p.content && <> <ContentSeasonLabel season={p.content} testId="whats-next-content" /></>}
      {state === "break" && (
        <>
          <h2 className="mz-next__title" data-testid="next-status">On a break</h2>
          <p className="mz-foot mz-next__line">{p.isHost ? "Nothing starts until you resume." : `Nothing starts until ${host} resumes.`}</p>
        </>
      )}
      {state === "next" && nextItem && (
        p.isHost
          ? <p className="mz-foot mz-next__line" data-testid="next-status">Quick Party: game {index! + 1} of {total} is {nextTitle}.</p>
          : <><h2 className="mz-next__title">Up next: {nextTitle}</h2><p className="mz-foot mz-next__line" data-testid="next-status">Game {index! + 1} of {total}. {host} starts it.</p></>
      )}
      {state === "complete" && (
        <>
          <h2 className="mz-next__title" data-testid="next-status">That was the whole lineup</h2>
          <p className="mz-foot mz-next__line">{p.isHost ? "Play one again, plan another lineup, or pick any game." : `${host} picks what’s next.`}</p>
        </>
      )}
      {state === "free" && !p.isHost && <p className="mz-foot mz-next__line" data-testid="next-status">{host} picks what’s next.</p>}
      {p.isHost && p.ask}
      {p.isHost && p.error && <p className="err mz-next__error" role="alert" data-testid="next-error">{p.error}</p>}
      {p.isHost && (
        <div className="mz-next__actions" role="group" aria-label="Choose what's next">
          {state === "break" && (
            <Keycap block data-testid="next-resume" disabled={p.busy} onClick={() => p.onBreakChange(false)}>Resume</Keycap>
          )}
          {state === "next" && nextItem && (
            <Keycap block data-testid="next-game" disabled={p.busy} onClick={() => p.onNext(index!, nextItem.gameId)}>Next game: {nextTitle}</Keycap>
          )}
          {state !== "break" && p.canPlayAgain && (
            <Keycap block variant={state === "next" ? "surface" : "brand"} size="md" data-testid="next-play-again" disabled={p.busy} onClick={p.onPlayAgain}>Play again: {p.game.title}</Keycap>
          )}
          {state === "complete" && p.onPlan && (
            <Keycap block variant="surface" size="md" data-testid="next-plan" disabled={p.busy} onClick={p.onPlan}>Plan another lineup</Keycap>
          )}
          {state !== "break" && (
            <div className="mz-next__more">
              <button type="button" className="mz-chip-btn" data-testid="next-choose" disabled={p.busy} onClick={p.onChoose}>{state === "next" ? "Pick a different game" : "Pick another game"}</button>
              <button type="button" className="mz-chip-btn" data-testid="next-break" disabled={p.busy} onClick={() => p.onBreakChange(true)}>Take a break</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Stage 7.2: the results screen for a casual game that has no results screen
 * of its own (it used the old shell: the 🎄 header, Championship, "Practice"
 * and a second winner block). One result heading (`hero`), what's next right
 * under it, the standings from the server's recorded scores, how the game
 * ended, and this player's own answers where the game has them.
 */
export function CasualResults({ game, publicGame, players, playerId, title, hero, review, next, onBackToLobby }: {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  hero?: ReactNode;
  review?: ReviewRow[];
  next?: ReactNode;
  onBackToLobby: () => void;
}) {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? "A player";
  const scores = publicGame?.rawScores ?? game.rawScores ?? {};
  const rows = Object.entries(scores).map(([id, score]) => ({
    id, name: nameOf(id), score: score as number, you: id === playerId,
    detail: participationLine(game.gameId, game.outcome?.participation[id], { you: id === playerId, choseSatOut: id === playerId && game.abstained === true }),
  }));
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="casual-results" data-game-id={game.id}>
      {hero}
      {next /* right under the result heading, before the standings and the answers (review 6778921208) */}
      <GameHeader title={title} objective="Final standings" accent={3} />
      {rows.length > 0 ? <ScoreList rows={rows} /> : <p className="mz-foot">No scores were recorded for this game.</p>}
      <OutcomeSummary gameId={game.gameId} outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} youChoseSatOut={game.abstained === true} />
      {review && review.length > 0 && <AnswerReview rows={review} title="Your answers" />}
      <div className="mz-grow" />
      <Keycap block variant="surface" onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}
