import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GameIntroScreen, LandingScreen, LobbyScreen, LockedScreen, PhoneRevealScreen, QuestionScreen,
  rankMovement, rankStandings, type GameInfo, type MchezoTheme, type Player, type ReactionEvent, type ReactionId, type SessionInfo,
} from '../src';
import { FAMILY_CUP, makePlayers, QUESTIONS, scoresAfter } from './mock';

type Screen = 'landing' | 'lobby' | 'intro' | 'question' | 'locked' | 'reveal';

export interface PhoneDemoProps {
  theme: MchezoTheme;
  start: Screen;
  playerCount: number;
  long: boolean;
  offline: number;
  tv: boolean;
  /** Freeze timers and simulated arrivals (for still screenshots). */
  still: boolean;
}

const GAME: GameInfo = { name: 'Know-It-All', kind: 'Trivia', accentIndex: 3 };
const TOTAL = 20;

export function PhoneDemo({ theme, start, playerCount, long, offline, tv: tv0, still }: PhoneDemoProps) {
  const seasonal = theme.id === 'christmas';
  const qs = QUESTIONS[seasonal ? 'christmas' : 'everyday'];
  const all = useMemo(() => makePlayers(playerCount, { long, offline }), [playerCount, long, offline]);
  const session: SessionInfo = seasonal
    ? { roomCode: 'WREN', championship: FAMILY_CUP, eventName: 'The Hartley Family Christmas' }
    : { roomCode: 'WREN', sessionLabel: 'Tonight · 3 games' };

  const [screen, setScreen] = useState<Screen>(start);
  const [code, setCode] = useState(start === 'landing' ? '' : 'WREN');
  const [name, setName] = useState(start === 'landing' ? '' : all[0].name);
  const [joined, setJoined] = useState(start === 'landing' || !still ? Math.min(3, all.length) : all.length);
  const [tv, setTv] = useState(tv0);
  const [qi, setQi] = useState(0);
  const [picks, setPicks] = useState<(string | null)[]>(start === 'reveal' ? ['a', null] : [null, null]);
  const [locked, setLocked] = useState(false);
  const [t0, setT0] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [nudgedBy, setNudgedBy] = useState<string[]>([]);
  const [shown, setShown] = useState<number | undefined>(undefined);
  const rid = useRef(0);

  const players: Player[] = useMemo(() => {
    const ps = all.slice(0, joined).map((p, i) => (i === 0 ? { ...p, name: name.trim() || p.name } : p));
    return ps;
  }, [all, joined, name]);

  const go = (s: Screen) => { setScreen(s); setT0(Date.now()); setNow(Date.now()); };

  // clock
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  const el = (now - t0) / 1000;

  // arrivals
  useEffect(() => {
    if (screen !== 'lobby' || still || joined >= all.length) return;
    const t = setTimeout(() => setJoined((j) => j + 1), 1600);
    return () => clearTimeout(t);
  }, [screen, joined, all.length, still]);

  // ambient reactions from others
  useEffect(() => {
    if (still || (screen !== 'lobby' && screen !== 'locked')) return;
    const t = setInterval(() => {
      const others = players.filter((p, i) => i > 0 && p.connection !== 'disconnected');
      if (!others.length) return;
      const ids: ReactionId[] = (theme.reactions as ReactionId[]) ?? ['love', 'bravo', 'ha', 'wow'];
      const p = others[Math.floor(Math.random() * others.length)];
      setReactions((r) => [...r.filter((x) => Date.now() - x.at < 2000), { id: 'r' + rid.current++, playerId: p.id, reaction: ids[Math.floor(Math.random() * ids.length)], at: Date.now() }]);
    }, 2600);
    return () => clearInterval(t);
  }, [screen, players, still, theme]);

  const react = (r: ReactionId) => setReactions((x) => [...x.filter((y) => Date.now() - y.at < 2000), { id: 'r' + rid.current++, playerId: all[0].id, reaction: r, at: Date.now() }]);
  const nudge = (id: string) => {
    // Simulate the other person nudging back after a moment.
    setTimeout(() => { setNudgedBy((n) => [...n, id]); setTimeout(() => setNudgedBy((n) => n.filter((x) => x !== id)), 1600); }, 1200);
  };

  // intro → question
  useEffect(() => { if (screen === 'intro' && el >= 3) { setLocked(false); go('question'); } });
  // question timer / lock
  const secondsLeft = still ? 14 : Math.max(0, Math.ceil(TOTAL - el));
  useEffect(() => {
    if (screen !== 'question') return;
    if (picks[qi] == null && secondsLeft <= 0) { go('locked'); }
  });
  const select = (id: string) => {
    setPicks((p) => { const n = [...p]; n[qi] = id; return n; });
    setLocked(true);
    setTimeout(() => go('locked'), still ? 1300 : 1100);
  };
  // waiting → reveal
  const active = players.filter((p) => p.connection !== 'disconnected');
  const answeredCount = screen === 'locked' ? Math.min(active.length, 1 + Math.floor(el / 0.5)) : active.length;
  const answeredIds = new Set(active.slice(0, answeredCount).map((p) => p.id));
  useEffect(() => { if (screen === 'locked' && answeredCount >= active.length && el > 1.2 + active.length * 0.5) { setShown(0); go('reveal'); } });
  // points count-up (display only)
  const q = qs[qi];
  const after = scoresAfter(players, qs, qi, picks);
  const before = qi === 0 ? after.map((s) => ({ ...s, score: s.score - (s.delta ?? 0), delta: 0 })) : scoresAfter(players, qs, qi - 1, picks);
  const rankedAfter = rankStandings(after, players);
  const rankedBefore = rankStandings(before, players);
  const me = rankedAfter.find((r) => r.playerId === all[0].id);
  const myPoints = after.find((s) => s.playerId === all[0].id)?.delta ?? 0;
  useEffect(() => {
    if (screen !== 'reveal') return;
    if (still || document.querySelector('[data-mz-motion="reduced"]')) { setShown(myPoints); return; }
    setShown(Math.min(myPoints, Math.round(myPoints * Math.min(1, el / 0.9))));
  }, [screen, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts: Record<string, number> = {};
  players.forEach((p, i) => {
    const pick = i === 0 ? picks[qi] : p.connection === 'disconnected' ? null : q.picks[i];
    if (pick) counts[pick] = (counts[pick] ?? 0) + 1;
  });

  switch (screen) {
    case 'landing':
      return (
        <LandingScreen code={code} onCodeChange={setCode} name={name} onNameChange={setName} onHost={() => {}}
          session={seasonal ? session : undefined}
          onJoin={() => { setJoined(Math.min(3, all.length)); go('lobby'); }}
          extra={<button type="button" className="mz-demo-link" onClick={() => { setCode('WREN'); if (!name) setName('Priya'); }}>Try the demo room WREN</button>} />
      );
    case 'lobby':
      return (
        <LobbyScreen session={session} players={players} youId={all[0].id} isHost nextGame={{ ...GAME, kind: seasonal ? 'Holiday trivia' : 'Trivia' }}
          tvConnected={tv} onTvChange={setTv} reactions={reactions} onReact={react} onNudge={nudge} nudgedBy={nudgedBy}
          onStart={() => { setQi(0); setPicks([null, null]); go('intro'); }} />
      );
    case 'intro':
      return <GameIntroScreen game={GAME} kicker={seasonal ? `${FAMILY_CUP.name} · Game 1 of 3` : 'Game 1 of 3 · Trivia'} line="Tap an answer to lock it in. No take-backs." count={Math.max(1, 3 - Math.floor(el))} />;
    case 'question':
      return <QuestionScreen game={GAME} category={q.category} questionNumber={qi + 1} questionCount={qs.length} question={q.question} options={q.options}
        selectedId={picks[qi]} locked={locked} onSelect={select} secondsLeft={secondsLeft} totalSeconds={TOTAL} />;
    case 'locked': {
      const idx = q.options.findIndex((o) => o.id === picks[qi]);
      return <LockedScreen questionNumber={qi + 1} questionCount={qs.length} answer={idx >= 0 ? { label: q.options[idx].label, index: idx } : null}
        players={players} answeredIds={answeredIds} youId={all[0].id} tvConnected={tv} onReact={react} />;
    }
    case 'reveal': {
      const mv = rankMovement(rankedBefore, rankedAfter).get(all[0].id) ?? 0;
      return <PhoneRevealScreen correct={picks[qi] == null ? null : picks[qi] === q.correctId} correctLabel={q.options.find((o) => o.id === q.correctId)!.label}
        points={myPoints} pointsShown={shown ?? myPoints} rank={me?.rank} movement={mv} tvConnected={tv}
        options={q.options} counts={counts} correctId={q.correctId} ranked={rankedAfter} players={players} youId={all[0].id} fact={q.fact}
        nextLabel={qi === 0 ? 'Next question' : 'Back to the circle'}
        onNext={() => { if (qi === 0) { setQi(1); go('intro'); } else { setQi(0); go('lobby'); } }} />;
    }
  }
}
