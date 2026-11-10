// Stage 5.2: the gate's scheduler model and time estimates (scripts/lib/gate-plan.mjs)
// and its timing history (scripts/lib/gate-timings.mjs).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs gate helper, no type declarations
import { autoWorkers, confidenceOf, contentionFor, currentRegime, estimateMakespan, estimateStep, fmtDur, fmtRange, median, orderSteps, percentile, remainingOf, simulate } from "../scripts/lib/gate-plan.mjs";
// @ts-expect-error -- plain .mjs gate helper, no type declarations
import { buildBaseline, contentionRatio, historyRecord, loadTimings } from "../scripts/lib/gate-timings.mjs";

type Est = { mid: number; low: number; high: number; n: number; source: string };
const est = (mid: number, source = "measured"): Est => ({ mid, low: mid * 0.9, high: mid * 1.2, n: 5, source });
const exact = (mid: number): Est => ({ mid, low: mid, high: mid, n: 5, source: "measured" });

describe("percentiles and per-step estimates", () => {
  it("interpolates percentiles", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10], 0.9)).toBe(10);
    expect(median([5, 1, 3])).toBe(3);
  });
  it("labels how much history a step has, and never invents precision", () => {
    expect(estimateStep([], 60)).toMatchObject({ mid: 60, n: 0, source: "none" });
    const few = estimateStep([100, 120]);
    expect(few).toMatchObject({ mid: 110, n: 2, source: "few" });
    expect(few.low).toBeLessThan(few.mid);
    expect(few.high).toBeGreaterThan(few.mid);
    const many = estimateStep([100, 101, 99, 140, 98, 100]);
    expect(many.source).toBe("measured");
    expect(many.mid).toBeCloseTo(100, 0);
    expect(many.low).toBeLessThanOrEqual(many.mid);
    expect(many.high).toBeGreaterThanOrEqual(many.mid);
  });
  it("follows a step that changed: two new samples far from the old ones replace them", () => {
    // newest first: a driver went from ~1,070 s to ~400 s
    expect(currentRegime([405, 398, 1073, 1056, 1100, 1020])).toEqual([405, 398]);
    expect(estimateStep([405, 398, 1073, 1056, 1100, 1020]).source).toBe("few"); // honest: few samples since the change
    // one outlier run never resets a step
    expect(currentRegime([400, 1073, 1056, 1100, 1020])).toEqual([400, 1073, 1056, 1100, 1020]);
    // ordinary spread is kept
    expect(currentRegime([110, 95, 100, 104, 98])).toEqual([110, 95, 100, 104, 98]);
  });
  it("ignores samples that are not durations", () => {
    expect(estimateStep([Number.NaN, -1, 50]).n).toBe(1);
  });
});

describe("contention factor", () => {
  it("is 1 for one worker, measured when runs exist, modeled (and wide) otherwise", () => {
    expect(contentionFor(1).mid).toBe(1);
    const m = contentionFor(3, { "3": [1.1, 1.2, 1.15] });
    expect(m).toMatchObject({ source: "measured", n: 3 });
    expect(m.mid).toBeCloseTo(1.15, 5);
    const g = contentionFor(2, {});
    expect(g.source).toBe("modeled");
    // Measured per worker count AND CPU count: 3 workers on 4 CPUs says nothing about 2 CPUs.
    expect(contentionFor(3, { "3@4": [1.02] }, 4)).toMatchObject({ source: "measured", mid: 1.02 });
    expect(contentionFor(3, { "3@4": [1.02] }, 2).source).toBe("modeled");
    expect(g.high - g.low).toBeGreaterThan(0.2);
  });
});

describe("queue order", () => {
  const steps = [
    { name: "b-short", est: exact(10) },
    { name: "a-long", est: exact(100) },
    { name: "c-mid", est: exact(50) },
    { name: "z-exclusive", est: exact(5), exclusive: true },
    { name: "a-tie", est: exact(50) },
  ];
  it("sequential mode keeps the given (old gate) order", () => {
    expect(orderSteps(steps, { parallel: false }).map((s: { name: string }) => s.name)).toEqual(["b-short", "a-long", "c-mid", "z-exclusive", "a-tie"]);
  });
  it("parallel mode: exclusive steps first, then longest first, ties by name", () => {
    expect(orderSteps(steps, { parallel: true }).map((s: { name: string }) => s.name)).toEqual(["z-exclusive", "a-long", "a-tie", "c-mid", "b-short"]);
  });
});

describe("simulate: the runner's policy (strict order, start when capacity is free)", () => {
  it("one worker is the plain sum", () => {
    expect(simulate([{ name: "a", dur: 10 }, { name: "b", dur: 20 }], 1).makespan).toBe(30);
  });
  it("two workers, longest first", () => {
    const r = simulate([10, 8, 6, 4].map((d, i) => ({ name: `s${i}`, dur: d })), 2);
    expect(r.makespan).toBe(14);
    expect(r.starts).toEqual({ s0: 0, s1: 0, s2: 8, s3: 10 });
  });
  it("an exclusive step (weight = capacity) waits for the pool to drain and runs alone", () => {
    const r = simulate([{ name: "a", dur: 10 }, { name: "x", dur: 5, weight: 3 }, { name: "b", dur: 1 }], 3);
    expect(r.starts.x).toBe(10);
    expect(r.starts.b).toBe(15); // strict order: nothing jumps ahead of the exclusive step
    expect(r.makespan).toBe(16);
  });
  it("accounts for steps already running", () => {
    const r = simulate([{ name: "q", dur: 10 }], 1, [{ name: "r", remaining: 30, weight: 1 }]);
    expect(r.starts.q).toBe(30);
    expect(r.makespan).toBe(40);
  });
  it("never lets one long step finish later than its own duration allows", () => {
    const r = simulate([{ name: "long", dur: 1000 }, ...Array.from({ length: 20 }, (_, i) => ({ name: `s${i}`, dur: 30 }))], 3);
    expect(r.makespan).toBe(1000);
  });
});

describe("makespan ranges and confidence", () => {
  const queue = [
    { name: "a", est: est(100), weight: 1 },
    { name: "b", est: est(60), weight: 1 },
    { name: "c", est: est(30), weight: 1 },
  ];
  it("orders low <= mid <= high and scales with contention", () => {
    const e1 = estimateMakespan(queue, 2, contentionFor(1));
    expect(e1.low).toBeLessThanOrEqual(e1.mid);
    expect(e1.mid).toBeLessThanOrEqual(e1.high);
    const slow = estimateMakespan(queue, 2, { mid: 1.5, low: 1.5, high: 1.5 });
    expect(slow.mid).toBeCloseTo(e1.mid * 1.5, 5);
  });
  it("an overrunning step still has time left", () => {
    expect(remainingOf({ est: exact(100), elapsed: 50 }, "mid", 1)).toBe(50);
    expect(remainingOf({ est: exact(100), elapsed: 300 }, "mid", 1)).toBe(45); // 15% of 300
    expect(remainingOf({ est: exact(10), elapsed: 20 }, "mid", 1)).toBe(15);
  });
  it("says low-confidence when steps lack history, modeled when only contention is guessed", () => {
    expect(confidenceOf([{ name: "x", est: { ...exact(1), source: "none" } }], contentionFor(1)).label).toBe("low-confidence");
    expect(confidenceOf([{ name: "x", est: exact(1) }], contentionFor(2, {})).label).toBe("modeled");
    expect(confidenceOf([{ name: "x", est: exact(1) }], contentionFor(2, { "2": [1.1] })).label).toBe("measured");
    expect(confidenceOf([{ name: "x", est: exact(1) }], contentionFor(1)).label).toBe("measured");
  });
});

describe("automatic worker count", () => {
  it("uses both CPUs of a 2-CPU machine, keeps one free above that, needs memory per worker, caps at 3", () => {
    expect(autoWorkers({ cpus: 4, memAvailMB: 14000 })).toBe(3);
    expect(autoWorkers({ cpus: 2, memAvailMB: 7000 })).toBe(2); // measured safe on 2 CPUs (README §8)
    expect(autoWorkers({ cpus: 3, memAvailMB: 7000 })).toBe(2);
    expect(autoWorkers({ cpus: 1, memAvailMB: 64000 })).toBe(1);
    expect(autoWorkers({ cpus: 16, memAvailMB: 64000 })).toBe(3);
    expect(autoWorkers({ cpus: 8, memAvailMB: 3200 })).toBe(2);
  });
});

describe("formatting", () => {
  it("formats durations and ranges without false precision", () => {
    expect(fmtDur(45)).toBe("45s");
    expect(fmtDur(860)).toBe("14m 20s");
    expect(fmtDur(3725)).toBe("1h 02m");
    expect(fmtRange(720, 1080)).toBe("12–18m");
    expect(fmtRange(30, 70)).toBe("30–70s");
    expect(fmtRange(600, 610)).toBe("10–11m");
  });
});

describe("timing history", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-timings-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const rec = (workers: number, steps: Array<[string, string, number]>, extra = {}) =>
    JSON.stringify({ runId: `r${Math.random()}`, level: "full", workers, verdict: "PASSED", wallSec: 100, steps: steps.map(([name, status, durationSec]) => ({ name, status, durationSec })), ...extra });

  it("takes base samples newest first: sequential as measured, parallel divided by their run's contention, then the baseline", () => {
    const hist = join(dir, "h.jsonl");
    writeFileSync(hist, [
      rec(1, [["check-a", "PASS", 10], ["check-b", "FAIL", 999]]),
      rec(3, [["check-a", "PASS", 50]], { contentionRatio: 1.2 }),
      "{ torn line",
      rec(1, [["check-a", "PASS", 12]]),
    ].join("\n"));
    const base = join(dir, "b.json");
    writeFileSync(base, JSON.stringify({ generated: "2026-11-09T00:00:00Z", steps: { "check-a": { samples: [11] }, "check-c": { samples: [7, 8] } }, contention: { "2": [1.1] }, sequentialWallSec: [5000] }));
    const t = loadTimings({ baselinePath: base, historyPath: hist });
    expect(t.base["check-a"]).toEqual([12, 41.7, 10, 11]); // 50 s on 3 workers at contention 1.2 counts as 41.7 s
    expect(t.base["check-b"]).toBeUndefined(); // a failed step's time is not a duration estimate
    expect(t.base["check-c"]).toEqual([7, 8]);
    expect(t.contention).toEqual({ "2": [1.1], "3": [1.2] });
    expect(t.sequentialWallSec).toEqual([100, 100, 5000]);
  });
  it("contention ratio is the median step slowdown, and needs enough steps", () => {
    const base = { a: [10], b: [20], c: [30], d: [40], e: [50] };
    const steps = ["a", "b", "c", "d", "e"].map((n, i) => ({ name: n, status: "PASS", durationSec: (i + 1) * 10 * 1.2 }));
    expect(contentionRatio(steps, base)).toBeCloseTo(1.2, 3);
    expect(contentionRatio(steps.slice(0, 3), base)).toBeNull();
  });
  it("history records and baselines keep only what estimates need", () => {
    const r = historyRecord({ runId: "x", level: "full", workers: 3, verdict: "PASSED", startedAt: "t", git: { head: "abc", dirty: [] }, timing: { wallSec: 1, predicted: { mid: 1 }, contentionRatio: 1.1 }, steps: [{ name: "check-a", status: "PASS", durationSec: 3, worker: 2, cpuSec: 1, peakRssMB: 200, log: "./x" }] });
    expect(r).toMatchObject({ head: "abc", workers: 3, contentionRatio: 1.1, steps: [{ name: "check-a", durationSec: 3, worker: 2 }] });
    expect(r.steps[0].log).toBeUndefined();
    const b = buildBaseline([{ workers: 1, level: "full", verdict: "PASSED", wallSec: 99, steps: [{ name: "check-a", status: "PASS", durationSec: 3, cpuSec: 1 }] }, { workers: 2, contentionRatio: 1.3, steps: [] }]);
    expect(b.steps["check-a"]).toEqual({ samples: [3], cpuSec: 1 });
    expect(b.contention).toEqual({ "2": [1.3] });
    expect(b.sequentialWallSec).toEqual([99]);
  });
});
