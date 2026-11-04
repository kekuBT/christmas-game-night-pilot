import { useCallback, useEffect, useRef, useState } from "react";
import type { JoinResponse, LedgerEvent, MemoryEntry, PlayerGame, Projection, PublicPlayer, RegistryGame } from "./types.js";
import { GamePanel } from "./components/GamePanel.js";
import { ChampionshipView } from "./components/ChampionshipView.js";
import { MemoryBookView } from "./components/MemoryBookView.js";
import { Reactions } from "./components/Reactions.js";
import { ShowIntro, ShowResults, ShowWaiting } from "./components/ShowMode.js";
import { SettingsBar, useExperienceSettings } from "./components/SettingsBar.js";
import { deriveShowPhase } from "./components/showPhase.js";
import { wsReconnectDelayMs } from "./components/wsBackoff.js";
// Mchezo "The Circle" integrated views (Phase 2: landing, lobby, Trivia, TV).
import { LandingScreen, LobbyScreen, MchezoProvider, themes } from "./ui/mchezo/index.js";
import type { ReactionId } from "./ui/mchezo/index.js";
import { MchezoTriviaIntro, MchezoTriviaPlay, MchezoTriviaResults } from "./components/mchezo/MchezoTrivia.js";
import { MchezoTvStage } from "./components/mchezo/MchezoTv.js";
import { reactionIdToEmoji, toMzPlayers, toMzReactions } from "./components/mchezo/adapters.js";
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
  // Mchezo lobby: the host-chosen "up next" game (default: Trivia, the
  // Phase 2 featured game). The lobby Start button starts this game.
  const [upNextId, setUpNextId] = useState("trivia");
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
    // WS auto-reconnect: a dropped socket used to stay dead — polling kept
    // the UI fresh, but the server had marked the player "(away)" and
    // excluded them from startGame's connected-player count until the
    // manual Reconnect button was hit. Reopen on close with capped
    // exponential backoff (see wsBackoff.ts). A 1008 close means the
    // server rejected the session/room, so do NOT retry it; polling and
    // manual reconnect remain available. Cleanup stops all retries.
    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | null = null;
    const connect = () => {
      if (stopped) return;
      try {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const wsUrl = `${proto}://${location.host}/?roomId=${roomId}&audience=player`;
        // Session token travels in the WebSocket subprotocol header, never
        // in the URL. Read it fresh each attempt, not from the effect
        // closure, so a retry after a session change uses the live token.
        const liveToken = sessionStorage.getItem("cgn_token");
        const next = liveToken ? new WebSocket(wsUrl, [`cgn-session-${liveToken}`]) : new WebSocket(wsUrl);
        ws = next;
        wsRef.current = next;
        next.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.kind === "projection") setProj(m.state); } catch { /* ignore malformed WS frame; polling continues */ } };
        next.onclose = (e) => {
          if (stopped || e.code === 1008) return;
          attempt += 1;
          retryTimer = setTimeout(connect, wsReconnectDelayMs(attempt));
        };
        // onerror needs no handler of its own: browsers fire close after
        // error, and scheduling on both would double-book retries.
      } catch {
        // WS setup failure (e.g. server briefly down): retry on backoff,
        // with polling as the fallback in the meantime.
        if (!stopped) {
          attempt += 1;
          retryTimer = setTimeout(connect, wsReconnectDelayMs(attempt));
        }
      }
    };
    connect();
    return () => {
      stopped = true;
      clearInterval(t);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
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
    return (
      <MchezoProvider theme={themes.everyday}>
        <LandingScreen
          code={code}
          onCodeChange={(c) => setCode(c)}
          name={name}
          onNameChange={setName}
          onJoin={joinRoom}
          onHost={createRoom}
          extra={
            <div style={{ padding: "0 16px 16px" }}>
              {err && <p className="err">{err}</p>}{msg && <p className="ok">{msg}</p>}
              <p className="mz-foot">No account needed. Joining needs the 6-character code from the host; creating a room makes you the host. Hosts start games from the lobby, everyone plays on their own phone, and the TV stage shows only public scores.</p>
            </div>
          }
        />
      </MchezoProvider>
    );
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

  // ---- Mchezo integrated views (Phase 2) ----
  // Everyday theme throughout: Mchezo is year-round; the Christmas Family
  // Cup is a seasonal event shown as data (below), not as the platform skin.
  const mzReducedMotion = settings.anim === "full" ? undefined : true;
  const mzPlayers = toMzPlayers(players);
  const mzReactions = toMzReactions(proj?.reactions, players);
  const mzReact = async (r: ReactionId) => {
    try { await post(`/rooms/${roomId}/reactions`, { emoji: reactionIdToEmoji(r) }); await refresh(); } catch { /* non-fatal */ }
  };
  const mzNudge = async (targetId: string) => {
    try { await post(`/rooms/${roomId}/nudge`, { targetId }); await refresh(); } catch { /* non-fatal */ }
  };
  const upNext = games.find((g) => g.id === upNextId) ?? games[0];
  const triviaPlaying = playingGame?.gameId === "trivia";
  const triviaFinished = latestFinished?.gameId === "trivia";
  const lobbyExtra = (
    <div>
      <div className="mz-card" style={{ marginTop: 12 }}>
        <span className="mz-kicker">Choose a game</span>
        <p className="mz-foot">Up next is {upNext?.title ?? "—"}. The host or cohost starts games; everyone else waits for the start.</p>
        {games.map((g) => (
          <div key={g.id} style={{ padding: "8px 0", borderTop: "1px solid var(--mz-line)" }}>
            <p style={{ margin: "4px 0" }}><b>{g.title}</b> <span className="mz-muted">· {g.minPlayers}–{g.maxPlayers} players · ~{g.defaultDurationMinutes} min</span></p>
            <p className="mz-foot" style={{ margin: "4px 0" }}>{g.tutorial}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" className="mz-chip-btn" data-testid={`start-official-${g.id}`} onClick={() => startGame(g.id, true)} disabled={!(me?.isHost || me?.isCohost)}>Start (official)</button>
              <button type="button" className="mz-chip-btn" data-testid={`start-practice-${g.id}`} onClick={() => startGame(g.id, false)} disabled={!(me?.isHost || me?.isCohost)}>Start (practice)</button>
              {(me?.isHost || me?.isCohost) && <button type="button" className="mz-chip-btn" onClick={() => setUpNextId(g.id)}>Set as up next</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="mz-card" style={{ marginTop: 12 }}>
        <span className="mz-kicker">Invite by QR</span>
        <p className="mz-foot">Scan to join this room. The 6-character code below works too — that is the manual-code fallback.</p>
        {(location.hostname === "localhost" || location.hostname === "127.0.0.1") && <p>⚠️ This QR points to {location.origin}, which only works on this device. A phone scanning it will be sent to its own localhost and cannot join. Open the app from a LAN-reachable address (or the approved deployed domain) so the QR works, or share the 6-character code instead.</p>}
        {qrUrl && <img src={qrUrl} alt={`QR code to join room ${proj?.joinCode ?? ""}`} width={220} height={220} />}
        <p>Room code: <b>{proj?.joinCode ?? "…"}</b></p>
      </div>
      {(me?.isHost || me?.isCohost) && players.filter((p) => p.id !== playerId).length > 0 && (
        <div className="mz-card" style={{ marginTop: 12 }}>
          <span className="mz-kicker">Cohost</span>
          {players.filter((p) => p.id !== playerId).map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
              <span>{p.displayName}</span>
              <button type="button" className="mz-chip-btn" onClick={async () => { await post<Record<string, unknown>>(`/rooms/${roomId}/cohost`, { targetId: p.id }); await refresh(); }}>Make cohost</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button type="button" className="mz-chip-btn" onClick={() => setView("championship")}>Championship</button>
        <button type="button" className="mz-chip-btn" onClick={() => setView("tv")}>TV stage</button>
        <button type="button" className="mz-chip-btn" onClick={() => setView("memory")}>Memory Book</button>
        <button type="button" className="mz-chip-btn" onClick={reconnect}>Reconnect</button>
      </div>
      <SettingsBar sound={settings.sound} anim={settings.anim} onToggleSound={settings.toggleSound} onSetAnim={settings.setAnimSetting} />
      {err && <p className="err">{err}</p>}{msg && <p className="ok">{msg}</p>}
    </div>
  );

  if (view === "lobby" && isLobbyPhase) {
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <LobbyScreen
          session={{
            roomCode: proj?.joinCode ?? "…",
            sessionLabel: proj?.name ?? "Mchezo",
            // Family Cup event data: 7 days is the approved championship
            // length; the current day comes from the server projection.
            championship: { name: "Family Cup", unitLabel: "Day", current: proj?.championshipDay ?? 1, total: 7 },
          }}
          players={mzPlayers}
          youId={playerId ?? ""}
          isHost={!!(me?.isHost || me?.isCohost)}
          nextGame={{ name: upNext?.title ?? "Trivia Showdown", kind: "Party game", accentIndex: 3 }}
          tvConnected={false}
          onTvChange={(on) => { if (on) setView("tv"); }}
          reactions={mzReactions}
          onReact={mzReact}
          onNudge={mzNudge}
          nudgedBy={proj?.nudgedBy}
          onStart={upNext ? () => startGame(upNext.id, true) : undefined}
          minPlayers={upNext?.minPlayers ?? 2}
          capacity={10}
          extra={lobbyExtra}
        />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && showPhase === "intro" && triviaPlaying && playingGame) {
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <MchezoTriviaIntro title={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId} onStart={() => dismissIntro(playingGame.id)} />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && (showPhase === "gameplay" || showPhase === "waiting") && triviaPlaying && playingGame) {
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <MchezoTriviaPlay
          game={playingGame}
          publicGame={publicPlaying}
          players={players}
          playerId={playerId ?? ""}
          gamesTitle={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId}
          intent={intent}
          post={post}
          onBackToLobby={() => dismissResults(playingGame.id)}
          roomId={roomId ?? ""}
        />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && showPhase === "results" && triviaFinished && latestFinished) {
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <MchezoTriviaResults
          game={latestFinished}
          publicGame={publicFinished}
          players={players}
          playerId={playerId ?? ""}
          gamesTitle={games.find((x) => x.id === latestFinished.gameId)?.title ?? latestFinished.gameId}
          intent={intent}
          post={post}
          onBackToLobby={() => dismissResults(latestFinished.id)}
          roomId={roomId ?? ""}
        />
      </MchezoProvider>
    );
  }
  if (view === "tv") {
    // Trivia TV stage (Mchezo) when a Trivia game is the TV subject;
    // every other state keeps the existing TV Dashboard below.
    const tvGame = [...(proj?.games ?? [])].reverse().find((g) => g.gameId === "trivia" && (g.status === "playing" || g.status === "finished"));
    if (tvGame) {
      return (
        <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion} as="bare">
          <MchezoTvStage publicGame={tvGame} players={players} joinCode={proj?.joinCode ?? "…"} onBack={() => setView("lobby")} />
        </MchezoProvider>
      );
    }
  }

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
