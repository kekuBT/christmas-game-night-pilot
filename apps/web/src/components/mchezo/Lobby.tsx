/**
 * Stage 2, Lobby A "stage and dock" (approved: docs/ux-redesign/PROPOSAL.md §4,
 * mockups/lobby-a.png). On one screen: the room code with Invite, the Cup day,
 * the room menu, who is here (the Circle, with a check on everyone the server
 * says will play), the up-next game with its cover, the host's Official /
 * Practice choice, and Start in a dock that stays above the browser's toolbar.
 * Everything rarely used moves into three sheets: Invite, Choose game, and the
 * room menu.
 *
 * Presentation only. Every fact comes from the server's projection or the game
 * catalog; Start still goes through App's startGame (readiness, D1, D3).
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  CircleLobby, GameCover, ICON, Icon, Keycap, ReactionBar, Sheet, accentColor, fits, playersLabel, sessionEstimate, timeLimitLabel, useArrivals,
  type CatalogGame, type ChampionshipConfig, type Player, type ReactionEvent, type ReactionId,
} from "../../ui/mchezo/index.js";

export interface RoomLobbyProps {
  code: string;
  championship?: ChampionshipConfig;
  sessionLabel: string;
  players: readonly Player[];
  youId: string;
  isHost: boolean;
  /** The host's name, for the guests' waiting line. */
  hostName?: string;
  upNext?: CatalogGame;
  /** Host: open the Choose game sheet. */
  onChangeGame?: () => void;
  /** Open the details of the up-next game. */
  onGameDetails?: () => void;
  shuffleNote?: string | null;
  /** Ids the server says would play the next game (readiness.wouldPlay). */
  willPlay?: readonly string[];
  minPlayers: number;
  capacity?: number;
  reactions: readonly ReactionEvent[];
  onReact: (r: ReactionId) => void;
  onNudge: (playerId: string) => void;
  nudgedBy?: readonly string[];
  onInvite: () => void;
  onMenu: () => void;
  /** Recovery requests and other things the host must answer now. */
  top?: ReactNode;
  notice?: ReactNode;
  /** Host: the mode choice and readiness, right above the dock. */
  setup?: ReactNode;
  onStart?: () => void;
  startTestId?: string;
  error?: string;
}

export function RoomLobby(p: RoomLobbyProps) {
  const you = p.players.find((x) => x.id === p.youId);
  const connected = p.players.filter((x) => x.connection !== "disconnected").length;
  const reconnecting = p.players.filter((x) => x.connection === "disconnected" && x.presence === "reconnecting").length;
  const away = p.players.length - connected - reconnecting;
  const canStart = connected >= p.minPlayers;
  const arrival = useArrivals(p.players);
  const willPlay = useMemo(() => new Set(p.willPlay ?? []), [p.willPlay]);
  const short = Math.max(0, p.minPlayers - connected);
  const headline = short > 0
    ? `Waiting for ${short} more`
    : reconnecting > 0 ? `${reconnecting} reconnecting`
    : away > 0 ? "Ready when you are"
    : "Everyone’s here";
  const limit = timeLimitLabel(p.upNext?.timeLimitMs);
  return (
    <main className="mz-screen mz-screen--docked mz-lobby" aria-label="Lobby">
      <header className="mz-topbar mz-lobby__bar">
        <button type="button" className="mz-codebtn" aria-label={`Share room code ${p.code}`} aria-haspopup="dialog" data-testid="share-room" onClick={p.onInvite}>
          <span className="mz-codebtn__code">{p.code}</span>
          <span className="mz-codebtn__invite"><Icon d={ICON.share} size={15} stroke={2.4} />Invite</span>
        </button>
        <span className="mz-lobby__barend">
          {p.championship
            ? <span className="mz-cupchip" title={`${p.championship.name} · ${p.championship.unitLabel} ${p.championship.current} of ${p.championship.total}`} aria-label={`${p.championship.name}, ${p.championship.unitLabel} ${p.championship.current} of ${p.championship.total}`}><Icon d={ICON.trophy} size={16} stroke={2} />{p.championship.unitLabel} {p.championship.current}/{p.championship.total}</span>
            : <span className="mz-muted mz-small">{p.sessionLabel}</span>}
          <button type="button" className="mz-iconbtn" aria-label="Room menu" aria-haspopup="dialog" data-testid="room-menu" onClick={p.onMenu}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
          </button>
        </span>
      </header>
      <h1 className="mz-h1">You’re in, {you?.name ?? "friend"}.</h1>
      {p.notice}
      <p className="mz-lobby__status" role="status" aria-live="polite" data-testid="lobby-status">
        <b className="mz-lobby__headline">{headline}</b>
        <span className="mz-lobby__counts">
          {arrival ? <span className="mz-sub__new">{arrival} joined · </span> : null}
          <span className="mz-lobby__here">{connected} here</span>{reconnecting ? ` · ${reconnecting} reconnecting` : ""}{away ? ` · ${away} away` : ""}{p.players.length >= (p.capacity ?? 10) ? " · room is full" : ""}
        </span>
      </p>
      {p.top}
      <div className="mz-circle-wrap mz-lobby__circle">
        <CircleLobby
          players={p.players}
          youId={p.youId}
          capacity={p.capacity}
          reactions={p.reactions}
          onNudge={p.onNudge}
          nudgedBy={p.nudgedBy}
          badgeFor={(pl) => (pl.connection === "disconnected" ? "offline" : willPlay.has(pl.id) ? "check" : null)}
          center={
            <div className="mz-circle__count">
              <span className="mz-circle__num">{connected}</span>
              <span className="mz-circle__label">{connected === 1 ? "in the room" : "in the room"}</span>
            </div>
          }
        />
      </div>
      <ReactionBar onReact={p.onReact} />
      {p.upNext && (
        <section className="mz-upnext-card" aria-label="Up next" data-testid="up-next-card" style={{ ["--mz-accent" as string]: accentColor(p.upNext.id) }}>
          <button type="button" className="mz-upnext-card__main" onClick={p.onGameDetails} aria-label={`Up next: ${p.upNext.title}. Show details`}>
            <GameCover gameId={p.upNext.id} decorative className="mz-upnext-card__cover" />
            <span className="mz-upnext-card__text">
              <span className="mz-kicker mz-upnext-card__kicker">Up next</span>
              <span className="mz-upnext__name">{p.upNext.title}</span>
              <span className="mz-upnext-card__meta">{playersLabel(p.upNext)} · {sessionEstimate(p.upNext.estimateMinutes)}{limit ? ` · ${limit}` : ""}</span>
              {!p.upNext.officialEligible && <span className="mz-badge mz-badge--mint">Practice only</span>}
            </span>
          </button>
          {p.isHost && p.onChangeGame && <button type="button" className="mz-chip-btn mz-upnext-card__change" data-testid="choose-game" aria-haspopup="dialog" onClick={p.onChangeGame}>Change</button>}
        </section>
      )}
      {p.shuffleNote && <p className="mz-foot mz-lobby__shuffle" data-testid="shuffle-result">{p.shuffleNote}</p>}
      {p.isHost && p.setup}
      <div className="mz-dock mz-dock--sticky" data-testid="lobby-dock">
        {p.error ? <p className="err mz-dock__error" data-testid="mz-error" role="alert">{p.error}</p> : null}
        {p.isHost ? (
          <>
            <Keycap block disabled={!canStart || !p.onStart} onClick={p.onStart} data-testid={p.startTestId}>{canStart ? `Start ${p.upNext?.title ?? "the game"}` : `Waiting for players (${connected}/${p.minPlayers})`}</Keycap>
            <p className="mz-dock__note">{canStart ? "Tap someone to nudge them. You’re hosting." : `${p.upNext?.title ?? "This game"} needs at least ${p.minPlayers} connected player${p.minPlayers === 1 ? "" : "s"}. Invite more, or choose another game.`}</p>
          </>
        ) : (
          <p className="mz-dock__note mz-dock__note--waiting">Waiting for {p.hostName ?? "the host"} to start · tap someone to nudge them</p>
        )}
      </div>
    </main>
  );
}

/** The host's game picker (a sheet over the lobby). Picking never starts a game. */
export function ChooseGameSheet({ catalog, upNextId, playerCount, onPick, onSurprise, onSmart, onClose }: {
  catalog: readonly CatalogGame[];
  upNextId?: string;
  /** Connected players, to sort games that fit first. */
  playerCount: number;
  onPick: (id: string) => void;
  onSurprise: () => void;
  onSmart: () => void;
  onClose: () => void;
}) {
  const categories = useMemo(() => [...new Set(catalog.flatMap((g) => g.categories))].sort((a, b) => a.localeCompare(b)), [catalog]);
  const [cat, setCat] = useState<string | null>(null);
  const shown = catalog.filter((g) => !cat || g.categories.includes(cat));
  const fitting = shown.filter((g) => fits(g, playerCount));
  const other = shown.filter((g) => !fits(g, playerCount));
  const card = (g: CatalogGame) => {
    const on = g.id === upNextId;
    return (
      <button key={g.id} type="button" className={`mz-pick${on ? " mz-pick--on" : ""}`} data-testid={`select-game-${g.id}`} aria-current={on ? "true" : undefined} onClick={() => onPick(g.id)}>
        <span className="mz-pick__art">
          <GameCover gameId={g.id} decorative />
          {on && <span className="mz-pick__badge">✓ Up next</span>}
        </span>
        <span className="mz-pick__title">{g.title}</span>
        <span className="mz-pick__meta">{playersLabel(g)} · {sessionEstimate(g.estimateMinutes)}{g.officialEligible ? "" : <> · <span className="mz-pick__practice">Practice only</span></>}</span>
      </button>
    );
  };
  return (
    <Sheet title="Pick a game" onClose={onClose} testId="choose-sheet" wide kicker={`Fits ${playerCount} player${playerCount === 1 ? "" : "s"} first`}>
      <div className="mz-filterrow" role="group" aria-label="Show">
        <button type="button" className="mz-pill" aria-pressed={cat === null} onClick={() => setCat(null)}>All</button>
        {categories.map((c) => <button key={c} type="button" className="mz-pill mz-pill--cat" aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}>{c}</button>)}
      </div>
      <div className="mz-filterrow">
        <button type="button" className="mz-pill mz-pill--action" data-testid="surprise-me" onClick={onSurprise}>🎲 Surprise me</button>
        <button type="button" className="mz-pill mz-pill--action" data-testid="smart-shuffle" onClick={onSmart}>Smart shuffle</button>
      </div>
      <div className="mz-pickgrid">{fitting.map(card)}</div>
      {other.length > 0 && (
        <>
          <p className="mz-kicker mz-kicker--muted mz-pickdivider">{playerCount < Math.min(...other.map((g) => g.minPlayers)) ? "Needs more players" : "Doesn’t fit this room yet"}</p>
          <div className="mz-pickgrid">{other.map(card)}</div>
        </>
      )}
      <p className="mz-foot">Times are design estimates, not measured. Each game also has a hard time limit and ends by itself.</p>
    </Sheet>
  );
}

function MenuRow({ icon, label, detail, onClick, testId, tone }: { icon?: ReactNode; label: string; detail?: ReactNode; onClick: () => void; testId?: string; tone?: "danger" }) {
  return (
    <button type="button" className={`mz-menurow${tone ? ` mz-menurow--${tone}` : ""}`} data-testid={testId} onClick={onClick}>
      {icon && <span className="mz-menurow__icon" aria-hidden="true">{icon}</span>}
      <span className="mz-menurow__label">{label}</span>
      {detail && <span className="mz-menurow__detail">{detail}</span>}
      <span className="mz-menurow__chev" aria-hidden="true">›</span>
    </button>
  );
}

/** Everything secondary in a room, grouped (PROPOSAL §6.11, mockups/menu.png). */
export function RoomMenuSheet(p: {
  cupLabel: string;
  dayLabel?: string;
  isHost: boolean;
  onTv: () => void;
  onCup: () => void;
  onMemory: () => void;
  onLibrary: () => void;
  onStudio?: () => void;
  onHome: () => void;
  onReconnect: () => void;
  /** Motion setting (SettingsBar). */
  phone: ReactNode;
  /** This device: remember, seat backup (recovery code), sign out. */
  device: ReactNode;
  /** Host tools: players and cohosts. */
  hostTools?: ReactNode;
  message?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Sheet title="Room menu" onClose={p.onClose} testId="room-menu-sheet">
      {p.message}
      <span className="mz-kicker mz-kicker--muted mz-menu__section">This room</span>
      <div className="mz-menu__group">
        <MenuRow icon={<Icon d={ICON.tv} size={20} />} label="Show on a TV" testId="menu-tv" onClick={p.onTv} />
        <MenuRow icon={<Icon d={ICON.trophy} size={20} />} label={p.cupLabel} detail={p.dayLabel} testId="menu-cup" onClick={p.onCup} />
        <MenuRow icon={<span>📖</span>} label="Memory Book" testId="menu-memory" onClick={p.onMemory} />
        <MenuRow icon={<span>🎲</span>} label="All games" testId="browse-games" onClick={p.onLibrary} />
      </div>
      {p.phone}
      {p.device}
      <div className="mz-menu__group">
        <MenuRow label="Reconnect" detail="if the room looks stuck" testId="menu-reconnect" onClick={p.onReconnect} />
        <MenuRow label="Mchezo home" detail="your seat stays" testId="menu-home" onClick={p.onHome} />
      </div>
      {p.isHost && (
        <>
          <span className="mz-kicker mz-kicker--muted mz-menu__section">Host tools</span>
          {p.hostTools}
          {p.onStudio && <div className="mz-menu__group"><MenuRow label="Studio" detail="Labs · preview" testId="studio-button" onClick={p.onStudio} /></div>}
          <p className="mz-foot mz-menu__note">Advancing the Cup day and score corrections are under {p.cupLabel}, and always ask first.</p>
        </>
      )}
    </Sheet>
  );
}
