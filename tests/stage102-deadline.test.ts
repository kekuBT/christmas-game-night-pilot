// Stage 10.2 repair (review 6831760093, S102-R2; D-S102-07): check-jebena-rush's short-reconnect checks wait against
// an absolute deadline (scripts/lib/deadline.mjs). The reviewer's run had a "6-second" poll whose probe, a locator
// waiting for an element that was gone, blocked for 30 s. These pin what the helper promises: no probe outlives the
// deadline, a late or missing observation is a FAIL through the driver's own reporter, and nothing is retried after.
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs driver helper, no type declarations
import { soonUntil } from "../scripts/lib/deadline.mjs";

type Report = { label: string; ok: boolean; detail: string };
function reporter() {
  const log: Report[] = [];
  return { log, check: (label: string, ok: boolean, detail = "") => { log.push({ label, ok, detail }); } };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("soonUntil: an observation against an absolute deadline", () => {
  it("a probe that never settles (the reviewer's 30-second locator) fails at the deadline, not after it", async () => {
    const r = reporter();
    const t0 = Date.now();
    const v = await soonUntil(r.check, "resync", () => new Promise(() => {}), Date.now() + 400);
    const took = Date.now() - t0;
    expect(v).toBeNull();
    expect(took).toBeLessThan(700);
    expect(r.log).toEqual([{ label: "resync", ok: false, detail: "not by the deadline (the probe was still running at the deadline)" }]);
  });

  it("an observation that only comes after the window is a FAIL, never a late pass", async () => {
    const r = reporter();
    const t0 = Date.now();
    const v = await soonUntil(r.check, "inside 3 s", async () => (Date.now() - t0 > 600 ? "seen" : null), Date.now() + 300);
    expect(v).toBeNull();
    expect(r.log.map((x) => x.ok)).toEqual([false]);
    await sleep(400); // and nothing reports later, once the deadline has passed
    expect(r.log).toHaveLength(1);
  });

  it("an observation inside the window passes once and returns its value", async () => {
    const r = reporter();
    const t0 = Date.now();
    const v = await soonUntil(r.check, "seen", async () => (Date.now() - t0 > 120 ? Date.now() : null), Date.now() + 1000);
    expect(typeof v).toBe("number");
    expect(r.log).toEqual([{ label: "seen", ok: true, detail: "" }]);
  });

  it("a probe that keeps throwing is a FAIL that names its error", async () => {
    const r = reporter();
    const v = await soonUntil(r.check, "row", async () => { throw new Error("jr-my-hearts is not on this screen\nstack"); }, Date.now() + 250);
    expect(v).toBeNull();
    expect(r.log).toEqual([{ label: "row", ok: false, detail: "not by the deadline (jr-my-hearts is not on this screen)" }]);
  });

  it("a deadline already past runs no probe and fails", async () => {
    const r = reporter();
    let probes = 0;
    const v = await soonUntil(r.check, "too late", async () => { probes++; return true; }, Date.now() - 1);
    expect(v).toBeNull();
    expect(probes).toBe(0);
    expect(r.log.map((x) => x.ok)).toEqual([false]);
  });
});
