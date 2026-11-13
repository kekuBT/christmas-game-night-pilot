/**
 * Mchezo design tokens — "The Circle".
 *
 * Two layers:
 *  - `foundation`: type, spacing, radius, depth and motion. Identical in every theme,
 *    so interaction patterns never change between seasons.
 *  - `MchezoTheme`: colour + decoration only. Seasonal events (e.g. a Christmas
 *    Family Cup) are themes; championship length is NOT part of a theme — it lives in
 *    `ChampionshipConfig` (see ../types.ts) so the platform never hardcodes a duration.
 */

export const foundation = {
  font: {
    /** Short headlines, numbers, logo. Never body copy. */
    display: "'Unbounded', 'Inter Display', 'Inter', system-ui, sans-serif",
    /** Questions, body, all UI text. */
    body: "'Figtree', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  /** Minimum sizes enforced by components: nothing meaningful renders below 13px on phones / 18px on TV. */
  size: {
    phoneMin: 13,
    tvMin: 18,
  },
  radius: { sm: 12, md: 16, lg: 20, xl: 24, pill: 999 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 },
  /** Keycap depth (px) — the tactile "press" travel. */
  depth: { key: 6, slab: 7, small: 4, tv: 9 },
  motion: {
    fast: 120,
    base: 280,
    slow: 450,
    spring: 'cubic-bezier(.3,1.35,.5,1)',
    out: 'cubic-bezier(.2,.9,.2,1)',
    /** Reduced-motion replacement: opacity-only crossfade. */
    fade: 160,
  },
  touchTarget: 44,
} as const;

export type Quad<T> = readonly [T, T, T, T];

export interface MchezoTheme {
  id: string;
  name: string;
  /**
   * Stage 11.1 (D-S111-01): whether the ground is dark or light. Written as `data-mz-tone` and `color-scheme`; the
   * few rules a light ground needs are scoped by it (styles/stage111.css), so a dark look matches none of them.
   */
  tone: 'dark' | 'light';
  color: {
    ground: string;
    surface1: string;
    surface2: string;
    line: string;
    text: string;
    textMuted: string;
    /** Text drawn on this look's accent / answer colours (brand, answers, success, highlight, danger). */
    onAccent: string;
    /**
     * Stage 11.1 (D-S111-03): text drawn on colours that never change with the look: the fixed player palette and the
     * game cover accents. They are light pastels in every look, so this is dark in every look.
     */
    onBright: string;
    brand: string;
    brandDeep: string;
    /** Answer A–D. Each answer also has a fixed shape, so colour is never the only cue. */
    answer: Quad<string>;
    answerDeep: Quad<string>;
    success: string;
    highlight: string;
    spotlight: string;
    /** Stage 8.2: error and refusal text (was used by CSS but never defined). At least 4.5:1 on the ground and both surfaces. */
    danger: string;
  };
  /** Decoration of the Circle ring. Seasonal skins can swap this without touching layout. */
  ring: { style: 'plain' | 'wreath'; colors: readonly string[] };
  /** Optional reaction-set override (ids must exist in REACTION_ICONS). */
  reactions?: readonly ReactionId[];
}

export type ReactionId = 'love' | 'bravo' | 'ha' | 'wow' | 'brr';

export const everyday: MchezoTheme = {
  id: 'everyday',
  name: 'Mchezo',
  tone: 'dark',
  color: {
    ground: '#16111D',
    surface1: '#211A2B',
    surface2: '#2D2539',
    line: '#7A6E8E',
    text: '#F7F1E8',
    textMuted: '#C7BED2',
    onAccent: '#16111D',
    onBright: '#16111D',
    brand: '#FF6B4A',
    brandDeep: '#B8432A',
    answer: ['#FF6B4A', '#FFC94A', '#3CCFB4', '#9AA5FF'],
    answerDeep: ['#B8432A', '#B88A1F', '#1E8F7B', '#5D67C2'],
    success: '#3CCFB4',
    highlight: '#FFC94A',
    spotlight: 'rgba(154,165,255,.18)',
    danger: '#FF8A7A',
  },
  ring: { style: 'plain', colors: ['#7A6E8E'] },
  reactions: ['love', 'bravo', 'ha', 'wow'],
};

/**
 * Stage 11.1: Warm Ivory (owner decision D-OWN-1113; docs/stage11/stage111.md §4). A light Christmas: ivory page,
 * cream cards, dark warm text, restrained cranberry, small gold and sage touches; green only as an accent. Each
 * accent is dark enough to be both text on cream and a fill under cream text (D-S111-02).
 */
export const christmasFamilyCup: MchezoTheme = {
  id: 'christmas',
  name: 'Christmas',
  tone: 'light',
  color: {
    ground: '#F7F1E6',
    surface1: '#FFFCF6',
    surface2: '#EFE6D6',
    line: '#8C7A66',
    text: '#2B211C',
    textMuted: '#66564A',
    onAccent: '#FFFDF8',
    onBright: '#16111D',
    brand: '#A3253A',
    brandDeep: '#6E1626',
    answer: ['#A3253A', '#8A5E12', '#2F6A4F', '#3B5A8A'],
    answerDeep: ['#6E1626', '#5E3F0A', '#1D4634', '#263C5E'],
    success: '#2F6A4F',
    highlight: '#8A5E12',
    spotlight: 'rgba(201,162,74,.18)',
    danger: '#B3261E',
  },
  ring: { style: 'wreath', colors: ['#A3253A', '#7FA88C', '#C9A24A'] },
  reactions: ['love', 'bravo', 'ha', 'brr'],
};

export const themes = { everyday, christmas: christmasFamilyCup } as const;

/** Build a new seasonal theme from a base, overriding only what changes. */
export function createTheme(
  base: MchezoTheme,
  override: Partial<Omit<MchezoTheme, 'color'>> & { color?: Partial<MchezoTheme['color']> },
): MchezoTheme {
  return { ...base, ...override, color: { ...base.color, ...(override.color ?? {}) } };
}

/** Fixed player palette — a player's colour stays the same in every season. Dark text on all. */
export const playerPalette = ['#FF8A6B', '#7FE0C8', '#FFD36B', '#B3BBFF', '#F7A8CB', '#E8E1D4', '#FFB27A', '#8FD8EE', '#C9F07A', '#F0B3FF'] as const;

/** Answer shapes (SVG path, 24×24): triangle, circle, square, diamond. */
export const ANSWER_SHAPES: Quad<string> = [
  'M12 3l10 18H2z',
  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
  'M3 3h18v18H3z',
  'M12 1l11 11-11 11L1 12z',
];

export const ANSWER_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** Emit CSS custom properties for a theme (applied by <MchezoProvider>). */
export function themeToCssVars(t: MchezoTheme): Record<string, string> {
  const c = t.color;
  const v: Record<string, string> = {
    '--mz-ground': c.ground,
    '--mz-surface-1': c.surface1,
    '--mz-surface-2': c.surface2,
    '--mz-line': c.line,
    '--mz-text': c.text,
    '--mz-text-muted': c.textMuted,
    '--mz-on-accent': c.onAccent,
    '--mz-on-bright': c.onBright,
    '--mz-brand': c.brand,
    '--mz-brand-deep': c.brandDeep,
    '--mz-success': c.success,
    '--mz-highlight': c.highlight,
    '--mz-spotlight': c.spotlight,
    '--mz-danger': c.danger,
    '--mz-font-display': foundation.font.display,
    '--mz-font-body': foundation.font.body,
    '--mz-depth-key': foundation.depth.key + 'px',
    '--mz-depth-slab': foundation.depth.slab + 'px',
    '--mz-ease-out': foundation.motion.out,
    '--mz-ease-spring': foundation.motion.spring,
  };
  c.answer.forEach((a, i) => { v[`--mz-answer-${i}`] = a; v[`--mz-answer-${i}-deep`] = c.answerDeep[i] ?? a; });
  return v;
}

/**
 * Stage 11.1 (D-S111-04): the text of tokens.css, for surfaces outside React. scripts/gen-tokens-css.mjs writes it,
 * and tests/stage111-warm-ivory.test.ts fails if the file on disk differs, so the copy can't drift from this source.
 */
export function tokensCss(): string {
  const block = (selector: string, t: MchezoTheme) =>
    `${selector} {\n${Object.entries(themeToCssVars(t)).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
  return [
    '/* GENERATED from apps/web/src/ui/mchezo/tokens/tokens.ts by scripts/gen-tokens-css.mjs — do not edit by hand.\n   For non-React surfaces. React apps get these via <MchezoProvider>. */\n',
    block(':root, [data-mz-theme="everyday"]', everyday),
    '\n',
    block('[data-mz-theme="christmas"]', christmasFamilyCup),
  ].join('');
}
