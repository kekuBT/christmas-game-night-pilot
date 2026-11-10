// Timing history for scripts/gate.mjs (Stage 5.2).
//
// Two sources, merged:
// - The local history: one JSON line per gate run, appended to
//   <results-dir>/timing-history.jsonl (test-results/ is git-ignored, so
//   runs never churn the repository). --history=<file> or
//   MCHEZO_GATE_HISTORY points several clones at one shared file.
// - The committed baseline, scripts/lib/gate-timings.json: real measured
//   samples so a fresh clone or CI has estimates too. It changes only when
//   someone runs `node scripts/gate.mjs timings --update-baseline` and
//   commits the result on purpose.
//
// A step's base samples are its uncontended durations: from sequential
// runs as measured, and from parallel runs divided by that run's measured
// contention ratio (the median over its steps of actual / base), so the
// history keeps up when a driver changes even if only parallel runs follow.
// Contention is kept per "<workers>@<cpus>": 2 workers on 2 CPUs and on 4
// CPUs are different machines.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { median } from "./gate-plan.mjs";

const MAX_SAMPLES = 10;

export function readHistory(path) {
  if (!path || !existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn line from a killed run: skip it */ }
  }
  return out;
}

export function readBaseline(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return { steps: {}, contention: {}, sequentialWallSec: [] }; }
}

/**
 * { base: { step: [sec...] }, contention: { "2": [ratio...] }, sequentialWallSec: [...],
 *   sources: { historyRuns, baselineRuns } }
 */
export function loadTimings({ baselinePath, historyPath }) {
  const baseline = readBaseline(baselinePath);
  const history = readHistory(historyPath).filter((r) => r && Array.isArray(r.steps));
  const contention = {};
  for (const [k, ratios] of Object.entries(baseline.contention ?? {})) contention[k] = [...ratios];
  for (const r of history) {
    if ((r.workers ?? 1) > 1 && Number.isFinite(r.contentionRatio)) (contention[contentionKey(r.workers, r.cpus)] ??= []).push(r.contentionRatio);
  }
  const base = {};
  // Newest local samples first, topped up from the baseline. Parallel ones
  // are divided by their run's contention, or, for a run with too few steps
  // to measure its own, by the median measured for the same workers and
  // CPUs; with neither, the run adds no samples.
  for (const r of [...history].reverse()) {
    const parallel = (r.workers ?? 1) > 1;
    let k = 1;
    if (parallel) {
      const own = Number.isFinite(r.contentionRatio) && r.contentionRatio > 0 ? r.contentionRatio : null;
      const known = contention[contentionKey(r.workers, r.cpus)];
      k = own ?? (known?.length ? median(known) : null);
      if (!k) continue;
    }
    for (const s of r.steps) {
      if (s.status !== "PASS" || !Number.isFinite(s.durationSec)) continue;
      const arr = (base[s.name] ??= []);
      if (arr.length < MAX_SAMPLES) arr.push(Math.round((s.durationSec / k) * 10) / 10);
    }
  }
  for (const [name, b] of Object.entries(baseline.steps ?? {})) {
    const arr = (base[name] ??= []);
    for (const x of b.samples ?? []) if (arr.length < MAX_SAMPLES) arr.push(x);
  }
  // Newest first: the comparison is with how long the sequential gate takes now.
  const sequentialWallSec = [
    ...[...history].reverse().filter((r) => (r.workers ?? 1) === 1 && r.level === "full" && r.verdict === "PASSED" && Number.isFinite(r.wallSec)).map((r) => r.wallSec),
    ...(baseline.sequentialWallSec ?? []),
  ].slice(0, 10);
  return { base, contention, sequentialWallSec, sources: { historyRuns: history.length, baselineGenerated: baseline.generated ?? null } };
}

/** Contention is measured per worker count AND CPU count ("3@4"). */
export const contentionKey = (workers, cpus) => (cpus ? `${workers}@${cpus}` : String(workers));

/**
 * Contention ratio of a finished parallel run: the median over its PASS
 * steps (with a base estimate) of actual / base-median duration.
 */
export function contentionRatio(steps, base) {
  const ratios = [];
  for (const s of steps) {
    if (s.status !== "PASS" || !(s.durationSec > 5)) continue; // very short steps are noise
    const b = base[s.name];
    if (!b?.length) continue;
    ratios.push(s.durationSec / median(b));
  }
  return ratios.length >= 5 ? Math.round(median(ratios) * 1000) / 1000 : null;
}

export function appendHistory(path, record) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + "\n");
}

/** Compact history record of one run (only what estimates and comparisons need). */
export function historyRecord(report) {
  return {
    runId: report.runId,
    head: report.git?.head ?? null,
    dirty: (report.git?.dirty ?? []).length,
    level: report.level,
    workers: report.workers,
    cpus: report.machine?.cpus ?? null,
    verdict: report.verdict,
    startedAt: report.startedAt,
    wallSec: report.timing?.wallSec ?? null,
    predicted: report.timing?.predicted ?? null,
    contentionRatio: report.timing?.contentionRatio ?? null,
    steps: report.steps.filter((s) => s.durationSec != null).map((s) => ({ name: s.name, status: s.status, durationSec: s.durationSec, worker: s.worker ?? null, cpuSec: s.cpuSec ?? null, peakRssMB: s.peakRssMB ?? null })),
  };
}

/** A new baseline from history records (sequential samples + contention ratios). */
export function buildBaseline(records, { note = "" } = {}) {
  const steps = {};
  for (const r of [...records].reverse()) {
    if ((r.workers ?? 1) !== 1) continue;
    for (const s of r.steps ?? []) {
      if (s.status !== "PASS" || !Number.isFinite(s.durationSec)) continue;
      const e = (steps[s.name] ??= { samples: [] });
      if (e.samples.length < MAX_SAMPLES) e.samples.push(s.durationSec);
      if (s.cpuSec != null && e.cpuSec === undefined) e.cpuSec = s.cpuSec;
      if (s.peakRssMB != null && e.peakRssMB === undefined) e.peakRssMB = s.peakRssMB;
    }
  }
  const contention = {};
  for (const r of records) if ((r.workers ?? 1) > 1 && Number.isFinite(r.contentionRatio)) (contention[contentionKey(r.workers, r.cpus)] ??= []).push(r.contentionRatio);
  const sequentialWallSec = records.filter((r) => (r.workers ?? 1) === 1 && r.level === "full" && r.verdict === "PASSED" && Number.isFinite(r.wallSec)).map((r) => r.wallSec).slice(-10).reverse();
  return { generated: new Date().toISOString(), note, steps: Object.fromEntries(Object.entries(steps).sort(([a], [b]) => a.localeCompare(b))), contention, sequentialWallSec };
}

export function writeBaseline(path, baseline) {
  writeFileSync(path, JSON.stringify(baseline, null, 2) + "\n");
}
