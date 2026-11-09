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
// A step's base samples are its durations from SEQUENTIAL runs (one
// worker), where nothing competed with it; parallel runs contribute a
// contention ratio instead (the median over their steps of actual / base).
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
  const base = {};
  // Newest local sequential samples first, topped up from the baseline.
  for (const r of [...history].reverse()) {
    if ((r.workers ?? 1) !== 1) continue;
    for (const s of r.steps) {
      if (s.status !== "PASS" || !Number.isFinite(s.durationSec)) continue;
      const arr = (base[s.name] ??= []);
      if (arr.length < MAX_SAMPLES) arr.push(s.durationSec);
    }
  }
  for (const [name, b] of Object.entries(baseline.steps ?? {})) {
    const arr = (base[name] ??= []);
    for (const x of b.samples ?? []) if (arr.length < MAX_SAMPLES) arr.push(x);
  }
  const contention = {};
  for (const [k, ratios] of Object.entries(baseline.contention ?? {})) contention[k] = [...ratios];
  for (const r of history) {
    if ((r.workers ?? 1) > 1 && Number.isFinite(r.contentionRatio)) (contention[String(r.workers)] ??= []).push(r.contentionRatio);
  }
  const sequentialWallSec = [
    ...history.filter((r) => (r.workers ?? 1) === 1 && r.level === "full" && r.verdict === "PASSED").map((r) => r.wallSec),
    ...(baseline.sequentialWallSec ?? []),
  ];
  return { base, contention, sequentialWallSec, sources: { historyRuns: history.length, baselineGenerated: baseline.generated ?? null } };
}

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
  for (const r of records) if ((r.workers ?? 1) > 1 && Number.isFinite(r.contentionRatio)) (contention[String(r.workers)] ??= []).push(r.contentionRatio);
  const sequentialWallSec = records.filter((r) => (r.workers ?? 1) === 1 && r.level === "full" && r.verdict === "PASSED" && Number.isFinite(r.wallSec)).map((r) => r.wallSec).slice(-10);
  return { generated: new Date().toISOString(), note, steps: Object.fromEntries(Object.entries(steps).sort(([a], [b]) => a.localeCompare(b))), contention, sequentialWallSec };
}

export function writeBaseline(path, baseline) {
  writeFileSync(path, JSON.stringify(baseline, null, 2) + "\n");
}
