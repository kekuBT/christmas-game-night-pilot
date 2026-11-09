// Game Library (Milestone G; Stage 2 visual redesign; Stage 4 completion).
// Covers first, search always on screen, the rarer filters folded away,
// active filters spelled out as removable chips, and a way out of an empty
// result.
//
// Stage 4 (Muse's Stage 3 audit):
// - S3-LIB-01: inside a room, every game says whether it fits the players
//   connected now ("Fits your 2 players", "Needs 2 more players", "Up to 8
//   players"), and the list is grouped that way. This is about group size
//   only: it never claims a game is "playable now" (official content and the
//   Cup's rules are checked when the host starts it). Outside a room, cards
//   show plain requirements; nothing is assumed about anyone's room.
// - S3-LIB-02: "Practice only" explains itself on the card (fun to play,
//   never counts toward the Family Cup, and the server's reason why).
// - S3-LIB-03/04: "Group size" (with "Fits your room" inside a room) instead of
//   "Players in the room"; sorting is its own control and never a filter; a
//   Done button folds the filters away; Clear filters keeps the sort.
// - S3-NAV-01: the view lives in the address (controlled by the route), so
//   Back/Forward, a refresh and a details sheet keep it.
//
// Browsing is open to everyone. Choosing ("Set as up next") is host/cohost-only
// and only inside a room; starting never happens here: the lobby's Start does
// that. Facts come from the shared catalog (manifests + the server's lifecycle
// policy), so names, player counts and eligibility match every other screen.
import { useId, useMemo, useState } from "react";
import {
  allCategories,
  clearFilters,
  filterGames,
  GameCover,
  hasActiveFilters,
  playersLabel,
  roomFit,
  sessionEstimate,
  type CatalogGame,
  type LibraryFilters,
  type LibrarySort,
  type RoomFit,
} from "../../ui/mchezo/index.js";
import type { GameManifest } from "../../../../../src/games/manifest.js";

interface LibraryProps {
  manifests: readonly GameManifest[];
  catalog: readonly CatalogGame[];
  upNextId?: string;
  /** Host or cohost inside a room. */
  canSelect: boolean;
  /** Inside a room (guests see the host-only note). */
  inRoom: boolean;
  /** Players connected in the room now (inside a room only). */
  roomPlayers?: number;
  /** The view, from the address. */
  filters: LibraryFilters;
  onFiltersChange: (f: LibraryFilters) => void;
  onSelect: (id: string) => void;
  onDetails: (id: string) => void;
  onBack: () => void;
  /** Host/cohost in a room: a way to Studio (S3-STU-02). */
  onStudio?: () => void;
}

const SIZE_OPTIONS: number[] = [2, 4, 6, 8, 10];
const DURATION_OPTIONS: (number | null)[] = [null, 5, 8, 10, 15];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The non-default filters, each with a way to remove just that one. */
function activeChips(f: LibraryFilters, roomPlayers?: number): { key: string; label: string; clear: (f: LibraryFilters) => LibraryFilters }[] {
  const out: { key: string; label: string; clear: (f: LibraryFilters) => LibraryFilters }[] = [];
  if (f.query.trim()) out.push({ key: "q", label: `“${f.query.trim()}”`, clear: (x) => ({ ...x, query: "" }) });
  for (const c of f.categories) out.push({ key: `c-${c}`, label: c, clear: (x) => ({ ...x, categories: x.categories.filter((y) => y !== c) }) });
  if (f.fitsRoom) out.push({ key: "p", label: roomPlayers !== undefined ? `Fits your room (${roomPlayers})` : "Fits your room", clear: (x) => ({ ...x, fitsRoom: false }) });
  else if (f.playerCount !== null) out.push({ key: "p", label: `Works for ${f.playerCount} players`, clear: (x) => ({ ...x, playerCount: null }) });
  if (f.maxDuration !== null) out.push({ key: "d", label: `About ${f.maxDuration} min or less`, clear: (x) => ({ ...x, maxDuration: null }) });
  if (f.playStyle !== "all") out.push({ key: "s", label: f.playStyle === "team" ? "Team games" : "Individual games", clear: (x) => ({ ...x, playStyle: "all" }) });
  return out;
}

/** What a card says about the room's size (inside a room only). */
function fitLine(fit: RoomFit, m: GameManifest, players: number): string {
  if (fit === "fits") return `Fits your ${plural(players, "player")}`;
  if (fit === "needs-more") return `Needs ${plural(m.minPlayers - players, "more player")} (${playersLabel(m)})`;
  return `Up to ${m.maxPlayers} players · you have ${players}`;
}

const GROUPS: { fit: RoomFit; title: string; note: (n: number) => string }[] = [
  { fit: "fits", title: "Fits your room", note: (n) => `Works for the ${plural(n, "player")} connected now.` },
  { fit: "needs-more", title: "Needs more players", note: () => "Invite more people to play these." },
  { fit: "too-many", title: "Too many players for these", note: () => "These have a smaller limit." },
];

export function MchezoLibrary({ manifests, catalog, upNextId, canSelect, inRoom, roomPlayers, filters, onFiltersChange, onSelect, onDetails, onBack, onStudio }: LibraryProps) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const sortId = useId();
  const setFilters = (fn: (f: LibraryFilters) => LibraryFilters) => onFiltersChange(fn(filters));
  const categories = useMemo(() => allCategories(manifests), [manifests]);
  const room = inRoom && roomPlayers !== undefined && roomPlayers > 0 ? roomPlayers : undefined;
  const visible = useMemo(() => filterGames(manifests, filters, room), [manifests, filters, room]);
  const active = hasActiveFilters(filters);
  const chips = activeChips(filters, room);
  const panelCount = chips.filter((c) => c.key !== "q").length;
  const byId = (id: string) => catalog.find((g) => g.id === id);
  const anyPracticeOnly = visible.some((m) => !(byId(m.id)?.officialEligible ?? m.features.official));

  const toggleCategory = (c: string) =>
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c],
    }));

  const card = (m: GameManifest) => {
    const g = byId(m.id);
    const practiceOnly = g ? !g.officialEligible : !m.features.official;
    const isUpNext = inRoom && m.id === upNextId;
    const fit = room !== undefined ? roomFit(m, room) : undefined;
    const whyOpen = why === m.id;
    return (
      <article key={m.id} className={`mz-libcard${isUpNext ? " mz-libcard--on" : ""}${fit && fit !== "fits" ? " mz-libcard--unfit" : ""}`} data-testid={`mz-lib-card-${m.id}`} data-fit={fit}>
        <button type="button" className="mz-libcard__open" onClick={() => onDetails(m.id)} aria-label={`${m.title}: details`}>
          <span className="mz-libcard__art">
            <GameCover gameId={m.id} decorative />
            {isUpNext && <span className="mz-pick__badge">✓ Up next</span>}
          </span>
          <span className="mz-libcard__title">{m.title}</span>
          <span className="mz-libcard__meta">{playersLabel(m)} · {sessionEstimate(m.duration.minutes)}</span>
        </button>
        {fit && room !== undefined && (
          <span className={`mz-libcard__fit mz-libcard__fit--${fit}`} data-testid={`mz-lib-fit-${m.id}`}>{fit === "fits" ? "✓ " : ""}{fitLine(fit, m, room)}</span>
        )}
        <span className="mz-libcard__tags">
          {m.categories.slice(0, 2).map((c) => <span key={c} className="mz-lib-tag">{c}</span>)}
          {m.playStyle === "team" && <span className="mz-lib-tag">Team game</span>}
          {practiceOnly && (
            <button type="button" className="mz-lib-tag mz-lib-tag--practice mz-lib-tag--btn" aria-expanded={whyOpen} aria-controls={`mz-lib-why-${m.id}`} data-testid={`mz-lib-practice-${m.id}`} onClick={() => setWhy(whyOpen ? null : m.id)}>
              Practice only <span aria-hidden="true">ⓘ</span>
            </button>
          )}
        </span>
        {practiceOnly && whyOpen && (
          <p className="mz-foot mz-libcard__why" id={`mz-lib-why-${m.id}`} data-testid={`mz-lib-why-${m.id}`}>
            Fun to play any time, but it never counts toward the Family Cup.{g?.practiceOnlyReason ? ` Why: ${g.practiceOnlyReason}` : ""}
          </p>
        )}
        {canSelect && !isUpNext && (
          <button type="button" className="mz-chip-btn mz-libcard__select" data-testid={`mz-lib-select-${m.id}`} onClick={() => onSelect(m.id)}>Set as up next</button>
        )}
      </article>
    );
  };

  // Inside a room, without a size filter of its own, group by fit (fits first).
  const grouped = room !== undefined && !filters.fitsRoom && filters.playerCount === null;

  return (
    <main className="mz-screen mz-screen--wide mz-library" aria-label="Game library">
      <header className="mz-appbar">
        <button type="button" className="mz-iconbtn" aria-label={inRoom ? "Back to lobby" : "Back"} data-testid="mz-lib-back" onClick={onBack}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="mz-appbar__title">All games</h1>
        <span className="mz-appbar__spacer" />
      </header>

      <div className="mz-search">
        <label className="mz-sr" htmlFor="mz-lib-search-input">Search games</label>
        <svg className="mz-search__icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        <input
          id="mz-lib-search-input"
          className="mz-input mz-search__input"
          data-testid="mz-lib-search"
          type="search"
          placeholder="Search by name or category"
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
        />
      </div>

      <div className="mz-lib-tools">
        <button type="button" className="mz-pill" data-testid="mz-lib-filters-toggle" aria-expanded={open} aria-controls="mz-lib-filters" onClick={() => setOpen((o) => !o)}>
          Filters{panelCount ? ` · ${panelCount}` : ""} <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
        <span className="mz-lib-sort">
          <label htmlFor={sortId} className="mz-lib-sort__label">Sort</label>
          <select id={sortId} className="mz-lib-sort__select" data-testid="mz-lib-sort" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as LibrarySort }))}>
            <option value="name">Name A–Z</option>
            <option value="duration">Shortest first</option>
          </select>
        </span>
        <p className="mz-lib-count" data-testid="mz-lib-count" role="status" aria-live="polite">Showing {visible.length} of {manifests.length} games</p>
      </div>

      {open && (
        <div id="mz-lib-filters" className="mz-lib-filters" data-testid="mz-lib-filters">
          <div role="group" aria-label="Group size">
            <p className="mz-lib-filters__label">Group size</p>
            <p className="mz-foot mz-lib-filters__help">Show games that work for this many players.</p>
            <div className="mz-filterrow mz-filterrow--wrap">
              <button type="button" className="mz-pill" data-testid="mz-lib-players-any" aria-pressed={filters.playerCount === null && !filters.fitsRoom} onClick={() => setFilters((f) => ({ ...f, playerCount: null, fitsRoom: false }))}>Any size</button>
              {room !== undefined && (
                <button type="button" className="mz-pill" data-testid="mz-lib-players-room" aria-pressed={filters.fitsRoom} onClick={() => setFilters((f) => ({ ...f, playerCount: null, fitsRoom: true }))}>Your room ({room})</button>
              )}
              {SIZE_OPTIONS.map((n) => (
                <button key={n} type="button" className="mz-pill" data-testid={`mz-lib-players-${n}`} aria-pressed={!filters.fitsRoom && filters.playerCount === n} onClick={() => setFilters((f) => ({ ...f, playerCount: n, fitsRoom: false }))}>{n}</button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Categories">
            <p className="mz-lib-filters__label">Categories</p>
            <div className="mz-filterrow mz-filterrow--wrap">
              {categories.map((c) => (
                <button key={c} type="button" className="mz-pill mz-pill--cat" data-testid={`mz-lib-cat-${c}`} aria-pressed={filters.categories.includes(c)} onClick={() => toggleCategory(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Estimated length">
            <p className="mz-lib-filters__label">Estimated length</p>
            <div className="mz-filterrow mz-filterrow--wrap">
              {DURATION_OPTIONS.map((n) => (
                <button key={n ?? "any"} type="button" className="mz-pill" data-testid={n === null ? "mz-lib-duration-any" : `mz-lib-duration-${n}`} aria-pressed={filters.maxDuration === n} onClick={() => setFilters((f) => ({ ...f, maxDuration: n }))}>{n === null ? "Any length" : `≤${n} min`}</button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Type">
            <p className="mz-lib-filters__label">Type</p>
            <div className="mz-filterrow mz-filterrow--wrap">
              <button type="button" className="mz-pill" data-testid="mz-lib-style-all" aria-pressed={filters.playStyle === "all"} onClick={() => setFilters((f) => ({ ...f, playStyle: "all" }))}>All games</button>
              <button type="button" className="mz-pill" data-testid="mz-lib-style-solo" aria-pressed={filters.playStyle === "solo"} onClick={() => setFilters((f) => ({ ...f, playStyle: "solo" }))}>Individual</button>
              <button type="button" className="mz-pill" data-testid="mz-lib-style-team" aria-pressed={filters.playStyle === "team"} onClick={() => setFilters((f) => ({ ...f, playStyle: "team" }))}>Team</button>
            </div>
          </div>
          <div className="mz-lib-filters__foot">
            <button type="button" className="mz-linkbtn" data-testid="mz-lib-panel-clear" disabled={!active} onClick={() => onFiltersChange(clearFilters(filters))}>Clear all</button>
            <button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="mz-lib-done" onClick={() => setOpen(false)}>Done · show {plural(visible.length, "game")}</button>
          </div>
        </div>
      )}

      {active && (
        <div className="mz-activefilters" role="group" aria-label="Active filters" data-testid="mz-lib-active">
          {chips.map((c) => (
            <button key={c.key} type="button" className="mz-pill mz-pill--active" aria-label={`Remove filter ${c.label}`} onClick={() => setFilters((f) => c.clear(f))}>{c.label} <span aria-hidden="true">✕</span></button>
          ))}
          <button type="button" className="mz-linkbtn" data-testid="mz-lib-reset" onClick={() => onFiltersChange(clearFilters(filters))}>Clear filters</button>
        </div>
      )}

      {inRoom && !canSelect && (
        <p className="mz-foot mz-lib-note">Only the host or cohost can choose the next game. Browsing is open to everyone.</p>
      )}
      {anyPracticeOnly && (
        <p className="mz-foot mz-lib-legend" data-testid="mz-lib-legend">Every game can be played for fun. <b>Practice only</b> games never count toward the Family Cup; tap the tag to see why.</p>
      )}

      {visible.length === 0 ? (
        <div className="mz-card mz-lib-empty" data-testid="mz-lib-empty">
          <p className="mz-lib-empty__title">No games match these filters.</p>
          <p className="mz-foot">Try fewer filters, or clear them all.</p>
          <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="mz-lib-empty-clear" onClick={() => onFiltersChange(clearFilters(filters))}>Clear filters</button>
        </div>
      ) : grouped && room !== undefined ? (
        GROUPS.map((grp) => {
          const items = visible.filter((m) => roomFit(m, room) === grp.fit);
          if (items.length === 0) return null;
          return (
            <section key={grp.fit} className="mz-lib-group" aria-labelledby={`mz-lib-group-${grp.fit}`} data-testid={`mz-lib-group-${grp.fit}`}>
              <h2 className="mz-kicker mz-lib-group__title" id={`mz-lib-group-${grp.fit}`}>{grp.title} · {items.length}</h2>
              <p className="mz-foot mz-lib-group__note">{grp.note(room)}</p>
              <div className="mz-libgrid">{items.map(card)}</div>
            </section>
          );
        })
      ) : (
        <div className="mz-libgrid">{visible.map(card)}</div>
      )}
      {onStudio && (
        <p className="mz-foot mz-lib-studio" data-testid="mz-lib-studio">Planning several games in a row? <button type="button" className="mz-linkbtn" onClick={onStudio}>Studio (preview)</button> sketches a tournament schedule. Host only; nothing is started.</p>
      )}
      <p className="mz-foot">{room !== undefined ? "Group size only: whether a game can count toward the Cup is checked when the host starts it. " : ""}Lengths are design estimates, not measured times. Each game also has a hard time limit and ends by itself.</p>
    </main>
  );
}
