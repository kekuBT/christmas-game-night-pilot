// Types for the pure part of probe-forwarded-origin.mjs (its classifier), for the offline tests.
export interface ProbeEntry { where: "target" | "other"; kind: string; origin: string | null; [extra: string]: unknown }
export type ProbeVerdict = "REWRITTEN_SAME_ORIGIN_ONLY" | "PRESERVED" | "UNSAFE" | "INCONSISTENT" | "UNSUITABLE" | "INCOMPLETE";
export interface ProbeClassification {
  verdict: ProbeVerdict;
  why: string;
  ownOrigin?: string;
  hint: string;
  evidence: { own: Record<string, (string | null)[]>; comparison: Record<string, (string | null)[]>; expectedComparisonOrigin: string; forwardedTargetOrigin: string };
}
export const OWN: Record<string, string>;
export const COMPARISON: Record<string, string>;
/** The only labels an observation may carry (the iframe form posts and the top-level form control). */
export const LABELS: Set<string>;
export function classify(entries: ProbeEntry[], urls: { targetUrl: string; otherUrl: string }): ProbeClassification;
