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
import { ContentSeasonChoice } from "./ContentChoice.js";
import { SEASON_LABEL, type SessionSeason } from "../../../../../src/shared/season.js";

export interface RoomLobbyProps {
  code: string;
  /** S3-LOB-01/02: whether the next game counts, as every screen should see it.
   *  Stage 6.1: "casual" is a casual room (no Cup at all, nothing to choose). */
  mode?: "official" | "practice" | "casual";
  /** The Cup's name, for "Counts toward the Family Cup". */
  cupLabel?: string;
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
  /** Stage 7.1: what Start says when it starts the Quick Party lineup's game. */
  startLabel?: string;
  /** Stage 7.2: Start waits, and says why (the room is on a break). */
  startBlocked?: string;
  /** Stage 7.2: what guests are told instead of "waiting for the host to start" (a break). */
  guestNote?: ReactNode;
  /** Stage 7.1: the Quick Party card (casual rooms). */
  party?: ReactNode;
  error?: string;
  /** A short confirmation ("Reconnected to your player slot."). */
  message?: string;
  /** S5-B: the room's last finished game, for everyone, from recorded scores only. */
  lastGame?: { title: string; mode: "official" | "practice"; headline: string; yourLine?: string };
  /** Stage 6.1: a casual room (no Cup): its games are labelled Casual, whatever is up next. */
  casual?: boolean;
  /** S5-B: no game has finished in this room yet: say once how the night works. */
  firstTime?: boolean;
  /**
   * Stage 8.2 (§3.7): a casual room's content, shown to everyone before
   * Start (the up-next card and the dock); the host or a cohost changes it
   * here (`onChange`). It applies from the next game started.
   */
  content?: { season: SessionSeason; onChange?: (season: SessionSeason) => void; busy?: boolean };
  /** Stage 9.1 (§8): the up-next game's settings (Jebena Rush's hearts): the host's choice, or everyone else's label. */
  gameSettings?: ReactNode;
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
  // S5-B: does the host's pick fit the people connected now? (Everyone sees it.)
  const fit = !p.upNext ? null
    : connected < p.upNext.minPlayers ? { tone: "warn", text: `Needs ${p.upNext.minPlayers - connected} more ${p.upNext.minPlayers - connected === 1 ? "player" : "players"} · ${connected} here` }
    : connected > p.upNext.maxPlayers ? { tone: "warn", text: `Up to ${p.upNext.maxPlayers} players · ${connected} here` }
    : { tone: "ok", text: `Fits the ${connected} here` };
  return (
    <main className="mz-screen mz-screen--docked mz-lobby" aria-label="Lobby">
      {/* The lobby scrolls ABOVE its Start dock, never under it (S3-HOME-01 applied to the lobby). */}
      <div className="mz-lobby__scroll" data-testid="lobby-scroll">
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
      {/* S3-LOB-03: no seat in the data means the room isn't loaded yet, not an empty room. */}
      <h1 className="mz-h1">{you ? `You’re in, ${you.name}.` : "Finding your seat…"}</h1>
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
      {p.party}
      {p.upNext && (
        <section className="mz-upnext-card" aria-label="Up next" data-testid="up-next-card" style={{ ["--mz-accent" as string]: accentColor(p.upNext.id) }}>
          <button type="button" className="mz-upnext-card__main" onClick={p.onGameDetails} aria-label={`Up next: ${p.upNext.title}. Show details`}>
            <GameCover gameId={p.upNext.id} decorative className="mz-upnext-card__cover" />
            <span className="mz-upnext-card__text">
              <span className="mz-kicker mz-upnext-card__kicker">Up next</span>
              <span className="mz-upnext__name">{p.upNext.title}</span>
              <span className="mz-upnext-card__meta">{playersLabel(p.upNext)} · {sessionEstimate(p.upNext.estimateMinutes)}{limit ? ` · ${limit}` : ""}</span>
              {p.mode && (
                <span className={`mz-badge mz-modebadge mz-modebadge--${p.mode}`} data-testid="up-next-mode">
                  {p.mode === "official" ? `Official · counts toward the ${p.cupLabel ?? "Cup"}` : p.mode === "casual" ? "Casual · just for fun" : !p.upNext.officialEligible ? "Practice only · no Cup points" : "Practice · no Cup points"}
                </span>
              )}
              {!p.mode && !p.upNext.officialEligible && <span className="mz-badge mz-badge--mint">Practice only</span>}
              {p.content && <span className="mz-badge mz-contentbadge" data-season={p.content.season} data-testid="up-next-content">{p.content.season === "christmas" ? "🎄 " : ""}{SEASON_LABEL[p.content.season]} content</span>}
              {fit && <span className={`mz-upnext-card__fit mz-upnext-card__fit--${fit.tone}`} data-testid="up-next-fit">{fit.text}</span>}
            </span>
          </button>
          {p.isHost && p.onChangeGame && <button type="button" className="mz-chip-btn mz-upnext-card__change" data-testid="choose-game" aria-haspopup="dialog" onClick={p.onChangeGame}>Change</button>}
        </section>
      )}
      {p.content && p.isHost && p.content.onChange && (
        <ContentSeasonChoice value={p.content.season} onChange={p.content.onChange} busy={p.content.busy} testIdPrefix="lobby"
          note="What the next game deals. Each phone still picks its own look in Settings." />
      )}
      {p.gameSettings}
      {p.shuffleNote && <p className="mz-foot mz-lobby__shuffle" data-testid="shuffle-result">{p.shuffleNote}</p>}
      {p.lastGame && (
        <section className="mz-lastgame" aria-label="Last game" data-testid="last-game-card">
          <span className="mz-kicker">Last game · {p.lastGame.title} · {p.lastGame.mode === "official" ? "Official" : p.casual ? "Casual" : "Practice"}</span>
          <p className="mz-lastgame__headline">{p.lastGame.headline}</p>
          {p.lastGame.yourLine && <p className="mz-lastgame__you" data-testid="last-game-you">{p.lastGame.yourLine}</p>}
        </section>
      )}
      {p.firstTime && !p.isHost && (
        <p className="mz-foot mz-lobby__howto" data-testid="first-time-help">How tonight works: {p.hostName ?? "the host"} picks a game. The rules come to your phone, you tap I’m ready, and everyone starts together.</p>
      )}
      {p.isHost && p.setup}
      </div>
      <div className="mz-dock mz-dock--sticky" data-testid="lobby-dock">
        {p.error ? <p className="err mz-dock__error" data-testid="mz-error" role="alert">{p.error}</p> : null}
        {p.message && !p.error ? <p className="ok mz-dock__ok" role="status">{p.message}</p> : null}
        {p.isHost ? (
          <>
            <Keycap block disabled={!canStart || !p.onStart || !!p.startBlocked} onClick={p.onStart} data-testid={p.startTestId}>{p.startBlocked ? p.startBlocked : canStart ? (p.startLabel ?? `Start ${p.upNext?.title ?? "the game"}${p.mode && p.mode !== "casual" ? ` · ${p.mode === "official" ? "Official" : "Practice"}` : ""}`) : `Waiting for players (${connected}/${p.minPlayers})`}</Keycap>
            {p.mode === "casual" && <p className="mz-dock__note mz-dock__mode" data-testid="dock-mode">Casual game: just for fun, no Cup.{p.content ? ` Next game: ${SEASON_LABEL[p.content.season]} content.` : ""}</p>}
            {p.mode && p.mode !== "casual" && (
              // S3-HOME-02: the mode choice can be below the fold; the dock says what Start will do and links to it.
              <p className="mz-dock__note mz-dock__mode" data-testid="dock-mode">
                {p.mode === "official" ? `Official: counts toward the ${p.cupLabel ?? "Cup"}.` : "Practice: just for fun, no Cup points."}{" "}
                <button type="button" className="mz-chip-btn mz-dock__change" data-testid="dock-mode-change" onClick={() => { const el = document.querySelector<HTMLElement>('[data-testid="mode-choice"]'); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true }); }}>Change</button>
              </p>
            )}
            <p className="mz-dock__note">{canStart ? "Tap someone to nudge them. You’re hosting." : `${p.upNext?.title ?? "This game"} needs at least ${p.minPlayers} connected player${p.minPlayers === 1 ? "" : "s"}. Invite more, or choose another game.`}</p>
          </>
        ) : (
          <p className="mz-dock__note mz-dock__note--waiting" data-testid="dock-guest-note">
            {p.guestNote ? p.guestNote : p.upNext && fit?.tone === "warn" && connected < p.upNext.minPlayers
              ? <>{p.upNext.title} needs {p.upNext.minPlayers - connected} more {p.upNext.minPlayers - connected === 1 ? "player" : "players"} before {p.hostName ?? "the host"} can start it · share the code {p.code}</>
              : p.upNext
              ? <>Waiting for {p.hostName ?? "the host"} to start {p.upNext.title}{p.mode ? <> · <b>{p.mode === "official" ? `Official, counts toward the ${p.cupLabel ?? "Cup"}` : p.mode === "casual" ? "Casual, just for fun" : "Practice, no Cup points"}</b></> : null}{p.content ? <> · <span data-testid="dock-guest-content">{SEASON_LABEL[p.content.season]} content</span></> : null} · tap someone to nudge them</>
              : <>Waiting for {p.hostName ?? "the host"} to start · they’re choosing a game · tap someone to nudge them</>}
          </p>
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
  /** The Family Cup's name. Stage 6.1: absent in a casual room, which has no Cup. */
  cupLabel?: string;
  dayLabel?: string;
  isHost: boolean;
  onTv: () => void;
  onCup: () => void;
  onMemory: () => void;
  onLibrary: () => void;
  onStudio?: () => void;
  onHome: () => void;
  onReconnect: () => void;
  /** Stage 12.1 (D-S121-02): the host of a casual room can make it a Family Cup (opens the confirmation sheet). */
  onMakeCup?: () => void;
  /** Stage 12.2 (D-S122-01): the host of an upgraded Cup with no official game finished can go back to a casual game night. */
  onUndoCup?: () => void;
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
        {p.cupLabel && <MenuRow icon={<Icon d={ICON.trophy} size={20} />} label={p.cupLabel} detail={p.dayLabel} testId="menu-cup" onClick={p.onCup} />}
        {p.onMakeCup && <MenuRow icon={<Icon d={ICON.trophy} size={20} />} label="Make it a Family Cup" detail="official games · 7 days · standings" testId="menu-make-cup" onClick={p.onMakeCup} />}
        {p.onUndoCup && <MenuRow icon={<span>↩︎</span>} label="Back to a casual game night" detail="until the first official game finishes" testId="menu-undo-cup" onClick={p.onUndoCup} />}
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
          {p.cupLabel && <p className="mz-foot mz-menu__note">Advancing the Cup day and score corrections are under {p.cupLabel}, and always ask first.</p>}
        </>
      )}
    </Sheet>
  );
}

/**
 * Stage 12.1 (docs/stage12/stage121.md §2.2; D-S121-02): "Make it a Family Cup". The host's one-way upgrade of a casual
 * room, said plainly before it happens: what changes, what stays, what a Cup doesn't have, and that it can't be undone.
 * The server decides (host only, not mid-game); a refusal is shown here and nothing changes.
 */
export function MakeCupSheet({ played, busy, error, onConfirm, onClose }: {
  /** Games already finished in this room (they stay casual). */
  played: number;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Make it a Family Cup" onClose={onClose} testId="make-cup-sheet" kicker="Same room, same code">
      <p className="mz-details__pitch">Turn this game night into a Family Cup: official games count toward standings over 7 days, with a winner each day.</p>
      <ul className="mz-makecup" data-testid="make-cup-points">
        <li><b>From now on:</b> before each game you choose Official (counts) or Practice. You end each Cup day when you’re ready.</li>
        <li><b>What stays:</b> the room code, everyone’s seat and the Memory Book.{played > 0 ? ` The ${played === 1 ? "game" : `${played} games`} already played ${played === 1 ? "stays" : "stay"} casual and ${played === 1 ? "doesn’t" : "don’t"} count.` : ""}</li>
        <li><b>Casual-only extras end:</b> Quick Party, What’s next, Play again, breaks and handing over the host role are for casual rooms.</li>
        <li><b>Changed your mind?</b> Until the first official game finishes, you can go back to a casual game night from the room menu.</li>
      </ul>
      {error ? <p className="err" role="alert" data-testid="make-cup-error">{error}</p> : null}
      <div className="mz-sheet__actions">
        <Keycap block disabled={busy} onClick={onConfirm} data-testid="make-cup-confirm">{busy ? "Starting the Family Cup…" : "Make it a Family Cup"}</Keycap>
        <button type="button" className="mz-chip-btn" data-testid="make-cup-cancel" onClick={onClose}>Not now</button>
      </div>
    </Sheet>
  );
}

/**
 * Stage 12.2 (docs/stage12/stage122.md §1; D-S122-01): "Back to a casual game night", while no official game has
 * finished. The server decides (host only, upgraded Cups only, not mid-game); a refusal is shown here, nothing changes.
 */
export function UndoCupSheet({ practiced, busy, error, onConfirm, onClose }: {
  /** Practice games played since this room became a Family Cup (they stay, as casual games). */
  practiced: number;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Back to a casual game night" onClose={onClose} testId="undo-cup-sheet" kicker="No official game has finished yet">
      <p className="mz-details__pitch">This room goes back to a game night just for fun. No Cup results are lost: nothing official has finished.</p>
      <ul className="mz-makecup" data-testid="undo-cup-points">
        <li><b>Back:</b> Quick Party, What’s next, Play again, breaks and handing over the host role.</li>
        <li><b>What stays:</b> the room code, everyone’s seat and the Memory Book.{practiced > 0 ? ` The ${practiced === 1 ? "practice game" : `${practiced} practice games`} played since ${practiced === 1 ? "stays" : "stay"}, as casual.` : ""}</li>
        <li><b>Later:</b> you can make it a Family Cup again from the room menu.</li>
      </ul>
      {error ? <p className="err" role="alert" data-testid="undo-cup-error">{error}</p> : null}
      <div className="mz-sheet__actions">
        <Keycap block disabled={busy} onClick={onConfirm} data-testid="undo-cup-confirm">{busy ? "Going back…" : "Back to a casual game night"}</Keycap>
        <button type="button" className="mz-chip-btn" data-testid="undo-cup-cancel" onClick={onClose}>Keep the Family Cup</button>
      </div>
    </Sheet>
  );
}
