/**
 * Client/server protocol version (Sprint 3). Shared by the server and the
 * web bundle (no Node imports here).
 *
 * Clients send it with every request (header) and WebSocket (URL param).
 * The server publishes the minimum it accepts in every projection; a client
 * older than that shows "This app was updated — refresh" instead of
 * silently playing by older rules.
 *
 * 3 = Sprint 3: Math prompts are revealed per question (`math-open`),
 *     phased actions carry `phaseKey`, countdowns use `serverNow`.
 * A request with no version comes from a tab loaded before Sprint 3.
 */
export const CLIENT_PROTOCOL = 3;
export const MIN_CLIENT_PROTOCOL = 3;
export const PROTOCOL_HEADER = "x-mchezo-protocol";
export const PROTOCOL_PARAM = "protocol";

/** Parse a version sent by a client; undefined (or junk) means a pre-Sprint 3 client. */
export function parseClientProtocol(raw: unknown): number | undefined {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : undefined;
}

/** Should this client ask its user to refresh? */
export function clientNeedsRefresh(minRequired: number | undefined, mine = CLIENT_PROTOCOL): boolean {
  return typeof minRequired === "number" && mine < minRequired;
}
