/**
 * Stage 12.12 (docs/stage12/stage1212.md §2): Territory on the phones and the TV.
 *
 *   HexBoard                the 19-cell board: each team's cells in its colour AND its shape; claimable cells are buttons
 *   MchezoTerritory         the question (one tap answers for the team), then the claim (pick a cell next to your land)
 *   MchezoTerritoryResults  the final board and every round
 *   TerritoryTv, TerritoryReview
 *
 * Secrecy (D-S1212-02): before a question closes, a team's answer is on its own phones only (the TV and other teams see
 * that it answered); a team's claim stays on its own phones until the round ends. Every fact here is the server's.
 */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { FeedbackLine, GameHeader } from "../../ui/mchezo/components/GameKit.js";
import { Keycap, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { SendNote } from "./SendNote.js";
import { ORDINAL, TeamLabel, TeamScoreboard, ordinal, teamDef, type TeamScoreRow } from "./TeamGameKit.js";
import { TEAM_SHAPE } from "./Teams.js";
import { TERRITORY_CELLS, cellName, hexCentre } from "../../../../../src/shared/territoryBoard.js";
import type { TeamDef } from "../../../../../src/shared/teams.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface TtStatus { teamId: string; answered: boolean; choice?: number; right?: boolean; seconds?: number; picked?: boolean }
interface TtClaim { teamId: string; cell: number; from: string | null; auto: boolean; extra: boolean; wanted?: number }
interface TtRound { prompt: string; answer: string; teams: { teamId: string; answered: boolean; right: boolean }[]; claims: TtClaim[] }
export interface TerritoryView {
  round?: number; roundCount?: number; phase?: "question" | "claim" | "finished";
  teamTotals?: TeamScoreRow[]; teamLand?: { teamId: string; cells: number; region: number }[];
  board?: { owner: (string | null)[]; homes: Record<string, number> };
  question?: { prompt: string; options: string[] }; teamStatus?: TtStatus[];
  correctIndex?: number; explanation?: string; order?: string[]; catchUp?: string; lastClaims?: TtClaim[]; rounds?: TtRound[];
  myTeamId?: string; myTotal?: number; teamAnswer?: { choice: number; by: string }; teamPick?: { cell: number; by: string };
  claimable?: number[]; myRight?: boolean;
}

type Game = { teams?: { list: TeamDef[] } };
type NameOf = (id?: string | null) => string;
const LETTERS = ["A", "B", "C", "D"];
const SIZE = 50;
const corners = (x: number, y: number, s: number) => Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return `${(x + s * Math.cos(a)).toFixed(1)},${(y + s * Math.sin(a)).toFixed(1)}`;
}).join(" ");

const teamName = (game: Game, id?: string | null) => teamDef(game, id)?.name ?? "A team";

/** "Team Coral took C2 from Team Sun", "Team Mint got D3 (catch-up)". */
export function claimLine(game: Game, c: TtClaim): string {
  return `${teamName(game, c.teamId)} ${c.from ? `took ${cellName(c.cell)} from ${teamName(game, c.from)}` : `got ${cellName(c.cell)}`}${c.extra ? " (catch-up)" : c.wanted !== undefined ? ` (${cellName(c.wanted)} went to a faster team)` : ""}`;
}

/** The board. With `onPick`, the claimable cells are buttons. */
export function HexBoard({ game, view, claimable, onPick, picked, fresh, mine, testId, tv, disabled }: {
  game: Game; view: TerritoryView; claimable?: readonly number[]; onPick?: (cell: number) => void; picked?: number;
  fresh?: readonly TtClaim[]; mine?: string; testId: string; tv?: boolean; disabled?: boolean;
}) {
  const owner = view.board?.owner ?? [];
  const homes = new Set(Object.values(view.board?.homes ?? {}));
  const can = new Set(claimable ?? []);
  const isFresh = new Set((fresh ?? []).map((c) => c.cell));
  // Half the board's width and height: 2.5 cell widths across from the centre, 2 rows of 1.5 sizes plus a point down.
  const w = SIZE * Math.sqrt(3) * 2.5 + 6, hh = SIZE * 3 + SIZE + 6;
  const key = (cell: number) => (e: KeyboardEvent) => { if ((e.key === "Enter" || e.key === " ") && onPick && !disabled) { e.preventDefault(); onPick(cell); } };
  return (
    <svg className={`mz-tt-board${tv ? " mz-tt-board--tv" : ""}`} viewBox={`${-w} ${-hh} ${w * 2} ${hh * 2}`} role="group" aria-label="The board" data-testid={testId}>
      {TERRITORY_CELLS.map((c) => {
        const { x, y } = hexCentre(c.id, SIZE);
        const o = owner[c.id] ?? null;
        const def = teamDef(game, o);
        const claimableHere = can.has(c.id) && !!onPick;
        const label = `${cellName(c.id)}: ${def ? `${def.name}${homes.has(c.id) ? "'s home" : ""}` : "empty"}${claimableHere ? ", tap to claim" : ""}${picked === c.id ? ", your team's pick" : ""}`;
        return (
          <g key={c.id} className={`mz-tt-cell${def ? ` mz-team--${def.color} is-owned` : ""}${o && o === mine ? " is-mine" : ""}${claimableHere ? " is-claimable" : ""}${picked === c.id ? " is-picked" : ""}${isFresh.has(c.id) ? " is-fresh" : ""}${homes.has(c.id) ? " is-home" : ""}`}
            data-testid={`${testId}-cell-${c.id}`} data-owner={o ?? ""} data-name={cellName(c.id)}
            {...(claimableHere ? { role: "button", tabIndex: disabled ? -1 : 0, "aria-disabled": disabled || undefined, onClick: () => { if (!disabled) onPick!(c.id); }, onKeyDown: key(c.id) } : { role: "img" })}
            aria-label={label}>
            <polygon points={corners(x, y, SIZE - 2)} />
            {homes.has(c.id) && <polygon className="mz-tt-cell__home" points={corners(x, y, SIZE - 9)} />}
            <text x={x} y={y - 4} className="mz-tt-cell__mark" aria-hidden="true">{def ? TEAM_SHAPE[def.color] : ""}</text>
            <text x={x} y={y + 20} className="mz-tt-cell__name" aria-hidden="true">{cellName(c.id)}</text>
          </g>
        );
      })}
    </svg>
  );
}

const landOf = (st: TerritoryView) => (teamId: string): ReactNode => {
  const l = st.teamLand?.find((x) => x.teamId === teamId);
  return l ? `${l.cells} ${l.cells === 1 ? "cell" : "cells"} · ${l.region} joined` : null;
};

const statusOf = (st: TerritoryView) => (teamId: string): ReactNode => {
  const s = st.teamStatus?.find((x) => x.teamId === teamId);
  const land = landOf(st)(teamId);
  if (!s) return land;
  if (st.phase === "question") return `${s.answered ? "✓ Answered" : "Thinking…"} · ${land}`;
  if (s.right) return `✓ Right${st.order ? ` ${ORDINAL[st.order.indexOf(teamId)] ?? ""}` : ""}${s.picked ? " · picked" : " · picking…"} · ${land}`;
  return `${s.answered ? "✗ Not this time" : "No answer"} · ${land}`;
};

export interface MchezoTerritoryDeps {
  game: PlayerGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  landed?: boolean;
}

export function MchezoTerritory({ game, players, playerId, title, intent, error, landed }: MchezoTerritoryDeps) {
  const st = (game.state ?? {}) as TerritoryView;
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
  const scores = <TeamScoreboard game={game} totals={st.teamTotals ?? []} mine={st.myTeamId} status={statusOf(st)} testId="mz-tt-scores" />;
  const last = (st.lastClaims ?? []).length > 0 && (
    <p className="mz-tt-last" data-testid="mz-tt-last">Last round: {(st.lastClaims ?? []).map((c) => claimLine(game, c)).join(" · ")}</p>
  );
  const myColor = teamDef(game, st.myTeamId)?.color;

  if (st.phase === "claim" && q) {
    const right = st.correctIndex !== undefined ? q.options[st.correctIndex] : "";
    const place = st.order && st.myTeamId ? st.order.indexOf(st.myTeamId) : -1;
    const canPick = (st.claimable ?? []).length > 0 && !st.teamPick;
    const line = st.myRight
      ? st.teamPick ? `Your team picked ${cellName(st.teamPick.cell)}${st.teamPick.by ? ` (${nameOf(st.teamPick.by)})` : ""}. If a faster team picked it too, you get the nearest free cell instead.`
        : canPick ? `Right${place >= 0 ? `, ${ordinal(place + 1)}` : ""}! Tap a cell next to your land to claim it, or steal one.` : "Right! No cell is free next to your land this time."
      : st.teamAnswer ? "Not this time: no cell for your team this round." : "Your team didn't answer: no cell this round.";
    return (
      <main className="mz-screen" aria-label={`${title}: question ${round} of ${of}, the claim`} data-testid="mz-tt-claim">
        <GameHeader title={title} objective={st.myRight ? "Claim your cell" : "The answer"} accent={2} />
        <TeamLabel game={game} teamId={st.myTeamId} testId="mz-tt-myteam" />
        <p className="mz-mr-round">Question {round} of {of}</p>
        <p className="mz-tt-answer" data-testid="mz-tt-answer">Answer: <b>{right}</b></p>
        <FeedbackLine testId="mz-tt-status" tone={st.myRight ? undefined : "warn"}>{line}</FeedbackLine>
        {st.catchUp && st.catchUp === st.myTeamId && st.myRight && <p className="mz-tt-catchup" data-testid="mz-tt-catchup">Catch-up: your team also gets one extra cell this round.</p>}
        <HexBoard game={game} view={st} claimable={canPick ? st.claimable : undefined} onPick={canPick ? (cell) => send("territory-claim", { cell }, `c${cell}`) : undefined} picked={st.teamPick?.cell} mine={st.myTeamId} testId="mz-tt-board" disabled={!!pending} />
        <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-tt-error" />
        {scores}
      </main>
    );
  }

  const answered = st.teamAnswer;
  return (
    <main className="mz-screen" aria-label={`${title}: question ${round} of ${of}`} data-testid="mz-tt-question">
      <GameHeader title={title} objective="Answer as a team" accent={2} />
      <TeamLabel game={game} teamId={st.myTeamId} testId="mz-tt-myteam" />
      <p className="mz-mr-round" data-testid="mz-tt-round">Question {round} of {of} · one tap answers for your whole team</p>
      <h2 className="mz-mr-prompt mz-tt-prompt" data-testid="mz-tt-prompt">{q?.prompt}</h2>
      <div className="mz-tt-opts" role="group" aria-label="Answers">
        {(q?.options ?? []).map((o, i) => (
          <button key={i} type="button" className={`mz-tt-opt${answered?.choice === i ? " is-chosen" : ""}${myColor ? ` mz-team--${myColor}` : ""}`} data-testid={`mz-tt-opt-${i}`}
            disabled={!!answered || !!pending} aria-pressed={answered?.choice === i} onClick={() => send("territory-answer", { choice: i }, `a${i}`)}>
            <span className="mz-tt-opt__letter" aria-hidden="true">{LETTERS[i]}</span><span>{o}</span>
          </button>
        ))}
      </div>
      <FeedbackLine testId="mz-tt-status">{answered ? `${nameOf(answered.by) === "You" ? "You" : nameOf(answered.by)} answered for your team: ${LETTERS[answered.choice]}. Waiting for the other teams.` : "Agree first: the first tap on your team counts for all of you."}</FeedbackLine>
      <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-tt-error" />
      <HexBoard game={game} view={st} mine={st.myTeamId} fresh={st.lastClaims} testId="mz-tt-board" />
      {last}
      {scores}
    </main>
  );
}

/** Results: the final board, then every question with each team's result and the cells it took. */
export function MchezoTerritoryResults({ game, publicGame, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as TerritoryView;
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-tt-results">
      {hero}
      {next}
      <GameHeader title={title} objective="The final board" accent={2} />
      <HexBoard game={game} view={st} mine={st.myTeamId} testId="mz-tt-final-board" />
      <TeamScoreboard game={game} totals={st.teamTotals ?? []} mine={st.myTeamId} status={landOf(st)} testId="mz-tt-final-scores" />
      <ol className="mz-mr-recap">
        {(st.rounds ?? []).map((r, i) => (
          <li key={i} data-testid="mz-tt-recap-round">
            <span className="mz-foot" style={{ textAlign: "left" }}>Question {i + 1}: {r.prompt} <b>{r.answer}</b></span>
            <span className="mz-mr-recap__line">{r.teams.filter((t) => t.right).map((t) => teamName(game, t.teamId)).join(", ") || "Nobody"} got it{r.claims.length ? ` · ${r.claims.map((c) => claimLine(game, c)).join(" · ")}` : ""}</span>
          </li>
        ))}
      </ol>
      <p className="mz-foot" data-testid="mz-tt-howscore">10 points per cell, plus 5 per cell in your team’s biggest joined land. Everyone scores their team’s points. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
      <OutcomeSummary gameId="territory" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the board, big; the question (never a team's answer until it closes); the claims; each team's land. */
export function TerritoryTv({ game, title }: { game: PublicGame; title: string }) {
  const st = (game.state ?? {}) as TerritoryView;
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  const q = st.question;
  const claiming = st.phase === "claim";
  return (
    <section className="mz-tvshow-tt" data-testid="tv-live-territory">
      <HexBoard game={game} view={st} fresh={claiming ? undefined : st.lastClaims} testId="tv-tt-board" tv />
      <div className="mz-tvshow-tt__side">
        <span className="mz-tv-kicker">{title} · question {round} of {of}{claiming ? " · the claim" : ""}</span>
        <h1 className="mz-tvshow-h1 mz-tt-tvq" data-testid="tv-tt-prompt">{q?.prompt}</h1>
        <ol className="mz-tt-tvopts" data-testid="tv-tt-options">
          {(q?.options ?? []).map((o, i) => <li key={i} className={claiming && i === st.correctIndex ? "is-right" : claiming ? "is-dim" : ""}><b>{LETTERS[i]}</b> {o}</li>)}
        </ol>
        {claiming
          ? <p className="mz-tvshow-line" data-testid="tv-tt-claiming">{(st.order ?? []).length ? `${(st.order ?? []).map((t) => teamName(game, t)).join(", ")} got it: picking cells now.` : "Nobody got it this time."}</p>
          : (st.lastClaims ?? []).length > 0 && <p className="mz-tvshow-line mz-tvshow-line--muted" data-testid="tv-tt-last">Last round: {(st.lastClaims ?? []).map((c) => claimLine(game, c)).join(" · ")}</p>}
        <TeamScoreboard game={game} totals={st.teamTotals ?? []} status={statusOf(st)} tv testId="tv-tt-scores" />
      </div>
    </section>
  );
}

/** TV post-game review: the final board and every question. */
export function TerritoryReview({ game }: { game: PublicGame }) {
  const st = (game.state ?? {}) as TerritoryView;
  return (
    <div className="mz-tvshow-tt mz-tvshow-tt--review" data-testid="tv-tt-review">
      <HexBoard game={game} view={st} testId="tv-tt-review-board" tv />
      <ol className="mz-mr-recap">
        {(st.rounds ?? []).map((r, i) => <li key={i}><b>Question {i + 1}: {r.answer}</b><span className="mz-mr-recap__line">{r.claims.length ? r.claims.map((c) => claimLine(game, c)).join(" · ") : "No cells claimed."}</span></li>)}
      </ol>
    </div>
  );
}
