// Game Library screen (Milestone G) — browse the manifest catalog with
// search and filters. Browsing is open to everyone in the lobby; selecting
// ("Set as up next") is host/cohost-only, and starting never happens here:
// the library returns to the lobby, where the existing Start button starts
// the up-next game. Browsing therefore never starts a game and never
// changes lobby state except through the host's explicit selection.
import { useMemo, useState } from "react";
import {
  allCategories,
  DEFAULT_FILTERS,
  filterGames,
  hasActiveFilters,
  PhoneScreen,
  type LibraryFilters,
} from "../../ui/mchezo/index.js";
import type { GameManifest } from "../../../../../src/games/manifest.js";

interface LibraryProps {
  manifests: readonly GameManifest[];
  upNextId: string;
  canSelect: boolean;
  onSelect: (id: string) => void;
  onBack: () => void;
}

const PLAYER_OPTIONS: (number | null)[] = [null, 2, 4, 6, 8, 10];
const DURATION_OPTIONS: (number | null)[] = [null, 5, 8, 10, 15];

export function MchezoLibrary({ manifests, upNextId, canSelect, onSelect, onBack }: LibraryProps) {
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const categories = useMemo(() => allCategories(manifests), [manifests]);
  const visible = useMemo(() => filterGames(manifests, filters), [manifests, filters]);
  const active = hasActiveFilters(filters);

  const toggleCategory = (c: string) =>
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c],
    }));

  return (
    <PhoneScreen label="Game library">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="mz-chip-btn" data-testid="mz-lib-back" onClick={onBack}>← Back to lobby</button>
        <span className="mz-kicker">Game library</span>
      </div>
      <p className="mz-foot" data-testid="mz-lib-count">Showing {visible.length} of {manifests.length} games</p>

      <div style={{ marginTop: 8 }}>
        <label className="mz-foot" htmlFor="mz-lib-search-input">Search games</label>
        <input
          id="mz-lib-search-input"
          className="mz-input"
          data-testid="mz-lib-search"
          type="search"
          placeholder="Search by name or category"
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
        />
      </div>

      <div style={{ marginTop: 12 }} role="group" aria-label="Categories">
        <p className="mz-foot" style={{ margin: "0 0 6px" }}>Categories</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {categories.map((c) => (
            <button key={c} type="button" className="mz-chip-btn" data-testid={`mz-lib-cat-${c}`} aria-pressed={filters.categories.includes(c)} onClick={() => toggleCategory(c)}>{c}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }} role="group" aria-label="Players in the room">
        <p className="mz-foot" style={{ margin: "0 0 6px" }}>Players in the room</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PLAYER_OPTIONS.map((n) => (
            <button key={n ?? "any"} type="button" className="mz-chip-btn" data-testid={n === null ? "mz-lib-players-any" : `mz-lib-players-${n}`} aria-pressed={filters.playerCount === n} onClick={() => setFilters((f) => ({ ...f, playerCount: n }))}>{n === null ? "Any" : `${n}`}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }} role="group" aria-label="Max duration">
        <p className="mz-foot" style={{ margin: "0 0 6px" }}>Max duration</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {DURATION_OPTIONS.map((n) => (
            <button key={n ?? "any"} type="button" className="mz-chip-btn" data-testid={n === null ? "mz-lib-duration-any" : `mz-lib-duration-${n}`} aria-pressed={filters.maxDuration === n} onClick={() => setFilters((f) => ({ ...f, maxDuration: n }))}>{n === null ? "Any length" : `≤${n} min`}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }} role="group" aria-label="Type">
        <p className="mz-foot" style={{ margin: "0 0 6px" }}>Type</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="mz-chip-btn" data-testid="mz-lib-style-all" aria-pressed={filters.playStyle === "all"} onClick={() => setFilters((f) => ({ ...f, playStyle: "all" }))}>All games</button>
          <button type="button" className="mz-chip-btn" data-testid="mz-lib-style-solo" aria-pressed={filters.playStyle === "solo"} onClick={() => setFilters((f) => ({ ...f, playStyle: "solo" }))}>Individual</button>
          <button type="button" className="mz-chip-btn" data-testid="mz-lib-style-team" aria-pressed={filters.playStyle === "team"} onClick={() => setFilters((f) => ({ ...f, playStyle: "team" }))}>Team</button>
        </div>
      </div>

      <div style={{ marginTop: 12 }} role="group" aria-label="Sort">
        <p className="mz-foot" style={{ margin: "0 0 6px" }}>Sort</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="mz-chip-btn" data-testid="mz-lib-sort-name" aria-pressed={filters.sort === "name"} onClick={() => setFilters((f) => ({ ...f, sort: "name" }))}>Name A–Z</button>
          <button type="button" className="mz-chip-btn" data-testid="mz-lib-sort-duration" aria-pressed={filters.sort === "duration"} onClick={() => setFilters((f) => ({ ...f, sort: "duration" }))}>Shortest first</button>
          <button type="button" className="mz-chip-btn" data-testid="mz-lib-reset" disabled={!active} onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</button>
        </div>
      </div>

      {!canSelect && (
        <p className="mz-foot" style={{ marginTop: 12 }}>Only the host or cohost can choose the next game. Browsing is open to everyone.</p>
      )}

      {visible.length === 0 ? (
        <div className="mz-card" style={{ marginTop: 16 }} data-testid="mz-lib-empty">
          <p>No games match these filters.</p>
          <p className="mz-foot">Use Reset filters above to see all games.</p>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {visible.map((m) => (
            <article key={m.id} className="mz-card" style={{ marginTop: 12 }} data-testid={`mz-lib-card-${m.id}`}>
              <p style={{ margin: "0 0 4px" }}><strong>{m.title}</strong>{m.id === upNextId ? " · Up next" : ""}</p>
              <p className="mz-foot" style={{ margin: "0 0 4px" }}>{m.description}</p>
              <p className="mz-muted" style={{ margin: "0 0 8px" }}>{m.minPlayers}–{m.maxPlayers} players · ~{m.duration.minutes} min</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {m.categories.map((c) => (
                  <span key={c} className="mz-lib-tag">{c}</span>
                ))}
                {m.playStyle === "team" && <span className="mz-lib-tag">Team game</span>}
                {m.tv === "dedicated" && <span className="mz-lib-tag">TV stage</span>}
              </div>
              {canSelect && m.id !== upNextId && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="mz-chip-btn" data-testid={`mz-lib-select-${m.id}`} onClick={() => onSelect(m.id)}>Set as up next</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="mz-foot" style={{ marginTop: 16 }}>Durations are design estimates, not measured times.</p>
    </PhoneScreen>
  );
}
