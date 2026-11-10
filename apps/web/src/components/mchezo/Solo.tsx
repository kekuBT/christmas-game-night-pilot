/**
 * Stage 6.1: Play solo. One person, no room code, no name, no lobby.
 *
 *  /solo                  the games that really work alone (soloPlay in the
 *                         manifest; Math Mayhem in this slice), each with its
 *                         personal best on this device and Start.
 *  /solo/<gameId>         the round, then its results: Play again, Back to
 *                         solo, Home.
 *
 * The round itself is the existing game: a private solo room on the server
 * (SoloSession) and the existing MchezoMath screen in solo mode. Leaving
 * mid-round asks first and removes the round unscored; a reload lands on the
 * round's start screen and Start begins a fresh round (the server replaces
 * any round left open).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MATH_RULES_VERSION } from "../../../../../src/games/mathRules.js";
import { GameCover, Keycap, NoticeCard, Wordmark, accentColor, playersLabel, sessionEstimate, type CatalogGame } from "../../ui/mchezo/index.js";
import { deviceStore, readBest, recordScore, type KeyValueStore, type PersonalBest, type RecordOutcome } from "../../solo/personalBest.js";
import { SoloSession, type SoloState } from "../../solo/soloSession.js";
import { MchezoMath } from "./MchezoMath.js";

/** Rules version per solo game: a best only compares with rounds under the same rules. */
export const SOLO_RULES: Readonly<Record<string, number>> = { "math-mayhem": MATH_RULES_VERSION };

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
  const solo = catalog.filter((g) => g.soloPlay && SOLO_RULES[g.id] !== undefined);
  return (
    <main className="mz-screen mz-entry mz-solo" aria-label="Play solo" data-testid="solo-home">
      <header className="mz-appbar"><BackButton onBack={onBack} /><Wordmark size={20} /><span className="mz-appbar__spacer" /></header>
      <h1 className="mz-h1">Play solo</h1>
      <p className="mz-foot mz-entry__lede">Just you and the clock: no room code, no setup. Solo rounds are just for you; they never count toward a Family Cup.</p>
      <ul className="mz-solo__list" aria-label="Games you can play alone">
        {solo.map((g) => {
          const best = readBest(store, g.id, SOLO_RULES[g.id]!);
          return (
            <li key={g.id} className="mz-solo__card" style={{ ["--mz-accent" as string]: accentColor(g.id) }} data-testid={`solo-game-${g.id}`}>
              <GameCover gameId={g.id} decorative className="mz-solo__cover" />
              <div className="mz-solo__text">
                <h2 className="mz-solo__title">{g.title}</h2>
                <p className="mz-solo__desc">{g.description}</p>
                <p className="mz-solo__meta">{playersLabel(g)} · {sessionEstimate(g.estimateMinutes)}</p>
                <p className="mz-solo__best" data-testid={`solo-best-${g.id}`}>{bestLine(best, store !== null)}</p>
              </div>
              <Keycap block data-testid={`solo-start-${g.id}`} onClick={() => onStart(g.id)} aria-label={`Start ${g.title}`}>Start</Keycap>
            </li>
          );
        })}
      </ul>
      <p className="mz-foot mz-solo__others" data-testid="solo-others">The other games need at least 2 players, so they aren’t offered here. <button type="button" className="mz-linkbtn" data-testid="solo-host" onClick={onHost}>Host a game</button> to play them together.</p>
    </main>
  );
}

/** The finished round's numbers, from the server's own records. */
function roundSummary(state: SoloState, me: string | undefined): { score: number; correct: number; total: number; review: { prompt: string; mine: string; answer: string; ok: boolean }[] } | null {
  const proj = state.proj;
  const gid = state.gameInstanceId;
  if (!proj || !gid) return null;
  const pub = (proj.games ?? []).find((g) => g.id === gid);
  const mine = (proj.myGames ?? []).find((g) => g.id === gid);
  if (!pub || !me) return null;
  const qs = (pub.questions ?? []) as { id: string; prompt: string; options: (string | number)[]; correctAnswer?: number }[];
  const answers = (mine?.myAnswers ?? {}) as Record<string, number | null>;
  const review = qs.map((q) => {
    const pick = answers[q.id];
    const chosen = pick === undefined || pick === null ? undefined : q.options[pick];
    return { prompt: q.prompt.replace(/\s*=\s*\?$/, ""), mine: chosen === undefined ? "no answer" : String(chosen), answer: String(q.correctAnswer), ok: chosen !== undefined && String(chosen) === String(q.correctAnswer) };
  });
  return { score: Number(pub.rawScores?.[me] ?? 0), correct: review.filter((r) => r.ok).length, total: qs.length, review };
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
  const rules = SOLO_RULES[game.id];
  const [state, setState] = useState<SoloState>({ phase: "idle" });
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
    if (autostart) { onAutostartUsed(); void s.start(game.id); }
    return () => { void s.leave(); s.dispose(); };
  }, []);

  // File the finished round's score once, against this game's rules version.
  const summary = state.phase === "finished" ? roundSummary(state, session.playerId) : null;
  useEffect(() => {
    if (state.phase !== "finished" || !summary || !state.gameInstanceId || rules === undefined) return;
    if (outcome?.gid === state.gameInstanceId) return;
    setOutcome({ gid: state.gameInstanceId, result: recordScore(store, game.id, rules, summary.score, Date.now()) });
  }, [state.phase, state.gameInstanceId]);
  useEffect(() => { if (state.phase === "finished") resultsHeading.current?.focus(); }, [state.phase, state.gameInstanceId]);

  const header = (onBack: () => void, label: string) => (
    <header className="mz-appbar"><BackButton onBack={onBack} label={label} /><Wordmark size={20} /><span className="mz-appbar__spacer" /></header>
  );

  if (state.phase === "playing" && state.proj && state.gameInstanceId) {
    const mine = (state.proj.myGames ?? []).find((g) => g.id === state.gameInstanceId);
    const pub = (state.proj.games ?? []).find((g) => g.id === state.gameInstanceId);
    return (
      <div className="mz-solo-round" data-testid="solo-round" style={{ ["--mz-accent" as string]: accentColor(game.id) }}>
        <div className="mz-solo-round__bar">
          <span className="mz-kicker mz-kicker--muted">Solo · {game.title}</span>
          <button type="button" className="mz-chip-btn" data-testid="solo-leave" onClick={() => setConfirmLeave(true)}>Leave round</button>
        </div>
        {state.replacedOpenRound && <p className="mz-foot mz-solo-round__note" role="status" data-testid="solo-replaced">Your last round was interrupted, so this is a fresh one.</p>}
        {confirmLeave && (
          <NoticeCard tone="warn" title="Leave this round?" testId="solo-leave-confirm"
            action={<span className="mz-solo__actions"><button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="solo-leave-yes" onClick={() => { setConfirmLeave(false); void live().leave(); onBackToSolo(); }}>Leave round</button><button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="solo-leave-no" autoFocus onClick={() => setConfirmLeave(false)}>Keep playing</button></span>}>
            It won’t be scored, and your personal best stays as it is.
          </NoticeCard>
        )}
        {mine ? (
          <MchezoMath solo game={mine} publicGame={pub} players={state.proj.players ?? []} playerId={session.playerId ?? ""} gamesTitle={game.title}
            intent={(gid, action, payload) => live().intent(gid, action, payload)}
            post={async <T,>() => ({}) as T} roomId={session.roomId ?? ""} windowMs={game.timeLimitMs} />
        ) : <p className="mz-foot" role="status">Getting your round…</p>}
      </div>
    );
  }

  if (state.phase === "finished" && summary) {
    const r = outcome && outcome.gid === state.gameInstanceId ? outcome.result : undefined;
    const pbText = !r ? "" : !r.saved && (r.isNewBest || store === null)
      ? "Your score couldn’t be saved as a personal best: this device’s storage is unavailable."
      : r.isNewBest
        ? r.previous ? `New personal best on this device! Your previous best was ${fmt(r.previous.score)}.` : "Your first personal best on this device!"
        : `Your personal best on this device is still ${fmt(r.previous!.score)}.`;
    return (
      <main className="mz-screen mz-solo-results" aria-label={`${game.title} solo results`} data-testid="solo-results" style={{ ["--mz-accent" as string]: accentColor(game.id) }}>
        {header(onBackToSolo, "Back to solo")}
        <span className="mz-kicker mz-kicker--muted">Solo · {game.title}</span>
        <h1 className="mz-h1" tabIndex={-1} ref={resultsHeading} data-testid="solo-score">{fmt(summary.score)} points</h1>
        <p className="mz-solo-results__correct" data-testid="solo-correct">{summary.correct} of {summary.total} correct</p>
        {pbText && <p className={`mz-solo-results__pb${r?.isNewBest && r.saved ? " is-new" : ""}`} role="status" data-testid="solo-pb">{pbText}</p>}
        <div className="mz-solo-results__actions">
          <Keycap block data-testid="solo-play-again" onClick={() => { setOutcome(null); void live().start(game.id); }}>Play again</Keycap>
          <Keycap block variant="surface" data-testid="solo-back" onClick={onBackToSolo}>Back to solo</Keycap>
          <button type="button" className="mz-linkbtn" data-testid="solo-home" onClick={onHome}>Mchezo home</button>
        </div>
        <details className="mz-solo-review" data-testid="solo-review">
          <summary>Your answers</summary>
          <ol>
            {summary.review.map((q, i) => (
              <li key={i} className={q.ok ? "is-ok" : "is-miss"}>
                <span className="mz-solo-review__q">{q.prompt}</span>
                <span className="mz-solo-review__a">{q.ok ? `✓ ${q.answer}` : `✗ ${q.mine} · answer ${q.answer}`}</span>
              </li>
            ))}
          </ol>
        </details>
        <p className="mz-foot">100 points per correct answer, plus up to 20 for speed. Personal bests are kept only in this browser on this device.</p>
      </main>
    );
  }

  // Not started (or back here after a reload): the round's start screen.
  const best = rules !== undefined ? readBest(store, game.id, rules) : undefined;
  return (
    <main className="mz-screen mz-entry mz-solo" aria-label={`${game.title} solo`} data-testid="solo-ready" style={{ ["--mz-accent" as string]: accentColor(game.id) }}>
      {header(onBackToSolo, "Back to solo")}
      <GameCover gameId={game.id} decorative className="mz-solo__cover mz-solo__cover--wide" />
      <h1 className="mz-h1">{game.title}</h1>
      <p className="mz-foot mz-entry__lede">10 quick sums, four answers each. 100 points for each right answer, plus up to 20 if you’re fast.</p>
      <p className="mz-solo__best" data-testid={`solo-best-${game.id}`}>{bestLine(best, store !== null)}</p>
      {state.phase === "error" && <p className="err" role="alert" data-testid="solo-error">{state.error ?? "Something went wrong."} Try again.</p>}
      <Keycap block data-testid="solo-round-start" disabled={state.phase === "starting"} onClick={() => void live().start(game.id)}>{state.phase === "starting" ? "Starting…" : "Start"}</Keycap>
      {state.phase === "starting" && <p className="mz-foot" role="status" data-testid="solo-starting">Starting your round…</p>}
      <button type="button" className="mz-linkbtn" data-testid="solo-home" onClick={onHome}>Mchezo home</button>
    </main>
  );
}
