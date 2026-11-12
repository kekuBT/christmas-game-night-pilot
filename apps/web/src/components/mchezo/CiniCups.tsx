/**
 * Stage 10.1 (docs/stage10/stage101.md §2–§5): Jebena Rush's lives as cini,
 * small handleless Ethiopian coffee cups. An original inline SVG: a white
 * ceramic cup with a slightly flared rim, a dark outline, a thin teal rim
 * stripe, a small red flower and green leaves. No handle, no photograph, no
 * external file.
 *
 * A broken cup is the same cup split along a zigzag crack, its right shard
 * tipped away, so whole and broken differ by silhouette, not colour alone.
 * Every row also says its number ("3/5") and has an accessible name ("3 of 5
 * cups remaining").
 *
 * A cup breaks (a short animation, full motion only) when this page saw more
 * cups for the same game and seat before and the server recorded the loss
 * moments ago (lib/cups.ts). Otherwise broken cups simply show: on a first
 * view, a reload, a resync after a gap, or a repeated view.
 */
import { useEffect, useState } from "react";
import { serverNowEstimate } from "../../ui/mchezo/index.js";
import { CUP_BREAK_MS, CupMemory, cupSlots, cupsLabel, isLiveBreak, type CupBreak, type CupState } from "../../ui/mchezo/lib/cups.js";

/** The last count each place on this page showed (lost on reload, by design). */
const MEMORY = new CupMemory();

/** The cup's outline: rim at the top, a gently curved body, a short foot. */
const BODY = "M3.5 6 H20.5 C20.2 12 18.6 16.4 15.6 19 H8.4 C5.4 16.4 3.8 12 3.5 6 Z";
const FOOT = "M9.4 19 H14.6 L14 21 H10 Z";
/** The crack, rim to foot. */
const CRACK = "M12.4 6 L10.8 9.4 L13.2 12.2 L11.2 15.6 L12.6 19";
const LEFT = "M3.5 6 H12.4 L10.8 9.4 L13.2 12.2 L11.2 15.6 L12.6 19 H8.4 C5.4 16.4 3.8 12 3.5 6 Z";
const RIGHT = "M12.4 6 H20.5 C20.2 12 18.6 16.4 15.6 19 H12.6 L11.2 15.6 L13.2 12.2 L10.8 9.4 Z";

/** One cup, whole or broken. `breaking` plays the break (CSS, full motion only); the end state is the same still picture. */
export function CiniCup({ state, breaking, size, slot }: { state: CupState; breaking?: boolean; size: number; slot?: number }) {
  if (state === "whole") {
    return (
      <svg className="mz-cini" data-state="whole" data-cup-slot={slot} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
        <path className="mz-cini__foot" d={FOOT} />
        <path className="mz-cini__glaze" d={BODY} />
        <ellipse className="mz-cini__mouth" cx="12" cy="6" rx="8.5" ry="1.5" />
        <path className="mz-cini__stripe" d="M4.4 8.6 H19.6" />
        <path className="mz-cini__leaf" d="M7.9 13.2 Q9.3 11.3 10.6 12.9 Q9.2 14.6 7.9 13.2 Z" />
        <path className="mz-cini__leaf" d="M16.1 13.2 Q14.7 11.3 13.4 12.9 Q14.8 14.6 16.1 13.2 Z" />
        <circle className="mz-cini__flower" cx="12" cy="13" r="1.7" />
      </svg>
    );
  }
  return (
    <svg className={`mz-cini mz-cini--broken${breaking ? " mz-cini--breaking" : ""}`} data-state="broken" data-cup-slot={slot} data-breaking={breaking ? "true" : undefined}
      viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g className="mz-cini__shard mz-cini__shard--l">
        <path className="mz-cini__foot" d="M9.4 19 H12.6 L12.3 21 H10 Z" />
        <path className="mz-cini__glaze" d={LEFT} />
        <path className="mz-cini__stripe" d="M4.4 8.6 H11.3" />
        <path className="mz-cini__leaf" d="M6.6 13.2 Q8 11.3 9.3 12.9 Q7.9 14.6 6.6 13.2 Z" />
      </g>
      <g className="mz-cini__shard mz-cini__shard--r">
        <path className="mz-cini__foot" d="M12.6 19 H14.6 L14 21 H12.3 Z" />
        <path className="mz-cini__glaze" d={RIGHT} />
        <path className="mz-cini__stripe" d="M11.8 8.6 H19.6" />
        <circle className="mz-cini__flower" cx="15.6" cy="12.6" r="1.5" />
        <path className="mz-cini__leaf" d="M18.6 14.6 Q17.6 12.9 16.4 14.2 Q17.4 15.8 18.6 14.6 Z" />
      </g>
      <path className="mz-cini__crack" d={CRACK} />
    </svg>
  );
}

export interface CiniCupsProps {
  /** Whole cups now (the server's count). */
  n: number;
  /** Cups each player started with (3, 5 or 7). */
  of: number;
  testId?: string;
  /** Smaller cups for seat lists and labels. */
  compact?: boolean;
  /**
   * Where this row is drawn: a game, a seat and a surface ("hud", "seat",
   * "row"). With it, a lost cup can break here; without it the row is a
   * still picture.
   */
  memoryKey?: string;
  /** When the server recorded this seat's latest loss (its timeout in the public log). */
  lostAt?: number;
  /** Decorative (the lobby and the briefing already say the number in words). */
  decorative?: boolean;
  /** For the browser driver's break log. */
  seat?: string;
  surface?: string;
}

/** A row of cups: whole ones first, broken ones after, with "n/of" and an accessible name. */
export function CiniCups({ n, of, testId, compact, memoryKey, lostAt, decorative, seat, surface }: CiniCupsProps) {
  const whole = Math.max(0, Math.min(Math.floor(n), of));
  // The first render after a loss already shows it breaking (no frame of a still broken cup first).
  const fresh = memoryKey ? MEMORY.breaks(memoryKey, whole) : null;
  const freshLive = isLiveBreak(fresh, lostAt, serverNowEstimate());
  const [anim, setAnim] = useState<(CupBreak & { key: string }) | null>(null);
  useEffect(() => {
    if (!memoryKey) return;
    const b = MEMORY.breaks(memoryKey, whole);
    MEMORY.record(memoryKey, whole);
    if (b && isLiveBreak(b, lostAt, serverNowEstimate())) setAnim({ key: memoryKey, ...b });
  }, [memoryKey, whole, lostAt]);
  useEffect(() => {
    if (!anim) return;
    const t = setTimeout(() => setAnim(null), CUP_BREAK_MS);
    return () => clearTimeout(t);
  }, [anim]);
  const brk: CupBreak | null = freshLive ? fresh : anim && anim.key === memoryKey ? anim : null;
  const size = compact ? (of > 5 ? 14 : 16) : of > 5 ? 18 : 22;
  const label = cupsLabel(whole, of);
  return (
    <span
      className={`mz-cini-row${compact ? " mz-cini-row--compact" : ""}`}
      data-testid={testId}
      data-hearts={whole}
      data-cups={whole}
      data-of={of}
      data-cup-seat={seat}
      data-cup-surface={surface}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
    >
      <span className="mz-cini-row__cups" aria-hidden="true">
        {cupSlots(whole, of).map((s, i) => <CiniCup key={i} slot={i} state={s} size={size} breaking={!!brk && i >= brk.from && i < brk.to} />)}
      </span>
      {!decorative && <span className="mz-cini-row__n" aria-hidden="true">{whole}/{of}</span>}
    </span>
  );
}
