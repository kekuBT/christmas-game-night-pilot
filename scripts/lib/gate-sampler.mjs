// Resource sampling for scripts/gate.mjs (Stage 5.2), Linux only.
//
// Once a second it reads /proc and attributes every process of this run to
// the step or worker server that started it, using the same ownership tags
// the gate already uses for cleanup (MCHEZO_GATE_STEP / MCHEZO_GATE_SERVER
// in the process environment; Chromium inherits them from its driver).
// Per owner it keeps CPU seconds (utime + stime, summed over every process
// it ever saw) and the peak of the summed resident memory. Machine-wide it
// keeps CPU utilisation (from /proc/stat), the lowest MemAvailable and the
// highest 1-minute load average.
//
// Sampling once a second misses processes that live less than a second and
// the last second of each process's CPU, so CPU figures are slight
// underestimates. Elsewhere (macOS, Windows) the sampler is a no-op and the
// report says "not measured".
import { readdirSync, readFileSync } from "node:fs";
import { loadavg } from "node:os";

const HZ = 100; // USER_HZ on Linux
const PAGE = 4096;

function readStat(pid) {
  const raw = readFileSync(`/proc/${pid}/stat`, "utf8");
  const f = raw.slice(raw.lastIndexOf(")") + 2).split(" "); // f[0] = field 3 (state)
  return { ticks: Number(f[11]) + Number(f[12]), start: f[19] };
}
const readRss = (pid) => Number(readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]) * PAGE;

function systemCpu() {
  const parts = readFileSync("/proc/stat", "utf8").split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] ?? 0);
  return { total: parts.reduce((a, b) => a + b, 0), idle };
}
function memAvailableMB() {
  const m = /MemAvailable:\s+(\d+) kB/.exec(readFileSync("/proc/meminfo", "utf8"));
  return m ? Math.round(Number(m[1]) / 1024) : null;
}

export function createSampler(runId, { intervalMs = 1000 } = {}) {
  const enabled = process.platform === "linux";
  const owners = new Map(); // owner -> { cpuTicks: Map(pidKey -> ticks), rssPeak, rssNow }
  const known = new Map(); // pidKey -> owner | null (not ours)
  const sys = { samples: 0, cpuSum: 0, cpuPeak: 0, memMinMB: null, loadPeak: 0, timeline: [] };
  let prevCpu = null, timer = null;

  function ownerOf(pid) {
    let env;
    try { env = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0"); } catch { return null; }
    if (!env.includes(`MCHEZO_GATE_RUN=${runId}`)) return null;
    const step = env.find((e) => e.startsWith("MCHEZO_GATE_STEP="));
    if (step) return `step:${step.slice("MCHEZO_GATE_STEP=".length).split(":").pop()}`;
    const srv = env.find((e) => e.startsWith("MCHEZO_GATE_SERVER="));
    return srv ? `server:${srv.slice("MCHEZO_GATE_SERVER=".length)}` : "run";
  }

  function sample() {
    let pids;
    try { pids = readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch { return; }
    const live = new Map(); // owner -> rss
    for (const pid of pids) {
      let st;
      try { st = readStat(pid); } catch { continue; }
      const key = `${pid}@${st.start}`; // pid + start time: safe against pid reuse
      if (!known.has(key)) known.set(key, ownerOf(pid));
      const owner = known.get(key);
      if (!owner) continue;
      let o = owners.get(owner);
      if (!o) { o = { cpuTicks: new Map(), rssPeak: 0 }; owners.set(owner, o); }
      o.cpuTicks.set(key, Math.max(o.cpuTicks.get(key) ?? 0, st.ticks));
      try { live.set(owner, (live.get(owner) ?? 0) + readRss(pid)); } catch { /* exited */ }
    }
    for (const [owner, rss] of live) { const o = owners.get(owner); o.rssPeak = Math.max(o.rssPeak, rss); }
    try {
      const now = systemCpu();
      if (prevCpu) {
        const dt = now.total - prevCpu.total;
        const busy = dt > 0 ? 100 * (1 - (now.idle - prevCpu.idle) / dt) : 0;
        sys.samples++; sys.cpuSum += busy; sys.cpuPeak = Math.max(sys.cpuPeak, busy);
        if (sys.samples % 10 === 0) sys.timeline.push(Math.round(busy));
      }
      prevCpu = now;
      const mem = memAvailableMB();
      if (mem !== null) sys.memMinMB = sys.memMinMB === null ? mem : Math.min(sys.memMinMB, mem);
      sys.loadPeak = Math.max(sys.loadPeak, loadavg()[0]);
    } catch { /* informational only */ }
  }

  return {
    enabled,
    start() { if (enabled && !timer) { sample(); timer = setInterval(sample, intervalMs); timer.unref(); } },
    stop() { if (timer) { clearInterval(timer); timer = null; sample(); } },
    /** Take one sample now (the gate calls this as a step ends). */
    sampleNow() { if (enabled) sample(); },
    /** { cpuSec, peakRssMB } for "step:<index>" or "server:<worker>"; null if never seen. */
    usage(owner) {
      const o = owners.get(owner);
      if (!o) return null;
      let ticks = 0;
      for (const t of o.cpuTicks.values()) ticks += t;
      return { cpuSec: Math.round((ticks / HZ) * 10) / 10, peakRssMB: Math.round(o.rssPeak / 1048576) };
    },
    system() {
      if (!enabled || !sys.samples) return null;
      return { cpuPctMean: Math.round(sys.cpuSum / sys.samples), cpuPctPeak: Math.round(sys.cpuPeak), memAvailMinMB: sys.memMinMB, load1Peak: Math.round(sys.loadPeak * 100) / 100, cpuPctEvery10s: sys.timeline };
    },
  };
}
