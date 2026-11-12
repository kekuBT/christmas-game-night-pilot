/**
 * Night Circle game covers (Stage 2, approved design: docs/ux-redesign/PROPOSAL.md §7).
 *
 * Procedural SVG, original by construction: every cover is the game's accent
 * gradient, a light dot pattern, one hero glyph built from the kit's answer
 * shapes and simple strokes, and the Circle's eight-seat ring in the corner.
 * No image files, no external assets, about 1 KB each. Pure: no React.
 *
 * The table holds only art (accent and glyph). Titles, player counts and
 * durations come from the game manifests (src/games/manifest.ts), never here.
 */

export type CoverAccent = "coral" | "sun" | "mint" | "iris" | "pink" | "lime";
export type CoverGlyph = "quiz" | "grid" | "math" | "year" | "target" | "globe" | "sprint" | "bubbles" | "quote" | "odd" | "act" | "ring" | "split" | "pulse" | "brush" | "jebena";

export const ACCENTS: Readonly<Record<CoverAccent, readonly [string, string]>> = {
  coral: ["#FF6B4A", "#B8432A"],
  sun: ["#FFC94A", "#B88A1F"],
  mint: ["#3CCFB4", "#1E8F7B"],
  iris: ["#9AA5FF", "#5D67C2"],
  pink: ["#FF7AC6", "#B54489"],
  lime: ["#B6F05A", "#6F9B2A"],
};

/** One row per game: its accent and its hero glyph. A twelfth game costs one row. */
export const COVERS: Readonly<Record<string, { accent: CoverAccent; glyph: CoverGlyph }>> = {
  "trivia": { accent: "iris", glyph: "quiz" },
  "word-connections": { accent: "mint", glyph: "grid" },
  "math-mayhem": { accent: "sun", glyph: "math" },
  "guess-the-year": { accent: "coral", glyph: "year" },
  "closest-wins": { accent: "pink", glyph: "target" },
  "geography": { accent: "lime", glyph: "globe" },
  "category-sprint": { accent: "coral", glyph: "sprint" },
  "caption-clash": { accent: "pink", glyph: "bubbles" },
  "who-said-that": { accent: "iris", glyph: "quote" },
  "impostor": { accent: "sun", glyph: "odd" },
  "charades": { accent: "lime", glyph: "act" },
  // Stage 5 (original glyphs below).
  "majority-rules": { accent: "sun", glyph: "split" },
  "pattern-pulse": { accent: "pink", glyph: "pulse" },
  "draw-guess": { accent: "coral", glyph: "brush" },
  // Stage 9.1: an original jebena (clay coffee pot) with its steam.
  "jebena-rush": { accent: "coral", glyph: "jebena" },
};

export function coverOf(gameId: string): { accent: CoverAccent; glyph: CoverGlyph } {
  return COVERS[gameId] ?? { accent: "coral", glyph: "ring" };
}

/** The accent's main colour (kickers, outlines). */
export function accentColor(gameId: string): string {
  return ACCENTS[coverOf(gameId).accent][0];
}

const INK = "#16111D";
const CREAM = "#F7F1E8";

/** The hero glyph, drawn in a 120×120 box. */
export function glyphSvg(kind: CoverGlyph): string {
  const ink = INK, cream = CREAM;
  switch (kind) {
    case "quiz": return `<polygon points="30,62 46,34 62,62" fill="${ink}"/><circle cx="76" cy="48" r="14" fill="${cream}"/><rect x="32" y="70" width="28" height="28" rx="4" fill="${cream}"/><rect x="66" y="70" width="22" height="22" rx="3" transform="rotate(45 77 81)" fill="${ink}"/>`;
    case "grid": { let s = ""; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s += `<rect x="${22 + c * 16}" y="${30 + r * 16}" width="13" height="13" rx="3" fill="${r === 1 ? cream : ink}" opacity="${r === 1 ? 1 : 0.82}"/>`; return s; }
    case "math": return `<rect x="26" y="52" width="40" height="10" rx="5" fill="${ink}"/><rect x="41" y="37" width="10" height="40" rx="5" fill="${ink}"/><g transform="rotate(45 80 70)"><rect x="62" y="65" width="36" height="10" rx="5" fill="${cream}"/><rect x="75" y="52" width="10" height="36" rx="5" fill="${cream}"/></g>`;
    case "year": return `<circle cx="60" cy="62" r="30" fill="none" stroke="${ink}" stroke-width="9"/><path d="M60 62 L60 42 M60 62 L74 70" stroke="${cream}" stroke-width="7" stroke-linecap="round"/><circle cx="60" cy="62" r="5" fill="${cream}"/>`;
    case "target": return `<circle cx="58" cy="64" r="32" fill="${ink}"/><circle cx="58" cy="64" r="21" fill="${cream}"/><circle cx="58" cy="64" r="10" fill="${ink}"/><circle cx="88" cy="36" r="7" fill="${cream}"/><path d="M83 41 L64 58" stroke="${cream}" stroke-width="5" stroke-linecap="round"/>`;
    case "globe": return `<circle cx="60" cy="62" r="32" fill="${ink}"/><ellipse cx="60" cy="62" rx="13" ry="32" fill="none" stroke="${cream}" stroke-width="4"/><path d="M28 62 H92 M33 46 H87 M33 78 H87" stroke="${cream}" stroke-width="4"/>`;
    case "sprint": return `<circle cx="70" cy="64" r="26" fill="${cream}"/><path d="M70 64 L70 48" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><rect x="64" y="30" width="12" height="8" rx="2" fill="${cream}"/><path d="M18 52 H36 M12 64 H34 M20 76 H38" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;
    case "bubbles": return `<rect x="20" y="32" width="54" height="36" rx="14" fill="${ink}"/><path d="M34 66 L30 80 L46 68 Z" fill="${ink}"/><rect x="50" y="58" width="50" height="32" rx="13" fill="${cream}"/><path d="M86 88 L92 100 L78 90 Z" fill="${cream}"/>`;
    case "quote": return `<path d="M26 74 Q26 44 50 38 L52 46 Q40 52 40 60 L50 60 L50 82 L26 82 Z" fill="${ink}"/><path d="M62 74 Q62 44 86 38 L88 46 Q76 52 76 60 L86 60 L86 82 L62 82 Z" fill="${cream}"/>`;
    case "odd": return `<circle cx="34" cy="48" r="11" fill="${ink}"/><circle cx="60" cy="40" r="11" fill="${ink}"/><circle cx="86" cy="48" r="11" fill="${ink}"/><circle cx="40" cy="76" r="11" fill="${ink}"/><polygon points="80,64 92,86 68,86" fill="${cream}"/>`;
    case "act": return `<circle cx="52" cy="42" r="11" fill="${ink}"/><path d="M52 54 L52 80 M52 62 L34 50 M52 62 L72 46 M52 80 L40 98 M52 80 L64 98" stroke="${ink}" stroke-width="7" stroke-linecap="round"/><path d="M80 30 q10 10 0 20 M90 24 q16 16 0 32" stroke="${cream}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    // Stage 5: two answer cards with their vote bars, and the room's "versus" dot.
    case "split": return `<rect x="18" y="30" width="38" height="52" rx="8" fill="${ink}"/><rect x="64" y="30" width="38" height="52" rx="8" fill="${cream}"/><circle cx="60" cy="56" r="11" fill="${cream}" stroke="${ink}" stroke-width="5"/><path d="M24 96 H50" stroke="${ink}" stroke-width="8" stroke-linecap="round"/><path d="M70 96 H84" stroke="${cream}" stroke-width="8" stroke-linecap="round"/>`;
    // Stage 5: a pulse line through a remembered sequence of shapes.
    // Stage 9.1: an original jebena: a round clay body with a cream band, a narrow neck,
    // a spout, a handle from neck to body, and two curls of steam rising from the spout.
    case "jebena": return `<ellipse cx="56" cy="104" rx="18" ry="4" fill="${ink}"/><circle cx="56" cy="78" r="25" fill="${ink}"/><path d="M48,56 L50,30 Q56,24 62,30 L64,56 Z" fill="${ink}"/><path d="M62,44 L84,30" stroke="${ink}" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M50,36 C30,34 24,60 36,72" stroke="${ink}" stroke-width="6" stroke-linecap="round" fill="none"/><path d="M36,80 Q56,94 76,80" stroke="${cream}" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="56" cy="70" r="4" fill="${cream}"/><path d="M90,24 C84,17 96,12 90,4" stroke="${cream}" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M101,30 C95,23 107,18 101,10" stroke="${cream}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
    case "pulse": return `<polyline points="12,66 32,66 40,46 50,86 60,38 70,74 78,66 108,66" fill="none" stroke="${ink}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="28" cy="34" r="8" fill="${cream}"/><rect x="52" y="90" width="14" height="14" rx="3" fill="${cream}"/><polygon points="90,26 100,42 80,42" fill="${cream}"/>`;
    // Stage 5: a pencil and the line it just drew.
    case "brush": return `<path d="M18 90 C32 62 44 98 58 72 S84 66 98 82" fill="none" stroke="${cream}" stroke-width="7" stroke-linecap="round"/><g transform="rotate(40 76 44)"><rect x="68" y="12" width="16" height="50" rx="3" fill="${ink}"/><polygon points="68,62 84,62 76,78" fill="${cream}"/></g>`;
    case "ring": { let s = ""; for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + k * Math.PI / 4; s += `<circle cx="${(60 + Math.cos(a) * 30).toFixed(2)}" cy="${(60 + Math.sin(a) * 30).toFixed(2)}" r="${k === 0 ? 9 : 6}" fill="${k === 0 ? CREAM : INK}"/>`; } return s; }
  }
}

/**
 * The full cover as an SVG string, `w`×`h`. `uid` keeps gradient ids unique
 * when several covers share a page. Decorative: the caller labels it.
 */
export function coverSvg(gameId: string, w: number, h: number, uid: string): string {
  const { accent, glyph } = coverOf(gameId);
  const [c, d] = ACCENTS[accent];
  const s = Math.min(w, h) / 120;
  const gid = `mzcov-${uid}`;
  const dots = Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 37) % w}" cy="${(i * 53) % h}" r="${(1.6 * s).toFixed(2)}" fill="${INK}" opacity=".12"/>`).join("");
  const ring = Array.from({ length: 8 }, (_, k) => {
    const a = -Math.PI / 2 + k * Math.PI / 4;
    return `<circle cx="${(w - 22 * s + Math.cos(a) * 9 * s).toFixed(2)}" cy="${(20 * s + Math.sin(a) * 9 * s).toFixed(2)}" r="${((k === 0 ? 2.6 : 1.7) * s).toFixed(2)}" fill="${k === 0 ? CREAM : INK}" opacity="${k === 0 ? 1 : 0.55}"/>`;
  }).join("");
  // Wide covers (Home's featured card) carry a title over their lower left,
  // so the glyph moves to the right; square covers keep it centred.
  const wide = w > h * 1.4;
  const gs = wide ? s * 0.85 : s;
  const gx = wide ? w - 120 * gs - 0.14 * w : (w - 120 * s) / 2;
  const gy = wide ? (h - 120 * gs) / 2 + 6 * s : (h - 120 * s) / 2;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${gid})"/>${dots}<g transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)}) scale(${gs.toFixed(4)})">${glyphSvg(glyph)}</g>${ring}</svg>`;
}

/** "about 10 min" — the manifest's design estimate of a session, never a deadline. */
export function sessionEstimate(minutes: number): string {
  return `about ${minutes} min`;
}

/** "6-min limit" — the server's actual game window (lifecycle policy). */
export function timeLimitLabel(gameWindowMs: number | undefined): string | null {
  if (!gameWindowMs) return null;
  const m = Math.round(gameWindowMs / 60_000);
  return m >= 1 ? `${m}-min limit` : `${Math.round(gameWindowMs / 1000)}-s limit`;
}
