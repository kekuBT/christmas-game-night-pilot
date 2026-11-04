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
import { useEffect, useState } from "react";
import { Keycap, PlayerToken, Stamp } from "../../ui/mchezo/index.js";
import { GameIntroScreen, PhoneRevealScreen, QuestionScreen } from "../../ui/mchezo/index.js";
import { rankStandings } from "../../ui/mchezo/index.js";
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
  /** Open the TV stage without leaving the game (view switch only). */
  onTv?: () => void;
  /** Previous finished same-type game's scores, for honest gains. */
  previousScores?: Record<string, number>;
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
  const { game, publicGame, players, playerId, gamesTitle, intent, post, roomId, isHostOrCohost, onTv } = deps;
  // Host escape hatch for a stalled game, mirroring ShowWaiting: the old
  // waiting banner had a skip button, but the Mchezo Trivia waiting view
  // had none — so a timed-out Trivia game could not be skipped from the
  // very UI that plays it. Polling/WS refresh re-renders after the
  // deadline passes, so this appears without a page reload.
  const stalled = publicGame?.deadlineAt !== undefined && Date.now() > publicGame.deadlineAt;
  const onSkip = stalled && isHostOrCohost ? () => { void post(`/rooms/${roomId}/games/${game.id}/skip`, {}); } : undefined;
  const st = stateOf(game);
  const questions = st.questions ?? [];
  const myAnswers: Record<string, number> = st.myAnswers ?? {};
  const [lastAnswered, setLastAnswered] = useState<string | null>(null);
  const firstUnanswered = questions.find((q) => myAnswers[q.id] === undefined);
  const secondsLeft = publicGame?.deadlineAt ? Math.max(0, Math.round((publicGame.deadlineAt - Date.now()) / 1000)) : 0;

  // Sat out: the server records whole-game abstention; show the wait, not Q1.
  if (game.abstained) {
    return <MchezoWaiting label="You sat this one out" players={players} playerId={playerId} publicGame={publicGame} stalled={stalled} isHostOrCohost={isHostOrCohost} onSkip={onSkip} onTv={onTv} />;
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
        <MchezoWaiting label="Waiting for everyone" players={players} playerId={playerId} publicGame={publicGame} stalled={stalled} isHostOrCohost={isHostOrCohost} onSkip={onSkip} onTv={onTv} />
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
    return <MchezoWaiting label="All your answers are in" players={players} playerId={playerId} publicGame={publicGame} stalled={stalled} isHostOrCohost={isHostOrCohost} onSkip={onSkip} onTv={onTv} />;
  }
  const idx = questions.indexOf(firstUnanswered);
  const selected = myAnswers[firstUnanswered.id] ?? null;
  return (
    <QuestionScreen
      game={{ name: gamesTitle, kind: "Trivia", accentIndex: 3 }}
      questionNumber={idx + 1}
      questionCount={questions.length}
      question={firstUnanswered.prompt}
      options={firstUnanswered.options.map((label, i) => ({ id: String(i), label }))}
      selectedId={selected === null ? null : String(selected)}
      locked={selected !== null}
      onSelect={(id) => {
        void intent(game.id, "trivia-answer", { questionId: firstUnanswered.id, chosenIndex: Number(id) }).then(() => setLastAnswered(firstUnanswered.id));
      }}
      secondsLeft={secondsLeft}
      totalSeconds={300}
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

/** Waiting view: honest counts only. Centre = players who have played so
    far (server submittedCount) out of the room; tokens carry offline badges
    only, never check marks for answers we cannot see. */
function MchezoWaiting({ label, players, playerId, publicGame, stalled, isHostOrCohost, onSkip, onTv }: {
  label: string;
  players: PublicPlayer[];
  playerId: string;
  publicGame?: PublicGame;
  stalled?: boolean;
  isHostOrCohost?: boolean;
  onSkip?: () => void;
  onTv?: () => void;
}) {
  const done = publicGame?.submittedCount ?? 0;
  const total = publicGame?.totalPlayers ?? players.length;
  const mzPlayers = toMzPlayers(players);
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div>
      <p className="mz-kicker">{label}</p>
      <div className="mz-wait">
        <svg className="mz-wait__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={r} className="mz-wait__track" />
          <circle cx="50" cy="50" r={r} className="mz-wait__fill" strokeDasharray={c} strokeDashoffset={c * (1 - done / Math.max(1, total))} transform="rotate(-90 50 50)" />
        </svg>
        {mzPlayers.map((p, k) => {
          const a = -Math.PI / 2 + (k * Math.PI * 2) / Math.max(1, mzPlayers.length);
          return (
            <span key={p.id} className="mz-wait__seat" style={{ left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%` }}>
              <PlayerToken player={p} index={k} size={40} you={p.id === playerId} badge={p.connection === "disconnected" ? "offline" : null} />
              <span className="mz-seat__name">{p.id === playerId ? "You" : p.connection === "disconnected" ? "Away" : p.name}</span>
            </span>
          );
        })}
        <div className="mz-wait__center" role="status" aria-live="polite">
          <span className="mz-wait__count">{done}<small>/{total}</small></span>
          <span className="mz-wait__label">{done < total ? "have played so far" : "everyone’s in"}</span>
        </div>
      </div>
      <p className="mz-foot">The reveal plays right here when the game finishes.</p>
      {onTv && <div style={{ padding: "0 16px 16px" }}><button type="button" className="mz-chip-btn" data-testid="mz-tv-stage" onClick={onTv}>TV stage</button></div>}
      {stalled && isHostOrCohost && onSkip && <><p className="mz-foot">This game has passed its deadline and may be stalled.</p><div style={{ padding: "0 16px 16px" }}><Keycap block variant="neutral" onClick={onSkip}>Skip timed-out game (no scores invented)</Keycap></div></>}
      {stalled && !isHostOrCohost && <p className="mz-foot">The host can skip this game if it stays stalled.</p>}
    </div>
  );
}

export function MchezoTriviaResults(deps: MchezoTriviaDeps) {
  const { game, publicGame, players, playerId, onBackToLobby, onTv, previousScores } = deps;
  const st = stateOf(game);
  const questions = st.questions ?? [];
  const myAnswers: Record<string, number> = st.myAnswers ?? {};
  const [picked, setPicked] = useState(0);
  const mzPlayers = toMzPlayers(players);
  const raw = publicGame?.rawScores ?? game.rawScores ?? {};
  const ranked = rankStandings(Object.entries(raw).map(([pid, score]) => ({
    playerId: pid,
    score,
    // Gain vs the previous same-type game only; otherwise no gain chip.
    delta: previousScores && pid in previousScores ? score - previousScores[pid]! : undefined,
  })), mzPlayers);
  const meRank = ranked.find((r) => r.playerId === playerId);
  const q = questions[Math.min(picked, Math.max(0, questions.length - 1))];
  const counts = publicGame?.answerCounts?.[q?.id ?? ""] ?? [];
  const countsRecord: Record<string, number> = {};
  (q?.options ?? []).forEach((_, i) => { countsRecord[String(i)] = counts[i] ?? 0; });
  const myChoice = q ? myAnswers[q.id] : undefined;
  const correctIdx = q?.correctIndex;
  const correct = myChoice === undefined || correctIdx === undefined ? null : myChoice === correctIdx;
  // Points earned from THIS question only, from the server's own
  // per-question values (finished trivia only). The game total and rank
  // below are whole-game figures — deliberately kept separate so a wrong
  // answer on one question never reads as a bad game result.
  const qValue = q ? publicGame?.questionPoints?.[q.id] : undefined;
  const earned = qValue === undefined ? undefined : correct ? qValue : 0;
  const tiedWith = meRank ? ranked.filter((r) => r.rank === meRank.rank).length - 1 : 0;
  const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
  return (
    <PhoneRevealScreen
      correct={correct}
      correctLabel={correctIdx !== undefined && q ? q.options[correctIdx] ?? "" : "—"}
      points={earned}
      rank={meRank?.rank}
      tvConnected={false}
      options={(q?.options ?? []).map((label, i) => ({ id: String(i), label }))}
      counts={countsRecord}
      correctId={correctIdx === undefined ? "" : String(correctIdx)}
      ranked={ranked}
      players={mzPlayers}
      youId={playerId}
      nextLabel="Back to lobby"
      onNext={onBackToLobby}
      extra={
        <div>
          <p className="mz-foot">This question: {myChoice === undefined ? "you didn't answer" : `you answered ${q?.options[myChoice] ?? "—"}`} — {correct === null ? "no result" : correct ? `correct, +${earned ?? 0} points` : "not correct, +0 points"}.</p>
          <p className="mz-foot">Your game total: <b>{game.myScore}</b> points · Game rank: <b>{meRank ? ordinal(meRank.rank) : "—"}</b>{tiedWith > 0 ? `, tied with ${tiedWith} other${tiedWith === 1 ? "" : "s"}` : ""}. The rank is for the whole game, not this question.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {questions.map((qq, i) => {
              const mine = myAnswers[qq.id];
              const ok = qq.correctIndex !== undefined && mine !== undefined && mine === qq.correctIndex;
              return (
                <button key={qq.id} type="button" className="mz-chip-btn" aria-pressed={i === picked} onClick={() => setPicked(i)}>
                  Q{i + 1} {mine === undefined ? "· no answer" : ok ? "· ✓" : "· ✗"}
                </button>
              );
            })}
          </div>
          {onTv && <div style={{ marginTop: 8 }}><button type="button" className="mz-chip-btn" data-testid="mz-tv-stage" onClick={onTv}>TV stage</button></div>}
          <details style={{ marginTop: 8 }}>
            <summary className="mz-foot" style={{ cursor: "pointer" }}>About these standings</summary>
            <p className="mz-foot">Standings below are whole-game totals, ranked with shared ranks for ties — not this question&apos;s points. Family Cup totals live in Championship. Pick a question above to see how the room answered it.</p>
          </details>
        </div>
      }
    />
  );
}
