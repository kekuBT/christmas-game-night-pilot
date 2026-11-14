/**
 * Stage 12.4 (docs/stage12/stage124.md §3; D-S124-03): optional TV sound. Off by default, turned on by the director's
 * button on the TV (that press is the gesture browsers require before audio). A short chime made with WebAudio: no
 * audio files, nothing downloaded, $0. Phones never play it. Silent while the director has paused animations.
 * The choice is remembered on this TV only (browser storage, with the page's own memory if storage fails).
 */
const KEY = "mz_tv_sound";

export function soundPreference(): boolean {
  try { return localStorage.getItem(KEY) === "on"; } catch { return false; }
}
export function rememberSound(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* this page still remembers */ }
}

let ctx: AudioContext | null = null;

/** The audio context, made on first use (after the director's press). Null where the browser has no WebAudio. */
export function audio(): AudioContext | null {
  if (ctx) return ctx;
  const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const C = g.AudioContext ?? g.webkitAudioContext;
  if (!C) return null;
  try { ctx = new C(); } catch { ctx = null; }
  return ctx;
}

/** The notes of each moment: a rising fanfare for a winner, two soft notes otherwise. */
export const CHIMES = {
  fanfare: [523.25, 659.25, 783.99, 1046.5],
  soft: [659.25, 783.99],
} as const;

let played = 0;
/** How many chimes this page has played (shown on the director's button, so a check can count them). */
export const chimesPlayed = () => played;

/** Play a chime now. Returns false (and plays nothing) when there is no audio. */
export function chime(kind: keyof typeof CHIMES): boolean {
  const a = audio();
  if (!a) return false;
  played += 1;
  if (a.state === "suspended") void a.resume().catch(() => { /* the browser still wants a gesture: silent */ });
  const t0 = a.currentTime;
  CHIMES[kind].forEach((f, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    const at = t0 + i * 0.13;
    o.type = "triangle";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.16, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
    o.connect(g).connect(a.destination);
    o.start(at);
    o.stop(at + 0.6);
  });
  return true;
}
