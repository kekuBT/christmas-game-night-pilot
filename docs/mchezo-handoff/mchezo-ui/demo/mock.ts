/**
 * DEMO DATA ONLY. Scores here are illustrative placeholders (a flat 750 per correct
 * answer) used to exercise layout and motion — they are not a Mchezo scoring rule.
 */
import type { AnswerOption, ChampionshipConfig, Player, ScoreEntry } from '../src';

const NAMES = ['Priya', 'Ruth', 'Dev', 'Marcus', 'Elena', 'Theo', 'June', 'Sam', 'Amara', 'Kofi'];
const LONG = ['Priya', 'Bartholomew Fitzgerald-Okonkwo', 'Dev', 'Maximiliana', 'Elena', 'Theodora-Rose', 'June', 'Christopherson', 'Amara', 'Kofi'];

export function makePlayers(n: number, opts: { long?: boolean; offline?: number } = {}): Player[] {
  const src = opts.long ? LONG : NAMES;
  return src.slice(0, n).map((name, i) => ({
    id: 'p' + i,
    name,
    isHost: i === 0,
    // Disconnected players are taken from the end of the list.
    connection: opts.offline && i >= n - opts.offline && i > 0 ? 'disconnected' : 'connected',
  }));
}

export interface Question {
  category: string;
  question: string;
  options: AnswerOption[];
  correctId: string;
  fact: string;
  /** Mock picks by player index (others' answers). */
  picks: (string | null)[];
}

const opts = (labels: string[]) => labels.map((label, i) => ({ id: 'abcd'[i], label }));

export const QUESTIONS: Record<'everyday' | 'christmas', Question[]> = {
  everyday: [
    { category: 'Nature', question: 'Which is the only continent with no native ants?', options: opts(['Antarctica', 'Australia', 'Europe', 'South America']), correctId: 'a',
      fact: 'Ants live on every other continent, with well over 12,000 described species.', picks: [null, 'a', 'b', 'a', 'a', 'c', 'a', 'a', 'd', 'a'] },
    { category: 'Animals', question: 'How many hearts does an octopus have?', options: opts(['One', 'Two', 'Three', 'Eight']), correctId: 'c',
      fact: 'Two hearts pump blood through the gills; the third sends it around the rest of the body.', picks: [null, 'a', 'c', 'c', 'b', 'c', 'd', 'c', 'c', 'b'] },
  ],
  christmas: [
    { category: 'Traditions', question: 'Which country sends London a Christmas tree for Trafalgar Square every year?', options: opts(['Norway', 'Sweden', 'Denmark', 'Finland']), correctId: 'a',
      fact: 'Oslo has sent one every December since 1947 as thanks for Britain’s wartime support.', picks: [null, 'a', 'b', 'a', 'a', 'c', 'a', 'a', 'd', 'a'] },
    { category: 'Carols', question: 'Add up every gift in “The Twelve Days of Christmas.” How many are there?', options: opts(['78', '144', '364', '12']), correctId: 'c',
      fact: 'All twelve verses together give 364 gifts — nearly one for every day of the year.', picks: [null, 'a', 'c', 'c', 'b', 'c', 'd', 'c', 'c', 'b'] },
  ],
};

export const BASE_SCORES = [2100, 2600, 2350, 1950, 1700, 1600, 1450, 1200, 1100, 950];
export const MOCK_POINTS = 750;

/** Totals after question `qi` (inclusive), given your own picks. */
export function scoresAfter(players: Player[], qs: Question[], qi: number, yourPicks: (string | null)[]): ScoreEntry[] {
  return players.map((p, i) => {
    let score = BASE_SCORES[i] ?? 800;
    let delta = 0;
    for (let k = 0; k <= qi; k++) {
      const pick = i === 0 ? yourPicks[k] : p.connection === 'disconnected' ? null : qs[k].picks[i];
      const pts = pick === qs[k].correctId ? MOCK_POINTS : 0;
      score += pts;
      if (k === qi) delta = pts;
    }
    return { playerId: p.id, score, delta };
  });
}

export const FAMILY_CUP: ChampionshipConfig = { name: 'Family Cup', unitLabel: 'Day', current: 3, total: 7, winners: { 0: 'Ruth', 1: 'Dev' } };
