// Handoff 7065498313 (D-UI-02), colour exploration: the existing palette as the reference and two restrained
// treatments, as token overrides for screenshots only. Nothing here changes the app's defaults
// (apps/web/src/ui/mchezo/tokens/tokens.ts stays as it is until the owner picks).
//   node docs/design/compact-mix/palettes.mjs [outDir]   prints the token contrast table (and writes contrast.json/.md)
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The app's current tokens (tokens.ts, everyday and christmasFamilyCup), copied; capture-palettes.mjs checks them live. */
export const CURRENT = {
  everyday: { ground: "#16111D", surface1: "#211A2B", surface2: "#2D2539", line: "#7A6E8E", text: "#F7F1E8", textMuted: "#C7BED2", onAccent: "#16111D", brand: "#FF6B4A", brandDeep: "#B8432A", success: "#3CCFB4", highlight: "#FFC94A", danger: "#FF8A7A" },
  christmas: { ground: "#F7F1E6", surface1: "#FFFCF6", surface2: "#EFE6D6", line: "#8C7A66", text: "#2B211C", textMuted: "#66564A", onAccent: "#FFFDF8", brand: "#A3253A", brandDeep: "#6E1626", success: "#2F6A4F", highlight: "#8A5E12", danger: "#B3261E" },
};

/**
 * The three palettes compared. Each treatment overrides only the tokens it names; the rest are the current ones.
 *   current  the app today (the reference).
 *   warm     T1, lighter and warmer Everyday surfaces: an espresso-brown ground and cards in place of the near-black
 *            plum, warmer text; the same coral, gold and teal. Christmas unchanged (it is already light and warm), so
 *            the two looks stay a dark one and a light one.
 *   accent   T2, a different accent balance in both looks. Everyday: gold leads (Start, Play again, kickers), coral
 *            becomes the highlight (focus ring, the winner's ring, your score). Christmas: evergreen leads, cranberry
 *            becomes the highlight; gold-brown steps back. Surfaces and text unchanged.
 */
export const PALETTES = {
  current: { label: "Now (reference)", everyday: {}, christmas: {} },
  warm: {
    label: "T1 · Warmer, lighter Everyday surfaces",
    everyday: { ground: "#2A211C", surface1: "#382C25", surface2: "#463830", line: "#A08C7C", text: "#FFF7EE", textMuted: "#E0D0C2", onAccent: "#1E1713", brand: "#FF7A57", brandDeep: "#B8492F", success: "#4FD6BA", highlight: "#FFCD57", danger: "#FF9C8C" },
    christmas: {},
  },
  accent: {
    label: "T2 · A different accent balance",
    everyday: { brand: "#FFC94A", brandDeep: "#B88A1F", highlight: "#FF7A5C" },
    christmas: { brand: "#1F5C45", brandDeep: "#123A2B", highlight: "#A3253A" },
  },
};

export const tokensFor = (palette, look) => ({ ...CURRENT[look], ...PALETTES[palette][look] });

/** CSS that applies a palette's overrides over the app's own (inline) theme variables. Screenshots only. */
export function overrideCss(palette) {
  const VAR = { ground: "--mz-ground", surface1: "--mz-surface-1", surface2: "--mz-surface-2", line: "--mz-line", text: "--mz-text", textMuted: "--mz-text-muted", onAccent: "--mz-on-accent", brand: "--mz-brand", brandDeep: "--mz-brand-deep", success: "--mz-success", highlight: "--mz-highlight", danger: "--mz-danger" };
  const LEGACY = { ground: "--bg", surface1: "--panel", surface2: "--panel2", highlight: "--gold", text: "--cream", brand: "--accent", textMuted: "--muted", success: "--green", line: "--line", onAccent: "--on-accent" };
  let css = "";
  for (const look of ["everyday", "christmas"]) {
    const o = PALETTES[palette][look];
    const decl = Object.entries(o).flatMap(([k, v]) => [[VAR[k], v], [LEGACY[k], v]]).filter(([n]) => n).map(([n, v]) => `${n}: ${v} !important;`).join(" ");
    if (decl) css += `[data-mz-theme="${look}"] { ${decl} }\n`;
  }
  return css;
}

// ---- WCAG 2.1 contrast ----
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = hex(h).map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a, b) => { const x = lum(a), y = lum(b); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; };

/** What each pair is for, and the WCAG 2.1 AA minimum it needs (1.4.3 text 4.5:1; 1.4.11 non-text 3:1). */
export const PAIRS = [
  { group: "Text", what: "Body text on the page", fg: "text", bg: "ground", min: 4.5 },
  { group: "Text", what: "Body text on a card", fg: "text", bg: "surface1", min: 4.5 },
  { group: "Text", what: "Body text on a chip or sheet row", fg: "text", bg: "surface2", min: 4.5 },
  { group: "Text", what: "Secondary text on the page", fg: "textMuted", bg: "ground", min: 4.5 },
  { group: "Text", what: "Secondary text on a card", fg: "textMuted", bg: "surface1", min: 4.5 },
  { group: "Text", what: "Secondary text on a chip", fg: "textMuted", bg: "surface2", min: 4.5 },
  { group: "Text", what: "Kicker (brand) text on the page", fg: "brand", bg: "ground", min: 4.5 },
  { group: "Text", what: "Kicker (brand) text on a card", fg: "brand", bg: "surface1", min: 4.5 },
  { group: "Focus", what: "Focus ring against the page", fg: "highlight", bg: "ground", min: 3 },
  { group: "Focus", what: "Focus ring against a card", fg: "highlight", bg: "surface1", min: 3 },
  { group: "Focus", what: "Focus ring against a chip", fg: "highlight", bg: "surface2", min: 3 },
  { group: "Controls", what: "Primary button against the page", fg: "brand", bg: "ground", min: 3 },
  { group: "Controls", what: "Label on the primary button", fg: "onAccent", bg: "brand", min: 4.5 },
  { group: "Controls", what: "Control outline (chips, secondary buttons) on a card", fg: "line", bg: "surface1", min: 3 },
  { group: "Controls", what: "Control outline on the page", fg: "line", bg: "ground", min: 3 },
  { group: "Readiness", what: "Ready check against the page", fg: "success", bg: "ground", min: 3 },
  { group: "Readiness", what: "Ready check against a card", fg: "success", bg: "surface1", min: 3 },
  { group: "Readiness", what: "Mark drawn on the ready check", fg: "onAccent", bg: "success", min: 3 },
  { group: "Errors", what: "Error text on the page", fg: "danger", bg: "ground", min: 4.5 },
  { group: "Errors", what: "Error text on a card", fg: "danger", bg: "surface1", min: 4.5 },
  { group: "Scores", what: "Score highlight text on a card (your points)", fg: "highlight", bg: "surface1", min: 4.5 },
  { group: "Scores", what: "Score highlight text on a chip (the result card's line)", fg: "highlight", bg: "surface2", min: 4.5 },
  { group: "Scores", what: "Winner's ring on the podium card", fg: "highlight", bg: "surface1", min: 3 },
];

/** Every palette × look × pair: the ratio and whether it meets its minimum. */
export function contrastTable() {
  const rows = [];
  for (const palette of Object.keys(PALETTES)) for (const look of ["everyday", "christmas"]) {
    const t = tokensFor(palette, look);
    for (const p of PAIRS) { const r = ratio(t[p.fg], t[p.bg]); rows.push({ palette, look, ...p, fgHex: t[p.fg], bgHex: t[p.bg], ratio: r, pass: r >= p.min }); }
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = contrastTable();
  const out = process.argv[2];
  let md = "| Pair (minimum) | " + Object.keys(PALETTES).flatMap((p) => ["everyday", "christmas"].map((l) => `${p} · ${l}`)).join(" | ") + " |\n";
  md += "|---|" + Object.keys(PALETTES).flatMap(() => ["---:", "---:"]).join("|") + "|\n";
  for (const p of PAIRS) {
    md += `| ${p.what} (${p.min}:1) | ` + Object.keys(PALETTES).flatMap((pal) => ["everyday", "christmas"].map((l) => { const r = rows.find((x) => x.palette === pal && x.look === l && x.what === p.what); return `${r.ratio.toFixed(2)}${r.pass ? "" : " ✗"}`; })).join(" | ") + " |\n";
  }
  const fails = rows.filter((r) => !r.pass);
  md += `\n${fails.length === 0 ? "Every pair meets its minimum in every palette." : `Below minimum (✗): ${fails.map((f) => `${f.palette} · ${f.look} · ${f.what} ${f.ratio}:1`).join("; ")}.`}\n`;
  console.log(md);
  if (out) { mkdirSync(out, { recursive: true }); writeFileSync(`${out}/contrast.json`, JSON.stringify(rows, null, 2)); writeFileSync(`${out}/contrast-tokens.md`, md); }
}
