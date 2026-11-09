// Family Cup (Stage 4, S3-CUP-01): what players want first, rules on demand.
//
//   1. The Cup and the day (Day 2 of 7, with the seven days drawn).
//   2. The standings, straight from the server, or an honest empty state.
//   3. Progress: the official games played, with each game's placements.
//   4. What happens next (a day winner, or what has to happen for points).
//   5. How the Family Cup works (folded away).
//   6. Host tools, separate, for the host and cohost only.
//
// Nothing is computed here that the server didn't already decide: the
// standings, their order, eligibility, day scores and bonuses are the
// projection's (`championship`, ordered by the server). The per-game
// placements use the same midrank display helper as before. No trends,
// probabilities or invented achievements; no numbers before an official game.
import { useEffect, useState } from "react";
import type { Achievement, Ceremony, ChampionshipResult, LedgerEvent, Projection, PublicGame, PublicPlayer, RegistryGame } from "../../types.js";
import { seats } from "../../session.js";
import { ConfirmPanel, PlayerToken } from "../../ui/mchezo/index.js";
import { toMzPlayers } from "./adapters.js";

/** The Cup has exactly seven days (server: RoomEngine.advanceDay). */
export const CUP_DAYS = 7;
const QUALIFYING_DAYS_NEEDED = 3;

export type PostFn = <T>(path: string, body: Record<string, unknown>) => Promise<T>;

export function CupScreen(props: {
  proj: Projection | null;
  games: RegistryGame[];
  players: PublicPlayer[];
  youId: string;
  nameOf: (id: string) => string;
  midrank: (scores: Record<string, number>) => Record<string, number>;
  post: PostFn;
  refresh: () => Promise<void>;
  meIsHostOrCohost: boolean;
  onBack: () => void;
  onMenu: () => void;
}) {
  const { proj, games, players, youId, nameOf, midrank, post, refresh, meIsHostOrCohost, onBack, onMenu } = props;
  const [overrideGameId, setOverrideGameId] = useState("");
  const [overridePlayerId, setOverridePlayerId] = useState("");
  const [overridePoints, setOverridePoints] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideMsg, setOverrideMsg] = useState("");
  const [audit, setAudit] = useState<LedgerEvent[]>([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  // Advancing the day is one-way on the server (no undo): confirm first (audit F5).
  const [confirmDay, setConfirmDay] = useState(false);
  const [dayError, setDayError] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const roomId = proj?.roomId ?? "";
  const day = proj?.championshipDay ?? 1;
  const finished: PublicGame[] = (proj?.games ?? []).filter((g) => g.status === "finished");
  // The server says which games count (outcome-aware since Sprint 3); legacy games keep the old rule.
  const officialFinished = finished.filter((g) => g.countsOfficially ?? (g.official && !g.timedOut));
  const today = officialFinished.filter((g) => (g.day ?? 1) === day);
  const championship: ChampionshipResult[] = proj?.championship ?? [];
  const achievements: Achievement[] = proj?.achievements ?? [];
  const ceremony: Ceremony | undefined = proj?.ceremony;
  const mz = toMzPlayers(players);
  const title = (id: string) => games.find((x) => x.id === id)?.title ?? id;
  const eligible = championship.filter((r) => r.eligible);
  const qualifying = championship.filter((r) => !r.eligible);

  async function loadAudit() {
    try {
      const ledger = await fetch(`/rooms/${roomId}/ledger`, { headers: { "x-session-token": seats.token() ?? "" } }).then((r) => r.json());
      setAudit((ledger as LedgerEvent[]).filter((e) => e.type === "score-override"));
      setAuditLoaded(true);
    } catch { /* audit is best-effort; standings remain authoritative */ }
  }
  useEffect(() => { if (meIsHostOrCohost && !auditLoaded && roomId) { void loadAudit(); } }, [meIsHostOrCohost, auditLoaded, roomId]);

  const row = (r: ChampionshipResult, position: number | null) => {
    const p = mz.find((x) => x.id === r.playerId);
    const open = openRow === r.playerId;
    const needs = Math.max(0, QUALIFYING_DAYS_NEEDED - r.qualifyingDays);
    return (
      <li key={r.playerId} className={`mz-cup-row${r.playerId === youId ? " mz-cup-row--you" : ""}`} data-testid={`cup-row-${r.playerId}`}>
        <div className="mz-cup-row__main">
          <span className="mz-cup-row__rank" aria-label={position ? `Place ${position}` : "Not yet ranked"}>{position ?? "–"}</span>
          {p && <PlayerToken player={p} index={mz.indexOf(p)} size={32} />}
          <span className="mz-cup-row__name">{r.playerId === youId ? `${nameOf(r.playerId)} (you)` : nameOf(r.playerId)}</span>
          <span className="mz-cup-row__total"><b>{r.total}</b> pts</span>
        </div>
        <p className="mz-cup-row__status">
          {r.eligible ? "Qualified" : `Needs ${needs} more qualifying day${needs === 1 ? "" : "s"}`} · {r.qualifyingDays} qualifying day{r.qualifyingDays === 1 ? "" : "s"}
          {" "}<button type="button" className="mz-linkbtn mz-cup-row__how" aria-expanded={open} onClick={() => setOpenRow(open ? null : r.playerId)}>{open ? "Hide" : "How it adds up"}</button>
        </p>
        {open && (
          <p className="mz-foot mz-cup-row__detail" data-testid={`cup-detail-${r.playerId}`}>
            Best three days {r.counted.length ? r.counted.join(" + ") : "0"} = {r.base}, participation +{r.participationBonus}, finale +{r.finaleBonus} = {r.total}. Day scores so far: {r.dayScores.join(", ") || "none"}. Day wins: {r.countedDailyWins}.
          </p>
        )}
      </li>
    );
  };

  return (
    <main className="mz-screen mz-screen--wide mz-cupscreen" aria-label="Family Cup" data-testid="cup-screen">
      <header className="mz-appbar">
        <button type="button" className="mz-iconbtn" aria-label="Back to lobby" data-testid="cup-back" onClick={onBack}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="mz-appbar__title">Family Cup</h1>
        <button type="button" className="mz-iconbtn" aria-label="Room menu" aria-haspopup="dialog" data-testid="room-menu" onClick={onMenu}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
        </button>
      </header>

      {/* 1. The Cup and the day. */}
      <section className="mz-cup-hero" aria-label="Cup progress" data-testid="cup-hero">
        <span className="mz-kicker">{proj?.competition?.label ?? "Family Cup"}</span>
        <p className="mz-cup-hero__day" data-testid="cup-day">Day {day} of {CUP_DAYS}</p>
        <ol className="mz-cup-days" aria-label={`Day ${day} of ${CUP_DAYS}`}>
          {Array.from({ length: CUP_DAYS }, (_, i) => (
            <li key={i} className={`mz-cup-days__dot${i + 1 < day ? " mz-cup-days__dot--done" : i + 1 === day ? " mz-cup-days__dot--now" : ""}`} aria-hidden="true" />
          ))}
        </ol>
        <p className="mz-foot mz-cup-hero__games" data-testid="cup-games-count">
          {officialFinished.length === 0 ? "No official games yet." : `${officialFinished.length} official game${officialFinished.length === 1 ? "" : "s"} so far · ${today.length} today`}
        </p>
      </section>
      {proj?.competition?.standingsPaused && <p className="err" role="alert" data-testid="standings-paused">{proj.competition.standingsPaused}</p>}

      {/* 2. The standings. */}
      <section className="mz-cup-section" aria-labelledby="cup-standings-title" data-testid="cup-standings">
        <h2 className="mz-cup-section__title" id="cup-standings-title">Championship standings</h2>
        {championship.length === 0 ? (
          <div className="mz-card mz-cup-empty" data-testid="cup-empty">
            <p className="mz-cup-empty__title">No standings yet</p>
            <p className="mz-foot">They appear after the first <b>official</b> game with 2 or more players finishes. Practice games never count.</p>
          </div>
        ) : (
          <>
            {eligible.length > 0 && <ol className="mz-cup-list" aria-label="Qualified players">{eligible.map((r, i) => row(r, i + 1))}</ol>}
            {qualifying.length > 0 && (
              <>
                {eligible.length > 0 && <p className="mz-kicker mz-cup-list__sub">Still qualifying</p>}
                <ol className="mz-cup-list" aria-label={eligible.length ? "Still qualifying" : "Standings"}>{qualifying.map((r, i) => row(r, eligible.length ? null : i + 1))}</ol>
                <p className="mz-foot mz-cup-note">A player needs {QUALIFYING_DAYS_NEEDED} qualifying days to be eligible for the Cup. Order comes from the server; ties are broken by day wins.</p>
              </>
            )}
          </>
        )}
      </section>

      {/* 3. Progress. */}
      {officialFinished.length > 0 && (
        <section className="mz-cup-section" aria-labelledby="cup-games-title" data-testid="cup-games">
          <h2 className="mz-cup-section__title" id="cup-games-title">Official games so far</h2>
          <ul className="mz-cup-games">
            {officialFinished.map((g) => {
              const places = Object.entries(midrank(g.rawScores ?? {})).sort((a, b) => b[1] - a[1]);
              return (
                <li key={g.id} className="mz-cup-game">
                  <span className="mz-cup-game__title">{title(g.gameId)} <span className="mz-muted">· Day {g.day ?? 1}</span></span>
                  <span className="mz-foot mz-cup-game__places">{places.length >= 2 ? places.map(([pid, v]) => `${nameOf(pid)} ${v}`).join(" · ") : "Not counted (fewer than 2 players)"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mz-foot mz-cup-note">Placement points: 100 for the top, 0 for the bottom, shared on ties. A day's score is the average of that day's placements.</p>
        </section>
      )}

      {/* 4. What's next. */}
      <section className="mz-cup-section" aria-label="What's next" data-testid="cup-next">
        {ceremony?.winner ? (
          <div className="mz-card mz-cup-winner"><span aria-hidden="true">🏆</span> Day {ceremony.day} winner: <b>{(ceremony.winners ?? [ceremony.winner]).join(" & ")}</b></div>
        ) : (
          <p className="mz-foot mz-cup-next">{officialFinished.length === 0 ? `Next: ${meIsHostOrCohost ? "start" : "the host starts"} an official game with 2 or more players.` : "Next: another official game today adds to everyone's day score."}</p>
        )}
        {achievements.length > 0 && (
          <ul className="mz-cup-moments" aria-label="Moments (from real game events)">
            {achievements.map((a, i) => <li key={`${a.ruleId}-${a.playerId}-${i}`} className="mz-chip">⭐ {a.title} · {a.ruleId === "first-game" ? "the whole room" : nameOf(a.playerId)}</li>)}
          </ul>
        )}
      </section>

      {/* 5. Rules, on demand. */}
      <details className="mz-cup-rules" data-testid="cup-rules">
        <summary className="mz-cup-rules__summary">How the Family Cup works</summary>
        {proj?.competition && <p data-testid="competition-format"><b>{proj.competition.label}:</b> {proj.competition.description} The rules of a Cup never change once it has started.</p>}
        {proj?.competition?.qualifying && <p data-testid="competition-qualifying"><b>Qualifying days:</b> {proj.competition.qualifying}</p>}
        <p>Seven scheduled days. At least three qualifying days to be eligible. The total is <b>the best three daily scores + a participation bonus + a finale bonus</b>.</p>
        <p>{proj?.competition?.format === "individual-only" ? "Each day is the average of your individual game placements (team games don’t count)." : "Each day is 75% individual + 25% team."} Individual games are scored 0–100 by placement; ties share the average place.</p>
        <p>Participation: +5 for each qualifying day beyond the first three, up to +20. The Grand Finale can add up to 50. Practice games never count toward scores or attendance, and a missed day adds nothing without lowering the best three.</p>
        <p className="mz-foot">Family Cup rules, owner-approved 2026-11-04. Still to be approved in detail: how days without team games are handled in combined Cups, and the Grand Finale placement ladder.</p>
      </details>

      {/* 6. Host tools: host and cohost only. */}
      {meIsHostOrCohost && (
        <section className="mz-card mz-cup-host" aria-labelledby="cup-host-title" data-testid="cup-host-tools">
          <h2 className="mz-cup-section__title" id="cup-host-title">Host tools</h2>
          <div className="mz-cup-host__row">
            <p className="mz-foot">Championship day: <b>{day}</b> of {CUP_DAYS}</p>
            {day < CUP_DAYS && !confirmDay && <button type="button" className="mz-chip-btn" data-testid="advance-day" onClick={() => { setDayError(""); setConfirmDay(true); }}>Advance to next day</button>}
          </div>
          {confirmDay && (
            <ConfirmPanel
              testId="advance-day"
              title={`End Day ${day} and start Day ${day + 1}?`}
              confirmLabel={`Start Day ${day + 1}`}
              onCancel={() => setConfirmDay(false)}
              onConfirm={async () => {
                try {
                  await post<Record<string, unknown>>(`/rooms/${roomId}/day`, {});
                  setConfirmDay(false);
                  await refresh();
                } catch (e) {
                  setConfirmDay(false);
                  setDayError(e instanceof Error ? e.message : "The day could not be advanced.");
                }
              }}
            >
              Day {day} closes for good: it can’t be reopened, and its scores stay as they are. Games started after this count for Day {day + 1}.
            </ConfirmPanel>
          )}
          {dayError && <p className="err" role="alert" data-testid="advance-day-error">{dayError}</p>}
          <details className="mz-cup-override">
            <summary>Correct a score (audited)</summary>
            <p className="mz-foot">Every correction is kept in the room ledger with the old value, the new value, the reason and who made it.</p>
            <label className="mz-field__label">Game<select className="mz-input" value={overrideGameId} onChange={(e) => setOverrideGameId(e.target.value)}><option value="">Choose a finished game…</option>{finished.filter((g) => !g.timedOut).map((g) => <option key={g.id} value={g.id}>{title(g.gameId)} (Day {g.day ?? 1})</option>)}</select></label>
            <label className="mz-field__label">Player<select className="mz-input" value={overridePlayerId} onChange={(e) => setOverridePlayerId(e.target.value)}><option value="">Choose a player…</option>{players.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
            <label className="mz-field__label">New points<input className="mz-input" type="number" value={overridePoints} onChange={(e) => setOverridePoints(e.target.value)} placeholder="e.g. 100" /></label>
            <label className="mz-field__label">Reason<input className="mz-input" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why is this score being corrected?" /></label>
            <button type="button" className="mz-chip-btn" disabled={!overrideGameId || !overridePlayerId || overridePoints === "" || !overrideReason.trim()} onClick={async () => {
              setOverrideMsg("");
              try {
                await post<Record<string, unknown>>(`/rooms/${roomId}/games/${overrideGameId}/override`, { playerId: overridePlayerId, points: Number(overridePoints), reason: overrideReason });
                setOverrideReason(""); setOverrideMsg("Correction saved."); await refresh(); setAuditLoaded(false);
              } catch (e) { setOverrideMsg(e instanceof Error ? e.message : "The correction could not be saved."); }
            }}>Apply override</button>
            {overrideMsg && <p className="mz-foot" role="status">{overrideMsg}</p>}
            <p className="mz-kicker">Corrections so far</p>
            {audit.length === 0 && <p className="mz-foot">No corrections yet.</p>}
            {audit.map((e) => <p key={e.eventId} className="mz-foot">{nameOf(e.actor ?? "")} changed {nameOf(e.playerId ?? "")} from {e.previousPoints} to {e.points}: “{e.reason}”</p>)}
          </details>
        </section>
      )}
    </main>
  );
}
