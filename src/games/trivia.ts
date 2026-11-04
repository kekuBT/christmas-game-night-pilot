import { seededRng } from "../shared/protocol.js";

export interface TriviaQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  source: string;
}

const PACK: Omit<TriviaQuestion, "id">[] = [
  { prompt: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], correctIndex: 1, explanation: "Mars appears red due to iron oxide on its surface.", source: "General astronomy" },
  { prompt: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], correctIndex: 1, explanation: "Hexa- means six.", source: "Geometry" },
  { prompt: "What is the capital of Japan?", options: ["Seoul", "Beijing", "Tokyo", "Bangkok"], correctIndex: 2, explanation: "Tokyo has been Japan's capital since 1868.", source: "Geography" },
  { prompt: "Which gas do plants absorb from the air?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correctIndex: 2, explanation: "Plants use carbon dioxide in photosynthesis.", source: "Biology" },
  { prompt: "What is 15 × 4?", options: ["45", "50", "60", "75"], correctIndex: 2, explanation: "15 × 4 = 60.", source: "Arithmetic" },
  { prompt: "Who wrote Romeo and Juliet?", options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"], correctIndex: 1, explanation: "Shakespeare wrote Romeo and Juliet.", source: "Literature" },
  { prompt: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correctIndex: 3, explanation: "The Pacific is the largest ocean.", source: "Geography" },
  { prompt: "How many minutes are in 2 hours?", options: ["60", "90", "120", "180"], correctIndex: 2, explanation: "2 × 60 = 120.", source: "Arithmetic" },
  { prompt: "Which animal is known as man's best friend?", options: ["Cat", "Dog", "Horse", "Parrot"], correctIndex: 1, explanation: "Dogs are commonly called man's best friend.", source: "General knowledge" },
  { prompt: "What colour do you get by mixing blue and yellow paint?", options: ["Purple", "Green", "Orange", "Brown"], correctIndex: 1, explanation: "Blue + yellow = green.", source: "Colour theory" },
  { prompt: "Which month comes after November?", options: ["October", "December", "January", "September"], correctIndex: 1, explanation: "December follows November.", source: "Calendar" },
  { prompt: "What is the boiling point of water at sea level, in Celsius?", options: ["90", "95", "100", "110"], correctIndex: 2, explanation: "Water boils at 100°C at sea level.", source: "Physics" },
];

export function generateTrivia(seed: number, count = 10): TriviaQuestion[] {
  const rng = seededRng(seed);
  const pack = [...PACK];
  for (let i = pack.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pack[i]!;
    pack[i] = pack[j]!;
    pack[j] = tmp;
  }
  return pack.slice(0, count).map((q, i) => {
    // Shuffle options, tracking correct answer
    const options = [...q.options];
    const correctText = options[q.correctIndex]!;
    for (let k = options.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      const tmp = options[k]!;
      options[k] = options[j]!;
      options[j] = tmp;
    }
    return { ...q, id: `trivia-${i + 1}`, options, correctIndex: options.indexOf(correctText) };
  });
}

export function triviaSpeedBonus(elapsedMs: number): number {
  if (elapsedMs <= 15000) return 20; // Coarse bracket, not a ping race
  return 0;
}

export function scoreTrivia(question: TriviaQuestion, chosenIndex: number | null, elapsedMs: number): number {
  if (chosenIndex === null || chosenIndex !== question.correctIndex) return 0;
  return 100 + triviaSpeedBonus(elapsedMs);
}
