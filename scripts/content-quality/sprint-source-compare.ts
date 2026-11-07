/**
 * Category Sprint closed sets: compare a membership list with what its source
 * publishes (owner direction 2026-11-07: "a reproducible source-comparison
 * report showing exact membership, spelling differences, aliases, omissions
 * and questionable entries"). Pure functions; the fetching lives in
 * sprint-sources.ts and the published lists are committed as snapshots in
 * docs/content-quality-2/sprint-sources/.
 *
 * This is a MACHINE comparison. It is evidence for the human source check
 * (`sourceCheck` on the reference), never a substitute for it.
 */
import { normalizeSprintAnswerV2 as norm } from "../../src/games/sprint.js";

/** One fetched page (or file) that a snapshot was extracted from. */
export interface SnapshotPage { url: string; sha256: string; bytes: number; via: "http" | "browser" | "pdf" }

/** What a source publishes, as extracted on one date. Committed; the report is rebuilt from these. */
export interface SourceSnapshot {
  id: string;
  authority: string;
  fetchedAt: string;
  pages: SnapshotPage[];
  /** How the names were picked out of the pages, in words a reviewer can repeat by hand. */
  extraction: string;
  /** Names exactly as the source writes them (whitespace collapsed, nothing else changed). */
  published: string[];
  /** Entries the source lists that the extraction deliberately left out, with why. */
  excluded?: { name: string; why: string }[];
}

/** A documented editorial crosswalk: the source's name for a member differs from ours in more than spelling. */
export interface Crosswalk { source: string; member: string; reason: string }

export type MemberMatch =
  | { kind: "exact"; source: string; member: string }
  | { kind: "spelling"; source: string; member: string } // same canonical answer, written differently
  | { kind: "alias"; source: string; member: string; alias: string } // source name is one of the item's aliases
  | { kind: "crosswalk"; source: string; member: string; reason: string };

export interface Comparison {
  id: string;
  publishedCount: number;
  referenceCount: number;
  declaredCount: number;
  matches: MemberMatch[];
  /** In the source, missing from our list. */
  omissions: string[];
  /** In our list, not in the source. */
  extras: string[];
  /** Two source names that land on one of our members (or one canonical answer). */
  collisions: string[];
  verdict: "matches source" | "differs from source";
}

export interface CompareInput {
  snapshot: SourceSnapshot;
  members: string[];
  declaredCount: number;
  aliases?: Record<string, { to: string }>;
  crosswalk?: Crosswalk[];
}

export function compareMembership({ snapshot, members, declaredCount, aliases = {}, crosswalk = [] }: CompareInput): Comparison {
  const byCanon = new Map(members.map((m) => [norm(m), m]));
  const used = new Map<string, string>(); // member -> source name that matched it
  const matches: MemberMatch[] = [];
  const omissions: string[] = [];
  const collisions: string[] = [];
  const take = (member: string, source: string) => {
    const prior = used.get(member);
    if (prior !== undefined) collisions.push(`"${source}" and "${prior}" both match "${member}"`);
    used.set(member, source);
  };
  for (const source of snapshot.published) {
    if (members.includes(source)) { matches.push({ kind: "exact", source, member: source }); take(source, source); continue; }
    const c = norm(source);
    const same = byCanon.get(c);
    if (same) { matches.push({ kind: "spelling", source, member: same }); take(same, source); continue; }
    const al = aliases[c];
    const viaAlias = al ? members.find((m) => norm(m) === al.to) : undefined;
    if (al && viaAlias) { matches.push({ kind: "alias", source, member: viaAlias, alias: c }); take(viaAlias, source); continue; }
    const cw = crosswalk.find((x) => x.source === source);
    if (cw && members.includes(cw.member)) { matches.push({ kind: "crosswalk", source, member: cw.member, reason: cw.reason }); take(cw.member, source); continue; }
    omissions.push(source);
  }
  const extras = members.filter((m) => !used.has(m));
  const ok = omissions.length === 0 && extras.length === 0 && collisions.length === 0
    && snapshot.published.length === members.length && members.length === declaredCount;
  return {
    id: snapshot.id, publishedCount: snapshot.published.length, referenceCount: members.length, declaredCount,
    matches, omissions, extras, collisions, verdict: ok ? "matches source" : "differs from source",
  };
}
