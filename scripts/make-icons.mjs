// Stage 8.3 (docs/stage8/stage83.md §3.1): the install icons, drawn from the
// app's own logo, CircleMark (ui/mchezo/components/primitives.tsx): eight
// seats on a circle of radius 14 in a 40-unit box, the top "you" seat larger
// (r 5) in the brand colour, the others (r 3) in the text colour. Everyday
// palette: the installed icon is the same for everyone, whatever the
// device's look (§6 choice 2).
//
//   node scripts/make-icons.mjs        (writes apps/web/public/…; commit the output)
//
// Rendered by Chromium (the browser the drivers use), so it needs no image
// library. Re-run it only when the mark or the palette changes.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChromium } from "./lib/driver-env.mjs";

const GROUND = "#16111D", BRAND = "#FF6B4A", TEXT = "#F7F1E8";
const OUT = join("apps", "web", "public");
mkdirSync(join(OUT, "icons"), { recursive: true });

/** The mark's dots, centred on (cx, cy), scaled so its outer edge (seat circle 14 + big dot 5 = 19 units) is `outer` px. */
function dots(cx, cy, outer) {
  const k = outer / 19;
  return Array.from({ length: 8 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 8;
    const x = (cx + Math.cos(a) * 14 * k).toFixed(3), y = (cy + Math.sin(a) * 14 * k).toFixed(3);
    return `<circle cx="${x}" cy="${y}" r="${((i === 0 ? 5 : 3) * k).toFixed(3)}" fill="${i === 0 ? BRAND : TEXT}"/>`;
  }).join("");
}

/**
 * kind:
 * - any: a rounded square (radius 22 %) on transparent corners; the mark's outer edge at 36 % of the size.
 * - maskable: full bleed; the mark inside the safe circle (radius 40 %), its outer edge at 33 %, so no mask can cut a seat.
 * - apple: full bleed and opaque (iOS rounds the corners itself); outer edge at 34 %.
 */
function svg(size, kind) {
  const c = size / 2;
  const outer = size * (kind === "any" ? 0.36 : kind === "maskable" ? 0.33 : 0.34);
  const bg = kind === "any"
    ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${GROUND}"/>`
    : `<rect width="${size}" height="${size}" fill="${GROUND}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${dots(c, c, outer)}</svg>`;
}

const PNGS = [
  { file: "icons/icon-192.png", size: 192, kind: "any" },
  { file: "icons/icon-512.png", size: 512, kind: "any" },
  { file: "icons/icon-maskable-192.png", size: 192, kind: "maskable" },
  { file: "icons/icon-maskable-512.png", size: 512, kind: "maskable" },
  { file: "icons/apple-touch-icon.png", size: 180, kind: "apple" },
];

// The favicon and the mark's source, as SVG (the favicon keeps its own dark tile, so it reads on light and dark tab strips).
writeFileSync(join(OUT, "favicon.svg"), svg(64, "any") + "\n");
writeFileSync(join(OUT, "icons", "mark.svg"), svg(512, "any") + "\n");

const browser = await launchChromium();
try {
  for (const p of PNGS) {
    const ctx = await browser.newContext({ viewport: { width: p.size, height: p.size }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg(p.size, p.kind)}</body></html>`);
    await page.screenshot({ path: join(OUT, p.file), omitBackground: p.kind === "any", clip: { x: 0, y: 0, width: p.size, height: p.size } });
    await ctx.close();
    console.log(`wrote ${join(OUT, p.file)} (${p.size}×${p.size}, ${p.kind})`);
  }
} finally {
  await browser.close();
}
console.log(`wrote ${join(OUT, "favicon.svg")} and ${join(OUT, "icons", "mark.svg")}`);
