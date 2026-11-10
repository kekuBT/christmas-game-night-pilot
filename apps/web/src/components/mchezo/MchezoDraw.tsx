/**
 * Draw & Guess (Stage 5, Practice-only): one phone draws a secret word, the
 * others guess it. The server picks the drawer and the word, checks every
 * guess, owns the clock and every point.
 *
 * Drawing: touch or mouse (pointer events) on a square canvas in 0..1000
 * coordinates. Points are thinned as you draw and sent in small batches
 * (one message in flight at a time, ~3 a second), well inside the server's
 * per-message, per-turn and rate limits. What hasn't reached the server yet
 * stays on your canvas and is retried; a failed send says so.
 *
 * Guessing: a text box. A wrong guess just says "not it" (it isn't stored
 * or shown to anyone); a right one says so from the server's state.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Keycap, OutcomeSummary, useMchezo } from "../../ui/mchezo/index.js";
import { FeedbackLine, GameHeader, ScoreList } from "../../ui/mchezo/components/GameKit.js";
import { participationLine } from "../../ui/mchezo/lib/lifecycle.js";
import { NOT_DELIVERED } from "../../ui/mchezo/lib/errors.js";
import { SendNote } from "./SendNote.js";
import { drawMoment } from "../../ui/mchezo/lib/moments.js";
import type { PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

export interface DrawPiece { s: number; c: number; w: number; p: number[] }
interface TurnRecap { drawerId: string; word: string; correct: number; points: Record<string, number> }
export interface DrawView {
  turn?: number; turnCount?: number; phase?: "draw" | "reveal" | "finished"; drawerId?: string;
  pieces?: DrawPiece[]; letters?: number[]; correct?: { playerId: string; order: number }[]; guessers?: number;
  result?: TurnRecap; turns?: TurnRecap[];
  myWord?: string; canSwap?: boolean; amDrawing?: boolean; myCorrect?: boolean; myGuesses?: number; guessesLeft?: number; mySkipped?: boolean; myTotal?: number;
}

/** The palette: every colour has a name (shown and announced), never colour alone. */
export const DRAW_COLORS = [
  { name: "Black", hex: "#1B1B1F" }, { name: "Red", hex: "#D7263D" }, { name: "Orange", hex: "#F46036" }, { name: "Yellow", hex: "#E9B520" },
  { name: "Green", hex: "#1B998B" }, { name: "Blue", hex: "#2E5EAA" }, { name: "Purple", hex: "#7B4FC9" }, { name: "Brown", hex: "#7A4A2A" },
] as const;
export const DRAW_WIDTHS = [{ name: "Thin", px: 7 }, { name: "Medium", px: 16 }, { name: "Thick", px: 32 }] as const;
const SEND_EVERY_MS = 320;
const MAX_POINTS_PER_SEND = 380;

function Piece({ x }: { x: DrawPiece }) {
  const color = DRAW_COLORS[x.c]?.hex ?? "#000";
  const w = DRAW_WIDTHS[x.w]?.px ?? 12;
  if (x.p.length === 2) return <circle cx={x.p[0]} cy={x.p[1]} r={w / 2} fill={color} />;
  const pts: string[] = [];
  for (let i = 0; i + 1 < x.p.length; i += 2) pts.push(`${x.p[i]},${x.p[i + 1]}`);
  return <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
}

/** A short signature of a drawing: pieces and points (tests compare it with the server's). */
export const drawSig = (pieces: readonly DrawPiece[]) => `${pieces.length}:${pieces.reduce((n, x) => n + x.p.length / 2, 0)}`;

/** The drawing, from the server's pieces (plus, for the drawer, what hasn't arrived there yet). */
export function DrawBoard({ pieces, extra = [], label, testId, onPointerDown, onPointerMove, onPointerUp, svgRef, tv }: {
  pieces: DrawPiece[]; extra?: DrawPiece[]; label: string; testId?: string; tv?: boolean;
  onPointerDown?: (e: ReactPointerEvent<SVGSVGElement>) => void; onPointerMove?: (e: ReactPointerEvent<SVGSVGElement>) => void; onPointerUp?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  return (
    <svg ref={svgRef} className={`mz-dg-board${onPointerDown ? " mz-dg-board--live" : ""}${tv ? " mz-dg-board--tv" : ""}`} viewBox="0 0 1000 1000" role="img" aria-label={label} data-testid={testId}
      data-pieces={pieces.length + extra.length}
      // Stage 5.1: what the server has confirmed and this screen shows (count:points), so tests can compare it with the server.
      data-sig={drawSig(pieces)}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp}>
      <rect x="0" y="0" width="1000" height="1000" fill="#FFFDF7" />
      {pieces.map((x, i) => <Piece key={`s${i}`} x={x} />)}
      {extra.map((x, i) => <Piece key={`l${i}`} x={x} />)}
    </svg>
  );
}

/** "_ _ _ _ _ _   _ _ _ _": the word's shape, never its letters. */
export function Letters({ letters, tv }: { letters: number[]; tv?: boolean }) {
  const total = letters.reduce((a, b) => a + b, 0);
  return (
    <p className={`mz-dg-letters${tv ? " mz-dg-letters--tv" : ""}`} data-testid="mz-dg-letters" aria-label={`${letters.length === 1 ? "One word" : `${letters.length} words`}, ${total} letters`}>
      {letters.map((n, w) => <span key={w} className="mz-dg-word">{Array.from({ length: n }, (_, i) => <span key={i} className="mz-dg-blank" />)}</span>)}
    </p>
  );
}

export interface MchezoDrawDeps {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  /** Resolves false when the action did not reach the game or was refused. */
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  /** Stage 5.1 (2C): the server lists the unconfirmed send as accepted for this player. */
  landed?: boolean;
}

/** The drawer's canvas: local strokes are queued and sent in batches; the server's copy is the truth. */
function DrawerPad({ game, st, intent, title, round, of }: { game: PlayerGame; st: DrawView; intent: MchezoDrawDeps["intent"]; title: string; round: number; of: number }) {
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);
  const [local, setLocal] = useState<DrawPiece[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const active = useRef<{ piece: DrawPiece; sent: number } | null>(null);
  const queue = useRef<DrawPiece[]>([]);
  const inflight = useRef<DrawPiece[] | null>(null);
  const server = st.pieces ?? [];
  const nextStroke = useRef(0);
  const turnKey = `${st.turn}`;
  useEffect(() => { queue.current = []; active.current = null; inflight.current = null; setLocal([]); nextStroke.current = 0; }, [turnKey]);
  const show = useCallback(() => {
    const a = active.current ? [active.current.piece] : [];
    setLocal([...(inflight.current ?? []), ...queue.current, ...a]);
  }, []);
  const toPoint = (e: ReactPointerEvent<SVGSVGElement>): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(1000, Math.round(v)));
    return [clamp(((e.clientX - r.left) / r.width) * 1000), clamp(((e.clientY - r.top) / r.height) * 1000)];
  };
  /** Take up to MAX_POINTS_PER_SEND points of what's waiting: finished pieces first, then the stroke being drawn. */
  const takeBatch = (): DrawPiece[] => {
    const out: DrawPiece[] = [];
    let n = 0;
    while (queue.current.length && n + queue.current[0]!.p.length / 2 <= MAX_POINTS_PER_SEND && out.length < 20) {
      const x = queue.current.shift()!; out.push(x); n += x.p.length / 2;
    }
    const a = active.current;
    if (a && n < MAX_POINTS_PER_SEND && out.length < 20) {
      const pairs = a.piece.p.length / 2;
      // Overlap one point with what was sent, so the line joins up.
      const from = Math.max(0, a.sent - 1);
      const upto = Math.min(pairs, from + (MAX_POINTS_PER_SEND - n));
      if (upto - from >= 2 || (a.sent === 0 && upto > from)) {
        out.push({ ...a.piece, p: a.piece.p.slice(from * 2, upto * 2) });
        a.sent = upto;
      }
    }
    return out;
  };
  const flush = useCallback(async (): Promise<boolean> => {
    if (inflight.current) return true;
    const batch = takeBatch();
    if (!batch.length) return true;
    inflight.current = batch;
    show();
    let ok: boolean;
    try { ok = (await intent(game.id, "draw-strokes", { pieces: batch })) !== false; } catch { ok = false; }
    if (!ok) queue.current = [...batch, ...queue.current]; // kept, retried on the next tick
    inflight.current = null;
    setFailed(!ok);
    show();
    return ok;
  }, [game.id, intent, show]);
  useEffect(() => {
    const t = setInterval(() => { void flush(); }, SEND_EVERY_MS);
    return () => clearInterval(t);
  }, [flush]);
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (busy) return;
    e.preventDefault();
    try { svg.current?.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    const top = Math.max(nextStroke.current, ...server.map((x) => x.s + 1), ...queue.current.map((x) => x.s + 1));
    nextStroke.current = top + 1;
    active.current = { piece: { s: top, c: color, w: width, p: toPoint(e) }, sent: 0 };
    show();
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const a = active.current;
    if (!a) return;
    const [x, y] = toPoint(e);
    const lx = a.piece.p[a.piece.p.length - 2]!, ly = a.piece.p[a.piece.p.length - 1]!;
    if (Math.hypot(x - lx, y - ly) < 6) return; // thin the points: small moves add nothing
    a.piece.p.push(x, y);
    show();
  };
  const up = () => {
    const a = active.current;
    if (!a) return;
    const pairs = a.piece.p.length / 2;
    const from = Math.max(0, a.sent - 1);
    if (a.sent === 0 || pairs - from >= 2) queue.current.push({ ...a.piece, p: a.piece.p.slice(from * 2) });
    active.current = null;
    show();
  };
  const settleThen = async (action: string, tag: string) => {
    setBusy(tag);
    try {
      active.current = null;
      if (action === "draw-clear") queue.current = [];
      for (let i = 0; i < 20 && (inflight.current || queue.current.length); i++) {
        if (inflight.current) { await new Promise((r) => setTimeout(r, 60)); continue; }
        if (!(await flush())) break;
      }
      const ok = (await intent(game.id, action, {})) !== false;
      setFailed(!ok);
    } finally { setBusy(null); show(); }
  };
  const unsent = queue.current.length > 0 || !!inflight.current;
  return (
    <main className="mz-screen" aria-label={`${title}: your turn to draw, turn ${round} of ${of}`} data-testid="mz-dg-draw">
      <GameHeader title={title} objective="Your turn to draw" accent={5} />
      <p className="mz-mr-round">Turn {round} of {of} · only you can see the word</p>
      <p className="mz-dg-secret" data-testid="mz-dg-word">Draw: <b>{st.myWord}</b></p>
      <DrawBoard pieces={server} extra={local} label="Your drawing" testId="mz-dg-board" svgRef={svg} onPointerDown={down} onPointerMove={move} onPointerUp={up} />
      <div className="mz-dg-palette" role="group" aria-label="Colour">
        {DRAW_COLORS.map((c, i) => (
          <button key={c.name} type="button" className={`mz-dg-swatch${i === color ? " mz-dg-swatch--on" : ""}`} aria-pressed={i === color} aria-label={c.name} title={c.name} data-testid={`mz-dg-color-${i}`} onClick={() => setColor(i)}>
            <span style={{ background: c.hex }} />
          </button>
        ))}
      </div>
      <div className="mz-dg-tools">
        <div role="group" aria-label="Line" className="mz-dg-widths">
          {DRAW_WIDTHS.map((w, i) => (
            <button key={w.name} type="button" className={`mz-chip-btn${i === width ? " mz-dg-on" : ""}`} aria-pressed={i === width} data-testid={`mz-dg-width-${i}`} onClick={() => setWidth(i)}>{w.name}</button>
          ))}
        </div>
        <button type="button" className="mz-chip-btn" data-testid="mz-dg-undo" disabled={!!busy || (server.length === 0 && local.length === 0)} onClick={() => void settleThen("draw-undo", "undo")}>Undo</button>
        <button type="button" className="mz-chip-btn" data-testid="mz-dg-clear" disabled={!!busy || (server.length === 0 && local.length === 0)} onClick={() => void settleThen("draw-clear", "clear")}>Clear</button>
      </div>
      {failed && <p className="err" role="alert" data-testid="mz-dg-error" style={{ textAlign: "center" }}>{NOT_DELIVERED} {unsent ? "Your drawing is kept here and will be sent again." : ""}</p>}
      <FeedbackLine testId="mz-dg-progress">{(st.correct ?? []).length} of {st.guessers ?? 0} got it{unsent ? " · sending…" : ""}</FeedbackLine>
      <div className="mz-dg-row">
        {st.canSwap && <button type="button" className="mz-chip-btn" data-testid="mz-dg-swap" disabled={!!busy} onClick={() => void settleThen("draw-swap", "swap")}>New word</button>}
        <button type="button" className="mz-chip-btn" data-testid="mz-dg-giveup" disabled={!!busy} onClick={() => void settleThen("abstain", "giveup")}>Give up this turn</button>
      </div>
    </main>
  );
}

export function MchezoDraw({ game, players, playerId, title, intent, error, landed }: MchezoDrawDeps) {
  const st = (game.state ?? {}) as DrawView;
  const round = (st.turn ?? 0) + 1;
  const of = st.turnCount ?? 1;
  const nameOf = (id?: string) => (id === playerId ? "You" : players.find((p) => p.id === id)?.displayName ?? "Someone");
  const drawerName = nameOf(st.drawerId);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ kind: "wrong" | "failed"; key: string } | null>(null);
  const key = `${st.turn}:${st.phase}`;
  useEffect(() => { setNote(null); setText(""); }, [key]);
  const correct = st.correct ?? [];
  const got = correct.length > 0 && <p className="mz-foot" data-testid="mz-dg-gotit">Got it: {correct.map((c) => nameOf(c.playerId)).join(", ")}</p>;

  if (st.phase === "reveal" && st.result) {
    const r = st.result;
    const mine = r.points[playerId];
    return (
      <main className="mz-screen" aria-label={`${title}: turn ${round} of ${of}, the reveal`} data-testid="mz-dg-reveal">
        <GameHeader title={title} objective="The reveal" accent={5} />
        <p className="mz-mr-round">Turn {round} of {of} · {drawerName === "You" ? "you drew" : `${drawerName} drew`}</p>
        <h2 className="mz-mr-prompt" data-testid="mz-dg-answer">It was: {r.word}</h2>
        <DrawBoard pieces={st.pieces ?? []} label={`The drawing of ${r.word}`} testId="mz-dg-board" />
        <p className="mz-mr-mine" data-testid="mz-dg-mine">{r.correct === 0 ? "Nobody got it this time." : mine ? `+${mine} for you.` : `${r.correct} got it.`}</p>
        {got}
        <p className="mz-foot">{round < of ? "Next drawer coming up." : "That was the last drawing."}</p>
      </main>
    );
  }
  if (st.amDrawing && st.myWord) return <DrawerPad game={game} st={st} intent={intent} title={title} round={round} of={of} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const g = text.trim();
    if (!g || pending) return;
    setPending(true); setNote(null);
    try {
      const ok = (await intent(game.id, "draw-guess", { text: g })) !== false;
      if (!ok) setNote({ kind: "failed", key });
      else { setText(""); setNote({ kind: "wrong", key }); } // a right guess replaces this screen from the server's state
    } finally { setPending(false); }
  };
  const failure = <SendNote shown={note?.kind === "failed"} landed={landed} error={error} testId="mz-dg-error" />;
  const myOrder = correct.find((c) => c.playerId === playerId)?.order;
  return (
    <main className="mz-screen" aria-label={`${title}: turn ${round} of ${of}, ${drawerName} is drawing`} data-testid="mz-dg-guess">
      <GameHeader title={title} objective={st.myCorrect ? "You got it!" : st.mySkipped ? "Sitting this one out" : "What is it?"} accent={5} />
      <p className="mz-mr-round">Turn {round} of {of} · {drawerName} is drawing</p>
      <DrawBoard pieces={st.pieces ?? []} label={`${drawerName}'s drawing so far`} testId="mz-dg-board" />
      <Letters letters={st.letters ?? []} />
      {st.myCorrect ? (
        <p className="mz-mr-mine" data-testid="mz-dg-right">Right! You were {myOrder === 1 ? "first" : `number ${myOrder}`}. Points at the reveal.</p>
      ) : !st.mySkipped && (
        <form className="mz-dg-form" onSubmit={(e) => void submit(e)}>
          <input className="mz-dg-input" data-testid="mz-dg-input" value={text} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false}
            aria-label="Your guess" placeholder="Type a guess" onChange={(e) => { setText(e.target.value); if (note?.kind === "wrong") setNote(null); }} disabled={pending} />
          <Keycap type="submit" disabled={pending || !text.trim()} data-testid="mz-dg-send">{pending ? "Sending…" : "Guess"}</Keycap>
        </form>
      )}
      {note?.kind === "wrong" && !st.myCorrect && <FeedbackLine testId="mz-dg-wrong" tone="warn">Not it. Keep guessing!</FeedbackLine>}
      {!st.myCorrect && !st.mySkipped && (st.myGuesses ?? 0) > 0 && st.guessesLeft !== undefined && (
        <p className="mz-foot" data-testid="mz-dg-left" style={{ textAlign: "center" }}>{st.guessesLeft > 0 ? `${st.guessesLeft} ${st.guessesLeft === 1 ? "guess" : "guesses"} left for this drawing.` : "That's all your guesses for this drawing."}</p>
      )}
      {failure}
      {got}
      <FeedbackLine testId="mz-dg-progress">{correct.length} of {st.guessers ?? 0} got it</FeedbackLine>
      {!st.myCorrect && !st.mySkipped && <button type="button" className="mz-chip-btn" style={{ alignSelf: "center", marginTop: 8 }} disabled={pending} onClick={() => void intent(game.id, "abstain", {})} data-testid="mz-dg-skip">Skip this turn</button>}
    </main>
  );
}

/** Results: every turn's word and who drew it, the scores, how scoring works. */
export function MchezoDrawResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; /** Stage 7.2: a casual room's What's next panel. */ next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as DrawView;
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  const rows = Object.entries(game.rawScores ?? publicGame?.rawScores ?? {}).map(([id, score]) => ({
    id, name: nameOf(id), score: score as number, you: id === playerId,
    detail: participationLine("draw-guess", game.outcome?.participation[id], { you: id === playerId }),
  }));
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-dg-results">
      {hero}
      {next /* Stage 7.2: what's next, right under the result heading (review 6778921208) */}
      <GameHeader title={title} objective="Every drawing, every guess" accent={5} />
      {(() => {
        const roster = publicGame?.players ?? Object.keys(game.rawScores ?? {});
        const m = drawMoment(st.turns, Math.max(0, roster.length - 1), (id) => nameOf(id));
        return m ? <p className="mz-moment" data-testid="results-moment">{m}</p> : null;
      })()}
      <ol className="mz-mr-recap">
        {(st.turns ?? []).map((t, i) => (
          <li key={i} data-testid="mz-dg-recap-turn">
            <span className="mz-foot" style={{ textAlign: "left" }}>Turn {i + 1}: {nameOf(t.drawerId)} drew</span>
            <span className="mz-mr-recap__line"><b>{t.word}</b> · {t.correct === 0 ? "nobody got it" : `${t.correct} got it`}</span>
          </li>
        ))}
      </ol>
      <ScoreList rows={rows} />
      <p className="mz-foot" data-testid="mz-dg-howscore">Guessers score 100, 80, 60, then 50, in the order they got it. The drawer scores 50 for each player who got it. Wrong guesses are never shown. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
      <OutcomeSummary gameId="draw-guess" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the drawing, big; who's drawing; the word's shape; who's got it. The word only at the reveal. */
export function DrawTv({ game, title, nameOf }: { game: PublicGame; title: string; nameOf: (id?: string) => string }) {
  const st = (game.state ?? {}) as DrawView;
  const round = (st.turn ?? 0) + 1;
  const correct = st.correct ?? [];
  const reveal = st.phase !== "draw" && st.result;
  return (
    <section className="mz-tvshow-dg" data-testid="tv-live-draw-guess">
      <DrawBoard pieces={st.pieces ?? []} label={`${nameOf(st.drawerId)}'s drawing`} testId="tv-dg-board" tv />
      <div className="mz-tvshow-dg__side">
        <span className="mz-tv-kicker">{title} · turn {round} of {st.turnCount ?? 1}</span>
        <h1 className="mz-tvshow-h1">{reveal ? <span data-testid="tv-dg-answer">It was: {st.result!.word}</span> : `${nameOf(st.drawerId)} is drawing`}</h1>
        {!reveal && <Letters letters={st.letters ?? []} tv />}
        <p className="mz-tvshow-line" data-testid="tv-live-progress"><b>{correct.length} of {st.guessers ?? 0}</b> got it</p>
        {correct.length > 0 && <p className="mz-tvshow-line mz-tvshow-line--muted">{correct.map((c) => nameOf(c.playerId)).join(" · ")}</p>}
        {!reveal && <p className="mz-tvshow-line mz-tvshow-line--muted">Type your guesses on your phone. Wrong guesses stay private.</p>}
      </div>
    </section>
  );
}

/** TV post-game review: every word, who drew it, how many got it. */
export function DrawReview({ game, nameOf }: { game: PublicGame; nameOf: (id?: string) => string }) {
  const st = (game.state ?? {}) as DrawView;
  return (
    <ol className="mz-mr-recap" data-testid="tv-dg-review">
      {(st.turns ?? []).map((t, i) => <li key={i}><b>Turn {i + 1}: {nameOf(t.drawerId)} drew {t.word}</b><span className="mz-mr-recap__line">{t.correct === 0 ? "Nobody got it." : `${t.correct} got it.`}</span></li>)}
    </ol>
  );
}
