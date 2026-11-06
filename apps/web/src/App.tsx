import { useCallback, useEffect, useRef, useState } from "react";
import type { JoinResponse, LedgerEvent, MemoryEntry, PlayerGame, Projection, PublicPlayer, Readiness, RegistryGame, SpectateResponse } from "./types.js";
import { GamePanel } from "./components/GamePanel.js";
import { ChampionshipView } from "./components/ChampionshipView.js";
import { MemoryBookView } from "./components/MemoryBookView.js";
import { Reactions } from "./components/Reactions.js";
import { ShowIntro, ShowResults, ShowWaiting } from "./components/ShowMode.js";
import { SettingsBar, useExperienceSettings } from "./components/SettingsBar.js";
import { deriveShowPhase } from "./components/showPhase.js";
import { wsReconnectDelayMs } from "./components/wsBackoff.js";
// Mchezo "The Circle" integrated views (Phase 2: landing, lobby, Trivia, TV).
import { GameClock, LandingScreen, LobbyScreen, MchezoProvider, noteServerTime, OutcomeSummary, themes } from "./ui/mchezo/index.js";
import type { ReactionId } from "./ui/mchezo/index.js";
import { MchezoTriviaIntro, MchezoTriviaPlay, MchezoTriviaResults } from "./components/mchezo/MchezoTrivia.js";
import { MchezoClosest } from "./components/mchezo/MchezoClosest.js";
import { MchezoGeography } from "./components/mchezo/MchezoGeography.js";
import { MchezoMath } from "./components/mchezo/MchezoMath.js";
import { MchezoYear } from "./components/mchezo/MchezoYear.js";
import { MchezoTvStage } from "./components/mchezo/MchezoTv.js";
import { MchezoLibrary } from "./components/mchezo/MchezoLibrary.js";
import { MchezoStudio } from "./components/mchezo/MchezoStudio.js";
import { resolveReducedMotion } from "./ui/mchezo/lib/motion.js";
import { GAME_MANIFESTS } from "../../../src/games/manifest.js";
import { shuffle } from "../../../src/games/shuffle.js";
import { reactionIdToEmoji, toMzPlayers, toMzReactions } from "./components/mchezo/adapters.js";
import { previousGameScores } from "./ui/mchezo/lib/standings.js";
import { humanError } from "./ui/mchezo/lib/errors.js";
import { midrank } from "./components/midrank.js";
import { sendIntent } from "./components/intentRetry.js";
import { connection, roomNotices } from "./connectionStore.js";
import { seats } from "./session.js";
import { RememberChoice, ThisDeviceCard, WelcomeBack, useRememberedSeats } from "./components/mchezo/DeviceSeat.js";
import { RecoverScreen, RecoveryCodeSection, RecoveryRequestsCard } from "./components/mchezo/Recovery.js";
import { ReadinessCard, type StartDecision } from "./components/mchezo/ReadinessCard.js";
import QRCode from "qrcode";

/** Per-tab UI state (spectator seat, dismissed screens). Never throws: a
    browser that blocks site data must still be able to play. */
function tabGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function tabSet(key: string, value: string | null): void {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = seats.token();
  if (token) headers["x-session-token"] = token;
  const r = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}
async function get<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = seats.token();
  if (token) headers["x-session-token"] = token;
  const r = await fetch(path, { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}

export function App() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  // Seat credentials are owned by the session store (sessionStorage by
  // default; localStorage only after "Remember this device").
  const [roomId, setRoomId] = useState<string | null>(() => seats.current()?.roomId ?? null);
  const [playerId, setPlayerId] = useState<string | null>(() => seats.current()?.playerId ?? null);
  const [token, setToken] = useState<string | null>(() => seats.token());
  // Spectator session (Milestone B): seat-free viewing, stored separately
  // from any player session. A tab holding both shows the player view;
  // spectating never creates or disturbs a player seat.
  const [specRoomId, setSpecRoomId] = useState<string | null>(tabGet("cgn_spec_roomId"));
  const [specToken, setSpecToken] = useState<string | null>(tabGet("cgn_spec_token"));
  const [proj, setProj] = useState<Projection | null>(null);
  const [games, setGames] = useState<RegistryGame[]>([]);
  const [view, setView] = useState<"lobby" | "championship" | "tv" | "memory" | "library" | "studio">("lobby");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // Work Package F: server rejections arrive as terse codes or terse
  // server sentences. Show the human mapping on screen and keep the raw
  // text in the console for debugging — it never reaches the player.
  function reportError(raw: string) {
    console.warn("[mchezo] error:", raw);
    setErr(humanError(raw));
  }
  function fail(e: unknown) {
    reportError(e instanceof Error ? e.message : "Request failed");
  }
  const [book, setBook] = useState<MemoryEntry[]>([]);
  const [ledger, setLedger] = useState<LedgerEvent[]>([]);
  const [qrUrl, setQrUrl] = useState("");
  const [bookText, setBookText] = useState("");
  const [exportText, setExportText] = useState("");
  const [textInput, setTextInput] = useState("");
  const [introDismissed, setIntroDismissed] = useState<string | null>(tabGet("cgn_intro_dismissed"));
  const [resultsDismissed, setResultsDismissed] = useState<string | null>(tabGet("cgn_results_dismissed"));
  const settings = useExperienceSettings();
  // Mchezo lobby: the host-chosen "up next" game (default: Trivia, the
  // Phase 2 featured game). The lobby Start button starts this game.
  const [upNextId, setUpNextId] = useState("trivia");
  // Phase 2.1 lobby simplification: one mode for the single Start action,
  // and one compact chooser instead of per-game official/practice buttons.
  const [gameMode, setGameMode] = useState<"official" | "practice">("official");
  // "Remember this device": default OFF, explicit per join (Sprint 2).
  const [rememberOnJoin, setRememberOnJoin] = useState(false);
  const [seatRemembered, setSeatRemembered] = useState(() => seats.current()?.remembered ?? false);
  const rememberedSeats = useRememberedSeats();
  const [recoverMode, setRecoverMode] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [shuffleResult, setShuffleResult] = useState<string | null>(null);
  const [numInput, setNumInput] = useState("");
  const [selectedTiles, setSelectedTiles] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Replaced (seat recovered elsewhere) or signed out: after the player
  // acknowledges, this device forgets the dead credential and goes back to
  // the start screen. The seat and its scores stay in the game.
  useEffect(() => {
    connection.setHandlers({ acknowledge: () => leaveSeatOnThisDevice("This device is signed out. Your seat and scores are safe in the game.") });
  });
  // Seat recoveries are announced to everyone (except on the recovered seat's own device).
  useEffect(() => {
    const list = proj?.notices ?? [];
    roomNotices.offer(list.filter((n) => n.playerId !== playerId).map((n) => ({
      id: n.eventId,
      text: n.method === "host" && n.byName
        ? `${n.byName} restored ${n.displayName}’s seat on a new device.`
        : `${n.displayName}’s seat was recovered on a new device with a recovery code.`,
    })));
  }, [proj?.notices, playerId]);
  // Poll failures used to be swallowed forever: a player whose room was
  // gone (or whose server was down) saw a frozen screen with no message.
  // After three consecutive failures (~6s) say so; clear it on recovery.
  const pollFailures = useRef(0);
  const pollNotice = useRef("");
  const refresh = useCallback(async () => {
    if (!roomId || !playerId) return;
    try {
      setProj(await get<Projection>(`/rooms/${roomId}/projection?audience=player`));
      pollFailures.current = 0;
      if (pollNotice.current) {
        const shown = pollNotice.current;
        pollNotice.current = "";
        setErr((cur) => (cur === shown ? "" : cur));
      }
    } catch (e) {
      pollFailures.current += 1;
      // 401 = the server no longer accepts this credential (replaced or
      // invalid): that is not a network blip, so say so at once.
      if (e instanceof Error && /Session token required/.test(e.message)) { connection.signedOut(); return; }
      if (pollFailures.current >= 3) {
        const text = e instanceof Error && /Session token required|Room not found/.test(e.message)
          ? "This game is no longer available on the server. Ask the host for the room code to join again."
          : "Can't reach the game server. Retrying automatically…";
        if (pollNotice.current !== text) console.warn("[mchezo] polling failing:", e instanceof Error ? e.message : e);
        pollNotice.current = text;
        setErr(text);
      }
    }
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
        const liveToken = seats.token();
        const next = liveToken ? new WebSocket(wsUrl, [`cgn-session-${liveToken}`]) : new WebSocket(wsUrl);
        ws = next;
        wsRef.current = next;
        next.onmessage = (e) => {
          try {
            const m = JSON.parse(e.data);
            if (m.kind === "projection") {
              setProj(m.state);
              // The server sends a projection only after accepting the
              // session: that, not the socket opening, is "reconnected".
              attempt = 0;
              connection.confirmed();
            }
          } catch { /* ignore malformed WS frame; polling continues */ }
        };
        next.onclose = (e) => {
          if (stopped || ws !== next) return;
          if (e.code === 4001) { connection.replaced(); return; } // seat recovered on another device
          if (e.code === 1008) { connection.signedOut(); return; } // credential no longer accepted
          connection.dropped();
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
    // A phone that was locked or backgrounded may come back with a dead
    // socket and a long backoff pending: reconnect at once instead.
    const reconnectNow = () => {
      if (stopped) return;
      const state = connection.get().state;
      if (state === "replaced" || state === "signed-out") return;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) { void refresh(); return; }
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      attempt = 0;
      connect();
      void refresh();
    };
    const onVisible = () => { if (document.visibilityState === "visible") reconnectNow(); };
    // The browser knows it lost the network (Wi-Fi off, airplane mode,
    // tunnel): say so now and drop the socket ourselves, instead of
    // waiting minutes for TCP to notice. "online" reconnects at once.
    const onOffline = () => {
      if (stopped) return;
      const state = connection.get().state;
      if (state === "replaced" || state === "signed-out") return;
      connection.dropped();
      ws?.close();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", reconnectNow);
    window.addEventListener("pageshow", reconnectNow);
    connection.setHandlers({ retryNow: reconnectNow });
    connect();
    return () => {
      stopped = true;
      clearInterval(t);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", reconnectNow);
      window.removeEventListener("pageshow", reconnectNow);
      connection.setHandlers({ retryNow: () => {} });
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [roomId, playerId, refresh]);

  async function saveSession(r: JoinResponse, opts: { remember?: boolean } = {}) {
    seats.begin({ roomId: r.roomId, playerId: r.playerId, token: r.recoveryToken, displayName: r.displayName }, { remember: opts.remember ?? rememberOnJoin });
    setSeatRemembered(seats.current()?.remembered ?? false);
    connection.reset();
    setRoomId(r.roomId); setPlayerId(r.playerId); setToken(r.recoveryToken); setView("lobby");
  }
  /** This device stops using the seat (sign out / session replaced). The seat stays in the game. */
  function leaveSeatOnThisDevice(note?: string) {
    seats.signOut();
    connection.reset();
    setRoomId(null); setPlayerId(null); setToken(null); setProj(null); setView("lobby");
    if (note) setMsg(note);
  }
  async function createRoom() {
    setErr(""); try {
      const r = await post<JoinResponse>("/rooms", { name: "Christmas Game Night" });
      const j = await post<JoinResponse>(`/rooms/${r.roomId}/join`, { displayName: name || "Player 1", asHost: true, hostClaimToken: r.hostClaimToken });
      await saveSession({ ...j, roomId: r.roomId }); setMsg(`Room created. Code: ${r.joinCode}`);
    } catch (e) { fail(e); }
  }
  async function joinRoom() {
    setErr(""); try {
      const j = await post<JoinResponse>("/rooms/join-by-code", { joinCode: code, displayName: name || "Player" });
      await saveSession(j); setMsg("Joined room.");
    } catch (e) { fail(e); }
  }
  async function spectate() {
    setErr(""); try {
      const s = await post<SpectateResponse>("/rooms/spectate-by-code", { joinCode: code });
      tabSet("cgn_spec_roomId", s.roomId); tabSet("cgn_spec_token", s.spectatorToken);
      setSpecRoomId(s.roomId); setSpecToken(s.spectatorToken); setMsg("Watching — no seat taken.");
    } catch (e) { fail(e); }
  }
  function stopWatching() {
    tabSet("cgn_spec_roomId", null); tabSet("cgn_spec_token", null);
    setSpecRoomId(null); setSpecToken(null); setProj(null); setMsg("Stopped watching.");
  }
  // Spectator live updates: poll + WebSocket on the spectator credential.
  // A 401 means the spectator token is gone (server restart without a
  // persisted spectator record is the known case) — drop back to landing
  // with an explanation instead of polling a dead session forever.
  useEffect(() => {
    if (!specRoomId || !specToken || roomId) return;
    let stopped = false;
    const poll = async () => {
      try {
        const r = await fetch(`/rooms/${specRoomId}/projection?audience=spectator`, { headers: { "x-spectator-token": specToken } });
        if (r.status === 401) { if (!stopped) { stopWatching(); setErr("Spectator session expired — enter the code again to keep watching."); } return; }
        if (!r.ok) return;
        setProj(await r.json());
      } catch { /* poll retry */ }
    };
    poll();
    const t = setInterval(poll, 2000);
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | null = null;
    const connect = () => {
      if (stopped) return;
      try {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const next = new WebSocket(`${proto}://${location.host}/?roomId=${specRoomId}&audience=spectator`, [`cgn-spectator-${specToken}`]);
        ws = next;
        next.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.kind === "projection") setProj(m.state); } catch { /* ignore malformed WS frame; polling continues */ } };
        next.onclose = (e) => {
          if (stopped || e.code === 1008) return;
          attempt += 1;
          retryTimer = setTimeout(connect, wsReconnectDelayMs(attempt));
        };
      } catch {
        if (!stopped) { attempt += 1; retryTimer = setTimeout(connect, wsReconnectDelayMs(attempt)); }
      }
    };
    connect();
    return () => {
      stopped = true;
      clearInterval(t);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [specRoomId, specToken, roomId]);
  async function reconnect() {
    setErr(""); try {
      if (!roomId || !playerId || !token) return;
      await post<Record<string, unknown>>(`/rooms/${roomId}/reconnect`, { playerId, recoveryToken: token }); await refresh(); setMsg("Reconnected to your player slot.");
    } catch (e) { fail(e); }
  }
  const startingRef = useRef(false);
  const [startDecision, setStartDecision] = useState<(StartDecision & { gameId: string; official: boolean }) | null>(null);
  // A pending "start without them?" question goes away by itself once
  // nobody it names is still reconnecting (they came back, or the grace
  // period ended): the host then just presses Start normally.
  useEffect(() => {
    if (!startDecision) return;
    const still = new Set((proj?.readiness?.wouldMiss ?? []).filter((m) => m.presence === "reconnecting").map((m) => m.id));
    if (!startDecision.reconnecting.some((id) => still.has(id))) setStartDecision(null);
  }, [proj?.readiness, startDecision]);
  async function startGame(gameId: string, official: boolean, proceedWithout?: string[]) {
    // Host-action race (Milestone K): a double-tap on Start posts twice;
    // the server correctly rejects the second (a game is already playing),
    // but the rejection surfaced as a spurious error to the host. Ignore
    // a second call while a start is in flight — the server stays the
    // authority, this only stops the redundant request.
    if (startingRef.current) return;
    // Sprint 2: send the roster the host is looking at, so the game's
    // roster is exactly what was shown. If an official game would leave
    // out someone still reconnecting, ask first (inline, not a modal):
    // the ordinary all-here case starts immediately with no extra step.
    const r = proj?.readiness;
    const reconnecting = (r?.wouldMiss ?? []).filter((m) => m.presence === "reconnecting").map((m) => m.id);
    if (official && reconnecting.length > 0 && !proceedWithout) {
      setStartDecision({ gameId, official, gameTitle: games.find((g) => g.id === gameId)?.title ?? gameId, reconnecting });
      return;
    }
    startingRef.current = true;
    setErr("");
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const t = seats.token();
      if (t) headers["x-session-token"] = t;
      const resp = await fetch(`/rooms/${roomId}/games`, { method: "POST", headers, body: JSON.stringify({ gameId, official, roster: r?.wouldPlay, proceedWithout }) });
      const body = (await resp.json().catch(() => ({}))) as { error?: string; code?: string; readiness?: Readiness };
      if (resp.status === 409) {
        // The room changed between looking and pressing Start: show the
        // fresh picture and let the host decide again. Nothing started.
        await refresh();
        const again = (body.readiness?.wouldMiss ?? []).filter((m) => m.presence === "reconnecting").map((m) => m.id);
        if (body.code === "PLAYERS_RECONNECTING" && again.length) setStartDecision({ gameId, official, gameTitle: games.find((g) => g.id === gameId)?.title ?? gameId, reconnecting: again });
        else setErr(body.error ?? "Who is playing changed. Check the list, then start again.");
        return;
      }
      if (!resp.ok) throw new Error(body.error || `Request failed (${resp.status})`);
      setStartDecision(null);
      await refresh(); setShuffleResult(null); setView("lobby");
    } catch (e) { fail(e); } finally { startingRef.current = false; }
  }
  async function intent(gameInstanceId: string, action: string, payload: Record<string, unknown>) {
    setErr(""); try {
      // One clientEventId per user action, reused by every retry, so the
      // server's dedupe returns the original result if a response was lost.
      // Lock-step games: say which phase this action was made in, so a tap
      // that lands after that phase closed is refused, never misfiled.
      const phaseKey = proj?.myGames?.find((g) => g.id === gameInstanceId)?.lifecycle?.phaseKey;
      const sent = phaseKey !== undefined && payload["phaseKey"] === undefined ? { ...payload, phaseKey } : payload;
      const body = JSON.stringify({ intent: { kind: "intent", schemaVersion: 1, clientEventId: uuid(), roomId, gameInstanceId, action, payload: sent } });
      const res = await sendIntent(async () => {
        const headers: Record<string, string> = { "content-type": "application/json" };
        const t = seats.token();
        if (t) headers["x-session-token"] = t;
        const resp = await fetch(`/rooms/${roomId}/intents`, { method: "POST", headers, body });
        return { status: resp.status, body: await resp.json().catch(() => ({})) };
      });
      const r = res.body as { accepted?: boolean; reason?: string; error?: string };
      if (res.status >= 400) throw new Error(r.error || `Request failed (${res.status})`);
      if (!r.accepted) reportError(r.reason === "PHASE_CLOSED" ? "Time was up for that one — it wasn’t counted." : `Not accepted: ${r.reason || "unknown"}`); else setMsg("Saved.");
      await refresh();
    } catch (e) { fail(e); }
  }
  async function loadMemory() {
    try { setBook(await get<MemoryEntry[]>(`/rooms/${roomId}/memory`)); setLedger(await get<LedgerEvent[]>(`/rooms/${roomId}/ledger`)); } catch (e) { fail(e); }
  }
  useEffect(() => { if (view === "memory" && roomId) loadMemory(); }, [view, roomId]);
  useEffect(() => {
    if (!proj?.joinCode) return;
    const url = `${location.origin}/?code=${proj.joinCode}`;
    QRCode.toDataURL(url, { width: 220, margin: 2 }).then(setQrUrl).catch(() => {});
  }, [proj?.joinCode]);

  // Landing shows unless a player session exists — or a spectator session
  // does (spectator tabs skip landing and render the TV-only branch below).
  if ((!roomId || !playerId) && !(specRoomId && specToken) && recoverMode) {
    return (
      <MchezoProvider theme={themes.everyday}>
        <RecoverScreen
          initialCode={code}
          onBack={() => setRecoverMode(false)}
          onSecured={(seat, remember) => {
            seats.begin({ roomId: seat.roomId, playerId: seat.playerId, token: seat.sessionToken, displayName: seat.displayName }, { remember });
          }}
          onRecovered={(seat, remember) => {
            setRecoverMode(false);
            void saveSession({ roomId: seat.roomId, playerId: seat.playerId, recoveryToken: seat.sessionToken, displayName: seat.displayName } as JoinResponse, { remember });
            setMsg(`Welcome back, ${seat.displayName}. Your seat is restored.`);
          }}
        />
      </MchezoProvider>
    );
  }
  if ((!roomId || !playerId) && !(specRoomId && specToken)) {
    return (
      <MchezoProvider theme={themes.everyday}>
        <LandingScreen
          code={code}
          onCodeChange={(c) => setCode(c)}
          name={name}
          onNameChange={setName}
          onJoin={joinRoom}
          onHost={createRoom}
          onSpectate={spectate}
          top={!roomId && (
            <WelcomeBack
              verified={rememberedSeats.verified}
              notes={rememberedSeats.notes}
              onContinue={(v) => { void saveSession({ roomId: v.seat.roomId, playerId: v.seat.playerId, recoveryToken: v.seat.token, displayName: v.displayName } as JoinResponse, { remember: true }); setMsg(`Welcome back, ${v.displayName}.`); }}
              onForget={(v) => rememberedSeats.forget(v.seat)}
            />
          )}
          formExtra={<>
            <RememberChoice checked={rememberOnJoin} onChange={setRememberOnJoin} />
            <button type="button" className="mz-linkbtn" data-testid="mz-lost-place" onClick={() => { setErr(""); setRecoverMode(true); }}>Lost your place? Recover your seat</button>
          </>}
          extra={
            <div style={{ padding: "0 16px 16px" }}>
              {err && <p className="err" data-testid="mz-error" role="alert">{err}</p>}{msg && <p className="ok">{msg}</p>}
              <p className="mz-foot">No account needed — just the 6-character code from the host.</p>
            </div>
          }
        />
      </MchezoProvider>
    );
  }

  // ---- Spectator-only view (Milestone B) ----
  // A tab with a spectator session and NO player session renders TV only:
  // the same latest-game TV rule as the player TV branch, but with no
  // lobby, no game controls, no reactions, and a Stop watching exit.
  // Spectators never hold a playerId, so nothing here can start a game,
  // submit an intent, or appear in a seat.
  if (!playerId && specRoomId && specToken) {
    const specPlayers: PublicPlayer[] = proj?.players ?? [];
    const specNameOf = (id: string): string => specPlayers.find((p) => p.id === id)?.displayName ?? id;
    const specLatest = (proj?.games ?? []).at(-1);
    const specTvGame = specLatest?.gameId === "trivia" && (specLatest.status === "playing" || specLatest.status === "finished") ? specLatest : undefined;
    if (!proj) {
      return (
        <MchezoProvider theme={themes.everyday}>
          <div style={{ padding: 24 }}>
            <p className="mz-foot">Finding the game…</p>
            <button type="button" className="mz-chip-btn" onClick={stopWatching}>Stop watching</button>
            {err && <p className="err">{err}</p>}
          </div>
        </MchezoProvider>
      );
    }
    if (specTvGame) {
      return (
        <MchezoProvider theme={themes.everyday} as="bare">
          <MchezoTvStage key={specTvGame.id} publicGame={specTvGame} players={specPlayers} joinCode={proj.joinCode ?? "…"} onBack={stopWatching} spectatorCount={proj.spectatorCount} backLabel="Stop watching" previousScores={previousGameScores(proj?.games ?? [], specTvGame.id)} />
        </MchezoProvider>
      );
    }
    return (
      <div className="wrap">
        <header><h1>🎄 Christmas Game Night</h1><span className="pill">Code: {proj.joinCode ?? "…"}</span></header>
        <p className="muted">Watching as a spectator — no seat taken, no scores, no controls.</p>
        {(proj.spectatorCount ?? 0) > 0 && <p className="muted" data-testid="tv-watching-count">👁 {proj.spectatorCount} watching</p>}
        <div className="card"><h2>TV Dashboard — public only</h2><p className="muted">This view never shows answer keys, secret words, or other players' prompts.</p>
          <p>Players: {specPlayers.map((p) => p.displayName).join(", ") || "—"}</p>
          <h3>Standings (Family Cup totals)</h3>{(proj.championship ?? []).map((r) => <p key={r.playerId}>{specNameOf(r.playerId)}: {r.total} points{r.eligible ? "" : " (not yet qualified)"}</p>)}
          <h3>Now playing</h3>{(proj.games ?? []).filter((g) => g.status === "playing").map((g) => <p key={g.id}>{games.find((x) => x.id === g.gameId)?.title ?? g.gameId} — players: {g.players.map(specNameOf).join(", ")}</p>)}
          {(proj.games ?? []).filter((g) => g.status === "playing").length === 0 && <p className="muted">No game in progress — the lobby is choosing the next game.</p>}
          <h3>Recent games</h3>{(proj.games ?? []).slice(-5).map((g) => <p key={g.id}>{g.gameId} — {g.status}{g.rawScores ? ` — ${Object.entries(g.rawScores).map(([pid, v]) => `${specNameOf(pid)}: ${v}`).join(" · ")}` : ""}</p>)}
        </div>
        <div style={{ marginTop: 12 }}><button type="button" className="mz-chip-btn" onClick={stopWatching}>Stop watching</button></div>
        {err && <p className="err">{err}</p>}{msg && <p className="ok">{msg}</p>}
      </div>
    );
  }

  const players: PublicPlayer[] = proj?.players ?? [];
  const myGames: PlayerGame[] = proj?.myGames ?? [];
  const me = players.find((p) => p.id === playerId);
  const serverStandings = proj?.officialStandings;
  // Standings come from the server only (RoomEngine.officialStandings). The
  // client used to recompute them as a fallback, with different rules for
  // single-player games: a second scoring engine that could disagree.
  const standings: Record<string, number> = serverStandings ?? {};
  const nameOf = (id: string): string => players.find((p) => p.id === id)?.displayName ?? id;
  const playingGame = myGames.find((g) => g.status === "playing");
  // Countdowns use the server's clock, never this phone's own clock alone.
  noteServerTime(proj?.serverNow);
  const latestFinished = myGames.filter((g) => g.status === "finished").slice(-1)[0];
  const publicPlaying = (proj?.games ?? []).find((g) => g.id === playingGame?.id);
  const publicFinished = (proj?.games ?? []).find((g) => g.id === latestFinished?.id);
  const showPhase = view === "lobby" ? deriveShowPhase(playingGame, latestFinished, introDismissed, resultsDismissed, playerId ?? undefined) : "lobby";
  // Precomputed outside the lobby fragment so TS aliased-condition narrowing
  // on the lobby branch cannot narrow showPhase itself inside that fragment.
  const isLobbyPhase = showPhase === "lobby";
  const showGamePanel = (showPhase === "gameplay" || showPhase === "waiting") && !!playingGame;
  function dismissIntro(id: string) { tabSet("cgn_intro_dismissed", id); setIntroDismissed(id); }
  function dismissResults(id: string) { tabSet("cgn_results_dismissed", id); setResultsDismissed(id); }

  // ---- Mchezo integrated views (Phase 2) ----
  // Everyday theme throughout: Mchezo is year-round; the Christmas Family
  // Cup is a seasonal event shown as data (below), not as the platform skin.
  const mzReducedMotion = resolveReducedMotion(settings.anim, typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? true : undefined;
  const mzPlayers = toMzPlayers(players);
  const mzReactions = toMzReactions(proj?.reactions, players);
  const mzReact = async (r: ReactionId) => {
    try { await post(`/rooms/${roomId}/reactions`, { emoji: reactionIdToEmoji(r) }); await refresh(); } catch { /* non-fatal */ }
  };
  const mzNudge = async (targetId: string) => {
    try { await post(`/rooms/${roomId}/nudge`, { targetId }); await refresh(); } catch { /* non-fatal */ }
  };
  const upNext = games.find((g) => g.id === upNextId) ?? games[0];
  // Practice-only games (Impostor, Charades) can't count: the server refuses
  // them as official, so the lobby starts them as practice and says why.
  const upNextPracticeOnly = upNext?.lifecycle?.officialEligible === false;
  const startMode: "official" | "practice" = upNextPracticeOnly ? "practice" : gameMode;
  const minutes = (ms?: number) => (ms === undefined ? undefined : Math.round(ms / 60_000));
  // Smart Shuffle UI (Milestone H): pure engine call, client-side. The
  // up-next game is client state, so no server round-trip is needed: the
  // engine reads manifests, the connected-player count, and the room's
  // game history from the projection. Seeded from Date.now() for a fresh
  // draw per click; the engine itself is deterministic per seed.
  const runShuffle = (mode: "random" | "smart") => {
    const connectedCount = players.filter((p) => p.connected).length;
    const playerCount = connectedCount > 0 ? connectedCount : players.length;
    const recentIds = (proj?.games ?? []).map((g) => g.gameId).reverse();
    const r = shuffle({ mode, playerCount, seed: Date.now(), recentIds, manifests: GAME_MANIFESTS });
    if (!r.ok) {
      setShuffleResult(`No games fit ${playerCount} players.`);
      return;
    }
    const pick = r.picks[0]!;
    setUpNextId(pick.gameId);
    setShuffleResult(`${pick.title}: ${pick.explanation}`);
  };
  const triviaPlaying = playingGame?.gameId === "trivia";
  const closestPlaying = playingGame?.gameId === "closest-wins";
  const yearPlaying = playingGame?.gameId === "guess-the-year";
  const geographyPlaying = playingGame?.gameId === "geography";
  const mathPlaying = playingGame?.gameId === "math-mayhem";
  const triviaFinished = latestFinished?.gameId === "trivia";
  const lobbyExtra = (
    <div>
      {(me?.isHost || me?.isCohost) && (
        <RecoveryRequestsCard
          requests={proj?.recoveryRequests ?? []}
          onDecide={async (r, approve) => {
            try { await post(`/rooms/${roomId}/recovery-requests/${r.requestId}/${approve ? "approve" : "deny"}`, approve ? { playerId: r.playerId } : {}); } catch (e) { fail(e); }
            await refresh();
          }}
        />
      )}
      {(me?.isHost || me?.isCohost) && (
        <div className="mz-card" style={{ marginTop: 12 }}>
          <span className="mz-kicker">Game setup</span>
          <p className="mz-foot" style={{ margin: "4px 0" }}>Up next is {upNext?.title ?? "—"}. Official games count toward the {proj?.competition?.label ?? "Family Cup"}; practice games do not.{upNext?.lifecycle ? ` Time limit: about ${minutes(upNext.lifecycle.gameWindowMs)} min — the game ends by itself.` : ""}</p>
          {upNextPracticeOnly && <p className="mz-foot" style={{ margin: "4px 0", fontWeight: 600 }} data-testid="practice-only-note">Practice only: {upNext?.lifecycle?.practiceOnlyReason}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-label="Game mode">
            <button type="button" className="mz-chip-btn" data-testid="mode-official" aria-pressed={startMode === "official"} disabled={upNextPracticeOnly} onClick={() => setGameMode("official")}>Official</button>
            <button type="button" className="mz-chip-btn" data-testid="mode-practice" aria-pressed={startMode === "practice"} onClick={() => setGameMode("practice")}>Practice</button>
            <button type="button" className="mz-chip-btn" data-testid="choose-game" aria-expanded={chooserOpen} onClick={() => setChooserOpen((o) => !o)}>{chooserOpen ? "Close game list" : "Choose a different game"}</button>
            <button type="button" className="mz-chip-btn" data-testid="surprise-me" onClick={() => runShuffle("random")}>Surprise me</button>
            <button type="button" className="mz-chip-btn" data-testid="smart-shuffle" onClick={() => runShuffle("smart")}>Smart shuffle</button>
          </div>
          {shuffleResult && <p className="mz-foot" style={{ margin: "8px 0 0" }} data-testid="shuffle-result">{shuffleResult}</p>}
          {chooserOpen && (
            <div style={{ marginTop: 8 }}>
              {games.map((g) => (
                <button key={g.id} type="button" className="mz-chip-btn" data-testid={`select-game-${g.id}`} aria-current={g.id === upNext?.id ? "true" : undefined} onClick={() => { setUpNextId(g.id); setChooserOpen(false); setShuffleResult(null); }} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6 }}>
                  {g.title} <span className="mz-muted">· {g.minPlayers}–{g.maxPlayers} players · ~{g.defaultDurationMinutes} min{g.lifecycle?.officialEligible === false ? " · Practice only" : ""}</span>{g.id === upNext?.id ? " · Up next" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <ThisDeviceCard
        remembered={seatRemembered}
        onRemember={(on) => setSeatRemembered(seats.setRemember(on))}
        onForgetDevice={() => leaveSeatOnThisDevice("Signed out on this device. Your seat and scores stay in the game.")}
      >
        <RecoveryCodeSection
          hasCode={!!proj?.me?.hasRecoveryCode}
          onIssue={async () => { const r = await post<{ recoveryCode: string }>(`/rooms/${roomId}/recovery-code`, {}); void refresh(); return r.recoveryCode; }}
        />
      </ThisDeviceCard>
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
        <button type="button" className="mz-chip-btn" data-testid="browse-games" onClick={() => setView("library")}>Browse games</button>
        {(me?.isHost || me?.isCohost) && <button type="button" className="mz-chip-btn" data-testid="studio-button" onClick={() => setView("studio")}>Studio (preview)</button>}
        <button type="button" className="mz-chip-btn" onClick={reconnect}>Reconnect</button>
      </div>
      <SettingsBar sound={settings.sound} anim={settings.anim} onToggleSound={settings.toggleSound} onSetAnim={settings.setAnimSetting} />
      {msg && <p className="ok">{msg}</p>}
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
            championship: { name: proj?.competition?.label ?? "Family Cup", unitLabel: "Day", current: proj?.championshipDay ?? 1, total: 7 },
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
          onStart={upNext ? () => startGame(upNext.id, startMode === "official") : undefined}
          startTestId={upNext ? `start-${startMode}-${upNext.id}` : undefined}
          minPlayers={upNext?.minPlayers ?? 2}
          capacity={10}
          error={err || undefined}
          extra={lobbyExtra}
          beforeStart={(me?.isHost || me?.isCohost) && upNext && (
          <ReadinessCard
            readiness={proj?.readiness}
            players={players}
            gameTitle={upNext.title}
            minPlayers={upNext.minPlayers}
            maxPlayers={upNext.maxPlayers}
            decision={startDecision && startDecision.gameId === upNext.id ? startDecision : null}
            onWait={() => setStartDecision(null)}
            onStartWithout={() => { const d = startDecision; if (d) void startGame(d.gameId, d.official, d.reconnecting); }}
          />
        )}
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
          windowMs={games.find((x) => x.id === playingGame.gameId)?.lifecycle?.gameWindowMs}
          game={playingGame}
          publicGame={publicPlaying}
          players={players}
          playerId={playerId ?? ""}
          gamesTitle={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId}
          intent={intent}
          post={post}
          onBackToLobby={() => dismissResults(playingGame.id)}
          roomId={roomId ?? ""}
          isHostOrCohost={!!(me?.isHost || me?.isCohost)}
          onTv={() => setView("tv")}
        />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && (showPhase === "gameplay" || showPhase === "waiting") && closestPlaying && playingGame) {
    // Closest Wins (Milestone J.3): kit panel instead of the old shell
    // + GamePanel, mirroring the Trivia play branch. Intro and finished
    // results still use the shared old views (ShowIntro, ShowResults).
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <GameClock game={playingGame} />
        <MchezoClosest
          game={playingGame}
          publicGame={publicPlaying}
          players={players}
          playerId={playerId ?? ""}
          intent={intent}
          post={post}
          roomId={roomId ?? ""}
          isHostOrCohost={!!(me?.isHost || me?.isCohost)}
          title={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId}
        />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && (showPhase === "gameplay" || showPhase === "waiting") && yearPlaying && playingGame) {
    // Guess the Year (Work Package D): kit panel instead of the old
    // shell + GamePanel, mirroring the Trivia and Closest play
    // branches. Intro and finished results still use the shared old
    // views (ShowIntro, ShowResults).
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <GameClock game={playingGame} />
        <MchezoYear
          game={playingGame}
          publicGame={publicPlaying}
          players={players}
          playerId={playerId ?? ""}
          intent={intent}
          post={post}
          roomId={roomId ?? ""}
          isHostOrCohost={!!(me?.isHost || me?.isCohost)}
          title={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId}
        />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && (showPhase === "gameplay" || showPhase === "waiting") && geographyPlaying && playingGame) {
    // Geography Challenge (Work Package E): kit panel instead of the
    // old shell + GamePanel, mirroring the Trivia play branch. No TV
    // stage and no staged reveal (the finished projection carries no
    // correctIndex for Geography), so intro and finished results still
    // use the shared old views (ShowIntro, ShowResults).
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <MchezoGeography
          windowMs={games.find((x) => x.id === playingGame.gameId)?.lifecycle?.gameWindowMs}
          game={playingGame}
          publicGame={publicPlaying}
          players={players}
          playerId={playerId ?? ""}
          gamesTitle={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId}
          intent={intent}
          post={post}
          roomId={roomId ?? ""}
          isHostOrCohost={!!(me?.isHost || me?.isCohost)}
        />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && (showPhase === "gameplay" || showPhase === "waiting") && mathPlaying && playingGame) {
    // Math Mayhem (§11 optional modernization): kit panel instead of the
    // old shell + GamePanel, mirroring the Geography play branch. No TV
    // stage and no staged reveal (the finished projection carries no
    // correctIndex for Math), so intro and finished results still use
    // the shared old views (ShowIntro, ShowResults). The locked view
    // shows the player's own elapsed time, because speed is scored.
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <MchezoMath
          windowMs={games.find((x) => x.id === playingGame.gameId)?.lifecycle?.gameWindowMs}
          game={playingGame}
          publicGame={publicPlaying}
          players={players}
          playerId={playerId ?? ""}
          gamesTitle={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId}
          intent={intent}
          post={post}
          roomId={roomId ?? ""}
          isHostOrCohost={!!(me?.isHost || me?.isCohost)}
        />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && showPhase === "results" && triviaFinished && latestFinished) {
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <OutcomeSummary gameId={latestFinished.gameId} outcome={latestFinished.outcome} official={publicFinished?.official} youId={playerId ?? undefined} youChoseSatOut={latestFinished.abstained === true} nameOf={nameOf} showEveryone />
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
          onTv={() => setView("tv")}
          previousScores={previousGameScores(proj?.games ?? [], latestFinished.id)}
        />
      </MchezoProvider>
    );
  }
  if (view === "library") {
    // Game Library (Milestone G): browse only. Selecting sets the up-next
    // game and returns to the lobby, where the existing Start button starts
    // it — the library itself never starts a game. Guests browse read-only;
    // only host/cohost get the select button.
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <MchezoLibrary
          manifests={GAME_MANIFESTS}
          upNextId={upNextId}
          canSelect={!!(me?.isHost || me?.isCohost)}
          onSelect={(id) => { setUpNextId(id); setView("lobby"); }}
          onBack={() => setView("lobby")}
        />
      </MchezoProvider>
    );
  }
  if (view === "studio") {
    // Tournament Studio preview (Milestone I): host-only, schedule-only.
    // No game is started, scored, or saved from this view.
    const connectedCount = players.filter((p) => p.connected).length;
    const studioPlayerCount = connectedCount > 0 ? connectedCount : players.length;
    const studioRecent = (proj?.games ?? []).map((g) => g.gameId).reverse();
    return (
      <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion}>
        <MchezoStudio playerCount={studioPlayerCount} recentIds={studioRecent} onBack={() => setView("lobby")} />
      </MchezoProvider>
    );
  }
  if (view === "tv") {
    // TV subject = the LATEST game overall, not the latest Trivia game.
    // The old rule (latest playing/finished Trivia anywhere in history)
    // let stale Trivia results take over the TV after the room moved on
    // to another game. Now: Trivia stage only while Trivia is the latest
    // event; any newer game returns the TV to the dashboard, which shows
    // Now playing + Recent games + Family Cup standings. The host's game
    // actions (start/finish) therefore drive every TV viewer's screen
    // through server state alone — no per-device phase is consulted.
    const latestGame = (proj?.games ?? []).at(-1);
    const tvGame = latestGame?.gameId === "trivia" && (latestGame.status === "playing" || latestGame.status === "finished") ? latestGame : undefined;
    if (tvGame) {
      return (
        <MchezoProvider theme={themes.everyday} reducedMotion={mzReducedMotion} as="bare">
          <MchezoTvStage key={tvGame.id} publicGame={tvGame} players={players} joinCode={proj?.joinCode ?? "…"} onBack={() => setView("lobby")} previousScores={previousGameScores(proj?.games ?? [], tvGame.id)} />
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
      <ShowWaiting game={publicPlaying} title={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId} />
      <p className="muted">The game stays visible below — when the next phase starts, this banner goes away on its own.</p>
    </>}
    {view === "lobby" && showPhase === "results" && latestFinished && <><ShowResults game={latestFinished} title={games.find((x) => x.id === latestFinished.gameId)?.title ?? latestFinished.gameId} nameOf={nameOf} games={games} official={publicFinished?.official} youId={playerId ?? undefined} onBack={() => dismissResults(latestFinished.id)} /><Reactions proj={proj} post={post} canMute={!!(me?.isHost || me?.isCohost)} /></>}
      {showGamePanel && playingGame && <GameClock game={playingGame} />}
      {showGamePanel && playingGame && <GamePanel game={playingGame} players={players} nameOf={nameOf} intent={intent} textInput={textInput} setTextInput={setTextInput} numInput={numInput} setNumInput={setNumInput} selectedTiles={selectedTiles} setSelectedTiles={setSelectedTiles} />}
    {view === "championship" && <ChampionshipView proj={proj} games={games} players={players} nameOf={nameOf} midrank={midrank} post={post} refresh={refresh} meIsHostOrCohost={!!(me?.isHost || me?.isCohost)} />}

    {view === "tv" && <div className="card"><h2>TV Dashboard — public only</h2><p className="muted">This view never shows answer keys, secret words, or other players' prompts.</p>
      <p>Room code: <b>{proj?.joinCode}</b></p><p>Players: {players.map((p) => p.displayName).join(", ")}</p>
      <h3>Standings (Family Cup totals)</h3>{(proj?.championship ?? []).map((r) => <p key={r.playerId}>{nameOf(r.playerId)}: {r.total} points{r.eligible ? "" : " (not yet qualified)"}</p>)}
      {(proj?.championship ?? []).length === 0 && Object.entries(standings).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([pid, v]) => <p key={pid}>{nameOf(pid)}: {v}</p>)}
      <h3>Now playing</h3>{(proj?.games ?? []).filter((g) => g.status === "playing").map((g) => <div key={g.id}><p>{games.find((x) => x.id === g.gameId)?.title ?? g.gameId} — players: {g.players.map(nameOf).join(", ")}{g.official ? "" : " (practice)"}</p><GameClock game={g} tv /></div>)}
      {(proj?.games ?? []).filter((g) => g.status === "playing").length === 0 && <p className="muted">No game in progress — the lobby is choosing the next game.</p>}
      {proj?.ceremony?.winner && <p>🏆 Day {proj.ceremony.day} winner: <b>{proj.ceremony.winner}</b></p>}
      <h3>Recent games</h3>{(proj?.games ?? []).slice(-5).map((g) => <p key={g.id}>{g.gameId} — {g.status}{g.rawScores ? ` — ${Object.entries(g.rawScores).map(([pid, v]) => `${nameOf(pid)}: ${v}`).join(" · ")}` : ""}</p>)}
      <Reactions proj={proj} post={post} canMute={false} />
    </div>}

    {view === "memory" && <MemoryBookView roomId={roomId ?? ""} book={book} ledger={ledger} bookText={bookText} setBookText={setBookText} exportText={exportText} setExportText={setExportText} post={post} get={get} loadMemory={loadMemory} canApprove={!!(me?.isHost || me?.isCohost)} />}
  </div>;
}
