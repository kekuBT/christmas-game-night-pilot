/**
 * Jebena Rush (Stage 9.1, practice-only, casual rooms): "Name it. Pass it.
 * Beat the steam." Spec: docs/stage9/stage91.md §8.
 *
 * Display only. The server owns the seat order, whose turn it is, the
 * category, the answers already named, every life and the turn's deadline
 * (the room's phase clock). This screen reads the player's own view: the
 * public facts plus their own last try on the current turn. It never sees
 * the answer bank. An answer names the turn it was typed for, so one that
 * lands after the turn moved on changes nothing.
 *
 * Meaning never rides on colour or motion alone: the countdown is text, the
 * urgency has a word ("Warm", "Steaming", "Boiling over!") and a count of
 * steam curls, cups have a number, and with reduced or no motion the
 * jebena is still while the same words carry the urgency.
 *
 * Stage 10.1 (docs/stage10/stage101.md): each life is a cini, a small
 * handleless coffee cup (CiniCups.tsx), and a lost life is a broken cup. The
 * server's fields keep the name `hearts` (D-S101-02); only the pictures and
 * the words changed.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Keycap, OutcomeSummary, SegmentedChoice, serverNowEstimate, useMchezo } from "../../ui/mchezo/index.js";
import { FeedbackLine, GameHeader } from "../../ui/mchezo/components/GameKit.js";
import { participationLine } from "../../ui/mchezo/lib/lifecycle.js";
import { SendNote } from "./SendNote.js";
import { CiniCups } from "./CiniCups.js";
import { lastLossAt } from "../../ui/mchezo/lib/cups.js";
import { resultLine } from "../../ui/mchezo/lib/tvfeed.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";
import {
  jebenaEndLine, keptTheJebena, lastPlayLine, shownSeconds, turnLeftMs, URGENCY_LABEL, urgencyFor, verdictLine,
  type JebenaAttemptView, type JebenaLogEntry, type JebenaStanding, type Urgency,
} from "../../ui/mchezo/lib/jebena.js";

interface Seat { id: string; hearts: number; out: boolean; satOut: boolean; answers: number; timeouts: number }
type LogEntry = JebenaLogEntry;
type Standing = JebenaStanding;
export interface JebenaView {
  rulesVersion?: number;
  startHearts?: number;
  turnMs?: number;
  graceMs?: number;
  order?: Seat[];
  turn?: { n: number; player: string } | null;
  category?: { id: string; name: string; definition: string; round: number; named: number };
  named?: { answer: string; player: string }[];
  log?: LogEntry[];
  end?: null | "last-standing" | "banks-exhausted";
  standings?: Standing[];
  // The player's own view only.
  me?: { hearts: number; out: boolean; satOut: boolean; answers: number };
  myTurn?: boolean;
  attempt?: JebenaAttemptView;
}

export const JEBENA_HEART_OPTIONS = [3, 5, 7] as const;

/** Server time, re-read a few times a second while a turn is running. */
function useServerNow(active: boolean, everyMs = 200): number {
  const [now, setNow] = useState(() => serverNowEstimate());
  useEffect(() => {
    if (!active) return;
    setNow(serverNowEstimate());
    const t = setInterval(() => setNow(serverNowEstimate()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}

function useTurnClock(game: { status: string; phaseDeadlineAt?: number }, st: JebenaView) {
  const running = game.status === "playing" && !!st.turn && game.phaseDeadlineAt !== undefined;
  const now = useServerNow(running);
  const left = running ? turnLeftMs(game.phaseDeadlineAt, st.graceMs ?? 500, now) : null;
  const turnMs = st.turnMs ?? 10_000;
  const urgency: Urgency = left === null ? "warm" : urgencyFor(left, turnMs);
  const seconds = left === null ? null : shownSeconds(left, turnMs);
  return { left, seconds, urgency, turnMs };
}

/**
 * An original jebena (clay coffee pot) on a cream stage, so it reads on
 * either look: round body with a decorated band, a narrow neck with a straw
 * stopper, a spout and a handle. Steam curls rise from the spout: one when
 * warm, two when steaming, three when boiling over. The pot wobbles faster
 * as the deadline nears (CSS, full motion only; still otherwise).
 */
export function JebenaArt({ urgency, size = 140, label, testId = "jr-art" }: { urgency: Urgency; size?: number; label?: string; testId?: string }) {
  const curls = urgency === "warm" ? 1 : urgency === "steaming" ? 2 : 3;
  return (
    <svg className="mz-jr-art" data-urgency={urgency} data-steam={curls} data-testid={testId} viewBox="0 0 120 120" width={size} height={size}
      role="img" aria-label={label ?? `The jebena: ${URGENCY_LABEL[urgency]}`}>
      <circle cx="60" cy="60" r="58" fill="#F7F1E8" />
      <circle cx="60" cy="60" r="58" fill="none" stroke="#2B1A14" strokeOpacity=".16" strokeWidth="2" />
      <ellipse cx="60" cy="104" rx="22" ry="4" fill="#2B1A14" opacity=".18" />
      <g className="mz-jr-steam" fill="none" stroke="#8C7B70" strokeWidth="3.2" strokeLinecap="round">
        <path className="mz-jr-steam__curl mz-jr-steam__curl--1" d="M88,31 C83,25 94,21 88,13" />
        {curls >= 2 && <path className="mz-jr-steam__curl mz-jr-steam__curl--2" d="M96,35 C91,29 102,25 96,17" />}
        {curls >= 3 && <path className="mz-jr-steam__curl mz-jr-steam__curl--3" d="M80,28 C75,22 86,18 80,10" />}
      </g>
      <g className="mz-jr-pot">
        <path d="M55,41 C36,39 30,63 42,75" fill="none" stroke="#2B1A14" strokeWidth="5" strokeLinecap="round" />
        <path d="M64,50 L86,36" fill="none" stroke="#2B1A14" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M53,60 L55,35 Q60,30 65,35 L67,60 Z" fill="#2B1A14" />
        <path d="M57,32 L60,21 L63,32 Z" fill="#C9A56B" />
        <ellipse cx="60" cy="34" rx="6.5" ry="2.4" fill="#5A3423" />
        <circle cx="60" cy="78" r="24" fill="#2B1A14" />
        <path d="M47,68 Q51,60 59,58" fill="none" stroke="#6B4030" strokeWidth="3" strokeLinecap="round" opacity=".9" />
        <path d="M39,81 Q60,95 81,81" fill="none" stroke="#E8C9A0" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="49" cy="87" r="1.9" fill="#E8C9A0" />
        <circle cx="60" cy="90" r="1.9" fill="#E8C9A0" />
        <circle cx="71" cy="87" r="1.9" fill="#E8C9A0" />
      </g>
    </svg>
  );
}

/** The countdown, in text first; the jebena's word next to it. */
function TurnClock({ seconds, urgency, testId = "jr-clock" }: { seconds: number | null; urgency: Urgency; testId?: string }) {
  if (seconds === null) return null;
  return (
    <p className="mz-jr-clock" data-testid={testId} data-urgency={urgency} role="timer" aria-live="off">
      <b className="mz-jr-clock__s" data-testid={`${testId}-seconds`}>{seconds}</b>
      <span className="mz-jr-clock__unit">{seconds === 1 ? "second" : "seconds"}</span>
      <span className="mz-jr-clock__word" data-testid={`${testId}-word`}>{URGENCY_LABEL[urgency]}</span>
    </p>
  );
}

/**
 * Seat order with each player's cups; the holder marked in words and with a ▶ mark.
 * An eliminated seat shows every cup broken and "Out"; a seat that left shows
 * "Left" and no cups, so leaving never looks like cups breaking (D-S101-05).
 */
function SeatList({ order, holder, startHearts, nameOf, meId, testId = "jr-seats", gameId, log, surface = "seat" }: { order: Seat[]; holder?: string; startHearts: number; nameOf: (id?: string) => string; meId?: string; testId?: string; gameId?: string; log?: LogEntry[]; surface?: string }) {
  return (
    <ol className="mz-jr-seats" data-testid={testId} aria-label="Seat order">
      {order.map((s) => (
        <li key={s.id} className={`mz-jr-seat${s.id === holder ? " mz-jr-seat--holder" : ""}${s.out ? " mz-jr-seat--out" : ""}`} data-testid={`jr-seat-${s.id}`} data-holder={String(s.id === holder)} data-out={String(s.out)}>
          <span className="mz-jr-seat__mark" aria-hidden="true">{s.id === holder ? "▶" : s.out ? "✕" : "·"}</span>
          <span className="mz-jr-seat__name">{s.id === meId ? `${nameOf(s.id)} (you)` : nameOf(s.id)}{s.id === holder ? <span className="mz-jr-seat__tag"> · has the jebena</span> : null}</span>
          {s.satOut ? <span className="mz-jr-seat__status">Left</span> : (
            <span className="mz-jr-seat__cups">
              <CiniCups n={s.hearts} of={startHearts} compact memoryKey={gameId ? `${gameId}:${s.id}:${surface}` : undefined} lostAt={lastLossAt(log, s.id)} seat={s.id} surface={surface} />
              {s.out && <span className="mz-jr-seat__status">Out</span>}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Named({ named, nameOf, meId }: { named: { answer: string; player: string }[]; nameOf: (id?: string) => string; meId?: string }) {
  if (named.length === 0) return <p className="mz-foot mz-jr-named--empty" data-testid="jr-named">Nothing named yet in this category.</p>;
  return (
    <ul className="mz-jr-named" data-testid="jr-named" aria-label="Already named in this category">
      {[...named].reverse().map((x, i) => <li key={`${x.answer}-${i}`}><b>{x.answer}</b> <span className="mz-jr-named__by">{x.player === meId ? "you" : nameOf(x.player)}</span></li>)}
    </ul>
  );
}

/** Lobby (host or cohost): 3, 5 or 7 cups each, 5 preselected. */
export function JebenaHeartsChoice({ value, onChange, busy }: { value: number; onChange: (hearts: number) => void; busy?: boolean }) {
  return (
    <div className="mz-content-choice mz-jr-heartschoice" data-testid="lobby-hearts" data-hearts={value}>
      <span className="mz-content-choice__label" aria-hidden="true">Cups</span>
      <SegmentedChoice
        label="Cups each"
        compact
        value={String(value)}
        onChange={(v) => { const n = Number(v); if (!busy && n !== value) onChange(n); }}
        options={JEBENA_HEART_OPTIONS.map((h) => ({ value: String(h), title: `${h} cups`, testId: `lobby-hearts-${h}`, tone: "neutral" as const, disabled: busy }))}
      />
      <p className="mz-foot mz-content-choice__note mz-jr-cupslabel" data-testid="lobby-hearts-note">
        <CiniCups n={value} of={value} compact decorative />
        Each player starts with {value} cups. Run out of time and one breaks; when all of yours are broken, you're out.
      </p>
    </div>
  );
}

/** Everyone else (guests, the briefing): the cups each player starts with, in words, with the cups beside them. */
export function JebenaCupsLabel({ hearts, testId, text }: { hearts: number; testId?: string; text: string }) {
  return (
    <span className="mz-jr-cupslabel" data-testid={testId} data-hearts={hearts}>
      <span>{text}</span>
      <CiniCups n={hearts} of={hearts} compact decorative />
    </span>
  );
}

export interface MchezoJebenaDeps {
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

/** The phone while playing: your turn (type and send), someone else's (watch), or out (watch the rest). */
export function MchezoJebena({ game, players, playerId, title, intent, error, landed }: MchezoJebenaDeps) {
  const st = (game.state ?? {}) as JebenaView;
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  const { seconds, urgency } = useTurnClock(game, st);
  const turnN = st.turn?.n ?? 0;
  const holder = st.turn?.player;
  const startHearts = st.startHearts ?? 5;
  const cat = st.category;
  const myTurn = !!st.myTurn && !!st.turn;
  const me = st.me;
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [failedTurn, setFailedTurn] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // A new turn starts with an empty field, focused when it's yours (phones keep the keyboard up).
  useEffect(() => { setText(""); setFailedTurn(null); if (myTurn) inputRef.current?.focus(); }, [turnN, myTurn]);
  // After a try that didn't count, keep what was typed, selected, so the next one replaces it.
  const attemptKey = st.attempt ? `${st.attempt.turn}:${st.attempt.text}:${st.attempt.verdict}` : "";
  useEffect(() => { if (st.attempt && st.attempt.verdict !== "accepted") inputRef.current?.select(); }, [attemptKey]);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!myTurn || pending) return;
    const typed = text.trim();
    if (!typed) { inputRef.current?.focus(); return; }
    setPending(true); setFailedTurn(null);
    const at = turnN;
    try { if ((await intent(game.id, "jebena-answer", { turn: at, text: typed })) === false) setFailedTurn(at); }
    finally { setPending(false); inputRef.current?.focus(); }
  };
  const failure = <SendNote shown={failedTurn !== null && failedTurn === turnN} landed={landed} error={error} testId="jr-error" />;
  const last = lastPlayLine(st.log, nameOf, playerId);
  const newCategory = (st.log ?? []).some((x) => x.kind === "category" && x.turn === turnN && turnN > 1);
  const header = (
    <div className="mz-jr-top">
      <div className="mz-jr-cat" data-testid="jr-category" data-category={cat?.id}>
        <span className="mz-kicker">Category{newCategory ? " · new!" : ""}</span>
        <h2 className="mz-jr-cat__name" data-testid="jr-category-name">{cat?.name ?? "…"}</h2>
        {cat?.definition && <p className="mz-foot mz-jr-cat__def">{cat.definition}</p>}
      </div>
      {me && !me.satOut && (
        <CiniCups n={me.hearts} of={startHearts} testId="jr-my-hearts" memoryKey={`${game.id}:${playerId}:hud`} lostAt={lastLossAt(st.log, playerId)} seat={playerId} surface="hud" />
      )}
    </div>
  );
  const stage = (
    <div className="mz-jr-stage" data-testid="jr-stage">
      <JebenaArt urgency={urgency} size={myTurn ? 128 : 112} label={`The jebena, ${holder === playerId ? "with you" : `with ${nameOf(holder)}`}: ${URGENCY_LABEL[urgency]}`} />
      <div className="mz-jr-stage__side">
        <p className="mz-jr-holder" data-testid="jr-holder" data-you={String(holder === playerId)}>{holder === playerId ? "Your turn!" : <>{nameOf(holder)} has the jebena</>}</p>
        <TurnClock seconds={seconds} urgency={urgency} />
      </div>
    </div>
  );

  if (me?.out) {
    return (
      <main className="mz-screen mz-jr" aria-label={`${title}: you're out, watching the rest`} data-testid="jr-out">
        <GameHeader title={title} objective={me.satOut ? "You left this game" : "All your cups are broken: watch the rest"} accent={1} />
        {header}
        {stage}
        {last && <FeedbackLine testId="jr-last">{last}</FeedbackLine>}
        <Named named={st.named ?? []} nameOf={nameOf} meId={playerId} />
        <SeatList order={st.order ?? []} holder={holder} startHearts={startHearts} nameOf={nameOf} meId={playerId} gameId={game.id} log={st.log} />
      </main>
    );
  }

  if (!myTurn) {
    return (
      <main className="mz-screen mz-jr" aria-label={`${title}: ${nameOf(holder)} has the jebena`} data-testid="jr-watch">
        <GameHeader title={title} objective="Name it. Pass it. Beat the steam." accent={1} />
        {header}
        {stage}
        {last && <FeedbackLine testId="jr-last">{last}</FeedbackLine>}
        <Named named={st.named ?? []} nameOf={nameOf} meId={playerId} />
        <SeatList order={st.order ?? []} holder={holder} startHearts={startHearts} nameOf={nameOf} meId={playerId} gameId={game.id} log={st.log} />
      </main>
    );
  }

  const feedback = st.attempt ? verdictLine(st.attempt, cat?.name ?? "this category") : null;
  return (
    <main className="mz-screen mz-jr mz-jr--myturn" aria-label={`${title}: your turn, ${cat?.name ?? ""}`} data-testid="jr-myturn">
      <GameHeader title={title} objective="Your turn: name one, quick!" accent={1} />
      {header}
      {stage}
      <form className="mz-jr-form" onSubmit={(e) => void submit(e)} data-testid="jr-form">
        <label className="mz-sr-only" htmlFor="jr-input">Your answer for {cat?.name ?? "this category"}</label>
        <input
          id="jr-input"
          ref={inputRef}
          className="mz-jr-input"
          data-testid="jr-input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 40))}
          maxLength={40}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="send"
          inputMode="text"
          placeholder={`Name ${cat?.name ? `one: ${cat.name.toLowerCase()}` : "one"}…`}
          aria-describedby="jr-feedback"
          readOnly={pending}
        />
        <Keycap type="submit" disabled={pending || text.trim() === ""} data-testid="jr-send">{pending ? "Sending…" : "Send"}</Keycap>
      </form>
      <div id="jr-feedback">
        {feedback ? <FeedbackLine tone={feedback.tone} testId="jr-feedback">{feedback.text}</FeedbackLine>
          : <FeedbackLine testId="jr-feedback">Type an answer and press Enter. Wrong tries cost nothing but time.</FeedbackLine>}
      </div>
      {failure}
      <Named named={st.named ?? []} nameOf={nameOf} meId={playerId} />
    </main>
  );
}

/** Results: places (the winner kept the jebena), cups, answers, timeouts; points explained. */
export function MchezoJebenaResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? publicGame?.state ?? {}) as JebenaView;
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  return (
    <main className="mz-screen mz-jr" aria-label={`${title} results`} data-testid="jr-results">
      {hero}
      {next}
      <GameHeader title={title} objective={jebenaEndLine(st.end, st.standings, nameOf, playerId)} accent={1} />
      <Standings st={st} nameOf={nameOf} meId={playerId} cups={{ gameId: game.id, surface: "result" }} />
      <p className="mz-foot" data-testid="jr-howscore">100 points for each player you outlast, plus 10 for every cup still whole. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
      <OutcomeSummary gameId="jebena-rush" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/**
 * Stage 10.1 repair (S101-R1, D-S101-08): every row draws the player's cups and
 * continues the memory of the screen that showed them live (your own row ← your
 * live row; others ← the seat list; the TV ← its seat list). So the cup that
 * decided the match, lost in the same snapshot that ended it, breaks here once
 * on a screen that watched the match; a reload or a later visit shows it still.
 */
interface StandingsCups { gameId: string; surface: "result" | "tv" }
function rowCupsKey(c: StandingsCups, id: string, meId?: string): string {
  if (c.surface === "tv") return `${c.gameId}:${id}:tv`;
  return id === meId ? `${c.gameId}:${id}:hud` : `${c.gameId}:${id}:seat`;
}

function Standings({ st, nameOf, meId, tv, cups }: { st: JebenaView; nameOf: (id?: string) => string; meId?: string; tv?: boolean; cups?: StandingsCups }) {
  const startHearts = st.startHearts ?? 5;
  return (
    <ol className={`mz-jr-standings${tv ? " mz-jr-standings--tv" : ""}`} data-testid="jr-standings">
      {(st.standings ?? []).map((r) => (
        <li key={r.id} className={`mz-jr-row${r.id === meId ? " mz-jr-row--you" : ""}`} data-testid={`jr-row-${r.id}`} data-place={r.place}>
          <span className="mz-jr-row__place">{r.place}</span>
          <span className="mz-jr-row__who">
            <b>{r.id === meId ? `${nameOf(r.id)} (you)` : nameOf(r.id)}</b>
            <span className="mz-jr-row__line">
              {keptTheJebena(st.end, st.standings, r.id) ? "Kept the jebena · " : ""}
              {r.satOut ? "Left the game · " : (
                <>
                  <span className="mz-jr-row__cups">
                    <CiniCups n={r.hearts} of={startHearts} compact decorative memoryKey={cups ? rowCupsKey(cups, r.id, meId) : undefined} lostAt={lastLossAt(st.log, r.id)} seat={r.id} surface={cups ? `${cups.surface}-row` : undefined} />
                  </span>
                  {r.out ? "Out: every cup broken · " : `${r.hearts} of ${startHearts} cups whole · `}
                </>
              )}
              {r.answers} {r.answers === 1 ? "answer" : "answers"} · {r.timeouts} {r.timeouts === 1 ? "timeout" : "timeouts"}
            </span>
          </span>
          <b className="mz-jr-row__pts">{r.points}</b>
        </li>
      ))}
    </ol>
  );
}

/** TV: the jebena, the category, who has it and the countdown, everyone's cups, the last play. Public facts only. */
export function JebenaTv({ game, title, nameOf }: { game: PublicGame; title: string; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as JebenaView;
  const { seconds, urgency } = useTurnClock(game, st);
  const name = (id?: string) => (id ? nameOf(id) : "Someone");
  const last = lastPlayLine(st.log, name);
  return (
    <section className="mz-jr-tv" data-testid="tv-live-jebena-rush">
      <span className="mz-tv-kicker">{title} · {st.startHearts ?? 5} cups each · category {st.category?.round ?? 1}</span>
      <div className="mz-jr-tv__main">
        <JebenaArt urgency={urgency} size={220} testId="tv-jr-art" label={`The jebena, with ${name(st.turn?.player)}: ${URGENCY_LABEL[urgency]}`} />
        <div className="mz-jr-tv__info">
          <h1 className="mz-tvshow-h1" data-testid="tv-jr-category">{st.category?.name}</h1>
          <p className="mz-tvshow-line" data-testid="tv-jr-holder">{st.turn ? <>{name(st.turn.player)} has the jebena</> : "Finished"}</p>
          <TurnClock seconds={seconds} urgency={urgency} testId="tv-jr-clock" />
          {last && <p className="mz-tvshow-line mz-tvshow-line--muted" data-testid="tv-jr-last">{last}</p>}
        </div>
      </div>
      <SeatList order={st.order ?? []} holder={st.turn?.player} startHearts={st.startHearts ?? 5} nameOf={name} testId="tv-jr-seats" gameId={game.id} log={st.log} surface="tv" />
    </section>
  );
}

/** TV after the game: the places and what was named in the last category. */
export function JebenaReview({ game, nameOf }: { game: PublicGame; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as JebenaView;
  const name = (id?: string) => (id ? nameOf(id) : "Someone");
  return (
    <div data-testid="tv-jr-review">
      <p className="mz-tvshow-line">{jebenaEndLine(st.end, st.standings, name)}</p>
      <Standings st={st} nameOf={name} tv cups={{ gameId: game.id, surface: "tv" }} />
    </div>
  );
}

/**
 * TV, the match over (Stage 10.1 repair, S101-R1): who won, the last play and
 * everyone's cups. It continues the live seat list's memory, so the cup that
 * decided the match breaks here once; the post-game review shows it still.
 */
export function JebenaTvFinal({ game, title, nameOf }: { game: PublicGame; title: string; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as JebenaView;
  const name = (id?: string) => (id ? nameOf(id) : "Someone");
  const last = lastPlayLine(st.log, name);
  return (
    <section className="mz-jr-tv mz-jr-tv--final" data-testid="tv-jr-final">
      <span className="mz-tv-kicker">{title} · {st.startHearts ?? 5} cups each · final</span>
      <h1 className="mz-tvshow-h1" data-testid="tv-jr-final-winner">{resultLine(game, nameOf)}</h1>
      <p className="mz-tvshow-line" data-testid="tv-jr-final-line">{jebenaEndLine(st.end, st.standings, name)}</p>
      {last && <p className="mz-tvshow-line mz-tvshow-line--muted" data-testid="tv-jr-final-last">{last}</p>}
      <Standings st={st} nameOf={name} tv cups={{ gameId: game.id, surface: "tv" }} />
    </section>
  );
}

/** Participation for results lists (re-exported for the room's summaries). */
export function jebenaParticipation(game: PlayerGame, id: string, you: boolean): string | null {
  return participationLine("jebena-rush", game.outcome?.participation[id], { you });
}
