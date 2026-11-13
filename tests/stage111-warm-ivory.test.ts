// Stage 11.1 (docs/stage11/stage111.md §4, §6; D-S111-01..04): the Warm Ivory palette's contrast, Everyday unchanged,
// the fixed-colour foreground, the look's tone, and the generated tokens.css kept in step with tokens.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { everyday, playerPalette, themes, themeToCssVars, tokensCss, type MchezoTheme } from "../apps/web/src/ui/mchezo/tokens/tokens.js";
import { ACCENTS } from "../apps/web/src/ui/mchezo/lib/covers.js";

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [16, 8, 0].map((s) => ((n >> s) & 255) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
/** color-mix(in srgb, a p%, b): the per-channel blend the light look uses for game-accent kickers. */
const mix = (a: string, p: number, b: string) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * p + parseInt(b.slice(i, i + 2), 16) * (1 - p)).toString(16).padStart(2, "0")).join("");

const ivory = themes.christmas;
const c = ivory.color;
const SURFACES = ["ground", "surface1", "surface2"] as const;

describe("Warm Ivory: the palette roles (spec §4)", () => {
  it("is a light look: ivory page, cream cards, dark warm text; green is never the page or a card", () => {
    expect(ivory.tone).toBe("light");
    for (const s of SURFACES) expect(lum(c[s]), s).toBeGreaterThan(0.6);
    expect(lum(c.text)).toBeLessThan(0.05);
    // "green dominant" would mean G well above R; ivory and cream are warm (R >= G >= B).
    for (const s of SURFACES) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(c[s].slice(i, i + 2), 16)); expect(r! >= g! && g! >= b!, s).toBe(true); }
  });
  it("text, muted text, success, highlight, danger and brand read on the page and both cards (4.5:1)", () => {
    const low: string[] = [];
    for (const fg of ["text", "textMuted", "success", "highlight", "danger", "brand"] as const) for (const bg of SURFACES) {
      const r = ratio(c[fg], c[bg]); if (r < 4.5) low.push(`${fg}/${bg} ${r.toFixed(2)}`);
    }
    expect(low).toEqual([]);
  });
  it("each accent is also a fill: cream (onAccent) on every answer colour, brand, highlight, success and danger (4.5:1) — D-S111-02", () => {
    const fills = [...c.answer, c.brand, c.highlight, c.success, c.danger];
    expect(fills.map((f) => [f, ratio(c.onAccent, f) >= 4.5])).toEqual(fills.map((f) => [f, true]));
  });
  it("lines, the focus ring, the primary border and each answer slab stand out from the page and cards (3:1)", () => {
    const low: string[] = [];
    for (const fg of ["line", "highlight", "brand"] as const) for (const bg of SURFACES) { const r = ratio(c[fg], c[bg]); if (r < 3) low.push(`${fg}/${bg} ${r.toFixed(2)}`); }
    for (const [i, a] of c.answer.entries()) if (ratio(a, c.ground) < 3) low.push(`answer${i}/ground`);
    expect(low).toEqual([]);
  });
  it("answers stay four distinct colours, each with a darker edge", () => {
    expect(new Set(c.answer).size).toBe(4);
    for (const [i, a] of c.answer.entries()) expect(lum(c.answerDeep[i]!), `answerDeep${i}`).toBeLessThan(lum(a));
  });
  it("the wreath keeps its style, in cranberry, sage and gold", () => {
    expect(ivory.ring).toEqual({ style: "wreath", colors: ["#A3253A", "#7FA88C", "#C9A24A"] });
  });
});

describe("onBright: text on colours that never change with the look (D-S111-03)", () => {
  it("is dark in every look and reads on every fixed player colour and game cover accent (4.5:1)", () => {
    for (const t of [everyday, ivory] as MchezoTheme[]) {
      expect(t.color.onBright).toBe("#16111D");
      const fixed = [...playerPalette, ...Object.values(ACCENTS).map(([main]) => main)];
      expect(fixed.filter((f) => ratio(t.color.onBright, f) < 4.5)).toEqual([]);
    }
  });
  it("a light look's game-accent kicker (35% accent into the text colour) reads on its card (4.5:1)", () => {
    for (const [name, [main]] of Object.entries(ACCENTS)) {
      const k = mix(main, 0.35, c.text);
      expect([name, ratio(k, c.surface1) >= 4.5, ratio(k, c.surface2) >= 4.5]).toEqual([name, true, true]);
    }
  });
});

describe("Everyday is unchanged (spec §1, D-S111-05)", () => {
  it("keeps every colour it had at d4dc408, and is a dark look", () => {
    expect(everyday.tone).toBe("dark");
    expect(everyday.color).toEqual({
      ground: "#16111D", surface1: "#211A2B", surface2: "#2D2539", line: "#7A6E8E", text: "#F7F1E8", textMuted: "#C7BED2",
      onAccent: "#16111D", onBright: "#16111D", brand: "#FF6B4A", brandDeep: "#B8432A",
      answer: ["#FF6B4A", "#FFC94A", "#3CCFB4", "#9AA5FF"], answerDeep: ["#B8432A", "#B88A1F", "#1E8F7B", "#5D67C2"],
      success: "#3CCFB4", highlight: "#FFC94A", spotlight: "rgba(154,165,255,.18)", danger: "#FF8A7A",
    });
    expect(everyday.ring).toEqual({ style: "plain", colors: ["#7A6E8E"] });
    // Its onBright is its onAccent, so moving player and cover text to onBright changes nothing on Everyday.
    expect(everyday.color.onBright).toBe(everyday.color.onAccent);
  });
  it("its CSS variables are exactly the old ones (tokens.css at d4dc408) plus --mz-on-bright", () => {
    const { ["--mz-on-bright"]: added, ...rest } = themeToCssVars(everyday);
    expect(added).toBe("#16111D");
    expect(rest).toEqual({
      "--mz-ground": "#16111D", "--mz-surface-1": "#211A2B", "--mz-surface-2": "#2D2539", "--mz-line": "#7A6E8E", "--mz-text": "#F7F1E8",
      "--mz-text-muted": "#C7BED2", "--mz-on-accent": "#16111D", "--mz-brand": "#FF6B4A", "--mz-brand-deep": "#B8432A", "--mz-success": "#3CCFB4",
      "--mz-highlight": "#FFC94A", "--mz-spotlight": "rgba(154,165,255,.18)", "--mz-danger": "#FF8A7A",
      "--mz-font-display": "'Unbounded', 'Inter Display', 'Inter', system-ui, sans-serif",
      "--mz-font-body": "'Figtree', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      "--mz-depth-key": "6px", "--mz-depth-slab": "7px", "--mz-ease-out": "cubic-bezier(.2,.9,.2,1)", "--mz-ease-spring": "cubic-bezier(.3,1.35,.5,1)",
      "--mz-answer-0": "#FF6B4A", "--mz-answer-0-deep": "#B8432A", "--mz-answer-1": "#FFC94A", "--mz-answer-1-deep": "#B88A1F",
      "--mz-answer-2": "#3CCFB4", "--mz-answer-2-deep": "#1E8F7B", "--mz-answer-3": "#9AA5FF", "--mz-answer-3-deep": "#5D67C2",
    });
  });
});

describe("tokens.css is generated from tokens.ts (D-S111-04)", () => {
  it("the file on disk is exactly what scripts/gen-tokens-css.mjs writes (npm run gen:tokens)", () => {
    const onDisk = readFileSync(new URL("../apps/web/src/ui/mchezo/tokens/tokens.css", import.meta.url), "utf8");
    expect(onDisk).toBe(tokensCss());
  });
  it("carries both looks, the new foreground, and Warm Ivory's ground", () => {
    const css = tokensCss();
    expect(css).toContain('[data-mz-theme="christmas"] {\n  --mz-ground: #F7F1E6;');
    expect(css.match(/--mz-on-bright: #16111D;/g)).toHaveLength(2);
  });
});
