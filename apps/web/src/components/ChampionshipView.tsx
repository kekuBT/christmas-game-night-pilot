import { useEffect, useState } from "react";
import type { Achievement, Ceremony, ChampionshipResult, LedgerEvent, Projection, PublicGame, PublicPlayer, RegistryGame } from "../types.js";

export type PostFn = <T>(path: string, body: Record<string, unknown>) => Promise<T>;

export function ChampionshipView(props: {
  proj: Projection | null;
  games: RegistryGame[];
  players: PublicPlayer[];
  nameOf: (id: string) => string;
  midrank: (scores: Record<string, number>) => Record<string, number>;
  post: PostFn;
  refresh: () => Promise<void>;
  meIsHostOrCohost: boolean;
}) {
  const { proj, games, players, nameOf, midrank, post, refresh, meIsHostOrCohost } = props;
  const [overrideGameId, setOverrideGameId] = useState("");
  const [overridePlayerId, setOverridePlayerId] = useState("");
  const [overridePoints, setOverridePoints] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [audit, setAudit] = useState<LedgerEvent[]>([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const finished: PublicGame[] = (proj?.games ?? []).filter((g) => g.status === "finished");
  const officialFinished = finished.filter((g) => g.official && !g.timedOut);
  const championship: ChampionshipResult[] = proj?.championship ?? [];
  const achievements: Achievement[] = proj?.achievements ?? [];
  const ceremony: Ceremony | undefined = proj?.ceremony;
  const serverStandings = proj?.officialStandings ?? {};
  const roomId = proj?.roomId ?? "";

  async function loadAudit() {
    try {
      const ledger = await fetch(`/rooms/${roomId}/ledger`, { headers: { "x-session-token": sessionStorage.getItem("cgn_token") ?? "" } }).then((r) => r.json());
      setAudit((ledger as LedgerEvent[]).filter((e) => e.type === "score-override"));
      setAuditLoaded(true);
    } catch { /* audit is best-effort; standings remain authoritative */ }
  }
  useEffect(() => { if (!auditLoaded && roomId) { void loadAudit(); } }, [auditLoaded, roomId]);

  return <div className="card"><h2>Championship standings</h2>
    <p className="muted">Family Cup rules, owner-approved 2026-11-04: seven scheduled days, at least three qualifying days to be eligible, and the total is <b>best three daily scores + participation bonus + finale bonus</b>. Each day is 75% individual + 25% team, with individual games normalised 0–100 by placement (ties share the average rank). Participation is +5 for each qualifying day beyond the first three, capped at +20. The Grand Finale can add up to 50 points. Practice games never count toward scores or attendance, and missing days add nothing — they do not reduce the best-three total. Three details are still configurable and not yet approved in detail: the precise qualifying-day threshold, how days without team games are handled, and the Grand Finale placement ladder.</p>
    <p>Championship day: <b>{proj?.championshipDay ?? 1}</b> {meIsHostOrCohost && <button className="secondary" onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/day`, {}); await refresh(); }}>Advance to next day</button>}</p>
    {championship.length === 0 && <p>No finished official games yet.</p>}
    {championship.map((r) => <p key={r.playerId}><b>{nameOf(r.playerId)}</b>: {r.total} points total = best three {r.counted.join(" + ")} = {r.base}, plus participation +{r.participationBonus} and finale +{r.finaleBonus}{r.eligible ? "" : " (not yet qualified — needs 3 qualifying days)"} · {r.qualifyingDays} qualifying day{r.qualifyingDays === 1 ? "" : "s"} · Day scores: {r.dayScores.join(", ")} · Daily wins: {r.countedDailyWins}</p>)}
    <h3>Session standings (all official games, midrank sum)</h3>
    {Object.entries(serverStandings).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([pid, v]) => <p key={pid}>{nameOf(pid)}: {v} points</p>)}
    <h3>Per-game breakdown (official games only)</h3>{officialFinished.map((g) => <p key={g.id}><b>{games.find((x) => x.id === g.gameId)?.title ?? g.gameId}</b> ({g.gameId}, Day {g.day ?? 1}) — {Object.entries(midrank(g.rawScores ?? {})).map(([pid, v]) => `${nameOf(pid)}: ${v}`).join(" · ")}</p>)}
    <h3>🏆 End-of-day ceremony</h3>
    {ceremony && ceremony.winner ? <p>Day {ceremony.day} winner: <b>{(ceremony.winners ?? [ceremony.winner]).join(" & ")}</b> — congratulations! Add the moment to the Memory Book from the Memory Book view.</p> : <p>No ceremony yet — finish a game first.</p>}
    <h3>Achievements (from real game events only)</h3>
    {achievements.length === 0 && <p>No achievements yet.</p>}
    {achievements.map((a, i) => <p key={`${a.ruleId}-${a.playerId}-${i}`}>⭐ {a.title} — {a.ruleId === "first-game" ? "the whole room" : nameOf(a.playerId)}</p>)}
    {meIsHostOrCohost && <div className="card"><h3>Host override (audited)</h3><p className="muted">Correct a score with a reason. The old value, the new value, the reason, and who made the change are kept in the room ledger and shown below. Players can see this audit trail.</p>
      <label>Game<select value={overrideGameId} onChange={(e) => setOverrideGameId(e.target.value)}><option value="">Choose a finished game…</option>{finished.filter((g) => !g.timedOut).map((g) => <option key={g.id} value={g.id}>{games.find((x) => x.id === g.gameId)?.title ?? g.gameId} (Day {g.day ?? 1})</option>)}</select></label>
      <label>Player<select value={overridePlayerId} onChange={(e) => setOverridePlayerId(e.target.value)}><option value="">Choose a player…</option>{players.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
      <label>New points<input type="number" value={overridePoints} onChange={(e) => setOverridePoints(e.target.value)} placeholder="e.g. 100" /></label>
      <label>Reason<input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why is this score being corrected?" /></label>
      <button disabled={!overrideGameId || !overridePlayerId || overridePoints === "" || !overrideReason.trim()} onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/games/${overrideGameId}/override`, { playerId: overridePlayerId, points: Number(overridePoints), reason: overrideReason }); setOverrideReason(""); await refresh(); setAuditLoaded(false); }}>Apply override</button>
      <h4>Override audit trail</h4>
      {audit.length === 0 && <p className="muted">No overrides yet.</p>}
      {audit.map((e) => <p key={e.eventId}>{nameOf(e.actor ?? "")} changed {nameOf(e.playerId ?? "")} from {e.previousPoints} to {e.points} — “{e.reason}”</p>)}
    </div>}
  </div>;
}
