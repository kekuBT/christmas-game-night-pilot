/**
 * Fair starts (handoff 7004097156, M9): the host's Start now confirmation is a snapshot (what the host confirms is the
 * list they were shown; the server refuses a stale one and asks again). Its title and its rows must describe the same
 * snapshot, and it must say plainly when readiness has changed since, instead of mixing a snapshot count with live
 * rows ("3 people aren't ready" over a list where only one still is).
 */
import { describe, expect, it } from "vitest";
import { confirmChanges, confirmTitle, type BriefingPerson } from "../apps/web/src/ui/mchezo/lib/briefing.js";

const person = (id: string, name: string, ready: boolean, presence: BriefingPerson["presence"] = "connected"): BriefingPerson => ({ id, name, ready, presence, you: false });

describe("confirmTitle (the snapshot's own words)", () => {
  it("one or several people not ready", () => {
    expect(confirmTitle([person("a", "Amina", false)])).toBe("Amina isn’t ready. Start anyway?");
    expect(confirmTitle([person("a", "Amina", false), person("b", "Baraka", false), person("c", "Juma", false)])).toBe("3 people aren’t ready. Start anyway?");
  });
  it("a Ready player who isn't connected is not called 'not ready'", () => {
    expect(confirmTitle([person("z", "Zawadi", true, "reconnecting")])).toBe("Zawadi isn’t connected. Start anyway?");
    expect(confirmTitle([person("z", "Zawadi", true, "reconnecting"), person("j", "Juma", true, "away")])).toBe("2 people aren’t connected. Start anyway?");
    expect(confirmTitle([person("z", "Zawadi", true, "reconnecting"), person("j", "Juma", false)])).toBe("2 people aren’t ready or aren’t connected. Start anyway?");
  });
});

describe("confirmChanges (what changed since the snapshot, from the live rows)", () => {
  const snapshot = [person("b", "Baraka", false), person("w", "Wanjiru", false), person("j", "Juma", false)];
  it("nothing changed: nothing to say", () => {
    expect(confirmChanges(snapshot, [...snapshot, person("k", "Keku", true)], ["b", "w", "j"])).toEqual([]);
  });
  it("two of three got ready while the dialog was open (the reported 'dialog 3, list 1' case)", () => {
    const live = [person("b", "Baraka", true), person("w", "Wanjiru", true), person("j", "Juma", false)];
    expect(confirmChanges(snapshot, live, ["j"])).toEqual(["Baraka is ready now", "Wanjiru is ready now"]);
  });
  it("someone withdrew, someone dropped, someone came back", () => {
    const snap = [person("z", "Zawadi", true, "reconnecting"), person("j", "Juma", false)];
    const live = [person("z", "Zawadi", true, "connected"), person("j", "Juma", false, "reconnecting"), person("a", "Amina", false)];
    expect(confirmChanges(snap, live, ["j", "a"])).toEqual(["Zawadi is connected again", "Juma is reconnecting now", "Amina isn’t ready any more"]);
  });
});
