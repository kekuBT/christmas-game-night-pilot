/**
 * Stage 8.2 (docs/stage8/stage82.md §3.7): the session's content, shown
 * before Start: a two-way choice for whoever decides it (the solo player; a
 * casual room's host or cohost) and a plain label for everyone else (guests,
 * the TV, the briefing, the results). Content, never a look: the look is a
 * device setting (Settings → Look).
 */
import { SegmentedChoice } from "../../ui/mchezo/index.js";
import { SEASON_LABEL, type SessionSeason } from "../../../../../src/shared/season.js";

export function ContentSeasonChoice({ value, onChange, testIdPrefix, note, busy, unsaved }: {
  value: SessionSeason;
  onChange: (season: SessionSeason) => void;
  /** solo | lobby: test ids are `${prefix}-content-everyday` and `…-christmas`. */
  testIdPrefix: string;
  note?: string;
  /** A change is on its way to the server: the choice waits for its answer. */
  busy?: boolean;
  /** Repair R82-01: this device couldn't save the choice; say it lasts only until reload (never promise it is kept). */
  unsaved?: boolean;
}) {
  return (
    <div className="mz-content-choice" data-testid={`${testIdPrefix}-content`} data-season={value}>
      <span className="mz-content-choice__label" aria-hidden="true">Content</span>
      <SegmentedChoice
        label="Content"
        compact
        value={value}
        onChange={(v) => { if (!busy && v !== value) onChange(v as SessionSeason); }}
        options={[
          { value: "everyday", title: SEASON_LABEL.everyday, testId: `${testIdPrefix}-content-everyday`, tone: "neutral", disabled: busy },
          { value: "christmas", title: SEASON_LABEL.christmas, testId: `${testIdPrefix}-content-christmas`, tone: "neutral", disabled: busy },
        ]}
      />
      {note && <p className="mz-foot mz-content-choice__note" data-testid={`${testIdPrefix}-content-note`}>{note}</p>}
      {unsaved && <p className="mz-foot mz-content-choice__note" role="status" data-testid={`${testIdPrefix}-content-unsaved`}>This device can’t save your choice right now, so it applies until you reload this page.</p>}
    </div>
  );
}

/** The content a session deals (or a game was started with), as a label. */
export function ContentSeasonLabel({ season, testId, prefix = "" }: { season: SessionSeason; testId?: string; prefix?: string }) {
  return (
    <span className="mz-content-label" data-season={season} data-testid={testId}>
      {season === "christmas" && <span aria-hidden="true">🎄 </span>}{prefix}{SEASON_LABEL[season]} content
    </span>
  );
}
