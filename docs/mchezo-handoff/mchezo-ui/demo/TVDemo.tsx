import { useEffect, useMemo, useState } from 'react';
import {
  DirectorBar, TVCircle, TVLeaderboard, TVQuestion, TVReveal, TVRing, TVStage, TVTopBar, useLeaderboardPhases,
  type LeaderboardPhase, type MchezoTheme, type RevealPhase, type TVStageId,
} from '../src';
import { FAMILY_CUP, makePlayers, QUESTIONS, scoresAfter } from './mock';

const ORDER: TVStageId[] = ['question', 'reveal', 'leaderboard'];
const DUR: Record<TVStageId, number> = { question: 10, reveal: 8, leaderboard: 9 };

export function TVDemo({ theme, stage: stage0, auto: auto0, playerCount, offline, phase0 }: { theme: MchezoTheme; stage: TVStageId; auto: boolean; playerCount: number; offline: number; phase0?: LeaderboardPhase }) {
  const seasonal = theme.id === 'christmas';
  const qs = QUESTIONS[seasonal ? 'christmas' : 'everyday'];
  const players = useMemo(() => makePlayers(playerCount, { offline }), [playerCount, offline]);
  const [stage, setStage] = useState<TVStageId>(stage0);
  const [qi, setQi] = useState(0);
  const [auto, setAuto] = useState(auto0);
  const [t0, setT0] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [run, setRun] = useState(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  const el = (now - t0) / 1000;

  const jump = (s: TVStageId, nextQ = qi) => { setStage(s); setQi(nextQ); setT0(Date.now()); setNow(Date.now()); setRun((r) => r + 1); };
  const next = () => { const i = ORDER.indexOf(stage); if (i === ORDER.length - 1) jump('question', (qi + 1) % qs.length); else jump(ORDER[i + 1]); };
  const prev = () => { const i = ORDER.indexOf(stage); if (i === 0) jump('leaderboard', (qi + qs.length - 1) % qs.length); else jump(ORDER[i - 1]); };
  useEffect(() => { if (auto && el > DUR[stage]) next(); });

  const q = qs[qi];
  // Mock: "you" (Priya) answered correctly on every question for the TV demo.
  const yourPicks = qs.map((x) => x.correctId);
  const scores = scoresAfter(players, qs, qi, yourPicks);
  const active = players.filter((p) => p.connection !== 'disconnected');
  const answered = stage === 'question' ? Math.min(active.length, 1 + Math.floor(el / 1)) : active.length;
  const answeredIds = new Set(active.slice(0, answered).map((p) => p.id));
  const tl = Math.max(0, 20 - Math.floor(el));
  const counts: Record<string, number> = {};
  players.forEach((p, i) => { const pick = i === 0 ? yourPicks[qi] : p.connection === 'disconnected' ? null : q.picks[i]; if (pick) counts[pick] = (counts[pick] ?? 0) + 1; });
  const revealPhase: RevealPhase = el < 0.8 ? 'counting' : el < 2.2 ? 'bars' : 'answer';
  const correctIds = new Set(players.filter((p, i) => (i === 0 ? yourPicks[qi] : q.picks[i]) === q.correctId && p.connection !== 'disconnected').map((p) => p.id));
  const lbPhase = useLeaderboardPhases(run, run === 0 && phase0 ? phase0 : 'before');

  return (
    <TVStage>
      <TVTopBar game={{ name: 'Know-It-All', kind: 'Trivia', accentIndex: 3 }} questionLabel={`Question ${qi + 1} of ${qs.length}`} roomCode="WREN" championship={seasonal ? FAMILY_CUP : undefined} />
      {stage === 'question' && <TVQuestion key={'q' + qi} category={q.category} question={q.question} options={q.options} />}
      {stage === 'reveal' && <TVReveal key={'r' + qi} question={q.question} options={q.options} counts={counts} correctId={q.correctId} phase={revealPhase} />}
      {stage !== 'leaderboard' && (
        <TVCircle players={players}
          litIds={stage === 'question' ? answeredIds : revealPhase === 'answer' ? correctIds : new Set(active.map((p) => p.id))}
          checkIds={stage === 'question' ? answeredIds : revealPhase === 'answer' ? correctIds : new Set()}
          caption={stage === 'question' ? `${answered} of ${active.length} locked in` : revealPhase === 'answer' ? 'Lit up: everyone who got it' : 'Revealing…'}
          center={stage === 'question'
            ? <TVRing value={tl} total={20} color={tl <= 5 ? 'var(--mz-brand)' : 'var(--mz-answer-3)'}><span className="mz-tv-ring__big" role="timer" aria-label={`${tl} seconds left`}>{tl}</span><span className="mz-tv-ring__small">seconds</span></TVRing>
            : <TVRing value={revealPhase === 'answer' ? correctIds.size : 0} total={active.length} color="var(--mz-success)"><span className="mz-tv-ring__big">{revealPhase === 'answer' ? `${correctIds.size}/${active.length}` : '…'}</span><span className="mz-tv-ring__small">{revealPhase === 'answer' ? 'got it right' : 'revealing'}</span></TVRing>} />
      )}
      {stage === 'leaderboard' && (
        <TVLeaderboard key={'l' + qi} players={players} scores={scores} phase={lbPhase}
          kicker={seasonal ? `${FAMILY_CUP.name} · ${FAMILY_CUP.unitLabel} ${FAMILY_CUP.current} of ${FAMILY_CUP.total}` : `After question ${qi + 1} of ${qs.length}`}
          title={seasonal ? 'Today’s standings' : 'Leaderboard'} />
      )}
      <DirectorBar stage={stage} auto={auto} onAutoChange={(a) => { setAuto(a); if (a) { setT0(Date.now()); } }} onJump={(s) => jump(s)} onNext={next} onPrev={prev} />
    </TVStage>
  );
}
