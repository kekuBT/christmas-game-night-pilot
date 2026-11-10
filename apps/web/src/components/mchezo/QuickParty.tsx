/**
 * Stage 7.1: Quick Party (docs/stage7/stage71.md §3.6). Casual rooms only.
 *
 *  QuickPartyCard   in the lobby: the host's way in, and the applied lineup
 *                   for everyone (from the server's projection only).
 *  QuickPartySheet  the host's planner: expected group size, 15/30/60
 *                   minutes, a suggested lineup to edit, and Apply. Nothing
 *                   here talks to the server until Apply; it never starts a
 *                   game or uses content.
 *  PartyStartAsk    what the host decides when a lineup start was refused
 *                   (fewer here than planned; the game doesn't fit).
 *
 * The rules are the shared planner's (src/games/party.ts), the same code the
 * server checks a lineup with.
 */
import { useMemo, useState } from "react";
import { GAME_MANIFESTS } from "../../../../../src/games/manifest.js";
import {
  PARTY_BUDGETS, PARTY_MAX_PLAYERS, PARTY_MIN_PLAYERS, PARTY_TRANSITION_MINUTES, describeLineup, moveItem, partyItemsFor, planParty, removeItem, replaceItem, replacementOptions,
  type PartyBudget, type PartyItem, type PartyLineup,
} from "../../../../../src/games/party.js";
import { Keycap, NoticeCard, Sheet } from "../../ui/mchezo/index.js";
import type { PartyView } from "../../types.js";

const titleOf = (id: string) => GAME_MANIFESTS.find((m) => m.id === id)?.title ?? id;
const playersText = (it: Pick<PartyItem, "minPlayers" | "maxPlayers">) => `${it.minPlayers === it.maxPlayers ? it.minPlayers : `${it.minPlayers}–${it.maxPlayers}`} players`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the planner sends on Apply. */
export interface PartyPlanInput { expectedPlayers: number; budgetMinutes: number; items: { gameId: string }[] }

/** The lineup in the lobby: the host's entry when there is none, the list for everyone when there is. */
export function QuickPartyCard({ party, connected, isHost, upNextId, onPlan, onEdit, onClear, onUseLineup, onReplan, busy }: {
  party: PartyView | undefined;
  connected: number;
  isHost: boolean;
  upNextId?: string;
  onPlan: () => void;
  onEdit: () => void;
  onClear: () => Promise<void>;
  onUseLineup: (gameId: string) => void;
  /** Open the planner for this many players (the people here now). */
  onReplan: (size: number) => void;
  busy?: boolean;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const lineup = party?.lineup ?? null;
  if (!lineup) {
    if (!isHost) return null;
    return (
      <section className="mz-party mz-party--entry" aria-label="Quick Party" data-testid="party-card">
        <span className="mz-kicker">Quick Party</span>
        <p className="mz-party__lede">Not sure what to play? Say how many are coming and how long you have, and get a short lineup.</p>
        <Keycap variant="surface" size="md" data-testid="party-entry" onClick={onPlan}>Plan a Quick Party</Keycap>
      </section>
    );
  }
  const next = lineup.items.findIndex((i) => !i.started);
  const nextId = next >= 0 ? lineup.items[next]!.gameId : undefined;
  // The next game doesn't fit the people here now: say so, and offer a lineup for them.
  const nextGame = nextId ? GAME_MANIFESTS.find((m) => m.id === nextId) : undefined;
  const misfit = nextGame && connected > 0 && (connected < nextGame.minPlayers || connected > nextGame.maxPlayers) ? nextGame : undefined;
  return (
    <section className="mz-party" aria-label="Quick Party lineup" data-testid="party-lineup">
      <span className="mz-kicker">Quick Party</span>
      <h2 className="mz-party__title">Tonight’s lineup</h2>
      <p className="mz-party__meta" data-testid="party-meta">
        Planned for {plural(lineup.expectedPlayers, "player")} · about {lineup.estimateMinutes} of your {lineup.budgetMinutes} minutes (estimated) · {connected} here now
      </p>
      <ol className="mz-party__list">
        {lineup.items.map((it, i) => {
          const m = GAME_MANIFESTS.find((x) => x.id === it.gameId);
          const short = m && connected < m.minPlayers ? m.minPlayers - connected : 0;
          return (
            <li key={`${it.gameId}-${i}`} className={`mz-party__row${it.started ? " is-started" : ""}${i === next ? " is-next" : ""}`} data-testid={`party-row-${i}`}>
              <span className="mz-party__num" aria-hidden="true">{i + 1}</span>
              <span className="mz-party__text">
                <span className="mz-party__name">{titleOf(it.gameId)}</span>
                <span className="mz-party__sub">
                  {m ? `${playersText(m)} · about ${m.duration.minutes} min` : ""}
                  {it.started ? " · started" : i === next ? " · first up" : ""}
                </span>
                {short > 0 && !it.started && <span className="mz-party__warn" data-testid={`party-row-${i}-short`}>Needs {plural(short, "more player")} · {connected} here</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {isHost && misfit && (
        <p className="mz-foot mz-party__aside" data-testid="party-misfit">
          {misfit.title} {connected < misfit.minPlayers ? `needs at least ${misfit.minPlayers}` : `is for up to ${misfit.maxPlayers}`}; {connected} {connected === 1 ? "is" : "are"} here. Wait for them, or{" "}
          <button type="button" className="mz-linkbtn" data-testid="party-replan-card" onClick={() => onReplan(connected)}>replan for {connected}</button>.
        </p>
      )}
      {isHost && nextId && upNextId !== nextId && (
        <p className="mz-foot mz-party__aside" data-testid="party-waiting">
          Up next is your own pick, so the lineup is waiting.{" "}
          <button type="button" className="mz-linkbtn" data-testid="party-use" onClick={() => onUseLineup(nextId)}>Use the lineup</button>
        </p>
      )}
      {isHost && (
        confirmClear ? (
          <div className="mz-party__actions" role="group" aria-label="Clear the lineup?">
            <span className="mz-foot">Clear the lineup for everyone?</span>
            <button type="button" className="mz-chip-btn" data-testid="party-clear-yes" disabled={busy} onClick={() => { void onClear().then(() => setConfirmClear(false)); }}>Clear it</button>
            <button type="button" className="mz-chip-btn" data-testid="party-clear-no" autoFocus onClick={() => setConfirmClear(false)}>Keep it</button>
          </div>
        ) : (
          <div className="mz-party__actions">
            <button type="button" className="mz-chip-btn" data-testid="party-edit" onClick={onEdit}>Edit lineup</button>
            <button type="button" className="mz-chip-btn" data-testid="party-clear" onClick={() => setConfirmClear(true)}>Clear</button>
          </div>
        )
      )}
    </section>
  );
}

/** The planner: settings, a suggested lineup to edit, and Apply. Client-only until Apply. */
export function QuickPartySheet({ connected, recentIds, saved, initialSize, onApply, onPickManually, onClose }: {
  /** Connected players now: the starting suggestion for the group size. */
  connected: number;
  /** The room's finished games, most recent first (a preference only). */
  recentIds: readonly string[];
  /** The applied lineup, when editing it. */
  saved?: { expectedPlayers: number; budgetMinutes: number; gameIds: string[] };
  /** A replan for a known head count (overrides `saved` and `connected`). */
  initialSize?: number;
  /** Save the lineup; resolves to an error message, or null when it was saved. */
  onApply: (plan: PartyPlanInput) => Promise<string | null>;
  onPickManually: () => void;
  onClose: () => void;
}) {
  const clampSize = (n: number) => Math.min(PARTY_MAX_PLAYERS, Math.max(PARTY_MIN_PLAYERS, Math.round(n)));
  const [size, setSize] = useState(() => clampSize(initialSize ?? saved?.expectedPlayers ?? (connected > 0 ? connected : 1)));
  const [budget, setBudget] = useState<PartyBudget>(() => (saved && initialSize === undefined && (PARTY_BUDGETS as readonly number[]).includes(saved.budgetMinutes) ? saved.budgetMinutes as PartyBudget : 30));
  const [exclude, setExclude] = useState<string[]>([]);
  const [lineup, setLineup] = useState<PartyLineup | null>(() => {
    if (!saved || initialSize !== undefined) return null;
    const items = partyItemsFor(saved.gameIds).filter((x): x is PartyItem => !!x);
    return describeLineup(saved.expectedPlayers, saved.budgetMinutes, items);
  });
  const [replacing, setReplacing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const suggest = (excl = exclude) => {
    setReplacing(null);
    setError("");
    setLineup(planParty({ expectedPlayers: size, budgetMinutes: budget, seed: Math.floor(Math.random() * 2 ** 31), excludeIds: excl, recentIds }));
  };
  const edit = (items: PartyItem[], excl = exclude) => { setReplacing(null); setError(""); setLineup(describeLineup(size, budget, items, { excludeIds: excl })); };
  // Changing who or how long makes the shown lineup out of date: it is cleared, never silently kept.
  const changeSize = (n: number) => { setSize(clampSize(n)); setLineup(null); setReplacing(null); };
  const changeBudget = (b: PartyBudget) => { setBudget(b); setLineup(null); setReplacing(null); };
  const options = useMemo(() => (lineup && replacing !== null ? replacementOptions(lineup, replacing, { excludeIds: exclude }) : []), [lineup, replacing, exclude]);
  const longer = PARTY_BUDGETS.find((b) => b > budget);
  const apply = async () => {
    if (!lineup || lineup.items.length === 0) return;
    setBusy(true);
    setError("");
    const err = await onApply({ expectedPlayers: size, budgetMinutes: budget, items: lineup.items.map((i) => ({ gameId: i.gameId })) });
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <Sheet title="Plan a Quick Party" onClose={onClose} testId="party-sheet" kicker="Casual · just for fun">
      <div className="mz-party__field">
        <span className="mz-party__label" id="party-size-label">Expected group size</span>
        <span className="mz-foot mz-party__help">Who’s coming, not who’s here: {connected} here now.</span>
        <div className="mz-stepper" role="group" aria-labelledby="party-size-label">
          <button type="button" className="mz-stepper__btn" data-testid="party-size-dec" aria-label="One fewer" disabled={size <= PARTY_MIN_PLAYERS} onClick={() => changeSize(size - 1)}>−</button>
          <output className="mz-stepper__value" data-testid="party-size" aria-live="polite">{size}</output>
          <button type="button" className="mz-stepper__btn" data-testid="party-size-inc" aria-label="One more" disabled={size >= PARTY_MAX_PLAYERS} onClick={() => changeSize(size + 1)}>+</button>
        </div>
      </div>
      <div className="mz-party__field">
        <span className="mz-party__label" id="party-time-label">How long have you got?</span>
        <div className="mz-filterrow" role="radiogroup" aria-labelledby="party-time-label">
          {PARTY_BUDGETS.map((b) => (
            <button key={b} type="button" role="radio" aria-checked={budget === b} className="mz-pill" data-testid={`party-time-${b}`} onClick={() => changeBudget(b)}>{b} min</button>
          ))}
        </div>
      </div>
      {!lineup && <Keycap block data-testid="party-suggest" onClick={() => suggest()}>Suggest a lineup</Keycap>}
      {lineup && lineup.status === "none" && (
        <NoticeCard tone="warn" testId="party-none" title={lineup.noneReason === "too-short" ? `No game fits in ${budget} minutes` : `No game fits ${plural(size, "player")}`}
          action={<span className="mz-party__actions">
            {lineup.noneReason === "too-short" && longer && <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="party-longer" onClick={() => { setBudget(longer); setLineup(planParty({ expectedPlayers: size, budgetMinutes: longer, seed: Math.floor(Math.random() * 2 ** 31), excludeIds: exclude, recentIds })); }}>Try {longer} minutes</button>}
            {exclude.length > 0 && <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="party-reset-removed" onClick={() => { setExclude([]); suggest([]); }}>Bring back removed games</button>}
            <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="party-manual" onClick={onPickManually}>Pick a game myself</button>
          </span>}>
          {lineup.noneReason === "too-short"
            ? `Every game for ${plural(size, "player")} needs more than ${budget} minutes once you count ${PARTY_TRANSITION_MINUTES} minutes to get going.`
            : exclude.length > 0 ? "None of the games left fits this group." : "None of the games fits this group size."}
        </NoticeCard>
      )}
      {lineup && lineup.items.length > 0 && (
        <>
          <ol className="mz-party__list mz-party__list--edit" data-testid="party-preview" aria-label="Suggested lineup">
            {lineup.items.map((it, i) => (
              <li key={it.gameId} className="mz-party__row" data-testid={`party-item-${i}`} data-game={it.gameId}>
                <span className="mz-party__num" aria-hidden="true">{i + 1}</span>
                <span className="mz-party__text">
                  <span className="mz-party__name">{it.title}</span>
                  <span className="mz-party__sub">{playersText(it)} · about {it.minutes} min</span>
                </span>
                <span className="mz-party__tools">
                  <button type="button" className="mz-iconbtn mz-iconbtn--sm" data-testid={`party-up-${i}`} aria-label={`Move ${it.title} up`} disabled={i === 0} onClick={() => edit(moveItem(lineup.items, i, -1))}>↑</button>
                  <button type="button" className="mz-iconbtn mz-iconbtn--sm" data-testid={`party-down-${i}`} aria-label={`Move ${it.title} down`} disabled={i === lineup.items.length - 1} onClick={() => edit(moveItem(lineup.items, i, 1))}>↓</button>
                  <button type="button" className="mz-chip-btn" data-testid={`party-replace-${i}`} aria-expanded={replacing === i} onClick={() => setReplacing(replacing === i ? null : i)}>Replace</button>
                  <button type="button" className="mz-chip-btn" data-testid={`party-remove-${i}`} aria-label={`Remove ${it.title}`} onClick={() => { const excl = [...exclude, it.gameId]; setExclude(excl); edit(removeItem(lineup.items, i), excl); }}>Remove</button>
                </span>
                {replacing === i && (
                  <div className="mz-party__options" role="group" aria-label={`Replace ${it.title} with`} data-testid="party-options">
                    {options.length === 0
                      ? <p className="mz-foot" data-testid="party-no-options">No other game fits {plural(size, "player")} in the time left.</p>
                      : options.map((o) => (
                        <button key={o.gameId} type="button" className="mz-pill" data-testid={`party-option-${o.gameId}`} onClick={() => edit(replaceItem(lineup.items, i, o))}>{o.title} · {o.minutes} min</button>
                      ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p className="mz-party__estimate" data-testid="party-estimate" role="status">
            {lineup.status === "short"
              ? <>Only {plural(lineup.poolSize, "game")} {lineup.poolSize === 1 ? "fits" : "fit"} {plural(size, "player")}, so this lineup is about <b>{lineup.estimateMinutes}</b> of your {budget} minutes.</>
              : <>About <b>{lineup.estimateMinutes}</b> of your {budget} minutes.</>}
            {" "}Estimated: each game’s usual length plus {PARTY_TRANSITION_MINUTES} minutes to get going. Each game also has its own time limit.
          </p>
          <div className="mz-party__actions">
            <button type="button" className="mz-chip-btn" data-testid="party-regenerate" onClick={() => suggest()}>Suggest again</button>
            <button type="button" className="mz-linkbtn" data-testid="party-manual" onClick={onPickManually}>Pick a game myself</button>
          </div>
          {error && <p className="err" role="alert" data-testid="party-error">{error}</p>}
          <Keycap block data-testid="party-apply" disabled={busy} onClick={() => void apply()}>{busy ? "Saving…" : `Use this lineup (${plural(lineup.items.length, "game")})`}</Keycap>
          <p className="mz-foot">Using it shows the lineup to everyone. Nothing starts until you press Start.</p>
        </>
      )}
    </Sheet>
  );
}

/** A lineup start the server refused for a reason the host decides on. */
export type PartyAsk =
  | { kind: "fewer"; gameId: string; expected: number; here: number }
  | { kind: "doesnt-fit"; gameId: string; here: number; minPlayers: number; maxPlayers: number };

export function PartyStartAsk({ ask, busy, onStartAnyway, onReplan, onWait }: { ask: PartyAsk; busy?: boolean; onStartAnyway: () => void; onReplan: (size: number) => void; onWait: () => void }) {
  const title = titleOf(ask.gameId);
  if (ask.kind === "fewer") {
    return (
      <NoticeCard tone="warn" testId="party-ask-fewer" title={`You planned for ${ask.expected}; ${ask.here} ${ask.here === 1 ? "is" : "are"} here`}
        action={<span className="mz-party__actions">
          <button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="party-start-anyway" disabled={busy} onClick={onStartAnyway}>Start with {ask.here}</button>
          <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="party-replan" onClick={() => onReplan(ask.here)}>Replan for {ask.here}</button>
          <button type="button" className="mz-chip-btn" data-testid="party-wait" onClick={onWait}>Wait</button>
        </span>}>
        {title} will start with the {plural(ask.here, "player")} here now. Anyone who arrives later joins the next game.
      </NoticeCard>
    );
  }
  return (
    <NoticeCard tone="warn" testId="party-ask-fit" title={`${title} doesn’t fit the ${plural(ask.here, "player")} here`}
      action={<span className="mz-party__actions">
        <button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="party-replan" onClick={() => onReplan(ask.here)}>Replan for {ask.here}</button>
        <button type="button" className="mz-chip-btn" data-testid="party-wait" onClick={onWait}>Wait</button>
      </span>}>
      {ask.here < ask.minPlayers ? `It needs at least ${ask.minPlayers}. Wait for ${plural(ask.minPlayers - ask.here, "more player")}, or replan for the ${ask.here} here.` : `It is for up to ${ask.maxPlayers}.`}
    </NoticeCard>
  );
}
