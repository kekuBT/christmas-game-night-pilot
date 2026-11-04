import { useCallback, useEffect, useRef, useState } from "react";

// Server JSON is untyped; this file is outside the tsc scope in tsconfig.json
// (src + tests only, pre-existing), so values stay loose here and are narrowed
// only at the catch boundary below.
type Any = Record<string, unknown>;
const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
async function post(path: string, body: Any) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
async function get(path: string) {
  const r = await fetch(path);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
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
  const [proj, setProj] = useState<Any | null>(null);
  const [games, setGames] = useState<Any[]>([]);
  const [view, setView] = useState<"lobby" | "championship" | "tv" | "memory">("lobby");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [book, setBook] = useState<Any[]>([]);
  const [ledger, setLedger] = useState<Any[]>([]);
  const [bookText, setBookText] = useState("");
  const [exportText, setExportText] = useState("");
  const [textInput, setTextInput] = useState("");
  const [numInput, setNumInput] = useState("");
  const [selectedTiles, setSelectedTiles] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    if (!roomId || !playerId) return;
    try { setProj(await get(`/rooms/${roomId}/projection?audience=player&actorId=${playerId}`)); } catch { /* poll retry */ }
  }, [roomId, playerId]);

  useEffect(() => { get("/games").then(setGames).catch(() => {}); }, []);
  useEffect(() => {
    if (!roomId || !playerId) return;
    refresh();
    const t = setInterval(refresh, 2000);
    try {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/?roomId=${roomId}&actorId=${playerId}&audience=player`);
      wsRef.current = ws;
      ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.kind === "projection") setProj(m.state); } catch { /* ignore malformed WS frame; polling continues */ } };
    } catch { /* ignore WS setup failure; polling continues */ }
    return () => { clearInterval(t); wsRef.current?.close(); };
  }, [roomId, playerId, refresh]);

  async function saveSession(r: Any) {
    sessionStorage.setItem("cgn_roomId", r.roomId); sessionStorage.setItem("cgn_playerId", r.playerId); sessionStorage.setItem("cgn_token", r.recoveryToken);
    setRoomId(r.roomId); setPlayerId(r.playerId); setToken(r.recoveryToken); setView("lobby");
  }
  async function createRoom() {
    setErr(""); try {
      const r = await post("/rooms", { name: "Christmas Game Night" });
      const j = await post(`/rooms/${r.roomId}/join`, { displayName: name || "Player 1", asHost: true });
      await saveSession({ ...j, roomId: r.roomId }); setMsg(`Room created. Code: ${r.joinCode}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function joinRoom() {
    setErr(""); try {
      const j = await post("/rooms/join-by-code", { joinCode: code, displayName: name || "Player" });
      await saveSession(j); setMsg("Joined room.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function reconnect() {
    setErr(""); try {
      if (!roomId || !playerId || !token) return;
      await post(`/rooms/${roomId}/reconnect`, { playerId, recoveryToken: token }); await refresh(); setMsg("Reconnected to your player slot.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function startGame(gameId: string, official: boolean) {
    setErr(""); try { await post(`/rooms/${roomId}/games`, { hostId: playerId, gameId, official }); await refresh(); setView("lobby"); } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function intent(gameInstanceId: string, action: string, payload: Any) {
    setErr(""); try {
      const r = await post(`/rooms/${roomId}/intents`, { actorId: playerId, intent: { kind: "intent", schemaVersion: 1, clientEventId: uuid(), roomId, gameInstanceId, action, payload } });
      if (!r.accepted) setErr(`Not accepted: ${r.reason || "unknown"}`); else setMsg("Saved.");
      await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  async function loadMemory() {
    try { setBook(await get(`/rooms/${roomId}/memory`)); setLedger(await get(`/rooms/${roomId}/ledger`)); } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
  }
  useEffect(() => { if (view === "memory" && roomId) loadMemory(); }, [view, roomId]);

  if (!roomId || !playerId) {
    return <div className="wrap"><header><h1>🎄 Christmas Game Night</h1></header>
      <div className="card"><h2>Join the family game night</h2>
        <p className="muted">No account needed. Each browser tab can be a different player — open a second tab to test multiplayer.</p>
        <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada" /></label>
        <label>Room code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. K7M2Q9" /></label>
        <div className="row"><button onClick={joinRoom} disabled={!code || !name}>Join room</button><button className="secondary" onClick={createRoom} disabled={!name}>Create a room (host)</button></div>
        {err && <p className="err">{err}</p>}{msg && <p className="ok">{msg}</p>}
      </div>
      <div className="card"><h2>How it works</h2><p>Host starts a game from the lobby. Everyone plays on their own phone, the TV view shows only public scores, and the Memory Book only records results from real games.</p></div>
    </div>;
  }

  const players: Any[] = proj?.players ?? [];
  const myGames: Any[] = proj?.myGames ?? [];
  const active = myGames.find((g) => g.status === "playing") ?? myGames.slice(-1)[0];
  const me = players.find((p) => p.id === playerId);
  const finished = (proj?.games ?? []).filter((g: Any) => g.status === "finished");
  const standings: Record<string, number> = {};
  for (const g of finished) { const m = midrank(g.rawScores ?? {}); for (const [pid, v] of Object.entries(m)) standings[pid] = (standings[pid] ?? 0) + (v as number); }
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? id;

  return <div className="wrap">
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

    {view === "lobby" && <>
      <div className="card"><h2>Players</h2>{players.map((p) => <span key={p.id} className="pill">{p.displayName}{p.isHost ? " 👑" : ""}{p.isCohost ? " ⭐" : ""}{p.connected ? "" : " (away)"}</span>)}
        {me?.isHost && players.filter((p) => p.id !== playerId).map((p) => <div key={p.id} className="row"><span>{p.displayName}</span><button className="secondary" onClick={async () => { await post(`/rooms/${roomId}/cohost`, { hostId: playerId, targetId: p.id }); await refresh(); }}>Make cohost</button></div>)}
      </div>
      <div className="card"><h2>Start a game</h2><p className="muted">Only the host starts games. Tutorials are shown below each game.</p>
        {games.map((g) => <div key={g.id} className="card" data-testid={`game-card-${g.id}`}><b>{g.title}</b> <span className="muted">· {g.minPlayers}–{g.maxPlayers} players · ~{g.defaultDurationMinutes} min</span>
          <p>{g.tutorial}</p><div className="row"><button data-testid={`start-official-${g.id}`} onClick={() => startGame(g.id, true)} disabled={!me?.isHost}>Start (official)</button><button data-testid={`start-practice-${g.id}`} className="secondary" onClick={() => startGame(g.id, false)} disabled={!me?.isHost}>Start (practice)</button></div></div>)}
      </div>
      {active && <GamePanel game={active} players={players} nameOf={nameOf} intent={intent} textInput={textInput} setTextInput={setTextInput} numInput={numInput} setNumInput={setNumInput} selectedTiles={selectedTiles} setSelectedTiles={setSelectedTiles} />}
      {finished.length > 0 && <div className="card" data-testid="finished-games"><h2>Finished games</h2>{finished.map((g: Any) => <p key={g.id}><b>{games.find((x) => x.id === g.gameId)?.title ?? g.gameId}</b> — {Object.entries(g.rawScores ?? {}).map(([pid, v]) => `${nameOf(pid)}: ${v}`).join(" · ")}</p>)}</div>}
    </>}

    {view === "championship" && <div className="card"><h2>Championship standings</h2><p className="muted">Provisional midrank scoring: each finished game is normalised 0–100, then summed. The full 7-day formula (best five days, 75/25 solo/team) is in docs/CHAMPIONSHIP_RULES.md and is still provisional — not owner-approved.</p>
      {Object.entries(standings).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([pid, v]) => <p key={pid}>{nameOf(pid)}: {v} points</p>)}
      {Object.keys(standings).length === 0 && <p>No finished games yet.</p>}
      <h3>Per-game breakdown</h3>{finished.map((g: Any) => <p key={g.id}><b>{g.gameId}</b> — {Object.entries(midrank(g.rawScores ?? {})).map(([pid, v]) => `${nameOf(pid)}: ${v}`).join(" · ")}</p>)}
    </div>}

    {view === "tv" && <div className="card"><h2>TV Dashboard — public only</h2><p className="muted">This view never shows answer keys, secret words, or other players' prompts.</p>
      <p>Room code: <b>{proj?.joinCode}</b></p><p>Players: {players.map((p) => p.displayName).join(", ")}</p>
      <h3>Standings</h3>{Object.entries(standings).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([pid, v]) => <p key={pid}>{nameOf(pid)}: {v}</p>)}
      <h3>Recent games</h3>{(proj?.games ?? []).slice(-5).map((g: Any) => <p key={g.id}>{g.gameId} — {g.status}{g.rawScores ? ` — ${Object.entries(g.rawScores).map(([pid, v]) => `${nameOf(pid)}: ${v}`).join(" · ")}` : ""}</p>)}
    </div>}

    {view === "memory" && <div className="card"><h2>Christmas Memory Book</h2><p className="muted">Entries must cite a real game-finished event from this room. Only approved entries appear in the export; revoked entries never export.</p>
      <label>Highlight text<textarea value={bookText} onChange={(e) => setBookText(e.target.value)} placeholder="e.g. Ada won Math Mayhem in a tie-break" /></label>
      <div className="row"><button disabled={!bookText || ledger.filter((e: Any) => e.type === "game-finished").length === 0} onClick={async () => { const src = ledger.filter((e: Any) => e.type === "game-finished").slice(-1).map((e: Any) => e.eventId); await post(`/rooms/${roomId}/memory`, { day: 1, text: bookText, sourceEventIds: src }); setBookText(""); await loadMemory(); }}>Add from last finished game</button>
      <button className="secondary" onClick={async () => { const r = await get(`/rooms/${roomId}/memory/export`); setExportText(r.markdown); }}>Export approved</button></div>
      {ledger.filter((e: Any) => e.type === "game-finished").length === 0 && <p className="muted">Finish a game first — then you can add a Memory Book entry.</p>}
      {book.map((e: Any) => <div key={e.id} className="card"><p>{e.text} <span className="muted">(Day {e.day} · {e.approved ? "approved" : "pending"})</span></p><div className="row"><button className="secondary" onClick={async () => { await post(`/rooms/${roomId}/memory/${e.id}/approve`, { approverId: playerId }); await loadMemory(); }}>Approve</button><button className="secondary" onClick={async () => { await post(`/rooms/${roomId}/memory/${e.id}/revoke`, {}); await loadMemory(); }}>Revoke</button></div></div>)}
      {exportText && <pre style={{ whiteSpace: "pre-wrap" }}>{exportText}</pre>}
    </div>}
  </div>;
}

function GamePanel(props: { game: Any; players: Any[]; nameOf: (id: string) => string; intent: (gid: string, a: string, p: Any) => void; textInput: string; setTextInput: (s: string) => void; numInput: string; setNumInput: (s: string) => void; selectedTiles: string[]; setSelectedTiles: (s: string[]) => void }) {
  const { game, players, nameOf, intent, textInput, setTextInput, numInput, setNumInput, selectedTiles, setSelectedTiles } = props;
  const st = game.state ?? {};
  const gid = game.id;
  const quiz = ["math-mayhem", "trivia", "who-said-that", "geography"].includes(game.gameId);
  const questions: Any[] = game.questions ?? st.questions ?? [];
  return <div className="card" data-testid="game-panel"><h2>Now playing: {game.gameId}</h2><p className="muted">Status: {game.status}{game.status === "finished" ? ` · Your score: ${game.myScore ?? ""}` : ""}</p>
    {game.status === "finished" && game.rawScores && <p>{Object.entries(game.rawScores).map(([pid, v]) => `${nameOf(pid)}: ${v}`).join(" · ")}</p>}
    {game.status === "playing" && <>
      {quiz && questions.map((q: Any) => {
        const answered = game.myAnswers?.[q.id] !== undefined || st.myAnswers?.[q.id] !== undefined;
        return <div key={q.id} className="card"><p><b>{q.prompt}</b></p>{answered ? <p className="ok">Answered.</p> : <div className="grid">{(q.options ?? []).map((opt: string, i: number) => <button key={i} onClick={() => intent(gid, game.gameId === "math-mayhem" ? "submit-math-answer" : game.gameId === "trivia" ? "trivia-answer" : game.gameId === "who-said-that" ? "whosaid-answer" : "geography-answer", { questionId: q.id, chosenIndex: i })}>{opt}</button>)}</div>}</div>;
      })}
      {game.gameId === "guess-the-year" && (st.events ?? []).map((e: Any) => {
        const done = st.myGuesses?.[e.id] !== undefined;
        return <div key={e.id} className="card"><p><b>{e.event}</b></p>{done ? <p className="ok">Guessed: {st.myGuesses[e.id]}</p> : <div className="row"><input type="number" value={numInput} onChange={(ev) => setNumInput(ev.target.value)} placeholder="Year" /><button onClick={() => intent(gid, "year-guess", { eventId: e.id, value: Number(numInput) })}>Submit year</button></div>}</div>;
      })}
      {game.gameId === "closest-wins" && <div className="card"><p><b>{st.prompt}</b> {st.unit ? `(${st.unit})` : ""}</p>{st.myGuess !== undefined ? <p className="ok">Your guess: {st.myGuess}</p> : <div className="row"><input type="number" value={numInput} onChange={(e) => setNumInput(e.target.value)} placeholder="Your guess" /><button onClick={() => intent(gid, "closest-guess", { value: Number(numInput) })}>Submit guess</button></div>}</div>}
      {game.gameId === "impostor" && <div className="card"><p>Category: <b>{st.category}</b> · Role: <b>{st.role}</b>{st.word ? ` · Word: ${st.word}` : " · You are the impostor — no word given."}</p><p>Phase: {st.phase}</p>
        <p>Clues: {Object.entries(st.clues ?? {}).map(([pid, c]) => `${nameOf(pid)}: ${c}`).join(" · ") || "none yet"}</p>
        {st.phase === "clue" && <div className="row"><input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Your clue (max 140 chars)" maxLength={140} /><button onClick={() => intent(gid, "impostor-clue", { clue: textInput })}>Submit clue</button></div>}
        {st.phase === "vote" && !st.myVote && <div className="grid">{players.filter((p) => p.id !== props.players.find((x) => x.id === p.id)?.id || true).filter((p) => p.id !== (sessionStorage.getItem("cgn_playerId"))).map((p) => <button key={p.id} onClick={() => intent(gid, "impostor-vote", { suspectId: p.id })}>Vote: {p.displayName}</button>)}</div>}
        {st.phase === "guess" && st.role === "impostor" && <div className="row"><input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Guess the word" /><button onClick={() => intent(gid, "impostor-guess", { guess: textInput })}>Guess word</button></div>}
        {st.winner && <p>Winner: {st.winner}{st.revealedWord ? ` · Word was: ${st.revealedWord}` : ""}</p>}
      </div>}
      {game.gameId === "caption-clash" && <div className="card"><p>Prompt: <b>{st.prompt}</b> · Round {st.roundIndex + 1} of 3 · Phase: {st.phase}</p>
        {st.phase === "caption" && !st.myCaption && <div className="row"><input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Your caption (max 140 chars)" maxLength={140} /><button onClick={() => intent(gid, "caption-submit", { caption: textInput })}>Submit caption</button></div>}
        {st.phase === "caption" && st.myCaption && <p className="ok">Your caption: {st.myCaption}</p>}
        {st.phase === "vote" && !st.myVote && <div className="grid">{(st.captions ?? []).map((c: Any) => <button key={c.id} onClick={() => intent(gid, "caption-vote", { captionId: c.id })}>{c.text}</button>)}</div>}
        {st.phase === "vote" && st.myVote && <p className="ok">Voted.</p>}
      </div>}
      {game.gameId === "word-connections" && <div className="card"><p>Mistakes: {st.myState?.mistakes ?? 0} / 4 · Solved: {(st.myState?.solved ?? []).join(", ") || "none"}</p>
        <div className="grid">{(st.tiles ?? []).map((t: Any) => <button key={t.id} className={selectedTiles.includes(t.id) ? "tile sel" : "tile"} onClick={() => setSelectedTiles(selectedTiles.includes(t.id) ? selectedTiles.filter((x) => x !== t.id) : selectedTiles.length < 4 ? [...selectedTiles, t.id] : selectedTiles)}>{t.text ?? t.id}</button>)}</div>
        <div className="row"><button disabled={selectedTiles.length !== 4} onClick={() => { intent(gid, "connections-guess", { tileIds: selectedTiles }); setSelectedTiles([]); }}>Submit group of 4</button></div>
      </div>}
      {game.gameId === "category-sprint" && <div className="card"><p>Round {st.roundIndex + 1} of 3 · Category: <b>{st.category}</b></p><p className="muted">Enter up to 5 examples, comma-separated. Unique answers score more.</p>
        <div className="row"><input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="e.g. Paris, Rome, Madrid" /><button onClick={() => intent(gid, "sprint-answers", { answers: textInput.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5) })}>Submit answers</button></div>
      </div>}
      {game.gameId === "charades" && <div className="card"><p>Actor: <b>{nameOf(st.actor)}</b> · Team scores: {JSON.stringify(st.teamScores)}</p>
        {st.prompt ? <><p>Your prompt (act it out, do not say it): <b>{st.prompt}</b></p><div className="row"><button onClick={() => intent(gid, "charades-turn", { outcome: "correct" })}>Correct (+100 team)</button><button className="secondary" onClick={() => intent(gid, "charades-turn", { outcome: "pass" })}>Pass</button></div></> : <p className="muted">Watch the actor and guess out loud. The actor taps Correct or Pass.</p>}
      </div>}
    </>}
  </div>;
}
