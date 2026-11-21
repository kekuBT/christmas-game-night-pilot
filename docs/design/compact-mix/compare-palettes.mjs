// Handoff 7065498313 (D-UI-02): side-by-side sheets of the colour exploration. One sheet per look and width: the
// columns are the palettes (now, T1, T2), the rows are Home, the Lobby (top and next-game card) and the Jebena Rush
// results, all from capture-palettes.mjs (embedded as data URLs: a page set from a string can't load files).
//   node docs/design/compact-mix/compare-palettes.mjs <shotsDir> <outDir>
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join as joinPath, resolve } from "node:path";
import { launchChromium } from "../../../scripts/lib/driver-env.mjs";
import { PALETTES } from "./palettes.mjs";

const [shots, outDir] = process.argv.slice(2).map((p) => resolve(p));
if (!outDir) { console.error("usage: compare-palettes.mjs <shotsDir> <outDir>"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const ROWS = [["home", "Home"], ["lobby", "Lobby: top"], ["lobbycard", "Lobby: next game"], ["results", "Jebena Rush results"]];
const SHEETS = [[390, "everyday"], [390, "christmas"], [320, "everyday"], [320, "christmas"]];

const browser = await launchChromium();
try {
  for (const [w, look] of SHEETS) {
    const dark = look === "everyday";
    const img = (f) => { if (!existsSync(f)) throw new Error(`missing ${f}`); return `data:image/jpeg;base64,${readFileSync(f).toString("base64")}`; };
    const head = Object.values(PALETTES).map((p) => `<th>${p.label}</th>`).join("");
    const body = ROWS.map(([key, label]) => `<tr><th class="row">${label}</th>${Object.keys(PALETTES).map((p) => `<td><img src="${img(joinPath(shots, `${key}-${w}-${look}-${p}.jpg`))}"></td>`).join("")}</tr>`).join("");
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px 24px 24px;background:${dark ? "#0B0810" : "#E6DCCB"};color:${dark ? "#F7F1E8" : "#2B211C"};font:600 16px system-ui,sans-serif}
      h1{margin:0 0 4px;font-size:22px} p{margin:0 0 14px;font-weight:500;opacity:.85}
      table{border-spacing:20px 14px;margin:-14px -20px} th{text-align:left;font-weight:800;vertical-align:top}
      th.row{writing-mode:vertical-rl;transform:rotate(180deg);text-align:right;padding:0;font-size:15px}
      img{display:block;width:${w}px;border-radius:14px;box-shadow:0 0 0 1px ${dark ? "#3A3048" : "#B9A88F"}}</style>
      <h1>Colour exploration · ${look === "everyday" ? "Everyday" : "Christmas"} look · ${w} px</h1>
      <p>Same live room and layouts (the compact mix); only the palette differs. The app's defaults are unchanged.${dark ? "" : " T1 changes Everyday only, so its Christmas column is the reference again."}</p>
      <table><tr><th></th>${head}</tr>${body}</table>`;
    const page = await browser.newPage({ viewport: { width: 200 + 3 * (w + 40), height: 800 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: joinPath(outDir, `palettes-${w}-${look}.jpg`), type: "jpeg", quality: 82, fullPage: true });
    await page.close();
  }
  console.log(`wrote ${SHEETS.length} sheets to ${outDir}`);
} finally {
  await browser.close().catch(() => {});
}
