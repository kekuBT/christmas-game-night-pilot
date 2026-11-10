/**
 * Stage 5 (S5-A): the live show. One Night Circle presentation for the room's
 * TV and for spectators, designed at 1920×1080 and scaled to the screen.
 *
 * It is drawn ONLY from the TvFeed (lib/tvfeed.ts): the room's public facts.
 * Every game panel reads the server's public projection of that game, so the
 * TV can never show a secret word, a private answer, who wrote what, or an
 * answer that can still be played.
 *
 * One label always says what the screen is: Lobby, Getting ready, Live,
 * Final standings or Post-game review. A finished game opens on its final
 * standings; the review is a separate, labelled screen ("this game is
 * over"), so a look back can't be mistaken for new play (the Stage 3 audit's
 * confusion).
 *
 * Director controls are presentation only and local to this screen: which
 * finished-game screen to show, the lobby view, pausing or replaying the
 * screen's animations. They never call the server, so no game clock can be
 * paused, moved or changed from here.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GameClock, PlayerToken, TVLeaderboard, TVRing, TVStage, Wordmark, rankStandings } from "../../ui/mchezo/index.js";
import { lineupLine, TV_MODE_LABEL, tvModeFor, winnerLine, type TvFeed, type TvMode } from "../../ui/mchezo/lib/tvfeed.js";
import { toMzPlayers } from "./adapters.js";
import type { PublicGame, RegistryGame } from "../../types.js";

/** One public sentence per game: how it works, never what the answers are. */
import { TV_HINT } from "../../ui/mchezo/lib/tvHints.js";
import { titleFor } from "../../ui/mchezo/lib/names.js";
export { TV_HINT };

/** A game's mode word: Official, Casual (casual rooms) or Practice (a Cup's practice game). */
const modeWord = (official: boolean | undefined, casual?: boolean) => (official ? "Official" : casual ? "Casual" : "Practice");

export interface TvShowProps {
  feed: TvFeed;
  registry: RegistryGame[];
  /** A game's own live panel (Caption Clash, Word Connections, new games); null uses the shared one. */
  renderLive?: (g: PublicGame) => ReactNode | null;
  /** A finished game's own final screen (Word Connections: solution and standings); null uses the shared one. */
  renderFinal?: (g: PublicGame) => ReactNode | null;
  /** A finished game's post-game review content (answers, favourites); null when there is nothing to review. */
  renderReview?: (g: PublicGame) => ReactNode | null;
  onBack: () => void;
  backLabel: string;
}

export function TvShow({ feed, registry, renderLive, renderFinal, renderReview, onBack, backLabel }: TvShowProps) {
  const latest = feed.games.at(-1);
  const [choice, setChoice] = useState<"auto" | "lobby" | "final" | "review">("auto");
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  // A new game, or a change of status, resets the operator's choice.
  useEffect(() => { setChoice("auto"); }, [latest?.id, latest?.status]);
  const mode: TvMode = tvModeFor(latest, choice);
  const titleOf = (id: string) => titleFor(id, registry);
  const nameOf = (id: string) => feed.players.find((p) => p.id === id)?.displayName ?? "A player";
  const review = latest && mode !== "live" && latest.status === "finished" ? renderReview?.(latest) ?? null : null;
  const game = mode === "lobby" ? undefined : latest;

  return (
    <div className={`mz-tvshow${paused ? " mz-tvshow--paused" : ""}`} data-testid="tv-show" data-mode={mode} data-game={game?.gameId ?? ""}>
      <TVStage label="Game night TV">
        <header className="mz-tvshow-top">
          <div className="mz-tvshow-top__left"><Wordmark size={34} />{game && <span className="mz-tvshow-title">{titleOf(game.gameId)}</span>}</div>
          <div className="mz-tvshow-top__mid">
            <span className={`mz-tvshow-mode mz-tvshow-mode--${mode}`} data-testid="tv-mode" data-mode={mode}>{mode === "live" && <i aria-hidden="true" />}{TV_MODE_LABEL[mode]}</span>
            {game && <span className={`mz-tvshow-chip mz-tvshow-chip--${game.official ? "official" : "practice"}`}>{modeWord(game.official, feed.casual)}</span>}
          </div>
          <div className="mz-tvshow-top__right">
            {(feed.spectatorCount ?? 0) > 0 && <span className="mz-tv-pill" data-testid="tv-watching-count">👁 {feed.spectatorCount} watching</span>}
            <span className="mz-tv-pill">Join <b>{feed.joinCode ?? "…"}</b></span>
          </div>
        </header>
        <main className="mz-tvshow-main" key={replay} aria-live="polite">
          {mode === "lobby" && <TvLobby feed={feed} titleOf={titleOf} nameOf={nameOf} registry={registry} />}
          {mode === "live" && latest && (renderLive?.(latest) ?? <TvLive game={latest} title={titleOf(latest.gameId)} nameOf={nameOf} casual={feed.casual} />)}
          {mode === "final" && latest && (renderFinal?.(latest) ?? <TvFinal game={latest} title={titleOf(latest.gameId)} feed={feed} nameOf={nameOf} titleOf={titleOf} />)}
          {mode === "review" && latest && (
            <section className="mz-tvshow-review" data-testid="tv-review">
              <p className="mz-tvshow-review__note">This game is over. This is a look back: nothing here can still be answered.</p>
              {review ?? <p className="mz-tvshow-empty">Nothing to review for this game.</p>}
            </section>
          )}
        </main>
        <footer className="mz-tvshow-foot">
          <span className="mz-tvshow-privacy">Public view: no secret words, private answers, or answers that can still be played.</span>
          <nav className="mz-tvshow-director" aria-label="TV controls">
            {latest?.status === "finished" && <button type="button" className="mz-chip-btn" aria-pressed={mode === "final"} data-testid="tv-dir-final" onClick={() => setChoice("final")}>Final standings</button>}
            {latest?.status === "finished" && review && <button type="button" className="mz-chip-btn" aria-pressed={mode === "review"} data-testid="tv-dir-review" onClick={() => setChoice("review")}>Post-game review</button>}
            {latest?.status === "finished" && <button type="button" className="mz-chip-btn" aria-pressed={mode === "lobby"} data-testid="tv-dir-lobby" onClick={() => setChoice("lobby")}>Lobby view</button>}
            <button type="button" className="mz-chip-btn" aria-pressed={paused} data-testid="tv-dir-pause" onClick={() => setPaused((p) => !p)}>{paused ? "Resume animations" : "Pause animations"}</button>
            <button type="button" className="mz-chip-btn" data-testid="tv-dir-replay" onClick={() => { setPaused(false); setReplay((n) => n + 1); }}>Replay</button>
            <button type="button" className="mz-chip-btn" data-testid="tv-back" onClick={onBack}>{backLabel}</button>
          </nav>
        </footer>
      </TVStage>
    </div>
  );
}

/* ------------------------------------------------------------- lobby */

function TvLobby({ feed, titleOf, nameOf, registry }: { feed: TvFeed; titleOf: (id: string) => string; nameOf: (id: string) => string; registry: RegistryGame[] }) {
  const mz = toMzPlayers(feed.players);
  const away = (p: TvFeed["players"][number]) => p.presence ? p.presence === "away" : !p.connected;
  const here = feed.players.filter((p) => !away(p));
  const next = feed.upNext ? registry.find((r) => r.id === feed.upNext!.gameId) : undefined;
  const short = next ? Math.max(0, next.minPlayers - here.length) : 0;
  const over = next ? Math.max(0, here.length - next.maxPlayers) : 0;
  const finished = feed.games.filter((g) => g.status === "finished").slice(-5).reverse();
  const cup = feed.championship.slice(0, 3);
  // Stage 7.2: a casual room's lineup and break (public planning facts).
  const lineup = feed.party?.lineup;
  const flow = lineupLine(feed, titleOf);
  const joinUrl = typeof location !== "undefined" ? `${location.host}/join` : "/join";
  return (
    <div className="mz-tvshow-lobby" data-testid="tv-lobby">
      <section className="mz-tvshow-card mz-tvshow-join">
        <span className="mz-tv-kicker">Join the game</span>
        <b className="mz-tvshow-code" data-testid="tv-join-code">{feed.joinCode ?? "…"}</b>
        <span className="mz-tvshow-url">{joinUrl}</span>
        <ul className="mz-tvshow-roster" aria-label={`${here.length} here`}>
          {feed.players.map((p, i) => (
            <li key={p.id} className={away(p) ? "is-away" : ""}>
              <PlayerToken player={mz[i]!} index={i} size={48} badge={away(p) ? "offline" : null} />
              <span>{p.displayName}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="mz-tvshow-side">
        {feed.session?.onBreak && (
          <section className="mz-tvshow-card mz-tvshow-break" data-testid="tv-break">
            <span className="mz-tv-kicker">On a break</span>
            <h2 className="mz-tvshow-h2">Back soon</h2>
            <p className="mz-tvshow-line mz-tvshow-line--muted">The host resumes when everyone’s back. Nothing starts until then.</p>
          </section>
        )}
        {lineup && lineup.items.length > 0 && (
          <section className="mz-tvshow-card" data-testid="tv-lineup" data-next={lineup.next ?? ""} data-complete={String(!!lineup.complete)}>
            <span className="mz-tv-kicker">Quick Party · {lineup.complete ? "complete" : `game ${(lineup.next ?? lineup.items.findIndex((i) => i.status !== "completed")) + 1} of ${lineup.items.length}`}</span>
            <ol className="mz-tvshow-recent">
              {lineup.items.map((it, i) => (
                <li key={i} data-status={it.status ?? (it.started ? "started" : "pending")}>
                  <b>{titleOf(it.gameId)}</b>{it.status === "completed" ? " · played ✓" : it.status === "briefing" || it.status === "playing" ? " · on now" : i === lineup.next ? " · next" : ""}
                </li>
              ))}
            </ol>
            {flow?.kind === "complete" && <p className="mz-tvshow-line">{flow.text}</p>}
          </section>
        )}
        <section className="mz-tvshow-card" data-testid="tv-up-next">
          <span className="mz-tv-kicker">Up next</span>
          {next ? (
            <>
              <h2 className="mz-tvshow-h2">{next.title}</h2>
              <p className="mz-tvshow-line">{feed.upNext!.official ? "Official · counts toward the Cup" : feed.casual ? "Casual · just for fun" : "Practice · no Cup points"}</p>
              {short > 0 && <p className="mz-tvshow-line mz-tvshow-line--warn">Needs {short} more {short === 1 ? "player" : "players"} ({next.minPlayers}–{next.maxPlayers})</p>}
              {over > 0 && <p className="mz-tvshow-line mz-tvshow-line--warn">Up to {next.maxPlayers} players · {here.length} here</p>}
              <p className="mz-tvshow-line mz-tvshow-line--muted">The host starts it when everyone's ready.</p>
            </>
          ) : <p className="mz-tvshow-line">The host is choosing the next game.</p>}
        </section>
        {cup.length > 0 && (
          <section className="mz-tvshow-card" data-testid="tv-cup">
            <span className="mz-tv-kicker">{feed.cupLabel ?? "Family Cup"} · Day {feed.championshipDay ?? 1} of 7</span>
            <ol className="mz-tvshow-cup">{cup.map((r, i) => <li key={r.playerId}><b>{i + 1}</b> {nameOf(r.playerId)} <span>{r.total} pts{r.eligible ? "" : " · qualifying"}</span></li>)}</ol>
          </section>
        )}
        {finished.length > 0 && (
          <section className="mz-tvshow-card" data-testid="tv-recent">
            <span className="mz-tv-kicker">Tonight so far</span>
            <ol className="mz-tvshow-recent">{finished.map((g) => <li key={g.id} data-game={g.gameId}><b>{titleOf(g.gameId)}</b> · {modeWord(g.official, feed.casual)} · finished — {winnerLine(g.rawScores, nameOf)}</li>)}</ol>
          </section>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- live */

/** The shared live panel: public facts only (who's in, the clock, how many have started). */
export function TvLive({ game, title, nameOf, casual }: { game: PublicGame; title: string; nameOf: (id: string) => string; casual?: boolean }) {
  const started = game.submittedCount ?? 0;
  const total = game.totalPlayers ?? game.players.length;
  return (
    <section className="mz-tvshow-live" data-testid={`tv-live-${game.gameId}`}>
      <div className="mz-tvshow-live__left">
        <span className="mz-tv-kicker">Now playing</span>
        <h1 className="mz-tvshow-h1">{title}</h1>
        <p className="mz-tvshow-line">{modeWord(game.official, casual)} — players: {game.players.map(nameOf).join(", ")}</p>
        {TV_HINT[game.gameId] && <p className="mz-tvshow-line mz-tvshow-line--muted">{TV_HINT[game.gameId]}</p>}
        <div className="mz-tvshow-clock"><GameClock game={game} tv /></div>
      </div>
      <TVRing value={started} total={Math.max(1, total)} color="var(--mz-answer-2)">
        <span className="mz-tvshow-ring" data-testid="tv-live-progress"><b>{started} of {total}</b> {total === 1 ? "has" : "have"} started · answer on your phones</span>
      </TVRing>
    </section>
  );
}

/* ------------------------------------------------------------- final */

function TvFinal({ game, title, feed, nameOf, titleOf }: { game: PublicGame; title: string; feed: TvFeed; nameOf: (id: string) => string; titleOf: (id: string) => string }) {
  const mz = useMemo(() => toMzPlayers(feed.players), [feed.players]);
  const scores = useMemo(() => Object.entries(game.rawScores ?? {}).map(([playerId, score]) => ({ playerId, score })), [game.rawScores]);
  const ranked = rankStandings(scores, mz);
  const next = feed.upNext;
  const flow = lineupLine(feed, titleOf);
  return (
    <section className="mz-tvshow-final">
      <p className="mz-tvshow-winner" data-testid="tv-winner">{winnerLine(game.rawScores, nameOf)}</p>
      {ranked.length > 0 ? (
        <section data-testid="tv-last-standings" aria-label={`${title} standings`}>
          <TVLeaderboard players={mz} scores={scores} phase="after" kicker={`${title} · ${modeWord(game.official, feed.casual)}`} title="This game's final standings" />
        </section>
      ) : <p className="mz-tvshow-empty">No scores were recorded for this game.</p>}
      <p className="mz-tvshow-next" data-testid="tv-next" data-flow={flow?.kind ?? ""}>{flow ? flow.text : next ? `Next up: ${titleOf(next.gameId)} · ${modeWord(next.official, feed.casual)}. The host starts it from the lobby.` : "The host picks the next game from the lobby."}</p>
    </section>
  );
}
