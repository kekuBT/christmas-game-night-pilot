/**
 * Sprint 2 Workstream C: guest sessions on a device (apps/web/src/session.ts).
 * Requirement: private by default (tab-only), Remember is an explicit,
 * reversible opt-in that never duplicates the credential, and the app
 * keeps working when the browser refuses storage.
 */
import { describe, expect, it } from "vitest";
import { createSessionStore, MAX_REMEMBERED, type StorageLike } from "../apps/web/src/session.js";

class MemStorage implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  /** Does any stored value contain this text? */
  holds(text: string) { return [...this.m.values()].some((v) => v.includes(text)); }
}
class DeniedStorage implements StorageLike {
  getItem(): string | null { throw new DOMException("denied", "SecurityError"); }
  setItem(): void { throw new DOMException("denied", "SecurityError"); }
  removeItem(): void { throw new DOMException("denied", "SecurityError"); }
}
const seat = (n: number) => ({ roomId: `room-${n}`, playerId: `player-${n}`, token: `tok-${n}-${"x".repeat(20)}`, displayName: `P${n}` });

describe("guest sessions on this device", () => {
  it("16. ordinary guest play: the credential lives only in this tab", () => {
    const tab = new MemStorage(); const device = new MemStorage();
    const s = createSessionStore({ session: tab, local: device });
    s.begin(seat(1), { remember: false });
    expect(s.current()).toMatchObject({ roomId: "room-1", token: seat(1).token, remembered: false });
    expect(tab.holds(seat(1).token)).toBe(true);
    expect(device.holds(seat(1).token)).toBe(false);
    // Same-tab refresh: a new store over the same tab storage resumes.
    expect(createSessionStore({ session: tab, local: device }).current()?.token).toBe(seat(1).token);
  });

  it("17. closing the tab without Remember leaves nothing behind on the device", () => {
    const device = new MemStorage();
    createSessionStore({ session: new MemStorage(), local: device }).begin(seat(1), { remember: false });
    const fresh = createSessionStore({ session: new MemStorage(), local: device }); // new tab
    expect(fresh.current()).toBeNull();
    expect(fresh.remembered()).toEqual([]);
  });

  it("18. with Remember on, the seat survives a closed tab, and the credential is stored once (device only)", () => {
    const tab = new MemStorage(); const device = new MemStorage();
    const s = createSessionStore({ session: tab, local: device });
    s.begin(seat(1), { remember: true });
    expect(tab.holds(seat(1).token)).toBe(false); // not duplicated into the tab
    expect(device.holds(seat(1).token)).toBe(true);
    expect(s.current()).toMatchObject({ token: seat(1).token, remembered: true });
    const fresh = createSessionStore({ session: new MemStorage(), local: device });
    expect(fresh.current()).toBeNull(); // not silently resumed: the app asks "Continue as P1?" after server verification
    expect(fresh.remembered().map((r) => r.displayName)).toEqual(["P1"]);
  });

  it("19. turning Remember off moves the credential back to the tab and erases it from the device", () => {
    const tab = new MemStorage(); const device = new MemStorage();
    const s = createSessionStore({ session: tab, local: device });
    s.begin(seat(1), { remember: true });
    expect(s.setRemember(false)).toBe(false);
    expect(device.holds(seat(1).token)).toBe(false);
    expect(s.current()).toMatchObject({ token: seat(1).token, remembered: false });
    expect(s.setRemember(true)).toBe(true);
    expect(tab.holds(seat(1).token)).toBe(false);
  });

  it("sign out / forget this device removes the credential from both places", () => {
    const tab = new MemStorage(); const device = new MemStorage();
    const s = createSessionStore({ session: tab, local: device });
    s.begin(seat(1), { remember: true });
    s.signOut();
    expect(s.current()).toBeNull();
    expect(tab.holds(seat(1).token) || device.holds(seat(1).token)).toBe(false);
  });

  it("20. storage denied: Remember is unavailable but guest play still works for the page's lifetime", () => {
    const s = createSessionStore({ session: new DeniedStorage(), local: new DeniedStorage() });
    expect(s.canRemember()).toBe(false);
    expect(s.tabStorageOk()).toBe(false);
    s.begin(seat(1), { remember: true }); // asks to remember, cannot: no throw, tab-only in memory
    expect(s.current()).toMatchObject({ token: seat(1).token, remembered: false });
    expect(s.setRemember(true)).toBe(false);
  });

  it("20b. no storage objects at all (window access blocked) behaves the same", () => {
    const s = createSessionStore({ session: null, local: null });
    s.begin(seat(2), { remember: false });
    expect(s.token()).toBe(seat(2).token);
    expect(s.canRemember()).toBe(false);
  });

  it("21. a corrupt remembered list is ignored, not trusted", () => {
    const device = new MemStorage();
    device.setItem("mz_remembered_seats", "{not json");
    expect(createSessionStore({ session: new MemStorage(), local: device }).remembered()).toEqual([]);
    device.setItem("mz_remembered_seats", JSON.stringify([{ roomId: "r", displayName: "no token" }]));
    expect(createSessionStore({ session: new MemStorage(), local: device }).remembered()).toEqual([]);
  });

  it("22. several remembered rooms: most recent first, one entry per room, at most 5", () => {
    const device = new MemStorage();
    const s = createSessionStore({ session: new MemStorage(), local: device });
    for (let i = 1; i <= 7; i++) s.begin(seat(i), { remember: true });
    expect(s.remembered().map((r) => r.roomId)).toEqual(["room-7", "room-6", "room-5", "room-4", "room-3"]);
    expect(s.remembered()).toHaveLength(MAX_REMEMBERED);
    s.begin({ ...seat(5), token: "rotated-token-after-recovery" }, { remember: true });
    expect(s.remembered().filter((r) => r.roomId === "room-5")).toHaveLength(1);
    expect(s.remembered()[0]!.token).toBe("rotated-token-after-recovery");
  });

  it("forgetRemembered drops exactly one seat (used when the server rejects it)", () => {
    const s = createSessionStore({ session: new MemStorage(), local: new MemStorage() });
    s.begin(seat(1), { remember: true });
    s.begin(seat(2), { remember: true });
    s.forgetRemembered("room-1", "player-1");
    expect(s.remembered().map((r) => r.roomId)).toEqual(["room-2"]);
  });
});
