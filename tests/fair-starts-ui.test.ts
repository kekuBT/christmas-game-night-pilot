/**
 * Fair starts (handoff 7004097156, M9): the host's Start now confirmation is a snapshot (what the host confirms is the
 * list they were shown; the server refuses a stale one and asks again). Its title and its rows must describe the same
 * snapshot, and it must say plainly when readiness has changed since, instead of mixing a snapshot count with live
 * rows ("3 people aren't ready" over a list where only one still is).
 */
import { describe, expect, it } from "vitest";
import { confirmChanges, confirmTitle, confirmWhen, liveCaughtUp, needsConfirmation, parseNeedStatus, refusalSnapshot, tapSnapshot, type BriefingPerson } from "../apps/web/src/ui/mchezo/lib/briefing.js";

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

/**
 * Review 7007413347: the server asked again while the host's projection had moved on. The host confirmed Baraka; Amina
 * withdrew while that request was in flight; the host applied the withdrawal projection; then READINESS_CHANGED named
 * Amina and Baraka. The replacement dialog was built from the rows captured at the tap (Amina: ready), so its title
 * said "2 people aren't ready or aren't connected", its row said "Amina: ready" and "Since then" said she had withdrawn.
 */
describe("the refreshed confirmation after the server asks again (review 7007413347)", () => {
  const keku = { ...person("k", "Keku", false), you: true };
  const atTap = [keku, person("a", "Amina", true), person("b", "Baraka", false)];
  const afterWithdrawal = [keku, person("a", "Amina", false), person("b", "Baraka", false)];
  const facts = [{ id: "a", ready: false, presence: "connected" as const }, { id: "b", ready: false, presence: "connected" as const }];
  const rowsText = (rows: BriefingPerson[]) => rows.map((p) => `${p.name}: ${p.ready ? "ready" : "not ready yet"}`);

  it("the tap snapshot is the live rows the host sees, already current", () => {
    const tap = tapSnapshot(atTap, "k", 7);
    expect(tap).toMatchObject({ ids: ["b"], source: "tap", rev: 7, caughtUp: true });
    expect(confirmWhen(tap)).toBe("When you tapped Start now:");
  });

  it("rows, title and the server's ids come from the refusal's facts, not the rows captured at the tap", () => {
    // The old code built this from `atTap`: the regression is the old rows sneaking back in.
    const snap = refusalSnapshot(["a", "b"], facts, atTap, { rev: 9, again: true });
    expect(snap.ids).toEqual(["a", "b"]);
    expect(rowsText(snap.rows)).toEqual(["Amina: not ready yet", "Baraka: not ready yet"]);
    expect(confirmTitle(snap.rows)).toBe("2 people aren’t ready. Start anyway?");
    expect(confirmWhen(snap)).toBe("When you confirmed, the game checked again:");
    expect(snap.caughtUp).toBe(false);
  });

  it("the server's list is kept as sent, even if the client's own rule would say otherwise", () => {
    const snap = refusalSnapshot(["b", "a"], facts, afterWithdrawal, { rev: 9, again: true });
    expect(snap.ids).toEqual(["b", "a"]);
    expect(needsConfirmation(afterWithdrawal, "k").map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("'Since then' stays quiet until the live rows are as new as the refusal, then lists only real changes", () => {
    const snap = refusalSnapshot(["a", "b"], facts, afterWithdrawal, { rev: 9, again: true });
    // An older projection (rev 8, Amina still ready): not caught up, so its difference is no change at all.
    expect(liveCaughtUp(snap, atTap, 8)).toBe(false);
    // The projection broadcast with the refusal (rev 9): caught up, and it agrees.
    expect(liveCaughtUp(snap, afterWithdrawal, 9)).toBe(true);
    expect(confirmChanges(snap.rows, afterWithdrawal, ["a", "b"])).toEqual([]);
    // Later, Amina taps Ready again: a real change, listed.
    const later = [keku, person("a", "Amina", true), person("b", "Baraka", false)];
    expect(liveCaughtUp({ ...snap, caughtUp: true }, later, 10)).toBe(true);
    expect(confirmChanges(snap.rows, later, ["b"])).toEqual(["Amina is ready now"]);
  });

  it("without revisions, the live rows catch up once they agree with the snapshot (and stay caught up)", () => {
    const snap = refusalSnapshot(["a", "b"], facts, atTap, { again: true });
    expect(liveCaughtUp(snap, atTap, undefined)).toBe(false);
    expect(liveCaughtUp(snap, afterWithdrawal, undefined)).toBe(true);
    expect(liveCaughtUp({ ...snap, caughtUp: true }, atTap, undefined)).toBe(true);
  });

  it("a server that sends no facts: the latest applied projection, and a title that claims no reason a row doesn't show", () => {
    const fromLatest = refusalSnapshot(["a", "b"], undefined, afterWithdrawal, { again: true });
    expect(rowsText(fromLatest.rows)).toEqual(["Amina: not ready yet", "Baraka: not ready yet"]);
    expect(confirmTitle(fromLatest.rows)).toBe("2 people aren’t ready. Start anyway?");
    // If even the latest projection hasn't caught up, Amina's row says ready: the title doesn't call her not ready or not connected.
    const behind = refusalSnapshot(["a", "b"], undefined, atTap, { again: true });
    expect(confirmTitle(behind.rows)).toBe("The game asked again about 2 people. Start anyway?");
    expect(confirmTitle(behind.rows.slice(0, 1))).toBe("The game asked again about Amina. Start anyway?");
  });

  it("asked at the first tap (nobody needed confirming on the phone): its own label, no 'again'", () => {
    const snap = refusalSnapshot(["a"], [facts[0]!], afterWithdrawal, { rev: 9, again: false });
    expect(confirmWhen(snap)).toBe("When you tapped Start now, the game checked:");
  });

  it("parseNeedStatus keeps only well-formed facts; none at all is undefined", () => {
    expect(parseNeedStatus(undefined)).toBeUndefined();
    expect(parseNeedStatus("x")).toBeUndefined();
    expect(parseNeedStatus([{ id: "a", ready: false, presence: "away" }, { id: "b", ready: "yes", presence: "away" }, { id: "c", ready: true, presence: "gone" }, null])).toEqual([{ id: "a", ready: false, presence: "away" }]);
  });
});
