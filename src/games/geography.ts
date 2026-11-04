export type GeographyMode = "flag" | "outline" | "capital" | "region" | "higher-lower" | "distance";

export interface GeographyQuestion {
  id: string;
  mode: GeographyMode;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/**
 * Geography packs — provisional, owner review pending.
 * Flag mode uses country names + flag emoji as a text fallback, not licensed flag images.
 * Outline mode uses a textual outline hint as a fallback, not licensed SVG geometry.
 * Map-tap mode is implemented as the accessible 4-choice region fallback.
 */
export const GEOGRAPHY_PACK: GeographyQuestion[] = [
  { id: "geo-flag-1", mode: "flag", prompt: "Which country does this flag belong to? 🇫🇷", options: ["France", "Italy", "Spain", "Germany"], correctIndex: 0, explanation: "Blue, white, and red vertical stripes: France." },
  { id: "geo-flag-2", mode: "flag", prompt: "Which country does this flag belong to? 🇯🇵", options: ["China", "South Korea", "Japan", "Thailand"], correctIndex: 2, explanation: "Red circle on white: Japan." },
  { id: "geo-capital-1", mode: "capital", prompt: "What is the capital of Canada?", options: ["Toronto", "Vancouver", "Ottawa", "Montreal"], correctIndex: 2, explanation: "Ottawa is Canada's capital." },
  { id: "geo-capital-2", mode: "capital", prompt: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], correctIndex: 2, explanation: "Canberra is Australia's capital." },
  { id: "geo-outline-1", mode: "outline", prompt: "Which boot-shaped country is this outline hint describing?", options: ["Greece", "Italy", "Spain", "Portugal"], correctIndex: 1, explanation: "Italy is famously boot-shaped. Text hint fallback, not SVG geometry." },
  { id: "geo-region-1", mode: "region", prompt: "In which region is Egypt located?", options: ["South America", "North Africa", "Southeast Asia", "Northern Europe"], correctIndex: 1, explanation: "Egypt is in North Africa. Accessible region fallback, not map tap." },
  { id: "geo-higher-1", mode: "higher-lower", prompt: "Which mountain is taller: Mount Everest or Mount Kilimanjaro?", options: ["Mount Everest", "Mount Kilimanjaro", "They are equal", "Neither is a mountain"], correctIndex: 0, explanation: "Everest (~8,849 m) is taller than Kilimanjaro (~5,895 m)." },
  { id: "geo-distance-1", mode: "distance", prompt: "Which city is closest to Paris: London, Berlin, Madrid, or Rome?", options: ["London", "Berlin", "Madrid", "Rome"], correctIndex: 0, explanation: "Paris–London is the shortest of these great-circle distances." },
];

export function scoreGeography(question: GeographyQuestion, chosenIndex: number | null): number {
  return chosenIndex === question.correctIndex ? 100 : 0;
}
