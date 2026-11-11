// Font-robust layout checks (R81-01, Stage 8.2): the app names Figtree and
// Inter but loads no web font, so phones render whatever they have. Drivers
// measure with the page's own font stack AND with each wide fallback that is
// installed here.

/**
 * Which of these font families are installed on this machine. A font is
 * installed when text set in it (with a generic fallback) measures differently
 * from the generic fallback alone, checked against two generics.
 * (document.fonts.check can't tell: it says true for any font not loaded as a web font.)
 */
export async function installedFonts(browser, families) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const found = await p.evaluate((fams) => {
    const c = document.createElement("canvas").getContext("2d");
    const w = (font) => { c.font = font; return c.measureText("mmmmmmmmmmlliWWWQQ1234567890 abc").width; };
    return fams.filter((f) => ["monospace", "serif"].some((g) => w(`32px "${f}", ${g}`) !== w(`32px ${g}`)));
  }, families);
  await ctx.close();
  return found;
}

/** The wide fallbacks the drivers try (DejaVu Sans is the widest common one). */
export const WIDE_FONTS = ["DejaVu Sans", "Liberation Sans", "FreeSans"];

/** Make every page of `ctx` render the app in `family` (null: the page's own font stack), from its first paint. */
export async function forceFont(ctx, family) {
  if (!family) return;
  await ctx.addInitScript((fam) => {
    const add = () => { const s = document.createElement("style"); s.textContent = `:root, :root * { --mz-font-body: "${fam}" !important; --mz-font-display: "${fam}" !important; }`; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add, { once: true });
  }, family);
}
