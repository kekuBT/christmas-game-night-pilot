// Guess the Year in the Mchezo kit (Work Package D) — a component
// and UX extraction of the old GamePanel year branch, not a gameplay
// rewrite. Intents, scoring, abstention, deadlines, permissions, and
// reconnect behavior are unchanged: guesses still submit
// "year-guess" with { eventId, value }, abstention still submits
// "abstain" (whole-game for Year), the host skip still posts the
// same endpoint after the deadline, and the session/reconnect flow
// is untouched (App-level).
//
// What changed, deliberately and disclosed:
// - The panel renders in the kit (PhoneScreen) instead of the old
//   green shell, mirroring how Trivia and Closest Wins play bypass
//   the old shell. Intro (ShowIntro) and finished results
//   (ShowResults) are untouched — this component covers gameplay +
//   waiting only.
// - One event at a time with free navigation, instead of all eight
//   events on one scrolling page (each with its own slider + field +
//   two buttons). Jump chips per event (like the Trivia reveal's
//   mz-reveal-q{i}) show which are guessed; a progress line says
//   "Event N of 8". Any-order answering is preserved — the engine
//   has no current-event pointer, guesses are per event id in
//   myGuesses, and nothing forces the player to answer in order.
// - Inputs come from the shared NumericGuess primitive (unified in
//   Work Package B: one value, one Submit). The range is 1896–2025,
//   not the old slider's 1900–2025: one event's answer is 1896 (the
//   first modern Olympics), which the old dial alone could never
//   reach (best 60 on that event). The engine accepts any integer,
//   so the range is a UI correction, not a rule change — the
//   submitted values are the same ones the field already allowed.
//   The control is keyed by event id, so each event starts at 2000
//   (the old slider's initial) instead of carrying the previous
//   event's value.
// - The waiting ring appears only when the player has guessed all
//   eight events or abstained (the server's submittedCount for Year
//   is per-game, not per-event). While events remain, the player
//   sees the chips and the current event's controls instead.
// - The post-abstention state mirrors Closest: an abstained player
//   sees the same waiting ring + host skip as a finished player
//   (the old panel showed abstained players no counts and no skip).
// - GamePanel's year branch is now dead (App routes year here
//   first), left in place like Trivia's dead quiz branch and
//   Closest's dead branch — a future cleanup removes dead branches
//   as more games migrate.
import { useState } from "react";
import { AbstainControl, MchezoWaiting, NumericGuess, PhoneScreen } from "../../ui/mchezo/index.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

export interface MchezoYearDeps {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  intent: (gid: string, a: string, p: Record<string, unknown>) => void;
  post: <T>(path: string, body: Record<string, unknown>) => Promise<T>;
  roomId: string;
  isHostOrCohost: boolean;
  title: string;
}

interface YearEvent {
  id: string;
  event: string;
}

export function MchezoYear(deps: MchezoYearDeps) {
  const { game, publicGame, players, playerId, intent, post, roomId, isHostOrCohost, title } = deps;
  const st = (game.state ?? {}) as { events?: YearEvent[]; myGuesses?: Record<string, number>; myAbstained?: boolean };
  const events = st.events ?? [];
  const myGuesses = st.myGuesses ?? {};
  const [idx, setIdx] = useState(0);
  const current = events[Math.min(idx, Math.max(0, events.length - 1))];
  // Host escape hatch, mirroring Trivia play and Closest.
  const stalled = publicGame?.deadlineAt !== undefined && Date.now() > publicGame.deadlineAt;
  const onSkip = stalled && isHostOrCohost ? () => { void post(`/rooms/${roomId}/games/${game.id}/skip`, {}); } : undefined;
  const abstainedNow = game.abstained === true || st.myAbstained === true;
  const allDone = events.length > 0 && events.every((e) => myGuesses[e.id] !== undefined);
  const done = abstainedNow || allDone;

  if (!current) {
    return (
      <PhoneScreen label={title}>
        <p className="mz-kicker">{title}</p>
        <div className="mz-card"><p className="mz-muted">Waiting for the events to load…</p></div>
      </PhoneScreen>
    );
  }

  if (done) {
    // All eight guessed, or sat the whole game out: confirmation plus
    // the shared waiting ring (counts only, host skip when stalled).
    return (
      <PhoneScreen label={title}>
        <p className="mz-kicker">{title}</p>
        <div className="mz-card">
          <p data-testid="mz-year-guessed">{abstainedNow ? "You sat this game out — 0 points for what you skipped." : `All 8 events guessed. Your last guess: ${myGuesses[current.id]}`}</p>
        </div>
        {abstainedNow && <div style={{ padding: "0 16px 16px" }}><AbstainControl abstained={true} onAbstain={() => {}} /></div>}
        <MchezoWaiting label={abstainedNow ? "You sat this one out" : "All your guesses are in"} players={players} playerId={playerId} publicGame={publicGame} stalled={stalled} isHostOrCohost={isHostOrCohost} onSkip={onSkip} footNote="When everyone is done, results appear automatically." />
      </PhoneScreen>
    );
  }

  const guessed = myGuesses[current.id];
  return (
    <PhoneScreen label={title}>
      <p className="mz-kicker">{title}</p>
      <div className="mz-card">
        <p className="mz-muted" data-testid="mz-year-progress">Event {idx + 1} of {events.length}</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }} role="group" aria-label="Events">
          {events.map((e, i) => (
            <button
              key={e.id}
              type="button"
              data-testid={`mz-year-q${i}`}
              aria-label={`Event ${i + 1}: ${e.event}${myGuesses[e.id] !== undefined ? ` — guessed ${myGuesses[e.id]}` : ""}`}
              aria-current={i === idx ? "true" : undefined}
              onClick={() => setIdx(i)}
              style={{ minWidth: 40, minHeight: 40, borderRadius: 999, border: i === idx ? "2px solid currentColor" : "1px solid currentColor", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" }}
            >
              {myGuesses[e.id] !== undefined ? "✓" : i + 1}
            </button>
          ))}
        </div>
        <p data-testid="mz-year-event"><b>{current.event}</b></p>
        {guessed !== undefined ? (
          <p data-testid="mz-year-guessed">Guessed: {guessed} — pick another event above, or wait for everyone.</p>
        ) : (
          <NumericGuess
            key={current.id}
            min={1896}
            max={2025}
            initial={2000}
            dialAriaLabel="Year timeline"
            numberPlaceholder="Year"
            submitLabel="Submit year"
            hint="Drag the timeline, or type a year — both work."
            onSubmit={(v) => intent(game.id, "year-guess", { eventId: current.id, value: v })}
          />
        )}
      </div>
      {!abstainedNow && <div style={{ padding: "0 16px 16px" }}>
        <AbstainControl abstained={false} onAbstain={() => intent(game.id, "abstain", {})} />
      </div>}
    </PhoneScreen>
  );
}
