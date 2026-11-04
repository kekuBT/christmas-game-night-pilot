import type { GameState, PlayerGame, PublicPlayer } from "../types.js";

export type IntentFn = (gid: string, a: string, p: Record<string, unknown>) => void;

export function GamePanel(props: { game: PlayerGame; players: PublicPlayer[]; nameOf: (id: string) => string; intent: (gid: string, a: string, p: Record<string, unknown>) => void; textInput: string; setTextInput: (s: string) => void; numInput: string; setNumInput: (s: string) => void; selectedTiles: string[]; setSelectedTiles: (s: string[]) => void }) {
  const { game, players, nameOf, intent, textInput, setTextInput, numInput, setNumInput, selectedTiles, setSelectedTiles } = props;
  const st: GameState = (game.state ?? {}) as GameState;
  const gid = game.id;
  const quiz = ["math-mayhem", "trivia", "who-said-that", "geography"].includes(game.gameId);
  const questions = game.questions ?? st.questions ?? [];
  return <div className="card" data-testid="game-panel"><h2>Now playing: {game.gameId}</h2><p className="muted">Status: {game.status}{game.status === "finished" ? ` · Your score: ${game.myScore ?? ""}` : ""}</p>
    {game.status === "finished" && game.rawScores && <p>{Object.entries(game.rawScores).map(([pid, v]) => `${nameOf(pid)}: ${v}`).join(" · ")}</p>}
    {game.status === "playing" && <>
      {quiz && questions.map((q) => {
        const answered = game.myAnswers?.[q.id] !== undefined || st.myAnswers?.[q.id] !== undefined;
        return <div key={q.id} className="card"><p><b>{q.prompt}</b></p>{answered ? <p className="ok">Answered.</p> : <div className="grid">{(q.options ?? []).map((opt, i: number) => <button key={i} onClick={() => intent(gid, game.gameId === "math-mayhem" ? "submit-math-answer" : game.gameId === "trivia" ? "trivia-answer" : game.gameId === "who-said-that" ? "whosaid-answer" : "geography-answer", { questionId: q.id, chosenIndex: i })}>{opt}</button>)}</div>}</div>;
      })}
      {game.gameId === "guess-the-year" && (st.events ?? []).map((e) => {
        const done = st.myGuesses?.[e.id] !== undefined;
        return <div key={e.id} className="card"><p><b>{e.event}</b></p>{done ? <p className="ok">Guessed: {st.myGuesses?.[e.id]}</p> : <div className="row"><input type="number" value={numInput} onChange={(ev) => setNumInput(ev.target.value)} placeholder="Year" /><button onClick={() => intent(gid, "year-guess", { eventId: e.id, value: Number(numInput) })}>Submit year</button></div>}</div>;
      })}
      {game.gameId === "closest-wins" && <div className="card"><p><b>{st.prompt}</b> {st.unit ? `(${st.unit})` : ""}</p>{st.myGuess !== undefined ? <p className="ok">Your guess: {st.myGuess}</p> : <div className="row"><input type="number" value={numInput} onChange={(e) => setNumInput(e.target.value)} placeholder="Your guess" /><button onClick={() => intent(gid, "closest-guess", { value: Number(numInput) })}>Submit guess</button></div>}</div>}
      {game.gameId === "impostor" && <div className="card"><p>Category: <b>{st.category}</b> · Role: <b>{st.role}</b>{st.word ? ` · Word: ${st.word}` : " · You are the impostor — no word given."}</p><p>Phase: {st.phase}</p>
        <p>Clues: {Object.entries(st.clues ?? {}).map(([pid, c]) => `${nameOf(pid)}: ${c}`).join(" · ") || "none yet"}</p>
        {st.phase === "clue" && <div className="row"><input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Your clue (max 140 chars)" maxLength={140} /><button onClick={() => intent(gid, "impostor-clue", { clue: textInput })}>Submit clue</button></div>}
        {st.phase === "vote" && !st.myVote && <div className="grid">{players.filter((p) => p.id !== props.players.find((x) => x.id === p.id)?.id || true).filter((p) => p.id !== (sessionStorage.getItem("cgn_playerId"))).map((p) => <button key={p.id} onClick={() => intent(gid, "impostor-vote", { suspectId: p.id })}>Vote: {p.displayName}</button>)}</div>}
        {st.phase === "guess" && st.role === "impostor" && <div className="row"><input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Guess the word" /><button onClick={() => intent(gid, "impostor-guess", { guess: textInput })}>Guess word</button></div>}
        {st.winner && <p>Winner: {st.winner}{st.revealedWord ? ` · Word was: ${st.revealedWord}` : ""}</p>}
      </div>}
      {game.gameId === "caption-clash" && <div className="card"><p>Prompt: <b>{st.prompt}</b> · Round {(st.roundIndex ?? 0) + 1} of 3 · Phase: {st.phase}</p>
        {st.phase === "caption" && !st.myCaption && <div className="row"><input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Your caption (max 140 chars)" maxLength={140} /><button onClick={() => intent(gid, "caption-submit", { caption: textInput })}>Submit caption</button></div>}
        {st.phase === "caption" && st.myCaption && <p className="ok">Your caption: {st.myCaption}</p>}
        {st.phase === "vote" && !st.myVote && <div className="grid">{(st.captions ?? []).map((c) => <button key={c.id} onClick={() => intent(gid, "caption-vote", { captionId: c.id })}>{c.text}</button>)}</div>}
        {st.phase === "vote" && st.myVote && <p className="ok">Voted.</p>}
      </div>}
      {game.gameId === "word-connections" && <div className="card"><p>Mistakes: {st.myState?.mistakes ?? 0} / 4 · Solved: {(st.myState?.solved ?? []).join(", ") || "none"}</p>
        <div className="grid">{(st.tiles ?? []).map((t) => <button key={t.id} className={selectedTiles.includes(t.id) ? "tile sel" : "tile"} onClick={() => setSelectedTiles(selectedTiles.includes(t.id) ? selectedTiles.filter((x) => x !== t.id) : selectedTiles.length < 4 ? [...selectedTiles, t.id] : selectedTiles)}>{t.text ?? t.id}</button>)}</div>
        <div className="row"><button disabled={selectedTiles.length !== 4} onClick={() => { intent(gid, "connections-guess", { tileIds: selectedTiles }); setSelectedTiles([]); }}>Submit group of 4</button></div>
      </div>}
      {game.gameId === "category-sprint" && <div className="card"><p>Round {(st.roundIndex ?? 0) + 1} of 3 · Category: <b>{st.category}</b></p><p className="muted">Enter up to 5 examples, comma-separated. Unique answers score more.</p>
        <div className="row"><input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="e.g. Paris, Rome, Madrid" /><button onClick={() => intent(gid, "sprint-answers", { answers: textInput.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5) })}>Submit answers</button></div>
      </div>}
      {game.gameId === "charades" && <div className="card"><p>Actor: <b>{nameOf(st.actor ?? "")}</b> · Team scores: {JSON.stringify(st.teamScores)} · Passes used: {st.passesThisTurn ?? 0} / 3</p>
        {st.prompt ? <><p>Your prompt (act it out, do not say it): <b>{st.prompt}</b></p><div className="row"><button onClick={() => intent(gid, "charades-turn", { outcome: "correct" })}>Correct (+100 team)</button><button className="secondary" onClick={() => intent(gid, "charades-turn", { outcome: "pass" })}>Pass</button></div></> : <p className="muted">Watch the actor and guess out loud. The actor taps Correct or Pass.</p>}
      </div>}
    </>}
  </div>;
}
