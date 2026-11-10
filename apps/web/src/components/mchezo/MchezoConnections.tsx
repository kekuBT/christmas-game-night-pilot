/**
 * Word Connections (Sprint 4): a real puzzle screen.
 *
 * The server owns the board, every check and the score. This screen shows:
 * the tiles in the server's shuffled order (a local Shuffle only reorders
 * them on this phone), the player's own solved groups as coloured bands
 * (colour + shape per difficulty level), mistakes left, and feedback on the
 * last guess ("One away…"). The full board is revealed only when the whole
 * game has ended, on the results screen.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ANSWER_SHAPES } from "../../ui/mchezo/tokens/tokens.js";
import { Keycap, MchezoWaiting, OutcomeSummary } from "../../ui/mchezo/index.js";
import { FeedbackLine, GameHeader, ScoreList } from "../../ui/mchezo/components/GameKit.js";
import { participationLine, satOutLabel } from "../../ui/mchezo/lib/lifecycle.js";
import { CONNECTIONS_RULE, connectionsBreakdown } from "../../ui/mchezo/lib/connectionsScore.js";
import { StandingsList } from "../../ui/mchezo/components/Results.js";
import { rankStandings } from "../../ui/mchezo/lib/standings.js";
import { toMzPlayers } from "./adapters.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";
import { playerName } from "../../ui/mchezo/lib/names.js";

interface SolvedGroup { name: string; level: number; tileIds: string[] }
interface ConnectionsState {
  tiles?: { id: string; text: string }[];
  maxMistakes?: number;
  finishedPlayers?: number;
  totalPlayers?: number;
  groups?: SolvedGroup[];
  myState?: { solved: string[]; mistakes: number; guessed: string[][] };
  mySolved?: SolvedGroup[];
  myGuessCount?: number;
  lastGuess?: { correct: boolean; oneAway: boolean; group?: string };
}

const LEVEL_SHAPE: Record<number, number> = { 1: 2, 2: 1, 3: 3, 4: 0 };
function LevelShape({ level }: { level: number }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"><path d={ANSWER_SHAPES[LEVEL_SHAPE[level] ?? 0]} fill="currentColor" /></svg>;
}
/**
 * One type size for the whole board, from its longest single word, so every
 * tile reads the same (S3-WCN-03: one-word tiles were large while long and
 * two-word tiles shrank). Long words shrink instead of breaking mid-word; two
 * words wrap at the space in the same size.
 */
export function boardSizeClass(texts: readonly string[]): string {
  const longest = Math.max(0, ...texts.flatMap((t) => t.split(/\s+/).map((w) => w.length)));
  return longest >= 11 ? " mz-cx-grid--xlong" : longest >= 9 ? " mz-cx-grid--long" : "";
}
const LEVEL_WORD: Record<number, string> = { 1: "easiest", 2: "medium", 3: "tricky", 4: "trickiest" };

function Band({ group, textOf, missed }: { group: SolvedGroup; textOf: (id: string) => string; missed?: boolean }) {
  return (
    <div className={`mz-cx-band mz-lv-${group.level}${missed ? " mz-cx-band--missed" : ""}`} data-testid="mz-cx-band" aria-label={`${group.name} (${LEVEL_WORD[group.level] ?? ""} group)${missed ? ", not found" : ""}: ${group.tileIds.map(textOf).join(", ")}`}>
      <div className="mz-cx-band__name"><LevelShape level={group.level} />{group.name}</div>
      <div className="mz-cx-band__words">{group.tileIds.map(textOf).join(" · ")}</div>
    </div>
  );
}

export interface MchezoConnectionsDeps {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  /** Resolves false when the guess did not reach the game or was refused (Stage 5: keep the selection then). */
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  /**
   * Stage 6.2: a solo round. No "Sit this game out" (the solo screen has
   * Leave round) and no waiting for others when the puzzle is over.
   */
  solo?: boolean;
}

export function MchezoConnections({ game, publicGame, players, playerId, title, intent, solo }: MchezoConnectionsDeps) {
  const st = (game.state ?? {}) as ConnectionsState;
  const tiles = useMemo(() => st.tiles ?? [], [st.tiles]);
  const textOf = (id: string) => tiles.find((t) => t.id === id)?.text ?? id;
  const solved = st.mySolved ?? [];
  const solvedIds = new Set(solved.flatMap((g) => g.tileIds));
  const mistakes = st.myState?.mistakes ?? 0;
  const maxMistakes = st.maxMistakes ?? 4;
  const finished = solved.length >= 4 || mistakes >= maxMistakes;
  const [selected, setSelected] = useState<string[]>([]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [shake, setShake] = useState(false);
  const [note, setNote] = useState<{ tone: "neutral" | "good" | "warn"; text: string } | null>(null);
  const lastSeen = useRef(st.myGuessCount ?? 0);

  // React to the server's verdict on our last guess (it arrives in the projection).
  useEffect(() => {
    const count = st.myGuessCount ?? 0;
    if (count === lastSeen.current) return;
    lastSeen.current = count;
    const lg = st.lastGuess;
    if (!lg) return;
    if (lg.correct) setNote({ tone: "good", text: `Found it: ${lg.group}!` });
    else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      const left = maxMistakes - mistakes;
      setNote({ tone: "warn", text: `${lg.oneAway ? "One away…" : "Not a group."} ${left} mistake${left === 1 ? "" : "s"} left.` });
    }
  }, [st.myGuessCount, st.lastGuess, mistakes, maxMistakes]);

  const remaining = (order ?? tiles.map((t) => t.id)).filter((id) => !solvedIds.has(id) && tiles.some((t) => t.id === id));
  const toggle = (id: string) => {
    if (pending || finished) return;
    setNote(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
  };
  const shuffle = () => {
    const ids = [...remaining];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
    setOrder(ids);
  };
  const submit = async () => {
    if (selected.length !== 4 || pending) return;
    const guess = [...selected];
    const tried = (st.myState?.guessed ?? []).some((g) => [...g].sort().join() === [...guess].sort().join());
    if (tried) { setNote({ tone: "neutral", text: "You already tried that group." }); return; }
    setPending(true);
    let ok: boolean | void = undefined;
    try { ok = await intent(game.id, "connections-guess", { tileIds: guess }); } finally {
      setPending(false);
      // Stage 5: a guess that never reached the game keeps its four tiles selected, to try again.
      if (ok !== false) setSelected([]);
    }
  };

  if (game.abstained) {
    return <MchezoWaiting label={satOutLabel(game)} players={players} playerId={playerId} publicGame={publicGame} showClock />;
  }

  return (
    <main className="mz-screen" aria-label={`${title}: ${finished ? "puzzle over" : "find four groups of four"}`} data-testid="mz-cx">
      <GameHeader title={title} objective={finished ? (solved.length >= 4 ? "Puzzle solved!" : "Out of guesses") : "Find four groups of four"} accent={2} />
      {solved.length > 0 && <div className="mz-cx-bands">{solved.map((g) => <Band key={g.name} group={g} textOf={textOf} />)}</div>}
      {!finished && (
        <>
          <div className={`mz-cx-grid${boardSizeClass(tiles.map((t) => t.text))}${shake ? " mz-cx-grid--shake" : ""}`} role="group" aria-label={`${remaining.length} words; ${selected.length} of 4 selected`}>
            {remaining.map((id) => (
              <button key={id} type="button" className="mz-cx-tile" aria-pressed={selected.includes(id)} disabled={pending} onClick={() => toggle(id)} data-testid="mz-cx-tile">
                {textOf(id)}
              </button>
            ))}
          </div>
          <div className="mz-cx-status" aria-label={`${maxMistakes - mistakes} mistake${maxMistakes - mistakes === 1 ? "" : "s"} left`}>
            <span>Mistakes left</span>
            <span className="mz-cx-dots" aria-hidden="true">{Array.from({ length: maxMistakes }, (_, i) => <span key={i} className={`mz-cx-dot${i < mistakes ? " mz-cx-dot--used" : ""}`} />)}</span>
          </div>
          <div className="mz-cx-actions">
            <Keycap variant="surface" size="md" onClick={shuffle} disabled={pending}>Shuffle</Keycap>
            <Keycap variant="surface" size="md" onClick={() => setSelected([])} disabled={pending || selected.length === 0}>Deselect</Keycap>
            <Keycap size="md" onClick={() => void submit()} disabled={pending || selected.length !== 4} data-testid="mz-cx-submit">{pending ? "Checking…" : selected.length === 4 ? "Submit" : `Pick ${4 - selected.length} more`}</Keycap>
          </div>
          <FeedbackLine tone={note?.tone} testId="mz-cx-feedback">{note?.text ?? (selected.length === 0 ? "Tap four words that belong together." : "")}</FeedbackLine>
          {!solo && <button type="button" className="mz-chip-btn" style={{ alignSelf: "center", marginTop: 10 }} onClick={() => void intent(game.id, "abstain", {})}>Sit this game out</button>}
        </>
      )}
      {finished && (
        <>
          <div className="mz-cx-done" data-testid="mz-cx-done">
            <p className="mz-cx-done__big">{solved.length >= 4 ? (mistakes === 0 ? "Perfect — no mistakes!" : `All four groups, ${mistakes} mistake${mistakes === 1 ? "" : "s"}`) : `You found ${solved.length} of 4 groups`}</p>
            <p className="mz-foot">{solo ? "Your results are on their way…" : `${solved.length >= 4 ? "Nice work." : "Your groups count."} The full board is revealed when everyone is done.`}</p>
          </div>
          {!solo && <MchezoWaiting label="Waiting for the others" players={players} playerId={playerId} publicGame={publicGame} footNote={`${st.finishedPlayers ?? 0} of ${st.totalPlayers ?? players.length} players have finished their puzzle.`} showClock />}
        </>
      )}
    </main>
  );
}

/**
 * The whole board once the game is over: groups you found as solid bands,
 * groups you missed as dashed ones (Stage 6.2: shared by the multiplayer and
 * solo results). The groups exist in the projection only after the end.
 */
export function ConnectionsSolution({ game }: { game: PlayerGame }) {
  const st = (game.state ?? {}) as ConnectionsState;
  const tiles = st.tiles ?? [];
  const textOf = (id: string) => tiles.find((t) => t.id === id)?.text ?? id;
  const mine = new Set((st.mySolved ?? []).map((g) => g.name));
  const groups = [...(st.groups ?? [])].sort((a, b) => a.level - b.level);
  if (groups.length === 0) return null;
  return (
    <>
      <div className="mz-cx-bands" data-testid="mz-cx-solution">{groups.map((g) => <Band key={g.name} group={g} textOf={textOf} missed={!mine.has(g.name)} />)}</div>
      <p className="mz-foot">Solid bands are groups you found; dashed ones you missed.</p>
    </>
  );
}

/** Results: the whole board, which groups you found, and the scores. */
export function MchezoConnectionsResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; /** Stage 7.2: a casual room's What's next panel. */ next?: ReactNode }) {
  const st = (game.state ?? {}) as ConnectionsState;
  const nameOf = (id: string) => playerName(id, players);
  const rows = Object.entries(game.rawScores ?? publicGame?.rawScores ?? {}).map(([id, score]) => ({
    id, name: nameOf(id), score: score as number, you: id === playerId,
    detail: participationLine("word-connections", game.outcome?.participation[id], { you: id === playerId, choseSatOut: id === playerId && game.abstained === true }),
  }));
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-cx-results">
      {hero}
      <GameHeader title={title} objective="The groups were…" accent={2} />
      <ConnectionsSolution game={game} />
      <ScoreList rows={rows} />
      {(() => {
        // S3-WCN-01: how the score is made up. Your own breakdown is shown
        // only when it adds up to the score the server recorded for you.
        const recorded = (game.rawScores ?? publicGame?.rawScores ?? {})[playerId];
        const mineNow = st.myState ? connectionsBreakdown(st.myState.solved.length, st.myState.mistakes) : undefined;
        return (
          <section className="mz-cx-howscore" aria-label="How the score works" data-testid="mz-cx-howscore">
            <p className="mz-foot"><b>How the score works:</b> {CONNECTIONS_RULE}</p>
            {mineNow && recorded !== undefined && mineNow.total === recorded && !game.abstained && (
              <p className="mz-foot" data-testid="mz-cx-mybreakdown">You: {mineNow.line}.</p>
            )}
          </section>
        );
      })()}
      <OutcomeSummary gameId="word-connections" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} youChoseSatOut={game.abstained === true} />
      {next}
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the shared board (never the answers) while playing; the solution after. */
export function ConnectionsTv({ game, title, players = [] }: { game: PublicGame; title: string; players?: PublicPlayer[] }) {
  const st = (game.state ?? {}) as ConnectionsState;
  const tiles = st.tiles ?? [];
  const textOf = (id: string) => tiles.find((t) => t.id === id)?.text ?? id;
  if (game.status === "finished" && st.groups) {
    // S3-TV-02: the TV ends on the game's standings as well as the solution.
    const mz = toMzPlayers(players);
    const ranked = rankStandings(Object.entries(game.rawScores ?? {}).map(([playerId, score]) => ({ playerId, score })), mz);
    return (
      <>
        {ranked.length > 0 && (
          <section aria-label={`${title} standings`} data-testid="mz-cx-tv-standings" style={{ maxWidth: 1100, margin: "24px auto 0" }}>
            <p className="mz-kicker">This game’s standings</p>
            <StandingsList ranked={ranked} youId="" players={mz} limit={ranked.length} />
            <p className="mz-foot">{CONNECTIONS_RULE}</p>
          </section>
        )}
        <section aria-label={`${title} solution`} style={{ maxWidth: 1100, margin: "24px auto" }}>
          <p className="mz-kicker">The groups were…</p>
          <div className="mz-cx-bands">{[...st.groups].sort((a, b) => a.level - b.level).map((g) => <Band key={g.name} group={g} textOf={textOf} />)}</div>
        </section>
      </>
    );
  }
  return (
    <section aria-label={`${title} board`}>
      <p className="mz-lede" style={{ marginTop: 20 }}>{st.finishedPlayers ?? 0} of {st.totalPlayers ?? game.players.length} players have finished their puzzle</p>
      <div className={`mz-cx-tv${boardSizeClass(tiles.map((t) => t.text))}`}>{tiles.map((t) => <div key={t.id} className="mz-cx-tile" aria-hidden="true">{t.text}</div>)}</div>
    </section>
  );
}
