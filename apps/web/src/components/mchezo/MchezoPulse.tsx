/**
 * Pattern Pulse (Stage 5, Practice-only): watch a sequence of shapes, then
 * tap it back in order. Six rounds, three shapes up to eight.
 *
 * Self-paced: you open each round when you're ready. The server makes and
 * checks every pattern and owns every clock: the pattern arrives in YOUR
 * projection only while you memorise it, and this screen hides it at the
 * server's memorise deadline even if a cached copy is still around.
 *
 * Accessibility: every symbol is a shape AND a colour AND a name, so colour
 * is never needed. No sound. With reduced motion (or Animations Off) the
 * pattern is a still, numbered row for the same time; with full motion the
 * same row is shown with a gentle highlight sweeping along it (nothing is
 * hidden or shown faster, so both settings see exactly the same thing).
 *
 * What you tap is kept on this phone until the server confirms it; a send
 * that fails says so and keeps your entry for another try.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameClock, Keycap, MchezoWaiting, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { clockAnnouncement, clockAnnouncementText, gameClockView, type ClockBand, type GameClockView } from "./pulseClock.js";
import { FeedbackLine, GameHeader, ScoreList } from "../../ui/mchezo/components/GameKit.js";
import { participationLine, serverNowEstimate } from "../../ui/mchezo/lib/lifecycle.js";
import { SendNote } from "./SendNote.js";
import { pulseMoment } from "../../ui/mchezo/lib/moments.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface PulseResultView { round: number; length: number; answer: number[] | null; correctRun: number; perfect: boolean; points: number; pattern: number[] }
export interface PulseView {
  roundCount?: number; lengths?: number[]; finished?: number; total?: number; roundsPlayed?: number; perfectRounds?: number;
  next?: number;
  open?: { round: number; length: number; showUntil: number; inputUntil: number; pattern?: number[] };
  results?: PulseResultView[]; done?: boolean; satOut?: boolean; myTotal?: number;
}

/** The six symbols: shape + colour + name. Index = the server's symbol number. */
export const PULSE_SYMBOLS = [
  { name: "Red circle", short: "circle", color: "#E8553B" },
  { name: "Yellow square", short: "square", color: "#E9B520" },
  { name: "Green triangle", short: "triangle", color: "#2FA88F" },
  { name: "Blue diamond", short: "diamond", color: "#5D74E0" },
  { name: "Pink star", short: "star", color: "#D9479B" },
  { name: "Purple hexagon", short: "hexagon", color: "#8A55D6" },
] as const;

export function PulseShape({ s, size = 44 }: { s: number; size?: number }) {
  const sym = PULSE_SYMBOLS[s];
  if (!sym) return null;
  const c = sym.color;
  const ink = "rgba(0,0,0,.28)";
  const shape = (() => {
    switch (s) {
      case 0: return <circle cx="24" cy="24" r="17" fill={c} stroke={ink} strokeWidth="2" />;
      case 1: return <rect x="8" y="8" width="32" height="32" rx="4" fill={c} stroke={ink} strokeWidth="2" />;
      case 2: return <polygon points="24,5 43,40 5,40" fill={c} stroke={ink} strokeWidth="2" strokeLinejoin="round" />;
      case 3: return <polygon points="24,4 44,24 24,44 4,24" fill={c} stroke={ink} strokeWidth="2" strokeLinejoin="round" />;
      case 4: return <polygon points="24,4 29.5,17.5 44,18.5 33,28 36.5,42.5 24,34.5 11.5,42.5 15,28 4,18.5 18.5,17.5" fill={c} stroke={ink} strokeWidth="2" strokeLinejoin="round" />;
      default: return <polygon points="24,4 41.3,14 41.3,34 24,44 6.7,34 6.7,14" fill={c} stroke={ink} strokeWidth="2" strokeLinejoin="round" />;
    }
  })();
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="mz-pp-shape">{shape}</svg>;
}

/** A re-render every ~200 ms while a server-timed window is running. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => serverNowEstimate());
  useEffect(() => {
    if (!active) return;
    setNow(serverNowEstimate());
    const t = setInterval(() => setNow(serverNowEstimate()), 200);
    return () => clearInterval(t);
  }, [active]);
  return active ? now : serverNowEstimate();
}

export function pulseResultLine(r: PulseResultView): string {
  if (r.answer === null) return "Time ran out: no points.";
  if (r.perfect) return `All ${r.length} right: +${r.points}.`;
  if (r.correctRun === 0) return "The first one slipped: no points.";
  return `${r.correctRun} of ${r.length} right before the first slip: +${r.points}.`;
}

export interface MchezoPulseDeps {
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
  /**
   * Stage 6.2: a solo round. Nobody to wait for and nobody to sit out for:
   * no "Sit the rest out" (the solo screen has Leave round) and no waiting
   * for others once all six rounds are done (the results follow at once).
   */
  solo?: boolean;
}

/**
 * Stage 8.1 (S2): the whole game's time left, between patterns. The number
 * is a timer read on demand (never announced each second); crossings into a
 * more urgent band are announced once by the screen's polite status.
 */
function GameTimePanel({ clock }: { clock: GameClockView }) {
  const note = clock.up
    ? "Rounds you didn’t get to score nothing."
    : `${clock.low ? "Running low. " : ""}It keeps running between patterns, even now. Rounds you haven’t played when it reaches 0:00 score nothing.`;
  return (
    <section className={`mz-pp-clock${clock.up ? " is-up" : clock.low ? " is-low" : ""}`} aria-label="Game time" data-testid="mz-pp-gameclock" data-band={clock.band}>
      <p className="mz-pp-clock__row">
        <span className="mz-pp-clock__label">Game time left</span>
        <span className="mz-pp-clock__time" role="timer" aria-live="off" data-testid="mz-pp-gameclock-left">{clock.label}</span>
      </p>
      <p className="mz-pp-clock__note" data-testid="mz-pp-gameclock-note">{note}</p>
    </section>
  );
}

export function MchezoPulse({ game, publicGame, players, playerId, title, intent, error, landed, solo }: MchezoPulseDeps) {
  const st = (game.state ?? {}) as PulseView;
  const { reducedMotion } = useMchezo();
  const of = st.roundCount ?? 6;
  const open = st.open;
  const finishedHere = !!st.done || !!st.satOut;
  // Stage 8.1: tick between patterns too, so the game's time left stays current.
  const now = useNow(!!open || (!finishedHere && game.deadlineAt !== undefined));
  const clock = gameClockView(game.deadlineAt, now);
  // Announce only crossings into a more urgent band, each once per game, and
  // only between patterns (never over a pattern being memorised or tapped).
  const announced = useRef<ClockBand>("none");
  const [said, setSaid] = useState("");
  const between = !open && !finishedHere;
  const band = clock?.band ?? "none";
  useEffect(() => {
    if (!between) return;
    const due = clockAnnouncement(announced.current, band);
    if (due) { announced.current = due; setSaid(clockAnnouncementText(due)); }
  }, [between, band]);
  const [entry, setEntry] = useState<number[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const openKey = open ? `r${open.round}` : `n${st.next ?? 0}`;
  // A new round starts with an empty entry (never carried from another round).
  useEffect(() => { setEntry([]); setFailed(null); }, [openKey]);
  const send = async (action: string, payload: Record<string, unknown>, tag: string) => {
    setPending(tag); setFailed(null);
    try { if ((await intent(game.id, action, payload)) === false) setFailed(tag); } finally { setPending(null); }
  };
  const failure = <SendNote shown={!!failed} landed={landed} error={error} testId="mz-pp-error" />;
  const last = (st.results ?? []).at(-1);
  const total = st.myTotal ?? 0;

  if (st.done || st.satOut) {
    return (
      <main className="mz-screen" aria-label={`${title}: finished`} data-testid="mz-pp-done">
        <GameHeader title={title} objective={st.satOut ? "Sitting the rest out" : "All six rounds done"} accent={4} />
        {/* Stage 8.1: Pulse draws its own game clock (App no longer does); results here come at the deadline at the latest. */}
        {!solo && <GameClock game={game} />}
        {!st.satOut && last &&<p className="mz-pp-last" data-testid="mz-pp-last">Round {last.round + 1}: {pulseResultLine(last)}</p>}
        <p className="mz-pp-total" data-testid="mz-pp-total">Your total: <b>{total}</b></p>
        {solo
          ? <p className="mz-foot" role="status">Your results are on their way…</p>
          : <MchezoWaiting label="Waiting for the others" players={players} playerId={playerId} publicGame={publicGame}
              footNote={`${st.finished ?? 0} of ${st.total ?? players.length} finished. Results come when everyone's done or time runs out.`} />}
      </main>
    );
  }

  if (open) {
    const round = open.round + 1;
    const memorising = !!open.pattern && now < open.showUntil;
    if (memorising) {
      const secs = Math.max(0, Math.ceil((open.showUntil - now) / 1000));
      return (
        <main className="mz-screen" aria-label={`${title}: round ${round} of ${of}, memorise the pattern`} data-testid="mz-pp-memorise">
          <GameHeader title={title} objective="Memorise it" accent={4} />
          <GameClock game={game} />
          <p className="mz-mr-round">Round {round} of {of} · {open.length} shapes</p>
          <ol className={`mz-pp-pattern${reducedMotion ? " mz-pp-pattern--still" : " mz-pp-pattern--sweep"}`} data-testid="mz-pp-pattern"
            style={{ ["--mz-pp-n" as string]: open.pattern!.length }} aria-label={`The pattern: ${open.pattern!.map((s) => PULSE_SYMBOLS[s]?.name).join(", ")}`}>
            {open.pattern!.map((s, i) => (
              <li key={i} className="mz-pp-cell" data-symbol={s} style={{ ["--mz-pp-i" as string]: i }}>
                <span className="mz-pp-cell__n" aria-hidden="true">{i + 1}</span>
                <PulseShape s={s} />
                <span className="mz-pp-cell__name" aria-hidden="true">{PULSE_SYMBOLS[s]?.short}</span>
              </li>
            ))}
          </ol>
          <FeedbackLine testId="mz-pp-timer">Hides in {secs}s. Then tap it back in order.</FeedbackLine>
        </main>
      );
    }
    const len = open.length;
    // Stage 5.1 (3D): the server takes no answer after the GAME's deadline
    // either (room.ts), so a round opened late shows the earlier of the two.
    const gameEndsFirst = game.deadlineAt !== undefined && game.deadlineAt < open.inputUntil;
    const until = gameEndsFirst ? game.deadlineAt! : open.inputUntil;
    const left = Math.max(0, Math.ceil((until - now) / 1000));
    const timeUp = now >= until;
    const sending = pending === "answer";
    const full = entry.length === len;
    return (
      <main className="mz-screen mz-pp-play" aria-label={`${title}: round ${round} of ${of}, tap the pattern back`} data-testid="mz-pp-input">
        {/* Stage 8.1: two columns on a short landscape screen (what to tap | the keys and Lock it in); one column otherwise. */}
        <div className="mz-pp-play__info">
        <GameHeader title={title} objective="Tap it back in order" accent={4} />
        <GameClock game={game} />
        <p className="mz-mr-round">Round {round} of {of} · {len} shapes</p>
        {/* Stage 5.1 (S5-AUD-02): the time left sits next to the entry, not below the button. */}
        <FeedbackLine testId="mz-pp-timer" tone={left <= 5 ? "warn" : "neutral"}>{timeUp ? (gameEndsFirst ? "The game's time is up." : "Time's up for this round.") : `${left}s to answer${gameEndsFirst ? " (the game ends then)" : ""}.`}</FeedbackLine>
        <ol className="mz-pp-slots" data-testid="mz-pp-slots" aria-label={`Your entry: ${entry.length} of ${len}${entry.length ? `: ${entry.map((s) => PULSE_SYMBOLS[s]?.name).join(", ")}` : ""}`}>
          {Array.from({ length: len }, (_, i) => (
            <li key={i} className={`mz-pp-slot${entry[i] !== undefined ? " mz-pp-slot--filled" : ""}`} data-symbol={entry[i]}>
              {entry[i] !== undefined ? <PulseShape s={entry[i]!} size={30} /> : <span aria-hidden="true">{i + 1}</span>}
            </li>
          ))}
        </ol>
        </div>
        <div className="mz-pp-play__act">
        <div className="mz-pp-keys" role="group" aria-label="Shapes">
          {PULSE_SYMBOLS.map((sym, s) => (
            <button key={s} type="button" className="mz-pp-key" data-testid={`mz-pp-key-${s}`} aria-label={sym.name}
              disabled={full || sending || timeUp} onClick={() => setEntry((e) => (e.length < len ? [...e, s] : e))}>
              <PulseShape s={s} size={40} />
              <span className="mz-pp-key__name">{sym.short}</span>
            </button>
          ))}
        </div>
        <div className="mz-pp-edit">
          <button type="button" className="mz-chip-btn" data-testid="mz-pp-undo" disabled={entry.length === 0 || sending || timeUp} onClick={() => setEntry((e) => e.slice(0, -1))}>Undo</button>
          <button type="button" className="mz-chip-btn" data-testid="mz-pp-clear" disabled={entry.length === 0 || sending || timeUp} onClick={() => setEntry([])}>Clear</button>
        </div>
        {/* A complete entry only counts once it's locked in: say so the moment it's complete. */}
        {full && !sending && !timeUp && <p className="mz-pp-lockhint" role="status" data-testid="mz-pp-lockhint">All {len} in. Tap “Lock it in” to send: it only counts once locked.</p>}
        <Keycap block className={full && !sending && !timeUp ? "mz-pp-lock--ready" : undefined} disabled={!full || sending || timeUp} onClick={() => void send("pulse-answer", { round: open.round, sequence: entry }, "answer")} data-testid="mz-pp-submit">
          {sending ? "Sending…" : full ? "Lock it in" : `${len - entry.length} to go`}
        </Keycap>
        {failure}
        </div>
      </main>
    );
  }

  const next = st.next ?? 0;
  const len = st.lengths?.[next] ?? next + 3;
  return (
    <main className="mz-screen mz-pp-play" aria-label={`${title}: round ${next + 1} of ${of}, ready when you are`} data-testid="mz-pp-ready">
      {/* Stage 8.1: two columns on a short landscape screen (the next round | the game clock and Show me); one column otherwise. */}
      <div className="mz-pp-play__info">
      <GameHeader title={title} objective={next === 0 ? "Watch, remember, repeat" : "Ready for the next one?"} accent={4} />
      {last && <p className={`mz-pp-last${last.perfect ? " mz-pp-last--good" : ""}`} data-testid="mz-pp-last">Round {last.round + 1}: {pulseResultLine(last)}</p>}
      <p className="mz-mr-round">Round {next + 1} of {of}</p>
      <h2 className="mz-mr-prompt" data-testid="mz-pp-next">{len} shapes this time</h2>
      <p className="mz-mr-ask">The pattern shows for a few seconds, then hides; then you have 16 to 24 seconds to tap it back. This round’s own timer starts when you tap Show me the pattern.</p>
      </div>
      <div className="mz-pp-play__act">
      {clock && <GameTimePanel clock={clock} />}
      {/* Stage 8.1: once the game's time is up, nothing here looks pressable.
          A display state only: the server ends the game at its deadline and
          this screen follows the next projection (it refuses a late open anyway). */}
      {clock?.up
        ? <p className="mz-pp-timeup" role="status" data-testid="mz-pp-timeup">The game’s time is up. {solo ? "Your results are on their way." : "The results follow."}</p>
        : (
          <Keycap block disabled={pending !== null} onClick={() => void send("pulse-open", { round: next }, "open")} data-testid="mz-pp-open">
            {pending === "open" ? "Opening…" : "Show me the pattern"}
          </Keycap>
        )}
      {failure}
      <p className="mz-pp-total" data-testid="mz-pp-total">Your total: <b>{total}</b></p>
      {!solo && !clock?.up && <button type="button" className="mz-chip-btn" style={{ alignSelf: "center", marginTop: 8 }} disabled={pending !== null} onClick={() => void send("abstain", {}, "sitout")} data-testid="mz-pp-sitout">Sit the rest out</button>}
      </div>
      {/* Announced once per band (under a minute, under 20 s, time up); never every second. */}
      <p className="mz-sr" role="status" aria-live="polite" data-testid="mz-pp-clock-say">{said}</p>
    </main>
  );
}

function Row({ seq }: { seq: number[] }) {
  return <span className="mz-pp-mini" aria-label={seq.map((s) => PULSE_SYMBOLS[s]?.name).join(", ")}>{seq.map((s, i) => <PulseShape key={i} s={s} size={20} />)}</span>;
}

/**
 * Your rounds, once the game is over: each pattern, what you tapped and what
 * it scored (Stage 6.2: shared by the multiplayer and solo results).
 */
export function PulseRecap({ game }: { game: PlayerGame }) {
  const results = ((game.state ?? {}) as PulseView).results ?? [];
  if (results.length === 0) return null;
  return (
    <ol className="mz-mr-recap" data-testid="mz-pp-recap">
      {results.map((r) => (
        <li key={r.round} data-testid="mz-pp-recap-round">
          <span className="mz-foot" style={{ textAlign: "left" }}>Round {r.round + 1} · {r.length} shapes</span>
          <span className="mz-pp-recap__row">Pattern <Row seq={r.pattern} /></span>
          {r.answer && <span className="mz-pp-recap__row">You tapped <Row seq={r.answer} /></span>}
          <span className="mz-mr-recap__line">{pulseResultLine(r)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Results: your six rounds (your own patterns and taps, now the game is over), the scores, how scoring works. */
export function MchezoPulseResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; /** Stage 7.2: a casual room's What's next panel. */ next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as PulseView;
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  const rows = Object.entries(game.rawScores ?? publicGame?.rawScores ?? {}).map(([id, score]) => ({
    id, name: nameOf(id), score: score as number, you: id === playerId,
    detail: participationLine("pattern-pulse", game.outcome?.participation[id], { you: id === playerId }),
  }));
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-pp-results">
      {hero}
      {next /* Stage 7.2: what's next, right under the result heading (review 6778921208) */}
      <GameHeader title={title} objective="How sharp was your memory?" accent={4} />
      {(() => { const m = pulseMoment(st.results); return m ? <p className="mz-moment" data-testid="results-moment">{m}</p> : null; })()}
      <PulseRecap game={game} />
      <ScoreList rows={rows} />
      <p className="mz-foot" data-testid="mz-pp-howscore">20 points for each shape right from the start of the sequence, plus 50 for the whole sequence. Everyone gets the same lengths and time, but their own pattern. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
      <OutcomeSummary gameId="pattern-pulse" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the six shapes (the alphabet, never anyone's pattern) and how far the room has got. */
export function PulseTv({ game, title }: { game: PublicGame; title: string }) {
  const st = (game.state ?? {}) as PulseView;
  const total = st.total ?? game.players.length;
  return (
    <section className="mz-tvshow-pp" data-testid="tv-live-pattern-pulse">
      <span className="mz-tv-kicker">{title} · everyone at their own pace</span>
      <h1 className="mz-tvshow-h1">Watch. Remember. Tap it back.</h1>
      <div className="mz-tvshow-pp__alphabet" aria-hidden="true">{PULSE_SYMBOLS.map((_, s) => <PulseShape key={s} s={s} size={110} />)}</div>
      <p className="mz-tvshow-line" data-testid="tv-live-progress"><b>{st.finished ?? 0} of {total}</b> finished all six rounds · {st.roundsPlayed ?? 0} rounds played · {st.perfectRounds ?? 0} perfect</p>
      <p className="mz-tvshow-line mz-tvshow-line--muted">Each phone gets its own pattern, so there's nothing to shout out. Patterns grow from 3 shapes to 8.</p>
    </section>
  );
}

/** TV post-game review: the room's totals only (patterns are personal). */
export function PulseReview({ game }: { game: PublicGame }) {
  const st = (game.state ?? {}) as PulseView;
  return <p className="mz-tvshow-line" data-testid="tv-pp-review">{st.roundsPlayed ?? 0} rounds played across the room, {st.perfectRounds ?? 0} of them perfect.</p>;
}
