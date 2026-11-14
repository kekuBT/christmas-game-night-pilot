/**
 * Stage 12.5 (docs/stage12/stage125.md): Family Questions on the phones and the TV.
 *
 *   FamilyCard         the lobby's way in: how many questions are ready, and "Write a question"
 *   FamilySheet        write a question (multiple choice, or "Who in the family?"), see and take back your own;
 *                      the host or a cohost can remove someone's unplayed questions, unread
 *   MchezoFamily       the game: answer each question (never your own), then the reveal, with who asked
 *   MchezoFamilyResults, FamilyTv, FamilyReview
 *
 * Secrecy (D-S125-01): the server sends each phone only its own questions; this file never has anyone else's to show.
 * Every fact here comes from the server; the check on a new question is the server's own (src/shared/familyPack.ts).
 */
import { useEffect, useState, type ReactNode } from "react";
import { ANSWER_LETTERS, ANSWER_SHAPES, Keycap, MchezoWaiting, OutcomeSummary, Sheet, SegmentedChoice, TVRing, useMchezo } from "../../ui/mchezo/index.js";
import { FeedbackLine, GameHeader, ScoreList } from "../../ui/mchezo/components/GameKit.js";
import { participationLine } from "../../ui/mchezo/lib/lifecycle.js";
import { FAMILY_LIMITS, checkFamilyQuestion, type FamilyQuestionInput } from "../../../../../src/shared/familyPack.js";
import { SendNote } from "./SendNote.js";
import type { FamilyView, PlayerGame, PublicGame, PublicPlayer } from "../../types.js";

/** Needed to play a game (the server's FAMILY_ROUNDS_MIN; the projection says it too). */
const NEEDED = 3;

interface FamilyReveal {
  skipped?: true;
  prompt?: string; kind?: "choice" | "who"; options?: string[]; correctIndex?: number; counts?: number[]; right?: string[];
  askedBy?: string; askedByName?: string; greatQuestion?: boolean;
}
export interface FamilyGameView {
  round?: number; roundCount?: number; phase?: "answer" | "reveal" | "finished";
  kind?: "choice" | "who"; prompt?: string; options?: string[]; done?: number; total?: number; skippedRounds?: number;
  result?: FamilyReveal; rounds?: FamilyReveal[];
  myAnswer?: number; mySkipped?: boolean; myQuestion?: boolean; myTotal?: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const kindWord = (k?: "choice" | "who") => (k === "who" ? "Who in the family?" : "Family question");

/** One option, as a key: colour AND shape AND letter, never colour alone. */
function Option({ i, text, onPick, disabled, state, note, testId }: { i: number; text: string; onPick?: () => void; disabled?: boolean; state?: "chosen" | "right" | "wrong" | "dim"; note?: ReactNode; testId: string }) {
  return (
    <button type="button" className={`mz-fq-opt${state ? ` mz-fq-opt--${state}` : ""}`} style={{ ["--mz-slab" as string]: `var(--mz-answer-${i % 4})`, ["--mz-slab-deep" as string]: `var(--mz-answer-${i % 4}-deep)` }}
      onClick={onPick} disabled={disabled} aria-pressed={state === "chosen"} data-testid={testId}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" className="mz-fq-opt__shape"><path d={ANSWER_SHAPES[i % 4]} /></svg>
      <span className="mz-fq-opt__letter" aria-hidden="true">{ANSWER_LETTERS[i % 4]}</span>
      <span className="mz-fq-opt__text">{text}</span>
      {note}
    </button>
  );
}

/** The reveal's options: the right one marked (✓ and words, not colour), how many picked each. */
function RevealOptions({ r, mine, prefix }: { r: FamilyReveal; mine?: number; prefix: string }) {
  return (
    <div className="mz-fq-opts" data-testid={`${prefix}-reveal-options`}>
      {(r.options ?? []).map((o, i) => {
        const right = i === r.correctIndex;
        const n = r.counts?.[i] ?? 0;
        return (
          <Option key={i} i={i} text={o} disabled state={right ? "right" : mine === i ? "wrong" : "dim"} testId={`${prefix}-reveal-${i}`}
            note={<span className="mz-fq-opt__tag">{right ? "✓ Right answer · " : mine === i ? "Your pick · " : ""}{plural(n, "pick")}</span>} />
        );
      })}
    </div>
  );
}

/** "Asked by Amina" and the great-question line: the reveal's who-asked moment. */
function AskedBy({ r, you, nameOf, testId }: { r: FamilyReveal; you?: string; nameOf: (id: string) => string; testId: string }) {
  if (!r.askedBy) return null;
  const who = r.askedBy === you ? "you" : r.askedByName ?? nameOf(r.askedBy);
  return (
    <p className="mz-fq-asked" data-testid={testId}>
      <span>Asked by <b>{who}</b></span>
      {r.greatQuestion && <span className="mz-fq-great">🌟 Great question! +50 to {who}</span>}
    </p>
  );
}

// ------------------------------------------------------------------------------------------------ lobby

/** The lobby card (casual rooms): how many questions are waiting, and the way in. Everyone sees it. */
export function FamilyCard({ family, isHost, upNextIsFamily, onWrite, onPlayNext }: {
  family: FamilyView | undefined;
  isHost: boolean;
  upNextIsFamily: boolean;
  onWrite: () => void;
  /** Host: make Family Questions the next game. */
  onPlayNext?: () => void;
}) {
  if (!family) return null;
  const needed = family.needed ?? NEEDED;
  const mine = (family.mine ?? []).filter((q) => !q.played).length;
  const writers = family.writers.length;
  const ready = family.ready;
  return (
    <section className="mz-fq-card" aria-label="Family Questions" data-testid="family-card" data-ready={ready}>
      <span className="mz-kicker">✍️ Family Questions</span>
      <p className="mz-fq-card__lede">
        {ready === 0 ? "Write questions about the family, like “Who was born in Nairobi?”. Nobody sees them until the game."
          : ready < needed ? `${plural(ready, "question")} ready from ${plural(writers, "writer")}. ${needed - ready} more to play.`
          : `${plural(ready, "question")} ready from ${plural(writers, "writer")}. Secret until the game.`}
      </p>
      {mine > 0 && <p className="mz-foot mz-fq-card__mine" data-testid="family-card-mine">You wrote {plural(mine, "question")} still to play.</p>}
      <div className="mz-fq-card__actions">
        <Keycap variant="surface" size="md" data-testid="family-write" onClick={onWrite}>{mine > 0 ? "Write another" : "Write a question"}</Keycap>
        {isHost && onPlayNext && ready >= needed && !upNextIsFamily && <button type="button" className="mz-chip-btn" data-testid="family-play-next" onClick={onPlayNext}>Play it next</button>}
      </div>
    </section>
  );
}

/** Write a question; your own questions; the host's remove-unread tool. */
export function FamilySheet({ family, players, youId, isHostish, onAdd, onDelete, onRemoveAuthor, onClose }: {
  family: FamilyView | undefined;
  players: readonly PublicPlayer[];
  youId: string;
  isHostish: boolean;
  /** Resolves to an error message, or null when it was added. */
  onAdd: (q: FamilyQuestionInput) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
  onRemoveAuthor: (playerId: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<"choice" | "who">("choice");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [right, setRight] = useState<number | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const nameOf = (id: string) => (id === youId ? "You" : players.find((p) => p.id === id)?.displayName ?? "A player");
  const mine = family?.mine ?? [];
  const input: FamilyQuestionInput = kind === "who" ? { kind, prompt, ...(who ? { answerPlayerId: who } : {}) } : { kind, prompt, options, ...(right !== null ? { correctIndex: right } : {}) };
  const submit = async () => {
    const c = checkFamilyQuestion(input, players.map((p) => p.id));
    if (!c.ok) { setError(c.error); return; }
    setBusy(true); setError("");
    try {
      const err = await onAdd(input);
      if (err) { setError(err); return; }
      setAdded((n) => n + 1);
      setPrompt(""); setOptions(["", ""]); setRight(null); setWho(null);
    } finally { setBusy(false); }
  };
  const act = async (f: () => Promise<string | null>) => { setBusy(true); setError(""); try { const e = await f(); if (e) setError(e); } finally { setBusy(false); } };
  return (
    <Sheet title="Family Questions" onClose={onClose} testId="family-sheet" kicker="Secret until the game">
      <p className="mz-details__pitch">Write questions only the family would know. Nobody, not even the host, sees them before they’re played, and you won’t answer your own.</p>
      <SegmentedChoice label="Kind of question" value={kind} onChange={(v) => { setKind(v as "choice" | "who"); setError(""); }} testId="family-kind"
        options={[
          { value: "choice", title: "Multiple choice", detail: "2 to 4 answers", testId: "family-kind-choice" },
          { value: "who", title: "Who in the family?", detail: "pick a player", testId: "family-kind-who" },
        ]} />
      <label className="mz-fq-field">
        <span className="mz-kicker mz-kicker--muted">The question</span>
        <textarea className="mz-input mz-fq-prompt" rows={2} maxLength={FAMILY_LIMITS.prompt} value={prompt} placeholder={kind === "who" ? "Who snores the loudest?" : "Where did Bibi and Babu meet?"}
          onChange={(e) => { setPrompt(e.target.value); setError(""); }} data-testid="family-prompt" />
        <span className="mz-fq-count" aria-live="polite">{prompt.length}/{FAMILY_LIMITS.prompt}</span>
      </label>
      {kind === "choice" ? (
        <fieldset className="mz-fq-field mz-fq-options" data-testid="family-options">
          <legend className="mz-kicker mz-kicker--muted">Answers · tap ✓ on the right one</legend>
          {options.map((o, i) => (
            <div key={i} className="mz-fq-optrow">
              <button type="button" className={`mz-fq-right${right === i ? " is-on" : ""}`} aria-pressed={right === i} aria-label={`Answer ${ANSWER_LETTERS[i]} is the right one`} data-testid={`family-right-${i}`} onClick={() => { setRight(i); setError(""); }}>{right === i ? "✓" : ""}</button>
              <input className="mz-input" value={o} maxLength={FAMILY_LIMITS.option} placeholder={`Answer ${ANSWER_LETTERS[i]}`} aria-label={`Answer ${ANSWER_LETTERS[i]}`} data-testid={`family-option-${i}`}
                onChange={(e) => { setOptions((xs) => xs.map((x, j) => (j === i ? e.target.value : x))); setError(""); }} />
              {options.length > FAMILY_LIMITS.minOptions && (
                <button type="button" className="mz-chip-btn mz-fq-remove" aria-label={`Remove answer ${ANSWER_LETTERS[i]}`} data-testid={`family-option-remove-${i}`}
                  onClick={() => { setOptions((xs) => xs.filter((_, j) => j !== i)); setRight((r) => (r === null ? null : r === i ? null : r > i ? r - 1 : r)); }}>✕</button>
              )}
            </div>
          ))}
          {options.length < FAMILY_LIMITS.maxOptions && <button type="button" className="mz-chip-btn" data-testid="family-option-add" onClick={() => setOptions((xs) => [...xs, ""])}>+ Add an answer</button>}
        </fieldset>
      ) : (
        <fieldset className="mz-fq-field" data-testid="family-who">
          <legend className="mz-kicker mz-kicker--muted">Who is the answer?</legend>
          <div className="mz-fq-who">
            {players.map((p) => (
              <button key={p.id} type="button" className={`mz-chip-btn mz-fq-whobtn${who === p.id ? " is-on" : ""}`} aria-pressed={who === p.id} data-testid={`family-who-${p.id}`} onClick={() => { setWho(p.id); setError(""); }}>{p.id === youId ? `${p.displayName} (you)` : p.displayName}</button>
            ))}
          </div>
          <p className="mz-foot" style={{ textAlign: "left" }}>Everyone playing will be a choice. It’s asked when they’re in the game.</p>
        </fieldset>
      )}
      {error ? <p className="err" role="alert" data-testid="family-error">{error}</p> : null}
      {added > 0 && !error ? <p className="ok" role="status" data-testid="family-added">Added! {plural(added, "question")} so far. Write another, or close.</p> : null}
      <div className="mz-sheet__actions">
        <Keycap block disabled={busy} onClick={() => void submit()} data-testid="family-add">{busy ? "Adding…" : "Add this question"}</Keycap>
        <button type="button" className="mz-chip-btn" data-testid="family-close" onClick={onClose}>Done</button>
      </div>
      {mine.length > 0 && (
        <section className="mz-fq-mine" aria-label="Your questions" data-testid="family-mine">
          <span className="mz-kicker mz-kicker--muted">Your questions · only you see these</span>
          <ul>
            {mine.map((q) => (
              <li key={q.id} data-testid="family-mine-row" data-played={q.played ? "yes" : "no"}>
                <span className="mz-fq-mine__text"><b>{q.prompt}</b>
                  <span className="mz-foot" style={{ textAlign: "left" }}>{q.kind === "who" ? `Answer: ${nameOf(q.answerPlayerId ?? "")}` : `Answer: ${q.options?.[q.correctIndex ?? 0] ?? ""}`}{q.played ? " · played" : ""}</span>
                </span>
                {!q.played && <button type="button" className="mz-chip-btn" disabled={busy} data-testid={`family-delete-${q.id}`} onClick={() => void act(() => onDelete(q.id))}>Take back</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {isHostish && family && family.writers.some((w) => w.playerId !== youId) && (
        <section className="mz-fq-mine" aria-label="Host tools" data-testid="family-host">
          <span className="mz-kicker mz-kicker--muted">Host · remove someone’s questions without reading them</span>
          <ul>
            {family.writers.filter((w) => w.playerId !== youId).map((w) => (
              <li key={w.playerId}>
                <span className="mz-fq-mine__text"><b>{nameOf(w.playerId)}</b><span className="mz-foot" style={{ textAlign: "left" }}>{plural(w.count, "question")} waiting</span></span>
                {confirmRemove === w.playerId
                  ? <button type="button" className="mz-chip-btn mz-chip-btn--danger" disabled={busy} data-testid={`family-remove-confirm-${w.playerId}`} onClick={() => { setConfirmRemove(null); void act(() => onRemoveAuthor(w.playerId)); }}>Remove {w.count}?</button>
                  : <button type="button" className="mz-chip-btn" disabled={busy} data-testid={`family-remove-${w.playerId}`} onClick={() => setConfirmRemove(w.playerId)}>Remove</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------ the game

export interface MchezoFamilyDeps {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  title: string;
  /** The host or a cohost (may skip a question). */
  canDirect: boolean;
  intent: (gid: string, action: string, payload: Record<string, unknown>) => Promise<boolean | void> | boolean | void;
  error?: string;
  landed?: boolean;
}

export function MchezoFamily({ game, publicGame, players, playerId, title, canDirect, intent, error, landed }: MchezoFamilyDeps) {
  const st = (game.state ?? {}) as FamilyGameView;
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  const key = `${st.round ?? 0}:${st.phase ?? ""}`;
  const [pending, setPending] = useState<string | null>(null);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  useEffect(() => { setPending(null); setConfirmSkip(false); }, [key]);
  const send = async (action: string, payload: Record<string, unknown>, tag: string) => {
    const at = key;
    setPending(tag); setFailedAt(null);
    try { if ((await intent(game.id, action, payload)) === false) setFailedAt(at); } finally { setPending(null); }
  };
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  const failure = <SendNote shown={failedAt === key} landed={landed} error={error} testId="mz-fq-error" />;
  const counts = `${st.done ?? 0} of ${st.total ?? Math.max(0, players.length - 1)} answered`;
  // The host's skip: two taps, because the question is never seen again.
  const skip = canDirect && st.phase === "answer" ? (
    <div className="mz-fq-hostskip" data-testid="mz-fq-hostskip">
      {confirmSkip
        ? <><span className="mz-foot">Skip this question for everyone? Nobody scores it, and it isn’t shown again.</span>
            <button type="button" className="mz-chip-btn mz-chip-btn--danger" disabled={pending !== null} data-testid="mz-fq-skip-confirm" onClick={() => void send("family-skip", { round: st.round ?? 0 }, "host-skip")}>Skip it</button>
            <button type="button" className="mz-chip-btn" data-testid="mz-fq-skip-cancel" onClick={() => setConfirmSkip(false)}>Keep it</button></>
        : <button type="button" className="mz-chip-btn" data-testid="mz-fq-skip" onClick={() => setConfirmSkip(true)}>Host: skip this question for everyone</button>}
    </div>
  ) : null;

  if (st.phase === "reveal" && st.result) {
    const r = st.result;
    const mineRight = st.myAnswer !== undefined && st.myAnswer === r.correctIndex;
    const myLine = r.askedBy === playerId ? (r.greatQuestion ? "Your question! Some got it, some didn’t: +50 for a great question." : "Your question! A great question is one that some, but not all, get right.")
      : st.myAnswer === undefined ? "You didn’t answer this one."
      : mineRight ? "You got it: +100." : `You picked “${r.options?.[st.myAnswer] ?? ""}”: not this time.`;
    return (
      <main className="mz-screen" aria-label={`${title}: question ${round} of ${of}, the answer`} data-testid="mz-fq-reveal">
        <GameHeader title={title} objective={r.kind === "who" ? "And the answer is…" : "The answer"} accent={0} />
        <p className="mz-mr-round">Question {round} of {of}</p>
        <h2 className="mz-mr-prompt" data-testid="mz-fq-prompt">{r.prompt}</h2>
        <AskedBy r={r} you={playerId} nameOf={nameOf} testId="mz-fq-asked" />
        <RevealOptions r={r} mine={st.myAnswer} prefix="mz-fq" />
        <p className="mz-mr-mine" data-testid="mz-fq-mine">{myLine}</p>
        {(r.right?.length ?? 0) > 0 && <p className="mz-foot" data-testid="mz-fq-right">Got it: {r.right!.map((id) => (id === playerId ? "you" : nameOf(id))).join(", ")}</p>}
        <p className="mz-foot">{round < of ? "The next question is coming up." : "That was the last question."}</p>
      </main>
    );
  }

  if (st.myQuestion) {
    return (
      <main className="mz-screen" aria-label={`${title}: your question`} data-testid="mz-fq-yours">
        <GameHeader title={title} objective="This one’s yours!" accent={0} />
        <p className="mz-mr-round">Question {round} of {of}</p>
        <h2 className="mz-mr-prompt" data-testid="mz-fq-prompt">{st.prompt}</h2>
        <p className="mz-mr-mine">You wrote this one, so sit back and keep a straight face. If some, but not all, get it right, you score 50.</p>
        <MchezoWaiting label="Watching the family answer" players={players} playerId={playerId} publicGame={publicGame} footNote="The answer, and that you asked it, come next." />
        {skip}
      </main>
    );
  }

  if (st.mySkipped || st.myAnswer !== undefined) {
    const picked = st.myAnswer !== undefined ? st.options?.[st.myAnswer] : undefined;
    return (
      <main className="mz-screen" aria-label={`${title}: ${picked ? "locked in" : "sitting this one out"}, question ${round} of ${of}`} data-testid="mz-fq-wait">
        <GameHeader title={title} objective={picked ? "Locked in" : "Sitting this one out"} accent={0} />
        <p className="mz-mr-round">Question {round} of {of}</p>
        <h2 className="mz-mr-prompt" data-testid="mz-fq-prompt">{st.prompt}</h2>
        {picked && <p className="mz-mr-mine" data-testid="mz-fq-locked">You picked <b>{picked}</b>.</p>}
        <MchezoWaiting label="Waiting for the family" players={players} playerId={playerId} publicGame={publicGame} footNote="The answer, and who asked, come next." />
        {skip}
      </main>
    );
  }

  return (
    <main className="mz-screen" aria-label={`${title}: question ${round} of ${of}`} data-testid="mz-fq-answer">
      <GameHeader title={title} objective={st.kind === "who" ? "Who in the family?" : "Only the family would know"} accent={0} />
      <p className="mz-mr-round">Question {round} of {of} · {kindWord(st.kind)}</p>
      <h2 className="mz-mr-prompt" data-testid="mz-fq-prompt">{st.prompt}</h2>
      <div className="mz-fq-opts">
        {(st.options ?? []).map((o, i) => (
          <Option key={i} i={i} text={o} testId={`mz-fq-option-${i}`} disabled={pending !== null} state={pending === String(i) ? "chosen" : undefined}
            note={pending === String(i) ? <span className="mz-fq-opt__tag">Sending…</span> : null}
            onPick={() => void send("family-answer", { round: st.round ?? 0, choice: i }, String(i))} />
        ))}
      </div>
      {failure}
      <FeedbackLine testId="mz-fq-feedback">{counts}</FeedbackLine>
      <button type="button" className="mz-chip-btn" style={{ alignSelf: "center", marginTop: 8 }} disabled={pending !== null} onClick={() => void send("abstain", {}, "skip")} data-testid="mz-fq-pass">Pass on this one</button>
      {skip}
    </main>
  );
}

/** One line per round, for the recap (phone results and the TV review). */
export function familyRoundLine(r: FamilyReveal, nameOf: (id: string) => string): string {
  if (r.skipped) return "Skipped by the host.";
  const answer = r.options?.[r.correctIndex ?? -1] ?? "";
  const got = r.right?.length ?? 0;
  return `“${answer}” · asked by ${r.askedByName ?? nameOf(r.askedBy ?? "")} · ${got === 0 ? "nobody got it" : `${got} got it`}${r.greatQuestion ? " · 🌟 great question" : ""}`;
}

/** Results: every question with its answer and who asked, the scores, how scoring works. */
export function MchezoFamilyResults({ game, publicGame, players, playerId, title, onBackToLobby, hero, next }: { game: PlayerGame; publicGame?: PublicGame; players: PublicPlayer[]; playerId: string; title: string; onBackToLobby: () => void; hero?: ReactNode; next?: ReactNode }) {
  const { casual } = useMchezo();
  const st = (game.state ?? {}) as FamilyGameView;
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.displayName ?? "Someone";
  const rows = Object.entries(game.rawScores ?? publicGame?.rawScores ?? {}).map(([id, score]) => ({
    id, name: nameOf(id), score: score as number, you: id === playerId,
    detail: participationLine("family-questions", game.outcome?.participation[id], { you: id === playerId }),
  }));
  const great = (st.rounds ?? []).filter((r) => r.greatQuestion && r.askedBy);
  return (
    <main className="mz-screen" aria-label={`${title} results`} data-testid="mz-fq-results">
      {hero}
      {next}
      <GameHeader title={title} objective="How well do you know this family?" accent={0} />
      {great.length > 0 && <p className="mz-moment" data-testid="results-moment">🌟 Great {great.length === 1 ? "question" : "questions"} from {[...new Set(great.map((r) => (r.askedBy === playerId ? "you" : r.askedByName ?? nameOf(r.askedBy))))].join(" and ")}.</p>}
      <ol className="mz-mr-recap">
        {(st.rounds ?? []).map((r, i) => (
          <li key={i} data-testid="mz-fq-recap-round">
            <span className="mz-foot" style={{ textAlign: "left" }}>Question {i + 1}{r.skipped ? "" : `: ${r.prompt}`}</span>
            <span className="mz-mr-recap__line">{familyRoundLine(r, (id) => nameOf(id))}</span>
          </li>
        ))}
      </ol>
      <ScoreList rows={rows} />
      <p className="mz-foot" data-testid="mz-fq-howscore">100 points for a right answer. Nobody answers their own question; when some, but not all, of the others get it right, its writer scores 50 for a great question. {casual ? "Casual game: just for fun." : "Practice game: no Cup points."}</p>
      <OutcomeSummary gameId="family-questions" outcome={game.outcome} official={publicGame?.official ?? game.official} youId={playerId} />
      <div className="mz-grow" />
      <Keycap block onClick={onBackToLobby} data-testid="show-back-to-lobby">Back to lobby</Keycap>
    </main>
  );
}

/** TV: the question and its options, "N of M answered"; at the reveal, the answer, who asked, and who got it. */
export function FamilyTv({ game, title, nameOf }: { game: PublicGame; title: string; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as FamilyGameView;
  const round = (st.round ?? 0) + 1;
  const of = st.roundCount ?? 0;
  if (st.phase === "reveal" && st.result) {
    const r = st.result;
    return (
      <section className={`mz-tvshow-fq${(r.prompt?.length ?? 0) > 70 ? " mz-tvshow-fq--long" : ""}`} data-testid="tv-live-family-questions">
        <span className="mz-tv-kicker">{title} · question {round} of {of} · the answer</span>
        <h1 className="mz-tvshow-h1">{r.prompt}</h1>
        <AskedBy r={r} nameOf={nameOf} testId="tv-fq-asked" />
        <RevealOptions r={r} prefix="tv-fq" />
        <p className="mz-tvshow-line" data-testid="tv-fq-right">{(r.right?.length ?? 0) === 0 ? "Nobody got this one!" : `Got it: ${r.right!.map(nameOf).join(", ")}`}</p>
      </section>
    );
  }
  return (
    <section className={`mz-tvshow-fq${(st.prompt?.length ?? 0) > 70 ? " mz-tvshow-fq--long" : ""}`} data-testid="tv-live-family-questions">
      <span className="mz-tv-kicker">{title} · question {round} of {of} · {kindWord(st.kind)}</span>
      <h1 className="mz-tvshow-h1" data-testid="tv-fq-prompt">{st.prompt}</h1>
      <div className="mz-tvshow-fq__row">
        <div className="mz-fq-opts">{(st.options ?? []).map((o, i) => <Option key={i} i={i} text={o} disabled testId={`tv-fq-option-${i}`} />)}</div>
        <TVRing value={st.done ?? 0} total={Math.max(1, st.total ?? game.players.length)} color="var(--mz-answer-1)">
          <span className="mz-tvshow-ring" data-testid="tv-live-progress"><b>{st.done ?? 0} of {st.total ?? game.players.length}</b> answered</span>
        </TVRing>
      </div>
      <p className="mz-tvshow-line mz-tvshow-line--muted mz-tvshow-fq__hint">Someone here wrote this. Who? You’ll find out with the answer.</p>
    </section>
  );
}

/** TV post-game review: every question, its answer and who asked. */
export function FamilyReview({ game, nameOf }: { game: PublicGame; nameOf: (id: string) => string }) {
  const st = (game.state ?? {}) as FamilyGameView;
  return (
    <ol className="mz-mr-recap" data-testid="tv-fq-review">
      {(st.rounds ?? []).map((r, i) => <li key={i}><b>Question {i + 1}{r.skipped ? "" : `: ${r.prompt}`}</b><span className="mz-mr-recap__line">{familyRoundLine(r, nameOf)}</span></li>)}
    </ol>
  );
}
