export interface YearEvent {
  id: string;
  event: string;
  year: number;
  context: string;
  source: string;
}

export const YEAR_EVENTS: YearEvent[] = [
  { id: "year-1", event: "The first Moon landing", year: 1969, context: "Apollo 11 landed on the Moon.", source: "NASA history" },
  { id: "year-2", event: "The first iPhone was released", year: 2007, context: "Apple released the first iPhone in June 2007.", source: "Apple history" },
  { id: "year-3", event: "The Berlin Wall fell", year: 1989, context: "The Berlin Wall fell in November 1989.", source: "Modern history" },
  { id: "year-4", event: "The first modern Olympic Games", year: 1896, context: "Athens hosted the first modern Olympics.", source: "Olympic history" },
  { id: "year-5", event: "Humans first flew a powered airplane (Wright brothers)", year: 1903, context: "The Wright Flyer flew at Kitty Hawk.", source: "Aviation history" },
  { id: "year-6", event: "The World Wide Web became publicly available", year: 1991, context: "The Web opened to the public in 1991.", source: "Web history" },
  { id: "year-7", event: "The Titanic sank", year: 1912, context: "Titanic sank in April 1912.", source: "Maritime history" },
  { id: "year-8", event: "The first Star Wars film was released", year: 1977, context: "Star Wars premiered in 1977.", source: "Film history" },
];

/** Proposed scoring: max(0, 100 - 10 * |guess - year|). Exact 100, 1 off 90, 10+ off 0. */
export function scoreYear(event: YearEvent, guess: number | null): number {
  if (guess === null || !Number.isInteger(guess)) return 0;
  return Math.max(0, 100 - 10 * Math.abs(guess - event.year));
}
