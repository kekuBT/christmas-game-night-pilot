/**
 * Stage 12.6 (docs/stage12/stage126.md §2): draws the night card (lib/nightCard.ts facts) on a 1080×1350 canvas, the
 * portrait size chat apps show whole. This phone's look gives the colours; every word comes from the facts.
 * Nothing is fetched: system fonts and emoji, no images, $0.
 */
import type { NightCardFacts } from "./nightCard.js";

export const NIGHT_CARD_SIZE = { width: 1080, height: 1350 } as const;

export interface NightCardLook {
  ground: string; surface: string; line: string; text: string; muted: string; accent: string; highlight: string; onAccent: string;
}

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Cut a line to fit `max` pixels, with an ellipsis, so nothing runs off the card. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (ctx.measureText(`${text.slice(0, mid)}…`).width <= max) lo = mid; else hi = mid - 1; }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/** Wrap onto at most `lines` lines; the last is cut to fit. Returns the next baseline. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, step: number, lines: number): number {
  const words = text.split(" ");
  let line = "";
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(test).width > max && line) {
      if (n === lines - 1) { ctx.fillText(fit(ctx, `${line} ${words.slice(i).join(" ")}`, max), x, y); return y + step; }
      ctx.fillText(line, x, y); y += step; n += 1; line = words[i]!;
    } else line = test;
  }
  if (line) { ctx.fillText(fit(ctx, line, max), x, y); y += step; }
  return y;
}

function kicker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, look: NightCardLook): void {
  ctx.fillStyle = look.muted;
  ctx.font = `800 26px ${FONT}`;
  ctx.fillText(text.toUpperCase().split("").join(" "), x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the card. `christmas` adds the tree to the title; the facts are the same in every look. */
export function drawNightCard(ctx: CanvasRenderingContext2D, f: NightCardFacts, look: NightCardLook, christmas: boolean): void {
  const { width: W, height: H } = NIGHT_CARD_SIZE;
  const M = 72;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = look.ground; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = look.accent; ctx.fillRect(0, 0, W, 18);
  // Eight seats in a ring, the app's mark, drawn (no image).
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 8;
    ctx.fillStyle = i === 0 ? look.accent : look.muted;
    ctx.beginPath(); ctx.arc(M + 22 + Math.cos(a) * 18, 92 + Math.sin(a) * 18, i === 0 ? 7 : 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = look.text; ctx.font = `700 34px ${FONT}`; ctx.fillText("mchezo", M + 60, 104);
  // The body is measured first (drawn on a context that only measures), then drawn lower when a short night would
  // leave the card's bottom half empty: between the mark and the footer, a little above the middle.
  const top = 228;
  const end = drawBody(measuringOnly(ctx), f, look, christmas, top);
  const room = H - 140 - end;
  ctx.save();
  if (room > 0) ctx.translate(0, Math.round(room * 0.45));
  drawBody(ctx, f, look, christmas, top);
  ctx.restore();
  ctx.fillStyle = look.muted; ctx.font = `600 26px ${FONT}`;
  const foot = "Played together with mchezo";
  ctx.fillText(foot, (W - ctx.measureText(foot).width) / 2, H - 56);
}

/** A context that measures text and keeps state, but draws nothing (for laying the body out before drawing it). */
function measuringOnly(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  const silent = new Set(["fillText", "fillRect", "fill", "stroke", "arc", "beginPath", "moveTo", "arcTo", "closePath", "strokeText"]);
  return new Proxy(ctx, {
    get(target, key) {
      if (typeof key === "string" && silent.has(key)) return () => {};
      const v = (target as unknown as Record<string | symbol, unknown>)[key];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(target, key, value) { (target as unknown as Record<string | symbol, unknown>)[key] = value; return true; },
  });
}

/** The card's body (title to the last game), from `y`. Returns where it ended. */
function drawBody(ctx: CanvasRenderingContext2D, f: NightCardFacts, look: NightCardLook, christmas: boolean, y0: number): number {
  const { width: W, height: H } = NIGHT_CARD_SIZE;
  const M = 72;
  const inner = W - 2 * M;
  ctx.font = `800 72px ${FONT}`; ctx.fillStyle = look.text;
  let y = wrap(ctx, `${christmas ? "🎄 " : ""}${f.title}`, M, y0, inner, 80, 2);
  ctx.fillStyle = look.muted; ctx.font = `500 32px ${FONT}`;
  ctx.fillText(fit(ctx, f.dateLine, inner), M, y + 2); y += 46;
  ctx.fillStyle = look.text; ctx.font = `700 32px ${FONT}`;
  ctx.fillText(f.summary, M, y + 2); y += 54;

  if (f.champion) {
    ctx.fillStyle = look.highlight; roundRect(ctx, M, y, inner, 92, 24); ctx.fill();
    ctx.fillStyle = look.onAccent; ctx.font = `800 40px ${FONT}`; ctx.fillText(fit(ctx, `🏆 ${f.champion}`, inner - 48), M + 24, y + 60);
    y += 120;
  }
  const rows = (title: string, items: { left: string; right: string; strong?: boolean }[], more: string | null) => {
    kicker(ctx, title, M, y + 28, look); y += 48;
    ctx.fillStyle = look.surface; roundRect(ctx, M, y, inner, items.length * 58 + (more ? 46 : 0) + 20, 22); ctx.fill();
    ctx.strokeStyle = look.line; ctx.lineWidth = 2; ctx.stroke();
    y += 50;
    for (const it of items) {
      ctx.font = `700 34px ${FONT}`; ctx.fillStyle = look.text;
      const right = it.right;
      const rw = ctx.measureText(right).width;
      ctx.fillText(fit(ctx, it.left, inner - 64 - rw - 24), M + 28, y);
      ctx.font = `${it.strong ? 800 : 600} 32px ${FONT}`; ctx.fillStyle = it.strong ? look.text : look.muted;
      ctx.fillText(right, W - M - 28 - ctx.measureText(right).width, y);
      y += 58;
    }
    if (more) { ctx.font = `500 28px ${FONT}`; ctx.fillStyle = look.muted; ctx.fillText(more, M + 28, y - 8); y += 46; }
    y += 18;
  };
  if (f.standings?.length) rows("Family Cup standings", f.standings.map((s, i) => ({ left: `${i + 1}. ${s.name}`, right: `${s.total} pts`, strong: i === 0 })), null);
  if (f.medals.length) {
    const medalText = (m: { gold: number; silver: number; bronze: number }) => [m.gold ? `🥇${m.gold}` : "", m.silver ? `🥈${m.silver}` : "", m.bronze ? `🥉${m.bronze}` : ""].filter(Boolean).join("  ");
    rows("Tonight’s medals", f.medals.map((m) => ({ left: m.name, right: medalText(m), strong: true })), f.moreMedalRows > 0 ? `…and ${f.moreMedalRows} more with medals` : null);
  }
  if (f.games.length) {
    // A game's line can be long ("Amina and Baraka tie for first"): the title left, the line right, both cut to fit.
    kicker(ctx, f.moreGames > 0 ? `The last ${f.games.length} games` : "The games", M, y + 28, look); y += 48;
    for (const g of f.games) {
      ctx.font = `700 32px ${FONT}`; ctx.fillStyle = look.text;
      const title = fit(ctx, g.title, inner * 0.45);
      ctx.fillText(title, M, y + 34);
      const tw = ctx.measureText(title).width;
      ctx.font = `500 30px ${FONT}`; ctx.fillStyle = look.muted;
      ctx.fillText(fit(ctx, `· ${g.line}`, inner - tw - 16), M + tw + 16, y + 34);
      y += 54;
      if (y > H - 150) break;
    }
    if (f.moreGames > 0 && y <= H - 150) { ctx.font = `500 28px ${FONT}`; ctx.fillStyle = look.muted; ctx.fillText(`…and ${f.moreGames} more before them`, M, y + 30); y += 46; }
  }
  return y;
}
