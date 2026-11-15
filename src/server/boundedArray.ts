import { z } from "zod";

/** The description on the length check, so a test can tell a checked array from one zod would walk in full. */
export const LENGTH_CHECKED_FIRST = "length checked before any element";

/**
 * Beta R1-R round 3 (review 6903002137; GHSA-mrhx-c7xc-m3w5, which zod 3 has no fix for): an array whose length is
 * checked before zod parses any element.
 *
 * zod 3 parses every element of an array, recording an issue for each bad one, and applies `.max()` only afterwards.
 * So one 64 KiB request body holding 32,000 wrong elements built 32,000 issues: about 14 MB of live heap and 50 to
 * 90 ms of the server's only thread, from any member of any room (docs/evidence/beta-r1-repair-local/round3/).
 *
 * Here an over-long array is refused with one `too_big` issue (zod's own code and message) before any element is
 * read, as zod 4.6.6 does. Anything else (an array within the limit, or a value that isn't an array) is parsed by
 * the same `z.array(element).min(min).max(max)` as before, so what passes and what it parses to are unchanged.
 */
export function boundedArray<T extends z.ZodTypeAny>(element: T, max: number, min?: number) {
  const array = min === undefined ? z.array(element).max(max) : z.array(element).min(min).max(max);
  return z
    .unknown()
    .superRefine((value, ctx) => {
      if (Array.isArray(value) && value.length > max) ctx.addIssue({ code: z.ZodIssueCode.too_big, type: "array", maximum: max, inclusive: true, exact: false, fatal: true });
    })
    .describe(LENGTH_CHECKED_FIRST)
    .pipe(array);
}
