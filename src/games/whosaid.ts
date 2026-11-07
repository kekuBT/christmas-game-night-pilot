export interface WhoSaidQuestion {
  id: string;
  quote: string;
  speakers: string[];
  correctIndex: number;
  /** Reveal text, shown only once the game has finished (E3). */
  explanation?: string;
}

/**
 * Generic fictional pack only. No real family quotes, no invented attributions
 * to real relatives. Speakers below are fictional characters created for the game.
 */
export const WHO_SAID_PACK: WhoSaidQuestion[] = [
  { id: "who-1", quote: "The snow is best when shared with friends.", speakers: ["Mira the Baker", "Tom the Gardener", "Lena the Sailor", "Omar the Teacher"], correctIndex: 0 },
  { id: "who-2", quote: "I always hide the last cookie for myself.", speakers: ["Mira the Baker", "Tom the Gardener", "Lena the Sailor", "Omar the Teacher"], correctIndex: 1 },
  { id: "who-3", quote: "A story is warmer by the fire.", speakers: ["Mira the Baker", "Tom the Gardener", "Lena the Sailor", "Omar the Teacher"], correctIndex: 3 },
  { id: "who-4", quote: "The sea sings best in winter.", speakers: ["Mira the Baker", "Tom the Gardener", "Lena the Sailor", "Omar the Teacher"], correctIndex: 2 },
  { id: "who-5", quote: "Every garden needs a little snow.", speakers: ["Mira the Baker", "Tom the Gardener", "Lena the Sailor", "Omar the Teacher"], correctIndex: 1 },
  { id: "who-6", quote: "Baking is just chemistry with cinnamon.", speakers: ["Mira the Baker", "Tom the Gardener", "Lena the Sailor", "Omar the Teacher"], correctIndex: 0 },
  { id: "who-7", quote: "Teach me one song, and I will sing it all year.", speakers: ["Mira the Baker", "Tom the Gardener", "Lena the Sailor", "Omar the Teacher"], correctIndex: 3 },
  { id: "who-8", quote: "Sailors count stars, not sheep.", speakers: ["Mira the Baker", "Tom the Gardener", "Lena the Sailor", "Omar the Teacher"], correctIndex: 2 },
];

export function scoreWhoSaid(question: WhoSaidQuestion, chosenIndex: number | null): number {
  return chosenIndex === question.correctIndex ? 100 : 0;
}
