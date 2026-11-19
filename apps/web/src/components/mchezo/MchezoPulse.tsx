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
 * is never needed. No sound.
 *
 * H1 (handoff 7008903623): the pattern is a transient cue, one symbol at a
 * time. The server's memorise window is split into one equal slot per symbol
 * (pulseCue.ts), and the stage shows the current symbol with its position and
 * name ("2 of 5: Yellow square"). At no point does the screen, its text or an
 * accessible name hold the whole sequence, while memorising or while tapping
 * it back. Reduced motion (or Animations Off) keeps the same timing and drops
 * only the small pop-in.
 *
 * The cue announcer (H1, review 7010784066): a screen reader hears the same
 * symbol in the same slot from ONE assertive live region, PulseAnnouncer. It
 * is mounted, empty, from the screen before the pattern opens (and on every
 * other screen of the game) at the same place in the tree, so the first cue
 * is an update to a region that is already there, not a region arriving with
 * its text. The same node then goes empty → "1 of 5: …" → empty in each gap →
 * … → empty when the window ends and the recall screen comes. The visible
 * stage is hidden from assistive technology so nothing is heard twice.
 *
 * What you tap is kept on this phone until the server confirms it; a send
 * that fails says so and keeps your entry for another try.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameClock, Keycap, MchezoWaiting, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { NO_ANNOUNCEMENTS, clockAnnouncementText, gameClockView, nextAnnouncement, type AnnouncementHistory, type GameClockView } from "./pulseClock.js";
import { pulseCueAt, pulseCueText } from "./pulseCue.js";
import { FeedbackLine, GameHeader, ScoreList } from "../../ui/mchezo/components/GameKit.js";
import { participationLine, serverNowEstimate } from "../../ui/mchezo/lib/lifecycle.js";
import { SendNote } from "./SendNote.js";
import { pulseMoment } from "../../ui/mchezo/lib/moments.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

interface PulseResultView { round: number; length: number; answer: number[] | null; correctRun: number; perfect: boolean; points: number; pattern: number[] }
export interface PulseView {
  roundCount?: number; lengths?: number[]; finished?: number; total?: number; roundsPlayed?: number; perfectRounds?: number;
  next?: number;
  /** showFrom (H1): when the memorise window began (server time); an older server sends none. */
  open?: { round: number; length: number; showFrom?: number; showUntil: number; inputUntil: number; pattern?: number[] };
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

/**
 * H1: what the cue announcer says at `now`: the current symbol's words in its own slot of the memorise
 * window, and nothing in a gap, before a round opens or once the window is over (the recall screen).
 * `firstSeenAt` stands in for showFrom from an older server that sends none.
 */
export function pulseCueSay(open: PulseView["open"], now: number, firstSeenAt: number): string {
  if (!open?.pattern || now >= open.showUntil) return "";
  const len = open.pattern.length;
  const cue = pulseCueAt(len, open.showFrom ?? firstSeenAt, open.showUntil, now);
  const sym = cue.index !== null ? open.pattern[cue.index] : undefined;
  return cue.index !== null && sym !== undefined ? pulseCueText(cue.index, len, PULSE_SYMBOLS[sym]?.name ?? "") : "";
}

/** How long a newly mounted announcer stays empty before it may speak (only matters when it mounts mid-window). */
export const PULSE_ANNOUNCER_SETTLE_MS = 150;

/**
 * H1 (review 7010784066): the one cue announcer. A live region is announced when a region already in the
 * page changes, so this one always mounts EMPTY and only says `text` once it has been in the page for
 * PULSE_ANNOUNCER_SETTLE_MS. In play it mounts with the game's ready screen, long before a pattern opens;
 * the wait matters only when the page itself loads mid-window (a reload), and then the first words come
 * at most that much after the symbol. Visually hidden; the visible stage is not announced.
 */
export function PulseAnnouncer({ text }: { text: string }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), PULSE_ANNOUNCER_SETTLE_MS);
    return () => clearTimeout(t);
  }, []);
  return <p className="mz-sr" data-testid="mz-pp-announcer" aria-live="assertive" aria-atomic="true">{settled ? text : ""}</p>;
}

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

/** A re-render every ~200 ms while a server-timed window is running (every 50 ms while a pattern is shown, so each symbol's slot starts on time). */
function useNow(active: boolean, everyMs = 200): number {
  const [now, setNow] = useState(() => serverNowEstimate());
  useEffect(() => {
    if (!active) return;
    setNow(serverNowEstimate());
    const t = setInterval(() => setNow(serverNowEstimate()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
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
  /**
   * Stage 8.1 (spec feedback 6790913242): the game server can't be reached
   * right now (solo: no fresh reply for a while; a room: the socket is
   * reconnecting). With the game's time up, the screen then says so and
   * offers `onCheckAgain` rather than promising results that may not come.
   */
  stale?: boolean;
  onCheckAgain?: () => void;
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

export function MchezoPulse({ game, publicGame, players, playerId, title, intent, error, landed, solo, stale, onCheckAgain }: MchezoPulseDeps) {
  const st = (game.state ?? {}) as PulseView;
  const { reducedMotion } = useMchezo();
  const of = st.roundCount ?? 6;
  const open = st.open;
  const finishedHere = !!st.done || !!st.satOut;
  // Stage 8.1: tick between patterns too, so the game's time left stays current.
  const now = useNow(!!open || (!finishedHere && game.deadlineAt !== undefined), open?.pattern ? 50 : 200);
  // H1: from an older server without showFrom, the window counts from when this phone first saw the round open.
  const firstSeen = useRef<{ key: string; at: number } | null>(null);
  const seenKey = open ? `${game.id}:r${open.round}` : "";
  if (open && firstSeen.current?.key !== seenKey) firstSeen.current = { key: seenKey, at: now };
  // H1 (review 7010784066): every screen below renders the SAME announcer after its own <main>, at the
  // same place in the tree, so React keeps one DOM node for it from the ready screen through each slot,
  // gap and the recall screen; only its text changes.
  const cueSay = pulseCueSay(open, now, firstSeen.current?.at ?? now);
  const withAnnouncer = (screen: ReactNode) => <>{screen}<PulseAnnouncer text={cueSay} /></>;
  const clock = gameClockView(game.deadlineAt, now);
  // Announce only crossings into a more urgent band, each once per GAME (the
  // history is keyed by the game instance: screens never repeat a warning,
  // a new game starts afresh), and only between patterns (never over a
  // pattern being memorised or tapped).
  const announced = useRef<AnnouncementHistory>(NO_ANNOUNCEMENTS);
  const [said, setSaid] = useState("");
  const between = !open && !finishedHere;
  const band = clock?.band ?? "none";
  useEffect(() => {
    if (announced.current.gameId !== game.id) setSaid("");
    if (!between) return;
    const next = nextAnnouncement(announced.current, game.id, band);
    announced.current = next.history;
    if (next.say) setSaid(clockAnnouncementText(next.say));
  }, [between, band, game.id]);
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
    return withAnnouncer(
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
      const len = open.pattern!.length;
      const cue = pulseCueAt(len, open.showFrom ?? firstSeen.current?.at ?? now, open.showUntil, now);
      const sym = cue.index !== null ? open.pattern![cue.index] : undefined;
      return withAnnouncer(
        <main className="mz-screen" aria-label={`${title}: round ${round} of ${of}, memorise the pattern`} data-testid="mz-pp-memorise">
          <GameHeader title={title} objective="Memorise it" accent={4} />
          <GameClock game={game} />
          <p className="mz-mr-round">Round {round} of {of} · {len} shapes, one at a time</p>
          {/* H1: one symbol at a time, never the whole sequence. Seen here; heard from the one announcer
              (PulseAnnouncer, the same words in the same slot), so this stage is hidden from assistive technology. */}
          <div className={`mz-pp-stage${reducedMotion ? " mz-pp-stage--still" : ""}`} data-testid="mz-pp-stage" aria-hidden="true">
            {cue.index !== null && sym !== undefined && (
              <p key={cue.index} className="mz-pp-stage__item" data-testid="mz-pp-cue" data-index={cue.index} data-symbol={sym}>
                <PulseShape s={sym} size={112} />
                <span className="mz-pp-stage__text">{pulseCueText(cue.index, len, PULSE_SYMBOLS[sym]?.name ?? "")}</span>
              </p>
            )}
          </div>
          {/* Not a live region: a countdown read out every second would talk over the symbols. */}
          <p className="mz-foot" data-testid="mz-pp-timer">Hides in {secs}s. Then tap it back in order.</p>
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
    return withAnnouncer(
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
  return withAnnouncer(
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
        ? (stale
          ? (
            // The server can't be reached: say so plainly and offer a way on
            // (Leave round stays in the solo bar; a room keeps its reconnect banner).
            <div className="mz-pp-timeup mz-pp-timeup--stale" role="status" data-testid="mz-pp-timeup" data-stale="true">
              <p>The game’s time is up, but the game server isn’t answering right now, so your results can’t show yet. They will as soon as it answers.</p>
              {onCheckAgain && <Keycap block variant="surface" size="md" data-testid="mz-pp-checkagain" onClick={onCheckAgain}>Check again</Keycap>}
            </div>
          )
          : <p className="mz-pp-timeup" role="status" data-testid="mz-pp-timeup">The game’s time is up. {solo ? "Your results are on their way." : "The results follow."}</p>)
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
