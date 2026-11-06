import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/** Schema version for every intent/event envelope. Bump only with a migration. */
export const SCHEMA_VERSION = 1;

export const IntentSchema = z.object({
  kind: z.literal("intent"),
  schemaVersion: z.literal(SCHEMA_VERSION),
  clientEventId: z.string().uuid(),
  roomId: z.string().min(1).max(64),
  gameInstanceId: z.string().min(1).max(64).nullable(),
  action: z.string().min(1).max(64),
  payload: z.record(z.unknown()).default({}),
});

export type Intent = z.infer<typeof IntentSchema>;

export const PlayerSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(32),
  avatar: z.string().max(32).default("🎄"),
  isHost: z.boolean().default(false),
  isCohost: z.boolean().default(false),
  connected: z.boolean().default(true),
  joinedAt: z.number().int(),
});

export type Player = z.infer<typeof PlayerSchema>;

/** Escape user text for safe HTML rendering. Never render raw captions. */
export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Cap and trim user text. Returns null if the result is empty. */
export function sanitizeText(input: unknown, maxLength = 140): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

/** 6-character join code, excluding ambiguous 0/O/1/I. Not a security credential. */
export function createJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

/**
 * One-time seat recovery code (docs/RECOVERY_CONTRACT.md §1.3): 20
 * characters from the contract's 32-character alphabet (no 0/O, no 1/I),
 * i.e. 100 bits from the CSPRNG, shown as XXXXX-XXXXX-XXXXX-XXXXX.
 * 256 is a multiple of 32, so `byte % 32` is unbiased. (The contract's
 * prose also says "no L", but its listed 32-character alphabet includes
 * L; the listed alphabet is used, since dropping L would leave 31 symbols
 * and a biased mapping.)
 */
export const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const RECOVERY_CODE_LENGTH = 20;
export function createRecoveryCode(): string {
  const raw = [...randomBytes(RECOVERY_CODE_LENGTH)].map((b) => RECOVERY_ALPHABET[b % 32]).join("");
  return raw.match(/.{5}/g)!.join("-");
}
/** Case-insensitive; spaces and dashes ignored. Returns null if it cannot be a code. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const n = input.toUpperCase().replace(/[\s-]/g, "");
  if (n.length !== RECOVERY_CODE_LENGTH) return null;
  for (const ch of n) if (!RECOVERY_ALPHABET.includes(ch)) return null;
  return n;
}
export function hashRecoveryCode(normalized: string): string {
  return createHash("sha256").update(`mchezo-recovery:${normalized}`).digest("hex");
}

/** Opaque recovery token. Only the hash is stored server-side. */
export function createRecoveryToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Deduplication key for exactly-once effects. */
export function dedupeKey(roomId: string, actorId: string, clientEventId: string): string {
  return `${roomId}:${actorId}:${clientEventId}`;
}

/** Deterministic seeded RNG (mulberry32) for tests and seeded content. Not for secrets. Moved to ./rng.ts so web code can use it without node:crypto; re-exported here so existing callers keep working. */
export { seededRng } from "./rng.js";
