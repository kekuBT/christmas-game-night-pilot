export type GeographyMode = "flag" | "outline" | "capital" | "region" | "higher-lower" | "distance";

export interface GeographyQuestion {
  id: string;
  mode: GeographyMode;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  /** Stage 5.1 (3F): a text alternative for the prompt's picture (a flag emoji), from the pack's accessibility note. */
  imageAlt?: string;
}

/**
 * Stage 5.1 (3F, O-12): what a screen reader is told instead of a flag
 * emoji. A screen reader may otherwise read the emoji's own name (often the
 * country), giving the answer away; this describes the picture instead and
 * never names any of the options. Order: the pack's own description; the
 * part of the explanation before its final colon ("Red circle on white:
 * Japan" → "Red circle on white"); a plain fallback.
 */
export function flagAlt(q: { mode?: unknown; explanation?: unknown; options?: unknown; imageAlt?: unknown }): string | undefined {
  if (q.mode !== "flag") return undefined;
  const opts = (Array.isArray(q.options) ? q.options : []).map((o) => String(o).toLowerCase());
  const safe = (t: unknown): t is string => typeof t === "string" && t.trim().length > 0 && !opts.some((o) => t.toLowerCase().includes(o));
  if (safe(q.imageAlt)) return q.imageAlt.trim();
  const ex = typeof q.explanation === "string" ? q.explanation : "";
  const before = ex.includes(":") ? ex.slice(0, ex.lastIndexOf(":")).trim() : "";
  if (safe(before)) return before;
  return "A flag (no description available)";
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
