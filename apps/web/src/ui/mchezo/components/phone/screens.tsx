import { useId, type ReactNode } from 'react';
import type { ReactionId } from '../../tokens/tokens.js';
import type { AnswerOption, GameInfo, Player, RankedEntry, ReactionEvent, SessionInfo } from '../../types.js';
import { AnswerGrid } from '../AnswerGrid.js';
import { CircleLobby } from '../CircleLobby.js';
import { CodeInput } from '../CodeInput.js';
import { BigScreenToggle, ChampionshipProgress, EventBadge, ICON, Icon, Keycap, RingTimer, Stamp, Wordmark } from '../primitives.js';
import { useArrivals } from '../CircleLobby.js';
import { ReactionBar } from '../Reactions.js';
import { AnswerDistribution, ResultCard, StandingsList, WaitingCircle } from '../Results.js';

/** Every phone screen: full height, one primary action at the bottom, no persistent nav. */
export function PhoneScreen({ children, label, tone }: { children: ReactNode; label: string; tone?: 'game' }) {
  return <main className={['mz-screen', tone === 'game' ? 'mz-screen--game' : ''].join(' ')} aria-label={label}>{children}</main>;
}

/* =========================================================== 1. landing */

/** Landing hero: the Circle at full size — a dashed ring with eight seats, the brand seat larger. */
function HeroRing() {
  return (
    <svg className="mz-hero__ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--mz-line)" strokeWidth="0.6" strokeDasharray="1 3.2" />
      {Array.from({ length: 8 }, (_, k) => {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 8;
        return <circle key={k} cx={50 + Math.cos(a) * 44} cy={50 + Math.sin(a) * 44} r={k === 0 ? 6.4 : 4.4} fill={k === 0 ? 'var(--mz-brand)' : `var(--mz-answer-${k % 4})`} />;
      })}
    </svg>
  );
}

export interface LandingScreenProps {
  code: string;
  onCodeChange: (c: string) => void;
  name: string;
  onNameChange: (n: string) => void;
  onJoin: () => void;
  onHost?: () => void;
  /** Seat-free TV viewing: needs only the room code, never a player seat. */
  onSpectate?: () => void;
  /** Integration adaptation: our room codes are 6 alphanumeric characters,
      not the handoff demo's 4 letters. Defaults preserve our room system. */
  codeLength?: number;
  codePattern?: RegExp;
  /** Present only during a seasonal event — no event branding by default. */
  session?: Pick<SessionInfo, 'championship' | 'eventName'>;
  extra?: ReactNode;
  /** Sprint 2: "Welcome back" for a seat remembered on this device, shown before the join form. */
  top?: ReactNode;
  /** Sprint 2: shown under the Join button (e.g. "Remember this device"). */
  formExtra?: ReactNode;
}

export function LandingScreen({ code, onCodeChange, name, onNameChange, onJoin, onHost, onSpectate, codeLength = 6, codePattern = /[^A-Z0-9]/g, session, extra, top, formExtra }: LandingScreenProps) {
  const nameId = useId();
  const ok = code.length === codeLength && name.trim().length > 0;
  const canSpectate = code.length === codeLength;
  return (
    <PhoneScreen label="Join a game">
      <header className="mz-topbar">
        <Wordmark size={20} />
        {onHost && <button type="button" className="mz-chip-btn" onClick={onHost}>Host a game</button>}
      </header>
      {top}
      {session?.championship && (
        <div className="mz-event-card">
          <Icon d={ICON.trophy} size={30} stroke={1.8} />
          <div>
            <span className="mz-kicker mz-kicker--highlight">{session.championship.name} · {session.championship.unitLabel} {session.championship.current} of {session.championship.total}</span>
            {session.eventName && <span className="mz-event-card__name">{session.eventName}</span>}
          </div>
        </div>
      )}
      <div className={['mz-hero', session?.championship ? 'mz-hero--compact' : ''].join(' ')} aria-hidden="true">
        <HeroRing />
        <span className="mz-hero__title">Play<br />together.</span>
      </div>
      <p className="mz-lede">{session?.championship ? 'Join tonight’s game with the code on the host’s screen.' : 'Party games for the people in the room. Your phone is your controller.'}</p>
      <div className="mz-grow" />
      <form className="mz-form" onSubmit={(e) => { e.preventDefault(); if (ok) onJoin(); }}>
        <CodeInput value={code} onChange={onCodeChange} length={codeLength} pattern={codePattern} />
        <div className="mz-field">
          <label htmlFor={nameId} className="mz-field__label">Your name</label>
          <input id={nameId} className="mz-input" value={name} maxLength={24} autoComplete="nickname" placeholder="e.g. Auntie June" onChange={(e) => onNameChange(e.target.value)} />
        </div>
        <Keycap type="submit" block disabled={!ok}>Join the game</Keycap>
        {formExtra}
      </form>
      {onSpectate && (
        <button type="button" className="mz-chip-btn" data-testid="watch-spectator" disabled={!canSpectate} onClick={onSpectate} style={{ alignSelf: "center", marginTop: 4 }}>
          Watch as spectator — no seat needed
        </button>
      )}
      {extra}
    </PhoneScreen>
  );
}

/* =========================================================== 2. lobby */

export interface LobbyScreenProps {
  session: SessionInfo;
  players: readonly Player[];
  youId: string;
  isHost: boolean;
  nextGame: GameInfo;
  tvConnected: boolean;
  onTvChange?: (on: boolean) => void;
  reactions: readonly ReactionEvent[];
  onReact: (r: ReactionId) => void;
  onNudge: (playerId: string) => void;
  nudgedBy?: readonly string[];
  onStart?: () => void;
  /** Integration: stable hook for the primary Start action, so its test
      id follows the up-next game and the chosen official/practice mode. */
  startTestId?: string;
  minPlayers?: number;
  capacity?: number;
  /** Opens the invite sheet (QR, native Share, Copy link). */
  onShare?: () => void;
  /** Integration slot: host game picker, QR invite, cohost controls, and
      navigation live here — our lobby has more than the handoff's single
      up-next game, and those controls must stay reachable. */
  extra?: ReactNode;
  /** Sprint 2: host readiness ("who's playing, what Start will do") rendered
      directly above the Start button, so the answer is next to the action. */
  beforeStart?: ReactNode;
  /** Work Package F: a server rejection mapped to a human sentence
      (App passes the already-mapped `err`). Rendered at the top of the
      lobby — it used to sit at the very bottom of `extra`, below the
      fold on a phone, so a start error was effectively swallowed. */
  error?: string;
  /** A message for everyone in the room, shown under the title (e.g. a game cancelled before it started). */
  notice?: ReactNode;
}

export function LobbyScreen(p: LobbyScreenProps) {
  const you = p.players.find((x) => x.id === p.youId);
  const connected = p.players.filter((x) => x.connection !== 'disconnected').length;
  const reconnecting = p.players.filter((x) => x.connection === 'disconnected' && x.presence === 'reconnecting').length;
  const away = p.players.length - connected - reconnecting;
  const min = p.minPlayers ?? 3;
  const canStart = connected >= min;
  const arrival = useArrivals(p.players);
  return (
    <PhoneScreen label="Lobby">
      <header className="mz-topbar">
        <button type="button" className="mz-chip-btn mz-chip-btn--code" aria-label={`Share room code ${p.session.roomCode}`} aria-haspopup="dialog" data-testid="share-room" onClick={p.onShare} disabled={!p.onShare}>
          {p.session.roomCode}<Icon d={ICON.share} size={16} />
        </button>
        {p.session.championship ? <EventBadge championship={p.session.championship} compact /> : <span className="mz-muted mz-small">{p.session.sessionLabel}</span>}
      </header>
      <h1 className="mz-h1">You’re in, {you?.name ?? 'friend'}.</h1>
      {p.error ? <p className="err" data-testid="mz-error" role="alert">{p.error}</p> : null}
      {p.notice}
      <p className="mz-sub" role="status" aria-live="polite">
        {arrival ? <span className="mz-sub__new">{arrival} joined</span> : null}
        {arrival ? ' · ' : ''}{connected} here{reconnecting ? ` · ${reconnecting} reconnecting` : ''}{away ? ` · ${away} away` : ''}{arrival ? '' : p.players.length < (p.capacity ?? 10) ? ' · room for more' : ' · room is full'}
      </p>
      {p.session.championship && <ChampionshipProgress championship={p.session.championship} />}
      <div className="mz-circle-wrap">
      <CircleLobby
        players={p.players}
        youId={p.youId}
        capacity={p.capacity}
        reactions={p.reactions}
        onNudge={p.onNudge}
        nudgedBy={p.nudgedBy}
        center={
          <div className="mz-upnext">
            <span className="mz-kicker mz-kicker--muted">Up next</span>
            <span className="mz-upnext__name" style={{ color: `var(--mz-answer-${p.nextGame.accentIndex ?? 3})` }}>{p.nextGame.name}</span>
            <span className="mz-upnext__kind">{p.nextGame.kind}</span>
          </div>
        }
      />
      </div>
      <ReactionBar onReact={p.onReact} />
      <div className="mz-gap" />
      {p.extra}
      {p.isHost && p.onTvChange && <BigScreenToggle on={p.tvConnected} onChange={p.onTvChange} />}
      {p.isHost && p.beforeStart}
      {p.isHost ? (
        <>
          <Keycap block disabled={!canStart} onClick={p.onStart} data-testid={p.startTestId}>{canStart ? `Start ${p.nextGame.name}` : `Waiting for players (${connected}/${min})`}</Keycap>
          <p className="mz-foot">Tap someone to nudge them. You’re hosting.</p>
        </>
      ) : (
        <p className="mz-foot mz-foot--waiting">Waiting for the host to start · tap someone to nudge them</p>
      )}
    </PhoneScreen>
  );
}

/* =========================================================== game intro */

export function GameIntroScreen({ game, kicker, line, count }: { game: GameInfo; kicker: string; line: string; count: number }) {
  return (
    <PhoneScreen label={`${game.name} is starting`} tone="game">
      <div className="mz-intro" style={{ background: `var(--mz-answer-${game.accentIndex ?? 3})` }}>
        <span className="mz-kicker">{kicker}</span>
        <div className="mz-grow" />
        <Icon d={ICON.bulb} size={72} stroke={1.6} />
        <h1 className="mz-intro__title">{game.name}</h1>
        <p className="mz-intro__line">{line}</p>
        <div className="mz-grow" />
        <div className="mz-intro__count" role="status" aria-live="assertive">
          <span className="mz-intro__num">{count}</span>
          <span>Get your thumbs ready</span>
        </div>
      </div>
    </PhoneScreen>
  );
}

/* =========================================================== 3. question */

export interface QuestionScreenProps {
  game: GameInfo;
  category?: string;
  questionNumber: number;
  questionCount: number;
  question: string;
  options: readonly AnswerOption[];
  selectedId: string | null;
  locked: boolean;
  onSelect: (id: string) => void;
  secondsLeft: number;
  totalSeconds: number;
  /** Integration slot: per-game actions our server supports (e.g. abstain). */
  extra?: ReactNode;
}

export function QuestionScreen(p: QuestionScreenProps) {
  return (
    <PhoneScreen label={`Question ${p.questionNumber} of ${p.questionCount}`}>
      <header className="mz-qhead">
        <RingTimer seconds={p.secondsLeft} total={p.totalSeconds} />
        <div className="mz-qhead__text">
          <span className="mz-kicker" style={{ color: `var(--mz-answer-${p.game.accentIndex ?? 3})` }}>{p.game.name}{p.category ? ` · ${p.category}` : ''}</span>
          <span className="mz-muted">Question {p.questionNumber} of {p.questionCount}</span>
        </div>
      </header>
      <h1 className="mz-question">{p.question}</h1>
      <div className="mz-grow mz-grow--min" />
      <AnswerGrid options={p.options} selectedId={p.selectedId} locked={p.locked} onSelect={p.onSelect} disabled={p.secondsLeft <= 0} />
      <p className="mz-foot" role="status">{p.selectedId ? 'Locked in.' : p.secondsLeft <= 0 ? 'Time’s up.' : 'One tap locks your answer.'}</p>
      {p.extra}
    </PhoneScreen>
  );
}

/* =========================================================== locked / waiting */

export interface LockedScreenProps {
  questionNumber: number;
  questionCount: number;
  answer: { label: string; index: number } | null;
  players: readonly Player[];
  answeredIds: ReadonlySet<string>;
  youId: string;
  tvConnected: boolean;
  onReact: (r: ReactionId) => void;
}

export function LockedScreen(p: LockedScreenProps) {
  return (
    <PhoneScreen label="Waiting for everyone">
      <section className="mz-lockcard" style={{ background: p.answer ? `var(--mz-answer-${p.answer.index % 4})` : 'var(--mz-surface-2)', color: p.answer ? 'var(--mz-on-accent)' : 'var(--mz-text)' }}>
        <span className="mz-kicker">Question {p.questionNumber} of {p.questionCount} · your answer</span>
        <span className="mz-lockcard__answer">{p.answer ? p.answer.label : 'No answer'}</span>
        <Stamp className="mz-lockcard__stamp">{p.answer ? 'LOCKED IN' : 'TIME’S UP'}</Stamp>
      </section>
      <WaitingCircle players={p.players} answeredIds={p.answeredIds} youId={p.youId} />
      <div className="mz-grow" />
      <p className="mz-foot">{p.tvConnected ? 'Look up — the reveal plays on the TV.' : 'The reveal plays right here in a moment.'}</p>
      <ReactionBar onReact={p.onReact} />
    </PhoneScreen>
  );
}

/* =========================================================== 4. personal reveal */

export interface PhoneRevealScreenProps {
  correct: boolean | null;
  correctLabel: string;
  points?: number;
  pointsShown?: number;
  rank?: number;
  movement?: number;
  tvConnected: boolean;
  options: readonly AnswerOption[];
  counts: Record<string, number>;
  correctId: string;
  ranked: readonly RankedEntry[];
  players: readonly Player[];
  youId: string;
  fact?: string;
  nextLabel: string;
  onNext?: () => void;
  /** Integration slot: question picker — our results cover a whole game,
      so the player chooses which question's distribution to inspect. */
  extra?: ReactNode;
}

export function PhoneRevealScreen(p: PhoneRevealScreenProps) {
  const total = Object.values(p.counts).reduce((a, b) => a + b, 0);
  return (
    <PhoneScreen label="Result">
      <ResultCard correct={p.correct} correctLabel={p.correctLabel} points={p.points} pointsShown={p.pointsShown} rank={p.rank} movement={p.movement} />
      {!p.tvConnected && <AnswerDistribution options={p.options} counts={p.counts} correctId={p.correctId} total={total} />}
      <StandingsList ranked={p.ranked} youId={p.youId} players={p.players} limit={p.tvConnected ? 3 : 2} />
      {p.extra}
      {p.tvConnected && p.fact && <p className="mz-fact"><strong>Good to know:</strong> {p.fact}</p>}
      <div className="mz-grow" />
      {p.onNext ? <Keycap block variant="neutral" onClick={p.onNext}>{p.nextLabel}</Keycap> : <p className="mz-foot mz-foot--waiting">Waiting for the host…</p>}
    </PhoneScreen>
  );
}
