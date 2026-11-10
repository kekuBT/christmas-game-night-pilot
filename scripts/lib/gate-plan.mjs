// Scheduling and time estimation for scripts/gate.mjs (Stage 5.2).
//
// Pure functions only (no I/O), so tests/gate-plan.test.ts can prove the
// schedule order, the simulation and the estimates without running a gate.
//
// The model, in one paragraph: every step has a base duration measured
// when it ran ALONE (sequential runs). A run with k workers slows each step
// by a contention factor measured on earlier runs with k workers. The
// runner starts steps in a fixed queue order whenever enough worker
// capacity is free (no skipping ahead), and `simulate` replays exactly that
// policy, so the estimate and the real schedule agree. Ranges come from
// each step's spread (p10..p90) and the spread of the contention factor;
// nothing is invented: a step with no history is reported as such.

/** Linear-interpolated percentile of an ascending array. */
export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export const median = (xs) => percentile([...xs].sort((a, b) => a - b), 0.5);

/**
 * When a step changes (a faster driver, a slower game), its old samples
 * describe a different step. `samples` is newest first. If the two newest
 * both differ from the median of the rest by more than 30% in the same
 * direction, only the leading samples within 30% of the newest are kept.
 * Two new samples are needed, so one outlier run never resets a step.
 */
export function currentRegime(samples) {
  const s = (samples ?? []).filter((x) => Number.isFinite(x) && x >= 0);
  if (s.length < 4) return s;
  const rest = median(s.slice(2));
  const off = (x) => (x > rest * 1.3 ? 1 : x < rest / 1.3 ? -1 : 0);
  if (off(s[0]) === 0 || off(s[0]) !== off(s[1])) return s;
  const out = [];
  for (const x of s) { if (Math.abs(x - s[0]) <= 0.3 * s[0]) out.push(x); else break; }
  return out;
}

/**
 * A step's base (uncontended) duration from its PASS samples, in seconds.
 * source: "measured" (3+ samples), "few" (1-2), "none" (no history: the
 * fallback is a guess and the plan says so).
 */
export function estimateStep(samples, fallbackSec = 60) {
  const s = currentRegime(samples).sort((a, b) => a - b);
  if (!s.length) return { mid: fallbackSec, low: fallbackSec * 0.25, high: fallbackSec * 3, n: 0, source: "none" };
  const mid = percentile(s, 0.5);
  if (s.length < 3) return { mid, low: mid * 0.85, high: mid * 1.3, n: s.length, source: "few" };
  return { mid, low: Math.min(percentile(s, 0.1), mid * 0.95), high: Math.max(percentile(s, 0.9), mid * 1.05), n: s.length, source: "measured" };
}

/**
 * The contention factor for `workers` from earlier runs' measured ratios
 * (each ratio: the median over that run's steps of actual / base duration).
 * Sequential is 1 by definition. With no measured run at this worker
 * count the factor is modeled (1 + 0.1 per extra worker) with a wide range.
 */
export function contentionFor(workers, ratiosByWorkers = {}, cpus = null) {
  if (workers <= 1) return { mid: 1, low: 0.97, high: 1.08, n: 0, source: "sequential" };
  // Ratios are keyed "<workers>@<cpus>" (older records: "<workers>").
  const key = cpus ? `${workers}@${cpus}` : String(workers);
  const r = (ratiosByWorkers[key] ?? []).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (r.length) {
    const mid = percentile(r, 0.5);
    return { mid, low: Math.min(r[0], mid * 0.95), high: Math.max(r.at(-1), mid * 1.1), n: r.length, source: "measured" };
  }
  const mid = 1 + 0.1 * (workers - 1);
  return { mid, low: 1, high: 1 + 0.3 * (workers - 1), n: 0, source: "modeled" };
}

/**
 * Queue order. Sequential reference mode keeps the given order (the old
 * gate's: alphabetical drivers, then E2E). Parallel mode puts exclusive
 * steps first (they need the whole pool, so they run before anything else
 * is in flight and cost no drain time), then longest-first (LPT), which
 * starts the critical path as early as possible. Ties break by name, so
 * the order is deterministic.
 */
export function orderSteps(steps, { parallel }) {
  if (!parallel) return [...steps];
  return [...steps].sort((a, b) => (Number(!!b.exclusive) - Number(!!a.exclusive)) || (b.est.mid - a.est.mid) || a.name.localeCompare(b.name));
}

/**
 * Replay the runner's policy: take steps strictly in queue order; start the
 * head as soon as `weight` units of `capacity` are free; never skip ahead.
 * `running`: steps already in flight ({ name, remaining, weight }).
 * Returns the makespan (seconds from now) and each queued step's start.
 */
export function simulate(queue, capacity, running = []) {
  const active = running.map((r) => ({ name: r.name, end: Math.max(0, r.remaining), weight: Math.min(r.weight ?? 1, capacity) }));
  let free = capacity - active.reduce((s, a) => s + a.weight, 0);
  let t = 0;
  let makespan = active.reduce((m, a) => Math.max(m, a.end), 0);
  const starts = {};
  for (const st of queue) {
    const w = Math.min(Math.max(1, st.weight ?? 1), capacity);
    while (free < w && active.length) {
      active.sort((a, b) => a.end - b.end);
      const done = active.shift();
      t = Math.max(t, done.end);
      free += done.weight;
    }
    starts[st.name] = t;
    active.push({ name: st.name, end: t + st.dur, weight: w });
    free -= w;
    makespan = Math.max(makespan, t + st.dur);
  }
  return { makespan, starts };
}

/** Low / mid / high makespan for a queue of steps with `est` ranges. */
export function estimateMakespan(queue, capacity, contention, running = []) {
  const pick = (k) => simulate(
    queue.map((s) => ({ name: s.name, dur: s.est[k] * contention[k], weight: s.weight })),
    capacity,
    running.map((r) => ({ name: r.name, weight: r.weight, remaining: remainingOf(r, k, contention[k]) })),
  ).makespan;
  return { low: pick("low"), mid: pick("mid"), high: pick("high") };
}

/**
 * Time left for a running step. Past its estimate it is "overrunning":
 * assume it needs at least 15 s or 15% of what it has used so far, so an
 * overrunning step never shows 0 remaining.
 */
export function remainingOf(r, k, factor) {
  const expected = r.est[k] * factor;
  return expected > r.elapsed ? expected - r.elapsed : Math.max(15, 0.15 * r.elapsed);
}

/**
 * How sure the estimate is: "measured" when every step has 3+ samples and
 * the contention factor for this worker count was measured; "modeled" when
 * the step times are measured but the contention is modeled; otherwise
 * "low-confidence" (some steps have little or no history).
 */
export function confidenceOf(steps, contention) {
  const none = steps.filter((s) => s.est.source === "none").map((s) => s.name);
  const few = steps.filter((s) => s.est.source === "few").map((s) => s.name);
  if (none.length || few.length) return { label: "low-confidence", none, few };
  return { label: contention.source === "modeled" ? "modeled" : "measured", none, few };
}

/**
 * Default worker count from the machine. Every worker runs one browser
 * driver (one Chromium, up to ~11 pages) plus its own server, so it needs
 * memory as well as CPU (each driver peaked at 250-400 MB with its
 * Chromium, measured). The cap of 3 is the largest count benchmarked as
 * reliable (docs/test-optimization/README.md).
 */
export function autoWorkers({ cpus, memAvailMB, perWorkerMB = 1500, cap = 3 }) {
  // Measured: 2 workers on 2 CPUs ran a 21-driver subset 1.85x faster with
  // contention x1.05 and no failures (README §8), so 2 CPUs get 2 workers;
  // larger machines keep one CPU spare, up to the cap.
  const byCpu = cpus <= 2 ? cpus : cpus - 1;
  const byMem = Math.max(1, Math.floor(memAvailMB / perWorkerMB));
  return Math.max(1, Math.min(cap, byCpu, byMem));
}

/** "14m 20s", "45s", "1h 02m". */
export function fmtDur(sec) {
  if (!Number.isFinite(sec)) return "?";
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return `${m}m ${String(r).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** "12–18m" (whole minutes, rounded outward) or "40s–1m" for short ranges. */
export function fmtRange(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return "?";
  if (hi < 90) return `${Math.max(0, Math.floor(lo))}–${Math.ceil(hi)}s`;
  const a = Math.floor(lo / 60), b = Math.max(a + 1, Math.ceil(hi / 60));
  return `${a}–${b}m`;
}

/** Wall-clock HH:MM (UTC) for `ms` epoch. */
export const clock = (ms) => new Date(ms).toISOString().slice(11, 16);
