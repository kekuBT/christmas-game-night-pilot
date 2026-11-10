/**
 * A random (version 4) UUID for an intent's clientEventId, in every browser
 * context the app runs in.
 *
 * crypto.randomUUID exists only in secure contexts (https, localhost). A
 * phone on the home Wi-Fi opens the server over plain http
 * (http://192.168.x.x:port), where it is missing. The old fallback,
 * `${Date.now()}-${Math.random()}`, is not a UUID, and the server's intent
 * schema (src/shared/protocol.ts: clientEventId z.string().uuid()) refused
 * every action from such a phone: Math never showed its first question.
 * crypto.getRandomValues is available in insecure contexts too, so a proper
 * v4 UUID is built from it there.
 */
export function uuidV4(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); // no Web Crypto at all: still unique enough for an event id
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
