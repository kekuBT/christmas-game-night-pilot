// Renders mockups.html to PNGs (one per section) for docs/ux-redesign.
// Usage: node docs/ux-redesign/mockups/render.mjs   (needs Playwright + a Chromium; set MCHEZO_CHROMIUM_PATH if needed)
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const exe = process.env.MCHEZO_CHROMIUM_PATH ? { executablePath: process.env.MCHEZO_CHROMIUM_PATH } : {};
const b = await chromium.launch(exe);
const p = await b.newPage({ viewport: { width: 2800, height: 1200 }, deviceScaleFactor: 2 });
await p.goto(pathToFileURL(join(here, "mockups.html")).href);
await p.evaluate(() => document.fonts.ready);
// a sheet of all eleven covers
await p.evaluate(() => {
  const ids = ["trivia", "word-connections", "math-mayhem", "guess-the-year", "closest-wins", "geography", "category-sprint", "caption-clash", "who-said-that", "impostor", "charades"];
  const s = document.createElement("section"); s.className = "frame"; s.id = "covers";
  s.innerHTML = `<p class="cap" style="max-width:900px"><b>Cover art system: all 11 games</b> One table drives every cover: an accent field, a hero glyph built from the kit’s answer shapes, a light dot pattern and the Circle’s seat ring. Inline SVG of about 1 KB each, original by construction.</p><div style="display:grid;grid-template-columns:repeat(4,200px);gap:18px">${ids.map((id) => `<div><div class="cover" style="width:200px;height:200px">${coverSvg(id, 200, 200, false)}</div><div class="t" style="font:700 14px var(--disp);margin-top:8px">${G[id][1]}</div><div class="m small">${G[id][0]} · ${G[id][2]}</div></div>`).join("")}</div>`;
  document.getElementById("board").prepend(s);
});
await p.waitForTimeout(300);
const ids = await p.$$eval("section.frame", (els) => els.map((e) => e.id));
for (const id of ids) {
  const el = await p.$(`#${id}`);
  await el.screenshot({ path: join(here, `${id}.png`), scale: id.startsWith("tv") ? "css" : "device" });
  console.log("rendered", id);
}
await b.close();
