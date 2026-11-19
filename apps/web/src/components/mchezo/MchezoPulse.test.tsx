/**
 * H1 (handoff 7008903623): Pattern Pulse's pattern is a transient cue. While a round is memorised and
 * while it is tapped back, the complete sequence is never in rendered text, an announced live region or
 * an accessible name: only the current symbol is, in its own slot of the server's memorise window.
 * Recall controls, post-round feedback and scoring are unchanged (the server is untouched apart from the
 * additive showFrom). scripts/check-pattern-pulse.mjs checks the same in a real browser, over time.
 *
 * The cue announcer (review 7010784066): one assertive live region, PulseAnnouncer, rendered after every
 * screen's <main> at the same place, empty when it mounts, so the first cue updates a region already in the
 * page. These static renders pin its place, its attributes and its empty mount on every screen, and
 * pulseCueSay pins what it says in each slot, gap and after the window. That React keeps the SAME node from
 * the ready screen through memorising to the recall screen is checked in a real browser by
 * scripts/check-pattern-pulse.mjs (a DOM transition this suite has no DOM for).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MchezoPulse, PULSE_SYMBOLS, pulseCueSay } from "./MchezoPulse.js";
import { PULSE_CUE_GAP, pulseCueAt, pulseCueText } from "./pulseCue.js";
import type { PlayerGame, PublicPlayer } from "../../types.js";

const PLAYERS: PublicPlayer[] = [{ id: "p1", displayName: "Keku", avatar: "🙂", isHost: true, isCohost: false, connected: true }];
// A canary pattern whose order differs from the six keys' order, with a repeat.
const PATTERN = [3, 1, 4, 4, 0];
const names = PATTERN.map((s) => PULSE_SYMBOLS[s]!.name);

function render(open: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const game = { id: "g1", gameId: "pattern-pulse", status: "playing", players: ["p1"], deadlineAt: Date.now() + 300_000, state: { roundCount: 6, lengths: [3, 4, 5, 6, 7, 8], next: 2, open, results: [], myTotal: 0, ...extra } } as unknown as PlayerGame;
  return renderToStaticMarkup(<MchezoPulse game={game} players={PLAYERS} playerId="p1" title="Pattern Pulse" intent={() => true} />);
}
/** Every attribute value and every text run in the markup. */
const texts = (html: string) => [...html.matchAll(/="([^"]*)"/g)].map((m) => m[1]!).concat([...html.matchAll(/>([^<]+)</g)].map((m) => m[1]!));
/** True when one string names two or more of the pattern's symbols in the pattern's order. */
const holdsSequence = (t: string) => {
  for (let i = 0; i + 1 < names.length; i++) {
    const a = t.indexOf(names[i]!);
    if (a >= 0 && t.indexOf(names[i + 1]!, a + names[i]!.length) >= 0) return true;
  }
  return false;
};

describe("pulseCueAt: one symbol at a time, in equal slots of the server's window", () => {
  const from = 10_000, until = 10_000 + 5_000; // 5 symbols: 1,000 ms slots, 800 ms shown, 200 ms gap
  it("each slot shows its own symbol, then a gap; nothing after the window", () => {
    expect(pulseCueAt(5, from, until, from)).toEqual({ index: 0, nextChangeAt: from + 800 });
    expect(pulseCueAt(5, from, until, from + 799).index).toBe(0);
    expect(pulseCueAt(5, from, until, from + 800)).toEqual({ index: null, nextChangeAt: from + 1000 });
    expect(pulseCueAt(5, from, until, from + 1000).index).toBe(1);
    expect(pulseCueAt(5, from, until, from + 4_000).index).toBe(4);
    expect(pulseCueAt(5, from, until, from + 4_850).index).toBeNull();
    expect(pulseCueAt(5, from, until, until)).toEqual({ index: null, nextChangeAt: null });
    expect(pulseCueAt(5, from, until, until + 5_000)).toEqual({ index: null, nextChangeAt: null });
  });
  it("every symbol gets the same time on screen, and they come in order, never two at once", () => {
    const shown = new Map<number, number>();
    let last = -1;
    for (let t = from; t < until; t += 5) {
      const c = pulseCueAt(5, from, until, t);
      if (c.index === null) continue;
      expect(c.index).toBeGreaterThanOrEqual(last);
      last = c.index;
      shown.set(c.index, (shown.get(c.index) ?? 0) + 5);
    }
    expect([...shown.keys()]).toEqual([0, 1, 2, 3, 4]);
    for (const ms of shown.values()) expect(ms).toBe(1000 * (1 - PULSE_CUE_GAP));
  });
  it("the server's real windows: 3 symbols in 3.3 s up to 8 in 6.8 s, at least 0.68 s each on screen", () => {
    for (const [len, ms] of [[3, 3300], [8, 6800]] as const) {
      const first = pulseCueAt(len, 0, ms, 0);
      expect(first.index).toBe(0);
      expect(first.nextChangeAt).toBeGreaterThanOrEqual(680);
    }
  });
  it("a phone whose clock runs behind the server shows the first symbol, not nothing", () => {
    expect(pulseCueAt(5, from, until, from - 300).index).toBe(0);
  });
  it("the cue's words: position, length and the symbol's full name", () => {
    expect(pulseCueText(1, 5, "Yellow square")).toBe("2 of 5: Yellow square");
  });
});

/** The announcer exactly as it is first rendered on every screen: last, after </main>, assertive, atomic, empty. */
const ANNOUNCER_EMPTY = '<p class="mz-sr" data-testid="mz-pp-announcer" aria-live="assertive" aria-atomic="true"></p>';

describe("the memorise screen holds one symbol, never the sequence (H1)", () => {
  it("in each slot: the stage shows exactly the current symbol, hidden from assistive technology (the announcer speaks), and no text or name holds two in order", () => {
    for (let i = 0; i < PATTERN.length; i++) {
      // The server's window started i slots (of 1,000 ms) plus 100 ms ago.
      const now = Date.now();
      const html = render({ round: 2, length: 5, showFrom: now - i * 1000 - 100, showUntil: now - i * 1000 - 100 + 5000, inputUntil: now + 30_000, pattern: PATTERN });
      expect(html).toContain('data-testid="mz-pp-memorise"');
      expect(html).toMatch(/data-testid="mz-pp-stage" aria-hidden="true"/);
      expect(html).toContain(`data-index="${i}" data-symbol="${PATTERN[i]}"`);
      expect(html).toContain(pulseCueText(i, 5, names[i]!));
      expect(html.match(/data-testid="mz-pp-cue"/g)?.length).toBe(1);
      for (const t of texts(html)) expect(holdsSequence(t), t).toBe(false);
      expect(html).not.toContain("The pattern:");
      expect(html).not.toContain("mz-pp-cell");
      // One speaking live region on the screen: the announcer (the stage and the countdown are not live; the game clock is aria-live="off").
      expect(html.match(/aria-live="(assertive|polite)"/g)).toEqual(['aria-live="assertive"']);
      expect(html).toMatch(/<p class="mz-foot" data-testid="mz-pp-timer">/);
    }
  });
  it("in a gap the stage is empty", () => {
    const now = Date.now();
    const html = render({ round: 2, length: 5, showFrom: now - 900, showUntil: now - 900 + 5000, inputUntil: now + 30_000, pattern: PATTERN });
    expect(html).not.toContain('data-testid="mz-pp-cue"');
    for (const n of names) expect(html).not.toContain(n);
  });
  it("from an older server without showFrom it still shows one symbol (counted from when the phone saw the round)", () => {
    const now = Date.now();
    const html = render({ round: 2, length: 5, showUntil: now + 5000, inputUntil: now + 30_000, pattern: PATTERN });
    expect(html.match(/data-testid="mz-pp-cue"/g)?.length).toBe(1);
    expect(html).toContain('data-index="0"');
  });
});

describe("the cue announcer: one live region, in place and empty before the pattern opens (review 7010784066)", () => {
  const from = 50_000, until = from + 5_000; // 5 symbols: 1,000 ms slots, 800 ms said, 200 ms empty
  const open = { round: 2, length: 5, showFrom: from, showUntil: until, inputUntil: until + 19_000, pattern: PATTERN };
  it("what it says: nothing before a round opens; each symbol with its place in its own slot; nothing in each gap and once the window ends", () => {
    expect(pulseCueSay(undefined, from, from)).toBe("");
    expect(pulseCueSay({ round: 2, length: 5, showUntil: until, inputUntil: until + 19_000 }, from, from)).toBe(""); // no pattern (another seat, or after the window)
    const said: string[] = [];
    for (let t = from; t < until + 2_000; t += 10) {
      const s = pulseCueSay(open, t, from);
      if (said.at(-1) !== s) said.push(s);
    }
    // First cue at the window's start, an empty gap after every cue, the last cue cleared before recall.
    expect(said).toEqual(["1 of 5: Blue diamond", "", "2 of 5: Yellow square", "", "3 of 5: Pink star", "", "4 of 5: Pink star", "", "5 of 5: Red circle", ""]);
    expect(pulseCueSay(open, from, from)).toBe("1 of 5: Blue diamond");
    expect(pulseCueSay(open, until - 1, from)).toBe("");
    expect(pulseCueSay(open, until, from)).toBe("");
  });
  it("a symbol shown twice in a row (the server never sends one: pulsePattern) would still be said twice, with its new place, after an empty gap", () => {
    // PATTERN[2] and PATTERN[3] are both Pink star.
    expect(pulseCueSay(open, from + 2_000, from)).toBe("3 of 5: Pink star");
    expect(pulseCueSay(open, from + 2_900, from)).toBe("");
    expect(pulseCueSay(open, from + 3_000, from)).toBe("4 of 5: Pink star");
  });
  it("from an older server without showFrom it counts from when the phone first saw the round", () => {
    const old = { ...open, showFrom: undefined };
    expect(pulseCueSay(old, from + 1_000, from + 1_000)).toBe("1 of 5: Blue diamond");
  });
  it("every screen of the game renders it last, after its <main>, with the same attributes, and empty when it mounts", () => {
    const now = Date.now();
    const screens: [string, string][] = [
      ["ready (before the pattern opens)", render(undefined as unknown as Record<string, unknown>, { open: undefined })],
      ["memorising, mid-slot", render({ round: 2, length: 5, showFrom: now - 100, showUntil: now - 100 + 5000, inputUntil: now + 30_000, pattern: PATTERN })],
      ["memorising, in a gap", render({ round: 2, length: 5, showFrom: now - 900, showUntil: now - 900 + 5000, inputUntil: now + 30_000, pattern: PATTERN })],
      ["recall (tapping it back)", render({ round: 2, length: 5, showFrom: now - 6000, showUntil: now - 1000, inputUntil: now + 19_000, pattern: PATTERN })],
      ["finished", render(undefined as unknown as Record<string, unknown>, { open: undefined, done: true })],
    ];
    for (const [who, html] of screens) {
      expect(html.endsWith(`</main>${ANNOUNCER_EMPTY}`), who).toBe(true);
      expect(html.match(/data-testid="mz-pp-announcer"/g)?.length, who).toBe(1);
      expect(html.match(/aria-live="assertive"/g)?.length, who).toBe(1);
    }
  });
});

describe("tapping it back: the recall screen holds no part of the pattern (H1), and its controls are unchanged", () => {
  it("after the window: no symbol of the pattern in order, the six keys, the empty entry, Lock it in", () => {
    const now = Date.now();
    // A cached pattern after the window must not be drawn either.
    const html = render({ round: 2, length: 5, showFrom: now - 6000, showUntil: now - 1000, inputUntil: now + 19_000, pattern: PATTERN });
    expect(html).toContain('data-testid="mz-pp-input"');
    expect(html).not.toContain('data-testid="mz-pp-stage"');
    for (const t of texts(html)) expect(holdsSequence(t), t).toBe(false);
    for (let s = 0; s < 6; s++) expect(html).toContain(`data-testid="mz-pp-key-${s}"`);
    expect(html).toContain('aria-label="Your entry: 0 of 5"');
    expect(html).toContain('data-testid="mz-pp-submit"');
  });
  it("the next round's screen keeps the last round's feedback line", () => {
    const html = render(undefined as unknown as Record<string, unknown>, { open: undefined, results: [{ round: 1, length: 4, answer: [1, 2, 3, 0], correctRun: 2, perfect: false, points: 40, pattern: [1, 2, 0, 0] }] });
    expect(html).toContain('data-testid="mz-pp-last"');
    expect(html).toContain("2 of 4 right before the first slip: +40.");
  });
});
