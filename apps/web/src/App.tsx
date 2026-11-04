import { useCallback, useEffect, useRef, useState } from "react";
import type { JoinResponse, LedgerEvent, MemoryEntry, PlayerGame, Projection, PublicPlayer, RegistryGame } from "./types.js";
import { GamePanel } from "./components/GamePanel.js";
import { ChampionshipView } from "./components/ChampionshipView.js";
import { MemoryBookView } from "./components/MemoryBookView.js";
import { LivingLobby } from "./components/LivingLobby.js";
import { Reactions } from "./components/Reactions.js";
import { ShowIntro, ShowResults, ShowWaiting } from "./components/ShowMode.js";
import { SettingsBar, useExperienceSettings } from "./components/SettingsBar.js";
import { deriveShowPhase } from "./components/showPhase.js";
import QRCode from "qrcode";

const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = sessionStorage.getItem("cgn_token");
  if (token) headers["x-session-token"] = token;
  const r = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}
async function get<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = sessionStorage.getItem("cgn_token");
  if (token) headers["x-session-token"] = token;
  const r = await fetch(path, { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}
function midrank(scores: Record<string, number>): Record<string, number> {
  const entries = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  const out: Record<string, number> = {};
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1][1] === entries[i][1]) j++;
    const pct = entries.length === 1 ? 100 : ((i + j) / 2 / (entries.length - 1)) * 100;
    for (let k = i; k <= j; k++) out[entries[k][0]] = Math.round(pct * 100) / 100;
    i = j + 1;
  }
  return out;
}

export function App() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [roomId, setRoomId] = useState<string | null>(sessionStorage.getItem("cgn_roomId"));
  const [playerId, setPlayerId] = useState<string | null>(sessionStorage.getItem("cgn_playerId"));
  const [token, setToken] = useState<string | null>(sessionStorage.getItem("cgn_token"));
  const [proj, setProj] = useState<Projection | null>(null);
  const [games, setGames] = useState<RegistryGame[]>([]);
  const [view, setView] = useState<"lobby" | "championship" | "tv" | "memory">("lobby");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [book, setBook] = useState<MemoryEntry[]>([]);
  const [ledger, setLedger] = useState<LedgerEvent[]>([]);
  const [qrUrl, setQrUrl] = useState("");
  const [bookText, setBookText] = useState("");
  const [exportText, setExportText] = useState("");
  const [textInput, setTextInput] = useState("");
  const [introDismissed, setIntroDismissed] = useState<string | null>(sessionStorage.getItem("cgn_intro_dismissed"));
  const [resultsDismissed, setResultsDismissed] = useState<string | null>(sessionStorage.getItem("cgn_results_dismissed"));
  const settings = useExperienceSettings();
  const [numInput, setNumInput] = useState("");
  const [selectedTiles, setSelectedTiles] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId || !playerId) return;
    try { setProj(await get<Projection>(`/rooms/${roomId}/projection?audience=player`)); } catch { /* poll retry */ }
  }, [roomId, playerId]);

  useEffect(() => { get<RegistryGame[]>("/games").then(setGames).catch(() => {}); }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const c = params.get("code") ?? params.get("joinCode");
    if (c) setCode(c.toUpperCase());
  }, []);
  useEffect(() => {
    if (!roomId || !playerId) return;
    refresh();
    const t = setInterval(refresh, 2000);
    try {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${proto}://${location.host}/?roomId=${roomId}&audience=player`;
      // Session token travels in the WebSocket subprotocol header, never in the URL.
      const ws = token ? new WebSocket(wsUrl, [`cgn-session-${token}`]) : new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.kind === "projection") setProj(m.state); } catch { /* ignore malformed WS frame; polling continues */ } };
    } catch { /* ignore WS setup failure; polling continues */ }
    return () => { clearInterval(t); wsRef.current?.close(); };
  }, [roomId, playerId, refresh]);

  async function saveSession(r: JoinResponse) {
    sessionStorage.setItem("cgn_roomId", r.roomId); sessionStorage.setItem("cgn_playerId", r.playerId); sessionStorage.setItem("cgn_token", r.recoveryToken);
    setRoomId(r.roomId); setPlayerId(r.playerId); setToken(r.recoveryToken); setView("lobby");
  }
  async function createRoom() {
    setErr(""); try {
      const r = await post<JoinResponse>("/rooms", { name: "Christmas Game Night" });
      const j = await post<JoinResponse>(`/rooms/${r.roomId}/join`, { displayName: name || "Player 1", asHost: true, hostClaimToken: r.hostClaimToken });
      await saveSession({ ...j, roomId: r.roomId }); setMsg(`Room created. Code: ${r.joinCode}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function joinRoom() {
    setErr(""); try {
      const j = await post<JoinResponse>("/rooms/join-by-code", { joinCode: code, displayName: name || "Player" });
      await saveSession(j); setMsg("Joined room.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function reconnect() {
    setErr(""); try {
      if (!roomId || !playerId || !token) return;
      await post<Record<string, unknown>>(`/rooms/${roomId}/reconnect`, { playerId, recoveryToken: token }); await refresh(); setMsg("Reconnected to your player slot.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function startGame(gameId: string, official: boolean) {
    setErr(""); try { await post<Record<string, unknown>>(`/rooms/${roomId}/games`, { gameId, official }); await refresh(); setView("lobby"); } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function intent(gameInstanceId: string, action: string, payload: Record<string, unknown>) {
    setErr(""); try {
      const r = await post<{ accepted: boolean; reason?: string }>(`/rooms/${roomId}/intents`, { intent: { kind: "intent", schemaVersion: 1, clientEventId: uuid(), roomId, gameInstanceId, action, payload } });
      if (!r.accepted) setErr(`Not accepted: ${r.reason || "unknown"}`); else setMsg("Saved.");
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function loadMemory() {
    try { setBook(await get<MemoryEntry[]>(`/rooms/${roomId}/memory`)); setLedger(await get<LedgerEvent[]>(`/rooms/${roomId}/ledger`)); } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  useEffect(() => { if (view === "memory" && roomId) loadMemory(); }, [view, roomId]);
  useEffect(() => {
    if (!proj?.joinCode) return;
    const url = `${location.origin}/?code=${proj.joinCode}`;
    QRCode.toDataURL(url, { width: 220, margin: 2 }).then(setQrUrl).catch(() => {});
  }, [proj?.joinCode]);

  if (!roomId || !playerId) {
    return <div className="wrap"><header><h1>🎄 Christmas Game Night</h1></header>
      <div className="card"><h2>Join the family game night</h2>
        <p className="muted">No account needed. Three steps and you are playing.</p>
        <p><b>Step 1 — Your name.</b> This is how everyone sees you.</p>
        <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada" /></label>
        <p><b>Step 2 — Join a room, or create one.</b> Joining needs the 6-letter code from the host. Creating makes you the host.</p>
        <label>Room code (only if joining)<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. K7M2Q9" /></label>
        {!name && <p className="muted">Enter your name first — then both buttons work.</p>}
        <div className="row"><button onClick={joinRoom} disabled={!code || !name}>Join room</button><button className="secondary" onClick={createRoom} disabled={!name}>Create a room (host)</button></div>
        {err && <p className="err">{err}</p>}{msg && <p className="ok">{msg}</p>}
      </div>
      <div className="card"><h2>How it works</h2><p>Host starts a game from the lobby. Everyone plays on their own phone, the TV view shows only public scores, and the Memory Book only records results from real games.</p></div>
    </div>;
  }

  const players: PublicPlayer[] = proj?.players ?? [];
  const myGames: PlayerGame[] = proj?.myGames ?? [];
  const me = players.find((p) => p.id === playerId);
  const finished = (proj?.games ?? []).filter((g) => g.status === "finished");
  const officialFinished = finished.filter((g) => g.official && !g.timedOut);
  const serverStandings = proj?.officialStandings;
  const standings: Record<string, number> = serverStandings ?? (() => {
    const out: Record<string, number> = {};
    for (const g of officialFinished) { const m = midrank(g.rawScores ?? {}); for (const [pid, v] of Object.entries(m)) out[pid] = (out[pid] ?? 0) + (v as number); }
    return out;
  })();
  const nameOf = (id: string): string => players.find((p) => p.id === id)?.displayName ?? id;
  const playingGame = myGames.find((g) => g.status === "playing");
  const latestFinished = myGames.filter((g) => g.status === "finished").slice(-1)[0];
  const publicPlaying = (proj?.games ?? []).find((g) => g.id === playingGame?.id);
  const publicFinished = (proj?.games ?? []).find((g) => g.id === latestFinished?.id);
  const showPhase = view === "lobby" ? deriveShowPhase(playingGame, latestFinished, introDismissed, resultsDismissed, playerId ?? undefined) : "lobby";
  // Precomputed outside the lobby fragment so TS aliased-condition narrowing
  // on the lobby branch cannot narrow showPhase itself inside that fragment.
  const isLobbyPhase = showPhase === "lobby";
  const showGamePanel = (showPhase === "gameplay" || showPhase === "waiting") && !!playingGame;
  function dismissIntro(id: string) { sessionStorage.setItem("cgn_intro_dismissed", id); setIntroDismissed(id); }
  function dismissResults(id: string) { sessionStorage.setItem("cgn_results_dismissed", id); setResultsDismissed(id); }

  return <div className={`wrap anim-${settings.anim}`}>
    <header><h1>🎄 Christmas Game Night</h1><span className="pill">Code: {proj?.joinCode ?? "…"}</span></header>
    <p className="muted">Playing as <b>{me?.displayName ?? "…"}</b>{me?.isHost ? " (host)" : ""} · Room: {proj?.name ?? ""}</p>
    <div className="row">
      <button className="secondary" onClick={() => setView("lobby")}>Lobby &amp; Games</button>
      <button className="secondary" onClick={() => setView("championship")}>Championship</button>
      <button className="secondary" onClick={() => setView("tv")}>TV Dashboard</button>
      <button className="secondary" onClick={() => setView("memory")}>Memory Book</button>
      <button className="secondary" onClick={reconnect}>Reconnect</button>
    </div>
    {err && <p className="err">{err}</p>}{msg && <p className="ok">{msg}</p>}

    {view === "lobby" && showPhase === "intro" && playingGame && <ShowIntro game={playingGame} title={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId} tutorial={games.find((x) => x.id === playingGame.gameId)?.tutorial ?? ""} onStart={() => dismissIntro(playingGame.id)} />}
    {view === "lobby" && showPhase === "waiting" && playingGame && publicPlaying && <>
      <ShowWaiting game={publicPlaying} title={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId} isHostOrCohost={!!(me?.isHost || me?.isCohost)} onSkip={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/games/${playingGame.id}/skip`, {}); await refresh(); }} />
      <p className="muted">The game stays visible below — when the next phase starts, this banner goes away on its own.</p>
    </>}
    {view === "lobby" && showPhase === "results" && latestFinished && <><ShowResults game={latestFinished} title={games.find((x) => x.id === latestFinished.gameId)?.title ?? latestFinished.gameId} nameOf={nameOf} games={games} official={publicFinished?.official} onBack={() => dismissResults(latestFinished.id)} /><Reactions proj={proj} post={post} canMute={!!(me?.isHost || me?.isCohost)} /></>}
      {showGamePanel && playingGame && <GamePanel game={playingGame} players={players} nameOf={nameOf} intent={intent} textInput={textInput} setTextInput={setTextInput} numInput={numInput} setNumInput={setNumInput} selectedTiles={selectedTiles} setSelectedTiles={setSelectedTiles} />}
    {view === "lobby" && isLobbyPhase && <>
      <LivingLobby players={players} myId={playerId} />
      <div className="card"><h2>Invite by QR</h2><p className="muted">Scan to join this room. The 6-character code below works too — that is the manual-code fallback.</p>
        {(location.hostname === "localhost" || location.hostname === "127.0.0.1") && <p>⚠️ This QR points to {location.origin}, which only works on this device. A phone scanning it will be sent to its own localhost and cannot join. Open the app from a LAN-reachable address (or the approved deployed domain) so the QR works, or share the 6-character code instead.</p>}
        {qrUrl && <img src={qrUrl} alt={`QR code to join room ${proj?.joinCode ?? ""}`} width={220} height={220} />}
        <p>Room code: <b>{proj?.joinCode ?? "…"}</b></p>
      </div>
      <div className="card"><h2>Players</h2>{players.map((p) => <span key={p.id} className="pill">{p.displayName}{p.isHost ? " 👑" : ""}{p.isCohost ? " ⭐" : ""}{p.connected ? "" : " (away)"}</span>)}
        {me?.isHost && players.filter((p) => p.id !== playerId).map((p) => <div key={p.id} className="row"><span>{p.displayName}</span><button className="secondary" onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/cohost`, { targetId: p.id }); await refresh(); }}>Make cohost</button></div>)}
      </div>
      <div className="card"><h2>Start a game</h2><p className="muted">The host or cohost starts games. Tutorials are shown below each game.</p>
        {games.map((g) => <div key={g.id} className="card" data-testid={`game-card-${g.id}`}><b>{g.title}</b> <span className="muted">· {g.minPlayers}–{g.maxPlayers} players · ~{g.defaultDurationMinutes} min</span>
          <p>{g.tutorial}</p><div className="row"><button data-testid={`start-official-${g.id}`} onClick={() => startGame(g.id, true)} disabled={!(me?.isHost || me?.isCohost)}>Start (official)</button><button data-testid={`start-practice-${g.id}`} className="secondary" onClick={() => startGame(g.id, false)} disabled={!(me?.isHost || me?.isCohost)}>Start (practice)</button></div></div>)}
      </div>
      {(proj?.games ?? []).filter((g) => g.status === "playing" && g.deadlineAt !== undefined && Date.now() > g.deadlineAt).map((g) => (me?.isHost || me?.isCohost) ? <div key={g.id} className="card"><p>Game {g.gameId} has passed its deadline and may be stalled.</p><button onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/games/${g.id}/skip`, {}); await refresh(); }}>Skip timed-out game (no scores invented)</button></div> : null)}
      {finished.length > 0 && <div className="card" data-testid="finished-games"><h2>Finished games</h2>{finished.map((g) => <p key={g.id}><b>{games.find((x) => x.id === g.gameId)?.title ?? g.gameId}</b> — {Object.entries(g.rawScores ?? {}).map(([pid, v]) => `${nameOf(pid)}: ${v}`).join(" · ")}</p>)}</div>}
      <SettingsBar sound={settings.sound} anim={settings.anim} onToggleSound={settings.toggleSound} onSetAnim={settings.setAnimSetting} />
      <Reactions proj={proj} post={post} canMute={!!(me?.isHost || me?.isCohost)} />
    </>}

    {view === "championship" && <ChampionshipView proj={proj} games={games} players={players} nameOf={nameOf} midrank={midrank} post={post} refresh={refresh} meIsHostOrCohost={!!(me?.isHost || me?.isCohost)} />}

    {view === "tv" && <div className="card"><h2>TV Dashboard — public only</h2><p className="muted">This view never shows answer keys, secret words, or other players' prompts.</p>
      <p>Room code: <b>{proj?.joinCode}</b></p><p>Players: {players.map((p) => p.displayName).join(", ")}</p>
      <h3>Standings (Family Cup totals)</h3>{(proj?.championship ?? []).map((r) => <p key={r.playerId}>{nameOf(r.playerId)}: {r.total} points{r.eligible ? "" : " (not yet qualified)"}</p>)}
      {(proj?.championship ?? []).length === 0 && Object.entries(standings).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([pid, v]) => <p key={pid}>{nameOf(pid)}: {v}</p>)}
      <h3>Now playing</h3>{(proj?.games ?? []).filter((g) => g.status === "playing").map((g) => <p key={g.id}>{games.find((x) => x.id === g.gameId)?.title ?? g.gameId} — players: {g.players.map(nameOf).join(", ")}</p>)}
      {(proj?.games ?? []).filter((g) => g.status === "playing").length === 0 && <p className="muted">No game in progress — the lobby is choosing the next game.</p>}
      {proj?.ceremony?.winner && <p>🏆 Day {proj.ceremony.day} winner: <b>{proj.ceremony.winner}</b></p>}
      <h3>Recent games</h3>{(proj?.games ?? []).slice(-5).map((g) => <p key={g.id}>{g.gameId} — {g.status}{g.rawScores ? ` — ${Object.entries(g.rawScores).map(([pid, v]) => `${nameOf(pid)}: ${v}`).join(" · ")}` : ""}</p>)}
      <Reactions proj={proj} post={post} canMute={false} />
    </div>}

    {view === "memory" && <MemoryBookView roomId={roomId} book={book} ledger={ledger} bookText={bookText} setBookText={setBookText} exportText={exportText} setExportText={setExportText} post={post} get={get} loadMemory={loadMemory} canApprove={!!(me?.isHost || me?.isCohost)} />}
  </div>;
}
