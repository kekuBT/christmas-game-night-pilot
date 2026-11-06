/**
 * Seat recovery support (docs/RECOVERY_CONTRACT.md): brute-force limits and
 * host-assisted recovery requests. The credential rotation itself lives in
 * RoomEngine.rotateCredentials; LocalServer persists it atomically and
 * supersedes old sockets.
 *
 * Host-assisted flow (contract §2), binding the approval to the actual
 * requesting device:
 *   1. A device without a credential asks to recover an EXACT seat (slot
 *      id picked from the room roster). It receives a secret (only it can
 *      collect the result) and a 4-digit match code it shows on screen.
 *   2. The host/cohost sees the request with the same match code, checks
 *      the person in front of them, and approves that exact slot.
 *   3. The requester collects with its secret: only then is the seat's
 *      credential rotated (atomically persisted), so a credential never
 *      waits in memory for someone to pick it up, and the host never sees
 *      it.
 * Requests are single-use, expire after REQUEST_TTL_MS, and live in memory
 * only: a server restart drops them and the requester simply asks again.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";

export const REQUEST_TTL_MS = 10 * 60_000;
export const MAX_PENDING_PER_ROOM = 10;
export const MAX_PENDING_PER_SLOT = 3;

/** Counts failures per key in a sliding window; a key over its limit is blocked until old failures age out. */
export class FailureLimiter {
  private failures = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number, private readonly clock: () => number) {}

  private recent(key: string): number[] {
    const now = this.clock();
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list); else this.failures.delete(key);
    return list;
  }
  /** Milliseconds until this key may try again (0 = allowed now). */
  retryAfterMs(key: string): number {
    const list = this.recent(key);
    if (list.length < this.max) return 0;
    return Math.max(1, list[0]! + this.windowMs - this.clock());
  }
  fail(key: string): void {
    const list = this.recent(key);
    list.push(this.clock());
    this.failures.set(key, list);
  }
  reset(key: string): void { this.failures.delete(key); }
}

export interface RecoveryRequest {
  id: string;
  roomId: string;
  playerId: string;
  secretHash: string;
  matchCode: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "denied";
  decidedBy?: string;
}

const hashSecret = (s: string) => createHash("sha256").update(`mchezo-recovery-request:${s}`).digest("hex");

export class PendingRecoveries {
  private requests = new Map<string, RecoveryRequest>();
  constructor(private readonly clock: () => number) {}

  private prune(): void {
    const now = this.clock();
    for (const [id, r] of this.requests) if (now >= r.expiresAt) this.requests.delete(id);
  }

  /** Create a request; returns the requester's secret once. Throws a human message when limits are hit. */
  create(roomId: string, playerId: string): { request: RecoveryRequest; secret: string } {
    this.prune();
    const inRoom = [...this.requests.values()].filter((r) => r.roomId === roomId && r.status === "pending");
    if (inRoom.length >= MAX_PENDING_PER_ROOM) throw new Error("Too many recovery requests are waiting in this room. Ask the host to clear them, then try again.");
    if (inRoom.filter((r) => r.playerId === playerId).length >= MAX_PENDING_PER_SLOT) throw new Error("Several requests for this seat are already waiting. Ask the host to check them.");
    const secret = randomBytes(32).toString("hex");
    const now = this.clock();
    const request: RecoveryRequest = {
      id: randomBytes(12).toString("hex"),
      roomId,
      playerId,
      secretHash: hashSecret(secret),
      matchCode: String(randomInt(0, 10_000)).padStart(4, "0"),
      createdAt: now,
      expiresAt: now + REQUEST_TTL_MS,
      status: "pending",
    };
    this.requests.set(request.id, request);
    return { request, secret };
  }

  /** The request, only if `secret` is its requester's secret and it has not expired. */
  forRequester(id: string, secret: unknown): RecoveryRequest | null {
    this.prune();
    const r = this.requests.get(id);
    if (!r || typeof secret !== "string" || hashSecret(secret) !== r.secretHash) return null;
    return r;
  }

  forOperator(roomId: string, id: string): RecoveryRequest | null {
    this.prune();
    const r = this.requests.get(id);
    return r && r.roomId === roomId ? r : null;
  }

  pending(roomId: string): RecoveryRequest[] {
    this.prune();
    return [...this.requests.values()].filter((r) => r.roomId === roomId && r.status === "pending");
  }

  /** Remove once used (single-use). */
  consume(id: string): void { this.requests.delete(id); }
}
