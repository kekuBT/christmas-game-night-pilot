import { describe, expect, it } from "vitest";
import { wsReconnectDelayMs } from "../apps/web/src/components/wsBackoff.js";

// Backoff policy for the browser client's WebSocket auto-reconnect:
// exponential from 1s, capped at 10s so a long outage never becomes a
// tight reconnect loop. 1008 (auth/room) closes are not retried at all —
// that rule lives in App.tsx, where the close code is visible.
describe("wsReconnectDelayMs", () => {
  it("starts at 1s and doubles", () => {
    expect(wsReconnectDelayMs(1)).toBe(1000);
    expect(wsReconnectDelayMs(2)).toBe(2000);
    expect(wsReconnectDelayMs(3)).toBe(4000);
    expect(wsReconnectDelayMs(4)).toBe(8000);
  });
  it("caps at 10s for later attempts", () => {
    expect(wsReconnectDelayMs(5)).toBe(10000);
    expect(wsReconnectDelayMs(6)).toBe(10000);
    expect(wsReconnectDelayMs(100)).toBe(10000);
  });
  it("treats attempt 0 and negatives as the first attempt", () => {
    expect(wsReconnectDelayMs(0)).toBe(1000);
    expect(wsReconnectDelayMs(-3)).toBe(1000);
  });
});
