// R81-01 focused reproduction: the solo shelf's narrow cards under different
// fonts. Run from the checkout, with a built web app served at <baseUrl>:
//   FONTS_DIR=<dir with fontsource-figtree-5.3.0/ and fontsource-roboto-5.3.0/
//   (from `npm pack @fontsource/figtree @fontsource/roboto`, unpacked)>
//   node docs/evidence/stage81-local/r81-01/fontprobe.mjs <baseUrl> <label>
import { readFileSync } from "node:fs";
import { join } from "node:path";
const { launchChromium } = await import(new URL("../../../../scripts/lib/driver-env.mjs", import.meta.url).href);

const BASE = process.argv[2];
const LABEL = process.argv[3] ?? "";
const FONTS_DIR = process.env.FONTS_DIR ?? "fonts";
const b64 = (p) => readFileSync(p).toString("base64");
const face = (family, file, weight) => `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${b64(file)}) format("woff2");font-weight:${weight};font-style:normal;}`;
const fig = (w) => join(FONTS_DIR, "fontsource-figtree-5.3.0/package/files", `figtree-latin-${w}-normal.woff2`);
const rob = (w) => join(FONTS_DIR, "fontsource-roboto-5.3.0/package/files", `roboto-latin-${w}-normal.woff2`);
const FACES = [400, 500, 600, 700, 800].map((w) => face("Figtree", fig(w), w)).join("") + [[400, 400], [500, 500], [700, 600], [700, 700], [700, 800]].map(([f, w]) => face("Roboto", rob(f), w)).join("");
const CASES = [
  { name: "as installed here (Inter)", family: null },
  { name: "Figtree (the intended body font)", family: "Figtree" },
  { name: "Roboto (Android's system font)", family: "Roboto" },
  { name: "Liberation Sans (Arial metrics)", family: "Liberation Sans" },
  { name: "FreeSans (Helvetica metrics, ~SF)", family: "FreeSans" },
  { name: "DejaVu Sans (wide Linux fallback)", family: "DejaVu Sans" },
];
const SIZES = [{ width: 320, height: 640 }, { width: 360, height: 640 }, { width: 390, height: 844 }];
const browser = await launchChromium();
const rows = [];
for (const c of CASES) {
  for (const vp of SIZES) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/solo`, { waitUntil: "domcontentloaded" });
    await p.getByTestId("solo-home").waitFor({ timeout: 15000 });
    if (c.family) await p.addStyleTag({ content: `${FACES} :root, :root * { --mz-font-body: "${c.family}" !important; --mz-font-display: "${c.family}" !important; }` });
    const m = await p.evaluate(async (fam) => {
      if (fam) await Promise.all(["400 14px", "500 14px", "700 14px", "800 22px"].map((f) => document.fonts.load(`${f} "${fam}"`).catch(() => [])));
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await Promise.race([Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1500))]);
      const cards = [...document.querySelectorAll(".mz-solo__card")].map((el) => el.getBoundingClientRect());
      const title2 = document.querySelectorAll(".mz-solo__title")[1]?.getBoundingClientRect();
      const start1 = document.querySelector('[data-testid="solo-start-math-mayhem"]')?.getBoundingClientRect();
      const used = getComputedStyle(document.querySelector(".mz-solo__desc")).fontFamily;
      return {
        rendered: fam ? document.fonts.check(`14px "${fam}"`) : null, family: used,
        heights: cards.map((r) => Math.round(r.height)), shelf: Math.round(document.querySelector(".mz-solo__list").getBoundingClientRect().height),
        title2InView: !!title2 && title2.bottom <= innerHeight, start1InView: !!start1 && start1.bottom <= innerHeight,
      };
    }, c.family);
    rows.push({ font: c.name, size: `${vp.width}×${vp.height}`, ...m });
    await ctx.close();
  }
}
await browser.close();
console.log(`## ${LABEL}`);
console.log("| font | size | cards (px) | tallest | list | start 1 on screen | game 2 title on screen | font available |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.font} | ${r.size} | ${r.heights.join(", ")} | ${Math.max(...r.heights)} | ${r.shelf} | ${r.start1InView ? "yes" : "no"} | ${r.title2InView ? "yes" : "no"} | ${r.rendered === null ? "n/a" : r.rendered ? "yes" : "NO"} |`);
