// Closest Wins in the Mchezo kit (Milestone J.3) — a component and UX
// extraction of the old GamePanel closest branch, not a gameplay
// rewrite. Intents, scoring, abstention, deadlines, permissions, and
// reconnect behavior are unchanged: guesses still submit
// "closest-guess" with a numeric value, abstention still submits
// "abstain", the host skip still posts the same endpoint after the
// deadline, and the session/reconnect flow is untouched (App-level).
//
// What changed, deliberately and disclosed:
// - The panel renders in the kit (PhoneScreen) instead of the old
//   green shell, mirroring how Trivia play bypasses the old shell.
//   Intro (ShowIntro) and finished results (ShowResults) are
//   untouched — this component covers gameplay + waiting only.
// - Inputs come from the shared NumericGuess primitive (E1: the fixed
//   game-wide range 0 to a trillion, 3 decimals, log dial, initial 50) and the shared AbstainControl primitive
//   (same button text, same abstained note). The number field is now
//   component-local instead of App-shared across games (input hygiene;
//   it starts empty per mount). An empty number field still submits 0,
//   as the old panel did.
// - The post-guess "Sit out" button is omitted in the waiting view:
//   the server always rejects post-guess abstention (ALREADY_GUESSED
//   in abstainClosest), so the old button could only error. The
//   abstain button still shows while the current question is
//   unanswered, exactly as before.
// - Abstained viewers now see the same waiting ring + host skip as
//   guessed viewers. The old panel showed abstained players no counts
//   and no skip button (the waiting banner only rendered in the
//   waiting phase, and abstention without a guess stays in gameplay
//   phase). Counts are public, and skip still requires host +
//   deadline + playing status, server-enforced — so this is a UI
//   consistency fix, not a rule change.
// - GamePanel's closest branch is now dead (App routes closest here
//   first), left in place like Trivia's dead quiz branch — a future
//   cleanup removes dead branches as more games migrate.
import { AbstainControl, MchezoWaiting, NumericGuess, PhoneScreen } from "../../ui/mchezo/index.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";
import { formatNumeric } from "../../../../../src/shared/numericInput.js";

export interface MchezoClosestDeps {
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

export function MchezoClosest(deps: MchezoClosestDeps) {
  const { game, publicGame, players, playerId, intent, title } = deps;
  const st = (game.state ?? {}) as { prompt?: string; unit?: string; myGuess?: number; myAbstained?: boolean };
  // Sprint 3: no host skip here. The server ends the game at its deadline
  // by itself; the waiting view shows the countdown (GameClock).
  const done = st.myGuess !== undefined || st.myAbstained === true;
  const abstainedNow = game.abstained === true || st.myAbstained === true;

  if (done) {
    // Guessed or abstained on the current question: confirmation plus
    // the shared waiting ring (counts only, deadline countdown).
    // A guessed player gets no abstain button here — post-guess
    // abstention is server-rejected (ALREADY_GUESSED), so the old
    // button could only error.
    return (
      <PhoneScreen label={title}>
        <p className="mz-kicker">{title}</p>
        <div className="mz-card">
          <p><b>{st.prompt}</b>{st.unit ? ` (${st.unit})` : ""}</p>
          <p>{st.myAbstained ? "Abstained on this question." : `Your guess: ${formatNumeric(st.myGuess ?? 0)}`}</p>
        </div>
        {abstainedNow && <div style={{ padding: "0 16px 16px" }}><AbstainControl abstained={true} onAbstain={() => {}} /></div>}
        <MchezoWaiting label={abstainedNow ? "You sat this one out" : "Your guess is in"} players={players} playerId={playerId} publicGame={publicGame} footNote="When everyone is done, results appear automatically." />
      </PhoneScreen>
    );
  }

  // Current question unanswered and not abstained: guess controls plus
  // the shared sit-out button (same intents as the old panel).
  return (
    <PhoneScreen label={title}>
      <p className="mz-kicker">{title}</p>
      <div className="mz-card">
        <p><b>{st.prompt}</b>{st.unit ? ` (${st.unit})` : ""}</p>
        <NumericGuess
          game="closest-wins"
          initial={50}
          dialAriaLabel="Guess dial"
          fieldLabel="Your guess"
          submitLabel="Submit guess"
          hint="Type your number (decimals are fine), or turn the dial."
          onSubmit={(v) => intent(game.id, "closest-guess", { value: v })}
        />
      </div>
      <div style={{ padding: "0 16px 16px" }}>
        <AbstainControl abstained={false} onAbstain={() => intent(game.id, "abstain", {})} />
      </div>
    </PhoneScreen>
  );
}
