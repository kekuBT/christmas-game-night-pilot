// Stage 5 (S5-F): the contrast check from check-contrast.mjs, shareable, so
// each new game's driver checks its own screens (WCAG 2.1 AA: 4.5:1 for
// normal text, 3:1 for large text; disabled controls are exempt). Chromium
// computed-style emulation, not a real-device measurement.

function luminance(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(fg, bg) {
  const l1 = luminance(...fg), l2 = luminance(...bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const parseRgb = (s) => {
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const c = s.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);
  return c ? [Math.round(Number(c[1]) * 255), Math.round(Number(c[2]) * 255), Math.round(Number(c[3]) * 255)] : null;
};

/** Every visible, enabled text element whose colour pair fails AA, as "fg on bg (ratio) e.g. text". */
export async function contrastFailures(page) {
  const rows = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (el.closest("svg")) continue; // drawings and icons, not text
      let bg = null, cur = el;
      while (cur && cur !== document.documentElement) {
        const c = getComputedStyle(cur).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") { bg = c; break; }
        cur = cur.parentElement;
      }
      if (!bg) bg = getComputedStyle(document.body).backgroundColor;
      const disabled = el.closest("button:disabled, input:disabled, select:disabled, textarea:disabled, [disabled]") !== null;
      out.push({ text: text.slice(0, 40), fg: cs.color, bg, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) || 400, disabled });
    }
    return out;
  });
  const fails = new Map();
  for (const r of rows) {
    if (r.disabled) continue;
    const fg = parseRgb(r.fg), bg = parseRgb(r.bg);
    if (!fg || !bg) continue;
    const need = r.size >= 24 || (r.size >= 18.66 && r.weight >= 700) ? 3 : 4.5;
    const v = ratio(fg, bg);
    if (v < need) fails.set(`${r.fg}|${r.bg}`, `${r.fg} on ${r.bg} (${v.toFixed(2)}:1, need ${need}) e.g. "${r.text}"`);
  }
  return [...fails.values()];
}
