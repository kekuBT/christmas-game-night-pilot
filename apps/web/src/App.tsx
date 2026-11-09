import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { JoinResponse, LedgerEvent, MemoryEntry, PlayerGame, Projection, PublicGame, PublicPlayer, Readiness, RegistryGame, SpectateResponse } from "./types.js";
import { GamePanel } from "./components/GamePanel.js";
import { CupScreen } from "./components/mchezo/CupScreen.js";
import { MemoryScreen } from "./components/mchezo/MemoryScreen.js";
import { Reactions } from "./components/Reactions.js";
import { ShowIntro, ShowResults, ShowWaiting } from "./components/ShowMode.js";
import { SettingsBar, useExperienceSettings } from "./components/SettingsBar.js";
import { deriveShowPhase } from "./components/showPhase.js";
import { wsReconnectDelayMs } from "./components/wsBackoff.js";
// Mchezo "The Circle" integrated views (Phase 2: landing, lobby, Trivia, TV).
import { buildCatalog, featuredOfTheDay, filtersFromQuery, filtersToQuery, GameClock, ResultsHero, resultsStory, GameIntro, InviteSheet, linkReach, MchezoProvider, NoticeCard, noteServerTime, OutcomeSummary, parseRoute, routeUrl, SegmentedChoice, Sheet, themes, type Route, type RoomSub } from "./ui/mchezo/index.js";
import { GameDetailsSheet, HomeScreen, HostScreen, JoinScreen } from "./components/mchezo/Home.js";
import { ChooseGameSheet, RoomLobby, RoomMenuSheet } from "./components/mchezo/Lobby.js";
import { anchorHomeBelow, stampEntry, useRoute } from "./nav.js";
import type { ReactionId } from "./ui/mchezo/index.js";
import { MchezoTriviaIntro, MchezoTriviaPlay, MchezoTriviaResults } from "./components/mchezo/MchezoTrivia.js";
import { MchezoClosest } from "./components/mchezo/MchezoClosest.js";
import { ConnectionsTv, MchezoConnections, MchezoConnectionsResults } from "./components/mchezo/MchezoConnections.js";
import { TvShow } from "./components/mchezo/TvShow.js";
import { ClosestTv, ImpostorTv } from "./components/mchezo/TvGames.js";
import { MajorityReview, MajorityTv, MchezoMajority, MchezoMajorityResults } from "./components/mchezo/MchezoMajority.js";
import { tvFeedFrom, winnerLine } from "./ui/mchezo/lib/tvfeed.js";
import { ordinal } from "./ui/mchezo/lib/standings.js";
import { CaptionTv, MchezoCaption, MchezoCaptionResults } from "./components/mchezo/MchezoCaption.js";
import { MchezoGeography } from "./components/mchezo/MchezoGeography.js";
import { MchezoMath } from "./components/mchezo/MchezoMath.js";
import { MchezoYear } from "./components/mchezo/MchezoYear.js";
import { MchezoTvStage } from "./components/mchezo/MchezoTv.js";
import { AnswerReview, reviewRows } from "./components/mchezo/AnswerReview.js";
import { MchezoLibrary } from "./components/mchezo/MchezoLibrary.js";
import { isOvertakenReply, isProjection, readJson } from "./http.js";
import { MchezoStudio } from "./components/mchezo/MchezoStudio.js";
import { BriefingScreen, BriefingTv, type StartNowResult } from "./components/mchezo/Briefing.js";
import { resolveReducedMotion } from "./ui/mchezo/lib/motion.js";
import { GAME_MANIFESTS } from "../../../src/games/manifest.js";
import { shuffle } from "../../../src/games/shuffle.js";
import { reactionIdToEmoji, toMzPlayers, toMzReactions } from "./components/mchezo/adapters.js";
import { previousGameScores } from "./ui/mchezo/lib/standings.js";
import { humanError, NOT_DELIVERED } from "./ui/mchezo/lib/errors.js";
import { midrank } from "./components/midrank.js";
import { sendIntent } from "./components/intentRetry.js";
import { connection, roomNotices } from "./connectionStore.js";
import { seats } from "./session.js";
import { setRefreshNeeded } from "./components/RefreshBanner.js";
import { CLIENT_PROTOCOL, clientNeedsRefresh, PROTOCOL_PARAM } from "../../../src/shared/clientProtocol.js";
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
/** Mirrors the server's MIN_OFFICIAL_COMPETITORS (D1). */
const MIN_OFFICIAL_PLAYERS = 2;
type View = "lobby" | "championship" | "tv" | "memory" | "library" | "studio";
const SUB_TO_VIEW: Record<RoomSub, View> = { lobby: "lobby", cup: "championship", tv: "tv", memories: "memory", library: "library", studio: "studio" };
const VIEW_TO_SUB: Record<View, RoomSub> = { lobby: "lobby", championship: "cup", tv: "tv", memory: "memories", library: "library", studio: "studio" };
const LOBBY: Route = { name: "room", sub: "lobby" };
const HOME: Route = { name: "home" };
/**
 * Stage 2: before the first render, put a fresh page load on a screen that
 * matches this tab's seat. A tab that holds a seat and loads Home or Host goes
 * to its room (a reload never strands a player outside their game); a tab with
 * no seat that loads a room address goes Home. Nothing about the seat changes.
 */
function bootRoute(): void {
  try {
    const { route } = parseRoute(location.pathname, location.search);
    const seated = !!seats.current();
    const spectating = !!(tabGet("cgn_spec_roomId") && tabGet("cgn_spec_token"));
    let to: Route | null = null;
    if (seated && (route.name === "home" || route.name === "host")) to = LOBBY;
    else if (!seated && !spectating && route.name === "room") to = HOME;
    if (to) history.replaceState(null, "", routeUrl(to));
    stampEntry();
  } catch { /* no history API: render whatever the address says */ }
}
const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = seats.token();
  if (token) headers["x-session-token"] = token;
  const r = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
  return readJson<T>(r);
}
async function get<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = seats.token();
  if (token) headers["x-session-token"] = token;
  const r = await fetch(path, { headers });
  return readJson<T>(r);
}

export function App() {
  // Stage 2 routing: the boot redirect runs once, before the route is read.
  useState(() => { bootRoute(); return true; });
  const { route, sheet, game: sheetGame, navigate, openSheet, closeSheet, back } = useRoute();
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
  // The room's screens are addresses now (/room, /room/cup, …), so browser
  // Back, in-app Back and iOS swipe-back agree. `view` is read from the route.
  const view: View = route.name === "room" ? SUB_TO_VIEW[route.sub] : "lobby";
  const toLobby = () => back(LOBBY);
  function setView(v: View) {
    // One room screen to another (Cup → TV) replaces the entry, so history
    // is always "lobby → this screen" and Back or "Lobby" returns to the lobby.
    if (v !== "lobby") navigate({ name: "room", sub: VIEW_TO_SUB[v] }, { replace: route.name === "room" && route.sub !== "lobby" });
    else if (route.name === "room" && route.sub !== "lobby") toLobby();
  }
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  /** Stage 5: the last player action in a game that failed, shown on that game's screen only. */
  const [actionError, setActionError] = useState<{ gid: string; text: string } | null>(null);
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
  // Animation preference applies on EVERY screen (audit F8): the OS
  // reduced-motion setting is a floor; the in-app setting can only reduce
  // further, and "Off" stops all motion.
  const osReducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = { reducedMotion: resolveReducedMotion(settings.anim, osReducedMotion) ? true : undefined, still: settings.anim === "off" };
  // D3: tell everyone when a briefing ended without play (host cancel or the
  // five-minute guard). The server removed it; nothing was scored or used.
  const [briefingNote, setBriefingNote] = useState("");
  const lastBriefingRef = useRef<string | null>(null);
  // A-05 (live audit): a player in a game whose briefing just opened, but who
  // is on another screen (Library, Studio, Championship, Memory Book), is
  // brought to it once, so they see the rules and can tap Ready. Not the TV
  // view: a laptop used as a TV seat keeps showing the TV (it offers a way back).
  const summonedRef = useRef<string | null>(null);
  useEffect(() => {
    const now = proj?.games ?? [];
    const open = now.find((g) => g.status === "briefing");
    if (open) { lastBriefingRef.current = open.id; setBriefingNote(""); return; }
    const last = lastBriefingRef.current;
    lastBriefingRef.current = null;
    if (last && !now.some((g) => g.id === last)) setBriefingNote("The game was cancelled before it started. Nothing was scored and no questions were used up.");
  }, [proj]);
  useEffect(() => {
    const open = (proj?.games ?? []).find((g) => g.status === "briefing");
    if (!open || !playerId || !open.players.includes(playerId) || summonedRef.current === open.id) return;
    summonedRef.current = open.id;
    if (view === "library" || view === "studio" || view === "championship" || view === "memory") setView("lobby");
  }, [proj, view, playerId]);
  // Mchezo lobby: the host-chosen "up next" game (default: Trivia, the
  // Phase 2 featured game). The lobby Start button starts this game.
  // Kept per tab, so a reload or a trip to the library keeps the host's pick.
  const [upNextId, setUpNextIdRaw] = useState(() => tabGet("mz_upnext") ?? "trivia");
  // S3-LOB-02: the host's own choices are published to the room (planChosen
  // counts them), so guests and the TV see the same game and mode.
  const [planChosen, setPlanChosen] = useState(0);
  const setUpNextId = (id: string) => { tabSet("mz_upnext", id); setUpNextIdRaw(id); setPlanChosen((n) => n + 1); };
  // A game picked from Home's details sheet before the room exists.
  const [hostPick, setHostPick] = useState<string | null>(null);
  // Phase 2.1 lobby simplification: one mode for the single Start action,
  // and one compact chooser instead of per-game official/practice buttons.
  const [gameMode, setGameModeRaw] = useState<"official" | "practice">("official");
  const setGameMode = (m: "official" | "practice") => { setGameModeRaw(m); setPlanChosen((n) => n + 1); };
  // "Remember this device": default OFF, explicit per join (Sprint 2).
  const [rememberOnJoin, setRememberOnJoin] = useState(false);
  const [seatRemembered, setSeatRemembered] = useState(() => seats.current()?.remembered ?? false);
  const rememberedSeats = useRememberedSeats();
  const [recoverMode, setRecoverMode] = useState(false);
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
  // Stage 4: what is on screen, and how many projections have been shown, so
  // a poll overtaken by a newer push can't roll the screen back (http.ts).
  const shown = useRef<{ n: number; roomId?: string; seq?: number }>({ n: 0 });
  const showProjection = useCallback((p: Projection) => {
    shown.current = { n: shown.current.n + 1, roomId: p.roomId, seq: p.seq };
    setProj(p);
  }, []);
  const refresh = useCallback(async () => {
    if (!roomId || !playerId) return;
    try {
      const before = shown.current.n;
      const next = await get<unknown>(`/rooms/${roomId}/projection?audience=player`);
      // S3-LOB-03: only the room's own projection replaces what's on screen.
      if (!isProjection(next)) throw new Error("The game server sent an unexpected reply. Retrying…");
      if (isOvertakenReply(next as Projection, shown.current, shown.current.n !== before)) { pollFailures.current = 0; return; }
      showProjection(next as Projection);
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
  // A QR or invite link (/join?code=…) fills in the code.
  const routeCode = route.name === "join" || route.name === "watch" ? route.code : undefined;
  useEffect(() => { if (routeCode) setCode(routeCode); }, [routeCode]);
  // An invite link to the room this tab already sits in just opens the room.
  useEffect(() => {
    if (route.name === "join" && routeCode && roomId && playerId && proj?.joinCode === routeCode) navigate(LOBBY, { replace: true });
  }, [route.name, routeCode, roomId, playerId, proj?.joinCode, navigate]);
  const catalog = useMemo(() => buildCatalog(GAME_MANIFESTS, games.map((g) => ({ id: g.id, lifecycle: g.lifecycle }))), [games]);
  const featured = useMemo(() => featuredOfTheDay(catalog, new Date()), [catalog]);
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
        const wsUrl = `${proto}://${location.host}/?roomId=${roomId}&audience=player&${PROTOCOL_PARAM}=${CLIENT_PROTOCOL}`;
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
            if (m.kind === "projection" && isProjection(m.state)) {
              showProjection(m.state);
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
    setRoomId(r.roomId); setPlayerId(r.playerId); setToken(r.recoveryToken);
    // From a form (Join, Host, recovery) the room replaces it; from Home it is a new step.
    navigate(LOBBY, { replace: route.name !== "home" });
  }
  /** This device stops using the seat (sign out / session replaced). The seat stays in the game. */
  function leaveSeatOnThisDevice(note?: string) {
    seats.signOut();
    connection.reset();
    setRoomId(null); setPlayerId(null); setToken(null); setProj(null);
    navigate(HOME, { replace: true });
    if (note) setMsg(note);
  }
  async function createRoom() {
    // A-04 (live audit): the host types a name before the room exists, so
    // nobody hosts as "Player 1".
    if (!name.trim()) { setErr("Type your name first, so your players know whose party it is."); return; }
    setErr(""); try {
      const r = await post<JoinResponse>("/rooms", { name: "Christmas Game Night" });
      const j = await post<JoinResponse>(`/rooms/${r.roomId}/join`, { displayName: name.trim(), asHost: true, hostClaimToken: r.hostClaimToken });
      // The lobby itself shows the new room and its code; no extra message.
      await saveSession({ ...j, roomId: r.roomId }); setMsg("");
    } catch (e) { fail(e); }
  }
  async function joinRoom() {
    setErr(""); try {
      const j = await post<JoinResponse>("/rooms/join-by-code", { joinCode: code, displayName: name || "Player" });
      await saveSession(j); setMsg("");
    } catch (e) { fail(e); }
  }
  async function spectate() {
    setErr(""); try {
      const s = await post<SpectateResponse>("/rooms/spectate-by-code", { joinCode: code });
      tabSet("cgn_spec_roomId", s.roomId); tabSet("cgn_spec_token", s.spectatorToken);
      setSpecRoomId(s.roomId); setSpecToken(s.spectatorToken); setMsg("Watching — no seat taken.");
      navigate({ name: "watch", code: code.toUpperCase() }, { replace: true });
    } catch (e) { fail(e); }
  }
  function stopWatching() {
    tabSet("cgn_spec_roomId", null); tabSet("cgn_spec_token", null);
    setSpecRoomId(null); setSpecToken(null); setProj(null); setMsg("Stopped watching.");
    navigate(HOME, { replace: true });
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
        const next = await readJson<unknown>(r);
        if (isProjection(next)) setProj(next as Projection); // S3-LOB-03: never a proxy page
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
        next.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.kind === "projection" && isProjection(m.state)) setProj(m.state); } catch { /* ignore malformed WS frame; polling continues */ } };
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
  // ---- D3 briefing actions (the server decides; these only ask) ----
  async function briefingReady(gameInstanceId: string, ready: boolean) {
    await intent(gameInstanceId, "briefing-ready", { ready });
  }
  async function briefingStartNow(gameInstanceId: string, confirmed: string[]): Promise<StartNowResult> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const t = seats.token();
    if (t) headers["x-session-token"] = t;
    try {
      const resp = await fetch(`/rooms/${roomId}/games/${gameInstanceId}/start-now`, { method: "POST", headers, body: JSON.stringify({ confirmed }) });
      const body = (await resp.json().catch(() => ({}))) as { error?: string; code?: string; needsConfirmation?: string[] };
      await refresh();
      return resp.ok ? { ok: true } : { ok: false, code: body.code, error: body.error, needsConfirmation: body.needsConfirmation };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Couldn’t reach the game. Try again." };
    }
  }
  async function briefingCancel(gameInstanceId: string) {
    try { await post(`/rooms/${roomId}/games/${gameInstanceId}/cancel`, {}); } catch (e) { fail(e); }
    await refresh();
  }

  async function intent(gameInstanceId: string, action: string, payload: Record<string, unknown>): Promise<void> {
    await sendAction(gameInstanceId, action, payload);
  }
  /** Sends one player action. Resolves true only when the server accepted it (never throws). */
  async function sendAction(gameInstanceId: string, action: string, payload: Record<string, unknown>): Promise<boolean> {
    setErr(""); setActionError(null);
    const failed = (raw: string) => { reportError(raw); setActionError({ gid: gameInstanceId, text: humanError(raw) }); };
    try {
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
      if (!r.accepted) failed(r.reason === "PHASE_CLOSED" ? "Time was up for that one — it wasn’t counted." : r.reason === "READY_LOCKED" ? "The game has already started." : `Not accepted: ${r.reason || "unknown"}`); else setMsg("Saved.");
      await refresh();
      return r.accepted === true;
    } catch (e) {
      // A TypeError is fetch's "no answer" (offline, dropped connection) after
      // every retry: the server never saw it. Say so, not "Failed to fetch".
      failed(e instanceof TypeError ? NOT_DELIVERED : e instanceof Error ? e.message : "Request failed");
      return false;
    }
  }
  /**
   * E3: the TV dashboard's answers. Only what the public projection already
   * reveals: a finished game's answers, or Closest Wins' closed questions
   * (the latest one while the game plays). Trivia has its own TV stage.
   */
  function tvAnswers(g: PublicGame | undefined) {
    if (!g || g.gameId === "trivia") return null;
    const rows = reviewRows(g, undefined, g);
    if (rows.length === 0) return null;
    const title = games.find((x) => x.id === g.gameId)?.title ?? g.gameId;
    return g.status === "playing"
      ? <AnswerReview rows={rows.slice(-1)} tv title={`${title}: last answer`} testId="tv-answer-review" />
      : <AnswerReview rows={rows} tv title={`${title}: answers`} testId="tv-answer-review" />;
  }
  // S3-LOB-02 (hooks: above every early return). The host's plan for the
  // next game is published to the room: on each of the host's own choices,
  // and once when the room has none (a new room, or after a server restart).
  // Never in reply to the room's plan, so two host tabs can't bounce it back
  // and forth; a plan chosen in another host tab (or by the cohost) is adopted.
  // S3-NAV-02: inside the room, Back always has this app's Home (with Rejoin) beneath it.
  useEffect(() => { if (roomId && playerId && route.name === "room") anchorHomeBelow(); }, [roomId, playerId, route.name]);
  const planMe = proj?.players.find((p) => p.id === playerId);
  const planner = !!(planMe?.isHost || planMe?.isCohost);
  const serverPlan = proj?.upNext;
  const localPlan = (() => {
    const g = games.find((x) => x.id === upNextId) ?? games[0];
    return g ? { gameId: g.id, official: g.lifecycle?.officialEligible !== false && gameMode === "official" } : undefined;
  })();
  const publishPlan = (plan: { gameId: string; official: boolean } | undefined) => {
    if (!roomId || !plan) return;
    void post(`/rooms/${roomId}/plan`, plan).catch(() => { /* the lobby still works; guests just see less */ });
  };
  useEffect(() => { if (planner && planChosen > 0) publishPlan(localPlan); }, [planChosen]);
  useEffect(() => { if (planner && proj && !serverPlan) publishPlan(localPlan); }, [planner, !!proj, !!serverPlan, games.length > 0]);
  useEffect(() => {
    if (!planner || !serverPlan) return;
    if (serverPlan.gameId !== upNextId) { tabSet("mz_upnext", serverPlan.gameId); setUpNextIdRaw(serverPlan.gameId); }
    const m = serverPlan.official ? "official" : "practice";
    if (m !== gameMode && games.find((g) => g.id === serverPlan.gameId)?.lifecycle?.officialEligible !== false) setGameModeRaw(m);
  }, [planner, serverPlan?.gameId, serverPlan?.official]);
  /** TV / spectator screen for the Sprint 4 games (never answers or authors while playing). */
  /**
   * Stage 5 (S5-A): the live show, for the room's TV and for spectators. It
   * gets the room's public feed only (tvFeedFrom), never `me` or `myGames`.
   * Trivia keeps its own stage and the briefing its own TV screen.
   */
  function tvShowScreen(onBack: () => void, backLabel: string) {
    if (!proj) return null;
    const feed = tvFeedFrom(proj);
    const titleOf = (id: string) => games.find((x) => x.id === id)?.title ?? id;
    return (
      <MchezoProvider theme={themes.everyday} {...motion} as="bare">
        <TvShow
          feed={feed}
          registry={games}
          onBack={onBack}
          backLabel={backLabel}
          renderLive={(g) => g.gameId === "caption-clash"
            ? <div className="mz-tvshow-game" data-testid="mz-cap-tv"><GameClock game={g} tv /><CaptionTv game={g} /></div>
            : g.gameId === "word-connections"
              ? <div className="mz-tvshow-game" data-testid="mz-cx-tv"><GameClock game={g} tv /><ConnectionsTv game={g} title={titleOf(g.gameId)} players={feed.players} /></div>
              : g.gameId === "closest-wins" ? <ClosestTv game={g} title={titleOf(g.gameId)} />
              : g.gameId === "impostor" ? <ImpostorTv game={g} title={titleOf(g.gameId)} />
              : g.gameId === "majority-rules" ? <MajorityTv game={g} title={titleOf(g.gameId)} nameOf={(id) => feed.players.find((p) => p.id === id)?.displayName ?? "A player"} />
              : null}
          renderFinal={(g) => g.gameId === "word-connections"
            ? <div className="mz-tvshow-game" data-testid="mz-cx-tv"><ConnectionsTv game={g} title={titleOf(g.gameId)} players={feed.players} /></div>
            : null}
          renderReview={(g) => g.gameId === "caption-clash"
            ? <div className="mz-tvshow-game" data-testid="mz-cap-tv"><CaptionTv game={g} /></div>
            : g.gameId === "majority-rules" ? <div className="mz-tvshow-game"><MajorityReview game={g} /></div>
            : tvAnswers(g)}
        />
      </MchezoProvider>
    );
  }
  async function loadMemory() {
    try { setBook(await get<MemoryEntry[]>(`/rooms/${roomId}/memory`)); setLedger(await get<LedgerEvent[]>(`/rooms/${roomId}/ledger`)); } catch (e) { fail(e); }
  }
  useEffect(() => { if (view === "memory" && roomId) loadMemory(); }, [view, roomId]);
  useEffect(() => {
    if (!proj?.joinCode) return;
    const url = `${location.origin}/join?code=${proj.joinCode}`;
    QRCode.toDataURL(url, { width: 220, margin: 2 }).then(setQrUrl).catch(() => {});
  }, [proj?.joinCode]);

  // Landing shows unless a player session exists — or a spectator session
  // does (spectator tabs skip landing and render the TV-only branch below).
  if ((!roomId || !playerId) && !(specRoomId && specToken) && recoverMode) {
    // (Seat recovery keeps its own flow; it starts from Home or Join.)
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
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
  // ---- Stage 2 entry screens: Home, Join, Host, the library (no room) ----
  // Shown to a tab with no seat (and not spectating), and to a seated tab that
  // stepped out of its room with Back: the room keeps running and Home offers
  // Rejoin. The seat, socket and polling are untouched by any of these.
  const seated = !!(roomId && playerId);
  const spectating = !!(specRoomId && specToken);
  if ((!seated && !spectating) || (seated && route.name !== "room")) {
    const status: ReactNode = err || msg ? (
      <div className="mz-entry__status">
        {err && <p className="err" data-testid="mz-error" role="alert">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
      </div>
    ) : null;
    const remember = <RememberChoice checked={rememberOnJoin} onChange={setRememberOnJoin} />;
    const lostSeat = () => { setErr(""); setRecoverMode(true); };
    const welcome = !seated ? (
      <WelcomeBack
        verified={rememberedSeats.verified}
        notes={rememberedSeats.notes}
        onContinue={(v) => { void saveSession({ roomId: v.seat.roomId, playerId: v.seat.playerId, recoveryToken: v.seat.token, displayName: v.displayName } as JoinResponse, { remember: true }); setMsg(`Welcome back, ${v.displayName}.`); }}
        onForget={(v) => rememberedSeats.forget(v.seat)}
      />
    ) : null;
    // One seat per tab: joining or hosting another room from here would drop
    // this tab's credential for the current one, so it is a deliberate step.
    const seatedNotice = seated ? (
      <NoticeCard tone="info" title={`You’re already in room ${proj?.joinCode ?? ""} on this phone`} testId="seated-notice"
        action={<button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="seated-go-room" onClick={() => navigate(LOBBY)}>Go to my room</button>}>
        To join or host a different room, leave this one first: open its room menu, then This device → Sign out on this device. Your seat and points stay in the game.
      </NoticeCard>
    ) : null;
    const myBriefing = (proj?.games ?? []).some((g) => g.status === "briefing" && !!playerId && g.players.includes(playerId));
    const myPlaying = (proj?.myGames ?? []).some((g) => g.status === "playing" && g.participant !== false);
    let screen: ReactNode;
    if (route.name === "join" || route.name === "watch") {
      screen = (
        <JoinScreen
          code={code} onCodeChange={setCode} name={name} onNameChange={setName}
          onJoin={joinRoom} onSpectate={spectate} onBack={() => back(HOME)} onLostSeat={lostSeat}
          remember={remember} blocked={seated}
          notice={seated ? seatedNotice : welcome}
          watch={route.name === "watch"}
          status={status}
        />
      );
    } else if (route.name === "host") {
      screen = (
        <HostScreen
          name={name} onNameChange={setName} onHost={createRoom} onBack={() => back(HOME)}
          remember={remember} blocked={seated} notice={seatedNotice}
          firstGame={hostPick ? catalog.find((g) => g.id === hostPick) : undefined}
          status={status}
        />
      );
    } else if (route.name === "library") {
      screen = <MchezoLibrary manifests={GAME_MANIFESTS} catalog={catalog} canSelect={false} inRoom={false}
        filters={filtersFromQuery(route.lib ?? "")}
        onFiltersChange={(f) => { const lib = filtersToQuery(f); navigate(lib ? { name: "library", lib } : { name: "library" }, { replace: true }); }}
        onSelect={() => {}} onDetails={(id) => openSheet("details", id)} onBack={() => back(HOME)} />;
    } else {
      screen = (
        <HomeScreen
          catalog={catalog} featured={featured}
          onOpenGame={(id) => openSheet("details", id)}
          onJoin={() => navigate({ name: "join" })}
          onHost={() => navigate({ name: "host" })}
          onLibrary={() => navigate({ name: "library" })}
          onSettings={() => openSheet("settings")}
          onLostSeat={lostSeat}
          rejoin={seated ? { code: proj?.joinCode ?? "", state: myPlaying ? "game" : myBriefing ? "briefing" : "lobby", onRejoin: () => navigate(LOBBY) } : null}
          welcome={welcome}
          status={status}
        />
      );
    }
    const details = sheet === "details" && sheetGame ? catalog.find((g) => g.id === sheetGame) : undefined;
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        {screen}
        {details && (
          <GameDetailsSheet
            game={details}
            onClose={closeSheet}
            action={!seated ? <button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="details-host" onClick={() => { setUpNextId(details.id); setHostPick(details.id); navigate({ name: "host" }); }}>Host this game</button> : undefined}
          />
        )}
        {sheet === "settings" && (
          <Sheet title="Settings" onClose={closeSheet} testId="settings-sheet">
            <SettingsBar anim={settings.anim} onSetAnim={settings.setAnimSetting} osReducedMotion={osReducedMotion} />
          </Sheet>
        )}
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
    const specLatest = (proj?.games ?? []).at(-1);
    noteServerTime(proj?.serverNow);
    const specTvGame = specLatest?.gameId === "trivia" && (specLatest.status === "playing" || specLatest.status === "finished") ? specLatest : undefined;
    if (!proj) {
      return (
        <MchezoProvider theme={themes.everyday} {...motion}>
          <div style={{ padding: 24 }}>
            <p className="mz-foot">Finding the game…</p>
            <button type="button" className="mz-chip-btn" onClick={stopWatching}>Stop watching</button>
            {err && <p className="err">{err}</p>}
          </div>
        </MchezoProvider>
      );
    }
    if (specLatest?.status === "briefing" && specLatest.briefing) {
      return (
        <MchezoProvider theme={themes.everyday} {...motion}>
          <BriefingTv key={specLatest.id} game={specLatest} registry={games.find((x) => x.id === specLatest.gameId)} players={specPlayers} joinCode={proj.joinCode} onBack={stopWatching} backLabel="Stop watching" />
        </MchezoProvider>
      );
    }
    if (specTvGame) {
      return (
        <MchezoProvider theme={themes.everyday} {...motion} as="bare">
          <MchezoTvStage key={specTvGame.id} publicGame={specTvGame} players={specPlayers} joinCode={proj.joinCode ?? "…"} onBack={stopWatching} spectatorCount={proj.spectatorCount} backLabel="Stop watching" previousScores={previousGameScores(proj?.games ?? [], specTvGame.id)} />
        </MchezoProvider>
      );
    }
    return tvShowScreen(stopWatching, "Stop watching");
  }

  // A-06 (live audit): until this phone has its room's first projection, say
  // so honestly. It used to draw an empty lobby ("You're in, friend · 0 here")
  // while a slow connection (the preview proxy) caught up.
  if (roomId && playerId && !proj) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <main className="mz-screen" aria-label="Rejoining your room" data-testid="rejoining">
          <span className="mz-kicker" role="status" aria-live="polite">Rejoining your room…</span>
          <h1 className="mz-h1">One moment</h1>
          <p className="mz-foot">Your seat, your name and your points are saved on the server. This screen updates by itself as soon as the room answers.</p>
          {/* The same Reconnect action and error line as the lobby (full gate,
              check-errors: a rejected credential after a reload lands here).
              The actions sit at the bottom: the connection banner is pinned to
              the top of the screen and must never cover them. */}
          {err && <p className="err" role="alert" data-testid="mz-error">{err}</p>}
          <div className="mz-grow" />
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12 }}>
            <button type="button" className="mz-chip-btn" onClick={() => void reconnect()}>Reconnect</button>
            {err && <button type="button" className="mz-chip-btn" onClick={() => leaveSeatOnThisDevice()}>Back to the start</button>}
          </div>
        </main>
      </MchezoProvider>
    );
  }

  const players: PublicPlayer[] = proj?.players ?? [];
  const myGames: PlayerGame[] = proj?.myGames ?? [];
  const me = players.find((p) => p.id === playerId);
  // Standings come from the server only (RoomEngine.officialStandings); the
  // TV and the Cup screen read them from the projection. No client recompute.
  const nameOf = (id: string): string => players.find((p) => p.id === id)?.displayName ?? id;
  // Only a game this player is in. Someone who joined the room after it
  // started isn't in its roster: they stay in the lobby (the server refuses
  // their answers anyway). The old 8 s intro used to hide this; D3 removed it.
  const playingGame = myGames.find((g) => g.status === "playing" && g.participant !== false);
  const watchingGame = myGames.find((g) => g.status === "playing" && g.participant === false);
  // Countdowns use the server's clock, never this phone's own clock alone.
  noteServerTime(proj?.serverNow);
  // Deferred: the banner is another component and must not update during this render.
  const refreshNeeded = clientNeedsRefresh(proj?.protocol?.min) || myGames.some((g) => g.refreshNeeded === true);
  queueMicrotask(() => setRefreshNeeded(refreshNeeded));
  // A-07 (live audit): only a game this player was in. Someone who joined
  // after a game finished stays in the lobby instead of landing on its
  // results as "Did not answer · 0 points" (the server never scored them).
  const latestFinished = myGames.filter((g) => g.status === "finished" && g.participant !== false).slice(-1)[0];
  // Stage 5: one failure line for every game screen that has no inline one,
  // shown only for the game the failed action was for, cleared by the next send.
  const sendFailure = actionError && playingGame && actionError.gid === playingGame.id
    ? <p className="err mz-send-fail" role="alert" data-testid="mz-send-error">{actionError.text}</p>
    : null;
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
  const mzPlayers = toMzPlayers(players);
  // Stage 3: the top of every results screen. Built only from the server's
  // recorded scores and this player's own participation (lib/celebrate.ts),
  // so every phone tells the same story.
  const resultsHero = (g: PlayerGame, pub?: PublicGame) => {
    const scores = pub?.rawScores ?? g.rawScores ?? {};
    const title = games.find((x) => x.id === g.gameId)?.title ?? g.gameId;
    const official = pub?.official ?? g.official ?? false;
    const story = resultsStory({
      gameInstanceId: g.id, title, official, scores, nameOf,
      youId: playerId ?? undefined,
      yourParticipation: playerId ? g.outcome?.participation[playerId] : undefined,
      youSatOut: g.abstained === true,
    });
    return <ResultsHero story={story} gameId={g.gameId} title={title} official={official} players={mzPlayers} points={playerId && playerId in scores ? scores[playerId] : undefined} />;
  };
  const mzReactions = toMzReactions(proj?.reactions, players);
  const mzReact = async (r: ReactionId) => {
    try { await post(`/rooms/${roomId}/reactions`, { emoji: reactionIdToEmoji(r) }); await refresh(); } catch { /* non-fatal */ }
  };
  const mzNudge = async (targetId: string) => {
    try { await post(`/rooms/${roomId}/nudge`, { targetId }); await refresh(); } catch { /* non-fatal */ }
  };
  // S3-LOB-02: the host (or cohost) chooses; everyone else sees the room's
  // plan, never their own tab's default (which used to show guests "Trivia"
  // whatever the host had picked). planner/serverPlan are set above the
  // early returns, with the hooks that publish and adopt the plan.
  const upNext = planner ? (games.find((g) => g.id === upNextId) ?? games[0]) : games.find((g) => g.id === serverPlan?.gameId);
  // Practice-only games (Impostor, Charades) can't count: the server refuses
  // them as official, so the lobby starts them as practice and says why.
  const upNextPracticeOnly = upNext?.lifecycle?.officialEligible === false;
  const startMode: "official" | "practice" = upNextPracticeOnly ? "practice" : planner ? gameMode : serverPlan?.official ? "official" : "practice";

  // D1: the server refuses official starts with fewer than 2 competitors. Say so
  // before Start, with an explicit switch — the mode is never changed silently.
  const wouldPlayCount = proj?.readiness?.wouldPlay.length ?? players.filter((p) => p.connected).length;
  const officialShort = wouldPlayCount < MIN_OFFICIAL_PLAYERS;
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
  const connectionsPlaying = playingGame?.gameId === "word-connections";
  const connectionsFinished = latestFinished?.gameId === "word-connections";
  const captionPlaying = playingGame?.gameId === "caption-clash";
  const captionFinished = latestFinished?.gameId === "caption-clash";
  // Stage 5 (Practice-only games).
  const majorityPlaying = playingGame?.gameId === "majority-rules";
  const majorityFinished = latestFinished?.gameId === "majority-rules";
  const yearPlaying = playingGame?.gameId === "guess-the-year";
  const geographyPlaying = playingGame?.gameId === "geography";
  const mathPlaying = playingGame?.gameId === "math-mayhem";
  const triviaFinished = latestFinished?.gameId === "trivia";
  // ---- Stage 2: Lobby A and its sheets (Invite, Choose game, Room menu, game details) ----
  const isHostish = !!(me?.isHost || me?.isCohost);
  const upNextGame = catalog.find((g) => g.id === upNext?.id);
  const hostName = players.find((p) => p.isHost)?.displayName;
  const connectedNow = players.filter((p) => p.connected).length;
  const cupLabel = proj?.competition?.label ?? "Family Cup";
  const inviteUrl = proj?.joinCode ? `${location.origin}/join?code=${proj.joinCode}` : "";
  const roomDetails = sheet === "details" && sheetGame ? catalog.find((g) => g.id === sheetGame) : undefined;
  const roomSheets = (
    <>
      {sheet === "invite" && proj?.joinCode && (
        <InviteSheet code={proj.joinCode} url={inviteUrl} qrDataUrl={qrUrl || undefined} reach={linkReach(location.hostname)} onClose={closeSheet} />
      )}
      {sheet === "choose" && isHostish && (
        <ChooseGameSheet
          catalog={catalog}
          upNextId={upNext?.id}
          playerCount={connectedNow > 0 ? connectedNow : players.length}
          onPick={(id) => { setUpNextId(id); setShuffleResult(null); closeSheet(); }}
          onSurprise={() => { runShuffle("random"); closeSheet(); }}
          onSmart={() => { runShuffle("smart"); closeSheet(); }}
          onClose={closeSheet}
        />
      )}
      {sheet === "menu" && (
        <RoomMenuSheet
          cupLabel={cupLabel}
          dayLabel={`Day ${proj?.championshipDay ?? 1}/7`}
          isHost={isHostish}
          onTv={() => setView("tv")}
          onCup={() => setView("championship")}
          onMemory={() => setView("memory")}
          onLibrary={() => setView("library")}
          onStudio={isHostish ? () => setView("studio") : undefined}
          onHome={() => navigate(HOME)}
          onReconnect={() => { void reconnect(); }}
          // While the menu is open its messages show here (and not in the dock).
          message={err || msg ? <div className="mz-menu__msg">{err && <p className="err">{err}</p>}{msg && <p className="ok" role="status">{msg}</p>}</div> : undefined}
          phone={<SettingsBar anim={settings.anim} onSetAnim={settings.setAnimSetting} osReducedMotion={osReducedMotion} />}
          device={
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
          }
          hostTools={players.filter((p) => p.id !== playerId).length > 0 ? (
            <div className="mz-card mz-menu__card" aria-label="Players and cohosts">
              <span className="mz-kicker">Players and cohosts</span>
              {players.filter((p) => p.id !== playerId).map((p) => (
                <div key={p.id} className="mz-menu__player">
                  <span className="mz-menu__pname">{p.displayName}{p.isCohost ? " · cohost" : ""}</span>
                  {!p.isCohost && <button type="button" className="mz-chip-btn" onClick={async () => { try { await post<Record<string, unknown>>(`/rooms/${roomId}/cohost`, { targetId: p.id }); } catch (e) { fail(e); } await refresh(); }}>Make cohost</button>}
                </div>
              ))}
            </div>
          ) : undefined}
          onClose={closeSheet}
        />
      )}
      {roomDetails && (
        <GameDetailsSheet
          game={roomDetails}
          onClose={closeSheet}
          roomPlayers={connectedNow}
          action={isHostish && roomDetails.id !== upNext?.id ? (
            <button type="button" className="mz-key mz-key--brand mz-key--md" data-testid="details-make-up-next" onClick={() => {
              setUpNextId(roomDetails.id); setShuffleResult(null);
              if (view === "library") toLobby(); else closeSheet();
            }}>Make this up next</button>
          ) : undefined}
        />
      )}
    </>
  );

  // D3: while a game is in its briefing, every phone shows its rules and who
  // is ready, whatever it was showing before (lobby or the last results).
  const briefingGame = (proj?.games ?? []).find((g) => g.status === "briefing");
  if (view === "lobby" && briefingGame?.briefing) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <BriefingScreen
          key={briefingGame.id}
          game={briefingGame}
          registry={games.find((x) => x.id === briefingGame.gameId)}
          players={players}
          meId={playerId ?? ""}
          isHost={!!(me?.isHost || me?.isCohost)}
          onReady={(ready) => briefingReady(briefingGame.id, ready)}
          onStartNow={(confirmed) => briefingStartNow(briefingGame.id, confirmed)}
          onCancel={() => briefingCancel(briefingGame.id)}
        />
      </MchezoProvider>
    );
  }

  if (view === "lobby" && isLobbyPhase) {
    // S5-B: the room's last finished game, for everyone, from recorded scores only.
    const roomGames = proj?.games ?? [];
    const gameOn = roomGames.some((g) => g.status === "playing" || g.status === "briefing");
    const lastDone = gameOn ? undefined : roomGames.filter((g) => g.status === "finished").at(-1);
    const lastGame = lastDone ? (() => {
      const scores = lastDone.rawScores ?? {};
      const mineScore = playerId ? scores[playerId] : undefined;
      const n = Object.keys(scores).length;
      const rank = mineScore === undefined ? 0 : 1 + Object.values(scores).filter((v) => v > mineScore).length;
      const tied = mineScore !== undefined && Object.values(scores).filter((v) => v === mineScore).length > 1;
      const yourLine = !playerId || !lastDone.players.includes(playerId) ? "You weren’t in this one."
        : mineScore === undefined ? undefined
        : n <= 1 ? `You played solo: ${mineScore} points.`
        : `You ${tied ? "tied for" : "came"} ${ordinal(rank)} of ${n} · ${mineScore} points.`;
      return { title: games.find((x) => x.id === lastDone.gameId)?.title ?? lastDone.gameId, mode: lastDone.official ? "official" as const : "practice" as const, headline: winnerLine(scores, nameOf), yourLine };
    })() : undefined;
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <RoomLobby
          lastGame={lastGame}
          firstTime={!roomGames.some((g) => g.status === "finished")}
          code={proj?.joinCode ?? "…"}
          sessionLabel={proj?.name ?? "Mchezo"}
          // Family Cup event data: 7 days is the approved championship
          // length; the current day comes from the server projection.
          championship={{ name: cupLabel, unitLabel: "Day", current: proj?.championshipDay ?? 1, total: 7 }}
          players={mzPlayers}
          youId={playerId ?? ""}
          isHost={isHostish}
          hostName={hostName}
          upNext={upNextGame}
          mode={upNext ? startMode : undefined}
          cupLabel={cupLabel}
          onChangeGame={isHostish ? () => openSheet("choose") : undefined}
          onGameDetails={upNext ? () => openSheet("details", upNext.id) : undefined}
          shuffleNote={shuffleResult}
          willPlay={proj?.readiness?.wouldPlay}
          minPlayers={startMode === "official" ? Math.max(MIN_OFFICIAL_PLAYERS, upNext?.minPlayers ?? 2) : (upNext?.minPlayers ?? 2)}
          capacity={10}
          reactions={mzReactions}
          onReact={mzReact}
          onNudge={mzNudge}
          nudgedBy={proj?.nudgedBy}
          onInvite={() => openSheet("invite")}
          onMenu={() => openSheet("menu")}
          top={isHostish ? (
            <RecoveryRequestsCard
              requests={proj?.recoveryRequests ?? []}
              onDecide={async (r, approve) => {
                try { await post(`/rooms/${roomId}/recovery-requests/${r.requestId}/${approve ? "approve" : "deny"}`, approve ? { playerId: r.playerId } : {}); } catch (e) { fail(e); }
                await refresh();
              }}
            />
          ) : undefined}
          notice={briefingNote ? <NoticeCard tone="info" title="Game cancelled" testId="briefing-cancelled-note" action={<button type="button" className="mz-chip-btn" onClick={() => setBriefingNote("")}>OK</button>}>{briefingNote}</NoticeCard>
            : watchingGame ? <NoticeCard tone="info" title={`${games.find((x) => x.id === watchingGame.gameId)?.title ?? "A game"} is being played`} testId="not-in-game-note">It started before you joined, so you’ll play the next one.</NoticeCard>
            : undefined}
          error={err || undefined}
          message={sheet === "menu" ? undefined : msg || undefined}
          onStart={upNext ? () => startGame(upNext.id, startMode === "official") : undefined}
          startTestId={upNext ? `start-${startMode}-${upNext.id}` : undefined}
          setup={upNext && (<>
          <div className="mz-mode" data-testid="mode-choice">
            <span className="mz-kicker mz-kicker--muted">How should {upNext.title} count?</span>
            <SegmentedChoice
              label="Game mode"
              value={startMode}
              onChange={(v) => setGameMode(v as "official" | "practice")}
              options={[
                { value: "official", title: "Official", tone: "sun", testId: "mode-official", disabled: upNextPracticeOnly, detail: upNextPracticeOnly ? "Not available for this game" : `Counts toward the ${cupLabel}` },
                { value: "practice", title: "Practice", tone: "mint", testId: "mode-practice", detail: "Just for fun · no Cup points" },
              ]}
            />
            {upNextPracticeOnly && <p className="mz-foot" style={{ margin: "8px 0 0", fontWeight: 600 }} data-testid="practice-only-note">Practice only: {upNext.lifecycle?.practiceOnlyReason}</p>}
            {startMode === "official" && officialShort && (
              <NoticeCard testId="official-needs-two" title="Official games need at least 2 players"
                action={<button type="button" className="mz-key mz-key--surface mz-key--md" data-testid="switch-to-practice" onClick={() => setGameMode("practice")}>Play it as practice instead</button>}>
                Only games with 2 or more players can count toward the {cupLabel}. Wait for someone to join, or play this one as practice.
              </NoticeCard>
            )}
          </div>
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
        </>)}
        />
        {roomSheets}
      </MchezoProvider>
    );
  }
  // Word Connections (Sprint 4): its own intro, puzzle and results screens.
  if (view === "lobby" && showPhase === "intro" && connectionsPlaying && playingGame) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <GameIntro
          title={games.find((x) => x.id === playingGame.gameId)?.title ?? "Word Connections"}
          objective="Find four groups of four."
          accent={2}
          steps={["Sixteen words hide four secret groups.", "Tap four words that belong together, then Submit.", "Four mistakes and your puzzle ends — the groups you found still count."]}
          onStart={() => dismissIntro(playingGame.id)}
        />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && (showPhase === "gameplay" || showPhase === "waiting") && connectionsPlaying && playingGame) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <GameClock game={playingGame} />
        {sendFailure}
        <MchezoConnections game={playingGame} publicGame={publicPlaying} players={players} playerId={playerId ?? ""} title={games.find((x) => x.id === playingGame.gameId)?.title ?? "Word Connections"} intent={sendAction} />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && showPhase === "results" && connectionsFinished && latestFinished) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <MchezoConnectionsResults game={latestFinished} publicGame={publicFinished} players={players} playerId={playerId ?? ""} title={games.find((x) => x.id === latestFinished.gameId)?.title ?? "Word Connections"} onBackToLobby={() => dismissResults(latestFinished.id)} hero={resultsHero(latestFinished, publicFinished)} />
      </MchezoProvider>
    );
  }
  // Caption Clash (Sprint 4): its own intro, write/vote screens and results.
  if (view === "lobby" && (showPhase === "gameplay" || showPhase === "waiting") && majorityPlaying && playingGame) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <GameClock game={playingGame} />
        <MchezoMajority game={playingGame} publicGame={publicPlaying} players={players} playerId={playerId ?? ""} title={games.find((x) => x.id === playingGame.gameId)?.title ?? "Majority Rules"} intent={sendAction} error={err || undefined} />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && showPhase === "results" && majorityFinished && latestFinished) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <MchezoMajorityResults game={latestFinished} publicGame={publicFinished} players={players} playerId={playerId ?? ""} title={games.find((x) => x.id === latestFinished.gameId)?.title ?? "Majority Rules"} onBackToLobby={() => dismissResults(latestFinished.id)} hero={resultsHero(latestFinished, publicFinished)} />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && showPhase === "intro" && captionPlaying && playingGame) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <GameIntro
          title={games.find((x) => x.id === playingGame.gameId)?.title ?? "Caption Clash"}
          objective="Write the funniest caption."
          accent={1}
          steps={["Everyone gets the same silly scene.", "Write a caption, then vote for your favourite (not your own).", "Captions are anonymous until the end: 100 points per vote."]}
          onStart={() => dismissIntro(playingGame.id)}
        />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && (showPhase === "gameplay" || showPhase === "waiting") && captionPlaying && playingGame) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <GameClock game={playingGame} />
        <MchezoCaption game={playingGame} publicGame={publicPlaying} players={players} playerId={playerId ?? ""} title={games.find((x) => x.id === playingGame.gameId)?.title ?? "Caption Clash"} intent={sendAction} error={err || undefined} />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && showPhase === "results" && captionFinished && latestFinished) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <MchezoCaptionResults game={latestFinished} publicGame={publicFinished} players={players} playerId={playerId ?? ""} title={games.find((x) => x.id === latestFinished.gameId)?.title ?? "Caption Clash"} onBackToLobby={() => dismissResults(latestFinished.id)} hero={resultsHero(latestFinished, publicFinished)} />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && showPhase === "intro" && triviaPlaying && playingGame) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <MchezoTriviaIntro title={games.find((x) => x.id === playingGame.gameId)?.title ?? playingGame.gameId} onStart={() => dismissIntro(playingGame.id)} />
      </MchezoProvider>
    );
  }
  if (view === "lobby" && (showPhase === "gameplay" || showPhase === "waiting") && triviaPlaying && playingGame) {
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        {sendFailure}
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
      <MchezoProvider theme={themes.everyday} {...motion}>
        <GameClock game={playingGame} />
        {sendFailure}
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
      <MchezoProvider theme={themes.everyday} {...motion}>
        <GameClock game={playingGame} />
        {sendFailure}
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
      <MchezoProvider theme={themes.everyday} {...motion}>
        {sendFailure}
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
      <MchezoProvider theme={themes.everyday} {...motion}>
        {sendFailure}
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
      <MchezoProvider theme={themes.everyday} {...motion}>
        {/* Stage 3: the headline first, above the outcome and the reveal. */}
        {resultsHero(latestFinished, publicFinished)}
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
    // Game Library (Milestone G; Stage 2 visual). Browse only: choosing sets
    // the up-next game and returns to the lobby, where Start starts it. The
    // library never starts a game. Guests browse; only host/cohost choose.
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <MchezoLibrary
          manifests={GAME_MANIFESTS}
          catalog={catalog}
          upNextId={upNextId}
          canSelect={isHostish}
          inRoom
          roomPlayers={connectedNow}
          filters={filtersFromQuery(route.name === "room" ? route.lib ?? "" : "")}
          onFiltersChange={(f) => { const lib = filtersToQuery(f); navigate(lib ? { name: "room", sub: "library", lib } : { name: "room", sub: "library" }, { replace: true }); }}
          onSelect={(id) => { setUpNextId(id); setShuffleResult(null); toLobby(); }}
          onDetails={(id) => openSheet("details", id)}
          onBack={toLobby}
          onStudio={isHostish ? () => setView("studio") : undefined}
        />
        {roomSheets}
      </MchezoProvider>
    );
  }
  if (view === "championship") {
    // Stage 4 (S3-CUP-01): the Family Cup as a Night Circle screen, standings
    // first and rules on demand. Values are the server's, as before.
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <CupScreen proj={proj} games={games} players={players} youId={playerId ?? ""} nameOf={nameOf} midrank={midrank} post={post} refresh={refresh} meIsHostOrCohost={!!(me?.isHost || me?.isCohost)} onBack={toLobby} onMenu={() => openSheet("menu")} />
        {roomSheets}
      </MchezoProvider>
    );
  }
  if (view === "memory") {
    // Stage 4 (S3-MEM-01): the Memory Book as a Night Circle screen with honest export feedback.
    return (
      <MchezoProvider theme={themes.everyday} {...motion}>
        <MemoryScreen roomId={roomId ?? ""} roomCode={proj?.joinCode} day={proj?.championshipDay ?? 1} book={book} ledger={ledger} games={proj?.games ?? []} registry={games} players={players} bookText={bookText} setBookText={setBookText} exportText={exportText} setExportText={setExportText} post={post} get={get} loadMemory={loadMemory} canApprove={!!(me?.isHost || me?.isCohost)} onBack={toLobby} onMenu={() => openSheet("menu")} />
        {roomSheets}
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
      <MchezoProvider theme={themes.everyday} {...motion}>
        <MchezoStudio playerCount={studioPlayerCount} recentIds={studioRecent} onBack={toLobby} canUse={isHostish} />
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
    if (latestGame?.status === "briefing" && latestGame.briefing) {
      return (
        <MchezoProvider theme={themes.everyday} {...motion}>
          <BriefingTv key={latestGame.id} game={latestGame} registry={games.find((x) => x.id === latestGame.gameId)} players={players} joinCode={proj?.joinCode} onBack={() => setView("lobby")} backLabel="Back to phone view" onBackToReady={playerId && latestGame.players.includes(playerId) ? () => setView("lobby") : undefined} />
        </MchezoProvider>
      );
    }
    const tvGame = latestGame?.gameId === "trivia" && (latestGame.status === "playing" || latestGame.status === "finished") ? latestGame : undefined;
    if (tvGame) {
      return (
        <MchezoProvider theme={themes.everyday} {...motion} as="bare">
          <MchezoTvStage key={tvGame.id} publicGame={tvGame} players={players} joinCode={proj?.joinCode ?? "…"} onBack={() => setView("lobby")} previousScores={previousGameScores(proj?.games ?? [], tvGame.id)} />
        </MchezoProvider>
      );
    }
    const show = tvShowScreen(() => setView("lobby"), "Back to phone view");
    if (show) return show;
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
    {view === "lobby" && showPhase === "results" && latestFinished && <><ShowResults game={latestFinished} title={games.find((x) => x.id === latestFinished.gameId)?.title ?? latestFinished.gameId} nameOf={nameOf} games={games} official={publicFinished?.official} youId={playerId ?? undefined} onBack={() => dismissResults(latestFinished.id)} review={latestFinished.status === "finished" ? reviewRows(latestFinished, latestFinished, publicFinished) : undefined} hero={<MchezoProvider theme={themes.everyday} {...motion} as="bare">{resultsHero(latestFinished, publicFinished)}</MchezoProvider>} /><Reactions proj={proj} post={post} canMute={!!(me?.isHost || me?.isCohost)} /></>}
      {showGamePanel && playingGame && <GameClock game={playingGame} />}
      {showGamePanel && playingGame && <GamePanel game={playingGame} players={players} nameOf={nameOf} intent={intent} textInput={textInput} setTextInput={setTextInput} numInput={numInput} setNumInput={setNumInput} selectedTiles={selectedTiles} setSelectedTiles={setSelectedTiles} />}



  </div>;
}
