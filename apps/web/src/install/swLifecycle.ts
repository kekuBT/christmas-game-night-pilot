/**
 * Stage 8.3, repair R83-01 (docs/stage8/stage83.md §3.3, §7.6): who owns
 * which cache, from install to activation. Used by the worker (sw.ts) with
 * the browser's Cache Storage, and by the unit tests with a recording fake.
 *
 * - An installing worker writes ONLY into a candidate cache of its own
 *   (`mchezo-stage-<build>-<install>`), made fresh for that install. If any
 *   file fails (missing, redirected, wrong type, storage full), it deletes
 *   that candidate and nothing else. The active worker's cache is never
 *   opened, written or deleted by an install, whatever the two builds are,
 *   even if (impossibly, by the build identity in swBuild.ts) they shared a
 *   version.
 * - A worker activates only once no page of the previous generation is open
 *   (no skipWaiting, no claim). Only then is anything of the previous
 *   generation touched: its obsolete caches are deleted, and a complete
 *   candidate of this build becomes the live cache `mchezo-shell-<build>`.
 * - If that promotion fails (storage full), the candidate stays, and the
 *   worker serves from it: still this build's validated files, nothing mixed.
 */
import { isObsoleteCache, liveCacheName, stageCachePrefix } from "./swPolicy.js";

type Key = string | { url: string };
/** The parts of a Cache this file uses. */
export interface CacheLike {
  put(key: Key, res: Response): Promise<void>;
  match(key: Key): Promise<Response | undefined>;
  keys(): Promise<ReadonlyArray<{ url: string }>>;
}
/** The parts of Cache Storage this file uses. */
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
  has(name: string): Promise<boolean>;
  keys(): Promise<string[]>;
  match(key: string, options: { cacheName: string }): Promise<Response | undefined>;
}

const pathOf = (url: string) => new URL(url, "http://mchezo.invalid").pathname;

/** A name for this install's candidate that no cache has yet. */
async function freshCandidate(cs: CacheStorageLike, version: string, nonce: () => string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const name = stageCachePrefix(version) + nonce();
    if (!(await cs.has(name))) return name;
  }
  throw new Error("mchezo: no unused candidate cache name");
}

/**
 * Install: fetch and validate every precache file into a new candidate cache
 * of this install's own. All or nothing: on any failure the candidate is
 * deleted and the error rethrown (the browser then discards this worker).
 * Returns the candidate's name.
 */
export async function installCandidate(
  cs: CacheStorageLike,
  version: string,
  precache: readonly string[],
  fetchValidated: (url: string) => Promise<Response>,
  nonce: () => string,
): Promise<string> {
  const name = await freshCandidate(cs, version, nonce);
  try {
    const candidate = await cs.open(name);
    for (const url of precache) await candidate.put(url, await fetchValidated(url));
    return name;
  } catch (e) {
    await cs.delete(name).catch(() => false);
    throw e;
  }
}

/**
 * Activate (no page of the previous generation is open): delete obsolete
 * caches of other builds, then make a complete candidate of this build its
 * live cache, then delete this build's candidates. If the promotion fails,
 * it throws and the candidates stay, for matchOwn() to serve from.
 */
export async function activateGeneration(
  cs: CacheStorageLike,
  version: string,
  precache: readonly string[],
  { installing }: { installing: boolean },
): Promise<void> {
  const names = await cs.keys();
  for (const n of names) if (isObsoleteCache(n, version, installing)) await cs.delete(n);
  const own = names.filter((n) => n.startsWith(stageCachePrefix(version)));
  for (const n of own) {
    const candidate = await cs.open(n);
    const keys = await candidate.keys();
    const have = new Set(keys.map((k) => pathOf(k.url)));
    if (!precache.every((p) => have.has(p))) continue; // incomplete (an install cut short): never promoted
    // A cache already under this build's live name can only belong to a generation with no open page now.
    await cs.delete(liveCacheName(version));
    const live = await cs.open(liveCacheName(version));
    for (const k of keys) {
      const res = await candidate.match(k);
      if (res) await live.put(k, res);
    }
    break;
  }
  for (const n of own) await cs.delete(n);
}

/** One of this build's files from this build's own caches: the live cache, else its candidates. Creates nothing. */
export async function matchOwn(cs: CacheStorageLike, version: string, path: string): Promise<Response | undefined> {
  const hit = await cs.match(path, { cacheName: liveCacheName(version) });
  if (hit) return hit;
  for (const n of (await cs.keys()).filter((c) => c.startsWith(stageCachePrefix(version)))) {
    const h = await cs.match(path, { cacheName: n });
    if (h) return h;
  }
  return undefined;
}
