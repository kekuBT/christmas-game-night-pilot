/**
 * D3 briefing screens (docs/ux-redesign/D3_TIMING_CONTRACT.md).
 *
 * Before play, every phone and the TV show the rules and who is ready. No
 * game clock runs and no question, role or answer exists on this device:
 * the server sends the content only when play begins. Everything here is
 * display; the server decides when play starts, refuses a stale or early
 * Start now, and cancels an unstarted briefing.
 */
import { useEffect, useState } from "react";
import type { PublicGame, PublicPlayer, RegistryGame } from "../../types.js";
import {
  briefingClock,
  briefingPeople,
  briefingRules,
  ConfirmPanel,
  formatRemaining,
  Keycap,
  needsConfirmation,
  NoticeCard,
  personStatus,
  PlayerToken,
  serverNowEstimate,
  timingLines,
  type BriefingInfo,
  type BriefingPerson,
} from "../../ui/mchezo/index.js";
import { toMzPlayers } from "./adapters.js";
import { titleFor } from "../../ui/mchezo/lib/names.js";

/** Server time, re-read every second (countdowns only; the server decides). */
function useServerNow(): number {
  const [now, setNow] = useState(() => serverNowEstimate());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNowEstimate()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export interface StartNowResult {
  ok: boolean;
  code?: string;
  error?: string;
  needsConfirmation?: string[];
}

interface CommonProps {
  game: PublicGame & { briefing?: BriefingInfo };
  registry?: RegistryGame;
  players: PublicPlayer[];
}

function Rules({ gameId, registry, tv }: { gameId: string; registry?: RegistryGame; tv?: boolean }) {
  const rules = briefingRules(gameId, registry?.tutorial ?? "");
  const timing = timingLines(registry?.lifecycle);
  return (
    <section className={`mz-card mz-brief__rules${tv ? " mz-brief__rules--tv" : ""}`} aria-labelledby="mz-brief-rules">
      <span className="mz-kicker" id="mz-brief-rules">How to play</span>
      <p className="mz-brief__objective" data-testid="briefing-objective">{rules.objective}</p>
      {rules.steps.length > 0 && <ol className="mz-brief__steps">{rules.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
      {timing.length > 0 && <ul className="mz-brief__timing" data-testid="briefing-timing">{timing.map((s) => <li key={s}>{s}</li>)}</ul>}
      <p className="mz-foot mz-brief__fair">Nobody’s clock is running yet. It starts at the same moment for everyone, once everyone is ready.</p>
    </section>
  );
}

function People({ people, allPlayers, tv }: { people: BriefingPerson[]; allPlayers: PublicPlayer[]; tv?: boolean }) {
  const mz = toMzPlayers(allPlayers);
  const readyCount = people.filter((p) => p.ready).length;
  return (
    <section className="mz-card" aria-labelledby="mz-brief-people">
      <span className="mz-kicker" id="mz-brief-people" data-testid="briefing-ready-count">Ready · {readyCount} of {people.length}</span>
      <ul className={`mz-brief__people${tv ? " mz-brief__people--tv" : ""}`} data-testid="briefing-people">
        {people.map((p) => {
          const idx = Math.max(0, allPlayers.findIndex((x) => x.id === p.id));
          const player = mz[idx] ?? { id: p.id, name: p.name };
          return (
            <li key={p.id} className="mz-brief__person" data-testid={`briefing-person-${p.id}`} data-ready={String(p.ready)} data-presence={p.presence}>
              <PlayerToken player={player} index={idx} size={tv ? 56 : 40} you={p.you} badge={p.ready ? "check" : p.presence !== "connected" ? "offline" : null} dim={!p.ready} />
              <span className="mz-brief__name">{p.name}{p.you ? " (you)" : ""}</span>
              <span className={`mz-brief__status${p.ready ? " mz-brief__status--ready" : ""}`}>{personStatus(p)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Warning({ cancelInMs }: { cancelInMs: number }) {
  return (
    <NoticeCard tone="warn" title={`This game will be cancelled in ${formatRemaining(cancelInMs)} unless it starts`} testId="briefing-warning">
      Nothing will be scored, and no questions will be used up.
    </NoticeCard>
  );
}

/** Phone: the rules, who's ready, Ready / Not ready yet, and the host's Start now and Cancel. */
export function BriefingScreen(props: CommonProps & {
  meId: string;
  isHost: boolean;
  onReady: (ready: boolean) => Promise<void>;
  onStartNow: (confirmed: string[]) => Promise<StartNowResult>;
  onCancel: () => Promise<void>;
}) {
  const { game, registry, players, meId, isHost } = props;
  const b = game.briefing!;
  const now = useServerNow();
  const clock = briefingClock(b, now);
  const people = briefingPeople(game.players, b, players, meId);
  const me = people.find((p) => p.you);
  const participant = !!me;
  const title = registry?.title ?? titleFor(game.gameId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ ids: string[]; note?: string } | null>(null);
  const [cancelAsk, setCancelAsk] = useState(false);

  async function toggleReady() {
    if (!me || busy) return;
    setBusy(true);
    setError("");
    try { await props.onReady(!me.ready); } finally { setBusy(false); }
  }

  async function startNow(confirmed: string[]) {
    setBusy(true);
    setError("");
    try {
      const r = await props.onStartNow(confirmed);
      if (r.ok) { setConfirm(null); return; }
      if (r.code === "READINESS_CHANGED" && r.needsConfirmation) {
        // Someone's readiness or connection changed: ask again with the server's list.
        setConfirm({ ids: r.needsConfirmation, note: confirmed.length > 0 || confirm ? "Something changed since you looked. Check the list again." : undefined });
        return;
      }
      setConfirm(null);
      setError(r.error ?? "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function askStartNow() {
    const need = needsConfirmation(people, meId).map((p) => p.id);
    if (need.length === 0) void startNow([]);
    else setConfirm({ ids: need });
  }

  const confirmPeople = confirm ? confirm.ids.map((id) => people.find((p) => p.id === id) ?? { id, name: "A player", ready: false, presence: "away" as const, you: false }) : [];

  return (
    <main className="mz-screen mz-brief" aria-label={`${title}: rules`} data-testid="briefing" data-game-id={game.id}>
      <div className="mz-topbar">
        <span className={`mz-brief__mode mz-brief__mode--${game.official ? "official" : "practice"}`} data-testid="briefing-mode">{game.official ? "Official · counts toward the Cup" : "Practice · no Cup points"}</span>
      </div>
      <h1 className="mz-h1">{title}</h1>
      {clock.warning && <Warning cancelInMs={clock.cancelInMs} />}
      <Rules gameId={game.gameId} registry={registry} />
      <People people={people} allPlayers={players} />
      {participant ? (
        <div className="mz-brief__me">
          <Keycap
            variant={me!.ready ? "surface" : "brand"}
            block
            aria-pressed={me!.ready}
            data-testid="briefing-ready"
            disabled={busy}
            onClick={() => void toggleReady()}
          >
            {me!.ready ? "I’m ready ✓" : "I’m ready"}
          </Keycap>
          <p className="mz-foot" data-testid="briefing-ready-help">{me!.ready ? "Need more time? Tap again to take it back. You can until the game starts." : "Read the rules, then tap when you’re ready."}</p>
        </div>
      ) : (
        <p className="mz-foot" data-testid="briefing-spectating">This game started before you joined, so you’ll play the next one.</p>
      )}
      {isHost && (
        <div className="mz-brief__host" data-testid="briefing-host">
          <span className="mz-kicker">You’re hosting</span>
          <p className="mz-foot">The game starts by itself as soon as everyone is ready.{clock.startNowInMs > 0 ? ` If someone isn’t, you can start it anyway in ${Math.ceil(clock.startNowInMs / 1000)} s.` : ""}</p>
          <div className="mz-brief__actions">
            <Keycap variant="neutral" size="md" data-testid="briefing-start-now" disabled={busy || clock.startNowInMs > 0} onClick={askStartNow}>
              {clock.startNowInMs > 0 ? `Start now (${Math.ceil(clock.startNowInMs / 1000)} s)` : "Start now"}
            </Keycap>
            <button type="button" className="mz-chip-btn" data-testid="briefing-cancel" disabled={busy} onClick={() => setCancelAsk(true)}>Cancel game</button>
          </div>
        </div>
      )}
      {error && <p className="mz-brief__error" role="alert" data-testid="briefing-error">{error}</p>}
      {confirm && (
        <ConfirmPanel
          testId="briefing-confirm"
          title={confirmPeople.length === 1 ? `${confirmPeople[0]!.name} isn’t ready. Start anyway?` : `${confirmPeople.length} people aren’t ready. Start anyway?`}
          confirmLabel="Start everyone’s clock"
          cancelLabel="Keep waiting"
          onConfirm={() => void startNow(confirm.ids)}
          onCancel={() => setConfirm(null)}
        >
          {confirm.note && <span className="mz-brief__note" data-testid="briefing-confirm-changed">{confirm.note} </span>}
          <span className="mz-brief__confirm-list" data-testid="briefing-confirm-list">
            {confirmPeople.map((p) => <span key={p.id} className="mz-brief__confirm-row" data-testid={`briefing-confirm-${p.id}`}>{p.name}: {personStatus(p).toLowerCase()}</span>)}
          </span>
          <span> Their clocks start too. They keep their seats and can still play.</span>
        </ConfirmPanel>
      )}
      {cancelAsk && (
        <ConfirmPanel
          testId="briefing-cancel-confirm"
          title={`Cancel ${title}?`}
          confirmLabel="Cancel the game"
          cancelLabel="Keep it"
          onConfirm={() => { setCancelAsk(false); setBusy(true); void props.onCancel().finally(() => setBusy(false)); }}
          onCancel={() => setCancelAsk(false)}
        >
          Nothing is scored and no questions are used up. Everyone goes back to the lobby.
        </ConfirmPanel>
      )}
    </main>
  );
}

/** TV and spectators: the same public rules, readiness and warning. No controls. */
export function BriefingTv(props: CommonProps & { joinCode?: string; onBack: () => void; backLabel: string; onBackToReady?: () => void }) {
  const { game, registry, players } = props;
  const b = game.briefing!;
  const now = useServerNow();
  const clock = briefingClock(b, now);
  const people = briefingPeople(game.players, b, players);
  const title = registry?.title ?? titleFor(game.gameId);
  return (
    <main className="mz-screen mz-brief mz-brief--tv" style={{ maxWidth: 1200 }} aria-label={`${title}: rules on the TV`} data-testid="tv-briefing" data-game-id={game.id}>
      <div className="mz-topbar">
        <span className="mz-kicker">{game.official ? "Official" : "Practice"} · {props.joinCode ?? ""}</span>
        <button type="button" className="mz-chip-btn" onClick={props.onBack}>{props.backLabel}</button>
      </div>
      <h1 className="mz-h1">{title}: get ready</h1>
      {props.onBackToReady && (
        <NoticeCard tone="info" title="You're playing in this game" testId="briefing-tv-here" action={<button type="button" className="mz-chip-btn" data-testid="briefing-tv-back" onClick={props.onBackToReady}>Back to my phone to get ready</button>}>
          The rules and your I'm ready button are on your phone view.
        </NoticeCard>
      )}
      {clock.warning && <Warning cancelInMs={clock.cancelInMs} />}
      <div className="mz-brief__tvgrid">
        <Rules gameId={game.gameId} registry={registry} tv />
        <People people={people} allPlayers={players} tv />
      </div>
    </main>
  );
}
