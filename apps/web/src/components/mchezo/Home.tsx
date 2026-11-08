/**
 * Stage 2, Home B (approved): games first, with Join and Host one tap away in a
 * fixed dock. Join and Host are their own screens (/join, /host) so an invited
 * guest coming from a QR code lands straight on Join, and a host types a name
 * before the room exists (audit A-04).
 *
 * Nothing here is invented: covers and game facts come from the catalog
 * (manifests + the server's lifecycle policy); the Rejoin card appears only
 * for a seat this browser really holds.
 */
import { useId, type ReactNode } from "react";
import { CodeInput, GameCover, Keycap, Sheet, Wordmark, accentColor, playersLabel, sessionEstimate, timeLimitLabel, type CatalogGame } from "../../ui/mchezo/index.js";

function BackButton({ onBack, label = "Back" }: { onBack: () => void; label?: string }) {
  return (
    <button type="button" className="mz-iconbtn" aria-label={label} data-testid="nav-back" onClick={onBack}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

function SettingsIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
}

/** A game as a tappable card: title, one line of facts, cover. */
export function GameCard({ game, onOpen, badge, size = "md", testId }: { game: CatalogGame; onOpen: (id: string) => void; badge?: ReactNode; size?: "md" | "sm"; testId?: string }) {
  return (
    <button type="button" className={`mz-gamecard mz-gamecard--${size}`} data-testid={testId ?? `game-card-${game.id}`} onClick={() => onOpen(game.id)} aria-label={`${game.title}: ${playersLabel(game)}, ${sessionEstimate(game.estimateMinutes)}${game.officialEligible ? "" : ", practice only"}`}>
      {/* S3-HOME-01: name and facts first, so a card coming into view shows them before its picture. */}
      <span className="mz-gamecard__title">{game.title}</span>
      <span className="mz-gamecard__meta">{playersLabel(game)} · {sessionEstimate(game.estimateMinutes)}{game.officialEligible ? "" : " · practice only"}</span>
      <span className="mz-gamecard__art">
        <GameCover gameId={game.id} decorative />
        {badge && <span className="mz-gamecard__badge">{badge}</span>}
      </span>
    </button>
  );
}

export function HomeScreen(p: {
  catalog: readonly CatalogGame[];
  featured?: CatalogGame;
  onOpenGame: (id: string) => void;
  onJoin: () => void;
  onHost: () => void;
  onLibrary: () => void;
  onSettings: () => void;
  onLostSeat: () => void;
  /** This tab is seated in a room (e.g. after Back from the lobby). */
  rejoin?: { code: string; state: "lobby" | "briefing" | "game"; onRejoin: () => void } | null;
  /** Remembered seats on this device (WelcomeBack). */
  welcome?: ReactNode;
  status?: ReactNode;
}) {
  const party = p.catalog.filter((g) => g.id !== p.featured?.id);
  return (
    <main className="mz-screen mz-screen--wide mz-screen--docked mz-home" aria-label="Mchezo home" data-testid="home">
      {/* S3-HOME-01: the games scroll ABOVE the Join/Host dock, never under it. */}
      <div className="mz-home__scroll" data-testid="home-scroll">
      <header className="mz-appbar">
        <Wordmark size={22} />
        <button type="button" className="mz-iconbtn" aria-label="Settings for this phone" data-testid="home-settings" onClick={p.onSettings}><SettingsIcon /></button>
      </header>
      {p.rejoin && (
        <section className="mz-rejoin" aria-label="Your room" data-testid="home-rejoin">
          <div className="mz-rejoin__text">
            <span className="mz-rejoin__title">Rejoin {p.rejoin.code ? `room ${p.rejoin.code}` : "your room"}</span>
            <span className="mz-rejoin__sub">{p.rejoin.state === "game" ? "A game is in progress. Its clock keeps running." : p.rejoin.state === "briefing" ? "A game is about to start. Rejoin to get ready." : "Your seat is still here."}</span>
          </div>
          <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="home-rejoin-btn" onClick={p.rejoin.onRejoin}>Rejoin</button>
        </section>
      )}
      {p.welcome}
      {p.featured && (
        <section className="mz-home__section" aria-labelledby="mz-featured">
          <span className="mz-kicker" id="mz-featured">Featured today</span>
          <button type="button" className="mz-hero-card" data-testid="home-featured" onClick={() => p.onOpenGame(p.featured!.id)} style={{ ["--mz-accent" as string]: accentColor(p.featured.id) }} aria-label={`${p.featured.title}: ${p.featured.description}`}>
            <GameCover gameId={p.featured.id} ratio={16 / 9} size={180} decorative />
            <span className="mz-hero-card__text">
              <span className="mz-hero-card__title">{p.featured.title}</span>
              <span className="mz-hero-card__meta">{playersLabel(p.featured)} · {sessionEstimate(p.featured.estimateMinutes)}</span>
            </span>
          </button>
        </section>
      )}
      <section className="mz-home__section" aria-labelledby="mz-party">
        <div className="mz-home__row">
          <span className="mz-kicker" id="mz-party">Party games</span>
          <button type="button" className="mz-linkbtn mz-home__all" data-testid="home-all-games" onClick={p.onLibrary}>All {p.catalog.length} games ›</button>
        </div>
        <div className="mz-shelf" role="list">
          {party.map((g) => <div role="listitem" key={g.id}><GameCard game={g} onOpen={p.onOpenGame} /></div>)}
        </div>
      </section>
      <p className="mz-foot mz-home__lede">Party games for the people in the room. Your phone is your controller; no account needed.</p>
      <button type="button" className="mz-linkbtn" data-testid="mz-lost-place" onClick={p.onLostSeat}>Lost your place? Recover your seat</button>
      {p.status}
      </div>
      <div className="mz-dock mz-dock--home" data-testid="home-dock">
        <Keycap block data-testid="home-join" onClick={p.onJoin}>Join with a code</Keycap>
        <Keycap block variant="surface" data-testid="home-host" onClick={p.onHost}>Host a party</Keycap>
      </div>
    </main>
  );
}

export function JoinScreen(p: {
  code: string;
  onCodeChange: (c: string) => void;
  name: string;
  onNameChange: (n: string) => void;
  onJoin: () => void;
  onSpectate: () => void;
  onBack: () => void;
  onLostSeat: () => void;
  remember: ReactNode;
  notice?: ReactNode;
  status?: ReactNode;
  /** This tab already holds a seat: explain instead of offering a second one. */
  blocked?: boolean;
  /** Arrived from a watch link: lead with watching. */
  watch?: boolean;
}) {
  const nameId = useId();
  const ok = p.code.length === 6 && p.name.trim().length > 0;
  return (
    <main className="mz-screen mz-entry" aria-label="Join a game" data-testid="join-screen">
      <header className="mz-appbar"><BackButton onBack={p.onBack} /><Wordmark size={20} /><span className="mz-appbar__spacer" /></header>
      {p.notice}
      <h1 className="mz-h1">{p.watch ? "Watch a game" : "Join a game"}</h1>
      <p className="mz-foot mz-entry__lede">{p.watch ? "Watching needs only the room code: no seat, no scores, nothing to tap." : "Type the 6-character code on the host’s screen, or scan their QR code."}</p>
      {!p.blocked && <>
      <form className="mz-form" onSubmit={(e) => { e.preventDefault(); if (ok) p.onJoin(); }}>
        <CodeInput value={p.code} onChange={p.onCodeChange} length={6} pattern={/[^A-Z0-9]/g} />
        <div className="mz-field">
          <label htmlFor={nameId} className="mz-field__label">What should we call you?</label>
          <input id={nameId} className="mz-input" value={p.name} maxLength={24} autoComplete="nickname" placeholder="e.g. Auntie June" onChange={(e) => p.onNameChange(e.target.value)} aria-describedby={`${nameId}-help`} />
          <p className="mz-foot mz-field__help" id={`${nameId}-help`}>Shown to everyone in the room. Up to 24 characters.</p>
        </div>
        {p.remember}
        <Keycap type="submit" block disabled={!ok}>Join the game</Keycap>
        {!ok && <p className="mz-foot mz-entry__reason" data-testid="join-reason">{p.code.length !== 6 ? "Enter the 6-character room code." : "Type your name to join."}</p>}
      </form>
      <button type="button" className="mz-chip-btn mz-entry__watch" data-testid="watch-spectator" disabled={p.code.length !== 6} onClick={p.onSpectate}>Watch as spectator — no seat needed</button>
      <button type="button" className="mz-linkbtn" data-testid="mz-lost-place" onClick={p.onLostSeat}>Lost your place? Recover your seat</button>
      </>}
      {p.status}
    </main>
  );
}

export function HostScreen(p: {
  name: string;
  onNameChange: (n: string) => void;
  onHost: () => void;
  onBack: () => void;
  remember: ReactNode;
  firstGame?: CatalogGame;
  notice?: ReactNode;
  status?: ReactNode;
  /** This tab already holds a seat. */
  blocked?: boolean;
}) {
  const nameId = useId();
  const ok = p.name.trim().length > 0;
  return (
    <main className="mz-screen mz-entry" aria-label="Host a party" data-testid="host-screen">
      <header className="mz-appbar"><BackButton onBack={p.onBack} /><Wordmark size={20} /><span className="mz-appbar__spacer" /></header>
      {p.notice}
      <h1 className="mz-h1">Host a party</h1>
      <p className="mz-foot mz-entry__lede">Your phone runs the room. Everyone else joins with the code or the QR code you’ll see next.</p>
      {!p.blocked && p.firstGame && (
        <div className="mz-entry__game" data-testid="host-first-game">
          <GameCover gameId={p.firstGame.id} decorative className="mz-entry__cover" />
          <span>First game: <b>{p.firstGame.title}</b>. You can change it in the lobby.</span>
        </div>
      )}
      {!p.blocked && <form className="mz-form" onSubmit={(e) => { e.preventDefault(); if (ok) p.onHost(); }}>
        <div className="mz-field">
          <label htmlFor={nameId} className="mz-field__label">What should we call you?</label>
          <input id={nameId} className="mz-input" value={p.name} maxLength={24} autoComplete="nickname" placeholder="e.g. Auntie June" autoFocus onChange={(e) => p.onNameChange(e.target.value)} aria-describedby={`${nameId}-help`} />
          <p className="mz-foot mz-field__help" id={`${nameId}-help`}>Shown to everyone in the room. Up to 24 characters.</p>
        </div>
        {p.remember}
        <Keycap type="submit" block disabled={!ok}>Host a game</Keycap>
        {!ok && <p className="mz-foot mz-entry__reason" data-testid="host-reason">Type your name first, so your players know whose party it is.</p>}
      </form>}
      {p.status}
    </main>
  );
}

/** Game details (a sheet over Home, the Library or the host's picker). */
export function GameDetailsSheet({ game, onClose, action, roomPlayers }: {
  game: CatalogGame;
  onClose: () => void;
  action?: ReactNode;
  /** Connected players in the room, to say whether it fits. */
  roomPlayers?: number;
}) {
  const limit = timeLimitLabel(game.timeLimitMs);
  return (
    <Sheet title={game.title} onClose={onClose} testId="game-details" kicker={game.categories.slice(0, 2).join(" · ")}>
      <GameCover gameId={game.id} ratio={16 / 9} size={180} title={game.title} className="mz-details__cover" />
      <p className="mz-details__pitch">{game.description}</p>
      <ul className="mz-chips" aria-label="About this game">
        <li className="mz-chip">{playersLabel(game)}</li>
        <li className="mz-chip">{sessionEstimate(game.estimateMinutes)} to play</li>
        {limit && <li className="mz-chip">{limit}</li>}
        <li className={`mz-chip ${game.officialEligible ? "mz-chip--sun" : "mz-chip--mint"}`}>{game.officialEligible ? "Can count in the Cup (2+ players)" : "Practice only"}</li>
        {game.team && <li className="mz-chip">Team game</li>}
      </ul>
      {!game.officialEligible && game.practiceOnlyReason && <p className="mz-foot" data-testid="details-practice-reason">{game.practiceOnlyReason}</p>}
      {roomPlayers !== undefined && (roomPlayers < game.minPlayers || roomPlayers > game.maxPlayers) && (
        <p className="mz-foot mz-details__fit" data-testid="details-fit">{roomPlayers < game.minPlayers ? `Needs ${game.minPlayers - roomPlayers} more player${game.minPlayers - roomPlayers === 1 ? "" : "s"} to start.` : `Up to ${game.maxPlayers} players.`}</p>
      )}
      <p className="mz-foot">“About {game.estimateMinutes} min” is our design estimate of a session, not a measurement.{limit ? ` The game itself ends by itself at its ${limit}.` : ""}</p>
      {action && <div className="mz-sheet__actions">{action}</div>}
    </Sheet>
  );
}
