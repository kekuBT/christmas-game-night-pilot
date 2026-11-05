// Mchezo TV stage for Trivia, driven by the PUBLIC projection only.
// Playing: a featured question (the first question of the set — the TV has
// no per-player position, so it never claims to show "your" question).
// Finished: director stages — question, reveal (real aggregate counts +
// correct answer, post-finish only), leaderboard (this game's raw scores
// with the handoff's phase-consistent animation). Auto mode walks the
// staged reveal (Milestone D): question, reveal per question in order,
// then the leaderboard. The director controls only change what THIS
// screen shows; manual jumps switch auto off.
import { useEffect, useState } from "react";
import { DirectorBar, TVLeaderboard, TVQuestion, TVReveal, TVStage, TVTopBar, useLeaderboardPhases } from "../../ui/mchezo/index.js";
import type { TVStageId } from "../../ui/mchezo/index.js";
import type { GameState, PublicGame, PublicPlayer } from "../../types.js";
import { asRecord } from "../../types.js";
import { toMzPlayers } from "./adapters.js";

export function MchezoTvStage({ publicGame, players, joinCode, onBack, spectatorCount, backLabel, previousScores }: {
  publicGame: PublicGame;
  players: PublicPlayer[];
  joinCode: string;
  onBack: () => void;
  /** Connected spectators (server count). Shown only when positive. */
  spectatorCount?: number;
  /** Spectators have no phone view to return to — they stop watching. */
  backLabel?: string;
  /**
   * Scores of the previous finished game of the same type, when one
   * exists. Drives honest rank movement and gains; when absent the
   * leaderboard shows no movement rather than a faked baseline.
   */
  previousScores?: Record<string, number>;
}) {
  const mzPlayers = toMzPlayers(players);
  const st = asRecord(publicGame.state) as GameState;
  const questions = st.questions ?? [];
  const [stage, setStage] = useState<TVStageId>("question");
  const [picked, setPicked] = useState(0);
  const [auto, setAuto] = useState(true);
  const [revealPhase, setRevealPhase] = useState<"counting" | "bars" | "answer">("counting");
  const finished = publicGame.status === "finished";
  const lbPhase = useLeaderboardPhases(publicGame.id, "before");

  // Auto-director: while playing, the featured question. Once finished,
  // the walk starts at the first question (the walk effect below steps
  // through each reveal to the leaderboard). Manual jumps switch auto
  // off, so they stick until auto is re-enabled.
  useEffect(() => {
    if (!auto) return;
    setStage("question");
    if (finished) setPicked(0);
  }, [auto, finished]);
  // Auto walk (finished games only): question holds 4s, reveal plays
  // its animation then holds to 5s total, then the next question — or
  // the leaderboard after the last reveal.
  useEffect(() => {
    if (!auto || !finished) return;
    if (stage === "leaderboard") return;
    if (questions.length === 0) { setStage("leaderboard"); return; }
    const delay = stage === "question" ? 4000 : 5000;
    const t = setTimeout(() => {
      if (stage === "question") {
        setStage("reveal");
      } else if (picked + 1 < questions.length) {
        setPicked(picked + 1);
        setStage("question");
      } else {
        setStage("leaderboard");
      }
    }, delay);
    return () => clearTimeout(t);
  }, [auto, finished, stage, picked, questions.length]);
  // Reveal animation: counting -> bars -> answer, resetting per question.
  useEffect(() => {
    if (stage !== "reveal") return;
    setRevealPhase("counting");
    const a = setTimeout(() => setRevealPhase("bars"), 900);
    const b = setTimeout(() => setRevealPhase("answer"), 2000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [stage, picked]);

  const q = questions[Math.min(picked, Math.max(0, questions.length - 1))];
  const countsArr = publicGame.answerCounts?.[q?.id ?? ""] ?? [];
  const counts: Record<string, number> = {};
  (q?.options ?? []).forEach((_, i) => { counts[String(i)] = countsArr[i] ?? 0; });
  const raw = publicGame.rawScores ?? {};
  const previous = previousScores
    ? Object.entries(previousScores).map(([playerId, score]) => ({ playerId, score }))
    : undefined;
  const scores = Object.entries(raw).map(([playerId, score]) => ({
    playerId,
    score,
    // Gain vs the previous same-type game only; a player who did not play
    // it has no gain to show (undefined, not an invented zero baseline).
    delta: previousScores && playerId in previousScores ? score - previousScores[playerId]! : undefined,
  }));

  return (
    <div>
      <TVStage>
        <TVTopBar
          game={{ name: "Trivia Showdown", kind: "Trivia", accentIndex: 3 }}
          questionLabel={finished ? "Game finished" : "Featured question · answer on your phone"}
          roomCode={joinCode}
        />
        {stage === "question" && q && (
          <TVQuestion
            question={q.prompt}
            options={q.options.map((label, i) => ({ id: String(i), label }))}
          />
        )}
        {stage === "question" && !q && (
          <TVQuestion question="Trivia Showdown is starting…" options={[]} />
        )}
        {stage === "reveal" && finished && q && (
          <TVReveal
            question={q.prompt}
            options={q.options.map((label, i) => ({ id: String(i), label }))}
            counts={counts}
            correctId={q.correctIndex === undefined ? "" : String(q.correctIndex)}
            phase={revealPhase}
          />
        )}
        {stage === "reveal" && !finished && (
          <TVQuestion question="The reveal plays here when the game finishes." options={[]} />
        )}
        {stage === "leaderboard" && (
          <TVLeaderboard players={mzPlayers} scores={scores} phase={lbPhase} kicker="Trivia Showdown" title="This game's standings" previous={previous} movementNote={previous ? "Rank movement vs the previous Trivia game" : undefined} />
        )}
      </TVStage>
      {finished && questions.length > 0 && (stage === "question" || stage === "reveal") && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 12 }}>
          {questions.map((qq, i) => (
            <button key={qq.id} type="button" className="mz-chip-btn" aria-pressed={i === picked} onClick={() => { setAuto(false); setPicked(i); }}>
              Q{i + 1}
            </button>
          ))}
        </div>
      )}
      <div style={{ padding: 12 }}>
        <DirectorBar
          stage={stage}
          auto={auto}
          onAutoChange={setAuto}
          onJump={(s) => { setAuto(false); setStage(s); }}
          onNext={() => { setAuto(false); setStage(stage === "question" ? "reveal" : stage === "reveal" ? "leaderboard" : "question"); }}
          onPrev={() => { setAuto(false); setStage(stage === "leaderboard" ? "reveal" : stage === "reveal" ? "question" : "leaderboard"); }}
        />
        <button type="button" className="mz-chip-btn" style={{ marginTop: 12 }} onClick={onBack}>{backLabel ?? "Back to phone view"}</button>
        {(spectatorCount ?? 0) > 0 && <p className="mz-foot" data-testid="tv-watching-count">👁 {spectatorCount} watching</p>}
      </div>
    </div>
  );
}
