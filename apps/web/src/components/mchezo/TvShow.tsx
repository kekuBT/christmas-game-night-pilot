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
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { GameClock, PlayerToken, TVRing, TVStage, Wordmark, rankStandings } from "../../ui/mchezo/index.js";
import { gameModeWord, lineupLine, resultLine, TV_MODE_LABEL, tvModeFor, winnerLine, type TvChoice, type TvFeed, type TvMode } from "../../ui/mchezo/lib/tvfeed.js";
import { cupPodium, cupRows, dayLeaderLine, MEDAL_ICON, MEDAL_WORD, medalTable, podiumOf, type CupRow, type PodiumStep } from "../../ui/mchezo/lib/medals.js";
import { toMzPlayers } from "./adapters.js";
import type { Ceremony, PublicGame, RegistryGame } from "../../types.js";

/** One public sentence per game: how it works, never what the answers are. */
import { TV_HINT } from "../../ui/mchezo/lib/tvHints.js";
import { titleFor } from "../../ui/mchezo/lib/names.js";
export { TV_HINT };

/** A game's mode word: Official, Casual (casual rooms) or Practice (a Cup's practice game). */
const modeWord = (official: boolean | undefined, casual?: boolean) => (official ? "Official" : casual ? "Casual" : "Practice");
/** Stage 12.1: the Cup lasts 7 days; the server has no end-of-Cup state, so the TV never crowns a champion. */
const CUP_DAYS = 7;
type CupStanding = TvFeed["championship"][number];

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
  const [choice, setChoice] = useState<TvChoice>("auto");
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);
  // A new game, or a change of status, resets the operator's choice.
  useEffect(() => { setChoice("auto"); }, [latest?.id, latest?.status]);
  // Stage 12.1 (D-S121-06): what this TV has seen, kept on this screen only. The Cup standings just before each game
  // ended (for ▲/▼ after it) and each day's ceremony (for the day's trophy). A TV opened later has no memory, so it
  // shows no arrows and no trophy rather than guessed ones.
  const cupBefore = useRef(new Map<string, CupStanding[]>());
  const ceremonies = useRef(new Map<number, Ceremony>());
  const lastDay = useRef<number | undefined>(undefined);
  const [trophy, setTrophy] = useState<{ day: number; winners: string[] } | null>(null);
  useEffect(() => {
    if (latest && (latest.status === "briefing" || latest.status === "playing")) cupBefore.current.set(latest.id, feed.championship);
  }, [latest?.id, latest?.status, feed.championship]);
  useEffect(() => {
    if (!feed.cup) return;
    const day = feed.championshipDay ?? 1;
    if (feed.ceremony && feed.ceremony.day === day) ceremonies.current.set(day, feed.ceremony);
    const prev = lastDay.current;
    lastDay.current = day;
    if (prev !== undefined && day > prev) {
      const c = ceremonies.current.get(prev);
      setTrophy({ day: prev, winners: c?.winners && c.winners.length > 0 ? c.winners : c?.winner ? [c.winner] : [] });
      setChoice("trophy");
    }
  }, [feed.cup, feed.championshipDay, feed.ceremony]);
  const mode: TvMode = tvModeFor(latest, choice === "trophy" && !trophy ? "auto" : choice);
  const titleOf = (id: string) => titleFor(id, registry);
  const nameOf = (id: string) => feed.players.find((p) => p.id === id)?.displayName ?? "A player";
  const review = latest && mode !== "live" && latest.status === "finished" ? renderReview?.(latest) ?? null : null;
  const game = mode === "lobby" || mode === "cup" || mode === "trophy" ? undefined : latest;
  // Stage 9.3: a cooperative game's final view is its team result, never "standings".
  const finalLabel = latest?.outcome?.team ? "Team result" : TV_MODE_LABEL.final;
  const modeLabel = mode === "final" ? finalLabel : mode === "trophy" && trophy ? `Day ${trophy.day} complete` : TV_MODE_LABEL[mode];
  const before = latest ? cupBefore.current.get(latest.id) : undefined;

  return (
    <div className={`mz-tvshow${paused ? " mz-tvshow--paused" : ""}`} data-testid="tv-show" data-mode={mode} data-game={game?.gameId ?? ""}>
      <TVStage label="Game night TV">
        <header className="mz-tvshow-top">
          <div className="mz-tvshow-top__left"><Wordmark size={34} />{game && <span className="mz-tvshow-title">{titleOf(game.gameId)}</span>}</div>
          <div className="mz-tvshow-top__mid">
            <span className={`mz-tvshow-mode mz-tvshow-mode--${mode}`} data-testid="tv-mode" data-mode={mode}>{mode === "live" && <i aria-hidden="true" />}{modeLabel}</span>
            {game && <span className={`mz-tvshow-chip mz-tvshow-chip--${game.official ? "official" : "practice"}`}>{gameModeWord(game, feed)}</span>}
          </div>
          <div className="mz-tvshow-top__right">
            {(feed.spectatorCount ?? 0) > 0 && <span className="mz-tv-pill" data-testid="tv-watching-count">👁 {feed.spectatorCount} watching</span>}
            <span className="mz-tv-pill">Join <b>{feed.joinCode ?? "…"}</b></span>
          </div>
        </header>
        <main className="mz-tvshow-main" key={replay} aria-live="polite">
          {mode === "lobby" && <TvLobby feed={feed} titleOf={titleOf} nameOf={nameOf} registry={registry} />}
          {mode === "live" && latest && (renderLive?.(latest) ?? <TvLive game={latest} title={titleOf(latest.gameId)} nameOf={nameOf} casual={feed.casual} />)}
          {mode === "final" && latest && (renderFinal?.(latest) ?? <TvFinal game={latest} title={titleOf(latest.gameId)} feed={feed} nameOf={nameOf} titleOf={titleOf} cupBefore={before} paused={paused} />)}
          {mode === "cup" && <TvCupView feed={feed} nameOf={nameOf} paused={paused} />}
          {mode === "trophy" && trophy && <TvTrophy trophy={trophy} feed={feed} paused={paused} />}
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
            {latest?.status === "finished" && <button type="button" className="mz-chip-btn" aria-pressed={mode === "final"} data-testid="tv-dir-final" onClick={() => setChoice("final")}>{finalLabel}</button>}
            {latest?.status === "finished" && review && <button type="button" className="mz-chip-btn" aria-pressed={mode === "review"} data-testid="tv-dir-review" onClick={() => setChoice("review")}>Post-game review</button>}
            {(latest?.status === "finished" || mode === "cup" || mode === "trophy") && <button type="button" className="mz-chip-btn" aria-pressed={mode === "lobby"} data-testid="tv-dir-lobby" onClick={() => setChoice("lobby")}>Lobby view</button>}
            {feed.cup && mode !== "live" && mode !== "briefing" && <button type="button" className="mz-chip-btn" aria-pressed={mode === "cup"} data-testid="tv-dir-cup" onClick={() => setChoice("cup")}>Cup standings</button>}
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
  // Stage 7.3: the TV names the host (a public fact), so a handover shows here too.
  const hostName = feed.players.find((p) => p.isHost)?.displayName;
  // Stage 7.2: a casual room's lineup and break (public planning facts).
  const lineup = feed.party?.lineup;
  const flow = lineupLine(feed, titleOf);
  const joinUrl = typeof location !== "undefined" ? `${location.host}/join` : "/join";
  // Stage 12.1 (D-S121-04): the join link as a QR code, the same /join?code=… link the phone's Invite sheet shares.
  const qr = useJoinQr(feed.joinCode);
  // Stage 12.1 (D-S121-05): a casual room's night so far, as medals.
  const medals = feed.casual ? medalTable(feed.games, nameOf) : null;
  return (
    <div className="mz-tvshow-lobby" data-testid="tv-lobby">
      <section className="mz-tvshow-card mz-tvshow-join">
        <span className="mz-tv-kicker">Join the game</span>
        <div className="mz-tvshow-joinrow">
          {qr && <span className="mz-tvshow-qr" data-testid="tv-join-qr" data-code={feed.joinCode}><img src={qr} alt={`QR code: scan to join room ${feed.joinCode}`} /></span>}
          <div className="mz-tvshow-joincopy">
            <b className="mz-tvshow-code" data-testid="tv-join-code">{feed.joinCode ?? "…"}</b>
            {qr && <span className="mz-tvshow-scan">Scan with a phone camera, or go to</span>}
            <span className="mz-tvshow-url">{joinUrl}</span>
          </div>
        </div>
        <ul className="mz-tvshow-roster" aria-label={`${here.length} here`}>
          {feed.players.map((p, i) => (
            <li key={p.id} className={away(p) ? "is-away" : ""}>
              <PlayerToken player={mz[i]!} index={i} size={48} badge={away(p) ? "offline" : null} />
              <span>{p.displayName}{p.isHost && <small className="mz-tvshow-host" data-testid="tv-host-tag">host</small>}</span>
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
              {feed.contentSeason && <p className="mz-tvshow-line" data-testid="tv-content" data-season={feed.contentSeason}>{feed.contentSeason === "christmas" ? "🎄 Christmas content" : "Everyday content"}</p>}
              {short > 0 && <p className="mz-tvshow-line mz-tvshow-line--warn">Needs {short} more {short === 1 ? "player" : "players"} ({next.minPlayers}–{next.maxPlayers})</p>}
              {over > 0 && <p className="mz-tvshow-line mz-tvshow-line--warn">Up to {next.maxPlayers} players · {here.length} here</p>}
              <p className="mz-tvshow-line mz-tvshow-line--muted" data-testid="tv-host-line">{hostName ? `${hostName} starts it` : "The host starts it"} when everyone's ready.</p>
            </>
          ) : <p className="mz-tvshow-line">The host is choosing the next game.</p>}
        </section>
        {feed.cup && <TvCupCard feed={feed} nameOf={nameOf} />}
        {medals && medals.games > 0 && <TvMedalCard table={medals} nameOf={nameOf} limit={5} />}
        {finished.length > 0 && (
          <section className="mz-tvshow-card" data-testid="tv-recent">
            <span className="mz-tv-kicker">Tonight so far</span>
            <ol className="mz-tvshow-recent">{finished.map((g) => <li key={g.id} data-game={g.gameId}><b>{titleOf(g.gameId)}</b> · {gameModeWord(g, feed)} · finished — {resultLine(g, nameOf)}</li>)}</ol>
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

function TvFinal({ game, title, feed, nameOf, titleOf, cupBefore, paused }: { game: PublicGame; title: string; feed: TvFeed; nameOf: (id: string) => string; titleOf: (id: string) => string; cupBefore?: CupStanding[]; paused: boolean }) {
  // Stage 9.3: a cooperative game's final view is its one team result (no winner, no standings).
  if (game.outcome?.team) return <TvTeamFinal game={game} title={title} feed={feed} titleOf={titleOf} />;
  return <TvCompetitiveFinal game={game} title={title} feed={feed} nameOf={nameOf} titleOf={titleOf} cupBefore={cupBefore} paused={paused} />;
}

function TvTeamFinal({ game, title, feed, titleOf }: { game: PublicGame; title: string; feed: TvFeed; titleOf: (id: string) => string }) {
  const team = game.outcome!.team!;
  const flow = lineupLine(feed, titleOf);
  const next = feed.upNext;
  return (
    <section className="mz-tvshow-final" data-testid="tv-team-final">
      <p className="mz-tvshow-winner" data-testid="tv-team-result">Team result: {team.total} out of {team.max}</p>
      <p className="mz-tvshow-line">{title} · {gameModeWord(game, feed)} · one shared score for everyone who played</p>
      <p className="mz-tvshow-next" data-testid="tv-next" data-flow={flow?.kind ?? ""}>{flow ? flow.text : next ? `Next up: ${titleOf(next.gameId)} · ${modeWord(next.official, feed.casual)}. The host starts it from the lobby.` : "The host picks the next game from the lobby."}</p>
    </section>
  );
}

/**
 * Stage 12.1 (D-S121-05): a competitive game's big moment. The winner line, the podium rising bronze → silver →
 * gold, everyone's standings, and the night so far: the medal table (casual) or the Cup standings after this game
 * (a Cup room; ▲/▼ only against standings this TV saw before the game ended).
 */
function TvCompetitiveFinal({ game, title, feed, nameOf, titleOf, cupBefore, paused }: { game: PublicGame; title: string; feed: TvFeed; nameOf: (id: string) => string; titleOf: (id: string) => string; cupBefore?: CupStanding[]; paused: boolean }) {
  const mz = useMemo(() => toMzPlayers(feed.players), [feed.players]);
  const scores = useMemo(() => Object.entries(game.rawScores ?? {}).map(([playerId, score]) => ({ playerId, score })), [game.rawScores]);
  const ranked = rankStandings(scores, mz);
  const next = feed.upNext;
  const flow = lineupLine(feed, titleOf);
  const podium = podiumOf(game);
  const medals = feed.casual ? medalTable(feed.games, nameOf) : null;
  const cup = feed.cup && feed.championship.length > 0 ? cupRows(feed.championship, game.official ? cupBefore : undefined) : null;
  return (
    <section className="mz-tvshow-final mz-tvfinal-hero">
      <p className="mz-tvshow-winner" data-testid="tv-winner">{winnerLine(game.rawScores, nameOf)}</p>
      {ranked.length > 0 ? (
        <div className="mz-tvfinal" data-players={ranked.length}>
          <div className="mz-tvfinal__left">
            {podium && <TvPodium steps={podium} nameOf={nameOf} paused={paused} />}
            {medals && medals.games > 0 && <TvMedalCard table={medals} nameOf={nameOf} limit={podium ? 4 : 6} />}
            {cup && <TvCupList rows={cup} nameOf={nameOf} limit={podium ? 4 : 6} kicker={game.official ? "Family Cup · after this game" : "Family Cup · unchanged (a practice game)"} testId="tv-final-cup" />}
          </div>
          <section className="mz-tvfinal__right" data-testid="tv-last-standings" aria-label={`${title} standings`}>
            <span className="mz-tv-kicker">{title} · {gameModeWord(game, feed)} · final standings</span>
            <ol className={`mz-tvlist${ranked.length > 6 ? " mz-tvlist--dense" : ""}`}>
              {ranked.map((r) => (
                <li key={r.playerId} data-rank={r.rank}>
                  <span className="mz-tvlist__rank">{r.rank}</span>
                  <span className="mz-tvlist__name">{r.player.name}</span>
                  <span className="mz-tvlist__val">{r.score.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : <p className="mz-tvshow-empty">No scores were recorded for this game.</p>}
      <p className="mz-tvshow-next" data-testid="tv-next" data-flow={flow?.kind ?? ""}>{flow ? flow.text : next ? `Next up: ${titleOf(next.gameId)} · ${modeWord(next.official, feed.casual)}. The host starts it from the lobby.` : "The host picks the next game from the lobby."}</p>
    </section>
  );
}

/* ----------------------------------------------------- Stage 12.1 pieces */

/** The join link as a QR code (a data URL drawn on this screen; nothing leaves it). Null until drawn, or on failure. */
function useJoinQr(code: string | undefined): string | null {
  const [qr, setQr] = useState<{ code: string; url: string } | null>(null);
  useEffect(() => {
    if (!code || typeof location === "undefined") return;
    let live = true;
    QRCode.toDataURL(`${location.origin}/join?code=${code}`, { width: 360, margin: 1 })
      .then((url) => { if (live) setQr({ code, url }); })
      .catch(() => { if (live) setQr(null); });
    return () => { live = false; };
  }, [code]);
  return qr && qr.code === code ? qr.url : null;
}

/** Bronze, then silver, then gold, rising in turn. Shows at once with reduced motion, Animations Off, or paused. */
function TvPodium({ steps, nameOf, paused }: { steps: PodiumStep[]; nameOf: (id: string) => string; paused: boolean }) {
  // Drawn left to right as silver, gold, bronze: the classic podium, with gold in the middle and highest.
  const order = [steps[1]!, steps[0]!, steps[2]!];
  return (
    <section className={`mz-podium${paused ? "" : " mz-podium--animate"}`} data-testid="tv-podium" aria-label="Podium">
      {order.map((st) => (
        <div key={st.place} className={`mz-podium__step mz-podium__step--${st.place}${st.players.length === 0 ? " mz-podium__step--empty" : ""}`} data-testid={`tv-podium-${st.medal}`} data-players={st.players.map((p) => p.playerId).join(",")}>
          <div className="mz-podium__who">
            <span className="mz-podium__medal" aria-hidden="true">{MEDAL_ICON[st.medal]}</span>
            <span className="mz-podium__name">{st.players.map((p) => nameOf(p.playerId)).join(" & ") || "\u00a0"}</span>
            <span className="mz-podium__score">{st.players.length > 0 ? `${st.players[0]!.score.toLocaleString("en-US")} · ${MEDAL_WORD[st.medal]}` : "\u00a0"}</span>
          </div>
          <div className="mz-podium__block" aria-hidden="true">{st.place}</div>
        </div>
      ))}
    </section>
  );
}

/** The night's medal table (casual rooms): golds, silvers, bronzes, from every finished competitive game. */
function TvMedalCard({ table, nameOf, limit }: { table: ReturnType<typeof medalTable>; nameOf: (id: string) => string; limit: number }) {
  const rows = table.rows.slice(0, limit);
  const more = table.rows.length - rows.length;
  return (
    <section className="mz-tvshow-card mz-medalcard" data-testid="tv-medals" data-games={table.games}>
      <span className="mz-tv-kicker">Medal table · {table.games} {table.games === 1 ? "game" : "games"} tonight</span>
      {rows.length === 0 ? <p className="mz-tvshow-line mz-tvshow-line--muted">No medals yet.</p> : (
        <ol className="mz-medals">
          <li className="mz-medals__head" aria-hidden="true"><span /><span className="mz-medals__n">{MEDAL_ICON.gold}</span><span className="mz-medals__n">{MEDAL_ICON.silver}</span><span className="mz-medals__n">{MEDAL_ICON.bronze}</span></li>
          {rows.map((r) => (
            <li key={r.playerId} data-player={r.playerId} aria-label={`${nameOf(r.playerId)}: ${r.gold} gold, ${r.silver} silver, ${r.bronze} bronze`}>
              <span className="mz-tvlist__name">{nameOf(r.playerId)}</span>
              {(["gold", "silver", "bronze"] as const).map((m) => <span key={m} className={`mz-medals__n${r[m] === 0 ? " mz-medals__n--zero" : ""}`} data-medal={m}>{r[m]}</span>)}
            </li>
          ))}
        </ol>
      )}
      {more > 0 && <p className="mz-tvshow-line mz-tvshow-line--muted">and {more} more with medals</p>}
    </section>
  );
}

/** The Cup standings as a list: rank, name, total, and ▲/▼ movement when this TV saw the standings before. */
function TvCupList({ rows, nameOf, limit, kicker, testId }: { rows: CupRow[]; nameOf: (id: string) => string; limit: number; kicker: string; testId: string }) {
  const shown = rows.slice(0, limit);
  const more = rows.length - shown.length;
  return (
    <section className="mz-tvshow-card mz-cuplist" data-testid={testId}>
      <span className="mz-tv-kicker">{kicker}</span>
      <ol className="mz-tvlist mz-tvlist--dense">
        {shown.map((r) => (
          <li key={r.playerId} data-player={r.playerId} data-move={r.move ?? ""}>
            <span className="mz-tvlist__rank">{r.rank}</span>
            <span className="mz-tvlist__name">{nameOf(r.playerId)}{r.move !== null && r.move !== 0 && <span className={`mz-tvlist__move mz-tvlist__move--${r.move > 0 ? "up" : "down"}`} aria-label={r.move > 0 ? `up ${r.move}` : `down ${-r.move}`}>{r.move > 0 ? `▲${r.move}` : `▼${-r.move}`}</span>}</span>
            <span className="mz-tvlist__val">{r.total} pts{r.eligible ? "" : " · qualifying"}</span>
          </li>
        ))}
      </ol>
      {more > 0 && <p className="mz-tvshow-line mz-tvshow-line--muted">and {more} more</p>}
    </section>
  );
}

/** The lobby's Cup card: the day, the top five and the day's leader (from the server's own ceremony). */
function TvCupCard({ feed, nameOf }: { feed: TvFeed; nameOf: (id: string) => string }) {
  const day = feed.championshipDay ?? 1;
  const rows = cupRows(feed.championship);
  const leader = feed.ceremony?.day === day ? dayLeaderLine(feed.ceremony, CUP_DAYS) : null;
  return (
    <section className="mz-tvshow-card" data-testid="tv-cup" data-day={day}>
      <span className="mz-tv-kicker">{feed.cupLabel ?? "Family Cup"} · Day {day} of {CUP_DAYS}</span>
      {leader && <p className="mz-tvshow-line" data-testid="tv-cup-leader">🏆 {leader}</p>}
      {rows.length > 0 ? (
        <ol className="mz-tvshow-cup">{rows.slice(0, 5).map((r) => <li key={r.playerId}><b>{r.rank}</b> {nameOf(r.playerId)} <span>{r.total} pts{r.eligible ? "" : " · qualifying"}</span></li>)}</ol>
      ) : <p className="mz-tvshow-line mz-tvshow-line--muted">No official games yet. Official games count toward the Cup.</p>}
    </section>
  );
}

/** The director's "Cup standings": the Cup podium (top three totals) and everyone's totals. */
function TvCupView({ feed, nameOf, paused }: { feed: TvFeed; nameOf: (id: string) => string; paused: boolean }) {
  const day = feed.championshipDay ?? 1;
  const rows = cupRows(feed.championship);
  const leader = feed.ceremony?.day === day ? dayLeaderLine(feed.ceremony, CUP_DAYS) : null;
  // The Cup's podium from its totals: ties share a step (a shared lead is a real result); nobody stands without points.
  const podium = cupPodium(rows);
  return (
    <section className="mz-tvshow-final mz-tvfinal-hero" data-testid="tv-cup-view" data-day={day}>
      <p className="mz-tvshow-winner">{feed.cupLabel ?? "Family Cup"} · Day {day} of {CUP_DAYS}</p>
      <div className="mz-tvfinal">
        <div className="mz-tvfinal__left">
          {podium ? <TvPodium steps={podium} nameOf={nameOf} paused={paused} /> : <p className="mz-tvshow-line">No Cup points yet. Official games count toward the Cup.</p>}
          {leader && <p className="mz-tvshow-line" data-testid="tv-cup-leader">🏆 {leader}</p>}
        </div>
        {rows.length > 0 && <div className="mz-tvfinal__right"><TvCupList rows={rows} nameOf={nameOf} limit={10} kicker="Cup standings · totals so far" testId="tv-cup-standings" /></div>}
      </div>
      <p className="mz-tvshow-next">{day >= CUP_DAYS ? `Day ${CUP_DAYS} of ${CUP_DAYS}: the final day. Totals so far.` : "Totals so far. They can change every day until the Cup ends."}</p>
    </section>
  );
}

/** "Day N complete": the trophy and that day's winner(s), as the server named them before the day moved on. */
function TvTrophy({ trophy, feed, paused }: { trophy: { day: number; winners: string[] }; feed: TvFeed; paused: boolean }) {
  const names = trophy.winners;
  const who = names.length === 0 ? null : names.length === 1 ? names[0]! : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const today = feed.championshipDay ?? trophy.day + 1;
  return (
    <section className={`mz-trophy${paused ? "" : " mz-trophy--animate"}`} data-testid="tv-trophy" data-day={trophy.day} data-winners={names.join("|")}>
      {who && <span className="mz-trophy__cup" aria-hidden="true">🏆</span>}
      <h1 className="mz-trophy__title">Day {trophy.day} complete</h1>
      {who ? <p className="mz-trophy__who" data-testid="tv-trophy-who">{names.length === 1 ? `${who} wins Day ${trophy.day}` : `${who} share Day ${trophy.day}`}</p>
        : <p className="mz-trophy__line">No official games finished on Day {trophy.day}, so nobody won it.</p>}
      <p className="mz-trophy__line">{today <= CUP_DAYS ? `Day ${today} of ${CUP_DAYS} starts now.` : ""}</p>
    </section>
  );
}
