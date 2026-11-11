/**
 * Play solo (Stage 6.1; the shelf Stage 6.2). One person, no room code, no
 * name, no lobby.
 *
 *  /solo                  the games that really work alone (manifest soloPlay
 *                         AND an adapter in solo/soloGames.tsx: Math Mayhem,
 *                         Pattern Pulse, Word Connections), each with its
 *                         personal best on this device and Start.
 *  /solo/<gameId>         the round, then its results: Play again, Back to
 *                         solo, Home.
 *
 * The round itself is the existing game: a private solo room on the server
 * (SoloSession) and the game's existing screen in solo mode, chosen by its
 * adapter. Nothing here is specific to one game. Leaving mid-round asks first
 * and removes the round unscored; a reload lands on the round's start screen
 * and Start begins a fresh round (the server replaces any round left open).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { GameCover, Keycap, NoticeCard, Wordmark, accentColor, playersLabel, sessionEstimate, type CatalogGame } from "../../ui/mchezo/index.js";
import { deviceStore, readBest, recordScore, type KeyValueStore, type PersonalBest, type RecordOutcome } from "../../solo/personalBest.js";
import { SoloSession, type SoloState } from "../../solo/soloSession.js";
import { SOLO_GAMES, soloAdapter } from "../../solo/soloGames.js";
import { countsForBest } from "../../solo/soloRules.js";
import { useSoloSeason } from "../../solo/soloSeason.js";
import { ContentSeasonChoice, ContentSeasonLabel } from "./ContentChoice.js";
import type { SessionSeason } from "../../../../../src/shared/season.js";
import { setShownSeason } from "../../ui/mchezo/look.js";

/**
 * Stage 8.2 (§3.7): what the solo content changes, honestly: only Word
 * Connections has seasonal boards (Math Mayhem and Pattern Pulse generate
 * their rounds).
 */
const soloContentNote = (s: SessionSeason) => s === "christmas"
  ? "Christmas boards come first in Word Connections. Math Mayhem and Pattern Pulse don’t change."
  : "Year-round boards in Word Connections.";

/** The catalog games on the solo shelf, in shelf order: the manifest says soloPlay and an adapter exists. */
export function soloShelf(catalog: readonly CatalogGame[]): CatalogGame[] {
  return SOLO_GAMES.flatMap((a) => catalog.filter((g) => g.id === a.gameId && g.soloPlay));
}

const fmt = (n: number) => n.toLocaleString("en-US");

function BackButton({ onBack, label = "Back" }: { onBack: () => void; label?: string }) {
  return (
    <button type="button" className="mz-iconbtn" aria-label={label} data-testid="nav-back" onClick={onBack}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

function bestLine(best: PersonalBest | undefined, storageOk: boolean): string {
  if (!storageOk) return "Personal bests can’t be kept on this device right now (its storage is unavailable).";
  return best ? `Your personal best on this device: ${fmt(best.score)}` : "No personal best on this device yet.";
}

/** /solo: the solo games list. */
export function SoloHome({ catalog, onStart, onBack, onHost }: { catalog: readonly CatalogGame[]; onStart: (gameId: string) => void; onBack: () => void; onHost: () => void }) {
  const store = useMemo(() => deviceStore(), []);
  const solo = soloShelf(catalog);
  const [season, setSeason] = useSoloSeason();
  return (
    <main className="mz-screen mz-entry mz-solo mz-solo-shelf" aria-label="Play solo" data-testid="solo-home">
      <header className="mz-appbar"><BackButton onBack={onBack} /><Wordmark size={20} /><span className="mz-appbar__spacer" /></header>
      <h1 className="mz-h1">Play solo</h1>
      <p className="mz-foot mz-entry__lede">Just you and the clock: no room code, no setup. Solo rounds are just for you; they never count toward a Family Cup.</p>
      <ContentSeasonChoice value={season} onChange={setSeason} testIdPrefix="solo" note={soloContentNote(season)} />
      <ul className="mz-solo__list" aria-label="Games you can play alone">
        {solo.map((g) => {
          const adapter = soloAdapter(g.id)!;
          const best = readBest(store, g.id, adapter.rulesVersion);
          return (
            <li key={g.id} className="mz-solo__card" style={{ ["--mz-accent" as string]: accentColor(g.id) }} data-testid={`solo-game-${g.id}`}>
              <GameCover gameId={g.id} decorative className="mz-solo__cover" />
              <div className="mz-solo__text">
                <h2 className="mz-solo__title">{g.title}</h2>
                <p className="mz-solo__desc">{g.description}</p>
                <p className="mz-solo__meta">{playersLabel(g)} · {sessionEstimate(g.estimateMinutes)}</p>
                <p className="mz-solo__best" data-testid={`solo-best-${g.id}`}>{bestLine(best, store !== null)}</p>
                {adapter.bestNote && <p className="mz-solo__best-note" data-testid={`solo-note-${g.id}`}>{adapter.bestNote}</p>}
              </div>
              <Keycap block data-testid={`solo-start-${g.id}`} onClick={() => onStart(g.id)} aria-label={`Start ${g.title}`}>Start</Keycap>
            </li>
          );
        })}
      </ul>
      <p className="mz-foot mz-solo__others" data-testid="solo-others">More solo games are on the way. For now the other games are played in a room: <button type="button" className="mz-linkbtn" data-testid="solo-host" onClick={onHost}>Host a game</button> to play them together.</p>
    </main>
  );
}

/** This round's private and public views in the latest projection. */
function roundViews(state: SoloState) {
  const gid = state.gameInstanceId;
  return {
    mine: gid ? (state.proj?.myGames ?? []).find((g) => g.id === gid) : undefined,
    pub: gid ? (state.proj?.games ?? []).find((g) => g.id === gid) : undefined,
  };
}

/** /solo/<gameId>: one round, then its results. */
export function SoloRound({ game, autostart, onAutostartUsed, onBackToSolo, onHome, store: injected }: {
  game: CatalogGame;
  autostart: boolean;
  onAutostartUsed: () => void;
  onBackToSolo: () => void;
  onHome: () => void;
  store?: KeyValueStore | null;
}) {
  const store = useMemo(() => (injected !== undefined ? injected : deviceStore()), [injected]);
  const adapter = soloAdapter(game.id)!; // App routes only shelf games here
  const rules = adapter.rulesVersion;
  const [state, setState] = useState<SoloState>({ phase: "idle" });
  // Stage 8.2: the solo content choice (this device's), sent with every Start; the server binds it to the round.
  const [season, setSeason] = useSoloSeason();
  const seasonRef = useRef(season);
  seasonRef.current = season;
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [outcome, setOutcome] = useState<{ gid: string; result: RecordOutcome } | null>(null);
  const sessionRef = useRef<SoloSession | null>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const newSession = () => new SoloSession({ store, onChange: setState });
  if (!sessionRef.current) sessionRef.current = newSession();
  // Handlers read the session when they run, never one captured at render:
  // the mount effect below may have replaced it since.
  const live = () => sessionRef.current!;
  const session = live();

  // Leaving this screen any way (Back, Home, browser Back) stops polling and
  // removes a round still in play, so nothing is left running. React's
  // StrictMode (development) runs this effect, its cleanup and the effect
  // again on the same component: the cleanup disposed the first session, so
  // a fresh one takes its place rather than one that ignores every tap.
  useEffect(() => {
    if (sessionRef.current!.isDisposed) sessionRef.current = newSession();
    const s = sessionRef.current!;
    if (autostart) { onAutostartUsed(); void s.start(game.id, seasonRef.current); }
    return () => { void s.leave(); s.dispose(); };
  }, []);

  // File the finished round's score once, against this game's rules version,
  // and only from a round the server finished with this player playing it to
  // the end (countsForBest: a sat-out round never makes a personal best; a
  // left or replaced one never finishes).
  const { mine, pub } = roundViews(state);
  // Feedback 6795825877 (3): while a round or its results are shown, the look
  // follows that round's own content (bound at its start), not the remembered
  // choice for the next start, which another tab may have changed.
  const shown = (state.phase === "playing" || state.phase === "finished") && pub?.season ? pub.season : null;
  useEffect(() => { setShownSeason(shown); }, [shown]);
  useEffect(() => () => setShownSeason(null), []);
  const summary = state.phase === "finished" ? adapter.summarize(mine, pub, session.playerId ?? "") : null;
  const counts = !!summary && countsForBest(mine, pub);
  useEffect(() => {
    if (state.phase !== "finished" || !summary || !counts || !state.gameInstanceId) return;
    if (outcome?.gid === state.gameInstanceId) return;
    setOutcome({ gid: state.gameInstanceId, result: recordScore(store, game.id, rules, summary.score, Date.now()) });
  }, [state.phase, state.gameInstanceId]);
  useEffect(() => { if (state.phase === "finished") resultsHeading.current?.focus(); }, [state.phase, state.gameInstanceId]);

  const header = (onBack: () => void, label: string) => (
    <header className="mz-appbar"><BackButton onBack={onBack} label={label} /><Wordmark size={20} /><span className="mz-appbar__spacer" /></header>
  );

  if (state.phase === "playing" && state.proj && state.gameInstanceId) {
    const Play = adapter.Play;
    return (
      <div className="mz-solo-round" data-testid="solo-round" style={{ ["--mz-accent" as string]: accentColor(game.id) }}>
        <div className="mz-solo-round__bar">
          <span className="mz-kicker mz-kicker--muted">Solo · {game.title}</span>
          {pub?.season === "christmas" && <ContentSeasonLabel season="christmas" testId="solo-round-content" />}
          <button type="button" className="mz-chip-btn" data-testid="solo-leave" onClick={() => setConfirmLeave(true)}>Leave round</button>
        </div>
        {state.replacedOpenRound && <p className="mz-foot mz-solo-round__note" role="status" data-testid="solo-replaced">Your last round was interrupted, so this is a fresh one.</p>}
        {state.stale && <p className="mz-foot mz-solo-round__note mz-solo-round__stale" role="status" data-testid="solo-stale">Can’t reach the game server right now. Reconnecting… Answers it already has are kept.</p>}
        {confirmLeave && (
          <NoticeCard tone="warn" title="Leave this round?" testId="solo-leave-confirm"
            action={<span className="mz-solo__actions"><button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="solo-leave-yes" onClick={() => { setConfirmLeave(false); void live().leave(); onBackToSolo(); }}>Leave round</button><button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="solo-leave-no" autoFocus onClick={() => setConfirmLeave(false)}>Keep playing</button></span>}>
            It won’t be scored, and your personal best stays as it is.
          </NoticeCard>
        )}
        {/* Keyed by the round: Play again or a switch of game mounts a fresh
            screen, so no selection, entry, timer or "last guess seen" from
            an earlier round reaches this one. */}
        {mine ? (
          <Play key={state.gameInstanceId} game={mine} publicGame={pub} players={state.proj.players ?? []} playerId={session.playerId ?? ""} title={game.title}
            intent={(gid, action, payload) => live().intent(gid, action, payload)} roomId={session.roomId ?? ""} timeLimitMs={game.timeLimitMs}
            stale={!!state.stale} onCheckAgain={() => void live().refresh()} />
        ) : <p className="mz-foot" role="status">Getting your round…</p>}
      </div>
    );
  }

  if (state.phase === "finished" && summary) {
    const r = outcome && outcome.gid === state.gameInstanceId ? outcome.result : undefined;
    // Solo screens offer no Sit out, but the server accepts an abstain sent
    // with this seat's token: say plainly why such a round sets no best.
    const pbText = mine?.abstained === true ? "You sat this round out, so it doesn’t count toward a personal best." : !r ? "" : !r.saved && (r.isNewBest || store === null)
      ? "Your score couldn’t be saved as a personal best: this device’s storage is unavailable."
      : r.isNewBest
        ? r.previous ? `New personal best on this device! Your previous best was ${fmt(r.previous.score)}.` : "Your first personal best on this device!"
        : `Your personal best on this device is still ${fmt(r.previous!.score)}.`;
    return (
      <main className="mz-screen mz-solo-results" aria-label={`${game.title} solo results`} data-testid="solo-results" style={{ ["--mz-accent" as string]: accentColor(game.id) }}>
        {header(onBackToSolo, "Back to solo")}
        <span className="mz-kicker mz-kicker--muted">Solo · {game.title}</span>
        {pub?.season && <ContentSeasonLabel season={pub.season} prefix="This round: " testId="solo-results-content" />}
        <h1 className="mz-h1" tabIndex={-1} ref={resultsHeading} data-testid="solo-score">{fmt(summary.score)} points</h1>
        <p className="mz-solo-results__correct" data-testid="solo-headline">{summary.headline}</p>
        {pbText && <p className={`mz-solo-results__pb${r?.isNewBest && r.saved ? " is-new" : ""}`} role="status" data-testid="solo-pb">{pbText}</p>}
        {adapter.bestNote && <p className="mz-solo__best-note" data-testid="solo-note">{adapter.bestNote}</p>}
        <div className="mz-solo-results__actions">
          <Keycap block data-testid="solo-play-again" onClick={() => { setOutcome(null); void live().start(game.id, pub?.season ?? seasonRef.current); }}>Play again</Keycap>
          <Keycap block variant="surface" data-testid="solo-back" onClick={onBackToSolo}>Back to solo</Keycap>
          <button type="button" className="mz-linkbtn" data-testid="solo-home" onClick={onHome}>Mchezo home</button>
        </div>
        <adapter.Review game={mine} publicGame={pub} me={session.playerId ?? ""} />
        <p className="mz-foot" data-testid="solo-scoring">{adapter.scoring} Personal bests are kept only in this browser on this device, separately for each game.</p>
      </main>
    );
  }

  // Not started (or back here after a reload): the round's start screen.
  const best = readBest(store, game.id, rules);
  return (
    <main className="mz-screen mz-entry mz-solo" aria-label={`${game.title} solo`} data-testid="solo-ready" style={{ ["--mz-accent" as string]: accentColor(game.id) }}>
      {header(onBackToSolo, "Back to solo")}
      <GameCover gameId={game.id} decorative className="mz-solo__cover mz-solo__cover--wide" />
      <h1 className="mz-h1">{game.title}</h1>
      <p className="mz-foot mz-entry__lede" data-testid="solo-howto">{adapter.howToPlay}</p>
      {adapter.seasonalContent && <ContentSeasonChoice value={season} onChange={setSeason} testIdPrefix="solo" note={soloContentNote(season)} />}
      <p className="mz-solo__best" data-testid={`solo-best-${game.id}`}>{bestLine(best, store !== null)}</p>
      {adapter.bestNote && <p className="mz-solo__best-note" data-testid="solo-note">{adapter.bestNote}</p>}
      {state.phase === "error" && <p className="err" role="alert" data-testid="solo-error">{state.error ?? "Something went wrong."}</p>}
      {state.phase === "lost" && (
        <NoticeCard tone="warn" title="This round was lost" testId="solo-lost">
          {state.error} Start a new round to keep playing.
        </NoticeCard>
      )}
      <Keycap block data-testid="solo-round-start" disabled={state.phase === "starting"} onClick={() => void live().start(game.id, seasonRef.current)}>
        {state.phase === "starting" ? "Starting…" : state.phase === "error" ? "Try again" : state.phase === "lost" ? "Start a new round" : "Start"}
      </Keycap>
      {state.phase === "starting" && <p className="mz-foot" role="status" data-testid="solo-starting">Starting your round…</p>}
      <button type="button" className="mz-linkbtn" data-testid="solo-home" onClick={onHome}>Mchezo home</button>
    </main>
  );
}
