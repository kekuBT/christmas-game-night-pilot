export interface SprintCategory {
  name: string;
  answers: string[]; // Curated valid answers, lowercased for matching
}

export const SPRINT_CATEGORIES: SprintCategory[] = [
  { name: "Fruits", answers: ["apple", "banana", "orange", "grape", "mango", "pear", "peach", "lemon", "strawberry", "cherry"] },
  { name: "Animals", answers: ["dog", "cat", "horse", "elephant", "lion", "tiger", "bear", "rabbit", "mouse", "fox"] },
  { name: "Christmas things", answers: ["tree", "stocking", "wreath", "tinsel", "bauble", "snowman", "reindeer", "sleigh", "mistletoe", "gingerbread"] },
];

export function normalizeSprintAnswer(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ");
}

/** Score one round: 20 per valid distinct answer + 20 per answer no other player gave. Max 200 for 5 unique. */
export function scoreSprintRound(
  category: SprintCategory,
  submissions: Record<string, string[]>,
): Record<string, number> {
  const validByPlayer: Record<string, string[]> = {};
  for (const [pid, answers] of Object.entries(submissions)) {
    const seen = new Set<string>();
    const valid: string[] = [];
    for (const raw of answers.slice(0, 5)) {
      const norm = normalizeSprintAnswer(raw);
      if (norm && category.answers.includes(norm) && !seen.has(norm)) {
        seen.add(norm);
        valid.push(norm);
      }
    }
    validByPlayer[pid] = valid;
  }
  const counts = new Map<string, number>();
  for (const valid of Object.values(validByPlayer)) {
    for (const a of valid) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  const scores: Record<string, number> = {};
  for (const [pid, valid] of Object.entries(validByPlayer)) {
    let score = valid.length * 20;
    for (const a of valid) if (counts.get(a) === 1) score += 20;
    scores[pid] = score;
  }
  return scores;
}
