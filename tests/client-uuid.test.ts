/**
 * An intent's clientEventId must pass the server's own schema in every
 * browser context: a phone on the home Wi-Fi opens the app over plain http,
 * where crypto.randomUUID is missing (secure contexts only). Before the fix
 * the app sent `${Date.now()}-${Math.random()}` there, and the server refused
 * every action (INVALID_INTENT): Math never showed its first question.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { uuidV4 } from "../apps/web/src/uuid.js";
import { IntentSchema } from "../src/shared/protocol.js";

const asIntent = (clientEventId: string) => IntentSchema.safeParse({ kind: "intent", schemaVersion: 1, clientEventId, roomId: "r", gameInstanceId: "g", action: "submit-math-answer", payload: {} });
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("clientEventId on every kind of connection", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("the old plain-http fallback was refused by the server's schema (the defect)", () => {
    expect(asIntent(`${Date.now()}-${Math.random()}`).success).toBe(false);
  });

  it("https or localhost: crypto.randomUUID is used", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555", getRandomValues: () => { throw new Error("not used"); } });
    expect(uuidV4()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("plain http (no randomUUID, getRandomValues only): a v4 UUID the server accepts, never repeated", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (b: Uint8Array) => real.getRandomValues(b) });
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const id = uuidV4();
      expect(id).toMatch(V4);
      expect(asIntent(id).success).toBe(true);
      seen.add(id);
    }
    expect(seen.size).toBe(2000);
  });

  it("no Web Crypto at all: still a v4 UUID the server accepts", () => {
    vi.stubGlobal("crypto", undefined);
    const id = uuidV4();
    expect(id).toMatch(V4);
    expect(asIntent(id).success).toBe(true);
  });
});
