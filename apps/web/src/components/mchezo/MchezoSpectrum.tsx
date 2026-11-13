/**
 * Spectrum (Stage 9.3, cooperative, casual rooms): "One team, one score:
 * find the secret spot on the scale together." Spec: docs/stage9/stage93.md.
 *
 * Display only. The server owns the pairs, the targets, who gives the clue,
 * every guess, the phase clock and the one team result (outcome.team). This
 * screen reads the player's own projection: the public facts, plus the
 * clue-giver's own target (clue and guess phases) or a guesser's own guess.
 * It never imports the module or its pairs.
 *
 * Nothing is sent by moving the scale: only Send (or Enter) sends, a draft is
 * local and starts fresh each round, and a reconnect never sends anything.
 * Every send names its round (and the app adds the phase key), so a late one
 * is refused and changes nothing.
 *
 * Meaning never rides on colour or motion: the ends are words, the number is
 * text, markers have a shape and a label, the countdown is text, and the
 * reveal is a sentence.
 */
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { GameCover, Keycap, OutcomeSummary, serverNowEstimate, useMchezo } from "../../ui/mchezo/index.js";
import { FeedbackLine, GameHeader } from "../../ui/mchezo/components/GameKit.js";
import { accentColor } from "../../ui/mchezo/lib/covers.js";
import {
  clampGuess, CLUE_MAX, closenessWord, clueDraft, guessesLine, revealLine, scaleName, secondsLeft, stepGuess, teamEndLine, teamTotalLine, valueText,
  type SpectrumPairView, type SpectrumRevealed, type SpectrumView, type TeamResult, type TeamRound,
} from "../../ui/mchezo/lib/spectrum.js";
import { SendNote } from "./SendNote.js";
import { spectrumMoment } from "../../ui/mchezo/lib/moments.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

const PHASE_MS = { clue: 60_000, guess: 45_000, reveal: 8_000 } as const;

/** Server time, re-read a few times a second while a phase is running. */
function useServerNow(active: boolean, everyMs = 250): number {
  const [now, setNow] = useState(() => serverNowEstimate());
  useEffect(() => {
    if (!active) return;
    setNow(serverNowEstimate());
    const t = setInterval(() => setNow(serverNowEstimate()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}

/** The phase's countdown, as text, from the server's deadline. */
function PhaseClock({ game, phase, testId = "sp-clock" }: { game: { status: string; phaseDeadlineAt?: number }; phase?: SpectrumView["phase"]; testId?: string }) {
  const running = game.status === "playing" && game.phaseDeadlineAt !== undefined && (phase === "clue" || phase === "guess" || phase === "reveal");
  const now = useServerNow(running);
  if (!running || !phase) return null;
  const s = secondsLeft(game.phaseDeadlineAt, now, PHASE_MS[phase]);
  const what = phase === "clue" ? "Clue" : phase === "guess" ? "Guesses" : "Next round";
  return (
    <p className="mz-sp-clock" role="timer" aria-live="off" data-testid={testId} data-seconds={s ?? ""} data-low={String((s ?? 99) <= 10)}>
      {what}: <b>{s ?? "…"} s</b> left
    </p>
  );
}

interface Marker { kind: "target" | "team" | "mine"; value: number; label: string }

/**
 * The scale: both ends in words (left = 0, right = 100), with markers told
 * apart by shape and a text legend (◆ target, ● team guess, ▲ your guess).
 */
export function SpectrumScale({ pair, target, team, mine, testId = "sp-scale", tv, compact }: { pair: SpectrumPairView; target?: number | null; team?: number | null; mine?: number | null; testId?: string; tv?: boolean; compact?: boolean }) {
  const marks: Marker[] = [];
  if (typeof target === "number") marks.push({ kind: "target", value: target, label: `Target ${target}` });
  if (typeof team === "number") marks.push({ kind: "team", value: team, label: `Team guess ${team}` });
  if (typeof mine === "number") marks.push({ kind: "mine", value: mine, label: `Your guess ${mine}` });
  const described = [scaleName(pair), ...marks.map((m) => m.label)].join(". ");
  return (
    <figure className={`mz-sp-scale${tv ? " mz-sp-scale--tv" : ""}${compact ? " mz-sp-scale--compact" : ""}`} data-testid={testId} role="img" aria-label={described}>
      <div className="mz-sp-scale__ends" aria-hidden="true">
        <span className="mz-sp-end" data-testid={`${testId}-left`}>{pair.left} <small>0</small></span>
        <span className="mz-sp-end mz-sp-end--right" data-testid={`${testId}-right`}><small>100</small> {pair.right}</span>
      </div>
      <div className="mz-sp-scale__track" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((t) => <span key={t} className="mz-sp-tick" style={{ left: `${t}%` }} />)}
        {marks.map((m) => (
          <span key={m.kind} className={`mz-sp-mark mz-sp-mark--${m.kind}`} style={{ left: `${clampGuess(m.value)}%` }} data-testid={`${testId}-${m.kind}`} data-value={m.value} />
        ))}
      </div>
      {marks.length > 0 && (
        <figcaption className="mz-sp-legend" aria-hidden="true">
          {marks.map((m) => <span key={m.kind} className={`mz-sp-legend__item mz-sp-legend__item--${m.kind}`}><span className="mz-sp-legend__shape" />{m.label}</span>)}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Your guess: a labelled 0–100 range (arrows ±1, Page Up/Down ±10, Home/End)
 * with the number shown, four nudge buttons for touch, and an explicit Send.
 * Enter sends; nothing else does.
 */
function GuessControl({ pair, roundNo, pending, onSend }: { pair: SpectrumPairView; roundNo: number; pending: boolean; onSend: (value: number) => void }) {
  const [draft, setDraft] = useState(50);
  useEffect(() => { setDraft(50); }, [roundNo]); // a fresh draft every round; nothing carried over
  const submit = (e?: FormEvent) => { e?.preventDefault(); if (!pending) onSend(draft); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }
    if (e.key === "PageUp" || e.key === "PageDown" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const v = stepGuess(draft, e.key);
      if (v !== null) setDraft(v);
    }
  };
  return (
    <form className="mz-sp-guess" onSubmit={submit} data-testid="sp-guess-form">
      <label htmlFor="sp-guess-range" className="mz-sp-guess__label">
        Your guess: <b className="mz-sp-guess__n" data-testid="sp-draft">{draft}</b> <span className="mz-sp-guess__where">{valueText(draft, pair)}</span>
      </label>
      <div className="mz-sp-guess__row">
        <span className="mz-sp-guess__end" aria-hidden="true">{pair.left}</span>
        <input
          id="sp-guess-range"
          data-testid="sp-guess-range"
          className="mz-sp-range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={draft}
          onChange={(e) => setDraft(clampGuess(Number(e.target.value)))}
          onKeyDown={onKey}
          aria-label={`Your guess. ${scaleName(pair)}`}
          aria-valuetext={valueText(draft, pair)}
          aria-describedby="sp-guess-help"
          disabled={pending}
        />
        <span className="mz-sp-guess__end" aria-hidden="true">{pair.right}</span>
      </div>
      <div className="mz-sp-nudge" role="group" aria-label="Fine-tune your guess">
        {[-10, -1, 1, 10].map((d) => (
          <button key={d} type="button" className="mz-pill mz-sp-nudge__btn" disabled={pending} onClick={() => setDraft((v) => clampGuess(v + d))} aria-label={`${d > 0 ? "Up" : "Down"} ${Math.abs(d)}`} data-testid={`sp-nudge-${d > 0 ? "up" : "down"}-${Math.abs(d)}`}>
            {d > 0 ? `+${d}` : `−${-d}`}
          </button>
        ))}
      </div>
      <p id="sp-guess-help" className="mz-foot">Arrows move it by 1, Page Up and Page Down by 10. Nothing is sent until you press Send, and a guess can't be changed once it's sent.</p>
      <Keycap type="submit" block disabled={pending} data-testid="sp-guess-send">{pending ? "Sending…" : `Send ${draft}`}</Keycap>
    </form>
  );
}

/** The clue-giver's clue: 1–80 characters, any language; the rule in words. */
function ClueForm({ roundNo, pending, onSend }: { roundNo: number; pending: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  useEffect(() => { setText(""); }, [roundNo]);
  const d = clueDraft(text);
  const over = d.length > CLUE_MAX;
  const submit = (e?: FormEvent) => { e?.preventDefault(); if (!pending && d.ok) onSend(d.cleaned); };
  return (
    <form className="mz-sp-clueform" onSubmit={submit} data-testid="sp-clue-form">
      <label htmlFor="sp-clue-input" className="mz-sp-clueform__label">Your clue</label>
      <input
        id="sp-clue-input"
        data-testid="sp-clue-input"
        className="mz-jr-input mz-sp-clueform__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        placeholder="A word or a few…"
        aria-describedby="sp-clue-help"
        aria-invalid={over || undefined}
        readOnly={pending}
      />
      <p id="sp-clue-help" className={`mz-foot mz-sp-clueform__help${over ? " mz-sp-clueform__help--over" : ""}`} data-testid="sp-clue-help">
        <b>Give a clue, not the target number.</b> <span data-testid="sp-clue-count">{d.length}/{CLUE_MAX}</span>{over ? " · too long" : ""}
      </p>
      <Keycap type="submit" block disabled={pending || !d.ok} data-testid="sp-clue-send">{pending ? "Sending…" : "Send clue"}</Keycap>
    </form>
  );
}

/**
 * Leaving the rest of the match (the room's whole-game sit-out): two taps,
 * because it can't be undone. Your role passes on: a clue-giver who leaves
 * before the clue skips the round; a guess already sent still counts.
 */
function SitOut({ pending, onLeave }: { pending: boolean; onLeave: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className="mz-chip-btn mz-sp-sitout" disabled={pending} onClick={() => setAsking(true)} data-testid="sp-sitout">Sit the rest out</button>;
  }
  return (
    <div className="mz-sp-sitout-confirm" role="group" aria-label="Leave the rest of this game?" data-testid="sp-sitout-confirm">
      <p className="mz-foot">Leave the rest of this game? Your role passes on, and you can't rejoin this match.</p>
      <div className="mz-sp-sitout-confirm__row">
        <button type="button" className="mz-chip-btn" onClick={() => setAsking(false)} data-testid="sp-sitout-stay">Stay in</button>
        <button type="button" className="mz-chip-btn" disabled={pending} onClick={() => { setAsking(false); onLeave(); }} data-testid="sp-sitout-yes">Yes, leave</button>
      </div>
    </div>
  );
}

function RoundTop({ st }: { st: SpectrumView }) {
  return (
    <p className="mz-sp-top" data-testid="sp-round">
      Round {st.roundNo ?? 1} of {st.rounds ?? 4} · <b data-testid="sp-running-total">Team {st.total ?? 0}</b> of {st.maxPoints ?? 40} so far
    </p>
  );
}

function ClueCard({ clue, by }: { clue: string; by: string }) {
  return (
    <figure className="mz-sp-clue" data-testid="sp-clue">
      <blockquote className="mz-sp-clue__text" data-testid="sp-clue-text">“{clue}”</blockquote>
      <figcaption className="mz-foot">Clue from {by}</figcaption>
    </figure>
  );
}

export interface MchezoSpectrumDeps {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  /** Resolves false when the action did not reach the game or was refused. */
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  landed?: boolean;
}

/** The phone while playing: the clue-giver, a guesser, or watching; then the reveal. */
export function MchezoSpectrum({ game, players, playerId, title, intent, error, landed }: MchezoSpectrumDeps) {
  const st = (game.state ?? {}) as SpectrumView;
  const nameOf = (id?: string | null) => (id === playerId ? "you" : players.find((p) => p.id === id)?.displayName ?? "Someone");
  const phase = st.phase ?? "clue";
  const roundNo = st.roundNo ?? 1;
  const me = st.me;
  const role = me?.role ?? "watching";
  const cur = st.current ?? null;
  const reveal: SpectrumRevealed | undefined = phase === "reveal" ? st.revealed?.at(-1) : undefined;
  const pair = cur?.pair ?? reveal?.pair;
  const giver = cur?.giver ?? reveal?.giver ?? null;
  const [pending, setPending] = useState(false);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  const at = `${roundNo}:${phase}`;
  useEffect(() => { setFailedAt(null); }, [at]);
  const send = async (action: string, payload: Record<string, unknown>) => {
    if (pending) return;
    setPending(true); setFailedAt(null);
    try { if ((await intent(game.id, action, { round: roundNo, ...payload })) === false) setFailedAt(at); }
    finally { setPending(false); }
  };
  const failure = <SendNote shown={failedAt === at} landed={landed} error={error} testId="sp-error" />;
  const sitOut = me && !me.satOut && !game.abstained ? (
    <SitOut pending={pending} onLeave={() => { setPending(true); void Promise.resolve(intent(game.id, "abstain", {})).finally(() => setPending(false)); }} />
  ) : null;
  const clock = <PhaseClock game={game} phase={phase} />;

  if (!pair) {
    return (
      <main className="mz-screen mz-sp" aria-label={`${title}: starting`} data-testid="sp-wait">
        <GameHeader title={title} objective="One team, one score" accent={2} />
        <p className="mz-foot">The first round is on its way…</p>
      </main>
    );
  }

  const objective = phase === "reveal" && reveal ? closenessWord(reveal)
    : me?.satOut ? "You left this game: watch the rest"
    : role === "giver" ? (phase === "clue" ? "Your clue" : "Your team is guessing")
    : role === "guesser" ? (phase === "clue" ? `${nameOf(giver)} is thinking of a clue` : me?.myGuess !== undefined ? "Locked in" : "Where does the clue sit?")
    : phase === "clue" ? `${nameOf(giver)} is thinking of a clue` : "Your team is guessing";

  const meaning = <p className="mz-foot mz-sp-meaning" data-testid="sp-meaning">{pair.meaning}</p>;

  if (phase === "reveal" && reveal) {
    return (
      <main className="mz-screen mz-sp" aria-label={`${title}: round ${roundNo} reveal`} data-testid="sp-reveal" data-reason={reveal.reason}>
        <GameHeader title={title} objective={objective} accent={2} />
        <RoundTop st={st} />
        <SpectrumScale pair={pair} target={reveal.target} team={reveal.aggregate} mine={me?.myGuess ?? null} testId="sp-reveal-scale" />
        {reveal.clue && <ClueCard clue={reveal.clue} by={nameOf(giver)} />}
        <FeedbackLine tone={reveal.points > 0 ? "good" : "neutral"} testId="sp-reveal-line">{revealLine(reveal)}</FeedbackLine>
        {clock}
        {sitOut}
      </main>
    );
  }

  if (role === "giver" && !me?.satOut) {
    return (
      <main className="mz-screen mz-sp mz-sp--giver" aria-label={`${title}: you give the clue`} data-testid="sp-giver" data-phase={phase}>
        <GameHeader title={title} objective={objective} accent={2} />
        <RoundTop st={st} />
        <SpectrumScale pair={pair} target={me?.target ?? null} testId="sp-giver-scale" />
        {meaning}
        {phase === "clue" ? (
          <>
            <p className="mz-sp-secret" data-testid="sp-target-note">Only you can see the target: <b data-testid="sp-target">{me?.target ?? "…"}</b>. Give a clue that sits at about that spot.</p>
            <ClueForm roundNo={roundNo} pending={pending} onSend={(text) => void send("spectrum-clue", { text })} />
          </>
        ) : (
          <>
            {cur?.clue && <ClueCard clue={cur.clue} by="you" />}
            {cur && <p className="mz-foot" data-testid="sp-count">{guessesLine(cur)}</p>}
          </>
        )}
        {failure}
        {clock}
        {sitOut}
      </main>
    );
  }

  if (role === "guesser" && !me?.satOut && phase === "guess" && cur?.clue) {
    const sent = me?.myGuess;
    return (
      <main className="mz-screen mz-sp mz-sp--guesser" aria-label={`${title}: your guess`} data-testid="sp-guesser" data-sent={String(sent !== undefined)}>
        <GameHeader title={title} objective={objective} accent={2} />
        <RoundTop st={st} />
        <ClueCard clue={cur.clue} by={nameOf(giver)} />
        {meaning}
        {sent === undefined ? (
          <GuessControl pair={pair} roundNo={roundNo} pending={pending} onSend={(value) => void send("spectrum-guess", { value })} />
        ) : (
          <>
            <SpectrumScale pair={pair} mine={sent} testId="sp-mine-scale" />
            <FeedbackLine tone="good" testId="sp-locked">Your guess: {sent} · locked in. It can't be changed.</FeedbackLine>
          </>
        )}
        <p className="mz-foot" data-testid="sp-count">{guessesLine(cur)}</p>
        {failure}
        {clock}
        {sitOut}
      </main>
    );
  }

  // Waiting for the clue, watching (sat out, or no role this round).
  return (
    <main className="mz-screen mz-sp" aria-label={`${title}: ${objective}`} data-testid="sp-watch" data-phase={phase}>
      <GameHeader title={title} objective={objective} accent={2} />
      <RoundTop st={st} />
      <SpectrumScale pair={pair} testId="sp-watch-scale" />
      {meaning}
      {phase === "guess" && cur?.clue && <ClueCard clue={cur.clue} by={nameOf(giver)} />}
      {phase === "guess" && cur && <p className="mz-foot" data-testid="sp-count">{guessesLine(cur)}</p>}
      {phase === "clue" && !me?.satOut && me && <FeedbackLine testId="sp-waiting">Waiting for the clue. You'll place your guess when it arrives.</FeedbackLine>}
      {clock}
      {sitOut}
    </main>
  );
}

/** Every revealed round in words, with the pair, the clue and a small scale. */
function RoundList({ rounds, revealed, nameOf, tv, testId = "sp-rounds" }: { rounds: TeamRound[]; revealed: SpectrumRevealed[]; nameOf: (id?: string | null) => string; tv?: boolean; testId?: string }) {
  if (rounds.length === 0) return <p className="mz-foot" data-testid={`${testId}-none`}>No round was revealed.</p>;
  return (
    <ol className={`mz-sp-rounds${tv ? " mz-sp-rounds--tv" : ""}`} data-testid={testId}>
      {rounds.map((r) => {
        const giver = revealed.find((x) => x.roundNo === r.roundNo)?.giver;
        return (
          <li key={r.roundNo} className="mz-sp-round" data-testid={`${testId}-${r.roundNo}`} data-points={r.points} data-reason={r.reason}>
            <span className="mz-sp-round__head"><b>Round {r.roundNo}</b><span className="mz-sp-round__pair">{r.pair.left} ↔ {r.pair.right}</span><b className="mz-sp-round__pts">+{r.points}</b></span>
            {r.clue && <span className="mz-sp-round__clue">“{r.clue}”{giver ? <> · clue from {nameOf(giver)}</> : null}</span>}
            <SpectrumScale pair={r.pair} target={r.target} team={r.aggregate} testId={`${testId}-${r.roundNo}-scale`} tv={tv} compact />
            <span className="mz-sp-round__line">{revealLine(r)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The top of the results for a cooperative game: one team result, no winner,
 * no place, no "you won/missed", no confetti (9.3 §3).
 */
export function TeamResultsHero({ team, gameId, title, official, roomReason }: { team: TeamResult; gameId: string; title: string; official: boolean; roomReason?: string }) {
  const { casual } = useMchezo();
  const end = teamEndLine(team, roomReason);
  return (
    <section className="mz-rhero mz-rhero--team" data-testid="results-hero" data-tone="team" style={{ ["--mz-accent" as string]: accentColor(gameId) }} aria-labelledby="mz-rhero-title">
      <div className="mz-rhero__top">
        <GameCover gameId={gameId} decorative className="mz-rhero__cover" />
        <div className="mz-rhero__text">
          <span className="mz-kicker mz-rhero__kicker">{title} · {official ? "Official" : casual ? "Casual" : "Practice"} · Co‑op</span>
          <h1 className="mz-rhero__title" id="mz-rhero-title" data-testid="results-headline">{teamTotalLine(team)}</h1>
        </div>
      </div>
      <p className="mz-rhero__line" data-testid="results-team-line">One shared score for everyone who played.</p>
      {end && <p className="mz-rhero__line" data-testid="results-team-end">{end}</p>}
    </section>
  );
}

/** Results: the one team result, how each round went, and your own part. */
export function MchezoSpectrumResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next, save }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode; save?: ReactNode }) {
  const { casual } = useMchezo();
  const team = game.outcome?.team ?? publicGame?.outcome?.team;
  const st = (game.state ?? publicGame?.state ?? {}) as SpectrumView;
  const nameOf = (id?: string | null) => (id === playerId ? "you" : players.find((p) => p.id === id)?.displayName ?? "someone");
  return (
    <main className="mz-screen mz-sp" aria-label={`${title} team result`} data-testid="sp-results">
      {hero}
      {next}
      <GameHeader title={title} objective="Team result" accent={2} />
      {team ? (
        <>
          <p className="mz-sp-total" data-testid="sp-team-total" data-total={team.total} data-max={team.max}>{team.total}<span> / {team.max}</span></p>
          {/* Stage 10.2 (D-S102-03/04): a team line for a genuine moment, under the result; nothing when no fact fits. */}
          {(() => { const m = spectrumMoment(team); return m ? <p className="mz-moment" data-testid="results-moment">{m}</p> : null; })()}
          {/* Stage 10.4: Save a memory, under the result (What's next and its controls stay above). */}
          {save}
          <p className="mz-foot" data-testid="sp-team-note">One shared score for everyone who played. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
          <RoundList rounds={team.rounds} revealed={st.revealed ?? []} nameOf={nameOf} />
        </>
      ) : <p className="mz-foot" data-testid="sp-no-result">This match has no team result.</p>}
      <p className="mz-foot" data-testid="sp-howscore">The team's guess is the middle of everyone's guesses: within 5 of the target scores 10, within 10 scores 7, within 20 scores 4.</p>
      <OutcomeSummary gameId="spectrum" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} youChoseSatOut={game.abstained === true} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the pair, the clue-giver and the clue, the count and the clock; at a reveal, the target and the team's guess. Public facts only. */
export function SpectrumTv({ game, title, nameOf }: { game: PublicGame; title: string; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as SpectrumView;
  const name = (id?: string | null) => (id ? nameOf(id) : "Someone");
  const phase = st.phase ?? "clue";
  const reveal = phase === "reveal" ? st.revealed?.at(-1) : undefined;
  const cur = st.current ?? null;
  const pair = cur?.pair ?? reveal?.pair;
  const giver = cur?.giver ?? reveal?.giver ?? null;
  return (
    <section className="mz-sp-tv" data-testid="tv-live-spectrum" data-phase={phase}>
      <span className="mz-tv-kicker" data-testid="tv-sp-kicker">{title} · Round {st.roundNo ?? 1} of {st.rounds ?? 4} · Team {st.total ?? 0} of {st.maxPoints ?? 40} so far</span>
      {pair && <h1 className="mz-tvshow-h1" data-testid="tv-sp-pair">{pair.left} ↔ {pair.right}</h1>}
      {pair && <p className="mz-tvshow-line mz-tvshow-line--muted">{pair.meaning}</p>}
      {pair && <SpectrumScale pair={pair} target={reveal?.target ?? null} team={reveal?.aggregate ?? null} testId="tv-sp-scale" tv />}
      {phase === "clue" && <p className="mz-tvshow-line" data-testid="tv-sp-status">{name(giver)} is thinking of a clue…</p>}
      {phase === "guess" && cur?.clue && <p className="mz-sp-tv__clue" data-testid="tv-sp-clue">“{cur.clue}” <span className="mz-tvshow-line--muted">· clue from {name(giver)}</span></p>}
      {phase === "guess" && cur && <p className="mz-tvshow-line" data-testid="tv-sp-count">{guessesLine(cur)} · guess on your phones</p>}
      {reveal && <p className="mz-tvshow-line" data-testid="tv-sp-reveal">{closenessWord(reveal)} {revealLine(reveal)}</p>}
      <PhaseClock game={game} phase={phase} testId="tv-sp-clock" />
    </section>
  );
}

/** TV after the game: the team result and every round (no standings). */
export function SpectrumTvFinal({ game, nameOf }: { game: PublicGame; nameOf: (id: string) => string }) {
  const team = game.outcome?.team;
  const st = (game.state ?? {}) as SpectrumView;
  if (!team) return null;
  const end = teamEndLine(team, game.outcome?.reason);
  return (
    <section className="mz-tvshow-final mz-sp-tvfinal" data-testid="tv-team-final">
      <p className="mz-tvshow-winner" data-testid="tv-team-result">{teamTotalLine(team)}</p>
      <p className="mz-tvshow-line">One shared score for everyone who played.{end ? ` ${end}` : ""}</p>
      {(() => { const m = spectrumMoment(team); return m ? <p className="mz-tvshow-line mz-tv-moment" data-testid="tv-results-moment">{m}</p> : null; })()}
      <RoundList rounds={team.rounds} revealed={st.revealed ?? []} nameOf={(id) => (id ? nameOf(id) : "someone")} tv testId="tv-sp-rounds" />
    </section>
  );
}

/** TV review: every round of the finished match. */
export function SpectrumReview({ game, nameOf }: { game: PublicGame; nameOf: (id: string) => string }) {
  const team = game.outcome?.team;
  const st = (game.state ?? {}) as SpectrumView;
  if (!team) return null;
  return (
    <div data-testid="tv-sp-review">
      <p className="mz-tvshow-line">{teamTotalLine(team)}</p>
      <RoundList rounds={team.rounds} revealed={st.revealed ?? []} nameOf={(id) => (id ? nameOf(id) : "someone")} tv testId="tv-sp-review-rounds" />
    </div>
  );
}
