// Game Library (Milestone G; Stage 2 visual redesign). Covers first, search
// always on screen, the rarer filters folded away, active filters spelled out
// as removable chips, and a way out of an empty result.
//
// Browsing is open to everyone. Choosing ("Set as up next") is host/cohost-only
// and only inside a room; starting never happens here: the lobby's Start does
// that. Facts come from the shared catalog (manifests + the server's lifecycle
// policy), so names, player counts and eligibility match every other screen.
import { useMemo, useState } from "react";
import {
  allCategories,
  DEFAULT_FILTERS,
  filterGames,
  GameCover,
  hasActiveFilters,
  playersLabel,
  sessionEstimate,
  type CatalogGame,
  type LibraryFilters,
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
  onSelect: (id: string) => void;
  onDetails: (id: string) => void;
  onBack: () => void;
}

const PLAYER_OPTIONS: (number | null)[] = [null, 2, 4, 6, 8, 10];
const DURATION_OPTIONS: (number | null)[] = [null, 5, 8, 10, 15];

/** The non-default filters, each with a way to remove just that one. */
function activeChips(f: LibraryFilters): { key: string; label: string; clear: (f: LibraryFilters) => LibraryFilters }[] {
  const out: { key: string; label: string; clear: (f: LibraryFilters) => LibraryFilters }[] = [];
  if (f.query.trim()) out.push({ key: "q", label: `“${f.query.trim()}”`, clear: (x) => ({ ...x, query: "" }) });
  for (const c of f.categories) out.push({ key: `c-${c}`, label: c, clear: (x) => ({ ...x, categories: x.categories.filter((y) => y !== c) }) });
  if (f.playerCount !== null) out.push({ key: "p", label: `${f.playerCount} players`, clear: (x) => ({ ...x, playerCount: null }) });
  if (f.maxDuration !== null) out.push({ key: "d", label: `≤${f.maxDuration} min`, clear: (x) => ({ ...x, maxDuration: null }) });
  if (f.playStyle !== "all") out.push({ key: "s", label: f.playStyle === "team" ? "Team" : "Individual", clear: (x) => ({ ...x, playStyle: "all" }) });
  if (f.sort !== "name") out.push({ key: "o", label: "Shortest first", clear: (x) => ({ ...x, sort: "name" }) });
  return out;
}

export function MchezoLibrary({ manifests, catalog, upNextId, canSelect, inRoom, onSelect, onDetails, onBack }: LibraryProps) {
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [open, setOpen] = useState(false);
  const categories = useMemo(() => allCategories(manifests), [manifests]);
  const visible = useMemo(() => filterGames(manifests, filters), [manifests, filters]);
  const active = hasActiveFilters(filters);
  const chips = activeChips(filters);
  const panelCount = chips.filter((c) => c.key !== "q").length;
  const byId = (id: string) => catalog.find((g) => g.id === id);

  const toggleCategory = (c: string) =>
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c],
    }));

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
        <p className="mz-lib-count" data-testid="mz-lib-count" role="status" aria-live="polite">Showing {visible.length} of {manifests.length} games</p>
      </div>

      {open && (
        <div id="mz-lib-filters" className="mz-lib-filters">
          <div role="group" aria-label="Categories">
            <p className="mz-lib-filters__label">Categories</p>
            <div className="mz-filterrow mz-filterrow--wrap">
              {categories.map((c) => (
                <button key={c} type="button" className="mz-pill mz-pill--cat" data-testid={`mz-lib-cat-${c}`} aria-pressed={filters.categories.includes(c)} onClick={() => toggleCategory(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Players in the room">
            <p className="mz-lib-filters__label">Players in the room</p>
            <div className="mz-filterrow mz-filterrow--wrap">
              {PLAYER_OPTIONS.map((n) => (
                <button key={n ?? "any"} type="button" className="mz-pill" data-testid={n === null ? "mz-lib-players-any" : `mz-lib-players-${n}`} aria-pressed={filters.playerCount === n} onClick={() => setFilters((f) => ({ ...f, playerCount: n }))}>{n === null ? "Any" : `${n}`}</button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Max duration">
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
          <div role="group" aria-label="Sort">
            <p className="mz-lib-filters__label">Sort</p>
            <div className="mz-filterrow mz-filterrow--wrap">
              <button type="button" className="mz-pill" data-testid="mz-lib-sort-name" aria-pressed={filters.sort === "name"} onClick={() => setFilters((f) => ({ ...f, sort: "name" }))}>Name A–Z</button>
              <button type="button" className="mz-pill" data-testid="mz-lib-sort-duration" aria-pressed={filters.sort === "duration"} onClick={() => setFilters((f) => ({ ...f, sort: "duration" }))}>Shortest first</button>
            </div>
          </div>
        </div>
      )}

      {active && (
        <div className="mz-activefilters" role="group" aria-label="Active filters" data-testid="mz-lib-active">
          {chips.map((c) => (
            <button key={c.key} type="button" className="mz-pill mz-pill--active" aria-label={`Remove filter ${c.label}`} onClick={() => setFilters((f) => c.clear(f))}>{c.label} <span aria-hidden="true">✕</span></button>
          ))}
          <button type="button" className="mz-linkbtn" data-testid="mz-lib-reset" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
        </div>
      )}

      {inRoom && !canSelect && (
        <p className="mz-foot mz-lib-note">Only the host or cohost can choose the next game. Browsing is open to everyone.</p>
      )}

      {visible.length === 0 ? (
        <div className="mz-card mz-lib-empty" data-testid="mz-lib-empty">
          <p className="mz-lib-empty__title">No games match these filters.</p>
          <p className="mz-foot">Try fewer filters, or clear them all.</p>
          <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="mz-lib-empty-clear" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
        </div>
      ) : (
        <div className="mz-libgrid">
          {visible.map((m) => {
            const g = byId(m.id);
            const practiceOnly = g ? !g.officialEligible : !m.features.official;
            const isUpNext = inRoom && m.id === upNextId;
            return (
              <article key={m.id} className={`mz-libcard${isUpNext ? " mz-libcard--on" : ""}`} data-testid={`mz-lib-card-${m.id}`}>
                <button type="button" className="mz-libcard__open" onClick={() => onDetails(m.id)} aria-label={`${m.title}: details`}>
                  <span className="mz-libcard__art">
                    <GameCover gameId={m.id} decorative />
                    {isUpNext && <span className="mz-pick__badge">✓ Up next</span>}
                  </span>
                  <span className="mz-libcard__title">{m.title}</span>
                  <span className="mz-libcard__meta">{playersLabel(m)} · {sessionEstimate(m.duration.minutes)}</span>
                </button>
                <span className="mz-libcard__tags">
                  {m.categories.slice(0, 2).map((c) => <span key={c} className="mz-lib-tag">{c}</span>)}
                  {m.playStyle === "team" && <span className="mz-lib-tag">Team game</span>}
                  {practiceOnly && <span className="mz-lib-tag mz-lib-tag--practice">Practice only</span>}
                </span>
                {canSelect && !isUpNext && (
                  <button type="button" className="mz-chip-btn mz-libcard__select" data-testid={`mz-lib-select-${m.id}`} onClick={() => onSelect(m.id)}>Set as up next</button>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="mz-foot">Lengths are design estimates, not measured times. Each game also has a hard time limit and ends by itself.</p>
    </main>
  );
}
