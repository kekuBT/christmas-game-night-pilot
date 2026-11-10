// Mchezo Trivia phone flow, driven entirely by the server projection.
// One question at a time (the server accepts answers in any order; this UI
// simply presents the first unanswered question). After answering, the player
// sees a locked/waiting view; after the last answer they wait for the game
// to finish, then results come from the finished projection — never from
// client-side scoring. Waiting shows COUNTS ONLY (submittedCount), never
// per-player answered marks, because the server deliberately does not
// project who has answered (privacy design L27). The handoff's
// WaitingCircle is therefore not used here; the ring below reuses the
// approved mz-wait styles with an honest count in the centre and
// PlayerTokens that carry only offline badges.
import { satOutLabel, serverNowEstimate } from "../../ui/mchezo/lib/lifecycle.js";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnswerDistribution, AnswerGrid, Keycap, MchezoWaiting, PhoneScreen, ResultCard, Stamp, StandingsList } from "../../ui/mchezo/index.js";
import { GameIntroScreen, QuestionScreen } from "../../ui/mchezo/index.js";
import { clampStep, rankStandings, revealSteps, stepLabel } from "../../ui/mchezo/index.js";
import type { GameState, PlayerGame, PublicGame, PublicPlayer } from "../../types.js";
import { asRecord } from "../../types.js";
import { toMzPlayers } from "./adapters.js";

export interface MchezoTriviaDeps {
  game: PlayerGame;
  publicGame?: PublicGame;
  players: PublicPlayer[];
  playerId: string;
  gamesTitle: string;
  intent: (gameInstanceId: string, action: string, payload: Record<string, unknown>) => Promise<void>;
  post: <T>(path: string, body: Record<string, unknown>) => Promise<T>;
  onBackToLobby: () => void;
  roomId: string;
  isHostOrCohost?: boolean;
  /** The game window from the server policy (for the timer ring). */
  windowMs?: number;
  /** Open the TV stage without leaving the game (view switch only). */
  onTv?: () => void;
  /** Previous finished same-type game's scores, for honest gains. */
  previousScores?: Record<string, number>;
  /** Stage 3: the results header (who won, your place). Shown first, and again on the standings. */
  hero?: ReactNode;
}

function stateOf(game: PlayerGame): GameState {
  return asRecord(game.state) as GameState;
}

/** Intro: 8s countdown, then the game begins (same timing as ShowIntro). */
export function MchezoTriviaIntro({ title, onStart }: { title: string; onStart: () => void }) {
  const [count, setCount] = useState(8);
  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);
  useEffect(() => {
    if (count === 0) onStart();
  }, [count, onStart]);
  return (
    <GameIntroScreen
      game={{ name: title, kind: "Trivia", accentIndex: 3 }}
      kicker="Trivia Showdown"
      line="Ten questions. One tap locks your answer."
      count={count}
    />
  );
}

export function MchezoTriviaPlay(deps: MchezoTriviaDeps) {
  const { game, publicGame, players, playerId, gamesTitle, intent, onTv } = deps;
  // Sprint 3: no host skip here. The server ends the game at its deadline
  // by itself; the waiting view shows the countdown (GameClock).
  const st = stateOf(game);
  const questions = st.questions ?? [];
  const myAnswers: Record<string, number> = st.myAnswers ?? {};
  const [lastAnswered, setLastAnswered] = useState<string | null>(null);
  // Sprint 2: the answered question is recorded at TAP time, and the grid
  // stays locked on the tapped option until the server answers. Recording
  // it only after the request + refresh resolved let the server's push
  // advance the screen to the next question first, which then flipped back
  // to the previous question's locked view (a visible flash, and a tap on
  // the vanishing question could be lost).
  const [pending, setPending] = useState<{ qid: string; choice: number } | null>(null);
  const firstUnanswered = questions.find((q) => myAnswers[q.id] === undefined);
  // Server time (offset-corrected), and the game's real window from the policy table.
  const secondsLeft = publicGame?.deadlineAt ? Math.max(0, Math.round((publicGame.deadlineAt - serverNowEstimate()) / 1000)) : 0;
  const totalSeconds = Math.round((deps.windowMs ?? 300_000) / 1000);

  // Sat out: the server records whole-game abstention; show the wait, not Q1.
  if (game.abstained) {
    return <MchezoWaiting label={satOutLabel(game)} players={players} playerId={playerId} publicGame={publicGame} onTv={onTv} showClock />;
  }
  // Just answered: locked view until the player moves on. If the poll has
  // not landed yet (answer not in myAnswers), fall through to the question
  // view — the next poll shows the locked view.
  const lockedQ = lastAnswered ? questions.find((x) => x.id === lastAnswered) : undefined;
  const lockedChoice = lockedQ ? myAnswers[lockedQ.id] : undefined;
  if (lockedQ && lockedChoice !== undefined) {
    return (
      <main className="mz-screen" aria-label="Answer locked in">
        <section className="mz-lockcard" style={{ background: `var(--mz-answer-${lockedChoice % 4})`, color: "var(--mz-on-accent)" }}>
          <span className="mz-kicker">Your answer</span>
          <span className="mz-lockcard__answer">{lockedQ.options[lockedChoice]}</span>
          <Stamp className="mz-lockcard__stamp">LOCKED IN</Stamp>
        </section>
        <MchezoWaiting label="Waiting for everyone" players={players} playerId={playerId} publicGame={publicGame} onTv={onTv} showClock />
        <div style={{ padding: "0 16px 16px" }}>
          <Keycap block variant="neutral" onClick={() => setLastAnswered(null)}>
            {firstUnanswered ? "Next question" : "Waiting for the game to finish"}
          </Keycap>
        </div>
      </main>
    );
  }
  // All answered: wait for the rest of the room (or the deadline/host skip).
  if (!firstUnanswered) {
    return <MchezoWaiting label="All your answers are in" players={players} playerId={playerId} publicGame={publicGame} onTv={onTv} showClock />;
  }
  const idx = questions.indexOf(firstUnanswered);
  const pendingHere = pending && pending.qid === firstUnanswered.id ? pending.choice : null;
  const selected = myAnswers[firstUnanswered.id] ?? pendingHere;
  return (
    <QuestionScreen
      game={{ name: gamesTitle, kind: "Trivia", accentIndex: 3 }}
      questionNumber={idx + 1}
      questionCount={questions.length}
      question={firstUnanswered.prompt}
      options={firstUnanswered.options.map((label, i) => ({ id: String(i), label }))}
      selectedId={selected === null ? null : String(selected)}
      locked={selected !== null}
      sending={myAnswers[firstUnanswered.id] === undefined && pendingHere !== null}
      onSelect={(id) => {
        if (pending) return;
        setPending({ qid: firstUnanswered.id, choice: Number(id) });
        setLastAnswered(firstUnanswered.id);
        void intent(game.id, "trivia-answer", { questionId: firstUnanswered.id, chosenIndex: Number(id) }).finally(() => setPending(null));
      }}
      secondsLeft={secondsLeft}
      totalSeconds={totalSeconds}
      extra={
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="mz-chip-btn"
            onClick={() => { void intent(game.id, "abstain", {}); }}
          >
            Sit this game out
          </button>
          {onTv && (
            <button type="button" className="mz-chip-btn" data-testid="mz-tv-stage" onClick={onTv}>
              TV stage
            </button>
          )}
        </div>
      }
    />
  );
}

/** Post-completion staged reveal (Milestone D, decision L42). The sequence
    walks question → reveal per question, then a standings finale. It
    renders ONLY for finished games: steps are empty otherwise, so no
    correct answer or distribution can ever appear while play is live.
    No server change — every value below comes from the finished
    projection (correctIndex, answerCounts, questionPoints, rawScores). */
export function MchezoTriviaResults(deps: MchezoTriviaDeps) {
  const { game, publicGame, players, playerId, onBackToLobby, onTv, previousScores, hero } = deps;
  const st = stateOf(game);
  const questions = st.questions ?? [];
  const myAnswers: Record<string, number> = st.myAnswers ?? {};
  const finished = publicGame?.status === "finished";
  // Memoised on primitives so the 2s projection polls don't hand the
  // auto-play effect a new steps array each render and reset its timer.
  const steps = useMemo(() => revealSteps(questions.length, finished), [questions.length, finished]);
  const [stepIdx, setStepIdx] = useState(0);
  const [auto, setAuto] = useState(false);
  const idx = clampStep(steps, stepIdx);
  const step = steps[idx];
  const mzPlayers = toMzPlayers(players);
  const raw = publicGame?.rawScores ?? game.rawScores ?? {};
  const ranked = rankStandings(Object.entries(raw).map(([pid, score]) => ({
    playerId: pid,
    score,
    // Gain vs the previous same-type game only; otherwise no gain chip.
    delta: previousScores && pid in previousScores ? score - previousScores[pid]! : undefined,
  })), mzPlayers);
  const meRank = ranked.find((r) => r.playerId === playerId);
  const tiedWith = meRank ? ranked.filter((r) => r.rank === meRank.rank).length - 1 : 0;
  const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
  const go = (i: number) => setStepIdx(clampStep(steps, i));

  // Auto-play: one step every 6s; stops (and switches off) at the finale.
  useEffect(() => {
    if (!auto) return;
    if (!step || step.kind === "standings") { setAuto(false); return; }
    const t = setTimeout(() => setStepIdx(clampStep(steps, idx + 1)), 6000);
    return () => clearTimeout(t);
  }, [auto, idx, step, steps]);

  // Never reveal early: without finished steps there is nothing to show.
  if (!step) {
    return (
      <main className="mz-screen" aria-label="Results">
        <p className="mz-foot">Results appear here when the game finishes.</p>
      </main>
    );
  }

  const qIndex = step.kind === "standings" ? -1 : step.index;
  const q = qIndex >= 0 ? questions[qIndex] : undefined;
  const counts = publicGame?.answerCounts?.[q?.id ?? ""] ?? [];
  const countsRecord: Record<string, number> = {};
  (q?.options ?? []).forEach((_, i) => { countsRecord[String(i)] = counts[i] ?? 0; });
  const countsTotal = Object.values(countsRecord).reduce((a, b) => a + b, 0);
  const myChoice = q ? myAnswers[q.id] : undefined;
  const correctIdx = q?.correctIndex;
  const correct = myChoice === undefined || correctIdx === undefined ? null : myChoice === correctIdx;
  // Points earned from THIS question only, from the server's own
  // per-question values (finished trivia only). The game total and rank
  // below are whole-game figures — deliberately kept separate so a wrong
  // answer on one question never reads as a bad game result.
  const qValue = q ? publicGame?.questionPoints?.[q.id] : undefined;
  const earned = qValue === undefined ? undefined : correct ? qValue : 0;
  const totalLine = (
    <p className="mz-foot">Your game total: <b>{game.myScore}</b> points · Game rank: <b>{meRank ? ordinal(meRank.rank) : "—"}</b>{tiedWith > 0 ? `, tied with ${tiedWith} other${tiedWith === 1 ? "" : "s"}` : ""}. The rank is for the whole game, not this question.</p>
  );
  const nextLabel = step.kind === "question" ? "Reveal answer" : step.kind === "reveal" ? (qIndex === questions.length - 1 ? "See standings" : "Next question") : "Back to lobby";
  const onNext = step.kind === "standings" ? onBackToLobby : () => go(idx + 1);
  const nav = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button type="button" className="mz-chip-btn" data-testid="mz-reveal-prev" disabled={idx === 0} onClick={() => go(idx - 1)}>Previous</button>
      <button type="button" className="mz-chip-btn" data-testid="mz-reveal-next" onClick={onNext}>{nextLabel}</button>
      {/* S3-TRV-03: at the standings there is nothing left to play, so instead of a greyed-out
          "Play reveal" (it read as broken), offer to replay it from the first question. Same
          finished-game data as before: nothing is revealed that the results don't already show. */}
      {step.kind === "standings"
        ? <button type="button" className="mz-chip-btn" data-testid="mz-reveal-replay" onClick={() => { setStepIdx(0); setAuto(true); }}>Replay from Q1</button>
        : <button type="button" className="mz-chip-btn" data-testid="mz-reveal-play" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>{auto ? "Pause reveal" : "Play reveal"}</button>}
      {step.kind !== "standings" && <button type="button" className="mz-chip-btn" onClick={onBackToLobby}>Back to lobby</button>}
    </div>
  );
  const jumps = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {questions.map((qq, i) => {
        const mine = myAnswers[qq.id];
        const ok = qq.correctIndex !== undefined && mine !== undefined && mine === qq.correctIndex;
        return (
          <button key={qq.id} type="button" className="mz-chip-btn" data-testid={`mz-reveal-q${i}`} aria-pressed={step.kind !== "standings" && step.index === i} onClick={() => go(i * 2)}>
            Q{i + 1} {mine === undefined ? "· no answer" : ok ? "· ✓" : "· ✗"}
          </button>
        );
      })}
      <button type="button" className="mz-chip-btn" data-testid="mz-reveal-standings" aria-pressed={step.kind === "standings"} onClick={() => go(steps.length - 1)}>Standings</button>
    </div>
  );
  const tvBtn = onTv ? <div style={{ marginTop: 8 }}><button type="button" className="mz-chip-btn" data-testid="mz-tv-stage" onClick={onTv}>TV stage</button></div> : null;

  if (step.kind === "question" && q) {
    return (
      <div data-testid="mz-reveal-step" data-step-kind="question" data-step-index={idx}>
        <PhoneScreen label={stepLabel(step, questions.length)}>
          {idx === 0 && hero}
          <span className="mz-kicker">Trivia Showdown</span>
          <span className="mz-muted">{stepLabel(step, questions.length)}</span>
          <h1 className="mz-question">{q.prompt}</h1>
          <div className="mz-grow mz-grow--min" />
          <AnswerGrid options={q.options.map((label, i) => ({ id: String(i), label }))} selectedId={myChoice === undefined ? null : String(myChoice)} locked={myChoice !== undefined} onSelect={() => {}} disabled />
          <p className="mz-foot" role="status">{myChoice === undefined ? "This question: you didn't answer." : `This question: you answered ${q.options[myChoice] ?? "—"} — locked in.`}</p>
          {totalLine}
          {nav}
          {jumps}
          {tvBtn}
        </PhoneScreen>
      </div>
    );
  }

  if (step.kind === "reveal" && q) {
    return (
      <div data-testid="mz-reveal-step" data-step-kind="reveal" data-step-index={idx}>
        <PhoneScreen label={stepLabel(step, questions.length)}>
          <div data-testid="mz-reveal-answer">
            <ResultCard correct={correct} correctLabel={correctIdx !== undefined ? q.options[correctIdx] ?? "" : "—"} points={earned} rank={meRank?.rank} />
          </div>
          <AnswerDistribution options={q.options.map((label, i) => ({ id: String(i), label }))} counts={countsRecord} correctId={correctIdx === undefined ? "" : String(correctIdx)} total={countsTotal} />
          {q.explanation && <p className="mz-review__why" data-testid="mz-reveal-explanation">{q.explanation}</p>}
          <p className="mz-foot">This question: {myChoice === undefined ? "you didn't answer" : `you answered ${q.options[myChoice] ?? "—"}`} — {correct === null ? "no result" : correct ? `correct, +${earned ?? 0} points` : "not correct, +0 points"}.</p>
          {totalLine}
          {nav}
          {jumps}
          {tvBtn}
        </PhoneScreen>
      </div>
    );
  }

  // Standings finale: everyone in a small room; a top-2 preview that expands to every player in a larger one (S3-RES-01).
  return (
    <div data-testid="mz-reveal-step" data-step-kind="standings" data-step-index={idx}>
      <PhoneScreen label="Standings">
        {hero}
        {totalLine}
        <StandingsList ranked={ranked} youId={playerId} players={mzPlayers} limit={2} />
        <details style={{ marginTop: 8 }}>
          <summary className="mz-foot" style={{ cursor: "pointer" }}>About these standings</summary>
          <p className="mz-foot">Standings here are whole-game totals, ranked with shared ranks for ties. Family Cup totals live in Championship.</p>
        </details>
        {nav}
        {jumps}
        {tvBtn}
      </PhoneScreen>
    </div>
  );
}
